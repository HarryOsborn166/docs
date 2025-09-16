const { LAMPORTS_PER_SOL } = require('@solana/web3.js');
require('dotenv').config();

class RiskManager {
    constructor() {
        this.maxPositionSize = parseFloat(process.env.MAX_POSITION_SIZE) || 2500000;
        this.minPositionSize = parseFloat(process.env.MIN_POSITION_SIZE) || 100000;
        this.maxLeverage = parseInt(process.env.MAX_LEVERAGE) || 10;
        this.stopLossPct = parseFloat(process.env.STOP_LOSS_PCT) || 0.005; // 0.5%
        this.maxDailyLoss = parseFloat(process.env.MAX_DAILY_LOSS) || 50000;
        this.oracleStalenessThreshold = parseInt(process.env.ORACLE_STALENESS_THRESHOLD) || 500; // ms
        
        this.dailyPnL = 0;
        this.dailyTradeCount = 0;
        this.lastResetDate = new Date().toDateString();
        this.consecutiveLosses = 0;
        this.maxConsecutiveLosses = 3;
        
        this.positionHistory = [];
        this.riskMetrics = {
            totalTrades: 0,
            winRate: 0,
            avgProfit: 0,
            maxDrawdown: 0,
            sharpeRatio: 0
        };
    }

    resetDailyMetrics() {
        const today = new Date().toDateString();
        if (this.lastResetDate !== today) {
            console.log('📅 Resetting daily metrics...');
            this.dailyPnL = 0;
            this.dailyTradeCount = 0;
            this.consecutiveLosses = 0;
            this.lastResetDate = today;
        }
    }

    validatePositionSize(size) {
        this.resetDailyMetrics();
        
        const checks = {
            withinLimits: size >= this.minPositionSize && size <= this.maxPositionSize,
            dailyLossLimit: this.dailyPnL > -this.maxDailyLoss,
            consecutiveLossLimit: this.consecutiveLosses < this.maxConsecutiveLosses,
            valid: false
        };
        
        checks.valid = checks.withinLimits && checks.dailyLossLimit && checks.consecutiveLossLimit;
        
        if (!checks.withinLimits) {
            console.log(`⚠️ Position size ${size} outside limits [${this.minPositionSize}, ${this.maxPositionSize}]`);
        }
        
        if (!checks.dailyLossLimit) {
            console.log(`⚠️ Daily loss limit reached: $${this.dailyPnL.toFixed(2)} < -$${this.maxDailyLoss}`);
        }
        
        if (!checks.consecutiveLossLimit) {
            console.log(`⚠️ Too many consecutive losses: ${this.consecutiveLosses}`);
        }
        
        return checks;
    }

    validateMarketConditions(oracleData, marketData) {
        const conditions = {
            oracleFresh: !oracleData.isStale,
            lowVolatility: marketData.volatility < 5.0, // Less than 5% volatility
            sufficientLiquidity: marketData.liquidity > this.minPositionSize * 10,
            reasonableSpread: marketData.spread < 0.001, // Less than 0.1% spread
            suitable: false
        };
        
        conditions.suitable = conditions.oracleFresh && 
                             conditions.lowVolatility && 
                             conditions.sufficientLiquidity && 
                             conditions.reasonableSpread;
        
        if (!conditions.oracleFresh) {
            console.log(`⚠️ Oracle is stale: ${oracleData.staleness}ms`);
        }
        
        if (!conditions.lowVolatility) {
            console.log(`⚠️ High volatility: ${marketData.volatility.toFixed(2)}%`);
        }
        
        if (!conditions.sufficientLiquidity) {
            console.log(`⚠️ Insufficient liquidity: $${marketData.liquidity}`);
        }
        
        if (!conditions.reasonableSpread) {
            console.log(`⚠️ Wide spread: ${(marketData.spread * 100).toFixed(3)}%`);
        }
        
        return conditions;
    }

    calculatePositionRisk(entryPrice, currentPrice, positionSize, leverage) {
        const priceChange = (currentPrice - entryPrice) / entryPrice;
        const pnl = priceChange * positionSize;
        const leveragedPnl = pnl * leverage;
        const riskPercent = Math.abs(leveragedPnl) / positionSize * 100;
        
        return {
            priceChange: priceChange * 100,
            unrealizedPnl: leveragedPnl,
            riskPercent: riskPercent,
            shouldStopLoss: Math.abs(priceChange) > this.stopLossPct,
            marginCall: riskPercent > 80 // 80% of position value
        };
    }

