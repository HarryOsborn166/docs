/**
 * Калькулятор воздействия на цену для манипулятивных стратегий
 * Рассчитывает ожидаемое движение цены от крупных сделок
 */

import BN from 'bn.js';

export interface MarketData {
  currentPrice: number;
  liquidityDepth: number;  // Общая ликвидность в USD
  volatility: number;      // Часовая волатильность
  fundingRate: number;     // Текущая ставка финансирования
  openInterest: number;    // Открытый интерес
  averageTradeSize: number; // Средний размер сделки
}

export interface TradeImpact {
  priceMovementBps: number;    // Движение цены в базисных пунктах
  priceMovementPercent: number; // Движение цены в процентах
  newPrice: number;            // Новая цена после сделки
  slippageBps: number;         // Проскальзывание в базисных пунктах
  estimatedProfit: number;     // Ожидаемая прибыль в USD
  riskScore: number;           // Оценка риска от 0 до 100
}

export interface ManipulationStrategy {
  mainPositionSize: number;    // Размер основной позиции в USD
  mainLeverage: number;        // Плечо основной позиции
  pumpPositionSize: number;    // Размер манипулятивной позиции в USD
  pumpLeverage: number;        // Плечо манипулятивной позиции
  targetPriceMoveBps: number;  // Целевое движение цены в бп
}

export class PriceImpactCalculator {
  
  /**
   * Рассчитывает воздействие сделки на цену
   */
  static calculateTradeImpact(
    tradeSize: number,
    marketData: MarketData,
    direction: 'long' | 'short' = 'long'
  ): TradeImpact {
    
    // 1. Базовое воздействие на основе размера относительно ликвидности
    const liquidityRatio = tradeSize / marketData.liquidityDepth;
    let basePriceImpact = this.calculateBasePriceImpact(liquidityRatio);
    
    // 2. Корректировка на волатильность
    const volatilityMultiplier = 1 + (marketData.volatility * 2);
    basePriceImpact *= volatilityMultiplier;
    
    // 3. Корректировка на размер относительно среднего
    const sizeMultiplier = Math.sqrt(tradeSize / marketData.averageTradeSize);
    basePriceImpact *= sizeMultiplier;
    
    // 4. Корректировка на открытый интерес
    const oiRatio = tradeSize / marketData.openInterest;
    if (oiRatio > 0.01) { // Если сделка больше 1% от OI
      basePriceImpact *= (1 + oiRatio * 10);
    }
    
    // 5. Направление воздействия
    const priceMovementBps = direction === 'long' ? basePriceImpact : -basePriceImpact;
    const priceMovementPercent = priceMovementBps / 10000;
    const newPrice = marketData.currentPrice * (1 + priceMovementPercent);
    
    // 6. Расчет проскальзывания
    const slippageBps = Math.abs(priceMovementBps) * 0.3; // 30% от движения цены
    
    // 7. Оценка риска
    const riskScore = this.calculateRiskScore(liquidityRatio, marketData.volatility, oiRatio);
    
    return {
      priceMovementBps,
      priceMovementPercent,
      newPrice,
      slippageBps,
      estimatedProfit: 0, // Будет рассчитано отдельно
      riskScore
    };
  }
  
  /**
   * Рассчитывает базовое воздействие на цену
   */
  private static calculateBasePriceImpact(liquidityRatio: number): number {
    // Нелинейная функция воздействия - чем больше сделка, тем больше воздействие
    if (liquidityRatio <= 0.001) {
      return liquidityRatio * 10000; // 1bp за 0.01% ликвидности
    } else if (liquidityRatio <= 0.01) {
      return 10 + (liquidityRatio - 0.001) * 15000; // Ускоренный рост
    } else if (liquidityRatio <= 0.05) {
      return 145 + (liquidityRatio - 0.01) * 25000; // Еще более быстрый рост
    } else {
      return 1145 + (liquidityRatio - 0.05) * 50000; // Экстремальное воздействие
    }
  }
  
