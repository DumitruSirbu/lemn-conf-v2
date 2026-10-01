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

// ---------------------------------------------------------------------------------------------
// The ADR 0098 re-baseline: the sink is centred, and the 600 mm kitchen moves.
// ---------------------------------------------------------------------------------------------
//
// **This is the one thing ADR 0087 deliberately refused to do for the hob, and ADR 0098 decision 3
// does on purpose for the sink.** The hob's shipped literal already satisfied its ruling, so
// wave 6U held the 600 mm kitchen still to the micrometre and needed nothing here. The sink's does
// not: the owner asked for a bigger gap between the faucet and the wall, and at 600 the worktop's
// 620 mm is fully spent — 130 mm in front, a 400 mm aperture, 90 mm behind, of which the faucet
// takes 88. There are 2 mm of slack. The rear gap can only come from moving the assembly forward,
// and "centred" is the owner's own word for exactly that move.
//
// So the sink assembly and the stone cut around it are seated 20 mm forward of the cabinet's own
// origin at 600 — `SINK_SEAT_OFFSET_M`, derived from a declared 110 mm front clearance. The two
// slabs that flank the aperture each give up or take on that 20 mm at one end only, so each moves
// by half of it while its depth changes by all of it. Nothing else in either tree moves: everything
// below is one `baseCabinet(w, { sink: true })` call and the seeded room holds exactly one.
const SINK_CENTRING_SHIFT_M = 0.02;

/** ADR 0098 inside one `baseCabinet(w, { sink: true })` call. `prefix` is the path from the compared
 *  root down to the `base_cabinet` group. */
function sinkCentringDivergences(prefix: string): DeclaredDivergence[] {
  const why =
    "ADR 0098: the sink is centred on its worktop at the declared depth, 20 mm forward of the " +
    "literal seat it replaces";
  return [
    {
      node: `${prefix}base_cabinet > countertop_front`,
      field: "size",
      index: 2,
      deltaM: -SINK_CENTRING_SHIFT_M,
      nodes: 1,
      why: `${why} — the slab in front of it gives up the 20 mm`,
    },
    {
      node: `${prefix}base_cabinet > countertop_front`,
      field: "position",
      index: 2,
      deltaM: SINK_CENTRING_SHIFT_M / 2,
      nodes: 1,
      why: `${why} — and moves by half of it, its front edge being unchanged`,
    },
    {
      node: `${prefix}base_cabinet > countertop_back`,
      field: "size",
      index: 2,
      deltaM: SINK_CENTRING_SHIFT_M,
      nodes: 1,
      why: `${why} — the slab behind it takes the 20 mm on, which is the gap the owner asked for`,
    },
    {
      node: `${prefix}base_cabinet > countertop_back`,
      field: "position",
      index: 2,
      deltaM: SINK_CENTRING_SHIFT_M / 2,
      nodes: 1,
      why: `${why} — and moves by half of it, its back edge being the wall plane`,
    },
    {
      node: `${prefix}base_cabinet > countertop_side`,
      field: "position",
      index: 2,
      deltaM: SINK_CENTRING_SHIFT_M,
      nodes: 2,
      why: `${why} — the two slabs flanking the aperture follow it whole, their depth unchanged`,
    },
    {
      node: `${prefix}base_cabinet > sink_faucet`,
      field: "position",
      index: 2,
      deltaM: SINK_CENTRING_SHIFT_M,
      nodes: 1,
      why: `${why} — bowl and faucet are one assembly and follow it whole`,
    },
  ];
}

/** The seeded scene: fifteen wall bodies carrying 26 doors between them, ten seated on wall A and
 *  five on wall B, plus the one hood — and, since ADR 0098, its one sink base. Counted rather than
 *  derived, so a body that stopped being drawn cannot pass by making its divergence disappear. */
