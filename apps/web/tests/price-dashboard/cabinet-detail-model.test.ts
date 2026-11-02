// What a cabinet's page states about the cabinet: the fields its rule has, the facts the catalogue gives it, the table
// beside its price and the order a Save sends its writes in. Every price asserted here is the domain's preview, asked
// for independently of the page's own request, so the page cannot be its own oracle.
import { describe, expect, it } from "vitest";

import {
  applyChanges,
  DEEP_CABINET_DEPTH_MM,
  DEFAULT_CABINET_DEPTH_MM,
  previewCabinet,
  SAMPLE_PRICE_BOOK,
  type DraftChange,
  type PriceBook,
} from "@lemnaria/configurator-domain";

import { deriveCabinetDetail } from "@/price-dashboard/cabinet-detail-model";
import {
  bookWithTyped,
  fieldStatesOf,
  judgePrices,
  plannedWritesOf,
} from "@/price-dashboard/cabinet-detail-fields";
import { previewTableOf } from "@/price-dashboard/cabinet-preview-model";
import { priceDashboardCatalogue } from "@/price-dashboard/price-dashboard-catalogue";
import { plainLeiOf } from "@/price-dashboard/price-field-input";

import { MEASURED_DEEPENING_ROWS } from "../support/deepening-rows";
import {
  BASE_RULE,
  CORNER_RULE,
  FRIDGE_RULE,
  HOB_RULE,
  HOOD_RULE,
  PER_SIZE_RULE,
  SINK_RULE,
  THREE_DRAWER_RULE,
  WALL_RULE,
  atIndex,
  ruleOf,
} from "./cabinet-detail-harness";
import { pageOf } from "./dashboard-state-fixture";

function readyDetail(ruleId: string, changes: readonly DraftChange[] = []) {
  const detail = deriveCabinetDetail(pageOf(changes), ruleId);
  if (detail.kind !== "ready") throw new Error(`${ruleId} is ${detail.kind}`);
  return detail;
}

function typedBookOf(
  candidate: PriceBook,
  states: ReturnType<typeof fieldStatesOf>,
): PriceBook {
  const book = bookWithTyped(candidate, states);
  if (book === undefined) throw new Error("the typed amounts make no book");
  return book;
}

const PLAIN = {
  withHardware: false,
  hardwareTierId: SAMPLE_PRICE_BOOK.hardware.defaultTierId,
  isDeepKitchen: false,
};

describe("the fields a rule has", () => {
  it.each([
    [
      BASE_RULE,
      [
        "anchorMinor",
        "perStepWiderMinor",
        "perStepNarrowerMinor",
        "perExtraDoorLeafMinor",
      ],
    ],
    [
      THREE_DRAWER_RULE,
      ["anchorMinor", "perStepWiderMinor", "perStepNarrowerMinor"],
    ],
    [
      WALL_RULE,
      [
        "anchorMinor",
        "perStepWiderMinor",
        "perStepNarrowerMinor",
        "perExtraDoorLeafMinor",
        "perHeightStepMinor",
      ],
    ],
    [PER_SIZE_RULE, ["size-200", "size-300"]],
    [CORNER_RULE, ["size-350"]],
    [HOOD_RULE, []],
    [FRIDGE_RULE, []],
  ])(
    "%s has the fields its shape reads, in the order the book lists them",
    (ruleId, keys) => {
      expect(readyDetail(ruleId).fields.map((field) => field.key)).toEqual(
        keys,
      );
    },
  );

  it("draws a structural corner at the width it is built at while its field is addressed by the grid width it is priced as", () => {
    const [field] = readyDetail(CORNER_RULE).fields;

    expect(field?.address).toMatchObject({
      kind: "cabinet-size",
      widthMm: 350,
    });
    expect(field?.quotedAtMm).toBe(330);
  });

  it("starts each field at the draft's amount and keeps the active one beside it", () => {
    const changes: DraftChange[] = [
      {
        address: { kind: "cabinet", ruleId: BASE_RULE, field: "anchorMinor" },
        value: 410_000,
      },
    ];
    const anchor = readyDetail(BASE_RULE, changes).fields[0];

    expect(anchor).toMatchObject({
      pendingMinor: 410_000,
      activeMinor: 396_000,
    });
  });
});

