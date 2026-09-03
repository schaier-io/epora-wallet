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

import { AssetIcon } from "./asset-icon";

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

it("falls back to the badge icon when the logo image fails to load", async () => {
  // The broken image was hidden with a style and nothing else was drawn in its place.
  const unit = `${"dd".repeat(28)}aabb02`;
  mocks.fetchAssetMetadata.mockResolvedValue({ logo: "https://example.test/logo.png" });
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
const SEEDED_LOGO = "https://example.test/seeded.png";

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
