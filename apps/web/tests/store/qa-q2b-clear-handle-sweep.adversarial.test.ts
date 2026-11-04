// Adversarial QA for the store's `clearHandle`, swept over every kitchen handle and both sides of the module line.
import {
  buildKitchenLBodyCatalog,
  cabinetDepthMmOf,
  HandleSchema,
  KITCHEN_L_DESIGN,
  priceDesign,
  setKitchenHandle,
  SAMPLE_PRICE_BOOK,
  SAMPLE_PRICE_BOOK_VERSION,
  type Design,
  type Handle,
  type KitchenHandleSettings,
} from "@lemnaria/configurator-domain";
import { makeKit, syncSolidBodies, type Kit } from "@lemnaria/three-adapter";
import * as THREE from "three";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { createConfiguratorStore } from "@/store/configurator-store";

import { NOTHING_DISABLED } from "../support/availability";
import { MEASURED_DEEPENING_ROWS } from "../support/deepening-rows";
import { createFakeProbeFactory } from "../support/fake-body-probe";
import { createHeadlessCanvas } from "../support/headless-canvas";

const CLOCK = "2026-11-04T10:00:00.000Z";
const HANDLE_GROUP = "handle";
const BELOW_THE_TOP_ROW = ["p0", "p1"] as const;
const ON_THE_TOP_ROW = ["p15", "p16"] as const;
const HANDLES: readonly Handle[] = HandleSchema.options;
const UNSET = undefined;
const KITCHEN_SETTINGS: readonly KitchenHandleSettings[] = [
  UNSET,
  ...HANDLES,
].flatMap((handle) =>
  [UNSET, ...HANDLES].map((topRowHandle) => ({
    ...(handle === UNSET ? {} : { handle }),
    ...(topRowHandle === UNSET ? {} : { topRowHandle }),
  })),
);

let kit: Kit;

beforeAll(() => {
  kit = makeKit({ createCanvas: createHeadlessCanvas });
});

function kitchenWith(settings: KitchenHandleSettings): Design {
  const kitchen = { ...KITCHEN_L_DESIGN.settings };
  delete kitchen.handle;
  delete kitchen.topRowHandle;
  return { ...KITCHEN_L_DESIGN, settings: { ...kitchen, ...settings } };
}

function storeFor(design: Design) {
  return createConfiguratorStore({
    design,
    catalogAt: buildKitchenLBodyCatalog,
    probeAt: createFakeProbeFactory(),
    now: () => CLOCK,
  });
}

type Store = ReturnType<typeof storeFor>;

function totalOf(design: Design): number {
  const result = priceDesign({
    design,
    catalog: buildKitchenLBodyCatalog(cabinetDepthMmOf(design)),
    book: SAMPLE_PRICE_BOOK,
    pricingVersion: SAMPLE_PRICE_BOOK_VERSION,
    selections: design.settings,
    deepeningRows: MEASURED_DEEPENING_ROWS,
    availability: NOTHING_DISABLED,
  });
  if (!result.ok) throw new Error(`no price: ${result.failure.code}`);
  return result.priced.totalMinor;
}

/** Every visible part of the cabinet's handle group, with the colour it is drawn in. */
function drawnBarOf(store: Store, placementId: string): readonly string[] {
  const { records, design } = store.getState();
  const solidsRoot = new THREE.Group();
  syncSolidBodies({ kit, solidsRoot, records, room: design.room });
  const body = solidsRoot.children.find(
    (child) => child.userData.placementId === placementId,
  );
  if (!body) throw new Error(`no body mounted for ${placementId}`);
  const parts: string[] = [];
  body.traverse((node) => {
    if (node.name !== HANDLE_GROUP) return;
    node.traverse((part) => {
      if (!(part instanceof THREE.Mesh) || !part.visible) return;
      const material = part.material as THREE.MeshStandardMaterial;
      parts.push(`${part.name}:${material.color.getHexString()}`);
    });
  });
  return parts;
}

function pressOn(store: Store, placementId: string) {
  store.getState().select({ kind: "placement", id: placementId });
  return store.getState();
}

