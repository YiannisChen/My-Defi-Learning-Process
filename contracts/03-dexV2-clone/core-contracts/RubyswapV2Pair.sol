// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.0;

import "./RubyswapV2ERC20.sol";
import "./interfaces/IRubyswapV2Pair.sol";
import "./libraries/Math.sol";
import "../periphery/interfaces/IERC20.sol";
import "./interfaces/IRubyswapV2Factory.sol";
import "./interfaces/IRubyswapV2Callee.sol";

contract RubyswapV2Pair is IRubyswapV2Pair, RubyswapV2ERC20 {
    uint public constant MINIMUM_LIQUIDITY = 10 ** 3;
    bytes4 private constant SELECTOR =
        bytes4(keccak256(bytes("transfer(address,uint256)")));

    address public factory;
    address public token0;
    address public token1;

    uint private reserve0;
    uint private reserve1;
    uint32 private blockTimestampLast; // uses single storage slot, accessible via getReserves

    uint private unlocked = 1;

    modifier lock() {
        require(unlocked == 1, "RubyswapV2: LOCKED");
        unlocked = 0;
        _;
        unlocked = 1;
    }

    function getReserves()
        public
        view
        returns (uint _reserve0, uint _reserve1, uint32 _blockTimestampLast)
    {
        _reserve0 = reserve0;
        _reserve1 = reserve1;
        _blockTimestampLast = blockTimestampLast;
    }

    function _safeTransfer(address token, address to, uint value) private {
        (bool success, bytes memory data) = token.call(
            abi.encodeWithSelector(SELECTOR, to, value)
        );
        require(
            success && (data.length == 0 || abi.decode(data, (bool))),
            "RubyswapV2: TRANSFER_FAILED"
        );
    }

    constructor() {
        factory = msg.sender; // Initial setting to allow initialization by either factory or direct deployment
    }

    // called once by the factory at time of deployment
    function initialize(address _token0, address _token1) external {
        require(
            token0 == address(0) && token1 == address(0),
            "RubyswapV2: ALREADY_INITIALIZED"
        );
        token0 = _token0;
        token1 = _token1;
    }

    // update reserves and, on the first call per block, price accumulators
    function _update(
        uint balance0,
        uint balance1,
        uint _reserve0,
        uint _reserve1
    ) private {
        uint32 blockTimestamp = uint32(block.timestamp % 2 ** 32);
        uint32 timeElapsed = blockTimestamp - blockTimestampLast; // overflow is desired

        reserve0 = balance0;
        reserve1 = balance1;
        blockTimestampLast = blockTimestamp;
    }

    // this low-level function should be called from a contract which performs important safety checks
    function mint(address to) external lock returns (uint liquidity) {
        (uint _reserve0, uint _reserve1, ) = getReserves(); // gas savings
        uint balance0 = IERC20(token0).balanceOf(address(this));
        uint balance1 = IERC20(token1).balanceOf(address(this));

        // Updated from SafeMath to standard operators
        uint amount0 = balance0 - _reserve0;
        uint amount1 = balance1 - _reserve1;

        uint _totalSupply = totalSupply; // gas savings
        if (_totalSupply == 0) {
            // Use the standard sqrt on the product of the amounts
            uint product = amount0 * amount1;
            require(product > 0, "RubyswapV2: ZERO_AMOUNTS"); // Ensure product isn't zero before sqrt
            uint sqrt_product = Math.sqrt(product);
            require(
                sqrt_product > MINIMUM_LIQUIDITY,
                "RubyswapV2: SQRT_LT_MIN_LIQUIDITY"
            ); // Check before subtracting
            liquidity = sqrt_product - MINIMUM_LIQUIDITY;
            _mint(address(0), MINIMUM_LIQUIDITY); // permanently lock the first MINIMUM_LIQUIDITY tokens
        } else {
            // This part should be okay now with uint256 reserves
            require(
                _reserve0 > 0 && _reserve1 > 0,
                "RubyswapV2: ZERO_RESERVES"
            ); // Add check for division by zero
            liquidity = Math.min(
                (amount0 * _totalSupply) / _reserve0,
                (amount1 * _totalSupply) / _reserve1
            );
        }
        require(liquidity > 0, "RubyswapV2: INSUFFICIENT_LIQUIDITY_MINTED");
        _mint(to, liquidity);

        _update(balance0, balance1, _reserve0, _reserve1);

        emit Mint(msg.sender, amount0, amount1);
    }

    // this low-level function should be called from a contract which performs important safety checks
    function burn(
        address to
    ) external lock returns (uint amount0, uint amount1) {
        (uint _reserve0, uint _reserve1, ) = getReserves(); // gas savings
        address _token0 = token0; // gas savings
        address _token1 = token1; // gas savings
        uint balance0 = IERC20(_token0).balanceOf(address(this));
        uint balance1 = IERC20(_token1).balanceOf(address(this));
        uint liquidity = balanceOf[address(this)];

        uint _totalSupply = totalSupply; // gas savings

        // Updated from SafeMath to standard operators
        amount0 = (liquidity * balance0) / _totalSupply; // using balances ensures pro-rata distribution
        amount1 = (liquidity * balance1) / _totalSupply; // using balances ensures pro-rata distribution

        require(
            amount0 > 0 && amount1 > 0,
            "RubyswapV2: INSUFFICIENT_LIQUIDITY_BURNED"
        );
        _burn(address(this), liquidity);
        _safeTransfer(_token0, to, amount0);
        _safeTransfer(_token1, to, amount1);
        balance0 = IERC20(_token0).balanceOf(address(this));
        balance1 = IERC20(_token1).balanceOf(address(this));

        _update(balance0, balance1, _reserve0, _reserve1);

        emit Burn(msg.sender, amount0, amount1, to);
    }

    // this low-level function should be called from a contract which performs important safety checks
    function swap(
        uint amount0Out,
        uint amount1Out,
        address to,
        bytes calldata data
    ) external lock {
        require(
            amount0Out > 0 || amount1Out > 0,
            "RubyswapV2: INSUFFICIENT_OUTPUT_AMOUNT"
        );
        (uint _reserve0, uint _reserve1, ) = getReserves(); // gas savings
        require(
            amount0Out < _reserve0 && amount1Out < _reserve1,
            "RubyswapV2: INSUFFICIENT_LIQUIDITY"
        );

        uint balance0;
        uint balance1;
        {
            // scope for _token{0,1}, avoids stack too deep errors
            address _token0 = token0;
            address _token1 = token1;
            require(to != _token0 && to != _token1, "RubyswapV2: INVALID_TO");
            if (amount0Out > 0) _safeTransfer(_token0, to, amount0Out); // optimistically transfer tokens
            if (amount1Out > 0) _safeTransfer(_token1, to, amount1Out); // optimistically transfer tokens

            // Updated callback interface name from uniswapV2Call to rubyswapV2Call
            if (data.length > 0)
                IRubyswapV2Callee(to).rubyswapV2Call(
                    msg.sender,
                    amount0Out,
                    amount1Out,
                    data
                );

            balance0 = IERC20(_token0).balanceOf(address(this));
            balance1 = IERC20(_token1).balanceOf(address(this));
        }

        // Updated from SafeMath to standard operators
        uint amount0In = balance0 > _reserve0 - amount0Out
            ? balance0 - (_reserve0 - amount0Out)
            : 0;
        uint amount1In = balance1 > _reserve1 - amount1Out
            ? balance1 - (_reserve1 - amount1Out)
            : 0;

        require(
            amount0In > 0 || amount1In > 0,
            "RubyswapV2: INSUFFICIENT_INPUT_AMOUNT"
        );

        {
            // scope for reserve{0,1}Adjusted, avoids stack too deep errors
            // Updated from SafeMath to standard operators
            uint balance0Adjusted = balance0 * 1000 - amount0In * 3;
            uint balance1Adjusted = balance1 * 1000 - amount1In * 3;
            require(
                balance0Adjusted * balance1Adjusted >=
                    uint(_reserve0) * _reserve1 * (1000 ** 2),
                "RubyswapV2: K"
            );
        }

        _update(balance0, balance1, _reserve0, _reserve1);
        emit Swap(msg.sender, amount0In, amount1In, amount0Out, amount1Out, to);
    }

    // force balances to match reserves
    function skim(address to) external lock {
        address _token0 = token0; // gas savings
        address _token1 = token1; // gas savings
        _safeTransfer(
            _token0,
            to,
            IERC20(_token0).balanceOf(address(this)) - reserve0
        );
        _safeTransfer(
            _token1,
            to,
            IERC20(_token1).balanceOf(address(this)) - reserve1
        );
    }

    // force reserves to match balances
    function sync() external lock {
        _update(
            IERC20(token0).balanceOf(address(this)),
            IERC20(token1).balanceOf(address(this)),
            reserve0,
            reserve1
        );
    }
}
