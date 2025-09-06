# RubySwap V3: Technical Specification Document (TSD) - Phase 1 MVP

**Version:** 2.1 (Structure Corrected)  
**Status:** Ready for Implementation  
**PRD Reference:** [PRD.md](./PRD.md)  
**Last Updated:** December 2024  
**Reference Implementation:** Uniswap V3 (MIT License) - Adapted for RubySwap

## 📋 **Document Purpose**

This TSD translates the RubySwap V3 PRD into actionable engineering specifications for Phase 1 development. It provides the complete technical blueprint, development sequence, testing strategy, and reference implementation approach based on Uniswap V3's proven architecture.

---

## 1.0 **Project Structure & Organization**

### 1.1 **Monorepo Structure**
```
My-Defi-Learning-Process/
├── contracts/04-RubyswapV3/          # Smart contract source code
│   ├── core-contracts/               # Core AMM contracts
│   ├── periphery/                    # User-facing contracts
│   ├── libraries/                    # Mathematical libraries
│   ├── interfaces/                   # Contract interfaces
│   ├── hardhat.config.ts            # Hardhat configuration
│   ├── package.json                  # Dependencies
│   ├── PRD.md                       # Product Requirements
│   └── TSD.md                       # This document
├── scripts/04-RubyswapV3/           # Deployment and utility scripts
├── test/04-RubyswapV3/              # Test files
├── artifacts/                        # Compiled contracts (shared)
├── cache/                           # Hardhat cache (shared)
└── typechain/                       # TypeScript types (shared)
```

### 1.2 **Corrected Project Structure**
```
contracts/04-RubyswapV3/
├── core-contracts/
│   ├── RubySwapFactory.sol
│   ├── RubySwapPool.sol
│   └── RubySwapPoolDeployer.sol
├── periphery/
│   ├── RubySwapPositionManager.sol
│   ├── RubySwapRouter.sol
│   └── RubySwapQuoter.sol
├── libraries/
│   ├── TickMath.sol
│   ├── LiquidityMath.sol
│   ├── FullMath.sol
│   ├── OracleLibrary.sol
│   ├── Position.sol
│   ├── Tick.sol
│   ├── TickBitmap.sol
│   ├── SqrtPriceMath.sol
│   ├── SwapMath.sol
│   ├── SafeCast.sol
│   ├── FixedPoint96.sol
│   └── FixedPoint128.sol
├── interfaces/
│   ├── IRubySwapFactory.sol
│   ├── IRubySwapPool.sol
│   ├── IRubySwapPositionManager.sol
│   ├── IRubySwapRouter.sol
│   ├── IERC20.sol
│   └── callback/
│       ├── IRubySwapV3MintCallback.sol
│       ├── IRubySwapV3SwapCallback.sol
│       └── IRubySwapV3FlashCallback.sol
├── hardhat.config.ts
└── package.json
```

---

## 2.0 **Team Distribution & Organization**

### 2.1 **Recommended Team Structure**

**For a project of this complexity, we recommend a 4-person team:**

#### **Team Lead (1 person)**
- **Responsibilities:** Project coordination, code reviews, architecture decisions
- **Skills:** Senior Solidity developer, project management
- **Time Allocation:** 50% development, 50% coordination

#### **Core Contract Developer (1 person)**
- **Responsibilities:** Pool contract, mathematical libraries, core AMM logic
- **Skills:** Advanced Solidity, mathematical algorithms, gas optimization
- **Time Allocation:** 100% development

#### **Periphery Contract Developer (1 person)**
- **Responsibilities:** Position manager, router, user-facing contracts
- **Skills:** Solidity, ERC-721, user experience design
- **Time Allocation:** 100% development

#### **Testing & Integration Developer (1 person)**
- **Responsibilities:** Test suite, integration testing, deployment scripts
- **Skills:** Testing frameworks, deployment, integration
- **Time Allocation:** 70% testing, 30% development support

### 2.2 **Alternative Team Sizes**

#### **3-Person Team (Minimum Viable)**
- **Team Lead:** + Core contracts
- **Periphery Developer:** + Testing
- **Core Developer:** + Mathematical libraries

#### **5-Person Team (Optimal)**
- **Team Lead:** Project coordination
- **Core Contract Developer:** Pool + libraries
- **Periphery Developer:** Position manager + router
- **Testing Developer:** Test suite + integration
- **Security Developer:** Security review + optimization

### 2.3 **Task Distribution by Team Size**

