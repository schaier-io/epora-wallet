import { render, screen, cleanup } from "@testing-library/react";
import type * as DeploymentModule from "@/lib/network-deployments";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ network: "mainnet", mainnet: undefined as string | undefined, preprod: undefined as string | undefined }));
vi.mock("@/lib/cardano-network", () => ({ get CARDANO_NETWORK() { return state.network; } }));
vi.mock("@/lib/network-deployments", async (importOriginal) => ({
  ...await importOriginal<typeof DeploymentModule>(),
  get NETWORK_DEPLOYMENTS() { return { mainnet: state.mainnet, preprod: state.preprod }; }
}));

import { NetworkSwitch } from "./network-switch";

beforeEach(() => {
  state.mainnet = "https://mainnet.example";
  state.preprod = "https://preprod.example";
});
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

  it.each([["mainnet", "preprod"], ["preprod", "mainnet"]] as const)("on %s, shows no choice until %s is configured", (network, other) => {
    state.network = network;
    state[other] = undefined;
    const { container } = render(<NetworkSwitch />);
    expect(container).toBeEmptyDOMElement();
  });

  it("on preview, offers only the configured networks", () => {
    state.network = "preview";
    state.mainnet = undefined;
    render(<NetworkSwitch />);
    const nav = screen.getByRole("navigation", { name: "Choose Cardano network" });
    expect(Array.from(nav.querySelectorAll("li"), (item) => item.textContent)).toEqual(["Preprod Test funds"]);
    expect(screen.getByRole("link", { name: "Preprod Test funds" })).toHaveAttribute("href", "https://preprod.example/user");
  });
});