const KITCHEN_L_DIVERGENCES: readonly DeclaredDivergence[] = [
  ...sinkCentringDivergences("kitchen_l_shape > "),
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
    ["base-sink", sinkCentringDivergences("")],
    ["wall-1door", wallCabinetDivergences("wall_cabinet > ", 1)],
    ["wall-2door", wallCabinetDivergences("wall_cabinet > ", 2)],
    // A lift-up is `wallCabinet(W, 0, …)` plus one full-face flap, and the flap is a `door` too.
    ["wall-lift", wallCabinetDivergences("wall_cabinet > ", 1)],
    ["kitchen-l", KITCHEN_L_DIVERGENCES],
  ]);

// ---------------------------------------------------------------------------------------------
// The wave 5B10 re-baseline.
// ---------------------------------------------------------------------------------------------
//
// `DeclaredDivergence` above can only say "this number moved on a node both trees have". ADR 0051
// adds a node and takes three away: `dishwasherHousing` now builds its own decor door, and the
// appliance inside it is built fully integrated — no `dw_panel`, no `dw_control_strip`, no bar of
// its own. Mesh names, hierarchy and child order are compared *before* the numeric ledger is ever
// consulted, so a structural change has to be declared in its own form.
//
// It carries the same discipline: each change names its **parent**, the child that appeared or
// vanished, every mesh in that child's subtree, and how many times it occurs in this comparison.
// A structural difference that is not declared still fails the child-order assertion, and a
// declaration that goes unused — or occurs the wrong number of times — fails just as loudly.
// Everything else in these trees, and every other builder, still diffs exactly at 1e-6 m.
interface DeclaredStructuralChange {
  readonly parent: string;
  readonly node: string;
  readonly change: "added" | "removed";
  /** Every mesh name in the child's subtree, in traversal order. Two things read it, and the
   *  second is why it is checked rather than trusted: it is what the mesh-name-set comparison adds
   *  or takes away, so that gate is re-baselined by the same declaration — and the ledger holds it
   *  to the subtree it actually took out, per declaration. The net delta alone is not enough: one
   *  added and one removed declaration sharing a wrong list cancel each other out of the sum. */
  readonly meshes: readonly string[];
  readonly nodes: number;
  readonly why: string;
}

/** `barHandle` draws one bar and two stems, whichever edge it hangs on. */
const HANDLE_SUBTREE_MESHES = ["handle_bar", "handle_stem", "handle_stem"];

/** ADR 0051 inside one `dishwasherHousing` call, at either declared width. `prefix` is the path
 *  from the compared root down to the `dishwasher_housing` group. */
function dishwasherHousingChanges(
  prefix: string,
  housings: number,
): DeclaredStructuralChange[] {
  const appliance = `${prefix}dishwasher_housing > dishwasher`;
  return [
    {
      parent: `${prefix}dishwasher_housing`,
      node: "door",
      change: "added",
      meshes: ["door_front", ...HANDLE_SUBTREE_MESHES],
      nodes: housings,
      why: "decision 1: the niche owns one decor door, built with `doorSlab` at `baseCabinet`'s anchors",
    },
    {
      parent: appliance,
      node: "dw_panel",
      change: "removed",
      meshes: ["dw_panel"],
      nodes: housings,
      why: "decision 3: the appliance's fascia is coplanar with the decor door, so it is not built here",
    },
    {
      parent: appliance,
      node: "dw_control_strip",
      change: "removed",
      meshes: ["dw_control_strip"],
      nodes: housings,
      why: "decision 3: the control strip crosses the door plane by 7 mm",
    },
    {
      parent: appliance,
      node: "handle",
      change: "removed",
      meshes: HANDLE_SUBTREE_MESHES,
      nodes: housings,
      why: "decision 5: a fully-integrated machine has no bar of its own — the door's is the cabinet's",
    },
  ];
}

