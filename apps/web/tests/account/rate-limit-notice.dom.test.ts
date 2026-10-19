// @vitest-environment happy-dom
// The sentence for a limited request (Lot 1 plan P12; Lot 2 criterion 18). A short wait is counted down on screen but
// announced twice only: the limit once, with a sentence fixed at mount, and "you can try again" once, at the end. The
// ticking time is hidden from assistive technology so the live region is not read every second.
import { act, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RateLimitNotice } from "@/account/account-form-parts";
import type { AccountRateLimitNotice } from "@/i18n/content";

import roMessages from "../../src/messages/ro.json";
import ruMessages from "../../src/messages/ru.json";
import {
  mountInCatalogue,
  requireIn,
  type MountedScreen,
  type TestLocale,
} from "../support/render-with-intl";

const NOW_MS = Date.UTC(2026, 9, 19, 10, 0, 0);

let screen: MountedScreen | undefined;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW_MS);
});

afterEach(() => {
  screen?.unmount();
  screen = undefined;
  vi.useRealTimers();
});

function show(
  notice: AccountRateLimitNotice,
  locale: TestLocale = "ro",
): MountedScreen {
  screen = mountInCatalogue(createElement(RateLimitNotice, { notice }), locale);
  return screen;
}

function advance(milliseconds: number): void {
  act(() => {
    vi.advanceTimersByTime(milliseconds);
  });
}

/** The two spans of a counting notice: what the eye reads (hidden from assistive technology) and what is announced. */
function countingSpans(page: MountedScreen): {
  seen: HTMLElement;
  announced: HTMLElement;
} {
  const body = Array.from(
    page.container.querySelectorAll<HTMLElement>("span"),
  ).find(
    (candidate) =>
      candidate.children.length === 2 &&
      candidate.children[0]?.tagName === "SPAN",
  );
  if (body === undefined)
    throw new Error(
      "the notice does not hold a seen and an announced sentence",
    );
  const [seen, announced] = Array.from(body.children) as HTMLElement[];
  if (seen === undefined || announced === undefined)
    throw new Error("missing span");
  return { seen, announced };
}

const noticeRegion = (page: MountedScreen): HTMLElement =>
  requireIn(page.container, "[role]");

