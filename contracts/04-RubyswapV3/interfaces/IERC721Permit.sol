// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";

/// @title ERC721Permit
/// @notice Extends ERC721 with a permit function for approvals via signatures
interface IERC721Permit is IERC721 {
	/// @notice The permit typehash used in the permit signature
	function PERMIT_TYPEHASH() external pure returns (bytes32);

	/// @notice The domain separator used in the permit signature
	function DOMAIN_SEPARATOR() external view returns (bytes32);

	/// @notice Approves `spender` to transfer `tokenId` via EIP-712 signature
	/// @param spender The address to approve
	/// @param tokenId The token ID to approve
	/// @param deadline The time at which the signature expires
	/// @param v The recovery id of the signature
	/// @param r The r component of the signature
	/// @param s The s component of the signature
	function permit(
		address spender,
		uint256 tokenId,
		uint256 deadline,
		uint8 v,
		bytes32 r,
		bytes32 s
	) external payable;
} 