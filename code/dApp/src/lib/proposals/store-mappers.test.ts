import assert from "node:assert/strict";
import test from "node:test";
import type { MultiSigProposal, ProposalSignature } from "@/generated/prisma";
import { mapDetail, mapListItem, mapSignature } from "@/lib/proposals/store-mappers";

function makeRow(overrides: Partial<MultiSigProposal> = {}): MultiSigProposal {
  return {
    id: "p1",
    walletUnit: "unit",
    walletPolicyId: "policy",
    title: "Move funds",
    description: null,
    actionKind: "stt-spend",
    authorityPath: "multisig",
    status: "OPEN",
    txBodyHash: "H1",
    submittedTxHash: null,
    createdByKeyHash: "creator",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-02T00:00:00Z"),
    unsignedTxHex: "deadbeef",
    buildContextJson: "{\"builder\":\"stt-spend\"}",
    summaryJson: "{\"note\":\"hi\"}",
    ...overrides
  } as unknown as MultiSigProposal;
}

function makeSig(overrides: Partial<ProposalSignature>): ProposalSignature {
  return {
    signerKeyHash: "signer",
    witnessSetHex: "a0",
    txBodyHash: "H1",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides
  } as unknown as ProposalSignature;
}

test("mapSignature flags a witness current only when its body hash matches", () => {
  const current = mapSignature(makeSig({ txBodyHash: "H1" }), "H1");
  const stale = mapSignature(makeSig({ txBodyHash: "H0" }), "H1");
  assert.equal(current.current, true);
  assert.equal(stale.current, false);
  assert.equal(current.createdAt, "2026-01-01T00:00:00.000Z");
});

test("mapListItem counts only signatures against the current body hash", () => {
  const row = makeRow({ txBodyHash: "H1" });
  const signatures = [
    makeSig({ signerKeyHash: "a", txBodyHash: "H1" }),
    makeSig({ signerKeyHash: "b", txBodyHash: "H0" }), // stale — signed a previous body
    makeSig({ signerKeyHash: "c", txBodyHash: "H1" })
  ];
  const dto = mapListItem(row, signatures);
  assert.equal(dto.signatureCount, 2);
  assert.deepEqual(dto.signerKeyHashes, ["a", "c"]);
  assert.equal(dto.createdAt, "2026-01-01T00:00:00.000Z");
});

test("mapDetail orders current witnesses first, then each group newest-first", () => {
  const row = makeRow({ txBodyHash: "H1" });
  const signatures = [
    makeSig({ signerKeyHash: "cOld", txBodyHash: "H1", createdAt: new Date("2026-01-01T00:00:00Z") }),
    makeSig({ signerKeyHash: "sNew", txBodyHash: "H0", createdAt: new Date("2026-03-01T00:00:00Z") }),
    makeSig({ signerKeyHash: "cNew", txBodyHash: "H1", createdAt: new Date("2026-02-01T00:00:00Z") })
  ];
  const dto = mapDetail(row, signatures);
  assert.deepEqual(
    dto.signatures.map((signature) => signature.signerKeyHash),
    ["cNew", "cOld", "sNew"]
  );
  assert.deepEqual(
    dto.signatures.map((signature) => signature.current),
    [true, true, false]
  );
});

test("mapDetail forwards the raw JSON columns and unsigned tx", () => {
  const row = makeRow({ unsignedTxHex: "abcd", buildContextJson: "{}", summaryJson: null });
  const dto = mapDetail(row, []);
  assert.equal(dto.unsignedTxHex, "abcd");
  assert.equal(dto.buildContextJson, "{}");
  assert.equal(dto.summaryJson, null);
  assert.equal(dto.signatureCount, 0);
});
