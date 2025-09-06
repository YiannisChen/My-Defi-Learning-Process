// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.24;

/// @title Oracle Registry Interface
/// @notice Interface for managing Chainlink price feeds with validation and safety checks
interface IOracleRegistry {
    /// @notice Get normalized price (18 decimals) from Chainlink feed
    /// @param token The token address
    /// @return price The normalized price in 18 decimals
    /// @return isValid Whether the price is valid and recent
    function getPrice(address token) external view returns (uint256 price, bool isValid);
    
    /// @notice Check if price deviation between Chainlink and TWAP exceeds threshold
    /// @param token The token address
    /// @param twapPriceX96 The TWAP price from pool in Q64.96 format
    /// @return isSafe Whether the price is within safe deviation range
    /// @return deviation The deviation in basis points
    function isSafePrice(address token, uint160 twapPriceX96) external view returns (bool isSafe, uint256 deviation);
    
    /// @notice Check if both tokens in a pair have valid feeds
    /// @param tokenA First token
    /// @param tokenB Second token
    /// @return hasFeeds Whether both tokens have valid, enabled feeds
    function hasBothFeeds(address tokenA, address tokenB) external view returns (bool hasFeeds);
    
    /// @notice Set Chainlink feed for a token with validation
    /// @param token The token address
    /// @param feed The Chainlink AggregatorV3Interface address
    function setFeed(address token, address feed) external;
    
    /// @notice Emergency disable a feed
    /// @param token The token to disable
    /// @param reason Reason for disabling
    function disableFeed(address token, string calldata reason) external;
    
    /// @notice Get feed info for a token
    /// @return feed The feed address
    /// @return decimals The feed decimals
    /// @return enabled Whether the feed is enabled
    /// @return lastUpdate Last update timestamp
    function getFeedInfo(address token) external view returns (
        address feed,
        uint8 decimals,
        bool enabled,
        uint256 lastUpdate
    );
    
    /// @notice Events
    event FeedSet(address indexed token, address indexed feed, uint8 decimals);
    event FeedDisabled(address indexed token, string reason);
    event SafeModeTriggered(address indexed token, int256 chainlinkPrice, uint256 twapPrice, uint256 deviation);
} 