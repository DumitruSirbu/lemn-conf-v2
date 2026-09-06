// **Review finding R1.4 on wave 6R**, which the shipped suite states nowhere.
//
// `finishes.ts`' header names the hazard the per-kit material cache was built against — *"a customer
// stepping through the decors would otherwise strand one clone per front per step"* — and 6R
// re-opened it from the other side. The decors are eight declared ids; MDF's RAL picker is sixteen
// million, and `editor-panel.tsx` writes on React's `onChange`, which for `<input type="color">` is
// the native `input` event that Chrome and Safari raise continuously while the picker is dragged.
// One drag across the gradient therefore asks `deriveKitMaterial` for one key per intermediate hex.
//
// Measured before the fix: 504 free colours through `applyFinish` left 504 `M.door` clones in the
// kit's ownership record, every one of them retained until `disposeKitAndStage`. A bound nobody
// asserts is not a bound, so these are the assertions.
import {
  freeColourFinish,
  MAX_PLACEMENTS,
  paletteFinish,
} from "@lemnaria/configurator-domain";
import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";

import { applyFinish } from "../src/finishes.js";
import { kitOwnedResources } from "../src/kit-ownership.js";
import { makeKit, type Kit } from "../src/kitchen-parts.js";
import {
  createHeadlessCanvas,
  installHeadlessDocument,
} from "./support/headless-canvas.js";

beforeAll(() => {
  installHeadlessDocument();
});

/** A fresh kit per case, because every claim here is about **how much one kit retains** and a kit
 *  shared across cases would carry the previous case's drag into this one's count. */
function freshKit(): Kit {
  return makeKit({ createCanvas: createHeadlessCanvas });
}

function makeFront(kit: Kit): THREE.Mesh {
  const front = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), kit.M.door);
  front.name = "door_front";
  return front;
}

function colourOf(mesh: THREE.Mesh): string {
  const material = mesh.material as THREE.MeshStandardMaterial;
  return `#${material.color.getHexString()}`;
}

/** One drag, as the picker delivers it: distinct six-digit hexes, three times as many as the
 *  ceiling, so eviction has to have happened twice over before the last one arrives. */
const DRAG_LENGTH = MAX_PLACEMENTS * 3;

/** Outside `DRAG_LENGTH`'s range on purpose — the drag must never re-ask for it and refresh it. */
const BEFORE_THE_DRAG = "#ffffff";

function draggedColours(): readonly string[] {
  return Array.from(
    { length: DRAG_LENGTH },
    (_unused, index) => `#${(index + 1).toString(16).padStart(6, "0")}`,
  );
}

function dragAcross(kit: Kit, front: THREE.Mesh): void {
  for (const colour of draggedColours()) {
    applyFinish([front], kit.M, freeColourFinish(colour));
  }
}

describe("one drag of the RAL picker cannot grow a kit without limit", () => {
  it("asks for more distinct colours than the ceiling, so the cases below are not vacuous", () => {
    expect(new Set(draggedColours()).size).toBe(DRAG_LENGTH);
    expect(DRAG_LENGTH).toBeGreaterThan(MAX_PLACEMENTS);
  });

  it("retains no more free-colour materials than a room could be wearing at once", () => {
    const kit = freshKit();
    const front = makeFront(kit);
    const beforeDrag = kitOwnedResources(kit.M).materials.size;

    dragAcross(kit, front);

    const minted = kitOwnedResources(kit.M).materials.size - beforeDrag;
    expect(minted).toBeLessThanOrEqual(MAX_PLACEMENTS);
    // Against the unbounded cache this reads 504: the whole drag, held until teardown.
    expect(minted).toBeLessThan(DRAG_LENGTH);
  });

  it("disposes what it drops, rather than dropping it out of the teardown's reach", () => {
    // Leaving the memo also leaves `kitOwnedResources`, so if eviction did not dispose, nothing
    // ever would — the bound would have moved the leak instead of closing it.
    const kit = freshKit();
    const front = makeFront(kit);
    applyFinish([front], kit.M, freeColourFinish(BEFORE_THE_DRAG));
    const dropped = front.material as THREE.Material;
    let wasDisposed = false;
    dropped.addEventListener("dispose", () => {
      wasDisposed = true;
    });

    dragAcross(kit, front);

    expect(wasDisposed).toBe(true);
    expect(kitOwnedResources(kit.M).materials.has(dropped)).toBe(false);
  });
});

describe("the ceiling costs the customer nothing they can see", () => {
  it("paints the colour the drag ended on, which is the one that was chosen", () => {
    const kit = freshKit();
    const front = makeFront(kit);

    dragAcross(kit, front);
    const committed = "#8d9a84";
    applyFinish([front], kit.M, freeColourFinish(committed));

    expect(colourOf(front)).toBe(committed);
  });

  it("repaints a colour it had dropped, by rebuilding it", () => {
    // Eviction is a cache miss and never a refusal: coming back to a colour the drag passed through
    // must paint it, not paint whatever the memo still held.
    const kit = freshKit();
    const front = makeFront(kit);
    applyFinish([front], kit.M, freeColourFinish(BEFORE_THE_DRAG));

    dragAcross(kit, front);
    applyFinish([front], kit.M, freeColourFinish(BEFORE_THE_DRAG));

    expect(colourOf(front)).toBe(BEFORE_THE_DRAG);
  });

  it("never drops a declared decor, whatever the picker is doing", () => {
    // The palette half of the cache is the one the header's original hazard is about, and its key
    // space is closed. A drag must not be able to evict it and start cloning per re-sign again.
    const kit = freshKit();
    const front = makeFront(kit);
    applyFinish([front], kit.M, paletteFinish("pal.stejar-bardolino"));
    const decor = front.material as THREE.Material;

    dragAcross(kit, front);
    applyFinish([front], kit.M, paletteFinish("pal.stejar-bardolino"));

    expect(front.material).toBe(decor);
    expect(kitOwnedResources(kit.M).materials.has(decor)).toBe(true);
  });
});
