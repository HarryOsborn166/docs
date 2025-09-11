# CLMM Booster - Flash Loan Position Enhancement

A sophisticated DeFi protocol that enables users to boost their Concentrated Liquidity Market Maker (CLMM) positions using flash loans, maximizing capital efficiency and returns.

## Features

- 🚀 **Flash Loan Integration**: Support for multiple flash loan providers (Aave V3, Uniswap V3)
- 💎 **Multi-Protocol Support**: Works with Uniswap V3, Curve V2, and custom CLMM protocols
- 🛡️ **Advanced Security**: Role-based access control, rate limiting, and emergency controls
- ⚡ **Gas Optimization**: Efficient struct packing and batch operations
- 📊 **Strategy Options**: Compounding, arbitrage, range orders, and custom strategies
- 🔄 **Upgradeable**: UUPS proxy pattern for future improvements

## Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/clmm-booster.git
cd clmm-booster

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your configuration
```

## Configuration

Create a `.env` file with the following variables:

```env
MAINNET_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/your-api-key
PRIVATE_KEY=your-private-key
ETHERSCAN_API_KEY=your-etherscan-api-key
```

## Deployment

```bash
# Compile contracts
npm run compile

# Run tests
npm test

# Deploy to mainnet
npx hardhat run scripts/deploy.js --network mainnet

# Verify contracts
npx hardhat verify --network mainnet DEPLOYED_CONTRACT_ADDRESS
```

## Usage

### Basic Position Boost

```javascript
const { ethers } = require("ethers");
const CLMMBooster = require("./artifacts/contracts/CLMMBoosterV2.sol/CLMMBoosterV2.json");

// Setup
const provider = new ethers.providers.JsonRpcProvider(process.env.RPC_URL);
const signer = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
const booster = new ethers.Contract(BOOSTER_ADDRESS, CLMMBooster.abi, signer);

// Boost position
const params = {
    clmmProtocol: UNISWAP_V3_STRATEGY,
    tokenToBorrow: USDC_ADDRESS,
    borrowAmount: ethers.utils.parseUnits("10000", 6),
    positionId: 123456,
    strategyId: 1,
    strategyData: "0x"
};

const tx = await booster.boostPositionV2(params, AAVE_PROVIDER);
await tx.wait();
```

### Check Profitability

```javascript
const result = await booster.isStrategyProfitable(
    UNISWAP_V3_STRATEGY,
    USDC_ADDRESS,
    ethers.utils.parseUnits("10000", 6)
);

if (result.profitable) {
    console.log("Expected profit:", ethers.utils.formatUnits(result.estimatedProfit, 6));
}
```

## Strategies

### 1. Compound Position
Adds liquidity temporarily to harvest more fees:
- Best for: High-volume pools with accumulated fees
- Risk: Low
- Gas cost: Medium

### 2. Arbitrage
Executes multi-hop trades to capture price differences:
- Best for: Volatile markets with price discrepancies
- Risk: Medium
- Gas cost: High

### 3. Range Orders
Creates concentrated positions in specific price ranges:
- Best for: Trending markets
- Risk: Medium-High
- Gas cost: Medium

## Security Considerations

1. **Whitelist Only**: Only whitelisted users and tokens are allowed
2. **Rate Limiting**: Daily limits on actions and volume
3. **Emergency Mode**: Guardian can pause all operations
4. **Slippage Protection**: Configurable minimum output amounts
5. **Gas Price Limits**: Protection against high gas price attacks

## Architecture

```
contracts/
├── CLMMBooster.sol          # Main contract logic
├── CLMMBoosterV2.sol        # Upgradeable version with optimizations
├── security/
│   └── SecurityManager.sol  # Security and access control
├── flashloan/
│   ├── AaveFlashLoanProvider.sol
│   └── UniswapFlashLoanProvider.sol
├── strategies/
│   ├── UniswapV3Strategy.sol
│   └── CurveV2Strategy.sol
└── interfaces/
    ├── IFlashLoanReceiver.sol
    └── ICLMM.sol
```

## Testing

```bash
# Run all tests
npm test

# Run specific test file
npx hardhat test test/CLMMBooster.test.js

# Run with coverage
npm run coverage
```

## Gas Optimization

The protocol implements several gas optimization techniques:
- Struct packing for parameters
- Batch operations for multiple positions
- Gas usage tracking and estimation
- Strategy profitability pre-checks

## Audits

- [ ] Code4rena audit (planned)
- [ ] Quantstamp audit (planned)
- [ ] Internal security review (completed)

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Disclaimer

This software is provided "as is", without warranty of any kind. Use at your own risk. Always do your own research and understand the risks involved in DeFi protocols.

## Contact

- Twitter: [@clmmbooster](https://twitter.com/clmmbooster)
- Discord: [Join our community](https://discord.gg/clmmbooster)
- Documentation: [docs.clmmbooster.io](https://docs.clmmbooster.io)