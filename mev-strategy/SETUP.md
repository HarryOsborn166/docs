# 🚀 ПОШАГОВАЯ ИНСТРУКЦИЯ ПО ЗАПУСКУ MEV СТРАТЕГИИ

## 📋 ПРЕДВАРИТЕЛЬНЫЕ ТРЕБОВАНИЯ

### 1. Установка зависимостей
```bash
# Установите Node.js 18+ и npm
node --version  # Должно быть 18+
npm --version

# Установите Solana CLI
sh -c "$(curl -sSfL https://release.solana.com/v1.17.0/install)"
solana --version
```

### 2. Подготовка кошельков
```bash
# Создайте 3 кошелька
solana-keygen new --outfile wallet-a.json
solana-keygen new --outfile wallet-b.json  
solana-keygen new --outfile wallet-backup.json

# Получите адреса
solana-keygen pubkey wallet-a.json
solana-keygen pubkey wallet-b.json
solana-keygen pubkey wallet-backup.json

# Конвертируйте в base64 для .env файла
# (используйте скрипт ниже)
```

### 3. Конвертация ключей
```javascript
// convert-keys.js
const fs = require('fs');
const { Keypair } = require('@solana/web3.js');

function convertWallet(filename) {
    const keyData = JSON.parse(fs.readFileSync(filename));
    const keypair = Keypair.fromSecretKey(new Uint8Array(keyData));
    const base64Key = Buffer.from(keypair.secretKey).toString('base64');
    console.log(`${filename}: ${base64Key}`);
}

convertWallet('wallet-a.json');
convertWallet('wallet-b.json');
convertWallet('wallet-backup.json');
```

## 🔧 НАСТРОЙКА ПРОЕКТА

### 1. Клонирование и установка
```bash
cd /workspace/mev-strategy
npm install
```

### 2. Создание .env файла
```bash
cp .env.example .env
nano .env  # Заполните все параметры
```

### 3. Конфигурация .env
```env
# === RPC ENDPOINTS ===
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
HELIUS_API_KEY=your_helius_key_here
QUICKNODE_URL=your_quicknode_url_here

# === JITO CONFIGURATION ===
JITO_RPC_URL=https://mainnet.block-engine.jito.wtf
JITO_TIP_ACCOUNT=96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5

# === WALLET KEYS (Base64) ===
WALLET_A_PRIVATE_KEY=YOUR_BASE64_KEY_A
WALLET_B_PRIVATE_KEY=YOUR_BASE64_KEY_B
BACKUP_WALLET_PRIVATE_KEY=YOUR_BASE64_KEY_BACKUP

# === ORACLE CONFIGURATION ===
PYTH_RPC_URL=https://pythnet.rpcpool.com/
PYTH_SOL_PRICE_FEED=H6ARHf6YXhGYeQfUzQNGk6rDNnLBQKrenN712K4AQJEG

# === TRADING PARAMETERS ===
MAX_POSITION_SIZE=2500000     # $2.5M для продакшена
MIN_POSITION_SIZE=100000      # $100k минимум
MAX_LEVERAGE=10               # 10x максимальное плечо
SLIPPAGE_TOLERANCE=0.005      # 0.5% проскальзывание

# === RISK MANAGEMENT ===
STOP_LOSS_PCT=0.005           # 0.5% стоп-лосс
MAX_DAILY_LOSS=50000          # $50k дневной лимит
ORACLE_STALENESS_THRESHOLD=500 # 500ms свежесть оракула

# === TESTING MODES ===
USE_DEVNET=false              # true для devnet
TEST_MODE=false               # true для малых сумм
DRY_RUN=false                 # true для анализа без сделок
```

## 💰 ПОПОЛНЕНИЕ КОШЕЛЬКОВ

### 1. Для Devnet тестирования
```bash
# Переключитесь на devnet
solana config set --url https://api.devnet.solana.com

# Получите тестовые SOL
solana airdrop 5 $(solana-keygen pubkey wallet-a.json)
solana airdrop 5 $(solana-keygen pubkey wallet-b.json)

# Проверьте баланс
solana balance $(solana-keygen pubkey wallet-a.json)
```

### 2. Для Mainnet
```bash
# ОСТОРОЖНО: Реальные средства!
# Пополните кошельки через биржу или другие источники

# Рекомендуемые суммы для тестирования:
# Wallet A: 5-10 SOL + $10k USDC в Drift
# Wallet B: 2-5 SOL + $2k USDC в Drift
```

### 3. Настройка Drift аккаунтов
```bash
# Создайте аккаунты в Drift Protocol
# 1. Откройте https://app.drift.trade/
# 2. Подключите wallet-a и wallet-b
# 3. Пополните аккаунты USDC
# 4. Убедитесь что аккаунты инициализированы
```

## 🧪 ЭТАПЫ ТЕСТИРОВАНИЯ

