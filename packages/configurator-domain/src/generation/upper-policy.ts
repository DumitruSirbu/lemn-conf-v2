// Which planned bases get an upper, and which upper it is (ADR 0110 Amendments C and E7, and *N3
// revised* 9-11 for a U). `generateKitchen` places an upper by `insertBody` into the shell's wall-row
// void above a base, so an upper this policy does not owe leaves its void behind, and the editor's
// ordinary insert reaches it (N11, RQ7).
//
// What a U adds to the L's rule, and no more:
// - **A large U's back wall is base-only** (*N3 revised* 11, RQ7, owner): no wall-row or top-row body
//   is generated on wall A, and the hood over the hob stays, because a hood is an appliance and the
//   owner's reason was the cost of furniture.
// - Below 10 m the uppers follow C and E7 as the L's do: over the back wall (the wall-A fill at its own
//   width included, N11.9), over the far wall's door bases (RQ14, "Base + uppers"), and never over a
//   full-height body.
// - **No upper over either corner zone (7D2 criterion 14, backlog 63's class at A∩C) needs no test
//   here**: a base stands only in its wall's floor run, and each run starts past its corner's reach
//   (`uShellFloorRuns`), so an upper over a base is never over a corner zone. What guards it is the
//   property over generated designs, which reads the shell's own wall-only strips.
import type { DesignRoom } from "../design.js";
import type { BodyCatalog } from "../void-engine.js";
import { isLargeU, type UPlannedGenerationBase } from "./run-layout.js";

export const WALL_ROW_Y0_MM = 1500;
export const WALL_CABINET_BUILD_ID = "wall-cabinet";
export const HOOD_BUILD_ID = "hood";

export type UpperRole = "upper" | "hood";

export function upperRoleOver(planned: UPlannedGenerationBase): UpperRole {
  return planned.role === "hob" ? "hood" : "upper";
}

export function upperBuildIdOver(planned: UPlannedGenerationBase): string {
  return planned.role === "hob" ? HOOD_BUILD_ID : WALL_CABINET_BUILD_ID;
}

/** Whether generation owes an upper above `planned`: none over a full-height body (E7), and none over
 *  wall A's bodies in a large U, whose hob keeps its hood. */
export function isAnUpperOwedOver(
  planned: UPlannedGenerationBase,
  context: { readonly room: DesignRoom; readonly catalog: BodyCatalog },
): boolean {
  if (risesIntoWallRow(context.catalog, planned.buildId)) return false;
  return !isBackWallBaseOnly(planned, context.room);
}

/** *N3 revised* 11: in a large U wall A's wall and top rows carry no generated body, the hood aside. */
function isBackWallBaseOnly(
  planned: UPlannedGenerationBase,
  room: DesignRoom,
): boolean {
  return (
    room.shape === "U" &&
    isLargeU(room) &&
    planned.wall === "A" &&
    planned.role !== "hob"
  );
}

/** ADR 0110 Amendment E7: an upper is attempted above a base only where the body's declared top is
 *  at or below the wall row's floor. A body that reaches past it — the fridge today, a full-height
 *  column tomorrow — leaves no opening there, and reading the catalogue's declared height rather
 *  than a list of role names means a new full-height body needs no second place to be remembered. */
function risesIntoWallRow(catalog: BodyCatalog, buildId: string): boolean {
  const declaredTopMm = catalog.get(buildId)?.nominalHeightMm;
  if (declaredTopMm === undefined) {
    throw new Error(
      `generateKitchen: ${buildId} declares no height, so no upper can be ruled above it`,
    );
  }
  return declaredTopMm > WALL_ROW_Y0_MM;
}
