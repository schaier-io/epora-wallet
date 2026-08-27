"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FileSignature, Loader2, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { fetchProposal } from "@/lib/proposals/client";
import type { ProposalValidity, SignerSatisfaction } from "@/lib/proposals/types";
import { verifyProposal } from "@/lib/proposals/verify";
import { CreateProposalPanel } from "./create-proposal-panel";
import { truncateMiddle } from "./format";
import { ProposalDetail } from "./proposal-detail";
import { ProposalList } from "./proposal-list";
import { SignInGate } from "./sign-in-gate";
import { useProposalSession } from "./use-proposal-session";
import { useProposals } from "./use-proposals";

const MAX_BACKGROUND_VERIFY = 20;
const PROPOSALS_PATH = "/user/proposals";

export function ProposalsWorkspace() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const creating = searchParams.get("create") === "1";
  // Which proposal is open lives in the URL, not in React state. As state it could not be
  // linked to, bookmarked, or returned to with Back. A co-signer had no way to send anyone
  // "the proposal I need you to sign".
  const selectedId = searchParams.get("proposal");

  const session = useProposalSession();
  const signedIn = Boolean(session.session);
  const { proposals, loading, loadingMore, hasMore, error, refresh, loadMore } =
    useProposals(signedIn);
  // Verification result per open request. It carries the signer set as well as the validity:
  // the same `verifyProposal` call produces both, and the list needs the signer set to say
  // "4 of 5" instead of a bare count.
  const [reportById, setReportById] = useState<
    Record<string, { validity: ProposalValidity; signers: SignerSatisfaction | null }>
  >({});
  // Whether this session opened the proposal from the list. If it did, the detail's Back
  // button should retrace that step; if the user arrived on the link directly there is
  // nothing of ours behind it, and `router.back()` would leave the app.
  const openedFromListRef = useRef(false);

  /** The proposals URL with `changes` applied, keeping every other param (notably `wallet`). */
  const buildUrl = useCallback(
    (changes: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(changes)) {
        if (value === null) {
          next.delete(key);
        } else {
          next.set(key, value);
        }
      }
      const search = next.toString();
      return search ? `${PROPOSALS_PATH}?${search}` : PROPOSALS_PATH;
    },
    [searchParams]
  );

  const handleSelect = useCallback(
    (id: string) => {
      openedFromListRef.current = true;
      router.push(buildUrl({ proposal: id }));
    },
    [buildUrl, router]
  );

  const handleBackToList = useCallback(() => {
    if (openedFromListRef.current) {
      openedFromListRef.current = false;
      router.back();
      return;
    }
    router.replace(buildUrl({ proposal: null }));
  }, [buildUrl, router]);

  // Compute validity for open proposals in the background so the list can flag
  // invalid (spent-UTxO) ones. Each needs the full tx + a chain check, so cap it.
  useEffect(() => {
    if (!signedIn) {
      return;
    }
    let cancelled = false;
    const openAll = proposals.filter((proposal) => proposal.status === "OPEN");
    const open = openAll.slice(0, MAX_BACKGROUND_VERIFY);
    // Legitimate data-fetch effect (verifies each open proposal against chain).
    /* eslint-disable react-hooks/set-state-in-effect */
    setReportById((previous) => {
      const next = { ...previous };
      for (const [index, proposal] of openAll.entries()) {
        // Past the cap nothing is queued, so seeding "checking" left those rows spinning for
        // ever. The list has to say the app never looked, not that it is still looking.
        next[proposal.id] = next[proposal.id] ?? {
          validity: index < MAX_BACKGROUND_VERIFY ? "checking" : "unknown",
          signers: null
        };
      }
      return next;
    });
    /* eslint-enable react-hooks/set-state-in-effect */
    open.forEach(async (proposal) => {
      try {
        const detail = await fetchProposal(proposal.id);
        const report = await verifyProposal(detail);
        if (!cancelled) {
          setReportById((map) => ({
            ...map,
            [proposal.id]: { validity: report.validity, signers: report.signers }
          }));
        }
      } catch {
        if (!cancelled) {
          // Not "invalid". The fetch or the chain query failed, which says nothing about
          // whether this request can still go through; writing "invalid" told a co-signer
          // their request was dead because the network hiccupped.
          setReportById((map) => ({
            ...map,
            [proposal.id]: { validity: "unknown", signers: null }
          }));
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
        <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> Checking your
        sign-in…
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
            Approval requests
          </h1>
          <p className="text-sm text-muted-foreground">
            Signed in as{" "}
            <span className="font-mono">
              {truncateMiddle(session.session?.paymentKeyHash ?? "", 10, 6)}
            </span>
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => void session.signOut()}>
          <LogOut className="h-4 w-4" aria-hidden="true" /> Sign out
        </Button>
      </header>

      {creating ? (
        <CreateProposalPanel
          onCreated={(id) => {
            // `replace`, so Back from the new proposal returns to wherever the user was
            // before they opened the create panel rather than re-opening an empty one.
            openedFromListRef.current = false;
            router.replace(buildUrl({ create: null, proposal: id }));
            void refresh();
          }}
          onCancel={() => router.replace(buildUrl({ create: null }))}
        />
      ) : (
        <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(320px,380px)_1fr]">
          <div className={selectedId ? "hidden lg:block" : "block"}>
            <ProposalList
              proposals={proposals}
              selectedId={selectedId}
              reportById={reportById}
              loading={loading}
              loadingMore={loadingMore}
              hasMore={hasMore}
              error={error}
              onSelect={handleSelect}
              onRefresh={() => void refresh()}
              onLoadMore={() => void loadMore()}
            />
          </div>
          <div className={selectedId ? "block" : "hidden lg:block"}>
            {selectedId ? (
              <ProposalDetail
                proposalId={selectedId}
                sessionKeyHash={session.session?.paymentKeyHash ?? ""}
                onChanged={handleChanged}
                onBack={handleBackToList}
              />
            ) : (
              <Card className="hidden h-full lg:flex lg:items-center lg:justify-center">
                <CardContent className="flex min-h-40 flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
                  <FileSignature className="h-6 w-6" aria-hidden="true" />
                  <p>Select an approval request to verify and sign it.</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
