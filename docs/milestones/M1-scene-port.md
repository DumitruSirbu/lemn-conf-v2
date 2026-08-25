# M1 — Geometry port and render foundation

Status: **closed 2026-08-25.** Fidelity gate passed on both kinds of required evidence. Blocks every
later phase, which may now proceed.
**Highest-risk and highest-priority phase in the plan.** A previous attempt at this project failed
here, and the owner has named the ported cabinets' visual quality as the thing that matters most.
Reference: `DEVELOPMENT-SPEC.md` §1, §2, §6.2, §6.4, §6.5; `SPEC.md` in full;
`ARCHITECTURE_PROPOSAL.md` §6.1–§6.3; `docs/decisions/2026-08-24-design-reference-supersession.md`
§5c; mockup frames 2A / D2A and 2F / D2F.

## Progress — 2026-08-25

Implemented, reviewed, and verified. `apps/web` (Next.js App Router) and `packages/three-adapter`
were scaffolded; `kitchen-parts.js` and `three-d-stage.js` were ported to TypeScript; the R3F canvas
host, three camera presets, and the WebGL-unavailable state (2F/D2F) were built.

**The fidelity gate — both kinds of evidence, both passed:**

- **Evidence 1, structural parity (automated).** `kitchen-parts.parity.test.ts` imports the
  **unmodified** reference `kitchen-parts.js` directly (via a vitest alias) and diffs the ported tree
  against it — mesh names, hierarchy, and position/rotation/scale/size at a 1e-6 m epsilon — across
  all 27 builder keys plus every width-parameterised factory. `kitchen-parts.contract.test.ts` asserts
  the real invariants (derived planes, chamfer measured off actual geometry vertices, corner-leg
  recess independence, appliance cavity insets, fixed purchased-part sizes, handle caps, push-open
  hidden-not-omitted handles) rather than existence/count checks. 112 tests in `three-adapter`, 222
  total across the workspace, all passing.
- **Evidence 2, side-by-side visual comparison (human-checked, required by this gate — not satisfied
  by tests alone).** The coordinating agent personally viewed the ported renders against the shipped
  reference images in `shots/` (not a delegated claim): `shots/presets/01-p.png` against the ported
  white-finish render, `shots/handles.png` against the ported handles closeup, and `shots/real.png`
  for overall material/lighting character. Layout, proportion, materials, and lighting character
  matched. Separately, the implementer built a second, more rigorous check: an unmodified copy of
  `preset-shots.html` (the reference's own capture rig, loading three.js 0.184.0 from source) is run
  headless from the same cameras as the port, and the two pixel sets are diffed directly —
  `maxChannelDelta: 0` across all four preset shots and five targeted detail shots. This is a stronger
  test than diffing against the shipped PNGs (which are resized and some use unrecorded cameras) and
  was verified by the coordinator to be a genuine two-codebase comparison, not a self-comparison
  artifact, before being accepted as evidence.
- Mobile (390×844) and desktop (1440×900) surfaces verified by real Playwright interaction, not test
  assertion alone: camera-preset chips meet the 44px touch target and thumb reach, orbit changes the
  view, console is free of errors (one benign upstream `THREE.Clock` deprecation notice from three.js
  0.184.0 itself, not introduced by the port). The forced WebGL-unavailable run shows the correct
  Romanian copy, two continuation paths, no price, and explicit no-fake-preview messaging on both
  viewports.

**Review outcome:** clean-code and logic review both ran against the diff. Logic review's verdict:
*matches intent, no blockers* — it independently hand-traced the derived planes, the sink's two-part
requirement (cut worktop **and** open-frame carcass), and the corner-legs' independent recess
derivation against the reference source, not just against the milestone doc's summary of it. Two
non-blocking dead-code observations were noted (an unreachable regex alternative in `finishes.ts`; a
correctly-dropped unused reference-source local variable) — no behavior change, not filed as defects.
Clean-code review found one real, now-fixed defect: `apps/web/scripts/fidelity-shots.mjs` and
`verify-surfaces.mjs` shipped with the implementing agent's own machine-local scratchpad path as their
default output directory — non-portable to any other machine, session, or CI. Fixed to a repo-relative,
gitignored `.tmp/fidelity` default (both scripts still accept an override); reverified with a full
`pnpm format:check && pnpm lint && pnpm typecheck && pnpm test` pass after the fix. Two low-severity
notes (a small duplicated dev-server bootstrap between two verification scripts; one placeholder route
using inline styles instead of the established CSS-module tokens, explicitly marked as a stand-in for
a later milestone) were left as-is — cheap to fix if either file is touched again, not worth a
dedicated pass now.

**`pnpm build` passes** (Next.js production build, all three workspace packages). Camera presets
match `DEVELOPMENT-SPEC.md` §6.4 exactly; the fidelity-capture cameras are correctly kept distinct
from the product's own three camera presets (two different, intentionally separate camera specs in
the source material).

