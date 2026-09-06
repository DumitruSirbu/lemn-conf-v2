// Wave 6J-d — **the command's own result is self-consistent before any store sees it** (ADR 0090).
//
// Wave 6J-c slid wall B's placements and left `Design.emptyColumns` and `Design.columnExtents` at
// the coordinates it had just vacated. Measured on the shipped kitchen with the oven tower cleared,
// through `setCabinetDepth(700)`: four standing runs filed under no column at all, `emptyColumns`
// 1 → 5, `columnExtents` 11 → 7, `voids` 3 → 12, and **five `EMPTY_COLUMN_OVERLAPS_PLACEMENT`
// refusals** at the seam `refuseUnexecutableDesign` runs — a 700 mm kitchen the customer could not
// save.
//
// **This file has no store and no fake probe of the web app's**, which is the point of it: the
// criterion it carries would have caught that defect at its own seam, one package before the store
// was reached. The store-level halves live in `apps/web/tests/store/`.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { setCabinetDepth } from "../../src/commands/set-cabinet-depth.js";
import type { Design, EmptyColumn } from "../../src/design.js";
import {
  buildKitchenLBodyCatalog,
  KITCHEN_L_DESIGN,
} from "../../src/fixtures/kitchen-l-design.js";
import { cabinetDepthRuleOf } from "../../src/cabinet-depth-rule.js";
import {
  fatalDesignValidationIssues,
  validateDesignForCatalog,
} from "../../src/validate-design.js";
import {
  clipEmptyColumnsAtWallEnd,
  clipEmptyColumnsToFreeGround,
  derivePlacementRecords,
  type BodyCatalog,
  type Column,
} from "../../src/void-engine.js";
import { createFakeProbeFactory } from "../support/fake-probe.js";

const OCCURRED_AT = "2026-09-06T10:00:00.000Z";
const SHALLOW_MM = 600;
const DEFAULT_MM = SHALLOW_MM;
const DEEP_MM = 700;

interface Changed {
  readonly design: Design;
  readonly columns: ReadonlyMap<string, Column>;
}

function changeTo(design: Design, cabinetDepthMm: number): Changed {
  const result = setCabinetDepth({
    design,
    catalogAt: buildKitchenLBodyCatalog,
    cabinetDepthMm,
    probeAt: createFakeProbeFactory(),
    occurredAt: OCCURRED_AT,
  });
  if (!result.ok) throw new Error(`refused: ${result.reason.code}`);
  return { design: result.design, columns: result.effect.columns };
}

/** The shipped kitchen with one column cleared, written directly rather than reached through a
 *  delete command: this file is about the depth change, and ADR 0053 says the document records the
 *  whole frozen map, so a document is the honest input. `B|1.20`'s two members are the oven tower
 *  and the deep top above it, and the extent they leave is 638 mm deep. */
function withTheOvenTowerCleared(): Design {
  const cleared = KITCHEN_L_DESIGN.placements.filter(
    (placement) => placement.id !== "p5" && placement.id !== "p22",
  );
  return {
    ...KITCHEN_L_DESIGN,
    placements: cleared,
    emptyColumns: [
      {
        wall: "B",
        alongMm: 1200,
        widthMm: 600,
        y0Mm: 0,
        topMm: 2600,
        depthMm: 638,
        depthFromBuildId: "tall-oven-tower-600",
      },
    ],
  };
}

function fatalIssuesOf(
  design: Design,
  cabinetDepthMm: number,
): readonly string[] {
  return fatalDesignValidationIssues(
    validateDesignForCatalog(design, buildKitchenLBodyCatalog(cabinetDepthMm)),
  ).map((issue) => `${issue.code} ${issue.path}`);
}

function recordColumnKeys(
  design: Design,
  catalog: BodyCatalog,
): readonly string[] {
  return [
    ...new Set(derivePlacementRecords(design, catalog).map((r) => r.col)),
  ].sort();
}

