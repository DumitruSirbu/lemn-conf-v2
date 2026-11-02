// @vitest-environment happy-dom
//
// One cabinet's page (frames D3A to D3G, D3R): the fields its rule has, the sentence and the table they make as they
// are typed, and Save, which sends each changed amount to "De publicat" and shows nothing as written until the server
// said so. The server is a draft client that judges as the dashboard's routes do.
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  DEFAULT_CABINET_DEPTH_MM,
  previewCabinet,
  SAMPLE_PRICE_BOOK,
  type DraftChange,
} from "@lemnaria/configurator-domain";

import { deriveCabinetDetail } from "@/price-dashboard/cabinet-detail-model";
import { priceDashboardCatalogue } from "@/price-dashboard/price-dashboard-catalogue";
import { formatLei } from "@/price-dashboard/format-lei";
import { cabinetPathOf } from "@/price-dashboard/cabinet-paths";
import { resetStaffSessionExpiryForTests } from "@/staff/staff-session-expiry";

import ruMessages from "../../src/messages/ru.json";
import { MEASURED_DEEPENING_ROWS } from "../support/deepening-rows";
import { allIn, requireIn } from "../support/render-with-intl";
import {
  alertsIn,
  atIndex,
  BASE_RULE,
  buttonNamed,
  cancelWords,
  CORNER_RULE,
  fieldNamed,
  FRIDGE_RULE,
  HOOD_RULE,
  mountDetail,
  PANTRY_RULE,
  PER_SIZE_RULE,
  press,
  previewCells,
  ruleOf,
  saveWords,
  settle,
  switchHolding,
  typeInField,
  WALL_RULE,
  type MountedDetail,
} from "./cabinet-detail-harness";
import { pageOf } from "./dashboard-state-fixture";
import { roCopy } from "./romanian-copy";
import { leaveTheStaffServer, stubTheStaffServer } from "./staff-frame-harness";

const ANCHOR_LABEL = roCopy("priceDashboard.cabinet.fieldAnchor", {
  widthMm: 600,
});
const MINUS_LABEL = roCopy("priceDashboard.cabinet.fieldMinus", { stepMm: 50 });
const PLUS_LABEL = roCopy("priceDashboard.cabinet.fieldPlus", { stepMm: 50 });
const NBSP = " ";

let mounted: MountedDetail | undefined;

beforeEach(() => {
  stubTheStaffServer();
});

afterEach(() => {
  mounted?.unmount();
  mounted = undefined;
  resetStaffSessionExpiryForTests();
  leaveTheStaffServer();
});

async function mount(ruleId: string, changes: readonly DraftChange[] = []) {
  mounted = await mountDetail(ruleId, { page: pageOf(changes) });
  return mounted;
}

const lei = (minor: number) => formatLei(minor, "lei");

function previewRowsOf(
  ruleId: string,
  materialTierId: string,
  heightMm?: number,
) {
  const rule = ruleOf(SAMPLE_PRICE_BOOK, ruleId);
  const preview = previewCabinet({
    rule,
    catalog: priceDashboardCatalogue(),
    book: SAMPLE_PRICE_BOOK,
    material: materialTierId,
    depth: DEFAULT_CABINET_DEPTH_MM,
    deepeningRows: MEASURED_DEEPENING_ROWS,
    ...(heightMm === undefined ? {} : { heightMm }),
  });
  if (!preview.ok) throw new Error(preview.code);
  return preview.rows;
}

