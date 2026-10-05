// Structural parity: every part is built by the unmodified reference library and by the port, and the
// trees are diffed exactly on mesh names and hierarchy, and at 1e-6 m on transforms and dimensions.
// That epsilon is a float-artefact allowance, not a product tolerance (DEVELOPMENT-SPEC §2).
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

// The reference library is not ours to edit, so each deliberate product change is a declared
// divergence: the exact delta and how many nodes carry it. Every other number still diffs at 1e-6 m, and
// a declared delta that stops occurring, or occurs the wrong number of times or elsewhere, fails.
//
// ADR 0036 decision 1: a declared dimension is the finished cabinet, doors included, so a wall
// shell is `D - 39` (door slab 18 mm + handle 21 mm). The shell loses 39 mm, its back panel moves
// 19.5 mm forward, the front liner and every door 19.5 mm back. A wall body is seated at half its
// shell so its back face stays on the wall plane (wall A in `z`, wall B in `x`).
// ADR 0039 decision 2: the hood is hung at the 600 mm cabinet line, 100 mm forward of the wall.
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

/** ADR 0036 inside one `wallCabinet` call. The door row's `nodes` is per door, so the caller states
 *  how many doors it expects. */
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

// ADR 0098 decision 3: the sink assembly and the stone cut around it are seated 20 mm forward of the
// cabinet's origin at 600 (`SINK_SEAT_OFFSET_M`). The slabs flanking the aperture each give up or take
// on that 20 mm at one end only, so each moves by half of it while its depth changes by all of it.
const SINK_CENTRING_SHIFT_M = 0.02;

/** One `baseCabinet(w, { sink: true })` call; `prefix` is the path from the compared root down to the
 *  `base_cabinet` group. */
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

// ADR 0135: `cornerBaseReturn` is built to the run's carcass front (`D - 30`, the reference's `D - 20`),
// its worktop takes the run's 50 mm front overhang (the reference's 20), and a `fixed_front` stands on
// the run's door plane. The delta depends on the depth handed in, so two builds are declared:
// the default (`base-corner-return`, `base-corner`, `kitchen-l`) takes the kit's own `D - 30`, so its
// carcass and plinth shrink 10 mm against the reference's 0.58; the explicit `cornerBaseReturn(LD, W)`
// (called at 0.56, 0.58 and 0.6) keeps them and moves only its worktop and its front.
const BASE_RETURN_CARCASS_DEPTH_SHIFT_M = -0.01;
const BASE_RETURN_WORKTOP_DEPTH_GROWTH_M = 0.02;
const BASE_RETURN_WORKTOP_CENTRE_SHIFT_EXPLICIT_M = 0.02;
const BASE_RETURN_WORKTOP_CENTRE_SHIFT_DEFAULT_M = 0.015;
const BASE_RETURN_SEAT_SHIFT_M = -0.005;
const BASE_RETURN_WIDTH_GROWTH_M = 0.01;

// The X-leg's departures (ADR 0135): built 590 deep (the run's carcass front, 570, plus its pinned 20 mm
// behind the wall) where the reference is 600, with a 290 mm leaf where the reference's is 280 (the
// accessible front is 330, not 320), on the run's door plane without the reference's extra
// millimetre, and seated 275 mm off the wall where the reference is 280.
const X_LEG_DEPTH_SHIFT_M = -0.01;
const X_LEG_SEAT_SHIFT_M = -0.005;
const X_LEG_LEAF_GROWTH_M = 0.01;
const X_LEG_LEAF_X_SHIFT_M = -0.005;
const X_LEG_LEAF_Z_SHIFT_M = -0.006;
const X_LEG_HANDLE_X_SHIFT_M = -0.005;
const BASE_RETURN_FIXED_FRONT_WHY =
  "ADR 0135: the doorless return carries a fixed panel on the run's door plane, so its face is level with the doors beside it";

/** The return's worktop moves in both builds: 620 deep instead of 600, its back face on the wall. */
function baseReturnWorktopDivergences(
  prefix: string,
  centreShiftM: number,
): DeclaredDivergence[] {
  const why =
    "ADR 0135: the return's worktop carries the run's 50 mm front overhang, the reference's 20";
  return [
    {
      node: `${prefix}countertop`,
      field: "size",
      index: 2,
      deltaM: BASE_RETURN_WORKTOP_DEPTH_GROWTH_M,
      nodes: 1,
      why: `${why} — so the slab is 20 mm deeper`,
    },
    {
      node: `${prefix}countertop`,
      field: "position",
      index: 2,
      deltaM: centreShiftM,
      nodes: 1,
      why: `${why} — and its centre follows its front edge`,
    },
  ];
}

