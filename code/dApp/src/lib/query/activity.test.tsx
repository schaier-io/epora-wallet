import { focusManager, QueryClient, QueryObserver } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { installQueryActivityTracking, QUERY_ACTIVITY_IDLE_MS } from "./activity";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  focusManager.setFocused(undefined);
});

it("stops automatic reads after inactivity or hiding, but permits an explicit read", async () => {
  vi.useFakeTimers();
  const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const fetch = vi.fn(async () => "ready");
  const stopTracking = installQueryActivityTracking();
  client.mount();
  const observer = new QueryObserver(client, { queryKey: ["activity-poll"], queryFn: fetch, refetchInterval: 60_000 });
  const unsubscribe = observer.subscribe(() => {});
  try {
    await vi.advanceTimersByTimeAsync(QUERY_ACTIVITY_IDLE_MS);
    expect(focusManager.isFocused()).toBe(false);
    const idleCalls = fetch.mock.calls.length;
    await vi.advanceTimersByTimeAsync(120_000);
    expect(fetch).toHaveBeenCalledTimes(idleCalls);
    await expect(client.fetchQuery({ queryKey: ["explicit-read"], queryFn: async () => "fresh" })).resolves.toBe("fresh");

    // Assistive technology can activate a control without pointer or keyboard events.
    window.dispatchEvent(new MouseEvent("click"));
    await vi.advanceTimersByTimeAsync(0);
    expect(focusManager.isFocused()).toBe(true);
    expect(fetch.mock.calls.length).toBeGreaterThan(idleCalls);

    visibility.mockReturnValue("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    const hiddenCalls = fetch.mock.calls.length;
    await vi.advanceTimersByTimeAsync(120_000);
    expect(fetch).toHaveBeenCalledTimes(hiddenCalls);

    visibility.mockReturnValue("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(0);
    expect(fetch.mock.calls.length).toBeGreaterThan(hiddenCalls);
  } finally {
    unsubscribe();
    client.unmount();
    client.clear();
    stopTracking();
  }
});
