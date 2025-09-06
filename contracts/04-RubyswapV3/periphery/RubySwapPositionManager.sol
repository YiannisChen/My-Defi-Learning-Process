// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

import "../interfaces/IRubySwapPositionManager.sol";
import "../interfaces/IRubySwapPool.sol";
import "../interfaces/IRubySwapFactory.sol";
import "../interfaces/callback/IRubySwapV3MintCallback.sol";
import "../interfaces/IWETH9.sol";
import "../libraries/FullMath.sol";
import "../libraries/FixedPoint128.sol";
import "../libraries/TickMath.sol";
import "../libraries/LiquidityMath.sol";
import "../libraries/LiquidityAmounts.sol";

/// @notice Minimal interface for EIP-2612 permit
interface IERC20PermitMinimal {
    function permit(
        address owner,
        address spender,
        uint256 value,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;
}

/// @notice DAI-style permit with "allowed" flag (permitAllowed)
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

contract RubySwapPositionManager is
    ERC721,
    ERC721Enumerable,
    IRubySwapPositionManager,
    ReentrancyGuard,
    Pausable,
    AccessControl,
    IRubySwapV3MintCallback {
    using SafeERC20 for IERC20;

    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    
    /// @dev IID constants for ERC165
    bytes4 private constant _INTERFACE_ID_ERC721 = 0x80ac58cd;
    bytes4 private constant _INTERFACE_ID_ERC721_METADATA = 0x5b5e139f;
    bytes4 private constant _INTERFACE_ID_ERC721_ENUMERABLE = 0x780e9d63;

    /// @notice Represents the position of a liquidity provider
    struct Position {
        uint96 nonce;
        address operator;
        address token0;
        address token1;
        uint24 fee;
        int24 tickLower;
        int24 tickUpper;
        uint128 liquidity;
        uint256 feeGrowthInside0LastX128;
        uint256 feeGrowthInside1LastX128;
        uint128 tokensOwed0;
        uint128 tokensOwed1;
    }

    /// @dev Parameters for adding liquidity
    struct AddLiquidityParams {
        address token0;
        address token1;
        uint24 fee;
        address recipient;
        int24 tickLower;
        int24 tickUpper;
        uint256 amount0Desired;
        uint256 amount1Desired;
        uint256 amount0Min;
        uint256 amount1Min;
    }

    /// @notice The token ID position data
    mapping(uint256 => Position) private _positions;
    
    /// @notice The ID of the next token that will be minted. Skips 0
    uint256 private _nextId = 1;
    
    /// @notice The RubySwap factory
    address public immutable factory;
    
    /// @notice The WETH9 token contract
    address public immutable WETH9;

    // ===== EIP-712 Permit (ERC721) =====
    bytes32 private constant _PERMIT_TYPEHASH = keccak256("Permit(address spender,uint256 tokenId,uint256 nonce,uint256 deadline)");
    bytes32 private constant _EIP712_DOMAIN_TYPEHASH = keccak256(
        "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
    );
    bytes32 private immutable _NAME_HASH;
    bytes32 private constant _VERSION_HASH = keccak256("1");
    bytes32 private immutable _CACHED_DOMAIN_SEPARATOR;
    uint256 private immutable _CACHED_CHAIN_ID;
    address private immutable _CACHED_THIS;

    modifier isAuthorizedForToken(uint256 tokenId) {
        require(_isApprovedOrOwner(msg.sender, tokenId), "Not approved");
        _;
    }

    modifier checkDeadline(uint256 deadline) {
        require(block.timestamp <= deadline, "Transaction too old");
        _;
    }

    // OpenZeppelin v4.x compatibility - override required functions
    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 tokenId,
        uint256 batchSize
    ) internal override(ERC721, ERC721Enumerable) {
        super._beforeTokenTransfer(from, to, tokenId, batchSize);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, ERC721Enumerable, AccessControl, IERC165)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    /// @dev Helper function for v4.x compatibility
    function _isApprovedOrOwner(address spender, uint256 tokenId) internal view override returns (bool) {
        return super._isApprovedOrOwner(spender, tokenId);
    }

    constructor(
        address _factory,
        address _WETH9,
        string memory _name,
        string memory _symbol
    ) ERC721(_name, _symbol) {
        factory = _factory;
        WETH9 = _WETH9;
        
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(PAUSER_ROLE, msg.sender);

        _NAME_HASH = keccak256(bytes(_name));
        _CACHED_CHAIN_ID = block.chainid;
        _CACHED_THIS = address(this);
        _CACHED_DOMAIN_SEPARATOR = _buildDomainSeparator();
    }

