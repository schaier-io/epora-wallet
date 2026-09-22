import type { ReactElement } from "react";
import { fireEvent, render as renderUI, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryTestWrapper } from "@/test/query-client";
import { retryQuery } from "@/lib/query/client";
import type { GovernanceAction } from "@/lib/api/governance-actions";

const holder = vi.hoisted(() => ({
  drepId: "drep1y05ae0uf55xpmph3jmxmfayr6f0up2hvquwjn929zmgvlxqdjsap6" as string | null,
  voteJson: "{}",
  setVoteJson: vi.fn()
}));

vi.mock(
  "@/components/user/workspace/atoms/workspace-wallet-derivations.atoms",
  async (importOriginal) => {
    const { atom } = await import("jotai");
    return {
      ...(await importOriginal<Record<string, unknown>>()),
      walletDrepIdAtom: atom(() => holder.drepId)
    };
  }
);

vi.mock("@/components/user/workspace/forms/use-vote-form", () => ({
  useVoteForm: () => ({ voteJson: holder.voteJson, setVoteJson: holder.setVoteJson })
}));

const { GovernanceVotePicker } = await import("@/components/user/workspace/governance-vote-picker");

const TX_HASH = "0ecc74fe26532cec1ab9a299f082afc436afc888ca2dc0fc6acda431c52dc60d";
const ACTION: GovernanceAction = {
  id: "gov_action1zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zygsq6dmejn",
  txHash: TX_HASH,
  index: 0,
  type: "treasury_withdrawals",
  title: "Fund the node",
  abstract: "Pay for a year.",
  expirationEpoch: 240,
  status: "active"
};

let context: ReturnType<typeof createQueryTestWrapper>;
const render = (ui: ReactElement) => renderUI(ui, { wrapper: context.wrapper });

beforeEach(() => {
  context = createQueryTestWrapper();
  holder.drepId = "drep1y05ae0uf55xpmph3jmxmfayr6f0up2hvquwjn929zmgvlxqdjsap6";
  holder.voteJson = "{}";
  holder.setVoteJson = vi.fn();
});
afterEach(() => {
  context.queryClient.clear();
  vi.unstubAllGlobals();
});

function stubLookup(action: GovernanceAction) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ action })));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function lookUp(pasted: string, action = ACTION) {
  const fetchMock = stubLookup(action);
  render(<GovernanceVotePicker />);
  fireEvent.change(screen.getByLabelText("Governance action"), { target: { value: pasted } });
  fireEvent.click(screen.getByRole("button", { name: /Look up/ }));
  await waitFor(() => expect(screen.getByText(action.title ?? "")).toBeInTheDocument());
  return fetchMock;
}

