// The selection highlight the customer is meant to see. What is asserted here is everything about
// it that is decidable without a GPU: that it traces the body's **own** edges rather than a box
// around it, that a hidden mesh contributes none, that it lands on the target through whatever
// transform its parent carries, that a void's outline sits on the void's frame and is dashed while
// a body's is solid, that neither pass can be raycast (§6.1), and that disposing it releases
// everything it owns.
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

  it("draws one depth-tested pass and one that ignores depth, both in the highlight colour", () => {
    const { visibleLine, occludedLine } = buildSelectionOutline({
      target: makeBody(),
      parent: new THREE.Group(),
      kind: "placement",
    });

    expect(visibleLine.material.depthTest).toBe(true);
    expect(occludedLine.material.depthTest).toBe(false);
    // The occluded pass must stay behind the solid one in the draw order, or the faint line would
    // paint over the crisp one on every pixel where the body is actually visible.
    expect(occludedLine.renderOrder).toBeLessThan(visibleLine.renderOrder);
    expect(occludedLine.material.opacity).toBeLessThan(
      visibleLine.material.opacity,
    );
    for (const material of [visibleLine.material, occludedLine.material]) {
      expect(material.color.getHex()).toBe(SELECTION_HIGHLIGHT_COLOR);
      // The scene is ACES tone-mapped; an interface colour that goes through it is not the colour
      // that was chosen (`selection-outline.ts`).
      expect(material.toneMapped).toBe(false);
    }
  });

  it("installs the exact no-op raycast function on both passes", () => {
    const { visibleLine, occludedLine } = buildSelectionOutline({
      target: makeBody(),
      parent: new THREE.Group(),
      kind: "placement",
    });

    // §6.1: the highlight must not become a target for the click that produced it — the same rule
    // the void's dashed outline has carried since M2, pinned on the same function reference.
    /* eslint-disable @typescript-eslint/unbound-method -- identity checks, never called unbound */
    expect(visibleLine.raycast).toBe(NOOP_RAYCAST);
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
    // Two geometries — the form-following outline and the box locator — and one material each.
    expect(renderables.size).toBe(4);

    disposeSelectionOutline(outline.group);

    for (const spy of renderables.values())
      expect(spy).toHaveBeenCalledTimes(1);
  });
});