describe("the document the command returns", () => {
  // **The head of the whole defect, as one predicate.** `projectFrozenMap` partitions on
  // `occupiedKeys.has(key)`, so a record filed under a key the map does not hold is written out as
  // free space at the coordinate a cabinet is standing on.
  it.each([SHALLOW_MM, DEEP_MM])(
    "holds a column for every record it writes, at %i",
    (cabinetDepthMm) => {
      const changed = changeTo(withTheOvenTowerCleared(), cabinetDepthMm);
      const catalog = buildKitchenLBodyCatalog(cabinetDepthMm);

      const orphans = recordColumnKeys(changed.design, catalog).filter(
        (key) => !changed.columns.has(key),
      );

      expect(orphans).toEqual([]);
      expect(recordColumnKeys(changed.design, catalog).length).toBeGreaterThan(
        1,
      );
    },
  );

  // **The criterion that would have caught wave 6J-c's defect at its own seam.** No store, no probe
  // of the web app's, no `applyCommandResult` — the returned `Design` alone, through the validator
  // `refuseUnexecutableDesign` runs at the `PUT`.
  it.each([SHALLOW_MM, DEEP_MM])(
    "is one the write seam accepts, at %i",
    (cabinetDepthMm) => {
      const changed = changeTo(withTheOvenTowerCleared(), cabinetDepthMm);

      expect(fatalIssuesOf(changed.design, cabinetDepthMm)).toEqual([]);
    },
  );

  // The same claim on the fixture as it ships, so neither arm above can pass only on a document
  // this file constructed.
  it("is one the write seam accepts on the seeded kitchen at the deeper setting", () => {
    const changed = changeTo(KITCHEN_L_DESIGN, DEEP_MM);

    expect(fatalIssuesOf(changed.design, DEEP_MM)).toEqual([]);
  });

  // ADR 0090 decision 1 as a sentence about the result rather than about the store: the arrays on
  // the returned document are the projection of the map the effect publishes, so a caller reading
  // either gets the same answer.
  it("records the map its own effect publishes", () => {
    const changed = changeTo(withTheOvenTowerCleared(), DEEP_MM);
    const stored = [
      ...(changed.design.emptyColumns ?? []),
      ...(changed.design.columnExtents ?? []),
    ];

    expect(stored.length).toBe(changed.columns.size);
    for (const entry of stored) {
      const key = `${entry.wall}|${(entry.alongMm / 1000).toFixed(2)}`;
      expect(changed.columns.has(key), key).toBe(true);
    }
  });
});

describe("where the frozen extents land", () => {
  // **ADR 0090 decision 2's own assertion, and the one it says the wave owes.** One rule serves both
  // halves of the map because `deriveColumns` records the winner of §3.2's MAX, so the recorded
  // source is a member of that column — which is only true if an occupied extent lands exactly where
  // its own members land. If this fails, the recorded source and the members disagree and the
  // chain-homogeneity finding (`docs/BACKLOG.md` 51) is live.
  it.each([SHALLOW_MM, DEEP_MM])(
    "puts every occupied extent under the key its own members are filed under, at %i",
    (cabinetDepthMm) => {
      const changed = changeTo(withTheOvenTowerCleared(), cabinetDepthMm);
      const catalog = buildKitchenLBodyCatalog(cabinetDepthMm);
      const occupied = recordColumnKeys(changed.design, catalog);

      const stored = new Map(
        (changed.design.columnExtents ?? []).map((entry) => [
          `${entry.wall}|${(entry.alongMm / 1000).toFixed(2)}`,
          entry,
        ]),
      );

      expect([...stored.keys()].sort()).toEqual(occupied);
    },
  );

  // The wall-B coordinates ADR 0090 decision 2's measurement table records, at the setting it
  // measured them at — including `B|1.30`, the key the route-independence invariant names.
  it("slides each wall-B column onto the chain its recorded source declares", () => {
    const changed = changeTo(withTheOvenTowerCleared(), DEEP_MM);

    const wallB = [...changed.columns.keys()].filter((key) =>
      key.startsWith("B|"),
    );

    expect(wallB.sort()).toEqual([
      "B|0.69",
      "B|0.84",
      "B|1.30",
      "B|1.90",
      "B|2.55",
    ]);
  });

  // ADR 0011 Gap D, unchanged on the axis this wave does not touch: the customer's own width and the
  // floor and top a partial delete left behind are carried across, and only the anchor moves.
  it("moves the anchor and re-derives no width, floor or top", () => {
    const before = withTheOvenTowerCleared().emptyColumns?.[0];
    if (!before) throw new Error("no seeded space");

    const changed = changeTo(withTheOvenTowerCleared(), DEEP_MM);
    const after = changed.design.emptyColumns?.[0];

    expect(after?.widthMm).toBe(before.widthMm);
    expect(after?.y0Mm).toBe(before.y0Mm);
    expect(after?.topMm).toBe(before.topMm);
    expect(after?.alongMm).toBe(before.alongMm + 100);
  });

  // **600 → 700 → 600 returns the whole map, keys included** — not just the depths. True by accident
  // before this wave, because nothing moved.
  it("returns the whole document across a round trip", () => {
    const start = withTheOvenTowerCleared();

    const there = changeTo(start, DEEP_MM);
    const back = changeTo(there.design, SHALLOW_MM);

    expect(back.design.emptyColumns).toStrictEqual(start.emptyColumns);
    expect(back.design.columnExtents).toStrictEqual(
      changeTo(start, SHALLOW_MM).design.columnExtents,
    );
  });
});

