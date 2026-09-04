import { describe, expect, it } from "vitest";

import type { Design, EmptyColumn } from "../src/design.js";
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../src/fixtures/kitchen-l-design.js";
import { migrateDesign } from "../src/migrate-design.js";
import { MAX_EMPTY_COLUMN_WIDTH_MM } from "../src/module-grid.js";
import { InvalidDesignError } from "../src/repository.js";
import { findOverflowingPlacementIds } from "../src/queries/overflowing-placements.js";
import { validateDesignForCatalog } from "../src/validate-design.js";

const CATALOG = KITCHEN_L_BODY_CATALOG;
const NOW = "2026-08-25T00:00:00.000Z";

const PRE_CORRECTION_ROOM = {
  shape: "L",
  widthMm: 3600,
  depthMm: 2400,
  heightMm: 2600,
} as const;

/** The room the correction of 2026-09-03 writes over it. Restated rather than imported for the same
 *  reason the pre-correction pair is: a migration is a statement about documents already written. */
const CORRECTED_ROOM_MM = { widthMm: 3560, depthMm: 2830 } as const;

/** Through `JSON` first, because that is what a stored row is: a `Design` handed straight to
 *  `migrateDesign` would let a test pass that a real document could not. */
function stored(design: Design): unknown {
  return JSON.parse(JSON.stringify(design)) as unknown;
}

/** The bound as it stood before 2026-09-03 — `max(widthMm, depthMm)` for **both** walls — so a
 *  document can be asked the one question that matters here: *was this legal when it was written?*
 *  Restated rather than imported, since the production function it mirrors is deleted. */
function wasLegalWhenWritten(design: Design): boolean {
  const bound = Math.max(design.room.widthMm, design.room.depthMm);
  const runs = [
    ...design.placements.map((placement) => ({
      alongMm: placement.alongMm,
      widthMm: placement.body.widthMm,
    })),
    ...(design.emptyColumns ?? []),
  ];
  return runs.every((run) => run.alongMm + run.widthMm / 2 <= bound);
}

/** One body on wall B ending at 2800 — the seeded `p7`'s extent, in a document small enough that
 *  nothing else can speak. Refused under a 2400 mm depth, accepted under 2830. */
const NEEDS_THE_CORRECTION: Design = {
  room: { ...PRE_CORRECTION_ROOM },
  presetId: null,
  placements: [
    {
      id: "p0",
      wall: "B",
      alongMm: 2400,
      y0Mm: 0,
      body: { buildId: "base-sink-800", widthMm: 800, heightMm: 820 },
    },
  ],
  createdAt: NOW,
  updatedAt: NOW,
};

describe("the room correction composes with the version 1 normalisation", () => {
  /** What version 1 *means* is a document that may carry an `emptyColumns` entry wider than ADR
   *  0052's ceiling, and the five stored rows are stamped 1. So a v1 document carrying both legacy
   *  shapes at once — an oversized entry and the pre-correction room — is the case the two arms
   *  exist to handle together, and neither may disable the other. */
  const OVERSIZED_STRIP: EmptyColumn = {
    wall: "A",
    alongMm: 900,
    widthMm: MAX_EMPTY_COLUMN_WIDTH_MM + 100,
    y0Mm: 0,
    topMm: 820,
    depthMm: 580,
  };

  const CARRIES_BOTH_LEGACY_SHAPES: Design = {
    ...NEEDS_THE_CORRECTION,
    emptyColumns: [OVERSIZED_STRIP],
  };

  it("is the shape version 1 was invented for, legal under the rule that wrote it", () => {
    expect(wasLegalWhenWritten(CARRIES_BOTH_LEGACY_SHAPES)).toBe(true);
  });

  it("corrects the room and splits the entry, in one load", () => {
    const loaded = migrateDesign(1, stored(CARRIES_BOTH_LEGACY_SHAPES));

    expect(loaded.room).toStrictEqual({
      ...PRE_CORRECTION_ROOM,
      widthMm: 3560,
      depthMm: 2830,
    });
    expect(loaded.emptyColumns).toHaveLength(2);
  });

  /** The same document without the oversized entry, to prove the entry is what makes the difference
   *  and not anything else about the document. */
  it("corrects the room when the entry is absent", () => {
    expect(migrateDesign(1, stored(NEEDS_THE_CORRECTION)).room.depthMm).toBe(
      2830,
    );
  });
});

