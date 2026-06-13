"use client";
import { walletOperatorOptionsAtom } from "@/components/user/workspace/atoms/workspace-stt-options.atoms";
import { useAtomValue } from "jotai";

import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import {
  type OperatorAuthorityPath } from "@/lib/types/contracts";
import { InlineFieldError } from "@/components/user/workspace/editors";
import { getFirstFieldError } from "@/components/user/workspace/helpers";

import { useWorkspaceActions } from "@/components/user/workspace/workspace-actions-context";
import { useVoteForm } from "@/components/user/workspace/forms/use-vote-form";
import { useSttSpendForm } from "@/components/user/workspace/forms/use-stt-spend-form";

export function WalletVoteConfigView() {
  const state = useWorkspaceActions();
  const walletOperatorOptions = useAtomValue(walletOperatorOptionsAtom);
  const {
    activeFieldErrors,
  } = state;
  const { voteJson, setVoteJson } = useVoteForm();
  const { setWalletOperatorPath, walletOperatorPath } = useSttSpendForm();

      return (
        <div className="space-y-5">
          <div className="rounded-xl border border-border/60 bg-background/40 p-4">
            <p className="text-sm font-medium text-foreground">Governance vote path</p>
            <p className="mt-1 text-xs text-muted-foreground">
              This advanced flow casts one governance vote while the STT forwards on the selected
              operator path. Forwarded STT state and assets follow the selected smart wallet.
              The vote JSON must match Mesh&apos;s
              {" `voter` "}+{" `govActionId` "}+{" `votingProcedure` (voteKind Yes/No/Abstain) "}structure.
            </p>
            {walletOperatorOptions.length > 1 ? (
              <div className="mt-4 max-w-xs space-y-1">
                <Label htmlFor="walletVoteOperatorPath">Authorization Path</Label>
                <select
                  id="walletVoteOperatorPath"
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
            <Label htmlFor="userVoteJson">Vote JSON</Label>
            <Textarea
              id="userVoteJson"
              value={voteJson}
              onChange={(event) => setVoteJson(event.target.value)}
              rows={10}
              className="font-mono text-xs"
            />
            <InlineFieldError
              message={
                getFirstFieldError(activeFieldErrors, "Vote JSON") ??
                getFirstFieldError(activeFieldErrors, "Vote")
              }
            />
          </div>
        </div>
      );
}
