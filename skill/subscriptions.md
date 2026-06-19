# Recurring Subscriptions (Delegate-Based Billing)

> The RECUR layer. Solana has **no native "charge $10/month."** You build it from the SPL token **delegate** primitive: the customer approves a delegate to move up to a capped amount, and a **relayer** (or, better, an on-chain **program**) pulls each period's charge. This is money-movement code with real footguns — the rules here are about **safety** as much as mechanics.

## The core idea

```
Customer approves a delegate  ──►  Delegate may transfer up to N base units of the customer's USDC
        (approveChecked)                       │
                                               ▼  each billing period
                              Relayer/Program pulls one period's charge (transferChecked)
                                               │
                                               ▼
                              Verify + credit idempotently (verifying-payments.md)
```

The delegate is an authority allowed to move tokens **out of the customer's own token account**, up to the approved amount, without the customer signing again.

## Two designs (pick deliberately)

| | Relayer-only (off-chain) | On-chain program (recommended for real products) |
|---|---|---|
| How | Customer `approve`s a server key as delegate; a cron pulls each period | A program PDA is the delegate; the program enforces amount + cadence on-chain |
| Pros | Simple, no program to deploy | Trust-minimized: cadence/cap enforced by code, not your server; auditable |
| Cons | Customer must trust your server not to over-pull within the cap; re-approval needed when cap is exhausted | Requires writing/deploying a program (→ solana-dev-skill) |
| Use when | MVP, low-trust-stakes, internal | Production billing, third-party merchants, anything audited |

> This skill specifies both. The **program** itself is on-chain logic — delegate building it to **solana-dev-skill** — but the **client design, approval policy, and pull/verify loop are owned here.**

## Safety rules (read before coding)

1. **Bound the approval.** Use `approveChecked` with a **capped** amount. **Never** approve `u64::MAX` / "unlimited."
2. **Approve per-cycle or per-N-cycles**, not "forever." Smaller cap = smaller blast radius if your relayer key leaks. Re-approve as needed.
3. **Enforce cadence.** A bare SPL delegate has **no concept of time** — if your server is compromised it can drain the full approved cap immediately. Enforce "once per period, max X" either in a **program** (best) or, at minimum, server-side with strict idempotency per period.
4. **Make each charge idempotent per period.** Key charges by `(subscription_id, period)` so a retry/cron-overlap can't double-charge. → [verifying-payments.md](verifying-payments.md)
5. **Revocable + transparent.** Provide one-click `revoke`, show the customer the cap and cadence, and stop pulling on cancellation.
6. **Handle "card declined."** Insufficient balance / closed ATA / revoked delegate = a failed charge. Define retry/grace/downgrade policy; never silently keep retrying forever.

## Step 1 — Customer approves the delegate (bounded)

```typescript
import { createApproveCheckedInstruction, getAssociatedTokenAddress } from '@solana/spl-token';
import { PublicKey } from '@solana/web3.js';

// Approve the delegate for a CAPPED amount — e.g. 3 months of a 25 USDC plan = 75 USDC.
async function buildApproveIx(opts: {
  customer: PublicKey;        // token owner + signer
  delegate: PublicKey;        // your relayer key OR your program's PDA
  mint: PublicKey;            // USDC
  cap: bigint;                // e.g. 75_000_000n (NOT unlimited)
  decimals?: number;
}) {
  const customerAta = await getAssociatedTokenAddress(opts.mint, opts.customer);
  return createApproveCheckedInstruction(
    customerAta,
    opts.mint,
    opts.delegate,
    opts.customer,            // owner authority (customer signs this once)
    opts.cap,
    opts.decimals ?? 6,
  );
}
```

