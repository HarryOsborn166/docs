const { Connection, Transaction, PublicKey, SystemProgram, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const axios = require('axios');
require('dotenv').config();

class JitoBundleManager {
    constructor(connection, wallets) {
        this.connection = connection;
        this.wallets = wallets; // Array of wallet keypairs
        
        this.jitoRpcUrl = process.env.JITO_RPC_URL || 'https://mainnet.block-engine.jito.wtf';
        this.jitoBundleUrl = `${this.jitoRpcUrl}/api/v1/bundles`;
        this.jitoTipAccount = new PublicKey(process.env.JITO_TIP_ACCOUNT || '96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5');
        
        this.defaultTip = 0.01 * LAMPORTS_PER_SOL; // 0.01 SOL tip
        this.maxRetries = 3;
        this.bundleTimeout = 30000; // 30 seconds
    }

    async createTipInstruction(tipAmount = this.defaultTip, fromWallet = this.wallets[0]) {
        return SystemProgram.transfer({
            fromPubkey: fromWallet.publicKey,
            toPubkey: this.jitoTipAccount,
            lamports: tipAmount
        });
    }

    async createBundle(transactions, tipAmount = this.defaultTip) {
        try {
            console.log(`📦 Creating Jito bundle with ${transactions.length} transactions...`);
            
            // Get latest blockhash
            const { blockhash } = await this.connection.getLatestBlockhash('finalized');
            
            // Prepare all transactions
            const bundleTransactions = [];
            
            for (let i = 0; i < transactions.length; i++) {
                const tx = transactions[i];
                tx.recentBlockhash = blockhash;
                tx.feePayer = tx.feePayer || this.wallets[i % this.wallets.length].publicKey;
                
                // Sign transaction
                const wallet = this.wallets.find(w => w.publicKey.equals(tx.feePayer));
                if (wallet) {
                    tx.sign(wallet);
                }
                
                bundleTransactions.push(tx);
            }
            
            // Add tip transaction as the last transaction
            const tipInstruction = await this.createTipInstruction(tipAmount);
            const tipTransaction = new Transaction().add(tipInstruction);
            tipTransaction.recentBlockhash = blockhash;
            tipTransaction.feePayer = this.wallets[0].publicKey;
            tipTransaction.sign(this.wallets[0]);
            
            bundleTransactions.push(tipTransaction);
            
            // Serialize transactions
            const serializedTransactions = bundleTransactions.map(tx => tx.serialize());
            
            return {
                transactions: bundleTransactions,
                serialized: serializedTransactions,
                blockhash: blockhash
            };
            
        } catch (error) {
            console.error('❌ Error creating bundle:', error);
            throw error;
        }
    }

    async submitBundle(bundle, maxRetries = this.maxRetries) {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                console.log(`🚀 Submitting bundle (attempt ${attempt}/${maxRetries})...`);
                
                const bundleData = {
                    jsonrpc: '2.0',
                    id: 1,
                    method: 'sendBundle',
                    params: [bundle.serialized.map(tx => tx.toString('base64'))]
                };

                const response = await axios.post(this.jitoBundleUrl, bundleData, {
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    timeout: this.bundleTimeout
                });

                if (response.data.error) {
                    throw new Error(`Jito bundle error: ${JSON.stringify(response.data.error)}`);
                }

                const bundleId = response.data.result;
                console.log(`✅ Bundle submitted successfully! ID: ${bundleId}`);
                
                return {
                    success: true,
                    bundleId: bundleId,
                    attempt: attempt,
                    transactions: bundle.transactions.map(tx => tx.signature?.toString())
                };
                
            } catch (error) {
                console.error(`❌ Bundle submission attempt ${attempt} failed:`, error.message);
                
                if (attempt === maxRetries) {
                    throw error;
                }
                
                // Wait before retry
                await this.sleep(1000 * attempt);
            }
        }
    }

    async waitForBundleConfirmation(bundleId, timeoutMs = 30000) {
        const startTime = Date.now();
        
        console.log(`⏳ Waiting for bundle confirmation: ${bundleId}`);
        
        while (Date.now() - startTime < timeoutMs) {
            try {
                const statusData = {
                    jsonrpc: '2.0',
                    id: 1,
                    method: 'getBundleStatuses',
                    params: [[bundleId]]
                };

                const response = await axios.post(this.jitoRpcUrl, statusData, {
                    headers: { 'Content-Type': 'application/json' },
                    timeout: 5000
                });

                if (response.data.result && response.data.result.value.length > 0) {
                    const bundleStatus = response.data.result.value[0];
                    
                    if (bundleStatus.confirmation_status === 'confirmed') {
                        console.log(`✅ Bundle confirmed! Slot: ${bundleStatus.slot}`);
                        return {
                            confirmed: true,
                            slot: bundleStatus.slot,
                            bundleId: bundleId
                        };
                    } else if (bundleStatus.err) {
                        console.error(`❌ Bundle failed:`, bundleStatus.err);
                        return {
                            confirmed: false,
                            error: bundleStatus.err,
                            bundleId: bundleId
                        };
                    }
                }
                
                await this.sleep(1000);
                
            } catch (error) {
                console.error('Error checking bundle status:', error.message);
                await this.sleep(2000);
            }
        }
        
        return {
            confirmed: false,
            error: 'Timeout waiting for bundle confirmation',
            bundleId: bundleId
        };
    }

    async simulateBundle(transactions) {
        try {
            console.log('🧪 Simulating bundle execution...');
            
            const bundle = await this.createBundle(transactions, 0); // No tip for simulation
            
            // Simulate each transaction
            const results = [];
            for (let i = 0; i < bundle.transactions.length - 1; i++) { // Skip tip transaction
                const tx = bundle.transactions[i];
                
                try {
                    const simulation = await this.connection.simulateTransaction(tx, {
                        commitment: 'processed',
                        sigVerify: false
                    });
                    
                    results.push({
                        index: i,
                        success: !simulation.value.err,
                        error: simulation.value.err,
                        logs: simulation.value.logs,
                        unitsConsumed: simulation.value.unitsConsumed
                    });
                    
                } catch (error) {
                    results.push({
                        index: i,
                        success: false,
                        error: error.message
                    });
                }
            }
            
            const allSuccessful = results.every(r => r.success);
            console.log(`📊 Bundle simulation: ${allSuccessful ? '✅ SUCCESS' : '❌ FAILED'}`);
            
            return {
                success: allSuccessful,
                results: results,
                totalTransactions: results.length
            };
            
        } catch (error) {
            console.error('❌ Bundle simulation error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    calculateOptimalTip(priorityLevel = 'medium') {
        const tipLevels = {
            low: 0.005 * LAMPORTS_PER_SOL,      // 0.005 SOL
            medium: 0.01 * LAMPORTS_PER_SOL,    // 0.01 SOL  
            high: 0.02 * LAMPORTS_PER_SOL,      // 0.02 SOL
            urgent: 0.05 * LAMPORTS_PER_SOL     // 0.05 SOL
        };
        
        return tipLevels[priorityLevel] || tipLevels.medium;
    }

    async executeAtomicStrategy(strategyTransactions, priorityLevel = 'high') {
        try {
            const tipAmount = this.calculateOptimalTip(priorityLevel);
            
            console.log('🎯 Executing atomic MEV strategy...');
            console.log(`💰 Tip amount: ${tipAmount / LAMPORTS_PER_SOL} SOL`);
            
            // First simulate the bundle
            const simulation = await this.simulateBundle(strategyTransactions);
            
            if (!simulation.success) {
                throw new Error(`Bundle simulation failed: ${JSON.stringify(simulation.results)}`);
            }
            
            // Create and submit bundle
            const bundle = await this.createBundle(strategyTransactions, tipAmount);
            const submission = await this.submitBundle(bundle);
            
            if (!submission.success) {
                throw new Error('Bundle submission failed');
            }
            
            // Wait for confirmation
            const confirmation = await this.waitForBundleConfirmation(submission.bundleId);
            
            return {
                success: confirmation.confirmed,
                bundleId: submission.bundleId,
                slot: confirmation.slot,
                tipAmount: tipAmount / LAMPORTS_PER_SOL,
                transactionCount: strategyTransactions.length,
                error: confirmation.error
            };
            
        } catch (error) {
            console.error('❌ Atomic strategy execution failed:', error);
            throw error;
        }
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = JitoBundleManager;