// **Adversarial QA for wave Q2 (M10), attack: what a pressed kitchen handle does downstream of the store.**
//
// The press is only worth having if the price and the scene follow it exactly. Over random kitchens (own handles dealt
// over the cabinets, floors either side of the top-row line, a kitchen handle already stored or not, a top-row handle
// or not, both cabinet depths), and an oracle written from the rule's words and never from a resolver:
//
//   - the hardware line after the press is its three rates over its three counts, the push count being the fronts of
//     every body that wears push; no other line moves, so the total moves by exactly the hardware line's delta;
//   - a kitchen in which no body takes a handle and none stands on the top row has one price under every handle;
//   - every cabinet's own handle is the one it had, and the press writes no placement;
//   - the scene, synced from the store's records before and after, keeps the exact instance of every body whose
//     resolved handle did not change, replaces the ones that did, and draws a black bar on a body that now wears it,
//     with the rest of the stage left standing (no teardown).
import { fc, test as propertyTest } from "@fast-check/vitest";
import {
  buildKitchenLBodyCatalog,
  cabinetDepthMmOf,
  countHardwareMechanisms,
  doorLeafHeightsMm,
  drawerCount,
  frontPopulationQueryFor,
  KITCHEN_L_DESIGN,
  priceDesign,
  projectDesignForDisplay,
  SAMPLE_PRICE_BOOK,
  SAMPLE_PRICE_BOOK_VERSION,
  setCabinetDepth,
  type BodyCatalog,
  type Design,
  type DisplayEntry,
  type Handle,
  type PricedDesign,
} from "@lemnaria/configurator-domain";
import { makeKit, syncSolidBodies, type Kit } from "@lemnaria/three-adapter";
import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";

import { createConfiguratorStore } from "@/store/configurator-store";

import { NOTHING_DISABLED } from "../support/availability";
import { MEASURED_DEEPENING_ROWS } from "../support/deepening-rows";
import { createFakeProbeFactory } from "../support/fake-body-probe";
import { createHeadlessCanvas } from "../support/headless-canvas";
import { roundedToTenLei } from "../support/ten-lei-amounts";

/** §6.5's module line, written out: the oracle must not read the constant under test. */
const MODULE_LINE_MM = 2_200;
const BLACK_HANDLE_HEX = "1c1e20";
const CLOCK = "2026-11-02T10:00:00.000Z";
const NO_TIERS = {
  availableMaterialTierIds: [],
  availableHardwareTierIds: [],
} as const;
const EVERY_HANDLE: readonly Handle[] = ["steel", "black", "push"];

const maybeHandle = fc.constantFrom<Handle | undefined>(
  undefined,
  "steel",
  "black",
  "push",
);
const floorChoice = fc.constantFrom<number | undefined>(
  undefined,
  MODULE_LINE_MM - 1,
  MODULE_LINE_MM,
  MODULE_LINE_MM + 1,
);

let kit: Kit;
let bases: readonly Design[];

beforeAll(() => {
  kit = makeKit({ createCanvas: createHeadlessCanvas });
  bases = [KITCHEN_L_DESIGN, atDepth700(KITCHEN_L_DESIGN)];
});

function atDepth700(design: Design): Design {
  const result = setCabinetDepth({
    design,
    catalogAt: buildKitchenLBodyCatalog,
    probeAt: createFakeProbeFactory(),
    cabinetDepthMm: 700,
    occurredAt: CLOCK,
  });
  if (!result.ok) throw new Error(`depth refused: ${result.reason.code}`);
  return result.design;
}

interface Variation {
  readonly base: number;
  readonly own: readonly (Handle | undefined)[];
  readonly floors: readonly (number | undefined)[];
  readonly kitchen: Handle | undefined;
  readonly topRow: Handle | undefined;
  readonly pressed: Handle;
}

const variation = fc.record({
  base: fc.nat({ max: 1 }),
  own: fc.array(maybeHandle, { minLength: 1, maxLength: 9 }),
  floors: fc.array(floorChoice, { minLength: 1, maxLength: 7 }),
  kitchen: maybeHandle,
  topRow: maybeHandle,
  pressed: fc.constantFrom(...EVERY_HANDLE),
});

