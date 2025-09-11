import * as anchor from '@coral-xyz/anchor';
import { Program, AnchorProvider, BN, Idl } from '@coral-xyz/anchor';
import { 
  PublicKey, 
  Connection, 
  Keypair, 
  Transaction,
  TransactionInstruction,
  SystemProgram,
  SYSVAR_CLOCK_PUBKEY
} from '@solana/web3.js';
import { 
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction
} from '@solana/spl-token';
import { BoostParams, Strategy, ProtocolState } from './types';

export class CLMMBooster {
  private program: Program;
  private provider: AnchorProvider;
  private statePDA: PublicKey;

  constructor(
    provider: AnchorProvider,
    programId: PublicKey,
    idl: Idl
  ) {
    this.provider = provider;
    this.program = new Program(idl, programId, provider);
    this.statePDA = this.findStatePDA();
  }

  /**
   * Initialize the CLMM Booster protocol
   */
  async initialize(
    authority: PublicKey,
    feeReceiver: PublicKey,
    protocolFeeBps: number
  ): Promise<string> {
    const tx = await this.program.methods
      .initialize(protocolFeeBps)
      .accounts({
        state: this.statePDA,
        authority,
        feeReceiver,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    return tx;
  }

  /**
   * Boost a CLMM position using flash loan
   */
  async boostPosition(
    user: Keypair,
    positionAccount: PublicKey,
    flashLoanProvider: PublicKey,
    tokenMint: PublicKey,
    borrowAmount: BN,
    strategy: Strategy,
    strategyData: Buffer = Buffer.alloc(0)
  ): Promise<string> {
    // Get user's whitelist account
    const userWhitelistPDA = this.findUserWhitelistPDA(user.publicKey);
    
    // Get user's token account
    const userTokenAccount = await getAssociatedTokenAddress(
      tokenMint,
      user.publicKey
    );

    // Create flash loan data account
    const slot = await this.provider.connection.getSlot();
    const flashLoanDataPDA = this.findFlashLoanDataPDA(user.publicKey, slot);

    const boostParams: BoostParams = {
      borrowAmount,
      strategy,
      strategyData,
    };

    const tx = await this.program.methods
      .boostPosition(boostParams)
      .accounts({
        state: this.statePDA,
        user: user.publicKey,
        userWhitelist: userWhitelistPDA,
        positionAccount,
        tokenAccount: userTokenAccount,
        flashLoanData: flashLoanDataPDA,
        flashLoanProvider,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([user])
      .rpc();

    return tx;
  }

  /**
   * Add user to whitelist
   */
  async addToWhitelist(
    authority: Keypair,
    userToWhitelist: PublicKey
  ): Promise<string> {
    const userWhitelistPDA = this.findUserWhitelistPDA(userToWhitelist);

    const tx = await this.program.methods
      .addToWhitelist()
      .accounts({
        state: this.statePDA,
        authority: authority.publicKey,
        user: userToWhitelist,
        userWhitelist: userWhitelistPDA,
        systemProgram: SystemProgram.programId,
      })
      .signers([authority])
      .rpc();

    return tx;
  }

  /**
   * Update protocol fee
   */
  async updateProtocolFee(
    authority: Keypair,
    newFeeBps: number
  ): Promise<string> {
    const tx = await this.program.methods
      .updateProtocolFee(newFeeBps)
      .accounts({
        state: this.statePDA,
        authority: authority.publicKey,
      })
      .signers([authority])
      .rpc();

    return tx;
  }

  /**
   * Pause/unpause protocol
   */
  async setPaused(
    authority: Keypair,
    paused: boolean
  ): Promise<string> {
    const tx = await this.program.methods
      .setPaused(paused)
      .accounts({
        state: this.statePDA,
        authority: authority.publicKey,
      })
      .signers([authority])
      .rpc();

    return tx;
  }

  /**
   * Get protocol state
   */
  async getProtocolState(): Promise<ProtocolState> {
    const state = await this.program.account.protocolState.fetch(this.statePDA);
    return state as ProtocolState;
  }

  /**
   * Check if user is whitelisted
   */
  async isUserWhitelisted(user: PublicKey): Promise<boolean> {
    const userWhitelistPDA = this.findUserWhitelistPDA(user);
    
    try {
      const whitelist = await this.program.account.userWhitelist.fetch(userWhitelistPDA);
      return whitelist.isWhitelisted;
    } catch {
      return false;
    }
  }

  /**
   * Estimate boost profit
   */
  async estimateBoostProfit(
    positionAccount: PublicKey,
    borrowAmount: BN,
    strategy: Strategy,
    tokenMint: PublicKey
  ): Promise<{
    estimatedProfit: BN;
    flashLoanFee: BN;
    protocolFee: BN;
    netProfit: BN;
  }> {
    // This would call view functions or simulate transaction
    // For now, return mock values
    const estimatedProfit = borrowAmount.mul(new BN(5)).div(new BN(100)); // 5% profit
    const flashLoanFee = borrowAmount.mul(new BN(30)).div(new BN(10000)); // 0.3% fee
    const protocolFee = estimatedProfit.mul(new BN(50)).div(new BN(10000)); // 0.5% protocol fee
    const netProfit = estimatedProfit.sub(flashLoanFee).sub(protocolFee);

    return {
      estimatedProfit,
      flashLoanFee,
      protocolFee,
      netProfit,
    };
  }

  /**
   * Get boost history for user
   */
  async getUserBoostHistory(
    user: PublicKey,
    limit: number = 10
  ): Promise<any[]> {
    // Fetch transaction history and parse events
    const signatures = await this.provider.connection.getSignaturesForAddress(
      user,
      { limit }
    );

    const transactions = await this.provider.connection.getParsedTransactions(
      signatures.map(s => s.signature)
    );

    // Parse and filter boost transactions
    return transactions
      .filter(tx => tx && this.isBoostTransaction(tx))
      .map(tx => this.parseBoostTransaction(tx));
  }

  // Helper methods

  private findStatePDA(): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from('state')],
      this.program.programId
    );
    return pda;
  }

  private findUserWhitelistPDA(user: PublicKey): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from('whitelist'), user.toBuffer()],
      this.program.programId
    );
    return pda;
  }

  private findFlashLoanDataPDA(user: PublicKey, slot: number): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from('flash_loan'),
        user.toBuffer(),
        new BN(slot).toArrayLike(Buffer, 'le', 8)
      ],
      this.program.programId
    );
    return pda;
  }

  private isBoostTransaction(tx: any): boolean {
    // Check if transaction contains boost instruction
    return tx?.meta?.logMessages?.some((log: string) => 
      log.includes('Program log: Instruction: BoostPosition')
    );
  }

  private parseBoostTransaction(tx: any): any {
    // Parse transaction logs and events
    return {
      signature: tx.transaction.signatures[0],
      slot: tx.slot,
      timestamp: tx.blockTime,
      // Parse additional details from logs
    };
  }

  /**
   * Create boost position instruction (for custom transaction building)
   */
  async createBoostPositionInstruction(
    user: PublicKey,
    positionAccount: PublicKey,
    flashLoanProvider: PublicKey,
    tokenMint: PublicKey,
    borrowAmount: BN,
    strategy: Strategy,
    strategyData: Buffer = Buffer.alloc(0)
  ): Promise<TransactionInstruction> {
    const userWhitelistPDA = this.findUserWhitelistPDA(user);
    const userTokenAccount = await getAssociatedTokenAddress(tokenMint, user);
    const slot = await this.provider.connection.getSlot();
    const flashLoanDataPDA = this.findFlashLoanDataPDA(user, slot);

    const boostParams: BoostParams = {
      borrowAmount,
      strategy,
      strategyData,
    };

    return this.program.methods
      .boostPosition(boostParams)
      .accounts({
        state: this.statePDA,
        user,
        userWhitelist: userWhitelistPDA,
        positionAccount,
        tokenAccount: userTokenAccount,
        flashLoanData: flashLoanDataPDA,
        flashLoanProvider,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .instruction();
  }
}