import type { PlacementRecord } from "@lemnaria/configurator-domain";
import type { Group, Object3D } from "three";

import { disposeDiscardedBodies } from "./kit-disposal.js";
import {
  RUN_END_PANEL_EDGE_OFFSET_M,
  RUN_END_PANEL_HEIGHT_M,
  RUN_END_PANEL_NAME,
  RUN_END_PANEL_SEEDED_X_M,
  RUN_END_PANEL_THICKNESS_M,
  type Kit,
} from "./kitchen-parts.js";

/** The immutable room children in `docs/design/SPEC.md`'s L-shape scene. Customer bodies are
 * deliberately absent: `syncSolidBodies` is their sole owner and tags every one with a
 * `placementId` for §6.1 picking. */
const KITCHEN_L_SHELL_CHILD_NAMES = new Set([
  "floor",
  "wall_back",
  "wall_left",
  RUN_END_PANEL_NAME,
  "backsplash_wall_a",
]);

/** Builds the canonical room shell without consulting the currently loaded design.
 *
 * The full reference builder remains the geometry source so the shell stays inside M1's 1e-6 m
 * fidelity gate. Its customer bodies are removed from a fixed shell manifest, never inferred from
 * current placement records: a placement deleted before this first build must not survive as an
 * untagged, unselectable reference ghost. */
export function buildKitchenShell(kit: Kit): Group {
  const shell = kit.builders["kitchen-l"]();
  const discarded = shell.children.filter(isCustomerBody);
  for (const child of discarded) shell.remove(child);
  // The reference builder is the geometry source, so this call allocates a whole 32-child room and
  // keeps five of it. Whatever the other 27 alone allocated is released here rather than left for
  // the garbage collector, which never frees a GPU buffer.
  disposeDiscardedBodies({ kit, discarded, retained: shell.children });
  return shell;
}

function isCustomerBody(child: Object3D): boolean {
  return !KITCHEN_L_SHELL_CHILD_NAMES.has(child.name);
}

/** `syncSolidBodies`'s tag on every body it mounts (`scene-sync.ts`), and what `picking.ts` climbs
 * to. Declared here rather than imported because `scene-sync.ts` depends on this module. */
const PLACEMENT_ID_KEY = "placementId";

const PANEL_HALF_THICKNESS_M = RUN_END_PANEL_THICKNESS_M / 2;

/** M1's float-artefact allowance, which is what separates "touching" from "intersecting" here. It
 * is not a product tolerance — `DEVELOPMENT-SPEC.md` §2 owns those. */
const TOUCHING_TOLERANCE_M = 1e-6;

export interface RunEndPanelInput {
  /** The `solids` group: the shell plus every mounted customer body. */
  readonly solidsRoot: Object3D;
  readonly records: readonly PlacementRecord[];
}

/** ADR 0045: the run-end panel closes the **last base cabinet on screen**, not the run's nominal
 *  extent, so its along-wall seat and its visibility are re-derived from the current records on
 *  every sync — a shrink, a delete and an insert all move the end of the run.
 *
 *  This re-crosses the seam `db9c402` closed, and stays on the narrow side of it deliberately:
 *  membership is still the literal manifest above, so no record can create the panel and none can
 *  remove it. Only `position.x` and `visible` are derived, and `visible` is a projection of the
 *  record set onto a boolean — a hidden panel that was always shell cannot be a body outliving its
 *  own deletion, which is the failure that commit fixed. The panel carries no `placementId` and
 *  never enters §6.1 picking, before or after.
 *
 *  Both branches write both properties, so the whole derivation is a pure function of the records:
 *  a scene that reached "no base run" by deletion and one loaded that way are one picture, which is
 *  ADR 0045's anti-invariant. */
export function syncRunEndPanel(input: RunEndPanelInput): void {
  // A caller may mount bodies into a bare group with no shell at all: every headless suite that
  // exercises `syncSolidBodies` alone does. There is then no panel to seat, which is not an error.
  const panel = findRunEndPanel(input.solidsRoot);
  if (!panel) return;

  const seatM = runEndPanelSeatM(input.records);
  panel.visible = seatM !== undefined;
  panel.position.x = seatM ?? RUN_END_PANEL_SEEDED_X_M;
}

