// The selection highlight the customer is meant to see. What is asserted here is everything about
// it that is decidable without a GPU: that it traces the body's **own** edges rather than a box
// around it, that a hidden mesh contributes none, that it lands on the target through whatever
// transform its parent carries, that a void's outline sits on the void's frame and is dashed while
// a body's is solid, that no pass can be raycast (§6.1), and that disposing it releases everything
// it owns.
//
// Since wave 6V it also carries the one part of the *contrast* claim that is decidable without a
// GPU: the outline is two colours, and the bound below says no single flat front can be near both.
//
// What is *not* decidable here is whether a customer can see it, which is why
// `apps/web/tests/e2e/editor-rail.desktop.e2e.spec.ts` counts its pixels in a real render.
import type { VoidRecord } from "@lemnaria/configurator-domain";
import * as THREE from "three";
import { beforeAll, describe, expect, it, vi, type MockInstance } from "vitest";

import { buildCatalogBody } from "../src/catalog-bodies.js";
import { setHandlesVisible } from "../src/decomposed-bodies.js";
import { makeKit, type Kit } from "../src/kitchen-parts.js";
import {
  buildSelectionOutline,
  disposeSelectionOutline,
  SELECTION_HIGHLIGHT_COLOR,
  SELECTION_OUTLINE_CASING_COLOR,
  SELECTION_OUTLINE_CASING_WIDTH_PX,
  SELECTION_OUTLINE_WIDTH_PX,
} from "../src/selection-outline.js";
import { isMesh } from "../src/three-guards.js";
import { buildVoidMesh, NOOP_RAYCAST } from "../src/void-mesh.js";
import {
  createHeadlessCanvas,
  installHeadlessDocument,
} from "./support/headless-canvas.js";

const BODY_MARGIN_M = 0.003;
const VOID_MARGIN_M = 0.014;
/** A `BoxHelper` draws exactly twelve segments. Anything that traces a two-door base cabinet's own
 *  carcass, fronts and handles draws very many more, so this is the number that separates "the
 *  body's form" from "a box around it". */
const BOUNDING_BOX_SEGMENTS = 12;

/** `editor-rail.desktop.e2e.spec.ts`'s `HIGHLIGHT_TOLERANCE`: the radius inside which that spec's
 *  legacy colour counter treats two colours as the same colour. Restated here because it is the
 *  yardstick the casing's bound is measured against, not a value this file owns. */
const HIGHLIGHT_TOLERANCE = 60;

type Rgb = readonly [number, number, number];

function rgbOf(packed: number): Rgb {
  return [(packed >> 16) & 0xff, (packed >> 8) & 0xff, packed & 0xff];
}

function distanceBetween(one: Rgb, other: Rgb): number {
  return Math.hypot(
    one[0] - other[0],
    one[1] - other[1],
    one[2] - other[2],
  );
}

let kit: Kit;

beforeAll(() => {
  installHeadlessDocument();
  kit = makeKit({ createCanvas: createHeadlessCanvas });
});

function makeBody(): THREE.Group {
  return buildCatalogBody(kit, "base-cabinet", {
    widthM: 0.6,
    heightM: 0.86,
    depthM: 0.58,
  });
}

function makeVoidRecord(overrides: Partial<VoidRecord> = {}): VoidRecord {
  return {
    id: "A|1.30:v0:0.00",
    col: "A|1.30",
    wall: "A",
    x: 1.3,
    z: 0.3,
    ry: 0,
    w: 0.6,
    d: 0.56,
    y0: 0,
    h: 0.86,
    spanY0: 0,
    spanH: 0.86,
    ...overrides,
  };
}

function segmentCount(line: { geometry: THREE.BufferGeometry }): number {
  const starts = line.geometry.getAttribute("instanceStart");
  return starts.count;
}

