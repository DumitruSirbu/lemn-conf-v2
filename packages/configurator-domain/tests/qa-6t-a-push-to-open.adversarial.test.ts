// **Adversarial QA for wave 6T-a — the one push-to-open predicate, attacked from outside its own
// derivation.**
//
// Wave 6T-a moves every customer's hardware line (+640 / +1 920 / +1 600 MDL on the demo, per tier)
// on the strength of one number: the seeded kitchen carries **16** push-to-open fronts. Every test
// in the wave reaches that number through `countHardwareMechanisms`, which is the code the number
// is a claim about. **This file rebuilds it from the fixture's placement list and the catalogue's
// own declarations**, with its own leaf arithmetic and its own reading of ADR 0092 Amendment C, and
// only then compares. If the two derivations disagree the wave is wrong and green.
//
// What it adds beyond the wave's own suite, each because the wave's version stops one step short:
//
// - The **census** is rebuilt rather than asserted, and the 39 of `PUSH_WHEREVER_PERMITTED` with it.
// - The **complementarity** the owner's rule rests on — *"a cabinet with a handle needs no latch"* —
//   is swept over every row at every legal **width and frame height**, not at one nominal height.
// - The **unit seam the domain sweep stops at**: `push-to-open.test.ts` holds the millimetre
//   threshold to the metre one, but the scene reaches the predicate through
//   `toMillimetres(record.frame.y0)`, and nothing sweeps that conversion. It is the link that
//   carries the domain's agreement across the package boundary.
// - **`canHandle` absent rather than false**, which is what a catalogue arriving through the
//   `BodyCatalog` port can be, and which the wave's own doc comment argues is unreachable.
// - **No amount is pinned**: the seeded hardware line is asserted against an arbitrary push rate, so
//   a test that had typed a product of the drafted placeholder would be visible here.
import { fc, test as propertyTest } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import { kindLabel } from "../src/catalog.js";

import { isPushOpenByDefault } from "../src/bands.js";
import { cabinetHandleCount } from "../src/cabinet-handles.js";
import {
  CABINET_SIZED_OPENING_MAX_M,
  HEIGHT_FLEX_MIN_OPENING_MM,
} from "../src/commands/insert-fit.js";
import { MAX_DESIGN_DIMENSION_MM } from "../src/design-bounds.js";
import type { Design, DesignPlacement, Handle } from "../src/design.js";
import { deriveDoorCount } from "../src/door-count.js";
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  KITCHEN_L_PLACEMENTS,
} from "../src/fixtures/kitchen-l-design.js";
import {
  doorLeafCount,
  drawerCount,
  UndeclaredFrontPopulationError,
} from "../src/front-population.js";
import {
  countHardwareMechanisms,
  TALL_DOOR_LEAF_THRESHOLD_MM,
} from "../src/hardware-mechanisms.js";
import { toMetres, toMillimetres } from "../src/millimetres.js";
import type { PriceBook } from "../src/pricing/price-book.js";
import { priceDesign } from "../src/pricing/price-design.js";
import { SAMPLE_PRICE_BOOK } from "../src/pricing/sample-price-book.js";
import { isPushToOpen, TOP_ROW_Y0_MM } from "../src/push-to-open.js";
import {
  projectDesignForDisplay,
  type DisplayEntry,
} from "../src/queries/design-projection.js";
import type { BodyCatalog, BodyDefinition } from "../src/void-engine.js";

const CATALOG = KITCHEN_L_BODY_CATALOG;
const BOOK = SAMPLE_PRICE_BOOK;

const EVERY_TIER_ID = [
  "hardware.standard",
  "hardware.soft-close",
  "hardware.premium",
] as const;

/** §6.5's module line, **written here as its own literal** rather than imported from the module
 *  under test. A gate that reads its threshold out of the code it checks proves only that the code
 *  equals itself. */
const TOP_ROW_FLOOR_MM = 2_200;

function definitionOf(buildId: string): BodyDefinition {
  const definition = CATALOG.get(buildId);
  if (!definition) throw new Error(`the catalogue holds no "${buildId}"`);
  return definition;
}

