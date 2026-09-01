// Adversarial QA for M5B wave 5B8 / ADR 0048, geometry half.
//
// The wave's own suite (`tests/pantry-resize.test.ts`) measures the built tree, which is the right
// instrument. What it does not do is **falsify the claim its criterion 5 is written to defend**: a
// `tallPantry` that built the shipped 600 mm group and set `group.scale.x = widthM / 0.6` passes
// every assertion in that file and every one of the 1081 tests in this package — measured, by
// mutating the builder and running the suite. A scaled group's world boxes are exactly the right
// width, so a test that only reads spans cannot tell it from a parameterised body.
//
// What separates them is everything in the cabinet that is **not** a function of the width: the
// 4 mm shadow gap between two leaves, the 2 mm the plinth is inset per side, the 18 mm carcass
// side, the 12 mm handle bar. A scale multiplies those; a builder does not. So this file asserts
// the fixed-size features alongside the width-following ones, which is `product-invariants.md`'s
// own rule for a parameterised body.
import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";

import { deriveDoorCount } from "@lemnaria/configurator-domain";

import { buildCatalogBody } from "../src/catalog-bodies.js";
import { makeKit, type Kit } from "../src/kitchen-parts.js";
import {
  createHeadlessCanvas,
  installHeadlessDocument,
} from "./support/headless-canvas.js";

const COLUMN_HEIGHT_M = 2.2;
const COLUMN_DEPTH_M = 0.56;

/** ADR 0048's bound at the 50 mm step a customer reaches, plus the two widths either side of ADR
 *  0035 decision 4's threshold and the two the domain refuses — the builder is asked about those
 *  last two because `deriveDoorCount` answers for them and the leaf layout must agree. */
const BOUND_WIDTHS_M = [
  0.4, 0.45, 0.499, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8,
] as const;

/** `kitchen-parts.ts`' own literals, restated here as the **fixed** sizes they are. Each is a
 *  constant of the cabinet, not a proportion of it, so each is a scale detector. */
const SHADOW_GAP_M = 0.004;
const PLINTH_INSET_PER_SIDE_M = 0.002;
const CARCASS_BACK_INSET_PER_SIDE_M = 0.018;
const FRONT_LINER_INSET_PER_SIDE_M = 0.002;

let kit: Kit;

beforeAll(() => {
  installHeadlessDocument();
  kit = makeKit({ createCanvas: createHeadlessCanvas });
});

interface NamedBox {
  readonly name: string;
  readonly box: THREE.Box3;
}

function pantryAt(widthM: number): THREE.Group {
  return buildCatalogBody(kit, "tall-pantry", {
    widthM,
    heightM: COLUMN_HEIGHT_M,
    depthM: COLUMN_DEPTH_M,
  });
}

function meshBoxes(group: THREE.Group): NamedBox[] {
  group.updateWorldMatrix(true, true);
  const boxes: NamedBox[] = [];
  group.traverse((node) => {
    if (node instanceof THREE.Mesh) {
      boxes.push({
        name: node.name,
        box: new THREE.Box3().setFromObject(node),
      });
    }
  });
  return boxes;
}

function boxesNamed(group: THREE.Group, name: string): THREE.Box3[] {
  return meshBoxes(group)
    .filter((entry) => entry.name === name)
    .map((entry) => entry.box);
}

function spanX(box: THREE.Box3): number {
  return box.max.x - box.min.x;
}

/** The door leaves of one band, left to right. A pantry stacks two bands, so a band is picked by
 *  its top edge — the leaves that share a `max.y`. */
function leavesOfTopBand(group: THREE.Group): THREE.Box3[] {
  const leaves = boxesNamed(group, "door_front");
  const topY = Math.max(...leaves.map((box) => box.max.y));
  return leaves
    .filter((box) => Math.abs(box.max.y - topY) < 1e-9)
    .sort((left, right) => left.min.x - right.min.x);
}

