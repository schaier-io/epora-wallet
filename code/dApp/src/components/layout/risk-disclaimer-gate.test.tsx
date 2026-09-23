import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { BetaConsentBoundary } from "./beta-consent-boundary";
import { CARDANO_NETWORK } from "@/lib/cardano-network";
import { LEGAL_VERSION } from "@/lib/legal";
import type * as DeploymentModule from "@/lib/network-deployments";

const pathname = vi.hoisted(() => ({ value: "/user" }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.value }));
const deployments = vi.hoisted(() => ({ mainnet: undefined as string | undefined, preprod: undefined as string | undefined }));
vi.mock("@/lib/network-deployments", async (importOriginal) => ({
  ...await importOriginal<typeof DeploymentModule>(),
  NETWORK_DEPLOYMENTS: deployments
}));
const mounted = vi.fn();
function Providers() { mounted(); return <p>Wallet application</p>; }
function Gate({ accepted = false }: { accepted?: boolean }) {
  return <BetaConsentBoundary initialAccepted={accepted} legalContent={<h1>Public legal document</h1>}><Providers /></BetaConsentBoundary>;
}
function checkAll() { for (const input of screen.getAllByRole("checkbox")) fireEvent.click(input); }

beforeEach(() => { pathname.value = "/user"; mounted.mockClear(); deployments.mainnet = undefined; deployments.preprod = undefined; });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("beta consent boundary", () => {
  it("renders the risk disclosure on the server and withholds wallet providers", () => {
    const html = renderToString(<Gate />);
    expect(html).toContain("No independent security audit");
    expect(html).toContain("permanent loss of all funds");
    expect(html).toContain("MIT License");
    expect(html).not.toContain("Wallet application");
    expect(mounted).not.toHaveBeenCalled();
  });

  it("requires five separate unchecked acknowledgements", () => {
    render(<Gate />);
    expect(screen.getAllByRole("main")).toHaveLength(1);
    const inputs = screen.getAllByRole("checkbox");
    expect(inputs).toHaveLength(5);
    expect(inputs[0]).toHaveAccessibleName("I have read and accept the Terms of Use.");
    for (const input of inputs) expect(input).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Accept risks and continue" })).toBeDisabled();
    for (const input of inputs.slice(0, 4)) fireEvent.click(input);
    expect(screen.getByRole("button", { name: "Accept risks and continue" })).toBeDisabled();
    fireEvent.click(inputs[4]!);
    expect(screen.getByRole("button", { name: "Accept risks and continue" })).toBeEnabled();
    expect(mounted).not.toHaveBeenCalled();
  });

  it("offers the network choice only once the other network is configured", () => {
    const { rerender } = render(<Gate />);
    expect(screen.queryByRole("navigation", { name: "Choose Cardano network" })).toBeNull();
    deployments[CARDANO_NETWORK === "mainnet" ? "preprod" : "mainnet"] = "https://other.example";
    rerender(<Gate />);
    expect(screen.getByRole("navigation", { name: "Choose Cardano network" })).toBeInTheDocument();
  });

  it("requires the liability release even when the other boxes are checked", () => {
    render(<Gate />);
    const release = screen.getByRole("checkbox", { name: /I release 41BIT LLC/ });
    expect(release).toHaveAccessibleName(/developers, maintainers, contributors, authors, and copyright holders/);
    expect(release).not.toBeChecked();
    for (const input of screen.getAllByRole("checkbox")) {
      if (input !== release) fireEvent.click(input);
    }
    expect(screen.getByRole("button", { name: "Accept risks and continue" })).toBeDisabled();
    fireEvent.click(release);
    expect(screen.getByRole("button", { name: "Accept risks and continue" })).toBeEnabled();
  });

  it.each(["/terms", "/privacy", "/legal", "/terms/"])("keeps %s readable without mounting providers", (path) => {
    pathname.value = path;
    render(<Gate />);
    expect(screen.getByRole("heading", { name: "Public legal document" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("No independent security audit");
    expect(mounted).not.toHaveBeenCalled();
  });

  it("links the terms and privacy before any acceptance", () => {
    render(<Gate />);
    expect(screen.getByRole("link", { name: "MIT License" })).toHaveAttribute("href", "https://github.com/schaier-io/epora-wallet/blob/main/LICENSE");
    expect(screen.getByRole("link", { name: "Terms of Use" })).toHaveAttribute("href", "/terms");
    expect(screen.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute("href", "/privacy");
  });

  it("mounts providers only after the server confirms the retained current cookie", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce({ ok: true, json: async () => ({ accepted: true, network: CARDANO_NETWORK, version: LEGAL_VERSION }) });
    vi.stubGlobal("fetch", fetcher);
    // The scroll must land on the app, so the app has to replace the gate before it runs.
    let appShownAtScroll = false;
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => { appShownAtScroll = screen.queryByText("Wallet application") !== null; });
    render(<Gate />);
    checkAll();
    fireEvent.click(screen.getByRole("button", { name: "Accept risks and continue" }));
    await screen.findByText("Wallet application");
    expect(JSON.parse((fetcher.mock.calls[0]![1] as RequestInit).body as string)).toEqual({ beta: true, unaudited: true, totalLoss: true, liabilityRelease: true, terms: true, network: CARDANO_NETWORK, version: LEGAL_VERSION });
    expect(fetcher).toHaveBeenCalledTimes(2);
    // The app opens at its top, not at the scroll that reached the accept button.
    expect(scrollTo).toHaveBeenCalledWith(0, 0);
    expect(appShownAtScroll).toBe(true);
  });

  it.each([false, "old"])("keeps providers blocked for a rejected or stale receipt (%s)", async (receipt) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce({ ok: true, json: async () => ({ accepted: receipt !== false, network: CARDANO_NETWORK, version: receipt === "old" ? "old" : LEGAL_VERSION }) }));
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    render(<Gate />);
    checkAll();
    fireEvent.click(screen.getByRole("button", { name: "Accept risks and continue" }));
    await screen.findByRole("alert");
    await waitFor(() => expect(screen.getByRole("button", { name: "Accept risks and continue" })).toBeEnabled());
    expect(mounted).not.toHaveBeenCalled();
    // A failed acceptance keeps the reader where the error shows.
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("ignores the former unversioned sessionStorage acceptance", () => {
    sessionStorage.setItem("permission-wallet:risk-acknowledgement", "accepted");
    render(<Gate />);
    expect(screen.getAllByRole("checkbox")).toHaveLength(5);
    expect(mounted).not.toHaveBeenCalled();
    sessionStorage.clear();
  });

  it("honors the current server-verified cookie", () => {
    render(<Gate accepted />);
    expect(screen.getByText("Wallet application")).toBeInTheDocument();
  });
});