// ---------------------------------------------------------------------------------------------
// The wave 6S re-baseline: a declared **rename**.
// ---------------------------------------------------------------------------------------------
//
// `DeclaredDivergence` says "this number moved on a node both trees have"; `DeclaredStructuralChange`
// says "this node appeared or vanished". Neither can say what 6S did: a mesh both trees build, in
// the same place, under the same parent, carrying a different **name**.
//
// ADR 0070 prices hinges per door leaf and runners per drawer, and until 6S every front in this kit
// was named `door_front` — `base-panbank`'s drawer fronts included — so nothing in a built scene
// could tell the two apart and no parity gate could hold a catalogue declaration to them.
// `drawerSlab` now names its slab `drawer_front`, which `finishes.ts`'s `FRONT_MESH_NAME` already
// matched before anything drew one, so recolouring is unaffected.
//
// The form carries the same discipline as the other two: each rename names its parent, the name it
// replaces, the name it introduces, and how many times it occurs. It **cannot** hide a node from the
// comparison — everything else about the renamed mesh still diffs at 1e-6 m, and a rename that is
// declared and does not occur, or occurs the wrong number of times, turns this red.
interface DeclaredMeshRename {
  readonly parent: string;
  readonly from: string;
  readonly to: string;
  /** **The renamed slab's own height, in metres, and it is what makes the declaration precise.**
   *  A path built from node names cannot tell one `base_cabinet` from another, and `kitchen-l`
   *  holds five drawer fronts and eight hinged leaves under the identical path — so a declaration
   *  scoped by path alone would rename a sink's door. A base leaf is 0.710 m tall and a drawer
   *  front is 0.356 or 0.236, which is the product fact this rename is actually about. */
  readonly heightM: number;
  readonly nodes: number;
  readonly why: string;
}

const DRAWER_FRONT_RENAME =
  "wave 6S: a drawer front is named for what it is, so ADR 0070 can price its runners";

/** The two drawer heights `baseCabinet(w, { drawers })` builds, in metres: a three-drawer base
 *  stacks 240 mm bands and a pan bank stacks 360, each front `GAP` shorter than its band. */
const PAN_DRAWER_FRONT_HEIGHT_M = 0.356;
const THREE_DRAWER_FRONT_HEIGHT_M = 0.236;

/** The drawer fronts one `baseCabinet(w, { drawers })` call builds. `prefix` is the path from the
 *  compared root down to the `base_cabinet` group. */
function drawerFrontRename(
  prefix: string,
  drawer: { readonly heightM: number; readonly nodes: number },
): DeclaredMeshRename {
  return {
    parent: `${prefix}base_cabinet > door`,
    from: "door_front",
    to: "drawer_front",
    heightM: drawer.heightM,
    nodes: drawer.nodes,
    why: DRAWER_FRONT_RENAME,
  };
}

const DECLARED_MESH_RENAMES: ReadonlyMap<
  string,
  readonly DeclaredMeshRename[]
> = new Map([
  [
    "base-3drawer",
    [drawerFrontRename("", { heightM: THREE_DRAWER_FRONT_HEIGHT_M, nodes: 3 })],
  ],
  [
    "base-panbank",
    [drawerFrontRename("", { heightM: PAN_DRAWER_FRONT_HEIGHT_M, nodes: 2 })],
  ],
  // The seeded kitchen's whole drawer population, and ADR 0070's own figure for it: the hob base's
  // two pan drawers and the three-drawer base's three. Counted and split by height rather than
  // derived, so a sixth drawer appearing — or one of these five ceasing to be one, or a hinged leaf
  // being renamed alongside them — turns the gate red.
  [
    "kitchen-l",
    [
      drawerFrontRename("kitchen_l_shape > ", {
        heightM: PAN_DRAWER_FRONT_HEIGHT_M,
        nodes: 2,
      }),
      drawerFrontRename("kitchen_l_shape > ", {
        heightM: THREE_DRAWER_FRONT_HEIGHT_M,
        nodes: 3,
      }),
    ],
  ],
]);

const DECLARED_STRUCTURAL_CHANGES: ReadonlyMap<
  string,
  readonly DeclaredStructuralChange[]
