// A port of the standalone reference kitchen library, not a reimplementation: builder math, mesh hierarchy, mesh names,
// materials, chamfer cache and structural dependencies are unchanged (see `SPEC.md`).
import {
  cornerAssemblyWidthsMm,
  KITCHEN_L_DESIGN,
  RUN_END_PANEL_EDGE_OFFSET_M,
  RUN_END_PANEL_GAP_M,
  RUN_END_PANEL_HEIGHT_M,
  RUN_END_PANEL_THICKNESS_M,
  WORKTOP_DEPTH_MM,
} from "@lemnaria/configurator-domain";
import * as THREE from "three";

import {
  CORNER_WALL_CLOSURE_MESH_NAME,
  CORNER_WALL_STILE_MESH_NAME,
  wearsTheBodysFinish,
  wearsTheBodysFinishOnTheCornerWallUnit,
} from "./body-finish-surfaces.js";
import { kitOwnedResources } from "./kit-ownership.js";
import { context2d, isMaterial, isMesh } from "./three-guards.js";

export interface PartItem {
  readonly id: string;
  readonly label: string;
  readonly note: string;
}

export interface PartGroup {
  readonly group: string;
  readonly items: readonly PartItem[];
}

export const PARTS: readonly PartGroup[] = [
  {
    group: "Full scene",
    items: [{ id: "kitchen-l", label: "L-shape kitchen", note: "3.6 × 2.4 m" }],
  },
  {
    group: "Base cabinets",
    items: [
      { id: "base-1door", label: "Base 1-door", note: "400 mm" },
      { id: "base-2door", label: "Base 2-door", note: "800 mm" },
      { id: "base-3drawer", label: "Base 3-drawer", note: "600 mm" },
      { id: "base-panbank", label: "Pan drawers (2)", note: "600 mm" },
      { id: "base-sink", label: "Sink base", note: "800 mm" },
      { id: "base-corner", label: "Corner base pair", note: "900 + 330" },
      { id: "base-corner-x", label: "Corner base X-leg", note: "900 × 590" },
      {
        id: "base-corner-return",
        label: "Corner return leg",
        note: "330 × 570",
      },
      { id: "base-dishwasher", label: "Dishwasher housing", note: "600 mm" },
    ],
  },
  {
    group: "Wall & open units",
    items: [
      { id: "wall-1door", label: "Wall 1-door", note: "400 mm" },
      { id: "wall-2door", label: "Wall 2-door", note: "800 mm" },
      { id: "wall-lift", label: "Wall lift-up", note: "600 mm" },
      { id: "open-shelf", label: "Open shelf unit", note: "800 mm" },
    ],
  },
  {
    group: "Tall units",
    items: [
      { id: "tall-pantry", label: "Tall pantry", note: "600 × 2200" },
      {
        id: "tall-oven-tower",
        label: "Oven + microwave tower",
        note: "600 × 2200",
      },
      {
        id: "tall-fridge-housing",
        label: "Integrated fridge housing",
        note: "600 × 2200",
      },
    ],
  },
  {
    group: "Appliances",
    items: [
      { id: "fridge-free", label: "Fridge, freestanding", note: "700 mm" },
      { id: "oven", label: "Built-in oven", note: "600 mm" },
      { id: "microwave", label: "Built-in microwave", note: "600 mm" },
      { id: "dishwasher", label: "Dishwasher", note: "600 mm" },
      { id: "cooktop", label: "Induction cooktop", note: "600 mm" },
      { id: "hood", label: "Extractor hood", note: "900 mm" },
      { id: "sink-faucet", label: "Sink + faucet", note: "860 mm bowl" },
    ],
  },
  {
    group: "Surfaces & hardware",
    items: [
      {
        id: "countertop",
        label: "Countertop + backsplash",
        note: "2000 mm run",
      },
      { id: "hardware", label: "Handles, plinth, end panel", note: "set" },
    ],
  },
];

/** The reference's builder map, keyed by catalogue ids; product metadata (bands, width flex, pricing) lives in the
 *  catalogue, not here. */
export interface Builders {
  "base-1door": () => THREE.Group;
  "base-2door": () => THREE.Group;
  "base-3drawer": () => THREE.Group;
  "base-panbank": () => THREE.Group;
  "base-sink": () => THREE.Group;
  "base-dishwasher": (widthM?: number) => THREE.Group;
  "base-dishwasher-450": () => THREE.Group;
  "base-corner-x": (widthM?: number) => THREE.Group;
  "base-corner-return": (widthM?: number) => THREE.Group;
  "base-corner": (
    widths?: Pick<KitchenCornerWidthsM, "xM" | "baseReturnM">,
  ) => THREE.Group;
  "wall-1door": () => THREE.Group;
  "wall-2door": () => THREE.Group;
  "wall-lift": () => THREE.Group;
  "open-shelf": () => THREE.Group;
  "tall-pantry": () => THREE.Group;
  "tall-oven-tower": () => THREE.Group;
  "tall-fridge-housing": () => THREE.Group;
  "fridge-free": () => THREE.Group;
  oven: () => THREE.Group;
  microwave: () => THREE.Group;
  dishwasher: (widthM?: number) => THREE.Group;
  cooktop: () => THREE.Group;
  hood: () => THREE.Group;
  "sink-faucet": () => THREE.Group;
  countertop: () => THREE.Group;
  hardware: () => THREE.Group;
  "kitchen-l": (cornerWidths?: KitchenCornerWidthsM) => THREE.Group;
}

export type BuilderKey = keyof Builders;

/** Widths handed to the fixed reference-room builder. The no-argument gallery path reads the
 *  fixture's authored 600 mm widths, even when the kit itself is at a later cabinet depth. */
export interface KitchenCornerWidthsM {
  readonly xM: number;
  readonly baseReturnM: number;
  readonly upperReturnM: number;
}

/** Width-parameterised factories. Insertion into an existing opening must build to the opening's
 *  width, not the catalogue default — mixing the two produced interpenetrating carcasses. */
export interface Factories {
  baseCabinet: (w: number, opts?: BaseCabinetOptions) => THREE.Group;
  wallCabinet: (
    W: number,
    doors: number,
    H?: number,
    D?: number,
    pushOpen?: boolean,
  ) => THREE.Group;
  wallCornerX: (W: number, H?: number, pushOpen?: boolean) => THREE.Group;
  openShelf: (
    W?: number,
    D?: number,
    inner?: number,
    H?: number,
  ) => THREE.Group;
  wallLift: (W?: number, H?: number, D?: number) => THREE.Group;
  hood: (w?: number, chimneyH?: number) => THREE.Group;
  cornerBaseX: (widthM: number) => THREE.Group;
  cornerBaseReturn: (LD: number, widthM: number) => THREE.Group;
  dishwasherHousing: (W?: number) => THREE.Group;
  bottleCargo: (w: number) => THREE.Group;
  hobBaseWithDrawers: (w: number) => THREE.Group;
  hobBaseWithOven: (w: number) => THREE.Group;
  tallPantry: (widthM: number, doors: number) => THREE.Group;
}

export interface BaseCabinetOptions {
  doors?: number;
  counterTop?: boolean;
  sink?: boolean;
  drawers?: number;
}

export interface KitMaterials {
  door: THREE.MeshPhysicalMaterial;
  carcass: THREE.MeshStandardMaterial;
  interior: THREE.MeshStandardMaterial;
  oak: THREE.MeshStandardMaterial;
  stone: THREE.MeshPhysicalMaterial;
  steel: THREE.MeshStandardMaterial;
  dark: THREE.MeshStandardMaterial;
  glassDark: THREE.MeshPhysicalMaterial;
  tile: THREE.MeshStandardMaterial;
  floor: THREE.MeshStandardMaterial;
  wall: THREE.MeshStandardMaterial;
  shadowGap: THREE.MeshStandardMaterial;
  steelIn: THREE.MeshStandardMaterial;
  steelDeep: THREE.MeshStandardMaterial;
}

/** `KitMaterials`'s values as a list, read by the ownership registry and by teardown suites. Filtered rather than
 *  asserted to be materials, so a non-material field is never disposed. */
export function kitMaterialList(M: KitMaterials): readonly THREE.Material[] {
  return Object.values(M as unknown as Record<string, unknown>).filter(
    isMaterial,
  );
}

/** The depths this kit derived from its declared cabinet depth; the seat, the rebuild and their tests read the same
 *  numbers the builders used, not agreeing literals (ADR 0028). */
export interface KitDepths {
  /** ADR 0036 decision 3's setting: the finished depth of a base cabinet, doors included. */
  readonly cabinetDepthM: number;
  /** The base carcass shell, `cabinetDepth − BASE_FRONT_OVERHANG_MM`. */
  readonly baseCarcassDepthM: number;
  /** What a fronted carcass stands in front of its own shell: the door slab and its bar handle. */
  readonly frontAssemblyDepthM: number;
  /** ADR 0039 decision 1: standard, and exempt from the depth map. */
  readonly hoodDepthM: number;
  /** ADR 0039 decision 2 and §11 row 19's second named exception: a front-hung hood's group origin
   *  sits this far off the wall plane, leaving `cabinetDepth − hoodDepth` of gap behind it. */
  readonly hoodSeatOffsetM: number;
  /** The corner return leg's depth, a placement variable: the carcass front of the base run it stands in line with.
   *  Published so the seeded decomposition builds the leg with the same number as `buildKitchen()`. */
  readonly cornerReturnDepthM: number;
  /** ADR 0028's map row: the declared depth of a wall or top carcass, doors included. A lookup, not a formula (100
   *  mm of cabinet buys 70 mm of wall), so it arrives as an option. */
  readonly wallDepthM: number;
}

export interface Kit {
  builders: Builders;
  M: KitMaterials;
  make: Factories;
  depths: KitDepths;
  /** Whether this kit's shared geometry cache owns `geometry`; a kit-owned geometry must never be disposed by a
   *  caller tearing one body down (see `makeKit`'s cache). */
  ownsGeometry: (geometry: THREE.BufferGeometry) => boolean;
}

/** Canvas factory seam: headless parity tests have no DOM, so procedural maps bake through an injectable canvas that
 *  defaults to the reference's own call and changes no geometry. */
export interface KitOptions {
  createCanvas?: () => HTMLCanvasElement;
  /** The cabinet depth in millimetres (the cabinets', never the worktop's). Kit-level, not per call, so the
   *  compounding round trip stays inert: no builder consumes a depth it is handed (ADR 0018 clause 4). */
  cabinetDepthMm?: number;
  /** The wall/top carcass depth from ADR 0028's map (330 at 600, 400 at 700). Passed in, as the map is a product
   *  rule (§12) and a formula would invent a 372 mm cabinet; `cabinet-depth-source.test.ts` holds it to the map. */
  wallDepthMm?: number;
}

/** The default cabinet depth, a literal rather than an import of the domain's `WORKTOP_DEPTH_MM` (§12 keeps product
 *  rules in the domain); `cabinet-depth-source.test.ts` asserts they are equal. */
export const DEFAULT_CABINET_DEPTH_MM = 600;

/** The wall depth the map gives for `DEFAULT_CABINET_DEPTH_MM`. A literal here for the same reason
 *  that one is, and held to the domain's map by the same gate. */
export const DEFAULT_WALL_DEPTH_MM = 330;

