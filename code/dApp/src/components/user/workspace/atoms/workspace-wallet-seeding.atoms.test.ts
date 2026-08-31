import assert from "node:assert/strict";
import { test } from "node:test";

import { createStore } from "jotai";

import {
  consolidateStateFormAtom,
  consolidateSttAssetsAtom,
  consolidateSttInputHashAtom,
  consolidateSttInputIndexAtom,
  consolidateWalletInputsAtom,
  consolidateWalletOutputsAtom
} from "./forms/consolidate-form.atoms";
import {
  publishCertificateJsonAtom,
  publishSttAssetsAtom,
  publishSttInputHashAtom,
  publishSttInputIndexAtom,
  publishSttStateFormAtom,
  publishZeroAdminConfirmedAtom
} from "./forms/publish-form.atoms";
import {
  consolidateAuthorityPathAtom,
  selectedSttActionAtom,
  streamingPaymentPayoutAmountsAtom,
  sttAuthorityPathAtom,
  sttExtraTransfersAtom,
  sttInputOutputIndexAtom,
  sttInputTxHashAtom,
  sttOutputAssetsAtom,
  sttProofOfLifeOverrideModeAtom,
  sttProofOfLifeSpecificDateTimeAtom,
  sttStateFormAtom,
  sttTransferAddressAtom,
  sttTransferAmountsAtom,
  sttWalletInputsAtom,
  sttWalletOutputsAtom,
  sttZeroAdminConfirmedAtom,
  walletOperatorPathAtom
} from "./forms/stt-spend-form.atoms";
import {
  transferCustomAddressAtom,
  transferDisplayAmountAtom,
  transferRecipientModeAtom,
  transferSelectedUnitAtom
} from "./forms/transfer-form.atoms";
import {
  voteJsonAtom,
  voteSttAssetsAtom,
  voteSttInputHashAtom,
  voteSttInputIndexAtom,
  voteSttStateFormAtom,
  voteZeroAdminConfirmedAtom
} from "./forms/vote-form.atoms";
import {
  selectedStakePoolAtom,
  withdrawAmountAtom,
  withdrawRewardAddressAtom,
  withdrawSttAssetsAtom,
  withdrawSttInputHashAtom,
  withdrawSttInputIndexAtom,
  withdrawSttStateFormAtom,
  withdrawZeroAdminConfirmedAtom
} from "./forms/withdraw-form.atoms";
import { configAtom } from "./workspace-config.atoms";
import { seedWorkspaceWalletAtom } from "./workspace-wallet-seeding.atoms";
import {
  createDefaultStateForm,
  stateFormFromDatum,
  stateFormToDatum
} from "@/lib/contracts/state-form";
import type { DetectedSttToken } from "@/lib/mesh/detection";

type Store = ReturnType<typeof createStore>;

function detectedToken(id: string, walletName: string, outputIndex: number): DetectedSttToken {
  const stateForm = createDefaultStateForm();
  stateForm.walletName = walletName;
  stateForm.users = [
    {
      id: "1",
      wallets: [`addr_${id}`],
      perDayAllowance: [{ policyId: "", assetName: "", amount: "10" }],
      remainingAllowance: [{ policyId: "", assetName: "", amount: "7" }],
      nextAllowanceReset: "1000",
      canRenewProofOfLife: false,
      multiSigPowerMode: "none",
      multiSigPower: "",
      isAdmin: false,
      preset: "limited-withdrawal"
    }
  ];

  return {
    policyId: `policy-${id}`,
    assetNameHex: `asset-${id}`,
    unit: `unit-${id}`,
    scriptAddress: `script-${id}`,
    datum: stateFormToDatum(stateForm),
    utxo: {
      input: { txHash: `tx-${id}`, outputIndex },
      output: { address: `script-${id}`, amount: [] }
    }
  } as unknown as DetectedSttToken;
}

