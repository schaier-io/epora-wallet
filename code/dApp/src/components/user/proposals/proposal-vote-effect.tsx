"use client";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { Vote } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { ProposalVoteView } from "@/lib/proposals/types";
import { governanceActionQueryOptions } from "@/lib/query/governance-actions";
import { truncateMiddle } from "./format";

const VOTE_BADGE = {
  Yes: { variant: "success", key: "voteYes" },
  No: { variant: "destructive", key: "voteNo" },
  Abstain: { variant: "secondary", key: "voteAbstain" }
} as const;

/**
 * One vote the transaction casts. The vote, the action id and the voter come from the
 * decoded body; only the action's title is looked up, and a failed lookup leaves the id.
 */
function VoteRow({ vote }: { vote: ProposalVoteView }) {
  const i18n = useTranslations("ComponentsUserProposalsProposalVoteEffect");
  const actionRef = `${vote.actionTxHash}#${vote.actionIndex}`;
  const { data: action } = useQuery(governanceActionQueryOptions(actionRef));
  const badge = vote.vote ? VOTE_BADGE[vote.vote] : null;

  return (
    <li className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        {badge ? (
          <Badge variant={badge.variant}>{i18n(badge.key)}</Badge>
        ) : (
          <Badge variant="warning">{i18n("voteUnknown")}</Badge>
        )}
        <span className="text-sm font-semibold text-foreground">
          {action?.title ?? i18n("governanceAction")}
        </span>
      </div>
      <p className="font-mono text-xs text-muted-foreground" title={actionRef}>
        {truncateMiddle(vote.actionTxHash, 8, 4)}#{vote.actionIndex}
      </p>
      <p className="text-xs text-muted-foreground">
        {vote.voterType === "dRepScriptHash"
          ? i18n("votesAsDrep", { drepId: truncateMiddle(vote.voterId, 10, 6) })
          : i18n("votesAsOther", { voter: truncateMiddle(vote.voterId, 8, 4) })}
      </p>
    </li>
  );
}

export function ProposalVoteEffect({ votes }: { votes: ProposalVoteView[] }) {
  const i18n = useTranslations("ComponentsUserProposalsProposalVoteEffect");
  return (
    <div className="rounded-lg border border-border/60 bg-background/40 p-3 sm:p-4">
      <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Vote className="h-4 w-4" aria-hidden="true" />
        {i18n("governanceVote")}
      </p>
      <ul className="space-y-3">
        {votes.map((vote) => (
          <VoteRow key={`${vote.voterId}:${vote.actionTxHash}#${vote.actionIndex}`} vote={vote} />
        ))}
      </ul>
    </div>
  );
}
