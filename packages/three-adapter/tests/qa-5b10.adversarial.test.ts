// Adversarial QA for M5B wave 5B10 — the dishwasher niche wears a decor door (ADR 0051).
//
// The implementer's own suite declares the structural change to M1's parity ledger and then diffs
// through that ledger. This file re-derives the same facts **without** the ledger: it writes out
// what the port's mesh sequence must be, in traversal order, transformed from the reference's by
// hand, and it measures every geometric claim off world bounding boxes rather than off the
// arguments a builder was handed. Where the implementer's suite compares a multiset, this one
// compares an ordered sequence; where the implementer's suite measures at one cabinet depth, this
// one sweeps the depths the formula can produce.
import {
  KITCHEN_L_BODY_CATALOG,
  type BodyDefinition,
} from "@lemnaria/configurator-domain";
import { makeKit as makeReferenceKit } from "@reference/kitchen-parts";
import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";

import { buildCatalogBody } from "../src/catalog-bodies.js";
import { buildDecomposedBody } from "../src/decomposed-bodies.js";
import {
  applyBodyFinish,
  collectFronts,
  FINISH_COLORS,
  type SolidFinishKey,
} from "../src/finishes.js";
import { makeKit, type Kit } from "../src/kitchen-parts.js";
import { createBodyProbe } from "../src/measure-built-body.js";
import { isMesh } from "../src/three-guards.js";
import {
  createHeadlessCanvas,
  installHeadlessDocument,
} from "./support/headless-canvas.js";
import { required } from "./support/required.js";
import { findMeshes, meshNames, worldBox } from "./support/structure.js";

/** `finishes.ts`'s own pattern, retyped: a test that reads its definition of a front out of the
 *  code it checks proves only that the code equals itself. ADR 0051 decision 2 makes this name the
 *  load-bearing thing, so it is the one string this file must not import. */
const FRONT_MESH_NAME = /door_front|drawer_front/;
const HANDLE_GROUP_NAME = "handle";
const HANDLE_BAR_MESH_NAME = "handle_bar";

/** ADR 0051's two declared sizes for the niche, and ADR 0018's seat for both. */
const NICHE_WIDTHS_M = [0.45, 0.6];
const NICHE_SEAT_MM = 580;
/** ADR 0051 decision 6: the niche becomes an ordinary base body at the worktop's own depth. */
const NICHE_OCCUPIED_MM = 620;

/** The cabinet depths `cabinet-depth-source.test.ts` exercises the base-carcass formula at. The
 *  decor door is anchored on `CARC_D`, so its flushness is a claim about the formula and not about
 *  600 mm. */
const CABINET_DEPTH_SWEEP_MM = [600, 700, 800];

const SOLID_FINISH_KEYS: readonly SolidFinishKey[] = [
  "white",
  "clay",
  "sage",
  "graphite",
];

let kit: Kit;
let referenceKit: ReturnType<typeof makeReferenceKit>;
let room: THREE.Object3D;

beforeAll(() => {
  installHeadlessDocument();
  kit = makeKit({ createCanvas: createHeadlessCanvas });
  referenceKit = makeReferenceKit(THREE);
  room = kit.builders["kitchen-l"]();
});

// ---------------------------------------------------------------------------------------------
// The re-baseline, re-derived without the ledger.
// ---------------------------------------------------------------------------------------------

/** The port's mesh sequence for a tree holding one `dishwasherHousing`, written out from the
 *  reference's by hand: the appliance loses its fascia, its strip and its bar, and a decor door
 *  with its own bar arrives **after** the appliance group closes.
 *
 *  Order is kept here because the mesh-name test in the parity suite compares a sorted multiset for
 *  the five re-baselined keys. That is safe — the hierarchy comparison in the same suite still
 *  asserts child order node by node, verified by mutation — but it is asserted a second way here,
 *  and this is the one place the door's build position (after the appliance, before the worktop) is
 *  pinned in a single expression. */
const APPLIANCE_TAIL_MESHES = [
  "dw_panel",
  "dw_control_strip",
  "handle_bar",
  "handle_stem",
  "handle_stem",
];
const DECOR_DOOR_MESHES = [
  "door_front",
  "handle_bar",
  "handle_stem",
  "handle_stem",
];

