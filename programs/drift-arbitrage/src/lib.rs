use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use drift::cpi::accounts::*;
use drift::program::Drift;
use drift::state::*;

declare_id!("DRiFTPuMP11111111111111111111111111111111111");

#[program]
pub mod drift_arbitrage {
    use super::*;

    /// Выполняет манипуляцию цены через две позиции разного размера
    /// Основная позиция + манипулятивная позиция в одной транзакции
    pub fn execute_price_manipulation(
        ctx: Context<ExecutePriceManipulation>,
        main_position_amount: u64,      // Основная позиция (например $1M)
        main_leverage: u64,             // Плечо основной позиции (например 10x)
        pump_position_amount: u64,      // Манипулятивная позиция (например $100K)  
        pump_leverage: u64,             // Плечо манипулятивной позиции (например 20x)
        market_index: u16,              // Индекс рынка для манипуляции
        target_price_move: u64,         // Целевое движение цены в базисных пунктах
    ) -> Result<()> {
        let user_key = ctx.accounts.user.key();
        
        msg!("🎯 Starting price manipulation strategy");
        msg!("Main position: ${} with {}x leverage", main_position_amount, main_leverage);
        msg!("Pump position: ${} with {}x leverage", pump_position_amount, pump_leverage);

        // Получаем текущую цену для расчета прибыли
        let initial_price = get_current_market_price(&ctx, market_index)?;
        msg!("Initial price: ${}", initial_price);

        // 1. Открываем ОСНОВНУЮ позицию (Long) - она будет получать прибыль
        msg!("📈 Opening MAIN Long position");
        let main_position_size = main_position_amount * main_leverage;
        
        let cpi_accounts_main = OpenPosition {
            state: ctx.accounts.drift_state.to_account_info(),
            user: ctx.accounts.user.to_account_info(),
            user_stats: ctx.accounts.user_stats.to_account_info(),
            authority: ctx.accounts.authority.to_account_info(),
        };
        let cpi_program_main = ctx.accounts.drift_program.to_account_info();
        let cpi_ctx_main = CpiContext::new(cpi_program_main.clone(), cpi_accounts_main);

        drift::cpi::open_position(
            cpi_ctx_main,
            PositionDirection::Long,
            main_position_size,
            market_index,
            0, // base_asset_amount_limit
            0, // quote_asset_amount_limit
        )?;

        // 2. Открываем МАНИПУЛЯТИВНУЮ позицию (Long) - она двигает цену вверх
        msg!("🚀 Opening PUMP Long position to move price up");
        let pump_position_size = pump_position_amount * pump_leverage;
        
        let cpi_accounts_pump = OpenPosition {
            state: ctx.accounts.drift_state.to_account_info(),
            user: ctx.accounts.user.to_account_info(),
            user_stats: ctx.accounts.user_stats.to_account_info(),
            authority: ctx.accounts.authority.to_account_info(),
        };
        let cpi_ctx_pump = CpiContext::new(cpi_program_main.clone(), cpi_accounts_pump);

        drift::cpi::open_position(
            cpi_ctx_pump,
            PositionDirection::Long,
            pump_position_size,
            market_index,
            0, // base_asset_amount_limit
            0, // quote_asset_amount_limit
        )?;

        // 3. Проверяем движение цены
        let new_price = get_current_market_price(&ctx, market_index)?;
        let price_change = ((new_price as i64 - initial_price as i64) * 10000) / initial_price as i64;
        msg!("New price: ${}, Price change: {} bps", new_price, price_change);

        // 4. Проверяем достигли ли целевого движения цены
        require!(
            price_change >= target_price_move as i64, 
            ManipulationError::InsufficientPriceMovement
        );

        // 5. Рассчитываем прибыль основной позиции
        let main_position_profit = calculate_position_profit(
            main_position_size,
            initial_price,
            new_price
        )?;
        
        msg!("💰 Main position profit: ${}", main_position_profit);

        // 6. Если прибыль достаточная, закрываем позиции
        let min_profit_threshold = main_position_amount / 20; // 5% от основной позиции
        if main_position_profit > min_profit_threshold {
            msg!("✅ Target profit reached, closing positions");
            
            // Сначала закрываем манипулятивную позицию
            close_position(&ctx, market_index, 1)?; // 1 = вторая позиция
            
            // Затем закрываем основную позицию с прибылью
            close_position(&ctx, market_index, 0)?; // 0 = первая позиция
        }

        msg!("🎉 Price manipulation completed successfully!");
        msg!("Total profit: ${}", main_position_profit);
        
        Ok(())
    }