/** ADR 0036 decision 1: a declared dimension is the finished cabinet, so a base carcass is the declared depth less
 *  its fronts. 40, not the 39 mm they measure (`FRONT_ASSEMBLY_D`): no shipped dimension may move. */
const BASE_FRONT_OVERHANG_MM = 40;

/** The worktop overhangs its carcass by a constant, not a proportion: `counter` is 60 mm deeper than `CARC_D`,
 *  offset 20 mm forward, so 50 mm proud at the front and 10 mm behind (ADR 0018). */
const COUNTER_OVERHANG_MM = 60;

/** How far forward the worktop is seated on the carcass it sits on. */
const COUNTER_FORWARD_OFFSET_MM = 20;

/** How far the worktop hangs off the back of its carcass. It makes a base body's seat `cabinetDepth − 20` and is the
 *  front plane `cornerBaseReturn` must meet; derived so leg and run cannot drift (ADR 0018). */
const COUNTER_REAR_OVERHANG_MM =
  COUNTER_OVERHANG_MM / 2 - COUNTER_FORWARD_OFFSET_MM;

/** How far the worktop stands proud of the carcass front, 50 mm; the base return takes its slab end from here so it
 *  lands on the run's line. */
const COUNTER_FRONT_OVERHANG_MM =
  COUNTER_OVERHANG_MM / 2 + COUNTER_FORWARD_OFFSET_MM;

/** The induction plate's depth: a manufactured size (`docs/best-practices/product-invariants.md`) no setting
 *  reaches, as with the hood (ADR 0039). `cooktop` draws `cooktop_glass` from it so seat and plate cannot drift. */
const HOB_DEPTH_MM = 520;

/** ADR 0087: worktop left in front of the hob, declared so added depth lands behind it and the seat is derived
 *  (`HOB_SEAT_OFFSET_M`). 10 mm reproduces the shipped seat (330 − 10 − 260); zero would make it front-most. */
const HOB_FRONT_CLEARANCE_MM = 10;

/** The sink hole's depth, and so the bowl's: a manufactured size (560 × 400) no setting reaches. The worktop cut,
 *  the flanking slabs and `sink-faucet`'s `D` all read it so stone and bowl cannot drift (ADR 0098 decision 5). */
const SINK_APERTURE_DEPTH_MM = 400;

/** ADR 0098: worktop left in front of the sink; added depth lands behind it. 110 = (620 − 400) / 2 centres it at 600
 *  and re-baselines M1 parity (decision 3). Not derived from `HOB_FRONT_CLEARANCE_MM`: two appliances, two reasons. */
const SINK_FRONT_CLEARANCE_MM = 110;

/** The two front slabs, told apart only by mesh name: leaves on hinges and drawers on runners are priced differently
 *  (ADR 0070). `oven_filler_door_front` is neither: a fixed facade built by `ovenFillerFront`. */
export const DOOR_FRONT_MESH_NAME = "door_front";
export const DRAWER_FRONT_MESH_NAME = "drawer_front";

/** The finished panel closing wall A's base run; its along-wall seat is derived (ADR 0045, `kitchen-shell.ts`) while
 *  its existence stays a fixed manifest entry. */
export const RUN_END_PANEL_NAME = "end_panel_right";

/** The panel's slab, base height, air gap and offset, declared in the domain's `run-end-panel.ts` and re-exported so
 *  builder and seating rule read one set of numbers (ADR 0083 decision 5). */
export {
  RUN_END_PANEL_EDGE_OFFSET_M,
  RUN_END_PANEL_GAP_M,
  RUN_END_PANEL_HEIGHT_M,
  RUN_END_PANEL_THICKNESS_M,
};

/** The panel's along-wall seat in the reference room, its own literal because M1's parity gate diffs it at 1e-6 m.
 *  Also where `syncRunEndPanel` parks the hidden panel. */
export const RUN_END_PANEL_SEEDED_X_M = 3.51;

