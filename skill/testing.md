# Testing Payments on Devnet

> Payment bugs are expensive in production, so prove the flow works **before** real money moves. Devnet gives you a free, realistic environment with the same SDKs, the same `transferChecked`, and a real USDC-style mint — plus you should unit-test the pure logic (amount math, idempotency, cap checks) where no chain is needed at all.

## Two layers of testing

1. **Pure unit tests** (no network): base-unit conversion, idempotent crediting, subscription cap/cadence math, refund guards. Fast, deterministic, run in CI.
2. **Devnet integration** (real chain): build → land → verify a real transfer end-to-end against devnet RPC.

Do both. Most payment defects (double-credit, float rounding, missing mint check) are caught by layer 1.

## Devnet setup

```bash
solana config set --url devnet
solana-keygen new -o ./test-payer.json        # a throwaway test wallet
solana airdrop 2 --keypair ./test-payer.json   # free devnet SOL for fees
```

Use devnet USDC (mint `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`) — get test tokens from a faucet such as [spl-token-faucet.com](https://spl-token-faucet.com) or Circle's devnet faucet. Never hardcode the mainnet mint in tests; key the mint off the cluster (see [resources.md](resources.md)).

## Unit-testing the logic that matters

```typescript
import { toBaseUnits } from '../examples/src/checkout';

// Base-unit math — the #1 source of silent money bugs.
expect(toBaseUnits('25.00', 6)).toBe(25_000_000n);
expect(toBaseUnits('0.000001', 6)).toBe(1n);
expect(toBaseUnits('1', 6)).toBe(1_000_000n);

// Idempotent credit — a duplicate signature must NOT double-credit.
const store = new InMemoryStore();
const first = await verifyAndCredit(conn, store, expected);   // → credited
const again = await verifyAndCredit(conn, store, expected);   // → already-processed
expect(again.status).toBe('already-processed');

// Subscription cadence — second charge in the same period must be rejected.
expect(canChargeNow(sub, now)).toBe(true);
await charge(sub, now);
expect(canChargeNow(sub, now + 1)).toBe(false);               // too early
```

Inject a fake `Connection`/`PaymentStore` so these run without a network. The [examples/](../examples) functions are written to take their dependencies as parameters precisely so they're testable.

## Devnet integration test

```
1. fund test-payer with devnet SOL + devnet USDC
2. createCheckout({ recipient: merchant, mint: devnetUsdc, amount })  → { url, reference }
3. build the USDC payment, sign with the customer test key
4. land it via solana-tx-skill (confirmed)
5. verifyAndCredit(...) → expect 'credited'
6. run it AGAIN → expect 'already-processed'  (idempotency proven on a real tx)
```

Step 6 is the one people skip and the one that matters most.

## Testing subscriptions

- Unit-test cap/cadence math in isolation (above).
- On devnet: `approveChecked` a small cap, pull one charge, assert the second pull **in the same period is rejected** and that pulling beyond the cap fails at the token program.
- If using the on-chain program ([examples/subscription-program](../examples/subscription-program)), use Anchor's `bankrun`/local validator and **warp the clock** to test cadence without waiting real time.

## Testing webhooks

You don't need live traffic: POST a recorded webhook payload to your handler and assert it (a) verifies on-chain, (b) is idempotent under a duplicate delivery, and (c) returns `200` fast. Replay the same event twice in the test — providers really do redeliver.

## Simulating failure paths

Test the unhappy paths explicitly: underpayment (wrong amount), wrong mint, failed/dropped transaction, duplicate webhook, refund-before-confirm, and reorg-style "confirmed but not finalized" gating. Each should be **rejected or no-op**, never fulfilled.

## Pitfalls

| Pitfall | Consequence | Fix |
|---------|-------------|-----|
| Only testing the happy path | Money bugs ship | Test under/over/wrong-mint/dup |
| Testing against mainnet | Real funds at risk | Devnet first, mainnet last |
| No idempotency test | Double-credit in prod | Always run the verify step twice |
| Hardcoded mainnet mint | Tests hit wrong asset | Key mint off cluster |
| Waiting real time for cadence | Slow, flaky tests | Warp the clock (bankrun) |

## How this fits

Testing validates everything else: it exercises [usdc-payments.md](usdc-payments.md) building, [verifying-payments.md](verifying-payments.md) crediting, and [subscriptions.md](subscriptions.md) cadence against the runnable [examples/](../examples). Land devnet transactions through [solana-tx-skill](https://github.com/skyyycodes/solana-tx-skill) so you're testing the real delivery path too.
