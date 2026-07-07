// Registers @testing-library/jest-dom's matchers on vitest's `expect` (runtime)
// and augments vitest's matcher types (this file is in the tsc program, so the
// `toBeInTheDocument()` etc. types resolve in *.test.tsx without extra config).
import "@testing-library/jest-dom/vitest";