describe("the chain is a property of a column and is never inferred", () => {
  // ADR 0090 decision 3: the anti-invariant that closes band inference **by measurement**. Two
  // entries in the same band, at the same vertical interval, declaring different chains — so a rule
  // that read a frozen extent's `y0Mm`/`topMm` would be 30 mm wrong on the shipped fixture, and
  // 30 mm of wrong is an overlap and a refused save.
  it("resolves two same-band entries to different chains through the production reader", () => {
    const catalog = buildKitchenLBodyCatalog(DEEP_MM);
    const chainOf = (buildId: string): string => {
      const definition = catalog.get(buildId);
      if (!definition) throw new Error(`${buildId} is not in the catalogue`);
      return cabinetDepthRuleOf({ buildId, rule: definition.depthRule })
        .alongWallPositionFollows;
    };

    expect(chainOf("wall-2door-600-deep-top")).toBe("base-formula");
    expect(chainOf("wall-corner-return-570-top")).toBe("wall-map");
    expect(chainOf("wall-2door-600-deep-top")).not.toBe(
      chainOf("wall-corner-return-570-top"),
    );
  });

  // **Chain-homogeneity, measured on the seeded design at both settings** (ADR 0090 decision 3, and
  // the finding at `docs/BACKLOG.md` 51). Nothing enforces it on an arbitrary document, and this is
  // what says it holds on the one that ships — the structural fact that lets one rule serve a
  // member-less space and an occupied column alike.
  it.each([SHALLOW_MM, DEEP_MM])(
    "gives every column's members one chain, at %i",
    (cabinetDepthMm) => {
      const catalog = buildKitchenLBodyCatalog(cabinetDepthMm);
      const changed = changeTo(KITCHEN_L_DESIGN, cabinetDepthMm);
      const chainsByColumn = new Map<string, Set<string>>();
      for (const record of derivePlacementRecords(changed.design, catalog)) {
        const chain = cabinetDepthRuleOf({
          buildId: record.buildId,
          rule: record.depthRule,
        }).alongWallPositionFollows;
        const seen = chainsByColumn.get(record.col) ?? new Set<string>();
        seen.add(chain);
        chainsByColumn.set(record.col, seen);
      }

      expect(chainsByColumn.size).toBeGreaterThan(1);
      for (const [key, chains] of chainsByColumn) {
        expect([...chains], key).toHaveLength(1);
      }
    },
  );

  // The structural half: no production file chooses a chain from a band or a level grid. The
  // declaration is per entry (ADR 0058 decision 2), and this is what stops the next reader inferring
  // one from the extent it is standing in.
  // Deliberately not `clip-empty-columns-to-free-ground.ts`: that pass *measures* a vertical
  // interval, which is its whole job, and it chooses no chain. The claim is about the files that
  // answer "which chain does this run follow" — reading a band there is the inference decision 3
  // closes.
  it("reads no band or level from any file that resolves a chain", () => {
    const chainReaders = [
      "along-wall-chain-shift.ts",
      "frozen-map-at-cabinet-depth.ts",
    ];

    for (const file of chainReaders) {
      const source = sourceOf(file);
      expect(source, file).toContain("alongWall");
      for (const banned of [
        "y0Mm",
        "topMm",
        ".band",
        "LEVELS",
        "LEVEL_SNAP_M",
      ]) {
        expect(source.includes(banned), `${file} reads ${banned}`).toBe(false);
      }
    }
  });
});

