// M7C wave C2: `findCornerOverlaps` reads a member-holding column's reach **at the height of the body it is
// compared with** (`validate-design.ts`, `reachAtTheHeightOf`), and the column's deepest seat where no
// member stands there. The rule can only remove a finding, never add one, and must keep reporting an
// overlap that is real.
//
// The oracle below restates the rule as it was — the whole column's deepest seat — in plain arithmetic
// over the document, so the property compares the validator against something that does not share its
// code (engineering-conventions: both sides fed by one source).
import { fc, test as propertyTest } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import { buildLShellDesign, buildUShellDesign } from "../src/index.js";
import type { Design, DesignPlacement, DesignRoom } from "../src/design.js";
import {
  buildKitchenLBodyCatalog,
  KITCHEN_L_DESIGN,
} from "../src/fixtures/kitchen-l-design.js";
import { toMetres } from "../src/millimetres.js";
import { validateDesignForCatalog } from "../src/validate-design.js";
import { deriveColumnKeyAt, type BodyCatalog } from "../src/void-engine.js";

const CODE = "RECORDED_SPAN_OVERLAPS_CORNER_BODY";
const OCCURRED_AT = "2026-10-01T10:00:00.000Z";
const CATALOG = buildKitchenLBodyCatalog(600);

interface Run {
  readonly wall: string;
  readonly startMm: number;
  readonly endMm: number;
  readonly floorMm: number;
  readonly topMm: number;
}

function runOf(entry: EmptyColumnLike | DesignPlacement): Run {
  const isPlacement = "body" in entry;
  const widthMm = isPlacement ? entry.body.widthMm : entry.widthMm;
  return {
    wall: entry.wall,
    startMm: entry.alongMm - widthMm / 2,
    endMm: entry.alongMm + widthMm / 2,
    floorMm: entry.y0Mm,
    topMm: isPlacement ? entry.y0Mm + entry.body.heightMm : entry.topMm,
  };
}

interface EmptyColumnLike {
  readonly wall: string;
  readonly alongMm: number;
  readonly widthMm: number;
  readonly y0Mm: number;
  readonly topMm: number;
}

function seatOf(buildId: string | undefined, catalog: BodyCatalog) {
  return buildId === undefined ? undefined : catalog.get(buildId)?.frameDepthMm;
}

/** The corner overlaps as they were reported before the rule: every recorded entry's reach is its
 *  column's deepest member seat (or the recorded source's seat, or its depth), at every height. */
function findingsAsTheyWere(design: Design, catalog: BodyCatalog): Set<string> {
  const deepest = new Map<string, number>();
  for (const placement of design.placements) {
    const seat = seatOf(placement.body.buildId, catalog);
    if (seat === undefined) continue;
    const key = deriveColumnKeyAt(placement.wall, toMetres(placement.alongMm));
    deepest.set(key, Math.max(deepest.get(key) ?? 0, seat));
  }
  const entries = [
    ...(design.emptyColumns ?? []).map((entry, index) => ({
      path: `emptyColumns.${String(index)}`,
      entry,
    })),
    ...(design.columnExtents ?? []).map((entry, index) => ({
      path: `columnExtents.${String(index)}`,
      entry,
    })),
  ];
  const bodies = design.placements.flatMap((placement) => {
    const seat = seatOf(placement.body.buildId, catalog);
    return seat === undefined ? [] : [{ run: runOf(placement), seat }];
  });
  const found = new Set<string>();
  for (const corner of ["B", "C"] as const) {
    // Wall A's along is measured from A∩B: at A∩C it is reflected about the room's width.
    const mirror = (run: Run): Run =>
      corner === "C" && run.wall === "A"
        ? {
            ...run,
            startMm: design.room.widthMm - run.endMm,
            endMm: design.room.widthMm - run.startMm,
          }
        : run;
    for (const { path, entry } of entries) {
      const key = deriveColumnKeyAt(entry.wall, toMetres(entry.alongMm));
      const reach =
        deepest.get(key) ??
        seatOf(entry.depthFromBuildId, catalog) ??
        entry.depthMm;
      const recorded = mirror(runOf(entry));
      if (recorded.wall !== "A" && recorded.wall !== corner) continue;
      for (const body of bodies) {
        const other = mirror(body.run);
        if (other.wall !== "A" && other.wall !== corner) continue;
        if (other.wall === recorded.wall) continue;
        const reachesInto = (run: Run, depth: number) =>
          run.startMm < depth && run.endMm > 0;
        if (
          reachesInto(recorded, body.seat) &&
          reachesInto(other, reach) &&
          recorded.floorMm < other.topMm &&
          recorded.topMm > other.floorMm
        ) {
          found.add(path);
        }
      }
    }
  }
  return found;
}

function findingPaths(design: Design): Set<string> {
  return new Set(
    validateDesignForCatalog(design, CATALOG)
      .filter((finding) => finding.code === CODE)
      .map((finding) => finding.path),
  );
}