describe("QA 5B8 — every part is measured against the width, at both ends of the bound", () => {
  // `pantry-resize.test.ts` asserts each mesh lies **inside** ±width/2, which is true of a stale
  // 600 mm part in an 800 mm cabinet. These are equalities, so a part that failed to follow the
  // width fails at every width above 600 as well as below it.
  it.each(BOUND_WIDTHS_M)(
    "gives the carcass shell exactly %s m of span",
    (widthM) => {
      const [shell] = boxesNamed(pantryAt(widthM), "carcass_shell");

      expect(shell).toBeDefined();
      expect(shell && spanX(shell)).toBeCloseTo(widthM, 6);
    },
  );

  it.each(BOUND_WIDTHS_M)(
    "insets the plinth by a fixed 2 mm per side at %s m, never a proportion",
    (widthM) => {
      const [plinth] = boxesNamed(pantryAt(widthM), "plinth");

      expect(plinth).toBeDefined();
      expect(plinth && spanX(plinth)).toBeCloseTo(
        widthM - 2 * PLINTH_INSET_PER_SIDE_M,
        6,
      );
    },
  );

  it.each(BOUND_WIDTHS_M)(
    "insets the carcass back by a fixed 18 mm per side at %s m",
    (widthM) => {
      const [back] = boxesNamed(pantryAt(widthM), "carcass_back");

      expect(back).toBeDefined();
      expect(back && spanX(back)).toBeCloseTo(
        widthM - 2 * CARCASS_BACK_INSET_PER_SIDE_M,
        6,
      );
    },
  );

  it.each(BOUND_WIDTHS_M)(
    "insets the front liner by a fixed 2 mm per side at %s m",
    (widthM) => {
      const [liner] = boxesNamed(pantryAt(widthM), "front_liner");

      expect(liner).toBeDefined();
      expect(liner && spanX(liner)).toBeCloseTo(
        widthM - 2 * FRONT_LINER_INSET_PER_SIDE_M,
        6,
      );
    },
  );

  // The handle is a 12 mm steel bar on a 400 mm cabinet and a 12 mm steel bar on an 800 mm one.
  // Nothing about the cabinet's width reaches it — which is exactly why a scaled group cannot
  // reproduce it.
  it("keeps the handle bar the same thickness at every width", () => {
    const thicknesses = BOUND_WIDTHS_M.map((widthM) => {
      const [bar] = boxesNamed(pantryAt(widthM), "handle_bar");
      expect(bar).toBeDefined();
      return Math.round((bar ? spanX(bar) : 0) * 1e9);
    });

    expect(new Set(thicknesses).size).toBe(1);
  });
});

describe("QA 5B8 — the two leaves of a band, at every width that has two", () => {
  const TWO_DOOR_WIDTHS_M = BOUND_WIDTHS_M.filter((widthM) => widthM >= 0.5);

  it.each(TWO_DOOR_WIDTHS_M)(
    "leaves exactly one 4 mm shadow gap between them at %s m",
    (widthM) => {
      const [left, right] = leavesOfTopBand(pantryAt(widthM));

      expect(left).toBeDefined();
      expect(right).toBeDefined();
      if (!left || !right) return;
      expect(right.min.x - left.max.x).toBeCloseTo(SHADOW_GAP_M, 6);
    },
  );

  it.each(TWO_DOOR_WIDTHS_M)(
    "cuts the two leaves equally at %s m",
    (widthM) => {
      const [left, right] = leavesOfTopBand(pantryAt(widthM));

      expect(left).toBeDefined();
      expect(right).toBeDefined();
      if (!left || !right) return;
      expect(spanX(left)).toBeCloseTo(spanX(right), 9);
    },
  );

  // Anti-invariant: no leaf may stand outside the carcass it hangs on, at any width.
  it.each(BOUND_WIDTHS_M)(
    "keeps every leaf inside the carcass at %s m",
    (widthM) => {
      const group = pantryAt(widthM);
      const [shell] = boxesNamed(group, "carcass_shell");

      expect(shell).toBeDefined();
      if (!shell) return;
      for (const leaf of boxesNamed(group, "door_front")) {
        expect(leaf.min.x).toBeGreaterThanOrEqual(shell.min.x - 1e-9);
        expect(leaf.max.x).toBeLessThanOrEqual(shell.max.x + 1e-9);
        // A door is in front of the carcass, never inside it (§6.5's front assembly).
        expect(leaf.min.z).toBeGreaterThanOrEqual(shell.max.z - 1e-9);
      }
    },
  );

  // The stacked bands must not overlap each other either — the pantry is the one insertable body
  // with two door bands, so this is its own case rather than a general one.
  it.each(BOUND_WIDTHS_M)(
    "stacks the two bands clear of each other at %s m",
    (widthM) => {
      const bands = new Map<number, THREE.Box3[]>();
      for (const leaf of boxesNamed(pantryAt(widthM), "door_front")) {
        const key = Math.round(leaf.max.y * 1e6);
        bands.set(key, [...(bands.get(key) ?? []), leaf]);
      }
      const ordered = [...bands.entries()].sort(([a], [b]) => a - b);

      expect(ordered).toHaveLength(2);
      const [lower, upper] = ordered;
      const lowerTop = Math.max(...(lower?.[1] ?? []).map((box) => box.max.y));
      const upperBottom = Math.min(
        ...(upper?.[1] ?? []).map((box) => box.min.y),
      );
      expect(upperBottom).toBeGreaterThanOrEqual(lowerTop - 1e-9);
    },
  );
});

