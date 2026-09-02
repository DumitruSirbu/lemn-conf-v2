# M6 — Live price, breakdown, and whole-kitchen settings (2D, 2E)

> **STATUS: PLANNED — waves sequenced 2026-09-02.** Depends on M5 (only wave 5E is still open there,
> and it does not gate anything here). Summary: `docs/STATUS.md`. Start at **Waves** below, then the
> owner section. **Fourteen waves, all unblocked.** The seven owner decisions were taken on
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
| 6B — price book and pure pricing query | P | 6A, 6A2 | Full |
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
- **The handle line's quantity is a count of _cabinet_ handles, never of handle meshes**
  ([ADR 0061](../decisions/0061-a-cabinet-handle-is-declared-and-an-appliance-bar-is-not-one.md)
  decision 2). It reads the count wave 6L declares on the catalogue entry, because the domain has no
  meshes to look at and §12 keeps it that way. `tall-oven-tower` bills **two**, not four.
- **Pricing does not copy 6A's lookup.** Reported by 6A's implementer: the projection resolves the
  literal `buildId` only, so a pricing query that reused it would fail whole on every seeded body
  where it should have resolved through `catalogEquivalentId` (ADR 0022, ADR 0029). The projection is
  the source of **order and labels**; rule resolution is pricing's own, and a test covers a seeded
  placement specifically.

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

## Open questions gating this phase

- Sample and commercial price amounts.
- What the estimate includes, and therefore which lines the breakdown shows.
- The rule for a per-cabinet finish invalidated by a material change.
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
> reader needs; the outcome is stated at the top of each. **Nothing in M6 now waits on an owner.**
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
