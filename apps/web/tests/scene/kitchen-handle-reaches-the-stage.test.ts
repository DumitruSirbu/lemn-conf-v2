// **Wave H1b QA (M10): the kitchen's handle reaches the scene through the real store, with no cabinet changed.**
//
// No store action sets `settings.handle` until Q2 (ruling H-6), so the settings-only change a customer can meet today
// is a loaded document that differs from the one on screen in that setting alone (`hydrate`), and a command that
// changes something else must not lose it. The stage's effect hands the store's `records` to `syncSolidBodies`
// (`kitchen-stage.tsx`); this test does exactly that over the real store and the real adapter, and reads the bars back
// off the meshes. The scene is therefore asked whether `PlacementRecord.kitchenSettings` is enough to re-sync it,
// rather than whether the adapter honours a field some other test filled in.
import {
  KITCHEN_L_DESIGN,
  type Design,
  type DesignId,
  type Handle,
  type PlacementRecord,
} from "@lemnaria/configurator-domain";
import { makeKit, syncSolidBodies, type Kit } from "@lemnaria/three-adapter";
import * as THREE from "three";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { useConfiguratorStore } from "@/store/configurator-store";

import { createHeadlessCanvas } from "../support/headless-canvas";

/** §6.5's module line, written out: the oracle must not read the constant under test. */
const MODULE_LINE_MM = 2_200;
const HANDLE_GROUP = "handle";

let kit: Kit;
let solidsRoot: THREE.Group;

beforeAll(() => {
  kit = makeKit({ createCanvas: createHeadlessCanvas });
});

beforeEach(() => {
  vi.stubGlobal("fetch", () => new Promise<Response>(() => undefined));
  solidsRoot = new THREE.Group();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function withKitchenHandle(handle: Handle | undefined): Design {
  if (handle === undefined) return KITCHEN_L_DESIGN;
  return {
    ...KITCHEN_L_DESIGN,
    settings: { ...KITCHEN_L_DESIGN.settings, handle },
  };
}

function hydrate(design: Design): void {
  useConfiguratorStore.getState().hydrate({
    design,
    designId: "handle-stage" as DesignId,
    revision: "1",
    canWrite: true,
  });
}

/** What the stage's effect does on every change of the store's records. */
function syncFromStore(): readonly PlacementRecord[] {
  const { records, design } = useConfiguratorStore.getState();
  syncSolidBodies({ kit, solidsRoot, records, room: design.room });
  return records;
}

function instanceOf(placementId: string): THREE.Object3D {
  const found = solidsRoot.children.find(
    (child) => child.userData.placementId === placementId,
  );
  if (!found) throw new Error(`no body mounted for "${placementId}"`);
  return found;
}

function instances(
  records: readonly PlacementRecord[],
): Map<string, THREE.Object3D> {
  return new Map(records.map((record) => [record.id, instanceOf(record.id)]));
}

function visibleHandleParts(body: THREE.Object3D): number {
  let visible = 0;
  body.traverse((node) => {
    if (node.name !== HANDLE_GROUP) return;
    node.traverse((part) => {
      if (part instanceof THREE.Mesh && part.visible) visible += 1;
    });
  });
  return visible;
}

function follows(record: PlacementRecord): boolean {
  return (
    record.canHandle &&
    record.handleMode === undefined &&
    Math.round(record.frame.y0 * 1000) < MODULE_LINE_MM
  );
}

function rebuilt(
  before: Map<string, THREE.Object3D>,
  records: readonly PlacementRecord[],
): string[] {
  return records
    .map((record) => record.id)
    .filter(
      (placementId) => instanceOf(placementId) !== before.get(placementId),
    )
    .sort();
}

describe("a loaded document that differs only in the kitchen's handle re-syncs the scene", () => {
  it.each([
    [undefined, "push"],
    ["steel", "black"],
    ["black", "push"],
    ["push", "steel"],
  ] as const)(
    "%s to %s rebuilds exactly the bodies that follow the kitchen",
    (from, to) => {
      hydrate(withKitchenHandle(from));
      const before = instances(syncFromStore());

      hydrate(withKitchenHandle(to));
      const records = syncFromStore();

      const expected = records
        .filter(follows)
        .map((record) => record.id)
        .sort();
      expect(expected.length).toBeGreaterThan(0);
      expect(rebuilt(before, records)).toEqual(expected);
    },
  );

  it("hides the bars of a following body that draws one when the kitchen goes push, and shows them again after", () => {
    hydrate(withKitchenHandle(undefined));
    const mounted = syncFromStore();
    const follower = mounted.find(
      (record) =>
        follows(record) && visibleHandleParts(instanceOf(record.id)) > 0,
    );
    if (!follower) throw new Error("no following body draws a bar");

    hydrate(withKitchenHandle("push"));
    syncFromStore();
    const hidden = visibleHandleParts(instanceOf(follower.id));
    hydrate(withKitchenHandle("steel"));
    syncFromStore();

    expect(hidden).toBe(0);
    expect(visibleHandleParts(instanceOf(follower.id))).toBeGreaterThan(0);
  });

  it("carries the settings on every record the store derives, so no hand-copied pair can drift", () => {
    hydrate(withKitchenHandle("black"));

    const { records } = useConfiguratorStore.getState();

    expect(records.length).toBeGreaterThan(0);
    expect(records.map((record) => record.kitchenSettings)).toEqual(
      records.map(() => ({ handle: "black" })),
    );
  });
});

describe("a command that changes something else keeps the kitchen's handle on the scene", () => {
  it("removing one body leaves every surviving body's visible bars as they were under a push kitchen", () => {
    hydrate(withKitchenHandle("push"));
    const barsBefore = new Map(
      syncFromStore().map((record) => [
        record.id,
        visibleHandleParts(instanceOf(record.id)),
      ]),
    );
    const removedId = "p0";
    useConfiguratorStore
      .getState()
      .select({ kind: "placement", id: removedId });

    useConfiguratorStore.getState().remove();
    const records = syncFromStore();

    expect(useConfiguratorStore.getState().design.settings?.handle).toBe(
      "push",
    );
    expect(records.some((record) => record.id === removedId)).toBe(false);
    expect(records.map((record) => record.kitchenSettings)).toEqual(
      records.map(() => ({ handle: "push" })),
    );
    expect(records.some(follows)).toBe(true);
    expect(
      records.map((record) => visibleHandleParts(instanceOf(record.id))),
    ).toEqual(records.map((record) => barsBefore.get(record.id)));
  });
});
