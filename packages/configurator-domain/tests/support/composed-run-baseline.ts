// Canonical forms of a composed plan, and the readers of the recording beside this file. A plan rebuilt out of the
// module that composed it agrees with itself, so neutrality against 7D3's composition is provable only against a
// recording: `7d3-composition-baseline.json` was captured with `body-choice.ts` and `generation-priorities.ts` at
// their pre-7D4 bytes (`7816634`), and reproduced byte-identically as 7D8's pre-state. It still carries 7D3's bodies
// (HEAD composes `base-3drawer` where the witnesses hold `base-cabinet`), so the masking still does work.
//
// Known limit: `isMovedByThisWave` tests which slot it is, never which body it holds, and both recorded forms call
// it, so a defect that moves `buildId` between composed slots while leaving positions alone is invisible here. A
// criterion asking whether a build id stayed put needs its own assertion.
//
// A 16-byte digest per room keeps every width, count, remainder, cut, id, role, wall and position (only the two
// allowed build ids are masked) but cannot say which field moved, so witness rooms are compared whole. A storage
// slot is reached through `isComposedStorageSlot`, never `role === "storage"`: the block's full-height columns carry
// that role (ADR 0110 F6).
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { fc } from "@fast-check/vitest";

import {
  APPROVED_ROOM_POLICY,
  DOOR_BASE_BUILD_ID,
  isComposedStorageSlot,
  type DesignPlacement,
  type DesignRoom,
  type DesignWall,
  type GenerationLog,
  type KitchenCompositionPlan,
  type PlannedGenerationBase,
} from "../../src/index.js";

/** The seed and run count the baseline was captured at. A property reading it must draw its rooms at both: the
 *  recording is keyed by room, and a room the capture never saw fails loudly rather than skipping. */
export const BASELINE_SEED = 20260916;
export const BASELINE_RUNS = 240;

/** The preparation role and the storage run's slots are the two modules criterion 2 lets this wave move, so the
 *  recorded form carries a marker where their body would stand. */
const MOVED_BY_THIS_WAVE = "<7D4>";

const PREPARATION_ROLE = "preparation";

/** The L rectangle both recordings were captured over, spelled rather than read from `APPROVED_ROOM_POLICY` on
 *  purpose: the population and the policy were equal only until the policy moved (ADR 0121 decision 2), and
 *  re-capturing over the new policy would mint post-change output into a file that holds the pre-state.
 *  `composed-run-baseline.test.ts` reddens if these start following the policy. */
const RECORDED_L_WALL_A_MIN_MM = 900;
const RECORDED_L_WALL_A_MAX_MM = 6300;
const RECORDED_L_WALL_B_MIN_MM = 1000;
const RECORDED_L_WALL_B_MAX_MM = 5100;
const RECORDED_CEILING_MIN_MM = 2200;
const RECORDED_CEILING_MAX_MM = 3900;

/** The rooms the recordings are keyed by, on a 1 mm grid. Every property that reads a recording draws from this
 *  one at `BASELINE_SEED` and `BASELINE_RUNS`; a live product rule draws from `approvedLRoom` instead. */
export function recordedLRoom(): fc.Arbitrary<DesignRoom> {
  return fc.record({
    shape: fc.constant("L" as const),
    widthMm: fc.integer({
      min: RECORDED_L_WALL_A_MIN_MM,
      max: RECORDED_L_WALL_A_MAX_MM,
    }),
    depthMm: fc.integer({
      min: RECORDED_L_WALL_B_MIN_MM,
      max: RECORDED_L_WALL_B_MAX_MM,
    }),
    heightMm: fc.integer({
      min: RECORDED_CEILING_MIN_MM,
      max: RECORDED_CEILING_MAX_MM,
    }),
  });
}

/** The approved L policy, read from the policy rather than spelled, on a 1 mm grid — so a sweep of a
 *  live product rule follows the policy wherever it moves. Never key a recording by this draw. */
