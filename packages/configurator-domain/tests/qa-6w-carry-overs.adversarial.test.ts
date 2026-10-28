// Two domain fixes (ADR 0092 decision 12's branch; neither is about a tier delta): `isPushToOpen` normalises
// `canHandle`, and `UNBUILDABLE_DOOR_BAND`'s reachability sentence. The normalisation is asserted both ways: a truthy
// non-boolean reads as not a declaration, and the price and scene routes reach one answer for one row. Each
// reachability clause is measured over the whole shipped catalogue. `recordedHandle` is not normalised at this
// boundary; that asymmetry is recorded, not asserted away.
import { describe, expect, it } from "vitest";

import { kindLabel } from "../src/catalog.js";

import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../src/fixtures/kitchen-l-design.js";
import {
  countHardwareMechanisms,
  type HardwareMechanismCounts,
} from "../src/hardware-mechanisms.js";
import {
  doorBandHeightsMm,
  frontPopulationQueryFor,
  UnbuildableDoorBandError,
  WALL_DOOR_BAND_INSET_MM,
} from "../src/front-population.js";
import { MIN_BODY_HEIGHT_MM } from "../src/design-bounds.js";
import { isPushToOpen } from "../src/push-to-open.js";
import { priceDesign } from "../src/pricing/price-design.js";
import {
  SAMPLE_PRICE_BOOK,
  SAMPLE_PRICE_BOOK_VERSION,
} from "../src/pricing/sample-price-book.js";
import { validateDesignForCatalog } from "../src/validate-design.js";
import type { DisplayEntry } from "../src/queries/design-projection.js";
import type { BodyCatalog, BodyDefinition } from "../src/void-engine.js";
import type { Handle } from "../src/design.js";
import { MEASURED_DEEPENING_ROWS } from "./support/deepening-rows.js";
import { NOTHING_DISABLED } from "./support/availability.js";

const CATALOG = KITCHEN_L_BODY_CATALOG;

/** §6.5's module line, written as its own literal rather than imported: a gate reading its threshold out of the
 *  code it checks proves only that the code equals itself. */
const TOP_ROW_FLOOR_MM = 2_200;

function definitionOf(buildId: string): BodyDefinition {
  const definition = CATALOG.get(buildId);
  if (!definition) throw new Error(`the catalogue holds no "${buildId}"`);
  return definition;
}

/** Values a `BodyCatalog` assembled outside TypeScript can put in a `boolean` field: all truthy, none `true` (a JSON
 * `1`, a form field's `"false"`, an object from a mapper that forgot to unwrap). */
const TRUTHY_NON_BOOLEANS: readonly {
  readonly name: string;
  readonly value: unknown;
}[] = [
  { name: "the number 1", value: 1 },
  { name: 'the string "true"', value: "true" },
  { name: 'the string "false"', value: "false" },
  { name: "an object", value: {} },
  { name: "a non-empty array", value: ["yes"] },
];

function pushToOpenWith(input: {
  readonly y0Mm: number;
  readonly recordedHandle: Handle | undefined;
  readonly canHandle: unknown;
}): boolean {
  return isPushToOpen({
    kitchenSettings: {},
    y0Mm: input.y0Mm,
    recordedHandle: input.recordedHandle,
    canHandle: input.canHandle as boolean,
  });
}

describe("a canHandle that is truthy but not true declares nothing", () => {
  /** A truthy non-boolean must answer as `false` does, the stricter of the two, and never as `true`. */
  it.each(TRUTHY_NON_BOOLEANS.map(({ name, value }) => [name, value] as const))(
    "answers for %s exactly as the same front declaring canHandle false does",
    (_name, value) => {
      for (const y0Mm of [0, TOP_ROW_FLOOR_MM - 1, TOP_ROW_FLOOR_MM, 2_500]) {
        for (const recordedHandle of [
          undefined,
          "push",
          "steel",
          "black",
        ] as const) {
          const query = { y0Mm, recordedHandle };

          expect(
            pushToOpenWith({ ...query, canHandle: value }),
            `${String(y0Mm)} / ${String(recordedHandle)}`,
          ).toBe(pushToOpenWith({ ...query, canHandle: false }));
        }
      }
    },
  );

  /** `false` and `true` genuinely differ here, so the assertion above is not comparing two identical answers: a `steel`
   *  handle in the top row is push-to-open only when the recorded mode is disqualified. */
  it("distinguishes the two readings at the one front where they disagree", () => {
    const query = { y0Mm: TOP_ROW_FLOOR_MM, recordedHandle: "steel" } as const;

    expect(pushToOpenWith({ ...query, canHandle: false })).toBe(true);
    expect(pushToOpenWith({ ...query, canHandle: true })).toBe(false);
  });
});

/**
 * `hardware-mechanisms.ts` coerces with `=== true` before calling the predicate, while `scene-sync.ts` hands it
 * `PlacementRecord.canHandle`, copied off the definition without coercing: a truthy non-boolean flag is the input
 * that used to split price from scene.
 */
