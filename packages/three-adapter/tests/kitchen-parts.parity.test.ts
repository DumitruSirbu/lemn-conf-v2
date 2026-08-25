// Evidence 1 of the M1 fidelity gate (`docs/milestones/M1-scene-port.md`): structural parity.
//
// Every part is built twice — once by the unmodified reference library, once by the port — and the
// two trees are diffed exactly on mesh names and hierarchy, and at a 1e-6 m float epsilon on
// transforms and dimensions. That epsilon is a floating-point-artefact allowance and has nothing to
// do with the product tolerances in `DEVELOPMENT-SPEC.md` §2.
import * as THREE from "three";
import { makeKit as makeReferenceKit } from "@reference/kitchen-parts";
import { beforeAll, describe, expect, it } from "vitest";

import { makeKit, PARTS, type BuilderKey } from "../src/kitchen-parts.js";
import {
  createHeadlessCanvas,
  installHeadlessDocument,
} from "./support/headless-canvas.js";
import { required } from "./support/required.js";
import {
  describeStructure,
  meshNames,
  type StructureNode,
} from "./support/structure.js";

const FLOAT_EPSILON_METRES = 1e-6;

const ALL_BUILDER_KEYS: readonly BuilderKey[] = [
  "base-1door",
  "base-2door",
  "base-3drawer",
  "base-panbank",
  "base-sink",
  "base-dishwasher",
  "base-dishwasher-450",
  "base-corner-x",
  "base-corner-return",
  "base-corner",
  "wall-1door",
  "wall-2door",
  "wall-lift",
  "open-shelf",
  "tall-pantry",
  "tall-oven-tower",
  "tall-fridge-housing",
  "fridge-free",
  "oven",
  "microwave",
  "dishwasher",
  "cooktop",
  "hood",
  "sink-faucet",
  "countertop",
  "hardware",
  "kitchen-l",
];

let referenceKit: ReturnType<typeof makeReferenceKit>;
let portedKit: ReturnType<typeof makeKit>;

beforeAll(() => {
  installHeadlessDocument();
  referenceKit = makeReferenceKit(THREE);
  portedKit = makeKit({ createCanvas: createHeadlessCanvas });
});

function expectNumbersClose(
  actual: readonly number[],
  expected: readonly number[],
  path: string,
) {
  expect(actual.length, `${path}: length`).toBe(expected.length);
  actual.forEach((value, index) => {
    expect(
      Math.abs(value - (expected[index] ?? Number.NaN)),
      `${path}[${String(index)}]: ${String(value)} vs ${String(expected[index])}`,
    ).toBeLessThanOrEqual(FLOAT_EPSILON_METRES);
  });
}

function expectStructureMatches(
  actual: StructureNode,
  expected: StructureNode,
  path = "",
) {
  const here = path
    ? `${path} > ${actual.name || actual.kind}`
    : actual.name || actual.kind;
  expect(actual.name, `${here}: name`).toBe(expected.name);
  expect(actual.kind, `${here}: object type`).toBe(expected.kind);
  expect(actual.geometry, `${here}: geometry type`).toBe(expected.geometry);
  expect(actual.material, `${here}: material name`).toBe(expected.material);
  expect(actual.visible, `${here}: visibility`).toBe(expected.visible);
  expectNumbersClose(actual.position, expected.position, `${here}: position`);
  expectNumbersClose(actual.rotation, expected.rotation, `${here}: rotation`);
  expectNumbersClose(actual.scale, expected.scale, `${here}: scale`);
  if (expected.size === null) {
    expect(actual.size, `${here}: size`).toBeNull();
  } else {
    expect(actual.size, `${here}: size`).not.toBeNull();
    expectNumbersClose(actual.size ?? [], expected.size, `${here}: size`);
  }
  expect(
    actual.children.map((child) => child.name),
    `${here}: child order`,
  ).toEqual(expected.children.map((child) => child.name));
  actual.children.forEach((child, index) => {
    expectStructureMatches(
      child,
      required(expected.children[index], `child ${String(index)}`),
      here,
    );
  });
}

