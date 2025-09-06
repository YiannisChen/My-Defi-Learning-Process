// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.24;

interface IRubySwapQuoter {
    function quoteExactInputSingle(
        address tokenIn,
        address tokenOut,
        uint24 fee,
        uint256 amountIn,
        uint160 sqrtPriceLimitX96
    ) external returns (uint256 amountOut);

    function quoteExactOutputSingle(
        address tokenIn,
        address tokenOut,
        uint24 fee,
        uint256 amountOut,
        uint160 sqrtPriceLimitX96
    ) external returns (uint256 amountIn);

    function quoteExactInput(bytes calldata path, uint256 amountIn) 
        external 
        returns (uint256 amountOut);

    function quoteExactOutput(bytes calldata path, uint256 amountOut) 
        external 
        returns (uint256 amountIn);
} 