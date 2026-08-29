# Lemnaria Kitchen Configurator — Development Specification

Handoff document for rebuilding this prototype as a production product in **React + three.js (react-three-fiber)**.

This describes a **working** prototype, not a wish list. Every rule below is implemented and was verified by DOM/scene probes. Where a rule looks arbitrary, it is almost always the fix for a specific defect — those are marked **WHY:** and must not be "simplified away". This is the second attempt at this product; the 3D layer is the part that failed before, so it is specified in the most detail.

Source files in this project:

| File | Role in the port |
| --- | --- |
| `kitchen-parts.js` | **Reuse as-is.** Pure geometry library, framework-free ES module. The single source of truth for what a cabinet is. |
| `kitchen-3d.html` | **Port the logic, discard the shell.** Contains the entire domain model (placements, voids, insert/remove/swap/resize). ~700 lines; this document describes all of it. |
| `three-d-stage.js` | **Reference only.** Renderer/lighting/camera/OrbitControls harness — replaced by R3F. Read the camera framing + lighting numbers before discarding. |
| `Lemnaria Configurator Desktop.dc.html` | Desktop UI reference: screens, panel, copy (Romanian), states. |
| `Lemnaria Configurator Mobil.dc.html` | Mobile UI reference: same rules, sheet layout. |
| `cabinets/*.svg` | 18 line-art elevation icons, palette-coloured, thumbnail-weighted. Reuse directly. |
| `SPEC.md` | Per-part geometry spec (anchors, scaling rules, structural dependencies). Still valid. |

---

## 1. Stack mapping

| Concern | Prototype | Production |
| --- | --- | --- |
| Geometry | `makeKit(THREE)` → `{builders, M, make}` | unchanged, imported |
| Renderer | `<three-d-stage>` web component | `<Canvas>` + R3F |
| Scene graph | imperative `THREE.Group`s in a `room` group | `<primitive object={group}/>`, one per placement |
| Domain state | module-scope `items[]`, `voids[]`, `cols` | Zustand store, commands only |
| Host ↔ scene | `postMessage` across an iframe | direct store calls (protocol disappears) |
| Panel | Design Component template | React components |

**The `postMessage` protocol (§8) is an artefact of the iframe.** In production the panel calls store commands directly. Keep the *command names and payloads* — they are a good API — but drop the transport.

**Do not** rewrite geometry as JSX (`<mesh>` trees). The builders are imperative, parameterised and correct; call them in a `useMemo` and mount the resulting group with `<primitive>`. Rewriting them is how you lose the anchor conventions in `SPEC.md`.

---

## 2. World, units, conventions

Metres, Y-up. From `SPEC.md` and `kitchen-parts.js`:

- Every builder returns a `THREE.Group` in **local model space**, origin **on the floor, horizontally centred**, fronts facing **+Z**.
- `box(w,h,d,mat,name,x,y,z)` — `y` is the **bottom** of the box, not the centre.
- Room `kitchen-l`: 3.6 × 2.4 m footprint, wall height **2.6 m**.
- **Wall A** = back wall, plane **z = 0**, fronts face +Z, `rotation.y = 0`.
- **Wall B** = left wall, plane **x = 0**, fronts face +X, `rotation.y = π/2`.
- Rotated bodies: local +Z maps to world +X. Verified: a unit at `position.x = 0.165` with `D = 0.33` spans world x `0 → 0.369`.

Module constants (`kitchen-parts.js`): `PLINTH 0.10`, `CARC_H 0.72`, `CARC_D 0.56`, `CTOP 0.04`, `TH 0.018` (door), `GAP 0.004`.
Worktop top = `PLINTH + CARC_H + CTOP` = **0.86**.

**Worktop depth is `WORKTOP_DEPTH_MM` = 600, and a wall carcass's depth is derived from it, not written down** (owner, 2026-08-27; M5 wave 5A). One declared map — `600 → 330`, `700 → 400` — is the single source for both §7's `nominalDepthMm` on the wall entries and the head-clearance cap §7's builder column applies (`insert-fit.ts`, `WALL_CARCASS_MAX_DEPTH_OVER_WORKTOP_M`; the cap arrived with backlog entry 5 on 2026-08-26 and §5.2's pseudocode has not been amended to show it). The two were independent literals agreeing at **400 mm / 0.4 m** until then. A worktop depth the map does not declare is a programming error and fails loudly: wall cabinets are manufactured sizes, so there is no interpolation, no rounding and no nearest-row fallback. The worked example above — *"a unit at `position.x = 0.165` with `D = 0.33`"* — is this number, and is evidence 330 was the intent all along.

### Module lines (`LEVELS`)

```js
const LEVELS = [[0, 0.86], [1.5, 2.2], [2.2, 2.6]];   // base | wall | top
```

The gap **0.86 → 1.50** is backsplash. It is **never** an opening.
**WHY:** it was once offered as a 640 mm slot with zero valid contents — a dead end the user could click.

### Tolerances

