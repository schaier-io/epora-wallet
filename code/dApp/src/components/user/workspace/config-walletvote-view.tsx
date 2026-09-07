"use client";
import { useTranslations } from "next-intl";

import { walletOperatorOptionsAtom } from "@/components/user/workspace/atoms/workspace-stt-options.atoms";
import { useAtomValue } from "jotai";

import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { ConfigSection, InlineFieldError, OperatorPathSelector } from "@/components/user/workspace/editors";
import { getFirstFieldError } from "@/components/user/workspace/helpers";

import { useWorkspaceActions } from "@/components/user/workspace/workspace-actions-context";
import { useVoteForm } from "@/components/user/workspace/forms/use-vote-form";
import { useSttSpendForm } from "@/components/user/workspace/forms/use-stt-spend-form";

export function WalletVoteConfigView() {
  const i18n = useTranslations("ComponentsUserWorkspaceConfigWalletvoteView");
  const state = useWorkspaceActions();
  const walletOperatorOptions = useAtomValue(walletOperatorOptionsAtom);
  const {
    activeFieldErrors,
  } = state;
  const { voteJson, setVoteJson } = useVoteForm();
  const { setWalletOperatorPath, walletOperatorPath } = useSttSpendForm();
  // Hoisted so the box can point `aria-invalid` and `aria-describedby` at the message:
  // the rejection was visible to sighted readers and invisible to assistive tech.
  const voteJsonError =
    getFirstFieldError(activeFieldErrors, "Vote JSON") ??
    getFirstFieldError(activeFieldErrors, "Vote");

      return (
        <div className="space-y-4">
          {/* This panel and its authority picker used to be hand-rolled here, class for
              class, alongside the shared `ConfigSection` and `OperatorPathSelector` that
              render exactly the same markup. The copies had drifted: this one told the
              reader to "use the direct Admin or Multisig operator path", naming the two
              enum values, where the shared one names what the reader is choosing between.
              The title matches the one the rewards and publish screens use, so the same
              control is called the same thing on all three. */}
          <ConfigSection title={i18n("whoApprovesThisVote")}>
            <OperatorPathSelector
              id="walletVoteOperatorPath"
              options={walletOperatorOptions}
              value={walletOperatorPath}
              onChange={setWalletOperatorPath}
              helper={i18n("signAsASingleOwnerOrCollectThe")}
            />
          </ConfigSection>
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
              // No `text-xs`: `tailwind-merge` resolves the conflict in favour of the call
              // site, so it deleted the primitive's `text-base` and left this box at 12px on
              // mobile. iOS Safari zooms the page when a focused control's text is under 16px
              // and never zooms back. The primitive's own `text-base sm:text-sm` stands.
              className="font-mono"
              aria-invalid={voteJsonError ? true : undefined}
              aria-describedby={voteJsonError ? "userVoteJson-error" : undefined}
            />
            <InlineFieldError id="userVoteJson-error" message={voteJsonError} />
          </div>
        </div>
      );
}
