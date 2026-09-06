// Adversarial QA for the two claims wave 6C makes about *where* a price comes from — that it is
// derived on every render and stored nowhere, and that both surfaces are actually wired to the one
// hook that derives it.
//
// **The seam the implementer flagged.** `DescribePanelInput.pricing` is optional, and an absent one
// renders as a failure, so nothing is invented. What it cannot do is complain: delete the two lines
// in `use-panel-view.ts` that read `usePricedDesign()` and pass it on, and every existing panel test
// stays green — including `panel-store-seam.qa.test.ts`, which asserts the hook's composition
// against a **hand-written copy** of it that does not pass `pricing` at all and therefore already
// disagrees with the shipped hook. The first block below is the test that would catch that: it
// drives the real `usePanelView` over a real store state and requires a figure out the other end.
import {
  buildKitchenLBodyCatalog,
  derivePlacementRecords,
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  priceDesign,
  SAMPLE_PRICE_BOOK,
  SAMPLE_PRICE_BOOK_VERSION,
  WORKTOP_DEPTH_MM,
  type Design,
} from "@lemnaria/configurator-domain";
import {
  buildKitchenShell,
  CAMERA_FIELD_OF_VIEW_DEGREES,
  CAMERA_PRESETS,
  makeKit,
  syncSolidBodies,
} from "@lemnaria/three-adapter";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as THREE from "three";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { PRICE_BAR_RESERVED_HEIGHT_PX } from "@/price/price-bar-layout";
import { describePriceBar } from "@/price/price-bar-model";
import { describeStartingPrice } from "@/price/starting-price";
import {
  createConfiguratorStore,
  type ConfiguratorState,
} from "@/store/configurator-store";

import { createFakeProbeFactory } from "../support/fake-body-probe";
import { createHeadlessCanvas } from "../support/headless-canvas";

/** The store state the hooks under test read. Swapped between cases, so the real `usePanelView` and
 *  the real `usePricedDesign` run against a real store's real fields rather than a fixture shaped
 *  like one. */
const storeState = vi.hoisted(() => ({ current: undefined as unknown }));

vi.mock("@/store/configurator-store", async (importActual) => {
  const actual =
    await importActual<typeof import("@/store/configurator-store")>();
  return {
    ...actual,
    useConfiguratorStore: (selector: (state: unknown) => unknown) =>
      selector(storeState.current),
  };
});

const { usePanelView } = await import("@/panel/use-panel-view");
const { usePricedDesign } = await import("@/price/use-priced-design");

function freshStore(design: Design = KITCHEN_L_DESIGN) {
  return createConfiguratorStore({
    design,
    catalogAt: buildKitchenLBodyCatalog,
    probeAt: createFakeProbeFactory(),
    now: () => "2026-09-03T12:00:00.000Z",
  });
}

/** Renders a hook and returns what it produced, as JSON. React's server renderer is the only
 *  renderer this suite has (M4 wave 4A: no jsdom, no RTL), and it is enough — the claim under test
 *  is what the hook composes, not how it reacts to an event. */
function readFromHook<T>(useHook: () => T): T {
  let seen: T | undefined;
  function Probe() {
    seen = useHook();
    return null;
  }
  renderToStaticMarkup(createElement(Probe));
  if (seen === undefined) throw new Error("the hook produced nothing");
  return seen;
}

function priceOf(design: Design) {
  return priceDesign({
    design,
    catalog: KITCHEN_L_BODY_CATALOG,
    book: SAMPLE_PRICE_BOOK,
    pricingVersion: SAMPLE_PRICE_BOOK_VERSION,
  });
}