describe("the page of a door cabinet", () => {
  it("is headed by the cabinet's name with the way back to the list, and holds the fields its rule has", async () => {
    const { container } = await mount(BASE_RULE);

    expect(requireIn(container, "h1").textContent).toBe(
      roCopy("catalog.entries.base-cabinet"),
    );
    expect(
      requireIn<HTMLAnchorElement>(
        container,
        '[data-testid="cabinet-detail"] a[href$="/staff/catalog/cabinets"]',
      ).textContent,
    ).toBe(roCopy("priceDashboard.cabinets.title"));
    for (const label of [
      ANCHOR_LABEL,
      PLUS_LABEL,
      MINUS_LABEL,
      roCopy("priceDashboard.cabinet.fieldDoor", { atMm: 500 }),
    ]) {
      expect(fieldNamed(container, label).value, label).not.toBe("");
    }
  });

  it("starts each field at the draft's amount and names the active one under it", async () => {
    const { container } = await mount(BASE_RULE, [
      {
        address: { kind: "cabinet", ruleId: BASE_RULE, field: "anchorMinor" },
        value: 410_000,
      },
    ]);

    expect(fieldNamed(container, ANCHOR_LABEL).value).toBe("4100");
    expect(container.textContent).toContain(
      roCopy("priceDashboard.cabinet.anchorHint", { amount: lei(396_000) }),
    );
  });

  it("states the read-only dimensions the catalogue gives it, and says who changes them", async () => {
    const { container } = await mount(BASE_RULE);
    const text = container.textContent;

    expect(text).toContain(roCopy("priceDashboard.cabinet.developerNote"));
    for (const word of [
      roCopy("priceDashboard.cabinet.defaultWidth"),
      roCopy("priceDashboard.cabinet.minWidth"),
      roCopy("priceDashboard.cabinet.widthStep"),
      roCopy("priceDashboard.cabinet.depthInKitchen", { kitchenDepthMm: 600 }),
      roCopy("priceDashboard.cabinet.depthInKitchen", { kitchenDepthMm: 700 }),
    ]) {
      expect(text, word).toContain(word);
    }
    expect(allIn(container, "dl input")).toEqual([]);
  });

  it("restates the typed amounts as a sentence as they are typed", async () => {
    const { container } = await mount(BASE_RULE);
    typeInField(container, ANCHOR_LABEL, "4100");

    const sentence = requireIn(
      container,
      '[data-testid="cabinet-price-sentence"]',
    ).textContent;

    expect(sentence).toContain(
      roCopy("priceDashboard.cabinet.summaryBase", {
        widthMm: 600,
        amount: lei(410_000),
      }),
    );
    expect(sentence).toContain(
      roCopy("priceDashboard.cabinet.summaryRounding"),
    );
  });

  it("says what the door step takes off in the checked arithmetic of the pricing module, for the leaves the catalogue steps by", async () => {
    const { container } = await mount(PANTRY_RULE);
    const sentence = requireIn(
      container,
      '[data-testid="cabinet-price-sentence"]',
    ).textContent;

    expect(sentence).toContain(
      roCopy("priceDashboard.cabinet.summaryDoor", {
        atMm: 500,
        doorCount: 2,
        amount: lei(44_000),
      }),
    );
  });
});

describe("what typing does", () => {
  it("recalculates the table and sends nothing", async () => {
    const { container, server } = await mount(BASE_RULE);
    const before = previewCells(container);

    typeInField(container, ANCHOR_LABEL, "4100");

    expect(previewCells(container)).not.toEqual(before);
    expect(server.calls).toEqual([]);
  });

  it("draws, in every cell of the new column, the preview of the book the typed amounts make", async () => {
    const { container } = await mount(BASE_RULE);
    typeInField(container, ANCHOR_LABEL, "4100");

    const rows = previewRowsOf(BASE_RULE, "material.melamine");
    const typedRows = previewRowsOf(BASE_RULE, "material.melamine");
    const cells = previewCells(container).map((row) => row[2]);

    expect(cells).toEqual(rows.map((row) => lei(row.priceMinor)));
    expect(typedRows.length).toBe(cells.length);
    const next = previewCells(container).map((row) => row[3]);
    expect(next[0]).not.toBe(cells[0]);
  });

  it("marks a cell whose new price differs from the active one", async () => {
    const { container } = await mount(BASE_RULE);
    typeInField(container, ANCHOR_LABEL, "4100");

    const changed = allIn(
      container,
      'td[data-role="next"][data-changed="true"]',
    );

    expect(changed.length).toBeGreaterThan(0);
  });
});

describe("a value that is not an amount", () => {
  it.each([
    ["nothing", ""],
    ["letters", "abc"],
    ["a negative sum", "-50"],
    ["three decimals", "450,123"],
    ["a sum that is not a whole ten of lei", "455"],
    ["a sum past the greatest", "99999999999"],
  ])(
    "%s is refused in its field, tied to it, and never sent",
    async (_name, text) => {
      const { container, server } = await mount(BASE_RULE);

      typeInField(container, ANCHOR_LABEL, text);
      const input = fieldNamed(container, ANCHOR_LABEL);
      await press(buttonNamed(container, saveWords()));

      expect(input.getAttribute("aria-invalid")).toBe("true");
      expect(alertsIn(container)).toHaveLength(1);
      expect(input.getAttribute("aria-describedby")).toContain(
        requireIn(container, '[role="alert"]').id,
      );
      expect(buttonNamed(container, saveWords()).disabled).toBe(true);
      expect(server.calls).toEqual([]);
    },
  );

  it("is told, with the sentence that says a wrong value is never saved", async () => {
    const { container } = await mount(BASE_RULE);
    typeInField(container, ANCHOR_LABEL, "abc");

    expect(container.textContent).toContain(
      roCopy("priceDashboard.errors.fixToSave"),
    );
  });
});

