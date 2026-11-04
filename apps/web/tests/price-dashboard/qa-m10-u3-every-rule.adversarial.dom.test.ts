// @vitest-environment happy-dom
//
// Adversarial QA of M10 wave U3 (U3-a; ADR 0177 A-1, A-3, A-6, A-7): every rule of the shipped book mounted through the
// page. The developer's tests choose some rules; this one takes all of them and holds each drawn cell to a preview asked
// afresh of a catalogue built here, for the active book and for the candidate, under every switch the page offers. It
// adds what `cabinet-detail.dom.test.ts` and `cabinet-detail-model.test.ts` do not cover: the cross product of switches
// for every rule, the draft's candidate in the new column, the depth switch for every rule against an independent
// measurement, A-7's structural corners (label and address), the customer's side of the hardware readout, and the words
// that must never read "0 mm".
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildKitchenLBodyCatalog,
  DEEP_CABINET_DEPTH_MM,
  DEFAULT_CABINET_DEPTH_MM,
  occupiedDepthOfEntryM,
  pricedRowOf,
  SAMPLE_PRICE_BOOK,
  type CabinetPriceRule,
  type DraftChange,
} from "@lemnaria/configurator-domain";

import { formatLei } from "@/price-dashboard/format-lei";
import { resetStaffSessionExpiryForTests } from "@/staff/staff-session-expiry";

import { MEASURED_DEEPENING_ROWS } from "../support/deepening-rows";
import { allIn, typeInto } from "../support/render-with-intl";
import {
  atIndex,
  buttonNamed,
  fieldNamed,
  mountDetail,
  press,
  switchHolding,
  type MountedDetail,
} from "./cabinet-detail-harness";
import { pageOf } from "./dashboard-state-fixture";
import {
  ALL_RULE_IDS,
  bookWith,
  drawnRows,
  hardwareLineMinor,
  independentPreview,
  INDEPENDENT_CATALOGUE,
  priceOneCabinet,
  ruleIn,
  type PreviewAsk,
} from "./qa-m10-u3-support";
import { roCopy } from "./romanian-copy";
import { leaveTheStaffServer, stubTheStaffServer } from "./staff-frame-harness";

const MATERIAL_IDS = SAMPLE_PRICE_BOOK.material.tiers.map(
  ({ tierId }) => tierId,
);
const HARDWARE_IDS = SAMPLE_PRICE_BOOK.hardware.tiers.map(
  ({ tierId }) => tierId,
);
const PRICE_STEP_BANI = 10_000;
const lei = (minor: number) => formatLei(minor, "lei");
const WITH_HARDWARE = roCopy("priceDashboard.cabinet.withHardware");
const DEPTH_SWITCH = roCopy("priceDashboard.cabinet.depthToggle", {
  shallowMm: DEFAULT_CABINET_DEPTH_MM,
  deepMm: DEEP_CABINET_DEPTH_MM,
});

let mounted: MountedDetail | undefined;
let consoleErrors: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  stubTheStaffServer();
  consoleErrors = vi
    .spyOn(console, "error")
    .mockImplementation(() => undefined);
});

afterEach(() => {
  mounted?.unmount();
  mounted = undefined;
  resetStaffSessionExpiryForTests();
  leaveTheStaffServer();
});

interface FormulaFacts {
  readonly sizes?: readonly {
    readonly widthMm: number;
    readonly amountMinor: number;
  }[];
  readonly anchorHeightMm?: number;
  readonly anchorMinor?: number;
  readonly perStepWiderMinor?: number;
}

function formulaOf(rule: CabinetPriceRule): FormulaFacts {
  return rule.formula as unknown as FormulaFacts;
}

/** A draft that raises every anchor, step-wider and size price of the rule by a hundred lei: a candidate unlike the active. */
function pendingChangesOf(rule: CabinetPriceRule): readonly DraftChange[] {
  const formula = formulaOf(rule);
  const { sizes } = formula;
  if (sizes !== undefined) {
    return sizes.map(
      ({ widthMm, amountMinor }) =>
        ({
          address: { kind: "cabinet-size", ruleId: rule.ruleId, widthMm },
          value: amountMinor + PRICE_STEP_BANI,
        }) as DraftChange,
    );
  }
  return (["anchorMinor", "perStepWiderMinor"] as const).flatMap((field) => {
    const held = formula[field];
    return held !== undefined
      ? [
          {
            address: { kind: "cabinet", ruleId: rule.ruleId, field },
            value: held + PRICE_STEP_BANI,
          } as DraftChange,
        ]
      : [];
  });
}

