import { useTranslations } from "next-intl";
import type { ProposalStateTransition } from "@/lib/proposals/state-transition";

export function StateTransitionReview({ transition }: { transition: ProposalStateTransition | null }) {
  const i18n = useTranslations("ComponentsUserProposalsProposalDetail");
  return (
    <section className="space-y-2 rounded-lg border border-border/60 bg-background/40 p-3 sm:p-4">
      <h3 className="text-sm font-semibold">{i18n("stateChanges")}</h3>
      <p className="text-xs text-muted-foreground">{i18n("stateChangesSource")}</p>
      {!transition ? (
        <p role="alert" className="text-sm text-amber-200">{i18n("stateChangesUnavailable")}</p>
      ) : transition.changes.length === 0 ? (
        <p className="text-sm">{i18n("stateUnchanged")}</p>
      ) : (
        <ul className="space-y-3 text-xs">
          {transition.changes.map((change) => (
            <li key={change.path} className="space-y-1">
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
      )}
    </section>
  );
}
