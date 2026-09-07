#!/usr/bin/env node
// Exact phase-two budget gate for two Mesh-built transaction fixtures.
//
// One fixture is a partial streaming payout near the transaction-size limit.
// The other is a representative one-input-to-two-output Consolidation escape.
// Both reach the user, combined-access, wallet, allowance, and stream caps. They
// use high-width uint64 values while keeping action times valid. Aiken's
// native transaction simulator executes both compiled validators from each exact
// Mesh transaction. This gate does not attest other transaction shapes.
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const dAppRoot = join(projectRoot, "..", "dApp");
const fixtureDirectory = join(projectRoot, "fixtures", "entrypoint-budget");
const manifestPath = join(fixtureDirectory, "manifest.json");
const blueprintPath = join(projectRoot, "plutus.json");
const dAppBlueprintPath = join(dAppRoot, "src", "lib", "contracts", "plutus.json");
const generatorPath = join(dAppRoot, "scripts", "build-entrypoint-budget-fixture.ts");
const update = process.argv.includes("--update");
const checkGenerated = process.argv.includes("--check-generated");
const generationOnly = checkGenerated && !update;

const PAYOUT_CBOR_FILES = ["transaction.cbor", "inputs.cbor", "outputs.cbor"];
const CONSOLIDATION_CBOR_FILES = [
  "consolidation-transaction.cbor",
  "consolidation-inputs.cbor",
  "consolidation-outputs.cbor"
];
const GENERATED_FILES = [
  ...PAYOUT_CBOR_FILES,
  "source.json",
  ...CONSOLIDATION_CBOR_FILES,
  "consolidation-source.json"
];
const SLOT_CONFIG = {
  zeroTime: 1_655_769_600_000,
  zeroSlot: 86_400,
  slotLength: 1_000
};
const EXPECTED_RESULT_COUNT = 2;
const MEMORY_CEILING = 14_000_000;
const CPU_CEILING = 9_000_000_000;
const FIXTURE_TRANSACTION_SIZE_FLOOR_BYTES = 16_000;
const FIXTURE_SIGNED_TRANSACTION_SIZE_CEILING_BYTES = 16_384;
// The generator pins one crank/funding/collateral key. Adding its vkey witness
// with Mesh's Conway serializer adds 106 bytes, including the CBOR set tag.
const FIXTURE_VKEY_WITNESS_BYTES = 106;
const FIXTURE_UNSIGNED_TRANSACTION_SIZE_CEILING_BYTES =
  FIXTURE_SIGNED_TRANSACTION_SIZE_CEILING_BYTES - FIXTURE_VKEY_WITNESS_BYTES;
const FIXTURE_NATIVE_ASSET_FLOOR = 120;
const FIXTURE_WALLET_VALUE_SIZE_FLOOR_BYTES = 128;
const FIXTURE_STATE_DATUM_SIZE_FLOOR_BYTES = 5_000;
const REQUIRED_WALLET_VALUE_CBOR_SHA256 =
  "257d4b76ca030ad8d7118feec1ce074e859b1337657ada2a7c53844c9bbb564f";
const REQUIRED_STATE_DATUM_CBOR_SHA256 =
  "3a8b6dcc1591feb9362877aa78b71c9e52679f28529971f53b5193af1df82b26";
const REQUIRED_FIXTURE_SCENARIO =
  "capped-list-and-scalar-near-transaction-limit-partial-streaming-payout";
const REQUIRED_STATE_SHAPE = {
  users: 10,
  userWallets: 15,
  allowanceEntries: 15,
  beneficiaries: 5,
  beneficiaryWallets: 15,
  streamingPayments: 15
};
const REQUIRED_STRESS_PROFILE = {
  crankSignerMatchesStateUser: false,
  crankSignerMatchesBeneficiary: false,
  crankSignerStreamingPayeeIndexes: [14],
  targetStreamingPaymentIndex: 14,
  targetNativeAssetIndex: 144,
  payoutQuantity: "1"
};
const CONSOLIDATION_TRANSACTION_SIZE_FLOOR_BYTES = 10_000;
const CONSOLIDATION_NATIVE_ASSET_COUNT = 151;
const REQUIRED_CONSOLIDATION_WALLET_VALUE_CBOR_SHA256 =
  "812bbcef3c371a158efa709315e86a68241cfc84183c7514f5552147da2b9644";
const REQUIRED_CONSOLIDATION_STATE_DATUM_CBOR_SHA256 =
  "1be6ce49cc7daa22ddda8c410be4745cdbb6e325050d81f61cde8466aeef06c1";
