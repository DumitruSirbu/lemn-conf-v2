// @vitest-environment happy-dom
//
// Adversarial QA of M10 wave U1: the cabinet list and the staff frame around it, attacked where the wave's own tests use
// examples: the search over every name and every spelling of its letters, typed text that is not text to the catalogue's
// formatter, amounts at both ends, the group state across a search, the plural of the waiting-prices count over a sweep,
// and the anti-invariants of a row (a cabinet the customer supplies carries no price; a row never shows a price it does
// not own).
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CabinetListScreen } from "@/price-dashboard/cabinet-list";
import {
  filterRows,
  normalisedForSearch,
  rowsOf as modelRowsOf,
  type CabinetListInput,
  type CabinetRuleFacts,
} from "@/price-dashboard/cabinet-list-model";
import { SAMPLE_CABINET_LIST } from "@/price-dashboard/cabinet-list-sample";
import { formatLei } from "@/price-dashboard/format-lei";

import roMessages from "../../src/messages/ro.json";
import ruMessagesImport from "../../src/messages/ru.json";
import { flushPromises } from "../support/render-hook";
import {
  allIn,
  click,
  mountInCatalogue,
  requireIn,
  typeInto,
  type MountedScreen,
  type TestLocale,
} from "../support/render-with-intl";
import {
  contextOf,
  leaveTheStaffServer,
  mountInStaffFrame,
  stubTheStaffServer,
} from "./staff-frame-harness";

const NBSP = " ";
const NO_DRAFT: CabinetListInput = {
  ...SAMPLE_CABINET_LIST,
  draft: { draftRevision: "1", changes: [] },
};
const RULES = SAMPLE_CABINET_LIST.rules;
const HOOD_NAME = roMessages.catalog.entries.hood.toLocaleLowerCase("ro");
const PENDING_CHIP = '[data-testid="staff-pending-prices"]';

let screen: MountedScreen | undefined;

beforeEach(() => {
  stubTheStaffServer();
});

afterEach(() => {
  screen?.unmount();
  screen = undefined;
  leaveTheStaffServer();
});

async function mount(
  input: CabinetListInput = SAMPLE_CABINET_LIST,
  locale: TestLocale = "ro",
): Promise<HTMLElement> {
  screen = mountInCatalogue(
    createElement(CabinetListScreen, {
      locale,
      context: contextOf("administrator", ["kitchens", "cabinets", "publish"]),
      input,
    }),
    locale,
  );
  await flushPromises(5);
  return screen.container;
}

const rowsIn = (scope: ParentNode): HTMLElement[] =>
  allIn(scope, '[data-testid="cabinet-row"]');
const searchBox = (container: HTMLElement): HTMLInputElement =>
  requireIn<HTMLInputElement>(container, 'input[type="search"]');
const groupHeaderButtons = (container: HTMLElement): HTMLButtonElement[] =>
  allIn<HTMLButtonElement>(container, "h2 button[aria-expanded]");
const visibleRowCount = (container: HTMLElement): number =>
  rowsIn(container).filter((row) => row.closest("[hidden]") === null).length;

/** The sample list drawn untouched, in a second root, to hold the other rows against. */
async function mountedSample(): Promise<HTMLElement> {
  const sample = mountInCatalogue(
    createElement(CabinetListScreen, {
      locale: "ro",
      context: contextOf("administrator", ["kitchens", "cabinets", "publish"]),
      input: SAMPLE_CABINET_LIST,
    }),
    "ro",
  );
  await flushPromises(5);
  const reference = sample.container.cloneNode(true) as HTMLElement;
  sample.unmount();
  return reference;
}

function rowOf(container: HTMLElement, ruleId: string): HTMLElement {
  const found = rowsIn(container).find((row) => row.dataset.ruleId === ruleId);
  if (found === undefined) throw new Error(`no row for ${ruleId}`);
  return found;
}

function withPrice(
  rule: CabinetRuleFacts,
  activeMinor: number,
  pendingMinor: number,
): CabinetRuleFacts {
  return {
    ...rule,
    price: { widthMm: 600, activeMinor, pendingMinor },
  };
}

