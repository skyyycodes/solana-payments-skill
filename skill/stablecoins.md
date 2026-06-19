# Stablecoin Landscape (USDC, PYUSD, EURC, USDe — not just USDC)

> USDC is the default, but real merchants want **PYUSD** (PayPal's reach), **EURC** (euro pricing), and yield-bearing dollars like **USDe**. Accepting more than one stablecoin is mostly about two disciplines you already know: **pin the exact mint per cluster** (fake-token attacks are trivial) and **know the token program** (PYUSD is Token-2022, so transfer-fee/extension rules apply).

## The registry (pin every mint, verify from the issuer)

Runnable, type-checked registry: [examples/src/stablecoins.ts](../examples/src/stablecoins.ts). `getMintAddress(symbol, cluster)` **throws rather than guesses** when a mint isn't pinned — that's the safe behavior.

| Symbol | Issuer | Decimals | Token program | Notes |
|--------|--------|----------|---------------|-------|
| **USDC** | Circle | 6 | SPL Token | The default. Mainnet + devnet pinned & verified |
| **PYUSD** | Paxos / PayPal | 6 | **Token-2022** | Apply [token-2022 rules](token-2022-payments.md): resolve the owning program, quote net-of-fee |
| **EURC** | Circle | 6 | SPL Token | Euro-denominated; pair with [pricing-oracles.md](pricing-oracles.md) for EUR↔token |
| **USDe** | Ethena | (verify) | (verify) | Yield-bearing "dollar"; confirm mint + decimals from the issuer before use |

> **`selfVerifyRequired`:** only USDC is marked verified in the registry. For every other symbol, **confirm the exact mint and decimals from the issuer's docs** (linked via `confirmFrom`) before mainnet use. Never copy a mint from a random source.

## What changes when you accept multiple stablecoins

| Concern | What to do |
|---------|------------|
| **Mint pinning** | One canonical address per (symbol, cluster). Reject anything else, even if it's named "USDC" |
| **Token program** | USDC/EURC = classic SPL Token; PYUSD = Token-2022. Resolve the owning program before deriving ATAs / transferring ([token-2022-payments.md](token-2022-payments.md)) |
| **Decimals** | Don't assume 6. Read decimals per mint; do all math in base units ([usdc-payments.md](usdc-payments.md)) |
| **Pricing** | EUR (EURC) or yield-drifting (USDe) prices need an oracle and a quote TTL ([pricing-oracles.md](pricing-oracles.md)) |
| **Settlement choice** | Decide your treasury currency. Accept many, but consider [auto-swapping to one](accepting-any-token.md) so your books are single-currency |
| **Verification** | Same on-chain checks per mint — exact recipient/amount/mint/reference, idempotent credit ([verifying-payments.md](verifying-payments.md)) |

## Pattern: accept several, settle in one

```
customer pays in {USDC | PYUSD | EURC}
   → verify against THAT mint (correct program, correct decimals, net-of-fee if Token-2022)
   → optionally swap to your settlement stablecoin (accepting-any-token.md)
   → credit once, in your books' currency
```

This keeps the customer's choice wide while keeping your accounting and treasury simple.

## Pitfalls

| Pitfall | Consequence | Fix |
|---------|-------------|-----|
| Trusting a token's *name* | Fake-token theft / mis-credit | Pin the exact mint per cluster; verify from issuer |
| Assuming SPL Token for all | PYUSD (Token-2022) transfers throw/mis-derive | Resolve the owning program from the mint |
| Assuming 6 decimals | Off-by-10^n amount bugs | Read decimals per mint; base-unit math |
| Hardcoding a mint from a blog | Wrong/scam mint | Use issuer docs (`confirmFrom` in the registry) |
| Ignoring transfer fees (PYUSD/Token-2022) | Under-credit / failed exact-amount checks | Quote net-of-fee ([token-2022-payments.md](token-2022-payments.md)) |

## How this fits

This extends [usdc-payments.md](usdc-payments.md) to the broader stablecoin set, leans on [token-2022-payments.md](token-2022-payments.md) for PYUSD, [pricing-oracles.md](pricing-oracles.md) for non-USD pricing, and [accepting-any-token.md](accepting-any-token.md) to settle in one currency. The pinned addresses also live in [resources.md](resources.md).
