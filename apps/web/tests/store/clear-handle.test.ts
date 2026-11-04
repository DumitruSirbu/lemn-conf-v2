// The store's `clearHandle`: the press reaches the command, the cabinet stays selected, and the price and the scene
// read the resolved handle again. Beside `qa-q2-handle-press-reaches-price-and-scene`, which does the same for the
// kitchen's own press.
import {
  buildKitchenLBodyCatalog,
  cabinetDepthMmOf,
  KITCHEN_L_DESIGN,
  priceDesign,
  SAMPLE_PRICE_BOOK,
  SAMPLE_PRICE_BOOK_VERSION,
  type Design,
  type Handle,
} from "@lemnaria/configurator-domain";
import { makeKit, syncSolidBodies, type Kit } from "@lemnaria/three-adapter";
import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";

import { createConfiguratorStore } from "@/store/configurator-store";

import { NOTHING_DISABLED } from "../support/availability";
import { MEASURED_DEEPENING_ROWS } from "../support/deepening-rows";
import { createFakeProbeFactory } from "../support/fake-body-probe";
import { createHeadlessCanvas } from "../support/headless-canvas";

const CLOCK = "2026-11-04T10:00:00.000Z";
const TOP_ROW_CABINET_ID = "p15";
const BASE_CABINET_ID = "p0";
const NO_HANDLE_BODY_ID = "p25";
const HANDLE_GROUP = "handle";

let kit: Kit;

beforeAll(() => {
  kit = makeKit({ createCanvas: createHeadlessCanvas });
});

function storeFor(design: Design) {
  return createConfiguratorStore({
    design,
    catalogAt: buildKitchenLBodyCatalog,
    probeAt: createFakeProbeFactory(),
    now: () => CLOCK,
  });
}

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

function visibleBarPartsOn(
  store: ReturnType<typeof storeFor>,
  placementId: string,
): number {
  const { records, design } = store.getState();
  const solidsRoot = new THREE.Group();
  syncSolidBodies({ kit, solidsRoot, records, room: design.room });
  const body = solidsRoot.children.find(
    (child) => child.userData.placementId === placementId,
  );
  if (!body) throw new Error(`no body mounted for ${placementId}`);
  let visible = 0;
  body.traverse((node) => {
    if (node.name !== HANDLE_GROUP) return;
    node.traverse((part) => {
      if (part instanceof THREE.Mesh && part.visible) visible += 1;
    });
  });
  return visible;
}

function ownHandleOf(
  store: ReturnType<typeof storeFor>,
  placementId: string,
): Handle | undefined {
  return store
    .getState()
    .design.placements.find((placement) => placement.id === placementId)?.body
    .handle;
}

describe("the store's clearHandle", () => {
  it("makes a top-row cabinet push-to-open again: the bar is hidden and the price returns", () => {
    const store = storeFor(KITCHEN_L_DESIGN);
    store.getState().select({ kind: "placement", id: TOP_ROW_CABINET_ID });
    const untouchedPrice = totalOf(store.getState().design);
    const untouchedBars = visibleBarPartsOn(store, TOP_ROW_CABINET_ID);

    store.getState().setHandle("steel");
    const barredPrice = totalOf(store.getState().design);
    const barredBars = visibleBarPartsOn(store, TOP_ROW_CABINET_ID);
    store.getState().clearHandle();

    expect(untouchedBars).toBe(0);
    expect(barredBars).toBeGreaterThan(0);
    expect(barredPrice).not.toBe(untouchedPrice);
    expect(ownHandleOf(store, TOP_ROW_CABINET_ID)).toBeUndefined();
    expect(visibleBarPartsOn(store, TOP_ROW_CABINET_ID)).toBe(0);
    expect(totalOf(store.getState().design)).toBe(untouchedPrice);
  });

  it("keeps the cabinet selected and the rejection empty", () => {
    const store = storeFor(KITCHEN_L_DESIGN);
    store.getState().select({ kind: "placement", id: BASE_CABINET_ID });
    store.getState().setHandle("black");

    store.getState().clearHandle();

    expect(store.getState().selection).toEqual({
      kind: "placement",
      id: BASE_CABINET_ID,
    });
    expect(store.getState().lastRejection).toBeNull();
  });

  it("restores the design a set was made from: clearing is the way back, set then clear is a no-op overall", () => {
    const store = storeFor(KITCHEN_L_DESIGN);
    store.getState().select({ kind: "placement", id: BASE_CABINET_ID });

    store.getState().setHandle("push");
    store.getState().clearHandle();
    store.getState().setHandle("push");
    const wearingAgain = ownHandleOf(store, BASE_CABINET_ID);
    store.getState().clearHandle();

    expect(wearingAgain).toBe("push");
    expect(store.getState().design.placements).toEqual(
      KITCHEN_L_DESIGN.placements,
    );
  });

  it("refuses a body that takes no handle, leaving the design and recording why", () => {
    const store = storeFor(KITCHEN_L_DESIGN);
    store.getState().select({ kind: "placement", id: NO_HANDLE_BODY_ID });
    const before = store.getState().design;

    store.getState().clearHandle();

    expect(store.getState().design).toBe(before);
    expect(store.getState().lastRejection?.code).toBe("HANDLE_NOT_SUPPORTED");
  });

  it("refuses with nothing selected", () => {
    const store = storeFor(KITCHEN_L_DESIGN);
    const before = store.getState().design;

    store.getState().clearHandle();

    expect(store.getState().design).toBe(before);
    expect(store.getState().lastRejection).not.toBeNull();
  });
});
