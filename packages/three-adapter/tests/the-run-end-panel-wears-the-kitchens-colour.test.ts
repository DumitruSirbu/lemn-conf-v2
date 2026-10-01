// **The owner's ruling of 2026-09-17** — *"end pannel should inherit the kitchen global color"*.
//
// Wave 7D8's visual verification photographed the defect: the panel closing the end of wall A's base
// run rendered in a wood/oak tone against a white *PAL melaminat / Alb* kitchen, because
// `kitchen-parts.ts` builds it with `M.oak` and nothing ever repainted it. It is shell rather than a
// placement, so no `PlacementRecord` carried a colour that could reach it.
//
// **The second half of this file is the half that matters.** `M.oak` is shared by every oak surface
// in the scene, and its `map` is the kit's one wood texture — `buildFinishMaterial` clones the
// material but three's `Material.copy` assigns that map **by reference**. So the obvious fix,
// recolouring `M.oak`, would repaint the open shelf's six boards along with the panel, and any fix
// that widened a name pattern would repaint surfaces nobody ruled on. Neither failure raises
// anything; both are only visible to somebody looking at the right pixel. So *nothing else moved* is
// measured here rather than assumed, with an oak witness that is on `kit.M.oak` at the moment the
// panel is painted.
import {
  derivePlacementRecords,
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  paletteFinish,
  type Design,
  type Finish,
  type PlacementRecord,
} from "@lemnaria/configurator-domain";
import * as THREE from "three";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { RUN_END_PANEL_NAME, makeKit, type Kit } from "../src/kitchen-parts.js";
import { buildKitchenShell } from "../src/kitchen-shell.js";
import { syncSolidBodies } from "../src/scene-sync.js";
import { isMesh } from "../src/three-guards.js";
import {
  createHeadlessCanvas,
  installHeadlessDocument,
} from "./support/headless-canvas.js";
import { required } from "./support/required.js";

/** Drawn hexes, written out rather than read from `finishes.ts`: a constant taken from the table
 *  under test agrees with whatever that table says. */
const ALB = paletteFinish("pal.alb");
const ALB_HEX = "#eceeeb";
const ANTRACIT = paletteFinish("pal.antracit");
const ANTRACIT_HEX = "#2b2d30";
const NUC_WARMIA = paletteFinish("pal.nuc-warmia");
const NUC_WARMIA_HEX = "#8a5c3b";

/** The open shelf, whose six boards are the scene's only other oak surfaces. It is the witness the
 *  "nothing else moved" block is built on, and it is on `kit.M.oak` exactly while the kitchen
 *  declares no colour — which is the state those tests paint the panel from. */
const SHELF_ID = "p12";
const SHELF_BOARDS = [
  "side_left",
  "side_right",
  "shelf_top",
  "shelf_bottom",
  "shelf_1",
  "shelf_2",
] as const;

/** A tier id this product declares nothing for. ADR 0078 decision 3: such a design **loads** and
 *  simply declares no default colour, so every placement's `drawnFinish` is absent and every body
 *  keeps the material its builder gave it — which is how an oak witness is obtained at all. */
const UNDECLARED_TIER_ID = "material.no-such-tier";

let kit: Kit;
let solidsRoot: THREE.Group;
let oakAtBuild: { hex: string; map: THREE.Texture | null };

beforeAll(() => {
  installHeadlessDocument();
  kit = makeKit({ createCanvas: createHeadlessCanvas });
  oakAtBuild = { hex: hexOfMaterial(kit.M.oak), map: kit.M.oak.map };
});

beforeEach(() => {
  solidsRoot = new THREE.Group();
  solidsRoot.name = "solids";
  solidsRoot.add(buildKitchenShell(kit, KITCHEN_L_DESIGN.room));
});

/** The seeded design at one material tier and one kitchen colour, with **every cabinet's own choice
 *  stripped**: this file is about the colour the kitchen gives, so a placement carrying a private
 *  finish would answer the question with something else. */
