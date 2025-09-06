// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../../core-contracts/interfaces/IRubyswapV2Pair.sol";
import "../../core-contracts/interfaces/IRubyswapV2Factory.sol";
import "../../core-contracts/interfaces/IRubyswapV2Router.sol";

library RubyswapV2Library {
    // Returns sorted token addresses, used to handle return values from pairs sorted in this order
    function sortTokens(
        address tokenA,
        address tokenB
    ) internal pure returns (address token0, address token1) {
        require(tokenA != tokenB, "RubyswapV2Library: IDENTICAL_ADDRESSES");
        (token0, token1) = tokenA < tokenB
            ? (tokenA, tokenB)
            : (tokenB, tokenA);
        require(token0 != address(0), "RubyswapV2Library: ZERO_ADDRESS");
    }

    // Calculates the CREATE2 address for a pair without making any external calls
    function pairFor(
        address factory,
        address tokenA,
        address tokenB
    ) internal view returns (address pair) {
        (address token0, address token1) = sortTokens(tokenA, tokenB);
        pair = IRubyswapV2Factory(factory).getPair(token0, token1);
        require(pair != address(0), "RubyswapV2Library: PAIR_DOES_NOT_EXIST");
    }

    // Fetches and sorts the reserves for a pair
    function getReserves(
        address factory,
        address tokenA,
        address tokenB
    ) internal view returns (uint reserveA, uint reserveB) {
        (address token0, address token1) = sortTokens(tokenA, tokenB);
        (uint reserve0, uint reserve1, ) = IRubyswapV2Pair(
            pairFor(factory, tokenA, tokenB)
        ).getReserves();
        (reserveA, reserveB) = tokenA == token0
            ? (reserve0, reserve1)
            : (reserve1, reserve0);
    }

    // Given some amount of an asset and pair reserves, returns an equivalent amount of the other asset
    function quote(
        uint amountA,
        uint reserveA,
        uint reserveB
    ) internal pure returns (uint amountB) {
        require(amountA > 0, "RubyswapV2Library: INSUFFICIENT_AMOUNT");

        // Handle first-time liquidity addition
        if (reserveA == 0 && reserveB == 0) {
            return amountA; // For first liquidity, use 1:1 ratio
        }

        require(
            reserveA > 0 && reserveB > 0,
            "RubyswapV2Library: INSUFFICIENT_LIQUIDITY"
        );

        // Use safe math to prevent overflow
        uint numerator = amountA * reserveB;
        uint denominator = reserveA;
        amountB = numerator / denominator;
    }

    // Given an input amount of an asset and pair reserves, returns the maximum output amount of the other asset
    function getAmountOut(
        uint amountIn,
        uint reserveIn,
        uint reserveOut
    ) internal pure returns (uint amountOut) {
        require(amountIn > 0, "RubyswapV2Library: INSUFFICIENT_INPUT_AMOUNT");
        require(
            reserveIn > 0 && reserveOut > 0,
            "RubyswapV2Library: INSUFFICIENT_LIQUIDITY"
        );

        // Use safe math to prevent overflow
        uint amountInWithFee = amountIn * 997;
        uint numerator = amountInWithFee * reserveOut;
        uint denominator = (reserveIn * 1000) + amountInWithFee;
        amountOut = numerator / denominator;
    }

    // Given an output amount of an asset and pair reserves, returns a required input amount of the other asset
    function getAmountIn(
        uint amountOut,
        uint reserveIn,
        uint reserveOut
    ) internal pure returns (uint amountIn) {
        require(amountOut > 0, "RubyswapV2Library: INSUFFICIENT_OUTPUT_AMOUNT");
        require(
            reserveIn > 0 && reserveOut > 0,
            "RubyswapV2Library: INSUFFICIENT_LIQUIDITY"
        );

        // Use safe math to prevent overflow
        uint numerator = reserveIn * amountOut * 1000;
        uint denominator = (reserveOut - amountOut) * 997;
        amountIn = (numerator / denominator) + 1;
    }

    // Only support direct swaps (no multi-hop)
    function getAmountsOut(
        address factory,
        uint amountIn,
        address[] memory path
    ) internal view returns (uint[] memory amounts) {
        require(path.length == 2, "RubyswapV2Library: INVALID_PATH");
        amounts = new uint[](2);
        amounts[0] = amountIn;
        (uint reserveIn, uint reserveOut) = getReserves(
            factory,
            path[0],
            path[1]
        );
        amounts[1] = getAmountOut(amountIn, reserveIn, reserveOut);
    }

    function getAmountsIn(
        address factory,
        uint amountOut,
        address[] memory path
    ) internal view returns (uint[] memory amounts) {
        require(path.length == 2, "RubyswapV2Library: INVALID_PATH");
        amounts = new uint[](2);
        amounts[1] = amountOut;
        (uint reserveIn, uint reserveOut) = getReserves(
            factory,
            path[0],
            path[1]
        );
        amounts[0] = getAmountIn(amountOut, reserveIn, reserveOut);
    }
}
