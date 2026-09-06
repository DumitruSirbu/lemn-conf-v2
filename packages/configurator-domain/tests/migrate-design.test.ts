import { describe, expect, it } from "vitest";

import type { Design, EmptyColumn } from "../src/design.js";
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../src/fixtures/kitchen-l-design.js";
import {
  CURRENT_SCHEMA_VERSION,
  migrateDesign,
} from "../src/migrate-design.js";
import { MAX_EMPTY_COLUMN_WIDTH_MM } from "../src/module-grid.js";
import { InvalidDesignError } from "../src/repository.js";
import {
  fatalDesignValidationIssues,
  validateDesignForCatalog,
} from "../src/validate-design.js";

/** The room is deliberately **not** `3600 × 2400`: that pair is the room correction's trigger, and
 *  these tests are about a payload surviving migration rather than about a room. Any other pair
 *  does, so this one is left where it was when the demo's wall B moved to 2920. */
const validDesignV1 = {
  room: { shape: "L", widthMm: 3560, depthMm: 2830, heightMm: 2600 },
  presetId: null,
  placements: [],
  createdAt: "2026-08-25T00:00:00.000Z",
  updatedAt: "2026-08-25T00:00:00.000Z",
};

describe("migrateDesign", () => {
  it("normalises a valid version 1 payload to the shipped depth", () => {
    expect(migrateDesign(1, validDesignV1)).toEqual({
      ...validDesignV1,
      settings: { cabinetDepthMm: 600 },
    });
  });

  it("throws InvalidDesignError, not a raw Zod error, for an invalid payload", () => {
    const invalid = { ...validDesignV1, room: undefined };

    expect(() => migrateDesign(1, invalid)).toThrow(InvalidDesignError);
  });

  // Derived from `CURRENT_SCHEMA_VERSION` rather than written as a literal: this test was pinned at
  // 5 and stopped testing anything the moment wave 6P made 5 the current version. One past the
  // current version is the case it means, at every future bump.
  it("throws a clear error for an unsupported schema version", () => {
    const beyondCurrent = CURRENT_SCHEMA_VERSION + 1;

    expect(() => migrateDesign(beyondCurrent, validDesignV1)).toThrow(
      InvalidDesignError,
    );
    expect(() => migrateDesign(beyondCurrent, validDesignV1)).toThrow(
      /unsupported schema version/,
    );
  });
});

/** The room correction of 2026-09-03 moved the seeded kitchen off `3600 × 2400` and made the
 *  along-wall bound each wall's own run. Every document at schema version 2 or below was written
 *  from the seed as it then stood — five rows, measured 2026-09-02 — so their wall B bodies now end
 *  past a 2400 mm depth and the load path refuses them. `migrateFromV2` corrects the room instead,
 *  the same way `migrateFromV1` normalises an oversized `emptyColumns` entry.
 *
 *  **The room it corrects into is read off the fixture, never restated here** (ADR 0083 decision 9).
 *  The arm repairs rows that *are* copies of the demo, so a correction into a room the demo no
 *  longer has would rescue a row into an envelope nobody ships — and a customer of that row then
 *  choosing the 700 mm depth would overflow where the demo does not. */
describe("the room correction, on a document stored before it", () => {
  const PRE_CORRECTION_ROOM = {
    shape: "L",
    widthMm: 3600,
    depthMm: 2400,
    heightMm: 2600,
  } as const;

  /** Through `JSON` first, because that is what a stored row is. */
  function storedAtOldRoom(): unknown {
    return JSON.parse(
      JSON.stringify({ ...KITCHEN_L_DESIGN, room: PRE_CORRECTION_ROOM }),
    ) as unknown;
  }

  it("loads a version 2 seeded document and hands back the corrected room", () => {
    const loaded = migrateDesign(2, storedAtOldRoom());

    expect(loaded.room).toStrictEqual(KITCHEN_L_DESIGN.room);
  });

  it("corrects a version 1 document too, since the stored rows are stamped 1", () => {
    expect(migrateDesign(1, storedAtOldRoom()).room).toStrictEqual(
      KITCHEN_L_DESIGN.room,
    );
  });

  it("changes nothing but the room", () => {
    const stored = storedAtOldRoom() as Design;

    expect(migrateDesign(2, stored)).toStrictEqual({
      ...stored,
      room: KITCHEN_L_DESIGN.room,
    });
  });

  /** A load that changes nothing must not rewrite the object a later save is diffed against. */
  it("returns a document already carrying the corrected room by identity", () => {
    const stored = JSON.parse(JSON.stringify(KITCHEN_L_DESIGN)) as Design;

    expect(migrateDesign(2, stored)).toStrictEqual(stored);
  });

  /** The guard M7 needs. A customer may genuinely own a 3600 × 2400 room, and once they can enter
   *  one it is written at version 3 — where no arm may touch it. Rewriting it would silently change
   *  their kitchen. */
  it("leaves a version 3 document declaring the same dimensions exactly as it is", () => {
    const customerRoom = { ...KITCHEN_L_DESIGN, room: PRE_CORRECTION_ROOM };
    const stored = JSON.parse(JSON.stringify(customerRoom)) as Design;

    expect(migrateDesign(3, stored)).toStrictEqual(stored);
    expect(migrateDesign(3, { ...stored, placements: [] })).toStrictEqual({
      ...stored,
      placements: [],
    });
  });

  /** **This used to assert the opposite, and the claim it made is overturned** (ADR 0069 decision
   *  5b): *"a document its stored room already holds is not a candidate… so the correction can
   *  never be the thing that changes a working kitchen"*. That guard asked whether the bodies
   *  happen to fit under the **wrong** room, which has no bearing on whether the wall was measured
   *  correctly — it declined the correction for the rows that were fine and applied it to the ones
   *  that were not. Before M7 there is no room control, so at version ≤ 2 the pre-correction pair
   *  has exactly one origin and the correction is owed unconditionally. The version gate above is
   *  what protects a genuine M7 customer. */
  it("corrects a version 2 document that fits under the pre-correction room", () => {
    const fits = JSON.parse(
      JSON.stringify({
        ...KITCHEN_L_DESIGN,
        room: PRE_CORRECTION_ROOM,
        placements: [],
      }),
    ) as Design;

    expect(migrateDesign(2, fits)).toStrictEqual({
      ...fits,
      room: {
        ...fits.room,
        widthMm: KITCHEN_L_DESIGN.room.widthMm,
        depthMm: KITCHEN_L_DESIGN.room.depthMm,
      },
    });
  });
});

