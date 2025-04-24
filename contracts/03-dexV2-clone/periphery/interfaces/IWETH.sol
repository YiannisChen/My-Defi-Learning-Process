// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IWETH {
    function deposit() external payable;
    function withdraw(uint) external;
    function balanceOf(address account) external view returns (uint);
    function transfer(address to, uint value) external returns (bool);
}