export function makeKit(options: KitOptions = {}): Kit {
  const createCanvas =
    options.createCanvas ?? (() => document.createElement("canvas"));
  // Millimetres divided once, never metres subtracted: `0.6 - 0.04` is 0.5599999999999999 in
  // IEEE-754 and M1's parity gate diffs at 1e-6 m, so the arithmetic is done where it is exact.
  const cabinetDepthMm = options.cabinetDepthMm ?? DEFAULT_CABINET_DEPTH_MM;
  const cabinetDepthM = cabinetDepthMm / 1000;
  const carcassDepthM = (cabinetDepthMm - BASE_FRONT_OVERHANG_MM) / 1000;
  const wallDepthM = (options.wallDepthMm ?? DEFAULT_WALL_DEPTH_MM) / 1000;
  const counterDepthMm =
    cabinetDepthMm - BASE_FRONT_OVERHANG_MM + COUNTER_OVERHANG_MM;
  const counterDepthM = counterDepthMm / 1000;

  const mat = (
    name: string,
    color: string,
    o: THREE.MeshStandardMaterialParameters = {},
  ): THREE.MeshStandardMaterial =>
    Object.assign(
      new THREE.MeshStandardMaterial({
        color,
        roughness: 0.6,
        metalness: 0,
        ...o,
      }),
      { name },
    );
  const phys = (
    name: string,
    color: string,
    o: THREE.MeshPhysicalMaterialParameters = {},
  ): THREE.MeshPhysicalMaterial =>
    Object.assign(
      new THREE.MeshPhysicalMaterial({
        color,
        roughness: 0.6,
        metalness: 0,
        ...o,
      }),
      { name },
    );

  function tex(
    draw: (x: CanvasRenderingContext2D, w: number, h: number) => void,
    w: number,
    h: number,
    repeat: readonly [number, number] = [1, 1],
    srgb = true,
  ): THREE.CanvasTexture {
    const c = createCanvas();
    c.width = w;
    c.height = h;
    draw(context2d(c), w, h);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
    t.anisotropy = 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  const rnd = (seed: number) => {
    let s = seed;
    return () => (s = (s * 16807) % 2147483647) / 2147483647;
  };

  const woodTex = (base: string, dark: string, seed = 7) =>
    tex(
      (x, w, h) => {
        const r = rnd(seed);
        x.fillStyle = base;
        x.fillRect(0, 0, w, h);
        for (let i = 0; i < 190; i++) {
          const y = r() * h,
            amp = 3 + r() * 9,
            thick = 0.6 + r() * 2.6;
          x.strokeStyle = dark;
          x.globalAlpha = 0.04 + r() * 0.14;
          x.lineWidth = thick;
          x.beginPath();
          for (let px = 0; px <= w; px += 16)
            x.lineTo(
              px,
              y + Math.sin((px / w) * Math.PI * (1 + r() * 2) + i) * amp,
            );
          x.stroke();
        }
        x.globalAlpha = 1;
      },
      512,
      512,
    );

  const stoneTex = tex(
    (x, w, h) => {
      const r = rnd(23);
      x.fillStyle = "#212226";
      x.fillRect(0, 0, w, h);
      for (let i = 0; i < 2600; i++) {
        const s = r() * 2.4;
        x.fillStyle = r() > 0.72 ? "#4b4d53" : "#191a1d";
        x.globalAlpha = 0.25 + r() * 0.5;
        x.beginPath();
        x.arc(r() * w, r() * h, s, 0, 6.283);
        x.fill();
      }
      x.globalAlpha = 1;
    },
    512,
    512,
  );

  const tileTex = tex(
    (x, w, h) => {
      x.fillStyle = "#e9e6df";
      x.fillRect(0, 0, w, h);
      x.strokeStyle = "#cfcabf";
      x.lineWidth = 3;
      const n = 4,
        s = w / n;
      for (let i = 0; i <= n; i++) {
        x.beginPath();
        x.moveTo(i * s, 0);
        x.lineTo(i * s, h);
        x.stroke();
        x.beginPath();
        x.moveTo(0, i * s);
        x.lineTo(w, i * s);
        x.stroke();
      }
    },
    512,
    512,
  );

  const brushTex = tex(
    (x, w, h) => {
      const r = rnd(5);
      x.fillStyle = "#ffffff";
      x.fillRect(0, 0, w, h);
      for (let i = 0; i < 1400; i++) {
        x.globalAlpha = 0.05 + r() * 0.12;
        x.strokeStyle = r() > 0.5 ? "#000" : "#fff";
        const y = r() * h;
        x.lineWidth = 0.6 + r();
        x.beginPath();
        x.moveTo(0, y);
        x.lineTo(w, y);
        x.stroke();
      }
      x.globalAlpha = 1;
    },
    512,
    128,
    [1, 1],
    false,
  );

  const oakTex = woodTex("#c08d51", "#7b5527", 7);
  const floorTex = woodTex("#c4986a", "#6b4826", 19);

  const M: KitMaterials = {
    door: phys("door_matte_white", "#eceeeb", {
      roughness: 0.28,
      clearcoat: 0.55,
      clearcoatRoughness: 0.3,
    }),
    carcass: mat("carcass_white", "#d9d8d3", { roughness: 0.78 }),
    interior: mat("interior_board", "#cfccc4", { roughness: 0.9 }),
    oak: mat("oak", "#ffffff", { roughness: 0.62, map: oakTex }),
    stone: phys("black_stone", "#ffffff", {
      roughness: 0.22,
      map: stoneTex,
      clearcoat: 0.7,
      clearcoatRoughness: 0.18,
    }),
    steel: mat("stainless", "#cfd4d9", {
      roughness: 0.24,
      metalness: 0.92,
      roughnessMap: brushTex,
    }),
    dark: mat("graphite", "#3a3d40", { roughness: 0.45, metalness: 0.15 }),
    glassDark: phys("smoked_glass", "#15171a", {
      roughness: 0.06,
      clearcoat: 1,
      clearcoatRoughness: 0.04,
    }),
    tile: mat("backsplash_tile", "#ffffff", { roughness: 0.35, map: tileTex }),
    floor: mat("floor_oak", "#ffffff", { roughness: 0.42, map: floorTex }),
    wall: mat("wall_paint", "#e8e5df", { roughness: 0.96 }),
    shadowGap: mat("shadow_gap", "#16181a", { roughness: 0.95 }),
    steelIn: mat("stainless_satin", "#8d949b", {
      roughness: 0.55,
      metalness: 0.6,
    }),
    steelDeep: mat("stainless_deep", "#6f767d", {
      roughness: 0.62,
      metalness: 0.55,
    }),
  };
  oakTex.repeat.set(1, 1);
  floorTex.repeat.set(4, 4);
  tileTex.repeat.set(6, 1);

  // Recorded as this kit's own the moment they exist, so a teardown never has to guess which resources are shared
  // (`kit-ownership.ts`).
  const owned = kitOwnedResources(M);
  for (const material of kitMaterialList(M)) owned.materials.add(material);
  for (const texture of [oakTex, floorTex, stoneTex, tileTex, brushTex]) {
    owned.textures.add(texture);
  }

  // A 1.6 mm chamfer: sharp edges are the biggest low-poly tell, and a chamfer catches a highlight on every edge.
  const geoCache = new Map<string, THREE.ExtrudeGeometry>();
  // Memoised by size, so geometries are shared by every mesh of that size in every body this kit builds; `ownsGeometry`
  // tells a caller which buffers it may dispose, and only `disposeKitAndStage` may dispose from the cache.
  function chamferBox(w: number, h: number, d: number): THREE.ExtrudeGeometry {
    const k = w.toFixed(4) + "," + h.toFixed(4) + "," + d.toFixed(4);
    const cached = geoCache.get(k);
    if (cached) return cached;
    const r = Math.min(0.0016, w / 3, h / 3, d / 3);
    const W = w - 2 * r,
      H = h - 2 * r,
      D = d - 2 * r;
    const s = new THREE.Shape();
    const x0 = -W / 2,
      y0 = -H / 2,
      rc = Math.min(r, W / 2.01, H / 2.01);
    s.moveTo(x0 + rc, y0);
    s.lineTo(x0 + W - rc, y0);
    s.quadraticCurveTo(x0 + W, y0, x0 + W, y0 + rc);
    s.lineTo(x0 + W, y0 + H - rc);
    s.quadraticCurveTo(x0 + W, y0 + H, x0 + W - rc, y0 + H);
    s.lineTo(x0 + rc, y0 + H);
    s.quadraticCurveTo(x0, y0 + H, x0, y0 + H - rc);
    s.lineTo(x0, y0 + rc);
    s.quadraticCurveTo(x0, y0, x0 + rc, y0);
    const g = new THREE.ExtrudeGeometry(s, {
      depth: D,
      bevelEnabled: true,
      bevelSize: r,
      bevelThickness: r,
      bevelSegments: 1,
      curveSegments: 1,
      steps: 1,
    });
    g.translate(0, 0, -D / 2);
    g.computeVertexNormals();
    geoCache.set(k, g);
    owned.geometries.add(g);
    return g;
  }

  const box = (
    w: number,
    h: number,
    d: number,
    m: THREE.Material,
    name: string,
    x = 0,
    y = 0,
    z = 0,
  ): THREE.Mesh => {
    const g = new THREE.Mesh(chamferBox(w, h, d), m);
    g.name = name;
    g.position.set(x, y + h / 2, z);
    return g;
  };
  const plainBox = (
    w: number,
    h: number,
    d: number,
    m: THREE.Material,
    name: string,
    x = 0,
    y = 0,
    z = 0,
  ): THREE.Mesh => {
    const g = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    g.name = name;
    g.position.set(x, y + h / 2, z);
    return g;
  };
  const cyl = (
    r: number,
    h: number,
    m: THREE.Material,
    name: string,
    seg = 24,
  ): THREE.Mesh => {
    const g = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), m);
    g.name = name;
    return g;
  };
  const G = (name: string): THREE.Group => {
    const g = new THREE.Group();
    g.name = name;
    return g;
  };

  function barHandle(
    len: number,
    z: number,
    x: number,
    y: number,
    vertical = false,
  ): THREE.Group {
    const g = G("handle");
    const bar = cyl(0.006, len, M.steel, "handle_bar", 20);
    if (!vertical) bar.rotation.z = Math.PI / 2;
    bar.position.set(0, 0, 0.024);
    g.add(bar);
    for (const s of [-1, 1]) {
      const st = cyl(0.005, 0.024, M.steel, "handle_stem", 12);
      st.rotation.x = Math.PI / 2;
      const off = len / 2 - 0.018;
      st.position.set(vertical ? 0 : s * off, vertical ? s * off : 0, 0.012);
      g.add(st);
    }
    g.position.set(x, y, z);
    return g;
  }

  const TH = 0.018; // door / panel thickness

  /** A hinged leaf. `handleEdge` says only where the bar goes, never door versus drawer: `'top'` covers both (the
   *  oven tower's lower leaf is a door); overhead leaves take the bottom edge, where a hand reaches. */
  function doorSlab(
    w: number,
    h: number,
    x: number,
    y: number,
    z: number,
    handleEdge: HandleEdge = "top",
  ): THREE.Group {
    return frontSlab(w, h, x, y, z, handleEdge, DOOR_FRONT_MESH_NAME);
  }

  /** A drawer front, the only way this kit says so: declared here, never inferred from the handle edge (ADR 0061).
   *  Its bar is always on the top edge. Recolouring is unaffected: `FRONT_MESH_NAME` matches both names. */
  function drawerSlab(
    w: number,
    h: number,
    x: number,
    y: number,
    z: number,
  ): THREE.Group {
    return frontSlab(w, h, x, y, z, "top", DRAWER_FRONT_MESH_NAME);
  }

  function frontSlab(
    w: number,
    h: number,
    x: number,
    y: number,
    z: number,
    handleEdge: HandleEdge,
    frontMeshName: string,
  ): THREE.Group {
    const g = G("door");
    g.add(box(w, h, TH, M.door, frontMeshName, 0, -h, 0));
    if (handleEdge === "none") {
      /* push-to-open */
    } else if (handleEdge === "top")
      g.add(barHandle(Math.min(w - 0.12, 0.19), 0, 0, -0.04, false));
    else if (handleEdge === "bottom")
      g.add(barHandle(Math.min(w - 0.12, 0.19), 0, 0, -h + 0.04, false));
    else {
      const s = handleEdge === "left" ? -1 : 1;
      g.add(
        barHandle(
          Math.min(h - 0.12, 0.21),
          0,
          s * (w / 2 - 0.04),
          -h / 2,
          true,
        ),
      );
    }
    g.position.set(x, y, z);
    return g;
  }

  const GAP = 0.004;

  /** What a fronted carcass stands in front of its shell: `TH/2 + 0.024 + 0.006` = 39 mm (slab plus bar). One
   *  constant though `pushOpen` hides the bar, since §6.5 builds handles to be switched back on. */
  const FRONT_ASSEMBLY_D = TH / 2 + 0.024 + 0.006;

  // §7's full-height band, and the width every column but the pantry is fixed at (ADR 0048).
  const TALL_UNIT_HEIGHT_M = 2.2,
    COLUMN_WIDTH_M = 0.6;

  // Fixture widths at the authored 600 mm depth: a later depth slides stored widths and never resizes a corner.
  const referenceCornerPieces = cornerAssemblyWidthsMm({
    cabinetDepthMm: WORKTOP_DEPTH_MM,
    room: KITCHEN_L_DESIGN.room,
  }).pieces;
  const referenceCornerWidthM = (
    wall: "A" | "B",
    band: "base" | "wall",
  ): number => {
    const piece = referenceCornerPieces.find(
      (candidate) => candidate.wall === wall && candidate.band === band,
    );
    if (!piece)
      throw new Error(`Missing ${wall} ${band} reference corner width`);
    return piece.widthMm / 1000;
  };
  const referenceCornerWidthsM: KitchenCornerWidthsM = {
    xM: referenceCornerWidthM("A", "base"),
    baseReturnM: referenceCornerWidthM("B", "base"),
    upperReturnM: referenceCornerWidthM("B", "wall"),
  };

  // Manufactured machines keep their fixed widths across every cabinet-depth setting.
  const FREESTANDING_FRIDGE_WIDTH_M = 0.7;
  const FREESTANDING_FRIDGE_DEPTH_M = 0.68;

  const PLINTH = 0.1,
    CARC_H = 0.72,
    // Derived from the declared cabinet depth: 0.56 at 600 to the last micrometre, which keeps M1 parity.
    CARC_D = carcassDepthM,
    // A base carcass's front face in its local frame: the line every door, fascia and worktop is offset from.
    carcassFrontM = CARC_D / 2,
    CTOP = 0.04;

  // A base door is 6 mm narrower, 10 mm shorter and stands 6 mm above the carcass bottom (4 mm below the top plus the
  // 10 mm shortfall).
  const DOOR_WIDTH_REVEAL_M = 0.006,
    DOOR_HEIGHT_REVEAL_M = 0.01,
    DOOR_BOTTOM_REVEAL_M = 0.006;

  function plinth(w: number, d: number, name = "plinth"): THREE.Mesh {
    return box(w - 0.004, PLINTH, d - 0.06, M.dark, name, 0, 0, -0.03);
  }
  function carcass(w: number, h: number, d: number, y: number): THREE.Group {
    const g = G("carcass");
    g.add(box(w, h, d, M.carcass, "carcass_shell", 0, y, 0));
    g.add(
      box(
        w - 0.036,
        h - 0.036,
        0.004,
        M.interior,
        "carcass_back",
        0,
        y + 0.018,
        -d / 2 + 0.01,
      ),
    );
    // dark liner behind the fronts so the 3 mm shadow gaps actually read
    g.add(
      box(
        w - 0.004,
        h - 0.004,
        0.003,
        M.shadowGap,
        "front_liner",
        0,
        y + 0.002,
        d / 2 - 0.0015,
      ),
    );
    return g;
  }
  function counter(
    w: number,
    d = counterDepthM,
    y = PLINTH + CARC_H,
    name = "countertop",
  ): THREE.Mesh {
    return box(
      w,
      CTOP,
      d,
      M.stone,
      name,
      0,
      y,
      COUNTER_FORWARD_OFFSET_MM / 1000,
    );
  }

  function baseCabinet(w: number, opts: BaseCabinetOptions = {}): THREE.Group {
    const { doors = 2, counterTop = true, sink = false, drawers = 0 } = opts;
    const g = G("base_cabinet");
    g.add(plinth(w, CARC_D));
    if (sink) g.add(carcassFrame(w, CARC_H, CARC_D, PLINTH, true));
    else g.add(carcass(w, CARC_H, CARC_D, PLINTH));
    const fz = carcassFrontM + TH / 2,
      top = PLINTH + CARC_H;
    if (drawers) {
      const hs = drawers === 3 ? [0.24, 0.24, 0.24] : [0.36, 0.36];
      let y = PLINTH;
      for (const h of hs) {
        g.add(drawerSlab(w - 0.006, h - GAP, 0, y + h, fz));
        y += h;
      }
    } else if (doors === 1) {
      g.add(doorSlab(w - 0.006, CARC_H - 0.01, 0, top - 0.004, fz, "right"));
    } else if (doors === 2) {
      const dw = (w - 0.009) / 2;
      g.add(
        doorSlab(dw, CARC_H - 0.01, -(dw + GAP) / 2, top - 0.004, fz, "right"),
      );
      g.add(
        doorSlab(dw, CARC_H - 0.01, (dw + GAP) / 2, top - 0.004, fz, "left"),
      );
    }
    if (counterTop && !sink) g.add(counter(w));
    if (sink) {
      // ADR 0098: the worktop splits around a 560 × 400 aperture at `SINK_SEAT_OFFSET_M`; all four slabs and the
      // assembly share one seat and aperture depth, or the bowl stands still as the worktop grows.
      const y = PLINTH + CARC_H,
        ax = 0.28,
        az = SINK_APERTURE_DEPTH_MM / 2 / 1000,
        worktopFrontM = COUNTER_FORWARD_OFFSET_MM / 1000 + counterDepthM / 2,
        worktopBackM = COUNTER_FORWARD_OFFSET_MM / 1000 - counterDepthM / 2,
        apertureFrontM = SINK_SEAT_OFFSET_M + az,
        apertureBackM = SINK_SEAT_OFFSET_M - az;
      g.add(
        box(
          w,
          CTOP,
          worktopFrontM - apertureFrontM,
          M.stone,
          "countertop_front",
          0,
          y,
          (apertureFrontM + worktopFrontM) / 2,
        ),
      );
      g.add(
        box(
          w,
          CTOP,
          apertureBackM - worktopBackM,
          M.stone,
          "countertop_back",
          0,
          y,
          (worktopBackM + apertureBackM) / 2,
        ),
      );
      const side = w / 2 - ax;
      for (const s of [-1, 1])
        g.add(
          box(
            side,
            CTOP,
            az * 2,
            M.stone,
            "countertop_side",
            s * (ax + side / 2),
            y,
            SINK_SEAT_OFFSET_M,
          ),
        );
      const sk = builders["sink-faucet"]();
      sk.position.set(0, y + CTOP, SINK_SEAT_OFFSET_M);
      g.add(sk);
    }
    return g;
  }

  /** The narrow ~200 mm pull-out for bottles: one `drawerSlab` over the whole carcass height, priced as a drawer
   *  (ADR 0070), with a horizontal top bar. Not an option on `baseCabinet`, which already branches four ways. */
  function bottleCargo(w: number): THREE.Group {
    const g = G("bottle_cargo");
    g.add(plinth(w, CARC_D));
    g.add(carcass(w, CARC_H, CARC_D, PLINTH));
    const fz = carcassFrontM + TH / 2;
    g.add(drawerSlab(w - 0.006, CARC_H - 0.01, 0, PLINTH + CARC_H - 0.004, fz));
    g.add(counter(w));
    return g;
  }

  /** Where the worktop's front edge (where the cook stands) falls in a base body's frame, in millimetres: the slab
   *  is `COUNTER_OVERHANG_MM` deeper than its carcass, seated `COUNTER_FORWARD_OFFSET_MM` forward. */
  const worktopFrontMm = COUNTER_FORWARD_OFFSET_MM + counterDepthMm / 2;

  /** ADR 0087: the hob's local offset on its worktop, derived from `HOB_FRONT_CLEARANCE_MM` (60 mm at 600, 110 at
   *  700), in millimetres divided once (see `makeKit`). Composed onto the cabinet's seat, not parented. */
  const HOB_SEAT_OFFSET_M =
    (worktopFrontMm - HOB_FRONT_CLEARANCE_MM - HOB_DEPTH_MM / 2) / 1000;

  /** ADR 0098: the sink assembly's local offset on its worktop, derived from `SINK_FRONT_CLEARANCE_MM` (20 mm at
   *  600, 70 at 700). Applied where composed onto the cabinet, not in `sink-faucet`, also offered standalone. */
  const SINK_SEAT_OFFSET_M =
    (worktopFrontMm - SINK_FRONT_CLEARANCE_MM - SINK_APERTURE_DEPTH_MM / 2) /
    1000;

  /** How far a built-in oven's origin stands behind the carcass front plane it mounts on, in metres. Its mounting
   *  follows the carcass front: held flat at 0.018 a 700 mm tower finished at 699, not 738 (ADR 0058). */
  const OVEN_ORIGIN_BEHIND_CARCASS_FRONT_M = 0.262;

  /** The oven's forward offset in its carcass, shared with `tall-oven-tower` so the appliances line up. It
   *  deliberately does not bring the oven flush: do not "correct" it without changing the tower too. */
  const OVEN_FORWARD_OFFSET_M =
    carcassFrontM - OVEN_ORIGIN_BEHIND_CARCASS_FRONT_M;

  /** The microwave's, mounted on the same carcass front as the oven so the two fascias stay on one plane at every
   *  depth. */
  const MICROWAVE_ORIGIN_BEHIND_CARCASS_FRONT_M = 0.191;
  const MICROWAVE_FORWARD_OFFSET_M =
    carcassFrontM - MICROWAVE_ORIGIN_BEHIND_CARCASS_FRONT_M;

  function seatHobOnWorktop(cabinet: THREE.Group): THREE.Group {
    const hob = builders.cooktop();
    hob.position.set(0, PLINTH + CARC_H + CTOP, HOB_SEAT_OFFSET_M);
    cabinet.add(hob);
    return cabinet;
  }

  /** ADR 0027: a hob over two pan drawers, composed as `baseCabinet(w, { drawers: 2 })` carrying
   *  `builders.cooktop()`, the pair `buildKitchen()` renders. */
  function hobBaseWithDrawers(w: number): THREE.Group {
    return seatHobOnWorktop(baseCabinet(w, { drawers: 2 }));
  }

  /** ADR 0027: a hob over a built-in oven, in an open-front carcass because the appliance is the front. The oven
   *  sits on the carcass floor; the 125 mm above it holds the hob's box, dressed by `ovenFillerFront`. */
  function hobBaseWithOven(w: number): THREE.Group {
    const g = G("base_cabinet");
    g.add(plinth(w, CARC_D));
    g.add(carcassFrame(w, CARC_H, CARC_D, PLINTH));
    const oven = builders.oven();
    oven.position.set(0, PLINTH, OVEN_FORWARD_OFFSET_M);
    g.add(oven);
    g.add(ovenFillerFront(w, oven));
    g.add(counter(w));
    return seatHobOnWorktop(g);
  }

  /** The band the oven leaves under the worktop, closed by a fixed handleless front. Its name must match
   *  `FRONT_MESH_NAME`, or finishing silently turns off for `base-hob-oven`. Measured off the built oven, not typed. */
  function ovenFillerFront(w: number, oven: THREE.Group): THREE.Mesh {
    const bandBottom = new THREE.Box3().setFromObject(oven).max.y + GAP;
    return box(
      w - 0.006,
      PLINTH + CARC_H - bandBottom,
      TH,
      M.door,
      "oven_filler_door_front",
      0,
      bandBottom,
      carcassFrontM + TH / 2,
    );
  }

  const builders: Builders = {
    "base-1door": () => baseCabinet(0.4, { doors: 1 }),
    "base-2door": () => baseCabinet(0.8, { doors: 2 }),
    "base-3drawer": () => baseCabinet(0.6, { drawers: 3 }),
    "base-panbank": () => baseCabinet(0.6, { drawers: 2 }),
    "base-sink": () => baseCabinet(0.8, { doors: 2, sink: true }),
    "base-dishwasher": (W = 0.6) => dishwasherHousing(W),
    "base-dishwasher-450": () => dishwasherHousing(0.45),

    "base-corner-x": (widthM = referenceCornerWidthsM.xM) =>
      cornerBaseX(widthM),
    "base-corner-return": (widthM = referenceCornerWidthsM.baseReturnM) =>
      cornerBaseReturn(CORNER_RETURN_DEPTH_M, widthM),
    // Preview only: two independent bodies at their production junction, each placed as `buildKitchen()` places it;
    // nothing is parented.
    "base-corner": (widths = referenceCornerWidthsM) => {
      const g = G("corner_base_pair");
      const x = cornerBaseX(widths.xM);
      x.position.set(widths.xM / 2, 0, cornerBaseXSeatM);
      g.add(x);
      const r = cornerBaseReturn(CORNER_RETURN_DEPTH_M, widths.baseReturnM);
      r.position.set(
        CORNER_RETURN_DEPTH_M / 2,
        0,
        CORNER_RETURN_DEPTH_M + widths.baseReturnM / 2,
      );
      r.rotation.y = Math.PI / 2;
      g.add(r);
      return g;
    },

    "wall-1door": () => wallCabinet(0.4, 1),
    "wall-2door": () => wallCabinet(0.8, 2),
    "wall-lift": () => wallLift(),
    "open-shelf": () => openShelf(0.8, 0.3, 2),

    // ADR 0048: the reference's own 600 mm two-door pantry through the width-parameterised factory; literals unchanged.
    "tall-pantry": () => tallPantry(COLUMN_WIDTH_M, 2),
    "tall-oven-tower": () => {
      const g = G("tall_unit");
      const W = 0.6,
        fz = carcassFrontM + TH / 2;
      g.add(plinth(W, CARC_D));
      g.add(carcassFrame(W, 0.52, CARC_D, PLINTH));
      g.add(carcassFrame(W, 1.06, CARC_D, PLINTH + 0.52));
      g.add(carcass(W, 0.52, CARC_D, PLINTH + 1.58));
      g.add(
        box(
          W - 0.036,
          0.018,
          CARC_D - 0.02,
          M.carcass,
          "shelf_mid",
          0,
          PLINTH + 1.11,
          0,
        ),
      );
      g.add(doorSlab(0.594, 0.5, 0, 0.6, fz, "top"));
      const ov = builders.oven();
      ov.position.set(0, 0.63, OVEN_FORWARD_OFFSET_M);
      g.add(ov);
      const mw = builders.microwave();
      mw.position.set(0, 1.25, MICROWAVE_FORWARD_OFFSET_M);
      g.add(mw);
      g.add(doorSlab(0.594, 0.5, 0, 2.2, fz, "bottom"));
      return g;
    },
    "tall-fridge-housing": () => {
      const g = tallCarcass();
      const fz = carcassFrontM + TH / 2,
        W = 0.594;
      g.add(doorSlab(W, 1.35, 0, PLINTH + 1.35, fz, "right"));
      g.add(doorSlab(W, 0.53, 0, PLINTH + 1.9, fz, "right"));
      g.add(doorSlab(W, 0.19, 0, 2.2, fz, "bottom"));
      g.add(
        box(
          W - 0.02,
          0.9,
          0.5,
          M.interior,
          "fridge_interior",
          0,
          PLINTH + 0.3,
          -0.02,
        ),
      );
      return g;
    },

    "fridge-free": () => {
      const g = G("fridge_freestanding");
      const W = FREESTANDING_FRIDGE_WIDTH_M,
        D = FREESTANDING_FRIDGE_DEPTH_M,
        H = 1.85,
        split = 1.15;
      g.add(box(W, H, D, M.steel, "fridge_body", 0, 0, 0));
      g.add(
        box(
          W - 0.006,
          split - 0.006,
          0.03,
          M.steel,
          "fridge_door_lower",
          0,
          0.004,
          D / 2 + 0.001,
        ),
      );
      g.add(
        box(
          W - 0.006,
          H - split - 0.01,
          0.03,
          M.steel,
          "fridge_door_upper",
          0,
          split + 0.006,
          D / 2 + 0.001,
        ),
      );
      for (const y of [0.55, split + 0.28])
        g.add(barHandle(0.42, D / 2 + 0.032, W / 2 - 0.06, y, true));
      g.add(
        box(W - 0.1, 0.001, 0.001, M.dark, "seam", 0, split, D / 2 + 0.032),
      );
      for (const x of [-0.28, 0.28])
        for (const z of [-0.28, 0.28]) {
          const f = cyl(0.02, 0.04, M.dark, "foot", 12);
          f.position.set(x, 0.02, z);
          g.add(f);
        }
      return g;
    },
    oven: () => {
      const g = G("oven");
      const W = 0.596,
        H = 0.595,
        D = 0.56;
      g.add(box(W - 0.06, H - 0.02, 0.48, M.dark, "oven_cavity", 0, 0, -0.015));
      g.add(box(W, H, 0.026, M.steel, "oven_front", 0, 0, D / 2 - 0.02));
      g.add(
        box(
          W - 0.09,
          H - 0.2,
          0.01,
          M.glassDark,
          "oven_glass",
          0,
          0.045,
          D / 2 + 0.003,
        ),
      );
      g.add(
        box(
          W - 0.04,
          0.045,
          0.012,
          M.glassDark,
          "oven_panel",
          0,
          H - 0.075,
          D / 2 + 0.002,
        ),
      );
      g.add(barHandle(W - 0.09, D / 2 + 0.03, 0, H - 0.11, false));
      return g;
    },
    microwave: () => {
      const g = G("microwave");
      const W = 0.596,
        H = 0.38,
        D = 0.42;
      g.add(box(W - 0.06, H - 0.02, 0.36, M.dark, "mw_cavity", 0, 0, -0.05));
      g.add(box(W, H, 0.024, M.steel, "mw_front", 0, 0, D / 2 - 0.02));
      g.add(
        box(
          W - 0.19,
          H - 0.1,
          0.008,
          M.glassDark,
          "mw_glass",
          -0.08,
          0.05,
          D / 2 + 0.003,
        ),
      );
      g.add(
        box(
          0.115,
          H - 0.1,
          0.008,
          M.glassDark,
          "mw_panel",
          0.22,
          0.05,
          D / 2 + 0.003,
        ),
      );
      g.add(barHandle(W - 0.1, D / 2 + 0.028, 0, H - 0.07, false));
      return g;
    },
    dishwasher: (Wn = 0.6) => exposedDishwasher(Wn),
    cooktop: () => {
      const g = G("induction_cooktop");
      g.add(
        box(
          0.59,
          0.012,
          HOB_DEPTH_MM / 1000,
          M.glassDark,
          "cooktop_glass",
          0,
          0,
          0,
        ),
      );
      const rings: readonly (readonly [number, number, number])[] = [
        [-0.145, -0.15, 0.085],
        [0.145, -0.15, 0.1],
        [-0.145, 0.08, 0.1],
        [0.145, 0.08, 0.075],
      ];
      for (const [x, z, r] of rings) {
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(r, 0.004, 8, 40),
          M.steel,
        );
        ring.name = "burner_ring";
        ring.rotation.x = Math.PI / 2;
        ring.position.set(x, 0.013, z);
        g.add(ring);
      }
      g.add(box(0.26, 0.002, 0.03, M.steel, "touch_panel", 0, 0.012, 0.225));
      return g;
    },
    hood: () => hood(0.9),
    "sink-faucet": () => {
      const g = G("sink_faucet");
      // `D` is the declaration `baseCabinet` cuts its worktop from (ADR 0098 decision 5). The depth-axis seat is
      // composed by the caller via `SINK_SEAT_OFFSET_M`, as this builder is also offered standalone.
      const W = 0.56,
        D = SINK_APERTURE_DEPTH_MM / 1000,
        AX = W / 2 - 0.02,
        AZ = D / 2 - 0.02; // aperture half-sizes
      g.add(
        box(W, 0.012, 0.02, M.steel, "sink_rim_front", 0, -0.012, AZ + 0.01),
      );
      g.add(
        box(W, 0.012, 0.02, M.steel, "sink_rim_back", 0, -0.012, -AZ - 0.01),
      );
      g.add(
        box(
          0.02,
          0.012,
          D - 0.04,
          M.steel,
          "sink_rim_left",
          -AX - 0.01,
          -0.012,
          0,
        ),
      );
      g.add(
        box(
          0.02,
          0.012,
          D - 0.04,
          M.steel,
          "sink_rim_right",
          AX + 0.01,
          -0.012,
          0,
        ),
      );
      const WT = 0.014,
        BD = 0.185; // wall thickness, bowl depth
      g.add(
        box(
          W - 0.002,
          0.012,
          0.002,
          M.shadowGap,
          "bowl_edge_front",
          0,
          -0.024,
          D / 2 - 0.001,
        ),
      );
      g.add(
        box(
          W - 0.002,
          0.012,
          0.002,
          M.shadowGap,
          "bowl_edge_back",
          0,
          -0.024,
          -D / 2 + 0.001,
        ),
      );
      g.add(
        box(
          0.002,
          0.012,
          D - 0.004,
          M.shadowGap,
          "bowl_edge_left",
          -W / 2 + 0.001,
          -0.024,
          0,
        ),
      );
      g.add(
        box(
          0.002,
          0.012,
          D - 0.004,
          M.shadowGap,
          "bowl_edge_right",
          W / 2 - 0.001,
          -0.024,
          0,
        ),
      );
      g.add(
        box(
          WT,
          BD,
          D,
          M.steelIn,
          "bowl_wall_left",
          -W / 2 + WT / 2,
          -BD - 0.024,
          0,
        ),
      );
      g.add(
        box(
          WT,
          BD,
          D,
          M.steelIn,
          "bowl_wall_right",
          W / 2 - WT / 2,
          -BD - 0.024,
          0,
        ),
      );
      g.add(
        box(
          W - 2 * WT,
          BD,
          WT,
          M.steelDeep,
          "bowl_wall_back",
          0,
          -BD - 0.024,
          -D / 2 + WT / 2,
        ),
      );
      g.add(
        box(
          W - 2 * WT,
          BD,
          WT,
          M.steelIn,
          "bowl_wall_front",
          0,
          -BD - 0.024,
          D / 2 - WT / 2,
        ),
      );
      g.add(box(W, 0.012, D, M.steelDeep, "bowl_floor", 0, -BD - 0.036, 0));
      const drain = cyl(0.036, 0.004, M.steelIn, "drain_ring", 32);
      drain.position.set(0, -BD - 0.022, 0);
      g.add(drain);
      const grate = cyl(0.028, 0.008, M.shadowGap, "drain_hole", 32);
      grate.position.set(0, -BD - 0.026, 0);
      g.add(grate);
      const f = G("faucet");
      const plate = cyl(0.048, 0.008, M.steel, "faucet_escutcheon", 40);
      plate.position.y = 0.004;
      f.add(plate);
      const col = cyl(0.019, 0.262, M.steel, "faucet_column", 32);
      col.position.y = 0.139;
      f.add(col);
      const hub = cyl(0.026, 0.062, M.steel, "faucet_hub", 32);
      hub.rotation.z = Math.PI / 2;
      hub.position.set(0.018, 0.185, 0);
      f.add(hub);
      const lever = cyl(0.009, 0.13, M.steel, "faucet_lever", 20);
      lever.rotation.x = -Math.PI / 14;
      lever.position.set(0.045, 0.245, 0.012);
      f.add(lever);
      const arch = new THREE.Mesh(
        new THREE.TorusGeometry(0.075, 0.017, 16, 60, Math.PI),
        M.steel,
      );
      arch.name = "faucet_gooseneck";
      arch.position.set(0, 0.27, 0.075);
      arch.rotation.y = Math.PI / 2;
      f.add(arch);
      const head = new THREE.Mesh(
        new THREE.CylinderGeometry(0.018, 0.026, 0.095, 32),
        M.steel,
      );
      head.name = "faucet_sprayhead";
      head.position.set(0, 0.224, 0.15);
      f.add(head);
      const nozzle = cyl(0.024, 0.008, M.dark, "faucet_nozzle", 32);
      nozzle.position.set(0, 0.174, 0.15);
      f.add(nozzle);
      f.position.set(0, 0.002, -D / 2 - 0.04);
      g.add(f);
      return g;
    },

    countertop: () => {
      const g = G("countertop_backsplash");
      g.add(box(2.0, CTOP, counterDepthM, M.stone, "countertop_slab", 0, 0, 0));
      g.add(
        plainBox(
          2.0,
          0.55,
          0.015,
          M.tile,
          "backsplash",
          0,
          CTOP,
          -counterDepthM / 2 + 0.007,
        ),
      );
      return g;
    },
    hardware: () => {
      const g = G("hardware_set");
      g.add(box(0.9, PLINTH, 0.02, M.dark, "toe_kick", -0.6, 0, 0));
      g.add(box(0.62, TH, 0.6, M.oak, "end_panel", 0.5, 0, 0)); // laid flat
      const lay = (len: number, x: number, z: number, vertical = false) => {
        const h = barHandle(len, 0, 0, 0, vertical);
        h.rotation.x = -Math.PI / 2;
        h.position.set(x, 0.002, z);
        g.add(h);
      };
      lay(0.42, -0.6, 0.28);
      lay(0.28, -0.6, 0.42);
      lay(0.42, 0.1, 0.35, true);
      return g;
    },

    "kitchen-l": buildKitchen,
  };

  /** ADR 0036 decision 1: `D` is the finished depth, so the shell is `D − FRONT_ASSEMBLY_D`. The door stays its own
   *  mesh: handles, `canHandle`/`canFinish` addressing and `scene-sync` key off it (decision 2). */
  function wallCarcassDepth(D: number): number {
    return D - FRONT_ASSEMBLY_D;
  }

  /** Where a wall body's origin sits off the wall plane so its back face lands on it: half the shell, not half the
   *  declared depth (§11 row 19). */
  function wallSeatOffset(D = wallDepthM): number {
    return wallCarcassDepth(D) / 2;
  }

  /** ADR 0039 decision 2: the hood hangs at the front, its face on the cabinet-depth line, leaving `cabinetDepth −
   *  500` behind it: §11 row 19's second named exception. Always standard (decision 1), so 200 at 700. */
  const HOOD_DEPTH_M = 0.5;
  const HOOD_SEAT_OFFSET_M = cabinetDepthM - HOOD_DEPTH_M / 2;

  /** How an ordinary wall door hangs on its carcass: 6 mm narrower and 6 mm shorter than the body (3 mm of
   *  reveal on each side, top and bottom), standing 3 mm below the top edge. */
  const WALL_DOOR_WIDTH_REVEAL_M = 0.006,
    WALL_DOOR_HEIGHT_REVEAL_M = 0.006,
    WALL_DOOR_TOP_REVEAL_M = 0.003;

  /** What is left of the height reveal under the door: it is the bottom edge's, and equals the top's only
   *  while both are 3 mm. */
  const WALL_DOOR_BOTTOM_REVEAL_M =
    WALL_DOOR_HEIGHT_REVEAL_M - WALL_DOOR_TOP_REVEAL_M;

  /** A wall door at or under this height takes its bar on the bottom edge, where a hand reaches it. */
  const SHORT_WALL_DOOR_MAX_HEIGHT_M = 0.5;

  /** Where a wall door's bar goes: none on a push-to-open door, the bottom edge on a short door, else a
   *  vertical bar on `tallDoorEdge`. The one reader of `SHORT_WALL_DOOR_MAX_HEIGHT_M`. */
  function wallDoorHandleEdge(
    H: number,
    pushOpen: boolean,
    tallDoorEdge: "left" | "right",
  ): HandleEdge {
    if (pushOpen) return "none";
    return H <= SHORT_WALL_DOOR_MAX_HEIGHT_M ? "bottom" : tallDoorEdge;
  }

  function wallCabinet(
    W: number,
    doors: number,
    H = 0.7,
    D = wallDepthM,
    pushOpen = false,
  ): THREE.Group {
    const g = G("wall_cabinet");
    const shellD = wallCarcassDepth(D);
    g.add(carcass(W, H, shellD, 0));
    const fz = shellD / 2 + TH / 2;
    const hL = wallDoorHandleEdge(H, pushOpen, "right");
    const hR = wallDoorHandleEdge(H, pushOpen, "left");
    if (doors === 1)
      g.add(
        doorSlab(
          W - WALL_DOOR_WIDTH_REVEAL_M,
          H - WALL_DOOR_HEIGHT_REVEAL_M,
          0,
          H - WALL_DOOR_TOP_REVEAL_M,
          fz,
          hL,
        ),
      );
    if (doors === 2) {
      const dw = (W - 0.009) / 2;
      const doorH = H - WALL_DOOR_HEIGHT_REVEAL_M,
        doorTop = H - WALL_DOOR_TOP_REVEAL_M;
      g.add(doorSlab(dw, doorH, -(dw + GAP) / 2, doorTop, fz, hL));
      g.add(doorSlab(dw, doorH, (dw + GAP) / 2, doorTop, fz, hR));
    }
    return g;
  }

  /** Where the corner wall unit's parts stand in `wallCabinet`'s frame (x centred on the body, z on the shell): the
   *  base X-leg's shape one level up (ADR 0135); `blindM` of its width stands behind the side wall's corner cabinet. */
  interface CornerWallUnitLayout {
    readonly shellDepthM: number;
    readonly frontPlaneZ: number;
    readonly closureCentreX: number;
    readonly closureCentreZ: number;
    readonly stileWidthM: number;
    readonly stileCentreX: number;
    readonly leafWidthM: number;
    readonly leafCentreX: number;
  }

  function cornerWallUnitLayout(W: number): CornerWallUnitLayout {
    const shellDepthM = wallCarcassDepth(wallDepthM);
    const blindM = wallDepthM;
    // The clearance beside the blind part is the base X-leg's (30 mm past the side cabinet's front); its constants are
    // read, not restated.
    const leafLeftClearanceM =
      (CORNER_X_LEAF_TOTAL_CLEARANCE_M +
        CORNER_X_LEAF_LEFT_MINUS_RIGHT_CLEARANCE_M) /
      2;
    const leafLeftX = -W / 2 + blindM + leafLeftClearanceM;
    // The far edge takes an ordinary wall door's reveal (half its width reveal), so a neighbour's door meets it in a
    // joint of twice that.
    const leafRightX = W / 2 - WALL_DOOR_WIDTH_REVEAL_M / 2;
    const leafWidthM = leafRightX - leafLeftX;
    const closureRightX = -W / 2 + shellDepthM;
    const stileRightX = leafLeftX - GAP;
    return {
      shellDepthM,
      frontPlaneZ: shellDepthM / 2 + TH / 2,
      closureCentreX: -W / 2 + shellDepthM / 2,
      closureCentreZ: wallDepthM / 2,
      stileWidthM: stileRightX - closureRightX,
      stileCentreX: (closureRightX + stileRightX) / 2,
      leafWidthM,
      leafCentreX: leafLeftX + leafWidthM / 2,
    };
  }

  /** The carcass the unit is one body of: the same box a wall cabinet is built on. */
  function cornerWallCarcass(W: number, H: number, shellDepthM: number) {
    return carcass(W, H, shellDepthM, 0);
  }

  /** The blind closure: the carcass is the shell and the side wall's corner cabinet stands against the declared
   *  depth, so this fills the difference over the shell's width and no slot shows beside it. */
  function cornerWallClosure(H: number, layout: CornerWallUnitLayout) {
    return box(
      layout.shellDepthM,
      H,
      wallDepthM - layout.shellDepthM,
      M.carcass,
      CORNER_WALL_CLOSURE_MESH_NAME,
      layout.closureCentreX,
      0,
      layout.closureCentreZ,
    );
  }

  /** The fixed stile, on the leaf's plane from the closure's edge to one `GAP` short of the leaf, so nothing
   *  recesses. */
  function cornerWallStile(H: number, layout: CornerWallUnitLayout) {
    return box(
      layout.stileWidthM,
      H - WALL_DOOR_HEIGHT_REVEAL_M,
      TH,
      M.door,
      CORNER_WALL_STILE_MESH_NAME,
      layout.stileCentreX,
      WALL_DOOR_BOTTOM_REVEAL_M,
      layout.frontPlaneZ,
    );
  }

  /** The one leaf, hinged away from the corner so its bar is on the corner side; a top-row unit takes its bar on the
   *  bottom edge, and `pushOpen` leaves it out. */
  function cornerWallLeaf(
    H: number,
    pushOpen: boolean,
    layout: CornerWallUnitLayout,
  ) {
    const handleEdge = wallDoorHandleEdge(H, pushOpen, "left");
    return doorSlab(
      layout.leafWidthM,
      H - WALL_DOOR_HEIGHT_REVEAL_M,
      layout.leafCentreX,
      H - WALL_DOOR_TOP_REVEAL_M,
      layout.frontPlaneZ,
      handleEdge,
    );
  }

  /** The corner wall unit: one structural body on the back wall above the corner base, `W` wide from the corner.
   *  Left corner only; a U's right corner is the scene's mirror. `H` is 0.7 in the wall row, 0.4 in the top row. */
  function wallCornerX(W: number, H = 0.7, pushOpen = false): THREE.Group {
    const g = G("wall_corner_x");
    const layout = cornerWallUnitLayout(W);
    g.add(cornerWallCarcass(W, H, layout.shellDepthM));
    g.add(cornerWallClosure(H, layout));
    g.add(cornerWallStile(H, layout));
    g.add(cornerWallLeaf(H, pushOpen, layout));
    return wearsTheBodysFinishOnTheCornerWallUnit(g);
  }

  // A lift-up has one full-face flap whose bar is on the bottom edge (`DEVELOPMENT-SPEC.md` §6.5), which `wallCabinet`
  // cannot produce at 700 mm. Defaults are the reference's literals.
  function wallLift(W = 0.6, H = 0.7, D = wallDepthM): THREE.Group {
    const g = wallCabinet(W, 0, H, D);
    g.add(
      doorSlab(
        W - 0.006,
        H - 0.006,
        0,
        H,
        wallCarcassDepth(D) / 2 + TH / 2,
        "bottom",
      ),
    );
    return g;
  }

  const DW_HEIGHT_M = 0.72,
    DW_DEPTH_M = 0.56;

  /** The machine is built 4 mm under the width it is handed (`dishwasherHousing` hands it `W - 0.004`), so a 600
   *  niche holds a 592 machine. Kept: `dw_body` is pinned at 1e-6 by M1's numeric ledger. */
  function dishwasherBodyWidth(Wn: number): number {
    return Wn - 0.004;
  }

  /** The machine inside a housing: `dw_body` only, as the cabinet's door fronts it. Its name is load-bearing:
   *  `CARCASS_MESH_NAME_PATTERN` reads it and the 580 mm seat derives from it (ADR 0016). */
  function integratedDishwasher(Wn: number): THREE.Group {
    const g = G("dishwasher");
    const W = dishwasherBodyWidth(Wn);
    g.add(
      box(
        W - 0.05,
        DW_HEIGHT_M,
        DW_DEPTH_M - 0.06,
        M.dark,
        "dw_body",
        0,
        0,
        -0.03,
      ),
    );
    return g;
  }

  /** The freestanding machine (596 × 720 × 560) the parts gallery draws. A separate factory, not a flag: its
   *  `dw_panel` is coplanar with a housing's decor door and its control strip crosses that plane. */
  function exposedDishwasher(Wn: number): THREE.Group {
    const g = integratedDishwasher(Wn);
    const W = dishwasherBodyWidth(Wn),
      H = DW_HEIGHT_M,
      D = DW_DEPTH_M;
    g.add(
      box(W, H - 0.06, TH, M.door, "dw_panel", 0, 0, D / 2 + TH / 2 - 0.02),
    );
    g.add(
      box(
        W,
        0.05,
        0.03,
        M.steel,
        "dw_control_strip",
        0,
        H - 0.05,
        D / 2 - 0.01,
      ),
    );
    g.add(barHandle(W - 0.09, D / 2 + 0.012, 0, H - 0.1, false));
    return g;
  }

  // 600 standard, 450 slimline. ADR 0051: a fronted cabinet whose one `doorSlab` door is named `door_front` for
  // `finishes.ts` and flush with neighbouring fronts by construction; its only handle is the door's.
  function dishwasherHousing(W = 0.6): THREE.Group {
    const g = G("dishwasher_housing");
    const half = W / 2 - 0.009;
    g.add(plinth(W, CARC_D));
    g.add(box(0.018, CARC_H, CARC_D, M.carcass, "side_left", -half, PLINTH, 0));
    g.add(box(0.018, CARC_H, CARC_D, M.carcass, "side_right", half, PLINTH, 0));
    g.add(
      box(
        W - 0.036,
        CARC_H - 0.02,
        0.004,
        M.shadowGap,
        "back_panel",
        0,
        PLINTH + 0.01,
        -carcassFrontM + 0.01,
      ),
    );
    // The decor door's inner face follows `cabinetDepthMm` but `dw_body`'s front is a fixed 0.24, so the clearance
    // reaches zero at a 520 mm cabinet, below which the appliance would come through the door (ADR 0040).
    const dw = integratedDishwasher(W - 0.004);
    dw.position.set(0, PLINTH, 0.02);
    g.add(dw);
    g.add(
      doorSlab(
        W - 0.006,
        CARC_H - 0.01,
        0,
        PLINTH + CARC_H - 0.004,
        carcassFrontM + TH / 2,
        "top",
      ),
    );
    g.add(counter(W));
    return g;
  }

  /** The one builder declaring its own painted surfaces (`body-finish-surfaces.ts`): six boards wear the body's
   *  finish, the back panel stays `M.tile`. `inner` counts interior boards, so `inner + 1` compartments (ADR 0047). */
  function openShelf(W = 0.8, D = 0.3, inner = 2, H = 0.7): THREE.Group {
    const g = G("open_shelf_unit");
    g.add(
      wearsTheBodysFinish(
        box(0.018, H, D, M.oak, "side_left", -W / 2 + 0.009, 0, 0),
      ),
    );
    g.add(
      wearsTheBodysFinish(
        box(0.018, H, D, M.oak, "side_right", W / 2 - 0.009, 0, 0),
      ),
    );
    g.add(
      wearsTheBodysFinish(
        box(W, 0.018, D, M.oak, "shelf_top", 0, H - 0.018, 0),
      ),
    );
    g.add(
      wearsTheBodysFinish(box(W, 0.018, D, M.oak, "shelf_bottom", 0, 0, 0)),
    );
    for (let i = 1; i <= inner; i++)
      g.add(
        wearsTheBodysFinish(
          box(
            W - 0.036,
            0.018,
            D - 0.02,
            M.oak,
            "shelf_" + String(i),
            0,
            (H * i) / (inner + 1) - 0.009,
            0.01,
          ),
        ),
      );
    // Deliberately bare: the tiled backing is the wall behind the shelf, not the shelf.
    g.add(
      box(
        W - 0.036,
        H - 0.036,
        0.006,
        M.tile,
        "back_panel",
        0,
        0.018,
        -D / 2 + 0.006,
      ),
    );
    return g;
  }

  // The canopy depth is hardcoded on purpose: the hood's depth is standard (ADR 0039 decision 1), so what moves is the
  // seat (`HOOD_SEAT_OFFSET_M`).
  function hood(w = 0.9, chimneyH = 0.57): THREE.Group {
    const g = G("extractor_hood");
    g.add(box(w, 0.13, HOOD_DEPTH_M, M.steel, "hood_canopy", 0, 0, 0));
    g.add(box(w - 0.04, 0.012, 0.46, M.dark, "hood_filter", 0, -0.006, 0));
    g.add(box(0.3, chimneyH, 0.28, M.steel, "hood_chimney", 0, 0.13, -0.09));
    g.add(box(0.28, 0.03, 0.02, M.dark, "hood_controls", 0, 0.06, 0.24));
    return g;
  }

  // Two independent, separately placeable bodies, not arms of one object: each computes its plinth recess from its own
  // carcass depth only, so side by side they meet on a shared face.
  const CORNER_RECESS = 0.06; // plinth setback from a leg's own carcass front

  /** How far the X-leg's corner worktop stands proud of its carcass front: the run's own 50 mm. Since ADR 0135 the
   *  leg's carcass front is the run's, so its worktop front is `D + 20` from the wall. */
  const CORNER_X_WORKTOP_FRONT_OVERHANG_M = 0.05;

  /** How far the corner slab stops short at the back: 10 mm in front of the leg's back face, unlike a straight run's
   *  counter, which hangs 10 mm behind. */
  const CORNER_X_WORKTOP_REAR_INSET_M = 0.01;

  /** How far the X-leg's plinth stops short of its carcass at the back, matching its front recess; the return leg's
   *  plinth runs to its back face, so the two differ. */
  const CORNER_X_PLINTH_REAR_RECESS_M = 0.02;

  /** The accessible front loses 40 mm to leaf clearances: 30 mm beside the perpendicular return
   *  and 10 mm at its right edge. Their 20 mm difference seats the leaf off the front's centre. */
  const CORNER_X_LEAF_TOTAL_CLEARANCE_M = 0.04;
  const CORNER_X_LEAF_LEFT_MINUS_RIGHT_CLEARANCE_M = 0.02;

  /** How far the X-leg's carcass stands behind the wall plane: 20 mm, pinned by value since the L-joint seats it
   *  (ADR 0025 decision 3). Mirrors `CORNER_BASE_X_BEHIND_WALL_MM`; the parity test fails if either moves. */
  const CORNER_X_BEHIND_WALL_M = 0.02;

  // X-leg: width from its caller; one leaf on the accessible front and a fixed-size lazy susan. Its footprint follows
  // the cabinet depth: front on the run's carcass front (ADR 0135), back 20 mm inside the wall.
  function cornerBaseX(W: number): THREE.Group {
    const g = G("corner_base_x");
    const LD = CORNER_RETURN_DEPTH_M + CORNER_X_BEHIND_WALL_M; // this leg's own carcass footprint
    const cFront = LD / 2;
    const pFront = cFront - CORNER_RECESS; // from LD, nothing else
    const pDepth = LD - CORNER_RECESS - CORNER_X_PLINTH_REAR_RECESS_M,
      pBack = pFront - pDepth;
    g.add(
      box(
        W - 0.004,
        PLINTH,
        pDepth,
        M.dark,
        "plinth",
        0,
        0,
        (pFront + pBack) / 2,
      ),
    );
    // Painted: the 290 mm door leaves about 610 mm of this solid box's front face outward-facing beside a coloured door
    // (ADR 0135). It has no cavity (susan pole and trays are separate meshes), so no interior is recoloured.
    g.add(
      wearsTheBodysFinish(
        box(W, CARC_H, LD, M.carcass, "carcass", 0, PLINTH, 0),
      ),
    );
    const pole = cyl(0.014, CARC_H - 0.06, M.steel, "susan_pole");
    pole.position.set(-0.02, PLINTH + (CARC_H - 0.06) / 2 + 0.02, -0.01);
    g.add(pole);
    for (const y of [0.12, 0.44]) {
      const t = cyl(0.2, 0.018, M.interior, "susan_tray", 40);
      t.position.set(-0.02, PLINTH + y, -0.01);
      g.add(t);
    }
    // The perpendicular return hides all but `W` less its depth of this front; the leaf leaves 30 mm beside the return
    // and 10 mm at the accessible right edge.
    const accessibleFrontM = W - CORNER_RETURN_DEPTH_M;
    // Grouped with the return depth so the reference width gives exactly 0.29 (0.28 before ADR 0135) without snapping
    // other widths to a grid.
    const leafWidthM =
      W - (CORNER_RETURN_DEPTH_M + CORNER_X_LEAF_TOTAL_CLEARANCE_M);
    const leafX =
      W / 2 -
      (accessibleFrontM - CORNER_X_LEAF_LEFT_MINUS_RIGHT_CLEARANCE_M) / 2;
    g.add(
      doorSlab(
        leafWidthM,
        CARC_H - 0.01,
        leafX,
        PLINTH + CARC_H - 0.004,
        cFront + TH / 2,
        "left",
      ),
    );
    const wFront = cFront + CORNER_X_WORKTOP_FRONT_OVERHANG_M,
      wDepth =
        LD + CORNER_X_WORKTOP_FRONT_OVERHANG_M - CORNER_X_WORKTOP_REAR_INSET_M;
    g.add(
      box(
        W,
        CTOP,
        wDepth,
        M.stone,
        "countertop",
        0,
        PLINTH + CARC_H,
        wFront - wDepth / 2,
      ),
    );
    return g;
  }

  /** The return leg's default depth: the carcass front of the base run it stands in line with (0.57 at 600), derived
   *  because a literal goes wrong once the neighbour moves (ADR 0135); see `baseCarcassFrontMm`. */
  const CORNER_RETURN_DEPTH_M =
    (cabinetDepthMm - BASE_FRONT_OVERHANG_MM + COUNTER_REAR_OVERHANG_MM) / 1000;

  /** Where the X-leg's origin stands off the wall: half the domain's seat for it (`baseCornerXFrameDepthMm`, 550 at
   *  600), 0.275 at 600. */
  const cornerBaseXSeatM = (CORNER_RETURN_DEPTH_M - CORNER_X_BEHIND_WALL_M) / 2;

  /** How far the return leg's worktop stands proud of its carcass front: the run's own 50 mm, so the
   *  slab's front edge is on the run's worktop line. */
  const CORNER_RETURN_WORKTOP_FRONT_OVERHANG_M =
    COUNTER_FRONT_OVERHANG_MM / 1000;

  /** The return slab's depth: the leg's default depth plus the overhang (0.62 at 600). Read via
   *  `CORNER_RETURN_DEPTH_M`, not `LD`: M1 pins one slab depth for two leg depths, yet it follows the setting. */
  const CORNER_RETURN_WORKTOP_DEPTH_M =
    CORNER_RETURN_DEPTH_M + CORNER_RETURN_WORKTOP_FRONT_OVERHANG_M;

  /** The base return's front: a fixed panel on the plane a base door would hang on, with the door's reveals. Not a
   *  `door_front`: nothing opens, so no handle, hinge or door count attaches (ADR 0135). */
  function baseReturnFixedFront(W: number, carcassFrontM: number): THREE.Mesh {
    return wearsTheBodysFinish(
      box(
        W - DOOR_WIDTH_REVEAL_M,
        CARC_H - DOOR_HEIGHT_REVEAL_M,
        TH,
        M.door,
        "fixed_front",
        0,
        PLINTH + DOOR_BOTTOM_REVEAL_M,
        carcassFrontM + TH / 2,
      ),
    );
  }

  // Return leg: width from its caller; depth is the placement variable, the carcass front of the run it stands in line
  // with (0.57 at 600, ADR 0135).
  function cornerBaseReturn(LD: number, W: number): THREE.Group {
    const g = G("corner_base_return");
    const cFront = LD / 2;
    const pFront = cFront - CORNER_RECESS; // from LD, nothing else
    const pDepth = LD - CORNER_RECESS,
      pBack = pFront - pDepth;
    g.add(
      box(
        W - 0.004,
        PLINTH,
        pDepth,
        M.dark,
        "plinth",
        0,
        0,
        (pFront + pBack) / 2,
      ),
    );
    // Painted: the one seeded base body with no front (`NO_OPENING_FRONTS`), so its whole 330 × 720 front face is
    // outward-facing on the corner column; a solid volume, so no interior is reached (ADR 0099 Amendment B).
    g.add(
      wearsTheBodysFinish(
        box(W, CARC_H, LD, M.carcass, "carcass", 0, PLINTH, 0),
      ),
    );
    // Without a front the bare carcass would end 18 mm behind the doors beside it (ADR 0135).
    g.add(baseReturnFixedFront(W, cFront));
    // Butts the X-leg slab, which already covers the corner: the two stone volumes share a face with no coplanar
    // overlap.
    const wFront = cFront + CORNER_RETURN_WORKTOP_FRONT_OVERHANG_M,
      wDepth = CORNER_RETURN_WORKTOP_DEPTH_M,
      wWide = W - 0.05;
    g.add(
      box(
        wWide,
        CTOP,
        wDepth,
        M.stone,
        "countertop",
        -(W - wWide) / 2,
        PLINTH + CARC_H,
        wFront - wDepth / 2,
      ),
    );
    return g;
  }

  function carcassFrame(
    w: number,
    h: number,
    d: number,
    y: number,
    noTop = false,
  ): THREE.Group {
    const g = G("carcass");
    const t = 0.018;
    g.add(box(t, h, d, M.carcass, "side_left", -w / 2 + t / 2, y, 0));
    g.add(box(t, h, d, M.carcass, "side_right", w / 2 - t / 2, y, 0));
    if (!noTop) g.add(box(w, t, d, M.carcass, "panel_top", 0, y + h - t, 0));
    g.add(box(w, t, d, M.carcass, "panel_bottom", 0, y, 0));
    g.add(
      box(
        w - 2 * t,
        h - 2 * t,
        0.004,
        M.shadowGap,
        "back_panel",
        0,
        y + t,
        -d / 2 + 0.01,
      ),
    );
    return g;
  }

  /** ADR 0048: the one resizable full-height row, 400–800 mm, door count following width (`deriveDoorCount`). The
   *  interior does not change with width: band heights read nothing from `widthM`. Built to the width, never scaled. */
  function tallPantry(widthM: number, doors: number): THREE.Group {
    const g = tallCarcass(widthM);
    const fz = carcassFrontM + TH / 2;
    const doorBands: readonly (readonly [number, number])[] = [
      [PLINTH + 1.3, 1.29],
      [TALL_UNIT_HEIGHT_M, 0.79],
    ];
    for (const [bandTopY, bandHeight] of doorBands) {
      if (doors === 1)
        g.add(doorSlab(widthM - 0.006, bandHeight, 0, bandTopY, fz, "right"));
      if (doors === 2) {
        const leafW = (widthM - 0.009) / 2;
        const leafOffset = (leafW + GAP) / 2;
        g.add(doorSlab(leafW, bandHeight, -leafOffset, bandTopY, fz, "right"));
        g.add(doorSlab(leafW, bandHeight, leafOffset, bandTopY, fz, "left"));
      }
    }
    return g;
  }

  function tallCarcass(W = COLUMN_WIDTH_M): THREE.Group {
    const g = G("tall_unit");
    g.add(plinth(W, CARC_D));
    g.add(carcass(W, TALL_UNIT_HEIGHT_M - PLINTH, CARC_D, PLINTH));
    return g;
  }

  // Wall A: back wall at z=0, cabinets extend to +z, run along x 0..3.6 m. Wall B: left wall at x=0, cabinets extend to
  // +x, run along z 0..2.4 m.
  function buildKitchen(
    cornerWidths: KitchenCornerWidthsM = referenceCornerWidthsM,
  ): THREE.Group {
    const room = G("kitchen_l_shape");
    const RW = 4.2,
      RD = 3.4,
      WH = 2.6;
    room.add(
      plainBox(
        RW,
        0.04,
        RD,
        M.floor,
        "floor",
        RW / 2 - 0.3,
        -0.04,
        RD / 2 - 0.3,
      ),
    );
    const wallMat = M.wall.clone();
    wallMat.name = "wall_paint";
    wallMat.side = THREE.FrontSide;
    const back = new THREE.Mesh(new THREE.PlaneGeometry(RW, WH), wallMat);
    back.name = "wall_back";
    back.position.set(RW / 2 - 0.3, WH / 2, 0);
    room.add(back);
    const left = new THREE.Mesh(new THREE.PlaneGeometry(RD, WH), wallMat);
    left.name = "wall_left";
    left.rotation.y = Math.PI / 2;
    left.position.set(0, WH / 2, RD / 2 - 0.3);
    room.add(left);

    const place = (
      obj: THREE.Object3D,
      x: number,
      z: number,
      ry = 0,
      y = 0,
    ) => {
      obj.position.set(x, y, z);
      obj.rotation.y = ry;
      room.add(obj);
      return obj;
    };
    // Seat a body flush on the wall plane (§6.2): measure its bounding box after adding it to the room, never derive
    // the plane from a round number or the previous occupant.
    const seatOnWallA = (
      obj: THREE.Object3D,
      x: number,
      y = 0,
    ): THREE.Object3D => {
      obj.position.set(x, y, 0);
      room.add(obj);
      room.updateWorldMatrix(true, true);
      const bb = new THREE.Box3().setFromObject(obj);
      obj.position.z += -bb.min.z;
      return obj;
    };
    const seatOnWallB = (
      obj: THREE.Object3D,
      z: number,
      y = 0,
    ): THREE.Object3D => {
      obj.position.set(0, y, z);
      obj.rotation.y = Math.PI / 2;
      room.add(obj);
      room.updateWorldMatrix(true, true);
      const bb = new THREE.Box3().setFromObject(obj);
      obj.position.x += -bb.min.x;
      return obj;
    };
    // The corner legs are seated by the L-joint, not the wall (ADR 0025): their seats are half the domain's seat
    // depths, 0.275 / 0.285 at 600 and 0.325 / 0.335 at 700; `room-composition.parity.test.ts` guards it.
    place(cornerBaseX(cornerWidths.xM), cornerWidths.xM / 2, cornerBaseXSeatM);

    // The four ordinary base seats butt from the X-leg's far edge, each advancing the same chain, so a corner change
    // cannot strand a neighbour at a literal.
    let wallAFarEdgeM = cornerWidths.xM;
    const seatNextWallABase = (obj: THREE.Object3D, widthM: number) => {
      const centreM = wallAFarEdgeM + widthM / 2;
      wallAFarEdgeM += widthM;
      return seatOnWallA(obj, centreM);
    };

    // The L-joint: where the X-leg's carcass ends and wall B begins, the return's own depth (ADR 0135); it moves 100 mm
    // per 100 mm of cabinet depth. Each wall B seat butts the body before it.
    const cornerJointM = CORNER_RETURN_DEPTH_M;
    const cornerReturnAlongWallM = cornerJointM + cornerWidths.baseReturnM / 2;
    place(
      cornerBaseReturn(CORNER_RETURN_DEPTH_M, cornerWidths.baseReturnM),
      CORNER_RETURN_DEPTH_M / 2,
      cornerReturnAlongWallM,
      Math.PI / 2,
    );
    const sinkWidthM = 0.8;
    const dishwasherWidthM = 0.6;
    const hobBaseWidthM = 0.6;
    const drawerWidthM = 0.6;
    seatNextWallABase(
      baseCabinet(sinkWidthM, { doors: 2, sink: true }),
      sinkWidthM,
    );
    seatNextWallABase(
      builders["base-dishwasher"](dishwasherWidthM),
      dishwasherWidthM,
    );
    const cookBase = seatNextWallABase(
      baseCabinet(hobBaseWidthM, { drawers: 2 }),
      hobBaseWidthM,
    );
    const zA = cookBase.position.z;
    place(
      builders.cooktop(),
      cookBase.position.x,
      zA + HOB_SEAT_OFFSET_M,
      0,
      PLINTH + CARC_H + CTOP,
    );
    seatNextWallABase(baseCabinet(drawerWidthM, { drawers: 3 }), drawerWidthM);
    // The reference room's seat, to the micrometre for M1 parity; only a starting seat, as `syncRunEndPanel` re-derives
    // it from the records on every sync (ADR 0045).
    place(
      box(
        RUN_END_PANEL_THICKNESS_M,
        RUN_END_PANEL_HEIGHT_M,
        // The finished end spans the cabinet's depth (0.6 at 600, 0.7 at 700) so it closes the run; a frozen 0.6 would
        // leave 120 mm of the last carcass's side showing at 700.
        cabinetDepthM,
        M.oak,
        RUN_END_PANEL_NAME,
        0,
        0,
        0,
      ),
      RUN_END_PANEL_SEEDED_X_M,
      zA,
      0,
      RUN_END_PANEL_HEIGHT_M / 2,
    );

    // Wall B tall run: rotated 90° so fronts face +x, flush on the wall plane; it starts where the return leg ends and
    // each column butts the one before.
    const tallRunStartM = cornerReturnAlongWallM + cornerWidths.baseReturnM / 2;
    const ovenTowerAlongWallM = tallRunStartM + COLUMN_WIDTH_M / 2;
    const pantryAlongWallM = ovenTowerAlongWallM + COLUMN_WIDTH_M;
    const fridgeAlongWallM =
      pantryAlongWallM + COLUMN_WIDTH_M / 2 + FREESTANDING_FRIDGE_WIDTH_M / 2;
    seatOnWallB(builders["tall-oven-tower"](), ovenTowerAlongWallM);
    seatOnWallB(builders["tall-pantry"](), pantryAlongWallM);
    // Already flush: a freestanding fridge is its own 680 mm body at every depth, so half of it is the seat.
    place(
      builders["fridge-free"](),
      FREESTANDING_FRIDGE_DEPTH_M / 2,
      fridgeAlongWallM,
      Math.PI / 2,
    );

    // Continuous from the corner to the end on one line (1.50 → 2.20). Seats are derived: a wall body's shell is its
    // declared depth less the front assembly (ADR 0036), so half of that puts its back on the wall plane (§11 row 19).
    const yW = 1.5;
    const upperCornerReturnAlongWallM =
      wallDepthM + cornerWidths.upperReturnM / 2;
    place(wallCabinet(0.6, 2), 0.3, wallSeatOffset(), 0, yW);
    // The upper L's corner return butts the wall-A cabinet beside it, whose front face is the wall depth, so it follows
    // the map and not the formula (0.615 at 600, 0.685 at 700).
    place(
      wallCabinet(cornerWidths.upperReturnM, 1),
      wallSeatOffset(),
      upperCornerReturnAlongWallM,
      Math.PI / 2,
      yW,
    ); // corner return, closes the upper L
    place(wallCabinet(0.3, 1), 0.75, wallSeatOffset(), 0, yW);
    place(wallCabinet(0.8, 2), 1.3, wallSeatOffset(), 0, yW);
    place(openShelf(0.6, wallDepthM, 2), 2.0, wallDepthM / 2, 0, yW);
    place(hood(0.6), 2.6, HOOD_SEAT_OFFSET_M, 0, yW);
    place(wallCabinet(0.6, 2), 3.2, wallSeatOffset(), 0, yW);

    // Top row (2.20 → 2.60). Overhead doors ship push-to-open: handles are built and hidden so they can be switched on.
    // `pushOpen` hides every mesh named "handle" on purpose; the decomposition parity test compares visibility.
    const pushOpen = (obj: THREE.Object3D) => {
      obj.traverse((o) => {
        if (isMesh(o) && o.name.includes("handle")) o.visible = false;
      });
      return obj;
    };
    const yT = 2.2,
      hT = 0.4;
    const topRow: readonly (readonly [number, number])[] = [
      [0.6, 0.3],
      [0.3, 0.75],
      [0.8, 1.3],
      [0.6, 2.0],
      [0.6, 2.6],
      [0.6, 3.2],
    ];
    for (const [w, x] of topRow)
      place(
        pushOpen(wallCabinet(w, w > 0.4 ? 2 : 1, hT, wallDepthM)),
        x,
        wallSeatOffset(),
        0,
        yT,
      );
    place(
      pushOpen(wallCabinet(cornerWidths.upperReturnM, 1, hT, wallDepthM)),
      wallSeatOffset(),
      upperCornerReturnAlongWallM,
      Math.PI / 2,
      yT,
    );
    // The three deep tops read `cabinetDepthM`, not `wallDepthM`, on purpose (ADR 0101): columns under them lift §5.2's
    // head-clearance cap, so they build to the cabinet-depth line.
    place(
      pushOpen(wallCabinet(0.6, 2, hT, cabinetDepthM)),
      wallSeatOffset(cabinetDepthM),
      ovenTowerAlongWallM,
      Math.PI / 2,
      yT,
    );
    place(
      pushOpen(wallCabinet(0.6, 2, hT, cabinetDepthM)),
      wallSeatOffset(cabinetDepthM),
      pantryAlongWallM,
      Math.PI / 2,
      yT,
    );
    place(
      wallCabinet(0.7, 2, 0.75, cabinetDepthM),
      wallSeatOffset(cabinetDepthM),
      fridgeAlongWallM,
      Math.PI / 2,
      1.85,
    ); // over the fridge

    room.add(
      plainBox(
        3.5,
        0.59,
        0.014,
        M.tile,
        "backsplash_wall_a",
        1.75,
        PLINTH + CARC_H + CTOP,
        0.037,
      ),
    );
    return room;
  }

  const make: Factories = {
    baseCabinet,
    wallCabinet,
    wallCornerX,
    openShelf,
    wallLift,
    hood,
    cornerBaseX,
    cornerBaseReturn,
    dishwasherHousing,
    bottleCargo,
    hobBaseWithDrawers,
    hobBaseWithOven,
    tallPantry,
  };
  return {
    builders,
    M,
    make,
    depths: {
      cabinetDepthM,
      baseCarcassDepthM: carcassDepthM,
      frontAssemblyDepthM: FRONT_ASSEMBLY_D,
      hoodDepthM: HOOD_DEPTH_M,
      hoodSeatOffsetM: HOOD_SEAT_OFFSET_M,
      cornerReturnDepthM: CORNER_RETURN_DEPTH_M,
      wallDepthM,
    },
    ownsGeometry: (geometry) => owned.geometries.has(geometry),
  };
}

type HandleEdge = "none" | "top" | "bottom" | "left" | "right";