    function _buildDomainSeparator() private view returns (bytes32) {
        return keccak256(
            abi.encode(
                _EIP712_DOMAIN_TYPEHASH,
                _NAME_HASH,
                _VERSION_HASH,
                block.chainid,
                address(this)
            )
        );
    }

    function _domainSeparator() internal view returns (bytes32) {
        if (address(this) == _CACHED_THIS && block.chainid == _CACHED_CHAIN_ID) {
            return _CACHED_DOMAIN_SEPARATOR;
        }
        return _buildDomainSeparator();
    }

    /// @inheritdoc IRubySwapPositionManager
    function positions(uint256 tokenId)
        external
        view
        override
        returns (
            uint96 nonce,
            address operator,
            address token0,
            address token1,
            uint24 fee,
            int24 tickLower,
            int24 tickUpper,
            uint128 liquidity,
            uint256 feeGrowthInside0LastX128,
            uint256 feeGrowthInside1LastX128,
            uint128 tokensOwed0,
            uint128 tokensOwed1
        )
    {
        Position memory position = _positions[tokenId];
        require(position.token0 != address(0), "Invalid token");
        return (
            position.nonce,
            position.operator,
            position.token0,
            position.token1,
            position.fee,
            position.tickLower,
            position.tickUpper,
            position.liquidity,
            position.feeGrowthInside0LastX128,
            position.feeGrowthInside1LastX128,
            position.tokensOwed0,
            position.tokensOwed1
        );
    }

    /// @notice Exposes the per-token nonce for ERC721 permit
    function getNonce(uint256 tokenId) external view returns (uint256) {
        return _positions[tokenId].nonce;
    }

    /// @notice Returns the pool for the given token pair and fee
    function getPool(address token0, address token1, uint24 fee) private view returns (IRubySwapPool) {
        return IRubySwapPool(IRubySwapFactory(factory).getPool(token0, token1, fee));
    }

    /// @notice Internal function to add liquidity
    function addLiquidity(AddLiquidityParams memory params)
        internal
        returns (
            uint128 liquidity,
            uint256 amount0,
            uint256 amount1,
            IRubySwapPool pool
        )
    {
        pool = getPool(params.token0, params.token1, params.fee);

        // Use proper V3 liquidity calculation
        uint160 sqrtPriceX96 = pool.sqrtPriceX96();
        uint160 sqrtPriceAX96 = TickMath.getSqrtRatioAtTick(params.tickLower);
        uint160 sqrtPriceBX96 = TickMath.getSqrtRatioAtTick(params.tickUpper);
        
        liquidity = LiquidityAmounts.getLiquidityForAmounts(
            sqrtPriceX96,
            sqrtPriceAX96,
            sqrtPriceBX96,
            params.amount0Desired,
            params.amount1Desired
        );

        (amount0, amount1) = pool.mint(
            params.recipient,
            params.tickLower,
            params.tickUpper,
            liquidity,
            abi.encode(MintCallbackData({
                token0: params.token0,
                token1: params.token1,
                fee: params.fee,
                payer: msg.sender
            }))
        );

        require(amount0 >= params.amount0Min && amount1 >= params.amount1Min, "Price slippage check");
    }

    struct MintCallbackData {
        address token0;
        address token1;
        uint24 fee;
        address payer;
    }

    /// @inheritdoc IRubySwapV3MintCallback
    function rubySwapV3MintCallback(
        uint256 amount0Owed,
        uint256 amount1Owed,
        bytes calldata data
    ) external override {
        MintCallbackData memory decoded = abi.decode(data, (MintCallbackData));
        
        // Verify callback is from a legitimate pool
        require(msg.sender == address(getPool(decoded.token0, decoded.token1, decoded.fee)), "Invalid callback");

        // Transfer directly from payer to pool to satisfy allowance model
        if (amount0Owed > 0) {
            require(IERC20(decoded.token0).allowance(decoded.payer, address(this)) >= amount0Owed, "PM_ALLOW_0");
            IERC20(decoded.token0).safeTransferFrom(decoded.payer, msg.sender, amount0Owed);
        }
        if (amount1Owed > 0) {
            require(IERC20(decoded.token1).allowance(decoded.payer, address(this)) >= amount1Owed, "PM_ALLOW_1");
            IERC20(decoded.token1).safeTransferFrom(decoded.payer, msg.sender, amount1Owed);
        }
    }

