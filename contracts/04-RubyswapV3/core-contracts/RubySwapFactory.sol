// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.24;

import {IRubySwapFactory} from "../interfaces/IRubySwapFactory.sol";
import {IRubySwapPoolDeployer} from "../interfaces/IRubySwapPoolDeployer.sol";
import {RubySwapPoolDeployer} from "./RubySwapPoolDeployer.sol";
import {OracleRegistry} from "./OracleRegistry.sol";

contract RubySwapFactory is IRubySwapFactory {
    address public override owner;
    address public timelock;
    IRubySwapPoolDeployer public immutable poolDeployer;
    address public override oracleRegistry;

    // fee => tickSpacing
    mapping(uint24 => int24) public override feeAmountTickSpacing;

    // tokenA => tokenB => fee => pool
    mapping(address => mapping(address => mapping(uint24 => address))) public override getPool;

    modifier onlyOwner() {
        require(msg.sender == owner, "NOT_OWNER");
        _;
    }

    modifier onlyTimelock() {
        require(msg.sender == timelock, "NOT_TIMELOCK");
        _;
    }

    constructor(address _timelock) {
        require(_timelock != address(0), "ZERO_TIMELOCK");
        owner = msg.sender;
        timelock = _timelock;
        poolDeployer = new RubySwapPoolDeployer();
        OracleRegistry reg = new OracleRegistry();
        reg.transferOwnership(msg.sender);
        oracleRegistry = address(reg);
        _setFeeAmount(500, 10);
        _setFeeAmount(3000, 60);
        _setFeeAmount(10000, 200);
    }

    function _setFeeAmount(uint24 fee, int24 tickSpacing) internal {
        require(tickSpacing > 0, "TS_ZERO");
        require(feeAmountTickSpacing[fee] == 0, "FEE_ENABLED");
        feeAmountTickSpacing[fee] = tickSpacing;
    }

    function enableFeeAmount(uint24 fee, int24 tickSpacing) external override onlyTimelock {
        _setFeeAmount(fee, tickSpacing);
    }

    function setTimelock(address _timelock) external onlyOwner {
        require(_timelock != address(0), "ZERO_ADDRESS");
        timelock = _timelock;
    }

    function createPool(address tokenA, address tokenB, uint24 fee) external override returns (address pool) {
        require(tokenA != tokenB, "IDENTICAL_ADDRESSES");
        (address token0, address token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        require(token0 != address(0), "ZERO_ADDRESS");

        int24 tickSpacing = feeAmountTickSpacing[fee];
        require(tickSpacing != 0, "FEE_NOT_ENABLED");
        require(getPool[token0][token1][fee] == address(0), "POOL_EXISTS");
        // 🚨 CRITICAL: Enforce oracle requirement for Phase 1
        require(
            OracleRegistry(oracleRegistry).hasBothFeeds(token0, token1),
            "MISSING_ORACLE_FEEDS"
        );

        pool = poolDeployer.deploy(address(this), token0, token1, fee, tickSpacing);
        getPool[token0][token1][fee] = pool;
        getPool[token1][token0][fee] = pool;

        emit PoolCreated(token0, token1, fee, tickSpacing, pool);
    }
} 