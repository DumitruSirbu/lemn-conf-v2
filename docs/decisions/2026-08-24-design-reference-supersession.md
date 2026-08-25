# Design-reference supersession: void/column domain model replaces the run-anchor model

Date: 2026-08-24
Status: accepted by product owner (the owner chose the new reference explicitly and confirmed it
supersedes the earlier accepted domain documents where they conflict)

Supersedes, in part: `docs/CONFIGURATION_MODEL.md`, `docs/ARCHITECTURE_PROPOSAL.md` §3–§4,
`docs/PRODUCT_REQUIREMENTS.md` (step wording), `docs/MAIN_REQUIREMENTS.md` (whole document),
`docs/milestones/done/M0-foundations.md` (parts of its accepted scope).

## Context

The 3D design reference folder was replaced. `design-source/3D design reference/` no longer exists;
the current reference is `design-source/Modern Kitchen Cabinets 3D (3)/`, which contains:

- `DEVELOPMENT-SPEC.md` — a handoff document for a **working, debugged prototype**. Every rule is
  implemented, and the rules marked **WHY:** are each the fix for a defect that shipped.
- `SPEC.md` — the per-part geometry contract (anchors, scaling rules, structural dependencies).
- `Lemnaria Configurator Mobil.dc.html` — mobile screen flow, five screens, sub-frames 1A–5B.
- `Lemnaria Configurator Desktop.dc.html` — desktop chrome for screens 1 and 2 only (D1A–D2F).
- `kitchen-parts.js`, `three-d-stage.js`, `kitchen-3d.html`, `support.js`, `cabinets/*.svg`,
  `shots/`, `preset-shots.html`.

The owner's instruction: implement these versions, desktop and mobile, with **mobile as the top
priority**, and with the immediate goal being **a working POC that matches the design reference** —
see §7 below.

Persistence is decided separately in
`docs/decisions/2026-08-24-db-backed-shareable-persistence.md`.

The earlier documents were written against the previous reference and describe a materially
different domain model. Where the two disagree, the new reference wins, because it describes
behaviour that was built, exercised, and debugged, while the earlier model describes behaviour that
was designed but never validated against a working editor.

## Decision

### 1. The domain model is placements + derived voids

`DEVELOPMENT-SPEC.md` §3–§5 is the authoritative configuration model for the near-term product:

- Two collections only: **Placements** (authored bodies) and **Voids** (derived free space).
  A void is never authored and never persisted.
- `recomputeVoids()` (§4) runs after every mutation. Its four rules — start at the column's own
  lowest module; subdivide by `LEVELS`; no fallback interval; a span starting mid-level stays one
  opening — are each a recorded bug fix and are not negotiable simplifications.
- Columns (`cols`, §3.2) are computed once at load from wall + position and never change.
- Bands are `base` (0 – 0.86 m), `wall` (1.50 – 2.20 m), `top` (2.20 – 2.60 m, push-to-open) and
  `column` (full height). The 0.86 – 1.50 m backsplash gap is never an opening.
- Operations are exactly: `remove()`, `insert(buildId)` (into a void, or as swap-in-place on an
  occupied selection — **one code path**), `setWidth(target)` (a boundary move that conserves the
  run total between donor and recipient neighbours), `setFinish(key)`, `setHandle(mode)`.
- `Design` (§12) is the persisted truth: room + `presetId` + `placements[]`, each placement
  `wall / alongMm / y0Mm / body`. Geometry is derived on load; meshes are never serialised. Price is
  derived from placements and never stored.

### 2. Retired from near-term scope

These are removed from the plan, not deferred with a placeholder implementation:

