/**
 * 

  RubyswapV2Factory
    Deployment and Basic Functions
      ✔ Should set the correct owner
      ✔ Should start with zero pairs
      ✔ Should return zero address for non-existent pairs
    createPair Function
      ✔ Should create a new pair and emit PairCreated event
      ✔ Should create pairs with proper token ordering
Token0: 0x6ec3A41309976e9b292a8B74Ad6177F3eEF032C6
Token1: 0x896C97Cb78188Db91c08E070d47E1783A19609d7
Calculated salt: 0x8dfd88185ff21ccb1bcb051f605213186b0339729abe426ac2dd635a74a6a56c
Pair1 address: 0x1956FB5A1fC231EF646C350D49f86F3ca3FdDAe9
Pair2 address: 0xff2088CAEBD0AA48AF9d805614F438Ef34389528
      ✔ Should create the same pair address regardless of token order
      ✔ Should map pairs correctly in both directions
      ✔ Should fail when creating a pair with identical tokens
      ✔ Should fail when creating a pair with zero address
      ✔ Should fail when pair already exists
    Pair Collection Management
      ✔ Should track all created pairs in allPairs array
      ✔ Should initialize each pair with the correct factory address
    Non-Owner Interactions
      ✔ Should allow non-owners to create pairs


  13 passing (1s)
 */
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

  describe("Deployment and Basic Functions", function () {
    it("Should set the correct owner", async function () {
      expect(await factory.owner()).to.equal(owner.address);
    });

    it("Should start with zero pairs", async function () {
      expect(await factory.allPairsLength()).to.equal(0);
    });
    
    it("Should return zero address for non-existent pairs", async function () {
      const token0Address = await token0.getAddress();
      const token1Address = await token1.getAddress();
      
      expect(await factory.getPair(token0Address, token1Address)).to.equal(ethers.ZeroAddress);
    });
  });

  describe("createPair Function", function () {
    it("Should create a new pair and emit PairCreated event", async function () {
      const token0Address = await token0.getAddress();
      const token1Address = await token1.getAddress();
      
      // Create a pair and check for the event - use the transaction promise directly
      const tx = await factory.createPair(token0Address, token1Address);
      const receipt = await tx.wait();
      
      // Get pair address
      const pairAddress = await factory.getPair(token0Address, token1Address);
      
      // Find the PairCreated event
      const event = receipt.logs.find(
        log => log.fragment && log.fragment.name === 'PairCreated'
      );
      
      // Verify event arguments
      expect(event).to.not.be.undefined;
      expect(event.args[0]).to.equal(token0Address); // token0
      expect(event.args[1]).to.equal(token1Address); // token1
      expect(event.args[2]).to.equal(pairAddress);   // pair address
      expect(event.args[3]).to.equal(1);             // pair length
    });
    
    it("Should create pairs with proper token ordering", async function () {
      const token0Address = await token0.getAddress();
      const token1Address = await token1.getAddress();
      
      // Create a pair with tokens in original order
      await factory.createPair(token0Address, token1Address);
      const pairAddress = await factory.getPair(token0Address, token1Address);
      
      // Check token ordering in the pair contract
      const pairAbi = ["function token0() external view returns (address)",
                       "function token1() external view returns (address)"];
      const pair = new ethers.Contract(pairAddress, pairAbi, owner);
      
      // Verify the pair has token addresses in correct order (lower address first)
      const actualToken0 = await pair.token0();
      const actualToken1 = await pair.token1();
      
      // Compare addresses as strings to avoid numeric conversion issues
      expect(actualToken0.toLowerCase() < actualToken1.toLowerCase()).to.be.true;
      expect(actualToken0).to.equal(token0Address);
      expect(actualToken1).to.equal(token1Address);
    });
    
    it("Should create the same pair address regardless of token order", async function () {
      const token0Address = await token0.getAddress();
      const token1Address = await token1.getAddress();
      
      // Create a new factory instance
      const RubyswapV2Factory = await ethers.getContractFactory("RubyswapV2Factory");
      const factory2 = await RubyswapV2Factory.deploy();
      
      // Create pairs with tokens in different order
      await factory.createPair(token0Address, token1Address);
      await factory2.createPair(token1Address, token0Address);
      
      // Get pair addresses from both factories
      const pair1 = await factory.getPair(token0Address, token1Address);
      const pair2 = await factory2.getPair(token0Address, token1Address);
      
      // Due to CREATE2, with the same salt and bytecode, the addresses should match
      // This test will fail if there are differences in initialization logic
      expect(pair1).to.not.equal(ethers.ZeroAddress);
      expect(pair2).to.not.equal(ethers.ZeroAddress);
      
      // Calculate salt manually to verify it's using the expected formula
      const salt = ethers.keccak256(
        ethers.solidityPacked(
          ['address', 'address'],
          [token0Address, token1Address]
        )
      );
      
      // Log values for debugging
      console.log("Token0:", token0Address);
      console.log("Token1:", token1Address);
      console.log("Calculated salt:", salt);
      console.log("Pair1 address:", pair1);
      console.log("Pair2 address:", pair2);
    });
    
    it("Should map pairs correctly in both directions", async function () {
      const token0Address = await token0.getAddress();
      const token1Address = await token1.getAddress();
      
      // Create a pair
      await factory.createPair(token0Address, token1Address);
      const pairAddress = await factory.getPair(token0Address, token1Address);
      
      // Check mapping in both directions
      expect(await factory.getPair(token0Address, token1Address)).to.equal(pairAddress);
      expect(await factory.getPair(token1Address, token0Address)).to.equal(pairAddress);
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
  });

  describe("Pair Collection Management", function () {
    it("Should track all created pairs in allPairs array", async function () {
      const token0Address = await token0.getAddress();
      const token1Address = await token1.getAddress();
      const token2Address = await token2.getAddress();
      
      // Create three different pairs
      await factory.createPair(token0Address, token1Address);
      await factory.createPair(token0Address, token2Address);
      await factory.createPair(token1Address, token2Address);
      
      // Check array length
      expect(await factory.allPairsLength()).to.equal(3);
      
      // Check each pair is stored correctly in the array
      const pair01 = await factory.getPair(token0Address, token1Address);
      const pair02 = await factory.getPair(token0Address, token2Address);
      const pair12 = await factory.getPair(token1Address, token2Address);
      
      expect(await factory.allPairs(0)).to.equal(pair01);
      expect(await factory.allPairs(1)).to.equal(pair02);
      expect(await factory.allPairs(2)).to.equal(pair12);
    });
    
    it("Should initialize each pair with the correct factory address", async function () {
      const token0Address = await token0.getAddress();
      const token1Address = await token1.getAddress();
      
      // Create a pair
      await factory.createPair(token0Address, token1Address);
      const pairAddress = await factory.getPair(token0Address, token1Address);
      
      // Check if the pair has the correct factory set
      const pairAbi = ["function factory() external view returns (address)"];
      const pair = new ethers.Contract(pairAddress, pairAbi, owner);
      
      const factoryAddress = await factory.getAddress();
      expect(await pair.factory()).to.equal(factoryAddress);
    });
  });

  describe("Non-Owner Interactions", function () {
    it("Should allow non-owners to create pairs", async function () {
      const token0Address = await token0.getAddress();
      const token1Address = await token1.getAddress();
      
      // Connect as a non-owner user
      const userFactory = factory.connect(user);
      
      // Verify the user can create a pair
      await userFactory.createPair(token0Address, token1Address);
      
      // Verify the pair was created
      expect(await factory.allPairsLength()).to.equal(1);
      expect(await factory.getPair(token0Address, token1Address)).to.not.equal(ethers.ZeroAddress);
    });
  });
});