    /// @notice Internal payment function
    function pay(
        address token,
        address payer,
        address recipient,
        uint256 value
    ) internal {
        if (payer == address(this)) {
            IERC20(token).safeTransfer(recipient, value);
        } else {
            // Transfer from payer to this contract, then to recipient
            IERC20(token).safeTransferFrom(payer, address(this), value);
            IERC20(token).safeTransfer(recipient, value);
        }
    }

    /// @inheritdoc IRubySwapPositionManager
    function mint(MintParams calldata params)
        external
        payable
        override
        nonReentrant
        whenNotPaused
        checkDeadline(params.deadline)
        returns (
            uint256 tokenId,
            uint128 liquidity,
            uint256 amount0,
            uint256 amount1
        )
    {
        IRubySwapPool pool;
        (liquidity, amount0, amount1, pool) = addLiquidity(
            AddLiquidityParams({
                token0: params.token0,
                token1: params.token1,
                fee: params.fee,
                recipient: address(this),
                tickLower: params.tickLower,
                tickUpper: params.tickUpper,
                amount0Desired: params.amount0Desired,
                amount1Desired: params.amount1Desired,
                amount0Min: params.amount0Min,
                amount1Min: params.amount1Min
            })
        );

        _mint(params.recipient, (tokenId = _nextId++));

        bytes32 positionKey = keccak256(abi.encodePacked(address(this), params.tickLower, params.tickUpper));
        (, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, , ) = pool.positions(positionKey);

        // Save position info
        _positions[tokenId] = Position({
            nonce: 0,
            operator: address(0),
            token0: params.token0,
            token1: params.token1,
            fee: params.fee,
            tickLower: params.tickLower,
            tickUpper: params.tickUpper,
            liquidity: liquidity,
            feeGrowthInside0LastX128: feeGrowthInside0LastX128,
            feeGrowthInside1LastX128: feeGrowthInside1LastX128,
            tokensOwed0: 0,
            tokensOwed1: 0
        });

        emit IncreaseLiquidity(tokenId, liquidity, amount0, amount1);
    }

    /// @inheritdoc IRubySwapPositionManager
    function increaseLiquidity(IncreaseLiquidityParams calldata params)
        external
        payable
        override
        nonReentrant
        whenNotPaused
        checkDeadline(params.deadline)
        isAuthorizedForToken(params.tokenId)
        returns (
            uint128 liquidity,
            uint256 amount0,
            uint256 amount1
        )
    {
        Position storage position = _positions[params.tokenId];

        IRubySwapPool pool;
        (liquidity, amount0, amount1, pool) = addLiquidity(
            AddLiquidityParams({
                token0: position.token0,
                token1: position.token1,
                fee: position.fee,
                recipient: address(this),
                tickLower: position.tickLower,
                tickUpper: position.tickUpper,
                amount0Desired: params.amount0Desired,
                amount1Desired: params.amount1Desired,
                amount0Min: params.amount0Min,
                amount1Min: params.amount1Min
            })
        );

        bytes32 positionKey = keccak256(abi.encodePacked(address(this), position.tickLower, position.tickUpper));

        // Update fees
        (, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, , ) = pool.positions(positionKey);
        position.tokensOwed0 += uint128(
            FullMath.mulDiv(
                feeGrowthInside0LastX128 - position.feeGrowthInside0LastX128,
                position.liquidity,
                FixedPoint128.Q128
            )
        );
        position.tokensOwed1 += uint128(
            FullMath.mulDiv(
                feeGrowthInside1LastX128 - position.feeGrowthInside1LastX128,
                position.liquidity,
                FixedPoint128.Q128
            )
        );

        position.feeGrowthInside0LastX128 = feeGrowthInside0LastX128;
        position.feeGrowthInside1LastX128 = feeGrowthInside1LastX128;
        position.liquidity += liquidity;

        emit IncreaseLiquidity(params.tokenId, liquidity, amount0, amount1);
    }

