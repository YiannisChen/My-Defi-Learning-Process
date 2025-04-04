// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @notice Yield strategy interface for vault interactions
 */
interface IStrategy {

    event Deposited(uint256 amount);
    event Withdrawn(uint256 amount);
    event Harvested(uint256 yieldAmount);
    event EmergencyWithdrawn(uint256 amount);

   
    /**
     * @notice Deposit assets into strategy
     */
    function deposit(uint256 amount) external returns (uint256);

    /**
     * @notice Withdraw assets from strategy
     */
    function withdraw(uint256 amount) external returns (uint256);

    /**
     * @notice Withdraw all assets
     */
    function withdrawAll() external returns (uint256);

    /**
     * @notice Collect and convert yield
     */
    function harvest() external returns (uint256);

    

    /**
     * @notice Get underlying asset address
     */
    function asset() external view returns (address);

    /**
     * @notice Get total managed assets
     */
    function totalValue() external view returns (uint256);

    /**
     * @notice Get strategy name
     */
    function name() external view returns (string memory);

    /**
     * @notice Get estimated annual yield
     */
    function estimatedAPY() external view returns (uint256);

    /**
     * @notice Check if strategy is paused
     */
    function isPaused() external view returns (bool);

    /*//////////////////////////////////////////////////////////////
                            EMERGENCY FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Pause strategy operations
     */
    function pause() external;

    /**
     * @notice Resume strategy operations
     */
    function unpause() external;
}