> = new Map([
  ["base-dishwasher", dishwasherHousingChanges("", 1)],
  ["base-dishwasher-450", dishwasherHousingChanges("", 1)],
  // The seeded kitchen holds exactly one niche, at 2.0 m along wall A. Counted rather than
  // derived, so a second one appearing — or this one ceasing to be drawn — turns the gate red.
  ["kitchen-l", dishwasherHousingChanges("kitchen_l_shape > ", 1)],
  ["dishwasherHousing(0.45)", dishwasherHousingChanges("", 1)],
  ["dishwasherHousing(0.6)", dishwasherHousingChanges("", 1)],
]);

/** A divergence ledger for one comparison: it answers "is this exact difference declared?" and
 *  records that the declaration was used, so an unused declaration fails as loudly as an
 *  undeclared difference. It holds both forms — numeric deltas on nodes both trees have, and
 *  wave 5B10's structural additions and removals. */
function openLedger(
  declared: readonly DeclaredDivergence[],
  structural: readonly DeclaredStructuralChange[],
  renames: readonly DeclaredMeshRename[],
  root: string,
) {
  refuseTwoDeclarationsOnOneNode(structural);
  const seen = new Map<DeclaredDivergence, number>(
    declared.map((entry) => [entry, 0]),
  );
  const structuralSeen = new Map<DeclaredStructuralChange, number>(
    structural.map((entry) => [entry, 0]),
  );
  const renameSeen = new Map<DeclaredMeshRename, number>(
    renames.map((entry) => [entry, 0]),
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
    /** Takes the declared children out of one side's list — the added ones out of the port's, the
     *  removed ones out of the reference's — and records each one it took. What is left is
     *  compared name for name, in order, exactly as before. */
    reconcileChildren(
      parent: string,
      children: readonly StructureNode[],
      change: DeclaredStructuralChange["change"],
    ): readonly StructureNode[] {
      const declaredHere = structural.filter(
        (candidate) =>
          `${root} > ${candidate.parent}` === parent &&
          candidate.change === change,
      );
      if (declaredHere.length === 0) return children;
      return children.filter((child) => {
        const entry = declaredHere.find(
          (candidate) => candidate.node === child.name,
        );
        if (!entry) return true;
        expect(
          meshNamesOfNode(child),
          `${entry.parent} > ${entry.node}: ${entry.change} — ${entry.why}`,
        ).toEqual([...entry.meshes]);
        structuralSeen.set(entry, (structuralSeen.get(entry) ?? 0) + 1);
        return false;
      });
    },
    /** The name this child is expected to carry: the reference's, unless a rename is declared for
     *  this exact parent and reference name — in which case the declared new name, recorded as
     *  used. Everything else about the node is compared as before. Called once per child, by the
     *  child-order comparison, which then hands the answer to that child's own recursion. */
    renamedTo(parent: string, expectedChild: StructureNode): string {
      const entry = renames.find(
        (candidate) =>
          `${root} > ${candidate.parent}` === parent &&
          candidate.from === expectedChild.name &&
          Math.abs(
            (expectedChild.size?.[1] ?? Number.NaN) - candidate.heightM,
          ) <= FLOAT_EPSILON_METRES,
      );
      if (!entry) return expectedChild.name;
      renameSeen.set(entry, (renameSeen.get(entry) ?? 0) + 1);
      return entry.to;
    },
    expectFullyUsed() {
      for (const [entry, count] of renameSeen) {
        expect(
          count,
          `${entry.parent} > ${entry.from} → ${entry.to} — ${entry.why}`,
        ).toBe(entry.nodes);
      }
      for (const [entry, count] of seen) {
        expect(
          count,
          `${entry.node}: ${entry.field}[${String(entry.index)}] — ${entry.why}`,
        ).toBe(entry.nodes);
      }
      for (const [entry, count] of structuralSeen) {
        expect(
          count,
          `${entry.parent} > ${entry.node}: ${entry.change} — ${entry.why}`,
        ).toBe(entry.nodes);
      }
    },
  };
}

type Ledger = ReturnType<typeof openLedger>;

