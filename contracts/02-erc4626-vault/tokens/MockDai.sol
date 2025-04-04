// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
/*
This contract ultimately turns out to be unnecessary, cause we can request test token on AAVE Faucet(https://gho.aave.com/faucet/).
DAI's contract address :0xFF34B3d4Aee8ddCd6F9AFFFB6Fe49bD371b8a357
USDC's contract address :0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8
AAVE's contract address :0x88541670E55cC00bEEFD87eB59EDd1b7C511AC9a
*/

/**
 * @title MockDAI
 * @notice A mock DAI token for testing purposes
 */
contract MockDAI is ERC20, Ownable {
    uint8 private _decimals = 18;

    /**
     * @notice Constructs the MockDAI contract
     * @param initialSupply Initial supply of tokens to mint to the deployer
     */
    constructor(
        uint256 initialSupply
    ) ERC20("Mock DAI", "mDAI") Ownable(msg.sender) {
        _mint(msg.sender, initialSupply);
    }

    /**
     * @notice Returns the number of decimals used by the token
     * @return The number of decimals (18)
     */
    function decimals() public view virtual override returns (uint8) {
        return _decimals;
    }

    /**
     * @notice Mints tokens to a specified address
     * @param to Address to mint tokens to
     * @param amount Amount of tokens to mint
     */
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    /**
     * @notice Burns tokens from the caller's balance
     * @param amount Amount of tokens to burn
     */
    function burn(uint256 amount) external {
        _burn(msg.sender, amount);
    }

    /**
     * @notice Burns tokens from a specified address (with allowance)
     * @param from Address to burn tokens from
     * @param amount Amount of tokens to burn
     */
    function burnFrom(address from, uint256 amount) external {
        _spendAllowance(from, msg.sender, amount);
        _burn(from, amount);
    }
}
