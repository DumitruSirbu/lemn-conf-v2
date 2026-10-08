// M7B U5 review (AC8): which shapes carry a corner direction is one domain fact, and the three places
// that state it agree.
//
// `carriesCornerDirection(shape)` is the shape-level question; `cornerDirectionOf(room)` is the same
// question asked of a room; `DesignRoomSchema` is the storage's own refusal of a right-hand U. The web
// used to spell the answer itself (`ONE_HANDED_SHAPES`), so the three could drift; this file is what
// fails if the domain's own answers ever stop agreeing. Every shape the type names is walked —
// `EVERY_SHAPE` is a `Record<DesignRoomShape, …>`, so a fourth shape is a compile error here first.
import { describe, expect, it } from "vitest";

import {
  carriesCornerDirection,
  cornerDirectionOf,
  DesignRoomSchema,
  type DesignRoom,
} from "../../src/index.js";
import type { DesignRoomShape } from "../../src/design.js";

const EVERY_SHAPE = {
  linear: true,
  L: true,
  U: true,
} as const satisfies Readonly<Record<DesignRoomShape, true>>;

const SHAPES = Object.keys(EVERY_SHAPE) as readonly DesignRoomShape[];

/** What a stored right-hand room of each shape meets: tolerated and ignored on a straight room, carried on an
 *  L, refused on a U. */
const RIGHT_HAND_ROOM_BY_SHAPE: Readonly<
  Record<DesignRoomShape, { schemaAccepts: boolean; carries: boolean }>
> = {
  linear: { schemaAccepts: true, carries: false },
  L: { schemaAccepts: true, carries: true },
  U: { schemaAccepts: false, carries: false },
};

function rightHandRoomOf(shape: DesignRoomShape): DesignRoom {
  return {
    shape,
    widthMm: 3600,
    depthMm: 2400,
    ...(shape === "U" ? { wallCMm: 2400 } : {}),
    heightMm: 2600,
    cornerDirection: "right",
  };
}

describe.each(SHAPES)("%s: carriesCornerDirection", (shape) => {
  it("is exactly whether a room of that shape can be right-hand, by cornerDirectionOf", () => {
    const room = rightHandRoomOf(shape);

    expect(carriesCornerDirection(shape)).toBe(
      cornerDirectionOf(room) === "right",
    );
  });

  it("is never false for a shape the schema lets a right-hand room through as anything but ignored", () => {
    const stored = DesignRoomSchema.safeParse(rightHandRoomOf(shape));

    // The schema refuses a right-hand U outright. It tolerates a stored key on a straight room and
    // `cornerDirectionOf` never reads it (ADR 0130 D7), so acceptance alone does not make a shape carry
    // a direction — but a shape that carries one must be one the schema accepts it on.
    if (carriesCornerDirection(shape)) expect(stored.success).toBe(true);
    if (!stored.success) expect(carriesCornerDirection(shape)).toBe(false);
    // Both guards above are skipped for a straight room, so each shape's pair is also stated outright.
    expect({
      schemaAccepts: stored.success,
      carries: carriesCornerDirection(shape),
    }).toEqual(RIGHT_HAND_ROOM_BY_SHAPE[shape]);
  });
});

describe("the shapes that do and do not", () => {
  // ADR 0132 decision 8: a U has no right-hand variant, so `cornerDirectionOf` reads left for one
  // whatever a stored document says — the function is the rule's own backstop, as for a straight room.
  it("is true for an L and false for a straight room and for a U", () => {
    expect(carriesCornerDirection("L")).toBe(true);
    expect(carriesCornerDirection("linear")).toBe(false);
    expect(carriesCornerDirection("U")).toBe(false);
  });

  it("agrees with the schema's refusal of a right-hand U, the reason a U carries none", () => {
    const refused = DesignRoomSchema.safeParse(rightHandRoomOf("U"));

    expect(refused.success).toBe(false);
    expect(carriesCornerDirection("U")).toBe(false);
  });

  it("carries the direction an L stores, and nothing else does", () => {
    expect(cornerDirectionOf(rightHandRoomOf("L"))).toBe("right");
    expect(cornerDirectionOf(rightHandRoomOf("linear"))).toBe("left");
    expect(cornerDirectionOf(rightHandRoomOf("U"))).toBe("left");
  });
});