/** **The one thing a structural declaration must never be able to do.** Declared both ways, a
 *  `(parent, node)` pair leaves the port's child list *and* the reference's: child order still
 *  matches, the mesh multiset nets to zero, and `expectFullyUsed` sees both declarations used
 *  exactly `nodes` times — so the node and everything under it drops out of the 1e-6 comparison
 *  with nothing turning red. QA moved a `back_panel` 25 mm through that hole and the suite stayed
 *  green (wave 5B10, F1).
 *
 *  A declaration may say a node stopped existing, or started to. It may never say a node still
 *  exists on both sides and is not to be compared. Any repeated key is refused, not merely the
 *  added/removed pairing: two declarations on one node are never the honest way to state anything,
 *  and a narrower rule would only invite the next shape of this. */
function refuseTwoDeclarationsOnOneNode(
  structural: readonly DeclaredStructuralChange[],
): void {
  const declaredNodes = new Set<string>();
  for (const change of structural) {
    const key = `${change.parent} > ${change.node}`;
    if (declaredNodes.has(key)) {
      throw new Error(
        `${key} carries more than one structural declaration — a node declared both added and ` +
          `removed would leave the 1e-6 comparison entirely`,
      );
    }
    declaredNodes.add(key);
  }
}

/** Every mesh name under a node, itself included, in traversal order — the same order
 *  `describeStructure` built the children in, so it is comparable to a declaration's `meshes`. */
function meshNamesOfNode(node: StructureNode): string[] {
  const names = node.geometry === null ? [] : [node.name];
  for (const child of node.children) names.push(...meshNamesOfNode(child));
  return names;
}

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

/** `expectedName` is the reference node's name **with this node's declared rename already applied**,
 *  resolved once by its parent's child-order comparison below. Passed down rather than looked up
 *  again here, so a declared rename is counted exactly once per node it renames — looked up twice it
 *  would satisfy a `nodes: 2` declaration on a single mesh. The root has no parent to resolve it, and
 *  no rename is ever declared on one. */
function expectStructureMatches(
  actual: StructureNode,
  expected: StructureNode,
  path = "",
  ledger?: Ledger,
  expectedName: string = expected.name,
) {
  const here = path
    ? `${path} > ${actual.name || actual.kind}`
    : actual.name || actual.kind;
  expect(actual.name, `${here}: name`).toBe(expectedName);
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
  const actualChildren =
    ledger?.reconcileChildren(here, actual.children, "added") ??
    actual.children;
  const expectedChildren =
    ledger?.reconcileChildren(here, expected.children, "removed") ??
    expected.children;
  const expectedChildNames = expectedChildren.map(
    (child) => ledger?.renamedTo(here, child) ?? child.name,
  );
  expect(
    actualChildren.map((child) => child.name),
    `${here}: child order`,
  ).toEqual(expectedChildNames);
  actualChildren.forEach((child, index) => {
    expectStructureMatches(
      child,
      required(expectedChildren[index], `child ${String(index)}`),
      here,
      ledger,
      required(expectedChildNames[index], `child name ${String(index)}`),
    );
  });
}

/** The whole structural diff, with wave 5F's numeric divergences and wave 5B10's structural
 *  changes declared for this key. A key with neither is compared exactly as before. */
function expectStructureMatchesReference(
  actual: StructureNode,
  expected: StructureNode,
  path: string,
  declarationKey = path,
) {
  const declared = DECLARED_DIVERGENCES.get(declarationKey) ?? [];
  const structural = DECLARED_STRUCTURAL_CHANGES.get(declarationKey) ?? [];
  const renames = DECLARED_MESH_RENAMES.get(declarationKey) ?? [];
  if (
    declared.length === 0 &&
    structural.length === 0 &&
    renames.length === 0
  ) {
    expectStructureMatches(actual, expected, path);
    return;
  }
  const ledger = openLedger(declared, structural, renames, path);
  expectStructureMatches(actual, expected, path, ledger);
  ledger.expectFullyUsed();
}

/** The reference's mesh names with this key's declared structural changes applied — every mesh of
 *  a removed subtree taken out, every mesh of an added one put in, once per declared occurrence.
 *  A declared removal that is not there to remove fails here. */