| Task | 3-Person | 4-Person | 5-Person |
|------|-----------|-----------|-----------|
| **Core Libraries** | Dev A | Dev B | Dev B |
| **Pool Contract** | Dev A | Dev B | Dev B |
| **Factory** | Dev A | Dev B | Dev B |
| **Position Manager** | Dev B | Dev C | Dev C |
| **Router** | Dev B | Dev C | Dev C |
| **Testing** | Dev B | Dev D | Dev D |
| **Security Review** | Dev A | Dev A | Dev E |
| **Integration** | Dev B | Dev D | Dev D |

---

## 3.0 **Environment Setup & Configuration**

### 3.1 **Development Environment Setup**

#### **3.1.1 Prerequisites**
```bash
# Node.js version (locked via .nvmrc)
Node.js: 20.x.x
npm: 10.x.x

# Global tools
npm install -g hardhat
npm install -g typescript
npm install -g ts-node
```

#### **3.1.2 Project Setup**
```bash
# Navigate to project directory
cd contracts/04-RubyswapV3

# Install dependencies
npm install

# Verify Hardhat installation
npx hardhat --version

# Compile contracts
npm run compile

# Run tests
npm test
```

#### **3.1.3 Environment Variables**
```bash
# Create .env file in contracts/04-RubyswapV3/
SEPOLIA_RPC_URL=https://sepolia.drpc.org
DEPLOYER_PRIVATE_KEY=your_private_key_here
ETHERSCAN_API_KEY=your_etherscan_api_key_here
```

### 3.2 **Hardhat Configuration**

#### **3.2.1 Current Configuration Analysis**
The current `hardhat.config.ts` has some issues:
- **Solidity Version:** 0.8.20 (should be 0.8.24 per TSD)
- **Optimizer Runs:** 1,000,000 (excessive, should be 200)
- **viaIR:** Enabled (may cause issues with complex contracts)

#### **3.2.2 Recommended Configuration Updates**
```typescript
// Update in hardhat.config.ts
solidity: {
    version: "0.8.24",  // Update to latest stable
    settings: {
        optimizer: {
            enabled: true,
            runs: 200,   // Standard for gas optimization
        },
        viaIR: false,   // Disable to avoid compilation issues
    },
},
```

### 3.3 **Development Tools Setup**

#### **3.3.1 IDE Configuration**
- **VS Code Extensions:**
  - Solidity (Juan Blanco)
  - Hardhat Solidity (NomicFoundation)
  - Solidity Visual Auditor
  - Prettier - Code formatter

#### **3.3.2 Code Quality Tools**
```bash
# Install additional dev dependencies
npm install --save-dev prettier prettier-plugin-solidity
npm install --save-dev solhint
npm install --save-dev @openzeppelin/contracts-upgradeable
```

#### **3.3.3 Git Hooks Setup**
```bash
# Install husky for git hooks
npm install --save-dev husky lint-staged

# Configure pre-commit hooks
npx husky install
npx husky add .husky/pre-commit "npx lint-staged"
```

---

## 4.0 **Development Workflow & Process**

### 4.1 **Development Phases (Revised for Team Structure)**

#### **Phase 1: Foundation (Week 1)**
**Team:** Core Developer + Periphery Developer
**Tasks:**
- [ ] Project structure setup
- [ ] Core libraries implementation (TickMath, FullMath, LiquidityMath)
- [ ] Basic interfaces definition
- [ ] Unit tests for libraries

#### **Phase 2: Core AMM (Weeks 2-3)**
**Team:** Core Developer + Testing Developer
**Tasks:**
- [ ] Pool contract implementation
- [ ] Oracle library and TWAP
- [ ] Mathematical libraries (SqrtPriceMath, SwapMath)
- [ ] Comprehensive unit testing

#### **Phase 3: User Interface (Week 4)**
**Team:** Periphery Developer + Testing Developer
**Tasks:**
- [ ] Factory contract
- [ ] Position manager (NFT)
- [ ] Router contract
- [ ] Integration testing

#### **Phase 4: Integration & Testing (Week 5)**
**Team:** All Developers
**Tasks:**
- [ ] End-to-end testing
- [ ] Gas optimization
- [ ] Security review
- [ ] Documentation

#### **Phase 5: Deployment & Audit Prep (Week 6)**
**Team:** All Developers
**Tasks:**
- [ ] Testnet deployment
- [ ] Contract verification
- [ ] Final testing
- [ ] Audit preparation

### 4.2 **Daily Development Workflow**

