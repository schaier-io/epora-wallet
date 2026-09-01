// Extracted from permission-wallet-workspace.tsx (27 symbols).
import { type OptionalConstrPresetForm, type RequiredConstrPresetForm } from "@/components/user/workspace/types";
import { buildStateActionData, resolveStructuredOnChainAction } from "@/lib/contracts/action-data";
import { type Asset, DEFAULT_MINT_STT_LOVELACE } from "@/lib/types/contracts";
import { z } from "zod";
import { createDefaultTranslator } from "@/i18n/default-translator";
import defaultMessages from "@/i18n/generated/default-en/ComponentsUserWorkspaceConstants.json";

const i18n = createDefaultTranslator("ComponentsUserWorkspaceConstants", defaultMessages);

export const LONG_DESCRIPTION_LIMIT = 78;


// Start with an empty ADA row (not a pre-filled 5 ₳) so the deposit amount is a
// deliberate choice, consistent with the Send flow, which also starts blank.
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
  .regex(/^\d+$/, i18n("enterAWholeNumber"));

export const OPTIONAL_NON_NEGATIVE_INTEGER_SCHEMA = z
  .string()
  .trim()
  .refine((value) => value.length === 0 || /^\d+$/.test(value), i18n("enterAWholeNumber"));

export const REQUIRED_TEXT_SCHEMA = z.string().trim().min(1, i18n("thisFieldIsRequired"));

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


export const RECENT_RECIPIENTS_STORAGE_KEY = "permission-wallet:recent-recipients";

export const DEFAULT_SAFETY_TIMER_MS = 30 * 24 * 60 * 60 * 1000;
