// ADR 0182: a corner body that carries a bar takes the kitchen's handle and a handle of its own, and nothing else of
// §13.1 moves. Each block is one acceptance criterion of M12 wave W1, held against the catalogue as it was declared
// before the change (`before-adr-0182.ts`) so that a difference is shown to be exactly the one the record names.
// W1-1's block covers the seeded kitchen only; the generated grid and the scene's mesh visibility and material are the
// QA baseline's (the criterion assigns the HEAD capture to QA).
import { describe, expect, it } from "vitest";

import { clearHandle, setHandle } from "../../src/commands/set-appearance.js";
import { setKitchenHandle } from "../../src/commands/set-kitchen-handle.js";
import type { Design, Handle } from "../../src/design.js";
import {
  buildKitchenLBodyCatalog,
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../../src/fixtures/kitchen-l-design.js";
import {
  countHardwareMechanisms,
  doorLeafCount,
  frontPopulationQueryFor,
  projectDesignForDisplay,
  type DisplayEntry,
} from "../../src/index.js";
import { priceDesign } from "../../src/pricing/price-design.js";
import { resolvedHandleAt, TOP_ROW_Y0_MM } from "../../src/push-to-open.js";
import { describeSelection } from "../../src/queries/describe-selection.js";
import { offersFor } from "../../src/queries/offers.js";
import type { BodyCatalog } from "../../src/void-engine.js";
import { SAMPLE_PRICE_BOOK } from "../../src/pricing/sample-price-book.js";
import {
  availabilityOf,
  handle as handleItem,
  priceUnder,
  withBodyOf,
} from "../support/availability-kitchens.js";
import { NOTHING_DISABLED } from "../support/availability.js";
import {
  ALL_CORNER_BUILD_IDS,
  BASE_CORNER_RETURN_BUILD_ID,
  catalogWithCornersTakingNoHandle,
  HANDLE_CARRYING_CORNER_BUILD_IDS,
} from "../support/before-adr-0182.js";
import { OCCURRED_AT } from "../support/commands.js";
import { MEASURED_DEEPENING_ROWS } from "../support/deepening-rows.js";
import { createWorld } from "../support/kitchen-world.js";

const BASE_CORNER_X_ID = "p25";
const BASE_CORNER_RETURN_ID = "p26";
const WALL_CORNER_RETURN_ID = "p9";
const WALL_CORNER_RETURN_TOP_ID = "p21";
const CORNER_PLACEMENT_IDS = [
  BASE_CORNER_X_ID,
  BASE_CORNER_RETURN_ID,
  WALL_CORNER_RETURN_ID,
  WALL_CORNER_RETURN_TOP_ID,
] as const;

/** A floor below the module line and the line itself, written out: the oracle must not read the constant under test. */
const BELOW_THE_TOP_ROW_MM = 1_500;
const ON_THE_TOP_ROW_MM = 2_200;

const HEAD_CATALOG = catalogWithCornersTakingNoHandle();

function entriesOf(design: Design, catalog: BodyCatalog) {
  return projectDesignForDisplay(design, catalog).flatMap(
    (group) => group.entries,
  );
}

function withSettings(settings: NonNullable<Design["settings"]>): Design {
  return { ...KITCHEN_L_DESIGN, settings };
}

describe("W1-1: a kitchen that says nothing, or says what was already drawn, is billed and counted as before", () => {
  const KITCHEN_HANDLES: readonly (Handle | undefined)[] = [undefined, "steel"];
  const TOP_ROW_HANDLES: readonly (Handle | undefined)[] = [undefined, "push"];

  it.each([600, 700])(
    "prices and counts the seeded kitchen at %i mm as it did when the corners took no handle",
    (cabinetDepthMm) => {
      const shipped = buildKitchenLBodyCatalog(cabinetDepthMm);
      const before = catalogWithCornersTakingNoHandle(shipped);

      for (const handle of KITCHEN_HANDLES) {
        for (const topRowHandle of TOP_ROW_HANDLES) {
          const design = withSettings({
            cabinetDepthMm,
            ...(handle === undefined ? {} : { handle }),
            ...(topRowHandle === undefined ? {} : { topRowHandle }),
          });
          const priced = (catalog: BodyCatalog) =>
            priceDesign({
              design,
              catalog,
              book: SAMPLE_PRICE_BOOK,
              pricingVersion: SAMPLE_PRICE_BOOK.version,
              selections: design.settings,
              deepeningRows: MEASURED_DEEPENING_ROWS,
              availability: NOTHING_DISABLED,
            });

          expect(priced(shipped)).toEqual(priced(before));
          const countsPerPlacement = (catalog: BodyCatalog) =>
            entriesOf(design, catalog).map((entry) => [
              entry.placementId,
              countHardwareMechanisms([entry], catalog),
            ]);

          expect(countsPerPlacement(shipped)).toEqual(
            countsPerPlacement(before),
          );
        }
      }
    },
  );
});

describe("W1-2: a corner takes the kitchen's handle, and the top row takes the top row's", () => {
  const resolvedFor = (args: {
    readonly buildId: string;
    readonly y0Mm: number;
    readonly kitchen: { handle?: Handle; topRowHandle?: Handle };
  }) =>
    resolvedHandleAt({
      y0Mm: args.y0Mm,
      recordedHandle: undefined,
      kitchenSettings: args.kitchen,
      canHandle: KITCHEN_L_BODY_CATALOG.get(args.buildId)?.canHandle ?? false,
    });

  it.each(HANDLE_CARRYING_CORNER_BUILD_IDS)(
    "resolves %s to the kitchen's black below the top row and to the top row's push on it",
    (buildId) => {
      const isTopRowTwin = buildId.endsWith("-top");

      expect(
        resolvedFor({
          buildId,
          y0Mm: isTopRowTwin ? ON_THE_TOP_ROW_MM : BELOW_THE_TOP_ROW_MM,
          kitchen: { handle: "black" },
        }),
      ).toBe(isTopRowTwin ? "push" : "black");
    },
  );

  it.each(HANDLE_CARRYING_CORNER_BUILD_IDS)(
    "resolves %s to black on the top row only when the top row's handle is black",
    (buildId) => {
      expect(
        resolvedFor({
          buildId,
          y0Mm: ON_THE_TOP_ROW_MM,
          kitchen: { handle: "black", topRowHandle: "black" },
        }),
      ).toBe("black");
    },
  );

  it("resolves the bar-less return leg to nothing, whatever the kitchen says", () => {
    expect(
      resolvedFor({
        buildId: BASE_CORNER_RETURN_BUILD_ID,
        y0Mm: 0,
        kitchen: { handle: "black" },
      }),
    ).toBeUndefined();
  });
});

describe("W1-3: a push kitchen bills one latch for each corner leaf below the top row, and nothing else moves", () => {
  const design = withSettings({ cabinetDepthMm: 600, handle: "push" });
  const after = entriesOf(design, KITCHEN_L_BODY_CATALOG);
  const before = entriesOf(design, HEAD_CATALOG);

  const cornerLeavesBelowTheTopRow = after
    .filter(
      (entry: DisplayEntry) =>
        HANDLE_CARRYING_CORNER_BUILD_IDS.includes(entry.buildId) &&
        entry.y0Mm < TOP_ROW_Y0_MM,
    )
    .reduce(
      (leaves, entry) =>
        leaves +
        doorLeafCount(
          frontPopulationQueryFor({
            body: entry,
            definition: KITCHEN_L_BODY_CATALOG.get(entry.buildId) ?? {},
          }),
        ),
      0,
    );

  it("counts two corner leaves below the top row: the base X-leg's and the wall return's, one each", () => {
    expect(cornerLeavesBelowTheTopRow).toBe(2);
  });

  it("raises the latch count by exactly those leaves and leaves hinges, drawers, runners and lifts alone", () => {
    const was = countHardwareMechanisms(before, HEAD_CATALOG);
    const is = countHardwareMechanisms(after, KITCHEN_L_BODY_CATALOG);

    expect(is).toEqual({
      ...was,
      pushToOpen: was.pushToOpen + cornerLeavesBelowTheTopRow,
    });
  });

  it("changes no priced line but the hardware line", () => {
    const priced = (catalog: BodyCatalog) => {
      const result = priceDesign({
        design,
        catalog,
        book: SAMPLE_PRICE_BOOK,
        pricingVersion: SAMPLE_PRICE_BOOK.version,
        selections: design.settings,
        deepeningRows: MEASURED_DEEPENING_ROWS,
        availability: NOTHING_DISABLED,
      });
      if (!result.ok) throw new Error(`refused: ${result.failure.code}`);
      return result.priced.lines;
    };
    const lines = (catalog: BodyCatalog) =>
      priced(catalog).filter((line) => line.kind !== "hardware");

    expect(lines(KITCHEN_L_BODY_CATALOG)).toEqual(lines(HEAD_CATALOG));
  });
});

describe("W1-5: a corner's own handle is its own", () => {
  const catalog = KITCHEN_L_BODY_CATALOG;
  const handleOf = (design: Design, placementId: string) =>
    design.placements.find((placement) => placement.id === placementId)?.body
      .handle;

  const metaOf = (design: Design, placementId: string) => {
    const world = createWorld(design, catalog);
    const meta = describeSelection({
      ...world,
      kitchenSettings: design.settings ?? {},
      target: { kind: "placement", id: placementId },
    });
    if (!meta) throw new Error(`${placementId} did not resolve`);
    return meta;
  };

  /** The seeded kitchen after the customer gave the wall corner return a black handle of its own. */
  function designWithTheCornerChoosingBlack(): Design {
    const chosen = setHandle({
      design: KITCHEN_L_DESIGN,
      catalog,
      target: { kind: "placement", id: WALL_CORNER_RETURN_ID },
      handle: "black",
      occurredAt: OCCURRED_AT,
    });
    if (!chosen.ok) throw new Error("the corner refused a handle");
    return chosen.design;
  }

  it("writes body.handle on that placement only", () => {
    const writers = designWithTheCornerChoosingBlack()
      .placements.filter((placement) => placement.body.handle !== undefined)
      .map((placement) => placement.id);

    expect(writers).toEqual([WALL_CORNER_RETURN_ID]);
  });

  it("survives a later change of the kitchen's handle", () => {
    const later = setKitchenHandle({
      design: designWithTheCornerChoosingBlack(),
      handle: "push",
      occurredAt: OCCURRED_AT,
    });
    if (!later.ok) throw new Error("the kitchen refused a handle");

    expect(handleOf(later.design, WALL_CORNER_RETURN_ID)).toBe("black");
    expect(metaOf(later.design, WALL_CORNER_RETURN_ID).handle).toBe("black");
  });

  it("follows the kitchen again once cleared, by deleting the key and not by copying the kitchen's value", () => {
    const kitchen = setKitchenHandle({
      design: designWithTheCornerChoosingBlack(),
      handle: "push",
      occurredAt: OCCURRED_AT,
    });
    if (!kitchen.ok) throw new Error("the kitchen refused a handle");
    const cleared = clearHandle({
      design: kitchen.design,
      catalog,
      target: { kind: "placement", id: WALL_CORNER_RETURN_ID },
      occurredAt: OCCURRED_AT,
    });
    if (!cleared.ok) throw new Error("the corner refused to follow");

    expect(
      cleared.design.placements.find(
        (placement) => placement.id === WALL_CORNER_RETURN_ID,
      )?.body,
    ).not.toHaveProperty("handle");
    expect(metaOf(cleared.design, WALL_CORNER_RETURN_ID).defaultHandle).toBe(
      "push",
    );
  });

  it("is refused by the bar-less return leg, which has nothing to grip", () => {
    const refused = setHandle({
      design: KITCHEN_L_DESIGN,
      catalog,
      target: { kind: "placement", id: BASE_CORNER_RETURN_ID },
      handle: "black",
      occurredAt: OCCURRED_AT,
    });

    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.reason.code).toBe("HANDLE_NOT_SUPPORTED");
    expect(refused.design).toBe(KITCHEN_L_DESIGN);
  });
});

