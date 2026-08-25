// Registers @testing-library/jest-dom's matchers on vitest's `expect` (runtime)
// and augments vitest's matcher types (this file is in the tsc program, so the
// `toBeInTheDocument()` etc. types resolve in *.test.tsx without extra config).
import "@testing-library/jest-dom/vitest";

// Unmount and clear the DOM after every test. vitest runs without `globals`, so
// @testing-library/react's automatic afterEach(cleanup) does not self-register —
// without this, renders leak between tests and a later `queryByRole` can match
// an element left behind by an earlier test.
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(cleanup);

// jsdom ships no ResizeObserver, and Radix's positioning layer calls it on mount. Without
// this stub every popover test throws before it reaches its first assertion.
if (!("ResizeObserver" in globalThis)) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}
