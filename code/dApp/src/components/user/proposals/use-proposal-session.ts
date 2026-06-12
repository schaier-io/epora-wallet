"use client";
import { useCallback, useEffect, useState } from "react";
import {
  completeSignIn,
  fetchProposalSession,
  requestSignInNonce,
  signOutProposals,
  type ProposalSessionInfo
} from "@/lib/proposals/client";
import { useWalletContext } from "@/providers/wallet-provider";

export type ProposalSessionController = {
  session: ProposalSessionInfo | null;
  loading: boolean;
  signingIn: boolean;
  error: string | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
};

// Manages the wallet sign-in session for the proposals area. Sign-in is a CIP-30
// `signData` over a server nonce — proving control of the key, with no password.
export function useProposalSession(): ProposalSessionController {
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
      setError("Connect a browser wallet before signing in.");
      return;
    }
    if (isDemoWallet) {
      setError("The demo wallet is read-only and cannot sign in.");
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
      setError(caught instanceof Error ? caught.message : "Sign-in failed.");
    } finally {
      setSigningIn(false);
    }
  }, [activeWallet, activeAddress, isDemoWallet]);

  const signOut = useCallback(async () => {
    await signOutProposals();
    setSession(null);
  }, []);

  return { session, loading, signingIn, error, signIn, signOut };
}
