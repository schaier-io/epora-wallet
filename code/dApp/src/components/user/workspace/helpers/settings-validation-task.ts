import type { UserWorkspaceTask } from "@/components/user/flow-types";
import { describeStateValidationError } from "./state-validation-copy";

const TASK_PATHS: ReadonlyArray<[UserWorkspaceTask, string[]]> = [
  ["settings-wallet-name", ["state.wallet_name"]],
  ["settings-people", ["state.users", "state.users[0]"]],
  ["settings-multisig-threshold", ["state.multi_sig_threshold"]],
  ["settings-proof-of-life", ["state.beneficiaries", "state.beneficiaries[0]", "state.proof_of_life_unlock_time", "state.proof_of_life_increment"]]
];

// Match the same translated subjects used by the validation boundary. Unknown
// messages remain global rather than sending the user to an unrelated task.
export function settingsValidationTask(message: string): UserWorkspaceTask | null {
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
