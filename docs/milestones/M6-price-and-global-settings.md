# M6 — Live price, breakdown, and whole-kitchen settings (2D, 2E)

> **STATUS: PLANNED — waves sequenced 2026-09-02.** Depends on M5 (only wave 5E is still open there,
> and it does not gate anything here). Summary: `docs/STATUS.md`. Start at **Waves** below, then the
> owner section. **Nineteen waves, all unblocked.** The seven owner decisions were taken on
> 2026-09-02 (ADRs 0055–0061); ADRs 0062–0064 followed, the last two on 2026-09-03.

Status: planned, waves sequenced. Depends on M5.
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
  pricing; cabinet depth is geometry. The formula has to exist somewhere before the control can move
  it. **Resolved 2026-09-02: 5F shipped** (ADR 0036, ADR 0039, ADR 0040), so this is no longer a
  gate. What 5F left is smaller and is wave 6H's: the formula exists, but the catalogue computes
  five depth-derived facts from a module-level constant at import time, so a *second* depth cannot
  be held yet. And 5F's own carry-out — the base family beyond `baseCabinet` not following the
  formula — is wave 6I, which M5 records as a thing M6 must not ship the control without.

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
- **The four corner rows are one population with one gap — closed 2026-09-03, and worth knowing
  about.** `base-corner-x-900`, `base-corner-return-320`, `wall-corner-return-570` and `-570-top` are
  the bodies with **no `label` and no `catalogEquivalentId`** (ADR 0022, correctly), which is exactly
  why `namedAfterCatalogEquivalent` never reached them and why every path needing a
  customer-readable name has to remember the `describeKindLabel` fallback.

  It looked like a recurring pattern — 6A2 left them generic, 6A4 named two, and
  `resolve-column-members` put a raw `corner_wall_return` inside a Romanian refusal sentence — and it
  **resolved better than that**: all four leaked through the *same* fallback, so one change closed
  every command path rather than the reported one. It was a single missing fallback, not four
  separate omissions.

  **The residual risk is the shape, not the bug.** A body with no entry-level name still depends on
  each new name-producing path remembering the fallback, and three paths did not. Whichever wave next
  adds such a path should carry the assertion that closes it structurally: **every seeded body
  resolves a customer-readable name through every name-producing path**, so a new path fails the
  moment it forgets.
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

## Waves

