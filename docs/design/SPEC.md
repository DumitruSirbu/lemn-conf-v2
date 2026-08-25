# Kitchen 3D — implementation spec

Reference file: `kitchen-parts.js` (geometry + materials), `three-d-stage.js` (renderer/lighting), `kitchen-3d.html` (part picker).
All dimensions in **metres**, metric 600 mm module system. Style: slab fronts + short bar handles, matte white / oak / black stone.

---

## Coordinate & anchor conventions

Every builder returns a `THREE.Group` in **local model space**:

- **Origin** at the floor, horizontally centred on the unit.
- **+Y** up, **+Z** = the direction the fronts face, **+X** = right when facing the unit.
- `box(w, h, d, mat, name, x, y, z)` — `y` is the **bottom** of the box, not its centre (the helper adds `h/2`). `x`/`z` are centres.
- `cyl(r, h, mat, name, seg)` — centred on its own origin, axis on Y.

Shared constants (`kitchen-parts.js:188–205`):

| Const | Value | Meaning |
|---|---|---|
| `TH` | 0.018 | door / panel thickness |
| `GAP` | 0.004 | shadow gap between fronts |
| `PLINTH` | 0.100 | toe-kick height |
| `CARC_H` | 0.720 | base carcass height |
| `CARC_D` | 0.560 | base carcass depth |
| `CTOP` | 0.040 | worktop thickness |

Derived planes every base unit must respect (this is the alignment contract — most defects in this build were violations of it):

- carcass front → `z = CARC_D/2 = 0.280`
- front face of doors → `z = CARC_D/2 + TH/2 = 0.289`, outer face `0.298`
- worktop front → `z = 0.330` (620 deep, set 20 mm forward)
- plinth front → `z = 0.220` (recessed 60 mm)
- worktop top → `y = PLINTH + CARC_H = 0.820`; finished height `0.860`
- wall-cabinet band → `y 1.500 → 2.200`; ceiling row → `y 2.200 → 2.600`

---

## How to hand me better requirements

Yes — a structured spec per element is much more efficient than "make it match." Here's the shape that would have let me build the sink right the first time:

### Element: Sink + faucet
- **Reference location:** `kitchen-parts.js:394–431`, builder key `sink-faucet`
- **Geometry:**
  - Bowl aperture `W = 0.56`, `D = 0.40`; `AX = W/2 − 0.02`, `AZ = D/2 − 0.02`
  - `sink_rim_front/back` — `box(W, 0.012, 0.02)` at `z = ±(AZ + 0.01)`, `y = −0.012`
  - `sink_rim_left/right` — `box(0.02, 0.012, D − 0.04)` at `x = ±(AX + 0.01)`
  - `bowl_edge_*` — 2 mm `shadowGap` strips at `y = −0.024`, the visual edge of the opening
  - `bowl_wall_left/right` — `box(0.014, 0.185, D)` at `x = ±(W/2 − 0.007)`, bottom `y = −0.209`
  - `bowl_wall_back/front` — `box(W − 0.028, 0.185, 0.014)` at `z = ∓(D/2 − 0.007)`
  - `bowl_floor` — `box(W, 0.012, D)`, top at `y = −0.209`
  - `drain_ring` — `cyl(0.036, 0.004)` centred `y = −0.207`; `drain_hole` — `cyl(0.028, 0.008)` at `y = −0.211`
  - Faucet group offset `(0, 0.002, −D/2 − 0.04)`: escutcheon `cyl(0.048, 0.008)` → column `cyl(0.019, 0.262)` → hub `cyl(0.026, 0.062)` rotated Z 90° → lever `cyl(0.009, 0.13)` tilted −π/14 → gooseneck `TorusGeometry(0.075, 0.017, 16, 60, π)` rotated Y 90° at `y 0.27` → sprayhead `CylinderGeometry(0.018, 0.026, 0.095)` → nozzle `cyl(0.024, 0.008)`
