// Adversarial pass over wave 6A's projection.
//
// The wave's own suite proves the seeded kitchen and one shuffled fixture. This file attacks the
// two claims the suite rests on rather than states: that the comparator is **total** for every
// design the product can hold — not merely for the 25 seeded placements, whose collisions happen to
// be separable — and that the projection's label is the *same fact* the panel header reads, not a
// second derivation that agrees today. It then writes the degenerate documents the suite omits:
// nothing, nothing but space, one body, all three bands at one wall, and both raw wall bands
// interleaved in one group.
//
// The repository sweep here is deliberately wider than the wave's: the criterion says "exactly one
// display-order comparator exists in the **repository**", and the wave's version reads one package.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { fc, test as propertyTest } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import { normaliseBand } from "../../src/bands.js";
import { describeBodyLabelAt } from "../../src/catalog.js";
import type { Design, DesignPlacement, DesignWall } from "../../src/design.js";
import {
  KITCHEN_L_DESIGN,
  KITCHEN_L_PLACEMENTS,
} from "../../src/fixtures/kitchen-l-design.js";
import { describeSelection } from "../../src/queries/describe-selection.js";
import {
  compareDisplayOrder,
  projectDesignForDisplay,
  type DisplayEntry,
  type DisplayGroup,
} from "../../src/queries/design-projection.js";
import { validateDesignForCatalog } from "../../src/validate-design.js";
import {
  derivePlacementRecords,
  UnknownBodyError,
} from "../../src/void-engine.js";
import {
  definitionOf,
  designOf,
  headingsOf,
  PROJECTION_CATALOG as CATALOG,
} from "../support/display-projection.js";

function entriesOf(groups: readonly DisplayGroup[]): readonly DisplayEntry[] {
  return groups.flatMap((group) => group.entries);
}

function placement(
  id: string,
  wall: DesignWall,
  alongMm: number,
  y0Mm: number,
  buildId: string,
  widthMm: number,
  heightMm: number,
): DesignPlacement {
  return { id, wall, alongMm, y0Mm, body: { buildId, widthMm, heightMm } };
}

