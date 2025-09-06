// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.24;

interface IRubySwapV3MintCallback {
    function rubySwapV3MintCallback(
        uint256 amount0Owed,
        uint256 amount1Owed,
        bytes calldata data
    ) external;
} 