  /**
   * Оценивает риск манипуляции
   */
  private static calculateRiskScore(
    liquidityRatio: number, 
    volatility: number, 
    oiRatio: number
  ): number {
    let risk = 0;
    
    // Риск от размера относительно ликвидности
    if (liquidityRatio > 0.1) risk += 40;
    else if (liquidityRatio > 0.05) risk += 25;
    else if (liquidityRatio > 0.02) risk += 15;
    else if (liquidityRatio > 0.01) risk += 8;
    
    // Риск от волатильности
    if (volatility > 0.1) risk += 30;
    else if (volatility > 0.05) risk += 20;
    else if (volatility > 0.02) risk += 10;
    
    // Риск от размера относительно OI
    if (oiRatio > 0.05) risk += 30;
    else if (oiRatio > 0.02) risk += 15;
    else if (oiRatio > 0.01) risk += 8;
    
    return Math.min(risk, 100);
  }
  
  /**
   * Оптимизирует стратегию манипуляции
   */
  static optimizeManipulationStrategy(
    availableCapital: number,
    marketData: MarketData,
    targetProfitPercent: number = 0.05 // 5% целевая прибыль
  ): ManipulationStrategy {
    
    console.log('🔧 Оптимизация стратегии манипуляции...');
    console.log(`💰 Доступный капитал: $${availableCapital.toLocaleString()}`);
    console.log(`🎯 Целевая прибыль: ${(targetProfitPercent * 100).toFixed(1)}%`);
    
    let bestStrategy: ManipulationStrategy | null = null;
    let bestExpectedProfit = 0;
    
    // Перебираем различные комбинации
    for (let mainRatio = 0.7; mainRatio <= 0.9; mainRatio += 0.05) {
      for (let mainLeverage = 5; mainLeverage <= 15; mainLeverage += 2) {
        for (let pumpLeverage = 10; pumpLeverage <= 25; pumpLeverage += 5) {
          
          const mainPositionSize = availableCapital * mainRatio;
          const pumpPositionSize = availableCapital * (1 - mainRatio);
          
          // Рассчитываем воздействие pump позиции
          const pumpTradeSize = pumpPositionSize * pumpLeverage;
          const pumpImpact = this.calculateTradeImpact(pumpTradeSize, marketData, 'long');
          
          // Рассчитываем прибыль основной позиции
          const mainTradeSize = mainPositionSize * mainLeverage;
          const expectedProfit = mainTradeSize * (pumpImpact.priceMovementPercent);
          
          // Проверяем риски
          if (pumpImpact.riskScore > 70) continue; // Слишком рискованно
          if (pumpImpact.priceMovementBps < 50) continue; // Слишком малое движение
          
          // Проверяем прибыльность
          const profitPercent = expectedProfit / availableCapital;
          if (profitPercent >= targetProfitPercent && expectedProfit > bestExpectedProfit) {
            bestExpectedProfit = expectedProfit;
            bestStrategy = {
              mainPositionSize,
              mainLeverage,
              pumpPositionSize,
              pumpLeverage,
              targetPriceMoveBps: pumpImpact.priceMovementBps
            };
          }
        }
      }
    }
    
    if (!bestStrategy) {
      console.log('⚠️  Не удалось найти оптимальную стратегию с заданными параметрами');
      // Возвращаем консервативную стратегию
      bestStrategy = {
        mainPositionSize: availableCapital * 0.8,
        mainLeverage: 10,
        pumpPositionSize: availableCapital * 0.2,
        pumpLeverage: 15,
        targetPriceMoveBps: 100 // 1% движение
      };
    }
    
    console.log('✅ Оптимальная стратегия найдена:');
    console.log(`   📈 Основная позиция: $${bestStrategy.mainPositionSize.toLocaleString()} (${bestStrategy.mainLeverage}x)`);
    console.log(`   🚀 Pump позиция: $${bestStrategy.pumpPositionSize.toLocaleString()} (${bestStrategy.pumpLeverage}x)`);
    console.log(`   🎯 Целевое движение: ${bestStrategy.targetPriceMoveBps} bps`);
    console.log(`   💰 Ожидаемая прибыль: $${bestExpectedProfit.toLocaleString()}`);
    
    return bestStrategy;
  }
  
