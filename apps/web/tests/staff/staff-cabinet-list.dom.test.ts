// @vitest-environment happy-dom
//
// The staff kitchen page's cabinet list, drawn (ADR 0185 decision 3; W6c-2, W6c-3, W6c-4, W6c-5): each group's header is a
// real button that says whether its rows are shown and names them, "Extinde tot" / "Restrânge tot" sets every group, the
// first group opens on a phone and the first two from 900 px, and what staff opened outlives a switch of copy. The words
// are the shipped catalogues'.
import { KITCHEN_L_DESIGN, type Design } from "@lemnaria/configurator-domain";
import { createElement, useState } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { describeLineAmount } from "@/price/starting-price";
import { StaffCabinetList } from "@/staff/staff-cabinet-list";
import type { StaffSentCabinetLineWire } from "@/staff/staff-kitchens-wire-contract";

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

const CATALOGUES = { ro: roMessages, ru: ruMessages } as const;
const LOCALES: readonly TestLocale[] = ["ro", "ru"];
const DESKTOP_QUERY = "(min-width: 900px)";
const [FIRST_PLACEMENT] = KITCHEN_L_DESIGN.placements;
if (FIRST_PLACEMENT === undefined)
  throw new Error("the sample kitchen is empty");
const WITHOUT_FIRST: Design = {
  ...KITCHEN_L_DESIGN,
  placements: KITCHEN_L_DESIGN.placements.filter(
    ({ id }) => id !== FIRST_PLACEMENT.id,
  ),
};

let screen: MountedScreen | undefined;
const originalMatchMedia = window.matchMedia;

function stubWidth(isDesktop: boolean): void {
  window.matchMedia = ((query: string) => ({
    matches: query === DESKTOP_QUERY && isDesktop,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
}

beforeEach(() => {
  stubWidth(false);
});

afterEach(() => {
  screen?.unmount();
  screen = undefined;
  window.matchMedia = originalMatchMedia;
  document.body.replaceChildren();
});

/** The list under a stand-in for the page's choice of copy: the page keeps the list mounted while the copy changes. */
function Harness({
  sent,
  current,
  sentLines = [],
}: {
  readonly sent: Design;
  readonly current: Design;
  readonly sentLines?: readonly StaffSentCabinetLineWire[];
}) {
  const [version, setVersion] = useState<"sent" | "current">("current");
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
      sentLines,
    }),
  );
}

function mount(
  locale: TestLocale,
  designs: {
    sent: Design;
    current: Design;
    sentLines?: readonly StaffSentCabinetLineWire[];
  } = {
    sent: KITCHEN_L_DESIGN,
    current: KITCHEN_L_DESIGN,
  },
): HTMLElement {
  screen = mountInCatalogue(createElement(Harness, designs), locale);
  return screen.container;
}

function headers(container: HTMLElement): HTMLButtonElement[] {
  return allIn<HTMLButtonElement>(
    container,
    '[data-testid="staff-cabinet-group-toggle"]',
  );
}

function expandedStates(container: HTMLElement): string[] {
  return headers(container).map(
    (button) => button.getAttribute("aria-expanded") ?? "",
  );
}

function panelOf(button: HTMLElement): HTMLElement {
  const id = button.getAttribute("aria-controls");
  const panel = id === null ? null : document.getElementById(id);
  if (panel === null) throw new Error("aria-controls names no element");
  return panel;
}

function toggleAll(container: HTMLElement): HTMLElement {
  return requireIn(
    container,
    '[data-testid="staff-kitchen-cabinets-toggle-all"]',
  );
}

