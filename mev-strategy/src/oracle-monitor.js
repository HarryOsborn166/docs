const { Connection, PublicKey } = require('@solana/web3.js');
const { PythHttpClient, getPythProgramKeyForCluster } = require('@pythnetwork/client');
require('dotenv').config();

class OracleMonitor {
    constructor() {
        this.connection = new Connection(process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com');
        this.pythConnection = new Connection(process.env.PYTH_RPC_URL || 'https://pythnet.rpcpool.com/');
        this.pythClient = new PythHttpClient(this.pythConnection, getPythProgramKeyForCluster('mainnet-beta'));
        
        // SOL/USD price feed
        this.solPriceFeed = new PublicKey(process.env.PYTH_SOL_PRICE_FEED || 'H6ARHf6YXhGYeQfUzQNGk6rDNnLBQKrenN712K4AQJEG');
        this.stalenessThreshold = parseInt(process.env.ORACLE_STALENESS_THRESHOLD) || 500; // ms
        
        this.lastPrice = null;
        this.lastUpdateTime = null;
        this.priceHistory = [];
    }

    async getCurrentPrice() {
        try {
            const priceData = await this.pythClient.getAssetPricesFromAccounts([this.solPriceFeed]);
            const solPrice = priceData[0];
            
            if (!solPrice) {
                throw new Error('Failed to fetch SOL price from Pyth');
            }

            const currentTime = Date.now();
            const priceValue = solPrice.price?.toNumber() || 0;
            const confidence = solPrice.confidence?.toNumber() || 0;
            const publishTime = solPrice.publishTime * 1000; // Convert to milliseconds

            const priceInfo = {
                price: priceValue,
                confidence: confidence,
                publishTime: publishTime,
                staleness: currentTime - publishTime,
                isStale: (currentTime - publishTime) > this.stalenessThreshold
            };

            // Update internal state
            this.lastPrice = priceValue;
            this.lastUpdateTime = currentTime;
            
            // Keep price history (last 100 updates)
            this.priceHistory.push({
                price: priceValue,
                timestamp: currentTime,
                publishTime: publishTime
            });
            
            if (this.priceHistory.length > 100) {
                this.priceHistory.shift();
            }

            return priceInfo;
        } catch (error) {
            console.error('Error fetching price from Pyth:', error);
            throw error;
        }
    }

    async waitForFreshOracle(maxWaitMs = 1000) {
        const startTime = Date.now();
        
        while (Date.now() - startTime < maxWaitMs) {
            const priceInfo = await this.getCurrentPrice();
            
            if (!priceInfo.isStale) {
                console.log(`✅ Fresh oracle data: $${priceInfo.price.toFixed(2)}, staleness: ${priceInfo.staleness}ms`);
                return priceInfo;
            }
            
            console.log(`⏳ Oracle stale (${priceInfo.staleness}ms), waiting...`);
            await this.sleep(50); // Check every 50ms
        }
        
        throw new Error(`Oracle remained stale for ${maxWaitMs}ms`);
    }

    calculatePriceImpact(oldPrice, newPrice) {
        if (!oldPrice || !newPrice) return 0;
        return ((newPrice - oldPrice) / oldPrice) * 100;
    }

    getPriceVolatility(windowMs = 5000) {
        const cutoffTime = Date.now() - windowMs;
        const recentPrices = this.priceHistory
            .filter(entry => entry.timestamp > cutoffTime)
            .map(entry => entry.price);
            
        if (recentPrices.length < 2) return 0;
        
        const mean = recentPrices.reduce((sum, price) => sum + price, 0) / recentPrices.length;
        const variance = recentPrices.reduce((sum, price) => sum + Math.pow(price - mean, 2), 0) / recentPrices.length;
        
        return Math.sqrt(variance) / mean * 100; // Return as percentage
    }

    async isMarketSuitable() {
        const priceInfo = await this.getCurrentPrice();
        const volatility = this.getPriceVolatility();
        
        const suitability = {
            oracleFresh: !priceInfo.isStale,
            lowVolatility: volatility < 2.0, // Less than 2% volatility in last 5 seconds
            priceConfidence: priceInfo.confidence < priceInfo.price * 0.001, // Confidence < 0.1% of price
            suitable: false
        };
        
        suitability.suitable = suitability.oracleFresh && suitability.lowVolatility && suitability.priceConfidence;
        
        return {
            ...suitability,
            currentPrice: priceInfo.price,
            staleness: priceInfo.staleness,
            volatility: volatility,
            confidence: priceInfo.confidence
        };
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    startMonitoring(intervalMs = 100) {
        console.log('🔍 Starting oracle monitoring...');
        
        setInterval(async () => {
            try {
                const priceInfo = await this.getCurrentPrice();
                console.log(`📊 SOL: $${priceInfo.price.toFixed(2)} | Staleness: ${priceInfo.staleness}ms | ${priceInfo.isStale ? '🔴 STALE' : '🟢 FRESH'}`);
            } catch (error) {
                console.error('❌ Oracle monitoring error:', error.message);
            }
        }, intervalMs);
    }
}

module.exports = OracleMonitor;