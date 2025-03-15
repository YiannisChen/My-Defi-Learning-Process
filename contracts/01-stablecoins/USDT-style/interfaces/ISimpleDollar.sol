// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/interfaces/IERC20.sol";

/**
 * @title ISimpleDollar
 * @dev Interface for the SimpleDollar token with additional stablecoin functionality
 */
interface ISimpleDollar is IERC20 {
    /**
     * @dev Mints new tokens to the specified address
     * @param to The address that will receive the minted tokens
     * @param amount The amount of tokens to mint
     */
    function mint(address to, uint256 amount) external;

    /**
     * @dev Burns tokens from the caller's account
     * @param amount The amount of tokens to burn
     */
    function burn(uint256 amount) external;

    /**
     * @dev Burns tokens from a specified account
     * @param account The account to burn tokens from
     * @param amount The amount of tokens to burn
     */
    function burnFrom(address account, uint256 amount) external;

    /**
     * @dev Pauses token transfers and operations
     */
    function pause() external;

    /**
     * @dev Unpauses token transfers and operations
     */
    function unpause() external;

    /**
     * @dev Adds an address to the blacklist
     * @param account The address to blacklist
     */
    function blacklist(address account) external;

    /**
     * @dev Removes an address from the blacklist
     * @param account The address to remove from blacklist
     */
    function removeFromBlacklist(address account) external;

    /**
     * @dev Checks if an address is blacklisted
     * @param account The address to check
     * @return bool True if the address is blacklisted
     */
    function isBlacklisted(address account) external view returns (bool);

    /**
     * @dev Returns the number of decimals used for token amounts
     * @return uint8 The number of decimals
     */
    function decimals() external view returns (uint8);
}
