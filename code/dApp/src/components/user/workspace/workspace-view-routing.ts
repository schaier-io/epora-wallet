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
