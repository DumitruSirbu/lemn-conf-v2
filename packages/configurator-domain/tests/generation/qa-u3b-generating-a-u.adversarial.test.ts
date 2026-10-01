// M7B U3b adversarial QA (docs/WORKFLOW.md step 3): `generateKitchen` composing a U, held by
// `tests/support/generated-u-findings.ts`, which matches the design to the plan by geometry rather
// than through the log's step links and restates the uppers, the oven and ADR 0108 H3 from the
// records. Targets the implementer's own tests may miss:
// - H3's boundary pairs at 1 mm, through the gate and the generator both (AC2);
// - `cornerDirection` read anywhere outside the room schema's own refusal (AC5);
// - wall A's fill at 302 / 398 / 400 / 598 mm and the upper of exactly its width (N11.9, S2 (3));
// - the hood over a far-wall hob, in a large U and below 10 m (N3r 11);
// - AC6's narrow voids: on wall A's upper rows, a void a wall cabinet cannot take stands over a
//   corner strip or over wall A's bare end, and nowhere else.
import { fc, test as propertyTest } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import {
  APPROVED_ROOM_POLICY,
  deriveColumns,
  derivePlacementRecords,
  generateKitchen,
  isShapeBuildable,
  recomputeVoids,
  uShellFloorRuns,
  type Design,
  type DesignRoom,
  type DesignWall,
} from "../../src/index.js";
import { createFakeProbeFactory } from "../support/fake-probe.js";
import {
  generatedUFindings,
  holdsH3,
} from "../support/generated-u-findings.js";
import { SHELL_CATALOG } from "../support/shell-design.js";
import { uRoom } from "../support/u-plan-fixtures.js";
import { gateVerdictFor } from "../support/u-gate-verdict.js";

const GENERATED_AT = "2026-09-30T08:00:00.000Z";
const WALL_ROW_FLOOR_MM = 1500;
const WALL_CABINET_MIN_MM = 200;
/** The proxy-watching property runs 100 rooms through the generator: 3.0 s alone, 5.1 s inside the
 *  suite's own parallelism, which is the default 5 s limit. */
const WATCHED_GENERATION_TIMEOUT_MS = 20_000;

function generate(room: DesignRoom) {
  return generateKitchen({
    room,
    occurredAt: GENERATED_AT,
    probeAt: createFakeProbeFactory(),
  });
}

function composed(room: DesignRoom) {
  const result = generate(room);
  if (!result.ok) throw new Error(`${JSON.stringify(room)} did not compose`);
  return result;
}

/** A wall's bodies inside its floor run (the corner pieces left out) at one height band, as
 *  `buildId@start-end`, from its corner. */
function bodiesOn(
  design: Design,
  wall: DesignWall,
  band: "floor" | "upper",
): readonly string[] {
  const run = uShellFloorRuns(design.room)[wall];
  return design.placements
    .filter((placement) => placement.wall === wall)
    .filter(
      (placement) =>
        placement.alongMm - placement.body.widthMm / 2 >= run.startMm &&
        placement.alongMm + placement.body.widthMm / 2 <= run.endMm,
    )
    .filter((placement) =>
      band === "floor"
        ? placement.y0Mm < WALL_ROW_FLOOR_MM
        : placement.y0Mm >= WALL_ROW_FLOOR_MM,
    )
    .map((placement) => ({
      buildId: placement.body.buildId,
      startMm: placement.alongMm - placement.body.widthMm / 2,
      endMm: placement.alongMm + placement.body.widthMm / 2,
    }))
    .sort((left, right) => left.startMm - right.startMm)
    .map(
      (body) => `${body.buildId}@${String(body.startMm)}-${String(body.endMm)}`,
    );
}

const NEAR_SIDE_MM = [
  1000, 1599, 1600, 1601, 2999, 3000, 3001, 4000, 4001, 6000,
];
const NEAR_WALL_A_MM = [2700, 2999, 3000, 3001, 4800, 5400, 6000];

const sideArb = fc.oneof(
  fc.integer({ min: 1000, max: 6000 }),
  fc.constantFrom(...NEAR_SIDE_MM),
);

