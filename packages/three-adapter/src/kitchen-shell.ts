import {
  runEndPanelSeatM,
  type PlacementRecord,
} from "@lemnaria/configurator-domain";
import type { Group, Object3D } from "three";

import { disposeDiscardedBodies } from "./kit-disposal.js";
import {
  RUN_END_PANEL_NAME,
  RUN_END_PANEL_SEEDED_X_M,
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

export interface RunEndPanelInput {
  /** The `solids` group: the shell plus every mounted customer body. */
  readonly solidsRoot: Object3D;
  readonly records: readonly PlacementRecord[];
}

/** ADR 0045: the run-end panel closes the **last base cabinet on screen**, not the run's nominal
 *  extent, so its along-wall seat and its visibility are re-derived from the current records on
 *  every sync — a shrink, a delete and an insert all move the end of the run.
 *
 *  **The seat itself is not derived here.** `runEndPanelSeatM` is the domain's, because the panel
 *  is also part of wall A's occupied width and a coverage query needs the same number (ADR 0083
 *  decision 5). This function is the projection of that one fact onto a mesh: it finds the panel,
 *  seats it, and shows or hides it. Re-deriving the seat, the veto or either slab constant here
 *  would restore the two-derivation defect the move closed.
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
