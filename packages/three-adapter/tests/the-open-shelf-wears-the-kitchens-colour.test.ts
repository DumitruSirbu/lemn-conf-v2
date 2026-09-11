// **The owner's ruling of 2026-09-09 for the open shelf** — the half of backlog entry 60 that could
// not ship with the declaration, because the renderer had no surface to paint.
//
// Two rulings, and each is a separate claim below:
//
// 1. **The six boards take the kitchen's colour; the tiled `back_panel` does not.** The picture is a
//    coloured shelf mounted on a wall, not a coloured niche.
// 2. **One rule, no wood special case.** The shelf takes whatever the kitchen has — a flat palette
//    colour or a wood decor alike — and falls back to the material's default when the kitchen has
//    none. The owner explicitly rejected *follow only when the colour is a decor, else stay oak*,
//    because it would make this the one body obeying a rule of its own.
//
// **Every assertion is on the rendered colour and never on a material uuid.** A uuid is only
// meaningful inside one process — two runs of `makeKit` mint different instances for identical
// scenes — and the "before/after" claims this file makes are about what a customer sees. Where an
// instance check *is* the sharper witness, it is made inside a single scene against `kit.M.oak` and
// `kit.M.tile`, the instances the builder assigned.
//
// **The third block is the one that matters most.** Widening `FRONT_MESH_NAME` would have been the
// obvious fix and would have silently changed two unrelated readers — `cabinet-handle-meshes.ts`,
// which decides a handle is a cabinet's when its parent holds a front, and
// `apps/web/src/scene/kitchen-stage.tsx`, which repaints a whole room through
// `collectFronts(stage.room)`. So *no mesh became a front* is asserted here rather than assumed,
// over the whole seeded kitchen and not only over the shelf.
import {
  derivePlacementRecords,
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  materialById,
  paletteFinish,
  type Design,
  type Finish,
} from "@lemnaria/configurator-domain";
import * as THREE from "three";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { collectFronts, collectPaintedSurfaces } from "../src/finishes.js";
import { makeKit, type Kit } from "../src/kitchen-parts.js";
import { syncSolidBodies } from "../src/scene-sync.js";
import { isMesh } from "../src/three-guards.js";
import {
  createHeadlessCanvas,
  installHeadlessDocument,
} from "./support/headless-canvas.js";

/** The open shelf, and an ordinary wall cabinet drawn in the same scene as the witness that the
 *  kitchen's colour reached anything at all. */
const SHELF_ID = "p12";
const FINISHABLE_ID = "p1";

/** The shelf's own division, in the owner's words. Written out rather than derived from the builder,
 *  because a test that asks the builder which meshes it marked would agree with whatever it marked. */
const BOARDS = [
  "side_left",
  "side_right",
  "shelf_top",
  "shelf_bottom",
  "shelf_1",
  "shelf_2",
] as const;
const NOT_A_BOARD = "back_panel";

/** Mesh names the shelf shares with other bodies, and the reason the declaration is the builder's
 *  rather than a pattern: a dishwasher niche, a sink base and an oven tower build these too. */
const SHARED_MESH_NAMES = /^(side_left|side_right|back_panel|shelf_mid)$/;

/** Drawn hexes, written out rather than read from `finishes.ts`: a constant taken from the table
 *  under test agrees with whatever that table says. */
const ANTRACIT = paletteFinish("pal.antracit");
const ANTRACIT_HEX = "#2b2d30";
const NUC_WARMIA = paletteFinish("pal.nuc-warmia");
const NUC_WARMIA_HEX = "#8a5c3b";
const VENEER_STEJAR_HEX = "#cba173";

let kit: Kit;
let solidsRoot: THREE.Group;

beforeAll(() => {
  installHeadlessDocument();
  kit = makeKit({ createCanvas: createHeadlessCanvas });
  kit.builders["kitchen-l"]();
});

beforeEach(() => {
  solidsRoot = new THREE.Group();
});

function drawn(materialTierId: string, finish?: Finish): void {
  const design: Design = {
    ...KITCHEN_L_DESIGN,
    settings: {
      ...KITCHEN_L_DESIGN.settings,
      materialTierId,
      ...(finish ? { finish } : {}),
    },
    placements: KITCHEN_L_DESIGN.placements.map((placement) => {
      const body = { ...placement.body };
      delete body.finish;
      return { ...placement, body };
    }),
  };
  syncSolidBodies({
    kit,
    solidsRoot,
    records: derivePlacementRecords(design, KITCHEN_L_BODY_CATALOG),
    room: design.room,
  });
}