describe("the facts of a cabinet", () => {
  it("finds the door step of a door cabinet where the catalogue builds its second leaf", () => {
    expect(readyDetail(BASE_RULE).facts.doorStep).toEqual({
      atMm: 500,
      leaves: 1,
      isBelowAnchor: true,
    });
  });

  it("finds no door step on a cabinet that is priced without door leaves", () => {
    expect(readyDetail(THREE_DRAWER_RULE).facts.doorStep).toBeUndefined();
  });

  it("lets only the rows that measure deeper take the depth switch, wall rows included and a customer-supplied one never", () => {
    const can = (ruleId: string) => readyDetail(ruleId).facts.canDeepen;

    expect(can(BASE_RULE)).toBe(true);
    expect(can(WALL_RULE)).toBe(true);
    expect(can(HOOD_RULE)).toBe(false);
    expect(can(FRIDGE_RULE)).toBe(false);
  });

  it("reads the depth switch from the measured set of priced-as rows, not from the rule's own build id", () => {
    for (const rule of SAMPLE_PRICE_BOOK.cabinetRules) {
      const expected =
        rule.suppliedBy !== "customer" &&
        MEASURED_DEEPENING_ROWS.has(rule.buildId);

      expect(readyDetail(rule.ruleId).facts.canDeepen, rule.ruleId).toBe(
        expected,
      );
    }
  });

  it("reads the hardware a cabinet carries at its default width from the preview's hardware part", () => {
    const { hardware } = readyDetail(BASE_RULE).facts;
    const preview = previewCabinet({
      rule: ruleOf(SAMPLE_PRICE_BOOK, BASE_RULE),
      catalog: priceDashboardCatalogue(),
      book: SAMPLE_PRICE_BOOK,
      material: SAMPLE_PRICE_BOOK.material.defaultTierId,
      depth: DEFAULT_CABINET_DEPTH_MM,
      deepeningRows: MEASURED_DEEPENING_ROWS,
      hardwareTier: SAMPLE_PRICE_BOOK.hardware.defaultTierId,
    });

    expect(
      preview.ok &&
        preview.rows.find((row) => row.widthMm === 600)?.hardwareMinor,
    ).toBe(hardware?.amountMinor);
    expect(hardware).toMatchObject({ widthMm: 600, hinges: 4, drawers: 0 });
  });

  it("states no hardware readout for a cabinet the customer supplies", () => {
    expect(readyDetail(HOOD_RULE).facts.hardware).toBeUndefined();
  });

  it("knows which cabinet holds a sink from the catalogue, not from its name", () => {
    expect(readyDetail(SINK_RULE).facts.holdsSink).toBe(true);
    expect(readyDetail(BASE_RULE).facts.holdsSink).toBe(false);
  });

  it("answers not-found for a rule the book does not hold", () => {
    expect(deriveCabinetDetail(pageOf(), "cabinet.stranger")).toEqual({
      kind: "not-found",
    });
  });
});

