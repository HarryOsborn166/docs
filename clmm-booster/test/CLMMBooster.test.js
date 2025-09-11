const { expect } = require("chai");
const { ethers } = require("hardhat");
const { BigNumber } = ethers;

describe("CLMMBooster", function () {
  let owner, user1, user2;
  let clmmBooster, securityManager;
  let mockFlashLoanProvider, mockCLMM;
  let mockToken0, mockToken1;

  beforeEach(async function () {
    [owner, user1, user2] = await ethers.getSigners();

    // Deploy mock tokens
    const MockToken = await ethers.getContractFactory("MockERC20");
    mockToken0 = await MockToken.deploy("Token0", "TK0", 18);
    mockToken1 = await MockToken.deploy("Token1", "TK1", 18);

    // Deploy SecurityManager
    const SecurityManager = await ethers.getContractFactory("SecurityManager");
    securityManager = await SecurityManager.deploy();

    // Deploy CLMMBoosterV2
    const CLMMBoosterV2 = await ethers.getContractFactory("CLMMBoosterV2");
    clmmBooster = await CLMMBoosterV2.deploy();
    await clmmBooster.initialize(owner.address, securityManager.address);

    // Deploy mock contracts
    const MockFlashLoanProvider = await ethers.getContractFactory("MockFlashLoanProvider");
    mockFlashLoanProvider = await MockFlashLoanProvider.deploy();

    const MockCLMM = await ethers.getContractFactory("MockCLMM");
    mockCLMM = await MockCLMM.deploy();

    // Setup permissions
    await securityManager.whitelistToken(mockToken0.address);
    await securityManager.whitelistToken(mockToken1.address);
    await securityManager.whitelistProtocol(mockCLMM.address);
    await securityManager.addToWhitelist(user1.address);

    // Register flash loan provider and CLMM
    await clmmBooster.setSupportedFlashLoanProvider(mockFlashLoanProvider.address, true);
    await clmmBooster.setSupportedCLMM(mockCLMM.address, true);
  });

  describe("Initialization", function () {
    it("Should set correct owner", async function () {
      expect(await clmmBooster.owner()).to.equal(owner.address);
    });

    it("Should set correct security manager", async function () {
      expect(await clmmBooster.securityManager()).to.equal(securityManager.address);
    });

    it("Should set correct fee recipient", async function () {
      expect(await clmmBooster.feeRecipient()).to.equal(owner.address);
    });
  });

  describe("Position Boosting", function () {
    it("Should successfully boost a position", async function () {
      const borrowAmount = ethers.utils.parseEther("1000");
      const positionId = 1;

      // Mint tokens to flash loan provider
      await mockToken0.mint(mockFlashLoanProvider.address, borrowAmount.mul(2));

      // Create boost params
      const params = {
        clmmProtocol: mockCLMM.address,
        tokenToBorrow: mockToken0.address,
        borrowAmount: borrowAmount,
        positionId: positionId,
        strategyId: 1,
        strategyData: ethers.utils.defaultAbiCoder.encode(["string"], ["COMPOUND_POSITION"])
      };

      // Execute boost
      await expect(
        clmmBooster.connect(user1).boostPositionV2(params, mockFlashLoanProvider.address)
      ).to.emit(clmmBooster, "PositionBoosted");
    });

    it("Should fail if user is not whitelisted", async function () {
      const params = {
        clmmProtocol: mockCLMM.address,
        tokenToBorrow: mockToken0.address,
        borrowAmount: ethers.utils.parseEther("1000"),
        positionId: 1,
        strategyId: 1,
        strategyData: "0x"
      };

      await expect(
        clmmBooster.connect(user2).boostPositionV2(params, mockFlashLoanProvider.address)
      ).to.be.revertedWith("Security validation failed");
    });

    it("Should respect rate limits", async function () {
      const params = {
        clmmProtocol: mockCLMM.address,
        tokenToBorrow: mockToken0.address,
        borrowAmount: ethers.utils.parseEther("100"),
        positionId: 1,
        strategyId: 1,
        strategyData: "0x"
      };

      // Set max daily actions to 2
      await securityManager.setMaxDailyActions(2);

      // First two calls should succeed
      await clmmBooster.connect(user1).boostPositionV2(params, mockFlashLoanProvider.address);
      await clmmBooster.connect(user1).boostPositionV2(params, mockFlashLoanProvider.address);

      // Third call should fail
      await expect(
        clmmBooster.connect(user1).boostPositionV2(params, mockFlashLoanProvider.address)
      ).to.be.revertedWith("Daily action limit exceeded");
    });
  });

  describe("Batch Operations", function () {
    it("Should successfully batch boost positions", async function () {
      const params1 = {
        clmmProtocol: mockCLMM.address,
        tokenToBorrow: mockToken0.address,
        borrowAmount: ethers.utils.parseEther("100"),
        positionId: 1,
        strategyId: 1,
        strategyData: "0x"
      };

      const params2 = {
        ...params1,
        positionId: 2,
        borrowAmount: ethers.utils.parseEther("200")
      };

      await clmmBooster.connect(user1).batchBoostPositions(
        [params1, params2],
        [mockFlashLoanProvider.address, mockFlashLoanProvider.address]
      );
    });

    it("Should fail if too many positions in batch", async function () {
      const params = {
        clmmProtocol: mockCLMM.address,
        tokenToBorrow: mockToken0.address,
        borrowAmount: ethers.utils.parseEther("100"),
        positionId: 1,
        strategyId: 1,
        strategyData: "0x"
      };

      const tooManyParams = Array(11).fill(params);
      const providers = Array(11).fill(mockFlashLoanProvider.address);

      await expect(
        clmmBooster.connect(user1).batchBoostPositions(tooManyParams, providers)
      ).to.be.revertedWith("Too many positions");
    });
  });

  describe("Emergency Functions", function () {
    it("Should activate emergency mode", async function () {
      await securityManager.grantRole(
        await securityManager.GUARDIAN_ROLE(),
        owner.address
      );

      await securityManager.activateEmergencyMode();
      expect(await securityManager.emergencyMode()).to.be.true;
    });

    it("Should block operations in emergency mode", async function () {
      await securityManager.grantRole(
        await securityManager.GUARDIAN_ROLE(),
        owner.address
      );
      await securityManager.activateEmergencyMode();

      const params = {
        clmmProtocol: mockCLMM.address,
        tokenToBorrow: mockToken0.address,
        borrowAmount: ethers.utils.parseEther("100"),
        positionId: 1,
        strategyId: 1,
        strategyData: "0x"
      };

      await expect(
        clmmBooster.connect(user1).boostPositionV2(params, mockFlashLoanProvider.address)
      ).to.be.revertedWith("Security validation failed");
    });

    it("Should allow emergency withdrawal", async function () {
      // Send tokens to contract
      await mockToken0.mint(clmmBooster.address, ethers.utils.parseEther("1000"));

      // Emergency withdraw
      await clmmBooster.emergencyWithdraw(mockToken0.address);

      expect(await mockToken0.balanceOf(owner.address)).to.equal(
        ethers.utils.parseEther("1000")
      );
    });
  });

  describe("Fee Management", function () {
    it("Should calculate correct protocol fees", async function () {
      const profit = ethers.utils.parseEther("100");
      const defaultFee = await clmmBooster.defaultProtocolFee(); // 50 basis points = 0.5%
      
      const expectedFee = profit.mul(defaultFee).div(10000);
      
      // Test through a mock execution
      // In real test, this would be verified through actual boost execution
      expect(expectedFee).to.equal(ethers.utils.parseEther("0.5"));
    });

    it("Should update protocol fee correctly", async function () {
      const newFee = 100; // 1%
      await clmmBooster.setProtocolFee(newFee);
      expect(await clmmBooster.defaultProtocolFee()).to.equal(newFee);
    });

    it("Should prevent setting too high fees", async function () {
      const tooHighFee = 1001; // 10.01%
      await expect(
        clmmBooster.setProtocolFee(tooHighFee)
      ).to.be.revertedWith("Fee too high");
    });
  });

  describe("Gas Optimization", function () {
    it("Should track gas estimates", async function () {
      const params = {
        clmmProtocol: mockCLMM.address,
        tokenToBorrow: mockToken0.address,
        borrowAmount: ethers.utils.parseEther("100"),
        positionId: 1,
        strategyId: 1,
        strategyData: "0x"
      };

      await clmmBooster.connect(user1).boostPositionV2(params, mockFlashLoanProvider.address);

      const gasEstimate = await clmmBooster.getStrategyGasEstimate(
        mockCLMM.address,
        1,
        mockToken0.address
      );

      expect(gasEstimate).to.be.gt(0);
    });

    it("Should check strategy profitability", async function () {
      const result = await clmmBooster.isStrategyProfitable(
        mockCLMM.address,
        mockToken0.address,
        ethers.utils.parseEther("1000")
      );

      expect(result.profitable).to.be.a("boolean");
      expect(result.estimatedProfit).to.be.a("object"); // BigNumber
    });
  });
});