// ---------------------------------------------------------------------------
// An independent census of the shipped demo.
// ---------------------------------------------------------------------------

interface BodyCensus {
  readonly placementId: string;
  readonly buildId: string;
  readonly y0Mm: number;
  readonly leafHeightsMm: readonly number[];
  readonly drawers: number;
  readonly canHandle: boolean;
  readonly recordedHandle: Handle | undefined;
}

/** **The leaves one placement carries, read straight off the row's declaration** — bands times
 *  leaves per band, band-major, with a width-following row's leaves from `deriveDoorCount`.
 *
 *  Deliberately **not** `doorLeafHeightsMm`: the wave's own count routes through it, so reusing it
 *  would make this census the same derivation twice. `deriveDoorCount` is imported because it is
 *  ADR 0033's threshold rather than 6T-a's arithmetic, and restating it here would be pinning a
 *  different wave's rule inside this file. */
function leafHeightsFor(placement: DesignPlacement): readonly number[] {
  const rule = definitionOf(placement.body.buildId).fronts;
  if (!rule) throw new Error(`"${placement.body.buildId}" declares no fronts`);

  const bandHeightsMm =
    rule.doorBands.measuredFrom === "declared-heights"
      ? rule.doorBands.bandHeightsMm
      : [placement.body.heightMm - rule.doorBands.frameInsetMm];
  const leavesPerBand =
    rule.countedFrom === "leaves-follow-width"
      ? deriveDoorCount(placement.body.widthMm)
      : rule.leavesPerBand;

  return bandHeightsMm.flatMap((bandHeightMm) =>
    Array.from<number>({ length: leavesPerBand }).fill(bandHeightMm),
  );
}

const SEEDED_CENSUS: readonly BodyCensus[] = KITCHEN_L_PLACEMENTS.map(
  (placement) => {
    const definition = definitionOf(placement.body.buildId);
    const rule = definition.fronts;
    if (!rule)
      throw new Error(`"${placement.body.buildId}" declares no fronts`);
    return {
      placementId: placement.id,
      buildId: placement.body.buildId,
      y0Mm: placement.y0Mm,
      leafHeightsMm: leafHeightsFor(placement),
      drawers: rule.drawers,
      canHandle: definition.canHandle,
      recordedHandle: placement.body.handle,
    };
  },
);

/** ADR 0092 decision 3, Amendment C, restated from the ADR's own words rather than called: a front
 *  is push-to-open when its bar is not on it — a recorded mode decides where the definition permits
 *  one, and otherwise the slot does. */
function isPushToOpenByTheRuling(body: BodyCensus): boolean {
  if (body.recordedHandle !== undefined && body.canHandle) {
    return body.recordedHandle === "push";
  }
  return body.y0Mm >= TOP_ROW_FLOOR_MM;
}

function openingFrontsOf(body: BodyCensus): number {
  return body.leafHeightsMm.length + body.drawers;
}