| Name | Value | Use |
| --- | --- | --- |
| `TOL` | 0.012 | fit comparisons (width/height) |
| `MIN_SPAN` | 0.30 | smallest span that becomes a void |
| `MIN_W` | 0.30 | narrowest cabinet; resize floor |
| level snap | 0.02 | matching a start to a module line |
| neighbour adjacency | 0.03 | edge-to-edge along the wall |
| same row | 0.06 | equal `frame.y0` |
| accessory | `frame.h < 0.3` | worktop appliance detection |
| `Line.threshold` | 0.008 | raycaster (see §6.1) |

---

## 3. Domain model

Two collections. **Bodies are authored; voids are derived. Never author a void.**

### 3.1 Placement (a body standing in the room)

```ts
type Placement = {
  id: string;                 // 'p0'… originals, 'n0'… inserted
  obj: THREE.Group;           // the mesh tree
  kind: string;               // group name: base_cabinet | wall_cabinet | open_shelf_unit |
                              // dishwasher_housing | extractor_hood | tall_unit |
                              // fridge_freestanding | induction_cooktop | corner_base_x | corner_base_return
  build?: string;             // catalogue id, set when inserted — GROUND TRUTH for identity
  frame: Frame;               // the OPENING it occupies (not the mesh bounds)
  col: string;                // vertical run key
  rotated: boolean;           // wall B
  wall: 'A' | 'B';
  band: 'base' | 'wall' | 'top' | 'column';
  widthMm: number; heightMm: number;   // nominal, from the carcass
  doors: Mesh[]; handles: Mesh[];
  canFinish: boolean; canHandle: boolean; canReplace: boolean; canDelete: boolean;
  fixedWidth: boolean;
  accessory: boolean;         // worktop appliance, belongs to its host
  finishKey?: string;         // remembered choice, survives rebuilds
  handleMode?: string;        // remembered choice, survives rebuilds
};

type Frame = { x: number; z: number; ry: number; y0: number; h: number; w: number; d: number };
```

`frame` is the **opening**, and it is authoritative for occupancy:

- `w` from the **carcass** (`bodySize`), never the group bbox — handles and proud fronts must not inflate module pitch.
- `h`, `d` from the **full extent** — a body must clear the ceiling with everything it carries.
- **WHY (occupancy by frame, not mesh):** swapping a sink base for drawers "freed" the 360 mm the faucet occupied and produced a phantom void.

### 3.2 Column (`cols: Map<string, Column>`)

```js
col = (rotated ? 'B|' : 'A|') + (rotated ? frame.z : frame.x).toFixed(2)
```

```ts
type Column = {
  key: string; ry: number;
  x: number; z: number;      // from the DEEPEST member
  w: number;                 // MIN width of members
  d: number;                 // MAX depth of members
  top: number;               // highest reach at load time = the ceiling for this run
  regions: [number, number][]; // every original member's [y0, y0+h]
};
```

Columns are computed **once at load** and never change. Accessories contribute nothing.
**WHY (stability):** every void, level and merge keys off the column. The reorder feature was removed precisely so nothing can move horizontally and invalidate it.

### 3.3 Void (derived, transient)

```ts
type Void = {
  id: string;                 // 'v0'… regenerated every recompute
  isVoid: true; col: string;
  x: number; z: number; ry: number; w: number; d: number;
  y0: number; h: number;      // THIS LEVEL
  spanY0: number; spanH: number;  // the whole contiguous free span it belongs to
  mesh: THREE.Mesh;           // translucent box + dashed edges
  wall: 'A' | 'B';
};
```

A void is **free vertical space**, not the hole a cabinet left.
**WHY:** deleting a fridge used to leave a fridge-shaped hole only a fridge could fill — and since the fridge was flagged unreplaceable, the list came out empty.

---

## 4. `recomputeVoids()` — the core algorithm

Run after **every** mutation (remove, insert, swap, resize). Cheap: it is O(bodies).

```
dispose all void meshes
for each column c:
  taken   = bodies in c → [frame.y0, frame.y0 + frame.h], sorted
  y       = min(c.regions[].start)          # a wall-only column owns no floor space
  free    = []
  for [lo,hi] of taken:
      if lo - y > MIN_SPAN: free.push([y, lo])
      y = max(y, hi)
  if c.top - y > MIN_SPAN: free.push([y, c.top])

  for [lo,hi] of free:
      levels = LEVELS
        .map(([a,b]) => [max(lo,a), min(hi,b), a])
        .filter(([a,b]) => b - a > MIN_SPAN)
        .sorted by start
      if levels.length > 1 and levels[0].start > levels[0].levelStart + 0.02:
          levels = [[levels[0].start, last.end]]      # single opening
      for [a,b] of levels:
          emit Void { y0:a, h:b-a, spanY0:lo, spanH:hi-lo, geometry from c }
```

Four rules, each earned:

