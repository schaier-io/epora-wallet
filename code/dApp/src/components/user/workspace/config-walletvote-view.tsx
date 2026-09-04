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
  // Named once, so the attribute that says the box is invalid and the message that says why
  // cannot disagree about whether there is anything wrong.
  const voteJsonError =
    getFirstFieldError(activeFieldErrors, "Vote JSON") ??
    getFirstFieldError(activeFieldErrors, "Vote");

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
            {/* The message was rendered beside the box and attached to nothing. Nothing
                marked the box invalid either, so `Textarea`'s own
                `aria-[invalid=true]:border-rose-500/60` never fired: the field a reader was
                sent back to looked and sounded exactly like a field that had passed. */}
            <Textarea
              id="userVoteJson"
              value={voteJson}
              onChange={(event) => setVoteJson(event.target.value)}
              rows={10}
              className="font-mono text-xs"
              aria-invalid={voteJsonError ? true : undefined}
              aria-describedby={voteJsonError ? "userVoteJson-error" : undefined}
            />
            <InlineFieldError id="userVoteJson-error" message={voteJsonError} />
          </div>
        </div>
      );
}
