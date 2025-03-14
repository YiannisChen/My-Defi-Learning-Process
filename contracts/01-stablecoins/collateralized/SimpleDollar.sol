// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "./interfaces/ISimpleDollar.sol";

/**
 * @title SimpleDollar
 * @dev A fiat-backed stablecoin implementation with the following features:
 * - Minting by authorized addresses (simulating an issuer role)
 * - Burning capability
 * - Blacklist functionality for regulatory compliance
 * - Pause functionality for emergencies
 */
contract SimpleDollar is
    ERC20,
    ERC20Burnable,
    Pausable,
    AccessControl,
    ISimpleDollar
{
    event Mint(address indexed to, uint256 amount);
    event Blacklisted(address indexed account);
    event BlacklistRemoved(address indexed account);

    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant BLACKLISTER_ROLE = keccak256("BLACKLISTER_ROLE");

    // Mapping to store blacklisted addresses
    mapping(address => bool) private _blacklisted;

    /**
     * @dev Constructor to initialize the contract and set up roles.
     * @param admin Address with admin privileges.
     *
     * Role hierarchy:
     * DEFAULT_ADMIN_ROLE (Super Admin)
     *  ├─ MINTER_ROLE (Minting Permission)
     *  ├─ PAUSER_ROLE (Pause Permission)
     *  └─ BLACKLISTER_ROLE (Blacklist Permission)
     *
     * Permissions:
     * - Super Admin can manage all sub-roles.
     * - Each sub-role operates independently (Principle of Least Privilege).
     */
    constructor (address admin) ERC20("Simple Dollar", "USD") {
        require(admin != address(0), "Invalid admin address");

        // Grant admin the default admin role
        _grantRole(DEFAULT_ADMIN_ROLE, admin);

        // Set up role hierarchy
        _setRoleAdmin(MINTER_ROLE, DEFAULT_ADMIN_ROLE);
        _setRoleAdmin(PAUSER_ROLE, DEFAULT_ADMIN_ROLE);
        _setRoleAdmin(BLACKLISTER_ROLE, DEFAULT_ADMIN_ROLE);

        // Grant initial roles to the admin
        _grantRole(MINTER_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
        _grantRole(BLACKLISTER_ROLE, admin);
    }

    /**
     * @dev Mint new tokens to a specified address.
     * @param to Recipient address.
     * @param amount Amount of tokens to mint.
     */
    function mint(
        address to,
        uint256 amount
    ) public override onlyRole(MINTER_ROLE) {
        require(to != address(0), "Invalid recipient address");
        require(!_blacklisted[to], "Recipient is blacklisted");
        require(amount > 0, "Amount must be greater than zero");

        _mint(to, amount);
        emit Mint(to, amount);
    }

    /**
     * @dev Override burn function from ERC20Burnable to comply with ISimpleDollar interface.
     * @param amount Amount of tokens to burn.
     */
    function burn(
        uint256 amount
    ) public override(ERC20Burnable, ISimpleDollar) {
        super.burn(amount);
    }

    /**
     * @dev Override decimals function to comply with ISimpleDollar interface.
     * @return uint8 Number of decimal places.
     */
    function decimals()
        public
        view
        override(ERC20, ISimpleDollar)
        returns (uint8)
    {
        return 6;
    }

    /**
     * @dev Override burnFrom function from ERC20Burnable to comply with ISimpleDollar interface.
     * @param account Address of the account to burn from.
     * @param amount Amount of tokens to burn.
     */
    function burnFrom(
        address account,
        uint256 amount
    ) public override(ERC20Burnable, ISimpleDollar) {
        super.burnFrom(account, amount);
    }

    /**
     * @dev Pause token transfers and operations.
     */
    function pause() public override onlyRole(PAUSER_ROLE) {
        _pause();
    }

    /**
     * @dev Unpause token transfers and operations.
     */
    function unpause() public override onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    /**
     * @dev Add an address to the blacklist.
     * @param account Address to be blacklisted.
     */
    function blacklist(
        address account
    ) public override onlyRole(BLACKLISTER_ROLE) {
        require(account != address(0), "Cannot blacklist the zero address");
        require(!_blacklisted[account], "Account is already blacklisted");

        _blacklisted[account] = true;
        emit Blacklisted(account);
    }

    /**
     * @dev Remove an address from the blacklist.
     * @param account Address to be removed from the blacklist.
     */
    function removeFromBlacklist(
        address account
    ) public override onlyRole(BLACKLISTER_ROLE) {
        require(_blacklisted[account], "Account is not blacklisted");

        _blacklisted[account] = false;
        emit BlacklistRemoved(account);
    }

    /**
     * @dev Check if an address is blacklisted.
     * @param account Address to check.
     * @return bool True if the address is blacklisted.
     */
    function isBlacklisted(
        address account
    ) public view override returns (bool) {
        return _blacklisted[account];
    }

    /**
     * @dev Override the _update function to enforce pause and blacklist checks.
     * @param from Sender address.
     * @param to Recipient address.
     * @param value Amount of tokens to transfer.
     * @dev Note: the previous __beforeTokenTransfer has been depreciated in V5, and the new function is _update. 
     * It costs me quite a bit of time to find this out.
     */
    function _update(
        address from,
        address to,
        uint256 value
    ) internal override whenNotPaused {
        require(value > 0, "Amount must be greater than zero");
        require(!_blacklisted[from], "Sender is blacklisted");
        require(!_blacklisted[to], "Recipient is blacklisted");

        super._update(from, to, value);
    }
}
