import { render } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

const nav = { pathname: "/user", search: "" };
// `useRouter` is a spy that is expected never to run. See the first test.
const useRouter = vi.fn(() => ({ push: vi.fn(), replace: vi.fn() }));

vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(nav.search),
  useRouter
}));

const { useWorkspaceRouteState } = await import("@/components/user/use-workspace-controller");
const { parseWorkspaceRouteState } = await import("@/components/user/workspace-controller");

type Commit = ReturnType<typeof useWorkspaceRouteState>["commitRouteState"];
type Dispatch = ReturnType<typeof useWorkspaceRouteState>["dispatch"];

function renderRouteState() {
  const seen: { commit: Commit | null } = { commit: null };
  function Probe() {
    seen.commit = useWorkspaceRouteState().commitRouteState;
    return null;
  }
  render(<Probe />);
  if (!seen.commit) throw new Error("commitRouteState was not captured");
  return seen.commit;
}

function renderRouteDispatch() {
  const seen: { dispatch: Dispatch | null } = { dispatch: null };
  function Probe() {
    seen.dispatch = useWorkspaceRouteState().dispatch;
    return null;
  }
  render(<Probe />);
  if (!seen.dispatch) throw new Error("dispatch was not captured");
  return seen.dispatch;
}

const WALLET = parseWorkspaceRouteState(new URLSearchParams("wallet=unit&step=overview"));
const ACTIVITY = parseWorkspaceRouteState(
  new URLSearchParams("wallet=unit&step=overview&view=activity")
);

/**
 * Every workspace state is a query string on the one `/user` route, and this used to move
 * between them with `router.push`. App Router treats that as a navigation: because the page
 * reads `searchParams` in `generateMetadata` it is dynamic, so each push fetched a fresh RSC
 * payload, and the `startTransition` around it held the OLD screen up until that answer
 * arrived. Clicking a sidebar tab therefore waited on a server round-trip before anything
 * moved. Measured against the dev server, six clicks made six `?_rsc=` requests at ~31ms each;
 * through `history.pushState` the same six made none and landed in ~13ms.
 */
describe("workspace route state writes the URL without navigating", () => {
  beforeEach(() => {
    nav.search = "";
    useRouter.mockClear();
  });

  it("never asks the router to navigate", () => {
    const commit = renderRouteState();
    const push = vi.spyOn(window.history, "pushState").mockImplementation(() => {});

    commit(WALLET, { history: "push" });

    expect(push).toHaveBeenCalledOnce();
    expect(useRouter).not.toHaveBeenCalled();
    push.mockRestore();
  });

  it("pushes a history entry for a state the user chose", () => {
    const commit = renderRouteState();
    const push = vi.spyOn(window.history, "pushState").mockImplementation(() => {});

    commit(ACTIVITY, { history: "push" });

    expect(push).toHaveBeenCalledWith(null, "", "/user?wallet=unit&step=overview&view=activity");
    push.mockRestore();
  });

  /**
   * A correction the user never asked for must not cost a Back press, so `replace` stays the
   * default. Swapping the two would make Back walk through states nobody chose.
   */
  it("replaces for an auto-correction, and drops the query when there is none", () => {
    nav.search = "wallet=unit&step=overview";
    const commit = renderRouteState();
    const replace = vi.spyOn(window.history, "replaceState").mockImplementation(() => {});

    commit(parseWorkspaceRouteState(new URLSearchParams("")));

    expect(replace).toHaveBeenCalledWith(null, "", "/user");
    replace.mockRestore();
  });

  it("writes nothing when the state it is given is the state it is already in", () => {
    nav.search = "wallet=unit&step=overview";
    const commit = renderRouteState();
    const push = vi.spyOn(window.history, "pushState").mockImplementation(() => {});
    const replace = vi.spyOn(window.history, "replaceState").mockImplementation(() => {});

    commit(WALLET, { history: "push" });

    expect(push).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
    push.mockRestore();
    replace.mockRestore();
  });

  it("reduces consecutive dispatches over the state written by the first dispatch", () => {
    nav.search = "wallet=unit&action=wallet-settings&step=configure";
    const dispatch = renderRouteDispatch();
    const push = vi.spyOn(window.history, "pushState").mockImplementation(() => {});

    dispatch({ type: "set-task", task: "settings-wallet-name" });
    dispatch({ type: "set-step", flowStep: "review" });

    expect(push).toHaveBeenLastCalledWith(
      null,
      "",
      "/user?wallet=unit&action=update-state&task=settings-wallet-name&step=review"
    );
    push.mockRestore();
  });
});
