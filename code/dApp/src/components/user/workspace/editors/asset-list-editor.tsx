"use client";
import { useTranslations } from "next-intl";


import { SearchableAssetUnitDropdown } from "./asset-unit-dropdown";
import { AdaAmountInput } from "./config-form-primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { buildAssetSelectionOptions } from "@/components/user/workspace/helpers";
import { resolveAssetIdentity } from "@/lib/cardano-assets";
import { type Asset } from "@/lib/types/contracts";
import { parseAdaToLovelace } from "@/lib/user-flow/guided-helpers";
import { Plus } from "lucide-react";
import { useId, useMemo, useRef } from "react";

export function AssetListEditor({
  label,
  helper,
  value,
  onChange,
  addLabel,
  availableAssets = []
}: {
  label: string;
  helper?: string;
  value: Asset[];
  onChange: (value: Asset[]) => void;
  addLabel?: string;
  availableAssets?: Asset[];
}) {
  const i18n = useTranslations("ComponentsUserWorkspaceEditorsAssetListEditor");
  const uid = useId();
  // Removing a row unmounts the button that was focused, which drops focus on <body>
  // and costs a keyboard reader their place in a long form. The add button is the one
  // control this list always has.
  const addButtonRef = useRef<HTMLButtonElement | null>(null);
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

  // Every asset the wallet holds is already on the list, so there is nothing left to add.
  const addIsExhausted = hasAvailableOptions && !hasUnusedAvailableOption;

  return (
    <div className="@container space-y-3" role="group" aria-labelledby={`${uid}-group-label`} tabIndex={-1}>
      <div className="flex w-full min-w-0 flex-wrap items-center gap-3 rounded-lg border border-border/60 bg-muted/15 p-3">
        <div className="min-w-0 flex-1 space-y-1">
          <p id={`${uid}-group-label`} className="text-sm font-medium leading-none">
            {label}
          </p>
          {helper ? <p className="text-xs text-muted-foreground">{helper}</p> : null}
        </div>
        <Button
          ref={addButtonRef}
          type="button"
          variant="secondary"
          className="ml-auto shrink-0 gap-1.5"
          onClick={addAssetRow}
          disabled={addIsExhausted}
        >
          <Plus className="h-4 w-4" aria-hidden />
          {addLabel ?? i18n("addAsset_f05393")}
        </Button>
        {/* A greyed-out button with nothing said beside it reads as a fault. */}
        {addIsExhausted ? (
          <p className="w-full text-xs text-muted-foreground">
            {i18n("everyAssetInThisWalletIsAlreadyOnTheList")}
          </p>
        ) : null}
      </div>
      {value.length === 0 ? (
        <p className="rounded-md border border-dashed border-border/60 px-3 py-2 text-xs text-muted-foreground">
          {i18n("noAssetRowsAdded")}
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
                      // No separator without a name behind it (ADA has none).
                      return id.knownMeta?.name ? i18n("value1Value2", { value1: id.symbol, value2: id.knownMeta.name }) : id.symbol;
                    })(),
                    availableLabel: i18n("notInYourWalletYet"),
                    searchableText: asset.unit.toLowerCase(),
                    maxQuantity: "0"
                  }
                : null);
            const isAdaRow = asset.unit === "lovelace";

            return (
              <div
                key={`${uid}-${index}`}
                className="grid grid-cols-1 items-end gap-3 rounded-md border border-border/60 bg-muted/20 p-3 @sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)_auto]"
              >
                <div className="space-y-1">
                  <Label htmlFor={`${uid}-quantity-${index}`}>
                    {isAdaRow ? i18n("howMuchAda") : i18n("howMuch")}
                  </Label>
                  <div className="relative">
                    {isAdaRow ? (
                      <AdaAmountInput
                        id={`${uid}-quantity-${index}`}
                        value={asset.quantity}
                        onChange={(text) =>
                          updateAsset(index, {
                            quantity: text.trim() ? parseAdaToLovelace(text) ?? "" : ""
                          })
                        }
                        placeholder="5"
                        className="pr-14"
                      />
                    ) : (
                      <Input
                        id={`${uid}-quantity-${index}`}
                        value={asset.quantity}
                        onChange={(event) => updateAsset(index, { quantity: event.target.value })}
                        placeholder="0"
                        inputMode="numeric"
                        className="pr-14"
                      />
                    )}
                    {selectedOption ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        /* Same inset on every side: see config-sttspend-view.tsx — size="sm"'s
                           sm:h-9 outranked the old unconditional h-7 and left the button
                           vertically tighter than it was horizontal inside the h-10 input. */
                        className="absolute right-1 top-1/2 h-8 sm:h-8 -translate-y-1/2 px-2"
                        onClick={() =>
                          updateAsset(index, { quantity: selectedOption.maxQuantity })
                        }
                        disabled={selectedOption.maxQuantity === "0"}
                      >
                        {i18n("max")}
                      </Button>
                    ) : null}
                  </div>
                </div>

                <div className="space-y-1">
                  <Label htmlFor={`${uid}-unit-${index}`}>{i18n("asset")}</Label>
                  {hasAvailableOptions ? (
                    <SearchableAssetUnitDropdown
                      id={`${uid}-unit-${index}`}
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
                      id={`${uid}-unit-${index}`}
                      value={asset.unit === "lovelace" ? "ADA" : asset.unit}
                      onChange={(event) => {
                        const next = event.target.value;
                        updateAsset(index, { unit: next === "ADA" ? "lovelace" : next });
                      }}
                      placeholder={i18n("adaOrTokenPolicyAsset")}
                    />
                  )}
                </div>

                <div className="flex items-end justify-end">
                  {/* Every row's button reads "Remove", so on its own the name says
                      nothing about which asset it drops. */}
                  <Button
                    type="button"
                    variant="ghost"
                    aria-label={i18n("removeAssetNumber", { number: index + 1 })}
                    onClick={() => {
                      onChange(value.filter((_, assetIndex) => assetIndex !== index));
                      const addButton = addButtonRef.current;
                      if (addButton?.disabled) {
                        addButton.closest<HTMLElement>('[role="group"]')?.focus();
                      } else {
                        addButton?.focus();
                      }
                    }}
                  >
                    {i18n("remove")}
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
