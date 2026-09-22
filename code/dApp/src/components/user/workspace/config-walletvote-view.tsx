"use client";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";

import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { GovernanceVotePicker } from "@/components/user/workspace/governance-vote-picker";
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
  // An untouched box means nothing was picked yet: the picker is where to fix that, so the
  // error shows there. A hand-edited box keeps its error on the box itself.
  const jsonEdited = !["", "{}"].includes(voteJson.trim());
  const jsonRejected = Boolean(voteJsonError) && jsonEdited;
  // Opened, never closed, from here: an `open` prop would shut the box under the cursor
  // the moment the reader's fix cleared the error.
  const detailsRef = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (jsonRejected && detailsRef.current) detailsRef.current.open = true;
  }, [jsonRejected]);

      return (
        <div className="space-y-4">
          <GovernanceVotePicker error={jsonEdited ? null : voteJsonError} />
          {/* The raw payload stays reachable for votes the picker cannot express. It opens
              by itself when validation rejects it, so the reader lands on the reason. */}
          <details ref={detailsRef} className="space-y-2">
            <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
              {i18n("editAsJson")}
            </summary>
            <div className="mt-2 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label htmlFor="userVoteJson">{i18n("voteJson")}</Label>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="px-2 text-xs"
                  onClick={() => setVoteJson("{}")}
                >
                  {i18n("clear")}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">{i18n("jsonExplanation")}</p>
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
              placeholder={i18n("voteJsonPlaceholder")}
              aria-invalid={voteJsonError ? true : undefined}
              aria-describedby={voteJsonError ? "userVoteJson-error" : undefined}
            />
            <InlineFieldError id="userVoteJson-error" message={voteJsonError} />
            </div>
          </details>
        </div>
      );
}
