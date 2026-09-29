// ADR 0132 decision 2: a U's right corner is the left corner drawn in a reflection, and the
// reflection is one wrapper group per piece, mirrored about that piece's own origin with
// `applyCornerDirection` (ADR 0129 decision 4) — never one group about the room's centre line, which
// ADR 0129 rejected because its plane would move with every resize.
//
// Which pieces are the right corner's is the domain's answer (`cornerOf`, ADR 0121). This module
// reads that answer and compares no position of its own. Everything else in a U — wall C's own
// bodies included — is drawn at its world frame, unmirrored (Q-U5).
import {
  buildKitchenLBodyCatalog,
  cornerOf,
  toMillimetres,
  type BodyCatalog,
  type DesignPlacement,
  type DesignRoom,
  type PlacementRecord,
} from "@lemnaria/configurator-domain";
import * as THREE from "three";

import { applyCornerDirection } from "./corner-direction.js";
import type { Kit } from "./kitchen-parts.js";

export const RIGHT_CORNER_WRAPPER_NAME = "right_corner_wrapper";

const NO_RIGHT_CORNER_PIECES: ReadonlySet<string> = new Set();

/** The ids of the records that stand in the right corner. Empty for every room that is not a U:
 *  an L or a straight room has one corner, always the left (`cornerOf`'s own rule), so nothing
 *  outside a U is ever wrapped and its scene is exactly what it was before wrappers existed. */
export function rightCornerRecordIds(input: {
  readonly kit: Kit;
  readonly room: DesignRoom;
  readonly records: readonly PlacementRecord[];
}): ReadonlySet<string> {
  if (input.room.shape !== "U") return NO_RIGHT_CORNER_PIECES;

  const catalog = catalogueTheKitBuildsWith(input.kit);
  const rightPieces = input.records.filter(
    (record) =>
      cornerOf(placementStandingFor(record), input.room, catalog) === "right",
  );
  return new Set(rightPieces.map((record) => record.id));
}

/** Puts `body` in a wrapper mirrored in its own local X about the wrapper's origin, with the body at
 *  that origin, so the reflection's plane is the piece's own centre and does not move with the room.
 *  The caller seats the **wrapper** at the record's frame: position and yaw are the wrapper's, the
 *  mirror is applied to it first, and the body inside keeps an identity transform. */
export function wrapInRightCornerMirror(body: THREE.Group): THREE.Group {
  const wrapper = new THREE.Group();
  wrapper.name = RIGHT_CORNER_WRAPPER_NAME;
  wrapper.add(body);
  applyCornerDirection(wrapper, "right");
  return wrapper;
}

/** `cornerOf` reads a `DesignPlacement`, and the scene is handed `PlacementRecord`s derived from
 *  them. A record carries every fact the query reads — its id, wall, build id and, on wall A, its
 *  centre along the wall, which `frame.x` is in metres — so the placement is stood back up from it
 *  rather than threading the design through a seam that carries records only. */
function placementStandingFor(record: PlacementRecord): DesignPlacement {
  return {
    id: record.id,
    wall: record.wall,
    alongMm: toMillimetres(record.frame.x),
    y0Mm: toMillimetres(record.frame.y0),
    body: {
      buildId: record.buildId,
      widthMm: record.widthMm,
      heightMm: record.heightMm,
    },
  };
}

/** A structural corner is a fact of the body's own definition, at whatever cabinet depth the
 *  catalogue is built for, so the one built at the kit's own depth answers for every record. It is
 *  kept beside the kit it was built for, and dies with it. */
const CATALOGUES_BY_KIT = new WeakMap<Kit, BodyCatalog>();

function catalogueTheKitBuildsWith(kit: Kit): BodyCatalog {
  const known = CATALOGUES_BY_KIT.get(kit);
  if (known) return known;

  const built = buildKitchenLBodyCatalog(
    toMillimetres(kit.depths.cabinetDepthM),
  );
  CATALOGUES_BY_KIT.set(kit, built);
  return built;
}
