// **Wave H1b (M10): the kitchen's handle reaches the scene, with the price and the panel.**
//
// `settings.handle` is a whole-kitchen setting that changes no cabinet's own data, so three things must move
// together or ADR 0092 Amendment C's split comes back: the hardware line's push-to-open latches (price), the
// handle the panel marks, and the bars on screen. Each is asked here of the same body under every kitchen handle,
// the scene by its meshes (visibility and colour) and not by any rule, and the sync is asked to rebuild a body
// exactly when its handle changed. The colour literal is written out: it is the thing the scene is held to.
import {
  countHardwareMechanisms,
  derivePlacementRecords,
  describeSelection,
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  kitchenHandleSettingsOf,
  projectDesignForDisplay,
  type Design,
  type Handle,
  type PlacementRecord,
} from "@lemnaria/configurator-domain";
import * as THREE from "three";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { forEachCabinetHandleMesh } from "../src/cabinet-handle-meshes.js";
import { makeKit, type Kit } from "../src/kitchen-parts.js";
import { syncSolidBodies } from "../src/scene-sync.js";
import {
  createHeadlessCanvas,
  installHeadlessDocument,
} from "./support/headless-canvas.js";

const BLACK_HANDLE_HEX = "1c1e20";
const TOP_ROW_FLOOR_MM = 2_200;
const EVERY_KITCHEN_HANDLE: readonly (Handle | undefined)[] = [
  undefined,
  "steel",
  "black",
  "push",
];
const OWN_HANDLE_ROTATION: readonly (Handle | undefined)[] = [
  undefined,
  "steel",
  "black",
  "push",
  undefined,
];

let kit: Kit;
let solidsRoot: THREE.Group;

beforeAll(() => {
  installHeadlessDocument();
  kit = makeKit({ createCanvas: createHeadlessCanvas });
});

beforeEach(() => {
  solidsRoot = new THREE.Group();
});

function withKitchenHandle(design: Design, handle: Handle | undefined): Design {
  if (handle === undefined) return design;
  return { ...design, settings: { ...design.settings, handle } };
}

/** Own handles dealt over the placements, so every kind of body appears under every kitchen handle. */
function withOwnHandlesDealtOut(design: Design): Design {
  return {
    ...design,
    placements: design.placements.map((placement, index) => {
      const handle = OWN_HANDLE_ROTATION[index % OWN_HANDLE_ROTATION.length];
      if (handle === undefined) return placement;
      return { ...placement, body: { ...placement.body, handle } };
    }),
  };
}

function mount(design: Design): readonly PlacementRecord[] {
  const records = derivePlacementRecords(design, KITCHEN_L_BODY_CATALOG);
  syncSolidBodies({ kit, solidsRoot, records, room: design.room });
  return records;
}

function mountedBodyOf(placementId: string): THREE.Object3D {
  const body = solidsRoot.children.find(
    (child) => child.userData["placementId"] === placementId,
  );
  if (!body) throw new Error(`no body mounted for placement "${placementId}"`);
  return body;
}

interface DrawnBars {
  readonly built: number;
  readonly visible: number;
  readonly black: number;
}

function drawnBarsOf(placementId: string): DrawnBars {
  let built = 0;
  let visible = 0;
  let black = 0;
  forEachCabinetHandleMesh(mountedBodyOf(placementId), (part) => {
    built += 1;
    if (part.visible) visible += 1;
    const material = part.material as THREE.MeshStandardMaterial;
    if (material.color.getHexString() === BLACK_HANDLE_HEX) black += 1;
  });
  return { built, visible, black };
}

/** What the price bills this body, asked of the real counter. */
function priceBillsALatch(design: Design, placementId: string): boolean {
  const entry = projectDesignForDisplay(design, KITCHEN_L_BODY_CATALOG)
    .flatMap((group) => group.entries)
    .find((candidate) => candidate.placementId === placementId);
  if (!entry) throw new Error(`no entry for "${placementId}"`);
  return (
    countHardwareMechanisms([entry], KITCHEN_L_BODY_CATALOG).pushToOpen > 0
  );
}

/** What the panel says the body wears, as it marks its chip. */
function panelWears(
  design: Design,
  records: readonly PlacementRecord[],
  placementId: string,
): Handle {
  const meta = describeSelection({
    records,
    voids: [],
    catalog: KITCHEN_L_BODY_CATALOG,
    target: { kind: "placement", id: placementId },
    kitchenSettings: kitchenHandleSettingsOf(design.settings),
  });
  if (!meta) throw new Error(`no meta for "${placementId}"`);
  return meta.canHandle
    ? (meta.handle ?? meta.defaultHandle)
    : meta.defaultHandle;
}

function barsOf(records: readonly PlacementRecord[]): string[] {
  return records
    .map((record) => record.id)
    .filter((placementId) => drawnBarsOf(placementId).built > 0);
}

