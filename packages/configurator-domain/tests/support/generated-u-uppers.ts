// What a generated U's uppers must be, re-derived from the room and the generated design rather than
// read back from `upper-policy.ts` (ADR 0110 *N3 revised* 9-11, Amendments C and E7, RQ7, RQ14). Each
// check returns the names of the rules a design breaks, so a failing property says which rule.
import {
  buildUShellDesign,
  cabinetDepthMmOf,
  deriveColumns,
  derivePlacementRecords,
  deriveRecordedColumns,
  insertBody,
  recomputeVoids,
  toMetres,
  type DesignPlacement,
  type DesignRoom,
  type EmptyColumn,
} from "../../src/index.js";
import { createFakeProbeFactory } from "./fake-probe.js";
import {
  U_GENERATED_AT,
  uPlanOf,
  type ComposedKitchen,
} from "./generated-u.js";
import { SHELL_CATALOG } from "./shell-design.js";
import { isLargeURoom } from "./u-plan-invariants.js";

const WALL_ROW_FLOOR_MM = 1500;

interface Span {
  readonly wall: string;
  readonly startMm: number;
  readonly endMm: number;
}

function spanOf(placement: DesignPlacement): Span {
  return {
    wall: placement.wall,
    startMm: placement.alongMm - placement.body.widthMm / 2,
    endMm: placement.alongMm + placement.body.widthMm / 2,
  };
}

function overlaps(left: Span, right: Span): boolean {
  return (
    left.wall === right.wall &&
    left.startMm < right.endMm &&
    right.startMm < left.endMm
  );
}

/** The generated uppers and hoods of `result`: the placements its placed `upper` and `hood` steps made. */
export function generatedUppersOf(
  result: ComposedKitchen,
): readonly DesignPlacement[] {
  return result.log.steps.flatMap((step) => {
    if (
      step.status !== "placed" ||
      (step.role !== "upper" && step.role !== "hood")
    ) {
      return [];
    }
    return result.design.placements.filter(
      (placement) => placement.id === step.placementId,
    );
  });
}

/** The spans over a corner's base, wall row and up, that composition places nothing in (7D2 criterion 14):
 *  the wall-only empty space the shell leaves there on a base-only back wall, and where the corner wall unit
 *  stands everywhere else (M7C wave C2: it covers the strip that used to be recorded). */
export function cornerZonesOf(room: DesignRoom): readonly Span[] {
  const shell = buildUShellDesign({ room, occurredAt: U_GENERATED_AT });
  const empty = (shell.emptyColumns ?? [])
    .filter((column: EmptyColumn) => column.y0Mm >= WALL_ROW_FLOOR_MM)
    .map((column) => ({
      wall: column.wall,
      startMm: column.alongMm - column.widthMm / 2,
      endMm: column.alongMm + column.widthMm / 2,
    }));
  const units = shell.placements
    .filter(
      (placement) =>
        placement.y0Mm >= WALL_ROW_FLOOR_MM &&
        placement.body.buildId.startsWith("wall-corner-x-900"),
    )
    .map((placement) => ({
      wall: placement.wall,
      startMm: placement.alongMm - placement.body.widthMm / 2,
      endMm: placement.alongMm + placement.body.widthMm / 2,
    }));
  return [...empty, ...units];
}

/** Every rule of the U's uppers a design breaks; `[]` when it keeps them all. */
export function upperFindings(
  room: DesignRoom,
  result: ComposedKitchen,
): readonly string[] {
  return [
    ...hoodFindings(result),
    ...fullHeightFindings(result),
    ...cornerZoneFindings(room, result),
    ...backWallFindings(room, result),
    ...owedUpperFindings(room, result),
  ];
}

/** RQ7: a hood over the hob, exactly one, in every U. */
function hoodFindings(result: ComposedKitchen): readonly string[] {
  const hoods = generatedUppersOf(result).filter(
    (placement) => placement.body.buildId === "hood",
  );
  const hob = result.design.placements.find(
    (placement) => placement.id === stepPlacementId(result, "hob"),
  );
  if (hoods.length !== 1) return [`${String(hoods.length)} hoods`];
  const [hood] = hoods;
  if (hood === undefined || hob === undefined)
    return ["no hob to carry a hood"];
  return overlaps(spanOf(hood), spanOf(hob))
    ? []
    : ["the hood is not over the hob"];
}

function stepPlacementId(
  result: ComposedKitchen,
  stepId: string,
): string | undefined {
  const step = result.log.steps.find((candidate) => candidate.id === stepId);
  return step?.status === "placed" ? step.placementId : undefined;
}

