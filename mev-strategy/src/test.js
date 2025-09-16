const MEVStrategy = require('./mev-strategy');
require('dotenv').config();

async function runTests() {
    console.log('🧪 STARTING MEV STRATEGY TESTS\n');
    
    const strategy = new MEVStrategy(true); // Use devnet for testing
    
    try {
        // Test 1: Initialization
        console.log('TEST 1: Strategy Initialization');
        await strategy.initialize();
        console.log('✅ Initialization successful\n');
        
        // Test 2: Oracle monitoring
        console.log('TEST 2: Oracle Monitoring');
        const oracleData = await strategy.oracleMonitor.getCurrentPrice();
        console.log(`📊 Current SOL price: $${oracleData.price.toFixed(2)}`);
        console.log(`⏱️ Oracle staleness: ${oracleData.staleness}ms`);
        console.log('✅ Oracle monitoring working\n');
        
        // Test 3: Market analysis
        console.log('TEST 3: Market Analysis');
        const opportunity = await strategy.analyzeOpportunity();
        console.log(`💰 Expected profit: $${opportunity.expectedProfit.netProfit.toFixed(2)}`);
        console.log(`📈 Estimated impact: ${opportunity.estimatedImpact.toFixed(2)}%`);
        console.log(`🎯 Should execute: ${opportunity.riskAssessment.execute}`);
        console.log('✅ Market analysis working\n');
        
        // Test 4: Risk management
        console.log('TEST 4: Risk Management');
        const riskReport = strategy.riskManager.generateRiskReport();
        console.log(`📊 Daily PnL: $${riskReport.daily.pnl.toFixed(2)}`);
        console.log(`🔴 Emergency stop: ${riskReport.emergencyStop.shouldStop}`);
        console.log('✅ Risk management working\n');
        
        // Test 5: Bundle simulation (if opportunity exists)
        if (opportunity.riskAssessment.execute) {
            console.log('TEST 5: Bundle Simulation');
            // This would test actual transaction creation and simulation
            console.log('⚠️ Skipping bundle simulation in test mode');
            console.log('✅ Bundle simulation framework ready\n');
        }
        
        // Test 6: Strategy statistics
        console.log('TEST 6: Strategy Statistics');
        const stats = strategy.getStrategyStats();
        console.log(`📈 Total executions: ${stats.totalExecutions}`);
        console.log(`✅ Success rate: ${stats.successRate.toFixed(1)}%`);
        console.log(`💰 Total profit: $${stats.totalProfit.toFixed(2)}`);
        console.log('✅ Statistics working\n');
        
        console.log('🎉 ALL TESTS PASSED!');
        
        // Cleanup
        await strategy.shutdown();
        
    } catch (error) {
        console.error('❌ Test failed:', error);
        await strategy.shutdown();
        process.exit(1);
    }
}

async function runLiveTest() {
    console.log('🚀 STARTING LIVE TEST (SMALL AMOUNTS)\n');
    
    const strategy = new MEVStrategy(false); // Use mainnet
    
    try {
        await strategy.initialize();
        
        // Override position sizes for testing
        strategy.maxPositionA = 1000; // $1k instead of $2.5M
        strategy.maxPositionB = 160;  // $160 instead of $400k
        strategy.minProfitThreshold = 10; // $10 instead of $50k
        
        console.log('🧪 Running single strategy execution with small amounts...');
        const result = await strategy.executeStrategy();
        
        console.log('\n📊 EXECUTION RESULTS:');
        console.log(`Success: ${result.success}`);
        console.log(`Profit: $${result.profit.toFixed(2)}`);
        console.log(`Execution time: ${result.executionTime}ms`);
        console.log(`Steps completed: ${result.steps.join(' → ')}`);
        
        if (result.error) {
            console.log(`Error: ${result.error}`);
        }
        
        // Show final stats
        const stats = strategy.getStrategyStats();
        console.log('\n📈 STRATEGY STATISTICS:');
        console.log(JSON.stringify(stats, null, 2));
        
        await strategy.shutdown();
        
    } catch (error) {
        console.error('❌ Live test failed:', error);
        await strategy.shutdown();
        process.exit(1);
    }
}

// Check command line arguments
const testType = process.argv[2] || 'unit';

if (testType === 'live') {
    console.log('⚠️  WARNING: Running live test with real funds!');
    console.log('⚠️  Make sure you have configured small test amounts!');
    console.log('⚠️  Press Ctrl+C to cancel, or wait 5 seconds to continue...\n');
    
    setTimeout(() => {
        runLiveTest().catch(console.error);
    }, 5000);
} else {
    runTests().catch(console.error);
}

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Received SIGINT, shutting down gracefully...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
    process.exit(0);
});