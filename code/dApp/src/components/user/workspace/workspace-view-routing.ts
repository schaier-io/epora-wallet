import type { UserWorkspaceMode } from "@/components/user/flow-types";

/**
 * Whether the workspace should show the wallet chooser instead of the mode it was asked for.
 *
 * Every smart wallet on the policy is listed to every visitor, so a selected wallet is not
 * proof of a right to use it. Once the wallet's own rules say the connected key holds no role
 * in it, opening its workspace would only offer actions the rules reject, so the chooser is
 * the honest screen.
 *
 * That diversion belongs to `existing-wallet` alone. Creating a wallet does not act on the
 * selected one, so the roles held in it say nothing about whether the setup form may open.
 * While the check applied to every mode, pressing "Start setup" with such a wallet selected
 * moved the URL to `action=create-wallet`, moved the header and the document title to
 * "Create wallet", and left the body on the chooser: the button read as dead, and the only
 * way through was to delete the `wallet` parameter from the URL by hand.
 *
 * Pure and separate from the view so the rule can be read and tested on its own; the JSX had
 * it inline as a two-term boolean, which is where the missing term hid.
 */
export function shouldForwardToWalletSelection({
  workspaceMode,
  selectedWalletIsUsable
}: {
  workspaceMode: UserWorkspaceMode;
  selectedWalletIsUsable: boolean;
}): boolean {
  if (workspaceMode === "landing") {
    return true;
  }

  return workspaceMode === "existing-wallet" && !selectedWalletIsUsable;
}

/**
 * Whether the landing screen should say the demo wallet cannot look smart wallets up,
 * instead of running its "Detecting wallets…" state.
 *
 * The demo wallet is a read-only shim with a fake address, so the inventory lookup never
 * resolves for it. Measured on `/user` with the demo connected: the spinner ran for minutes
 * with no network request at all and no error, because `detectedSttTokensLoading` stays true
 * and `detectedSttTokensErrorAtom` never produces a message. The connect dialog offers the
 * demo to "browse the app without a wallet extension", so that is a state this path can
 * reach and never leave.
 *
 * Scoped to the demo wallet on purpose. A real wallet whose lookup is slow still gets the
 * loading state, so a genuine failure there stays visible rather than being papered over.
 *
 * Pure and separate from the view for the same reason as the rule above: a three-term
 * boolean inline in JSX cannot be tested without mounting the whole workspace.
 */
export function shouldShowDemoLookupLimit({
  workspaceMode,
  detectedSttTokensLoading,
  isDemoWallet
}: {
  workspaceMode: UserWorkspaceMode;
  detectedSttTokensLoading: boolean;
  isDemoWallet: boolean;
}): boolean {
  return workspaceMode === "landing" && detectedSttTokensLoading && isDemoWallet;
}
