# M6 — Live price, breakdown, and whole-kitchen settings (2D, 2E)

> **STATUS: PLANNED.** Depends on M5. Summary: `docs/STATUS.md`.

Status: planned. Depends on M5.
Reference: mockup frames 2A, 2D, 2E and D2A, D2D, D2E; `DEVELOPMENT-SPEC.md` §5.5, §9 item 7, §12;
`CONFIGURATION_MODEL.md` "Pricing model boundary"; `ARCHITECTURE_PROPOSAL.md` §5.3.

## Goal

A price that moves with the configuration and can be explained line by line, plus the two decisions
that belong to the whole kitchen rather than to any one cabinet: material and hardware brand.

## Why here

Price is derived from placements, so it needs the placement set to be final in shape. Global settings
are grouped with it because changing the material recalculates the whole estimate — the mockup says
so on the sheet itself.

## Scope

In: the price bar; the breakdown (2D sheet / D2D popover); the global material and hardware settings
(2E sheet / D2E popover); wiring the existing pricing engine to the new placement shape. **Note
(2026-08-25):** `pricing-engine.ts` was deleted in M2 Wave 2A — it was inseparable from the retired
M0 placement model (see
`docs/decisions/0004-m2-pricing-engine-deletion.md`). Work item 1 here is a rebuild against
`DEVELOPMENT-SPEC.md` §5.5/§9's pricing rules and the `Design`/frame model, not an adaptation of
existing code.

Out: the review screen's own summary (M8, though it reuses this grouping); commercial amounts.