| Retired | Where it was specified | Why it is retired |
| --- | --- | --- |
| Reorder / drag-to-reorder | `CONFIGURATION_MODEL.md` §"Commands and queries" (`reorderCabinet`), Placement invariant 7; `ARCHITECTURE_PROPOSAL.md` §4.3 ("Dragging is an input method"); `PRODUCT_REQUIREMENTS.md` step 2; `MAIN_REQUIREMENTS.md` §4.3 | Built in the prototype and **explicitly removed** (`DEVELOPMENT-SPEC.md` §13.1). Reorder is only well-defined when both cabinets share a width; otherwise it breaks vertical alignment. Removing it makes column identity permanently stable, which is what keeps the void model honest. Select-then-replace expresses the same intent. |
| `runAnchor: flow \| start \| end` and anchor partitions | `CONFIGURATION_MODEL.md` §"Placement", §"Deterministic packing and free space", invariants 4/6/9 | The new model does not pack a run at all. A placement owns a fixed position (`alongMm`) from load or from the void it was inserted into; nothing slides. Anchors exist to disambiguate packing order, and there is no packing order. |
| `moveCabinetToRunMargin` (column margin move) | `CONFIGURATION_MODEL.md` §"Commands and queries"; `ARCHITECTURE_PROPOSAL.md` §4.3 | Depends on anchors and on horizontal movement, both retired. |
| Junction groups (`junctionGroupId`) and the AABB exemption | `CONFIGURATION_MODEL.md` §"Junction group", §"Cross-wall room-space occupancy", invariants 11/9 | Corner units in the new reference are two ordinary abutting placements that are simply flagged structural: no replace, no delete, never a width donor (`DEVELOPMENT-SPEC.md` §7, §13.1; `SPEC.md` "Corner base + lazy susan"). No linking identifier, no exemption machinery, and no coordinated two-leg command is needed to express that. |
| Wall C and U-shaped **layout logic** | `CONFIGURATION_MODEL.md` §"Room" (wall-c transform), §"Cross-wall room-space occupancy" (A/C and opposing B/C scans) | The reference models wall A (back, z=0, fronts +Z) and wall B (left, x=0, fronts +X, rotated π/2) only (`DEVELOPMENT-SPEC.md` §2). `DEVELOPMENT-SPEC.md` §13.3 open question 4 states plainly that `LEVELS` and the two wall planes are constants for this room and that generalising them is unfinished work. |
| Linear-room **layout logic** | same | Same reason. `SPEC.md` and the prototype supply an L scene only. |
| Cross-wall bigint occupancy collision scanning | `CONFIGURATION_MODEL.md` §"Cross-wall room-space occupancy"; `ARCHITECTURE_PROPOSAL.md` §4.3 | With fixed columns, no reorder and no packing, two placements cannot be moved into each other. The corner is authored, not computed. Reintroduce this only when arbitrary room shapes arrive. |
| Undo / redo | `ARCHITECTURE_PROPOSAL.md` §4.4; `M0-foundations.md` work item 7 | `DEVELOPMENT-SPEC.md` §5.1 and §13.1: undo and the merging-span model contradict each other, because a void may have merged with neighbours since the operation. Deletion is final. |
| Wall-attached door/window obstacles | `CONFIGURATION_MODEL.md` §"Room" (`WallObstacle`), invariants 15/16 | Not present in the new reference in any form. The earlier decision record (2026-08-20, decision 3) put obstacles in the first room-planning release; that predates this reference. Obstacles are moved behind the same gate as arbitrary room shapes. |

**The room-shape picker stays in the UI.** Screens 1A/1B (mobile) and D1A/D1B (desktop) show
Liniară / În L / În U cards and a corner-direction toggle. The affordance ships; only linear and U
*layout* remains unbuilt, and a shape without a layout must be refused at Screen 1 with a human
reason (1C), never accepted and then rendered wrong.

### 3. Retained from the earlier documents

These stay in force and are **not** superseded:

- The stack and package boundaries: pnpm workspace, Next.js App Router, strict TypeScript, R3F,
  Zod, Zustand, Vitest, Playwright; `configurator-domain` free of React and Three.js
  (`ARCHITECTURE_PROPOSAL.md` §2, §3). `DEVELOPMENT-SPEC.md` §1 and §12 independently arrive at the
  same shape.
