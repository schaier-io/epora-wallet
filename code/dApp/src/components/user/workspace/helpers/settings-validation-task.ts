import type { UserWorkspaceTask } from "@/components/user/flow-types";
import { describeStateValidationError } from "./state-validation-copy";
import validationMessages from "@/i18n/generated/default-en/ComponentsUserWorkspaceActionValidationShared.json";

const TASK_PATHS: ReadonlyArray<[UserWorkspaceTask, string[]]> = [
  ["settings-wallet-name", ["state.wallet_name"]],
  // Recovery contacts live in the people list; only the timer itself is a wallet rule.
  ["settings-people", ["state.users", "state.users[0]", "state.beneficiaries", "state.beneficiaries[0]"]],
  ["settings-multisig-threshold", ["state.multi_sig_threshold"]],
  ["settings-proof-of-life", ["state.proof_of_life_unlock_time", "state.proof_of_life_increment"]]
];

// Match the same translated subjects used by the validation boundary. Unknown
// messages remain global rather than sending the user to an unrelated task.
export function settingsValidationTask(message: string): UserWorkspaceTask | null {
  // Not a datum error: the confirmation for this lives on the co-signers rule.
  if (message === validationMessages.confirmTheApprovalPowerNobodyCanReach) return "settings-multisig-threshold";
  for (const [task, paths] of TASK_PATHS) {
    for (const path of paths) {
      const subject = describeStateValidationError(path);
      const escaped = subject.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const pattern = path.includes("[0]") ? escaped.replace("1", "\\d+") : escaped;
      if (new RegExp(`^${pattern}(?:\\b|\\s)`, "i").test(message)) return task;
    }
  }
  return null;
}
