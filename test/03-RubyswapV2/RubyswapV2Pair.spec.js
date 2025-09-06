/**
 * RubyswapV2Factory
    Deployment
      ✔ Should set the right owner
      ✔ Should start with zero pairs (115ms)
    createPair
      ✔ Should create a new pair (747ms)
      ✔ Should fail when creating a pair with identical tokens
      ✔ Should fail when creating a pair with zero address
      ✔ Should fail when pair already exists (737ms)
      ✔ Should create multiple different pairs (2896ms)
      ✔ Should initialize pair correctly (644ms)
    Address sorting
      ✔ Should sort token addresses correctly (2254ms)
    Access control
      ✔ Should allow anyone to create pairs (568ms)


  10 passing (25s) */
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("RubyswapV2Factory", function () {
  let factory;
  let owner;
  let user;
  let token0;
  let token1;
  let token2;

  beforeEach(async function () {
    // Get signers
    [owner, user] = await ethers.getSigners();

    // Deploy the factory contract
    const RubyswapV2Factory = await ethers.getContractFactory("RubyswapV2Factory");
    factory = await RubyswapV2Factory.deploy();
    
    // Deploy test ERC20 tokens for creating pairs
    const ERC20Factory = await ethers.getContractFactory("contracts/03-dexV2-clone/core-contracts/test/ERC20.sol:ERC20");
    token0 = await ERC20Factory.deploy();
    token1 = await ERC20Factory.deploy();
    token2 = await ERC20Factory.deploy();
    
    // Mint some tokens for testing
    await token0.mint(owner.address, ethers.parseUnits("1000000", 18));
    await token1.mint(owner.address, ethers.parseUnits("1000000", 18));
    await token2.mint(owner.address, ethers.parseUnits("1000000", 18));
    
    // Ensure token0 address is less than token1 for deterministic tests
    const token0Address = await token0.getAddress();
    const token1Address = await token1.getAddress();
    
    if (token0Address.toLowerCase() > token1Address.toLowerCase()) {
      // Swap if needed to ensure token0 < token1
      const temp = token0;
      token0 = token1;
      token1 = temp;
    }
  });

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      expect(await factory.owner()).to.equal(owner.address);
    });

    it("Should start with zero pairs", async function () {
      expect(await factory.allPairsLength()).to.equal(0);
    });
  });

  describe("createPair", function () {
    it("Should create a new pair", async function () {
      const token0Address = await token0.getAddress();
      const token1Address = await token1.getAddress();
      
      // Create a pair
      const tx = await factory.createPair(token0Address, token1Address);
      const receipt = await tx.wait();
      
      // Verify a pair was created
      expect(await factory.allPairsLength()).to.equal(1);
      
      // Verify the pair address was stored correctly
      const pairAddress = await factory.getPair(token0Address, token1Address);
      expect(pairAddress).to.not.equal(ethers.ZeroAddress);
      
      // Verify the pair is accessible from both token directions
      expect(await factory.getPair(token1Address, token0Address)).to.equal(pairAddress);
      
      // Verify the pair is in the allPairs array
      expect(await factory.allPairs(0)).to.equal(pairAddress);
      
      // Check PairCreated event was emitted with correct data
      const event = receipt.logs.find(
        log => log.fragment && log.fragment.name === 'PairCreated'
      );
      expect(event).to.not.be.undefined;
      
      // Verify event arguments
      expect(event.args[0]).to.equal(token0Address); // token0
      expect(event.args[1]).to.equal(token1Address); // token1
      expect(event.args[2]).to.equal(pairAddress);   // pair address
      expect(event.args[3]).to.equal(1);             // pair length
    });

    it("Should fail when creating a pair with identical tokens", async function () {
      const token0Address = await token0.getAddress();
      
      await expect(
        factory.createPair(token0Address, token0Address)
      ).to.be.revertedWith('RubyswapV2: IDENTICAL_ADDRESSES');
    });

    it("Should fail when creating a pair with zero address", async function () {
      const token0Address = await token0.getAddress();
      
      await expect(
        factory.createPair(token0Address, ethers.ZeroAddress)
      ).to.be.revertedWith('RubyswapV2: ZERO_ADDRESS');
    });

    it("Should fail when pair already exists", async function () {
      const token0Address = await token0.getAddress();
      const token1Address = await token1.getAddress();
      
      // Create a pair first
      await factory.createPair(token0Address, token1Address);
      
      // Try to create the same pair again
      await expect(
        factory.createPair(token0Address, token1Address)
      ).to.be.revertedWith('RubyswapV2: PAIR_EXISTS');
      
      // Try with tokens in reverse order
      await expect(
        factory.createPair(token1Address, token0Address)
      ).to.be.revertedWith('RubyswapV2: PAIR_EXISTS');
    });

    it("Should create multiple different pairs", async function () {
      const token0Address = await token0.getAddress();
      const token1Address = await token1.getAddress();
      const token2Address = await token2.getAddress();
      
      // Create first pair
      await factory.createPair(token0Address, token1Address);
      expect(await factory.allPairsLength()).to.equal(1);
      
      // Create second pair
      await factory.createPair(token0Address, token2Address);
      expect(await factory.allPairsLength()).to.equal(2);
      
      // Create third pair
      await factory.createPair(token1Address, token2Address);
      expect(await factory.allPairsLength()).to.equal(3);
      
      // Verify all pairs have different addresses
      const pair01 = await factory.getPair(token0Address, token1Address);
      const pair02 = await factory.getPair(token0Address, token2Address);
      const pair12 = await factory.getPair(token1Address, token2Address);
      
      expect(pair01).to.not.equal(pair02);
      expect(pair01).to.not.equal(pair12);
      expect(pair02).to.not.equal(pair12);
    });
    
    it("Should initialize pair correctly", async function () {
      const token0Address = await token0.getAddress();
      const token1Address = await token1.getAddress();
      
      // Create a pair
      await factory.createPair(token0Address, token1Address);
      const pairAddress = await factory.getPair(token0Address, token1Address);
      
      // Create interface for pair to check token addresses
      const pairAbi = [
        "function token0() external view returns (address)",
        "function token1() external view returns (address)",
        "function factory() external view returns (address)"
      ];
      
      const pair = new ethers.Contract(pairAddress, pairAbi, owner);
      
      // Verify the pair has correct tokens set
      expect(await pair.token0()).to.equal(token0Address);
      expect(await pair.token1()).to.equal(token1Address);
      
      // Verify the pair has correct factory set
      const factoryAddress = await factory.getAddress();
      expect(await pair.factory()).to.equal(factoryAddress);
    });
  });

  describe("Address sorting", function () {
    it("Should sort token addresses correctly", async function () {
      const token0Address = await token0.getAddress();
      const token1Address = await token1.getAddress();
      
      // Create pair with tokens in original order
      await factory.createPair(token0Address, token1Address);
      const pair1 = await factory.getPair(token0Address, token1Address);
      
      // Create a new factory
      const RubyswapV2Factory = await ethers.getContractFactory("RubyswapV2Factory");
      const factory2 = await RubyswapV2Factory.deploy();
      
      // Create pair with tokens in reverse order
      await factory2.createPair(token1Address, token0Address);
      const pair2 = await factory2.getPair(token0Address, token1Address);
      
      // Verify the addresses are legitimate
      expect(pair1).to.not.equal(ethers.ZeroAddress);
      expect(pair2).to.not.equal(ethers.ZeroAddress);
      
      // Check that token ordering in the contract matches our expected ordering
      const pairAbi = ["function token0() external view returns (address)",
                       "function token1() external view returns (address)"];
      const pairContract = new ethers.Contract(pair1, pairAbi, owner);
      
      expect(await pairContract.token0()).to.equal(token0Address);
      expect(await pairContract.token1()).to.equal(token1Address);
    });
  });

  describe("Access control", function () {
    it("Should allow anyone to create pairs", async function () {
      const token0Address = await token0.getAddress();
      const token1Address = await token1.getAddress();
      
      // Connect as a non-owner user
      const userFactory = factory.connect(user);
      
      // Verify the user can create a pair
      await userFactory.createPair(token0Address, token1Address);
      
      // Verify the pair was created
      expect(await factory.allPairsLength()).to.equal(1);
    });
  });
});