"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCircle2,
  FileSignature,
  Hammer,
  Link2,
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
import { actionKindLabel, lovelaceToAda, truncateMiddle } from "./format";
import { authorityPathLabel, describeSignerProgress } from "./signer-progress";
import { buildProposalShareUrl } from "./share-link";
import { CLIPBOARD_BLOCKED_MESSAGE, copyTextToClipboard } from "@/lib/utils/clipboard";
import { useToast } from "@/providers/toast-provider";

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
  const toast = useToast();
  const [detail, setDetail] = useState<ProposalDetailDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [verification, setVerification] = useState<ProposalVerification | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [busy, setBusy] = useState<null | "sign" | "submit" | "rebuild" | "cancel">(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionInfo, setActionInfo] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

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
          setLoadError(caught instanceof Error ? caught.message : "Could not load this approval request.");
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
  const isVerifiedValid = Boolean(
    verification?.validity === "valid" && verification.signers
  );
  const canSign = Boolean(isOpen && isVerifiedValid && !alreadySigned);
  const canSubmit = Boolean(isOpen && isVerifiedValid && verification?.signers?.satisfied);
  const buildContext = detail ? parseProposalBuildContext(detail) : null;
  const canRebuild = Boolean(
    detail && buildContext && isAutoRebuildable(buildContext.builder) && isOpen
  );

  // Why the buttons below are in the state they are in. Sign and Submit are each gated on
  // three separate conditions, and a disabled button is not focusable, so a co-signer used
  // to face two grey buttons with nothing anywhere saying whether they were early, late, or
  // looking at a request that can never be signed. Highest-stakes state first.
  const statusNote = ((): string | null => {
    if (detail?.status === "SUBMITTED") {
      return "This request has been sent to the blockchain. Nothing more to do here.";
    }
    if (detail?.status === "CANCELLED") {
      return "This request was withdrawn. Nobody can sign it now.";
    }
    if (verifying) {
      return "Checking this request against the blockchain.";
    }
    if (isInvalid) {
      // The reset is not a detail: every co-signer who already signed has to sign again,
      // and until this slice it was only mentioned in the message that appeared afterwards.
      return canRebuild
        ? "This request is out of date. It uses funds that have since moved, so it can no longer go through. Making a new version clears every signature it already has."
        : "This request is out of date. It uses funds that have since moved, so it can no longer go through. This kind of request cannot be remade here, so build it again from the wallet page.";
    }
    if (!verification) {
      return "The check did not finish, so signing is switched off. Reload the page to try again.";
    }
    if (!verification.signers) {
      return "Who has to sign could not be read, so signing is switched off.";
    }
    if (canSubmit) {
      return "Enough people have signed. Anybody can send it to the blockchain now.";
    }
    if (alreadySigned) {
      return "You have signed. It waits for the others.";
    }
    return null;
  })();

  const guardWallet = (): boolean => {
    if (!activeWallet || isDemoWallet) {
      setActionError("Connect a browser wallet (not the demo wallet) to continue.");
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
      const submitted = await markProposalSubmitted(detail.id, detail.txBodyHash);
      apply(submitted);
      setActionInfo(
        `Submitted on-chain: ${truncateMiddle(submitted.submittedTxHash ?? detail.txBodyHash, 12, 8)}`
      );
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
          expectedBodyHash: detail.txBodyHash,
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
        <CardContent className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading approval request…
        </CardContent>
      </Card>
    );
  }

  if (loadError || !detail) {
    return (
      <Card>
        <CardContent className="space-y-3">
          <p className="text-sm text-rose-300">{loadError ?? "Approval request not found."}</p>
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
        {/*
          `lg`, matching the workspace's own column breakpoint. The two-column split moved from
          `xl` to `lg` when the 1024-1279px band got a real layout; this button did not follow,
          so between 1024 and 1279 it offered to go "back" to a list already on screen.
        */}
        <Button variant="ghost" size="sm" onClick={onBack} className="lg:hidden">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to list
        </Button>
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              // `window` only exists at event time, and the origin is whatever host the
              // signer is already trusting — never a configured one.
              void copyTextToClipboard(
                buildProposalShareUrl(window.location.origin, detail.walletUnit, detail.id)
              ).then((ok) => {
                // `setLinkCopied(ok)` used to be the whole handler, so a failure set `false`
                // over `false` and the button just never changed.
                if (!ok) {
                  toast.error(CLIPBOARD_BLOCKED_MESSAGE);
                  return;
                }
                setLinkCopied(true);
                window.setTimeout(() => setLinkCopied(false), 1800);
              });
            }}
          >
            {linkCopied ? (
              <Check className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Link2 className="h-4 w-4" aria-hidden="true" />
            )}
            {linkCopied ? "Link copied" : "Copy link"}
          </Button>
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
            <Badge variant="outline">{authorityPathLabel(detail.authorityPath)}</Badge>
            {detail.status === "SUBMITTED" ? <Badge variant="info">Submitted</Badge> : null}
            {detail.status === "CANCELLED" ? <Badge variant="secondary">Cancelled</Badge> : null}
          </div>
          {detail.description ? (
            <p className="text-sm text-muted-foreground">{detail.description}</p>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-4">
          {summary ? (
            <section className="rounded-lg border border-border/60 bg-background/40 p-3 sm:p-4">
              {/* No `uppercase tracking-wide` here. The headline is a sentence about money:
                  it names the amount and the destination address, and a bech32 address is
                  canonically lowercase. Uppercasing changes the shape a co-signer compares
                  against their own wallet, on the one screen whose whole purpose is
                  verifying a transaction before signing it. The class stays on "Inputs
                  consumed" and "Outputs" below, which really are short labels.
                  `break-words` for the same reason: with the default `overflow-wrap` the
                  103-character address is one unbreakable token and simply ran past the
                  panel border. */}
              <p className="mb-1 text-xs font-semibold text-muted-foreground">
                Written by whoever made this request. Nobody has checked it.
              </p>
              <p className="mb-2 break-words text-xs text-muted-foreground">
                {summary.headline}
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
            <section className="space-y-1 rounded-lg border border-amber-400/30 bg-amber-500/10 p-3 sm:p-4 text-sm text-amber-100">
              <p className="font-semibold">What the check found</p>
              <ul className="list-inside list-disc">
                {verification.reasons.map((reason, index) => (
                  <li key={index}>{reason}</li>
                ))}
              </ul>
            </section>
          ) : null}

          {actionError ? (
            <p role="alert" className="text-sm text-rose-300">
              {actionError}
            </p>
          ) : null}
          {actionInfo ? (
            <p role="status" className="text-sm text-emerald-300">
              {actionInfo}
            </p>
          ) : null}

          {statusNote ? <p className="text-sm text-muted-foreground">{statusNote}</p> : null}

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
              {alreadySigned ? "You have signed" : "Sign this request"}
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
              >
                {busy === "rebuild" ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Hammer className="h-4 w-4" aria-hidden="true" />
                )}
                Make a new version
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
                <XCircle className="h-4 w-4" aria-hidden="true" /> Withdraw request
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
        What this transaction does
      </div>
      <p className="text-xs text-muted-foreground">
        Read from the transaction itself, not from the note above it.
      </p>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="rounded-lg border border-border/60 bg-background/40 p-3 sm:p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Funds it uses
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
                  {input.isSttState ? <Badge variant="info">Wallet state</Badge> : null}
                  {input.live === true ? (
                    <Badge variant="success">Still there</Badge>
                  ) : input.live === null ? (
                    <Badge variant="warning">Could not check</Badge>
                  ) : (
                    <Badge variant="destructive">Already spent</Badge>
                  )}
                </span>
              </li>
            ))}
            {effect.inputs.length === 0 ? (
              <li className="text-muted-foreground">Could not read what it uses.</li>
            ) : null}
          </ul>
        </div>

        <div className="rounded-lg border border-border/60 bg-background/40 p-3 sm:p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Where the money goes
          </p>
          <ul className="space-y-2 text-xs">
            {effect.outputs.map((output, index) => (
              <li key={index} className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="break-all text-left font-mono">{output.address}</span>
                  <span className="shrink-0 font-semibold">{lovelaceToAda(output.lovelace)}</span>
                </div>
                {(output.assets.length > 0 || output.hasInlineDatum) && (
                  <div className="space-y-1 text-xs text-muted-foreground">
                    {output.assets.map((asset) => (
                      <div key={asset.unit} className="break-all font-mono">
                        {asset.unit}: {asset.quantity}
                      </div>
                    ))}
                    {output.hasInlineDatum ? <Badge variant="outline">Carries data</Badge> : null}
                  </div>
                )}
              </li>
            ))}
            {effect.outputs.length === 0 ? (
              <li className="text-muted-foreground">
                Could not read where the money goes.
              </li>
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
      <section className="rounded-lg border border-border/60 bg-background/40 p-3 sm:p-4 text-sm text-muted-foreground">
        Who has to sign could not be read from this wallet.
      </section>
    );
  }

  const signed = new Set(signers.signedKeyHashes);
  // Same sentence as the list row, from the same helper, so the two surfaces never disagree.
  const progress = describeSignerProgress(signers, signers.signedKeyHashes.length);
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between text-sm font-semibold">
        <span>Who must sign · {authorityPathLabel(signers.authorityPath)}</span>
        <span className={progress.tone === "ready" ? "text-emerald-300" : "text-amber-200"}>
          {progress.label}
        </span>
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
              <span className="flex items-center gap-2">
                {signer.isAdmin ? <Badge variant="outline">Owner</Badge> : null}
                {signers.threshold != null ? (
                  <span className="text-muted-foreground">
                    {signer.power} approval power
                  </span>
                ) : null}
                {has ? (
                  <span className="inline-flex items-center gap-1 text-emerald-300">
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                    Signed
                  </span>
                ) : (
                  <span className="text-muted-foreground">Not signed yet</span>
                )}
              </span>
            </li>
          );
        })}
        {signers.requiredSigners.length === 0 ? (
          <li className="text-muted-foreground">
            This wallet lists nobody who can sign this request.
          </li>
        ) : null}
      </ul>
    </section>
  );
}
