import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider, Wallet } from "@coral-xyz/anchor";
import { 
  Connection, 
  PublicKey, 
  Keypair,
  SystemProgram,
  SYSVAR_RENT_PUBKEY
} from "@solana/web3.js";
import { 
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction
} from "@solana/spl-token";
import { DriftClient, initialize, User, UserMap, PerpMarkets } from "@drift-labs/sdk";
import { DriftArbitrage } from "../target/types/drift_arbitrage";
import * as dotenv from "dotenv";
import BN from "bn.js";

dotenv.config();

export class ArbitrageBot {
  private connection: Connection;
  private provider: AnchorProvider;
  private program: Program<DriftArbitrage>;
  private driftClient: DriftClient;
  private wallet: Wallet;
  private user: User;
  
  constructor() {
    // Инициализация соединения с Solana
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

    // Инициализация провайдера
    this.provider = new AnchorProvider(
      this.connection,
      this.wallet,
      { commitment: "confirmed" }
    );
    anchor.setProvider(this.provider);

    // Инициализация программы
    const programId = new PublicKey(process.env.PROGRAM_ID!);
    this.program = anchor.workspace.DriftArbitrage as Program<DriftArbitrage>;
  }

  /**
   * Инициализация Drift клиента
   */
  async initializeDriftClient(): Promise<void> {
    console.log("🚀 Инициализация Drift клиента...");
    
    this.driftClient = new DriftClient({
      connection: this.connection,
      wallet: this.wallet,
      programID: new PublicKey(process.env.DRIFT_PROGRAM_ID!),
      env: process.env.DRIFT_ENV as any || "devnet",
    });

    await this.driftClient.subscribe();
    
    // Создаем пользователя если его нет
    try {
      this.user = this.driftClient.getUser();
      await this.user.subscribe();
    } catch (error) {
      console.log("Создание нового пользователя Drift...");
      await this.driftClient.initializeUser();
      this.user = this.driftClient.getUser();
      await this.user.subscribe();
    }

    console.log("✅ Drift клиент инициализирован");
  }

  /**
   * Поиск арбитражных возможностей
   */
  async findArbitrageOpportunities(): Promise<ArbitrageOpportunity[]> {
    const opportunities: ArbitrageOpportunity[] = [];
    
    // Получаем данные о рынках
    const perpMarkets = this.driftClient.getPerpMarketAccounts();
    const spotMarkets = this.driftClient.getSpotMarketAccounts();

    for (let i = 0; i < perpMarkets.length; i++) {
      const perpMarket = perpMarkets[i];
      const spotMarket = spotMarkets.find(s => s.marketIndex === perpMarket.marketIndex);
      
      if (!spotMarket) continue;

      // Рассчитываем разницу цен между спотом и фьючерсами
      const perpPrice = this.driftClient.getOracleDataForPerpMarket(perpMarket.marketIndex);
      const spotPrice = this.driftClient.getOracleDataForSpotMarket(spotMarket.marketIndex);
      
      if (!perpPrice || !spotPrice) continue;

      const priceDiff = Math.abs(perpPrice.price.toNumber() - spotPrice.price.toNumber());
      const priceSpread = priceDiff / spotPrice.price.toNumber();

      // Проверяем минимальный порог прибыльности
      const minProfitThreshold = parseFloat(process.env.MIN_PROFIT_THRESHOLD || "0.01");
      
      if (priceSpread > minProfitThreshold) {
        opportunities.push({
          marketIndexLong: perpPrice.price.lt(spotPrice.price) ? perpMarket.marketIndex : spotMarket.marketIndex,
          marketIndexShort: perpPrice.price.gt(spotPrice.price) ? perpMarket.marketIndex : spotMarket.marketIndex,
          priceSpread,
          expectedProfit: priceSpread * 0.8, // 80% от спреда как ожидаемая прибыль
          longPrice: Math.min(perpPrice.price.toNumber(), spotPrice.price.toNumber()),
          shortPrice: Math.max(perpPrice.price.toNumber(), spotPrice.price.toNumber()),
        });
      }
    }

    return opportunities.sort((a, b) => b.expectedProfit - a.expectedProfit);
  }

