// Component-less .tsx file on purpose: this repo's vitest run only picks up
// *.test.tsx (see vitest.config.ts), and the client init gate deserves a
// runner-level test because instrumentation-client.ts executes at import time.
// The Sentry SDK is mocked, so nothing ever initializes for real.
import { strict as assert } from "node:assert";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { initSpy, dedupeSpy } = vi.hoisted(() => ({
  initSpy: vi.fn(),
  dedupeSpy: vi.fn(() => ({ name: "Dedupe" }))
}));

vi.mock("@sentry/nextjs", () => ({
  init: initSpy,
  dedupeIntegration: dedupeSpy
}));

const GATE_ENV_VARS = [
  "NEXT_PUBLIC_SENTRY_DSN",
  "NEXT_PUBLIC_SENTRY_RELEASE",
  "NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA",
  "NEXT_PUBLIC_SENTRY_ENVIRONMENT"
] as const;

async function importClientEntry(): Promise<void> {
  // Fresh module evaluation per case: the gate runs at import time. The
  // exported promise makes the dynamic-import path deterministic under test.
  const clientEntry = await import("./instrumentation-client");
  await clientEntry.sentryInit;
}

describe("instrumentation-client init gate", () => {
  it("never imports the Sentry SDK statically, or the gate cannot keep it out of page bundles", async () => {
    // The whole point of the dynamic import is that credential-free builds
    // ship no Sentry code. A static import survives tree-shaking (verified in
    // the #388 review: ~144 KB gzip of SDK on every page), and vi.mock cannot
    // tell the two apart, so pin the import mode at the source level.
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("src/instrumentation-client.ts", "utf8");
    assert.doesNotMatch(source, /import\s+\*\s+as\s+\w+\s+from\s+"@sentry\/nextjs"/);
    assert.match(source, /import\("@sentry\/nextjs"\)/);
  });

  beforeEach(() => {
    vi.resetModules();
    initSpy.mockClear();
    dedupeSpy.mockClear();
    for (const name of GATE_ENV_VARS) {
      delete process.env[name];
    }
  });

  it("never initializes Sentry without NEXT_PUBLIC_SENTRY_DSN", async () => {
    await importClientEntry();

    expect(initSpy).not.toHaveBeenCalled();
    expect(dedupeSpy).not.toHaveBeenCalled();
  });

  it("initializes once with scrubbing wired when the DSN is present", async () => {
    process.env.NEXT_PUBLIC_SENTRY_DSN = "https://examplePublicKey@o0.ingest.sentry.io/0";

    await importClientEntry();

    expect(initSpy).toHaveBeenCalledTimes(1);
    const options = initSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(options.dsn).toBe("https://examplePublicKey@o0.ingest.sentry.io/0");
    expect(typeof options.beforeSend).toBe("function");
    expect(dedupeSpy).toHaveBeenCalledTimes(1);
  });
});
