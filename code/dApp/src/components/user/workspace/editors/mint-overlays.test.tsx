import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { confettiRendered } = vi.hoisted(() => ({
  confettiRendered: vi.fn()
}));

// The celebration fires a one-shot confetti canvas as pure decoration; the
// progress overlay must stay quiet.
vi.mock("@/components/user/confetti-burst", () => {
  return {
    ConfettiBurst: () => {
      confettiRendered();
      return <canvas data-testid="confetti-burst" />;
    }
  };
});
vi.mock("@/components/user/wallet-membership-card", () => ({
  WalletMembershipCard: () => <div data-testid="membership-card" />
}));

const { MintCelebrationOverlay, WalletCreationFullscreenProgress } = await import(
  "@/components/user/workspace/editors/primitives"
);

const COMPLETION = {
  title: "Confirming Family wallet…",
  description: "Your transaction is on the network. This usually takes a block or two.",
  statusLabel: "Waiting for the network to confirm.",
  progress: 45
};

/**
 * The transaction block sets its value in `font-mono`, which is right for a 64-character
 * hash and wrong for the sentence that stands in before one exists: "waiting for network…"
 * was rendered in the hash's own typeface, so it read as a value to copy rather than a
 * status.
 */
describe("wallet creation progress overlay", () => {
  it("does not fire confetti or load decoration while minting is in progress", () => {
    render(<WalletCreationFullscreenProgress completion={COMPLETION} submitHash={null} />);

    expect(screen.queryByTestId("confetti-burst")).not.toBeInTheDocument();
    expect(confettiRendered).not.toHaveBeenCalled();
  });

  it("does not set its waiting message in the hash typeface", () => {
    render(<WalletCreationFullscreenProgress completion={COMPLETION} submitHash={null} />);

    const waiting = screen.getByText("Waiting for the network…");
    expect(waiting.className).not.toContain("font-mono");
    // The percentage keeps `font-mono` for tabular digits, so this asks about the one node.
    expect(waiting.className).toContain("text-muted-foreground");
  });

  it("shows the real hash in monospace once there is one", () => {
    const hash = "ab".repeat(32);
    render(<WalletCreationFullscreenProgress completion={COMPLETION} submitHash={hash} />);

    const value = screen.getByText(hash);
    expect(value.className).toContain("font-mono");
    expect(screen.queryByText("Waiting for the network…")).not.toBeInTheDocument();
  });

  it("announces itself politely while the mint is in flight", () => {
    render(<WalletCreationFullscreenProgress completion={COMPLETION} submitHash={null} />);

    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveTextContent("Waiting for the network to confirm.");
  });

  it("renders nothing when there is no mint to report", () => {
    const { container } = render(
      <WalletCreationFullscreenProgress completion={null} submitHash={null} />
    );
    expect(container).toBeEmptyDOMElement();
  });
});

/**
 * Recovery contacts are optional at creation (`config-mint-view.tsx:169` invites the reader
 * to add them "only when this wallet needs them"), so "Secured on Cardano Preprod by
 * on-chain recovery" was not true of every wallet this overlay celebrates. The same sentence
 * carried an em dash, which is banned in shipped copy.
 */
describe("mint celebration overlay", () => {
  function renderCelebration() {
    return render(
      <MintCelebrationOverlay
        walletName="Family wallet"
        sttPolicyId="policy"
        createdWalletUnit="policy.asset"
        onOpenWallet={vi.fn()}
        onCreateAnother={vi.fn()}
        onClose={vi.fn()}
      />
    );
  }

  it("fires the confetti burst only when the celebration renders", () => {
    renderCelebration();

    expect(screen.getByTestId("confetti-burst")).toBeInTheDocument();
    expect(confettiRendered).toHaveBeenCalledTimes(1);
  });

  it("does not claim a recovery feature the wallet may not have", () => {
    const { container } = renderCelebration();

    expect(container.textContent).not.toContain("on-chain recovery");
    expect(container.textContent).toContain("no new seed phrase");
  });

  it("carries no em dash", () => {
    const { container } = renderCelebration();

    expect(container.textContent).not.toMatch(/[—–]/);
  });

  it("still names the wallet and offers both ways out", () => {
    renderCelebration();

    expect(screen.getByRole("heading", { name: "Family wallet is live" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open wallet" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create another wallet" })).toBeInTheDocument();
  });
});