const REQUIRED_CONSOLIDATION_SCENARIO =
  "capped-list-and-scalar-policy-deep-consolidation-repartition";
const REQUIRED_CONSOLIDATION_TRANSACTION_SHAPE = {
  inputs: 3,
  outputs: 4,
  referenceInputs: 2,
  collateralInputs: 1,
  walletInputs: 1,
  walletOutputs: 2,
  changeOutputs: 1
};
const REQUIRED_CONSOLIDATION_STRESS_PROFILE = {
  authorityPath: "admin",
  nativeAssetTopology: "151 policies with one empty-name asset each",
  intendedStakeCredential: "None"
};
const EXPECTED_SCRIPT_INPUTS = [
  { tag: "Spend", index: 0, script: "stt.stt.spend" },
  { tag: "Spend", index: 1, script: "wallet.wallet.spend" }
];

function fail(message) {
  console.error(`check-entrypoint-budget: ${message}`);
  process.exit(1);
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024
  });
  if (result.error) {
    fail(`failed to run ${command}: ${result.error.message}`);
  }
  if (result.status !== 0) {
    process.stderr.write(result.stderr ?? "");
    process.stdout.write(result.stdout ?? "");
    fail(`${command} ${args.join(" ")} failed`);
  }
  return result;
}

function readJson(path, label) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    fail(`${label} is missing or unreadable: ${path}`);
  }
}

function sha256Bytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function sha256CborHex(path) {
  const hex = readFileSync(path, "utf8").trim();
  if (!/^(?:[0-9a-fA-F]{2})+$/.test(hex)) {
    fail(`${path} is not even-length hexadecimal CBOR`);
  }
  return sha256Bytes(Buffer.from(hex, "hex"));
}

function sha256CompiledCode(code, title) {
  if (typeof code !== "string" || !/^(?:[0-9a-fA-F]{2})+$/.test(code)) {
    fail(`${title} has invalid compiledCode in plutus.json`);
  }
  return sha256Bytes(Buffer.from(code, "hex"));
}

function exactJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function validateStaticManifest(manifest) {
  if (!exactJson(manifest.slotConfig, SLOT_CONFIG)) {
    fail("manifest slotConfig does not match the pinned preprod slot conversion");
  }
  if (manifest.expectedResultCount !== EXPECTED_RESULT_COUNT) {
    fail(`manifest expectedResultCount must equal ${EXPECTED_RESULT_COUNT}`);
  }
  if (!exactJson(manifest.scriptInputs, EXPECTED_SCRIPT_INPUTS)) {
    fail("manifest must document one STT Spend[0] and one wallet Spend[1]");
  }
}

function checkBlueprintFingerprints(manifest) {
  const blueprint = readJson(blueprintPath, "smart-contract blueprint");
  const validators = new Map(
    blueprint.validators.map((validator) => [validator.title, validator])
  );
  for (const title of ["stt.stt.spend", "wallet.wallet.spend"]) {
    const validator = validators.get(title);
    if (!validator) {
      fail(`compiled validator is missing from plutus.json: ${title}`);
    }
    const measured = sha256CompiledCode(validator.compiledCode, title);
    const accepted = manifest.blueprintCodeSha256?.[title];
    if (measured !== accepted) {
      fail(
        `${title} compiledCode fingerprint changed: ${accepted ?? "missing"} -> ${measured}. ` +
          "Review the compiled-code change and update manifest.json explicitly. " +
          "`pnpm budgets:update` never accepts a new script fingerprint."
      );
    }
  }
}

function checkBlueprintMirror() {
  const contractBlueprint = readFileSync(blueprintPath);
  const dAppBlueprint = readFileSync(dAppBlueprintPath);
  if (!contractBlueprint.equals(dAppBlueprint)) {
    fail(
      "dApp plutus.json is stale after `aiken build`. Run `pnpm sync`, then review the mirror diff."
    );
  }
}

function sourceFixtureMetadata(source) {
  const fixtureMetadata = {
    scenario: source.scenario,
    transactionBytes: source.transactionBytes,
    nativeAssetCount: source.nativeAssetCount,
    walletValueCborBytes: source.walletValueCborBytes,
    walletValueCborSha256: source.walletValueCborSha256,
    stateDatumCborBytes: source.stateDatumCborBytes,
    stateDatumCborSha256: source.stateDatumCborSha256,
    stateShape: source.stateShape,
    stressProfile: source.stressProfile,
    ...(source.transactionShape
      ? { transactionShape: source.transactionShape }
      : {})
  };
  return fixtureMetadata;
}