describe("a countdown", () => {
  it("shows minutes and zero-padded seconds, hidden from assistive technology, with a fixed sentence announced instead", () => {
    const page = show({ kind: "countdown", endsAtMs: NOW_MS + 75_000 });
    const { seen, announced } = countingSpans(page);
    expect(seen.getAttribute("aria-hidden")).toBe("true");
    expect(seen.textContent).toContain("1:15");
    expect(announced.getAttribute("aria-hidden")).toBeNull();
    expect(announced.textContent).toContain("2 min");
  });

  it("ticks the seen time down while the announced sentence never changes", () => {
    const page = show({ kind: "countdown", endsAtMs: NOW_MS + 75_000 });
    const announcedAtMount = countingSpans(page).announced.textContent;
    const seenTimes = new Set<string>();
    for (let tick = 0; tick < 70; tick += 1) {
      advance(1_000);
      const { seen, announced } = countingSpans(page);
      seenTimes.add(seen.textContent);
      expect(announced.textContent).toBe(announcedAtMount);
    }
    expect(seenTimes.size).toBeGreaterThan(60);
    expect(countingSpans(page).seen.textContent).toContain("0:05");
  });

  it("announces the limit once: the announced span is the same element from the first second to the last", () => {
    const page = show({ kind: "countdown", endsAtMs: NOW_MS + 30_000 });
    const announcedFirst = countingSpans(page).announced;
    advance(20_000);
    expect(countingSpans(page).announced).toBe(announcedFirst);
    expect(noticeRegion(page).getAttribute("role")).toBe("status");
  });

  it("rounds the announced wait up to a whole minute, at least one", () => {
    const sixtySeconds = show({ kind: "countdown", endsAtMs: NOW_MS + 60_000 });
    expect(countingSpans(sixtySeconds).announced.textContent).toContain(
      "1 min",
    );
    sixtySeconds.unmount();
    const oneSecond = show({ kind: "countdown", endsAtMs: NOW_MS + 1_000 });
    expect(countingSpans(oneSecond).announced.textContent).toContain("1 min");
    oneSecond.unmount();
    const sixtyOne = show({ kind: "countdown", endsAtMs: NOW_MS + 61_000 });
    expect(countingSpans(sixtyOne).announced.textContent).toContain("2 min");
  });

  it("says the wait is over, once, in the same element and in the info tone, and stops its clock", () => {
    const page = show({ kind: "countdown", endsAtMs: NOW_MS + 10_000 });
    const region = noticeRegion(page);
    expect(region.getAttribute("data-tone")).toBe("warning");
    advance(10_000);
    expect(page.container.textContent).toContain(
      roMessages.accountForm.rateLimitedReady,
    );
    expect(noticeRegion(page).getAttribute("data-tone")).toBe("info");
    expect(page.container.textContent).not.toContain("Prea multe");
    expect(vi.getTimerCount()).toBe(0);
    advance(60_000);
    expect(page.container.textContent).toContain(
      roMessages.accountForm.rateLimitedReady,
    );
  });

  it("is already over for an instant in the past", () => {
    const page = show({ kind: "countdown", endsAtMs: NOW_MS - 5_000 });
    expect(page.container.textContent).toContain(
      roMessages.accountForm.rateLimitedReady,
    );
  });

  it("counts against the clock, not against ticks: a tab that slept catches up at once", () => {
    const page = show({ kind: "countdown", endsAtMs: NOW_MS + 100_000 });
    act(() => {
      vi.setSystemTime(NOW_MS + 90_000);
      vi.advanceTimersByTime(250);
    });
    expect(countingSpans(page).seen.textContent).toContain("0:10");
  });

  it("stops its clock when the screen goes", () => {
    const page = show({ kind: "countdown", endsAtMs: NOW_MS + 100_000 });
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    page.unmount();
    screen = undefined;
    expect(vi.getTimerCount()).toBe(0);
  });

  it("tells the Russian site in Russian, with the same shape", () => {
    const page = show({ kind: "countdown", endsAtMs: NOW_MS + 75_000 }, "ru");
    const { seen, announced } = countingSpans(page);
    expect(seen.textContent).toContain("1:15");
    expect(announced.textContent).toContain("2 мин");
    advance(75_000);
    expect(page.container.textContent).toContain(
      ruMessages.accountForm.rateLimitedReady,
    );
  });
});

describe("a wait told as a sentence", () => {
  it("says whole minutes, once, without a clock", () => {
    const page = show({ kind: "minutes", minutes: 12 });
    expect(page.container.textContent).toContain("12 min");
    expect(vi.getTimerCount()).toBe(0);
    expect(noticeRegion(page).getAttribute("data-tone")).toBe("warning");
  });

  it("says the time it ends at, and tomorrow's when it ends on a later day", () => {
    const today = show({ kind: "at", time: "14:05", isTomorrow: false });
    expect(today.container.textContent).toContain("14:05");
    expect(today.container.textContent).toContain(
      roMessages.accountForm.rateLimitedAt
        .replace(/<\/?strong>/g, "")
        .replace("{time}", "14:05"),
    );
    today.unmount();
    const tomorrow = show({ kind: "at", time: "09:30", isTomorrow: true });
    expect(tomorrow.container.textContent).toContain("09:30");
    expect(tomorrow.container.textContent).toContain(
      roMessages.accountForm.rateLimitedTomorrowAt
        .replace(/<\/?strong>/g, "")
        .replace("{time}", "09:30"),
    );
  });

  it("states no number for an unreadable wait", () => {
    const page = show({ kind: "unreadable" });
    expect(page.container.textContent).not.toMatch(/\d/);
    expect(page.container.textContent).toContain(
      roMessages.accountForm.rateLimitedFallback.replace(/<\/?strong>/g, ""),
    );
  });
});
