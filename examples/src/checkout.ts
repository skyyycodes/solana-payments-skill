/**
 * Checkout: build a Solana Pay request + a USDC transfer transaction.
 *
 * Demonstrates the REQUEST + ASSET layers of solana-payments-skill:
 *  - a fresh `reference` per order (so the payment can be found + verified later)
 *  - base-unit integer amounts (never floats)
 *  - `transferChecked` (enforces mint + decimals)
 *  - create the recipient ATA if it doesn't exist
 *
 * The actual landing of this transaction is delegated to solana-tx-skill
 * (dynamic fee + simulated CU + confirm/retry).
 */
import { encodeURL } from '@solana/pay';
import {
  Connection,
  Keypair,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  getAccount,
  createAssociatedTokenAccountInstruction,
  createTransferCheckedInstruction,
  TokenAccountNotFoundError,
} from '@solana/spl-token';
import BigNumber from 'bignumber.js';

export const USDC_DECIMALS = 6;

/** Convert a human amount ("25.00") to integer base units using integer math (no floats). */
export function toBaseUnits(human: string, decimals: number): bigint {
  const [whole, frac = ''] = human.split('.');
  const fracPadded = (frac + '0'.repeat(decimals)).slice(0, decimals);
  return BigInt(whole || '0') * 10n ** BigInt(decimals) + BigInt(fracPadded || '0');
}

export interface CheckoutRequest {
  recipient: PublicKey; // merchant wallet owner
  mint: PublicKey; // USDC mint (per cluster)
  amountHuman: string; // e.g. "25.00"
  label: string;
  message: string;
}

export interface Checkout {
  url: URL; // Solana Pay URL (render as link or QR)
  reference: PublicKey; // UNIQUE per order — persist it with the order
}

/** Build a Solana Pay transfer request. Persist `reference` with the order so you can verify later. */
export function createCheckout(req: CheckoutRequest): Checkout {
  const reference = Keypair.generate().publicKey;
  const url = encodeURL({
    recipient: req.recipient,
    amount: new BigNumber(req.amountHuman),
    splToken: req.mint,
    reference,
    label: req.label,
    message: req.message,
  });
  return { url, reference };
}

/** Build the USDC transfer instructions, creating the recipient ATA if missing. */
export async function buildUsdcTransferIxs(
  connection: Connection,
  payer: PublicKey,
  sender: PublicKey,
  recipient: PublicKey,
  mint: PublicKey,
  amount: bigint,
  decimals: number = USDC_DECIMALS,
): Promise<TransactionInstruction[]> {
  const ixs: TransactionInstruction[] = [];
  const sourceAta = await getAssociatedTokenAddress(mint, sender);
  const destAta = await getAssociatedTokenAddress(mint, recipient);

  try {
    await getAccount(connection, destAta);
  } catch (e) {
    if (e instanceof TokenAccountNotFoundError) {
      ixs.push(createAssociatedTokenAccountInstruction(payer, destAta, recipient, mint));
    } else {
      throw e;
    }
  }

  ixs.push(createTransferCheckedInstruction(sourceAta, mint, destAta, sender, amount, decimals));
  return ixs;
}

/** Build a versioned USDC payment transaction tagged with the Solana Pay reference. */
export async function buildUsdcPayment(
  connection: Connection,
  customer: PublicKey,
  opts: { recipient: PublicKey; mint: PublicKey; amount: bigint; reference: PublicKey },
): Promise<VersionedTransaction> {
  const ixs = await buildUsdcTransferIxs(
    connection,
    customer,
    customer,
    opts.recipient,
    opts.mint,
    opts.amount,
  );

  // Tag the transfer with the reference so it can be found + verified later.
  ixs[ixs.length - 1].keys.push({
    pubkey: opts.reference,
    isSigner: false,
    isWritable: false,
  });

  // NOTE: add dynamic priority fee + simulated compute-unit limit here and send via the
  // reliable send/confirm loop — see solana-tx-skill (priority-fees, compute-budget, send-and-confirm).
  const { blockhash } = await connection.getLatestBlockhash('confirmed');
  const message = new TransactionMessage({
    payerKey: customer,
    recentBlockhash: blockhash,
    instructions: ixs,
  }).compileToV0Message();

  return new VersionedTransaction(message);
}
