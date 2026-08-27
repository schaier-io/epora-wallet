// Extracted from permission-wallet-workspace.tsx (27 symbols).
import { type OptionalConstrPresetForm, type RequiredConstrPresetForm, type SttSpendActionMode } from "@/components/user/workspace/types";
import { buildStateActionData, resolveStructuredOnChainAction } from "@/lib/contracts/action-data";
import { type Asset, DEFAULT_MINT_STT_LOVELACE } from "@/lib/types/contracts";
import { z } from "zod";

export const LONG_DESCRIPTION_LIMIT = 78;


// Start with an empty ADA row (not a pre-filled 5 ₳) so the deposit amount is a
// deliberate choice — consistent with the Send flow, which also starts blank.
export const DEFAULT_LOCK_ASSETS: Asset[] = [{ unit: "lovelace", quantity: "" }];

// Max wallet UTxOs swept into one enterprise→base migration / orphan-cleanup
// transaction. Each is a script input (execution-unit heavy), so a sweep of many
// UTxOs is batched: consolidate this many per tx, then re-check finds the rest.
// Conservative so the tx stays well under the protocol execution-unit ceiling.
export const MAX_ORPHAN_SWEEP_INPUTS = 15;

export const DEFAULT_MINT_STARTER_ASSETS: Asset[] = [
  { unit: "lovelace", quantity: DEFAULT_MINT_STT_LOVELACE }
];

export const DEFAULT_OPTIONAL_CONSTR_PRESET: OptionalConstrPresetForm = {
  mode: "none",
  customAlternative: "0"
};

export const DEFAULT_REQUIRED_CONSTR_PRESET: RequiredConstrPresetForm = {
  mode: "empty-alt-0",
  customAlternative: "0"
};

export const WALLET_ACTIVITY_PAGE_SIZE = 5;

export const RECENT_WALLET_TRANSACTION_FETCH_PAGES = 8;

export const RECENT_WALLET_TRANSACTION_VISIBLE_LIMIT = 30;

export const RECENT_WALLET_ACTIVITY_ANCHOR_LIMIT = 12;

export const RECENT_STT_TRANSACTION_FETCH_PAGES = 10;

export const MINT_CONFIRMATION_MAX_ATTEMPTS = 12;

export const MINT_CONFIRMATION_INITIAL_DELAY_MS = 600;

export const MINT_CONFIRMATION_POLL_MS = 3500;

export const NON_NEGATIVE_INTEGER_SCHEMA = z
  .string()
  .trim()
  .regex(/^\d+$/, "Enter a whole number.");

export const OPTIONAL_NON_NEGATIVE_INTEGER_SCHEMA = z
  .string()
  .trim()
  .refine((value) => value.length === 0 || /^\d+$/.test(value), "Enter a whole number.");

export const REQUIRED_TEXT_SCHEMA = z.string().trim().min(1, "This field is required.");

export const MINT_PERFORMED_ACTION = buildStateActionData("mint");

export const RENEW_PROOF_OF_LIFE_ACTION = buildStateActionData(
  resolveStructuredOnChainAction("renew-proof-of-life")
);

export const ALLOWANCE_WITHDRAWAL_ACTION = buildStateActionData({
  kind: "allowance-withdrawal"
});

export const BENEFICIARY_WITHDRAWAL_ACTION = buildStateActionData({
  kind: "beneficiary-withdrawal"
});

export const STREAMING_PAYMENT_PAYOUT_ACTION = buildStateActionData({
  kind: "streaming-payment-payout"
});

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
      "Send funds from this wallet without changing its people, limits, or scheduled payments.",
    stateHelper:
      "Wallet rules stay the same. You can optionally bump the proof of life on this tab.",
    outputStateLabel: "Updated wallet state",
    outputAssetsHelper:
      "Leave empty to keep all current assets in the wallet.",
    showOutputAssets: true,
    lockedInputsHelper:
      "Optional fund pools to spend from on this send.",
    lockedInputsLabel: "Fund pools",
    lockedInputsEditorLabel: "Fund pools",
    lockedInputsEditorHelper:
      "Add the fund pools you want to use, or let the app pick them.",
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
    label: "Refresh proof of life",
    tabHint: "Keep recovery access locked",
    description:
      "Refresh the wallet proof of life without sending funds.",
    stateHelper:
      "Resets the proof of life so recovery contacts stay locked out. No funds move.",
    outputStateLabel: "Updated wallet state",
    outputAssetsHelper:
      "Nothing leaves the wallet on this action.",
    showOutputAssets: false,
    lockedInputsHelper:
      "Leave empty. Refreshing the timer doesn't touch any fund pool.",
    lockedInputsLabel: "Fund pools",
    lockedInputsEditorLabel: "Fund pools",
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
    buildLabel: "Preview timer renewal"
  },
  {
    value: "update-state",
    label: "Update settings",
    tabHint: "People and wallet rules",
    description:
      "Change people, approvals, recovery contacts, or other wallet rules.",
    stateHelper:
      "Change who can use the wallet, daily limits, approvals, or recovery access.",
    outputStateLabel: "New wallet state",
    outputAssetsHelper:
      "Leave empty to keep all current assets in the wallet.",
    showOutputAssets: true,
    lockedInputsHelper:
      "Optional fund pools to touch during this update.",
    lockedInputsLabel: "Fund pools",
    lockedInputsEditorLabel: "Fund pools",
    lockedInputsEditorHelper:
      "Add each fund pool you want to include.",
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
    label: "Manage scheduled payments",
    tabHint: "Scheduled payments",
    description:
      "Add or update scheduled payments while leaving other wallet settings unchanged.",
    stateHelper:
      "Edit only the scheduled-payment rules. Other wallet settings stay the same.",
    outputStateLabel: "New wallet state",
    outputAssetsHelper:
      "Leave empty to keep all current assets in the wallet.",
    showOutputAssets: true,
    lockedInputsHelper:
      "Optional fund pools to touch while changing the schedule.",
    lockedInputsLabel: "Fund pools",
    lockedInputsEditorLabel: "Fund pools",
    lockedInputsEditorHelper:
      "Add each fund pool you want to include.",
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
    buildLabel: "Preview scheduled payment changes"
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
    lockedInputsLabel: "Fund pools",
    lockedInputsEditorLabel: "Fund pools",
    lockedInputsEditorHelper:
      "Add the fund pools you want to use, or let the app pick them.",
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
      "Spend as a recovery contact, once the wallet's proof of life has unlocked.",
    stateHelper:
      "Recovery contacts can step in after the proof of life expires.",
    outputStateLabel: "Updated wallet state",
    outputAssetsHelper:
      "Nothing else moves. Token assets stay in the wallet; only ADA goes out.",
    showOutputAssets: true,
    lockedInputsHelper:
      "Pick the fund pools to spend from.",
    lockedInputsLabel: "Fund pools",
    lockedInputsEditorLabel: "Fund pools",
    lockedInputsEditorHelper:
      "Add the fund pools you want to use, or let the app pick them.",
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
    label: "Pay scheduled payments",
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
    lockedInputsLabel: "Fund pools",
    lockedInputsEditorLabel: "Fund pools",
    lockedInputsEditorHelper:
      "Leave empty to pay from the connected wallet, or add fund pools to pay from this wallet.",
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
    buildLabel: "Preview scheduled payment"
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
    lockedInputsLabel: "Fund pools",
    lockedInputsEditorLabel: "Fund pools",
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

export const RECENT_RECIPIENTS_STORAGE_KEY = "permission-wallet:recent-recipients";

export const DEFAULT_SAFETY_TIMER_MS = 30 * 24 * 60 * 60 * 1000;
