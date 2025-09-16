const MEVStrategy = require('./mev-strategy');
require('dotenv').config();

async function main() {
    console.log('🚀 STARTING SOLANA MEV STRATEGY');
    console.log('🎯 Target: Drift Protocol Price Impact Strategy');
    console.log('⚡ Execution: Jito Bundle Atomic Transactions\n');
    
    // Check if running in test mode
    const testMode = process.env.TEST_MODE === 'true';
    const dryRun = process.env.DRY_RUN === 'true';
    const useDevnet = process.env.USE_DEVNET === 'true';
    
    if (testMode) {
        console.log('🧪 Running in TEST MODE');
    }
    
    if (dryRun) {
        console.log('🏃 Running in DRY RUN mode (no real transactions)');
    }
    
    if (useDevnet) {
        console.log('🌐 Using DEVNET');
    }
    
    const strategy = new MEVStrategy(useDevnet);
    
    try {
        // Initialize strategy
        await strategy.initialize();
        
        // Adjust parameters for testing
        if (testMode) {
            console.log('🔧 Adjusting parameters for testing...');
            strategy.maxPositionA = 10000;    // $10k instead of $2.5M
            strategy.maxPositionB = 1600;     // $1.6k instead of $400k  
            strategy.minProfitThreshold = 100; // $100 instead of $50k
            console.log(`📊 Test position sizes: $${strategy.maxPositionA} / $${strategy.maxPositionB}`);
        }
        
        // Show initial status
        await strategy.displayAccountInfo();
        const riskReport = strategy.riskManager.generateRiskReport();
        console.log('\n📊 INITIAL RISK ASSESSMENT:');
        console.log(JSON.stringify(riskReport, null, 2));
        
        if (dryRun) {
            console.log('\n🏃 DRY RUN: Analyzing opportunities without executing...');
            
            // Continuous analysis without execution
            let analysisCount = 0;
            const maxAnalysis = 10;
            
            while (analysisCount < maxAnalysis) {
                try {
                    const opportunity = await strategy.analyzeOpportunity();
                    
                    console.log(`\n📊 ANALYSIS #${analysisCount + 1}:`);
                    console.log(`Current price: $${opportunity.currentPrice.toFixed(2)}`);
                    console.log(`Expected impact: ${opportunity.estimatedImpact.toFixed(2)}%`);
                    console.log(`Expected profit: $${opportunity.expectedProfit.netProfit.toFixed(2)}`);
                    console.log(`Should execute: ${opportunity.riskAssessment.execute}`);
                    console.log(`Confidence: ${opportunity.riskAssessment.confidence}%`);
                    
                    if (!opportunity.riskAssessment.execute) {
                        console.log(`Reasons: ${opportunity.riskAssessment.reasons.join(', ')}`);
                    }
                    
                    analysisCount++;
                    await strategy.sleep(10000); // Wait 10 seconds between analyses
                    
                } catch (error) {
                    console.error(`❌ Analysis error: ${error.message}`);
                    analysisCount++;
                }
            }
            
        } else {
            // Real execution mode
            console.log('\n🎯 STARTING LIVE EXECUTION MODE');
            console.log('⚠️  WARNING: This will execute real transactions with real funds!');
            
            if (!testMode) {
                console.log('⚠️  Press Ctrl+C within 10 seconds to cancel...');
                await strategy.sleep(10000);
            }
            
            // Start automated trading
            const tradingInterval = testMode ? 60000 : 30000; // 1 min for test, 30 sec for live
            await strategy.startAutomatedTrading(tradingInterval);
        }
        
    } catch (error) {
        console.error('❌ Fatal error:', error);
    } finally {
        // Cleanup
        console.log('\n🔌 Shutting down...');
        await strategy.shutdown();
        
        // Show final statistics
        const finalStats = strategy.getStrategyStats();
        console.log('\n📈 FINAL STATISTICS:');
        console.log(JSON.stringify(finalStats, null, 2));
        
        console.log('\n👋 MEV Strategy terminated');
        process.exit(0);
    }
}

// Graceful shutdown handlers
process.on('SIGINT', async () => {
    console.log('\n🛑 Received SIGINT (Ctrl+C), shutting down gracefully...');
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
    process.exit(0);
});

process.on('uncaughtException', (error) => {
    console.error('💥 Uncaught Exception:', error);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

// Start the application
main().catch(error => {
    console.error('💥 Application failed to start:', error);
    process.exit(1);
});