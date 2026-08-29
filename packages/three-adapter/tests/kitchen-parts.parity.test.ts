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

// ---------------------------------------------------------------------------------------------
// The wave 5F re-baseline.
// ---------------------------------------------------------------------------------------------
//
// M1's gate diffs the port against the **unmodified vendored reference library**, so a deliberate
// product change to a builder cannot be absorbed by editing a number: the reference is not ours to
// edit, and deleting a builder from the sweep would destroy the evidence that the port is faithful
// for everything else it draws. ADR 0036's Consequences say this gate "must be deliberately
// re-baselined with the change recorded, not relaxed".
//
// So it is re-baselined as a **declared divergence**: every number the port is allowed to differ on
// is named here with its exact delta and how many nodes carry it. The diff still runs at 1e-6 m over
// every other number, every mesh name, the hierarchy, materials, visibility and child order — and a
// declared delta that stops occurring, occurs the wrong number of times, or occurs anywhere else
// turns this red. It records the change rather than tolerating one.
//
// Two decisions produced it, both measured in wave 5F:
//
//   **ADR 0036 decision 1 — a declared dimension is the finished cabinet, doors included.** A wall
//   cabinet declared 330 was built with a 330 mm shell and finished at 369, because a door slab is
//   18 mm and its bar handle stands 21 mm proud of that. The shell is now `D − 39` and the front
//   lands on 330. Inside the builder that is one shrink and three shifts of half of it: the shell
//   loses 39 mm of depth, its back panel moves 19.5 mm forward, and the front liner and every door
//   move 19.5 mm back.
//
//   **ADR 0039 decision 2 — the hood is hung at the front.** Its front face aligns with the 600 mm
//   cabinet-depth line rather than sitting on the wall, so the seeded hood moves 100 mm forward and
//   leaves the gap behind it. §11 row 19's second named exception.
//
// The seat shifts in `kitchen-l` are the same 19.5 mm read from outside: a wall body is seated at
// half its shell so its back face still lands on the wall plane, on wall A in `z` and on wall B
// in `x`.
interface DeclaredDivergence {
  readonly node: string;
  readonly field: string;
  readonly index: number;
  readonly deltaM: number;
  readonly nodes: number;
  readonly why: string;
}

const FRONT_ASSEMBLY_M = 0.039;
const SEAT_SHIFT_M = FRONT_ASSEMBLY_M / 2;

/** ADR 0036 inside one `wallCabinet` call, whatever its width or door count. `nodes` is per door for
 *  the door row, so a caller states how many doors it expects. */
function wallCabinetDivergences(
  prefix: string,
  doors: number,
): DeclaredDivergence[] {
  return [
    {
      node: `${prefix}carcass > carcass_shell`,
      field: "size",
      index: 2,
      deltaM: -FRONT_ASSEMBLY_M,
      nodes: 1,
      why: "the shell is the declared depth less the door and its handle",
    },
    {
      node: `${prefix}carcass > carcass_back`,
      field: "position",
      index: 2,
      deltaM: SEAT_SHIFT_M,
      nodes: 1,
      why: "the back panel follows the shell's rear face forward",
    },
    {
      node: `${prefix}carcass > front_liner`,
      field: "position",
      index: 2,
      deltaM: -SEAT_SHIFT_M,
      nodes: 1,
      why: "the shadow-gap liner follows the shell's front face back",
    },
    {
      node: `${prefix}door`,
      field: "position",
      index: 2,
      deltaM: -SEAT_SHIFT_M,
      nodes: doors,
      why: "the door hangs on the shell's front face, which moved back",
    },
  ];
}

/** The seeded scene: fifteen wall bodies carrying 26 doors between them, ten seated on wall A and
 *  five on wall B, plus the one hood. Counted rather than derived, so a body that stopped being
 *  drawn cannot pass by making its divergence disappear. */
const KITCHEN_L_DIVERGENCES: readonly DeclaredDivergence[] = [
  ...wallCabinetDivergences("kitchen_l_shape > wall_cabinet > ", 26).map(
    (declared) =>
      declared.field === "position" && declared.node.endsWith("door")
        ? declared
        : { ...declared, nodes: 15 },
  ),
  {
    node: "kitchen_l_shape > wall_cabinet",
    field: "position",
    index: 2,
    deltaM: -SEAT_SHIFT_M,
    nodes: 10,
    why: "wall A: the body is seated at half its shell so its back stays on the plane",
  },
  {
    node: "kitchen_l_shape > wall_cabinet",
    field: "position",
    index: 0,
    deltaM: -SEAT_SHIFT_M,
    nodes: 5,
    why: "wall B: the same seat, read along the other wall's normal",
  },
  {
    node: "kitchen_l_shape > extractor_hood",
    field: "position",
    index: 2,
    deltaM: 0.1,
    nodes: 1,
    why: "ADR 0039 decision 2: hung at the 600 mm cabinet line, 100 mm clear of the wall",
  },
];

