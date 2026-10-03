import { beforeEach, describe, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => ({
  applyParamsToScript: vi.fn((code: string, params: string[]) => JSON.stringify([code, params])),
  resolveScriptHash: vi.fn((code: string, version: string) => JSON.stringify([code, version])),
  resolvePlutusScriptAddress: vi.fn((script: { code: string; version: string }, network: number) =>
    JSON.stringify([script.code, script.version, network]))
}));
vi.mock("@meshsdk/core", () => sdk);
vi.mock("@/lib/contracts/payout-address", () => ({ composeWalletReceiveAddress: vi.fn() }));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

const params = { sttPolicyId: "ab".repeat(28), sttAssetNameHex: "00" };

describe("blueprint derivation caches", () => {
  it("shares scripts across identical validator code and returns owned objects", async () => {
    const blueprint = await import("./blueprint");
    const first = blueprint.getWalletSpendScript(params);
    expect(blueprint.getWalletWithdrawScript(params)).toEqual(first);
    expect(blueprint.getWalletPublishScript(params)).toEqual(first);
    expect(blueprint.getWalletVoteScript(params)).toEqual(first);
    expect(sdk.applyParamsToScript).toHaveBeenCalledTimes(1);
    const expected = { ...first };
    first.code = "poisoned";
    first.version = "V1";
    expect(blueprint.getWalletSpendScript(params)).toEqual(expected);
    blueprint.getWalletSpendScript({ ...params, sttAssetNameHex: "01" });
    blueprint.getWalletSpendScript({ ...params, sttPolicyId: "cd".repeat(28) });
    expect(sdk.applyParamsToScript).toHaveBeenCalledTimes(3);
  });

  it("shares STT mint and spend derivations and caches hashes", async () => {
    const blueprint = await import("./blueprint");
    expect(blueprint.getSttMintScript()).toEqual(blueprint.getSttSpendScript());
    expect(blueprint.getSttMintPolicyId()).toEqual(blueprint.getSttMintPolicyId());
    expect(sdk.applyParamsToScript).toHaveBeenCalledTimes(1);
    expect(sdk.resolveScriptHash).toHaveBeenCalledTimes(1);
    expect(blueprint.resolveWalletSpendScriptHash(params)).toEqual(
      blueprint.resolveWalletSpendScriptHash(params)
    );
    expect(sdk.resolveScriptHash).toHaveBeenCalledTimes(2);
    blueprint.resolveWalletSpendScriptHash({ ...params, sttAssetNameHex: "01" });
    expect(sdk.resolveScriptHash).toHaveBeenCalledTimes(3);
  });

  it("keys public script hashes by exact code and version", async () => {
    const { resolveCachedScriptHash } = await import("./blueprint");
    const script = { code: "code", version: "V3" as const };
    const hash = resolveCachedScriptHash(script);
    expect(resolveCachedScriptHash({ ...script })).toBe(hash);
    expect(sdk.resolveScriptHash).toHaveBeenCalledTimes(1);
    expect(resolveCachedScriptHash({ ...script, code: "different" })).not.toBe(hash);
    expect(resolveCachedScriptHash({ ...script, version: "V2" })).not.toBe(hash);
    expect(sdk.resolveScriptHash).toHaveBeenCalledTimes(3);
  });

  it("keys addresses by script code, version and network", async () => {
    const { resolveScriptAddress } = await import("./blueprint");
    const script = { code: "code", version: "V3" as const };
    const preprod = resolveScriptAddress(script, "preprod");
    expect(resolveScriptAddress({ ...script }, "preprod")).toBe(preprod);
    expect(sdk.resolvePlutusScriptAddress).toHaveBeenCalledTimes(1);
    expect(resolveScriptAddress(script, "mainnet")).not.toBe(preprod);
    resolveScriptAddress(script, "preview");
    resolveScriptAddress({ ...script, code: "different" }, "preprod");
    resolveScriptAddress({ ...script, version: "V2" }, "preprod");
    expect(sdk.resolvePlutusScriptAddress).toHaveBeenCalledTimes(5);
  });

  it("invalidates script derivation when compiled blueprint code changes", async () => {
    const blueprint = await import("./blueprint");
    const data = (await import("./plutus.json")).default;
    const validator = data.validators.find(entry => entry.title === "wallet.wallet.spend")!;
    const original = validator.compiledCode;
    const before = blueprint.getWalletSpendScript(params);
    try {
      validator.compiledCode = "new-compiled-code";
      expect(blueprint.getWalletSpendScript(params)).not.toEqual(before);
      expect(sdk.applyParamsToScript).toHaveBeenCalledTimes(2);
    } finally {
      validator.compiledCode = original;
    }
  });

  it("bounds all caches and retains recently used entries", async () => {
    const blueprint = await import("./blueprint");
    const derive = (index: number) => {
      const selected = { ...params, sttAssetNameHex: index.toString(16) };
      blueprint.resolveWalletSpendScriptHash(selected);
      blueprint.resolveWalletSpendAddress(selected);
    };
    for (let index = 0; index < 128; index++) derive(index);
    derive(0);
    derive(128);
    derive(0);
    expect(sdk.applyParamsToScript).toHaveBeenCalledTimes(129);
    expect(sdk.resolveScriptHash).toHaveBeenCalledTimes(129);
    expect(sdk.resolvePlutusScriptAddress).toHaveBeenCalledTimes(129);
    derive(1);
    expect(sdk.applyParamsToScript).toHaveBeenCalledTimes(130);
    expect(sdk.resolveScriptHash).toHaveBeenCalledTimes(130);
    expect(sdk.resolvePlutusScriptAddress).toHaveBeenCalledTimes(130);
  });

  it("does not retain failed derivations", async () => {
    const blueprint = await import("./blueprint");
    sdk.applyParamsToScript.mockImplementationOnce(() => { throw new Error("invalid params"); });
    expect(() => blueprint.getWalletSpendScript(params)).toThrow("invalid params");
    blueprint.getWalletSpendScript(params);
    expect(sdk.applyParamsToScript).toHaveBeenCalledTimes(2);
    sdk.resolveScriptHash.mockImplementationOnce(() => { throw new Error("invalid script"); });
    expect(() => blueprint.resolveWalletSpendScriptHash(params)).toThrow("invalid script");
    blueprint.resolveWalletSpendScriptHash(params);
    expect(sdk.resolveScriptHash).toHaveBeenCalledTimes(2);
    sdk.resolvePlutusScriptAddress.mockImplementationOnce(() => { throw new Error("invalid address"); });
    expect(() => blueprint.resolveWalletSpendAddress(params)).toThrow("invalid address");
    blueprint.resolveWalletSpendAddress(params);
    expect(sdk.resolvePlutusScriptAddress).toHaveBeenCalledTimes(2);
  });
});