// **TWO REGRESSIONS BELOW WERE INHERITED BY WAVE 6A3 AND FLIPPED FROM `it.fails` TO `it`.**
//
// **What fails.** A document written under the pre-correction bound may place a body in the band
// the correction removed — wall A lost 3600 → 3560, wall B lost an inherited 3600 → 2830. It was
// legal when it was written, the corrected room does not hold it, and `PLACEMENT_PAST_WALL_END`
// was **fatal on load**, so `migrateDesign` threw and the share link stopped opening.
//
// **There is no fix inside `migrate-design.ts`, and none should be attempted.** A body at 3200 on
// wall B is past the real wall; no room value the migration could write makes that untrue, and
// writing one would rescue the customer into a room they never entered — the exact failure the
// correction's third guard exists to prevent. The bound is right. Its *fatality* is the defect.
//
// Wave 6A3 makes it a **mark** rather than a refusal (ADR 0065 decision 7: an overflowing design
// "saves and resumes with the warning intact"). The assertions are unchanged from the expected-
// failure form, so the executable statement that a pre-correction share link must keep opening
// survives the hand-off.
describe("a pre-correction document edited past the corrected runs", () => {
  /** The correction narrows wall A from 3600 to 3560 and wall B from an inherited 3600 to 2830, so
   *  a document written under the old bound may sit in the band between. It was legal when written
   *  and the corrected room does not hold it, which is the branch that returns the document by
   *  identity. Complete validation retains its `PLACEMENT_PAST_WALL_END` diagnostic, and
   *  `assertDesignValidForCatalog` filters that one non-fatal mark before allowing the load.
   *
   *  ADR 0065 decision 7 says an overflowing design **saves and resumes with the warning intact**.
   *  The former refusal lost that work and stopped the share link opening. */
  const EDITED_PAST_WALL_A: Design = {
    ...KITCHEN_L_DESIGN,
    room: { ...PRE_CORRECTION_ROOM },
    emptyColumns: [
      {
        wall: "A",
        alongMm: 3550,
        widthMm: 100,
        y0Mm: 0,
        topMm: 820,
        depthMm: 580,
      },
    ],
  };

  /** The repository's own write-seam test asserted a 200 for exactly this strip until 2026-09-03
   *  (`payload-limits.test.ts`, "stores an empty column that abuts a placement"), so this is not a
   *  hypothetical document. */
  it("was legal under the rule that wrote it", () => {
    expect(wasLegalWhenWritten(EDITED_PAST_WALL_A)).toBe(true);
  });

  it("still loads after wave 6A3 makes placement overflow non-fatal", () => {
    expect(() => migrateDesign(2, stored(EDITED_PAST_WALL_A))).not.toThrow(
      InvalidDesignError,
    );
  });

  /** Wall B's band is 770 mm wide, not 40: the old bound handed wall B the room's width, so a body
   *  anywhere up to 3600 was legal on it and only 2830 survives the correction. */
  const EDITED_PAST_WALL_B: Design = {
    ...NEEDS_THE_CORRECTION,
    placements: NEEDS_THE_CORRECTION.placements.map((placement) => ({
      ...placement,
      alongMm: 3000,
    })),
  };

  it("was legal on wall B too, at a coordinate the corrected depth cannot hold", () => {
    expect(wasLegalWhenWritten(EDITED_PAST_WALL_B)).toBe(true);
  });

  it("still loads from wall B after wave 6A3", () => {
    expect(() => migrateDesign(2, stored(EDITED_PAST_WALL_B))).not.toThrow(
      InvalidDesignError,
    );
  });

  /** **The room is a constant and the mark survives the correction, so nothing was rescued.**
   *  ADR 0069 decision 5 overturned the behaviour this test used to pin — declining the correction
   *  whenever one body overflowed. What makes the rewrite safe was never that the result validates;
   *  it is that `{3560, 2830}` is a constant reached only from the exact pre-correction pair, never
   *  a value derived from where the bodies stand. So the room is corrected, every placement comes
   *  back byte-identical `alongMm` included, and the body at 3000 is still past wall B. */
  it.each([1, 2])(
    "corrects the room without moving or unmarking the overflow at version %i",
    (version) => {
      const loaded = migrateDesign(version, stored(EDITED_PAST_WALL_B));

      expect(loaded.room).toStrictEqual({
        ...PRE_CORRECTION_ROOM,
        widthMm: CORRECTED_ROOM_MM.widthMm,
        depthMm: CORRECTED_ROOM_MM.depthMm,
      });
      expect(loaded.placements).toStrictEqual(EDITED_PAST_WALL_B.placements);
      expect(findOverflowingPlacementIds(loaded)).toStrictEqual(["p0"]);
    },
  );

  /** A corrected-and-still-overflowing document is a **fixed point**: loading it again — at the
   *  version it is now stamped with, and at the older ones a mis-stamped row could claim — must not
   *  move the room a second time or touch a placement. */
  it.each([1, 2, 3])(
    "returns the corrected-and-still-overflowing document unchanged at version %i",
    (version) => {
      const corrected = migrateDesign(2, stored(EDITED_PAST_WALL_B));

      expect(migrateDesign(version, stored(corrected))).toStrictEqual(
        corrected,
      );
    },
  );

  /** **The phantom pair is the defect's signature.** A whole seeded row plus one edited body must
   *  report that one id — not `['edited', 'p24', 'p7']`, which is what the uncorrected 2400 mm
   *  depth says about two seeded bodies ending at 2800 that nobody moved. */
  const SEEDED_ROW_WITH_ONE_EDITED_BODY: Design = {
    ...KITCHEN_L_DESIGN,
    room: { ...PRE_CORRECTION_ROOM },
    placements: [
      ...KITCHEN_L_DESIGN.placements,
      {
        id: "edited",
        wall: "B",
        alongMm: 3200,
        y0Mm: 0,
        body: { buildId: "base-sink-800", widthMm: 800, heightMm: 820 },
      },
    ],
  };

  it.each([1, 2])(
    "names only the body the customer moved on a whole seeded row at version %i",
    (version) => {
      const loaded = migrateDesign(
        version,
        stored(SEEDED_ROW_WITH_ONE_EDITED_BODY),
      );

      expect(findOverflowingPlacementIds(loaded)).toStrictEqual(["edited"]);
    },
  );

  const FATAL_COMPANIONS: readonly {
    name: string;
    document: unknown;
  }[] = [
    {
      name: "a malformed root",
      document: { ...EDITED_PAST_WALL_B, attackerField: "not in the schema" },
    },
    {
      name: "an unknown body",
      document: {
        ...EDITED_PAST_WALL_B,
        placements: EDITED_PAST_WALL_B.placements.map((placement) => ({
          ...placement,
          body: { ...placement.body, buildId: "unknown-builder" },
        })),
      },
    },
    {
      name: "a duplicate placement id",
      document: {
        ...EDITED_PAST_WALL_B,
        placements: [
          ...EDITED_PAST_WALL_B.placements,
          {
            ...EDITED_PAST_WALL_B.placements[0],
            alongMm: 1000,
          },
        ],
      },
    },
    {
      name: "a body above the ceiling",
      document: {
        ...EDITED_PAST_WALL_B,
        placements: EDITED_PAST_WALL_B.placements.map((placement) => ({
          ...placement,
          y0Mm: PRE_CORRECTION_ROOM.heightMm,
        })),
      },
    },
    {
      name: "a second body before the wall start",
      document: {
        ...EDITED_PAST_WALL_B,
        placements: [
          ...EDITED_PAST_WALL_B.placements,
          {
            ...EDITED_PAST_WALL_B.placements[0],
            id: "before-start",
            alongMm: 100,
          },
        ],
      },
    },
  ];

  it.each(
    [1, 2].flatMap((version) =>
      FATAL_COMPANIONS.map((sample) => ({ version, ...sample })),
    ),
  )(
    "still refuses $name beside overflow at pre-correction version $version",
    ({ version, document }) => {
      expect(() => migrateDesign(version, stored(document as Design))).toThrow(
        InvalidDesignError,
      );
    },
  );
});

