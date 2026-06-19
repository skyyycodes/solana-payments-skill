# Accepting Any Token (Auto-Swap to USDC)

> Customers hold many different tokens; your accounting wants **one** (usually USDC). Instead of forcing buyers to swap first, accept what they hold and convert it to your settlement asset **inside the payment flow** using an aggregator like Jupiter. The customer pays in TOKEN-X; you receive USDC; verification still happens on the USDC you actually got.

## Two models

1. **Customer swaps, then pays (recommended for most):** the customer's wallet swaps TOKEN-X → USDC and pays you USDC in one transaction (Jupiter can compose the swap + transfer). You only ever verify a **USDC** payment with your reference — your settle logic from [verifying-payments.md](verifying-payments.md) is unchanged.
2. **You accept TOKEN-X and swap on receipt:** you take the customer's token directly, then swap it to USDC yourself. Simpler UX, but you carry **price/slippage risk** between receipt and swap, and must verify the inbound token's mint + amount. Prefer model 1 unless you have a reason.

## Getting a quote + swap (Jupiter)

```typescript
// 1. Quote: how much USDC for the customer's TOKEN-X input?
const quote = await fetch(
  `https://quote-api.jup.ag/v6/quote?inputMint=${tokenX}&outputMint=${usdcMint}` +
  `&amount=${amountInBaseUnits}&slippageBps=50`,                 // cap slippage explicitly
).then((r) => r.json());

// 2. Build the swap transaction for the customer to sign.
const { swapTransaction } = await fetch('https://quote-api.jup.ag/v6/swap', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ quoteResponse: quote, userPublicKey: customer.toBase58() }),
}).then((r) => r.json());
// deserialize, (optionally compose with your USDC transfer to the merchant), sign, and
// land via solana-tx-skill.
```

> API surface evolves — confirm the current Jupiter endpoints/params in [resources.md](resources.md) before wiring it in.

## The hard part: price & slippage

- **Always set a slippage cap** (`slippageBps`). Without it, a thin-liquidity token can fill at a terrible rate.
- **Quote at checkout, treat it as time-bounded.** A quote is a moment-in-time price; re-quote if the customer takes too long (see [pricing-oracles.md](pricing-oracles.md) for TTLs).
- **Verify the OUTPUT, not the input.** What matters is that you received the expected **USDC** amount of the correct mint with your reference — verify that, not the token the customer started with.
- **Beware low-liquidity / fee-on-transfer / Token-2022 tokens.** Some tokens take a transfer fee or have no real market. Decide an allowlist of acceptable input tokens rather than "literally anything."

## Verifying

In **model 1**, verification is identical to a normal USDC payment — you got USDC, with your reference, for the expected amount. In **model 2**, verify the inbound TOKEN-X transfer (mint + amount + reference) at the value you quoted, then run your own swap as a separate, idempotent step keyed to the order.

## Pitfalls

| Pitfall | Consequence | Fix |
|---------|-------------|-----|
| No slippage cap | Fills at a bad rate | Set `slippageBps` |
| Reusing a stale quote | Customer over/underpays | Quote TTL + re-quote |
| Verifying the input token | Credited the wrong value | Verify the USDC you received |
| Accepting any mint blindly | Junk / fee-on-transfer tokens | Allowlist input tokens |
| You hold the token, then swap | Price risk while you hold it | Prefer customer-side swap (model 1) |

## How this fits

This sits in front of the normal pipeline: once the swap lands you're back to a standard USDC payment verified via [verifying-payments.md](verifying-payments.md), built per [usdc-payments.md](usdc-payments.md), landed by [solana-tx-skill](https://github.com/skyyycodes/solana-tx-skill). For fiat-denominated pricing of the quote, pair with [pricing-oracles.md](pricing-oracles.md).
