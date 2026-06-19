# USDC & SPL Token Payments

> The ASSET layer. Real commerce runs on stablecoins, so most payments are **SPL token transfers** (USDC), not native SOL. This is where the classic gotchas live: associated token accounts (ATAs), decimals, and using `transferChecked` so the mint and decimals are enforced. Deliver every transfer via the [solana-tx-skill](https://github.com/skyyycodes/solana-tx-skill) golden path.

## Pick the right mint (verify per cluster!)

USDC has **different mint addresses per cluster**. Hardcoding the wrong one silently sends a different token.

| Token | Cluster | Mint | Decimals |
|-------|---------|------|----------|
| USDC | mainnet-beta | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` | 6 |
| USDC (Circle dev) | devnet | `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` | 6 |

> Always confirm the current mint from an authoritative source (Circle / explorer) before shipping — see [resources.md](resources.md). Treat the mint as configuration, never a literal scattered through the code.

## Amounts: base units only

USDC is **6 decimals**. On-chain amounts are integers in base units. `1 USDC = 1_000_000` base units.

```typescript
// Convert human → base units with integer math (no floats!)
function toBaseUnits(human: string, decimals: number): bigint {
  const [whole, frac = ''] = human.split('.');
  const fracPadded = (frac + '0'.repeat(decimals)).slice(0, decimals);
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fracPadded || '0');
}
const amount = toBaseUnits('25.00', 6); // 25_000_000n
```

> **Never use JS `number`/floats for money.** `0.1 + 0.2 !== 0.3`. Use `bigint` (kit) or `BN` (web3.js) for base-unit amounts.

## Associated Token Accounts (ATAs)

A wallet holds each SPL token in a deterministic **ATA**. To pay someone in USDC, *their* USDC ATA must exist. If it doesn't, your transfer fails — so create it (payer covers ~0.002 SOL rent) as part of checkout.

```typescript
import {
  getAssociatedTokenAddress,
  getAccount,
  createAssociatedTokenAccountInstruction,
  createTransferCheckedInstruction,
  TokenAccountNotFoundError,
} from '@solana/spl-token';
import { PublicKey, TransactionInstruction } from '@solana/web3.js';

async function buildUsdcTransferIxs(
  connection: Connection,
  payer: PublicKey,         // signer + fee payer (customer or relayer)
  sender: PublicKey,        // token owner sending USDC (often === payer)
  recipient: PublicKey,     // merchant wallet owner
  mint: PublicKey,
  amount: bigint,
  decimals = 6,
): Promise<TransactionInstruction[]> {
  const ixs: TransactionInstruction[] = [];

  const sourceAta = await getAssociatedTokenAddress(mint, sender);
  const destAta = await getAssociatedTokenAddress(mint, recipient);

  // Create the recipient ATA if missing (payer funds rent).
  try {
    await getAccount(connection, destAta);
  } catch (e) {
    if (e instanceof TokenAccountNotFoundError) {
      ixs.push(createAssociatedTokenAccountInstruction(payer, destAta, recipient, mint));
    } else {
      throw e;
    }
  }

  // transferChecked enforces the mint + decimals — prefer it over transfer().
  ixs.push(
    createTransferCheckedInstruction(sourceAta, mint, destAta, sender, amount, decimals),
  );

  return ixs;
}
```

### Why `transferChecked`, not `transfer`

`transferChecked` includes the **mint and decimals** and the runtime verifies them. This prevents decimal mistakes and a class of wrong-mint/scaling bugs. Always use it for payments.

## Putting it together (web3.js)

```typescript
import {
  Connection, PublicKey, TransactionMessage, VersionedTransaction,
} from '@solana/web3.js';

async function buildUsdcPayment(connection: Connection, customer: PublicKey, opts: {
  recipient: PublicKey; mint: PublicKey; amount: bigint; reference: PublicKey;
}): Promise<VersionedTransaction> {
  const ixs = await buildUsdcTransferIxs(
    connection, customer, customer, opts.recipient, opts.mint, opts.amount,
  );

  // Tag the transfer with the Solana Pay reference for later lookup (verifying-payments.md).
  ixs[ixs.length - 1].keys.push({ pubkey: opts.reference, isSigner: false, isWritable: false });

  // NOTE: add dynamic priority fee + simulated compute-unit limit here, then send via the
  // reliable send/confirm loop. See solana-tx-skill (priority-fees, compute-budget, send-and-confirm).
  const { blockhash } = await connection.getLatestBlockhash('confirmed');
  const msg = new TransactionMessage({
    payerKey: customer,
    recentBlockhash: blockhash,
    instructions: ixs,
  }).compileToV0Message();

  return new VersionedTransaction(msg);
}
```

> The fee/CU/confirm parts are intentionally delegated to [solana-tx-skill](https://github.com/skyyycodes/solana-tx-skill). This skill owns *what* the payment is; that skill owns *getting it to land*.

## Native SOL payments

For SOL, skip ATAs and use a `SystemProgram.transfer`. Watch the **rent-exempt minimum**: don't drain a fee-payer below ~0.00089 SOL or the transfer fails with `InsufficientFundsForRent` (a common real bug — see solana-tx-skill's debugging guide). Stablecoins are usually the better UX for commerce (no SOL price volatility).

## Token-2022 note

Some tokens use **Token-2022** (transfer fees, hooks, etc.), a different program id. If the mint is owned by the Token-2022 program, pass that program id to the ATA/transfer helpers and account for **transfer fees** (the recipient may receive less than sent). Detect via the mint account owner. Most USDC today is classic SPL Token; verify before assuming.

## Pitfalls

| Pitfall | Fix |
|---------|-----|
| Hardcoding mainnet USDC mint, testing on devnet | Mint is per-cluster config; verify it |
| Floats for money | `bigint`/`BN` base units, integer conversion |
| `transfer` instead of `transferChecked` | Use `transferChecked` (mint+decimals enforced) |
| Recipient ATA doesn't exist → tx fails | Create it in the same tx (payer funds rent) |
| Assuming amount in URL == base units | Solana Pay URL is human units; convert for on-chain |
| Ignoring Token-2022 transfer fees | Detect program; account for fee on receipt |

## How this fits

- Requested via [solana-pay.md](solana-pay.md), settled via [verifying-payments.md](verifying-payments.md).
- Recurring USDC pulls → [subscriptions.md](subscriptions.md).
- Reliable landing of the transfer → [solana-tx-skill](https://github.com/skyyycodes/solana-tx-skill).
