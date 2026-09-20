"use client";

import { ArrowUpRight, Bot, Clock } from "lucide-react";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";

import { DisclosureSection } from "@/components/user/workspace/editors";
import {
  buildCardanoscanTransactionUrl,
  formatTimestampLabel
} from "@/components/user/workspace/helpers";
import { formatConfiguredAllowance } from "@/components/user/workspace/wallet-access-summary";
import {
  deriveAgentBudgets,
  type AgentBudget,
  type AgentBudgetAsset
} from "@/components/user/workspace/agent-budget-model";
import {
  collectAgentPayments,
  type AgentPaymentRecord
} from "@/components/user/workspace/agent-payment-attribution";
import type { StateFormState } from "@/lib/contracts/state-form";
import type { WalletActivityEvent } from "@/components/user/workspace/types";

/** The dashboard's activity feed is already newest-first; the console shows a page of it. */
const MAX_PAYMENT_ROWS = 8;

function assetAmount(asset: AgentBudgetAsset, value: string) {
  return formatConfiguredAllowance({
    policyId: asset.policyId,
    assetName: asset.assetName,
    amount: value
  });
}

function AgentBudgetRow({ label, amount }: { label: string; amount: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right font-medium tabular-nums text-foreground">{amount}</dd>
    </div>
  );
}

function AgentBudgetCard({ budget }: { budget: AgentBudget }) {
  const i18n = useTranslations("ComponentsUserWorkspaceAgentSpendingConsole");
  const resetLabel =
    budget.reset.kind === "reset-scheduled"
      ? i18n("resetScheduled", { date: formatTimestampLabel(budget.reset.resetAtMs) })
      : budget.reset.kind === "reset-due"
        ? i18n("resetDue")
        : i18n("resetUnknown");

  return (
    <div className="min-w-0 rounded-lg border border-border/60 bg-background/30 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-foreground">
          {i18n("agentRecordLabel", { id: budget.userId })}
        </span>
        {budget.isAdmin ? <Badge variant="outline">{i18n("ownerBadge")}</Badge> : null}
        {budget.status === "exhausted" ? (
          <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-200">
            {i18n("statusExhausted")}
          </Badge>
        ) : (
          <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-200">
            {i18n("statusAvailable")}
          </Badge>
        )}
      </div>
      <dl className="mt-3 space-y-1.5">
        {budget.assets.map((asset) => (
          <div
            key={`${asset.policyId}.${asset.assetName}`}
            className="rounded-md border border-border/40 bg-muted/10 px-2.5 py-2"
          >
            <AgentBudgetRow label={i18n("columnLimit")} amount={assetAmount(asset, asset.limit)} />
            <AgentBudgetRow
              label={i18n("columnRemaining")}
              amount={
                asset.remaining === null
                  ? i18n("remainingUnknown")
                  : assetAmount(asset, asset.remaining)
              }
            />
            <AgentBudgetRow
              label={i18n("columnSpent")}
              amount={asset.spent === null ? i18n("remainingUnknown") : assetAmount(asset, asset.spent)}
            />
          </div>
        ))}
      </dl>
      <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Clock className="h-3 w-3" aria-hidden="true" />
        {resetLabel}
      </p>
    </div>
  );
}

