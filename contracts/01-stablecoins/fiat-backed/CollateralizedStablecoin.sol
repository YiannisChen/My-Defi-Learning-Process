// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./SimplePriceOracle.sol";

/**
 * @title CollateralizedStablecoin
 * @dev A simplified collateralized stablecoin implementation where:
 * - Users deposit ETH as collateral
 * - Users can mint stablecoins based on their collateral (overcollateralized)
 * - Users must maintain a minimum collateralization ratio
 * - Users can burn stablecoins to retrieve their collateral
 */
contract CollateralizedStablecoin is
    ERC20,
    ERC20Burnable,
    Pausable,
    AccessControl,
    ReentrancyGuard
{
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant LIQUIDATOR_ROLE = keccak256("LIQUIDATOR_ROLE");

    // The price oracle used to get ETH/USD price
    SimplePriceOracle public priceOracle;

    // Minimum collateralization ratio (150% = 15000)
    uint256 public collateralRatio = 15000;

    // Liquidation threshold (125% = 12500)
    uint256 public liquidationThreshold = 12500;

    // Liquidation penalty (10% = 1000)
    uint256 public liquidationPenalty = 1000;

    // Stability fee (1% = 100)
    uint256 public stabilityFee = 100;

    // Base precision for percentage calculations
    uint256 public constant BASE_PRECISION = 10000;

    // Vault structure to track user's collateral and debt
    struct Vault {
        uint256 collateralAmount; // ETH amount in wei
        uint256 debtAmount; // Stablecoin amount (with 18 decimals)
        uint256 lastFeeUpdate; // Timestamp of last fee update
    }

    // Mapping of user address to their vault
    mapping(address => Vault) public vaults;

    // Total collateral in the system
    uint256 public totalCollateral;

    // Events
    event VaultCreated(
        address indexed owner,
        uint256 collateralAmount,
        uint256 debtAmount
    );
    event CollateralAdded(address indexed owner, uint256 amount);
    event CollateralRemoved(address indexed owner, uint256 amount);
    event DebtCreated(address indexed owner, uint256 amount);
    event DebtRepaid(address indexed owner, uint256 amount);
    event VaultLiquidated(
        address indexed owner,
        address indexed liquidator,
        uint256 debtRepaid,
        uint256 collateralLiquidated
    );
    event ParameterUpdated(string parameter, uint256 value);

    /**
     * @dev Constructor that sets up the initial configuration
     * @param admin Address that will have admin privileges
     * @param _priceOracle Address of the price oracle
     */
    constructor (
        address admin,
        address _priceOracle
    ) ERC20("Collateralized USD", "cUSD") {
        priceOracle = SimplePriceOracle(_priceOracle);

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
        _grantRole(LIQUIDATOR_ROLE, admin);
    }

    /**
     * @dev Pauses contract operations
     */
    function pause() public onlyRole(PAUSER_ROLE) {
        _pause();
    }

    /**
     * @dev Unpauses contract operations
     */
    function unpause() public onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    /**
     * @dev Update system parameters
     * @param newCollateralRatio New collateralization ratio
     * @param newLiquidationThreshold New liquidation threshold
     * @param newLiquidationPenalty New liquidation penalty
     * @param newStabilityFee New stability fee
     */
    function updateParameters(
        uint256 newCollateralRatio,
        uint256 newLiquidationThreshold,
        uint256 newLiquidationPenalty,
        uint256 newStabilityFee
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(
            newCollateralRatio > newLiquidationThreshold,
            "Collateral ratio must be greater than liquidation threshold"
        );

        collateralRatio = newCollateralRatio;
        emit ParameterUpdated("collateralRatio", newCollateralRatio);

        liquidationThreshold = newLiquidationThreshold;
        emit ParameterUpdated("liquidationThreshold", newLiquidationThreshold);

        liquidationPenalty = newLiquidationPenalty;
        emit ParameterUpdated("liquidationPenalty", newLiquidationPenalty);

        stabilityFee = newStabilityFee;
        emit ParameterUpdated("stabilityFee", newStabilityFee);
    }

    /**
     * @dev Create a new vault or add collateral to an existing one
     */
    function createVault() external payable whenNotPaused {
        Vault storage vault = vaults[msg.sender];

        // Update vault
        vault.collateralAmount += msg.value;
        vault.lastFeeUpdate = block.timestamp;

        // Update total collateral
        totalCollateral += msg.value;

        emit VaultCreated(msg.sender, msg.value, 0);
    }

    /**
     * @dev Add more collateral to an existing vault
     */
    function addCollateral() external payable whenNotPaused {
        Vault storage vault = vaults[msg.sender];
        require(
            vault.collateralAmount > 0 || msg.value > 0,
            "No existing vault and no collateral sent"
        );

        // Apply stability fee before modifying the vault
        _applyStabilityFee(msg.sender);

        // Update vault
        vault.collateralAmount += msg.value;

        // Update total collateral
        totalCollateral += msg.value;

        emit CollateralAdded(msg.sender, msg.value);
    }

    /**
     * @dev Generate stablecoins against deposited collateral
     * @param amount Amount of stablecoins to generate
     */
    function generateDebt(uint256 amount) external whenNotPaused nonReentrant {
        Vault storage vault = vaults[msg.sender];
        require(vault.collateralAmount > 0, "No collateral deposited");

        // Apply stability fee before modifying the vault
        _applyStabilityFee(msg.sender);

        // Calculate max debt allowed
        uint256 maxDebt = _calculateMaxDebt(msg.sender);
        require(
            vault.debtAmount + amount <= maxDebt,
            "Insufficient collateral for requested debt"
        );

        // Update vault
        vault.debtAmount += amount;

        // Mint stablecoins to the user
        _mint(msg.sender, amount);

        emit DebtCreated(msg.sender, amount);
    }

    /**
     * @dev Repay debt and get collateral back
     * @param debtAmount Amount of debt to repay
     */
    function repayDebt(uint256 debtAmount) external whenNotPaused nonReentrant {
        Vault storage vault = vaults[msg.sender];
        require(vault.debtAmount > 0, "No debt to repay");
        require(debtAmount <= vault.debtAmount, "Amount exceeds debt");

        // Apply stability fee before modifying the vault
        _applyStabilityFee(msg.sender);

        // Burn stablecoins from the user
        _burn(msg.sender, debtAmount);

        // Update vault
        vault.debtAmount -= debtAmount;

        emit DebtRepaid(msg.sender, debtAmount);
    }

    /**
     * @dev Withdraw collateral if there's enough remaining
     * @param collateralAmount Amount of collateral to withdraw (in wei)
     */
    function withdrawCollateral(
        uint256 collateralAmount
    ) external whenNotPaused nonReentrant {
        Vault storage vault = vaults[msg.sender];
        require(
            vault.collateralAmount >= collateralAmount,
            "Insufficient collateral"
        );

        // Apply stability fee before modifying the vault
        _applyStabilityFee(msg.sender);

        // Check if remaining collateral is sufficient for the debt
        uint256 remainingCollateral = vault.collateralAmount - collateralAmount;
        if (vault.debtAmount > 0) {
            uint256 collateralValueInUsd = _getCollateralValue(
                remainingCollateral
            );
            uint256 minRequiredCollateral = (vault.debtAmount *
                collateralRatio) / BASE_PRECISION;

            require(
                collateralValueInUsd >= minRequiredCollateral,
                "Withdrawal would put vault below collateral ratio"
            );
        }

        // Update vault
        vault.collateralAmount -= collateralAmount;

        // Update total collateral
        totalCollateral -= collateralAmount;

        // Transfer ETH back to the user
        (bool success, ) = payable(msg.sender).call{value: collateralAmount}(
            ""
        );
        require(success, "ETH transfer failed");

        emit CollateralRemoved(msg.sender, collateralAmount);
    }

    /**
     * @dev Liquidate an undercollateralized vault
     * @param owner Address of the vault owner
     * @param debtAmount Amount of debt to repay and liquidate
     */
    function liquidate(
        address owner,
        uint256 debtAmount
    ) external whenNotPaused nonReentrant {
        Vault storage vault = vaults[owner];
        require(vault.debtAmount > 0, "No debt to liquidate");
        require(debtAmount <= vault.debtAmount, "Amount exceeds debt");

        // Apply stability fee before liquidation
        _applyStabilityFee(owner);

        // Check if the vault is undercollateralized
        uint256 collateralValueInUsd = _getCollateralValue(
            vault.collateralAmount
        );
        uint256 minRequiredCollateral = (vault.debtAmount *
            liquidationThreshold) / BASE_PRECISION;

        require(
            collateralValueInUsd < minRequiredCollateral,
            "Vault is not undercollateralized"
        );

        // Calculate collateral to liquidate
        uint256 baseCollateralToLiquidate = priceOracle.usdToEth(debtAmount);
        uint256 liquidationBonus = (baseCollateralToLiquidate *
            liquidationPenalty) / BASE_PRECISION;
        uint256 collateralToLiquidate = baseCollateralToLiquidate +
            liquidationBonus;

        // Make sure we don't liquidate more than available
        if (collateralToLiquidate > vault.collateralAmount) {
            collateralToLiquidate = vault.collateralAmount;
        }

        // Burn stablecoins from the liquidator
        _burn(msg.sender, debtAmount);

        // Update vault
        vault.debtAmount -= debtAmount;
        vault.collateralAmount -= collateralToLiquidate;

        // Update total collateral
        totalCollateral -= collateralToLiquidate;

        // Transfer liquidated collateral to the liquidator
        (bool success, ) = payable(msg.sender).call{
            value: collateralToLiquidate
        }("");
        require(success, "ETH transfer failed");

        emit VaultLiquidated(
            owner,
            msg.sender,
            debtAmount,
            collateralToLiquidate
        );
    }

    /**
     * @dev Calculate the current collateralization ratio of a vault
     * @param owner Address of the vault owner
     * @return ratio Current collateralization ratio (scaled by BASE_PRECISION)
     */
    function getCurrentRatio(address owner) public view returns (uint256) {
        Vault storage vault = vaults[owner];
        if (vault.debtAmount == 0) return type(uint256).max; // If no debt, return max value

        uint256 collateralValueInUsd = _getCollateralValue(
            vault.collateralAmount
        );
        return (collateralValueInUsd * BASE_PRECISION) / vault.debtAmount;
    }

    /**
     * @dev Check if a vault is eligible for liquidation
     * @param owner Address of the vault owner
     * @return bool True if the vault can be liquidated
     */
    function canLiquidate(address owner) external view returns (bool) {
        uint256 ratio = getCurrentRatio(owner);
        return ratio < liquidationThreshold;
    }

    /**
     * @dev Get summary information about a vault
     * @param owner Address of the vault owner
     * @return collateral Collateral amount in the vault (wei)
     * @return debt Debt amount in the vault (stablecoin units)
     * @return ratio Current collateralization ratio
     * @return maxDebt Maximum debt possible with current collateral
     */
    function getVaultSummary(
        address owner
    )
        external
        view
        returns (
            uint256 collateral,
            uint256 debt,
            uint256 ratio,
            uint256 maxDebt
        )
    {
        Vault storage vault = vaults[owner];
        collateral = vault.collateralAmount;
        debt = vault.debtAmount;
        ratio = getCurrentRatio(owner);
        maxDebt = _calculateMaxDebt(owner);
    }

    /**
     * @dev Calculate maximum debt possible for a vault based on current collateral
     * @param owner Address of the vault owner
     * @return maxDebt Maximum debt amount possible
     */
    function _calculateMaxDebt(address owner) internal view returns (uint256) {
        Vault storage vault = vaults[owner];
        uint256 collateralValueInUsd = _getCollateralValue(
            vault.collateralAmount
        );
        return (collateralValueInUsd * BASE_PRECISION) / collateralRatio;
    }

    /**
     * @dev Apply the stability fee to a vault
     * @param owner Address of the vault owner
     */
    function _applyStabilityFee(address owner) internal {
        Vault storage vault = vaults[owner];
        if (vault.debtAmount == 0) {
            vault.lastFeeUpdate = block.timestamp;
            return;
        }

        // Calculate time since last update in years (approximation)
        uint256 secondsSinceLastUpdate = block.timestamp - vault.lastFeeUpdate;
        if (secondsSinceLastUpdate == 0) return;

        // Use simple interest for educational purposes
        // In a real system, we would use compound interest
        uint256 feeAmount = (vault.debtAmount *
            stabilityFee *
            secondsSinceLastUpdate) / (BASE_PRECISION * 365 days);

        if (feeAmount > 0) {
            vault.debtAmount += feeAmount;
            // We mint to the contract itself (or could be a designated fee collector)
            _mint(address(this), feeAmount);
        }

        vault.lastFeeUpdate = block.timestamp;
    }

    /**
     * @dev Get the USD value of a certain amount of collateral
     * @param collateralAmount Amount of collateral in wei
     * @return usdValue USD value with 18 decimals (stablecoin units)
     */
    function _getCollateralValue(
        uint256 collateralAmount
    ) internal view returns (uint256) {
        return priceOracle.ethToUsd(collateralAmount);
    }

    /**
     * @dev Internal function to check token transfers while paused
     * the _beforeTokenTransfer function has been depreciated , and use _update instead
     */
    function _update(
    address from,
    address to,
    uint256 amount
) internal override whenNotPaused {
    super._update(from, to, amount);
}
}
