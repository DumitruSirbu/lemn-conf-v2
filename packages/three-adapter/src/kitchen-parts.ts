// Port of `design-source/Modern Kitchen Cabinets 3D (3)/kitchen-parts.js`.
// Modular kitchen library — metric (600mm modules), slab doors + bar handles, blocky/game-ready.
//
// This is a port, not a reimplementation: the builder math, mesh hierarchy, mesh names, materials,
// chamfer cache and structural dependencies are carried over unchanged. `SPEC.md` documents why
// each of those is load-bearing, and `docs/milestones/M1-scene-port.md` gates any drift.
import * as THREE from "three";

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
      { id: "base-corner", label: "Corner base pair", note: "900 + 320" },
      { id: "base-corner-x", label: "Corner base X-leg", note: "900 × 600" },
      {
        id: "base-corner-return",
        label: "Corner return leg",
        note: "320 × 580",
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

/** The reference's own builder map, keyed by its catalogue ids. Product metadata (bands, width
 *  flex, pricing) is not this package's concern — it arrives with the catalogue in M3. */
export interface Builders {
  "base-1door": () => THREE.Group;
  "base-2door": () => THREE.Group;
  "base-3drawer": () => THREE.Group;
  "base-panbank": () => THREE.Group;
  "base-sink": () => THREE.Group;
  "base-dishwasher": (widthM?: number) => THREE.Group;
  "base-dishwasher-450": () => THREE.Group;
  "base-corner-x": () => THREE.Group;
  "base-corner-return": () => THREE.Group;
  "base-corner": () => THREE.Group;
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
  "kitchen-l": () => THREE.Group;
}

export type BuilderKey = keyof Builders;

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
  openShelf: (
    W?: number,
    D?: number,
    inner?: number,
    H?: number,
  ) => THREE.Group;
  wallLift: (W?: number, H?: number, D?: number) => THREE.Group;
  hood: (w?: number, chimneyH?: number) => THREE.Group;
  cornerBaseX: () => THREE.Group;
  cornerBaseReturn: (LD?: number) => THREE.Group;
  dishwasherHousing: (W?: number) => THREE.Group;
  bottleCargo: (w: number) => THREE.Group;
  hobBaseWithDrawers: (w: number) => THREE.Group;
  hobBaseWithOven: (w: number) => THREE.Group;
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

/** The depths this kit derived from its declared cabinet depth (M5 work item 7, ADR 0036). Exposed
 *  because the seat, the rebuild and their tests all have to read the *same* numbers the builders
 *  used — two constants agreeing by luck is the defect ADR 0028 was written about. */
/** `KitMaterials`'s values as a list — read by the ownership registry and by the suites that assert
 *  what a teardown may touch.
 *
 *  Enumerated rather than written out by hand, so a material added to the interface is owned by its
 *  kit without a second edit here. The values are **filtered**, not asserted to be materials: the
 *  cast is only about the shape an interface cannot express (an index signature), and a non-material
 *  field added to `KitMaterials` one day must not be carried into a list about to be disposed. */
export function kitMaterialList(M: KitMaterials): readonly THREE.Material[] {
  return Object.values(M as unknown as Record<string, unknown>).filter(
    isMaterial,
  );
}

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
}

export interface Kit {
  builders: Builders;
  M: KitMaterials;
  make: Factories;
  depths: KitDepths;
  /** Whether this kit's shared geometry cache owns `geometry`, i.e. whether other bodies built
   *  from this kit may be rendering from the same buffers. A kit-owned geometry must never be
   *  disposed by a caller tearing one body down — see the cache's own comment in `makeKit`. */
  ownsGeometry: (geometry: THREE.BufferGeometry) => boolean;
}

/** The reference reaches straight for `document.createElement('canvas')` when it bakes its
 *  procedural maps. Headless structural-parity tests have no DOM, so the one seam this port adds
 *  is a canvas factory; it defaults to the reference's own call and changes no geometry. */
export interface KitOptions {
  createCanvas?: () => HTMLCanvasElement;
  /** The kitchen's **cabinet** depth in millimetres — ADR 0036 decision 3: the setting is the
   *  depth of the cabinets, never the worktop's, and the worktop influences neither geometry nor
   *  price. Every base carcass in this kit derives from it (M5 work item 7), so a 700 mm kitchen
   *  is one argument rather than a hunt through 24 literals.
   *
   *  **Kit-level and not per-call**, deliberately: ADR 0018 clause 4's compounding round trip fires
   *  only for a builder that consumes the depth *argument* it is handed, and the value here is the
   *  same on every call, so that trap stays inert. M5 has exactly one cabinet depth by
   *  construction; M6's *Setări globale* control is what makes this vary. */
  cabinetDepthMm?: number;
}

