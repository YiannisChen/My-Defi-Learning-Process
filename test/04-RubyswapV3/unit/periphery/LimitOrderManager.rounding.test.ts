import { expect } from "chai";
import { ethers } from "hardhat";

describe("LimitOrderManager rounding", () => {
  it("computes keeper incentive token units with ceil for dec<18 and scale for dec>18", async () => {
    const [deployer] = await ethers.getSigners();
    const MockERC20 = await ethers.getContractFactory("MockERC20");

    // feeToken with 6 decimals
    const usdc = await MockERC20.deploy("USDC", "USDC", 6);
    await usdc.waitForDeployment();

    // feeToken with 20 decimals
    const weird20 = await MockERC20.deploy("W20", "W20", 20);
    await weird20.waitForDeployment();

    const Router = await ethers.getContractFactory("RubySwapRouter");
    const OracleRegistry = await ethers.getContractFactory("OracleRegistry");
    const RubySwapFactory = await ethers.getContractFactory("RubySwapFactory");

    // Minimal factory + WETH to satisfy router
    const factory = await RubySwapFactory.deploy(deployer.address);
    await factory.waitForDeployment();
    const weth = await MockERC20.deploy("WETH", "WETH", 18);
    await weth.waitForDeployment();
    const router = await Router.deploy(await factory.getAddress(), await weth.getAddress());
    await router.waitForDeployment();
    const reg = await OracleRegistry.deploy();
    await reg.waitForDeployment();

    const LOM = await ethers.getContractFactory("LimitOrderManager");
    const lom = await LOM.deploy(
      await router.getAddress(),
      await reg.getAddress(),
      await usdc.getAddress(),
      0, // initial incentive ignored in this test (we'll set via setKeeperConfig)
      500_000
    );
    await lom.waitForDeployment();

    // Admin role is deployer by constructor; set feeToken to USDC (6 decimals) and keeperFixedIncentiveUsd18 to 1e18+1
    const incUsd18 = ethers.parseEther("1") + 1n;
    await lom.setKeeperConfig(await usdc.getAddress(), incUsd18, 500_000, 2000);
    const usdcPolicy = await lom.getEscrowPolicy();
    const usdcUnits = usdcPolicy[0];
    // For 6 decimals, token units = ceil(incUsd18 / 1e12)
    const expectedUsdcUnits = (incUsd18 + 10n**12n - 1n) / (10n**12n);
    expect(usdcUnits).to.equal(expectedUsdcUnits);

    // Now switch to a 20-decimal token; token units = incUsd18 * 1e2
    await lom.setKeeperConfig(await weird20.getAddress(), incUsd18, 500_000, 2000);
    const w20Policy = await lom.getEscrowPolicy();
    const w20Units = w20Policy[0];
    const expectedW20Units = incUsd18 * 100n;
    expect(w20Units).to.equal(expectedW20Units);
  });
}); 
import { ethers } from "hardhat";

describe("LimitOrderManager rounding", () => {
  it("computes keeper incentive token units with ceil for dec<18 and scale for dec>18", async () => {
    const [deployer] = await ethers.getSigners();
    const MockERC20 = await ethers.getContractFactory("MockERC20");

    // feeToken with 6 decimals
    const usdc = await MockERC20.deploy("USDC", "USDC", 6);
    await usdc.waitForDeployment();

    // feeToken with 20 decimals
    const weird20 = await MockERC20.deploy("W20", "W20", 20);
    await weird20.waitForDeployment();

    const Router = await ethers.getContractFactory("RubySwapRouter");
    const OracleRegistry = await ethers.getContractFactory("OracleRegistry");
    const RubySwapFactory = await ethers.getContractFactory("RubySwapFactory");

    // Minimal factory + WETH to satisfy router
    const factory = await RubySwapFactory.deploy(deployer.address);
    await factory.waitForDeployment();
    const weth = await MockERC20.deploy("WETH", "WETH", 18);
    await weth.waitForDeployment();
    const router = await Router.deploy(await factory.getAddress(), await weth.getAddress());
    await router.waitForDeployment();
    const reg = await OracleRegistry.deploy();
    await reg.waitForDeployment();

    const LOM = await ethers.getContractFactory("LimitOrderManager");
    const lom = await LOM.deploy(
      await router.getAddress(),
      await reg.getAddress(),
      await usdc.getAddress(),
      0, // initial incentive ignored in this test (we'll set via setKeeperConfig)
      500_000
    );
    await lom.waitForDeployment();

    // Admin role is deployer by constructor; set feeToken to USDC (6 decimals) and keeperFixedIncentiveUsd18 to 1e18+1
    const incUsd18 = ethers.parseEther("1") + 1n;
    await lom.setKeeperConfig(await usdc.getAddress(), incUsd18, 500_000, 2000);
    const usdcPolicy = await lom.getEscrowPolicy();
    const usdcUnits = usdcPolicy[0];
    // For 6 decimals, token units = ceil(incUsd18 / 1e12)
    const expectedUsdcUnits = (incUsd18 + 10n**12n - 1n) / (10n**12n);
    expect(usdcUnits).to.equal(expectedUsdcUnits);

    // Now switch to a 20-decimal token; token units = incUsd18 * 1e2
    await lom.setKeeperConfig(await weird20.getAddress(), incUsd18, 500_000, 2000);
    const w20Policy = await lom.getEscrowPolicy();
    const w20Units = w20Policy[0];
    const expectedW20Units = incUsd18 * 100n;
    expect(w20Units).to.equal(expectedW20Units);
  });
}); 