function expectedNicheSequence(referenceNames: readonly string[]): string[] {
  const at = referenceNames.indexOf("dw_body");
  expect(at, "the reference tree has no dw_body").toBeGreaterThanOrEqual(0);
  expect(
    referenceNames.lastIndexOf("dw_body"),
    "more than one dishwasher in this tree",
  ).toBe(at);
  expect(
    referenceNames.slice(at + 1, at + 1 + APPLIANCE_TAIL_MESHES.length),
    "the reference appliance is not the machine ADR 0051 describes",
  ).toEqual(APPLIANCE_TAIL_MESHES);

  return [
    ...referenceNames.slice(0, at + 1),
    ...DECOR_DOOR_MESHES,
    ...referenceNames.slice(at + 1 + APPLIANCE_TAIL_MESHES.length),
  ];
}

const NICHE_BUILDER_KEYS = ["base-dishwasher", "base-dishwasher-450"] as const;

describe("5B10: the declared structural change is exactly what the port builds", () => {
  it.each(NICHE_BUILDER_KEYS)(
    "%s: one decor door in, the appliance's fascia, strip and bar out — in that order",
    (key) => {
      const referenceNames = meshNames(
        required(referenceKit.builders[key], key)(),
      );

      expect(meshNames(kit.builders[key]())).toEqual(
        expectedNicheSequence(referenceNames),
      );
    },
  );

  it.each(NICHE_WIDTHS_M)(
    "dishwasherHousing(%s) makes the same trade, in the same order",
    (widthM) => {
      const referenceNames = meshNames(
        referenceKit.make.dishwasherHousing(widthM),
      );

      expect(meshNames(kit.make.dishwasherHousing(widthM))).toEqual(
        expectedNicheSequence(referenceNames),
      );
    },
  );

  // The confinement claim ADR 0051's Consequences make, tested from outside the ledger that makes
  // it: the seeded kitchen holds exactly one niche, and the trade happens there and nowhere else.
  it("moves the seeded kitchen in one place and leaves the rest of it alone", () => {
    const referenceNames = meshNames(
      required(referenceKit.builders["kitchen-l"], "kitchen-l")(),
    );

    expect(meshNames(kit.builders["kitchen-l"]())).toEqual(
      expectedNicheSequence(referenceNames),
    );
  });

  // The other half of confinement. A structural-change form that quietly licensed movement
  // elsewhere would show up here, because nothing in this test consults a declaration.
  it("leaves every builder that is not the niche mesh-for-mesh identical to the reference", () => {
    const untouched = Object.keys(referenceKit.builders).filter(
      (key) =>
        key !== "base-dishwasher" &&
        key !== "base-dishwasher-450" &&
        key !== "kitchen-l",
    );
    expect(untouched.length).toBeGreaterThan(20);

    for (const key of untouched) {
      const ported = kit.builders[key as keyof typeof kit.builders];
      expect(meshNames(ported()), key).toEqual(
        meshNames(required(referenceKit.builders[key], key)()),
      );
    }
  });

  // ADR 0051 decision 3's promise about the *other* factory. The parts gallery still draws the
  // 596 × 720 × 560 machine `SPEC.md` describes, with everything the niche took away.
  it("leaves the standalone appliance whole", () => {
    const standalone = kit.builders.dishwasher();

    expect(meshNames(standalone)).toEqual([
      "dw_body",
      ...APPLIANCE_TAIL_MESHES,
    ]);
    // `SPEC.md`'s 596 × 720 × 560 is the machine, and its bar stands proud of it — so the box is
    // compared to the reference's own, which is the claim ADR 0051 decision 3 actually makes.
    const box = worldBox(standalone, standalone);
    const referenceBox = (() => {
      const group = required(
        referenceKit.builders["dishwasher"],
        "reference dishwasher",
      )();
      return worldBox(group, group);
    })();
    expect(Math.round((box.max.x - box.min.x) * 1000)).toBe(596);
    expect(Math.round((box.max.y - box.min.y) * 1000)).toBe(720);
    expect(box.min.toArray()).toEqual(referenceBox.min.toArray());
    expect(box.max.toArray()).toEqual(referenceBox.max.toArray());
  });

  it("builds the same tree twice", () => {
    expect(meshNames(kit.make.dishwasherHousing(0.6))).toEqual(
      meshNames(kit.make.dishwasherHousing(0.6)),
    );
  });
});

// ---------------------------------------------------------------------------------------------
// The geometry the re-baseline is there to license.
// ---------------------------------------------------------------------------------------------

