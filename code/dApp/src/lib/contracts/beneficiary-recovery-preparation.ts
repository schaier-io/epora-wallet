import type { Protocol } from "@meshsdk/common";
import { TransactionOutput, toCardanoAddress, toValue } from "@meshsdk/core-cst";
import type { Asset, ConstrData, WalletScriptOutput } from "@/lib/types/contracts";
import { calculateMinimumLovelaceForOutput } from "@/lib/mesh/transactions/internals/value";
import { UTXO_SIZE_OVERHEAD_BYTES } from "@/lib/mesh/transactions/internals/constants";
import { readStateSections } from "./state-layout";
import { deriveBeneficiaryWithdrawalId } from "./beneficiary-identity";
import { readInteger, readOptionalInteger } from "./plutus-primitives";
import { validateStateDatum } from "./state-validation";
import { unwrapStateDatum } from "./stt-datum";
import { parseValueData, partsToUnit, serializeAssetsToValueData } from "./value-data";
export type BeneficiaryRecoveryPreparationPlan = {
  quantum: bigint;
  pool: Asset[] | null;
  remainder: Asset[];
  walletOutputs: WalletScriptOutput[];
  minimumPoolLovelace: bigint;
  minimumRemainderLovelace: bigint;
  poolLovelaceShortfall: bigint;
  remainderLovelaceShortfall: bigint;
  /** Additional wallet ADA needed after allowing reallocation between the two outputs. */
  depositShortfall: bigint;
  isReady: boolean;
  suggestedPoolLovelace: bigint | null;
};
function gcd(left: bigint, right: bigint): bigint {
  while (right !== 0n)
    [left, right] = [right, left % right];
  return left;
}
function roundUp(amount: bigint, quantum: bigint): bigint {
  return (amount + quantum - 1n) / quantum * quantum;
}
function positive(amount: bigint): bigint {
  return amount > 0n ? amount : 0n;
}
function normalize(amount: Asset[]): Asset[] {
  return parseValueData(serializeAssetsToValueData(amount), "Preparation value")
    .filter(entry => entry.amount > 0n)
    .map(entry => ({
      unit: partsToUnit(entry.policyId, entry.assetName),
      quantity: String(entry.amount)
    }));
}
function lovelace(amount: Asset[]): bigint {
  return BigInt(amount.find(asset => asset.unit === "lovelace")?.quantity ?? "0");
}
/** Use the shared SDK size calculation and check the actual coin-width encoding too. */
function minimumAda(address: string, amount: Asset[], protocolParams: Protocol, quantum = 1n): bigint {
  const native = amount.filter(asset => asset.unit !== "lovelace");
  let minimum = roundUp(calculateMinimumLovelaceForOutput({
    address,
    amount
  }, protocolParams), quantum);
  // A uint64 coin has at most three wider CBOR integer representations above a small initial estimate.
  for (let pass = 0; pass < 3; pass += 1) {
    const coin = lovelace(amount) > minimum ? lovelace(amount) : minimum;
    const encoded = new TransactionOutput(toCardanoAddress(address), toValue([
      {
        unit: "lovelace",
        quantity: String(coin)
      },
      ...native
    ]));
    const actual = BigInt(UTXO_SIZE_OVERHEAD_BYTES + String(encoded.toCbor()).length / 2) * BigInt(protocolParams.coinsPerUtxoSize);
    if (actual <= minimum) {
      return minimum;
    }
    minimum = roundUp(actual, quantum);
  }
  throw new Error("Preparation minimum ADA did not stabilize. Check the protocol parameters and output quantities.");
}
/** Selected value is conserved. Empty pool intent merges; an explicit pool leaves an immutable remainder. */
export function planBeneficiaryRecoveryPreparation(input: {
  stateDatum: ConstrData;
  selectedAmount: Asset[];
  poolAssets: Asset[];
  walletAddress: string;
  protocolParams: Protocol;
}): BeneficiaryRecoveryPreparationPlan {
  const state = unwrapStateDatum(input.stateDatum, "Preparation State");
  const errors = validateStateDatum(state);
  if (errors.length) {
    throw new Error(errors[0]);
  }
  if (!Number.isSafeInteger(input.protocolParams.coinsPerUtxoSize) || input.protocolParams.coinsPerUtxoSize <= 0) {
    throw new Error("Preparation requires live, positive minimum-ADA protocol parameters.");
  }
  const beneficiaries = readStateSections(state).beneficiaries as ConstrData[];
  if (!beneficiaries.length) {
    throw new Error("Preparation requires at least one registered beneficiary.");
  }
  const weights = beneficiaries.map(record => BigInt(readInteger(record.fields[3]!, "Beneficiary weight")));
  const quantum = weights.reduce((sum, weight) => sum + weight, 0n) / weights.reduce(gcd);
  const selected = normalize(input.selectedAmount);
  if (!selected.length) {
    throw new Error("Preparation requires nonempty selected wallet value.");
  }
  const totalAda = lovelace(selected);
  if (input.poolAssets.length === 0) {
    const minimum = minimumAda(input.walletAddress, selected, input.protocolParams);
    const shortfall = positive(minimum - totalAda);
    return {
      quantum,
      pool: null,
      remainder: selected,
      walletOutputs: [{ amount: selected }],
      minimumPoolLovelace: 0n,
      minimumRemainderLovelace: minimum,
      poolLovelaceShortfall: 0n,
      remainderLovelaceShortfall: shortfall,
      depositShortfall: shortfall,
      isReady: shortfall === 0n,
      suggestedPoolLovelace: null
    };
  }
  const pool = normalize(input.poolAssets);
  if (!pool.length) {
    throw new Error("A requested clean pool must contain a positive asset quantity.");
  }
  const remaining = new Map(selected.map(asset => [asset.unit, BigInt(asset.quantity)]));
  for (const asset of pool) {
    const quantity = BigInt(asset.quantity);
    if (quantity % quantum !== 0n) {
      throw new Error(`Clean pool quantity for ${asset.unit} must be a multiple of ${quantum}.`);
    }
    const available = remaining.get(asset.unit) ?? 0n;
    if (quantity > available) {
      throw new Error(`Clean pool quantity for ${asset.unit} exceeds the selected wallet value.`);
    }
    remaining.set(asset.unit, available - quantity);
  }
  const remainder = [...remaining].filter(([, quantity]) => quantity > 0n)
    .map(([unit, quantity]) => ({
      unit,
      quantity: String(quantity)
    }));
  const minimumPoolLovelace = minimumAda(input.walletAddress, pool, input.protocolParams, quantum);
  const minimumRemainderLovelace = remainder.length
    ? minimumAda(input.walletAddress, remainder, input.protocolParams) : 0n;
  const poolLovelaceShortfall = positive(minimumPoolLovelace - lovelace(pool));
  const remainderLovelaceShortfall = positive(minimumRemainderLovelace - lovelace(remainder));
  const nativeRemainder = remainder.some(asset => asset.unit !== "lovelace");
  const possibleRemainderMinimum = nativeRemainder ? minimumRemainderLovelace
    : minimumAda(input.walletAddress, [], input.protocolParams);
  let depositShortfall = positive(minimumPoolLovelace + possibleRemainderMinimum - totalAda);
  if (!nativeRemainder) {
    const fullPoolShortfall = roundUp(totalAda > minimumPoolLovelace ? totalAda : minimumPoolLovelace, quantum) - totalAda;
    if (fullPoolShortfall < depositShortfall) {
      depositShortfall = fullPoolShortfall;
    }
  }
  const suggestedPoolLovelace = depositShortfall > 0n ? null
    : !nativeRemainder && totalAda % quantum === 0n ? totalAda : minimumPoolLovelace;
  return {
    quantum,
    pool,
    remainder,
    walletOutputs: [{ amount: pool }, ...remainder.length ? [{ amount: remainder }] : []],
    minimumPoolLovelace,
    minimumRemainderLovelace,
    poolLovelaceShortfall,
    remainderLovelaceShortfall,
    depositShortfall,
    suggestedPoolLovelace,
    isReady: poolLovelaceShortfall === 0n && remainderLovelaceShortfall === 0n
  };
}
/** Consolidation requires the connected beneficiary to be unlocked, without a cadence change. */
export function assertBeneficiaryPreparationAuthority(stateDatum: ConstrData, signerKeyHash: string, txEarliestTimeMs: number) {
  const state = unwrapStateDatum(stateDatum, "Preparation State");
  const beneficiaryId = deriveBeneficiaryWithdrawalId(state, signerKeyHash);
  const sections = readStateSections(state);
  const beneficiary = (sections.beneficiaries as ConstrData[]).find(record => BigInt(readInteger(record.fields[0]!, "Beneficiary id")) === BigInt(beneficiaryId))!;
  const global = readOptionalInteger(sections.unlockTime, "Proof of life unlock time");
  const personal = readOptionalInteger(beneficiary.fields[2]!, "Beneficiary unlock after");
  if (!Number.isSafeInteger(txEarliestTimeMs) || txEarliestTimeMs < 0 || global === null ||
    BigInt(txEarliestTimeMs) < BigInt(global) || personal !== null && BigInt(txEarliestTimeMs) < BigInt(personal)) {
    throw new Error("Recovery preparation requires an unlocked connected beneficiary at the transaction's earliest time.");
  }
  return beneficiaryId;
}
