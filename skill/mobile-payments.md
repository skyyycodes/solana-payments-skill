# Mobile Payments (Mobile Wallet Adapter, deep links, Seed Vault)

> A huge share of real-world payments happen on a **phone** — in-app checkout and physical-world POS. On mobile there's no browser extension to inject a wallet, so the desktop pattern (`window.solana`) doesn't exist. The standard is **Mobile Wallet Adapter (MWA)**: your app asks the OS to hand the signing session to whatever wallet app the user already has. This guide covers MWA, deep-link/QR fallbacks, and Seed Vault.

## The core shift: MWA replaces the injected wallet

On Android, **Mobile Wallet Adapter** lets a dApp (native or mobile web) connect to an installed wallet app over a local session:

```
your app  ──transact()──▶  OS picks a wallet  ──▶  wallet authorizes + signs  ──▶  back to your app
```

- Use **`@solana-mobile/mobile-wallet-adapter-protocol`** (+ the web3.js bridge) to `authorize`, then `signAndSendTransactions` / `signTransactions`.
- The wallet returns an **auth token** you reuse to skip re-approval on later sessions.
- It works for **native (React Native / Kotlin)** and **mobile web** on Android. iOS support is more limited — fall back to deep links / universal links to specific wallets.

You still build the **exact same transaction** as everywhere else (a [USDC `transferChecked`](usdc-payments.md) with a `reference`). MWA only changes *how it gets signed*; verification and idempotent credit are unchanged.

## Three ways a phone pays — pick per context

| Pattern | Best for | How |
|---------|----------|-----|
| **MWA session** | Your own native/mobile-web app on Android | `transact()` → authorize → sign & send via the installed wallet |
| **Solana Pay QR** | In-person POS, desktop→phone handoff | Render a [Solana Pay](payment-links.md) QR; the customer scans with any wallet. Verify by `reference` |
| **Solana Pay / wallet deep link** | Mobile web where MWA isn't available (e.g. iOS) | `solana:`-style or wallet universal link opens the wallet app prefilled |

For **POS / in-person**, the QR + `reference` polling flow is the most universal: the merchant device shows the QR and watches for settlement; the customer uses whatever wallet they have. This is exactly the [payment-links.md](payment-links.md) flow on a counter screen.

## Seed Vault (hardware-backed keys on Solana Mobile)

On Solana Mobile devices, **Seed Vault** keeps private keys in a hardware-isolated environment; signing is gated by device biometrics. Your app never touches the key — you request signatures through MWA and the Vault-backed wallet performs them. Treat it like any MWA wallet; the benefit is stronger key custody for the user.

## Mobile-specific correctness

| Rule | Why |
|------|-----|
| **Still verify on-chain by `reference`** | A returned signature from the wallet isn't proof of settlement; confirm it ([verifying-payments.md](verifying-payments.md)) |
| **Handle session drops / app switches** | The user leaves to the wallet app and returns; resume on the order's `reference`, don't restart the charge |
| **Reuse the MWA auth token** | Avoids re-prompting the user every transaction |
| **Confirm to `confirmed` for UX, `finalized` before releasing goods** | Mobile users expect instant feedback; don't ship product on `processed` |
| **Pair with gasless for USDC-only users** | Mobile users rarely hold SOL — sponsor the fee ([gasless-payments.md](gasless-payments.md)) |
| **QR fallback always** | The most wallet-agnostic path, and the only one for in-person |

## Pitfalls

| Pitfall | Consequence | Fix |
|---------|-------------|-----|
| Assuming `window.solana` on mobile | No wallet to connect to | Use MWA (Android) / deep links / Solana Pay QR |
| Treating the wallet's returned sig as "paid" | Credit before settlement | Verify on-chain by `reference` |
| Losing the order across the app switch | Double charge or stuck checkout | Persist order + reference; resume on return |
| Requiring SOL on a phone | Customer can't pay | Gasless fee sponsorship |
| Polling too aggressively on mobile networks | Battery/data drain, rate limits | Reasonable poll interval + webhook backstop ([webhooks.md](webhooks.md)) |

## How this fits

Mobile is a **client** for the same engine: build a [USDC payment](usdc-payments.md) (often [gasless](gasless-payments.md)), sign it via MWA / QR / deep link, [land it](send-and-confirm.md), and [verify + credit](verifying-payments.md) by `reference`. For in-person it's the [payment-links.md](payment-links.md) QR flow; for sharing it complements [Actions & Blinks](actions-blinks.md). See [resources.md](resources.md) for the Solana Mobile / MWA SDK links.
