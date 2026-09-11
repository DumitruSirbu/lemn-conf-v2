// **Adversarial QA for the two fixes wave 6W carried into the domain** (ADR 0092 decision 12's
// branch, but neither is about a tier delta).
//
// 1. **`isPushToOpen` normalises `canHandle`.** The claim in the module's own comment is precise and
//    testable: a truthy non-boolean arriving from the `BodyCatalog` port used to give the scene one
//    answer and the price another, and the two now agree. Both halves are asserted here — that the
//    predicate reads a non-boolean as *not* a declaration, and that the value flowing through
//    `countHardwareMechanisms` and the value flowing through the scene's own call site reach the same
//    answer for the same row. Neither the old behaviour nor the new one is assumed: the comparison is
//    against the row declaring `false`, which is the answer the module says it normalises to.
// 2. **`UNBUILDABLE_DOOR_BAND`'s corrected reachability sentence.** It names two rows, excludes a
//    third by a stated reason, and claims no *validated* design can carry one. Each clause is
//    measured over the whole shipped catalogue at every height a placement can be built to, rather
//    than read.
//
// **The asymmetry the first fix leaves behind is recorded rather than asserted away**: `canHandle`
// is now normalised at this boundary and `recordedHandle` is not, so the same untyped port that
// motivates the fix reaches a different rule two operands along.
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

const CATALOG = KITCHEN_L_BODY_CATALOG;

/** §6.5's module line, written as its own literal rather than imported from the module under test —
 *  a gate that reads its threshold out of the code it checks proves only that the code equals
 *  itself. */
const TOP_ROW_FLOOR_MM = 2_200;

function definitionOf(buildId: string): BodyDefinition {
  const definition = CATALOG.get(buildId);
  if (!definition) throw new Error(`the catalogue holds no "${buildId}"`);
  return definition;
}

// ---------------------------------------------------------------------------
// `canHandle` arriving from the port as something other than a boolean.
// ---------------------------------------------------------------------------

/**
 * **The values a `BodyCatalog` assembled outside TypeScript can put in a `boolean` field.**
 *
 * Every one of them is truthy and none of them is `true`, which is the whole class the module's fix
 * is about: a JSON row carrying `1`, a form field carrying `"false"` — truthy, and the most
 * embarrassing of them — and an object, which is what a row assembled by a mapper that forgot to
 * unwrap answers.
 */
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
    y0Mm: input.y0Mm,
    recordedHandle: input.recordedHandle,
    canHandle: input.canHandle as boolean,
  });
}

describe("a canHandle that is truthy but not true declares nothing", () => {
  /** **The rule the module states about itself, at both floors and for both modes.** The answer for
   *  a truthy non-boolean must equal the answer for `false` — the *stricter* of the two, in the
   *  module's own words — and never the answer for `true`, which is the branch it used to take. */
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

  /** The case where reading `false` and reading `true` genuinely differ, so the assertion above is
   *  not comparing two identical answers. A `steel` handle in the top row is push-to-open when the
   *  recorded mode is disqualified and is not when it counts. */
  it("distinguishes the two readings at the one front where they disagree", () => {
    const query = { y0Mm: TOP_ROW_FLOOR_MM, recordedHandle: "steel" } as const;

    expect(pushToOpenWith({ ...query, canHandle: false })).toBe(true);
    expect(pushToOpenWith({ ...query, canHandle: true })).toBe(false);
  });
});

/**
 * **The two answers the fix exists to reconcile, measured against each other.**
 *
 * `hardware-mechanisms.ts` coerces with `=== true` before it calls the predicate; `scene-sync.ts`
 * hands it `PlacementRecord.canHandle`, which `derivePlacementRecords` copies straight off the
 * definition without coercing. So the price and the scene reach the predicate by two routes, and a
 * row whose flag is truthy but not boolean is the input that used to split them.
 */
