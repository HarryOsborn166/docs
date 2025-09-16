const { Connection, PublicKey, Keypair } = require('@solana/web3.js');
const { DriftClient, initialize, PositionDirection, OrderType, MarketType } = require('@drift-labs/sdk');
const BN = require('bn.js');
require('dotenv').config();

class DriftTrader {
    constructor(connection, wallet, isDevnet = false) {
        this.connection = connection;
        this.wallet = wallet;
        this.isDevnet = isDevnet;
        this.driftClient = null;
        this.initialized = false;
        
        // Market indices (these may change, check Drift docs)
        this.SOL_PERP_MARKET_INDEX = 0;
        this.USDC_SPOT_MARKET_INDEX = 0;
        
        this.maxLeverage = parseInt(process.env.MAX_LEVERAGE) || 10;
        this.slippageTolerance = parseFloat(process.env.SLIPPAGE_TOLERANCE) || 0.005;
    }

    async initialize() {
        try {
            console.log('🚀 Initializing Drift client...');
            
            // Initialize Drift client
            this.driftClient = new DriftClient({
                connection: this.connection,
                wallet: this.wallet,
                programID: this.isDevnet ? 
                    new PublicKey('dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH') : // Devnet
                    new PublicKey('dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH'), // Mainnet
                opts: {
                    commitment: 'confirmed',
                    preflightCommitment: 'confirmed',
                    skipPreflight: false
                }
            });

            await this.driftClient.subscribe();
            
            // Check if user account exists, create if not
            const userAccountExists = await this.driftClient.getUserAccountExists();
            
            if (!userAccountExists) {
                console.log('📝 Creating Drift user account...');
                await this.driftClient.initializeUser();
                await this.driftClient.subscribe();
            }

            this.initialized = true;
            console.log('✅ Drift client initialized successfully');
            
            return true;
            
        } catch (error) {
            console.error('❌ Error initializing Drift client:', error);
            throw error;
        }
    }

    async getAccountInfo() {
        if (!this.initialized) {
            await this.initialize();
        }

        try {
            const user = this.driftClient.getUser();
            const accountSummary = user.getAccountSummary();
            
            return {
                equity: accountSummary.totalCollateral.toNumber() / 1e6, // Convert to USDC
                freeCollateral: accountSummary.freeCollateral.toNumber() / 1e6,
                marginRatio: accountSummary.marginRatio.toNumber(),
                positions: user.getActivePerpPositions(),
                openOrders: user.getOpenOrders()
            };
            
        } catch (error) {
            console.error('Error getting account info:', error);
            throw error;
        }
    }

    async getMarketInfo(marketIndex = this.SOL_PERP_MARKET_INDEX) {
        try {
            const market = this.driftClient.getPerpMarketAccount(marketIndex);
            const oraclePrice = this.driftClient.getOracleDataForPerpMarket(marketIndex);
            
            return {
                marketIndex,
                symbol: 'SOL-PERP',
                oraclePrice: oraclePrice.price.toNumber() / 1e6,
                markPrice: market.amm.markPrice.toNumber() / 1e6,
                indexPrice: market.amm.historicalOracleData.lastOraclePrice.toNumber() / 1e6,
                funding: market.amm.lastFundingRate.toNumber() / 1e9,
                openInterest: market.amm.baseAssetAmountWithAmm.toNumber() / 1e9,
                liquidity: {
                    bidLiquidity: market.amm.bidBaseAssetReserve.toNumber() / 1e9,
                    askLiquidity: market.amm.askBaseAssetReserve.toNumber() / 1e9
                }
            };
            
        } catch (error) {
            console.error('Error getting market info:', error);
            throw error;
        }
    }

    async openPosition(size, direction, leverage = null) {
        if (!this.initialized) {
            await this.initialize();
        }

        try {
            console.log(`📈 Opening ${direction} position: $${size} with ${leverage || this.maxLeverage}x leverage`);
            
            const marketInfo = await this.getMarketInfo();
            const baseAmount = Math.abs(size) / marketInfo.markPrice;
            
            // Calculate order size in base asset terms
            const orderSize = new BN(baseAmount * 1e9); // Drift uses 9 decimals for base amounts
            
            const orderParams = {
                orderType: OrderType.MARKET,
                marketType: MarketType.PERP,
                direction: direction === 'long' ? PositionDirection.LONG : PositionDirection.SHORT,
                userOrderId: Math.floor(Math.random() * 1000),
                baseAssetAmount: orderSize,
                marketIndex: this.SOL_PERP_MARKET_INDEX,
                reduceOnly: false
            };

            // Add price protection for market orders
            if (direction === 'long') {
                orderParams.price = new BN(marketInfo.markPrice * (1 + this.slippageTolerance) * 1e6);
            } else {
                orderParams.price = new BN(marketInfo.markPrice * (1 - this.slippageTolerance) * 1e6);
            }

            const tx = await this.driftClient.placeOrder(orderParams);
            
            console.log(`✅ Position opened successfully. TX: ${tx}`);
            
            // Wait for position to be reflected
            await this.sleep(1000);
            
            const position = await this.getCurrentPosition();
            return {
                success: true,
                transaction: tx,
                position: position,
                marketPrice: marketInfo.markPrice
            };
            
        } catch (error) {
            console.error('❌ Error opening position:', error);
            throw error;
        }
    }

