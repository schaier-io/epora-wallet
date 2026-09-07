"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { WalletConnectionDialog } from "@/components/layout/wallet-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  SUBMIT_CONFIRMATION_INITIAL_DELAY_MS,
  SUBMIT_CONFIRMATION_MAX_ATTEMPTS,
  SUBMIT_CONFIRMATION_POLL_MS
} from "@/components/user/workspace/constants";
import {
  detectSharedSttReferenceStore,
  type SharedSttReferenceStoreInfo
} from "@/lib/mesh/detection";
import { saveSttReference } from "@/lib/mesh/stt-reference-storage";
import {
  buildDeploySharedSttReferenceTx,
  DEFAULT_SHARED_STT_REFERENCE_LOVELACE,
  signAndSubmitTx
} from "@/lib/mesh/transactions";
import type { BuildResult } from "@/lib/types/contracts";
import { getUserFacingErrorMessage } from "@/lib/utils/errors";
import { useWalletContext } from "@/providers/wallet-provider";

type SetupPhase = "idle" | "checking" | "building" | "review" | "submitting" | "confirming";

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function SttReferenceSetup({
  initialStore
}: {
  initialStore: SharedSttReferenceStoreInfo | null;
}) {
  const i18n = useTranslations("ComponentsSetupSttReference");
  const router = useRouter();
  const { activeAddress, activeWallet, isDemoWallet, networkId } = useWalletContext();
  const [connectionOpen, setConnectionOpen] = useState(false);
  const [store, setStore] = useState(initialStore);
  const [preview, setPreview] = useState<BuildResult | null>(null);
  const [submittedReference, setSubmittedReference] = useState<string | null>(null);
  const [phase, setPhase] = useState<SetupPhase>(initialStore ? "idle" : "checking");
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  const inFlight = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (store?.status === "ready") {
      router.replace("/");
      return;
    }
    if (store || initialStore) return;
    let cancelled = false;

    void detectSharedSttReferenceStore()
      .then((result) => {
        if (cancelled || !mounted.current) return;
        setStore(result);
        if (result.status === "ready") router.replace("/");
      })
      .catch((cause) => {
        if (!cancelled && mounted.current) {
          setError(getUserFacingErrorMessage(cause, i18n("checkFailed")));
        }
      })
      .finally(() => {
        if (!cancelled && mounted.current) setPhase("idle");
      });
    return () => {
      cancelled = true;
    };
  }, [i18n, initialStore, router, store]);

  const connected = Boolean(activeWallet && activeAddress);
  const canBuild = connected && !isDemoWallet && networkId === 0 && phase === "idle" && !submittedReference;
  const busy = phase === "checking" || phase === "building" || phase === "submitting" || phase === "confirming";

  async function buildPreview() {
    if (!activeWallet || !canBuild || inFlight.current) return;
    inFlight.current = true;
    setPhase("building");
    setError(null);
    try {
      const result = await buildDeploySharedSttReferenceTx(activeWallet, {
        lockedLovelace: DEFAULT_SHARED_STT_REFERENCE_LOVELACE,
        useExactLovelace: false
      });
      if (!Number.isSafeInteger(result.referenceScriptOutputIndex) || result.referenceScriptOutputIndex! < 0) {
        throw new Error(i18n("missingOutputIndex"));
      }
      if (!mounted.current) return;
      setPreview(result);
      setPhase("review");
    } catch (cause) {
      if (!mounted.current) return;
      setError(getUserFacingErrorMessage(cause, i18n("buildFailed")));
      setPhase("idle");
    } finally {
      inFlight.current = false;
    }
  }

  async function confirmDeployment(reference: string) {
    for (let attempt = 1; attempt <= SUBMIT_CONFIRMATION_MAX_ATTEMPTS; attempt += 1) {
      await delay(attempt === 1 ? SUBMIT_CONFIRMATION_INITIAL_DELAY_MS : SUBMIT_CONFIRMATION_POLL_MS);
      try {
        const result = await detectSharedSttReferenceStore();
        if (!mounted.current) return;
        setStore(result);
        if (result.status === "ready" && result.activeReference === reference) {
          try {
            saveSttReference(reference);
          } catch {
            // The on-chain lookup remains authoritative when browser storage is unavailable.
          }
          router.replace("/");
          return;
        }
      } catch {
        // A later poll can still confirm the submitted transaction.
      }
    }
    throw new Error(i18n("confirmationFailed"));
  }

  async function submitPreview() {
    if (!activeWallet || !preview || inFlight.current) return;
    let reference: string | null = null;
    inFlight.current = true;
    setPhase("submitting");
    setError(null);
    try {
      const txHash = await signAndSubmitTx(activeWallet, preview.txHex);
      if (!mounted.current) return;
      reference = `${txHash}#${preview.referenceScriptOutputIndex}`;
      setSubmittedReference(reference);
      setPreview(null);
      setPhase("confirming");
      await confirmDeployment(reference);
    } catch (cause) {
      if (!mounted.current) return;
      setError(getUserFacingErrorMessage(cause, i18n(reference ? "confirmationFailed" : "submitFailed")));
      setPhase("idle");
    } finally {
      inFlight.current = false;
    }
  }

  async function retryConfirmation() {
    if (!submittedReference || inFlight.current) return;
    inFlight.current = true;
    setPhase("confirming");
    setError(null);
    try {
      await confirmDeployment(submittedReference);
    } catch (cause) {
      if (!mounted.current) return;
      setError(getUserFacingErrorMessage(cause, i18n("confirmationFailed")));
      setPhase("idle");
    } finally {
      inFlight.current = false;
    }
  }

  return (
    <section className="w-full max-w-2xl space-y-6 rounded-2xl border border-border/70 bg-card/85 p-4 shadow-panel sm:p-8">
      <header className="space-y-2">
        <p className="eyebrow font-semibold text-primary">{i18n("eyebrow")}</p>
        <h1 className="font-display text-2xl font-semibold text-foreground sm:text-3xl">{i18n("title")}</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">{i18n("description")}</p>
      </header>

      <div className="rounded-xl border border-amber-500/35 bg-amber-500/10 p-4">
        <div className="flex gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" aria-hidden="true" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">{i18n("permanentTitle")}</p>
            <p className="text-xs leading-relaxed text-muted-foreground">{i18n("permanentDescription")}</p>
          </div>
        </div>
      </div>

      <div className="space-y-4 rounded-xl border border-border/60 bg-background/40 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-foreground">{i18n("statusTitle")}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {busy ? i18n("working") : connected ? i18n("walletReady") : i18n("walletNeeded")}
            </p>
          </div>
          <Badge variant={connected && networkId === 0 ? "secondary" : "warning"}>
            {connected ? i18n("connected") : i18n("notConnected")}
          </Badge>
        </div>

        {!connected ? (
          <Button type="button" onClick={() => setConnectionOpen(true)}>{i18n("connect")}</Button>
        ) : isDemoWallet ? (
          <p className="text-sm text-amber-200">{i18n("demoUnsupported")}</p>
        ) : networkId !== 0 ? (
          <p className="text-sm text-amber-200">{i18n("preprodRequired")}</p>
        ) : phase === "review" && preview ? (
          <div className="space-y-3">
            <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
              <p className="inline-flex items-center gap-2 text-sm font-medium text-foreground">
                <CheckCircle2 className="h-4 w-4 text-emerald-300" aria-hidden="true" />
                {i18n("ready")}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">{preview.preview.summary}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                {i18n("estimatedFee", { lovelace: preview.estimatedFeeLovelace ?? i18n("unknown") })}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => void submitPreview()}>{i18n("deploy")}</Button>
              <Button type="button" variant="secondary" onClick={() => { setPreview(null); setPhase("idle"); }}>
                {i18n("cancel")}
              </Button>
            </div>
          </div>
        ) : (
          <Button
            type="button"
            disabled={submittedReference ? busy : !canBuild}
            onClick={() => void (submittedReference ? retryConfirmation() : buildPreview())}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            {phase === "confirming"
              ? i18n("confirming")
              : submittedReference
                ? i18n("checkAgain")
                : i18n("build")}
          </Button>
        )}

        {error ? (
          <div role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-100">
            {error}
          </div>
        ) : null}
      </div>

      {store?.storeAddress ? (
        <p className="break-all font-mono text-xs text-muted-foreground">
          {i18n("storeAddress", { address: store.storeAddress })}
        </p>
      ) : null}

      <WalletConnectionDialog
        open={connectionOpen}
        onOpenChange={setConnectionOpen}
        title={i18n("connectTitle")}
        description={i18n("connectDescription")}
      />
    </section>
  );
}
