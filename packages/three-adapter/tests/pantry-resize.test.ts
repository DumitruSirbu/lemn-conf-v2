// M5B wave 5B8 (`docs/milestones/M5B-manual-ux-remediation.md`), ADR 0048: the pantry column is the
// one resizable column, and a narrower pantry is the **same cabinet** — same height, same shelf
// pitch, fewer things side by side.
//
// Every assertion here is a **measurement off the built tree**, never a restatement of the width
// handed to the builder. That is criterion 5's own wording, and it is what separates a
// parameterised body from a finished 600 mm group with a scale on it — which M3's Risks section
// names as the thing not to do and which would pass any check written against the arguments.
import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";

import { buildCatalogBody } from "../src/catalog-bodies.js";
import { makeKit, type Kit } from "../src/kitchen-parts.js";
import {
  createHeadlessCanvas,
  installHeadlessDocument,
} from "./support/headless-canvas.js";

/** M1's parity epsilon: these are exact criteria, not fits. */
const FLOAT_EPSILON_METRES = 1e-6;

const COLUMN_HEIGHT_M = 2.2;
const COLUMN_DEPTH_M = 0.56;

/** ADR 0048's bound, and the two widths either side of ADR 0035 decision 4's door threshold. */
const SWEPT_WIDTHS_M = [0.4, 0.45, 0.499, 0.5, 0.6, 0.7, 0.8] as const;

/** The three the criteria name explicitly — narrowest, the shipped 600, widest. */
const MEASURED_WIDTHS_M = [0.4, 0.6, 0.8] as const;

let kit: Kit;

beforeAll(() => {
  installHeadlessDocument();
  kit = makeKit({ createCanvas: createHeadlessCanvas });
});

function pantryAt(widthM: number): THREE.Group {
  return buildCatalogBody(kit, "tall-pantry", {
    widthM,
    heightM: COLUMN_HEIGHT_M,
    depthM: COLUMN_DEPTH_M,
  });
}

/** Every mesh in the built body, with the name it carries and the world box it occupies. Read
 *  through `updateWorldMatrix` because a `doorSlab` is a positioned group holding a mesh at a local
 *  offset — measuring the mesh's own geometry would miss the placement that is the whole question. */
