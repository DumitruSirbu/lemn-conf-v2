import {
  derivePlacementRecords,
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  type PlacementRecord,
} from "@lemnaria/configurator-domain";
import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";

import { buildKitchenShell } from "../src/kitchen-shell.js";
import { makeKit, type Kit } from "../src/kitchen-parts.js";
import { climbToSelectable } from "../src/picking.js";
import { syncSolidBodies } from "../src/scene-sync.js";
import { isMesh } from "../src/three-guards.js";
import {
  createHeadlessCanvas,
  installHeadlessDocument,
} from "./support/headless-canvas.js";
import { required } from "./support/required.js";
import { describeStructure } from "./support/structure.js";

const SHELL_CHILD_NAMES = [
  "floor",
  "wall_back",
  "wall_left",
  "end_panel_right",
  "backsplash_wall_a",
] as const;
const FREESTANDING_FRIDGE_NAME = "fridge_freestanding";
const SEATED_HOB_NAME = "induction_cooktop";
const REFERENCE_POSITION_EPSILON_M = 1e-6;

const SEEDED_RECORDS = derivePlacementRecords(
  KITCHEN_L_DESIGN,
  KITCHEN_L_BODY_CATALOG,
);
const DELETABLE_SEEDED_RECORDS = SEEDED_RECORDS.filter(
  (record) => record.canDelete,
);

let kit: Kit;

beforeAll(() => {
  installHeadlessDocument();
  kit = makeKit({ createCanvas: createHeadlessCanvas });
});

interface MountedScene {
  readonly shell: THREE.Group;
  readonly solidsRoot: THREE.Group;
}

function mountFirstScene(records: readonly PlacementRecord[]): MountedScene {
  const shell = buildKitchenShell(kit);
  const solidsRoot = new THREE.Group();
  solidsRoot.name = "solids";
  solidsRoot.add(shell);
  syncSolidBodies({ kit, solidsRoot, records });
  return { shell, solidsRoot };
}

function namesIn(root: THREE.Object3D, name: string): THREE.Object3D[] {
  const found: THREE.Object3D[] = [];
  root.traverse((node) => {
    if (node.name === name) found.push(node);
  });
  return found;
}

/** Mutation control for SCENE-001's discarded implementation: using only current records to
 * identify reference bodies cannot remove a body that was already absent from persistence. */
function buildForbiddenRecordDerivedShell(
  records: readonly PlacementRecord[],
): THREE.Group {
  const shell = kit.builders["kitchen-l"]();
  const currentPositions = records.map(
    (record) =>
      new THREE.Vector3(record.frame.x, record.frame.y0, record.frame.z),
  );
  for (const child of [...shell.children]) {
    if (
      currentPositions.some(
        (position) =>
          position.distanceTo(child.position) <= REFERENCE_POSITION_EPSILON_M,
      )
    ) {
      shell.remove(child);
    }
  }
  return shell;
}

function placementIdsAbove(node: THREE.Object3D): string[] {
  const ids: string[] = [];
  let current: THREE.Object3D | null = node;
  while (current) {
    const placementId = current.userData["placementId"] as string | undefined;
    if (placementId !== undefined) ids.push(placementId);
    current = current.parent;
  }
  return ids;
}

function expectOnlyCurrentPlacements(
  mounted: MountedScene,
  records: readonly PlacementRecord[],
): void {
  expect(mounted.shell.children.map((child) => child.name)).toEqual(
    SHELL_CHILD_NAMES,
  );

  const customerBodies = mounted.solidsRoot.children.filter(
    (child) => child !== mounted.shell,
  );
  const mountedIds = customerBodies.map((body) =>
    String(body.userData["placementId"]),
  );
  const expectedIds = records.map((record) => record.id);

  expect(mounted.solidsRoot.children).toHaveLength(records.length + 1);
  expect(new Set(mountedIds).size).toBe(mountedIds.length);
  expect([...mountedIds].sort()).toEqual([...expectedIds].sort());

  mounted.shell.traverse((node) => {
    if (isMesh(node)) expect(placementIdsAbove(node), node.name).toEqual([]);
  });
  for (const body of customerBodies) {
    const placementId = body.userData["placementId"] as string | undefined;
    expect(placementId).toBeTypeOf("string");
    expect(climbToSelectable(body)).toEqual({
      kind: "placement",
      id: placementId,
    });
    body.traverse((node) => {
      if (isMesh(node)) {
        expect(
          placementIdsAbove(node),
          `${String(placementId)} > ${node.name}`,
        ).toEqual([placementId]);
      }
    });
  }
}