describe("W1-6: no corner gains a swap list, a delete action or a width change", () => {
  const selection = (catalog: BodyCatalog, placementId: string) => {
    const world = createWorld(KITCHEN_L_DESIGN, catalog);
    const target = { kind: "placement", id: placementId } as const;
    const meta = describeSelection({
      ...world,
      kitchenSettings: {},
      target,
    });
    if (!meta) throw new Error(`${placementId} did not resolve`);
    const { canHandle, ...rest } = meta;
    return { canHandle, rest, swapList: offersFor({ ...world, target }) };
  };

  it.each(CORNER_PLACEMENT_IDS)(
    "answers every capability of %s as it did, the handle apart, and offers no swap",
    (placementId) => {
      const now = selection(KITCHEN_L_BODY_CATALOG, placementId);
      const was = selection(HEAD_CATALOG, placementId);

      expect(now.rest).toEqual(was.rest);
      expect(now.swapList).toEqual([]);
      expect(now.rest).toMatchObject({
        canReplace: false,
        canDelete: false,
        canWidth: false,
        fixedWidth: true,
        structuralReason: "corner",
      });
    },
  );

  it("declares canHandle on the five bodies that carry a bar and not on the bar-less return leg", () => {
    expect(
      ALL_CORNER_BUILD_IDS.map((buildId) => [
        buildId,
        KITCHEN_L_BODY_CATALOG.get(buildId)?.canHandle,
      ]),
    ).toEqual([
      ["base-corner-x-900", true],
      ["base-corner-return-320", false],
      ["wall-corner-return-570", true],
      ["wall-corner-return-570-top", true],
      ["wall-corner-x-900", true],
      ["wall-corner-x-900-top", true],
    ]);
  });

  it("moves no other declaration of any of the six", () => {
    for (const buildId of ALL_CORNER_BUILD_IDS) {
      const { canHandle: nowCanHandle, ...now } =
        KITCHEN_L_BODY_CATALOG.get(buildId) ?? {};
      const { canHandle: wasCanHandle, ...was } =
        HEAD_CATALOG.get(buildId) ?? {};

      expect(wasCanHandle).toBe(false);
      expect(typeof nowCanHandle).toBe("boolean");
      expect(now).toEqual(was);
    }
  });
});

describe("W1-7: a handle switched off in availability is refused on a corner as on any cabinet", () => {
  const black = handleItem("black");
  const refusedItems = (design: Design) => {
    const result = priceUnder(availabilityOf([black]), design);
    if (result.ok) return "priced";
    return result.failure.code === "REPLACEMENT_REQUIRED"
      ? result.failure.items
      : result.failure.code;
  };

  it.each([BASE_CORNER_X_ID, WALL_CORNER_RETURN_ID, WALL_CORNER_RETURN_TOP_ID])(
    "refuses REPLACEMENT_REQUIRED naming black for a corner %s carrying its own black",
    (placementId) => {
      expect(
        refusedItems(withBodyOf(placementId, { handle: "black" })),
      ).toEqual([black]);
    },
  );

  it("names nothing on the bar-less return leg, which a hand-edited black cannot reach", () => {
    expect(
      refusedItems(withBodyOf(BASE_CORNER_RETURN_ID, { handle: "black" })),
    ).toBe("priced");
  });

  it("prices the same corner once nothing is switched off", () => {
    expect(
      priceUnder(
        availabilityOf([]),
        withBodyOf(BASE_CORNER_X_ID, { handle: "black" }),
      ).ok,
    ).toBe(true);
  });
});
