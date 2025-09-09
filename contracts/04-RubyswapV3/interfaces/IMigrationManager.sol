// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.24;

interface IMigrationManager {
    event Migrated(
        address indexed user,
        uint256 indexed uniTokenId,
        uint256 indexed rubyTokenId,
        address token0,
        address token1,
        uint24 fee,
        uint256 usdValue,
        uint256 rubyReward
    );
    
    event BatchMigrated(
        address indexed user,
        uint256[] uniTokenIds,
        uint256[] rubyTokenIds,
        uint256 totalUsdValue,
        uint256 totalRubyReward
    );
    
    event MigrationRewardDistributed(
        address indexed recipient,
        uint256 indexed rubyTokenId,
        uint256 amount
    );
    
    event MigrationRewardClaimed(
        address indexed recipient,
        uint256 amount
    );
    
    event MaxMigrationRewardsUpdated(uint256 oldAmount, uint256 newAmount);
    
    error ZeroAddress();
    error AlreadyMigrated();
    error InsufficientRewards();
    error NoVestedRewards();
    error InvalidVestingAmount();

    function migrate(uint256 uniTokenId, bytes calldata rubyMintParams) external returns (uint256 rubyTokenId);
    function batchMigrate(uint256[] calldata uniTokenIds, bytes[] calldata rubyMintParamsArray) external returns (uint256[] memory rubyTokenIds);
    function claimVestedMigrationReward() external;
    function getUserMigrations(address user) external view returns (uint256[] memory);
    function getVestedAmount(address user) external view returns (uint256);
    function migratedUniTokens(uint256 uniTokenId) external view returns (bool);
    function totalMigrationRewards() external view returns (uint256);
    function maxMigrationRewards() external view returns (uint256);
    function migrationRewardVesting(address user) external view returns (uint256);
    function migrationRewardVestingStart(address user) external view returns (uint256);
}
