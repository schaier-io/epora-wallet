"use client";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2, Loader2, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { DrepSearchResults } from "@/components/user/workspace/drep-search-results";
import { InlineFieldError } from "@/components/user/workspace/editors";
import { getFirstFieldError } from "@/components/user/workspace/helpers";
import { useWorkspaceActions } from "@/components/user/workspace/workspace-actions-context";
import { useVotingDelegate } from "@/components/user/workspace/forms/use-voting-delegate";
import type { DelegateChoice } from "@/lib/governance/vote-delegation";
import { DREP_SEARCH_QUERY_MAX_LENGTH, extractDrepId } from "@/lib/api/dreps";
import { useDrepLookup, useDrepSearch } from "@/lib/query/dreps";
import { formatLovelaceAsAda } from "@/lib/units/lovelace";
import { cn } from "@/lib/utils/cn";
import { shortenIdentifier } from "@/lib/utils/explorer";

type ChoiceKind = DelegateChoice["kind"];

const CHOICES = [
  { kind: "drep", labelKey: "choiceDrep", hintKey: "choiceDrepHint" },
  { kind: "alwaysAbstain", labelKey: "choiceAlwaysAbstain", hintKey: "choiceAlwaysAbstainHint" },
  { kind: "alwaysNoConfidence", labelKey: "choiceAlwaysNoConfidence", hintKey: "choiceAlwaysNoConfidenceHint" }
] as const satisfies readonly { kind: ChoiceKind; labelKey: string; hintKey: string }[];

// "ADA", not "₳": screen readers name U+20B3 "austral sign". The no-break space keeps the
// amount and unit on one line.
const ADA_SUFFIX = "\u00a0ADA";

const STATUS_LABEL_KEYS = { active: "statusActive", inactive: "statusInactive", retired: "statusRetired" } as const;

// Blockfrost's `drep_id` for the two predefined DReps. NOT VERIFIED against a live
// account: an unmatched value falls back to the shortened id, which is still correct.
const PREDEFINED_DREP_KEYS: Record<string, "choiceAlwaysAbstain" | "choiceAlwaysNoConfidence"> = {
  drep_always_abstain: "choiceAlwaysAbstain",
  drep_always_no_confidence: "choiceAlwaysNoConfidence"
};

function keyOf(choice: DelegateChoice): string {
  return choice.kind === "drep" ? `drep:${choice.drepId}` : choice.kind;
}

/**
 * "Voting delegate": hands this wallet's voting power to a DRep, or to one of the two
 * predefined options. The choice is written as a Mesh certificate into the publish form,
 * so the builder, validation and co-signing request keep reading one payload.
 */