function nicheAndCabinetAt(cabinetDepthMm: number, widthM: number) {
  const depthKit = makeKit({
    createCanvas: createHeadlessCanvas,
    cabinetDepthMm,
  });
  return {
    niche: depthKit.make.dishwasherHousing(widthM),
    cabinet: depthKit.make.baseCabinet(widthM, { doors: 1 }),
  };
}

function doorOf(group: THREE.Group): THREE.Mesh {
  const fronts = findMeshes(group, "door_front");
  expect(fronts.length, `${group.name}: fronts`).toBe(1);
  return required(fronts[0], "door_front");
}

// ---------------------------------------------------------------------------------------------
// The added subtree, which the parity gate cannot cover.
// ---------------------------------------------------------------------------------------------
//
// M1's gate diffs the port against the reference, and the reference has no decor door — so the
// four meshes this wave adds are the one part of the body with **no** parity coverage at all, by
// construction and not by an oversight. Everything asserted about them has to be asserted here or
// nowhere. These are the properties the wave decided and nothing else pins.

/** The `door` group `doorSlab` returns, found by structure rather than by index. */
function doorGroupOf(group: THREE.Group): THREE.Object3D {
  const doors = group.children.filter(
    (child) =>
      !isMesh(child) &&
      child.children.some(
        (grandchild) =>
          isMesh(grandchild) && FRONT_MESH_NAME.test(grandchild.name),
      ),
  );
  expect(doors.length, `${group.name}: door groups`).toBe(1);
  return required(doors[0], "door group");
}

/** Where a slab's bar hangs, expressed only in terms of the slab it hangs on: which way the bar
 *  runs, whether it is centred across the slab, and how far its axis sits below the slab's top
 *  face. Every number is a difference of two measured boxes, so it is comparable between two
 *  fronts of different sizes — which is what makes "the same edge `base-3drawer` uses" an
 *  assertion rather than a retyped 0.04. */
function handleAnchorOf(root: THREE.Object3D, door: THREE.Object3D) {
  const front = required(
    door.children.find((child) => isMesh(child) && child.name === "door_front"),
    "door_front",
  );
  const bars = findMeshes(door, HANDLE_BAR_MESH_NAME);
  expect(bars.length, "bars on this front").toBe(1);

  const frontBox = worldBox(root, front);
  const barBox = worldBox(root, required(bars[0], "handle_bar"));
  const barCentre = barBox.getCenter(new THREE.Vector3());
  const frontCentre = frontBox.getCenter(new THREE.Vector3());
  return {
    runsHorizontally: barBox.max.x - barBox.min.x > barBox.max.y - barBox.min.y,
    offCentreX: barCentre.x - frontCentre.x,
    belowTopFace: frontBox.max.y - barCentre.y,
    aboveMidHeight: barCentre.y > frontCentre.y,
  };
}

