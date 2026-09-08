"use client";
import { useTranslations } from "next-intl";

import { useEffect, useRef, useState } from "react";
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
  const authInFlight = useRef(false);

  useEffect(() => {
    if (sessionQuery.isPending) return;
    const signer = session?.paymentKeyHash;
    if (previousSigner.current && previousSigner.current !== signer) {
      clearProposalQueries(queryClient, previousSigner.current);
    }
    previousSigner.current = signer;
  }, [queryClient, session?.paymentKeyHash, sessionQuery.isPending]);

  const signInMutation = useMutation({
    mutationFn: async () => {
      if (!activeWallet || !activeAddress) throw new Error("Wallet unavailable");
      const nonce = await requestSignInNonce(activeAddress);
      const dataSignature = await activeWallet.signData(nonce, activeAddress);
      return completeSignIn({
        address: activeAddress,
        nonce,
        signature: dataSignature.signature,
        key: dataSignature.key
      });
    },
    retry: false,
    networkMode: "always"
  });
  const signOutMutation = useMutation({
    mutationFn: () => signOutProposals(),
    retry: false,
    networkMode: "always"
  });

  async function signIn() {
    if (authInFlight.current) return;
    if (!activeWallet || !activeAddress) {
      setError(i18n("connectABrowserWalletBeforeSigningIn"));
      return;
    }
    if (isDemoWallet) {
      setError(i18n("theDemoWalletIsReadOnlyAndCannot"));
      return;
    }
    authInFlight.current = true;
    setError(null);
    try {
      await queryClient.cancelQueries({ queryKey: proposalKeys.session });
      const result = await signInMutation.mutateAsync();
      await queryClient.cancelQueries({ queryKey: proposalKeys.session });
      clearProposalQueries(queryClient);
      queryClient.setQueryData(proposalKeys.session, result);
    } catch (caught) {
      setError(getProposalErrorMessage(caught, i18n("couldnTSignInTryAgain")));
    } finally {
      authInFlight.current = false;
    }
  }

  async function signOut() {
    if (authInFlight.current) return;
    authInFlight.current = true;
    setError(null);
    try {
      await queryClient.cancelQueries({ queryKey: proposalKeys.session });
      await signOutMutation.mutateAsync();
      await queryClient.cancelQueries({ queryKey: proposalKeys.session });
      clearProposalQueries(queryClient);
      queryClient.setQueryData(proposalKeys.session, null);
    } catch {
      setError(i18n("couldnTSignOutTryAgain"));
    } finally {
      authInFlight.current = false;
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
