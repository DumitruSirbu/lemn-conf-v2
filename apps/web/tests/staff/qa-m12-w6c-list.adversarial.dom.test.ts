// @vitest-environment happy-dom
//
// Adversarial QA of M12 wave W6c, the cabinet list drawn (ADR 0185 decision 3; plan W6c-2, W6c-3, W6c-4, W6c-5): a window
// that is resized while the list is open, a switch of copy that adds or removes a group, a group only the sent copy fills,
// an empty kitchen, no price book, a book that must not be read, and the Russian counts.
import {
  buildKitchenLBodyCatalog,
  cabinetDepthMmOf,
  KITCHEN_L_DESIGN,
  projectDesignForDisplay,
  type Design,
} from "@lemnaria/configurator-domain";
import { act, createElement, useState } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { StaffCabinetList } from "@/staff/staff-cabinet-list";
import type { KitchenVersion } from "@/staff/kitchen-version-rows";
import { NO_PRICE_BOOK, type PriceBookRoot } from "@/price/price-book-root";

import roMessages from "../../src/messages/ro.json";
import ruMessages from "../../src/messages/ru.json";
import {
  allIn,
  click,
  mountInCatalogue,
  requireIn,
  type MountedScreen,
  type TestLocale,
} from "../support/render-with-intl";

const DESKTOP_QUERY = "(min-width: 900px)";
const MESSAGES = { ro: roMessages, ru: ruMessages } as const;

let screen: MountedScreen | undefined;
let isDesktop = false;
const listeners = new Set<() => void>();
const originalMatchMedia = window.matchMedia;

function stubWindow(): void {
  window.matchMedia = ((query: string) => ({
    get matches() {
      return query === DESKTOP_QUERY && isDesktop;
    },
    addEventListener: (_type: string, listener: () => void) =>
      listeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) =>
      listeners.delete(listener),
  })) as unknown as typeof window.matchMedia;
}

/** A window resize that crosses the 900 px line, announced the way the browser announces it. */
function resizeTo(desktop: boolean): void {
  isDesktop = desktop;
  act(() => {
    for (const listener of [...listeners]) listener();
  });
}

beforeEach(() => {
  isDesktop = false;
  listeners.clear();
  stubWindow();
});

afterEach(() => {
  screen?.unmount();
  screen = undefined;
  window.matchMedia = originalMatchMedia;
  document.body.replaceChildren();
});

function Harness({
  sent,
  current,
  firstVersion,
}: {
  readonly sent: Design;
  readonly current: Design;
  readonly firstVersion: KitchenVersion;
}) {
  const [version, setVersion] = useState<KitchenVersion>(firstVersion);
  return createElement(
    "div",
    null,
    createElement("button", {
      "data-testid": "switch",
      onClick: () => {
        setVersion(version === "current" ? "sent" : "current");
      },
    }),
    createElement(StaffCabinetList, {
      design: version === "current" ? current : sent,
      shownVersion: version,
      other: version === "current" ? sent : current,
    }),
  );
}

function mount(input: {
  readonly sent?: Design;
  readonly current?: Design;
  readonly locale?: TestLocale;
  readonly firstVersion?: KitchenVersion;
  readonly priceBook?: PriceBookRoot;
}): HTMLElement {
  screen = mountInCatalogue(
    createElement(Harness, {
      sent: input.sent ?? KITCHEN_L_DESIGN,
      current: input.current ?? KITCHEN_L_DESIGN,
      firstVersion: input.firstVersion ?? "current",
    }),
    input.locale ?? "ro",
    input.priceBook,
  );
  return screen.container;
}

function headers(container: HTMLElement): HTMLButtonElement[] {
  return allIn<HTMLButtonElement>(
    container,
    '[data-testid="staff-cabinet-group-toggle"]',
  );
}

function panelOf(button: HTMLElement): HTMLElement {
  const id = button.getAttribute("aria-controls") ?? "";
  const panel = document.getElementById(id);
  if (panel === null) throw new Error("aria-controls names no element");
  return panel;
}

/** What a header says about itself, keyed by the heading words: the open state of a group is told by its name. */
function openStateByName(container: HTMLElement): Record<string, string> {
  return Object.fromEntries(
    headers(container).map((button) => [
      requireIn(button, "span").textContent,
      button.getAttribute("aria-expanded") ?? "",
    ]),
  );
}

function switchCopy(container: HTMLElement): void {
  click(requireIn(container, '[data-testid="switch"]'));
}

const A_HANGING = (design: Design) =>
  design.placements.filter((p) => p.wall === "A" && p.y0Mm >= 1000);

