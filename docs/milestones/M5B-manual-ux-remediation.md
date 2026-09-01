# M5B — Manual UX remediation

> **STATUS: IN PROGRESS.** 5B1, 5B6, 5B7, 5B3, 5B5, 5B10, 5B8, 5B2a and 5B2b are complete —
> **wave 5B2 is closed**; 5B4a, 5B4b remain to dispatch. Summary: `docs/STATUS.md`. Branch `ux-manual-fixes`.

Status: in progress. Follows M5 (5E still open) and precedes M6.
Reference: `testing-reports/09-manual-ux-issues.md`; `DEVELOPMENT-SPEC.md` §3.2, §4, §5.2, §7, §9,
§11 rows 1–5, 14, 18, 20, 23, §12, §13.1, §13.3 items 2 and 4; ADRs **0043–0050**, and **0011**,
**0027**, **0031**, **0032**, **0033**, **0035**, **0037**, **0038**, **0040** as context.

## Why this is a milestone and not a fix list

Eleven findings from one manual session are not eleven independent defects. Four of them
(items 4, 5, and the reload half of item 6) are one missing capability — a span that can hold more
than one arrangement of cabinets — which is `DEVELOPMENT-SPEC.md` §13.3 item 2, open since the
design session and named in `docs/BACKLOG.md` entry 2 as the last piece of the width story. Two more
(items 8 and 10) are product rules the catalogue has never expressed. Closing them changes the
domain schema, the column algebra, the catalogue and the builders, and it overturns a withdrawn
decision record. That is a milestone.

## Why it sits between M5 and M6

M5 owns width as a whole-column boundary move and depth as a derived quantity, and it is where every
record this phase reopens was written — ADRs 0031, 0035 and 0037 are all M5's. M5B is the correction
round on that work as a person actually met it, so it belongs immediately after and cannot be folded
back into M5: **M5 wave 5E is still open**, 5E photographs the width surface, and its evidence would
be invalidated by every wave below. Running 5E and M5B concurrently would have 5E gate a surface
M5B is changing.

It precedes M6 because M6's price bar derives from `placements` and its global settings act on the
whole kitchen. Both read a design whose column model M5B changes — `emptyColumns` (ADR 0044) is a new
part of the persisted document, and a split column changes how many bodies a span holds. Pricing
against a model that is about to gain a field is work done twice.

## Wave naming — read this before reconciling any earlier message

These waves were planned under the names **UX-1 … UX-8** and renamed on 2026-09-01, at the owner's
instruction, once the work was recognised as a milestone. The numbering order is unchanged, so a
dispatch or a conversation that says "UX-3" means 5B3 and nothing else.

| Planned as | Now | Subject |
| --- | --- | --- |
| UX-1 | **5B1** | The growth-side remainder floor, and the sentence that names it |
| UX-2 | **5B2** | An empty space survives a reload |
| UX-3 | **5B3** | The run-end panel follows the run it closes |
| UX-4 | **5B4a** + **5B4b** | The insert-time column split, then the capped merge |
| UX-5 | **5B5** | A fixed-width cabinet says why it has no width control |
| UX-6 | **5B6** | Fill the cavity between the hob and the oven front |
| UX-7 | **5B7** | An open shelf's compartment count |
| UX-8 | **5B8** | The pantry column is the one resizable column |

**5B4 was one wave at plan time and is two here.** The split is separable from the merge in the
direction that matters and shipping it alone is this phase's main risk control — see 5B4a.

ADR **0043** was written by 5B1's implementer before the rename and may still carry the older names
in places; its subject and its decision are unaffected.

## Goal

Close the eleven manual-UX findings, and settle the three product rules the owner decided on
2026-09-01, **without leaving two live decision records that disagree**. The owner's standing
instruction governs the whole phase:

> "when we take a decission need to check if earlier it was opposite or ambiguious in another ADRs
> so we will avoid implementing based on outdated context and knowledge!"

So the decision-record reconciliation in *Decision records* below is a deliverable, not an
afterthought.

## Scope

In: the eight waves below. Out: anything not traceable to a numbered report item or to one of the
three owner decisions. In particular this phase does **not** build backlog 2's re-split UI (offering
a run's total as valid module combinations) — see 5B4b's *What this is not*.

## Constraints

- `docs/design/DEVELOPMENT-SPEC.md` is the behavioural contract; cite it by section and row.
- A dated ADR beats any milestone prose, this file included.
- ~5 production files per implementation dispatch (`docs/WORKFLOW.md`, *Scope discipline*). Paired
  tests do not count. Where a wave is near the limit it is said so below.
- M1's 1e-6 m structural-parity gate binds every `kitchen-parts.ts` edit: the **seeded** kitchen's
  geometry must not move. Every geometry wave below therefore adds a parameter or a new part, and
  none may change what `buildKitchen()` produces at its current arguments.
- ADR 0038: nothing has ever been stored, so a schema addition owes no migration. That is what makes
  5B2 cheap, and it **expires at first release**.

---

## What each reported item became

| Report item | Wave | Note |
| --- | --- | --- |
| 1 — ghost side panel stays put on resize | **5B3** | It is `end_panel_right`, the run-end oak panel, at `kitchen-parts.ts:1706`. Not a side panel of the cabinet. |
| 2 — `+50 mm` permanently greyed | **5B1** (dispatched) | `remainder_below_floor` on the growth side. |
| 3 — the tooltip's millimetre figure reads as a width | **5B1** (dispatched) | Copy fix in `rejection.ts`. |
| 4 — empty spaces do not merge | **5B4b** | |
| 5 — a 300 mm gap offers only 4 cabinets | **5B4b** | Consequence of item 4; same wave. |
| 6 — dishwasher cannot go 450 → 600 again | **5B2** | **Settled by measurement, 2026-09-01, not by asking.** A prior investigation shrank `p1` 600 → 450 and the domain reported `600:available` in-session; the refusal appears only **after a reload**, once the 150 mm strip is gone because `deriveColumns` throws on a member-less column (`void-engine.ts:425-428`). So it is 5B2's defect, not 5B1's. |
| 7 — sink cannot widen past 650 | **5B1** (dispatched) | Same `NO_EMPTY_SPACE` family as items 2 and 3. |
| 8 — the tall column should be the one resizable column, 400–800, door count by width | **5B8** | |
| 9 — no `LĂȚIME` section after replacing a tall cabinet | **5B5** | **The reported cause is wrong** — see 5B5. |
| 10 — open shelf always renders 3 shelves | **5B7** | |
| 11 — unfinished cavity on the hob + oven cabinet | **5B6** | |

Nothing is listed as not-planned.

---

## Waves

### Wave 5B1 — the growth-side remainder floor, and the sentence that names it *(dispatched)*

Planned and dispatched before this document. Recorded here for the ordering only: it removes
`remainder_below_floor` from `plan-width-funding.ts` and `rejection.ts`, and rewords
`renderNoEmptySpace` so the millimetre figure reads as space-needed. Its record is
[ADR 0043](../decisions/0043-an-empty-space-of-any-width-is-a-legal-state.md), already written.

**ADR 0043 is a hard prerequisite for 5B4a**, and not merely adjacent to it: an insert-time split
leaves a remainder of any width, and under ADR 0031's floor most of those remainders were illegal
states. Decision 1 is what makes the split legal at all.

---

### Wave 5B6 — fill the cavity between the hob and the oven front

**Defect, verified by reading.** `hobBaseWithOven` (`packages/three-adapter/src/kitchen-parts.ts:839-848`)
adds a plinth, an **open-front** `carcassFrame`, the oven seated on the carcass floor at
`y = PLINTH`, and the counter. The oven is 595 mm tall on a 720 mm carcass (`CARC_H = 0.72`,
`kitchen-parts.ts:646`), and the builder's own comment names the consequence: *"The 125 mm that
leaves between its top and the worktop line is where the hob's own box and its connections go."*
Nothing is built across that 125 mm band, and because the carcass is deliberately open-front there
is no shell behind it either. That is the red-boxed gap in the report.

**Work item.** Add a fixed, handleless facade panel spanning the carcass width across that band, in
the same material as the run's fronts (`M.door`), seated at the front line the oven fascia
establishes. The owner has said it need not be a functional door.

**Acceptance criteria (falsifiable).**
1. `hobBaseWithOven(0.6)` contains a mesh whose bounding box spans the full carcass width, covers
   the interval between the oven's top face and the underside of the counter, and stands at or
   forward of the carcass front plane. Asserted on measured bounds, not on a name.
2. No mesh in `hobBaseWithOven` intersects the oven group's bounding box.
3. `base-hob-oven`'s `occupiedDepth` (`finishesAtMm(HOB_OVEN_BASE_FINISHED_DEPTH_MM)`, ADR 0040) is
   unchanged **or** changed together with its declared constant and its depth test — the new panel
   must not silently make the body deeper than its declaration. This is the one way this wave can
   break something outside itself.
4. The seeded kitchen is byte-identical under M1's parity suite: `buildKitchen()` places
   `baseCabinet(0.6, { drawers: 2 })` under its hob, not `hobBaseWithOven`, so nothing seeded moves.

**Verification.** Three-adapter unit tests on measured bounds, plus the M1 parity suite, plus one
screenshot of an inserted `base-hob-oven` at the mobile viewport per
`docs/best-practices/browser-and-visual-qa.md`.

**Files.** `packages/three-adapter/src/kitchen-parts.ts` (1). **Review tier: Light** — one builder,
a settled contract, no domain rule. Visual review is required by the surface being visible.

**Risk.** Low. The only coupling is criterion 3.

---

### Wave 5B7 — an open shelf's shelf count follows its clearance

**Verified.** `OPEN_SHELF_INNER_SHELVES = 2` (`packages/three-adapter/src/catalog-bodies.ts:22`),
documented as *"an open shelf carries two inner shelves whatever its height"*, and passed literally
to `kit.make.openShelf` at `catalog-bodies.ts:96-102`. The builder
(`kitchen-parts.ts:1427`) adds `shelf_top`, `shelf_bottom` and `inner` interior boards, so the
customer sees **three compartments** at every height — which is what the report counted.

**Decision, and it is a product rule, so it gets an ADR.** Drive the count from the **available
vertical clearance**, not from row identity. The owner's own reasoning is *"top-row vertical space
is more limited"*, which is a statement about clearance; row identity is a proxy for it that stops
being true the moment `LEVELS` changes (§13.3 item 4 already says `LEVELS` must become per-wall
data). The height is already in hand — `CatalogBodySize.heightM` — so nothing new is plumbed.
`LEVELS` gives 700 mm for the middle row and 400 mm for the top row (`void-engine.ts:13-17`), so a
threshold between them reproduces the owner's rule exactly and keeps reproducing it if a row moves.
Recorded as ADR 0047.

**Work item.** Replace the constant with a function of the requested height; keep the seeded
`openShelf(0.6, 0.33, 2)` call in `buildKitchen()` literal so M1's parity gate is untouched.

**Acceptance criteria.**
1. An `open-shelf` built at the middle row's 700 mm has 2 inner shelves (3 compartments); at the top
   row's 400 mm it has 1 (2 compartments).
2. The threshold is a named exported constant with a boundary test on each side of it, at the
   millimetre.
3. The count never goes below 1 and never exceeds 2 within 300–700 mm, and a height at §4's
   `MIN_SPAN_M` floor still produces a buildable body.
4. Every interior shelf lies strictly between `shelf_bottom` and `shelf_top`, with board **centres**
   evenly spaced (`H·i/(N+1)`) — asserted on measured y, so a wrong divisor cannot pass. This is a
   guarantee about board centres, not about equal clear compartment heights; see ADR 0047's
   2026-09-01 correction for the ~9 mm end-compartment shortfall this leaves and why it stands.
