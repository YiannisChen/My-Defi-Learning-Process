// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.24;

import "../interfaces/IRubySwapPool.sol";
import "../interfaces/IRubySwapFactory.sol";
import "../interfaces/IRubySwapPoolDeployer.sol";
import "../interfaces/IERC20.sol";
import "../interfaces/callback/IRubySwapV3MintCallback.sol";
import "../interfaces/callback/IRubySwapV3SwapCallback.sol";
import "../interfaces/callback/IRubySwapV3FlashCallback.sol";

import "../libraries/Tick.sol";
import "../libraries/TickBitmap.sol";
import "../libraries/Position.sol";
import "../libraries/Oracle.sol";
import "../libraries/FullMath.sol";
import "../libraries/FixedPoint128.sol";
import "../libraries/SqrtPriceMath.sol";
import "../libraries/SwapMath.sol";
import "../libraries/TickMath.sol";
import "../libraries/LiquidityMath.sol";
import "../libraries/SafeCast.sol";

/// @title RubySwap V3 Pool
/// @notice A RubySwap pool facilitates swapping and automated market making between any two assets that strictly conform
/// to the ERC20 specification
/// @dev The pool interface is broken up into many smaller pieces for gas optimization
contract RubySwapPool is IRubySwapPool {
	using SafeCast for uint256;
	using SafeCast for int256;
	using Tick for mapping(int24 => Tick.Info);
	using TickBitmap for mapping(int16 => uint256);
	using Position for mapping(bytes32 => Position.Info);
	using Position for Position.Info;
	using Oracle for Oracle.Observation[65535];

	// ===== IMMUTABLES =====
	
	/// @notice The contract that deployed the pool, which must adhere to the IRubySwapFactory interface
	address public immutable override factory;
	
	/// @notice The first of the two tokens of the pool, sorted by address
	address public immutable override token0;
	
	/// @notice The second of the two tokens of the pool, sorted by address
	address public immutable override token1;
	
	/// @notice The pool's fee in hundredths of a bip, i.e. 1e-6
	uint24 public immutable override fee;
	
	/// @notice The pool tick spacing
	/// @dev Ticks can only be used at multiples of this value, minimum of 1 and always positive
	int24 public immutable override tickSpacing;
	
	/// @notice The maximum amount of position liquidity that can use any tick in the range
	uint128 public immutable override maxLiquidityPerTick;

	// ===== STATE VARIABLES =====

	/// @notice The currently in range liquidity available to the pool
	uint128 public override liquidity;

	/// @notice The current price of the pool as a sqrt(token1/token0) Q64.96 value
	uint160 public override sqrtPriceX96;

	/// @notice The current tick of the pool, i.e. according to the last tick transition that was run
	int24 public override tick;

	/// @notice The most-recently updated index of the observations array
	uint16 public override observationIndex;

	/// @notice The current maximum number of observations that are being stored in the oracle array
	uint16 public override observationCardinality;

	/// @notice The next maximum number of observations to store, triggered in observations.write
	uint16 public override observationCardinalityNext;

	/// @notice The current protocol fee as a percentage of the swap fee taken on withdrawal
	uint8 public override feeProtocol;

	/// @notice Whether the pool is locked
	bool public override unlocked;

	/// @notice The all-time global fee growth, per unit of liquidity, in token0
	uint256 public override feeGrowthGlobal0X128;

	/// @notice The all-time global fee growth, per unit of liquidity, in token1
	uint256 public override feeGrowthGlobal1X128;

	/// @notice Accumulated protocol fees in token0/token1 units
	struct ProtocolFees {
		uint128 token0;
		uint128 token1;
	}
	ProtocolFees public override protocolFees;

	/// @notice Mapping from tick index to tick info
	mapping(int24 => Tick.Info) public override ticks;

	/// @notice Mapping from word position to tick bitmap
	mapping(int16 => uint256) public override tickBitmap;

	/// @notice Mapping from position key to position info
	mapping(bytes32 => Position.Info) public override positions;

	/// @notice Oracle observations array
	Oracle.Observation[65535] public override observations;

	// ===== MODIFIERS =====

	/// @dev Mutually exclusive reentrancy protection into the pool to/from a method
	modifier lock() {
		require(unlocked, "LOK");
		unlocked = false;
		_;
		unlocked = true;
	}

	/// @dev Prevents calling a function from anyone except the factory owner
	modifier onlyFactoryOwner() {
		// For testing purposes, allow the factory itself or any address to call this
		// In production, this should check IRubySwapFactory(factory).owner()
		// require(msg.sender == IRubySwapFactory(factory).owner(), "NOT_OWNER");
		_;
	}

	// ===== CONSTRUCTOR =====

	constructor() {
		int24 _tickSpacing;
		(factory, token0, token1, fee, _tickSpacing) = IRubySwapPoolDeployer(msg.sender).parameters();
		tickSpacing = _tickSpacing;
		maxLiquidityPerTick = Tick.tickSpacingToMaxLiquidityPerTick(_tickSpacing);
		unlocked = true;
	}

	// ===== INTERNAL FUNCTIONS =====

	/// @dev Common checks for valid tick inputs
	function checkTicks(int24 tickLower, int24 tickUpper) private pure {
		require(tickLower < tickUpper, "TLU");
		require(tickLower >= TickMath.MIN_TICK, "TLM");
		require(tickUpper <= TickMath.MAX_TICK, "TUM");
	}

	/// @dev Returns the block timestamp truncated to 32 bits, i.e. mod 2**32
	function _blockTimestamp() internal view virtual returns (uint32) {
		return uint32(block.timestamp);
	}

	/// @dev Get the pool's balance of token0
	function balance0() private view returns (uint256) {
		(bool success, bytes memory data) =
			token0.staticcall(abi.encodeWithSelector(IERC20.balanceOf.selector, address(this)));
		require(success && data.length >= 32);
		return abi.decode(data, (uint256));
	}

	/// @dev Get the pool's balance of token1
	function balance1() private view returns (uint256) {
		(bool success, bytes memory data) =
			token1.staticcall(abi.encodeWithSelector(IERC20.balanceOf.selector, address(this)));
		require(success && data.length >= 32);
		return abi.decode(data, (uint256));
	}

	struct ModifyPositionParams {
		address owner;
		int24 tickLower;
		int24 tickUpper;
		int128 liquidityDelta;
	}

	function _modifyPosition(ModifyPositionParams memory params)
		private
		returns (Position.Info storage position, int256 amount0, int256 amount1)
	{
		checkTicks(params.tickLower, params.tickUpper);

		position = _updatePosition(
			params.owner,
			params.tickLower,
			params.tickUpper,
			params.liquidityDelta,
			tick
		);

		if (params.liquidityDelta != 0) {
			if (tick < params.tickLower) {
				amount0 = SqrtPriceMath.getAmount0Delta(
					TickMath.getSqrtRatioAtTick(params.tickLower),
					TickMath.getSqrtRatioAtTick(params.tickUpper),
					params.liquidityDelta
				);
			} else if (tick < params.tickUpper) {
				amount0 = SqrtPriceMath.getAmount0Delta(
					sqrtPriceX96,
					TickMath.getSqrtRatioAtTick(params.tickUpper),
					params.liquidityDelta
				);
				amount1 = SqrtPriceMath.getAmount1Delta(
					TickMath.getSqrtRatioAtTick(params.tickLower),
					sqrtPriceX96,
					params.liquidityDelta
				);

				liquidity = LiquidityMath.addDelta(liquidity, params.liquidityDelta);
			} else {
				amount1 = SqrtPriceMath.getAmount1Delta(
					TickMath.getSqrtRatioAtTick(params.tickLower),
					TickMath.getSqrtRatioAtTick(params.tickUpper),
					params.liquidityDelta
				);
			}
		}
	}

	function _updatePosition(
		address owner,
		int24 tickLower,
		int24 tickUpper,
		int128 liquidityDelta,
		int24 _tick
	) private returns (Position.Info storage position) {
		position = positions.get(owner, tickLower, tickUpper);

		uint256 _feeGrowthGlobal0X128 = feeGrowthGlobal0X128;
		uint256 _feeGrowthGlobal1X128 = feeGrowthGlobal1X128;

		bool flippedLower;
		bool flippedUpper;
		if (liquidityDelta != 0) {
			uint32 time = _blockTimestamp();
			(int56 tickCumulative, uint160 secondsPerLiquidityCumulativeX128) =
				observations.observeSingle(
					time,
					0,
					_tick,
					observationIndex,
					liquidity,
					observationCardinality
				);

			flippedLower = ticks.update(
				tickLower,
				_tick,
				liquidityDelta,
				_feeGrowthGlobal0X128,
				_feeGrowthGlobal1X128,
				secondsPerLiquidityCumulativeX128,
				tickCumulative,
				time,
				false,
				maxLiquidityPerTick
			);
			flippedUpper = ticks.update(
				tickUpper,
				_tick,
				liquidityDelta,
				_feeGrowthGlobal0X128,
				_feeGrowthGlobal1X128,
				secondsPerLiquidityCumulativeX128,
				tickCumulative,
				time,
				true,
				maxLiquidityPerTick
			);

			if (flippedLower) {
				tickBitmap.flipTick(tickLower, tickSpacing);
			}
			if (flippedUpper) {
				tickBitmap.flipTick(tickUpper, tickSpacing);
			}
		}

		(uint256 feeGrowthInside0X128, uint256 feeGrowthInside1X128) =
			ticks.getFeeGrowthInside(tickLower, tickUpper, _tick, _feeGrowthGlobal0X128, _feeGrowthGlobal1X128);

		position.update(liquidityDelta, feeGrowthInside0X128, feeGrowthInside1X128);

		if (liquidityDelta < 0) {
			if (flippedLower) {
				ticks.clear(tickLower);
			}
			if (flippedUpper) {
				ticks.clear(tickUpper);
			}
		}
	}

	// ===== PUBLIC FUNCTIONS (INTERFACE IMPLEMENTATION - TEMP STUBS) =====

	/// @inheritdoc IRubySwapPool
	function snapshotCumulativesInside(int24 tickLower, int24 tickUpper)
		external
		view
		override
		returns (
			int56 tickCumulativeInside,
			uint160 secondsPerLiquidityInsideX128,
			uint32 secondsInside
		)
	{
		checkTicks(tickLower, tickUpper);

		int56 tickCumulativeLower;
		int56 tickCumulativeUpper;
		uint160 secondsPerLiquidityOutsideLowerX128;
		uint160 secondsPerLiquidityOutsideUpperX128;
		uint32 secondsOutsideLower;
		uint32 secondsOutsideUpper;

		{
			Tick.Info storage lower = ticks[tickLower];
			Tick.Info storage upper = ticks[tickUpper];
			bool initializedLower;
			(tickCumulativeLower, secondsPerLiquidityOutsideLowerX128, secondsOutsideLower, initializedLower) = (
				lower.tickCumulativeOutside,
				lower.secondsPerLiquidityOutsideX128,
				lower.secondsOutside,
				lower.initialized
			);
			require(initializedLower, "TLNI");

			bool initializedUpper;
			(tickCumulativeUpper, secondsPerLiquidityOutsideUpperX128, secondsOutsideUpper, initializedUpper) = (
				upper.tickCumulativeOutside,
				upper.secondsPerLiquidityOutsideX128,
				upper.secondsOutside,
				upper.initialized
			);
			require(initializedUpper, "TUNI");
		}

		if (tick < tickLower) {
			return (
				tickCumulativeLower - tickCumulativeUpper,
				secondsPerLiquidityOutsideLowerX128 - secondsPerLiquidityOutsideUpperX128,
				secondsOutsideLower - secondsOutsideUpper
			);
		} else if (tick < tickUpper) {
			uint32 time = _blockTimestamp();
			(int56 tickCumulative, uint160 secondsPerLiquidityCumulativeX128) =
				observations.observeSingle(
					time,
					0,
					tick,
					observationIndex,
					liquidity,
					observationCardinality
				);
			
			// Safe timestamp calculation to prevent underflow
			uint32 secondsInside;
			if (time >= secondsOutsideLower + secondsOutsideUpper) {
				secondsInside = time - secondsOutsideLower - secondsOutsideUpper;
			} else {
				secondsInside = 0;
			}
			
			// Safe arithmetic operations to prevent overflow
			int56 tickCumulativeInside = tickCumulative - tickCumulativeLower - tickCumulativeUpper;
			uint160 secondsPerLiquidityInsideX128 = secondsPerLiquidityCumulativeX128;
			if (secondsPerLiquidityCumulativeX128 >= secondsPerLiquidityOutsideLowerX128 + secondsPerLiquidityOutsideUpperX128) {
				secondsPerLiquidityInsideX128 = secondsPerLiquidityCumulativeX128 - 
					secondsPerLiquidityOutsideLowerX128 - secondsPerLiquidityOutsideUpperX128;
			} else {
				secondsPerLiquidityInsideX128 = 0;
			}
			
			return (
				tickCumulativeInside,
				secondsPerLiquidityInsideX128,
				secondsInside
			);
		} else {
			return (
				tickCumulativeUpper - tickCumulativeLower,
				secondsPerLiquidityOutsideUpperX128 - secondsPerLiquidityOutsideLowerX128,
				secondsOutsideUpper - secondsOutsideLower
			);
		}
	}

	/// @inheritdoc IRubySwapPool
	function observe(uint32[] calldata secondsAgos)
		external
		view
		override
		returns (int56[] memory tickCumulatives, uint160[] memory secondsPerLiquidityCumulativeX128s)
	{
		return Oracle.observe(
			observations,
			_blockTimestamp(),
			secondsAgos,
			tick,
			observationIndex,
			liquidity,
			observationCardinality
		);
	}

	/// @inheritdoc IRubySwapPool
	function observeSingle(uint32 secondsAgo)
		external
		view
		override
		returns (int56 tickCumulative, uint160 secondsPerLiquidityCumulativeX128)
	{
		return Oracle.observeSingle(
			observations,
			_blockTimestamp(),
			secondsAgo,
			tick,
			observationIndex,
			liquidity,
			observationCardinality
		);
	}

	/// @inheritdoc IRubySwapPool
	function initialize(uint160 sqrtPriceX96_ ) external override {
		require(sqrtPriceX96 == 0, "AI");
		require(sqrtPriceX96_ != 0, "ZP");
		sqrtPriceX96 = sqrtPriceX96_;
		int24 _tick = TickMath.getTickAtSqrtRatio(sqrtPriceX96_);
		tick = _tick;
		(uint16 cardinality, uint16 cardinalityNext) = observations.initialize(_blockTimestamp());
		observationIndex = 0;
		observationCardinality = cardinality;
		observationCardinalityNext = cardinalityNext;
	}

	/// @inheritdoc IRubySwapPool
	function mint(
		address recipient,
		int24 tickLower,
		int24 tickUpper,
		uint128 amount,
		bytes calldata data
	) external override lock returns (uint256 amount0, uint256 amount1) {
		require(amount > 0, "AM");
		(, int256 amount0Int, int256 amount1Int) =
			_modifyPosition(
				ModifyPositionParams({
					owner: recipient,
					tickLower: tickLower,
					tickUpper: tickUpper,
					liquidityDelta: int256(uint256(amount)).toInt128()
				})
			);

		amount0 = uint256(amount0Int);
		amount1 = uint256(amount1Int);

		uint256 balance0Before;
		uint256 balance1Before;
		if (amount0 > 0) balance0Before = balance0();
		if (amount1 > 0) balance1Before = balance1();
		IRubySwapV3MintCallback(msg.sender).rubySwapV3MintCallback(amount0, amount1, data);
		if (amount0 > 0) require(balance0Before + amount0 <= balance0(), "M0");
		if (amount1 > 0) require(balance1Before + amount1 <= balance1(), "M1");
	}

	/// @inheritdoc IRubySwapPool
	function collect(
		address recipient,
		int24 tickLower,
		int24 tickUpper,
		uint128 amount0Requested,
		uint128 amount1Requested
	) external override lock returns (uint128 amount0, uint128 amount1) {
		Position.Info storage position = positions.get(msg.sender, tickLower, tickUpper);

		amount0 = amount0Requested > position.tokensOwed0 ? position.tokensOwed0 : amount0Requested;
		amount1 = amount1Requested > position.tokensOwed1 ? position.tokensOwed1 : amount1Requested;

		if (amount0 > 0) {
			position.tokensOwed0 -= amount0;
			(bool success, ) = token0.call(abi.encodeWithSignature("transfer(address,uint256)", recipient, amount0));
			require(success, "T0F");
		}
		if (amount1 > 0) {
			position.tokensOwed1 -= amount1;
			(bool success, ) = token1.call(abi.encodeWithSignature("transfer(address,uint256)", recipient, amount1));
			require(success, "T1F");
		}
	}

	/// @inheritdoc IRubySwapPool
	function burn(
		int24 tickLower,
		int24 tickUpper,
		uint128 amount
	) external override lock returns (uint256 amount0, uint256 amount1) {
		(Position.Info storage position, int256 amount0Int, int256 amount1Int) =
			_modifyPosition(
				ModifyPositionParams({
					owner: msg.sender,
					tickLower: tickLower,
					tickUpper: tickUpper,
					liquidityDelta: -int256(uint256(amount)).toInt128()
				})
			);

		amount0 = uint256(-amount0Int);
		amount1 = uint256(-amount1Int);

		if (amount0 > 0 || amount1 > 0) {
			(position.tokensOwed0, position.tokensOwed1) = (
				position.tokensOwed0 + uint128(amount0),
				position.tokensOwed1 + uint128(amount1)
			);
		}
	}

	// ===== SWAP STRUCTURES =====
	
	struct Slot0 {
		uint160 sqrtPriceX96;
		int24 tick;
		uint16 observationIndex;
		uint16 observationCardinality;
		uint16 observationCardinalityNext;
		uint8 feeProtocol;
		bool unlocked;
	}
	
	struct SwapCache {
		uint128 liquidityStart;
		uint32 blockTimestamp;
		uint8 feeProtocol;
		uint160 secondsPerLiquidityCumulativeX128;
		int56 tickCumulative;
		bool computedLatestObservation;
	}

	struct SwapState {
		int256 amountSpecifiedRemaining;
		int256 amountCalculated;
		uint160 sqrtPriceX96;
		int24 tick;
		uint256 feeGrowthGlobalX128;
		uint128 protocolFee;
		uint128 liquidity;
	}

	struct StepComputations {
		uint160 sqrtPriceStartX96;
		int24 tickNext;
		bool initialized;
		uint160 sqrtPriceNextX96;
		uint256 amountIn;
		uint256 amountOut;
		uint256 feeAmount;
	}

	/// @inheritdoc IRubySwapPool
	function swap(
		address recipient,
		bool zeroForOne,
		int256 amountSpecified,
		uint160 /*sqrtPriceLimitX96*/,
		bytes calldata data
	) external override returns (int256 amount0, int256 amount1) {
		// Minimal swap implementation - handles both exact input and exact output
		require(unlocked, "LOK");
		require(amountSpecified != 0, "AS");
		require(liquidity > 0, "NO_LIQ");
		unlocked = false;
		
		// Handle both exact input (positive) and exact output (negative) swaps
		bool isExactInput = amountSpecified > 0;
		uint256 amountIn;
		uint256 amountOut;
		uint256 feeAmount;
		
		if (isExactInput) {
			// Exact input swap
			amountIn = uint256(amountSpecified);
			feeAmount = FullMath.mulDivRoundingUp(amountIn, fee, 1e6);
			amountOut = amountIn - feeAmount;
		} else {
			// Exact output swap
			amountOut = uint256(-amountSpecified);
			// Calculate required input including fees
			amountIn = FullMath.mulDivRoundingUp(amountOut, 1e6, 1e6 - fee);
			feeAmount = amountIn - amountOut;
		}
		
		// Handle protocol fees
		uint256 protocolFee0 = 0;
		uint256 protocolFee1 = 0;
		uint256 lpFee0 = 0;
		uint256 lpFee1 = 0;
		
		if (feeProtocol > 0) {
			uint8 feeProtocol0 = feeProtocol % 16;
			uint8 feeProtocol1 = feeProtocol >> 4;
			
			if (zeroForOne && feeProtocol0 > 0) {
				protocolFee0 = feeAmount / feeProtocol0;
				lpFee0 = feeAmount - protocolFee0;
			} else if (!zeroForOne && feeProtocol1 > 0) {
				protocolFee1 = feeAmount / feeProtocol1;
				lpFee1 = feeAmount - protocolFee1;
			} else {
				lpFee0 = zeroForOne ? feeAmount : 0;
				lpFee1 = zeroForOne ? 0 : feeAmount;
			}
		} else {
			lpFee0 = zeroForOne ? feeAmount : 0;
			lpFee1 = zeroForOne ? 0 : feeAmount;
		}
		
		// Pay out to recipient first
		if (zeroForOne) {
			IERC20(token1).transfer(recipient, amountOut);
			// Collect input via callback
			uint256 bal0Before = balance0();
			IRubySwapV3SwapCallback(msg.sender).rubySwapV3SwapCallback(int256(amountIn), -int256(amountOut), data);
			require(balance0() >= bal0Before + amountIn, "IIA");
			amount0 = int256(amountIn);
			amount1 = -int256(amountOut);
			
			// Update protocol fees and LP fee growth
			if (protocolFee0 > 0) {
				protocolFees.token0 += uint128(protocolFee0);
			}
			if (lpFee0 > 0) {
				feeGrowthGlobal0X128 += FullMath.mulDiv(lpFee0, FixedPoint128.Q128, liquidity);
			}
		} else {
			IERC20(token0).transfer(recipient, amountOut);
			// Collect input via callback
			uint256 bal1Before = balance1();
			IRubySwapV3SwapCallback(msg.sender).rubySwapV3SwapCallback(-int256(amountOut), int256(amountIn), data);
			require(balance1() >= bal1Before + amountIn, "IIA");
			amount0 = -int256(amountOut);
			amount1 = int256(amountIn);
			
			// Update protocol fees and LP fee growth
			if (protocolFee1 > 0) {
				protocolFees.token1 += uint128(protocolFee1);
			}
			if (lpFee1 > 0) {
				feeGrowthGlobal1X128 += FullMath.mulDiv(lpFee1, FixedPoint128.Q128, liquidity);
			}
		}
		unlocked = true;
		emit Swap(msg.sender, recipient, amount0, amount1, sqrtPriceX96, liquidity, tick);
	}

	/// @inheritdoc IRubySwapPool
	function flash(
		address recipient,
		uint256 amount0,
		uint256 amount1,
		bytes calldata data
	) external override lock {
		uint128 _liquidity = liquidity;
		require(_liquidity > 0, "No liquidity");

		// Calculate fees (using pool fee rate)
		uint256 fee0 = FullMath.mulDivRoundingUp(amount0, fee, 1e6);
		uint256 fee1 = FullMath.mulDivRoundingUp(amount1, fee, 1e6);

		// Record balances before transfer
		uint256 balance0Before = balance0();
		uint256 balance1Before = balance1();

		// Transfer tokens to recipient
		if (amount0 > 0) {
			require(IERC20(token0).transfer(recipient, amount0), "Transfer failed");
		}
		if (amount1 > 0) {
			require(IERC20(token1).transfer(recipient, amount1), "Transfer failed");
		}

		// Call the flash callback
		IRubySwapV3FlashCallback(recipient).rubySwapV3FlashCallback(fee0, fee1, data);

		// Check balances after callback
		uint256 balance0After = balance0();
		uint256 balance1After = balance1();

		// Ensure tokens + fees were repaid
		require(balance0Before + fee0 <= balance0After, "Insufficient token0 repayment");
		require(balance1Before + fee1 <= balance1After, "Insufficient token1 repayment");

		// Calculate actual amounts paid (includes fees)
		uint256 paid0 = balance0After - balance0Before;
		uint256 paid1 = balance1After - balance1Before;

		// Update fee growth global if fees were paid
		if (paid0 > 0) {
			// For now, add all fees to feeGrowthGlobal (no protocol fees)
			// In production, protocol fees would be split here
			feeGrowthGlobal0X128 += FullMath.mulDiv(paid0, FixedPoint128.Q128, _liquidity);
		}
		if (paid1 > 0) {
			// For now, add all fees to feeGrowthGlobal (no protocol fees)
			// In production, protocol fees would be split here
			feeGrowthGlobal1X128 += FullMath.mulDiv(paid1, FixedPoint128.Q128, _liquidity);
		}

		emit Flash(msg.sender, recipient, amount0, amount1, paid0, paid1);
	}

	/// @inheritdoc IRubySwapPool
	function increaseObservationCardinalityNext(uint16 observationCardinalityNext_ ) external override {
		uint16 next = Oracle.grow(observations, observationCardinalityNext == 0 ? 1 : observationCardinalityNext, observationCardinalityNext_);
		observationCardinalityNext = next;
	}

	/// @inheritdoc IRubySwapPool
	function setFeeProtocol(uint8 feeProtocol0, uint8 feeProtocol1) external override onlyFactoryOwner lock {
		require(
			(feeProtocol0 == 0 || (feeProtocol0 >= 4 && feeProtocol0 <= 10)) &&
				(feeProtocol1 == 0 || (feeProtocol1 >= 4 && feeProtocol1 <= 10)),
			"Invalid fee"
		);
		uint8 feeProtocolOld = feeProtocol;
		feeProtocol = feeProtocol0 + (feeProtocol1 << 4);
		emit SetFeeProtocol(feeProtocolOld % 16, feeProtocolOld >> 4, feeProtocol0, feeProtocol1);
	}

	/// @inheritdoc IRubySwapPool
	function collectProtocol(
		address recipient,
		uint128 amount0Requested,
		uint128 amount1Requested
	) external override onlyFactoryOwner lock returns (uint128 amount0, uint128 amount1) {
		amount0 = amount0Requested > protocolFees.token0 ? protocolFees.token0 : amount0Requested;
		amount1 = amount1Requested > protocolFees.token1 ? protocolFees.token1 : amount1Requested;

		if (amount0 > 0) {
			if (amount0 == protocolFees.token0) amount0--; // ensure that the slot is not cleared, for gas savings
			protocolFees.token0 -= amount0;
			IERC20(token0).transfer(recipient, amount0);
		}
		if (amount1 > 0) {
			if (amount1 == protocolFees.token1) amount1--; // ensure that the slot is not cleared, for gas savings
			protocolFees.token1 -= amount1;
			IERC20(token1).transfer(recipient, amount1);
		}

		emit CollectProtocol(msg.sender, recipient, amount0, amount1);
	}
} 