- **Material:** rim/outer `M.steel` (metalness 0.92, brushed roughness map); interior `M.steelIn` #8d949b (rough 0.55 / metal 0.6); floor + back wall `M.steelDeep` #6f767d; edges + drain hole `M.shadowGap` #16181a. The interior deliberately uses *duller, darker* steel than the rim — against a bright environment map, matching them makes the cavity render as a flat white plate.
- **Scaling rule:** **fixed real-world size.** 560 × 400 × 185 mm regardless of host cabinet width. It is a bought appliance, not a panel. The host cabinet is 800 mm; the sink does not stretch to fill it.
- **Structural dependency:** **two, both of which were silently deferred once and caused defects.**
  1. The worktop must be **cut**, not solid — `baseCabinet()` splits it into `countertop_front/back/side` around an aperture of `ax = 0.28`, `az = 0.20`. A single slab caps the bowl.
  2. The **carcass must be an open frame with no top panel** — `carcassFrame(w, CARC_H, CARC_D, PLINTH, noTop = true)`. A solid `carcass()` shell, or even a frame *with* its top panel, caps the aperture at `y = 0.820` and leaves only the top 16 mm of the bowl walls visible. This is the single most expensive bug in the build; it was fixed for the oven tower and dishwasher housing before anyone noticed the sink had the same shape.
- **Priority:** must-have.

### Element: Base cabinet (all 1-door / 2-door / drawer variants)
- **Reference location:** `kitchen-parts.js:223–256`, `baseCabinet(w, opts)`; keys `base-1door` `base-2door` `base-3drawer` `base-panbank` `base-sink`
- **Geometry:** `plinth(w, CARC_D)` → `carcass()` or `carcassFrame()` → fronts at `fz = CARC_D/2 + TH/2` → `counter(w)`. Doors: 1 → full width, handle on the right edge; 2 → `(w − 0.009)/2` each, handles meeting at the centre. Drawers: 3 × 0.24 or 2 × 0.36, **equal heights**, stacked from `y = PLINTH`.
- **Material:** `M.door` (clearcoat lacquer), `M.carcass`, `M.stone` worktop, `M.dark` plinth, `M.shadowGap` front liner.
- **Scaling rule:** **scales with `w`** on X only. Depth, height, plinth, worktop overhang, drawer heights and handle length are all fixed — a 400 mm and an 800 mm unit have the same 190 mm handle.
- **Structural dependency:** `carcass()` includes a `front_liner` — a near-black panel 1.5 mm behind the fronts. Without it the 4 mm shadow gaps have nothing dark behind them and the fronts read as one flat panel.
- **Priority:** must-have.

### Element: Corner base + lazy susan — **two independent bodies**
- **Reference location:** `kitchen-parts.js` — `cornerBaseX()` and `cornerBaseReturn(depth)`; builder keys `base-corner-x`, `base-corner-return`, and `base-corner` (preview of the pair only)
- **Model:** this is **not** one L-shaped object. It is two complete, separately-placeable cabinets that happen to abut. Neither is a child of the other; `base-corner` exists only to preview them at their production junction and places them with exactly the same transforms `buildKitchen()` uses.

  **1. X-leg — `cornerBaseX()`** (owns the door and the susan)
  - Own footprint `LD = 0.60`; carcass `box(0.900, 0.720, 0.600)` at `y = PLINTH`
  - Plinth `box(0.896, 0.100, 0.520)`, front at `LD/2 − 0.06 = 0.240`
  - Worktop `box(0.904, 0.040, 0.640)`, front at `LD/2 + 0.05 = 0.350`
  - Door 280 mm at `x = 0.30`, front plane `LD/2 + TH/2 + 0.001`
  - Susan: `cyl(0.014, 0.660)` pole + 2 × `cyl(0.200, 0.018)` trays at `(−0.02, PLINTH + 0.12 / +0.44, −0.01)`
  - Placed at `(0.45, 0, 0.28)`

  **2. Return leg — `cornerBaseReturn(LD = 0.58)`** (no door — it butts the X-leg)
  - Width `0.320` along its wall; carcass `box(0.320, 0.720, LD)`
  - Plinth `box(0.316, 0.100, LD − 0.06)`, front at `LD/2 − 0.06`
  - Worktop `box(0.270, 0.040, 0.600)` at `x = −0.025`, front at `LD/2 + 0.02` — **butts** the X-leg slab, spanning `z 0.630 → 0.900` in the scene
  - Placed at `(0.29, 0, 0.74)`, rotated `π/2` — a normal wall-B cabinet, same as the tall units