describe("degenerate documents", () => {
  it("projects a design with no placements to no groups at all", () => {
    expect(projectDesignForDisplay(designOf([]), CATALOG)).toEqual([]);
  });

  it("projects a design of nothing but empty space to no groups", () => {
    // Both halves of the frozen column map (ADR 0044's empty columns and ADR 0053's extents) are
    // space, not bodies. A surface that read either would show the customer a heading over nothing.
    const onlySpace: Design = {
      ...KITCHEN_L_DESIGN,
      placements: [],
      emptyColumns: [
        {
          wall: "A",
          alongMm: 1300,
          widthMm: 600,
          y0Mm: 0,
          topMm: 2600,
          depthMm: 580,
        },
        {
          wall: "B",
          alongMm: 900,
          widthMm: 400,
          y0Mm: 0,
          topMm: 2600,
          depthMm: 580,
        },
      ],
      columnExtents: [
        {
          wall: "A",
          alongMm: 300,
          widthMm: 600,
          y0Mm: 0,
          topMm: 2600,
          depthMm: 580,
        },
      ],
    };

    expect(projectDesignForDisplay(onlySpace, CATALOG)).toEqual([]);
  });

  it("projects one placement to one group holding one entry", () => {
    const groups = projectDesignForDisplay(
      designOf([placement("only", "B", 1200, 1500, "wall-cabinet", 600, 700)]),
      CATALOG,
    );

    expect(headingsOf(groups)).toEqual(["B·wall"]);
    expect(groups[0]?.entries.map((entry) => entry.placementId)).toEqual([
      "only",
    ]);
  });

  it("orders all three bands at one wall from the floor up", () => {
    // Band rank, not insertion order: the document lists them column, wall, base.
    const groups = projectDesignForDisplay(
      designOf([
        placement("c", "A", 900, 0, "tall-pantry", 600, 2200),
        placement("w", "A", 300, 1500, "wall-cabinet", 600, 700),
        placement("b", "A", 300, 0, "base-cabinet", 600, 820),
      ]),
      CATALOG,
    );

    expect(headingsOf(groups)).toEqual(["A·base", "A·wall", "A·column"]);
  });

  it("reads one group row by row, whatever each body's raw band is", () => {
    // The criterion's real shape: not "top folds to wall" as a label, but that the two raw bands
    // are indistinguishable once grouped. ADR 0063's order is height then position,
    // so the whole hanging row reads left to right before the whole top row — and a raw `top` body
    // hung at the hanging row's height sorts *inside* that row, which is what proves the raw band
    // is not a key.
    const groups = projectDesignForDisplay(
      designOf([
        placement("wall-late", "A", 1500, 1500, "wall-2door-600", 600, 700),
        placement("top-early", "A", 200, 2200, "wall-2door-600-top", 600, 400),
        placement("wall-early", "A", 900, 1500, "wall-2door-800", 800, 700),
        placement("top-late", "A", 2100, 2200, "wall-2door-800-top", 800, 400),
        placement(
          "top-hung-low",
          "A",
          600,
          1500,
          "wall-2door-600-top",
          600,
          400,
        ),
      ]),
      CATALOG,
    );

    expect(headingsOf(groups)).toEqual(["A·wall"]);
    expect(groups[0]?.entries.map((entry) => entry.placementId)).toEqual([
      "top-hung-low",
      "wall-early",
      "wall-late",
      "top-early",
      "top-late",
    ]);
  });

  it("names the missing id in the failure rather than omitting the body", () => {
    const design = designOf([
      placement("kept", "A", 300, 0, "base-cabinet", 600, 820),
      placement("lost", "A", 900, 0, "not-in-any-catalogue", 600, 820),
    ]);

    expect(() => projectDesignForDisplay(design, CATALOG)).toThrow(
      UnknownBodyError,
    );
    expect(() => projectDesignForDisplay(design, CATALOG)).toThrow(
      /not-in-any-catalogue/,
    );
  });
});

describe("the label is the panel header's label, not a second derivation", () => {
  it("agrees with describeSelection on every seeded placement", () => {
    // The wave's own test compares the projection to `describeBodyLabelAt`, which is the function
    // the projection calls — it cannot catch the two surfaces disagreeing. This compares the
    // projection to the *other reader* of that function, which is what the criterion asks.
    const records = derivePlacementRecords(KITCHEN_L_DESIGN, CATALOG);
    const projected = new Map(
      entriesOf(projectDesignForDisplay(KITCHEN_L_DESIGN, CATALOG)).map(
        (entry) => [entry.placementId, entry.label],
      ),
    );

    expect(projected.size).toBe(KITCHEN_L_PLACEMENTS.length);
    for (const record of records) {
      const meta = describeSelection({
        records,
        voids: [],
        catalog: CATALOG,
        target: { kind: "placement", id: record.id },
      });
      expect([record.id, projected.get(record.id)]).toEqual([
        record.id,
        meta?.label,
      ]);
    }
  });

  it("reads a seeded pantry and its migrated equivalent exactly as the header does", () => {
    // Backlog entry 20, stated as a parity check rather than as a rename: a resize migrates
    // `tall-pantry-600` to `tall-pantry`, and the customer sees the name change. What must NOT
    // happen is the two *surfaces* differing at either end of that migration.
    const before = designOf([
      placement("p", "B", 1800, 0, "tall-pantry-600", 600, 2200),
    ]);
    const after = designOf([
      placement("p", "B", 1800, 0, "tall-pantry", 600, 2200),
    ]);

    for (const design of [before, after]) {
      const records = derivePlacementRecords(design, CATALOG);
      const header = describeSelection({
        records,
        voids: [],
        catalog: CATALOG,
        target: { kind: "placement", id: "p" },
      });
      const projectedLabel = projectDesignForDisplay(design, CATALOG)[0]
        ?.entries[0]?.label;

      expect(projectedLabel).toBe(header?.label);
    }

    // And the migration is real, so the parity above is not two identical strings by accident.
    expect(projectDesignForDisplay(before, CATALOG)[0]?.entries[0]?.label).toBe(
      "Coloană",
    );
    expect(projectDesignForDisplay(after, CATALOG)[0]?.entries[0]?.label).toBe(
      "Coloană cămară 2 uși",
    );
  });

  it("follows the width across the whole door-count transition, not just 400 and 600", () => {
    // ADR 0035 decision 4's half-open bound: 499 is one door, 500 is two. A projection that copied
    // the count from anywhere but the current width is wrong exactly here and nowhere else.
    const labelAt = (widthMm: number): string | undefined =>
      projectDesignForDisplay(
        designOf([
          placement("p", "A", 900, 1500, "wall-cabinet", widthMm, 700),
        ]),
        CATALOG,
      )[0]?.entries[0]?.label;

    expect([labelAt(499), labelAt(500)]).toEqual([
      "Corp suspendat 1 ușă",
      "Corp suspendat 2 uși",
    ]);
    for (const widthMm of [200, 300, 450, 470, 550, 600, 750, 800]) {
      expect([widthMm, labelAt(widthMm)]).toEqual([
        widthMm,
        describeBodyLabelAt(definitionOf("wall-cabinet"), widthMm),
      ]);
    }
  });
});