const approvedURoomArb = fc
  .tuple(
    fc.oneof(
      fc.integer({ min: 2700, max: 6000 }),
      fc.constantFrom(...NEAR_WALL_A_MM),
    ),
    sideArb,
    sideArb,
    fc.constantFrom(2200, 2600, 3900),
  )
  .map(([widthMm, depthMm, wallCMm, heightMm]) =>
    uRoom(widthMm, depthMm, wallCMm, heightMm),
  );

describe("a generated U keeps every rule (U3b AC1, AC2, AC5)", () => {
  propertyTest.prop([approvedURoomArb], { numRuns: 400 })(
    "spans equal the plan's, insert_body only, replays, uppers and hood, one oven, bare ends, H3 both ways",
    (room) => {
      const result = generate(room);

      expect(generatedUFindings(room, result)).toStrictEqual([]);
      expect(gateVerdictFor(room).ok).toBe(holdsH3(room));
    },
  );

  propertyTest.prop([approvedURoomArb], { numRuns: 100 })(
    "is byte-identical for the same room and occurredAt",
    (room) => {
      expect(JSON.stringify(generate(room))).toBe(
        JSON.stringify(generate(room)),
      );
    },
  );

  propertyTest.prop([approvedURoomArb], { numRuns: 100 })(
    "never reads cornerDirection outside the room schema's own refusal of it",
    (room) => {
      const readers: string[] = [];
      const noteAReader = (key: string | symbol): void => {
        const stack = new Error().stack ?? "";
        if (key === "cornerDirection" && !stack.includes("/zod/")) {
          readers.push(stack);
        }
      };
      const watched = new Proxy(room, {
        get(target, key, receiver) {
          noteAReader(key);
          return Reflect.get(target, key, receiver) as unknown;
        },
        has(target, key) {
          noteAReader(key);
          return Reflect.has(target, key);
        },
      });

      generate(watched);

      expect(readers).toStrictEqual([]);
    },
    WATCHED_GENERATION_TIMEOUT_MS,
  );

  // Restated at M7B U6 S1 (census D7): the properties above run under the policy the product ships,
  // which states the U since U6.
  it("runs its gate under an approved policy that states the U", () => {
    expect(isShapeBuildable("U", APPROVED_ROOM_POLICY)).toBe(true);
  });
});

describe("H3's boundary pairs at 1 mm: the gate passes iff generation places a sink and a hob (U3b AC2)", () => {
  const pairs: readonly (readonly [string, DesignRoom, DesignRoom])[] = [
    [
      "A 2999/3000 at B = C = 1000",
      uRoom(2999, 1000, 1000),
      uRoom(3000, 1000, 1000),
    ],
    [
      "A 2999/3000 at B = C = 1599",
      uRoom(2999, 1599, 1599),
      uRoom(3000, 1599, 1599),
    ],
    [
      "C 1599/1600 at A 2700, B 6000",
      uRoom(2700, 6000, 1599),
      uRoom(2700, 6000, 1600),
    ],
    [
      "C 1599/1600 at A 2999, B 6000",
      uRoom(2999, 6000, 1599),
      uRoom(2999, 6000, 1600),
    ],
    [
      "B 1599/1600 at A 2700, C 6000",
      uRoom(2700, 1599, 6000),
      uRoom(2700, 1600, 6000),
    ],
    [
      "B = C 1599/1600 at A 2700",
      uRoom(2700, 1599, 1599),
      uRoom(2700, 1600, 1600),
    ],
  ];

  it.each(pairs)(
    "%s: refused, then composed",
    (_name, refusedRoom, composedRoom) => {
      for (const heightMm of [2200, 2600, 3900]) {
        const refused = { ...refusedRoom, heightMm };
        const accepted = { ...composedRoom, heightMm };

        expect(gateVerdictFor(refused)).toStrictEqual({
          ok: false,
          issues: [{ field: "shape", code: "ROOM_TOO_SMALL_FOR_KITCHEN" }],
        });
        expect(generate(refused).ok).toBe(false);
        expect(gateVerdictFor(accepted).ok).toBe(true);
        expect(generatedUFindings(accepted, generate(accepted))).toStrictEqual(
          [],
        );
        expect(generate(accepted).ok).toBe(true);
      }
    },
  );
});

