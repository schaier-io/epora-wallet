// @vitest-environment node
import { expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  buildSttSpendTx: vi.fn().mockResolvedValue({ txHex: "84a0" }),
  fetchCredentialUtxosFromKoios: vi.fn()
}));

vi.mock("@/lib/http/tx-route", () => ({
  createTxRoute: (options: { build: (...args: unknown[]) => unknown }) => options.build
}));
vi.mock("@/lib/mesh/transactions/stt-spend", () => ({
  buildSttSpendTx: mocks.buildSttSpendTx
}));
vi.mock("@/lib/discovery/koios-server", () => ({
  fetchCredentialUtxosFromKoios: mocks.fetchCredentialUtxosFromKoios
}));

import { POST } from "./route";

it("injects the direct server credential lookup into the STT builder", async () => {
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
    config,
    "use-beneficiary",
    {
      sttInputTxHash: "bb".repeat(32),
      sttInputOutputIndex: 0
    },
    fetcher,
    mocks.fetchCredentialUtxosFromKoios
  );
});