/** A body a customer can insert at any of the three bands, so a generated design is a document the
 *  product could hold rather than an arbitrary bag of ids. */
const INSERTABLE_BY_BAND = {
  base: "base-cabinet",
  wall: "wall-cabinet",
  column: "tall-pantry",
} as const;

/** Both raw bands that normalise to `wall`, so a generated design mixes them in one group. */
const BUILD_IDS = [
  ...Object.values(INSERTABLE_BY_BAND),
  "wall-2door-600-top",
  "wall-2door-800-top",
  "base-sink-800",
  "tall-oven-tower-600",
] as const;

const arbitraryPlacements = fc
  .uniqueArray(
    fc.string({ minLength: 1, maxLength: 4, unit: "grapheme-ascii" }),
    {
      minLength: 1,
      maxLength: 12,
    },
  )
  .chain((ids) =>
    fc.tuple(
      ...ids.map((id) =>
        fc.record({
          id: fc.constant(id),
          wall: fc.constantFrom<DesignWall>("A", "B"),
          // A coarse ladder, so collisions on `alongMm` and on `y0Mm` are common rather than
          // astronomically rare — the tie-break keys are only exercised by a collision.
          alongMm: fc.constantFrom(0, 300, 300, 900, 1500),
          y0Mm: fc.constantFrom(0, 0, 1500, 1500, 2200),
          body: fc.record({
            buildId: fc.constantFrom(...BUILD_IDS),
            widthMm: fc.constantFrom(300, 400, 499, 500, 600, 800),
            heightMm: fc.constantFrom(400, 700, 820, 2200),
          }),
        }),
      ),
    ),
  );