- The imperative-bridge render approach: port `kitchen-parts.js` as-is and mount built groups with
  `<primitive>`; do not rewrite geometry as JSX (`ARCHITECTURE_PROPOSAL.md` §6.1 and
  `DEVELOPMENT-SPEC.md` §1 agree, and §1 warns that a JSX rewrite is how the `SPEC.md` anchor
  conventions get lost).
- The non-negotiable render contract (`ARCHITECTURE_PROPOSAL.md` §6.2) and all of `SPEC.md`:
  floor-centred origins, bottom-Y box semantics, fixed real-world sizes for purchased parts,
  absolute 1.6 mm chamfer, cut worktop and open no-top frame under a sink, appliance niches smaller
  than the carcass with proud fronts, corner legs owning their own recess, push-to-open ceiling row,
  no directional cast shadows.
- The WebGL-unavailable rule (`ARCHITECTURE_PROPOSAL.md` §6.3): an unsupported device must explain
  that configuration requires 3D and must not present a fake non-editable preview. Frames 2F and D2F
  confirm it and add the required exits.
- Units and numeric policy (`ARCHITECTURE_PROPOSAL.md` §4.2): metres in geometry, `M`-suffixed
  names across boundaries, integer money in minor units, no persisted world coordinates.
  `DEVELOPMENT-SPEC.md` §12 persists integer millimetres; both are exact-integer policies and the
  millimetre form wins for the persisted `Design`.
