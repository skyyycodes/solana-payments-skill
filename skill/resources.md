# Resources & Reference

> Source-of-truth-first. Verify mints and provider APIs against these before shipping — payment details change and a wrong constant moves real money.

## Mints (verify before use!)

| Token | Cluster | Mint | Decimals | Program |
|-------|---------|------|----------|---------|
| USDC | mainnet-beta | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` | 6 | SPL Token |
| USDC (Circle dev) | devnet | `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` | 6 | SPL Token |
| USDT | mainnet-beta | `Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB` | 6 | SPL Token |
| PYUSD | mainnet-beta | `2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo` | 6 | **Token-2022** |
| EURC | mainnet-beta | `HzwqbKZw8HxMN6bF2yFZNrht3c2iXXzpKcFu7uBEDKtr` | 6 | SPL Token |
| USDe | mainnet-beta | _confirm from Ethena_ | _confirm_ | _confirm_ |

- Typed, code-usable version of this table (with a "refuse to guess" lookup): [examples/src/stablecoins.ts](../examples/src/stablecoins.ts). Full guidance: [stablecoins.md](stablecoins.md).
- Circle USDC: https://www.circle.com/multi-chain-usdc/solana · Circle EURC: https://developers.circle.com/stablecoins/eurc-on-main-networks
- PYUSD on Solana (Token-2022): https://developer.paypal.com/community/blog/pyusd-on-solana/ · Ethena USDe: https://ethena-labs.gitbook.io/ethena-labs
- **Only USDC is pre-verified here.** Confirm every other mint + decimals against the issuer and an explorer before trusting it — a wrong constant moves real money.

## Core libraries

| Library | Use | Docs |
|---------|-----|------|
| `@solana/pay` | Requests, URLs, QR, `findReference`, `validateTransfer` | https://docs.solanapay.com |
| `@solana/spl-token` | ATAs, `transferChecked`, `approveChecked`, `revoke` | https://solana-program.com/docs/token |
| `@solana/web3.js` | Classic SDK | https://solana.com/docs/clients/javascript |
| `@solana/kit` | Modern SDK | https://github.com/anza-xyz/kit |
| `bignumber.js` | Human-unit amounts for Solana Pay | https://mikemcl.github.io/bignumber.js |

## Specs & docs

- Solana Pay spec: https://github.com/anza-xyz/solana-pay/blob/master/SPEC.md
- Solana Pay docs: https://docs.solanapay.com
- SPL Token (delegates/approve): https://solana-program.com/docs/token
- Associated Token Account program: https://solana-program.com/docs/associated-token-account
- Token-2022 (extensions, transfer fees): https://solana-program.com/docs/token-2022
- Token-2022 Confidential Transfers (encrypted amounts, ZK + optional auditor): https://solana-program.com/docs/token-2022/extensions#confidential-transfers
- Tokens / decimals overview: https://solana.com/docs/core/tokens

## Reliable delivery (bundled in this skill)

The transaction-delivery layer (originally [solana-tx-skill](https://github.com/skyyycodes/solana-tx-skill)) is **included here** — every on-chain send in this skill (transfer, approve, recurring charge, off-ramp deposit) is delivered through its golden path:

- [priority-fees.md](priority-fees.md) · [compute-budget.md](compute-budget.md) · [send-and-confirm.md](send-and-confirm.md)
- [durable-nonces.md](durable-nonces.md) · [jito-bundles.md](jito-bundles.md) · [kit-vs-web3js.md](kit-vs-web3js.md) · [debugging-failed-tx.md](debugging-failed-tx.md)
- Commands: [/diagnose-tx](../commands/diagnose-tx.md) · [/tx-health-check](../commands/tx-health-check.md) · Agents: [tx-engineer](../agents/tx-engineer.md) · [tx-reliability-architect](../agents/tx-reliability-architect.md)

### Delivery docs & APIs

- Retrying Transactions: https://solana.com/docs/advanced/retry
- Transaction Confirmation & Expiration: https://solana.com/docs/advanced/confirmation
- Compute optimization: https://solana.com/developers/guides/advanced/how-to-request-optimal-compute
- Priority fee RPC `getRecentPrioritizationFees`: https://solana.com/docs/rpc/http/getrecentprioritizationfees
- Helius Priority Fee API (`getPriorityFeeEstimate`): https://docs.helius.dev/solana-apis/priority-fee-api
- Jito bundles / MEV: https://docs.jito.wtf/lowlatencytxnsend/ · `jito-ts`: https://github.com/jito-labs/jito-ts
- `@solana-program/compute-budget`: https://github.com/solana-program/compute-budget
- Explorers (for /diagnose-tx): https://explorer.solana.com · https://solscan.io · https://solana.fm
- Devnet faucet: https://faucet.solana.com

## Infrastructure / RPC & webhooks

| Provider | Useful for |
|----------|-----------|
| Helius | RPC + webhooks (watch a reference/account for settlement), enhanced tx APIs |
| Triton / QuickNode | RPC |
| Public RPC (`api.mainnet-beta.solana.com`) | Dev/testing only (rate-limited) |

## Fiat on/off-ramp providers (provider-agnostic; verify availability/licensing per region)

- Coinbase Onramp/Offramp, Transak, MoonPay, Stripe Crypto, Sphere, and others. Confirm Solana + USDC support, supported countries, and embedding terms in their current docs before integrating. Wrap whichever you choose behind an interface ([offramp-fiat.md](offramp-fiat.md)).

## Version reference (June 2026)

| Package | Version |
|---------|---------|
| `@solana/pay` | latest |
| `@solana/spl-token` | latest (0.4+) |
| `@solana/web3.js` | 1.95+ |
| `@solana/kit` | 6.x |
| `bignumber.js` | 9.x |

> Pin and verify against `package.json` in the consuming project. The payments APIs (`transferChecked`, `approveChecked`, ATA helpers) are stable; the **mints and provider APIs** are the things to double-check.