function AgentPaymentRow({ record, budgets }: { record: AgentPaymentRecord; budgets: AgentBudget[] }) {
  const i18n = useTranslations("ComponentsUserWorkspaceAgentSpendingConsole");
  const attribution = record.attribution;
  // A wallet the owner controls can itself hold an allowance record, so an
  // owner-funded payment can match an admin-tagged record. The chip then says
  // owner, because "Agent record #N" would overclaim who spent.
  const matchedBudget = attribution.kind === "agent"
    ? budgets.find((budget) => budget.userId === attribution.agentId)
    : undefined;
  const chip =
    attribution.kind === "agent"
      ? matchedBudget?.isAdmin
        ? {
            label: i18n("attributionOwnerRecord", { id: attribution.agentId }),
            className: "border-border/60 bg-background/50 text-muted-foreground"
          }
        : {
            label: i18n("attributionAgent", { id: attribution.agentId }),
            className: "border-sky-500/30 bg-sky-500/10 text-sky-100"
          }
      : attribution.kind === "owner"
        ? {
            label: i18n("attributionOwner"),
            className: "border-border/60 bg-background/50 text-muted-foreground"
          }
        : attribution.kind === "ambiguous"
          ? {
              label: i18n("attributionAmbiguous"),
              className: "border-amber-500/30 bg-amber-500/10 text-amber-100"
            }
          : null;
  const reason =
    attribution.kind === "ambiguous"
      ? attribution.reason === "multiple-agents"
        ? i18n("ambiguousMultipleReason")
        : i18n("ambiguousNoSignerReason")
      : null;
  // collectAgentPayments already fell back from block time to the slot.
  const timeLabel =
    record.occurredAtMs === null
      ? i18n("timeNotAvailable")
      : formatTimestampLabel(record.occurredAtMs);
  const hash = record.event.transaction.hash;

  return (
    <li className="min-w-0 rounded-md border border-border/40 bg-muted/10 px-2.5 py-2">
      <div className="flex flex-wrap items-center gap-2">
        {chip ? (
          <Badge variant="outline" className={chip.className}>
            {chip.label}
          </Badge>
        ) : null}
        <span className="text-xs text-muted-foreground">{timeLabel}</span>
        <span className="ml-auto text-sm font-medium tabular-nums text-foreground">
          {record.event.amountSummary}
        </span>
        {hash ? (
          <a
            href={buildCardanoscanTransactionUrl(hash)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-border/60 bg-background/50 text-muted-foreground transition-colors hover:text-foreground"
            title={i18n("openTitleOnCardanoscan", { hash })}
            aria-label={i18n("openTitleOnCardanoscan", { hash })}
          >
            <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
          </a>
        ) : null}
      </div>
      {reason ? <p className="mt-1 text-xs text-muted-foreground">{reason}</p> : null}
    </li>
  );
}

export function AgentSpendingConsole({
  state,
  events,
  eventsLoading,
  walletAddress,
  ownerAddress,
  nowMs,
  onChangeAccess
}: {
  state: StateFormState;
  events: WalletActivityEvent[];
  eventsLoading: boolean;
  walletAddress: string | null;
  ownerAddress: string | null;
  nowMs: number;
  onChangeAccess: () => void;
}) {
  const i18n = useTranslations("ComponentsUserWorkspaceAgentSpendingConsole");
  const budgets = deriveAgentBudgets(state, nowMs);
  const payments = collectAgentPayments(events, {
    walletAddress,
    ownerAddress,
    agents: budgets.map((budget) => ({ id: budget.userId, wallets: budget.wallets }))
  }).slice(0, MAX_PAYMENT_ROWS);

  return (
    <section
      className="rounded-lg border border-primary/20 bg-primary/[0.04] p-3 sm:p-4"
      aria-labelledby="agent-spending-console-heading"
    >
      <div className="space-y-3">
        {/* The avatar indents the heading row only. While it wrapped the whole column,
            every row under it carried a 48px left inset against a flush right edge. */}
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-primary/25 bg-primary/10 text-primary">
            <Bot className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 id="agent-spending-console-heading" className="text-sm font-semibold text-foreground">
              {i18n("title")}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">{i18n("description")}</p>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">{i18n("freshnessNote")}</p>

        {budgets.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border/60 bg-background/30 p-3">
            <p className="text-sm font-medium text-foreground">{i18n("emptyTitle")}</p>
            <p className="mt-1 text-sm text-muted-foreground">{i18n("emptyHint")}</p>
            <button
              type="button"
              onClick={onChangeAccess}
              className="mt-2 inline-flex items-center gap-1 rounded-full border border-dashed border-border/60 px-2 py-0.5 text-xs font-medium text-foreground/90 transition-[color,background-color,border-color] duration-200 hover:border-primary/40 hover:bg-primary/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              {i18n("changeAccess")}
            </button>
          </div>
        ) : (
          <div className="grid gap-3 lg:grid-cols-[repeat(auto-fit,minmax(20rem,1fr))]">
            {budgets.map((budget) => (
              <AgentBudgetCard key={`${budget.recordIndex}-${budget.userId}`} budget={budget} />
            ))}
            <button
              type="button"
              onClick={onChangeAccess}
              className="col-span-full justify-self-start self-start text-left rounded-sm text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              {i18n("changeAccess")}
            </button>
          </div>
        )}

        <DisclosureSection
          title={i18n("paymentsHeading")}
          description={i18n("paymentsDescription")}
        >
          {eventsLoading ? (
            <p role="status" className="text-sm text-muted-foreground">
              {i18n("paymentsLoading")}
            </p>
          ) : payments.length === 0 ? (
            <p className="text-sm text-muted-foreground">{i18n("paymentsEmpty")}</p>
          ) : (
            <ul className="space-y-2">
              {payments.map((record) => (
                <AgentPaymentRow key={record.id} record={record} budgets={budgets} />
              ))}
            </ul>
          )}
        </DisclosureSection>
      </div>
    </section>
  );
}