describe("a step so large that a width would cost nothing (frame D3C)", () => {
  it("marks the minus step with the width it fails at and keeps Save off", async () => {
    const { container, server } = await mount(BASE_RULE);

    typeInField(container, MINUS_LABEL, "18000");

    const input = fieldNamed(container, MINUS_LABEL);
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(alertsIn(container)).toEqual([
      roCopy("priceDashboard.errors.priceNotPositiveAtWidth", { widthMm: 200 }),
    ]);
    expect(buttonNamed(container, saveWords()).disabled).toBe(true);
    expect(server.calls).toEqual([]);
  });

  it("marks the height step of a wall cabinet with the height it fails at", async () => {
    const { container } = await mount(WALL_RULE);

    typeInField(
      container,
      roCopy("priceDashboard.cabinet.fieldHeightStep", { stepMm: 50 }),
      "99990",
    );

    expect(alertsIn(container)).toEqual([
      roCopy("priceDashboard.errors.priceNotPositiveAtHeight", {
        heightMm: 400,
      }),
    ]);
  });

  it("clears when the value is corrected, and Save is on again", async () => {
    const { container } = await mount(BASE_RULE);
    typeInField(container, MINUS_LABEL, "18000");
    typeInField(container, MINUS_LABEL, "250");

    expect(alertsIn(container)).toEqual([]);
    expect(buttonNamed(container, saveWords()).disabled).toBe(false);
  });
});

