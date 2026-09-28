"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { useWalletContext } from "@/providers/wallet-provider";

// Reviews belong to the wallet session that started the action. Retiring that
// session settles each open review so its action can release the input lease.
export function usePayeeActionSession(settleStopReview: (approved: boolean) => void) {
  const { activeWallet, activeAddress, activePaymentKeyHash, isDemoWallet, networkId } = useWalletContext();
  const sessionRef = useRef<object | null>(null);
  const [warningReview, setWarningReview] = useState<readonly string[] | null>(null);
  const warningReviewRef = useRef<{ resolve: (approved: boolean) => void } | null>(null);
  const settleWarningReview = useCallback((approved: boolean) => {
    const review = warningReviewRef.current;
    warningReviewRef.current = null;
    setWarningReview(null);
    review?.resolve(approved);
  }, []);

  useLayoutEffect(() => {
    sessionRef.current = {};
    return () => {
      sessionRef.current = null;
      settleStopReview(false);
      settleWarningReview(false);
    };
  }, [activeWallet, activeAddress, activePaymentKeyHash, isDemoWallet, networkId, settleStopReview, settleWarningReview]);

  return { sessionRef, warningReview, warningReviewRef, setWarningReview, settleWarningReview };
}
