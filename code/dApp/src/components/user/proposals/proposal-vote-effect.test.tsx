import type { ReactElement } from "react";
import { render as renderUI, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createQueryTestWrapper } from "@/test/query-client";
import type { ProposalVoteView } from "@/lib/proposals/types";
import { ProposalVoteEffect } from "./proposal-vote-effect";

const VOTE: ProposalVoteView = {
  voterType: "dRepScriptHash",
  voterId: "drep1y05ae0uf55xpmph3jmxmfayr6f0up2hvquwjn929zmgvlxqdjsap6",
  actionTxHash: "cc".repeat(32),
  actionIndex: 2,
  vote: "No"
};

let context: ReturnType<typeof createQueryTestWrapper>;
const render = (ui: ReactElement) => renderUI(ui, { wrapper: context.wrapper });

beforeEach(() => {
  context = createQueryTestWrapper();
});
afterEach(() => {
  context.queryClient.clear();
  vi.unstubAllGlobals();
});

it("shows the decoded vote and names the action once the lookup answers", async () => {
  const fetchMock = vi.fn(async () =>
    new Response(JSON.stringify({
      action: {
        id: "gov_action1x", txHash: VOTE.actionTxHash, index: 2, type: "info_action",
        title: "Should the node move?", abstract: null, expirationEpoch: 240, status: "active"
      }
    }))
  );
  vi.stubGlobal("fetch", fetchMock);

  render(<ProposalVoteEffect votes={[VOTE]} />);

  expect(screen.getByText("Votes No")).toBeInTheDocument();
  expect(screen.getByText(/Cast as DRep drep1y05ae/)).toBeInTheDocument();
  await waitFor(() => expect(screen.getByText("Should the node move?")).toBeInTheDocument());
  expect(fetchMock).toHaveBeenCalledWith(
    `/api/v1/governance-actions?id=${encodeURIComponent(`${VOTE.actionTxHash}#2`)}`,
    expect.anything()
  );
});

it("keeps the vote readable when the title lookup fails", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "down" }), { status: 500 })));

  render(<ProposalVoteEffect votes={[{ ...VOTE, vote: null }]} />);

  expect(screen.getByText("Unrecognised vote")).toBeInTheDocument();
  expect(screen.getByText("Governance action")).toBeInTheDocument();
  await waitFor(() => expect(screen.getByText(/#2$/)).toBeInTheDocument());
});
