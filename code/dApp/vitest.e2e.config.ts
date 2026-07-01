import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// E2E suite — runs the real builders against REAL preprod Blockfrost with a REAL
// funded test wallet (build -> sign -> submit). Kept entirely separate from the
// fast unit/component suites: its files are *.e2e.ts (so neither `pnpm test`'s
// node:test glob *.test.ts nor the default vitest *.test.tsx glob pick them up),
// and it only runs via `pnpm test:e2e`. Each test self-skips unless the required
// env is set (see the test files), so running it without secrets is a no-op.
//
// Required env:
//   BLOCKFROST_PREPROD_PROJECT_ID  — preprod Blockfrost project id (server reads this)
//   E2E_PREPROD_MNEMONIC           — space-separated mnemonic of a FUNDED preprod wallet
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.e2e.ts"],
    // Real chain round-trips + submission are slow; give them room.
    testTimeout: 180_000,
    hookTimeout: 180_000
  },
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url))
    }
  }
});