export function approvedLRoom(): fc.Arbitrary<DesignRoom> {
  const l = APPROVED_ROOM_POLICY.buildableShapes.L;
  if (!l) throw new Error("the approved policy states no L to sweep");
  return fc.record({
    shape: fc.constant("L" as const),
    widthMm: fc.integer({ min: l.wallA.minMm, max: l.wallA.maxMm }),
    depthMm: fc.integer({ min: l.wallB.minMm, max: l.wallB.maxMm }),
    heightMm: fc.integer({
      min: APPROVED_ROOM_POLICY.heightBounds.minMm,
      max: APPROVED_ROOM_POLICY.heightBounds.maxMm,
    }),
  });
}

export function roomKey(room: DesignRoom): string {
  return `${String(room.widthMm)}x${String(room.depthMm)}x${String(room.heightMm)}`;
}

/**
 * The whole plan as one string: every field of every planned base, the wall cut, remainders, floor widths and the
 * dropped list. Witness rooms are recorded in this form so a failure shows which field moved.
 */
export function canonicalPlan(plan: KitchenCompositionPlan): string {
  return canonicalPlanWith(plan, (base) => base.buildId);
}

/**
 * The same string with the body of the preparation role and of each composed slot replaced by a marker: the only
 * differences criterion 2 allows. The block's columns and the hob keep their build ids, so a moved block column
 * or a hob not following 7D3's rule still changes the string.
 */
export function canonicalPlanBeyondThisWavesBodies(
  plan: KitchenCompositionPlan,
): string {
  return canonicalPlanWith(plan, (base) =>
    isMovedByThisWave(base) ? MOVED_BY_THIS_WAVE : base.buildId,
  );
}

/**
 * The same string with the door body where a slot may have moved one: 7D3 composed `base-cabinet` in both the
 * preparation row and `STORAGE_BUILD_ID`. A witness rendering this way to the recorded string proves criterion 2
 * whole at that room.
 */
export function canonicalPlanWithTheDoorBodyRestored(
  plan: KitchenCompositionPlan,
): string {
  return canonicalPlanWith(plan, (base) =>
    isMovedByThisWave(base) ? DOOR_BASE_BUILD_ID : base.buildId,
  );
}

/** One planned module's seven fields, in the form the recording spells them. */
export function canonicalModule(base: PlannedGenerationBase): string {
  return canonicalPlannedBase(base, base.buildId);
}

function canonicalPlanWith(
  plan: KitchenCompositionPlan,
  bodyOf: (base: PlannedGenerationBase) => string,
): string {
  return [
    `minimumMet=${String(plan.minimumMet)}`,
    `cut=${String(coreRolesOnWallB(plan))}`,
    `dropped=${plan.dropped.join(",")}`,
    `remainder=${String(plan.remainderMm.A)}/${String(plan.remainderMm.B)}`,
    `floorWidths=${plan.floorWidthsMm.A.join(",")}/${plan.floorWidthsMm.B.join(",")}`,
    ...plan.bases.map((base) => canonicalPlannedBase(base, bodyOf(base))),
  ].join("|");
}

/** The wall cut as the plan reports it — how many core roles the composition put on wall B. The cut
 *  is `chooseWallCut`'s answer and nothing else in the plan states it, so it is derived here rather
 *  than left unrecorded. It is derived from the roles the plan placed and never from the wall's
 *  width, so nothing in this file keys on wall identity (ADR 0120 Amendment C). */
export function coreRolesOnWallB(plan: KitchenCompositionPlan): number {
  return plan.bases.filter(
    (base) => base.wall === "B" && base.role !== "storage",
  ).length;
}

function canonicalPlannedBase(
  base: PlannedGenerationBase,
  body: string,
): string {
  return [
    base.id,
    base.role,
    body,
    base.wall,
    String(base.startMm),
    String(base.endMm),
    String(base.widthMm),
  ].join("~");
}

/** The two modules this wave is allowed to re-body, named by provenance and by role — never by width
 *  and never by `role === "storage"`, which the block's columns also carry. */
export function isMovedByThisWave(base: PlannedGenerationBase): boolean {
  return base.role === PREPARATION_ROLE || isComposedStorageSlot(base);
}

/**
 * The wall row as criterion 21 reads it: every upper and hood step in log order, with the opening it was attempted
 * over, its outcome and, where it stands, the placement it produced. The wave under test composes no upper, so every
 * character of this string is 7D3's.
 */