#### **Morning Standup (15 minutes)**
- Progress update from each developer
- Blockers and challenges
- Daily goals and priorities

#### **Development Sessions (4-6 hours)**
- Focused coding with minimal interruptions
- Regular commits (every 2-3 hours)
- Immediate testing after function completion

#### **Afternoon Review (30 minutes)**
- Code review of completed work
- Integration testing
- Planning for next day

#### **Weekly Review (2 hours)**
- Phase completion assessment
- Quality metrics review
- Next phase planning

### 4.3 **Code Review Process**

#### **Review Requirements**
- **Frequency:** After each contract completion
- **Participants:** Primary developer + secondary reviewer + team lead
- **Duration:** Maximum 2 days per review
- **Approval:** All reviewers must approve before proceeding

#### **Review Criteria**
- **Functionality:** Correct implementation of requirements
- **Security:** No security vulnerabilities
- **Gas Optimization:** Assembly usage where required
- **Testing:** Adequate test coverage
- **Documentation:** Complete NatSpec comments

---

## 5.0 **Testing Strategy & Infrastructure**

### 5.1 **Test File Organization**
```
test/04-RubyswapV3/
├── unit/
│   ├── libraries/
│   │   ├── TickMath.test.ts
│   │   ├── FullMath.test.ts
│   │   └── LiquidityMath.test.ts
│   ├── core/
│   │   ├── RubySwapPool.test.ts
│   │   └── RubySwapFactory.test.ts
│   └── periphery/
│       ├── RubySwapPositionManager.test.ts
│       └── RubySwapRouter.test.ts
├── integration/
│   ├── PoolOperations.test.ts
│   ├── UserWorkflows.test.ts
│   └── GasOptimization.test.ts
└── fork/
    ├── SepoliaIntegration.test.ts
    └── RealTokenTesting.test.ts
```

### 5.2 **Testing Infrastructure Setup**

#### **5.2.1 Test Environment**
```typescript
// test/04-RubyswapV3/setup/test-environment.ts
import { ethers } from "hardhat";
import { SignerWithAddress } from "@ethersproject/contracts";

export interface TestEnvironment {
    deployer: SignerWithAddress;
    user1: SignerWithAddress;
    user2: SignerWithAddress;
    token0: Contract;
    token1: Contract;
    factory: Contract;
    pool: Contract;
}

export async function setupTestEnvironment(): Promise<TestEnvironment> {
    // Setup test accounts and contracts
}
```

#### **5.2.2 Mock Token Contracts**
```typescript
// test/04-RubyswapV3/mocks/MockERC20.ts
export class MockERC20 extends ERC20 {
    constructor(name: string, symbol: string) {
        super(name, symbol);
    }
    
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
```

### 5.3 **Testing Requirements by Phase**

#### **Phase 1 Testing (Libraries)**
- [ ] Mathematical accuracy tests
- [ ] Edge case testing
- [ ] Gas optimization verification
- [ ] 100% line coverage

#### **Phase 2 Testing (Core AMM)**
- [ ] Swap functionality tests
- [ ] Liquidity management tests
- [ ] Fee calculation tests
- [ ] Oracle functionality tests
- [ ] 95%+ line coverage

#### **Phase 3 Testing (User Interface)**
- [ ] NFT functionality tests
- [ ] Router integration tests
- [ ] User workflow tests
- [ ] 90%+ line coverage

#### **Phase 4 Testing (Integration)**
- [ ] End-to-end user flows
- [ ] Gas optimization benchmarks
- [ ] Security vulnerability tests
- [ ] 95%+ overall coverage

---

## 6.0 **Deployment & Scripts**

### 6.1 **Script Organization**
```
scripts/04-RubyswapV3/
├── deploy/
│   ├── 01-deploy-factory.ts
│   ├── 02-deploy-pool.ts
│   ├── 03-deploy-position-manager.ts
│   ├── 04-deploy-router.ts
│   └── 05-setup-initial-pools.ts
├── utils/
│   ├── verify-contracts.ts
│   ├── fund-accounts.ts
│   └── setup-testnet.ts
└── maintenance/
    ├── upgrade-contracts.ts
    └── emergency-pause.ts
```

### 6.2 **Deployment Process**

#### **6.2.1 Deployment Sequence**
1. **Factory Contract** - Core pool creation logic
2. **Initial Pools** - ETH/USDC, ETH/USDT, USDC/USDT
3. **Position Manager** - NFT position management
4. **Router** - User swap interface
5. **Verification** - Etherscan contract verification

