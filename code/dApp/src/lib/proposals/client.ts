import { parseJsonSafe, serializeJsonSafe } from "./serialization";
import type {
  CreateProposalRequest,
  ProposalBuildContext,
  ProposalDetailDto,
  ProposalListItemDto,
  ProposalSummary
} from "./types";

// Browser-side client for the proposals API. Bodies are serialized with the
// bigint/Map-safe encoder because build contexts carry Plutus datum values.

export type ProposalSessionInfo = { paymentKeyHash: string; address: string };

async function readError(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as { error?: unknown };
    if (data && typeof data.error === "string") {
      return data.error;
    }
  } catch {
    // fall through
  }
  return `Request failed (${response.status}).`;
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { credentials: "same-origin" });
  if (!response.ok) {
    throw new Error(await readError(response));
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
    throw new Error(await readError(response));
  }
  return response.json() as Promise<T>;
}

// ---- auth ----------------------------------------------------------------

export async function fetchProposalSession(): Promise<ProposalSessionInfo | null> {
  const response = await fetch("/api/proposals/auth", { credentials: "same-origin" });
  if (response.status === 401) {
    return null;
  }
  if (!response.ok) {
    throw new Error(await readError(response));
  }
  return response.json() as Promise<ProposalSessionInfo>;
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
  await fetch("/api/proposals/auth", { method: "DELETE", credentials: "same-origin" });
}

// ---- proposals -----------------------------------------------------------

export async function listProposals(walletUnit?: string): Promise<ProposalListItemDto[]> {
  const query = walletUnit ? `?walletUnit=${encodeURIComponent(walletUnit)}` : "";
  const { proposals } = await getJson<{ proposals: ProposalListItemDto[] }>(
    `/api/proposals${query}`
  );
  return proposals;
}

export async function fetchProposal(id: string): Promise<ProposalDetailDto> {
  const { proposal } = await getJson<{ proposal: ProposalDetailDto }>(`/api/proposals/${id}`);
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
    `/api/proposals/${id}/sign`,
    "POST",
    payload
  );
  return proposal;
}

export async function rebuildProposal(
  id: string,
  payload: { unsignedTxHex: string; txBodyHash: string; buildContext: ProposalBuildContext }
): Promise<ProposalDetailDto> {
  const { proposal } = await sendJson<{ proposal: ProposalDetailDto }>(
    `/api/proposals/${id}/rebuild`,
    "PATCH",
    payload
  );
  return proposal;
}

export async function markProposalSubmitted(
  id: string,
  submittedTxHash: string
): Promise<ProposalDetailDto> {
  const { proposal } = await sendJson<{ proposal: ProposalDetailDto }>(
    `/api/proposals/${id}/submit`,
    "POST",
    { submittedTxHash }
  );
  return proposal;
}

export async function cancelProposal(id: string): Promise<void> {
  const response = await fetch(`/api/proposals/${id}`, {
    method: "DELETE",
    credentials: "same-origin"
  });
  if (!response.ok) {
    throw new Error(await readError(response));
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
