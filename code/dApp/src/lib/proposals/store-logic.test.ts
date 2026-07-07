import assert from "node:assert/strict";
import { test } from "node:test";
import type { MultiSigProposal, ProposalSignature } from "@/generated/prisma";
import {
  evaluateProposalSignatureGuard,
  mapDetail,
  mapListItem,
  mapSignature
} from "@/lib/proposals/store-logic";

const BODY = "body-hash-current";
const OLD_BODY = "body-hash-stale";

// Only the fields the mappers read are populated; the cast keeps the fixture
// independent of unrelated Prisma columns.
function makeRow(overrides: Partial<MultiSigProposal> = {}): MultiSigProposal {
  return {
    id: "p1",
    walletUnit: "unit1",
    walletPolicyId: "policy1",
    title: "Spend",
    description: null,
    actionKind: "wallet-spend",
    authorityPath: "admin",
    status: "OPEN",
    txBodyHash: BODY,
    submittedTxHash: null,
    unsignedTxHex: "abcd",
    buildContextJson: "{}",
    summaryJson: null,
    createdByKeyHash: "creator",
    createdAt: new Date("2026-06-01T00:00:00.000Z"),
    updatedAt: new Date("2026-06-02T00:00:00.000Z"),
    ...overrides
  } as unknown as MultiSigProposal;
}

function makeSig(overrides: Partial<ProposalSignature> = {}): ProposalSignature {
  return {
    signerKeyHash: "signer1",
    witnessSetHex: "ffff",
    txBodyHash: BODY,
    createdAt: new Date("2026-06-03T00:00:00.000Z"),
    ...overrides
  } as unknown as ProposalSignature;
}

test("mapSignature flags a witness current only when its body hash matches", () => {
  assert.equal(mapSignature(makeSig({ txBodyHash: BODY }), BODY).current, true);
  assert.equal(mapSignature(makeSig({ txBodyHash: OLD_BODY }), BODY).current, false);
});

test("mapListItem counts only current-body signatures", () => {
  const item = mapListItem(makeRow(), [
    makeSig({ signerKeyHash: "signer1", txBodyHash: BODY }),
    makeSig({ signerKeyHash: "signer2", txBodyHash: OLD_BODY }) // stale -> excluded
  ]);

  assert.equal(item.signatureCount, 1);
  assert.deepEqual(item.signerKeyHashes, ["signer1"]);
  assert.equal(item.status, "OPEN");
  assert.equal(item.authorityPath, "admin");
  assert.equal(item.createdAt, "2026-06-01T00:00:00.000Z");
});

test("mapDetail orders current witnesses first, then stale, each newest-first", () => {
  const detail = mapDetail(makeRow(), [
    makeSig({ signerKeyHash: "current-old", txBodyHash: BODY, createdAt: new Date("2026-06-03T00:00:00.000Z") }),
    makeSig({ signerKeyHash: "current-new", txBodyHash: BODY, createdAt: new Date("2026-06-05T00:00:00.000Z") }),
    makeSig({ signerKeyHash: "stale-newest", txBodyHash: OLD_BODY, createdAt: new Date("2026-06-10T00:00:00.000Z") })
  ]);

  assert.deepEqual(
    detail.signatures.map((signature) => signature.signerKeyHash),
    ["current-new", "current-old", "stale-newest"]
  );
  assert.equal(detail.signatures[0]!.current, true);
  assert.equal(detail.signatures[2]!.current, false);
  assert.equal(detail.unsignedTxHex, "abcd");
  assert.equal(detail.buildContextJson, "{}");
});

// The guard is the fund-safety precondition for recording a witness.
test("evaluateProposalSignatureGuard rejects a missing proposal", () => {
  assert.deepEqual(evaluateProposalSignatureGuard(null, BODY), {
    ok: false,
    status: 404,
    error: "Proposal not found."
  });
});

test("evaluateProposalSignatureGuard rejects a non-open proposal with its lowercased status", () => {
  assert.deepEqual(evaluateProposalSignatureGuard({ status: "SUBMITTED", txBodyHash: BODY }, BODY), {
    ok: false,
    status: 409,
    error: "Proposal is submitted."
  });
  assert.deepEqual(evaluateProposalSignatureGuard({ status: "CANCELLED", txBodyHash: BODY }, BODY), {
    ok: false,
    status: 409,
    error: "Proposal is cancelled."
  });
});

test("evaluateProposalSignatureGuard rejects signing a rebuilt body", () => {
  assert.deepEqual(evaluateProposalSignatureGuard({ status: "OPEN", txBodyHash: OLD_BODY }, BODY), {
    ok: false,
    status: 409,
    error: "The proposal was rebuilt. Reload and re-verify before signing."
  });
});

test("evaluateProposalSignatureGuard accepts an open proposal on the reviewed body", () => {
  assert.deepEqual(evaluateProposalSignatureGuard({ status: "OPEN", txBodyHash: BODY }, BODY), {
    ok: true
  });
});
