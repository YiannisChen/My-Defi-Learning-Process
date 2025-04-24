// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "contracts/03-dexV2-clone/core-contracts/interfaces/IRubyswapV2Factory.sol";
import "contracts/03-dexV2-clone/core-contracts/interfaces/IRubyswapV2Pair.sol";
import "./interfaces/IERC20.sol";
import "./interfaces/IWETH.sol";
import "./libraries/RubyswapV2Library.sol";

contract RubyswapV2Router {
    address public immutable factory;
    address public immutable WETH;

    // Used to prevent transactions after deadline
    modifier ensure(uint deadline) {
        require(deadline >= block.timestamp, 'RubyswapV2Router: EXPIRED');
        _;
    }

    constructor(address _factory, address _WETH) {
        factory = _factory;
        WETH = _WETH;
    }

    // **** ADD LIQUIDITY ****
    function _addLiquidity(
        address tokenA,
        address tokenB,
        uint amountADesired,
        uint amountBDesired,
        uint amountAMin,
        uint amountBMin
    ) internal virtual returns (uint amountA, uint amountB) {
        // Create the pair if it doesn't exist yet
        if (IRubyswapV2Factory(factory).getPair(tokenA, tokenB) == address(0)) {
            IRubyswapV2Factory(factory).createPair(tokenA, tokenB);
        }
        (uint reserveA, uint reserveB) = RubyswapV2Library.getReserves(factory, tokenA, tokenB);
        if (reserveA == 0 && reserveB == 0) {
            (amountA, amountB) = (amountADesired, amountBDesired);
        } else {
            uint amountBOptimal = RubyswapV2Library.quote(amountADesired, reserveA, reserveB);
            if (amountBOptimal <= amountBDesired) {
                require(amountBOptimal >= amountBMin, 'RubyswapV2Router: INSUFFICIENT_B_AMOUNT');
                (amountA, amountB) = (amountADesired, amountBOptimal);
            } else {
                uint amountAOptimal = RubyswapV2Library.quote(amountBDesired, reserveB, reserveA);
                assert(amountAOptimal <= amountADesired);
                require(amountAOptimal >= amountAMin, 'RubyswapV2Router: INSUFFICIENT_A_AMOUNT');
                (amountA, amountB) = (amountAOptimal, amountBDesired);
            }
        }
    }

    function addLiquidity(
        address tokenA,
        address tokenB,
        uint amountADesired,
        uint amountBDesired,
        uint amountAMin,
        uint amountBMin,
        address to,
        uint deadline
    ) external virtual ensure(deadline) returns (uint amountA, uint amountB, uint liquidity) {
        (amountA, amountB) = _addLiquidity(tokenA, tokenB, amountADesired, amountBDesired, amountAMin, amountBMin);
        address pair = RubyswapV2Library.pairFor(factory, tokenA, tokenB);
        IERC20(tokenA).transferFrom(msg.sender, pair, amountA);
        IERC20(tokenB).transferFrom(msg.sender, pair, amountB);
        liquidity = IRubyswapV2Pair(pair).mint(to);
    }

    function addLiquidityETH(
        address token,
        uint amountTokenDesired,
        uint amountTokenMin,
        uint amountETHMin,
        address to,
        uint deadline
    ) external virtual payable ensure(deadline) returns (uint amountToken, uint amountETH, uint liquidity) {
        (amountToken, amountETH) = _addLiquidity(
            token,
            WETH,
            amountTokenDesired,
            msg.value,
            amountTokenMin,
            amountETHMin
        );
        address pair = RubyswapV2Library.pairFor(factory, token, WETH);
        IERC20(token).transferFrom(msg.sender, pair, amountToken);
        IWETH(WETH).deposit{value: amountETH}();
        IWETH(WETH).transfer(pair, amountETH);
        liquidity = IRubyswapV2Pair(pair).mint(to);
        // Refund dust ETH, if any
        if (msg.value > amountETH) {
            (bool success,) = msg.sender.call{value: msg.value - amountETH}("");
            require(success, 'RubyswapV2Router: ETH_TRANSFER_FAILED');
        }
    }

    // **** REMOVE LIQUIDITY ****
    function removeLiquidity(
        address tokenA,
        address tokenB,
        uint liquidity,
        uint amountAMin,
        uint amountBMin,
        address to,
        uint deadline
    ) public virtual ensure(deadline) returns (uint amountA, uint amountB) {
        address pair = RubyswapV2Library.pairFor(factory, tokenA, tokenB);
        IRubyswapV2Pair(pair).transferFrom(msg.sender, pair, liquidity); // Send liquidity to pair
        (uint amount0, uint amount1) = IRubyswapV2Pair(pair).burn(to);
        (address token0,) = RubyswapV2Library.sortTokens(tokenA, tokenB);
        (amountA, amountB) = tokenA == token0 ? (amount0, amount1) : (amount1, amount0);
        require(amountA >= amountAMin, 'RubyswapV2Router: INSUFFICIENT_A_AMOUNT');
        require(amountB >= amountBMin, 'RubyswapV2Router: INSUFFICIENT_B_AMOUNT');
    }

    function removeLiquidityETH(
        address token,
        uint liquidity,
        uint amountTokenMin,
        uint amountETHMin,
        address to,
        uint deadline
    ) public virtual ensure(deadline) returns (uint amountToken, uint amountETH) {
        (amountToken, amountETH) = removeLiquidity(
            token,
            WETH,
            liquidity,
            amountTokenMin,
            amountETHMin,
            address(this),
            deadline
        );
        IERC20(token).transfer(to, amountToken);
        IWETH(WETH).withdraw(amountETH);
        (bool success,) = to.call{value: amountETH}("");
        require(success, 'RubyswapV2Router: ETH_TRANSFER_FAILED');
    }

    // **** SWAP ****
    // Requires the initial amount to have already been sent to the first pair
    function _swap(uint[] memory amounts, address[] memory path, address _to) internal virtual {
        for (uint i; i < path.length - 1; i++) {
            (address input, address output) = (path[i], path[i + 1]);
            (address token0,) = RubyswapV2Library.sortTokens(input, output);
            uint amountOut = amounts[i + 1];
            (uint amount0Out, uint amount1Out) = input == token0 ? (uint(0), amountOut) : (amountOut, uint(0));
            address to = i < path.length - 2 ? RubyswapV2Library.pairFor(factory, output, path[i + 2]) : _to;
            IRubyswapV2Pair(RubyswapV2Library.pairFor(factory, input, output)).swap(
                amount0Out, amount1Out, to, new bytes(0)
            );
        }
    }

    function swapExactTokensForTokens(
        uint amountIn,
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    ) external virtual ensure(deadline) returns (uint[] memory amounts) {
        amounts = RubyswapV2Library.getAmountsOut(factory, amountIn, path);
        require(amounts[amounts.length - 1] >= amountOutMin, 'RubyswapV2Router: INSUFFICIENT_OUTPUT_AMOUNT');
        IERC20(path[0]).transferFrom(
            msg.sender, RubyswapV2Library.pairFor(factory, path[0], path[1]), amounts[0]
        );
        _swap(amounts, path, to);
    }

    function swapTokensForExactTokens(
        uint amountOut,
        uint amountInMax,
        address[] calldata path,
        address to,
        uint deadline
    ) external virtual ensure(deadline) returns (uint[] memory amounts) {
        amounts = RubyswapV2Library.getAmountsIn(factory, amountOut, path);
        require(amounts[0] <= amountInMax, 'RubyswapV2Router: EXCESSIVE_INPUT_AMOUNT');
        IERC20(path[0]).transferFrom(
            msg.sender, RubyswapV2Library.pairFor(factory, path[0], path[1]), amounts[0]
        );
        _swap(amounts, path, to);
    }

    function swapExactETHForTokens(
        uint amountOutMin, 
        address[] calldata path,
        address to,
        uint deadline
    ) external virtual payable ensure(deadline) returns (uint[] memory amounts) {
        require(path[0] == WETH, 'RubyswapV2Router: INVALID_PATH');
        amounts = RubyswapV2Library.getAmountsOut(factory, msg.value, path);
        require(amounts[amounts.length - 1] >= amountOutMin, 'RubyswapV2Router: INSUFFICIENT_OUTPUT_AMOUNT');
        IWETH(WETH).deposit{value: amounts[0]}();
        IWETH(WETH).transfer(RubyswapV2Library.pairFor(factory, path[0], path[1]), amounts[0]);
        _swap(amounts, path, to);
    }

    function swapTokensForExactETH(
        uint amountOut,
        uint amountInMax,
        address[] calldata path,
        address to,
        uint deadline
    ) external virtual ensure(deadline) returns (uint[] memory amounts) {
        require(path[path.length - 1] == WETH, 'RubyswapV2Router: INVALID_PATH');
        amounts = RubyswapV2Library.getAmountsIn(factory, amountOut, path);
        require(amounts[0] <= amountInMax, 'RubyswapV2Router: EXCESSIVE_INPUT_AMOUNT');
        IERC20(path[0]).transferFrom(
            msg.sender, RubyswapV2Library.pairFor(factory, path[0], path[1]), amounts[0]
        );
        _swap(amounts, path, address(this));
        IWETH(WETH).withdraw(amounts[amounts.length - 1]);
        (bool success,) = to.call{value: amounts[amounts.length - 1]}("");
        require(success, 'RubyswapV2Router: ETH_TRANSFER_FAILED');
    }

    function swapExactTokensForETH(
        uint amountIn,
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    ) external virtual ensure(deadline) returns (uint[] memory amounts) {
        require(path[path.length - 1] == WETH, 'RubyswapV2Router: INVALID_PATH');
        amounts = RubyswapV2Library.getAmountsOut(factory, amountIn, path);
        require(amounts[amounts.length - 1] >= amountOutMin, 'RubyswapV2Router: INSUFFICIENT_OUTPUT_AMOUNT');
        IERC20(path[0]).transferFrom(
            msg.sender, RubyswapV2Library.pairFor(factory, path[0], path[1]), amounts[0]
        );
        _swap(amounts, path, address(this));
        IWETH(WETH).withdraw(amounts[amounts.length - 1]);
        (bool success,) = to.call{value: amounts[amounts.length - 1]}("");
        require(success, 'RubyswapV2Router: ETH_TRANSFER_FAILED');
    }

    function swapETHForExactTokens(
        uint amountOut,
        address[] calldata path,
        address to,
        uint deadline
    ) external virtual payable ensure(deadline) returns (uint[] memory amounts) {
        require(path[0] == WETH, 'RubyswapV2Router: INVALID_PATH');
        amounts = RubyswapV2Library.getAmountsIn(factory, amountOut, path);
        require(amounts[0] <= msg.value, 'RubyswapV2Router: EXCESSIVE_INPUT_AMOUNT');
        IWETH(WETH).deposit{value: amounts[0]}();
        IWETH(WETH).transfer(RubyswapV2Library.pairFor(factory, path[0], path[1]), amounts[0]);
        _swap(amounts, path, to);
        // Refund dust ETH, if any
        if (msg.value > amounts[0]) {
            (bool success,) = msg.sender.call{value: msg.value - amounts[0]}("");
            require(success, 'RubyswapV2Router: ETH_TRANSFER_FAILED');
        }
    }

    // **** LIBRARY FUNCTIONS ****
    function quote(uint amountA, uint reserveA, uint reserveB) public pure virtual returns (uint amountB) {
        return RubyswapV2Library.quote(amountA, reserveA, reserveB);
    }

    function getAmountOut(uint amountIn, uint reserveIn, uint reserveOut) public pure virtual returns (uint amountOut) {
        return RubyswapV2Library.getAmountOut(amountIn, reserveIn, reserveOut);
    }

    function getAmountIn(uint amountOut, uint reserveIn, uint reserveOut) public pure virtual returns (uint amountIn) {
        return RubyswapV2Library.getAmountIn(amountOut, reserveIn, reserveOut);
    }

    function getAmountsOut(uint amountIn, address[] memory path) public view virtual returns (uint[] memory amounts) {
        return RubyswapV2Library.getAmountsOut(factory, amountIn, path);
    }

    function getAmountsIn(uint amountOut, address[] memory path) public view virtual returns (uint[] memory amounts) {
        return RubyswapV2Library.getAmountsIn(factory, amountOut, path);
    }

    // Receive ETH for WETH.withdraw
    receive() external payable {}
}