describe.each(EVERY_KITCHEN_HANDLE)(
  "with the kitchen's handle at %s, the scene, the price and the panel say the same of every body",
  (kitchenHandle) => {
    const design = withKitchenHandle(
      withOwnHandlesDealtOut(KITCHEN_L_DESIGN),
      kitchenHandle,
    );

    it("hides a bar exactly where the price bills a latch and the panel marks push", () => {
      const records = mount(design);
      const gated = barsOf(records);

      const disagreeing = gated.filter((placementId) => {
        const sceneHidden = drawnBarsOf(placementId).visible === 0;
        const panelPush = panelWears(design, records, placementId) === "push";
        return (
          sceneHidden !== priceBillsALatch(design, placementId) ||
          sceneHidden !== panelPush
        );
      });

      expect(disagreeing).toEqual([]);
      expect(gated.length).toBeGreaterThan(0);
    });

    it("draws black bars exactly where the panel marks black, and no bar black where it does not", () => {
      const records = mount(design);
      const gated = barsOf(records);

      const disagreeing = gated.filter((placementId) => {
        const bars = drawnBarsOf(placementId);
        const record = records.find(
          (candidate) => candidate.id === placementId,
        );
        const panelBlack =
          record?.canHandle === true &&
          panelWears(design, records, placementId) === "black";
        return panelBlack ? bars.black !== bars.built : bars.black !== 0;
      });

      expect(disagreeing).toEqual([]);
    });
  },
);

describe("the kitchen's handle changes bodies a customer can see", () => {
  it("paints black bars on a following body when the kitchen goes black, and hides them when it goes push", () => {
    const follower = followingBodyWithABar(KITCHEN_L_DESIGN);

    mount(KITCHEN_L_DESIGN);
    const steel = drawnBarsOf(follower);
    mount(withKitchenHandle(KITCHEN_L_DESIGN, "black"));
    const black = drawnBarsOf(follower);
    mount(withKitchenHandle(KITCHEN_L_DESIGN, "push"));
    const push = drawnBarsOf(follower);

    expect(steel.black).toBe(0);
    expect(steel.visible).toBe(steel.built);
    expect(black.black).toBe(black.built);
    expect(black.visible).toBe(black.built);
    expect(push.visible).toBe(0);
  });
});

describe("a kitchen-handle change re-syncs the bodies that follow it and no others", () => {
  function instancesById(
    records: readonly PlacementRecord[],
  ): Map<string, THREE.Object3D> {
    return new Map(
      records.map((record) => [record.id, mountedBodyOf(record.id)]),
    );
  }

  function followsKitchen(record: PlacementRecord): boolean {
    return (
      record.canHandle &&
      record.handleMode === undefined &&
      Math.round(record.frame.y0 * 1000) < TOP_ROW_FLOOR_MM
    );
  }

  function rebuiltIds(
    before: Map<string, THREE.Object3D>,
    records: readonly PlacementRecord[],
  ): string[] {
    return records
      .map((record) => record.id)
      .filter(
        (placementId) => mountedBodyOf(placementId) !== before.get(placementId),
      );
  }

  it.each([
    ["steel", "push"],
    ["steel", "black"],
    ["black", "push"],
    ["push", "steel"],
  ] as const)("%s to %s rebuilds exactly the followers", (from, to) => {
    const dealt = withOwnHandlesDealtOut(KITCHEN_L_DESIGN);
    const beforeRecords = mount(withKitchenHandle(dealt, from));
    const before = instancesById(beforeRecords);

    const afterRecords = mount(withKitchenHandle(dealt, to));

    const expected = afterRecords.filter(followsKitchen).map((r) => r.id);
    expect(expected.length).toBeGreaterThan(0);
    expect(rebuiltIds(before, afterRecords).sort()).toEqual(
      [...expected].sort(),
    );
  });

  it("choosing the handle a following body already wore rebuilds nothing", () => {
    const dealt = withOwnHandlesDealtOut(KITCHEN_L_DESIGN);
    const records = mount(dealt);
    const before = instancesById(records);

    const afterRecords = mount(withKitchenHandle(dealt, "steel"));

    expect(rebuiltIds(before, afterRecords)).toEqual([]);
  });
});

describe("a legacy null own handle is drawn exactly as an absent one", () => {
  it.each(EVERY_KITCHEN_HANDLE)(
    "under kitchen %s the bars match, body by body",
    (kitchenHandle) => {
      const absent = withKitchenHandle(KITCHEN_L_DESIGN, kitchenHandle);
      const nulled: Design = {
        ...absent,
        placements: absent.placements.map((placement) => ({
          ...placement,
          body: { ...placement.body, handle: null as unknown as Handle },
        })),
      };
      const absentRecords = mount(absent);
      const expected = absentRecords.map((record) => drawnBarsOf(record.id));
      solidsRoot = new THREE.Group();

      const nulledRecords = mount(nulled);
      const actual = nulledRecords.map((record) => drawnBarsOf(record.id));

      expect(actual).toEqual(expected);
      expect(expected.some((bars) => bars.built > 0)).toBe(true);
    },
  );
});

/** A body that follows the kitchen on the shipped demo and draws a bar: takes a handle, chose none, stands below the
 *  top row. Found on a scratch scene so the caller's mounted one is untouched. */
function followingBodyWithABar(design: Design): string {
  const callersScene = solidsRoot;
  solidsRoot = new THREE.Group();
  const records = mount(design);
  const record = records.find(
    (candidate) =>
      candidate.canHandle &&
      candidate.handleMode === undefined &&
      Math.round(candidate.frame.y0 * 1000) < TOP_ROW_FLOOR_MM &&
      drawnBarsOf(candidate.id).built > 0,
  );
  solidsRoot = callersScene;
  if (!record) throw new Error("no following body draws a bar");
  return record.id;
}
