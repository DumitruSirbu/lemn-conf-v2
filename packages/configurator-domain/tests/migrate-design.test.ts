import { describe, expect, it } from "vitest";

import type { Design } from "../src/design.js";
import { KITCHEN_L_DESIGN } from "../src/fixtures/kitchen-l-design.js";
import { migrateDesign } from "../src/migrate-design.js";
import { InvalidDesignError } from "../src/repository.js";

const validDesignV1 = {
  room: { shape: "L", widthMm: 3600, depthMm: 2400, heightMm: 2600 },
  presetId: null,
  placements: [],
  createdAt: "2026-08-25T00:00:00.000Z",
  updatedAt: "2026-08-25T00:00:00.000Z",
};

describe("migrateDesign", () => {
  it("passes a valid version 1 payload through unchanged", () => {
    expect(migrateDesign(1, validDesignV1)).toEqual(validDesignV1);
  });

  it("throws InvalidDesignError, not a raw Zod error, for an invalid payload", () => {
    const invalid = { ...validDesignV1, room: undefined };

    expect(() => migrateDesign(1, invalid)).toThrow(InvalidDesignError);
  });

  it("throws a clear error for an unsupported schema version", () => {
    expect(() => migrateDesign(4, validDesignV1)).toThrow(InvalidDesignError);
    expect(() => migrateDesign(4, validDesignV1)).toThrow(
      /unsupported schema version/,
    );
  });
});

/** The room correction of 2026-09-03 moved the seeded kitchen from `3600 × 2400` to `3560 × 2830`
 *  and made the along-wall bound each wall's own run. Every document at schema version 2 or below
 *  was written from the seed as it then stood — five rows, measured 2026-09-02 — so their wall B
 *  bodies now end past a 2400 mm depth and the load path refuses them. `migrateFromV2` corrects the
 *  room instead, the same way `migrateFromV1` normalises an oversized `emptyColumns` entry. */
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

    expect(() => migrateDesign(3, stored)).toThrow(InvalidDesignError);
    expect(migrateDesign(3, { ...stored, placements: [] })).toStrictEqual({
      ...stored,
      placements: [],
    });
  });

  /** The second half of the same guard, one version down: even at version 2, a document its stored
   *  room already holds is not a candidate. Only a document the correction actually repairs is
   *  rewritten, so the correction can never be the thing that changes a working kitchen. */
  it("leaves a version 2 document the pre-correction room already holds alone", () => {
    const fits = JSON.parse(
      JSON.stringify({
        ...KITCHEN_L_DESIGN,
        room: PRE_CORRECTION_ROOM,
        placements: [],
      }),
    ) as Design;

    expect(migrateDesign(2, fits)).toStrictEqual(fits);
  });
});