describe("a cleared cabinet is indistinguishable from one that never chose", () => {
  const cabinets = [...BELOW_THE_TOP_ROW, ...ON_THE_TOP_ROW];

  it.each(KITCHEN_SETTINGS)(
    "draws the same bar and bills the same under kitchen %j, whatever it wore first",
    (settings) => {
      const kitchen = kitchenWith(settings);
      const never = storeFor(kitchen);
      const disagreements: string[] = [];
      for (const id of cabinets) {
        for (const own of HANDLES) {
          const store = storeFor(kitchen);
          pressOn(store, id).setHandle(own);
          store.getState().clearHandle();
          const drawn = drawnBarOf(store, id);
          const expected = drawnBarOf(never, id);
          if (
            JSON.stringify(drawn) !== JSON.stringify(expected) ||
            totalOf(store.getState().design) !== totalOf(kitchen)
          ) {
            disagreements.push(
              `${id} first wore ${own}: drew ${JSON.stringify(drawn)}, expected ${JSON.stringify(expected)}`,
            );
          }
        }
      }
      expect(disagreements).toEqual([]);
    },
  );

  it("hides the bar on a top-row cabinet when the kitchen names no top-row handle, and shows one below the row", () => {
    const store = storeFor(kitchenWith({}));
    for (const id of ON_THE_TOP_ROW) {
      pressOn(store, id).setHandle("black");
      expect(drawnBarOf(store, id)).not.toEqual([]);
      store.getState().clearHandle();
      expect(drawnBarOf(store, id)).toEqual([]);
    }
    for (const id of BELOW_THE_TOP_ROW) {
      pressOn(store, id).setHandle("push");
      expect(drawnBarOf(store, id)).toEqual([]);
      store.getState().clearHandle();
      expect(drawnBarOf(store, id)).not.toEqual([]);
    }
  });

  it("follows a later whole-kitchen change after a clear, which a rewritten handle would not", () => {
    const store = storeFor(kitchenWith({ handle: "steel" }));
    pressOn(store, "p0").setHandle("push");
    store.getState().clearHandle();
    const beforeTheChange = drawnBarOf(store, "p0");

    const result = setKitchenHandle({
      design: store.getState().design,
      handle: "black",
      occurredAt: CLOCK,
    });
    if (!result.ok) throw new Error(`fixture: ${result.reason.code}`);
    const afterTheChange = storeFor(result.design);

    expect(drawnBarOf(afterTheChange, "p0")).not.toEqual(beforeTheChange);
    expect(drawnBarOf(afterTheChange, "p0")).not.toEqual([]);
  });
});

describe("clearing touches nothing but the one cabinet", () => {
  it("leaves every other cabinet's own handle, the kitchen's handles and the selection as they were", () => {
    const store = storeFor(
      kitchenWith({ handle: "black", topRowHandle: "steel" }),
    );
    for (const id of ["p0", "p1", "p15"]) pressOn(store, id).setHandle("push");
    const before = store.getState().design;

    pressOn(store, "p1").clearHandle();

    const after = store.getState().design;
    expect(after.settings).toEqual(before.settings);
    expect(after.placements.filter((p) => p.id !== "p1")).toEqual(
      before.placements.filter((p) => p.id !== "p1"),
    );
    expect(store.getState().selection).toEqual({ kind: "placement", id: "p1" });
  });

  it("refuses a selected void without touching the design", () => {
    const store = storeFor(KITCHEN_L_DESIGN);
    pressOn(store, "p0").remove();
    const aVoid = store.getState().voids.find((v) => v.wall === "A");
    if (!aVoid) throw new Error("fixture: removing a cabinet left no void");
    store.getState().select({ kind: "void", id: aVoid.id });
    const before = store.getState().design;

    store.getState().clearHandle();

    expect(store.getState().design).toBe(before);
    expect(store.getState().lastRejection?.code).toBe("VOID_SELECTED");
  });

  it("is not an edit when the cabinet already followed the kitchen, as re-pressing the worn handle is not", () => {
    const store = storeFor(KITCHEN_L_DESIGN);

    pressOn(store, "p0").clearHandle();

    expect(store.getState().hasBeenEdited).toBe(false);
    expect(store.getState().design.placements).toEqual(
      KITCHEN_L_DESIGN.placements,
    );
  });

  it("is an edit, and a saved one, when a handle of its own is taken away", () => {
    const onDesignChanged = vi.fn();
    const store = createConfiguratorStore({
      design: KITCHEN_L_DESIGN,
      catalogAt: buildKitchenLBodyCatalog,
      probeAt: createFakeProbeFactory(),
      now: () => CLOCK,
      onDesignChanged,
    });
    pressOn(store, "p0").setHandle("black");
    onDesignChanged.mockClear();

    store.getState().clearHandle();

    expect(store.getState().hasBeenEdited).toBe(true);
    expect(onDesignChanged).toHaveBeenCalledTimes(1);
    expect(onDesignChanged.mock.calls[0]?.[0]).toBe(store.getState().design);
    expect(
      store.getState().design.placements.find((p) => p.id === "p0")?.body,
    ).not.toHaveProperty("handle");
  });

  it("reaches the saved document as an absent key, not as a null or an undefined member", () => {
    const store = storeFor(KITCHEN_L_DESIGN);
    pressOn(store, "p0").setHandle("black");

    store.getState().clearHandle();

    const written = JSON.parse(JSON.stringify(store.getState().design)) as {
      placements: { id: string; body: Record<string, unknown> }[];
    };
    const body = written.placements.find((p) => p.id === "p0")?.body;
    expect(Object.keys(body ?? {})).not.toContain("handle");
  });
});