describe("Save", () => {
  it("is off while nothing has changed and shows no Cancel", async () => {
    const { container } = await mount(BASE_RULE);

    expect(buttonNamed(container, saveWords()).disabled).toBe(true);
    expect(
      allIn(container, "button").some(
        (button) => button.textContent === cancelWords(),
      ),
    ).toBe(false);
  });

  it("sends the changed amount to the draft in bani, then says it awaits publication and counts it in the header", async () => {
    const { container, server } = await mount(BASE_RULE);
    typeInField(container, ANCHOR_LABEL, "4100");

    await press(buttonNamed(container, saveWords()));

    expect(
      server.calls
        .filter((call) => call.kind === "change")
        .map((call) => call.request),
    ).toEqual([
      expect.objectContaining({
        change: {
          address: { kind: "cabinet", ruleId: BASE_RULE, field: "anchorMinor" },
          value: 410_000,
        },
      }),
    ]);
    expect(requireIn(container, '[role="status"]').textContent).toContain(
      roCopy("priceDashboard.common.priceSavedNotice"),
    );
    expect(
      requireIn(container, '[data-testid="staff-pending-prices"]').textContent,
    ).toContain("1");
    expect(fieldNamed(container, ANCHOR_LABEL).value).toBe("4100");
  });

  it("links the notice to the publish page", async () => {
    const { container } = await mount(BASE_RULE);
    typeInField(container, ANCHOR_LABEL, "4100");
    await press(buttonNamed(container, saveWords()));

    const link = requireIn<HTMLAnchorElement>(container, '[role="status"] a');

    expect(link.getAttribute("href")).toBe("/ro/staff/catalog/publish");
  });

  it("sends one write for each changed field, and none for a field left alone", async () => {
    const { container, server } = await mount(BASE_RULE);
    typeInField(container, ANCHOR_LABEL, "4100");
    typeInField(container, PLUS_LABEL, "230");

    await press(buttonNamed(container, saveWords()));

    expect(server.calls.filter((call) => call.kind === "change")).toHaveLength(
      2,
    );
    expect(server.state().draft.changes).toHaveLength(2);
  });

  it("takes the draft's change out and shows no notice when the active amount is typed back", async () => {
    const { container, server } = await mount(BASE_RULE, [
      {
        address: { kind: "cabinet", ruleId: BASE_RULE, field: "anchorMinor" },
        value: 410_000,
      },
    ]);
    typeInField(container, ANCHOR_LABEL, "3960");

    await press(buttonNamed(container, saveWords()));

    expect(server.calls.map((call) => call.kind)).toEqual(["revert"]);
    expect(server.state().draft.changes).toEqual([]);
    expect(container.querySelector('[role="status"]')).toBeNull();
  });

  it("clears the typing on Cancel and sends nothing", async () => {
    const { container, server } = await mount(BASE_RULE);
    typeInField(container, ANCHOR_LABEL, "4100");

    await press(buttonNamed(container, cancelWords()));

    expect(fieldNamed(container, ANCHOR_LABEL).value).toBe("3960");
    expect(server.calls).toEqual([]);
  });

  it("shows a refusal of the server on the field it was sent for, shows no notice, and leaves Save usable again", async () => {
    const { container, server } = await mount(BASE_RULE);
    typeInField(container, ANCHOR_LABEL, "4100");
    server.answerNextWriteWith({ kind: "refused", code: "TOO_LARGE" });

    await press(buttonNamed(container, saveWords()));

    expect(alertsIn(container)).toEqual([
      roCopy("priceDashboard.errors.tooBig"),
    ]);
    expect(container.querySelector('[role="status"]')).toBeNull();
    expect(fieldNamed(container, ANCHOR_LABEL).value).toBe("4100");
    expect(buttonNamed(container, saveWords()).disabled).toBe(false);
  });

  it("says another writer got there first when the draft moved, reads it again, and keeps what was typed", async () => {
    const { container, server } = await mount(BASE_RULE);
    typeInField(container, ANCHOR_LABEL, "4100");
    server.moveDraftBehindTheScreen();

    await press(buttonNamed(container, saveWords()));

    expect(alertsIn(container)).toEqual([
      roCopy("priceDashboard.errors.changedMeanwhile"),
    ]);
    expect(server.calls.map((call) => call.kind)).toEqual([
      "change",
      "readState",
    ]);
    expect(fieldNamed(container, ANCHOR_LABEL).value).toBe("4100");
  });

  it("says it could not save, and shows no notice, when the transport throws; and Save is usable again", async () => {
    const { container, server } = await mountThrowing();
    typeInField(container, ANCHOR_LABEL, "4100");

    await press(buttonNamed(container, saveWords()));

    expect(alertsIn(container)).toEqual([
      roCopy("priceDashboard.errors.saveFailed"),
    ]);
    expect(container.querySelector('[role="status"]')).toBeNull();
    expect(buttonNamed(container, saveWords()).disabled).toBe(false);
    expect(server.calls).toEqual([]);
  });

  it("sends one write for two presses in the same moment and does not call the second a failure", async () => {
    const { container, server } = await mount(BASE_RULE);
    typeInField(container, ANCHOR_LABEL, "4100");
    const release = server.holdNextWrite();
    const save = buttonNamed(container, saveWords());

    act(() => {
      save.click();
      save.click();
    });
    await settle();

    expect(server.calls.filter((call) => call.kind === "change")).toHaveLength(
      1,
    );
    expect(alertsIn(container)).toEqual([]);
    release();
    await settle();
    expect(server.state().draft.changes).toHaveLength(1);
  });

  it("drops the answer of a save the person has typed over, keeping what is typed and showing neither notice nor refusal", async () => {
    const { container, server } = await mount(BASE_RULE);
    typeInField(container, ANCHOR_LABEL, "4100");
    const release = server.holdNextWrite();
    server.answerNextWriteWith({ kind: "refused", code: "TOO_LARGE" });
    await press(buttonNamed(container, saveWords()));
    typeInField(container, ANCHOR_LABEL, "4110");

    release();
    await settle();

    expect(alertsIn(container)).toEqual([]);
    expect(container.querySelector('[role="status"]')).toBeNull();
    expect(fieldNamed(container, ANCHOR_LABEL).value).toBe("4110");
  });

  it("sends no further write once the person has typed over a save that has several to send", async () => {
    const { container, server } = await mount(BASE_RULE);
    typeInField(container, ANCHOR_LABEL, "4100");
    typeInField(container, PLUS_LABEL, "230");
    const release = server.holdNextWrite();
    await press(buttonNamed(container, saveWords()));
    typeInField(container, PLUS_LABEL, "240");

    release();
    await settle();

    expect(server.calls.filter((call) => call.kind === "change")).toHaveLength(
      1,
    );
  });

  it("writes first the amount that keeps every width above zero, so no half of a pair is refused", async () => {
    const { container, server } = await mount(BASE_RULE);
    typeInField(container, ANCHOR_LABEL, "1500");
    typeInField(container, MINUS_LABEL, "0");

    await press(buttonNamed(container, saveWords()));

    expect(alertsIn(container)).toEqual([]);
    expect(server.state().draft.changes).toHaveLength(2);
    expect(
      server.calls
        .filter((call) => call.kind === "change")
        .map((call) =>
          "field" in call.request.change.address
            ? call.request.change.address.field
            : "",
        ),
    ).toEqual(["perStepNarrowerMinor", "anchorMinor"]);
  });
});

