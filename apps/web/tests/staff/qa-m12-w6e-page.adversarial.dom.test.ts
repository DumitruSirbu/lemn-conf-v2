// @vitest-environment happy-dom
//
// Adversarial QA of M12 wave W6e on the real kitchen page (ADR 0185 decision 6; plan W6e-1, W6e-2, W6e-3): which copy's
// facts the header states, the price that stands in no header beside a request or a sent copy, nothing of the old summary
// card lost, and the page's order in the DOM. The server is a stand-in for `fetch`; the 3D canvas is a stub.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { act, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetAccountSessionForTests } from "@/account/session/use-account-session";
import roMessages from "../../src/messages/ro.json";
import ruMessages from "../../src/messages/ru.json";
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
const FEWER_BODIES_DESIGN_COUNT = Math.ceil(WIRE_BODIES.length / 2);
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

const SETTINGS_KEYS = [
  "shape",
  "walls",
  "material",
  "hardware",
  "finish",
  "bodies",
];
const CABINETS = '[data-testid="staff-kitchen-cabinets"]';
// The coordinator's ruling: one DOM order at every width, so focus follows what is drawn on a desktop and on a phone.
const PAGE_DOM_ORDER = [
  "staff-kitchen-view",
  "staff-kitchen-cabinets",
  "staff-kitchen-profile",
  "staff-kitchen-request",
  "staff-kitchen-estimates",
  "staff-kitchen-status",
  "staff-kitchen-access-log",
  "staff-notes",
];

function settingsIn(container: HTMLElement): HTMLElement {
  return requireIn(
    requireIn(container, CABINETS),
    '[data-testid="staff-kitchen-settings"]',
  );
}

function factKeys(container: HTMLElement): string[] {
  return allIn(settingsIn(container), "[data-fact]").map(
    (fact) => fact.getAttribute("data-fact") ?? "",
  );
}

function bodiesOf(container: HTMLElement): string {
  return requireIn(settingsIn(container), '[data-fact="bodies"] dd')
    .textContent;
}

describe.each(LOCALES)("the page's header in %s", (locale) => {
  const words = locale === "ro" ? roMessages : ruMessages;
  const changed = () =>
    wireKitchen({
      changedAfterSeen: true,
      displayedRevision: "7",
      kitchen: { asSent: FEWER_BODIES_DESIGN },
    });
  const noPriceIn = (container: HTMLElement) => {
    expect(
      container.querySelector(`${CABINETS} [data-fact="price"]`),
    ).toBeNull();
    // A prefix followed by a figure: Russian "От" alone is the start of "Отправленная" and "Отделка".
    expect(requireIn(container, CABINETS).textContent).not.toMatch(
      new RegExp(`${words.price.startingPrefix}\\s*\\d`),
    );
    expect(requireIn(container, CABINETS).textContent).not.toContain(
      words.staffKitchen.summaryPriceNote,
    );
  };

  it("states no price, and no note about one, for a sent kitchen as sent and unchanged", async () => {
    const container = await mount(locale, wireKitchen());

    expect(factKeys(container)).toEqual(SETTINGS_KEYS);
    noPriceIn(container);
  });

  it("states no price for a changed kitchen, whichever copy is on screen, and the count of the copy on screen", async () => {
    const container = await mount(locale, changed());
    expect(bodiesOf(container)).toBe(String(WIRE_BODIES.length));
    noPriceIn(container);

    switchTo(container, "sent");
    await settle();

    expect(bodiesOf(container)).toBe(String(FEWER_BODIES_DESIGN_COUNT));
    expect(factKeys(container)).toEqual(SETTINGS_KEYS);
    noPriceIn(container);

    switchTo(container, "current");
    await settle();
    noPriceIn(container);
  });

  it("states the starting price and its note for a draft, which has no sent copy and no estimates", async () => {
    const container = await mount(locale, wireDraftKitchen());

    expect(factKeys(container)).toEqual([...SETTINGS_KEYS, "price"]);
    // The control of the sent states' pattern: it does match a price that is stated.
    expect(requireIn(container, CABINETS).textContent).toMatch(
      new RegExp(`${words.price.startingPrefix}\\s*\\d`),
    );
    expect(requireIn(container, CABINETS).textContent).toContain(
      words.staffKitchen.summaryPriceNote,
    );
    expect(
      allIn(container, '[data-testid="staff-kitchen-estimates"]'),
    ).toHaveLength(0);
  });

  it("states no today-priced figure for a sent kitchen whose copy as sent cannot be read but whose request is stored", async () => {
    const container = await mount(
      locale,
      wireKitchen({ kitchen: { asSent: null } }),
    );

    noPriceIn(container);
  });

  it("leaves no fact of the old summary card without a place: every fact is in the one header, and the card and its title are gone", async () => {
    const container = await mount(locale, changed());

    expect(
      allIn(container, '[data-testid="staff-kitchen-summary"]'),
    ).toHaveLength(0);
    expect(container.querySelector("#staff-kitchen-summary-title")).toBeNull();
    expect(factKeys(container)).toEqual(SETTINGS_KEYS);
    expect(allIn(container, "[data-fact]")).toHaveLength(SETTINGS_KEYS.length);
    const labels = allIn(settingsIn(container), "dt").map(
      (term) => term.textContent,
    );
    expect(labels).toEqual([
      words.staffKitchen.summaryShape,
      words.staffKitchen.summaryWalls,
      words.staffKitchen.summaryMaterial,
      words.staffKitchen.summaryHardware,
      words.staffKitchen.summaryFinish,
      words.staffKitchen.summaryBodies,
    ]);
  });

  it("titles the list, which the header sits under, with the copy on screen, and labels the section by that title", async () => {
    const container = await mount(locale, changed());
    const section = requireIn(container, CABINETS);
    const title = requireIn(section, "h2");

    expect(section.getAttribute("aria-labelledby")).toBe(title.id);
    expect(title.textContent).toBe(words.staffKitchen.summaryTitleCurrent);

    switchTo(container, "sent");
    await settle();

    expect(requireIn(container, CABINETS)).toBe(section);
    expect(requireIn(section, "h2").textContent).toBe(
      words.staffKitchen.summaryTitleSent,
    );
  });

  it("holds the page's regions in the one DOM order of every width (picture, list, cards, access line, notes), the access line a plain paragraph no key reaches", async () => {
    const container = await mount(locale, changed());

    const positions = PAGE_DOM_ORDER.map((testId) => {
      const element = requireIn(container, `[data-testid="${testId}"]`);
      return { testId, element };
    });
    for (const [index, { testId, element }] of positions.entries()) {
      const next = positions[index + 1];
      if (next === undefined) continue;
      expect(
        element.compareDocumentPosition(next.element) &
          Node.DOCUMENT_POSITION_FOLLOWING,
        `${next.testId} follows ${testId}`,
      ).toBeTruthy();
    }
    const log = requireIn(
      container,
      '[data-testid="staff-kitchen-access-log"]',
    );
    expect(log.tagName).toBe("P");
    expect(log.getAttribute("tabindex")).toBeNull();
    expect(log.textContent).toBe(words.staffKitchen.accessLogged);
    expect(log.querySelector("a, button, input, select, textarea")).toBeNull();
  });
});