export function canonicalWallRow(result: {
  readonly log: GenerationLog;
  readonly design: { readonly placements: readonly DesignPlacement[] };
}): string {
  return result.log.steps
    .filter((step) => step.role === "upper" || step.role === "hood")
    .map((step) => {
      if (step.status === "not_placed") {
        return `${step.id}~${step.buildId}~not_placed~${step.reason.code}`;
      }
      const placement = result.design.placements.find(
        (candidate) => candidate.id === step.placementId,
      );
      if (!placement) {
        throw new Error(`step ${step.id} names no placement in the design`);
      }
      return [
        step.id,
        step.buildId,
        "placed",
        placement.body.buildId,
        placement.wall,
        String(placement.alongMm),
        String(placement.body.widthMm),
        String(placement.y0Mm),
      ].join("~");
    })
    .join("|");
}

/** Sixteen hex characters of SHA-256 — enough that a changed plan colliding with its own recording is
 *  not a failure mode anyone will meet, and short enough to read in a diff. */
export function digestOf(canonical: string): string {
  return createHash("sha256").update(canonical).digest("hex").slice(0, 16);
}

export interface RecordedRoom {
  /** The digest of `canonicalPlan` for this room, as 7D3 composed it. */
  readonly plan: string;
  /** The digest of `canonicalWallRow`, or `undefined` where the room composes no kitchen. */
  readonly wallRow: string | undefined;
}

export interface ComposedRunBaseline {
  readonly capturedFrom: string;
  readonly seed: number;
  readonly runs: number;
  readonly rooms: ReadonlyMap<string, RecordedRoom>;
  /** The witness rooms, recorded whole rather than digested, so a failure names the field that
   *  moved. Keyed the same way as `rooms`. */
  readonly witnesses: ReadonlyMap<string, string>;
}

const BASELINE_FILE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "generation",
  "7d3-composition-baseline.json",
);

interface BaselineDocument {
  readonly capturedFrom: string;
  readonly seed: number;
  readonly runs: number;
  /** `"<width>x<depth>x<height> <plan digest> <wall row digest or ->"`, one room per line. */
  readonly rooms: readonly string[];
  readonly witnesses: Readonly<Record<string, string>>;
}

export function readComposedRunBaseline(): ComposedRunBaseline {
  const document = JSON.parse(
    readFileSync(BASELINE_FILE, "utf8"),
  ) as BaselineDocument;
  const rooms = new Map<string, RecordedRoom>();
  for (const line of document.rooms) {
    const [key, plan, wallRow] = line.split(" ");
    if (!key || !plan || !wallRow) {
      throw new Error(`the 7D3 baseline holds an unreadable line: ${line}`);
    }
    rooms.set(key, { plan, wallRow: wallRow === "-" ? undefined : wallRow });
  }
  return {
    capturedFrom: document.capturedFrom,
    seed: document.seed,
    runs: document.runs,
    rooms,
    witnesses: new Map(Object.entries(document.witnesses)),
  };
}

/** 7D3's recorded plan for a witness room, whole. */
export function recordedWitness(
  baseline: ComposedRunBaseline,
  room: DesignRoom,
): string {
  const recorded = baseline.witnesses.get(roomKey(room));
  if (!recorded) {
    throw new Error(`the 7D3 baseline records no witness ${roomKey(room)}`);
  }
  return recorded;
}

/** The recording for `room`, or a throw naming the room — never a skip. A property that quietly
 *  passed over a room the capture never saw would report coverage it does not have. */
export function recordedRoom(
  baseline: ComposedRunBaseline,
  room: DesignRoom,
): RecordedRoom {
  const recorded = baseline.rooms.get(roomKey(room));
  if (!recorded) {
    throw new Error(
      `the 7D3 baseline holds no room ${roomKey(room)}; it was captured at seed ` +
        `${String(baseline.seed)} over ${String(baseline.runs)} runs; a property reading it must draw from ` +
        `recordedLRoom(), and the file is NOT re-captured to fit a moved policy (M7 wave 7A3)`,
    );
  }
  return recorded;
}

/** A wall's modules in the order they stand along it, corner to free end. */
export function alongTheWall(
  bases: readonly PlannedGenerationBase[],
  wall: DesignWall,
): readonly PlannedGenerationBase[] {
  return [...bases.filter((base) => base.wall === wall)].sort(
    (left, right) => left.startMm - right.startMm,
  );
}
