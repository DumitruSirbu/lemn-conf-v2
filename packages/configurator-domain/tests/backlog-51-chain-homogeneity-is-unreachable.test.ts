// **Backlog 51 / M6-AUD-008, second half: is a mixed-chain column reachable at all?**
//
// A column is one vertical stack at one along-wall coordinate and must slide as one thing or tear.
// ADR 0090 decision 2 leans on that: a frozen extent slides on the chain its recorded
// `depthFromBuildId` declares, so it lands where its members land **provided every member of a
// column declares the same `alongWallPositionFollows`**. A column whose members declared two
// different chains would tear by 30 mm at 700 — wave 6J-c's own measured difference — with every
// layer downstream internally consistent and wrong together.
//
// Nothing enforces it, and backlog 51 says the decision "should start by measuring whether the
// state is reachable at all through the offer list". **This file is that measurement, kept as a
// standing guard rather than reported once and forgotten.**
//
// What it measures, at both declared depths and on two worlds — the seeded kitchen and the same
// kitchen with every deletable body cleared:
//
//   1. The only `wall-map` entries in the catalogue are the two structural corner returns, and each
//      is `insertable: false`, `canReplace: false`, `canDelete: false`. A third entry, or one of
//      these turned insertable, fails here.
//   2. No offer row anywhere — offered *or* refused — names a `wall-map` body. So the offer list
//      cannot introduce one into a `base-formula` column.
//   3. The column those two stand in gains no void even when the rest of the kitchen is emptied, so
//      nothing can be inserted beside them either. The mixing is blocked from both directions.
//   4. Every column of both worlds is in fact homogeneous.
//
// **Two limits of this file, named rather than left to be discovered.**
//
//   - Its 700 mm world is `designAt(700)`, a swap of `settings.cabinetDepthMm`. The world the
//     product actually produces comes from `setCabinetDepth`, which rebuilds every body and renames
//     build ids — and a rebuild is the one mechanism that could put a member on a chain its column
//     does not already stand on. That world needs a body probe, so it is swept at the store seam
//     instead: `apps/web/tests/store/backlog-51-after-the-real-depth-command.test.ts`, there and
//     back again.
//   - The emptied world answers the **wall-map** claim and not the mixing one, because clearing
//     every deletable body leaves no column with a member for a new one to disagree with. That is
//     asserted below rather than assumed, so the empty result reads as scope and not as evidence.
//
// **This closes the reachability question, not the load seam.** A hand-crafted document arriving
// over the wire can still declare a mixed column; whether that is refused or marked is the severity
// ruling backlog 50 and 51 share, and it is deliberately not decided here.
import { describe, expect, it } from "vitest";

import type { Design } from "../src/design.js";
import {
  KITCHEN_L_DESIGN,
  buildKitchenLBodyCatalog,
} from "../src/fixtures/kitchen-l-design.js";
import { offersFor } from "../src/queries/offers.js";
import type { BodyCatalog } from "../src/void-engine.js";
import {
  advancePast,
  createWorld,
  type KitchenWorld,
} from "./support/kitchen-world.js";

const DECLARED_DEPTHS_MM = [600, 700] as const;

/** The four structural corner bodies on the wall map (the two side returns and, since M7C wave C2, the
 *  corner wall unit's two), named so a fifth `wall-map` entry has to be added here deliberately rather
 *  than slipping in behind a `toBeGreaterThan`. */
const WALL_MAP_BUILD_IDS = [
  "wall-corner-return-570",
  "wall-corner-return-570-top",
  "wall-corner-x-900",
  "wall-corner-x-900-top",
] as const;

function designAt(cabinetDepthMm: number): Design {
  return {
    ...KITCHEN_L_DESIGN,
    settings: { ...KITCHEN_L_DESIGN.settings, cabinetDepthMm },
  };
}

function chainOf(catalog: BodyCatalog, buildId: string): string | undefined {
  return catalog.get(buildId)?.depthRule?.alongWallPositionFollows;
}

function chainsOfColumn(
  world: KitchenWorld,
  col: string,
  exceptId?: string,
): Set<string> {
  return new Set(
    world.records
      .filter((record) => record.col === col && record.id !== exceptId)
      .map(
        (record) => record.depthRule?.alongWallPositionFollows ?? "UNDECLARED",
      ),
  );
}

/** Whether adding a body on this chain to a column whose members declare `siblings` would leave the
 *  column holding two chains. The last block of this file runs it through the sweep on a catalogue
 *  that does mix: a sweep that reports nothing is worth exactly as much as its detector. */