describe("the price and the scene reach one answer for a row the port typed loosely", () => {
  /** A one-row catalogue from a shipped `wall-cabinet` with `canHandle` replaced by a value no TypeScript caller could
   *  write, so the flag alone differs between the two sides. */
  function catalogDeclaring(canHandle: unknown): BodyCatalog {
    const declared = definitionOf("wall-cabinet");
    expect(declared.canHandle).toBe(true);
    return new Map([
      ["under-test", { ...declared, canHandle } as BodyDefinition],
    ]);
  }

  function entryAt(input: {
    readonly y0Mm: number;
    readonly handle: Handle | undefined;
  }): DisplayEntry {
    return {
      kitchenSettings: {},
      placementId: "p-under-test",
      buildId: "under-test",
      label: kindLabel("under_test"),
      wall: "A",
      band: "wall",
      rawBand: "wall",
      alongMm: 0,
      widthMm: 600,
      heightMm: 700,
      y0Mm: input.y0Mm,
      ...(input.handle === undefined ? {} : { handle: input.handle }),
    };
  }

  /** What the **scene** asks, spelled the way `scene-sync.ts` spells it: the record's flag, raw. */
  function sceneHidesBars(catalog: BodyCatalog, entry: DisplayEntry): boolean {
    const definition = catalog.get(entry.buildId);
    if (!definition) throw new Error("the catalogue lost the row under test");
    return pushToOpenWith({
      y0Mm: entry.y0Mm,
      recordedHandle: entry.handle,
      canHandle: definition.canHandle,
    });
  }

  /** What the **price** answers, through the module that coerces: a non-zero latch count says the bar is not there. */
  function priceBillsLatches(
    catalog: BodyCatalog,
    entry: DisplayEntry,
  ): boolean {
    const counts: HardwareMechanismCounts = countHardwareMechanisms(
      [entry],
      catalog,
    );
    return counts.pushToOpen > 0;
  }

  it.each(TRUTHY_NON_BOOLEANS.map(({ name, value }) => [name, value] as const))(
    "gives the scene and the price the same answer when the row declares %s",
    (_name, value) => {
      const catalog = catalogDeclaring(value);
      for (const y0Mm of [0, TOP_ROW_FLOOR_MM]) {
        for (const handle of [undefined, "push", "steel"] as const) {
          const entry = entryAt({ y0Mm, handle });

          expect(
            sceneHidesBars(catalog, entry),
            `${String(y0Mm)} / ${String(handle)}`,
          ).toBe(priceBillsLatches(catalog, entry));
        }
      }
    },
  );

  /** The exact front that used to split them, named so the sweep is known to contain a case: a top-row body recording
   *  `steel` on a row whose flag is truthy but not `true`. */
  it("bills a latch and hides the bar together on the front the two used to split on", () => {
    const catalog = catalogDeclaring(1);
    const entry = entryAt({ y0Mm: TOP_ROW_FLOOR_MM, handle: "steel" });

    expect(priceBillsLatches(catalog, entry)).toBe(true);
    expect(sceneHidesBars(catalog, entry)).toBe(true);
    // The shipped row, whose flag is a real `true`, still answers the other way: the fix narrowed a coercion only.
    expect(
      pushToOpenWith({
        y0Mm: TOP_ROW_FLOOR_MM,
        recordedHandle: "steel",
        canHandle: true,
      }),
    ).toBe(false);
  });

  /**
   * The half of the boundary the fix did not normalise, recorded as it stands: `recordedHandle` is `Handle | undefined`
   * by type, and a `null` from an untyped route suppresses the slot rule instead of falling through to it. Not a
   * defect on any reachable path (the design is Zod-parsed, the catalogue is not); pinned so the difference between
   * the two operands is a recorded fact.
   */
  it("does not normalise recordedHandle the way it normalises canHandle", () => {
    const topRowWithNullMode = pushToOpenWith({
      y0Mm: TOP_ROW_FLOOR_MM,
      recordedHandle: null as unknown as Handle,
      canHandle: true,
    });
    const topRowWithNoMode = pushToOpenWith({
      y0Mm: TOP_ROW_FLOOR_MM,
      recordedHandle: undefined,
      canHandle: true,
    });

    expect(topRowWithNoMode).toBe(true);
    expect(topRowWithNullMode).toBe(false);
  });
});

/**
 * Every clause of `price-lines.ts`'s reachability sentence, measured: the code is reachable from `wall-cabinet` and
 * `wall-lift`; `open-shelf` cannot raise it because it declares no opening fronts; a band at or below
 * `WALL_DOOR_BAND_INSET_MM` needs a frame no taller than the inset; a validated design cannot carry one because
 * `findBodyDimensionIssues` floors a placement at `MIN_BODY_HEIGHT_MM`.
 */