export function WalletPublishConfigView() {
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
  // Text that holds a DRep id goes to the exact lookup; anything else searches by name.
  const typedId = extractDrepId(lookup.query) !== null;
  const search = useDrepSearch(lookup.query, browsingDrep && !typedId);
  // Arrow keys select radios as they move, so passing over "Always abstain" and back must not
  // lose a confirmed DRep: returning to "A DRep" restores it.
  const [confirmedDrepId, setConfirmedDrepId] = useState(savedDrepId);

  // A choice saved from elsewhere (a draft restore, a reset) re-seeds the local state. The
  // form's own writes do not: re-seeding then would replace a pasted link, and a remount
  // would drop the focus of the button the reader just pressed.
  const savedKey = saved ? keyOf(saved.choice) : "";
  const [seenKey, setSeenKey] = useState(savedKey);
  const [ownKey, setOwnKey] = useState<string | null>(null);
  if (savedKey !== seenKey) {
    setSeenKey(savedKey);
    if (savedKey !== ownKey) {
      setOwnKey(null);
      setBrowsingDrep(savedDrepId !== null);
      setConfirmedDrepId(savedDrepId);
      if (savedDrepId) lookup.seed(savedDrepId);
    }
  }
  const write = (choice: DelegateChoice) => {
    setOwnKey(keyOf(choice));
    if (choice.kind === "drep") setConfirmedDrepId(choice.drepId);
    delegate.choose(choice);
  };

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

  const deposit = delegate.depositLovelace === null ? null : `${formatLovelaceAsAda(String(delegate.depositLovelace))}${ADA_SUFFIX}`;
  const current = delegate.account?.drepId ?? null;
  const currentLabel = current === null ? i18n("currentNone")
    : current in PREDEFINED_DREP_KEYS ? i18n(PREDEFINED_DREP_KEYS[current])
    : shortenIdentifier(current);
  const resultChosen = !!result && savedDrepId === result.drepId;

  const isSelected = (kind: ChoiceKind) =>
    kind === "drep" ? browsingDrep : !browsingDrep && saved?.choice.kind === kind;
  const pick = (kind: ChoiceKind) => {
    setBrowsingDrep(kind === "drep");
    if (kind !== "drep") write({ kind });
    else if (confirmedDrepId) write({ kind: "drep", drepId: confirmedDrepId });
    // A saved predefined choice must not ride along while "A DRep" shows as picked: Build
    // would send it. Nothing is saved until the reader confirms a DRep.
    else if (saved && saved.choice.kind !== "drep") {
      setOwnKey("");
      delegate.clear();
    }
  };
  const savedLabel = !saved ? ""
    : saved.choice.kind !== "drep" ? i18n(saved.choice.kind === "alwaysAbstain" ? "choiceAlwaysAbstain" : "choiceAlwaysNoConfidence")
    : resultChosen && result.name ? result.name
    : shortenIdentifier(saved.choice.drepId);
  // One place shows the validation message: under the DRep box while browsing, else under the choices.
  const inputError = browsingDrep && !resultChosen ? validationError : null;
  const choiceError = browsingDrep ? null : validationError;

  // Retry unmounts once the check succeeds; focus then moves to the new status text, not <body>.
  const statusRef = useRef<HTMLDivElement>(null);
  const retryPressed = useRef(false);
  useEffect(() => {
    if (!delegate.accountFailed && retryPressed.current) {
      retryPressed.current = false;
      // Only when focus was actually lost: a late, unrelated refetch must not steal it.
      if (document.activeElement === document.body) statusRef.current?.focus();
    }
  }, [delegate.accountFailed]);

  const openTop = () => {
    const top = search.dreps[0];
    if (top) lookup.seed(top.drepId);
  };
  const enterPending = useRef(false);
  const openTopLater = useEffectEvent(openTop);
  useEffect(() => {
    if (!enterPending.current) return;
    if (search.failed) enterPending.current = false;
    if (!search.fresh) return;
    enterPending.current = false;
    openTopLater();
  }, [search.fresh, search.failed]);

  if (!delegate.stakeAddress) {
    return <p className="text-xs text-muted-foreground">{i18n("noStakeAddress")}</p>;
  }

  const inputDescribedBy = [
    inputError ? "drepLookupInput-error" : null,
    lookupError ? "drepLookupInput-lookupError" : null,
    "drepLookupInput-hint"
  ].filter(Boolean).join(" ");
  // Look up on a typed name opens the top match. Pressed before the matches arrive, it
  // waits for them; a failed search ends the wait, so a later refetch opens nothing unasked.
  const lookUp = () => {
    if (typedId || !lookup.query.trim()) {
      if (!lookup.loading) lookup.lookup();
    } else if (search.fresh) openTop();
    else if (!search.failed) enterPending.current = true;
  };

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
        {/* Only the text is live: a Retry button inside the region would be read out with it. */}
        <div role="status" ref={statusRef} tabIndex={-1} className="outline-none">
          {delegate.accountInvalid ? (
            i18n("accountWrongNetwork")
          ) : delegate.accountFailed ? (
            i18n("accountFailed")
          ) : delegate.accountLoading ? (
            i18n("accountLoading")
          ) : (
            <>
              {i18n("currentDelegate", { delegate: currentLabel })}
              {delegate.account?.registered === false && deposit ? (
                <span className="mt-1 block max-w-prose text-pretty">{i18n("notRegisteredNote", { deposit })}</span>
              ) : null}
            </>
          )}
        </div>
        {delegate.accountFailed ? (
          <Button type="button" variant="link" className="h-auto p-0 text-xs sm:h-auto" onClick={() => { retryPressed.current = true; delegate.retryAccount(); }}>
            {i18n("retry")}
          </Button>
        ) : null}
      </div>

      <fieldset
        aria-describedby={choiceError ? "votingDelegateChoice-error" : undefined}
        // min-w-0: a fieldset is min-content wide by default, so a long DRep name would widen the form.
        className="min-w-0 space-y-2"
      >
        <legend className="mb-2 text-sm font-medium text-foreground">{i18n("delegateTo")}</legend>
        {/* Radios, not toggle buttons: exactly one choice holds, and arrow keys move between them. */}
        <div className="grid gap-2 sm:grid-cols-3">
          {CHOICES.map((choice) => (
            <label
              key={choice.kind}
              className={cn(
                buttonVariants({ variant: "outline" }),
                "group h-auto cursor-pointer flex-col items-start justify-start gap-0.5 whitespace-normal py-2 text-left sm:h-auto",
                "has-[:checked]:border-primary has-[:checked]:bg-primary/10 has-[:checked]:hover:bg-primary/15",
                "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2",
                // A label never matches `:disabled`, so the button's hover and press feedback is undone here.
                "has-[:disabled]:cursor-not-allowed has-[:disabled]:bg-muted has-[:disabled]:text-muted-foreground",
                "has-[:disabled:not(:checked)]:hover:border-input has-[:disabled]:hover:bg-muted has-[:disabled]:hover:text-muted-foreground",
                "has-[:disabled]:active:translate-y-0 has-[:disabled]:active:scale-100"
              )}
            >
              <input
                type="radio"
                name="votingDelegateChoice"
                className="sr-only"
                checked={isSelected(choice.kind)}
                disabled={!delegate.ready}
                onChange={() => pick(choice.kind)}
              />
              <span className="flex w-full items-center justify-between gap-1.5 text-sm">
                {i18n(choice.labelKey)}
                <CheckCircle2 aria-hidden="true" className="invisible h-4 w-4 shrink-0 text-primary group-has-[:checked]:visible" />
              </span>
              <span className="text-xs font-normal opacity-80 group-has-[:disabled]:opacity-100">{i18n(choice.hintKey)}</span>
            </label>
          ))}
        </div>
        <InlineFieldError id="votingDelegateChoice-error" message={choiceError} />

        {browsingDrep ? (
          <div className="space-y-4 border-s-2 border-border/60 ps-3">
            <div className="space-y-2">
              <Label htmlFor="drepLookupInput">{i18n("findDrep")}</Label>
              <div className="flex gap-3">
                <Input
                  id="drepLookupInput"
                  value={lookup.query}
                  onChange={(event) => {
                    lookup.setQuery(event.target.value);
                    enterPending.current = false;
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      lookUp();
                    }
                  }}
                  placeholder={i18n("idPlaceholder")}
                  spellCheck={false}
                  autoComplete="off"
                  // The search rejects longer text; a pasted explorer link holds an id, so it
                  // goes to the exact lookup and may be longer.
                  maxLength={typedId ? undefined : DREP_SEARCH_QUERY_MAX_LENGTH}
                  aria-invalid={inputError || lookupError ? true : undefined}
                  aria-describedby={inputDescribedBy}
                  // `sm:` only: below it the field keeps 16px, or iOS Safari zooms on focus.
                  className="min-w-0 font-mono sm:text-xs"
                />
                {/* aria-busy, not disabled: disabling the focused button would drop keyboard focus. */}
                <Button type="button" variant="secondary" className="shrink-0" onClick={lookUp} aria-busy={lookup.loading || undefined}>
                  {lookup.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  {i18n("lookUp")}
                </Button>
              </div>
              <InlineFieldError id="drepLookupInput-error" message={inputError} />
              <p id="drepLookupInput-hint" className="text-xs text-muted-foreground">{i18n("pasteHint")}</p>
              {typedId ? null : (
                <DrepSearchResults
                  query={search.query}
                  dreps={search.dreps}
                  loading={search.loading}
                  failed={search.failed}
                  onOpen={lookup.seed}
                />
              )}
            </div>

            {/* A found DRep is otherwise silent; failures use the alert below. */}
            <p role="status" className="sr-only">
              {lookup.loading ? i18n("lookingUp") : result ? i18n("lookupFound", { name: result.name ?? i18n("unnamed") }) : ""}
            </p>

            {lookupError ? (
              // `role="alert"`: the lookup runs on demand and this is its only failure cue.
              <p id="drepLookupInput-lookupError" role="alert" className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                {lookupError}
              </p>
            ) : null}

            {result ? (
              <div className="rounded-lg border border-border/60 bg-background/40 p-2 sm:p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={result.status === "active" ? "success" : result.status === "retired" ? "destructive" : "warning"}>
                    {i18n(STATUS_LABEL_KEYS[result.status])}
                  </Badge>
                  <Badge variant="outline">{result.hasScript ? i18n("typeScript") : i18n("typeKey")}</Badge>
                </div>
                <p className="mt-2 text-sm font-semibold text-foreground [overflow-wrap:anywhere]">{result.name ?? i18n("unnamed")}</p>
                {result.votingPowerLovelace !== null ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {i18n("votingPower", { power: `${formatLovelaceAsAda(result.votingPowerLovelace)}${ADA_SUFFIX}` })}
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
                    onClick={() => write({ kind: "drep", drepId: result.drepId })}
                  >
                    {/* Always mounted so the button keeps its width when chosen. */}
                    <CheckCircle2 aria-hidden="true" className={cn("h-4 w-4", !resultChosen && "invisible")} />
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
      </fieldset>

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
