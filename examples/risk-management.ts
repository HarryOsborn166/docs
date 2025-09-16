/**
 * Пример продвинутого управления рисками в арбитражной торговле
 * Демонстрирует различные механизмы защиты от убытков
 */

import { ArbitrageBot } from '../app/index';
import * as dotenv from 'dotenv';

dotenv.config();

class RiskManagedArbitrageBot extends ArbitrageBot {
  private dailyPnL: number = 0;
  private maxDrawdown: number = 0;
  private tradeCount: number = 0;
  private startTime: number = Date.now();
  
  /**
   * Продвинутая проверка возможности с учетом рисков
   */
  async evaluateRiskAdjustedOpportunity(opportunity: any): Promise<boolean> {
    console.log(`🔍 Анализ рисков для возможности:`);
    console.log(`   📊 Спред: ${(opportunity.priceSpread * 100).toFixed(3)}%`);
    
    // 1. Проверка минимального спреда с учетом комиссий
    const totalFees = 0.002; // 0.2% общие комиссии (флэш-займ + торговля + газ)
    const netSpread = opportunity.priceSpread - totalFees;
    
    if (netSpread <= 0) {
      console.log(`   ❌ Спред не покрывает комиссии (${(totalFees * 100).toFixed(1)}%)`);
      return false;
    }
    
    // 2. Проверка ликвидности рынков
    const liquidityScore = await this.checkMarketLiquidity(
      opportunity.marketIndexLong, 
      opportunity.marketIndexShort
    );
    
    if (liquidityScore < 0.7) {
      console.log(`   ❌ Недостаточная ликвидность (${(liquidityScore * 100).toFixed(0)}%)`);
      return false;
    }
    
    // 3. Проверка волатильности
    const volatility = await this.calculateMarketVolatility(opportunity.marketIndexLong);
    const maxVolatility = 0.05; // 5% максимальная часовая волатильность
    
    if (volatility > maxVolatility) {
      console.log(`   ⚠️  Высокая волатильность: ${(volatility * 100).toFixed(1)}% (макс ${(maxVolatility * 100)}%)`);
      return false;
    }
    
    // 4. Проверка корреляции активов
    const correlation = await this.calculateAssetCorrelation(
      opportunity.marketIndexLong,
      opportunity.marketIndexShort
    );
    
    if (Math.abs(correlation) < 0.8) {
      console.log(`   ❌ Низкая корреляция активов: ${correlation.toFixed(2)} (мин 0.8)`);
      return false;
    }
    
    console.log(`   ✅ Все проверки рисков пройдены:`);
    console.log(`      💰 Чистый спред: ${(netSpread * 100).toFixed(3)}%`);
    console.log(`      💧 Ликвидность: ${(liquidityScore * 100).toFixed(0)}%`);
    console.log(`      📈 Волатильность: ${(volatility * 100).toFixed(1)}%`);
    console.log(`      🔗 Корреляция: ${correlation.toFixed(2)}`);
    
    return true;
  }
  
  /**
   * Динамический расчет размера позиции на основе рисков
   */
  calculatePositionSize(opportunity: any, baseAmount: number): number {
    // Модель Келли для оптимального размера позиции
    const winProbability = this.estimateWinProbability(opportunity);
    const avgWin = opportunity.expectedProfit;
    const avgLoss = 0.02; // Средний убыток 2%
    
    // Формула Келли: f = (bp - q) / b
    // где b = отношение выигрыша к проигрышу, p = вероятность выигрыша, q = вероятность проигрыша
    const b = avgWin / avgLoss;
    const kellyFraction = (b * winProbability - (1 - winProbability)) / b;
    
    // Ограничиваем размер позиции для безопасности
    const maxKelly = 0.25; // Максимум 25% от капитала по Келли
    const safeKellyFraction = Math.min(Math.max(kellyFraction, 0), maxKelly);
    
    const positionSize = baseAmount * safeKellyFraction;
    
    console.log(`   📊 Расчет размера позиции:`);
    console.log(`      🎯 Вероятность успеха: ${(winProbability * 100).toFixed(1)}%`);
    console.log(`      📈 Келли фракция: ${(kellyFraction * 100).toFixed(1)}%`);
    console.log(`      🛡️  Безопасная фракция: ${(safeKellyFraction * 100).toFixed(1)}%`);
    console.log(`      💰 Размер позиции: $${positionSize.toFixed(2)}`);
    
    return positionSize;
  }
  
