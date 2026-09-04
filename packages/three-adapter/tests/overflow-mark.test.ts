// ADR 0065's mark, and everything about it that is decidable without a GPU: that it is an object of
// its own rather than a mutation of the shared kit materials, that it covers the body it marks and
// only that body, that it cannot be raycast, that it composes with the selection highlight instead
// of competing with it, and that disposing it releases everything it owns.
//
// The one thing this file cannot decide is whether a customer can see it, which is what wave 6M's
// visual verification is for.
import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";

import { buildCatalogBody } from "../src/catalog-bodies.js";
import { makeKit, type Kit } from "../src/kitchen-parts.js";
import {
  buildOverflowMark,
  disposeOverflowMark,
  OVERFLOW_MARK_COLOR,
  OVERFLOW_MARK_OPACITY,
} from "../src/overflow-mark.js";
import {
  buildSelectionOutline,
  SELECTION_HIGHLIGHT_COLOR,
} from "../src/selection-outline.js";
import { isMesh } from "../src/three-guards.js";
import { NOOP_RAYCAST } from "../src/void-mesh.js";
import {
  createHeadlessCanvas,
  installHeadlessDocument,
} from "./support/headless-canvas.js";

/** `overflow-mark.ts`'s outward margin, restated here so a change to it has to be made twice on
 *  purpose rather than once by accident. */
const MARK_MARGIN_M = 0.002;

/** `apps/web/tests/e2e/editor-rail.desktop.e2e.spec.ts` counts a selection pixel as one within this
 *  Euclidean RGB distance of `SELECTION_HIGHLIGHT_COLOR`. A mark inside that ball would be counted
 *  as a highlight by the spec that gates the selection being visible at all. */
const SELECTION_PIXEL_TOLERANCE = 60;

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

function rgbOf(hex: number): [number, number, number] {
  return [(hex >> 16) & 0xff, (hex >> 8) & 0xff, hex & 0xff];
}

function rgbDistance(left: number, right: number): number {
  const [leftRed, leftGreen, leftBlue] = rgbOf(left);
  const [rightRed, rightGreen, rightBlue] = rgbOf(right);
  return Math.hypot(
    leftRed - rightRed,
    leftGreen - rightGreen,
    leftBlue - rightBlue,
  );
}

describe("the mark's colour is its own and cannot be read as the selection's", () => {
  it("is a different value from the selection highlight", () => {
    expect(OVERFLOW_MARK_COLOR).not.toBe(SELECTION_HIGHLIGHT_COLOR);
  });

  it("stands outside the ball the desktop e2e counts selection pixels in", () => {
    // The measured number is recorded rather than merely compared, so a later reader can see how
    // much room the two colours have before the pixel counter starts confusing them.
    const distance = rgbDistance(
      OVERFLOW_MARK_COLOR,
      SELECTION_HIGHLIGHT_COLOR,
    );

    expect(distance).toBeGreaterThan(SELECTION_PIXEL_TOLERANCE);
    expect(Math.round(distance)).toBe(90);
  });

  it("stays red rather than drifting into the void meshes' blue", () => {
    // `pixels.ts`'s other test counts a void's translucent fill as "blue by at least 25 more than
    // red". A mark that satisfied it would be counted as an empty slot.
    const [red, , blue] = rgbOf(OVERFLOW_MARK_COLOR);

    expect(red).toBeGreaterThan(blue);
  });
});

