//! Reference on-chain subscription program (Anchor).
//!
//! Why this exists: a bare SPL token delegate has NO concept of time, so a relayer that
//! holds the delegate could pull the entire approved cap at once. This program is the
//! delegate instead — a PDA — and its `charge` instruction enforces BOTH:
//!   * the cadence  (now >= last_charged + period_secs)
//!   * the amount   (exactly `amount` per charge, bounded by the customer's approval)
//!
//! Flow:
//!   1. create_subscription  — customer creates the on-chain plan.
//!   2. customer approves the subscription PDA as delegate on their token account
//!      (client-side `approveChecked`, capped). The PDA can now move up to the cap.
//!   3. charge  — anyone may crank; the program enforces schedule + amount and CPIs
//!      transfer_checked using the PDA as authority.
//!   4. cancel  — customer deactivates; client also `revoke`s the delegate.
//!
//! This is REFERENCE source. Build with the Anchor toolchain (`anchor build`) and replace
//! the program id. Pair with solana-payments-skill `skill/subscriptions.md`.

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, TransferChecked};

declare_id!("Sub11111111111111111111111111111111111111111");

#[program]
pub mod subscription {
    use super::*;

    /// Create a subscription plan. Seeds bind it to (customer, merchant, mint).
    pub fn create_subscription(
        ctx: Context<CreateSubscription>,
        amount: u64,
        period_secs: i64,
    ) -> Result<()> {
        require!(amount > 0, SubError::InvalidAmount);
        require!(period_secs > 0, SubError::InvalidPeriod);

        let sub = &mut ctx.accounts.subscription;
        sub.customer = ctx.accounts.customer.key();
        sub.merchant = ctx.accounts.merchant.key();
        sub.mint = ctx.accounts.mint.key();
        sub.amount = amount;
        sub.period_secs = period_secs;
        // Allow the first charge immediately.
        sub.last_charged = 0;
        sub.active = true;
        sub.bump = ctx.bumps.subscription;
        Ok(())
    }

    /// Charge one period. Permissionless crank — safety comes from the on-chain checks.
    pub fn charge(ctx: Context<Charge>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;

        // Read immutable fields before taking a mutable borrow for the CPI signer seeds.
        let (amount, period_secs, last_charged, active, bump) = {
            let sub = &ctx.accounts.subscription;
            (sub.amount, sub.period_secs, sub.last_charged, sub.active, sub.bump)
        };

        require!(active, SubError::Inactive);
        // Cadence: enforce one charge per period. (last_charged == 0 => first charge allowed.)
        require!(can_charge(last_charged, period_secs, now), SubError::TooEarly);

        let customer_key = ctx.accounts.subscription.customer;
        let merchant_key = ctx.accounts.subscription.merchant;
        let mint_key = ctx.accounts.subscription.mint;
        let signer_seeds: &[&[&[u8]]] = &[&[
            b"sub",
            customer_key.as_ref(),
            merchant_key.as_ref(),
            mint_key.as_ref(),
            &[bump],
        ]];

        let cpi = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.customer_ata.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.merchant_ata.to_account_info(),
                authority: ctx.accounts.subscription.to_account_info(),
            },
            signer_seeds,
        );
        token::transfer_checked(cpi, amount, ctx.accounts.mint.decimals)?;

        // Advance the clock. Anchor `now` if we were behind by more than one period to avoid drift bursts.
        let sub = &mut ctx.accounts.subscription;
        sub.last_charged = now;
        Ok(())
    }

    /// Deactivate the subscription. Customer should also `revoke` the delegate client-side.
    pub fn cancel(ctx: Context<Cancel>) -> Result<()> {
        ctx.accounts.subscription.active = false;
        Ok(())
    }
}

/// Pure cadence rule (no Anchor context) so it can be unit-tested with `cargo test`.
/// `last_charged == 0` means "never charged" → the first charge is always allowed.
/// Mirrors the off-chain `canChargeNow` helper so on-chain and off-chain agree exactly.
pub fn can_charge(last_charged: i64, period_secs: i64, now: i64) -> bool {
    last_charged == 0 || now >= last_charged.saturating_add(period_secs)
}

#[derive(Accounts)]
pub struct CreateSubscription<'info> {
    #[account(mut)]
    pub customer: Signer<'info>,
    /// CHECK: merchant is only used as a seed + stored key; not read.
    pub merchant: UncheckedAccount<'info>,
    pub mint: Account<'info, Mint>,
    #[account(
        init,
        payer = customer,
        space = 8 + Subscription::SPACE,
        seeds = [b"sub", customer.key().as_ref(), merchant.key().as_ref(), mint.key().as_ref()],
        bump
    )]
    pub subscription: Account<'info, Subscription>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Charge<'info> {
    #[account(
        mut,
        seeds = [b"sub", subscription.customer.as_ref(), subscription.merchant.as_ref(), subscription.mint.as_ref()],
        bump = subscription.bump,
    )]
    pub subscription: Account<'info, Subscription>,
    pub mint: Account<'info, Mint>,
    #[account(mut, constraint = customer_ata.mint == subscription.mint @ SubError::WrongMint)]
    pub customer_ata: Account<'info, TokenAccount>,
    #[account(mut, constraint = merchant_ata.mint == subscription.mint @ SubError::WrongMint)]
    pub merchant_ata: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct Cancel<'info> {
    #[account(
        mut,
        has_one = customer @ SubError::Unauthorized,
        seeds = [b"sub", subscription.customer.as_ref(), subscription.merchant.as_ref(), subscription.mint.as_ref()],
        bump = subscription.bump,
    )]
    pub subscription: Account<'info, Subscription>,
    pub customer: Signer<'info>,
}

#[account]
pub struct Subscription {
    pub customer: Pubkey,
    pub merchant: Pubkey,
    pub mint: Pubkey,
    pub amount: u64,
    pub period_secs: i64,
    pub last_charged: i64,
    pub active: bool,
    pub bump: u8,
}

impl Subscription {
    pub const SPACE: usize = 32 + 32 + 32 + 8 + 8 + 8 + 1 + 1;
}

#[error_code]
pub enum SubError {
    #[msg("Amount must be greater than zero")]
    InvalidAmount,
    #[msg("Period must be greater than zero")]
    InvalidPeriod,
    #[msg("Subscription is not active")]
    Inactive,
    #[msg("Too early to charge again for this period")]
    TooEarly,
    #[msg("Token account mint does not match the subscription")]
    WrongMint,
    #[msg("Only the customer can perform this action")]
    Unauthorized,
}

#[cfg(test)]
mod tests {
    use super::can_charge;

    const DAY: i64 = 86_400;
    const PERIOD: i64 = 30 * DAY;

    #[test]
    fn first_charge_is_always_allowed() {
        assert!(can_charge(0, PERIOD, 1_000));
    }

    #[test]
    fn rejects_a_second_charge_within_the_period() {
        let last = 1_000_000;
        assert!(!can_charge(last, PERIOD, last + DAY));
    }

    #[test]
    fn allows_the_next_charge_once_the_period_elapsed() {
        let last = 1_000_000;
        assert!(can_charge(last, PERIOD, last + PERIOD));
        assert!(can_charge(last, PERIOD, last + PERIOD + 1));
    }

    #[test]
    fn saturating_add_guards_against_overflow() {
        // A pathological period must not panic or wrap into "allowed".
        assert!(!can_charge(i64::MAX - 1, i64::MAX, 0));
    }
}