const AREA_OF_TESTID: Readonly<Record<string, string>> = {
  "staff-kitchen-view": "view",
  "staff-kitchen-versions": "view",
  "staff-kitchen-link-card": "view",
  "staff-kitchen-profile": "contact",
  "staff-kitchen-request": "contact",
  "staff-kitchen-estimates": "contact",
  "staff-kitchen-status": "contact",
  "staff-kitchen-cabinets": "list",
  "staff-notes": "notes",
};
const FOCUSABLE = "a[href], button, input, select, textarea, [tabindex]";

/** The desktop grid's areas in the order a person reads them: column by column, top to bottom. */
function desktopReadingOrder(): string[] {
  const css = readFileSync(
    join(import.meta.dirname, "../../src/staff/staff-kitchen.module.css"),
    "utf8",
  );
  const desktop = css.slice(css.indexOf("@media (min-width: 900px)"));
  const areas = /grid-template-areas:([^;]*);/.exec(desktop)?.[1] ?? "";
  const rows = [...areas.matchAll(/"([^"]*)"/g)].map((row) =>
    (row[1] ?? "").trim().split(/\s+/),
  );
  const order: string[] = [];
  for (let column = 0; column < (rows[0]?.length ?? 0); column += 1) {
    for (const row of rows) {
      const area = row[column];
      if (area !== undefined && !order.includes(area)) order.push(area);
    }
  }
  return order;
}

describe.each(LOCALES)("the desktop's Tab order in %s", (locale) => {
  it("visits the page's regions in the order the desktop grid draws them (WCAG 2.4.3)", async () => {
    const container = await mount(
      locale,
      wireKitchen({
        changedAfterSeen: true,
        displayedRevision: "7",
        kitchen: { asSent: FEWER_BODIES_DESIGN },
      }),
    );

    const visited: string[] = [];
    for (const control of allIn(container, FOCUSABLE)) {
      const region = Object.keys(AREA_OF_TESTID).find(
        (testId) => control.closest(`[data-testid="${testId}"]`) !== null,
      );
      const area = region === undefined ? undefined : AREA_OF_TESTID[region];
      if (area !== undefined && visited.at(-1) !== area) visited.push(area);
    }

    expect(visited).toEqual(desktopReadingOrder());
  });
});