const DECLARED_DIVERGENCES: ReadonlyMap<string, readonly DeclaredDivergence[]> =
  new Map([
    ["wall-1door", wallCabinetDivergences("wall_cabinet > ", 1)],
    ["wall-2door", wallCabinetDivergences("wall_cabinet > ", 2)],
    // A lift-up is `wallCabinet(W, 0, …)` plus one full-face flap, and the flap is a `door` too.
    ["wall-lift", wallCabinetDivergences("wall_cabinet > ", 1)],
    ["kitchen-l", KITCHEN_L_DIVERGENCES],
  ]);

/** A divergence ledger for one comparison: it answers "is this exact difference declared?" and
 *  records that the declaration was used, so an unused declaration fails as loudly as an
 *  undeclared difference. */
function openLedger(declared: readonly DeclaredDivergence[], root: string) {
  const seen = new Map<DeclaredDivergence, number>(
    declared.map((entry) => [entry, 0]),
  );
  return {
    accepts(node: string, field: string, index: number, deltaM: number) {
      const entry = declared.find(
        (candidate) =>
          `${root} > ${candidate.node}` === node &&
          candidate.field === field &&
          candidate.index === index &&
          Math.abs(candidate.deltaM - deltaM) <= FLOAT_EPSILON_METRES,
      );
      if (!entry) return false;
      seen.set(entry, (seen.get(entry) ?? 0) + 1);
      return true;
    },
    expectFullyUsed() {
      for (const [entry, count] of seen) {
        expect(
          count,
          `${entry.node}: ${entry.field}[${String(entry.index)}] — ${entry.why}`,
        ).toBe(entry.nodes);
      }
    },
  };
}

type Ledger = ReturnType<typeof openLedger>;

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
  field: string,
  node: string,
  ledger?: Ledger,
) {
  expect(actual.length, `${path}: length`).toBe(expected.length);
  actual.forEach((value, index) => {
    const deltaM = value - (expected[index] ?? Number.NaN);
    if (ledger?.accepts(node, field, index, deltaM)) return;
    expect(
      Math.abs(deltaM),
      `${path}[${String(index)}]: ${String(value)} vs ${String(expected[index])}`,
    ).toBeLessThanOrEqual(FLOAT_EPSILON_METRES);
  });
}

function expectStructureMatches(
  actual: StructureNode,
  expected: StructureNode,
  path = "",
  ledger?: Ledger,
) {
  const here = path
    ? `${path} > ${actual.name || actual.kind}`
    : actual.name || actual.kind;
  expect(actual.name, `${here}: name`).toBe(expected.name);
  expect(actual.kind, `${here}: object type`).toBe(expected.kind);
  expect(actual.geometry, `${here}: geometry type`).toBe(expected.geometry);
  expect(actual.material, `${here}: material name`).toBe(expected.material);
  expect(actual.visible, `${here}: visibility`).toBe(expected.visible);
  expectNumbersClose(
    actual.position,
    expected.position,
    `${here}: position`,
    "position",
    here,
    ledger,
  );
  expectNumbersClose(
    actual.rotation,
    expected.rotation,
    `${here}: rotation`,
    "rotation",
    here,
    ledger,
  );
  expectNumbersClose(
    actual.scale,
    expected.scale,
    `${here}: scale`,
    "scale",
    here,
    ledger,
  );
  if (expected.size === null) {
    expect(actual.size, `${here}: size`).toBeNull();
  } else {
    expect(actual.size, `${here}: size`).not.toBeNull();
    expectNumbersClose(
      actual.size ?? [],
      expected.size,
      `${here}: size`,
      "size",
      here,
      ledger,
    );
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
      ledger,
    );
  });
}

/** The whole structural diff, with the wave 5F divergences declared for this key. A key with no
 *  declaration is compared exactly as before. */
function expectStructureMatchesReference(
  actual: StructureNode,
  expected: StructureNode,
  path: string,
  declarationKey = path,
) {
  const declared = DECLARED_DIVERGENCES.get(declarationKey);
  if (!declared) {
    expectStructureMatches(actual, expected, path);
    return;
  }
  const ledger = openLedger(declared, path);
  expectStructureMatches(actual, expected, path, ledger);
  ledger.expectFullyUsed();
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
      expectStructureMatchesReference(ported, reference, key);
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
    expectStructureMatchesReference(
      describeStructure(portedKit.make.wallCabinet(w, 2, 0.4, 0.33, true)),
      reference,
      `wallCabinet(${String(w)})`,
      "wall-2door",
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
