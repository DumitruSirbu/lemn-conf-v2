// Adversarial QA for M7 wave 7A3 slice S2 — ADR 0124's "never derive `MAX_ROOM_*` from
// `APPROVED_ROOM_POLICY`", made observable.
//
// **Criterion 6's test cannot see this, and was measured not to.** It proves the guard's predicate
// reddens for a policy constructed one millimetre past the engine's ceiling, which stays true when the
// ceiling is *computed* from the policy: the constructed policy is a fresh object, the ceiling is not.
// Applied and reverted during this QA pass, `MAX_ROOM_RUN_MM = max(policy wall maxima) + 300` yields
// 6300 — every pin, every cap and every suite in the package green — and
// `ENGINE_ROOM_LIMITS.wallX.maxMm = Math.max(MAX_ROOM_*, policy maximum)` does the same. Both leave
// `approved <= engine` unable to fail, which is the safety net ADR 0124 exists to keep.
//
// **So the independence is asserted as behaviour, not as a number.** The storage ceilings are read
// once from a fresh module graph, then again from a fresh graph in which the approved policy's module
// is replaced by one whose maxima have moved — far past the ceilings, and far under them. Nothing
// downstream of storage may move. No bound is restated here: both sides come from the same modules,
// and the only thing that differs between the two loads is the policy they could have read.
//
// A replacement that never reached the module graph would leave that comparison green over nothing,
// so a second test loads the policy through `src/index.ts`, where production reads it, and shows the
// moved maxima arrive there — and that `validateRoomInput` then judges a room at either set of maxima
// differently from the real policy.
import { describe, expect, it, vi } from "vitest";

import type * as ApprovedRoomPolicyModule from "../src/room/approved-room-policy.js";
import type { DesignRoom, LRoomInput, RoomPolicy } from "../src/index.js";

const POLICY_MODULE = "../src/room/approved-room-policy.js";

/** How far each moved policy puts its maxima from the real ones. Wide enough to cross any headroom a
 *  derivation could add, and each still a whole-millimetre bound. */
const WIDENED_BY_MM = 20_000;
const NARROWED_TO_MINIMUM_PLUS_MM = 1;

type MovePolicy = (policy: RoomPolicy) => RoomPolicy;

const MOVED_POLICIES: readonly (readonly [string, MovePolicy])[] = [
  ["widened far past every storage ceiling", widenedPolicy],
  ["narrowed to one millimetre over each minimum", narrowedPolicy],
];

interface StorageCeilings {
  readonly wireBounds: Readonly<Record<string, number>>;
  readonly engineMaxima: readonly number[];
  readonly engineMinima: readonly number[];
  readonly schemaVerdicts: readonly boolean[];
}

describe("the storage ceilings do not follow the approved policy (ADR 0124)", () => {
  it.each(MOVED_POLICIES)(
    "keeps MAX_ROOM_*, the SEC-002 caps, ENGINE_ROOM_LIMITS and DesignRoomSchema where they are when the policy is %s",
    async (_name, movePolicy) => {
      const probeRooms = await probeRoomsAtTheMovedMaxima(movePolicy);
      const unmoved = await loadStorageCeilings(probeRooms);

      const underMovedPolicy = await underReplacedPolicy(movePolicy, () =>
        loadStorageCeilings(probeRooms),
      );

      expect(underMovedPolicy).toStrictEqual(unmoved);
    },
  );

  it.each(MOVED_POLICIES)(
    "delivers the policy %s to the modules that read it, so the comparison above is not vacuous",
    async (_name, movePolicy) => {
      const real = await freshIndex();
      const realRooms = [roomAtMaxima(real.APPROVED_ROOM_POLICY)];
      const moved = await underReplacedPolicy(movePolicy, freshIndex);
      const probeRooms = [
        ...realRooms,
        roomAtMaxima(moved.APPROVED_ROOM_POLICY),
      ];

      const realVerdicts = probeRooms.map(
        (room) => real.validateRoomInput(room, real.APPROVED_ROOM_POLICY).ok,
      );
      const movedVerdicts = probeRooms.map(
        (room) => moved.validateRoomInput(room, moved.APPROVED_ROOM_POLICY).ok,
      );

      expect(moved.APPROVED_ROOM_POLICY).not.toStrictEqual(
        real.APPROVED_ROOM_POLICY,
      );
      expect(movedVerdicts).not.toStrictEqual(realVerdicts);
    },
  );
});

/** A room input at every maximum `policy` states — the room a moved maximum changes the verdict on. */
function roomAtMaxima(policy: RoomPolicy): LRoomInput {
  const l = lOf(policy);
  return {
    shape: "L",
    wallAMm: l.wallA.maxMm,
    wallBMm: l.wallB.maxMm,
    heightMm: policy.heightBounds.maxMm,
    cornerDirection: "left",
  };
}

async function freshIndex(): Promise<typeof import("../src/index.js")> {
  vi.resetModules();
  return import("../src/index.js");
}

/** Every number the storage side derives, from a module graph loaded fresh, plus `DesignRoomSchema`'s
 *  verdict on rooms that sit exactly at a moved policy's maxima — so a schema that read the policy
 *  directly, bypassing `MAX_ROOM_*`, is caught too. */
