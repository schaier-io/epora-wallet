"use client";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import type { StateFormState } from "@/lib/contracts/state-form";
import type {
  ProposalAuthorityPath,
  ProposalBuildContext,
  RequiredSigner,
  SignerSatisfaction
} from "@/lib/proposals/types";
import { computeSignerSatisfaction } from "@/lib/proposals/verify";
import { truncateMiddle } from "./format";

export type CoSignerChoice = {
  proposerKeyHash: string;
  // Everyone else the wallet's rule lets sign this path.
  candidates: RequiredSigner[];
  // The rule evaluated as if the proposer and every chosen co-signer had signed:
  // what the chain will see once the listed keys all sign.
  listed: SignerSatisfaction;
};

function lower(value: string): string {
  return value.trim().toLowerCase();
}

export function describeCoSignerChoice(
  stateForm: StateFormState,
  authorityPath: ProposalAuthorityPath,
  proposerKeyHash: string,
  chosen: string[]
): CoSignerChoice {
  const proposer = lower(proposerKeyHash);
  const candidates = computeSignerSatisfaction(stateForm, authorityPath, []).requiredSigners.filter(
    (signer) => signer.keyHash !== proposer
  );
  const listedKeys = [proposer, ...chosen.map(lower)];
  return {
    proposerKeyHash: proposer,
    candidates,
    listed: computeSignerSatisfaction(stateForm, authorityPath, listedKeys, listedKeys)
  };
}

// The builder lists the connected wallet's key on its own; the chosen co-signers
// ride along in the saved context so a later rebuild lists the same people.
export function applyCoSigners(
  buildContext: ProposalBuildContext,
  coSigners: string[]
): ProposalBuildContext {
  if (buildContext.builder !== "stt-spend") {
    return buildContext;
  }
  return { ...buildContext, input: { ...buildContext.input, requiredSignerKeyHashes: coSigners } };
}

type CoSignerPickerProps = {
  choice: CoSignerChoice;
  chosen: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
};

export function CoSignerPicker({ choice, chosen, onChange, disabled }: CoSignerPickerProps) {
  const i18n = useTranslations("ComponentsUserProposalsCoSignerPicker");
  const { listed } = choice;
  const you = listed.requiredSigners.find((signer) => signer.keyHash === choice.proposerKeyHash);
  const status =
    listed.threshold != null
      ? i18n("powerOfThresholdApprovalPowerOnceEveryone", {
          power: listed.satisfiedPower,
          threshold: listed.threshold
        })
      : listed.satisfied
        ? i18n("anOwnerIsListed")
        : i18n("listAtLeastOneOwner");

  const renderPower = (signer: RequiredSigner) => (
    <span className="flex items-center gap-2">
      {signer.isAdmin ? <Badge variant="outline">{i18n("owner")}</Badge> : null}
      {listed.threshold != null ? (
        <span className="text-muted-foreground">
          {signer.power} {i18n("approvalPower")}
        </span>
      ) : null}
    </span>
  );

  return (
    <fieldset className="space-y-2 rounded-lg border border-border/60 bg-background/40 p-3">
      <legend className="text-xs font-semibold text-muted-foreground">{i18n("whoSignsThisRequest")}</legend>
      <p className="text-xs text-muted-foreground">{i18n("theTransactionListsEveryoneChosenHere")}</p>
      <ul className="space-y-1 text-xs">
        <li className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-2">
            <span className="font-mono">{truncateMiddle(choice.proposerKeyHash, 10, 6)}</span>
            <span className="text-muted-foreground">{i18n("you")}</span>
          </span>
          {you ? renderPower(you) : null}
        </li>
        {choice.candidates.map((signer) => (
          <li key={signer.keyHash}>
            <label className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={chosen.includes(signer.keyHash)}
                  disabled={disabled}
                  onChange={(event) =>
                    onChange(
                      event.target.checked
                        ? [...chosen, signer.keyHash]
                        : chosen.filter((keyHash) => keyHash !== signer.keyHash)
                    )
                  }
                />
                <span className="font-mono">{truncateMiddle(signer.keyHash, 10, 6)}</span>
              </span>
              {renderPower(signer)}
            </label>
          </li>
        ))}
      </ul>
      {choice.candidates.length === 0 ? (
        <p className="text-xs text-muted-foreground">{i18n("nobodyElseCanSignForThisWallet")}</p>
      ) : null}
      <p aria-live="polite" className={listed.satisfied ? "text-xs text-emerald-300" : "text-xs text-amber-200"}>
        {status}
      </p>
    </fieldset>
  );
}