/** The columns the page owes a rule, each as the request that fills it, by the rule's own shape (A-6, D3D). */
function expectedAsks(
  rule: CabinetPriceRule,
  controls: Omit<PreviewAsk, "material" | "heightMm">,
): readonly PreviewAsk[] {
  const row = pricedRowOf(INDEPENDENT_CATALOGUE, rule.buildId);
  if (row === undefined) throw new Error(`no row for ${rule.buildId}`);
  const formula = formulaOf(rule);
  const wallMm = formula.anchorHeightMm;
  const topHeights = [...INDEPENDENT_CATALOGUE]
    .filter(
      ([buildId, definition]) =>
        definition.band === "top" &&
        pricedRowOf(INDEPENDENT_CATALOGUE, buildId)?.buildId === row.buildId,
    )
    .flatMap(([, definition]) =>
      definition.frameHeightMm === undefined ? [] : [definition.frameHeightMm],
    );
  const topMm = topHeights.length === 0 ? undefined : Math.min(...topHeights);
  if (typeof wallMm === "number" && topMm !== undefined && topMm !== wallMm) {
    return [wallMm, topMm].map((heightMm) => ({
      ...controls,
      material: SAMPLE_PRICE_BOOK.material.defaultTierId,
      heightMm,
    }));
  }
  return MATERIAL_IDS.map((material) => ({ ...controls, material }));
}

function isOn(control: HTMLElement): boolean {
  return control.getAttribute("aria-checked") === "true";
}

async function setHardware(
  container: HTMLElement,
  tierIndex: number | undefined,
): Promise<void> {
  const toggle = switchHolding(container, WITH_HARDWARE);
  if ((tierIndex !== undefined) !== isOn(toggle)) await press(toggle);
  if (tierIndex === undefined) return;
  const radios = allIn<HTMLInputElement>(container, 'input[type="radio"]');
  await press(atIndex(radios, tierIndex));
}

async function setDeep(container: HTMLElement, isDeep: boolean): Promise<void> {
  const toggle = switchHolding(container, DEPTH_SWITCH);
  if (isDeep !== isOn(toggle)) await press(toggle);
}

const MANUFACTURER_RULE_IDS = ALL_RULE_IDS.filter(
  (ruleId) => ruleIn(SAMPLE_PRICE_BOOK, ruleId).suppliedBy !== "customer",
);
const CUSTOMER_RULE_IDS = ALL_RULE_IDS.filter(
  (ruleId) => ruleIn(SAMPLE_PRICE_BOOK, ruleId).suppliedBy === "customer",
);

describe("the book the sweep is built on", () => {
  it("holds both kinds of rule and a hardware class and a material column beyond the first, so the sweep reaches a switch and a column", () => {
    expect(MANUFACTURER_RULE_IDS.length).toBeGreaterThan(15);
    expect(CUSTOMER_RULE_IDS.length).toBeGreaterThanOrEqual(2);
    expect(HARDWARE_IDS.length).toBeGreaterThan(1);
    expect(MATERIAL_IDS.length).toBeGreaterThan(1);
  });
});

