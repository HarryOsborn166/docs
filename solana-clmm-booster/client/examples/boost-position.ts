import { 
  Connection, 
  Keypair, 
  PublicKey,
  clusterApiUrl 
} from '@solana/web3.js';
import { AnchorProvider, BN, Wallet } from '@coral-xyz/anchor';
import { CLMMBooster, OrcaStrategy, Strategy } from '../src';
import { 
  formatTokenAmount, 
  confirmTransaction,
  calculatePriorityFee 
} from '../src/utils';
import * as fs from 'fs';

// Load IDL (would be generated from Anchor build)
const IDL = JSON.parse(fs.readFileSync('./idl/clmm_booster.json', 'utf-8'));

async function main() {
  // Setup
  const connection = new Connection(clusterApiUrl('mainnet-beta'), 'confirmed');
  const wallet = new Wallet(Keypair.generate()); // Use your wallet
  const provider = new AnchorProvider(connection, wallet, {
    commitment: 'confirmed',
  });

  // Initialize clients
  const programId = new PublicKey('CLMMBooster111111111111111111111111111111111');
  const booster = new CLMMBooster(provider, programId, IDL);
  const orcaStrategy = new OrcaStrategy(connection, wallet);

  // Example: Boost an Orca Whirlpool position
  await boostOrcaPosition(booster, orcaStrategy);

  // Example: Monitor boosted positions
  await monitorPositions(booster);
}

async function boostOrcaPosition(
  booster: CLMMBooster,
  orcaStrategy: OrcaStrategy
) {
  console.log('🚀 Boosting Orca Whirlpool Position...\n');

  // Your Orca position NFT
  const positionMint = new PublicKey('YOUR_POSITION_NFT_MINT');
  
  // Boost parameters
  const borrowAmount = new BN(1000_000_000); // 1000 USDC (6 decimals)
  const borrowTokenMint = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'); // USDC
  
  // Flash loan provider (Solend)
  const flashLoanProvider = new PublicKey('So1endDq2YkqhipRh3WViPa8hdiSpxWy6z3Z6tMCpAo');

  try {
    // 1. Check if user is whitelisted
    const isWhitelisted = await booster.isUserWhitelisted(
      booster.provider.wallet.publicKey
    );
    
    if (!isWhitelisted) {
      console.log('❌ User not whitelisted. Contact admin.');
      return;
    }

    // 2. Prepare Orca boost
    console.log('📊 Analyzing position...');
    const preparation = await orcaStrategy.prepareOrcaBoost(
      positionMint,
      borrowAmount,
      borrowTokenMint
    );

    console.log(`Optimal amounts:
      Token A: ${formatTokenAmount(preparation.optimalAmounts.tokenA, 6)}
      Token B: ${formatTokenAmount(preparation.optimalAmounts.tokenB, 6)}
    `);

    // 3. Estimate profit
    console.log('\n💰 Estimating profit...');
    const profitEstimate = await booster.estimateBoostProfit(
      positionMint,
      borrowAmount,
      Strategy.CompoundPosition,
      borrowTokenMint
    );

    console.log(`Profit breakdown:
      Estimated Profit: ${formatTokenAmount(profitEstimate.estimatedProfit, 6)} USDC
      Flash Loan Fee: ${formatTokenAmount(profitEstimate.flashLoanFee, 6)} USDC
      Protocol Fee: ${formatTokenAmount(profitEstimate.protocolFee, 6)} USDC
      Net Profit: ${formatTokenAmount(profitEstimate.netProfit, 6)} USDC
    `);

    // Check if profitable
    if (profitEstimate.netProfit.lte(new BN(0))) {
      console.log('❌ Not profitable at current conditions');
      return;
    }

    // 4. Calculate priority fee
    const priorityFee = await calculatePriorityFee(booster.provider.connection);
    console.log(`\n⛽ Priority fee: ${priorityFee} microlamports`);

    // 5. Execute boost
    console.log('\n🔄 Executing boost...');
    const signature = await booster.boostPosition(
      booster.provider.wallet as any, // Your keypair
      positionMint,
      flashLoanProvider,
      borrowTokenMint,
      borrowAmount,
      Strategy.CompoundPosition,
      Buffer.from(JSON.stringify(preparation.config))
    );

    console.log(`✅ Transaction sent: ${signature}`);
    
    // 6. Wait for confirmation
    await confirmTransaction(booster.provider.connection, signature);
    console.log('✅ Boost completed successfully!');

    // 7. Monitor results
    const result = await orcaStrategy.monitorPosition(positionMint);
    console.log(`\n📈 Position status:
      Current Value: ${formatTokenAmount(result.currentValue, 6)} USDC
      Uncollected Fees A: ${formatTokenAmount(result.fees.tokenA, 6)}
      Uncollected Fees B: ${formatTokenAmount(result.fees.tokenB, 6)}
    `);

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

async function monitorPositions(booster: CLMMBooster) {
  console.log('\n📊 Monitoring Boost History...\n');

  try {
    // Get user's boost history
    const history = await booster.getUserBoostHistory(
      booster.provider.wallet.publicKey,
      5
    );

    if (history.length === 0) {
      console.log('No boost history found.');
      return;
    }

    console.log(`Found ${history.length} boost transactions:\n`);

    for (const boost of history) {
      console.log(`Transaction: ${boost.signature}
        Slot: ${boost.slot}
        Timestamp: ${new Date(boost.timestamp * 1000).toLocaleString()}
        ---`);
    }

    // Get current protocol state
    const state = await booster.getProtocolState();
    console.log(`\n📈 Protocol Statistics:
      Total Volume Boosted: ${formatTokenAmount(state.totalVolumeBoosted, 6)} USDC
      Protocol Fee: ${state.protocolFeeBps / 100}%
      Status: ${state.paused ? 'Paused' : 'Active'}
    `);

  } catch (error) {
    console.error('❌ Error monitoring positions:', error);
  }
}

// Advanced example: Custom arbitrage strategy
async function executeArbitrageStrategy(booster: CLMMBooster) {
  console.log('\n💹 Executing Arbitrage Strategy...\n');

  // Define arbitrage path
  const arbitragePath = [
    'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
    'So11111111111111111111111111111111111111112',   // SOL
    'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So',   // mSOL
    'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
  ].map(s => new PublicKey(s));

  const strategyData = Buffer.from(JSON.stringify({
    path: arbitragePath,
    slippageBps: 50, // 0.5% slippage
    minProfitBps: 30, // 0.3% minimum profit
  }));

  const borrowAmount = new BN(10000_000_000); // 10,000 USDC

  try {
    const signature = await booster.boostPosition(
      booster.provider.wallet as any,
      PublicKey.default, // No specific position for arbitrage
      new PublicKey('So1endDq2YkqhipRh3WViPa8hdiSpxWy6z3Z6tMCpAo'),
      arbitragePath[0],
      borrowAmount,
      Strategy.Arbitrage,
      strategyData
    );

    console.log(`✅ Arbitrage executed: ${signature}`);
  } catch (error) {
    console.error('❌ Arbitrage failed:', error);
  }
}

// Run the example
main().catch(console.error);