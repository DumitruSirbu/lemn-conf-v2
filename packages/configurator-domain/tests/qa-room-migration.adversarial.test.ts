import { describe, expect, it } from "vitest";

import type { Design, EmptyColumn } from "../src/design.js";
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../src/fixtures/kitchen-l-design.js";
import { migrateDesign } from "../src/migrate-design.js";
import { MAX_EMPTY_COLUMN_WIDTH_MM } from "../src/module-grid.js";
import { InvalidDesignError } from "../src/repository.js";
import { validateDesignForCatalog } from "../src/validate-design.js";

const CATALOG = KITCHEN_L_BODY_CATALOG;
const NOW = "2026-08-25T00:00:00.000Z";

const PRE_CORRECTION_ROOM = {
  shape: "L",
  widthMm: 3600,
  depthMm: 2400,
  heightMm: 2600,
} as const;

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

// **TWO EXPECTED FAILURES BELOW, OWNED BY WAVE 6A3 — `it.fails`, not `it.skip`.**
//
// **What fails.** A document written under the pre-correction bound may place a body in the band
// the correction removed — wall A lost 3600 → 3560, wall B lost an inherited 3600 → 2830. It was
// legal when it was written, the corrected room does not hold it, and `PLACEMENT_PAST_WALL_END` is
// **fatal on load** today, so `migrateDesign` throws and the share link stops opening.
//
// **There is no fix inside `migrate-design.ts`, and none should be attempted.** A body at 3200 on
// wall B is past the real wall; no room value the migration could write makes that untrue, and
// writing one would rescue the customer into a room they never entered — the exact failure the
// correction's third guard exists to prevent. The bound is right. Its *fatality* is the defect.
//
// **What makes these pass.** Wave 6A3, making a body past the end of its wall a **mark** rather
// than a refusal (ADR 0065 decision 7: an overflowing design "saves and resumes with the warning
// intact"). At that point the document loads, carrying its warning.
//
// **When they start passing, `it.fails` itself goes red. The correct response is to flip
// `it.fails` back to `it` — one word — and never to delete the test.** The assertions below are
// already the assertions 6A3 must satisfy; they are not weakened, and deleting them would retire
// the only executable statement that a pre-correction share link must keep opening.
describe("a pre-correction document edited past the corrected runs", () => {
  /** The correction narrows wall A from 3600 to 3560 and wall B from an inherited 3600 to 2830, so
   *  a document written under the old bound may sit in the band between. It was legal when written
   *  and the corrected room does not hold it, which is the branch that returns the document by
   *  identity — and `assertDesignValidForCatalog` then refuses it.
   *
   *  ADR 0065 decision 7 says an overflowing design **saves and resumes with the warning intact**.
   *  A refusal on load is not that: the work is lost and the share link stops opening. */
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

  // Flip to `it` when wave 6A3 lands; see the header above.
  it.fails("still loads — expected failure until wave 6A3", () => {
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

  // Flip to `it` when wave 6A3 lands; see the header above.
  it.fails("still loads from wall B — expected failure until wave 6A3", () => {
    expect(() => migrateDesign(2, stored(EDITED_PAST_WALL_B))).not.toThrow(
      InvalidDesignError,
    );
  });
});

describe("the guard against rewriting a room nobody asked to change", () => {
  /** `qa-5g.adversarial.test.ts`'s `EMPTY_ROOM`: an arbitrary synthetic 3600 × 2400 that happens to
   *  match the pre-correction pair and asserts the document comes back unchanged. It is valid as
   *  stored, so the third guard returns it by identity. */
  const SYNTHETIC_EMPTY_ROOM: Design = {
    room: { ...PRE_CORRECTION_ROOM },
    presetId: null,
    placements: [],
    createdAt: NOW,
    updatedAt: NOW,
  };

  it.each([1, 2, 3])(
    "returns a document its own room already holds unchanged, at version %i",
    (version) => {
      expect(
        migrateDesign(version, stored(SYNTHETIC_EMPTY_ROOM)),
      ).toStrictEqual(SYNTHETIC_EMPTY_ROOM);
    },
  );

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

    expect(JSON.stringify(migrateDesign(3, document))).toBe(
      JSON.stringify(document),
    );
  });

  /** And when their placements genuinely do not fit their own room, they are told so about **their**
   *  room rather than rescued into one they never entered. */
  it("refuses a version 3 misfit on its own room, naming its own issues", () => {
    expect(() => migrateDesign(3, stored(NEEDS_THE_CORRECTION))).toThrow(
      InvalidDesignError,
    );
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