function dirtyWalletBoundDrafts(store: Store) {
  const dirtyStateForm = createDefaultStateForm();
  dirtyStateForm.walletName = "Dirty wallet";
  const dirtyAsset = { unit: "dirty", quantity: "1" };
  const dirtyInput = { txHash: "dirty", outputIndex: 9 };
  const dirtyDatum = { mode: "none" as const, customAlternative: "" };

  store.set(sttInputTxHashAtom, "dirty");
  store.set(sttInputOutputIndexAtom, "9");
  store.set(sttZeroAdminConfirmedAtom, true);
  store.set(sttStateFormAtom, dirtyStateForm);
  store.set(sttOutputAssetsAtom, [dirtyAsset]);
  store.set(sttWalletInputsAtom, [dirtyInput]);
  store.set(sttWalletOutputsAtom, [{ amount: [dirtyAsset], inlineDatum: dirtyDatum }]);
  store.set(sttExtraTransfersAtom, [
    { address: "dirty", amount: [dirtyAsset], inlineDatum: dirtyDatum }
  ]);
  store.set(sttProofOfLifeOverrideModeAtom, "specific");
  store.set(sttProofOfLifeSpecificDateTimeAtom, "123");
  store.set(sttTransferAddressAtom, "dirty");
  store.set(sttTransferAmountsAtom, { dirty: "1" });
  store.set(streamingPaymentPayoutAmountsAtom, { dirty: "1" });

  store.set(transferRecipientModeAtom, "custom");
  store.set(transferCustomAddressAtom, "dirty");
  store.set(transferSelectedUnitAtom, "dirty");
  store.set(transferDisplayAmountAtom, "1");

  store.set(withdrawSttInputHashAtom, "dirty");
  store.set(withdrawSttInputIndexAtom, "9");
  store.set(withdrawZeroAdminConfirmedAtom, true);
  store.set(withdrawSttStateFormAtom, dirtyStateForm);
  store.set(withdrawSttAssetsAtom, [dirtyAsset]);

  store.set(publishSttInputHashAtom, "dirty");
  store.set(publishSttInputIndexAtom, "9");
  store.set(publishZeroAdminConfirmedAtom, true);
  store.set(publishSttStateFormAtom, dirtyStateForm);
  store.set(publishSttAssetsAtom, [dirtyAsset]);

  store.set(voteSttInputHashAtom, "dirty");
  store.set(voteSttInputIndexAtom, "9");
  store.set(voteZeroAdminConfirmedAtom, true);
  store.set(voteSttStateFormAtom, dirtyStateForm);
  store.set(voteSttAssetsAtom, [dirtyAsset]);

  store.set(consolidateSttInputHashAtom, "dirty");
  store.set(consolidateSttInputIndexAtom, "9");
  store.set(consolidateStateFormAtom, dirtyStateForm);
  store.set(consolidateSttAssetsAtom, [dirtyAsset]);
  store.set(consolidateWalletInputsAtom, [dirtyInput]);
  store.set(consolidateWalletOutputsAtom, [{ amount: [dirtyAsset], inlineDatum: dirtyDatum }]);
}

function assertSeeded(store: Store, token: DetectedSttToken) {
  const expectedStateForm = stateFormFromDatum(token.datum);
  const inputTxHash = token.utxo.input.txHash;
  const inputOutputIndex = token.utxo.input.outputIndex.toString();
  const config = store.get(configAtom);

  assert.equal(config.sttAssetNameHex, token.assetNameHex);
  assert.equal(config.walletPolicyId, token.policyId);
  assert.equal(config.walletAssetNameHex, token.assetNameHex);
  assert.equal(store.get(sttInputTxHashAtom), inputTxHash);
  assert.equal(store.get(sttInputOutputIndexAtom), inputOutputIndex);
  assert.equal(store.get(sttZeroAdminConfirmedAtom), false);
  assert.deepEqual(store.get(sttStateFormAtom), expectedStateForm);
  assert.deepEqual(store.get(sttOutputAssetsAtom), []);
  assert.deepEqual(store.get(sttWalletInputsAtom), []);
  assert.deepEqual(store.get(sttWalletOutputsAtom), []);
  assert.deepEqual(store.get(sttExtraTransfersAtom), []);
  assert.equal(store.get(sttProofOfLifeOverrideModeAtom), "auto");
  assert.equal(store.get(sttProofOfLifeSpecificDateTimeAtom), "");
  assert.equal(store.get(sttTransferAddressAtom), "");
  assert.deepEqual(store.get(sttTransferAmountsAtom), {});
  assert.deepEqual(store.get(streamingPaymentPayoutAmountsAtom), {});

  assert.equal(store.get(transferRecipientModeAtom), "");
  assert.equal(store.get(transferCustomAddressAtom), "");
  assert.equal(store.get(transferSelectedUnitAtom), "lovelace");
  assert.equal(store.get(transferDisplayAmountAtom), "");

  for (const [hashAtom, indexAtom, confirmedAtom, stateAtom, assetsAtom] of [
    [
      withdrawSttInputHashAtom,
      withdrawSttInputIndexAtom,
      withdrawZeroAdminConfirmedAtom,
      withdrawSttStateFormAtom,
      withdrawSttAssetsAtom
    ],
    [
      publishSttInputHashAtom,
      publishSttInputIndexAtom,
      publishZeroAdminConfirmedAtom,
      publishSttStateFormAtom,
      publishSttAssetsAtom
    ],
    [
      voteSttInputHashAtom,
      voteSttInputIndexAtom,
      voteZeroAdminConfirmedAtom,
      voteSttStateFormAtom,
      voteSttAssetsAtom
    ]
  ] as const) {
    assert.equal(store.get(hashAtom), inputTxHash);
    assert.equal(store.get(indexAtom), inputOutputIndex);
    assert.equal(store.get(confirmedAtom), false);
    assert.deepEqual(store.get(stateAtom), expectedStateForm);
    assert.deepEqual(store.get(assetsAtom), []);
  }

  assert.equal(store.get(consolidateSttInputHashAtom), inputTxHash);
  assert.equal(store.get(consolidateSttInputIndexAtom), inputOutputIndex);
  assert.deepEqual(store.get(consolidateStateFormAtom), expectedStateForm);
  assert.deepEqual(store.get(consolidateSttAssetsAtom), []);
  assert.deepEqual(store.get(consolidateWalletInputsAtom), []);
  assert.deepEqual(store.get(consolidateWalletOutputsAtom), []);
}

