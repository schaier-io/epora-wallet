"use client";
import { useTranslations } from "next-intl";


import { useState } from "react";

import { deserializeAddress } from "@meshsdk/core";

import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createDefaultWalletInputRef } from "@/components/user/workspace/helpers";
import { describeAddressProblem, isCredentialHash } from "@/lib/contracts/payout-address";
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
          {addLabel ?? i18n("addAToken")}
        </Button>
      </div>
      {value.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border/60 p-3 text-xs text-muted-foreground">
          {i18n("nothingAddedYet")}
        </p>
      ) : (
        <div className="space-y-3">
          {value.map((asset, index) => (
            <div
              key={`${label}-${index}`}
              className="space-y-3 rounded-lg border border-border/60 bg-muted/20 p-3"
            >
              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-1">
                  <Label htmlFor={`${label}-policy-${index}`}>{i18n("tokenPolicyId")}</Label>
                  <Input
                    id={`${label}-policy-${index}`}
                    value={asset.policyId}
                    onChange={(event) =>
                      updateItem(index, { policyId: event.target.value })
                    }
                    placeholder={i18n("policyId_f606df")}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`${label}-asset-${index}`}>{i18n("tokenNameHex")}</Label>
                  <Input
                    id={`${label}-asset-${index}`}
                    value={asset.assetName}
                    onChange={(event) =>
                      updateItem(index, { assetName: event.target.value })
                    }
                    placeholder={i18n("assetNameHex_559b83")}
                  />
                </div>
                <div className="space-y-1">
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
              <p className="text-xs text-muted-foreground">
                {i18n("leaveTheTwoIdBoxesEmptyForAda")}
              </p>
              <Button
                type="button"
                variant="ghost"
                onClick={() => onChange(value.filter((_, itemIndex) => itemIndex !== index))}
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

export function WalletHashesEditor({
  label,
  helper,
  value,
  onChange,
  addLabel,
  emptyLabel,
  placeholder,
  knownAddresses
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
}) {
  const i18n = useTranslations("ComponentsUserWorkspaceEditorsAssetEditors");
  // A pasted Cardano address is stored as the wallet id (payment key hash) the contract
  // actually compares against; remembering the pairs lets the field keep showing the
  // address the user recognises next to the opaque hash it became.
  const [resolvedAddresses, setResolvedAddresses] = useState<Record<string, string>>({});
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
          setResolvedAddresses((current) => ({ ...current, [hash.toLowerCase()]: trimmed }));
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
          onClick={() => onChange([...value, ""])}
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
            const malformed = typedLength > 0 && !isCredentialHash(trimmed);
            const knownAddress = isCredentialHash(trimmed)
              ? known[trimmed.toLowerCase()]
              : undefined;
            // Computed outside the JSX: the i18n migrator treats literal template strings
            // in markup as untranslated copy.
            const knownAddressDisplay =
              knownAddress === undefined
                ? ""
                : knownAddress.length > 24
                  ? `${knownAddress.slice(0, 14)}…${knownAddress.slice(-8)}`
                  : knownAddress;
            // A mainnet or broken address deserves its own reason (the lib's messages cover
            // both); anything else that is not a valid wallet id falls back to the format hint.
            const problem =
              malformed && /^(addr1|stake1|addr_test|stake_test)/.test(trimmed)
                ? describeAddressProblem(trimmed)
                : null;

            return (
              <div key={`${label}-${index}`} className="space-y-1">
                <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
                  <div className="min-w-0 space-y-1">
                    {knownAddress ? (
                      // The address is what the reader recognises, so it leads the row.
                      // The payment key hash -- the value the contract actually compares
                      // -- is machine-speak, so it drops to a small labelled line: still
                      // the editable field, but no longer the thing the eye lands on.
                      <p className="flex flex-wrap items-center gap-1.5">
                        <span className="break-all font-mono text-sm text-foreground">
                          {knownAddressDisplay}
                        </span>
                        <CopyButton
                          value={knownAddress}
                          hideLabel
                          variant="ghost"
                          className="h-6 px-1"
                        />
                      </p>
                    ) : null}
                    <label
                      className={
                        knownAddress
                          ? "flex items-center gap-2 text-xs text-muted-foreground"
                          : "contents"
                      }
                    >
                      {knownAddress ? (
                        <span className="shrink-0">{i18n("walletId")}</span>
                      ) : null}
                      <Input
                        aria-label={i18n("labelWalletValue2", {
                          label: label,
                          value2: index + 1
                        })}
                        aria-invalid={malformed ? true : undefined}
                        value={wallet}
                        onChange={(event) => handleChange(index, event.target.value)}
                        placeholder={placeholder ?? i18n("walletIdOrAddress")}
                        className={knownAddress ? "font-mono text-xs" : undefined}
                      />
                    </label>
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