function inputWithFirstRulePriced(
  activeMinor: number,
  pendingMinor: number,
  isNamedByDraft: boolean,
): CabinetListInput {
  const [first, ...rest] = RULES;
  if (first === undefined) throw new Error("the sample holds no rule");
  return {
    rules: [withPrice(first, activeMinor, pendingMinor), ...rest],
    draft: {
      draftRevision: "1",
      changes: isNamedByDraft
        ? [
            {
              address: {
                kind: "cabinet",
                ruleId: first.ruleId,
                field: "anchorMinor",
              },
              value: pendingMinor,
            },
          ]
        : [],
    },
  };
}

describe("the search, over every name and every spelling of its letters", () => {
  it.each(RULES.map((rule) => [rule.name, rule.ruleId]))(
    "finds %s by its name in capitals, with no diacritics, and with the cedilla spellings of the comma letters",
    (name, ruleId) => {
      const spellings = [
        name.toLocaleUpperCase("ro"),
        name.toLocaleLowerCase("ro"),
        name.normalize("NFD").replace(/\p{M}/gu, ""),
        /* eslint-disable no-restricted-syntax -- allow-list: codepoints, the comma-below letters and their cedilla spellings, not wording. */
        name.replaceAll("\u0219", "\u015f").replaceAll("\u021b", "\u0163"),
        name.replaceAll("\u0219", "s").replaceAll("\u021b", "t"),
        /* eslint-enable no-restricted-syntax */
        `  ${name}  `,
        name.normalize("NFD"),
      ];
      const rows = modelRowsOf(SAMPLE_CABINET_LIST);

      for (const query of spellings) {
        const found = filterRows(rows, { query, onlyModified: false }).map(
          (row) => row.facts.ruleId,
        );
        expect(found, `"${query}"`).toContain(ruleId);
      }
    },
  );

  it("folds its own output: folding twice is folding once, for every name", () => {
    for (const rule of RULES) {
      const once = normalisedForSearch(rule.name);

      expect(normalisedForSearch(once)).toBe(once);
    }
  });

  it("keeps the rows in the order they were given, whatever it keeps", () => {
    const rows = modelRowsOf(SAMPLE_CABINET_LIST);
    const kept = filterRows(rows, { query: "dulap", onlyModified: false });
    const positions = kept.map((row) => rows.indexOf(row));

    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it.each([
    ".*",
    "(",
    "[a-",
    "\\",
    "^dulap$",
    `dulap|${HOOD_NAME}`,
    "?",
    "+++",
  ])(
    "reads %s as the letters it is, and not as a pattern: it throws nothing and keeps nothing",
    (query) => {
      const rows = modelRowsOf(SAMPLE_CABINET_LIST);

      expect(() =>
        filterRows(rows, { query, onlyModified: false }),
      ).not.toThrow();
      expect(filterRows(rows, { query, onlyModified: false })).toEqual([]);
    },
  );

  it.each([" ", "   ", "\t", " ", "  \n"])(
    "treats a query of blank characters (%j) as no query: every cabinet, no empty page, groups still open and shut by hand",
    async (blank) => {
      const container = await mount();
      const before = visibleRowCount(container);

      typeInto(searchBox(container), blank);

      expect(visibleRowCount(container)).toBe(before);
      expect(
        container.querySelector('[data-testid="cabinet-list-empty"]'),
      ).toBeNull();
      expect(groupHeaderButtons(container)).toHaveLength(4);
    },
  );

  it("says what was typed, letter for letter, when nothing matches, and builds no element from it", async () => {
    const container = await mount();
    const attacks = [
      "{x}",
      "{count, plural, other {x}}",
      "'{'",
      "#",
      "<img src=x onerror=alert(1)>",
      "<b>bold</b>",
      "&amp;",
      "%s",
    ];

    for (const attack of attacks) {
      typeInto(searchBox(container), attack);
      const empty = requireIn(container, '[data-testid="cabinet-list-empty"]');

      expect(empty.textContent, attack).toContain(attack);
      expect(empty.querySelector("img, b, script"), attack).toBeNull();
    }
  });

  it("keeps a long query on one page: the empty message breaks it instead of widening the page", async () => {
    const container = await mount();

    typeInto(searchBox(container), "x".repeat(5000));

    expect(
      requireIn(container, '[data-testid="cabinet-list-empty"]'),
    ).toBeTruthy();
    expect(visibleRowCount(container)).toBe(0);
  });
});

describe("the groups across a search", () => {
  it("closes again, as they were left, when the search is cleared", async () => {
    const container = await mount();
    const states = () =>
      groupHeaderButtons(container).map((button) =>
        button.getAttribute("aria-expanded"),
      );
    const [base] = groupHeaderButtons(container);
    if (base === undefined) throw new Error("no group heading");
    click(base);
    const beforeSearch = states();

    typeInto(searchBox(container), "zzz");
    typeInto(searchBox(container), "");

    expect(beforeSearch).toEqual(["false", "true", "true", "false"]);
    expect(states()).toEqual(beforeSearch);
  });

  it("opens every group with a match and offers no toggle while narrowed, then offers it again", async () => {
    const container = await mount();

    typeInto(searchBox(container), "dulap");
    expect(groupHeaderButtons(container)).toHaveLength(0);
    expect(allIn(container, "ul[hidden]")).toHaveLength(0);

    typeInto(searchBox(container), "");
    expect(groupHeaderButtons(container)).toHaveLength(4);
  });

  it("points every heading at a list that exists, once, and hides that list exactly when the heading says closed", async () => {
    const container = await mount();
    const identifiers = groupHeaderButtons(container).map((button) =>
      button.getAttribute("aria-controls"),
    );

    expect(new Set(identifiers).size).toBe(identifiers.length);
    for (const button of groupHeaderButtons(container)) {
      const list = container.querySelector(
        `[id="${button.getAttribute("aria-controls") ?? ""}"]`,
      );

      expect(list, "the controlled list").not.toBeNull();
      expect(list?.hasAttribute("hidden")).toBe(
        button.getAttribute("aria-expanded") === "false",
      );
    }
  });

  it("returns the focus to the search box when the clear control is pressed, and empties it", async () => {
    const container = await mount();
    typeInto(searchBox(container), "zzz");

    click(requireIn(searchBox(container).parentElement ?? container, "button"));

    expect(searchBox(container).value).toBe("");
    expect(document.activeElement).toBe(searchBox(container));
  });

  it("narrows to the modified cabinets and a query together, and offers the way out when they leave none", async () => {
    const container = await mount();
    click(requireIn(container, "button[aria-pressed]"));
    expect(visibleRowCount(container)).toBe(1);

    typeInto(searchBox(container), HOOD_NAME);

    expect(
      requireIn(container, '[data-testid="cabinet-list-empty"]'),
    ).toBeTruthy();
    typeInto(searchBox(container), "");
    expect(visibleRowCount(container)).toBe(1);
    click(requireIn(container, "button[aria-pressed]"));
    expect(visibleRowCount(container)).toBeGreaterThan(1);
  });

  it("keeps 'Doar modificate' off and out of reach while the draft holds nothing, and a press does nothing", async () => {
    const container = await mount(NO_DRAFT);
    const toggle = requireIn<HTMLButtonElement>(
      container,
      "button[aria-pressed]",
    );
    const before = visibleRowCount(container);

    click(toggle);

    expect(toggle.disabled).toBe(true);
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    expect(visibleRowCount(container)).toBe(before);
  });
});

describe("a row's anti-invariants, over every cabinet of the sample", () => {
  it("draws a price for exactly the cabinets the manufacturer supplies, and no 'lei' beside the others", async () => {
    const container = await mount();

    for (const rule of RULES) {
      const row = rowOf(container, rule.ruleId);
      const hasPriceCell =
        row.querySelector('[data-testid="cabinet-price"]') !== null;

      expect(hasPriceCell, rule.name).toBe(!rule.isCustomerSupplied);
      if (rule.isCustomerSupplied) {
        expect(row.textContent, rule.name).not.toContain(
          roMessages.priceDashboard.units.currency,
        );
      }
    }
  });

  it("writes each price as the formatter writes the figure the draft leaves it, to the ban", async () => {
    const container = await mount();

    for (const rule of RULES) {
      if (rule.price === undefined) continue;
      const shown = requireIn(
        rowOf(container, rule.ruleId),
        '[data-testid="cabinet-price"]',
      ).textContent;

      expect(
        shown.startsWith(
          formatLei(
            rule.price.pendingMinor,
            roMessages.priceDashboard.units.currency,
          ),
        ),
        rule.name,
      ).toBe(true);
    }
  });

  it("shows the active price only on a modified row whose price the draft moved", async () => {
    const container = await mount();

    for (const rule of RULES) {
      const row = rowOf(container, rule.ruleId);
      const movesPrice =
        row.dataset.modified === "true" &&
        rule.price !== undefined &&
        rule.price.pendingMinor !== rule.price.activeMinor;

      expect(row.textContent.includes("activ "), rule.name).toBe(movesPrice);
    }
  });

  it("shows a price that falls with the one it fell from beside it", async () => {
    const container = await mount(
      inputWithFirstRulePriced(200_000, 150_000, true),
    );
    const first = rowsIn(container)[0];

    expect(first?.textContent).toContain(`1${NBSP}500${NBSP}lei`);
    expect(first?.textContent).toContain(`activ 2${NBSP}000`);
  });

  it("shows a draft that leaves the price alone with no active price beside it", async () => {
    const container = await mount(
      inputWithFirstRulePriced(200_000, 200_000, true),
    );

    expect(rowsIn(container)[0]?.textContent).not.toContain("activ ");
  });

  it.each([
    [0, `0${NBSP}lei`],
    [1, `0,01${NBSP}lei`],
    [123_456_789_012, `1${NBSP}234${NBSP}567${NBSP}890,12${NBSP}lei`],
  ])("writes %i bani in a row as %s", async (minor, written) => {
    const container = await mount(
      inputWithFirstRulePriced(minor, minor, false),
    );

    const [first] = rowsIn(container);
    if (first === undefined) throw new Error("the list drew no row");

    expect(
      requireIn(first, '[data-testid="cabinet-price"]').textContent,
    ).toContain(written);
  });

  it.each([
    ["a negative amount", -100],
    ["not a number", Number.NaN],
    ["infinite", Number.POSITIVE_INFINITY],
    ["a fraction of a ban", 150_000.5],
    ["past the last exact integer", Number.MAX_SAFE_INTEGER + 1],
  ])(
    "draws %s as a dash with the size it is quoted at, in that row only, and every other row as it was",
    async (_label, unreadable) => {
      const container = await mount(
        inputWithFirstRulePriced(unreadable, unreadable, false),
      );
      const [bad, ...others] = rowsIn(container);
      const good = rowsIn(await mountedSample());

      expect(rowsIn(container)).toHaveLength(RULES.length);
      expect(
        bad?.querySelector('[data-testid="cabinet-price-unreadable"]'),
      ).not.toBeNull();
      expect(bad?.querySelector('[data-testid="cabinet-price"]')).toBeNull();
      expect(bad?.textContent).toContain("600 mm");
      expect(bad?.textContent).not.toMatch(/lei|NaN|Infinity|-\d|activ /);
      expect(others.map((row) => row.textContent)).toEqual(
        good.slice(1).map((row) => row.textContent),
      );
    },
  );

  it("draws minus zero as the zero it is, not as a defect", async () => {
    const container = await mount(inputWithFirstRulePriced(-0, -0, false));

    expect(
      requireIn(
        rowsIn(container)[0] ?? container,
        '[data-testid="cabinet-price"]',
      ).textContent,
    ).toContain(`0${NBSP}lei`);
  });

  it("draws several bad rows among good ones without a failure, and keeps the page's one h1 and its groups", async () => {
    const spoiled: CabinetListInput = {
      rules: RULES.map((rule, position) =>
        position % 2 === 0 && rule.price !== undefined
          ? withPrice(rule, Number.NaN, -1)
          : rule,
      ),
      draft: SAMPLE_CABINET_LIST.draft,
    };

    const container = await mount(spoiled);

    expect(rowsIn(container)).toHaveLength(RULES.length);
    expect(container.querySelectorAll("h1")).toHaveLength(1);
    expect(groupHeaderButtons(container)).toHaveLength(4);
  });

  it("draws a modified row whose new price is unreadable as a dash, and its active price nowhere", async () => {
    const container = await mount(
      inputWithFirstRulePriced(145_000, Number.NaN, true),
    );
    const [first] = rowsIn(container);

    expect(
      first?.querySelector('[data-testid="cabinet-price-unreadable"]'),
    ).not.toBeNull();
    expect(first?.textContent).not.toContain("activ ");
  });

  it("heads an unmodified row with its active price, whatever pending price the facts carry", async () => {
    const container = await mount(
      inputWithFirstRulePriced(200_000, 150_000, false),
    );
    const [first] = rowsIn(container);

    expect(first?.textContent).toContain(`2${NBSP}000${NBSP}lei`);
    expect(first?.textContent).not.toContain(`1${NBSP}500`);
    expect(first?.textContent).not.toContain("activ ");
  });

  it("draws no price for a cabinet the customer supplies, even when its facts carry one", async () => {
    const [first, ...rest] = RULES;
    if (first === undefined) throw new Error("the sample holds no rule");
    const container = await mount({
      rules: [
        withPrice({ ...first, isCustomerSupplied: true }, 145_000, 150_000),
        ...rest,
      ],
      draft: NO_DRAFT.draft,
    });
    const [row] = rowsIn(container);

    expect(row?.querySelector('[data-testid="cabinet-price"]')).toBeNull();
    expect(row?.textContent).not.toContain("lei");
  });

  it("draws the frame and the title, and no row, for a book with no cabinet at all", async () => {
    const container = await mount({
      rules: [],
      draft: { draftRevision: "1", changes: [] },
    });

    expect(rowsIn(container)).toHaveLength(0);
    expect(container.querySelectorAll("h1")).toHaveLength(1);
  });
});

describe("the number of prices awaiting publication, over a sweep", () => {
  const SWEEP = [
    ...Array.from({ length: 26 }, (_, count) => count),
    99,
    100,
    101,
    102,
    111,
    112,
    119,
    120,
    121,
    1_000,
    1_001,
    1_002,
    1_020,
    12_345,
  ].filter((count) => count > 0);

  it.each(["ro", "ru"] as const)(
    "says its count in the plural arm the language gives it, in %s, with no digit grouping",
    async (locale) => {
      const rules = new Intl.PluralRules(locale);

      for (const count of SWEEP) {
        screen = await mountedFrame(locale, count);
        const text = requireIn(screen.container, PENDING_CHIP).textContent;
        const arms = pluralArmsOf(locale);

        expect(text, `${locale} ${String(count)}`).toContain(
          `${String(count)} ${arms[rules.select(count)] ?? "?"}`,
        );
        screen.unmount();
        screen = undefined;
      }
    },
    60_000,
  );

  it.each([
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    -1,
    0,
    1.5,
    0.1,
    Number.MAX_SAFE_INTEGER + 1,
  ])(
    "draws no chip and no badge for the count %s, which is not a count of prices",
    async (count) => {
      screen = await mountedFrame("ro", count);

      expect(screen.container.querySelector(PENDING_CHIP)).toBeNull();
      expect(
        screen.container.querySelector(
          'a[href$="/catalog/publish"] [aria-hidden]',
        ),
      ).toBeNull();
      expect(screen.container.textContent).not.toMatch(/NaN|Infinity/);
    },
  );

  it("puts the chip last among the bar's children, with the language links before it", async () => {
    screen = await mountedFrame("ro", 3);
    const chip = requireIn(screen.container, PENDING_CHIP);
    const bar = chip.parentElement;

    expect(bar?.lastElementChild).toBe(chip);
    expect(bar?.querySelector("nav")).not.toBeNull();
  });

  it("draws the chip in neither language, and in no menu, for a count below one", async () => {
    for (const count of [0, -1]) {
      screen = await mountedFrame("ro", count);

      expect(
        screen.container.querySelector(PENDING_CHIP),
        String(count),
      ).toBeNull();
      screen.unmount();
      screen = undefined;
    }
  });

  async function mountedFrame(
    locale: TestLocale,
    count: number,
  ): Promise<MountedScreen> {
    return mountInStaffFrame({
      locale,
      page: "cabinets",
      context: contextOf(
        "administrator",
        ["kitchens", "cabinets", "publish"],
        count,
      ),
      children: createElement("p", null, "content"),
    });
  }
});

/** The words after the number in each arm of the catalogue's message, read from the message and not retyped. */
function pluralArmsOf(locale: TestLocale): Record<string, string> {
  const messages = locale === "ro" ? roMessages : ruMessagesTyped();
  const message = messages.priceDashboard.nav.pendingChip;
  const arms: Record<string, string> = {};
  for (const match of message.matchAll(
    /(zero|one|two|few|many|other) \{\{count, number, ::group-off\} ([^}]+)\}/g,
  )) {
    const [, category, words] = match;
    if (category !== undefined && words !== undefined) arms[category] = words;
  }
  return arms;
}

function ruMessagesTyped(): typeof roMessages {
  return ruMessagesImport as typeof roMessages;
}

describe("the empty states of the list", () => {
  const COPY = roMessages.priceDashboard.cabinets;
  const toggle = (container: HTMLElement) =>
    requireIn<HTMLButtonElement>(container, "button[aria-pressed]");
  const emptyOf = (container: HTMLElement) =>
    requireIn(container, '[data-testid="cabinet-list-empty"]');

  it("names the filter when 'Doar modificate' is on and the query matches only cabinets the draft leaves alone", async () => {
    const container = await mount();
    click(toggle(container));

    typeInto(searchBox(container), "sertare");

    expect(emptyOf(container).textContent).toContain(
      COPY.emptyChangedTitle.replace("{query}", "sertare"),
    );
    expect(emptyOf(container).textContent).not.toContain(
      COPY.emptySearchTitle.replace("{query}", "sertare"),
    );
  });

  it("clears the query and the filter together, restores every cabinet and the focus, and unpresses the toggle", async () => {
    const container = await mount();
    const before = visibleRowCount(container);
    click(toggle(container));
    typeInto(searchBox(container), "sertare");

    click(requireIn(emptyOf(container), "button"));

    expect(searchBox(container).value).toBe("");
    expect(toggle(container).getAttribute("aria-pressed")).toBe("false");
    expect(visibleRowCount(container)).toBe(before);
    expect(document.activeElement).toBe(searchBox(container));
  });

  it("says the plain search wording again once the filter is off", async () => {
    const container = await mount();
    typeInto(searchBox(container), "sertare zzz");

    expect(emptyOf(container).textContent).toContain(
      COPY.emptySearchTitle.replace("{query}", "sertare zzz"),
    );
  });

  it.each(["", " ", "\u00a0\t"])(
    "says there is no cabinet to show, with no button to press, for a book with none and the query %j",
    async (query) => {
      const container = await mount({
        rules: [],
        draft: { draftRevision: "1", changes: [] },
      });
      typeInto(searchBox(container), query);

      expect(emptyOf(container).textContent).toContain(COPY.emptyListTitle);
      expect(emptyOf(container).querySelector("button")).toBeNull();
      expect(toggle(container).disabled).toBe(true);
    },
  );

  it("offers the way out when a book with no cabinet is searched", async () => {
    const container = await mount({
      rules: [],
      draft: { draftRevision: "1", changes: [] },
    });
    typeInto(searchBox(container), "x");

    expect(emptyOf(container).querySelector("button")).not.toBeNull();
  });
});

describe("only the amounts a row draws are checked", () => {
  it("heads an unmodified row with its good active price when the pending one is garbage", async () => {
    const container = await mount(
      inputWithFirstRulePriced(200_000, Number.NaN, false),
    );
    const [first] = rowsIn(container);

    expect(first?.textContent).toContain(`2${NBSP}000${NBSP}lei`);
    expect(
      first?.querySelector('[data-testid="cabinet-price-unreadable"]'),
    ).toBeNull();
  });

  it.each([
    ["an unmodified row with a bad active price", Number.NaN, 150_000, false],
    ["a modified row with a bad active price", -5, 150_000, true],
    ["a modified row with a bad pending price", 145_000, 0.5, true],
    ["a modified row with both bad", Number.NaN, Number.NaN, true],
  ])("draws %s as a dash", async (_label, active, pending, isModified) => {
    const container = await mount(
      inputWithFirstRulePriced(active, pending, isModified),
    );
    const [first] = rowsIn(container);

    expect(
      first?.querySelector('[data-testid="cabinet-price-unreadable"]'),
    ).not.toBeNull();
    expect(first?.textContent).not.toMatch(/lei|NaN/);
  });
});

describe("what a screen reader says for the waiting-prices links", () => {
  /** The accessible name by the usual computation: the label if there is one, else the text not hidden from it. */
  function accessibleNameOf(element: Element): string {
    const label = element.getAttribute("aria-label");
    if (label !== null) return label;
    return [...element.childNodes]
      .map((node) =>
        node instanceof Element
          ? node.getAttribute("aria-hidden") === "true"
            ? ""
            : accessibleNameOf(node)
          : (node.textContent ?? ""),
      )
      .join("")
      .replace(/\s+/g, " ")
      .trim();
  }
  const ARROWS = /[\u2190-\u21ff\u2794\u27a1]|arrow|стрелк/i;

  it.each(["ro", "ru"] as const)(
    "names the bar's link by the number and the words, with no arrow in it, in %s",
    async (locale) => {
      screen = await mountInStaffFrame({
        locale,
        page: "cabinets",
        context: contextOf(
          "administrator",
          ["kitchens", "cabinets", "publish"],
          7,
        ),
        children: createElement("p", null, "content"),
      });
      const chip = requireIn(screen.container, PENDING_CHIP);

      expect(accessibleNameOf(chip)).toMatch(/^7 /);
      expect(accessibleNameOf(chip)).not.toMatch(ARROWS);
    },
  );

  it.each(["ro", "ru"] as const)(
    "names the menu link by the page, then the number and the words, and holds the drawn label and number, in %s",
    async (locale) => {
      screen = await mountInStaffFrame({
        locale,
        page: "cabinets",
        context: contextOf(
          "administrator",
          ["kitchens", "cabinets", "publish"],
          7,
        ),
        children: createElement("p", null, "content"),
      });
      const link = requireIn(
        screen.container,
        '[data-testid="staff-nav"] a[href$="/catalog/publish"]',
      );
      const drawnLabel = requireIn(link, "span").textContent.trim();

      expect(accessibleNameOf(link).startsWith(drawnLabel)).toBe(true);
      expect(accessibleNameOf(link)).toMatch(/\b7\b/);
      expect(accessibleNameOf(link)).not.toMatch(ARROWS);
    },
  );

  it("gives the other menu links their drawn label and nothing more", async () => {
    screen = await mountInStaffFrame({
      page: "cabinets",
      context: contextOf(
        "administrator",
        ["kitchens", "cabinets", "publish"],
        7,
      ),
      children: createElement("p", null, "content"),
    });
    const link = requireIn(
      screen.container,
      '[data-testid="staff-nav"] a[href$="/catalog/cabinets"]',
    );

    expect(link.hasAttribute("aria-label")).toBe(false);
    expect(accessibleNameOf(link)).toBe(roMessages.priceDashboard.nav.cabinets);
  });
});