describe("5B10: the decor door subtree, which the parity gate cannot see", () => {
  it.each(NICHE_WIDTHS_M)(
    "holds one front and one handle at %s m, and nothing else",
    (widthM) => {
      const niche = kit.make.dishwasherHousing(widthM);
      const door = doorGroupOf(niche);

      expect(meshNames(door)).toEqual(DECOR_DOOR_MESHES);
      const handles = door.children.filter(
        (child) => !isMesh(child) && child.name === HANDLE_GROUP_NAME,
      );
      expect(handles.length, "handle groups on the door").toBe(1);
      door.traverse((node) => {
        expect(node.visible, node.name).toBe(true);
      });
    },
  );

  // A door built in the carcass material would pass every other assertion in this wave — it has a
  // front mesh, it is flush, and a finish would overwrite the material anyway. What it would not do
  // is look like a door before the customer picks a finish.
  it.each(NICHE_WIDTHS_M)(
    "builds the slab in the same material baseCabinet's door uses at %s m",
    (widthM) => {
      const { niche, cabinet } = nicheAndCabinetAt(600, widthM);

      expect(doorOf(niche).material).toBe(doorOf(cabinet).material);
      expect(doorOf(niche).material).not.toBe(
        required(findMeshes(niche, "side_left")[0], "side_left").material,
      );
    },
  );

  it.each(NICHE_WIDTHS_M)(
    "centres the door on the carcass at %s m",
    (widthM) => {
      const niche = kit.make.dishwasherHousing(widthM);
      const sides = ["side_left", "side_right"].flatMap((name) =>
        findMeshes(niche, name),
      );
      const carcass = sides.reduce(
        (box, side) => box.union(worldBox(niche, side)),
        new THREE.Box3(),
      );

      const door = worldBox(niche, doorOf(niche));
      expect(door.getCenter(new THREE.Vector3()).x).toBeCloseTo(
        carcass.getCenter(new THREE.Vector3()).x,
        9,
      );
    },
  );

  // ADR 0051 decision 5 chose the **top** edge on purpose — "the edge a hand pulls a dishwasher
  // door from, and the same horizontal bar a drawer front carries". Pinned by comparing the anchor
  // to a front that is known to be `doorSlab(..., "top")` and to one that is not, so neither the
  // 40 mm nor the word "top" is retyped here.
  it.each(NICHE_WIDTHS_M)("hangs the bar on the top edge at %s m", (widthM) => {
    const niche = kit.make.dishwasherHousing(widthM);
    const anchor = handleAnchorOf(niche, doorGroupOf(niche));

    expect(anchor.runsHorizontally, "a top bar is horizontal").toBe(true);
    expect(anchor.offCentreX).toBeCloseTo(0, 9);
    expect(anchor.aboveMidHeight, "a top bar is in the upper half").toBe(true);

    const drawers = kit.builders["base-3drawer"]();
    const drawerDoor = required(
      drawers.children
        .flatMap((child) => (isMesh(child) ? [] : child.children))
        .find(
          (child) =>
            !isMesh(child) &&
            child.children.some(
              (grandchild) =>
                isMesh(grandchild) && grandchild.name === "door_front",
            ),
        ) ??
        drawers.children.find(
          (child) =>
            !isMesh(child) &&
            child.children.some(
              (grandchild) =>
                isMesh(grandchild) && grandchild.name === "door_front",
            ),
        ),
      "a drawer front",
    );
    const drawerAnchor = handleAnchorOf(drawers, drawerDoor);
    expect(
      drawerAnchor.runsHorizontally,
      "the control is a top-edge front",
    ).toBe(true);
    // M1's own 1e-6 m float-artefact allowance: both boxes come off Float32 vertex data.
    expect(anchor.belowTopFace).toBeCloseTo(drawerAnchor.belowTopFace, 6);

    // And the control in the other direction: a side-hung door anchors differently, so the
    // comparison above is not satisfied by every front in the kit.
    const sideHung = kit.builders["base-1door"]();
    expect(
      handleAnchorOf(sideHung, doorGroupOf(sideHung)).runsHorizontally,
    ).toBe(false);
  });
});

describe("5B10: the decor door is flush by construction, not by a typed number", () => {
  const cases = CABINET_DEPTH_SWEEP_MM.flatMap((cabinetDepthMm) =>
    NICHE_WIDTHS_M.map((widthM) => ({ cabinetDepthMm, widthM })),
  );

  it.each(cases)(
    "at $cabinetDepthMm mm cabinet depth and $widthM m wide, the niche door lands on baseCabinet's plane",
    ({ cabinetDepthMm, widthM }) => {
      const { niche, cabinet } = nicheAndCabinetAt(cabinetDepthMm, widthM);

      const nicheDoor = worldBox(niche, doorOf(niche));
      const cabinetDoor = worldBox(cabinet, doorOf(cabinet));
      expect(nicheDoor.max.z, "outer face").toBeCloseTo(cabinetDoor.max.z, 6);
      expect(nicheDoor.min.z, "inner face").toBeCloseTo(cabinetDoor.min.z, 6);
      expect(nicheDoor.max.y, "top").toBeCloseTo(cabinetDoor.max.y, 6);
      expect(nicheDoor.min.y, "bottom").toBeCloseTo(cabinetDoor.min.y, 6);
      expect(nicheDoor.max.x - nicheDoor.min.x, "width").toBeCloseTo(
        cabinetDoor.max.x - cabinetDoor.min.x,
        6,
      );
    },
  );

  // A door built off a literal 0.298 would pass the case above at 600 mm and fail here.
  it("moves the door when the cabinet-depth setting moves", () => {
    const shallow = worldBox(
      ...(() => {
        const g = nicheAndCabinetAt(600, 0.6).niche;
        return [g, doorOf(g)] as const;
      })(),
    );
    const deep = worldBox(
      ...(() => {
        const g = nicheAndCabinetAt(700, 0.6).niche;
        return [g, doorOf(g)] as const;
      })(),
    );

    // `CARC_D` is `cabinetDepth − 40`, and the door hangs at `CARC_D / 2`: 100 mm of setting is
    // 50 mm of door.
    expect(deep.max.z - shallow.max.z).toBeCloseTo(0.05, 6);
  });
});