/** The return at the kit's own depth: carcass and plinth are also 10 mm shallower and 10 mm wider,
 *  its default width being the derived 330 (900 less the run's carcass front, 570), not 320. */
function defaultBaseReturnDivergences(prefix: string): DeclaredDivergence[] {
  const why =
    "ADR 0135: the return is built to the run's carcass front, `D - 30`, not the run's seat, `D - 20`";
  const widerWhy =
    "ADR 0135 (the joint move): the return starts at the run's carcass front, so its reference width is 330, not 320";
  return [
    ...(["carcass", "plinth", "countertop"] as const).map(
      (mesh): DeclaredDivergence => ({
        node: `${prefix}${mesh}`,
        field: "size",
        index: 0,
        deltaM: BASE_RETURN_WIDTH_GROWTH_M,
        nodes: 1,
        why: widerWhy,
      }),
    ),
    {
      node: `${prefix}carcass`,
      field: "size",
      index: 2,
      deltaM: BASE_RETURN_CARCASS_DEPTH_SHIFT_M,
      nodes: 1,
      why,
    },
    {
      node: `${prefix}plinth`,
      field: "size",
      index: 2,
      deltaM: BASE_RETURN_CARCASS_DEPTH_SHIFT_M,
      nodes: 1,
      why,
    },
    ...baseReturnWorktopDivergences(
      prefix,
      BASE_RETURN_WORKTOP_CENTRE_SHIFT_DEFAULT_M,
    ),
  ];
}

/** Where a composition places the return: half its depth off the wall, so it moves 5 mm. */
function baseReturnSeatDivergence(groupPath: string): DeclaredDivergence {
  return {
    node: groupPath,
    field: "position",
    index: 0,
    deltaM: BASE_RETURN_SEAT_SHIFT_M,
    nodes: 1,
    why: "ADR 0135: the return's seat is half its 570 mm depth, not half 580",
  };
}

/** Where a composition seats the corner pair along the joint: the X-leg half its footprint off the wall
 *  (275 mm, was 280) and the return's centre along the wall (735 mm, was 740). */
function cornerPairSeatDivergences(
  xLegGroupPath: string,
  returnGroupPath: string,
): DeclaredDivergence[] {
  return [
    {
      node: xLegGroupPath,
      field: "position",
      index: 2,
      deltaM: X_LEG_SEAT_SHIFT_M,
      nodes: 1,
      why: "ADR 0135: the X-leg is seated at half its 550 mm frame, 275 mm off the wall, not 280",
    },
    {
      node: returnGroupPath,
      field: "position",
      index: 2,
      deltaM: -0.005,
      nodes: 1,
      why: "ADR 0135: the return starts at the joint, 570, and is 330 wide, so its centre is 735 along the wall, not 740",
    },
  ];
}

function baseReturnFixedFront(parent: string): DeclaredStructuralChange {
  return {
    parent,
    node: "fixed_front",
    change: "added",
    meshes: ["fixed_front"],
    nodes: 1,
    why: BASE_RETURN_FIXED_FRONT_WHY,
  };
}

/** The X-leg's own meshes, relative to `prefix` (the path down to its `corner_base_x` group). */
function cornerBaseXDivergences(prefix: string): DeclaredDivergence[] {
  const why = "ADR 0135: the joint moved to the run's carcass front";
  const at = (
    node: string,
    field: string,
    index: number,
    deltaM: number,
    because: string,
  ): DeclaredDivergence => ({
    node: `${prefix}${node}`,
    field,
    index,
    deltaM,
    nodes: 1,
    why: `${why} — ${because}`,
  });
  return [
    at(
      "carcass",
      "size",
      2,
      X_LEG_DEPTH_SHIFT_M,
      "the leg is 590 deep, not 600",
    ),
    at(
      "plinth",
      "size",
      2,
      X_LEG_DEPTH_SHIFT_M,
      "its plinth follows its own depth",
    ),
    at(
      "countertop",
      "size",
      2,
      X_LEG_DEPTH_SHIFT_M,
      "its slab follows it, the front overhang unchanged",
    ),
    at(
      "door",
      "position",
      0,
      X_LEG_LEAF_X_SHIFT_M,
      "the leaf sits 5 mm nearer the corner, its accessible front being 330",
    ),
    at(
      "door",
      "position",
      2,
      X_LEG_LEAF_Z_SHIFT_M,
      "the leaf hangs on the run's door plane, 5 mm back with the carcass and 1 mm for the dropped offset",
    ),
    at(
      "door > door_front",
      "size",
      0,
      X_LEG_LEAF_GROWTH_M,
      "the leaf is 290 wide, not 280",
    ),
    at(
      "door > handle",
      "position",
      0,
      X_LEG_HANDLE_X_SHIFT_M,
      "the bar follows the leaf's edge",
    ),
  ];
}

