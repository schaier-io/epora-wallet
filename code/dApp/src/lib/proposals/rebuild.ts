import {
  buildConsolidateUtxosTx,
  buildSetIntendedStakeCredentialTx,
  buildSttSpendTx,
  buildWalletProposeTx,
  buildWalletPublishTx,
  buildWalletWithdrawTx
} from "@/lib/mesh/transactions";
import { ServerFetcher } from "@/lib/mesh/server-fetcher";
import { buildWalletIdentity, type SttWalletIdentity } from "@/lib/stt-cache/domain";
import type { BuildResult } from "@/lib/types/contracts";
import { type BrowserWallet } from "@meshsdk/core";
import { resolveProposalBodyHash } from "./serialization";
import type { ProposalBuildContext, ProposalBuilderKind, ProposalDetailDto } from "./types";

// Rebuild = replay the original builder against fresh chain state. The only part
// that moves for the state-forwarding family is the STT state UTxO (someone else
// transacted), so we re-point the consumed reference at the live state UTxO and
// re-run the same builder with the same intended output. Builders that derive
// their forwarded datum from the consumed state do so against the *new* state
// automatically; absolute-state actions (update-state) replay the proposer's
// intended end-state, which is exactly what was proposed.

// Builders we cannot safely auto-rebuild: ones whose consumed input is a moving
// funds UTxO (wallet-spend, consolidate funds) or which have no consumed state
// at all (lock-funds deposit, mint). These surface a clear message so the user
// recreates them from the workspace.
const AUTO_REBUILDABLE: ReadonlySet<ProposalBuilderKind> = new Set([
  "stt-spend",
  "wallet-withdraw",
  "wallet-publish",
  "wallet-propose",
  "set-intended-stake-credential",
  "consolidate-utxo"
]);

export function isAutoRebuildable(builder: ProposalBuilderKind): boolean {
  return AUTO_REBUILDABLE.has(builder);
}

export class RebuildUnsupportedError extends Error {}

async function findCurrentStateRef(
  fetcher: ServerFetcher,
  identity: SttWalletIdentity
): Promise<{ txHash: string; index: number }> {
  const utxos = await fetcher.fetchAddressUTxOs(identity.sttScriptAddress, identity.unit);
  const match = utxos.find((utxo) =>
    utxo.output.amount.some((asset) => asset.unit === identity.unit && BigInt(asset.quantity) > 0n)
  );
  if (!match) {
    throw new Error("The live wallet state UTxO could not be found on-chain.");
  }
  return { txHash: match.input.txHash, index: match.input.outputIndex };
}

// Re-points the consumed STT state reference at the live UTxO (mutates a parsed
// copy of the build context).
function applyCurrentStateRef(
  buildContext: ProposalBuildContext,
  ref: { txHash: string; index: number }
): void {
  const input = buildContext.input as { sttInputTxHash?: string; sttInputOutputIndex?: number };
  input.sttInputTxHash = ref.txHash;
  input.sttInputOutputIndex = ref.index;
}

async function dispatchBuild(
  wallet: BrowserWallet,
  buildContext: ProposalBuildContext
): Promise<BuildResult> {
  switch (buildContext.builder) {
    case "stt-spend":
      return buildSttSpendTx(wallet, buildContext.config, buildContext.mode, buildContext.input);
    case "wallet-withdraw":
      return buildWalletWithdrawTx(wallet, buildContext.config, buildContext.input);
    case "wallet-publish":
      return buildWalletPublishTx(wallet, buildContext.config, buildContext.input);
    case "wallet-propose":
      return buildWalletProposeTx(wallet, buildContext.config, buildContext.input);
    case "set-intended-stake-credential":
      return buildSetIntendedStakeCredentialTx(wallet, buildContext.config, buildContext.input);
    case "consolidate-utxo":
      return buildConsolidateUtxosTx(wallet, buildContext.config, buildContext.input);
    default:
      throw new RebuildUnsupportedError(
        `Auto-rebuild is not available for "${buildContext.builder}". Recreate it from the workspace.`
      );
  }
}

export type RebuildResult = {
  txHex: string;
  txBodyHash: string;
  buildContext: ProposalBuildContext;
};

export async function rebuildProposalTx(
  proposal: ProposalDetailDto,
  buildContext: ProposalBuildContext | null,
  wallet: BrowserWallet
): Promise<RebuildResult> {
  if (!buildContext) {
    throw new RebuildUnsupportedError(
      "This proposal has no saved build context, so it cannot be rebuilt automatically."
    );
  }
  if (!isAutoRebuildable(buildContext.builder)) {
    throw new RebuildUnsupportedError(
      `Auto-rebuild is not available for "${buildContext.builder}". Recreate it from the workspace.`
    );
  }

  const fetcher = new ServerFetcher();
  const identity = buildWalletIdentity(proposal.walletUnit, proposal.walletPolicyId);
  const currentRef = await findCurrentStateRef(fetcher, identity);
  applyCurrentStateRef(buildContext, currentRef);

  const result = await dispatchBuild(wallet, buildContext);
  return {
    txHex: result.txHex,
    txBodyHash: resolveProposalBodyHash(result.txHex),
    buildContext
  };
}
