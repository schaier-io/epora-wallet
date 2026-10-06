"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2, Loader2, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { InlineFieldError } from "@/components/user/workspace/editors";
import { getFirstFieldError } from "@/components/user/workspace/helpers";
import { useWorkspaceActions } from "@/components/user/workspace/workspace-actions-context";
import { usePublishForm } from "@/components/user/workspace/forms/use-publish-form";
import { useVotingDelegate } from "@/components/user/workspace/forms/use-voting-delegate";
import { readVoteDelegationJson, type DelegateChoice } from "@/lib/governance/vote-delegation";
import { useDrepLookup } from "@/lib/query/dreps";
import { formatLovelaceAsAda } from "@/lib/units/lovelace";
import { shortenIdentifier } from "@/lib/utils/explorer";

type ChoiceKind = DelegateChoice["kind"];

const CHOICES = [
  { kind: "drep", labelKey: "choiceDrep", hintKey: "choiceDrepHint" },
  { kind: "alwaysAbstain", labelKey: "choiceAlwaysAbstain", hintKey: "choiceAlwaysAbstainHint" },
  { kind: "alwaysNoConfidence", labelKey: "choiceAlwaysNoConfidence", hintKey: "choiceAlwaysNoConfidenceHint" }
] as const satisfies readonly { kind: ChoiceKind; labelKey: string; hintKey: string }[];

const STATUS_LABEL_KEYS = { active: "statusActive", inactive: "statusInactive", retired: "statusRetired" } as const;

// Blockfrost's `drep_id` for the two predefined DReps. NOT VERIFIED against a live
// account: an unmatched value falls back to the shortened id, which is still correct.
const PREDEFINED_DREP_KEYS: Record<string, "choiceAlwaysAbstain" | "choiceAlwaysNoConfidence"> = {
  drep_always_abstain: "choiceAlwaysAbstain",
  drep_always_no_confidence: "choiceAlwaysNoConfidence"
};

/**
 * "Voting delegate": hands this wallet's voting power to a DRep, or to one of the two
 * predefined options. The choice is written as a Mesh certificate into the publish form,
 * so the builder, validation and co-signing request keep reading one payload.
 *
 * Keyed on the saved DRep, so a certificate that arrives while the form is open (a draft
 * restore, a reset) re-seeds the local lookup state instead of showing a stale card.
 */
export function WalletPublishConfigView() {
  const { publishCertificateJson } = usePublishForm();
  const saved = readVoteDelegationJson(publishCertificateJson);
  const savedDrepId = saved?.choice.kind === "drep" ? saved.choice.drepId : null;
  return <VotingDelegateForm key={savedDrepId ?? ""} />;
}

