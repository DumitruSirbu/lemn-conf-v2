// Work item 2's decomposition-parity proof (`docs/milestones/M2-void-engine.md`): M1 rendered
// `builders['kitchen-l']()` as one whole-scene call. From here bodies are mounted individually via
// `deriveCabinetWorldTransform`, and this is the first place that switch could silently lose M1's
// verified fidelity — so it is proven, not assumed.
//
// Scope: **every** body `buildKitchen()` places, with nothing deferred. The two corner legs were
// carried as an unmatched gap from M2 until ADR 0025 derived their seat; the assertion below is
// now a **partition** — every non-shell child of the reference room is claimed exactly once, by a
// placement that may claim more than one — which is also what proves `kitchen-stage.tsx` draws each
// body once rather than twice, since it composes the scene by removing exactly the children a
// record's position claims.
import * as THREE from "three";
import {
  deriveCabinetWorldTransform,
  derivePlacementRecords,
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  type DesignPlacement,
  type PlacementRecord,
} from "@lemnaria/configurator-domain";
import { beforeAll, describe, expect, it } from "vitest";

import { buildDecomposedBody } from "../src/decomposed-bodies.js";
import { makeKit, type Kit } from "../src/kitchen-parts.js";
import {
  createHeadlessCanvas,
  installHeadlessDocument,
} from "./support/headless-canvas.js";
import { required } from "./support/required.js";
import {
  describeStructure,
  findMesh,
  meshNames,
  type StructureNode,
} from "./support/structure.js";

const FLOAT_EPSILON_METRES = 1e-6;

const SHELL_MESH_NAMES = new Set([
  "floor",
  "wall_back",
  "wall_left",
  "end_panel_right",
  "backsplash_wall_a",
]);

/** ADR 0027: the hob is a child of the cabinet it stands on rather than a placement beside it, so
 *  one placement now claims **two** of `buildKitchen()`'s children. `buildKitchen()` itself is
 *  unchanged — it is diffed against the vendored reference geometry and must stay that way — which
 *  is exactly why the comparison below had to become a partition rather than a pairing: every
 *  reference child is still claimed exactly once and none is claimed twice, but a composite claims
 *  more than one.
 *
 *  The two halves are still compared **structurally**, each against its own reference child: the
 *  cabinet minus its hob in the per-placement test below, and the hob itself against the standalone
 *  cooktop in the test that follows it. Nothing is compared more loosely than it was. */
const SEATED_HOB_GROUP_NAME = "induction_cooktop";

/** How many bodies `buildKitchen()` draws, written out. ADR 0027 moved a placement, not a body:
 *  the design went from 27 placements to 26 and the reference room still draws all 27, one of them
 *  claimed as a child of the composite. Stated as a number rather than derived from
 *  `KITCHEN_L_DESIGN.placements.length`, so the assertion below says what it is checking instead of
 *  restating the arithmetic of the thing it checks. */
const REFERENCE_BODY_COUNT = 27;

let kit: Kit;

beforeAll(() => {
  installHeadlessDocument();
  kit = makeKit({ createCanvas: createHeadlessCanvas });
});

function mountPlacement(
  room: THREE.Group,
  placement: DesignPlacement,
  record: PlacementRecord,
): THREE.Group {
  const body = buildDecomposedBody(kit, placement.body.buildId);
  body.position.set(record.frame.x, record.frame.y0, record.frame.z);
  body.rotation.y = record.frame.ry;
  room.add(body);
  return body;
}

function findChildAtPosition(
  room: THREE.Group,
  position: THREE.Vector3,
): THREE.Object3D | undefined {
  return room.children.find(
    (child) =>
      Math.abs(child.position.x - position.x) <= FLOAT_EPSILON_METRES &&
      Math.abs(child.position.y - position.y) <= FLOAT_EPSILON_METRES &&
      Math.abs(child.position.z - position.z) <= FLOAT_EPSILON_METRES,
  );
}

function expectNumbersClose(
  actual: readonly number[],
  expected: readonly number[],
  path: string,
) {
  expect(actual.length, `${path}: length`).toBe(expected.length);
  actual.forEach((value, index) => {
    expect(
      Math.abs(value - (expected[index] ?? Number.NaN)),
      `${path}[${String(index)}]: ${String(value)} vs ${String(expected[index])}`,
    ).toBeLessThanOrEqual(FLOAT_EPSILON_METRES);
  });
}

