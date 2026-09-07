import { createDefaultTranslator } from "@/i18n/default-translator";
import defaultMessages from "@/i18n/generated/default-en/ComponentsUserWorkspaceHelpersStateValidationCopy.json";

const i18n = createDefaultTranslator("ComponentsUserWorkspaceHelpersStateValidationCopy", defaultMessages);

/**
 * Turns a contract datum path into the name of the thing on screen.
 *
 * `validateStateDatum` and friends report against the datum, because that is what they
 * validate and because contract tests assert their exact wording. Those strings then went
 * straight to the review rail, so the highest-priority sentence on the surface read
 * `state.beneficiaries[0].beneficiary_wallets must list at least one wallet. ...`. The
 * remediation half was already good. The half in front of it named a field nobody outside
 * the contract has ever seen.
 *
 * This maps only the path. The rest of each sentence is left exactly as the contract wrote
 * it: those clauses say what to do, and rewriting a shape error whose trigger has never been
 * observed would be guessing at advice. Contract-layer strings are not touched. This runs at
 * the boundary where they enter the UI.
 */

// Indices are contract-side and 0-based. Everything a person reads counts from one.
function humanIndex(raw: string): string {
  return String(Number(raw) + 1);
}

type PathRule = { pattern: RegExp; phrase: (match: RegExpMatchArray) => string };

const PATH_RULES: ReadonlyArray<PathRule> = [
  // Whole-wallet settings.
  { pattern: /^state\.wallet_name$/, phrase: () => i18n("theWalletName") },
  {
    pattern: /^state\.proof_of_life_unlock_time(\.Some)?$/,
    phrase: () => i18n("theProofOfLifeDate")
  },
  { pattern: /^state\.proof_of_life\.unlock_time$/, phrase: () => i18n("theProofOfLifeDate") },
  {
    pattern: /^state\.proof_of_life_increment(\.Some)?$/,
    phrase: () => i18n("theProofOfLifeLength")
  },
  {
    pattern: /^state\.multi_sig_threshold(\.Some)?$/,
    phrase: () => i18n("theCoSignerThreshold")
  },
  { pattern: /^state\.intended_stake_credential$/, phrase: () => i18n("theStakingChoice") },
  { pattern: /^state\.last_non_admin_payout_at$/, phrase: () => i18n("theLastPayoutTime") },

  // People. The datum calls the list `users`; it holds owners and spenders alike, so the
  // word that covers both is the one the People editor already uses.
  { pattern: /^state\.users$/, phrase: () => i18n("theListOfPeople") },
  {
    pattern: /^state\.users\[(\d+)\]\.user_wallets(\[\d+\])?$/,
    phrase: (m) => i18n("personWalletIds", { index: humanIndex(m[1]!) })
  },
  {
    pattern: /^state\.users\[(\d+)\]\.per_day_allowance.*$/,
    phrase: (m) => i18n("personDailyLimit", { index: humanIndex(m[1]!) })
  },
  {
    pattern: /^state\.users\[(\d+)\]\.remaining_allowance.*$/,
    phrase: (m) => i18n("personRemainingAllowance", { index: humanIndex(m[1]!) })
  },
  {
    pattern: /^state\.users\[(\d+)\]\.is_admin$/,
    phrase: (m) => i18n("whetherPersonIsAnOwner", { index: humanIndex(m[1]!) })
  },
  {
    pattern: /^state\.users\[(\d+)\]\.multi_sig_power$/,
    phrase: (m) => i18n("personApprovalPower", { index: humanIndex(m[1]!) })
  },
  {
    pattern: /^state\.users\[(\d+)\]\.id$/,
    phrase: (m) => i18n("personId", { index: humanIndex(m[1]!) })
  },
  { pattern: /^state\.users\[(\d+)\]$/, phrase: (m) => i18n("person", { index: humanIndex(m[1]!) }) },

  // Recovery contacts.
  { pattern: /^state\.beneficiaries$/, phrase: () => i18n("theListOfRecoveryContacts") },
  {
    pattern: /^state\.beneficiaries\[(\d+)\]\.beneficiary_wallets(\[\d+\])?$/,
    phrase: (m) => i18n("recoveryContactWalletIds", { index: humanIndex(m[1]!) })
  },
  {
    pattern: /^state\.beneficiaries\[(\d+)\]\.unlock_after.*$/,
    phrase: (m) => i18n("recoveryContactUnlockTime", { index: humanIndex(m[1]!) })
  },
  {
    pattern: /^state\.beneficiaries\[(\d+)\]\.id$/,
    phrase: (m) => i18n("recoveryContactId", { index: humanIndex(m[1]!) })
  },
  {
    pattern: /^state\.beneficiaries\[(\d+)\]$/,
    phrase: (m) => i18n("recoveryContact", { index: humanIndex(m[1]!) })
  },

  // Scheduled payments.
  { pattern: /^state\.streamingPayments$/, phrase: () => i18n("theListOfScheduledPayments") },
  {
    pattern: /^state\.streamingPayments\[(\d+)\]\.(\w+).*$/,
    phrase: (m) => i18n("scheduledPaymentField", {
      index: humanIndex(m[1]!),
      field: m[2]!.replace(/_/g, " ")
    })
  },
  {
    pattern: /^state\.streamingPayments\[(\d+)\]$/,
    phrase: (m) => i18n("scheduledPayment", { index: humanIndex(m[1]!) })
  }
];

// Anything the rules miss still must not reach a reader as a dotted path. Strip the `state.`
// prefix, turn `snake_case` into words and `[0]` into a counted position.
function fallbackPhrase(path: string): string {
  return path
    .replace(/^state\./, "")
    .replace(/\[(\d+)\]/g, (_full, index: string) => ` ${humanIndex(index)}`)
    .replace(/\./g, " ")
    .replace(/_/g, " ")
    .trim();
}

function phraseForPath(path: string): string {
  for (const rule of PATH_RULES) {
    const match = path.match(rule.pattern);
    if (match) {
      return rule.phrase(match);
    }
  }
  return fallbackPhrase(path);
}

// A path is `state.` plus dotted segments, each optionally indexed. `.Some` is the Option
// wrapper and belongs to the path, not to the sentence after it.
const PATH_TOKEN = /state(?:\.[A-Za-z_][A-Za-z0-9_]*(?:\[\d+\])?)+/g;

// The datum's word for a recovery contact's keys, left over inside the sentence tails.
const TAIL_TERMS: ReadonlyArray<[RegExp, string]> = [
  [/beneficiary[_ ]wallets/gi, i18n("walletIds")],
  [/\buser[_ ]wallets\b/gi, i18n("walletIds")]
];

export function describeStateValidationError(message: string): string {
  let replaced = false;
  let described = message.replace(PATH_TOKEN, (path) => {
    replaced = true;
    return phraseForPath(path);
  });

  for (const [pattern, replacement] of TAIL_TERMS) {
    described = described.replace(pattern, replacement);
  }

  if (!replaced) {
    // No path, so nothing here wrote the first word. Messages the contract already phrases
    // for a person pass through untouched, capital and all.
    return described;
  }

  // The path was the subject of the sentence, so the sentence now starts lowercase.
  return described.charAt(0).toUpperCase() + described.slice(1);
}
