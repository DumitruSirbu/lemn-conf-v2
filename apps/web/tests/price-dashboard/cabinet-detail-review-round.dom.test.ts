// @vitest-environment happy-dom
//
// The review round of M10 wave U3 on one cabinet's page: a corner states the height its band stands at, the page names
// the active book and the draft's where they differ, a write the server refused asks for no correction, and a price
// refusal no field carries still keeps Save off and says why.
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  DEEP_CABINET_DEPTH_MM,
  previewCabinet,
  SAMPLE_PRICE_BOOK,
  type DraftChange,
  type PriceBook,
} from "@lemnaria/configurator-domain";

import { deriveCabinetDetail } from "@/price-dashboard/cabinet-detail-model";
import { CabinetPriceFields } from "@/price-dashboard/cabinet-price-fields";
import { formatLei } from "@/price-dashboard/format-lei";
import { priceDashboardCatalogue } from "@/price-dashboard/price-dashboard-catalogue";
import {
  useCabinetPriceEditing,
  type CabinetPriceEditing,
} from "@/price-dashboard/use-cabinet-price-editing";
import { resetStaffSessionExpiryForTests } from "@/staff/staff-session-expiry";

import { MEASURED_DEEPENING_ROWS } from "../support/deepening-rows";
import { allIn, mountInCatalogue } from "../support/render-with-intl";
import {
  alertsIn,
  buttonNamed,
  BASE_RULE,
  cancelWords,
  mountDetail,
  press,
  previewCells,
  ruleOf,
  saveWords,
  switchHolding,
  typeInField,
  type MountedDetail,
} from "./cabinet-detail-harness";
import { pageOf } from "./dashboard-state-fixture";
import { roCopy } from "./romanian-copy";
import { leaveTheStaffServer, stubTheStaffServer } from "./staff-frame-harness";

const ACTIVE_DEPTH_PERCENT = SAMPLE_PRICE_BOOK.depthRule.deepCabinetPercent;
const DRAFT_DEPTH_PERCENT = ACTIVE_DEPTH_PERCENT + 8;
const DEPTH_DRAFT: readonly DraftChange[] = [
  { address: { kind: "depth-rule" }, value: DRAFT_DEPTH_PERCENT },
];
const PAINTED_TIER = "material.painted-mdf";
const ACTIVE_PAINTED_PERCENT = materialPercentIn(
  SAMPLE_PRICE_BOOK,
  PAINTED_TIER,
);
const DRAFT_PAINTED_PERCENT = ACTIVE_PAINTED_PERCENT + 7;
const STANDARD_HARDWARE = SAMPLE_PRICE_BOOK.hardware.defaultTierId;
const DRAFT_HINGE_MINOR = 2_000;
/** Four hinges at the default width, each rate's total taken to the next ten lei as the readout does. */
const ACTIVE_HARDWARE_MINOR = 7_000;
const DRAFT_HARDWARE_MINOR = 8_000;

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

function materialPercentIn(book: PriceBook, tierId: string): number {
  const tier = book.material.tiers.find((held) => held.tierId === tierId);
  if (tier === undefined) throw new Error(`no material tier ${tierId}`);
  return tier.percentOfCabinets;
}

async function mount(ruleId: string, changes: readonly DraftChange[] = []) {
  mounted = await mountDetail(ruleId, { page: pageOf(changes) });
  return mounted;
}

function candidateOf(changes: readonly DraftChange[]): PriceBook {
  const detail = deriveCabinetDetail(pageOf(changes), BASE_RULE);
  if (detail.kind !== "ready") throw new Error("the page is not ready");
  return detail.candidate;
}

function dimensionValue(container: HTMLElement, label: string): string {
  const name = allIn(container, "dt").find(
    (candidate) => candidate.firstChild?.textContent === label,
  );
  const value = name?.nextElementSibling;
  if (value === null || value === undefined) {
    throw new Error(`no dimension is labelled "${label}"`);
  }
  return value.textContent.replaceAll(/\s/g, "");
}

describe("the height a structural corner states", () => {
  const HEIGHT_LABEL = roCopy("priceDashboard.cabinet.bodyHeight");

  it.each([
    ["cabinet.base-corner-x-900", "860mm"],
    ["cabinet.base-corner-return-320", "860mm"],
    ["cabinet.wall-corner-return-570", "700mm"],
    ["cabinet.wall-corner-x-900", "700mm"],
    ["cabinet.wall-corner-x-900-top", "400mm"],
    ["cabinet.wall-corner-return-570-top", "400mm"],
  ])(
    "%s is stated at %s, the height of the rows of its band",
    async (ruleId, shown) => {
      const { container } = await mount(ruleId);

      expect(dimensionValue(container, HEIGHT_LABEL)).toBe(shown);
    },
  );

  it("states the base corner at the height a base cabinet is stated at", async () => {
    const corner = await mount("cabinet.base-corner-x-900");
    const cornerHeight = dimensionValue(corner.container, HEIGHT_LABEL);
    corner.unmount();
    const base = await mount(BASE_RULE);

    expect(dimensionValue(base.container, HEIGHT_LABEL)).toBe(cornerHeight);
  });
});

