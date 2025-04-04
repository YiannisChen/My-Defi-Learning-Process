// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @notice Aave lending pool interactions
 */
interface IAaveLendingPool {
    /**
     * @notice Deposit assets to lending pool
     */
    function supply(
        address asset,
        uint256 amount,
        address onBehalfOf,
        uint16 referralCode
    ) external;

    /**
     * @notice Withdraw assets from lending pool
     */
    function withdraw(
        address asset,
        uint256 amount,
        address to
    ) external returns (uint256);
}

/**
 * @notice Aave interest-bearing token interface
 */
interface IAToken {
    /**
     * @notice Get underlying asset address
     */
    function UNDERLYING_ASSET_ADDRESS() external view returns (address);

    /**
     * @notice Check token balance
     */
    function balanceOf(address account) external view returns (uint256);

    /**
     * @notice Get additional incentive yield
     */
    function getIncentivesAPR() external view returns (uint256);
}