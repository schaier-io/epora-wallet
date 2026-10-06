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

const OPEN_ACTION: GovernanceAction = {
  ...ACTION,
  id: "gov_action1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq",
  txHash: "cd".repeat(32),
  index: 0,
  type: "info_action",
  title: "Raise the DRep activity window",
  abstract: "An info action.",
  expirationEpoch: 330
};

/** `open` answers the open-actions list; `lookup` answers every single-action lookup. */
function stubFetch(lookup: GovernanceAction, open: GovernanceAction[] = []) {
  const fetchMock = vi.fn(async (url: string) =>
    url.endsWith("/active")
      ? new Response(JSON.stringify({ actions: open }))
      : new Response(JSON.stringify({ action: lookup }))
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
const stubLookup = (action: GovernanceAction) => stubFetch(action);
const lookupCalls = (fetchMock: ReturnType<typeof stubFetch>) =>
  fetchMock.mock.calls.filter(([url]) => !url.endsWith("/active"));

function paste(text: string) {
  fireEvent.change(screen.getByLabelText("Governance action"), { target: { value: text } });
}

async function lookUp(pasted: string, action = ACTION) {
  const fetchMock = stubLookup(action);
  render(<GovernanceVotePicker />);
  paste(pasted);
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

  it("links the mainnet governance explorers and says a preprod app cannot find their ids", () => {
    render(<GovernanceVotePicker />);

    expect(screen.getByRole("link", { name: "GovTool" })).toHaveAttribute(
      "href",
      "https://gov.tools/governance_actions"
    );
    expect(screen.getByRole("link", { name: "Cardanoscan" })).toHaveAttribute(
      "href",
      "https://cardanoscan.io/govActions"
    );
    expect(screen.getByText(/This app runs on preprod, which has only test actions/)).toBeInTheDocument();
  });

  it("treats text without an action id as a search, without calling the lookup", async () => {
    const fetchMock = stubFetch(ACTION, [OPEN_ACTION]);
    render(<GovernanceVotePicker />);
    await waitFor(() => expect(screen.getByText(OPEN_ACTION.title!)).toBeInTheDocument());

    paste("drep1abc");

    expect(await screen.findByText(/No open action matches/)).toBeInTheDocument();
    expect(lookupCalls(fetchMock)).toHaveLength(0);
  });

  it("does not look up a half-typed gov_action1 id", async () => {
    const fetchMock = stubFetch(ACTION);
    render(<GovernanceVotePicker />);
    await waitFor(() => expect(screen.getByText(/No governance actions are open/)).toBeInTheDocument());

    paste(ACTION.id.slice(0, 30));
    await new Promise((resolve) => setTimeout(resolve, 400));

    expect(lookupCalls(fetchMock)).toHaveLength(0);
  });

  it("looks a bare tx hash up as its first action when no open action has it", async () => {
    const fetchMock = await lookUp(TX_HASH);

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/v1/governance-actions?id=${encodeURIComponent(`${TX_HASH}#0`)}`,
      expect.anything()
    );
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

describe("the open actions", () => {
  it("keeps a pasted action selected after the vote, when the search box changes", async () => {
    await lookUp(`${TX_HASH}#0`);
    fireEvent.click(screen.getByRole("button", { name: "Yes" }));
    holder.voteJson = holder.setVoteJson.mock.calls[0][0] as string;

    paste("something else");
    await new Promise((resolve) => setTimeout(resolve, 400));

    expect(screen.getByText("Fund the node")).toBeInTheDocument();
    expect(screen.queryByText(/The vote saved now/)).not.toBeInTheDocument();
  });

  it("waits for typed text to settle before looking it up", async () => {
    const fetchMock = stubFetch(ACTION);
    render(<GovernanceVotePicker />);
    await screen.findByText(/No governance actions are open/);

    paste(`${TX_HASH}#1`);
    paste(`${TX_HASH}#0`);

    expect(await screen.findByText("Fund the node")).toBeInTheDocument();
    expect(lookupCalls(fetchMock).map(([url]) => url)).toEqual([
      `/api/v1/governance-actions?id=${encodeURIComponent(`${TX_HASH}#0`)}`
    ]);
  });

  it("lists them, and picking one shows its card without another request", async () => {
    const fetchMock = stubFetch(ACTION, [OPEN_ACTION]);
    render(<GovernanceVotePicker />);

    expect(await screen.findByText("Open actions (1)")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Raise the DRep activity window/ }));

    expect(screen.getByRole("button", { name: /Raise the DRep activity window/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("An info action.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Yes" }));
    expect((JSON.parse(holder.setVoteJson.mock.calls[0][0] as string) as { govActionId: unknown }).govActionId).toEqual({
      txHash: OPEN_ACTION.txHash,
      txIndex: 0
    });
    expect(lookupCalls(fetchMock)).toHaveLength(0);
  });

  it("filters them by title, type or tx hash", async () => {
    stubFetch(ACTION, [OPEN_ACTION, { ...ACTION, id: `${ACTION.id.slice(0, -1)}x` }]);
    render(<GovernanceVotePicker />);
    expect(await screen.findByText("Open actions (2)")).toBeInTheDocument();

    paste("treasury");
    expect(screen.getByRole("button", { name: /Fund the node/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Raise the DRep/ })).not.toBeInTheDocument();

    paste(OPEN_ACTION.txHash);
    expect(screen.getByRole("button", { name: /Raise the DRep/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Fund the node/ })).not.toBeInTheDocument();
  });

  it("selects a pasted id from the list when that action is open", async () => {
    const fetchMock = stubFetch(ACTION, [OPEN_ACTION]);
    render(<GovernanceVotePicker />);
    await screen.findByText("Open actions (1)");

    paste(`${OPEN_ACTION.txHash}#0`);

    expect(await screen.findByText("An info action.")).toBeInTheDocument();
    expect(lookupCalls(fetchMock)).toHaveLength(0);
  });

  it("says so when the list cannot load, and still accepts a pasted id", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) =>
      url.endsWith("/active")
        ? new Response(JSON.stringify({ error: "down" }), { status: 502 })
        : new Response(JSON.stringify({ action: ACTION }))
    ));
    render(<GovernanceVotePicker />);

    expect(await screen.findByText(/Couldn't load the open actions/)).toBeInTheDocument();
    paste(`${TX_HASH}#0`);
    expect(await screen.findByText("Fund the node")).toBeInTheDocument();
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

    paste(`${TX_HASH}#0`);

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

    paste(`${"ef".repeat(32)}#1`);

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/No governance action/));
    expect(screen.getByRole("status")).toHaveTextContent(/The vote saved now is Yes on action 0ecc74fe/);
  });

  it("does not call the wallet's own vote foreign before its DRep id is known", async () => {
    holder.voteJson = savedOn(TX_HASH, "drep1y05ae0uf55xpmph3jmxmfayr6f0up2hvquwjn929zmgvlxqdjsap6");
    holder.drepId = null;
    stubLookup(ACTION);

    render(<GovernanceVotePicker />);

    await waitFor(() => expect(screen.getByText("Fund the node")).toBeInTheDocument());
    expect(screen.queryByText(/The vote saved now/)).not.toBeInTheDocument();
  });
});

describe("a lookup the server refused", () => {
  it("does not retry a 404, so not-found shows at once", async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url.endsWith("/active")
        ? new Response(JSON.stringify({ actions: [] }))
        : new Response(JSON.stringify({ error: "Governance action not found on this network." }), { status: 404 })
    );
    vi.stubGlobal("fetch", fetchMock);
    // The test wrapper turns retries off; put the app's own policy back so a retry would show.
    context.queryClient.setDefaultOptions({ queries: { retry: retryQuery, retryDelay: 0 } });
    render(<GovernanceVotePicker />);

    paste(`${TX_HASH}#0`);

    // The reader's own language, not the server's English text.
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("No governance action with that id on this network."));
    expect(lookupCalls(fetchMock)).toHaveLength(1);
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
    paste(`${TX_HASH}#0`);

    await waitFor(() => expect(screen.getByText("Fund the node")).toBeInTheDocument());
    expect(screen.getByLabelText("Governance action")).not.toHaveAttribute("aria-invalid");
    expect(screen.getByRole("group", { name: "Your vote" })).toHaveAccessibleDescription(MESSAGE);
  });
});