/** The depths this gate hands `cornerBaseReturn` explicitly. */
const EXPLICIT_RETURN_DEPTHS_M = [0.56, 0.58, 0.6] as const;

function explicitReturnKey(depthM: number): string {
  return `cornerBaseReturn(${String(depthM)})`;
}

/** The seeded scene: fifteen wall bodies carrying 26 doors, ten on wall A and five on wall B, plus
 *  the one hood and the one sink base. Counted rather than derived, so a body that stopped being
 *  drawn cannot pass by making its divergence disappear. */
const KITCHEN_L_DIVERGENCES: readonly DeclaredDivergence[] = [
  ...sinkCentringDivergences("kitchen_l_shape > "),
  baseReturnSeatDivergence("kitchen_l_shape > corner_base_return"),
  ...cornerBaseXDivergences("kitchen_l_shape > corner_base_x > "),
  ...cornerPairSeatDivergences(
    "kitchen_l_shape > corner_base_x",
    "kitchen_l_shape > corner_base_return",
  ),
  ...defaultBaseReturnDivergences("kitchen_l_shape > corner_base_return > "),
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
    [
      "base-corner-return",
      defaultBaseReturnDivergences("corner_base_return > "),
    ],
    ["base-corner-x", cornerBaseXDivergences("corner_base_x > ")],
    [
      "base-corner",
      [
        baseReturnSeatDivergence("corner_base_pair > corner_base_return"),
        ...defaultBaseReturnDivergences(
          "corner_base_pair > corner_base_return > ",
        ),
        ...cornerBaseXDivergences("corner_base_pair > corner_base_x > "),
        ...cornerPairSeatDivergences(
          "corner_base_pair > corner_base_x",
          "corner_base_pair > corner_base_return",
        ),
      ],
    ],
    ...EXPLICIT_RETURN_DEPTHS_M.map(
      (depthM): [string, DeclaredDivergence[]] => [
        explicitReturnKey(depthM),
        baseReturnWorktopDivergences(
          "corner_base_return > ",
          BASE_RETURN_WORKTOP_CENTRE_SHIFT_EXPLICIT_M,
        ),
      ],
    ),
    ["wall-1door", wallCabinetDivergences("wall_cabinet > ", 1)],
    ["wall-2door", wallCabinetDivergences("wall_cabinet > ", 2)],
    // A lift-up is `wallCabinet(W, 0, …)` plus one full-face flap, and the flap is a `door` too.
    ["wall-lift", wallCabinetDivergences("wall_cabinet > ", 1)],
    ["kitchen-l", KITCHEN_L_DIVERGENCES],
  ]);

// ADR 0051 adds a node and removes three: `dishwasherHousing` builds its own decor door and the
// appliance inside is fully integrated (no `dw_panel`, `dw_control_strip` or bar). Mesh names, hierarchy
// and child order are compared before the numeric ledger, so a structural change is declared in its own
// form: parent, child, subtree meshes and occurrence count.
interface DeclaredStructuralChange {
  readonly parent: string;
  readonly node: string;
  readonly change: "added" | "removed";
  /** Every mesh name in the child's subtree, in traversal order. It re-baselines the mesh-name-set
   *  comparison and is checked per declaration against the subtree actually taken out: the net delta
   *  alone is not enough, since an added and a removed declaration sharing a wrong list cancel out. */
  readonly meshes: readonly string[];
  readonly nodes: number;
  readonly why: string;
}

/** `barHandle` draws one bar and two stems, whichever edge it hangs on. */
const HANDLE_SUBTREE_MESHES = ["handle_bar", "handle_stem", "handle_stem"];

/** One `dishwasherHousing` call, at either declared width; `prefix` is the path from the compared
 *  root down to the `dishwasher_housing` group. */
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

