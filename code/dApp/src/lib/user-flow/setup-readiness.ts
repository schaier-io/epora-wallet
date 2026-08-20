import type { ReadinessIssue, SetupState } from "@/components/user/flow-types";

// Pure derivation of the setup checklist (wallet connected, network, funds
// loaded, …) from the current SetupState. Each issue mirrors a prerequisite
// key in ./action-definitions.ts.
//
// Labels are neutral nouns, never claims. Each row's label is shared by its ready and its
// failing branch, so a label written for success ("Funds loaded", "Wallet opened",
// "Receive address ready") rendered in bold above a red row that said the opposite. The
// icon carries the status; the label only names the thing.

export function buildSetupReadinessIssues(setupState: SetupState): ReadinessIssue[] {
  const walletIssue: ReadinessIssue = setupState.walletName
    ? {
        id: "wallet",
        key: "wallet",
        label: "Connected wallet",
        description: `Connected to ${setupState.walletName}.`,
        status: "ready",
        blocking: false
      }
    : {
        id: "wallet",
        key: "wallet",
        label: "Connected wallet",
        description: "Connect your browser wallet first.",
        status: "error",
        blocking: true
      };

  const preprodIssue: ReadinessIssue =
    setupState.networkId === null
      ? {
          id: "preprod",
          key: "preprod",
          label: "Test network",
          description: "Network will be checked once a wallet is connected.",
          status: "warning",
          blocking: true
        }
      : setupState.networkId === 0
        ? {
            id: "preprod",
            key: "preprod",
            label: "Test network",
            description: "The connected wallet is on Preprod.",
            status: "ready",
            blocking: false
          }
        : {
            id: "preprod",
            key: "preprod",
            label: "Test network",
            description: "Switch the connected wallet to Preprod.",
            status: "error",
            blocking: true
          };

  const detectedTokenIssue: ReadinessIssue = setupState.hasDetectedToken
    ? {
        id: "detected-token",
        key: "detected-token",
        label: "Smart wallet",
        description: "This smart wallet is open and ready.",
        status: "ready",
        blocking: false
      }
    : {
        id: "detected-token",
        key: "detected-token",
        label: "Smart wallet",
        description:
          "Choose a detected smart wallet before using this action.",
        status: "warning",
        blocking: true
      };

  const sttReferenceIssue: ReadinessIssue =
    setupState.sharedSttReferenceStatus === "loading"
      ? {
          id: "stt-reference",
          key: "stt-reference",
          label: "Setup helper",
          description: "Checking wallet setup now.",
          status: "warning",
          blocking: true
        }
      : setupState.sharedSttReferenceStatus === "ready"
        ? {
            id: "stt-reference",
            key: "stt-reference",
            label: "Setup helper",
            description: "The shared setup helper is ready.",
            status: "ready",
            blocking: false
          }
      : {
          id: "stt-reference",
          key: "stt-reference",
          label: "Setup helper",
          description:
            setupState.sharedSttReferenceError ??
            "Create the shared setup helper before continuing.",
          status: "warning",
          blocking: true
        };

  const lockingContractIssue: ReadinessIssue = setupState.lockingContractAddress
    ? {
        id: "locking-contract",
        key: "locking-contract",
        label: "Receive address",
        description: "The wallet receive address is ready.",
        status: "ready",
        blocking: false
      }
    : {
        id: "locking-contract",
        key: "locking-contract",
        label: "Receive address",
        description:
          setupState.lockingContractError ??
          "Open a wallet before using its receive address.",
        status: "error",
        blocking: true
      };

  const lockedUtxoIssue: ReadinessIssue = setupState.lockedUtxosLoading
    ? {
        id: "locked-utxos",
        key: "locked-utxos",
        label: "Wallet funds",
        description: "Refreshing wallet funds now.",
        status: "warning",
        blocking: true
      }
    : setupState.lockingContractAddress && setupState.lockedUtxoCount > 0
      ? {
          id: "locked-utxos",
          key: "locked-utxos",
          label: "Wallet funds",
          description: `${setupState.lockedUtxoCount} fund pool${setupState.lockedUtxoCount === 1 ? "" : "s"} found.`,
          status: "ready",
          blocking: false
        }
      : {
          id: "locked-utxos",
          key: "locked-utxos",
          label: "Wallet funds",
          description:
            "No wallet funds are loaded yet. Refresh after receiving funds or choose another action.",
          status: "warning",
          blocking: true
        };

  return [
    walletIssue,
    preprodIssue,
    detectedTokenIssue,
    sttReferenceIssue,
    lockingContractIssue,
    lockedUtxoIssue
  ];
}