describe.each(LOCALES)("the cabinet list in %s", (locale) => {
  const changes = CATALOGUES[locale].staffChanges;

  it("draws every group's header as a button that states whether its rows are shown and names them", () => {
    const container = mount(locale);

    const buttons = headers(container);
    expect(buttons.length).toBeGreaterThan(1);
    for (const button of buttons) {
      expect(button.tagName).toBe("BUTTON");
      expect(button.type).toBe("button");
      expect(["true", "false"]).toContain(button.getAttribute("aria-expanded"));
      expect(panelOf(button).querySelectorAll("li").length).toBeGreaterThan(0);
    }
    expect(
      new Set(buttons.map((b) => b.getAttribute("aria-controls"))).size,
    ).toBe(buttons.length);
  });

  it("opens only the first group on a phone, and keeps the others in the page but hidden", () => {
    const container = mount(locale);

    expect(expandedStates(container)).toEqual(
      headers(container).map((_button, index) =>
        index === 0 ? "true" : "false",
      ),
    );
    expect(headers(container).map((button) => panelOf(button).hidden)).toEqual(
      headers(container).map((_button, index) => index !== 0),
    );
  });

  it("opens the first two groups from 900 px", () => {
    stubWidth(true);

    const container = mount(locale);

    expect(expandedStates(container)).toEqual(
      headers(container).map((_button, index) =>
        index < 2 ? "true" : "false",
      ),
    );
  });

  it("shows and hides one group's rows when its header is pressed, and no other group's", () => {
    const container = mount(locale);
    const [first, second] = headers(container);
    if (first === undefined || second === undefined)
      throw new Error("fewer than two groups");

    click(second);

    expect(second.getAttribute("aria-expanded")).toBe("true");
    expect(panelOf(second).hidden).toBe(false);
    click(first);
    expect(first.getAttribute("aria-expanded")).toBe("false");
    expect(panelOf(first).hidden).toBe(true);
    expect(second.getAttribute("aria-expanded")).toBe("true");
  });

  it("opens every group with the expand-all button and closes every group with the same button", () => {
    const container = mount(locale);

    expect(toggleAll(container).textContent).toBe(changes.cabinetsExpandAll);
    click(toggleAll(container));

    expect(new Set(expandedStates(container))).toEqual(new Set(["true"]));
    expect(toggleAll(container).textContent).toBe(changes.cabinetsCollapseAll);
    click(toggleAll(container));
    expect(new Set(expandedStates(container))).toEqual(new Set(["false"]));
    expect(toggleAll(container).textContent).toBe(changes.cabinetsExpandAll);
  });

  it("offers to collapse once every group has been opened one by one", () => {
    const container = mount(locale);

    for (const button of headers(container)) {
      if (button.getAttribute("aria-expanded") === "false") click(button);
    }

    expect(toggleAll(container).textContent).toBe(changes.cabinetsCollapseAll);
  });

  it("keeps what staff opened and closed when the copy on screen changes, and keeps every group open after expand-all", () => {
    const container = mount(locale, {
      sent: KITCHEN_L_DESIGN,
      current: WITHOUT_FIRST,
    });
    const [, second] = headers(container);
    if (second === undefined) throw new Error("fewer than two groups");
    click(second);
    const before = expandedStates(container);

    click(requireIn(container, '[data-testid="switch"]'));

    expect(expandedStates(container).slice(0, before.length)).toEqual(before);
    click(toggleAll(container));
    click(requireIn(container, '[data-testid="switch"]'));
    expect(new Set(expandedStates(container))).toEqual(new Set(["true"]));
  });

  it("marks a body added after sending in words on the current copy, with an amount, and the sent copy has none", () => {
    const container = mount(locale, {
      sent: WITHOUT_FIRST,
      current: KITCHEN_L_DESIGN,
    });

    const added = allIn(container, '[data-change="added"]');
    expect(added).toHaveLength(1);
    expect(added[0]?.textContent).toContain(changes.rowNewAfterSending);
    expect(
      allIn(container, '[data-testid="staff-kitchen-cabinet-amount"]'),
    ).toHaveLength(KITCHEN_L_DESIGN.placements.length);
    expect(container.textContent).toContain(changes.highlightNote);

    click(requireIn(container, '[data-testid="switch"]'));

    expect(
      allIn(container, '[data-testid="staff-kitchen-cabinet-amount"]'),
    ).toHaveLength(0);
    expect(allIn(container, '[data-change="added"]')).toHaveLength(0);
  });

  it("draws on the sent copy the amounts stored for its placements, and none for a placement with no stored line", () => {
    const [first, second] = KITCHEN_L_DESIGN.placements;
    if (first === undefined || second === undefined) throw new Error("no body");
    const container = mount(locale, {
      sent: KITCHEN_L_DESIGN,
      current: KITCHEN_L_DESIGN,
      sentLines: [
        { placementId: first.id, amountMinor: 123_450_000 },
        { placementId: second.id, amountMinor: 76_540_000 },
      ],
    });
    const amountTexts = () =>
      allIn(container, '[data-testid="staff-kitchen-cabinet-amount"]').map(
        (amount) => amount.textContent,
      );
    const todays = amountTexts();

    click(requireIn(container, '[data-testid="switch"]'));

    expect(amountTexts().sort()).toEqual(
      [describeLineAmount(123_450_000), describeLineAmount(76_540_000)].sort(),
    );
    expect(todays).toHaveLength(KITCHEN_L_DESIGN.placements.length);
    expect(todays).not.toContain(describeLineAmount(123_450_000));
  });

  it("lists a body the client took out with the removed mark and no amount", () => {
    const container = mount(locale, {
      sent: KITCHEN_L_DESIGN,
      current: WITHOUT_FIRST,
    });

    const removed = allIn(container, '[data-change="removed"]');

    expect(removed).toHaveLength(1);
    expect(removed[0]?.textContent).toContain(changes.rowRemoved);
    expect(
      removed[0]?.querySelector('[data-testid="staff-kitchen-cabinet-amount"]'),
    ).toBeNull();
  });

  it("says each group's body count, and draws no note when nothing differs", () => {
    const container = mount(locale);

    expect(headers(container)[0]?.textContent).toMatch(/\d/u);
    expect(container.textContent).not.toContain(changes.highlightNote);
  });
});