describe("the deep-kitchen switch beside a draft that changes the percentage", () => {
  const DEEP_SWITCH = roCopy("priceDashboard.cabinet.depthToggle", {
    shallowMm: 600,
    deepMm: 700,
  });

  function deepCellsOf(book: PriceBook): number | undefined {
    const preview = previewCabinet({
      rule: ruleOf(book, BASE_RULE),
      catalog: priceDashboardCatalogue(),
      book,
      material: book.material.defaultTierId,
      depth: DEEP_CABINET_DEPTH_MM,
      deepeningRows: MEASURED_DEEPENING_ROWS,
    });
    return preview.ok
      ? preview.rows.find(({ widthMm }) => widthMm === 600)?.priceMinor
      : undefined;
  }

  it("names the active percentage the Activ column is priced at, and the draft's it is not", async () => {
    const { container } = await mount(BASE_RULE, DEPTH_DRAFT);

    await press(switchHolding(container, DEEP_SWITCH));

    const activeAtDeep = deepCellsOf(SAMPLE_PRICE_BOOK);
    const draftAtDeep = deepCellsOf(candidateOf(DEPTH_DRAFT));
    const row = previewCells(container).find(
      ([width]) =>
        width ===
        roCopy("priceDashboard.cabinet.previewWidth", { widthMm: 600 }),
    );
    expect(activeAtDeep).not.toBe(draftAtDeep);
    expect(row?.[2]).toBe(formatLei(activeAtDeep ?? 0, "lei"));
    expect(row?.[3]).toBe(formatLei(draftAtDeep ?? 0, "lei"));
    expect(switchHolding(container, DEEP_SWITCH).textContent).toContain(
      roCopy("priceDashboard.cabinet.depthToggleOnPending", {
        deepMm: 700,
        activePercent: String(ACTIVE_DEPTH_PERCENT),
        pendingPercent: String(DRAFT_DEPTH_PERCENT),
      }),
    );
  });

  it("names one percentage where the draft leaves it alone", async () => {
    const { container } = await mount(BASE_RULE);

    await press(switchHolding(container, DEEP_SWITCH));

    expect(switchHolding(container, DEEP_SWITCH).textContent).toContain(
      roCopy("priceDashboard.cabinet.depthToggleOn", {
        deepMm: 700,
        percent: String(ACTIVE_DEPTH_PERCENT),
      }),
    );
  });
});

describe("a material column beside a draft that changes its percentage", () => {
  const PAINTED_NAME = roCopy("priceBook.material.painted-mdf.name");

  it("names the active percentage and the draft's", async () => {
    const { container } = await mount(BASE_RULE, [
      {
        address: {
          kind: "material",
          tierId: PAINTED_TIER,
          field: "percentOfCabinets",
        },
        value: DRAFT_PAINTED_PERCENT,
      },
    ]);

    const headers = allIn(container, "thead th").map((cell) =>
      cell.textContent.trim(),
    );

    expect(headers).toContain(
      roCopy("priceDashboard.cabinet.columnMaterialPercentPending", {
        name: PAINTED_NAME,
        percent: String(ACTIVE_PAINTED_PERCENT),
        pendingPercent: String(DRAFT_PAINTED_PERCENT),
      }),
    );
  });

  it("names the active percentage alone where the draft leaves it", async () => {
    const { container } = await mount(BASE_RULE);

    const headers = allIn(container, "thead th").map((cell) =>
      cell.textContent.trim(),
    );

    expect(headers).toContain(
      roCopy("priceDashboard.cabinet.columnMaterialPercent", {
        name: PAINTED_NAME,
        percent: String(ACTIVE_PAINTED_PERCENT),
      }),
    );
  });
});