5. M1 parity: `buildKitchen()` unchanged.

**Files.** `packages/three-adapter/src/catalog-bodies.ts`, `packages/three-adapter/src/kitchen-parts.ts` (2).
**Review tier: Light**, plus visual.

**Risk.** Low. One caveat worth stating: the report says *3 shelves*, and the builder produces 4
boards / 3 compartments. The ADR fixes the vocabulary as **compartments**, so the acceptance
criteria cannot be satisfied by an off-by-one reading of the owner's words.

---

### Wave 5B3 — the run-end panel follows the run it closes

**Verified.** `end_panel_right` is built at `kitchen-parts.ts:1700-1707` as
`box(TH, 0.82, 0.6, M.oak, "end_panel_right")` placed at `x = 3.51` — 10 mm right of the seeded
base run's right edge (3.20 + 0.60/2 = 3.50), **baked at build time**. (ADR 0045's 2026-09-01
correction: the formula was previously misstated as `+ TH/2`, which does not reproduce the shipped
number.) It is one of the five names in the shell
manifest (`packages/three-adapter/src/kitchen-shell.ts:9-14`), so `syncSolidBodies` never touches
it: it is shell, not a customer body. Nothing recomputes its X, which is exactly the report's
"floating panel detached from the cabinet".

`end_panel` is a declared `layoutRole` in `docs/CONFIGURATION_MODEL.md:116` and
`docs/ARCHITECTURE_PROPOSAL.md:287`, so this is part of the product model rather than scene dressing.

**Owner decision 3, 2026-09-01, verbatim:** the panel should *"follow the cabinets during resizing…
and if cabinet is removed (the right one) put the panel on the right of the remained cabinet if
possible"*, and it is hidden when the wall has no base cabinets. Recorded as ADR 0045.

**This overrides the conserved-run reading**, and the override is the point: ADR 0031 conserves a
run's total, so a shrink leaves the vacated space still *belonging* to the run, and on that reading
the panel should hold the run's nominal end. The owner's rule is that **what is on screen governs** —
the panel closes the last cabinet, not the run's bookkeeping extent.

**The `db9c402` concern, addressed rather than waved past.** That commit made the shell's state
independent of the loaded design, because a shell that inferred its *membership* from placement
records could reconstruct a body the customer had deleted, as an untagged and unselectable ghost.
What this wave adds is narrower in a way that is checkable, not merely smaller:

- The panel's **existence** stays a fixed manifest entry. No record can create it and no record can
  delete it. Only its `position.x` and its `visible` flag are derived.
- Deriving `visible` from "wall A has at least one `band === 'base'` record" is a **projection of the
  current record set onto a boolean**, which cannot resurrect anything: the failure mode `db9c402`
  fixed was a *body* surviving its own deletion, and a hidden panel is not a body.
- The acceptance criteria below include the `db9c402` anti-invariant directly, so the check is a
  test rather than an argument.

**Work items.**
1. Derive the panel's along-wall X from the right-most wall-A base placement's right edge, on every
   derivation, not only at build.
2. Hide it when wall A has no base placement; show it again when one returns.
3. Keep the seat (z), height, depth, material and manifest membership exactly as they are.

**Acceptance criteria.**
1. Shrinking the right-most wall-A base column by 50 mm moves the panel left by exactly 50 mm.
2. Deleting the right-most wall-A base cabinet moves the panel to the right edge of the new
   right-most one. Deleting the last of them hides it.
3. Re-inserting a base cabinet at the right shows it again at the new right edge.
4. **Anti-invariant (`db9c402`):** after deleting every wall-A base placement, the scene contains no
   mesh tagged with a removed `placementId`, and `end_panel_right` is present-but-hidden rather than
   removed or re-parented. A design loaded fresh with zero base placements renders the same scene as
   one that reached that state by deletion — one document, one picture.
5. The panel is never **selected** and never carries a `placementId` (§6.1 picking is unchanged). A
   tap on the panel itself is not required to open nothing — it falls through to whatever stands
   behind it, exactly as any other unselectable geometry does under §6.1's raycast. See *Verified by
   visual review* below for what this reads as in practice.
6. M1 parity: at the seeded design the panel stands at x = 3.51 as before, to 1e-6 m.

**Files.** `packages/three-adapter/src/kitchen-shell.ts`, `packages/three-adapter/src/scene-sync.ts`,
`packages/three-adapter/src/kitchen-parts.ts` (3).

**Review tier: Full.** It is adapter wiring by volume, but it re-crosses the seam `db9c402` closed,
and that commit is the reason the tier is not Light. Visual review required.

**Risk.** Medium, and it is criterion 4. Wave 5B3's QA must attack the load-versus-mutate
equivalence specifically, because that is the class of bug `db9c402` shipped and fixed.

**Complete, 2026-09-01.** Implemented, adversarial QA green, clean-code and product-logic review
applied, and visual verification run against the running app.

**Verified by visual review, 2026-09-01.** The authored 1 mm gap between the panel and the run's
right-most cabinet holds at **exactly 1.000 mm at every position measured**, read off rendered world
geometry rather than asserted from the formula: seeded 3.510 mm; shrunk 50 mm → 3.460; shrunk
100 mm → 3.410; and the four re-seats down the run at 2.910 / 2.310 / 1.710 / 0.910. The panel's
Y span `[0, 0.820]` did not move at any of those positions.

The owner's veto rule (2026-09-01: the panel hides once nothing base stands on the wall it closes)
was verified through the UI: inserting a `tall-pantry-600` at the run's end hides the panel entirely
— no rendered box, and 15 pixel probes across five heights including floor level found no oak.

