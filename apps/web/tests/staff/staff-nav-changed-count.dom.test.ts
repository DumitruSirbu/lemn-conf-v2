// @vitest-environment happy-dom
//
// The menu's counter of changed kitchens (plan M10, wave K4b): the frame asks the count route once and then once per poll
// interval, draws the number beside "Bucătării clienți" in the desktop nav and the phone's sheet with a spoken name, and
// follows the poll's rules: no request without the kitchens page, a pause while the tab is hidden, a stop on 401, 403
// and 429, and the last count kept through any other failure. `fetch` is a scripted stub; timers are fake.

import { act, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetAccountSessionForTests } from "@/account/session/use-account-session";
import { CHANGED_COUNT_POLL_INTERVAL_SECONDS } from "@/staff/changed-count-poll-interval";
import type { StaffNavItem } from "@/staff/staff-nav-group";
import { navigationGroupsOf } from "@/staff/staff-navigation-groups";
import { StaffShell, type StaffPage } from "@/staff/staff-shell";
import {
  getStaffSessionExpiry,
  resetStaffSessionExpiryForTests,
} from "@/staff/staff-session-expiry";

import { roCopy } from "../price-dashboard/romanian-copy";
import { flushPromises } from "../support/render-hook";
import {
  allIn,
  click,
  mountInCatalogue,
  requireIn,
  type MountedScreen,
} from "../support/render-with-intl";

const COUNT_ADDRESS = "/api/staff/kitchens/changed-count";
const POLL_MS = CHANGED_COUNT_POLL_INTERVAL_SECONDS * 1000;
const DESKTOP_NAV = '[data-testid="staff-nav"]';
const SHEET = '[data-testid="staff-menu-sheet"]';
const MENU_BUTTON = '[data-testid="staff-menu-button"]';
const KITCHENS_HREF = "/ro/staff/kitchens";

type Answer = { readonly status: number; readonly body: unknown } | "offline";

let screen: MountedScreen | undefined;
let answers: Answer[];
let countRequests: number;

beforeEach(() => {
  vi.useFakeTimers();
  resetAccountSessionForTests();
  resetStaffSessionExpiryForTests();
  answers = [];
  countRequests = 0;
  setTabHidden(false);
  vi.stubGlobal("fetch", vi.fn(answerFromScript));
});