function designOf({ base, own, floors, kitchen, topRow }: Variation): Design {
  const root = bases[base % bases.length];
  if (!root) throw new Error("no base design");
  const placements = root.placements.map((placement, index) => {
    const handle = own[index % own.length];
    const floor = floors[index % floors.length];
    return {
      ...placement,
      ...(floor === undefined ? {} : { y0Mm: floor }),
      body:
        handle === undefined ? placement.body : { ...placement.body, handle },
    };
  });
  return {
    ...root,
    placements,
    settings: {
      ...root.settings,
      ...(kitchen === undefined ? {} : { handle: kitchen }),
      ...(topRow === undefined ? {} : { topRowHandle: topRow }),
    },
  };
}

function storeFor(design: Design) {
  return createConfiguratorStore({
    design,
    catalogAt: buildKitchenLBodyCatalog,
    probeAt: createFakeProbeFactory(),
    now: () => CLOCK,
  });
}

function priceOf(design: Design): PricedDesign {
  const result = priceDesign({
    design,
    catalog: buildKitchenLBodyCatalog(cabinetDepthMmOf(design)),
    book: SAMPLE_PRICE_BOOK,
    pricingVersion: SAMPLE_PRICE_BOOK_VERSION,
    selections: design.settings,
    deepeningRows: MEASURED_DEEPENING_ROWS,
    availability: NOTHING_DISABLED,
  });
  if (!result.ok)
    throw new Error(`the kitchen did not price: ${result.failure.code}`);
  return result.priced;
}

function entriesOf(
  design: Design,
  catalog: BodyCatalog,
): readonly DisplayEntry[] {
  return projectDesignForDisplay(design, catalog).flatMap(
    (group) => group.entries,
  );
}

function frontsOf(entry: DisplayEntry, catalog: BodyCatalog): number {
  const query = frontPopulationQueryFor({
    body: entry,
    definition: catalog.get(entry.buildId) ?? {},
  });
  return doorLeafHeightsMm(query).length + drawerCount(query);
}

/** What a body wears, from the rule's words: its own handle, else push on the top row, else the kitchen's, else steel;
 *  a body that takes none wears nothing. */
function worn(
  design: Design,
  placementId: string,
  catalog: BodyCatalog,
): Handle | undefined {
  const placement = design.placements.find((one) => one.id === placementId);
  if (!placement) throw new Error(`no placement ${placementId}`);
  if (catalog.get(placement.body.buildId)?.canHandle !== true) return undefined;
  if (placement.body.handle !== undefined) return placement.body.handle;
  const isTopRow = placement.y0Mm >= MODULE_LINE_MM;
  return isTopRow
    ? (design.settings?.topRowHandle ?? "push")
    : (design.settings?.handle ?? "steel");
}

function frontPopulationOf(entry: DisplayEntry, catalog: BodyCatalog) {
  return frontPopulationQueryFor({
    body: entry,
    definition: catalog.get(entry.buildId) ?? {},
  });
}

/** The bodies that open without a bar. A body that takes no handle is one only on the top row, and only where it has a
 *  front that opens. */
function opensWithoutABar(
  design: Design,
  catalog: BodyCatalog,
): readonly DisplayEntry[] {
  return entriesOf(design, catalog).filter((entry) => {
    const placement = design.placements.find(
      (one) => one.id === entry.placementId,
    );
    if (!placement) throw new Error(`no placement ${entry.placementId}`);
    const wears = worn(design, entry.placementId, catalog);
    return wears === undefined
      ? placement.y0Mm >= MODULE_LINE_MM && frontsOf(entry, catalog) > 0
      : wears === "push";
  });
}

/** The latches the price must bill: one per door leaf of every body that opens without a bar, none per drawer. */
function expectedLatches(design: Design): number {
  const catalog = buildKitchenLBodyCatalog(cabinetDepthMmOf(design));
  return opensWithoutABar(design, catalog).reduce(
    (total, entry) =>
      total + doorLeafHeightsMm(frontPopulationOf(entry, catalog)).length,
    0,
  );
}

/** The push runners the price must bill: one per drawer of every body that opens without a bar. */
function expectedPushRunners(design: Design): number {
  const catalog = buildKitchenLBodyCatalog(cabinetDepthMmOf(design));
  return opensWithoutABar(design, catalog).reduce(
    (total, entry) => total + drawerCount(frontPopulationOf(entry, catalog)),
    0,
  );
}

