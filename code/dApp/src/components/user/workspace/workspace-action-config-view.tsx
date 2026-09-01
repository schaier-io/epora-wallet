"use client";
import { selectedActionAtom } from "@/components/user/workspace/atoms/workspace-selection.atoms";
import {
  selectedTokenCapabilityMapAtom,
  selectableWizardActionKindsAtom
} from "@/components/user/workspace/atoms/workspace-detected-token.atoms";
import { useAtomValue } from "jotai";
import { useTranslations } from "next-intl";

import { isActionBlockedByCapabilities, isSttFlowAction } from "@/components/user/workspace/helpers";

import { MintConfigView } from "@/components/user/workspace/config-mint-view";
import { SttSpendConfigView } from "@/components/user/workspace/config-sttspend-view";
import { LockFundsConfigView } from "@/components/user/workspace/config-lockfunds-view";
import { SetIntendedStakeCredentialConfigView } from "@/components/user/workspace/config-setintendedstakecredential-view";
import { WalletPublishConfigView } from "@/components/user/workspace/config-walletpublish-view";
import { WalletVoteConfigView } from "@/components/user/workspace/config-walletvote-view";
import { WalletWithdrawConfigView } from "@/components/user/workspace/config-walletwithdraw-view";

/**
 * The URL parser accepts any real action name, so a hand-typed `?action=` link can
 * name an advanced action (publish, vote, staking credential, ...) that the
 * connected key has no path to. The sidebar hides those; this router must refuse
 * them too, instead of rendering a form whose submission can only fail later.
 */
function ActionNotAvailable() {
  const i18n = useTranslations("ComponentsUserWorkspaceActionConfigView");
  return (
    <div className="space-y-1 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
      <p className="text-sm font-medium text-foreground">{i18n("notAvailableTitle")}</p>
      <p className="text-sm leading-relaxed text-muted-foreground">
        {i18n("notAvailableDescription")}
      </p>
    </div>
  );
}

export function WorkspaceActionConfigView() {
  const selectedAction = useAtomValue(selectedActionAtom);
  const selectableKinds = useAtomValue(selectableWizardActionKindsAtom);
  const capabilityMap = useAtomValue(selectedTokenCapabilityMapAtom);

  if (isActionBlockedByCapabilities(selectedAction, selectableKinds, capabilityMap != null)) {
    return <ActionNotAvailable />;
  }

  if (selectedAction === "mint") {
    return <MintConfigView />;
  }

  if (isSttFlowAction(selectedAction)) {
    return <SttSpendConfigView />;
  }

  if (selectedAction === "lock-funds") {
    return <LockFundsConfigView />;
  }

  if (selectedAction === "set-intended-stake-credential") {
    return <SetIntendedStakeCredentialConfigView />;
  }

  if (selectedAction === "wallet-publish") {
    return <WalletPublishConfigView />;
  }

  if (selectedAction === "wallet-vote") {
    return <WalletVoteConfigView />;
  }

  if (selectedAction === "wallet-withdraw") {
    return <WalletWithdrawConfigView />;
  }

  return null;
}
