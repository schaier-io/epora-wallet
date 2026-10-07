"use client";
import { useFormatter, useTranslations } from "next-intl";
import { useId, type ReactNode } from "react";
import { HandHeart, Minus, Plus, Waypoints, type LucideIcon } from "lucide-react";

import { ApprovalPowerBar } from "./approval-power-bar";
import { GuidedDateTimeField, GuidedDurationField } from "./guided-fields";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { InfoHint } from "@/components/ui/info-hint";
import { Label } from "@/components/ui/label";
import {
  parseApprovalPowerInput,
  reachableApprovalPower,
  withProofOfLifeIncrement,
  withProofOfLifeUnlockTime,
  withSafetyTimerEnabled
} from "@/components/user/workspace/helpers/form-state";
import {
  approvalThreshold,
  coSignerSegments,
  personTag,
  thresholdIsUnreachable
} from "@/components/user/workspace/helpers/people-model";
import { MAX_ON_CHAIN_STATE_INTEGER } from "@/lib/contracts/on-chain-integer";
import { type StateFormState } from "@/lib/contracts/state-form";
import { cn } from "@/lib/utils/cn";

export type WalletRule = "co-signers" | "proof-of-life";

const STEP_BUTTON =
  "inline-flex h-11 w-11 items-center justify-center text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40 sm:h-9 sm:w-9";

function RuleTrigger({
  icon: Icon,
  title,
  summary,
  aside
}: {
  icon: LucideIcon;
  title: string;
  summary: string;
  aside?: ReactNode;
}) {
  return (
    <AccordionTrigger className="items-center gap-3 px-4 py-4 hover:no-underline sm:px-6">
      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border/60 bg-background/50 text-muted-foreground">
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-foreground">{title}</span>
        <span className="mt-0.5 block text-xs font-normal text-muted-foreground">{summary}</span>
      </span>
      {aside}
    </AccordionTrigger>
  );
}

/**
 * The threshold as a number with a step either side. It has no top: a threshold above
 * the power the co-signers hold is legal on chain, and the card warns about it rather
 * than refusing it. The box takes an exact value too, up to the chain's integer limit.
 */
