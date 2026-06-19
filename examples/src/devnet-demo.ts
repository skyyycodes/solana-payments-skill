/**
 * Optional LIVE demo: lands a real transaction on devnet using the golden path.
 *
 * This is the end-to-end proof. It is NOT run in CI (CI only type-checks). Run it locally:
 *
 *   1. Create/fund a devnet keypair:
 *        solana-keygen new -o devnet.json
 *        solana airdrop 1 $(solana address -k devnet.json) --url devnet
 *   2. Run:
 *        SECRET_KEY="$(cat devnet.json)" RPC_URL="https://api.devnet.solana.com" npm run devnet
 *
 * It sends a tiny self-transfer (nets to the fee) and confirms it via the reliable sender,
 * then prints the explorer link.
 */
import {
  Connection,
  Keypair,
  SystemProgram,
  TransactionInstruction,
} from '@solana/web3.js';
import { sendWithRetries } from './reliable-web3js.js';

function loadKeypair(): Keypair {
  const raw = process.env.SECRET_KEY;
  if (!raw) {
    throw new Error('Set SECRET_KEY to a JSON array secret key (e.g. the contents of devnet.json)');
  }
  const bytes = Uint8Array.from(JSON.parse(raw) as number[]);
  return Keypair.fromSecretKey(bytes);
}

async function main(): Promise<void> {
  const rpcUrl = process.env.RPC_URL ?? 'https://api.devnet.solana.com';
  const connection = new Connection(rpcUrl, 'confirmed');
  const payer = loadKeypair();

  console.log(`Payer: ${payer.publicKey.toBase58()}`);
  const balance = await connection.getBalance(payer.publicKey);
  console.log(`Balance: ${balance} lamports`);
  if (balance < 100_000) {
    throw new Error('Insufficient balance. Airdrop devnet SOL first.');
  }

  // A trivial, safe instruction: transfer 1000 lamports to self (nets to just the fee).
  const instructions: TransactionInstruction[] = [
    SystemProgram.transfer({
      fromPubkey: payer.publicKey,
      toPubkey: payer.publicKey,
      lamports: 1000,
    }),
  ];

  const signature = await sendWithRetries(
    connection,
    payer.publicKey,
    [payer],
    instructions,
    [payer.publicKey], // writable accounts for the priority-fee estimate
  );

  console.log('Confirmed!');
  console.log(`https://explorer.solana.com/tx/${signature}?cluster=devnet`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
