// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;


interface IRubySwapV3FlashCallback {
    function rubySwapV3FlashCallback(
        uint256 fee0,
        uint256 fee1,
        bytes calldata data
    ) external;
} 