"use client";
import { useTranslations } from "next-intl";

import { useCallback, useEffect, useState } from "react";
import {
  completeSignIn,
  fetchProposalSession,
  requestSignInNonce,
  signOutProposals,
  type ProposalSessionInfo
} from "@/lib/proposals/client";
import { useWalletContext } from "@/providers/wallet-provider";
import { getUserFacingErrorMessage } from "@/lib/utils/errors";

export type ProposalSessionController = {
  session: ProposalSessionInfo | null;
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
  const { activeWallet, activeAddress, isDemoWallet } = useWalletContext();
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
      .catch(() => {
        // treat as signed-out
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
      setError(getUserFacingErrorMessage(caught, i18n("couldnTSignInTryAgain")));
    } finally {
      setSigningIn(false);
    }
  }, [activeAddress, activeWallet, i18n, isDemoWallet]);

  const signOut = useCallback(async () => {
    await signOutProposals();
    setSession(null);
  }, []);

  return { session, loading, signingIn, error, signIn, signOut };
}
