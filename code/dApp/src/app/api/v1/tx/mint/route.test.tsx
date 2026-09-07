// @vitest-environment node
import { expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ build: vi.fn().mockResolvedValue({txHex:"84a0"}), reference: vi.fn().mockResolvedValue("shared#0") }));
vi.mock("@/lib/http/tx-route", () => ({createTxRoute: (options: {build: unknown}) => options.build}));
vi.mock("@/lib/mesh/transactions/mint-state-token", () => ({buildMintStateTokenTx:mocks.build}));
vi.mock("@/lib/mesh/shared-stt-reference-server", () => ({ requireSharedSttReferenceServer:mocks.reference }));
import { POST } from "./route";
const build = POST as unknown as (...args: unknown[]) => Promise<unknown>;
it("supplies the server reference when the caller omits it", async () => {
  const wallet = {}, fetcher = {};
  await build({address:"caller",stateDatum:{constructor:0,fields:[]}}, wallet, fetcher);
  expect(mocks.build).toHaveBeenCalledWith(wallet, {stateDatum:{constructor:0,fields:[]},sttSpendReference:"shared#0"},fetcher);
});
it("preserves explicit references for verification by the builder", async () => {
  mocks.reference.mockClear();
  await build({address:"caller",sttSpendReference:"explicit#1"}, {}, {});
  expect(mocks.reference).not.toHaveBeenCalled();
  expect(mocks.build.mock.calls.at(-1)?.[1]).toEqual({sttSpendReference:"explicit#1"});
});
