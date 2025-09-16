/**
 * Бот для выполнения манипуляций цен на Drift Protocol
 * Создает крупную основную позицию и использует меньшую позицию для движения цены
 */

import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider, Wallet } from "@coral-xyz/anchor";
import { 
  Connection, 
  PublicKey, 
  Keypair,
  SystemProgram
} from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { DriftClient, User, PerpMarkets } from "@drift-labs/sdk";
import { DriftArbitrage } from "../target/types/drift_arbitrage";
import { PriceImpactCalculator, MarketData, ManipulationStrategy } from './price-impact-calculator';
import * as dotenv from 'dotenv';
import BN from 'bn.js';

dotenv.config();

export class PriceManipulationBot {
  private connection: Connection;
  private provider: AnchorProvider;
  private program: Program<DriftArbitrage>;
  private driftClient: DriftClient;
  private wallet: Wallet;
  private user: User;
  
  constructor() {
    // Инициализация соединения
    this.connection = new Connection(
      process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com",
      "confirmed"
    );

    // Инициализация кошелька
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
      throw new Error("PRIVATE_KEY не найден в переменных окружения");
    }
    
    const keypair = Keypair.fromSecretKey(
      anchor.utils.bytes.bs58.decode(privateKey)
    );
    this.wallet = new Wallet(keypair);

    // Инициализация провайдера и программы
    this.provider = new AnchorProvider(
      this.connection,
      this.wallet,
      { commitment: "confirmed" }
    );
    anchor.setProvider(this.provider);

