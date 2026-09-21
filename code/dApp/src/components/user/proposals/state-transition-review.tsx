import { useFormatter, useTranslations } from "next-intl";
import { defaultTimeZone } from "@/i18n/config";
import type { ProposalStateTransition } from "@/lib/proposals/state-transition";

export function StateTransitionReview({ transition }: { transition: ProposalStateTransition | null }) {
  const formatter = useFormatter();
  const i18n = useTranslations("ComponentsUserProposalsProposalDetail");
  const labels: Record<string, string> = {
    state: i18n("field_state"),
    access: i18n("field_access"),
    users: i18n("field_users"),
    multi_sig_threshold: i18n("field_multi_sig_threshold"),
    beneficiaries: i18n("field_beneficiaries"),
    proof_of_life: i18n("field_proof_of_life"),
    unlock_time: i18n("field_unlock_time"),
    increment: i18n("field_increment"),
    streaming_payments: i18n("field_streaming_payments"),
    wallet_name: i18n("field_wallet_name"),
    text: i18n("field_text"),
    bytes: i18n("field_bytes"),
    intended_stake_credential: i18n("field_intended_stake_credential"),
    last_non_admin_payout_at: i18n("field_last_non_admin_payout_at"),
    id: i18n("field_id"),
    user_wallets: i18n("field_user_wallets"),
    per_day_allowance: i18n("field_per_day_allowance"),
    remaining_allowance: i18n("field_remaining_allowance"),
    next_allowance_reset: i18n("field_next_allowance_reset"),
    can_renew_proof_of_life: i18n("field_can_renew_proof_of_life"),
    multi_sig_power: i18n("field_multi_sig_power"),
    is_admin: i18n("field_is_admin"),
    policy_id: i18n("field_policy_id"),
    asset_name: i18n("field_asset_name"),
    quantity: i18n("field_quantity"),
    beneficiary_wallets: i18n("field_beneficiary_wallets"),
    unlock_after: i18n("field_unlock_after"),
    weight: i18n("field_weight"),
    payout_address: i18n("field_payout_address"),
    paid_out_amount: i18n("field_paid_out_amount"),
    amount_per_day: i18n("field_amount_per_day"),
    start_date: i18n("field_start_date"),
    end_date: i18n("field_end_date"),
    constructor: i18n("field_constructor"),
    fields: i18n("field_fields"),
  };
  const readablePath = (path: string) => path.replace(/(\.unlock_after)\.fields\[0\]$/, "$1").split(".").filter((part) => part !== "state" && part !== "some").map((part) => {
    const match = /^(\w+)(?:\[(\d+)\])?$/.exec(part);
    if (!match || !labels[match[1]!]) return part;
    return match[2] === undefined
      ? labels[match[1]!]!
      : i18n("numberedField", { label: labels[match[1]!]!, number: Number(match[2]) + 1 });
  }).join(" / ");
  const readableValue = (path: string, value: string | null) => {
    if (value === null) return i18n("stateAbsent");
    if (/\.(is_admin|can_renew_proof_of_life)$/.test(path)) {
      if (value === "true") return i18n("enabled");
      if (value === "false") return i18n("disabled");
    }
    if ((/\.(start_date|end_date|next_allowance_reset|unlock_time|last_non_admin_payout_at)(\.some)?$/.test(path) || /\.unlock_after\.fields\[0\]$/.test(path)) && /^-?\d+$/.test(value)) {
      const milliseconds = Number(value);
      const date = new Date(milliseconds);
      if (!Number.isSafeInteger(milliseconds) || Number.isNaN(date.getTime())) return value;
      return formatter.dateTime(date, {
        year: "numeric", month: "short", day: "numeric", era: "short",
        hour: "2-digit", minute: "2-digit", second: "2-digit", fractionalSecondDigits: 3,
        timeZone: defaultTimeZone, timeZoneName: "short"
      });
    }
    if (/\.(quantity|paid_out_amount|amount_per_day)$/.test(path) && /^-?\d+$/.test(value)) {
      return i18n("baseUnits", { value });
    }
    return value;
  };
  return (
    <section className="space-y-2 rounded-lg border border-border/60 bg-background/40 p-3 sm:p-4">
      <h3 className="text-sm font-semibold">{i18n("stateChanges")}</h3>
      <p className="text-xs text-muted-foreground">{i18n("stateChangesSource")}</p>
      {!transition ? (
        <p role="alert" className="text-sm text-amber-200">{i18n("stateChangesUnavailable")}</p>
      ) : transition.changes.length === 0 ? (
        <p className="text-sm">{i18n("stateUnchanged")}</p>
      ) : (
        <>
          <ul className="space-y-3 text-sm">
            {transition.changes.map((change) => (
              <li key={change.path} className="space-y-1">
                <p className="wrap-anywhere font-semibold">{readablePath(change.path)}</p>
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                  <dt>{i18n("stateBefore")}</dt>
                  <dd className="wrap-anywhere whitespace-pre-wrap">{readableValue(change.path, change.before)}</dd>
                  <dt>{i18n("stateAfter")}</dt>
                  <dd className="wrap-anywhere whitespace-pre-wrap">{readableValue(change.path, change.after)}</dd>
                </dl>
              </li>
            ))}
          </ul>
          <details className="text-xs">
            <summary className="cursor-pointer py-2 font-semibold">{i18n("contractDetails")}</summary>
            <ul className="space-y-3">
              {transition.changes.map((change) => (
                <li key={change.path}>
                  <p className="break-all font-mono font-semibold">{change.path}</p>
                  <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                    <dt>{i18n("stateBefore")}</dt>
                    <dd className="break-all whitespace-pre-wrap font-mono">{change.before ?? i18n("stateAbsent")}</dd>
                    <dt>{i18n("stateAfter")}</dt>
                    <dd className="break-all whitespace-pre-wrap font-mono">{change.after ?? i18n("stateAbsent")}</dd>
                  </dl>
                </li>
              ))}
            </ul>
          </details>
        </>
      )}
    </section>
  );
}