describe("5B10: the appliance stays behind the door it hides", () => {
  const cases = CABINET_DEPTH_SWEEP_MM.flatMap((cabinetDepthMm) =>
    NICHE_WIDTHS_M.map((widthM) => ({ cabinetDepthMm, widthM })),
  );

  it.each(cases)(
    "at $cabinetDepthMm mm and $widthM m, no appliance mesh reaches the door's inner face",
    ({ cabinetDepthMm, widthM }) => {
      const { niche } = nicheAndCabinetAt(cabinetDepthMm, widthM);
      const doorInnerFaceZ = worldBox(niche, doorOf(niche)).min.z;
      const appliance = required(
        niche.children.find((child) => child.name === "dishwasher"),
        "the appliance group",
      );

      let measured = 0;
      appliance.traverse((node) => {
        if (!isMesh(node)) return;
        measured += 1;
        expect(worldBox(niche, node).max.z, node.name).toBeLessThan(
          doorInnerFaceZ,
        );
      });
      expect(measured, "the appliance drew nothing").toBeGreaterThan(0);
    },
  );

  it("leaves the 40 mm of mounting space ADR 0051 names, at the shipped depth", () => {
    const { niche } = nicheAndCabinetAt(600, 0.6);
    const doorInnerFaceZ = worldBox(niche, doorOf(niche)).min.z;
    const applianceFrontZ = worldBox(
      niche,
      required(
        niche.children.find((child) => child.name === "dishwasher"),
        "the appliance group",
      ),
    ).max.z;

    expect(Math.round((doorInnerFaceZ - applianceFrontZ) * 1000)).toBe(40);
  });

  // The mounting space is not a constant: the door follows `CARC_D` and `dw_body` does not, so the
  // gap closes as the cabinet-depth setting shrinks. Measured at three depths and extrapolated to
  // the depth at which it reaches zero, so M6's *Setări globale* control arrives with the floor
  // already written down rather than discovering it as a body poking through its own door. Nothing
  // below 600 mm is reachable today (`cabinet-depth-source.test.ts`), which is why this records the
  // number instead of failing on it.
  it("closes the mounting space at 520 mm of cabinet depth, and not before", () => {
    const clearanceAt = (cabinetDepthMm: number) => {
      const { niche } = nicheAndCabinetAt(cabinetDepthMm, 0.6);
      const appliance = required(
        niche.children.find((child) => child.name === "dishwasher"),
        "the appliance group",
      );
      return (
        worldBox(niche, doorOf(niche)).min.z - worldBox(niche, appliance).max.z
      );
    };

    const atSixHundred = clearanceAt(600);
    const perMillimetre = (clearanceAt(800) - atSixHundred) / 200;
    expect(perMillimetre).toBeCloseTo(0.0005, 9);
    expect(
      Math.round(600 - atSixHundred / perMillimetre),
      "the cabinet depth at which the appliance reaches its own decor door",
    ).toBe(520);
  });

  // The z-fight ADR 0051's third rejected alternative is about, asserted rather than reasoned:
  // nothing else in the body shares the door's front plane over the door's own footprint.
  it.each(NICHE_WIDTHS_M)(
    "puts no second slab on the door's plane at %s m",
    (widthM) => {
      const niche = kit.make.dishwasherHousing(widthM);
      const door = doorOf(niche);
      const doorBox = worldBox(niche, door);

      niche.traverse((node) => {
        if (!isMesh(node) || node === door) return;
        const box = worldBox(niche, node);
        const overlapsX =
          box.min.x < doorBox.max.x - 1e-6 && box.max.x > doorBox.min.x + 1e-6;
        const overlapsY =
          box.min.y < doorBox.max.y - 1e-6 && box.max.y > doorBox.min.y + 1e-6;
        if (!overlapsX || !overlapsY) return;
        expect(
          Math.abs(box.max.z - doorBox.max.z),
          `${node.name} is coplanar with the decor door`,
        ).toBeGreaterThan(1e-4);
      });
    },
  );

  it.each(NICHE_WIDTHS_M)(
    "keeps the door inside the carcass sides at %s m",
    (widthM) => {
      const niche = kit.make.dishwasherHousing(widthM);
      const doorBox = worldBox(niche, doorOf(niche));
      const sides = ["side_left", "side_right"].flatMap((name) =>
        findMeshes(niche, name),
      );
      expect(sides.length).toBe(2);
      const carcass = sides.reduce(
        (box, side) => box.union(worldBox(niche, side)),
        new THREE.Box3(),
      );

      expect(doorBox.min.x).toBeGreaterThanOrEqual(carcass.min.x - 1e-9);
      expect(doorBox.max.x).toBeLessThanOrEqual(carcass.max.x + 1e-9);
      expect(doorBox.min.y, "the door clears the plinth").toBeGreaterThan(0);
    },
  );
});

