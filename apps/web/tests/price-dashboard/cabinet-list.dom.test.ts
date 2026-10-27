// @vitest-environment happy-dom
//
// The cabinet list (frames D2A, D2B, D2M, D2R): four groups of cabinet types with the price at the default size, the new price
// beside the active one while a change awaits publication, the search, "Doar modificate", and the empty search. It is drawn
// inside the staff frame, from the facts the server supplies and the draft beside them.
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CabinetListScreen } from "@/price-dashboard/cabinet-list";
import type {
  CabinetListInput,
  CabinetRuleFacts,
} from "@/price-dashboard/cabinet-list-model";
import { SAMPLE_CABINET_LIST } from "@/price-dashboard/cabinet-list-sample";

import roMessages from "../../src/messages/ro.json";
import ruMessages from "../../src/messages/ru.json";
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
import { roCopy } from "./romanian-copy";
import {
  contextOf,
  leaveTheStaffServer,
  stubTheStaffServer,
} from "./staff-frame-harness";

const NBSP = " ";
const COPY = roMessages.priceDashboard;
const NO_DRAFT: CabinetListInput = {
  ...SAMPLE_CABINET_LIST,
  draft: { draftRevision: "1", changes: [] },
};

const BASE_CABINET = "cabinet.base-cabinet";
const THREE_DRAWER = "cabinet.base-3drawer";
const PAN_BANK = "cabinet.base-panbank";
const CARGO = "cabinet.base-bottle-cargo";
const WALL_CABINET = "cabinet.wall-cabinet";
const OPEN_SHELF = "cabinet.open-shelf";
const HOOD = "cabinet.hood";
const CORNER_900 = "cabinet.base-corner-x-900";

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

const group = (container: HTMLElement, code: string): HTMLElement =>
  requireIn(container, `[data-testid="cabinet-group-${code}"]`);

const rowsOf = (scope: ParentNode): HTMLElement[] =>
  allIn(scope, '[data-testid="cabinet-row"]');

/** The row of one cabinet, by the id of its rule in the book. */
function rowOf(container: HTMLElement, ruleId: string): HTMLElement {
  const found = rowsOf(container).find((row) => row.dataset.ruleId === ruleId);
  if (found === undefined) throw new Error(`no row for ${ruleId}`);
  return found;
}

const searchBox = (container: HTMLElement): HTMLInputElement =>
  requireIn<HTMLInputElement>(container, 'input[type="search"]');

const filterToggle = (container: HTMLElement): HTMLButtonElement =>
  requireIn<HTMLButtonElement>(container, "button[aria-pressed]");

const priceOf = (row: HTMLElement): string =>
  requireIn(row, '[data-testid="cabinet-price"]').textContent;

describe("the list inside the staff frame", () => {
  it("is the page's one h1 inside the frame's one main, with the cabinets menu item current", async () => {
    const container = await mount();

    expect(
      allIn(container, "h1").map((heading) => heading.textContent),
    ).toEqual([COPY.cabinets.title]);
    expect(requireIn(container, "h1").closest("main")).toBe(
      requireIn(container, "main"),
    );
    expect(
      allIn(container, '[data-testid="staff-nav"] a[aria-current="page"]').map(
        (link) => link.textContent,
      ),
    ).toEqual([COPY.nav.cabinets]);
  });

  it("tells the frame how many changes the draft holds, so the menu and the bar show the number", async () => {
    const container = await mount();

    expect(
      requireIn(container, '[data-testid="staff-pending-prices"]').textContent,
    ).toContain(
      roCopy("priceDashboard.nav.pendingChip", {
        count: SAMPLE_CABINET_LIST.draft.changes.length,
      }),
    );
  });

  it("explains the basis of every price and the way to change one", async () => {
    const container = await mount();

    expect(container.textContent).toContain(COPY.cabinets.subtitle);
    expect(container.textContent).toContain(COPY.cabinets.basisNote);
  });
});

