import { fireEvent, render, screen } from "@testing-library/react";
import { createStore } from "jotai";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { parseWorkspaceRouteState } from "@/components/user/workspace-controller";
import { routeStateAtom } from "@/components/user/workspace/atoms/workspace-route.atoms";
import { proposalKeys } from "@/lib/proposals/query";
import { createAppQueryClient } from "@/lib/query/client";
import { TestProviders } from "@/test/query-client";

import { SignerInvite } from "./signer-invite";

const WALLET_UNIT = `${"aa".repeat(28)}01`;
const OWNER_KEY = "dd".repeat(28);
const SIGNER_KEY = "bb".repeat(28);

function renderInvite({
  walletHashes = [SIGNER_KEY],
  registered
}: { walletHashes?: string[]; registered?: string[] } = {}) {
  const store = createStore();
  store.set(
    routeStateAtom,
    parseWorkspaceRouteState(new URLSearchParams({ wallet: WALLET_UNIT }))
  );

  const queryClient = createAppQueryClient();
  queryClient.setQueryData(proposalKeys.session, { paymentKeyHash: OWNER_KEY, address: "addr_test1x" });
  if (registered) {
    queryClient.setQueryData(proposalKeys.walletSigners(OWNER_KEY, WALLET_UNIT), registered);
  }

  return render(
    <TestProviders store={store} queryClient={queryClient}>
      <SignerInvite walletHashes={walletHashes} />
    </TestProviders>
  );
}

describe("SignerInvite", () => {
  beforeEach(() => {
    // Nothing here should reach the network: every query is seeded. A stub rather than a
    // missing global so an accidental request fails the test loudly instead of hanging.
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("no network in this test"))));
  });

  it("asks for a wallet ID before it offers to invite anyone", () => {
    renderInvite({ walletHashes: [] });

    expect(screen.getByText("No wallet ID yet")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /email/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /copy link/i })).not.toBeInTheDocument();
  });

  it("reports a co-signer who has not signed in, and offers every way to reach them", () => {
    renderInvite({ registered: [] });

    expect(screen.getByText("Has not signed in yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /copy link/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /email/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /text/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /show qr code/i })).toBeInTheDocument();
  });

  it("reports a co-signer who already registered", () => {
    renderInvite({ registered: [SIGNER_KEY] });

    expect(screen.getByText("Ready to co-sign")).toBeInTheDocument();
  });

  // Without a session the read is refused, and "refused" is not "has not registered".
  // Claiming the latter would tell the owner their co-signer is stuck when they are not.
  it("claims nothing about registration when the status is unavailable", () => {
    renderInvite();

    expect(screen.queryByText("Has not signed in yet")).not.toBeInTheDocument();
    expect(screen.queryByText("Ready to co-sign")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /copy link/i })).toBeInTheDocument();
  });

  it("puts the invite link in the mail and text drafts, encoded for a mail client", () => {
    renderInvite({ registered: [] });

    const expected = encodeURIComponent(
      `${window.location.origin}/user/proposals?wallet=${WALLET_UNIT}`
    );
    const mail = screen.getByRole("link", { name: /email/i }).getAttribute("href") ?? "";
    const text = screen.getByRole("link", { name: /text/i }).getAttribute("href") ?? "";

    expect(mail.startsWith("mailto:?subject=")).toBe(true);
    expect(mail).toContain(expected);
    expect(text.startsWith("sms:?body=")).toBe(true);
    expect(text).toContain(expected);
    // Form encoding would put "+" here, which a mail client shows literally.
    expect(mail).not.toContain("+");
  });

  // Asserted through the caption rather than by counting <svg>, because every button in
  // this panel carries a lucide icon and those are <svg viewBox> too.
  it("shows the QR code only after it is asked for", () => {
    renderInvite({ registered: [] });
    const caption = "They can scan this instead of opening the link.";
    expect(screen.queryByText(caption)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /show qr code/i }));

    expect(screen.getByText(caption)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /hide qr code/i })).toHaveAttribute(
      "aria-expanded",
      "true"
    );
  });
});
