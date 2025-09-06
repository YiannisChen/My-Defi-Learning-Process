// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {IRubySwapRouter} from "../interfaces/IRubySwapRouter.sol";
import {IRubySwapFactory} from "../interfaces/IRubySwapFactory.sol";
import {IRubySwapPool} from "../interfaces/IRubySwapPool.sol";
import {IWETH9} from "../interfaces/IWETH9.sol";
import "../libraries/Path.sol";
import "../libraries/TickMath.sol";


/// @notice DAI-style permit interface with `allowed` flag
interface IERC20PermitAllowed {
    function permit(
        address holder,
        address spender,
        uint256 nonce,
        uint256 expiry,
        bool allowed,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;
}


contract RubySwapRouter is IRubySwapRouter, ReentrancyGuard, Pausable, AccessControl {
    using Path for bytes;
    using SafeERC20 for IERC20;
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    
    IRubySwapFactory public immutable factory;
    address public immutable WETH9;

    /// @notice Maximum allowed deadline delta to mitigate far-future MEV (e.g., 1 hour)
    uint256 public constant MAX_DEADLINE_WINDOW = 1 hours;

    struct SwapCallbackData {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address payer;
    }

    /// @notice Accepts ETH from WETH9 withdraws
    receive() external payable {}

    /// @notice Sets the factory and WETH9 addresses and assigns admin/pauser roles to the deployer
    /// @param _factory RubySwap factory address
    /// @param _WETH9 Wrapped ETH token address
    constructor(address _factory, address _WETH9) {
        factory = IRubySwapFactory(_factory);
        WETH9 = _WETH9;
        
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(PAUSER_ROLE, msg.sender);
    }

    function getPool(address tokenA, address tokenB, uint24 fee) private view returns (IRubySwapPool) {
        return IRubySwapPool(factory.getPool(tokenA, tokenB, fee));
    }

    /// @notice Swap callback invoked by pools to settle token transfers
    /// @dev Validates the caller pool and transfers owed tokens from payer or router
    /// @param amount0Delta Token0 delta signed amount requested by the pool
    /// @param amount1Delta Token1 delta signed amount requested by the pool
    /// @param _data ABI-encoded SwapCallbackData
    function rubySwapV3SwapCallback(
        int256 amount0Delta,
        int256 amount1Delta,
        bytes calldata _data
    ) external override {
        require(amount0Delta > 0 || amount1Delta > 0, "Invalid deltas");
        SwapCallbackData memory data = abi.decode(_data, (SwapCallbackData));

        require(
            msg.sender == address(getPool(data.tokenIn, data.tokenOut, data.fee)),
            "Invalid pool callback"
        );

        address token0 = data.tokenIn < data.tokenOut ? data.tokenIn : data.tokenOut;
        address token1 = data.tokenIn < data.tokenOut ? data.tokenOut : data.tokenIn;

        uint256 amountToPay;
        address tokenToPay;

        if (amount0Delta > 0) {
            amountToPay = uint256(amount0Delta);
            tokenToPay = token0;
        } else {
            amountToPay = uint256(amount1Delta);
            tokenToPay = token1;
        }

        if (data.payer == address(this)) {
            IERC20(tokenToPay).safeTransfer(msg.sender, amountToPay);
        } else {
            require(IERC20(tokenToPay).allowance(data.payer, address(this)) >= amountToPay, "RCB_INSUFFICIENT_ALLOWANCE");
            require(IERC20(tokenToPay).balanceOf(data.payer) >= amountToPay, "RCB_INSUFFICIENT_BALANCE");
            IERC20(tokenToPay).safeTransferFrom(data.payer, msg.sender, amountToPay);
        }
    }

    /// @dev Validates that a deadline is in the future and within a reasonable window
    function _validateDeadline(uint256 deadline) internal view {
        require(block.timestamp <= deadline, "Transaction too old");
        require(deadline - block.timestamp <= MAX_DEADLINE_WINDOW, "Deadline too far");
    }

    /// @dev Performs basic validation on an encoded multi-hop path
    function _validatePath(bytes memory path) internal pure {
        require(path.length > 0, "EMPTY_PATH");
        require(path.length >= 43, "PATH_TOO_SHORT");
        require(((path.length - 20) % 23) == 0, "PATH_BAD_LEN");
        (address tokenA,,) = Path.decodeFirstPool(path);
        require(tokenA != address(0), "PATH_ZERO_ADDR");
        uint256 lastAddrOffset = path.length - 20;
        address tokenZ = Path.toAddress(path, lastAddrOffset);
        require(tokenZ != address(0), "PATH_ZERO_ADDR");
    }

    /// @notice Executes a single-hop exact input swap with slippage protection
    /// @param params.tokenIn Input token address
    /// @param params.tokenOut Output token address
    /// @param params.fee Pool fee tier
    /// @param params.recipient Recipient of output tokens
    /// @param params.deadline Timestamp after which the tx is invalid
    /// @param params.amountIn Exact input amount
    /// @param params.amountOutMinimum Minimum acceptable output amount
    /// @param params.sqrtPriceLimitX96 Price limit; 0 uses MIN/MAX for direction
    /// @return amountOut Actual output token amount
    function exactInputSingle(ExactInputSingleParams calldata params) 
        external 
        payable 
        override 
        whenNotPaused
        nonReentrant
        returns (uint256 amountOut) 
    {
        _validateDeadline(params.deadline);
        require(params.amountIn > 0, "Zero input");
        require(params.amountOutMinimum > 0, "Zero slippage forbidden");
        require(params.tokenIn != address(0) && params.tokenOut != address(0), "ZERO_ADDR");
        
        IRubySwapPool pool = getPool(params.tokenIn, params.tokenOut, params.fee);
        require(address(pool) != address(0), "Pool does not exist");

        bool zeroForOne = params.tokenIn < params.tokenOut;

        int256 amount0;
        int256 amount1;
        uint160 safeLimit = params.sqrtPriceLimitX96 == 0
            ? (zeroForOne ? TickMath.MIN_SQRT_RATIO : TickMath.MAX_SQRT_RATIO)
            : params.sqrtPriceLimitX96;

        (amount0, amount1) = pool.swap(
            params.recipient,
            zeroForOne,
            int256(params.amountIn),
            safeLimit,
            abi.encode(SwapCallbackData({
                tokenIn: params.tokenIn,
                tokenOut: params.tokenOut,
                fee: params.fee,
                payer: params.recipient
            }))
        );

        amountOut = uint256(-(zeroForOne ? amount1 : amount0));
        require(amountOut >= params.amountOutMinimum, "Too little received");
    }

    /// @notice Executes a single-hop exact output swap with slippage protection
    /// @param params.tokenIn Input token address
    /// @param params.tokenOut Output token address
    /// @param params.fee Pool fee tier
    /// @param params.recipient Payer/recipient context
    /// @param params.deadline Timestamp after which the tx is invalid
    /// @param params.amountOut Exact output amount requested
    /// @param params.amountInMaximum Maximum acceptable input amount
    /// @param params.sqrtPriceLimitX96 Price limit; 0 uses MIN/MAX for direction
    /// @return amountIn Actual input token amount spent
    function exactOutputSingle(ExactOutputSingleParams calldata params)
        external
        payable
        override
        whenNotPaused
        nonReentrant
        returns (uint256 amountIn)
    {
        _validateDeadline(params.deadline);
        require(params.amountOut > 0, "Zero output");
        require(params.amountInMaximum > 0 && params.amountInMaximum < type(uint128).max, "Input limit too high");
        require(params.tokenIn != address(0) && params.tokenOut != address(0), "ZERO_ADDR");
        
        IRubySwapPool pool = getPool(params.tokenIn, params.tokenOut, params.fee);
        require(address(pool) != address(0), "Pool does not exist");

        bool zeroForOne = params.tokenIn < params.tokenOut;

        (int256 amount0, int256 amount1) = pool.swap(
            params.recipient,
            zeroForOne,
            -int256(params.amountOut),
            params.sqrtPriceLimitX96 == 0 ? 
                (zeroForOne ? TickMath.MIN_SQRT_RATIO : TickMath.MAX_SQRT_RATIO) : 
                params.sqrtPriceLimitX96,
            abi.encode(SwapCallbackData({
                tokenIn: params.tokenIn,
                tokenOut: params.tokenOut,
                fee: params.fee,
                payer: params.recipient
            }))
        );

        amountIn = uint256(zeroForOne ? amount0 : amount1);
        require(amountIn <= params.amountInMaximum, "Too much requested");
    }

    struct ExactInputState {
        bytes path;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
    }

    /// @notice Executes an exact input multi-hop swap based on a packed path
    /// @param params.path Encoded path of token/fee hops
    /// @param params.recipient Final recipient
    /// @param params.deadline Timestamp after which the tx is invalid
    /// @param params.amountIn Exact input amount
    /// @param params.amountOutMinimum Minimum acceptable total output amount
    /// @return amountOut Total output token amount
    function exactInput(ExactInputParams calldata params) 
        external 
        payable 
        override
        whenNotPaused
        nonReentrant
        returns (uint256 amountOut) 
    {
        _validateDeadline(params.deadline);
        require(params.amountIn > 0, "Zero input");
        require(params.amountOutMinimum > 0, "Zero slippage forbidden");
        _validatePath(params.path);
        
        address payer = msg.sender;
        
        ExactInputState memory state = ExactInputState({
            path: params.path,
            recipient: params.recipient,
            amountIn: params.amountIn,
            amountOutMinimum: params.amountOutMinimum
        });
        
        while (true) {
            bool hasMultiplePools = state.path.hasMultiplePools();
            
            (address tokenIn, address tokenOut, uint24 fee) = state.path.decodeFirstPool();
            require(tokenIn != address(0) && tokenOut != address(0), "PATH_ZERO_ADDR");
            
            uint256 hopMinOut = hasMultiplePools ? 0 : state.amountOutMinimum;

            uint256 currentAmountOut = _performSwap(
                tokenIn,
                tokenOut, 
                fee,
                hasMultiplePools ? address(this) : state.recipient,
                int256(state.amountIn),
                hopMinOut,
                payer
            );
            
            if (hasMultiplePools) {
                state.path = state.path.skipToken();
                state.amountIn = currentAmountOut;
                payer = address(this);
            } else {
                amountOut = currentAmountOut;
                break;
            }
        }
    }

    /// @dev Performs a single-hop swap, enforcing a minimum amount out
    function _performSwap(
        address tokenIn,
        address tokenOut,
        uint24 fee,
        address recipient,
        int256 amountSpecified,
        uint256 amountOutMinimum,
        address payer
    ) private returns (uint256 amountOut) {
        IRubySwapPool pool = getPool(tokenIn, tokenOut, fee);
        require(address(pool) != address(0), "Pool does not exist");
        
        bool zeroForOne = tokenIn < tokenOut;
        (int256 amount0, int256 amount1) = pool.swap(
            recipient,
            zeroForOne,
            amountSpecified,
            0,
            abi.encode(SwapCallbackData({
                tokenIn: tokenIn,
                tokenOut: tokenOut,
                fee: fee,
                payer: payer
            }))
        );
        
        amountOut = uint256(-(zeroForOne ? amount1 : amount0));
        require(amountOut >= amountOutMinimum, "Too little received");
    }

    /// @notice Executes an exact output multi-hop swap based on a packed path
    /// @param params.path Encoded path of token/fee hops (reversed order: last hop first)
    /// @param params.recipient Final recipient
    /// @param params.deadline Timestamp after which the tx is invalid
    /// @param params.amountOut Exact output amount
    /// @param params.amountInMaximum Maximum acceptable input amount
    /// @return amountIn Total input token amount
    function exactOutput(ExactOutputParams calldata params) 
        external 
        payable 
        override
        whenNotPaused
        nonReentrant
        returns (uint256 amountIn) 
    {
        _validateDeadline(params.deadline);
        require(params.amountOut > 0, "Zero output");
        require(params.amountInMaximum > 0 && params.amountInMaximum < type(uint128).max, "Input limit too high");
        _validatePath(params.path);
        
        amountIn = _exactOutputInternal(
            params.amountOut,
            params.recipient,
            0,
            params.path
        );
        
        require(amountIn <= params.amountInMaximum, "Too much requested");
    }

    /// @dev Recursive helper for exact output multi-hop swaps
    function _exactOutputInternal(
        uint256 amountOut,
        address recipient,
        uint256 sqrtPriceLimitX96,
        bytes memory path
    ) private returns (uint256 amountIn) {
        if (path.hasMultiplePools()) {
            bytes memory firstPool = path.getFirstPool();
            path = path.skipToken();
            
            uint256 amountInIntermediate = _exactOutputInternal(
                amountOut,
                address(this),
                0,
                path
            );
            
            (address tokenIn, address tokenOut, uint24 fee) = firstPool.decodeFirstPool();
            IRubySwapPool pool = getPool(tokenIn, tokenOut, fee);
            require(address(pool) != address(0), "Pool does not exist");
            
            bool zeroForOne = tokenIn < tokenOut;
            (int256 amount0, int256 amount1) = pool.swap(
                address(this),
                zeroForOne,
                -int256(amountInIntermediate),
                uint160(sqrtPriceLimitX96),
                abi.encode(SwapCallbackData({
                    tokenIn: tokenIn,
                    tokenOut: tokenOut,
                    fee: fee,
                    payer: msg.sender
                }))
            );
            
            amountIn = uint256(zeroForOne ? amount0 : amount1);
        } else {
            (address tokenIn, address tokenOut, uint24 fee) = path.decodeFirstPool();
            IRubySwapPool pool = getPool(tokenIn, tokenOut, fee);
            require(address(pool) != address(0), "Pool does not exist");
            
            bool zeroForOne = tokenIn < tokenOut;
            (int256 amount0, int256 amount1) = pool.swap(
                recipient,
                zeroForOne,
                -int256(amountOut),
                uint160(sqrtPriceLimitX96),
                abi.encode(SwapCallbackData({
                    tokenIn: tokenIn,
                    tokenOut: tokenOut,
                    fee: fee,
                    payer: msg.sender
                }))
            );
            
            amountIn = uint256(zeroForOne ? amount0 : amount1);
        }
    }

    /// @notice Batches multiple router operations via delegatecall
    /// @param data Calldata array of encoded function calls
    /// @return results The return data for each delegatecall
    function multicall(bytes[] calldata data) external payable override nonReentrant returns (bytes[] memory results) {
        results = new bytes[](data.length);
        for (uint256 i = 0; i < data.length; i++) {
            (bool success, bytes memory result) = address(this).delegatecall(data[i]);
            if (!success) {
                if (result.length < 68) revert();
                assembly {
                    result := add(result, 0x04)
                }
                revert(abi.decode(result, (string)));
            }
            results[i] = result;
        }
    }

    /// @notice EIP-2612 self permit for standard tokens
    function selfPermit(
        address token,
        uint256 value,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external payable override {
        require(deadline >= block.timestamp, "Permit expired");
        IERC20Permit(token).permit(msg.sender, address(this), value, deadline, v, r, s);
    }

    /// @notice EIP-2612 self permit if current allowance is below value
    function selfPermitIfNecessary(
        address token,
        uint256 value,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external payable override {
        if (IERC20(token).allowance(msg.sender, address(this)) < value) {
            require(deadline >= block.timestamp, "Permit expired");
            IERC20Permit(token).permit(msg.sender, address(this), value, deadline, v, r, s);
        }
    }

    /// @notice DAI-style permit (allowed flag) for tokens supporting it
    function selfPermitAllowed(
        address token,
        uint256 nonce,
        uint256 expiry,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external payable override {
        IERC20PermitAllowed(token).permit(msg.sender, address(this), nonce, expiry, true, v, r, s);
    }

    /// @notice DAI-style permit if allowance is not already max
    function selfPermitAllowedIfNecessary(
        address token,
        uint256 nonce,
        uint256 expiry,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external payable override {
        if (IERC20(token).allowance(msg.sender, address(this)) == type(uint256).max) {
            return;
        }
        IERC20PermitAllowed(token).permit(msg.sender, address(this), nonce, expiry, true, v, r, s);
    }

    /// @notice Emergency pause function for pausers
    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    /// @notice Unpause function for admins
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    /// @notice Unwraps the contract's WETH9 balance and sends it to recipient as ETH
    /// @param amountMinimum The minimum amount of WETH9 to unwrap
    /// @param recipient The address receiving ETH
    function unwrapWETH9(uint256 amountMinimum, address recipient) external payable nonReentrant {
        uint256 balanceWETH9 = IWETH9(WETH9).balanceOf(address(this));
        require(balanceWETH9 >= amountMinimum, "Insufficient WETH9");
        
        if (balanceWETH9 > 0) {
            IWETH9(WETH9).withdraw(balanceWETH9);
            (bool success, ) = recipient.call{value: balanceWETH9}("");
            require(success, "ETH transfer failed");
        }
    }

    /// @notice Refunds any ETH balance held by this contract to msg.sender
    function refundETH() external payable nonReentrant {
        if (address(this).balance > 0) {
            (bool success, ) = msg.sender.call{value: address(this).balance}("");
            require(success, "ETH refund failed");
        }
    }

    /// @notice Transfers the full amount of a token held by this contract to recipient
    /// @param token The token to transfer
    /// @param amountMinimum The minimum amount of token required for a transfer
    /// @param recipient The destination address of the token
    function sweepToken(
        address token,
        uint256 amountMinimum,
        address recipient
    ) external payable nonReentrant {
        uint256 balanceToken = IERC20(token).balanceOf(address(this));
        require(balanceToken >= amountMinimum, "Insufficient token");
        
        if (balanceToken > 0) {
            IERC20(token).safeTransfer(recipient, balanceToken);
        }
    }
} 