describe("the open state across a switch of copy that changes the groups in front of an untouched one", () => {
  it("keeps a group that nobody pressed open or closed as it was when the other copy has one group fewer before it (desktop)", () => {
    isDesktop = true;
    const aHanging = new Set(A_HANGING(KITCHEN_L_DESIGN).map((p) => p.id));
    expect(aHanging.size).toBeGreaterThan(0);
    const sentWithoutAWall: Design = {
      ...KITCHEN_L_DESIGN,
      placements: KITCHEN_L_DESIGN.placements.filter(
        (p) => !aHanging.has(p.id),
      ),
    };
    const container = mount({
      sent: sentWithoutAWall,
      current: KITCHEN_L_DESIGN,
      firstVersion: "sent",
    });
    const asSent = openStateByName(container);

    switchCopy(container);
    const asCurrent = openStateByName(container);

    for (const [name, state] of Object.entries(asSent)) {
      expect(asCurrent[name], `the group "${name}" after the switch`).toBe(
        state,
      );
    }
  });

  it("keeps a group staff pressed open across the same switch, wherever it moves to in the list", () => {
    isDesktop = true;
    const aHanging = new Set(A_HANGING(KITCHEN_L_DESIGN).map((p) => p.id));
    const sentWithoutAWall: Design = {
      ...KITCHEN_L_DESIGN,
      placements: KITCHEN_L_DESIGN.placements.filter(
        (p) => !aHanging.has(p.id),
      ),
    };
    const container = mount({
      sent: sentWithoutAWall,
      current: KITCHEN_L_DESIGN,
      firstVersion: "sent",
    });
    const last = headers(container).at(-1);
    if (last === undefined) throw new Error("no group");
    click(last);
    const name = requireIn(last, "span").textContent;

    switchCopy(container);

    expect(openStateByName(container)[name]).toBe("true");
  });
});

describe("the defaults across a resize of the window", () => {
  it("opens the second group when a phone becomes a desktop, and closes it again, while no group was pressed", () => {
    const container = mount({});
    expect(
      headers(container).map((b) => b.getAttribute("aria-expanded")),
    ).toEqual(headers(container).map((_b, i) => (i === 0 ? "true" : "false")));

    resizeTo(true);
    expect(
      headers(container).map((b) => b.getAttribute("aria-expanded")),
    ).toEqual(headers(container).map((_b, i) => (i < 2 ? "true" : "false")));

    resizeTo(false);
    expect(
      headers(container).map((b) => b.getAttribute("aria-expanded")),
    ).toEqual(headers(container).map((_b, i) => (i === 0 ? "true" : "false")));
  });

  it("keeps a group staff pressed, open or closed, whatever the width becomes", () => {
    const container = mount({});
    const [first, , third] = headers(container);
    if (first === undefined || third === undefined) throw new Error("groups");
    click(first);
    click(third);

    resizeTo(true);

    expect(first.getAttribute("aria-expanded")).toBe("false");
    expect(third.getAttribute("aria-expanded")).toBe("true");
    resizeTo(false);
    expect(first.getAttribute("aria-expanded")).toBe("false");
    expect(third.getAttribute("aria-expanded")).toBe("true");
  });

  it("keeps expand-all through a resize in both directions", () => {
    const container = mount({});
    click(
      requireIn(container, '[data-testid="staff-kitchen-cabinets-toggle-all"]'),
    );

    resizeTo(true);
    resizeTo(false);

    expect(
      new Set(headers(container).map((b) => b.getAttribute("aria-expanded"))),
    ).toEqual(new Set(["true"]));
  });
});

describe("a group only the sent copy fills", () => {
  const bBase = (design: Design) => {
    const group = projectDesignForDisplay(
      design,
      buildKitchenLBodyCatalog(cabinetDepthMmOf(design)),
    ).find((g) => g.wall === "B" && g.band === "base");
    const ids = new Set(group?.entries.map((e) => e.placementId));
    return design.placements.filter((p) => ids.has(p.id));
  };

  it("is listed at the projection's place, its rows all marked removed, and counted by the rows it lists", () => {
    const removed = new Set(bBase(KITCHEN_L_DESIGN).map((p) => p.id));
    expect(removed.size).toBeGreaterThan(0);
    const current: Design = {
      ...KITCHEN_L_DESIGN,
      placements: KITCHEN_L_DESIGN.placements.filter((p) => !removed.has(p.id)),
    };
    const container = mount({
      sent: KITCHEN_L_DESIGN,
      current,
      firstVersion: "current",
    });

    const headings = headers(container).map(
      (b) => requireIn(b, "span").textContent,
    );
    const sentContainer = (() => {
      switchCopy(container);
      return headers(container).map((b) => requireIn(b, "span").textContent);
    })();

    expect(headings).toEqual(sentContainer);
    switchCopy(container);
    const onlyRemoved = headers(container).filter((button) =>
      allIn(panelOf(button), "li").every(
        (li) => li.getAttribute("data-change") === "removed",
      ),
    );
    expect(onlyRemoved).toHaveLength(1);
    const [group] = onlyRemoved;
    if (group === undefined) throw new Error("no removed-only group");
    expect(allIn(panelOf(group), "li")).toHaveLength(removed.size);
    expect(group.textContent).toContain(String(removed.size));
  });
});