describe("every manufacturer rule: each drawn cell is an independently asked preview, active and candidate", () => {
  it.each(MANUFACTURER_RULE_IDS)(
    "%s: every width, column, hardware class and depth, with the draft's candidate in the new column",
    async (ruleId) => {
      const rule = ruleIn(SAMPLE_PRICE_BOOK, ruleId);
      const changes = pendingChangesOf(rule);
      expect(
        changes.length,
        "the draft must differ from the active",
      ).toBeGreaterThan(0);
      const candidate = bookWith(changes);
      mounted = await mountDetail(ruleId, { page: pageOf(changes) });
      const { container } = mounted;
      const toggleDeep = switchHolding(container, DEPTH_SWITCH);
      const deepStates = toggleDeep.disabled ? [false] : [false, true];

      const hardwareChoices: (number | undefined)[] = [
        undefined,
        ...HARDWARE_IDS.keys(),
      ];
      for (const tierIndex of hardwareChoices) {
        await setHardware(container, tierIndex);
        for (const isDeep of deepStates) {
          await setDeep(container, isDeep);
          const controls = {
            isDeep,
            ...(tierIndex === undefined
              ? {}
              : { hardwareTier: atIndex(HARDWARE_IDS, tierIndex) }),
          };
          const asks = expectedAsks(rule, controls);
          const drawn = drawnRows(container);
          const label = `${ruleId} hw=${String(tierIndex)} deep=${String(isDeep)}`;
          const activeRows = asks.map((ask) =>
            independentPreview(SAMPLE_PRICE_BOOK, ruleId, ask),
          );
          const nextRows = asks.map((ask) =>
            independentPreview(candidate, ruleId, ask),
          );
          expect(drawn.length, label).toBe(atIndex(activeRows, 0).length);
          for (const [index, row] of drawn.entries()) {
            expect(row.active, `${label} active @${String(index)}`).toEqual(
              activeRows.map((rows) => lei(atIndex(rows, index).priceMinor)),
            );
            expect(row.next, `${label} new @${String(index)}`).toEqual(
              nextRows.map((rows) => lei(atIndex(rows, index).priceMinor)),
            );
          }
        }
      }
      expect(consoleErrors).not.toHaveBeenCalled();
    },
  );

  it.each(MANUFACTURER_RULE_IDS)(
    "%s: draws no price of 0 lei and no label or sentence that says 0 mm",
    async (ruleId) => {
      mounted = await mountDetail(ruleId);
      const { container } = mounted;
      const cells = allIn(container, "tbody td[data-role]").map((cell) =>
        cell.textContent.trim(),
      );

      expect(cells.length).toBeGreaterThan(0);
      expect(cells).not.toContain(lei(0));
      expect(container.textContent).not.toMatch(/(^|[^\d])0[ \u00a0]mm/);
    },
  );

  it.each(MANUFACTURER_RULE_IDS)(
    "%s: with the draft empty the new column repeats the active one, cell for cell",
    async (ruleId) => {
      mounted = await mountDetail(ruleId);

      for (const row of drawnRows(mounted.container)) {
        expect(row.next).toEqual(row.active);
      }
    },
  );
});

describe("the table's whole-ten-lei prices and its door column (A-1, A-3), for every manufacturer rule", () => {
  it.each(MANUFACTURER_RULE_IDS)(
    "%s: every cell is a whole number of lei ending in a zero, with no bani",
    async (ruleId) => {
      mounted = await mountDetail(ruleId, {
        page: pageOf(pendingChangesOf(ruleIn(SAMPLE_PRICE_BOOK, ruleId))),
      });
      const cells = allIn(mounted.container, "tbody td[data-role]")
        .map((cell) => cell.textContent.trim())
        .filter((text) => text !== "");

      expect(cells.length).toBeGreaterThan(0);
      for (const text of cells) {
        expect(text, "bani in a cell").not.toContain(",");
        const lei = Number(text.replace(/\D/g, ""));
        expect(lei % 10, text).toBe(0);
      }
    },
  );

  it.each(MANUFACTURER_RULE_IDS)(
    "%s: the doors column, where there is one, states the leaves of the body as built at each width, and marks the width the leaves step at",
    async (ruleId) => {
      mounted = await mountDetail(ruleId);
      const [firstAsk] = expectedAsks(ruleIn(SAMPLE_PRICE_BOOK, ruleId), {
        isDeep: false,
      });
      const rows = independentPreview(SAMPLE_PRICE_BOOK, ruleId, {
        material: SAMPLE_PRICE_BOOK.material.defaultTierId,
        isDeep: false,
        ...(firstAsk?.heightMm === undefined
          ? {}
          : { heightMm: firstAsk.heightMm }),
      });
      const doorLabel = roCopy("priceDashboard.cabinet.columnDoors");
      const cells = allIn(
        mounted.container,
        `tbody td[data-label="${doorLabel}"]`,
      ).map((cell) => cell.textContent.trim());

      if (!rows.some(({ isDoorStep }) => isDoorStep)) {
        expect(cells, "a doors column without a step").toEqual([]);
        return;
      }
      expect(cells).toEqual(
        rows.map((row) =>
          row.isDoorStep
            ? roCopy("priceDashboard.cabinet.doorsFromHere", {
                doorCount: row.doorLeaves,
              })
            : roCopy("priceDashboard.cabinet.doorCount", {
                doorCount: row.doorLeaves,
              }),
        ),
      );
    },
  );
});