/** E7: no upper over a body that stands into the wall row. */
function fullHeightFindings(result: ComposedKitchen): readonly string[] {
  const fullHeight = result.design.placements.filter(
    (placement) =>
      placement.y0Mm === 0 && placement.body.heightMm > WALL_ROW_FLOOR_MM,
  );
  return generatedUppersOf(result)
    .filter((upper) =>
      fullHeight.some((body) => overlaps(spanOf(upper), spanOf(body))),
    )
    .map((upper) => `${upper.id} is over a full-height body`);
}

/** 7D2 criterion 14, both corners: no generated upper over the shell's wall-only strips. */
function cornerZoneFindings(
  room: DesignRoom,
  result: ComposedKitchen,
): readonly string[] {
  const zones = cornerZonesOf(room);
  return generatedUppersOf(result)
    .filter((upper) => zones.some((zone) => overlaps(spanOf(upper), zone)))
    .map((upper) => `${upper.id} is over a corner zone`);
}

/** *N3 revised* 11: a large U's wall A carries no generated body at the wall row or above but the hood. */
function backWallFindings(
  room: DesignRoom,
  result: ComposedKitchen,
): readonly string[] {
  if (!isLargeURoom(room)) return [];
  return generatedUppersOf(result)
    .filter((upper) => upper.wall === "A" && upper.body.buildId !== "hood")
    .map((upper) => `${upper.id} on a large U's back wall`);
}

/** RQ14, C and N11.9: each base that stands under the wall row has an upper of its own width, except on
 *  a large U's wall A; the wall-A fill is such a base like any other. */
function owedUpperFindings(
  room: DesignRoom,
  result: ComposedKitchen,
): readonly string[] {
  const uppers = generatedUppersOf(result);
  const findings: string[] = [];
  for (const base of uPlanOf(result).bases) {
    const placement = result.design.placements.find(
      (candidate) => candidate.id === stepPlacementId(result, base.id),
    );
    if (placement === undefined || placement.body.heightMm > WALL_ROW_FLOOR_MM)
      continue;
    const isOwed =
      base.role === "hob" || !(isLargeURoom(room) && base.wall === "A");
    const over = uppers.find((upper) =>
      overlaps(spanOf(upper), spanOf(placement)),
    );
    if (isOwed && over === undefined) findings.push(`no upper over ${base.id}`);
    if (!isOwed && over !== undefined)
      findings.push(`an upper over ${base.id}`);
    if (isOwed && over !== undefined && over.body.buildId !== "hood") {
      const span = spanOf(over);
      const baseSpan = spanOf(placement);
      if (span.startMm !== baseSpan.startMm || span.endMm !== baseSpan.endMm) {
        findings.push(`the upper over ${base.id} is not its width`);
      }
    }
  }
  return findings;
}

/** What inserting a `wall-cabinet` into one of wall A's voids at the wall row or above answered. */
export interface WallCabinetVerdict {
  readonly rowFloorMm: number;
  readonly widthMm: number;
  /** `"accepted"`, or the rejection code `insertBody` gave. */
  readonly verdict: string;
}

/** Every void of wall A at the wall row and above in the generated design, offered a `wall-cabinet`
 *  through `insertBody` with the design as it stands. The design is never changed: each insert is
 *  attempted on its own. */
export function wallCabinetVerdictsOnWallA(
  result: ComposedKitchen,
): readonly WallCabinetVerdict[] {
  const { design } = result;
  const records = derivePlacementRecords(design, SHELL_CATALOG);
  const recordedColumns = deriveRecordedColumns(
    records,
    design,
    toMetres(design.room.widthMm),
  );
  const voids = recomputeVoids(
    records,
    deriveColumns(records, design, design.room),
  );
  const lease = createFakeProbeFactory()(cabinetDepthMmOf(design));
  return lease.use((probe) =>
    voids
      .filter(
        (opening) =>
          opening.wall === "A" && opening.y0 * 1000 >= WALL_ROW_FLOOR_MM,
      )
      .map((opening): WallCabinetVerdict => {
        const inserted = insertBody({
          design,
          catalog: SHELL_CATALOG,
          columns: recordedColumns,
          voids,
          target: { kind: "void", id: opening.id },
          buildId: "wall-cabinet",
          probe,
          occurredAt: U_GENERATED_AT,
        });
        return {
          rowFloorMm: Math.round(opening.y0 * 1000),
          widthMm: Math.round(opening.w * 1000),
          verdict: inserted.ok ? "accepted" : inserted.reason.code,
        };
      }),
  );
}