#### **6.2.2 Deployment Scripts**
```typescript
// scripts/04-RubyswapV3/deploy/01-deploy-factory.ts
async function main() {
    const [deployer] = await ethers.getSigners();
    
    console.log("Deploying RubySwap Factory...");
    const factory = await RubySwapFactory.deploy();
    await factory.waitForDeployment();
    
    console.log("Factory deployed to:", await factory.getAddress());
    
    // Verify contract
    await verifyContract(await factory.getAddress(), []);
}

main().catch(console.error);
```

---

## 7.0 **Quality Assurance & Security**

### 7.1 **Code Quality Standards**
- **Gas Efficiency:** <200k gas per single-hop swap (target)
- **Test Coverage:** 95%+ line and branch coverage
- **Documentation:** Complete NatSpec documentation
- **Security:** Reentrancy protection, access controls, input validation

### 7.2 **Security Measures**
- **ReentrancyGuard:** All external functions
- **Access Control:** Owner-only administrative functions
- **Input Validation:** Comprehensive parameter validation
- **Oracle Security:** Deviation checks and safe mode activation

### 7.3 **Security Review Process**
- **Internal Review:** Weekly security code reviews
- **Review Criteria:** OWASP Top 10, DeFi-specific vulnerabilities
- **Acceptance Criteria:** All high/critical findings resolved
- **External Audit:** Phase 1 completion requirement

---

## 8.0 **Success Criteria & Metrics**

### 8.1 **Technical Success**
- [ ] All contracts compile without errors
- [ ] 95%+ test coverage achieved
- [ ] Gas target <200k per swap met
- [ ] All security measures implemented

### 8.2 **Functional Success**
- [ ] Core DEX functionality working
- [ ] NFT position management functional
- [ ] Slippage protection working
- [ ] Oracle integration functional

### 8.3 **Quality Success**
- [ ] Code reviewed and approved
- [ ] Documentation complete
- [ ] Ready for external audit
- [ ] Frontend integration successful

---

## 9.0 **Next Steps & Team Onboarding**

### 9.1 **Immediate Actions**
1. **Team Assembly:** Confirm team members and roles
2. **Environment Setup:** Complete development environment setup
3. **Project Structure:** Create all necessary directories and files
4. **Development Start:** Begin with core libraries implementation

### 9.2 **Team Onboarding Checklist**
- [ ] Development environment setup
- [ ] Git repository access
- [ ] Hardhat configuration verification
- [ ] Test environment setup
- [ ] Code review process training
- [ ] Security guidelines review

### 9.3 **Weekly Milestones**
- **Week 1:** Foundation and core libraries
- **Week 2-3:** Core AMM implementation
- **Week 4:** User interface contracts
- **Week 5:** Integration and testing
- **Week 6:** Deployment and audit preparation

---

**Document Owner:** Backend Team Lead  
**Review Cycle:** Weekly during development  
**Next Review:** Before development start  

**Ready for Implementation:** ✅  
**Team Approval Required:** 🔄

---

## 10.0 Current Implementation Gaps vs PRD (Tracking)

The following items are required by the PRD but are currently missing or only partially scaffolded in the codebase. These are organized for Phase 1 readiness, with later-phase items noted explicitly.

### 10.1 Router and UX Safety
- Slippage protection
  - Implement in `periphery/RubySwapRouter.sol` single-hop and multi-hop swap functions with explicit user-provided bounds:
    - `exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96))`
    - `exactOutputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountOut, uint256 amountInMaximum, uint160 sqrtPriceLimitX96))`
    - Revert with custom errors when `amountOut < amountOutMinimum` or `amountIn > amountInMaximum`.
  - Multi-hop routing
    - Implement `exactInput(bytes path, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum)` and `exactOutput(bytes path, address recipient, uint256 deadline, uint256 amountOut, uint256 amountInMaximum)` using canonical V3 path encoding `[tokenA][fee][tokenB][fee][tokenC]...`.
    - Parse path segments; perform sequential swaps; propagate slippage check at end (for exactInput) or track cumulative input (for exactOutput).
  - Periphery payments/multicall/self-permit
    - Add `IMulticall` to batch operations and minimize approvals.
    - Implement `ISelfPermit.selfPermit`/`selfPermitAllowed` to allow EIP-2612 approvals inline.
    - Implement `IPeripheryPayments`/`IPeripheryPaymentsWithFee` to handle ETH/WETH unwrap, refund, and optional fee-on-transfer scenarios.
