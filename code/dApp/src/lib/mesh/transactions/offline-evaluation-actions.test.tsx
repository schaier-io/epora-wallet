// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createOfflineActionFixture } from "./offline-evaluation-action-fixture";

describe("actual Scalus spending and governance evaluation with SDK default cost models", () => {
  it.each(["state-update", "wallet-spend", "withdraw", "publish", "vote"] as const)("evaluates both %s build passes", async action => {
    const { build, passes } = await createOfflineActionFixture(action);
    const result = await build();
    expect(passes.length).toBeGreaterThanOrEqual(2);
    expect(passes.length).toBeLessThanOrEqual(4);
    if (action !== "withdraw") expect(passes[0]).toEqual(passes.at(-1));
    expect(result.executionUnits?.redeemers).toHaveLength(action === "state-update" ? 1 : 2);
    expect(passes.flat().every(redeemer => redeemer.budget.mem > 0 && redeemer.budget.steps > 0)).toBe(true);
  }, 30_000);

  it("rejects unauthorized State spending during actual evaluation", async () => {
    const { build, passes } = await createOfflineActionFixture("state-update", false);
    const error = await build().then(() => null, (reason: unknown) => reason);
    expect(String(error)).toMatch(/Evaluate redeemers failed: Tx evaluation failed:.*Error evaluated/);
    expect(passes).toHaveLength(0);
  }, 30_000);
});
