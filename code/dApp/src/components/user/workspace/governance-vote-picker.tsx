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
import { GovernanceActionList, useGovernanceTypeLabel } from "@/components/user/workspace/governance-action-list";
import { walletDrepIdAtom } from "@/components/user/workspace/atoms/workspace-wallet-derivations.atoms";
import { useVoteForm } from "@/components/user/workspace/forms/use-vote-form";
import type { GovernanceAction } from "@/lib/api/governance-actions";
import { VOTE_KINDS, buildVoteJson, readVoteJson, type VoteKind } from "@/lib/governance/vote-json";
import { useGovernanceActionPicker } from "@/lib/query/governance-actions";
import { CARDANO_NETWORK, GOVERNANCE_EXPLORER_URLS } from "@/lib/cardano-network";
import { shortenIdentifier } from "@/lib/utils/explorer";

const STATUS_LABEL_KEYS = {
  active: "statusActive",
  ratified: "statusRatified",
  enacted: "statusEnacted",
  dropped: "statusDropped",
  expired: "statusExpired"
} as const satisfies Record<GovernanceAction["status"], string>;

const VOTE_LABEL_KEYS = { Yes: "yes", No: "no", Abstain: "abstain" } as const satisfies Record<VoteKind, string>;

/**
 * Pick an open Cardano governance action, or paste any action's id, tx hash or link, see
 * what it is, and pick Yes, No or Abstain.
 * The choice is written into the vote JSON (`voteJsonAtom`) with this wallet as the voting
 * DRep, so validation, the builder and the co-signing request keep reading one payload.
 */
export function GovernanceVotePicker({ error: validationError = null }: { error?: string | null }) {
  const i18n = useTranslations("ComponentsUserWorkspaceGovernanceVotePicker");
  const drepId = useAtomValue(walletDrepIdAtom);
  const { voteJson, setVoteJson } = useVoteForm();
  const current = readVoteJson(voteJson);
  const typeLabel = useGovernanceTypeLabel();
  const { query, setQuery, actions, openCount, searching, listLoading, listFailed, result, loading, failure, pick } =
    useGovernanceActionPicker(current ? `${current.txHash}#${current.txIndex}` : null);

  const error = failure?.kind === "response"
    ? failure.status === 404 ? i18n("notFound")
      : failure.status === 400 ? i18n("invalidId")
      : failure.status === 429 ? i18n("tooManyLookups")
      : i18n("lookupFailed")
    : failure?.kind === "network" ? i18n("lookupUnreachable")
    : null;

  // The saved vote counts as this card's choice only when it names this action and this
  // wallet's DRep; an unknown DRep, before the wallet opens, is not a mismatch. Anything else
  // is a vote on something the card does not show, and it is named even when no card shows
  // (a failed lookup), because Build would still cast it.
  const savedMatchesCard =
    !!result && !!current && current.txHash === result.txHash && current.txIndex === result.index &&
    (drepId === null || current.drepId === drepId);
  const chosen = savedMatchesCard ? current.voteKind : null;
  const savedElsewhere = !!current && !savedMatchesCard && !loading && !listLoading;
  const choiceError = chosen ? null : validationError;
  const votable = result?.status === "active" && drepId !== null;

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="governanceActionInput">{i18n("governanceAction")}</Label>
        <div className="relative">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            id="governanceActionInput"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={i18n("searchPlaceholder")}
            aria-invalid={validationError && !result ? true : undefined}
            aria-describedby={validationError && !result ? "governanceActionInput-error" : undefined}
            className="pl-9"
          />
        </div>
        <p className="text-xs text-muted-foreground">
          {i18n.rich("pasteHint", {
            govtool: (chunks) => (
              <a
                href={GOVERNANCE_EXPLORER_URLS.govtool}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 hover:text-foreground"
              >
                {chunks}
              </a>
            ),
            cardanoscan: (chunks) => (
              <a
                href={GOVERNANCE_EXPLORER_URLS.cardanoscan}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 hover:text-foreground"
              >
                {chunks}
              </a>
            )
          })}
        </p>
        {CARDANO_NETWORK === "mainnet" ? null : (
          <p className="text-xs text-muted-foreground">
            {i18n("testNetworkActionsNote", { network: CARDANO_NETWORK })}
          </p>
        )}
        {result ? null : <InlineFieldError id="governanceActionInput-error" message={validationError} />}
      </div>

      {loading ? (
        <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
          {i18n("lookingUp")}
        </p>
      ) : null}

      {error ? (
        // `role="alert"`: the lookup starts from a paste and this is its only failure cue.
        <p
          role="alert"
          className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-100"
        >
          {error}
        </p>
      ) : null}

      {savedElsewhere ? (
        // `role="status"`: it appears after a lookup the reader started, and it says the vote
        // Build would cast is not the one on screen.
        <p
          role="status"
          className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
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
            <Badge variant="outline">{typeLabel(result.type)}</Badge>
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
                    pick(result);
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

      {actions.length > 0 || !result ? (
        <section aria-labelledby="governanceOpenActions" className="space-y-2">
          <p id="governanceOpenActions" className="eyebrow text-muted-foreground">
            {openCount === null ? i18n("openActionsHeading") : i18n("openActions", { count: openCount })}
          </p>
          {listLoading ? (
            <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
              {i18n("loadingActions")}
            </p>
          ) : listFailed ? (
            <p className="text-xs text-muted-foreground">{i18n("actionsFailed")}</p>
          ) : openCount === 0 ? (
            <p className="text-xs text-muted-foreground">{i18n("noOpenActions", { network: CARDANO_NETWORK })}</p>
          ) : actions.length === 0 ? (
            searching ? null : <p className="text-xs text-muted-foreground">{i18n("noMatch")}</p>
          ) : (
            <GovernanceActionList actions={actions} selectedId={result?.id ?? null} onPick={pick} />
          )}
        </section>
      ) : null}
    </div>
  );
}
