// Typed adapter for `@meshsdk/core-cst`.
//
// Why this module exists: under the project's typed-linting setup
// (`moduleResolution: "bundler"` + @typescript-eslint's `no-unsafe-*` rules),
// the CST object types exported by `@meshsdk/core-cst` resolve to TypeScript's
// internal unresolved `error` type. Every chained call on a CST value
// (`deserializeTx(...).body().scriptDataHash()`, etc.) then trips
// `no-unsafe-call` / `no-unsafe-member-access` / `no-unsafe-assignment`. `tsc`
// resolves the same types fine — this is a typed-lint-only gap, and whether it
// fires shifts with the resolved dependency graph (a dependency bump can flip it
// on). See memory `frontend-lint-fragility`.
//
// Rather than scatter casts or rule-disables across every consumer, we contain
// the boundary HERE: declare the minimal shapes the app actually consumes, import
// the runtime symbols once, and re-export them with explicit types laundered
// through `unknown`. Consumers (`transactions/internals/script-data`,
// `transactions/submit`, `proposals/assemble`, `proposals/verify`) import from
// this module and get concrete, safe types — no per-line disables anywhere.

import {
  CborWriter as CborWriterRuntime,
  CostModel as CostModelRuntime,
  Costmdls as CostmdlsRuntime,
  Hash32ByteBase16 as Hash32ByteBase16Runtime,
  addVKeyWitnessSetToTransaction as addVKeyWitnessSetToTransactionRuntime,
  deserializeTx as deserializeTxRuntime
} from "@meshsdk/core-cst";

// --- minimal CST shapes (only the surface the app uses) ---

/** A CST value that knows how to report its size and serialize to CBOR hex. */
export interface CstSized {
  size(): number;
  toCbor(): string;
}

/** Anything with a `.toString()` — CST hashes, coins, ids, addresses-as-bech32. */
export interface CstStringable {
  toString(): string;
}

export interface CstTransactionBody {
  scriptDataHash(): CstStringable | undefined;
  setScriptDataHash(hash: Hash32ByteBase16): void;
  inputs(): unknown;
  outputs(): unknown;
  fee(): CstStringable;
}

export interface CstWitnessSet {
  redeemers(): CstSized | undefined;
  plutusData(): CstSized | undefined;
  plutusV1Scripts(): CstSized | undefined;
  plutusV2Scripts(): CstSized | undefined;
  plutusV3Scripts(): CstSized | undefined;
  toCbor(): string;
}

export interface CstTransaction {
  body(): CstTransactionBody;
  witnessSet(): CstWitnessSet;
  setBody(body: CstTransactionBody): void;
  toCbor(): string;
}

export interface CstTransactionInput {
  transactionId(): CstStringable;
  index(): bigint | number;
}

export interface CstMultiasset {
  entries(): Iterable<[CstStringable, CstStringable]>;
}

export interface CstValue {
  multiasset(): CstMultiasset | undefined;
  coin(): CstStringable;
}

export interface CstTransactionOutput {
  amount(): CstValue;
  address(): { toBech32(): CstStringable };
  datum(): { asInlineData?: () => unknown } | undefined;
}

// --- cost-model / hashing surface (script-data hash recomputation) ---

/** Opaque handle for a per-language cost model entry. */
export type CstCostModel = { readonly __cstCostModel: unique symbol };

export interface Costmdls {
  insert(model: CstCostModel): void;
  languageViewsEncoding(): string;
}

export interface CstCborWriter {
  writeEncodedValue(bytes: Uint8Array): void;
  encode(): Uint8Array;
}

/** Branded 32-byte hex hash — replaces the (unresolvable) CST `Hash32ByteBase16`. */
export type Hash32ByteBase16 = string & { readonly __hash32ByteBase16: unique symbol };

// --- laundered runtime re-exports (the single error->typed boundary) ---

export const deserializeTx = deserializeTxRuntime as unknown as (
  txHex: string
) => CstTransaction;

export const addVKeyWitnessSetToTransaction =
  addVKeyWitnessSetToTransactionRuntime as unknown as (
    txHex: string,
    witnessSetHex: string
  ) => string;

export const CborWriter = CborWriterRuntime as unknown as new () => CstCborWriter;

export const Costmdls = CostmdlsRuntime as unknown as new () => Costmdls;

export const CostModel = CostModelRuntime as unknown as {
  newPlutusV1(costs: number[]): CstCostModel;
  newPlutusV2(costs: number[]): CstCostModel;
  newPlutusV3(costs: number[]): CstCostModel;
};

export const Hash32ByteBase16 = Hash32ByteBase16Runtime as unknown as (
  value: string
) => Hash32ByteBase16;
