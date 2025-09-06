import { expect } from 'chai';
import { ethers } from 'hardhat';

describe('SqrtPriceMath - Additional Coverage', () => {
  it('getNextSqrtPriceFromAmount0RoundingUp: amount==0 returns input price', async () => {
    const Test = await ethers.getContractFactory('TestSqrtPriceMath');
    const t = await Test.deploy();
    await t.waitForDeployment();
    const sqrt = 1000n;
    const res = await t.getNextSqrtPriceFromInputWrapper(sqrt, 1n, 0n, true);
    expect(res).to.equal(sqrt);
  });

  it('getNextSqrtPriceFromAmount1RoundingDown: subtract underflow path reverts', async () => {
    const Test = await ethers.getContractFactory('TestSqrtPriceMath');
    const t = await Test.deploy();
    await t.waitForDeployment();
    const sqrt = 1000n;
    // Tiny liquidity with huge amountOut forces quotient >= sqrt -> require(sqrt > quotient) fail
    await expect(
      t.getNextSqrtPriceFromOutputWrapper(sqrt, 1n, (1n << 200n), true)
    ).to.be.reverted;
  });

  it('getNextSqrtPriceFromInput: reverts on zero liquidity', async () => {
    const Test = await ethers.getContractFactory('TestSqrtPriceMath');
    const t = await Test.deploy();
    await t.waitForDeployment();
    await expect(
      t.getNextSqrtPriceFromInputWrapper(1000n, 0n, 1n, true)
    ).to.be.reverted;
  });
}); 