// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.24;

interface ILimitOrderManager {
	// ===== Structs =====
	struct OrderParams {
		address tokenIn;
		address tokenOut;
		uint24 fee;
		uint160 sqrtPriceLimitX96; // optional
		uint256 amountIn; // exact input
		uint256 minAmountOut; // slippage bound
		uint256 expiry; // unix ts
		uint256 prepaidFee; // in feeToken units (e.g., USDC)
	}

	struct Order {
		address maker;
		address tokenIn;
		address tokenOut;
		uint24 fee;
		uint160 sqrtPriceLimitX96;
		uint256 amountIn;
		uint256 minAmountOut;
		uint256 expiry;
		uint256 prepaidFee;
		bool active;
	}

	// ===== Events =====
	event OrderPlaced(uint256 indexed orderId, address indexed maker, address tokenIn, address tokenOut, uint24 fee, uint256 amountIn, uint256 minAmountOut, uint256 expiry, uint256 prepaidFee);
	event OrderCanceled(uint256 indexed orderId, address indexed maker);
	event OrderExecuted(uint256 indexed orderId, address indexed keeper, uint256 amountOut, uint256 keeperFeePaid);
	event FeeReclaimed(uint256 indexed orderId, address indexed maker, uint256 feeAmount);
	event KeeperConfigUpdated(address feeToken, uint256 keeperFixedIncentiveUsd18, uint256 standardExecutionGasUnits, uint256 feeBufferBps);
	event OracleConfigUpdated(address oracleRegistry, bool twapEnabled);
	event RouterUpdated(address router);

	// ===== Errors =====
	error InvalidParams();
	error OrderNotActive();
	error OrderExpired();
	error SafeModeActive();
	error NotMaker();
	error PriceNotMet();
	error InsufficientEscrow();

	// ===== Views =====
	function getOrder(uint256 orderId) external view returns (Order memory);
	function getUserOrders(address maker) external view returns (uint256[] memory);
	function isActive(uint256 orderId) external view returns (bool);
	function feesConfig() external view returns (address feeToken, uint256 keeperFixedIncentiveUsd18, uint256 standardExecutionGasUnits);
	function estimateExecutionGas(Order calldata order) external view returns (uint256);

	// ===== Mutations =====
	function placeOrder(OrderParams calldata params) external returns (uint256 orderId);
	function cancelOrder(uint256 orderId) external;
	function reclaimFee(uint256 orderId) external;
	function executeOrder(uint256 orderId) external;
	function topUpFee(uint256 orderId, uint256 amount) external;
} 