function wouldMixColumn(
  chain: string | undefined,
  siblings: ReadonlySet<string>,
): boolean {
  return siblings.size > 0 && chain !== undefined && !siblings.has(chain);
}

interface SweptRow {
  readonly target: string;
  readonly col: string;
  readonly buildId: string;
  readonly chain: string | undefined;
  /** The chains already standing in this row's column. **Carried rather than discarded**, because
   *  `wouldMix` short-circuits to `false` when this is empty — so without it, "nothing would mix"
   *  cannot be told apart from "nothing was asked". */
  readonly siblingChains: ReadonlySet<string>;
  readonly wouldMix: boolean;
}

/** Every offer the product can produce on this world: each void and each placement as a target,
 *  every row, offered or refused. */
function sweepEveryOffer(
  world: KitchenWorld,
  catalog: BodyCatalog,
): readonly SweptRow[] {
  const targets = [
    ...world.voids.map((record) => ({
      kind: "void" as const,
      id: record.id,
      col: record.col,
    })),
    ...world.records.map((record) => ({
      kind: "placement" as const,
      id: record.id,
      col: record.col,
    })),
  ];
  return targets.flatMap((target) =>
    offersFor({
      records: world.records,
      voids: world.voids,
      columns: world.columns,
      catalog,
      cabinetDepthMm: world.cabinetDepthMm,
      target: { kind: target.kind, id: target.id },
    }).map((row) => {
      const chain = chainOf(catalog, row.buildId);
      const siblings = chainsOfColumn(
        world,
        target.col,
        target.kind === "placement" ? target.id : undefined,
      );
      return {
        target: `${target.kind}:${target.id}`,
        col: target.col,
        buildId: row.buildId,
        chain,
        siblingChains: siblings,
        wouldMix: wouldMixColumn(chain, siblings),
      };
    }),
  );
}

/** The seeded kitchen with every body the product lets a customer clear removed — the emptiest
 *  state reachable by deleting, and the one that opens the most voids to offer into. */
function emptiedOf(world: KitchenWorld, catalog: BodyCatalog): KitchenWorld {
  return advancePast(
    world,
    world.records
      .filter((record) => catalog.get(record.buildId)?.canDelete === true)
      .map((record) => record.id),
  );
}

