# Compliance & Risk Screening (screen → decide → record)

> Public, permissionless rails mean **anyone** can send you money — including sanctioned or high-risk wallets. Crediting or, especially, **off-ramping to fiat** for a sanctioned address can put a real business in serious legal jeopardy. Ecosystem trust depends on payment apps doing basic screening. This is the plumbing for it: a clean, testable hook that screens a counterparty, decides, and records every decision for audit.
>
> **Not legal advice.** This gives you the integration points. Your obligations (which lists, what thresholds, KYC, reporting) depend on your jurisdiction and business — consult counsel.

## The shape: screen → decide → record

Three outcomes, always recorded:

```
screen(counterparty, amount, lists, velocity) → 'allow' | 'review' | 'block'
   allow  → proceed (credit / pay out / off-ramp)
   review → hold; queue for manual review; do NOT auto-release value
   block  → never proceed (sanctioned/denied); record and stop
record(decision) → append to an immutable audit log, always
```

Runnable, dependency-free version: [examples/src/screening.ts](../examples/src/screening.ts) (unit-tested in CI).

```typescript
import { screenAndRecord } from './screening';

await screenAndRecord(
  { wallet, amountBaseUnits: amount, denyList, velocity, limits },
  (rec) => auditLog.append(rec),       // ALWAYS records the decision
  () => verifyAndCreditOrder(orderId), // only runs on 'allow'
);
```

## What to screen against

| Check | Source | Note |
|-------|--------|------|
| **Sanctions / SDN** | OFAC SDN list (incl. published crypto addresses), other gov lists | Keep it **fresh** — stale lists are worthless. Refresh on a schedule |
| **Address risk** | A screening provider (Chainalysis, TRM, Elliptic, etc.) | Scores exposure to mixers, stolen funds, sanctioned entities |
| **Velocity** | Your own ledger ([receipts-ledger.md](receipts-ledger.md)) | Per-wallet count/volume caps over a window catch abuse & structuring |
| **Geo / KYC** | Your onboarding | Required if you off-ramp or hit regulated thresholds |

The example models the sanctions deny-list + velocity locally so it's testable; swap in a provider call where `denyList`/risk comes from.

## Where to put the gate

- **Before off-ramp (mandatory).** Sending USDC to a fiat ramp for a sanctioned wallet is the highest-risk action. Screen the source/destination **before** you create the off-ramp order ([offramp-fiat.md](offramp-fiat.md)).
- **Before crediting high-value orders.** For large or risky payments, screen before releasing goods/services.
- **Before payouts / refunds.** Screen the destination before [refunding](refunds.md) or paying a marketplace seller.
- **Asynchronously for low-risk flows.** For tiny payments you may screen post-hoc and flag, to avoid latency — a documented policy decision, not an accident.

## Make it correct

| Rule | Why |
|------|-----|
| **Record every decision (allow/review/block), immutably** | You must be able to prove what you knew and when |
| **Fail closed on the screen itself** | If the screening provider is down, treat as `review`, don't silently `allow` |
| **Keep lists current** | A sanctioned address added yesterday must be caught today |
| **Don't leak the reason to the payer** | "blocked: sanctioned" tips off bad actors; log internally, return a generic decline |
| **Velocity uses *your* ledger** | Tie limits to your signature-keyed records so they can't be gamed by retries |
| **Screen the right party** | For inbound: the sender. For off-ramp/payout: the destination. Often both |

## Pitfalls

| Pitfall | Consequence | Fix |
|---------|-------------|-----|
| No screening before off-ramp | Sanctioned funds converted to fiat → legal exposure | Mandatory `screen` gate pre-off-ramp |
| Stale sanctions list | Miss newly-listed addresses | Scheduled refresh; provider API |
| Screen fails open | Compromise during provider outage | Fail closed → `review` |
| No audit trail | Can't demonstrate compliance | `record` every decision immutably |
| Caps not enforced atomically | Structuring/abuse slips through | Enforce velocity against the atomic ledger |

## How this fits

This is the gate in front of value-releasing steps: it wraps [verifying-payments.md](verifying-payments.md) (credit), [offramp-fiat.md](offramp-fiat.md) (the critical one), [refunds.md](refunds.md), and [marketplace-payments.md](marketplace-payments.md) payouts. It reads velocity from [receipts-ledger.md](receipts-ledger.md) and pairs with [treasury-keys.md](treasury-keys.md). The [threat-model.md](threat-model.md) covers the adversary; this is the policy gate.
