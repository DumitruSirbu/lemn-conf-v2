// Wave 7F2 slice S1: the issue model and its copy (criteria 1, 2, 3, 9's and 10's model arms, 11,
// 17, and the reachability guard). The model publishes descriptors — message keys, fields, wall ids —
// so the assertions below compare descriptors (engineering-conventions, *Localised copy* point 7);
// only the copy arms resolve a sentence, and they name no Romanian.
//
// **The expected side comes from outside the producer** (ADR 0121 decision 4): each sweep's arm is
// constructed from the approved policy's own bounds, and its expected fields are the arm's
// definition — never re-derived by asking `parseRoomUrlState` what it thinks.
import { fc } from "@fast-check/vitest";
import {
  APPROVED_ROOM_POLICY,
  isShapeBuildable,
  validateRoomInput,
  type CornerDirection,
  type LWallBounds,
  type RoomPolicy,
  type RoomShape,
  type UWallBounds,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import {
  createRoomDraft,
  withCornerDirection,
  withEnteredText,
  type RoomDraft,
  type RoomLengthField,
} from "@/room/room-draft";
import {
  deriveRoomIssueView,
  LINEAR_SUGGESTION_MESSAGE_KEY,
  ONE_C_NOTE_MESSAGE_KEY,
  ROOM_ISSUE_MESSAGE_KEYS,
  SHAPE_REFUSAL_MESSAGE_KEY,
  UNREADABLE_LENGTH_MESSAGE_KEY,
  type ReachableRoomIssueCode,
  type RoomIssueView,
} from "@/room/room-issue-model";
import { canonicalRoomQuery, queryEntriesOf } from "@/room/room-query-sync";
import { parseRoomUrlState, type RoomUrlState } from "@/room/room-url-state";

import {
  CATALOGUES,
  requireLeafAt,
  translatorFor,
} from "../support/catalogues";

const SAMPLES_PER_ARM = 100;

const ROOM_SHAPES: readonly RoomShape[] = ["linear", "L", "U"];

const DIRECTIONS: readonly CornerDirection[] = ["left", "right"];

/** The sweep's outer range, criterion 1: past both ends of every approved bound. */
const SWEPT_WALL_MM = { min: 100, max: 7000 } as const;
const SWEPT_CEILING_MM = { min: 1000, max: 5000 } as const;

/** The six codes sub-state 1C can carry, as a table the compiler holds total: a code the domain adds
 *  fails `satisfies` here as well as in the model. */
const REACHABLE_CODES = Object.keys({
  SHAPE_NOT_BUILDABLE: true,
  ROOM_TOO_SMALL_FOR_KITCHEN: true,
  WALL_TOO_SHORT: true,
  WALL_TOO_LONG: true,
  HEIGHT_TOO_LOW: true,
  HEIGHT_TOO_HIGH: true,
} satisfies Record<
  ReachableRoomIssueCode,
  true
>) as readonly ReachableRoomIssueCode[];

const WALL_LETTERS = ["A", "B", "C"] as const;

// ---------------------------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------------------------

interface TypedRoom {
  readonly shape: RoomShape;
  readonly texts: Partial<Record<RoomLengthField, string>>;
  readonly direction?: CornerDirection;
}

interface LRoomMm {
  readonly wallA: number;
  readonly wallB: number;
  readonly height: number;
}

function draftTyped({ shape, texts, direction }: TypedRoom): RoomDraft {
  const typed = Object.entries(texts).reduce(
    (draft, [field, text]) =>
      withEnteredText(draft, { field: field as RoomLengthField, text }),
    createRoomDraft(shape),
  );
  return direction === undefined
    ? typed
    : withCornerDirection(typed, direction);
}

function lDraft(room: LRoomMm, direction: CornerDirection = "left"): RoomDraft {
  return draftTyped({
    shape: "L",
    texts: {
      wallA: String(room.wallA),
      wallB: String(room.wallB),
      height: String(room.height),
    },
    direction,
  });
}

/** The draft's own parse — the question `room-screen.tsx`'s `roomInDraft` asks. */
function stateOfDraft(draft: RoomDraft): RoomUrlState {
  return parseRoomUrlState(
    queryEntriesOf(canonicalRoomQuery(draft).toString()),
  );
}

function viewOf(
  draft: RoomDraft,
  policy: RoomPolicy = APPROVED_ROOM_POLICY,
): RoomIssueView {
  return deriveRoomIssueView({
    draft,
    draftState: stateOfDraft(draft),
    policy,
  });
}

function reasonFieldsOf(view: RoomIssueView): readonly RoomLengthField[] {
  return view.fieldReasons.map((reason) => reason.field);
}

function approvedL(): LWallBounds {
  const bounds = APPROVED_ROOM_POLICY.buildableShapes.L;
  if (bounds === undefined)
    throw new Error("the approved policy states no L bounds");
  return bounds;
}

/** L's own bounds, reshaped into `UWallBounds` — wall C stands in for wall B's, the domain's own
 *  proof that the right corner's narrowest reach on wall C equals wall B's (`corner-assembly-
 *  size.ts`'s right-corner head comment). `APPROVED_ROOM_POLICY` states no U bounds of its own yet
 *  (the owner rules on them at U6), so this is a fabrication, not a read of the real policy. */
function approvedUStandIn(): UWallBounds {
  const l = approvedL();
  return { wallA: l.wallA, wallB: l.wallB, wallC: l.wallB };
}

/** R8's fabricated policy (ADR 0116): a second shape stated with L-derived bounds — only ever
 *  called with U below. Linear needs no such fabrication since 7J S5: it is real. */
function policyAlsoStating(shape: "U"): RoomPolicy {
  return {
    ...APPROVED_ROOM_POLICY,
    buildableShapes: {
      ...APPROVED_ROOM_POLICY.buildableShapes,
      [shape]: approvedUStandIn(),
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Arms, built from the approved policy's bounds
// ---------------------------------------------------------------------------------------------

const walls = approvedL();
const ceiling = APPROVED_ROOM_POLICY.heightBounds;
const kitchen = walls.minimumKitchen;
const bothBodiesMm = kitchen.sinkWidthMm + kitchen.hobWidthMm;

const aOk = fc.integer({ min: walls.wallA.minMm, max: walls.wallA.maxMm });
const bOk = fc.integer({ min: walls.wallB.minMm, max: walls.wallB.maxMm });
const aShort = fc.integer({
  min: SWEPT_WALL_MM.min,
  max: walls.wallA.minMm - 1,
});
const bShort = fc.integer({
  min: SWEPT_WALL_MM.min,
  max: walls.wallB.minMm - 1,
});
const aLong = fc.integer({
  min: walls.wallA.maxMm + 1,
  max: SWEPT_WALL_MM.max,
});
const bLong = fc.integer({
  min: walls.wallB.maxMm + 1,
  max: SWEPT_WALL_MM.max,
});
const heightOk = fc.integer({ min: ceiling.minMm, max: ceiling.maxMm });
const heightLow = fc.integer({
  min: SWEPT_CEILING_MM.min,
  max: ceiling.minMm - 1,
});
const heightHigh = fc.integer({
  min: ceiling.maxMm + 1,
  max: SWEPT_CEILING_MM.max,
});

/** Wall A long enough to hold the sink and the hob beyond the corner by itself, so the minimum
 *  kitchen holds whatever wall B is. */
const aHoldingTheKitchen = fc.integer({
  min: kitchen.cornerReachMm.wallA + bothBodiesMm,
  max: walls.wallA.maxMm,
});

/** In range on both walls and holding neither the pair on one wall nor the sink on B with the hob
 *  on A — the three ways `holdsMinimumKitchen` accepts, each written out as a strict inequality. */
function isTooSmallForKitchen({ wallA, wallB }: LRoomMm): boolean {
  const freeA = wallA - kitchen.cornerReachMm.wallA;
  const freeB = wallB - kitchen.cornerReachMm.wallB;
  const holdsPairOnOneWall = freeA >= bothBodiesMm || freeB >= bothBodiesMm;
  const holdsSplit =
    freeB >= kitchen.sinkWidthMm && freeA >= kitchen.hobWidthMm;
  return !holdsPairOnOneWall && !holdsSplit;
}

const tooSmallRoom = fc
  .record({
    wallA: fc.integer({
      min: walls.wallA.minMm,
      max: kitchen.cornerReachMm.wallA + bothBodiesMm - 1,
    }),
    wallB: fc.integer({
      min: walls.wallB.minMm,
      max: kitchen.cornerReachMm.wallB + bothBodiesMm - 1,
    }),
    height: heightOk,
  })
  .filter(isTooSmallForKitchen);

interface Arm {
  readonly name: string;
  readonly room: fc.Arbitrary<LRoomMm>;
  readonly expectedFields: readonly RoomLengthField[];
}

function armOf(
  name: string,
  parts: {
    wallA: fc.Arbitrary<number>;
    wallB: fc.Arbitrary<number>;
    height: fc.Arbitrary<number>;
  },
  expectedFields: readonly RoomLengthField[],
): Arm {
  return { name, room: fc.record(parts), expectedFields };
}

/** Criterion 1's measured table, one arm per row. The mixed arms are the discriminating population:
 *  a model that keeps only the first issue passes every single-issue arm. */
const FIELD_ARMS: readonly Arm[] = [
  armOf("ok", { wallA: aHoldingTheKitchen, wallB: bOk, height: heightOk }, []),
  armOf("A short", { wallA: aShort, wallB: bOk, height: heightOk }, ["wallA"]),
  armOf("B short", { wallA: aOk, wallB: bShort, height: heightOk }, ["wallB"]),
  armOf("both short", { wallA: aShort, wallB: bShort, height: heightOk }, [
    "wallA",
    "wallB",
  ]),
  armOf("A long", { wallA: aLong, wallB: bOk, height: heightOk }, ["wallA"]),
  armOf("B long", { wallA: aOk, wallB: bLong, height: heightOk }, ["wallB"]),
  armOf("A long, B long", { wallA: aLong, wallB: bLong, height: heightOk }, [
    "wallA",
    "wallB",
  ]),
  armOf("A long, B short", { wallA: aLong, wallB: bShort, height: heightOk }, [
    "wallA",
    "wallB",
  ]),
  armOf("A short, B long", { wallA: aShort, wallB: bLong, height: heightOk }, [
    "wallA",
    "wallB",
  ]),
  armOf(
    "A short, B short, height low",
    { wallA: aShort, wallB: bShort, height: heightLow },
    ["wallA", "wallB", "height"],
  ),
  armOf(
    "height low",
    { wallA: aHoldingTheKitchen, wallB: bOk, height: heightLow },
    ["height"],
  ),
  armOf(
    "height high",
    { wallA: aHoldingTheKitchen, wallB: bOk, height: heightHigh },
    ["height"],
  ),
  { name: "too small", room: tooSmallRoom, expectedFields: [] },
];

// ---------------------------------------------------------------------------------------------
// Criterion 1 — reasons are exactly the parser's 1C, per field
// ---------------------------------------------------------------------------------------------

describe("the reasons beside the fields are every field the domain refused, and only those", () => {
  it.each(FIELD_ARMS)(
    "puts a reason on exactly the arm's fields: $name",
    ({ room, expectedFields }) => {
      fc.assert(
        fc.property(room, fc.constantFrom(...DIRECTIONS), (mm, direction) => {
          const view = viewOf(lDraft(mm, direction));

          expect(reasonFieldsOf(view)).toEqual(expectedFields);
        }),
        { numRuns: SAMPLES_PER_ARM },
      );
    },
  );

  it("names each refused field by its own code's leaf, not by a shared one", () => {
    const view = viewOf(lDraft({ wallA: 6001, wallB: 900, height: 2100 }));

    expect(view.fieldReasons).toEqual([
      { field: "wallA", messageKey: "room.issue.wallTooLong" },
      { field: "wallB", messageKey: "room.issue.wallTooShort" },
      { field: "height", messageKey: "room.issue.heightTooLow" },
    ]);
  });

  it.each([
    [
      "a 2,20 × 0,90 room",
      { wallA: 2200, wallB: 900 },
      "wallB",
      "room.issue.wallTooShort",
    ],
    [
      "a ceiling too high",
      { wallA: 2200, wallB: 2000, height: 4000 },
      "height",
      "room.issue.heightTooHigh",
    ],
  ] as const)(
    "maps the plan's witness for %s",
    (_, walls, field, messageKey) => {
      const view = viewOf(lDraft({ height: 2500, ...walls }));

      expect(view.fieldReasons).toEqual([{ field, messageKey }]);
    },
  );
});

// ---------------------------------------------------------------------------------------------
// Boundaries, read from approved-room-policy.ts
// ---------------------------------------------------------------------------------------------

describe("each approved bound is inclusive, and one millimetre past it is refused", () => {
  const roomy: LRoomMm = {
    wallA: walls.wallA.maxMm,
    wallB: walls.wallB.maxMm,
    height: ceiling.minMm,
  };

  it.each([
    ["wallA", walls.wallA.minMm - 1, "room.issue.wallTooShort"],
    ["wallA", walls.wallA.maxMm + 1, "room.issue.wallTooLong"],
    ["wallB", walls.wallB.minMm - 1, "room.issue.wallTooShort"],
    ["wallB", walls.wallB.maxMm + 1, "room.issue.wallTooLong"],
    ["height", ceiling.minMm - 1, "room.issue.heightTooLow"],
    ["height", ceiling.maxMm + 1, "room.issue.heightTooHigh"],
  ] as const)(
    "refuses %s at %i mm with its own reason",
    (field, valueMm, messageKey) => {
      const view = viewOf(lDraft({ ...roomy, [field]: valueMm }));

      expect(view.fieldReasons).toEqual([{ field, messageKey }]);
    },
  );

  it.each([
    ["wallA", walls.wallA.minMm],
    ["wallA", walls.wallA.maxMm],
    ["wallB", walls.wallB.minMm],
    ["wallB", walls.wallB.maxMm],
    ["height", ceiling.minMm],
    ["height", ceiling.maxMm],
  ] as const)("accepts %s at exactly %i mm", (field, valueMm) => {
    const view = viewOf(lDraft({ ...roomy, [field]: valueMm }));

    expect(view.fieldReasons).toEqual([]);
    expect(view.roomReasons).toEqual([]);
    expect(view.isNoteShown).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------
// Criterion 3 — minimum not met is a room-level reason, and nothing else
// ---------------------------------------------------------------------------------------------

describe("a room too small for the kitchen is the room's reason, with no field and no wall blamed", () => {
  it.each([
    ["wall A wider", (room: LRoomMm) => room.wallA > room.wallB],
    ["wall B wider", (room: LRoomMm) => room.wallB > room.wallA],
  ] as const)("holds over the %s half", (_, isInHalf) => {
    let sampled = 0;
    fc.assert(
      fc.property(tooSmallRoom.filter(isInHalf), (mm) => {
        const view = viewOf(lDraft(mm));
        sampled += 1;

        expect(view.roomReasons).toEqual(["room.issue.roomTooSmall"]);
        expect(view.fieldReasons).toEqual([]);
        expect(view.markedWalls).toEqual([]);
        expect(view.isShapeRefused).toBe(false);
      }),
      { numRuns: SAMPLES_PER_ARM },
    );

    expect(sampled).toBeGreaterThanOrEqual(SAMPLES_PER_ARM);
  });

  it("carries no room reason for a room whose fields are refused", () => {
    const view = viewOf(lDraft({ wallA: 800, wallB: 800, height: 2000 }));

    expect(view.roomReasons).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// The marked walls the plan will draw red (criterion 7's model arm)
// ---------------------------------------------------------------------------------------------

describe("the walls marked on the plan are the refused wall fields, by id", () => {
  it.each(DIRECTIONS)(
    "marks A short and B long on the same wall ids when the corner turns %s",
    (direction) => {
      const view = viewOf(
        lDraft({ wallA: 800, wallB: 6001, height: 2500 }, direction),
      );

      expect(view.markedWalls).toEqual([
        { wall: "A", labelKey: "room.planWallIssue.tooShort" },
        { wall: "B", labelKey: "room.planWallIssue.tooLong" },
      ]);
    },
  );

  it("marks no wall for a ceiling out of range", () => {
    const view = viewOf(lDraft({ wallA: 2200, wallB: 2000, height: 4000 }));

    expect(view.markedWalls).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// Unreadable text (Q-7F2-4)
// ---------------------------------------------------------------------------------------------

describe("text that does not read as a length is reported apart from the domain's reasons", () => {
  // Wave 7F2 S1b (ADR 0126) amends this block: a field reads whole millimetres, so the metre habit —
  // *"3,6"*, *"3.60"* — is unreadable now, where S1 read it as a length.
  const UNREADABLE_TEXTS = ["abc", "0", "3,6", "3.60", "3600mm"] as const;
  const L_FIELDS = ["wallA", "wallB", "height"] as const;

  it.each(
    L_FIELDS.flatMap((field) =>
      UNREADABLE_TEXTS.map((text) => [field, text] as const),
    ),
  )("reports %s holding %j as unreadable, and nothing else", (field, text) => {
    const texts = {
      wallA: "2200",
      wallB: "2000",
      height: "2500",
      [field]: text,
    };
    const draft = draftTyped({ shape: "L", texts });

    const view = viewOf(draft);

    expect(stateOfDraft(draft).substate).toBe("1B");
    expect(view.unreadableFields).toEqual([field]);
    expect(view.fieldReasons).toEqual([]);
    expect(view.isNoteShown).toBe(false);
  });

  it.each(["", "   "])(
    "does not report an empty field (%j) as unreadable",
    (text) => {
      const view = viewOf(draftTyped({ shape: "L", texts: { wallA: text } }));

      expect(view.unreadableFields).toEqual([]);
    },
  );

  it("does not report a leading zero as unreadable: it is one reading of a digit string", () => {
    const view = viewOf(draftTyped({ shape: "L", texts: { wallA: "03600" } }));

    expect(view.unreadableFields).toEqual([]);
  });

  it("does not report a readable length out of range as unreadable: the domain's reason is 1C's", () => {
    const draft = draftTyped({
      shape: "L",
      texts: { wallA: "3", wallB: "2000", height: "2500" },
    });

    const view = viewOf(draft);

    expect(view.unreadableFields).toEqual([]);
    expect(stateOfDraft(draft).substate).toBe("1C");
    expect(view.fieldReasons.map((reason) => reason.field)).toContain("wallA");
  });

  it("ignores text in a field the chosen shape does not ask for", () => {
    const view = viewOf(draftTyped({ shape: "L", texts: { wallC: "abc" } }));

    expect(view.unreadableFields).toEqual([]);
  });

  it("publishes the unreadable leaf the copy lock holds", () => {
    expect(UNREADABLE_LENGTH_MESSAGE_KEY).toBe("room.issue.unreadable");
  });
});

// ---------------------------------------------------------------------------------------------
// Criterion 9's model arm — the shape refusal is the policy's
// ---------------------------------------------------------------------------------------------

describe("the shape refusal is the policy's answer for the chosen shape, whatever the fields hold", () => {
  const FIELD_STATES: readonly [string, TypedRoom["texts"]][] = [
    ["no field typed", {}],
    ["some fields typed", { wallA: "2200" }],
    [
      "every field typed",
      { wallA: "2200", wallB: "2000", wallC: "2000", height: "2500" },
    ],
  ];

  it.each(
    ROOM_SHAPES.flatMap((shape) =>
      FIELD_STATES.map(([label, texts]) => [shape, label, texts] as const),
    ),
  )(
    "refuses %s under the approved policy exactly when the domain does (%s)",
    (shape, _, texts) => {
      const view = viewOf(draftTyped({ shape, texts }));

      expect(view.isShapeRefused).toBe(
        !isShapeBuildable(shape, APPROVED_ROOM_POLICY),
      );
    },
  );

  // 7J S5: the straight kitchen joins the L under the approved policy (ADR 0108 Amendment G), so
  // only the U — never put to the owner — is refused as its shape alone now.
  it("refuses the one shape the approved policy does not build, and not the L or linear", () => {
    const refused = ROOM_SHAPES.filter(
      (shape) => viewOf(createRoomDraft(shape)).isShapeRefused,
    );

    expect(refused).toEqual(["U"]);
  });

  it("stops refusing a shape the moment a policy states it, with no other change", () => {
    const draft = draftTyped({
      shape: "U",
      texts: { wallA: "2200", wallB: "2000", wallC: "2000", height: "2500" },
    });

    const view = viewOf(draft, policyAlsoStating("U"));

    expect(view.isShapeRefused).toBe(false);
  });

  it.each(["U"] as const)(
    "keeps the %s refusal out of the room-level slot at 1C",
    (shape) => {
      const draft = draftTyped({
        shape,
        texts: { wallA: "2200", wallB: "2000", wallC: "2000", height: "2500" },
      });

      const view = viewOf(draft);

      expect(stateOfDraft(draft).substate).toBe("1C");
      expect(view.roomReasons).toEqual([]);
      expect(view.fieldReasons).toEqual([]);
      expect(view.isShapeRefused).toBe(true);
    },
  );

  // 7J S5: this same entry — wall A 2200, height 2500 — is now a straight room the approved policy
  // accepts, so it reaches 1D rather than stopping at a shape refusal.
  it("accepts a straight kitchen at 1D with the same fields that used to refuse it", () => {
    const draft = draftTyped({
      shape: "linear",
      texts: { wallA: "2200", wallB: "2000", wallC: "2000", height: "2500" },
    });

    const view = viewOf(draft);

    expect(stateOfDraft(draft).substate).toBe("1D");
    expect(view.isShapeRefused).toBe(false);
  });

  it("publishes the shape refusal through the SHAPE_NOT_BUILDABLE leaf", () => {
    expect(SHAPE_REFUSAL_MESSAGE_KEY).toBe("room.issue.shapeNotBuildable");
  });
});

// ---------------------------------------------------------------------------------------------
// Criterion 10's model arm — the straight kitchen's suggestion is the domain's own answer (7J S5)
// ---------------------------------------------------------------------------------------------

describe("the straight kitchen is suggested exactly when 1C has a reason and wall A validates one", () => {
  // 7J S5: `APPROVED_ROOM_POLICY` now states the straight kitchen's own bounds, so the arms whose
  // wall A already sits inside them (the `ok`-ranged ones — "B short", "B long" and "too small")
  // suggest it for real; the arms whose wall A is outside them (the L's own short/long ranges,
  // always clear of 1200–6000) still do not. The oracle is the real domain's answer on wall A and
  // the height alone, never a hardcoded `false` — restated from "suggests nothing under the approved
  // policy", which held for every arm before this wave.
  it.each(FIELD_ARMS)(
    "matches the domain's own verdict on wall A and height: $name",
    ({ room }) => {
      fc.assert(
        fc.property(room, (mm) => {
          const validatesAsStraight = validateRoomInput(
            { shape: "linear", wallAMm: mm.wallA, heightMm: mm.height },
            APPROVED_ROOM_POLICY,
          ).ok;
          const view = viewOf(lDraft(mm));
          // 1C "has a reason" through either slot — a field's own, or the room-level one
          // `ROOM_TOO_SMALL_FOR_KITCHEN` carries (the "too small" arm's own case, which names no
          // field at all).
          const hasAReason =
            view.fieldReasons.length > 0 || view.roomReasons.length > 0;

          expect(view.isLinearSuggested).toBe(
            hasAReason && validatesAsStraight,
          );
        }),
        { numRuns: SAMPLES_PER_ARM },
      );
    },
  );

  it("suggests nothing for a refused U shape", () => {
    const draft = draftTyped({
      shape: "U",
      texts: { wallA: "2200", wallB: "2000", wallC: "2000", height: "2500" },
    });

    expect(viewOf(draft).isLinearSuggested).toBe(false);
  });

  // 7J S5: this entry is no longer a refused shape — it is itself a straight room the policy
  // accepts — and a room the domain accepts has no reason to append the suggestion to.
  it("suggests nothing for an accepted linear shape, which has no reason to append it to", () => {
    const draft = draftTyped({
      shape: "linear",
      texts: { wallA: "2200", wallB: "2000", wallC: "2000", height: "2500" },
    });

    expect(stateOfDraft(draft).substate).toBe("1D");
    expect(viewOf(draft).isLinearSuggested).toBe(false);
  });

  it("keeps the suggestion's leaf in the catalogue for wave 7J to switch on", () => {
    expect(LINEAR_SUGGESTION_MESSAGE_KEY).toBe("room.issue.orChooseLinear");
  });
});

// ---------------------------------------------------------------------------------------------
// Criterion 11 — the note is 1C's
// ---------------------------------------------------------------------------------------------

describe("frame 1C's note shows at 1C and at no other sub-state", () => {
  it.each([
    ["a refused field", lDraft({ wallA: 3000, wallB: 450, height: 2500 })],
    ["a room too small", lDraft({ wallA: 900, wallB: 1000, height: 2500 })],
    [
      "a refused shape",
      draftTyped({
        shape: "U",
        texts: { wallA: "2000", wallB: "2000", wallC: "2000", height: "2500" },
      }),
    ],
  ] as const)("shows it for %s", (_, draft) => {
    expect(stateOfDraft(draft).substate).toBe("1C");
    expect(viewOf(draft).isNoteShown).toBe(true);
  });

  it.each([
    ["1B", draftTyped({ shape: "L", texts: { wallA: "2200" } })],
    ["1D", lDraft({ wallA: 3000, wallB: 2000, height: 2500 })],
  ] as const)("hides it at %s", (substate, draft) => {
    expect(stateOfDraft(draft).substate).toBe(substate);
    expect(viewOf(draft).isNoteShown).toBe(false);
  });

  it("hides it at 1A", () => {
    const draftState = parseRoomUrlState({});

    const view = deriveRoomIssueView({
      draft: createRoomDraft("L"),
      draftState,
      policy: APPROVED_ROOM_POLICY,
    });

    expect(draftState.substate).toBe("1A");
    expect(view.isNoteShown).toBe(false);
  });

  it("publishes frame 1C's note leaf", () => {
    expect(ONE_C_NOTE_MESSAGE_KEY).toBe("room.presetsAfterValid");
  });
});

// ---------------------------------------------------------------------------------------------
// The reachability guard (S1 item 4)
// ---------------------------------------------------------------------------------------------

describe("the two codes the model's table excludes never reach 1C", () => {
  const anyText = fc.oneof(
    fc.string({ maxLength: 8 }),
    fc.integer({ min: 0, max: 9_000_000 }).map(String),
    fc.stringMatching(/^\d{1,2}[.,]\d{1,6}$/),
  );

  it("holds over arbitrary drafts of every shape and direction", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ROOM_SHAPES),
        fc.record({
          wallA: anyText,
          wallB: anyText,
          wallC: anyText,
          height: anyText,
        }),
        fc.constantFrom(...DIRECTIONS),
        (shape, texts, direction) => {
          const state = stateOfDraft(draftTyped({ shape, texts, direction }));
          const codes =
            state.substate === "1C"
              ? state.issues.map((issue) => issue.code)
              : [];

          expect(codes).not.toContain("VALUE_MISSING");
          expect(codes).not.toContain("VALUE_NOT_WHOLE_MILLIMETRES");
        },
      ),
      { numRuns: 1000 },
    );
  });

  it.each(["VALUE_MISSING", "VALUE_NOT_WHOLE_MILLIMETRES"] as const)(
    "refuses loudly, naming the code, if %s ever arrives at 1C",
    (code) => {
      const draft = lDraft({ wallA: 3000, wallB: 2000, height: 2500 });
      const reached = stateOfDraft(
        lDraft({ wallA: 800, wallB: 2000, height: 2500 }),
      );
      if (reached.substate !== "1C")
        throw new Error("the witness room is not a 1C room");
      // On the ceiling rather than a wall, so the plan label's own guard cannot be what throws.
      const draftState: RoomUrlState = {
        ...reached,
        issues: [{ field: "height", code }],
      };

      expect(() =>
        deriveRoomIssueView({
          draft,
          draftState,
          policy: APPROVED_ROOM_POLICY,
        }),
      ).toThrow(code);
    },
  );
});

// ---------------------------------------------------------------------------------------------
// The copy (criteria 2, 9's banned words, 17) — resolved in both locales, naming no Romanian
// ---------------------------------------------------------------------------------------------

const PUBLISHED_KEYS = [
  ...Object.values(ROOM_ISSUE_MESSAGE_KEYS),
  LINEAR_SUGGESTION_MESSAGE_KEY,
  UNREADABLE_LENGTH_MESSAGE_KEY,
  ONE_C_NOTE_MESSAGE_KEY,
  "room.planWallIssue.tooShort",
  "room.planWallIssue.tooLong",
] as const;

type RuntimeTranslate = (
  key: string,
  values?: Readonly<Record<string, string>>,
) => string;

function translateIn([
  locale,
  messages,
]: (typeof CATALOGUES)[number]): RuntimeTranslate {
  return translatorFor(locale, messages) as unknown as RuntimeTranslate;
}

/** Every sentence a key the model publishes resolves to, with `{wall}` given each wall letter. */
function resolvedSentences(
  translate: RuntimeTranslate,
  key: string,
): readonly string[] {
  if (!key.startsWith("room.planWallIssue.")) return [translate(key)];
  return WALL_LETTERS.map((wall) => translate(key, { wall }));
}

describe.each(CATALOGUES)(
  "the copy the model publishes, in %s",
  (locale, messages) => {
    const translate = translateIn([
      locale,
      messages,
    ] as (typeof CATALOGUES)[number]);

    it("covers all six reachable codes", () => {
      expect(Object.keys(ROOM_ISSUE_MESSAGE_KEYS).sort()).toEqual(
        [...REACHABLE_CODES].sort(),
      );
    });

    it.each(PUBLISHED_KEYS)("resolves %s to a sentence of its own", (key) => {
      expect(requireLeafAt(messages, key)).not.toBe("");
      for (const sentence of resolvedSentences(translate, key)) {
        expect(sentence).not.toContain(key);
        expect(sentence).not.toContain("{");
      }
    });

    it.each(PUBLISHED_KEYS)(
      "puts no digit, no code and no millimetre in %s",
      (key) => {
        for (const sentence of resolvedSentences(translate, key)) {
          expect(sentence).not.toMatch(/\p{Nd}/u);
          expect(sentence).not.toMatch(/[A-Z]{2,}_[A-Z_]+/);
          expect(sentence).not.toMatch(/\bmm\b/);
          expect(sentence).not.toMatch(/(^|\P{L})мм(\P{L}|$)/u);
        }
      },
    );

    it("gives the six codes six different sentences", () => {
      const sentences = REACHABLE_CODES.map((code) =>
        translate(ROOM_ISSUE_MESSAGE_KEYS[code]),
      );

      expect(new Set(sentences).size).toBe(REACHABLE_CODES.length);
    });

    it("never blames the wall for a length, only the run the customer typed (ADR 0120 C1)", () => {
      const fieldCodes = [
        "WALL_TOO_SHORT",
        "WALL_TOO_LONG",
        "HEIGHT_TOO_LOW",
        "HEIGHT_TOO_HIGH",
      ] as const;
      for (const code of fieldCodes) {
        const sentence = translate(ROOM_ISSUE_MESSAGE_KEYS[code]);
        expect(sentence).not.toMatch(/perete(le)?\b[^.]*\b(scurt|lung)/i);
        expect(sentence).not.toMatch(/стен[аы][^.]*(коротк|длинн)/i);
      }
    });

    it("names no internal reason and suggests no shape in the shape refusal", () => {
      const refusal = translate(SHAPE_REFUSAL_MESSAGE_KEY).toLowerCase();

      for (const banned of [
        "implementat",
        "dezvoltare",
        "versiune",
        "eroare",
        "cod",
        "liniar",
      ]) {
        expect(refusal).not.toContain(banned);
      }
      for (const banned of [
        "реализ",
        "разработ",
        "верси",
        "ошибк",
        "код",
        "линейн",
      ]) {
        expect(refusal).not.toContain(banned);
      }
    });
  },
);
