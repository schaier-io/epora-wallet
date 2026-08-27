"use client";
import { useTranslations } from "next-intl";

import { detectedSttTokensAtom, detectedSttTokensErrorAtom, detectedSttTokensLoadingAtom, permissionWalletSummariesAtom, permissionWalletSummariesLoadingAtom } from "@/components/user/workspace/atoms/workspace-data.atoms";
import { configAtom } from "@/components/user/workspace/atoms/workspace-config.atoms";

import { useEffect, useRef } from "react";
import { useAtom, useSetAtom } from "jotai";
import { detectSttInfo } from "@/lib/mesh/detection";
import { getSttMintPolicyId, resolveWalletSpendAddress } from "@/lib/contracts/blueprint";
import { EMPTY_CONTRACT_CONFIG, type Asset } from "@/lib/types/contracts";
import { fetchScriptUtxos, isAsset, mergeAmountLists } from "@/components/user/workspace/helpers";
import { type PermissionWalletLockedSummary } from "@/components/user/workspace/types";
import { getUserFacingErrorMessage } from "@/lib/utils/errors";

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
  const i18n = useTranslations("ComponentsUserWorkspaceUseDetectedSttTokens");
  const setConfig = useSetAtom(configAtom);
  const [detectedSttTokens, setDetectedSttTokens] = useAtom(detectedSttTokensAtom);
  const setDetectedSttTokensLoading = useSetAtom(detectedSttTokensLoadingAtom);
  const setDetectedSttTokensError = useSetAtom(detectedSttTokensErrorAtom);
  const setPermissionWalletSummaries = useSetAtom(permissionWalletSummariesAtom);
  const setPermissionWalletSummariesLoading = useSetAtom(permissionWalletSummariesLoadingAtom);

  // The STT mint policy id is the contract/validator hash from the blueprint.
  // Re-key detection on it so a contract change (redeploy, or a blueprint sync +
  // dev HMR) re-detects under the new policy. Read on every render so it always
  // reflects the current blueprint.
  const currentSttPolicyId = getSttMintPolicyId();
  const previousSttPolicyIdRef = useRef<string | null>(null);
  // Held in a ref so the detection effect need NOT list it as a dependency. This
  // setter closes over the workspace route dispatch, whose identity changes on
  // every URL change; depending on it made detection re-run on every navigation
  // and — because the success path rewrites config — clobber the wallet asset
  // name the selection effect had just seeded (locking/receive address then read
  // "unavailable"). Detection must re-key on the policy id ALONE.
  const setSelectedDetectedTokenUnitRef = useRef(setSelectedDetectedTokenUnit);
  // Keep the ref current via an effect rather than writing it during render
  // (react-hooks/refs). The setter only ever dispatches "clear selected wallet",
  // so a one-render lag is harmless, and detection reads `.current` only inside
  // its own effect (after commit).
  useEffect(() => {
    setSelectedDetectedTokenUnitRef.current = setSelectedDetectedTokenUnit;
  }, [setSelectedDetectedTokenUnit]);

  useEffect(() => {
    // Detects minted STT tokens; re-runs only when the STT policy hash changes.
    let cancelled = false;
    const policyChanged =
      previousSttPolicyIdRef.current !== null &&
      previousSttPolicyIdRef.current !== currentSttPolicyId;
    previousSttPolicyIdRef.current = currentSttPolicyId;

    if (policyChanged) {
      // The cached wallets belong to the OLD contract — flush them (and any
      // selection) immediately so stale wallets are never shown while the
      // re-detect under the new policy is in flight.
      setDetectedSttTokens([]);
      setSelectedDetectedTokenUnitRef.current("");
    }

    setDetectedSttTokensLoading(true);
    setDetectedSttTokensError(null);

    void detectSttInfo()
      .then((detected) => {
        if (cancelled) {
          return;
        }

        setDetectedSttTokens(detected.tokens);
        // Only (re)write the policy id; PRESERVE the asset name and other fields
        // the selection effect seeds for the open wallet. A bare overwrite would
        // wipe config.walletAssetNameHex on any re-run and break address
        // derivation. Reset to the empty config only when the policy actually
        // changed (different contract → the old wallet's asset name is stale).
        setConfig((current) =>
          current.walletPolicyId === detected.policyId
            ? { ...current, walletPolicyId: detected.policyId }
            : { ...EMPTY_CONTRACT_CONFIG, walletPolicyId: detected.policyId }
        );
      })
      .catch((error) => {
        if (!cancelled) {
          setDetectedSttTokens([]);
          setDetectedSttTokensError(
            getUserFacingErrorMessage(
              error,
              i18n("couldnTCheckTheChainForSmartWallets")
            )
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
  }, [
    currentSttPolicyId,
    setConfig,
    setDetectedSttTokens,
    setDetectedSttTokensLoading,
    setDetectedSttTokensError,
    i18n
  ]);

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
              error: getUserFacingErrorMessage(
                error,
                i18n("couldnTLoadThisSmartWalletSBalance")
              )
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
  }, [detectedSttTokens, i18n, setPermissionWalletSummaries, setPermissionWalletSummariesLoading]);

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
        getUserFacingErrorMessage(
          error,
          i18n("couldnTCheckTheChainForSmartWallets")
        )
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
                error: getUserFacingErrorMessage(
                  error,
                  i18n("couldnTLoadThisSmartWalletSBalance")
                )
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