describe("the order is a function of the design, over generated documents", () => {
  propertyTest.prop([arbitraryPlacements])(
    "compares any two distinct entries strictly, in both directions",
    (placements) => {
      // Totality, attacked where the seeded fixture cannot reach: generated documents collide on
      // wall, band, `alongMm` and `y0Mm` at once, so the id is the key that actually decides.
      const entries = entriesOf(
        projectDesignForDisplay(designOf(placements), CATALOG),
      );
      for (const [index, left] of entries.entries()) {
        for (const right of entries.slice(index + 1)) {
          expect(compareDisplayOrder(left, right)).toBeLessThan(0);
          expect(compareDisplayOrder(right, left)).toBeGreaterThan(0);
        }
        expect(compareDisplayOrder(left, left)).toBe(0);
      }
    },
  );

  propertyTest.prop([arbitraryPlacements, fc.integer()])(
    "projects a permutation of any generated document identically",
    (placements, seed) => {
      const rotation =
        ((seed % placements.length) + placements.length) % placements.length;
      const rotated = [
        ...placements.slice(rotation),
        ...placements.slice(0, rotation),
      ];
      const reversed = [...placements].reverse();

      const expected = projectDesignForDisplay(designOf(placements), CATALOG);
      expect(projectDesignForDisplay(designOf(rotated), CATALOG)).toEqual(
        expected,
      );
      expect(projectDesignForDisplay(designOf(reversed), CATALOG)).toEqual(
        expected,
      );
    },
  );

  propertyTest.prop([arbitraryPlacements])(
    "opens each wall/band heading exactly once and loses no body",
    (placements) => {
      // The anti-invariant for a single-pass grouper: if the sort and the grouping ever disagree
      // about the key, a heading appears twice and the customer reads one wall's cabinets in two
      // places. Every entry must also survive — a projection is a re-ordering, never a filter.
      const groups = projectDesignForDisplay(designOf(placements), CATALOG);
      const headings = headingsOf(groups);

      expect(new Set(headings).size).toBe(headings.length);
      expect(
        entriesOf(groups)
          .map((entry) => entry.placementId)
          .sort(),
      ).toEqual(placements.map((candidate) => candidate.id).sort());
      expect(groups.every((group) => group.entries.length > 0)).toBe(true);
      for (const group of groups) {
        for (const entry of group.entries) {
          expect([entry.wall, entry.band]).toEqual([group.wall, group.band]);
          expect(entry.band).toBe(
            normaliseBand(definitionOf(entry.buildId).band),
          );
        }
      }
    },
  );
});

describe("the projection leaves the document alone", () => {
  it("does not reorder the design's own placements array", () => {
    // `[...].sort` mutates in place, so a projection that sorted the document's array would
    // silently rewrite what the next save persists — and it would still pass every test above.
    const design = designOf(KITCHEN_L_PLACEMENTS);
    const before = design.placements.map((candidate) => candidate.id);

    projectDesignForDisplay(design, CATALOG);

    expect(design.placements.map((candidate) => candidate.id)).toEqual(before);
  });
});

describe("the id tie-break rests on a validated uniqueness, not on luck", () => {
  it("compares ids as bytes, so two machines cannot disagree about the order", () => {
    // `localeCompare` puts "a" before "B"; a byte comparison does the reverse, and a persisted
    // order that flips with the runtime's locale data is not a deterministic projection.
    const entry = (placementId: string): DisplayEntry => ({
      placementId,
      buildId: "wall-cabinet",
      label: "Corp suspendat 2 uși",
      wall: "A",
      band: "wall",
      rawBand: "wall",
      alongMm: 300,
      y0Mm: 1500,
      widthMm: 600,
      heightMm: 700,
    });

    expect(compareDisplayOrder(entry("B"), entry("a"))).toBeLessThan(0);
    expect("B".localeCompare("a")).toBeGreaterThan(0);
  });

  it("is refused upstream when two placements share an id", () => {
    // The comparator's last key is the placement id, so its totality is only as good as the
    // guarantee that ids are unique. That guarantee is `validateDesignForCatalog`'s, enforced at
    // the write seam (`PUT /api/designs/:id`) and at the load seam (`migrateDesign`).
    const collided = designOf([
      placement("same", "A", 300, 0, "base-cabinet", 600, 820),
      placement("same", "A", 1500, 0, "base-cabinet", 600, 820),
    ]);

    expect(
      validateDesignForCatalog(collided, CATALOG).map((issue) => issue.code),
    ).toContain("DUPLICATE_PLACEMENT_ID");
  });

  it("holds the seeded document to that same uniqueness", () => {
    const ids = KITCHEN_L_PLACEMENTS.map((candidate) => candidate.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(validateDesignForCatalog(KITCHEN_L_DESIGN, CATALOG)).toEqual([]);
  });
});

const REPOSITORY_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "..",
);

