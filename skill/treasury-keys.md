# Treasury & Key Management (the thing that actually gets a business rekt)

> Every flow in this skill assumes keys that sign. The **hot relayer/fee-payer key is the single biggest liability** in a payments backend: it's online, it signs automatically, and if it leaks, an attacker drains it and can grief your customers. This guide is the boring, non-negotiable layer that keeps a working integration from becoming a headline.

## The key inventory (name them, then protect each)

| Key | Exposure | Job | Protection |
|-----|----------|-----|------------|
| **Treasury** | Cold | Holds the bulk of funds; receives sweeps; pays out | **Multisig** (Squads). Never a single hot key |
| **Relayer / fee-payer** | Hot (online, auto-signs) | Pays network fees for [gasless](gasless-payments.md) payments | KMS/HSM-backed signer, **minimal SOL float**, rate-limited, alerted |
| **Sweeper** | Warm | Moves funds from [one-time addresses](private-send.md) to treasury | Scoped key, can only send to treasury, separate from relayer |
| **Subscription crank** | Hot | Triggers recurring pulls within a bounded delegate | Can only invoke the program; never an owner/delegate of customer funds |
| **Refund signer** | Warm/cold | Sends [refunds](refunds.md) | Capped per-tx/day; ideally multisig approval over a threshold |

The principle: **separate keys by blast radius.** A leaked relayer should cost you a small SOL float and nothing else.

## Hot/cold separation

```
customer payments ──▶ one-time / merchant ATA ──sweep──▶ TREASURY (cold multisig)
                                                              │
fees paid by ───────────────────────────────────────────────┘ (top up relayer from treasury,
RELAYER (hot, small SOL float)  ◀── periodic, capped top-up ──   small amounts, on a schedule)
```

- **Treasury holds the money; the hot key holds lunch money.** Keep only enough SOL on the relayer for ~hours of fees. Top it up on a schedule (capped), not all at once.
- **Sweep received funds out** of payment-receiving accounts into the treasury promptly. Funds sitting in a hot-adjacent account are funds at risk.

## Multisig the treasury (Squads)

Use **[Squads](https://squads.so)** (the standard Solana multisig/smart-account) for treasury and any high-value payout:

- **M-of-N approvals** for payouts, off-ramp sends, refunds over a threshold, and program-authority changes.
- **Program upgrade authority** for your [subscription program](../examples/subscription-program/README.md) should be a Squads multisig (or burned) — never a single dev laptop.
- Time-locks / spending limits for routine payouts so a single compromised signer can't move everything instantly.

## Don't hold raw keypairs — use a KMS / signer

A relayer keypair in `.env` or source is the classic way to get drained. Instead:

- **KMS/HSM or a managed signer** (AWS/GCP KMS, **Turnkey**, Fireblocks, etc.): the private key never leaves the secure module; your service calls "sign this message." Rotate and revoke at the platform level.
- If you must run a local keypair (e.g. devnet), load it from a secret manager at runtime, never commit it, and scope its funds to the minimum.
- The relayer is a **fee payer only** — it must never be a token delegate or account owner (see [gasless-payments.md](gasless-payments.md)).

## Rotation & revocation

- **Rotate the hot relayer key on a schedule** and immediately on any suspicion. KMS makes this a config change, not a redeploy.
- Keep keys **versioned** so you can roll forward without downtime (accept the old key for in-flight txs briefly, then retire it).
- For subscriptions, customers can `revoke` their delegate at any time — your crank must tolerate a now-revoked delegate gracefully ([subscriptions.md](subscriptions.md)).

## Balance & anomaly alerting (you will thank yourself)

| Alert | Trigger | Why |
|-------|---------|-----|
| Relayer SOL low | Below N hours of fees | Payments start failing if the fee payer is empty |
| Relayer SOL drained fast | Sudden drop / spend-rate spike | Abuse or key compromise → kill the endpoint |
| Treasury outflow | Any payout, esp. unscheduled | Detect unauthorized movement quickly |
| Sweep lag | Funds idle in receiving accounts | Money sitting where it shouldn't |
| Failed-signature spike | KMS denials / bad signs | Misconfig or attack |

Wire these to your existing on-call. The relayer-drain alert is the one that saves the company.

## Pitfalls

| Pitfall | Consequence | Fix |
|---------|-------------|-----|
| Single hot key holds the treasury | One leak = total loss | Squads multisig for treasury; hot key holds only fee float |
| Relayer key in env/source | Drained wallet | KMS/Turnkey; never raw keypair in prod |
| No top-up cap | A bug/abuse drains the funded float | Capped, scheduled top-ups from treasury |
| Upgrade authority on a dev laptop | Malicious/accidental program change | Multisig or burned upgrade authority |
| No alerting | You learn from customers, not metrics | Balance + outflow + failure alerts on-call |
| Reusing one key for everything | Max blast radius | Separate keys per role (table above) |

## How this fits

This protects every signing path: the [gasless relayer](gasless-payments.md), the [subscription crank](subscriptions.md), [refunds](refunds.md), [off-ramp sends](offramp-fiat.md), and treasury sweeps from [private-send.md](private-send.md). Pair it with [compliance-screening.md](compliance-screening.md) (screen before paying out) and run [/payments-audit](../commands/payments-audit.md) to check key handling. See [resources.md](resources.md) for Squads / KMS links.
