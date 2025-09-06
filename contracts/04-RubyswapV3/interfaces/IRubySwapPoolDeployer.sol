// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.24;

/// @title Pool deployer interface (RubySwap)
/// @notice Defines the interface for the pool deployer contract
interface IRubySwapPoolDeployer {
    /// @notice Get the deployment parameters for a pool
    /// @return factory The factory address
    /// @return token0 The first token address
    /// @return token1 The second token address
    /// @return fee The pool fee
    /// @return tickSpacing The tick spacing
    function parameters()
        external
        view
        returns (
            address factory,
            address token0,
            address token1,
            uint24 fee,
            int24 tickSpacing
        );

    /// @notice Deploy a new pool using the provided parameters
    /// @param factory The factory creating the pool
    /// @param token0 The first token address (sorted)
    /// @param token1 The second token address (sorted)
    /// @param fee The pool fee in hundredths of a bip
    /// @param tickSpacing The tick spacing for the pool
    /// @return pool The deployed pool address
    function deploy(
        address factory,
        address token0,
        address token1,
        uint24 fee,
        int24 tickSpacing
    ) external returns (address pool);
} 