async function mountThrowing() {
  const page = pageOf();
  mounted = await mountDetail(BASE_RULE, {
    page,
    client: {
      readState: () => Promise.resolve(undefined),
      change: () => Promise.reject(new Error("the network is down")),
      revert: () => Promise.reject(new Error("the network is down")),
      bulk: () => Promise.reject(new Error("the network is down")),
    },
  });
  return mounted;
}

describe("the depth switch", () => {
  const switchOf = (container: HTMLElement) =>
    switchHolding(
      container,
      roCopy("priceDashboard.cabinet.depthToggle", {
        shallowMm: 600,
        deepMm: 700,
      }),
    );

  it("is on offer for a wall cabinet, which deepens, and puts the depth percentage into its cells", async () => {
    const { container } = await mount(WALL_RULE);
    const before = previewCells(container)[0]?.[2];

    await press(switchOf(container));

    expect(switchOf(container).disabled).toBe(false);
    expect(switchOf(container).getAttribute("aria-checked")).toBe("true");
    expect(previewCells(container)[0]?.[2]).not.toBe(before);
  });

  it.each([
    ["the hood", HOOD_RULE],
    ["the free-standing fridge", FRIDGE_RULE],
  ])("is off for %s, with the reason", async (_name, ruleId) => {
    const { container } = await mount(ruleId);

    expect(switchOf(container).disabled).toBe(true);
    expect(switchOf(container).textContent).toContain(
      roCopy("priceDashboard.cabinet.depthToggleDisabled", { deepMm: 700 }),
    );
  });
});

describe("the hardware switch (Cu feronerie)", () => {
  it("adds the hardware to every cell, and lets a class be chosen", async () => {
    const { container } = await mount(BASE_RULE);
    const before = previewCells(container)[0]?.[2];

    await press(
      switchHolding(container, roCopy("priceDashboard.cabinet.withHardware")),
    );
    const afterStandard = previewCells(container)[0]?.[2];
    const radios = allIn<HTMLInputElement>(container, 'input[type="radio"]');
    act(() => {
      atIndex(radios, 2).click();
    });
    await settle();

    expect(afterStandard).not.toBe(before);
    expect(radios).toHaveLength(SAMPLE_PRICE_BOOK.hardware.tiers.length);
    expect(previewCells(container)[0]?.[2]).not.toBe(afterStandard);
  });

  it("reads out the mechanisms a cabinet carries, with their amount", async () => {
    const { container } = await mount(BASE_RULE);

    expect(container.textContent).toContain(
      roCopy("priceDashboard.cabinet.hardwareLine", {
        widthMm: 600,
        quantities: roCopy("priceDashboard.cabinet.hingeCount", { count: 4 }),
        amount: lei(7_000),
        className: "Standard",
      }),
    );
  });

  it("says the cabinet has none where it carries no mechanism", async () => {
    const carriesNone = SAMPLE_PRICE_BOOK.cabinetRules.filter((rule) => {
      const detail = deriveCabinetDetail(pageOf(), rule.ruleId);
      return (
        rule.suppliedBy !== "customer" &&
        detail.kind === "ready" &&
        detail.facts.hardware === undefined
      );
    });
    expect(
      carriesNone.length,
      "the sweep must reach a cabinet without mechanisms",
    ).toBeGreaterThan(0);

    const { container } = await mount(atIndex(carriesNone, 0).ruleId);

    expect(container.textContent).toContain(
      roCopy("priceDashboard.cabinet.hardwareNone"),
    );
  });
});