    /// Быстрое закрытие всех позиций при неблагоприятной ситуации
    pub fn emergency_close_all(
        ctx: Context<EmergencyClose>,
        market_index: u16,
    ) -> Result<()> {
        msg!("🚨 Emergency closing all positions on market {}", market_index);
        
        // Закрываем все позиции на данном рынке
        let user_account = &ctx.accounts.user;
        let positions = &user_account.perp_positions;
        
        for (i, position) in positions.iter().enumerate() {
            if position.market_index == market_index && position.base_asset_amount != 0 {
                close_position_by_index(&ctx, market_index, i as u8)?;
            }
        }
        
        msg!("✅ All positions closed");
        Ok(())
    }

    /// Продвинутая манипуляция с несколькими волнами
    pub fn execute_layered_manipulation(
        ctx: Context<ExecutePriceManipulation>,
        main_position_amount: u64,
        main_leverage: u64,
        pump_waves: Vec<PumpWave>,  // Несколько волн манипуляции
        market_index: u16,
        target_price_move: u64,
    ) -> Result<()> {
        msg!("🌊 Starting layered price manipulation with {} waves", pump_waves.len());
        
        let initial_price = get_current_market_price(&ctx, market_index)?;
        
        // 1. Открываем основную позицию
        let main_position_size = main_position_amount * main_leverage;
        open_position_internal(&ctx, PositionDirection::Long, main_position_size, market_index)?;
        
        // 2. Выполняем волны манипуляции
        for (i, wave) in pump_waves.iter().enumerate() {
            msg!("🚀 Executing pump wave {}: ${} with {}x leverage", 
                 i + 1, wave.amount, wave.leverage);
            
            let wave_size = wave.amount * wave.leverage;
            open_position_internal(&ctx, PositionDirection::Long, wave_size, market_index)?;
            
            // Небольшая задержка между волнами (в реальности через разные слоты)
            // В одной транзакции это будет мгновенно
        }
        
        // 3. Проверяем итоговое движение цены
        let final_price = get_current_market_price(&ctx, market_index)?;
        let total_price_change = ((final_price as i64 - initial_price as i64) * 10000) / initial_price as i64;
        
        msg!("📊 Total price movement: {} bps (target: {} bps)", 
             total_price_change, target_price_move);
        
        require!(
            total_price_change >= target_price_move as i64,
            ManipulationError::InsufficientPriceMovement
        );
        
        // 4. Рассчитываем и фиксируем прибыль
        let profit = calculate_position_profit(main_position_size, initial_price, final_price)?;
        msg!("💰 Total profit from manipulation: ${}", profit);
        
        Ok(())
    }
}

/// Получает текущую цену рынка
fn get_current_market_price(ctx: &Context<ExecutePriceManipulation>, market_index: u16) -> Result<u64> {
    // В реальной реализации получаем цену из Oracle
    // Здесь используем мок значение
    let base_price = 45000; // $45,000 для примера (SOL/USD)
    Ok(base_price)
}

/// Открывает позицию (внутренняя функция)
fn open_position_internal(
    ctx: &Context<ExecutePriceManipulation>,
    direction: PositionDirection,
    size: u64,
    market_index: u16,
) -> Result<()> {
    let cpi_accounts = OpenPosition {
        state: ctx.accounts.drift_state.to_account_info(),
        user: ctx.accounts.user.to_account_info(),
        user_stats: ctx.accounts.user_stats.to_account_info(),
        authority: ctx.accounts.authority.to_account_info(),
    };
    let cpi_program = ctx.accounts.drift_program.to_account_info();
    let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);

    drift::cpi::open_position(
        cpi_ctx,
        direction,
        size,
        market_index,
        0, // base_asset_amount_limit
        0, // quote_asset_amount_limit
    )?;

    Ok(())
}

/// Закрывает конкретную позицию
fn close_position(ctx: &Context<ExecutePriceManipulation>, market_index: u16, position_index: u8) -> Result<()> {
    let cpi_accounts = ClosePosition {
        state: ctx.accounts.drift_state.to_account_info(),
        user: ctx.accounts.user.to_account_info(),
        authority: ctx.accounts.authority.to_account_info(),
    };
    let cpi_program = ctx.accounts.drift_program.to_account_info();
    let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);

    drift::cpi::close_position(cpi_ctx, market_index)?;
    Ok(())
}

/// Закрывает позицию по индексу (для экстренного закрытия)
fn close_position_by_index(ctx: &Context<EmergencyClose>, market_index: u16, position_index: usize) -> Result<()> {
    let cpi_accounts = ClosePosition {
        state: ctx.accounts.drift_state.to_account_info(),
        user: ctx.accounts.user.to_account_info(),
        authority: ctx.accounts.authority.to_account_info(),
    };
    let cpi_program = ctx.accounts.drift_program.to_account_info();
    let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);

    drift::cpi::close_position(cpi_ctx, market_index)?;
    Ok(())
}

