import { fireEvent, render, waitFor } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { Coins } from "lucide-react";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ fetchAssetMetadata: vi.fn() }));

vi.mock("@/lib/mesh/server-fetcher", () => ({
  ServerFetcher: class {
    fetchAssetMetadata = mocks.fetchAssetMetadata;
  }
}));

import { AssetIcon, prefetchAssetIcons } from "./asset-icon";

beforeEach(() => {
  mocks.fetchAssetMetadata.mockReset();
  window.sessionStorage.clear();
});

it("looks a logo up again after a failed lookup instead of remembering the failure", async () => {
  // A rate limit or a dropped connection was cached as "no logo" for the whole session.
  const unit = `${"cc".repeat(28)}aabb01`;
  mocks.fetchAssetMetadata.mockRejectedValue(new Error("429"));
  const first = render(<AssetIcon kind="stable" unit={unit} Icon={Coins} />);
  await waitFor(() => expect(mocks.fetchAssetMetadata).toHaveBeenCalledTimes(1));
  first.unmount();

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

  await waitFor(() => expect(mocks.fetchAssetMetadata).toHaveBeenCalledTimes(1));
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
  vi.resetModules();
  const { AssetIcon: FreshAssetIcon, prefetchAssetIcons: prefetch } = await import("./asset-icon");
  const unit = `${"ab".repeat(28)}01`;
  mocks.fetchAssetMetadata.mockResolvedValue(metadata);

  prefetch([unit]);

  await waitFor(() => {
    const snapshot = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) ?? "{}") as Record<string, { url: string }>;
    expect(snapshot[unit]?.url === "__none__").toBe(true);
  });
  const { container } = render(<FreshAssetIcon kind="token" unit={unit} Icon={Coins} />);
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
  prefetchAssetIcons([unit]);

  await waitFor(() => {
    const snapshot = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) ?? "{}") as Record<string, { url: string }>;
    expect(snapshot[unit]?.url === expectedUrl).toBe(true);
  });
  const { container } = render(<AssetIcon kind="token" unit={unit} Icon={Coins} />);
  expect(container.querySelector("img")?.getAttribute("src") === expectedUrl).toBe(true);
  expect(mocks.fetchAssetMetadata).toHaveBeenCalledTimes(1);
});

/**
 * The logo cache is hydrated from `sessionStorage`, which the server cannot see, and the
 * hook used to read it straight from the render body. For any asset an earlier visit had
 * cached, the server drew the Lucide fallback and the very first client render drew the
 * logo. React treats that as a hydration mismatch and throws the subtree away.
 *
 * `renderToStaticMarkup` stands in for the server render. It must not depend on what is in
 * `sessionStorage`.
 */
const STORAGE_KEY = "smart-wallet:asset-icon-cache:v1";
const SEEDED_UNIT = `${"ee".repeat(28)}aabb03`;
const SEEDED_LOGO = "data:image/png;base64,c2VlZGVk";

async function loadAssetIcon(seeded: boolean) {
  window.sessionStorage.clear();
  if (seeded) {
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ [SEEDED_UNIT]: { url: SEEDED_LOGO, fetchedAt: Date.now() } })
    );
  }
  // The hydration flag and the memory cache are module state, so each case needs its own
  // copy of the module.
  vi.resetModules();
  const reloaded = await import("./asset-icon");
  return reloaded.AssetIcon;
}

it("renders the same server markup whether or not the session cache holds the logo", async () => {
  mocks.fetchAssetMetadata.mockResolvedValue({});

  const Seeded = await loadAssetIcon(true);
  const seededMarkup = renderToStaticMarkup(
    <Seeded kind="stable" unit={SEEDED_UNIT} Icon={Coins} />
  );

  const Empty = await loadAssetIcon(false);
  const emptyMarkup = renderToStaticMarkup(
    <Empty kind="stable" unit={SEEDED_UNIT} Icon={Coins} />
  );

  expect(seededMarkup).toBe(emptyMarkup);
  expect(seededMarkup).not.toContain(SEEDED_LOGO);
});

it("still paints a cached logo without a second lookup once the client takes over", async () => {
  // Guards the test above from passing for the wrong reason: the seed has to be a cache the
  // client can actually read.
  mocks.fetchAssetMetadata.mockResolvedValue({});
  const Seeded = await loadAssetIcon(true);

  const { container } = render(<Seeded kind="stable" unit={SEEDED_UNIT} Icon={Coins} />);

  expect(container.querySelector("img")).toHaveAttribute("src", SEEDED_LOGO);
  expect(mocks.fetchAssetMetadata).not.toHaveBeenCalled();
});

it("rejects a protocol-relative icon at the final image sink", () => {
  const unit = `${"ff".repeat(28)}aabb05`;
  const identity = {
    symbol: "TRACK",
    name: "Tracker",
    decodedAssetName: "TRACK",
    knownMeta: {
      symbol: "TRACK",
      name: "Tracker",
      accent: "nft" as const,
      icon: "//example.test/tracker.png"
    }
  };
  const { container } = render(
    <AssetIcon kind="nft" unit={unit} identity={identity} Icon={Coins} />
  );

  expect(container.querySelector("img")).toBeNull();
  expect(container.querySelector("svg")).not.toBeNull();
  expect(mocks.fetchAssetMetadata).not.toHaveBeenCalled();
});