describe("wall A's fill and the upper over it (N11.9, S2 (3))", () => {
  it.each([
    [2702, "1500-1802"],
    [2799, "1500-1898"],
    [2800, "1500-1900"],
    [2999, "1500-2098"],
  ] as const)(
    "%i / 4000 / 3000: a base-cabinet at A %s, and a wall-cabinet of exactly its span",
    (widthMm, span) => {
      const { design } = composed(uRoom(widthMm, 4000, 3000));
      const runA = uShellFloorRuns(uRoom(widthMm, 4000, 3000)).A;

      expect(bodiesOn(design, "A", "floor")).toStrictEqual([
        "base-sink@900-1500",
        `base-cabinet@${span}`,
      ]);
      expect(span.endsWith(`-${String(runA.endMm)}`)).toBe(true);
      expect(bodiesOn(design, "A", "upper")).toStrictEqual([
        "wall-cabinet@900-1500",
        `wall-cabinet@${span}`,
      ]);
    },
  );
});

describe("the hood over a far-wall hob (N3r 11, RQ7)", () => {
  it("3600 / 3500 / 4000 (large, fridge on C): the hood stands over B's hob, and wall A carries no generated upper", () => {
    const { design } = composed(uRoom(3600, 3500, 4000));
    const hob = bodiesOn(design, "B", "floor").find((body) =>
      body.startsWith("base-hob"),
    );

    expect(hob).toBeDefined();
    expect(bodiesOn(design, "B", "upper")).toContain(
      `hood@${hob?.split("@")[1] ?? ""}`,
    );
    expect(bodiesOn(design, "A", "upper")).toStrictEqual([]);
  });

  it("2700 / 4000 / 3100 (below 10 m): the hood over C's hob, and the sink on A keeps its upper", () => {
    const { design } = composed(uRoom(2700, 4000, 3100));

    expect(bodiesOn(design, "C", "floor")).toContain("base-hob-oven@2100-2700");
    expect(bodiesOn(design, "C", "upper")).toContain("hood@2100-2700");
    expect(bodiesOn(design, "A", "upper")).toContain("wall-cabinet@900-1500");
  });
});

const largeURoomArb = fc
  .tuple(
    fc.integer({ min: 2700, max: 6000 }),
    fc.integer({ min: 1000, max: 6000 }),
    fc.integer({ min: 1000, max: 6000 }),
    fc.constantFrom(2200, 2600, 3900),
  )
  .filter(
    ([widthMm, depthMm, wallCMm]) => widthMm + depthMm + wallCMm >= 10_000,
  )
  .map(([widthMm, depthMm, wallCMm, heightMm]) =>
    uRoom(widthMm, depthMm, wallCMm, heightMm),
  );

describe("a large U's back-wall voids a wall cabinet cannot take (U3b AC6)", () => {
  propertyTest.prop([largeURoomArb], { numRuns: 150 })(
    "stand only over a corner strip or over wall A's bare end",
    (room) => {
      const result = generate(room);
      fc.pre(result.ok);
      const { design } = result;
      const records = derivePlacementRecords(design, SHELL_CATALOG);
      const voids = recomputeVoids(
        records,
        deriveColumns(records, design, design.room),
      );
      const runA = uShellFloorRuns(room).A;
      const floorEndMm = Math.max(
        runA.startMm,
        ...design.placements
          .filter((p) => p.wall === "A" && p.y0Mm < WALL_ROW_FLOOR_MM)
          .map((p) => p.alongMm + p.body.widthMm / 2)
          .filter((endMm) => endMm <= runA.endMm),
      );

      const misplaced = voids
        .filter((opening) => opening.wall === "A")
        .filter((opening) => Math.round(opening.y0 * 1000) >= WALL_ROW_FLOOR_MM)
        .map((opening) => ({
          startMm: Math.round((opening.x - opening.w / 2) * 1000),
          endMm: Math.round((opening.x + opening.w / 2) * 1000),
        }))
        .filter((span) => span.endMm - span.startMm < WALL_CABINET_MIN_MM)
        .filter(
          (span) =>
            !(span.endMm <= runA.startMm) &&
            !(span.startMm >= runA.endMm) &&
            !(span.startMm === floorEndMm && span.endMm === runA.endMm),
        );

      expect(misplaced).toStrictEqual([]);
    },
  );
});
