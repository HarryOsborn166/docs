const { ethers } = require("hardhat");

async function main() {
  // Configuration
  const POSITION_ID = 123456; // Your Uniswap V3 position NFT ID
  const BORROW_AMOUNT = ethers.utils.parseUnits("10000", 6); // 10,000 USDC
  const STRATEGY = "COMPOUND_POSITION"; // or "ARBITRAGE", "RANGE_ORDER", etc.

  // Load deployment addresses (update with your deployment)
  const deployment = {
    CLMMBoosterV2: "0x...",
    AaveFlashLoanProvider: "0x...",
    UniswapV3Strategy: "0x...",
    tokens: {
      USDC: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"
    }
  };

  console.log("Setting up CLMM Position Boost...");

  // Get signer
  const [signer] = await ethers.getSigners();
  console.log("Using account:", signer.address);

  // Get contract instances
  const clmmBooster = await ethers.getContractAt(
    "CLMMBoosterV2",
    deployment.CLMMBoosterV2,
    signer
  );

  // Check if strategy is profitable
  console.log("\nChecking strategy profitability...");
  const profitCheck = await clmmBooster.isStrategyProfitable(
    deployment.UniswapV3Strategy,
    deployment.tokens.USDC,
    BORROW_AMOUNT
  );

  console.log("Strategy profitable:", profitCheck.profitable);
  console.log("Estimated profit:", ethers.utils.formatUnits(profitCheck.estimatedProfit, 6), "USDC");

  if (!profitCheck.profitable) {
    console.log("Strategy not profitable at current gas prices. Exiting...");
    return;
  }

  // Prepare boost parameters
  const boostParams = {
    clmmProtocol: deployment.UniswapV3Strategy,
    tokenToBorrow: deployment.tokens.USDC,
    borrowAmount: BORROW_AMOUNT,
    positionId: POSITION_ID,
    strategyId: 1, // Strategy type identifier
    strategyData: ethers.utils.defaultAbiCoder.encode(["string"], [STRATEGY])
  };

  // Estimate gas
  console.log("\nEstimating gas...");
  const gasEstimate = await clmmBooster.estimateGas.boostPositionV2(
    boostParams,
    deployment.AaveFlashLoanProvider
  );
  console.log("Estimated gas:", gasEstimate.toString());

  const gasPrice = await signer.getGasPrice();
  const gasCost = gasEstimate.mul(gasPrice);
  console.log("Estimated gas cost:", ethers.utils.formatEther(gasCost), "ETH");

  // Execute boost
  console.log("\nExecuting position boost...");
  const tx = await clmmBooster.boostPositionV2(
    boostParams,
    deployment.AaveFlashLoanProvider,
    {
      gasLimit: gasEstimate.mul(110).div(100), // 10% buffer
      gasPrice: gasPrice
    }
  );

  console.log("Transaction sent:", tx.hash);
  console.log("Waiting for confirmation...");

  const receipt = await tx.wait();
  console.log("Transaction confirmed in block:", receipt.blockNumber);

  // Parse events
  const events = receipt.events?.filter(e => e.event === "PositionBoosted");
  if (events && events.length > 0) {
    const event = events[0];
    console.log("\nPosition Boosted Successfully!");
    console.log("Position ID:", event.args.positionId.toString());
    console.log("Borrowed Amount:", ethers.utils.formatUnits(event.args.borrowAmount, 6), "USDC");
    console.log("Profit Generated:", ethers.utils.formatUnits(event.args.profitGenerated, 6), "USDC");
  }

  // Check gas usage for future optimization
  const actualGasUsed = receipt.gasUsed;
  console.log("\nGas Usage Analysis:");
  console.log("Actual gas used:", actualGasUsed.toString());
  console.log("Gas efficiency:", ((gasEstimate.sub(actualGasUsed)).mul(100).div(gasEstimate)).toString() + "%");
}

// Advanced example: Batch boosting multiple positions
async function batchBoostExample() {
  console.log("\n=== Batch Boost Example ===");
  
  const positions = [
    { id: 123456, amount: "10000", token: "USDC" },
    { id: 123457, amount: "5", token: "WETH" },
    { id: 123458, amount: "20000", token: "DAI" }
  ];

  const deployment = {
    CLMMBoosterV2: "0x...",
    AaveFlashLoanProvider: "0x...",
    UniswapV3Strategy: "0x...",
    tokens: {
      USDC: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      WETH: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
      DAI: "0x6B175474E89094C44Da98b954EedeAC495271d0F"
    }
  };

  const [signer] = await ethers.getSigners();
  const clmmBooster = await ethers.getContractAt(
    "CLMMBoosterV2",
    deployment.CLMMBoosterV2,
    signer
  );

  // Prepare batch parameters
  const batchParams = positions.map(pos => ({
    clmmProtocol: deployment.UniswapV3Strategy,
    tokenToBorrow: deployment.tokens[pos.token],
    borrowAmount: ethers.utils.parseUnits(pos.amount, pos.token === "WETH" ? 18 : 6),
    positionId: pos.id,
    strategyId: 1,
    strategyData: ethers.utils.defaultAbiCoder.encode(["string"], ["COMPOUND_POSITION"])
  }));

  const flashLoanProviders = new Array(positions.length).fill(deployment.AaveFlashLoanProvider);

  console.log("Executing batch boost for", positions.length, "positions...");
  
  const tx = await clmmBooster.batchBoostPositions(batchParams, flashLoanProviders);
  const receipt = await tx.wait();
  
  console.log("Batch boost completed!");
  console.log("Gas used:", receipt.gasUsed.toString());
}

// Arbitrage strategy example
async function arbitrageExample() {
  console.log("\n=== Arbitrage Strategy Example ===");
  
  // Define arbitrage path: USDC -> WETH -> WBTC -> USDC
  const arbitragePath = [
    "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", // USDC
    "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", // WETH
    "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", // WBTC
    "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"  // USDC
  ];
  
  const poolFees = [3000, 3000, 3000]; // 0.3% fee pools
  
  const strategyData = ethers.utils.defaultAbiCoder.encode(
    ["address[]", "uint24[]"],
    [arbitragePath, poolFees]
  );
  
  const boostParams = {
    clmmProtocol: "0x...", // UniswapV3Strategy address
    tokenToBorrow: arbitragePath[0],
    borrowAmount: ethers.utils.parseUnits("100000", 6), // 100k USDC
    positionId: 0, // Not used for arbitrage
    strategyId: 2, // Arbitrage strategy ID
    strategyData: strategyData
  };
  
  console.log("Executing arbitrage strategy...");
  // Execute boost with arbitrage parameters
}

// Run the example
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });