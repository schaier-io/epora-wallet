"use client";
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
import { actionKindLabel, formatTimestamp, truncateMiddle } from "./format";

type ProposalListProps = {
  proposals: ProposalListItemDto[];
  selectedId: string | null;
  validityById: Record<string, ProposalValidity>;
  loading: boolean;
  error: string | null;
  onSelect: (id: string) => void;
  onRefresh: () => void;
};

function StatusBadge({ status }: { status: ProposalListItemDto["status"] }) {
  if (status === "SUBMITTED") {
    return <Badge variant="info">Submitted</Badge>;
  }
  if (status === "CANCELLED") {
    return <Badge variant="secondary">Cancelled</Badge>;
  }
  return <Badge variant="outline">Open</Badge>;
}

// Validity is computed live (inputs may have been spent), so OPEN rows show a
// transient "checking" state until verification resolves.
function ValidityBadge({ validity }: { validity: ProposalValidity | undefined }) {
  if (validity === "invalid") {
    return (
      <Badge variant="warning">
        <AlertTriangle className="h-3 w-3" aria-hidden="true" />
        Invalid — rebuild
      </Badge>
    );
  }
  if (validity === "valid") {
    return (
      <Badge variant="success">
        <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
        Valid
      </Badge>
    );
  }
  return (
    <Badge variant="secondary">
      <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
      Checking
    </Badge>
  );
}

export function ProposalList({
  proposals,
  selectedId,
  validityById,
  loading,
  error,
  onSelect,
  onRefresh
}: ProposalListProps) {
  return (
    <div className="flex min-h-0 flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-medium tracking-[-0.02em]">Proposals</h2>
        <Button variant="ghost" size="sm" onClick={onRefresh} aria-busy={loading}>
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
          )}
          Refresh
        </Button>
      </div>

      {error ? <p className="text-sm text-rose-300">{error}</p> : null}

      {!loading && proposals.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border/60 bg-background/30 p-8 text-center text-sm text-muted-foreground">
          <Inbox className="h-6 w-6" aria-hidden="true" />
          <p>No proposals yet. Build a transaction and choose “Save as multi-sig proposal”.</p>
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
                  <Badge variant="outline">{proposal.authorityPath}</Badge>
                  <span className="inline-flex items-center gap-1">
                    <Users className="h-3 w-3" aria-hidden="true" />
                    {proposal.signatureCount} signed
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{formatTimestamp(proposal.createdAt)}</span>
                </div>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  wallet {truncateMiddle(proposal.walletUnit, 14, 6)}
                </p>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
