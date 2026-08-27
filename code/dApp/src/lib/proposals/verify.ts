import { stateFormFromDatum, type StateFormState } from "@/lib/contracts/state-form";
import { validateStateDatum } from "@/lib/contracts/state-validation";
import { decodeConstrDatumFromUtxo } from "@/lib/mesh/transactions/internals";
import { ServerFetcher } from "@/lib/mesh/server-fetcher";
import { deserializeTx, type CstTransactionInput, type CstTransactionOutput } from "@/lib/mesh/cst";
import { parseProposalBuildContext } from "./client";
import { resolveProposalBodyHash } from "./serialization";
import { assertProposalWalletBinding } from "./validation";
import { validateVKeyWitnessSet } from "./witness-validation";
import { proposalCopy } from "./copy";
import type {
  ProposalAuthorityPath,
  ProposalBuildContext,
  ProposalDetailDto,
  ProposalEffect,
  ProposalInputRef,
  ProposalOutputView,
  ProposalVerification,
  SignerSatisfaction
} from "./types";

// Local, trust-minimized verification. Everything a signer relies on is derived
// from the transaction bytes and live chain state — never from the proposer's
// claimed summary. The flow: decode the tx → confirm its inputs are still
// unspent → read the consumed wallet state to learn the required signers →
// compute whether the collected witnesses satisfy the rule.

const MAX_INPUTS_CHECKED = 16;

export type ProposalVerificationChecks = {
  bodyHashMatches: boolean;
  transactionDecoded: boolean;
  inputsFullyChecked: boolean;
  allInputsLive: boolean;
  stateInputBound: boolean;
  signerStateResolved: boolean;
  signaturesValid: boolean;
};

export function determineProposalValidity(
  checks: ProposalVerificationChecks
): "valid" | "invalid" {
  return Object.values(checks).every(Boolean) ? "valid" : "invalid";
}

function lower(value: string): string {
  return value.trim().toLowerCase();
}

function refKey(txHash: string, index: number): string {
  return `${lower(txHash)}#${index}`;
}

// `.outputs()` returns a plain array; `.inputs()` returns a CborSet whose typed
// shape varies. Normalize at runtime: prefer `.values()`, else assume an array.
function toArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) {
    return value as T[];
  }
  const candidate = value as { values?: () => T[] };
  return typeof candidate.values === "function" ? candidate.values() : [];
}

function extractSttInputRef(
  buildContext: ProposalBuildContext | null
): { txHash: string; index: number } | null {
  if (!buildContext) {
    return null;
  }
  const input = buildContext.input as { sttInputTxHash?: string; sttInputOutputIndex?: number };
  if (typeof input.sttInputTxHash === "string" && input.sttInputTxHash.length > 0) {
    return { txHash: input.sttInputTxHash, index: input.sttInputOutputIndex ?? 0 };
  }
  return null;
}

function decodeEffect(txHex: string): ProposalEffect {
  try {
    const body = deserializeTx(txHex).body();
    const inputs: ProposalInputRef[] = toArray<CstTransactionInput>(body.inputs()).map((input) => ({
      txHash: input.transactionId().toString(),
      outputIndex: Number(input.index()),
      live: null,
      isSttState: false
    }));

    const outputs: ProposalOutputView[] = toArray<CstTransactionOutput>(body.outputs()).map((output) => {
      const value = output.amount();
      const multiasset = value.multiasset();
      const assets = multiasset
        ? Array.from(multiasset.entries()).map(([unit, quantity]) => ({
            unit: unit.toString(),
            quantity: quantity.toString()
          }))
        : [];
      return {
        address: output.address().toBech32().toString(),
        lovelace: value.coin().toString(),
        assets,
        hasInlineDatum: Boolean(output.datum()?.asInlineData?.())
      };
    });

    return { inputs, outputs, feeLovelace: body.fee().toString() };
  } catch {
    return {
      inputs: [],
      outputs: [],
      feeLovelace: null,
      decodeError: proposalCopy.couldNotDecodeTransaction()
    };
  }
}