function hasSeatedHob(body: THREE.Object3D): boolean {
  return body.getObjectByName(SEATED_HOB_GROUP_NAME) !== undefined;
}

/** The composite's structure with its hob set aside — the half that must still match the reference
 *  base cabinet exactly. The hob is asserted on its own, never skipped. */
function withoutSeatedHob(node: StructureNode): StructureNode {
  return {
    ...node,
    children: node.children.filter(
      (child) => child.name !== SEATED_HOB_GROUP_NAME,
    ),
  };
}

function expectStructureMatches(
  actual: StructureNode,
  expected: StructureNode,
  path = "",
) {
  const here = path
    ? `${path} > ${actual.name || actual.kind}`
    : actual.name || actual.kind;
  expect(actual.name, `${here}: name`).toBe(expected.name);
  expect(actual.kind, `${here}: object type`).toBe(expected.kind);
  expect(actual.geometry, `${here}: geometry type`).toBe(expected.geometry);
  expect(actual.material, `${here}: material name`).toBe(expected.material);
  expect(actual.visible, `${here}: visibility`).toBe(expected.visible);
  expectNumbersClose(actual.position, expected.position, `${here}: position`);
  expectNumbersClose(actual.rotation, expected.rotation, `${here}: rotation`);
  expectNumbersClose(actual.scale, expected.scale, `${here}: scale`);
  if (expected.size === null) {
    expect(actual.size, `${here}: size`).toBeNull();
  } else {
    expect(actual.size, `${here}: size`).not.toBeNull();
    expectNumbersClose(actual.size ?? [], expected.size, `${here}: size`);
  }
  expect(
    actual.children.map((child) => child.name),
    `${here}: child order`,
  ).toEqual(expected.children.map((child) => child.name));
  actual.children.forEach((child, index) => {
    expectStructureMatches(
      child,
      required(expected.children[index], `child ${String(index)}`),
      here,
    );
  });
}

