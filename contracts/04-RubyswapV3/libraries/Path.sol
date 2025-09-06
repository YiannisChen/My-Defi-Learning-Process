// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.24;

/// @title Functions for manipulating path data for multihop swaps
library Path {
    uint256 private constant ADDR_SIZE = 20;
    uint256 private constant FEE_SIZE = 3;
    uint256 private constant NEXT_OFFSET = ADDR_SIZE + FEE_SIZE;
    uint256 private constant POP_OFFSET = NEXT_OFFSET + ADDR_SIZE;
    uint256 private constant MULTIPLE_POOLS_MIN_LENGTH = POP_OFFSET + NEXT_OFFSET;

    /// @notice Returns true iff the path contains two or more pools
    /// @param path The encoded swap path
    /// @return True if path contains multiple pools
    function hasMultiplePools(bytes memory path) internal pure returns (bool) {
        return path.length >= MULTIPLE_POOLS_MIN_LENGTH;
    }

    /// @notice Returns the number of pools in the path
    /// @param path The encoded swap path
    /// @return The number of pools in the path
    function numPools(bytes memory path) internal pure returns (uint256) {
        // Subtract the first token address, then count pairs of (fee + token)
        return ((path.length - ADDR_SIZE) / NEXT_OFFSET);
    }

    /// @notice Decodes the first pool in path
    /// @param path The bytes encoded swap path
    /// @return tokenA The first token of the given pool
    /// @return tokenB The second token of the given pool
    /// @return fee The fee level of the pool
    function decodeFirstPool(bytes memory path)
        internal
        pure
        returns (
            address tokenA,
            address tokenB,
            uint24 fee
        )
    {
        tokenA = toAddress(path, 0);
        fee = toUint24(path, ADDR_SIZE);
        tokenB = toAddress(path, NEXT_OFFSET);
    }

    /// @notice Gets the segment corresponding to the first pool in the path
    /// @param path The bytes encoded swap path
    /// @return The segment containing all data necessary to target the first pool in the path
    function getFirstPool(bytes memory path) internal pure returns (bytes memory) {
        return slice(path, 0, POP_OFFSET);
    }

    /// @notice Skips a token + fee element from the buffer and returns the remainder
    /// @param path The swap path
    /// @return The remaining token + fee elements in the path
    function skipToken(bytes memory path) internal pure returns (bytes memory) {
        return slice(path, NEXT_OFFSET, path.length - NEXT_OFFSET);
    }

    /// @notice Returns the address starting at byte `start`
    /// @param data The input bytes string to slice
    /// @param start The starting index of the address
    /// @return The address starting at `start`
    function toAddress(bytes memory data, uint256 start) internal pure returns (address) {
        require(data.length >= start + ADDR_SIZE, "INVALID_ADDRESS");
        address result;
        assembly {
            result := shr(96, mload(add(add(data, 0x20), start)))
        }
        return result;
    }

    /// @notice Returns the uint24 starting at byte `start`
    /// @param data The input bytes string to slice
    /// @param start The starting index of the uint24
    /// @return The uint24 starting at `start`
    function toUint24(bytes memory data, uint256 start) internal pure returns (uint24) {
        require(data.length >= start + FEE_SIZE, "INVALID_FEE");
        uint24 result;
        assembly {
            result := shr(232, mload(add(add(data, 0x20), start)))
        }
        return result;
    }

    /// @notice Returns a slice of the byte string
    /// @param data The input bytes string to slice
    /// @param start The starting index of the slice
    /// @param length The length of the slice
    /// @return The slice of the byte string
    function slice(bytes memory data, uint256 start, uint256 length) internal pure returns (bytes memory) {
        require(start + length <= data.length, "INVALID_SLICE");
        bytes memory result = new bytes(length);
        assembly {
            let src := add(add(data, 0x20), start)
            let dst := add(result, 0x20)
            for { let i := 0 } lt(i, length) { i := add(i, 0x20) } {
                mstore(add(dst, i), mload(add(src, i)))
            }
        }
        return result;
    }
} 