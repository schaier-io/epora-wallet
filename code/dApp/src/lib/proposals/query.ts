import { infiniteQueryOptions, queryOptions, type QueryClient } from "@tanstack/react-query";
import { CHAIN_NETWORK, queryPolicy } from "@/lib/query/keys";
import { fetchProposal, fetchProposalSession, listProposals } from "./client";
import type { ProposalDetailDto, ProposalListItemDto } from "./types";
import { MAX_BACKGROUND_PROPOSAL_INPUT_LOOKUPS, verifyProposal } from "./verify";

const privatePrefix = ["proposals", CHAIN_NETWORK] as const;

export const proposalKeys = {
  all: privatePrefix,
  session: ["proposal-session", CHAIN_NETWORK] as const,
  scope: (signer: string) => [...privatePrefix, signer] as const,
  lists: (signer: string) => [...privatePrefix, signer, "list"] as const,
  list: (signer: string, walletUnit?: string) =>
    [...privatePrefix, signer, "list", walletUnit ?? null] as const,
  details: (signer: string) => [...privatePrefix, signer, "detail"] as const,
  detail: (signer: string, id: string) => [...privatePrefix, signer, "detail", id] as const,
  verifications: (signer: string) => [...privatePrefix, signer, "verification"] as const,
  verification: (signer: string, record: ProposalDetailDto, mode: "full" | "background") =>
    [...privatePrefix, signer, "verification", record.id, mode, record] as const,
  background: (signer: string, records: ProposalListItemDto[]) =>
    [...privatePrefix, signer, "background", records] as const,
  backgrounds: (signer: string) => [...privatePrefix, signer, "background"] as const
};

export const proposalSessionQueryOptions = () => queryOptions({
  queryKey: proposalKeys.session,
  queryFn: ({ signal }) => fetchProposalSession({ signal }),
  staleTime: queryPolicy.chainStaleMs,
  gcTime: queryPolicy.chainGcMs,
  refetchOnWindowFocus: "always",
  refetchInterval: queryPolicy.activePollMs
});

export const proposalListQueryOptions = (signer: string, walletUnit?: string) => infiniteQueryOptions({
  queryKey: proposalKeys.list(signer, walletUnit),
  queryFn: ({ pageParam, signal }) => listProposals({ walletUnit, cursor: pageParam }, { signal }),
  initialPageParam: undefined as string | undefined,
  getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  staleTime: queryPolicy.chainStaleMs,
  gcTime: queryPolicy.chainGcMs
});

export const proposalDetailQueryOptions = (signer: string, id: string) => queryOptions({
  queryKey: proposalKeys.detail(signer, id),
  queryFn: ({ signal }) => fetchProposal(id, { signal }),
  staleTime: queryPolicy.chainStaleMs,
  gcTime: queryPolicy.chainGcMs
});

export const proposalVerificationQueryOptions = (
  signer: string,
  record: ProposalDetailDto | null,
  mode: "full" | "background"
) => queryOptions({
  queryKey: record ? proposalKeys.verification(signer, record, mode) : [...proposalKeys.verifications(signer), "unselected", mode] as const,
  queryFn: ({ signal }) => record ? verifyProposal(record, {
    signal,
    ...(mode === "background" ? { maxInputLookups: MAX_BACKGROUND_PROPOSAL_INPUT_LOOKUPS } : {})
  }) : Promise.resolve(null),
  staleTime: 0,
  gcTime: queryPolicy.chainGcMs,
  retry: false,
  meta: { chainDependent: true },
  // Verification includes bigint values decoded from the datum.
  structuralSharing: false
});

export function clearProposalQueries(client: QueryClient, signer?: string): void {
  const queryKey = signer ? proposalKeys.scope(signer) : proposalKeys.all;
  void client.cancelQueries({ queryKey });
  client.removeQueries({ queryKey });
}

export async function invalidateProposalQueries(client: QueryClient, signer: string): Promise<void> {
  await Promise.all([
    client.invalidateQueries({ queryKey: proposalKeys.lists(signer) }),
    client.invalidateQueries({ queryKey: proposalKeys.details(signer) }),
    client.invalidateQueries({ queryKey: proposalKeys.verifications(signer) }),
    client.invalidateQueries({ queryKey: proposalKeys.backgrounds(signer) })
  ]);
}