afterEach(() => {
  screen?.unmount();
  screen = undefined;
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

function answerFromScript(address: string | URL | Request): Promise<Response> {
  if (address !== COUNT_ADDRESS) {
    return Promise.resolve(new Response("{}", { status: 200 }));
  }
  countRequests += 1;
  const next = answers.length > 1 ? answers.shift() : answers[0];
  if (next === undefined || next === "offline") {
    return Promise.reject(new TypeError("offline"));
  }
  return Promise.resolve(
    new Response(JSON.stringify(next.body), {
      status: next.status,
      headers: { "content-type": "application/json" },
    }),
  );
}

function setTabHidden(isHidden: boolean): void {
  Object.defineProperty(document, "hidden", {
    configurable: true,
    get: () => isHidden,
  });
}

function showTabAgain(): void {
  setTabHidden(false);
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

const count = (value: number): Answer => ({
  status: 200,
  body: { count: value },
});

async function mountShell(
  navigation: readonly StaffPage[] = ["kitchens", "audit"],
): Promise<void> {
  screen = mountInCatalogue(
    createElement(StaffShell, {
      locale: "ro",
      page: "kitchens",
      context: {
        role: "operator",
        email: "mihai.rusu@lemnaria.md",
        navigation: navigation as never,
      },
      children: createElement("h1", null, "the page"),
    }),
    "ro",
  );
  await flushPromises(5);
}

async function passTime(milliseconds: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(milliseconds);
  });
}

function container(): HTMLElement {
  if (screen === undefined) throw new Error("nothing is mounted");
  return screen.container;
}

function kitchensLinkIn(parent: ParentNode): HTMLElement | undefined {
  return allIn(parent, `a[href="${KITCHENS_HREF}"]`).at(0);
}

function desktopLink(): HTMLElement | undefined {
  return kitchensLinkIn(requireIn(container(), DESKTOP_NAV));
}

describe("the counter beside the kitchens page", () => {
  it("draws the count in the desktop nav with a spoken name that says what it counts", async () => {
    answers = [count(3)];

    await mountShell();

    const link = desktopLink();
    expect(link?.textContent).toContain("3");
    expect(link?.getAttribute("aria-label")).toBe(
      roCopy("priceDashboard.nav.itemWithBadge", {
        name: roCopy("staffShell.navKitchens"),
        label: roCopy("priceDashboard.nav.changedKitchens", { count: 3 }),
      }),
    );
  });

  it("draws the same count in the phone's sheet", async () => {
    answers = [count(1)];
    await mountShell();

    click(requireIn(container(), MENU_BUTTON));

    const link = kitchensLinkIn(requireIn(container(), SHEET));
    expect(link?.textContent).toContain("1");
    expect(link?.getAttribute("aria-label")).toContain(
      roCopy("priceDashboard.nav.changedKitchens", { count: 1 }),
    );
  });

  it("draws no badge for zero, for an unreadable body, or before the answer is in", async () => {
    answers = [{ status: 200, body: { count: "3" } }];
    screen = undefined;

    await mountShell();

    expect(desktopLink()?.getAttribute("aria-label")).toBeNull();
    answers = [count(0)];
    await passTime(POLL_MS);
    expect(desktopLink()?.getAttribute("aria-label")).toBeNull();
  });

  it("asks again after the poll interval and not before", async () => {
    answers = [count(1), count(5)];
    await mountShell();
    expect(countRequests).toBe(1);

    await passTime(POLL_MS - 1);
    expect(countRequests).toBe(1);
    await passTime(1);

    expect(countRequests).toBe(2);
    expect(desktopLink()?.textContent).toContain("5");
  });

  it("asks nothing after the frame is gone", async () => {
    answers = [count(1)];
    await mountShell();

    screen?.unmount();
    screen = undefined;
    await passTime(POLL_MS * 3);

    expect(countRequests).toBe(1);
  });

  it("makes no request when the navigation does not list the kitchens page", async () => {
    answers = [count(4)];

    await mountShell(["audit"]);
    await passTime(POLL_MS * 2);

    expect(countRequests).toBe(0);
  });

  it("keeps the last count through an offline poll and asks again", async () => {
    answers = [count(2), "offline", count(6)];
    await mountShell();

    await passTime(POLL_MS);
    expect(desktopLink()?.textContent).toContain("2");
    await passTime(POLL_MS);

    expect(countRequests).toBe(3);
    expect(desktopLink()?.textContent).toContain("6");
  });
});

describe("the poll's stops", () => {
  it("raises the session sheet once on 401 and stops asking", async () => {
    answers = [{ status: 401, body: { status: "unauthenticated" } }];

    await mountShell();
    await passTime(POLL_MS * 3);

    expect(getStaffSessionExpiry()).toEqual({ keepsTypedText: false });
    expect(countRequests).toBe(1);
  });

  it("removes the badge and stops asking on 403", async () => {
    answers = [count(2), { status: 403, body: { status: "forbidden" } }];
    await mountShell();

    await passTime(POLL_MS);
    await passTime(POLL_MS * 3);

    expect(countRequests).toBe(2);
    expect(desktopLink()?.getAttribute("aria-label")).toBeNull();
  });

  it("never retries a 429 and keeps the count it had", async () => {
    answers = [count(2), { status: 429, body: { status: "rate-limited" } }];
    await mountShell();

    await passTime(POLL_MS);
    await passTime(POLL_MS * 3);

    expect(countRequests).toBe(2);
    expect(desktopLink()?.textContent).toContain("2");
  });

  it("pauses while the tab is hidden and asks once when it is shown", async () => {
    answers = [count(1), count(7)];
    await mountShell();

    setTabHidden(true);
    await passTime(POLL_MS * 3);
    expect(countRequests).toBe(1);
    showTabAgain();
    await flushPromises(5);

    expect(countRequests).toBe(2);
    expect(desktopLink()?.textContent).toContain("7");
  });
});

describe("the menu link's count beside other pages", () => {
  const translate = (count: number) => ({
    count,
    menuLinkName: (name: string) => `${name}, ${String(count)}`,
  });
  const input = {
    locale: "ro",
    page: "kitchens",
    navigation: ["kitchens", "publish"],
    labelOf: { kitchens: "Kitchens", publish: "Publish" },
    headingOf: {
      customers: undefined,
      catalog: undefined,
      prices: undefined,
      administration: undefined,
    },
    pendingPrices: { ...translate(7), label: "7 prices" },
  } as unknown as Parameters<typeof navigationGroupsOf>[0];

  function itemsOf(
    changedKitchens: ReturnType<typeof translate> | undefined,
  ): Record<string, StaffNavItem | undefined> {
    const groups = navigationGroupsOf({ ...input, changedKitchens });
    return Object.fromEntries(
      groups.flatMap((group) => group.items).map((item) => [item.key, item]),
    );
  }

  it("gives the kitchens link its count and leaves the publish link its own", () => {
    const items = itemsOf(translate(3));

    expect(items.kitchens?.badge).toEqual({ count: 3 });
    expect(items.kitchens?.accessibleName).toBe("Kitchens, 3");
    expect(items.publish?.badge).toEqual({ count: 7 });
  });

  it("gives the kitchens link no badge without a count, and never the pending prices", () => {
    const items = itemsOf(undefined);

    expect(items.kitchens?.badge).toBeUndefined();
    expect(items.kitchens?.accessibleName).toBeUndefined();
    expect(items.publish?.badge).toEqual({ count: 7 });
  });
});
