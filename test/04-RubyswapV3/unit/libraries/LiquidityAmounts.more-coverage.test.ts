import { expect } from 'chai';
import { ethers } from 'hardhat';

const Q96 = 2n ** 96n;

function toQ96(x: bigint): bigint {
  // x is an integer price sqrt; scale by Q96
  return x * Q96;
}

describe('LiquidityAmounts - Additional Coverage', () => {
  let tester: any;
  before(async () => {
    const Factory = await ethers.getContractFactory('LiquidityAmountsTester');
    tester = await Factory.deploy();
    await tester.waitForDeployment();
  });

  it('getLiquidityForAmounts: region sqrtX <= sqrtA uses amount0 path', async () => {
    const sqrtA = toQ96(1000n);
    const sqrtB = toQ96(2000n);
    const sqrtX = toQ96(900n); // <= sqrtA
    const amount0 = 1_000_000n;
    const amount1 = 2_000_000n;
    const L = await tester.testGetLiquidityForAmounts(sqrtX, sqrtA, sqrtB, amount0, amount1);
    const expectedL0 = await tester.testGetLiquidityForAmount0(sqrtA, sqrtB, amount0);
    expect(L).to.equal(expectedL0);
  });

  it('getLiquidityForAmounts: middle region uses min(liquidity0, liquidity1)', async () => {
    const sqrtA = toQ96(1000n);
    const sqrtB = toQ96(2000n);
    const sqrtX = toQ96(1500n); // between A and B
    const amount0 = 1_000_000n;
    const amount1 = 2_000_000n;
    const L = await tester.testGetLiquidityForAmounts(sqrtX, sqrtA, sqrtB, amount0, amount1);
    const L0 = await tester.testGetLiquidityForAmount0(sqrtX, sqrtB, amount0);
    const L1 = await tester.testGetLiquidityForAmount1(sqrtA, sqrtX, amount1);
    const min = L0 < L1 ? L0 : L1;
    expect(L).to.equal(min);
  });

  it('getLiquidityForAmounts: region sqrtX >= sqrtB uses amount1 path', async () => {
    const sqrtA = toQ96(1000n);
    const sqrtB = toQ96(2000n);
    const sqrtX = toQ96(2500n); // >= sqrtB
    const amount0 = 1_000_000n;
    const amount1 = 2_000_000n;
    const L = await tester.testGetLiquidityForAmounts(sqrtX, sqrtA, sqrtB, amount0, amount1);
    const expectedL1 = await tester.testGetLiquidityForAmount1(sqrtA, sqrtB, amount1);
    expect(L).to.equal(expectedL1);
  });

  it('getAmountsForLiquidity: middle region returns both non-zero amounts', async () => {
    const sqrtA = toQ96(1000n);
    const sqrtB = toQ96(2000n);
    const sqrtX = toQ96(1500n);
    const L = 1_000_000n;
    const [a0, a1] = await tester.testGetAmountsForLiquidity(sqrtX, sqrtA, sqrtB, L);
    expect(a0).to.be.gt(0n);
    expect(a1).to.be.gt(0n);
  });

  it('getAmountsForLiquidity: region sqrtX <= sqrtA returns only amount0', async () => {
    const sqrtA = toQ96(1000n);
    const sqrtB = toQ96(2000n);
    const sqrtX = toQ96(900n);
    const L = 1_000_000n;
    const [a0, a1] = await tester.testGetAmountsForLiquidity(sqrtX, sqrtA, sqrtB, L);
    expect(a0).to.be.gt(0n);
    expect(a1).to.equal(0n);
  });

  it('getAmountsForLiquidity: region sqrtX >= sqrtB returns only amount1', async () => {
    const sqrtA = toQ96(1000n);
    const sqrtB = toQ96(2000n);
    const sqrtX = toQ96(2500n);
    const L = 1_000_000n;
    const [a0, a1] = await tester.testGetAmountsForLiquidity(sqrtX, sqrtA, sqrtB, L);
    expect(a0).to.equal(0n);
    expect(a1).to.be.gt(0n);
  });
});

describe('LiquidityAmounts - Additional Branches', () => {
  it('getLiquidityForAmounts: mid-range uses min(liq0, liq1)', async () => {
    const Test = await ethers.getContractFactory('LiquidityAmountsTester');
    const t = await Test.deploy();
    await t.waitForDeployment();
    const Q96 = 79228162514264337593543950336n;
    const sqrtA = Q96;           // 1.0
    const sqrtB = Q96 * 2n;      // 2.0
    const sqrtX = (Q96 * 3n) / 2n; // 1.5, between A and B
    const L = await t.testGetLiquidityForAmounts(sqrtX, sqrtA, sqrtB, Q96, Q96);
    expect(L).to.be.gt(0n);
  });

  it('getAmountsForLiquidity: covers all branches and swapped bounds', async () => {
    const Test = await ethers.getContractFactory('LiquidityAmountsTester');
    const t = await Test.deploy();
    await t.waitForDeployment();
    const Q96 = 79228162514264337593543950336n;
    const sqrtA = Q96;
    const sqrtB = Q96 * 2n;
    const L = 123456789n;

    // below range -> amount0 only
    const [a0Below, a1Below] = await t.testGetAmountsForLiquidity(Q96 / 2n, sqrtA, sqrtB, L);
    expect(a0Below).to.be.gt(0n); expect(a1Below).to.equal(0n);

    // mid range -> both
    const [a0Mid, a1Mid] = await t.testGetAmountsForLiquidity((Q96 * 3n) / 2n, sqrtA, sqrtB, L);
    expect(a0Mid).to.be.gt(0n); expect(a1Mid).to.be.gt(0n);

    // above range -> amount1 only
    const [a0Above, a1Above] = await t.testGetAmountsForLiquidity(Q96 * 3n, sqrtA, sqrtB, L);
    expect(a0Above).to.equal(0n); expect(a1Above).to.be.gt(0n);

    // swapped bounds handled internally
    const [a0Swap, a1Swap] = await t.testGetAmountsForLiquidity((Q96 * 3n) / 2n, sqrtB, sqrtA, L);
    expect(a0Swap).to.be.gt(0n); expect(a1Swap).to.be.gt(0n);
  });
}); 