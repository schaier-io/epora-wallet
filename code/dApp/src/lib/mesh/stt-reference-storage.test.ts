import assert from "node:assert/strict";
import test from "node:test";
import { readSavedSttReference, saveSttReference } from "./stt-reference-storage";

test("saved STT reference is a validated locator scoped to script and network", async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "window");
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value)
  } } });
  try {
    assert.equal(readSavedSttReference(), undefined);
    const reference = `${"ab".repeat(32)}#3`;
    saveSttReference(reference);
    assert.equal(readSavedSttReference(), reference);
    assert.match([...values.keys()][0]!, /^epora:stt-reference:addr_test1.*:[0-9a-f]{56}$/);
    assert.throws(() => saveSttReference("not a reference"), /txHash#index/);
    assert.equal(readSavedSttReference(), reference);
    const { inspectSharedSttReferenceStore } = await import("./transactions/internals/reference-scripts");
    const { getSttSpendScript } = await import("@/lib/contracts/blueprint");
    const inspection = await inspectSharedSttReferenceStore({
      get: async () => assert.fail("Replacement must not inspect stale reference"),
      fetchUTxOs: async () => assert.fail("Replacement must not fetch stale reference"),
      fetchAddressUTxOs: async () => assert.fail("Replacement must not scan address")
    } as never, { configuredReference: "", script: getSttSpendScript(), stage: "test:replacement" });
    assert.equal(inspection.checkedReferenceCount, 0);
    assert.equal(readSavedSttReference(), reference);
  } finally {
    if (original) Object.defineProperty(globalThis, "window", original);
    else Reflect.deleteProperty(globalThis, "window");
  }
});
