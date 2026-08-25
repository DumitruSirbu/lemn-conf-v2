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

## Work items

1. Adapt the existing pure pricing query to the new `Design` shape. Price is derived from
   placements and never stored.
2. Build the price bar for both shells, including the "De ce acest preț" affordance.
3. Build the breakdown grouped wall → band → order, in the exact order the review screen will use.
4. Build the global settings surface: three material tiers and three hardware tiers, each with its
   description and its price delta.
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

- Material and hardware brand are **whole-kitchen** settings, reached from the editor's top bar.
  They are never per-cabinet controls; the cabinet editor keeps finish, handle and width only.
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
- Filtering per-cabinet finishes by the global material is the one place where a global setting can
  invalidate a per-cabinet choice. If that interaction turns out to need a per-viewport difference,
  the rule is wrong, not the viewport.

## Open questions gating this phase

- Sample and commercial price amounts.
- What the estimate includes, and therefore which lines the breakdown shows.
- The rule for a per-cabinet finish invalidated by a material change.

## Verification

- Pricing tests over the new placement shape: per-line traceability, ordering, included-tier
  rendering, fail-whole behaviour, and exact totals from fixture books.
- A test asserting the scene, breakdown and review projections produce identical grouping from the
  same design.
- Real interaction at 390 × 844 for the price bar's non-occlusion and both sheets.