describe("the hardware readout beside a draft that changes a hinge's price", () => {
  const draftHinge: readonly DraftChange[] = [
    {
      address: {
        kind: "hardware",
        tierId: STANDARD_HARDWARE,
        field: "perHingeMinor",
      },
      value: DRAFT_HINGE_MINOR,
    },
  ];
  const lineAt = (amountMinor: number, key: "Active" | "Pending") =>
    roCopy(`priceDashboard.cabinet.hardwareLine${key}`, {
      widthMm: 600,
      quantities: roCopy("priceDashboard.cabinet.hingeCount", { count: 4 }),
      amount: formatLei(amountMinor, "lei"),
      className: "Standard",
    });

  it("reads out the active amount and the draft's, each named", async () => {
    const { container } = await mount(BASE_RULE, draftHinge);

    expect(container.textContent).toContain(
      lineAt(ACTIVE_HARDWARE_MINOR, "Active"),
    );
    expect(container.textContent).toContain(
      lineAt(DRAFT_HARDWARE_MINOR, "Pending"),
    );
  });

  it("reads out one line, unnamed, where the draft leaves the hardware alone", async () => {
    const { container } = await mount(BASE_RULE);

    expect(container.textContent).toContain(
      roCopy("priceDashboard.cabinet.hardwareLine", {
        widthMm: 600,
        quantities: roCopy("priceDashboard.cabinet.hingeCount", { count: 4 }),
        amount: formatLei(ACTIVE_HARDWARE_MINOR, "lei"),
        className: "Standard",
      }),
    );
    expect(container.textContent).not.toContain(
      lineAt(ACTIVE_HARDWARE_MINOR, "Active"),
    );
  });
});

describe("what a write the server refused asks for", () => {
  const ANCHOR_LABEL = roCopy("priceDashboard.cabinet.fieldAnchor", {
    widthMm: 600,
  });

  it("is a retry, so the sentence that asks for a correction is not shown beside it", async () => {
    const { container, server } = await mount(BASE_RULE);
    typeInField(container, ANCHOR_LABEL, "4100");
    server.answerNextWriteWith({ kind: "refused", code: "TOO_LARGE" });

    await press(buttonNamed(container, saveWords()));

    expect(alertsIn(container)).toEqual([
      roCopy("priceDashboard.errors.tooBig"),
    ]);
    expect(container.textContent).not.toContain(
      roCopy("priceDashboard.errors.fixToSave"),
    );
    expect(buttonNamed(container, cancelWords())).toBeDefined();
  });

  it("is still asked for, beside the field, by a value that is not an amount", async () => {
    const { container } = await mount(BASE_RULE);

    typeInField(container, ANCHOR_LABEL, "abc");

    expect(container.textContent).toContain(
      roCopy("priceDashboard.errors.fixToSave"),
    );
  });
});

describe("a price refusal no field carries", () => {
  const MINUS_KEY = "perStepNarrowerMinor";
  const ANCHOR_LABEL = roCopy("priceDashboard.cabinet.fieldAnchor", {
    widthMm: 600,
  });

  /** The page's fields, less those `isHeld` refuses: the refusal for a tiny anchor is owed to the minus step. */
  function mountPage(isHeld: (fieldKey: string) => boolean): {
    readonly container: HTMLElement;
    readonly editing: () => CabinetPriceEditing;
    readonly unmount: () => void;
  } {
    const detail = deriveCabinetDetail(pageOf(), BASE_RULE);
    if (detail.kind !== "ready") throw new Error("the page is not ready");
    const { candidate, facts } = detail;
    const fields = detail.fields.filter(({ key }) => isHeld(key));
    const draft = {
      isBusy: false,
      changeOrRevert: () => Promise.resolve({ kind: "saved" } as const),
    };
    let editing: CabinetPriceEditing | undefined;
    function Page() {
      editing = useCabinetPriceEditing({
        fields,
        candidate,
        ruleId: BASE_RULE,
        draft,
      });
      return createElement(CabinetPriceFields, {
        locale: "ro",
        facts,
        editing,
      });
    }
    const screen = mountInCatalogue(createElement(Page));
    return {
      container: screen.container,
      unmount: screen.unmount,
      editing: () => {
        if (editing === undefined) throw new Error("not rendered");
        return editing;
      },
    };
  }

  it("keeps Save off and says why beside Save, where the page holds no field to put it on", () => {
    const page = mountPage((key) => key !== MINUS_KEY);

    typeInField(page.container, ANCHOR_LABEL, "10");

    expect(page.editing().judgement).toEqual({
      kind: "unplaced",
      reason: "not-positive",
    });
    expect(page.editing().canSave).toBe(false);
    expect(buttonNamed(page.container, saveWords()).disabled).toBe(true);
    expect(alertsIn(page.container)).toEqual([
      roCopy("priceDashboard.errors.priceNotPositive"),
    ]);
    expect(page.container.textContent).toContain(
      roCopy("priceDashboard.errors.fixToSave"),
    );
    page.unmount();
  });

  it("puts the same refusal on its field, with no sentence beside Save, where the page holds the field (a control)", () => {
    const page = mountPage(() => true);

    typeInField(page.container, ANCHOR_LABEL, "10");

    expect(page.editing().judgement).toMatchObject({
      kind: "not-positive-at-width",
      fieldKey: MINUS_KEY,
    });
    expect(page.editing().canSave).toBe(false);
    expect(alertsIn(page.container)).toEqual([
      roCopy("priceDashboard.errors.priceNotPositiveAtWidth", { widthMm: 200 }),
    ]);
    page.unmount();
  });
});
