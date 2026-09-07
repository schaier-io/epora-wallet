// Native integration for the production Exact builder. Both scenarios use one
// funding input, one collateral input, one payment-key witness, base change,
// and full script/stake payout addresses. It does not attest live chain UTxOs,
// protocol parameters, additional witnesses, or every asset topology.
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as crypto from '@harmoniclabs/crypto';
import { pubKeyAddress, scriptAddress, serializeAddressObj, serializeData, resolveScriptHash, type UTxO } from '@meshsdk/core';
import { toScriptRef, toTxUnspentOutput } from '@meshsdk/core-cst';
import { getSttMintPolicyId, getSttSpendScript, getWalletSpendScript, resolveScriptAddress } from '@/lib/contracts/blueprint';
import { createDefaultStateForm, stateFormToDatum } from '@/lib/contracts/state-form';
import { buildSttSpendTx } from '@/lib/mesh/transactions/stt-spend';
import { createFixtureWallet, createFixtureFetcher } from './entrypoint-budget-fixture-support';
import { deserializeTx, deserializeVKeyWitnessSet, createVKeyWitnessSetHex, addVKeyWitnessSetToTransaction } from '@/lib/mesh/cst';
const realKey = 'c7ca8c5aaaa0ad1264357eca320c6f9d93e420b71e1d85ad68f5b321';
const max = 18446744073709551615n;
const now = 2000000000000;
const SCRIPT_INPUT_COUNT = 2;
const MAX_TRANSACTION_BYTES = 16384;
const MAX_MEMORY = 14000000;
const MAX_CPU = 9000000000;
const contractRoot = resolve(fileURLToPath(new URL('../../smart-contract', import.meta.url)));
async function checkScenario(count: number, withReference: boolean) {
    const assetCount = 5;
    const hex = (n: number, width: number) => BigInt(n).toString(16).padStart(width * 2, '0');
    const keyAddress = serializeAddressObj(pubKeyAddress(realKey, 'ab'.repeat(28)), 0);
    const script = getSttSpendScript(), policy = getSttMintPolicyId(), asset = 'deadbeef';
    const walletScript = getWalletSpendScript({ sttPolicyId: policy, sttAssetNameHex: asset });
    const form = createDefaultStateForm();
    form.users = [];
    form.multiSigThresholdMode = 'none';
    form.walletName = 'x'.repeat(32);
    form.proofOfLifeUnlockTimeMode = 'some';
    form.proofOfLifeUnlockTime = String(now - 10000000);
    form.proofOfLifeIncrementMode = 'some';
    form.proofOfLifeIncrement = String(max);
    form.streamingPayments = [];
    form.beneficiaries = Array.from({ length: count }, (_, i) => ({ id: String(max - BigInt(i)), wallets: [i === 0 ? realKey : hex(i, 28)], unlockAfterMode: 'some' as const, unlockAfter: String(now - 10000000), weight: String(max), payoutAddress: serializeAddressObj(scriptAddress(hex(101, 28), hex(102, 28), true), 0) }));
    const datum = serializeData(stateFormToDatum(form), 'Mesh');
    function utxo(hash: string, address: string, amount: Array<{
        unit: string;
        quantity: string;
    }>, extra = {}) { return { input: { txHash: hash.repeat(32), outputIndex: 0 }, output: { address, amount, ...extra } } as UTxO; }
    const state = utxo('22', resolveScriptAddress(script), [{ unit: 'lovelace', quantity: '30000000' }, { unit: policy + asset, quantity: '1' }], { plutusData: datum });
    const walletInput = utxo('55', resolveScriptAddress(walletScript), [{ unit: 'lovelace', quantity: String(count * 2000000) }, ...Array.from({ length: assetCount }, (_, i) => ({ unit: hex(i + 4000, 28) + hex(i + 1, 32), quantity: String(count * 100) }))]);
    const funding = utxo('aa', keyAddress, [{ unit: 'lovelace', quantity: '2000000000' }]);
    const collateral = utxo('bb', keyAddress, [{ unit: 'lovelace', quantity: '20000000' }]);
    const sttRef = utxo('44', keyAddress, [{ unit: 'lovelace', quantity: '100000000' }], { scriptRef: String(toScriptRef(script).toCbor()), scriptHash: resolveScriptHash(script.code, script.version) });
    const walletRef = utxo('45', keyAddress, [{ unit: 'lovelace', quantity: '100000000' }], { scriptRef: String(toScriptRef(walletScript).toCbor()), scriptHash: resolveScriptHash(walletScript.code, walletScript.version) });
    Math.random = () => 0;
    Date.now = () => now;
    const all = [state, walletInput, funding, collateral, sttRef, ...withReference ? [walletRef] : []];
    const result = await buildSttSpendTx(createFixtureWallet(funding, collateral), { walletPolicyId: policy, walletAssetNameHex: asset, sttAssetNameHex: asset, sttSpendReference: '44'.repeat(32) + '#0', ...withReference ? { walletSpendReference: '45'.repeat(32) + '#0' } : {} }, 'distribute-beneficiaries', { sttInputTxHash: state.input.txHash, sttInputOutputIndex: 0, beneficiarySignerKeyHash: realKey, walletInputs: [walletInput.input], validityWindowReferenceTimeMs: now }, createFixtureFetcher(all));
    const dir = mkdtempSync(join(tmpdir(), 'epora-exact-native-'));
    try {
        const cborArray = (a: string[]) => (a.length < 24 ? (0x80 + a.length).toString(16) : '98' + a.length.toString(16).padStart(2, '0')) + a.join('');
        const resolved = all.map(toTxUnspentOutput);
        writeFileSync(dir + '/transaction.cbor', result.txHex);
        writeFileSync(dir + '/inputs.cbor', cborArray(resolved.map(u => String(u.input().toCbor()))));
        writeFileSync(dir + '/outputs.cbor', cborArray(resolved.map(u => String(u.output().toCbor()))));
        const tx = deserializeTx(result.txHex);
        // The installed CST body supports toCbor; the app's narrow facade omits it.
        const unsignedBody = tx.body() as ReturnType<typeof tx.body> & { toCbor(): string };
        const bodyHash = crypto.blake2b_256(Buffer.from(unsignedBody.toCbor(), 'hex'));
        const signature = crypto.signEd25519_sync(bodyHash, new Uint8Array(32).fill(23));
        assert.equal(Buffer.from(crypto.blake2b_224(signature.pubKey)).toString('hex'), realKey);
        const requiredSigners = tx.body().requiredSigners() as { values(): readonly { value(): string }[] } | undefined;
        assert.deepEqual(requiredSigners?.values().map(key => key.value()), [realKey]);
        assert.equal(crypto.verifyEd25519Signature_sync(signature.signature, bodyHash, signature.pubKey), true);
        const witness = createVKeyWitnessSetHex([{ publicKeyHex: Buffer.from(signature.pubKey).toString('hex'), signatureHex: Buffer.from(signature.signature).toString('hex') }]);
        const signed = addVKeyWitnessSetToTransaction(result.txHex, witness);
        const signedTransaction = deserializeTx(signed);
        assert.equal((signedTransaction.body() as typeof unsignedBody).toCbor(), unsignedBody.toCbor(), 'Witness merge changed the signed body.');
        const mergedWitnesses = deserializeVKeyWitnessSet(signedTransaction.witnessSet().toCbor()).vkeys()?.values();
        assert.equal(mergedWitnesses?.length, 1);
        assert.deepEqual(mergedWitnesses?.[0]?.toCore(), [Buffer.from(signature.pubKey).toString('hex'), Buffer.from(signature.signature).toString('hex')]);
        assert.ok(signed.length / 2 <= MAX_TRANSACTION_BYTES, 'Signed Exact transaction exceeds ledger byte limit.');
        const evaluation = JSON.parse(execFileSync('aiken', ['tx', 'simulate', '--zero-time', '1655769600000', '--zero-slot', '86400', '--slot-length', '1000', ...['transaction.cbor', 'inputs.cbor', 'outputs.cbor'].map(name => join(dir, name))], { cwd: contractRoot, encoding: 'utf8' })) as Array<{
            mem: number;
            cpu: number;
        }>;
        assert.equal(evaluation.length, SCRIPT_INPUT_COUNT);
        // The shared fixture fetcher supplies provisional budgets. Assert that
        // the actual body declares enough for each native execution and that
        // the sum of declared budgets also stays inside the accepted ceilings.
        const declared = tx.witnessSet().redeemers()!.values() as unknown as readonly {
            tag(): number;
            index(): bigint;
            exUnits(): { mem(): bigint; steps(): bigint };
        }[];
        assert.equal(declared.length, SCRIPT_INPUT_COUNT);
        const ordered = [...declared].sort((left, right) => Number(left.index() - right.index()));
        for (const [index, leg] of evaluation.entries()) {
            assert.equal(ordered[index]!.tag(), 0);
            assert.equal(Number(ordered[index]!.index()), index);
            assert.ok(ordered[index]!.exUnits().mem() >= BigInt(leg.mem));
            assert.ok(ordered[index]!.exUnits().steps() >= BigInt(leg.cpu));
        }
        assert.ok(declared.reduce((sum, item) => sum + item.exUnits().mem(), 0n) <= BigInt(MAX_MEMORY));
        assert.ok(declared.reduce((sum, item) => sum + item.exUnits().steps(), 0n) <= BigInt(MAX_CPU));
        const memory = evaluation.reduce((sum, leg) => sum + leg.mem, 0);
        const cpu = evaluation.reduce((sum, leg) => sum + leg.cpu, 0);
        assert.ok(Number.isSafeInteger(memory) && memory > 0 && memory <= MAX_MEMORY, 'Paired Exact memory exceeds ledger ceiling.');
        assert.ok(Number.isSafeInteger(cpu) && cpu > 0 && cpu <= MAX_CPU, 'Paired Exact CPU exceeds repository ceiling.');
        console.log(JSON.stringify({ beneficiaries: count, nativeAssets: assetCount, walletReference: withReference, unsignedBytes: result.txHex.length / 2, signedBytes: signed.length / 2, stateDatumBytes: datum.length / 2, outputs: (tx.body().outputs() as unknown[]).length, memory, cpu }));
    }
    finally {
        rmSync(dir, { recursive: true, force: true });
    }
}
async function main() {
    await checkScenario(2, false);
    await checkScenario(15, true);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