    /// @inheritdoc IRubySwapPositionManager
    function decreaseLiquidity(DecreaseLiquidityParams calldata params)
        external
        payable
        override
        nonReentrant
        whenNotPaused
        isAuthorizedForToken(params.tokenId)
        checkDeadline(params.deadline)
        returns (uint256 amount0, uint256 amount1)
    {
        require(params.liquidity > 0, "Zero liquidity");
        Position storage position = _positions[params.tokenId];

        IRubySwapPool pool = getPool(position.token0, position.token1, position.fee);

        (amount0, amount1) = pool.burn(position.tickLower, position.tickUpper, params.liquidity);

        require(amount0 >= params.amount0Min && amount1 >= params.amount1Min, "Price slippage check");

        bytes32 positionKey = keccak256(abi.encodePacked(address(this), position.tickLower, position.tickUpper));

        // Update fees
        (, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, , ) = pool.positions(positionKey);
        position.tokensOwed0 += uint128(
            FullMath.mulDiv(
                feeGrowthInside0LastX128 - position.feeGrowthInside0LastX128,
                position.liquidity,
                FixedPoint128.Q128
            )
        ) + uint128(amount0);
        position.tokensOwed1 += uint128(
            FullMath.mulDiv(
                feeGrowthInside1LastX128 - position.feeGrowthInside1LastX128,
                position.liquidity,
                FixedPoint128.Q128
            )
        ) + uint128(amount1);

        position.feeGrowthInside0LastX128 = feeGrowthInside0LastX128;
        position.feeGrowthInside1LastX128 = feeGrowthInside1LastX128;
        position.liquidity -= params.liquidity;

        emit DecreaseLiquidity(params.tokenId, params.liquidity, amount0, amount1);
    }

    /// @inheritdoc IRubySwapPositionManager
    function collect(CollectParams calldata params)
        external
        payable
        override
        nonReentrant
        whenNotPaused
        isAuthorizedForToken(params.tokenId)
        returns (uint256 amount0, uint256 amount1)
    {
        Position storage position = _positions[params.tokenId];
        IRubySwapPool pool = getPool(position.token0, position.token1, position.fee);

        amount0 = params.amount0Max > position.tokensOwed0 ? position.tokensOwed0 : params.amount0Max;
        amount1 = params.amount1Max > position.tokensOwed1 ? position.tokensOwed1 : params.amount1Max;

        position.tokensOwed0 -= uint128(amount0);
        position.tokensOwed1 -= uint128(amount1);

        (uint256 collected0, uint256 collected1) = pool.collect(
            params.recipient,
            position.tickLower,
            position.tickUpper,
            uint128(amount0),
            uint128(amount1)
        );

        emit Collect(params.tokenId, params.recipient, collected0, collected1);
    }

    /// @inheritdoc IRubySwapPositionManager
    function burn(uint256 tokenId) external payable override nonReentrant whenNotPaused isAuthorizedForToken(tokenId) {
        Position storage position = _positions[tokenId];
        require(position.liquidity == 0 && position.tokensOwed0 == 0 && position.tokensOwed1 == 0, "Not cleared");

        delete _positions[tokenId];
        _burn(tokenId);
    }

