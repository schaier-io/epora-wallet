"use client";
import { useTranslations } from "next-intl";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FileSignature, Loader2, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CopyButton } from "@/components/ui/copy-button";
import { fetchProposal } from "@/lib/proposals/client";
import type { ProposalValidity, SignerSatisfaction } from "@/lib/proposals/types";
import {
  MAX_BACKGROUND_PROPOSAL_INPUT_LOOKUPS,
  verifyProposal
} from "@/lib/proposals/verify";
import { CreateProposalPanel } from "./create-proposal-panel";
import { truncateMiddle } from "./format";
import { ProposalDetail } from "./proposal-detail";
import { ProposalList } from "./proposal-list";
import { SignInGate } from "./sign-in-gate";
import { useProposalSession } from "./use-proposal-session";
import { useProposals } from "./use-proposals";

const MAX_BACKGROUND_VERIFY = 20;
export const BACKGROUND_PROPOSAL_VERIFICATION_TIMEOUT_MS = 15_000;
const PROPOSALS_PATH = "/user/proposals";

async function waitForBackgroundVerification<T>(work: Promise<T>): Promise<
  | { timedOut: false; value: T }
  | { timedOut: true }
> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work.then((value) => ({ timedOut: false as const, value })),
      new Promise<{ timedOut: true }>((resolve) => {
        timeout = setTimeout(
          () => resolve({ timedOut: true }),
          BACKGROUND_PROPOSAL_VERIFICATION_TIMEOUT_MS
        );
      })
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export function ProposalsWorkspace() {
  const i18n = useTranslations("ComponentsUserProposalsProposalsWorkspace");
  const router = useRouter();
  const searchParams = useSearchParams();
  const creating = searchParams.get("create") === "1";
  // Which proposal is open lives in the URL, not in React state. As state it could not be
  // linked to, bookmarked, or returned to with Back. A co-signer had no way to send anyone
  // "the proposal I need you to sign".
  const selectedId = searchParams.get("proposal");

  const session = useProposalSession();
  // The address comes off the session controller (which already reads the wallet context), so
  // the identity line renders from the same source the sign-in used.
  const { activeAddress } = session;
  // The connected wallet decides, not the cookie. A session belonging to another key is not a
  // session for whoever is at the keyboard now, and `useProposals` must not fetch that key's
  // list: the server scopes it by the session's own wallet memberships, so the rows would be
  // real, just someone else's.
  const signedIn = Boolean(session.session) && !session.connectedWalletMismatch;
  const { proposals, loading, loadingMore, hasMore, error, refresh, loadMore } =
    useProposals(signedIn);
  // Verification result per open request. It carries the signer set as well as the validity:
  // the same `verifyProposal` call produces both, and the list needs the signer set to say
  // "4 of 5" instead of a bare count.
  const [reportById, setReportById] = useState<
    Record<string, { validity: ProposalValidity; signers: SignerSatisfaction | null }>
  >({});
  const [backgroundVerificationRun, setBackgroundVerificationRun] = useState(0);
  // A timed-out fetch cannot be aborted by the current proposal client. Keep
  // later list generations from stacking more work behind that live request.
  const backgroundWorkRef = useRef<Promise<void> | null>(null);
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
      return search ? i18n("proposalsPathSearch", { PROPOSALS_PATH: PROPOSALS_PATH, search: search }) : PROPOSALS_PATH;
    },
    [searchParams, i18n]
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
    const backgroundWork = backgroundWorkRef.current;
    const backgroundWorkAlreadyRunning = backgroundWork !== null;
    // Legitimate data-fetch effect (verifies each open proposal against chain).
    setReportById((previous) => {
      const next = { ...previous };
      for (const [index, proposal] of openAll.entries()) {
        // Past the cap nothing is queued, so seeding "checking" left those rows spinning for
        // ever. The list has to say the app never looked, not that it is still looking.
        if (backgroundWorkAlreadyRunning) {
          next[proposal.id] = { validity: "unknown", signers: null };
        } else {
          next[proposal.id] = next[proposal.id] ?? {
            validity: index < MAX_BACKGROUND_VERIFY ? "checking" : "unknown",
            signers: null
          };
        }
      }
      return next;
    });
    if (backgroundWork) {
      // The current request cannot be aborted. Restart this effect after it
      // settles so the newest proposal generation is not left unverified.
      void backgroundWork.then(() => {
        if (!cancelled) {
          setBackgroundVerificationRun((generation) => generation + 1);
        }
      });
      return () => {
        cancelled = true;
      };
    }
    const verifyOpenProposals = async () => {
      for (const [index, proposal] of open.entries()) {
        if (cancelled) {
          return;
        }
        try {
          const work = fetchProposal(proposal.id).then((detail) =>
            verifyProposal(detail, {
              maxInputLookups: MAX_BACKGROUND_PROPOSAL_INPUT_LOOKUPS
            })
          );
          const trackedWork = work.then(
            () => undefined,
            () => undefined
          );
          backgroundWorkRef.current = trackedWork;
          void trackedWork.finally(() => {
            if (backgroundWorkRef.current === trackedWork) {
              backgroundWorkRef.current = null;
            }
          });
          const outcome = await waitForBackgroundVerification(
            work
          );
          if (outcome.timedOut) {
            if (!cancelled) {
              // Stop after one stalled item. Starting later items would leave
              // more unresolved provider work in flight.
              setReportById((map) => {
                const next = { ...map };
                for (const queued of open.slice(index)) {
                  next[queued.id] = { validity: "unknown", signers: null };
                }
                return next;
              });
            }
            return;
          }
          if (!cancelled) {
            setReportById((map) => ({
              ...map,
              [proposal.id]: {
                validity: outcome.value.validity,
                signers: outcome.value.signers
              }
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
      }
    };
    void verifyOpenProposals();
    return () => {
      cancelled = true;
    };
  }, [backgroundVerificationRun, proposals, signedIn]);

  const handleChanged = useCallback(() => {
    void refresh();
  }, [refresh]);

  if (session.loading) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> {i18n("checkingYourSignIn")}
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
            {i18n("approvalRequests")}
          </h1>
          {/* "Signed in as" names the connected wallet's address, not the payment key hash the
              session is built on: a hash is not something a user can recognize in their wallet
              or an explorer, and the identity this page cares about is the wallet. When no
              address is readable (session cookie alive, wallet not connected) the line is
              omitted rather than falling back to the hash. */}
          {activeAddress ? (
            <p className="flex items-center gap-1 text-sm text-muted-foreground">
              {i18n("signedInAs")}{" "}
              <span className="font-mono">{truncateMiddle(activeAddress, 12, 8)}</span>
              <CopyButton value={activeAddress} hideLabel variant="ghost" className="h-6 px-1.5" />
            </p>
          ) : null}
        </div>
        <Button variant="ghost" size="sm" onClick={() => void session.signOut()}>
          <LogOut className="h-4 w-4" aria-hidden="true" /> {i18n("signOut")}
        </Button>
      </header>

      {session.error ? (
        <p role="alert" className="text-sm text-rose-300">
          {session.error}
        </p>
      ) : null}

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
          {/* `lg:h-full` + flex column so the list fills the pane height and scrolls inside
              it. Unconstrained, the list grew the page while the detail pane stayed a full
              height box -- two columns that disagreed about how tall the row was. */}
          <div
            className={
              selectedId
                ? "hidden min-h-0 lg:flex lg:h-full lg:flex-col"
                : "flex min-h-0 flex-col"
            }
          >
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
                  <p>{i18n("selectAnApprovalRequestToVerifyAndSign")}</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