function validateGeneratedSource(
  source,
  manifest,
  manifestFixtureKey,
  checkFixtureMetadata = true
) {
  if (
    checkFixtureMetadata &&
    !exactJson(sourceFixtureMetadata(source), manifest[manifestFixtureKey])
  ) {
    fail(`${manifestFixtureKey} source metadata does not match manifest.json`);
  }
  if (!exactJson(source.walletParameters, manifest.walletParameters)) {
    fail("generated wallet parameters do not match the accepted manifest parameters");
  }
  for (const field of [
    "sttScriptHash",
    "walletScriptHash",
    "sttScriptCodeSha256",
    "walletScriptCodeSha256"
  ]) {
    if (source[field] !== manifest.appliedScripts?.[field]) {
      fail(
        `generated ${field} changed: ${manifest.appliedScripts?.[field] ?? "missing"} -> ${source[field] ?? "missing"}`
      );
    }
  }
  const documentedInputs = source.scriptInputs?.map(({ tag, index, script }) => ({
    tag,
    index,
    script
  }));
  if (!exactJson(documentedInputs, EXPECTED_SCRIPT_INPUTS)) {
    fail("generated transaction does not contain the expected STT and wallet Spend inputs");
  }
}

function validateFixtureRequirements(source) {
  if (source.scenario !== REQUIRED_FIXTURE_SCENARIO) {
    fail(`fixture scenario must be ${REQUIRED_FIXTURE_SCENARIO}`);
  }
  if (!exactJson(source.stateShape, REQUIRED_STATE_SHAPE)) {
    fail("fixture does not contain the required capped list and scalar State shape");
  }
  if (!exactJson(source.stressProfile, REQUIRED_STRESS_PROFILE)) {
    fail("fixture does not contain the required hard-path stress profile");
  }
  if (source.walletValueCborSha256 !== REQUIRED_WALLET_VALUE_CBOR_SHA256) {
    fail("fixture wallet Value does not match the pinned canonical CBOR");
  }
  if (source.stateDatumCborSha256 !== REQUIRED_STATE_DATUM_CBOR_SHA256) {
    fail("fixture input State does not match the pinned capped-list CBOR");
  }
  if (
    !Number.isSafeInteger(source.transactionBytes) ||
    source.transactionBytes < FIXTURE_TRANSACTION_SIZE_FLOOR_BYTES ||
    source.transactionBytes > FIXTURE_UNSIGNED_TRANSACTION_SIZE_CEILING_BYTES
  ) {
    fail(
      `unsigned fixture transaction must be ${FIXTURE_TRANSACTION_SIZE_FLOOR_BYTES}..${FIXTURE_UNSIGNED_TRANSACTION_SIZE_CEILING_BYTES} bytes`
    );
  }
  for (const [field, floor] of [
    ["nativeAssetCount", FIXTURE_NATIVE_ASSET_FLOOR],
    ["walletValueCborBytes", FIXTURE_WALLET_VALUE_SIZE_FLOOR_BYTES],
    ["stateDatumCborBytes", FIXTURE_STATE_DATUM_SIZE_FLOOR_BYTES]
  ]) {
    const value = source[field];
    if (!Number.isSafeInteger(value) || value < floor) {
      fail(`fixture ${field} must be at least ${floor}`);
    }
  }
}

function validateConsolidationFixtureRequirements(source) {
  if (source.scenario !== REQUIRED_CONSOLIDATION_SCENARIO) {
    fail(`Consolidation fixture scenario must be ${REQUIRED_CONSOLIDATION_SCENARIO}`);
  }
  if (!exactJson(source.stateShape, REQUIRED_STATE_SHAPE)) {
    fail("Consolidation fixture does not contain the required capped State shape");
  }
  if (
    !exactJson(
      source.transactionShape,
      REQUIRED_CONSOLIDATION_TRANSACTION_SHAPE
    )
  ) {
    fail("Consolidation fixture transaction shape changed");
  }
  if (
    !exactJson(
      source.stressProfile,
      REQUIRED_CONSOLIDATION_STRESS_PROFILE
    )
  ) {
    fail("Consolidation fixture stress profile changed");
  }
  if (
    source.walletValueCborSha256 !==
    REQUIRED_CONSOLIDATION_WALLET_VALUE_CBOR_SHA256
  ) {
    fail("Consolidation wallet Value does not match the pinned canonical CBOR");
  }
  if (
    source.stateDatumCborSha256 !==
    REQUIRED_CONSOLIDATION_STATE_DATUM_CBOR_SHA256
  ) {
    fail("Consolidation input State does not match the pinned canonical CBOR");
  }
  if (
    source.nativeAssetCount !== CONSOLIDATION_NATIVE_ASSET_COUNT ||
    !Number.isSafeInteger(source.transactionBytes) ||
    source.transactionBytes < CONSOLIDATION_TRANSACTION_SIZE_FLOOR_BYTES ||
    source.transactionBytes > FIXTURE_UNSIGNED_TRANSACTION_SIZE_CEILING_BYTES
  ) {
    fail("Consolidation fixture size or native-asset count changed");
  }
}

