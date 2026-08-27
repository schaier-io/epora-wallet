"use client";
import { useTranslations } from "next-intl";

import {
  AlertTriangle,
  CheckCircle2,
  Inbox,
  Loader2,
  RefreshCw,
  Users
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import type { ProposalListItemDto, ProposalValidity } from "@/lib/proposals/types";
import { truncateMiddle, useProposalFormatters } from "./format";

type ProposalListProps = {
  proposals: ProposalListItemDto[];
  selectedId: string | null;
  validityById: Record<string, ProposalValidity>;
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  onSelect: (id: string) => void;
  onRefresh: () => void;
  onLoadMore: () => void;
};

function StatusBadge({ status }: { status: ProposalListItemDto["status"] }) {
  const i18n = useTranslations("ComponentsUserProposalsProposalList");
  if (status === "SUBMITTED") {
    return <Badge variant="info">{i18n("submitted")}</Badge>;
  }
  if (status === "CANCELLED") {
    return <Badge variant="secondary">{i18n("cancelled")}</Badge>;
  }
  return <Badge variant="outline">{i18n("open")}</Badge>;
}

// Validity is computed live (inputs may have been spent), so OPEN rows show a
// transient "checking" state until verification resolves.
function ValidityBadge({ validity }: { validity: ProposalValidity | undefined }) {
  const i18n = useTranslations("ComponentsUserProposalsProposalList");
  if (validity === "invalid") {
    return (
      <Badge variant="warning">
        <AlertTriangle className="h-3 w-3" aria-hidden="true" />
        {i18n("invalidRebuildNeeded")}
      </Badge>
    );
  }
  if (validity === "valid") {
    return (
      <Badge variant="success">
        <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
        {i18n("valid")}
      </Badge>
    );
  }
  return (
    <Badge variant="secondary">
      <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
      {i18n("checking")}
    </Badge>
  );
}

export function ProposalList({
  proposals,
  selectedId,
  validityById,
  loading,
  loadingMore,
  hasMore,
  error,
  onSelect,
  onRefresh,
  onLoadMore
}: ProposalListProps) {
  const i18n = useTranslations("ComponentsUserProposalsProposalList");
  const { actionKindLabel, authorityPathLabel, formatTimestamp } = useProposalFormatters();
  return (
    <div className="flex min-h-0 flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-medium tracking-[-0.02em]">{i18n("proposals")}</h2>
        <Button
          variant="ghost"
          size="sm"
          onClick={onRefresh}
          disabled={loading}
          aria-busy={loading}
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
          )}
          {i18n("refresh")}
        </Button>
      </div>

      {error ? <p role="alert" className="text-sm text-rose-300">{error}</p> : null}

      {!loading && proposals.length === 0 ? (
        <div role="status" className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border/60 bg-background/30 p-8 text-center text-sm text-muted-foreground">
          <Inbox className="h-6 w-6" aria-hidden="true" />
          <p>{i18n("noProposalsYetBuildATransactionAndChoose")}</p>
        </div>
      ) : null}

      <ol className="flex min-h-0 flex-col gap-2 overflow-y-auto">
        {proposals.map((proposal) => {
          const selected = proposal.id === selectedId;
          return (
            <li key={proposal.id}>
              <button
                type="button"
                onClick={() => onSelect(proposal.id)}
                className={cn(
                  "w-full rounded-lg border p-3 text-left transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  selected
                    ? "border-primary/50 bg-primary/10"
                    : "border-border/60 bg-background/40 hover:border-primary/30 hover:bg-accent/40"
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium leading-tight">{proposal.title}</span>
                  {proposal.status === "OPEN" ? (
                    <ValidityBadge validity={validityById[proposal.id]} />
                  ) : (
                    <StatusBadge status={proposal.status} />
                  )}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  <Badge variant="outline">{actionKindLabel(proposal.actionKind)}</Badge>
                  <Badge variant="outline">{authorityPathLabel(proposal.authorityPath)}</Badge>
                  <span className="inline-flex items-center gap-1">
                    <Users className="h-3 w-3" aria-hidden="true" />
                    {proposal.signatureCount} {i18n("signed")}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{formatTimestamp(proposal.createdAt)}</span>
                </div>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {i18n("walletId")} {truncateMiddle(proposal.walletUnit, 14, 6)}
                </p>
              </button>
            </li>
          );
        })}
      </ol>
      {hasMore ? (
        <Button
          variant="outline"
          size="sm"
          onClick={onLoadMore}
          disabled={loading || loadingMore}
        >
          {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
          {i18n("loadMore")}
        </Button>
      ) : null}
    </div>
  );
}
