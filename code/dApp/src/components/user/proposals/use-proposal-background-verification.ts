"use client";

import { useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { proposalDetailQueryOptions, proposalKeys, proposalVerificationQueryOptions } from "@/lib/proposals/query";
import type { ProposalListItemDto, ProposalValidity, SignerSatisfaction } from "@/lib/proposals/types";
import { queryPolicy } from "@/lib/query/keys";

const MAX_BACKGROUND_VERIFY = 20;
export const BACKGROUND_PROPOSAL_VERIFICATION_TIMEOUT_MS = 15_000;
type Reports = Record<string, { validity: ProposalValidity; signers: SignerSatisfaction | null }>;

async function waitForVerification<T>(work: Promise<T>) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work.then((value) => ({ timedOut: false as const, value })),
      new Promise<{ timedOut: true }>((resolve) => {
        timeout = setTimeout(() => resolve({ timedOut: true }), BACKGROUND_PROPOSAL_VERIFICATION_TIMEOUT_MS);
      })
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

export function useProposalBackgroundVerification(
  proposals: ProposalListItemDto[],
  signer: string,
  enabled: boolean
): Reports {
  const client = useQueryClient();
  const backgroundWork = useRef<Promise<void> | null>(null);
  const open = proposals.filter((proposal) => proposal.status === "OPEN");
  const initial: Reports = Object.fromEntries(open.map((proposal, index) => [proposal.id, {
    validity: index < MAX_BACKGROUND_VERIFY ? "checking" : "unknown",
    signers: null
  }]));
  const queryKey = proposalKeys.background(signer, open);
  const query = useQuery({
    queryKey,
    enabled: enabled && Boolean(signer) && open.length > 0,
    retry: false,
    staleTime: queryPolicy.chainStaleMs,
    gcTime: queryPolicy.chainGcMs,
    refetchInterval: enabled && open.length > 0 ? queryPolicy.activePollMs : false,
    structuralSharing: false,
    meta: { chainDependent: true },
    queryFn: async ({ signal }): Promise<Reports> => {
      const reports = { ...initial };
      const unknownFrom = (start: number) => {
        for (const item of open.slice(start)) reports[item.id] = { validity: "unknown", signers: null };
      };
      if (backgroundWork.current) {
        // Wait for uncancellable provider work before a newer list starts another request.
        void backgroundWork.current.then(() => {
          if (!signal.aborted) void client.invalidateQueries({ queryKey, exact: true });
        });
        unknownFrom(0);
        return reports;
      }
      for (const [index, proposal] of open.slice(0, MAX_BACKGROUND_VERIFY).entries()) {
        signal.throwIfAborted();
        try {
          const work = client.fetchQuery(proposalDetailQueryOptions(signer, proposal.id))
            .then((detail) => {
              signal.throwIfAborted();
              return client.fetchQuery(proposalVerificationQueryOptions(signer, detail, "background"));
            });
          const tracked = work.then(() => undefined, () => undefined);
          backgroundWork.current = tracked;
          void tracked.finally(() => {
            if (backgroundWork.current === tracked) backgroundWork.current = null;
          });
          const outcome = await waitForVerification(work);
          signal.throwIfAborted();
          if (outcome.timedOut || outcome.value === null) {
            unknownFrom(index);
            return reports;
          }
          reports[proposal.id] = { validity: outcome.value.validity, signers: outcome.value.signers };
        } catch {
          signal.throwIfAborted();
          reports[proposal.id] = { validity: "unknown", signers: null };
        }
        // Publish completed checks without copying remote results into component state.
        client.setQueryData(queryKey, { ...reports });
      }
      return reports;
    }
  });
  return enabled ? query.data ?? initial : {};
}