/** Where the panel stands, or `undefined` when there is nowhere for it to stand.
 *
 *  ADR 0045 says the panel closes the last base cabinet *"if possible"*, and this is the "if
 *  possible": owner, 2026-09-01, the panel is hidden when something already occupies the seat it
 *  would take. A full-height column can stand immediately right of the last base cabinet — delete a
 *  base, a wall and a top body, let §10 merge the opening, insert `tall-pantry-600` — and the panel
 *  would otherwise be buried 19 mm inside its side, two solids sharing a face.
 *
 *  Only the seat is contested, never the run: a column is where a base run *ends*, not a member of
 *  it, and a base-height end panel finishes nothing against a 2200 mm body. So the run's end is
 *  still read from base placements alone, and every other wall-A body can only veto. */
function runEndPanelSeatM(
  records: readonly PlacementRecord[],
): number | undefined {
  const runEndM = baseRunRightEdgeM(records);
  if (runEndM === undefined) return undefined;

  const seatM = runEndM + RUN_END_PANEL_EDGE_OFFSET_M;
  return records.some((record) => blocksSeat(record, seatM))
    ? undefined
    : seatM;
}

/** The right edge of the right-most wall-A base placement, or `undefined` when the wall carries
 *  none. `frame.x` is a wall-A body's centre along the wall and `frame.w` its carcass width, so
 *  the edge is the one plus half the other — the same arithmetic §12 validates a placement with. */
function baseRunRightEdgeM(
  records: readonly PlacementRecord[],
): number | undefined {
  let rightEdgeM: number | undefined;
  for (const record of records) {
    if (record.wall !== "A" || record.band !== "base") continue;
    const edgeM = record.frame.x + record.frame.w / 2;
    if (rightEdgeM === undefined || edgeM > rightEdgeM) rightEdgeM = edgeM;
  }
  return rightEdgeM;
}

/** Whether this record stands where the panel would, in the two axes the panel occupies.
 *
 *  Both are needed and neither alone is: wall A's cabinets share an along-wall line with the base
 *  run — the seeded wall body over `p4` spans the same 2.90–3.50 — and one hanging at 1500 mm is
 *  nowhere near a panel that ends at 820. A veto on `x` alone would hide the panel for a cabinet
 *  that is not touching it; a veto on `y` alone would hide it for every wall-A body in the room. */
function blocksSeat(record: PlacementRecord, seatM: number): boolean {
  if (record.wall !== "A" || record.band === "base") return false;
  return (
    overlaps(
      [
        record.frame.x - record.frame.w / 2,
        record.frame.x + record.frame.w / 2,
      ],
      [seatM - PANEL_HALF_THICKNESS_M, seatM + PANEL_HALF_THICKNESS_M],
    ) &&
    overlaps(
      [record.frame.y0, record.frame.y0 + record.frame.h],
      // The panel stands on the floor, so its own interval starts at 0.
      [0, RUN_END_PANEL_HEIGHT_M],
    )
  );
}

/** Open intervals: two bodies that merely touch, which is what a cabinet standing exactly beside
 *  the panel does, do not intersect. The tolerance is M1's own float-artefact allowance, so a
 *  shared face that arrives as 3.5189999 does not read as an overlap. */
function overlaps(
  [leftLow, leftHigh]: readonly [number, number],
  [rightLow, rightHigh]: readonly [number, number],
): boolean {
  return (
    leftLow < rightHigh - TOUCHING_TOLERANCE_M &&
    rightLow < leftHigh - TOUCHING_TOLERANCE_M
  );
}

/** The shell is the one `solidsRoot` child `syncSolidBodies` did not mount, which is the manifest's
 *  meaning stated structurally. Identifying it by name would be a naming convention doing a
 *  safety job: a customer body is a `solidsRoot` child too, so a name search here could reach into
 *  one and move a mesh a placement owns — `db9c402`'s shape, from the other direction. */
function findRunEndPanel(solidsRoot: Object3D): Object3D | undefined {
  const shell = solidsRoot.children.find(
    (child) => child.userData[PLACEMENT_ID_KEY] === undefined,
  );
  return shell?.children.find((node) => node.name === RUN_END_PANEL_NAME);
}
