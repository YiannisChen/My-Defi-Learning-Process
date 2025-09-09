// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.24;

import "./Oracle.sol";
import "./FullMath.sol";
import "./TickMath.sol";
import "../interfaces/IRubySwapPool.sol";

/// @title OracleLibrary helpers
library OracleLibrary {
    using Oracle for Oracle.Observation[65535];

    function initialize(Oracle.Observation[65535] storage self, uint32 time)
        internal
        returns (uint16 cardinality, uint16 cardinalityNext)
    {
        return Oracle.initialize(self, time);
    }

    function write(
        Oracle.Observation[65535] storage self,
        uint16 index,
        uint32 blockTimestamp,
        int24 tick,
        uint128 liquidity,
        uint16 cardinality,
        uint16 cardinalityNext
    ) internal returns (uint16 indexUpdated, uint16 cardinalityUpdated) {
        return Oracle.write(self, index, blockTimestamp, tick, liquidity, cardinality, cardinalityNext);
    }

    function grow(
        Oracle.Observation[65535] storage self,
        uint16 current,
        uint16 next
    ) internal returns (uint16) {
        return Oracle.grow(self, current, next);
    }

    /// @notice Consults the pool oracle for an arithmetic mean tick and derived sqrtPriceX96 over secondsAgo
    function consult(IRubySwapPool pool, uint32 secondsAgo) internal view returns (int24 arithmeticMeanTick, uint160 sqrtPriceX96) {
        require(secondsAgo > 0, "BAGO");
        uint32[] memory secondsAgos = new uint32[](2);
        secondsAgos[0] = secondsAgo;
        secondsAgos[1] = 0;
        (int56[] memory tickCumulatives, ) = pool.observe(secondsAgos);
        int56 tickDelta = tickCumulatives[1] - tickCumulatives[0];
        arithmeticMeanTick = int24(tickDelta / int56(int32(secondsAgo)));
        // Handle negative remainder toward -inf
        if (tickDelta < 0 && (tickDelta % int56(int32(secondsAgo)) != 0)) arithmeticMeanTick--;
        sqrtPriceX96 = TickMath.getSqrtRatioAtTick(arithmeticMeanTick);
    }

    /// @notice Converts Q64.96 sqrtPriceX96 to 18-decimal price
    function sqrtPriceX96ToPriceX18(uint160 sqrtPriceX96) internal pure returns (uint256) {
        // price = (sqrt^2 * 1e18) / 2^192
        return FullMath.mulDiv(uint256(sqrtPriceX96), uint256(sqrtPriceX96) * 1e18, 2 ** 192);
    }
} 