"use client";
import { walletOperatorOptionsAtom } from "@/components/user/workspace/atoms/workspace-stt-options.atoms";
import { useAtomValue } from "jotai";

import { Button } from "@/components/ui/button";

import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { ConfigSection, InlineFieldError, OperatorPathSelector } from "@/components/user/workspace/editors";
import { getFirstFieldError } from "@/components/user/workspace/helpers";

import { useWorkspaceActions } from "@/components/user/workspace/workspace-actions-context";
import { usePublishForm } from "@/components/user/workspace/forms/use-publish-form";
import { useSttSpendForm } from "@/components/user/workspace/forms/use-stt-spend-form";

export function WalletPublishConfigView() {
  const state = useWorkspaceActions();
  const walletOperatorOptions = useAtomValue(walletOperatorOptionsAtom);
  const {
    activeFieldErrors,
  } = state;
  const { publishCertificateJson, setPublishCertificateJson } = usePublishForm();
  const { setWalletOperatorPath, walletOperatorPath } = useSttSpendForm();

      return (
        <div className="space-y-5">
          <ConfigSection
            title="Governance publish path"
            description="Attach one governance certificate to this wallet's next admin action. The wallet keeps its current state and assets. Use a template below or paste your own certificate JSON."
          >
            <OperatorPathSelector
              id="walletPublishOperatorPath"
              options={walletOperatorOptions}
              value={walletOperatorPath}
              onChange={setWalletOperatorPath}
              helper="Choose whether this wrapper flow should use the direct Admin or Multisig operator path."
            />
          </ConfigSection>
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label htmlFor="userPublishCertificateJson">Certificate JSON</Label>
              <div className="flex flex-wrap gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-[11px]"
                  // Named for what it does. It was labelled `Vote: Abstain`, which reads as
                  // casting an abstain vote on a proposal; it is a `VoteDeleg` certificate
                  // that hands this wallet's voting power to the always-abstain DRep, and it
                  // stands until it is replaced.
                  title="Delegates this wallet's voting power to the always-abstain DRep"
                  onClick={() =>
                    setPublishCertificateJson(
                      JSON.stringify(
                        {
                          type: "VoteDeleg",
                          drep: { type: "DRepAlwaysAbstain" }
                        },
                        null,
                        2
                      )
                    )
                  }
                >
                  Always abstain
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-[11px]"
                  onClick={() =>
                    setPublishCertificateJson(
                      JSON.stringify(
                        {
                          type: "StakeRegistration"
                        },
                        null,
                        2
                      )
                    )
                  }
                >
                  Stake registration
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-[11px]"
                  onClick={() => setPublishCertificateJson("{}")}
                >
                  Clear
                </Button>
              </div>
            </div>
            <Textarea
              id="userPublishCertificateJson"
              value={publishCertificateJson}
              onChange={(event) => setPublishCertificateJson(event.target.value)}
              rows={10}
              className="font-mono text-xs"
            />
            <p className="text-[11px] text-muted-foreground">
              Tap a template above, or paste a certificate JSON exported from another tool.
            </p>
            <InlineFieldError
              message={
                getFirstFieldError(activeFieldErrors, "Certificate JSON") ??
                getFirstFieldError(activeFieldErrors, "Publish")
              }
            />
          </div>
        </div>
      );
}