- **Junction:** an ordinary seam between two abutting cabinets — **not** a special case. Carcass faces meet at `z = 0.580`; the X-leg worktop covers the corner (`z −0.010 → 0.630`) and the return worktop butts it (`z 0.630 → 0.900`). **No two stone volumes may interpenetrate** — coplanar top/bottom faces z-fight and produce the flickering patches reported earlier. Worktops are also cut to exact module width (no `+0.004` side inset) so every seam along the run butts instead of overlapping.
- **Material:** `M.carcass`, `M.dark` plinth, `M.stone` worktops, `M.steel` pole, `M.interior` trays, `M.door` front.
- **Scaling rule:** X-leg **fixed 900 mm wide**. Return leg depth is a **placement parameter**, not a constant — it must equal the front plane of the real neighbour it meets: `0.56` against a standard base cabinet, `0.58` against a deeper tall unit. Pass it in; never hard-code it.
- **Structural dependency — the one that broke before:** each leg computes its plinth recess (`CORNER_RECESS = 0.06`) **from its own `LD` only**. Never derive one leg's recess from the other leg's depth or from the combined L footprint. That coupling is what made the plinth protrude past the run in the original build, and splitting the bodies does not remove the risk — it just moves it into whichever function reads a dimension it does not own. If a recess expression references anything outside its own leg, it is wrong.
- **Priority:** must-have.

### Element: Wall cabinet / ceiling row
- **Reference location:** `kitchen-parts.js:456–469`, `wallCabinet(W, doors, H, D, pushOpen)`; keys `wall-1door` `wall-2door` `wall-lift`
- **Geometry:** `carcass(W, H, D, 0)` + fronts at `D/2 + TH/2`. Default `H = 0.70`, `D = 0.33`.
- **Material:** as base cabinet, no worktop.
- **Scaling rule:** scales with `W` and `H`. `H ≤ 0.5` switches handles to the bottom edge automatically.
- **Structural dependency:** `pushOpen = true` suppresses handles entirely. **Every unit in the ceiling row (2.20 → 2.60) is push-to-open** — no handles at that height.
- **Priority:** must-have.

### Element: Tall units (pantry / oven tower / fridge housing)
- **Reference location:** `kitchen-parts.js:305–338`; `tallCarcass()` at `:503`, `carcassFrame()` at `:492`
- **Geometry:** `H = 2.2`, `W = 0.6`, `D = CARC_D`. Oven tower: closed carcass at top, **open `carcassFrame` bands** for the appliance niches, drawer front at the bottom, shelf at `y = PLINTH + 1.11`.
- **Material:** as base cabinet; appliance cavities `M.dark`.
- **Scaling rule:** fixed 600 × 2200. Appliance niche positions are fixed to the appliances, not proportional.
- **Structural dependency:** **appliance cavities must be strictly smaller than the carcass interior** — `W − 0.06` wide, depth ≤ 0.48, inset from the back panel. A cavity flush with the shell produces z-fighting (the flickering coloured squares). Appliance fronts must sit **proud** of the carcass: oven `+0.018`, microwave `+0.089` on Z.
- **Priority:** must-have.

### Element: Appliances (oven, microwave, dishwasher, cooktop, hood, fridge)
- **Reference location:** `kitchen-parts.js:340–393`
- **Geometry:** oven 596 × 595 × 560; microwave 596 × 380 × 420; dishwasher 596 × 720 × 560; cooktop 590 × 12 × 520 glass + 4 torus burner rings + front touch strip at `z = 0.225`; hood 900 (or 600) canopy 130 high + 300 × 570 chimney; fridge 700 × 1850 × 680, door split at 1.15, vertical handles.
- **Material:** `M.steel` bodies, `M.glassDark` fronts/glass, `M.dark` cavities.
- **Scaling rule:** **all fixed real-world sizes.** Never scale to the housing; the housing is sized to them.
- **Structural dependency:** cooktop sits on the worktop at `y = PLINTH + CARC_H + CTOP` and must clear the backsplash — 80 mm free at the wall.
- **Priority:** must-have.

