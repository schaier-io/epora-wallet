"use client";
import { useTranslations } from "next-intl";

import { useCallback, useEffect, useState } from "react";
import {
  completeSignIn,
  fetchProposalSession,
  getProposalErrorMessage,
  requestSignInNonce,
  signOutProposals,
  type ProposalSessionInfo
} from "@/lib/proposals/client";
import { useWalletContext } from "@/providers/wallet-provider";

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
  const [session, setSession] = useState<ProposalSessionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchProposalSession()
      .then((value) => {
        if (!cancelled) {
          setSession(value);
        }
      })
      .catch((caught) => {
        if (!cancelled) {
          setError(
            getProposalErrorMessage(
              caught,
              i18n("couldnTLoadProposalSessionTryAgain")
            )
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [i18n]);

  const signIn = useCallback(async () => {
    if (!activeWallet || !activeAddress) {
      setError(i18n("connectABrowserWalletBeforeSigningIn"));
      return;
    }
    if (isDemoWallet) {
      setError(i18n("theDemoWalletIsReadOnlyAndCannot"));
      return;
    }

    setSigningIn(true);
    setError(null);
    try {
      const nonce = await requestSignInNonce(activeAddress);
      const dataSignature = await activeWallet.signData(nonce, activeAddress);
      const result = await completeSignIn({
        address: activeAddress,
        nonce,
        signature: dataSignature.signature,
        key: dataSignature.key
      });
      setSession(result);
    } catch (caught) {
      setError(getProposalErrorMessage(caught, i18n("couldnTSignInTryAgain")));
    } finally {
      setSigningIn(false);
    }
  }, [activeAddress, activeWallet, i18n, isDemoWallet]);

  const signOut = useCallback(async () => {
    setError(null);
    try {
      await signOutProposals();
      setSession(null);
    } catch {
      setError(i18n("couldnTSignOutTryAgain"));
    }
  }, [i18n]);

  // A MISSING key is deliberately not a mismatch. The wallet layer reconnects after the first
  // paint, so reading that gap as "a different wallet" would flash the sign-in gate on every
  // load. Only a key that is present and different contradicts the session.
  const connectedWalletMismatch = Boolean(
    session && activePaymentKeyHash && activePaymentKeyHash !== session.paymentKeyHash
  );

  return { session, connectedWalletMismatch, activeAddress, loading, signingIn, error, signIn, signOut };
}
