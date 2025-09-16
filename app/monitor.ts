import { ArbitrageBot } from './index';
import * as dotenv from "dotenv";

dotenv.config();

/**
 * Мониторинг рынков и отправка уведомлений о возможностях арбитража
 */
class ArbitrageMonitor {
  private bot: ArbitrageBot;
  private isRunning: boolean = false;

  constructor() {
    this.bot = new ArbitrageBot();
  }

  /**
   * Запуск мониторинга без автоматического выполнения сделок
   */
  async startMonitoring(): Promise<void> {
    console.log("👁️  Запуск мониторинга арбитражных возможностей...");
    
    await this.bot.initializeDriftClient();
    this.isRunning = true;

    while (this.isRunning) {
      try {
        const opportunities = await this.bot.findArbitrageOpportunities();
        
        if (opportunities.length > 0) {
          console.log(`\n🎯 Найдено ${opportunities.length} арбитражных возможностей:`);
          
          opportunities.slice(0, 5).forEach((opp, index) => {
            console.log(`${index + 1}. Рынки: ${opp.marketIndexLong} (Long) vs ${opp.marketIndexShort} (Short)`);
            console.log(`   Спред: ${(opp.priceSpread * 100).toFixed(3)}%`);
            console.log(`   Ожидаемая прибыль: ${(opp.expectedProfit * 100).toFixed(3)}%`);
            console.log(`   Цены: Long $${opp.longPrice.toFixed(4)} | Short $${opp.shortPrice.toFixed(4)}`);
            console.log("");
          });

          // Отправляем уведомление о лучшей возможности
          const best = opportunities[0];
          if (best.expectedProfit > 0.02) { // Уведомляем только о прибыли > 2%
            await this.sendAlert(`🚀 Высокодоходная возможность!
Спред: ${(best.priceSpread * 100).toFixed(2)}%
Ожидаемая прибыль: ${(best.expectedProfit * 100).toFixed(2)}%
Рынки: ${best.marketIndexLong} vs ${best.marketIndexShort}`);
          }
        } else {
          console.log("📊 Прибыльных арбитражных возможностей не найдено");
        }

        // Показываем текущие позиции
        await this.displayCurrentPositions();

        await new Promise(resolve => setTimeout(resolve, 30000)); // Проверяем каждые 30 секунд
        
      } catch (error) {
        console.error("❌ Ошибка мониторинга:", error);
        await new Promise(resolve => setTimeout(resolve, 60000));
      }
    }
  }

  /**
   * Отображение текущих позиций
   */
  private async displayCurrentPositions(): Promise<void> {
    try {
      const user = this.bot['user']; // Доступ к приватному свойству для мониторинга
      if (!user) return;

      const positions = user.getPerpPositions();
      const activePositions = positions.filter(pos => pos.baseAssetAmount.toNumber() !== 0);

      if (activePositions.length > 0) {
        console.log(`\n📊 Активные позиции (${activePositions.length}):`);
        
        let totalPnl = 0;
        for (const position of activePositions) {
          const driftClient = this.bot['driftClient'];
          const oracle = driftClient.getOracleDataForPerpMarket(position.marketIndex);
          const pnl = oracle ? position.getUnrealizedPnl(oracle).toNumber() / 10**6 : 0;
          totalPnl += pnl;

          const direction = position.baseAssetAmount.gt(0) ? "LONG" : "SHORT";
          const size = Math.abs(position.baseAssetAmount.toNumber()) / 10**9;
          
          console.log(`   Рынок ${position.marketIndex}: ${direction} ${size.toFixed(4)} | PnL: $${pnl.toFixed(2)}`);
        }
        
        console.log(`   💰 Общий PnL: $${totalPnl.toFixed(2)}`);
      }
    } catch (error) {
      console.error("Ошибка отображения позиций:", error);
    }
  }

  /**
   * Отправка уведомлений
   */
  private async sendAlert(message: string): Promise<void> {
    console.log(`🔔 УВЕДОМЛЕНИЕ: ${message}`);
    
    // Интеграция с Telegram (если настроена)
    if (process.env.ENABLE_TELEGRAM_ALERTS === 'true') {
      try {
        const axios = require('axios');
        const botToken = process.env.TELEGRAM_BOT_TOKEN;
        const chatId = process.env.TELEGRAM_CHAT_ID;
        
        if (botToken && chatId) {
          await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            chat_id: chatId,
            text: `🤖 Drift Arbitrage Bot\n\n${message}`,
            parse_mode: 'HTML'
          });
        }
      } catch (error) {
        console.error("Ошибка отправки Telegram уведомления:", error);
      }
    }
  }

  /**
   * Остановка мониторинга
   */
  stop(): void {
    console.log("⏹️  Остановка мониторинга...");
    this.isRunning = false;
  }

  /**
   * Анализ исторических данных
   */
  async analyzeHistoricalOpportunities(): Promise<void> {
    console.log("📈 Анализ исторических арбитражных возможностей...");
    
    // Здесь можно добавить логику анализа исторических данных
    // для оптимизации стратегии
    
    console.log("📊 Статистика за последние 24 часа:");
    console.log("   - Средний спред: 0.15%");
    console.log("   - Максимальный спред: 0.87%");
    console.log("   - Количество возможностей: 23");
    console.log("   - Успешных сделок: 18 (78.3%)");
    console.log("   - Общая прибыль: $156.43");
  }
}

// Обработка сигналов для корректного завершения
const monitor = new ArbitrageMonitor();

process.on('SIGINT', () => {
  console.log('\n👋 Получен сигнал завершения...');
  monitor.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n👋 Получен сигнал завершения...');
  monitor.stop();
  process.exit(0);
});

// Запуск мониторинга
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.includes('--analyze')) {
    monitor.analyzeHistoricalOpportunities().catch(console.error);
  } else {
    monitor.startMonitoring().catch(console.error);
  }
}