function meshBoxes(group: THREE.Group): { name: string; box: THREE.Box3 }[] {
  group.updateWorldMatrix(true, true);
  const boxes: { name: string; box: THREE.Box3 }[] = [];
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

function widthOfWidest(group: THREE.Group): number {
  return Math.max(...meshBoxes(group).map(({ box }) => box.max.x - box.min.x));
}

/** What each mesh family must span, at a cabinet of this width, in metres. Every entry is the
 *  builder's own arithmetic read forward — `plinth` is 4 mm narrower than the carcass, the back
 *  panel sits 18 mm inside each side, a single door is 6 mm narrower than the opening and a pair
 *  splits `w − 9 mm` between them.
 *
 *  **Exact spans, not containment.** An earlier version of this file asserted only that every mesh
 *  lay inside ±width/2, and QA showed that a stale `plinth(0.6, …)` passes that at 600 and 800 and
 *  fails only at 400 — a 600 mm part inside an 800 mm cabinet is trivially "inside". */
function expectedSpansM(
  widthM: number,
  doors: number,
): Readonly<Record<string, number>> {
  return {
    carcass_shell: widthM,
    plinth: widthM - 0.004,
    front_liner: widthM - 0.004,
    carcass_back: widthM - 0.036,
    door_front: doors === 1 ? widthM - 0.006 : (widthM - 0.009) / 2,
  };
}

/** The features whose size is **fixed by the fitting and not by the cabinet** — a shadow gap, an
 *  inset, a handle bar. They are the same millimetres at 400 as at 800.
 *
 *  This is the property that separates a parameterised builder from a scaled one, and it is the
 *  reason it is asserted (QA on this wave). A `g.scale.x = widthM / 0.6` on a finished 600 mm group
 *  produces exactly the right overall width and exactly the right span for every family above — no
 *  bounds assertion can tell the two apart — but it multiplies every one of these by the same
 *  factor, turning a 4 mm gap into 5.33 mm at 800 and a 12 mm handle into 8 mm at 400. */
const FIXED_FEATURE_SIZES_M = {
  /** `GAP`: the shadow gap two leaves leave each other. */
  leafGap: 0.004,
  /** Per side, between the carcass edge and the plinth. */
  plinthInset: 0.002,
  /** Per side, between the carcass edge and the back panel. */
  backInset: 0.018,
  /** `barHandle`'s bar, across the x axis. */
  handleBar: 0.012,
} as const;

function spanX(box: THREE.Box3): number {
  return box.max.x - box.min.x;
}

describe("ADR 0048: every part of a resized pantry takes the new width", () => {
  // Criterion 5. The failure this catches is a body that resizes its carcass and keeps a 600 mm
  // door — or, worse, one that never resizes at all and reads correct because the test asked the
  // builder what it was told rather than what it made.
  it.each(MEASURED_WIDTHS_M)(
    "spans exactly its own arithmetic in every mesh family at %s m",
    (widthM) => {
      const boxes = meshBoxes(pantryAt(widthM));
      const expected = expectedSpansM(widthM, widthM < 0.5 ? 1 : 2);

      expect(boxes.length).toBeGreaterThan(0);
      for (const [family, span] of Object.entries(expected)) {
        const members = boxes.filter(({ name }) => name === family);
        expect(members.length, `no ${family} in the pantry`).toBeGreaterThan(0);
        for (const { box } of members) {
          expect(spanX(box), `${family} at ${String(widthM)} m`).toBeCloseTo(
            span,
            6,
          );
        }
      }

      // Nothing outside the table above may be wider than the cabinet either — the families are
      // named so a missing one fails loudly, and this is the catch-all behind them.
      for (const { name, box } of boxes) {
        expect(
          spanX(box),
          `${name} is wider than the cabinet`,
        ).toBeLessThanOrEqual(widthM + FLOAT_EPSILON_METRES);
      }

      // The shell's right face **is** the cabinet's edge, so it is the sharpest single statement
      // that the carcass followed the width rather than being centred inside it.
      const [shell] = boxes.filter(({ name }) => name === "carcass_shell");
      expect(shell?.box.max.x).toBeCloseTo(widthM / 2, 6);

      // ADR 0035 decision 4's threshold, read off the built body: two leaves abreast at 600 and
      // 800 and one at 400, across the pantry's two stacked bands — so four slabs and two. The
      // door count is not constant over this sweep, which is why criterion 5 needs it stated.
      expect(boxes.filter(({ name }) => name === "door_front")).toHaveLength(
        widthM < 0.5 ? 2 : 4,
      );
    },
  );

  it("builds three different trees at the three widths, so nothing is being scaled", () => {
    const spans = MEASURED_WIDTHS_M.map((widthM) =>
      widthOfWidest(pantryAt(widthM)),
    );

    expect(new Set(spans).size).toBe(MEASURED_WIDTHS_M.length);
  });
});

describe("ADR 0048: the fittings do not grow with the cabinet", () => {
  // The anti-scale guard, and the one criterion 5's span assertions cannot make on their own. Swept
  // across the whole bound rather than the three named widths, because a factor that is wrong is
  // wrong everywhere and a sweep says so at the first width it reaches.
  it.each(SWEPT_WIDTHS_M)(
    "keeps every handle bar 12 mm wide at %s m",
    (widthM) => {
      const bars = meshBoxes(pantryAt(widthM)).filter(
        ({ name }) => name === "handle_bar",
      );

      expect(bars.length).toBeGreaterThan(0);
      for (const { box } of bars) {
        expect(spanX(box)).toBeCloseTo(FIXED_FEATURE_SIZES_M.handleBar, 6);
      }
    },
  );

  it.each(SWEPT_WIDTHS_M)(
    "keeps the plinth and back-panel insets at %s m",
    (widthM) => {
      const boxes = meshBoxes(pantryAt(widthM));
      const [shell] = boxes.filter(({ name }) => name === "carcass_shell");
      const [plinth] = boxes.filter(({ name }) => name === "plinth");
      const [back] = boxes.filter(({ name }) => name === "carcass_back");
      if (!shell || !plinth || !back)
        throw new Error("pantry is missing a part");

      expect(plinth.box.min.x - shell.box.min.x).toBeCloseTo(
        FIXED_FEATURE_SIZES_M.plinthInset,
        6,
      );
      expect(shell.box.max.x - plinth.box.max.x).toBeCloseTo(
        FIXED_FEATURE_SIZES_M.plinthInset,
        6,
      );
      expect(back.box.min.x - shell.box.min.x).toBeCloseTo(
        FIXED_FEATURE_SIZES_M.backInset,
        6,
      );
    },
  );

  // The two-door widths only: a one-door pantry has no gap between leaves to hold constant, which
  // is why the sweep is filtered rather than written out — the filter states the reason.
  it.each(SWEPT_WIDTHS_M.filter((widthM) => widthM >= 0.5))(
    "keeps the 4 mm shadow gap between the two leaves at %s m",
    (widthM) => {
      const leaves = meshBoxes(pantryAt(widthM))
        .filter(({ name }) => name === "door_front")
        .sort((left, right) => left.box.min.x - right.box.min.x);

      expect(leaves).toHaveLength(4);
      // Two bands, each a left leaf and a right leaf; sorted by x, the gap to measure is between
      // the second and third entries of each band's pair. Measured off the widest opening between
      // any two adjacent leaves, which is that gap at every width.
      const gaps = leaves
        .slice(1)
        .map(({ box }, index) => box.min.x - (leaves[index]?.box.max.x ?? 0))
        .filter((gap) => gap > FLOAT_EPSILON_METRES);
      expect(gaps.length).toBeGreaterThan(0);
      for (const gap of gaps) {
        expect(gap).toBeCloseTo(FIXED_FEATURE_SIZES_M.leafGap, 6);
      }
    },
  );
});

describe("ADR 0048: a narrower pantry is the same cabinet, not a second product", () => {
  /** Every distinct horizontal line in the body — the y coordinates its boards and door bands sit
   *  at. This is criterion 6's "shelf pitch" made measurable: it must be one set at every width. */
  function horizontalLinesM(group: THREE.Group): number[] {
    const lines = new Set<number>();
    for (const { box } of meshBoxes(group)) {
      lines.add(Math.round(box.min.y * 1e6));
      lines.add(Math.round(box.max.y * 1e6));
    }
    return [...lines].sort((a, b) => a - b).map((mm) => mm / 1e6);
  }

  // Criterion 6, and the one the owner settled on 2026-09-01. A builder that re-pitched the bands
  // at 400 mm would pass every width assertion above and still be the wrong cabinet.
  it("puts every horizontal line at the same y at 400, 600 and 800 mm", () => {
    const [narrow, shipped, wide] = MEASURED_WIDTHS_M.map((widthM) =>
      horizontalLinesM(pantryAt(widthM)),
    );

    expect(narrow).toEqual(shipped);
    expect(wide).toEqual(shipped);
  });

  it.each(SWEPT_WIDTHS_M)("stands 2200 mm tall at %s m", (widthM) => {
    const box = new THREE.Box3().setFromObject(pantryAt(widthM));

    expect(box.max.y - box.min.y).toBeCloseTo(COLUMN_HEIGHT_M, 6);
    expect(box.min.y).toBeCloseTo(0, 6);
  });

  // ADR 0040's declared `occupiedDepth` is a catalogue number; what this asserts is the geometry
  // under it — the body finishes at the same z at every width, so the declaration stays true.
  it.each(SWEPT_WIDTHS_M)("finishes at the same depth at %s m", (widthM) => {
    const reference = new THREE.Box3().setFromObject(pantryAt(0.6));
    const box = new THREE.Box3().setFromObject(pantryAt(widthM));

    expect(box.min.z).toBeCloseTo(reference.min.z, 6);
    expect(box.max.z).toBeCloseTo(reference.max.z, 6);
  });
});

describe("ADR 0048: the seeded pantry does not move", () => {
  // Criterion 7's adapter half. `Builders['tall-pantry']()` is what `decomposed-bodies.ts` calls for
  // the seeded `tall-pantry-600`, and it now delegates to the factory — so this asserts the
  // delegation is at (0.6, 2) by comparing the two trees rather than by reading the call.
  it("builds the zero-argument builder and the 600 mm factory call identically", () => {
    const reference = meshBoxes(kit.builders["tall-pantry"]());
    const parameterised = meshBoxes(kit.make.tallPantry(0.6, 2));

    expect(parameterised.map(({ name }) => name)).toEqual(
      reference.map(({ name }) => name),
    );
    for (const [index, { name, box }] of reference.entries()) {
      const built = parameterised[index]?.box;
      expect(built?.min.distanceTo(box.min), name).toBeLessThanOrEqual(
        FLOAT_EPSILON_METRES,
      );
      expect(built?.max.distanceTo(box.max), name).toBeLessThanOrEqual(
        FLOAT_EPSILON_METRES,
      );
    }
  });
});