function designWearing(materialTierId: string, finish?: Finish): Design {
  return {
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
}

function recordsOf(design: Design): readonly PlacementRecord[] {
  return derivePlacementRecords(design, KITCHEN_L_BODY_CATALOG);
}

/** One sync of the mounted scene, with the kitchen's colour handed over separately from the records
 *  — which is what the production caller does, and what lets the block below move one without the
 *  other. */
function sync(
  records: readonly PlacementRecord[],
  kitchenFinish: Finish | undefined,
): void {
  syncSolidBodies({
    kit,
    solidsRoot,
    records,
    room: KITCHEN_L_DESIGN.room,
    kitchenFinish,
  });
}

/** The seeded kitchen drawn at one colour, records and panel alike — the ordinary path. */
function drawn(materialTierId: string, finish?: Finish): void {
  const design = designWearing(materialTierId, finish);
  sync(recordsOf(design), finish);
}

function panel(): THREE.Mesh {
  let found: THREE.Mesh | undefined;
  solidsRoot.traverse((node) => {
    if (isMesh(node) && node.name === RUN_END_PANEL_NAME) found = node;
  });
  return required(found, "the run-end panel");
}

function mounted(placementId: string): THREE.Object3D {
  return required(
    solidsRoot.children.find(
      (child) => child.userData["placementId"] === placementId,
    ),
    `the body mounted for placement "${placementId}"`,
  );
}

function meshNamed(root: THREE.Object3D, name: string): THREE.Mesh {
  let found: THREE.Mesh | undefined;
  root.traverse((node) => {
    if (isMesh(node) && node.name === name) found = node;
  });
  return required(found, `a mesh named "${name}"`);
}

function materialOf(mesh: THREE.Mesh): THREE.MeshStandardMaterial {
  return mesh.material as THREE.MeshStandardMaterial;
}

function hexOfMaterial(material: THREE.MeshStandardMaterial): string {
  return `#${material.color.getHexString()}`;
}

function hexOf(mesh: THREE.Mesh): string {
  return hexOfMaterial(materialOf(mesh));
}

/** Every mesh in the mounted scene paired with the material instance it is currently rendering
 *  from. The pairs are the meshes themselves rather than names, so two meshes sharing a name cannot
 *  collapse into one row. */
function materialsInTheScene(): Map<THREE.Mesh, THREE.Material> {
  const assigned = new Map<THREE.Mesh, THREE.Material>();
  solidsRoot.traverse((node) => {
    if (isMesh(node)) assigned.set(node, node.material as THREE.Material);
  });
  return assigned;
}

describe("the run-end panel takes the kitchen's colour", () => {
  it("paints it the kitchen's flat colour instead of the oak its builder gave it", () => {
    drawn("material.melamine", ALB);

    expect(hexOf(panel())).toBe(ALB_HEX);
    // Instance as well as hex: a panel that was never painted keeps the shared `kit.M.oak` the
    // builder assigned, whatever hex that happens to carry.
    expect(materialOf(panel())).not.toBe(kit.M.oak);
    expect(materialOf(panel()).map).toBeNull();
  });

  /** One rule and no wood special case, as the open shelf has none: the panel takes whatever the
   *  kitchen has. A wood decor tints the grain rather than replacing it, so the panel still reads as
   *  timber — and the map it samples is the kit's own, never a second texture. */
  it("keeps the wood grain when the kitchen's colour is a wood", () => {
    drawn("material.melamine", NUC_WARMIA);

    expect(hexOf(panel())).toBe(NUC_WARMIA_HEX);
    expect(materialOf(panel()).map).toBe(kit.M.oak.map);
    expect(materialOf(panel())).not.toBe(kit.M.oak);
  });

  /** Two colours in a row, because a panel that painted once and stopped tracking would pass every
   *  single-scene assertion above. */
  it("moves from one kitchen colour to the next", () => {
    drawn("material.melamine", ANTRACIT);
    expect(hexOf(panel())).toBe(ANTRACIT_HEX);

    drawn("material.melamine", ALB);
    expect(hexOf(panel())).toBe(ALB_HEX);
  });

  /** ADR 0078 decision 3's state, reaching the one surface that is never rebuilt. Every body is
   *  re-mounted from its builder on a change, so an unpainted body is unpainted by construction; the
   *  panel is shell and survives every sync, so *both* branches of the derivation have to write or a
   *  stale colour would stay on it for the life of the stage. */
  it("stands on the kit's own oak when the kitchen declares no colour", () => {
    drawn("material.melamine", ANTRACIT);
    expect(materialOf(panel())).not.toBe(kit.M.oak);

    drawn(UNDECLARED_TIER_ID);

    expect(materialOf(panel())).toBe(kit.M.oak);
  });

  /** The premise for the block below: the shelf really is on the kit's shared oak in this state, so
   *  the witness it uses is a witness. */
  it("leaves the open shelf's boards on that same shared oak", () => {
    drawn(UNDECLARED_TIER_ID);

    for (const board of SHELF_BOARDS) {
      expect(materialOf(meshNamed(mounted(SHELF_ID), board)), board).toBe(
        kit.M.oak,
      );
    }
  });
});

describe("and no other oak surface moves with it", () => {
  /** **The failure the whole design exists to avoid.** Recolouring `M.oak` in place would paint the
   *  panel and would be invisible in every assertion in the first block — and would take the open
   *  shelf's six boards, and every oak surface a later body builds, with it. Disposing or replacing
   *  its `map` would black them out instead. Both are checked against what the material carried the
   *  moment `makeKit` built it, over all three kinds of kitchen colour. */
  it("never mutates the kit's shared oak material or its grain", () => {
    for (const finish of [ALB, ANTRACIT, NUC_WARMIA]) {
      drawn("material.melamine", finish);

      expect(hexOfMaterial(kit.M.oak)).toBe(oakAtBuild.hex);
      expect(kit.M.oak.map).toBe(oakAtBuild.map);
    }
  });

  /**
   * **The isolation the production path cannot show.** A real kitchen-colour change re-derives every
   * record's `drawnFinish`, so every following body is torn down and re-mounted wearing the new
   * colour and the scene is expected to move all over. Here the *records are held fixed* and only
   * the kitchen's colour argument moves, which is the one experiment that can say what painting the
   * panel reaches on its own.
   *
   * The oak witness is live: the scene starts in the state above, where the shelf's boards are on
   * `kit.M.oak`, so a fix that widened a name pattern to `end_panel|...` or that painted the shell's
   * children wholesale fails here by identity rather than by hex.
   */
  it("moves nothing but the panel when only the kitchen's colour moves", () => {
    const held = recordsOf(designWearing(UNDECLARED_TIER_ID));
    sync(held, undefined);
    const before = materialsInTheScene();
    // The premise: this scene has meshes in it and the panel is one of them.
    expect(before.size).toBeGreaterThan(1);
    expect(before.has(panel())).toBe(true);

    sync(held, ANTRACIT);

    expect(hexOf(panel())).toBe(ANTRACIT_HEX);
    const after = materialsInTheScene();
    expect([...after.keys()]).toHaveLength(before.size);
    for (const [mesh, material] of after) {
      if (mesh === panel()) continue;
      expect(material, `${mesh.name} was repainted`).toBe(before.get(mesh));
    }
  });

  /** And the shelf by name, so the sweep above cannot pass by having quietly stopped covering it. */
  it("leaves the open shelf's boards on the kit's oak while the panel is painted", () => {
    const held = recordsOf(designWearing(UNDECLARED_TIER_ID));
    sync(held, ALB);

    expect(hexOf(panel())).toBe(ALB_HEX);
    for (const board of SHELF_BOARDS) {
      expect(materialOf(meshNamed(mounted(SHELF_ID), board)), board).toBe(
        kit.M.oak,
      );
    }
  });
});