describe("the version gate is the only guard on a room nobody asked to change", () => {
  /** An arbitrary synthetic 3600 × 2400 carrying nothing at all: valid exactly as stored, and
   *  therefore the document that used to be returned by identity. */
  const SYNTHETIC_EMPTY_ROOM: Design = {
    room: { ...PRE_CORRECTION_ROOM },
    presetId: null,
    placements: [],
    createdAt: NOW,
    updatedAt: NOW,
  };

  /** **Corrected now, and it used to come back untouched** (ADR 0069 decision 5b). The guard that
   *  declined the correction for a document already valid under the *wrong* room is deleted:
   *  whether the bodies happen to fit has no bearing on whether the wall was measured correctly,
   *  and before M7 there is no room control, so at version ≤ 2 the pair has exactly one origin and
   *  the correction is owed unconditionally. Everything but the room is byte-identical. */
  it.each([1, 2])(
    "corrects a document that was already valid under the wrong room, at version %i",
    (version) => {
      const migrated = migrateDesign(version, stored(SYNTHETIC_EMPTY_ROOM));

      expect(migrated).toStrictEqual({
        ...SYNTHETIC_EMPTY_ROOM,
        room: { ...SYNTHETIC_EMPTY_ROOM.room, ...CORRECTED_ROOM_MM },
        settings: { cabinetDepthMm: 600 },
      });
      expect(migrated.placements).toStrictEqual(
        SYNTHETIC_EMPTY_ROOM.placements,
      );
    },
  );

  /** The room arm is not reached at version 3; only 6J's later persisted-depth arm is. */
  it("keeps the room unchanged while version 3 gains cabinet depth", () => {
    expect(migrateDesign(3, stored(SYNTHETIC_EMPTY_ROOM))).toStrictEqual({
      ...SYNTHETIC_EMPTY_ROOM,
      settings: { cabinetDepthMm: 600 },
    });
  });

  /** M7's customer, who genuinely enters 3600 × 2400. Written at version 3, where no arm may reach
   *  it — byte for byte, including the room. */
  it("hands a version 3 document back byte for byte", () => {
    const customerKitchen: Design = {
      ...NEEDS_THE_CORRECTION,
      placements: NEEDS_THE_CORRECTION.placements.map((placement) => ({
        ...placement,
        wall: "A" as const,
      })),
    };
    const document = stored(customerKitchen);

    // `document` is `unknown` — the type the migration seam must accept — so the expectation is
    // built from the design it was serialised from. `stored` is a JSON round trip, so the two carry
    // the same bytes, which is what this test compares.
    expect(JSON.stringify(migrateDesign(3, document))).toBe(
      JSON.stringify({ ...customerKitchen, settings: { cabinetDepthMm: 600 } }),
    );
  });

  /** And when their placements genuinely do not fit their own room, their room is not rewritten:
   *  the design loads with the diagnostic mark against the dimensions they entered. */
  it("loads a version 3 misfit in its own room without rescuing it", () => {
    expect(migrateDesign(3, stored(NEEDS_THE_CORRECTION))).toStrictEqual({
      ...NEEDS_THE_CORRECTION,
      settings: { cabinetDepthMm: 600 },
    });
    expect(
      validateDesignForCatalog(NEEDS_THE_CORRECTION, CATALOG).map(
        (issue) => issue.code,
      ),
    ).toStrictEqual(["PLACEMENT_PAST_WALL_END"]);
  });
});

describe("the chain is a fixed point, which is what makes restamping safe", () => {
  /** `neon-configuration-repository.ts` restamps every loaded row at `CURRENT_SCHEMA_VERSION`, so a
   *  document that has been through an older arm is read at 3 next time. Running it through again
   *  must change nothing, or the restamp is losing information. */
  const CORRECTED = migrateDesign(1, stored(NEEDS_THE_CORRECTION));

  it.each([1, 2, 3])("is identity when re-run at version %i", (version) => {
    expect(migrateDesign(version, stored(CORRECTED))).toStrictEqual(CORRECTED);
  });

  it("is identity on the seeded document at every version", () => {
    for (const version of [1, 2, 3]) {
      expect(migrateDesign(version, stored(KITCHEN_L_DESIGN))).toStrictEqual(
        KITCHEN_L_DESIGN,
      );
    }
  });
});
