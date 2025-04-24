// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IRubyswapV2Callee {
    function rubyswapV2Call(
        address sender,
        uint amount0,
        uint amount1,
        bytes calldata data
    ) external;
}