// Resolves each input's address, then checks it against that address's current
// UTxO set. An input missing from its address's live set has been spent — the
// classic reason a saved proposal becomes invalid.
async function checkInputLiveness(
  fetcher: ServerFetcher,
  inputs: ProposalInputRef[]
): Promise<{ reasons: string[]; complete: boolean }> {
  const reasons: string[] = [];
  const checked = inputs.slice(0, MAX_INPUTS_CHECKED);
  let complete = inputs.length > 0 && inputs.length <= MAX_INPUTS_CHECKED;
  if (inputs.length > checked.length) {
    reasons.push(proposalCopy.checkedInputLimit(MAX_INPUTS_CHECKED, inputs.length));
  }

  // Resolve ref → address.
  const addressByRef = new Map<string, string | null>();
  await Promise.all(
    checked.map(async (input) => {
      const key = refKey(input.txHash, input.outputIndex);
      try {
        const utxos = await fetcher.fetchUTxOs(input.txHash, input.outputIndex);
        addressByRef.set(key, utxos[0]?.output.address ?? null);
      } catch {
        addressByRef.set(key, null);
      }
    })
  );

  // Build a live ref-set per unique address.
  const uniqueAddresses = Array.from(new Set([...addressByRef.values()].filter(Boolean))) as string[];
  const liveByAddress = new Map<string, Set<string>>();
  await Promise.all(
    uniqueAddresses.map(async (address) => {
      try {
        const utxos = await fetcher.fetchAddressUTxOs(address);
        liveByAddress.set(
          address,
          new Set(utxos.map((utxo) => refKey(utxo.input.txHash, utxo.input.outputIndex)))
        );
      } catch {
        // Leave unset → treated as "unknown" below.
      }
    })
  );

  for (const input of checked) {
    const key = refKey(input.txHash, input.outputIndex);
    const address = addressByRef.get(key) ?? null;
    if (!address) {
      input.live = null;
      complete = false;
      reasons.push(proposalCopy.couldNotConfirmInput(`${key.slice(0, 16)}…`));
      continue;
    }
    const liveSet = liveByAddress.get(address);
    if (!liveSet) {
      input.live = null;
      complete = false;
      reasons.push(proposalCopy.couldNotConfirmInput(`${key.slice(0, 16)}…`));
    } else if (!liveSet.has(key)) {
      input.live = false;
      reasons.push(proposalCopy.inputSpent(`${key.slice(0, 12)}…`));
    } else {
      input.live = true;
    }
  }

  return { reasons, complete };
}

// Exported for direct unit testing: this is the security-critical rule that
// decides whether the collected witnesses satisfy the wallet's admin/multisig
// authority. `verifyProposal` reaches it only after network resolution, so the
// rule itself is tested in isolation.
export function computeSignerSatisfaction(
  stateForm: StateFormState,
  authorityPath: ProposalAuthorityPath,
  signedKeyHashes: string[]
): SignerSatisfaction {
  const signed = new Set(signedKeyHashes.map(lower));
  const userSigned = (wallets: string[]) => wallets.some((wallet) => signed.has(lower(wallet)));

  if (authorityPath === "admin") {
    const admins = stateForm.users.filter((user) => user.isAdmin);
    const requiredSigners = admins.flatMap((user) =>
      user.wallets.map((wallet) => ({ keyHash: lower(wallet), power: 1, isAdmin: true }))
    );
    const satisfied = admins.some((user) => userSigned(user.wallets));
    return {
      authorityPath,
      requiredSigners,
      signedKeyHashes: signedKeyHashes.map(lower),
      satisfiedPower: satisfied ? 1 : 0,
      threshold: null,
      satisfied
    };
  }

  const powerUsers = stateForm.users.filter(
    (user) => user.multiSigPowerMode === "some" && Number(user.multiSigPower) > 0
  );
  const requiredSigners = powerUsers.flatMap((user) =>
    user.wallets.map((wallet) => ({
      keyHash: lower(wallet),
      power: Number(user.multiSigPower),
      isAdmin: user.isAdmin
    }))
  );
  const threshold =
    stateForm.multiSigThresholdMode === "some" ? Number(stateForm.multiSigThreshold) : null;
  // Power is per user record (deduped), not per signed wallet.
  let satisfiedPower = 0;
  for (const user of powerUsers) {
    if (userSigned(user.wallets)) {
      satisfiedPower += Number(user.multiSigPower);
    }
  }
  return {
    authorityPath,
    requiredSigners,
    signedKeyHashes: signedKeyHashes.map(lower),
    satisfiedPower,
    threshold,
    satisfied: threshold != null && satisfiedPower >= threshold
  };
}