  /**
   * Выполнение арбитражной сделки
   */
  async executeArbitrage(opportunity: ArbitrageOpportunity): Promise<boolean> {
    try {
      console.log(`🔄 Выполнение арбитража: спред ${(opportunity.priceSpread * 100).toFixed(2)}%`);

      const maxPositionSize = parseFloat(process.env.MAX_POSITION_SIZE || "1000");
      const maxLeverage = parseInt(process.env.MAX_LEVERAGE || "10");
      
      // Рассчитываем размер флэш-займа
      const flashLoanAmount = new BN(maxPositionSize * 10**6); // USDC имеет 6 десятичных знаков
      
      // Получаем аккаунты
      const [userTokenAccount] = await PublicKey.findProgramAddress(
        [this.wallet.publicKey.toBuffer(), TOKEN_PROGRAM_ID.toBuffer()],
        TOKEN_PROGRAM_ID
      );

      const [flashLoanVault] = await PublicKey.findProgramAddress(
        [Buffer.from("flash_loan_vault")],
        this.program.programId
      );

      // Выполняем транзакцию
      const tx = await this.program.methods
        .executeFlashArbitrage(
          flashLoanAmount,
          new BN(maxLeverage),
          new BN(maxLeverage),
          opportunity.marketIndexLong,
          opportunity.marketIndexShort
        )
        .accounts({
          driftState: this.driftClient.getStateAccount(),
          user: this.user.getUserAccount(),
          userStats: this.user.getUserStatsAccount(),
          userTokenAccount,
          flashLoanVault,
          authority: this.wallet.publicKey,
          driftProgram: this.driftClient.program.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      console.log(`✅ Арбитраж выполнен: ${tx}`);
      
      // Ждем подтверждения
      await this.connection.confirmTransaction(tx);
      
      return true;
    } catch (error) {
      console.error("❌ Ошибка выполнения арбитража:", error);
      return false;
    }
  }

  /**
   * Экстренное закрытие позиций
   */
  async emergencyClose(marketIndexLong: number, marketIndexShort: number): Promise<void> {
    try {
      console.log("🚨 Экстренное закрытие позиций...");
      
      const tx = await this.program.methods
        .emergencyClose(marketIndexLong, marketIndexShort)
        .accounts({
          driftState: this.driftClient.getStateAccount(),
          user: this.user.getUserAccount(),
          authority: this.wallet.publicKey,
          driftProgram: this.driftClient.program.programId,
        })
        .rpc();

      await this.connection.confirmTransaction(tx);
      console.log(`✅ Позиции закрыты: ${tx}`);
    } catch (error) {
      console.error("❌ Ошибка экстренного закрытия:", error);
    }
  }

  /**
   * Мониторинг позиций и рисков
   */
  async monitorPositions(): Promise<void> {
    const positions = this.user.getPerpPositions();
    const totalPnl = positions.reduce((sum, pos) => {
      return sum + pos.getUnrealizedPnl(this.driftClient.getOracleDataForPerpMarket(pos.marketIndex)!).toNumber();
    }, 0);

    const maxDailyLoss = parseFloat(process.env.MAX_DAILY_LOSS || "100");
    const stopLossPercentage = parseFloat(process.env.STOP_LOSS_PERCENTAGE || "0.05");

    // Проверяем стоп-лосс
    if (Math.abs(totalPnl) > maxDailyLoss) {
      console.log(`🛑 Превышен дневной лимит убытков: ${totalPnl}`);
      // Закрываем все позиции
      for (const position of positions) {
        if (position.baseAssetAmount.toNumber() !== 0) {
          await this.emergencyClose(position.marketIndex, position.marketIndex);
        }
      }
    }

    console.log(`💰 Текущий PnL: $${totalPnl.toFixed(2)}`);
  }

  /**
   * Главный цикл бота
   */
  async run(): Promise<void> {
    console.log("🤖 Запуск арбитражного бота...");
    
    await this.initializeDriftClient();
    
    while (true) {
      try {
        // Поиск возможностей
        const opportunities = await this.findArbitrageOpportunities();
        
        if (opportunities.length > 0) {
          console.log(`🎯 Найдено ${opportunities.length} арбитражных возможностей`);
          
          // Выполняем лучшую возможность
          const bestOpportunity = opportunities[0];
          await this.executeArbitrage(bestOpportunity);
        }

        // Мониторинг текущих позиций
        await this.monitorPositions();

        // Пауза перед следующей итерацией
        await new Promise(resolve => setTimeout(resolve, 5000));
        
      } catch (error) {
        console.error("❌ Ошибка в главном цикле:", error);
        await new Promise(resolve => setTimeout(resolve, 10000));
      }
    }
  }
}

// Интерфейсы
interface ArbitrageOpportunity {
  marketIndexLong: number;
  marketIndexShort: number;
  priceSpread: number;
  expectedProfit: number;
  longPrice: number;
  shortPrice: number;
}

// Запуск бота
if (require.main === module) {
  const bot = new ArbitrageBot();
  bot.run().catch(console.error);
}