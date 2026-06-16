import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Component/DOM tests run on vitest (jsdom); pure-logic tests stay on node:test.
// The split is by extension so the two runners never fight over the same files:
//   - vitest      → src/**/*.test.tsx   (rendering, hooks, DOM)
//   - node:test   → src/**/*.test.ts    (pure logic, see package.json "test")
// JSX is handled by esbuild's automatic runtime (matches tsconfig "react-jsx"),
// so no @vitejs/plugin-react / vite-version coupling is needed for tests.
export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.tsx"]
  },
  esbuild: {
    jsx: "automatic"
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url))
    }
  }
});
