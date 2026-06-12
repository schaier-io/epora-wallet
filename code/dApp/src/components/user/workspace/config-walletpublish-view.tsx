"use client";
import { walletOperatorOptionsAtom } from "@/components/user/workspace/atoms/workspace-stt-options.atoms";
import { useAtomValue } from "jotai";

import { Button } from "@/components/ui/button";

import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import {
  type OperatorAuthorityPath } from "@/lib/types/contracts";
import { InlineFieldError } from "@/components/user/workspace/editors";
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
          <div className="rounded-xl border border-border/60 bg-background/40 p-4">
            <p className="text-sm font-medium text-foreground">Governance publish path</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Attach one governance certificate to this wallet&apos;s next admin action. The wallet keeps its
              current state and assets. Use a template below or paste your own certificate JSON.
            </p>
            {walletOperatorOptions.length > 1 ? (
              <div className="mt-4 max-w-xs space-y-1">
                <Label htmlFor="walletPublishOperatorPath">Authorization Path</Label>
                <select
                  id="walletPublishOperatorPath"
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={walletOperatorPath}
                  onChange={(event) =>
                    setWalletOperatorPath(event.target.value as OperatorAuthorityPath)
                  }
                >
                  {walletOperatorOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  Choose whether this wrapper flow should use the direct Admin or Multisig operator path.
                </p>
              </div>
            ) : walletOperatorOptions[0] ? (
              <div className="mt-4 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                Authorization path:{" "}
                <span className="font-medium text-foreground">
                  {walletOperatorOptions[0].label}
                </span>
              </div>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label htmlFor="userPublishCertificateJson">Certificate JSON</Label>
              <div className="flex flex-wrap gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-[11px]"
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
                  Vote: Abstain
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
