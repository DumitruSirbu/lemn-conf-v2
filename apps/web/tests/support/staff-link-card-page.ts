// The staff kitchen page mounted for the link card's tests: a scripted `fetch` that answers the kitchen and the session, the
// shop's page origin, a version switch to choose with, and a clipboard to stub. The canvas mocks are `vi.mock` calls and
// stay in each test file, where they are hoisted. `screen` and `server` are live bindings: they read the page the last
// `mountWith` left.
import { createElement } from "react";
import { act } from "react";
import { afterEach, beforeEach, vi } from "vitest";

import { resetAccountSessionForTests } from "@/account/session/use-account-session";
import { StaffKitchenScreen } from "@/staff/staff-kitchen-page";
import { resetStaffSessionExpiryForTests } from "@/staff/staff-session-expiry";
import type { StaffShellContext } from "@/staff/staff-shell";

import { flushPromises } from "./render-hook";
import {
  allIn,
  click,
  mountInCatalogue,
  requireIn,
  type MountedScreen,
  type TestLocale,
} from "./render-with-intl";
import { STAFF_KITCHEN_ID, WIRE_DESIGN } from "./staff-kitchen-wire";
import {
  installStaffKitchensServer,
  type StaffKitchensServer,
} from "./staff-kitchens-wire";

export const PAGE_ORIGIN = "https://lemnaria.example";
/** A copy of the kitchen's document with fewer bodies, so a kitchen given it as `asSent` has two readable copies. */
export const FEWER_BODIES_DESIGN: unknown = {
  ...(WIRE_DESIGN as { placements: unknown[] }),
  placements: (WIRE_DESIGN as { placements: unknown[] }).placements.slice(0, 3),
};

const CONTEXT: StaffShellContext = {
  role: "operator",
  email: "mihai.rusu@lemnaria.md",
  navigation: ["kitchens"],
};
const KITCHEN_ADDRESS = `/api/staff/kitchens/${STAFF_KITCHEN_ID}`;

export let screen: MountedScreen | undefined;
export let server: StaffKitchensServer | undefined;

/** Call at the top of a test file: the timers, the stores, the page origin and the clean-up of each test. */
export function setUpLinkCardPage(): void {
  beforeEach(() => {
    vi.useFakeTimers();
    resetAccountSessionForTests();
    resetStaffSessionExpiryForTests();
    vi.stubGlobal("location", { assign: () => undefined, origin: PAGE_ORIGIN });
  });

  afterEach(() => {
    unmountPage();
    server = undefined;
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    document.body.replaceChildren();
  });
}

/** Takes the page away before the test ends, as leaving it does. */
export function unmountPage(): void {
  screen?.unmount();
  screen = undefined;
}

export async function mountWith(
  kitchen: Record<string, unknown>,
  locale: TestLocale = "ro",
): Promise<void> {
  server = installStaffKitchensServer();
  server.script((request) =>
    request.url.pathname === KITCHEN_ADDRESS
      ? { body: kitchen }
      : {
          body: {
            state: "signed-in",
            email: CONTEXT.email,
            capabilities: ["design.read.any", "account.manage.own"],
          },
        },
  );
  screen = mountInCatalogue(
    createElement(StaffKitchenScreen, {
      locale,
      context: CONTEXT,
      designId: STAFF_KITCHEN_ID,
    }),
    locale,
  );
  for (let round = 0; round < 4; round += 1) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
  }
  await flushPromises(2);
}

export function inPage(testId: string): HTMLElement {
  if (screen === undefined) throw new Error("nothing is mounted");
  return requireIn(screen.container, `[data-testid="${testId}"]`);
}

export function chooseVersion(version: "sent" | "current"): void {
  if (screen === undefined) throw new Error("nothing is mounted");
  const choice = allIn<HTMLInputElement>(
    screen.container,
    '[data-testid="staff-kitchen-versions"] input',
  ).find((input) => input.value === version);
  if (choice === undefined) throw new Error(`no choice ${version}`);
  click(choice);
}

export async function settle(): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

export function stubClipboard(
  writeText: (text: string) => Promise<void>,
): void {
  vi.stubGlobal("navigator", { clipboard: { writeText } });
}

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}