### Element: Open shelf unit
- **Reference location:** `kitchen-parts.js:471–481`, `openShelf(W, D, inner, H)`; key `open-shelf`
- **Geometry:** two 18 mm oak sides, top/bottom, `inner` evenly-spaced shelves, thin tile-coloured back.
- **Material:** `M.oak` (procedural grain), back `M.tile`.
- **Scaling rule:** scales with `W`/`H`; shelf count explicit.
- **Structural dependency:** none — but **do not place it in a corner**; open shelving in a corner is not a real detail.
- **Priority:** nice-to-have.

### Element: Handles
- **Reference location:** `kitchen-parts.js:171–186`, `barHandle(len, z, x, y, vertical)`
- **Geometry:** Ø12 mm bar standing 24 mm off the front on two Ø10 stems, inset 18 mm from each end. Length capped at **190 mm horizontal / 210 mm vertical**.
- **Material:** `M.steel`.
- **Scaling rule:** **fixed length regardless of front size** — short bars, not full-width rails.
- **Structural dependency:** none.
- **Priority:** must-have.

### Element: Realism pass (renderer)
- **Reference location:** `three-d-stage.js:217–300`; `chamferBox()` at `kitchen-parts.js:133`
- **Geometry:** every box is an `ExtrudeGeometry` with a **1.6 mm chamfer** on all 12 edges (`bevelSegments: 1`, cached by dimension key). Sharp 90° edges are the single biggest low-poly tell.
- **Material:** procedural equirect environment (sky gradient + two softboxes) through `PMREMGenerator`; ACES filmic tone mapping at exposure 0.98; hemisphere 0.45 + key 1.9 + fill 0.35; canvas-generated oak grain, granite speckle, tile grid, brushed-steel roughness map.
- **Scaling rule:** chamfer is absolute (1.6 mm), never proportional.
- **Structural dependency:** cast shadows are **off by design** — replaced by a soft radial contact blob under the object. Enabling directional shadows reintroduces the banding artefacts that were rejected.
- **Priority:** must-have for visual quality; explicitly **out of scope**: GI, caustics, ray-traced reflections — those need an offline render.

### Element: L-shape kitchen scene
- **Reference location:** `kitchen-parts.js:514+`, key `kitchen-l`
- **Geometry:** room `4.2 × 3.4`, walls 2.6 high. Wall A along X (fronts +Z): corner base → sink base 800 → dishwasher 600 → cooktop base 600 → drawers 600 → oak end panel. Wall B along Z (fronts +X, rotated π/2): oven tower `z 0.9` → pantry `z 1.5` → fridge `z 2.10–2.80`. Uppers 1.50 → 2.20 continuous `z 0.33 → 0.90` around the corner; ceiling row 2.20 → 2.60, push-to-open, widths mirroring the row below.
- **Material:** floor `M.floor`, walls `M.wall` (single-sided planes so the camera can see in), splashback `M.tile`.
- **Scaling rule:** fixed layout; module widths snap to the 600 grid.
- **Structural dependency:** **no gaps anywhere.** Adjacent units must share a face — between runs, at the corner, above the fridge, and between the upper rows. Every unit must sit fully on the floor slab; extend `RD` rather than letting a run overhang.
- **Priority:** must-have.

---

## What this format fixes

Every defect in this build traces to one of three missing pieces of information:

1. **Structural dependency not stated** → the sink was modelled correctly three times and stayed invisible, because the thing that had to change was the *cabinet*, not the sink.
2. **Scaling rule not stated** → handles stretched to front width; the sink became a 700 mm trough.
3. **Alignment contract not stated** → the corner unit protruded, the plinth stood proud, the upper row left a 50 mm slot.

Give me those three lines per element and the first pass lands.
