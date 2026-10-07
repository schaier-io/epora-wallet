"use client";
import { useTranslations } from "next-intl";

import { useId } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useBlurReportedError } from "./field-error-timing";
import { InlineFieldError } from "./primitives";
import { describeAddressProblem, looksLikeCardanoAddress, paymentKeyHashFromAddress } from "@/lib/contracts/payout-address";

export function BeneficiaryPayoutAddressEditor({
  value,
  onChange
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const i18n = useTranslations("ComponentsUserWorkspaceEditorsPeopleEditors");
  const uid = useId();
  // Reported on blur. The `looksLikeCardanoAddress` gate opens at "addr_test", nine
  // characters into a 108-character address, and nothing parses until the last one
  // lands: 99 of those keystrokes were flagged while typing one valid address.
  const { reportedError: payoutAddressError, focusHandlers } = useBlurReportedError(
    looksLikeCardanoAddress(value)
      ? describeAddressProblem(value) ??
          (paymentKeyHashFromAddress(value) ? null : i18n("payoutAddressNeedsPaymentKey"))
      : null
  );

  return (
    <div className="space-y-1">
      <Label htmlFor={`${uid}-payout-address`}>{i18n("payoutAndSigningWallet")}</Label>
      <Input
        id={`${uid}-payout-address`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        {...focusHandlers}
        placeholder={i18n("payoutAddressPlaceholder")}
        aria-invalid={payoutAddressError ? true : undefined}
        aria-describedby={`${uid}-payout-address-help${payoutAddressError ? ` ${uid}-payout-address-error` : ""}`}
      />
      <InlineFieldError id={`${uid}-payout-address-error`} message={payoutAddressError} />
      <p id={`${uid}-payout-address-help`} className="text-xs text-muted-foreground">
        {i18n("payoutAndSigningWalletHelp")}
      </p>
    </div>
  );
}