function hingesOf(body: BodyCensus): number {
  return body.leafHeightsMm.reduce(
    (total, leafHeightMm) =>
      total + (leafHeightMm > TALL_DOOR_LEAF_THRESHOLD_MM ? 3 : 2),
    0,
  );
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

const SEEDED_ENTRIES: readonly DisplayEntry[] = projectDesignForDisplay(
  KITCHEN_L_DESIGN,
  CATALOG,
).flatMap((group) => group.entries);

describe("the demo's 16 latches, derived from the fixture rather than from the count", () => {
  /** The census's whole shortcut: no seeded placement records a mode, so the slot arm decides every
   *  one of the 26 and the recorded-mode arm is not exercised by the demo at all. Asserted first,
   *  because everything below reads differently if it is false. */
  it("finds no recorded handle anywhere in the shipped design", () => {
    expect(
      SEEDED_CENSUS.filter((body) => body.recordedHandle !== undefined),
    ).toEqual([]);
    expect(SEEDED_CENSUS.length).toBe(26);
  });

  it("counts 16 latches on 9 bodies, all of them in the top row", () => {
    const latched = SEEDED_CENSUS.filter(isPushToOpenByTheRuling);

    expect(latched.map((body) => body.placementId)).toEqual([
      "p15",
      "p16",
      "p17",
      "p18",
      "p19",
      "p20",
      "p21",
      "p22",
      "p23",
    ]);
    expect(sum(latched.map(openingFrontsOf))).toBe(16);
    for (const body of latched) {
      expect(body.y0Mm).toBeGreaterThanOrEqual(TOP_ROW_FLOOR_MM);
    }
  });

  it("agrees with countHardwareMechanisms on all three quantities", () => {
    expect(countHardwareMechanisms(SEEDED_ENTRIES, CATALOG)).toEqual({
      hinges: sum(SEEDED_CENSUS.map(hingesOf)),
      drawers: sum(SEEDED_CENSUS.map((body) => body.drawers)),
      pushToOpen: sum(
        SEEDED_CENSUS.filter(isPushToOpenByTheRuling).map(openingFrontsOf),
      ),
    });
  });

  /** ADR 0070's two owner-derived columns, reached by this file's own arithmetic. If the census
   *  disagreed with them the census would be the thing that is wrong, not the wave. */
  it("reaches ADR 0070's 74 hinges and 5 drawers by its own arithmetic", () => {
    expect(sum(SEEDED_CENSUS.map(hingesOf))).toBe(74);
    expect(sum(SEEDED_CENSUS.map((body) => body.drawers))).toBe(5);
  });

  it("counts 41 opening fronts in the whole kitchen, of which the 16 are a proper part", () => {
    expect(sum(SEEDED_CENSUS.map(openingFrontsOf))).toBe(41);
  });
});

/** `hardware-tier-reconciliation.test.ts:220` bills `PUSH_WHEREVER_PERMITTED` at 39. It replaced a
 *  fixture that stamped `push` onto bodies whose definitions permit no mode — a direction-B exhibit
 *  wearing a direction-A name — so the replacement is checked for the same fault as well as for its
 *  number. */
describe("a genuine push kitchen bills 39, and is genuinely a push kitchen", () => {
  const STAMPED: readonly BodyCensus[] = SEEDED_CENSUS.map((body) =>
    body.canHandle ? { ...body, recordedHandle: "push" as const } : body,
  );

  it("stamps a mode only where the definition permits one", () => {
    const stampedOnRefusingBodies = STAMPED.filter(
      (body) => body.recordedHandle !== undefined && !body.canHandle,
    );

    expect(stampedOnRefusingBodies).toEqual([]);
  });

  it("derives 39 as 41 opening fronts less the two bars that stay on", () => {
    const unlatched = STAMPED.filter(
      (body) => !isPushToOpenByTheRuling(body) && openingFrontsOf(body) > 0,
    );

    expect(
      unlatched.map((body) => [body.placementId, openingFrontsOf(body)]),
    ).toEqual([
      ["p25", 1],
      ["p9", 1],
    ]);
    expect(
      sum(STAMPED.filter(isPushToOpenByTheRuling).map(openingFrontsOf)),
    ).toBe(39);
  });

  it("agrees with the shipped count on the same design", () => {
    const design: Design = {
      ...KITCHEN_L_DESIGN,
      placements: KITCHEN_L_DESIGN.placements.map((placement) =>
        definitionOf(placement.body.buildId).canHandle
          ? {
              ...placement,
              body: { ...placement.body, handle: "push" as const },
            }
          : placement,
      ),
    };

    expect(
      countHardwareMechanisms(
        projectDesignForDisplay(design, CATALOG).flatMap(
          (group) => group.entries,
        ),
        CATALOG,
      ).pushToOpen,
    ).toBe(39);
  });
});

// ---------------------------------------------------------------------------
// The complementarity the owner's rule rests on.
// ---------------------------------------------------------------------------

/** Every width a row can be built to — an insertable row's declared sizes, a seeded row's
 *  already-built ones (ADR 0011 Gap A), and, for a seeded row the demo does not stand, the sizes of
 *  the §7 entry a §5.4 resize would rebuild it through (`catalogEquivalentId`, whose second fact is
 *  exactly that width set). `base-drawer2-600` is the one row that needs the third arm.
 *
 *  **Throws rather than answering an empty list**, because a row reaching the sweep with no width is
 *  skipped silently, and a sweep that quietly drops a row is the vacuity this file exists to avoid
 *  in the first place. */
function legalWidthsMm(
  buildId: string,
  definition: BodyDefinition,
): readonly number[] {
  if (definition.insertable === true) return definition.sizesMm ?? [];

  const alreadyBuiltMm = [
    ...new Set(
      KITCHEN_L_PLACEMENTS.filter(
        (placement) => placement.body.buildId === buildId,
      ).map((placement) => placement.body.widthMm),
    ),
  ];
  if (alreadyBuiltMm.length > 0) return alreadyBuiltMm;

  const equivalentId = definition.catalogEquivalentId;
  const rebuiltAtMm =
    equivalentId === undefined
      ? []
      : (CATALOG.get(equivalentId)?.sizesMm ?? []);
  if (rebuiltAtMm.length > 0) return rebuiltAtMm;

  throw new Error(`no width to sweep "${buildId}" at`);
}

/** Every frame height a row can be built to: a `heightFlex` row fills any cabinet-sized opening and
 *  falls back to its nominal above the cap, a fixed row is only ever its nominal. This is the axis
 *  the wave's own sweep does not have — `hardware-mechanisms.test.ts:113` takes one height per row —
 *  and it is the axis a `one-band-under-frame` row's leaf count lives on. */
function legalFrameHeightsMm(definition: BodyDefinition): readonly number[] {
  const nominalMm = definition.nominalHeightMm ?? definition.frameHeightMm ?? 0;
  if (definition.heightFlex !== true) return [nominalMm];

  const maxOpeningMm = Math.round(CABINET_SIZED_OPENING_MAX_M * 1000);
  const openings: number[] = [];
  for (
    let heightMm = HEIGHT_FLEX_MIN_OPENING_MM;
    heightMm <= maxOpeningMm;
    heightMm += 1
  ) {
    openings.push(heightMm);
  }
  return [...openings, nominalMm];
}

interface SweptRow {
  readonly buildId: string;
  readonly widthMm: number;
  readonly frameHeightMm: number;
  readonly openingFronts: number;
  readonly cabinetHandles: number;
}

const EVERY_ROW_AT_EVERY_LEGAL_SIZE: readonly SweptRow[] = [...CATALOG].flatMap(
  ([buildId, definition]) =>
    legalWidthsMm(buildId, definition).flatMap((widthMm) =>
      legalFrameHeightsMm(definition).map((frameHeightMm) => {
        const query = {
          buildId,
          rule: definition.fronts,
          widthMm,
          frameHeightMm,
        };
        return {
          buildId,
          widthMm,
          frameHeightMm,
          openingFronts: doorLeafCount(query) + drawerCount(query),
          cabinetHandles: cabinetHandleCount({
            buildId,
            rule: definition.cabinetHandles,
            widthMm,
          }),
        };
      }),
    ),
);

/**
 * **The claim that makes the owner's rule total** (ADR 0092 decision 3, Amendment C): *"when you
 * have a cabinet with handle you don't need a push to open mechanism"* only decides every front if
 * every front has one or the other. A row declaring `NO_CABINET_HANDLES` beside something that opens
 * would have a front with no bar — and, below the top row, no latch either — so nothing would open
 * it, and pricing would bill a mechanism the body does not have or omit one it does.
 *
 * Stated in the direction the ruling needs (**no bar ⇒ nothing opens**) as well as its contrapositive,
 * because the two read differently to whoever adds the next catalogue row.
 */
describe("no catalogue row has a front with neither a bar nor a latch", () => {
  it("sweeps every row of both populations, at every legal width and frame height", () => {
    const sweptIds = new Set(
      EVERY_ROW_AT_EVERY_LEGAL_SIZE.map((row) => row.buildId),
    );

    expect(sweptIds).toEqual(new Set(CATALOG.keys()));
    expect(EVERY_ROW_AT_EVERY_LEGAL_SIZE.length).toBeGreaterThan(1_000);
  });

  it("declares nothing that opens on any row that declares no cabinet handle", () => {
    const barlessWithFronts = EVERY_ROW_AT_EVERY_LEGAL_SIZE.filter(
      (row) => row.cabinetHandles === 0 && row.openingFronts > 0,
    );

    expect(barlessWithFronts).toEqual([]);
  });

  it("declares a cabinet handle on every row that declares something that opens", () => {
    const openingWithoutBars = EVERY_ROW_AT_EVERY_LEGAL_SIZE.filter(
      (row) => row.openingFronts > 0 && row.cabinetHandles === 0,
    );

    expect(openingWithoutBars).toEqual([]);
  });

  /** Not a vacuous sweep in either direction: the catalogue holds rows on both sides, so an
   *  implementation answering one constant would fail one of the two above. */
  it("holds rows on both sides of the question", () => {
    expect(
      EVERY_ROW_AT_EVERY_LEGAL_SIZE.filter((row) => row.cabinetHandles === 0)
        .length,
    ).toBeGreaterThan(0);
    expect(
      new Set(
        EVERY_ROW_AT_EVERY_LEGAL_SIZE.filter(
          (row) => row.openingFronts > 0,
        ).map((row) => row.buildId),
      ).size,
    ).toBeGreaterThan(20);
  });
});

// ---------------------------------------------------------------------------
// The unit seam, across the package boundary.
// ---------------------------------------------------------------------------

/**
 * **The conversion `push-to-open.test.ts`'s sweep stops one step short of.**
 *
 * That file holds `TOP_ROW_Y0_MM` to `bands.ts`'s `TOP_ROW_Y0_M` over every integral millimetre,
 * which settles the two thresholds. It does not settle the **scene's** answer, because
 * `scene-sync.ts` reaches the predicate through `toMillimetres(record.frame.y0)` and a
 * `PlacementRecord`'s `frame.y0` is `toMetres(placement.y0Mm)` — a round trip through a float and
 * back through `Math.round`. Only if that trip is the identity does the domain's agreement carry
 * across the package boundary, and nothing asserted it.
 *
 * The window it would open is real if narrow: a floor of 2 199.6 mm answers `false` in metres
 * (2.1996 < 2.2) and `true` in millimetres (`Math.round` lands it on 2 200). It is unreachable
 * today only because `coordinateMillimetreSchema` is `z.number().int()`, which is a fact about the
 * schema and not about either predicate — so it is the round trip that is asserted here, over the
 * whole coordinate range the schema admits.
 */
describe("the metre frame and the millimetre predicate survive the trip between them", () => {
  propertyTest.prop([fc.integer({ min: 0, max: MAX_DESIGN_DIMENSION_MM })])(
    "returns any legal floor unchanged through metres and back",
    (y0Mm) => {
      expect(toMillimetres(toMetres(y0Mm))).toBe(y0Mm);
    },
  );

  /** The three readings of one floor, held together over the **whole** coordinate range the schema
   *  admits: the document's millimetres, `bands.ts`'s metres, and the millimetres the scene converts
   *  back to. `push-to-open.test.ts` relates the first two and sweeps to 3 000 mm;
   *  `coordinateMillimetreSchema` admits ten times that, and the third reading is the one that
   *  crosses the package boundary. */
  propertyTest.prop([fc.integer({ min: 0, max: MAX_DESIGN_DIMENSION_MM })])(
    "answers the same in millimetres, in metres, and through the scene's frame",
    (y0Mm) => {
      const asDocumented = isPushToOpen({
        y0Mm,
        recordedHandle: undefined,
        canHandle: true,
      });
      const asTheSceneAsksIt = isPushToOpen({
        y0Mm: toMillimetres(toMetres(y0Mm)),
        recordedHandle: undefined,
        canHandle: true,
      });

      expect(asDocumented).toBe(isPushOpenByDefault(toMetres(y0Mm)));
      expect(asTheSceneAsksIt).toBe(asDocumented);
    },
  );

  it("puts the flip between 2199 and 2200 on the scene's own path too", () => {
    const throughTheFrame = (y0Mm: number): boolean =>
      isPushToOpen({
        y0Mm: toMillimetres(toMetres(y0Mm)),
        recordedHandle: undefined,
        canHandle: true,
      });

    expect(throughTheFrame(TOP_ROW_FLOOR_MM - 1)).toBe(false);
    expect(throughTheFrame(TOP_ROW_FLOOR_MM)).toBe(true);
    expect(TOP_ROW_Y0_MM).toBe(TOP_ROW_FLOOR_MM);
  });
});

// ---------------------------------------------------------------------------
// The counting path across the boundary, and direction B where the fixture does not go.
// ---------------------------------------------------------------------------

/** One placement under test, at the floor the case is about. `widthMm` and `heightMm` default to
 *  `wall-corner-return-570`'s built size, which is the row most of these cases stand. */
function entryAt(
  overrides: Partial<DisplayEntry> & { readonly buildId: string },
): DisplayEntry {
  return {
    placementId: "under-test",
    label: kindLabel("under_test"),
    wall: "A",
    band: "wall",
    rawBand: "wall",
    alongMm: 0,
    y0Mm: 0,
    widthMm: 570,
    heightMm: 700,
    ...overrides,
  };
}

describe("the latch count flips at the module line and nowhere else", () => {
  it.each([undefined, "steel", "black"] as const)(
    "sweeps 2190…2210 with handle %s and flips exactly once, at 2200",
    (handle) => {
      const flips: number[] = [];
      let previous = false;
      for (let y0Mm = 2_190; y0Mm <= 2_210; y0Mm += 1) {
        const latched =
          countHardwareMechanisms(
            [
              entryAt({
                buildId: "wall-corner-return-570-top",
                y0Mm,
                heightMm: 400,
                ...(handle === undefined ? {} : { handle }),
              }),
            ],
            CATALOG,
          ).pushToOpen > 0;
        if (latched !== previous) flips.push(y0Mm);
        previous = latched;
      }

      expect(flips).toEqual([TOP_ROW_FLOOR_MM]);
    },
  );
});

/**
 * **Direction B, at the floor the wave's fixture does not reach.**
 *
 * The wave pins direction B with one `wall-corner-return-570` at `y0` 1 500. Amendment C's rule has
 * a second half on the same body — `canHandle` disqualifies the **recorded mode** and nothing more,
 * so at 2 200 the slot arm takes over and the identical body *is* latched. The wave asserts that on
 * the `-top` twin, which is a different catalogue row; asserted here on the **same** row moved up,
 * so what is measured is the floor and not the row.
 */
describe("canHandle disqualifies the recorded mode and never exempts a body", () => {
  const REFUSING_ROW = "wall-corner-return-570";

  it("declares canHandle false beside one leaf and one bar", () => {
    expect(definitionOf(REFUSING_ROW).canHandle).toBe(false);
  });

  it("bills a recorded push below the module line no latch", () => {
    expect(
      countHardwareMechanisms(
        [entryAt({ buildId: REFUSING_ROW, y0Mm: 1_500, handle: "push" })],
        CATALOG,
      ),
    ).toEqual({ hinges: 2, drawers: 0, pushToOpen: 0 });
  });

  it.each(["push", "steel", "black"] as const)(
    "bills the same row at 2200 one latch, whatever mode %s it records",
    (handle) => {
      expect(
        countHardwareMechanisms(
          [entryAt({ buildId: REFUSING_ROW, y0Mm: TOP_ROW_FLOOR_MM, handle })],
          CATALOG,
        ).pushToOpen,
      ).toBe(1);
    },
  );

  it("bills it nothing one millimetre lower, at 2199", () => {
    expect(
      countHardwareMechanisms(
        [
          entryAt({
            buildId: REFUSING_ROW,
            y0Mm: TOP_ROW_FLOOR_MM - 1,
            handle: "push",
          }),
        ],
        CATALOG,
      ).pushToOpen,
    ).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// `canHandle` absent rather than false.
// ---------------------------------------------------------------------------

/**
 * **`DeclaresMechanismFacts.canHandle` is optional, and an optional boolean defaulting to falsy is
 * where a body quietly stops being billed.**
 *
 * `hardware-mechanisms.ts`'s own comment argues the case away: *"every `BodyDefinition` declares the
 * field"*, which is a TypeScript claim, and `BodyCatalog` is the port whose whole reason for existing
 * — stated in `front-population.ts` and `cabinet-handles.ts` alike — is that a definition assembled
 * outside TypeScript reaches no constructor. So a **present** row missing the field is reachable in
 * exactly the way an absent row is, and `doorLeafHeightsMm` does not refuse it: it declares fronts.
 *
 * What matters for this wave is not which way the absence is read but that **both packages read it
 * the same way**, because a divergence is the defect 6T-a exists to remove. `derivePlacementRecords`
 * copies `definition.canHandle` straight onto the record and `scene-sync.ts` hands it to the same
 * predicate, so an absent flag reaches both sides as the same `undefined`. Pinned here as `false`'s
 * equal, which is the shape that keeps the scene and the price together.
 */
describe("a row that declares no canHandle decides nothing the two sides could disagree on", () => {
  /** The shipped row with one field **absent** rather than present and `undefined`, which is what
   *  `exactOptionalPropertyTypes` distinguishes and what a catalogue assembled outside TypeScript
   *  actually arrives as — the same shape `hardware-mechanisms.test.ts` builds one declaration over.
   *
   *  Refuses to build the row if the field was not there to begin with, so a rename cannot turn this
   *  into a pair of identical catalogues quietly agreeing. */
  function catalogWithout(field: "canHandle" | "fronts"): BodyCatalog {
    const declared = definitionOf("wall-corner-return-570");
    if (!(field in declared)) {
      throw new Error(
        `the row declares no "${field}", so removing it proves nothing`,
      );
    }
    const withoutTheField = Object.fromEntries(
      Object.entries(declared).filter(
        ([declaredField]) => declaredField !== field,
      ),
    ) as BodyDefinition;

    return new Map([["under-test", withoutTheField]]);
  }

  it.each([1_500, TOP_ROW_FLOOR_MM])(
    "answers at %s exactly as the same row declaring canHandle false does",
    (y0Mm) => {
      const catalog = catalogWithout("canHandle");
      const withoutTheFlag = countHardwareMechanisms(
        [entryAt({ buildId: "under-test", y0Mm, handle: "push" })],
        catalog,
      );
      const declaringFalse = countHardwareMechanisms(
        [entryAt({ buildId: "wall-corner-return-570", y0Mm, handle: "push" })],
        CATALOG,
      );

      expect(withoutTheFlag).toEqual(declaringFalse);
    },
  );

  /** The absent-row path the wave's comment leans on, checked rather than assumed: the refusal comes
   *  from the front population and arrives before `canHandle` is read at all, in the top row and with
   *  a mode recorded — the corner where a silently-defaulted flag would otherwise decide money. */
  it("refuses a body the catalogue does not hold before any flag is read", () => {
    const absent = entryAt({
      buildId: "absent-from-the-catalogue",
      y0Mm: TOP_ROW_FLOOR_MM,
      handle: "push",
    });

    expect(() => countHardwareMechanisms([absent], new Map())).toThrow(
      UndeclaredFrontPopulationError,
    );
  });

  it("refuses a row that declares no fronts, in the top row, with a mode recorded", () => {
    const catalog = catalogWithout("fronts");
    const entry = entryAt({
      buildId: "under-test",
      y0Mm: TOP_ROW_FLOOR_MM,
      handle: "push",
    });

    expect(() => countHardwareMechanisms([entry], catalog)).toThrow(
      UndeclaredFrontPopulationError,
    );
  });
});

// ---------------------------------------------------------------------------
// No amount is pinned to a drafted placeholder.
// ---------------------------------------------------------------------------

function bookWithPushRate(perPushToOpenMinor: number): PriceBook {
  return {
    ...BOOK,
    hardware: {
      ...BOOK.hardware,
      tiers: BOOK.hardware.tiers.map((tier) => ({
        ...tier,
        perPushToOpenMinor,
      })),
    },
  };
}

function hardwareAmountOf(
  design: Design,
  tierId: string,
  book: PriceBook,
): number {
  const result = priceDesign({
    design,
    catalog: CATALOG,
    book,
    pricingVersion: book.version,
    selections: { hardwareTierId: tierId },
  });
  if (!result.ok) throw new Error(`design refused: ${result.failure.code}`);
  const line = result.priced.lines.find(
    (candidate) => candidate.kind === "hardware",
  );
  if (!line) throw new Error("the design published no hardware line");
  return line.amountMinor;
}

/**
 * **ADR 0092 Amendment C: the three push rates are drafted placeholders and no expectation may be
 * pinned to their magnitudes.** A grep proves nothing — a product typed as `64_000` is
 * indistinguishable from a cabinet rule's `64_000` — so the claim is asserted as behaviour instead:
 * the seeded hardware line must be an affine function of whatever rate the book declares, with the
 * count as its slope and ADR 0070's two owner-derived columns as its intercept.
 */
describe("the seeded hardware line moves with the book's push rate and not with a literal", () => {
  const HINGES_AND_DRAWERS_MINOR: Readonly<Record<string, number>> = {
    "hardware.standard": 130_240 + 320_000,
    "hardware.soft-close": 629_000 + 313_000,
    "hardware.premium": 555_000 + 418_500,
  };

  propertyTest.prop([fc.integer({ min: 0, max: 5_000_000 })])(
    "prices every tier at its two columns plus sixteen times the declared rate",
    (perPushToOpenMinor) => {
      const book = bookWithPushRate(perPushToOpenMinor);

      for (const tierId of EVERY_TIER_ID) {
        expect(hardwareAmountOf(KITCHEN_L_DESIGN, tierId, book)).toBe(
          (HINGES_AND_DRAWERS_MINOR[tierId] ?? 0) + 16 * perPushToOpenMinor,
        );
      }
    },
  );

  /** The intercept is the two columns and not an accident of the drafted rate: at a rate of zero the
   *  line is ADR 0070's own hinge and drawer arithmetic, which is the number the reconciliation
   *  file keeps as a literal for the reason it is owner-derived. */
  it.each(EVERY_TIER_ID)(
    "leaves %s at ADR 0070's two columns when the latch is free",
    (tierId) => {
      expect(
        hardwareAmountOf(KITCHEN_L_DESIGN, tierId, bookWithPushRate(0)),
      ).toBe(HINGES_AND_DRAWERS_MINOR[tierId]);
    },
  );
});

/**
 * **Neither tier ordering is pinned** (ADR 0092 Amendment C). The drafted rates put Hettich above
 * Blum at 16 latches, inverting ADR 0070's own totals table, and the owner has supplied no figures.
 * So the ordering has to be a *consequence* of the book rather than a fact the suite carries — which
 * is demonstrated by showing that both orderings price without refusing, and that the book alone
 * decides which one holds.
 */
describe("which tier is dearest follows the book and is not carried by the suite", () => {
  function dearestTierAt(perPushToOpenMinor: {
    readonly soft: number;
    readonly premium: number;
  }): string {
    const book: PriceBook = {
      ...BOOK,
      hardware: {
        ...BOOK.hardware,
        tiers: BOOK.hardware.tiers.map((tier) =>
          tier.tierId === "hardware.soft-close"
            ? { ...tier, perPushToOpenMinor: perPushToOpenMinor.soft }
            : tier.tierId === "hardware.premium"
              ? { ...tier, perPushToOpenMinor: perPushToOpenMinor.premium }
              : tier,
        ),
      },
    };
    const priced = [...EVERY_TIER_ID]
      .map((tierId) => ({
        tierId,
        amount: hardwareAmountOf(KITCHEN_L_DESIGN, tierId, book),
      }))
      .sort((left, right) => right.amount - left.amount);
    const dearest = priced[0];
    if (!dearest) throw new Error("the book declares no hardware tier");
    return dearest.tierId;
  }

  it("puts Hettich on top at one pair of rates and Blum on top at another", () => {
    expect(dearestTierAt({ soft: 12_000, premium: 10_000 })).toBe(
      "hardware.soft-close",
    );
    expect(dearestTierAt({ soft: 0, premium: 100_000 })).toBe(
      "hardware.premium",
    );
  });
});