describe("finding the action", () => {
  it("looks up the id inside a pasted explorer link and shows what the action is", async () => {
    const fetchMock = await lookUp(`https://explorer.example/governance/${ACTION.id}`);

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/v1/governance-actions?id=${encodeURIComponent(ACTION.id)}`,
      expect.anything()
    );
    expect(screen.getByText("Treasury withdrawal")).toBeInTheDocument();
    expect(screen.getByText("Open for votes")).toBeInTheDocument();
    expect(screen.getByText("Pay for a year.")).toBeInTheDocument();
    expect(screen.getByText("Voting closes after epoch 240")).toBeInTheDocument();
  });

  it("says so when the pasted text holds no action id, without calling the server", () => {
    const fetchMock = stubLookup(ACTION);
    render(<GovernanceVotePicker />);

    fireEvent.change(screen.getByLabelText("Governance action"), { target: { value: "drep1abc" } });
    fireEvent.click(screen.getByRole("button", { name: /Look up/ }));

    expect(screen.getByRole("alert")).toHaveTextContent(/No governance action id found/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("re-shows the action an existing vote already names", async () => {
    holder.voteJson = JSON.stringify({
      voter: { type: "DRep", drepId: holder.drepId },
      govActionId: { txHash: TX_HASH, txIndex: 0 },
      votingProcedure: { voteKind: "No" }
    });
    stubLookup(ACTION);

    render(<GovernanceVotePicker />);

    await waitFor(() => expect(screen.getByText("Fund the node")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "No" })).toHaveAttribute("aria-pressed", "true");
  });
});

describe("a saved vote the card does not show", () => {
  const savedOn = (txHash: string, drepId: string) => JSON.stringify({
    voter: { type: "DRep", drepId },
    govActionId: { txHash, txIndex: 0 },
    votingProcedure: { voteKind: "Yes" }
  });

  it("warns when the saved vote is on another action than the one looked up", async () => {
    holder.voteJson = savedOn("ab".repeat(32), holder.drepId!);
    const fetchMock = stubLookup(ACTION);
    render(<GovernanceVotePicker />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText("Governance action"), { target: { value: `${TX_HASH}#0` } });
    fireEvent.click(screen.getByRole("button", { name: /Look up/ }));

    await waitFor(() => expect(screen.getByText(/The vote saved now is Yes on action abababab/)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Yes" })).toHaveAttribute("aria-pressed", "false");
  });

  it("does not count a vote by another DRep as this wallet's choice", async () => {
    holder.voteJson = savedOn(TX_HASH, "drep1someoneelse");
    stubLookup(ACTION);

    render(<GovernanceVotePicker />);

    await waitFor(() => expect(screen.getByText("Fund the node")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Yes" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText(/cast by drep1someoneelse/)).toBeInTheDocument();
  });
  it("still names the saved vote when the lookup of another action fails", async () => {
    holder.voteJson = savedOn(TX_HASH, holder.drepId!);
    vi.stubGlobal("fetch", vi.fn(async (url: string) =>
      url.includes(encodeURIComponent(`${TX_HASH}#0`))
        ? new Response(JSON.stringify({ action: ACTION }))
        : new Response(JSON.stringify({ error: "Governance action not found on this network." }), { status: 404 })
    ));
    render(<GovernanceVotePicker />);
    await waitFor(() => expect(screen.getByText("Fund the node")).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText("Governance action"), { target: { value: `${"ef".repeat(32)}#1` } });
    fireEvent.click(screen.getByRole("button", { name: /Look up/ }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/not found/));
    expect(screen.getByText(/The vote saved now is Yes on action 0ecc74fe/)).toBeInTheDocument();
  });
});

describe("a lookup the server refused", () => {
  it("does not retry a 404, so not-found shows at once", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ error: "Governance action not found on this network." }), { status: 404 })
    );
    vi.stubGlobal("fetch", fetchMock);
    // The test wrapper turns retries off; put the app's own policy back so a retry would show.
    context.queryClient.setDefaultOptions({ queries: { retry: retryQuery, retryDelay: 0 } });
    render(<GovernanceVotePicker />);

    fireEvent.change(screen.getByLabelText("Governance action"), { target: { value: `${TX_HASH}#0` } });
    fireEvent.click(screen.getByRole("button", { name: /Look up/ }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Governance action not found on this network."));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("casting the vote", () => {
  it("writes the vote with this wallet as the voting DRep", async () => {
    await lookUp(`${TX_HASH}#0`);

    fireEvent.click(screen.getByRole("button", { name: "Abstain" }));

    expect(JSON.parse(holder.setVoteJson.mock.calls[0][0] as string)).toEqual({
      voter: { type: "DRep", drepId: holder.drepId },
      govActionId: { txHash: TX_HASH, txIndex: 0 },
      votingProcedure: { voteKind: "Abstain" }
    });
  });

  it("offers no vote on an action that has closed, and says why", async () => {
    await lookUp(`${TX_HASH}#0`, { ...ACTION, status: "expired" });

    expect(screen.getByRole("button", { name: "Yes" })).toBeDisabled();
    expect(screen.getByText("Voting on this action has closed.")).toBeInTheDocument();
  });

  it("offers no vote before the wallet's DRep id is known, and says why", async () => {
    holder.drepId = null;
    await lookUp(`${TX_HASH}#0`);

    expect(screen.getByRole("button", { name: "Yes" })).toBeDisabled();
    expect(screen.getByText(/voting id could not be worked out yet/)).toBeInTheDocument();
  });
});

describe("an empty vote the validator rejected", () => {
  const MESSAGE = "Pick a governance action and choose Yes, No or Abstain.";

  it("puts the reason on the lookup field while no action is shown", () => {
    stubLookup(ACTION);
    render(<GovernanceVotePicker error={MESSAGE} />);

    expect(screen.getByLabelText("Governance action")).toHaveAccessibleDescription(MESSAGE);
  });

  it("moves the reason to the vote buttons once an action is shown", async () => {
    stubLookup(ACTION);
    render(<GovernanceVotePicker error={MESSAGE} />);
    fireEvent.change(screen.getByLabelText("Governance action"), { target: { value: `${TX_HASH}#0` } });
    fireEvent.click(screen.getByRole("button", { name: /Look up/ }));

    await waitFor(() => expect(screen.getByText("Fund the node")).toBeInTheDocument());
    expect(screen.getByLabelText("Governance action")).not.toHaveAttribute("aria-invalid");
    expect(screen.getByRole("group", { name: "Your vote" })).toHaveAccessibleDescription(MESSAGE);
  });
});