/** A version 1 document carrying **both** legacy shapes at once — an oversized `emptyColumns` entry
 *  and the pre-correction room. This is what version 1 means, not an exotic combination: the five
 *  stored rows are stamped 1, and `design-db-restore.md`'s restore script pushes every dumped row
 *  back through `migrateDesign` at the version it was dumped at.
 *
 *  The two normalisations must compose. `correctPreCorrectionRoom` used to ask whether the corrected
 *  room rescues the document *absolutely*, so an oversized entry — which refuses it for a reason
 *  that has nothing to do with the room — vetoed the correction while it ran first. Since ADR 0085
 *  the guard compares the two rooms instead, so an oversized entry is a finding carried under both
 *  and can no longer veto; these tests hold either way and are what says so. */
describe("the version 1 normalisation and the room correction, on one document", () => {
  const PRE_CORRECTION_ROOM = {
    shape: "L",
    widthMm: 3600,
    depthMm: 2400,
    heightMm: 2600,
  } as const;

  /** One body on wall B ending at 2800 — the seeded `p7`'s extent — so the room is the only thing
   *  that can refuse this document, and a strip on the far side of wall A that meets nothing. */
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
    createdAt: "2026-08-25T00:00:00.000Z",
    updatedAt: "2026-08-25T00:00:00.000Z",
  };

  const OVERSIZED_STRIP: EmptyColumn = {
    wall: "A",
    alongMm: 900,
    widthMm: MAX_EMPTY_COLUMN_WIDTH_MM + 100,
    y0Mm: 0,
    topMm: 820,
    depthMm: 580,
  };

  function stored(design: Design): unknown {
    return JSON.parse(JSON.stringify(design)) as unknown;
  }

  const CARRIES_BOTH: Design = {
    ...NEEDS_THE_CORRECTION,
    emptyColumns: [OVERSIZED_STRIP],
  };

  it("corrects the room and splits the entry in one load", () => {
    const loaded = migrateDesign(1, stored(CARRIES_BOTH));

    expect(loaded.room.depthMm).toBe(KITCHEN_L_DESIGN.room.depthMm);
    expect(loaded.emptyColumns?.map((entry) => entry.widthMm)).toStrictEqual([
      MAX_EMPTY_COLUMN_WIDTH_MM,
      100,
    ]);
  });

  /** The ordering property itself, so a later arm appended in the wrong place fails here rather
   *  than in whichever stored document happens to carry two legacy shapes: an older normalisation's
   *  unfinished business must not be able to veto a younger one. */
  it("corrects the room whether or not the oversized entry is present", () => {
    expect(migrateDesign(1, stored(CARRIES_BOTH)).room).toStrictEqual(
      migrateDesign(1, stored(NEEDS_THE_CORRECTION)).room,
    );
  });
});

/** **The guard is a comparison, and these are the two documents that say so** — ADR 0085 decision 2
 *  and its acceptance criteria 2 and 3.
 *
 *  Guard 2 declines the room correction if and only if the corrected document carries a fatal
 *  finding the uncorrected one does not. Everything about that predicate that could be got wrong is
 *  got wrong quietly: delete it and the correction always fires; compare by count and a swap goes
 *  unnoticed; compare by code alone and the same code at a new path goes unnoticed. So the guard
 *  needs a witness that it still declines, and a witness that it declines on a swap.
 *
 *  Both are built from the seeded design at the pre-correction pair plus empty columns the
 *  correction's own narrowing can reach. Wall B's across-wall bound is the room's `widthMm`
 *  (3600 → 3560) and wall A's is its `depthMm` (2400 → 2920), so one column can be made fatal only
 *  after the correction and the other fatal only before it. Both sit in bands the seeded placements
 *  leave free, so `EMPTY_COLUMN_DEEPER_THAN_ROOM` is the only fatal finding either produces. */
