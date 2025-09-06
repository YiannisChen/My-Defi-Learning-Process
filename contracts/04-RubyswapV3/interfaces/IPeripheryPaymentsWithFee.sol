// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.24;

import "./IPeripheryPayments.sol";

/// @title Periphery Payments With Fee
/// @notice Functions to ease deposits and withdrawals of ETH with fee support
interface IPeripheryPaymentsWithFee is IPeripheryPayments {
    /// @notice Unwraps the contract's WETH9 balance and sends it to recipient as ETH, with a percentage between
    /// 0 (exclusive), and 1 (inclusive) going to feeRecipient
    /// @dev The amountMinimum parameter prevents malicious contracts from stealing WETH9 from users.
    /// @param amountMinimum The minimum amount of WETH9 to unwrap
    /// @param recipient The address receiving ETH
    /// @param feeBips The fee amount in basis points (1 bips = 0.01%)
    /// @param feeRecipient The address that will receive the fee
    function unwrapWETH9WithFee(
        uint256 amountMinimum,
        address recipient,
        uint256 feeBips,
        address feeRecipient
    ) external payable;

    /// @notice Transfers the full amount of a token held by this contract to recipient, with a percentage between
    /// 0 (exclusive) and 1 (inclusive) going to feeRecipient
    /// @dev The amountMinimum parameter prevents malicious contracts from stealing the token from users
    /// @param token The token address to sweep
    /// @param amountMinimum The minimum amount of token required for a transfer
    /// @param recipient The destination address of the token
    /// @param feeBips The fee amount in basis points (1 bips = 0.01%)
    /// @param feeRecipient The address that will receive the fee
    function sweepTokenWithFee(
        address token,
        uint256 amountMinimum,
        address recipient,
        uint256 feeBips,
        address feeRecipient
    ) external payable;
} 