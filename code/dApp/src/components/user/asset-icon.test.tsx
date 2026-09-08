import { fireEvent, render as renderUI, waitFor } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
import { Coins } from "lucide-react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createQueryTestWrapper } from "@/test/query-client";
import { queryKeys, queryPolicy } from "@/lib/query/keys";

const mocks = vi.hoisted(() => ({ fetchAssetMetadata: vi.fn(), signals: [] as AbortSignal[] }));
vi.mock("@/lib/mesh/server-fetcher", () => ({
  ServerFetcher: class {
    constructor(options?: { signal?: AbortSignal }) {
      if (options?.signal) mocks.signals.push(options.signal);
    }
    fetchAssetMetadata = mocks.fetchAssetMetadata;
  }
}));

import { AssetIcon, prefetchAssetIcons } from "./asset-icon";
let context: ReturnType<typeof createQueryTestWrapper>;
const render = (ui: ReactElement) => renderUI(ui, { wrapper: context.wrapper });

beforeEach(() => {
  context = createQueryTestWrapper();
  mocks.fetchAssetMetadata.mockReset();
  mocks.signals.length = 0;
  window.sessionStorage.clear();
});
afterEach(() => {
  context.queryClient.clear();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

it("evicts the oldest inactive icons once the Query cache passes its byte budget", async () => {
  const units = Array.from({ length: 17 }, (_, index) => `${"ba".repeat(28)}${index.toString(16).padStart(6, "0")}`);
  mocks.fetchAssetMetadata.mockResolvedValue({ logo: "A".repeat(500 * 1024) });
  await prefetchAssetIcons(context.queryClient, units);
  expect(mocks.fetchAssetMetadata).toHaveBeenCalledTimes(17);
  expect(context.queryClient.getQueryData(queryKeys.assetIcon(units[0]))).toBeUndefined();
  await prefetchAssetIcons(context.queryClient, [units[0]]);
  expect(mocks.fetchAssetMetadata).toHaveBeenCalledTimes(18);
  await prefetchAssetIcons(context.queryClient, [units[16]]);
  expect(mocks.fetchAssetMetadata).toHaveBeenCalledTimes(18);
});

it("keeps mounted icons while releasing overflow when they unmount", async () => {
  const units = Array.from({ length: 17 }, (_, index) => `${"bb".repeat(28)}${index.toString(16).padStart(6, "0")}`);
  mocks.fetchAssetMetadata.mockResolvedValue({ logo: "A".repeat(500 * 1024) });
  const view = render(<>{units.map(unit => <AssetIcon key={unit} kind="token" unit={unit} Icon={Coins} />)}</>);
  await waitFor(() => expect(view.container.querySelectorAll("img")).toHaveLength(17));
  expect(mocks.fetchAssetMetadata).toHaveBeenCalledTimes(17);
  view.unmount();
  expect(context.queryClient.getQueryData(queryKeys.assetIcon(units[0]))).toBeUndefined();
  expect(mocks.fetchAssetMetadata).toHaveBeenCalledTimes(17);
});

it("looks a logo up again after a failed lookup instead of remembering the failure", async () => {
  const unit = `${"cc".repeat(28)}aabb01`;
  mocks.fetchAssetMetadata.mockRejectedValue(new Error("429"));
  await prefetchAssetIcons(context.queryClient, [unit]);
  expect(context.queryClient.getQueryData(queryKeys.assetIcon(unit))).toBeUndefined();

  render(<AssetIcon kind="stable" unit={unit} Icon={Coins} />);
  await waitFor(() => expect(mocks.fetchAssetMetadata).toHaveBeenCalledTimes(2));
});

it.each([
  ["HTTP", { logo: "https://example.test/logo.png" }, "02"],
  ["IPFS", { image: "ipfs://example-cid/logo.png" }, "04"]
])("does not load a remote %s metadata image in the browser", async (_kind, metadata, suffix) => {
  const unit = `${"dd".repeat(28)}aabb${suffix}`;
  mocks.fetchAssetMetadata.mockResolvedValue(metadata);
  const { container } = render(<AssetIcon kind="stable" unit={unit} Icon={Coins} />);

  await waitFor(() => expect(context.queryClient.getQueryData(queryKeys.assetIcon(unit))).toBeNull());
  expect(container.querySelector("img")).toBeNull();
  expect(container.querySelector("svg")).not.toBeNull();
});

it("falls back to the badge icon when an embedded logo fails to load", async () => {
  const unit = `${"ee".repeat(28)}aabb03`;
  mocks.fetchAssetMetadata.mockResolvedValue({ logo: "data:image/png;base64,aW1hZ2U=" });
  const { container } = render(<AssetIcon kind="stable" unit={unit} Icon={Coins} />);
  const image = await waitFor(() => {
    const found = container.querySelector("img");
    expect(found).not.toBeNull();
    return found!;
  });
  fireEvent.error(image);
  expect(container.querySelector("img")).toBeNull();
  expect(container.querySelector("svg")).not.toBeNull();
});

const MAX_ICON_DATA_URI_LENGTH = 512 * 1024;
const PNG_DATA_URI_PREFIX = "data:image/png;base64,";

it.each([
  ["oversized image", { image: PNG_DATA_URI_PREFIX + "A".repeat(MAX_ICON_DATA_URI_LENGTH) }],
  ["oversized logo URI", { logo: PNG_DATA_URI_PREFIX + "A".repeat(MAX_ICON_DATA_URI_LENGTH) }],
  ["oversized raw logo", { logo: "A".repeat(MAX_ICON_DATA_URI_LENGTH) }],
  ["non-raster image", { image: "data:image/svg+xml;base64,PHN2Zy8+" }],
  ["non-raster logo", { logo: "data:image/svg+xml;base64,PHN2Zy8+" }]
])("rejects %s before prefetch caches metadata", async (_kind, metadata) => {
  const unit = `${"ab".repeat(28)}01`;
  mocks.fetchAssetMetadata.mockResolvedValue(metadata);
  await prefetchAssetIcons(context.queryClient, [unit]);

  expect(context.queryClient.getQueryData(queryKeys.assetIcon(unit))).toBeNull();
  const { container } = render(<AssetIcon kind="token" unit={unit} Icon={Coins} />);
  expect(container.querySelector("img")).toBeNull();
  expect(container.querySelector("svg")).not.toBeNull();
  expect(mocks.fetchAssetMetadata).toHaveBeenCalledTimes(1);
});

it.each([
  ["image", { image: PNG_DATA_URI_PREFIX + "aW1hZ2U=" }, PNG_DATA_URI_PREFIX + "aW1hZ2U=", "01"],
  ["logo URI", { logo: PNG_DATA_URI_PREFIX + "aW1hZ2U=" }, PNG_DATA_URI_PREFIX + "aW1hZ2U=", "02"],
  ["raw logo", { logo: "aW1hZ2U=" }, PNG_DATA_URI_PREFIX + "aW1hZ2U=", "03"],
  ["image at the size limit", {
    image: PNG_DATA_URI_PREFIX + "A".repeat(MAX_ICON_DATA_URI_LENGTH - PNG_DATA_URI_PREFIX.length)
  }, PNG_DATA_URI_PREFIX + "A".repeat(MAX_ICON_DATA_URI_LENGTH - PNG_DATA_URI_PREFIX.length), "04"]
])("caches and displays an accepted %s", async (_kind, metadata, expectedUrl, suffix) => {
  const unit = `${"ac".repeat(28)}${suffix}`;
  mocks.fetchAssetMetadata.mockResolvedValue(metadata);
  await prefetchAssetIcons(context.queryClient, [unit]);

  expect(context.queryClient.getQueryData(queryKeys.assetIcon(unit)) === expectedUrl).toBe(true);
  const { container } = render(<AssetIcon kind="token" unit={unit} Icon={Coins} />);
  expect(container.querySelector("img")?.getAttribute("src") === expectedUrl).toBe(true);
  expect(mocks.fetchAssetMetadata).toHaveBeenCalledTimes(1);
});

it("ignores the obsolete session cache during server rendering and browser lookup", async () => {
  const unit = `${"ee".repeat(28)}aabb03`;
  const { wrapper: Wrapper } = context;
  const emptyMarkup = renderToStaticMarkup(<Wrapper><AssetIcon kind="stable" unit={unit} Icon={Coins} /></Wrapper>);
  const oldLogo = "data:image/png;base64,c2VlZGVk";
  window.sessionStorage.setItem("smart-wallet:asset-icon-cache:v1", JSON.stringify({
    [unit]: { url: oldLogo, fetchedAt: Date.now() }
  }));
  const seededMarkup = renderToStaticMarkup(<Wrapper><AssetIcon kind="stable" unit={unit} Icon={Coins} /></Wrapper>);
  expect(seededMarkup).toBe(emptyMarkup);
  expect(seededMarkup).not.toContain(oldLogo);
  mocks.fetchAssetMetadata.mockResolvedValue({});
  const { container } = render(<AssetIcon kind="stable" unit={unit} Icon={Coins} />);
  await waitFor(() => expect(mocks.fetchAssetMetadata).toHaveBeenCalledTimes(1));
  expect(container.querySelector("img")).toBeNull();
});

it("rejects a protocol-relative icon at the final image sink", () => {
  const unit = `${"ff".repeat(28)}aabb05`;
  const identity = {
    symbol: "TRACK", name: "Tracker", decodedAssetName: "TRACK",
    knownMeta: { symbol: "TRACK", name: "Tracker", accent: "nft" as const, icon: "//example.test/tracker.png" }
  };
  const { container } = render(<AssetIcon kind="nft" unit={unit} identity={identity} Icon={Coins} />);
  expect(container.querySelector("img")).toBeNull();
  expect(container.querySelector("svg")).not.toBeNull();
  expect(mocks.fetchAssetMetadata).not.toHaveBeenCalled();
});

it("deduplicates prefetches with mounted badges", async () => {
  const unit = `${"ab".repeat(28)}02`;
  let resolve!: (metadata: unknown) => void;
  mocks.fetchAssetMetadata.mockImplementation(() => new Promise(done => { resolve = done; }));
  const prefetched = prefetchAssetIcons(context.queryClient, [unit, unit, "lovelace"]);
  const { container } = render(<><AssetIcon kind="token" unit={unit} Icon={Coins} /><AssetIcon kind="token" unit={unit} Icon={Coins} /></>);
  expect(mocks.fetchAssetMetadata).toHaveBeenCalledTimes(1);
  resolve({ logo: "aW1hZ2U=" });
  await prefetched;
  await waitFor(() => expect(container.querySelectorAll("img")).toHaveLength(2));
});

it("refreshes a missing logo after one minute while retaining fresh successful logos", async () => {
  const missing = `${"ab".repeat(28)}03`;
  const found = `${"ab".repeat(28)}04`;
  const now = Date.now();
  vi.spyOn(Date, "now").mockReturnValue(now);
  mocks.fetchAssetMetadata.mockResolvedValueOnce({}).mockResolvedValue({ logo: "aW1hZ2U=" });
  await prefetchAssetIcons(context.queryClient, [missing, found]);
  await prefetchAssetIcons(context.queryClient, [missing, found]);
  expect(mocks.fetchAssetMetadata).toHaveBeenCalledTimes(2);
  vi.spyOn(Date, "now").mockReturnValue(now + queryPolicy.missingMetadataStaleMs + 1);
  await prefetchAssetIcons(context.queryClient, [missing, found]);
  expect(mocks.fetchAssetMetadata).toHaveBeenCalledTimes(3);
  expect(context.queryClient.getQueryData(queryKeys.assetIcon(missing))).toBe(PNG_DATA_URI_PREFIX + "aW1hZ2U=");
});

it("aborts an unused request and does not show a previous unit's logo", async () => {
  const first = `${"ab".repeat(28)}05`;
  const second = `${"ab".repeat(28)}06`;
  mocks.fetchAssetMetadata.mockResolvedValueOnce({ logo: "aW1hZ2U=" }).mockImplementation(() => new Promise(() => {}));
  const rendered = render(<AssetIcon kind="token" unit={first} Icon={Coins} />);
  await waitFor(() => expect(rendered.container.querySelector("img")).not.toBeNull());
  rendered.rerender(<AssetIcon kind="token" unit={second} Icon={Coins} />);
  expect(rendered.container.querySelector("img")).toBeNull();
  await waitFor(() => expect(mocks.signals).toHaveLength(2));
  rendered.unmount();
  expect(mocks.signals[1].aborted).toBe(true);
});
