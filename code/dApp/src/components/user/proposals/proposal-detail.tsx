"use client";
import { useTranslations } from "next-intl";

import { useCallback, useEffect, useRef, useState } from "react";
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
  normalizeWitnessSetHex
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
import { truncateMiddle, useProposalFormatters } from "./format";
import { getUserFacingErrorMessage } from "@/lib/utils/errors";

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
  const i18n = useTranslations("ComponentsUserProposalsProposalDetail");
  const { actionKindLabel, authorityPathLabel } = useProposalFormatters();
  const { activeWallet, isDemoWallet } = useWalletContext();
  const [detail, setDetail] = useState<ProposalDetailDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [verification, setVerification] = useState<ProposalVerification | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [busy, setBusy] = useState<null | "sign" | "submit" | "rebuild" | "cancel">(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionInfo, setActionInfo] = useState<string | null>(null);

  // Verification is async and chain-bound. Token the latest request so a verify
  // for a previous proposal can't resolve late and land its validity/signers
  // verdict on the proposal now on screen — which would mis-gate Submit/Rebuild.
  const verifyTokenRef = useRef(0);

  const runVerify = useCallback(async (record: ProposalDetailDto) => {
    const token = (verifyTokenRef.current += 1);
    setVerifying(true);
    try {
      const result = await verifyProposal(record);
      if (verifyTokenRef.current === token) {
        setVerification(result);
      }
    } catch {
      if (verifyTokenRef.current === token) {
        setVerification(null);
      }
    } finally {
      if (verifyTokenRef.current === token) {
        setVerifying(false);
      }
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
          setLoadError(getUserFacingErrorMessage(caught, i18n("couldnTLoadThisProposal")));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
      // Invalidate any verify still in flight for the proposal we're leaving,
      // before the next proposal's fetch resolves and starts its own.
      verifyTokenRef.current += 1;
    };
  }, [i18n, proposalId, runVerify]);

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
  const isVerifiedValid = Boolean(
    verification?.validity === "valid" && verification.signers
  );
  const canSign = Boolean(isOpen && isVerifiedValid && !alreadySigned);
  const canSubmit = Boolean(isOpen && isVerifiedValid && verification?.signers?.satisfied);
  const buildContext = detail ? parseProposalBuildContext(detail) : null;
  const canRebuild = Boolean(
    detail && buildContext && isAutoRebuildable(buildContext.builder) && isOpen
  );

  const guardWallet = (): boolean => {
    if (!activeWallet || isDemoWallet) {
      setActionError(i18n("connectABrowserWalletNotTheDemoWallet"));
      return false;
    }
    return true;
  };

  async function handleSign() {
    if (!detail || !canSign || !guardWallet() || !activeWallet) {
      return;
    }
    setBusy("sign");
    setActionError(null);
    setActionInfo(null);
    try {
      const signed = await activeWallet.signTx(detail.unsignedTxHex, true);
      const witnessSetHex = normalizeWitnessSetHex(signed);
      apply(await signProposal(detail.id, { witnessSetHex, txBodyHash: detail.txBodyHash }));
      setActionInfo(i18n("yourSignatureWasAdded"));
    } catch (caught) {
      setActionError(getUserFacingErrorMessage(caught, i18n("signingFailed")));
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
      const submitted = await markProposalSubmitted(detail.id, detail.txBodyHash);
      apply(submitted);
      setActionInfo(
        i18n("submittedOnChainValue1", {
          value1: truncateMiddle(submitted.submittedTxHash ?? detail.txBodyHash, 12, 8)
        })
      );
    } catch (caught) {
      setActionError(getUserFacingErrorMessage(caught, i18n("submissionFailed")));
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
          expectedBodyHash: detail.txBodyHash,
          buildContext: result.buildContext
        })
      );
      setActionInfo(i18n("rebuiltAgainstLiveChainStateSignaturesReset"));
    } catch (caught) {
      setActionError(
        caught instanceof RebuildUnsupportedError
          ? i18n("thisProposalCanTBeRebuiltHereRecreate")
          : getUserFacingErrorMessage(caught, i18n("couldnTRebuildThisProposal"))
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
      setActionError(getUserFacingErrorMessage(caught, i18n("couldnTCancelThisProposal")));
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent role="status" aria-live="polite" className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> {i18n("loadingProposal")}
        </CardContent>
      </Card>
    );
  }

  if (loadError || !detail) {
    return (
      <Card>
        <CardContent className="space-y-3 p-6">
          <p role="alert" className="text-sm text-rose-300">{loadError ?? i18n("proposalNotFound")}</p>
          <Button variant="outline" size="sm" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {i18n("back")}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex min-h-0 flex-col gap-4 overflow-y-auto">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onBack} className="xl:hidden">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {i18n("backToList")}
        </Button>
        <div className="ml-auto flex items-center gap-2">
          {verifying ? (
            <Badge variant="secondary">
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> {i18n("verifying")}
            </Badge>
          ) : isInvalid ? (
            <Badge variant="warning">
              <AlertTriangle className="h-3 w-3" aria-hidden="true" /> {i18n("invalid")}
            </Badge>
          ) : verification ? (
            <Badge variant="success">
              <CheckCircle2 className="h-3 w-3" aria-hidden="true" /> {i18n("verified")}
            </Badge>
          ) : null}
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>{detail.title}</CardTitle>
            <Badge variant="outline">{actionKindLabel(detail.actionKind)}</Badge>
            <Badge variant="outline">{authorityPathLabel(detail.authorityPath)}</Badge>
            {detail.status === "SUBMITTED" ? <Badge variant="info">{i18n("submitted")}</Badge> : null}
            {detail.status === "CANCELLED" ? <Badge variant="secondary">{i18n("cancelled")}</Badge> : null}
          </div>
          {detail.description ? (
            <p className="text-sm text-muted-foreground">{detail.description}</p>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-5">
          {summary ? (
            <section className="rounded-lg border border-border/60 bg-background/40 p-3">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {i18n("proposerSSummaryNotVerified")} {summary.headline}
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
              <p className="font-semibold">{i18n("verificationNotes")}</p>
              <ul className="list-inside list-disc">
                {verification.reasons.map((reason, index) => (
                  <li key={index}>{reason}</li>
                ))}
              </ul>
            </section>
          ) : null}

          {actionError ? <p role="alert" className="text-sm text-rose-300">{actionError}</p> : null}
          {actionInfo ? <p role="status" className="text-sm text-emerald-300">{actionInfo}</p> : null}

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() => void handleSign()}
              disabled={!canSign || busy !== null}
              aria-busy={busy === "sign"}
            >
              {busy === "sign" ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <FileSignature className="h-4 w-4" aria-hidden="true" />
              )}
              {alreadySigned ? i18n("youSigned") : i18n("verifySign")}
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
              {i18n("submitTransaction")}
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
                    : i18n("thisActionCanTBeRebuiltAutomaticallyRecreate")
                }
              >
                {busy === "rebuild" ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Hammer className="h-4 w-4" aria-hidden="true" />
                )}
                {i18n("rebuild")}
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
                <XCircle className="h-4 w-4" aria-hidden="true" /> {i18n("cancel")}
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function EffectSection({ verification }: { verification: ProposalVerification | null }) {
  const i18n = useTranslations("ComponentsUserProposalsProposalDetail");
  const { lovelaceToAda } = useProposalFormatters();
  if (!verification) {
    return null;
  }
  const { effect } = verification;
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <ShieldCheck className="h-4 w-4 text-primary" aria-hidden="true" />
        {i18n("verifiedTransactionDetails")}
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="rounded-lg border border-border/60 bg-background/40 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {i18n("fundsAndStateUsed")}
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
                  {input.isSttState ? <Badge variant="info">{i18n("state")}</Badge> : null}
                  {input.live === true ? (
                    <Badge variant="success">{i18n("live")}</Badge>
                  ) : input.live === null ? (
                    <Badge variant="warning">{i18n("unknown")}</Badge>
                  ) : (
                    <Badge variant="destructive">{i18n("spent")}</Badge>
                  )}
                </span>
              </li>
            ))}
            {effect.inputs.length === 0 ? (
              <li className="text-muted-foreground">{i18n("noInputsFoundInTheTransaction")}</li>
            ) : null}
          </ul>
        </div>

        <div className="rounded-lg border border-border/60 bg-background/40 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {i18n("destinationsCreated")}
          </p>
          <ul className="space-y-1.5 text-xs">
            {effect.outputs.map((output, index) => (
              <li key={index} className="space-y-0.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="break-all text-left font-mono">{output.address}</span>
                  <span className="shrink-0 font-semibold">{lovelaceToAda(output.lovelace)}</span>
                </div>
                {(output.assets.length > 0 || output.hasInlineDatum) && (
                  <div className="space-y-1 text-[11px] text-muted-foreground">
                    {output.assets.map((asset) => (
                      <div key={asset.unit} className="break-all font-mono">
                        {asset.unit}: {asset.quantity}
                      </div>
                    ))}
                    {output.hasInlineDatum ? <Badge variant="outline">{i18n("inlineDatum")}</Badge> : null}
                  </div>
                )}
              </li>
            ))}
            {effect.outputs.length === 0 ? (
              <li className="text-muted-foreground">{i18n("noDestinationsFoundInTheTransaction")}</li>
            ) : null}
          </ul>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        {i18n("networkFee")} <span className="font-semibold">{lovelaceToAda(effect.feeLovelace)}</span>
      </p>
    </section>
  );
}

