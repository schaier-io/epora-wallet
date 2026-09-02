"use client";
import { useTranslations } from "next-intl";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createProposal } from "@/lib/proposals/client";
import { buildProposalTx } from "@/lib/proposals/rebuild";
import { resolveProposalBodyHash } from "@/lib/proposals/serialization";
import { useWalletContext } from "@/providers/wallet-provider";
import { applyCoSigners, CoSignerPicker, describeCoSignerChoice } from "./cosigner-picker";
import { actionKindLabel } from "./format";
import { authorityPathLabel } from "./signer-progress";
import { clearProposalDraft, readProposalDraft } from "./stash";

type CreateProposalPanelProps = {
  onCreated: (id: string) => void;
  onCancel: () => void;
};

// Reads the build draft stashed by the workspace's "Save as approval request"
// action and turns it into a stored proposal other participants can sign.
export function CreateProposalPanel({ onCreated, onCancel }: CreateProposalPanelProps) {
  const i18n = useTranslations("ComponentsUserProposalsCreateProposalPanel");
  const { activeWallet, activePaymentKeyHash } = useWalletContext();
  const draft = useMemo(() => readProposalDraft(), []);
  const walletUnit = useSearchParams().get("wallet");
  const [title, setTitle] = useState(draft?.suggestedTitle ?? "");
  const [description, setDescription] = useState("");
  const [coSigners, setCoSigners] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Older drafts carry no state; they save as before, listing the proposer alone.
  const choice = useMemo(
    () =>
      draft?.stateForm && draft.proposerKeyHash
        ? describeCoSignerChoice(draft.stateForm, draft.authorityPath, draft.proposerKeyHash, coSigners)
        : null,
    [draft, coSigners]
  );
  const listedCanPass = choice === null || choice.listed.satisfied;

  if (!draft) {
    // `?create=1` with nothing stashed: a reload, a shared link, or a draft saved from another
    // tab. The way out is the wallet page, so it is a link, and `onCancel` drops the param.
    return (
      <Card>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>{i18n("nothingToSaveYetBuildATransactionOn")}</p>
          <p>
            <Link
              href={walletUnit ? `/user?wallet=${walletUnit}` : "/user"}
              className="text-primary underline-offset-4 hover:underline"
            >
              {i18n("goBackToTheWalletToBuildA")}
            </Link>
          </p>
          <Button variant="outline" size="sm" onClick={onCancel}>
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {i18n("backToApprovalRequests")}
          </Button>
        </CardContent>
      </Card>
    );
  }

  const effectiveTitle = title.trim() || actionKindLabel(draft.actionKind);

  async function handleSave() {
    if (!draft) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      let buildContext = draft.buildContext;
      let unsignedTxHex = draft.unsignedTxHex;
      if (coSigners.length > 0) {
        // The stashed transaction lists the proposer alone. Listing the chosen
        // co-signers changes the body, so it is built again with them in it. The
        // builder lists the connected wallet's own key, and the set was checked
        // against the proposer's, so both have to be the same wallet.
        if (
          !activeWallet ||
          activePaymentKeyHash?.toLowerCase() !== draft.proposerKeyHash?.toLowerCase()
        ) {
          throw new Error(i18n("connectTheWalletThatBuiltThisRequest"));
        }
        buildContext = applyCoSigners(draft.buildContext, coSigners);
        unsignedTxHex = (await buildProposalTx(activeWallet, buildContext)).txHex;
      }
      const proposal = await createProposal({
        walletUnit: draft.walletUnit,
        walletPolicyId: draft.walletPolicyId,
        title: effectiveTitle,
        description: description.trim() || undefined,
        actionKind: draft.actionKind,
        authorityPath: draft.authorityPath,
        builder: draft.builder,
        buildContext,
        unsignedTxHex,
        txBodyHash: resolveProposalBodyHash(unsignedTxHex),
        summary: draft.summary
      });
      clearProposalDraft();
      onCreated(proposal.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : i18n("couldNotSaveTheApprovalRequest"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mx-auto w-full max-w-2xl">
      <CardHeader>
        <CardTitle>{i18n("saveAsApprovalRequest")}</CardTitle>
        <p className="text-sm text-muted-foreground">
          {/* `authorityPathLabel`, not the raw `authorityPath`: the stored value is
              `admin`, the role word the product retired, and this was the one call site
              that skipped the helper the two detail sites already use. */}
          {actionKindLabel(draft.actionKind)} · {authorityPathLabel(draft.authorityPath)}{i18n("thePeopleWhoHaveToSignWillSee")}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1">
          <Label htmlFor="proposal-title">{i18n("title")}</Label>
          <Input
            id="proposal-title"
            value={title}
            placeholder={actionKindLabel(draft.actionKind)}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={200}
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="proposal-description">{i18n("descriptionOptional")}</Label>
          <Textarea
            id="proposal-description"
            value={description}
            placeholder={i18n("whyAreYouAskingForThisTheOthers")}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={2000}
            rows={3}
          />
        </div>

        {choice ? (
          <CoSignerPicker choice={choice} chosen={coSigners} onChange={setCoSigners} disabled={busy} />
        ) : null}

        {draft.summary ? (
          <section className="rounded-lg border border-border/60 bg-background/40 p-3">
            <p className="mb-1 text-xs font-semibold text-muted-foreground">
              {i18n("whatYouAreAskingFor")}
            </p>
            {/* No `uppercase tracking-wide`: the headline is a sentence naming an amount
                and a destination address, not an eyebrow label. See proposal-detail.tsx. */}
            <p className="mb-1 break-words text-xs text-muted-foreground">
              {draft.summary.headline}
            </p>
            <dl className="grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
              {draft.summary.rows.map((row, index) => (
                <div key={`${row.label}-${index}`} className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">{row.label}</dt>
                  <dd className="text-right">{row.value}</dd>
                </div>
              ))}
            </dl>
          </section>
        ) : null}

        {error ? (
          <p role="alert" className="text-sm text-rose-300">
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={() => void handleSave()}
            disabled={busy || !listedCanPass}
            aria-busy={busy}
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Save className="h-4 w-4" aria-hidden="true" />
            )}
            {i18n("saveRequest")}
          </Button>
          <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
            {i18n("cancel")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