// ---------------------------------------------------------------------------------------------
// The customer-facing halves: the finish lands, and the bar is the cabinet's.
// ---------------------------------------------------------------------------------------------

describe("5B10: the finish the five chips promised", () => {
  it.each(NICHE_WIDTHS_M)("finds exactly one front at %s m", (widthM) => {
    const niche = kit.make.dishwasherHousing(widthM);

    const fronts = collectFronts(niche);
    expect(fronts.map((front) => front.name)).toEqual(["door_front"]);
    // Re-derived from the retyped pattern, so a widened `FRONT_MESH_NAME` cannot make this pass.
    const byPattern: string[] = [];
    niche.traverse((node) => {
      if (isMesh(node) && FRONT_MESH_NAME.test(node.name)) {
        byPattern.push(node.name);
      }
    });
    expect(byPattern).toEqual(["door_front"]);
  });

  const cases = SOLID_FINISH_KEYS.flatMap((key) =>
    NICHE_WIDTHS_M.map((widthM) => ({ key, widthM })),
  );

  it.each(cases)(
    "$key at $widthM m recolours the door and touches nothing else, here or on a neighbour",
    ({ key, widthM }) => {
      const niche = kit.make.dishwasherHousing(widthM);
      const neighbour = kit.make.baseCabinet(widthM, { doors: 1 });
      const door = doorOf(niche);
      const before = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
      const beforeColours = new Map<THREE.Mesh, number>();
      for (const root of [niche, neighbour]) {
        root.traverse((node) => {
          if (!isMesh(node) || node === door) return;
          before.set(node, node.material);
          if (!Array.isArray(node.material) && "color" in node.material) {
            beforeColours.set(
              node,
              (node.material as THREE.MeshStandardMaterial).color.getHex(),
            );
          }
        });
      }

      applyBodyFinish(niche, kit.M, key);

      const material = door.material;
      expect(Array.isArray(material)).toBe(false);
      expect(
        `#${(material as THREE.MeshStandardMaterial).color.getHexString()}`,
      ).toBe(FINISH_COLORS[key]);
      for (const [mesh, was] of before) {
        expect(mesh.material, `${mesh.name}: material identity`).toBe(was);
      }
      // Identity alone would miss a finish that mutated a shared material in place, which would
      // recolour every body in the kit at once.
      for (const [mesh, hex] of beforeColours) {
        expect(
          (mesh.material as THREE.MeshStandardMaterial).color.getHex(),
          `${mesh.name}: colour`,
        ).toBe(hex);
      }
    },
  );
});

/** ADR 0027's rule, retyped: a handle is the cabinet's exactly when the group it hangs from also
 *  holds a front. This file re-derives it rather than importing the gate's copy, so a widened
 *  classifier in the gate cannot make the census below agree with itself. */
function censusOf(body: THREE.Object3D): {
  fronts: number;
  cabinetHandles: number;
  handleBars: number;
} {
  let fronts = 0;
  let cabinetHandles = 0;
  let handleBars = 0;
  body.traverse((node) => {
    if (isMesh(node)) {
      if (FRONT_MESH_NAME.test(node.name)) fronts += 1;
      if (node.name === HANDLE_BAR_MESH_NAME) handleBars += 1;
      return;
    }
    if (node.name !== HANDLE_GROUP_NAME) return;
    const owner = node.parent;
    if (!owner) return;
    if (
      owner.children.some(
        (sibling) => isMesh(sibling) && FRONT_MESH_NAME.test(sibling.name),
      )
    ) {
      cabinetHandles += 1;
    }
  });
  return { fronts, cabinetHandles, handleBars };
}