const ROOM_ARB: fc.Arbitrary<DesignRoom> = fc.oneof(
  fc.record({
    shape: fc.constant("L" as const),
    widthMm: fc.integer({ min: 900, max: 5000 }),
    depthMm: fc.integer({ min: 1000, max: 5000 }),
    heightMm: fc.constantFrom(2200, 2600),
  }),
  fc.record({
    shape: fc.constant("U" as const),
    widthMm: fc.integer({ min: 2700, max: 4000 }),
    depthMm: fc.integer({ min: 1000, max: 3000 }),
    wallCMm: fc.integer({ min: 1000, max: 3000 }),
    heightMm: fc.constantFrom(2200, 2600),
  }),
);

const BUILD_IDS = [...CATALOG.keys()];

interface ExtraBody {
  readonly wall: "A" | "B" | "C";
  readonly alongMm: number;
  readonly y0Mm: number;
  readonly buildId: string;
  readonly widthMm: number;
  readonly heightMm: number;
}

const EXTRA_ARB: fc.Arbitrary<ExtraBody> = fc.record({
  wall: fc.constantFrom("A", "B", "C"),
  alongMm: fc.integer({ min: 100, max: 1600 }),
  y0Mm: fc.constantFrom(0, 820, 1500, 2200),
  buildId: fc.constantFrom(...BUILD_IDS),
  widthMm: fc.constantFrom(300, 450, 600, 800, 900),
  heightMm: fc.constantFrom(400, 700, 820, 2200),
});

function shellOf(room: DesignRoom): Design {
  return room.shape === "U"
    ? buildUShellDesign({ room, occurredAt: OCCURRED_AT })
    : buildLShellDesign({ room, occurredAt: OCCURRED_AT });
}

function withExtras(design: Design, extras: readonly ExtraBody[]): Design {
  return {
    ...design,
    placements: [
      ...design.placements,
      ...extras
        .filter((extra) => design.room.shape === "U" || extra.wall !== "C")
        .map(
          (extra, index): DesignPlacement => ({
            id: `zz${String(index)}`,
            wall: extra.wall,
            alongMm: extra.alongMm,
            y0Mm: extra.y0Mm,
            body: {
              buildId: extra.buildId,
              widthMm: extra.widthMm,
              heightMm: extra.heightMm,
            },
          }),
        ),
    ],
  };
}

describe("a member-holding column's reach is read at the height of the body it meets", () => {
  propertyTest.prop([ROOM_ARB, fc.array(EXTRA_ARB, { maxLength: 4 })], {
    numRuns: 250,
  })(
    "reports only overlaps the whole-column reach also reported, over arbitrary documents",
    (room, extras) => {
      const design = withExtras(shellOf(room), extras);

      const reported = findingPaths(design);
      const before = findingsAsTheyWere(design, CATALOG);

      expect([...reported].filter((path) => !before.has(path))).toEqual([]);
    },
  );

  it("agrees with the whole-column rule on the seeded kitchen", () => {
    expect(findingPaths(KITCHEN_L_DESIGN)).toEqual(
      findingsAsTheyWere(KITCHEN_L_DESIGN, CATALOG),
    );
  });

  it("reports a wall-level body standing in the unit's column that really overlaps the side wall's corner cabinet", () => {
    const shell = buildLShellDesign({
      room: { shape: "L", widthMm: 4100, depthMm: 3300, heightMm: 2600 },
      occurredAt: OCCURRED_AT,
    });
    // A wall-row body on wall A in the corner column, as deep as a hood: it joins the unit's column and
    // reaches 700 into wall B's coordinate at the height the side cabinet stands.
    const overlapping: Design = {
      ...shell,
      placements: [
        ...shell.placements,
        {
          id: "zz0",
          wall: "A",
          alongMm: 450,
          y0Mm: 1500,
          body: { buildId: "hood-600", widthMm: 600, heightMm: 700 },
        },
      ],
    };

    expect(validateDesignForCatalog(shell, CATALOG).map((f) => f.code)).toEqual(
      [],
    );
    expect(findingPaths(overlapping).size).toBeGreaterThan(0);
    expect(findingPaths(overlapping)).toEqual(
      findingsAsTheyWere(overlapping, CATALOG),
    );
  });

  it("still reports a hood over a corner on a base-only back wall, where the strip tile exists (backlog 63)", () => {
    const shell = buildUShellDesign({
      room: {
        shape: "U",
        widthMm: 4500,
        depthMm: 3000,
        wallCMm: 3600,
        heightMm: 2600,
      },
      occurredAt: OCCURRED_AT,
    });
    const withAHood: Design = {
      ...shell,
      placements: [
        ...shell.placements,
        {
          id: "zz0",
          wall: "A",
          alongMm: 400,
          y0Mm: 1500,
          body: { buildId: "hood-600", widthMm: 600, heightMm: 700 },
        },
      ],
    };

    expect(findingPaths(withAHood).size).toBeGreaterThan(0);
    expect(findingPaths(withAHood)).toEqual(
      findingsAsTheyWere(withAHood, CATALOG),
    );
  });

  it("is quiet on a column of the base X-leg and the unit over it, which is the case the rule exists for", () => {
    const shell = buildLShellDesign({
      room: { shape: "L", widthMm: 4100, depthMm: 3300, heightMm: 2600 },
      occurredAt: OCCURRED_AT,
    });

    // Not quiet under the whole-column rule: the X-leg's 550 reaches the side cabinet at wall level.
    expect(findingsAsTheyWere(shell, CATALOG).size).toBeGreaterThan(0);
    expect(findingPaths(shell).size).toBe(0);
  });
});
