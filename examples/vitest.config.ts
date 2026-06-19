import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Only the toolchain-free example tests run in the repo's default CI.
    // The subscription-program bankrun tests need the Anchor/Solana toolchain and
    // a compiled .so, so they live in their own package and are excluded here.
    include: ['test/**/*.test.ts'],
    exclude: ['node_modules/**', 'subscription-program/**'],
  },
});