function ThresholdStepper({
  id,
  labelledBy,
  value,
  onChange
}: {
  id: string;
  labelledBy: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const i18n = useTranslations("ComponentsUserWorkspaceEditorsWalletRulesCard");
  const parsed = parseApprovalPowerInput(value);
  const step = (delta: bigint) => {
    const next = (parsed ?? 0n) + delta;
    if (next >= 1n && next <= MAX_ON_CHAIN_STATE_INTEGER) onChange(next.toString());
  };
  return (
    <div className="inline-flex shrink-0 items-center overflow-hidden rounded-md border border-border/60 bg-background/40">
      <button
        type="button"
        aria-label={i18n("decrease")}
        aria-controls={id}
        disabled={parsed === null || parsed <= 1n}
        onClick={() => step(-1n)}
        className={STEP_BUTTON}
      >
        <Minus className="h-4 w-4" aria-hidden="true" />
      </button>
      <input
        id={id}
        inputMode="numeric"
        autoComplete="off"
        aria-labelledby={labelledBy}
        aria-invalid={parsed === null || parsed < 1n ? true : undefined}
        value={value}
        onChange={(event) => onChange(event.target.value.trim())}
        className="h-11 w-14 border-x border-border/60 bg-transparent text-center text-base font-semibold tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:h-9"
      />
      <button
        type="button"
        aria-label={i18n("increase")}
        aria-controls={id}
        disabled={parsed !== null && parsed >= MAX_ON_CHAIN_STATE_INTEGER}
        onClick={() => step(1n)}
        className={STEP_BUTTON}
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}

function CoSignersRule({
  value,
  onChange,
  thresholdConfirmed,
  onThresholdConfirmedChange
}: {
  value: StateFormState;
  onChange: (value: StateFormState) => void;
  thresholdConfirmed?: boolean;
  onThresholdConfirmedChange?: (value: boolean) => void;
}) {
  const i18n = useTranslations("ComponentsUserWorkspaceEditorsWalletRulesCard");
  const uid = useId();
  const segments = coSignerSegments(value);
  const threshold = approvalThreshold(value);
  const total = reachableApprovalPower(value.users);

  if (value.multiSigThresholdMode !== "some") {
    return <p className="text-sm text-muted-foreground">{i18n("turnOnCoSignerForAPerson")}</p>;
  }

  const solo = threshold === null
    ? []
    : segments
        .filter((segment) => segment.power >= threshold)
        .map((segment) => personTag(value.users[segment.userIndex]));
  const hint =
    threshold === null
      ? i18n("enterAWholeNumberOf1OrMore")
      : threshold === total
        ? i18n("everyCoSignerHasToApprove")
        : solo.length > 0
          ? i18n("canActAlone", { names: solo.join(", ") })
          : i18n("anyCoSignersTogetherReaching", { needed: threshold });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <Label id={`${uid}-label`} htmlFor={`${uid}-threshold`}>
            {i18n("approvalPowerNeeded")}
          </Label>
          <InfoHint>{i18n("approvalPowerNeededHint")}</InfoHint>
        </div>
        <ThresholdStepper
          id={`${uid}-threshold`}
          labelledBy={`${uid}-label`}
          value={value.multiSigThreshold}
          onChange={(multiSigThreshold) => onChange({ ...value, multiSigThreshold })}
        />
      </div>
      <ApprovalPowerBar
        threshold={threshold}
        segments={segments.map((segment) => ({
          key: segment.userId,
          label: personTag(value.users[segment.userIndex]),
          power: segment.power
        }))}
      />
      {thresholdIsUnreachable(value) && threshold !== null ? (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 sm:p-4" role="status">
          <p className="text-sm font-medium text-foreground">
            {i18n("noGroupOfCoSignersCanReach", { needed: threshold })}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {i18n("theyHoldTotalBetweenThem", { total })}
          </p>
          {onThresholdConfirmedChange ? (
            <label className="mt-3 inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={Boolean(thresholdConfirmed)}
                onChange={(event) => onThresholdConfirmedChange(event.target.checked)}
              />
              {i18n("iUnderstandKeepThisThreshold")}
            </label>
          ) : null}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}

function ProofOfLifeRule({
  value,
  onChange
}: {
  value: StateFormState;
  onChange: (value: StateFormState) => void;
}) {
  const i18n = useTranslations("ComponentsUserWorkspaceEditorsWalletRulesCard");
  const uid = useId();
  const format = useFormatter();
  const timerOn =
    value.proofOfLifeUnlockTimeMode === "some" || value.proofOfLifeIncrementMode === "some";
  const hasContacts = value.beneficiaries.length > 0;
  const deadline = Number(value.proofOfLifeUnlockTime);

  return (
    <div className="space-y-6">
      {/* With a recovery contact the timer is required (`validateStateDatum` rejects a
          contact without one), so the switch only shows while there is no contact. */}
      {hasContacts ? null : (
        <label className="flex items-center justify-between gap-3 text-sm">
          <span>{i18n("requireProofOfLife")}</span>
          <input
            type="checkbox"
            role="switch"
            checked={timerOn}
            onChange={(event) =>
              onChange(withSafetyTimerEnabled(value, event.target.checked, Date.now()))
            }
          />
        </label>
      )}
      {timerOn ? (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <GuidedDateTimeField
              idPrefix={`${uid}-unlock`}
              label={i18n("recoveryContactsCanClaimAfter")}
              value={value.proofOfLifeUnlockTime}
              onChange={(next) => onChange(withProofOfLifeUnlockTime(value, next, Date.now()))}
              helper={i18n("untilThisTimeOnlyTheOwnersCanUse")}
            />
            {/* `increment` caps one check-in: a renewal may set the deadline to at most
                `tx_earliest_time + increment` (`proof_of_life.ak:130`). */}
            <GuidedDurationField
              idPrefix={`${uid}-increment`}
              label={i18n("timeEachCheckInBuys")}
              value={value.proofOfLifeIncrement}
              onChange={(next) => onChange(withProofOfLifeIncrement(value, next, Date.now()))}
              helper={i18n("aCheckInMovesTheDateToAtMost")}
            />
          </div>
          {Number.isSafeInteger(deadline) && deadline > 0 ? (
            <ol aria-label={i18n("recoveryTimeline")} className="flex items-start text-[11px] leading-4 text-muted-foreground">
              <li className="flex min-w-0 flex-1 flex-col gap-1.5">
                <span className="flex items-center">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[hsl(var(--brand-teal))]" aria-hidden="true" />
                  <span className="h-0.5 flex-1 bg-[hsl(var(--brand-teal))]" aria-hidden="true" />
                </span>
                {i18n("now")}
              </li>
              <li className="flex min-w-0 flex-1 flex-col gap-1.5 text-foreground">
                <span className="flex items-center">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full border-2 border-foreground" aria-hidden="true" />
                  <span className="h-0 flex-1 border-t-2 border-dashed border-border" aria-hidden="true" />
                </span>
                {format.dateTime(new Date(deadline), { dateStyle: "medium" })}
              </li>
              <li className="flex shrink-0 flex-col items-end gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full border-2 border-border" aria-hidden="true" />
                {i18n("contactsCanClaim")}
              </li>
            </ol>
          ) : null}
          {hasContacts ? null : (
            <p className="text-xs text-muted-foreground">{i18n("turnOnRecoveryContactForAPerson")}</p>
          )}
        </>
      ) : (
        <p className="text-sm text-muted-foreground">{i18n("turnOnRecoveryContactForAPerson")}</p>
      )}
    </div>
  );
}

/**
 * The two rules that apply to the whole wallet, each one line until opened. The
 * people they count are edited in the list below; these rows hold only the numbers
 * that belong to no single person.
 */
export function WalletRulesCard({
  value,
  onChange,
  openRule,
  onOpenRuleChange,
  thresholdConfirmed,
  onThresholdConfirmedChange,
  className
}: {
  value: StateFormState;
  onChange: (value: StateFormState) => void;
  openRule: WalletRule | null;
  onOpenRuleChange: (rule: WalletRule | null) => void;
  thresholdConfirmed?: boolean;
  onThresholdConfirmedChange?: (value: boolean) => void;
  className?: string;
}) {
  const i18n = useTranslations("ComponentsUserWorkspaceEditorsWalletRulesCard");
  const format = useFormatter();
  const segments = coSignerSegments(value);
  const threshold = approvalThreshold(value);
  const total = reachableApprovalPower(value.users);
  const rulesOn = value.multiSigThresholdMode === "some";
  const timerOn =
    value.proofOfLifeUnlockTimeMode === "some" && value.proofOfLifeIncrementMode === "some";
  const deadline = Number(value.proofOfLifeUnlockTime);

  return (
    <section
      aria-label={i18n("walletRules")}
      className={cn("user-surface rounded-lg border border-border/60 bg-background/40", className)}
    >
      <Accordion
        type="single"
        collapsible
        value={openRule ?? ""}
        onValueChange={(next) => onOpenRuleChange(next ? (next as WalletRule) : null)}
      >
        <AccordionItem value="co-signers" className="border-border/60">
          <RuleTrigger
            icon={Waypoints}
            title={i18n("coSigners")}
            summary={
              rulesOn
                ? threshold === null
                  ? i18n("approvalPowerNeededNotSet")
                  : i18n("approvalPowerNeededOfTotal", { needed: threshold, total })
                : i18n("offOnlyTheOwnersCanAct")
            }
            aside={
              rulesOn && openRule !== "co-signers" ? (
                <ApprovalPowerBar
                  compact
                  className="hidden w-24 sm:block"
                  threshold={threshold}
                  segments={segments.map((segment) => ({
                    key: segment.userId,
                    label: personTag(value.users[segment.userIndex]),
                    power: segment.power
                  }))}
                />
              ) : null
            }
          />
          <AccordionContent className="px-4 pb-6 sm:pl-18 sm:pr-6">
            <CoSignersRule
              value={value}
              onChange={onChange}
              thresholdConfirmed={thresholdConfirmed}
              onThresholdConfirmedChange={onThresholdConfirmedChange}
            />
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="proof-of-life" className="border-border/60">
          <RuleTrigger
            icon={HandHeart}
            title={i18n("proofOfLife")}
            summary={
              timerOn && Number.isSafeInteger(deadline) && deadline > 0
                ? i18n("recoveryContactsCanClaimAfterDate", {
                    date: format.dateTime(new Date(deadline), { dateStyle: "medium" })
                  })
                : i18n("offNobodyCanRecoverThisWallet")
            }
          />
          <AccordionContent className="px-4 pb-6 sm:pl-18 sm:pr-6">
            <ProofOfLifeRule value={value} onChange={onChange} />
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </section>
  );
}
