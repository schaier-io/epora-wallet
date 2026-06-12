import { PrismaClient } from "@/generated/prisma";
import { createPrismaAdapter } from "@/lib/prisma-adapter";
import { resolvePaymentKeyHash, serializeData } from "@meshsdk/core";
import type { TransactionInfo, UTxO } from "@meshsdk/common";
import { stateFormToDatum, type StateFormState } from "@/lib/contracts/state-form";
import {
  INTENDED_STAKE_CREDENTIAL_NONE,
  LAST_PERMISSIONLESS_PAYOUT_AT_NONE
} from "@/lib/contracts/state-layout";
import { getSttPolicyId, getSttScriptAddress } from "@/lib/stt-cache/domain";
import type { AddressTransactionPageEntry, SttChainClient } from "@/lib/stt-cache/types";

export const TEST_CONNECTED_ADDRESS =
  "addr_test1qra89xrexu3vq28g5glatk44s96mysv345rvxsve4x5uh9vvmn2lu5e2ma4eavm9sx3jk5unu0n8vl93k0h3lcqkauwqpcpttu";
export const TEST_CONNECTED_PAYMENT_KEY_HASH =
  resolvePaymentKeyHash(TEST_CONNECTED_ADDRESS).toLowerCase();
export const TEST_REGULAR_PAYMENT_KEY_HASH = "11".repeat(28);

function buildState(): StateFormState {
  return {
    walletName: "Test wallet",
    users: [
      {
        id: "0",
        wallets: [TEST_CONNECTED_PAYMENT_KEY_HASH],
        perDayAllowance: [],
        remainingAllowance: [],
        nextAllowanceReset: "0",
        canRenewProofOfLife: true,
        multiSigPowerMode: "none",
        multiSigPower: "",
        isAdmin: true,
        preset: "admin"
      },
      {
        id: "1",
        wallets: [TEST_REGULAR_PAYMENT_KEY_HASH],
        perDayAllowance: [],
        remainingAllowance: [],
        nextAllowanceReset: "0",
        canRenewProofOfLife: false,
        multiSigPowerMode: "none",
        multiSigPower: "",
        isAdmin: false,
        preset: "limited-withdrawal"
      }
    ],
    multiSigThresholdMode: "none",
    multiSigThreshold: "",
    beneficiaries: [
      {
        id: "7",
        wallets: [TEST_CONNECTED_PAYMENT_KEY_HASH],
        unlockAfterMode: "none",
        unlockAfter: "",
        weight: "1"
      }
    ],
    proofOfLifeUnlockTimeMode: "none",
    proofOfLifeUnlockTime: "",
    proofOfLifeIncrementMode: "none",
    proofOfLifeIncrement: "",
    streamingPayments: [
      {
        id: "5",
        payoutAddress: TEST_CONNECTED_ADDRESS,
        paidOutAmount: "0",
        policyId: "",
        assetName: "",
        amountPerDay: "1000000",
        startDate: "1",
        endDate: "999999"
      },
      {
        id: "6",
        payoutAddress: getSttScriptAddress(),
        paidOutAmount: "0",
        policyId: "",
        assetName: "",
        amountPerDay: "2000000",
        startDate: "1",
        endDate: "999999"
      }
    ],
    intendedStakeCredential: INTENDED_STAKE_CREDENTIAL_NONE,
    lastPermissionlessPayoutAt: LAST_PERMISSIONLESS_PAYOUT_AT_NONE
  };
}

function buildMintTransaction(unit: string, liveUtxo: UTxO): TransactionInfo {
  return {
    index: 0,
    block: "b".repeat(64),
    hash: liveUtxo.input.txHash,
    slot: "123456",
    fees: "180000",
    size: 512,
    deposit: "0",
    invalidBefore: "0",
    invalidAfter: "999999999",
    inputs: [],
    outputs: [liveUtxo],
    blockHeight: 111,
    blockTime: 1_700_000_000
  };
}

export function createSttFixture() {
  const policyId = getSttPolicyId();
  const assetNameHex = "73747474657374";
  const unit = `${policyId}${assetNameHex}`;
  const datum = stateFormToDatum(buildState());
  const sttScriptAddress = getSttScriptAddress();
  const liveUtxo: UTxO = {
    input: {
      txHash: "a".repeat(64),
      outputIndex: 0
    },
    output: {
      address: sttScriptAddress,
      amount: [
        {
          unit: "lovelace",
          quantity: "5000000"
        },
        {
          unit,
          quantity: "1"
        }
      ],
      plutusData: serializeData(datum)
    }
  };
  const mintTransaction = buildMintTransaction(unit, liveUtxo);
  const transactionPageEntry: AddressTransactionPageEntry = {
    txHash: mintTransaction.hash,
    txIndex: mintTransaction.index,
    blockHeight: mintTransaction.blockHeight ?? null,
    blockTime: mintTransaction.blockTime ?? null
  };

  return {
    datum,
    liveUtxo,
    mintTransaction,
    policyId,
    sttScriptAddress,
    transactionPageEntry,
    unit
  };
}

export function createMockChainClient(): SttChainClient {
  const fixture = createSttFixture();

  return {
    async fetchCollectionAssets() {
      return {
        assets: [
          {
            unit: fixture.unit,
            quantity: "1"
          }
        ],
        next: null
      };
    },
    async fetchAddressUTxOs(_address, asset) {
      if (asset === fixture.unit) {
        return [fixture.liveUtxo];
      }

      return [];
    },
    async fetchAddressTransactionsPage(_address, page) {
      return page === 1 ? [fixture.transactionPageEntry] : [];
    },
    async fetchTxInfo(hash) {
      if (hash !== fixture.mintTransaction.hash) {
        throw new Error(`Unexpected transaction lookup for ${hash}`);
      }

      return fixture.mintTransaction;
    }
  };
}

export function buildForwardTransaction() {
  const fixture = createSttFixture();
  const nextUtxo: UTxO = {
    input: {
      txHash: "c".repeat(64),
      outputIndex: 0
    },
    output: {
      ...fixture.liveUtxo.output
    }
  };

  return {
    ...fixture.mintTransaction,
    hash: nextUtxo.input.txHash,
    inputs: [fixture.liveUtxo],
    outputs: [nextUtxo],
    index: 1,
    blockHeight: 112,
    blockTime: 1_700_000_100
  } satisfies TransactionInfo;
}

export function buildCloseTransaction() {
  const fixture = createSttFixture();

  return {
    ...fixture.mintTransaction,
    hash: "d".repeat(64),
    inputs: [fixture.liveUtxo],
    outputs: [],
    index: 2,
    blockHeight: 113,
    blockTime: 1_700_000_200
  } satisfies TransactionInfo;
}

export async function createTestDatabaseClient() {
  const db = new PrismaClient({ adapter: createPrismaAdapter() });
  await db.$connect();
  return db;
}

export async function resetTestDatabase(db: PrismaClient) {
  await db.sttParticipant.deleteMany();
  await db.sttWalletTransaction.deleteMany();
  await db.sttChainTransaction.deleteMany();
  await db.sttWallet.deleteMany();
  await db.sttSyncCursor.deleteMany();
}
