// What the adversarial tests of the audit page (wave L3-U6) share: the whole screen mounted in the shipped catalogue over a
// stand-in for `fetch` that can hold a request, refuse to honour an abort, and answer with any status; the clock is faked, so
// a test can let hours pass and count what was asked. Written for the QA files of this wave and read by no other.
import { act, createElement, type ReactNode } from "react";
import { vi, type Mock } from "vitest";

import { resetAccountSessionForTests } from "@/account/session/use-account-session";
import { StaffAuditScreen } from "@/staff/staff-audit-page";
import { resetStaffSessionExpiryForTests } from "@/staff/staff-session-expiry";
import type { StaffShellContext } from "@/staff/staff-shell";

import { flushPromises } from "../support/render-hook";
import {
  allIn,
  mountInCatalogue,
  requireIn,
  type MountedScreen,
  type TestLocale,
} from "../support/render-with-intl";
import { ADMINISTRATOR_ADDRESS } from "../support/staff-audit-wire";
import {
  installStaffKitchensServer,
  type RecordedRequest,
  type ServerAnswer,
  type StaffKitchensServer,
} from "../support/staff-kitchens-wire";

import { required } from "./qa-l3-u6-required.adversarial";

export const AUDIT_ROUTE = "/api/staff/audit";
export const AUDIT_NOW = new Date("2026-10-21T12:00:00.000Z");
export const ROWS = '[data-testid="staff-audit-row"]';
export const TABLE = '[data-testid="staff-audit-table"]';
export const CARDS = '[data-testid="staff-audit-cards"]';
export const SHOWING = '[data-testid="staff-audit-showing"]';
export const PAGE = '[data-testid="staff-audit-page"]';

const CONTEXT: StaffShellContext = {
  role: "administrator",
  email: ADMINISTRATOR_ADDRESS,
  navigation: ["kitchens", "audit"],
};

export type AuditAnswer = ServerAnswer | "hold" | "offline";
export type Width = "desktop" | "phone";

export interface AuditHarness {
  readonly server: StaffKitchensServer;
  readonly location: { assign: Mock; reload: Mock };
  /** What the audit route answers; every other address is the account area's session read. */
  readonly answers: (answer: (request: RecordedRequest) => AuditAnswer) => void;
  readonly mount: (options?: {
    locale?: TestLocale;
    width?: Width;
    wrap?: (children: ReactNode) => ReactNode;
  }) => Promise<void>;
  readonly container: () => HTMLElement;
  /** Takes the screen away and leaves the fake clock and the stand-in server as they are. */
  readonly unmount: () => void;
  readonly auditRequests: () => RecordedRequest[];
  readonly queries: () => Record<string, string>[];
  readonly settle: () => Promise<void>;
  readonly pass: (milliseconds: number) => Promise<void>;
  readonly selects: () => HTMLSelectElement[];
  readonly personSelect: () => HTMLSelectElement;
  readonly actionSelect: () => HTMLSelectElement;
  readonly dayInputs: () => [HTMLInputElement, HTMLInputElement];
  readonly choose: (select: HTMLSelectElement, value: string) => Promise<void>;
  readonly tearDown: () => void;
}

export function setUpAuditHarness(): AuditHarness {
  vi.useFakeTimers();
  vi.setSystemTime(AUDIT_NOW);
  resetAccountSessionForTests();
  resetStaffSessionExpiryForTests();
  const location = { assign: vi.fn(), reload: vi.fn() };
  vi.stubGlobal("location", location);
  const server = installStaffKitchensServer();
  let screen: MountedScreen | undefined;

  const settle = async (): Promise<void> => {
    for (let round = 0; round < 4; round += 1) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
    }
    await flushPromises(2);
  };
  const container = (): HTMLElement => {
    if (screen === undefined) throw new Error("nothing is mounted");
    return screen.container;
  };
  const selects = () => allIn<HTMLSelectElement>(container(), "select");

  return {
    server,
    location,
    answers: (answer) => {
      server.script((request) => {
        if (request.url.pathname === AUDIT_ROUTE) return answer(request);
        return {
          body: {
            state: "signed-in",
            email: ADMINISTRATOR_ADDRESS,
            capabilities: ["audit.read", "account.manage.own"],
          },
        };
      });
    },
    mount: async ({ locale = "ro", width = "phone", wrap } = {}) => {
      vi.stubGlobal("matchMedia", (query: string) => ({
        matches: width === "desktop",
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }));
      const screenElement = createElement(StaffAuditScreen, {
        locale,
        context: CONTEXT,
      });
      screen = mountInCatalogue(
        wrap === undefined ? screenElement : (wrap(screenElement) as never),
        locale,
      );
      await settle();
    },
    container,
    unmount: () => {
      screen?.unmount();
      screen = undefined;
    },
    auditRequests: () =>
      server.requests.filter(({ url }) => url.pathname === AUDIT_ROUTE),
    queries: () =>
      server.requests
        .filter(({ url }) => url.pathname === AUDIT_ROUTE)
        .map(({ url }) => Object.fromEntries(url.searchParams)),
    settle,
    pass: async (milliseconds) => {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(milliseconds);
      });
      await settle();
    },
    selects,
    personSelect: () => required(selects()[0]),
    actionSelect: () => required(selects()[1]),
    dayInputs: () => {
      const [from, to] = allIn<HTMLInputElement>(
        container(),
        'input[type="date"]',
      );
      if (from === undefined || to === undefined) throw new Error("no days");
      return [from, to];
    },
    choose: async (select, value) => {
      act(() => {
        select.value = value;
        select.dispatchEvent(new Event("change", { bubbles: true }));
      });
      await settle();
    },
    tearDown: () => {
      screen?.unmount();
      screen = undefined;
      vi.useRealTimers();
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
      document.body.replaceChildren();
    },
  };
}

export function requireRows(root: ParentNode): HTMLElement[] {
  return allIn(root, ROWS);
}

export function showingText(root: ParentNode): string {
  return requireIn(root, SHOWING).textContent;
}
