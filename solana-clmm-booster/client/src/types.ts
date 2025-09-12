import { PublicKey } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';

export enum Strategy {
  CompoundPosition = 0,
  Arbitrage = 1,
  RangeOrder = 2,
}

export interface BoostParams {
  borrowAmount: BN;
  strategy: Strategy;
  strategyData: Buffer;
}

export interface ProtocolState {
  authority: PublicKey;
  feeReceiver: PublicKey;
  protocolFeeBps: number;
  paused: boolean;
  totalVolumeBoosted: BN;
}

export interface UserWhitelist {
  user: PublicKey;
  isWhitelisted: boolean;
  addedAt: BN;
}

export interface FlashLoanData {
  user: PublicKey;
  positionAccount: PublicKey;
  provider: PublicKey;
  borrowAmount: BN;
  strategy: Strategy;
  startSlot: BN;
}

export interface PositionBoostResult {
  transactionSignature: string;
  borrowAmount: BN;
  profit: BN;
  protocolFee: BN;
  flashLoanFee: BN;
  netProfit: BN;
}

export interface OrcaWhirlpoolConfig {
  whirlpoolProgramId: PublicKey;
  positionNft: PublicKey;
  whirlpool: PublicKey;
  tickArrayLower: PublicKey;
  tickArrayUpper: PublicKey;
}

export interface KaminoVaultConfig {
  vaultProgramId: PublicKey;
  vault: PublicKey;
  strategy: PublicKey;
  sharesMint: PublicKey;
}

export interface SolendFlashLoanConfig {
  lendingMarket: PublicKey;
  reserve: PublicKey;
  maxFlashLoanAmount: BN;
  flashLoanFeeBps: number;
}

export interface BoostStrategyParams {
  minProfitBps: number;
  maxSlippage: number;
  priorityFee?: BN;
  computeUnits?: number;
}