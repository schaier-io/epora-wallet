"use client";
import { useTranslations } from "next-intl";


import { useId, useMemo } from "react";
import { useAtom } from "jotai";

import { deserializeAddress } from "@meshsdk/core";

import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableAssetUnitDropdown } from "./asset-unit-dropdown";
import { buildAssetSelectionOptions, createDefaultWalletInputRef } from "@/components/user/workspace/helpers";
import { type AssetSelectionOption } from "@/components/user/workspace/types";
import {
  describeAddressProblem,
  isCredentialHash,
  looksLikeCardanoAddress
} from "@/lib/contracts/payout-address";
import { type StateAssetAmountForm, createDefaultStateAssetAmountForm } from "@/lib/contracts/state-form";
import { MAX_ALLOWANCE_ENTRIES } from "@/lib/contracts/state-validation";
import { type Asset, type WalletInputRef } from "@/lib/types/contracts";
import { POLICY_ID_LENGTH } from "@/lib/cardano-assets";
import { resolvedWalletAddressesAtom } from "@/providers/wallet-address-book";

/**
 * The wallet ids this app can name with an address on its own: the connected wallet's.
 * Keyed lower-case because stored hashes may vary in case.
 */
export function buildKnownAddresses(
  connectedPaymentKeyHash: string | null | undefined,
  connectedAddress: string | null | undefined
): Record<string, string> | undefined {
  const hash = connectedPaymentKeyHash?.trim().toLowerCase() ?? "";
  const address = connectedAddress?.trim() ?? "";
  return hash.length > 0 && address.length > 0
    ? { [hash]: address }
    : undefined;
}

const LOVELACE_UNIT = "lovelace";
// Pseudo-unit marking "type the policy id and asset name yourself". Never valid
// hex, so it can only ever be selected from the dropdown, not read from a form.
const CUSTOM_ASSET_UNIT = "__custom__";

