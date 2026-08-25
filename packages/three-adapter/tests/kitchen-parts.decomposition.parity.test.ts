// Work item 2's decomposition-parity proof (`docs/milestones/M2-void-engine.md`): M1 rendered
// `builders['kitchen-l']()` as one whole-scene call. From here bodies are mounted individually via
// `deriveCabinetWorldTransform`, and this is the first place that switch could silently lose M1's
// verified fidelity — so it is proven, not assumed.
//
// Scope: every placement in `KITCHEN_L_DESIGN` except the two corner legs (`corner_base_x`,
// `corner_base_return`). Their geometry is not centred on the wall-normal axis the way every other
// body is, so mounting them needs a transform this milestone does not define; the "two accounted
// for, unmatched" assertion below documents that gap instead of silently dropping it.
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
const DEFERRED_BODY_NAMES = new Set(["corner_base_pair"]);
const DEFERRED_GROUP_NAMES = new Set(["corner_base_x", "corner_base_return"]);

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
        describeStructure(body),
        describeStructure(reference),
        placement.id,
      );
    },
  );

  it("accounts for every buildKitchen() body: 25 decomposed, 2 corner legs deferred, 5 shell items excluded", () => {
    const room = referenceRoom();
    const matched = new Set<THREE.Object3D>();
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
      matched.add(required(findChildAtPosition(room, position), placement.id));
    }

    const unmatched = room.children.filter(
      (child) => !matched.has(child) && !SHELL_MESH_NAMES.has(child.name),
    );
    expect(unmatched.map((child) => child.name).sort()).toEqual(
      [...DEFERRED_GROUP_NAMES].sort(),
    );
    expect(DEFERRED_BODY_NAMES.size).toBe(1); // guards the constant against silent drift
  });

  // The base row and the two tall units used to sit 10-20 mm proud of the wall plane in the
  // ported M1 scene, because `buildKitchen()` placed them at round-number offsets (`zA = 0.3`,
  // `xB = 0.3`) instead of deriving them from the §6.2 seating algorithm — fixed in both the
  // reference and the port (see `docs/decisions/0005-m2-row19-m1-wall-gap-finding.md`).
  // Every row, decomposed or whole-scene, now agrees exactly with no gap.
  const KNOWN_WALL_GAP_M: ReadonlyMap<string, number> = new Map();

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
      if (record.accessory) continue; // an appliance on a countertop, not seated against a wall
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
      if (record.accessory) continue;
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

  it("decomposed placements produce the same mesh-name set the whole-scene render produced for those bodies", () => {
    const reference = referenceRoom();
    const expectedNames = reference.children
      .filter(
        (child) =>
          !SHELL_MESH_NAMES.has(child.name) &&
          !DEFERRED_GROUP_NAMES.has(child.name),
      )
      .flatMap((child) => meshNames(child));

    const room = new THREE.Group();
    const actualNames = KITCHEN_L_DESIGN.placements.flatMap((placement) => {
      const record = required(recordsById.get(placement.id), placement.id);
      return meshNames(mountPlacement(room, placement, record));
    });

    expect(actualNames.sort()).toEqual(expectedNames.sort());
  });
});