// A declared rename: a mesh both trees build, in the same place under the same parent, carrying a
// different name. `drawerSlab` names its slab `drawer_front` where the reference says `door_front`, so
// ADR 0070 can price runners per drawer; `finishes.ts`'s `FRONT_MESH_NAME` matches both names.
// A rename cannot hide a node: everything else about the mesh still diffs at 1e-6 m.
interface DeclaredMeshRename {
  readonly parent: string;
  readonly from: string;
  readonly to: string;
  /** The renamed slab's own height, in metres. A path of node names cannot tell one `base_cabinet`
   *  from another, and `kitchen-l` holds five drawer fronts and eight hinged leaves under one path,
   *  so a path-only declaration would rename a sink's door. A base leaf is 0.710 m tall; a drawer
   *  front is 0.356 or 0.236. */
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
  // The seeded kitchen's drawers (5 in ADR 0070): the hob base's two pan drawers and the three-drawer
  // base's three. Counted and split by height, so a sixth drawer or a renamed hinged leaf fails.
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
  ["base-corner-return", [baseReturnFixedFront("corner_base_return")]],
  [
    "base-corner",
    [baseReturnFixedFront("corner_base_pair > corner_base_return")],
  ],
  ...EXPLICIT_RETURN_DEPTHS_M.map(
    (depthM): [string, DeclaredStructuralChange[]] => [
      explicitReturnKey(depthM),
      [baseReturnFixedFront("corner_base_return")],
    ],
  ),
  // The seeded kitchen holds exactly one niche, at 2.0 m along wall A; counted rather than derived.
  [
    "kitchen-l",
    [
      ...dishwasherHousingChanges("kitchen_l_shape > ", 1),
      baseReturnFixedFront("kitchen_l_shape > corner_base_return"),
    ],
  ],
  ["dishwasherHousing(0.45)", dishwasherHousingChanges("", 1)],
  ["dishwasherHousing(0.6)", dishwasherHousingChanges("", 1)],
]);

/** A divergence ledger for one comparison: it answers "is this exact difference declared?" and
 *  records the declaration as used, so an unused declaration fails as loudly as an undeclared
 *  difference. It holds numeric deltas, structural additions and removals, and renames. */
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
    /** Takes the declared children out of one side's list (added from the port's, removed from the
     *  reference's) and records each; what is left is compared name for name, in order. */
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
    /** The name this child is expected to carry: the reference's, or the declared new name (recorded
     *  as used) when a rename is declared for this parent and reference name. Call once per child. */
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

/** Declared both ways, a `(parent, node)` pair leaves both child lists: child order matches, the mesh
 *  multiset nets to zero and `expectFullyUsed` is satisfied, so the node and its subtree would exit
 *  the 1e-6 comparison with nothing red. Any repeated key is refused, not only that pairing. */
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

/** Mesh names under a node, itself included, in `describeStructure`'s order: comparable to `meshes`. */
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

/** `expectedName` is the reference name with this node's declared rename already applied, resolved once
 *  by the parent's child-order comparison: looked up twice, a rename would satisfy a `nodes: 2`
 *  declaration on a single mesh. The root has no parent, and no rename is declared on it. */
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

/** The whole structural diff, with this key's declared divergences, structural changes and renames.
 *  A key with none is compared exactly. */
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

/** The reference's mesh names with this key's declared structural changes applied, once per declared
 *  occurrence. A declared removal that has nothing to remove fails here. */
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

/** The reference's mesh names with this key's declared renames applied in place: the first `nodes`
 *  occurrences of each `from` become its `to`, and fewer occurrences than declared fail here.
 *  Position-preserving, so a key compared in traversal order reports a rename that also moved a slab. */
function renameDeclaredMeshes(
  key: string,
  referenceNames: readonly string[],
): string[] {
  const names = [...referenceNames];
  for (const rename of DECLARED_MESH_RENAMES.get(key) ?? []) {
    const why = `${rename.parent} > ${rename.from} → ${rename.to} — ${rename.why}`;
    // By name and count only: this list carries no heights, so the hierarchy walk pins each
    // height-scoped rename to its slab.
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
      // Traversal order unless the tree gained or renamed a node mid-traversal; then a multiset, with
      // order asserted by the hierarchy comparison below.
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

  it.each(EXPLICIT_RETURN_DEPTHS_M)(
    "cornerBaseReturn(%s) matches the reference",
    (depth) => {
      const reference = describeStructure(
        referenceKit.make.cornerBaseReturn(depth),
      );
      expectStructureMatchesReference(
        describeStructure(portedKit.make.cornerBaseReturn(depth, 0.32)),
        reference,
        explicitReturnKey(depth),
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
