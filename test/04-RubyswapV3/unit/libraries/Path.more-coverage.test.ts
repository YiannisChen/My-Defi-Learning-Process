import { expect } from 'chai';
import { ethers } from 'hardhat';

describe('Path - Additional Coverage', () => {
  let pathWrapper: any;
  before(async () => {
    const Factory = await ethers.getContractFactory('TestPath');
    pathWrapper = await Factory.deploy();
    await pathWrapper.waitForDeployment();
  });

  function addr(a: string) {
    return a.replace('0x', '').padStart(40, '0');
  }
  function fee(n: number) {
    return n.toString(16).padStart(6, '0');
  }

  it('numPools counts segments correctly', async () => {
    const [a, b, c] = [ethers.ZeroAddress, '0x0000000000000000000000000000000000000001', '0x0000000000000000000000000000000000000002'];
    const p = '0x' + addr(b) + fee(3000) + addr(c);
    const pools = await pathWrapper.numPools(p);
    expect(pools).to.equal(1n);
  });

  it('hasMultiplePools detects multi-hop path', async () => {
    const [a, b, c] = [
      '0x0000000000000000000000000000000000000001',
      '0x0000000000000000000000000000000000000002',
      '0x0000000000000000000000000000000000000003'
    ];
    const p = '0x' + addr(a) + fee(3000) + addr(b) + fee(500) + addr(c);
    expect(await pathWrapper.hasMultiplePools(p)).to.equal(true);
  });

  it('decodeFirstPool returns correct tuple', async () => {
    const [a, b] = [
      '0x0000000000000000000000000000000000000001',
      '0x0000000000000000000000000000000000000002'
    ];
    const p = '0x' + addr(a) + fee(3000) + addr(b);
    const [ta, tb, f] = await pathWrapper.decodeFirstPool(p);
    expect(ta.toLowerCase()).to.equal(a.toLowerCase());
    expect(tb.toLowerCase()).to.equal(b.toLowerCase());
    expect(f).to.equal(3000);
  });

  it('toAddress and toUint24 enforce bounds', async () => {
    const bytes = '0x' + '11'.repeat(30);
    await expect(pathWrapper.toAddress(bytes, 15)).to.be.revertedWith('INVALID_ADDRESS');
    await expect(pathWrapper.toUint24(bytes, 30)).to.be.revertedWith('INVALID_FEE');
  });

  it('slice enforces bounds', async () => {
    const bytes = '0x' + 'aa'.repeat(10);
    await expect(pathWrapper.slice(bytes, 5, 20)).to.be.revertedWith('INVALID_SLICE');
  });
}); 