function mounted(placementId: string): THREE.Object3D {
  const body = solidsRoot.children.find(
    (child) => child.userData["placementId"] === placementId,
  );
  if (!body) throw new Error(`No body mounted for placement "${placementId}"`);
  return body;
}

function meshNamed(root: THREE.Object3D, name: string): THREE.Mesh {
  let found: THREE.Mesh | undefined;
  root.traverse((node) => {
    if (isMesh(node) && node.name === name) found = node;
  });
  if (!found) throw new Error(`No mesh named "${name}"`);
  return found;
}

/** Every mesh name under a mounted body. A collected list rather than a flag set inside
 *  `traverse`: the closure's assignment is invisible to the type checker, so a `let found = false`
 *  reads as permanently `false` to it. */
function meshNamesUnder(root: THREE.Object3D): string[] {
  const names: string[] = [];
  root.traverse((node) => {
    if (isMesh(node)) names.push(node.name);
  });
  return names;
}

function hexOf(mesh: THREE.Mesh): string {
  return `#${(mesh.material as THREE.MeshStandardMaterial).color.getHexString()}`;
}

describe("backlog 60 — the shelf's six boards take the kitchen's colour", () => {
  /** The premise, so no assertion below is made about a mesh that stopped existing. Names, not a
   *  count: a renamed board must fail here rather than silently leaving one plank unpainted. */
  it("mounts the six boards and the back panel, by name", () => {
    drawn("material.melamine", ANTRACIT);

    expect(meshNamesUnder(mounted(SHELF_ID)).sort()).toEqual(
      [...BOARDS, NOT_A_BOARD].sort(),
    );
  });

  it.each(BOARDS)("paints %s the kitchen's colour", (board) => {
    drawn("material.melamine", ANTRACIT);

    const mesh = meshNamed(mounted(SHELF_ID), board);
    expect(hexOf(mesh), board).toBe(ANTRACIT_HEX);
    // Instance as well as hex, inside this one scene: a board that was never painted keeps the
    // shared `kit.M.oak` the builder assigned, whatever its hex happens to be.
    expect(mesh.material, board).not.toBe(kit.M.oak);
  });

  /** The owner's line — *a coloured shelf mounted on the wall, not a coloured niche*. */
  it("leaves the tiled back panel alone at the same kitchen colour", () => {
    drawn("material.melamine", ANTRACIT);

    const back = meshNamed(mounted(SHELF_ID), NOT_A_BOARD);
    expect(back.material).toBe(kit.M.tile);
    expect(hexOf(back)).not.toBe(ANTRACIT_HEX);
    // The premise: the boards beside it *did* move in this very scene, so this is the back panel
    // being excluded rather than a scene that painted nothing.
    expect(hexOf(meshNamed(mounted(SHELF_ID), "shelf_top"))).toBe(ANTRACIT_HEX);
  });
});

describe("backlog 60 — one rule for the shelf, with no wood special case", () => {
  /** A wood decor, which is the case the rejected alternative would have treated differently: under
   *  *follow only when the colour is a flat decor* these boards would have stayed oak. */
  it("takes a wood decor exactly as it takes a flat colour", () => {
    drawn("material.melamine", NUC_WARMIA);

    for (const board of BOARDS) {
      const mesh = meshNamed(mounted(SHELF_ID), board);
      expect(hexOf(mesh), board).toBe(NUC_WARMIA_HEX);
      expect(mesh.material, board).not.toBe(kit.M.oak);
    }
    expect(meshNamed(mounted(SHELF_ID), NOT_A_BOARD).material).toBe(kit.M.tile);
  });

  /** And with no kitchen colour it falls back to the material's declared default, like any other
   *  following body — on veneer, where that default is a tinted oak rather than the kit's white, so
   *  *followed the default* and *was never painted* are different values. */
  it("falls back to the material's declared default when the kitchen has none", () => {
    drawn("material.veneer");

    expect(materialById("material.veneer").defaultFinish).toBeDefined();
    for (const board of BOARDS) {
      expect(hexOf(meshNamed(mounted(SHELF_ID), board)), board).toBe(
        VENEER_STEJAR_HEX,
      );
    }
  });

  /** Two colours in a row, because a shelf that painted once and stopped tracking would pass every
   *  single-scene assertion above. */
  it("moves from one kitchen colour to the next", () => {
    drawn("material.melamine", ANTRACIT);
    expect(hexOf(meshNamed(mounted(SHELF_ID), "shelf_1"))).toBe(ANTRACIT_HEX);

    solidsRoot = new THREE.Group();
    drawn("material.melamine", NUC_WARMIA);
    expect(hexOf(meshNamed(mounted(SHELF_ID), "shelf_1"))).toBe(NUC_WARMIA_HEX);
  });
});

