import { Connection, PublicKey, Commitment } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';

/**
 * Wait for transaction confirmation
 */
export async function confirmTransaction(
  connection: Connection,
  signature: string,
  commitment: Commitment = 'confirmed'
): Promise<void> {
  const latestBlockHash = await connection.getLatestBlockhash();
  
  await connection.confirmTransaction({
    signature,
    blockhash: latestBlockHash.blockhash,
    lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
  }, commitment);
}

/**
 * Calculate percentage
 */
export function calculatePercentage(value: BN, total: BN): number {
  if (total.isZero()) return 0;
  return value.mul(new BN(10000)).div(total).toNumber() / 100;
}

/**
 * Format token amount with decimals
 */
export function formatTokenAmount(amount: BN, decimals: number): string {
  const divisor = new BN(10).pow(new BN(decimals));
  const quotient = amount.div(divisor);
  const remainder = amount.mod(divisor);
  
  const decimal = remainder.toString().padStart(decimals, '0');
  const trimmed = decimal.replace(/0+$/, '');
  
  return trimmed.length > 0 
    ? `${quotient.toString()}.${trimmed}`
    : quotient.toString();
}

/**
 * Parse token amount to BN
 */
export function parseTokenAmount(amount: string, decimals: number): BN {
  const parts = amount.split('.');
  const whole = parts[0] || '0';
  const fraction = parts[1] || '';
  
  const paddedFraction = fraction.padEnd(decimals, '0').slice(0, decimals);
  const combined = whole + paddedFraction;
  
  return new BN(combined);
}

/**
 * Calculate slippage adjusted amount
 */
export function calculateSlippageAmount(
  amount: BN,
  slippageBps: number,
  isMin: boolean = true
): BN {
  const slippageMultiplier = isMin 
    ? new BN(10000 - slippageBps)
    : new BN(10000 + slippageBps);
    
  return amount.mul(slippageMultiplier).div(new BN(10000));
}

/**
 * Get token price from oracle
 */
export async function getTokenPrice(
  connection: Connection,
  tokenMint: PublicKey,
  oracleProgram?: PublicKey
): Promise<number> {
  // This would integrate with Pyth, Switchboard, or other oracles
  // For now, return mock prices
  const mockPrices: { [key: string]: number } = {
    'So11111111111111111111111111111111111111112': 100, // SOL
    'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': 1, // USDC
    'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': 1, // USDT
  };
  
  return mockPrices[tokenMint.toString()] || 0;
}

/**
 * Calculate transaction priority fee
 */
export async function calculatePriorityFee(
  connection: Connection,
  computeUnits: number = 200000
): Promise<number> {
  // Get recent prioritization fees
  const recentFees = await connection.getRecentPrioritizationFees();
  
  if (recentFees.length === 0) {
    return 1000; // Default 1000 microlamports
  }
  
  // Calculate median fee
  const fees = recentFees.map(f => f.prioritizationFee).sort((a, b) => a - b);
  const medianFee = fees[Math.floor(fees.length / 2)];
  
  // Add 10% buffer
  return Math.ceil(medianFee * 1.1);
}

/**
 * Retry transaction with exponential backoff
 */
export async function retryTransaction<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: Error;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      if (i < maxRetries - 1) {
        const delay = baseDelay * Math.pow(2, i);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError!;
}

/**
 * Check if account exists
 */
export async function accountExists(
  connection: Connection,
  pubkey: PublicKey
): Promise<boolean> {
  try {
    const info = await connection.getAccountInfo(pubkey);
    return info !== null;
  } catch {
    return false;
  }
}

/**
 * Calculate APY from fee tier and volume
 */
export function calculateAPY(
  feeTier: number,
  volume24h: BN,
  liquidity: BN,
  price: number
): number {
  if (liquidity.isZero()) return 0;
  
  // Daily fees = volume * fee tier
  const dailyFees = volume24h.mul(new BN(feeTier)).div(new BN(1000000));
  
  // Annual fees = daily fees * 365
  const annualFees = dailyFees.mul(new BN(365));
  
  // APY = (annual fees / liquidity) * 100
  const apy = annualFees.mul(new BN(10000)).div(liquidity).toNumber() / 100;
  
  return apy;
}