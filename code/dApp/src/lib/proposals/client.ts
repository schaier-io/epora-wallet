import { parseRetryAfterMs } from "@/lib/http/retry-after";
import { parseJsonSafe, serializeJsonSafe } from "./serialization";
import { proposalCopy } from "./copy";
import type {
  CreateProposalRequest,
  ProposalBuildContext,
  ProposalDetailDto,
  ProposalListPage,
  ProposalSummary
} from "./types";

// Browser-side client for the proposals API. Bodies are serialized with the
// bigint/Map-safe encoder because build contexts carry Plutus datum values.

export type ProposalSessionInfo = { paymentKeyHash: string; address: string };

export class ProposalRequestError extends Error {
  constructor(message: string, readonly status?: number, readonly retryAfterMs?: number) {
    super(message);
    this.name = "ProposalRequestError";
  }
}

export type ProposalReadOptions = { signal?: AbortSignal };

export function getProposalErrorMessage(error: unknown, fallback: string): string {
  return error instanceof ProposalRequestError ? error.message : fallback;
}

async function readError(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as { error?: unknown };
    if (data && typeof data.error === "string") {
      return data.error;
    }
  } catch {
    // fall through
  }
  return proposalCopy.requestFailed(response.status);
}

async function getJson<T>(url: string, options: ProposalReadOptions = {}): Promise<T> {
  const response = await fetch(url, { credentials: "same-origin", signal: options.signal });
  if (!response.ok) {
    throw new ProposalRequestError(await readError(response), response.status, parseRetryAfterMs(response.headers.get("Retry-After")));
  }
  return response.json() as Promise<T>;
}

async function sendJson<T>(url: string, method: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method,
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: serializeJsonSafe(body)
  });
  if (!response.ok) {
    throw new ProposalRequestError(await readError(response), response.status, parseRetryAfterMs(response.headers.get("Retry-After")));
  }
  return response.json() as Promise<T>;
}

// ---- auth ----------------------------------------------------------------

export async function fetchProposalSession(options: ProposalReadOptions = {}): Promise<ProposalSessionInfo | null> {
  const response = await fetch("/api/proposals/auth", { credentials: "same-origin", signal: options.signal });
  if (response.status === 401) {
    return null;
  }
  if (!response.ok) {
    throw new ProposalRequestError(await readError(response), response.status, parseRetryAfterMs(response.headers.get("Retry-After")));
  }
  return response.json() as Promise<ProposalSessionInfo>;
}

/**
 * Which of a wallet's indexed participants have completed the sign-in, i.e. finished
 * registering.
 *
 * Only a participant of the wallet may ask, and this REJECTS when they may not: the route
 * answers 401 without a session and 403 for a non-participant, and `getJson` turns both
 * into a ProposalRequestError. Callers must treat a rejection as "not known" rather than
 * as an empty list, because "nobody has registered" is a different claim from "you were
 * not allowed to ask".
 */
export async function fetchRegisteredWalletSigners(
  walletUnit: string,
  options: ProposalReadOptions = {}
): Promise<string[]> {
  const { registered } = await getJson<{ registered: string[] }>(
    `/api/proposals/wallets/${encodeURIComponent(walletUnit)}/signers`,
    options
  );
  return registered;
}

export async function requestSignInNonce(address: string): Promise<string> {
  const { nonce } = await sendJson<{ nonce: string }>("/api/proposals/auth/nonce", "POST", {
    address
  });
  return nonce;
}

export async function completeSignIn(payload: {
  address: string;
  nonce: string;
  signature: string;
  key: string;
}): Promise<ProposalSessionInfo> {
  return sendJson<ProposalSessionInfo>("/api/proposals/auth", "POST", payload);
}

export async function signOutProposals(): Promise<void> {
  const response = await fetch("/api/proposals/auth", {
    method: "DELETE",
    credentials: "same-origin"
  });
  if (!response.ok) {
    throw new ProposalRequestError(await readError(response), response.status, parseRetryAfterMs(response.headers.get("Retry-After")));
  }
}

