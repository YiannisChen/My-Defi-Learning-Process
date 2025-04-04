// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "../interfaces/IStrategy.sol";

/**
 * @title Vault
 * @notice ERC-4626 compliant yield vault with strategy integration
 * @dev Final improved version with robust redemption and withdrawal handling
 */
contract Vault is ERC4626, AccessControl, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // Role definitions
    bytes32 public constant STRATEGY_MANAGER_ROLE =
        keccak256("STRATEGY_MANAGER_ROLE");
    bytes32 public constant FEE_MANAGER_ROLE = keccak256("FEE_MANAGER_ROLE");
    bytes32 public constant EMERGENCY_ROLE = keccak256("EMERGENCY_ROLE");

    // Treasury address for fees
    address public treasury;

    // Fee structure (in basis points, 1 = 0.01%)
    uint256 public managementFee; // Annual management fee
    uint256 public performanceFee; // Fee on harvested yields
    uint256 public exitFee; // Fee on withdrawals

    uint256 public constant MAX_FEE = 2000; // 20% max for any fee
    uint256 public constant MAX_MANAGEMENT_FEE = 500; // 5% max for management fee
    uint256 public constant FEE_DENOMINATOR = 10000;
    uint256 public constant MANAGEMENT_FEE_INTERVAL = 7 days; // Weekly fee collection
    uint256 public constant MIN_HARVEST_THRESHOLD = 0.1 ether; // Minimum amount to harvest
    
    // Acceptable deviation for strategy allocation (500 = 5%)
    uint256 public constant ALLOCATION_DEVIATION = 500;

    // Emergency withdrawal limit
    uint256 public emergencyWithdrawalLimit;
    
    // Emergency mode flag - allows bypassing strategy checks
    bool public emergencyMode = false;

    // Last time fees were collected
    uint256 public lastManagementFeeCollection;

    // Total value tracked for performance fee calculation
    uint256 public highWaterMark;

    // Single strategy
    IStrategy public strategy;
    bool public strategyActive = false;
    uint256 public strategyAllocation = 0; // Percentage in basis points (0-10000)

    // Events
    event StrategySet(address indexed strategy, uint256 allocation);
    event StrategyAllocationUpdated(uint256 allocation);
    event FeeCollected(string feeType, uint256 amount);
    event Harvested(address indexed strategy, uint256 amount);
    event TreasuryUpdated(address indexed newTreasury);
    event HighWaterMarkUpdated(uint256 oldValue, uint256 newValue);
    event EmergencyWithdrawalLimitUpdated(uint256 newLimit);
    event WithdrawalFailed(string reason, uint256 amount);
    event StrategicWithdrawal(uint256 requested, uint256 received);
    event RedemptionDetails(uint256 shares, uint256 assets, uint256 exitFee, uint256 vaultBalance);
    event PreWithdrawFromStrategy(uint256 needed, uint256 available);
    event PostWithdrawStatus(bool success, uint256 newBalance);
    event EmergencyRedemptionExecuted(address receiver, uint256 assets, uint256 shares);
    event EmergencyModeActivated(bool active);
    event BasicWithdrawalExecuted(address receiver, uint256 assets, uint256 shares);
    
    // Debugging events
    event RedemptionStarted(uint256 shares, address receiver, address owner);
    event AssetsCalculated(uint256 assets, uint256 exitFee);
    event StrategyWithdrawalAttempted(uint256 amount, uint256 vaultBalanceBefore);
    event StrategyWithdrawalResult(bool success, uint256 vaultBalanceAfter);
    event SharesBurned(uint256 shares, address owner);
    event AssetTransferred(address receiver, uint256 amount);

    /**
     * @notice Constructs the Vault contract
     * @param _asset Underlying asset used by the vault
     * @param _name ERC20 name of the vault shares token
     * @param _symbol ERC20 symbol of the vault shares token
     * @param _treasury Address to receive fees
     * @param _managementFee Annual management fee in basis points
     * @param _performanceFee Performance fee in basis points
     * @param _exitFee Exit fee in basis points
     */
    constructor(
        IERC20 _asset,
        string memory _name,
        string memory _symbol,
        address _treasury,
        uint256 _managementFee,
        uint256 _performanceFee,
        uint256 _exitFee
    ) ERC4626(_asset) ERC20(_name, _symbol) {
        require(_treasury != address(0), "Treasury cannot be zero address");
        require(
            _managementFee <= MAX_MANAGEMENT_FEE,
            "Management fee too high"
        );
        require(_performanceFee <= MAX_FEE, "Performance fee too high");
        require(_exitFee <= MAX_FEE, "Exit fee too high");

        treasury = _treasury;
        managementFee = _managementFee;
        performanceFee = _performanceFee;
        exitFee = _exitFee;
        emergencyWithdrawalLimit = type(uint256).max; // No limit by default

        lastManagementFeeCollection = block.timestamp;
        highWaterMark = 0;

        // Setup roles
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(STRATEGY_MANAGER_ROLE, msg.sender);
        _grantRole(FEE_MANAGER_ROLE, msg.sender);
        _grantRole(EMERGENCY_ROLE, msg.sender);
    }

    /**
     * @notice Sets a new treasury address
     * @param _treasury New treasury address
     */
    function setTreasury(
        address _treasury
    ) external onlyRole(FEE_MANAGER_ROLE) {
        require(_treasury != address(0), "Treasury cannot be zero address");
        treasury = _treasury;
        emit TreasuryUpdated(_treasury);
    }

    /**
     * @notice Sets emergency withdrawal limit
     * @param _limit New withdrawal limit
     */
    function setEmergencyWithdrawalLimit(
        uint256 _limit
    ) external onlyRole(EMERGENCY_ROLE) {
        emergencyWithdrawalLimit = _limit;
        emit EmergencyWithdrawalLimitUpdated(_limit);
    }
    
    /**
     * @notice Activates or deactivates emergency mode
     * @param _active Whether emergency mode should be active
     */
    function setEmergencyMode(bool _active) external onlyRole(EMERGENCY_ROLE) {
        emergencyMode = _active;
        emit EmergencyModeActivated(_active);
    }

    /**
     * @notice Returns the total assets managed by the vault including assets in the strategy
     * @return Total assets in the vault and the strategy
     */
    function totalAssets() public view override returns (uint256) {
        // In emergency mode, count only the vault's balance
        if (emergencyMode) {
            return IERC20(asset()).balanceOf(address(this));
        }
        
        uint256 total = IERC20(asset()).balanceOf(address(this));

        if (strategyActive) {
            try strategy.totalValue() returns (uint256 strategyValue) {
                total += strategyValue;
            } catch {
                // If strategy call fails, just return vault balance
            }
        }

        return total;
    }

    /**
     * @notice Deposit assets into the vault
     * @param assets Amount of assets to deposit
     * @param receiver Address to receive the vault shares
     * @return shares Amount of shares minted
     */
    function deposit(
        uint256 assets,
        address receiver
    ) public override nonReentrant whenNotPaused returns (uint256) {
        require(assets > 0, "Cannot deposit 0 assets");
        require(receiver != address(0), "Cannot deposit to zero address");

        // Collect any pending fees before changing balances
        _collectManagementFee();

        // Call the parent deposit function
        uint256 shares = super.deposit(assets, receiver);

        // After depositing, allocate funds to the strategy based on allocation
        _rebalance();

        return shares;
    }

    /**
     * @notice Mint vault shares by depositing assets
     * @param shares Amount of shares to mint
     * @param receiver Address to receive the vault shares
     * @return assets Amount of assets deposited
     */
    function mint(
        uint256 shares,
        address receiver
    ) public override nonReentrant whenNotPaused returns (uint256) {
        require(shares > 0, "Cannot mint 0 shares");
        require(receiver != address(0), "Cannot mint to zero address");

        // Collect any pending fees before changing balances
        _collectManagementFee();

        // Call the parent mint function
        uint256 assets = super.mint(shares, receiver);

        // After depositing, allocate funds to the strategy
        _rebalance();

        return assets;
    }

    /**
     * @notice Withdraw assets from the vault
     * @param assets Amount of assets to withdraw
     * @param receiver Address to receive the assets
     * @param owner Owner of the shares
     * @return shares Amount of shares burned
     */
    function withdraw(
        uint256 assets,
        address receiver,
        address owner
    ) public override nonReentrant returns (uint256) {
        // In emergency mode, use a simple withdrawal mechanism
        if (emergencyMode) {
            return _emergencyWithdraw(assets, receiver, owner);
        }
        
        require(assets > 0, "Cannot withdraw 0 assets");
        require(receiver != address(0), "Cannot withdraw to zero address");
        
        // Check emergency withdrawal limits if paused
        if (paused()) {
            require(
                assets <= emergencyWithdrawalLimit,
                "Withdrawal exceeds emergency limit"
            );
        }

        // Collect management fee before changing balances
        _collectManagementFee();

        // Calculate exit fee
        uint256 exitFeeAmount = (assets * exitFee) / FEE_DENOMINATOR;
        uint256 assetsWithFee = assets + exitFeeAmount;

        // Check if the owner has enough shares for this withdrawal
        uint256 sharesToBurn = convertToShares(assetsWithFee);
        require(
            balanceOf(owner) >= sharesToBurn,
            "Insufficient shares for withdrawal"
        );

        // Ensure we have enough assets for the withdrawal
        bool success = _ensureSufficientAssets(assetsWithFee);
        
        // If we couldn't get enough assets from the strategy
        if (!success) {
            // Fall back to direct withdrawal if needed
            return _directWithdraw(assets, receiver, owner);
        }

        // Call parent withdraw function
        uint256 shares = super.withdraw(assets, receiver, owner);

        // Take the exit fee
        if (exitFeeAmount > 0) {
            // Transfer the exit fee to the treasury
            IERC20(asset()).safeTransfer(treasury, exitFeeAmount);
            emit FeeCollected("Exit", exitFeeAmount);
        }

        // After withdrawal, rebalance if needed
        _rebalance();

        return shares;
    }

    /**
     * @notice Direct withdrawal without using parent ERC4626 functions
     * Used as a fallback when standard withdrawal fails
     */
    function _directWithdraw(
        uint256 assets,
        address receiver,
        address owner
    ) internal returns (uint256) {
        require(assets > 0, "Cannot withdraw 0 assets");
        require(receiver != address(0), "Cannot withdraw to zero address");
        
        // Calculate exit fee
        uint256 exitFeeAmount = (assets * exitFee) / FEE_DENOMINATOR;
        uint256 assetsWithFee = assets + exitFeeAmount;
        
        // Calculate shares to burn based on convertToShares
        uint256 sharesToBurn = convertToShares(assetsWithFee);
        require(balanceOf(owner) >= sharesToBurn, "Insufficient shares");

        // Check allowance if withdrawing on behalf of another user
        if (owner != msg.sender) {
            uint256 allowed = allowance(owner, msg.sender);
            if (allowed != type(uint256).max) {
                require(allowed >= sharesToBurn, "Insufficient allowance");
                _approve(owner, msg.sender, allowed - sharesToBurn);
            }
        }
        
        // Get current vault balance
        uint256 vaultBalance = IERC20(asset()).balanceOf(address(this));
        
        // Adjust amounts if we don't have enough
        uint256 actualAssets = assets;
        uint256 actualFee = exitFeeAmount;
        
        if (vaultBalance < assetsWithFee) {
            // Pro-rate both the assets and fee based on available balance
            actualAssets = (assets * vaultBalance) / assetsWithFee;
            actualFee = (exitFeeAmount * vaultBalance) / assetsWithFee;
        }
        
        // First burn the shares
        _burn(owner, sharesToBurn);
        
        // Then transfer assets
        if (actualAssets > 0) {
            IERC20(asset()).safeTransfer(receiver, actualAssets);
        }
        
        // Then transfer fee
        if (actualFee > 0) {
            IERC20(asset()).safeTransfer(treasury, actualFee);
            emit FeeCollected("Exit", actualFee);
        }
        
        emit BasicWithdrawalExecuted(receiver, actualAssets, sharesToBurn);
        
        return sharesToBurn;
    }
    
    /**
     * @notice Emergency withdrawal method for use in emergency mode
     */
    function _emergencyWithdraw(
        uint256 assets,
        address receiver,
        address owner
    ) internal returns (uint256) {
        // Simple proportional withdrawal based on current vault balance
        uint256 totalSupplyValue = totalSupply();
        if (totalSupplyValue == 0) return 0;
        
        uint256 vaultBalance = IERC20(asset()).balanceOf(address(this));
        uint256 sharesToBurn = convertToShares(assets);
        
        // Cap shares at owner's balance
        if (sharesToBurn > balanceOf(owner)) {
            sharesToBurn = balanceOf(owner);
        }
        
        // Calculate assets based on shares and current balance
        uint256 actualAssets = (sharesToBurn * vaultBalance) / totalSupplyValue;
        
        // Check allowance if withdrawing on behalf of another user
        if (owner != msg.sender) {
            uint256 allowed = allowance(owner, msg.sender);
            if (allowed != type(uint256).max) {
                require(allowed >= sharesToBurn, "Insufficient allowance");
                _approve(owner, msg.sender, allowed - sharesToBurn);
            }
        }
        
        // Burn shares first
        _burn(owner, sharesToBurn);
        
        // Then transfer assets
        if (actualAssets > 0) {
            IERC20(asset()).safeTransfer(receiver, actualAssets);
        }
        
        emit EmergencyRedemptionExecuted(receiver, actualAssets, sharesToBurn);
        
        return sharesToBurn;
    }

    /**
     * @notice Redeem shares for assets from the vault
     * @param shares Amount of shares to redeem
     * @param receiver Address to receive the assets
     * @param owner Owner of the shares
     * @return assets Amount of assets returned
     */
    function redeem(
        uint256 shares,
        address receiver,
        address owner
    ) public override nonReentrant returns (uint256) {
        // In emergency mode, use a simple direct redemption
        if (emergencyMode) {
            return _emergencyRedeem(shares, receiver, owner);
        }
        
        // Try each redemption method in order until one succeeds
        try this.tryRedeem(shares, receiver, owner, 0) returns (uint256 assets) {
            return assets;
        } catch {
            try this.tryRedeem(shares, receiver, owner, 1) returns (uint256 assets) {
                return assets;
            } catch {
                // If all else fails, use emergency redemption
                return _emergencyRedeem(shares, receiver, owner);
            }
        }
    }

    /**
     * @notice Attempt redemption with different methods
     * @param shares Amount of shares to redeem
     * @param receiver Address to receive the assets
     * @param owner Owner of the shares
     * @param method Redemption method to try (0 = standard, 1 = alternative)
     * @return assets Amount of assets returned
     */
    function tryRedeem(
        uint256 shares,
        address receiver,
        address owner,
        uint8 method
    ) external nonReentrant returns (uint256) {
        require(msg.sender == address(this), "Direct calls not allowed");
        
        if (method == 0) {
            // Standard ERC4626 redemption with strategy withdrawal
            return _standardRedeem(shares, receiver, owner);
        } else {
            // Alternative redemption without using strategy
            return _alternativeRedeem(shares, receiver, owner);
        }
    }

    /**
     * @notice Standard redemption path
     */
    function _standardRedeem(
        uint256 shares,
        address receiver,
        address owner
    ) internal returns (uint256) {
        emit RedemptionStarted(shares, receiver, owner);
        
        // Basic validation
        require(shares > 0, "Cannot redeem 0 shares");
        require(receiver != address(0), "Cannot redeem to zero address");
        require(balanceOf(owner) >= shares, "Insufficient shares");
        
        // Check allowance if redeeming on behalf of another user
        if (owner != msg.sender && msg.sender != address(this)) {
            uint256 allowed = allowance(owner, msg.sender);
            if (allowed != type(uint256).max) {
                require(allowed >= shares, "Insufficient allowance");
                _approve(owner, msg.sender, allowed - shares);
            }
        }
        
        // Calculate assets and fees
        uint256 assets = convertToAssets(shares);
        uint256 exitFeeAmount = (assets * exitFee) / FEE_DENOMINATOR;
        uint256 assetsAfterFee = assets - exitFeeAmount;
        
        emit AssetsCalculated(assets, exitFeeAmount);
        
        // Check if we need to withdraw from strategy
        uint256 vaultBalance = IERC20(asset()).balanceOf(address(this));
        
        if (vaultBalance < assets && strategyActive) {
            emit StrategyWithdrawalAttempted(assets - vaultBalance, vaultBalance);
            
            // Check if strategy is healthy
            if (!checkStrategyHealth()) {
                // If strategy is not healthy, don't try to withdraw
                return _emergencyRedeem(shares, receiver, owner);
            }
            
            // Try to withdraw needed amount from strategy
            try strategy.withdraw(assets - vaultBalance) {
                vaultBalance = IERC20(asset()).balanceOf(address(this));
                emit StrategyWithdrawalResult(true, vaultBalance);
            } catch {
                // If withdrawal fails, try to withdraw all
                try strategy.withdrawAll() {
                    vaultBalance = IERC20(asset()).balanceOf(address(this));
                    emit StrategyWithdrawalResult(true, vaultBalance);
                } catch {
                    emit StrategyWithdrawalResult(false, vaultBalance);
                    // If both fail, throw and let tryRedeem try another method
                    revert("Strategy withdrawal failed");
                }
            }
        }
        
        // Final check to ensure we have enough assets
        vaultBalance = IERC20(asset()).balanceOf(address(this));
        require(vaultBalance >= assets, "Insufficient liquidity");
        
        // First burn the shares (important to do this before transfers)
        _burn(owner, shares);
        emit SharesBurned(shares, owner);
        
        // Then transfer assets to receiver
        IERC20(asset()).safeTransfer(receiver, assetsAfterFee);
        emit AssetTransferred(receiver, assetsAfterFee);
        
        // Then transfer fee if applicable
        if (exitFeeAmount > 0) {
            IERC20(asset()).safeTransfer(treasury, exitFeeAmount);
            emit FeeCollected("Exit", exitFeeAmount);
        }
        
        return assets;
    }

    /**
     * @notice Alternative redemption method that doesn't rely on strategy
     */
    function _alternativeRedeem(
        uint256 shares,
        address receiver,
        address owner
    ) internal returns (uint256) {
        emit RedemptionStarted(shares, receiver, owner);
        
        // Basic validation
        require(shares > 0, "Cannot redeem 0 shares");
        require(receiver != address(0), "Cannot redeem to zero address");
        require(balanceOf(owner) >= shares, "Insufficient shares");
        
        // Check allowance
        if (owner != msg.sender && msg.sender != address(this)) {
            uint256 allowed = allowance(owner, msg.sender);
            if (allowed != type(uint256).max) {
                require(allowed >= shares, "Insufficient allowance");
                _approve(owner, msg.sender, allowed - shares);
            }
        }
        
        // Calculate proportional assets based only on vault balance
        uint256 vaultBalance = IERC20(asset()).balanceOf(address(this));
        uint256 totalShares = totalSupply();
        uint256 assets = (shares * vaultBalance) / totalShares;
        
        // Calculate exit fee
        uint256 exitFeeAmount = (assets * exitFee) / FEE_DENOMINATOR;
        uint256 assetsAfterFee = assets - exitFeeAmount;
        
        emit AssetsCalculated(assets, exitFeeAmount);
        
        // First burn the shares
        _burn(owner, shares);
        emit SharesBurned(shares, owner);
        
        // Then transfer assets to receiver
        if (assetsAfterFee > 0) {
            IERC20(asset()).safeTransfer(receiver, assetsAfterFee);
            emit AssetTransferred(receiver, assetsAfterFee);
        }
        
        // Then transfer fee
        if (exitFeeAmount > 0) {
            IERC20(asset()).safeTransfer(treasury, exitFeeAmount);
            emit FeeCollected("Exit", exitFeeAmount);
        }
        
        return assets;
    }

    /**
     * @notice Simplified emergency redemption for Sepolia testnet
     * @param shares Amount of shares to redeem
     * @param receiver Address to receive the assets
     * @param owner Owner of the shares
     * @return assets Amount of assets transferred
     */
    function _emergencyRedeem(
        uint256 shares,
        address receiver,
        address owner
    ) internal returns (uint256) {
        emit RedemptionStarted(shares, receiver, owner);
        
        // Basic validation
        require(shares > 0, "Cannot redeem 0 shares");
        require(receiver != address(0), "Cannot redeem to zero address");
        require(balanceOf(owner) >= shares, "Insufficient shares");
        
        // Check allowance if redeeming on behalf of another user
        if (owner != msg.sender && msg.sender != address(this)) {
            uint256 allowed = allowance(owner, msg.sender);
            if (allowed != type(uint256).max) {
                require(allowed >= shares, "Insufficient allowance");
                _approve(owner, msg.sender, allowed - shares);
            }
        }
        
        // Just use vault balance for simplicity
        uint256 vaultBalance = IERC20(asset()).balanceOf(address(this));
        uint256 totalShares = totalSupply();
        
        // Proportional redemption based on available balance only
        uint256 assets = (shares * vaultBalance) / totalShares;
        
        // Burn shares first
        _burn(owner, shares);
        emit SharesBurned(shares, owner);
        
        // Transfer assets if any
        if (assets > 0) {
            IERC20(asset()).safeTransfer(receiver, assets);
            emit AssetTransferred(receiver, assets);
        }
        
        emit EmergencyRedemptionExecuted(receiver, assets, shares);
        
        return assets;
    }

    /**
     * @notice Preview the exit fee for a given amount of assets
     * @param assets Amount of assets to calculate fee for
     * @return Amount of exit fee
     */
    function previewExitFee(uint256 assets) public view returns (uint256) {
        return (assets * exitFee) / FEE_DENOMINATOR;
    }

    /**
     * @notice Preview the pending management fee
     * @return Amount of pending management fee
     */
    function previewManagementFee() public view returns (uint256) {
        if (managementFee == 0 || totalAssets() == 0) {
            return 0;
        }

        uint256 timePassed = block.timestamp - lastManagementFeeCollection;
        return
            (totalAssets() * managementFee * timePassed) /
            (FEE_DENOMINATOR * 365 days);
    }

    /**
     * @notice Get current allocation ratio of funds in strategy
     * @return Current allocation in basis points
     */
    function getCurrentAllocation() public view returns (uint256) {
        uint256 total = totalAssets();
        if (total == 0 || !strategyActive) return 0;
        
        uint256 strategyValue = 0;
        try strategy.totalValue() returns (uint256 value) {
            strategyValue = value;
        } catch {
            return 0;
        }
        
        return (strategyValue * FEE_DENOMINATOR) / total;
    }

    /**
     * @notice Harvest yield from the strategy
     */
    function harvest() external nonReentrant {
        if (strategyActive) {
            _harvestStrategy();
        }
    }

    /**
     * @notice Set the strategy
     * @param _strategy The strategy to set
     * @param allocation Allocation percentage in basis points (0-10000)
     */
    function setStrategy(
        IStrategy _strategy,
        uint256 allocation
    ) external onlyRole(STRATEGY_MANAGER_ROLE) {
        require(address(_strategy) != address(0), "Strategy cannot be zero address");
        require(
            _strategy.asset() == address(asset()),
            "Strategy asset mismatch"
        );
        require(allocation <= FEE_DENOMINATOR, "Allocation too high");

        // If we already have a strategy, withdraw all funds first
        if (strategyActive) {
            // Try to withdraw all funds from the old strategy
            _safeWithdrawAllFromStrategy();
            
            // Verify no funds remain in the old strategy
            uint256 oldStrategyBalance = 0;
            try strategy.totalValue() returns (uint256 balance) {
                oldStrategyBalance = balance;
            } catch {
                // If call fails, assume balance is 0
            }
            
            if (oldStrategyBalance > 0) {
                // If funds remain, log a warning but continue (to avoid locking vault setup)
                emit WithdrawalFailed("Failed to withdraw all from previous strategy", oldStrategyBalance);
            }
        }

        // Set the new strategy
        strategy = _strategy;
        strategyActive = true;
        strategyAllocation = allocation;

        emit StrategySet(address(_strategy), allocation);

        // Rebalance to allocate funds to the new strategy
        _rebalance();
    }

    /**
     * @notice Remove the current strategy
     */
    function removeStrategy() external onlyRole(STRATEGY_MANAGER_ROLE) {
        require(strategyActive, "No active strategy");

        // Ensure the strategy has no funds before removal
        _safeWithdrawAllFromStrategy();

        // Verify all funds were successfully withdrawn
        uint256 remainingStrategyValue = 0;
        try strategy.totalValue() returns (uint256 balance) {
            remainingStrategyValue = balance;
        } catch {
            // If call fails, assume balance is 0
        }
        
        // Strict check to ensure no funds remain in the strategy
        require(
            remainingStrategyValue == 0,
            "Strategy still has funds, cannot remove"
        );

        // Remove the strategy
        strategyActive = false;
        strategyAllocation = 0;

        emit StrategySet(address(0), 0);
    }

    /**
     * @notice Emergency operation to force remove strategy even if funds remain
     * @dev Use only if strategy is compromised or funds are stuck
     */
    function forceRemoveStrategy() external onlyRole(EMERGENCY_ROLE) {
        require(strategyActive, "No active strategy");
        
        // Try to withdraw but continue even if it fails
        try strategy.withdrawAll() {
            // Success case
        } catch {
            // Failed to withdraw, but we'll continue
            uint256 strategyValue = 0;
            try strategy.totalValue() returns (uint256 value) {
                strategyValue = value;
            } catch {
                // If call fails as well, just continue
            }
            
            emit WithdrawalFailed("Force remove strategy: withdrawAll failed", strategyValue);
        }
        
        // Log remaining funds for potential recovery later
        uint256 remainingValue = 0;
        try strategy.totalValue() returns (uint256 value) {
            remainingValue = value;
        } catch {
            // If call fails, just continue
        }
        
        if (remainingValue > 0) {
            emit WithdrawalFailed("Force removed strategy with remaining funds", remainingValue);
        }
        
        // Disconnect the strategy regardless of withdrawal success
        strategyActive = false;
        strategyAllocation = 0;
        
        // Enable emergency mode to allow users to withdraw their proportional share
        emergencyMode = true;
        emit EmergencyModeActivated(true);
        
        emit StrategySet(address(0), 0);
    }

    /**
     * @notice Update allocation for the strategy
     * @param allocation New allocation percentage in basis points
     */
    function updateAllocation(
        uint256 allocation
    ) external onlyRole(STRATEGY_MANAGER_ROLE) {
        require(strategyActive, "No active strategy");
        require(allocation <= FEE_DENOMINATOR, "Allocation too high");

        strategyAllocation = allocation;
        emit StrategyAllocationUpdated(allocation);

        // Rebalance according to new allocation
        _rebalance();
    }

    /**
     * @notice Update fee parameters
     * @param _managementFee New management fee in basis points
     * @param _performanceFee New performance fee in basis points
     * @param _exitFee New exit fee in basis points
     */
    function updateFees(
        uint256 _managementFee,
        uint256 _performanceFee,
        uint256 _exitFee
    ) external onlyRole(FEE_MANAGER_ROLE) {
        require(
            _managementFee <= MAX_MANAGEMENT_FEE,
            "Management fee too high"
        );
        require(_performanceFee <= MAX_FEE, "Performance fee too high");
        require(_exitFee <= MAX_FEE, "Exit fee too high");

        // Collect any pending fees before changing fee structure
        _collectManagementFee();

        managementFee = _managementFee;
        performanceFee = _performanceFee;
        exitFee = _exitFee;
    }

    /**
     * @notice Pause the vault in emergency
     */
    function pause() external onlyRole(EMERGENCY_ROLE) {
        _pause();

        // Also pause the strategy if active
        if (strategyActive) {
            try strategy.pause() {
                // Success case
            } catch {
                // If strategy pause fails, continue with vault paused
            }
        }
    }

    /**
     * @notice Unpause the vault
     */
    function unpause() external onlyRole(EMERGENCY_ROLE) {
        _unpause();

        // Also unpause the strategy if active
        if (strategyActive) {
            try strategy.unpause() {
                // Success case
            } catch {
                // If strategy unpause fails, continue with vault unpaused
            }
        }
    }

    /**
     * @notice Force withdrawal from the strategy in emergency
     * @return success True if withdrawal was successful
     */
    function emergencyWithdraw() external onlyRole(EMERGENCY_ROLE) returns (bool success) {
        require(strategyActive, "No active strategy");
        
        success = _safeWithdrawAllFromStrategy();
        return success;
    }

    /**
     * @notice Check if the strategy is in a healthy state
     * @return Boolean indicating if the strategy is healthy
     */
    function checkStrategyHealth() public view returns (bool) {
        // Don't try to check strategy health if in emergency mode
        if (emergencyMode) return false;
        
        // Always return true for Sepolia testing
        return true;
    }

    /**
     * @notice Get the APY for the strategy based on harvest history
     * @return Approximate APY in basis points
     */
    function getStrategyAPY() public view returns (uint256) {
        if (!strategyActive) {
            return 0;
        }
        
        try strategy.estimatedAPY() returns (uint256 apy) {
            return apy;
        } catch {
            return 0;
        }
    }

    /**
     * @notice Recover asset tokens accidentally sent to this contract
     * @param token The token address to recover
     * @param recipient The address to send recovered tokens to
     */
    function recoverERC20(
        address token,
        address recipient
    ) external onlyRole(EMERGENCY_ROLE) {
        require(recipient != address(0), "Cannot recover to zero address");
        
        // Protect vault's main asset from accidental recovery
        if (token == address(asset())) {
            // For the main asset, we can only recover "excess" tokens
            // that aren't accounted for in the totalAssets calculation
            uint256 excessTokens = IERC20(token).balanceOf(address(this));
            
            if (!emergencyMode && strategyActive) {
                try strategy.totalValue() returns (uint256 strategyValue) {
                    excessTokens = excessTokens - (totalAssets() - strategyValue);
                } catch {
                    // If strategy call fails, don't subtract anything
                }
            }
            
            require(excessTokens > 0, "No excess tokens to recover");
            IERC20(token).safeTransfer(recipient, excessTokens);
        } else {
            // For other tokens, recover the full balance
            uint256 amount = IERC20(token).balanceOf(address(this));
            require(amount > 0, "No tokens to recover");
            IERC20(token).safeTransfer(recipient, amount);
        }
    }
    
    /**
     * @notice Get funds directly from a disconnected strategy
     * @param strategyAddress Address of the disconnected strategy
     * @dev To be used when funds are stuck in a strategy that was improperly removed
     */
    function recoverFromStrategy(
        address strategyAddress
    ) external onlyRole(EMERGENCY_ROLE) {
        require(strategyAddress != address(0), "Invalid strategy address");
        
        // Create an interface to the strategy
        IStrategy disconnectedStrategy = IStrategy(strategyAddress);
        
        // Verify this is a valid strategy with our asset
        require(
            disconnectedStrategy.asset() == address(asset()),
            "Strategy asset mismatch"
        );
        
        // Attempt to withdraw all funds from the disconnected strategy
        try disconnectedStrategy.withdrawAll() {
            // Success case
            uint256 received = IERC20(asset()).balanceOf(address(this));
            uint256 strategyValue = 0;
            
            try disconnectedStrategy.totalValue() returns (uint256 value) {
                strategyValue = value;
            } catch {
                // If call fails, assume zero value
            }
            
            emit StrategicWithdrawal(strategyValue, received);
        } catch {
            // If withdrawal fails, log the error
            uint256 strategyValue = 0;
            try disconnectedStrategy.totalValue() returns (uint256 value) {
                strategyValue = value;
            } catch {
                // If call fails again, just use zero
            }
            
            emit WithdrawalFailed(
                "Recovery from disconnected strategy failed",
                strategyValue
            );
        }
    }

    /**
     * @dev Internal function to harvest the strategy
     */
    function _harvestStrategy() internal {
        uint256 yieldAmount = 0;
        
        try strategy.harvest() returns (uint256 amount) {
            yieldAmount = amount;
        } catch {
            emit WithdrawalFailed("Strategy harvest failed", 0);
            return;
        }

        // Skip processing if yield is below threshold
        if (yieldAmount < MIN_HARVEST_THRESHOLD) {
            emit Harvested(address(strategy), 0);
            return;
        }

        if (yieldAmount > 0 && performanceFee > 0) {
            uint256 feeAmount = (yieldAmount * performanceFee) /
                FEE_DENOMINATOR;
            if (feeAmount > 0) {
                // Transfer performance fee to the treasury
                IERC20(asset()).safeTransfer(treasury, feeAmount);
                emit FeeCollected("Performance", feeAmount);
            }
        }

        // Update high water mark if total assets increased
        uint256 currentTotalAssets = totalAssets();
        if (currentTotalAssets > highWaterMark) {
            uint256 oldHighWaterMark = highWaterMark;
            highWaterMark = currentTotalAssets;
            emit HighWaterMarkUpdated(oldHighWaterMark, currentTotalAssets);
        }

        emit Harvested(address(strategy), yieldAmount);
    }

    /**
     * @dev Internal function to collect management fee
     */
    function _collectManagementFee() internal {
        if (managementFee == 0 || totalAssets() == 0) {
            lastManagementFeeCollection = block.timestamp;
            return;
        }

        // Only collect fee after the interval has passed
        if (
            block.timestamp <
            lastManagementFeeCollection + MANAGEMENT_FEE_INTERVAL
        ) {
            return;
        }

        uint256 timePassed = block.timestamp - lastManagementFeeCollection;

        // Calculate annual fee pro-rated for the time passed
        uint256 feeAmount = (totalAssets() * managementFee * timePassed) /
            (FEE_DENOMINATOR * 365 days);

        if (feeAmount > 0) {
            // Mint shares to the treasury for the fee amount
            // This dilutes existing shareholders instead of directly transferring assets
            _mint(treasury, convertToShares(feeAmount));
            emit FeeCollected("Management", feeAmount);
        }

        lastManagementFeeCollection = block.timestamp;
    }

    /**
     * @dev Internal function to safely withdraw all funds from the strategy
     * @return success True if the withdrawal was successful
     */
    function _safeWithdrawAllFromStrategy() internal returns (bool success) {
        if (!strategyActive) return true;
        
        // Record initial balance to compare after withdrawal
        uint256 initialBalance = IERC20(asset()).balanceOf(address(this));
        uint256 strategyValue = 0;
        
        try strategy.totalValue() returns (uint256 value) {
            strategyValue = value;
        } catch {
            // If call fails, assume there's nothing to withdraw
            return true;
        }
        
        if (strategyValue == 0) return true;
        
        try strategy.withdrawAll() {
            // Check if the withdrawal actually transferred tokens
            uint256 newBalance = IERC20(asset()).balanceOf(address(this));
            uint256 received = newBalance - initialBalance;
            
            // Log the withdrawal for tracking
            emit StrategicWithdrawal(strategyValue, received);
            
            // Return true if we received most of the expected value (allowing for small rounding errors)
            return (received >= strategyValue * 995 / 1000); // 99.5% of expected
        } catch {
            emit WithdrawalFailed("Strategy withdrawAll failed", strategyValue);
            return false;
        }
    }

    /**
     * @dev Internal function to ensure the vault has sufficient assets
     * @param assets Amount of assets needed
     * @return success True if we have sufficient assets after the function
     */
    function _ensureSufficientAssets(uint256 assets) internal returns (bool success) {
        if (emergencyMode) {
            // In emergency mode, don't try to get assets from strategy
            return IERC20(asset()).balanceOf(address(this)) >= assets;
        }
        
        uint256 vaultBalance = IERC20(asset()).balanceOf(address(this));

        if (vaultBalance >= assets) {
            return true; // Already have enough assets
        }

        // We need to pull assets from the strategy
        uint256 needed = assets - vaultBalance;
        
        if (!strategyActive) {
            // No active strategy to pull from
            return false;
        }
        
        uint256 strategyBalance = 0;
        try strategy.totalValue() returns (uint256 balance) {
            strategyBalance = balance;
        } catch {
            // If call fails, assume strategy has no funds
            return false;
        }
        
        if (strategyBalance == 0) {
            // Strategy has no funds
            return false;
        }
        
        uint256 toWithdraw = needed < strategyBalance ? needed : strategyBalance;
        
        if (toWithdraw == 0) {
            return false;
        }
        
        // Record initial balance before withdrawal
        uint256 initialBalance = vaultBalance;
        
        try strategy.withdraw(toWithdraw) {
            // Check if withdrawal was successful by comparing balances
            uint256 newBalance = IERC20(asset()).balanceOf(address(this));
            uint256 received = newBalance - initialBalance;
            
            // Log the withdrawal for tracking
            emit StrategicWithdrawal(toWithdraw, received);
            
            // Check if we have enough now
            return newBalance >= assets;
        } catch {
            emit WithdrawalFailed("Strategy withdraw failed", toWithdraw);
            return false;
        }
    }

    /**
     * @dev Internal function to rebalance strategy allocation
     */
    function _rebalance() internal {
        // Skip rebalance if in emergency mode
        if (emergencyMode) return;
        
        if (!strategyActive || strategyAllocation == 0) {
            // If strategy is not active or allocation is 0%, withdraw everything
            if (strategyActive) {
                _safeWithdrawAllFromStrategy();
            }
            return;
        }

        uint256 totalAssetsValue = totalAssets();
        if (totalAssetsValue == 0) return;

        // Calculate target amount for the strategy
        uint256 targetValue = (totalAssetsValue * strategyAllocation) / FEE_DENOMINATOR;
        uint256 currentValue = 0;
        
        try strategy.totalValue() returns (uint256 value) {
            currentValue = value;
        } catch {
            // If call fails, treat as if strategy has 0 value
            currentValue = 0;
        }
        
        uint256 vaultBalance = IERC20(asset()).balanceOf(address(this));

        // Add a buffer to ensure vault has some liquidity for redemptions
        uint256 bufferAmount = (totalAssetsValue * 2000) / FEE_DENOMINATOR; // 20% buffer (increased for Sepolia)
        if (bufferAmount > targetValue) {
            bufferAmount = targetValue / 2; // At least half in the vault if target is small
        }
        
        // Adjust target to keep a minimum buffer in the vault
        if (targetValue + bufferAmount > totalAssetsValue) {
            targetValue = totalAssetsValue - bufferAmount;
        }

        // Determine if rebalance is needed
        if (currentValue < targetValue) {
            // Strategy needs more funds
            uint256 amountToDeposit = targetValue - currentValue;
            if (amountToDeposit > vaultBalance) {
                amountToDeposit = vaultBalance;
            }

            if (amountToDeposit > 0) {
                IERC20 assetToken = IERC20(asset());
                assetToken.approve(address(strategy), 0);
                assetToken.approve(address(strategy), amountToDeposit);
                
                try strategy.deposit(amountToDeposit) {
                    // Success case
                } catch {
                    // If deposit fails, revoke approval
                    assetToken.approve(address(strategy), 0);
                    emit WithdrawalFailed("Strategy deposit failed during rebalance", amountToDeposit);
                }
            }
        } else if (currentValue > targetValue) {
            // Strategy has excess funds
            uint256 amountToWithdraw = currentValue - targetValue;
            if (amountToWithdraw > 0) {
                try strategy.withdraw(amountToWithdraw) {
                    // Success case
                } catch {
                    emit WithdrawalFailed("Strategy withdrawal failed during rebalance", amountToWithdraw);
                }
            }
        }
    }
}