describe("QA 5B8 — the door count comes off the geometry, at the bound's edges", () => {
  // 399 and 801 are refused by the domain, so the builder is never asked for them in the product.
  // It is asked here because `deriveDoorCount` answers for every width and the two must not part
  // company at the edge — the failure mode is a threshold copied into the builder.
  it.each([399, 400, 499, 500, 600, 800, 801])(
    "stands %s mm worth of leaves abreast",
    (widthMm) => {
      const group = pantryAt(widthMm / 1000);
      const centres = new Set(
        boxesNamed(group, "door_front").map((box) =>
          Math.round(((box.min.x + box.max.x) / 2) * 1e6),
        ),
      );

      expect([widthMm, centres.size]).toEqual([
        widthMm,
        deriveDoorCount(widthMm),
      ]);
    },
  );

  // The other half of the same fact: the leaves cover the front at every width, so a "one door"
  // pantry is one full-width door rather than a two-door body missing a leaf.
  it.each(BOUND_WIDTHS_M)(
    "covers the front to within 6 mm at %s m",
    (widthM) => {
      const leaves = leavesOfTopBand(pantryAt(widthM));
      const covered =
        Math.max(...leaves.map((box) => box.max.x)) -
        Math.min(...leaves.map((box) => box.min.x));

      expect(widthM - covered).toBeLessThanOrEqual(0.006 + 1e-6);
      expect(widthM - covered).toBeGreaterThanOrEqual(-1e-6);
    },
  );
});

describe("QA 5B8 — a narrower pantry is the same cabinet, part by part", () => {
  /** Every mesh name in the body with the set of vertical extents it occupies. Stronger than the
   *  wave's set of distinct horizontal lines in two ways: a part **dropped** at the narrow end is
   *  caught even when its y coincides with another part's, and a part that changed which family it
   *  belongs to is caught at all. */
  function verticalCensus(group: THREE.Group): Map<string, string[]> {
    const census = new Map<string, Set<string>>();
    for (const { name, box } of meshBoxes(group)) {
      const extent = [
        String(Math.round(box.min.y * 1e6)),
        String(Math.round(box.max.y * 1e6)),
      ].join("..");
      census.set(name, (census.get(name) ?? new Set()).add(extent));
    }
    return new Map(
      [...census].map(([name, extents]) => [name, [...extents].sort()]),
    );
  }

  it.each(BOUND_WIDTHS_M)(
    "puts every named part at the same heights at %s m as at 600",
    (widthM) => {
      const built = verticalCensus(pantryAt(widthM));
      const shipped = verticalCensus(pantryAt(0.6));

      expect([...built.keys()].sort()).toEqual([...shipped.keys()].sort());
      for (const [name, extents] of shipped) {
        expect([widthM, name, built.get(name)]).toEqual([
          widthM,
          name,
          extents,
        ]);
      }
    },
  );

  // ADR 0048 states the height and the depth are unchanged "at every width". Asserted over the
  // whole bound rather than the three widths the criterion names.
  it.each(BOUND_WIDTHS_M)(
    "stands 2200 mm tall and 560 mm deep at %s m",
    (widthM) => {
      const box = new THREE.Box3().setFromObject(pantryAt(widthM));
      const reference = new THREE.Box3().setFromObject(pantryAt(0.6));

      expect(box.min.y).toBeCloseTo(0, 6);
      expect(box.max.y - box.min.y).toBeCloseTo(COLUMN_HEIGHT_M, 6);
      expect(box.min.z).toBeCloseTo(reference.min.z, 6);
      expect(box.max.z).toBeCloseTo(reference.max.z, 6);
    },
  );
});