/**
 * Both overlays cover the screen and neither said so. The celebration was a bare `div`: a
 * screen reader announced nothing when it opened, and Tab walked past its two buttons into
 * the workspace behind it.
 *
 * The progress overlay had the opposite problem. `role="status" aria-live="polite"` sat on
 * the whole overlay, and the confirmation poll re-renders it several times a minute, so a
 * reader heard the heading, the description, the percentage and the whole transaction hash
 * read out again on every tick.
 */
describe("mint overlay modal semantics", () => {
  function mountPageBehind() {
    const page = document.createElement("main");
    page.dataset.testPage = "";
    page.innerHTML = '<button type="button">Behind the overlay</button>';
    document.body.appendChild(page);
    return page.querySelector("button")!;
  }

  afterEach(() => {
    for (const page of Array.from(document.querySelectorAll("main[data-test-page]"))) {
      page.remove();
    }
  });

  it("announces the celebration as a modal named by its heading", () => {
    render(
      <MintCelebrationOverlay
        walletName="Family wallet"
        sttPolicyId={null}
        createdWalletUnit="unit"
        onOpenWallet={vi.fn()}
        onCreateAnother={vi.fn()}
        onClose={vi.fn()}
      />
    );

    const dialog = screen.getByRole("dialog", { name: /Family wallet/ });
    expect(dialog).toHaveAttribute("aria-modal", "true");
  });

  it("keeps Tab inside the celebration", () => {
    const behind = mountPageBehind();
    render(
      <MintCelebrationOverlay
        walletName="Family wallet"
        sttPolicyId={null}
        createdWalletUnit="unit"
        onOpenWallet={vi.fn()}
        onCreateAnother={vi.fn()}
        onClose={vi.fn()}
      />
    );

    // What a click on the overlay's own backdrop leaves behind.
    (document.activeElement as HTMLElement | null)?.blur();
    fireEvent.keyDown(window, { key: "Tab" });

    expect(screen.getByRole("dialog").contains(document.activeElement)).toBe(true);
    expect(document.activeElement).not.toBe(behind);
  });

  it("moves focus into the celebration and gives it back on close", () => {
    vi.useFakeTimers();
    try {
      const trigger = mountPageBehind();
      trigger.focus();

      const view = render(
        <MintCelebrationOverlay
          walletName="Family wallet"
          sttPolicyId={null}
          createdWalletUnit="unit"
          onOpenWallet={vi.fn()}
          onCreateAnother={vi.fn()}
          onClose={vi.fn()}
        />
      );
      act(() => {
        vi.runOnlyPendingTimers();
      });
      expect(screen.getByRole("dialog").contains(document.activeElement)).toBe(true);

      view.unmount();

      expect(document.activeElement).toBe(trigger);
    } finally {
      vi.useRealTimers();
    }
  });

  it("closes the celebration on Escape", () => {
    const onClose = vi.fn();
    render(
      <MintCelebrationOverlay
        walletName="Family wallet"
        sttPolicyId={null}
        createdWalletUnit="unit"
        onOpenWallet={vi.fn()}
        onCreateAnother={vi.fn()}
        onClose={onClose}
      />
    );

    fireEvent.keyDown(window, { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("leaves Escape alone when there is nothing to close", () => {
    // Swallowing the key with no handler would leave a reader with no way out of an
    // overlay, and no other listener able to offer one.
    render(<WalletCreationFullscreenProgress completion={COMPLETION} submitHash={null} />);

    const event = new KeyboardEvent("keydown", { key: "Escape", cancelable: true });
    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
  });

  it("keeps Shift+Tab inside when focus is still on the dialog itself", () => {
    // The state the overlay actually opens in. The container is not one of its own
    // descendants, so it matches neither Tab boundary, and a backward Tab from there used
    // to walk out to whatever precedes the overlay in the document.
    const behind = mountPageBehind();
    render(
      <MintCelebrationOverlay
        walletName="Family wallet"
        sttPolicyId={null}
        createdWalletUnit="unit"
        onOpenWallet={vi.fn()}
        onCreateAnother={vi.fn()}
        onClose={vi.fn()}
      />
    );
    const dialog = screen.getByRole("dialog");
    dialog.focus();
    expect(document.activeElement).toBe(dialog);

    fireEvent.keyDown(window, { key: "Tab", shiftKey: true });

    expect(document.activeElement).not.toBe(behind);
    const controls = Array.from(dialog.querySelectorAll("button"));
    expect(document.activeElement).toBe(controls[controls.length - 1]!);
  });

  it("wraps Tab around the celebration's own controls", () => {
    render(
      <MintCelebrationOverlay
        walletName="Family wallet"
        sttPolicyId={null}
        createdWalletUnit="unit"
        onOpenWallet={vi.fn()}
        onCreateAnother={vi.fn()}
        onClose={vi.fn()}
      />
    );
    const dialog = screen.getByRole("dialog");
    const controls = Array.from(dialog.querySelectorAll("button"));
    const first = controls[0]!;
    const last = controls[controls.length - 1]!;
    expect(controls.length).toBeGreaterThan(1);

    last.focus();
    fireEvent.keyDown(window, { key: "Tab" });
    expect(document.activeElement).toBe(first);

    first.focus();
    fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it("lands on the dialog itself, so its heading is read before any control", () => {
    // Landing on the first control puts focus on the X button, where Enter dismisses the
    // very thing the reader has just been told about.
    vi.useFakeTimers();
    try {
      render(
        <MintCelebrationOverlay
          walletName="Family wallet"
          sttPolicyId={null}
          createdWalletUnit="unit"
          onOpenWallet={vi.fn()}
          onCreateAnother={vi.fn()}
          onClose={vi.fn()}
        />
      );
      act(() => {
        vi.runOnlyPendingTimers();
      });

      expect(document.activeElement).toBe(screen.getByRole("dialog"));
    } finally {
      vi.useRealTimers();
    }
  });

  it("announces only the status line while the mint is confirming", () => {
    render(
      <WalletCreationFullscreenProgress
        completion={COMPLETION}
        submitHash={"ab".repeat(32)}
        onClose={vi.fn()}
      />
    );

    const dialog = screen.getByRole("dialog", { name: COMPLETION.title });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).not.toHaveAttribute("aria-live");

    // Whatever else the overlay grows, no live region may contain the heading, the
    // description or the hash: a poll must not read the whole overlay out again.
    for (const live of dialog.querySelectorAll("[aria-live]")) {
      expect(live.textContent).toBe(COMPLETION.statusLabel);
    }
    expect(dialog.querySelectorAll("[aria-live]").length).toBeGreaterThan(0);
  });

  it("reports progress through the bar rather than announcing every tick", () => {
    render(
      <WalletCreationFullscreenProgress
        completion={COMPLETION}
        submitHash={null}
        onClose={vi.fn()}
      />
    );

    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "45");
    expect(bar).toHaveAttribute("aria-valuemin", "0");
    expect(bar).toHaveAttribute("aria-valuemax", "100");
    // A bar with no name is announced as a bare percentage. It borrows the heading the
    // dialog is already named by, so it says which job the percentage belongs to.
    expect(bar).toHaveAccessibleName(COMPLETION.title);
    expect(bar.closest("[aria-live]")).toBeNull();
  });
});

/**
 * Adopting `useModalIsolation` brought two behaviours neither overlay had before: `inert` on
 * every background sibling up to `<body>`, and a background scroll lock. Both are invisible
 * to the assertions above, so deleting either restore would have gone unnoticed.
 */
describe("mint overlay background isolation", () => {
  function mountPageBehind() {
    const page = document.createElement("main");
    page.dataset.testPage = "";
    page.innerHTML = '<button type="button">Behind the overlay</button>';
    document.body.appendChild(page);
    return page;
  }

  function mountToastHost() {
    const host = document.createElement("div");
    host.dataset.testPage = "";
    host.setAttribute("data-modal-passthrough", "");
    document.body.appendChild(host);
    return host;
  }

  afterEach(() => {
    for (const node of Array.from(document.querySelectorAll("[data-test-page]"))) {
      node.remove();
    }
    document.body.style.overflow = "";
  });

  it("marks the page behind it inert, and clears that again on close", () => {
    const behind = mountPageBehind();

    const view = render(
      <WalletCreationFullscreenProgress completion={COMPLETION} submitHash={null} />
    );
    expect(behind).toHaveAttribute("inert");

    view.unmount();

    expect(behind).not.toHaveAttribute("inert");
  });

  /**
   * Toasts are stacked above every modal and are raised from inside one: the celebration's
   * membership card reports saving and sharing through them. Inerting the host left them
   * painted on screen but unannounced, unfocusable and impossible to dismiss.
   */
  it("leaves a host marked as passing through the modal alone", () => {
    const host = mountToastHost();

    render(<WalletCreationFullscreenProgress completion={COMPLETION} submitHash={null} />);

    expect(host).not.toHaveAttribute("inert");
  });

  it("locks background scrolling while it is open, and gives it back", () => {
    const view = render(
      <WalletCreationFullscreenProgress completion={COMPLETION} submitHash={null} />
    );
    expect(document.body.style.overflow).toBe("hidden");

    view.unmount();

    expect(document.body.style.overflow).toBe("");
  });
});