function VotingDelegateForm() {
  const i18n = useTranslations("ComponentsUserWorkspaceConfigWalletpublishView");
  const { activeFieldErrors } = useWorkspaceActions();
  const delegate = useVotingDelegate();
  const { saved } = delegate;
  const savedDrepId = saved?.choice.kind === "drep" ? saved.choice.drepId : null;
  // Only "browsing for a DRep" is local; every other selection is the saved certificate, so
  // clearing the form clears the selection too.
  const [browsingDrep, setBrowsingDrep] = useState(savedDrepId !== null);
  const lookup = useDrepLookup(savedDrepId);
  const { result } = lookup;

  const validationError =
    getFirstFieldError(activeFieldErrors, "Certificate JSON") ??
    getFirstFieldError(activeFieldErrors, "Publish");
  const lookupError = lookup.failure?.kind === "unrecognised" ? i18n("unrecognisedId")
    : lookup.failure?.kind === "response"
      ? lookup.failure.status === 404 ? i18n("notFound")
        : lookup.failure.status === 400 ? i18n("invalidId")
        : lookup.failure.status === 429 ? i18n("tooManyLookups")
        : i18n("lookupFailed")
    : lookup.failure?.kind === "network" ? i18n("lookupUnreachable")
    : null;

  const deposit = delegate.depositLovelace === null ? null : `${formatLovelaceAsAda(String(delegate.depositLovelace))} ₳`;
  const current = delegate.account?.drepId ?? null;
  const currentLabel = current === null ? i18n("currentNone")
    : current in PREDEFINED_DREP_KEYS ? i18n(PREDEFINED_DREP_KEYS[current])
    : shortenIdentifier(current);
  const resultChosen = !!result && savedDrepId === result.drepId;

  const isSelected = (kind: ChoiceKind) =>
    kind === "drep" ? browsingDrep : !browsingDrep && saved?.choice.kind === kind;
  const pick = (kind: ChoiceKind) => {
    setBrowsingDrep(kind === "drep");
    if (kind !== "drep") delegate.choose({ kind });
    // A saved predefined choice must not ride along while "A DRep" shows as picked: Build
    // would send it. Nothing is saved until the reader confirms a DRep.
    else if (saved && saved.choice.kind !== "drep") delegate.clear();
  };
  const savedLabel = !saved ? ""
    : saved.choice.kind !== "drep" ? i18n(saved.choice.kind === "alwaysAbstain" ? "choiceAlwaysAbstain" : "choiceAlwaysNoConfidence")
    : resultChosen && result.name ? result.name
    : shortenIdentifier(saved.choice.drepId);
  // One place shows the validation message: under the DRep box while browsing, else under the choices.
  const inputError = browsingDrep && !resultChosen ? validationError : null;
  const choiceError = browsingDrep ? null : validationError;

  if (!delegate.stakeAddress) {
    return <p className="text-xs text-muted-foreground">{i18n("noStakeAddress")}</p>;
  }

  return (
    <div className="space-y-4">
      <div role="status" className="rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
        {delegate.accountInvalid ? (
          i18n("accountWrongNetwork")
        ) : delegate.accountFailed ? (
          <span className="flex flex-wrap items-center gap-2">
            {i18n("accountFailed")}
            <Button type="button" size="sm" variant="outline" className="px-2 text-xs" onClick={delegate.retryAccount}>
              {i18n("retry")}
            </Button>
          </span>
        ) : delegate.accountLoading ? (
          i18n("accountLoading")
        ) : (
          <>
            {i18n("currentDelegate", { delegate: currentLabel })}
            {delegate.account?.registered === false && deposit ? (
              <span className="mt-1 block">{i18n("notRegisteredNote", { deposit })}</span>
            ) : null}
          </>
        )}
      </div>

      <div className="space-y-2">
        <p id="votingDelegateChoice" className="text-sm font-medium text-foreground">{i18n("delegateTo")}</p>
        <div
          role="group"
          aria-labelledby="votingDelegateChoice"
          aria-describedby={choiceError ? "votingDelegateChoice-error" : undefined}
          className="grid gap-2 sm:grid-cols-3"
        >
          {CHOICES.map((choice) => {
            const selected = isSelected(choice.kind);
            return (
              <Button
                key={choice.kind}
                type="button"
                variant={selected ? "default" : "outline"}
                aria-pressed={selected}
                disabled={!delegate.ready}
                onClick={() => pick(choice.kind)}
                className="h-auto flex-col items-start gap-0.5 whitespace-normal py-2 text-left"
              >
                <span className="flex items-center gap-1.5 text-sm">
                  {selected ? <CheckCircle2 className="h-4 w-4" /> : null}
                  {i18n(choice.labelKey)}
                </span>
                <span className="text-xs font-normal opacity-80">{i18n(choice.hintKey)}</span>
              </Button>
            );
          })}
        </div>
        <InlineFieldError id="votingDelegateChoice-error" message={choiceError} />
      </div>

      {browsingDrep ? (
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="drepLookupInput">{i18n("findDrep")}</Label>
            <div className="flex gap-3">
              <Input
                id="drepLookupInput"
                value={lookup.query}
                onChange={(event) => lookup.setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    lookup.lookup();
                  }
                }}
                placeholder={i18n("idPlaceholder")}
                aria-invalid={inputError ? true : undefined}
                aria-describedby={inputError ? "drepLookupInput-error" : undefined}
                className="font-mono text-xs"
              />
              <Button type="button" variant="secondary" onClick={lookup.lookup} disabled={lookup.loading}>
                {lookup.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                {i18n("lookUp")}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">{i18n("pasteHint")}</p>
            <InlineFieldError id="drepLookupInput-error" message={inputError} />
          </div>

          {lookupError ? (
            // `role="alert"`: the lookup runs on demand and this is its only failure cue.
            <p role="alert" className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
              {lookupError}
            </p>
          ) : null}

          {result ? (
            <div className="rounded-md border border-border/60 bg-background/40 p-2 sm:p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={result.status === "active" ? "success" : "warning"}>
                  {i18n(STATUS_LABEL_KEYS[result.status])}
                </Badge>
                <Badge variant="outline">{result.hasScript ? i18n("typeScript") : i18n("typeKey")}</Badge>
              </div>
              <p className="mt-2 text-sm font-semibold text-foreground">{result.name ?? i18n("unnamed")}</p>
              {result.votingPowerLovelace !== null ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  {i18n("votingPower", { power: `${formatLovelaceAsAda(result.votingPowerLovelace)} ₳` })}
                </p>
              ) : null}
              <p className="mt-2 flex items-center gap-1 font-mono text-xs text-muted-foreground">
                {shortenIdentifier(result.drepId)}
                <CopyButton value={result.drepId} label={i18n("copyId")} />
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={resultChosen ? "default" : "outline"}
                  aria-pressed={resultChosen}
                  disabled={result.status === "retired" || !delegate.ready}
                  onClick={() => delegate.choose({ kind: "drep", drepId: result.drepId })}
                >
                  {resultChosen ? <CheckCircle2 className="h-4 w-4" /> : null}
                  {i18n("delegateToThisDrep")}
                </Button>
                <span className="text-xs text-muted-foreground">
                  {result.status === "retired" ? i18n("retiredHint")
                    : result.status === "inactive" ? i18n("inactiveHint")
                    : null}
                </span>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {saved ? (
        <p className="border-t border-border/60 pt-3 text-xs text-muted-foreground">
          {saved.registers && deposit
            ? i18n("sendsRegistrationAndDelegation", { deposit, delegate: savedLabel })
            : i18n("sendsDelegation", { delegate: savedLabel })}
        </p>
      ) : null}
    </div>
  );
}
