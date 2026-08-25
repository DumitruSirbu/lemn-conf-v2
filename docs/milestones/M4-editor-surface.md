# M4 — Editor panel and layout shell (screens 2A, 2B, 2C)

> **STATUS: PLANNED.** Depends on M3. Summary: `docs/STATUS.md`.

Status: planned. Depends on M3.
Reference: `DEVELOPMENT-SPEC.md` §9, §10, §10.1, §13.1; mockup frames 2A, 2B, 2C and D2A, D2B, D2C.

## Goal

The customer-facing editor: tap a body or an empty slot, see only the options that body supports,
apply them live, and never be offered something the engine will refuse. One set of section
components, two shells.

## Why here

§12 step 5. The panel is built from `meta` after the engine is correct, so its disabled states
reflect real constraints rather than guesses.

## Scope

In: the panel sections and their render order; the mobile bottom sheet; the desktop right rail; the
rejection banner; frames 2A, 2B and 2C.

Out: the width section's behaviour (M5 — the section renders here but its chips are wired in M5),
price and global settings (M6).

## Work items

1. Build the panel sections in the §9 order, each rendering only when its flag is true: header,
   rejection banner, replace/insert list, finish, handle, width, footer.
2. Build the mobile shell: a bottom sheet at roughly 70–83 vh, scrolling, footer pinned, chips
   scrolling horizontally.
3. Build the desktop shell: a 420 px right rail that appears on selection, with the scene re-laying
   out and the camera not jumping.
4. Implement the nothing-selected state (2A / D2A) and its instruction copy.
5. Implement the rejection state (2C / D2C).
6. Route every edit to the selection's own target. There is no hard-coded canvas id.

## Acceptance criteria

Section rules — `DEVELOPMENT-SPEC.md` §9:

- Sections render only when the selected body's definition supports them, in the specified order. A
  corner return, which has no finish, handle or width, shows none of those sections.
- The rejection banner renders at the **top of the panel body**, above every section. (Authored
  inside the width section it was invisible on exactly the fixed-width bodies that refuse most.)
- **Swap sets are band-scoped.** A wall body never appears in a base list. This shipped broken once,
  as *Etajeră bază deschisă* in the base set.
- For an empty slot, the list is the catalogue filtered by fit: same band, plus column bodies when
  the span allows, with height-flexible bodies requiring an opening of at least 400 mm.
- The count line is derived, never a literal — "5 corpuri bază de 600", "10 corpuri intră în
  700 × 860 mm".
- A zero-result list shows a sentence saying what to clear, never a bare "0".
- **Row 24.** An unknown kind renders no replace section at all.
- An empty slot hides finish, handle and width — there is nothing to finish.
- The current row of an occupied body's swap set is badged **ACTUAL**.

Never offer the impossible:

- Everything the panel disables, it disables from the selection's own numbers. It never attempts an
  edit to discover whether it is allowed.
- A disabled option shows its reason and, where one exists, the action that would unlock it.
- A refusal reaching the customer is treated as a defect in a list, not as expected behaviour. Any
  refusal observed during QA is filed against the list that offered it.
- No pagination anywhere in the chooser. The slot knows its width and band, so twenty catalogue
  items reduce to about six valid ones and there is nothing to paginate. Pagination was mocked,
  built and deleted: it hid the right answer most of the time and its pager ate 82 px of sheet
  height on mobile.
- A row list, not a grid, on mobile: at 390 px a row gives the name full width and makes the whole
  strip the tap target, where a two-up grid gives 165 px cards and truncated names.

Rejected-edit state (2C / D2C):

- The message sits next to the control that produced it, not in a generic toast.
- The rejected chip stays visibly marked and the last valid value stays selected.
- The model reverts to the last valid state and the total does not move. On desktop the top-bar
  price is explicitly labelled unchanged.

Mobile viewing model — choose in the sheet, dismiss to inspect:

The bottom sheet covers most of a 390 × 844 viewport, so on mobile the customer makes their choices
in the sheet and then dismisses it to see the result full-screen. Desktop sees the scene and the
panel at once and needs no such step. This is a **visibility affordance**, not a rule difference —
recorded as the single deliberate viewport divergence in the plan
(`docs/decisions/2026-08-24-design-reference-supersession.md` §5b).

- Every edit applies to the model **immediately**, on both viewports, exactly as
  `DEVELOPMENT-SPEC.md` §5 requires. Nothing is batched, queued, staged, or applied on dismissal.
- The sheet's × control and the pinned **Gata** both dismiss it as a *view* action. Neither commits
  and neither cancels; there is no pending state for them to resolve, and no confirmation prompt.
- After dismissal the scene shows the current state, with the previously selected body still
  identifiable. Reopening the selection returns to the same panel state.
- Do **not** build a translucent-sheet live-preview affordance for mobile on the assumption that
  mobile needs to match desktop's simultaneous visibility. That assumption was considered and
  rejected.
- Equally, do not read this as licence to fork a domain rule per viewport. Any *second* viewport
  difference stops the phase and returns to planning.

Surfaces:

- **Mobile (gate):** at 390 × 844 the sheet occupies roughly 70–83 vh, scrolls internally, and keeps
  its footer pinned; rows are 76–86 px and chips at least 44 px; chip rows scroll horizontally. The
  sheet never steals or leaks pointer events into the canvas. Selecting a body, replacing it,
  setting a finish, setting a handle and dismissing the sheet to inspect the result all complete by
  touch. This is the phase gate and does not wait on desktop.
- **Desktop (same phase, separate line):** with nothing selected the scene is full width and no
  panel is present. On selection a 420 px right rail appears, the scene re-lays out, and the camera
  does not jump. Rows and chips use the larger 52–70 px spacing scale. The section components are
  the same modules as mobile — the branch is the shell only.
- **Parity:** any rule that appears to need a different value per viewport stops the phase and
  returns to planning. The prototype's audit found no such case; touch sizing is a token.

## Risks

- **The shell branch leaking into the sections.** Enforce by construction: section components accept
  `meta` and a spacing scale, and have no access to viewport information.
- **Re-proposing a "cabinets in the scene" navigator** to work around bodies that are hard to click.
  It was built and removed as scope creep, because it answered a bug report with a feature. The
  reachability problem is real and stays open against the scene (§6.4).
- Whether an occupied body's hand-authored swap set should be unified with the fit-filtered
  catalogue is an open product question (§13.3 q1). The dishwasher niche's three rows look broken
  beside its neighbours' ten. Carried, not decided here.

## Verification

- Component tests driving each section purely from `meta` fixtures, including the unknown-kind,
  empty-slot, corner-return and zero-result cases.
- Browser tests for the rejection state's three simultaneous requirements: marked chip, retained
  valid value, unmoved total.
- Real touch interaction at 390 × 844 for the full select → replace → finish → handle → dismiss →
  inspect loop, and a desktop pass for the appear-on-selection rail.
- A test asserting that the model reflects an edit before the sheet is dismissed, so that the
  viewing affordance can never quietly become a deferred-commit model.