describe("the groups (frames D2A, D2M)", () => {
  it("come in the list's order, each with its count of cabinets", async () => {
    const container = await mount();

    expect(
      allIn(container, "h2").map((heading) => heading.textContent),
    ).toEqual([
      expect.stringContaining(COPY.cabinets.groupBase),
      expect.stringContaining(COPY.cabinets.groupWall),
      expect.stringContaining(COPY.cabinets.groupTall),
      expect.stringContaining(COPY.cabinets.groupCorner),
    ]);
    expect(group(container, "base").querySelector("h2")?.textContent).toContain(
      "8 dulapuri",
    );
    expect(group(container, "tall").querySelector("h2")?.textContent).toContain(
      "4 dulapuri",
    );
  });

  it("start open, except the structural corner pieces", async () => {
    const container = await mount();

    expect(rowsOf(group(container, "base"))).toHaveLength(8);
    expect(
      group(container, "corner").querySelector("ul")?.hasAttribute("hidden"),
    ).toBe(true);
    expect(
      group(container, "corner")
        .querySelector("button")
        ?.getAttribute("aria-expanded"),
    ).toBe("false");
  });

  it("open and close from their headings, which say what they control", async () => {
    const container = await mount();
    const corner = group(container, "corner");
    const header = requireIn<HTMLButtonElement>(corner, "button");

    click(header);

    expect(header.getAttribute("aria-expanded")).toBe("true");
    expect(corner.querySelector("ul")?.hasAttribute("hidden")).toBe(false);
    expect(header.getAttribute("aria-controls")).toBe(
      corner.querySelector("ul")?.id,
    );

    click(header);

    expect(corner.querySelector("ul")?.hasAttribute("hidden")).toBe(true);
  });

  it("name the cabinets that await publication, one per cabinet", async () => {
    const container = await mount();

    expect(group(container, "base").querySelector("h2")?.textContent).toContain(
      "1 de publicat",
    );
    expect(
      group(container, "wall").querySelector("h2")?.textContent,
    ).not.toContain("de publicat");
  });
});

describe("a row (frames D2A, D2B)", () => {
  it("shows the price at the default size and the size it is quoted at", async () => {
    const container = await mount(NO_DRAFT);

    expect(priceOf(rowOf(container, THREE_DRAWER))).toBe(
      `2${NBSP}100${NBSP}lei600 mm · PAL`,
    );
  });

  it("shows a wall cabinet's price at its height as well", async () => {
    const container = await mount(NO_DRAFT);

    expect(priceOf(rowOf(container, OPEN_SHELF))).toContain(
      "600 mm × 700 · PAL",
    );
  });

  it("shows the new price with the active one beside it, and marks the row modified (frame D2B)", async () => {
    const container = await mount();
    const row = rowOf(container, BASE_CABINET);

    expect(priceOf(row)).toBe(
      `1${NBSP}500${NBSP}lei600 mm · PAL · activ 1${NBSP}450`,
    );
    expect(row.getAttribute("data-modified")).toBe("true");
    expect(row.textContent).toContain(COPY.chips.modified);
  });

  it("shows no active price and no mark on a cabinet the draft leaves alone", async () => {
    const container = await mount();
    const row = rowOf(container, THREE_DRAWER);

    expect(row.getAttribute("data-modified")).toBe("false");
    expect(row.textContent).not.toContain("activ ");
    expect(row.textContent).not.toContain(COPY.chips.modified);
  });

  it("gives a cabinet the customer supplies no price, and says it does not move the price", async () => {
    const container = await mount();
    const row = rowOf(container, HOOD);

    expect(row.textContent).toContain(COPY.chips.customerSupplied);
    expect(row.textContent).not.toContain(COPY.cabinets.customerSuppliedShort);
    expect(row.textContent).toContain(COPY.cabinets.noEffectOnPrice);
    expect(requireIn(row, "[class*=noPrice]").getAttribute("aria-hidden")).toBe(
      "true",
    );
    expect(row.querySelector('[data-testid="cabinet-price"]')).toBeNull();
  });

  it("marks a structural piece as one with a chip, and says what it does without saying 'structural' twice", async () => {
    const container = await mount();
    const row = rowOf(container, CORNER_900);

    expect(row.textContent).toContain(COPY.chips.structural);
    expect(row.textContent).toContain(COPY.cabinets.structuralNote);
    expect(row.textContent).not.toContain(COPY.cabinets.structuralShort);
    expect(row.textContent.split(COPY.chips.structural)).toHaveLength(2);
  });

  it("says 'Furnizat de client' once on a customer-supplied row", async () => {
    const container = await mount();

    expect(
      rowOf(container, HOOD).textContent.split(COPY.chips.customerSupplied),
    ).toHaveLength(2);
  });

  it("says how wide a cabinet can be, and what its default is", async () => {
    const container = await mount();

    expect(rowOf(container, THREE_DRAWER).textContent).toContain("300–800 mm");
    expect(rowOf(container, THREE_DRAWER).textContent).toContain(
      "implicit 600",
    );
    expect(rowOf(container, CARGO).textContent).toContain("fix 200 / 300 mm");
  });

  it("says a wall cabinet's default follows the base cabinet's, and marks a proposed one", async () => {
    const container = await mount();

    expect(rowOf(container, WALL_CABINET).textContent).toContain(
      COPY.cabinets.widthFollowsBase,
    );
    expect(rowOf(container, PAN_BANK).textContent).toContain(
      COPY.cabinets.proposed,
    );
    expect(rowOf(container, THREE_DRAWER).textContent).not.toContain(
      COPY.cabinets.proposed,
    );
  });

  it("draws the cabinet's picture as a decorative background, so a missing file paints an empty tile", async () => {
    const container = await mount();
    const picture = requireIn(
      rowOf(container, THREE_DRAWER),
      "[class*=picture]",
    );

    expect(picture.getAttribute("aria-hidden")).toBe("true");
    expect(picture.getAttribute("style")).toContain(
      "/cabinets/base-3-drawer.svg",
    );
    expect(container.querySelector("img")).toBeNull();
  });

  it("draws every cabinet exactly once", async () => {
    const container = await mount();

    expect(rowsOf(container)).toHaveLength(SAMPLE_CABINET_LIST.rules.length);
    expect(
      new Set(rowsOf(container).map((row) => row.dataset.ruleId)).size,
    ).toBe(SAMPLE_CABINET_LIST.rules.length);
  });
});

