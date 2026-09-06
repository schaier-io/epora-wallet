import { act, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CountUp } from "@/components/react-bits/primitives";

type ObserverCallback = (entries: { isIntersecting: boolean }[]) => void;

const observers: ObserverCallback[] = [];

function installIntersectionObserver() {
  class StubIntersectionObserver {
    constructor(callback: ObserverCallback) {
      observers.push(callback);
    }
    observe() {}
    disconnect() {}
  }
  vi.stubGlobal("IntersectionObserver", StubIntersectionObserver);
}

function scrollIntoView() {
  act(() => {
    observers.forEach((report) => report([{ isIntersecting: true }]));
  });
}

function renderCountUp() {
  render(
    <NextIntlClientProvider locale="en" messages={{}}>
      <CountUp from={0} to={120} duration={1000} decimals={0} />
    </NextIntlClientProvider>
  );
  return () => screen.getByText(/\d/).textContent;
}

describe("CountUp", () => {
  beforeEach(() => {
    observers.length = 0;
    installIntersectionObserver();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("holds its start value until the element is in view", () => {
    // The effect runs on mount too, before the observer has reported anything.
    // That run used to set the number to its final value and record it as the
    // next animation's start, so the reveal had nothing left to count.
    const value = renderCountUp();

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(value()).toBe("0");
  });

  it("counts up once the element comes into view", () => {
    const value = renderCountUp();

    scrollIntoView();
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(value()).toBe("120");
  });
});