function hardwareAmountOf(priced: PricedDesign): number {
  const line = priced.lines.find((one) => one.kind === "hardware");
  if (!line) throw new Error("no hardware line");
  return line.amountMinor;
}

/** The hardware line from the book, with the latch and push-runner counts the oracle gives and the hinge count the
 *  mechanism counter gives (a handle moves neither the hinges nor the number of drawers, which it only splits between
 *  the ordinary runner and the push runner). */
function expectedHardwareAmount(design: Design, tierId: string): number {
  const catalog = buildKitchenLBodyCatalog(cabinetDepthMmOf(design));
  const tier = SAMPLE_PRICE_BOOK.hardware.tiers.find(
    (one) => one.tierId === tierId,
  );
  if (!tier) throw new Error(`no tier ${tierId}`);
  const counts = countHardwareMechanisms(entriesOf(design, catalog), catalog);
  const pushRunners = expectedPushRunners(design);
  return roundedToTenLei(
    tier.perHingeMinor * counts.hinges +
      tier.perDrawerMinor *
        (counts.drawers + counts.pushRunners - pushRunners) +
      tier.perPushRunnerMinor * pushRunners +
      tier.perPushToOpenMinor * expectedLatches(design),
  );
}

function otherLines(priced: PricedDesign): readonly unknown[] {
  return priced.lines.filter((line) => line.kind !== "hardware");
}

describe("a pressed kitchen handle, through the store, to the price", () => {
  propertyTest.prop([variation], { numRuns: 80 })(
    "moves the hardware line to what its rates and the oracle's push count say, and no other line",
    (vary) => {
      const store = storeFor(designOf(vary));
      const before = priceOf(store.getState().design);

      store
        .getState()
        .applyWholeKitchenSettings({ ...NO_TIERS, handle: vary.pressed });

      const design = store.getState().design;
      const after = priceOf(design);
      const tierId = design.settings?.hardwareTierId ?? "hardware.standard";
      expect(design.settings?.handle).toBe(vary.pressed);
      expect(hardwareAmountOf(after)).toBe(
        expectedHardwareAmount(design, tierId),
      );
      expect(otherLines(after)).toEqual(otherLines(before));
      expect(after.totalMinor - before.totalMinor).toBe(
        hardwareAmountOf(after) - hardwareAmountOf(before),
      );
    },
  );

  propertyTest.prop([variation], { numRuns: 80 })(
    "writes no placement, and every cabinet that chose a handle still wears it",
    (vary) => {
      const store = storeFor(designOf(vary));
      const placementsBefore = store.getState().design.placements;
      const catalog = store.getState().catalog;

      store
        .getState()
        .applyWholeKitchenSettings({ ...NO_TIERS, handle: vary.pressed });

      const design = store.getState().design;
      expect(design.placements).toEqual(placementsBefore);
      for (const placement of placementsBefore) {
        if (
          placement.body.handle !== undefined &&
          catalog.get(placement.body.buildId)?.canHandle === true
        )
          expect(worn(design, placement.id, catalog)).toBe(
            placement.body.handle,
          );
      }
    },
  );

  propertyTest.prop([variation], { numRuns: 80 })(
    "gives every record the kitchen handle it must follow, which is what re-signs the scene",
    (vary) => {
      const store = storeFor(designOf(vary));

      store
        .getState()
        .applyWholeKitchenSettings({ ...NO_TIERS, handle: vary.pressed });

      for (const record of store.getState().records) {
        expect(record.kitchenSettings.handle).toBe(vary.pressed);
      }
    },
  );
});

