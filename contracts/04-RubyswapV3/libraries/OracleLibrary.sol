// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.24;

import "./Oracle.sol";

/// @title OracleLibrary (compat wrapper)
/// @notice Thin wrapper to maintain naming consistency with TSD that references OracleLibrary
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
} 