// Per-mode copy and surface flags for the STT spend workspace: one entry per
// action tab (send, update settings, allowance, …). Pure data consumed by the
// sttspend view and its option atoms.
import { type SttSpendActionMode } from "@/components/user/workspace/types";

export const STT_SPEND_ACTION_TABS: Array<{
  value: SttSpendActionMode;
  label: string;
  tabHint: string;
  description: string;
  stateHelper: string;
  outputStateLabel: string;
  outputAssetsHelper: string;
  showOutputAssets: boolean;
  lockedInputsHelper: string;
  lockedInputsLabel: string;
  lockedInputsEditorLabel: string;
  lockedInputsEditorHelper: string;
  lockedOutputsHelper: string;
  lockedOutputsLabel: string;
  showTransfers: boolean;
  transfersHelper: string;
  transferSelectorHelper: string;
  showProofOfLifeOverride: boolean;
  allowsStateEditing: boolean;
  /** When false, only the manual ref editor is shown (no locking-address + refresh + UTxO list). */
  showLockedContractUtxoBrowser: boolean;
  /** When false, the address + range "Quick transfer builder" strip is hidden. */
  showQuickTransferBuilder: boolean;
  buildLabel: string;
}> = [
  {
    value: "use",
    label: "Send funds",
    tabHint: "Normal send flow",
    description:
      "Send funds from this wallet without changing its people, limits, or streaming payment rules.",
    stateHelper:
      "Wallet rules stay the same. You can optionally bump the wake-up timer on this tab.",
    outputStateLabel: "Updated wallet state",
    outputAssetsHelper:
      "Leave empty to keep all current assets in the wallet.",
    showOutputAssets: true,
    lockedInputsHelper:
      "Optional fund pools to spend from on this send.",
    lockedInputsLabel: "Wallet funds",
    lockedInputsEditorLabel: "Wallet funds",
    lockedInputsEditorHelper:
      "Use the add buttons above, or enter receipt code + index manually.",
    lockedOutputsHelper:
      "Anything from your fund pools that isn't sent here stays in the wallet automatically.",
    lockedOutputsLabel: "Stays in wallet",
    showTransfers: true,
    transfersHelper:
      "These are the recipients of this send. Leftovers stay in the wallet automatically.",
    transferSelectorHelper:
      "Pick which fund pools to spend from. One slider per asset.",
    showProofOfLifeOverride: true,
    allowsStateEditing: false,
    showLockedContractUtxoBrowser: true,
    showQuickTransferBuilder: true,
    buildLabel: "Preview send"
  },
  {
    value: "renew-proof-of-life",
    label: "Refresh wake-up timer",
    tabHint: "Keep recovery access locked",
    description:
      "Refresh the wallet wake-up timer without sending funds.",
    stateHelper:
      "Resets the wake-up timer so recovery contacts stay locked out. No funds move.",
    outputStateLabel: "Updated wallet state",
    outputAssetsHelper:
      "Nothing leaves the wallet on this action.",
    showOutputAssets: false,
    lockedInputsHelper:
      "Leave empty. Refreshing the timer doesn't touch any fund pool.",
    lockedInputsLabel: "Wallet funds",
    lockedInputsEditorLabel: "Wallet funds",
    lockedInputsEditorHelper:
      "Leave empty. Only the timer is updated.",
    lockedOutputsHelper:
      "Leave empty. Nothing is unlocked.",
    lockedOutputsLabel: "Stays in wallet",
    showTransfers: false,
    transfersHelper:
      "No payments are made.",
    transferSelectorHelper:
      "Not used on this action.",
    showProofOfLifeOverride: true,
    allowsStateEditing: false,
    showLockedContractUtxoBrowser: false,
    showQuickTransferBuilder: true,
    buildLabel: "Preview safety refresh"
  },
  {
    value: "update-state",
    label: "Update settings",
    tabHint: "People and wallet rules",
    description:
      "Change people, approvals, beneficiary settings, or other wallet rules.",
    stateHelper:
      "Change who can use the wallet, daily limits, approvals, or recovery access.",
    outputStateLabel: "New wallet state",
    outputAssetsHelper:
      "Leave empty to keep all current assets in the wallet.",
    showOutputAssets: true,
    lockedInputsHelper:
      "Optional fund pools to touch during this update.",
    lockedInputsLabel: "Wallet funds",
    lockedInputsEditorLabel: "Wallet funds",
    lockedInputsEditorHelper:
      "Add receipt code + index for each fund pool you want to include.",
    lockedOutputsHelper:
      "Anything from your fund pools that isn't sent stays in the wallet automatically.",
    lockedOutputsLabel: "Stays in wallet",
    showTransfers: true,
    transfersHelper:
      "If you also want to move funds during this update, list recipients here.",
    transferSelectorHelper:
      "Pick fund pools. One slider per asset.",
    showProofOfLifeOverride: false,
    allowsStateEditing: true,
    showLockedContractUtxoBrowser: false,
    showQuickTransferBuilder: false,
    buildLabel: "Preview settings update"
  },
  {
    value: "manage-streaming-payments",
    label: "Manage streaming payments",
    tabHint: "Scheduled payments",
    description:
      "Add or update scheduled payment rules while leaving other wallet settings unchanged.",
    stateHelper:
      "Edit only the scheduled-payment rules. Other wallet settings stay the same.",
    outputStateLabel: "New wallet state",
    outputAssetsHelper:
      "Leave empty to keep all current assets in the wallet.",
    showOutputAssets: true,
    lockedInputsHelper:
      "Optional fund pools to touch while changing the schedule.",
    lockedInputsLabel: "Wallet funds",
    lockedInputsEditorLabel: "Wallet funds",
    lockedInputsEditorHelper:
      "Add receipt code + index for each fund pool you want to include.",
    lockedOutputsHelper:
      "Anything from your fund pools that isn't sent stays in the wallet automatically.",
    lockedOutputsLabel: "Stays in wallet",
    showTransfers: true,
    transfersHelper:
      "If you also want to send funds during this update, list recipients here.",
    transferSelectorHelper:
      "Pick fund pools. One slider per asset.",
    showProofOfLifeOverride: false,
    allowsStateEditing: true,
    showLockedContractUtxoBrowser: false,
    showQuickTransferBuilder: false,
    buildLabel: "Preview streaming payment changes"
  },
  {
    value: "use-allowance",
    label: "Use allowance",
    tabHint: "Spend within a limit",
    description:
      "Send funds within the allowance configured for the connected wallet.",
    stateHelper:
      "Spends within your daily limit. Only your remaining limit changes.",
    outputStateLabel: "Updated wallet state",
    outputAssetsHelper:
      "Nothing else moves. The amount you send counts toward your daily limit.",
    showOutputAssets: false,
    lockedInputsHelper:
      "Pick the fund pools you want to spend from today.",
    lockedInputsLabel: "Wallet funds",
    lockedInputsEditorLabel: "Wallet funds",
    lockedInputsEditorHelper:
      "Use the add buttons above, or enter receipt code + index manually.",
    lockedOutputsHelper:
      "Anything leftover from the chosen fund pools stays in the wallet automatically.",
    lockedOutputsLabel: "Stays in wallet",
    showTransfers: true,
    transfersHelper:
      "Recipients of this send. The total counts against your daily limit.",
    transferSelectorHelper:
      "Pick fund pools. One slider per asset.",
    showProofOfLifeOverride: false,
    allowsStateEditing: false,
    showLockedContractUtxoBrowser: true,
    showQuickTransferBuilder: true,
    buildLabel: "Preview allowance send"
  },
  {
    value: "use-beneficiary",
    label: "Spend as recovery contact",
    tabHint: "Recovery spend",
    description:
      "Spend as a recovery contact, once the wallet's wake-up timer has unlocked.",
    stateHelper:
      "Recovery contacts can step in after the wake-up timer expires.",
    outputStateLabel: "Updated wallet state",
    outputAssetsHelper:
      "Nothing else moves. Token assets stay in the wallet; only ADA goes out.",
    showOutputAssets: true,
    lockedInputsHelper:
      "Pick the fund pools to spend from.",
    lockedInputsLabel: "Wallet funds",
    lockedInputsEditorLabel: "Wallet funds",
    lockedInputsEditorHelper:
      "Use the add buttons above, or enter receipt code + index manually.",
    lockedOutputsHelper:
      "Anything leftover stays in the wallet automatically.",
    lockedOutputsLabel: "Stays in wallet",
    showTransfers: true,
    transfersHelper:
      "Recipients of this recovery spend.",
    transferSelectorHelper:
      "Pick fund pools. One slider per asset.",
    showProofOfLifeOverride: false,
    allowsStateEditing: false,
    showLockedContractUtxoBrowser: true,
    showQuickTransferBuilder: true,
    buildLabel: "Preview recovery payment"
  },
  {
    value: "payout-streaming-payment",
    label: "Pay streaming payments",
    tabHint: "Scheduled recipient payout",
    description:
      "Send a scheduled payment that's due, then mark it paid.",
    stateHelper:
      "Marks the matching schedule as paid for this cycle.",
    outputStateLabel: "Updated wallet state",
    outputAssetsHelper:
      "Tokens stay in the wallet; only ADA goes out for the schedule.",
    showOutputAssets: true,
    lockedInputsHelper:
      "Optional: pick wallet fund pools, or leave empty to fund the payout from the connected wallet.",
    lockedInputsLabel: "Wallet funds",
    lockedInputsEditorLabel: "Wallet funds",
    lockedInputsEditorHelper:
      "Leave empty for connected-wallet funding, or select wallet receipt references manually.",
    lockedOutputsHelper:
      "Anything leftover from the chosen fund pools stays in the wallet automatically.",
    lockedOutputsLabel: "Stays in wallet",
    showTransfers: true,
    transfersHelper:
      "The recipients due to be paid this cycle.",
    transferSelectorHelper:
      "Wallet fund pools are optional for scheduled payouts.",
    showProofOfLifeOverride: false,
    allowsStateEditing: false,
    showLockedContractUtxoBrowser: true,
    showQuickTransferBuilder: true,
    buildLabel: "Preview streaming payment"
  },
  {
    value: "consolidate-utxo",
    label: "Tidy funds",
    tabHint: "Merge fund pools",
    description:
      "Merge several small fund pools into a simpler wallet balance.",
    stateHelper:
      "Combines small fund pools into a tidier wallet balance.",
    outputStateLabel: "Updated wallet state",
    outputAssetsHelper:
      "Same assets, just fewer pools. You can optionally top up ADA.",
    showOutputAssets: false,
    lockedInputsHelper:
      "Pick at least two fund pools to merge.",
    lockedInputsLabel: "Wallet funds",
    lockedInputsEditorLabel: "Wallet funds",
    lockedInputsEditorHelper:
      "Add at least two fund pools to merge.",
    lockedOutputsHelper:
      "Leave empty to let the app create one merged pool, or specify your own.",
    lockedOutputsLabel: "Merged fund pools",
    showTransfers: false,
    transfersHelper:
      "Tidy funds doesn't send to outside recipients.",
    transferSelectorHelper:
      "Tidy funds only reorganizes the wallet.",
    showProofOfLifeOverride: false,
    allowsStateEditing: false,
    showLockedContractUtxoBrowser: true,
    showQuickTransferBuilder: true,
    buildLabel: "Preview tidy funds"
  }
];