async function loadStorageCeilings(
  probeRooms: readonly DesignRoom[],
): Promise<StorageCeilings> {
  vi.resetModules();
  const bounds = await import("../src/design-bounds.js");
  const { ENGINE_ROOM_LIMITS } = await import("../src/room/room-policy.js");
  const { DesignRoomSchema } = await import("../src/design.js");
  const engineL = lOf(ENGINE_ROOM_LIMITS);
  return {
    wireBounds: {
      MAX_ROOM_WIDTH_MM: bounds.MAX_ROOM_WIDTH_MM,
      MAX_ROOM_DEPTH_MM: bounds.MAX_ROOM_DEPTH_MM,
      MAX_ROOM_HEIGHT_MM: bounds.MAX_ROOM_HEIGHT_MM,
      MAX_PLACEMENTS: bounds.MAX_PLACEMENTS,
      MAX_COLUMN_EXTENTS: bounds.MAX_COLUMN_EXTENTS,
      MAX_EMPTY_COLUMNS: bounds.MAX_EMPTY_COLUMNS,
      MAX_DESIGN_BYTES: bounds.MAX_DESIGN_BYTES,
    },
    engineMaxima: [
      engineL.wallA.maxMm,
      engineL.wallB.maxMm,
      ENGINE_ROOM_LIMITS.heightBounds.maxMm,
    ],
    engineMinima: [
      engineL.wallA.minMm,
      engineL.wallB.minMm,
      ENGINE_ROOM_LIMITS.heightBounds.minMm,
    ],
    schemaVerdicts: probeRooms.map(
      (room) => DesignRoomSchema.safeParse(room).success,
    ),
  };
}

/** The moved policy's maxima as rooms, one axis at a time, read off the real policy module. */
async function probeRoomsAtTheMovedMaxima(
  movePolicy: MovePolicy,
): Promise<DesignRoom[]> {
  vi.resetModules();
  const { APPROVED_ROOM_POLICY } = await import(
    "../src/room/approved-room-policy.js"
  );
  const real = lOf(APPROVED_ROOM_POLICY);
  const moved = movePolicy(APPROVED_ROOM_POLICY);
  const movedL = lOf(moved);
  const realRoom: DesignRoom = {
    shape: "L",
    widthMm: real.wallA.minMm,
    depthMm: real.wallB.minMm,
    heightMm: APPROVED_ROOM_POLICY.heightBounds.minMm,
  };
  return [
    { ...realRoom, widthMm: movedL.wallA.maxMm },
    { ...realRoom, depthMm: movedL.wallB.maxMm },
    { ...realRoom, heightMm: moved.heightBounds.maxMm },
  ];
}

/** Runs `load` with the policy module replaced, and restores the real module whether or not it
 *  throws — a mock left behind would hand the moved policy to every later load in this file. */
async function underReplacedPolicy<T>(
  movePolicy: MovePolicy,
  load: () => Promise<T>,
): Promise<T> {
  replacePolicyModule(movePolicy);
  try {
    return await load();
  } finally {
    vi.doUnmock(POLICY_MODULE);
    vi.resetModules();
  }
}

function replacePolicyModule(movePolicy: MovePolicy): void {
  vi.doMock(POLICY_MODULE, async (importOriginal) => {
    const original = await importOriginal<typeof ApprovedRoomPolicyModule>();
    return {
      ...original,
      APPROVED_ROOM_POLICY: movePolicy(original.APPROVED_ROOM_POLICY),
    };
  });
}

function widenedPolicy(policy: RoomPolicy): RoomPolicy {
  const l = lOf(policy);
  return withMaxima(policy, {
    wallAMm: l.wallA.maxMm + WIDENED_BY_MM,
    wallBMm: l.wallB.maxMm + WIDENED_BY_MM,
    heightMm: policy.heightBounds.maxMm + WIDENED_BY_MM,
  });
}

function narrowedPolicy(policy: RoomPolicy): RoomPolicy {
  const l = lOf(policy);
  return withMaxima(policy, {
    wallAMm: l.wallA.minMm + NARROWED_TO_MINIMUM_PLUS_MM,
    wallBMm: l.wallB.minMm + NARROWED_TO_MINIMUM_PLUS_MM,
    heightMm: policy.heightBounds.minMm + NARROWED_TO_MINIMUM_PLUS_MM,
  });
}

function withMaxima(
  policy: RoomPolicy,
  maxima: { wallAMm: number; wallBMm: number; heightMm: number },
): RoomPolicy {
  const l = lOf(policy);
  return {
    ...policy,
    buildableShapes: {
      ...policy.buildableShapes,
      L: {
        ...l,
        wallA: { ...l.wallA, maxMm: maxima.wallAMm },
        wallB: { ...l.wallB, maxMm: maxima.wallBMm },
      },
    },
    heightBounds: { ...policy.heightBounds, maxMm: maxima.heightMm },
  };
}

function lOf(policy: RoomPolicy) {
  const l = policy.buildableShapes.L;
  if (!l) throw new Error("a policy in this file states no L");
  return l;
}
