// M7B U3b adversarial QA: a generated U held to its plan and to the rules, by geometry read off the
// design rather than through the log's own step-to-placement links. Each check returns the names of
// the rules a generated kitchen breaks, so `[]` means it keeps them all.
//
// What is independent of the code under test:
// - A floor body is matched to a planned base by wall, build id and along-wall span, and the match
//   must be one to one: no planned base missing, no generated body the plan did not ask for.
// - The shell's own bodies are told apart by `cornerOf`, and every other body must come from a logged
//   `insert_body`, with the log replaying to the same design.
// - Which bases owe an upper is restated from ADR 0110 C, E7 and *N3 revised* 11: every base whose
//   declared top is at or below the wall row, except wall A's non-hob bases in a large U.
// - The minimum kitchen is ADR 0108 H3 over the entered lengths, with the approved reaches.
import {
  buildKitchenLBodyCatalog,
  cabinetDepthMmOf,
  cornerOf,
  findOverflowingPlacementIds,
  isUKitchenPlan,
  replayGenerationLog,
  uShellFloorRuns,
  validateDesignForCatalog,
  type Design,
  type DesignPlacement,
  type DesignRoom,
  type DesignWall,
  type GenerateKitchenResult,
  type UPlannedGenerationBase,
} from "../../src/index.js";
import { createFakeProbeFactory } from "./fake-probe.js";

const WALL_ROW_FLOOR_MM = 1500;
const LARGE_U_TOTAL_MM = 10_000;
const MODULE_MM = 600;
const MAX_WALL_A_BARE_MM = 299;
const MAX_SIDE_WALL_BARE_MM = 599;
const OVEN_BUILD_IDS = new Set(["tall-oven-tower", "base-hob-oven"]);
const FRIDGE = "fridge-free";
const HOOD = "hood";
const WALL_CABINET = "wall-cabinet";
/** The editor's own commands, the only ones a generation log may carry (ADR 0110 decisions 1-2). */
const EDITOR_COMMAND_TYPES: ReadonlySet<string> = new Set([
  "insert_body",
  "set_width",
]);

/** ADR 0108 H3 with the approved reaches: wall A gives up 1800 mm to its two X-legs, a side wall
 *  1000 mm (its corner's 900 and the 100 mm slide reserve), over the **entered** lengths. */
const APPROVED_WALL_A_REACH_MM = 1800;
const APPROVED_SIDE_WALL_REACH_MM = 1000;

export function holdsH3(room: DesignRoom): boolean {
  const freeAMm = room.widthMm - APPROVED_WALL_A_REACH_MM;
  const farMm = Math.min(room.depthMm, room.wallCMm ?? 0);
  const freeFarMm = farMm - APPROVED_SIDE_WALL_REACH_MM;
  return (
    freeAMm >= 2 * MODULE_MM || (freeAMm >= MODULE_MM && freeFarMm >= MODULE_MM)
  );
}

type Composed = Extract<GenerateKitchenResult, { ok: true }>;

interface Span {
  readonly wall: DesignWall;
  readonly startMm: number;
  readonly endMm: number;
}

function spanOf(placement: DesignPlacement): Span {
  const halfMm = placement.body.widthMm / 2;
  return {
    wall: placement.wall,
    startMm: placement.alongMm - halfMm,
    endMm: placement.alongMm + halfMm,
  };
}

function sameSpan(left: Span, right: Span): boolean {
  return (
    left.wall === right.wall &&
    left.startMm === right.startMm &&
    left.endMm === right.endMm
  );
}

function overlaps(left: Span, right: Span): boolean {
  return (
    left.wall === right.wall &&
    left.startMm < right.endMm &&
    right.startMm < left.endMm
  );
}

function isLargeURoom(room: DesignRoom): boolean {
  return room.widthMm + room.depthMm + (room.wallCMm ?? 0) >= LARGE_U_TOTAL_MM;
}

