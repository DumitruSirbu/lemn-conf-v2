import type { Group } from "three";

import type { Kit } from "./kitchen-parts.js";

/** The immutable room children in `docs/design/SPEC.md`'s L-shape scene. Customer bodies are
 * deliberately absent: `syncSolidBodies` is their sole owner and tags every one with a
 * `placementId` for §6.1 picking. */
const KITCHEN_L_SHELL_CHILD_NAMES = new Set([
  "floor",
  "wall_back",
  "wall_left",
  "end_panel_right",
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
  for (const child of [...shell.children]) {
    if (!KITCHEN_L_SHELL_CHILD_NAMES.has(child.name)) shell.remove(child);
  }
  return shell;
}