/** Every shipped source tree, because the criterion says "the repository" and a second display
 *  sort is at least as likely in a component as in the domain. */
const SOURCE_ROOTS = [
  "packages/configurator-domain/src",
  "packages/three-adapter/src",
  "packages/persistence/src",
  "apps/web/src",
] as const;

/** The expression a `.sort(` is applied to: everything back to the start of its chain, with
 *  brackets balanced, so `[...onOneWall].sort` reads `[...onOneWall]` and a
 *  `design.placements.map(…).sort` chain reads the whole chain rather than the last word near it. */
function sortReceiverAt(source: string, sortIndex: number): string {
  let depth = 0;
  let index = sortIndex - 1;
  for (; index >= 0; index -= 1) {
    const character = source[index] ?? "";
    if (character === ")" || character === "]") {
      depth += 1;
      continue;
    }
    if (character === "(" || character === "[") {
      if (depth === 0) break;
      depth -= 1;
      continue;
    }
    if (depth > 0) continue;
    if (!/[\w$.\s]/.test(character)) break;
  }
  return source.slice(index + 1, sortIndex).trim();
}

/** Every `.sort(` receiver in shipped source, keyed by file. */
function sortReceiversInShippedSource(): Readonly<
  Record<string, readonly string[]>
> {
  const receivers: Record<string, string[]> = {};
  for (const root of SOURCE_ROOTS) {
    const absoluteRoot = path.join(REPOSITORY_ROOT, root);
    for (const entry of readdirSync(absoluteRoot, {
      recursive: true,
      withFileTypes: true,
    })) {
      if (!entry.isFile() || !/\.tsx?$/.test(entry.name)) continue;
      const absolute = path.join(entry.parentPath, entry.name);
      const relative = path
        .relative(REPOSITORY_ROOT, absolute)
        .split(path.sep)
        .join("/");
      const source = readFileSync(absolute, "utf8");
      for (const match of source.matchAll(/\.(?:to)?[Ss]ort(?:ed)?\(/g)) {
        (receivers[relative] ??= []).push(sortReceiverAt(source, match.index));
      }
    }
  }
  return receivers;
}

describe("exactly one display-order comparator exists in the repository", () => {
  it("finds no ordering of a body list outside the projection", () => {
    // Not a style rule. A second sort over a body list is how the scene, the breakdown and the
    // review summary drift apart, and it drifts silently because each one looks right alone.
    // Names what each sort's receiver *is*, rather than what happens to be written near it: a
    // second body order would sort `placements`, `records`, `entries` or `lines`, while the
    // geometry and infrastructure sorts read `onOneWall`, `emptyColumns`, `columnExtents`,
    // `taken`, `spans`, `members`, `abutting`, `offered`, `candidates` and a list of file names.
    const offenders: string[] = [];
    for (const [relative, receivers] of Object.entries(
      sortReceiversInShippedSource(),
    )) {
      if (relative.endsWith("queries/design-projection.ts")) continue;
      for (const receiver of receivers) {
        if (/\b(placements|records|entries|bodies|lines)\b/.test(receiver)) {
          offenders.push(`${relative}: ${receiver}.sort`);
        }
      }
    }

    expect(
      offenders,
      [
        "A sort outside `projectDesignForDisplay` orders a list of bodies. Judge which it is:",
        "  · a display order — fold that surface onto `projectDesignForDisplay` and delete the sort;",
        "  · not a display order — record here why this list is exempt, and give its receiver a name",
        "    that says what it holds, as the geometry sorts do (`onOneWall`, `spans`, `candidates`).",
        "Offending sorts:",
        ...offenders.map((offender) => `  ${offender}`),
      ].join("\n"),
    ).toEqual([]);
  });
});
