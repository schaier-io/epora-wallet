import { atom } from "jotai";

import { resetMintFormAtom } from "@/components/user/workspace/atoms/forms/mint-form.atoms";
import { resetSttSpendFormAtom } from "@/components/user/workspace/atoms/forms/stt-spend-form.atoms";
import { resetWithdrawFormAtom } from "@/components/user/workspace/atoms/forms/withdraw-form.atoms";
import { resetPublishFormAtom } from "@/components/user/workspace/atoms/forms/publish-form.atoms";
import { resetProposeFormAtom } from "@/components/user/workspace/atoms/forms/propose-form.atoms";
import { resetConsolidateFormAtom } from "@/components/user/workspace/atoms/forms/consolidate-form.atoms";
import { resetTransferFormAtom } from "@/components/user/workspace/atoms/forms/transfer-form.atoms";
import { resetWalletSpendFormAtom } from "@/components/user/workspace/atoms/forms/wallet-spend-form.atoms";
import { resetLockFundsFormAtom } from "@/components/user/workspace/atoms/forms/lock-funds-form.atoms";

/**
 * Reset every per-action form atom to its default. The form atoms are module-global, so the
 * controller calls this on unmount to mirror the per-mount reset that component-local `useState`
 * gave for free. (Per-action resets during a session still go through the draft handlers.)
 */
export const resetAllFormsAtom = atom(null, (_get, set) => {
  set(resetMintFormAtom);
  set(resetSttSpendFormAtom);
  set(resetWithdrawFormAtom);
  set(resetPublishFormAtom);
  set(resetProposeFormAtom);
  set(resetConsolidateFormAtom);
  set(resetTransferFormAtom);
  set(resetWalletSpendFormAtom);
  set(resetLockFundsFormAtom);
});
