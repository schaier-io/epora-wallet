import { render, screen, cleanup } from "@testing-library/react";
import type * as DeploymentModule from "@/lib/network-deployments";
import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ network: "mainnet", preprod: "https://preprod.example" as string | undefined }));
vi.mock("@/lib/cardano-network", () => ({ get CARDANO_NETWORK() { return state.network; } }));
vi.mock("@/lib/network-deployments", async (importOriginal) => ({
  ...await importOriginal<typeof DeploymentModule>(),
  get NETWORK_DEPLOYMENTS() { return { mainnet: "https://mainnet.example", preprod: state.preprod }; }
}));

import { NetworkSwitch } from "./network-switch";

afterEach(cleanup);

describe("network switch", () => {
  it.each([
    ["mainnet", "Mainnet", "Preprod Test funds", "https://preprod.example/user"],
    ["preprod", "Preprod", "Mainnet Real funds", "https://mainnet.example/user"]
  ])("keeps %s active and links to the other isolated wallet home", (network, activeLabel, linkLabel, href) => {
    state.network = network;
    render(<NetworkSwitch />);
    const nav = screen.getByRole("navigation", { name: "Choose Cardano network" });
    expect(Array.from(nav.querySelectorAll("li"), (item) => item.textContent)).toEqual(["Preprod Test funds", "Mainnet Real funds"]);
    expect(nav.querySelector('[aria-current="true"]')).toHaveTextContent(activeLabel);
    expect(screen.getByRole("link", { name: linkLabel })).toHaveAttribute("href", href);
    expect(screen.getByRole("link", { name: linkLabel })).toHaveAttribute("rel", "noreferrer");
    expect(screen.getAllByRole("link")).toHaveLength(1);
    // A regular link unloads network-bound providers instead of reusing their state.
    expect(screen.getByRole("link", { name: linkLabel })).not.toHaveAttribute("target");
  });
});

it("shows an unconfigured network as unavailable without a guessed destination", () => {
  state.network = "mainnet";
  state.preprod = undefined;
  render(<NetworkSwitch />);
  expect(screen.getByText("Unavailable")).toBeInTheDocument();
  expect(screen.queryByRole("link")).toBeNull();
});