describe("the optional pricing seam, wired end to end", () => {
  function selectedPanelState(design: Design = KITCHEN_L_DESIGN): {
    readonly state: ConfiguratorState;
    readonly placementId: string;
  } {
    const store = freshStore(design);
    const placementId = design.placements[0]?.id;
    if (!placementId) throw new Error("the design has no placement to select");
    store.getState().select({ kind: "placement", id: placementId });
    return { state: store.getState(), placementId };
  }

  it("puts a figure in §9's footer when the panel is opened over a priced design", () => {
    // The test a dropped wiring fails. `describePanel` is never called here — `usePanelView` is —
    // so removing `pricing` from the call it makes inside leaves this red, and leaves the shipped
    // panel suites green.
    const { state } = selectedPanelState();
    storeState.current = state;

    const view = readFromHook(usePanelView);
    if (view.kind !== "open") throw new Error("expected an open panel");

    const priced = priceOf(KITCHEN_L_DESIGN);
    if (!priced.ok) throw new Error("expected the seeded design to price");
    expect(view.footer.price).toEqual(
      describeStartingPrice({
        label: "De la",
        totalMinor: priced.priced.totalMinor,
      }),
    );
  });

  it("shows §9's footer and the bar the same number, from the same store state", () => {
    // The reason both surfaces read one hook. Asserted across the two *hooks* rather than across two
    // calls to `priceDesign`, so a second book or a second version reaching one of them shows up.
    const { state } = selectedPanelState();
    storeState.current = state;

    const panel = readFromHook(usePanelView);
    const bar = describePriceBar({
      pricing: readFromHook(usePricedDesign),
      rejection: null,
    });
    if (panel.kind !== "open" || bar.kind !== "priced")
      throw new Error("expected an open panel and a priced bar");

    expect(panel.footer.price?.amountText).toBe(bar.figure.amountText);
  });

  it("moves both figures together when the design changes, with no refresh in between", () => {
    // §12 and the wave's own criterion: derived on every render. The store is mutated by a real
    // command and the hooks are read again — nothing tells them to recompute.
    const store = freshStore();
    const placementId = KITCHEN_L_DESIGN.placements[0]?.id;
    if (!placementId) throw new Error("the design has no placement");
    store.getState().select({ kind: "placement", id: placementId });

    storeState.current = store.getState();
    const before = readFromHook(usePricedDesign);
    if (!before.ok) throw new Error("expected a priced design");

    // A body the seeded design can lose: whichever removal the store actually accepts.
    const removed = KITCHEN_L_DESIGN.placements.find((placement) => {
      store.getState().select({ kind: "placement", id: placement.id });
      store.getState().remove();
      return store.getState().lastRejection === null;
    });
    expect(removed, "no seeded body could be removed").toBeDefined();

    storeState.current = store.getState();
    const after = readFromHook(usePricedDesign);
    if (!after.ok) throw new Error("expected a priced design");

    expect(after.priced.totalMinor).toBeLessThan(before.priced.totalMinor);
    expect(store.getState().design.placements.length).toBe(
      KITCHEN_L_DESIGN.placements.length - 1,
    );
  });
});

describe("no total is persisted, and no component computes one", () => {
  const DOMAIN_SOURCE = resolve(
    import.meta.dirname,
    "../../../../packages/configurator-domain/src",
  );
  const WEB_SOURCE = resolve(import.meta.dirname, "../../src");

  function listSourceFiles(directory: string, prefix = ""): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const path = `${prefix}${entry.name}`;
      if (entry.isDirectory())
        return listSourceFiles(resolve(directory, entry.name), `${path}/`);
      return /\.tsx?$/.test(entry.name) ? [path] : [];
    });
  }

  it("keeps every price field out of the design document and its schema", () => {
    // The document is what is written to the database and what `migrateDesign` reads back. A price
    // in it is a price that outlives the book that produced it.
    for (const file of [
      "design.ts",
      "validate-design.ts",
      "migrate-design.ts",
    ]) {
      const source = readFileSync(resolve(DOMAIN_SOURCE, file), "utf8").replace(
        /\/\*[\s\S]*?\*\//g,
        "",
      );
      expect(source, file).not.toMatch(
        /totalMinor|amountMinor|priceMinor|pricingVersion/,
      );
    }
  });

  it("keeps every price field out of the store's own state", () => {
    const store = readFileSync(
      resolve(WEB_SOURCE, "store/configurator-store.ts"),
      "utf8",
    ).replace(/\/\*[\s\S]*?\*\//g, "");

    expect(store).not.toMatch(
      /totalMinor|amountMinor|PricingResult|priceDesign/,
    );
  });

  it("keeps every figure out of browser storage, which today means out of storage entirely", () => {
    // Stated as the broad claim rather than the price-scoped one, because the price-scoped one is
    // **vacuous today**: no module in this application touches `localStorage`, `sessionStorage` or
    // `indexedDB` at all, so "no module both stores and prices" would pass on an empty set and would
    // go on passing after a figure was cached in a module nobody thought to allow-list. The empty
    // set is the assertion, and the day something legitimately stores, this test is where the
    // question "may it hold a total?" gets asked.
    const storingModules = listSourceFiles(WEB_SOURCE)
      .filter((path) =>
        /sessionStorage|localStorage|indexedDB/.test(
          readFileSync(resolve(WEB_SOURCE, path), "utf8").replace(
            /\/\*[\s\S]*?\*\//g,
            "",
          ),
        ),
      )
      .sort();

    expect(storingModules).toEqual([]);
  });

  it("is a pure query: the same design prices to the same value, twice over", () => {
    const first = priceOf(KITCHEN_L_DESIGN);
    const second = priceOf(structuredClone(KITCHEN_L_DESIGN));

    expect(second).toEqual(first);
  });

  it("holds nothing between calls: alternating designs alternate figures", () => {
    // A module-level cache in the bar model or the formatter would show up here as a second call
    // answering with the first call's figure.
    const smaller: Design = {
      ...KITCHEN_L_DESIGN,
      placements: KITCHEN_L_DESIGN.placements.slice(0, 3),
    };
    const seen = [
      KITCHEN_L_DESIGN,
      smaller,
      KITCHEN_L_DESIGN,
      smaller,
      KITCHEN_L_DESIGN,
    ].map((design) => {
      const view = describePriceBar({
        pricing: priceOf(design),
        rejection: null,
      });
      if (view.kind !== "priced") throw new Error("expected a priced bar");
      return view.figure.amountText;
    });

    expect(seen[0]).toBe(seen[2]);
    expect(seen[2]).toBe(seen[4]);
    expect(seen[1]).toBe(seen[3]);
    expect(seen[0]).not.toBe(seen[1]);
  });
});

