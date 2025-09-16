# Solana MEV Strategy - Drift Protocol Price Impact

Автоматизированная MEV стратегия для Solana, использующая Drift Protocol и Jito Bundles для создания и извлечения прибыли из price impact на perpetual futures рынках.

## 🎯 Стратегия

### Механизм работы:
1. **Wallet A**: Flash loan $250k → Открыть $2.5M long позицию (10x плечо)
2. **Price Impact**: Создать 1-3% движение цены SOL на Drift perp рынке  
3. **Wallet B**: Flash loan $40k → Открыть $400k long позицию для усиления
4. **Фиксация**: Закрыть позиции и зафиксировать прибыль
5. **Атомарность**: Все операции в одном Jito Bundle

### Ожидаемая прибыльность:
- **Целевая прибыль**: $50-80k за выполнение
- **Частота**: 2-5 раз в день при подходящих условиях
- **Месячный потенциал**: $300-400k

## 🏗️ Архитектура

```
src/
├── index.js              # Главный файл запуска
├── mev-strategy.js        # Основная логика стратегии
├── oracle-monitor.js      # Мониторинг Pyth Network оракулов
├── drift-trading.js       # Интеграция с Drift Protocol
├── jito-bundle.js         # Управление Jito Bundles
├── flash-loan.js          # Flash loan интеграция
├── risk-manager.js        # Система управления рисками
└── test.js               # Тесты и симуляция
```

## 🚀 Быстрый старт

### 1. Установка
```bash
cd mev-strategy
npm install
```

### 2. Конфигурация
```bash
cp .env.example .env
# Заполните ваши приватные ключи и API ключи
```

### 3. Тестирование
```bash
# Unit тесты на devnet
npm run test

# Тест с малыми суммами на mainnet
npm run test live
```

### 4. Запуск
```bash
# Dry run (анализ без выполнения)
DRY_RUN=true npm start

# Тестовый режим с малыми суммами
TEST_MODE=true npm start

# Полный запуск (ОСТОРОЖНО!)
npm start
```

## ⚙️ Конфигурация

### Основные параметры (.env):
```env
# Позиции
MAX_POSITION_SIZE=2500000    # $2.5M максимальная позиция
MIN_POSITION_SIZE=100000     # $100k минимальная позиция
MAX_LEVERAGE=10              # Максимальное плечо

# Риск-менеджмент
STOP_LOSS_PCT=0.005         # 0.5% стоп-лосс
MAX_DAILY_LOSS=50000        # $50k максимальный дневной убыток
SLIPPAGE_TOLERANCE=0.005    # 0.5% допустимое проскальзывание

# Оракулы
ORACLE_STALENESS_THRESHOLD=500  # 500ms максимальное устаревание
```

## 🔧 Компоненты

### Oracle Monitor
- **Pyth Network** интеграция
- Мониторинг свежести данных (<500ms)
- Анализ волатильности рынка
- Определение подходящих условий

### Drift Trading
- Открытие/закрытие позиций с плечом
- Оценка price impact
- Мониторинг позиций в реальном времени
- Расчет P&L

### Jito Bundle Manager
- Создание атомарных bundles
- Оптимизация tips для приоритета
- Симуляция перед выполнением
- Мониторинг подтверждений

### Risk Manager
- Валидация размеров позиций
- Контроль дневных лимитов
- Анализ последовательных убытков
- Emergency stop механизмы

## 📊 Мониторинг

### Ключевые метрики:
- **Success Rate**: % успешных выполнений
- **Average Profit**: Средняя прибыль за сделку  
- **Daily P&L**: Дневная прибыль/убыток
- **Max Drawdown**: Максимальная просадка
- **Sharpe Ratio**: Соотношение доходности к риску

### Risk Controls:
- Максимальный размер позиции
- Дневные лимиты убытков
- Лимит последовательных убытков
- Oracle staleness protection
- Emergency stop условия

## ⚠️ Риски и ограничения

### Основные риски:
1. **Oracle Lag**: Оракулы могут не успеть обновиться
2. **Bundle Failure**: Jito bundle может не попасть в блок
3. **Sandwich Attacks**: Конкуренты могут "обернуть" сделки
4. **Liquidity Changes**: Ликвидность может измениться во время выполнения
5. **Market Volatility**: Экстремальная волатильность может нарушить расчеты

### Защитные меры:
- Oracle health monitoring
- Bundle simulation перед выполнением
- Slippage protection
- Position size limits
- Emergency stop механизмы

## 🧪 Тестирование

### Этапы тестирования:

1. **Unit Tests**: Тестирование компонентов на devnet
```bash
npm run test
```

2. **Small Amount Test**: Тестирование с малыми суммами
```bash
npm run test live
```

3. **Dry Run**: Анализ без выполнения сделок
```bash
DRY_RUN=true npm start
```

4. **Gradual Scaling**: Постепенное увеличение размеров позиций

### Рекомендуемая последовательность:
1. Тестирование на devnet
2. Тестирование с $1k позициями на mainnet
3. Масштабирование до $10k позиций
4. Полный размер только после стабильной прибыльности

## 📈 Оптимизация

### Performance Tuning:
- Oracle polling frequency
- Bundle submission timing
- Risk parameter adjustment
- Position sizing optimization

### Scaling Strategy:
- Start with 10% of target size
- Increase gradually based on success rate
- Monitor market conditions
- Adjust parameters based on results

## 🔒 Безопасность

### Рекомендации:
- Используйте отдельные кошельки для стратегии
- Храните основные средства в cold storage
- Регулярно мониторьте позиции
- Устанавливайте жесткие лимиты рисков
- Тестируйте все изменения на devnet

### Emergency Procedures:
- Manual override для остановки торговли
- Автоматическое закрытие позиций при критических условиях
- Backup кошельки для экстренных случаев

## 📞 Поддержка

Для вопросов по настройке и использованию:
- Проверьте логи в консоли
- Убедитесь в правильности конфигурации .env
- Начните с тестового режима
- Мониторьте риск-метрики

---

**⚠️ ПРЕДУПРЕЖДЕНИЕ**: Данная стратегия предполагает высокий риск. Используйте только средства, которые готовы потерять. Всегда начинайте с малых сумм и тщательного тестирования.