1. **Start at the column's own lowest module.**
   **WHY:** deleting the wall unit at x=0.30 offered a 2200 mm opening down to the floor — where the corner base actually stands. Overlapping columns.
2. **Subdivide by `LEVELS`, not by the column's history.**
   **WHY:** the fridge column's original modules were fridge(0–1.85) + top(1.85–2.6), so clearing it produced two odd slots instead of base/middle/top.
3. **No fallback.** An interval intersecting no level produces **no void**.
   **WHY:** the backsplash gap became a selectable slot with zero valid contents.
4. **A span starting mid-level stays ONE opening** (rule in the pseudocode).
   **WHY:** the 750 mm above an 1850 mm fridge was being cut by the 1500/2200 lines into two useless stubs. The kitchen wants one tall unit there.

Result set for a cleared standard column: `0.00→0.86`, `1.50→2.20`, `2.20→2.60` — three independently selectable slots that all still know `spanH = 2.6`.

---

## 5. Operations

### 5.1 `remove()`

Refuse if: void selected · `accessory` · `!canDelete` (corners).
Otherwise: remove `obj` from the scene, splice out of `items`, `recomputeVoids()`, then select the void that covers the vacated frame.

**Deletion is final. There is no undo.**
**WHY:** with merging voids there is no single state to revert to — a void may have merged with neighbours since. Undo and the span model contradicted each other; the span model is worth more.

### 5.2 `insert(buildId)` — into a void

```
b = BODIES[buildId]                             → else reject "not in library"
target band = void.h >= 1.9 ? 'column' : void.y0 < 0.2 ? 'base' : 'wall'
if b.band != 'column' and target != 'column' and b.band != target → reject (band message)
w = b.w === 'fit' ? void.w : b.w                → if w > void.w + TOL reject (width message)
h = b.hFlex ? (void.h <= 0.9 ? void.h : b.h) : b.h
takesSpan = h > void.h + TOL
if takesSpan and b.band != 'column' → reject "does not fit this level"
room4 = spanY0 + spanH - (takesSpan ? spanY0 : void.y0)
if h > room4 + TOL → reject (height message)
g = b.mk(w, h, void.d)
gs = CARCASS box of g                            → re-check width & height, reject on mismatch
y0 = lowest of (LEVELS starts ∪ column region starts ∪ minY) that fits, where
     minY = takesSpan ? spanY0 : void.y0
place at (void.x, y0, void.z), rotation.y = void.ry
add to scene, then SEAT against the wall (§6.2)
push Placement { build: buildId, frame:{…, y0, h: gs.y, w, d: void.d} }
describe(); if band==='top' and no handleMode → hide handle meshes
recomputeVoids(); select the new body
```

Five things that matter:

- **Band gate.** A wall carcass has no plinth and no worktop; it cannot stand on the floor. A base cabinet cannot hang. Enforced in the *engine*, not only the UI.
  **WHY:** the base slot offered wall bodies and produced a floating box resting on the floor.
- **Only `band === 'column'` may exceed its level** — not a height threshold.
  **WHY:** a 1800 mm freestanding fridge is full-height but was refused by a `h >= 1.9` test.
- **hFlex fills cabinet-sized openings** (`≤ 0.9`), else builds nominal.
  **WHY:** the 750 mm over-fridge slot got a 700 mm unit with a 50 mm strip of air; a 2600 mm cleared column must not build a 2600 mm wall cabinet.
- **Snap to module lines.** A wall unit dropped into a cleared column lands at **1500**, not flush on the worktop.
- **Fit is judged on the CARCASS**, matching `/carcass_shell|side_left|side_right|panel_bottom|plinth|counter|fridge_body|hood_canopy|dw_body/`.
  **WHY:** the sink base measured 1220 mm because of the faucet and was refused from an 860 mm opening it fits perfectly. Faucets and hood chimneys rise into free air.

### 5.3 `insert(buildId)` — swap in place (occupied selection)

Identical path; the current body's `frame` **is** the target opening. Then remove the old `obj`, splice it out, and keep `frame.h` **unchanged** (an opening's size does not change because its contents did).
**WHY (one code path):** the void rewrite dropped the swap branch and every "Înlocuiește" row silently did nothing. One path also keeps the fit guards from drifting apart.

### 5.4 `setWidth(target)` — resize as a boundary move

```
own sizes? (dishwasher_housing [0.45,0.6] · extractor_hood [0.6,0.9]) → reject if not one of them
d = target - frame.w
nb = neighbours(it)                    # same wall, same row (|Δy0| < 0.06), edge-adjacent (< 0.03)
donor = d > 0 ? first of [right,left] that canGive AND (w - d) >= MIN_W
              : first of [right,left] that canGive
if !donor → reject with the reason
dir = donor === right ? +1 : -1
it:    outer edge AWAY from the donor holds  → new centre = itEdge + dir*target/2
donor: its far edge holds                    → new width = donorW - d, centre accordingly
rebuild(it, target, …); rebuild(donor, donorW, …)
recomputeVoids(); reselect it
```