> The customer signs this **once**. After it lands (via [solana-tx-skill](https://github.com/skyyycodes/solana-tx-skill)), the delegate may move up to `cap` base units total. When the running total hits the cap, you re-prompt for re-approval.

## Step 2 — Pull a period's charge

### Relayer (off-chain) pull

The delegate (relayer key) signs a `transferChecked` moving one period's amount from the customer ATA to the merchant ATA:

```typescript
import { createTransferCheckedInstruction, getAssociatedTokenAddress } from '@solana/spl-token';

async function buildRecurringChargeIx(opts: {
  customer: PublicKey;
  merchant: PublicKey;
  delegate: PublicKey;        // relayer = the approved delegate, also the signer here
  mint: PublicKey;
  amount: bigint;             // one period, must keep cumulative pulls <= approved cap
  decimals?: number;
}) {
  const source = await getAssociatedTokenAddress(opts.mint, opts.customer);
  const dest = await getAssociatedTokenAddress(opts.mint, opts.merchant);
  // authority = delegate (relayer signs). SPL decrements the remaining delegated allowance.
  return createTransferCheckedInstruction(
    source, opts.mint, dest, opts.delegate, opts.amount, opts.decimals ?? 6,
  );
}
```

The relayer is the fee payer + signer. Build → add dynamic fee + simulated CU → send/confirm/retry via [solana-tx-skill](https://github.com/skyyycodes/solana-tx-skill). Then **verify + credit idempotently** ([verifying-payments.md](verifying-payments.md)).

### Program (on-chain) pull — recommended

A small program holds a `Subscription` account (`{ customer, merchant, amount, period, last_charged }`) and a PDA that is the **delegate**. Its `charge` instruction:
- checks `now >= last_charged + period` (cadence enforced **on-chain**),
- CPIs `transfer_checked` for exactly `amount` using the PDA as authority,
- sets `last_charged = now`.

Now even a fully-compromised relayer can only trigger **one period's** charge **on schedule** — the cap *and* cadence are enforced by code, not trust. Build this program with **solana-dev-skill**; this skill defines the account/policy shape and the client that calls it.

## Step 3 — The recurring scheduler

```typescript
// Cron, once per period. Each charge keyed by (subscriptionId, period) for idempotency.
async function runBillingCycle(subs: Subscription[]) {
  for (const s of subs) {
    const period = currentPeriod(s);                 // e.g. '2026-06'
    if (await alreadyCharged(s.id, period)) continue; // idempotent: never double-charge a period
    try {
      const sig = await chargeOnce(s, period);        // build → land (solana-tx-skill) → verify
      await recordCharge(s.id, period, sig);          // atomic with fulfillment
    } catch (e) {
      await handleFailedCharge(s, period, e);         // grace period / retry policy / downgrade
    }
  }
}
```

## Cancellation & revocation

```typescript
import { createRevokeInstruction, getAssociatedTokenAddress } from '@solana/spl-token';

// Customer revokes the delegate — no more pulls possible.
async function buildRevokeIx(customer: PublicKey, mint: PublicKey) {
  const ata = await getAssociatedTokenAddress(mint, customer);
  return createRevokeInstruction(ata, customer); // owner signs
}
```

On cancellation: stop the scheduler for that subscription **and** encourage on-chain `revoke` so no residual allowance remains.

## Pitfalls

| Pitfall | Consequence | Fix |
|---------|-------------|-----|
| `approve` unlimited | Relayer key leak drains the wallet | `approveChecked` with a small cap |
| No cadence enforcement | Compromised server pulls whole cap at once | On-chain program enforces period |
| Charging without idempotency per period | Double-charge on cron overlap/retry | Key by `(sub, period)`; unique constraint |
| Ignoring failed charges | Silent churn or infinite retries | Explicit grace/retry/downgrade policy |
| Not handling cap exhaustion | Charges start failing mid-subscription | Track cumulative pulls; re-approve before cap hit |
| Hiding the terms | User distrust / disputes | Show cap, cadence, next charge; one-click cancel |

## How this fits

Recurring billing = **bounded approval** (here) + **reliable pull** ([solana-tx-skill](https://github.com/skyyycodes/solana-tx-skill)) + **verify/credit idempotently** ([verifying-payments.md](verifying-payments.md)). For the on-chain enforcement program, hand the program logic to solana-dev-skill. Audit existing billing code with [/payments-audit](../commands/payments-audit.md).