- Quoter
  - Implement `periphery/RubySwapQuoter.sol` read-only quoting mirroring router signatures:
    - `quoteExactInputSingle(tokenIn, tokenOut, fee, amountIn, sqrtPriceLimitX96) returns (amountOut)`
    - `quoteExactOutputSingle(tokenIn, tokenOut, fee, amountOut, sqrtPriceLimitX96) returns (amountIn)`
    - `quoteExactInput(path, amountIn) returns (amountOut)`, `quoteExactOutput(path, amountOut) returns (amountIn)`
  - Use pool `swap` with a callback that always reverts after computing deltas; catch revert to extract quote.

Acceptance criteria
- Router enforces slippage on all swap variants; Quoter returns values matching on-chain swaps within 1 wei under controlled tests.
- Multi-hop path encoding/decoding tested with 2–3 hop paths and mixed fee tiers.

### 10.2 Oracle Strategy and Safety
- Chainlink primary feeds
  - Create `OracleRegistry` with mapping `token => AggregatorV3Interface feed` and `enabled` flag; only owner can set.
  - For Phase 1, only allow pool creation when both tokens have a registered Chainlink feed.
  - Handle decimals conversion: normalize to 18 decimals using `feed.decimals()`.
- TWAP fallback
  - Implement Uniswap V3-style observations array in pool (already declared) with:
    - `observe(uint32[] secondsAgos)` and `observeSingle(uint32 secondsAgo)`
    - `increaseObservationCardinalityNext(uint16 cardinalityNext)`
  - Maintain rolling observations on each swap/mint/burn; support 30-minute window (configurable) computation of tick- and seconds-per-liquidity cumulatives.
- 3% deviation safe mode
  - Implement library function `isSafePrice(token, twapPriceX96) returns (bool)` comparing Chainlink latestAnswer (normalized) vs pool 30m TWAP; revert or block limit-order execution when deviation > 3%.
  - Expose `getDeviationBps(token) returns (uint256)` for monitoring.

Acceptance criteria
- For supported assets, Chainlink price within ±3% of 30m TWAP allows operations; otherwise limit-order execution is blocked, swaps continue.
- Unit tests simulate feed deviations and confirm gating behavior.

### 10.3 Security and Controls
- Timelocks and access control
  - Use OpenZeppelin `TimelockController` with min delay = 48 hours for admin operations defined in PRD/TSD.
  - Adopt `AccessControl` or `Ownable2Step` for role separation (OWNER, OPERATOR, PAUSER).
- Emergency pause
  - Integrate `Pausable` in periphery and factory admin operations; add `whenNotPaused` modifiers where user safety is impacted (router, position manager sensitive actions).
- Reentrancy
  - Ensure pool `unlocked` is initialized to `true` in constructor; keep `lock` modifier.
  - Add `ReentrancyGuard` to periphery external functions that perform token transfers or callbacks.
- MEV resistance (limit orders)
  - Designate a private mempool submission strategy (Flashbots) for keeper bots; include docstrings and off-chain guidelines; no on-chain code dependency beyond event interfaces.

Acceptance criteria
- Timelocked actions demonstrably queued and executed; pausing halts router user operations; reentrancy tests pass.

### 10.4 Deployment and Operations
- Initial pool creation scripts
  - Implement `scripts/04-RubyswapV3/deploy/05-setup-initial-pools.ts` to:
    - Enable fee tiers: 500, 3000, 10000 with tick spacings (e.g., 10, 60, 200) in factory.
    - Create pools for ETH/USDC, ETH/USDT, USDC/USDT at appropriate tiers.
    - Initialize with sane `sqrtPriceX96` from Chainlink reference prices.
- Verification utility
  - Implement `utils/verify-contracts.ts` using Hardhat Etherscan plugin with constructor args support.
- Package scripts
  - Fix `contracts/04-RubyswapV3/package.json` to use TS deploy scripts: `hardhat run scripts/04-RubyswapV3/deploy/01-deploy-factory.ts --network sepolia`.
- IPFS for NFT metadata
  - Use `NonfungibleTokenPositionDescriptor`-like contract or simplified descriptor emitting `tokenURI` JSON; plan IPFS pinning via CI (Phase 1 optional, Phase 2 required).

Acceptance criteria
- End-to-end deploy on Sepolia creates and initializes pools; contracts verified; pools discoverable via events and `getPool`.