describe("a cabinet of another shape", () => {
  it("shows a wall cabinet by height: the wall row and the top row, each in PAL", async () => {
    const { container } = await mount(WALL_RULE);
    const heads = allIn(container, 'thead th[scope="colgroup"]').map(
      (head) => head.textContent,
    );
    const wall = previewRowsOf(WALL_RULE, "material.melamine", 700);
    const top = previewRowsOf(WALL_RULE, "material.melamine", 400);

    expect(heads).toEqual([
      roCopy("priceDashboard.cabinet.columnWallRow", { heightMm: 700 }),
      roCopy("priceDashboard.cabinet.columnTopRow", { heightMm: 400 }),
    ]);
    expect(previewCells(container)[0]?.slice(2, 3)).toEqual([
      lei(atIndex(wall, 0).priceMinor),
    ]);
    expect(previewCells(container)[0]?.slice(4, 5)).toEqual([
      lei(atIndex(top, 0).priceMinor),
    ]);
  });

  it("gives a fixed-size cabinet one field for each of its sizes and no steps", async () => {
    const { container } = await mount(PER_SIZE_RULE);

    expect(
      allIn<HTMLLabelElement>(container, "label").filter(
        (label) => label.htmlFor !== "",
      ),
    ).toHaveLength(2);
    expect(container.textContent).toContain(
      roCopy("priceDashboard.cabinet.summaryFixedEnd", {
        sizes: roCopy("priceDashboard.cabinet.summaryFixedJoined", {
          head: roCopy("priceDashboard.cabinet.summaryFixedSize", {
            widthMm: 200,
            amount: lei(180_000),
          }),
          tail: roCopy("priceDashboard.cabinet.summaryFixedSize", {
            widthMm: 300,
            amount: lei(225_000),
          }),
        }),
      }),
    );
  });

  it("labels a structural corner with the width it is built at and not the grid width it is priced at, and says it is placed automatically", async () => {
    const { container, server } = await mount(CORNER_RULE);

    expect(
      fieldNamed(
        container,
        roCopy("priceDashboard.cabinet.fieldAnchor", { widthMm: 330 }),
      ).value,
    ).not.toBe("");
    expect(container.textContent).toContain(
      roCopy("priceDashboard.cabinet.structuralNote"),
    );
    typeInField(
      container,
      roCopy("priceDashboard.cabinet.fieldAnchor", { widthMm: 330 }),
      "1500",
    );
    await press(buttonNamed(container, saveWords()));
    expect(server.calls[0]).toMatchObject({
      request: { change: { address: { kind: "cabinet-size", widthMm: 350 } } },
    });
  });

  it.each([
    ["the hood", HOOD_RULE, [roCopy("priceDashboard.cabinet.hoodNote")]],
    [
      "the free-standing fridge",
      FRIDGE_RULE,
      [roCopy("priceDashboard.cabinet.customerSupplied")],
    ],
  ])(
    "gives %s no field and no table, and a price that is always zero",
    async (_name, ruleId, notes) => {
      const { container } = await mount(ruleId);

      expect(
        allIn<HTMLLabelElement>(container, "label").filter(
          (label) => label.htmlFor !== "",
        ),
      ).toEqual([]);
      expect(
        container.querySelector('[data-testid="cabinet-preview"]'),
      ).toBeNull();
      expect(container.textContent).toContain(`0${NBSP}lei`);
      for (const note of notes) expect(container.textContent).toContain(note);
    },
  );
});

describe("the page in Russian (frame D3R)", () => {
  it("is drawn in the Russian catalogue, with the cabinet's name as the list gives it", async () => {
    mounted = await mountDetail(BASE_RULE, { locale: "ru" });

    expect(mounted.container.textContent).toContain(
      ruMessages.priceDashboard.cabinet.dimensionsHeading,
    );
    expect(requireIn(mounted.container, "h1").textContent).toBe(
      roCopy("catalog.entries.base-cabinet"),
    );
  });
});

describe("the way into the page", () => {
  it("is an address under the cabinets page, one segment for any rule id", () => {
    expect(cabinetPathOf("ro", BASE_RULE)).toBe(
      "/ro/staff/catalog/cabinets/cabinet.base-cabinet",
    );
    expect(
      cabinetPathOf("ro", "a/b?c#d").slice(
        "/ro/staff/catalog/cabinets/".length,
      ),
    ).not.toMatch(/[/?#]/);
  });
});