`canGive(m)` = exists · not accessory · not `fixedWidth` · not a corner · has a resolvable catalogue id.

- **The run total is conserved**, so overlap is unrepresentable and shrinking cannot leave a gap. Only `remove` creates voids.
- **`rebuild()` re-applies `finishKey` and `handleMode`.**
  **WHY:** resizing silently reset a sage door with black bars to default white with steel. Choice beats default; default (top-row push-open) beats nothing.
- **`buildIdOf(placement)`** maps an original body to a catalogue entry by inspection: `faucet|bowl_floor` → sink; ≥3 `drawer_front` → 3-drawer; 2 → pan bank; else door count. Inserted bodies use `build` directly.

### 5.5 Finish / handle

`setFinish(key)` recolours `doors` (`white | clay | sage | graphite | oak`) and records `finishKey`.
`setHandle(mode)` sets `handles` (`steel | black | push`); `push` hides them; records `handleMode`.
Both are per placement, never global. Material and hardware *brand* are global settings elsewhere in the flow.

---

## 6. 3D specifics that cost the most time

### 6.1 Picking

```
hits = raycast(bodies)                  // solids FIRST
if none: hits = raycast(void meshes)    // voids only where nothing solid is behind
climb parents to the owning placement/void
resolve accessories → host cabinet
```

- **Solids beat voids.** **WHY:** a deleted wall unit's void swallowed clicks aimed at the base cabinet below it.
- **Void outlines must not be raycast targets.** Set `edges.raycast = () => {}` and `raycaster.params.Line.threshold = 0.008`.
  **WHY (worst bug of the session):** three.js raycasts lines with a **1-metre** default threshold, so every dashed outline stole clicks from its neighbours — clicking the base slot selected the middle one. Symptom looked like "levels are wrong"; cause was picking.
- Void meshes are **inset 14 mm** so they never overhang a neighbour's face.
- Drag vs click: on `pointerup`, ignore if the pointer moved > 7 px (that was an orbit).
- Accessories (`frame.h < 0.3`, e.g. the hob) resolve to the cabinet they sit in, get no swap set and cannot be deleted.
  **WHY:** a 20 mm hob modelled as a module offered 6 rows it could never satisfy, and deleting it destroyed it permanently.

### 6.2 Seating a body against the wall

```js
const plane = rotated ? WALL_B_X : WALL_A_Z;   // read from wall_left / wall_back meshes
room.add(g); g.updateWorldMatrix(true, true);
const bb = new THREE.Box3().setFromObject(g);
const shift = plane - (rotated ? bb.min.x : bb.min.z);
if (rotated) g.position.x += shift; else g.position.z += shift;
```

Measure **after** placing; never derive the plane from the previous occupant.
**WHY (two failed attempts):** centring a 330 mm wall unit in a 600 mm fridge opening left it floating 135 mm off the wall; then deriving the plane from the occupant's bbox buried inserts 10–31 mm *inside* the wall, because bboxes are asymmetric about the group origin (recessed plinths, proud appliance doors) and one body's chamfer overshoot poisoned the whole column.

### 6.3 Identity

`describe(placement)` re-derives `kind`, `label`, `band`, `widthMm`, `heightMm`, doors/handles, `canFinish/canHandle`, `fixedWidth`, `canReplace`, `canDelete` from the mesh tree — **except** that a `build` id's catalogue label always wins.
**WHY:** picking *Nișă frigider integrat* (+7 600) produced a body labelled *Coloană cămară* (+9 400), because the housing has no `fridge_body` mesh to detect. Never infer identity from geometry when the user's choice is in hand.

### 6.4 Camera

Three presets; all must frame **floor to ceiling** or the top row becomes unclickable.

```js
overview: pos [4.3, 3.0, 5.3] target [1.6, 1.35, 0.85]
wallA:    pos [1.9, 2.1, 5.6] target [1.7, 1.35, 0.45]
wallB:    pos [5.4, 2.2, 2.3] target [0.5, 1.35, 1.75]
```

**WHY:** with the target at 1.05 the 2.2–2.6 m row projected to y≈37 px in a 540 px viewport — there was nothing left to click.

**Known unsolved:** a few placements are hard to hit from any fixed camera (the unit above the fridge; wall-B columns seen edge-on). Deliberately left open. Do **not** solve it with a "list of cabinets" side panel — that was built and rejected as scope creep. Candidate solutions: click-to-cycle through overlapping candidates, or per-band camera presets.

### 6.5 Handles

Overhead doors carry the bar on the **bottom** edge (`doorSlab(..., 'bottom')`, 40 mm inset) — the edge a hand can reach. Applies to short upper doors, the lift-up, the oven tower's upper door, the over-fridge door. Drawers keep top bars; tall wall doors keep vertical bars.

Top row ships **push-to-open**: handles are **built and hidden**, not omitted.
**WHY:** built without handles, `canHandle` was false and the panel hid the whole *Mâner* section — the user could never turn them on.