test("wallet seeding replaces every wallet-bound draft on selection and switch", () => {
  const store = createStore();
  const first = detectedToken("one", "Wallet one", 1);
  const second = detectedToken("two", "Wallet two", 2);
  store.set(configAtom, { ...store.get(configAtom), sttSpendReference: "preserved-ref" });

  store.set(seedWorkspaceWalletAtom, first);
  assertSeeded(store, first);

  dirtyWalletBoundDrafts(store);
  store.set(seedWorkspaceWalletAtom, second);
  assertSeeded(store, second);
  assert.equal(store.get(configAtom).sttSpendReference, "preserved-ref");
});

test("wallet seeding gives each action an independent State form", () => {
  const store = createStore();
  store.set(seedWorkspaceWalletAtom, detectedToken("one", "Wallet one", 1));

  const forms = [
    store.get(sttStateFormAtom),
    store.get(withdrawSttStateFormAtom),
    store.get(publishSttStateFormAtom),
    store.get(voteSttStateFormAtom),
    store.get(consolidateStateFormAtom)
  ];

  for (let left = 0; left < forms.length; left += 1) {
    for (let right = left + 1; right < forms.length; right += 1) {
      assert.notEqual(forms[left], forms[right]);
      assert.notEqual(forms[left]?.users, forms[right]?.users);
      assert.notEqual(forms[left]?.users[0], forms[right]?.users[0]);
      assert.notEqual(forms[left]?.users[0]?.wallets, forms[right]?.users[0]?.wallets);
    }
  }
});

test("wallet seeding preserves choices and payloads that are not wallet-bound", () => {
  const store = createStore();
  const selectedPool = { id: "pool" } as never;
  store.set(sttAuthorityPathAtom, "multisig");
  store.set(walletOperatorPathAtom, "multisig");
  store.set(consolidateAuthorityPathAtom, "beneficiary");
  store.set(selectedSttActionAtom, "update-state");
  store.set(withdrawRewardAddressAtom, "stake_test");
  store.set(withdrawAmountAtom, "42");
  store.set(selectedStakePoolAtom, selectedPool);
  store.set(publishCertificateJsonAtom, '{"certificate":"kept"}');
  store.set(voteJsonAtom, '{"vote":"kept"}');

  store.set(seedWorkspaceWalletAtom, detectedToken("one", "Wallet one", 1));

  assert.equal(store.get(sttAuthorityPathAtom), "multisig");
  assert.equal(store.get(walletOperatorPathAtom), "multisig");
  assert.equal(store.get(consolidateAuthorityPathAtom), "beneficiary");
  assert.equal(store.get(selectedSttActionAtom), "update-state");
  assert.equal(store.get(withdrawRewardAddressAtom), "stake_test");
  assert.equal(store.get(withdrawAmountAtom), "42");
  assert.equal(store.get(selectedStakePoolAtom), selectedPool);
  assert.equal(store.get(publishCertificateJsonAtom), '{"certificate":"kept"}');
  assert.equal(store.get(voteJsonAtom), '{"vote":"kept"}');
});