## Correction — 2026-08-25

M2's Wave 2A work surfaced a real M1 defect (`docs/decisions/2026-08-25-m2-row19-m1-wall-gap-finding.md`):
`buildKitchen()` seated six bodies (the base row and the two tall units on wall B) at hardcoded
round offsets (`zA`/`xB = 0.3`) instead of deriving the seat from each body's own measured
half-depth per §6.2, leaving them 10–20 mm proud of the wall plane. Fixed by seating those six
bodies with a §6.2-style helper (position at the wall plane, add to the room, measure the actual
bounding box, shift by its back-face offset) in **both** `buildKitchen()` implementations —
`packages/three-adapter/src/kitchen-parts.ts` and the reference
`packages/three-adapter/reference/kitchen-parts.js` — so Evidence 1's fidelity diff
keeps comparing against a reference that is itself correct, rather than reproducing the reference's
defect. This means the "Boundaries" acceptance criterion above ("the reference files under
`design-source/` are not modified") no longer holds absolutely: the reference was corrected once,
deliberately, as a single change applied to both sides of the fidelity gate together, not treated as
a routine dependency. `kitchen-parts.parity.test.ts` (Evidence 1) was re-verified passing after the
change with no other assertions affected.

**Deliberately out of scope, confirmed absent on review:** no selection, no voids, no mutation, no
per-placement decomposition — the whole `kitchen-l` scene is mounted via `<primitive>` exactly as M1's
scope requires. That decomposition, and re-proving fidelity against it, is M2's first act.

## Goal

Render the reference L kitchen in the production application, at the mobile viewport, from the
ported builders — with correct geometry, materials, camera framing and no editing whatsoever. When
this phase closes, the thing on screen is the reference scene, and any later visual defect is
attributable to a mutation rather than to the port.

## Why first

`DEVELOPMENT-SPEC.md` opens by saying the 3D layer is the part that failed on the previous attempt.
§12's build order puts the parts library and camera presets before anything else. Every subsequent
phase asserts against geometry, so an unproven port would make every later failure ambiguous.

## Starting state

Verified 2026-08-25 against the working tree, because the work items below assume more scaffolding
than exists:

- `packages/configurator-domain` is the **only** package. There is no `apps/web` and no
  `packages/three-adapter`; `pnpm-workspace.yaml` globs `apps/*` and `packages/*`, so both are
  additions this phase makes, not places it fills in.
- Root scripts (`build`, `check`, `format:check`, `lint`, `test`, `typecheck`) run recursively over
  workspace packages, so a new package must supply its own matching scripts to be covered by
  `pnpm check`.
- The Vercel project is linked and Neon is provisioned with credentials in `.env.local`, but M1 needs
  neither — persistence is M2. Do not wire a database in this phase.

## Scope

In: creating the `apps/web` Next.js application and the `packages/three-adapter` package; porting
`kitchen-parts.js` and the `three-d-stage.js` renderer setup into the adapter; the R3F canvas host;
the three camera presets; rendering the reference L scene; the WebGL-unavailable state.

Out: selection, voids, any mutation, per-placement decomposition, persistence, the panel, price, and
every other screen.

## Work items

0. Scaffold `apps/web` (Next.js App Router, strict TypeScript) and `packages/three-adapter`, each
   with the lint/typecheck/test/build scripts the root recursive commands expect, and the
   restricted-import boundary from `ARCHITECTURE_PROPOSAL.md` §3 so the domain cannot import React or
   Three.js.
1. Port `kitchen-parts.js` into `packages/three-adapter` with builder math, mesh hierarchy, mesh
   names, materials, the chamfer cache and every structural dependency intact. Expose typed builders
   keyed by catalogue id. Do not rewrite geometry as JSX meshes. The catalogue *entries* — bands,
   width flex, which builder each id calls — are M3's work item 1; M1 only needs the keys the
   reference's own builder map already uses, so the registry exists and is typed before M3 fills in
   the product metadata around it.
2. Port the renderer setup from `three-d-stage.js` — procedural PMREM environment, ACES tone mapping
   at exposure 0.98, hemisphere 0.45 + key 1.9 + fill 0.35, the canvas-generated oak/granite/tile/
   brushed-steel maps, and the soft radial contact blob — into the R3F canvas. Directional cast
   shadows stay off.
3. Mount the reference scene with R3F's `primitive` bridge by calling the ported
   `builders['kitchen-l']()` and mounting the group it returns. **Render the reference scene as the
   reference builds it** — this phase has no placement model to decompose it into, and the fidelity
   gate's comparison is only valid against the same scene the reference renders.

   This is deliberately narrower than `ARCHITECTURE_PROPOSAL.md` §6.1's migration path, whose step 3
   says not to reintroduce `buildKitchen()` world placement. That instruction stands **for M2
   onward**, where placements exist and each body is mounted individually with a derived wall
   transform and seated by measuring its bounding box after adding it to the room. M1 uses the whole
   scene builder because `DEVELOPMENT-SPEC.md` §12 step 1 asks for exactly that — "`kitchen-parts.js`
   in, rendered via `<primitive>`, camera presets ported, no editing" — and because a fidelity
   comparison against a per-placement re-composition would be measuring the decomposition, not the
   port. M2's first act is to reproduce this same scene from placements and show it matches.
4. Implement the three camera presets (`overview`, `wallA`, `wallB`) with the exact positions and
   targets in §6.4, and the camera-preset control shown in frames 2A and D2A.
5. Implement the WebGL-unavailable state (2F mobile, D2F desktop): an explanation that configuration
   happens in the model, two named ways to continue, no price, and no static preview.
6. Route-load the canvas client-side only; keep one renderer alive; render on demand outside active
   gestures; cap device pixel ratio adaptively.

## The fidelity gate

This phase does not close on "it looks about right". It closes on two independent kinds of
evidence, both required.

**It is a port, not a reimplementation.** The builders are called, not rewritten. Any of the
following makes the port non-compliant regardless of how the result looks:

- geometry re-authored as JSX `<mesh>` trees;
- a builder replaced by an approximation, a simplification, or a "cleaner" rewrite;
- mesh names changed, flattened, or dropped — several rules elsewhere in the plan match on them
  (carcass detection for fit, accessory detection, door and handle collection, wall-plane reads);
- the chamfer, the material definitions, or the procedural texture generation reimplemented rather
  than carried over;
- the lighting and tone-mapping rig treated as optional. The environment, exposure and light setup
  are what make the geometry read as product photography. Porting the builders without them does not
  satisfy this gate.

**Evidence 1 — structural parity, automated.** For every builder in the catalogue, assert against
the reference implementation: the set of mesh names produced, the hierarchy those meshes sit in, and
each mesh's dimensions and position. A builder that produces a different mesh set for the same
arguments fails, even if the render looks similar. These assertions are the regression net that keeps
a later refactor from quietly degrading the port.

Comparison strictness, so this is not left to judgement: the mesh-name set and the parent/child
hierarchy must match **exactly** — no missing name, no extra name, no reparenting. Dimensions and
positions are computed from the same constants by the same arithmetic, so they should be exact too;
compare them at a float epsilon of 1e-6 m, which allows for accumulation order and nothing else. A
difference larger than that is a port defect, not a tolerance question. This epsilon is a
floating-point artefact allowance and has no relationship to the domain tolerances in
`DEVELOPMENT-SPEC.md` §2, which are product rules and must not be borrowed here.

**Evidence 2 — side-by-side visual comparison, human-checked.** The reference ships real renders of
its own scene in `design-source/Modern Kitchen Cabinets 3D (3)/shots/`, and the rig that produced
the preset shots is `preset-shots.html`, which pins the exact conditions:

| Shot | Scene | Finish | Camera position | Target |
| --- | --- | --- | --- | --- |
| `shots/presets/01-p.png` | `kitchen-l` | white | `[4.3, 2.9, 5.3]` | `[1.5, 1.15, 0.9]` |
| `shots/presets/02-p.png` | `kitchen-l` | clay | `[2.9, 2.5, 5.9]` | `[1.4, 1.10, 0.8]` |
| `shots/presets/03-p.png` | `kitchen-l` | sage | `[5.5, 3.2, 4.4]` | `[1.6, 1.15, 0.9]` |
| `shots/presets/04-p.png` | `kitchen-l` | oak | `[3.9, 2.7, 5.6]` | `[1.5, 1.10, 0.9]` |

at 960 × 640 on background `#f2f0ea`. Reproduce each of the four from the **ported** builders under
the same conditions and compare against the reference image. Additionally compare against the
targeted reference shots for the details that were hardest to get right: `shots/real.png` for
overall material and lighting character, `shots/flush-wall.png` for wall seating,
`shots/handles.png` and `shots/top-handles.png` for handle placement and proportion,
`shots/push-open-top.png` for the ceiling row.

A difference in framing or antialiasing is acceptable. A difference in proportion, material
character, lighting character, edge treatment, seam position, or the presence or absence of any part
is not, and is a defect against this gate rather than a note for later.

**Pin the three.js version.** The reference rig runs three.js 0.184.0. Materials, tone mapping and
`ExtrudeGeometry` bevelling are all version-sensitive, so a version bump is a change that must be
re-verified against this gate, not a routine dependency update.

## Acceptance criteria

Geometry and anchors — from `SPEC.md`:

- Every builder returns a group whose origin is on the floor and horizontally centred, with +Y up,
  +Z the direction the fronts face and +X customer-right. `box(w,h,d,…,y)` treats `y` as the box
  bottom, never its centre.
- The derived planes hold exactly: carcass front `z = 0.280`; door front face `z = 0.289`, outer
  face `0.298`; worktop front `z = 0.330`; plinth front `z = 0.220`; worktop top `y = 0.820` and
  finished height `0.860`; wall band `1.500 → 2.200`; ceiling row `2.200 → 2.600`.
- The chamfer is 1.6 mm absolute on all twelve edges of every box and never proportional to size.
- A sink renders as a visible cavity: the worktop is cut into `countertop_front/back/side` around a
  `0.28 × 0.20` aperture **and** the carcass is an open frame with no top panel. A sink that is
  modelled correctly but sits in a solid carcass or under an uncut slab fails this criterion —
  that exact combination is the most expensive bug recorded in the reference build.
- Appliance cavities are strictly smaller than the carcass interior (`W − 0.06` wide, depth ≤ 0.48,
  inset from the back panel); oven fronts sit proud by `+0.018` and microwave fronts by `+0.089` on
  Z. No two solids are coplanar or interpenetrating anywhere in the scene, and no z-fighting flicker
  appears at any camera preset.
- The two corner legs are two separate bodies. Each computes its plinth recess from its own depth
  only. The X-leg worktop spans world Z `[-0.010, 0.630]`, the return worktop butts it at
  `[0.630, 0.900]`, both at Y `[0.820, 0.860]`, with no interior overlap. The return leg's depth is
  passed in from the neighbour it meets, never hard-coded.
- Purchased parts keep fixed real-world sizes regardless of host width: sink `560 × 400 × 185`,
  oven `596 × 595 × 560`, microwave `596 × 380 × 420`, dishwasher `596 × 720 × 560`, cooktop
  `590 × 12 × 520`, fridge `700 × 1850 × 680`. Handle bars are capped at 190 mm horizontal and
  210 mm vertical and do not stretch with the front.
- Every ceiling-row unit is push-to-open. Its handles are **built and hidden**, not omitted, so the
  choice can be turned back on later.
- Overhead doors carry the handle bar on the bottom edge at a 40 mm inset; drawers keep top bars and
  tall doors keep vertical bars.
- No gaps anywhere in the seeded scene: adjacent units share a face between runs, at the corner,
  above the fridge, and between the upper rows. Every unit sits fully on the floor slab.

Camera and framing:

- All three presets frame floor to ceiling. The 2.20–2.60 m row projects tall enough to be a
  plausible tap target at the mobile viewport — the recorded failure was that row projecting to
  about 37 px in a 540 px viewport, leaving nothing to click.
- Switching presets moves the camera without the scene appearing to jump or reload.

Surfaces:

- **Mobile (gate):** the scene renders and orbits at 390 × 844 with the camera controls of frame 2A
  reachable by thumb, verified by real interaction at that viewport, not by test alone. Browser
  console is free of WebGL and resource errors.
- **Desktop (same phase, separate line):** the scene renders full width per D2A with no editor
  panel present, since nothing is selectable yet.
- With WebGL unavailable, both viewports show the 2F / D2F explanation with its two continuation
  paths and no price. No fake preview is rendered under any circumstance.

Boundaries:

- The domain package imports neither React nor Three.js. The adapter reads configuration and writes
  none.
- The reference files under `design-source/` are not modified and are not a runtime dependency.

## Risks

- **Rewriting geometry as JSX — the recorded failure mode of the previous attempt.** The reference
  warns this is how the anchor conventions get lost. The port stays imperative; builders are called
  in a memo and mounted through `primitive`. This is the risk the fidelity gate above exists to
  catch, and it is the reason this phase is sequenced first.
- **Porting the geometry but not the renderer.** The builders alone do not produce the reference's
  look. The environment map, ACES tone mapping at 0.98, the three-light rig, the procedural
  material maps and the contact blob are all part of the port.
- **Seating bodies by inference.** Binds M2 and M3, where bodies are mounted individually, but the
  helper is ported here so the warning belongs with the port. Two recorded failed attempts: centring
  a body in an opening left it floating 135 mm off the wall, and deriving the plane from the previous
  occupant's bbox buried inserts 10–31 mm *inside* the wall, because bounding boxes are asymmetric
  about the group origin and one body's chamfer overshoot poisoned a whole column. Read the wall
  meshes; measure after placing.
- Performance budgets cannot be set until this phase produces a full scene. Do not state a frame
  rate, load time or mesh count before measuring one on an agreed device.

## Verification

- **The fidelity gate first.** Structural parity assertions for every builder, then the four preset
  reproductions and the targeted detail shots compared side by side against
  `design-source/Modern Kitchen Cabinets 3D (3)/shots/`. This phase does not close until a person
  has looked at those comparisons and accepted them; a green test suite alone is not evidence of
  visual fidelity, and a passing structural assertion says nothing about how a material reads.
- Headless geometry assertions over the built groups: named mesh presence, exact bounds, the plane
  table above, chamfer size, fixed-part dimensions, corner worktop bounds, push-open handle
  presence-but-hidden.
- Rendered inspection at 390 × 844 and at desktop width, at all three camera presets, with console
  and WebGL resource checks.
- A forced WebGL-unavailable run at both viewports.
