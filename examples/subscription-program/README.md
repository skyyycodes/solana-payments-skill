# Reference subscription program (Anchor)

The production-grade design from [`skill/subscriptions.md`](../../skill/subscriptions.md): the **program itself is the delegate**, so recurring pulls are enforced on-chain rather than trusted to an off-chain relayer.

A bare SPL token delegate has no concept of time — whoever holds it can drain the whole approved cap at once. This program fixes that by enforcing, in `charge`:

- **Cadence** — `now >= last_charged + period_secs` (one charge per period).
- **Amount** — exactly `amount` per charge (the customer's `approveChecked` cap is the hard ceiling).
- **State** — `active` flag; `cancel` deactivates and the customer also `revoke`s the delegate.

## Lifecycle

1. **`create_subscription(amount, period_secs)`** — customer creates the plan PDA `["sub", customer, merchant, mint]`.
2. **Approve the PDA as delegate** (client-side `approveChecked`, capped to N periods) so the program can move tokens.
3. **`charge()`** — permissionless crank; safety is in the on-chain checks. CPIs `transfer_checked` with the PDA as authority.
4. **`cancel()`** — customer deactivates; client `revoke`s the delegate.

## Tests

Two layers, mirroring the off-chain helpers so on-chain and off-chain agree:

- **Rust unit tests (no validator)** — the cadence rule is a pure function `can_charge(last_charged, period_secs, now)` with `#[cfg(test)]` tests. Run with:
  ```bash
  cargo test
  ```
  These prove the core novel claim (one charge per period, first charge allowed, overflow-safe) without any toolchain beyond Rust.

- **Bankrun integration tests (clock-warped)** — [`tests/subscription.test.ts`](tests/subscription.test.ts) loads the *compiled* program into an in-process SVM (`solana-bankrun` / `anchor-bankrun`), then **warps the clock** to prove: `charge` succeeds, an immediate re-charge fails with `TooEarly`, and after advancing past `period_secs` it succeeds again — plus a cap-exhaustion test. This is the honest way to test time-based billing.

## Build, test, deploy

```bash
# requires: rustc, solana-cli, anchor-cli (avm)
cargo test                      # 1) pure cadence unit tests (fast, no validator)
anchor build                    # 2) compile the program -> target/deploy/subscription.so
cd examples/subscription-program && npm install && npm test   # 3) bankrun clock-warp tests
anchor deploy --provider.cluster devnet                       # 4) deploy to devnet
```

After deploy:
1. Replace `declare_id!(...)` and `Anchor.toml`'s `[programs.*]` with your deployed program id, then `anchor build` again so the embedded id matches.
2. Set the program's **upgrade authority to a Squads multisig** (or burn it) — see [`skill/treasury-keys.md`](../../skill/treasury-keys.md).
3. Wire the client: create the plan, `approveChecked` the PDA (capped to N periods), crank `charge` on cadence.

> CI note: the repo's top-level GitHub Actions runs the **toolchain-free** TypeScript examples (`examples/`). Build + bankrun + deploy here need the Rust/Anchor/Solana toolchain — run them locally or in a dedicated CI job that installs it.

> **Audit before mainnet.** This is a teaching reference, not an audited program.