    async closePosition(marketIndex = this.SOL_PERP_MARKET_INDEX) {
        if (!this.initialized) {
            await this.initialize();
        }

        try {
            console.log('📉 Closing position...');
            
            const user = this.driftClient.getUser();
            const position = user.getPerpPosition(marketIndex);
            
            if (!position || position.baseAssetAmount.eq(new BN(0))) {
                console.log('⚠️ No position to close');
                return { success: true, message: 'No position to close' };
            }

            const isLong = position.baseAssetAmount.gt(new BN(0));
            const positionSize = position.baseAssetAmount.abs();
            
            const orderParams = {
                orderType: OrderType.MARKET,
                marketType: MarketType.PERP,
                direction: isLong ? PositionDirection.SHORT : PositionDirection.LONG,
                userOrderId: Math.floor(Math.random() * 1000),
                baseAssetAmount: positionSize,
                marketIndex: marketIndex,
                reduceOnly: true
            };

            const tx = await this.driftClient.placeOrder(orderParams);
            
            console.log(`✅ Position closed successfully. TX: ${tx}`);
            
            return {
                success: true,
                transaction: tx,
                closedSize: positionSize.toNumber() / 1e9
            };
            
        } catch (error) {
            console.error('❌ Error closing position:', error);
            throw error;
        }
    }

    async getCurrentPosition(marketIndex = this.SOL_PERP_MARKET_INDEX) {
        try {
            const user = this.driftClient.getUser();
            const position = user.getPerpPosition(marketIndex);
            const marketInfo = await this.getMarketInfo(marketIndex);
            
            if (!position || position.baseAssetAmount.eq(new BN(0))) {
                return null;
            }

            const baseAmount = position.baseAssetAmount.toNumber() / 1e9;
            const notionalValue = Math.abs(baseAmount) * marketInfo.markPrice;
            const pnl = position.getUnrealizedPnl(new BN(marketInfo.markPrice * 1e6)).toNumber() / 1e6;
            
            return {
                marketIndex,
                side: baseAmount > 0 ? 'long' : 'short',
                size: Math.abs(baseAmount),
                notionalValue: notionalValue,
                entryPrice: position.quoteAssetAmount.abs().toNumber() / position.baseAssetAmount.abs().toNumber() / 1e-3,
                markPrice: marketInfo.markPrice,
                unrealizedPnl: pnl,
                pnlPercent: (pnl / notionalValue) * 100
            };
            
        } catch (error) {
            console.error('Error getting current position:', error);
            return null;
        }
    }

    async estimatePriceImpact(size, direction) {
        try {
            const marketInfo = await this.getMarketInfo();
            const baseAmount = Math.abs(size) / marketInfo.markPrice;
            
            // Simplified price impact calculation
            // In reality, you'd need to analyze the AMM curve
            const liquidityReserve = direction === 'long' ? 
                marketInfo.liquidity.askLiquidity : 
                marketInfo.liquidity.bidLiquidity;
                
            const impactRatio = baseAmount / liquidityReserve;
            const estimatedImpact = Math.min(impactRatio * 100, 10); // Cap at 10%
            
            return {
                estimatedImpact: estimatedImpact,
                liquidityReserve: liquidityReserve,
                tradeSize: baseAmount,
                currentPrice: marketInfo.markPrice,
                estimatedPrice: marketInfo.markPrice * (1 + (direction === 'long' ? impactRatio : -impactRatio))
            };
            
        } catch (error) {
            console.error('Error estimating price impact:', error);
            throw error;
        }
    }

    async waitForPriceChange(targetChange, maxWaitMs = 5000) {
        const startTime = Date.now();
        const initialInfo = await this.getMarketInfo();
        const initialPrice = initialInfo.markPrice;
        
        while (Date.now() - startTime < maxWaitMs) {
            const currentInfo = await this.getMarketInfo();
            const currentPrice = currentInfo.markPrice;
            const priceChange = ((currentPrice - initialPrice) / initialPrice) * 100;
            
            if (Math.abs(priceChange) >= Math.abs(targetChange)) {
                console.log(`✅ Price moved ${priceChange.toFixed(2)}% (target: ${targetChange}%)`);
                return {
                    achieved: true,
                    actualChange: priceChange,
                    currentPrice: currentPrice,
                    initialPrice: initialPrice
                };
            }
            
            await this.sleep(100);
        }
        
        const finalInfo = await this.getMarketInfo();
        const finalChange = ((finalInfo.markPrice - initialPrice) / initialPrice) * 100;
        
        return {
            achieved: false,
            actualChange: finalChange,
            currentPrice: finalInfo.markPrice,
            initialPrice: initialPrice
        };
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async disconnect() {
        if (this.driftClient) {
            await this.driftClient.unsubscribe();
        }
    }
}

module.exports = DriftTrader;