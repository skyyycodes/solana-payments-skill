# Token-2022 Payments (transfer fees, hooks, and the allowlist stance)

> The moment you accept **arbitrary mints**, Token-2022 extensions become real footguns. The two that break payments: **transfer fees** (the recipient receives *less* than was sent, so your "did I get N?" check fails) and **transfer hooks** (extra accounts/logic run on every transfer, which can fail or gate the move). The safe default for a payments backend is an **allowlist of known-good mints** — and only relax it deliberately, with the accounting below.

## First: which token program owns the mint?

Classic SPL Token and Token-2022 are **different programs** with different mint layouts. Always resolve the owning program before building transfers:

```typescript
import { getMint, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
// look up the mint account owner, then pass the matching programId into ATA derivation
// and transferChecked. Using the wrong program id throws or silently mis-derives the ATA.
```

USDC today is classic SPL Token. PYUSD and many newer assets are **Token-2022**. Hard-coding `TOKEN_PROGRAM_ID` will break the day you accept one of them.

## Footgun 1 — Transfer fees (you receive less than was sent)

A Token-2022 mint can carry a `TransferFeeConfig`: every transfer skims `min(amount * bps/10000, maximumFee)` to a withheld balance. Consequences:

- A customer sends 10 "USD-stable" → you receive **9.95**. Your exact-amount verification rejects a *correct* payment.
- Or you credit 10 while only holding 9.95 → you eat the difference at scale.

**Fix: quote net-of-fee.** Read the live config and do the math. Runnable helpers: [examples/src/token2022.ts](../examples/src/token2022.ts).

```typescript
import { getMint, getTransferFeeConfig, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import { netAfterFee, grossUpForNet } from './token2022';

const mintInfo = await getMint(connection, mint, 'confirmed', TOKEN_2022_PROGRAM_ID);
const cfg = getTransferFeeConfig(mintInfo); // null if the mint has no fee
const fee = cfg
  ? { feeBasisPoints: cfg.newerTransferFee.transferFeeBasisPoints, maximumFee: cfg.newerTransferFee.maximumFee }
  : { feeBasisPoints: 0, maximumFee: 0n };

// Decide your policy explicitly:
const grossToCharge = grossUpForNet(invoiceNet, fee); // customer pays the fee → you net the invoice
// ...or verify against netAfterFee(amountSent, fee) if the customer pays exactly the sticker price.
```

Then **verify against the net**, not the sent amount. Use `transferCheckedWithFee` when you build fee-bearing transfers so the on-chain fee is explicit.

## Footgun 2 — Transfer hooks (extra logic on every move)

A mint with the `TransferHook` extension runs a program on every transfer. That program can require **extra accounts**, enforce allowlists/KYC, or simply **fail** — turning a normal payment into a confusing error. For payments:

- You must resolve the hook's extra accounts (`@solana/spl-token`'s transfer-hook helpers / `createTransferCheckedWithTransferHookInstruction`) or the transfer fails.
- A hostile or misconfigured hook can **block** your sweep/refund later. You may be able to receive but not move funds.

**Stance:** don't accept hook mints into a payment flow unless you've reviewed the hook program. Treat unknown hooks as untrusted.

## Other extensions to notice

| Extension | Why a payments backend cares |
|-----------|------------------------------|
| **Transfer fee** | Recipient nets less → quote net-of-fee, verify the net |
| **Transfer hook** | Extra accounts/logic; can fail or gate transfers (incl. your refunds/sweeps) |
| **Default account state = frozen** | New ATAs start frozen; transfers fail until thawed by the freeze authority |
| **Permanent delegate** | A third party can move tokens out of any account — custody risk for received funds |
| **Confidential transfer** | Amounts are encrypted (see [private-send.md](private-send.md)); standard amount verification doesn't apply |
| **Non-transferable** | Cannot be moved at all — never a payment instrument |

## The allowlist stance (recommended default)

```
accept = mint ∈ KNOWN_GOOD_MINTS
       ? proceed
       : reject (or: inspect extensions → quote net-of-fee → explicit human approval)
```

- **Allowlist mints you actually want** (USDC, PYUSD, EURC, …) per cluster — see [stablecoins.md](stablecoins.md).
- For anything else, **auto-swap to your settlement token** instead of holding it ([accepting-any-token.md](accepting-any-token.md)) so extensions never touch your books.
- If you must accept an arbitrary mint directly, **read its extensions**, reject `non-transferable` / unknown `transfer-hook` / `permanent-delegate`, and **quote net-of-fee**.

## Pitfalls

| Pitfall | Consequence | Fix |
|---------|-------------|-----|
| Assuming `TOKEN_PROGRAM_ID` for every mint | Throws / wrong ATA on Token-2022 mints | Resolve the owning program from the mint account |
| Verifying the sent amount on a fee mint | Correct payments rejected, or you over-credit | Verify `netAfterFee`; gross-up invoices |
| Ignoring transfer hooks | Transfers (and refunds/sweeps) fail unexpectedly | Resolve extra accounts; reject unknown hooks |
| Accepting `permanent-delegate` mints | Funds you "hold" can be pulled by a third party | Allowlist; reject the extension for treasury assets |
| Frozen-by-default ATAs | First payment fails silently | Detect `DefaultAccountState`; require thaw or avoid the mint |

## How this fits

This guards [usdc-payments.md](usdc-payments.md) and [accepting-any-token.md](accepting-any-token.md) (which extensions are safe to receive), feeds [verifying-payments.md](verifying-payments.md) (verify the *net*), and connects to [stablecoins.md](stablecoins.md) (PYUSD is Token-2022). Confidential-amount mints are covered in [private-send.md](private-send.md).
