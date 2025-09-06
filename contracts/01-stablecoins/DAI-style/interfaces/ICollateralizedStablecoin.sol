// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title ICollateralizedStablecoin
 * @dev Interface for the CollateralizedStablecoin token
 */
interface ICollateralizedStablecoin is IERC20 {
    /**
     * @dev Get summary information about a vault
     * @param owner Address of the vault owner
     * @return collateral Collateral amount in the vault (wei)
     * @return debt Debt amount in the vault (stablecoin units)
     * @return ratio Current collateralization ratio
     * @return maxDebt Maximum debt possible with current collateral
     */
    function getVaultSummary(
        address owner
    )
        external
        view
        returns (
            uint256 collateral,
            uint256 debt,
            uint256 ratio,
            uint256 maxDebt
        );

    /**
     * @dev Create a new vault or add collateral to an existing one
     */
    function createVault() external payable;

    /**
     * @dev Add more collateral to an existing vault
     */
    function addCollateral() external payable;

    /**
     * @dev Generate stablecoins against deposited collateral
     * @param amount Amount of stablecoins to generate
     */
    function generateDebt(uint256 amount) external;

    /**
     * @dev Repay debt and get collateral back
     * @param debtAmount Amount of debt to repay
     */
    function repayDebt(uint256 debtAmount) external;

    /**
     * @dev Withdraw collateral if there's enough remaining
     * @param collateralAmount Amount of collateral to withdraw (in wei)
     */
    function withdrawCollateral(uint256 collateralAmount) external;

    /**
     * @dev Liquidate an undercollateralized vault
     * @param owner Address of the vault owner
     * @param debtAmount Amount of debt to repay and liquidate
     */
    function liquidate(address owner, uint256 debtAmount) external;

    /**
     * @dev Calculate the current collateralization ratio of a vault
     * @param owner Address of the vault owner
     * @return ratio Current collateralization ratio (scaled by BASE_PRECISION)
     */
    function getCurrentRatio(address owner) external view returns (uint256);

    /**
     * @dev Check if a vault is eligible for liquidation
     * @param owner Address of the vault owner
     * @return bool True if the vault can be liquidated
     */
    function canLiquidate(address owner) external view returns (bool);

    /**
     * @dev Pauses contract operations
     */
    function pause() external;

    /**
     * @dev Unpauses contract operations
     */
    function unpause() external;

    /**
     * @dev Update system parameters
     * @param newCollateralRatio New collateralization ratio
     * @param newLiquidationThreshold New liquidation threshold
     * @param newLiquidationPenalty New liquidation penalty
     * @param newStabilityFee New stability fee
     */
    function updateParameters(
        uint256 newCollateralRatio,
        uint256 newLiquidationThreshold,
        uint256 newLiquidationPenalty,
        uint256 newStabilityFee
    ) external;
}
