"use client";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { mergeAmountLists } from "./helpers/asset-amounts";
import { AssetListEditor } from "./editors/asset-list-editor";
import type { TransferFormState } from "./types";
import type { Asset } from "@/lib/types/contracts";
import { useId } from "react";

export function StagedPayoutEditor({ value, onChange, availableAssets, allowMax = true }: {
  value: TransferFormState;
  onChange: (value: TransferFormState) => void;
  availableAssets: Asset[];
  allowMax?: boolean;
}) {
  const i18n = useTranslations("ComponentsUserWorkspaceConfigSttspendView");
  const id = useId();
  const editableAssets = mergeAmountLists([availableAssets, value.amount.filter(asset => /^\d+$/.test(asset.quantity.trim()))]);
  return <details className="min-w-0 w-full">
    <summary className="cursor-pointer text-sm">{i18n("editPayout")}</summary>
    <div className="mt-3 space-y-3">
      <Label htmlFor={id}>{i18n("editPayoutRecipient")}</Label>
      <Input id={id} value={value.address} onChange={event => onChange({ ...value, address: event.target.value })} />
      {!allowMax ? <p className="text-xs text-muted-foreground">{i18n("stagedMaxUnavailable")}</p> : null}
      <AssetListEditor showMax={allowMax} label={i18n("editPayoutAssets")} value={value.amount} availableAssets={editableAssets} onChange={amount => onChange({ ...value, amount })} />
    </div>
  </details>;
}
