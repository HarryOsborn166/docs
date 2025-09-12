# Looping Strategies для максимизации APY 🔄

## Что такое Looping?

Looping - это стратегия многократного использования одних и тех же средств через циклы "депозит → займ → депозит", увеличивая exposure и APY.

## Стратегия 1: SOL Staking Loop

```typescript
async function solStakingLoop() {
    // Максимизируем staking rewards через leverage
    
    const initial = {
        amount: "100 SOL",
        value: 10_000, // @ $100
    };
    
    // Loop 1
    const loop1 = {
        deposit: "100 mSOL в MarginFi",
        borrow: "75 SOL (75% LTV)",
        stake: "75 SOL → 75 mSOL",
        
        total_mSOL: 175
    };
    
    // Loop 2
    const loop2 = {
        deposit: "75 mSOL",
        borrow: "56.25 SOL",
        stake: "56.25 SOL → 56.25 mSOL",
        
        total_mSOL: 231.25
    };
    
    // После 5 loops
    const finalState = {
        total_mSOL_deposited: 400,
        total_SOL_borrowed: 300,
        effective_leverage: 4,
        
        returns: {
            staking_rewards: "7% на 400 SOL = 28 SOL/год",
            borrow_cost: "-9% на 300 SOL = -27 SOL/год",
            
            // С incentives
            deposit_incentives: "2% MNGO на 400 SOL = 8 SOL/год",
            borrow_incentives: "4% MNGO на 300 SOL = 12 SOL/год",
            
            net_return: "21 SOL/год (21% на 100 SOL)"
        }
    };
}
```

## Стратегия 2: Stable-Stable Mega Loop

```typescript
async function stableStableMegaLoop() {
    // Используем стейблкоины для безопасного high leverage
    
    const config = {
        initial: 10_000, // USDC
        target_leverage: 10, // 10x!
        protocol: "Solend",
        
        ltv_limits: {
            USDC: 0.95, // 95% LTV
            USDT: 0.95,
            USDY: 0.90  // RWA stable
        }
    };
    
    // Execution
    const loops = [];
    let current_deposit = config.initial;
    let total_borrowed = 0;
    
    for (let i = 0; i < 20; i++) {
        const borrow_amount = current_deposit * 0.95;
        
        loops.push({
            loop: i + 1,
            deposit: current_deposit,
            borrow: borrow_amount,
            cumulative_deposit: loops.reduce((a, l) => a + l.deposit, 0) + current_deposit,
            cumulative_borrow: total_borrowed + borrow_amount
        });
        
        total_borrowed += borrow_amount;
        current_deposit = borrow_amount;
        
        // Stop when borrow < $100
        if (borrow_amount < 100) break;
    }
    
    return {
        loops_count: loops.length,
        total_deposited: 200_000, // 20x!
        total_borrowed: 190_000,
        
        apy_calculation: {
            deposit_rate: "12%",
            borrow_rate: "-10%",
            deposit_earnings: 24_000,
            borrow_cost: -19_000,
            
            // Incentives make it profitable
            deposit_rewards: "3% = $6,000",
            borrow_rewards: "5% = $9,500",
            
            net_profit: 20_500, // 205% на $10k!
        },
        
        risks: "Depeg risk, smart contract risk"
    };
}
```

## Стратегия 3: Cross-Protocol Loop

```typescript
async function crossProtocolLoop() {
    // Используем разные протоколы для лучших rates
    
    const strategy = {
        // Step 1: Best deposit rate
        deposit_protocol: {
            name: "Kamino",
            asset: "USDC",
            amount: 10_000,
            apy: "15%",
            receipt: "10,000 kUSDC"
        },
        
        // Step 2: Best borrow rate  
        borrow_protocol: {
            name: "MarginFi",
            collateral: "kUSDC",
            ltv: 0.85,
            borrow_amount: 8_500,
            borrow_asset: "USDT",
            rate: "-8%"
        },
        
        // Step 3: Arbitrage stablecoin rates
        reinvest: {
            protocol: "Solend",
            asset: "USDT",
            apy: "18%",
            amount: 8_500
        },
        
        // Step 4: Continue loop
        next_borrow: {
            protocol: "Solend",
            collateral: "USDT",
            borrow: "USDC",
            amount: 7_225,
            
            // Back to Kamino...
        },
        
        optimization: "Always chase best rates across protocols"
    };
}
```

## Стратегия 4: JLP Loop Strategy