function SignersSection({ verification }: { verification: ProposalVerification | null }) {
  const i18n = useTranslations("ComponentsUserProposalsProposalDetail");
  const { authorityPathLabel } = useProposalFormatters();
  if (!verification) {
    return null;
  }
  const signers = verification.signers;
  if (!signers) {
    return (
      <section className="rounded-lg border border-border/60 bg-background/40 p-3 text-sm text-muted-foreground">
        {i18n("requiredSignersCouldNotBeReadFromThe")}
      </section>
    );
  }

  const signed = new Set(signers.signedKeyHashes);
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between text-sm font-semibold">
        <span>{i18n("requiredApprovals")} {authorityPathLabel(signers.authorityPath)}</span>
        {signers.threshold != null ? (
          <span className={signers.satisfied ? "text-emerald-300" : "text-amber-200"}>
            {i18n("approvalWeight")} {signers.satisfiedPower}/{signers.threshold}
          </span>
        ) : (
          <span className={signers.satisfied ? "text-emerald-300" : "text-amber-200"}>
            {signers.satisfied ? i18n("ownerSigned") : i18n("awaitingAnOwner")}
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
                {signer.isAdmin ? <Badge variant="outline">{i18n("owner")}</Badge> : null}
                {signers.threshold != null ? (
                  <span className="text-muted-foreground">{i18n("weight")} {signer.power}</span>
                ) : null}
                {has ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
                ) : (
                  <span className="text-muted-foreground">{i18n("pending")}</span>
                )}
              </span>
            </li>
          );
        })}
        {signers.requiredSigners.length === 0 ? (
          <li className="text-muted-foreground">{i18n("noRequiredSignersFoundInTheState")}</li>
        ) : null}
      </ul>
    </section>
  );
}