- Versioned catalog/pricing data, the fail-whole pricing boundary, `verifyPricingSnapshot`, and the
  separation of contact data from saved configuration (`CONFIGURATION_MODEL.md` §"Pricing model
  boundary", §"Persistence and migrations"; `ARCHITECTURE_PROPOSAL.md` §5.3, §9).
- Persistence and migration *conventions*: schema/catalog/pricing versions, atomic migration, no
  partial hydration (`CONFIGURATION_MODEL.md` §"Persistence and migrations";
  `ARCHITECTURE_PROPOSAL.md` §7). Where the bytes live changed on the same day — see §6 — but every
  validation rule above them is unchanged.
- Route structure (`ARCHITECTURE_PROPOSAL.md` §8) — now resolving a design by identifier per the
  persistence decision — except that the mockup uses
  `/configurator/done` for screen 5 where the proposal says `/configurator/success`; see the open
  questions.
- Decisions 1, 4, 5, 6 and 7 of `docs/decisions/2026-08-20-initial-product-and-stack.md` (stack,
  provisional MDL sample prices labelled as estimates, RO default with RU supported, name + phone
  required with email optional, provider-neutral submission API). Decision 3 (model windows and
  doors in the first room-planning release) is superseded per the table above. Decision 2 (preset
  module-pack adaptation with discrete widths) survives in weakened form: the new reference states
  in §13.3 open question 5 that the prototype's presets have **no per-preset geometry** at all, so
  real preset recipes remain unbuilt product work.

### 4. The flow is five screens, and Step 1 owns six sub-states

Confirmed by the owner on 2026-08-24. The product-level flow is:

| Screen | Route | Contents |
| --- | --- | --- |
| Step 1 — Cameră | `/configurator/room` | **One step with six internal sub-states**: shape picker → dimensions → validation → preset loading → preset list → bespoke generation fallback |
| Step 2 — Configurare | `/configurator/configure` | the 3D editor; the most important screen in the product |
| Step 3 — Verificare | `/configurator/review` | the summary |
| Step 4 — Contact | `/configurator/contact` | the form |
| Step 5 — Succes | see open questions | confirmation, and the failure safety net |

Frames 1A–1F are **sub-states of Step 1**, not six top-level steps. Planning, routing and progress
indicators must reflect that: the customer sees "Pasul 1 din 4" throughout all six, exactly as the
mockup labels them.

**Step 1 resolves directly into Step 2 with the editor already open.** When a preset is chosen, or
when bespoke generation finishes, the flow continues straight into the 3D editor. There is no
intermediate confirm-and-continue screen. This is consistent with §4b below — the per-card
**Folosește** button *is* the confirmation — and it is now also an explicit product requirement
rather than an inference from the mockup.

### 4b. Preset selection is a list with a per-card CTA, not a carousel

`MAIN_REQUIREMENTS.md` §3.2 ("Preset carousel") and `PRODUCT_REQUIREMENTS.md` step 1 point 3
("visual carousel", "select and confirm") are superseded. Mobile frame 1E is a vertical list where
each card carries its own **Folosește** button, and its own footnote states there is no separate
confirmation screen. Desktop frame D1E is a four-up grid with the same per-card CTA and the same
absence of a confirm step. Only presets that fit are shown; one that fits after a declared
adjustment shows that adjustment inline ("Ajustată −20 cm ca să intre pe peretele B"). When nothing
fits, the flow falls through to bespoke generation (1F / D1F) instead of a dead end.

### 5. Desktop and mobile are one implementation

Per `DEVELOPMENT-SPEC.md` §10.1, the domain, store, scene and panel-section components are one set
with no viewport awareness; only the layout shell branches. Touch sizing is a spacing token, not a
fork. A rule that needs to differ between viewports is a wrong rule.

An independent reading of both mockup files confirms the parity claim for **rules**: frame 2B and
frame D2B carry the same section order, the same swap/finish/handle/width sections, the same
"sections render only when the definition supports them" note, and the same width-chip and rejection
behaviour. What differs is chrome, and it differs in ways the spec's own summary understates:

- **The desktop rail is not always visible.** D2A shows the scene at full width (1920 × 1004) with
  no panel; D2B's footnote says the 420 px panel appears only on selection, the scene re-lays out,
  and the camera does not jump. Where §10.1 says "always visible", the mockup wins — it is the later
  artefact and it is explicit.
- Desktop puts the price breakdown in a popover anchored to the price (D2D) and global settings in a
  popover anchored under the chips it controls (D2E, with both **Renunță** and **Aplică**); mobile
  uses full sheets (2D, 2E, the latter with **Aplică** only).
- Desktop D1C spends its extra space on an actionable suggestion ("Treci la formă liniară pe
  peretele A"), which mobile 1C does not have.
- **The desktop mockup covers screens 1 and 2 only.** There are no desktop frames for review,
  contact or success; that chrome is undesigned.

#### 5b. The one legitimate viewport difference: close-the-sheet-to-inspect

`DEVELOPMENT-SPEC.md` §10.1 says that if a rule needs to differ between viewports, the rule is
wrong. That holds for every **domain** rule, and this is not one. Confirmed with the owner on
2026-08-24:

On desktop the scene and the panel are visible simultaneously, so an edit is seen the instant it is
applied. On mobile the bottom sheet covers most of a 390 × 844 viewport, so most of the model is
behind it while the customer is choosing. The expectation is therefore **make the choices in the
sheet, then dismiss the sheet to inspect the result full-screen** — not "watch the model change
behind a translucent sheet".

What this does and does not change:

- **The domain behaviour is identical.** Finish, handle, replace, delete and width apply to the
  model immediately on both viewports, exactly as `DEVELOPMENT-SPEC.md` §5 requires. Nothing is
  batched, queued, staged, or applied on dismiss. The sheet's close control is a *view* control, not
  a commit control, and there is no cancel semantics attached to it.
- **What differs is the visibility affordance**, and it differs because of screen real estate, not
  because of a different rule. Mobile therefore needs a deliberate, discoverable way to dismiss the
  sheet and inspect (the frame's × control and the pinned **Gata**), which desktop does not need.

Recorded explicitly so that a future reader does not "fix" this into a translucent-sheet live
preview, and equally does not mistake it for licence to fork a domain rule per viewport. It is the
only such difference in the plan; any second one is a defect until proven otherwise.

### 5c. The ported 3D must match the reference's visual quality exactly

Raised by the owner on 2026-08-24 as the single sharpest concern, from experience: *"I really want
to have same 3D cabinets quality as in reference, I don't understand why is so hard to use the code
from there but first attempt failed this."*

**Decision: the geometry layer is a port, not a reimplementation, and its fidelity is a gate rather
than a review note.** `kitchen-parts.js` and the lighting/tone-mapping setup in `three-d-stage.js`
are carried over with their builder math, mesh hierarchy, mesh names, materials, chamfer cache and
structural dependencies intact. This is what `ARCHITECTURE_PROPOSAL.md` §6.1 and
`DEVELOPMENT-SPEC.md` §1 both already prescribe — call the builders and mount the resulting group
through `<primitive>`; do not rewrite geometry as JSX mesh trees, because that is precisely how the
`SPEC.md` anchor conventions get lost. The previous attempt's failure is evidence that this guidance
was violated or executed loosely, not evidence that the guidance is wrong.

Because "it doesn't look right" is not falsifiable, M1 carries a named fidelity gate with two
independent kinds of evidence — structural parity assertions over named meshes and bounds, and an
actual side-by-side comparison against the reference renders in
`design-source/Modern Kitchen Cabinets 3D (3)/shots/`, reproduced at the exact camera positions the
`preset-shots.html` rig uses. See `docs/milestones/done/M1-scene-port.md`.

This is the highest-risk item in the whole plan and is sequenced first for that reason.

### 6. Persistence is a server-side database with shareable design links

Recorded separately in `docs/decisions/2026-08-24-db-backed-shareable-persistence.md`, whose engine
choice was amended on 2026-08-25. In short: the `localStorage` plan in `ARCHITECTURE_PROPOSAL.md` §7
is replaced by a managed Postgres database on Neon's free tier, holding one self-contained JSON
document per design and addressed by an opaque design identifier in the URL, so a link reopens the
exact configuration. The `ConfigurationRepository` abstraction survives; only the adapter changes.

### 7. The near-term target is a working POC that matches the design reference

Stated by the owner: *"later this tool will be integrated with a CRM mainly the contact form
sending but top priority now is to have a working POC based on design reference."*

CRM integration remains out of scope, as already recorded — no change, and no further planning of
it. What this adds is a calibration rule for everything else:

- **Bias toward a demonstrable end-to-end path**: room → preset → 3D edit → review → contact →
  success, with real database persistence and reference-quality 3D. A phase closes when its slice of
  that path works on a phone, not when its edge cases are exhausted.
- **Named, not dropped.** The 24-row regression table, the exact width sets, the price formula and
  the legal copy are all still owned by a phase and still written down. Some of them land as
  hardening within their phase rather than blocking the first pass through it. The distinction is
  between *deferred with an owner* and *silently omitted*; only the first is allowed.
- **Two things are exempt from that calibration** because they are the point of the POC rather than
  polish on it: the visual fidelity of the 3D port (§5c) and database-backed shareable persistence
  (§6). Neither may be reduced to make a phase close.

### 8. Build sequencing follows the reference's own build order

`DEVELOPMENT-SPEC.md` §12 gives a build order (parts → placement/column/void model → picking →
insert/remove/swap → panel → resize → presets/verification/contact) and marks picking as where the
time went. The revised milestone plan follows it, with mobile surfaces gated per phase rather than
after desktop. See `docs/milestones/README.md`.

## Alternatives considered

1. **Keep the run-anchor model and treat the new reference as visual-only.** Rejected: the new
   reference is a debugged editor, and its §11 table lists 24 defects the run-anchor model has never
   been tested against. Keeping both models would mean maintaining two incompatible occupancy
   theories.
2. **Keep reorder and layer the void model on top of it.** Rejected on the reference's own evidence
   (§3.2, §13.1): the void and column model is only sound because nothing moves horizontally.
   Reintroducing reorder reintroduces the class of bug the model was built to remove.
3. **Rewrite `CONFIGURATION_MODEL.md` from scratch.** Rejected: its pricing boundary, versioning,
   persistence, and contact-separation contracts are sound, are implemented, and are orthogonal to
   the placement model. A surgical supersession keeps the paper trail and does not discard verified
   work.
4. **Delete `docs/MAIN_REQUIREMENTS.md`.** Rejected: it is the prompt that produced the previous
   mockup. It is marked superseded and retained as a record.
5. **Build desktop first because its chrome is simpler.** Rejected: the owner named mobile as top
   priority, and the mobile mockup is the only one covering all five screens.

## Consequences

- `docs/CONFIGURATION_MODEL.md`, `docs/ARCHITECTURE_PROPOSAL.md`, `docs/PRODUCT_REQUIREMENTS.md`
  carry supersession notes on their affected sections and point here.
  `docs/MAIN_REQUIREMENTS.md` carries a whole-document supersession note.
- `docs/milestones/done/M0-foundations.md` is closed as partially superseded. Its progress log stays
  intact; a dated status section names which landed work is retired. In particular the run-anchor
  packing, reorder and margin-move commands, junction-group validation, wall-C transforms, and
  cross-wall occupancy scanning described in its 2026-08-20 progress log are superseded code paths.
  The schemas, catalog seed, pricing engine, snapshot verification and contact separation survive.
- The revised plan lives in `docs/milestones/README.md` and `docs/milestones/M1`–`M8`.
- `AGENTS.md` and the affected documents point at `design-source/Modern Kitchen Cabinets 3D (3)/`.

## Open questions carried forward, not decided here

These are named as gates in the milestones. None may be resolved by inventing a number.

1. Exact minimum/maximum wall lengths and room height bounds (frames 1C/D1C deliberately show the
   reason without the limit, because the data is unapproved).
2. The real value behind the "≤ 30 cm adjustment" preset-fit threshold shown in 1E/D1E.
3. Bespoke-generation thresholds and priority rules beyond "sink and cooking first, then storage;
   what does not fit is removed and labelled" (1F/D1F states the exact thresholds are unfinished).
4. What the price estimate includes (2D says transport, worktop and appliances are excluded; 3B's
   "not included" list is a content slot, not final copy).
5. Whether any response timeframe may be promised on success (5A deliberately promises none).
6. Consent and legal copy for the contact step (4A's consent line is a slot).
7. Approved discrete width sets and filler rules. The prototype uses 400/600/800 with dishwasher
   450/600 and hood 600/900, and dropped 1000; those are prototype values, not approved catalog data.
8. Sample and commercial price amounts. The mockups round up to the thousand MDL and prefix every
   figure with "De la"; that presentation rule is design evidence, the amounts are not.
9. Screen 5's route: `/configurator/success` (`ARCHITECTURE_PROPOSAL.md` §8) versus
   `/configurator/done` (mobile mockup).
10. Desktop chrome for screens 3, 4 and 5, which the desktop mockup does not cover.
11. Click reachability of placements occluded from every fixed camera
    (`DEVELOPMENT-SPEC.md` §6.4, §13.3 question 3) — explicitly not to be solved with a cabinet-list
    side panel, which was built and rejected.
12. Whether occupied-body swap sets are unified with the fit-filtered void catalogue
    (`DEVELOPMENT-SPEC.md` §13.3 question 1).
13. Run re-split — offering a run's total as valid module combinations
    (`DEVELOPMENT-SPEC.md` §12, §13.3 question 2). Designed, not built.
14. When linear and U rooms return, and with which recipes and per-wall data
    (`DEVELOPMENT-SPEC.md` §13.3 question 4).
