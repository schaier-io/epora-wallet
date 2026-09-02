import { fireEvent, render, waitFor } from "@testing-library/react";
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
