"use client";
import { useTranslations } from "next-intl";


import { AssetListEditor } from "./asset-list-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createDefaultTransferFormState, createDefaultWalletInputRef } from "@/components/user/workspace/helpers";
import { type OptionalConstrPresetForm, type OptionalConstrPresetMode, type RequiredConstrPresetForm, type RequiredConstrPresetMode, type TransferFormState } from "@/components/user/workspace/types";
import { type StateAssetAmountForm, createDefaultStateAssetAmountForm } from "@/lib/contracts/state-form";
import { type WalletInputRef } from "@/lib/types/contracts";

export function StateAssetAmountListEditor({
  label,
  helper,
  value,
  onChange,
  addLabel
}: {
  label: string;
  helper?: string;
  value: StateAssetAmountForm[];
  onChange: (value: StateAssetAmountForm[]) => void;
  addLabel?: string;
}) {
  const i18n = useTranslations("ComponentsUserWorkspaceEditorsAssetEditors");
  const resolvedAddLabel = addLabel ?? i18n("addAssetLimit");
  function updateItem(index: number, patch: Partial<StateAssetAmountForm>) {
    onChange(
      value.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item
      )
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-1">
          <Label>{label}</Label>
          {helper ? <p className="text-xs text-muted-foreground">{helper}</p> : null}
        </div>
        <Button
          type="button"
          variant="secondary"
          onClick={() => onChange([...value, createDefaultStateAssetAmountForm()])}
        >
          {resolvedAddLabel}
        </Button>
      </div>
      {value.length === 0 ? (
        <p className="rounded-md border border-dashed border-border/60 px-3 py-2 text-xs text-muted-foreground">
          {i18n("noAssetLimitsAdded")}
        </p>
      ) : (
        <div className="space-y-3">
          {value.map((asset, index) => (
            <div
              key={`${label}-${index}`}
              className="space-y-3 rounded-md border border-border/60 bg-muted/20 p-3"
            >
              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor={`${label}-policy-${index}`}>{i18n("policyId")}</Label>
                  <Input
                    id={`${label}-policy-${index}`}
                    value={asset.policyId}
                    onChange={(event) =>
                      updateItem(index, { policyId: event.target.value })
                    }
                    placeholder={i18n("message_56CharacterPolicyId")}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`${label}-asset-${index}`}>{i18n("assetNameHex")}</Label>
                  <Input
                    id={`${label}-asset-${index}`}
                    value={asset.assetName}
                    onChange={(event) =>
                      updateItem(index, { assetName: event.target.value })
                    }
                    placeholder={i18n("hexEncodedAssetName")}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`${label}-amount-${index}`}>{i18n("amount")}</Label>
                  <Input
                    id={`${label}-amount-${index}`}
                    value={asset.amount}
                    onChange={(event) =>
                      updateItem(index, { amount: event.target.value })
                    }
                    placeholder="0"
                  />
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                onClick={() => onChange(value.filter((_, itemIndex) => itemIndex !== index))}
              >
                {i18n("removeAssetLimit")}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function WalletHashesEditor({
  label,
  helper,
  value,
  onChange,
  addLabel,
  emptyLabel,
  placeholder
}: {
  label: string;
  helper?: string;
  value: string[];
  onChange: (value: string[]) => void;
  addLabel?: string;
  emptyLabel?: string;
  placeholder?: string;
}) {
  const i18n = useTranslations("ComponentsUserWorkspaceEditorsAssetEditors");
  const resolvedAddLabel = addLabel ?? i18n("addWallet");
  const resolvedEmptyLabel = emptyLabel ?? i18n("noWalletIdsAdded");
  const resolvedPlaceholder = placeholder ?? i18n("signerKeyHashPlaceholder");
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-1">
          <Label>{label}</Label>
          {helper ? <p className="text-xs text-muted-foreground">{helper}</p> : null}
        </div>
        <Button
          type="button"
          variant="secondary"
          onClick={() => onChange([...value, ""])}
        >
          {resolvedAddLabel}
        </Button>
      </div>
      {value.length === 0 ? (
        <p className="rounded-md border border-dashed border-border/60 px-3 py-2 text-xs text-muted-foreground">
          {resolvedEmptyLabel}
        </p>
      ) : (
        <div className="space-y-2">
          {value.map((wallet, index) => (
            <div
              key={`${label}-${index}`}
              className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto]"
            >
              <Input
                value={wallet}
                onChange={(event) =>
                  onChange(
                    value.map((entry, entryIndex) =>
                      entryIndex === index ? event.target.value : entry
                    )
                  )
                }
                placeholder={resolvedPlaceholder}
              />
              <Button
                type="button"
                variant="ghost"
                onClick={() => onChange(value.filter((_, entryIndex) => entryIndex !== index))}
              >
                {i18n("remove")}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function OptionalConstrPresetEditor({
  label,
  helper,
  value,
  onChange
}: {
  label: string;
  helper?: string;
  value: OptionalConstrPresetForm;
  onChange: (value: OptionalConstrPresetForm) => void;
}) {
  const i18n = useTranslations("ComponentsUserWorkspaceEditorsAssetEditors");
  return (
    <div className="space-y-3 rounded-md border border-border/60 bg-muted/20 p-3">
      <div className="space-y-1">
        <Label>{label}</Label>
        {helper ? <p className="text-xs text-muted-foreground">{helper}</p> : null}
      </div>
      <select
        value={value.mode}
        onChange={(event) =>
          onChange({
            ...value,
            mode: event.target.value as OptionalConstrPresetMode
          })
        }
        className="flex h-10 w-full rounded-md border border-input bg-background/70 px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <option value="none">{i18n("none")}</option>
        <option value="empty-alt-0">{i18n("emptyConstructorAlternative0")}</option>
        <option value="empty-alt-1">{i18n("emptyConstructorAlternative1")}</option>
        <option value="custom-empty">{i18n("customEmptyConstructor")}</option>
      </select>
      {value.mode === "custom-empty" ? (
        <div className="space-y-1.5">
          <Label>{i18n("constructorAlternative")}</Label>
          <Input
            value={value.customAlternative}
            onChange={(event) =>
              onChange({ ...value, customAlternative: event.target.value })
            }
            placeholder="0"
          />
        </div>
      ) : null}
    </div>
  );
}

export function RequiredConstrPresetEditor({
  label,
  helper,
  value,
  onChange
}: {
  label: string;
  helper?: string;
  value: RequiredConstrPresetForm;
  onChange: (value: RequiredConstrPresetForm) => void;
}) {
  const i18n = useTranslations("ComponentsUserWorkspaceEditorsAssetEditors");
  return (
    <div className="space-y-3 rounded-md border border-border/60 bg-muted/20 p-3">
      <div className="space-y-1">
        <Label>{label}</Label>
        {helper ? <p className="text-xs text-muted-foreground">{helper}</p> : null}
      </div>
      <select
        value={value.mode}
        onChange={(event) =>
          onChange({
            ...value,
            mode: event.target.value as RequiredConstrPresetMode
          })
        }
        className="flex h-10 w-full rounded-md border border-input bg-background/70 px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <option value="empty-alt-0">{i18n("emptyConstructorAlternative0")}</option>
        <option value="empty-alt-1">{i18n("emptyConstructorAlternative1")}</option>
        <option value="custom-empty">{i18n("customEmptyConstructor")}</option>
      </select>
      {value.mode === "custom-empty" ? (
        <div className="space-y-1.5">
          <Label>{i18n("constructorAlternative")}</Label>
          <Input
            value={value.customAlternative}
            onChange={(event) =>
              onChange({ ...value, customAlternative: event.target.value })
            }
            placeholder="0"
          />
        </div>
      ) : null}
    </div>
  );
}

export function WalletInputRefsEditor({
  label,
  helper,
  value,
  onChange
}: {
  label: string;
  helper?: string;
  value: WalletInputRef[];
  onChange: (value: WalletInputRef[]) => void;
}) {
  const i18n = useTranslations("ComponentsUserWorkspaceEditorsAssetEditors");
  function updateRef(index: number, patch: Partial<WalletInputRef>) {
    onChange(
      value.map((entry, entryIndex) =>
        entryIndex === index ? { ...entry, ...patch } : entry
      )
    );
  }

  const hasRefs = value.length > 0;
  return (
    <details className="group rounded-md border border-border/40 bg-background/20 px-3 py-2" open={hasRefs}>
      <summary className="flex cursor-pointer items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">
          {i18n("advanced")} {label.toLowerCase()}
          {hasRefs ? i18n("value1", { value1: value.length }) : ""}
        </span>
        <span className="text-[11px] text-muted-foreground/80">{i18n("manualInput")}</span>
      </summary>
      <div className="mt-3 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-1">
          {helper ? <p className="text-xs text-muted-foreground">{helper}</p> : null}
        </div>
        <Button
          type="button"
          variant="secondary"
          onClick={() => onChange([...value, createDefaultWalletInputRef()])}
        >
          {i18n("addFundPool")}
        </Button>
      </div>
      {value.length === 0 ? (
        <p className="rounded-md border border-dashed border-border/60 px-3 py-2 text-xs text-muted-foreground">
          {i18n("noFundPoolsAddedManually")}
        </p>
      ) : (
        <div className="space-y-3">
          {value.map((entry, index) => (
            <div
              key={`${label}-${index}`}
              className="grid gap-3 rounded-md border border-border/60 bg-muted/20 p-3 md:grid-cols-[minmax(0,1fr)_180px_auto]"
            >
              <div className="space-y-1.5">
                <Label htmlFor={`${label}-tx-${index}`}>{i18n("transactionHash")}</Label>
                <Input
                  id={`${label}-tx-${index}`}
                  value={entry.txHash}
                  onChange={(event) => updateRef(index, { txHash: event.target.value })}
                  placeholder={i18n("message_64CharacterTransactionHash")}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${label}-index-${index}`}>{i18n("outputIndex")}</Label>
                <Input
                  id={`${label}-index-${index}`}
                  value={String(entry.outputIndex)}
                  onChange={(event) =>
                    updateRef(index, {
                      outputIndex: Number(event.target.value || 0)
                    })
                  }
                  placeholder="0"
                />
              </div>
              <div className="flex items-end">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => onChange(value.filter((_, refIndex) => refIndex !== index))}
                >
                  {i18n("remove")}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
      </div>
    </details>
  );
}

export function TransferOutputsEditor({
  label,
  helper,
  value,
  onChange
}: {
  label: string;
  helper?: string;
  value: TransferFormState[];
  onChange: (value: TransferFormState[]) => void;
}) {
  const i18n = useTranslations("ComponentsUserWorkspaceEditorsAssetEditors");
  function updateTransfer(index: number, nextValue: TransferFormState) {
    onChange(
      value.map((entry, entryIndex) => (entryIndex === index ? nextValue : entry))
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-1">
          <Label>{label}</Label>
          {helper ? <p className="text-xs text-muted-foreground">{helper}</p> : null}
        </div>
        <Button
          type="button"
          variant="secondary"
          onClick={() => onChange([...value, createDefaultTransferFormState()])}
        >
          {i18n("addDestination")}
        </Button>
      </div>
      {value.length === 0 ? (
        <p className="rounded-md border border-dashed border-border/60 px-3 py-2 text-xs text-muted-foreground">
          {i18n("noDestinationsAdded")}
        </p>
      ) : (
        <div className="space-y-4">
          {value.map((transfer, index) => (
            <div
              key={`${label}-${index}`}
              className="space-y-3 rounded-md border border-border/60 bg-muted/20 p-3"
            >
              <div className="space-y-1.5">
                <Label htmlFor={`${label}-address-${index}`}>{i18n("address")}</Label>
                <Input
                  id={`${label}-address-${index}`}
                  value={transfer.address}
                  onChange={(event) =>
                    updateTransfer(index, { ...transfer, address: event.target.value })
                  }
                  placeholder={i18n("pasteAPreprodAddress")}
                />
              </div>
              <AssetListEditor
                label={i18n("destinationValue1Assets", { value1: index + 1 })}
                value={transfer.amount}
                onChange={(amount) => updateTransfer(index, { ...transfer, amount })}
              />
              <OptionalConstrPresetEditor
                label={i18n("destinationValue1OnChainData", { value1: index + 1 })}
                helper={i18n("chooseNoneForAnOrdinaryAddressAddOn")}
                value={transfer.inlineDatum}
                onChange={(inlineDatum) => updateTransfer(index, { ...transfer, inlineDatum })}
              />
              <Button
                type="button"
                variant="ghost"
                onClick={() => onChange(value.filter((_, transferIndex) => transferIndex !== index))}
              >
                {i18n("removeDestination")}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
