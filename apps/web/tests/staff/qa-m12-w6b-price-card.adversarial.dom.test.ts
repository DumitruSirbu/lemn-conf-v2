// @vitest-environment happy-dom
//
// Adversarial QA of M12 W6b on the rendered kitchen page: the price card under hostile wire totals, in both locales,
// and the structure a reader of the page, sighted or not, is given. The server is a stand-in for `fetch`.
import { createElement } from "react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetAccountSessionForTests } from "@/account/session/use-account-session";
import { resetStaffSessionExpiryForTests } from "@/staff/staff-session-expiry";
import { StaffKitchenScreen } from "@/staff/staff-kitchen-page";
import type { StaffShellContext } from "@/staff/staff-shell";

import roMessages from "../../src/messages/ro.json";
import ruMessages from "../../src/messages/ru.json";
import { flushPromises } from "../support/render-hook";
import {
  mountInCatalogue,
  type MountedScreen,
  type TestLocale,
} from "../support/render-with-intl";
import {
  STAFF_KITCHEN_ID,
  WIRE_DESIGN,
  wireKitchen,
} from "../support/staff-kitchen-wire";
import {
  installStaffKitchensServer,
  type StaffKitchensServer,
} from "../support/staff-kitchens-wire";

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

const CATALOGUES = { ro: roMessages, ru: ruMessages } as const;
const LOCALES: readonly TestLocale[] = ["ro", "ru"];
const CONTEXT: StaffShellContext = {
  role: "operator",
  email: "mihai.rusu@lemnaria.md",
  navigation: ["kitchens"],
};
const KITCHEN_ADDRESS = `/api/staff/kitchens/${STAFF_KITCHEN_ID}`;
const MINUS_SIGN = "−";
const SENT = 5_612_000;

let screen: MountedScreen | undefined;
let server: StaffKitchensServer;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-21T12:00:00.000Z"));
  resetAccountSessionForTests();
  resetStaffSessionExpiryForTests();
  vi.stubGlobal("location", { assign: () => undefined });
  server = installStaffKitchensServer();
});

