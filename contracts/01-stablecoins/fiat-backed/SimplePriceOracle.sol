// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
/**
 * @title SimplePriceOracle
 * @dev A simple oracle that provides ETH/USD price data
 * (For learning purposes - in production you would use Chainlink or similar)
 */
contract SimplePriceOracle is AccessControl {
    bytes32 public constant PRICE_UPDATER_ROLE =
        keccak256("PRICE_UPDATER_ROLE");

    // Price of ETH in USD with 8 decimals (e.g., 200000000000 = $2000.00000000)
    uint256 private _ethPrice;

    // Timestamp of the last price update
    uint256 private _lastUpdateTime;

    // Events
    event PriceUpdated(uint256 newPrice, uint256 timestamp);

    /**
     * @dev Constructor that sets up roles and initial price
     * @param admin Address that will have admin privileges
     * @param initialEthPrice Initial ETH/USD price with 8 decimals
     */
    constructor (address admin, uint256 initialEthPrice) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(PRICE_UPDATER_ROLE, admin);

        _ethPrice = initialEthPrice;
        _lastUpdateTime = block.timestamp;

        emit PriceUpdated(initialEthPrice, block.timestamp);
    }

    /**
     * @dev Updates the ETH/USD price
     * @param newPrice New ETH/USD price with 8 decimals
     */
    function updatePrice(
        uint256 newPrice
    ) external onlyRole(PRICE_UPDATER_ROLE) {
        _ethPrice = newPrice;
        _lastUpdateTime = block.timestamp;

        emit PriceUpdated(newPrice, block.timestamp);
    }

    /**
     * @dev Returns the current ETH/USD price
     * @return uint256 ETH/USD price with 8 decimals
     */
    function getEthPrice() external view returns (uint256) {
        return _ethPrice;
    }

    /**
     * @dev Returns the timestamp of the last price update
     * @return uint256 Timestamp
     */
    function getLastUpdateTime() external view returns (uint256) {
        return _lastUpdateTime;
    }

    /**
     * @dev Converts ETH amount to USD value
     * @param ethAmount Amount of ETH (in wei)
     * @return usdValue USD value with 8 decimals
     */
    function ethToUsd(uint256 ethAmount) public view returns (uint256) {
        // Convert ETH to USD: ethAmount * ethPrice / 10^18
        // ethAmount is in wei (10^18), result is in USD with 8 decimals
        return (ethAmount * _ethPrice) / 1e18;
    }

    /**
     * @dev Converts USD amount to ETH value
     * @param usdAmount Amount of USD with 8 decimals
     * @return ethAmount ETH amount in wei
     */
    function usdToEth(uint256 usdAmount) public view returns (uint256) {
        // Convert USD to ETH: usdAmount * 10^18 / ethPrice
        // Result is in wei (10^18)
        return (usdAmount * 1e18) / _ethPrice;
    }
}