describe("a kitchen with no cabinet at all", () => {
  const EMPTY: Design = { ...KITCHEN_L_DESIGN, placements: [] };

  it("draws without throwing, and draws no group", () => {
    const container = mount({ sent: EMPTY, current: EMPTY });

    expect(headers(container)).toHaveLength(0);
    expect(container.textContent).not.toContain("NaN");
  });

  it("does not offer an expand-all or collapse-all button for a list with nothing to expand", () => {
    const container = mount({ sent: EMPTY, current: EMPTY });

    expect(
      allIn(container, '[data-testid="staff-kitchen-cabinets-toggle-all"]'),
    ).toHaveLength(0);
  });
});

describe.each(["ro", "ru"] as const)(
  "the amounts and the book, in %s",
  (locale) => {
    it("draws no amount, and no zero, on any row when there is no price book", () => {
      const container = mount({ locale, priceBook: NO_PRICE_BOOK });

      expect(
        allIn(container, '[data-testid="staff-kitchen-cabinet-amount"]'),
      ).toHaveLength(0);
      expect(
        allIn(container, '[data-testid="staff-kitchen-cabinet"]').length,
      ).toBe(KITCHEN_L_DESIGN.placements.length);
      expect(container.textContent).not.toMatch(/(^|\s)0(\s|$)/u);
    });

    it("never reads the book for the sent copy on screen, and draws no amount on it", () => {
      const unreadable = {
        kind: "active",
        versionId: "unread",
        get book(): never {
          throw new Error("the sent copy was priced");
        },
        availability: { revision: "0", disabled: [] },
      } as unknown as PriceBookRoot;

      const container = mount({
        locale,
        firstVersion: "sent",
        priceBook: unreadable,
      });

      expect(
        allIn(container, '[data-testid="staff-kitchen-cabinet-amount"]'),
      ).toHaveLength(0);
      expect(allIn(container, "li").length).toBe(
        KITCHEN_L_DESIGN.placements.length,
      );
    });

    it("draws every current amount as digits with a thousands group of the locale and no fraction, at ten lei", () => {
      const container = mount({ locale });

      const amounts = allIn(
        container,
        '[data-testid="staff-kitchen-cabinet-amount"]',
      ).map((node) => node.textContent);

      expect(amounts).toHaveLength(KITCHEN_L_DESIGN.placements.length);
      for (const text of amounts) {
        expect(text).not.toMatch(/[.,]\d{1,2}(\D|$)/u);
        const digits = text.replace(/\D/gu, "");
        if (digits !== "") expect(Number(digits) % 10).toBe(0);
      }
    });
  },
);

describe.each(["ro", "ru"] as const)(
  "the hidden panels and the headers, in %s",
  (locale) => {
    it("closes a panel with the hidden attribute, so no assistive technology reads its rows, and names each header by its group", () => {
      const container = mount({ locale });

      for (const button of headers(container)) {
        const panel = panelOf(button);
        const isOpen = button.getAttribute("aria-expanded") === "true";
        expect(panel.hasAttribute("hidden")).toBe(!isOpen);
        expect(button.closest("h3")).not.toBeNull();
        expect(requireIn(button, "span").textContent.length).toBeGreaterThan(3);
        expect(panel.getAttribute("aria-hidden")).toBeNull();
        expect(panel.tagName).toBe("UL");
      }
    });

    it("draws the group's count in the header from the rows the panel lists", () => {
      const container = mount({ locale });

      for (const button of headers(container)) {
        const counted = Number(
          button.textContent
            .replace(requireIn(button, "span").textContent, "")
            .replace(/\D/gu, ""),
        );
        expect(counted).toBe(allIn(panelOf(button), "li").length);
      }
    });
  },
);

describe("the count of a group in Russian and Romanian, as the sample kitchen's group sizes show them", () => {
  it("says 5 корпусов, 12 корпусов, 1 корпус and 3 корпуса, and in Romanian 1 corp and N corpuri", () => {
    const ru = mount({ locale: "ru" });
    const ruCounts = headers(ru).map((b) => b.textContent);
    screen?.unmount();
    screen = undefined;
    const ro = mount({ locale: "ro" });
    const roCounts = headers(ro).map((b) => b.textContent);

    expect(ruCounts.some((t) => t.endsWith("5 корпусов"))).toBe(true);
    expect(ruCounts.some((t) => t.endsWith("12 корпусов"))).toBe(true);
    expect(ruCounts.some((t) => t.endsWith("1 корпус"))).toBe(true);
    expect(ruCounts.some((t) => t.endsWith("3 корпуса"))).toBe(true);
    expect(roCounts.some((t) => t.endsWith("1 corp"))).toBe(true);
    expect(roCounts.some((t) => t.endsWith("5 corpuri"))).toBe(true);
    expect(roCounts.some((t) => t.endsWith("12 corpuri"))).toBe(true);
    expect(MESSAGES.ru.staffChanges.cabinetGroupCount).toContain("many");
  });
});
