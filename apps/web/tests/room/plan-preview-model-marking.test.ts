// Wave 7F2 slice S2: frame 1C's red wall, as a second pure step over the drawn plan (criterion 7).
// The claims are the plan's: marking moves no pixel, a mark follows its wall's **id** through the
// mirror, and the marked set is exactly the refused wall fields — so the arms are built from the
// approved policy's bounds and each arm's expected marks are its own definition, never re-derived by
// asking the producer (ADR 0121 decision 4).
import { fc } from "@fast-check/vitest";
import {
  APPROVED_ROOM_POLICY,
  type CornerDirection,
  type LWallBounds,
  type RoomShape,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import {
  derivePlanPreview,
  markPlanWalls,
  reflectPlanPreview,
  type MarkedPlanWall,
  type PlanBox,
  type PlanPreview,
  type PlanWallId,
  type PlanWallIssueLabelKey,
  type PlanWallRect,
} from "@/room/plan-preview-model";
import {
  createRoomDraft,
  withCornerDirection,
  withEnteredText,
  type RoomDraft,
  type RoomLengthField,
} from "@/room/room-draft";
import { deriveRoomIssueView } from "@/room/room-issue-model";
import { canonicalRoomQuery, queryEntriesOf } from "@/room/room-query-sync";
import { parseRoomUrlState } from "@/room/room-url-state";

const SAMPLES_PER_ARM = 100;

/** The box `plan-preview.tsx` hands the model: frame 1B's 320 x 104, less its hairline border. */
const FRAME_PREVIEW_BOX: PlanBox = { widthPx: 318, heightPx: 102 };

const DIRECTIONS: readonly CornerDirection[] = ["left", "right"];

/** Criterion 1's outer range, past both ends of every approved bound. */
const SWEPT_WALL_MM = { min: 100, max: 7000 } as const;
const SWEPT_CEILING_MM = { min: 1000, max: 5000 } as const;

const TOO_SHORT: PlanWallIssueLabelKey = "room.planWallIssue.tooShort";
const TOO_LONG: PlanWallIssueLabelKey = "room.planWallIssue.tooLong";

// ---------------------------------------------------------------------------------------------
// Arms, built from the approved policy's bounds
// ---------------------------------------------------------------------------------------------

interface LRoomMm {
  readonly wallA: number;
  readonly wallB: number;
  readonly height: number;
}

/** Frame 1C's own example (`Mobil.dc.html:195-247`), in millimetres: wall B too short. */
const FRAME_ONE_C_ROOM: LRoomMm = { wallA: 3600, wallB: 450, height: 2600 };

interface Arm {
  readonly name: string;
  readonly room: fc.Arbitrary<LRoomMm>;
  readonly expectedMarks: readonly MarkedPlanWall[];
}

function approvedL(): LWallBounds {
  const bounds = APPROVED_ROOM_POLICY.buildableShapes.L;
  if (bounds === undefined)
    throw new Error("the approved policy states no L bounds");
  return bounds;
}

const walls = approvedL();
const ceiling = APPROVED_ROOM_POLICY.heightBounds;
const kitchen = walls.minimumKitchen;
const bothBodiesMm = kitchen.sinkWidthMm + kitchen.hobWidthMm;

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

/** Wall A long enough to hold the sink and the hob beyond the corner by itself, so the room's own
 *  minimum holds whatever wall B is and only the arm's named field can be refused. */
const aHoldingTheKitchen = fc.integer({
  min: kitchen.cornerReachMm.wallA + bothBodiesMm,
  max: walls.wallA.maxMm,
});

/** In range on both walls and holding the kitchen none of the three ways the domain accepts —
 *  `room-issue-model.test.ts`'s own construction of the too-small arm, restated rather than shared
 *  so that this file does not reach into another test file. */
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

function roomOf(
  wallA: fc.Arbitrary<number>,
  wallB: fc.Arbitrary<number>,
  height: fc.Arbitrary<number> = heightOk,
): fc.Arbitrary<LRoomMm> {
  return fc.record({ wallA, wallB, height });
}

/** A-only, B-only and both, each as short and as long: criterion 7's population. */
const WALL_ARMS: readonly Arm[] = [
  {
    name: "A too short",
    room: roomOf(aShort, bOk),
    expectedMarks: [{ wall: "A", labelKey: TOO_SHORT }],
  },
  {
    name: "A too long",
    room: roomOf(aLong, bOk),
    expectedMarks: [{ wall: "A", labelKey: TOO_LONG }],
  },
  {
    name: "B too short",
    room: roomOf(aHoldingTheKitchen, bShort),
    expectedMarks: [{ wall: "B", labelKey: TOO_SHORT }],
  },
  {
    name: "B too long",
    room: roomOf(aHoldingTheKitchen, bLong),
    expectedMarks: [{ wall: "B", labelKey: TOO_LONG }],
  },
  {
    name: "A and B too short",
    room: roomOf(aShort, bShort),
    expectedMarks: [
      { wall: "A", labelKey: TOO_SHORT },
      { wall: "B", labelKey: TOO_SHORT },
    ],
  },
  {
    name: "A too short, B too long",
    room: roomOf(aShort, bLong),
    expectedMarks: [
      { wall: "A", labelKey: TOO_SHORT },
      { wall: "B", labelKey: TOO_LONG },
    ],
  },
  {
    name: "A too long, B too short",
    room: roomOf(aLong, bShort),
    expectedMarks: [
      { wall: "A", labelKey: TOO_LONG },
      { wall: "B", labelKey: TOO_SHORT },
    ],
  },
  {
    name: "A and B too long",
    room: roomOf(aLong, bLong),
    expectedMarks: [
      { wall: "A", labelKey: TOO_LONG },
      { wall: "B", labelKey: TOO_LONG },
    ],
  },
];

/** Refused rooms whose issue is on no wall — the ceiling, and the room as a whole — plus the room
 *  refused on nothing at all. None may mark a wall. */
const UNMARKED_ARMS: readonly Arm[] = [
  {
    name: "a ceiling too low",
    room: roomOf(aHoldingTheKitchen, bOk, heightLow),
    expectedMarks: [],
  },
  {
    name: "a ceiling too high",
    room: roomOf(aHoldingTheKitchen, bOk, heightHigh),
    expectedMarks: [],
  },
  {
    name: "a room too small for the kitchen",
    room: tooSmallRoom,
    expectedMarks: [],
  },
  {
    name: "an accepted room",
    room: roomOf(aHoldingTheKitchen, bOk),
    expectedMarks: [],
  },
];

const DIRECTED_WALL_ARMS = WALL_ARMS.flatMap((arm) =>
  DIRECTIONS.map((direction) => [arm.name, direction, arm] as const),
);

const DIRECTED_UNMARKED_ARMS = UNMARKED_ARMS.flatMap((arm) =>
  DIRECTIONS.map((direction) => [arm.name, direction, arm] as const),
);

// ---------------------------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------------------------

function draftTyped(
  shape: RoomShape,
  texts: Partial<Record<RoomLengthField, number>>,
  direction: CornerDirection,
): RoomDraft {
  const typed = Object.entries(texts).reduce(
    (draft, [field, millimetres]) =>
      withEnteredText(draft, {
        field: field as RoomLengthField,
        text: String(millimetres),
      }),
    createRoomDraft(shape),
  );
  return withCornerDirection(typed, direction);
}

function lDraft(room: LRoomMm, direction: CornerDirection): RoomDraft {
  return draftTyped(
    "L",
    { wallA: room.wallA, wallB: room.wallB, height: room.height },
    direction,
  );
}

/** The walls the issue model marks for this draft, asked the way `room-screen.tsx` will ask it. */
function markedWallsOf(draft: RoomDraft): readonly MarkedPlanWall[] {
  return deriveRoomIssueView({
    draft,
    draftState: parseRoomUrlState(
      queryEntriesOf(canonicalRoomQuery(draft).toString()),
    ),
    policy: APPROVED_ROOM_POLICY,
  }).markedWalls;
}

function unmarkedPlanOf(draft: RoomDraft): PlanPreview {
  return derivePlanPreview(draft, FRAME_PREVIEW_BOX);
}

function markedPlanOf(draft: RoomDraft): PlanPreview {
  return markPlanWalls(unmarkedPlanOf(draft), markedWallsOf(draft));
}

/** The marks a plan carries, read off the walls it draws, in drawing order. */
function marksOn(plan: PlanPreview): readonly MarkedPlanWall[] {
  if (plan.kind === "empty") return [];
  return plan.walls.flatMap((drawn) =>
    drawn.issueLabelKey === undefined
      ? []
      : [{ wall: drawn.wall, labelKey: drawn.issueLabelKey }],
  );
}

function drawnWall(plan: PlanPreview, wallId: PlanWallId): PlanWallRect {
  const found =
    plan.kind === "drawn"
      ? plan.walls.find((drawn) => drawn.wall === wallId)
      : undefined;
  if (found === undefined) {
    throw new Error(`the plan under test draws no wall ${wallId}`);
  }
  return found;
}

function onlyMarkedWallOf(plan: PlanPreview): PlanWallRect {
  const marked =
    plan.kind === "drawn"
      ? plan.walls.filter((drawn) => drawn.issueLabelKey !== undefined)
      : [];
  const [only, ...others] = marked;
  if (only === undefined || others.length > 0) {
    throw new Error(`expected one marked wall, found ${String(marked.length)}`);
  }
  return only;
}

/** The plan serialised with every mark left out: its geometry and its labels' anchors, byte for byte. */
function geometryJsonOf(plan: PlanPreview): string {
  return JSON.stringify(plan, (key, value: unknown) =>
    key === "issueLabelKey" ? undefined : value,
  );
}

// ---------------------------------------------------------------------------------------------
// Properties
// ---------------------------------------------------------------------------------------------

describe("markPlanWalls — marking is not geometry", () => {
  it.each(DIRECTED_WALL_ARMS)(
    "leaves the plan byte-identical once the marks are off, for %s with the corner turning %s",
    (_name, direction, arm) => {
      fc.assert(
        fc.property(arm.room, (room) => {
          const draft = lDraft(room, direction);

          expect(geometryJsonOf(markedPlanOf(draft))).toBe(
            JSON.stringify(unmarkedPlanOf(draft)),
          );
        }),
        { numRuns: SAMPLES_PER_ARM },
      );
    },
  );

  it("leaves an unmarked plan byte-identical, with no mark field on any wall", () => {
    fc.assert(
      fc.property(roomOf(aHoldingTheKitchen, bOk), (room) => {
        const plan = unmarkedPlanOf(lDraft(room, "left"));

        expect(JSON.stringify(markPlanWalls(plan, []))).toBe(
          JSON.stringify(plan),
        );
      }),
      { numRuns: SAMPLES_PER_ARM },
    );
  });

  it("leaves an empty plan empty whatever it is asked to mark", () => {
    const empty = unmarkedPlanOf(createRoomDraft("L"));

    expect(markPlanWalls(empty, [{ wall: "A", labelKey: TOO_SHORT }])).toEqual(
      empty,
    );
  });

  it("edits neither the plan nor the marks it was handed", () => {
    const plan = unmarkedPlanOf(
      lDraft({ wallA: 800, wallB: 6001, height: 2500 }, "left"),
    );
    const marks: readonly MarkedPlanWall[] = [
      { wall: "B", labelKey: TOO_LONG },
    ];
    const planBefore = JSON.stringify(plan);
    const marksBefore = JSON.stringify(marks);

    markPlanWalls(plan, marks);

    expect(JSON.stringify(plan)).toBe(planBefore);
    expect(JSON.stringify(marks)).toBe(marksBefore);
  });
});

describe("markPlanWalls — the marked set is the refused wall fields, and only they", () => {
  it.each(DIRECTED_WALL_ARMS)(
    "marks exactly the arm's walls with their reasons, for %s with the corner turning %s",
    (_name, direction, arm) => {
      fc.assert(
        fc.property(arm.room, (room) => {
          expect(marksOn(markedPlanOf(lDraft(room, direction)))).toEqual(
            arm.expectedMarks,
          );
        }),
        { numRuns: SAMPLES_PER_ARM },
      );
    },
  );

  it.each(DIRECTED_UNMARKED_ARMS)(
    "marks no wall for %s with the corner turning %s",
    (_name, direction, arm) => {
      fc.assert(
        fc.property(arm.room, (room) => {
          expect(marksOn(markedPlanOf(lDraft(room, direction)))).toEqual([]);
        }),
        { numRuns: SAMPLES_PER_ARM },
      );
    },
  );

  // A U is refused on its shape and its fields are not judged (ADR 0108 decision 2), so every wall
  // it draws, C included, stays unmarked however far out of range it is typed.
  it.each(DIRECTIONS)(
    "marks no wall of a U, refused on its shape, with the corner turning %s",
    (direction) => {
      const anyWall = fc.integer(SWEPT_WALL_MM);
      fc.assert(
        fc.property(anyWall, anyWall, anyWall, heightOk, (a, b, c, height) => {
          const draft = draftTyped(
            "U",
            { wallA: a, wallB: b, wallC: c, height },
            direction,
          );

          expect(marksOn(markedPlanOf(draft))).toEqual([]);
        }),
        { numRuns: SAMPLES_PER_ARM },
      );
    },
  );

  it("marks wall C by its id when a mark names it", () => {
    const plan = unmarkedPlanOf(
      draftTyped("U", { wallA: 3600, wallB: 2400, wallC: 1200 }, "left"),
    );

    expect(
      marksOn(markPlanWalls(plan, [{ wall: "C", labelKey: TOO_SHORT }])),
    ).toEqual([{ wall: "C", labelKey: TOO_SHORT }]);
  });

  // Review R1.5: marks are set exactly, not added to — a plan marked again with fewer marks loses
  // the ones it no longer names, rather than keeping a red wall the room no longer refuses.
  it("unmarks wall B when a plan marked on B is marked again with no marks", () => {
    const drawn = unmarkedPlanOf(lDraft(FRAME_ONE_C_ROOM, "left"));
    const markedOnB = markPlanWalls(drawn, [
      { wall: "B", labelKey: TOO_SHORT },
    ]);

    const remarked = markPlanWalls(markedOnB, []);

    expect(marksOn(markedOnB)).toEqual([{ wall: "B", labelKey: TOO_SHORT }]);
    expect(marksOn(remarked)).toEqual([]);
    expect(JSON.stringify(remarked)).toBe(JSON.stringify(drawn));
  });

  it("draws nothing for a mark on a wall the plan does not draw", () => {
    const plan = unmarkedPlanOf(
      lDraft({ wallA: 3600, wallB: 2400, height: 2600 }, "left"),
    );

    expect(markPlanWalls(plan, [{ wall: "C", labelKey: TOO_LONG }])).toEqual(
      plan,
    );
  });
});

describe("markPlanWalls — a mark follows its wall through the mirror, never the side or the index", () => {
  it.each(WALL_ARMS.map((arm) => [arm.name, arm] as const))(
    "marks the same wall ids in both directions, for %s",
    (_name, arm) => {
      fc.assert(
        fc.property(arm.room, (room) => {
          expect(marksOn(markedPlanOf(lDraft(room, "right")))).toEqual(
            marksOn(markedPlanOf(lDraft(room, "left"))),
          );
        }),
        { numRuns: SAMPLES_PER_ARM },
      );
    },
  );

  it.each(WALL_ARMS.map((arm) => [arm.name, arm] as const))(
    "gives the same plan whether a left-turning plan is marked then mirrored, or mirrored then marked, for %s",
    (_name, arm) => {
      fc.assert(
        fc.property(arm.room, (room) => {
          const leftDraft = lDraft(room, "left");
          const marks = markedWallsOf(leftDraft);
          const drawnLeft = unmarkedPlanOf(leftDraft);

          expect(reflectPlanPreview(markPlanWalls(drawnLeft, marks))).toEqual(
            markPlanWalls(reflectPlanPreview(drawnLeft), marks),
          );
        }),
        { numRuns: SAMPLES_PER_ARM },
      );
    },
  );

  // The side a wall is drawn on is what mirroring changes; its id is what it does not. Wall B stands
  // at the left edge of a left-turning plan and at the right edge of a mirrored one, and it is red in
  // both — a mark placed by screen side would paint wall A's end instead.
  it.each(DIRECTIONS)(
    "paints the mark on wall B's own rectangle when the corner turns %s",
    (direction) => {
      const draft = lDraft(FRAME_ONE_C_ROOM, direction);
      const { issueLabelKey, ...redRect } = onlyMarkedWallOf(
        markedPlanOf(draft),
      );

      expect(issueLabelKey).toBe(TOO_SHORT);
      expect(redRect).toEqual(drawnWall(unmarkedPlanOf(draft), "B"));
    },
  );
});
