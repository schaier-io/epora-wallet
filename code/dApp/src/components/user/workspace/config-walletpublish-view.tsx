"use client";
import { useTranslations } from "next-intl";
import { FIELD_ERROR_IDS } from "@/components/user/workspace/field-error-ids";

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
  const i18n = useTranslations("ComponentsUserWorkspaceConfigWalletpublishView");
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
            title={i18n("publishACertificate")}
            description={i18n("authorizeOneGovernanceOrStakeCertificateThroughThis")}
          >
            <OperatorPathSelector
              id="walletPublishOperatorPath"
              options={walletOperatorOptions}
              value={walletOperatorPath}
              onChange={setWalletOperatorPath}
              helper={i18n("chooseWhetherAnOwnerOrTheRequiredApproval")}
            />
          </ConfigSection>
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label htmlFor="userPublishCertificateJson">{i18n("certificateJson")}</Label>
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
                  {i18n("voteAbstain")}
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
                  {i18n("stakeRegistration")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-[11px]"
                  onClick={() => setPublishCertificateJson("{}")}
                >
                  {i18n("clear")}
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
              {i18n("chooseATemplateOrPasteCertificateJsonFrom")}
            </p>
            <InlineFieldError
              message={
                getFirstFieldError(activeFieldErrors, FIELD_ERROR_IDS.certificateJson) ??
                getFirstFieldError(activeFieldErrors, FIELD_ERROR_IDS.publish)
              }
            />
          </div>
        </div>
      );
}
