// DOM-002: `occupiedDepthM` is the single answer to "how deep is the space this body fills", and
// until wave S9 it answered `frame.d` for everything it did not have a `kind` arm for.
//
// That fallback was wrong for every body it caught — a base run publishing 580 for a 620 mm
// worktop, a pantry 560 for 599, a freestanding fridge 680 for 742, the corner leg 560 for 630 —
// and wrong in the direction that hurts: an opening derived from it is **shallower than the body
// that just vacated it**. This file is the domain half of the fix, which is the declaration and the
// two rules it drives. The other half — that every declared number is the one the built body
// actually measures — is `occupied-depth.parity.test.ts` in `@lemnaria/three-adapter`, because only
// that package has the geometry to check it against.
import { describe, expect, it } from "vitest";

import {
  baseFinishedDepthMm,
  INSERTABLE_BODY_DEFINITIONS,
} from "../src/catalog.js";
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../src/fixtures/kitchen-l-design.js";
import { toMillimetres } from "../src/millimetres.js";
import {
  finishesAtMm,
  NO_FRONT_ASSEMBLY_MM,
  occupiedDepthM,
  shellPlusFrontMm,
  UndeclaredOccupiedDepthError,
  type OccupiedDepthRule,
} from "../src/occupied-depth.js";
import {
  derivePlacementRecords,
  type PlacementRecord,
} from "../src/void-engine.js";
import {
  WALL_FRONT_ASSEMBLY_MM,
  WORKTOP_DEPTH_MM,
} from "../src/worktop-depth.js";

/** A record carrying nothing but the two facts `occupiedDepthM` reads. Every other field is inert
 *  here and is filled with a value that cannot be mistaken for a measurement. */
function recordWith(
  rule: OccupiedDepthRule,
  seatDepthM: number,
): PlacementRecord {
  return {
    id: "probe",
    buildId: "qa-undeclared",
    kind: "base_cabinet",
    frame: { x: 0, z: 0, ry: 0, y0: 0, w: 0.6, h: 0.86, d: seatDepthM },
    occupiedDepth: rule,
    col: "A|0.00",
    wall: "A",
    rotated: false,
    band: "base",
    widthMm: 600,
    heightMm: 860,
    canFinish: true,
    canHandle: true,
    canReplace: true,
    canDelete: true,
    fixedWidth: false,
  };
}

/** A record from a catalogue entry that declares no rule at all — the case TypeScript forbids and a
 *  `BodyCatalog` assembled outside it does not, which is the case that used to silently answer the
 *  seat encoding. */
function withoutDeclaration(record: PlacementRecord): PlacementRecord {
  const { occupiedDepth: undeclared, ...rest } = record;
  expect(undeclared).toBeDefined();
  return rest as PlacementRecord;
}

describe("every catalogue entry declares how deep the space it fills is", () => {
  // Both populations, in one sweep: a seeded entry reaches `deriveColumns` at load exactly as an
  // inserted one does (ADR 0011 Gap A), so an entry that forgot would throw on a customer's reload
  // rather than in a test. The sweep is over the whole map and not a hand-picked list, because
  // which entries were missing a rule is precisely what nobody noticed for two milestones.
  it.each([...KITCHEN_L_BODY_CATALOG.keys()])(
    "%s declares one of the two rules",
    (buildId) => {
      const declared = KITCHEN_L_BODY_CATALOG.get(buildId)?.occupiedDepth;

      expect(declared?.measuredFrom).toMatch(/^(wall-plane|recorded-shell)$/);
    },
  );

  // The sweep above runs over `KITCHEN_L_BODY_CATALOG`, which is both populations merged. This is
  // the guard that it really does contain §7's rows, so a missing insertable entry cannot make it
  // pass by being absent.
  it("sweeps every §7 row a customer can insert", () => {
    const swept = [...KITCHEN_L_BODY_CATALOG.keys()];
    const missing = INSERTABLE_BODY_DEFINITIONS.map(
      ([buildId]) => buildId,
    ).filter((buildId) => !swept.includes(buildId));

    expect(missing).toEqual([]);
  });
});