---

## 7. Catalogue (`BODIES`)

`w: 'fit'` = parameterised, builds to the opening. `hFlex` = height parameterised (capped at nominal).

| id | label | band | w | h | flex | builder |
| --- | --- | --- | --- | --- | --- | --- |
| `base-2door` | Corp bază 2 uși | base | fit | 0.86 | — | `make.baseCabinet(w,{doors:2})` |
| `base-1door` | Corp bază 1 ușă | base | fit | 0.86 | — | `{doors:1}` |
| `base-3drawer` | Corp bază 3 sertare | base | fit | 0.86 | — | `{drawers:3}` |
| `base-panbank` | Sertare pentru oale | base | fit | 0.86 | — | `{drawers:2}` |
| `base-sink` | Corp spălător | base | fit | 0.86 | — | `{doors:2,sink:true}` |
| `base-dishwasher` | Nișă mașină de spălat vase | base | 0.45 / 0.60 | 0.86 | — | `make.dishwasherHousing(w)` |
| `wall-2door` | Corp suspendat 2 uși | wall | fit | 0.70 | ✓ | `make.wallCabinet(w, w>0.45?2:1, h, min(d,0.33))` |
| `wall-1door` | Corp suspendat 1 ușă | wall | fit | 0.70 | ✓ | `make.wallCabinet(w,1,h,…)` |
| `wall-lift` | Corp suspendat rabatabil | wall | fit | 0.70 | ✓ | `…(…, pushOpen=true)` |
| `open-shelf` | Etajeră deschisă | wall | fit | 0.70 | ✓ | `make.openShelf(w, min(d,0.33), 2, h)` |
| `hood` | Hotă | wall | fit | 0.71 | — | `make.hood(w)` — sizes 600/900 |
| `tall-pantry` | Coloană cămară | column | 0.60 | 2.20 | — | `builders['tall-pantry']()` |
| `tall-oven-tower` | Coloană cuptor + microunde | column | 0.60 | 2.20 | — | fixed |
| `tall-fridge-housing` | Nișă frigider integrat | column | 0.60 | 2.20 | — | fixed |
| `fridge-free` | Frigider, liber | column | 0.70 | 1.80 | — | fixed |

Width chip sets per body: dishwasher `[450,600]` · hood `[600,900]` · everything else `[400,600,800]`.
**1000 mm was removed** — two doors top out at 800.

**The `0.33` in the four wall rows is derived, not a literal** (M5 wave 5A): it is the worktop → wall depth map's row for the shipped 600 mm worktop (§2), and the same row supplies these entries' `nominalDepthMm`. It read `0.4` until 2026-08-27, against a kitchen authored at 330. The cap is a *head-clearance* rule and applies only where something is leaned over: over a full-height column it is lifted and the carcass is as deep as the column, which is why `hood` (a canopy, 500) and the two deliberately deep top cabinets are untouched by it.

**Not yet parameterised** (production work): the hob (`induction_cooktop`) is fixed 590; corner units are fixed by design; columns are fixed 600 and refuse other openings with a reason.

---

## 8. Scene ↔ panel protocol

Keep the commands, drop the transport.

**Panel → scene**

| Message | Effect |
| --- | --- |
| `{t:'select', id, focus?}` | select body or void; `focus` reframes the camera |
| `{t:'deselect'}` | clear |
| `{t:'remove'}` | §5.1 |
| `{t:'insert', value:buildId}` | §5.2 / §5.3 |
| `{t:'width', value:mm}` | §5.4 |
| `{t:'finish', value}` / `{t:'handle', value}` | §5.5 |
| `{t:'view', value:'overview'\|'wallA'\|'wallB'}` | camera preset |
| `{t:'hint', value:bool}` | gesture hint overlay |

**Scene → panel** (`src: 'lemnaria-scene'`)

| Message | Payload |
| --- | --- |
| `{t:'ready', items:[meta]}` | initial inventory |
| `{t:'sel', item:meta}` | selection changed |
| `{t:'desel'}` | nothing selected |
| `{t:'rejected', msg}` | an operation was refused, with a human reason |

### `meta` — the panel's entire input

```ts
{
  id, label, empty, kind, band, bandLabel, wall,
  widthMm, heightMm,
  openWmm, openHmm,        // this level
  spanHmm,                 // the free span it belongs to (voids)
  minMm, growMm,           // resize slack
  donorSide: 'dreapta'|'stânga'|'', donorMm,
  sizes: number[],         // legal widths for THIS body
  fixedWidth, canFinish, canHandle, canReplace, canDelete, accessory
}
```

Everything the panel disables, it disables from these numbers — never by trying and catching a refusal.

---

## 9. Panel behaviour

Sections render only when their flag is true, in this order:

1. **Header** — label + `Perete X · band · W × H mm`, close button.
2. **Rejection banner** — `rejected`, at the **top of the body**, above every section.
   **WHY:** authored inside the width section it was invisible on exactly the fixed-width bodies that refuse most.