describe("the depth switch of every rule (A-6), against an independent measurement", () => {
  it.each(ALL_RULE_IDS)(
    "%s: is off exactly for a customer-supplied row or one the measurement says does not deepen, on for every other, wall rows included",
    async (ruleId) => {
      const rule = ruleIn(SAMPLE_PRICE_BOOK, ruleId);
      const pricedAs = pricedRowOf(INDEPENDENT_CATALOGUE, rule.buildId);
      const deepens =
        pricedAs !== undefined && MEASURED_DEEPENING_ROWS.has(pricedAs.buildId);
      mounted = await mountDetail(ruleId);

      const toggle = switchHolding(mounted.container, DEPTH_SWITCH);

      expect(toggle.disabled, ruleId).toBe(
        rule.suppliedBy === "customer" || !deepens,
      );
      if (toggle.disabled) {
        expect(toggle.textContent).toContain(
          roCopy("priceDashboard.cabinet.depthToggleDisabled", {
            deepMm: DEEP_CABINET_DEPTH_MM,
          }),
        );
      }
    },
  );

  it("is on for the wall rows the owner ruled deepen (A-6): a wall cabinet, a lift, an open shelf, and the hood is off", async () => {
    const states: Record<string, boolean> = {};
    for (const ruleId of [
      "cabinet.wall-cabinet",
      "cabinet.wall-lift",
      "cabinet.open-shelf",
      "cabinet.hood",
      "cabinet.fridge-free",
    ]) {
      mounted = await mountDetail(ruleId);
      states[ruleId] = switchHolding(mounted.container, DEPTH_SWITCH).disabled;
      mounted.unmount();
    }
    mounted = undefined;

    expect(states).toEqual({
      "cabinet.wall-cabinet": false,
      "cabinet.wall-lift": false,
      "cabinet.open-shelf": false,
      "cabinet.hood": true,
      "cabinet.fridge-free": true,
    });
  });
});

describe("a customer-supplied rule (the hood, the free-standing fridge)", () => {
  it.each(CUSTOMER_RULE_IDS)(
    "%s: has no field, no table, no Save, no hardware readout, a price of 0 lei, and no write can be made from it",
    async (ruleId) => {
      mounted = await mountDetail(ruleId);
      const { container, server } = mounted;
      const buttons = allIn(container, "button").map((button) =>
        button.textContent.trim(),
      );

      expect(
        allIn(container, "label").filter(
          (label) => (label as HTMLLabelElement).htmlFor !== "",
        ),
      ).toEqual([]);
      expect(
        allIn(container, "input").filter(
          (i) => i.getAttribute("type") !== "radio",
        ),
      ).toEqual([]);
      expect(
        container.querySelector('[data-testid="cabinet-preview"]'),
      ).toBeNull();
      expect(
        container.querySelector('[data-testid="cabinet-price-sentence"]'),
      ).toBeNull();
      expect(buttons).not.toContain(roCopy("priceDashboard.common.save"));
      expect(container.textContent).not.toContain(
        roCopy("priceDashboard.cabinet.hardwareHeading"),
      );
      expect(container.textContent).toContain(lei(0));
      expect(server.calls).toEqual([]);
    },
  );

  it("the hood alone carries the hood's note, and the fridge alone the customer-supplied note", async () => {
    mounted = await mountDetail("cabinet.hood");
    const hood = mounted.container.textContent;
    mounted.unmount();
    mounted = await mountDetail("cabinet.fridge-free");
    const fridge = mounted.container.textContent;

    const hoodNote = roCopy("priceDashboard.cabinet.hoodNote");
    expect(hood).toContain(hoodNote);
    expect(fridge).not.toContain(hoodNote);
    expect(fridge).toContain(roCopy("priceDashboard.cabinet.customerSupplied"));
  });
});

