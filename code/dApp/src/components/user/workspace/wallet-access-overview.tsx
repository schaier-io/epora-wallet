"use client";

import { CheckCircle2, KeyRound } from "lucide-react";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { DisclosureSection } from "@/components/user/workspace/editors";
import {
  deriveWalletAccessSummary,
  formatConfiguredAllowance,
  type WalletAccessRole
} from "@/components/user/workspace/wallet-access-summary";
import type { StateFormState } from "@/lib/contracts/state-form";
import { formatTimestampLabel } from "@/components/user/workspace/helpers/formatters";

function AccessDetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 text-sm sm:grid-cols-[minmax(140px,0.4fr)_1fr] sm:gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-foreground">{value}</dd>
    </div>
  );
}

export function WalletAccessOverview({
  state,
  paymentKeyHash
}: {
  state: StateFormState;
  paymentKeyHash: string | null;
}) {
  const i18n = useTranslations("ComponentsUserWorkspaceWalletAccessOverview");
  const summary = deriveWalletAccessSummary(state, paymentKeyHash);
  const roleLabels: Record<WalletAccessRole, string> = {
    owner: i18n("owner"),
    "co-signer": i18n("coSigner"),
    spender: i18n("spender"),
    "proof-of-life": i18n("proofOfLife"),
    recovery: i18n("recoveryContact"),
    "listed-user": i18n("listedUser")
  };
  const permissions = [
    summary.canManageWallet ? i18n("managePermission") : null,
    summary.canSend ? i18n("sendPermission") : null,
    summary.canRenewProofOfLife ? i18n("renewPermission") : null,
    summary.recoveryAccess.length > 0 ? i18n("recoveryPermission") : null
  ].filter((value): value is string => Boolean(value));
  const approvalPower = [
    summary.roles.includes("owner") ? i18n("ownerApproval") : null,
    summary.approvalPowers.length > 0 && summary.approvalThreshold
      ? i18n("powerValueThreshold", {
          power: summary.approvalPowers.join(" + "),
          threshold: summary.approvalThreshold
        })
      : null
  ].filter((value): value is string => Boolean(value)).join(" ") || i18n("notGranted");
  const dailyAllowance = summary.dailyAllowances.length > 0
    ? i18n("allowancePerDay", {
        allowance: summary.dailyAllowances.map(formatConfiguredAllowance).join(" + ")
      })
    : i18n("notGranted");
  const recoveryAccess = summary.recoveryAccess.length > 0
    ? summary.recoveryAccess
        .map(({ weight, unlockAfter }) =>
          unlockAfter
            ? i18n("recoveryValueAfter", {
                weight,
                date: formatTimestampLabel(BigInt(unlockAfter))
              })
            : i18n("recoveryValueNow", { weight })
        )
        .join(" ")
    : i18n("notGranted");

  return (
    <section className="rounded-lg border border-primary/20 bg-primary/[0.04] p-3 sm:p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-primary/25 bg-primary/10 text-primary">
          <KeyRound className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">{i18n("yourAccess")}</h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {summary.readOnly ? <Badge variant="outline">{i18n("readOnly")}</Badge> : null}
              {summary.roles.map((role) => (
                <Badge key={role} variant="outline">{roleLabels[role]}</Badge>
              ))}
            </div>
          </div>

          {summary.readOnly ? (
            <p className="text-sm text-muted-foreground">{i18n("connectForPermissions")}</p>
          ) : permissions.length > 0 ? (
            <ul className="grid gap-1.5 text-sm text-foreground sm:grid-cols-2">
              {permissions.map((permission) => (
                <li key={permission} className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                  <span>{permission}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">{i18n("noActivePermissions")}</p>
          )}

          <DisclosureSection
            title={i18n("permissionDetails")}
            description={i18n("permissionDetailsDescription")}
          >
            <dl className="space-y-3">
              <AccessDetailRow label={i18n("approvalPower")} value={approvalPower} />
              <AccessDetailRow label={i18n("dailyAllowance")} value={dailyAllowance} />
              <AccessDetailRow
                label={i18n("proofOfLifeRights")}
                value={
                  summary.canRenewProofOfLife
                    ? i18n("canRenewProofOfLife")
                    : i18n("cannotRenewProofOfLife")
                }
              />
              <AccessDetailRow label={i18n("recoveryAccess")} value={recoveryAccess} />
            </dl>
          </DisclosureSection>
        </div>
      </div>
    </section>
  );
}
