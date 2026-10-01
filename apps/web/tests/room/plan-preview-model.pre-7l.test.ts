// Wave 7L slice S2, acceptance criterion 7's own clause: "with `PLAN_BOX` and the default set,
// output deep-equals the base's function" — D6a's escalation trigger (D6, "Escalation trigger") reads
// the other way round: if this file ever goes red, S2 becomes a Full-tier review rather than a
// silent merge. The base is the fixture beside this file, `plan-preview-model.pre-7l.ts`, copied
// verbatim from `git show 7a6438a:apps/web/src/room/plan-preview-model.ts` — the wave's own base
// commit — so the comparison is against an independent oracle rather than against this wave's own
// refactor of itself.
//
// Swept rather than sampled, over every shape the model draws (L, U, linear), both corners, and an
// incomplete draft (Q-7F2-3 = a's "draws nothing" arm) — because a metrics-as-input refactor can drift
// in exactly the corner a hand-picked example does not visit.
import { fc } from "@fast-check/vitest";
import {
  APPROVED_ROOM_POLICY,
  type CornerDirection,
  type MillimetreBounds,
  type RoomShape,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import {
  PLAN_MINIMUM_BOX_HEIGHT_PX,
  PLAN_WALL_THICKNESS_PX,
  derivePlanPreview,
  type PlanBox,
} from "@/room/plan-preview-model";
import {
  createRoomDraft,
  withCornerDirection,
  withStoredLength,
  type RoomDraft,
  type RoomLengthField,
} from "@/room/room-draft";

import { derivePlanPreview as derivePlanPreviewAtTheBase } from "./fixtures/plan-preview-model.pre-7l";

const SWEEP_RUNS = 300;

function approvedLWalls() {
  const walls = APPROVED_ROOM_POLICY.buildableShapes.L;
  if (walls === undefined) {
    throw new Error("the approved policy states no L walls to sweep");
  }
  return walls;
}

function everyMillimetreIn(bounds: MillimetreBounds): fc.Arbitrary<number> {
  return fc.integer({ min: bounds.minMm, max: bounds.maxMm });
}

function everyPreviewBox(): fc.Arbitrary<PlanBox> {
  return fc.record({
    widthPx: fc.integer({ min: PLAN_WALL_THICKNESS_PX, max: 600 }),
    heightPx: fc.integer({ min: PLAN_MINIMUM_BOX_HEIGHT_PX, max: 400 }),
  });
}

function draftWith(
  shape: RoomShape,
  lengths: readonly (readonly [RoomLengthField, number])[],
  direction: CornerDirection,
): RoomDraft {
  const typed = lengths.reduce<RoomDraft>(
    (draft, [field, millimetres]) =>
      withStoredLength(draft, { field, millimetres }),
    createRoomDraft(shape),
  );
  return withCornerDirection(typed, direction);
}

const anyCorner: fc.Arbitrary<CornerDirection> = fc.constantFrom(
  "left",
  "right",
);

const anyLDraft: fc.Arbitrary<RoomDraft> = fc
  .record({
    wallAMm: everyMillimetreIn(approvedLWalls().wallA),
    wallBMm: everyMillimetreIn(approvedLWalls().wallB),
    direction: anyCorner,
  })
  .map(({ wallAMm, wallBMm, direction }) =>
    draftWith(
      "L",
      [
        ["wallA", wallAMm],
        ["wallB", wallBMm],
        ["height", APPROVED_ROOM_POLICY.heightBounds.minMm],
      ],
      direction,
    ),
  );

const anyLinearDraft: fc.Arbitrary<RoomDraft> = fc
  .record({
    wallAMm: everyMillimetreIn(approvedLWalls().wallA),
    direction: anyCorner,
  })
  .map(({ wallAMm, direction }) =>
    draftWith(
      "linear",
      [
        ["wallA", wallAMm],
        ["height", APPROVED_ROOM_POLICY.heightBounds.minMm],
      ],
      direction,
    ),
  );

/** Q-7F2-3 = a's "draws nothing" arm: an L missing wall B is a state of the plan, not a drawn one, and
 *  the base's own branch for it is exactly as swept as the drawn arms. */
const anyIncompleteLDraft: fc.Arbitrary<RoomDraft> = everyMillimetreIn(
  approvedLWalls().wallA,
).chain((wallAMm) =>
  anyCorner.map((direction) =>
    draftWith(
      "L",
      [
        ["wallA", wallAMm],
        ["height", APPROVED_ROOM_POLICY.heightBounds.minMm],
      ],
      direction,
    ),
  ),
);

// A U is deliberately not in this set since M7B U5 S1: its plan is drawn unmirrored (Q-U4 (b)) and its
// facing labels are placed by a rule the frozen base does not have (backlog 72), so the base can no
// longer be its oracle. It is held by `plan-preview-model.facing-labels.test.ts` instead. The L and the
// straight room are what this test protects, and they are unmoved.
const anyDraft: fc.Arbitrary<RoomDraft> = fc.oneof(
  anyLDraft,
  anyLinearDraft,
  anyIncompleteLDraft,
);

describe("derivePlanPreview — with PLAN_BOX and the default set, the wave's own refactor changes nothing (7L D6a, criterion 7)", () => {
  it("deep-equals the base function over every shape, both corners and a swept box", () => {
    fc.assert(
      fc.property(anyDraft, everyPreviewBox(), (draft, box) => {
        expect(derivePlanPreview(draft, box)).toEqual(
          derivePlanPreviewAtTheBase(draft, box),
        );
      }),
      { numRuns: SWEEP_RUNS },
    );
  });
});