describe("the mark is an object of its own", () => {
  it("shares no material with the body it marks", () => {
    const body = makeBody();
    const bodyMaterials = new Set<THREE.Material>();
    body.traverse((node) => {
      if (isMesh(node)) bodyMaterials.add(node.material as THREE.Material);
    });

    const { wash } = buildOverflowMark({
      target: body,
      parent: body.parent ?? new THREE.Group(),
    });

    expect(bodyMaterials.size).toBeGreaterThan(0);
    expect(bodyMaterials.has(wash.material as THREE.Material)).toBe(false);
  });

  it("leaves every material on the body it marks untouched", () => {
    // The defect the object form exists to prevent: bodies in this kit share `KitMaterials`
    // instances, so a recoloured material would recolour every body drawn with it.
    const body = makeBody();
    const before: number[] = [];
    body.traverse((node) => {
      if (isMesh(node))
        before.push(
          (node.material as THREE.MeshStandardMaterial).color.getHex(),
        );
    });

    buildOverflowMark({ target: body, parent: new THREE.Group() });

    const after: number[] = [];
    body.traverse((node) => {
      if (isMesh(node))
        after.push(
          (node.material as THREE.MeshStandardMaterial).color.getHex(),
        );
    });
    expect(after).toEqual(before);
  });

  it("paints the wash in the mark's colour, translucent and untone-mapped", () => {
    const { wash } = buildOverflowMark({
      target: makeBody(),
      parent: new THREE.Group(),
    });
    const material = wash.material as THREE.MeshBasicMaterial;

    expect(material.color.getHex()).toBe(OVERFLOW_MARK_COLOR);
    expect(material.opacity).toBe(OVERFLOW_MARK_OPACITY);
    expect(material.transparent).toBe(true);
    // The scene is ACES tone-mapped; an interface colour that goes through it is not the colour that
    // was chosen (`overflow-mark.ts`).
    expect(material.toneMapped).toBe(false);
  });

  it("draws front faces only, so no pixel takes the wash twice", () => {
    const { wash } = buildOverflowMark({
      target: makeBody(),
      parent: new THREE.Group(),
    });
    const material = wash.material as THREE.MeshBasicMaterial;

    expect(material.side).toBe(THREE.FrontSide);
    expect(material.depthWrite).toBe(false);
    // Depth-tested on purpose: a wash drawn through the geometry in front of it would tint whatever
    // stands between the camera and the marked body, and so mark a cabinet that fits.
    expect(material.depthTest).toBe(true);
  });
});

describe("the mark covers the body it marks", () => {
  it("wraps the body's own extent, plus the margin that keeps it off the chamfer", () => {
    const body = makeBody();
    const bodyBounds = new THREE.Box3().setFromObject(body);
    const bodySize = bodyBounds.getSize(new THREE.Vector3());

    const { group, wash } = buildOverflowMark({ target: body, parent: body });
    group.updateMatrixWorld(true);
    const markSize = new THREE.Box3()
      .setFromObject(wash)
      .getSize(new THREE.Vector3());

    for (const axis of ["x", "y", "z"] as const) {
      expect(markSize[axis]).toBeCloseTo(bodySize[axis] + 2 * MARK_MARGIN_M, 5);
    }
  });

  it("lands on the body through whatever transform its parent carries", () => {
    // The mark is mounted on the room, not on the body, so its transform has to be expressed
    // relative to that parent — the same rule the selection outline follows.
    const room = new THREE.Group();
    room.position.set(1.5, 0, -0.75);
    room.scale.setScalar(0.8);
    const body = makeBody();
    body.position.set(2.2, 0, 0.3);
    room.add(body);
    room.updateMatrixWorld(true);

    const { group, wash } = buildOverflowMark({ target: body, parent: room });
    room.add(group);
    room.updateMatrixWorld(true);

    const bodyCentre = new THREE.Box3()
      .setFromObject(body)
      .getCenter(new THREE.Vector3());
    const markCentre = new THREE.Box3()
      .setFromObject(wash)
      .getCenter(new THREE.Vector3());
    expect(markCentre.distanceTo(bodyCentre)).toBeLessThan(1e-6);
  });

  it("ignores a hidden mesh, so it does not stand proud of the body", () => {
    // §6.5 builds the push-to-open handles and hides them. A hull grown to reach one would cover a
    // strip of the neighbour that fits.
    const body = makeBody();
    const visibleOnly = new THREE.Box3().setFromObject(body);

    const hidden = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.1, 0.1),
      new THREE.MeshBasicMaterial(),
    );
    hidden.position.set(0, 3, 0);
    hidden.visible = false;
    body.add(hidden);
    body.updateMatrixWorld(true);

    const { group, wash } = buildOverflowMark({ target: body, parent: body });
    group.updateMatrixWorld(true);
    const markBounds = new THREE.Box3().setFromObject(wash);

    expect(markBounds.max.y).toBeLessThan(visibleOnly.max.y + 0.01);
  });
});

