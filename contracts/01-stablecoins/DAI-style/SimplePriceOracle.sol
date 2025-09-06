// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";

//For learning purposes - in production please use Chainlink or similar
contract SimplePriceOracle is AccessControl {
    bytes32 public constant PRICE_UPDATER_ROLE =
        keccak256("PRICE_UPDATER_ROLE");

    // Price of ETH in USD with 18 decimals (e.g., 2000 * 10^18 = $2000.000000000000000000)
    uint256 private _ethPrice;

    // Timestamp of the last price update
    uint256 private _lastUpdateTime;

    event PriceUpdated(uint256 newPrice, uint256 timestamp);

    /**
     * @dev Constructor that sets up roles and initial price
     * @param admin Address that will have admin privileges
     * @param initialEthPrice Initial ETH/USD price with 18 decimals
     */
    constructor(address admin, uint256 initialEthPrice) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(PRICE_UPDATER_ROLE, admin);

        _ethPrice = initialEthPrice;
        _lastUpdateTime = block.timestamp;

        emit PriceUpdated(initialEthPrice, block.timestamp);
    }

    //Updates the ETH/USD price
    function updatePrice(
        uint256 newPrice
    ) external onlyRole(PRICE_UPDATER_ROLE) {
        _ethPrice = newPrice;
        _lastUpdateTime = block.timestamp;

        emit PriceUpdated(newPrice, block.timestamp);
    }

    //Returns the current ETH/USD price
    function getEthPrice() external view returns (uint256) {
        return _ethPrice;
    }

    //Returns the timestamp of the last price update
    function getLastUpdateTime() external view returns (uint256) {
        return _lastUpdateTime;
    }

    // @dev Converts ETH amount to USD value
    function ethToUsd(uint256 ethAmount) public view returns (uint256) {
        // Convert ETH to USD: ethAmount * ethPrice / 10^18
        // ethAmount is in wei (10^18), result is in USD with 18 decimals
        return (ethAmount * _ethPrice) / 1e18;
    }

    // Converts USD amount to ETH value
    function usdToEth(uint256 usdAmount) public view returns (uint256) {
        // Convert USD to ETH: usdAmount * 10^18 / ethPrice
        // Result is in wei (10^18)
        return (usdAmount * 1e18) / _ethPrice;
    }
}
