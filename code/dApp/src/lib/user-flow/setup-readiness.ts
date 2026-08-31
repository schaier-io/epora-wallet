import type { ReadinessIssue, SetupState } from "@/components/user/flow-types";
import { createDefaultTranslator } from "@/i18n/default-translator";
import defaultMessages from "@/i18n/generated/default-en/LibUserFlowSetupReadiness.json";

const i18n = createDefaultTranslator("LibUserFlowSetupReadiness", defaultMessages);

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
        label: i18n("connectedWallet"),
        description: i18n("connectedToValue1", { value1: setupState.walletName }),
        status: "ready",
        blocking: false
      }
    : {
        id: "wallet",
        key: "wallet",
        label: i18n("connectedWallet"),
        description: i18n("connectYourBrowserWalletFirst"),
        status: "error",
        blocking: true
      };

  const preprodIssue: ReadinessIssue =
    setupState.networkId === null
      ? {
          id: "preprod",
          key: "preprod",
          label: i18n("testNetwork"),
          description: i18n("networkWillBeCheckedOnceAWalletIs"),
          status: "warning",
          blocking: true
        }
      : setupState.networkId === 0
        ? {
            id: "preprod",
            key: "preprod",
            label: i18n("testNetwork"),
            description: i18n("theConnectedWalletIsOnPreprod"),
            status: "ready",
            blocking: false
          }
        : {
            id: "preprod",
            key: "preprod",
            label: i18n("testNetwork"),
            description: i18n("switchTheConnectedWalletToPreprod"),
            status: "error",
            blocking: true
          };

  const detectedTokenIssue: ReadinessIssue = setupState.hasDetectedToken
    ? {
        id: "detected-token",
        key: "detected-token",
        label: i18n("smartWallet"),
        description: i18n("thisSmartWalletIsOpenAndReady"),
        status: "ready",
        blocking: false
      }
    : {
        id: "detected-token",
        key: "detected-token",
        label: i18n("smartWallet"),
        description:
          i18n("chooseADetectedSmartWalletBeforeUsingThis"),
        status: "warning",
        blocking: true
      };

  const sttReferenceIssue: ReadinessIssue =
    setupState.sharedSttReferenceStatus === "loading"
      ? {
          id: "stt-reference",
          key: "stt-reference",
          label: i18n("setupHelper"),
          description: i18n("checkingWalletSetupNow"),
          status: "warning",
          blocking: true
        }
      : setupState.sharedSttReferenceStatus === "ready"
        ? {
            id: "stt-reference",
            key: "stt-reference",
            label: i18n("setupHelper"),
            description: i18n("theSharedSetupHelperIsReady"),
            status: "ready",
            blocking: false
          }
      : {
          id: "stt-reference",
          key: "stt-reference",
          label: i18n("setupHelper"),
          description:
            setupState.sharedSttReferenceError ??
            i18n("createTheSharedSetupHelperBeforeContinuing"),
          status: "warning",
          blocking: true
        };

  const lockingContractIssue: ReadinessIssue = setupState.lockingContractAddress
    ? {
        id: "locking-contract",
        key: "locking-contract",
        label: i18n("receiveAddress"),
        description: i18n("theWalletReceiveAddressIsReady"),
        status: "ready",
        blocking: false
      }
    : {
        id: "locking-contract",
        key: "locking-contract",
        label: i18n("receiveAddress"),
        description:
          setupState.lockingContractError ??
          i18n("openAWalletBeforeUsingItsReceiveAddress"),
        status: "error",
        blocking: true
      };

  const lockedUtxoIssue: ReadinessIssue = setupState.lockedUtxosLoading
    ? {
        id: "locked-utxos",
        key: "locked-utxos",
        label: i18n("walletFunds"),
        description: i18n("refreshingWalletFundsNow"),
        status: "warning",
        blocking: true
      }
    : setupState.lockingContractAddress && setupState.lockedUtxoCount > 0
      ? {
          id: "locked-utxos",
          key: "locked-utxos",
          label: i18n("walletFunds"),
          description: i18n("value1FundPoolValue2Found", { value1: setupState.lockedUtxoCount, value2: setupState.lockedUtxoCount === 1 ? "" : "s" }),
          status: "ready",
          blocking: false
        }
      : {
          id: "locked-utxos",
          key: "locked-utxos",
          label: i18n("walletFunds"),
          description:
            i18n("noWalletFundsAreLoadedYetRefreshAfter"),
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
