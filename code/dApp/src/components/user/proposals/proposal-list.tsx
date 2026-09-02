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
import type {
  ProposalListItemDto,
  ProposalValidity,
  SignerSatisfaction
} from "@/lib/proposals/types";
import { actionKindLabel, formatTimestamp, truncateMiddle } from "./format";
import {
  authorityPathLabel,
  countOutstandingSigners,
  describeSignerProgress
} from "./signer-progress";

type ProposalListProps = {
  proposals: ProposalListItemDto[];
  selectedId: string | null;
  reportById: Record<string, { validity: ProposalValidity; signers: SignerSatisfaction | null }>;
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
  if (status === "SUBMITTING") {
    return <Badge variant="info">{i18n("sending")}</Badge>;
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
        {i18n("outOfDate")}
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
  // No icon and no colour: this is the absence of an answer, not an answer. A warning badge
  // here would read as a verdict on the request.
  if (validity === "unknown") {
    return <Badge variant="secondary">{i18n("notChecked")}</Badge>;
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
  reportById,
  loading,
  loadingMore,
  hasMore,
  error,
  onSelect,
  onRefresh,
  onLoadMore
}: ProposalListProps) {
  const i18n = useTranslations("ComponentsUserProposalsProposalList");
  return (
    // `flex-1`: the wrapper sizes this list to the pane height, so the rows scroll inside
    // the column instead of stretching the page beside the full-height detail pane.
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-medium tracking-[-0.02em]">{i18n("requests")}</h2>
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

      {error ? (
        <p role="alert" className="text-sm text-rose-300">
          {error}
        </p>
      ) : null}

      {!loading && proposals.length === 0 ? (
        // `flex-1 justify-center`: the empty box fills its pane, so the two workspace
        // columns agree on height instead of leaving a short card beside a tall one.
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border/60 bg-background/30 p-3 sm:p-4 text-center text-sm text-muted-foreground">
          <Inbox className="h-6 w-6" aria-hidden="true" />
          <p>
            {i18n("noApprovalRequestsYetBuildATransactionOn")}
          </p>
        </div>
      ) : null}

      {/* Only with rows: an empty `ol` is a second `flex-1` child that would split the pane
          height with the empty-state box above it, leaving both half-height. */}
      {proposals.length > 0 ? (
        <ol className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
        {proposals.map((proposal) => {
          const selected = proposal.id === selectedId;
          const report = reportById[proposal.id];
          const progress = describeSignerProgress(report?.signers, proposal.signatureCount);
          const outstanding = countOutstandingSigners(report?.signers);
          return (
            <li key={proposal.id}>
              <button
                type="button"
                onClick={() => onSelect(proposal.id)}
                aria-current={selected ? "true" : undefined}
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
                    <ValidityBadge validity={report?.validity} />
                  ) : (
                    <StatusBadge status={proposal.status} />
                  )}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="outline">{actionKindLabel(proposal.actionKind)}</Badge>
                  <Badge variant="outline">{authorityPathLabel(proposal.authorityPath)}</Badge>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1",
                      progress.tone === "ready" ? "text-emerald-300" : undefined
                    )}
                  >
                    <Users className="h-3 w-3" aria-hidden="true" />
                    {progress.label}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{formatTimestamp(proposal.createdAt)}</span>
                </div>
                {outstanding != null && outstanding > 0 ? (
                  <p className="mt-1 text-xs text-amber-200">
                    {outstanding === 1 ? i18n("message_1Person") : i18n("outstandingPeople", { outstanding: outstanding })} {i18n("stillToSign")}
                  </p>
                ) : null}
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {i18n("wallet")} {truncateMiddle(proposal.walletUnit, 14, 6)}
                </p>
              </button>
            </li>
          );
        })}
      </ol>
      ) : null}
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