function compareGeneratedFixture(generatedDirectory) {
  for (const name of GENERATED_FILES) {
    const generated = readFileSync(join(generatedDirectory, name));
    const committed = readFileSync(join(fixtureDirectory, name));
    if (!generated.equals(committed)) {
      fail(`committed ${name} is stale; review and run \`pnpm budgets:update\``);
    }
  }
}

function fixtureDigests(directory, cborFiles) {
  return Object.fromEntries(
    cborFiles.map((name) => [name, sha256CborHex(join(directory, name))])
  );
}

function validateFixtureDigests(directory, cborFiles, acceptedDigests) {
  const measured = fixtureDigests(directory, cborFiles);
  if (!exactJson(measured, acceptedDigests)) {
    fail("committed fixture CBOR digests do not match manifest.json");
  }
  return measured;
}

function simulate(directory, cborFiles) {
  const result = run(
    "aiken",
    [
      "tx",
      "simulate",
      "--zero-time",
      String(SLOT_CONFIG.zeroTime),
      "--zero-slot",
      String(SLOT_CONFIG.zeroSlot),
      "--slot-length",
      String(SLOT_CONFIG.slotLength),
      ...cborFiles.map((name) => join(directory, name))
    ],
    projectRoot
  );
  let results;
  try {
    results = JSON.parse(result.stdout);
  } catch {
    fail("aiken tx simulate did not return JSON on stdout");
  }
  if (!Array.isArray(results) || results.length !== EXPECTED_RESULT_COUNT) {
    fail(
      `aiken tx simulate returned ${Array.isArray(results) ? results.length : "non-array"} results; expected ${EXPECTED_RESULT_COUNT}`
    );
  }
  const legs = results.map((entry, index) => {
    if (
      !Number.isSafeInteger(entry.mem) ||
      entry.mem < 0 ||
      !Number.isSafeInteger(entry.cpu) ||
      entry.cpu < 0
    ) {
      fail(`simulator result ${index} has invalid execution units`);
    }
    const expected = EXPECTED_SCRIPT_INPUTS[index];
    return {
      tag: expected.tag,
      index: expected.index,
      script: expected.script,
      mem: entry.mem,
      cpu: entry.cpu
    };
  });
  const total = legs.reduce(
    (sum, leg) => ({ mem: sum.mem + leg.mem, cpu: sum.cpu + leg.cpu }),
    { mem: 0, cpu: 0 }
  );
  if (total.mem > MEMORY_CEILING) {
    fail(`phase-two memory exceeds ceiling: ${total.mem} > ${MEMORY_CEILING}`);
  }
  if (total.cpu > CPU_CEILING) {
    fail(`phase-two CPU exceeds ceiling: ${total.cpu} > ${CPU_CEILING}`);
  }
  return { legs, total };
}

function updateCommittedFixture(
  generatedDirectory,
  payoutSource,
  consolidationSource,
  manifest,
  payoutExecutionUnits,
  consolidationExecutionUnits
) {
  mkdirSync(fixtureDirectory, { recursive: true });
  for (const name of GENERATED_FILES) {
    copyFileSync(join(generatedDirectory, name), join(fixtureDirectory, name));
  }
  const nextManifest = {
    ...manifest,
    fixture: sourceFixtureMetadata(payoutSource),
    fixtureCborSha256: fixtureDigests(
      generatedDirectory,
      PAYOUT_CBOR_FILES
    ),
    executionUnits: payoutExecutionUnits,
    consolidationFixture: sourceFixtureMetadata(consolidationSource),
    consolidationFixtureCborSha256: fixtureDigests(
      generatedDirectory,
      CONSOLIDATION_CBOR_FILES
    ),
    consolidationExecutionUnits
  };
  writeFileSync(manifestPath, `${JSON.stringify(nextManifest, null, 2)}\n`);
}