### 10.5 Testing and Quality Gates
- Coverage and gas reporting
  - Add `solidity-coverage` and `hardhat-gas-reporter` devDeps; configure reporters in hardhat config; set minimum coverage thresholds (line/branch 90% library, 85% core, 80% periphery).
- Test scope
  - Unit: libraries (TickMath, FullMath, SqrtPriceMath, SwapMath, Tick, Position), core pool functions, factory fee tier logic, router parameter enforcement, quoter correctness.
  - Integration: deploy+initialize, add/remove liquidity, collect fees, single-hop swap, multi-hop swap across mixed fees.
  - Fork (optional for Phase 1): quoting/swap sanity vs reference.

Acceptance criteria
- CI shows coverage above thresholds; gas reporter outputs for standard swap under target budget.

### 10.6 Non-Functional and Metrics
- Performance
  - Target: single-hop swap of major ERC-20s < 200k gas. Track `avg`, `p95` in tests; record in CI logs.
- Tooling
  - Add and configure: `solhint`, `prettier` + `prettier-plugin-solidity`, `husky` pre-commit (lint+format+tests), `lint-staged`.
  - Security static analysis: integrate Slither/Mythril in CI (advisory for Phase 1, required for audit prep).
- Frontend V3 integration
  - Expose ABI and addresses; provide sample `.json` artifacts and network mapping file for UI to consume.

Acceptance criteria
- Lint passes in CI; gas and coverage metrics exported as CI artifacts; artifacts ready for frontend consumption.

### 10.7 Documentation and Config Alignment
- Environment
  - Standardize on repo-root `.env` (current behavior) and document required keys: `SEPOLIA_RPC_URL`, `DEPLOYER_PRIVATE_KEY`, `ETHERSCAN_API_KEY`.
  - Document optional keys for gas reporter (e.g., `COINMARKETCAP_API_KEY`).
- Developer setup
  - Document installation and `npm scripts` for compile/test/coverage/gas/deploy/verify.

Acceptance criteria
- New contributors can follow docs to compile, test, and deploy without ambiguity.

### 10.8 Future/Phase-Two-and-Three Items (Expected Missing Now)
- Limit Orders via On-Chain Manager (Phase 2)
  - Contract with order book mapping, prepaid fee escrow (USDC), FOK semantics, expiry and `reclaimFee()`, keeper-only `executeOrder` path with deviation gating.
- LP Rewards / Yield Farming (Phase 2)
  - Staking of position NFTs; emissions schedule; oracle-based USD TVL normalization; lockup multipliers.
- Liquidity Migration Tools & Incentives (Phase 2)
  - Batch withdrawal from Uniswap and deposit into RubySwap; airdrop/bonus vesting accounting.
- Governance System (Phase 3)
  - RUBY token with staking; Governor + Timelock; quadratic voting via `sqrt(staked)`.

### 10.9 Minor Interface/Contract Gaps
- Factory
  - Events: `PoolCreated(token0, token1, fee, tickSpacing, pool)`; mappings `getPool(tokenA, tokenB, fee)`.
  - Functions: `enableFeeAmount(uint24 fee, int24 tickSpacing)`, `createPool(address tokenA, address tokenB, uint24 fee)`.
- Pool Deployer
  - Production deployer implementing `IRubySwapPoolDeployer.parameters()` and deterministic pool deployment.

### 10.10 Success Criteria Hooks
- CI
  - Add jobs to compute and publish: gas stats, coverage report, slither findings summary; fail build on thresholds.

### 10.11 External Integrations (Future)
- LayerZero / cross-chain
  - Track as Phase 2/3 milestone; define interface boundaries for future bridge adapters.

### 10.12 Miscellaneous
- NFT descriptor and metadata pipeline
  - Implement minimal on-chain descriptor initially; plan IPFS JSON schema and pinning workflow.

---

## **Appendix A: Team Communication & Tools**

### **Communication Channels**
- **Daily Standups:** Video calls or chat updates
- **Code Reviews:** GitHub pull requests
- **Documentation:** Shared Google Docs or Notion
- **Issue Tracking:** GitHub Issues or Jira

### **Development Tools**
- **Version Control:** Git with GitHub
- **IDE:** VS Code with Solidity extensions
- **Testing:** Hardhat + Chai + Mocha
- **Deployment:** Hardhat scripts + Etherscan verification

### **Quality Assurance Tools**
- **Linting:** Solhint + Prettier
- **Security:** Slither + Mythril
- **Gas Analysis:** Hardhat Gas Reporter
- **Coverage:** Hardhat Coverage 