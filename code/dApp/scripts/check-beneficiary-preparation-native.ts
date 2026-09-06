// Production preparation builder with synthetic UTxOs, both reference scripts,
// one funding input, one collateral input, and one real test-key witness.
// This does not attest live UTxOs, protocol parameters, or other asset layouts.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as crypto from "@harmoniclabs/crypto";
import { DEFAULT_PROTOCOL_PARAMETERS } from "@meshsdk/common";
import { pubKeyAddress, serializeAddressObj, serializeData, resolveScriptHash, type UTxO } from "@meshsdk/core";
import { toScriptRef, toTxUnspentOutput } from "@meshsdk/core-cst";
import { getSttMintPolicyId, getSttSpendScript, getWalletSpendScript, resolveScriptAddress } from "@/lib/contracts/blueprint";
import { createDefaultStateForm, stateFormToDatum } from "@/lib/contracts/state-form";
import { buildBeneficiaryPreparationTx } from "@/lib/mesh/transactions/beneficiary-preparation";
import { deserializeTx, createVKeyWitnessSetHex, addVKeyWitnessSetToTransaction, deserializeVKeyWitnessSet, type CstTransactionOutput } from "@/lib/mesh/cst";
import { UTXO_SIZE_OVERHEAD_BYTES } from "@/lib/mesh/transactions/internals/constants";
import { createFixtureWallet, createFixtureFetcher } from "./entrypoint-budget-fixture-support";
const KEY = "c7ca8c5aaaa0ad1264357eca320c6f9d93e420b71e1d85ad68f5b321", NOW = 2000000000000;
const MAX_BYTES = 16384, MAX_MEMORY = 14000000, MAX_CPU = 9000000000;
const contractRoot = resolve(fileURLToPath(new URL("../../smart-contract", import.meta.url)));
const address = serializeAddressObj(pubKeyAddress(KEY, "ab".repeat(28)), 0), nativeUnit = "cd".repeat(28) + "01";
const ada = (quantity: number) => ({ unit: "lovelace", quantity: String(quantity) });
const token = (quantity: number) => ({ unit: nativeUnit, quantity: String(quantity) });
function utxo(hash: string, outputAddress: string, amount: UTxO["output"]["amount"], extra = {}): UTxO {
    return { input: { txHash: hash.repeat(32), outputIndex: 0 }, output: { address: outputAddress, amount, ...extra } };
}
async function check(mode: "split" | "merge" | "shortfall") {
    const sttScript = getSttSpendScript(), policy = getSttMintPolicyId(), name = "deadbeef";
    const walletScript = getWalletSpendScript({ sttPolicyId: policy, sttAssetNameHex: name }), walletAddress = resolveScriptAddress(walletScript);
    const form = createDefaultStateForm();
    form.users = [];
    form.multiSigThresholdMode = "none";
    form.proofOfLifeUnlockTimeMode = "some";
    form.proofOfLifeUnlockTime = String(NOW - 10000000);
    form.proofOfLifeIncrementMode = "some";
    form.proofOfLifeIncrement = "86400000";
    form.beneficiaries = [1, 3].map((weight, index) => ({ id: String(index), wallets: [index ? "01".repeat(28) : KEY], unlockAfterMode: "none", unlockAfter: "", weight: String(weight), payoutAddress: address }));
    const state = utxo("22", resolveScriptAddress(sttScript), [ada(30000000), { unit: policy + name, quantity: "1" }], { plutusData: serializeData(stateFormToDatum(form), "Mesh") });
    const selected = [utxo("55", walletAddress, [ada(mode === "shortfall" ? 1500000 : mode === "merge" ? 5000000 : 10000000), token(mode === "merge" ? 4 : 5)])];
    if (mode === "merge")
        selected.push(utxo("56", walletAddress, [ada(5000000), token(4)]));
    const funding = utxo("aa", address, [ada(2000000000)]), collateral = utxo("bb", address, [ada(20000000)]);
    const references = [sttScript, walletScript].map((script, index) => utxo(index ? "45" : "44", address, [ada(100000000)], { scriptRef: String(toScriptRef(script).toCbor()), scriptHash: resolveScriptHash(script.code, script.version) }));
    const all = [state, ...selected, funding, collateral, ...references], fetcher = createFixtureFetcher(all);
    // Three scripts in the merge must fit the declared aggregate budget too.
    fetcher.evaluateTx = async (txHex) => (deserializeTx(txHex).witnessSet().redeemers()?.values() ?? []).map(redeemer => ({ index: Number(redeemer.index()), tag: "SPEND", budget: { mem: 4000000, steps: 2000000000 } }));
    const build = () => buildBeneficiaryPreparationTx(createFixtureWallet(funding, collateral), { walletPolicyId: policy, walletAssetNameHex: name, sttAssetNameHex: name, sttSpendReference: "44".repeat(32) + "#0", walletSpendReference: "45".repeat(32) + "#0" }, { sttInputTxHash: state.input.txHash, sttInputOutputIndex: 0, beneficiarySignerKeyHash: KEY, walletInputs: selected.map(input => input.input), poolAssets: mode === "merge" ? [] : [ada(mode === "shortfall" ? 1000000 : 8000000), token(4)] }, fetcher);
    if (mode === "shortfall") {
        await assert.rejects(build, /more lovelace in the selected wallet inputs/);
        console.log(JSON.stringify({ mode, rejected: true, externalFundingLovelace: 2000000000 }));
        return;
    }
    const result = await build(), tx = deserializeTx(result.txHex);
    const body = tx.body() as ReturnType<typeof tx.body> & {
        toCbor(): string;
    };
    const requiredSigners = body.requiredSigners() as {
        values(): readonly {
            value(): string;
        }[];
    };
    assert.deepEqual(requiredSigners.values().map(signer => signer.value()), [KEY]);
    const bodyHash = crypto.blake2b_256(Buffer.from(body.toCbor(), "hex")), signature = crypto.signEd25519_sync(bodyHash, new Uint8Array(32).fill(23));
    const publicKeyHex = Buffer.from(signature.pubKey).toString("hex"), signatureHex = Buffer.from(signature.signature).toString("hex");
    assert.equal(Buffer.from(crypto.blake2b_224(signature.pubKey)).toString("hex"), KEY);
    const signed = addVKeyWitnessSetToTransaction(result.txHex, createVKeyWitnessSetHex([{ publicKeyHex, signatureHex }])), signedTx = deserializeTx(signed);
    assert.equal((signedTx.body() as typeof body).toCbor(), body.toCbor());
    assert.deepEqual(deserializeVKeyWitnessSet(signedTx.witnessSet().toCbor()).vkeys()?.values().map(w => w.toCore()), [[publicKeyHex, signatureHex]]);
    assert.ok(crypto.verifyEd25519Signature_sync(signature.signature, bodyHash, signature.pubKey));
    assert.ok(signed.length / 2 <= MAX_BYTES);
    const outputs = (body.outputs() as (CstTransactionOutput & {
        toCbor(): string;
    })[]).filter(output => output.address().toBech32().toString() === walletAddress);
    const values = outputs.map(output => {
        const coin = BigInt(output.amount().coin().toString()), minimum = BigInt(UTXO_SIZE_OVERHEAD_BYTES + output.toCbor().length / 2) * BigInt(DEFAULT_PROTOCOL_PARAMETERS.coinsPerUtxoSize);
        assert.ok(coin >= minimum);
        return { lovelace: String(coin), native: [...output.amount().multiasset()!.entries()].map(([unit, quantity]) => [unit.toString(), quantity.toString()]), minimum: String(minimum) };
    });
    assert.deepEqual(values.map(({ lovelace, native }) => ({ lovelace, native })), mode === "split" ? [{ lovelace: "8000000", native: [[nativeUnit, "4"]] }, { lovelace: "2000000", native: [[nativeUnit, "1"]] }] : [{ lovelace: "10000000", native: [[nativeUnit, "8"]] }]);
    const dir = mkdtempSync(join(tmpdir(), "epora-preparation-native-"));
    try {
        const resolved = all.map(toTxUnspentOutput), array = (items: string[]) => (0x80 + items.length).toString(16) + items.join("");
        writeFileSync(join(dir, "tx.cbor"), result.txHex);
        writeFileSync(join(dir, "inputs.cbor"), array(resolved.map(input => String(input.input().toCbor()))));
        writeFileSync(join(dir, "outputs.cbor"), array(resolved.map(input => String(input.output().toCbor()))));
        const legs = JSON.parse(execFileSync("aiken", ["tx", "simulate", "--zero-time", "1655769600000", "--zero-slot", "86400", "--slot-length", "1000", ...["tx.cbor", "inputs.cbor", "outputs.cbor"].map(file => join(dir, file))], { cwd: contractRoot, encoding: "utf8" })) as {
            mem: number;
            cpu: number;
        }[];
        const declared = tx.witnessSet().redeemers()!.values() as unknown as {
            tag(): number;
            index(): bigint;
            exUnits(): {
                mem(): bigint;
                steps(): bigint;
            };
        }[];
        assert.equal(legs.length, selected.length + 1);
        assert.equal(declared.length, legs.length);
        for (const [index, leg] of legs.entries()) {
            assert.ok(Number.isSafeInteger(leg.mem) && leg.mem > 0 && Number.isSafeInteger(leg.cpu) && leg.cpu > 0);
            const budget = declared.find(item => item.tag() === 0 && Number(item.index()) === index)!.exUnits();
            assert.ok(budget.mem() >= BigInt(leg.mem) && budget.steps() >= BigInt(leg.cpu));
        }
        assert.ok(declared.reduce((sum, item) => sum + item.exUnits().mem(), 0n) <= BigInt(MAX_MEMORY));
        assert.ok(declared.reduce((sum, item) => sum + item.exUnits().steps(), 0n) <= BigInt(MAX_CPU));
        console.log(JSON.stringify({ mode, unsignedBytes: result.txHex.length / 2, signedBytes: signed.length / 2, values, memory: legs.reduce((sum, leg) => sum + leg.mem, 0), cpu: legs.reduce((sum, leg) => sum + leg.cpu, 0) }));
    }
    finally {
        rmSync(dir, { recursive: true, force: true });
    }
}
async function main() {
    const originalNow = Date.now, originalRandom = Math.random;
    Date.now = () => NOW;
    Math.random = () => 0;
    try {
        await check("split");
        await check("merge");
        await check("shortfall");
    }
    finally {
        Date.now = originalNow;
        Math.random = originalRandom;
    }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
