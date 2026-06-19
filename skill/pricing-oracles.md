# Fiat-Priced Checkout & Price Oracles

> Most businesses price in fiat ("$25/mo"), but customers pay in a token. If you charge in SOL or a volatile token, you need a **price** to convert "$25" into a token amount — and that price must be fresh, sourced safely, and locked for the duration of the checkout. Pricing in USDC sidesteps most of this; pricing in SOL or other tokens requires an oracle.

## First: do you even need an oracle?

- **Price in USDC (or another stablecoin):** no oracle. "$25" ≈ `25_000_000` base units. This is the simplest, most stable choice and what most checkouts should do — see [usdc-payments.md](usdc-payments.md).
- **Price in SOL / volatile token:** you need a USD→token rate at checkout time. Use an on-chain oracle (Pyth, Switchboard) or a swap-aggregator quote (Jupiter, see [accepting-any-token.md](accepting-any-token.md)).

## Reading a price (Pyth)

```typescript
// Pull the SOL/USD price, then convert a fiat price into a token amount.
// (Confirm the current Pyth SDK + feed ids in resources.md — the API moves.)
const { price, expo, publishTime, conf } = await getPythPrice(SOL_USD_FEED);
const solUsd = Number(price) * 10 ** expo;            // e.g. 152.34

// Reject stale or low-confidence prices BEFORE using them.
if (Date.now() / 1000 - publishTime > 30) throw new Error('Price too stale');
if (conf / Math.abs(Number(price)) > 0.01) throw new Error('Price confidence too low');

const usd = 25;                                       // the fiat price
const sol = usd / solUsd;                             // token amount (human)
const lamports = BigInt(Math.round(sol * 1e9));       // base units
```

The two checks that matter: **staleness** (is this price recent?) and **confidence** (how wide is the band?). A naive integration that skips these can charge wildly wrong amounts during volatility or feed outages.

## Lock the quote (TTL)

A price is only valid for a moment. Quote at checkout, attach a short TTL, and persist `{ fiatPrice, tokenAmount, rate, quotedAt, expiresAt }` with the order:

```
quote → show "≈ 0.164 SOL, valid for 60s" → customer pays → on verify, the EXPECTED
amount is the LOCKED tokenAmount (not a re-fetched price). If expired, re-quote.
```

Verify against the **locked** `tokenAmount`, never a freshly fetched price — otherwise a moving market makes every payment look "wrong." If the quote expired before payment, treat it as underpaid/needs re-quote rather than silently accepting.

## Tolerance bands

For volatile assets, decide a small acceptance band (e.g. accept if within ±0.5% of the locked amount) so a tiny price tick between quote and pay doesn't reject a genuine payment. Define this explicitly; don't let it drift into "accept anything close."

## Pitfalls

| Pitfall | Consequence | Fix |
|---------|-------------|-----|
| Pricing in a volatile token unnecessarily | FX risk + complexity | Price in USDC when you can |
| Ignoring staleness/confidence | Charge a wrong amount | Reject stale/low-confidence prices |
| Verifying against a re-fetched price | Every payment looks wrong | Verify the locked quote amount |
| No quote TTL | Customer pays an old rate | Short TTL + re-quote |
| Single price source, no sanity check | Oracle glitch → bad charge | Sanity-bound + fallback source |

## How this fits

Pricing decides the **amount** that the rest of the pipeline moves and verifies: [usdc-payments.md](usdc-payments.md) builds the transfer for the locked amount, [verifying-payments.md](verifying-payments.md) checks that exact amount, and [accepting-any-token.md](accepting-any-token.md) uses the same quote-and-lock idea for swaps. Stablecoin pricing avoids all of it — reach for an oracle only when you truly price in a volatile asset.