describe("decomposed kitchen-l placements reproduce the whole-scene render", () => {
  const referenceRoom = () => kit.builders["kitchen-l"]();
  const records = derivePlacementRecords(
    KITCHEN_L_DESIGN,
    KITCHEN_L_BODY_CATALOG,
  );
  const recordsById = new Map(records.map((record) => [record.id, record]));

  it.each(KITCHEN_L_DESIGN.placements)(
    "placement $id ($body.buildId) matches its buildKitchen() body exactly",
    (placement) => {
      const record = required(
        recordsById.get(placement.id),
        `record for ${placement.id}`,
      );
      const room = new THREE.Group();
      const body = mountPlacement(room, placement, record);

      const reference = required(
        findChildAtPosition(referenceRoom(), body.position),
        `reference body at ${JSON.stringify(body.position)} for ${placement.id}`,
      );

      expectStructureMatches(
        withoutSeatedHob(describeStructure(body)),
        describeStructure(reference),
        placement.id,
      );
    },
  );

  // The half the line above sets aside, asserted in full rather than dropped: the seated hob is the
  // same body, in the same world place, as the cooktop `buildKitchen()` still draws on its own.
  it("a seated hob reproduces buildKitchen()'s standalone cooktop, structure and world place", () => {
    const reference = referenceRoom();
    const referenceHob = required(
      reference.children.find((child) => child.name === SEATED_HOB_GROUP_NAME),
      "reference cooktop",
    );

    const hosts = KITCHEN_L_DESIGN.placements.filter((placement) =>
      hasSeatedHob(
        mountPlacement(
          new THREE.Group(),
          placement,
          required(recordsById.get(placement.id), placement.id),
        ),
      ),
    );
    expect(hosts.map((placement) => placement.id)).toEqual(["p2"]);

    const room = new THREE.Group();
    const host = required(hosts[0], "hob-bearing placement");
    const body = mountPlacement(
      room,
      host,
      required(recordsById.get(host.id), host.id),
    );
    room.updateWorldMatrix(true, true);
    const seatedHob = required(
      body.getObjectByName(SEATED_HOB_GROUP_NAME),
      "seated hob",
    );

    reference.updateWorldMatrix(true, true);
    expectNumbersClose(
      seatedHob.getWorldPosition(new THREE.Vector3()).toArray(),
      referenceHob.getWorldPosition(new THREE.Vector3()).toArray(),
      `${host.id}: seated hob world position`,
    );
    expectStructureMatches(
      { ...describeStructure(seatedHob), position: [0, 0, 0] },
      { ...describeStructure(referenceHob), position: [0, 0, 0] },
      `${host.id}: seated hob`,
    );
  });

  // The suite's strongest assertion, and the one that has to be read as a partition rather than as
  // a count: the placements' claims must cover every non-shell reference child, and cover each of
  // them once. Since ADR 0027 one composite legitimately claims *two* children, so the claim total
  // exceeds the placement count — which is why the count alone proves nothing and each of the
  // three assertions below has to carry its own defect:
  //
  //   - `required(findChildAtPosition(...))` throwing means a placement has no reference child at
  //     its derived transform, so the seat drifted (the ADR 0005 failure, where six bodies sat
  //     10-20 mm off their wall);
  //   - `matched.size !== claims` means two placements landed on the same reference child, so one
  //     body would mount without its whole-scene twin being removed — a double draw;
  //   - a non-shell child left unmatched means `buildKitchen()` still draws a body no placement
  //     owns, which is exactly the state the corner legs were in before ADR 0025.
  //
  // `kitchen-stage.tsx` composes the live scene by removing every reference-room child whose
  // position a record claims (within the same 1e-6 m), then mounting the records. The partition is
  // therefore the double-render proof: onto, so nothing is left behind to be drawn twice; disjoint,
  // so nothing is removed on behalf of two bodies.
  it("partitions every buildKitchen() body: 27 reference bodies over 26 placements, 5 shell items excluded, none deferred", () => {
    const room = referenceRoom();
    const matched = new Set<THREE.Object3D>();
    let claims = 0;
    for (const placement of KITCHEN_L_DESIGN.placements) {
      const record = required(recordsById.get(placement.id), placement.id);
      const transform = deriveCabinetWorldTransform({
        wall: placement.wall,
        alongM: placement.alongMm / 1000,
        y0M: placement.y0Mm / 1000,
        depthM: record.frame.d,
      });
      const position = new THREE.Vector3(
        transform.position.x,
        transform.position.y,
        transform.position.z,
      );
      for (const claimed of claimedReferenceChildren(
        room,
        placement,
        record,
        position,
      )) {
        matched.add(claimed);
        claims += 1;
      }
    }

    // Disjoint: `claims` counts every claim made, `matched` counts the distinct children they
    // landed on, so two placements claiming the same child still reads as a double draw.
    expect(matched.size).toBe(claims);
    expect(matched.size).toBe(REFERENCE_BODY_COUNT);
    const unmatched = room.children.filter(
      (child) => !matched.has(child) && !SHELL_MESH_NAMES.has(child.name),
    );
    expect(unmatched.map((child) => child.name)).toEqual([]);
    expect(matched.size + SHELL_MESH_NAMES.size).toBe(room.children.length);
  });

  /** Every reference child this placement's body stands in for: the one at its own transform, plus
   *  the standalone cooktop that a hob-bearing body now carries as a child of its own. */
  function claimedReferenceChildren(
    room: THREE.Group,
    placement: DesignPlacement,
    record: PlacementRecord,
    position: THREE.Vector3,
  ): THREE.Object3D[] {
    const claimed = [
      required(findChildAtPosition(room, position), placement.id),
    ];
    const body = mountPlacement(new THREE.Group(), placement, record);
    if (!hasSeatedHob(body)) return claimed;
    const seatedHob = required(
      body.getObjectByName(SEATED_HOB_GROUP_NAME),
      "seated hob",
    );
    body.parent?.updateWorldMatrix(true, true);
    claimed.push(
      required(
        findChildAtPosition(
          room,
          seatedHob.getWorldPosition(new THREE.Vector3()),
        ),
        `${placement.id}: reference cooktop under its seated hob`,
      ),
    );
    return claimed;
  }

  // The base row and the two tall units used to sit 10-20 mm proud of the wall plane in the
  // ported M1 scene, because `buildKitchen()` placed them at round-number offsets (`zA = 0.3`,
  // `xB = 0.3`) instead of deriving them from the §6.2 seating algorithm — fixed in both the
  // reference and the port (see `docs/decisions/0005-m2-row19-m1-wall-gap-finding.md`).
  // Every row, decomposed or whole-scene, now agrees exactly with no gap.
  //
  // ADR 0025 adds the one standing exception, and it is a *negative* gap: `p25`, the corner X-leg,
  // sits 20 mm **behind** the wall plane. Its 900 x 600 carcass has to meet the 580 mm-deep return
  // leg on a shared face at z = 0.58, so its origin is fixed at 0.58 - 0.30 = 0.28 by the L-joint,
  // not by the wall. Seating it flush would drive it 20 mm *into* the return leg — a visible solid
  // intersection — while the 20 mm it loses at the back is buried inside the wall and invisible.
  // Pinned by value so the leg cannot drift, and so "it fixed itself" fails loudly.
  //
  // **ADR 0039 decision 3 adds the second and, as of wave 5F, the last: `p13`, the hood, at a
  // positive 100 mm.** The hood is hung from the *front* — its front face on the 600 mm
  // cabinet-depth line, confirmed by the owner as that line and not the worktop's 620 — and a hood
  // is a standard 500 mm whatever the kitchen's depth, so 100 mm of the space behind it is empty
  // and the chimney hides it. Like the corner leg it is declared and measured, never a tolerance
  // that drifted, and it is pinned by value here for the same reason: `600 − 500`, and a hood that
  // quietly went back to sitting on the wall fails this line.
  const KNOWN_WALL_GAP_M: ReadonlyMap<string, number> = new Map([
    ["p25", -0.02],
    ["p13", 0.1],
  ]);

  it("row 19: every mounted body's back face lies on its wall plane", () => {
    const reference = referenceRoom();
    const wallBackPlaneZ = findMesh(reference, "wall_back").position.z;
    const wallLeftPlaneX = findMesh(reference, "wall_left").position.x;
    expect(wallBackPlaneZ).toBe(0);
    expect(wallLeftPlaneX).toBe(0);

    const room = new THREE.Group();
    room.add(
      findMesh(reference, "wall_back").clone(),
      findMesh(reference, "wall_left").clone(),
    );

    for (const placement of KITCHEN_L_DESIGN.placements) {
      const record = required(recordsById.get(placement.id), placement.id);
      const body = mountPlacement(room, placement, record);
      room.updateWorldMatrix(true, true);
      const box = new THREE.Box3().setFromObject(body);
      const backFace = record.rotated ? box.min.x : box.min.z;
      const plane = record.rotated ? wallLeftPlaneX : wallBackPlaneZ;
      const expectedGap = KNOWN_WALL_GAP_M.get(placement.id) ?? 0;
      expect(
        Math.abs(backFace - plane - expectedGap),
        `${placement.id} (${placement.wall}): back face ${String(backFace)} vs plane ${String(plane)} + known gap ${String(expectedGap)}`,
      ).toBeLessThanOrEqual(FLOAT_EPSILON_METRES);
    }
  });

  it("leaves no gaps between adjacent decomposed bodies in the same row", () => {
    const rows = new Map<string, PlacementRecord[]>();
    for (const record of records) {
      const rowKey = `${record.wall}|${record.frame.y0.toFixed(2)}`;
      const bucket = rows.get(rowKey);
      if (bucket) bucket.push(record);
      else rows.set(rowKey, [record]);
    }

    for (const members of rows.values()) {
      const axis = (record: PlacementRecord) =>
        record.rotated ? record.frame.z : record.frame.x;
      const sorted = [...members].sort((a, b) => axis(a) - axis(b));
      for (let i = 0; i < sorted.length - 1; i++) {
        const left = required(sorted[i], "left neighbour");
        const right = required(sorted[i + 1], "right neighbour");
        const leftEdge = axis(left) + left.frame.w / 2;
        const rightEdge = axis(right) - right.frame.w / 2;
        expect(
          Math.abs(leftEdge - rightEdge),
          `${left.id} -> ${right.id}: gap ${String(rightEdge - leftEdge)}`,
        ).toBeLessThanOrEqual(FLOAT_EPSILON_METRES);
      }
    }
  });

  it("decomposed placements produce the same mesh-name set the whole-scene render produced", () => {
    const reference = referenceRoom();
    const expectedNames = reference.children
      .filter((child) => !SHELL_MESH_NAMES.has(child.name))
      .flatMap((child) => meshNames(child));

    const room = new THREE.Group();
    const actualNames = KITCHEN_L_DESIGN.placements.flatMap((placement) => {
      const record = required(recordsById.get(placement.id), placement.id);
      return meshNames(mountPlacement(room, placement, record));
    });

    expect(actualNames.sort()).toEqual(expectedNames.sort());
  });
});