function definitionOf(buildId: string): BodyDefinition {
  const definition = KITCHEN_L_BODY_CATALOG.get(buildId);
  if (!definition) throw new Error(`No catalogue entry for "${buildId}"`);
  return definition;
}

function bodyOf(buildId: string): THREE.Group {
  const definition = definitionOf(buildId);
  if (definition.insertable !== true) return buildDecomposedBody(kit, buildId);
  return buildCatalogBody(kit, buildId, {
    widthM: (definition.sizesMm?.[0] ?? 0) / 1000,
    heightM: (definition.nominalHeightMm ?? 0) / 1000,
    depthM: (definition.nominalDepthMm ?? 0) / 1000,
  });
}

describe("5B10: the handle in the niche is the cabinet's, and the rule did not move", () => {
  it.each(["base-dishwasher", "base-dishwasher-600"])(
    "%s carries one front, one cabinet handle and one bar in the whole group",
    (buildId) => {
      const definition = definitionOf(buildId);

      expect(censusOf(bodyOf(buildId))).toEqual({
        fronts: 1,
        cabinetHandles: 1,
        handleBars: 1,
      });
      expect(definition.canFinish).toBe(true);
      expect(definition.canHandle).toBe(true);
    },
  );

  // ADR 0051 criterion 7's anti-invariant, recomputed here from the retyped rule. If the wave had
  // widened `opensAFront` to make its own body pass, these two numbers would have moved with it.
  it("still refuses to call an appliance's bar the cabinet's", () => {
    expect(censusOf(bodyOf("base-hob-oven"))).toMatchObject({
      fronts: 1,
      cabinetHandles: 0,
      handleBars: 1,
    });
    expect(censusOf(bodyOf("tall-oven-tower"))).toMatchObject({
      cabinetHandles: 2,
      handleBars: 4,
    });
  });
});

describe("5B10: the depth follows the geometry and the seat does not", () => {
  it.each(NICHE_WIDTHS_M)(
    "records a %s m niche at the 580 mm seat it always had",
    (widthM) => {
      const definition = definitionOf("base-dishwasher");

      const measurement = createBodyProbe(kit, room).measure({
        buildId: "base-dishwasher",
        widthM,
        heightM: (definition.nominalHeightMm ?? 0) / 1000,
        depthM: (definition.nominalDepthMm ?? 0) / 1000,
      });

      expect(Math.round(measurement.seatOffsetM * 2 * 1000)).toBe(
        NICHE_SEAT_MM,
      );
    },
  );

  it.each(NICHE_WIDTHS_M)(
    "fills %s m of column to the worktop line and no further",
    (widthM) => {
      const niche = kit.make.dishwasherHousing(widthM);
      const seatM = NICHE_SEAT_MM / 1000;

      const frontM = worldBox(niche, niche).max.z;
      expect(Math.round((seatM / 2 + frontM) * 1000)).toBe(NICHE_OCCUPIED_MM);
      expect(definitionOf("base-dishwasher").occupiedDepth).toEqual({
        measuredFrom: "wall-plane",
        finishedDepthMm: NICHE_OCCUPIED_MM,
      });
      expect(definitionOf("base-dishwasher-600").occupiedDepth).toEqual({
        measuredFrom: "wall-plane",
        finishedDepthMm: NICHE_OCCUPIED_MM,
      });
    },
  );

  // What used to reach 632 was the appliance's bar. Nothing in the niche passes its own worktop
  // any more, which is the sentence the deleted constant's comment made and this asserts.
  it.each(NICHE_WIDTHS_M)(
    "keeps every mesh at %s m behind the worktop's front edge",
    (widthM) => {
      const niche = kit.make.dishwasherHousing(widthM);
      const counters = findMeshes(niche, "countertop");
      expect(counters.length).toBeGreaterThan(0);
      const counterFrontZ = counters.reduce(
        (front, mesh) => Math.max(front, worldBox(niche, mesh).max.z),
        Number.NEGATIVE_INFINITY,
      );

      niche.traverse((node) => {
        if (!isMesh(node)) return;
        expect(worldBox(niche, node).max.z, node.name).toBeLessThanOrEqual(
          counterFrontZ + 1e-9,
        );
      });
    },
  );
});