export function StateAssetAmountListEditor({
  label,
  helper,
  value,
  onChange,
  addLabel,
  canAdd = true,
  availableAssets = []
}: {
  label: string;
  helper?: string;
  value: StateAssetAmountForm[];
  onChange: (value: StateAssetAmountForm[]) => void;
  addLabel?: string;
  canAdd?: boolean;
  /** Assets the wallet actually holds; when present, rows pick from a searchable list instead of typing hex. */
  availableAssets?: Asset[];
}) {
  const i18n = useTranslations("ComponentsUserWorkspaceEditorsAssetEditors");
  // Every spender's editor renders "Daily limit" and "Left to spend", so ids
  // keyed on the label collided across spenders and labels pointed at the
  // first spender's boxes.
  const uid = useId();
  const addDisabled = !canAdd || value.length >= MAX_ALLOWANCE_ENTRIES;
  function addItem() {
    if (!addDisabled) {
      onChange([...value, createDefaultStateAssetAmountForm()]);
    }
  }

  function updateItem(index: number, patch: Partial<StateAssetAmountForm>) {
    onChange(
      value.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item
      )
    );
  }

  const walletOptions = useMemo(
    () => (availableAssets.length > 0 ? buildAssetSelectionOptions(availableAssets) : []),
    [availableAssets]
  );
  const hasWalletOptions = walletOptions.length > 0;
  const options = useMemo(() => {
    if (!hasWalletOptions) {
      return [];
    }
    // The balance summary always carries lovelace, but do not depend on it: a
    // limit row for ADA is the common case and must always be offerable.
    if (walletOptions.some((option) => option.unit === LOVELACE_UNIT)) {
      return walletOptions;
    }
    const adaOnly = buildAssetSelectionOptions([{ unit: LOVELACE_UNIT, quantity: "0" }]);
    return [adaOnly[0]!, ...walletOptions];
  }, [hasWalletOptions, walletOptions]);
  const customOption: AssetSelectionOption = {
    unit: CUSTOM_ASSET_UNIT,
    label: i18n("customAsset"),
    availableLabel: i18n("customAssetHint"),
    searchableText: `${i18n("customAsset")} custom`.toLowerCase(),
    maxQuantity: "0"
  };

  function rowUnit(asset: StateAssetAmountForm) {
    return asset.policyId.trim() === "" && asset.assetName.trim() === ""
      ? LOVELACE_UNIT
      : i18n("value1Value2", { value1: asset.policyId.trim(), value2: asset.assetName.trim() });
  }

  function handleUnitChange(index: number, asset: StateAssetAmountForm, nextUnit: string) {
    if (nextUnit === CUSTOM_ASSET_UNIT) {
      // Keep the current fields; the hex inputs appear beneath for editing.
      return;
    }
    if (nextUnit === LOVELACE_UNIT) {
      updateItem(index, { policyId: "", assetName: "" });
      return;
    }
    updateItem(index, { policyId: nextUnit.slice(0, POLICY_ID_LENGTH), assetName: nextUnit.slice(POLICY_ID_LENGTH) });
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
          onClick={addItem}
          disabled={addDisabled}
        >
          {addLabel ?? i18n("addAToken")}
        </Button>
      </div>
      {value.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border/60 p-3 text-xs text-muted-foreground">
          {i18n("nothingAddedYet")}
        </p>
      ) : (
        <div className="space-y-3">
          {value.map((asset, index) => {
            const unit = rowUnit(asset);
            const isKnownUnit = options.some((option) => option.unit === unit);
            const rowOptions = options.filter(
              (option) =>
                option.unit === unit ||
                !value.some(
                  (other, otherIndex) =>
                    otherIndex !== index && rowUnit(other) === option.unit
                )
            );
            return (
              <div
                key={`${uid}-${index}`}
                className="space-y-3 rounded-lg border border-border/60 bg-muted/20 p-3"
              >
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor={`${uid}-unit-${index}`}>{i18n("asset")}</Label>
                    {hasWalletOptions ? (
                      <SearchableAssetUnitDropdown
                        id={`${uid}-unit-${index}`}
                        value={isKnownUnit ? unit : CUSTOM_ASSET_UNIT}
                        options={[...rowOptions, customOption]}
                        onChange={(nextUnit) => handleUnitChange(index, asset, nextUnit)}
                      />
                    ) : (
                      <Input
                        id={`${uid}-unit-${index}`}
                        value={unit === LOVELACE_UNIT ? "ADA" : unit}
                        onChange={(event) => {
                          const next = event.target.value;
                          updateItem(index, {
                            policyId: next === "ADA" ? "" : next.slice(0, POLICY_ID_LENGTH),
                            assetName: next === "ADA" ? "" : next.slice(POLICY_ID_LENGTH)
                          });
                        }}
                        placeholder={i18n("adaOrTokenPolicyAsset")}
                      />
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`${uid}-amount-${index}`}>{i18n("amount")}</Label>
                    <Input
                      id={`${uid}-amount-${index}`}
                      value={asset.amount}
                      onChange={(event) =>
                        updateItem(index, { amount: event.target.value })
                      }
                      placeholder="0"
                    />
                  </div>
                </div>
                {!hasWalletOptions || !isKnownUnit ? (
                  <div className="space-y-3">
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-1">
                        <Label htmlFor={`${uid}-policy-${index}`}>{i18n("tokenPolicyId")}</Label>
                        <Input
                          id={`${uid}-policy-${index}`}
                          value={asset.policyId}
                          onChange={(event) =>
                            updateItem(index, { policyId: event.target.value })
                          }
                          placeholder={i18n("policyId_f606df")}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor={`${uid}-asset-${index}`}>{i18n("tokenNameHex")}</Label>
                        <Input
                          id={`${uid}-asset-${index}`}
                          value={asset.assetName}
                          onChange={(event) =>
                            updateItem(index, { assetName: event.target.value })
                          }
                          placeholder={i18n("assetNameHex_559b83")}
                        />
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {i18n("leaveTheTwoIdBoxesEmptyForAda")}
                    </p>
                  </div>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => onChange(value.filter((_, itemIndex) => itemIndex !== index))}
                >
                  {i18n("remove")}
                </Button>
              </div>
            );
          })}
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
  placeholder,
  knownAddresses,
  canAdd = true
}: {
  label: string;
  helper?: string;
  value: string[];
  onChange: (value: string[]) => void;
  addLabel?: string;
  emptyLabel?: string;
  placeholder?: string;
  /** Wallet id → address pairs the UI can name, e.g. the connected wallet's own id. */
  knownAddresses?: Record<string, string>;
  canAdd?: boolean;
}) {
  const i18n = useTranslations("ComponentsUserWorkspaceEditorsAssetEditors");
  // A pasted Cardano address is stored as the wallet id (payment key hash) the contract
  // actually compares against; remembering the pairs lets the field keep showing the
  // address the user recognises while the hash stays the stored value.
  const [resolvedAddresses, setResolvedAddresses] = useAtom(resolvedWalletAddressesAtom);
  const known = { ...knownAddresses, ...resolvedAddresses };

  const handleChange = (index: number, raw: string) => {
    const trimmed = raw.trim();
    // Only preprod payment addresses convert here; mainnet ("addr1…") is rejected by the
    // validation below because this wallet is on Preprod, and a stake address has no
    // payment part to extract.
    if (trimmed.startsWith("addr_test1")) {
      try {
        const deserialized = deserializeAddress(trimmed);
        const hash = deserialized.pubKeyHash || deserialized.scriptHash;
        if (hash) {
          // First sighting wins, the same rule `rememberWalletAddressAtom` follows.
          // The book is app-wide and persisted, so rewriting a known hash changes
          // the address every wallet field shows for that person.
          setResolvedAddresses((current) => {
            const key = hash.toLowerCase();
            return key in current ? current : { ...current, [key]: trimmed };
          });
          onChange(value.map((entry, entryIndex) => (entryIndex === index ? hash : entry)));
          return;
        }
      } catch {
        // Incomplete or mistyped address: keep the keystrokes and let the validation
        // message below explain what is still missing.
      }
    }
    onChange(value.map((entry, entryIndex) => (entryIndex === index ? raw : entry)));
  };

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
          disabled={!canAdd}
          onClick={() => {
            if (canAdd) {
              onChange([...value, ""]);
            }
          }}
        >
          {addLabel ?? i18n("addAWallet")}
        </Button>
      </div>
      {value.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border/60 p-3 text-xs text-muted-foreground">
          {emptyLabel ?? i18n("noWalletAddedYet")}
        </p>
      ) : (
        <div className="space-y-2">
          {value.map((wallet, index) => {
            const trimmed = wallet.trim();
            // `isCredentialHash` is a type guard, so reading `.length` off `trimmed` after
            // a negated call narrows it to `never`. Take the length first.
            const typedLength = trimmed.length;
            const storedHash = isCredentialHash(trimmed) ? trimmed : null;
            const knownAddress = storedHash ? known[storedHash.toLowerCase()] : undefined;
            const malformed = typedLength > 0 && storedHash === null;
            // A mainnet or broken address deserves its own reason (the lib's messages cover
            // both); anything else that is not a valid wallet id falls back to the format hint.
            const problem =
              malformed && looksLikeCardanoAddress(trimmed)
                ? describeAddressProblem(trimmed)
                : null;

            return (
              <div key={`${label}-${index}`} className="space-y-1">
                <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
                  <div className="min-w-0 space-y-1">
                    {/*
                      The field holds what the reader has and pastes: the address. The
                      payment key hash — the value the contract actually compares — is
                      machine-speak, so it resolves on the line below once the address
                      converts, with its own copy control.
                    */}
                    <Input
                      aria-label={i18n("labelWalletValue2", {
                        label: label,
                        value2: index + 1
                      })}
                      aria-invalid={malformed ? true : undefined}
                      value={knownAddress ?? wallet}
                      onChange={(event) => handleChange(index, event.target.value)}
                      placeholder={placeholder ?? i18n("walletIdOrAddress")}
                      className={knownAddress ? "font-mono text-xs" : undefined}
                    />
                    {storedHash && knownAddress ? (
                      <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                        <span className="shrink-0">{i18n("walletId")}</span>
                        <span className="break-all font-mono text-foreground">
                          {storedHash}
                        </span>
                        <CopyButton
                          value={storedHash}
                          hideLabel
                          variant="ghost"
                          className="h-6 px-1"
                        />
                      </p>
                    ) : null}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => onChange(value.filter((_, entryIndex) => entryIndex !== index))}
                  >
                    {i18n("remove")}
                  </Button>
                </div>
                {malformed ? (
                  <p className="text-xs text-amber-200">
                    {problem ??
                      i18n("enterACardanoAddressOrA56Character", { value1: typedLength })}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function WalletInputRefsEditor({
  label,
  helper,
  value,
  maximumCount,
  onChange
}: {
  label: string;
  helper?: string;
  value: WalletInputRef[];
  maximumCount: number;
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
    <details className="group rounded-lg border border-border/40 bg-background/20 p-3" open={hasRefs}>
      <summary className="flex cursor-pointer items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">
          {i18n("advanced")} {label.toLowerCase()}
          {hasRefs ? i18n("value1", { value1: value.length }) : ""}
        </span>
        <span className="text-[11px] text-muted-foreground/80">{i18n("pro")}</span>
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
          disabled={value.length >= maximumCount}
        >
          {i18n("addFundPool")}
        </Button>
      </div>
      {value.length === 0 ? (
        <p className="rounded-md border border-dashed border-border/60 p-2 text-xs text-muted-foreground">
          {i18n("noInputRefsAdded")}
        </p>
      ) : (
        <div className="space-y-3">
          {value.map((entry, index) => (
            <div
              key={`${label}-${index}`}
              className="grid gap-2 rounded-md border border-border/60 bg-muted/20 p-2 md:grid-cols-[minmax(0,1fr)_180px_auto]"
            >
              <div className="space-y-1">
                <Label htmlFor={`${label}-tx-${index}`}>{i18n("txHash")}</Label>
                <Input
                  id={`${label}-tx-${index}`}
                  value={entry.txHash}
                  onChange={(event) => updateRef(index, { txHash: event.target.value })}
                  placeholder={i18n("txHash_deff4e")}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`${label}-index-${index}`}>{i18n("outputIndex_7d014b")}</Label>
                <Input
                  id={`${label}-index-${index}`}
                  value={String(entry.outputIndex)}
                  onChange={(event) => {
                    // Number("1e") is NaN, and the box then showed "NaN"; keep the
                    // last good index instead of storing what cannot be one.
                    const parsed = Number(event.target.value || 0);
                    if (Number.isSafeInteger(parsed) && parsed >= 0) {
                      updateRef(index, { outputIndex: parsed });
                    }
                  }}
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