3. **Înlocuiește / Pune un corp aici** — `canReplace`.
   - occupied → the band's swap set, current row badged **ACTUAL**
   - void → catalogue filtered by fit: `group === slotBand`, plus `group === 'column'` when `spanH` allows; `hFlex` needs `openH ≥ 400`
   - count line derived (`"5 corpuri bază de 600"`, `"10 corpuri intră în 700 × 860 mm"`), never a literal
   - zero results → a sentence saying what to clear, never a bare "0"
4. **Finisaj** — `canFinish` (body has doors).
5. **Mâner** — `canHandle` (body has handle meshes, visible or hidden).
6. **Lățime** — `canWidth` = selected · not empty · not `fixedWidth`. Chips from `sizes`, each **active / free / blocked(dashed, unclickable)**, plus the consequence line: *"Lățimea se ia de la vecinul din dreapta (600 mm). Maxim 800 mm; sub 300 mm nu se coboară."*
7. **Footer** — price · **Șterge corpul** (`canDelete`) · **Gata**.

Rules that must survive the port:

- **Never offer what cannot be satisfied.** Disabled-with-reason beats warn-after-click. Every remaining refusal is a bug in a list, not a feature.
- **Swap sets are band-scoped.** A wall body must never appear in a base list (this shipped broken once: *Etajeră bază deschisă* in the base set).
- **Unknown `kind` renders no replace section** — no fallback set. **WHY:** a fallback produced six guaranteed-refused rows for the hob.
- Empty voids hide Finisaj, Mâner, Lățime — there is nothing to finish.

---

## 10. Screens and flow

Desktop 1920×1080; mobile 390×844. Same rules, same copy, different chrome.

```
1 Cameră  → 1A shape → 1B dimensions → 1C validation → 1D presets (loading)
          → 1E preset list → 1F no-preset → bespoke generation
2 Configurare (the 3D editor; everything above happens once)
3 Verificare → 4 Contact → 5 Success
```

### Step 2 — the editor loop

```
nothing selected ──tap body──→ body selected
                                 ├─ swap row      → body replaced, stays selected
                                 ├─ finish/handle → applied live
                                 ├─ width chip    → boundary moves, neighbour resized
                                 └─ Șterge        → void(s) appear, the vacated one selected
nothing selected ──tap void──→ void selected
                                 └─ catalogue row → body inserted, becomes selected
```

Mobile: the panel is a bottom sheet (~560 px of an 844 px screen), scrolling, footer pinned. Rows are 76–86 px. Chips scroll horizontally. **Both** embedded scenes are interactive and edits are routed back to whichever scene reported the selection.
**WHY:** with a single hard-coded target, taps in the first scene selected in a scene no panel was listening to — it looked unimplemented.

### The signature flow (must work end to end)

1. Select the fridge → **Șterge** → 700 × 1850 opening.
2. Select the unit above it → **Șterge** → the two merge into **one 700 × 2600 opening**, subdivided into three level slots.
3. Base slot → 14 bodies offered (base + full-height). Pick *Corp bază 2 uși* → placed at floor; the space above becomes the next void.
4. Middle slot → wall bodies, snapped to **1500**.
5. Top slot → 400 mm bodies, push-to-open by default.
6. Clear all three → one full-height opening again → *Frigider, liber* → placed at 0, **one** 750 mm slot above it (not two stubs).

### 10.1 Desktop and mobile are ONE implementation

In this prototype they are two files (`…Desktop.dc.html`, `…Mobil.dc.html`) only because each mockup draws its own fixed-viewport device chrome. **Do not carry that split into production.**

A parity audit of the two prototype files found the swap sets, the catalogue, the fit rules and the width-chip logic to be **character-for-character identical** — the only real differences were chip heights, row heights, font sizes and rail-vs-sheet. Everything that differed was layout; nothing that differed was a rule.

So:

| Layer | Structure |
| --- | --- |
| Domain (model, voids, insert/remove/swap/resize, guards, catalogue) | **one module**, no viewport awareness whatsoever |
| Store + commands | **one store** |
| Scene (R3F canvas, camera presets, picking) | **one component**; only the camera framing and canvas size differ |
| Panel sections (replace list, finish, handle, width chips, footer) | **one set of components**, driven by `meta` |
| Layout shell | **the only branch**: desktop → 420 px right rail, always visible; mobile → bottom sheet (~70–83 vh), scrolling, footer pinned |

Practical rules:

- Branch on layout, not on logic. A container component picks rail vs sheet; the section components inside are identical.
- Touch sizing is a token, not a fork: rows 76–86 px and chips ≥ 44 px on mobile, 52–70 px on desktop — same components, different spacing scale.
- Mobile-only affordances that are still shared logic: horizontally scrolling chip rows, and the sheet's pinned footer carrying price + Șterge + Gata.
- If a rule ever needs to differ between viewports, that is a signal the rule is wrong. In the whole prototype there was **no** such case.
- **Route edits to the scene that reported the selection**, not to a hard-coded canvas id. The prototype embeds two scenes on mobile; a fixed target made taps in the first one appear dead. In production this is one canvas, so the rule reduces to: the selection owns the target.