// ---- proposals -----------------------------------------------------------

// Keep a proposal ID from a shared link within one URL path segment.
function proposalPath(id: string, suffix = ""): string {
  return `/api/proposals/${encodeURIComponent(id)}${suffix}`;
}

export async function listProposals(options?: {
  walletUnit?: string;
  cursor?: string;
  limit?: number;
}, request: ProposalReadOptions = {}): Promise<ProposalListPage> {
  const query = new URLSearchParams();
  if (options?.walletUnit) query.set("walletUnit", options.walletUnit);
  if (options?.cursor) query.set("cursor", options.cursor);
  if (options?.limit) query.set("limit", String(options.limit));
  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  return getJson<ProposalListPage>(`/api/proposals${suffix}`, request);
}

export async function fetchProposal(id: string, options: ProposalReadOptions = {}): Promise<ProposalDetailDto> {
  const { proposal } = await getJson<{ proposal: ProposalDetailDto }>(proposalPath(id), options);
  return proposal;
}

export async function createProposal(body: CreateProposalRequest): Promise<ProposalDetailDto> {
  const { proposal } = await sendJson<{ proposal: ProposalDetailDto }>(
    "/api/proposals",
    "POST",
    body
  );
  return proposal;
}

export async function signProposal(
  id: string,
  payload: { witnessSetHex: string; txBodyHash: string }
): Promise<ProposalDetailDto> {
  const { proposal } = await sendJson<{ proposal: ProposalDetailDto }>(
    proposalPath(id, "/sign"),
    "POST",
    payload
  );
  return proposal;
}

export async function rebuildProposal(
  id: string,
  payload: {
    unsignedTxHex: string;
    txBodyHash: string;
    expectedBodyHash: string;
    buildContext: ProposalBuildContext;
  }
): Promise<ProposalDetailDto> {
  const { proposal } = await sendJson<{ proposal: ProposalDetailDto }>(
    proposalPath(id, "/rebuild"),
    "PATCH",
    payload
  );
  return proposal;
}

export async function markProposalSubmitted(
  id: string,
  expectedBodyHash: string
): Promise<ProposalDetailDto> {
  const { proposal } = await sendJson<{ proposal: ProposalDetailDto }>(
    proposalPath(id, "/submit"),
    "POST",
    { expectedBodyHash }
  );
  return proposal;
}

export async function cancelProposal(id: string): Promise<void> {
  const response = await fetch(proposalPath(id), {
    method: "DELETE",
    credentials: "same-origin"
  });
  if (!response.ok) {
    throw new ProposalRequestError(await readError(response), response.status, parseRetryAfterMs(response.headers.get("Retry-After")));
  }
}

// Hard-deletes a finished request (withdrawn or sent). The explicit delete
// intent is what separates this from `cancelProposal`: the server never picks
// a destructive path from stored status alone, so a stale client state cannot
// turn a withdraw into a delete or the reverse.
export async function deleteProposal(id: string): Promise<void> {
  const response = await fetch(proposalPath(id), {
    method: "DELETE",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ intent: "delete" })
  });
  if (!response.ok) {
    throw new ProposalRequestError(await readError(response), response.status, parseRetryAfterMs(response.headers.get("Retry-After")));
  }
}

// ---- DTO decoding --------------------------------------------------------

export function parseProposalBuildContext(
  dto: Pick<ProposalDetailDto, "buildContextJson">
): ProposalBuildContext | null {
  if (!dto.buildContextJson) {
    return null;
  }
  try {
    return parseJsonSafe<ProposalBuildContext>(dto.buildContextJson);
  } catch {
    return null;
  }
}

export function parseProposalSummary(
  dto: Pick<ProposalDetailDto, "summaryJson">
): ProposalSummary | null {
  if (!dto.summaryJson) {
    return null;
  }
  try {
    return parseJsonSafe<ProposalSummary>(dto.summaryJson);
  } catch {
    return null;
  }
}