describe("a sourceless extent, on the last rung of the ladder", () => {
  /** The shipped kitchen with one column cleared and **every recorded source stripped** — a session
   *  before wave 6K-c, and the population ADR 0090's amendment answers. `asLegacyDocument` in the
   *  store suites builds the same thing one package up. */
  function legacy(design: Design): Design {
    const strip = (entry: EmptyColumn): EmptyColumn => {
      const stripped = { ...entry };
      delete stripped.depthFromBuildId;
      return stripped;
    };
    return {
      ...design,
      emptyColumns: (design.emptyColumns ?? []).map(strip),
      columnExtents: (design.columnExtents ?? []).map(strip),
    };
  }

  /** The shipped kitchen with the named placements removed and their column's extent frozen, written
   *  as a document rather than reached through a delete command — this file has no store. */
  function cleared(members: readonly string[], space: EmptyColumn): Design {
    return {
      ...KITCHEN_L_DESIGN,
      placements: KITCHEN_L_DESIGN.placements.filter(
        (placement) => !members.includes(placement.id),
      ),
      emptyColumns: [space],
    };
  }

  const CLEARED_SPACES: readonly (readonly [
    string,
    readonly string[],
    EmptyColumn,
    readonly [number, number],
  ])[] = [
    [
      "the appliance niche",
      ["p7", "p24"],
      {
        wall: "B",
        alongMm: 2450,
        widthMm: 700,
        y0Mm: 0,
        topMm: 2600,
        depthMm: 742,
      },
      [2200, 2900],
    ],
    [
      "the pantry",
      ["p6", "p23"],
      {
        wall: "B",
        alongMm: 1800,
        widthMm: 600,
        y0Mm: 0,
        topMm: 2600,
        depthMm: 600,
      },
      [1600, 2200],
    ],
    [
      "the oven tower",
      ["p5", "p22"],
      {
        wall: "B",
        alongMm: 1200,
        widthMm: 600,
        y0Mm: 0,
        topMm: 2600,
        depthMm: 638,
      },
      [1000, 1600],
    ],
  ];

  // **ADR 0090's amendment, asserted by value.** A sourceless space lands where its neighbours leave
  // it — **abutting, not merely non-overlapping**. A rule that shifted by anything other than the
  // declared chain would leave a gap or an overlap, so only exactness passes. Under the struck
  // decision 4a each of these stayed put and was overlapped by the run that moved past it.
  it.each(CLEARED_SPACES)(
    "lands %s exactly where its neighbours leave it",
    (_name, members, space, expected) => {
      const changed = changeTo(legacy(cleared(members, space)), DEEP_MM);
      const moved = changed.design.emptyColumns?.[0];
      if (!moved) throw new Error("the space did not survive the change");

      expect([
        moved.alongMm - moved.widthMm / 2,
        moved.alongMm + moved.widthMm / 2,
      ]).toStrictEqual(expected);
    },
  );

  it.each(CLEARED_SPACES)(
    "leaves %s on a document the write seam accepts",
    (_name, members, space) => {
      const changed = changeTo(legacy(cleared(members, space)), DEEP_MM);

      expect(fatalIssuesOf(changed.design, DEEP_MM)).toEqual([]);
    },
  );

  // **Rung 4's default is the only *reachable* answer, not the likelier of two — pinned, not
  // assumed.** The two entries that declare `wall-map` are `STRUCTURAL_CORNER`: neither can be
  // deleted and neither is insertable, so a `wall-map` column can never become member-less. If a
  // future catalogue makes one deletable this goes red and rung 4 is re-opened deliberately rather
  // than silently becoming wrong.
  it("cannot make a wall-map column member-less", () => {
    const catalog = buildKitchenLBodyCatalog(DEFAULT_MM);
    const onTheWallMap = [...catalog].filter(
      ([buildId, definition]) =>
        cabinetDepthRuleOf({ buildId, rule: definition.depthRule })
          .alongWallPositionFollows === "wall-map",
    );

    expect(onTheWallMap.length).toBeGreaterThan(0);
    for (const [buildId, definition] of onTheWallMap) {
      expect(definition.canDelete, buildId).toBe(false);
      expect(definition.canReplace, buildId).toBe(false);
    }
  });
});