function localBoundsOf(line: { geometry: THREE.BufferGeometry }): THREE.Box3 {
  const box = new THREE.Box3();
  const point = new THREE.Vector3();
  for (const name of ["instanceStart", "instanceEnd"]) {
    const attribute = line.geometry.getAttribute(name);
    for (let index = 0; index < attribute.count; index += 1) {
      box.expandByPoint(point.fromBufferAttribute(attribute, index));
    }
  }
  return box;
}

describe("buildSelectionOutline", () => {
  it("traces the body's own edges rather than its bounding box", () => {
    const body = makeBody();
    const parent = new THREE.Group();

    const { visibleLine } = buildSelectionOutline({
      target: body,
      parent,
      kind: "placement",
    });

    expect(segmentCount(visibleLine)).toBeGreaterThan(
      BOUNDING_BOX_SEGMENTS * 4,
    );
  });

  it("draws the depth-ignoring pass as a box locator and nothing more", () => {
    const { occludedLine, visibleLine } = buildSelectionOutline({
      target: makeBody(),
      parent: new THREE.Group(),
      kind: "placement",
    });

    // A pass that ignores depth draws through the body it traces. Given the full form it draws
    // every interior edge over the fronts — a red cage, measured on the real render — so it gets
    // the twelve edges of the box and the solid pass keeps the form.
    expect(segmentCount(occludedLine)).toBe(BOUNDING_BOX_SEGMENTS);
    expect(segmentCount(visibleLine)).toBeGreaterThan(
      segmentCount(occludedLine),
    );
  });

  it("grows the outline by the body margin and no further", () => {
    const body = makeBody();
    body.updateWorldMatrix(true, true);
    const bodyBox = new THREE.Box3().setFromObject(body);

    const { visibleLine } = buildSelectionOutline({
      target: body,
      parent: new THREE.Group(),
      kind: "placement",
    });
    const outlineBox = localBoundsOf(visibleLine);

    const grown = outlineBox.getSize(new THREE.Vector3());
    const original = bodyBox.getSize(new THREE.Vector3());
    expect(grown.x - original.x).toBeCloseTo(2 * BODY_MARGIN_M, 6);
    expect(grown.y - original.y).toBeCloseTo(2 * BODY_MARGIN_M, 6);
    expect(grown.z - original.z).toBeCloseTo(2 * BODY_MARGIN_M, 6);
  });

  it("leaves a hidden mesh out of the outline", () => {
    const withHandles = makeBody();
    const withoutHandles = makeBody();
    setHandlesVisible(withoutHandles, false);

    const shown = buildSelectionOutline({
      target: withHandles,
      parent: new THREE.Group(),
      kind: "placement",
    });
    const hidden = buildSelectionOutline({
      target: withoutHandles,
      parent: new THREE.Group(),
      kind: "placement",
    });

    // §6.5's push-to-open row builds its handles and hides them; an outline that drew them anyway
    // would draw a bar the customer cannot see on the body it is meant to identify.
    expect(segmentCount(hidden.visibleLine)).toBeLessThan(
      segmentCount(shown.visibleLine),
    );
  });

  it("lands on the target through the transforms between it and the parent", () => {
    const parent = new THREE.Group();
    parent.position.set(1.5, 0, -0.4);
    parent.rotation.y = Math.PI / 2;
    const mount = new THREE.Group();
    mount.position.set(2.1, 0.9, 0.3);
    mount.rotation.y = Math.PI / 4;
    const body = makeBody();
    mount.add(body);
    parent.add(mount);
    parent.updateWorldMatrix(true, true);

    const { group } = buildSelectionOutline({
      target: body,
      parent,
      kind: "placement",
    });
    parent.add(group);
    parent.updateWorldMatrix(true, true);

    const outlineOrigin = new THREE.Vector3().setFromMatrixPosition(
      group.matrixWorld,
    );
    const bodyOrigin = new THREE.Vector3().setFromMatrixPosition(
      body.matrixWorld,
    );
    expect(outlineOrigin.distanceTo(bodyOrigin)).toBeLessThan(1e-9);
  });

  it("draws two depth-tested passes and one that ignores depth, and the ghost is the faintest", () => {
    const { visibleLine, casingLine, occludedLine } = buildSelectionOutline({
      target: makeBody(),
      parent: new THREE.Group(),
      kind: "placement",
    });

    expect(visibleLine.material.depthTest).toBe(true);
    expect(casingLine.material.depthTest).toBe(true);
    expect(occludedLine.material.depthTest).toBe(false);
    // The occluded pass must stay behind the solid ones in the draw order, or the faint line would
    // paint over the crisp one on every pixel where the body is actually visible; and the casing
    // must stay behind the core, or the wider black line would swallow the red it exists to frame.
    expect(occludedLine.renderOrder).toBeLessThan(casingLine.renderOrder);
    expect(casingLine.renderOrder).toBeLessThan(visibleLine.renderOrder);
    expect(occludedLine.material.opacity).toBeLessThan(
      visibleLine.material.opacity,
    );
    expect(visibleLine.material.color.getHex()).toBe(SELECTION_HIGHLIGHT_COLOR);
    expect(occludedLine.material.color.getHex()).toBe(
      SELECTION_HIGHLIGHT_COLOR,
    );
    expect(casingLine.material.color.getHex()).toBe(
      SELECTION_OUTLINE_CASING_COLOR,
    );
    for (const material of [
      visibleLine.material,
      casingLine.material,
      occludedLine.material,
    ]) {
      // The scene is ACES tone-mapped; an interface colour that goes through it is not the colour
      // that was chosen (`selection-outline.ts`).
      expect(material.toneMapped).toBe(false);
    }
  });

  it("leaves the casing showing as a rim on both sides of the core", () => {
    const { visibleLine, casingLine } = buildSelectionOutline({
      target: makeBody(),
      parent: new THREE.Group(),
      kind: "placement",
    });

    // `LineSegments2` sizes its quads in **screen** pixels, so this difference is the rim in
    // pixels and it does not shrink with the body's distance from the camera. Two on each side.
    const rimPx =
      (casingLine.material.linewidth - visibleLine.material.linewidth) / 2;
    expect(rimPx).toBe(2);
    expect(casingLine.material.linewidth).toBe(SELECTION_OUTLINE_CASING_WIDTH_PX);
    expect(visibleLine.material.linewidth).toBe(SELECTION_OUTLINE_WIDTH_PX);
    // Same edges, one buffer: the casing traces the body's form rather than a box around it, for
    // the same reason the core does.
    expect(casingLine.geometry).toBe(visibleLine.geometry);
  });

  /**
   * **The product claim wave 6V exists for**, and it is a fact about the two constants rather than
   * about the fixture: MDF's RAL picker admits every six-digit hex (ADR 0078 decision 1), so the
   * front under the outline may be *any* colour in the cube. Swept over the whole cube at a stride
   * of 3, the nearest a single flat colour gets to both passes at once is bounded below.
   *
   * 60 is `editor-rail.desktop.e2e.spec.ts`'s `HIGHLIGHT_TOLERANCE` — the radius at which two
   * colours are considered the same colour by the instrument that used to count this outline. The
   * measured floor is far above it, which is what "a front cannot equal both" means numerically.
   */
  it("keeps at least one pass far from every colour a front can be painted", () => {
    const highlight = rgbOf(SELECTION_HIGHLIGHT_COLOR);
    const casing = rgbOf(SELECTION_OUTLINE_CASING_COLOR);

    let closestAnyFrontGetsToBoth = Number.POSITIVE_INFINITY;
    for (let red = 0; red < 256; red += 3)
      for (let green = 0; green < 256; green += 3)
        for (let blue = 0; blue < 256; blue += 3) {
          const front: Rgb = [red, green, blue];
          closestAnyFrontGetsToBoth = Math.min(
            closestAnyFrontGetsToBoth,
            Math.max(distanceBetween(front, highlight), distanceBetween(front, casing)),
          );
        }

    // The two constants are this far apart, and the triangle inequality then bounds every front:
    // a colour within `d` of both would put the two within `2d` of each other, so nothing can do
    // better than half the separation. The sweep's own floor is above that half because a stride
    // of 3 does not land on the midpoint — the lattice, not the geometry.
    const separation = distanceBetween(highlight, casing);
    expect(Math.round(separation * 10) / 10).toBe(242.5);
    expect(Math.round(closestAnyFrontGetsToBoth * 10) / 10).toBe(121.4);
    expect(closestAnyFrontGetsToBoth).toBeGreaterThanOrEqual(separation / 2);
    expect(closestAnyFrontGetsToBoth).toBeGreaterThan(HIGHLIGHT_TOLERANCE);
  });

  it("installs the exact no-op raycast function on all three passes", () => {
    const { visibleLine, casingLine, occludedLine } = buildSelectionOutline({
      target: makeBody(),
      parent: new THREE.Group(),
      kind: "placement",
    });

    // §6.1: the highlight must not become a target for the click that produced it — the same rule
    // the void's dashed outline has carried since M2, pinned on the same function reference.
    /* eslint-disable @typescript-eslint/unbound-method -- identity checks, never called unbound */
    expect(visibleLine.raycast).toBe(NOOP_RAYCAST);
    expect(casingLine.raycast).toBe(NOOP_RAYCAST);
    expect(occludedLine.raycast).toBe(NOOP_RAYCAST);
    /* eslint-enable @typescript-eslint/unbound-method */
  });

  it("draws a selected void dashed, on its frame, where a selected body is solid", () => {
    const voidRecord = makeVoidRecord();
    const { group: voidGroup } = buildVoidMesh(voidRecord);
    voidGroup.updateWorldMatrix(true, true);

    const outline = buildSelectionOutline({
      target: voidGroup,
      parent: new THREE.Group(),
      kind: "void",
    });
    const body = buildSelectionOutline({
      target: makeBody(),
      parent: new THREE.Group(),
      kind: "placement",
    });

    expect(outline.visibleLine.material.dashed).toBe(true);
    expect(body.visibleLine.material.dashed).toBe(false);
    // The casing keeps the same rhythm as the core it frames. A solid black casing under red
    // dashes would read as a solid outline, which is the language a *body* speaks.
    expect(outline.casingLine.material.dashed).toBe(true);
    expect(body.casingLine.material.dashed).toBe(false);
    // The void mesh is inset 14 mm; expanding by the same 14 mm puts the red on the frame itself,
    // clear of the blue dashes it would otherwise sit exactly on top of.
    const size = localBoundsOf(outline.visibleLine).getSize(
      new THREE.Vector3(),
    );
    expect(size.x).toBeCloseTo(voidRecord.w, 6);
    expect(size.y).toBeCloseTo(voidRecord.h, 6);
    expect(size.z).toBeCloseTo(voidRecord.d, 6);
    expect(VOID_MARGIN_M).toBeGreaterThan(BODY_MARGIN_M);
  });
});

describe("disposeSelectionOutline", () => {
  it("disposes every geometry and material in the outline exactly once", () => {
    const outline = buildSelectionOutline({
      target: makeBody(),
      parent: new THREE.Group(),
      kind: "placement",
    });
    // Deduplicated by identity: spying on the same method twice would leave the first spy blind,
    // and a shared geometry disposed twice is what `disposeSelectionOutline`'s `Set` prevents.
    const renderables = new Map<object, MockInstance>();
    outline.group.traverse((node) => {
      if (!isMesh(node)) return;
      const materials = Array.isArray(node.material)
        ? node.material
        : [node.material];
      for (const owned of [node.geometry, ...materials]) {
        if (!renderables.has(owned))
          renderables.set(owned, vi.spyOn(owned, "dispose"));
      }
    });
    // Two geometries — the form-following outline, shared by the core and its casing, and the box
    // locator — and one material per pass.
    expect(renderables.size).toBe(5);

    disposeSelectionOutline(outline.group);

    for (const spy of renderables.values())
      expect(spy).toHaveBeenCalledTimes(1);
  });
});
