// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.24;

import "./BitMath.sol";

/// @title Packed tick initialized state library (RubySwap)
/// @notice Stores a packed mapping of tick index to its initialized state
/// @dev The mapping uses int16 for keys since ticks are represented as int24 and there are 256 (2^8) values per word.
library TickBitmap {
	/// @notice Computes the position in the mapping where the initialized bit for a tick lives
	/// @param tick The tick for which to compute the position
	/// @return wordPos The key in the mapping containing the word in which the bit is stored
	/// @return bitPos The bit position in the word where the flag is stored
	function position(int24 tick) private pure returns (int16 wordPos, uint8 bitPos) {
		wordPos = int16(tick >> 8);
		bitPos = uint8(uint24(tick) & 0xFF);
	}

	/// @notice Flips the initialized state for a given tick from false to true, or vice versa
	/// @param self The mapping in which to flip the tick
	/// @param tick The tick to flip
	/// @param tickSpacing The spacing between usable ticks
	function flipTick(
		mapping(int16 => uint256) storage self,
		int24 tick,
		int24 tickSpacing
	) internal {
		require(tick % tickSpacing == 0); // ensure that the tick is spaced
		(int16 wordPos, uint8 bitPos) = position(tick / tickSpacing);
		uint256 mask = 1 << bitPos;
		self[wordPos] ^= mask;
	}

	/// @notice Returns the next initialized tick contained in the same word (or adjacent word) as the tick that is either
	/// to the left (less than or equal to) or right (greater than) of the given tick
	/// @param self The mapping in which to compute the next initialized tick
	/// @param tick The starting tick
	/// @param tickSpacing The spacing between usable ticks
	/// @param lte Whether to search for the next initialized tick to the left (less than or equal to the starting tick)
	/// @return next The next initialized or uninitialized tick up to 256 ticks away from the current tick
	/// @return initialized Whether the next tick is initialized, as the function only searches within up to 256 ticks
	function nextInitializedTickWithinOneWord(
		mapping(int16 => uint256) storage self,
		int24 tick,
		int24 tickSpacing,
		bool lte
	) internal view returns (int24 next, bool initialized) {
		int24 compressed = tick / tickSpacing;
		if (tick < 0 && tick % tickSpacing != 0) compressed--; // round towards negative infinity

		if (lte) {
			(int16 wordPos, uint8 bitPos) = position(compressed);
			// all the 1s at or to the right of the current bitPos
			uint256 mask = (1 << bitPos) - 1 + (1 << bitPos);
			uint256 masked = self[wordPos] & mask;

			// if there are no initialized ticks to the right of or at the current tick, return rightmost in the word
			initialized = masked != 0;
			// compute using int24 local variables to avoid disallowed casts
			int24 bitPosInt = int24(int256(uint256(bitPos)));
			int24 msbInt = int24(int256(uint256(BitMath.mostSignificantBit(masked))));
			next = initialized
				? (compressed - (bitPosInt - msbInt)) * tickSpacing
				: (compressed - bitPosInt) * tickSpacing;
		} else {
			// start from the word of the next tick, since the current tick state doesn't matter
			(int16 wordPos, uint8 bitPos) = position(compressed + 1);
			// all the 1s at or to the left of the bitPos
			uint256 mask = ~((1 << bitPos) - 1);
			uint256 masked = self[wordPos] & mask;

			// if there are no initialized ticks to the left of the current tick, return leftmost in the word
			initialized = masked != 0;
			int24 bitPosInt = int24(int256(uint256(bitPos)));
			int24 lsbInt = int24(int256(uint256(BitMath.leastSignificantBit(masked))));
			int24 maxU8Int = int24(int256(uint256(type(uint8).max)));
			next = initialized
				? (compressed + 1 + (lsbInt - bitPosInt)) * tickSpacing
				: (compressed + 1 + (maxU8Int - bitPosInt)) * tickSpacing;
		}
	}
} 