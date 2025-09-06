// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.24;

import {IRubySwapQuoter} from "../interfaces/IRubySwapQuoter.sol";
import {IRubySwapFactory} from "../interfaces/IRubySwapFactory.sol";
import {IRubySwapPool} from "../interfaces/IRubySwapPool.sol";
import {IRubySwapV3SwapCallback} from "../interfaces/callback/IRubySwapV3SwapCallback.sol";
import "../libraries/Path.sol";
import "../libraries/TickMath.sol";

contract RubySwapQuoter is IRubySwapQuoter, IRubySwapV3SwapCallback {
    using Path for bytes;
    
    IRubySwapFactory public immutable factory;

    constructor(address _factory) {
        factory = IRubySwapFactory(_factory);
    }

    function getPool(address tokenA, address tokenB, uint24 fee) private view returns (IRubySwapPool) {
        return IRubySwapPool(factory.getPool(tokenA, tokenB, fee));
    }

    function rubySwapV3SwapCallback(
        int256 amount0Delta,
        int256 amount1Delta,
        bytes calldata
    ) external pure override {
        require(amount0Delta > 0 || amount1Delta > 0);
        // Revert with the amounts to return them to the caller
        assembly {
            let ptr := mload(0x40)
            mstore(ptr, amount0Delta)
            mstore(add(ptr, 0x20), amount1Delta)
            revert(ptr, 0x40)
        }
    }

    function quoteExactInputSingle(
        address tokenIn,
        address tokenOut,
        uint24 fee,
        uint256 amountIn,
        uint160 sqrtPriceLimitX96
    ) external override returns (uint256 amountOut) {
        require(tokenIn != address(0) && tokenOut != address(0), "ZERO_ADDR");
        IRubySwapPool pool = getPool(tokenIn, tokenOut, fee);
        require(address(pool) != address(0), "Pool does not exist");

        bool zeroForOne = tokenIn < tokenOut;

        try pool.swap(
            address(this),
            zeroForOne,
            int256(amountIn),
            sqrtPriceLimitX96 == 0 ? 
                (zeroForOne ? TickMath.MIN_SQRT_RATIO : TickMath.MAX_SQRT_RATIO) : 
                sqrtPriceLimitX96,
            abi.encode(tokenIn, tokenOut, fee)
        ) {} catch (bytes memory reason) {
            // Decode the revert reason to get the amounts
            (int256 amount0Delta, int256 amount1Delta) = abi.decode(reason, (int256, int256));
            amountOut = uint256(-(zeroForOne ? amount1Delta : amount0Delta));
        }
    }

    function quoteExactOutputSingle(
        address tokenIn,
        address tokenOut,
        uint24 fee,
        uint256 amountOut,
        uint160 sqrtPriceLimitX96
    ) external override returns (uint256 amountIn) {
        require(tokenIn != address(0) && tokenOut != address(0), "ZERO_ADDR");
        IRubySwapPool pool = getPool(tokenIn, tokenOut, fee);
        require(address(pool) != address(0), "Pool does not exist");

        bool zeroForOne = tokenIn < tokenOut;

        try pool.swap(
            address(this),
            zeroForOne,
            -int256(amountOut),
            sqrtPriceLimitX96 == 0 ? 
                (zeroForOne ? TickMath.MIN_SQRT_RATIO : TickMath.MAX_SQRT_RATIO) : 
                sqrtPriceLimitX96,
            abi.encode(tokenIn, tokenOut, fee)
        ) {} catch (bytes memory reason) {
            // Decode the revert reason to get the amounts
            (int256 amount0Delta, int256 amount1Delta) = abi.decode(reason, (int256, int256));
            amountIn = uint256(zeroForOne ? amount0Delta : amount1Delta);
        }
    }

    function quoteExactInput(bytes calldata path, uint256 amountIn) 
        external 
        override 
        returns (uint256 amountOut) 
    {
        require(path.length >= 43 && ((path.length - 20) % 23) == 0, "PATH_INVALID");
        amountOut = amountIn;
        bytes memory currentPath = path;
        
        while (true) {
            bool hasMultiplePools = currentPath.hasMultiplePools();
            
            (address tokenIn, address tokenOut, uint24 fee) = currentPath.decodeFirstPool();
            require(tokenIn != address(0) && tokenOut != address(0), "PATH_ZERO_ADDR");
            
            // Quote this hop
            uint256 hopAmountOut = this.quoteExactInputSingle(
                tokenIn,
                tokenOut,
                fee,
                amountOut,
                0
            );
            
            if (hasMultiplePools) {
                currentPath = currentPath.skipToken();
                amountOut = hopAmountOut;
            } else {
                amountOut = hopAmountOut;
                break;
            }
        }
    }

    function quoteExactOutput(bytes calldata path, uint256 amountOut) 
        external 
        override 
        returns (uint256 amountIn) 
    {
        require(path.length >= 43 && ((path.length - 20) % 23) == 0, "PATH_INVALID");
        return _quoteExactOutputInternal(amountOut, path);
    }
    
    function _quoteExactOutputInternal(uint256 amountOut, bytes memory path) 
        private 
        returns (uint256 amountIn) 
    {
        if (path.hasMultiplePools()) {
            bytes memory firstPool = path.getFirstPool();
            path = path.skipToken();
            
            uint256 amountInIntermediate = _quoteExactOutputInternal(amountOut, path);
            
            (address tokenIn, address tokenOut, uint24 fee) = firstPool.decodeFirstPool();
            amountIn = this.quoteExactOutputSingle(tokenIn, tokenOut, fee, amountInIntermediate, 0);
        } else {
            (address tokenIn, address tokenOut, uint24 fee) = path.decodeFirstPool();
            amountIn = this.quoteExactOutputSingle(tokenIn, tokenOut, fee, amountOut, 0);
        }
    }
} 