describe("the structural corners (A-7): labelled with the width the body is built at, written at the grid width it is priced at", () => {
  const CORNER_RULE_IDS = ALL_RULE_IDS.filter((ruleId) =>
    ruleId.includes("corner"),
  );

  function roundUpToGrid(widthMm: number): number {
    return Math.ceil(widthMm / 50) * 50;
  }

  it("has the six structural corner rules", () => {
    expect(CORNER_RULE_IDS).toHaveLength(6);
  });

  it.each(CORNER_RULE_IDS)(
    "%s: its one field is labelled with the built width and a write to it names the rounded-up key, never the built width",
    async (ruleId) => {
      const rule = ruleIn(SAMPLE_PRICE_BOOK, ruleId);
      const sizes = formulaOf(rule).sizes ?? [];
      const [only] = sizes;
      expect(sizes).toHaveLength(1);
      mounted = await mountDetail(ruleId);
      const { container, server } = mounted;
      const preview = independentPreview(SAMPLE_PRICE_BOOK, ruleId, {
        material: SAMPLE_PRICE_BOOK.material.defaultTierId,
        isDeep: false,
      });
      const builtMm = atIndex(preview, 0).widthMm;
      const labels = allIn<HTMLLabelElement>(container, "label")
        .filter((label) => label.htmlFor !== "")
        .map((label) => label.textContent.trim());

      expect(preview).toHaveLength(1);
      expect(roundUpToGrid(builtMm)).toBe(only?.widthMm);
      expect(labels).toEqual([
        roCopy("priceDashboard.cabinet.fieldAnchor", { widthMm: builtMm }),
      ]);

      const activeMinor = only?.amountMinor ?? 0;
      typeInto(
        fieldNamed(container, atIndex(labels, 0)),
        String((activeMinor + PRICE_STEP_BANI) / 100),
      );
      await press(buttonNamed(container, roCopy("priceDashboard.common.save")));

      expect(server.calls).toHaveLength(1);
      expect(server.calls[0]).toMatchObject({
        kind: "change",
        request: {
          change: {
            address: { kind: "cabinet-size", ruleId, widthMm: only?.widthMm },
            value: activeMinor + PRICE_STEP_BANI,
          },
        },
      });
    },
  );

  it.each(CORNER_RULE_IDS)(
    "%s: the table names the built width and never the grid width it is keyed at (A-7, D3G)",
    async (ruleId) => {
      mounted = await mountDetail(ruleId);
      const [row] = drawnRows(mounted.container);
      const preview = independentPreview(SAMPLE_PRICE_BOOK, ruleId, {
        material: SAMPLE_PRICE_BOOK.material.defaultTierId,
        isDeep: false,
      });
      const only = atIndex(preview, 0);

      expect(row?.widthText).toContain(String(only.widthMm));
      if (only.pricedAsWidthMm !== only.widthMm) {
        expect(row?.widthText).not.toContain(String(only.pricedAsWidthMm));
      }
    },
  );
});

describe("the hardware readout against what the customer's price adds", () => {
  it.each(MANUFACTURER_RULE_IDS)(
    "%s: names the mechanisms and the amount a kitchen of this one cabinet at its default width is billed for hardware, in the default class",
    async (ruleId) => {
      const rule = ruleIn(SAMPLE_PRICE_BOOK, ruleId);
      mounted = await mountDetail(ruleId);
      const preview = independentPreview(SAMPLE_PRICE_BOOK, ruleId, {
        material: SAMPLE_PRICE_BOOK.material.defaultTierId,
        isDeep: false,
        hardwareTier: SAMPLE_PRICE_BOOK.hardware.defaultTierId,
      });
      const row = pricedRowOf(INDEPENDENT_CATALOGUE, rule.buildId);
      const definition = INDEPENDENT_CATALOGUE.get(rule.buildId);
      const defaultMm =
        row?.definition.defaultWidthMm ?? atIndex(preview, 0).widthMm;
      const atDefault = preview.find(({ widthMm }) => widthMm === defaultMm);
      const billed = hardwareLineMinor(
        priceOneCabinet(
          {
            buildId: rule.buildId,
            widthMm: defaultMm,
            heightMm:
              definition?.nominalHeightMm ??
              (definition?.band === "wall" ? 700 : 820),
            y0Mm: definition?.band === "wall" ? 1400 : 0,
          },
          {
            book: SAMPLE_PRICE_BOOK,
            isDeep: false,
            materialTierId: SAMPLE_PRICE_BOOK.material.defaultTierId,
            hardwareTierId: SAMPLE_PRICE_BOOK.hardware.defaultTierId,
          },
        ),
      );
      const readout = mounted.container.querySelector(
        '[class*="hardware"]',
      )?.textContent;

      expect(row).toBeDefined();
      expect(
        atDefault?.hardwareMinor ?? 0,
        "preview agrees with the query",
      ).toBe(billed);
      if (billed === 0) {
        expect(readout).toContain(
          roCopy("priceDashboard.cabinet.hardwareNone"),
        );
        return;
      }
      expect(readout).toContain(`+${lei(billed)}`);
      const counts = mechanismCountsNamedBy(readout ?? "", defaultMm, billed);
      expect(
        counts,
        "the readout names a count of hinges, drawers and lifts",
      ).toBeDefined();
      const standard = SAMPLE_PRICE_BOOK.hardware.tiers.find(
        ({ tierId }) => tierId === SAMPLE_PRICE_BOOK.hardware.defaultTierId,
      );
      const exactMinor =
        (counts?.hinges ?? 0) * (standard?.perHingeMinor ?? 0) +
        (counts?.drawers ?? 0) * (standard?.perDrawerMinor ?? 0) +
        (counts?.lifts ?? 0) * (standard?.perLiftMinor ?? 0);
      expect(
        roundUpHalfToTenLei(exactMinor),
        "the counts it names are what the customer pays for",
      ).toBe(billed);
    },
  );
});

