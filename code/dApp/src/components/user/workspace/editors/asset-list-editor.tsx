"use client";

import { SearchableAssetUnitDropdown } from "./primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { buildAssetSelectionOptions } from "@/components/user/workspace/helpers";
import { resolveAssetIdentity } from "@/lib/cardano-assets";
import { type Asset } from "@/lib/types/contracts";
import { formatLovelaceAsAda, parseAdaToLovelace } from "@/lib/user-flow/guided-helpers";
import { Plus } from "lucide-react";
import { useMemo } from "react";

export function AssetListEditor({
  label,
  helper,
  value,
  onChange,
  addLabel = "Add Asset",
  availableAssets = []
}: {
  label: string;
  helper?: string;
  value: Asset[];
  onChange: (value: Asset[]) => void;
  addLabel?: string;
  availableAssets?: Asset[];
}) {
  const availableOptions = useMemo(
    () => buildAssetSelectionOptions(availableAssets),
    [availableAssets]
  );
  const hasAvailableOptions = availableOptions.length > 0;
  const hasUnusedAvailableOption = availableOptions.some(
    (option) => !value.some((asset) => asset.unit === option.unit)
  );

  function updateAsset(index: number, patch: Partial<Asset>) {
    onChange(
      value.map((asset, assetIndex) =>
        assetIndex === index ? { ...asset, ...patch } : asset
      )
    );
  }

  function addAssetRow() {
    const nextAvailableOption = availableOptions.find(
      (option) => !value.some((asset) => asset.unit === option.unit)
    );

    onChange([
      ...value,
      {
        unit: nextAvailableOption?.unit ?? (value.length === 0 ? "lovelace" : ""),
        quantity: "0"
      }
    ]);
  }

  return (
    <div className="space-y-3">
      <div className="flex w-full min-w-0 flex-wrap items-center gap-3 rounded-lg border border-border/60 bg-muted/15 px-3 py-2.5">
        <div className="min-w-0 flex-1 space-y-1">
          <Label>{label}</Label>
          {helper ? <p className="text-xs text-muted-foreground">{helper}</p> : null}
        </div>
        <Button
          type="button"
          variant="secondary"
          className="ml-auto shrink-0 gap-1.5"
          onClick={addAssetRow}
          disabled={hasAvailableOptions && !hasUnusedAvailableOption}
        >
          <Plus className="h-4 w-4" aria-hidden />
          {addLabel}
        </Button>
      </div>
      {value.length === 0 ? (
        <p className="rounded-md border border-dashed border-border/60 px-3 py-2 text-xs text-muted-foreground">
          No asset rows added.
        </p>
      ) : (
        <div className="space-y-3">
          {value.map((asset, index) => {
            const rowOptions = hasAvailableOptions
              ? availableOptions.filter(
                  (option) =>
                    option.unit === asset.unit ||
                    !value.some(
                      (currentAsset, currentIndex) =>
                        currentIndex !== index && currentAsset.unit === option.unit
                    )
                )
              : [];
            const selectedOption =
              rowOptions.find((option) => option.unit === asset.unit) ??
              (asset.unit.trim()
                ? {
                    unit: asset.unit,
                    label: (() => {
                      const id = resolveAssetIdentity(asset.unit);
                      return id.knownMeta ? `${id.symbol} · ${id.knownMeta.name}` : id.symbol;
                    })(),
                    availableLabel: "Not in your wallet yet",
                    searchableText: asset.unit.toLowerCase(),
                    maxQuantity: "0"
                  }
                : null);
            const isAdaRow = asset.unit === "lovelace";
            const displayQuantity = isAdaRow
              ? asset.quantity.trim()
                ? formatLovelaceAsAda(asset.quantity)
                : ""
              : asset.quantity;

            return (
              <div
                key={`${label}-${index}`}
                className="grid grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)_auto] items-end gap-3 rounded-md border border-border/60 bg-muted/20 p-3"
              >
                <div className="space-y-1.5">
                  <Label htmlFor={`${label}-quantity-${index}`}>
                    {isAdaRow ? "How much (ADA)" : "How much"}
                  </Label>
                  <div className="relative">
                    <Input
                      id={`${label}-quantity-${index}`}
                      value={displayQuantity}
                      onChange={(event) => {
                        if (isAdaRow) {
                          updateAsset(index, {
                            quantity: event.target.value.trim()
                              ? parseAdaToLovelace(event.target.value) ?? ""
                              : ""
                          });
                          return;
                        }

                        updateAsset(index, { quantity: event.target.value });
                      }}
                      placeholder={isAdaRow ? "5" : "0"}
                      inputMode={isAdaRow ? "decimal" : "numeric"}
                      className="pr-16"
                    />
                    {selectedOption ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="absolute right-1 top-1/2 h-7 -translate-y-1/2 px-2"
                        onClick={() =>
                          updateAsset(index, { quantity: selectedOption.maxQuantity })
                        }
                        disabled={selectedOption.maxQuantity === "0"}
                      >
                        Max
                      </Button>
                    ) : null}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor={`${label}-unit-${index}`}>Asset</Label>
                  {hasAvailableOptions ? (
                    <SearchableAssetUnitDropdown
                      id={`${label}-unit-${index}`}
                      value={asset.unit}
                      options={rowOptions}
                      onChange={(nextUnit) => {
                        const nextOption = rowOptions.find((option) => option.unit === nextUnit);
                        const shouldResetQuantity =
                          asset.unit.trim().length > 0 &&
                          asset.unit !== nextUnit &&
                          (asset.unit === "lovelace" || nextUnit === "lovelace");
                        const candidateQuantity = shouldResetQuantity ? "" : asset.quantity;

                        if (
                          nextOption &&
                          /^\d+$/.test(candidateQuantity) &&
                          BigInt(candidateQuantity) > BigInt(nextOption.maxQuantity)
                        ) {
                          updateAsset(index, {
                            unit: nextUnit,
                            quantity: nextOption.maxQuantity
                          });
                          return;
                        }

                        updateAsset(index, {
                          unit: nextUnit,
                          quantity: candidateQuantity
                        });
                      }}
                    />
                  ) : (
                    <Input
                      id={`${label}-unit-${index}`}
                      value={asset.unit === "lovelace" ? "ADA" : asset.unit}
                      onChange={(event) => {
                        const next = event.target.value;
                        updateAsset(index, { unit: next === "ADA" ? "lovelace" : next });
                      }}
                      placeholder="ADA or token policy+asset"
                    />
                  )}
                </div>

                <div className="flex items-end justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => onChange(value.filter((_, assetIndex) => assetIndex !== index))}
                  >
                    Remove
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
