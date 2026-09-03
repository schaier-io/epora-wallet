"use client";
import { useTranslations } from "next-intl";

import { useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCircle2,
  ExternalLink,
  FileSignature,
  Hammer,
  Link2,
  Loader2,
  Send,
  ShieldCheck,
  XCircle
} from "lucide-react";
import { cardanoscanTransactionUrl } from "@/lib/cardano-network";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ProposalVerification } from "@/lib/proposals/types";
import { actionKindLabel, lovelaceToAda, truncateMiddle } from "./format";
import { authorityPathLabel, describeSignerProgress } from "./signer-progress";
import { buildProposalShareUrl } from "./share-link";
import { CLIPBOARD_BLOCKED_MESSAGE, copyTextToClipboard } from "@/lib/utils/clipboard";
import { useToast } from "@/providers/toast-provider";
import { useProposalOrchestration } from "./use-proposal-orchestration";

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
  const toast = useToast();
  const [linkCopied, setLinkCopied] = useState(false);
  const {
    actionError,
    actionInfo,
    alreadySigned,
    busy,
    canRebuild,
    canSign,
    canSubmit,
    detail,
    handleCancel,
    handleRebuild,
    handleSign,
    handleSubmit,
    isCreator,
    isInvalid,
    isOpen,
    loading,
    loadError,
    rebuildNeedsProposer,
    summary,
    verification,
    verifying
  } = useProposalOrchestration({ proposalId, sessionKeyHash, onChanged });

  // Why the buttons below are in the state they are in. Sign and Submit are each gated on
  // three separate conditions, and a disabled button is not focusable, so a co-signer used
  // to face two grey buttons with nothing anywhere saying whether they were early, late, or
  // looking at a request that can never be signed. Highest-stakes state first.
  // `txBodyHash` is the fallback for requests saved before the column existed: the
  // body hash identifies the same transaction on the explorer.
  const submittedTxHash = detail?.submittedTxHash ?? detail?.txBodyHash ?? null;
  const statusNote = ((): string | null => {
    if (detail?.status === "SUBMITTED") {
      return i18n("thisRequestHasBeenSentToTheBlockchain");
    }
    if (detail?.status === "SUBMITTING") {
      // The chain may already hold this tx while the record is unfinished; the
      // out-of-date note below would send the proposer off to build it a second time.
      return i18n("thisRequestIsBeingSentToTheBlockchain");
    }
    if (detail?.status === "CANCELLED") {
      return i18n("thisRequestWasWithdrawnNobodyCanSignIt");
    }
    if (verifying) {
      return i18n("checkingThisRequestAgainstTheBlockchain");
    }
    if (isInvalid) {
      // The reset is not a detail: every co-signer who already signed has to sign again,
      // and until this slice it was only mentioned in the message that appeared afterwards.
      // An expired body is the common case (every build carries a short validity window)
      // and reads differently from moved funds, so it gets its own wording.
      if (verification?.expired) {
        if (canRebuild) return i18n("thisRequestExpiredMakingANewVersion");
        if (rebuildNeedsProposer) return i18n("thisRequestExpiredOnlyTheProposer");
        return i18n("thisRequestExpiredBuildItAgain");
      }
      if (canRebuild) return i18n("thisRequestIsOutOfDateItUses");
      if (rebuildNeedsProposer) return i18n("thisRequestIsOutOfDateOnlyTheProposer");
      return i18n("thisRequestIsOutOfDateItUses_1ec8c3");
    }
    if (!verification) {
      return i18n("theCheckDidNotFinishSoSigningIs");
    }
    if (!verification.signers) {
      return i18n("whoHasToSignCouldNotBeRead");
    }
    if (canSubmit) {
      return i18n("enoughPeopleHaveSignedAnybodyCanSendIt");
    }
    if (alreadySigned) {
      return i18n("youHaveSignedItWaitsForTheOthers");
    }
    return null;
  })();

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> {i18n("loadingApprovalRequest")}
        </CardContent>
      </Card>
    );
  }

  if (loadError || !detail) {
    return (
      <Card>
        <CardContent className="space-y-3">
          <p className="text-sm text-rose-300">{loadError ?? i18n("approvalRequestNotFound")}</p>
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
        {/*
          `lg`, matching the workspace's own column breakpoint. The two-column split moved from
          `xl` to `lg` when the 1024-1279px band got a real layout; this button did not follow,
          so between 1024 and 1279 it offered to go "back" to a list already on screen.
        */}
        <Button variant="ghost" size="sm" onClick={onBack} className="lg:hidden">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {i18n("backToList")}
        </Button>
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              // `window` only exists at event time, and the origin is whatever host the
              // signer is already trusting, never a configured one.
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
            {linkCopied ? i18n("linkCopied") : i18n("copyLink")}
          </Button>
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
              <CheckCircle2 className="h-3 w-3" aria-hidden="true" /> {i18n("verifiedValid")}
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
                {i18n("writtenByWhoeverMadeThisRequestNobodyHas")}
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
              <p className="font-semibold">{i18n("whatTheCheckFound")}</p>
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

          {/* The submitted tx hash is the one thing every signer cross-checks against the
              chain, so it stays a Cardanoscan link for as long as the request is open —
              not just in the transient toast-style line that appears right after sending. */}
          {detail?.status === "SUBMITTED" && submittedTxHash ? (
            <a
              href={cardanoscanTransactionUrl(submittedTxHash)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 font-mono text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              title={i18n("openTransactionOnCardanoscan")}
            >
              {truncateMiddle(submittedTxHash, 12, 8)}
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          ) : null}

          {/* Only what the reader can do right now. Four buttons used to sit here, mostly
              grey, with the reason in the note above. Once enough people have signed, Submit
              is the one primary action. */}
          <div className="flex flex-wrap gap-2">
            {canSubmit ? (
              <Button
                type="button"
                onClick={() => void handleSubmit()}
                disabled={busy !== null}
                aria-busy={busy === "submit"}
              >
                {busy === "submit" ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Send className="h-4 w-4" aria-hidden="true" />
                )}
                {i18n("submitTransaction")}
              </Button>
            ) : canSign ? (
              <Button
                type="button"
                onClick={() => void handleSign()}
                disabled={busy !== null}
                aria-busy={busy === "sign"}
              >
                {busy === "sign" ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <FileSignature className="h-4 w-4" aria-hidden="true" />
                )}
                {i18n("signThisRequest")}
              </Button>
            ) : null}

            {canRebuild ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleRebuild()}
                disabled={busy !== null}
                aria-busy={busy === "rebuild"}
              >
                {busy === "rebuild" ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Hammer className="h-4 w-4" aria-hidden="true" />
                )}
                {i18n("makeANewVersion")}
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
                <XCircle className="h-4 w-4" aria-hidden="true" /> {i18n("withdrawRequest")}
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
  if (!verification) {
    return null;
  }
  const { effect } = verification;
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <ShieldCheck className="h-4 w-4 text-primary" aria-hidden="true" />
        {i18n("whatThisTransactionDoes")}
      </div>
      <p className="text-xs text-muted-foreground">
        {i18n("readFromTheTransactionItselfNotFromThe")}
      </p>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="rounded-lg border border-border/60 bg-background/40 p-3 sm:p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {i18n("fundsItUses")}
          </p>
          <ul className="space-y-1 text-xs">
            {effect.inputs.map((input) => (
              <li
                key={`${input.txHash}#${input.outputIndex}`}
                className="flex items-center justify-between gap-2"
              >
                <a
                  href={cardanoscanTransactionUrl(input.txHash)}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                  title={i18n("openTransactionOnCardanoscan")}
                >
                  {truncateMiddle(input.txHash, 8, 4)}#{input.outputIndex}
                </a>
                <span className="flex items-center gap-1">
                  {input.isSttState ? <Badge variant="info">{i18n("walletState")}</Badge> : null}
                  {input.live === true ? (
                    <Badge variant="success">{i18n("stillThere")}</Badge>
                  ) : input.live === null ? (
                    <Badge variant="warning">{i18n("couldNotCheck")}</Badge>
                  ) : (
                    <Badge variant="destructive">{i18n("alreadySpent")}</Badge>
                  )}
                </span>
              </li>
            ))}
            {effect.inputs.length === 0 ? (
              <li className="text-muted-foreground">{i18n("couldNotReadWhatItUses")}</li>
            ) : null}
          </ul>
        </div>

        <div className="rounded-lg border border-border/60 bg-background/40 p-3 sm:p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {i18n("whereTheMoneyGoes")}
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
                    {output.hasInlineDatum ? <Badge variant="outline">{i18n("carriesData")}</Badge> : null}
                  </div>
                )}
              </li>
            ))}
            {effect.outputs.length === 0 ? (
              <li className="text-muted-foreground">
                {i18n("couldNotReadWhereTheMoneyGoes")}
              </li>
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
  if (!verification) {
    return null;
  }
  const signers = verification.signers;
  if (!signers) {
    return (
      <section className="rounded-lg border border-border/60 bg-background/40 p-3 sm:p-4 text-sm text-muted-foreground">
        {i18n("whoHasToSignCouldNotBeRead_46e9bc")}
      </section>
    );
  }

  const signed = new Set(signers.signedKeyHashes);
  // Same sentence as the list row, from the same helper, so the two surfaces never disagree.
  const progress = describeSignerProgress(signers, signers.signedKeyHashes.length);
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between text-sm font-semibold">
        <span>{i18n("whoMustSign")} {authorityPathLabel(signers.authorityPath)}</span>
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
                {signer.isAdmin ? <Badge variant="outline">{i18n("owner_89ff31")}</Badge> : null}
                {signers.threshold != null ? (
                  <span className="text-muted-foreground">
                    {signer.power} {i18n("approvalPower")}
                  </span>
                ) : null}
                {has ? (
                  <span className="inline-flex items-center gap-1 text-emerald-300">
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                    {i18n("signed")}
                  </span>
                ) : (
                  <span className="text-muted-foreground">{i18n("notSignedYet")}</span>
                )}
              </span>
            </li>
          );
        })}
        {signers.requiredSigners.length === 0 ? (
          <li className="text-muted-foreground">
            {i18n("thisWalletListsNobodyWhoCanSignThis")}
          </li>
        ) : null}
      </ul>
    </section>
  );
}
