// @vitest-environment happy-dom
//
// Adversarial QA of M12 wave W6c on the real kitchen page (ADR 0185 decisions 3 and 4; plan W6c-2, W6c-5): the list's open
// state across the page's own version switch, what nothing stores, and which copies the page prices. The server is a
// stand-in for `fetch`; the 3D canvas is a stub.
import { act, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetAccountSessionForTests } from "@/account/session/use-account-session";
import { StaffKitchenScreen } from "@/staff/staff-kitchen-page";
import { resetStaffSessionExpiryForTests } from "@/staff/staff-session-expiry";
import type { StaffShellContext } from "@/staff/staff-shell";

import { flushPromises } from "../support/render-hook";
import {
  allIn,
  click,
  mountInCatalogue,
  requireIn,
  type MountedScreen,
  type TestLocale,
} from "../support/render-with-intl";
import {
  STAFF_KITCHEN_ID,
  WIRE_DESIGN,
  wireDraftKitchen,
  wireKitchen,
} from "../support/staff-kitchen-wire";
import { installStaffKitchensServer } from "../support/staff-kitchens-wire";

vi.mock("@/scene/kitchen-canvas", async () => {
  const { createElement: element } = await import("react");
  return {
    default: () => null,
    ViewOnlyKitchenCanvas: () => element("canvas"),
  };
});
vi.mock("@/scene/webgl-support", () => ({
  useWebGLSupport: () => "supported",
  detectWebGLSupport: () => true,
}));

const CONTEXT: StaffShellContext = {
  role: "operator",
  email: "mihai.rusu@lemnaria.md",
  navigation: ["kitchens"],
};
const KITCHEN_ADDRESS = `/api/staff/kitchens/${STAFF_KITCHEN_ID}`;
const SEEN_ADDRESS = `${KITCHEN_ADDRESS}/seen`;
const LOCALES: readonly TestLocale[] = ["ro", "ru"];
const WIRE_BODIES = (WIRE_DESIGN as { placements: unknown[] }).placements;
const FEWER_BODIES_DESIGN: unknown = {
  ...(WIRE_DESIGN as object),
  placements: WIRE_BODIES.filter((_body, index) => index % 2 === 0),
};

let screen: MountedScreen | undefined;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-21T12:00:00.000Z"));
  resetAccountSessionForTests();
  resetStaffSessionExpiryForTests();
  vi.stubGlobal("location", { assign: () => undefined });
  window.localStorage.clear();
  window.sessionStorage.clear();
});

afterEach(() => {
  screen?.unmount();
  screen = undefined;
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

async function mount(
  locale: TestLocale,
  kitchen: Record<string, unknown>,
): Promise<HTMLElement> {
  installStaffKitchensServer().script((request) => {
    if (request.url.pathname === SEEN_ADDRESS) {
      return { body: { changedAfterSeen: false } };
    }
    if (request.url.pathname === KITCHEN_ADDRESS) return { body: kitchen };
    return {
      body: {
        state: "signed-in",
        email: CONTEXT.email,
        capabilities: ["design.read.any", "account.manage.own"],
      },
    };
  });
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
  return screen.container;
}

function switchTo(container: HTMLElement, version: "sent" | "current"): void {
  click(
    requireIn(
      container,
      `[data-testid="staff-kitchen-versions"] input[value="${version}"]`,
    ),
  );
}

async function settle(): Promise<void> {
  for (let round = 0; round < 3; round += 1) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
  }
}

function headers(container: HTMLElement): HTMLButtonElement[] {
  return allIn<HTMLButtonElement>(
    container,
    '[data-testid="staff-cabinet-group-toggle"]',
  );
}

function amounts(container: HTMLElement): HTMLElement[] {
  return allIn(container, '[data-testid="staff-kitchen-cabinet-amount"]');
}

describe.each(LOCALES)(
  "the cabinet list on the kitchen page, in %s",
  (locale) => {
    const changed = () =>
      wireKitchen({
        changedAfterSeen: true,
        displayedRevision: "7",
        kitchen: { asSent: FEWER_BODIES_DESIGN },
      });

    it("keeps the list mounted, and what staff pressed, across the page's own switch of copy, both ways", async () => {
      const container = await mount(locale, changed());
      const list = requireIn(
        container,
        '[data-testid="staff-kitchen-cabinets"]',
      );
      const stateOf = () =>
        Object.fromEntries(
          headers(container).map((b) => [
            b.textContent,
            b.getAttribute("aria-expanded"),
          ]),
        );
      const names = headers(container).map((b) => b.textContent);
      const last = headers(container).at(-1);
      if (last === undefined) throw new Error("no group");
      click(last);
      const pressed = last.textContent;
      const before = stateOf();
      expect(before[pressed]).not.toBe(undefined);

      switchTo(container, "sent");
      await settle();
      expect(
        requireIn(container, '[data-testid="staff-kitchen-cabinets"]'),
      ).toBe(list);
      const asSent = stateOf();
      expect(Object.keys(asSent).length).toBeGreaterThan(0);

      switchTo(container, "current");
      await settle();
      expect(headers(container).map((b) => b.textContent)).toEqual(names);
      expect(stateOf()[pressed]).toBe(before[pressed]);
    });

    it("keeps expand-all across the page's switch of copy", async () => {
      const container = await mount(locale, changed());
      click(
        requireIn(
          container,
          '[data-testid="staff-kitchen-cabinets-toggle-all"]',
        ),
      );

      switchTo(container, "sent");
      await settle();

      expect(
        new Set(headers(container).map((b) => b.getAttribute("aria-expanded"))),
      ).toEqual(new Set(["true"]));
    });

    it("stores nothing of what was pressed, and a page opened again starts from the defaults", async () => {
      const container = await mount(locale, changed());
      const pristine = headers(container).map((b) =>
        b.getAttribute("aria-expanded"),
      );
      const first = headers(container).at(-1);
      if (first === undefined) throw new Error("no group");
      click(first);
      click(
        requireIn(
          container,
          '[data-testid="staff-kitchen-cabinets-toggle-all"]',
        ),
      );

      expect(window.localStorage.length).toBe(0);
      expect(window.sessionStorage.length).toBe(0);
      screen?.unmount();
      const reopened = await mount(locale, changed());
      expect(
        headers(reopened).map((b) => b.getAttribute("aria-expanded")),
      ).toEqual(pristine);
    });

    it("prices the copy of a draft, which has no sent copy, and a kitchen as sent and unchanged shows no amounts", async () => {
      const draft = await mount(locale, wireDraftKitchen());
      expect(amounts(draft)).toHaveLength(WIRE_BODIES.length);
      screen?.unmount();

      const unchanged = await mount(locale, wireKitchen());

      expect(
        allIn(unchanged, '[data-testid="staff-kitchen-cabinet"]'),
      ).toHaveLength(WIRE_BODIES.length);
      expect(amounts(unchanged)).toHaveLength(0);
    });

    it("lists a sent kitchen whose copy as sent cannot be read, from the document as it stands, once", async () => {
      const container = await mount(
        locale,
        wireKitchen({ kitchen: { asSent: null } }),
      );

      expect(
        allIn(container, '[data-testid="staff-kitchen-cabinet"]'),
      ).toHaveLength(WIRE_BODIES.length);
      expect(
        allIn(container, '[data-testid="staff-kitchen-versions"]'),
      ).toHaveLength(0);
    });
  },
);