### ЭТАП 1: Unit тесты на Devnet
```bash
# Установите devnet в .env
USE_DEVNET=true
TEST_MODE=true

# Запустите тесты
npm run test

# Ожидаемый результат:
# ✅ Initialization successful
# ✅ Oracle monitoring working  
# ✅ Market analysis working
# ✅ Risk management working
# ✅ Statistics working
# 🎉 ALL TESTS PASSED!
```

### ЭТАП 2: Dry Run анализ
```bash
# Анализ без выполнения сделок
DRY_RUN=true
USE_DEVNET=false
npm start

# Мониторьте вывод:
# 📊 ANALYSIS #1: Current price, Expected profit, Should execute
# Оставьте на 10-15 минут для сбора данных
```

### ЭТАП 3: Малые суммы на Mainnet
```bash
# Настройте тестовые суммы
TEST_MODE=true
USE_DEVNET=false
DRY_RUN=false

# В .env установите малые суммы:
MAX_POSITION_SIZE=10000    # $10k вместо $2.5M
MIN_POSITION_SIZE=1000     # $1k вместо $100k

npm run test live
```

### ЭТАП 4: Постепенное масштабирование
```bash
# После успешного тестирования постепенно увеличивайте:
# День 1-3: $10k/$1.6k позиции
# День 4-7: $50k/$8k позиции  
# День 8-14: $250k/$40k позиции
# День 15+: Полный размер $2.5M/$400k
```

## 🚀 ЗАПУСК В ПРОДАКШЕНЕ

### 1. Финальная проверка
```bash
# Убедитесь что все параметры корректны
cat .env | grep -v "#" | grep "="

# Проверьте балансы кошельков
solana balance $(solana-keygen pubkey wallet-a.json)
solana balance $(solana-keygen pubkey wallet-b.json)

# Проверьте Drift аккаунты через UI
```

### 2. Запуск стратегии
```bash
# Полный запуск (ОСТОРОЖНО!)
USE_DEVNET=false
TEST_MODE=false  
DRY_RUN=false
npm start

# Стратегия начнет автоматическую торговлю
# Мониторьте логи в реальном времени
```

### 3. Мониторинг
```bash
# В отдельном терминале мониторьте:
tail -f logs/mev-strategy.log  # если логирование настроено

# Ключевые метрики для отслеживания:
# - Success Rate (должен быть >60%)
# - Daily P&L (положительный)
# - Oracle staleness (<500ms)
# - Bundle success rate (>80%)
```

## 🛑 ЭКСТРЕННАЯ ОСТАНОВКА

### Автоматическая остановка
Стратегия автоматически остановится при:
- Дневные убытки > $50k
- 3+ последовательных убытка
- Win rate < 30% (при >20 сделках)

### Ручная остановка
```bash
# Нажмите Ctrl+C в терминале
# Стратегия корректно закроет позиции и завершится

# Или отправьте SIGTERM
kill -TERM <process_id>
```

### Экстренное закрытие позиций
```bash
# Если основной процесс завис, используйте backup скрипт:
node emergency-close.js

# Или закройте позиции вручную через Drift UI
```

## 📊 МОНИТОРИНГ И ОПТИМИЗАЦИЯ

### Ключевые файлы логов
```bash
# Основные логи
tail -f console.log

# Ошибки
tail -f error.log

# Торговые операции  
tail -f trades.log
```

### Оптимизация параметров
После 1-2 недель работы проанализируйте:
- Win rate и avg profit
- Optimal position sizes
- Best execution times
- Oracle lag patterns

### Scaling Up
Увеличивайте позиции только при:
- Win rate > 70%
- Stable daily profits
- No emergency stops за неделю
- Понимание всех рисков

## ⚠️ ВАЖНЫЕ ПРЕДУПРЕЖДЕНИЯ

1. **Начинайте с малых сумм** - не более $10k на позицию
2. **Тестируйте все изменения** на devnet
3. **Мониторьте постоянно** первые дни работы
4. **Имейте план экстренной остановки**
5. **Используйте только средства которые готовы потерять**

## 🆘 TROUBLESHOOTING

### Частые ошибки:
1. **Oracle stale** - увеличьте ORACLE_STALENESS_THRESHOLD
2. **Bundle failed** - проверьте Jito tips, увеличьте tip amount
3. **Insufficient balance** - пополните кошельки
4. **Position size error** - проверьте лимиты в Drift
5. **RPC errors** - используйте premium RPC endpoints

### Получение помощи:
- Проверьте логи на ошибки
- Убедитесь в правильности конфигурации
- Начните с devnet тестирования
- Используйте малые суммы для отладки

---

**🎯 ГОТОВЫ К ЗАПУСКУ!** 

Следуйте инструкциям поэтапно, не пропускайте тестирование, и всегда начинайте с малых сумм!