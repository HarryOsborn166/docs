/**
 * Простой пример выполнения арбитража на Drift Protocol
 * Демонстрирует базовое использование системы
 */

import { ArbitrageBot } from '../app/index';
import * as dotenv from 'dotenv';

dotenv.config();

async function simpleArbitrageExample() {
  console.log('🤖 Простой пример арбитража на Drift Protocol');
  console.log('================================================\n');

  try {
    // 1. Создаем экземпляр бота
    console.log('1️⃣ Создание арбитражного бота...');
    const bot = new ArbitrageBot();

    // 2. Инициализируем подключение к Drift
    console.log('2️⃣ Инициализация Drift клиента...');
    await bot.initializeDriftClient();
    console.log('✅ Drift клиент готов к работе\n');

    // 3. Поиск арбитражных возможностей
    console.log('3️⃣ Поиск арбитражных возможностей...');
    const opportunities = await bot.findArbitrageOpportunities();
    
    if (opportunities.length === 0) {
      console.log('❌ Прибыльных возможностей не найдено');
      return;
    }

    console.log(`✅ Найдено ${opportunities.length} возможностей:`);
    
    // 4. Показываем топ-3 возможности
    opportunities.slice(0, 3).forEach((opp, index) => {
      console.log(`\n   ${index + 1}. Арбитраж между рынками ${opp.marketIndexLong} и ${opp.marketIndexShort}`);
      console.log(`      📊 Спред: ${(opp.priceSpread * 100).toFixed(3)}%`);
      console.log(`      💰 Ожидаемая прибыль: ${(opp.expectedProfit * 100).toFixed(3)}%`);
      console.log(`      📈 Long цена: $${opp.longPrice.toFixed(4)}`);
      console.log(`      📉 Short цена: $${opp.shortPrice.toFixed(4)}`);
    });

    // 5. Выполняем лучшую возможность (если прибыль > 1%)
    const bestOpportunity = opportunities[0];
    if (bestOpportunity.expectedProfit > 0.01) {
      console.log(`\n4️⃣ Выполнение арбитража...`);
      console.log(`   🎯 Выбрана лучшая возможность с прибылью ${(bestOpportunity.expectedProfit * 100).toFixed(2)}%`);
      
      // В реальном использовании здесь был бы вызов:
      // const success = await bot.executeArbitrage(bestOpportunity);
      
      // Для демонстрации показываем что произошло бы:
      console.log('   📋 План выполнения:');
      console.log(`      1. Получить флэш-займ на $1000`);
      console.log(`      2. Открыть Long позицию на рынке ${bestOpportunity.marketIndexLong} с плечом 5x`);
      console.log(`      3. Открыть Short позицию на рынке ${bestOpportunity.marketIndexShort} с плечом 5x`);
      console.log(`      4. Закрыть позиции при достижении целевой прибыли`);
      console.log(`      5. Вернуть флэш-займ + комиссия`);
      console.log(`      6. Зафиксировать прибыль ~$${(1000 * bestOpportunity.expectedProfit).toFixed(2)}`);
      
      console.log('\n   ⚠️  В демо-режиме сделка не выполняется');
      console.log('   💡 Для реального выполнения раскомментируйте строку executeArbitrage');
    } else {
      console.log('\n❌ Лучшая возможность не достигает минимального порога прибыльности (1%)');
    }

    // 6. Мониторинг текущих позиций
    console.log('\n5️⃣ Проверка текущих позиций...');
    await bot.monitorPositions();

    console.log('\n✅ Пример выполнен успешно!');
    
  } catch (error) {
    console.error('❌ Ошибка выполнения примера:', error.message);
    
    if (error.message.includes('PRIVATE_KEY')) {
      console.log('\n💡 Подсказка: Убедитесь что файл .env настроен корректно');
      console.log('   Скопируйте .env.example в .env и добавьте ваш приватный ключ');
    }
  }
}

// Запуск примера
if (require.main === module) {
  simpleArbitrageExample()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Критическая ошибка:', error);
      process.exit(1);
    });
}

export { simpleArbitrageExample };