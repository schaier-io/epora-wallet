"use client";
import { detectedSttTokensAtom, detectedSttTokensErrorAtom, detectedSttTokensLoadingAtom, permissionWalletSummariesAtom, permissionWalletSummariesLoadingAtom } from "@/components/user/workspace/atoms/workspace-data.atoms";
import { configAtom } from "@/components/user/workspace/atoms/workspace-config.atoms";

import { useEffect } from "react";
import { useAtom, useSetAtom } from "jotai";
import { detectSttInfo } from "@/lib/mesh/detection";
import { resolveWalletSpendAddress } from "@/lib/contracts/blueprint";
import { EMPTY_CONTRACT_CONFIG, type Asset } from "@/lib/types/contracts";
import { fetchScriptUtxos, isAsset, mergeAmountLists } from "@/components/user/workspace/helpers";
import { type PermissionWalletLockedSummary } from "@/components/user/workspace/types";

type UseDetectedSttTokensInputs = {
  // Currently selected wallet unit (route state); used to preserve the selection
  // across a re-detect.
  selectedDetectedTokenUnit: string;
  setSelectedDetectedTokenUnit: (unit: string) => void;
  // The owning component keeps `config` (the active wallet's policy id etc.); the
  // detection results update it, so the setter is threaded in.
};

/**
 * Detects minted STT tokens (the user's smart wallets) and loads each wallet's
 * locked-asset summary. Extracted verbatim from `permission-wallet-workspace.tsx`.
 */
export function useDetectedSttTokens({
  selectedDetectedTokenUnit,
  setSelectedDetectedTokenUnit
}: UseDetectedSttTokensInputs) {
  const setConfig = useSetAtom(configAtom);
  const [detectedSttTokens, setDetectedSttTokens] = useAtom(detectedSttTokensAtom);
  const setDetectedSttTokensLoading = useSetAtom(detectedSttTokensLoadingAtom);
  const setDetectedSttTokensError = useSetAtom(detectedSttTokensErrorAtom);
  const setPermissionWalletSummaries = useSetAtom(permissionWalletSummariesAtom);
  const setPermissionWalletSummariesLoading = useSetAtom(permissionWalletSummariesLoadingAtom);

  useEffect(() => {
    // Legitimate async data-fetch effect (detects minted STT tokens on mount).
     
    let cancelled = false;
    setDetectedSttTokensLoading(true);
    setDetectedSttTokensError(null);

    void detectSttInfo()
      .then((detected) => {
        if (cancelled) {
          return;
        }

        setDetectedSttTokens(detected.tokens);
        setConfig({
          ...EMPTY_CONTRACT_CONFIG,
          walletPolicyId: detected.policyId
        });
      })
      .catch((error) => {
        if (!cancelled) {
          setDetectedSttTokens([]);
          setDetectedSttTokensError(
            error instanceof Error ? error.message : "Unable to detect minted STT tokens."
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setDetectedSttTokensLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [setConfig, setDetectedSttTokens, setDetectedSttTokensLoading, setDetectedSttTokensError]);

  useEffect(() => {
    // Legitimate data-fetch effect (loads per-wallet locked-asset summaries).
     
    if (detectedSttTokens.length === 0) {
      setPermissionWalletSummaries({});
      setPermissionWalletSummariesLoading(false);
      return;
    }

    let cancelled = false;
    setPermissionWalletSummariesLoading(true);

    void Promise.all(
      detectedSttTokens.map(async (token) => {
        try {
          const address = resolveWalletSpendAddress({
            sttPolicyId: token.policyId,
            sttAssetNameHex: token.assetNameHex
          });
          const utxos = await fetchScriptUtxos(address);

          return [
            token.unit,
            {
              address,
              lockedAssets: mergeAmountLists(utxos.map((utxo) => utxo.output.amount.filter(isAsset))),
              lockedUtxoCount: utxos.length,
              error: null
            }
          ] as const;
        } catch (error) {
          return [
            token.unit,
            {
              address: "",
              lockedAssets: [] as Asset[],
              lockedUtxoCount: 0,
              error:
                error instanceof Error
                  ? error.message
                  : "Unable to load smart wallet balance."
            }
          ] as const;
        }
      })
    )
      .then((summaries) => {
        if (cancelled) {
          return;
        }

        const nextSummaries = summaries.reduce<Record<string, PermissionWalletLockedSummary>>(
          (accumulator, [unit, summary]) => {
            accumulator[unit] = summary;
            return accumulator;
          },
          {}
        );
        setPermissionWalletSummaries(nextSummaries);
      })
      .finally(() => {
        if (!cancelled) {
          setPermissionWalletSummariesLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [detectedSttTokens, setPermissionWalletSummaries, setPermissionWalletSummariesLoading]);

  async function refreshDetectedTokens({ keepSelection = false } = {}) {
    setDetectedSttTokensLoading(true);
    setDetectedSttTokensError(null);

    try {
      const detected = await detectSttInfo();
      const preservedToken = detected.tokens.find((token) => token.unit === selectedDetectedTokenUnit);

      // During a post-submit re-detect (keepSelection), the selected State may be
      // briefly absent — its old UTxO is spent and the new one isn't indexed yet.
      // Skip this refresh tick rather than flashing the wallet away; a later tick
      // picks up the new State (and its updated datum, e.g. a renamed wallet).
      if (keepSelection && selectedDetectedTokenUnit && !preservedToken) {
        return detected;
      }

      setDetectedSttTokens(detected.tokens);

      if (!preservedToken) {
        setSelectedDetectedTokenUnit("");
        setConfig((current) => ({
          ...current,
          walletPolicyId: detected.policyId,
          sttAssetNameHex: "",
          walletAssetNameHex: ""
        }));
      }

      return detected;
    } catch (error) {
      setDetectedSttTokens([]);
      setDetectedSttTokensError(
        error instanceof Error ? error.message : "Unable to detect minted STT tokens."
      );
      throw error;
    } finally {
      setDetectedSttTokensLoading(false);
    }
  }

  async function refreshPermissionWalletSummaries(nextTokens = detectedSttTokens) {
    if (nextTokens.length === 0) {
      setPermissionWalletSummaries({});
      setPermissionWalletSummariesLoading(false);
      return;
    }

    setPermissionWalletSummariesLoading(true);

    try {
      const summaries = await Promise.all(
        nextTokens.map(async (token) => {
          try {
            const address = resolveWalletSpendAddress({
              sttPolicyId: token.policyId,
              sttAssetNameHex: token.assetNameHex
            });
            const utxos = await fetchScriptUtxos(address);

            return [
              token.unit,
              {
                address,
                lockedAssets: mergeAmountLists(utxos.map((utxo) => utxo.output.amount.filter(isAsset))),
                lockedUtxoCount: utxos.length,
                error: null
              }
            ] as const;
          } catch (error) {
            return [
              token.unit,
              {
                address: "",
                lockedAssets: [] as Asset[],
                lockedUtxoCount: 0,
                error:
                  error instanceof Error
                    ? error.message
                    : "Unable to load smart wallet balance."
              }
            ] as const;
          }
        })
      );

      const nextSummaries = summaries.reduce<Record<string, PermissionWalletLockedSummary>>(
        (accumulator, [unit, summary]) => {
          accumulator[unit] = summary;
          return accumulator;
        },
        {}
      );
      setPermissionWalletSummaries(nextSummaries);
    } finally {
      setPermissionWalletSummariesLoading(false);
    }
  }

  return {
    refreshDetectedTokens,
    refreshPermissionWalletSummaries
  };
}
