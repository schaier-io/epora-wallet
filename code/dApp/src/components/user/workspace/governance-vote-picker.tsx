"use client";
import { useTranslations } from "next-intl";
import { useAtomValue } from "jotai";
import { CheckCircle2, Loader2, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InlineFieldError } from "@/components/user/workspace/editors";
import { walletDrepIdAtom } from "@/components/user/workspace/atoms/workspace-wallet-derivations.atoms";
import { useVoteForm } from "@/components/user/workspace/forms/use-vote-form";
import type { GovernanceAction } from "@/lib/api/governance-actions";
import { VOTE_KINDS, buildVoteJson, readVoteJson, type VoteKind } from "@/lib/governance/vote-json";
import { useGovernanceActionLookup } from "@/lib/query/governance-actions";
import { shortenIdentifier } from "@/lib/utils/explorer";

const TYPE_LABEL_KEYS = {
  hard_fork_initiation: "typeHardFork",
  new_committee: "typeNewCommittee",
  new_constitution: "typeNewConstitution",
  info_action: "typeInfo",
  no_confidence: "typeNoConfidence",
  parameter_change: "typeParameterChange",
  treasury_withdrawals: "typeTreasuryWithdrawal"
} as const;

const STATUS_LABEL_KEYS = {
  active: "statusActive",
  ratified: "statusRatified",
  enacted: "statusEnacted",
  dropped: "statusDropped",
  expired: "statusExpired"
} as const satisfies Record<GovernanceAction["status"], string>;

const VOTE_LABEL_KEYS = { Yes: "yes", No: "no", Abstain: "abstain" } as const satisfies Record<VoteKind, string>;

/**
 * Find a Cardano governance action by id, show what it is, and pick Yes, No or Abstain.
 * The choice is written into the vote JSON (`voteJsonAtom`) with this wallet as the voting
 * DRep, so validation, the builder and the co-signing request keep reading one payload.
 */
export function GovernanceVotePicker({ error: validationError = null }: { error?: string | null }) {
  const i18n = useTranslations("ComponentsUserWorkspaceGovernanceVotePicker");
  const drepId = useAtomValue(walletDrepIdAtom);
  const { voteJson, setVoteJson } = useVoteForm();
  const current = readVoteJson(voteJson);
  const { query, setQuery, result, loading, failure, lookup } = useGovernanceActionLookup(
    current ? `${current.txHash}#${current.txIndex}` : null
  );

  const error = failure?.kind === "unrecognised" ? i18n("unrecognisedId")
    : failure?.kind === "response" ? failure.message ?? i18n("lookupFailed")
    : failure?.kind === "network" ? i18n("lookupUnreachable")
    : null;

  // The saved vote counts as this card's choice only when it names this action and this
  // wallet's DRep. Anything else is a vote on something the card does not show, and it is
  // named even when no card shows (a failed lookup), because Build would still cast it.
  const savedMatchesCard =
    !!result && !!current && current.txHash === result.txHash && current.txIndex === result.index &&
    current.drepId === drepId;
  const chosen = savedMatchesCard ? current.voteKind : null;
  const savedElsewhere = !!current && !savedMatchesCard && !loading;
  const choiceError = chosen ? null : validationError;
  const votable = result?.status === "active" && drepId !== null;

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="governanceActionInput">{i18n("governanceAction")}</Label>
        <div className="flex gap-3">
          <Input
            id="governanceActionInput"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                lookup();
              }
            }}
            placeholder={i18n("idPlaceholder")}
            aria-invalid={validationError && !result ? true : undefined}
            aria-describedby={validationError && !result ? "governanceActionInput-error" : undefined}
            className="font-mono text-xs"
          />
          <Button type="button" variant="secondary" onClick={lookup} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            {i18n("lookUp")}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">{i18n("pasteHint")}</p>
        {result ? null : <InlineFieldError id="governanceActionInput-error" message={validationError} />}
      </div>

      {error ? (
        // `role="alert"`: the lookup runs on demand and this is its only failure cue.
        <p
          role="alert"
          className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-100"
        >
          {error}
        </p>
      ) : null}

      {savedElsewhere ? (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
          {i18n("savedVoteElsewhere", {
            vote: i18n(VOTE_LABEL_KEYS[current.voteKind]),
            action: `${shortenIdentifier(current.txHash, 8, 4)}#${current.txIndex}`,
            voter: shortenIdentifier(current.drepId)
          })}
        </p>
      ) : null}

      {result ? (
        <div className="rounded-md border border-border/60 bg-background/40 p-2 sm:p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">
              {result.type in TYPE_LABEL_KEYS
                ? i18n(TYPE_LABEL_KEYS[result.type as keyof typeof TYPE_LABEL_KEYS])
                : result.type}
            </Badge>
            <Badge variant={result.status === "active" ? "success" : "warning"}>
              {i18n(STATUS_LABEL_KEYS[result.status])}
            </Badge>
            {result.expirationEpoch !== null && result.status === "active" ? (
              <span className="text-xs text-muted-foreground">
                {i18n("closesAfterEpoch", { epoch: result.expirationEpoch })}
              </span>
            ) : null}
          </div>
          <p className="mt-2 text-sm font-semibold text-foreground">{result.title ?? i18n("untitled")}</p>
          {result.abstract ? (
            <p className="mt-1 line-clamp-4 whitespace-pre-line text-xs text-muted-foreground">{result.abstract}</p>
          ) : null}
          <p className="mt-2 flex items-center gap-1 font-mono text-xs text-muted-foreground">
            {shortenIdentifier(result.id)}
            <CopyButton value={result.id} label={i18n("copyId")} />
          </p>

          <div className="mt-3 space-y-2">
            <p id="governanceVoteChoice" className="eyebrow text-muted-foreground">{i18n("yourVote")}</p>
            <div
              role="group"
              aria-labelledby="governanceVoteChoice"
              aria-describedby={choiceError ? "governanceVoteChoice-error" : undefined}
              className="flex flex-wrap gap-2"
            >
              {VOTE_KINDS.map((kind) => (
                <Button
                  key={kind}
                  type="button"
                  size="sm"
                  variant={chosen === kind ? "default" : "outline"}
                  aria-pressed={chosen === kind}
                  disabled={!votable}
                  onClick={() => {
                    if (!drepId) return;
                    setVoteJson(
                      buildVoteJson(drepId, { txHash: result.txHash, txIndex: result.index, voteKind: kind })
                    );
                  }}
                >
                  {chosen === kind ? <CheckCircle2 className="h-4 w-4" /> : null}
                  {i18n(VOTE_LABEL_KEYS[kind])}
                </Button>
              ))}
            </div>
            <InlineFieldError id="governanceVoteChoice-error" message={choiceError} />
            <p className="text-xs text-muted-foreground">
              {result.status !== "active" ? i18n("closedHint")
                : !drepId ? i18n("noDrepHint")
                : chosen ? i18n("chosenHint", { vote: i18n(VOTE_LABEL_KEYS[chosen]), drepId: shortenIdentifier(drepId) })
                : i18n("chooseHint")}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
