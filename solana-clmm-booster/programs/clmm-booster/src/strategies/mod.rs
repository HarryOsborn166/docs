pub mod orca_whirlpool;
pub mod raydium_clmm;
pub mod kamino_finance;
pub mod solend_flash;

use anchor_lang::prelude::*;

pub trait CLMMStrategy {
    fn add_liquidity(
        position: &AccountInfo,
        token_a: &AccountInfo,
        token_b: &AccountInfo,
        amount_a: u64,
        amount_b: u64,
    ) -> Result<u64>;
    
    fn remove_liquidity(
        position: &AccountInfo,
        liquidity: u64,
    ) -> Result<(u64, u64)>;
    
    fn harvest_fees(
        position: &AccountInfo,
    ) -> Result<(u64, u64)>;
    
    fn get_position_value(
        position: &AccountInfo,
    ) -> Result<(u64, u64)>;
}