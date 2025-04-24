// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
/**
 * @title Simplified Uniswap V2 Router Interface
 * @dev Key simplifications compared to the original Router01/Router02:(e.g., *SupportingFeeOnTransferTokens)
 * 2. Removed permit functionality for meta-transactions
 * 3. Simplified price calculation utilities (removed quote, getAmountIn, getAmountsIn)
 * 4. Restricted swap paths to direct pairs (path[2] instead of dynamic arrays)
 * 5. Removed redundant swap variants (e.g., exact output swaps)
 * 6. Adapted for Solidity 0.8+ (removed SafeMath, added explicit error handling)
 */
interface IRubyswapV2Router {
    function factory() external view returns (address);
    function WETH() external view returns (address);

    function addLiquidity(
        address tokenA,
        address tokenB,
        uint amountADesired,
        uint amountBDesired,
        uint amountAMin,
        uint amountBMin,
        address to,
        uint deadline
    ) external returns (uint amountA, uint amountB, uint liquidity);

    function addLiquidityETH(
        address token,
        uint amountTokenDesired,
        uint amountTokenMin,
        uint amountETHMin,
        address to,
        uint deadline
    ) external payable returns (uint amountToken, uint amountETH, uint liquidity);

    function removeLiquidity(
        address tokenA,
        address tokenB,
        uint liquidity,
        uint amountAMin,
        uint amountBMin,
        address to,
        uint deadline
    ) external returns (uint amountA, uint amountB);

    function removeLiquidityETH(
        address token,
        uint liquidity,
        uint amountTokenMin,
        uint amountETHMin,
        address to,
        uint deadline
    ) external returns (uint amountToken, uint amountETH);

    function swapExactTokensForTokens(
        uint amountIn,
        uint amountOutMin,
        address[2] calldata path,
        address to,
        uint deadline
    ) external returns (uint[2] memory amounts);

    function swapExactETHForTokens(
        uint amountOutMin,
        address[2] calldata path,
        address to,
        uint deadline
    ) external payable returns (uint[2] memory amounts);

    function swapExactTokensForETH(
        uint amountIn,
        uint amountOutMin,
        address[2] calldata path,
        address to,
        uint deadline
    ) external returns (uint[2] memory amounts);

    function getAmountsOut(
        uint amountIn,
        address[2] calldata path
    ) external view returns (uint[2] memory amounts);
}