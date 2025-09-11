const { ethers, upgrades } = require("hardhat");

async function main() {
  console.log("Starting deployment...");

  // Get deployer account
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);
  console.log("Account balance:", (await deployer.getBalance()).toString());

  // Deploy SecurityManager
  console.log("\nDeploying SecurityManager...");
  const SecurityManager = await ethers.getContractFactory("SecurityManager");
  const securityManager = await SecurityManager.deploy();
  await securityManager.deployed();
  console.log("SecurityManager deployed to:", securityManager.address);

  // Deploy CLMMBoosterV2 as upgradeable
  console.log("\nDeploying CLMMBoosterV2...");
  const CLMMBoosterV2 = await ethers.getContractFactory("CLMMBoosterV2");
  const clmmBooster = await upgrades.deployProxy(
    CLMMBoosterV2,
    [deployer.address, securityManager.address],
    { initializer: 'initialize' }
  );
  await clmmBooster.deployed();
  console.log("CLMMBoosterV2 deployed to:", clmmBooster.address);

  // Deploy Flash Loan Providers
  console.log("\nDeploying Flash Loan Providers...");
  
  // Aave Flash Loan Provider
  const aavePoolAddress = "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2"; // Mainnet Aave V3 Pool
  const AaveFlashLoanProvider = await ethers.getContractFactory("AaveFlashLoanProvider");
  const aaveProvider = await AaveFlashLoanProvider.deploy(aavePoolAddress);
  await aaveProvider.deployed();
  console.log("AaveFlashLoanProvider deployed to:", aaveProvider.address);

  // Uniswap Flash Loan Provider
  const UniswapFlashLoanProvider = await ethers.getContractFactory("UniswapFlashLoanProvider");
  const uniswapProvider = await UniswapFlashLoanProvider.deploy();
  await uniswapProvider.deployed();
  console.log("UniswapFlashLoanProvider deployed to:", uniswapProvider.address);

  // Deploy CLMM Strategies
  console.log("\nDeploying CLMM Strategies...");
  
  // Uniswap V3 Strategy
  const positionManagerAddress = "0xC36442b4a4522E871399CD717aBDD847Ab11FE88"; // Mainnet NFT Position Manager
  const swapRouterAddress = "0xE592427A0AEce92De3Edee1F18E0157C05861564"; // Mainnet Swap Router
  
  const UniswapV3Strategy = await ethers.getContractFactory("UniswapV3Strategy");
  const uniswapV3Strategy = await UniswapV3Strategy.deploy(
    positionManagerAddress,
    swapRouterAddress
  );
  await uniswapV3Strategy.deployed();
  console.log("UniswapV3Strategy deployed to:", uniswapV3Strategy.address);

  // Curve V2 Strategy
  const CurveV2Strategy = await ethers.getContractFactory("CurveV2Strategy");
  const curveV2Strategy = await CurveV2Strategy.deploy();
  await curveV2Strategy.deployed();
  console.log("CurveV2Strategy deployed to:", curveV2Strategy.address);

  // Configure contracts
  console.log("\nConfiguring contracts...");

  // Setup CLMMBooster
  await clmmBooster.setSupportedFlashLoanProvider(aaveProvider.address, true);
  await clmmBooster.setSupportedFlashLoanProvider(uniswapProvider.address, true);
  await clmmBooster.setSupportedCLMM(uniswapV3Strategy.address, true);
  await clmmBooster.setSupportedCLMM(curveV2Strategy.address, true);
  console.log("Flash loan providers and CLMM strategies configured");

  // Setup SecurityManager
  await securityManager.whitelistProtocol(uniswapV3Strategy.address);
  await securityManager.whitelistProtocol(curveV2Strategy.address);
  
  // Whitelist common tokens
  const tokens = {
    USDC: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    USDT: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    WETH: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    DAI: "0x6B175474E89094C44Da98b954EedeAC495271d0F"
  };
  
  for (const [name, address] of Object.entries(tokens)) {
    await securityManager.whitelistToken(address);
    console.log(`Whitelisted ${name}: ${address}`);
  }

  // Grant roles
  const OPERATOR_ROLE = await securityManager.OPERATOR_ROLE();
  await securityManager.grantRole(OPERATOR_ROLE, clmmBooster.address);
  console.log("Granted OPERATOR_ROLE to CLMMBooster");

  // Save deployment addresses
  const deployment = {
    network: hre.network.name,
    timestamp: new Date().toISOString(),
    contracts: {
      SecurityManager: securityManager.address,
      CLMMBoosterV2: clmmBooster.address,
      AaveFlashLoanProvider: aaveProvider.address,
      UniswapFlashLoanProvider: uniswapProvider.address,
      UniswapV3Strategy: uniswapV3Strategy.address,
      CurveV2Strategy: curveV2Strategy.address
    },
    configuration: {
      whitelistedTokens: tokens,
      defaultProtocolFee: await clmmBooster.defaultProtocolFee()
    }
  };

  console.log("\nDeployment Summary:");
  console.log(JSON.stringify(deployment, null, 2));

  // Write deployment info to file
  const fs = require("fs");
  fs.writeFileSync(
    `deployments/${hre.network.name}-${Date.now()}.json`,
    JSON.stringify(deployment, null, 2)
  );

  console.log("\nDeployment completed successfully!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });