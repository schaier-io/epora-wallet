"use client";
import { useTranslations } from "next-intl";

import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { InlineFieldError } from "@/components/user/workspace/editors";
import { getFirstFieldError } from "@/components/user/workspace/helpers";

import { useWorkspaceActions } from "@/components/user/workspace/workspace-actions-context";
import { useVoteForm } from "@/components/user/workspace/forms/use-vote-form";

export function WalletVoteConfigView() {
  const i18n = useTranslations("ComponentsUserWorkspaceConfigWalletvoteView");
  const state = useWorkspaceActions();
  const {
    activeFieldErrors,
  } = state;
  const { voteJson, setVoteJson } = useVoteForm();

      return (
        <div className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="userVoteJson">{i18n("voteJson")}</Label>
            {/* The old text described the box as Mesh's "`voter` + `govActionId` +
                `votingProcedure` (voteKind Yes/No/Abstain) structure", which names an SDK
                and three of its field names to someone who has to fill the box by hand.
                It also never said where the vote comes from. `govActionId` appears nowhere
                else in this app, and `/user/proposals` holds this wallet's own co-signing
                requests, not Cardano governance actions, so the proposal genuinely has to
                come from somewhere else. */}
            <p className="text-xs text-muted-foreground">
              {i18n("aVoteSaysThreeThingsWhoIsVoting")}
            </p>
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