describe("the table beside the price", () => {
  const typedWith = (
    ruleId: string,
    field: "anchorMinor",
    value: number,
  ): PriceBook => {
    const applied = applyChanges(SAMPLE_PRICE_BOOK, [
      { address: { kind: "cabinet", ruleId, field }, value },
    ]);
    if (!applied.ok) throw new Error("the typed book is refused");
    return applied.book;
  };

  it("holds, in every cell, the preview of the same request asked for independently", () => {
    const typed = typedWith(BASE_RULE, "anchorMinor", 410_000);
    const table = previewTableOf(
      { active: SAMPLE_PRICE_BOOK, typed },
      BASE_RULE,
      PLAIN,
    );

    for (const [index, column] of (table?.columns ?? []).entries()) {
      if (column.kind !== "material")
        throw new Error("a door cabinet has material columns");
      for (const [book, pick] of [
        [SAMPLE_PRICE_BOOK, "activeMinor"],
        [typed, "nextMinor"],
      ] as const) {
        const preview = previewCabinet({
          rule: ruleOf(book, BASE_RULE),
          catalog: priceDashboardCatalogue(),
          book,
          material: column.tierId,
          depth: DEFAULT_CABINET_DEPTH_MM,
          deepeningRows: MEASURED_DEEPENING_ROWS,
        });
        const expected = preview.ok
          ? preview.rows.map((row) => row.priceMinor)
          : [];

        expect(table?.rows.map((row) => row.cells[index]?.[pick])).toEqual(
          expected,
        );
      }
    }
  });

  it("draws a wall cabinet by height, the wall row at its anchor height and the top row at the height the catalogue builds it", () => {
    const table = previewTableOf(
      { active: SAMPLE_PRICE_BOOK, typed: undefined },
      WALL_RULE,
      PLAIN,
    );

    expect(table?.columns).toEqual([
      { kind: "height", heightMm: 700, role: "wall" },
      { kind: "height", heightMm: 400, role: "top" },
    ]);
  });

  it("puts the deep kitchen's percentage into a deepening row's cells, and not into a row that does not deepen", () => {
    const at = (ruleId: string, isDeepKitchen: boolean) =>
      previewTableOf({ active: SAMPLE_PRICE_BOOK, typed: undefined }, ruleId, {
        ...PLAIN,
        isDeepKitchen,
      })?.rows[0]?.cells[0]?.activeMinor;

    expect(at(WALL_RULE, true)).toBeGreaterThan(at(WALL_RULE, false) ?? 0);
    expect(at(HOOD_RULE, true)).toBe(at(HOOD_RULE, false));
  });

  it("adds the hardware part of the preview to every cell when the switch is on", () => {
    const without = previewTableOf(
      { active: SAMPLE_PRICE_BOOK, typed: undefined },
      BASE_RULE,
      PLAIN,
    );
    const withHardware = previewTableOf(
      { active: SAMPLE_PRICE_BOOK, typed: undefined },
      BASE_RULE,
      {
        ...PLAIN,
        withHardware: true,
      },
    );

    const priceAt = (table: typeof without, index: number) => {
      const price = atIndex(
        atIndex(table?.rows ?? [], index).cells,
        0,
      ).activeMinor;
      if (price === undefined)
        throw new Error(`row ${String(index)} has no price`);
      return price;
    };
    expect(without?.rows.length).toBeGreaterThan(0);
    expect(
      (withHardware?.rows ?? []).every(
        (_row, index) => priceAt(withHardware, index) > priceAt(without, index),
      ),
    ).toBe(true);
  });

  it("marks the row where the door leaves step and flags no step on a cabinet priced without them", () => {
    const door = previewTableOf(
      { active: SAMPLE_PRICE_BOOK, typed: undefined },
      BASE_RULE,
      PLAIN,
    );
    const drawers = previewTableOf(
      { active: SAMPLE_PRICE_BOOK, typed: undefined },
      THREE_DRAWER_RULE,
      PLAIN,
    );

    expect(
      door?.rows.filter((row) => row.isDoorStep).map((row) => row.widthMm),
    ).toEqual([500]);
    expect(drawers?.hasDoorColumn).toBe(false);
  });

  it("draws no new price while the typed amounts make no book", () => {
    const table = previewTableOf(
      { active: SAMPLE_PRICE_BOOK, typed: undefined },
      BASE_RULE,
      PLAIN,
    );

    expect(
      table?.rows.every((row) =>
        row.cells.every((cell) => cell.nextMinor === undefined),
      ),
    ).toBe(true);
  });

  it("draws a customer-supplied cabinet's table in zeros, in either depth", () => {
    const table = previewTableOf(
      { active: SAMPLE_PRICE_BOOK, typed: undefined },
      FRIDGE_RULE,
      {
        ...PLAIN,
        isDeepKitchen: true,
      },
    );

    expect(
      table?.rows.flatMap((row) => row.cells.map((cell) => cell.activeMinor)),
    ).toEqual([0, 0, 0]);
    expect(DEEP_CABINET_DEPTH_MM).toBe(700);
  });
});