describe("an undeclared body fails closed", () => {
  // The whole of DOM-002 in one assertion. The old code answered `frame.d` here — a plausible
  // number, silently wrong, and indistinguishable from a correct one downstream.
  it("throws rather than answering with the seat encoding", () => {
    const record = withoutDeclaration(
      recordWith(finishesAtMm(baseFinishedDepthMm(WORKTOP_DEPTH_MM)), 0.58),
    );

    expect(() => occupiedDepthM(record)).toThrow(UndeclaredOccupiedDepthError);
    expect(() => occupiedDepthM(record)).toThrow(/qa-undeclared/);
  });

  it("throws on a rule it does not recognise, rather than falling through", () => {
    const invented = { measuredFrom: "carcass-front", finishedDepthMm: 600 };

    expect(() =>
      occupiedDepthM(
        recordWith(invented as unknown as OccupiedDepthRule, 0.58),
      ),
    ).toThrow(UndeclaredOccupiedDepthError);
  });
});

describe("the two rules", () => {
  it("answers a declared distance from the wall plane, whatever seat is recorded", () => {
    const rule = finishesAtMm(baseFinishedDepthMm(WORKTOP_DEPTH_MM));

    // The seat a base carcass really records, and two it never would: the answer is the body's, not
    // the encoding's, which is what "declared, never inferred" buys.
    for (const seatDepthM of [0.58, 0.4, 0.9]) {
      expect(toMillimetres(occupiedDepthM(recordWith(rule, seatDepthM)))).toBe(
        baseFinishedDepthMm(WORKTOP_DEPTH_MM),
      );
    }
  });

  it("adds the front assembly to the shell a parameterised carcass records", () => {
    const rule = shellPlusFrontMm(WALL_FRONT_ASSEMBLY_MM);

    expect(toMillimetres(occupiedDepthM(recordWith(rule, 0.291)))).toBe(330);
    expect(toMillimetres(occupiedDepthM(recordWith(rule, 0.561)))).toBe(600);
  });

  it("leaves a frontless carcass at the shell it records", () => {
    const rule = shellPlusFrontMm(NO_FRONT_ASSEMBLY_MM);

    expect(toMillimetres(occupiedDepthM(recordWith(rule, 0.33)))).toBe(330);
  });
});

describe("the shipped kitchen, body by body", () => {
  /** The depth every seeded placement fills, keyed by its `buildId`. Stated as one table rather
   *  than as a dozen cases: the finding is that four **families** were wrong at once, so the
   *  regression that matters is a number moving anywhere in this map. */
  const OCCUPIED_DEPTH_MM_BY_BUILD_ID: Readonly<Record<string, number>> = {
    "base-corner-x-900": 630,
    // 600 → 620 (ADR 0135): the return carries the run's 50 mm worktop overhang, so it finishes on
    // the same line as every base run.
    "base-corner-return-320": 620,
    "base-sink-800": 620,
    // ADR 0051 re-baselined this from 632 to an ordinary base run's 620: the 632 was the
    // appliance's own door bar, and inside a housing the machine is now built fully integrated.
    // What stands proud here is the decor door's bar, at 619 — behind the worktop's 620.
    "base-dishwasher-600": 620,
    "base-hob-2drawer-600": 620,
    "base-drawer3-600": 620,
    "tall-oven-tower-600": 638,
    "tall-pantry-600": 599,
    "fridge-free-700": 742,
    "wall-2door-600": 330,
    "wall-corner-return-570": 330,
    "wall-1door-300": 330,
    "wall-2door-800": 330,
    "open-shelf-600": 330,
    "hood-600": 600,
    "wall-2door-600-top": 330,
    "wall-1door-300-top": 330,
    "wall-2door-800-top": 330,
    "wall-corner-return-570-top": 330,
    "wall-2door-600-deep-top": 600,
    "wall-2door-700-over-fridge": 600,
  };

  it("answers the space each shipped body fills, and not its seat", () => {
    const records = derivePlacementRecords(
      KITCHEN_L_DESIGN,
      KITCHEN_L_BODY_CATALOG,
    );
    const occupied: Record<string, number> = {};
    for (const record of records) {
      occupied[record.buildId] = toMillimetres(occupiedDepthM(record));
    }

    expect(occupied).toEqual(OCCUPIED_DEPTH_MM_BY_BUILD_ID);
  });

  // The guard against the table above being read as "the seat, restated". Eight of these bodies
  // record a seat that is not the space they fill, in both directions, and the whole point of the
  // conversion is that the two are different facts.
  it("differs from the recorded seat for every body but the frontless one", () => {
    const records = derivePlacementRecords(
      KITCHEN_L_DESIGN,
      KITCHEN_L_BODY_CATALOG,
    );
    const agreeing = records
      .filter(
        (record) =>
          toMillimetres(record.frame.d) ===
          toMillimetres(occupiedDepthM(record)),
      )
      .map((record) => record.buildId);

    expect([...new Set(agreeing)]).toEqual(["open-shelf-600"]);
  });
});