describe("ported builders reproduce the reference tree", () => {
  it.each(ALL_BUILDER_KEYS)(
    "%s produces the reference mesh-name set",
    (key) => {
      const reference = referenceKit.builders[key];
      expect(reference, `reference has no builder ${key}`).toBeTypeOf(
        "function",
      );
      const referenceNames = meshNames(
        required(reference, `reference builder ${key}`)(),
      );
      const portedNames = meshNames(portedKit.builders[key]());
      expect(portedNames.length).toBeGreaterThan(0);
      expect(portedNames).toEqual(referenceNames);
    },
  );

  it.each(ALL_BUILDER_KEYS)(
    "%s matches the reference hierarchy and dimensions",
    (key) => {
      const reference = describeStructure(
        required(referenceKit.builders[key], key)(),
      );
      const ported = describeStructure(portedKit.builders[key]());
      expectStructureMatches(ported, reference, key);
    },
  );
});

describe("width-parameterised factories reproduce the reference tree", () => {
  const widths = [0.3, 0.45, 0.6, 0.8];

  it.each(widths)("baseCabinet(%s) matches the reference", (w) => {
    const reference = describeStructure(
      referenceKit.make.baseCabinet(w, { doors: 2 }),
    );
    expectStructureMatches(
      describeStructure(portedKit.make.baseCabinet(w, { doors: 2 })),
      reference,
      `baseCabinet(${String(w)})`,
    );
  });

  it.each(widths)("wallCabinet(%s) matches the reference", (w) => {
    const reference = describeStructure(
      referenceKit.make.wallCabinet(w, 2, 0.4, 0.33, true),
    );
    expectStructureMatches(
      describeStructure(portedKit.make.wallCabinet(w, 2, 0.4, 0.33, true)),
      reference,
      `wallCabinet(${String(w)})`,
    );
  });

  it.each([0.45, 0.6])("dishwasherHousing(%s) matches the reference", (w) => {
    const reference = describeStructure(referenceKit.make.dishwasherHousing(w));
    expectStructureMatches(
      describeStructure(portedKit.make.dishwasherHousing(w)),
      reference,
      `dishwasherHousing(${String(w)})`,
    );
  });

  it.each([0.56, 0.58, 0.6])(
    "cornerBaseReturn(%s) matches the reference",
    (depth) => {
      const reference = describeStructure(
        referenceKit.make.cornerBaseReturn(depth),
      );
      expectStructureMatches(
        describeStructure(portedKit.make.cornerBaseReturn(depth)),
        reference,
        `cornerBaseReturn(${String(depth)})`,
      );
    },
  );

  it("openShelf matches the reference at the scene's own parameters", () => {
    const reference = describeStructure(
      referenceKit.make.openShelf(0.6, 0.33, 2, 0.7),
    );
    expectStructureMatches(
      describeStructure(portedKit.make.openShelf(0.6, 0.33, 2, 0.7)),
      reference,
      "openShelf",
    );
  });

  it("hood matches the reference at both catalogue sizes", () => {
    for (const w of [0.6, 0.9]) {
      expectStructureMatches(
        describeStructure(portedKit.make.hood(w)),
        describeStructure(referenceKit.make.hood(w)),
        `hood(${String(w)})`,
      );
    }
  });
});

describe("the builder registry", () => {
  it("exposes every key the reference exposes, and no more", () => {
    expect(Object.keys(portedKit.builders).sort()).toEqual(
      Object.keys(referenceKit.builders).sort(),
    );
  });

  it("carries the reference part catalogue verbatim", () => {
    const ids = PARTS.flatMap((group) => group.items.map((item) => item.id));
    expect(ids).toContain("kitchen-l");
    for (const id of ids) {
      expect(Object.keys(portedKit.builders), `${id} has no builder`).toContain(
        id,
      );
    }
  });
});