describe("what typed amounts would price (the narrow-width case)", () => {
  function statesWith(ruleId: string, typed: Record<string, string>) {
    const detail = readyDetail(ruleId);
    return { detail, states: fieldStatesOf(detail.fields, typed) };
  }

  it("names the minus step when it would drive the narrowest width to zero, with that width", () => {
    const { detail, states } = statesWith(BASE_RULE, {
      perStepNarrowerMinor: plainLeiOf(1_800_000),
    });
    const typedRule = ruleOf(typedBookOf(detail.candidate, states), BASE_RULE);

    expect(judgePrices(typedRule, detail.fields)).toEqual({
      kind: "not-positive-at-width",
      fieldKey: "perStepNarrowerMinor",
      widthMm: 200,
    });
  });

  it("accepts the sample as it stands", () => {
    const { detail, states } = statesWith(BASE_RULE, {});
    const typedRule = ruleOf(typedBookOf(detail.candidate, states), BASE_RULE);

    expect(judgePrices(typedRule, detail.fields)).toBeUndefined();
  });

  it("names a zero price of a fixed-size row on that size's field", () => {
    const { detail, states } = statesWith(HOB_RULE, { "size-600": "0" });
    const typedRule = ruleOf(typedBookOf(detail.candidate, states), HOB_RULE);

    expect(judgePrices(typedRule, detail.fields)).toMatchObject({
      fieldKey: "size-600",
    });
  });
});

describe("the order a Save sends its writes in", () => {
  it("sends nothing for an amount equal to the draft's", () => {
    const detail = readyDetail(BASE_RULE);
    const states = fieldStatesOf(detail.fields, {});

    expect(plannedWritesOf(detail.candidate, BASE_RULE, states)).toEqual([]);
  });

  it("sends a typed active amount as a revert and any other as a change", () => {
    const changes: DraftChange[] = [
      {
        address: { kind: "cabinet", ruleId: BASE_RULE, field: "anchorMinor" },
        value: 410_000,
      },
    ];
    const detail = readyDetail(BASE_RULE, changes);
    const states = fieldStatesOf(detail.fields, {
      anchorMinor: plainLeiOf(396_000),
      perStepWiderMinor: plainLeiOf(230_000),
    });

    expect(
      plannedWritesOf(detail.candidate, BASE_RULE, states).map((write) => [
        write.address,
        write.isRevert,
      ]),
    ).toEqual([
      [{ kind: "cabinet", ruleId: BASE_RULE, field: "anchorMinor" }, true],
      [
        { kind: "cabinet", ruleId: BASE_RULE, field: "perStepWiderMinor" },
        false,
      ],
    ]);
  });

  it("puts first the write that keeps every price above zero when the other alone would not", () => {
    // Lowering the anchor first would price the narrowest width below zero; the lower narrow step makes room for it.
    const detail = readyDetail(BASE_RULE);
    const states = fieldStatesOf(detail.fields, {
      anchorMinor: plainLeiOf(150_000),
      perStepNarrowerMinor: plainLeiOf(0),
    });

    const order = plannedWritesOf(detail.candidate, BASE_RULE, states).map(
      (write) => "field" in write.address && write.address.field,
    );

    expect(order).toEqual(["perStepNarrowerMinor", "anchorMinor"]);
  });
});