describe("backlog 60 — no mesh became a front, so the front's other two readers are unmoved", () => {
  /** **The claim the whole design rests on.** `isFrontMesh` is this package's single definition of a
   *  front; `cabinet-handle-meshes.ts` asks it to decide whether a handle belongs to a cabinet, and
   *  `kitchen-stage.tsx` repaints a whole room through `collectFronts(stage.room)`. Painting the
   *  shelf through a *second* collector rather than a wider pattern is what keeps both still, and
   *  this is where that is measured rather than asserted. */
  it("finds no front on the open shelf, though it finds six painted surfaces", () => {
    drawn("material.melamine", ANTRACIT);

    expect(collectFronts(mounted(SHELF_ID))).toHaveLength(0);
    expect(
      collectPaintedSurfaces(mounted(SHELF_ID))
        .map((mesh) => mesh.name)
        .sort(),
    ).toEqual([...BOARDS].sort());
  });

  /** Over the whole seeded kitchen, not only the shelf: the front census is exactly the set of
   *  `door_front` and `drawer_front` meshes and nothing this wave marked. Stated as a name multiset
   *  so a body that gained or lost a front fails here by name. */
  it("leaves the whole room's front census to door and drawer fronts alone", () => {
    drawn("material.melamine", ANTRACIT);

    const fronts = collectFronts(solidsRoot).map((mesh) => mesh.name);
    expect(fronts.length).toBeGreaterThan(0);
    for (const name of fronts) {
      expect(name, `"${name}" is collected as a front`).toMatch(
        /^(door_front|drawer_front)$/,
      );
    }
    // ...and every board this wave marked is absent from it.
    for (const board of BOARDS) expect(fronts).not.toContain(board);
  });

  /** **The census that ruled out a name pattern, asserted rather than filed in a comment.** Other
   *  bodies build a `side_left`, a `side_right` or a `back_panel` — a dishwasher niche, a sink base
   *  and an oven tower — and a `side_|shelf_` regex would have painted their carcass interiors. The
   *  set is discovered from the scene rather than listed, so a body that starts building one of
   *  those meshes is covered the day it does. */
  it("paints no carcass side or back panel on the other bodies that share those names", () => {
    drawn("material.melamine", ANTRACIT);

    const sharers = solidsRoot.children.filter(
      (body) =>
        body.userData["placementId"] !== SHELF_ID &&
        meshNamesUnder(body).some((name) => SHARED_MESH_NAMES.test(name)),
    );
    // The premise: this is a real set, so the sweep below is not vacuous.
    expect(sharers.length).toBeGreaterThan(0);

    for (const body of sharers) {
      const where = String(body.userData["placementId"]);
      for (const mesh of collectPaintedSurfaces(body)) {
        expect(mesh.name, `${where}: "${mesh.name}" was painted`).toMatch(
          /^(door_front|drawer_front)$/,
        );
      }
    }
  });
});

describe("backlog 60 — the shelf follows and still does not choose", () => {
  /** ADR 0099 decision 2, unchanged by this wave: the shelf renders the kitchen's colour and its
   *  document stays silent. Key presence, never a value — a shelf following the kitchen and a shelf
   *  that chose the same colour render alike and are different documents. */
  it("keeps the shelf's finish key absent while it renders the colour", () => {
    const design: Design = {
      ...KITCHEN_L_DESIGN,
      settings: {
        ...KITCHEN_L_DESIGN.settings,
        materialTierId: "material.melamine",
        finish: ANTRACIT,
      },
    };
    const shelf = design.placements.find(
      (placement) => placement.id === SHELF_ID,
    );
    expect(shelf).toBeDefined();
    expect("finish" in (shelf?.body ?? {})).toBe(false);

    const record = derivePlacementRecords(design, KITCHEN_L_BODY_CATALOG).find(
      (candidate) => candidate.id === SHELF_ID,
    );
    expect(record?.canFinish).toBe(false);
    expect(record?.drawnFinish).toEqual(ANTRACIT);
    expect(record).not.toHaveProperty("finishKey");
  });

  /** And an ordinary cabinet in the same scene took the same colour, so none of the above is a scene
   *  that happened to paint everything. */
  it("paints an ordinary cabinet the same colour in the same scene", () => {
    drawn("material.melamine", ANTRACIT);

    const fronts = collectFronts(mounted(FINISHABLE_ID));
    expect(fronts.length).toBeGreaterThan(0);
    for (const front of fronts) expect(hexOf(front)).toBe(ANTRACIT_HEX);
  });
});
