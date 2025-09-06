// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.24;

interface IRubySwapFactory {
    // ===== Events =====
    event PoolCreated(address indexed token0, address indexed token1, uint24 fee, int24 tickSpacing, address pool);

    // ===== Owner =====
    function owner() external view returns (address);

    // ===== Fee tiers =====
    function feeAmountTickSpacing(uint24 fee) external view returns (int24);

    // ===== Pools registry =====
    function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address);

    // ===== Oracle registry =====
    function oracleRegistry() external view returns (address);

    // ===== Mutators =====
    function enableFeeAmount(uint24 fee, int24 tickSpacing) external;
    function createPool(address tokenA, address tokenB, uint24 fee) external returns (address pool);
} 