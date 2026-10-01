// M7 wave 7D4 slice S4 — what 7D3 composed, recorded once, and the canonical forms it is recorded
// over. **"This wave" throughout this module means 7D4**, whose criteria the canonical forms are
// shaped for; the re-capture paragraph below names each later wave that re-takes the recording.
//
// **Criteria 2 and 21 say *deep-equal to 7D3's*, and neither can be proved from this wave's own
// output.** A plan rebuilt out of the module that composed it agrees with itself whatever that module
// does, and a width neutrality asserted that way is a tautology wearing a criterion's number. So the
// baseline file beside this one is a **recording**: the tree at `9daf757` with 7D4's two production
// modules — `body-choice.ts` and `generation-priorities.ts` — restored to their pre-wave bytes
// (`7816634`, 7D3's last commit on either), swept over the rooms below, and the wave's own modules
// put back from a byte copy. Nothing else in the tree was touched, which is what makes the recording
// 7D3's composition **as this wave found it** rather than a reconstruction of it.
//
// **Re-captured 2026-09-16, wave 7D8 slice S0, and the recording is now 7D8's pre-state as well as
// 7D3's composition.** 7D8 re-keys which wall carries the reading order's prefix and moves 38.95 % of
// placed rooms, so the file has to be a recording of *that* wave's pre-state before its first
// production edit lands. **The method is the one above and the restore step was measured rather than
// assumed: `git diff HEAD -- packages/` was empty at the then-HEAD `8ebff1f`, so the pre-wave bytes of
// `generation-priorities.ts` (blob `d893354`) and `tall-end-rule.ts` (blob `96c0c8e`) were already on
// the tree and no restore was needed.** The sweep ran at the same `BASELINE_SEED` and `BASELINE_RUNS`
// through `planKitchenComposition` and `generateKitchen` directly, and **reproduced all 240 room
// lines and all five witnesses byte-identically**, which is what licenses one file to serve both
// waves. **The re-capture is not an echo of HEAD's raw output**: HEAD composes `base-3drawer` where
// the recorded witnesses hold `base-cabinet`, in the preparation role and in the first storage slot
// after the hob, so the recording still carries 7D3's bodies and 7D4's masking is still doing work.
//
// **What the recording does not cover, stated here because a later wave will need it — and the
// witnesses do not cover it either.** `isMovedByThisWave` is a test of *which slot it is*, by role
// and provenance, and never of *which body it holds*. **Both** recorded forms call it: the 240 room
// digests through `canonicalPlanBeyondThisWavesBodies` and the five whole witnesses through
// `canonicalPlanWithTheDoorBodyRestored`. So a defect that moves `buildId` between composed slots
// while leaving every position alone is substituted away on both sides of both comparisons, and the
// five witnesses are the same blindness spelled out longhand rather than a second opinion on it.
// **A criterion asking whether a build id stayed put cannot be discharged from this file at all** and
// needs its own assertion.
//
// **Why a digest rather than the plans themselves.** Criterion 2 allows exactly one difference —
// `buildId`, on the preparation role and on the storage run's own slots — so the canonical form below
// replaces those two build ids with a marker and spells every other field verbatim. A recorded
// digest of that string is 16 bytes per room instead of a kilobyte, and the criterion's whole content
// survives it: any width, count, remainder, cut, id, role, wall or position that moves changes the
// string. **What a digest cannot do is say which field moved**, so the suite pairs it with witness
// rooms whose plans are compared field by field.
//
// A storage slot is reached through `isComposedStorageSlot` and never through `role === "storage"`: the
// block's full-height columns carry that role deliberately (ADR 0110 E5.2), and a rule scoped by it
// is wrong on 32.8 % of placed rooms against output that is correct (D12).
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

/** The seed and run count the baseline was captured at. A property reading the baseline **must**
 *  draw its rooms at both, because the recording is keyed by room: a run that draws a room the
 *  capture never saw fails loudly rather than skipping, which is what makes a fast-check upgrade a
 *  red test instead of a quieter sweep. */
export const BASELINE_SEED = 20260916;
export const BASELINE_RUNS = 240;

/** The preparation role and the storage run's slots are the two modules criterion 2 lets this wave move,
 *  so the recorded form carries a marker where their body would stand. */
const MOVED_BY_THIS_WAVE = "<7D4>";

const PREPARATION_ROLE = "preparation";

/** The L rectangle both recordings were captured over, **spelled rather than read from
 *  `APPROVED_ROOM_POLICY`, on purpose.** The recording's population and the product's policy are two
 *  different things that were equal until M7 wave 7A3 moved the policy (ADR 0121 decision 2): the
 *  rooms keyed in `7d3-composition-baseline.json` and `7d8-re-keyed-baseline.json` were drawn from
 *  exactly these bounds, and a draw over any other rectangle reaches rooms the capture never saw.
 *  Re-capturing over the new policy would mint post-change output into a file whose purpose is to
 *  hold the pre-state. `composed-run-baseline.test.ts` reddens if these start following the policy. */
const RECORDED_L_WALL_A_MIN_MM = 900;
const RECORDED_L_WALL_A_MAX_MM = 6300;
const RECORDED_L_WALL_B_MIN_MM = 1000;
const RECORDED_L_WALL_B_MAX_MM = 5100;
const RECORDED_CEILING_MIN_MM = 2200;
const RECORDED_CEILING_MAX_MM = 3900;

/** The rooms the recordings are keyed by, on a 1 mm grid. **Every property that reads a recording draws
 *  from this one**, at `BASELINE_SEED` and `BASELINE_RUNS`; a property about a live product rule draws
 *  from `approvedLRoom` instead. */
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
 * The whole plan as one string: every field of every planned base, the wall cut, the remainders, the
 * floor widths and the dropped list. The witness rooms are recorded in this form, so a failure shows
 * which field moved rather than only that one did.
 */
export function canonicalPlan(plan: KitchenCompositionPlan): string {
  return canonicalPlanWith(plan, (base) => base.buildId);
}

/**
 * The same string with the body of the preparation role and of each composed slot replaced by a marker,
 * because those two are the only differences criterion 2 allows this wave. **The block's columns and
 * the hob keep their build ids**, so a block column whose identity moved, or a hob following
 * something other than 7D3's rule, still changes the string.
 */
export function canonicalPlanBeyondThisWavesBodies(
  plan: KitchenCompositionPlan,
): string {
  return canonicalPlanWith(plan, (base) =>
    isMovedByThisWave(base) ? MOVED_BY_THIS_WAVE : base.buildId,
  );
}

/**
 * The same string with the **door body** where this wave is allowed to have moved one — which is what
 * 7D3 composed in both places: its preparation row declared `base-cabinet` and its `STORAGE_BUILD_ID`
 * was the same row (`generation-priorities.ts:34` at `7816634`).
 *
 * A witness whose plan renders this way to the recorded string has proved criterion 2 whole at that
 * room: every other field and every other build id is 7D3's, and the modules this wave did move were
 * door cabinets before it.
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
 * The wall row as criterion 21 reads it: every upper and hood step in log order, with the opening it
 * was attempted over (the step id names the base), its outcome, and — where it stands — the body,
 * wall, position, width and row of the placement it produced.
 *
 * This wave composes no upper at all, so **every character of this string is 7D3's** and the
 * criterion is that none of it moved.
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
