import { atom } from "jotai";
import { workspaceDraftResetRevisionAtom } from "../workspace-draft-reset.atoms";

import { resetMintFormAtom } from "@/components/user/workspace/atoms/forms/mint-form.atoms";
import { resetSttSpendFormAtom } from "@/components/user/workspace/atoms/forms/stt-spend-form.atoms";
import { resetWithdrawFormAtom } from "@/components/user/workspace/atoms/forms/withdraw-form.atoms";
import { resetPublishFormAtom } from "@/components/user/workspace/atoms/forms/publish-form.atoms";
import { resetVoteFormAtom } from "@/components/user/workspace/atoms/forms/vote-form.atoms";
import { resetConsolidateFormAtom } from "@/components/user/workspace/atoms/forms/consolidate-form.atoms";
import { resetTransferFormAtom } from "@/components/user/workspace/atoms/forms/transfer-form.atoms";
import { resetLockFundsFormAtom } from "@/components/user/workspace/atoms/forms/lock-funds-form.atoms";

/**
 * Reset every account-scoped draft on disconnect or identity change.
 * Per-task resets during a session go through the draft handlers.
 */
export const resetAllFormsAtom = atom(null, (_get, set) => {
  set(workspaceDraftResetRevisionAtom, revision => revision + 1);
  set(resetMintFormAtom);
  set(resetSttSpendFormAtom);
  set(resetWithdrawFormAtom);
  set(resetPublishFormAtom);
  set(resetVoteFormAtom);
  set(resetConsolidateFormAtom);
  set(resetTransferFormAtom);
  set(resetLockFundsFormAtom);
});
