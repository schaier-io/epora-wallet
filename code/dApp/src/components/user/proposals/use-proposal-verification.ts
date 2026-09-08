"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { proposalVerificationQueryOptions } from "@/lib/proposals/query";
import { queryPolicy } from "@/lib/query/keys";
import type { ProposalDetailDto } from "@/lib/proposals/types";

// A validity check has a deadline even when its transaction and witnesses stay unchanged.
export function useProposalVerification(signer: string, record: ProposalDetailDto | null) {
  const enabled = Boolean(signer && record?.status === "OPEN");
  const query = useQuery({
    ...proposalVerificationQueryOptions(signer, record, "full"),
    enabled,
    refetchInterval: enabled ? queryPolicy.activePollMs : false
  });
  const [nowMs, setNowMs] = useState(() => Date.now());
  const validUntilMs = query.data?.effect.validUntilMs ?? null;
  const { refetch } = query;

  useEffect(() => {
    if (!enabled || validUntilMs === null) return;
    const remaining = validUntilMs - Date.now();
    const timer = setTimeout(() => {
      setNowMs(Date.now());
      if (remaining > 0) void refetch();
    }, Math.max(0, remaining));
    return () => clearTimeout(timer);
  }, [enabled, validUntilMs, refetch]);

  const expired = validUntilMs !== null && nowMs >= validUntilMs;
  const verification = enabled && query.data && !query.isError
    ? expired ? { ...query.data, expired: true, validity: "invalid" as const } : query.data
    : null;
  return { verification, verifying: enabled && query.isFetching, expired };
}
