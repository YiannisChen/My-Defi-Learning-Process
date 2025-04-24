// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import './ERC20.sol';

contract DeflatingERC20 is ERC20 {
    constructor(uint _totalSupply) ERC20(_totalSupply) {}

    // Transfer with a 1% fee
    function transfer(address to, uint value) external override returns (bool) {
        uint fee = value / 100;  // 1% fee
        balanceOf[msg.sender] = balanceOf[msg.sender] - value;
        balanceOf[to] = balanceOf[to] + (value - fee);
        balanceOf[address(0)] = balanceOf[address(0)] + fee;  // Burn the fee
        totalSupply = totalSupply - fee;  // Reduce total supply
        
        emit Transfer(msg.sender, to, value - fee);
        emit Transfer(msg.sender, address(0), fee);
        return true;
    }

    // TransferFrom with a 1% fee
    function transferFrom(address from, address to, uint value) external override returns (bool) {
        if (allowance[from][msg.sender] != type(uint).max) {
            allowance[from][msg.sender] = allowance[from][msg.sender] - value;
        }
        
        uint fee = value / 100;  // 1% fee
        balanceOf[from] = balanceOf[from] - value;
        balanceOf[to] = balanceOf[to] + (value - fee);
        balanceOf[address(0)] = balanceOf[address(0)] + fee;  // Burn the fee
        totalSupply = totalSupply - fee;  // Reduce total supply
        
        emit Transfer(from, to, value - fee);
        emit Transfer(from, address(0), fee);
        return true;
    }
}