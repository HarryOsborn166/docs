use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount};

// Solend Flash Loan integration

#[derive(Clone)]
pub struct SolendProgram;

impl anchor_lang::Id for SolendProgram {
    fn id() -> Pubkey {
        // Solend Program ID on mainnet
        "So1endDq2YkqhipRh3WViPa8hdiSpxWy6z3Z6tMCpAo"
            .parse()
            .unwrap()
    }
}

pub struct FlashLoanParams {
    pub amount: u64,
    pub token_mint: Pubkey,
    pub callback_info: Pubkey,
}

pub fn initiate_flash_loan<'info>(
    lending_market: &AccountInfo<'info>,
    reserve: &AccountInfo<'info>,
    flash_loan_receiver: &AccountInfo<'info>,
    source_liquidity: &AccountInfo<'info>,
    destination_liquidity: &AccountInfo<'info>,
    reserve_liquidity_mint: &AccountInfo<'info>,
    token_program: &Program<'info, Token>,
    amount: u64,
) -> Result<()> {
    msg!("Initiating Solend flash loan for {} tokens", amount);
    
    // Build flash loan instruction
    let ix = solend_flash_loan_instruction(
        lending_market.key(),
        reserve.key(),
        flash_loan_receiver.key(),
        source_liquidity.key(),
        destination_liquidity.key(),
        amount,
    )?;
    
    // Invoke flash loan
    anchor_lang::solana_program::program::invoke(
        &ix,
        &[
            lending_market.clone(),
            reserve.clone(),
            flash_loan_receiver.clone(),
            source_liquidity.clone(),
            destination_liquidity.clone(),
            reserve_liquidity_mint.clone(),
            token_program.to_account_info(),
        ],
    )?;
    
    Ok(())
}

pub fn repay_flash_loan<'info>(
    lending_market: &AccountInfo<'info>,
    reserve: &AccountInfo<'info>,
    repay_reserve_liquidity: &AccountInfo<'info>,
    flash_loan_receiver: &AccountInfo<'info>,
    token_program: &Program<'info, Token>,
    amount: u64,
    fee: u64,
) -> Result<()> {
    let total_repay = amount
        .checked_add(fee)
        .ok_or(ProgramError::ArithmeticOverflow)?;
    
    msg!("Repaying flash loan: {} + {} fee = {} total", 
        amount, fee, total_repay);
    
    // Transfer tokens back to reserve
    token::transfer(
        CpiContext::new(
            token_program.to_account_info(),
            token::Transfer {
                from: flash_loan_receiver.clone(),
                to: repay_reserve_liquidity.clone(),
                authority: flash_loan_receiver.clone(),
            },
        ),
        total_repay,
    )?;
    
    Ok(())
}

fn solend_flash_loan_instruction(
    lending_market: &Pubkey,
    reserve: &Pubkey,
    receiver: &Pubkey,
    source_liquidity: &Pubkey,
    destination_liquidity: &Pubkey,
    amount: u64,
) -> Result<anchor_lang::solana_program::instruction::Instruction> {
    // Build Solend flash loan instruction
    // This is a simplified version - real implementation would use Solend's IDL
    
    let data = FlashLoanInstructionData {
        instruction: 14, // Flash loan instruction index in Solend
        amount,
    };
    
    Ok(anchor_lang::solana_program::instruction::Instruction {
        program_id: SolendProgram::id(),
        accounts: vec![
            AccountMeta::new(*lending_market, false),
            AccountMeta::new(*reserve, false),
            AccountMeta::new(*source_liquidity, false),
            AccountMeta::new(*destination_liquidity, false),
            AccountMeta::new(*receiver, true),
            AccountMeta::new_readonly(spl_token::id(), false),
        ],
        data: data.try_to_vec()?,
    })
}

#[derive(AnchorSerialize, AnchorDeserialize)]
struct FlashLoanInstructionData {
    instruction: u8,
    amount: u64,
}

// Flash loan fee calculation
pub fn calculate_flash_loan_fee(amount: u64) -> u64 {
    // Solend charges 0.3% flash loan fee
    amount
        .checked_mul(30)
        .and_then(|v| v.checked_div(10000))
        .unwrap_or(0)
}

// Helper to validate flash loan parameters
pub fn validate_flash_loan_params(
    amount: u64,
    available_liquidity: u64,
    max_flash_loan_amount: u64,
) -> Result<()> {
    require!(
        amount > 0,
        ProgramError::InvalidArgument
    );
    
    require!(
        amount <= available_liquidity,
        ProgramError::InsufficientFunds
    );
    
    require!(
        amount <= max_flash_loan_amount,
        ProgramError::InvalidArgument
    );
    
    Ok(())
}