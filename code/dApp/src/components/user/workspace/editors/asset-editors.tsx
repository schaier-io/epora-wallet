"use client";

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
  addLabel = "Add Asset Limit"
}: {
  label: string;
  helper?: string;
  value: StateAssetAmountForm[];
  onChange: (value: StateAssetAmountForm[]) => void;
  addLabel?: string;
}) {
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
          {addLabel}
        </Button>
      </div>
      {value.length === 0 ? (
        <p className="rounded-md border border-dashed border-border/60 px-3 py-2 text-xs text-muted-foreground">
          No entries added.
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
                  <Label htmlFor={`${label}-policy-${index}`}>Policy ID</Label>
                  <Input
                    id={`${label}-policy-${index}`}
                    value={asset.policyId}
                    onChange={(event) =>
                      updateItem(index, { policyId: event.target.value })
                    }
                    placeholder="policy id"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`${label}-asset-${index}`}>Asset Name (hex)</Label>
                  <Input
                    id={`${label}-asset-${index}`}
                    value={asset.assetName}
                    onChange={(event) =>
                      updateItem(index, { assetName: event.target.value })
                    }
                    placeholder="asset name hex"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`${label}-amount-${index}`}>Amount</Label>
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
                Remove Asset Limit
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
  addLabel = "Add Wallet",
  emptyLabel = "No wallet IDs added.",
  placeholder = "wallet id"
}: {
  label: string;
  helper?: string;
  value: string[];
  onChange: (value: string[]) => void;
  addLabel?: string;
  emptyLabel?: string;
  placeholder?: string;
}) {
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
          {addLabel}
        </Button>
      </div>
      {value.length === 0 ? (
        <p className="rounded-md border border-dashed border-border/60 px-3 py-2 text-xs text-muted-foreground">
          {emptyLabel}
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
                placeholder={placeholder}
              />
              <Button
                type="button"
                variant="ghost"
                onClick={() => onChange(value.filter((_, entryIndex) => entryIndex !== index))}
              >
                Remove
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
        <option value="none">None</option>
        <option value="empty-alt-0">Empty constructor (alt 0)</option>
        <option value="empty-alt-1">Empty constructor (alt 1)</option>
        <option value="custom-empty">Custom empty constructor</option>
      </select>
      {value.mode === "custom-empty" ? (
        <div className="space-y-1.5">
          <Label>Constructor Alternative</Label>
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
        <option value="empty-alt-0">Empty constructor (alt 0)</option>
        <option value="empty-alt-1">Empty constructor (alt 1)</option>
        <option value="custom-empty">Custom empty constructor</option>
      </select>
      {value.mode === "custom-empty" ? (
        <div className="space-y-1.5">
          <Label>Constructor Alternative</Label>
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
          Advanced: {label.toLowerCase()}
          {hasRefs ? ` (${value.length})` : ""}
        </span>
        <span className="text-[11px] text-muted-foreground/80">Pro</span>
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
          Add Ref
        </Button>
      </div>
      {value.length === 0 ? (
        <p className="rounded-md border border-dashed border-border/60 px-3 py-2 text-xs text-muted-foreground">
          No input refs added.
        </p>
      ) : (
        <div className="space-y-3">
          {value.map((entry, index) => (
            <div
              key={`${label}-${index}`}
              className="grid gap-3 rounded-md border border-border/60 bg-muted/20 p-3 md:grid-cols-[minmax(0,1fr)_180px_auto]"
            >
              <div className="space-y-1.5">
                <Label htmlFor={`${label}-tx-${index}`}>Tx Hash</Label>
                <Input
                  id={`${label}-tx-${index}`}
                  value={entry.txHash}
                  onChange={(event) => updateRef(index, { txHash: event.target.value })}
                  placeholder="tx hash"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${label}-index-${index}`}>Output Index</Label>
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
                  Remove
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
          Add Transfer
        </Button>
      </div>
      {value.length === 0 ? (
        <p className="rounded-md border border-dashed border-border/60 px-3 py-2 text-xs text-muted-foreground">
          No transfers added.
        </p>
      ) : (
        <div className="space-y-4">
          {value.map((transfer, index) => (
            <div
              key={`${label}-${index}`}
              className="space-y-3 rounded-md border border-border/60 bg-muted/20 p-3"
            >
              <div className="space-y-1.5">
                <Label htmlFor={`${label}-address-${index}`}>Address</Label>
                <Input
                  id={`${label}-address-${index}`}
                  value={transfer.address}
                  onChange={(event) =>
                    updateTransfer(index, { ...transfer, address: event.target.value })
                  }
                  placeholder="addr_test..."
                />
              </div>
              <AssetListEditor
                label={`Transfer ${index + 1} Assets`}
                value={transfer.amount}
                onChange={(amount) => updateTransfer(index, { ...transfer, amount })}
              />
              <OptionalConstrPresetEditor
                label={`Transfer ${index + 1} Inline Datum`}
                helper="Pick None for ordinary outputs, or attach a preset inline datum."
                value={transfer.inlineDatum}
                onChange={(inlineDatum) => updateTransfer(index, { ...transfer, inlineDatum })}
              />
              <Button
                type="button"
                variant="ghost"
                onClick={() => onChange(value.filter((_, transferIndex) => transferIndex !== index))}
              >
                Remove Transfer
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