/** Every rule a generated U breaks. A refused room is judged on the gate alone. */
export function generatedUFindings(
  room: DesignRoom,
  result: GenerateKitchenResult,
): readonly string[] {
  const placesSinkAndHob =
    result.ok &&
    result.log.steps.some((s) => s.role === "sink" && s.status === "placed") &&
    result.log.steps.some((s) => s.role === "hob" && s.status === "placed");
  if (placesSinkAndHob !== holdsH3(room)) {
    return [
      `H3 says ${String(holdsH3(room))}, generation placed sink and hob: ${String(placesSinkAndHob)}`,
    ];
  }
  if (!result.ok) return [];
  return [
    ...commandFindings(result),
    ...floorFindings(room, result),
    ...upperFindings(room, result),
    ...ovenFindings(result.design),
    ...designFindings(result.design),
  ];
}

function catalogOf(design: Design) {
  return buildKitchenLBodyCatalog(cabinetDepthMmOf(design));
}

function planOf(result: Composed) {
  const { plan } = result.log;
  if (!isUKitchenPlan(plan))
    throw new Error("a U's log carries a two-wall plan");
  return plan;
}

function isShellBody(design: Design, placement: DesignPlacement): boolean {
  return cornerOf(placement, design.room, catalogOf(design)) !== undefined;
}

function generatedBodies(design: Design): readonly DesignPlacement[] {
  return design.placements.filter(
    (placement) => !isShellBody(design, placement),
  );
}

/** AC5 and AC1: only `insert_body` and `set_width`, one placed step per generated body, and the log
 *  replays to the design byte for byte. */
function commandFindings(result: Composed): readonly string[] {
  const findings: string[] = [];
  const { log, design } = result;
  if (log.commands.some((c) => !EDITOR_COMMAND_TYPES.has(c.type))) {
    findings.push("a command other than insert_body or set_width");
  }
  const inserts = log.commands.filter((c) => c.type === "insert_body").length;
  const generated = generatedBodies(design).length;
  if (inserts !== generated) {
    findings.push(
      `${String(inserts)} insert_body commands for ${String(generated)} generated bodies`,
    );
  }
  const replayed = replayGenerationLog({
    log,
    probeAt: createFakeProbeFactory(),
  });
  if (JSON.stringify(replayed) !== JSON.stringify(design)) {
    findings.push("the log does not replay to the design");
  }
  return findings;
}

/** AC1 (N11.6): the floor bodies are exactly the plan's bases, span for span; bare ends A < 300,
 *  side walls < 600 (A4, N11.9). */
function floorFindings(room: DesignRoom, result: Composed): readonly string[] {
  const findings: string[] = [];
  const plan = planOf(result);
  const floor = generatedBodies(result.design).filter(
    (p) => p.y0Mm < WALL_ROW_FLOOR_MM,
  );
  const unmatched = [...floor];
  for (const base of plan.bases) {
    const index = unmatched.findIndex(
      (p) => p.body.buildId === base.buildId && sameSpan(spanOf(p), base),
    );
    if (index === -1) {
      findings.push(
        `planned ${base.buildId} ${base.wall} ${String(base.startMm)}-${String(base.endMm)} not generated there`,
      );
      continue;
    }
    unmatched.splice(index, 1);
  }
  for (const extra of unmatched) {
    findings.push(
      `generated ${extra.body.buildId} on ${extra.wall} that the plan does not hold`,
    );
  }
  const runs = uShellFloorRuns(room);
  for (const wall of ["A", "B", "C"] as const) {
    const usedMm = floor
      .filter((p) => p.wall === wall)
      .reduce((sum, p) => sum + p.body.widthMm, 0);
    const bareMm = runs[wall].endMm - runs[wall].startMm - usedMm;
    const maxMm = wall === "A" ? MAX_WALL_A_BARE_MM : MAX_SIDE_WALL_BARE_MM;
    if (bareMm < 0 || bareMm > maxMm)
      findings.push(`wall ${wall} bare ${String(bareMm)} mm`);
  }
  return findings;
}