describe("the search", () => {
  it("is a labelled field, with the words that tell a person what to type", async () => {
    const container = await mount();
    const field = searchBox(container);

    expect(requireIn(container, `label[for="${field.id}"]`).textContent).toBe(
      COPY.cabinets.searchLabel,
    );
    expect(field.getAttribute("placeholder")).toBe(
      COPY.cabinets.searchPlaceholder,
    );
  });

  it("narrows the rows to the names that hold the text, case and diacritics aside", async () => {
    const container = await mount();

    typeInto(searchBox(container), "COLOANA");

    expect(rowsOf(container).map((row) => row.dataset.ruleId)).toEqual([
      "cabinet.tall-pantry",
      "cabinet.tall-oven-tower",
    ]);
    expect(allIn(container, "h2")).toHaveLength(1);
  });

  it("opens a group that started closed, when something in it matches", async () => {
    const container = await mount();

    typeInto(searchBox(container), "racord");

    expect(rowsOf(group(container, "corner"))).toHaveLength(1);
    expect(
      group(container, "corner").querySelector("ul")?.hasAttribute("hidden"),
    ).toBe(false);
    expect(group(container, "corner").querySelector("button")).toBeNull();
  });

  it("says how many cabinets it shows, in a polite live region", async () => {
    const container = await mount();

    typeInto(searchBox(container), "sertare");

    expect(requireIn(container, '[role="status"]').textContent).toBe(
      "3 dulapuri",
    );
  });

  it("states that nothing matched, with the words typed, and a way to clear them", async () => {
    const container = await mount();

    typeInto(searchBox(container), "zzz");
    const empty = requireIn(container, '[data-testid="cabinet-list-empty"]');

    expect(empty.textContent).toContain("Niciun dulap pentru „zzz”.");
    expect(empty.textContent).toContain(COPY.cabinets.emptySearchBody);
    expect(rowsOf(container)).toHaveLength(0);
  });

  it("shows a hostile query as text and never as markup", async () => {
    const container = await mount();

    typeInto(searchBox(container), "<img src=x onerror=alert(1)>");

    expect(container.querySelector("img")).toBeNull();
    expect(
      requireIn(container, '[data-testid="cabinet-list-empty"]').textContent,
    ).toContain("<img src=x onerror=alert(1)>");
  });

  it("is cleared by the empty state's button and by the field's own, and focus returns to the field", async () => {
    const container = await mount();

    typeInto(searchBox(container), "zzz");
    click(
      requireIn(
        requireIn(container, '[data-testid="cabinet-list-empty"]'),
        "button",
      ),
    );

    expect(searchBox(container).value).toBe("");
    expect(document.activeElement).toBe(searchBox(container));
    expect(rowsOf(container)).toHaveLength(SAMPLE_CABINET_LIST.rules.length);

    typeInto(searchBox(container), "sertare");
    click(
      requireIn(container, `button[aria-label="${COPY.cabinets.searchClear}"]`),
    );

    expect(searchBox(container).value).toBe("");
    expect(document.activeElement).toBe(searchBox(container));
  });

  it("offers a clear button only while there is text to clear", async () => {
    const container = await mount();

    expect(
      container.querySelector(
        `button[aria-label="${COPY.cabinets.searchClear}"]`,
      ),
    ).toBeNull();
  });
});