describe("the mark changes nothing about the body it marks", () => {
  it("installs the exact no-op raycast function, so it cannot steal the tap that selects", () => {
    // ADR 0065: a marked body "stays exactly where it is and stays editable". The wash sits in front
    // of the fronts the customer taps.
    const { wash } = buildOverflowMark({
      target: makeBody(),
      parent: new THREE.Group(),
    });

    /* eslint-disable-next-line @typescript-eslint/unbound-method -- identity check, never called unbound */
    expect(wash.raycast).toBe(NOOP_RAYCAST);
  });

  it("does not move, resize, hide or reparent the body", () => {
    const room = new THREE.Group();
    const body = makeBody();
    body.position.set(2.2, 0, 0.3);
    room.add(body);
    room.updateMatrixWorld(true);
    const before = new THREE.Box3().setFromObject(body).clone();
    const childCount = body.children.length;

    room.add(buildOverflowMark({ target: body, parent: room }).group);
    room.updateMatrixWorld(true);

    const after = new THREE.Box3().setFromObject(body);
    expect(after.min.toArray()).toEqual(before.min.toArray());
    expect(after.max.toArray()).toEqual(before.max.toArray());
    expect(body.visible).toBe(true);
    expect(body.parent).toBe(room);
    expect(body.children.length).toBe(childCount);
  });
});

describe("the mark and the selection highlight compose", () => {
  it("mounts both on one body, each keeping its own colour", () => {
    const room = new THREE.Group();
    const body = makeBody();
    room.add(body);
    room.updateMatrixWorld(true);

    const mark = buildOverflowMark({ target: body, parent: room });
    const outline = buildSelectionOutline({
      target: body,
      parent: room,
      kind: "placement",
    });
    room.add(mark.group, outline.group);

    expect(room.children).toContain(mark.group);
    expect(room.children).toContain(outline.group);
    expect((mark.wash.material as THREE.MeshBasicMaterial).color.getHex()).toBe(
      OVERFLOW_MARK_COLOR,
    );
    expect(outline.visibleLine.material.color.getHex()).toBe(
      SELECTION_HIGHLIGHT_COLOR,
    );
  });

  it("draws the wash before both outline passes, so the outline is never buried under it", () => {
    const room = new THREE.Group();
    const body = makeBody();
    room.add(body);
    room.updateMatrixWorld(true);

    const { wash } = buildOverflowMark({ target: body, parent: room });
    const { visibleLine, occludedLine } = buildSelectionOutline({
      target: body,
      parent: room,
      kind: "placement",
    });

    expect(wash.renderOrder).toBeLessThan(occludedLine.renderOrder);
    expect(wash.renderOrder).toBeLessThan(visibleLine.renderOrder);
  });
});

describe("disposing a mark releases everything it owns", () => {
  it("disposes its geometry and its material", () => {
    const { group, wash } = buildOverflowMark({
      target: makeBody(),
      parent: new THREE.Group(),
    });
    let geometryDisposals = 0;
    let materialDisposals = 0;
    wash.geometry.addEventListener("dispose", () => {
      geometryDisposals += 1;
    });
    (wash.material as THREE.Material).addEventListener("dispose", () => {
      materialDisposals += 1;
    });

    disposeOverflowMark(group);

    expect(geometryDisposals).toBe(1);
    expect(materialDisposals).toBe(1);
  });
});