/** Which planned bases owe an upper (C, E7, *N3r* 11): none over a body rising past the wall row, none
 *  over wall A's non-hob bases in a large U; a hood over the hob, a wall cabinet of the base's width
 *  over the rest. */
function owesAnUpper(
  room: DesignRoom,
  base: UPlannedGenerationBase,
  design: Design,
): boolean {
  const topMm =
    catalogOf(design).get(base.buildId)?.nominalHeightMm ?? Infinity;
  if (topMm > WALL_ROW_FLOOR_MM) return false;
  return !(isLargeURoom(room) && base.wall === "A" && base.role !== "hob");
}

function upperFindings(room: DesignRoom, result: Composed): readonly string[] {
  const findings: string[] = [];
  const { design } = result;
  const plan = planOf(result);
  const uppers = generatedBodies(design).filter(
    (p) => p.y0Mm >= WALL_ROW_FLOOR_MM,
  );
  const unmatched = [...uppers];
  for (const base of plan.bases.filter((b) => owesAnUpper(room, b, design))) {
    const buildId = base.role === "hob" ? HOOD : WALL_CABINET;
    const index = unmatched.findIndex(
      (p) => p.body.buildId === buildId && sameSpan(spanOf(p), base),
    );
    if (index === -1) {
      findings.push(
        `no ${buildId} over ${base.buildId} ${base.wall} ${String(base.startMm)}-${String(base.endMm)}`,
      );
      continue;
    }
    unmatched.splice(index, 1);
  }
  for (const extra of unmatched) {
    findings.push(
      `an upper ${extra.body.buildId} on ${extra.wall} over no base that owes one`,
    );
  }
  if (uppers.filter((p) => p.body.buildId === HOOD).length !== 1)
    findings.push("not exactly one hood");
  const runs = uShellFloorRuns(room);
  const catalog = catalogOf(design);
  const fullHeight = design.placements.filter(
    (p) =>
      (catalog.get(p.body.buildId)?.nominalHeightMm ?? 0) > WALL_ROW_FLOOR_MM,
  );
  const shell = design.placements.filter((p) => isShellBody(design, p));
  for (const upper of uppers) {
    const span = spanOf(upper);
    if (
      span.startMm < runs[upper.wall].startMm ||
      span.endMm > runs[upper.wall].endMm
    ) {
      findings.push(
        `${upper.body.buildId} on ${upper.wall} outside the floor run (a corner zone)`,
      );
    }
    if (fullHeight.some((p) => overlaps(spanOf(p), span))) {
      findings.push(
        `${upper.body.buildId} on ${upper.wall} over a full-height body`,
      );
    }
    if (shell.some((p) => overlaps(spanOf(p), span))) {
      findings.push(
        `${upper.body.buildId} on ${upper.wall} over a corner piece`,
      );
    }
  }
  return findings;
}

/** E4 and E10: exactly one oven, and none touching the fridge on its wall. */
function ovenFindings(design: Design): readonly string[] {
  const findings: string[] = [];
  const ovens = design.placements.filter((p) =>
    OVEN_BUILD_IDS.has(p.body.buildId),
  );
  if (ovens.length !== 1) findings.push(`${String(ovens.length)} ovens`);
  const fridge = design.placements.find((p) => p.body.buildId === FRIDGE);
  if (fridge) {
    const fridgeSpan = spanOf(fridge);
    for (const oven of ovens) {
      const ovenSpan = spanOf(oven);
      const touches =
        ovenSpan.wall === fridgeSpan.wall &&
        (ovenSpan.endMm === fridgeSpan.startMm ||
          ovenSpan.startMm === fridgeSpan.endMm);
      if (touches) findings.push(`${oven.body.buildId} beside the fridge`);
    }
  }
  return findings;
}

function designFindings(design: Design): readonly string[] {
  const findings: string[] = [];
  if (findOverflowingPlacementIds(design).length > 0)
    findings.push("an overflowing placement");
  if (validateDesignForCatalog(design, catalogOf(design)).length > 0) {
    findings.push("the design fails catalogue validation");
  }
  return findings;
}
