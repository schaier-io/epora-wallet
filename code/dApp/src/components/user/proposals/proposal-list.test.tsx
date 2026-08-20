import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProposalList } from "./proposal-list";
import type {
  ProposalListItemDto,
  ProposalValidity,
  SignerSatisfaction
} from "@/lib/proposals/types";

function listItem(overrides: Partial<ProposalListItemDto> = {}): ProposalListItemDto {
  return {
    id: "proposal-1",
    walletUnit: `${"aa".repeat(28)}01`,
    walletPolicyId: "aa".repeat(28),
    title: "Raise the daily limit",
    description: null,
    actionKind: "update-state",
    authorityPath: "multisig",
    status: "OPEN",
    txBodyHash: "bb".repeat(32),
    submittedTxHash: null,
    createdByKeyHash: "cc".repeat(28),
    createdAt: "2026-07-31T00:00:00.000Z",
    updatedAt: "2026-07-31T00:00:00.000Z",
    signatureCount: 1,
    signerKeyHashes: ["a".repeat(56)],
    ...overrides
  };
}

const SIGNERS: SignerSatisfaction = {
  authorityPath: "multisig",
  requiredSigners: [
    { keyHash: "a".repeat(56), power: 2, isAdmin: false },
    { keyHash: "b".repeat(56), power: 2, isAdmin: false },
    { keyHash: "c".repeat(56), power: 1, isAdmin: false }
  ],
  signedKeyHashes: ["a".repeat(56)],
  satisfiedPower: 2,
  threshold: 3,
  satisfied: false
};

function renderList(
  report?: { validity: ProposalValidity; signers: SignerSatisfaction | null }
) {
  render(
    <ProposalList
      proposals={[listItem()]}
      selectedId={null}
      reportById={report ? { "proposal-1": report } : {}}
      loading={false}
      loadingMore={false}
      hasMore={false}
      error={null}
      onSelect={() => {}}
      onRefresh={() => {}}
      onLoadMore={() => {}}
    />
  );
}

describe("the approval queue row", () => {
  it("says how much approval power is in and how much is needed", () => {
    renderList({ validity: "valid", signers: SIGNERS });
    expect(screen.getByText("2 of 3 approval power")).toBeTruthy();
    expect(screen.getByText("2 people still to sign.")).toBeTruthy();
  });

  it("names the path in the words the rest of the app uses", () => {
    renderList({ validity: "valid", signers: SIGNERS });
    expect(screen.getByText("Co-signers")).toBeTruthy();
    expect(screen.queryByText("multisig")).toBeNull();
  });

  it("falls back to the signature count while verification is still running", () => {
    renderList({ validity: "checking", signers: null });
    expect(screen.getByText("1 signature")).toBeTruthy();
    expect(screen.queryByText(/still to sign/)).toBeNull();
  });
});
