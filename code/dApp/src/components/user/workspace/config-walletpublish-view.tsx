"use client";
import { useTranslations } from "next-intl";

import { walletOperatorOptionsAtom } from "@/components/user/workspace/atoms/workspace-stt-options.atoms";
import { walletRewardAddressAtom } from "@/components/user/workspace/atoms/workspace-wallet-derivations.atoms";
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
  // The certificate registers or delegates a stake credential, and Mesh identifies that
  // credential by its bech32 reward address. `wallet.wallet.{spend,withdraw,publish}` are
  // one multi-purpose validator with one hash (`lib/contracts/blueprint.ts:96-99`), so the
  // wallet's own reward address is the credential the publish witness covers.
  const walletRewardAddress = useAtomValue(walletRewardAddressAtom);
  const {
    activeFieldErrors,
  } = state;
  const { publishCertificateJson, setPublishCertificateJson } = usePublishForm();
  const { setWalletOperatorPath, walletOperatorPath } = useSttSpendForm();
  // Named once, so the attribute that says the box is invalid and the message that says why
  // cannot disagree about whether there is anything wrong.
  const certificateJsonError =
    getFirstFieldError(activeFieldErrors, "Certificate JSON") ??
    getFirstFieldError(activeFieldErrors, "Publish");

      return (
        <div className="space-y-4">
          {/* Not "Governance publish path": "path" is the dropdown's own jargon, and the
              old description said the certificate is attached to "this wallet's next owner
              action". It is not queued. `lib/mesh/transactions/wallet-governance.ts:125-136`
              puts it in this very transaction. The two true things that description carried
              (what is sent, and that the wallet's rules and people do not change) are already
              on the card above, from `lib/user-flow/action-definitions.ts:366`. */}
          <ConfigSection title={i18n("whoApprovesThisCertificate")}>
            <OperatorPathSelector
              id="walletPublishOperatorPath"
              options={walletOperatorOptions}
              value={walletOperatorPath}
              onChange={setWalletOperatorPath}
              helper={i18n("signAsASingleOwnerOrCollectThe")}
            />
          </ConfigSection>
          <div className="space-y-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label htmlFor="userPublishCertificateJson">{i18n("certificateJson")}</Label>
              <div className="flex flex-wrap gap-1.5">
                {/* Named for what it does. It was labelled `Vote: Abstain`, which reads as
                    casting an abstain vote on a proposal; it hands this wallet's voting
                    power to the always-abstain DRep, and it stands until it is replaced. */}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="px-2 text-xs"
                  disabled={!walletRewardAddress}
                  onClick={() =>
                    setPublishCertificateJson(
                      JSON.stringify(
                        {
                          // Both template shapes come from Mesh's `CertificateType` union
                          // (`@meshsdk/common` `index.d.ts:321-380`). They used to read
                          // `VoteDeleg` and `StakeRegistration`, which are in that union
                          // under neither name, and `toCardanoCert`
                          // (`@meshsdk/core-cst` `index.js:73354`) has no default branch:
                          // an unknown type returned `undefined` and the build could never
                          // produce a transaction from either template.
                          type: "VoteDelegation",
                          stakeKeyAddress: walletRewardAddress,
                          drep: { alwaysAbstain: null }
                        },
                        null,
                        2
                      )
                    )
                  }
                >
                  {i18n("alwaysAbstain")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="px-2 text-xs"
                  disabled={!walletRewardAddress}
                  onClick={() =>
                    setPublishCertificateJson(
                      JSON.stringify(
                        {
                          type: "RegisterStake",
                          stakeKeyAddress: walletRewardAddress
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
                  className="px-2 text-xs"
                  onClick={() => setPublishCertificateJson("{}")}
                >
                  {i18n("clear")}
                </Button>
              </div>
            </div>
            {/* Above the box, not below it. Only one of the two templates explained itself,
                and it did so through a `title` tooltip no keyboard or touch user ever sees.
                A reader who has just read the two button labels needs this before the box,
                not after it. */}
            <p className="text-xs text-muted-foreground">
              {walletRewardAddress
                ? i18n("alwaysAbstainHandsThisWalletSVotingPower")
                : i18n("theTemplatesNeedThisWalletSStakingAddress")}
            </p>
            {/* The message was rendered beside the box and attached to nothing. Nothing
                marked the box invalid either, so `Textarea`'s own
                `aria-[invalid=true]:border-rose-500/60` never fired: the field a reader was
                sent back to looked and sounded exactly like a field that had passed. */}
            <Textarea
              id="userPublishCertificateJson"
              value={publishCertificateJson}
              onChange={(event) => setPublishCertificateJson(event.target.value)}
              rows={10}
              className="font-mono text-xs"
              aria-invalid={certificateJsonError ? true : undefined}
              aria-describedby={
                certificateJsonError ? "userPublishCertificateJson-error" : undefined
              }
            />
            <InlineFieldError
              id="userPublishCertificateJson-error"
              message={certificateJsonError}
            />
          </div>
        </div>
      );
}
