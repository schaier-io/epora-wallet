import {
  applyParamsToScript,
  resolveScriptHash,
  resolvePlutusScriptAddress,
  type PlutusScript
} from "@meshsdk/core";
import blueprint from "@/lib/contracts/plutus.json";
import { composeWalletReceiveAddress } from "@/lib/contracts/payout-address";
import { readStateSections } from "@/lib/contracts/state-layout";
import { type ConstrData } from "@/lib/types/contracts";

const STT_TITLE = "stt.stt.spend";
const STT_REFERENCE_STORE_TITLE = "stt_reference_store.stt_reference_store.spend";
const WALLET_SPEND_TITLE = "wallet.wallet.spend";
const WALLET_WITHDRAW_TITLE = "wallet.wallet.withdraw";
const WALLET_PUBLISH_TITLE = "wallet.wallet.publish";
const WALLET_PROPOSE_TITLE = "wallet.wallet.propose";

type Validator = {
  title: string;
  compiledCode: string;
};

function getValidator(title: string): Validator {
  const validator = (blueprint.validators as Validator[]).find(
    (entry) => entry.title === title
  );

  if (!validator) {
    throw new Error(`Validator not found in blueprint: ${title}`);
  }

  return validator;
}

function getSttScript(): PlutusScript {
  const code = applyParamsToScript(getValidator(STT_TITLE).compiledCode, []);
  return { code, version: "V3" };
}

export function getSttMintScript(): PlutusScript {
  return getSttScript();
}

export function getSttMintPolicyId() {
  const script = getSttScript();
  return resolveScriptHash(script.code, script.version);
}

export function getSttSpendScript(): PlutusScript {
  return getSttScript();
}

function getSttReferenceStoreScript(): PlutusScript {
  const code = applyParamsToScript(
    getValidator(STT_REFERENCE_STORE_TITLE).compiledCode,
    []
  );

  return { code, version: "V3" };
}

export function resolveSttReferenceStoreAddress(): string {
  return resolveScriptAddress(getSttReferenceStoreScript());
}

export function getWalletSpendScript(params: {
  sttPolicyId: string;
  sttAssetNameHex: string;
}): PlutusScript {
  const code = applyParamsToScript(getValidator(WALLET_SPEND_TITLE).compiledCode, [
    params.sttPolicyId,
    params.sttAssetNameHex
  ]);

  return { code, version: "V3" };
}

export function resolveWalletSpendAddress(params: {
  sttPolicyId: string;
  sttAssetNameHex: string;
}): string {
  return resolveScriptAddress(getWalletSpendScript(params));
}

// The wallet's PAYMENT credential (script hash), independent of any stake part.
// Used to discover ALL wallet UTxOs by payment credential (e.g. via Koios
// `credential_utxos`), including Franken/orphan UTxOs at a non-intended stake
// credential that an address-based query would miss.
export function resolveWalletSpendScriptHash(params: {
  sttPolicyId: string;
  sttAssetNameHex: string;
}): string {
  const script = getWalletSpendScript(params);
  return resolveScriptHash(script.code, script.version);
}

// On-chain `intended_stake_credential` value that delegates to the wallet's OWN
// staking script. `wallet.wallet.{spend,withdraw,publish}` are one multi-purpose
// validator (identical hash), so the stake credential is the same parameterized
// script hash as the payment credential. Encoded as
// `Some(Credential::Script(walletScriptHash))`:
//   Option::Some        = Constr 0 [ Credential ]
//   Credential::Script  = Constr 1 [ hash ]
export function resolveWalletStakeScriptCredentialData(params: {
  sttPolicyId: string;
  sttAssetNameHex: string;
}): ConstrData {
  const hash = resolveWalletSpendScriptHash(params);
  return {
    alternative: 0,
    fields: [{ alternative: 1, fields: [hash] }]
  };
}

// `Option::None` — the enterprise address (no delegation), the current default.
export const INTENDED_STAKE_CREDENTIAL_NONE_DATA: ConstrData = {
  alternative: 1,
  fields: []
};

// The address a continuing wallet output MUST use, given the State datum's
// `intended_stake_credential`. `None` → the enterprise address, returned via the
// exact historical `resolveWalletSpendAddress` so existing (None) wallets are
// byte-identical. `Some(cred)` → the base/staking address. Falls back to the
// enterprise address if a credential can't be composed, so an output address is
// always derivable.
export function resolveWalletContinuingOutputAddress(params: {
  sttPolicyId: string;
  sttAssetNameHex: string;
  intendedStakeCredential: unknown;
}): string {
  const enterprise = resolveWalletSpendAddress({
    sttPolicyId: params.sttPolicyId,
    sttAssetNameHex: params.sttAssetNameHex
  });
  const cred = params.intendedStakeCredential as { alternative?: number } | null | undefined;
  // None (Constr 1) or anything non-Some → enterprise, exactly as before.
  if (!cred || typeof cred !== "object" || cred.alternative !== 0) {
    return enterprise;
  }
  return (
    composeWalletReceiveAddress(resolveWalletSpendScriptHash(params), cred) ?? enterprise
  );
}

// Convenience for the off-chain builders: derive the address a continuing wallet
// output must use directly from the (validated) State datum the tx carries, so
// the funds always follow the State's `intended_stake_credential`. Falls back to
// the exact historical enterprise address on any decode error, so a `None` (or
// malformed) datum is byte-identical to the legacy `resolveWalletSpendAddress`
// and existing wallets are never moved.
export function resolveWalletContinuingOutputAddressFromState(params: {
  sttPolicyId: string;
  sttAssetNameHex: string;
  stateDatum: unknown;
}): string {
  let intendedStakeCredential: unknown = INTENDED_STAKE_CREDENTIAL_NONE_DATA;
  try {
    if (params.stateDatum && typeof params.stateDatum === "object") {
      intendedStakeCredential = readStateSections(
        params.stateDatum as ConstrData
      ).intendedStakeCredential;
    }
  } catch {
    intendedStakeCredential = INTENDED_STAKE_CREDENTIAL_NONE_DATA;
  }
  return resolveWalletContinuingOutputAddress({
    sttPolicyId: params.sttPolicyId,
    sttAssetNameHex: params.sttAssetNameHex,
    intendedStakeCredential
  });
}

export function getWalletWithdrawScript(params: {
  sttPolicyId: string;
  sttAssetNameHex: string;
}): PlutusScript {
  const code = applyParamsToScript(
    getValidator(WALLET_WITHDRAW_TITLE).compiledCode,
    [params.sttPolicyId, params.sttAssetNameHex]
  );

  return { code, version: "V3" };
}

export function getWalletPublishScript(params: {
  sttPolicyId: string;
  sttAssetNameHex: string;
}): PlutusScript {
  const code = applyParamsToScript(
    getValidator(WALLET_PUBLISH_TITLE).compiledCode,
    [params.sttPolicyId, params.sttAssetNameHex]
  );

  return { code, version: "V3" };
}

export function getWalletProposeScript(params: {
  sttPolicyId: string;
  sttAssetNameHex: string;
}): PlutusScript {
  const code = applyParamsToScript(
    getValidator(WALLET_PROPOSE_TITLE).compiledCode,
    [params.sttPolicyId, params.sttAssetNameHex]
  );

  return { code, version: "V3" };
}

export function resolveScriptAddress(script: PlutusScript): string {
  return resolvePlutusScriptAddress(script, 0);
}
