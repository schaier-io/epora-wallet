"use client";
import { useTranslations } from "next-intl";

import { useCallback, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { FileSignature, Loader2, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CopyButton } from "@/components/ui/copy-button";
import { pageHeadingClass } from "@/components/ui/page-heading";
import { cn } from "@/lib/utils/cn";
import { proposalKeys, refreshProposalBackgroundQueries } from "@/lib/proposals/query";
import { useWalletContext } from "@/providers/wallet-provider";
import { useProposalBackgroundVerification } from "./use-proposal-background-verification";
export { BACKGROUND_PROPOSAL_VERIFICATION_TIMEOUT_MS } from "./use-proposal-background-verification";
import { CreateProposalPanel } from "./create-proposal-panel";
import { truncateMiddle } from "./format";
import { ProposalDetail } from "./proposal-detail";
import { ProposalList } from "./proposal-list";
import { SignInGate } from "./sign-in-gate";
import { useProposalSession } from "./use-proposal-session";
import { useProposals } from "./use-proposals";

const PROPOSALS_PATH = "/user/proposals";

export function ProposalsWorkspace() {
  const i18n = useTranslations("ComponentsUserProposalsProposalsWorkspace");
  const router = useRouter();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const creating = searchParams.get("create") === "1";
  // Which proposal is open lives in the URL, not in React state. As state it could not be
  // linked to, bookmarked, or returned to with Back. A co-signer had no way to send anyone
  // "the proposal I need you to sign".
  const selectedId = searchParams.get("proposal");

  const session = useProposalSession();
  const { walletSessionLoading } = useWalletContext();
  const [detailRefreshRevision, setDetailRefreshRevision] = useState(0);
  // The address comes off the session controller (which already reads the wallet context), so
  // the identity line renders from the same source the sign-in used.
  const { activeAddress } = session;
  // The connected wallet decides, not the cookie. A session belonging to another key is not a
  // session for whoever is at the keyboard now, and `useProposals` must not fetch that key's
  // list: the server scopes it by the session's own wallet memberships, so the rows would be
  // real, just someone else's.
  //
  // No wallet at all is the same answer. The cookie outlives the connection, so a stale session
  // used to render the request list and a Sign out button in the tone of a working session,
  // while every signature it offers fails at the wallet call. The gate names the missing wallet
  // instead. `walletSessionLoading` holds the gate back until the silent reconnect after a
  // reload has settled, so the gate does not flash on every load.
  const signedIn = Boolean(session.session) && !session.connectedWalletMismatch && Boolean(activeAddress);
  // See the grid below: with nothing to list there is nothing to select from either.
  const { proposals, loading, loadingMore, hasMore, error, refresh, loadMore } =
    useProposals(signedIn, session.session?.paymentKeyHash ?? "");
  const reportById = useProposalBackgroundVerification(proposals, session.session?.paymentKeyHash ?? "", signedIn);
  // `!selectedId` matters as much as the empty list. The detail is its own query
  // (`use-proposal-orchestration.ts`), not a lookup into this list, so an empty list does
  // not mean the open proposal has nothing to show. Without this term, opening
  // `?proposal=<id>` for a request the list does not return dropped the detail column
  // while the list column was already hidden by `selectedId`, leaving a blank page below
  // `lg`; and signing the last open request unmounted the detail mid-flow.
  const listOnly = proposals.length === 0 && !selectedId && !loading && !error;
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

  const handleChanged = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: proposalKeys.lists(session.session?.paymentKeyHash ?? "") });
  }, [queryClient, session.session?.paymentKeyHash]);

  if (session.loading || walletSessionLoading) {
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
          <h1 className={pageHeadingClass}>{i18n("approvalRequests")}</h1>
          {/* "Signed in as" names the connected wallet's address, not the payment key hash the
              session is built on: a hash is not something a user can recognize in their wallet
              or an explorer, and the identity this page cares about is the wallet. A readable
              address is now a condition of reaching this view at all (see `signedIn` above), so
              the null branch only covers the frame before the address arrives. */}
          {activeAddress ? (
            <p className="flex items-center gap-1 text-sm text-muted-foreground">
              {i18n("signedInAs")}{" "}
              <span className="font-mono">{truncateMiddle(activeAddress, 12, 8)}</span>
              <CopyButton value={activeAddress} hideLabel variant="ghost" className="h-6 px-1.5" />
            </p>
          ) : null}
        </div>
        <Button variant="ghost" size="sm" onClick={() => void session.signOut()} className="-mr-3">
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
        /* One column while there is nothing to list. The two-column split put "No approval
           requests yet." in a 440px pane beside a second empty pane reading "Select an
           approval request to verify and sign it." -- an instruction to pick from a list
           that is empty, next to the message saying it is empty. The placeholder is right
           once requests exist and none is picked, so it stays for that case. */
        <div
          className={cn(
            "grid min-h-0 gap-4",
            // `flex-1` only when there is a list to fill the height with. Empty, it
            // stretched one sentence inside a viewport-tall bordered box.
            listOnly ? null : "flex-1 lg:grid-cols-[minmax(320px,440px)_minmax(0,1fr)]"
          )}
        >
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
              onRefresh={() => {
                setDetailRefreshRevision((revision) => revision + 1);
                void refresh().then(() => {
                  if (!selectedId) void refreshProposalBackgroundQueries(queryClient, session.session?.paymentKeyHash ?? "");
                });
              }}
              onLoadMore={() => void loadMore()}
            />
          </div>
          {listOnly ? null : (
          <div className={selectedId ? "block min-w-0" : "hidden min-w-0 lg:block"}>
            {selectedId ? (
              <ProposalDetail
                proposalId={selectedId}
                refreshRevision={detailRefreshRevision}
                sessionKeyHash={session.session?.paymentKeyHash ?? ""}
                onChanged={handleChanged}
                onBack={handleBackToList}
              />
            ) : (
              <Card className="hidden lg:flex lg:items-center lg:justify-center">
                <CardContent className="flex min-h-40 flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
                  <FileSignature className="h-6 w-6" aria-hidden="true" />
                  <p>{i18n("selectAnApprovalRequestToVerifyAndSign")}</p>
                </CardContent>
              </Card>
            )}
          </div>
          )}
        </div>
      )}
    </div>
  );
}