const MAX_HINGES_SWEPT = 40;
const MAX_DRAWERS_SWEPT = 12;
const MAX_LIFTS_SWEPT = 2;

/** The hinge, drawer and lift counts whose sentence, in the catalogue's words, is the readout: found by saying each aloud. */
function mechanismCountsNamedBy(
  readout: string,
  widthMm: number,
  billedMinor: number,
):
  | {
      readonly hinges: number;
      readonly drawers: number;
      readonly lifts: number;
    }
  | undefined {
  for (let hinges = 0; hinges <= MAX_HINGES_SWEPT; hinges += 1) {
    for (let drawers = 0; drawers <= MAX_DRAWERS_SWEPT; drawers += 1) {
      for (let lifts = 0; lifts <= MAX_LIFTS_SWEPT; lifts += 1) {
        const parts = [
          hinges === 0
            ? undefined
            : roCopy("priceDashboard.cabinet.hingeCount", { count: hinges }),
          drawers === 0
            ? undefined
            : roCopy("priceDashboard.cabinet.slidePairCount", {
                count: drawers,
              }),
          lifts === 0
            ? undefined
            : roCopy("priceDashboard.cabinet.liftCount", { count: lifts }),
        ].filter((part) => part !== undefined);
        if (parts.length === 0) continue;
        const quantities = parts.reduce((head, tail) =>
          roCopy("priceDashboard.cabinet.hardwareJoined", { head, tail }),
        );
        const sentence = roCopy("priceDashboard.cabinet.hardwareLine", {
          widthMm,
          quantities,
          amount: lei(billedMinor),
          className: "Standard",
        });
        if (readout.includes(sentence)) return { hinges, drawers, lifts };
      }
    }
  }
  return undefined;
}

/** Ten lei is 1 000 bani; a half rounds up (ADR 0177 A-1). */
function roundUpHalfToTenLei(minor: number): number {
  const tenLeiMinor = 1000;
  return Math.floor((minor + tenLeiMinor / 2) / tenLeiMinor) * tenLeiMinor;
}

describe("the depth the page states for a cabinet, as built (reported to the logic reviewer, held to the catalogue)", () => {
  const MILLIMETRES_PER_METRE = 1000;

  function occupiedDepthMm(buildId: string, kitchenDepthMm: number): number {
    const definition = buildKitchenLBodyCatalog(kitchenDepthMm).get(buildId);
    if (definition === undefined) throw new Error(`no row for ${buildId}`);
    return Math.round(
      occupiedDepthOfEntryM({ buildId, definition }) * MILLIMETRES_PER_METRE,
    );
  }

  it.each(ALL_RULE_IDS)(
    "%s: names the depth the catalogue gives the body in a kitchen of each depth, customer-supplied rows included",
    async (ruleId) => {
      const rule = ruleIn(SAMPLE_PRICE_BOOK, ruleId);
      mounted = await mountDetail(ruleId);
      const terms = allIn(mounted.container, "dl dt");

      for (const kitchenDepthMm of [
        DEFAULT_CABINET_DEPTH_MM,
        DEEP_CABINET_DEPTH_MM,
      ]) {
        const label = roCopy("priceDashboard.cabinet.depthInKitchen", {
          kitchenDepthMm,
        });
        const term = terms.find(
          (candidate) => candidate.textContent.trim() === label,
        );
        expect(term, `${ruleId} has no "${label}"`).toBeDefined();
        expect(term?.nextElementSibling?.textContent).toContain(
          String(occupiedDepthMm(rule.buildId, kitchenDepthMm)),
        );
      }
    },
  );
});
