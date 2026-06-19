# Resources & Reference

> Source-of-truth-first. Verify mints and provider APIs against these before shipping — payment details change and a wrong constant moves real money.

## Mints (verify before use!)

| Token | Cluster | Mint | Decimals |
|-------|---------|------|----------|
| USDC | mainnet-beta | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` | 6 |
| USDC (Circle dev) | devnet | `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` | 6 |
| USDT | mainnet-beta | `Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB` | 6 |

- Circle USDC reference: https://www.circle.com/multi-chain-usdc/solana
- Always confirm a mint on an explorer before trusting it.

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
- Tokens / decimals overview: https://solana.com/docs/core/tokens

## Reliable delivery (sibling skill)

- **solana-tx-skill** — priority fees, compute budget, send/confirm/retry, idempotent landing, failure debugging: https://github.com/skyyycodes/solana-tx-skill

Every on-chain send in this skill (transfer, approve, recurring charge, off-ramp deposit) should be delivered through that skill's golden path.

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