async function deriveSigners(
  fetcher: ServerFetcher,
  proposal: ProposalDetailDto,
  buildContext: ProposalBuildContext | null,
  signedKeyHashes: string[]
): Promise<{ signers: SignerSatisfaction | null; walletAssetBound: boolean }> {
  const sttRef = extractSttInputRef(buildContext);
  if (!sttRef) {
    return { signers: null, walletAssetBound: false };
  }
  try {
    const utxos = await fetcher.fetchUTxOs(sttRef.txHash, sttRef.index);
    const utxo = utxos[0];
    if (!utxo) {
      return { signers: null, walletAssetBound: false };
    }
    const walletAssetBound = utxo.output.amount.some(
      (asset) =>
        lower(asset.unit) === lower(proposal.walletUnit) && BigInt(asset.quantity) === 1n
    );
    if (!walletAssetBound) {
      return { signers: null, walletAssetBound: false };
    }
    const datum = decodeConstrDatumFromUtxo(utxo);
    if (!datum || validateStateDatum(datum).length > 0) {
      return { signers: null, walletAssetBound: true };
    }
    const stateForm = stateFormFromDatum(datum);
    return {
      signers: computeSignerSatisfaction(stateForm, proposal.authorityPath, signedKeyHashes),
      walletAssetBound: true
    };
  } catch {
    return { signers: null, walletAssetBound: false };
  }
}

export async function verifyProposal(proposal: ProposalDetailDto): Promise<ProposalVerification> {
  const fetcher = new ServerFetcher();
  const buildContext = parseProposalBuildContext(proposal);
  const effect = decodeEffect(proposal.unsignedTxHex);
  const reasons: string[] = [];

  // Tie the stored body hash to the actual bytes — a mismatch means the record
  // was tampered with or corrupted.
  let bodyHashMatches = false;
  try {
    bodyHashMatches = resolveProposalBodyHash(proposal.unsignedTxHex) === proposal.txBodyHash;
  } catch {
    bodyHashMatches = false;
  }
  if (!bodyHashMatches) {
    reasons.push(proposalCopy.storedBodyHashMismatch());
  }

  if (effect.decodeError) {
    reasons.push(effect.decodeError);
  }

  // Mark the STT state input so the UI can highlight the moving part.
  const sttRef = extractSttInputRef(buildContext);
  let stateInputBound = false;
  if (sttRef) {
    const target = refKey(sttRef.txHash, sttRef.index);
    for (const input of effect.inputs) {
      if (refKey(input.txHash, input.outputIndex) === target) {
        input.isSttState = true;
        stateInputBound = true;
      }
    }
  }
  if (!stateInputBound) {
    reasons.push(proposalCopy.stateInputNotConsumed());
  }

  try {
    if (!buildContext) {
      throw new Error("missing context");
    }
    assertProposalWalletBinding({
      walletUnit: proposal.walletUnit,
      walletPolicyId: proposal.walletPolicyId,
      builder: buildContext.builder,
      buildContext
    });
  } catch {
    stateInputBound = false;
    reasons.push(proposalCopy.walletIdentityMismatch());
  }

  let inputsFullyChecked = false;
  if (effect.inputs.length > 0) {
    const liveness = await checkInputLiveness(fetcher, effect.inputs);
    reasons.push(...liveness.reasons);
    inputsFullyChecked = liveness.complete;
  } else {
    reasons.push(proposalCopy.noInputsVerified());
  }

  const currentSignatures = proposal.signatures.filter((signature) => signature.current);
  const signedKeyHashes: string[] = [];
  let signaturesValid = true;
  for (const signature of currentSignatures) {
    try {
      validateVKeyWitnessSet({
        witnessSetHex: signature.witnessSetHex,
        txBodyHash: proposal.txBodyHash,
        signerKeyHash: signature.signerKeyHash
      });
      signedKeyHashes.push(signature.signerKeyHash);
    } catch {
      signaturesValid = false;
      reasons.push(proposalCopy.invalidStoredWitness(`${signature.signerKeyHash.slice(0, 12)}…`));
    }
  }
  const signerResolution = stateInputBound
    ? await deriveSigners(fetcher, proposal, buildContext, signedKeyHashes)
    : { signers: null, walletAssetBound: false };
  if (!signerResolution.walletAssetBound) {
    stateInputBound = false;
    reasons.push(proposalCopy.stateTokenMissing());
  }
  if (!signerResolution.signers) {
    reasons.push(proposalCopy.signersUnresolved());
  }

  const validity = determineProposalValidity({
    bodyHashMatches,
    transactionDecoded: !effect.decodeError,
    inputsFullyChecked,
    allInputsLive: effect.inputs.length > 0 && effect.inputs.every((input) => input.live === true),
    stateInputBound,
    signerStateResolved: signerResolution.signers !== null,
    signaturesValid
  });

  return { validity, reasons, effect, signers: signerResolution.signers, bodyHashMatches };
}
