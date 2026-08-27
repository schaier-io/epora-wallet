"use client";
import { useTranslations } from "next-intl";

import { useMemo, useState } from "react";
import { ArrowLeft, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createProposal } from "@/lib/proposals/client";
import { resolveProposalBodyHash } from "@/lib/proposals/serialization";
import { getUserFacingErrorMessage } from "@/lib/utils/errors";
import { useProposalFormatters } from "./format";
import { clearProposalDraft, readProposalDraft } from "./stash";

type CreateProposalPanelProps = {
  onCreated: (id: string) => void;
  onCancel: () => void;
};

// Reads the build draft stashed by the workspace's "Save as multi-sig proposal"
// action and turns it into a stored proposal other participants can sign.
export function CreateProposalPanel({ onCreated, onCancel }: CreateProposalPanelProps) {
  const i18n = useTranslations("ComponentsUserProposalsCreateProposalPanel");
  const { actionKindLabel } = useProposalFormatters();
  const draft = useMemo(() => readProposalDraft(), []);
  const [title, setTitle] = useState(draft?.suggestedTitle ?? "");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!draft) {
    return (
      <Card>
        <CardContent className="space-y-3 p-6 text-sm text-muted-foreground">
          <p>
            {i18n("nothingToProposeBuildATransactionInThe")}
          </p>
          <Button variant="outline" size="sm" onClick={onCancel}>
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {i18n("backToProposals")}
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
      const proposal = await createProposal({
        walletUnit: draft.walletUnit,
        walletPolicyId: draft.walletPolicyId,
        title: effectiveTitle,
        description: description.trim() || undefined,
        actionKind: draft.actionKind,
        authorityPath: draft.authorityPath,
        builder: draft.builder,
        buildContext: draft.buildContext,
        unsignedTxHex: draft.unsignedTxHex,
        txBodyHash: resolveProposalBodyHash(draft.unsignedTxHex),
        summary: draft.summary
      });
      clearProposalDraft();
      onCreated(proposal.id);
    } catch (caught) {
      setError(getUserFacingErrorMessage(caught, i18n("couldnTSaveThisProposal")));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mx-auto w-full max-w-2xl">
      <CardHeader>
        <CardTitle>{i18n("createApprovalProposal")}</CardTitle>
        <p className="text-sm text-muted-foreground">
          {i18n("proposalForAction", { actionLabel: actionKindLabel(draft.actionKind) })}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="proposal-title">{i18n("title")}</Label>
          <Input
            id="proposal-title"
            value={title}
            placeholder={actionKindLabel(draft.actionKind)}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={200}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="proposal-description">{i18n("noteForApproversOptional")}</Label>
          <Textarea
            id="proposal-description"
            value={description}
            placeholder={i18n("whatIsThisActionForAddAnyContext")}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={2000}
            rows={3}
          />
        </div>

        {draft.summary ? (
          <section className="rounded-lg border border-border/60 bg-background/40 p-3">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
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

        {error ? <p role="alert" className="text-sm text-rose-300">{error}</p> : null}

        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => void handleSave()} disabled={busy} aria-busy={busy}>
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Save className="h-4 w-4" aria-hidden="true" />
            )}
            {i18n("createProposal")}
          </Button>
          <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
            {i18n("cancel")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