describe("a kitchen in which nothing can wear a handle", () => {
  /** Only bodies that take no handle, and none on the top row (a top-row body with a front is latched whatever the
   *  kitchen says, which is its own case above). */
  const NOTHING_TAKES_A_HANDLE = (() => {
    const catalog = buildKitchenLBodyCatalog(600);
    return {
      ...KITCHEN_L_DESIGN,
      placements: KITCHEN_L_DESIGN.placements.filter(
        (placement) =>
          catalog.get(placement.body.buildId)?.canHandle === false &&
          placement.y0Mm < MODULE_LINE_MM,
      ),
    };
  })();

  it("is a kitchen with cabinets, none of which takes a handle", () => {
    const catalog = buildKitchenLBodyCatalog(600);

    expect(NOTHING_TAKES_A_HANDLE.placements.length).toBeGreaterThan(2);
    expect(
      NOTHING_TAKES_A_HANDLE.placements.every(
        (placement) => catalog.get(placement.body.buildId)?.canHandle === false,
      ),
    ).toBe(true);
  });

  it.each(EVERY_HANDLE)(
    "prices the same under %s as with no handle chosen, line for line",
    (handle) => {
      const store = storeFor(NOTHING_TAKES_A_HANDLE);
      const before = priceOf(store.getState().design);

      const outcome = store
        .getState()
        .applyWholeKitchenSettings({ ...NO_TIERS, handle });

      expect(outcome).toEqual({ committed: true });
      expect(store.getState().design.settings?.handle).toBe(handle);
      expect(priceOf(store.getState().design)).toEqual(before);
    },
  );
});

describe("the scene, synced from the store before and after a pressed handle", () => {
  function bodiesOf(
    solidsRoot: THREE.Group,
  ): ReadonlyMap<string, THREE.Object3D> {
    return new Map(
      solidsRoot.children.flatMap((child): [string, THREE.Object3D][] => {
        const id: unknown = child.userData.placementId;
        return typeof id === "string" ? [[id, child]] : [];
      }),
    );
  }

  function visibleBlackBars(body: THREE.Object3D): number {
    let black = 0;
    body.traverse((node) => {
      if (node.name !== "handle") return;
      node.traverse((part) => {
        if (!(part instanceof THREE.Mesh) || !part.visible) return;
        const material = part.material as THREE.MeshStandardMaterial;
        if (material.color.getHexString() === BLACK_HANDLE_HEX) black += 1;
      });
    });
    return black;
  }

  propertyTest.prop([variation], { numRuns: 25 })(
    "keeps the instance of every body whose handle did not change, replaces those whose did, tears nothing else down",
    (vary) => {
      const store = storeFor(designOf(vary));
      const stage = new THREE.Group();
      const standing = new THREE.Object3D();
      standing.name = "a-part-of-the-stage-that-is-not-a-body";
      stage.add(standing);
      const designBefore = store.getState().design;
      const catalog = store.getState().catalog;
      syncSolidBodies({
        kit,
        solidsRoot: stage,
        records: store.getState().records,
        room: designBefore.room,
      });
      const bodiesBefore = bodiesOf(stage);

      store
        .getState()
        .applyWholeKitchenSettings({ ...NO_TIERS, handle: vary.pressed });
      const designAfter = store.getState().design;
      syncSolidBodies({
        kit,
        solidsRoot: stage,
        records: store.getState().records,
        room: designAfter.room,
      });
      const bodiesAfter = bodiesOf(stage);

      expect(stage.children).toContain(standing);
      expect([...bodiesAfter.keys()].sort()).toEqual(
        [...bodiesBefore.keys()].sort(),
      );
      const wrong = designBefore.placements.flatMap((placement) => {
        const changed =
          worn(designBefore, placement.id, catalog) !==
          worn(designAfter, placement.id, catalog);
        const kept =
          bodiesAfter.get(placement.id) === bodiesBefore.get(placement.id);
        return kept === !changed
          ? []
          : [
              `${placement.id} ${placement.body.buildId}: changed=${String(changed)} kept=${String(kept)}`,
            ];
      });
      expect(wrong).toEqual([]);
    },
  );

  it("draws a black bar on a body that follows the kitchen once black is pressed, and not before", () => {
    const store = storeFor(KITCHEN_L_DESIGN);
    const stage = new THREE.Group();
    syncSolidBodies({
      kit,
      solidsRoot: stage,
      records: store.getState().records,
      room: KITCHEN_L_DESIGN.room,
    });
    const followerId = "p0";
    const before = bodiesOf(stage).get(followerId);
    if (!before) throw new Error("no body p0");

    store
      .getState()
      .applyWholeKitchenSettings({ ...NO_TIERS, handle: "black" });
    syncSolidBodies({
      kit,
      solidsRoot: stage,
      records: store.getState().records,
      room: KITCHEN_L_DESIGN.room,
    });
    const after = bodiesOf(stage).get(followerId);
    if (!after) throw new Error("no body p0 after");

    expect(visibleBlackBars(before)).toBe(0);
    expect(visibleBlackBars(after)).toBeGreaterThan(0);
  });
});
