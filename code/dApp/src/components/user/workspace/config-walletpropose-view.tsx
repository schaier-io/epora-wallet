"use client";
import { walletOperatorOptionsAtom } from "@/components/user/workspace/atoms/workspace-stt-options.atoms";
import { useAtomValue } from "jotai";

import { Textarea } from "@/components/ui/textarea";

import { ConfigSection, LabeledField, OperatorPathSelector } from "@/components/user/workspace/editors";
import { getFirstFieldError } from "@/components/user/workspace/helpers";

import { useWorkspaceActions } from "@/components/user/workspace/workspace-actions-context";
import { useProposeForm } from "@/components/user/workspace/forms/use-propose-form";
import { useSttSpendForm } from "@/components/user/workspace/forms/use-stt-spend-form";

export function WalletProposeConfigView() {
  const state = useWorkspaceActions();
  const walletOperatorOptions = useAtomValue(walletOperatorOptionsAtom);
  const {
    activeFieldErrors,
  } = state;
  const { proposalJson, setProposalJson } = useProposeForm();
  const { setWalletOperatorPath, walletOperatorPath } = useSttSpendForm();

      return (
        <div className="space-y-5">
          <ConfigSection
            title="Governance proposal path"
            description={
              <>
                This advanced flow forwards the STT on the selected operator path and attaches one script
                proposal payload. Forwarded STT state and assets follow the selected smart wallet.
                The proposal JSON must match Mesh&apos;s
                {" `proposalType` "}structure.
              </>
            }
          >
            <OperatorPathSelector
              id="walletProposeOperatorPath"
              options={walletOperatorOptions}
              value={walletOperatorPath}
              onChange={setWalletOperatorPath}
              helper="Choose whether this wrapper flow should use the direct Admin or Multisig operator path."
            />
          </ConfigSection>
          <LabeledField
            htmlFor="userProposalJson"
            label="Proposal JSON"
            error={
              getFirstFieldError(activeFieldErrors, "Proposal JSON") ??
              getFirstFieldError(activeFieldErrors, "Proposal")
            }
          >
            <Textarea
              id="userProposalJson"
              value={proposalJson}
              onChange={(event) => setProposalJson(event.target.value)}
              rows={10}
              className="font-mono text-xs"
            />
          </LabeledField>
        </div>
      );
}
