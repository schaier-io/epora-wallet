import "server-only";
import { getPrisma } from "@/lib/prisma";
import {
  cancelProposalRecordWith,
  createProposalRecordWith,
  getProposalOwnerWith,
  getProposalRecordWith,
  listProposalRecordsWith,
  markProposalSubmittedWith,
  replaceProposalBuildWith,
  upsertProposalSignatureWith
} from "./store-core";
import type { CreateProposalRequest, ProposalBuildContext } from "./types";

// Server-only facade over the proposal store. The actual queries live in the
// server-only-free `store-core.ts` (injected PrismaClient, unit-testable);
// this file just binds the app singleton for route handlers. The pure row→DTO
// mapping lives in `store-mappers.ts`.

export function createProposalRecord(request: CreateProposalRequest, createdByKeyHash: string) {
  return createProposalRecordWith(getPrisma(), request, createdByKeyHash);
}

export function listProposalRecords(walletUnit?: string) {
  return listProposalRecordsWith(getPrisma(), walletUnit);
}

export function getProposalRecord(id: string) {
  return getProposalRecordWith(getPrisma(), id);
}

export function upsertProposalSignature(args: {
  proposalId: string;
  signerKeyHash: string;
  witnessSetHex: string;
  expectedBodyHash: string;
}) {
  return upsertProposalSignatureWith(getPrisma(), args);
}

export function replaceProposalBuild(args: {
  proposalId: string;
  unsignedTxHex: string;
  txBodyHash: string;
  buildContext: ProposalBuildContext;
}) {
  return replaceProposalBuildWith(getPrisma(), args);
}

export function markProposalSubmitted(args: { proposalId: string; submittedTxHash: string }) {
  return markProposalSubmittedWith(getPrisma(), args);
}

export function cancelProposalRecord(proposalId: string) {
  return cancelProposalRecordWith(getPrisma(), proposalId);
}

export function getProposalOwner(proposalId: string) {
  return getProposalOwnerWith(getPrisma(), proposalId);
}
