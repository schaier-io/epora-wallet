import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ discover: vi.fn(), decode: vi.fn() }));
vi.mock("./helpers/transactions", () => ({ fetchScriptUtxos: mocks.discover }));
vi.mock("@/lib/proposals/verify", () => ({ decodeEffect: mocks.decode }));

import { buildReviewedBeneficiaryExit } from "./beneficiary-exit-review";

const first = { txHash: "aa".repeat(32), outputIndex: 0 };
const second = { ...first, outputIndex: 1 };
const result = {
  txHex: "built-transaction",
  preview: { action: "exit-beneficiary", summary: "", cbor: "built-transaction" }
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.discover.mockResolvedValue([{ input: first }, { input: second }]);
  mocks.decode.mockReturnValue({ inputs: [first], decodeError: null });
});

it("refreshes before building and reviews the actual built inputs", async () => {
  const build = vi.fn(async () => {
    expect(mocks.discover).toHaveBeenCalledWith("wallet-address");
    return result;
  });
  const reviewed = await buildReviewedBeneficiaryExit("wallet-address", build);
  expect(mocks.decode).toHaveBeenCalledWith(result.txHex);
  expect(reviewed.warnings).toEqual(expect.arrayContaining([
    expect.stringContaining("omits 1 discovered"),
    expect.stringContaining("permanently removes"),
    expect.stringContaining("unwithdrawn is forfeited")
  ]));
});

it("does not build from a failed discovery snapshot", async () => {
  mocks.discover.mockRejectedValue(new Error("discovery failed"));
  const build = vi.fn(async () => result);
  await expect(buildReviewedBeneficiaryExit("wallet-address", build)).rejects.toThrow("discovery failed");
  expect(build).not.toHaveBeenCalled();
});

it("does not return a signable result when transaction decoding fails", async () => {
  mocks.decode.mockReturnValue({ inputs: [], decodeError: "invalid transaction" });
  await expect(buildReviewedBeneficiaryExit("wallet-address", async () => result)).rejects.toThrow("invalid transaction");
});

it("limits the complete-selection claim to discovered UTxOs", async () => {
  mocks.decode.mockReturnValue({ inputs: [first, second], decodeError: null });
  const reviewed = await buildReviewedBeneficiaryExit("wallet-address", async () => result);
  expect(reviewed.warnings).toContain("All discovered UTxOs are selected. Discovery cannot prove that no other funds or future deposits exist.");
});
