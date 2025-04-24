// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../RubyswapV2ERC20.sol";


contract ERC20 is RubyswapV2ERC20 {
  
    function mint(address to, uint value) external {
        _mint(to, value);
    }
    

    function burn(address from, uint value) external {
        _burn(from, value);
    }
}