```typescript
async function jlpLoopStrategy() {
    // Jupiter LP token - святой грааль looping
    
    const jlp_stats = {
        composition: "SOL, ETH, BTC, USDC, USDT",
        base_apy: "25-40%",
        
        accepted_as_collateral: {
            MarginFi: "80% LTV",
            Kamino: "75% LTV",
            Drift: "70% LTV"
        }
    };
    
    // Mega loop setup
    const loop_execution = {
        initial: 10_000,
        
        loop1: {
            buy_jlp: 10_000,
            deposit_marginfi: "10,000 JLP",
            borrow_usdc: 8_000,
            
            buy_more_jlp: 8_000
        },
        
        loop2: {
            deposit_kamino: "8,000 JLP", 
            borrow_usdc: 6_000,
            buy_jlp: 6_000
        },
        
        // После 5 loops
        final_position: {
            total_jlp: 35_000,
            total_debt: 25_000,
            leverage: 3.5,
            
            returns: {
                jlp_yield: "35% на $35k = $12,250/год",
                borrow_cost: "-10% на $25k = -$2,500/год",
                
                net: "$9,750/год (97.5% на $10k)"
            }
        }
    };
}
```

## Стратегия 5: Auto-Compound Loop Bot

```typescript
class AutoCompoundLooper {
    constructor() {
        this.positions = [];
        this.target_leverage = 5;
        this.safety_threshold = 0.85; // Health factor
    }
    
    async runStrategy() {
        // Автоматизированный looping с реинвестом
        
        while (true) {
            // 1. Check all positions
            for (const position of this.positions) {
                const health = await this.checkHealth(position);
                
                if (health < this.safety_threshold) {
                    await this.deleverage(position);
                }
                
                // 2. Claim rewards
                const rewards = await this.claimRewards(position);
                
                // 3. Compound rewards
                if (rewards > 50) { // Minimum $50
                    await this.compound(position, rewards);
                }
            }
            
            // 4. Check for new opportunities
            const opportunities = await this.scanOpportunities();
            
            for (const opp of opportunities) {
                if (opp.expected_apy > 50) {
                    await this.openNewLoop(opp);
                }
            }
            
            // Sleep 1 hour
            await sleep(3600000);
        }
    }
    
    async compound(position, rewards) {
        // Reinvest rewards для увеличения позиции
        const tx = new Transaction();
        
        // Convert rewards to position asset
        tx.add(SwapInstruction({
            from: rewards.token,
            to: position.asset,
            amount: rewards.amount
        }));
        
        // Deposit to increase collateral
        tx.add(DepositInstruction({
            protocol: position.protocol,
            amount: rewards.amount
        }));
        
        // Borrow more to maintain leverage
        const newBorrowAmount = rewards.amount * position.leverage * 0.8;
        tx.add(BorrowInstruction({
            protocol: position.protocol,
            amount: newBorrowAmount
        }));
        
        // Loop the borrowed amount
        await this.executeLoop(newBorrowAmount);
    }
}
```

## Оптимизация и советы

### 1. Выбор активов для looping
```javascript
const best_assets_for_looping = {
    stables: {
        pros: "Нет ликвидации от волатильности",
        cons: "Меньше APY",
        best_for: "Начинающих, консервативных"
    },
    
    lst_tokens: {
        pros: "Staking rewards + lending yield",
        cons: "Может быть depeg",
        best_for: "Средний риск/доход"
    },
    
    lp_tokens: {
        pros: "Высокий base APY",
        cons: "IL risk, сложность",
        best_for: "Опытных"
    },
    
    jlp: {
        pros: "Диверсификация, высокий APY",
        cons: "Сложный состав",
        best_for: "Максимизация дохода"
    }
};
```

### 2. Автоматизация через бота
```typescript
const automation_tips = {
    monitoring: {
        health_factor: "Проверять каждые 5 минут",
        apy_changes: "Сканировать каждый час",
        new_opportunities: "Раз в день"
    },
    
    execution: {
        gas_optimization: "Batch transactions",
        timing: "Low activity hours",
        slippage: "Dynamic based on size"
    },
    
    safety: {
        max_leverage: "Не больше 10x даже на стейблах",
        emergency_delever: "Автоматически при HF < 1.2",
        position_limits: "Не больше 20% в одном протоколе"
    }
};
```

### 3. Расчет оптимального leverage
```javascript
function calculateOptimalLeverage(asset, protocol) {
    const factors = {
        volatility: getAssetVolatility(asset),
        ltv: getProtocolLTV(protocol, asset),
        apy_spread: getDepositAPY() - getBorrowAPY(),
        incentives: getIncentiveAPY()
    };
    
    // Формула оптимального leverage
    const optimal = Math.min(
        1 / (1 - factors.ltv * 0.9), // Safety margin
        factors.apy_spread > 0 ? 10 : 5, // Positive carry
        20 - factors.volatility * 100 // Volatility adjustment
    );
    
    return {
        recommended: Math.floor(optimal),
        max_safe: Math.floor(optimal * 1.2),
        details: factors
    };
}
```