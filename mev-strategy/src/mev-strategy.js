const { Connection, Keypair, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const OracleMonitor = require('./oracle-monitor');
const DriftTrader = require('./drift-trading');
const JitoBundleManager = require('./jito-bundle');
const RiskManager = require('./risk-manager');
const { SimpleFlashLoan } = require('./flash-loan');
require('dotenv').config();

class MEVStrategy {
    constructor(isDevnet = false) {
        this.isDevnet = isDevnet;
        this.connection = new Connection(
            isDevnet ? 'https://api.devnet.solana.com' : process.env.SOLANA_RPC_URL
        );
        
        // Load wallets
        this.walletA = this.loadWallet(process.env.WALLET_A_PRIVATE_KEY);
        this.walletB = this.loadWallet(process.env.WALLET_B_PRIVATE_KEY);
        this.backupWallet = this.loadWallet(process.env.BACKUP_WALLET_PRIVATE_KEY);
        
        // Initialize components
        this.oracleMonitor = new OracleMonitor();
        this.driftTraderA = new DriftTrader(this.connection, this.walletA, isDevnet);
        this.driftTraderB = new DriftTrader(this.connection, this.walletB, isDevnet);
        this.bundleManager = new JitoBundleManager(this.connection, [this.walletA, this.walletB]);
        this.riskManager = new RiskManager();
        this.flashLoan = new SimpleFlashLoan(this.connection, this.walletA);
        
        // Strategy parameters
        this.maxPositionA = parseFloat(process.env.MAX_POSITION_SIZE) || 2500000; // $2.5M
        this.maxPositionB = this.maxPositionA * 0.16; // $400k (16% of main position)
        this.targetImpact = 2.8; // 2.8% target price impact
        this.minProfitThreshold = 50000; // $50k minimum profit
        
        this.isRunning = false;
        this.strategyStats = {
            totalExecutions: 0,
            successfulExecutions: 0,
            totalProfit: 0,
            avgExecutionTime: 0
        };
    }

    loadWallet(privateKeyBase58) {
        if (!privateKeyBase58) {
            throw new Error('Private key not provided');
        }
        
        try {
            const privateKeyBytes = Buffer.from(privateKeyBase58, 'base64');
            return Keypair.fromSecretKey(privateKeyBytes);
        } catch (error) {
            console.error('Error loading wallet:', error);
            throw error;
        }
    }

    async initialize() {
        try {
            console.log('🚀 Initializing MEV Strategy...');
            
            // Initialize Drift traders
            await this.driftTraderA.initialize();
            await this.driftTraderB.initialize();
            
            // Start oracle monitoring
            this.oracleMonitor.startMonitoring(1000);
            
            console.log('✅ MEV Strategy initialized successfully');
            
            // Display account info
            await this.displayAccountInfo();
            
            return true;
            
        } catch (error) {
            console.error('❌ Error initializing MEV Strategy:', error);
            throw error;
        }
    }

    async displayAccountInfo() {
        try {
            const balanceA = await this.connection.getBalance(this.walletA.publicKey);
            const balanceB = await this.connection.getBalance(this.walletB.publicKey);
            
            const accountA = await this.driftTraderA.getAccountInfo();
            const accountB = await this.driftTraderB.getAccountInfo();
            
            console.log('\n📊 ACCOUNT STATUS:');
            console.log(`Wallet A: ${balanceA / LAMPORTS_PER_SOL} SOL | Drift Equity: $${accountA.equity.toFixed(2)}`);
            console.log(`Wallet B: ${balanceB / LAMPORTS_PER_SOL} SOL | Drift Equity: $${accountB.equity.toFixed(2)}`);
            console.log(`Total Available: $${(accountA.equity + accountB.equity).toFixed(2)}`);
            
        } catch (error) {
            console.error('Error displaying account info:', error);
        }
    }

    async analyzeOpportunity() {
        try {
            // Get current market conditions
            const oracleData = await this.oracleMonitor.getCurrentPrice();
            const marketSuitability = await this.oracleMonitor.isMarketSuitable();
            const marketInfo = await this.driftTraderA.getMarketInfo();
            
            // Estimate price impact
            const impactEstimate = await this.driftTraderA.estimatePriceImpact(
                this.maxPositionA, 'long'
            );
            
            // Calculate expected profit
            const expectedProfit = this.calculateExpectedProfit(
                oracleData.price,
                impactEstimate.estimatedPrice,
                this.maxPositionA,
                this.maxPositionB
            );
            
            const opportunity = {
                currentPrice: oracleData.price,
                estimatedImpact: impactEstimate.estimatedImpact,
                expectedProfit: expectedProfit,
                marketConditions: marketSuitability,
                riskAssessment: null
            };
            
            // Risk assessment
            opportunity.riskAssessment = this.riskManager.shouldExecuteStrategy(
                oracleData,
                {
                    volatility: this.oracleMonitor.getPriceVolatility(),
                    liquidity: impactEstimate.liquidityReserve * oracleData.price,
                    spread: 0.001 // Placeholder
                },
                this.maxPositionA,
                expectedProfit
            );
            
            return opportunity;
            
        } catch (error) {
            console.error('Error analyzing opportunity:', error);
            throw error;
        }
    }

    calculateExpectedProfit(entryPrice, impactPrice, positionA, positionB) {
        // Calculate profit for Wallet A
        const profitA = ((impactPrice - entryPrice) / entryPrice) * positionA;
        
        // Calculate profit for Wallet B (enters at higher price)
        const entryPriceB = entryPrice * 1.028; // 2.8% higher
        const profitB = ((impactPrice - entryPriceB) / entryPriceB) * positionB;
        
        // Subtract estimated costs
        const flashLoanCosts = (positionA * 0.0005) + (positionB * 0.0005); // 0.05% fee
        const jitoCosts = 0.02 * LAMPORTS_PER_SOL * 200; // Estimated Jito tips in USD
        const driftFees = (positionA + positionB) * 0.001; // 0.1% trading fees
        
        const totalCosts = flashLoanCosts + jitoCosts + driftFees;
        const netProfit = profitA + profitB - totalCosts;
        
        return {
            grossProfit: profitA + profitB,
            totalCosts: totalCosts,
            netProfit: netProfit,
            profitA: profitA,
            profitB: profitB,
            roi: (netProfit / (positionA + positionB)) * 100
        };
    }

    async executeStrategy() {
        const startTime = Date.now();
        let executionResult = {
            success: false,
            profit: 0,
            error: null,
            executionTime: 0,
            steps: []
        };
        
        try {
            console.log('\n🎯 EXECUTING MEV STRATEGY...');
            
            // Step 0: Analyze opportunity
            const opportunity = await this.analyzeOpportunity();
            
            if (!opportunity.riskAssessment.execute) {
                throw new Error(`Strategy rejected: ${opportunity.riskAssessment.reasons.join(', ')}`);
            }
            
            console.log(`💰 Expected profit: $${opportunity.expectedProfit.netProfit.toFixed(2)}`);
            console.log(`📊 Confidence: ${opportunity.riskAssessment.confidence}%`);
            
            // Step 1: Wait for fresh oracle
            await this.oracleMonitor.waitForFreshOracle();
            executionResult.steps.push('Oracle synchronized');
            
            // Step 2: Create strategy transactions
            const strategyTxs = await this.createStrategyTransactions(opportunity);
            executionResult.steps.push('Transactions created');
            
            // Step 3: Simulate bundle
            const simulation = await this.bundleManager.simulateBundle(strategyTxs);
            if (!simulation.success) {
                throw new Error('Bundle simulation failed');
            }
            executionResult.steps.push('Bundle simulated');
            
            // Step 4: Execute atomic bundle
            const bundleResult = await this.bundleManager.executeAtomicStrategy(strategyTxs, 'high');
            
            if (!bundleResult.success) {
                throw new Error(`Bundle execution failed: ${bundleResult.error}`);
            }
            
            executionResult.steps.push('Bundle executed');
            
            // Step 5: Verify results
            await this.sleep(2000); // Wait for settlement
            const finalResult = await this.verifyExecution();
            
            executionResult.success = finalResult.success;
            executionResult.profit = finalResult.profit;
            executionResult.steps.push('Results verified');
            
            // Record trade
            this.riskManager.recordTrade(
                opportunity.currentPrice,
                finalResult.exitPrice,
                this.maxPositionA + this.maxPositionB,
                10, // leverage
                finalResult.success
            );
            
            // Update stats
            this.strategyStats.totalExecutions++;
            if (executionResult.success) {
                this.strategyStats.successfulExecutions++;
                this.strategyStats.totalProfit += executionResult.profit;
            }
            
            console.log(`${executionResult.success ? '✅' : '❌'} Strategy completed: $${executionResult.profit.toFixed(2)} profit`);
            
        } catch (error) {
            executionResult.error = error.message;
            console.error('❌ Strategy execution failed:', error.message);
        }
        
        executionResult.executionTime = Date.now() - startTime;
        this.strategyStats.avgExecutionTime = (
            (this.strategyStats.avgExecutionTime * (this.strategyStats.totalExecutions - 1) + executionResult.executionTime) /
            this.strategyStats.totalExecutions
        );
        
        return executionResult;
    }

    async createStrategyTransactions(opportunity) {
        // This is a simplified version - in reality, you'd create actual Drift transactions
        console.log('📝 Creating strategy transactions...');
        
        const transactions = [];
        
        // Transaction 1: Flash loan + Open position A
        // Transaction 2: Open position B  
        // Transaction 3: Close position A + Repay flash loan
        // Transaction 4: Close position B
        
        // For testing, we'll use placeholder transactions
        // In production, these would be actual Drift Protocol transactions
        
        return transactions;
    }

    async verifyExecution() {
        try {
            // Check positions and calculate actual profit
            const positionA = await this.driftTraderA.getCurrentPosition();
            const positionB = await this.driftTraderB.getCurrentPosition();
            
            let totalProfit = 0;
            
            if (positionA) {
                totalProfit += positionA.unrealizedPnl;
            }
            
            if (positionB) {
                totalProfit += positionB.unrealizedPnl;
            }
            
            return {
                success: totalProfit > 1000, // At least $1k profit
                profit: totalProfit,
                exitPrice: (await this.oracleMonitor.getCurrentPrice()).price
            };
            
        } catch (error) {
            console.error('Error verifying execution:', error);
            return {
                success: false,
                profit: 0,
                exitPrice: 0
            };
        }
    }

    async startAutomatedTrading(intervalMs = 30000) {
        console.log('🤖 Starting automated MEV trading...');
        this.isRunning = true;
        
        while (this.isRunning) {
            try {
                // Check emergency stop conditions
                const riskReport = this.riskManager.generateRiskReport();
                
                if (riskReport.emergencyStop.shouldStop) {
                    console.log('🛑 Emergency stop triggered!');
                    console.log(JSON.stringify(riskReport.emergencyStop, null, 2));
                    break;
                }
                
                // Analyze opportunity
                const opportunity = await this.analyzeOpportunity();
                
                if (opportunity.riskAssessment.execute) {
                    console.log('🎯 Opportunity detected, executing strategy...');
                    await this.executeStrategy();
                } else {
                    console.log(`⏳ No suitable opportunity. Reasons: ${opportunity.riskAssessment.reasons.join(', ')}`);
                }
                
                // Wait before next iteration
                await this.sleep(intervalMs);
                
            } catch (error) {
                console.error('❌ Error in automated trading loop:', error);
                await this.sleep(intervalMs * 2); // Wait longer on error
            }
        }
        
        console.log('🛑 Automated trading stopped');
    }

    stopAutomatedTrading() {
        this.isRunning = false;
        console.log('🛑 Stopping automated trading...');
    }

    getStrategyStats() {
        const successRate = this.strategyStats.totalExecutions > 0 ? 
            (this.strategyStats.successfulExecutions / this.strategyStats.totalExecutions) * 100 : 0;
            
        return {
            ...this.strategyStats,
            successRate: successRate,
            avgProfitPerTrade: this.strategyStats.successfulExecutions > 0 ? 
                this.strategyStats.totalProfit / this.strategyStats.successfulExecutions : 0,
            riskMetrics: this.riskManager.generateRiskReport()
        };
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async shutdown() {
        console.log('🔌 Shutting down MEV Strategy...');
        
        this.stopAutomatedTrading();
        
        // Close any open positions
        try {
            await this.driftTraderA.closePosition();
            await this.driftTraderB.closePosition();
        } catch (error) {
            console.error('Error closing positions:', error);
        }
        
        // Disconnect from Drift
        await this.driftTraderA.disconnect();
        await this.driftTraderB.disconnect();
        
        console.log('✅ Shutdown complete');
    }
}

module.exports = MEVStrategy;