Planned 2026-09-02. **Three tracks, and only one of them waits on an owner.** Track P (price, work
items 1–3) and track G (material and hardware, work item 5) can run to completion with no decision
taken; track D (work item 4's fourth control) is where every blocked wave is. Each wave names its
gate, so nothing has to be re-derived at dispatch time.

**Backlog entries this plan consumes**, folded in on the owner's 2026-09-02 direction to sweep
`docs/BACKLOG.md` for anything M6 can reach. They are **new scope beyond the five original work
items** and are marked *(backlog)* in the table:

- **Entry 19** — the dishwasher decor door meets its own appliance at a 520 mm cabinet depth. The
  entry names M6 work item 4 as its owner, and it is a **gate on the control shipping**, not a
  nice-to-have. Decided 2026-09-02, ADR 0059.
- **Entries 15 and 10** — the uncapped wall-depth seam, one defect seen from two sides. New wave
  **6I2**, decided 2026-09-02 (ADR 0060). My judgement on whether it belongs here at all is stated in
  that wave; the short version is that it does, and that it must land **before** 6J rather than after.
- **Entry 20** — a resized seeded body renames itself. Escalated by 6A's logic review and decided by
  the owner on 2026-09-03 (ADR 0064): new wave **6A2**, before 6B and 6D.
- **Entry 18** — a handle choice repaints the oven's and the microwave's bars. New wave **6L**, in
  track G and **sequenced before 6G**. One premise it was routed on does not survive a read of the
  mockups; the wave and its ordering stand for other reasons, both stated at 6L.

**The setting is called cabinet depth from here on, not worktop depth** —
[ADR 0036](../decisions/0036-a-declared-dimension-is-the-finished-cabinet.md) decision 3, which this
plan's older prose above pre-dates. The worktop is an external part that influences neither geometry
nor price, and naming the control after it is the mistake ADR 0036 corrected in the code's own
constant (`worktop-depth.ts` carries a comment saying the rename is owed and deferred).

| Wave | Track | Gate | Tier |
| --- | --- | --- | --- |
| 6A — one canonical projection | P | none | Full |
| 6A2 — a seeded row carries its equivalent's name *(backlog 20)* | P | 6A | Full |
| 6A3 — a body past its wall is detected, as one domain fact *(ADR 0065)* | P | 6A | Full |
| 6A4 — the wall corner returns get their own kinds and names *(ADR 0066)* | P | 6A | Full |
| 6B — price book and pure pricing query | P | 6A, 6A2, 6A3, 6A4 | Full |
| 6B2 — the door step and the height term *(ADR 0068)* | P | 6B **cleared through QA** | Full |
| 6C — the price bar, both shells | P | 6B | Full |
| 6D — the breakdown (2D / D2D) | P | 6C | Light + visual |
| 6E — the whole-kitchen settings container | G | 6B | Full |
| 6F — a material that invalidates a finish | G | 6E — **unblocked, ADR 0057** | Full |
| 6G — the settings surface (2E / D2E) | G | 6D, 6E | Light + visual |
| 6H — cabinet depth becomes a parameter | D | none | Full |
| 6I — the base family follows the formula | D | 6H | Full |
| 6I2 — clearance is not a build depth *(backlog 15, 10)* | D | 6I — **unblocked, ADR 0060** | Full |
| 6J — the persisted setting and what a change does | D | 6H, 6I, 6I2 — **unblocked, ADRs 0055, 0056, 0058** | Full |
| 6K — the depth control on the sheet | D | 6J, 6G — **unblocked, ADR 0059** | Light + visual |
| 6L — the handle path learns cabinet from appliance *(backlog 18)* | G | none — **sequenced before 6B and 6G** | Full |
| 6M — the overflow is marked and warned about *(ADR 0065)* | — | 6A3 | Light + visual |
| 6N — the wall-coverage bars *(owner request)* | — | 6D, 6M, decision 8's fixture correction | Light + visual |

The letters are identifiers and the table is in dependency order, with one exception: **6L is listed
last and runs early.** It has no technical gate on anything and nothing gates on it, so it is placed
by choice rather than by dependency — before 6G, so that no global control is the thing that makes
the defect visible. `6I2` follows M5's own convention for a wave inserted between two already-named
ones (5C2, 5D2a).

### Wave 6A — one canonical projection of a design

**Goal.** One function that orders and groups a design's placements *wall → band → order*, with one
derived label per placement. The scene's grouping, the breakdown, M8's review summary and the
pricing query's line order all read it. This wave exists first because the phase's largest recorded
risk is three groupings drifting apart, and the cheapest way to make that unrepresentable is to have
one before anything needs two.

**Touches.** `packages/configurator-domain/src/queries/` (a new projection module), `index.ts`, and
every call site that currently orders placements for display — none may keep a sort of its own.

**Acceptance criteria.**

- Grouping is wall → **normalised** band. `top` folds into `wall` through `normaliseBand`, which is
  what puts the seeded top row inside the mockup's *Perete A · suspendate* group. A group is never
  keyed on the raw band.
- **Within a group the order is row-major: `y0Mm` before `alongMm`** — the whole hanging row left to
  right, then the whole top row left to right
  ([ADR 0063](../decisions/0063-a-group-is-listed-row-major-height-before-position.md), owner,
  2026-09-02). The full chain is `wall → normalised band → y0Mm → alongMm → placementId`.

  **6A shipped the transposed order and it is being corrected in its review-fix punch list.** Along
  before height reads *column-major* — each hanging cabinet immediately followed by the top box above
  it — because ADR 0011 Gap C puts two module lines in one group. The alternative was genuinely
  defensible and the mockup could not arbitrate (its *bază 6 · suspendate 7 · coloană 1* describes a
  14-body kitchen, not the seeded 25), so it went to the owner: **like is grouped with like, and the
  whole hanging row reads as a row.** Recorded so a later session does not "fix" it back.
- **The tie-break chain's totality is unchanged in kind** — the same five keys, two transposed. The
  last key is still `compareIds`, and the byte-comparison and placement-id-uniqueness notes on 6B
  below still stand.
- The projection is a pure function of `(Design, BodyCatalog)` and returns an identical value for a
  design whose `placements` array has been randomly permuted. Asserted as a property over generated
  permutations, not one shuffled fixture.
- Each entry's label comes from `describeBodyLabelAt`
  ([ADR 0033](../decisions/0033-door-count-is-derived-from-width-not-declared.md)) — never a literal,
  never a second derivation. A body whose `buildId` migrated on resize (`docs/BACKLOG.md` entry 20)
  must read the same in the projection as in the panel header, or the two have already diverged.
- Empty columns and voids produce **no** entry. A design of nothing but empty space projects to zero
  groups, not to one empty group.
- Exactly one display-order comparator exists in the repository, and a test names it and asserts the
  scene and the breakdown both reach it.

  **Split, and the second half is owed to 6D — recorded 2026-09-02, reached independently by 6A's
  implementer and by QA.** The first half is met and is falsifiable repository-wide by a structural
  guard: exactly one display-order comparator exists. The second half **cannot** be met in 6A,
  because no consumer exists — the scene syncs bodies through a `Map` keyed by placement id and
  never orders a list, and the breakdown does not exist in `apps/web/src` at all.

  It is **owed, not waived**. 6A's whole purpose is stopping three groupings from drifting apart,
  and that purpose has no enforcement at the exact moment the second surface arrives, which is 6D.
  Nothing in 6A may be weakened to claim it met, and it may not be counted green.

  **The inheriting wave is 6D, not 6C.** 6C is the price bar in both shells; the breakdown is 6D.
  Recorded because the criterion's own words — *the scene and the breakdown* — read as either wave
  to someone who has not checked the wave table.

### Wave 6A2 — a seeded row carries its catalogue equivalent's name (`docs/BACKLOG.md` entry 20)

New scope, decided by the owner on 2026-09-03 —
[ADR 0064](../decisions/0064-a-seeded-row-carries-its-catalogue-equivalents-name.md). Escalated out
of the backlog by 6A's logic review.

**Why it is a wave and not a rider.** The seeded pantry reads *"Coloană"* until the customer's first
resize migrates its `buildId`, then *"Coloană cămară 2 uși"*. That was tolerable while the name lived
in a panel header — entry 20 filed it unscheduled on exactly that reasoning — and stops being
tolerable at 6D, which puts the name in a **priced, customer-facing document**. It is small, it is
unblocked, and it is customer-visible copy, so it does not ride inside a surface wave.

**Sequenced before 6B and 6D**, so neither builds fixtures around names that would change underneath
them.

**Touches — verified against the tree, not inherited from the entry's "a fixture edit".**
`packages/configurator-domain/src/fixtures/kitchen-l-design.ts`, plus the tests that pin a current
generic name: `tests/queries/design-projection.adversarial.test.ts` asserts `"Coloană"` today, and
`catalog.test.ts`, `catalog.qa.test.ts` and `queries/describe-selection.test.ts` all exercise the
kind-label path. So it is fixture data **plus** test updates, and the wave should not be dispatched
as fixtures-only.

**Acceptance criteria.**

- **The criterion is the invariant, not a table of strings: a body's name does not change when its
  `buildId` migrates on resize.** Asserted by rendering the label before and after a resize round
  trip. A table of expected names passes while a ninth seeded row is added without its fields; the
  invariant does not.
- **Two fields per row, not one.** `describeBodyLabelAt` appends the door count only when
  `doorCountFollowsWidth === true`, so a row needs its equivalent's `label` **and** that flag. Eight
  seeded rows point at `wall-cabinet`, whose label is the *same generic string* the kind table
  already returns for them — copy the label alone and the rename survives as *"Corp suspendat"* →
  *"Corp suspendat 2 uși"*.
- **The test derives both sides and compares them**, rather than comparing either to a literal. The
  name now exists on the seeded row and on its equivalent, and two copies of one string is the drift
  ADR 0028 exists to stop.
- **Rows with no `catalogEquivalentId` are left alone and asserted to be**: the corner returns have
  none (ADR 0022), nothing can migrate them, and ADR 0025 already gave their kinds real names.
- **No seeded body renders `UNKNOWN_KIND_LABEL_RO`**, before or after. It does not today — every
  seeded kind is in `KIND_LABELS_RO` — and the assertion is worth keeping because an unknown kind is
  a larger problem than a name: §11 row 24 renders no replace section at all for one.
- **The M1 fidelity gate is not reached and this must stay true.** `label` is read nowhere in
  `packages/three-adapter/src`; no geometry moves.
- **`docs/BACKLOG.md` entry 20 moves from Open to Resolved on close** — that file's rule is that a
  decided item leaves it and the decision lives in `docs/decisions/`. On close, not at dispatch.

### Wave 6A3 — a body past the end of its wall is detected, as one domain fact

**[ADR 0065](../decisions/0065-a-body-past-the-end-of-its-wall-is-marked-not-moved.md).** Detection
only; the marking and the warning are wave 6M.

**Why detection is its own wave, and why it is early.** Four surfaces have to agree about whether a
body fits — the scene marks it, the breakdown lists it, the price bar flags the total, and M8's
review refuses on it. That is the same "one projection, many readers" argument wave 6A exists for,
and the same failure if it is not: one design marked in one place and not another. **6B needs it**
(the flagged total), so it lands before 6B rather than beside the depth control.

**Touches.** `packages/configurator-domain/src/validate-design.ts` or a sibling query, and
`index.ts`. Domain only — nothing visible.

**Acceptance criteria.**

- **One published fact per placement: does this body's along-wall extent pass the end of its own
  wall?** Every surface reads it; none re-derives it.
- **The extent is the furthest along-wall reach, never a sum of widths.** Wall B's run is contiguous
  at 600 and **not at 700**, where a 30 mm gap opens in the top row (ADR 0058: the corner return's
  top follows the wall map at +70 mm while the deep tops follow the base formula at +100). A sum
  would read 30 mm short precisely at the depth where the answer matters. ADR 0065's "2800 of 2830"
  is a contiguous-case shorthand, correct at 600, and must not be reimplemented as a formula.
- **The bound is the wall's own run** — wall A the room's width, wall B its depth (§2) — and never
  `longestWallRunMm`. Whether that function's `max` should survive elsewhere is not this wave's
  question; that it must not answer *this* one is.
- **One-sided: `run end ≤ wall length`, never equality. A remainder is the expected case, not a
  tolerance** ([ADR 0067](../decisions/0067-leftover-wall-is-the-normal-case-and-the-price-is-a-floor.md)).
  Real walls are not round — 2444 mm is typical — and the manufacturer closes the leftover with
  filler at the real measurement, outside this product. So under-filling is never reported, and **no
  companion check asserting that a run _reaches_ its wall may be added**: that is the check a gate
  author looking for things to assert would write, and it would be wrong in the normal case.
- **The seeded design reports nothing at 600 and two bodies at 700** — `p7` and `p24` — against the
  corrected wall lengths (A 3560, B 2830). Both halves are asserted: a wave that flags something at
  600 has the wrong wall length, and one that flags nothing at 700 has the wrong bound.
- **It depends on the room being corrected first.** Against the document's current `2400`, wall B
  reports an overrun at 600 that does not exist. Dispatch the fixture correction with this wave or
  before it.
- **A design whose body passes the end of its wall LOADS, and is marked. Today it does not load at
  all** — and this is the wave that fixes it, not merely the wave that detects it.
  `PLACEMENT_PAST_WALL_END` is fatal on load: `assertDesignValidForCatalog` raises it, `migrateDesign`
  throws `InvalidDesignError`, the API answers 500 `DESIGN_UNREADABLE`, and `/d/{id}` renders the
  invalid state. **ADR 0065 decision 7 — "saves and resumes with the warning intact" — is therefore
  unmet by the code until this wave lands**, and is recorded as unmet at that ADR so nobody reads it
  as shipped behaviour.

  **The fix is here and not in `migrate-design.ts`.** A body at 3200 on wall B is past the real wall;
  no room value a migration could write makes that true, and inventing one is the "rescued into a
  room they never entered" failure the migration's own guard exists to prevent. What is wrong is the
  **fatality**, not the bound.

  **Two red tests are this wave's inheritance.** The room correction's QA left them failing on
  purpose so that 6A3 would meet a red test rather than a note nobody reads; they are being converted
  to an explicitly-expected-failure form that keeps `ci:local` green and **fails the moment 6A3 makes
  them pass**, so the debt clears itself. **Flip them, do not delete them** — a deleted expected
  failure is indistinguishable from one that never existed.
- **Nothing is moved, narrowed, removed or refused.** This wave observes and marks; ADR 0055 is
  untouched.
- **The demo design must not overflow — a proposed kitchen is held to a stricter rule than an edited
  one.** Owner, 2026-09-03: everything the product proposes *"should always fit the existing walls,
  including demo"*. ADR 0065's marking is an acceptable outcome of a **customer's** edit; it is not
  an acceptable outcome of the seeded design loading, of a preset, or of M7's generation. So the
  seeded fixture reporting zero at 600 is an assertion this wave owns, not an incidental observation.
  The generative half is `docs/milestones/M7-room-and-presets.md`'s.

#### Wave 6A3 — the QA punch list, ruled 2026-09-03

Adversarial QA found two defects in 6A3 as first implemented. Both are adjudicated in
**[ADR 0069](../decisions/0069-past-the-wall-is-one-code-family-and-severity-is-declared-per-code.md)**;
read it before touching either. The work below is settled — nothing here is re-decided by the
implementer.

**Defect 1 — the room correction declines on exactly the rows it exists for.** *Implementation
defect in this wave, with a test-fidelity problem attached.* `correctPreCorrectionRoom`'s second
guard still counts an overflow as a failure, so one body a customer dragged past wall B vetoes the
measurement correction for the twenty-five that did not move, permanently (every save stamps
version 3).

1. `migrate-design.ts`: the **second** guard asks fatal-only validity —
   `fatalDesignValidationIssues(validateDesignForCatalog(corrected, catalog)).length === 0`. The
   **first** guard stays unfiltered and its commentary says why (it is how the arm recognises a
   document needing repair; filtering it turns the arm off). ADR 0069 decision 5.
2. Rewrite the guard commentary's third bullet: what makes the correction safe is that the corrected
   room is the **constant** `{3560, 2830}` reached only at version ≤ 2 from the exact pre-correction
   pair — never a value derived from where the bodies stand. Delete *"fails on its own terms with its
   own issues"* as the justification for the overflow case; keep it for the fatal case.
3. **Rewrite, do not delete,** `tests/qa-room-migration.adversarial.test.ts:181` *"does not rescue an
   arbitrary overflow into the corrected room"*. It pinned behaviour this ruling overturns. It must
   now assert, on the same `EDITED_PAST_WALL_B` document at versions 1 and 2: the room **is**
   corrected to `{3560, 2830}`; every placement comes back byte-identical, `alongMm` included; and
   `findOverflowingPlacementIds(loaded)` still names that placement. Name it for what it now pins —
   the room is a constant and the mark survives the correction, so nothing was rescued.
4. Add to the same file: the corrected-and-still-overflowing document is a **fixed point** — re-run
   at versions 1, 2 and 3 it comes back unchanged. And assert the reported set on a seeded row plus
   one edited body is **exactly that one id**, not `['edited', 'p24', 'p7']`; the phantom pair is the
   defect's signature and is what a regression would re-raise.
5. `FATAL_COMPANIONS` keeps its meaning and its assertions unchanged — a fatal fault beside an
   overflow still refuses, and still leaves the room alone.

**Defect 2 — the demotion is one code wide; the store writes the other two.** *Contract gap: ADR 0065
decision 7 named a behaviour, never a code set.* Closed by ADR 0069 decisions 1–4.

1. Split `COLUMN_EXTENT_OUTSIDE_ROOM` into `COLUMN_EXTENT_BEFORE_WALL_START`,
   `COLUMN_EXTENT_PAST_WALL_END`, `COLUMN_EXTENT_ABOVE_ROOM`, `COLUMN_EXTENT_DEEPER_THAN_ROOM` in
   `findExtentRoomIssues`, matching the `emptyColumns` names. Paths are unchanged. An extent
   breaching two edges emits two findings and the fatal one still refuses it. Replace the *"which
   edge it crossed is a detail for the reader of the path"* comment — the edge is now load-bearing.
2. Replace the filter in `fatalDesignValidationIssues` with a total
   `Record<DesignValidationCode, "mark" | "refusal">`, so a code added later **fails to compile**
   until it is classified. Three marks: `PLACEMENT_PAST_WALL_END`, `EMPTY_COLUMN_PAST_WALL_END`,
   `COLUMN_EXTENT_PAST_WALL_END`. Everything else is a refusal, `*_BEFORE_WALL_START` included —
   ADR 0069 decision 2 is the rule and belongs in the file as the map's doc comment.
3. Rewrite `tests/validate-design.test.ts`'s hand-maintained `FATAL_VALIDATION_CODES` table to
   **read** the production map rather than restate it, and add a test asserting the three marks by
   name. A second hand-kept exhaustive list is the same forgotten-member failure one seam over.
4. Pin the defect at the seam that produced it: build through the real
   `derivePlacementRecords` → `deriveColumns` → `projectFrozenMap` chain on the seeded kitchen with
   its last wall-A column moved 100 mm along, and assert **`[]` fatal codes** at all three of QA's
   steps — before freezing, after freezing, and with the column emptied. A hand-built `columnExtents`
   array does not reproduce this and must not be what the test asserts on.
5. Prove the surviving refusals still refuse on the split codes: `qa-5h.adversarial.test.ts:299/316`
   and `column-extents.test.ts:251` change their expected code (to `COLUMN_EXTENT_ABOVE_ROOM` and
   `COLUMN_EXTENT_DEEPER_THAN_ROOM`) and must keep asserting a **throw** from
   `assertDesignValidForCatalog`, not merely a reported code.

**Items 4 and 5 — from the logic review, ruled 2026-09-03. Both amend the punch list above; see
[ADR 0069](../decisions/0069-past-the-wall-is-one-code-family-and-severity-is-declared-per-code.md)
sections 5b and 5c.**

4. **`migrate-design.ts`: delete guard 1 outright** — do not filter it, do not keep it. This
   **replaces** item 1 of defect 1 in part: guard 2 still becomes fatal-only, and guard 1 goes. The
   arm becomes *pre-correction pair and version ≤ 2 → correct, unless the corrected room carries a
   fatal finding*. Its identity-preservation commentary is wrong and is deleted with it
   (`isPreCorrectionRoom` already guarantees the rooms differ). **Rewrite, do not delete,**
   `SYNTHETIC_EMPTY_ROOM`'s versions 1 and 2 case: it now asserts the correction fires with every
   placement byte-identical, and the version 3 row keeps asserting identity — the version gate is
   what protects the M7 customer. Re-measure QA's 7 tests rather than assuming; they were red under
   *filtering* guard 1 and are expected green under *deleting* it.
5. **`pricing/price-design.ts`: delete `overflowingPlacementIds` and derive.** `priceDesign` calls
   `findOverflowingPlacementIds(request.design)`; `refuseUnknownOverflowPlacement` and its
   `UNKNOWN_OVERFLOW_PLACEMENT` failure go with it, as does the test asserting that refusal —
   rewritten to assert the flag now follows the design itself, on a design whose overflow is present
   and on one whose overflowing body has been deleted. Wave 6B's *"pricing neither detects this nor
   acts on it beyond carrying it"* is amended: calling the one published query is reading, not
   detecting, and ADR 0065 requires every surface to read one answer.

**Item 3 — a production rule lives only in a test.** *Test-fidelity problem. Real, correctly
diagnosed, and **not 6A3's to close** — it is registered against wave 6J below.*

`seededDesignAt` (`tests/queries/overflowing-placements.test.ts:70`) decides per body whether its
along-wall position follows the **wall map** or the **base formula** when cabinet depth changes, and
decides it with `buildId.startsWith("wall-corner-return-570")`. The distinction is ADR 0058's and it
is exactly why a 30 mm gap opens in the top row at 700. A body filed under the wrong chain makes the
helper and the assertion wrong together, in the same direction, green — ADR 0028's "two numbers
agreeing by luck", in the one test the milestone relies on for the 600/700 behaviour.

**It is not already declared, checked before proposing anything.** `cabinet-depth-rule.ts` answers a
*different* question — whether a body's depth follows the setting at all — and its `cabinet-depth`
arm explicitly lumps all three chains together: *"whether through the base formula, the wall map or
the column carcass"*. So the hoped-for collapse into "the test should read the existing declaration"
is not available. When the fact is declared it belongs as a refinement of that arm, in that file —
**not a fourth module**.

**Why it does not land in 6A3.** Production cannot change cabinet depth yet, so the fact would have
exactly one reader and that reader would be the test that checks it. A declaration whose only
consumer is its own test is not an ADR 0028 parity gate — parity needs two independently derived
numbers — it is a rename, and it would ship a production seam with no production caller. The second
reader arrives with 6J, which is the wave that re-places every body at a new depth. Do not expand
6A3.

**What 6A3 does do, and it is one line of prose:** a comment at `seededDesignAt` stating that the
prefix stands in for an undeclared production fact, naming ADR 0058 and pointing at wave 6J. The
helper is otherwise honest and QA verified it — both shifts derived from `buildKitchenLBodyCatalog`,
no `100`, `70` or `2900` hard-coded, 8 mutations, zero survivors. Nothing else about it changes.

**Not decided here, and not the implementer's to decide.** Demoting the family means the write seam
accepts an insert into an opening that lies wholly past the end of a wall. Whether the product should
*offer* such an opening is the insert command's own question, belongs to wave 6M or M7, and is the
owner's call (ADR 0069 consequences).

### Wave 6A4 — the wall corner returns get their own kinds and names

**[ADR 0066](../decisions/0066-the-wall-corner-returns-get-their-own-kinds-and-names.md)**, owner
2026-09-03, mirroring [ADR 0025](../decisions/0025-the-corner-base-legs-seat-on-the-l-joint.md)'s
treatment of the base corners. Raised by 6I's review.

**The defect.** `wall-corner-return-570` (570 × 700) and `wall-corner-return-570-top` (570 × 400)
both declare `kind: "wall_cabinet"` and carry no `label` and no `catalogEquivalentId` (ADR 0022:
correctly, they have no catalogue equivalent), so both fall back to `describeKindLabel` and read
exactly **"Corp suspendat"**. Wave 6D puts that in a **priced document** — two identical
descriptions at two different amounts, with nothing on screen explaining the difference.

**Sequenced before 6B**, for the same reason 6A2 is: 6B's line labels come from the projection, and
building its fixtures against names that then change is wasted work.

**Touches.** The two fixture rows' `kind`, `KIND_LABELS_RO` in `catalog.ts`, and the tests that pin
either.

**Acceptance criteria.**

- **Two kinds, one per row — not one shared kind.** A single shared kind does **not** fix the
  reported defect: the two bodies differ by *row* (`wall` and `top`), §9's header renders the band
  and would separate them either way, but **the breakdown line renders label and width with no
  band**, so both lines stay identical in the one place the complaint came from. Two kinds is also
  the literal mirror of ADR 0025, which gave the two base corner bodies two.
- **A label, not a mechanism.** `"wall_cabinet"` has no behavioural reader — the string appears only
  in the fixture rows, one catalogue row and its own `WALL_CABINET_KIND` declaration, and nothing
  branches on it. If the wave finds a branch, it stops: the cost estimate was wrong and the decision
  needs re-taking.
- **`normaliseBand` still folds `top` into `wall`** (ADR 0011 Gap C). Both returns keep landing in
  the *Perete A · suspendate* group and §5.2's gate does not move. Asserted, because a new kind is
  exactly the kind of change that quietly re-bands a body.
- **They stay structural (ADR 0021) and keep `carriesHandles(1)`.** A name is not a capability.
- **No seeded body renders `UNKNOWN_KIND_LABEL_RO`.** Re-asserted here rather than inherited,
  because this wave changes two kinds and a `kind` has to be spelled identically at three sites —
  the fixture row, `KIND_LABELS_RO`, and the tests.

  **Corrected 2026-09-03 (6A4 QA): the harm is the label, not the swap list.** This criterion first
  cited §11 row 24 — a kind missing from the table renders no replace section — and **that is false
  for these two bodies**: `describeReplaceSection` returns at `if (!meta.canReplace)` one line before
  it reaches `isKnownKind`, and both returns are structural (ADR 0021) with `canReplace: false`, so
  they render no swap list at any spelling. What a divergence *would* do is drop both labels to
  **"Corp"** — in the panel header and, since 6D, in the **priced document** — silently reinstating
  the very defect this wave exists to remove. The row-24 rule is sound in general, for a body that
  can actually be replaced; it is not this wave's exposure. See
  [ADR 0066](../decisions/0066-the-wall-corner-returns-get-their-own-kinds-and-names.md)'s
  correction.
- The two lines read differently in the breakdown, for the reason they differ.

### Wave 6B — the price book and the pure pricing query

**Goal.** Work item 1, which after
[ADR 0004](../decisions/0004-m2-pricing-engine-deletion.md) is a **rebuild** and not an adaptation:
no pricing code survives to adapt.

**Touches.** A new `packages/configurator-domain/src/pricing/` (price-book shape, the query, and the
sample book as a separate file), `index.ts`, tests.

**Acceptance criteria.**

- **Price is a formula over width, never a table keyed on the width ladder** —
  [ADR 0035](../decisions/0035-width-is-a-bounded-stepper-not-a-menu-of-sizes.md) decision 8, which
  is recorded specifically so M6 is not designed as a lookup and then rebuilt. Falsifiable in two
  parts: no price-data structure keys on a width value, and a rule prices a 575 mm body without a
  575 row. Nothing under `pricing/` imports `WIDTH_STEP_MM` — the step is presentation and nothing
  downstream of the panel may depend on it.
- **One price line per placement, in 6A's order, which is row-major** — `wall → normalised band →
  y0Mm → alongMm → placementId` (ADR 0063). The projection's order, not an order pricing arrives at
  independently, and specifically not the along-before-height order 6A first shipped: stated here so
  6B does not re-derive an order it finds more natural. Each line carries its placement id, the rule it resolved and its derived
  label and width, so every line traces to a placement or to a named whole-kitchen rule.
- **The comparator's last tie-break key is a byte comparison, deliberately, and must stay one.**
  `compareIds` in `design-projection.ts` compares with `<` rather than `localeCompare` because ids
  are opaque persisted strings; `"B"` and `"a"` order oppositely under the two. Since this order is
  the price lines' order, a locale-sensitive tie-break would put a **cross-machine difference into a
  customer-visible document**. Recorded here so nobody "improves" it later.
- **Every owner-ruled string is pinned by a literal**, per wave 6D's statement of the rule — a
  composed assertion never replaces the literal pin. ADR 0065's overflow warning has **no ruled
  wording**; a wave must raise it, not invent one.
- **The comparator's totality rests on placement-id uniqueness, which is the validator's guarantee
  and not the schema's.** `DesignSchema` permits duplicate ids; `findDuplicatePlacementIds`
  (`validate-design.ts`) refuses them at both the write seam and the load seam. Anything that relaxes
  that validation silently breaks the projection's permutation invariance, and therefore the price
  lines' order.
- Whole-kitchen lines follow **all** placement lines: hardware, then material. A tier that costs
  nothing emits a line whose amount is zero; a rule that is missing is never read as zero, and
  omission never means "included".
- **Fail whole.** A placement whose `buildId` resolves no rule — directly or through
  `catalogEquivalentId` ([ADR 0022](../decisions/0022-seeded-entries-declare-their-catalogue-equivalent.md),
  [ADR 0029](../decisions/0029-a-two-door-cabinet-may-not-be-offered-at-one-door-widths.md)) —
  returns a failure naming the id it could not resolve. No partial line set, no partial total.
- The book carries a version and a status; the query refuses a book whose version does not match the
  one it was asked for, with no "current version" fallback and no migration inside pricing.
- **No commercial figure is asserted anywhere.** Every amount lives in exactly one file whose name
  says it is a sample, that file declares itself provisional in its own data, and a test asserts the
  exported book is that one and that its status is `estimate` rather than `commercial`.
- Nothing stores a total. `DesignSchema` gains no price field in this wave or in any later one
  (§12: derive from `placements`, never store).
- **An overflowing design is priced in full and the total is flagged** (ADR 0065 decision 6). Every
  body is listed, including the ones that do not fit; the result carries the overflow flag it read
  from 6A3, and pricing itself neither excludes a body nor refuses. **Excluding non-fitting bodies is
  the defect to test against**: the total would silently drop and read as the kitchen getting cheaper
  at the moment part of it became unbuildable.
- Rounding is **not** in the query. Amounts are exact integer minor units; presentation rounds.

**Three prohibitions, from [ADR 0062](../decisions/0062-a-manufacturer-price-dashboard-comes-after-m8-and-shapes-seams-now.md).**
A manufacturer-facing dashboard whose *primary* purpose is adjusting prices arrives after M8. **6B
builds none of it** — no admin surface, no auth, no endpoint, no schema. What it owes is three
things it must **not** do, each cheap now and expensive to retrofit:

- **It must not write a hand-authored price function per cabinet.** The formula is a **named shape
  whose coefficients live in the book**. ADR 0035 decision 8 requires a formula rather than a width
  table, and `CONFIGURATION_MODEL.md` requires the book to be *"data, not code or formula
  callbacks"* — both hold at once only if the shapes are code and the coefficients are data. A
  function per cabinet means changing any price needs a deploy, which defeats the dashboard's whole
  purpose at the seam and cannot be unpicked afterwards without rewriting every rule.
- **It must not import the book.** The query takes it as a parameter; nothing under `pricing/`
  imports the sample book except one composition root, so a book from another source is later a
  substitution rather than a refactor.
- **It must not let an amount, tier, delta or rule exist outside the book** — not in `catalog.ts`,
  not in `content/ro.ts`, not in a component. The 2E sheet's *"de la +9 000"* is book data rendered,
  never copy that happens to agree with a number.

None of this is in tension with the sample-amount rule above: the book stays a **sample** book
throughout M6, `status` stays a field on it, and who may edit a book later is not a property of its
shape.
- **The handle count comes from the placement's OWN entry, never through `catalogEquivalentId`** —
  and it is the one lookup in this wave that does not. Rule resolution goes through the equivalent
  (ADR 0022, ADR 0029) because a price *rule* belongs to the catalogue row a body is named after; the
  **count** does not, because it is a property of the already-built body standing in the design.

  **One edit away from biting, and 6L does not gate it** (6L logic review, 2026-09-03). Every seeded
  placement agrees both ways today only because the two rows where they would diverge have no
  equivalent: `wall-corner-return-570` and `wall-corner-return-570-top` each declare
  `carriesHandles(1)`, while `wall-cabinet`'s per-door rule at 570 mm yields **2**. Their siblings
  all already carry `...namedAfterCatalogEquivalent("wall-cabinet")` — wave 6A2 added eighteen such
  spreads — so a single plausible edit to a corner row turns a silent agreement into a body billed
  for two handles it does not have. **Pinned by a test on a seeded corner**, not by inspection.
- **The handle line's quantity is a count of _cabinet_ handles, never of handle meshes**
  ([ADR 0061](../decisions/0061-a-cabinet-handle-is-declared-and-an-appliance-bar-is-not-one.md)
  decision 2). It reads the count wave 6L declares on the catalogue entry, because the domain has no
  meshes to look at and §12 keeps it that way. `tall-oven-tower` bills **two**, not four.
- **Pricing does not copy 6A's lookup.** Reported by 6A's implementer: the projection resolves the
  literal `buildId` only, so a pricing query that reused it would fail whole on every seeded body
  where it should have resolved through `catalogEquivalentId` (ADR 0022, ADR 0029). The projection is
  the source of **order and labels**; rule resolution is pricing's own, and a test covers a seeded
  placement specifically.

### Wave 6B2 — the door step and the height term

**[ADR 0068](../decisions/0068-price-steps-at-the-door-count-and-follows-height.md)**, owner
2026-09-03. Two more price shapes, because 6B's single `linear-in-width` is not general.

**Why a separate wave rather than an extension of 6B, and it is a close call.** The shape *is* 6B's
deliverable, and bolting one on later is the retrofit ADR 0062 warns about — that argues for
extending. **Against it: 6B is implemented and in QA.** `docs/WORKFLOW.md` forbids reviewing a tree
that is being edited, and the same reasoning applies to QA: editing under it yields a report about a
tree that no longer exists. Adding two shapes and their criteria to a finished wave is also a second
wave's worth of work against the five-item limit.

**And the retrofit objection does not actually apply**, which is what settles it. ADR 0062's
prohibition is about the *mechanism* — shapes are code, coefficients are data — not about how many
shapes exist on day one. If 6B built a shape **registry**, a second shape is one new shape function
plus book data, which is exactly what 0062 asked for. The retrofit it warns about is a per-cabinet
*function*, not a second shape.

**So this wave is also the test of whether 6B met ADR 0062.** If adding a shape is cheap, 6B built
the registry. **If it requires restructuring, that is a finding about 6B**, reported as one — not
absorbed here.

> **That report is outstanding as of 2026-09-03 and is owed before 6B can be considered closed
> against ADR 0062.** The wave has since produced **four** shapes and re-shaped five sample rows,
> which is a count and not an answer: what is owed is whether adding them was cheap or required
> restructuring. **Recorded as unmet rather than assumed met** — a wave that shipped four shapes is
> evidence the registry works only if nobody had to rebuild it to get there.

**Acceptance criteria.**

- **A step at the door-count threshold**, expressed as a named shape over coefficients — never as a
  branch per catalogue row. The threshold is `deriveDoorCount`'s, the single place that question is
  answered; this wave adds a **fourth** reader to it and must not introduce a second threshold.
- **A height term where a body builds to its opening**, so two instances of one row at different
  heights price differently.
- **It keys on the `heightFlex` property, never on a list of build ids.** The owner named `wall-lift`
  and `open-shelf`; the flag is declared on the **shared wall-band shape**, so `wall-cabinet` has it
  too and §5.2's 900 mm rule means any of them can build at its opening's height. A rule naming two
  ids would be correct today and silently wrong for the third row that already behaves the same way.
- **Height enters additively, not as an area.** The owner did **not** take width × height. `a + b·w +
  c·h` is a shape over coefficients; `k·w·h` is a product term that no additive shape expresses, and
  it is a different decision nobody has taken.
- **ADR 0062's prohibition still binds and is re-asserted here**: no amount, no coefficient and no
  per-row logic outside the book. If the wave writes a function per cabinet, it has taken the wrong
  turn and the price book stops being editable by anyone but a developer.
- **The door step and 6G's hardware tier must count leaves the same way, or neither ships.** See the
  open question at 6G: `deriveDoorCount` returns leaves **per band**, so a 600 mm pantry has four
  hinged leaves while that function answers two. This wave puts a **second** consumer on that count.
  Two rules that each look right and bill a banded cabinet on different denominators is the failure,
  and it is quiet.

### Wave 6C — the price bar, both shells

**Goal.** Work item 2, plus §9 item 7's footer price, which the shipped `PanelFooter` does not carry.

**Touches.** `apps/web/src/panel/panel-model.ts` (the footer), a new price-bar component and its
module CSS, `apps/web/src/app/configurator/configure/configure-screen.tsx` and its module CSS,
`apps/web/src/content/ro.ts`.

**Acceptance criteria.**

- Every displayed figure is prefixed *De la* and rounded up to the thousand MDL by **one** function.
  No component rounds or formats independently.
- **The rounded lines and the rounded total need not sum, and no surface claims they do.** The
  mockup's own disclaimer — *"Toate sumele sunt prețuri de pornire, rotunjite în sus"* — is what
  carries it. A test constructs a design where the two differ and asserts the copy makes no equality
  claim about them.
- The total is derived from the current design on every render. No component computes a price, and
  no total is persisted.
- **A refused edit leaves the figure byte-identical**, and on desktop it is explicitly labelled
  unchanged while the rejection banner stands. This closes
  [ADR 0024](../decisions/0024-the-rejection-banner-has-no-reachable-path.md)'s third frame-2C
  requirement — the one M4 closed unmet on purpose and M5 wave 5E still carries.
- A pricing failure renders **no** figure: not a zero, not a stale one, not a dash that reads as
  free.
- **An overflowing design shows its total, flagged** (ADR 0065 decision 6) — never suppressed, never
  reduced. The customer needs the running total precisely then, to decide what to change.
- **Every owner-ruled string is pinned by a literal**, per wave 6D's statement of the rule — a
  composed assertion never replaces the literal pin. ADR 0065's overflow warning has **no ruled
  wording**; a wave must raise it, not invent one.
- **The flag is not the rejection banner, and the two criteria above do not collide.** They answer
  different questions: a *rejected* edit never happened, so the total does not move; an *accepted*
  edit that produces an overflow does move the total, and the total is flagged. Checked for
  consistency 2026-09-03 — they are consistent, and stay so only while the two surfaces stay
  distinct (ADR 0065 decision 8). Rendering an overflow through §9's rejection banner would make
  "a rejected edit does not move the total" and "an overflowing total moves and is flagged" read as
  a contradiction on one screen.
- At 390 × 844 the bar does not overlap the selected body's projected screen rectangle. Asserted
  against the scene's projected bounds, not by eye — this is a hard constraint, not a preference.

### Wave 6D — the breakdown (2D / D2D)

**Goal.** Work item 3.

**Touches.** A new breakdown component plus module CSS, `ro.ts`, and its mounting in
`configure-screen.tsx`.

**Acceptance criteria.**

- The rows **are** 6A's groups in 6A's order, rendered. The component performs no grouping, no
  sorting and no labelling of its own; deleting the projection call must break it, not merely change
  it.
- **Inherited from 6A, and the second of two things 6D must not quietly diverge from: the row-major
  order within a group** (ADR 0063) — the whole hanging row left to right, then the whole top row.
  6D renders it; it does not re-sort, and a rendered order that reads column-major is a defect in
  6D even though the comparator is 6A's.
- **Inherited from 6A, explicitly and not by implication: the convergence assertion.** 6A's fifth
  criterion — *a test names the single comparator and asserts the scene and the breakdown both reach
  it* — was met only in its first half, because 6D's surface did not exist yet. **6D is where it
  closes**, and it is named here rather than left to be read out of the bullet above, so that a
  later reader cannot mistake "the component sorts nothing" for "the two surfaces were shown to
  converge". 6A does not close until this is recorded; it does not become true until 6D ships.
- Each line names the body and its width — *"Corp bază spălător 800"* — from the projection's label.
- Hardware and material lines follow the placement lines, and an included tier renders *inclus*,
  never `0`.
- The disclaimer states that transport, worktop and appliances are excluded and that the final sum
  follows an on-site measurement. **The worktop's exclusion does double duty**: ADR 0036 decision 3
  makes the worktop an external part influencing neither geometry nor price, so this same sentence
  is why the depth control in 6K adds no price line.
- Mobile renders a full sheet with its own close action; desktop renders a popover anchored to the
  price. Both render from one model.
- The inclusion list is **data**. A test renders the component against an empty whole-kitchen
  section and against a full one, so the content slot can be filled later without a code change.

**Every owner-ruled string is pinned by a literal, and single-sourcing a composition never replaces
that pin.** Stated here in full; waves 6B, 6C and 6N carry the same rule by reference.

Copy is the one thing in this project that **cannot be derived or re-verified from the code**. A
wrong geometry number eventually surfaces in a measurement or a parity gate; a reworded label
surfaces nowhere except in front of a customer. The assertion is the only guard, so an assertion that
cannot fail leaves no guard at all — which is why this is a criterion here rather than general review
discipline.

**It already happened, in the wave that introduced the first owner-ruled string.** 6A4 shipped
`expect(describeKindLabel(...)).toEqual(` `` `Dulap de colț ${describeBandLabel("top")}` `` `)` under
a comment claiming it pinned owner-ruled copy, when it would have held for **any** wording.

**Both halves are required.** Composing the row word from `BAND_LABELS_RO.top` was *right* and must
be kept — this is not an argument against single-sourcing. The literal sits **alongside** the
composed assertion and makes the coupling loud.

**It covers disclaimers and warnings, not only labels** — 6D's exclusion disclaimer, 6B and 6C's
flagged-total warning under ADR 0065, and 6N's remainder copy all carry product meaning in their
exact wording.

**Where the strings were ruled**, so the criterion is enforceable rather than aspirational:

| String | Ruled in |
| --- | --- |
| *"Dulap suspendat de colț"*, *"Dulap de colț rând de sus"* | [ADR 0066](../decisions/0066-the-wall-corner-returns-get-their-own-kinds-and-names.md), owner 2026-09-03 |
| *"Racord bază de colț"*, *"Corp bază de colț"* | [ADR 0025](../decisions/0025-the-corner-base-legs-seat-on-the-l-joint.md) decision 5 |
| The *"De la"* prefix and rounding up to the thousand | [ADR 0001](../decisions/0001-initial-product-and-stack.md) decision 4, and the mockups' presentation rule |
| The 2D disclaimer and *"Nu constituie ofertă comercială"* | Mockup frame 2D |
| *"inclus"* for a zero-amount tier | Mockup frame 2E |
| *"Corpurile marcate depășesc lungimea peretelui. Modifică lățimile sau elimină un corp."* — the scene warning | [ADR 0065](../decisions/0065-a-body-past-the-end-of-its-wall-is-marked-not-moved.md) decision 7b, owner 2026-09-03 |
| *"Prețul include și dulapuri ce depășesc mărimea peretelui și necesită ajustări"* — the flagged total | ADR 0065 decision 7b. **The owner's own phrasing: verbatim, punctuation included, and not to be tidied** |
| 6N's *"PRACTIC PLIN"* heading and the remainder sentences | **Not ruled** — deliberately not yet put to the owner, so the wording can be judged against a real remainder rather than in the abstract. Still a content slot a wave must not fill |

The last row is the point of the table: **a string nobody has ruled is not pinned by writing one and
asserting it. It is raised.** ADR 0065's two strings were in that position on 2026-09-03 and were
ruled the same day; 6N's heading is deliberately still there, because it is better judged against a
real remainder than in the abstract.

**One thing the table does not settle, and no wave may settle on its own:** the flagged total says
*dulapuri* where the scene warning says *corpuri*. Deliberate register or incidental, it is the
owner's to reconcile — **a wave that harmonises them is making a product change**, and a copy pass
that harmonises them silently is worse.

### Wave 6E — the whole-kitchen settings container

**Goal.** The persisted slot this plan's Scope already requires be designed **once for three
settings**, built with two of them live.

**Touches.** `packages/configurator-domain/src/design.ts`, a new settings command,
`migrate-design.ts`, `validate-design.ts`, `apps/web/src/store/configurator-store.ts`.

**Acceptance criteria.**

- **One optional settings object, not three sibling keys.** Depth lands in 6J, but the container is
  designed for all three now, as this plan's Scope requires.
- Its absence is a valid, unchanged state and loads exactly as today. The backward-compatibility
  argument is `columnExtents`' (ADR 0053) — a field whose absence is a legal state owes no version
  bump — and explicitly **not** ADR 0038's "nothing has ever been stored", whose premise ADR 0052
  corrected by measurement: five rows exist at `schema_version` 1.
- Whether depth's arrival owes a version bump is 6J's decision and is deliberately not pre-empted
  here.
- Setting material or hardware is a command returning the same `CommandResult` shape as every other
  command, refusing with a code rather than silently no-opping — `set-appearance.ts`'s stated
  precedent, that a no-op looks identical to a broken control.
- The API write seam and `migrateDesign` both parse the new field through the same `DesignSchema`,
  which is the one gate both seams pass through.
- Pricing (6B) reads material and hardware from this object; nothing reads them from component
  state.

### Wave 6F — a global material that invalidates a per-cabinet finish

**UNBLOCKED 2026-09-02 — [ADR 0057](../decisions/0057-a-material-change-resets-an-unavailable-finish.md).**
An affected cabinet resets to the new material's default finish, and the sheet states that
consequence before the change is applied. The filter, the reset and the warning ship together;
none of the three means anything alone.

**Acceptance criteria.**

- The per-cabinet finish list is filtered by the global material, in the domain. The panel renders
  the result and decides nothing.
- **No stored design may hold a finish its material does not offer** — asserted as a property over
  every (material, finish) pair, not over the pairs that happen to appear in a fixture. The rule
  decides what *replaces* the invalid finish; it never decides whether one may survive.
- The resolution runs once, at the point the material is applied, and produces one command result —
  never a per-cabinet cascade the customer watches happen.
- **The warning naming the consequence is shown before the apply, on both viewports** (ADR 0057
  decision 3). A reset that happens without it is the wrong behaviour, not a cosmetic shortfall —
  it is what the decision traded a refusal for.

### Wave 6G — the settings surface (2E / D2E), material and hardware

**Touches.** A new settings-sheet component plus module CSS, `ro.ts`, mounting in
`configure-screen.tsx`.

**Acceptance criteria.**

- The sheet states how many bodies it applies to and that it is not set per cabinet.
- Each tier shows its name, its one-line description and its delta (*inclus*, *de la +9 000*). All
  of that is provisional sample content living in one place.
- The warning that a material change recalculates the whole estimate is present.
- **If 6F has not shipped, the sentence about limiting per-cabinet finishes is omitted, not shown.**
  A warning about behaviour that does not exist is decoration, which is the exact defect M4's
  Finisaj section shipped and `docs/STATUS.md` records because nowhere else holds it.
- Mobile is a full sheet with an explicit apply action; desktop is a popover anchored under the
  chips it controls, with both cancel and apply.
- Both viewports show the running total, since a configuration exists at that point.

**Open question this wave must meet before it prices a hardware tier — do not reach for
`deriveDoorCount` without reading this** (6L logic review, 2026-09-03).

The hardware tiers are *"Balamale și glisiere"* — **hinges and slides**, which are priced **per leaf
and per drawer**. `deriveDoorCount` returns **leaves per band**, not leaves per cabinet: `tallPantry`
builds two door bands of `doors` leaves each, so a 600 mm pantry has **four** hinged leaves and four
handles while `deriveDoorCount` answers **2**.

**Nothing is wrong today.** The convention is documented and internally consistent — ADR 0048's
two-door band layout, and `describeBodyLabelAt` already ships *"Coloană cămară 2 uși"* for a
four-leaf cabinet — and every handle number is correct at every width, because
`cabinet-handles.ts` applies the per-band count the way the builder does.

**Half of this resolved on 2026-09-03, and not by anyone choosing an answer.** Wave 6B2's
implementer observed that the physical count the owner's reasoning is about — a handle, a set of
mechanisms and a processing margin **per door** — is leaves **per cabinet**, which is
`doorTiers × deriveDoorCount`, and that `cabinetHandleCount` was **already performing that
composition inline**. It is now extracted as **`widthDerivedDoorLeafCount`** (`cabinet-handles.ts`,
exported from the domain barrel), and both the handle line and ADR 0068's price step read it. That
is the same composition named once, not a product decision taken by an implementer.

**So the count exists and has one definition. What is still genuinely open is the owner's: does the
hardware tier price per leaf, per band, or per cabinet?**

**The under-counting warning stands, and now points somewhere.** A wave that reaches for
`deriveDoorCount` as a leaf count under-counts every banded cabinet in the kitchen — a 600 mm pantry
has four hinged leaves and that function answers two. Reaching for the raw derivation is now
demonstrably the wrong move **and there is a right one to name**: use `widthDerivedDoorLeafCount`.

**If the tier turns out to price per leaf, it must use that same function**, because
[ADR 0068](../decisions/0068-price-steps-at-the-door-count-and-follows-height.md) already puts a
carcass's own price on it. Two rules counting leaves on different denominators is the failure, and it
is quiet.

### Wave 6H — cabinet depth becomes a parameter, not a module constant

**Not blocked.** This is the M5-shaped half of the control: parameterise first, value-preserving at
600, exactly as wave 5F did. Nothing here needs an owner decision, and doing it early means the
blocked waves are small when they unblock.

**Why it is a wave at all.** The depth is not merely a constant today — it is a constant that five
module-level derivations in `catalog.ts` are computed from at import time
(`WALL_DEPTH_MM`, `hoodFrameDepthMm`, `BASE_FINISHED_DEPTH_MM`, `TALL_UNIT_FINISHED_DEPTH_MM`,
`HOOD_FINISHED_DEPTH_MM`), plus `WALL_CARCASS_MAX_DEPTH_OVER_WORKTOP_M` in `commands/insert-fit.ts`.
A catalogue frozen at one depth cannot serve a design that carries another; this is the work item 4
cost the plan's *"one more control in a panel this phase is already building"* line understates.

**Touches.** `worktop-depth.ts` (and ADR 0036's deferred rename to cabinet depth, which the module's
own comment scopes at eight files plus message and test names), `catalog.ts`,
`commands/insert-fit.ts`, `index.ts`, and the adapter's `KitOptions.cabinetDepthMm` call site in
`apps/web/src/scene`.

**Acceptance criteria.**

- **Value-preserving at 600.** Not one shipped dimension moves, against the M1 fidelity gate at
  1e-6 m — the same bar wave 5F cleared.
- The catalogue's depth-derived facts are functions of a cabinet-depth argument, and no module-level
  constant fixes them at 600. Falsifiable: building the catalogue at 600 and at 700 yields different
  `nominalDepthMm` and `occupiedDepth` values, and the 600 build is value-identical to today's.
- `index.ts` today **deliberately withholds** `wallDepthMmForWorktop` and `declaredWorktopDepthsMm`,
  with a comment saying a second caller deriving a wall depth from an undeclared worktop is a fresh
  way for two numbers to disagree. Whatever this wave exports is exported with a stated reason and a
  replacement guard, not by quietly deleting that comment.
- An undeclared depth still throws `UnknownWorktopDepthError`: no interpolation, no rounding, no
  nearest row, no silent default (ADR 0028 decision 4).
- The domain's rule and the adapter's constant remain one number — `cabinet-depth-source.test.ts`
  passes unchanged.
- **Optional, and only because this wave already has `catalog.ts` open: the availability predicate
  is named once.** ADR 0062. Availability is currently two call sites testing one boolean —
  `toInsertableBody` and `resolveCatalogEquivalent`, both on `definition.insertable !== true` — and
  `offersFor` reaches the first through `listInsertableBodies`. Giving them one named predicate is
  behaviour-preserving and removes the last way the two can diverge. **No flag, no data, no schema,
  no default meaning "disabled".** If it does not land here the retrofit is two call sites, so this
  is a note and never a reason to widen the wave.
- **The hood's finished line follows the setting and its body does not.** `HOOD_FINISHED_DEPTH_MM`
  is the cabinet depth while `HOOD_DEPTH_MM` stays 500
  ([ADR 0039](../decisions/0039-the-hood-is-a-standard-depth-hung-at-the-front.md): a hood is a
  manufactured appliance, hung at the front). At 700 the concealed gap behind it therefore grows
  from 100 mm to 200 mm. That is the ADRs' intent, and it must be asserted at both depths so it
  cannot later be "fixed" by aligning the hood to the map.

### Wave 6I — the base family follows the formula

**Not blocked.** This closes the carry-out `docs/milestones/M5-width.md` hands M6 by name: beyond
`baseCabinet`, the corner, return, dishwasher and oven-tower bodies stay byte-identical across
depths — measured in 5F's QA — and **M6 must not ship the depth control without closing it.** It is
a gap in reach rather than a live defect only because nothing ships at 700.

**Acceptance criteria.**

- At 700, every base-band body's finished depth moves by the same amount the formula moves
  `baseCabinet` by, asserted per body against the built meshes rather than against a constant.
- `occupied-depth.parity.test.ts`'s declarations hold at **both** depths — the gate that keeps
  `occupiedDepth` honest must not become a claim about 600 only.
- Value-preserving at 600.
- **Full-height bodies are in this wave's population, not only base ones.** `COLUMN_DEPTH_MM` (560)
  and `OVEN_TOWER_FINISHED_DEPTH_MM` (638) are literals today; a full-height cabinet is cabinetry
  and must follow the setting, while the *appliance* numbers inside it — the oven and microwave bars
  the 638 is measured to — are manufactured sizes that must not. Each body states which of the two
  it is, and a test asserts the split rather than moving everything together.
- `docs/BACKLOG.md` entry 19 is **recorded, not fixed** here: the dishwasher decor door meets
  `dw_body` at a 520 mm cabinet depth, and both declared depths are above it. The rule that keeps it
  unreachable is ADR 0059's declared 520 mm floor, enforced in 6J and 6K; this wave's criterion is only that the
  clearance is measured at both declared depths and stated, so the floor is a number somebody read
  rather than one somebody remembered.
- **The two pinned entries do not move, and the pin is a declaration rather than a held-still
  constant** — [ADR 0058](../decisions/0058-the-two-deep-top-cabinets-are-pinned.md) decisions 2 and
  3. Falsifiable: build the catalogue at 600 and at 700; `wall-2door-600-deep-top` and
  `wall-2door-700-over-fridge` finish at 600 at both, while every other cabinetry entry has moved.
  An entry that neither tracks the setting nor declares an exception **fails loudly** rather than
  silently holding still — the same posture `occupiedDepth` already takes for an undeclared kind.
- **A cabinet's name does not vary with cabinet depth, and the seeded rows' name resolution is
  asserted to be depth-invariant.** Wave 6A2's `namedAfterCatalogEquivalent` reads `label` and
  `doorCountFollowsWidth` off `INSERTABLE_BODY_DEFINITIONS`, which 6H made a materialisation at the
  declared depth; this wave turns the seeded map into `buildSeededBodyDefinitions(cabinetDepthMm)`
  and so has to choose what the helper resolves against.

  **Either resolution is admissible, _because_ the invariance is asserted** — and the criterion is
  that assertion, not the choice: build the §7 definitions at every declared depth and assert each
  entry's `label` and `doorCountFollowsWidth` are **identical across depths**. They are today, since
  every shape takes its label as a string argument and none derives one from `cabinetDepthMm`, so
  both resolutions return the same values and the difference is **not observable**. That is what
  makes the choice safe rather than merely plausible, and it is why this criterion pins the property
  and not the call site.

  **What the implementation does**, so nobody hunts for a pinned constant that is not there: this
  wave builds the seeded map's name lookup from `buildInsertableBodyDefinitions(cabinetDepthMm)`
  rather than leaving it on the module-level `INSERTABLE_BODY_DEFINITIONS` that wave 6A2 resolved
  against. The reason is internal coherence — a catalogue built at depth *d* should have every part
  of it derived at *d*, and a lookup pinned to the shipped depth leaves a catalogue built at 700
  quietly half-built at 600.

  **A wave that makes any label depth-dependent must revisit both** — this criterion and that call
  site — because the moment the values differ across depths, "admissible either way" stops being
  true and a cabinet can silently rename itself at 700 inside a priced document. That is what the
  gate is here to catch ([ADR 0064](../decisions/0064-a-seeded-row-carries-its-catalogue-equivalents-name.md)'s
  amendment).
- **Seats are derived too, not only depths.** 6I found every body's *seat* still a literal, so at 700
  the reference room did not compose — carcasses through walls, worktops intersecting, upper corner
  returns overlapping by 70 mm. Independently re-measured during 6I's review at both depths, which
  also confirmed the 700 overflow population exactly: two bodies, `p7` and `p24`, both ending at
  z 2900 against wall B's 2830. Wall B's chain is derived from the room's own frozen arithmetic
  (`0.74 = 0.58 + 0.32/2`, `1.2 = 0.90 + 0.6/2`, …), reproducing every number exactly at 600.
- **Wall B's run extends at 700, ending at 2900 mm against 2800 at 600.** A deeper wall-A run
  consumes more of wall B at the corner and pushes the whole chain along, and that is correct
  behaviour rather than a defect: the owner's requirement is that **the run fits the wall it stands
  on** (owner decision 8), not that its end holds still. Against the reference's **2830 mm** wall B
  it fits at 600 with 30 mm spare and overruns by 70 mm at 700, where ADR 0065's marking applies.

> **The "run fits its wall" gate is REASSIGNED to wave 6A3 — it is not a criterion 6I owes, and it
> was not dropped.** Recorded 2026-09-03 after 6I's logic review found the assertion absent from
> `room-composition.parity.test.ts` and asked, correctly, whether a criterion had gone quietly
> unmet.
>
> **What happened.** This section previously required 6I to assert the fit in its own composition
> gate, and said the gate should "go red immediately, at 600" because the run overran by 400 mm.
> **Both halves are superseded.** The 400 mm premise came from a wall B of 2400 mm, which
> `docs/BACKLOG.md` entry 21's *corrected* resolution replaces with **2830** — so there is no overrun
> at 600 and nothing for that gate to report there. And
> [ADR 0065](../decisions/0065-a-body-past-the-end-of-its-wall-is-marked-not-moved.md) moved
> detection out of a parity test entirely: it is now **one published per-placement fact**, because
> four surfaces have to agree about it, which a test file cannot give them. **Wave 6A3 owns it**,
> with the sharper criterion this one could not have had — nothing flagged at 600, `p7` and `p24`
> flagged at 700.
>
> Marked rather than deleted because `docs/WORKFLOW.md`'s rule is to **record what is not met, at the
> criterion**. A reader finding this section unchanged would score 6I as having dropped an
> acceptance criterion, and a wave scored wrongly is worse than an unmet gate: it teaches the reader
> that the record cannot be trusted.
>
> The substance of the criterion survives unchanged at 6A3 — the bound is each wall's own run and
> never `longestWallRunMm`, and the constraint is one-sided, since bare wall at the end of a run is
> the **expected case** rather than a tolerance (ADR 0065 decision 4, strengthened by ADR 0067) and
> must never be reported. **No companion check that a run _reaches_ its wall belongs in this wave's
> composition gate either** — that is the assertion a gate author looking for things to add would
> write, and it is wrong in the normal case.
- **`HOB_FORWARD_OFFSET_M = 0.06` is the one literal the seat sweep left.** The hob follows its
  cabinet's seat, so its clearance to the worktop's front edge grows from 10 mm at 600 to 60 mm at
  700. It intersects nothing and crosses no wall, so it is **not a composition defect** — it is an
  appliance sitting further back on a deeper worktop, and whether that is right is a product question
  nobody has answered. Do not derive it into a formula and do not leave it inherited: raise it.
- `docs/BACKLOG.md` entries 15 and 10 are **not** this wave's. They are wave 6I2, which follows.

### Wave 6I2 — clearance is not a build depth (`docs/BACKLOG.md` entries 15 and 10)

**UNBLOCKED 2026-09-02 — [ADR 0060](../decisions/0060-a-column-publishes-a-build-depth-beside-its-clearance.md).**
New scope, folded in from the backlog on 2026-09-02. The column publishes a build depth beside its
clearance; the build depth is declared, never the clearance MAX; and both routes into a slot land on
it, which closes entry 10 at **600** — swap's number.

**Why it is in M6 at all, since entry 15 says plainly that this is a product decision with a new
fact in the model and not a patch.** Both halves of that are true and neither argues for leaving it:

- **M6 is the phase that makes the number reachable a second way.** Entry 15's defect is reached on
  two columns of the *shipped* kitchen today, at one depth. 6J adds a second, and under
  migrate-on-change (ADR 0055) a depth change **rewrites stored placements**
  — so every document written at 700 would persist a seat derived from an arm nobody has decided is
  right. Entry 15's own words are that it lands as a carcass nobody ordered, silent in the copy and
  silent in the render; writing that into the database on the customer's behalf is worse than
  building it once.
- **The sequencing follows from that, and it is the one non-obvious call here: 6I2 lands _before_
  6J, not after.** If 6J writes depths first and 6I2 then changes what depth the model believes a
  body should have, every document 6J wrote is inconsistent — and under migrate-on-change that
  rewrite is not reversible. Ordering it the other way costs nothing but calendar time.
- **The new fact is one wave's worth of work, not a phase's.** `deriveColumns`, the swap opening
  (`openingFromPlacement`) and the void mesh all read `opening.d` today, and `resolveDepthM`'s
  uncapped arm is the single consumer that wants a different question answered. That is roughly four
  domain files and one adapter file — inside `docs/WORKFLOW.md`'s five-production-file limit, and the
  same shape as waves 5A and 5F, both of which introduced a fact and re-pointed its readers.

**What I am not claiming.** This wave is not free and it is not mechanical: it introduces a second
number where the model has one. The decision about *what that number should be* was the owner's and
is now taken (ADR 0060); what remains is one wave of implementation against a settled contract.

**Touches.** `packages/configurator-domain/src/occupied-depth.ts`,
`packages/configurator-domain/src/void-engine.ts` (`deriveColumns`),
`packages/configurator-domain/src/commands/insert-fit.ts` (`resolveDepthM`, `openingFromPlacement`),
and the void mesh in `packages/three-adapter`.

**Acceptance criteria.**

- **A column publishes clearance and build depth as two facts, and every reader names which it
  wants.** Entry 15 states the confusion exactly: `occupiedDepthM` computes *"the full extent a body
  occupies, handles included"* — a clearance fact — and `resolveDepthM` hands that same number to
  the probe as *"the depth to build the next body to"*, a manufactured size. Falsifiable: no call
  site reads a clearance number where it means a build depth, asserted by the two having different
  names and different types rather than by comment.
- **The build depth is a declared size: the map's wall depth where the cap applies, the
  cabinet-depth line where a full-height member lifts it, and never the clearance MAX** (ADR 0060
  decision 2). This is ADR 0028 decision 4's rule — a declaration, never a computation — applied to
  the one arm that evades it: 703 and 742 are values a formula produced.
- **Entry 10's divergence closes at 600, and the test says 600 rather than "the same number".**
  Over the fridge column the build depth is the cabinet-depth line, which is what swap already
  yields, so the agreed value is the smaller of the two measured numbers and not the larger. Pinning
  the expected value is what stops "they must agree" from later being satisfied by both routes
  drifting up to the clearance MAX.
- **Both routes agree over every column, asserted as a property** over every insertable entry rather
  than on the fridge column alone — §5.3 exists so that a swap is not a delete plus an insert.
- **A shallow body over a full-height member is unreachable by construction** (ADR 0060 decision 4):
  an insert derives the build depth and a swap can only preserve what some earlier route produced,
  so no route creates a 330 mm body over a column for a later swap to inherit. Asserted, because it
  is what makes the agreement stable rather than coincidental.
- **A pinned entry does not lend its pin to its replacement** (ADR 0060 decision 5, owner-decided
  2026-09-02): swapping one of ADR 0058's pinned bodies for a catalogue body gives the incoming body
  the column's **build depth** — 700 at a 700 mm kitchen — not the outgoing body's 600. Only
  reachable at 700, and asserted there rather than assumed unreachable.
- The hood keeps its own answer (ADR 0039, ADR 0040): its clearance and its build depth are
  legitimately different numbers and this wave must not "fix" that by aligning them.
- Value-preserving where the capped path already governs. Wave 5A's rule over a base run does not
  move, and the M1 fidelity gate holds.
- `docs/BACKLOG.md` entries 15 and 10 are closed at the entry with a pointer to the resulting ADR,
  or explicitly left open with what remains. Entry 9's mechanism note is re-read first — it is the
  same seam a third time.

### Wave 6J — the persisted cabinet depth, and what a change does

**UNBLOCKED 2026-09-02** — [ADR 0055](../decisions/0055-a-depth-change-migrates-the-stored-design.md)
(migrate on change), [ADR 0056](../decisions/0056-two-cabinet-depths-are-declared-and-the-control-reads-the-map.md)
(two declared depths) and [ADR 0058](../decisions/0058-the-two-deep-top-cabinets-are-pinned.md)
(the two deep tops are pinned). Wave 6I2 remains a gate.

**Acceptance criteria.**

- Changing the setting changes **every** base body's depth and every capped wall body with it, with
  no confirmation step and nothing left behind (ADR 0036 decision 5) — **except the two entries
  ADR 0058 pins**, which are excluded by reading their declaration and never by a special case in
  the migration code.
- `Column.d` (§3.2's MAX over the run) and every wall opening's depth in that column follow.
- **The rewrite runs through the normal command path**, so every fit rule, band gate and width guard
  fires on the rebuilt bodies (ADR 0055 decision 1). A bespoke transform over the document is the
  wrong shape even where it would produce the same numbers.
- It carries a **schema version bump** (ADR 0055 decision 2), and `migrateDesign` gains the
  corresponding arm.
- A design saved at one depth and loaded at the other is internally consistent: no placement keeps a
  seat measured at the depth it is no longer at, and `seatDepthMm` is re-measured on the rebuilt
  body rather than computed (ADR 0055 decision 3).
- **600 → 700 → 600 need not return the original document** if a body was resized in between. That
  is an accepted consequence (ADR 0055), so the round trip must **not** be asserted as an
  invariant — a test claiming it would be asserting something the decision declines to promise.
- The depth every body is rebuilt to is 6I2's **build depth**, never a clearance number. A
  migrate-on-change mechanism writing clearance values into stored placements is the failure this
  wave's ordering exists to prevent.
- Whatever floor owner decision 6 records is enforced here, in the domain, and not only in 6K's
  control — a control is a surface and a stored document must not depend on one.
- **Which chain a body's along-wall position follows — the wall map or the base formula — becomes a
  declared catalogue fact here, and `seededDesignAt`'s `buildId` prefix rule is deleted.**
  Inherited debt from wave 6A3, ruled 2026-09-03; the prefix is in
  `tests/queries/overflowing-placements.test.ts` and it is the only statement of that rule anywhere.
  This wave is where it gains a production reader, so it is where declaring it stops being a rename.
  It belongs as a refinement of `cabinet-depth-rule.ts`'s `cabinet-depth` arm, which today lumps the
  base formula, the wall map and the column carcass into one answer — **not** a fourth module, and
  **not** inferred from `kind` or from an id (ADR 0061: `kind` is demonstrably not enough). The same
  stance this wave already takes for ADR 0058's pinned pair: read the declaration, never a special
  case. **Closing it is this wave's, and the 6A3 test must end up reading the declaration rather
  than restating it** — a second hand-kept copy is the failure, not the prefix's spelling.
- **Do not restore `COLUMN_DEPTH_MM` or `OVEN_TOWER_FINISHED_DEPTH_MM` on spec.** Wave 6I deleted
  both after finding no readers. If this wave needs a materialisation at the shipped depth it should
  add **exactly what it needs**, named for what it is — reinstating a deleted constant because a
  plan once mentioned it is how a module-level value at one depth comes back into a phase whose
  whole point is that depth varies.
- **A stored design predates this wave's schema, and the migration seam is where that is answered.**
  ADR 0052 measured five rows in the application database at `schema_version` 1. Whatever
  [ADR 0055](../decisions/0055-a-depth-change-migrates-the-stored-design.md)'s version bump does,
  it meets documents written before any of this existed, and **ADR 0052's own precedent governs the
  shape of the answer**: `migrateFromV1` **normalises** a document written under a superseded rule
  rather than refusing it, because *"a `/d/{id}` share link is the one artefact this project hands to
  someone who cannot be asked to reload it"*. A load that refuses is a link that is dead.

### Wave 6K — the depth control on the sheet

**UNBLOCKED 2026-09-02** — [ADR 0059](../decisions/0059-the-dishwasher-niche-declares-a-cabinet-depth-floor.md)
settles the floor. Still gated on 6J and 6G.

**Acceptance criteria.**

- A fourth control beside material and hardware, on the same sheet, never a per-cabinet control.
- **The control's shape is read from the declared map, not hard-coded to two values.** A toggle if
  two are declared, a list if three — so decision 2 changing later is one data row rather than a UI
  rewrite.
- **Changing it visibly changes the model, not just a number**, verified by real interaction at
  390 × 844.
- The warning says the model moves, and reads unmistakably differently from the material warning.
  The two consequences are not alike and the copy must not make them look alike.
- The depth adds **no** price line, and the sheet says why in one sentence, so its absence does not
  read as a missing line.
- **No depth below the declared 520 mm floor is selectable** (ADR 0059). The floor is one declared
  constant carrying its own arithmetic — `(cabinetDepth − 40)/2 − 240`, which gives the 40 mm
  clearance measured at 600 and reaches zero at 520 — and it is enforced in the domain as well as
  here, so a document cannot arrive below it by another route.

### Wave 6L — the handle path learns a cabinet handle from an appliance's (`docs/BACKLOG.md` entry 18)

**CONFIRMED FOR M6 by the owner, 2026-09-02, with a second half that reaches pricing** —
[ADR 0061](../decisions/0061-a-cabinet-handle-is-declared-and-an-appliance-bar-is-not-one.md).
Scheduled in track G and **sequenced before 6B and 6G**: 6B reads the handle count this wave
declares, so it can no longer run first.

**One correction to the record, because the reason this wave runs early is not the reason first
given for it.** It was routed to M6 on the reading that work item 5's global hardware-brand
selection applies a hardware choice across every body at once, turning a per-body exposure into a
whole-kitchen one on every apply. **Measured against the mockups, that does not hold.** The 2E and
D2E hardware tiers are *Standard / Hettich / Blum*, described as **"Balamale și glisiere cu
amortizare"** and *"Glisiere cu extragere totală"* — hinges and slides, and neither mockup gives
them a rendered mesh. *Feronerie* and *Mâner* are two different controls in the same design:
`setHandlesVisible` and `applyBlackHandleMaterial` are driven by the **per-placement** `handle`
setting (`steel | black | push`, §5.5), which stays per-cabinet and which no wave in this phase
touches. So M6 does not widen entry 18's reach.

**It is scheduled here regardless, and the ordering stands**, for three reasons that survive the
correction — the third is the owner's own and is what settles it:

- **M6 is the first phase in which a handle choice becomes a _priced_ line.** 6D's breakdown renders
  one per placement — the mockup's *"Rând superior · push-to-open  8 000"*. On `tall-oven-tower` the
  customer is then charged for a hardware choice that also silently hides or repaints the oven's and
  the microwave's bars. A defect is worth closing in the phase that starts charging for it.
- **The ordering costs nothing to honour and would cost something to get wrong.** If the reading
  above is mistaken in any way this planner cannot see from the mockups — a hardware tier that turns
  out to touch a rendered part, say — running 6L first is what makes that harmless. Sequencing on
  the more cautious of two readings is free here, because 6L gates on nothing.
- **The owner's addition makes it a pricing dependency, not only a rendering fix.** The appliances
  keep their own handles in 3D, and the price must count *"the handler that are on top of facades
  not on electric devices"*. 6B reads that count, so this wave now stands in front of it.

**Touches.** `packages/three-adapter/src/decomposed-bodies.ts` and its tests, plus the catalogue
entries that gain a declared cabinet-handle count and the parity gate that holds it to the meshes.
The adapter file is one every body in the scene passes through, which is why entry 18 records that
folding this into a wave that also moved seeded geometry was refused.

**Acceptance criteria.**

- A `handle` group is treated as the cabinet's exactly when its own parent also holds a front — the
  same rule `opensAFront()` already encodes in the capability gate, applied in the path that
  *applies* a choice rather than only in the path that gates it. One rule, two callers, asserted to
  be the same rule.
- **The cabinet-handle count is declared on the catalogue entry, and a three-adapter parity gate
  holds the declaration to the meshes actually built** (ADR 0061 decision 3). Forced by §12, not
  chosen: pricing is a pure domain query, the domain has no meshes, and `opensAFront()` inspects
  geometry. The gate is ADR 0028's remedy for two numbers agreeing by luck, applied to the pair this
  creates — the same shape as `cabinet-depth-source.test.ts`.
- **An entry that declares no count fails loudly**, rather than falling back to its mesh count or to
  zero. A silent default is how four families carried a wrong `occupiedDepth` with every suite green
  (DOM-002).
- **`tall-oven-tower` is the named case on both halves**: `handle: "push"` hides its two cabinet bars
  and leaves the oven's and the microwave's standing, `handle: "black"` repaints only the two, and
  its declared count is **two**, so 6B bills two rather than four.
- `handle: "push"` on `tall-oven-tower` hides its two cabinet bars and leaves the oven's and the
  microwave's standing; `handle: "black"` repaints the two cabinet bars only. Asserted by counting
  meshes, per body, not by a snapshot.
- `base-hob-oven` — held off this today only by `canHandle: false` — is asserted directly rather
  than through its flag, so the exposure cannot return if that flag ever changes.
- Every other body in the catalogue is unchanged: a body with no appliance bar behaves exactly as it
  does now, swept over the whole catalogue rather than sampled.
- The M1 fidelity gate holds. No geometry moves; only which meshes a choice reaches.

### Wave 6M — the overflow is marked in the scene and warned about

**[ADR 0065](../decisions/0065-a-body-past-the-end-of-its-wall-is-marked-not-moved.md).** The
presentation half of 6A3.

**Sequencing, and it differs from where this was expected to land.** The instinct was to put it with
the depth control at 6K, on the reasoning that 6K is the first thing that can cause an overflow.
**It is not** — measurement puts an overflow in the shipped kitchen at 600 mm today, so tying the
marking to 6K would leave the default design overflowing and unmarked until the last wave of the
phase. It is therefore gated on **6A3 only** and belongs to no track.

**Touches.** The scene's material or overlay for a marked body, the warning surface, `ro.ts`.

**Acceptance criteria.**

- A body 6A3 reports is **visibly marked in the scene** and carries a warning saying those cabinets
  do not fit. Verified by real interaction, not by a unit test alone.
- **The marked body is not moved, resized, hidden or deselected.** It stays exactly where it is and
  stays editable — the customer resolves it by narrowing, removing, or going back to the shallower
  depth.
- **It is not rendered through §9's rejection banner** (ADR 0065 decision 8). A rejection says *an
  edit did not happen*; this says *an edit happened and its result does not fit*.
- **Bare wall at the end of a run is never marked** — under-filling is normal.
- **The design still saves and resumes with the warning intact.** No work is lost, and the mark is
  not a reason to refuse a write.
- **The default design marks nothing at 600.** If it does, the room dimensions have not been
  corrected — see decision 8 — and the fix is there, not here.

### Wave 6N — the wall-coverage bars (feature request, 2026-09-03)

**Owner:** *"btw I like this detailed bars what remains from wall, maybe to add them?"* — the
reference's *LĂȚIME ACOPERITĂ · PRACTIC PLIN* panel: a per-wall bar with occupied and total in
millimetres, the free remainder **named and located**, and the body list with widths.

**Assessment: it belongs in M6, as its own wave after 6D and 6M.** Three reasons, and one of them is
the reason it is worth doing here rather than filing it:

- **It is the projection 6A already publishes**, grouped wall → band → order, plus a per-wall total.
  Almost none of it is new machinery.
- **It is the honest surface for ADR 0065's marking.** A body past the end of its wall is a bar that
  visibly overflows its track, which explains *why* far better than a warning sentence does. If this
  ships, 6M's warning has somewhere to live rather than floating over the scene.
- **6K gives it a reason to move.** Its value is highest when the depth control changes the answer —
  the customer sees the bar fill and the free remainder shrink as they choose 700.

**Placed in M6 rather than M7 deliberately.** M7 owns the wall *lengths* as customer input, which
argues for putting the bar there — but in M7 the bar would arrive at the same time as the numbers it
divides by, with nothing to compare against. In M6 the wall lengths are fixed and the **depth control
moves the numerator**, which is exactly the story the bar tells. It carries into M7 unchanged.

**What it needs that does not exist today, flagged rather than assumed:**

- **Correct wall lengths.** The bar's denominator *is* the wall length, and the document currently
  says 3600 × 2400 against the reference's 3560 × 2830. **This feature is unbuildable until owner
  decision 8's fixture correction lands** — it would render a wall B bar reading "2800 / 2400", over
  100% full, on the default design.
- **The free remainder's _location_ is a new published fact.** *"40 mm liberi la capătul din
  dreapta"* and *"30 mm liberi lângă frigider"* are not numbers the projection publishes: one is
  positional (the tail of the run) and one is **relative to a neighbouring body**. Both are derivable
  — from `emptyColumns`, the run's far end and the adjacent placement — but deriving them is a new
  query, not a formatting choice, and it must come from one place for the same reason the grouping
  does.
- **The end panel counts and placements do not tell you so.** Wall A reads 3520 occupied, which is
  3500 of placements plus the 18 mm run-end panel and its 1 mm gap. A bar summing placements alone
  reports 3500 and disagrees with the reference by 20 mm.

**The reference already specifies its copy and layout**, so this is not a design task — the Romanian
strings, the ordering and the per-body width list all come from the panel. **With one caveat that is
this wave's alone** ([ADR 0067](../decisions/0067-leftover-wall-is-the-normal-case-and-the-price-is-a-floor.md)):
the panel was written against a **round** wall with a 30 mm remainder, and its heading is
*"LĂȚIME ACOPERITĂ · **PRACTIC PLIN**"*. Real walls are not round — 2444 mm is typical — so on a real
wall the same bar shows a **large** remainder, and **the customer must not read that as an error or
as the tool failing to fill their kitchen**. The copy has to work at a 200 mm remainder, not only at
30, and *"practic plin"* may not survive contact with a real wall. **This is the one M6 wave
meaningfully better tested against a large remainder**, because its output *is* the remainder — a
test fixture with a ~200 mm leftover belongs here.

- **Every owner-ruled string is pinned by a literal**, per wave 6D's statement of the rule. This wave
  has the most exposure to it: *"practic plin"* and the remainder sentences are mockup copy written
  against a round wall, and ADR 0067 already flags that they may not survive a real one. **A wave
  that rewords them is making a product decision and must raise it rather than assert its own
  wording.**

**Gate:** 6D and 6M, plus decision 8's fixture correction. **Not started, and lowest priority of the
open items.**

## Open questions gating this phase

- Sample and commercial price amounts.
- What the estimate includes, and therefore which lines the breakdown shows.
- The rule for a per-cabinet finish invalidated by a material change.
- **Added 2026-09-03:** what a hardware tier counts when it prices hinges and slides, and whether
  `deriveDoorCount` — which returns leaves per *band* — is the right source. See wave 6G.
- **Added 2026-09-02 with the backlog sweep:** the cabinet-depth floor the dishwasher niche needs
  (`docs/BACKLOG.md` entry 19), and what depth a wall cabinet over a full-height column is built to
  (entries 15 and 10). Owner decisions 6 and 7.

### Cabinet depth — recorded 2026-08-27, **partly decided since; corrected 2026-09-02**

Carried from `docs/milestones/M5-width.md`'s *Not established — Depth*, where they are numbered.
They are here as well as there because they reach the **control**, and M5 never meets them: M5 holds
one cabinet depth by construction, so nothing in that phase can change one.

> **Correction, 2026-09-02 (M6 planning sweep).** The heading above said *none decided* and that has
> been false since 2026-08-28.
> [ADR 0036](../decisions/0036-a-declared-dimension-is-the-finished-cabinet.md) rules on three of
> these: decision 4 closes question 3 (**height follows neither width nor depth**), decision 5
> closes the *outcome* half of question 4 (**every body adapts automatically, nothing is left
> behind**) and hands only the mechanism to M6, and decision 3 records the setting as **cabinet**
> depth with **two values, 600 and 700**, which narrows question 2. The questions are left standing
> below with their dated answers attached rather than deleted, because the open half of each is what
> the blocked waves actually need. A dated decision is not overturned by a plan; if any of these is
> to change, it is a new dated ADR.

- **What happens to a design saved at 600 when the customer switches to 700?** (M5 question 4.)
  **The outcome is decided — ADR 0036 decision 5.** *Refuse* is off the table: every body adapts,
  with no confirmation step. Only the **mechanism** is open, and it is owner decision 1 below.
  Every base body's depth changes and every capped wall body with it. Three shapes, none chosen:
  **migrate** (rewrite the stored placements once — needs a schema version and is irreversible),
  **re-derive on load** (store only the setting and compute depths — cleanest, but makes
  `seatDepthMm` a cache rather than a fact, contradicting ADR 0018's "the body's own measured seat"),
  or **refuse** (the setting is fixed once placements exist, defensible if the customer picks the
  worktop before laying out the kitchen). **This blocks the control**, and it is the same question as
  the invalidation risk above: a material change repaints, a depth change moves the model.
- **Is an 800 mm cabinet depth real?** (M5 question 2.) `800 -> 500` was named as a plausible future
  map row and explicitly not committed. It is the difference between a two-way toggle and a list of
  three. **Narrowed by ADR 0036 decision 3**, which records the owner's own words as two values, 600
  and 700; what is left is a confirmation, owner decision 2 below.
- **Does a 700 mm cabinet depth change wall cabinet HEIGHT, or only depth?** (M5 question 3.)
  **DECIDED 2026-08-28 — ADR 0036 decision 4: it does not.** Height follows neither width nor depth;
  a 700 mm deep kitchen has the same level lines as a 600 mm one, so §2's `LEVELS` — the spine of
  the void engine — do not move, and the control stays the size of a map row. Kept here because the
  reason it mattered is worth not re-discovering, **not** because it is open.
- **Do the two deliberately-deep top cabinets track anything?** (M5 question 5.)
  `wall-2door-600-deep-top` and `wall-2door-700-over-fridge` are 600 mm because their columns are —
  the head-clearance cap is lifted over a full-height member, not mapped. At a 700 mm worktop the
  base run deepens and `Column.d` over it rises while these two do not. Nothing says whether they
  should follow the worktop, follow their column, or stay put.
- **Does the hood follow the map?** (M5 question 1.) **DECIDED — ADR 0039.** A hood is a
  manufactured appliance sized to the cooktop it covers, so its own depth is standard at 500 and
  does **not** follow the map; it is hung at the front, so its finished face lands on the
  cabinet-depth line. Backlog 9 closed with ADR 0040. The live consequence for this phase is a
  6H criterion, not an open question: at 700 the concealed gap behind the canopy grows to 200 mm,
  which is intended.

## For the owner — decisions that unblock the blocked waves

**Written 2026-09-02 for the owner, not for an implementer.** Every option below is one already
recorded in this plan or in a dated ADR; nothing here is invented. Each carries what it costs and a
recommendation with its reasoning, so a decision can be taken by reading this section alone.

**Read this first.** Three of the four questions this section was asked to open were already ruled
on by [ADR 0036](../decisions/0036-a-declared-dimension-is-the-finished-cabinet.md) on 2026-08-28,
and the *Cabinet depth* section above has been corrected in place to say so. What is left is
genuinely narrower than the plan's older prose implies, and **no recorded decision is overturned
here.** Where a ruling exists, the remaining choice is stated as what the ADR itself handed forward.

> **Decided 2026-09-02 — all seven are closed and live in dated ADRs.** Each subsection below is
> kept in full, with its options and their costs, because the alternatives are the part a future
> reader needs; the outcome is stated at the top of each. **Nothing in M6 waits on an owner.**
> Decision 8 was added and closed on 2026-09-03.
>
> | # | Outcome | Record |
> | --- | --- | --- |
> | 1 | Migrate on change | [ADR 0055](../decisions/0055-a-depth-change-migrates-the-stored-design.md) |
> | 2 | Two depths, 600 and 700, control built for n | [ADR 0056](../decisions/0056-two-cabinet-depths-are-declared-and-the-control-reads-the-map.md) |
> | 3 | No action — already decided 2026-08-28 | ADR 0036 decision 4 |
> | 4 | Reset to the new material's default, warned before apply | [ADR 0057](../decisions/0057-a-material-change-resets-an-unavailable-finish.md) |
> | 5 | **Stay put — the two deep tops are pinned** | [ADR 0058](../decisions/0058-the-two-deep-top-cabinets-are-pinned.md) |
> | 6 | A declared 520 mm cabinet-depth floor | [ADR 0059](../decisions/0059-the-dishwasher-niche-declares-a-cabinet-depth-floor.md) |
> | 7 | Three parts: the column publishes a build depth; both routes land on it, at 600; a pin is not inherited by a replacement | [ADR 0060](../decisions/0060-a-column-publishes-a-build-depth-beside-its-clearance.md) |
> | 8 | The run must fit the wall it stands on — satisfied at both depths; the give-way rule is M7's | — |
> | — | 6L confirmed, and the handle line counts cabinet handles | [ADR 0061](../decisions/0061-a-cabinet-handle-is-declared-and-an-appliance-bar-is-not-one.md) |

### 1. A design saved at 600 when the customer switches to 700 — the mechanism

**DECIDED 2026-09-02 — MIGRATE ON CHANGE.** [ADR 0055](../decisions/0055-a-depth-change-migrates-the-stored-design.md),
which also records the reasoning the owner decided on and one accepted consequence: 600 → 700 → 600
is not guaranteed to return the exact original document if a body was resized in between.

**Already decided, in part.** ADR 0036 decision 5: *"we need to adapt all the depths of the cabinets
— the base, the middle, and the top ones… automatically, we will make them deeper."* So **refuse is
off the table**, and the outcome is fixed: every body adapts, no confirmation step, nothing left
behind. ADR 0036 explicitly hands **which mechanism delivers it** to M6, and names ADR 0018's *"the
body's own measured seat"* as the tension the mechanism has to resolve.

| Option | What it costs | What it buys |
| --- | --- | --- |
| **Re-derive on load** — store only the setting, compute every depth when the document is opened | `seatDepthMm` becomes a **cache** rather than a measured fact, which is precisely what ADR 0018 clause 4 and ADR 0040 built one conversion to prevent; it puts a second depth authority beside `occupiedDepthM` | No schema version, no rewrite, and a document is correct at whatever depth it is opened at |
| **Migrate on change** — rewrite the stored placements once, when the control moves | A schema version bump and an irreversible rewrite of a document a `/d/{id}` link may already have been shared from | `seatDepthMm` stays a number a probe measured on a body that was really built; the machinery already exists (`migrateDesign`'s version-keyed lookup, `schema_version` on `designs`) |

**Recommendation: migrate on change.** The rewrite runs in the store at the moment the customer
moves the control, through the same command path every other mutation already uses, and is written
by the ordinary save coalescer — so a stored document is always self-consistent with its own
settings, and a share link opened by a second person renders exactly what the first person saw.
Re-deriving on load would make the load path re-answer a geometric question the adapter answers
better, and a second authority for a depth is the two-numbers-agreeing-by-luck failure ADR 0028
exists to stop. The irreversibility is real but bounded: the rewrite is exactly the adaptation the
owner asked for, and a customer who moves the control back gets it applied again in the same way.

Whichever is chosen, **record it as a dated ADR** — it resolves a tension ADR 0036 named and left
open, so a comment in the code is not enough.

### 2. Is an 800 mm cabinet depth real?

**DECIDED 2026-09-02 — TWO VALUES, 600 AND 700, CONTROL BUILT FOR N.**
[ADR 0056](../decisions/0056-two-cabinet-depths-are-declared-and-the-control-reads-the-map.md).
No 800 row is written; ADR 0028's refusal stands.

**Already narrowed.** ADR 0036 decision 3 records **two values, 600 and 700**. ADR 0028 decision 2
separately names `800 -> 500` as a plausible future *wall* map row and says explicitly that it is
not a commitment, which is why it is not written in the code.

- **Confirm two.** The control is a toggle in appearance. No new number has to be invented.
- **Add 800.** One map row, plus a wall-cabinet depth at 800 that only the owner can name, plus the
  control becoming a list of three.

**Recommendation: confirm two, and build for n.** Wave 6K's criterion already says the control reads
its options from the declared map rather than hard-coding two, so the cost of leaving room for a
third is close to zero and the question comes off the critical path entirely — adding 800 later is
one data row and one owner-supplied number. Do **not** add 800 speculatively: ADR 0028 refused to
write `800 -> 500` down for the exact reason that guessing a manufactured size builds a cabinet
nobody makes, and that refusal is what makes the map trustworthy.

One interaction worth knowing: `docs/BACKLOG.md` entry 19's 520 mm floor is only reachable
**downward**, so a third row above 700 costs nothing there.

### 3. Does a 700 mm cabinet depth change wall cabinet HEIGHT?

**No decision is needed — this was decided on 2026-08-28.** ADR 0036 decision 4: height follows
neither width nor depth; *"the height will not be changed by any width changes"*, recorded as
covering the depth setting too. §2's `LEVELS` do not move, and the void engine's spine is untouched.
The ADR states it closes this question.

The only action is the one already taken in this amendment: the plan's *"none decided"* text was
stale and is corrected. If the owner wants this to change, it must be a **new dated ADR superseding
ADR 0036 decision 4**, not a plan edit — and it would be a far larger change than a map row, which
is why the ADR closed it deliberately.

### 4. A per-cabinet finish invalidated by a global material change

**DECIDED 2026-09-02 — RESET TO THE NEW MATERIAL'S DEFAULT, STATED IN THE WARNING BEFORE APPLY.**
[ADR 0057](../decisions/0057-a-material-change-resets-an-unavailable-finish.md). Unblocks 6F.

**Genuinely undecided.** Nothing in `docs/decisions/` rules on it — this is the one of the four that
is fully open. What is *not* open is the invariant: this plan already requires that no invalid state
survives, and 6F asserts it as a property over every (material, finish) pair. The decision is what
**replaces** the invalid finish.

| Option | What it costs |
| --- | --- |
| **Reset to the new material's default finish** | One rule, no new data. Silently discards a choice the customer made — unless the sheet says so before applying |
| **Map to the nearest offered finish** | A per-material mapping the owner has to author (five finishes in `FinishSchema`), which will be wrong for at least one pair, and wrongly invisibly |
| **Refuse the material change while an incompatible finish stands**, naming the cabinets | Never destroys a choice, but makes a whole-kitchen control refusable; with fourteen bodies the customer must hunt down and recolour each offending cabinet before the control will move at all |
| **Keep the choice and mark it unavailable** | Ruled out by this plan's own criterion — an invalid state survives |

**Recommendation: reset to the new material's default, and state the consequence in the warning
before the change is applied.** Both viewports already have an explicit apply action (2E on mobile,
the popover's apply on desktop), so the customer is told what will happen and then confirms it —
which is what makes a destructive reset acceptable, and what a refusal trades away for a dead end.
Refusing is worse than it looks here: the settings sheet is the wrong place from which to run an
errand across fourteen cabinets. Nearest-finish is the option to avoid — an authored table nobody
can check, whose errors are invisible.

### 5. Do the two deliberately-deep top cabinets track anything?

**DECIDED 2026-09-02 — STAY PUT. Both entries are pinned and immune to the depth setting.**
[ADR 0058](../decisions/0058-the-two-deep-top-cabinets-are-pinned.md).

The three options were: **follow their column**, **follow the map**, or **stay put**. The owner chose
the third; this planner had recommended the first. What follows is what pinning costs, worked out
after the decision, because the recommendation's reasoning was about a different option and does not
carry over.

**Measured on the shipped fixture at 600 mm, through `occupiedDepthM`** — not arithmetic:

| Top cabinet | Finished | Stands over | Below it | Today |
| --- | --- | --- | --- | --- |
| `p22` | 600 | `tall-oven-tower-600` | 638 | 38 mm recessed |
| `p23` | 600 | `tall-pantry-600` | 599 | **flush** (1 mm proud) |
| `p24` | 600 | `fridge-free-700` | 742 | 142 mm recessed |

An ordinary top cabinet finishes at 330. These two record `frameDepthMm: 561` and finish at exactly
**600** — not an arbitrary deep number but **the cabinet-depth line itself**.

**Three things this changes about how the decision reads.**

1. **"Shallower than the column it hangs over" is not a new artefact — it is the shipped
   condition.** Two of the three already sit recessed, and the largest gap in the kitchen (142 mm,
   over the fridge) is one the customer already sees. Pinning does not invert the reason these
   cabinets are deep; they were never as deep as their columns.
2. **The recommendation mischaracterised the status quo, and the owner's choice is nearer to it.**
   "Follow their column" was offered as existing behaviour. It is not: these are **persisted** bodies
   whose depth is a recorded fact, and `resolveDepthM`'s uncapped arm decides what an **insert**
   builds, not what these three are. Their de facto status quo is a fixed depth that has never
   tracked anything — which is what the owner made explicit.
3. **The choice is safer than the recommendation on `docs/BACKLOG.md` entry 15's axis.** Under
   "follow their column" at 700, these three would be rebuilt at their columns' depths and `p24`
   would take **exactly the 742 mm** entry 15 names — moving that defect off the post-delete insert
   path and onto three bodies of the shipped kitchen. Pinning prevents that. It does **not** shrink
   entry 15's population: the insert path is untouched, and that is wave 6I2's.

**What pinning costs at 700** — projected from the model 6H/6I build, not measured, since no 700 mm
kitchen exists yet. `p22` goes from 38 to ~138 mm recessed; `p24` is unchanged at 142 (a freestanding
fridge is a real machine and does not follow the setting); and **`p23` goes from flush to 99 mm
recessed** as the pantry moves forward 100 mm and the cabinet above it does not.

**Assessed as acceptable and recorded rather than worked around.** Nothing overlaps, nothing becomes
unmanufacturable, 600 stays a manufactured size, and a recessed top over a deeper column is already
the shipped condition on two of three. `p23`'s step is a **visual change on one face at a depth
nothing ships at**, which is a consequence to write down — done, in ADR 0058 — not a defect to
reverse the decision for.

**Pinned means a declared exception, not a literal constant** (ADR 0058 decisions 2 and 3). A
constant that silently stops tracking anything rots; a declaration is greppable and testable, and it
is what this project already does wherever the same question arose — `occupiedDepth` is declared per
entry and an undeclared kind throws, `catalogEquivalentId` is declared rather than inferred. Wave
6H/6I carries the criterion: build the catalogue at both depths, assert these two are identical at
600 while every other cabinetry entry moved, and make an entry that neither tracks nor declares fail
loudly.

### 6. A cabinet depth the dishwasher niche cannot survive

**DECIDED 2026-09-02 — DECLARE A 520 mm FLOOR beside the depth map, carrying the arithmetic that
produced it.** [ADR 0059](../decisions/0059-the-dishwasher-niche-declares-a-cabinet-depth-floor.md).
Enforced in the domain, not only in the control. Unblocks 6K.

**One correction carried into the ADR.** The arithmetic is **not** `cabinetDepth / 2 − 240`, which
was the form this decision arrived in: that gives 60 mm at a 600 mm kitchen and reaches zero at 480.
The carcass is the declared depth less the 40 mm front overhang, so the clearance is
`(cabinetDepth − 40) / 2 − 240` — which gives the **40 mm** entry 19 measured at 600 and reaches zero
at **520**, the floor the entry names. The point of this decision is a constant that carries a
re-checkable derivation, so a derivation that misses by 40 mm would have defeated it.

`docs/BACKLOG.md` entry 19, which names M6 work item 4 as its own owner. The dishwasher's decor door
is anchored on the derived carcass depth and follows the setting; `dw_body` — the appliance behind
it — is a real machine built at a literal 0.24 m front and does not. The gap closes at half a
millimetre for every millimetre the carcass depth drops, so **the appliance meets its own door at a
520 mm cabinet depth**. At 600 there is 40 mm of mounting clearance.

**Nothing reaches it today and nothing in this plan reaches it either** — 600 and 700 are both well
above 520 — so this is a floor with no way to be crossed until a third, *shallower* row is declared.
The decision is therefore about writing the floor down before the control exists, not about a live
defect.

| Option | What it costs |
| --- | --- |
| **Refuse the combination**, stating the reason — this depth with a dishwasher niche in the design | A per-design condition evaluated inside the settings sheet, and a refusal path on a *global* control, which nothing else in the product has. Machinery for a case no declared depth reaches |
| **Cap the control's floor globally at 520** | One declared number beside the map. Forbids a shallow kitchen for every customer, including those with no dishwasher |
| **Give the niche its own floor**, separate from the rest of the catalogue | The most physically honest, and the most new concept: the catalogue has no per-entry *depth* floor. `minWidthMm` is the nearest thing and ADR 0026 gives it a direction |

**Recommendation: cap the control's floor globally at 520, declared beside the depth map with its
derivation written next to it.** It is one line, it makes a future third row **fail loudly** rather
than silently build a door into an appliance — the same posture ADR 0028 decision 4 already takes,
where an undeclared depth throws instead of being guessed at — and it costs nothing real, because no
customer can ask for a shallow kitchen today and none is proposed. Per-entry floors are the
physically correct answer and also the wrong trade here: ADR 0026's reading of a declared floor
*above* the default is that it is a builder admitting it is not parameterised, and the real fix for
this one is parameterising `dw_body`, which is nobody's work in M6. Refusing the combination is the
option to avoid — it puts the product's first refusable global control in front of a case that
cannot occur.

### 7. Does the uncapped arm read the column at all?

**DECIDED 2026-09-02 — three parts, all owner-decided.**
[ADR 0060](../decisions/0060-a-column-publishes-a-build-depth-beside-its-clearance.md). Unblocks
6I2, and 6J behind it.

- **7a** — the column publishes a build depth beside its clearance.
- **7b** — both routes into a slot land on it, and the number is **600**.
- **7c** — **a pinned entry does not lend its pin to its replacement**: swapping one of ADR 0058's
  pinned bodies at a 700 mm kitchen gives the incoming body the column's build depth, **700**, not
  the 600 it replaced. Raised in planning as a derived consequence, put to the owner, and **decided
  by them on 2026-09-02** with the reasoning below.

The question was originally put in two parts; the third emerged from reconciling the first two and
is a decision in its own right, not a footnote to either.

**7a and 7b were put as potentially conflicting, and they do not conflict. Worked out against the
code and the map rather than argued:**

Measured on the shipped fixture through `occupiedDepthM`, every number at or below 600 is cabinetry
and every number above it is an appliance or an appliance's handle — `p22`/`p23`/`p24` at **600**,
the hood at 600 by declaration, the pantry at 599 (the reference's 40-versus-39 rounding), against an
oven tower at 638 (its oven and microwave **bars**) and a freestanding fridge at 742 (a 680 mm
machine and its door bars). **The cabinet-depth line is 600, and the shipped kitchen already builds
its tops over columns to exactly that.** The 742 the uncapped arm produces is the only number in the
set no cabinet was ever built to.

ADR 0028 decision 5 said so in words when the lift was introduced — the lift *"keeps the two deep top
cabinets at 600 over their columns"*. It was meant to raise the ceiling from the map's 330 to the
cabinet-depth line and was implemented as "return the opening's depth", which coincided with the
intent until wave S9 correctly taught `occupiedDepthM` to include appliance handles.

So 7a's build depth over a full-height member **is** 600, which **is** what swap yields. Nothing has
to give, and specifically *"they must agree"* has not become *"they agree on the larger number"* —
6I2's criterion pins the expected value at 600 rather than asserting equality, which is what keeps
it that way.

**7c, and how it was reached — kept visible because the ruling alone would not survive scrutiny.**
ADR 0058 pins two entries at 600 at every setting, so at **700** swapping a pinned body for a
catalogue body would inherit 600 while an insert derives 700. ADR 0060 decision 5 gives the incoming
body the column's build depth.

It was **derived first and confirmed second**, and it **extends** 7b's direction rather than
restating it: 7b was said about a case where swap produced the cabinetry number and insert produced
an appliance's, and the principle underneath is that the **cabinetry** number wins — which at 700 is
700. Read literally instead, "insert conforms to swap" would have the incoming body inherit 600. The
supporting argument, also put to the owner and accepted: the pin is a property of the *entry*
(ADR 0058 decision 2), and a body that never declared it must not acquire it by standing where a
pinned body stood, or the exception leaks into the general population and stops being greppable —
which is why ADR 0058 chose a declaration over a constant in the first place. Reachable the day 6K
ships.

The options as they stood before the decision, kept because the alternatives are the part worth
having:

Today, over a full-height column, `hasFullHeightUnder` lifts §5.2's head-clearance cap and
`resolveDepthM` reads `opening.d` — which is `Column.d`, §3.2's MAX over the run, *including
appliance handles*. So the product builds and **persists** wall carcasses at 703 and 742 mm: depths
no one manufactures, invisible in the copy (the offer sheet shows width and height only), invisible
in the render (no camera preset shows wall B at a grazing angle), and reached by an ordinary delete
on two columns of the shipped kitchen.

Two questions, and the second is the one entry 10 says to decide first.

**7a — what depth should a wall cabinet over a full-height column be built to?**

| Option | What it costs |
| --- | --- |
| **The column's depth** (today's behaviour, made honest) | A cabinet flush with the fridge front, which may be exactly right — but the number is whatever the appliance's door bars measure, so it is a formula inventing a manufactured size, the thing `worktop-depth.ts` exists to prevent |
| **The map's declared wall depth**, cap or no cap | Every top cabinet is a manufactured size. The two deliberately-deep cabinets over the columns stop being deep, which changes the shipped kitchen's appearance — and owner decision 5 is where that is confirmed or refused |
| **A third declared value** — the column publishes a build depth beside its clearance | Honest and extensible, and the largest: a new fact in the model that `deriveColumns`, the swap opening and the void mesh all have to carry |

**Recommendation: the column publishes both, and the build depth is a declared value rather than a
measurement.** It is the third option and it is the one entry 15 itself points at. The reason to
prefer it over simply capping is that the clearance number is genuinely needed — §3.1 asks for the
full extent a body occupies, handles included, and `occupiedDepthM` computes exactly that correctly
— so the fix is not to change what that number is but to stop a second consumer reading it for a
different question. Capping everything to the map is cheaper and would also work, but it silently
reshapes two cabinets of the shipped kitchen and puts owner decision 5 on the critical path of a
defect fix, which is two decisions entangled for no benefit.

**7b — must swap and delete-then-insert agree?**

Entry 10 measures 600 from a swap and 680 from a delete-then-insert, for the same end state, on the
same slot. Both routes follow individually correct rules.

**Recommendation: yes, unconditionally, and decide this half first.** §5.3 exists precisely so a swap
is *not* a delete plus an insert, and two routes to "a `wall-2door` in this slot" producing cabinets
80 mm apart is a state the customer can reach by ordering alone. Whichever number 7a picks, the
falsifiable rule is the same and is 6I2's criterion: the two routes agree for every insertable entry
on every column, asserted as a property rather than on the fridge column that happened to be
measured.

**Recorded outcome of 7b.** Both routes agree at 600, and 6I2 asserts the value rather than the
equality. Entry 10's own words — *"the divergence matters more than the number"* — are satisfied by
the divergence closing on the number the seeded design chose deliberately.

### 8. A body past the end of its wall is marked, not moved

**DECIDED 2026-09-03 — [ADR 0065](../decisions/0065-a-body-past-the-end-of-its-wall-is-marked-not-moved.md).**
The owner replaced the question rather than answering it:

> *"what if we not resize the corner just adapt the depth and if the last cabinets go off the wall to
> highlight it with red and show a warning that this cabinets can not fit?"*

**Nothing gives.** Depths adapt, the run extends wherever it extends, and any body whose extent
passes the end of its wall is marked in the scene and warned about. No cabinet is narrowed, none is
removed, the change is not refused, and **ADR 0055 is not amended** — a marked body is still there,
so *"nothing left behind"* stays literally true. The draft amendment to ADR 0055 written earlier the
same day is **withdrawn** and marked so at that record.

**The constraint is one-sided.** `run end ≤ wall length`, never equality. **Leaving bare wall at the
end is the expected case, not a tolerance**
([ADR 0067](../decisions/0067-leftover-wall-is-the-normal-case-and-the-price-is-a-floor.md)): real
walls are not round — 2444 mm is typical — and the manufacturer closes the remainder with filler at
the real measurement, outside this product. So under-filling is never marked or warned about, and no
check asserting that a run *reaches* its wall may be added.

**The bound is each wall's own run** — wall A the room's width, wall B its depth — and never
`longestWallRunMm`'s `max`, whose slack is what hid this.

**When it becomes live: at 700, not at 600 — and the seeded kitchen fits today.** Corrected
2026-09-03, on the reference's wall-coverage panel (*LĂȚIME ACOPERITĂ · PRACTIC PLIN*), which gives
**Perete A 3520 / 3560 mm** and **Perete B 2800 / 2830 mm**.

| Wall | Reference wall | Occupied | Free | Document says |
| --- | --- | --- | --- | --- |
| A | **3560 mm** | 3520 (3500 of placements + the 18 mm end panel) | 40 mm at the right end | 3600 — **wrong by 40** |
| B | **2830 mm** | 2800 (`p26` 580–900, `p5` 900–1500, `p6` 1500–2100, `p7` 2100–2800) | 30 mm next to the fridge | 2400 — **wrong by 430** |

**The panel describes this kitchen**, corroborated against the tree rather than accepted: wall A's
3520 is our measured 3500 plus `RUN_END_PANEL_THICKNESS_M` (18 mm) and its 1 mm gap, and
`kitchen-shell.ts` names that exact sum in its own comment — *"a shared face that arrives as
3.5189999"*. Wall B's 2800 is our measured far end to the millimetre.

**So there is no overrun at 600 and no give-way problem: the run fits with 30 mm to spare.** At 700
it ends at 2900 against 2830 and **overruns by 70 mm**, so ADR 0065's marking becomes live exactly
when wave 6K ships the depth control — not on the default design's first load.

**Two corrections follow from this and are owed at their source.**

1. **The seeded document's room is wrong on both axes**: `widthMm: 3600` should be **3560** and
   `depthMm: 2400` should be **2830**. Changing it moves no geometry — the shell is not built from
   the document — but it tightens the containment envelope every validation rule is measured
   against. **It is a fixture change with an owner's ruling behind it, not an engineering tidy-up**,
   and it should be dispatched as one.
2. **`validate-design.ts`'s "400 mm slack" comment is wrong and should be corrected at the source.**
   It explains the along-wall bound taking `max(width, depth)` as *"a fact about along-wall
   coordinates"*. It is not: the bound was compensating for a **bad room dimension**. With 2830 the
   wall B run fits its own wall, and the `max` is unnecessary rather than load-bearing. A comment
   asserting a false reason is what the next implementer trusts — ADR 0018's own argument for fixing
   a comment in the wave that finds it.

**The earlier room screen was not this room.** *Perete A 3,60 / Perete B 2,40* is the input mockup's
example values: 3.60 is a rounded 3.56, but 2.40 is nothing like 2.83. `docs/BACKLOG.md` entry 21's
resolution is corrected accordingly at that entry.

**The shell is still the odd one out.** It renders `RW 4.2 × RD 3.4` and matches neither the
reference nor the corrected document. That half of entry 21 stays open.

**Pricing an overflowing design: price it, flag the total** (6B, 6C). Every body is listed including
the ones that do not fit, and the total carries the same warning. Rejected: **excluding** non-fitting
bodies, because the price would silently drop and read as the kitchen getting cheaper at the moment
part of it became unbuildable; and **showing no price**, because the customer loses the running total
exactly when they need it to decide what to change.

**Save yes, submit no.** The design saves and resumes with the warning intact, so no work is lost.
The review/contact step refuses while any body does not fit — that half is **M8's** and is recorded
in `docs/milestones/M8-review-contact-success.md`.

#### The stored designs, and why the fix is at the migration and never at the bound

The fixture correction tightens the along-wall bound from `longestWallRunMm`'s `max` to each wall's
own run. **Five designs are already stored** (ADR 0052 measured them, at `schema_version` 1), all
saved from the seeded design, so each carries `room: { widthMm: 3600, depthMm: 2400 }` in its own
document. The bound reads **each document's own room**, so tightening it makes those documents
unreadable.

**The measured chain, because it is what makes the precedent obviously applicable rather than
arguably so:** `p7` and `p24` are refused with `PLACEMENT_PAST_WALL_END` → `migrateDesign` throws
`InvalidDesignError` → the load path maps it to **HTTP 500 `DESIGN_UNREADABLE`** → `/d/{id}` renders
a load error. A share link stops opening.

**The answer is [ADR 0052](../decisions/0052-800-mm-is-the-ceiling-on-any-empty-column.md)'s, not a
new decision.** `migrateFromV1` **normalises** a document that was legal under the rule in force when
it was written, rather than refusing it, because *"a `/d/{id}` share link is the one artefact this
project hands to someone who cannot be asked to reload it"*. A stored design carrying the old room is
exactly that shape. **So the fix belongs in `migrate-design.ts` and never at the bound** — the bound
is correct, and the red test is it working.

**An irony worth preserving**, because it argues for ADR 0065's shape from an unrelated direction:
the two bodies that make an old stored document unreadable at 600 are the **same pair** — `p7` and
`p24` — that ADR 0065 decision 1 says must be **marked and left in place** at 700. Identical
geometry, opposite handling, and correctly so: one is a **product state** the customer is shown and
resolves, the other is a **validation failure** that stops a document loading at all.

**The guard the precedent does not supply, and the one thing a later wave will get wrong.**
`migrateFromV1` normalises a shape that is *unambiguously* wrong — an empty column wider than any
ceiling. **`3600 × 2400` is not unambiguously wrong**: it becomes a perfectly legitimate room the
moment M7 lets a customer type one. So the migration must key on **when the document was written** —
its schema version — and **never on what its dimensions are**. Written down here because the
simplification is inviting: a later wave reading a version-keyed arm as ceremony will "simplify" it
into a value check, and silently rewrite a real customer's room.

#### The four options that were not taken

Kept because three of them were live for a day and one is elegant enough to be re-proposed as new.

- **Extend the run and say nothing** — what 6I built, and geometrically what this decision keeps.
  What it lacked was any way for the customer to learn the run no longer fits.
- **Shrink the structural corner return.** The return's left edge moves with the deeper run while its
  right edge holds, so its width falls out exactly as `320 − delta`: 320 → 220 mm at 700, whole
  downstream chain fixed. Costs no cabinet and no width a customer chose, since a corner return is
  structural (ADR 0021) with no chips and no resize. **Why it lost: it changes a part of the kitchen
  without telling anyone**, where marking tells the customer and changes nothing. It also needed a
  manufacturability answer for a 220 mm return that nobody had, and it runs out.
- **Narrow a customer cabinet.** A give-way rule nobody has written, against ADR 0017/0026 floors and
  ADR 0031's funding rules, overwriting a width set through ADR 0035's stepper.
- **Drop a body.** Needed ADR 0055 amended and a further "which body" decision that was deliberately
  never invented.

### Two content slots — product decisions, not engineering ones

Neither blocks a wave. Both are slots the waves above build **around**, so they can be filled at any
point without a code change.

- **Sample and commercial price amounts.** Engineering needs only a shape. Wave 6B's book ships
  provisional by construction, in one file that declares itself a sample, and the owner's real
  amounts replace that file. Until then **no commercial figure may be asserted anywhere in docs or
  code** — ADR 0001 decision 4, and the book's own `status` is what decides whether a surface may
  ever stop saying *"De la"*.
- **What the estimate includes, and therefore which lines the breakdown shows.** The mockup's own
  list — transport, worktop and appliances excluded, the final sum after an on-site measurement — is
  what 6D builds against, and 6D's criterion is that the inclusion list is data the component
  renders rather than logic it contains.

## Verification

- Pricing tests over the new placement shape: per-line traceability, ordering, included-tier
  rendering, fail-whole behaviour, and exact totals from fixture books.
- A test asserting the scene, breakdown and review projections produce identical grouping from the
  same design.
- Real interaction at 390 × 844 for the price bar's non-occlusion and both sheets.
