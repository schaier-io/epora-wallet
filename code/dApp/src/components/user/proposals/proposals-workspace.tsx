"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FileSignature, Loader2, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { fetchProposal } from "@/lib/proposals/client";
import type { ProposalValidity } from "@/lib/proposals/types";
import { verifyProposal } from "@/lib/proposals/verify";
import { CreateProposalPanel } from "./create-proposal-panel";
import { truncateMiddle } from "./format";
import { ProposalDetail } from "./proposal-detail";
import { ProposalList } from "./proposal-list";
import { SignInGate } from "./sign-in-gate";
import { useProposalSession } from "./use-proposal-session";
import { useProposals } from "./use-proposals";

const MAX_BACKGROUND_VERIFY = 20;

export function ProposalsWorkspace() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const creating = searchParams.get("create") === "1";

  const session = useProposalSession();
  const signedIn = Boolean(session.session);
  const { proposals, loading, error, refresh } = useProposals(signedIn);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [validityById, setValidityById] = useState<Record<string, ProposalValidity>>({});

  // Compute validity for open proposals in the background so the list can flag
  // invalid (spent-UTxO) ones. Each needs the full tx + a chain check, so cap it.
  useEffect(() => {
    if (!signedIn) {
      return;
    }
    let cancelled = false;
    const open = proposals.filter((proposal) => proposal.status === "OPEN").slice(
      0,
      MAX_BACKGROUND_VERIFY
    );
    // Legitimate data-fetch effect (verifies each open proposal against chain).
    /* eslint-disable react-hooks/set-state-in-effect */
    setValidityById((previous) => {
      const next = { ...previous };
      for (const proposal of open) {
        next[proposal.id] = next[proposal.id] ?? "checking";
      }
      return next;
    });
    /* eslint-enable react-hooks/set-state-in-effect */
    open.forEach(async (proposal) => {
      try {
        const detail = await fetchProposal(proposal.id);
        const report = await verifyProposal(detail);
        if (!cancelled) {
          setValidityById((map) => ({ ...map, [proposal.id]: report.validity }));
        }
      } catch {
        if (!cancelled) {
          setValidityById((map) => ({ ...map, [proposal.id]: "invalid" }));
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, [proposals, signedIn]);

  const handleChanged = useCallback(() => {
    void refresh();
  }, [refresh]);

  if (session.loading) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> Loading…
      </div>
    );
  }

  if (!signedIn) {
    return <SignInGate session={session} />;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="font-display text-2xl font-medium tracking-[-0.02em]">
            Multi-sig proposals
          </h1>
          <p className="text-sm text-muted-foreground">
            Signed in as {truncateMiddle(session.session?.paymentKeyHash ?? "", 10, 6)}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => void session.signOut()}>
          <LogOut className="h-4 w-4" aria-hidden="true" /> Sign out
        </Button>
      </header>

      {creating ? (
        <CreateProposalPanel
          onCreated={(id) => {
            router.replace("/user/proposals");
            setSelectedId(id);
            void refresh();
          }}
          onCancel={() => router.replace("/user/proposals")}
        />
      ) : (
        <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(320px,380px)_1fr]">
          <div className={selectedId ? "hidden xl:block" : "block"}>
            <ProposalList
              proposals={proposals}
              selectedId={selectedId}
              validityById={validityById}
              loading={loading}
              error={error}
              onSelect={setSelectedId}
              onRefresh={() => void refresh()}
            />
          </div>
          <div className={selectedId ? "block" : "hidden xl:block"}>
            {selectedId ? (
              <ProposalDetail
                proposalId={selectedId}
                sessionKeyHash={session.session?.paymentKeyHash ?? ""}
                onChanged={handleChanged}
                onBack={() => setSelectedId(null)}
              />
            ) : (
              <Card className="hidden h-full xl:flex xl:items-center xl:justify-center">
                <CardContent className="flex flex-col items-center gap-2 p-10 text-center text-sm text-muted-foreground">
                  <FileSignature className="h-6 w-6" aria-hidden="true" />
                  <p>Select a proposal to verify and sign it.</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
