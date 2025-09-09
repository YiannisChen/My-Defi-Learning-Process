// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.24;

interface IPositionStaking {
    // Events
    event Staked(address indexed owner, uint256 indexed tokenId, uint8 lockType, uint256 usdValueScaled);
    event Unstaked(address indexed owner, uint256 indexed tokenId, uint256 usdValueScaled);
    event Claimed(address indexed owner, uint256 indexed tokenId, uint256 amount);
    event EmissionRateUpdated(uint256 newRate);
    event DecayExecuted(uint256 previousRate, uint256 newRate, uint256 timestamp);

    // Custom errors
    error ZeroAddress();
    error InvalidPrice();
    error InvalidLock();
    error LockActive();
    error NotOwner();
    error AlreadyStaked();

    // User actions
    function stake(uint256 tokenId, uint8 lockType) external;
    function unstake(uint256 tokenId) external;
    function claim(uint256 tokenId) external;
    function pendingRewards(uint256 tokenId) external view returns (uint256);

    // Admin/config
    function setEmissionRate(uint256 newRate) external;
    function setRuby(address newRuby) external;
    function setOracleRegistry(address newOracle) external;
    function setTwapEnabled(bool enabled) external;
    function setDecayInterval(uint256 newInterval) external;
    function executeMonthlyDecay() external;

    // Views
    function twapEnabled() external view returns (bool);
    function decayInterval() external view returns (uint256);
    function lastDecayTime() external view returns (uint256);
} 