    /// @notice Returns the position URI for metadata
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        require(_exists(tokenId), "ERC721: URI query for nonexistent token");
        return string(abi.encodePacked("https://rubyswap.finance/position/", _toString(tokenId)));
    }

    /// @notice Emergency pause function
    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    /// @notice Unpause function  
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    /// @dev Helper function to convert uint to string
    function _toString(uint256 value) internal pure returns (string memory) {
        if (value == 0) {
            return "0";
        }
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
            value /= 10;
        }
        return string(buffer);
    }

    // Stub implementations for interfaces not yet implemented
    function createAndInitializePoolIfNecessary(
        address token0,
        address token1,
        uint24 fee,
        uint160 sqrtPriceX96
    ) external payable override returns (address pool) {
        address existing = IRubySwapFactory(factory).getPool(token0, token1, fee);
        if (existing == address(0)) {
            pool = IRubySwapFactory(factory).createPool(token0, token1, fee);
            IRubySwapPool(pool).initialize(sqrtPriceX96);
        } else {
            pool = existing;
        }
    }

    function multicall(bytes[] calldata data) external payable override returns (bytes[] memory results) {
        results = new bytes[](data.length);
        for (uint256 i = 0; i < data.length; i++) {
            (bool success, bytes memory result) = address(this).delegatecall(data[i]);
            require(success, "Multicall: call failed");
            results[i] = result;
        }
    }

    function refundETH() external payable override {
        uint256 balance = address(this).balance;
        if (balance > 0) {
            (bool success, ) = payable(msg.sender).call{value: balance}("");
            require(success, "ETH refund failed");
        }
    }

    function unwrapWETH9(uint256 amountMinimum, address recipient) external payable override {
        uint256 balanceWETH = IWETH9(WETH9).balanceOf(address(this));
        require(balanceWETH >= amountMinimum, "Insufficient WETH9");
        if (balanceWETH > 0) {
            IWETH9(WETH9).withdraw(balanceWETH);
            (bool success, ) = payable(recipient).call{value: balanceWETH}("");
            require(success, "ETH transfer failed");
        }
    }

    function sweepToken(address token, uint256 amountMinimum, address recipient) external payable override {
        uint256 balanceToken = IERC20(token).balanceOf(address(this));
        require(balanceToken >= amountMinimum, "Insufficient token");
        if (balanceToken > 0) {
            IERC20(token).safeTransfer(recipient, balanceToken);
        }
    }

    function selfPermit(
        address token,
        uint256 value,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external payable override {
        IERC20PermitMinimal(token).permit(msg.sender, address(this), value, deadline, v, r, s);
    }

    function selfPermitIfNecessary(
        address token,
        uint256 value,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external payable override {
        if (IERC20(token).allowance(msg.sender, address(this)) < value) {
            IERC20PermitMinimal(token).permit(msg.sender, address(this), value, deadline, v, r, s);
        }
    }

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

    function selfPermitAllowedIfNecessary(
        address token,
        uint256 nonce,
        uint256 expiry,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external payable override {
        if (IERC20(token).allowance(msg.sender, address(this)) < type(uint256).max) {
            IERC20PermitAllowed(token).permit(msg.sender, address(this), nonce, expiry, true, v, r, s);
        }
    }

    function sweepTokenWithFee(
        address token,
        uint256 amountMinimum,
        address recipient,
        uint256 feeBips,
        address feeRecipient
    ) external payable override {
        uint256 balanceToken = IERC20(token).balanceOf(address(this));
        require(balanceToken >= amountMinimum, "Insufficient token");

        if (feeBips > 0 && feeRecipient != address(0)) {
            uint256 feeAmount = (balanceToken * feeBips) / 10000;
            if (feeAmount > 0) {
                IERC20(token).safeTransfer(feeRecipient, feeAmount);
            }
            balanceToken -= feeAmount;
        }

        if (balanceToken > 0) {
            IERC20(token).safeTransfer(recipient, balanceToken);
        }
    }

    function unwrapWETH9WithFee(
        uint256 amountMinimum,
        address recipient,
        uint256 feeBips,
        address feeRecipient
    ) external payable override {
        uint256 balanceWETH = IWETH9(WETH9).balanceOf(address(this));
        require(balanceWETH >= amountMinimum, "Insufficient WETH9");
        if (balanceWETH == 0) return;

        IWETH9(WETH9).withdraw(balanceWETH);

        uint256 feeAmount = 0;
        if (feeBips > 0 && feeRecipient != address(0)) {
            feeAmount = (balanceWETH * feeBips) / 10000;
            if (feeAmount > 0) {
                (bool fs, ) = payable(feeRecipient).call{value: feeAmount}("");
                require(fs, "Fee transfer failed");
            }
        }
        uint256 remaining = balanceWETH - feeAmount;
        (bool success, ) = payable(recipient).call{value: remaining}("");
        require(success, "ETH transfer failed");
    }

    // IERC721Permit stub implementations
    function DOMAIN_SEPARATOR() external view returns (bytes32) {
        if (address(this) == _CACHED_THIS && block.chainid == _CACHED_CHAIN_ID) {
            return _CACHED_DOMAIN_SEPARATOR;
        }
        return _buildDomainSeparator();
    }

    function PERMIT_TYPEHASH() external pure returns (bytes32) {
        return _PERMIT_TYPEHASH;
    }

    function permit(
        address spender,
        uint256 tokenId,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external payable {
        require(block.timestamp <= deadline, "Permit expired");
        address owner = ownerOf(tokenId);
        bytes32 structHash = keccak256(
            abi.encode(
                _PERMIT_TYPEHASH,
                spender,
                tokenId,
                uint256(_positions[tokenId].nonce),
                deadline
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", _domainSeparator(), structHash));
        address recovered = ECDSA.recover(digest, v, r, s);
        require(recovered != address(0) && recovered == owner, "Invalid signature");
        _positions[tokenId].nonce += 1;
        _approve(spender, tokenId);
    }

    receive() external payable {
        require(msg.sender == WETH9, "Not WETH9");
    }
} 