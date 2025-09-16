use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use drift::cpi::accounts::*;
use drift::program::Drift;
use drift::state::*;

declare_id!("DRiFTArb1tRaGe11111111111111111111111111111");

#[program]
pub mod drift_arbitrage {
    use super::*;

    /// Выполняет арбитражную стратегию с флэш-займом
    /// Открывает две противоположные позиции с плечом в одной транзакции
    pub fn execute_flash_arbitrage(
        ctx: Context<ExecuteFlashArbitrage>,
        flash_loan_amount: u64,
        leverage_long: u64,
        leverage_short: u64,
        market_index_long: u16,
        market_index_short: u16,
    ) -> Result<()> {
        let user_key = ctx.accounts.user.key();
        let user_stats_key = ctx.accounts.user_stats.key();

        // 1. Получаем флэш-займ
        msg!("Initiating flash loan for {} tokens", flash_loan_amount);
        
        // 2. Разделяем средства для двух позиций
        let long_position_amount = flash_loan_amount / 2;
        let short_position_amount = flash_loan_amount / 2;

        // 3. Открываем длинную позицию с плечом
        msg!("Opening long position: amount={}, leverage={}", long_position_amount, leverage_long);
        
        let cpi_accounts_long = OpenPosition {
            state: ctx.accounts.drift_state.to_account_info(),
            user: ctx.accounts.user.to_account_info(),
            user_stats: ctx.accounts.user_stats.to_account_info(),
            authority: ctx.accounts.authority.to_account_info(),
        };
        let cpi_program_long = ctx.accounts.drift_program.to_account_info();
        let cpi_ctx_long = CpiContext::new(cpi_program_long, cpi_accounts_long);

        drift::cpi::open_position(
            cpi_ctx_long,
            PositionDirection::Long,
            long_position_amount * leverage_long,
            market_index_long,
            0, // base_asset_amount_limit
            0, // quote_asset_amount_limit
        )?;

        // 4. Открываем короткую позицию с плечом
        msg!("Opening short position: amount={}, leverage={}", short_position_amount, leverage_short);
        
        let cpi_accounts_short = OpenPosition {
            state: ctx.accounts.drift_state.to_account_info(),
            user: ctx.accounts.user.to_account_info(),
            user_stats: ctx.accounts.user_stats.to_account_info(),
            authority: ctx.accounts.authority.to_account_info(),
        };
        let cpi_program_short = ctx.accounts.drift_program.to_account_info();
        let cpi_ctx_short = CpiContext::new(cpi_program_short, cpi_accounts_short);

        drift::cpi::open_position(
            cpi_ctx_short,
            PositionDirection::Short,
            short_position_amount * leverage_short,
            market_index_short,
            0, // base_asset_amount_limit
            0, // quote_asset_amount_limit
        )?;

        // 5. Проверяем прибыльность позиций
        let user_account = &ctx.accounts.user;
        let total_pnl = calculate_total_pnl(user_account)?;
        
        require!(total_pnl > 0, ArbitrageError::UnprofitableArbitrage);

        // 6. Закрываем позиции если они прибыльны
        if total_pnl > flash_loan_amount / 100 { // минимум 1% прибыли
            close_positions(ctx.accounts, market_index_long, market_index_short)?;
        }

        // 7. Возвращаем флэш-займ
        msg!("Repaying flash loan");
        repay_flash_loan(&ctx, flash_loan_amount)?;

        msg!("Arbitrage completed successfully with PnL: {}", total_pnl);
        Ok(())
    }

    /// Экстренное закрытие позиций
    pub fn emergency_close(
        ctx: Context<EmergencyClose>,
        market_index_long: u16,
        market_index_short: u16,
    ) -> Result<()> {
        msg!("Emergency closing all positions");
        close_positions(ctx.accounts.into(), market_index_long, market_index_short)?;
        Ok(())
    }
}

/// Закрывает обе позиции
fn close_positions(
    accounts: &ExecuteFlashArbitrage,
    market_index_long: u16,
    market_index_short: u16,
) -> Result<()> {
    // Закрываем длинную позицию
    let cpi_accounts_close_long = ClosePosition {
        state: accounts.drift_state.to_account_info(),
        user: accounts.user.to_account_info(),
        authority: accounts.authority.to_account_info(),
    };
    let cpi_program_close = accounts.drift_program.to_account_info();
    let cpi_ctx_close_long = CpiContext::new(cpi_program_close.clone(), cpi_accounts_close_long);

    drift::cpi::close_position(cpi_ctx_close_long, market_index_long)?;

    // Закрываем короткую позицию
    let cpi_accounts_close_short = ClosePosition {
        state: accounts.drift_state.to_account_info(),
        user: accounts.user.to_account_info(),
        authority: accounts.authority.to_account_info(),
    };
    let cpi_ctx_close_short = CpiContext::new(cpi_program_close, cpi_accounts_close_short);

    drift::cpi::close_position(cpi_ctx_close_short, market_index_short)?;

    Ok(())
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

/// Возвращает флэш-займ
fn repay_flash_loan(ctx: &Context<ExecuteFlashArbitrage>, amount: u64) -> Result<()> {
    let transfer_instruction = Transfer {
        from: ctx.accounts.user_token_account.to_account_info(),
        to: ctx.accounts.flash_loan_vault.to_account_info(),
        authority: ctx.accounts.authority.to_account_info(),
    };

    let cpi_ctx = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        transfer_instruction,
    );

    token::transfer(cpi_ctx, amount)?;
    Ok(())
}

#[derive(Accounts)]
pub struct ExecuteFlashArbitrage<'info> {
    #[account(mut)]
    pub drift_state: Account<'info, State>,
    
    #[account(mut)]
    pub user: Account<'info, User>,
    
    #[account(mut)]
    pub user_stats: Account<'info, UserStats>,
    
    #[account(mut)]
    pub user_token_account: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub flash_loan_vault: Account<'info, TokenAccount>,
    
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

#[error_code]
pub enum ArbitrageError {
    #[msg("Arbitrage opportunity is not profitable")]
    UnprofitableArbitrage,
    #[msg("Insufficient funds for flash loan repayment")]
    InsufficientFunds,
    #[msg("Position size exceeds maximum allowed")]
    PositionSizeExceeded,
    #[msg("Market conditions are unfavorable")]
    UnfavorableMarketConditions,
}