describe.each(DECLARED_DEPTHS_MM)(
  "a mixed-chain column at %i mm",
  (cabinetDepthMm) => {
    const catalog = buildKitchenLBodyCatalog(cabinetDepthMm);
    const seeded = createWorld(designAt(cabinetDepthMm), catalog);
    const emptied = emptiedOf(seeded, catalog);
    const worlds = [
      ["the seeded kitchen", seeded],
      ["the emptied kitchen", emptied],
    ] as const;

    it("has exactly two wall-map entries, and both refuse every way in", () => {
      const wallMap = [...catalog]
        .filter(
          ([, definition]) =>
            definition.depthRule?.alongWallPositionFollows === "wall-map",
        )
        .map(([buildId, definition]) => ({
          buildId,
          insertable: definition.insertable,
          canReplace: definition.canReplace,
          canDelete: definition.canDelete,
        }));

      // Named, not counted: an entry added to this chain must be added to this list, and then to the
      // reasoning below about why it still cannot reach a base-formula column.
      expect(wallMap.map((entry) => entry.buildId)).toEqual([
        ...WALL_MAP_BUILD_IDS,
      ]);
      for (const entry of wallMap) {
        expect([entry.buildId, entry.insertable]).toEqual([
          entry.buildId,
          false,
        ]);
        expect([entry.buildId, entry.canReplace]).toEqual([
          entry.buildId,
          false,
        ]);
        expect([entry.buildId, entry.canDelete]).toEqual([
          entry.buildId,
          false,
        ]);
      }
    });

    it.each(worlds)("sweeps a real offer list on %s", (_name, world) => {
      // Non-vacuity, first: an empty sweep would satisfy every claim below by having asked nothing.
      const swept = sweepEveryOffer(world, catalog);
      expect(swept.length).toBeGreaterThan(50);
      expect(new Set(swept.map((row) => row.col)).size).toBeGreaterThan(1);
    });

    // **Which sweep can answer which claim, measured rather than assumed.** `wouldMix` returns
    // `false` the moment a row's column holds no other member, so a world whose rows all land in
    // emptied columns produces an empty "would mix" result by short circuit — an answer that looks
    // identical to the real one and means nothing.
    //
    // The first version of this file guarded that with "the world has a multi-member column", which
    // passes on `B|0.61` — the one column the sweep never gets a row for, because both its members
    // refuse replacement and it opens no void. This asks the swept rows instead.
    it("asks the mixing question on the seeded kitchen, where columns still hold members", () => {
      const asked = sweepEveryOffer(seeded, catalog).filter(
        (row) => row.siblingChains.size > 0,
      );
      expect(asked.length).toBeGreaterThan(50);
    });

    it("asks it of nothing on the emptied kitchen, which is why that sweep answers a different claim", () => {
      // Not a defect and not padding: clearing every deletable body is what makes the **wall-map**
      // claim strong — 400 rows offered into wide-open columns and none of them a `wall-map` body —
      // and it is exactly what makes that world useless for the mixing claim. Stated here so the
      // empty result below is read as scope and not as evidence.
      const asked = sweepEveryOffer(emptied, catalog).filter(
        (row) => row.siblingChains.size > 0,
      );
      expect(asked).toEqual([]);
    });

    it.each(worlds)(
      "offers no wall-map body anywhere on %s",
      (_name, world) => {
        const wallMapRows = sweepEveryOffer(world, catalog).filter(
          (row) => row.chain === "wall-map",
        );
        expect(wallMapRows).toEqual([]);
      },
    );

    // **The seeded kitchen only** — see the two blocks above. Every one of its 104 rows lands in a
    // column that still holds a member, so every one of them is a question actually asked.
    it("offers nothing that would mix a column", () => {
      const swept = sweepEveryOffer(seeded, catalog);
      expect(swept.every((row) => row.siblingChains.size > 0)).toBe(true);
      expect(swept.filter((row) => row.wouldMix)).toEqual([]);
    });

    it.each(worlds)(
      "keeps the wall-map column closed on %s — no void to insert into",
      (_name, world) => {
        const wallMapColumns = [
          ...new Set(
            world.records
              .filter(
                (record) =>
                  record.depthRule?.alongWallPositionFollows === "wall-map",
              )
              .map((record) => record.col),
          ),
        ];
        // The column exists in both worlds — its members are non-deletable, so emptying cannot remove
        // it. Without this the next assertion would pass on a world that simply has no such column.
        expect(wallMapColumns.length).toBe(1);
        expect(
          world.voids.filter((record) => wallMapColumns.includes(record.col)),
        ).toEqual([]);
      },
    );

    it.each(worlds)("holds every column of %s to one chain", (_name, world) => {
      const columns = [...new Set(world.records.map((record) => record.col))];
      expect(columns.length).toBeGreaterThan(0);
      for (const col of columns)
        expect([col, [...chainsOfColumn(world, col)].length]).toEqual([col, 1]);
    });
  },
);

describe("the detector the sweeps above rely on", () => {
  // Every "offers nothing that would mix a column" assertion is an empty array, and an empty array is
  // what a blind sweep also produces. So the sweep is run over a catalogue in which one offered row
  // is redeclared onto the other chain: it must name every offer of that row and no other.
  const CABINET_DEPTH_MM = 600;
  const REDECLARED_BUILD_ID = "base-cabinet";
  const shipped = buildKitchenLBodyCatalog(CABINET_DEPTH_MM);
  const seeded = createWorld(designAt(CABINET_DEPTH_MM), shipped);

  function withOneRowOnTheWallMap(): BodyCatalog {
    const definition = shipped.get(REDECLARED_BUILD_ID);
    if (!definition?.depthRule)
      throw new Error(`${REDECLARED_BUILD_ID} left the catalogue`);
    return new Map([
      ...shipped,
      [
        REDECLARED_BUILD_ID,
        {
          ...definition,
          depthRule: {
            ...definition.depthRule,
            alongWallPositionFollows: "wall-map" as const,
          },
        },
      ],
    ]);
  }

  it("reports every offer of a body arriving on the other chain, and no other row", () => {
    const swept = sweepEveryOffer(seeded, withOneRowOnTheWallMap());
    const offersOfTheRedeclaredRow = swept.filter(
      (row) => row.buildId === REDECLARED_BUILD_ID,
    );

    expect(offersOfTheRedeclaredRow.length).toBeGreaterThan(0);
    expect(swept.filter((row) => row.wouldMix)).toEqual(
      offersOfTheRedeclaredRow,
    );
  });

  it("stays quiet about that body where the column it is offered into has no members", () => {
    const swept = sweepEveryOffer(
      emptiedOf(seeded, shipped),
      withOneRowOnTheWallMap(),
    );

    expect(
      swept.filter((row) => row.buildId === REDECLARED_BUILD_ID).length,
    ).toBeGreaterThan(0);
    expect(swept.filter((row) => row.wouldMix)).toEqual([]);
  });
});