// ---------------------------------------------------------------------------------------------
// The 390 × 844 gate, and what its sweep can and cannot fail on.
// ---------------------------------------------------------------------------------------------

const GATE_VIEWPORT = { widthPx: 390, heightPx: 844 } as const;
const CAMERA_NEAR_M = 0.01;
const CAMERA_FAR_M = 500;

const solidsRoot = new THREE.Group();

beforeAll(() => {
  const kit = makeKit({
    cabinetDepthMm: WORKTOP_DEPTH_MM,
    createCanvas: createHeadlessCanvas,
  });
  solidsRoot.add(buildKitchenShell(kit));
  syncSolidBodies({
    kit,
    solidsRoot,
    records: derivePlacementRecords(KITCHEN_L_DESIGN, KITCHEN_L_BODY_CATALOG),
  });
});

function mountedBodies(): THREE.Object3D[] {
  return solidsRoot.children.filter(
    (child) => child.userData.placementId !== undefined,
  );
}

function cameraFor(
  presetId: (typeof CAMERA_PRESETS)[number]["id"],
  sceneHeightPx: number,
): THREE.PerspectiveCamera {
  const preset = CAMERA_PRESETS.find((candidate) => candidate.id === presetId);
  if (!preset) throw new Error(`Unknown camera preset: ${presetId}`);
  const camera = new THREE.PerspectiveCamera(
    CAMERA_FIELD_OF_VIEW_DEGREES,
    GATE_VIEWPORT.widthPx / sceneHeightPx,
    CAMERA_NEAR_M,
    CAMERA_FAR_M,
  );
  camera.position.set(...preset.position);
  camera.lookAt(new THREE.Vector3(...preset.target));
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();
  return camera;
}

function cornersOf(box: THREE.Box3): THREE.Vector3[] {
  return [box.min.x, box.max.x].flatMap((x) =>
    [box.min.y, box.max.y].flatMap((y) =>
      [box.min.z, box.max.z].map((z) => new THREE.Vector3(x, y, z)),
    ),
  );
}

/** The body's lowest projected point as a **fraction of the scene box**, which is the quantity the
 *  shipped gate ultimately compares. Kept in normalised units here on purpose — see the first test
 *  below for why that is the whole point. */
function normalisedBottomOf(
  body: THREE.Object3D,
  presetId: (typeof CAMERA_PRESETS)[number]["id"],
  sceneHeightPx: number,
): number {
  const camera = cameraFor(presetId, sceneHeightPx);
  const box = new THREE.Box3().setFromObject(body);
  let bottom = Number.NEGATIVE_INFINITY;
  for (const corner of cornersOf(box)) {
    const projected = corner.clone().project(camera);
    bottom = Math.max(bottom, (1 - projected.y) / 2);
  }
  return bottom;
}