const manifest = readJson(manifestPath, "entrypoint budget manifest");
validateStaticManifest(manifest);

if (!generationOnly) {
  run("aiken", ["build"], projectRoot);
}
checkBlueprintFingerprints(manifest);
checkBlueprintMirror();
const committedSource = readJson(
  join(fixtureDirectory, "source.json"),
  "committed fixture metadata"
);
validateGeneratedSource(committedSource, manifest, "fixture");
if (!update) {
  validateFixtureRequirements(committedSource);
  const committedConsolidationSource = readJson(
    join(fixtureDirectory, "consolidation-source.json"),
    "committed Consolidation fixture metadata"
  );
  validateGeneratedSource(
    committedConsolidationSource,
    manifest,
    "consolidationFixture"
  );
  validateConsolidationFixtureRequirements(committedConsolidationSource);
  validateFixtureDigests(
    fixtureDirectory,
    PAYOUT_CBOR_FILES,
    manifest.fixtureCborSha256
  );
  validateFixtureDigests(
    fixtureDirectory,
    CONSOLIDATION_CBOR_FILES,
    manifest.consolidationFixtureCborSha256
  );
}

const generatedDirectory =
  update || checkGenerated
    ? mkdtempSync(join(tmpdir(), "epora-entrypoint-budget-"))
    : null;
try {
  let generatedSource = null;
  let generatedConsolidationSource = null;
  if (generatedDirectory) {
    run(
      process.execPath,
      ["--import", "tsx", generatorPath, generatedDirectory],
      dAppRoot
    );
    generatedSource = readJson(
      join(generatedDirectory, "source.json"),
      "generated fixture metadata"
    );
    generatedConsolidationSource = readJson(
      join(generatedDirectory, "consolidation-source.json"),
      "generated Consolidation fixture metadata"
    );
    validateGeneratedSource(generatedSource, manifest, "fixture", !update);
    validateGeneratedSource(
      generatedConsolidationSource,
      manifest,
      "consolidationFixture",
      !update
    );
    validateFixtureRequirements(generatedSource);
    validateConsolidationFixtureRequirements(generatedConsolidationSource);
    if (!update) {
      compareGeneratedFixture(generatedDirectory);
    }
  }

  if (generationOnly) {
    console.log("check-entrypoint-budget: generated fixtures match committed CBOR");
  } else {
    const simulationDirectory = update ? generatedDirectory : fixtureDirectory;
    const executionUnits = simulate(
      simulationDirectory,
      PAYOUT_CBOR_FILES
    );
    const consolidationExecutionUnits = simulate(
      simulationDirectory,
      CONSOLIDATION_CBOR_FILES
    );
    if (
      update &&
      generatedDirectory &&
      generatedSource &&
      generatedConsolidationSource
    ) {
      updateCommittedFixture(
        generatedDirectory,
        generatedSource,
        generatedConsolidationSource,
        manifest,
        executionUnits,
        consolidationExecutionUnits
      );
    } else {
      if (!exactJson(executionUnits, manifest.executionUnits)) {
        fail(
          `payout phase-two execution units moved: ${JSON.stringify(manifest.executionUnits)} -> ${JSON.stringify(executionUnits)}. ` +
            "Review the change, then run `pnpm budgets:update`."
        );
      }
      if (
        !exactJson(
          consolidationExecutionUnits,
          manifest.consolidationExecutionUnits
        )
      ) {
        fail(
          `Consolidation phase-two execution units moved: ${JSON.stringify(manifest.consolidationExecutionUnits)} -> ${JSON.stringify(consolidationExecutionUnits)}. ` +
            "Review the change, then run `pnpm budgets:update`."
        );
      }
    }

    console.log(
      `check-entrypoint-budget: payout ${EXPECTED_RESULT_COUNT} native Aiken phase-two results, ` +
        `mem ${executionUnits.total.mem}/${MEMORY_CEILING}, ` +
        `cpu ${executionUnits.total.cpu}/${CPU_CEILING}`
    );
    console.log(
      `check-entrypoint-budget: Consolidation ${EXPECTED_RESULT_COUNT} native Aiken phase-two results, ` +
        `mem ${consolidationExecutionUnits.total.mem}/${MEMORY_CEILING}, ` +
        `cpu ${consolidationExecutionUnits.total.cpu}/${CPU_CEILING}`
    );
  }
} finally {
  if (generatedDirectory) {
    rmSync(generatedDirectory, { recursive: true, force: true });
  }
}
