// What the adversarial tests of the staff kitchens list (wave L3-U2) share: the whole screen mounted in the shipped
// catalogue over a stand-in for `fetch`, fake timers that settle every request, and a `matchMedia` whose width the test
// can change while the screen is mounted. Not a test file: the suites that use it are `qa-l3-u2-*.adversarial.dom.test.ts`.
import { act, createElement } from "react";
import { vi } from "vitest";

import { resetAccountSessionForTests } from "@/account/session/use-account-session";
import { StaffKitchensScreen } from "@/staff/staff-kitchens-list";
import type { StaffShellContext } from "@/staff/staff-shell";
import { resetStaffSessionExpiryForTests } from "@/staff/staff-session-expiry";

import { flushPromises } from "../support/render-hook";
import {
  allIn,
  mountInCatalogue,
  requireIn,
  type MountedScreen,
  type TestLocale,
} from "../support/render-with-intl";
import {
  installStaffKitchensServer,
  type RecordedRequest,
  type ServerAnswer,
  type StaffKitchensServer,
} from "../support/staff-kitchens-wire";

export const STAFF_ADDRESS = "mihai.rusu@lemnaria.md";
export const SEARCH_SETTLE_MS = 500;
export const COUNT = '[data-testid="staff-kitchens-count"]';
export const ROWS = '[data-testid="staff-kitchen-row"]';
export const TABLE = '[data-testid="staff-kitchens-table"]';
export const CARDS = '[data-testid="staff-kitchens-cards"]';
export const FOOT = '[data-testid="staff-kitchens-foot"]';

const CONTEXT: StaffShellContext = {
  role: "operator",
  email: STAFF_ADDRESS,
  navigation: ["kitchens"],
};

export type Width = "desktop" | "phone";
export type ListAnswer = ServerAnswer | "hold" | "offline";

/** A viewport the test can resize: `change` listeners are kept and fired, and every subscription is counted. */
export interface Viewport {
  readonly resizeTo: (width: Width) => void;
  readonly liveListeners: () => number;
}

export interface ListHarness {
  readonly server: StaffKitchensServer;
  readonly viewport: Viewport;
  readonly assigned: string[];
  readonly settle: () => Promise<void>;
  readonly pass: (milliseconds: number) => Promise<void>;
  readonly mount: (options?: MountOptions) => Promise<void>;
  readonly container: () => HTMLElement;
  readonly unmount: () => void;
  readonly answers: (answer: (request: RecordedRequest) => ListAnswer) => void;
  readonly listRequests: () => RecordedRequest[];
  readonly tearDown: () => void;
}

export interface MountOptions {
  readonly locale?: TestLocale;
  readonly width?: Width;
}

/** Call in `beforeEach`; call `tearDown` in `afterEach`. */
export function setUpListHarness(): ListHarness {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-21T12:00:00.000Z"));
  resetAccountSessionForTests();
  resetStaffSessionExpiryForTests();
  const assigned: string[] = [];
  vi.stubGlobal("location", {
    assign: (address: string) => assigned.push(address),
  });
  const server = installStaffKitchensServer();
  const viewport = installViewport();
  let screen: MountedScreen | undefined;

  const harness: ListHarness = {
    server,
    viewport,
    assigned,
    settle,
    pass: async (milliseconds) => {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(milliseconds);
      });
      await settle();
    },
    mount: async ({ locale = "ro", width = "phone" } = {}) => {
      viewport.resizeTo(width);
      screen = mountInCatalogue(
        createElement(StaffKitchensScreen, { locale, context: CONTEXT }),
        locale,
      );
      await settle();
    },
    container: () => {
      if (screen === undefined) throw new Error("nothing is mounted");
      return screen.container;
    },
    unmount: () => {
      screen?.unmount();
      screen = undefined;
    },
    answers: (answer) => {
      server.script((request) =>
        request.url.pathname === "/api/staff/kitchens"
          ? answer(request)
          : {
              body: {
                state: "signed-in",
                email: STAFF_ADDRESS,
                capabilities: ["design.read.any", "account.manage.own"],
              },
            },
      );
    },
    listRequests: () =>
      server.requests.filter(
        ({ url }) => url.pathname === "/api/staff/kitchens",
      ),
    tearDown: () => {
      screen?.unmount();
      screen = undefined;
      vi.useRealTimers();
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
      document.body.replaceChildren();
    },
  };
  return harness;
}

async function settle(): Promise<void> {
  for (let round = 0; round < 4; round += 1) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
  }
  await flushPromises(2);
}

function installViewport(): Viewport {
  const listeners = new Set<() => void>();
  let width: Width = "phone";
  vi.stubGlobal("matchMedia", (query: string) => ({
    get matches() {
      return width === "desktop";
    },
    media: query,
    addEventListener: (_type: string, listener: () => void) => {
      listeners.add(listener);
    },
    removeEventListener: (_type: string, listener: () => void) => {
      listeners.delete(listener);
    },
  }));
  return {
    resizeTo: (next) => {
      width = next;
      act(() => {
        for (const listener of [...listeners]) listener();
      });
    },
    liveListeners: () => listeners.size,
  };
}

export function inputOfSearch(container: HTMLElement): HTMLInputElement {
  return requireIn<HTMLInputElement>(container, 'input[type="search"]');
}

export function radiosOf(container: HTMLElement): HTMLInputElement[] {
  return allIn<HTMLInputElement>(container, 'input[type="radio"]');
}
