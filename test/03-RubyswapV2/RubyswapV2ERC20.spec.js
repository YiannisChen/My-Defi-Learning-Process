/** RubyswapV2ERC20
    ✔ name, symbol, decimals, totalSupply, balanceOf
    ✔ approve (223ms)
    ✔ transfer (416ms)
    ✔ transfer:fail (152ms)
    ✔ transferFrom (299ms)
    ✔ transferFrom:max (681ms)
    ✔ mint (226ms)
    ✔ burn (112ms)
    ✔ nested function calls in transferFrom work correctly (624ms)
    ✔ infinite approval works correctly (284ms)
    ✔ self transfers work correctly


  11 passing (11s) */
const { expect } = require("chai");
const { ethers } = require("hardhat");

function expandTo18Decimals(n) {
  return ethers.parseUnits(n.toString(), 18);
}

const TOTAL_SUPPLY = expandTo18Decimals(10000);
const TEST_AMOUNT = expandTo18Decimals(10);

describe("RubyswapV2ERC20", () => {
  let wallet, other;
  let token;

  beforeEach(async () => {
    [wallet, other] = await ethers.getSigners();
    
    // Deploy the ERC20 test contract
    const ERC20Factory = await ethers.getContractFactory("contracts/03-dexV2-clone/core-contracts/test/ERC20.sol:ERC20");
    token = await ERC20Factory.deploy();
    await token.waitForDeployment(); // Use waitForDeployment instead of deployed
    
    // Mint the initial supply to the wallet
    await token.mint(wallet.address, TOTAL_SUPPLY);
  });

  it("name, symbol, decimals, totalSupply, balanceOf", async () => {
    expect(await token.name()).to.eq("Rubyswap V2");
    expect(await token.symbol()).to.eq("RUBY-V2");
    expect(await token.decimals()).to.eq(18);
    expect(await token.totalSupply()).to.eq(TOTAL_SUPPLY);
    expect(await token.balanceOf(wallet.address)).to.eq(TOTAL_SUPPLY);
  });

  it("approve", async () => {
    await expect(token.approve(other.address, TEST_AMOUNT))
      .to.emit(token, "Approval")
      .withArgs(wallet.address, other.address, TEST_AMOUNT);
    expect(await token.allowance(wallet.address, other.address)).to.eq(TEST_AMOUNT);
  });

  it("transfer", async () => {
    await expect(token.transfer(other.address, TEST_AMOUNT))
      .to.emit(token, "Transfer")
      .withArgs(wallet.address, other.address, TEST_AMOUNT);
    // Use bigint operations instead of BigNumber methods
    expect(await token.balanceOf(wallet.address)).to.eq(TOTAL_SUPPLY - TEST_AMOUNT);
    expect(await token.balanceOf(other.address)).to.eq(TEST_AMOUNT);
  });

  it("transfer:fail", async () => {
    await expect(token.transfer(other.address, TOTAL_SUPPLY + 1n)).to.be.reverted;
    await expect(token.connect(other).transfer(wallet.address, 1)).to.be.reverted;
  });

  it("transferFrom", async () => {
    await token.approve(other.address, TEST_AMOUNT);
    await expect(token.connect(other).transferFrom(wallet.address, other.address, TEST_AMOUNT))
      .to.emit(token, "Transfer")
      .withArgs(wallet.address, other.address, TEST_AMOUNT);
    expect(await token.allowance(wallet.address, other.address)).to.eq(0);
    expect(await token.balanceOf(wallet.address)).to.eq(TOTAL_SUPPLY - TEST_AMOUNT);
    expect(await token.balanceOf(other.address)).to.eq(TEST_AMOUNT);
  });

  it("transferFrom:max", async () => {
    const MAX_UINT = ethers.MaxUint256; // Updated from ethers.constants.MaxUint256
    await token.approve(other.address, MAX_UINT);
    await expect(token.connect(other).transferFrom(wallet.address, other.address, TEST_AMOUNT))
      .to.emit(token, "Transfer")
      .withArgs(wallet.address, other.address, TEST_AMOUNT);
    expect(await token.allowance(wallet.address, other.address)).to.eq(MAX_UINT);
    expect(await token.balanceOf(wallet.address)).to.eq(TOTAL_SUPPLY - TEST_AMOUNT);
    expect(await token.balanceOf(other.address)).to.eq(TEST_AMOUNT);
  });

  it("mint", async () => {
    const mintAmount = expandTo18Decimals(100);
    await expect(token.mint(other.address, mintAmount))
      .to.emit(token, "Transfer")
      .withArgs(ethers.ZeroAddress, other.address, mintAmount); // Updated from ethers.constants.AddressZero
    expect(await token.totalSupply()).to.eq(TOTAL_SUPPLY + mintAmount);
    expect(await token.balanceOf(other.address)).to.eq(mintAmount);
  });

  it("burn", async () => {
    const burnAmount = expandTo18Decimals(100);
    // First, transfer some tokens to other address
    await token.transfer(other.address, burnAmount);
    
    await expect(token.burn(other.address, burnAmount))
      .to.emit(token, "Transfer")
      .withArgs(other.address, ethers.ZeroAddress, burnAmount); // Updated from ethers.constants.AddressZero
    expect(await token.totalSupply()).to.eq(TOTAL_SUPPLY - burnAmount);
    expect(await token.balanceOf(other.address)).to.eq(0);
  });

  it("nested function calls in transferFrom work correctly", async () => {
    // This test checks that the allowance deduction in transferFrom works correctly
    // when there are nested function calls
    await token.approve(other.address, TEST_AMOUNT * 2n); // Use bigint multiplication
    
    // First transferFrom should succeed and reduce allowance
    await token.connect(other).transferFrom(wallet.address, other.address, TEST_AMOUNT);
    expect(await token.allowance(wallet.address, other.address)).to.eq(TEST_AMOUNT);
    
    // Second transferFrom should also succeed
    await token.connect(other).transferFrom(wallet.address, other.address, TEST_AMOUNT);
    expect(await token.allowance(wallet.address, other.address)).to.eq(0);
    
    // Third transferFrom should fail due to insufficient allowance
    await expect(token.connect(other).transferFrom(wallet.address, other.address, 1)).to.be.reverted;
  });

  it("infinite approval works correctly", async () => {
    const MAX_UINT = ethers.MaxUint256; // Updated from ethers.constants.MaxUint256
    await token.approve(other.address, MAX_UINT);
    
    // Multiple transferFrom calls should work without reducing the allowance
    await token.connect(other).transferFrom(wallet.address, other.address, TEST_AMOUNT);
    expect(await token.allowance(wallet.address, other.address)).to.eq(MAX_UINT);
    
    await token.connect(other).transferFrom(wallet.address, other.address, TEST_AMOUNT);
    expect(await token.allowance(wallet.address, other.address)).to.eq(MAX_UINT);
    
    // Make sure the balance changes are correct
    expect(await token.balanceOf(wallet.address)).to.eq(TOTAL_SUPPLY - (TEST_AMOUNT * 2n)); // Use bigint operations
    expect(await token.balanceOf(other.address)).to.eq(TEST_AMOUNT * 2n); // Use bigint operations
  });

  it("self transfers work correctly", async () => {
    await expect(token.transfer(wallet.address, TEST_AMOUNT))
      .to.emit(token, "Transfer")
      .withArgs(wallet.address, wallet.address, TEST_AMOUNT);
    expect(await token.balanceOf(wallet.address)).to.eq(TOTAL_SUPPLY);
  });
});