describe("the immutable kitchen shell", () => {
  it("contains exactly the five documented room children at their reference geometry", () => {
    const expected = kit.builders["kitchen-l"]();
    for (const child of [...expected.children]) {
      if (!SHELL_CHILD_NAMES.some((name) => name === child.name)) {
        expected.remove(child);
      }
    }

    const shell = buildKitchenShell(kit);

    expect(shell.children.map((child) => child.name)).toEqual(
      SHELL_CHILD_NAMES,
    );
    expect(
      shell.children.flatMap((child) => child.children),
      "an allowed shell child must not hide nested customer geometry",
    ).toEqual([]);
    expect(describeStructure(shell)).toEqual(describeStructure(expected));
  });

  it("mounts only the shell when the persisted design has zero placements", () => {
    const mounted = mountFirstScene([]);

    expectOnlyCurrentPlacements(mounted, []);
  });
});

describe("a deletion persisted before the first stage mount", () => {
  it("mutation control: a current-record-derived shell restores p7 and duplicates the hob", () => {
    const withoutFridge = SEEDED_RECORDS.filter((record) => record.id !== "p7");
    const forbiddenShell = buildForbiddenRecordDerivedShell(withoutFridge);

    expect(namesIn(forbiddenShell, FREESTANDING_FRIDGE_NAME)).toHaveLength(1);
    expect(namesIn(forbiddenShell, SEATED_HOB_NAME)).toHaveLength(1);
    expect(forbiddenShell.children.map((child) => child.name)).not.toEqual(
      SHELL_CHILD_NAMES,
    );
  });

  it.each(DELETABLE_SEEDED_RECORDS)(
    "does not restore $id ($buildId) as an unowned reference body",
    (deleted) => {
      const current = SEEDED_RECORDS.filter(
        (record) => record.id !== deleted.id,
      );
      const mounted = mountFirstScene(current);

      expectOnlyCurrentPlacements(mounted, current);
    },
  );

  it("does not leave p7's freestanding fridge in the shell", () => {
    const withoutFridge = SEEDED_RECORDS.filter((record) => record.id !== "p7");
    const mounted = mountFirstScene(withoutFridge);

    expect(namesIn(mounted.solidsRoot, FREESTANDING_FRIDGE_NAME)).toEqual([]);
    expectOnlyCurrentPlacements(mounted, withoutFridge);
  });

  it("reloads the same deleted-fridge scene with the same bodies and selectability", () => {
    const withoutFridge = SEEDED_RECORDS.filter((record) => record.id !== "p7");
    const first = mountFirstScene(withoutFridge);
    const reloaded = mountFirstScene(withoutFridge);

    expectOnlyCurrentPlacements(first, withoutFridge);
    expectOnlyCurrentPlacements(reloaded, withoutFridge);
    expect(describeStructure(reloaded.solidsRoot)).toEqual(
      describeStructure(first.solidsRoot),
    );
  });
});

describe("the full seeded scene", () => {
  it("mounts every customer body once under its current placement ID", () => {
    const mounted = mountFirstScene(SEEDED_RECORDS);

    expectOnlyCurrentPlacements(mounted, SEEDED_RECORDS);
  });

  it("owns the hob only under p2 and leaves no standalone reference duplicate", () => {
    const mounted = mountFirstScene(SEEDED_RECORDS);
    const hobs = namesIn(mounted.solidsRoot, SEATED_HOB_NAME);

    expect(hobs).toHaveLength(1);
    expect(climbToSelectable(required(hobs[0], "seated hob"))).toEqual({
      kind: "placement",
      id: "p2",
    });
    expect(namesIn(mounted.shell, SEATED_HOB_NAME)).toEqual([]);
    expect(
      mounted.solidsRoot.children.some(
        (child) => child.name === SEATED_HOB_NAME,
      ),
    ).toBe(false);
  });
});