describe("the price and the scene reach one answer for a row the port typed loosely", () => {
  /** A one-row catalogue built from a shipped `wall-cabinet`, with `canHandle` replaced by a value
   *  no TypeScript caller could have written. The row is otherwise the shipped one, so what differs
   *  between the two sides is the flag alone. */
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

  /** What the **price** answers, through the module that coerces. A latch is billed per opening
   *  front on a push-to-open body, so a non-zero count is the price saying *the bar is not there*. */
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

  /** **The exact front that used to split them**, named so the sweep above is known to contain a
   *  case rather than to be vacuously true: a top-row body recording `steel` on a row whose flag is
   *  truthy but not `true`. The price bills a latch there because it coerces; the scene now hides
   *  the bar for the same reason. */
  it("bills a latch and hides the bar together on the front the two used to split on", () => {
    const catalog = catalogDeclaring(1);
    const entry = entryAt({ y0Mm: TOP_ROW_FLOOR_MM, handle: "steel" });

    expect(priceBillsLatches(catalog, entry)).toBe(true);
    expect(sceneHidesBars(catalog, entry)).toBe(true);
    // And the shipped row, whose flag is a real `true`, still answers the other way — so the fix
    // narrowed a coercion rather than changed the rule.
    expect(
      pushToOpenWith({
        y0Mm: TOP_ROW_FLOOR_MM,
        recordedHandle: "steel",
        canHandle: true,
      }),
    ).toBe(false);
  });

  /**
   * **The half of the boundary the fix did not normalise, recorded as it stands.**
   *
   * The comment's reasoning — *"the catalogue is a supplied port, so a definition can arrive from
   * outside TypeScript"* — applies to the operand beside it too: `recordedHandle` is `Handle |
   * undefined` by type, and the same untyped route can put a `null` or an empty string there. The
   * fix changed that operand from a truthiness test to `!== undefined`, which makes a `null` mode
   * **suppress** the slot rule rather than fall through to it, in the one place the slot rule is
   * what §6.5 ships.
   *
   * Not a defect on any path this repository can reach — `recordedHandle` comes from the design,
   * which is Zod-parsed, while `canHandle` comes from the catalogue, which is not — and pinned here
   * so the difference between the two operands is a recorded fact rather than an oversight
   * rediscovered later.
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

// ---------------------------------------------------------------------------
// `UNBUILDABLE_DOOR_BAND`'s corrected reachability sentence.
// ---------------------------------------------------------------------------

/**
 * **Every clause of `price-lines.ts`'s corrected sentence, measured.**
 *
 * It says four things: the code is reachable from `wall-cabinet` and `wall-lift`; `open-shelf`
 * cannot raise it because it declares no opening fronts; a band at or below `WALL_DOOR_BAND_INSET_MM`
 * needs a frame of 6 mm or less; and a **validated** design cannot carry one because
 * `findBodyDimensionIssues` floors a placement at `MIN_BODY_HEIGHT_MM`. The first two are swept over
 * the whole shipped catalogue rather than asserted of the three rows the sentence names.
 */
describe("the door band refusal is reachable from exactly the rows the code names", () => {
  /** Whether this row raises the error at *some* buildable frame height. Asked of every row in the
   *  catalogue, so a fourth `one-band-under-frame` row added later makes the sentence go red rather
   *  than quietly become incomplete. */
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

  /** **The clause that makes the code a hand-edited-document code rather than a live one**: the
   *  validator's own floor is far above the band inset, so every height a validated design can carry
   *  builds a band. Swept from the floor upward rather than asserted at it, and the floor itself is
   *  asserted to be above the inset so the sweep is not vacuous. */
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

  /** **The demo's own wall rows cannot reach it either**, and that is worth its own line: they
   *  declare their band heights (`wallLeaves`), so the family the sentence names is the *catalogue*
   *  row a document can carry rather than every body a customer sees called a wall cabinet. */
  it("cannot raise it from any build id the seeded design actually stands", () => {
    const standing = [
      ...new Set(
        KITCHEN_L_DESIGN.placements.map((placement) => placement.body.buildId),
      ),
    ];

    expect(standing.filter(raisesAtSomeHeight)).toEqual([]);
  });

  /** A hand-edited document: a wall placement whose build id is the catalogue row the sentence names
   *  and whose height is below the band inset. This is the document class the corrected comment says
   *  the code exists for, and nothing else in this repository produces one. */
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

  /** The validator's floor, driven rather than read: *"no validated design can carry one"* is a
   *  statement about a gate, and the gate is asserted to close at both the band inset and one
   *  millimetre under the floor. */
  it("refuses a placement built below the validator's own floor", () => {
    const codesAt = (heightMm: number) =>
      validateDesignForCatalog(handEditedWallCabinetAt(heightMm), CATALOG).map(
        (issue) => issue.code,
      );

    expect(codesAt(WALL_DOOR_BAND_INSET_MM)).toContain("BODY_TOO_SHORT");
    expect(codesAt(MIN_BODY_HEIGHT_MM - 1)).toContain("BODY_TOO_SHORT");
    // And the floor itself passes the height rule, so the refusal above is the floor and not some
    // other issue the hand-edited document happens to carry.
    expect(codesAt(MIN_BODY_HEIGHT_MM)).not.toContain("BODY_TOO_SHORT");
  });

  /** And the code itself is still produced, from the hand-edited document the sentence says it
   *  exists for — so narrowing the comment did not narrow the path it describes. */
  it("still refuses pricing with UNBUILDABLE_DOOR_BAND for a document no validator passed", () => {
    const result = priceDesign({
      design: handEditedWallCabinetAt(WALL_DOOR_BAND_INSET_MM),
      catalog: CATALOG,
      book: SAMPLE_PRICE_BOOK,
      pricingVersion: SAMPLE_PRICE_BOOK_VERSION,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.failure.code).toBe("UNBUILDABLE_DOOR_BAND");
  });
});
