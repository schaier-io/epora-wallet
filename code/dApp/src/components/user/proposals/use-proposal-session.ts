"use client";
import { BetaConsentRequiredError, requireBrowserBetaConsent } from "@/lib/legal/browser-beta-consent";
import { useTranslations } from "next-intl";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  completeSignIn,
  getProposalErrorMessage,
  requestSignInNonce,
  signOutProposals,
  type ProposalSessionInfo
} from "@/lib/proposals/client";
import { useWalletContext } from "@/providers/wallet-provider";
import { clearProposalQueries, proposalKeys, proposalSessionQueryOptions } from "@/lib/proposals/query";

// All hook instances share one cookie. Serialize only the requests that change it,
// so an old wallet prompt cannot block a newer sign-in.
let authRevision = 0;
let pendingSessionWrite = Promise.resolve();
function writeSession<T>(isCurrent: () => boolean, write: () => Promise<T>) {
  const result = pendingSessionWrite.then(() => isCurrent() ? write() : undefined);
  pendingSessionWrite = result.then(() => {}, () => {});
  return result;
}

export type ProposalSessionController = {
  session: ProposalSessionInfo | null;
  /**
   * A wallet is connected, and it is not the one that signed in. The session cookie outlives
   * the connection, so switching account inside the extension left this page listing the
   * previous account's approval requests while every signature it produced came from the new
   * one. Callers treat this as signed-out.
   */
  connectedWalletMismatch: boolean;
  /**
   * The connected wallet's address, so the page can name the signed-in identity in user terms
   * (an address recognizable in a wallet or explorer) rather than the key hash the session is
   * actually built on. Null when no wallet address is readable.
   */
  activeAddress: string | null;
  loading: boolean;
  signingIn: boolean;
  error: string | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
};

// Manages the wallet sign-in session for the proposals area. Sign-in is a CIP-30
// `signData` over a server nonce, proving control of the key, with no password.
export function useProposalSession(): ProposalSessionController {
  const i18n = useTranslations("ComponentsUserProposalsUseProposalSession");
  const { activeWallet, activeAddress, activePaymentKeyHash, isDemoWallet } = useWalletContext();
  const queryClient = useQueryClient();
  const sessionQuery = useQuery(proposalSessionQueryOptions());
  const session = sessionQuery.data ?? null;
  const [error, setError] = useState<string | null>(null);
  const previousSigner = useRef<string | undefined>(undefined);
  const authInFlight = useRef<number | null>(null);
  const lifecycle = useRef(0);


  function beginAuth() {
    const revision = ++authRevision;
    const token = lifecycle.current;
    authInFlight.current = revision;
    return { revision, isCurrent: () => revision === authRevision && token === lifecycle.current };
  }

  useEffect(() => {
    if (sessionQuery.isPending) return;
    const signer = session?.paymentKeyHash;
    if (previousSigner.current && previousSigner.current !== signer) {
      clearProposalQueries(queryClient, previousSigner.current);
    }
    previousSigner.current = signer;
  }, [queryClient, session?.paymentKeyHash, sessionQuery.isPending]);

  const signInMutation = useMutation({
    mutationFn: async (isCurrent: () => boolean) => {
      if (!isCurrent()) return;
      if (!activeWallet || !activeAddress) throw new Error("Wallet unavailable");
      const nonce = await requestSignInNonce(activeAddress);
      if (!isCurrent()) return;
      await requireBrowserBetaConsent();
      if (!isCurrent()) return;
      const dataSignature = await activeWallet.signData(nonce, activeAddress);
      if (!isCurrent()) return;
      return writeSession(isCurrent, () => completeSignIn({
        address: activeAddress,
        nonce,
        signature: dataSignature.signature,
        key: dataSignature.key
      }));
    },
    retry: false,
    networkMode: "always"
  });
  const signOutMutation = useMutation({
    mutationFn: (isCurrent: () => boolean) => writeSession(isCurrent, signOutProposals),
    retry: false,
    networkMode: "always"
  });

  const resetSignIn = signInMutation.reset;
  useLayoutEffect(() => {
    lifecycle.current += 1;
    resetSignIn();
    authInFlight.current = null;
    return () => { lifecycle.current += 1; };
  }, [activeWallet, activeAddress, activePaymentKeyHash, resetSignIn]);

  async function signIn() {
    if (authInFlight.current !== null) return;
    if (!activeWallet || !activeAddress) {
      setError(i18n("connectABrowserWalletBeforeSigningIn"));
      return;
    }
    if (isDemoWallet) {
      setError(i18n("theDemoWalletIsReadOnlyAndCannot"));
      return;
    }
    const { revision, isCurrent } = beginAuth();
    setError(null);
    try {
      await queryClient.cancelQueries({ queryKey: proposalKeys.session });
      const result = await signInMutation.mutateAsync(isCurrent);
      if (!isCurrent() || !result) return;
      await queryClient.cancelQueries({ queryKey: proposalKeys.session });
      if (!isCurrent() || !result) return;
      clearProposalQueries(queryClient);
      queryClient.setQueryData(proposalKeys.session, result);
    } catch (caught) {
      if (isCurrent()) setError(caught instanceof BetaConsentRequiredError ? caught.message : getProposalErrorMessage(caught, i18n("couldnTSignInTryAgain")));
    } finally {
      if (authInFlight.current === revision) authInFlight.current = null;
    }
  }

  async function signOut() {
    if (authInFlight.current !== null) return;
    const { revision, isCurrent } = beginAuth();
    setError(null);
    try {
      await queryClient.cancelQueries({ queryKey: proposalKeys.session });
      await signOutMutation.mutateAsync(isCurrent);
      if (!isCurrent()) return;
      await queryClient.cancelQueries({ queryKey: proposalKeys.session });
      if (!isCurrent()) return;
      clearProposalQueries(queryClient);
      queryClient.setQueryData(proposalKeys.session, null);
    } catch {
      if (isCurrent()) setError(i18n("couldnTSignOutTryAgain"));
    } finally {
      if (authInFlight.current === revision) authInFlight.current = null;
    }
  }

  // A MISSING key is deliberately not a mismatch. The wallet layer reconnects after the first
  // paint, so reading that gap as "a different wallet" would flash the sign-in gate on every
  // load. Only a key that is present and different contradicts the session.
  const connectedWalletMismatch = Boolean(
    session && activePaymentKeyHash && activePaymentKeyHash !== session.paymentKeyHash
  );

  return {
    session,
    connectedWalletMismatch,
    activeAddress,
    loading: sessionQuery.isPending,
    signingIn: signInMutation.isPending,
    error: error ?? (sessionQuery.error
      ? getProposalErrorMessage(sessionQuery.error, i18n("couldnTLoadProposalSessionTryAgain"))
      : null),
    signIn,
    signOut
  };
}
