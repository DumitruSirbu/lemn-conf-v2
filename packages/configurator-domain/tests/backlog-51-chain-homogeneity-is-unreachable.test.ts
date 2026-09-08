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

/** The two structural corner returns, named so a third `wall-map` entry has to be added here
 *  deliberately rather than slipping in behind a `toBeGreaterThan`. */
const WALL_MAP_BUILD_IDS = [
  "wall-corner-return-570",
  "wall-corner-return-570-top",
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
 *  column holding two chains. Its own test is the last block of this file: a sweep that reports
 *  nothing is worth exactly as much as its detector. */
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
      // And the sweep must have looked at a column that already holds more than one member, since a
      // single-member column cannot be mixed by definition.
      const multiMemberColumns = [
        ...new Set(world.records.map((record) => record.col)),
      ].filter(
        (col) =>
          chainsOfColumn(world, col).size > 0 &&
          world.records.filter((r) => r.col === col).length > 1,
      );
      expect(multiMemberColumns.length).toBeGreaterThan(0);
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

    it.each(worlds)(
      "offers nothing that would mix a column on %s",
      (_name, world) => {
        const mixing = sweepEveryOffer(world, catalog).filter(
          (row) => row.wouldMix,
        );
        expect(mixing).toEqual([]);
      },
    );

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
  // Every "offers nothing that would mix a column" assertion is an empty array, and an empty array
  // is what a broken detector also produces. This is the one block that fails if `wouldMixColumn`
  // ever stops noticing.
  it("reports a body arriving on the other chain", () => {
    expect(wouldMixColumn("wall-map", new Set(["base-formula"]))).toBe(true);
    expect(wouldMixColumn("base-formula", new Set(["wall-map"]))).toBe(true);
  });

  it("stays quiet where the column is already on that chain, or has no members", () => {
    expect(wouldMixColumn("base-formula", new Set(["base-formula"]))).toBe(
      false,
    );
    expect(wouldMixColumn("wall-map", new Set<string>())).toBe(false);
  });
});
