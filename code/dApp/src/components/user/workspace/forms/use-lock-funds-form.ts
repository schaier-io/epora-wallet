"use client";

import { useAtom } from "jotai";
import { lockFundsAssetsAtom } from "@/components/user/workspace/atoms/forms/lock-funds-form.atoms";

/**
 * Form state for the lock-funds action (assets to send into the smart wallet).
 */
export function useLockFundsForm() {
  const [lockFundsAssets, setLockFundsAssets] = useAtom(lockFundsAssetsAtom);

  return {
    lockFundsAssets,
    setLockFundsAssets
  };
}