/// Рассчитывает прибыль позиции
fn calculate_position_profit(position_size: u64, entry_price: u64, current_price: u64) -> Result<u64> {
    if current_price > entry_price {
        let price_diff = current_price - entry_price;
        let profit = (position_size * price_diff) / entry_price;
        Ok(profit)
    } else {
        Ok(0) // Убыток не считаем как прибыль
    }
}

/// Рассчитывает общий PnL по всем позициям
fn calculate_total_pnl(user_account: &Account<User>) -> Result<i64> {
    let mut total_pnl: i64 = 0;
    
    for position in &user_account.perp_positions {
        if position.base_asset_amount != 0 {
            total_pnl += position.quote_asset_amount;
        }
    }
    
    Ok(total_pnl)
}

/// Рассчитывает воздействие на цену от сделки
fn calculate_price_impact(trade_size: u64, market_liquidity: u64) -> u64 {
    // Упрощенная формула воздействия на цену
    // В реальности зависит от кривой AMM и глубины рынка
    let impact_factor = 100; // 0.01% базовое воздействие
    let impact = (trade_size * impact_factor) / market_liquidity;
    impact.min(1000) // Максимум 10% воздействие
}

/// Проверяет достаточность ликвидности для манипуляции
fn check_liquidity_sufficiency(market_index: u16, required_impact: u64) -> Result<bool> {
    // Мок проверки ликвидности
    // В реальности анализировал бы order book и AMM состояние
    let market_liquidity = 50_000_000; // $50M ликвидности
    let min_liquidity_ratio = 20; // Минимум 5% от ликвидности
    
    Ok(required_impact < market_liquidity / min_liquidity_ratio)
}

#[derive(Accounts)]
pub struct ExecutePriceManipulation<'info> {
    #[account(mut)]
    pub drift_state: Account<'info, State>,
    
    #[account(mut)]
    pub user: Account<'info, User>,
    
    #[account(mut)]
    pub user_stats: Account<'info, UserStats>,
    
    #[account(mut)]
    pub user_token_account: Account<'info, TokenAccount>,
    
    pub authority: Signer<'info>,
    pub drift_program: Program<'info, Drift>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct EmergencyClose<'info> {
    #[account(mut)]
    pub drift_state: Account<'info, State>,
    
    #[account(mut)]
    pub user: Account<'info, User>,
    
    pub authority: Signer<'info>,
    pub drift_program: Program<'info, Drift>,
}

// Структуры для CPI вызовов к Drift
#[derive(Accounts)]
pub struct OpenPosition<'info> {
    pub state: AccountInfo<'info>,
    pub user: AccountInfo<'info>,
    pub user_stats: AccountInfo<'info>,
    pub authority: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct ClosePosition<'info> {
    pub state: AccountInfo<'info>,
    pub user: AccountInfo<'info>,
    pub authority: AccountInfo<'info>,
}

// Структуры данных для манипуляций

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct PumpWave {
    pub amount: u64,    // Размер волны в USD
    pub leverage: u64,  // Плечо для этой волны
    pub delay: u16,     // Задержка в слотах (для многотранзакционных стратегий)
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct ManipulationParams {
    pub main_position_size: u64,     // Размер основной позиции
    pub main_leverage: u64,          // Плечо основной позиции
    pub pump_position_size: u64,     // Размер манипулятивной позиции
    pub pump_leverage: u64,          // Плечо манипулятивной позиции
    pub target_price_move_bps: u64,  // Целевое движение цены в базисных пунктах
    pub max_slippage_bps: u64,       // Максимальное проскальзывание
    pub profit_target_bps: u64,      // Целевая прибыль в базисных пунктах
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct MarketConditions {
    pub current_price: u64,
    pub liquidity_depth: u64,
    pub volatility: u16,
    pub funding_rate: i64,
    pub open_interest: u64,
}

#[error_code]
pub enum ManipulationError {
    #[msg("Price movement was insufficient for profitable manipulation")]
    InsufficientPriceMovement,
    #[msg("Market liquidity is too low for safe manipulation")]
    InsufficientLiquidity,
    #[msg("Position size exceeds maximum allowed for manipulation")]
    PositionSizeExceeded,
    #[msg("Market conditions are unfavorable for manipulation")]
    UnfavorableMarketConditions,
    #[msg("Slippage exceeded maximum tolerance")]
    ExcessiveSlippage,
    #[msg("Manipulation profit target not reached")]
    ProfitTargetNotReached,
    #[msg("Risk limits exceeded during manipulation")]
    RiskLimitsExceeded,
}