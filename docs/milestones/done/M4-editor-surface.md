# M4 — Editor panel and layout shell (screens 2A, 2B, 2C)
>
> **STOP — DO NOT READ THIS PLAN.** M4 closed 2026-08-26. This file describes intentions; several
> shipped differently and are superseded by dated records. Acting on one reintroduces a design the
> project abandoned — the `canWidth` clause recorded in the Waves section below, for one, was
> overturned by logic review the same day. The live knowledge is in `docs/decisions/` (ADRs
> 0021–0024) and in the code. See `docs/STATUS.md` for where the project stands.


> **STATUS: CLOSED 2026-08-26.** All four waves shipped. One acceptance criterion is recorded
> **unmet** — 2C's rejection-state browser test, which cannot be written because no panel control can
> produce a refusal (ADR 0024). Summary: `docs/STATUS.md`.

Status: closed 2026-08-26. Depended on M3.
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
(`docs/decisions/0003-design-reference-supersession.md` §5b).

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

---

## Waves (added 2026-08-26, at the start of implementation)

Six work items and four M3 hand-offs do not fit one dispatch under `docs/WORKFLOW.md`'s scope
limit, so M4 runs as four waves with a gate between each.

| Wave | What it builds | Review tier |
| --- | --- | --- |
| **4A** | The panel *model*: a pure projection of `meta` + offers + the last refusal into §9's ordered sections, plus the copy it renders. No React. | Full — it is §9's rules |
| **4B** | The section components and the two shells (mobile sheet, desktop rail), and the deletion of `temporary-dev-controls`. | Light — UI assembly against 4A's settled contract |
| **4C** | `canWrite` on the design read, and how a failed or unauthorised write is communicated. | Full — it is an auth-adjacent contract |
| **4D** | The e2e suite re-pointed at the real panel, and the 390 × 844 gate. | Light |

### Carried into M5: seeded entries have no `sizesMm`

All 20 seeded entries in `KITCHEN_L_BODY_CATALOG` omit `sizesMm`, so `describeSelection` publishes
an empty width set for every one of the 21 seeded placements that are not fixed-width. The width
section therefore does not render on a seeded body — but the flag is **not** what withholds it.
`canWidth` is §9's own rule and nothing more (`selected · not empty · not fixedWidth`), and it is
`describeWidthSection` that declines when there are no chips to show. Folding "has widths to offer"
into the flag, as an earlier round did, made `canWidth: true, sizesMm: []` a representable
contradiction and hid this gap behind a silently-false capability; keeping them apart means every
flexible seeded body publishes `canWidth: true` today with nothing to show for it, which is exactly
the loud state M5 needs. That is correct for M4, which ships no width editing — but it is not a
resolution. **M5 has to resize seeded bodies too**, so M5 must give the seeded entries real width
sets (or derive them), otherwise the width section stays permanently hidden on exactly the
population the shipped design is made of. Carried into M5 as a required work item, not closed here.

### 4A's two recorded decisions

1. **The panel's rules live in a pure module, not in components.** §12 already forbids product
   logic in components; this makes the ban testable. `describePanel` takes `meta`, the offer list
   and the last refusal and returns §9's sections in §9's order, each with its content already
   resolved. Every acceptance criterion in this document that is about *what renders* becomes an
   assertion against a value.

2. **Therefore no jsdom/RTL dependency is added.** The plan's Verification section asks for
   "component tests driving each section purely from `meta` fixtures". That is what a
   `describePanel` fixture test is, minus a renderer — and a dependency change would pull the whole
   security-review tier onto a wave that ships no behaviour of its own. The rendered DOM is covered
   where it is real, in the Playwright pass of 4D. If a later wave needs to assert on rendered
   markup rather than on the model, that is the moment to reconsider, and it is a decision to
   record rather than to make in passing.

### What 4A adds to `meta`, and why

§8's `meta` list omits the body's *current* finish and handle, because the prototype's panel read
them off the mesh. §9's chips have to mark the active one, so `describeSelection` publishes
`finishKey` and `handleMode` — already on `PlacementRecord` — and `canWidth`, which §9 defines as
`selected · not empty · not fixedWidth` and which was previously left for each caller to re-derive.
`structuralReason` joins them for the same reason: §11 row 16 wants the refusal to explain why, and
a body that offers nothing never produces a refusal to carry the explanation, so the reason is a
declared catalogue fact rather than something read back out of four false flags. Nothing else is
added: the rule that the panel disables from these numbers alone is what makes the
addition necessary rather than convenient.

### 4C's two recorded-not-changed security findings (2026-08-26)

Security review of Wave 4C returned no exploitable defect. Two of its findings were deliberately
recorded rather than fixed, because each is a sizing input or a decision the code makes correctly but
in no single stated place.

**S3 — the write-access probe doubles the read cost of every `/d/{id}` open.** `/d/{id}` renders from
a server-side `load`, then `useWriteAccessProbe` issues `GET /api/designs/{id}` purely to read the
`canWrite` boolean — and that route answers with the whole design, which the client then fully
parses through `DesignSchema`. So every shared-link open costs two database reads and egresses the
document twice, for one bit of information. That halves the headroom of ADR 0019's planned global
`all /api/*` bucket and its single per-IP firewall rule: the same customer behaviour now produces
twice the request and byte volume those limits will be sized against, so **M8 must size its limits
against the doubled rate rather than against one read per open.** Two cheaper shapes exist when M8 or
a later wave wants the cost back: a `HEAD /api/designs/{id}` answering the credential question in
headers with no body, or a fields parameter (`?fields=canWrite`) that omits `design` from the
payload. Neither is worth a wave on its own today; both are worth naming before the limits are set.

**S5 — `canWrite` fails open on a missing probe and closed on a malformed one, decided in two
files.** The store's `hydrate` defaults `canWrite` to `true` when the field is omitted, and
`/d/{id}` always omits it, so **every shared-link visitor sees a writable panel until the probe
lands — and indefinitely if it never does.** A failed probe therefore fails *open* (the store keeps
the optimistic default; guessing read-only from a dropped packet would tell an author they may not
edit their own kitchen), while a probe that succeeds with a malformed payload fails *closed*
(`readCanWrite` reads anything that is not `true` as `false`). Both directions are individually
correct and both are deliberate, but the pairing is decided in `configurator-store.ts` and
`fetch-configuration-repository.ts` with no single place stating it. The cost of the open default is
bounded and understood: `canWrite` is advisory only, the row itself authorises every write
(`saveAuthorized`), and a visitor who edits optimistically gets a 403 that surfaces as
`unauthorized`, which the panel reads as read-only. No change; recorded here so the pair is a
decision on the record rather than an emergent property of two files.