describe("what the shipped 390 × 844 sweep can fail on", () => {
  it("projects to the same normalised bounds whatever height the bar takes", () => {
    // **The finding this block exists for.** A perspective camera's *vertical* field of view does
    // not change with the aspect ratio, so shrinking the scene box scales every projected pixel with
    // it. `bottomPx = normalised * sceneHeight + sceneTop` and `barTopPx = sceneTop + sceneHeight`,
    // so `bottomPx <= barTopPx` reduces to `normalised <= 1` — a statement about the camera framing
    // the kitchen, with the bar's height cancelled out of both sides.
    //
    // Verified by mutation against the shipped file: replacing its `BAR_HEIGHTS_PX` with
    // `[92, 600, 700]` — a 700 px bar on an 844 px viewport, leaving an 80 px scene — leaves all 23
    // of its assertions green. The seven header heights cancel the same way.
    const body = mountedBodies()[0];
    if (!body) throw new Error("no body mounted");

    const tallScene = normalisedBottomOf(body, "overview", 700);
    const shortScene = normalisedBottomOf(body, "overview", 80);

    expect(shortScene).toBeCloseTo(tallScene, 10);
  });

  it("frames the whole seeded kitchen at the preset the screen mounts with", () => {
    // What the sweep does assert, stated once in the units that make it falsifiable: every body
    // lands inside the scene box. This is a real property — it is just not a property of the bar.
    for (const body of mountedBodies()) {
      const bottom = normalisedBottomOf(body, "overview", 700);
      expect(
        bottom,
        `${String(body.userData.placementId)} projects below the scene box`,
      ).toBeLessThanOrEqual(1);
    }
  });

  it("is a framing property that does not hold at the other two presets the screen offers", () => {
    // The state the sweep misses, named rather than left implied: the customer can switch to wallA
    // or wallB, and at those presets bodies project outside the scene box. That is **not** an
    // overlap with the bar — a body outside the scene box is clipped by the canvas, not covered by
    // the bar — but it does mean "every body is fully visible" is true only of `overview`, and a
    // reader taking the sweep as the overlap gate would conclude otherwise.
    const clippedByPreset = CAMERA_PRESETS.map((preset) => ({
      id: preset.id,
      clipped: mountedBodies().filter(
        (body) => normalisedBottomOf(body, preset.id, 700) > 1,
      ).length,
    }));

    expect(clippedByPreset).toContainEqual({ id: "overview", clipped: 0 });
    expect(
      clippedByPreset.some((preset) => preset.clipped > 0),
      "no preset clips a body, so this test no longer says anything",
    ).toBe(true);
  });

  it("keeps the counterfactual load-bearing at the height the bar actually reserves", () => {
    // The shipped counterfactual runs at one header height and one bar height. Swept here, because
    // it is the assertion that ties the reserve to a real number: with the bar laid *over* the
    // scene, the reserved band has to contain real cabinets, or reserving it means nothing.
    const headerHeightPx = 64;
    const overlaidSceneHeightPx = GATE_VIEWPORT.heightPx - headerHeightPx;

    for (const barHeightPx of [
      PRICE_BAR_RESERVED_HEIGHT_PX,
      PRICE_BAR_RESERVED_HEIGHT_PX + 24,
      PRICE_BAR_RESERVED_HEIGHT_PX + 48,
    ]) {
      const barTopPx = GATE_VIEWPORT.heightPx - barHeightPx;
      const covered = mountedBodies().filter(
        (body) =>
          normalisedBottomOf(body, "overview", overlaidSceneHeightPx) *
            overlaidSceneHeightPx +
            headerHeightPx >
          barTopPx,
      );
      expect(
        covered.length,
        `a ${String(barHeightPx)} px overlay`,
      ).toBeGreaterThan(0);
    }
  });

  it("would stop being load-bearing at a zero reserve, which is what makes it a counterfactual", () => {
    // Verified by mutation as well: setting `PRICE_BAR_RESERVED_HEIGHT_PX` to 0 turns the shipped
    // counterfactual red, which is the right behaviour and is what says it is not decoration.
    const headerHeightPx = 64;
    const overlaidSceneHeightPx = GATE_VIEWPORT.heightPx - headerHeightPx;
    const coveredByNothing = mountedBodies().filter(
      (body) =>
        normalisedBottomOf(body, "overview", overlaidSceneHeightPx) *
          overlaidSceneHeightPx +
          headerHeightPx >
        GATE_VIEWPORT.heightPx,
    );

    expect(coveredByNothing).toEqual([]);
  });
});