describe("the room correction's guard, on documents the correction itself changes", () => {
  const PRE_CORRECTION_ROOM = {
    shape: "L",
    widthMm: 3600,
    depthMm: 2400,
    heightMm: 2600,
  } as const;

  /** Fatal only **after** the correction: 3580 is within a 3600 wall-B bound and past a 3560 one. */
  const DEEPER_THAN_THE_CORRECTED_WIDTH: EmptyColumn = {
    wall: "B",
    alongMm: 300,
    widthMm: 400,
    y0Mm: 0,
    topMm: 820,
    depthMm: 3580,
  };

  /** Fatal only **before** the correction: 2500 is past a 2400 wall-A bound and within the
   *  corrected depth, whatever the fixture declares it to be (2920 since ADR 0083). */
  const DEEPER_THAN_THE_STORED_DEPTH: EmptyColumn = {
    wall: "A",
    alongMm: 3530,
    widthMm: 40,
    y0Mm: 0,
    topMm: 820,
    depthMm: 2500,
  };

  function storedWith(emptyColumns: readonly EmptyColumn[]): unknown {
    return JSON.parse(
      JSON.stringify({
        ...KITCHEN_L_DESIGN,
        room: PRE_CORRECTION_ROOM,
        emptyColumns,
      }),
    ) as unknown;
  }

  function fatalCount(design: Design): number {
    return fatalDesignValidationIssues(
      validateDesignForCatalog(design, KITCHEN_L_BODY_CATALOG),
    ).length;
  }

  function atRoom(design: Design, room: Partial<Design["room"]>): Design {
    return { ...design, room: { ...design.room, ...room } };
  }

  /** The refusal's own text, which names each finding as `path:code` and is the only place the room
   *  a document was holding when it failed is observable. */
  function refusalMessageOf(load: () => unknown): string {
    try {
      load();
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
    throw new Error("the load was expected to refuse and did not");
  }

  /** Criterion 2, and the reason the change is not a deletion of guard 2: the correction narrows
   *  wall A by 40 mm, so it genuinely can turn a loading document into a refusing one — a dead
   *  `/d/{id}` link (ADR 0052) — and where it would, it declines. */
  it("declines when the correction is what makes a column deeper than its wall", () => {
    const loaded = migrateDesign(
      2,
      storedWith([DEEPER_THAN_THE_CORRECTED_WIDTH]),
    );

    expect(loaded.room.widthMm).toBe(PRE_CORRECTION_ROOM.widthMm);
    expect(loaded.room.depthMm).toBe(PRE_CORRECTION_ROOM.depthMm);
  });

  /** Criterion 3. The correction removes the wall A finding and creates the wall B one, so the two
   *  documents carry the same number of fatal findings and the same single code — only the path
   *  moves. A guard comparing counts, or comparing the set of codes, corrects this document.
   *
   *  **The decline is read off the refusal, because there is no other observable.** A document whose
   *  *stored* room is fatal throws whichever way the guard answers, so what distinguishes them is
   *  the room it was holding when it failed: declined, it fails on the wall A entry at
   *  `emptyColumns.0`; corrected, it would fail on the wall B entry at `emptyColumns.1`. */
  it("declines when the correction swaps one fatal finding for another at a different path", () => {
    const both = [
      DEEPER_THAN_THE_STORED_DEPTH,
      DEEPER_THAN_THE_CORRECTED_WIDTH,
    ];
    const stored = storedWith(both) as Design;

    expect(fatalCount(stored)).toBe(1);
    expect(fatalCount(atRoom(stored, KITCHEN_L_DESIGN.room))).toBe(1);

    const refusal = refusalMessageOf(() => migrateDesign(2, storedWith(both)));

    expect(refusal).toContain(
      "emptyColumns.0.depthMm:EMPTY_COLUMN_DEEPER_THAN_ROOM",
    );
    expect(refusal).not.toContain("emptyColumns.1");
  });

  /** The other side of the same guard, so neither witness is passing for a reason that would also
   *  make the guard vacuous: with each column on its own the correction has nothing to answer for,
   *  and it fires. */
  it("corrects when the column was already deeper than the wall it stands on", () => {
    expect(
      migrateDesign(2, storedWith([DEEPER_THAN_THE_STORED_DEPTH])).room,
    ).toStrictEqual(KITCHEN_L_DESIGN.room);
  });

  it("corrects the seeded design carrying no empty columns at all", () => {
    expect(migrateDesign(2, storedWith([])).room).toStrictEqual(
      KITCHEN_L_DESIGN.room,
    );
  });
});