**M6 owns a fourth global control: worktop depth (owner's decision, 2026-08-27).** *Setări globale*
gains worktop depth (600 / 700) beside the material and hardware tiers. **The geometry it drives is
already built when this phase starts** — `docs/milestones/M5-width.md` work items 5, 6 and 7 make
wall and top depth derive from a declared worktop depth through an extensible map, and base carcass
depth derive from it through a formula, with the map as the single source for both §7's
`WALL_DEPTH_MM` and §5.2's `WALL_CARCASS_MAX_DEPTH_OVER_WORKTOP_M` so the two cannot drift.

So M6's addition is **one more control in a panel this phase is already building**, not new
machinery. What it has to supply, and what M5 deliberately did not:

- **M5 left worktop depth as a single declared constant at 600 mm.** No control, no schema field, no
  version bump, no store action. That is stated in M5's Scope-Out, not left implicit, so neither
  milestone can assume the other built it. M5 work item 6 also requires the constant to be written so
  that replacing it with a read from this setting is a one-line change.
- **The persisted slot is M6's to design, and it is designing it for three settings at once.**
  `DesignSchema` (`packages/configurator-domain/src/design.ts`) is a `z.strictObject` holding `room`,
  `presetId`, `placements` and two timestamps — there is no whole-kitchen settings object, and
  material and hardware are not in it either. Whatever shape this phase picks holds all three.
  `seatDepthMm` on `CabinetBody` is the precedent for *optional-with-a-fallback and no version bump*;
  it is not a precedent for the container, because `CabinetBody` already existed.
- **Worktop depth does not appear in the estimate.** The breakdown's disclaimer below already states
  that the worktop is excluded, so this setting changes geometry and cabinet dimensions without
  adding a price line. That is intended, and worth a sentence on the sheet so it does not read as a
  missing line.
- **If M5 wave 5F is deferred, this control is blocked.** Material and hardware are presentation and
  pricing; worktop depth is geometry. The formula has to exist somewhere before the control can move
  it.

## Work items

1. Adapt the existing pure pricing query to the new `Design` shape. Price is derived from
   placements and never stored.
2. Build the price bar for both shells, including the "De ce acest preț" affordance.
3. Build the breakdown grouped wall → band → order, in the exact order the review screen will use.
4. Build the global settings surface: three material tiers and three hardware tiers, each with its
   description and its price delta, **plus worktop depth (600 / 700) as a fourth control**. The
   geometry behind that control — the worktop → wall/top depth map and the base carcass formula — is
   built by **M5 waves 5A and 5F**, `docs/milestones/M5-width.md` work items 5, 6 and 7; this item
   builds the control and the persisted value, which M5 explicitly did not.
5. Wire material and hardware selection to recalculation, including the effect on which per-cabinet
   finishes remain available.

## Acceptance criteria

Price presentation:

- Every displayed figure is prefixed "De la" and is rounded up to the thousand MDL, matching the
  mockups' stated presentation rule. No figure is presented as a quote or a commercial offer.
- The price bar never covers the selected cabinet at either viewport. This is a hard constraint, not
  a visual preference.
- A rejected edit does not move the total, and on desktop the top-bar figure is explicitly labelled
  unchanged while a rejection stands.
- The total is derived from the current placements on every render. No total is persisted, and no
  component computes a price itself.
- A pricing failure fails whole: no partial line set and no partial total is displayed.

Breakdown (2D / D2D):

- Grouped wall → band → order — the same grouping the live scene uses and the same the review screen
  will use. The three must not diverge.
- Each line names the body and its width, as in "Corp bază spălător 800".
- Whole-kitchen lines (hardware brand, material) appear after the placement lines, with an included
  tier shown as "inclus" rather than as zero.
- The disclaimer states what is excluded — transport, worktop, appliances — and that the final sum
  follows an on-site measurement.
- **Mobile** renders it as a full sheet with its own close action; **desktop** renders it as a
  popover anchored to the price, so the customer stays in context.
- Which lines actually belong in the estimate is an open product decision. The grouping and ordering
  are built; the inclusion list stays a content slot.

Global settings (2E / D2E):

- Material, hardware brand **and worktop depth** are **whole-kitchen** settings, reached from the
  editor's top bar. They are never per-cabinet controls; the cabinet editor keeps finish, handle and
  width only. Worktop depth is a fourth control here (owner, 2026-08-27); the geometry it drives is
  built by M5 waves 5A and 5F.
- **Changing worktop depth visibly changes the model, not just a number.** Base carcasses and capped
  wall carcasses move together, from the formula and the map respectively. The sheet's warning must
  say so — this is a stronger consequence than the material warning below, and the two must not read
  alike.
- The sheet states how many bodies it applies to and that it is not set per cabinet.
- Each tier shows its name, a one-line description and a delta ("inclus", "de la +9 000").
- The sheet warns that changing the material recalculates the whole estimate and may limit some
  per-cabinet finishes.
- Applying a material that invalidates a per-cabinet finish must resolve that explicitly — the
  finish list is filtered and the affected cabinets are handled by a stated rule, not left in an
  invalid state. The rule itself is a product decision; the requirement that no invalid state
  survives is not.
- **Mobile** is a full sheet with an explicit apply action; **desktop** is a popover anchored under
  the chips it controls, with both a cancel and an apply action.
- Both viewports show the running total in the settings surface, since a configuration exists at
  that point. This differs from the WebGL-unavailable state, which shows no price because no
  configuration exists.

Surfaces:

- **Mobile (gate):** at 390 × 844 the price bar is visible without covering the selection, the
  breakdown sheet opens and closes, and a material change updates the total and the model. Verified
  by real interaction.
- **Desktop (same phase, separate line):** the popover forms of both surfaces, anchored as the
  mockups specify.

Boundaries:

- Pricing stays a pure query outside rendering and UI code. It reads a versioned price book and
  fails whole on a missing rule.
- Every displayed line traces to a placement or to a named whole-kitchen rule.

## Risks

- **Three grouping implementations drifting apart** — scene, breakdown, review. Derive all three
  from one projection.
- **Inventing an amount or an inclusion.** Sample amounts must stay visibly and structurally
  provisional; neither documentation nor code may assert a commercial figure.
- **Two places, not one, where a global setting can invalidate a per-cabinet choice — corrected
  2026-08-27.** This bullet used to read "Filtering per-cabinet finishes by the global material is
  the one place where a global setting can invalidate a per-cabinet choice." That stopped being true
  when worktop depth became a global control, and **the second place is the worse of the two**:
  changing the material invalidates a *colour choice* and the cabinet still stands where it stood,
  while changing worktop depth changes **every base body's geometry** — its carcass depth, its
  `frame.d`, and therefore `Column.d` (§3.2's MAX over the run) and every wall opening's depth in
  that column. A finish is repainted; a depth change moves the model. The original half still holds:
  if either interaction turns out to need a per-viewport difference, the rule is wrong, not the
  viewport.

## Open questions gating this phase

- Sample and commercial price amounts.
- What the estimate includes, and therefore which lines the breakdown shows.
- The rule for a per-cabinet finish invalidated by a material change.

### Worktop depth — recorded 2026-08-27, none decided

Carried from `docs/milestones/M5-width.md`'s *Not established — Depth*, where they are numbered.
They are here as well as there because they reach the **control**, and M5 never meets them: M5 holds
one worktop depth by construction, so nothing in that phase can change one.

- **What happens to a design saved at 600 when the customer switches to 700?** (M5 question 4.)
  Every base body's depth changes and every capped wall body with it. Three shapes, none chosen:
  **migrate** (rewrite the stored placements once — needs a schema version and is irreversible),
  **re-derive on load** (store only the setting and compute depths — cleanest, but makes
  `seatDepthMm` a cache rather than a fact, contradicting ADR 0018's "the body's own measured seat"),
  or **refuse** (the setting is fixed once placements exist, defensible if the customer picks the
  worktop before laying out the kitchen). **This blocks the control**, and it is the same question as
  the invalidation risk above: a material change repaints, a depth change moves the model.
- **Is an 800 mm worktop real?** (M5 question 2.) `800 -> 500` was named as a plausible future map
  row and explicitly not committed. It is the difference between a two-way toggle and a list of
  three.
- **Does a 700 mm worktop change wall cabinet HEIGHT, or only depth?** (M5 question 3.) If height
  moves, §2's `LEVELS` move with it — and `LEVELS` is the spine of the void engine, so that is far
  larger than a second map row. Worth answering during M5 even though no M5 wave is blocked by it.
- **Do the two deliberately-deep top cabinets track anything?** (M5 question 5.)
  `wall-2door-600-deep-top` and `wall-2door-700-over-fridge` are 600 mm because their columns are —
  the head-clearance cap is lifted over a full-height member, not mapped. At a 700 mm worktop the
  base run deepens and `Column.d` over it rises while these two do not. Nothing says whether they
  should follow the worktop, follow their column, or stay put.
- **Does the hood follow the map?** (M5 question 1.) `HOOD_DEPTH_MM` is 500 and the seeded
  `hood-600` agrees, so M5 pins it as a regression rather than deciding it. Tied to backlog 9 —
  `make.hood` takes no depth parameter at all.

## Verification

- Pricing tests over the new placement shape: per-line traceability, ordering, included-tier
  rendering, fail-whole behaviour, and exact totals from fixture books.
- A test asserting the scene, breakdown and review projections produce identical grouping from the
  same design.
- Real interaction at 390 × 844 for the price bar's non-occlusion and both sheets.
