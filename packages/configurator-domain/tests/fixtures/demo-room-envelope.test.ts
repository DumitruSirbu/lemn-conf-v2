// Wave 6N-0 — the demo room clears its run at both cabinet depths (ADR 0083 decision 1).
//
// Wall B goes 2830 → 2920. What that must and must not do is the whole subject of this file:
//
//   - it moves the **validation envelope** and nothing else, so every derived artefact is identical
//     under the two rooms;
//   - it is a **fixed dimension**, so no command and no migration arm writes `room.depthMm`;
//   - the migration's corrected room **reads the fixture** rather than restating it, while staying
//     a constant reached only from the exact pre-correction pair.
//
// The first is the one that matters most to a later reader. Without it, "the wave moved the room and
// not the geometry" is a claim in a commit message; with it, it is a gate.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { Design, DesignPlacement, DesignRoom } from "../../src/design.js";
import { DesignSchema } from "../../src/design.js";
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  NARROWED_ROOM_OVERFLOWING_DESIGN,
  OVERFLOWING_KITCHEN_L_DESIGN,
} from "../../src/fixtures/kitchen-l-design.js";
import { migrateDesign } from "../../src/migrate-design.js";
import { findOverflowingPlacementIds } from "../../src/queries/overflowing-placements.js";
import { validateDesignForCatalog } from "../../src/validate-design.js";
import {
  deriveColumns,
  derivePlacementRecords,
} from "../../src/void-engine.js";

/** The wall the reference measures, and the wall the demo declares instead. */
const REFERENCE_WALL_B_MM = 2830;
const DECLARED_WALL_B_MM = 2920;

/** Where wall B's run ends at the deeper cabinet depth, and the band the owner ruled around it. */
const RUN_END_AT_700_MM = 2900;
const MIN_CLEARANCE_MM = 20;
const MAX_CLEARANCE_MM = 50;

const SOURCE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "src",
);

