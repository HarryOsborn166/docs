/**
 * Демонстрация манипуляции цены на Drift Protocol
 * Показывает как создать крупную позицию и использовать меньшую для движения цены
 */

import { PriceManipulationBot } from '../app/price-manipulation-bot';
import { PriceImpactCalculator, MarketData } from '../app/price-impact-calculator';
import * as dotenv from 'dotenv';

dotenv.config();

async function priceManipulationDemo() {
  console.log('💀 ДЕМОНСТРАЦИЯ МАНИПУЛЯЦИИ ЦЕН НА DRIFT PROTOCOL');
  console.log('================================================');
  console.log('⚠️  ВНИМАНИЕ: Только для образовательных целей!');
  console.log('⚠️  Манипуляция рынков может быть незаконной!\n');

  try {
    // 1. Инициализация бота
    console.log('1️⃣ Инициализация бота манипуляций...');
    const bot = new PriceManipulationBot();
    await bot.initializeDriftClient();
    console.log('✅ Бот готов к работе\n');

    // 2. Демонстрация расчета воздействия на цену
    console.log('2️⃣ Анализ воздействия на цену...');
    
    // Моделируем данные рынка SOL/USD
    const mockMarketData: MarketData = {
      currentPrice: 45000,      // $45,000 за SOL
      liquidityDepth: 25_000_000, // $25M ликвидности
      volatility: 0.02,         // 2% часовая волатильность
      fundingRate: 0.0001,      // 0.01% funding rate
      openInterest: 150_000_000, // $150M открытый интерес
      averageTradeSize: 25_000   // $25K средняя сделка
    };

    console.log('📊 Данные рынка:');
    console.log(`   💰 Цена: $${mockMarketData.currentPrice.toLocaleString()}`);
    console.log(`   💧 Ликвидность: $${(mockMarketData.liquidityDepth / 1_000_000).toFixed(1)}M`);
    console.log(`   📈 Волатильность: ${(mockMarketData.volatility * 100).toFixed(1)}%`);
    console.log(`   🏦 Открытый интерес: $${(mockMarketData.openInterest / 1_000_000).toFixed(0)}M`);

    // 3. Тестируем различные размеры сделок
    console.log('\n3️⃣ Тестирование различных размеров pump-сделок:');
    
    const testSizes = [100_000, 500_000, 1_000_000, 2_000_000, 5_000_000];
    
    for (const tradeSize of testSizes) {
      const impact = PriceImpactCalculator.calculateTradeImpact(
        tradeSize,
        mockMarketData,
        'long'
      );
      
      console.log(`\n   💸 Сделка: $${tradeSize.toLocaleString()}`);
      console.log(`      📊 Движение цены: ${impact.priceMovementBps} bps (${(impact.priceMovementPercent * 100).toFixed(3)}%)`);
      console.log(`      💰 Новая цена: $${impact.newPrice.toFixed(2)}`);
      console.log(`      ⚠️  Риск: ${impact.riskScore}/100`);
      console.log(`      💸 Проскальзывание: ${impact.slippageBps} bps`);
    }

    // 4. Оптимизация стратегии манипуляции
    console.log('\n4️⃣ Оптимизация стратегии манипуляции...');
    
    const availableCapital = 1_000_000; // $1M доступного капитала
    const strategy = PriceImpactCalculator.optimizeManipulationStrategy(
      availableCapital,
      mockMarketData,
      0.05 // 5% целевая прибыль
    );

    // 5. Симуляция выполнения
    console.log('\n5️⃣ Симуляция выполнения стратегии...');
    
    const simulation = PriceImpactCalculator.simulateManipulation(
      strategy,
      mockMarketData
    );

    console.log(`\n📋 РЕЗУЛЬТАТЫ СИМУЛЯЦИИ:`);
    console.log(`   ${simulation.success ? '✅' : '❌'} Успех: ${simulation.success}`);
    console.log(`   💰 Финальная прибыль: $${simulation.finalProfit.toLocaleString()}`);
    console.log(`   📊 Движение цены: ${simulation.priceMovement} bps`);
    console.log(`   📈 ROI: ${((simulation.finalProfit / availableCapital) * 100).toFixed(2)}%`);
    
    if (simulation.risks.length > 0) {
      console.log(`   ⚠️  Риски:`);
      simulation.risks.forEach(risk => console.log(`      - ${risk}`));
    }

    // 6. Демонстрация конкретного сценария
    console.log('\n6️⃣ Конкретный сценарий "Pump & Profit":');
    console.log('=====================================');
    
    const scenario = {
      mainPosition: 800_000,    // $800K основная позиция
      mainLeverage: 10,         // 10x плечо = $8M контроль
      pumpPosition: 200_000,    // $200K pump позиция  
      pumpLeverage: 20,         // 20x плечо = $4M воздействие
    };

    console.log(`\n🎯 СЦЕНАРИЙ ВЫПОЛНЕНИЯ:`);
    console.log(`   1. Открываем ОСНОВНУЮ Long позицию:`);
    console.log(`      💰 Капитал: $${scenario.mainPosition.toLocaleString()}`);
    console.log(`      🔥 Плечо: ${scenario.mainLeverage}x`);
    console.log(`      📊 Контроль: $${(scenario.mainPosition * scenario.mainLeverage).toLocaleString()}`);
    
    console.log(`\n   2. В той же транзакции открываем PUMP позицию:`);
    console.log(`      💰 Капитал: $${scenario.pumpPosition.toLocaleString()}`);
    console.log(`      🔥 Плечо: ${scenario.pumpLeverage}x`);
    console.log(`      📊 Воздействие: $${(scenario.pumpPosition * scenario.pumpLeverage).toLocaleString()}`);

    // Рассчитываем воздействие pump позиции
    const pumpTradeSize = scenario.pumpPosition * scenario.pumpLeverage;
    const pumpImpact = PriceImpactCalculator.calculateTradeImpact(
      pumpTradeSize,
      mockMarketData,
      'long'
    );

    console.log(`\n   3. РЕЗУЛЬТАТ pump воздействия:`);
    console.log(`      📈 Движение цены: ${pumpImpact.priceMovementBps} bps`);
    console.log(`      💰 Новая цена: $${pumpImpact.newPrice.toFixed(2)}`);
    console.log(`      📊 Изменение: +$${(pumpImpact.newPrice - mockMarketData.currentPrice).toFixed(2)}`);

    // Рассчитываем прибыль основной позиции
    const mainTradeSize = scenario.mainPosition * scenario.mainLeverage;
    const mainProfit = mainTradeSize * pumpImpact.priceMovementPercent;

    console.log(`\n   4. ПРИБЫЛЬ основной позиции:`);
    console.log(`      📊 Контролируемая сумма: $${mainTradeSize.toLocaleString()}`);
    console.log(`      📈 Движение цены: ${(pumpImpact.priceMovementPercent * 100).toFixed(3)}%`);
    console.log(`      💰 Валовая прибыль: $${mainProfit.toLocaleString()}`);
    
    // Учитываем комиссии
    const totalFees = (mainTradeSize + pumpTradeSize) * 0.001; // 0.1% комиссии
    const netProfit = mainProfit - totalFees;
    const roi = (netProfit / availableCapital) * 100;

    console.log(`\n   5. ФИНАЛЬНЫЙ РЕЗУЛЬТАТ:`);
    console.log(`      💸 Комиссии: $${totalFees.toLocaleString()}`);
    console.log(`      💰 Чистая прибыль: $${netProfit.toLocaleString()}`);
    console.log(`      📊 ROI: ${roi.toFixed(2)}%`);
    console.log(`      ⏱️  Время выполнения: 1 транзакция (~1 секунда)`);

    // 7. Анализ рисков
    console.log('\n7️⃣ Анализ рисков:');
    console.log('================');
    
    console.log(`   ⚠️  ОСНОВНЫЕ РИСКИ:`);
    console.log(`      🔥 Ликвидация: При движении цены против нас на ${(100/scenario.mainLeverage).toFixed(1)}%`);
    console.log(`      📉 Реверс: Рынок может развернуться после pump'а`);
    console.log(`      🤖 MEV боты: Могут скопировать стратегию`);
    console.log(`      ⚖️  Регулятивный: Манипуляция рынков может быть незаконной`);
    console.log(`      💸 Проскальзывание: ${pumpImpact.slippageBps} bps дополнительных затрат`);

    console.log(`\n   🛡️  МЕРЫ ЗАЩИТЫ:`);
    console.log(`      ⏰ Быстрое исполнение (в одной транзакции)`);
    console.log(`      📊 Жесткие стоп-лоссы`);
    console.log(`      💰 Ограничение размера позиций`);
    console.log(`      🎯 Выбор малоликвидных рынков`);
    console.log(`      🕐 Выбор оптимального времени`);

    // 8. Практические рекомендации
    console.log('\n8️⃣ Практические рекомендации:');
    console.log('============================');
    
    console.log(`   🎯 ОПТИМАЛЬНЫЕ УСЛОВИЯ:`);
    console.log(`      💧 Ликвидность: <$50M (легче двигать)`);
    console.log(`      📊 Волатильность: <3% (предсказуемость)`);
    console.log(`      🏦 Открытый интерес: <$200M`);
    console.log(`      🕐 Время: Низкая активность (выходные/азиатская сессия)`);
    console.log(`      📈 Тренд: Боковое движение или слабый тренд`);

    console.log(`\n   💡 ТЕХНИЧЕСКИЕ СОВЕТЫ:`);
    console.log(`      🔧 Используйте приватные мемпулы`);
    console.log(`      ⚡ Высокие комиссии за газ для приоритета`);
    console.log(`      📊 Мониторинг в реальном времени`);
    console.log(`      🎯 Автоматизация для скорости`);
    console.log(`      🛡️  Тестирование на малых суммах`);

    console.log('\n✅ Демонстрация завершена!');
    console.log('\n⚠️  ПОМНИТЕ: Данная стратегия предназначена только для образовательных целей!');
    console.log('⚠️  Реальное использование может нарушать законы и правила бирж!');
    
  } catch (error) {
    console.error('❌ Ошибка демонстрации:', error.message);
  }
}

// Запуск демонстрации
if (require.main === module) {
  priceManipulationDemo()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Критическая ошибка:', error);
      process.exit(1);
    });
}

export { priceManipulationDemo };