/**
 * Stablecoin mint registry (USDC, PYUSD, EURC, USDe, …).
 *
 * THE GOLDEN RULE OF MINTS: a fake-token attack is trivial — anyone can mint a token called
 * "USDC". You must pin the *exact* mint address per cluster and verify against the official
 * issuer. Treat the non-USDC addresses below as STARTING POINTS to confirm from each issuer's
 * docs, not gospel. `selfVerifyRequired: true` means "confirm this address before mainnet use."
 *
 * Note the token program: USDC/EURC are classic SPL Token; PYUSD is Token-2022 (see
 * token-2022-payments.md — quote net-of-fee and resolve the owning program before transferring).
 */
export type Cluster = 'mainnet' | 'devnet';
export type TokenProgram = 'token' | 'token-2022';

export interface Stablecoin {
  symbol: string;
  name: string;
  decimals: number;
  program: TokenProgram;
  /** Pin the mint per cluster. Empty means "look it up from the issuer for that cluster." */
  mints: Partial<Record<Cluster, string>>;
  issuer: string;
  confirmFrom: string;
  /** USDC is well-known/verified here; others must be confirmed against the issuer first. */
  selfVerifyRequired: boolean;
}

export const STABLECOINS: Record<string, Stablecoin> = {
  USDC: {
    symbol: 'USDC',
    name: 'USD Coin (Circle)',
    decimals: 6,
    program: 'token',
    mints: {
      mainnet: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      devnet: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
    },
    issuer: 'Circle',
    confirmFrom: 'https://developers.circle.com/stablecoins/docs/usdc-on-test-networks',
    selfVerifyRequired: false,
  },
  PYUSD: {
    symbol: 'PYUSD',
    name: 'PayPal USD',
    decimals: 6,
    program: 'token-2022', // PYUSD on Solana is a Token-2022 mint
    mints: { mainnet: '2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo' },
    issuer: 'Paxos / PayPal',
    confirmFrom: 'https://developer.paypal.com/community/blog/pyusd-on-solana/',
    selfVerifyRequired: true,
  },
  EURC: {
    symbol: 'EURC',
    name: 'Euro Coin (Circle)',
    decimals: 6,
    program: 'token',
    mints: { mainnet: 'HzwqbKZw8HxMN6bF2yFZNrht3c2iXXzpKcFu7uBEDKtr' },
    issuer: 'Circle',
    confirmFrom: 'https://developers.circle.com/stablecoins/eurc-on-main-networks',
    selfVerifyRequired: true,
  },
  USDE: {
    symbol: 'USDe',
    name: 'Ethena USDe',
    decimals: 6,
    program: 'token',
    mints: {}, // confirm the Solana mint + decimals from Ethena before use
    issuer: 'Ethena',
    confirmFrom: 'https://ethena-labs.gitbook.io/ethena-labs',
    selfVerifyRequired: true,
  },
};

export function getStablecoin(symbol: string): Stablecoin {
  const coin = STABLECOINS[symbol.toUpperCase()];
  if (!coin) throw new Error(`Unknown stablecoin: ${symbol}`);
  return coin;
}

/**
 * Resolve the mint address for a symbol + cluster. Throws if the address isn't pinned —
 * which is the safe behavior: never guess a mint, look it up from the issuer.
 */
export function getMintAddress(symbol: string, cluster: Cluster): string {
  const coin = getStablecoin(symbol);
  const mint = coin.mints[cluster];
  if (!mint) {
    throw new Error(
      `No pinned ${symbol} mint for ${cluster}. Confirm it from the issuer: ${coin.confirmFrom}`,
    );
  }
  return mint;
}