afterEach(() => {
  screen?.unmount();
  screen = undefined;
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

async function mountKitchen(
  locale: TestLocale,
  kitchen: Record<string, unknown>,
): Promise<HTMLElement> {
  server.script((request) => {
    if (request.url.pathname === KITCHEN_ADDRESS) return { body: kitchen };
    if (request.url.pathname.endsWith("/seen")) {
      return { body: { changedAfterSeen: false } };
    }
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

function card(root: HTMLElement): HTMLElement | null {
  return root.querySelector('[data-testid="staff-kitchen-estimates"]');
}

function priced(sentMinor: unknown, currentMinor: unknown) {
  return {
    sentEstimate: { totalMinor: sentMinor, currency: "MDL" },
    currentEstimate: { totalMinor: currentMinor, currency: "MDL" },
  };
}

describe.each(LOCALES)("the price card of a sent kitchen in %s", (locale) => {
  const changes = CATALOGUES[locale].staffChanges;
  const kitchen = CATALOGUES[locale].staffKitchen;
  const unavailableTitle = CATALOGUES[locale].accountForm.requestFailedTitle;

  describe("hostile totals on the wire (the reader refuses the read, so the card never sees them)", () => {
    it.each([
      ["NaN, which JSON writes as null", null],
      ["a negative total", -5_612_000],
      ["a fraction of a bani", 5_612_000.5],
      ["a number written as a string", "5612000"],
      ["a total past the safe integers", Number.MAX_SAFE_INTEGER + 2],
    ])(
      "mounts no card, and says the kitchen could not be read, for a current total of %s",
      async (_name, garbled) => {
        const root = await mountKitchen(
          locale,
          wireKitchen(priced(SENT, garbled)),
        );

        expect(card(root)).toBeNull();
        expect(root.textContent).toContain(unavailableTitle);
        expect(root.textContent).not.toMatch(/NaN|Infinity|undefined/u);
      },
    );

    it("refuses a garbled sent total as readily as a current one", async () => {
      const root = await mountKitchen(locale, wireKitchen(priced(-1, SENT)));

      expect(card(root)).toBeNull();
      expect(root.textContent).toContain(unavailableTitle);
    });
  });

  describe("what a reader of the page is given", () => {
    it("keeps the card's heading its own name: the tag sits beside the heading, not inside it", async () => {
      const root = await mountKitchen(
        locale,
        wireKitchen(priced(SENT, 5_683_000)),
      );

      const heading = card(root)?.querySelector("h2");
      expect(heading?.textContent).toBe(kitchen.summaryPrice);
      const tag = [...(card(root)?.querySelectorAll("span") ?? [])].filter(
        (span) => span.textContent === changes.estimateDiffers,
      );
      expect(tag).toHaveLength(1);
      expect(heading?.contains(tag[0] ?? null)).toBe(false);
    });

    it("states the difference once, in text, beside the figure it belongs to, with the sign as the first character", async () => {
      const root = await mountKitchen(
        locale,
        wireKitchen(priced(5_683_000, SENT)),
      );

      const differences = root.querySelectorAll(
        '[data-testid="staff-kitchen-estimate-difference"]',
      );
      expect(differences).toHaveLength(1);
      const [difference] = [...differences];
      expect(
        difference?.closest('[data-testid="staff-kitchen-estimate-current"]'),
      ).not.toBeNull();
      expect(difference?.textContent).toContain(`${MINUS_SIGN}710 MDL`);
      expect(difference?.textContent).not.toMatch(/(^|[^−])-\d/u);
    });

    it("marks only the 'now' row as differing, and carries the difference by words, not by the mark", async () => {
      const root = await mountKitchen(
        locale,
        wireKitchen(priced(SENT, 5_683_000)),
      );

      const marked = [...root.querySelectorAll('[data-differs="true"]')].filter(
        (element) => card(root)?.contains(element),
      );
      expect(marked).toHaveLength(1);
      expect(marked[0]?.getAttribute("data-testid")).toBe(
        "staff-kitchen-estimate-current",
      );
      expect(card(root)?.textContent).toContain(changes.estimateDiffers);
    });

    it("labels the rows with a term and a description, so each figure is read with its name", async () => {
      const root = await mountKitchen(
        locale,
        wireKitchen(priced(SENT, 5_683_000)),
      );

      const rows = card(root)?.querySelectorAll("dl > div") ?? [];
      expect(rows).toHaveLength(2);
      for (const row of rows) {
        expect(row.querySelectorAll("dt")).toHaveLength(1);
        expect(row.querySelectorAll("dd")).toHaveLength(1);
      }
    });
  });

  describe("the note, by what is known", () => {
    it("says nothing about the client when the sent copy is unreadable and the price fell", async () => {
      const root = await mountKitchen(
        locale,
        wireKitchen({ ...priced(5_683_000, SENT), kitchen: { asSent: null } }),
      );

      const note = card(root)?.querySelector(
        '[data-testid="staff-kitchen-estimate-note"]',
      );
      expect(note?.textContent).toBe(changes.estimateNoteUnknown);
    });

    it("says nothing about the client when the current copy is unreadable", async () => {
      const root = await mountKitchen(
        locale,
        wireKitchen({ ...priced(SENT, 5_683_000), kitchen: { design: null } }),
      );

      const note = card(root)?.querySelector(
        '[data-testid="staff-kitchen-estimate-note"]',
      );
      expect(note?.textContent).toBe(changes.estimateNoteUnknown);
    });

    it("tells equal copies and a price that fell by today's prices, never that the client changed anything", async () => {
      const root = await mountKitchen(
        locale,
        wireKitchen({
          ...priced(5_683_000, SENT),
          kitchen: { asSent: WIRE_DESIGN },
        }),
      );

      const note = card(root)?.querySelector(
        '[data-testid="staff-kitchen-estimate-note"]',
      );
      expect(note?.textContent).toBe(changes.estimateNoteUnchanged);
    });

    it("keeps one-bani differences visible: totals one bani apart print alike and still differ", async () => {
      const root = await mountKitchen(
        locale,
        wireKitchen(priced(SENT, SENT + 1)),
      );

      expect(card(root)?.textContent).toContain(changes.estimateDiffers);
      expect(
        root.querySelector('[data-testid="staff-kitchen-estimate-difference"]')
          ?.textContent,
      ).toContain("+10 MDL");
    });

    it("draws a zero total as a figure only when the total is zero, and a difference from it as a difference", async () => {
      const root = await mountKitchen(locale, wireKitchen(priced(0, 1_000)));

      expect(
        root.querySelector('[data-testid="staff-kitchen-estimate-difference"]')
          ?.textContent,
      ).toContain("+10 MDL");
    });
  });
});