describe("the door band refusal is reachable from exactly the rows the code names", () => {
  /** Whether this row raises the error at some buildable frame height, asked of every catalogue row so a further
   *  `one-band-under-frame` row makes the sentence go red. */
  function raisesAtSomeHeight(buildId: string): boolean {
    const definition = definitionOf(buildId);
    for (let frameHeightMm = 1; frameHeightMm <= 2_400; frameHeightMm += 1) {
      try {
        doorBandHeightsMm(
          frontPopulationQueryFor({
            body: { buildId, widthMm: 600, heightMm: frameHeightMm },
            definition,
          }),
        );
      } catch (error) {
        if (error instanceof UnbuildableDoorBandError) return true;
      }
    }
    return false;
  }

  it("raises it from wall-cabinet and wall-lift, and from no other row in the catalogue", () => {
    const raising = [...CATALOG.keys()].filter(raisesAtSomeHeight).sort();

    expect(raising).toEqual(["wall-cabinet", "wall-lift"]);
  });

  it("cannot raise it from open-shelf, which answers no door bands at any height", () => {
    const definition = definitionOf("open-shelf");
    for (const heightMm of [1, WALL_DOOR_BAND_INSET_MM, 400, 700]) {
      expect(
        doorBandHeightsMm(
          frontPopulationQueryFor({
            body: { buildId: "open-shelf", widthMm: 600, heightMm },
            definition,
          }),
        ),
        String(heightMm),
      ).toEqual([]);
    }
  });

  it("puts the boundary exactly at a frame of WALL_DOOR_BAND_INSET_MM", () => {
    const buildBand = (heightMm: number) =>
      doorBandHeightsMm(
        frontPopulationQueryFor({
          body: { buildId: "wall-cabinet", widthMm: 600, heightMm },
          definition: definitionOf("wall-cabinet"),
        }),
      );

    expect(() => buildBand(WALL_DOOR_BAND_INSET_MM)).toThrow(
      UnbuildableDoorBandError,
    );
    expect(buildBand(WALL_DOOR_BAND_INSET_MM + 1)).toEqual([1]);
  });

  /** The validator's own floor is far above the band inset, so every height a validated design can carry builds a
   *  band. Swept from the floor upward; the floor is asserted above the inset so the sweep is not vacuous. */
  it("cannot be reached at any height a validated design can carry", () => {
    expect(MIN_BODY_HEIGHT_MM).toBeGreaterThan(WALL_DOOR_BAND_INSET_MM);

    for (const buildId of ["wall-cabinet", "wall-lift"]) {
      const definition = definitionOf(buildId);
      for (
        let heightMm = MIN_BODY_HEIGHT_MM;
        heightMm <= 2_400;
        heightMm += 1
      ) {
        expect(() =>
          doorBandHeightsMm(
            frontPopulationQueryFor({
              body: { buildId, widthMm: 600, heightMm },
              definition,
            }),
          ),
        ).not.toThrow();
      }
    }
  });

  /** The demo's own wall rows declare their band heights (`wallLeaves`), so the family the sentence names is the
   *  catalogue row a document can carry, not every body called a wall cabinet. */
  it("cannot raise it from any build id the seeded design actually stands", () => {
    const standing = [
      ...new Set(
        KITCHEN_L_DESIGN.placements.map((placement) => placement.body.buildId),
      ),
    ];

    expect(standing.filter(raisesAtSomeHeight)).toEqual([]);
  });

  /** A hand-edited document: a wall placement with the catalogue row the sentence names and a height below the band
   *  inset, the only document class the code exists for. */
  function handEditedWallCabinetAt(heightMm: number) {
    const wallPlacement = KITCHEN_L_DESIGN.placements.find(
      (placement) => placement.body.buildId === "wall-2door-600",
    );
    if (!wallPlacement) throw new Error("the fixture stands no wall cabinet");
    return {
      ...KITCHEN_L_DESIGN,
      placements: [
        {
          ...wallPlacement,
          body: { ...wallPlacement.body, buildId: "wall-cabinet", heightMm },
        },
      ],
    };
  }

  /** The validator's floor, driven rather than read: asserted to close at the band inset and one millimetre under the
   *  floor. */
  it("refuses a placement built below the validator's own floor", () => {
    const codesAt = (heightMm: number) =>
      validateDesignForCatalog(handEditedWallCabinetAt(heightMm), CATALOG).map(
        (issue) => issue.code,
      );

    expect(codesAt(WALL_DOOR_BAND_INSET_MM)).toContain("BODY_TOO_SHORT");
    expect(codesAt(MIN_BODY_HEIGHT_MM - 1)).toContain("BODY_TOO_SHORT");
    // The floor itself passes the height rule, so the refusal above is the floor and not another issue.
    expect(codesAt(MIN_BODY_HEIGHT_MM)).not.toContain("BODY_TOO_SHORT");
  });

  /** The code is still produced from the hand-edited document, so narrowing the comment did not narrow the path. */
  it("still refuses pricing with UNBUILDABLE_DOOR_BAND for a document no validator passed", () => {
    const result = priceDesign({
      design: handEditedWallCabinetAt(WALL_DOOR_BAND_INSET_MM),
      catalog: CATALOG,
      book: SAMPLE_PRICE_BOOK,
      pricingVersion: SAMPLE_PRICE_BOOK_VERSION,
      deepeningRows: MEASURED_DEEPENING_ROWS,
      availability: NOTHING_DISABLED,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.failure.code).toBe("UNBUILDABLE_DOOR_BAND");
  });
});