    shouldExecuteStrategy(oracleData, marketData, positionSize, expectedProfit) {
        const sizeValidation = this.validatePositionSize(positionSize);
        const marketValidation = this.validateMarketConditions(oracleData, marketData);
        
        const riskReward = expectedProfit / (positionSize * this.stopLossPct);
        const minRiskReward = 3.0; // Minimum 3:1 risk/reward ratio
        
        const decision = {
            execute: false,
            reasons: [],
            riskReward: riskReward,
            confidence: 0
        };
        
        // Check all conditions
        if (!sizeValidation.valid) {
            decision.reasons.push('Position size validation failed');
        }
        
        if (!marketValidation.suitable) {
            decision.reasons.push('Market conditions unsuitable');
        }
        
        if (riskReward < minRiskReward) {
            decision.reasons.push(`Poor risk/reward ratio: ${riskReward.toFixed(1)} < ${minRiskReward}`);
        }
        
        // Calculate confidence score
        let confidence = 0;
        if (sizeValidation.valid) confidence += 30;
        if (marketValidation.suitable) confidence += 40;
        if (riskReward >= minRiskReward) confidence += 30;
        
        decision.confidence = confidence;
        decision.execute = decision.reasons.length === 0 && confidence >= 70;
        
        if (decision.execute) {
            console.log(`✅ Strategy approved - Confidence: ${confidence}%, R/R: ${riskReward.toFixed(1)}`);
        } else {
            console.log(`❌ Strategy rejected - Reasons: ${decision.reasons.join(', ')}`);
        }
        
        return decision;
    }

    recordTrade(entryPrice, exitPrice, positionSize, leverage, success) {
        const priceChange = (exitPrice - entryPrice) / entryPrice;
        const pnl = priceChange * positionSize * leverage;
        
        // Update daily metrics
        this.dailyPnL += pnl;
        this.dailyTradeCount++;
        
        if (success && pnl > 0) {
            this.consecutiveLosses = 0;
        } else if (!success || pnl < 0) {
            this.consecutiveLosses++;
        }
        
        // Record in history
        const trade = {
            timestamp: Date.now(),
            entryPrice,
            exitPrice,
            positionSize,
            leverage,
            pnl,
            success,
            priceChange: priceChange * 100
        };
        
        this.positionHistory.push(trade);
        
        // Keep only last 1000 trades
        if (this.positionHistory.length > 1000) {
            this.positionHistory.shift();
        }
        
        // Update risk metrics
        this.updateRiskMetrics();
        
        console.log(`📊 Trade recorded: ${success ? '✅' : '❌'} PnL: $${pnl.toFixed(2)} | Daily: $${this.dailyPnL.toFixed(2)}`);
        
        return {
            pnl,
            dailyPnL: this.dailyPnL,
            consecutiveLosses: this.consecutiveLosses,
            tradeCount: this.dailyTradeCount
        };
    }

    updateRiskMetrics() {
        if (this.positionHistory.length === 0) return;
        
        const recentTrades = this.positionHistory.slice(-100); // Last 100 trades
        const totalTrades = recentTrades.length;
        const winningTrades = recentTrades.filter(t => t.pnl > 0);
        const losingTrades = recentTrades.filter(t => t.pnl < 0);
        
        this.riskMetrics.totalTrades = totalTrades;
        this.riskMetrics.winRate = (winningTrades.length / totalTrades) * 100;
        
        const totalPnl = recentTrades.reduce((sum, t) => sum + t.pnl, 0);
        this.riskMetrics.avgProfit = totalPnl / totalTrades;
        
        // Calculate maximum drawdown
        let peak = 0;
        let maxDrawdown = 0;
        let runningPnl = 0;
        
        for (const trade of recentTrades) {
            runningPnl += trade.pnl;
            if (runningPnl > peak) {
                peak = runningPnl;
            }
            const drawdown = peak - runningPnl;
            if (drawdown > maxDrawdown) {
                maxDrawdown = drawdown;
            }
        }
        
        this.riskMetrics.maxDrawdown = maxDrawdown;
        
        // Simple Sharpe ratio approximation
        const avgReturn = this.riskMetrics.avgProfit;
        const returns = recentTrades.map(t => t.pnl);
        const stdDev = this.calculateStandardDeviation(returns);
        this.riskMetrics.sharpeRatio = stdDev > 0 ? avgReturn / stdDev : 0;
    }

    calculateStandardDeviation(values) {
        const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
        const squaredDiffs = values.map(val => Math.pow(val - mean, 2));
        const avgSquaredDiff = squaredDiffs.reduce((sum, val) => sum + val, 0) / values.length;
        return Math.sqrt(avgSquaredDiff);
    }

    getEmergencyStopConditions() {
        this.resetDailyMetrics();
        
        return {
            dailyLossExceeded: this.dailyPnL <= -this.maxDailyLoss,
            tooManyLosses: this.consecutiveLosses >= this.maxConsecutiveLosses,
            poorPerformance: this.riskMetrics.winRate < 30 && this.riskMetrics.totalTrades > 20,
            shouldStop: false
        };
    }

    generateRiskReport() {
        this.resetDailyMetrics();
        
        const emergencyStop = this.getEmergencyStopConditions();
        emergencyStop.shouldStop = emergencyStop.dailyLossExceeded || 
                                  emergencyStop.tooManyLosses || 
                                  emergencyStop.poorPerformance;
        
        return {
            daily: {
                pnl: this.dailyPnL,
                tradeCount: this.dailyTradeCount,
                consecutiveLosses: this.consecutiveLosses
            },
            metrics: this.riskMetrics,
            emergencyStop: emergencyStop,
            lastTrades: this.positionHistory.slice(-5),
            limits: {
                maxPositionSize: this.maxPositionSize,
                maxDailyLoss: this.maxDailyLoss,
                stopLossPct: this.stopLossPct * 100
            }
        };
    }
}

module.exports = RiskManager;