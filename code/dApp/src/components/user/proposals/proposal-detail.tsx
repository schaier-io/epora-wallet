"use client";
import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  FileSignature,
  Hammer,
  Loader2,
  Send,
  ShieldCheck,
  XCircle
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  assembleSignedTx,
  normalizeWitnessSetHex,
  submitAssembledTx
} from "@/lib/proposals/assemble";
import {
  cancelProposal,
  fetchProposal,
  markProposalSubmitted,
  parseProposalBuildContext,
  parseProposalSummary,
  rebuildProposal,
  signProposal
} from "@/lib/proposals/client";
import { RebuildUnsupportedError, isAutoRebuildable, rebuildProposalTx } from "@/lib/proposals/rebuild";
import type { ProposalDetailDto, ProposalVerification } from "@/lib/proposals/types";
import { verifyProposal } from "@/lib/proposals/verify";
import { useWalletContext } from "@/providers/wallet-provider";
import { actionKindLabel, lovelaceToAda, truncateMiddle } from "./format";

type ProposalDetailProps = {
  proposalId: string;
  sessionKeyHash: string;
  onChanged: () => void;
  onBack: () => void;
};

export function ProposalDetail({
  proposalId,
  sessionKeyHash,
  onChanged,
  onBack
}: ProposalDetailProps) {
  const { activeWallet, isDemoWallet } = useWalletContext();
  const [detail, setDetail] = useState<ProposalDetailDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [verification, setVerification] = useState<ProposalVerification | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [busy, setBusy] = useState<null | "sign" | "submit" | "rebuild" | "cancel">(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionInfo, setActionInfo] = useState<string | null>(null);

  const runVerify = useCallback(async (record: ProposalDetailDto) => {
    setVerifying(true);
    try {
      setVerification(await verifyProposal(record));
    } catch {
      setVerification(null);
    } finally {
      setVerifying(false);
    }
  }, []);

  useEffect(() => {
    // Legitimate data-fetch effect (loads the proposal + verifies it on open).
    /* eslint-disable react-hooks/set-state-in-effect */
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    setVerification(null);
    setActionError(null);
    setActionInfo(null);
    /* eslint-enable react-hooks/set-state-in-effect */
    fetchProposal(proposalId)
      .then((record) => {
        if (cancelled) {
          return;
        }
        setDetail(record);
        void runVerify(record);
      })
      .catch((caught) => {
        if (!cancelled) {
          setLoadError(caught instanceof Error ? caught.message : "Could not load proposal.");
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
  }, [proposalId, runVerify]);

  const apply = useCallback(
    (record: ProposalDetailDto) => {
      setDetail(record);
      onChanged();
      void runVerify(record);
    },
    [onChanged, runVerify]
  );

  const summary = detail ? parseProposalSummary(detail) : null;
  const isCreator = detail?.createdByKeyHash === sessionKeyHash;
  const alreadySigned = Boolean(
    detail?.signatures.some(
      (signature) => signature.current && signature.signerKeyHash === sessionKeyHash
    )
  );
  const isOpen = detail?.status === "OPEN";
  const isInvalid = verification?.validity === "invalid";
  const canSubmit = Boolean(isOpen && !isInvalid && verification?.signers?.satisfied);
  const buildContext = detail ? parseProposalBuildContext(detail) : null;
  const canRebuild = Boolean(
    detail && buildContext && isAutoRebuildable(buildContext.builder) && isOpen
  );

  const guardWallet = (): boolean => {
    if (!activeWallet || isDemoWallet) {
      setActionError("Connect a browser wallet (not the demo wallet) to continue.");
      return false;
    }
    return true;
  };

  async function handleSign() {
    if (!detail || !guardWallet() || !activeWallet) {
      return;
    }
    setBusy("sign");
    setActionError(null);
    setActionInfo(null);
    try {
      const signed = await activeWallet.signTx(detail.unsignedTxHex, true);
      const witnessSetHex = normalizeWitnessSetHex(signed);
      apply(await signProposal(detail.id, { witnessSetHex, txBodyHash: detail.txBodyHash }));
      setActionInfo("Your signature was added.");
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : "Signing failed.");
    } finally {
      setBusy(null);
    }
  }

  async function handleSubmit() {
    if (!detail) {
      return;
    }
    setBusy("submit");
    setActionError(null);
    setActionInfo(null);
    try {
      const txHash = await submitAssembledTx(assembleSignedTx(detail), activeWallet);
      const confirmedHash = /^[0-9a-fA-F]{64}$/.test(txHash) ? txHash : detail.txBodyHash;
      apply(await markProposalSubmitted(detail.id, confirmedHash));
      setActionInfo(`Submitted on-chain: ${truncateMiddle(txHash, 12, 8)}`);
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : "Submission failed.");
    } finally {
      setBusy(null);
    }
  }

  async function handleRebuild() {
    if (!detail || !guardWallet() || !activeWallet) {
      return;
    }
    setBusy("rebuild");
    setActionError(null);
    setActionInfo(null);
    try {
      const result = await rebuildProposalTx(detail, parseProposalBuildContext(detail), activeWallet);
      apply(
        await rebuildProposal(detail.id, {
          unsignedTxHex: result.txHex,
          txBodyHash: result.txBodyHash,
          buildContext: result.buildContext
        })
      );
      setActionInfo("Rebuilt against live chain state. Existing signatures were reset.");
    } catch (caught) {
      setActionError(
        caught instanceof RebuildUnsupportedError
          ? caught.message
          : caught instanceof Error
            ? caught.message
            : "Rebuild failed."
      );
    } finally {
      setBusy(null);
    }
  }

  async function handleCancel() {
    if (!detail) {
      return;
    }
    setBusy("cancel");
    setActionError(null);
    try {
      await cancelProposal(detail.id);
      apply(await fetchProposal(detail.id));
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : "Could not cancel.");
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading proposal…
        </CardContent>
      </Card>
    );
  }

  if (loadError || !detail) {
    return (
      <Card>
        <CardContent className="space-y-3 p-6">
          <p className="text-sm text-rose-300">{loadError ?? "Proposal not found."}</p>
          <Button variant="outline" size="sm" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex min-h-0 flex-col gap-4 overflow-y-auto">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onBack} className="xl:hidden">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to list
        </Button>
        <div className="ml-auto flex items-center gap-2">
          {verifying ? (
            <Badge variant="secondary">
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> Verifying
            </Badge>
          ) : isInvalid ? (
            <Badge variant="warning">
              <AlertTriangle className="h-3 w-3" aria-hidden="true" /> Invalid
            </Badge>
          ) : verification ? (
            <Badge variant="success">
              <CheckCircle2 className="h-3 w-3" aria-hidden="true" /> Verified valid
            </Badge>
          ) : null}
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>{detail.title}</CardTitle>
            <Badge variant="outline">{actionKindLabel(detail.actionKind)}</Badge>
            <Badge variant="outline">{detail.authorityPath}</Badge>
            {detail.status === "SUBMITTED" ? <Badge variant="info">Submitted</Badge> : null}
            {detail.status === "CANCELLED" ? <Badge variant="secondary">Cancelled</Badge> : null}
          </div>
          {detail.description ? (
            <p className="text-sm text-muted-foreground">{detail.description}</p>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-5">
          {summary ? (
            <section className="rounded-lg border border-border/60 bg-background/40 p-3">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Proposer’s note (unverified) — {summary.headline}
              </p>
              <dl className="grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
                {summary.rows.map((row, index) => (
                  <div key={`${row.label}-${index}`} className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">{row.label}</dt>
                    <dd className="text-right">{row.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ) : null}

          <EffectSection verification={verification} />
          <SignersSection verification={verification} />

          {verification && verification.reasons.length > 0 ? (
            <section className="space-y-1 rounded-lg border border-amber-400/30 bg-amber-500/10 p-3 text-sm text-amber-100">
              <p className="font-semibold">Verification notes</p>
              <ul className="list-inside list-disc">
                {verification.reasons.map((reason, index) => (
                  <li key={index}>{reason}</li>
                ))}
              </ul>
            </section>
          ) : null}

          {actionError ? <p className="text-sm text-rose-300">{actionError}</p> : null}
          {actionInfo ? <p className="text-sm text-emerald-300">{actionInfo}</p> : null}

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() => void handleSign()}
              disabled={!isOpen || isInvalid || alreadySigned || busy !== null}
              aria-busy={busy === "sign"}
            >
              {busy === "sign" ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <FileSignature className="h-4 w-4" aria-hidden="true" />
              )}
              {alreadySigned ? "You signed" : "Verify & sign"}
            </Button>

            <Button
              type="button"
              variant="secondary"
              onClick={() => void handleSubmit()}
              disabled={!canSubmit || busy !== null}
              aria-busy={busy === "submit"}
            >
              {busy === "submit" ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Send className="h-4 w-4" aria-hidden="true" />
              )}
              Submit transaction
            </Button>

            {isInvalid ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleRebuild()}
                disabled={!canRebuild || busy !== null}
                aria-busy={busy === "rebuild"}
                title={
                  canRebuild
                    ? undefined
                    : "This action can’t be rebuilt automatically — recreate it from the workspace."
                }
              >
                {busy === "rebuild" ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Hammer className="h-4 w-4" aria-hidden="true" />
                )}
                Rebuild
              </Button>
            ) : null}

            {isCreator && isOpen ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() => void handleCancel()}
                disabled={busy !== null}
                aria-busy={busy === "cancel"}
              >
                <XCircle className="h-4 w-4" aria-hidden="true" /> Cancel
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function EffectSection({ verification }: { verification: ProposalVerification | null }) {
  if (!verification) {
    return null;
  }
  const { effect } = verification;
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <ShieldCheck className="h-4 w-4 text-primary" aria-hidden="true" />
        What this transaction does (decoded from the bytes)
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="rounded-lg border border-border/60 bg-background/40 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Inputs consumed
          </p>
          <ul className="space-y-1 text-xs">
            {effect.inputs.map((input) => (
              <li
                key={`${input.txHash}#${input.outputIndex}`}
                className="flex items-center justify-between gap-2"
              >
                <span className="font-mono">
                  {truncateMiddle(input.txHash, 8, 4)}#{input.outputIndex}
                </span>
                <span className="flex items-center gap-1">
                  {input.isSttState ? <Badge variant="info">state</Badge> : null}
                  {input.live ? (
                    <Badge variant="success">live</Badge>
                  ) : (
                    <Badge variant="destructive">spent</Badge>
                  )}
                </span>
              </li>
            ))}
            {effect.inputs.length === 0 ? (
              <li className="text-muted-foreground">No inputs decoded.</li>
            ) : null}
          </ul>
        </div>

        <div className="rounded-lg border border-border/60 bg-background/40 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Outputs
          </p>
          <ul className="space-y-1.5 text-xs">
            {effect.outputs.map((output, index) => (
              <li key={index} className="space-y-0.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono">{truncateMiddle(output.address, 12, 8)}</span>
                  <span className="font-semibold">{lovelaceToAda(output.lovelace)}</span>
                </div>
                {(output.assets.length > 0 || output.hasInlineDatum) && (
                  <div className="flex flex-wrap gap-1 text-[11px] text-muted-foreground">
                    {output.assets.length > 0 ? (
                      <span>
                        {output.assets.length} native asset{output.assets.length > 1 ? "s" : ""}
                      </span>
                    ) : null}
                    {output.hasInlineDatum ? <Badge variant="outline">inline datum</Badge> : null}
                  </div>
                )}
              </li>
            ))}
            {effect.outputs.length === 0 ? (
              <li className="text-muted-foreground">No outputs decoded.</li>
            ) : null}
          </ul>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Network fee: <span className="font-semibold">{lovelaceToAda(effect.feeLovelace)}</span>
      </p>
    </section>
  );
}

function SignersSection({ verification }: { verification: ProposalVerification | null }) {
  if (!verification) {
    return null;
  }
  const signers = verification.signers;
  if (!signers) {
    return (
      <section className="rounded-lg border border-border/60 bg-background/40 p-3 text-sm text-muted-foreground">
        Required signers could not be read from the wallet’s on-chain state.
      </section>
    );
  }

  const signed = new Set(signers.signedKeyHashes);
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between text-sm font-semibold">
        <span>Required signatures · {signers.authorityPath}</span>
        {signers.threshold != null ? (
          <span className={signers.satisfied ? "text-emerald-300" : "text-amber-200"}>
            power {signers.satisfiedPower}/{signers.threshold}
          </span>
        ) : (
          <span className={signers.satisfied ? "text-emerald-300" : "text-amber-200"}>
            {signers.satisfied ? "admin signed" : "awaiting an admin"}
          </span>
        )}
      </div>
      <ul className="space-y-1 text-xs">
        {signers.requiredSigners.map((signer, index) => {
          const has = signed.has(signer.keyHash);
          return (
            <li
              key={`${signer.keyHash}-${index}`}
              className="flex items-center justify-between gap-2"
            >
              <span className="font-mono">{truncateMiddle(signer.keyHash, 10, 6)}</span>
              <span className="flex items-center gap-1.5">
                {signer.isAdmin ? <Badge variant="outline">admin</Badge> : null}
                {signers.threshold != null ? (
                  <span className="text-muted-foreground">power {signer.power}</span>
                ) : null}
                {has ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
                ) : (
                  <span className="text-muted-foreground">pending</span>
                )}
              </span>
            </li>
          );
        })}
        {signers.requiredSigners.length === 0 ? (
          <li className="text-muted-foreground">No required signers found in the state.</li>
        ) : null}
      </ul>
    </section>
  );
}