/** The cabinet depth a kit built with no options uses — the one M5 declares. It is deliberately a
 *  literal here rather than an import of the domain's `WORKTOP_DEPTH_MM`: §12 keeps product rules
 *  in the domain and builders here, and this package is a port of a standalone reference library.
 *  The two cannot drift apart regardless — `cabinet-depth-source.test.ts` asserts they are the same
 *  number, which is ADR 0028's own remedy for two constants agreeing by luck. */
export const DEFAULT_CABINET_DEPTH_MM = 600;

/** ADR 0036 decision 1: a declared dimension is the **finished** cabinet, so a base carcass is the
 *  declared depth less what the builder stands in front of it. Measured on the shipped reference,
 *  600 declared against `CARC_D` 0.56.
 *
 *  It is 40 and not the 39 mm the fronts actually measure (see `FRONT_ASSEMBLY_D`): the reference
 *  rounds, and M5's own acceptance criterion is that **not one shipped dimension moves** — a base
 *  cabinet therefore finishes at 599, one millimetre inside its declared 600, exactly as it always
 *  has. Correcting that millimetre is a re-vendoring decision, not this wave's. */
const BASE_FRONT_OVERHANG_MM = 40;

/** The worktop overhangs its carcass by one constant and does **not** scale with depth (M5 work
 *  item 7): `counter` is 60 mm deeper than `CARC_D`, offset 20 mm forward, so it stands 50 mm proud
 *  at the front and 10 mm behind at the back. ADR 0018 measured the same numbers from the other
 *  side — the counter's back face is what a base body's seat is taken from. */
const COUNTER_OVERHANG_MM = 60;

/** The finished panel that closes the right end of wall A's base run. Named here because ADR 0045
 *  makes its along-wall seat derived (`kitchen-shell.ts`) while its existence stays a fixed entry
 *  in the shell manifest — one name, read by the builder and by the derivation. */
export const RUN_END_PANEL_NAME = "end_panel_right";

/** The panel's own slab, in metres: the reference room's `TH` door/panel thickness, and a
 *  base-height finished end that stands from the floor to the underside of the worktop. */
export const RUN_END_PANEL_THICKNESS_M = 0.018;
export const RUN_END_PANEL_HEIGHT_M = 0.82;

/** The air gap the reference room leaves between the last cabinet's side and the panel's inner
 *  face, in metres.
 *
 *  **Authored, not measured, and it is the invariant the offset below preserves.** The seeded run
 *  ends at 3.50 (3.20 + 0.60/2) and the panel is placed at 3.51, which is half the slab plus this
 *  millimetre — so the reference deliberately does not butt the two faces together. Reading the
 *  10 mm as a measurement would be wrong in a way that only shows up later: were `TH` ever to
 *  change, a bare 10 mm would silently move the *gap* instead of keeping the overhang. */
export const RUN_END_PANEL_GAP_M = 0.001;

/** How far the panel's centre stands past the right edge of the last base cabinet, in metres. */
export const RUN_END_PANEL_EDGE_OFFSET_M =
  RUN_END_PANEL_THICKNESS_M / 2 + RUN_END_PANEL_GAP_M;

/** The panel's along-wall seat in the reference room, in metres: the seeded base run's right edge
 *  plus the offset above, kept as its own literal because M1's parity gate diffs this exact number
 *  against the unmodified reference library at 1e-6 m.
 *
 *  It is also where `syncRunEndPanel` parks the panel while it is hidden. Any fixed value would do
 *  there — what makes a deleted-into scene and a freshly loaded one one picture is that the
 *  derivation is a pure function of the records, and this constant is only ever observed on a
 *  hidden object or on a shell that has not been synced yet. The reference seat is chosen so that
 *  an unsynced shell is the reference room. */
export const RUN_END_PANEL_SEEDED_X_M = 3.51;