    const programId = new PublicKey(process.env.PROGRAM_ID!);
    this.program = anchor.workspace.DriftArbitrage as Program<DriftArbitrage>;
  }

  /**
   * Инициализация Drift клиента
   */
  async initializeDriftClient(): Promise<void> {
    console.log('🚀 Инициализация Drift клиента для манипуляций...');
    
    this.driftClient = new DriftClient({
      connection: this.connection,
      wallet: this.wallet,
      programID: new PublicKey(process.env.DRIFT_PROGRAM_ID!),
      env: process.env.DRIFT_ENV as any || "devnet",
    });

    await this.driftClient.subscribe();
    
    try {
      this.user = this.driftClient.getUser();
      await this.user.subscribe();
    } catch (error) {
      console.log('Создание нового пользователя Drift...');
      await this.driftClient.initializeUser();
      this.user = this.driftClient.getUser();
      await this.user.subscribe();
    }

    console.log('✅ Drift клиент готов к манипуляциям');
  }

  /**
   * Получает данные о рынке для анализа
   */
  async getMarketData(marketIndex: number): Promise<MarketData> {
    const perpMarket = this.driftClient.getPerpMarketAccount(marketIndex);
    const oracleData = this.driftClient.getOracleDataForPerpMarket(marketIndex);
    
    if (!perpMarket || !oracleData) {
      throw new Error(`Не удалось получить данные для рынка ${marketIndex}`);
    }

    // Получаем основные метрики рынка
    const currentPrice = oracleData.price.toNumber() / 10**6; // Приводим к USD
    const openInterest = perpMarket.amm.baseAssetAmountWithAmm.toNumber() / 10**9;
    
    // Оцениваем ликвидность на основе AMM
    const liquidityDepth = this.estimateLiquidityDepth(perpMarket);
    
    // Рассчитываем волатильность (упрощенно)
    const volatility = this.calculateVolatility(marketIndex);
    
    // Получаем funding rate
    const fundingRate = perpMarket.amm.lastFundingRate.toNumber() / 10**9;
    
    // Средний размер сделки (приблизительно)
    const averageTradeSize = liquidityDepth / 1000; // 0.1% от ликвидности

    return {
      currentPrice,
      liquidityDepth,
      volatility,
      fundingRate,
      openInterest,
      averageTradeSize
    };
  }

  /**
   * Поиск оптимальных рынков для манипуляции
   */
  async findManipulationTargets(): Promise<{
    marketIndex: number;
    marketData: MarketData;
    manipulationScore: number;
  }[]> {
    console.log('🎯 Поиск целей для манипуляции...');
    
    const targets: {
      marketIndex: number;
      marketData: MarketData;
      manipulationScore: number;
    }[] = [];

    const perpMarkets = this.driftClient.getPerpMarketAccounts();
    
    for (let i = 0; i < perpMarkets.length; i++) {
      try {
        const marketData = await this.getMarketData(i);
        const timing = PriceImpactCalculator.calculateOptimalTiming(marketData);
        
        // Рассчитываем общий скор для манипуляции
        let manipulationScore = timing.score;
        
        // Бонусы за благоприятные условия
        if (marketData.liquidityDepth < 20_000_000) manipulationScore += 15; // Низкая ликвидность
        if (marketData.volatility < 0.03) manipulationScore += 10; // Низкая волатильность
        if (marketData.openInterest < 100_000_000) manipulationScore += 10; // Низкий OI
        
        targets.push({
          marketIndex: i,
          marketData,
          manipulationScore
        });
        
      } catch (error) {
        console.log(`⚠️  Не удалось получить данные для рынка ${i}`);
      }
    }
    
    // Сортируем по убыванию скора
    targets.sort((a, b) => b.manipulationScore - a.manipulationScore);
    
    console.log(`✅ Найдено ${targets.length} потенциальных целей`);
    targets.slice(0, 3).forEach((target, index) => {
      console.log(`${index + 1}. Рынок ${target.marketIndex}:`);
      console.log(`   💰 Цена: $${target.marketData.currentPrice.toFixed(4)}`);
      console.log(`   💧 Ликвидность: $${(target.marketData.liquidityDepth / 1_000_000).toFixed(1)}M`);
      console.log(`   📊 Скор манипуляции: ${target.manipulationScore}/100`);
    });
    
    return targets;
  }

  /**
   * Выполняет манипуляцию цены
   */
  async executeManipulation(
    marketIndex: number,
    strategy: ManipulationStrategy
  ): Promise<boolean> {
    try {
      console.log(`\n🎯 Выполнение манипуляции на рынке ${marketIndex}`);
      console.log(`📈 Основная позиция: $${strategy.mainPositionSize.toLocaleString()} (${strategy.mainLeverage}x)`);
      console.log(`🚀 Pump позиция: $${strategy.pumpPositionSize.toLocaleString()} (${strategy.pumpLeverage}x)`);

      // Получаем необходимые аккаунты
      const userTokenAccount = await this.getUserTokenAccount();

      // Выполняем транзакцию манипуляции
      const tx = await this.program.methods
        .executePriceManipulation(
          new BN(strategy.mainPositionSize * 10**6), // Конвертируем в микро-доллары
          new BN(strategy.mainLeverage),
          new BN(strategy.pumpPositionSize * 10**6),
          new BN(strategy.pumpLeverage),
          marketIndex,
          new BN(strategy.targetPriceMoveBps)
        )
        .accounts({
          driftState: this.driftClient.getStateAccount(),
          user: this.user.getUserAccount(),
          userStats: this.user.getUserStatsAccount(),
          userTokenAccount,
          authority: this.wallet.publicKey,
          driftProgram: this.driftClient.program.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      console.log(`✅ Манипуляция выполнена: ${tx}`);
      
      // Ждем подтверждения
      await this.connection.confirmTransaction(tx);
      
      // Проверяем результат
      await this.checkManipulationResult(marketIndex);
      
      return true;
    } catch (error) {
      console.error('❌ Ошибка выполнения манипуляции:', error);
      return false;
    }
  }

  /**
   * Выполняет многоволновую манипуляцию
   */
  async executeLayeredManipulation(
    marketIndex: number,
    mainPositionSize: number,
    mainLeverage: number,
    waves: Array<{amount: number, leverage: number}>
  ): Promise<boolean> {
    try {
      console.log(`\n🌊 Выполнение многоволновой манипуляции на рынке ${marketIndex}`);
      console.log(`📈 Основная позиция: $${mainPositionSize.toLocaleString()} (${mainLeverage}x)`);
      console.log(`🌊 Количество волн: ${waves.length}`);

      const userTokenAccount = await this.getUserTokenAccount();
      
      // Подготавливаем данные волн
      const pumpWaves = waves.map((wave, index) => ({
        amount: new BN(wave.amount * 10**6),
        leverage: new BN(wave.leverage),
        delay: 0 // В одной транзакции без задержек
      }));

      const tx = await this.program.methods
        .executeLayeredManipulation(
          new BN(mainPositionSize * 10**6),
          new BN(mainLeverage),
          pumpWaves,
          marketIndex,
          new BN(200) // 2% целевое движение
        )
        .accounts({
          driftState: this.driftClient.getStateAccount(),
          user: this.user.getUserAccount(),
          userStats: this.user.getUserStatsAccount(),
          userTokenAccount,
          authority: this.wallet.publicKey,
          driftProgram: this.driftClient.program.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      console.log(`✅ Многоволновая манипуляция выполнена: ${tx}`);
      await this.connection.confirmTransaction(tx);
      
      return true;
    } catch (error) {
      console.error('❌ Ошибка многоволновой манипуляции:', error);
      return false;
    }
  }

  /**
   * Экстренное закрытие всех позиций
   */
  async emergencyCloseAll(marketIndex: number): Promise<void> {
    try {
      console.log(`🚨 Экстренное закрытие всех позиций на рынке ${marketIndex}`);
      
      const tx = await this.program.methods
        .emergencyCloseAll(marketIndex)
        .accounts({
          driftState: this.driftClient.getStateAccount(),
          user: this.user.getUserAccount(),
          authority: this.wallet.publicKey,
          driftProgram: this.driftClient.program.programId,
        })
        .rpc();

      await this.connection.confirmTransaction(tx);
      console.log(`✅ Все позиции закрыты: ${tx}`);
    } catch (error) {
      console.error('❌ Ошибка экстренного закрытия:', error);
    }
  }

  /**
   * Проверяет результат манипуляции
   */
  private async checkManipulationResult(marketIndex: number): Promise<void> {
    const positions = this.user.getPerpPositions();
    const relevantPositions = positions.filter(pos => 
      pos.marketIndex === marketIndex && pos.baseAssetAmount.toNumber() !== 0
    );

    if (relevantPositions.length === 0) {
      console.log('📊 Позиции не найдены или уже закрыты');
      return;
    }

    let totalPnl = 0;
    console.log(`\n📊 Результаты манипуляции на рынке ${marketIndex}:`);
    
    for (const position of relevantPositions) {
      const oracle = this.driftClient.getOracleDataForPerpMarket(position.marketIndex);
      if (oracle) {
        const pnl = position.getUnrealizedPnl(oracle).toNumber() / 10**6;
        totalPnl += pnl;
        
        const direction = position.baseAssetAmount.gt(new BN(0)) ? "LONG" : "SHORT";
        const size = Math.abs(position.baseAssetAmount.toNumber()) / 10**9;
        
        console.log(`   ${direction} позиция: ${size.toFixed(4)} | PnL: $${pnl.toFixed(2)}`);
      }
    }
    
    console.log(`💰 Общий результат: $${totalPnl.toFixed(2)}`);
    
    if (totalPnl > 0) {
      console.log('🎉 Манипуляция прошла успешно!');
    } else {
      console.log('⚠️  Манипуляция убыточна, рассмотрите закрытие позиций');
    }
  }

  /**
   * Главный цикл бота манипуляций
   */
  async run(): Promise<void> {
    console.log('🤖 Запуск бота манипуляций цен...');
    console.log('⚠️  ВНИМАНИЕ: Данный бот предназначен только для образовательных целей!');
    
    await this.initializeDriftClient();
    
    while (true) {
      try {
        // 1. Ищем цели для манипуляции
        const targets = await this.findManipulationTargets();
        
        if (targets.length === 0) {
          console.log('❌ Подходящих целей для манипуляции не найдено');
          await this.sleep(60000); // Ждем минуту
          continue;
        }

        // 2. Выбираем лучшую цель
        const bestTarget = targets[0];
        
        if (bestTarget.manipulationScore < 60) {
          console.log(`⚠️  Лучший скор манипуляции: ${bestTarget.manipulationScore}/100 - слишком низкий`);
          await this.sleep(30000);
          continue;
        }

        // 3. Оптимизируем стратегию
        const availableCapital = parseFloat(process.env.MAX_POSITION_SIZE || "10000");
        const strategy = PriceImpactCalculator.optimizeManipulationStrategy(
          availableCapital,
          bestTarget.marketData,
          0.03 // 3% целевая прибыль
        );

        // 4. Симулируем выполнение
        const simulation = PriceImpactCalculator.simulateManipulation(
          strategy,
          bestTarget.marketData
        );

        if (!simulation.success) {
          console.log('❌ Симуляция показала неуспешный результат');
          await this.sleep(30000);
          continue;
        }

        console.log(`\n🎯 Готов к выполнению манипуляции:`);
        console.log(`   🏆 Рынок: ${bestTarget.marketIndex}`);
        console.log(`   💰 Ожидаемая прибыль: $${simulation.finalProfit.toLocaleString()}`);
        console.log(`   📊 Движение цены: ${simulation.priceMovement} bps`);
        
        if (simulation.risks.length > 0) {
          console.log(`   ⚠️  Риски: ${simulation.risks.join(', ')}`);
        }

        // 5. Выполняем манипуляцию (в демо режиме)
        console.log('\n🔄 Выполнение манипуляции...');
        // const success = await this.executeManipulation(bestTarget.marketIndex, strategy);
        
        // В демо режиме просто показываем что произошло бы
        console.log('   ⚠️  В демо режиме манипуляция не выполняется');
        console.log('   💡 Для реального выполнения раскомментируйте строку executeManipulation');

        // Пауза между итерациями
        await this.sleep(300000); // 5 минут
        
      } catch (error) {
        console.error('❌ Ошибка в главном цикле:', error);
        await this.sleep(60000);
      }
    }
  }

  // Вспомогательные методы
  private async getUserTokenAccount(): Promise<PublicKey> {
    // Возвращаем мок адрес для демонстрации
    return this.wallet.publicKey;
  }

  private estimateLiquidityDepth(perpMarket: any): number {
    // Упрощенная оценка ликвидности на основе AMM
    const ammLiquidity = perpMarket.amm.sqrtK.toNumber() / 10**18;
    return ammLiquidity * 2; // Удваиваем для учета обеих сторон
  }

  private calculateVolatility(marketIndex: number): number {
    // Мок расчета волатильности
    // В реальности анализировал бы исторические данные
    return 0.025; // 2.5% часовая волатильность
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Запуск бота
if (require.main === module) {
  const bot = new PriceManipulationBot();
  bot.run().catch(console.error);
}