describe("'Doar modificate'", () => {
  it("keeps only the cabinets that await publication, and is pressed while it does", async () => {
    const container = await mount();

    click(filterToggle(container));

    expect(filterToggle(container).getAttribute("aria-pressed")).toBe("true");
    expect(rowsOf(container).map((row) => row.dataset.ruleId)).toEqual([
      BASE_CABINET,
    ]);

    click(filterToggle(container));

    expect(rowsOf(group(container, "base")).length).toBeGreaterThan(1);
  });

  it("is off, and says so, when nothing awaits publication", async () => {
    const container = await mount(NO_DRAFT);

    expect(filterToggle(container).disabled).toBe(true);
    expect(rowsOf(container)).toHaveLength(SAMPLE_CABINET_LIST.rules.length);
  });

  it("works with the search: the empty state appears when the two together leave nothing", async () => {
    const container = await mount();

    click(filterToggle(container));
    typeInto(searchBox(container), "sertare");

    expect(
      requireIn(container, '[data-testid="cabinet-list-empty"]').textContent,
    ).toContain(
      roCopy("priceDashboard.cabinets.emptyChangedTitle", { query: "sertare" }),
    );
  });

  it("is cleared with the search by the empty state's button", async () => {
    const container = await mount();

    click(filterToggle(container));
    typeInto(searchBox(container), "sertare");
    click(
      requireIn(
        requireIn(container, '[data-testid="cabinet-list-empty"]'),
        "button",
      ),
    );

    expect(searchBox(container).value).toBe("");
    expect(filterToggle(container).getAttribute("aria-pressed")).toBe("false");
    expect(rowsOf(container).length).toBeGreaterThan(1);
  });
});

describe("a book with no cabinet", () => {
  it("draws an empty state and no rows, and no way to clear what is not there", async () => {
    const container = await mount({
      rules: [],
      draft: { draftRevision: "1", changes: [] },
    });
    const empty = requireIn(container, '[data-testid="cabinet-list-empty"]');

    expect(empty.textContent).toBe(
      roCopy("priceDashboard.cabinets.emptyListTitle"),
    );
    expect(empty.querySelector("button")).toBeNull();
    expect(rowsOf(container)).toHaveLength(0);
  });
});

describe("in Russian (frame D2R)", () => {
  it("keeps the cabinets' names in Romanian and says everything else in Russian", async () => {
    const container = await mount(SAMPLE_CABINET_LIST, "ru");
    const row = rowOf(container, BASE_CABINET);

    expect(requireIn(container, "h1").textContent).toBe(
      ruMessages.priceDashboard.cabinets.title,
    );
    expect(allIn(container, "h2")[0]?.textContent).toContain(
      ruMessages.priceDashboard.cabinets.groupBase,
    );
    expect(row.textContent).toContain(
      roMessages.catalog.entries["base-cabinet"],
    );
    expect(priceOf(row)).toContain("ЛДСП");
    expect(priceOf(row)).toContain(`${NBSP}лей`);
  });
});

describe("a price that cannot be drawn, or must not be", () => {
  const [first] = SAMPLE_CABINET_LIST.rules;
  if (first === undefined) throw new Error("the sample holds no rule");

  function inputWithFirst(facts: Partial<CabinetRuleFacts>): CabinetListInput {
    return {
      rules: [
        { ...first, ...facts } as CabinetRuleFacts,
        ...SAMPLE_CABINET_LIST.rules.slice(1),
      ],
      draft: { draftRevision: "1", changes: [] },
    };
  }

  it("draws a dash in the row of an invalid price and every other row as it was, and does not throw", async () => {
    const container = await mount(
      inputWithFirst({
        price: { widthMm: 600, activeMinor: -100, pendingMinor: -100 },
      }),
    );

    expect(
      rowOf(container, first.ruleId).querySelector(
        '[data-testid="cabinet-price-unreadable"]',
      ),
    ).not.toBeNull();
    expect(rowOf(container, first.ruleId).textContent).not.toContain("-");
    expect(rowsOf(container)).toHaveLength(SAMPLE_CABINET_LIST.rules.length);
    expect(priceOf(rowOf(container, THREE_DRAWER))).toBe(
      `2${NBSP}100${NBSP}lei600 mm · PAL`,
    );
  });

  it("heads an unmodified row with the active price", async () => {
    const container = await mount(
      inputWithFirst({
        price: { widthMm: 600, activeMinor: 145_000, pendingMinor: 999_000 },
      }),
    );

    expect(priceOf(rowOf(container, first.ruleId))).toBe(
      `1${NBSP}450${NBSP}lei600 mm · PAL`,
    );
  });

  it("draws no price for a cabinet the customer supplies, even one supplied with a price", async () => {
    const container = await mount(
      inputWithFirst({
        isCustomerSupplied: true,
        price: { widthMm: 600, activeMinor: 145_000, pendingMinor: 145_000 },
      }),
    );

    const row = rowOf(container, first.ruleId);

    expect(row.querySelector('[data-testid="cabinet-price"]')).toBeNull();
    expect(row.textContent).not.toContain(COPY.units.currency);
  });
});