export function makeKit(options: KitOptions = {}): Kit {
  const createCanvas =
    options.createCanvas ?? (() => document.createElement("canvas"));
  // Millimetres divided once, never metres subtracted: `0.6 - 0.04` is 0.5599999999999999 in
  // IEEE-754 and M1's parity gate diffs at 1e-6 m, so the arithmetic is done where it is exact.
  const cabinetDepthMm = options.cabinetDepthMm ?? DEFAULT_CABINET_DEPTH_MM;
  const carcassDepthM = (cabinetDepthMm - BASE_FRONT_OVERHANG_MM) / 1000;
  const counterDepthM =
    (cabinetDepthMm - BASE_FRONT_OVERHANG_MM + COUNTER_OVERHANG_MM) / 1000;

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

  // --- procedural surface textures (canvas) --------------------------------
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

  // Recorded as this kit's own the moment they exist, so a teardown never has to guess which of
  // the resources it finds in a room are shared with the rest of the scene (`kit-ownership.ts`).
  const owned = kitOwnedResources(M);
  for (const material of kitMaterialList(M)) owned.materials.add(material);
  for (const texture of [oakTex, floorTex, stoneTex, tileTex, brushTex]) {
    owned.textures.add(texture);
  }

  // --- chamfered boxes ------------------------------------------------------
  // Sharp 90° edges are the single biggest "low-poly" tell; a 1.6 mm chamfer
  // catches a highlight on every edge and reads as real cabinetry.
  const geoCache = new Map<string, THREE.ExtrudeGeometry>();
  // Every geometry `chamferBox` hands out is memoised by size and therefore **shared** by every
  // mesh of that size in every body this kit builds — exactly the way `M`'s materials are shared.
  // `ownsGeometry` below is how a caller tearing a body down tells a buffer it may dispose from
  // one the rest of the scene is still rendering. The cache never evicts, but it is bounded by the
  // number of distinct box sizes the builders ask for, so retaining a cached geometry is a fixed
  // cost rather than an unbounded leak — until the whole stage goes, which is what `owned` is for:
  // `disposeKitAndStage` is the only caller allowed to dispose from it.
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

  // horizontal or vertical bar handle, front face at z
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

  // door slab; handleEdge: 'left'|'right' (vertical bar), or a horizontal bar on
  // the 'top' edge (drawers, and doors below the worktop) or the 'bottom' edge.
  // Anything overhead gets its bar at the bottom: that is the edge a hand can
  // actually reach on a cabinet mounted above eye level.
  function doorSlab(
    w: number,
    h: number,
    x: number,
    y: number,
    z: number,
    handleEdge: HandleEdge = "top",
  ): THREE.Group {
    const g = G("door");
    g.add(box(w, h, TH, M.door, "door_front", 0, -h, 0));
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

  /** What a fronted carcass stands **in front of** its own shell, measured rather than estimated:
   *  a `doorSlab` is `TH` thick with its inner face on the carcass front, and `barHandle` puts a
   *  6 mm-radius bar 24 mm forward of the slab's mid-plane. `TH/2 + 0.024 + 0.006` = **39 mm**.
   *
   *  ADR 0036's Consequences estimated this at "the door is 18 mm and the gap 4, which is 22, so
   *  something else contributes the remainder". The remainder is the **handle**, and the 4 mm it
   *  counted is `GAP`, the *lateral* shadow gap between two leaves — it never reaches the depth
   *  axis at all.
   *
   *  One constant and not two, although `pushOpen` omits the bar: §6.5 builds handles and hides
   *  them so the customer can switch them back on, so the declared envelope has to hold one
   *  whether or not it is currently visible. A carcass built with `pushOpen` therefore finishes
   *  21 mm inside its declared depth, which is the honest reading of a cabinet with no handle. */
  const FRONT_ASSEMBLY_D = TH / 2 + 0.024 + 0.006;

  const PLINTH = 0.1,
    CARC_H = 0.72,
    // M5 work item 7: derived from the declared cabinet depth, not typed. At 600 it is 0.56 to the
    // last micrometre, which is what keeps M1's parity gate green for every base builder.
    CARC_D = carcassDepthM,
    CTOP = 0.04;

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
    return box(w, CTOP, d, M.stone, name, 0, y, 0.02);
  }

  // ---- builders -------------------------------------------------------------
  function baseCabinet(w: number, opts: BaseCabinetOptions = {}): THREE.Group {
    const { doors = 2, counterTop = true, sink = false, drawers = 0 } = opts;
    const g = G("base_cabinet");
    g.add(plinth(w, CARC_D));
    if (sink) g.add(carcassFrame(w, CARC_H, CARC_D, PLINTH, true));
    else g.add(carcass(w, CARC_H, CARC_D, PLINTH));
    const fz = CARC_D / 2 + TH / 2,
      top = PLINTH + CARC_H;
    if (drawers) {
      const hs = drawers === 3 ? [0.24, 0.24, 0.24] : [0.36, 0.36];
      let y = PLINTH;
      for (const h of hs) {
        g.add(doorSlab(w - 0.006, h - GAP, 0, y + h, fz, "top"));
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
      // countertop split around the sink aperture (0.70 × 0.36, centred)
      const y = PLINTH + CARC_H,
        cd = counterDepthM,
        cz = 0.02,
        ax = 0.28,
        az = 0.2;
      g.add(
        box(
          w,
          CTOP,
          cz + cd / 2 - az,
          M.stone,
          "countertop_front",
          0,
          y,
          (az + cz + cd / 2) / 2,
        ),
      );
      g.add(
        box(
          w,
          CTOP,
          cd / 2 - cz - az,
          M.stone,
          "countertop_back",
          0,
          y,
          -(az + cd / 2 - cz) / 2,
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
            0,
          ),
        );
      const sk = builders["sink-faucet"]();
      sk.position.y = y + CTOP;
      g.add(sk);
    }
    return g;
  }

  /** ADR 0026: the narrow pull-out for oil and vinegar bottles, ~200 mm wide.
   *
   *  A base carcass under the same worktop as every other base body, carrying **one** front over
   *  its whole height. The front is a pull-out's, not a door's, and the difference is where the
   *  handle goes: `"top"` puts a horizontal bar across the top edge, the way a drawer front carries
   *  one, while a hinged single door (`baseCabinet(w, { doors: 1 })`) carries a vertical bar down
   *  its opening side. At 200 mm those two read as different cabinets at a glance, which is the
   *  point — the thumbnail draws the same horizontal bar.
   *
   *  Not an option on `baseCabinet`: another flag on a builder that already branches four ways on
   *  `doors`/`drawers`/`sink` would make a fifth path through it, and this body shares only its
   *  plinth, carcass and counter with that one. */
  function bottleCargo(w: number): THREE.Group {
    const g = G("bottle_cargo");
    g.add(plinth(w, CARC_D));
    g.add(carcass(w, CARC_H, CARC_D, PLINTH));
    const fz = CARC_D / 2 + TH / 2;
    g.add(
      doorSlab(w - 0.006, CARC_H - 0.01, 0, PLINTH + CARC_H - 0.004, fz, "top"),
    );
    g.add(counter(w));
    return g;
  }

  /** ADR 0027: where the hob sits on its own cabinet's worktop, as a **local** offset.
   *
   *  Not a new number — it is the seat `buildKitchen()` already gives the standalone cooktop,
   *  relative to the drawer base it stands on, and both sites read it from here so the composite
   *  cannot drift from the reference geometry the decomposition-parity gate diffs it against. */
  const HOB_FORWARD_OFFSET_M = 0.06;

  /** The oven's forward offset inside a 560 mm-deep carcass, shared with `tall-oven-tower` so the
   *  two appliances line up with each other rather than each with its own carcass.
   *
   *  It does **not** bring the oven flush, and is not meant to: measured, the oven front reaches
   *  z 358 — 28 mm proud of the worktop front at 330, and 78 mm proud of the carcass front at 280
   *  — which is what an oven door and handle do. `tall-oven-tower` reaches the same 358, so do not
   *  "correct" this to sit flush without changing the tower too. */
  const OVEN_FORWARD_OFFSET_M = 0.018;

  function seatHobOnWorktop(cabinet: THREE.Group): THREE.Group {
    const hob = builders.cooktop();
    hob.position.set(0, PLINTH + CARC_H + CTOP, HOB_FORWARD_OFFSET_M);
    cabinet.add(hob);
    return cabinet;
  }

  /** ADR 0027: the majority hob-bearing base — a hob over two pan drawers. Composed rather than
   *  drawn: it is exactly `baseCabinet(w, { drawers: 2 })` carrying `builders.cooktop()`, which is
   *  the pair `buildKitchen()` already renders in the seeded kitchen. */
  function hobBaseWithDrawers(w: number): THREE.Group {
    return seatHobOnWorktop(baseCabinet(w, { drawers: 2 }));
  }

  /** ADR 0027: a hob over a built-in oven — one cabinet, common where there is no room for an oven
   *  column.
   *
   *  An open-front carcass rather than `baseCabinet`'s closed one, for the reason
   *  `tall-oven-tower` uses the same: the appliance *is* the front, so a solid `carcass_shell`
   *  behind it would be a box inside a box. Nothing else here differs from a base cabinet — same
   *  plinth, same carcass extent, same worktop.
   *
   *  The oven is seated on the carcass floor, not hung under the worktop. The 125 mm that leaves
   *  between its top and the worktop line is where the hob's own box and its connections go; an
   *  oven pushed up against the worktop would be occupying that space, and `ovenFillerFront`
   *  dresses it. */
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

  /** The band the oven leaves under the worktop, closed with a **fixed, handleless** front in the
   *  run's own door material. Left open it read as an unfinished cavity: the carcass is open-front
   *  by design, so a customer looking at the cabinet saw straight past the fronts on either side
   *  into the shell. It is a facade, not a leaf — nothing behind it opens, so it carries no handle.
   *
   *  Named `..._door_front` because it is a front the customer finishes: Q6 (owner, 2026-09-01)
   *  decided the panel takes the run's finish rather than staying default white beside neighbours
   *  the customer can recolour, and `finishes.ts`'s `FRONT_MESH_NAME` is `/door_front|drawer_front/`
   *  — so the name is what makes `collectFronts` reach it. Renaming this mesh silently turns
   *  finishing off for `base-hob-oven`, whose `canFinish: true` rests on this one panel.
   *
   *  The band is **measured off the oven that was just built**, not written as 125 mm. That number
   *  is only what a 595 mm appliance happens to leave on a 720 mm carcass, and a typed copy of it
   *  would go stale the moment either moves.
   *
   *  Seated on `CARC_D / 2 + TH / 2` — the same front line every door and drawer front in this kit
   *  stands on, which is what makes it read as the rest of the run rather than as a patch — and
   *  `GAP` clear of the oven top, the shadow gap any two fronts leave each other. That keeps it
   *  behind both the oven's fascia and its bar, so the body still finishes exactly where ADR 0040's
   *  `HOB_OVEN_BASE_FINISHED_DEPTH_MM` declares it does. */
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
      CARC_D / 2 + TH / 2,
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

    "base-corner-x": () => cornerBaseX(),
    "base-corner-return": () => cornerBaseReturn(),
    // Preview only: the two independent bodies shown at their production junction.
    // Nothing is parented — each is placed exactly as buildKitchen() places it.
    "base-corner": () => {
      const g = G("corner_base_pair");
      const x = cornerBaseX();
      x.position.set(0.45, 0, 0.28);
      g.add(x);
      const r = cornerBaseReturn(0.58);
      r.position.set(0.29, 0, 0.74);
      r.rotation.y = Math.PI / 2;
      g.add(r);
      return g;
    },

    "wall-1door": () => wallCabinet(0.4, 1),
    "wall-2door": () => wallCabinet(0.8, 2),
    "wall-lift": () => wallLift(),
    "open-shelf": () => openShelf(0.8, 0.3, 2),

    "tall-pantry": () => {
      const g = tallCarcass();
      const H = 2.2,
        W = 0.6,
        fz = CARC_D / 2 + TH / 2;
      const dw = (W - 0.009) / 2;
      const doorBands: readonly (readonly [number, number])[] = [
        [PLINTH + 1.3, 1.29],
        [H, 0.79],
      ];
      for (const [y, h] of doorBands) {
        g.add(doorSlab(dw, h, -(dw + GAP) / 2, y, fz, "right"));
        g.add(doorSlab(dw, h, (dw + GAP) / 2, y, fz, "left"));
      }
      return g;
    },
    "tall-oven-tower": () => {
      const g = G("tall_unit");
      const W = 0.6,
        fz = CARC_D / 2 + TH / 2;
      g.add(plinth(W, CARC_D));
      // open-front frame in the appliance band, closed carcass above and below
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
      mw.position.set(0, 1.25, 0.089);
      g.add(mw);
      g.add(doorSlab(0.594, 0.5, 0, 2.2, fz, "bottom"));
      return g;
    },
    "tall-fridge-housing": () => {
      const g = tallCarcass();
      const fz = CARC_D / 2 + TH / 2,
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
      const W = 0.7,
        D = 0.68,
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
    dishwasher: (Wn = 0.6) => {
      const g = G("dishwasher");
      const W = Wn - 0.004,
        H = 0.72,
        D = 0.56;
      g.add(box(W - 0.05, H, D - 0.06, M.dark, "dw_body", 0, 0, -0.03));
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
    },
    cooktop: () => {
      const g = G("induction_cooktop");
      g.add(box(0.59, 0.012, 0.52, M.glassDark, "cooktop_glass", 0, 0, 0));
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
      const W = 0.56,
        D = 0.4,
        AX = W / 2 - 0.02,
        AZ = D / 2 - 0.02; // aperture half-sizes
      // rim flange around the opening
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
      // inner shadow line right under the rim — reads as the edge of the opening
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

  /** ADR 0036 decision 1: `D` is the **finished** depth — wall to the front of the door and its
   *  handle — so the shell is that less `FRONT_ASSEMBLY_D`. Before 5F the shell *was* `D` and the
   *  built front sat 39 mm proud of the declared number, which is the defect ADR 0036 records.
   *
   *  ADR 0036 decision 2 asked whether to merge the door into the shell instead, "only if we will
   *  simplify the code". It does not: the door is its own named mesh with its own material, its own
   *  handle children, `canHandle`/`canFinish` addressing and `scene-sync`'s handle hiding all
   *  keyed off it. Merging deletes all of that to save one subtraction, so the door stays separate
   *  geometry and only the arithmetic moves. */
  function wallCarcassDepth(D: number): number {
    return D - FRONT_ASSEMBLY_D;
  }

  /** Where a wall body's group origin sits off the wall plane so its back face lands on it
   *  (§11 row 19). Half the **shell**, not half the declared depth, since 5F. */
  function wallSeatOffset(D = 0.33): number {
    return wallCarcassDepth(D) / 2;
  }

  /** ADR 0039 decision 2: **the hood is hung at the front.** Its front face aligns with the
   *  cabinet-depth line — the owner confirmed it is that and not the worktop's 620, which ADR 0036
   *  decision 3 puts outside geometry altogether — so a standard 500 mm hood leaves
   *  `cabinetDepth − 500` of empty space behind it, which the chimney hides.
   *
   *  That makes this §11 row 19's **second named exception** (ADR 0025's corner leg is the first):
   *  the hood's back face is deliberately off the wall plane, declared and measured here rather
   *  than a tolerance that drifted. `HOOD_DEPTH_M` does **not** follow ADR 0036's depth map —
   *  decision 1, *"hood is always standard"* — so at a 700 mm kitchen the hood is still 500 and the
   *  gap becomes 200. */
  const HOOD_DEPTH_M = 0.5;
  const HOOD_SEAT_OFFSET_M = cabinetDepthMm / 1000 - HOOD_DEPTH_M / 2;

  function wallCabinet(
    W: number,
    doors: number,
    H = 0.7,
    D = 0.33,
    pushOpen = false,
  ): THREE.Group {
    const g = G("wall_cabinet");
    const shellD = wallCarcassDepth(D);
    g.add(carcass(W, H, shellD, 0));
    const fz = shellD / 2 + TH / 2,
      short = H <= 0.5;
    const hL: HandleEdge = pushOpen ? "none" : short ? "bottom" : "right";
    const hR: HandleEdge = pushOpen ? "none" : short ? "bottom" : "left";
    if (doors === 1)
      g.add(doorSlab(W - 0.006, H - 0.006, 0, H - 0.003, fz, hL));
    if (doors === 2) {
      const dw = (W - 0.009) / 2;
      g.add(doorSlab(dw, H - 0.006, -(dw + GAP) / 2, H - 0.003, fz, hL));
      g.add(doorSlab(dw, H - 0.006, (dw + GAP) / 2, H - 0.003, fz, hR));
    }
    return g;
  }

  // A lift-up: no hinged doors at all, one full-face flap. `DEVELOPMENT-SPEC.md` §6.5 puts its
  // handle on the **bottom** edge — the edge a hand can reach on an overhead flap — which
  // `wallCabinet` cannot produce for it, because that builder only chooses a bottom bar for a door
  // shorter than 500 mm and a lift-up's nominal height is 700. The defaults are the reference
  // builder's own literals, so `builders['wall-lift']()` is this call and the geometry is unchanged.
  function wallLift(W = 0.6, H = 0.7, D = 0.33): THREE.Group {
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

  // 600 standard, 450 slimline — the niche follows the appliance.
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
        -CARC_D / 2 + 0.01,
      ),
    );
    const dw = builders.dishwasher(W - 0.004);
    dw.position.set(0, PLINTH, 0.02);
    g.add(dw);
    g.add(counter(W));
    return g;
  }

  // `inner` counts the **interior** boards, which stand between `shelf_bottom` and `shelf_top` at
  // an even division of H — so `inner` boards are `inner + 1` compartments, and dropping one
  // re-centres the rest rather than leaving a gap. The default is the reference builder's own
  // literal and stays there for M1's parity gate; who asks for how many is the caller's decision,
  // and for §7's insertable entry that is `innerShelvesFor` in `catalog-bodies.ts` (ADR 0047).
  function openShelf(W = 0.8, D = 0.3, inner = 2, H = 0.7): THREE.Group {
    const g = G("open_shelf_unit");
    g.add(box(0.018, H, D, M.oak, "side_left", -W / 2 + 0.009, 0, 0));
    g.add(box(0.018, H, D, M.oak, "side_right", W / 2 - 0.009, 0, 0));
    g.add(box(W, 0.018, D, M.oak, "shelf_top", 0, H - 0.018, 0));
    g.add(box(W, 0.018, D, M.oak, "shelf_bottom", 0, 0, 0));
    for (let i = 1; i <= inner; i++)
      g.add(
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
      );
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

  // Backlog entry 9 closes here, in the opposite direction from what that entry assumed. Its
  // hardcoded canopy depth is not a defect to parameterise away: ADR 0039 decision 1 makes the
  // hood's depth **standard**, so the builder is right to ignore the depth it is handed. What had to
  // move is the *seat* — see `HOOD_SEAT_OFFSET_M`.
  function hood(w = 0.9, chimneyH = 0.57): THREE.Group {
    const g = G("extractor_hood");
    g.add(box(w, 0.13, HOOD_DEPTH_M, M.steel, "hood_canopy", 0, 0, 0));
    g.add(box(w - 0.04, 0.012, 0.46, M.dark, "hood_filter", 0, -0.006, 0));
    g.add(box(0.3, chimneyH, 0.28, M.steel, "hood_chimney", 0, 0.13, -0.09));
    g.add(box(0.28, 0.03, 0.02, M.dark, "hood_controls", 0, 0.06, 0.24));
    return g;
  }

  // ---- corner: two independent, separately-placeable cabinet bodies ---------
  // They are NOT arms of one object. Each owns its own plinth, carcass, worktop
  // and (for the X-leg) door + susan, and each computes its plinth recess from
  // ITS OWN carcass depth only — never from the other leg or the L footprint.
  // Placed side by side they meet on a shared face like any two cabinets.
  const CORNER_RECESS = 0.06; // plinth setback from a leg's own carcass front

  // X-leg: 900 wide × 600 deep. Owns the 280 mm door and the lazy susan.
  function cornerBaseX(): THREE.Group {
    const g = G("corner_base_x");
    const W = 0.9,
      LD = 0.6; // this leg's own carcass footprint
    const cFront = LD / 2; // 0.300
    const pFront = cFront - CORNER_RECESS; // 0.240 — from LD, nothing else
    const pDepth = 0.52,
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
    g.add(box(W, CARC_H, LD, M.carcass, "carcass", 0, PLINTH, 0));
    const pole = cyl(0.014, CARC_H - 0.06, M.steel, "susan_pole");
    pole.position.set(-0.02, PLINTH + (CARC_H - 0.06) / 2 + 0.02, -0.01);
    g.add(pole);
    for (const y of [0.12, 0.44]) {
      const t = cyl(0.2, 0.018, M.interior, "susan_tray", 40);
      t.position.set(-0.02, PLINTH + y, -0.01);
      g.add(t);
    }
    g.add(
      doorSlab(
        0.28,
        CARC_H - 0.01,
        0.3,
        PLINTH + CARC_H - 0.004,
        cFront + TH / 2 + 0.001,
        "left",
      ),
    );
    const wFront = cFront + 0.05,
      wDepth = 0.64;
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

  // Return leg: 320 wide along its wall; depth is the PLACEMENT VARIABLE — it
  // must equal the front plane of the neighbour it butts into (0.56 against a
  // standard base cabinet, 0.58 against a deeper tall unit).
  function cornerBaseReturn(LD = 0.58): THREE.Group {
    const g = G("corner_base_return");
    const W = 0.32;
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
    g.add(box(W, CARC_H, LD, M.carcass, "carcass", 0, PLINTH, 0));
    // Butts the X-leg slab (which already covers the corner) instead of running
    // through it — the two stone volumes share a face, no coplanar overlap.
    const wFront = cFront + 0.02,
      wDepth = 0.6,
      wWide = 0.27;
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

  function tallCarcass(): THREE.Group {
    const g = G("tall_unit");
    const H = 2.2,
      W = 0.6;
    g.add(plinth(W, CARC_D));
    g.add(carcass(W, H - PLINTH, CARC_D, PLINTH));
    return g;
  }

  // ---- L-shape kitchen ------------------------------------------------------
  // Wall A: back wall at z=0, cabinets extend to +z, run along x 0..3.6
  // Wall B: left wall at x=0, cabinets extend to +x, run along z 0..2.4
  function buildKitchen(): THREE.Group {
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
    // Seat a body flush on the wall plane (§6.2): measure the bounding box after adding it to the
    // room, never derive the plane from a round number or from the previous occupant.
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
    // Wall A parts face +z (default orientation), seated flush against the wall plane
    place(cornerBaseX(), 0.45, 0.28);
    place(cornerBaseReturn(0.58), 0.29, 0.74, Math.PI / 2);
    seatOnWallA(baseCabinet(0.8, { doors: 2, sink: true }), 1.3);
    seatOnWallA(builders["base-dishwasher"](), 2.0);
    const cookBase = seatOnWallA(baseCabinet(0.6, { drawers: 2 }), 2.6);
    const zA = cookBase.position.z;
    place(
      builders.cooktop(),
      2.6,
      zA + HOB_FORWARD_OFFSET_M,
      0,
      PLINTH + CARC_H + CTOP,
    );
    seatOnWallA(baseCabinet(0.6, { drawers: 3 }), 3.2);
    // The seat is the reference room's, kept to the micrometre for M1's parity gate. It is a
    // starting seat only: ADR 0045 has `syncRunEndPanel` re-derive it from the records on every
    // sync, so the panel follows the last base cabinet wherever a resize or a delete leaves it.
    place(
      box(
        RUN_END_PANEL_THICKNESS_M,
        RUN_END_PANEL_HEIGHT_M,
        0.6,
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

    // Wall B tall run: rotated 90° so fronts face +x, seated flush against the wall plane
    seatOnWallB(builders["tall-oven-tower"](), 1.2);
    seatOnWallB(builders["tall-pantry"](), 1.8);
    place(builders["fridge-free"](), 0.34, 2.45, Math.PI / 2); // already flush; not derived from a shared offset

    // upper run — continuous from the corner to the end, all on one line (1.50 → 2.20)
    //
    // The seats are derived, never typed: a wall body's shell is its declared depth less the front
    // assembly (ADR 0036), so half of *that* is what puts its back face on the wall plane
    // (§11 row 19). `openShelf` has no front assembly, so its own half-depth is unchanged.
    const yW = 1.5;
    place(wallCabinet(0.6, 2), 0.3, wallSeatOffset(), 0, yW);
    place(wallCabinet(0.57, 1), wallSeatOffset(), 0.615, Math.PI / 2, yW); // corner return, closes the upper L
    place(wallCabinet(0.3, 1), 0.75, wallSeatOffset(), 0, yW);
    place(wallCabinet(0.8, 2), 1.3, wallSeatOffset(), 0, yW);
    place(openShelf(0.6, 0.33, 2), 2.0, 0.165, 0, yW);
    place(hood(0.6), 2.6, HOOD_SEAT_OFFSET_M, 0, yW);
    place(wallCabinet(0.6, 2), 3.2, wallSeatOffset(), 0, yW);

    // top row — up to the ceiling (2.20 → 2.60), widths matching the middle row.
    // Overhead doors ship push-to-open: the handles are built and hidden, so the
    // configurator can still switch them on.
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
        pushOpen(wallCabinet(w, w > 0.4 ? 2 : 1, hT, 0.33)),
        x,
        wallSeatOffset(),
        0,
        yT,
      );
    place(
      pushOpen(wallCabinet(0.57, 1, hT, 0.33)),
      wallSeatOffset(),
      0.615,
      Math.PI / 2,
      yT,
    );
    place(
      pushOpen(wallCabinet(0.6, 2, hT, 0.6)),
      wallSeatOffset(0.6),
      1.2,
      Math.PI / 2,
      yT,
    );
    place(
      pushOpen(wallCabinet(0.6, 2, hT, 0.6)),
      wallSeatOffset(0.6),
      1.8,
      Math.PI / 2,
      yT,
    );
    place(
      wallCabinet(0.7, 2, 0.75, 0.6),
      wallSeatOffset(0.6),
      2.45,
      Math.PI / 2,
      1.85,
    ); // over the fridge

    // splashback on wall A
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
    openShelf,
    wallLift,
    hood,
    cornerBaseX,
    cornerBaseReturn,
    dishwasherHousing,
    bottleCargo,
    hobBaseWithDrawers,
    hobBaseWithOven,
  };
  return {
    builders,
    M,
    make,
    depths: {
      cabinetDepthM: cabinetDepthMm / 1000,
      baseCarcassDepthM: carcassDepthM,
      frontAssemblyDepthM: FRONT_ASSEMBLY_D,
      hoodDepthM: HOOD_DEPTH_M,
      hoodSeatOffsetM: HOOD_SEAT_OFFSET_M,
    },
    ownsGeometry: (geometry) => owned.geometries.has(geometry),
  };
}

type HandleEdge = "none" | "top" | "bottom" | "left" | "right";
