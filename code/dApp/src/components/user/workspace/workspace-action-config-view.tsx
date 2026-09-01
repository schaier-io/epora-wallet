"use client";
import { selectedActionAtom } from "@/components/user/workspace/atoms/workspace-selection.atoms";
import { useAtomValue } from "jotai";

import { isSttFlowAction } from "@/components/user/workspace/helpers";

import { useWorkspaceActions } from "@/components/user/workspace/workspace-actions-context";

import { MintConfigView } from "@/components/user/workspace/config-mint-view";
import { SttSpendConfigView } from "@/components/user/workspace/config-sttspend-view";
import { LockFundsConfigView } from "@/components/user/workspace/config-lockfunds-view";
import { SetIntendedStakeCredentialConfigView } from "@/components/user/workspace/config-setintendedstakecredential-view";
import { WalletPublishConfigView } from "@/components/user/workspace/config-walletpublish-view";
import { WalletVoteConfigView } from "@/components/user/workspace/config-walletvote-view";
import { WalletWithdrawConfigView } from "@/components/user/workspace/config-walletwithdraw-view";

export function WorkspaceActionConfigView() {
  const state = useWorkspaceActions();
  const selectedAction = useAtomValue(selectedActionAtom);
  const {} = state;

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