  /**
   * Мониторинг позиций с продвинутым риск-менеджментом
   */
  async advancedPositionMonitoring(): Promise<void> {
    try {
      const user = this['user']; // Доступ к приватному свойству
      if (!user) return;

      const positions = user.getPerpPositions();
      const activePositions = positions.filter(pos => pos.baseAssetAmount.toNumber() !== 0);

      if (activePositions.length === 0) {
        console.log('📊 Активных позиций нет');
        return;
      }

      console.log(`\n🔍 Продвинутый мониторинг ${activePositions.length} позиций:`);
      
      let totalPnl = 0;
      let totalExposure = 0;
      
      for (const position of activePositions) {
        const driftClient = this['driftClient'];
        const oracle = driftClient.getOracleDataForPerpMarket(position.marketIndex);
        const pnl = oracle ? position.getUnrealizedPnl(oracle).toNumber() / 10**6 : 0;
        const exposure = Math.abs(position.baseAssetAmount.toNumber()) / 10**9;
        
        totalPnl += pnl;
        totalExposure += exposure;
        
        // Проверка индивидуальных стоп-лоссов
        const positionLoss = pnl < 0 ? Math.abs(pnl) : 0;
        const stopLossThreshold = exposure * 0.05; // 5% от размера позиции
        
        if (positionLoss > stopLossThreshold) {
          console.log(`   🚨 СТОП-ЛОСС для позиции ${position.marketIndex}:`);
          console.log(`      💸 Убыток: $${positionLoss.toFixed(2)} (лимит: $${stopLossThreshold.toFixed(2)})`);
          
          // Экстренное закрытие позиции
          await this.emergencyClose(position.marketIndex, position.marketIndex);
        }
        
        // Проверка времени удержания позиции
        const maxHoldTime = 300; // 5 минут максимум
        const positionAge = Date.now() - this.startTime;
        
        if (positionAge > maxHoldTime * 1000) {
          console.log(`   ⏰ ТАЙМ-АУТ для позиции ${position.marketIndex}:`);
          console.log(`      🕐 Время удержания: ${Math.round(positionAge / 1000)}с (лимит: ${maxHoldTime}с)`);
          
          await this.emergencyClose(position.marketIndex, position.marketIndex);
        }
      }
      
      // Общий риск-контроль
      this.dailyPnL += totalPnl;
      this.maxDrawdown = Math.min(this.maxDrawdown, this.dailyPnL);
      
      console.log(`\n📈 Общая статистика:`);
      console.log(`   💰 Текущий PnL: $${totalPnl.toFixed(2)}`);
      console.log(`   📊 Дневной PnL: $${this.dailyPnL.toFixed(2)}`);
      console.log(`   📉 Максимальная просадка: $${Math.abs(this.maxDrawdown).toFixed(2)}`);
      console.log(`   🎯 Общая экспозиция: $${totalExposure.toFixed(2)}`);
      console.log(`   🔢 Количество сделок: ${this.tradeCount}`);
      
      // Проверка дневных лимитов
      const maxDailyLoss = parseFloat(process.env.MAX_DAILY_LOSS || "100");
      if (Math.abs(this.dailyPnL) > maxDailyLoss) {
        console.log(`\n🛑 ПРЕВЫШЕН ДНЕВНОЙ ЛИМИТ УБЫТКОВ!`);
        console.log(`   💸 Текущий убыток: $${Math.abs(this.dailyPnL).toFixed(2)}`);
        console.log(`   🚫 Лимит: $${maxDailyLoss}`);
        console.log(`   🔒 Прекращение торговли на сегодня`);
        
        // Закрываем все позиции
        for (const position of activePositions) {
          await this.emergencyClose(position.marketIndex, position.marketIndex);
        }
        
        process.exit(0);
      }
      
    } catch (error) {
      console.error('❌ Ошибка продвинутого мониторинга:', error);
    }
  }
  
  // Вспомогательные методы для расчета рисков
  private async checkMarketLiquidity(marketIndex1: number, marketIndex2: number): Promise<number> {
    // Мок расчета ликвидности (в реальности анализировал бы order book)
    return 0.85; // 85% ликвидности
  }
  
  private async calculateMarketVolatility(marketIndex: number): Promise<number> {
    // Мок расчета волатильности (в реальности анализировал бы исторические данные)
    return 0.025; // 2.5% часовая волатильность
  }
  
  private async calculateAssetCorrelation(marketIndex1: number, marketIndex2: number): Promise<number> {
    // Мок расчета корреляции (в реальности анализировал бы ценовые данные)
    return 0.92; // 92% корреляция
  }
  
  private estimateWinProbability(opportunity: any): number {
    // Базовая вероятность на основе размера спреда
    const baseProb = 0.6;
    const spreadBonus = Math.min(opportunity.priceSpread * 10, 0.3); // До 30% бонуса за большой спред
    return Math.min(baseProb + spreadBonus, 0.9); // Максимум 90%
  }
}

async function riskManagementExample() {
  console.log('🛡️  Пример продвинутого управления рисками');
  console.log('============================================\n');

  try {
    const bot = new RiskManagedArbitrageBot();
    await bot.initializeDriftClient();
    
    console.log('1️⃣ Поиск возможностей с анализом рисков...');
    const opportunities = await bot.findArbitrageOpportunities();
    
    if (opportunities.length === 0) {
      console.log('❌ Возможностей не найдено');
      return;
    }
    
    console.log(`✅ Найдено ${opportunities.length} потенциальных возможностей\n`);
    
    // Анализируем каждую возможность с точки зрения рисков
    for (let i = 0; i < Math.min(opportunities.length, 3); i++) {
      const opportunity = opportunities[i];
      console.log(`2️⃣ Анализ возможности ${i + 1}:`);
      
      const isRiskAcceptable = await bot.evaluateRiskAdjustedOpportunity(opportunity);
      
      if (isRiskAcceptable) {
        console.log(`   ✅ Возможность прошла проверку рисков`);
        
        // Рассчитываем оптимальный размер позиции
        const optimalSize = bot.calculatePositionSize(opportunity, 1000);
        console.log(`   💰 Рекомендуемый размер позиции: $${optimalSize.toFixed(2)}\n`);
        
        // В реальности здесь бы выполнили сделку
        console.log(`   🎯 Сделка была бы выполнена с размером $${optimalSize.toFixed(2)}`);
        break;
      } else {
        console.log(`   ❌ Возможность отклонена из-за высоких рисков\n`);
      }
    }
    
    console.log('3️⃣ Демонстрация продвинутого мониторинга...');
    await bot.advancedPositionMonitoring();
    
    console.log('\n✅ Пример управления рисками завершен!');
    
  } catch (error) {
    console.error('❌ Ошибка:', error.message);
  }
}

// Запуск примера
if (require.main === module) {
  riskManagementExample()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Критическая ошибка:', error);
      process.exit(1);
    });
}

export { RiskManagedArbitrageBot, riskManagementExample };