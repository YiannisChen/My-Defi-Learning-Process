// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/governance/TimelockController.sol";
import "@openzeppelin/contracts/access/IAccessControl.sol";

/// @title RubySwap Timelock Controller
/// @notice Enforces 48-hour delay on all administrative functions for security
/// @dev Based on OpenZeppelin TimelockController with RubySwap-specific configuration
contract RubySwapTimelock is TimelockController {
    /// @notice Minimum delay for administrative operations (48 hours)
    uint256 public constant MIN_DELAY = 48 hours;

    /// @notice Emitted when the timelock is deployed
    /// @param minDelay The minimum delay for operations
    /// @param proposers The initial proposers
    /// @param executors The initial executors
    event TimelockDeployed(
        uint256 minDelay,
        address[] proposers,
        address[] executors
    );

    /// @notice Deploys the RubySwap timelock with 48-hour minimum delay
    /// @param proposers Array of addresses that can propose operations
    /// @param executors Array of addresses that can execute operations
    /// @param admin The admin address (can be zero address to renounce admin rights)
    constructor(
        address[] memory proposers,
        address[] memory executors,
        address admin
    ) TimelockController(MIN_DELAY, proposers, executors, admin) {
        emit TimelockDeployed(MIN_DELAY, proposers, executors);
    }

    /// @notice Gets the current minimum delay
    /// @return The minimum delay in seconds
    function getMinDelay() public view virtual override returns (uint256) {
        return MIN_DELAY;
    }

    function _extractSelector(bytes calldata data) private pure returns (bytes4 selector) {
        assembly {
            selector := shr(224, calldataload(add(data.offset, 32)))
        }
    }

    /// @dev Governance protection: prevent executing self role mutations that can lock governance
    function _guard(address target, bytes calldata data) internal view {
        if (target == address(this) && data.length >= 4) {
            bytes4 selector = _extractSelector(data);
            require(
                selector != IAccessControl.renounceRole.selector &&
                selector != IAccessControl.grantRole.selector &&
                selector != IAccessControl.revokeRole.selector,
                "TIMELOCK_SELF_ROLE_OP_FORBIDDEN"
            );
        }
    }

    function schedule(
        address target,
        uint256 value,
        bytes calldata data,
        bytes32 predecessor,
        bytes32 salt,
        uint256 delay
    ) public virtual override {
        // allow scheduling for visibility; guard on execution path
        super.schedule(target, value, data, predecessor, salt, delay);
    }

    function scheduleBatch(
        address[] calldata targets,
        uint256[] calldata values,
        bytes[] calldata payloads,
        bytes32 predecessor,
        bytes32 salt,
        uint256 delay
    ) public virtual override {
        // allow scheduling for visibility; guard on execution path
        super.scheduleBatch(targets, values, payloads, predecessor, salt, delay);
    }

    function execute(
        address target,
        uint256 value,
        bytes calldata data,
        bytes32 predecessor,
        bytes32 salt
    ) public payable virtual override {
        _guard(target, data);
        super.execute(target, value, data, predecessor, salt);
    }

    function executeBatch(
        address[] calldata targets,
        uint256[] calldata values,
        bytes[] calldata payloads,
        bytes32 predecessor,
        bytes32 salt
    ) public payable virtual override {
        for (uint256 i = 0; i < targets.length; i++) {
            _guard(targets[i], payloads[i]);
        }
        super.executeBatch(targets, values, payloads, predecessor, salt);
    }
} 