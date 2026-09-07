import { beforeEach, expect, it, vi } from "vitest";
import type { BuildResult } from "@/lib/types/contracts";

const mocks = vi.hoisted(() => ({ discover: vi.fn(), decode: vi.fn() }));
vi.mock("./helpers/transactions", () => ({ fetchScriptUtxos: mocks.discover }));
vi.mock("@/lib/proposals/verify", () => ({ decodeEffect: mocks.decode }));

import { buildReviewedBeneficiaryWithdrawal, omittedDiscoveredInputCount } from "./beneficiary-withdrawal-review";

const first = { txHash: "aa".repeat(32), outputIndex: 0 };
const second = { ...first, outputIndex: 1 };
const result: BuildResult = {
  txHex: "built-transaction",
  beneficiaryAccess: "removed",
  warnings: ["Any unused share is forfeited after this withdrawal."],
  preview: { action: "use-beneficiary", summary: "", cbor: "built-transaction" }
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.discover.mockResolvedValue([{ input: first }, { input: second }]);
  mocks.decode.mockReturnValue({ inputs: [first], decodeError: null });
});

it("reviews actual built inputs when an earlier beneficiary loses access", async () => {
  const reviewed = await buildReviewedBeneficiaryWithdrawal("wallet-address", async () => result);
  expect(mocks.discover).toHaveBeenCalledWith("wallet-address");
  expect(mocks.decode).toHaveBeenCalledWith(result.txHex);
  expect(reviewed.warnings).toEqual(expect.arrayContaining([
    expect.stringContaining("omits 1 discovered"),
    expect.stringContaining("unused share is forfeited")
  ]));
});

it("does not return a signable result when discovery fails", async () => {
  mocks.discover.mockRejectedValue(new Error("discovery failed"));
  await expect(buildReviewedBeneficiaryWithdrawal("wallet-address", async () => result)).rejects.toThrow("discovery failed");
});

it("does not return a signable result when transaction decoding fails", async () => {
  mocks.decode.mockReturnValue({ inputs: [], decodeError: "invalid transaction" });
  await expect(buildReviewedBeneficiaryWithdrawal("wallet-address", async () => result)).rejects.toThrow("invalid transaction");
});

it("limits the complete-selection claim to discovered UTxOs", async () => {
  mocks.decode.mockReturnValue({ inputs: [first, second], decodeError: null });
  const reviewed = await buildReviewedBeneficiaryWithdrawal("wallet-address", async () => result);
  expect(reviewed.warnings).toContain("All discovered UTxOs are selected. Discovery cannot prove that no other funds or later deposits exist.");
});

it("keeps final-beneficiary access and avoids forfeiture warnings and discovery", async () => {
  const finalResult: BuildResult = { ...result, beneficiaryAccess: "retained", warnings: ["Final recovery access remains available."] };
  const reviewed = await buildReviewedBeneficiaryWithdrawal(null, async () => finalResult);
  expect(reviewed).toBe(finalResult);
  expect(mocks.discover).not.toHaveBeenCalled();
  expect(mocks.decode).not.toHaveBeenCalled();
});

it("requires the builder to establish whether recovery access remains", async () => {
  await expect(buildReviewedBeneficiaryWithdrawal("wallet-address", async () => ({ ...result, beneficiaryAccess: undefined })))
    .rejects.toThrow("Recovery access after this withdrawal could not be determined");
});

it("counts distinct omitted inputs and normalizes transaction hash case", () => {
  expect(omittedDiscoveredInputCount([first, first, second], [{ ...first, txHash: first.txHash.toUpperCase() }])).toBe(1);
});