  /**
   * Рассчитывает оптимальное время для выполнения манипуляции
   */
  static calculateOptimalTiming(marketData: MarketData): {
    score: number;
    reasons: string[];
    recommendation: 'execute' | 'wait' | 'abort';
  } {
    let score = 50; // Базовый счет
    const reasons: string[] = [];
    
    // Анализ ликвидности
    if (marketData.liquidityDepth < 10_000_000) {
      score += 20;
      reasons.push('Низкая ликвидность благоприятна для манипуляций');
    } else if (marketData.liquidityDepth > 100_000_000) {
      score -= 15;
      reasons.push('Высокая ликвидность затруднит манипуляцию');
    }
    
    // Анализ волатильности
    if (marketData.volatility > 0.08) {
      score -= 20;
      reasons.push('Слишком высокая волатильность увеличивает риски');
    } else if (marketData.volatility < 0.02) {
      score += 15;
      reasons.push('Низкая волатильность благоприятна');
    }
    
    // Анализ funding rate
    if (Math.abs(marketData.fundingRate) > 0.01) {
      score -= 10;
      reasons.push('Экстремальная ставка финансирования может противодействовать');
    }
    
    // Анализ открытого интереса
    if (marketData.openInterest < 50_000_000) {
      score += 10;
      reasons.push('Низкий открытый интерес облегчает манипуляцию');
    }
    
    // Определяем рекомендацию
    let recommendation: 'execute' | 'wait' | 'abort';
    if (score >= 70) {
      recommendation = 'execute';
      reasons.push('🟢 Условия оптимальны для выполнения');
    } else if (score >= 40) {
      recommendation = 'wait';
      reasons.push('🟡 Условия приемлемы, но можно подождать лучших');
    } else {
      recommendation = 'abort';
      reasons.push('🔴 Условия неблагоприятны, рекомендуется отложить');
    }
    
    return { score, reasons, recommendation };
  }
  
  /**
   * Симулирует выполнение манипулятивной стратегии
   */
  static simulateManipulation(
    strategy: ManipulationStrategy,
    marketData: MarketData
  ): {
    success: boolean;
    finalProfit: number;
    priceMovement: number;
    risks: string[];
  } {
    console.log('\n🎮 Симуляция манипулятивной стратегии...');
    
    const risks: string[] = [];
    
    // 1. Симулируем воздействие pump позиции
    const pumpTradeSize = strategy.pumpPositionSize * strategy.pumpLeverage;
    const pumpImpact = this.calculateTradeImpact(pumpTradeSize, marketData, 'long');
    
    console.log(`🚀 Pump позиция: $${pumpTradeSize.toLocaleString()}`);
    console.log(`📊 Движение цены: ${pumpImpact.priceMovementBps} bps`);
    
    // 2. Проверяем риски
    if (pumpImpact.riskScore > 80) {
      risks.push('Критически высокий риск ликвидации');
    }
    
    if (pumpImpact.slippageBps > 200) {
      risks.push('Высокое проскальзывание может снизить прибыль');
    }
    
    // 3. Рассчитываем прибыль основной позиции
    const mainTradeSize = strategy.mainPositionSize * strategy.mainLeverage;
    const finalProfit = mainTradeSize * pumpImpact.priceMovementPercent;
    
    // 4. Учитываем комиссии
    const totalFees = (pumpTradeSize + mainTradeSize) * 0.001; // 0.1% комиссии
    const netProfit = finalProfit - totalFees;
    
    console.log(`💰 Валовая прибыль: $${finalProfit.toLocaleString()}`);
    console.log(`💸 Комиссии: $${totalFees.toLocaleString()}`);
    console.log(`📈 Чистая прибыль: $${netProfit.toLocaleString()}`);
    
    const success = netProfit > 0 && pumpImpact.priceMovementBps >= strategy.targetPriceMoveBps;
    
    return {
      success,
      finalProfit: netProfit,
      priceMovement: pumpImpact.priceMovementBps,
      risks
    };
  }
}