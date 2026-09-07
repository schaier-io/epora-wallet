// @vitest-environment node
import { expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  reference: vi.fn().mockResolvedValue("shared#0"),
  buildSttSpendTx: vi.fn().mockResolvedValue({ txHex: "84a0" })
}));

vi.mock("@/lib/http/tx-route", () => ({
  createTxRoute: (options: { build: (...args: unknown[]) => unknown }) => options.build
}));
vi.mock("@/lib/mesh/transactions/stt-spend", () => ({
  reference: vi.fn().mockResolvedValue("shared#0"),
  buildSttSpendTx: mocks.buildSttSpendTx
}));

vi.mock("@/lib/mesh/shared-stt-reference-server", () => ({ requireSharedSttReferenceServer: mocks.reference }));

import { POST } from "./route";

it("builds the STT transaction without a credential-wide lookup", async () => {
  const wallet = { kind: "server-wallet" };
  const fetcher = { kind: "server-fetcher" };
  const config = { sttAssetNameHex: "aa" };
  const input = {
    address: "addr_test1caller",
    config,
    action: "use-beneficiary" as const,
    sttInputTxHash: "bb".repeat(32),
    sttInputOutputIndex: 0
  };

  await (POST as unknown as (
    request: typeof input,
    walletSource: typeof wallet,
    txFetcher: typeof fetcher
  ) => Promise<unknown>)(input, wallet, fetcher);

  expect(mocks.buildSttSpendTx).toHaveBeenCalledWith(
    wallet,
    { ...config, sttSpendReference: "shared#0" },
    "use-beneficiary",
    {
      sttInputTxHash: "bb".repeat(32),
      sttInputOutputIndex: 0
    },
    fetcher
  );
});


it("preserves explicit references for verification by the builder", async () => {
  mocks.reference.mockClear();
  const config = { sttSpendReference: "explicit#1" };
  await (POST as unknown as (...args: unknown[]) => Promise<unknown>)(
    { address: "caller", config, action: "use-beneficiary", sttInputTxHash: "tx" }, {}, {}
  );
  expect(mocks.reference).not.toHaveBeenCalled();
  expect(mocks.buildSttSpendTx.mock.calls.at(-1)?.[1]).toEqual(config);
});