function meshNamesAfterDeclaredChanges(
  key: string,
  referenceNames: readonly string[],
): string[] {
  const names = renameDeclaredMeshes(key, referenceNames);
  for (const change of DECLARED_STRUCTURAL_CHANGES.get(key) ?? []) {
    const why = `${change.parent} > ${change.node}: ${change.change} — ${change.why}`;
    for (let occurrence = 0; occurrence < change.nodes; occurrence++) {
      for (const mesh of change.meshes) {
        if (change.change === "added") {
          names.push(mesh);
          continue;
        }
        const at = names.indexOf(mesh);
        expect(at, `${why}: no ${mesh} left to remove`).toBeGreaterThanOrEqual(
          0,
        );
        names.splice(at, 1);
      }
    }
  }
  return names;
}

/** The reference's mesh names with this key's declared **renames** applied, in place: the `nodes`th
 *  occurrence of each `from` becomes its `to`, and a declaration with fewer occurrences than it
 *  claims fails here rather than passing as a shorter list.
 *
 *  Position-preserving on purpose. For a key with no structural change this list is compared in
 *  traversal order, so a rename that also moved a slab differs at a position this reports; for a
 *  key that is compared as a multiset the hierarchy walk pins each rename to its own parent. */
function renameDeclaredMeshes(
  key: string,
  referenceNames: readonly string[],
): string[] {
  const names = [...referenceNames];
  for (const rename of DECLARED_MESH_RENAMES.get(key) ?? []) {
    const why = `${rename.parent} > ${rename.from} → ${rename.to} — ${rename.why}`;
    // By name and count only: this list is flat and carries no heights, so a key whose renames are
    // scoped by height is compared as a multiset (below) and it is the hierarchy walk that pins each
    // rename to the slab it belongs to.
    const at = names.flatMap((name, index) =>
      name === rename.from ? [index] : [],
    );
    expect(
      at.length,
      `${why}: occurrences of ${rename.from}`,
    ).toBeGreaterThanOrEqual(rename.nodes);
    for (const index of at.slice(0, rename.nodes)) names[index] = rename.to;
  }
  return names;
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
      const expectedNames = meshNamesAfterDeclaredChanges(key, referenceNames);
      expect(portedNames.length).toBeGreaterThan(0);
      // Traversal order for a key with nothing declared; the same names as a multiset for a key
      // whose tree gained a node in the middle of that traversal — where the order itself is
      // asserted, node by node, by the hierarchy comparison below.
      if (
        DECLARED_STRUCTURAL_CHANGES.has(key) ||
        DECLARED_MESH_RENAMES.has(key)
      ) {
        expect([...portedNames].sort()).toEqual([...expectedNames].sort());
      } else {
        expect(portedNames).toEqual(expectedNames);
      }
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
    expectStructureMatchesReference(
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
        describeStructure(portedKit.make.cornerBaseReturn(depth, 0.32)),
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

describe("the structural ledger cannot exempt a node from being compared", () => {
  const BOTH_WAYS: readonly DeclaredStructuralChange[] = [
    {
      parent: "dishwasher_housing",
      node: "back_panel",
      change: "added",
      meshes: ["back_panel"],
      nodes: 1,
      why: "F1's hole: a node declared both ways",
    },
    {
      parent: "dishwasher_housing",
      node: "back_panel",
      change: "removed",
      meshes: ["back_panel"],
      nodes: 1,
      why: "F1's hole: the other half of the pair",
    },
  ];

  it("refuses a node declared both added and removed", () => {
    expect(() => openLedger([], BOTH_WAYS, [], "base-dishwasher")).toThrow(
      /more than one structural declaration/,
    );
  });

  it("opens on every declaration this file actually makes", () => {
    for (const [key, structural] of DECLARED_STRUCTURAL_CHANGES) {
      expect(() =>
        openLedger(
          DECLARED_DIVERGENCES.get(key) ?? [],
          structural,
          DECLARED_MESH_RENAMES.get(key) ?? [],
          key,
        ),
      ).not.toThrow();
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