**Two caveats, recorded rather than smoothed over.** The hide-on-last-cabinet state is
**unreachable through the UI** in the seeded design, because the last wall-A base body is the corner
unit and its panel renders no remove control — it was verified through the app's own save/hydrate
path instead, not through a click sequence. And a `setWidth` resizes the **whole column**, so a plain
resize is a weaker discriminator for the x-only-veto bug than it first appears — a resize that moved
only x with the y-membership check absent would still look correct. The state that actually
discriminates is deleting `p4` alone, leaving `p14`/`p20` spanning the new seat in x while hanging
above it in y (they never touch the base row's height band). That passed.

**Expected, not a defect — worth stating so a later manual tester finds the answer instead of filing
it.** After a shrink, the panel moves left with the cabinet it closes and ends up standing **inside**
the void the shrink just opened, so the customer sees an empty slot to the *right* of a finished end
panel — looking, at a glance, like the panel is misplaced or floating in open space. It is correct
under ADR 0045: the panel follows the last cabinet's actual right edge, not the run's conserved
bookkeeping extent, and an empty column to its right is exactly what a shrink is supposed to leave
behind (ADR 0043). If this is reported again, it is this paragraph's answer, not a regression.

---

### Wave 5B5 — a fixed-width cabinet says why it has no width control

**The reported cause is not the cause, and this is the wave's main finding.** The report reasons:
*"the resize-controls-rendering logic is keying off placement context (e.g. former tall-column slot)
rather than the corp's own resizable flag."* It is not. Verified by reading every step of the path:

- `describePanel` / `use-panel-view.ts:146-158` asks `columnWidthChoices` and renders nothing when it
  answers `undefined`. Both width queries do the same — `queries/width-options.ts:76` and
  `queries/width-steps.ts:56`.
- `columnWidthChoices` (`packages/configurator-domain/src/commands/set-width.ts:170-190`) answers
  `undefined` when `resolveResizableBody` refuses.
- `resolveResizableBody` (`packages/configurator-domain/src/commands/resolve-column-members.ts:27-42`)
  refuses `NOT_RESIZABLE` when `record.fixedWidth` is true.
- The body in the screenshot is *Corp plită și 2 sertare* = `base-hob-2drawer`, built by `hobBase`
  (`packages/configurator-domain/src/catalog.ts:391-400`), which sets `fixedWidth: true` and
  `widthFlex: [600]`.

Nothing anywhere reads the slot the body was inserted into. **The cabinet the owner chose is a
600 mm-only cabinet by [ADR 0027](../decisions/0027-the-hob-is-part-of-the-cabinet.md)**: the hob is
part of the body and `builders.cooktop()` is a fixed 590 × 520 plate, so the carcass under it is the
one width that appliance is made for. The owner's premise — *"If I choose a resizable cabinet it
doesn't matter where I insert it"* — is already true; they chose a non-resizable one.

**What is nonetheless a real defect: the silence.** §13.1's *"Disable, don't warn"* and
[ADR 0032](../decisions/0032-an-entry-that-does-not-fit-is-shown-disabled-with-its-reason.md) both
say an unavailable thing is **shown disabled with its reason**, never removed. `NOT_RESIZABLE` is a
refusal the engine already produces and already has a sentence for — and the panel throws it away.
So the customer gets a vanished section and no explanation, which is exactly what the report
describes and exactly what those two records forbid.

The suppression is **deliberate**, and its reasoning is written into `set-width.ts:178-182`:
publishing chips for a `fixedWidth` body *"would leave §9's flag as the only thing standing between
the customer and a section of dead controls."* Overturning a written decision needs the owner, so it
was put to them.

**Answered 2026-09-01: show the section, disabled, with the reason.** The owner's grounds: the
silence is what made it read as a defect during testing, and every other blocked control in this
product already shows disabled-with-reason. Recorded as
[ADR 0049](../decisions/0049-a-fixed-width-cabinet-shows-its-width-section-disabled.md). **This wave
is no longer blocked and may be dispatched.**

**Work item.** Render the width section for a `fixedWidth` body as a
single `active` chip at its one width, with the engine's own `NOT_RESIZABLE` sentence, through the
same `renderRejection` path a blocked chip already uses. Do **not** loosen
`resolveResizableBody` — one author for "may this be resized" is what ADRs 0016, 0017 and 0029 each
cost a wave to establish.

**Acceptance criteria.**
1. Selecting a `base-hob-2drawer` renders a `LĂȚIME` section with exactly one chip, at 600 mm,
   `active`, carrying a reason.
2. Clicking it changes nothing and produces no rejection banner.
3. `setWidth` still refuses `NOT_RESIZABLE` for the same body — the command is unchanged.
4. A body that resolves **no** width set at all still renders **no** section. That is finding R2.7's
   load-bearing case (`set-width.ts`'s own note): missing catalogue data must keep failing loudly,
   and this change must not convert it into a chipless section.
5. Criterion 4 has an anti-invariant test, not just an assertion of the happy path.

**Files.** `packages/configurator-domain/src/commands/set-width.ts`,
`apps/web/src/panel/panel-model.ts`, `apps/web/src/panel/use-panel-view.ts`,
`packages/configurator-domain/src/queries/width-options.ts`,
`packages/configurator-domain/src/queries/width-steps.ts` (5 — at the limit; do not add a sixth).

**Review tier: Full** — it changes a panel contract that four ADRs have already corrected once each.

**Risk.** Low mechanically, medium in scope creep. Criterion 4 is the guard.

**Complete, 2026-09-01.** Implemented, adversarial QA green, clean-code and product-logic review
applied.

**What shipped.** A `fixedWidth` body now publishes its one width carrying the engine's own
`NOT_RESIZABLE` sentence, rendered as a single disabled chip through the same `renderRejection` path
a blocked chip already used — no new rendering rule. The `meta.canWidth` gate is gone from
`collectOfferedSections`, so the domain's published width options are now the **sole** author of
whether the LĂȚIME section exists at all; the panel no longer has a second opinion.

**A design point the logic review made and is worth keeping.** `canWidth` and
`columnWidthChoices` were two independent derivations of the same underlying fact
(`record.fixedWidth`), consistent only by coincidence rather than by construction. Collapsing them
into one **narrows** authority over the panel contract rather than widening it — one function
answers "does this section exist and what does it show", not two that happened to agree until now.

**`resolveResizableBody` now publishes `cause: "fixed" | "unresolvable"`.** `unresolvable` wins when
a row is both — a row that is fixed-width **and** missing its width data would otherwise leak an
internal `kind` string to the customer through the fixed-width path, which is criterion 4's guard.

---

### Wave 5B8 — the pantry column is the one resizable column

**Owner's proposal (report item 8), and it is a scope change, not a defect.** The tall double-door
column with no appliance inside should be the only resizable column type, min 400 / max 800;
400–499 mm becomes a 1-door version, 500–800 keeps 2 doors.

**The door-count half needs no new catalogue entry, and the report's assumption that it does is
wrong.** `TWO_DOOR_MIN_WIDTH_MM = 500` (`packages/configurator-domain/src/catalog.ts:113`) and
`deriveDoorCount` (`catalog.ts:651-653`) already implement *"499 and below is one door, 500 and above
is two"* — [ADR 0035](../decisions/0035-width-is-a-bounded-stepper-not-a-menu-of-sizes.md) decision 4,
via [ADR 0033](../decisions/0033-door-count-is-derived-from-width-not-declared.md)'s merge. The owner's
400/500 split **is** the shipped threshold. So the rule is `doorCountFollowsWidth: true` on one
existing row, and the label follows automatically through `describeBodyLabelAt`
(`catalog.ts:672-680`). Adding a variant entry would re-create precisely the split ADR 0033 merged.

**Which row.** `tall-pantry` — *Coloană cămară* — and **only** that one. `tall-oven-tower`,
`tall-fridge-housing` and `fridge-free` keep `fixedWidth: true`, because their contents are
appliances at fixed sizes; that is the owner's own stated reasoning. Recorded as ADR 0048.

**The real cost is in the adapter.** `fullHeightUnit` (`catalog.ts:420-430`) declares
`widthFlex: COLUMN_WIDTHS_MM` = `[600]` and `fixedWidth: true`, and the builder
(`kitchen-parts.ts:880-...`) is a **zero-argument** `Builders` entry with `W = 0.6` and a two-door
band layout hardcoded. `catalog-bodies.ts:107` calls it as `(kit) => kit.builders["tall-pantry"]()`,
discarding the requested size entirely. So this wave adds a width-parameterised factory and leaves
the zero-argument builder in place for the seeded kitchen.

**Work items.**
1. `make.tallPantry(widthM, doors)` in `Factories`, with the door bands derived from the width the
   way `wallCabinet` already derives them.
2. `Builders["tall-pantry"]` delegates to it at `(0.6, 2)` — the seeded geometry must not move.
3. `catalog-bodies.ts`: the `tall-pantry` arm passes `size.widthM` and `doorsFor(size)`.
4. `catalog.ts`: `tall-pantry` takes `cabinetryWidths({ minMm: 400, maxMm: 800 })`,
   `fixedWidth: false`, `doorCountFollowsWidth: true`; the other three full-height rows are
   untouched.

**Answered by the owner, 2026-09-01: same height, same shelf pitch.** A 400 mm pantry is a narrower
version of the same cabinet — full height, identical shelf pitch, fewer things side by side. There is
**no second geometry rule** for the narrow end. Recorded in ADR 0048, and criterion 6 below asserts
it: at 400 mm the shelves sit at the same y coordinates as at 600 mm and only their x extent changes.

**Acceptance criteria.**
1. `tall-pantry` at 400 builds one door; at 499 one; at 500 two; at 800 two. Boundary tests at
   399/400 and 499/500 and 800/801.
2. The offer label reads *Coloană cămară 1 ușă* / *2 uși* at those widths, from `describeBodyLabelAt`
   and nowhere else.
3. Its width section is a **stepper**, not chips — `widthRangesMm` has `minMm < maxMm`, which is
   ADR 0035 decision 3's discriminator.
4. `tall-oven-tower`, `tall-fridge-housing` and `fridge-free` are never **built** at an opening's own
   width — only at their declared fixed size, centred — with the millimetres in the message on the
   openings they do refuse (§11 row 5). **Correction, 2026-09-01 (adversarial QA on 5B8):** the
   original wording — that these three "still refuse every width but their own" — is false of the
   insert path. An oven tower inserted into a 650, 700 or 800 mm opening is **accepted** and built at
   600 mm, centred; only openings narrower than 600 mm refuse. The invariant that actually holds, and
   that the tests measure, is that the built body never takes the opening's width.
5. A resized pantry's carcass, doors and plinth all take the new width: no mesh keeps 600. Asserted
   on measured bounds at three widths, not on the builder's arguments.
6. Height stays `COLUMN_HEIGHT_MM` = 2200, `occupiedDepth` is unchanged, **and every distinct
   horizontal line in the built body — each mesh's min and max y — is identical at 400, 600 and
   800 mm**, only x extent changing. **Correction, 2026-09-01 (adversarial QA on 5B8):** the original
   wording, "every shelf sits at the same y coordinate," is unfalsifiable — `tallPantry` builds no
   shelves; its tree is plinth, carcass shell, back, front liner and door slabs. What this criterion
   actually measures, and what QA confirmed bites (re-pitching the door bands below 500 mm turns it
   red), is the door-band and carcass y-geometry, not shelves. See ADR 0048's 2026-09-01 correction:
   if the pantry ever gains an interior, its implementer must add the shelf y-coordinate assertion
   the owner's rule actually names, in the same change that adds the shelves.
7. M1 parity: the seeded pantry is byte-identical.
8. `catalog.test.ts`'s existing guard — that no row keeps an inherited bound it did not mean —
   still passes.

**Files.** `packages/configurator-domain/src/catalog.ts`,
`packages/three-adapter/src/kitchen-parts.ts`, `packages/three-adapter/src/catalog-bodies.ts` (3).

**Review tier: Full** — a catalogue bound is domain algebra, and §11 rows 5 and 20 are in range.

**Risk.** Medium. The pantry's door-band layout is hand-tuned at 600; at 400 with one door it is a
new proportion, and criterion 5 is what stops it being faked by scaling a finished group — which
M3's Risks section names explicitly as the thing not to do. **Q3** in *Open questions* is the one
product detail this wave cannot answer for itself.

**Complete, 2026-09-01.** Implemented, adversarial QA (all four actionable findings fixed), clean-code
review and product-logic review all applied. Verified: domain 1214, persistence 177, three-adapter
1208, web 714 (+4 skipped); `pnpm ci:local` passed every gate; M1 structural parity 73 + 31 = 104 at
1e-6 m.

**Clean-code review: no actionable defects.** One non-blocking note carried forward rather than
fixed: the `doors===1/doors===2` leaf pattern is now written a third time (`kitchen-parts.ts:750`,
`:1411`, `:1772`) — the count went from two to three this wave.

**Product-logic review: matches intent, minor concerns, no blocker.** It independently re-derived
every census delta and all of them reconciled exactly. Its two findings are already fixed, not left
open — see the 2026-09-01 corrections above (criterion 4's insert-path wording, and criterion 6's
door-band/carcass reading in place of the unfalsifiable shelf claim).

**Criteria met by unit test rather than by rendering, and said so rather than claimed as visually
verified.** Visual verification (`docs/best-practices/browser-and-visual-qa.md`) passed all six
criteria, but two things were never on screen and the reviewer made no claim about either:

- **Criterion 1's 700/800 mm boundary and criterion 5's widest measured bounds** were not seen live.
  700/800 mm pantry geometry is unreachable in the seeded kitchen — wall B has no free space on
  either side, and an emptied column stays a 600 mm column — so only 400–600 mm was observed
  rendered. 700 and 800 mm stay proven by the unit-level bounds assertions only.
- **The back inset** is not visible from any camera preset and is likewise unit-pinned only, not
  rendered.

What *was* rendered: the door-count flip observed live at exactly 500 mm (criterion 1's shipped
threshold), the door shadow gap holding constant at 1 px across 500/550/600 mm and the plinth band
staying 13 px tall at identical y across all four widths tested — the fittings are unstretched, which
is criterion 5's live half. The mobile 390×844 gate passed (buttons 132×44 mm).

---

### Wave 5B2 — an empty space survives a reload

**Verified defect.** `Design` carries `placements` and nothing else
(`packages/configurator-domain/src/design.ts`, `DesignSchema`). At load,
`deriveGeometry` (`apps/web/src/store/configurator-store.ts:259-264`) calls `deriveColumns(records)`,
which groups **placements** by column key and throws on a member-less column
(`packages/configurator-domain/src/void-engine.ts:425-428`). So an empty column cannot exist at
load. In-session it survives only because the frozen map is carried forward
(`apps/web/src/store/apply-command-result.ts:109`, `resolveColumns`), and the frozen map is not
persisted.

Measured consequence, by reading: shrink a 600 mm column to 450, and `set-width.ts` creates a
150 mm empty column in the frozen map; save; reload; `deriveColumns` sees one 450 mm placement and
derives one 450 mm column. **The 150 mm is gone and the shrink is permanent.** This is also the
second candidate cause for report item 6.

**Two options were identified. Recommendation: option A — persist the empty columns.**

| | A — persist `emptyColumns` on the document | B — synthesise at load from unoccupied spans |
| --- | --- | --- |
| Cost | One optional array on `DesignSchema`. ADR 0038 makes it free: nothing has ever been stored, so no migration and no version bump. | No schema change at all. |
| `top` and `regions` | Stored, so a fully cleared column keeps the opening it freed. | **Cannot be recovered.** A fully cleared column has no member anywhere, so nothing in the document says how tall it was. |
| Failure mode | A stale array must be reconciled against the placements at load. | §10's signature flow breaks: clear the fridge column, reload, and its 2600 mm opening comes back as whatever the neighbours' `top` suggests. |
| Relation to ADR 0011 Gap D | Persists exactly what Gap D freezes. | Contradicts Gap D — it re-derives an extent from current state, which is the thing Gap D exists to prevent. |

Option B fails on the `top` row, and it fails on the case §10 calls the signature flow. It is not a
cheaper version of A; it is a different and weaker rule. **A is chosen**, recorded as ADR 0044.

#### The split, settled by reading the delete path — 2026-09-01

The plan asked whether the delete path drags `remove-placement.ts` in. **It does not, and no command
file is touched at all.** `removePlacement` (`commands/remove-placement.ts`) takes
`{ design, catalog, target, occurredAt }` — **it never sees the frozen map**. It re-derives records
from the pre-removal design and returns `withPlacements(...)`. It therefore cannot write the vacated
column's `top`, `regions` or `d`: the only values it could compute are re-derivations from current
state, which is ADR 0011 Gap D's forbidden move verbatim. A column emptied by an *earlier* delete
has no member in the pre-removal records either, so the command could not even see it.

The authoritative frozen map lives at one seam — `applyCommandResult` / `resolveColumns`
(`apply-command-result.ts:69-112`) — and the resize already publishes its answer into it through
`effect.columns`. **So the write-back is a single projection at that seam: the member-less columns
of the resolved map, written onto the design as `emptyColumns`.** That covers delete, resize, insert
and every future effect uniformly, and it makes acceptance criterion 4 an invariant by construction
rather than per-command bookkeeping. `set-width.ts` is off the file list too: `moveFrozenColumns`
already produces the moved map and it reaches the projection through `effect.columns`.

**The wave still splits, but re-cut.** Not along "does delete need a command file" — it does not —
but along the document contract versus the write seam, because the first is testable entirely
against hand-built documents with no store in the picture, and the second is the only half that can
regress a live session.

**5B2a — the document contract.** A document *may* carry `emptyColumns`; the load honours them; both
seams refuse a bad one. Nothing writes them yet, so app behaviour is unchanged.

- `packages/configurator-domain/src/design.ts` — `emptyColumns?: EmptyColumn[]`, capped.
- `packages/configurator-domain/src/design-bounds.ts` — `MAX_EMPTY_COLUMNS`, `MAX_EMPTY_COLUMN_BYTES`,
  and `MAX_DESIGN_BYTES` re-derived (see *The cap* below).
- `packages/configurator-domain/src/void-engine.ts` — `deriveColumns` adds the stored entries after
  grouping the placements; the member-less-**placement**-column throw stays, it is a real invariant.
- `packages/configurator-domain/src/validate-design.ts` — the overlap refusal.

(4 files. Criteria 2, 5, 6, 7 land here, and criteria 1 and 3's deserialise half.)

**5B2b — the write seam.** The projection, and the store call that uses it.

- `packages/configurator-domain/src/void-engine.ts` — `projectEmptyColumns(columns, records)`, pure,
  domain-owned: the columns of `columns` with no member in `records`, as wire entries.
- `apps/web/src/store/apply-command-result.ts` — the projection applied to `result.design` inside the
  one `set()`, beside `resolveColumns`.

(2 files. Criteria 1, 3, 4 land here.)

**Three requirements added to this brief, 2026-09-01, each with its reason:**

1. **`projectEmptyColumns` must refuse a sub-millimetre centre, never round it.** Rounding collapses
   two distinct map keys into one, and 5B2a's `EMPTY_COLUMN_KEY_COLLIDES_WITH_EMPTY_COLUMN` /
   `EMPTY_COLUMN_KEY_COLLIDES_WITH_PLACEMENT` refusals then reject the very document the projection
   itself produced — the write seam would be refusing its own honest output.
2. **The projection must guarantee key uniqueness itself, not rely on validation to catch it.**
   5B2a deleted the silent-drop branch that `deriveColumns` used to have, which reverses the
   direction of the failure: a stored `emptyColumns` entry now **overwrites** the placements'
   column at derivation rather than being dropped. `deriveColumns` is pure with no validator inside
   it, and commands do not validate, so 5B2b must not derive `emptyColumns` from an unvalidated
   `result.design` — the projection has to be correct by construction, not merely checked afterwards.
3. **`regions` has a second consumer this wave must account for.** `commands/insert-fit.ts:632`,
   `resolveSnapY0M`, feeds every region start into the snap-candidate list. It is probably inert —
   `LEVELS` starts are 0, 1.5 and 2.2, and `minY` is always a candidate — but 5B2b must **prove**
   that rather than assume it: a restored column offers fewer snap candidates than an in-session one
   (one region instead of several), and that is exactly the gap criterion 4's sweep exists to catch.

**Dispatch 5B2a first; 5B2b needs its schema.** A design carrying `emptyColumns` that the document
contract has not yet bounded is the DOM-001 shape exactly, and that ordering is the whole reason
for the cut.

**5B2a — complete, 2026-09-01.** Implemented, adversarial QA (every mutant killed, none survived),
clean-code review (no actionable defects), product-logic review (minor concerns, no blocker) and
security review (safe to commit, reconfirmed after the cap changed) all applied. Domain suite 1276
passed, deterministic across repeated runs; `pnpm ci:local` all gates PASS. Criterion by criterion:
met are 2, 5, 6 and 7, plus the deserialise half of criteria 1 and 3 (the write half is 5B2b's).
Criterion 5's write seam is proven through `validateDesignForCatalog` directly rather than through
`api/designs/[id]/route.ts` — one real seam and one stand-in; 5B2b is what closes that gap.
Criteria 3 and 4 were also **corrected** on 2026-09-01 — see their amended wording below; the reason
is stated in the criteria themselves. **No visual verification for this half**: the wave is confined
to `configurator-domain`, which has no rendering surface; that belongs to 5B2b.

A shared `findContainmentBreaches` helper, added while implementing criterion 3's overlap refusal,
exposed that **the placement path had only refusal tests and no acceptance boundary** — loosening
`>` to `>=` would have gone red for empty columns and stayed green for bodies. A pre-existing gap in
a shipped rule, closed by six new sweeps rather than left as this wave's problem alone.

**5B2b — complete, 2026-09-01. Wave 5B2 is now closed in full.** Implemented, adversarial QA
(12+ mutants, all killed), clean-code review (no actionable defects), and product-logic review
(matches intent, no blocker) all applied. `projectEmptyColumns` (pure, `void-engine.ts`) and
`withEmptyColumns` (`apps/web/src/store/apply-command-result.ts`), wired into
`configurator-store.ts:262` as `design.emptyColumns`. Domain 1304, web 746 (+4 skipped);
`pnpm ci:local` all gates PASS.

**The blocker QA found and the developer fixed, recorded because it is the wave's real lesson, not
a footnote.** `void-engine.ts` had claimed `UnprojectableColumnError` was unreachable because
`refuseFractionalCentres` refused any centre that was not a whole millimetre. That guard inspected
only the **members'** centres. The members' centre and the empty column's centre are two different
expressions — members: `extent.centreMm + (requested − extent.widthMm)/2` (integral iff the delta
is even); the empty column: `extent.centreMm + requested/2` (integral iff the extent's own centre
is) — and they decouple whenever the extent's width is odd, which `resolveColumnExtent` can produce
from the union of the members' edges. Two 600 mm bodies at `alongMm` 1000 and 1001 pass both the
schema and `validateDesignForCatalog`; `setWidth(600)` then threw `UnprojectableColumnError`
straight out of the width stepper, uncaught. **5B2b is what turned a silent oddity into a live
crash — not because 5B2b introduced it, but because it is the first thing that reads that centre and
must succeed.** Two premises failed: that the guard covered every centre a move writes, and that all
widths are multiples of 50 mm — the shipped fixture already has `p26` at 320 mm and `p9`/`p21` at
570 mm. **Fixed** by extending the guard to every centre a move writes (members plus both frozen
moves), refusing `NON_INTEGER_MILLIMETRES` with `field: "centreMm"` before the projection ever runs.

**QA then swept the other four projected fields.** `top`, `d`, `y0` and `w` are **not** reachable as
fractional values, for a structural reason rather than luck: the centre had a second expression to
disagree with itself against; these four have none, and `moveFrozenColumns` passes them through
untouched. So two of five projected fields are guarded (`alongMm` by the extended guard, `widthMm`
coupled to it) and three merely hold by construction — a swept assertion now checks all five fields
on every column in the map, on every mutation sequence.

**Visual evidence.** §10's signature flow was re-verified with `topMm: 2600` read from the **stored**
document, not inferred — the neighbouring columns top at 2200, so 2600 could only have come from the
persisted value. Verified at 390×844 under real touch. **Not verified:** the desktop rail and the
wall-A columns, and insert-after-reload snapping.

**Work items.**
1. (5B2a) `DesignSchema` gains `emptyColumns?: EmptyColumn[]` — wall, along-wall centre, width,
   `y0`/`top`, depth — in whole millimetres, bounded like every other coordinate (DOM-001), and the
   array capped.
2. (5B2a) `deriveColumns` gains the stored empty columns after grouping the placements, still
   throwing for a **placement**-derived column with no members.
3. (5B2a) `validateDesignForCatalog` rejects an empty column that overlaps a placement or another
   empty column, at both seams — the ADR 0038 / DOM-001 lesson is that a new field with no
   validation is a new way to store a document the domain cannot execute.
4. (5B2a) `MAX_DESIGN_BYTES` is re-derived to admit a document at the new cap. It is
   `MAX_PLACEMENTS × MAX_PLACEMENT_BYTES + envelope` today, so without this SEC-002's byte cap
   refuses a document this product can legally produce.
5. (5B2b) One projection at the store seam writes the member-less columns of the resolved map back
   onto the design. No command file changes.

#### The cap

**`MAX_EMPTY_COLUMNS = 684`**, derived and not chosen, in `design-bounds.ts`:

`(floor(MAX_ROOM_WIDTH_MM / WIDTH_STEP_MM) + floor(MAX_ROOM_DEPTH_MM / WIDTH_STEP_MM)) × LEVELS.length`
`= (floor(6300/50) + floor(5100/50)) × 3 = (126 + 102) × 3 = 684`.

The divisor is `WIDTH_STEP_MM` (50, `catalog.ts:41`), **not** `NARROWEST_CATALOG_WIDTH_MM` (200,
which `MAX_PLACEMENTS` uses). An empty column is not a cabinet: ADR 0043 removed its width floor,
and ADR 0035's stepper means the narrowest strip any command can leave behind is one 50 mm step. So
`MAX_PLACEMENTS` is the wrong bound and reusing it would refuse a legal document.

**Enforced at the schema** (`design.ts`, `.max(MAX_EMPTY_COLUMNS)`), which is the one gate **both**
seams already pass through — the API route parses `DesignSchema` and `migrateFromV1`
(`migrate-design.ts:9-18`) parses the same schema on load. It is deliberately not re-checked at the
write and load seams separately; what those gain is the *semantic* half, the overlap rule in
`validateDesignForCatalog`, which both already call.

**Two consequences the cap must carry, or it is decoration:**

- `MAX_DESIGN_BYTES` grows by `MAX_EMPTY_COLUMNS × MAX_EMPTY_COLUMN_BYTES` (128 — a wall enum, five
  five-digit millimetre values and JSON punctuation, rounded up as `MAX_PLACEMENT_BYTES` is). Work
  item 4.
- The overlap check is over **sorted intervals per (wall, row band)**, not a nested scan. Naive it is
  `O(E × P)` = 684 × 168 ≈ 115k comparisons on every write and every load; sorted it is
  `O((E+P) log(E+P))` and the cap then genuinely bounds derivation rather than merely bounding the
  document.

#### Acceptance criteria, each with the mutation that must make it red

A criterion no mutation can fail is vacuous. Each is stated with its mutant; QA's brief is to apply
the mutant and see red before accepting green.

| | Criterion | The mutation that must make it red |
| --- | --- | --- |
| 1 | Shrink 600 → 450, serialise, deserialise: a 150 mm empty column exists **at the same along-wall centre in millimetres** (asserted as a number, not as presence), and `+50` from there is accepted *and lands the body at the same coordinate the in-session `+50` would*. | Projection returns `[]`. **And**: projection emits the entry at the resized column's centre instead of the empty column's own — presence-only would survive this. **And**: `deriveColumns` adds the entry with a default `w` — the `+50` half is what catches it. |
| 2 | Delete a whole column, serialise, deserialise: §10's signature flow still yields three level slots with `spanH = 2.6`. **The fixture's neighbouring columns must have `top ≠ 2600`** (e.g. a base run at 900), so a neighbour-derived answer gives one slot, not three. | `top` dropped from the wire entry and defaulted to `max(neighbour.top)` — option B's failure mode, made a mutant. **And**: `regions` stored as `[]` rather than the frozen extent's, which changes where the freed opening starts. Without the `top ≠ 2600` neighbour this criterion is vacuous, because the seeded neighbours *are* 2600 and the heuristic would pass. |
| 3 | **Corrected 2026-09-01.** `deserialise(serialise(d))` produces a column map equal to `d`'s on the **observable** fields — `key`, `wall`, `x`/`z`, `w`, `d`, `ry`, `top`, and `min(regions[].start)` — for a design reached by delete, by shrink, and by delete-then-shrink. Not deep equality of `regions` including order: ADR 0044's wire shape stores one region per empty column (`y0Mm`/`topMm`), which makes full `regions` equality **unsatisfiable by construction** — a column cleared of two stacked bodies is `[[0,0.82],[1.5,2.2]]` in session and `[[0,2.6]]` restored, two different and both-correct representations of the same free space. `deriveFreeSpans` (`void-engine.ts:692-705`) itself reads only `min(regions[].start)` and `top`, so comparing the full array would fail on a difference the domain never acts on. | Any single *observable* field perturbed on the wire entry, one mutant per field; `d` defaulted from a neighbour; `min(regions[].start)` recomputed from the wrong region. A key-set or width-only comparison survives all of these, so the criterion is this narrower equality or it is nothing. |
| 4 | **One document, one picture.** For a swept sequence of ≥ 8 interleaved deletes, shrinks and inserts, the in-session `voids`, plus each column's `key`, `wall`, `x`/`z`, `w`, `d`, `ry`, `top` and `min(regions[].start)`, equal those of `deriveGeometry(DesignSchema.parse(JSON.parse(JSON.stringify(design))))` — a fresh load **through the wire**, not from the in-memory object. `fast-check` over the mutation sequence, not hand-picked examples. **Corrected 2026-09-01, same reason as criterion 3**: not full `regions` equality — the wire shape cannot reproduce a stacked-occupancy `regions` array, only its `min(start)` and `top`, and those are what `deriveFreeSpans` actually reads. | **The one that matters:** put the projection inside `resolveColumns`' `body_resized` arm only. Every shrink-only example passes; any sweep containing a delete goes red. **And**: `Math.round` on a half-millimetre centre instead of a refusal — drift only accumulates over a long sequence. **And**: drop entries narrower than `NARROWEST_CATALOG_WIDTH_MM` as "tidy-up", which ADR 0043 forbids and which a 150 mm hand-picked example would miss but a 50 mm swept one catches. Going through `JSON.stringify` is load-bearing: comparing against the in-memory design skips the schema and any non-serialisable field passes. |
| 5 | An `emptyColumns` entry overlapping a placement is refused at the **API write seam** (`api/designs/[id]/route.ts:236`) and at the **load seam** (`migrateDesign(1, raw)`), with **different documents** proving each. Two boundary rows are part of it: entries that **abut** (`a.end === b.start`) are **accepted** — ADR 0046 merges them, it does not refuse them — and 1 mm of overlap is refused. A legal document with entries at the same along-coordinate on **different walls** is accepted. | Remove `assertDesignValidForCatalog` from `migrate-design.ts:47` — the load-seam test must go red on its own. **And**: `>` flipped to `>=` in the overlap predicate — the abutting row is the only thing that catches it, and without that row 5B4b's merge input becomes unrepresentable. **And**: `wall` dropped from the predicate — the different-walls row catches it. |
| 6 | A document with **no** `emptyColumns` key parses, and `deriveGeometry` over it yields a column map deep-equal to a **map pinned before this wave** (a committed fixture, not a value this code recomputes). | `.optional()` removed from the field. **And**: `deriveColumns` defaulting the absent array to a synthesised one. A criterion that only asserts "does not throw" is vacuous here — this is the 5B3-criterion-4 shape, where a fresh seeded load produces the right answer under any mutant. The pinned fixture is what makes it falsifiable. |
| 7 | A document with `MAX_EMPTY_COLUMNS + 1` entries fails `DesignSchema` with an issue at path `emptyColumns`, at both seams; **and** a document with exactly `MAX_EMPTY_COLUMNS` entries is accepted **and passes `MAX_DESIGN_BYTES`**. | `.max(...)` removed → the first half red. `MAX_DESIGN_BYTES` left underived → the second half red, which is the half that stops the cap becoming a refusal of legal documents. Note for QA: the projection must never silently truncate to the cap. It cannot exceed it — the cap is the physical bound of the room — so the wave asserts that unreachability rather than adding a runtime branch. |

**Criteria closed, 2026-09-01.** Criteria 1, 3 and 4 are met by 5B2b. Criteria 2, 5, 6 and 7 were
met by 5B2a.

**Criterion 4 carries one exclusion, and it has nothing to do with the fractional-centre blocker
above — the two are unrelated and must not be conflated.** The sweep excludes **partly emptied
column keys**: a column that still *holds members* but whose frozen extent its placements no longer
imply. ADR 0044 persists member-less columns only, so nothing records such a column's frozen extent,
and it diverges on reload. The exclusion is computed by `partiallyEmptiedKeys`, which compares
`state.columns` against `deriveColumns(state.records)`.

An exclusion computed by measurement is the shape of a vacuous criterion, so it was proved rather
than assumed. QA and the logic reviewer each independently established that it is **exactly** the
diverging set, not an approximation of it: `projectEmptyColumns` skips precisely the occupied keys,
so reload answers every occupied key with exactly `deriveColumns(records)` — making *excluded* and
*diverges on reload* the same predicate. `refuseUnreproducibleKey` is what makes the two halves of
`deriveColumns` provably disjoint rather than merely expected to be. And a **member-less column can
never enter the excluded set**, because the exclusion is a subset of `deriveColumns(records)`'
keys — the occupied ones — so the exclusion cannot absorb a projection bug. Four projection mutants
confirmed it: each turned the sweep red rather than being swallowed.

The residual divergence is recorded as backlog 22: it is user-visible, it predates this wave, and
closing it means widening ADR 0044 from member-less columns to the whole frozen map, which is an
ADR-level decision rather than a wave amendment.

**Files.** 5B2a: `design.ts`, `design-bounds.ts`, `void-engine.ts`, `validate-design.ts`.
5B2b: `void-engine.ts`, `apps/web/src/store/apply-command-result.ts`.

**Review tier: Full**, both halves. **Security review is triggered — on 5B2a, not only on 5B2b.**
The plan previously located it at the write seam; the schema bound, both validation seams and
`MAX_DESIGN_BYTES` (SEC-002) are all in 5B2a, so that is where the hostile-document surface actually
is. 5B2b is Full tier for the store-seam regression risk.

**Risk.** 5B2a medium-high, and it is criterion 5 — a new document field that reaches a derivation is
the DOM-001 shape, and DOM-001 was a High. 5B2b medium: one seam, but it is the seam every command
passes through.

**What the decision sweep turned up (2026-09-01).**

- **Q5 widens a third time, and 5B2 is not its cause.** A shrink can release width with no ceiling
  (measured at 900 mm). Today that oversized empty column evaporates on reload; after this wave it
  **survives**. Same open question, now durable. 5B2 does not close it and must not be read as
  causing it — this is in QA's brief for both halves so a >800 mm persisted empty column is not
  filed as a regression.
- **ADR 0046's 800 mm merge cap does not conflict with a persisted empty column**, and it is a
  different cap from criterion 7's — 800 mm bounds one merged *span*, 684 bounds the *array length*.
  One ordering constraint falls out for 5B4b and 5B2b must leave room for it: `projectEmptyColumns`
  takes the frozen map **as an argument**, so whichever map 5B4b makes canonical — pre- or
  post-merge — flows through without reopening the write seam. ADR 0046 makes the merge a
  *derivation*, which argues for storing the pre-merge set (storing a merged column stores a derived
  fact, and a later change to the cap would leave documents no code reproduces). Criterion 3's deep
  round-trip catches it either way, since the merge is a fixpoint under the cap. **5B4b's section
  must state which map it projects; 5B2 does not decide it.**
- **ADR 0043** is why the cap divides by `WIDTH_STEP_MM` rather than `NARROWEST_CATALOG_WIDTH_MM`.
  No conflict; the sweep changed the cap's derivation.
- **ADR 0011 Gap D** is what settles the split: the frozen map belongs to the store seam, the resize
  is the one command that publishes into it, and `removePlacement` re-deriving an extent would be
  Gap D reopened. No earlier record places a write-back inside the commands.

---

### Wave 5B4a — an insert splits the column it does not fill

**This is the half that must be built first, and building it alone is the phase's main risk
control.** It is valuable with no merge at all, and it is what makes the merge safe.

**The defect, stated precisely and verified.** `recomputeVoids`
(`packages/configurator-domain/src/void-engine.ts:733-753`) derives a column's free spans from its
members' `[y0, y0+h]` intervals and the column's `top`. **Width is never subtracted.** The function's
own doc comment says so and dates the correction: *"§4 has no horizontal half… So a body narrower
than its column closes the level, and the remainder is stranded — no void, no column, no second
insert."* It is reachable today in four taps with no resize and no merge: clear `A|2.60`, insert a
300 mm bottle cargo into the 600 mm opening, and 300 mm of wall is gone.

**And the width the body takes is centred, which makes the fix harder than it looks.** `insertBody`
takes the placement's `alongMm` from **the target opening's own along-wall coordinate**
(`packages/configurator-domain/src/commands/insert-body.ts:227-229`), and `refuseColumnDrift`
(`insert-body.ts:330-343`) *requires* it to, so the derived key matches the target's. The opening's
coordinate is the column's centre. So a 400 mm body inserted into a 600 mm column sits **centred,
with 100 mm on each side**.

A naive split therefore produces **two** slivers, one per side, on opposite sides of the new body —
which can never be merged back, because they are not adjacent. Under the owner's 800 mm cap and a
50 mm stepper that is the ordinary case, not a corner case, and it would be worse for the customer
than the state the merge is meant to fix.

**So the split has two halves and they are not separable:**

1. **Edge alignment.** A body inserted into a column wider than itself is seated flush against one
   end of the span, not centred. The whole remainder is then one contiguous column on the other side.
2. **The split.** The column becomes the occupied part at the body's own width plus, when the
   remainder exceeds zero, one new empty column carrying the original's frozen `regions`, `top`, `d`
   and `ry`.

Edge alignment changes a persisted coordinate and breaks `refuseColumnDrift`'s current invariant
(the placed body's key is no longer the target opening's), so that guard has to be restated as *the
placed body's key is the key the split planned for it* rather than deleted. **Deleting it is not an
option** — it is ADR 0011 Gap D's phantom-column guard.

**Which edge — answered by the owner, 2026-09-01: the LEFT edge, always.** The lower along-wall
coordinate, unconditionally. One usable gap forms on the right rather than two slivers either side.
The conditional rule this plan proposed — seat against whichever end abuts an occupied column — was
rejected in favour of it: an unconditional edge has no predicate to get wrong and gives the customer
the same result from the same picture every time. Recorded in ADR 0046.

**A shipped behaviour ends, and the owner accepted the cost by name.** `resolveFixedSetWidth`
currently centres a narrower discrete body in a wider opening — *"exactly as `base-dishwasher` has
always put a 600 in a 700"* (`insert-fit.ts:367`). **After this wave `base-dishwasher` no longer
centres in a 700 mm opening**: it sits flush left and the 100 mm becomes a real, selectable opening
on the right. This is criterion 11 below, so it is an assertion rather than something a reviewer
discovers — and a test that still asserts centring is asserting the defect.

**Work items.** Plan the split in the insert path; write both columns into the frozen map; carry
them out on the insert effect; restate `refuseColumnDrift`; seat the body at the chosen edge.

`CommandEffect`'s `body_inserted` arm currently carries no column map, and `resolveColumns`
(`apply-command-result.ts:104-112`) replaces the map only for `body_resized`. One of those two has to
change, and the ADR must say which and why — the existing comment there explains that a store
re-deriving globally would make §10's delete produce no openings at all, so **the command must own
the answer**, exactly as the resize does.

**Acceptance criteria.**
1. Insert a 400 mm body into a 600 mm empty column: afterwards there is one 400 mm occupied column
   and **one** 200 mm empty column, adjacent, on the same wall and row. Not two 100 mm columns.
2. The run total is conserved to the millimetre: the occupied column's outer edge and the empty
   column's far edge are exactly where the original column's two edges were.
3. The 200 mm column publishes an opening at every level the original had free — a column narrower
   than any cabinet still publishes its opening (`void-engine.ts:735-741`), and ADR 0032's rule is
   *disabled with a reason*, never removed.
4. **The four-tap case is cured with no merge in the tree:** clear `A|2.60`, insert a 300 mm bottle
   cargo into the 600 mm opening, and 300 mm of wall is still selectable. This is ADR 0037's
   withdrawal condition, and passing it is the gate on dispatching 5B4b.
5. Inserting a body that fills its column exactly creates **no** empty column and no extra key
   (the exact-to-zero case, as ADR 0031 rule 6 already has it for a resize).
6. Neither new key collides with a live key; a collision refuses the insert rather than clobbering a
   column, reusing `refuseKeyCollision`'s reasoning (`apply-column-moves.ts:95-130`) — writing over
   an occupied key deletes that column's frozen extent outright and `refuseColumnDrift` is blind
   to it.
7. Every centre stays a whole millimetre (§2); an odd remainder refuses rather than rounding.
8. Save and reload after a split reproduces both columns identically. **Requires 5B2.**
9. The four column-identity regressions named in M5's Verification section still pass, and §11 rows
   1, 2, 4, 5, 14, 18, 20 and 23 are re-run.
10. **Anti-invariant:** no sequence of inserts into one span can produce total column width greater
    than the span, and none can lose width. Asserted as a property over a swept sequence.
11. **The left edge, asserted directly.** A 400 mm body into a 600 mm empty column sits at the span's
    lower along-wall coordinate, and the 200 mm empty column is on its right — never the reverse and
    never 100 + 100. Includes the named cost: `base-dishwasher` into a 700 mm opening leaves a 600 mm
    body flush left and a 100 mm empty column on the right, publishing an opening. Any existing test
    asserting the old centring is updated, and the update is called out in the dispatch rather than
    slipped in.

**Files.** `packages/configurator-domain/src/commands/insert-body.ts`,
`packages/configurator-domain/src/commands/insert-fit.ts`,
`packages/configurator-domain/src/commands/command-result.ts`,
`packages/configurator-domain/src/void-engine.ts`,
`apps/web/src/store/apply-command-result.ts` (5 — at the limit).

**Review tier: Full**, with adversarial QA given the ADR 0037 withdrawal as its explicit brief.

**Risk. Highest in the phase, jointly with 5B4b.** It changes a persisted coordinate rule and a
guard whose deletion re-opens ADR 0011 Gap D.

---

### Wave 5B4b — adjacent empty columns merge, capped at 800 mm

**Dispatch only once 5B4a's criterion 4 is green in the tree.** That is the gate, and it is the
whole reason the merge is split from the split.

**Owner decision 2, 2026-09-01.** Adjacent empty columns on the same wall and row merge when their
total is at most 800 mm; a chain longer than 800 merges the widest contiguous run that stays at or
under 800, so three adjacent 300s become a 600 and a 300. A 600 and a 400 stay separate and each
takes its own cabinet — *"and this is a solution"*. The owner rejected a manual merge-left /
merge-right control: *"It's a additional click for the user that I really want to avoid."* 600 is an
acceptable fallback cap if 800 proves hard; 800 is preferred.

**Mechanism: merge at derivation, not at insert time** — the owner's choice after being offered the
alternative. An offer-list-only merge (leave two 300 mm gaps on screen, offer 600 mm cabinets) was
rejected on UX grounds: a customer looking at two gaps and offered one cabinet is looking at a
picture that disagrees with the offer. The merged space must be **visible as one space**.

The seams are the ones ADR 0037's `mergeAdjacentEmptyColumns` used and they still exist:
`resolveColumns` (`apply-command-result.ts:104-112`) after every command, `moveFrozenColumns`
(`apply-column-moves.ts:186-206`, whose comment still marks the removal), and — new, and only
possible because of 5B2 — `deriveColumns` at load.

Recorded as **ADR 0046**, which revives ADR 0037's rule under the cap and supersedes its withdrawal.

**Three traps this wave must not walk into, none of them in ADR 0037.**

1. **The capped merge is order-dependent where the uncapped one was not.** ADR 0037 measured
   order-independence — a chain of five collapsed to one 3000 mm space whatever the order. Under a
   cap that property is **gone by construction**: 300 + 500 + 300 gives 800 + 300 scanning left, and
   300 + 800 scanning right. `columns` is a `Map` and iterates in insertion order, so a greedy scan
   over it would make the geometry depend on the order commands happened to run in. The rule must be
   a greedy left-to-right scan over the run **sorted by along-wall coordinate**, and that must be
   asserted, not assumed.
2. **Merging columns with different `top` and `regions` invents openings.** `deriveFreeSpans`
   (`void-engine.ts:692-705`) reads `min(regions[].start)` and `column.top`. A base-run column
   (`top` 0.86) merged with a full-height one (`top` 2.6) yields, under a naive `max`, a wall-level
   and a top-level opening over ground that never had one. §4 rule 1 exists for exactly this —
   *"deleting the wall unit at x=0.30 offered a 2200 mm opening down to the floor, where the corner
   base actually stands. Overlapping columns."* ADR 0037 does not discuss it because the shipped
   kitchen's deletable columns happen to agree. **Rule: merge only columns whose `top` and floor
   agree within `LEVEL_SNAP_M`; otherwise leave them separate.** "Same row" in the owner's decision
   is what this makes precise.
3. **The merged centre must land on the key grid.** `deriveColumnKeyAt` rounds to two decimals of a
   metre (10 mm). A run from 1.30 to 1.85 has centre 1.575 and keys as `1.58`. `refuseKeyCollision`
   catches a clash but not the drift, so the merged extent and its key must be derived from the same
   number, the way `frozenColumnKey` already does it.

**Why the cap plus the split is now sufficient — the verification the lead asked for, and its
limit.** ADR 0037's measured failure was: merge two clears into 1400 mm, insert a 600 mm cabinet,
*the whole level closes*, stranding 800 mm with no void and no second insert; and a `widthFlex: 'fit'`
body is refused outright for trying to fill 1400 against the 800 mm ceiling.

- The **`'fit'` refusal** is cured by the cap alone. No merged span exceeds 800, so no `'fit'` body
  is ever asked to build past §7's ceiling. Verified against `resolveFitWidth`
  (`insert-fit.ts:341-354`), which refuses on `acceptsWidthMm` against the entry's declared range.
- The **stranding is not cured by the cap.** Insert a 400 into a merged 600 and 200 mm still
  strands, for the identical reason: `recomputeVoids` subtracts height and never width. The cap
  bounds how much can strand (to just under 800) but does not prevent it. **The lead's reading is
  correct and I reproduce it from the code rather than inheriting it.**
- The **stranding is cured by 5B4a**, and by nothing else in this phase. That is why 5B4a is a
  hard prerequisite and why its criterion 4 — the four-tap case, green with no merge present — is
  the dispatch gate for this wave. It proves the mechanism on the *pre-existing* defect before the
  merge is allowed to make that defect ordinary.

**One residual the cap does not close, stated rather than hidden.** ADR 0035 decision 7 lets a shrink
widen an empty column with no ceiling: `void-engine.ts:744-751` records nine taps producing a 900 mm
empty column, where every `'fit'` cabinet is refused. The 800 mm merge cap does **not** bound that
path, because it is one column growing rather than two merging. It is a pre-existing open product
question, recorded in `docs/milestones/M5-width.md`, and this phase does not close it — but a
reviewer will meet a >800 empty column while testing 5B4b and must not read it as this wave's
regression. **Q5** in *Open questions*.

**What this is not.** Backlog 2 chose option B — *"a run's total offered as valid module
combinations"*. 5B4a + 5B4b deliver the **mechanism** that option B needs and that §12 lists as
designed-not-built: one span yielding several columns, which is what `findTouchedColumnKeys`'
comment already anticipates (*"one body becoming two … is the same question as one body moving"*,
`void-engine.ts:466-471`). They do **not** deliver the product half — nothing offers the customer
`800+600` versus `600+400+400` for a run. So this is a narrow slice of backlog 2, not the whole of
it, and **backlog 2 stays open** with its remaining half named. Answering the lead's question
directly: the split does not drag the full re-split in.

**Acceptance criteria.**
1. Two adjacent empty 300 mm columns on the same wall and row derive as **one** 600 mm empty column,
   at load and after every command, with one key.
2. A 600 and a 400 do **not** merge; both survive as separate columns. (Owner's own example.)
3. Three adjacent 300s give a 600 and a 300 — and the same 600 and 300, in the same positions,
   whatever order the deletions happened in and whatever order the map iterates. Asserted over a
   shuffled map.
4. 300 + 500 + 300 gives one deterministic answer, stated in the ADR, and the test asserts that
   answer rather than "either is fine".
5. Columns whose `top` differs by more than `LEVEL_SNAP_M` never merge, and a test builds the
   base-run-beside-a-cleared-column case explicitly. §4 rule 1 must still hold: no opening is
   invented over ground a member stands on.
6. Inserting into a merged span leaves a usable remainder, never a stranded one — 5B4a's criterion
   1 re-run on a merged column.
7. **ADR 0037's exact withdrawal scenario, re-run:** clear two adjacent columns, insert into the
   merged space, and the remaining width is still a selectable opening. Cited by that ADR's own
   numbers.
8. The merge is idempotent: merging an already-merged map changes nothing.
9. Nothing merges across walls, across rows, or through an occupied column.
10. Save and reload after a merge reproduces the merged column. **Requires 5B2.**
11. The four column-identity regressions in M5's Verification section pass, and §10's signature flow
    is re-run end to end.

**Files.** a new `packages/configurator-domain/src/merge-empty-columns.ts`,
`packages/configurator-domain/src/void-engine.ts`,
`packages/configurator-domain/src/commands/apply-column-moves.ts`,
`apps/web/src/store/apply-command-result.ts` (4).

**Review tier: Full**, with adversarial QA briefed on ADR 0037's withdrawal and on the three traps
above by name.

**Risk. Highest in the phase.** The owner has been burned by this once.

---

### Wave 5B10 — the dishwasher niche wears a decor door

Closes `docs/BACKLOG.md` entry 11, open since 2026-08-27. Decided by the owner on 2026-09-01 —
**give `base-dishwasher` a decor door front**, not the one-line "turn the flags off" fix that entry
named — following the Q6 / [ADR 0050](../decisions/0050-the-hob-oven-filler-is-a-finishable-front.md)
precedent. Recorded as [ADR 0051](../decisions/0051-the-dishwasher-niche-wears-a-decor-door.md),
which carries the full sweep and the alternatives.

**Defect, re-measured live at the mobile viewport on 2026-09-01.** `base-dishwasher` offers five
enabled finish chips and records the pick (`finish-graphite` → `aria-pressed="true"`, no rejection),
and nothing recolours: the fascia stays `222,223,221` under all four solid finishes while its
immediate neighbour tracks each one. `dishwasherHousing`
(`packages/three-adapter/src/kitchen-parts.ts:1438`) builds an open niche — plinth, two sides, back
panel, `builders.dishwasher`, worktop — with no `door_front`/`drawer_front` mesh, so
`finishes.ts`'s `FRONT_MESH_NAME` reaches nothing and `collectFronts` returns `[]`. It also inherits
`canHandle: true` from `INSERTABLE_DEFAULTS`, so `handle: "push"` reaches `setHandlesVisible`, which
walks every `handle` mesh in the group and hides the **dishwasher's own** bar — `fridge-free-700`'s
live defect (ADR 0027's amendment) on a second body.

**This is the one M5B wave that moves seeded geometry**, and the phase's *"a geometry wave moves the
seeded kitchen"* risk is met by re-baselining rather than by avoidance. Read ADR 0051 decision 7
before writing any of it.

#### Work items

1. **Split the appliance into two named factories over a shared body helper.**
   `builders.dishwasher` keeps building the exposed machine (`dw_body` + `dw_panel` +
   `dw_control_strip` + its `handle`) for the parts gallery and M1's `dishwasher` key; an integrated
   factory builds `dw_body` alone. Two functions, not a boolean argument. `dw_body`'s **name and
   geometry are frozen** — `CARCASS_MESH_NAME_PATTERN` reads it (ADR 0016) and the recorded seat
   depends on it.
2. **`dishwasherHousing` calls the integrated factory and builds the decor door with `doorSlab`**,
   at `baseCabinet`'s own anchors: `doorSlab(W − 0.006, CARC_H − 0.01, 0, PLINTH + CARC_H − 0.004,
   CARC_D / 2 + TH / 2, "top")`, added after the appliance and before the worktop, matching
   `baseCabinet`'s build order.
3. **Re-baseline M1's parity gate** with a *declared structural change* form beside the existing
   numeric `DeclaredDivergence`: each added and removed node named with its parent and its
   occurrence count, an undeclared difference still failing, and an unused or miscounted declaration
   failing as loudly. Affects the `base-dishwasher`, `base-dishwasher-450`, `kitchen-l` and
   `dishwasherHousing(0.45|0.6)` comparisons; the `dishwasher` key must stay exact.
4. **Move the declared occupied depth to `finishesAtMm(BASE_FINISHED_DEPTH_MM)`**, delete
   `DISHWASHER_BASE_FINISHED_DEPTH_MM` and its now-false comment, and update the seeded fixture that
   imports it. Give the catalogue row the comment its flags have never had.
5. **Take both pins out of `RECORDED_CAPABILITY_GAPS`** and re-point — never delete — the comment
   that pointed at backlog entry 11.
6. **Re-record backlog entry 11's `tall-oven-tower` tail as its own backlog entry** before entry 11
   is closed, so the deferral leaves a pointer rather than a silence. Documentation deliverable of
   this wave, not a wish.

#### Coordinate anchors, scaling and structural dependencies

Per `docs/best-practices/product-invariants.md`, stated before the work rather than discovered in it.
All figures are metres in the housing group's frame, whose origin is the carcass centre.

| | Rule |
| --- | --- |
| **Anchor** | The decor door's front plane is `CARC_D / 2 + TH / 2 = 0.289`, its outer face `0.298` — the same expressions `baseCabinet` uses, so it is flush with neighbouring base fronts **by construction, not by a typed number**. |
| **Scaling** | Width follows `W` at both declared sizes (450 and 600). Height and depth do not follow the requested depth: this builder ignores the depth it is handed (ADR 0018), and `CARC_D` is `carcassDepthM`, wave 5F's formula over the cabinet-depth setting. A literal `0.298` would decouple at a 700 mm kitchen — `M5-width.md:1125` is the note this must not make worse. |
| **Structural dependency** | The appliance must stay behind the door. `dw_body` reaches `0.24`; the door's inner face is `0.28`; the 40 mm between them is the mounting space. `dw_panel` (front face `0.298`) and `dw_control_strip` (`0.275`–`0.305`) both cross that plane, which is why work item 1 removes them from the integrated form rather than moving them. |
| **What must not move** | `dw_body`'s name and box; the seat (`frame.d = 580`), which is derived from `CARCASS_MESH_NAME_PATTERN` and matches no front mesh; the standalone `builders.dishwasher()`; every other builder and every other seeded body at 1e-6 m. |

#### Acceptance criteria (falsifiable)

1. `dishwasherHousing(0.45)` and `dishwasherHousing(0.6)` each contain **exactly one** mesh matching
   `/door_front|drawer_front/`, and `collectFronts` on each returns exactly that one mesh.
2. Each of the four solid finishes changes that mesh's material and colour, measured on the material,
   and changes the material of **no** other mesh in the body — the worktop, the plinth, the sides and
   `dw_body` keep theirs.
3. The decor door's outer face is equal, within 1e-6 m, to the outer face of `baseCabinet`'s door at
   the same width. Asserted by comparing the two measured planes, not by asserting `0.298` twice.
4. `dishwasherHousing` at both sizes contains **no** mesh named `dw_panel` and none named
   `dw_control_strip`, and no mesh belonging to the appliance reaches `z ≥ 0.28` — the door's inner
   face. A body where the two overlap is the regression this criterion exists to catch.
5. `builders.dishwasher()` is **byte-identical to the reference** under M1's parity gate: same mesh
   names, same hierarchy, same numbers at 1e-6 m, no declared divergence used. `SPEC.md`'s
   596 × 720 × 560 machine is unchanged, and `kitchen-parts.contract.test.ts`'s `dw_panel` size
   assertion still passes **against the standalone appliance**.
6. `censusOf("base-dishwasher")` and `censusOf("base-dishwasher-600")` each report
   `{ fronts: 1, cabinetHandles: 1, canFinish: true, canHandle: true }`, and `handleBarCountOf` is
   **1** for each — the cabinet's, with no appliance bar left in the group. `RECORDED_CAPABILITY_GAPS`
   is empty and both ids are in `GATED_BUILD_IDS`.
7. The census control test still reports `base-hob-oven` at `{ fronts: 1, cabinetHandles: 0 }` and
   `tall-oven-tower` at `cabinetHandles: 2` / `handleBarCountOf: 4`. **The distinction between an
   appliance's handle and a cabinet's is not widened, weakened or special-cased for this body** —
   this is the anti-invariant, and it is the reason the cheap `dw_panel` rename was rejected.
8. With `handle: "push"` recorded on `p1`, the seeded dishwasher renders with **zero** visible
   `handle_bar` meshes and with `dw_body` and the decor door still visible; with `handle` unset it
   renders **one** visible bar, because the base slot is not push-open by default. No appliance bar
   exists to be erased. Asserted through `syncSolidBodies`, beside the existing `fridge-free-700`
   case in `seeded-appliance-handles.test.ts`.
9. `base-dishwasher`'s declared `occupiedDepth` equals what `occupied-depth.parity.test.ts` measures
   off the built meshes, at **620 mm**, for both the insertable entry and `base-dishwasher-600`; and
   the recorded seat is still **580 mm** for both. `DISHWASHER_BASE_FINISHED_DEPTH_MM` no longer
   exists anywhere in the workspace.
10. M1's parity suite is green with every difference **declared**: the added `door` subtree and the
    removed `dw_panel`, `dw_control_strip` and appliance `handle` subtrees, each named with its
    parent and its exact occurrence count, once per housing and once in `kitchen-l`. Removing any one
    declaration turns the suite red, and so does adding a declaration that does not occur.
11. `kitchen-parts.decomposition.parity.test.ts` is green **unmodified**: the seeded and the
    decomposed builds still agree. A change there is a defect, not a re-baseline.
12. The wave report lists **every** re-pinned expectation with the geometry it was read off. A number
    changed to make a test pass, without a measurement beside it, fails review.
13. Backlog entry 11 is closed as DECIDED/SHIPPED **and** its `tall-oven-tower` tail exists as its own
    open backlog entry with a named owner (§6.5). Closing entry 11 without that entry existing is the
    failure this criterion prevents.

#### Verification

- Three-adapter unit tests on measured bounds and materials, plus the full M1 parity suite, plus the
  capability gate and both occupied-depth gates.
- **A before/after capture at the mobile viewport** per `docs/best-practices/browser-and-visual-qa.md`:
  the seeded dishwasher under each of the four solid finishes, showing the fascia tracking the run,
  and one shot with `push` recorded. The seeded kitchen changes visibly and on purpose — tests are
  not evidence for that.
- Adversarial QA gates review, per `docs/WORKFLOW.md`.

#### Files, budget and tier

`packages/three-adapter/src/kitchen-parts.ts`,
`packages/configurator-domain/src/catalog.ts`,
`packages/configurator-domain/src/fixtures/kitchen-l-design.ts` (**3 production files**, inside the
~5-file dispatch budget), plus the tests named above.

**One dispatch and one commit, not two.** The geometry half leaves the declared depth wrong and the
gate pins asserting a defect that no longer exists, so a commit carrying only half of it is red by
construction.

**Review tier: Full, plus visual.** Everything that made 5B6 Light is false here: this wave moves
seeded geometry, re-baselines M1's fidelity gate, changes a declared domain constant, and removes a
gate pin. Product-logic and clean-code review both apply, and the reviewer should be briefed on
criterion 7 by name.

#### Risks

| Risk | Control |
| --- | --- |
| The re-baseline absorbs an unintended move | Declared structural changes are enumerated per node with counts; the numeric diff still runs at 1e-6 m over everything else, and the confinement to one body is the evidence (criterion 10). |
| The appliance's bar is reclassified as the cabinet's | Criterion 7's control cases, unchanged, on two other bodies. This is why the `dw_panel` rename was rejected — ADR 0051, *Alternatives*. |
| The 12 mm depth drop breaks something downstream | Criterion 9 measures rather than asserts; criterion 12 forces every re-pinned number to be justified from geometry. The seat, which is what persistence stores, does not move. |
| `it.each(RECORDED_CAPABILITY_GAPS)` over an empty list | A known Vitest hazard once the list empties. Either guard the companion suite or remove it and keep the census control — whichever, the change is stated in the wave report, not silent. |
| Closing entry 11 deletes the only pointer to `tall-oven-tower` | Work item 6 and criterion 13. |
| Two coplanar 18 mm slabs z-fighting | Criterion 4, measured on bounds. |

---

## Dispatch order and dependencies

```
5B1  (dispatched) ──┐
                     ├─→ 5B4a ─→ 5B4b
5B2 ────────────────┘     ▲          ▲
  │                        │          │
  └────────────────────────┴──────────┘   (reload of split / merged columns)

5B6 ─ 5B7 ─ 5B3 ─ 5B8      (independent of everything, and of each other)
5B10                           (independent; the only wave that moves seeded geometry)
5B5                            (independent; blocked on owner Q2)
```

| # | Wave | Depends on | Tier | Why here |
| --- | --- | --- | --- | --- |
| 1 | 5B1 | — | Full | In flight. |
| 2 | 5B6 | — | Light + visual | Smallest, most isolated. |
| 3 | 5B7 | — | Light + visual | Batched with 5B6 for review if both diffs stay small (`docs/WORKFLOW.md`, *Batching fixes before review*); split them if either grows. |
| 4 | 5B3 | — | Full + visual | Re-crosses `db9c402`'s seam. **Complete.** |
| 5 | 5B5 | — | Full | **Unblocked 2026-09-01** — the owner answered: show the section disabled, with the reason (ADR 0049). **Complete.** |
| 6 | 5B8 | — | Full | Catalogue bound plus a new parameterised builder. **Complete.** |
| 7 | 5B2 | 5B1's ADR 0043 | Full + security | Prerequisite for both 5B4 waves. **Also owns report item 6**, measured to be a reload defect rather than 5B1's. |
| 8 | 5B4a | 5B2 | Full | The split. Its criterion 4 gates 5B4b. |
| 9 | 5B4b | 5B4a green | Full | The merge. Last, as the owner asked. |
| 10 | **5B10** | — | Full + visual | Independent of every wave above and of each other's files. Ordered last because it is the only wave that moves seeded geometry, so it re-baselines M1's parity gate against a tree no other wave is touching. |

**The owner asked for the merge last if nothing depends on it, and nothing does.** The one place the
order is forced is 5B2 → 5B4: merged and split columns that vanish on reload are worth nothing, and
5B4a's criterion 8 and 5B4b's criterion 10 cannot be met without the stored field. **That
dependency is confirmed, not refuted.** It moves 5B2 later than its size warrants, which is the
right trade — it keeps the merge last.

## Commit convention

Wave commits follow this repository's existing convention: **`M5B wave 5B2: …`**, matching the
`M<n> wave …` shape `docs/WORKFLOW.md` checks for. That is not cosmetic — the workflow's rule *a
wave is complete only once `STATUS.md` says so* is enforced by listing the wave commits and
confirming each hash is described in `docs/STATUS.md`:

```
git log --oneline -i --grep='^M5B wave'
```

**The `-i` is not optional.** `docs/WORKFLOW.md` records that on M5 the case-sensitive form silently
dropped five waves. A wave whose commit does not match this pattern is invisible to that check, and
an under-reported wave does not merely go stale — it dispatches work against behaviour that already
shipped.

## Verification method

- **Per wave, before it counts as complete:** its commit is named `M5B wave 5B<n>: …` and
  `docs/STATUS.md` describes that hash. Both, on the commit that closes the wave — not batched later.
- Per wave: adversarial QA gates review (`docs/WORKFLOW.md`, *QA before review*). Green tests, not
  "QA has run".
- Phase close: `pnpm check` executed by the coordinator, with the test count quoted from the run
  (the last recorded figure is 2,415 package tests at commit `c5df227` on 2026-08-31; do not carry
  that number forward as evidence of a later run). The Playwright e2e suite has not been run since
  2026-08-26 and **must** be run before this phase closes — three of these waves change what the
  editor loop does.
- Visual waves (5B3, 5B6, 5B7, 5B8) need a real capture at the mobile viewport;
  `docs/best-practices/browser-and-visual-qa.md`. Tests alone are not evidence for a visible change.
- §10's signature flow end to end after 5B4b, and after 5B2.

## Risks

| Risk | Where | Control |
| --- | --- | --- |
| The merge strands width again, as in ADR 0037 | 5B4b | 5B4a ships first and its criterion 4 — the four-tap case, green with no merge in the tree — gates the dispatch. |
| The capped merge is order-dependent | 5B4b | Sorted greedy scan; criteria 3 and 4 assert one answer over a shuffled map. |
| Merging unlike columns invents an opening over occupied ground | 5B4b | `top`/floor agreement within `LEVEL_SNAP_M`; criterion 5; §4 rule 1. |
| Edge alignment breaks `refuseColumnDrift` and re-opens ADR 0011 Gap D | 5B4a | Restate the guard, never delete it; criterion 6. |
| A new document field becomes a new way to store an unexecutable design | 5B2 | Validation at **both** seams; criterion 5; security review. This is DOM-001's shape. |
| The shell reconstructs a deleted body | 5B3 | Criterion 4 is `db9c402`'s anti-invariant, as a test. |
| A resized pantry is faked by scaling a finished group | 5B8 | Criterion 5 asserts measured bounds at three widths. |
| A geometry wave moves the seeded kitchen | 5B3, 5B6, 5B7, 5B8 | M1's 1e-6 m parity suite, named as a criterion in each. |
| A geometry wave moves the seeded kitchen **on purpose** | 5B10 | The one wave where "nothing seeded moves" is not the control. ADR 0036's rule applies instead: re-baselined as declared structural changes, enumerated per node with counts, with everything else still diffed at 1e-6 m. |
| Overturning `columnWidthChoices`' written suppression by accident | 5B5 | Criterion 4's anti-invariant preserves R2.7's loud failure. |

## Decision records

**Written with this plan**, before any wave below is dispatched, because the owner's standing
instruction requires the sweep to happen before the code and not after it. Each carries a *Records
swept before deciding* table naming every earlier record that said the opposite or was ambiguous.

| ADR | Wave | Subject |
| --- | --- | --- |
| [0043](../decisions/0043-an-empty-space-of-any-width-is-a-legal-state.md) | 5B1 | An empty space of any width is a legal state (written by 5B1's implementer). |
| [0044](../decisions/0044-an-empty-space-is-recorded-in-the-design-document.md) | 5B2 | An empty space is recorded in the design document, not re-guessed at load. |
| [0045](../decisions/0045-the-run-end-panel-follows-the-run-it-closes.md) | 5B3 | The run-end panel follows the run it closes, and hides when there is no run. |
| [0046](../decisions/0046-adjacent-empty-columns-merge-under-a-cap-and-an-insert-splits-its-column.md) | 5B4a, 5B4b | Adjacent empty columns merge under an 800 mm cap, and an insert splits the column it does not fill. |
| [0047](../decisions/0047-an-open-shelf-count-follows-its-clearance.md) | 5B7 | An open shelf's compartment count follows its clearance, not its row. |
| [0048](../decisions/0048-the-pantry-column-is-the-one-resizable-column.md) | 5B8 | The pantry column is the one resizable column, and its door count already follows its width. |
| [0049](../decisions/0049-a-fixed-width-cabinet-shows-its-width-section-disabled.md) | 5B5 | A fixed-width cabinet shows its width section disabled, with the reason (owner, 2026-09-01). |
| [0050](../decisions/0050-the-hob-oven-filler-is-a-finishable-front.md) | 5B6 | The hob+oven filler panel is a finishable front, overturning ADR 0027's now-false "the oven is the front" ground (owner, 2026-09-01; Q6). |
| [0051](../decisions/0051-the-dishwasher-niche-wears-a-decor-door.md) | 5B10 | The dishwasher niche wears a decor door and the appliance behind it is built integrated, closing backlog entry 11 (owner, 2026-09-01). |

**Amended in place, with dated pointers and nothing deleted:**

- **ADR 0027** — its `base-hob-oven` front claim struck through and superseded by ADR 0050.
- **ADR 0027** — its amendment's closing *"the owner… decided to keep both as they are"* exemption
  for `base-dishwasher` and `base-dishwasher-600` struck through and superseded by ADR 0051.
- **ADR 0040** — a dated correction owed on its `base-dishwasher` **632** row once 5B10 lands; the
  measured number becomes 620 and the method is unchanged.
- **ADR 0037** — revived under a cap by ADR 0046, with its withdrawal section left intact and marked
  as still true. It is the record this phase is most at risk of re-deciding wrongly, so read it
  before 0046, not instead of it.
- **`docs/decisions/README.md`** — index rows for 0044–0050, plus five new *Supersessions* bullets.
- **`docs/BACKLOG.md` entry 2** — the mechanism is being built under a cap; the entry stays open for
  option B's combination offer.
- **`DEVELOPMENT-SPEC.md`** — §3.2 (*"computed once at load and never change"*), §4 (*"no horizontal
  half"*), §7 (*"columns are fixed 600"*, for `tall-pantry` only), §12 (the `Design` shape), §13.1
  (*"nothing can move horizontally any more"*), §9 item 6 (`fixedWidth` is no longer what decides whether the section exists), §13.3 item 2 (re-split, half closed).
- **`docs/STATUS.md`** — the phase row, *What is open right now*, and *What to do next*.

ADRs 0031 and 0043 were amended by 5B1's implementer and were deliberately left alone here.

## Open questions for the owner

**One is open, and it is inherited from M5, not introduced by this phase. Q6 and Q7 were raised by
adversarial QA on 2026-09-01 against waves this phase built and are answered below.**

**Inherited, and not introduced by this phase:**

- **Q5 — may a shrink widen an empty column past 800 mm?** [ADR 0035](../decisions/0035-width-is-a-bounded-stepper-not-a-menu-of-sizes.md)
  decision 7 lets a shrink hand width back to the empty column beside it with no ceiling: measured at
  **900 mm** in nine taps and recorded in `void-engine.ts:744-751`, where every `widthFlex: 'fit'`
  cabinet is refused for trying to fill 900 against §7's 800 mm ceiling. **This is a pre-existing
  question, open since M5 and recorded in `M5-width.md`, and no wave below closes it — but
  [wave 5B8](#wave-5b8--the-pantry-column-is-the-one-resizable-column) widens its surface.** Making
  the seeded pantry resizable put a resizable column on wall B, where none existed, so the 900 mm
  column is now two taps away rather than nine: clear `B|2.45` (`p7`, `p24`), then shrink `p6` to
  400 and the freed 200 mm joins the cleared 700. Same behaviour, cheaper route, new wall. Closing
  Q5 means bounding the shrink's release the way `RESIZE_OPENS_GAP` bounds wall A. ADR 0046's
  800 mm merge cap does **not** bound it — that cap governs two columns
  merging, and this is one column growing. It is listed here so a reviewer who meets a >800 mm empty
  column while testing 5B4b does not report it as this phase's regression.

### Answered on 2026-09-01, and folded in above

Kept as a record of what was asked and how it was settled, so a later session does not re-open a
closed question.

| | Question | Answer | Where it landed |
| --- | --- | --- | --- |
| **Q1** | Item 6 (dishwasher 450 → 600 blocked) — one session, or after a reload? | **Settled by measurement, not by the owner.** In-session the domain reports `600:available` after shrinking `p1` 600 → 450; the refusal appears only after a reload. | Item mapping above; wave **5B2** owns it. |
| **Q2** | Should a fixed-width cabinet show a disabled width section with its reason? | **Yes** — greyed, with a sentence saying the cabinet is only made at 600 mm. The silence is what made it read as a defect, and every other blocked control already shows disabled-with-reason. | [ADR 0049](../decisions/0049-a-fixed-width-cabinet-shows-its-width-section-disabled.md); wave **5B5** unblocked. |
| **Q3** | At 400 mm, is a one-door pantry still full height with the same shelf pitch? | **Yes** — same height, same shelf pitch, fewer things side by side. No second geometry rule. | [ADR 0048](../decisions/0048-the-pantry-column-is-the-one-resizable-column.md); wave **5B8** criterion 6. |
| **Q4** | Which end of a span does an inserted cabinet sit against? | **The left edge, always.** The proposed conditional rule was rejected. The owner accepted the named cost: `base-dishwasher` no longer centres in a 700 mm opening. | [ADR 0046](../decisions/0046-adjacent-empty-columns-merge-under-a-cap-and-an-insert-splits-its-column.md); wave **5B4a** criterion 11. |
| **Q6** | The hob+oven filler panel is built in the door material on a body the customer cannot finish (`base-hob-oven` was the only entry owning a `kit.M.door`-family mesh while declaring `canFinish: false`, so it stood permanently default white). What should it do? | **Make the filler a finishable front.** The mesh is renamed `oven_filler_front` → `oven_filler_door_front` to reach `finishes.ts`'s `FRONT_MESH_NAME` pattern; `base-hob-oven` gains `canFinish: true` (`canHandle` stays `false` — the filler opens nothing and the body's one bar belongs to the oven). ADR 0027's now-false "the oven is the front, so it owns no `door_front`" ground is struck through and replaced. | [ADR 0050](../decisions/0050-the-hob-oven-filler-is-a-finishable-front.md); wave **5B6**, now complete. |
| **Q7** | Should an open shelf's compartments be evenly spaced, or its boards evenly spaced? | **Fix the wording, keep the geometry.** The shipped geometry evenly spaces board **centres** (`H·i/(N+1)`), not clear compartment heights — measured at 700 mm: 206.3 / 215.3 / 206.3 mm, a ~9 mm end-compartment shortfall. It stands because it is inherited `openShelf` geometry M1 parity pins at the seeded parameters, it is not visible at the mobile viewport, and re-pinning parity for 9 mm was judged not worth it. | [ADR 0047](../decisions/0047-an-open-shelf-count-follows-its-clearance.md)'s 2026-09-01 correction; wave **5B7** criterion 4 reworded above. |