---

## 11. Edge cases (regression suite)

Every row is a bug that shipped and was fixed. Treat as acceptance tests.

| # | Case | Required behaviour |
| --- | --- | --- |
| 1 | Delete fridge, refill 3 levels, clear, re-insert fridge | one 750 mm slot above, never two stubs |
| 2 | Click the base slot of a cleared column | selects the base slot (not middle) |
| 3 | Wall body into a floor slot | refused: no plinth/worktop |
| 4 | Base cabinet into the top slot | refused (only `band:'column'` may exceed a level) |
| 5 | Column into a 300 mm opening | refused with mm in the message |
| 6 | Hood into the 400 mm top slot | never offered *and* refused (fixed **700** mm — [ADR 0039](../decisions/0039-the-hood-is-a-standard-depth-hung-at-the-front.md) decision 5; this row said 710, and wave 5F measured a built hood's carcass at 700.000 mm with the real probe) |
| 7 | Sink base into an 860 mm opening | **allowed** — faucet excluded from fit |
| 8 | Swap sink → drawers | no phantom void from the freed faucet height |
| 9 | Resize 600 → 800 with a 600 neighbour | neighbour becomes 400, outer edges hold |
| 10 | Resize 600 → 1000 | not offered (would push neighbour under 300) |
| 11 | Resize next to a corner / appliance | all chips blocked; corners and appliances never donate |
| 12 | Resize after choosing finish + handle | both preserved |
| 13 | Resize a top-row unit | stays push-to-open unless a handle was chosen |
| 14 | Dishwasher niche | only 450 / 600; both build a real carcass |
| 15 | Click the hob | selects its host cabinet; hob cannot be deleted |
| 16 | Corner base | no swap list, no delete, refusal explains why |
| 17 | Backsplash zone (860–1500) | never an opening |
| 18 | Wall-only column | no floor space invented under it |
| 19 | Insert on wall A and wall B | back face exactly on the wall plane (0.000), with **two named exceptions**: the corner base X-leg at −0.020 ([ADR 0025](../decisions/0025-the-corner-base-legs-seat-on-the-l-joint.md)) and the front-hung hood at +0.100 ([ADR 0039](../decisions/0039-the-hood-is-a-standard-depth-hung-at-the-front.md) decision 3). Both are declared and measured, never a tolerance |
| 20 | Insert into a 570 mm opening | body builds to 570, door count follows width |
| 21 | Top row reachable from all 3 camera presets | projects well inside the viewport |
| 22 | Delete, then click another cabinet | selects it (voids never swallow clicks) |
| 23 | Pick *Nișă frigider integrat* | stays that product and price |
| 24 | Any unknown `kind` | no replace section at all |

---

## 12. Production model (recommended)

```ts
const CabinetBody = z.object({
  buildId: z.string(),                 // catalogue key
  widthMm: z.number().int(),
  heightMm: z.number().int(),
  finish: z.enum(['white','clay','sage','graphite','oak']).optional(),
  handle: z.enum(['steel','black','push']).optional(),
});

const Placement = z.object({
  id: z.string(),
  wall: z.enum(['A','B']),
  alongMm: z.number().int(),           // centre along the wall
  y0Mm: z.number().int(),
  body: CabinetBody,
});

const Design = z.object({
  room: z.object({ shape: z.enum(['L','linear']), widthMm: z.number(), depthMm: z.number(), heightMm: z.number() }),
  presetId: z.string().nullable(),
  placements: z.array(Placement),
});
```

- **`Design` is the persisted truth.** Geometry is derived from it on load — never serialise meshes.
- Store commands mirror §8: `select`, `remove`, `insert`, `setWidth`, `setFinish`, `setHandle`. Each returns `{ok} | {ok:false, reason}`; the panel renders `reason` in the banner. **No product logic in components.**
- Recompute voids inside the store after every command; expose `voids` as derived state.
- `dynamic(..., { ssr: false })` for the 3D subtree — three.js cannot render on the server.
- Price: derive from `placements`, never store a total.

### Build order

1. `kitchen-parts.js` in, rendered via `<primitive>`, camera presets ported. No editing.
2. Placement/column/void model + `recomputeVoids`. Unit-test §11 rows 1, 17, 18 with no UI.
3. Picking (§6.1) — solids-before-voids, lines excluded. Test row 2 and 22 first; this is where the time went.
4. Insert / remove / swap with all guards. Rows 3–8, 15, 16, 19, 20, 23.
5. Panel from `meta`. Rows 24, plus the "never offer the impossible" rule.
6. Resize. Rows 9–14.
7. Then presets, verification, contact — plain forms by comparison.

**Not built, designed:** run **re-split** — a run's total (e.g. 1400 mm) offered as valid module combinations (800+600, 600+400+400), never as free-form arithmetic. This is how a user gets three cabinets where two stood, and it is the only remaining piece of the width story.

---

## 13. Decisions, rejected directions, open questions

Conclusions reached in the design session. The rejected ones matter most: each was built or specified, then dropped for a reason — re-proposing them costs a cycle.

### 13.1 Decided

| Decision | Rationale |
| --- | --- |
| **Filtered list, never pagination**, for choosing a cabinet | The slot knows its width and band, so 20 catalogue items reduce to ~6 valid ones — there is nothing left to paginate. Pagination hid the right answer 75% of the time and, on mobile, its 44 px pager ate 82 px of sheet height. Three layouts were mocked (paginated grid / filtered list / full catalogue with sticky band tabs); the paginated one was deleted at the user's request. |
| **Row list, not a grid, on mobile** | At 390 px a row gives the name full width and makes the whole 86 px strip the tap target; a 2-up grid gives 165 px cards and truncated names. |
| **Replace is same-band; delete makes space; insert offers what fits** | Cross-band replacement needs compatibility maths that never terminates cleanly. These three verbs cover every rearrangement, each single-purpose. |
| **Reorder (Mută la stânga/dreapta) removed** | Only well-defined when both cabinets share a width; otherwise it breaks vertical alignment or drags in the whole neighbour-slack calculation. Select-then-replace expresses the same intent in two explicit taps. Bonus: nothing can move horizontally any more, so column identity is permanently stable — which is what keeps the void model honest. |
| **Work column by column** (base → middle → top, then the next column) | Preserves vertical alignment by construction rather than by checks. |
| **Undo removed** | See §5.1 — irreconcilable with merging spans. |
| **Corners are structural** | No replace, no delete, never a width donor. A sink-in-corner request is a custom product, not a loosened rule. |
| **Top row ships push-to-open** | Overhead doors read cleaner without hardware; handles exist but hidden so the choice stays available. |
| **1000 mm dropped** | Two doors top out at 800; nobody specifies a 1000 mm cabinet. |
| **Disable, don't warn** | Any size or body that cannot be satisfied is greyed and unclickable, with the reason and an unlock action. A refusal reaching the user means a list offered something it shouldn't. |

### 13.2 Rejected

| Rejected | Why |
| --- | --- |
| **"Corpuri în scenă" navigator** — band chips + a cell per placement in the panel, selecting and flying the camera to it | Built, then removed as scope creep: it answered a bug report (unreachable top-row units) with a new feature. The underlying reachability problem is still open (§6.4) and should be solved in the scene, not by a side list. |
| **Auto-shifting a whole run** to make room when resizing | Positions carry meaning — sink under the window, hob under the hood, dishwasher beside the sink. Silently sliding a run breaks those relationships and the user cannot see what moved. If wanted, it must be an explicit named action ("Aliniază la stânga/dreapta"). |
| **Free-form width entry** | Only module values exist; a numeric field invites invalid states and arithmetic the user shouldn't do. |
| **Deriving the wall plane from the previous occupant's bbox** | Two failed attempts (§6.2). Read the room's wall meshes. |
| **Inferring a body's identity from its mesh tree when a catalogue choice exists** | Produced a fridge housing labelled and priced as a pantry (§6.3). |

### 13.3 Open questions for production

1. **Unify the occupied swap sets with the fit-filtered catalogue?** Today an occupied cabinet uses a hand-authored per-kind set (5–6 rows) while a void uses the catalogue filtered by fit (10–15). The dishwasher niche has 3, which looks broken beside its neighbours. Unifying gives one source of truth; the cost is losing the implicit discouragement of swapping a plumbed niche for plain storage — that consequence would move into the note or a confirmation.
2. **Run re-split** — the last piece of the width story (§12).
3. **Click reachability** of placements occluded from every fixed camera (§6.4).
4. **Arbitrary room shapes.** `LEVELS` and the two wall planes are constants for this 3.6 × 2.4 m L-shaped room. The concepts (column, span, level, run) generalise, but they must become per-wall data.
5. **Presets have no per-preset geometry.** All four presets load the same `kitchen-l` scene and differ only by door finish and camera angle; their thumbnails in `shots/presets/` were rendered from that scene by `preset-shots.html` (keep that rig — re-run it whenever geometry or finishes change, so thumbnails cannot drift from the model). Real presets need a recipe per preset.
6. **Hob and corner widths** are still fixed in geometry; parameterising them is the remaining builder work.

### 13.4 Asset provenance

- `cabinets/*.svg` — 18 front-elevation line drawings, sourced from a reference library, recoloured to the palette ink (#1c1814) and re-weighted for thumbnail size (carcass outlines heavy, handle/detail lines at half weight). They are rendered as CSS `background-image` on the thumb tile, **not** as `<img>`: an unresolved value then paints nothing instead of firing a failed request.
- `shots/presets/*.png` — real renders of the 3D scene, not illustrations.
