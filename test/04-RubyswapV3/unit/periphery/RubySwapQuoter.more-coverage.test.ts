import { expect } from 'chai';
import { ethers } from 'hardhat';

describe('RubySwapQuoter - More Coverage', () => {
  it('quoteExactOutput handles multi-hop recursion', async () => {
    const [deployer] = await ethers.getSigners();
    // Deploy timelock and factory
    const Timelock = await ethers.getContractFactory('RubySwapTimelock');
    const timelock = await Timelock.deploy([deployer.address], [deployer.address], deployer.address);
    await timelock.waitForDeployment();
    const Factory = await ethers.getContractFactory('RubySwapFactory');
    const factory = await Factory.deploy(await timelock.getAddress());
    await factory.waitForDeployment();

    // Tokens
    const ERC20 = await ethers.getContractFactory('MockERC20');
    const tokenA = await ERC20.deploy('A', 'A', 18);
    const tokenB = await ERC20.deploy('B', 'B', 18);
    const tokenC = await ERC20.deploy('C', 'C', 18);
    await tokenA.waitForDeployment();
    await tokenB.waitForDeployment();
    await tokenC.waitForDeployment();

    // Oracles
    const OracleRegistry = await ethers.getContractFactory('OracleRegistry');
    const oracle = OracleRegistry.attach(await factory.oracleRegistry());
    const Feed = await ethers.getContractFactory('MockAggregatorV3');
    const fa = await Feed.deploy(100000000); // $1
    const fb = await Feed.deploy(200000000); // $2
    const fc = await Feed.deploy(300000000); // $3
    await fa.waitForDeployment();
    await fb.waitForDeployment();
    await fc.waitForDeployment();
    await oracle.setFeed(await tokenA.getAddress(), await fa.getAddress());
    await oracle.setFeed(await tokenB.getAddress(), await fb.getAddress());
    await oracle.setFeed(await tokenC.getAddress(), await fc.getAddress());

    // Create two pools A->B and B->C
    await factory.createPool(await tokenA.getAddress(), await tokenB.getAddress(), 3000);
    await factory.createPool(await tokenB.getAddress(), await tokenC.getAddress(), 3000);
    const poolAB = await ethers.getContractAt('RubySwapPool', await factory.getPool(await tokenA.getAddress(), await tokenB.getAddress(), 3000));
    const poolBC = await ethers.getContractAt('RubySwapPool', await factory.getPool(await tokenB.getAddress(), await tokenC.getAddress(), 3000));
    await poolAB.initialize('79228162514264337593543950336');
    await poolBC.initialize('79228162514264337593543950336');

    // Provide small liquidity
    const PM = await ethers.getContractFactory('RubySwapPositionManager');
    const pm = await PM.deploy(await factory.getAddress(), ethers.ZeroAddress, 'P', 'P');
    await pm.waitForDeployment();

    await tokenA.mint(deployer.address, ethers.parseEther('10'));
    await tokenB.mint(deployer.address, ethers.parseEther('10'));
    await tokenC.mint(deployer.address, ethers.parseEther('10'));

    await tokenA.approve(await pm.getAddress(), ethers.MaxUint256);
    await tokenB.approve(await pm.getAddress(), ethers.MaxUint256);
    await tokenC.approve(await pm.getAddress(), ethers.MaxUint256);

    const blk = await ethers.provider.getBlock('latest');
    const deadline = Number(blk!.timestamp) + 3600;

    await pm.mint({ token0: await tokenA.getAddress(), token1: await tokenB.getAddress(), fee: 3000, tickLower: -60, tickUpper: 60, amount0Desired: ethers.parseEther('1'), amount1Desired: ethers.parseEther('1'), amount0Min: 0, amount1Min: 0, recipient: deployer.address, deadline });
    await pm.mint({ token0: await tokenB.getAddress(), token1: await tokenC.getAddress(), fee: 3000, tickLower: -60, tickUpper: 60, amount0Desired: ethers.parseEther('1'), amount1Desired: ethers.parseEther('1'), amount0Min: 0, amount1Min: 0, recipient: deployer.address, deadline });

    const Quoter = await ethers.getContractFactory('RubySwapQuoter');
    const quoter = await Quoter.deploy(await factory.getAddress());
    await quoter.waitForDeployment();

    const path = ethers.solidityPacked(['address','uint24','address','uint24','address'], [await tokenA.getAddress(), 3000, await tokenB.getAddress(), 3000, await tokenC.getAddress()]);
    const amountIn = await quoter.quoteExactOutput.staticCall(path, 1000n);
    expect(amountIn).to.be.greaterThan(0n);
  });

  it('quoteExactInput covers multi-hop path and zero-address/path errors', async () => {
    const [deployer] = await ethers.getSigners();
    const Timelock = await ethers.getContractFactory('RubySwapTimelock');
    const timelock = await Timelock.deploy([deployer.address], [deployer.address], deployer.address);
    await timelock.waitForDeployment();
    const Factory = await ethers.getContractFactory('RubySwapFactory');
    const factory = await Factory.deploy(await timelock.getAddress());
    await factory.waitForDeployment();

    const ERC20 = await ethers.getContractFactory('MockERC20');
    const tokenA = await ERC20.deploy('A', 'A', 18);
    const tokenB = await ERC20.deploy('B', 'B', 18);
    const tokenC = await ERC20.deploy('C', 'C', 18);
    await tokenA.waitForDeployment();
    await tokenB.waitForDeployment();
    await tokenC.waitForDeployment();

    const OracleRegistry = await ethers.getContractFactory('OracleRegistry');
    const oracle = OracleRegistry.attach(await factory.oracleRegistry());
    const Feed = await ethers.getContractFactory('MockAggregatorV3');
    const fa = await Feed.deploy(100000000);
    const fb = await Feed.deploy(200000000);
    const fc = await Feed.deploy(300000000);
    await fa.waitForDeployment();
    await fb.waitForDeployment();
    await fc.waitForDeployment();
    await oracle.setFeed(await tokenA.getAddress(), await fa.getAddress());
    await oracle.setFeed(await tokenB.getAddress(), await fb.getAddress());
    await oracle.setFeed(await tokenC.getAddress(), await fc.getAddress());

    await factory.createPool(await tokenA.getAddress(), await tokenB.getAddress(), 3000);
    await factory.createPool(await tokenB.getAddress(), await tokenC.getAddress(), 3000);
    const poolAB = await ethers.getContractAt('RubySwapPool', await factory.getPool(await tokenA.getAddress(), await tokenB.getAddress(), 3000));
    const poolBC = await ethers.getContractAt('RubySwapPool', await factory.getPool(await tokenB.getAddress(), await tokenC.getAddress(), 3000));
    await poolAB.initialize('79228162514264337593543950336');
    await poolBC.initialize('79228162514264337593543950336');

    const PM = await ethers.getContractFactory('RubySwapPositionManager');
    const pm = await PM.deploy(await factory.getAddress(), ethers.ZeroAddress, 'P', 'P');
    await pm.waitForDeployment();

    await tokenA.mint(deployer.address, ethers.parseEther('10'));
    await tokenB.mint(deployer.address, ethers.parseEther('10'));
    await tokenC.mint(deployer.address, ethers.parseEther('10'));
    await tokenA.approve(await pm.getAddress(), ethers.MaxUint256);
    await tokenB.approve(await pm.getAddress(), ethers.MaxUint256);
    await tokenC.approve(await pm.getAddress(), ethers.MaxUint256);

    const blk = await ethers.provider.getBlock('latest');
    const deadline = Number(blk!.timestamp) + 3600;
    await pm.mint({ token0: await tokenA.getAddress(), token1: await tokenB.getAddress(), fee: 3000, tickLower: -60, tickUpper: 60, amount0Desired: ethers.parseEther('1'), amount1Desired: ethers.parseEther('1'), amount0Min: 0, amount1Min: 0, recipient: deployer.address, deadline });
    await pm.mint({ token0: await tokenB.getAddress(), token1: await tokenC.getAddress(), fee: 3000, tickLower: -60, tickUpper: 60, amount0Desired: ethers.parseEther('1'), amount1Desired: ethers.parseEther('1'), amount0Min: 0, amount1Min: 0, recipient: deployer.address, deadline });

    const Quoter = await ethers.getContractFactory('RubySwapQuoter');
    const quoter = await Quoter.deploy(await factory.getAddress());
    await quoter.waitForDeployment();

    const path = ethers.solidityPacked(['address','uint24','address','uint24','address'], [await tokenA.getAddress(), 3000, await tokenB.getAddress(), 3000, await tokenC.getAddress()]);
    const amountOut = await quoter.quoteExactInput.staticCall(path, 1000n);
    expect(amountOut).to.be.greaterThan(0n);
  });

  it('quoteExactInput/Output revert on PATH_INVALID and zero addresses', async () => {
    const Timelock = await ethers.getContractFactory('RubySwapTimelock');
    const timelock = await Timelock.deploy([ethers.ZeroAddress], [ethers.ZeroAddress], ethers.ZeroAddress);
    await timelock.waitForDeployment();
    const Factory = await ethers.getContractFactory('RubySwapFactory');
    const factory = await Factory.deploy(await timelock.getAddress());
    await factory.waitForDeployment();

    const Quoter = await ethers.getContractFactory('RubySwapQuoter');
    const quoter = await Quoter.deploy(await factory.getAddress());
    await quoter.waitForDeployment();

    await expect(quoter.quoteExactInput('0x', 1)).to.be.revertedWith('PATH_INVALID');
    await expect(quoter.quoteExactOutput('0x', 1)).to.be.revertedWith('PATH_INVALID');

    const badPath = ethers.solidityPacked(['address','uint24','address'], [ethers.ZeroAddress, 3000, ethers.ZeroAddress]);
    await expect(quoter.quoteExactInput(badPath, 1)).to.be.revertedWith('PATH_ZERO_ADDR');
  });
}); 