function sourceFiles(): readonly string[] {
  return readdirSync(SOURCE, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
    .map((entry) =>
      path.relative(SOURCE, path.join(entry.parentPath, entry.name)),
    );
}

function sourceOf(relativePath: string): string {
  return readFileSync(path.join(SOURCE, relativePath), "utf8");
}

function atRoom(design: Design, room: Partial<DesignRoom>): Design {
  return { ...design, room: { ...design.room, ...room } };
}

describe("the demo room's wall B", () => {
  it("is 2920, and the room is the pair ADR 0083 decision 1 declares", () => {
    expect(KITCHEN_L_DESIGN.room).toStrictEqual({
      shape: "L",
      widthMm: 3560,
      depthMm: DECLARED_WALL_B_MM,
      heightMm: 2600,
    });
  });

  // The owner asked for 20–50 mm of clearance past the run's end at the 700 mm depth, and this
  // states the band rather than only the number inside it. A later wave moving to 2930 or 2950 is a
  // fixture adjustment and edits nothing here; one moving to 2900 or 3000 fails and owes a ruling.
  it("clears the run's 700 mm end by an amount inside the owner's ruled band", () => {
    const clearanceMm = KITCHEN_L_DESIGN.room.depthMm - RUN_END_AT_700_MM;

    expect(clearanceMm).toBeGreaterThanOrEqual(MIN_CLEARANCE_MM);
    expect(clearanceMm).toBeLessThanOrEqual(MAX_CLEARANCE_MM);
  });

  // The direction is the opposite of a correction, and is worth an executable statement because the
  // reference is the thing a later reader would "restore" it to.
  it("is a deliberate divergence from the reference rather than a move toward it", () => {
    expect(KITCHEN_L_DESIGN.room.depthMm).toBeGreaterThan(REFERENCE_WALL_B_MM);
  });

  it("parses as a Design, as does each declared overflow fixture", () => {
    for (const design of [
      KITCHEN_L_DESIGN,
      OVERFLOWING_KITCHEN_L_DESIGN,
      NARROWED_ROOM_OVERFLOWING_DESIGN,
    ]) {
      expect(DesignSchema.safeParse(design).success).toBe(true);
    }
  });
});

// =================================================================================================
// The envelope moved and the geometry did not.
// =================================================================================================

describe("the seeded design under the old room and the new one", () => {
  const OLD = atRoom(KITCHEN_L_DESIGN, { depthMm: REFERENCE_WALL_B_MM });
  const NEW = KITCHEN_L_DESIGN;

  function recordsOf(design: Design): unknown {
    return derivePlacementRecords(design, KITCHEN_L_BODY_CATALOG);
  }

  function columnsOf(design: Design): unknown {
    return [
      ...deriveColumns(
        derivePlacementRecords(design, KITCHEN_L_BODY_CATALOG),
        {},
        design.room,
      ),
    ];
  }

  // Serialised rather than compared as objects: `toStrictEqual` on a map of nested numbers would
  // pass on a `-0`/`0` swap and on a key-order change, and "byte-identical" is the claim.
  it.each([
    ["derivePlacementRecords", recordsOf],
    ["deriveColumns", columnsOf],
    [
      "validateDesignForCatalog",
      (design: Design) =>
        validateDesignForCatalog(design, KITCHEN_L_BODY_CATALOG),
    ],
    ["findOverflowingPlacementIds", findOverflowingPlacementIds],
  ] as const)("produces the same %s", (_name, derive) => {
    expect(JSON.stringify(derive(NEW))).toBe(JSON.stringify(derive(OLD)));
  });

  // Not vacuous: the artefacts above are non-empty, so an identity that held because both sides were
  // empty would fail here instead of passing quietly.
  it("derives a whole kitchen on both sides of that comparison", () => {
    expect(recordsOf(NEW)).toHaveLength(KITCHEN_L_DESIGN.placements.length);
    expect(columnsOf(NEW)).not.toHaveLength(0);
  });

  // The envelope **is** observable, so "nothing changes" would be too strong: a member-less space
  // between the two walls is judged differently. Stated so the identity above reads as a fact about
  // this design rather than as a claim that the room is inert.
  it("judges a body between the two walls differently", () => {
    const widthMm = 800;
    const reachMm = REFERENCE_WALL_B_MM + 40;
    const between: DesignPlacement = {
      id: "between-the-two-walls",
      wall: "B",
      alongMm: reachMm - widthMm / 2,
      y0Mm: 0,
      body: { buildId: "base-sink-800", widthMm, heightMm: 820 },
    };

    expect(
      findOverflowingPlacementIds({ ...OLD, placements: [between] }),
    ).toStrictEqual(["between-the-two-walls"]);
    expect(
      findOverflowingPlacementIds({ ...NEW, placements: [between] }),
    ).toStrictEqual([]);
  });
});

// =================================================================================================
// The room is a fixed dimension, not a function of the setting.
// =================================================================================================

// ADR 0083 decision 2. A room that grew with the cabinet-depth setting would make ADR 0065's fit
// gate unfireable on **any** design, not merely on the demo — the run could never pass the end of
// its wall — which deletes a shipped feature rather than declining to demonstrate it. So this is
// asserted structurally: no production module may write the field at all.
describe("no production code writes the room's depth", () => {
  /** The one module allowed to name a room's dimensions on a write path, and only from the frozen
   *  pre-correction pair (`correctPreCorrectionRoom`). Its own guards are asserted in
   *  `migrate-design.test.ts` and `qa-room-migration.adversarial.test.ts`. */
  const MIGRATION = "migrate-design.ts";

  /** The three spellings a room dimension can be written in. A command may **read** a room and pass
   *  it on — `set-cabinet-depth.ts` hands `design.room` to `deriveColumns` and back into its result
   *  — and none of these match that; each matches only a room being constructed or overwritten. */
  const ROOM_WRITES = [
    ["a fresh room literal", /room:\s*\{/],
    ["a dimension assigned in place", /\.room\.(?:widthMm|depthMm)\s*=[^=]/],
    [
      "a dimension overridden through a spread",
      /\.\.\.[\w.]*room\s*,[\s\S]{0,200}?(?:widthMm|depthMm)\s*:/,
    ],
  ] as const;

  function roomWritesIn(file: string): readonly string[] {
    const source = sourceOf(file);
    return ROOM_WRITES.filter(([, pattern]) => pattern.test(source)).map(
      ([name]) => `${file}: ${name}`,
    );
  }

  it("writes no room dimension in any command", () => {
    const offenders = sourceFiles()
      .filter((file) => file.startsWith(`commands${path.sep}`))
      .flatMap(roomWritesIn);

    expect(offenders).toStrictEqual([]);
  });

  // The patterns are not dead letters: the migration arm that legitimately corrects a room is caught
  // by two of the three, so a command doing the same thing would be caught too.
  it("catches the one module that really does write a room", () => {
    expect(roomWritesIn(MIGRATION).length).toBeGreaterThan(0);
  });

  // Not vacuous: there really are commands to scan, and `setCabinetDepth` — the one command a room
  // could plausibly be made to follow — is among them.
  it("scans a non-empty set of commands including setCabinetDepth", () => {
    const commands = sourceFiles().filter((file) =>
      file.startsWith(`commands${path.sep}`),
    );

    expect(commands.length).toBeGreaterThan(1);
    expect(commands).toContain(`commands${path.sep}set-cabinet-depth.ts`);
  });

  it("writes a room only in the migration arm that corrects one", () => {
    const writers = sourceFiles().filter(
      (file) =>
        file !== MIGRATION &&
        !file.startsWith(`fixtures${path.sep}`) &&
        /room:\s*\{/.test(sourceOf(file)),
    );

    expect(writers).toStrictEqual([]);
  });

  // The behavioural half of the same claim, because a grep can be defeated by a helper: the setting
  // is changed on the stored document and the room comes back untouched.
  it("leaves the room untouched when a document is loaded at every version", () => {
    for (const version of [1, 2, 3, 4, 5]) {
      const loaded = migrateDesign(
        version,
        JSON.parse(JSON.stringify(KITCHEN_L_DESIGN)) as unknown,
        KITCHEN_L_BODY_CATALOG,
      );

      expect(loaded.room, `version ${String(version)}`).toStrictEqual(
        KITCHEN_L_DESIGN.room,
      );
    }
  });
});

// =================================================================================================
// The migration's corrected room follows the fixture.
// =================================================================================================

describe("the corrected room the migration writes", () => {
  const PRE_CORRECTION_ROOM: DesignRoom = {
    shape: "L",
    widthMm: 3600,
    depthMm: 2400,
    heightMm: 2600,
  };

  function loadAt(version: number, design: Design): Design {
    return migrateDesign(
      version,
      JSON.parse(JSON.stringify(design)) as unknown,
      KITCHEN_L_BODY_CATALOG,
    );
  }

  // ADR 0083 decision 9. Repairing a copy of the demo into a room the demo no longer has is two
  // lists agreeing by luck, and it has a live consequence: a rescued row whose customer then picks
  // the 700 mm depth would overflow where the demo does not.
  it("is the fixture's own room, at both versions the arm is reached from", () => {
    for (const version of [1, 2]) {
      const loaded = loadAt(
        version,
        atRoom(KITCHEN_L_DESIGN, PRE_CORRECTION_ROOM),
      );

      expect(loaded.room, `version ${String(version)}`).toStrictEqual(
        KITCHEN_L_DESIGN.room,
      );
    }
  });

  // The safety property wave 6A3 established, restated because decision 9 is the change that could
  // have broken it: the corrected value is a **constant**, never derived from where the bodies of
  // the document being migrated happen to stand.
  it("is the same room whatever the document it corrects contains", () => {
    const rooms = [
      atRoom(KITCHEN_L_DESIGN, PRE_CORRECTION_ROOM),
      atRoom({ ...KITCHEN_L_DESIGN, placements: [] }, PRE_CORRECTION_ROOM),
      atRoom(
        {
          ...KITCHEN_L_DESIGN,
          placements: KITCHEN_L_DESIGN.placements.map((placement) => ({
            ...placement,
            alongMm: 3000,
          })),
        },
        PRE_CORRECTION_ROOM,
      ),
    ].map((design) => loadAt(2, design).room);

    expect(new Set(rooms.map((room) => JSON.stringify(room))).size).toBe(1);
    expect(rooms[0]).toStrictEqual(KITCHEN_L_DESIGN.room);
  });

  // Reached only from the exact pre-correction pair: one millimetre off it on either axis, and the
  // room is left exactly as stored.
  it.each([
    { widthMm: 3601 },
    { widthMm: 3599 },
    { depthMm: 2401 },
    { depthMm: 2399 },
  ])("leaves a room one millimetre off the pair alone: %o", (offset) => {
    const nearly = atRoom(KITCHEN_L_DESIGN, {
      ...PRE_CORRECTION_ROOM,
      ...offset,
    });

    expect(loadAt(2, nearly).room).toStrictEqual(nearly.room);
  });

  // The fixed point at every version arm: a corrected document loaded again does not move.
  it.each([1, 2, 3, 4, 5])("is a fixed point at version %i", (version) => {
    const corrected = loadAt(2, atRoom(KITCHEN_L_DESIGN, PRE_CORRECTION_ROOM));

    expect(loadAt(version, corrected).room).toStrictEqual(corrected.room);
  });

  // Decision 9 in its literal form. The pair may be written out once — the **pre-correction** one,
  // which is a statement about documents already written — and the corrected half may not, or the
  // two lists can drift apart again.
  it("is not restated as a literal beside the pre-correction pair", () => {
    const migration = sourceOf("migrate-design.ts");

    expect(migration).toContain("KITCHEN_L_DESIGN.room");
    expect(migration).not.toContain(String(DECLARED_WALL_B_MM));
  });
});

// =================================================================================================
// The marking keeps its demo.
// =================================================================================================

describe("the declared overflow fixtures", () => {
  it("reports nothing overflowing on the seeded design itself", () => {
    expect(findOverflowingPlacementIds(KITCHEN_L_DESIGN)).toStrictEqual([]);
  });

  // ADR 0083 decision 10: what the seeded design stopped demonstrating, this one carries. The
  // population is exactly one body and it is the only thing added to the seeded kitchen, so a case
  // that mounts it is looking at one mark and not at a second cabinet.
  it("adds exactly one body to the seeded kitchen and nothing else", () => {
    expect(OVERFLOWING_KITCHEN_L_DESIGN.room).toStrictEqual(
      KITCHEN_L_DESIGN.room,
    );
    expect(
      OVERFLOWING_KITCHEN_L_DESIGN.placements.slice(
        0,
        KITCHEN_L_DESIGN.placements.length,
      ),
    ).toStrictEqual(KITCHEN_L_DESIGN.placements);
    expect(OVERFLOWING_KITCHEN_L_DESIGN.placements).toHaveLength(
      KITCHEN_L_DESIGN.placements.length + 1,
    );
  });

  // **The seat is derived from the room, not written absolute.** That is what stopped six hand-built
  // copies from silently fitting when the wall moved 2830 → 2920, and it is why this fixture needed
  // no edit in this wave. Asserted as an arithmetic identity on the room rather than as a literal.
  it("reaches exactly one millimetre past whatever wall B is declared to be", () => {
    const added = OVERFLOWING_KITCHEN_L_DESIGN.placements.at(-1);
    const reachMm = (added?.alongMm ?? 0) + (added?.body.widthMm ?? 0) / 2;

    expect(reachMm).toBe(KITCHEN_L_DESIGN.room.depthMm + 1);
    expect(added?.wall).toBe("B");
  });

  it("is marked, and is the only complaint the document carries", () => {
    expect(
      findOverflowingPlacementIds(OVERFLOWING_KITCHEN_L_DESIGN),
    ).toStrictEqual([OVERFLOWING_KITCHEN_L_DESIGN.placements.at(-1)?.id]);
    expect(
      validateDesignForCatalog(
        OVERFLOWING_KITCHEN_L_DESIGN,
        KITCHEN_L_BODY_CATALOG,
      ).map((issue) => issue.code),
    ).toStrictEqual(["PLACEMENT_PAST_WALL_END"]);
  });

  // The narrowed-room shape: nothing moves, only the wall the run stands against. Six wall-A bodies
  // are then past their wall, and no wall-B body is.
  it("marks six wall A bodies in the narrowed room and moves nothing", () => {
    const marked = findOverflowingPlacementIds(
      NARROWED_ROOM_OVERFLOWING_DESIGN,
    );

    expect(NARROWED_ROOM_OVERFLOWING_DESIGN.placements).toStrictEqual(
      KITCHEN_L_DESIGN.placements,
    );
    expect(marked).toStrictEqual(["p13", "p14", "p19", "p2", "p20", "p4"]);
  });
});