describe("a space at the far end of the wall", () => {
  // **ADR 0090 Amendment B's D1, and the room is the test's own.** The same failure reaches the
  // ordinary cleared-appliance-niche scenario in the pre-6N-0 2830 mm room, so taking the width from
  // `KITCHEN_L_DESIGN` would couple this wave's correctness to 6N-0's and let a revert there return
  // the defect silently. 2920 is the shipped wall B; the space below is flush to its end.
  const WALL_B_MM = 2920;

  /** A recorded space standing flush to wall B's end, on ground no body occupies. Its far edge is
   *  the wall's own end at 600, so the +100 mm slide puts it 100 mm past — the one input ADR 0069's
   *  cap was never written for, because until wave 6J-c no reversible command could produce it. */
  function withASpaceAtTheFarEnd(): Design {
    return {
      ...KITCHEN_L_DESIGN,
      room: { ...KITCHEN_L_DESIGN.room, depthMm: WALL_B_MM },
      placements: KITCHEN_L_DESIGN.placements.filter(
        (placement) => !["p7", "p24"].includes(placement.id),
      ),
      emptyColumns: [
        {
          wall: "B",
          alongMm: 2620,
          widthMm: 600,
          y0Mm: 0,
          topMm: 2600,
          depthMm: 742,
          depthFromBuildId: "fridge-free-700",
        },
      ],
    };
  }

  function theSpace(design: Design): EmptyColumn {
    const [space] = design.emptyColumns ?? [];
    if (!space) throw new Error("the space did not survive the change");
    return space;
  }

  // Measured at `cf53e8e`: `[2320..2920]` → `[2420..2920]` → `[2320..2820]`. 100 mm gone, and gone
  // permanently — `DesignSchema` parses it and `validateDesignForCatalog` is silent, so the `PUT`
  // stores it and a later session opens a space 100 mm short with nothing saying so.
  it("returns to the width and the coordinate it started at", () => {
    const start = withASpaceAtTheFarEnd();

    const deep = changeTo(start, DEEP_MM);
    const back = changeTo(deep.design, SHALLOW_MM);

    expect(theSpace(back.design)).toStrictEqual(theSpace(start));
  });

  // ADR 0090 Amendment B's rule, made falsifiable: **the recorded extent slides exactly and keeps
  // its width.** A cap derived from the room bounds what the map publishes and does not rewrite what
  // the document records.
  it("records the whole width at the deeper setting, past the wall", () => {
    const deep = changeTo(withASpaceAtTheFarEnd(), DEEP_MM);
    const space = theSpace(deep.design);

    expect(space.widthMm).toBe(600);
    expect(space.alongMm).toBe(2720);
    expect(space.alongMm + space.widthMm / 2).toBeGreaterThan(WALL_B_MM);
  });

  // **Marked, not shortened** — the same treatment ADR 0065 gives a placement the same slide pushes
  // past the same wall, now applied to the population that cannot speak for itself.
  // `EMPTY_COLUMN_PAST_WALL_END` is already declared a `mark`, so the write seam accepts it.
  it("is marked at the deeper setting and refused at neither", () => {
    const deep = changeTo(withASpaceAtTheFarEnd(), DEEP_MM);
    const issues = validateDesignForCatalog(
      deep.design,
      buildKitchenLBodyCatalog(DEEP_MM),
    );

    expect(issues.map((issue) => issue.code)).toContain(
      "EMPTY_COLUMN_PAST_WALL_END",
    );
    expect(fatalIssuesOf(deep.design, DEEP_MM)).toEqual([]);
    expect(
      fatalIssuesOf(changeTo(deep.design, SHALLOW_MM).design, SHALLOW_MM),
    ).toEqual([]);
  });

  // **The free-ground guard's idleness, on the input the funnel actually hands it** — the map after
  // the slide and after the wall-end cap, and *before* the free-ground clip.
  //
  // Asserting `clipEmptyColumnsToFreeGround(state.columns, records) === state.columns` is **vacuous**
  // and was asked for in that form by mistake: the pass only removes, so re-applying it to its own
  // output is idempotence and holds whatever the first pass did. Reconstructing the funnel's input
  // is what makes the claim mean something.
  it("hands the free-ground guard nothing to do", () => {
    for (const design of [withASpaceAtTheFarEnd(), withTheOvenTowerCleared()]) {
      for (const cabinetDepthMm of [SHALLOW_MM, DEEP_MM]) {
        const changed = changeTo(design, cabinetDepthMm);
        const records = derivePlacementRecords(
          changed.design,
          buildKitchenLBodyCatalog(cabinetDepthMm),
        );
        const handedToTheGuard = clipEmptyColumnsAtWallEnd(
          changed.columns,
          records,
          changed.design.room,
        );

        expect(
          clipEmptyColumnsToFreeGround(handedToTheGuard, records),
          `at ${String(cabinetDepthMm)}`,
        ).toBe(handedToTheGuard);
      }
    }
  });
});

function sourceOf(file: string): string {
  return readFileSync(
    fileURLToPath(new URL(`../../src/${file}`, import.meta.url)),
    "utf8",
  );
}
