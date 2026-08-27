/**
 * Turns a contract datum path into the name of the thing on screen.
 *
 * `validateStateDatum` and friends report against the datum, because that is what they
 * validate and because contract tests assert their exact wording. Those strings then went
 * straight to the review rail, so the highest-priority sentence on the surface read
 * `state.beneficiaries[0].beneficiary_wallets must list at least one wallet — ...`. The
 * remediation half was already good. The half in front of it named a field nobody outside
 * the contract has ever seen.
 *
 * This maps only the path. The rest of each sentence is left exactly as the contract wrote
 * it: those clauses say what to do, and rewriting a shape error whose trigger has never been
 * observed would be guessing at advice. Contract-layer strings are not touched — this runs at
 * the boundary where they enter the UI.
 */

// Indices are contract-side and 0-based. Everything a person reads counts from one.
function humanIndex(raw: string): string {
  return String(Number(raw) + 1);
}

type PathRule = { pattern: RegExp; phrase: (match: RegExpMatchArray) => string };

const PATH_RULES: ReadonlyArray<PathRule> = [
  // Whole-wallet settings.
  { pattern: /^state\.wallet_name$/, phrase: () => "the wallet name" },
  {
    pattern: /^state\.proof_of_life_unlock_time(\.Some)?$/,
    phrase: () => "the proof of life date"
  },
  { pattern: /^state\.proof_of_life\.unlock_time$/, phrase: () => "the proof of life date" },
  {
    pattern: /^state\.proof_of_life_increment(\.Some)?$/,
    phrase: () => "the proof of life length"
  },
  {
    pattern: /^state\.multi_sig_threshold(\.Some)?$/,
    phrase: () => "the co-signer threshold"
  },
  { pattern: /^state\.intended_stake_credential$/, phrase: () => "the staking choice" },
  { pattern: /^state\.last_non_admin_payout_at$/, phrase: () => "the last payout time" },

  // People. The datum calls the list `users`; it holds owners and spenders alike, so the
  // word that covers both is the one the People editor already uses.
  { pattern: /^state\.users$/, phrase: () => "the list of people" },
  {
    pattern: /^state\.users\[(\d+)\]\.user_wallets(\[\d+\])?$/,
    phrase: (m) => `person ${humanIndex(m[1]!)}'s wallet IDs`
  },
  {
    pattern: /^state\.users\[(\d+)\]\.per_day_allowance.*$/,
    phrase: (m) => `person ${humanIndex(m[1]!)}'s daily limit`
  },
  {
    pattern: /^state\.users\[(\d+)\]\.remaining_allowance.*$/,
    phrase: (m) => `person ${humanIndex(m[1]!)}'s remaining allowance`
  },
  {
    pattern: /^state\.users\[(\d+)\]\.is_admin$/,
    phrase: (m) => `whether person ${humanIndex(m[1]!)} is an owner`
  },
  {
    pattern: /^state\.users\[(\d+)\]\.multi_sig_power$/,
    phrase: (m) => `person ${humanIndex(m[1]!)}'s approval power`
  },
  {
    pattern: /^state\.users\[(\d+)\]\.id$/,
    phrase: (m) => `person ${humanIndex(m[1]!)}'s id`
  },
  { pattern: /^state\.users\[(\d+)\]$/, phrase: (m) => `person ${humanIndex(m[1]!)}` },

  // Recovery contacts.
  { pattern: /^state\.beneficiaries$/, phrase: () => "the list of recovery contacts" },
  {
    pattern: /^state\.beneficiaries\[(\d+)\]\.beneficiary_wallets(\[\d+\])?$/,
    phrase: (m) => `recovery contact ${humanIndex(m[1]!)}'s wallet IDs`
  },
  {
    pattern: /^state\.beneficiaries\[(\d+)\]\.unlock_after.*$/,
    phrase: (m) => `recovery contact ${humanIndex(m[1]!)}'s unlock time`
  },
  {
    pattern: /^state\.beneficiaries\[(\d+)\]\.id$/,
    phrase: (m) => `recovery contact ${humanIndex(m[1]!)}'s id`
  },
  {
    pattern: /^state\.beneficiaries\[(\d+)\]$/,
    phrase: (m) => `recovery contact ${humanIndex(m[1]!)}`
  },

  // Scheduled payments.
  { pattern: /^state\.streamingPayments$/, phrase: () => "the list of scheduled payments" },
  {
    pattern: /^state\.streamingPayments\[(\d+)\]\.(\w+).*$/,
    phrase: (m) => `scheduled payment ${humanIndex(m[1]!)}'s ${m[2]!.replace(/_/g, " ")}`
  },
  {
    pattern: /^state\.streamingPayments\[(\d+)\]$/,
    phrase: (m) => `scheduled payment ${humanIndex(m[1]!)}`
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
  [/beneficiary[_ ]wallets/gi, "wallet IDs"],
  [/\buser[_ ]wallets\b/gi, "wallet IDs"]
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
