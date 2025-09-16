#!/bin/bash

# Скрипт для деплоя контракта арбитража на Drift Protocol

set -e

echo "🚀 Начинаем деплой Drift Arbitrage контракта..."

# Проверяем наличие необходимых инструментов
if ! command -v anchor &> /dev/null; then
    echo "❌ Anchor CLI не найден. Установите Anchor Framework."
    exit 1
fi

if ! command -v solana &> /dev/null; then
    echo "❌ Solana CLI не найден. Установите Solana CLI."
    exit 1
fi

# Проверяем переменные окружения
if [ -z "$SOLANA_RPC_URL" ]; then
    echo "⚠️  SOLANA_RPC_URL не установлен, используем devnet"
    export SOLANA_RPC_URL="https://api.devnet.solana.com"
fi

# Устанавливаем сеть
NETWORK=${1:-devnet}
echo "🌐 Деплой в сеть: $NETWORK"

# Настраиваем Solana CLI
solana config set --url $SOLANA_RPC_URL
solana config set --keypair ~/.config/solana/id.json

# Проверяем баланс
BALANCE=$(solana balance)
echo "💰 Текущий баланс: $BALANCE"

if [[ "$BALANCE" == "0 SOL" ]]; then
    echo "⚠️  Недостаточно SOL для деплоя. Запрашиваем airdrop..."
    solana airdrop 2
    sleep 5
fi

# Устанавливаем зависимости
echo "📦 Устанавливаем зависимости..."
npm install

# Собираем проект
echo "🔨 Сборка проекта..."
anchor build

# Генерируем новый keypair для программы если нужно
if [ ! -f "target/deploy/drift_arbitrage-keypair.json" ]; then
    echo "🔑 Генерируем новый keypair для программы..."
    solana-keygen new --outfile target/deploy/drift_arbitrage-keypair.json --no-bip39-passphrase
fi

# Получаем адрес программы
PROGRAM_ID=$(solana-keygen pubkey target/deploy/drift_arbitrage-keypair.json)
echo "📍 Program ID: $PROGRAM_ID"

# Обновляем Program ID в коде если нужно
if ! grep -q "$PROGRAM_ID" programs/drift-arbitrage/src/lib.rs; then
    echo "📝 Обновляем Program ID в коде..."
    sed -i "s/declare_id!(\".*\")/declare_id!(\"$PROGRAM_ID\")/" programs/drift-arbitrage/src/lib.rs
    
    # Пересобираем после изменения ID
    anchor build
fi

# Деплоим программу
echo "🚀 Деплоим программу..."
anchor deploy --program-name drift_arbitrage --program-keypair target/deploy/drift_arbitrage-keypair.json

# Проверяем деплой
echo "✅ Проверяем деплой..."
solana program show $PROGRAM_ID

# Создаем .env файл с настройками
echo "📄 Создаем конфигурационный файл..."
cat > .env << EOF
# Solana Configuration
SOLANA_RPC_URL=$SOLANA_RPC_URL
SOLANA_WS_URL=${SOLANA_RPC_URL/https/wss}

# Program Configuration  
PROGRAM_ID=$PROGRAM_ID

# Drift Protocol Configuration
DRIFT_PROGRAM_ID=dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH
DRIFT_ENV=$NETWORK

# Trading Configuration
MAX_POSITION_SIZE=1000
MIN_PROFIT_THRESHOLD=0.01
MAX_LEVERAGE=10
SLIPPAGE_TOLERANCE=0.005

# Risk Management
STOP_LOSS_PERCENTAGE=0.05
MAX_DAILY_LOSS=100
POSITION_TIMEOUT_SECONDS=300

# Monitoring
ENABLE_TELEGRAM_ALERTS=false
LOG_LEVEL=info
EOF

echo "✅ Деплой завершен успешно!"
echo ""
echo "📋 Информация о деплое:"
echo "   🌐 Сеть: $NETWORK"
echo "   📍 Program ID: $PROGRAM_ID"
echo "   💰 Использовано SOL: ~0.5"
echo ""
echo "🔧 Следующие шаги:"
echo "   1. Скопируйте .env.example в .env и настройте параметры"
echo "   2. Добавьте ваш приватный ключ в переменную PRIVATE_KEY"
echo "   3. Запустите мониторинг: npm run monitor"
echo "   4. Запустите бота: npm start"
echo ""
echo "⚠️  ВАЖНО: Тщательно протестируйте на devnet перед использованием на mainnet!"