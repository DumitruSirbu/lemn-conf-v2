# M5 — Editing a cabinet's size: width as a boundary move, depth as a derived quantity

> **STATUS: IN PROGRESS.** Waves 5A, 5B, 5C, 5C2, 5C3 and 5D are shipped. **5D2** (the width
> stepper), **5E** (browser and mobile gate) and **5F** (base carcass depth) remain. Summary:
> `docs/STATUS.md`.
>
> **Rewritten again on 2026-08-28 by [ADR 0035](../decisions/0035-width-is-a-bounded-stepper-not-a-menu-of-sizes.md)
> and [ADR 0036](../decisions/0036-a-declared-dimension-is-the-finished-cabinet.md).** Width stops
> being a menu of sizes and becomes a **bounded ±50 mm stepper**, relative to the cabinet's current
> width, 200–800, with appliance-fixed entries keeping a discrete choice instead. **Two doors now
> start at 500 mm.** A **column is one width at every level** and a resize squares a mixed column up
> rather than refusing it; **shrinking creates adjacent empty space**, which is what makes the
> stepper usable at all. Every **declared dimension is the finished cabinet, doors included**, and
> the general setting is **cabinet depth (600/700), not worktop depth** — the worktop is external and
> touches neither geometry nor price.
>
> **New wave 5D2 lands in front of 5E**, because 5E photographs the width surface and the surface
> changed. ADR 0034's engine seam survives; its chip row does not. Anything below that reads as a
> list of legal widths per entry — including the *Not established* depth questions 3, 4, 6 and 7,
> now closed by ADR 0036 — must be read against those two records first.
>
> **Work item 3 is superseded in part by [ADR 0034](../decisions/0034-width-chips-are-column-scoped-and-judged-by-the-command.md).**
> It asked for a domain query behind chip freedom and got one; what it did not anticipate is that the
> *chip row itself* had to move to the column too, because `describeSelection` answers per body while
> ADR 0031 resizes per column. The chip-section acceptance criteria below still say "chip sets come
> from the body's own legal sizes" — read ADR 0034 instead: they come from the intersection over the
> column's members, and the shipped kitchen's chip count is 62 rather than 76 as a result.
>
> **Rewritten in part on 2026-08-27 by [ADR 0031](../decisions/0031-a-resize-moves-a-whole-column-into-adjacent-empty-space.md),
> which supersedes §5.4's donor rule.** A resize moves a **whole column** at every level, funded by an
> **adjacent empty column**; there is no donor and nothing is resized as a side effect of editing
> another column. Work item 2 and the *boundary move* acceptance criteria carry supersession banners
> and must not be implemented as written. Work item 4 (column identity), the *Column identity*
> criteria, and everything about depth are unaffected.
>
> Also decided the same day and binding on the rest of this plan: **ADR 0029** (`wall-2door` is
> `[600, 800]`), **ADR 0030 and its amendment** (`base-1door` / `wall-1door` are `[200, 300, 400]`,
> so three entries now declare a floor below §2's default, where ADR 0026 had the bottle cargo alone),
> and **`docs/BACKLOG.md` entry 12** (§3.2 cannot express a middle level at its own width; per-level
> resize is deferred to a possible future milestone, on cost rather than merit).

Status: planned. Depends on M4.
Reference: `DEVELOPMENT-SPEC.md` §5.4, §5.2, §2, §3.2, §3.3, §4, §7, §9 item 6, §12, §13.1, §13.2,
§13.3; §11 rows 9–14, **19** and 20.
Decisions: ADR 0011 (Gap A, **Gap D**, and its two 2026-08-26 corrections), 0015, 0016, 0017,
**0018**, 0021, 0022, 0024, 0025, **0026**.
Backlog entries this plan consumes: `docs/BACKLOG.md` **4** in full, **2**'s design obligation only,
**5**'s unfinished half, **6** as stated input, and the edges of **1**. It touches but does not close
**9** and **10**.

**This plan was rewritten on 2026-08-26**, after M4 shipped and after five product decisions were
taken the same day, then amended later that day when the owner resolved the conflicts it raised. The
original was written against the pre-M4 codebase and said nothing about column identity — the one
thing §5.4 breaks and the reason this phase is not just an arithmetic exercise. What survives from
it: §5.4's mechanics, the donor rule, the chip states, rows 9–14, and the rejected directions. What
is new is marked as such.

**Amended 2026-08-27**, when a defect reported from a real handset turned out to be the unfinished
half of backlog 5, and the owner's design for it landed on the same machinery this phase already
rewrites. Depth is now in scope; see *Depth joins this phase* below, which also records what that
amendment found to be **stale in the text above it** — two Scope-Out bullets and two Risks bullets
described mechanisms that shipped on 2026-08-26 and have been rewritten in place.

## Goal

Changing a cabinet's **width** moves the boundary it shares with one neighbour **in the same row**.
The run total is conserved, so overlap is unrepresentable and shrinking cannot leave a gap. **The
columns the resize moved are updated; every other column stays frozen.**

A body's **depth** stops being a number somebody typed and becomes a quantity the model derives from
one declared worktop depth — wall and top depth through an extensible map, base carcass depth through
a formula. **M5 owns that geometry and nothing else about it.** The worktop depth is a single
declared constant at 600 mm in this phase: no user-facing control, no schema field, no settings UI.
Making it a control is **M6's** work — see *The M5 / M6 seam* below and
`docs/milestones/M6-price-and-global-settings.md` work item 4.

## Why last among the editor verbs

§12 step 6. Resize is the only operation that changes a second body, so it depends on every other
guard already being correct. It is also the only operation that moves a body **horizontally**, which
is why it is the only one that can invalidate column identity (§3.2, ADR 0011 Gap D) — and that was
not visible until M3 shipped the frozen-column contract and M4 made the width section reachable.

## Two decisions this phase is built on (2026-08-26)

Recorded in `docs/BACKLOG.md` 4, with the measurements. Stated here because "should the column
follow?" is the first question anyone opening this plan will ask, and the answer must not be
re-derived.

**1. Each level's width is set independently. A resize does NOT drag the cabinets above it.**
An 800 mm base may carry a 600, or two 400s; the customer resizes each level separately. The owner's
reasoning is the flexibility argument — forcing a column to move as one removes the ability to
choose the same width, and "otherwise it will be a limitation". This is §5.4 exactly as written:
neighbours are "same wall, **same row**".

*This half costs nothing to implement.* Measured on the shipped design, an 800 mm base with two
400 mm cabinets above it already derives three columns with the right widths (`A|1.30 w=800`,
`A|1.10 w=400`, `A|1.50 w=400`). A column groups bodies at a position; it never required them to
line up.

**2. Delete keeps columns frozen. Resize updates them.** This is a principle, not a special case: a
column records **the space a run occupies**. Deleting changes what is *in* the space; resizing moves
the *boundary of the space itself*, so the record must follow. Both halves are measured, and both
failure modes are silent today — see the acceptance criteria, where each is named.

## Depth joins this phase (2026-08-27)

### The defect, as reported and as diagnosed

Delete a top-row cabinet in the shipped kitchen and insert one back: it returns **400 mm** deep
against neighbours that are **330 mm**, and the protrusion is visible on a handset. Reported by the
owner from a real device.

The measurements below were taken against the source and are the premise of everything in this
section. Read them before proposing any other fix.

- The seeded kitchen is **correct**. Nine wall/top rows in
  `packages/configurator-domain/src/fixtures/kitchen-l-design.ts` record `frameDepthMm: 330`
  (`wall-2door-600`, `wall-corner-return-570`, `wall-1door-300`, `wall-2door-800`, `open-shelf-600`,
  and the four `-top` rows). Three more are deliberately not 330 and must stay that way:
  `hood-600` at 500, and `wall-2door-600-deep-top` and `wall-2door-700-over-fridge` at **600** —
  those two are the deep cabinets over the columns, and the `700` in the second id is its *width*.
- `catalog.ts:72` — `WALL_DEPTH_MM = 400`, the `nominalDepthMm` of every §7 wall entry.
- `commands/insert-fit.ts:56` — `WALL_CARCASS_MAX_DEPTH_OVER_WORKTOP_M = 0.4`.
- **The built depth comes from the cap, not from the catalogue nominal.** `resolveDepthM`
  (`insert-fit.ts:610`) returns `min(opening.d, WALL_CARCASS_MAX_DEPTH_OVER_WORKTOP_M)` and never
  reads `nominalDepthMm` at all. `opening.d` is `Column.d`, §3.2's **MAX** over the run — 580 here,
  the base cabinet's. So `min(0.58, 0.4) = 0.4`, and 400 mm is what gets built.
- The cap applies because a column holding a wall member over a base run answers
  `hasFullHeightUnder: false` (ADR 0011's 2026-08-26 corrections: the extent is frozen, this
  predicate is re-answered on every derivation).
- Per ADR 0018, `wallCabinet` and `openShelf` are the only builders that consume the depth argument,
  so this number really does change the carcass that gets built.

**The two 400s are independent constants that happen to agree, and that unlinked pair is the root
cause.** It is why the seeded design could be authored at 330 with nothing failing: no gate compares
the nominal, the cap and the fixture.

Two precisions the fix must not blur, because a wave that over-claims here will write the wrong
tests:

- **Changing `WALL_DEPTH_MM` alone fixes nothing** — `resolveDepthM` does not read it.
- **Changing the cap alone does fix the reported symptom** — `min(0.58, 0.33) = 0.33`. The nominal
  matters for the `frameDepthMm` fallback a placement with no measured `seatDepthMm` reads
  (`void-engine.ts:254`), not for the built depth. So the single-source map is justified by *drift
  prevention*, which is the actual defect, and not by the symptom needing both numbers moved.

This is the unfinished half of **backlog 5**. Its wave shipped the design-dependent half of the rule
(the cap is lifted over a full-height column) on 2026-08-26; it did not link the cap to anything, and
that is what is being finished here.

### The owner's decisions — decided, not offered

Taken 2026-08-27. Recorded here so they are not re-derived; the ADR for the rule belongs to the wave
that implements it, not to this plan.

1. **Wall/top depth follows worktop depth**, expressed as an extensible **map** so a third size is
   one row: `600 -> 330`, `700 -> 400`. `800 -> 500` is named as a plausible future row and is **not**
   a commitment.
2. **The map is the single source** for both the catalogue nominal and the cap, so the two cannot
   drift apart again.
3. **Base carcass depth is a formula** — worktop depth minus a fixed overhang — because it scales
   continuously.
4. **Wall/top depth is a map and not a formula.** Wall cabinets come in manufactured sizes
   (300 / 330 / 350 / 400) and the owner's own numbers are non-linear: 100 mm of worktop buys 70 mm
   of wall. A formula would invent a 372 mm cabinet nobody makes.
5. **Worktop depth is a whole-kitchen setting** (600 / 700), belonging in the *Setări globale* top
   bar beside material and hardware — never a per-body control. §5.5 already draws that line:
   finish and handle are per placement, "material and hardware *brand* are global settings elsewhere
   in the flow". The mockups carry the surface: `docs/design/mockups/Lemnaria Configurator
   Desktop.dc.html` and `…Mobil.dc.html` both contain *Setări globale* and "Se aplică tuturor celor
   14 corpuri".
6. **The setting is built in M6, not here** (owner, 2026-08-27). See the seam below.

### The M5 / M6 seam — decided by the owner, 2026-08-27

**M5 owns the geometry. M6 owns the control.** Neither milestone may assume the other is building the
other half, so both plans name each other.

**What M5 builds.** The map (`600 -> 330`, `700 -> 400`, with `800 -> 500` as a plausible future
row), the map as the single source for **both** `WALL_DEPTH_MM` and
`WALL_CARCASS_MAX_DEPTH_OVER_WORKTOP_M` so the unlinked pair cannot drift again, and base carcass
depth as a formula. Worktop depth is a **single declared constant at 600 mm**.

**What M5 explicitly does not build**, so no wave discovers it as a gap and quietly adds it:

- No user-facing control, in either shell.
- No schema field. `DesignSchema` is untouched, no version bump, nothing new persisted.
- No settings UI, no store action, no command taking a worktop depth.

**What M6 builds**, in `docs/milestones/M6-price-and-global-settings.md` **work item 4**: worktop
depth as a **fourth control** in *Setări globale*, beside the three material tiers and three hardware
tiers that item already covers. Because M5 did the mechanics, M6's addition is one more control in a
panel it is already building — the map and the formula are already there to drive. M6's item 4 has
been amended to say so and to cite this wave by name.

**What this seam defers with it.** Every question about a worktop depth that *changes* — what happens
to a design saved at 600 when the setting moves to 700, and whether the value needs persisting at all
— travels with the control to M6. M5 never has two worktop depths in play, so M5 never has to answer
them. They are recorded under *Not established* and flagged as M6's.

### How this splits inside M5, and why

**It is not one piece of work. It is two, separated by four waves, and the seam is `baseCabinet`'s
geometry.** The reasoning matters more than the verdict, because the tempting reading — "it is all
one depth rule, build it once" — costs a cycle.

**Wave 5A ships the defect fix alone: the map becomes the single source, with the worktop constant at
600.** Four reasons, in the order they bind:

1. **It is a shipped defect on a real device; the rest of M5 is a feature.** It is live on the
   owner's handset today. Putting a visible protrusion behind four waves of resize algebra is the
   wrong sequencing regardless of how the code factors.
2. **It is small and closed.** Two constants collapse into one map plus a lookup, `catalog.ts` and
   `insert-fit.ts` read from it, and §7's table row and §2's worked example are amended. That fits
   one dispatch under `docs/WORKFLOW.md`'s scope limit. Nothing else in the depth story does.
3. **It changes the numbers the rest of M5 is written against, so it must land first.** `setWidth`
   rebuilds a body through its catalogue equivalent and re-measures its seat, so every wall body a
   resize touches acquires the built depth this map decides. Land the map after 5C and every depth
   assertion 5C wrote gets rewritten; land it before and 5C is written once, against 330.
4. **It needs nothing the owner has not decided**, and no answer to any open question below. It
   touches the domain only: no builder changes, so it cannot reach the M1 fidelity gate that
   constrains 5F.

**The base carcass formula is a separate wave, late in the phase.** Three reasons it cannot be folded
into 5A:

1. **It is the only part of M5 that changes a builder, and the M1 fidelity gate is watching.**
   `packages/three-adapter/tests/kitchen-parts.parity.test.ts` builds every part twice — once by the
   unmodified vendored reference library, once by the port — and diffs them at **1e-6 m** on
   dimensions, `countertop` and all six base builders included. It is evidence 1 of M1's fidelity
   gate. **A formula that changes any shipped dimension at worktop 600 turns that suite red**, and
   the epsilon is a float allowance with no product slack in it. So the formula must be exactly
   value-preserving at the default, or re-vendoring the reference is a decision someone has to take
   deliberately. Nothing in 5A can reach this; everything in 5F can.
2. **It moves `Column.d` for a reason unrelated to resize, and 5C is already moving column
   identity.** If the formula changes the base carcass at all, every base body's `frame.d` moves, and
   `Column.d` is §3.2's MAX over the run — so every wall opening in that column gets a new depth. Run
   that in the same wave as 5C's column update and a failing extent assertion has two candidate
   causes with no way to separate them. Sequenced, 5F inherits a settled column-update mechanism.
3. **It sits next to ADR 0018 clause 4's trap, and whether it trips it is a design choice the wave
   has to make deliberately.** See work item 7 — this is the correction to an earlier draft of this
   plan, which asserted the trap fires unconditionally. It does not.

## Scope

**In.**

- `setWidth(target)` in the domain: donor selection, the boundary move, rebuild of both bodies.
- The column update that a resize implies, and the frozen-column guarantee that `remove` keeps.
- Width sets on the seeded catalogue entries, so the width section renders on a real body at all.
- The width chip section's three states, its consequence line, and the resize refusal path.
- §9's rejection banner becoming **reachable** for the first time (ADR 0024).
- **The worktop → wall/top depth map, as the single source for both §7's nominal and §5.2's cap.**
  Backlog 5's unfinished half, and the fix for the defect live on the owner's handset.
- **Base carcass depth as a formula** — worktop depth minus a fixed overhang — driven by the same
  declared worktop constant.

**Out, and named rather than assumed.**

- **Run re-split.** §12's "a run's total offered as valid module combinations". The owner **decided
  on 2026-08-26 that re-split is wanted** (backlog 2, option B; free-form width stays rejected,
  confirming §13.2). It is not built here, but **M5's column-identity model must be designed so that
  re-split does not require redesigning it again** — see work item 4 and its criterion. The previous
  version of this plan said re-split "is designed but not built and is explicitly out of scope
  (§12, §13.3 q2)"; that sentence is now wrong as a statement of intent and right only as a statement
  of sequencing.
- **Any user-facing worktop depth control, and any persistence of it** (owner, 2026-08-27). The
  worktop is a single declared constant at 600 mm in M5. No control, no schema field, no version
  bump, no store action, no settings sheet. **M6 work item 4 owns the control**, and adds it beside
  the material and hardware tiers it is already building. Named here rather than assumed so no wave
  discovers it as a gap and fills it: a setting M5 half-builds is worse than one it does not build.
- **The two hob-bearing entries and the narrow bottle cargo** (backlog 1 and 2). New builders,
  entries, labels and an ADR each; not M5's job.
- **`MIN_WIDTH_M` stays at 300 mm.** An earlier draft of this plan moved it to 200 for the narrow
  bottle cargo (backlog 2). **The owner decided on 2026-08-26 that it does not move** — see
  *Conflicts raised, and how they were resolved* below for the reasoning and the rejected
  alternatives. Two consequences bind M5: §5.4's donor rule keeps its 300 mm floor exactly as §11
  row 10 states it, and the consequence line keeps "sub 300 mm nu se coboară". `MIN_SPAN_M` was never
  in question and stays at 300 for its own, different reason (ADR 0015).

  **Corrected 2026-08-27: the mechanism the cargo needs now exists, and M5 must read it.** This
  bullet previously said the downward direction "does not exist yet, and M5 does not build it".
  **ADR 0026 shipped it on 2026-08-26**: §2's `MIN_W` is now the *default* floor rather than an
  absolute one, a `minWidthMm` below it **replaces** it for that entry alone, and
  `base-bottle-cargo` declares `minWidthMm: 200` — the only downward declaration in the catalogue.
  What M5 inherits is not a prohibition but a trap, and **backlog 6 is stated input to this phase**:
  ADR 0026 kept `MIN_WIDTH_M` at 300 *precisely because §5.4 reads it*, and that reasoning is about
  the **donor**. **The target's floor is the entry's own; the donor's is §2's.** A resize path that
  applies `MIN_WIDTH_M` to the target refuses the 200 mm chip too, and the capability lands nowhere.
  Backlog 6 also records that `describe-selection.ts` already publishes the cargo's `[200, 300]`
  chips through `buildableSizes` — harmless while every chip is `blocked`, wrong the moment 5D makes
  one clickable.
- **The wall depth rule's design-dependent half** (backlog 5: the cap is lifted over a full-height
  column). **Corrected 2026-08-27: this shipped on 2026-08-26** and is no longer M5's to build. The
  cap moved out of the adapter into the domain as `WALL_CARCASS_MAX_DEPTH_OVER_WORKTOP_M`
  (`insert-fit.ts:56`), and `Column.hasFullHeightUnder` is re-answered on every derivation. What
  backlog 5 left unfinished — the cap and the nominal being unlinked constants — **is now in scope**;
  see *Depth joins this phase*.
- **The save coalescer's 1 000 ms floor** (ADR 0019 decision 6, still unimplemented per
  `docs/STATUS.md`). Every chip tap writes; M5 makes taps repeatable. Named as a dependency, not
  silently adopted — if the owner wants it in M5 it is a fifth work item, not a free rider.
- **Column reordering** (*Mută la stânga/dreapta*). §13.2's rejection stands, and backlog 4 confirms
  it: with independent per-level widths the customer resizes each level instead.
- **§13.3 q1** (unifying occupied swap sets with the fit-filtered catalogue). Still open, still not
  decided here.

## Work items

Seven items since 2026-08-27, when items 5–7 were added with depth. They do not fit one dispatch
under `docs/WORKFLOW.md`'s scope limit, so they are dispatched as six waves — see *Waves* below.

**They are listed in the order they were written, which is not the order they are built.** Item 5
(the depth map) is wave **5A** and lands first; items 6 and 7 are wave **5F** and land last. The
*Waves* table is authoritative for sequencing.

### 1. Give the seeded catalogue entries their width sets

**This is M5's first work item in practice.** No seeded entry has `sizesMm`
(`packages/configurator-domain/src/fixtures/kitchen-l-design.ts`), so `describeWidthSection` declines
on every body in the shipped kitchen and **the width section has never rendered in a browser**.
`canWidth` is §9's literal rule again — selected · not empty · not `fixedWidth`
(`describe-selection.ts:180`); an earlier M4 fix folded "has widths to offer" into it and logic
review overturned that, because it would have made this missing data fail *silently* instead of
loudly.

The set must be **declared, not inferred**. Every seeded entry that has a §7 equivalent already
declares it as `catalogEquivalentId` (ADR 0022) — 17 of them do; `cooktop-600`, the two wall corner
returns and the two base corner legs deliberately do not. Resolve the width set through that
declaration. Do **not** reintroduce §5.4's `buildIdOf` mesh-tree inspection: ADR 0011 Gap A closes it
by name ("M5 must not reintroduce mesh-tree inference for its donor lookup"), §6.3 and §13.2 reject
it, and ADR 0022 rejected the same shortcut for the ACTUAL badge.

**The tripwire fires here.** `apps/web/tests/panel/panel-model.seeded.qa.test.ts:180` and `:205`
assert `rendered).toEqual([])` — that no seeded body renders a width section — with a comment saying
the day M5 supplies the widths this line fails and the check starts doing real work. **That failure
is the signal, not a regression.** Change those assertions deliberately; do not delete them.

### 2. Implement `setWidth(target)` — the boundary move

> **SUPERSEDED 2026-08-27 by [ADR 0031](../decisions/0031-a-resize-moves-a-whole-column-into-adjacent-empty-space.md).
> Do not implement what follows.** §5.4's donor rule was implemented as written, and the result was
> unusable: **two accepted resizes in the entire shipped kitchen**, both sides of one boundary,
> because a donor's residue must be a legal width and ADRs 0029/0030's 200 mm-granular sets almost
> never allow it. A resize now moves a **whole column** at every level, funded by an **adjacent empty
> column** — there is no donor, and no cabinet is resized as a side effect of editing another column.
>
> **What survives from this item and is still built:** the rebuild through the insertable catalogue
> entry (so a resized seeded body migrates its `buildId`), the `BodyProbe` re-check, and the refusal
> path — `insertBody`'s guards apply to the rebuild, and a resize that would build a body the engine
> refuses is refused *before* it is offered. Those are the two bullets under *"Two things the original
> plan did not say"* below, and they are unchanged.
>
> **What is dead:** donor selection, `canGive`, the same-row neighbour search, and the two floor traps
> that existed only to protect a donor's residue. The text below is kept because the reasoning that
> led here is the valuable part and re-proposing a donor rule costs a cycle.

§5.4's mechanics, as they stood before ADR 0031:

Validate the target against the body's own legal sizes; find the neighbours (same wall, same row,
edge-adjacent); choose a donor; move the shared boundary; rebuild both bodies; recompute voids;
reselect the edited body. `canGive(m)` = exists · not accessory · not `fixedWidth` · not a corner ·
**resolves to an insertable catalogue entry**.

Two things the original plan did not say, both consequences of what M3 and M4 shipped:

- **A resize rebuilds through the insertable catalogue entry, so a resized seeded body migrates its
  `buildId`.** `buildDecomposedBody(kit, buildId)` (`packages/three-adapter/src/decomposed-bodies.ts`)
  takes no width — every seeded body is one fixed geometry per id, one `switch` arm each. There is no
  `base-drawer2-600` at 800 mm and there never will be. So a successful resize must re-express the
  placement through its `catalogEquivalentId` and go through `buildCatalogBody` plus the `BodyProbe`
  re-check, exactly as `insertBody` does. This falls out cleanly: a body with no catalogue equivalent
  (the hob and the four corners) can neither be resized nor donate, which is the same set §5.4's
  `canGive` already excludes and the same set §13.1 calls structural.
- **The refusal path is real.** `insertBody`'s guards apply to the rebuild — `BUILT_SIZE_MISMATCH`,
  the sink's `minWidthMm` (ADR 0017), the hood's fixed 710 (ADR 0016). A resize that would build a
  body the engine refuses must be refused *before* it is offered, not after it is tapped: §9's
  "never offer what cannot be satisfied".

### 3. Implement the chip states and the consequence line

> **Shipped in wave 5D, and amended by [ADR 0034](../decisions/0034-width-chips-are-column-scoped-and-judged-by-the-command.md).**
> The item below is right about where the freedom answer comes from and wrong about where the chip
> *row* comes from: it says "the body's own legal sizes", and ADR 0031 resizes a column, so the row
> is the intersection over the column's members (`columnWidthChoices`). Read the ADR before the
> bullets under *The chip section* in Acceptance criteria, which carry the same assumption.

Three states, already modelled: `WidthChipState = "active" | "free" | "blocked"` with a resolved
`isDisabled` beside it (`apps/web/src/panel/panel-model.ts:69`). M4 shipped the section with every
non-current chip `blocked`, which was the truthful state while no resize command existed.

- **The answer to "which chips are free" comes from the domain, not from `panel-model.ts`.** §12:
  no product logic in components, and the panel is a pure projection (`describePanel`). Publish a
  domain query that evaluates each candidate width the way `setWidth` would, and let the panel render
  it. A chip is `free` only if the command would succeed.
- `isWidthChipDisabled` already takes the whole three-valued union so the `free` branch stays
  typechecked while unreachable, and applies read-only first — the day `free` becomes reachable it
  must not become clickable in a browser that cannot write.
- **Three tests assert "no chip is ever free"** —
  `apps/web/tests/panel/panel-model.qa.test.ts:378`, `panel-model.test.ts:410`,
  `panel-model.seeded.qa.test.ts:212`. They pin M4's truth. M5 changes them deliberately, with the
  new property stated (a chip is free **iff** the command succeeds), rather than deleting them.

### 4. Column identity — the resize updates it, the delete does not

**New in this rewrite, and the most important item in the phase.** A column's key is derived from a
body's **centre** (`deriveColumnKey`, `void-engine.ts:170`: `'A|' + frame.x.toFixed(2)`). §5.4's
resize moves that centre. Columns are frozen at load (§3.2, ADR 0011 Gap D), held as store state and
passed into `recomputeVoids` as an **input** (`apps/web/src/store/apply-command-result.ts`).

Measured on the shipped design, growing `p2` 600 → 800 (centre 2600 → 2700) with donor `p4`
shrinking:

| | outcome |
| --- | --- |
| A) delete `p2`, frozen columns (baseline) | `A\|2.60 w=600` — correct |
| B) after resize, **frozen** columns kept | `A\|2.60 w=600` + `A\|3.20 w=600` — **two phantom slots** |
| C) after resize, columns **recomputed** | no voids — correct |
| D) resize then delete `p2`, recomputed | `A\|2.70 w=800` — correct |
| E) resize then delete `p2`, frozen | two 600 mm voids at the old positions — wrong |

Row **B** is the one to understand: with frozen columns a resize makes **two empty slots appear out
of nowhere**. Nothing was deleted; the model hallucinates space, because the resized bodies moved out
of columns that still expect them.

And recomputing columns is not a blanket fix. Clearing the fridge column (`p7` + `p24`), which is
§10's signature flow:

| | outcome |
| --- | --- |
| frozen columns | `y0=0 w=700 h=860` + `y0=1500 w=700 h=700` + `y0=2200 w=700 h=400` — correct |
| recomputed columns | **no voids — the delete did nothing** — ADR 0011 Gap D, verbatim |

So the update is **per operation**, and it belongs to `setWidth`: update the column entries for the
bodies the resize moved, and nothing else. This is part of `setWidth`, not a redesign of the column
model.

**Design it once, for re-split too.** Backlog 2 decided re-split is wanted; §12 has it as the last
piece of the width story. Express the update as *"re-derive the columns for the keys this operation
touched, from the resulting records"* — a function of the record set before and after, with no
knowledge of "target" and "donor" roles. A re-split turning one body into two is then the same call
with a different record set, not a second mechanism. Anything keyed to the donor pair will have to be
rewritten in the phase after this one.

The mechanics that make this awkward, all read out of `deriveColumns` (`void-engine.ts:264`) and
worth stating so they are not discovered at implementation:

- `Column.w` is the **MIN** width of members and `Column.d` the **MAX** depth, so a resize can change
  a column's `w` for bodies it did not touch (the levels above, which keep their own widths under
  decision 1).
- `Column.regions` and `Column.top` are load-time facts. A resize does not change any body's `y0` or
  `h`, so both must come through the update **unchanged** for the bodies that stayed.
- The key is a metre coordinate at `toFixed(2)` — 10 mm granularity. A resize moves a centre by half
  the delta, so a moved body always lands on a different key, but it may land on a key that
  **already exists**. That is a boundary case with its own criterion below.

### 5. Make the worktop → wall depth map the single source

**New 2026-08-27, and it is M5's first wave in practice** — see *How this splits inside M5*. One
declared map, `600 -> 330` and `700 -> 400`, extensible by adding a row. Both of today's independent
400s read from it:

- §7's `WALL_DEPTH_MM` (`catalog.ts:72`), the `nominalDepthMm` of `wall-2door`, `wall-1door`,
  `wall-lift` and `open-shelf`, and therefore the `frameDepthMm` fallback a placement with no
  measured `seatDepthMm` reads (`void-engine.ts:254`).
- §5.2's `WALL_CARCASS_MAX_DEPTH_OVER_WORKTOP_M` (`insert-fit.ts:56`), which is what `resolveDepthM`
  actually caps against and therefore what decides the built carcass.

The worktop stays pinned at 600 in this wave, so the map's only reachable row is `600 -> 330` and
every number in the shipped kitchen moves 400 → 330. **The map is a declaration, not a
computation** (decision 4): no interpolation, no rounding, no nearest-row fallback. A worktop depth
with no row is a programming error, not a number to guess at — it fails loudly.

Three things this wave must **not** do, each of which would look like an improvement:

- **It must not touch the uncapped path.** `hasFullHeightUnder: true` lifts the cap, and that is
  what keeps `wall-2door-600-deep-top` and `wall-2door-700-over-fridge` at 600 mm over their
  columns. The map governs the head-clearance rule and nothing else. A map applied to every wall
  body flattens those two and reintroduces the defect backlog 5 fixed, in the opposite direction.
- **It must not touch the hood.** `HOOD_DEPTH_MM = 500` (`catalog.ts:73`) and the seeded `hood-600`
  already agree at 500. Whether a hood follows the worktop is **not decided** — see *Not
  established*. Leave the constant where it is and leave the question open.
- **It must not change the worktop or touch a builder.** The worktop is a declared constant at 600
  (work item 6) and stays one for the whole of M5. 5A is a domain-only wave: no `counter()` change,
  no `CARC_D` change, nothing that could reach the M1 parity suite. Base carcass geometry is work
  item 7, four waves later.

§7's table and §2's constants both carry the old number and are amended by this wave: §7's four wall
rows state the builder call as `min(d,0.4)`, and §2's tolerance and module-constant lists are the
other place a reader looks for it. §2's own worked example already uses the right number —
"a unit at `position.x = 0.165` with `D = 0.33`" — which is worth citing in the amendment as evidence
the 330 was the intent all along.

### 6. Worktop depth stays a declared constant — and the control is M6's

**New 2026-08-27, and it is a work item because *not* building something needs to be as explicit as
building it.** Worktop depth is one declared constant, `600`, in the domain. It is the map's key and
the formula's input, and nothing reads it from a design, a store or a control.

- **Nothing is persisted.** `DesignSchema` (`packages/configurator-domain/src/design.ts`) is
  untouched: no field, no version bump, no migration. A design saved before M5 and one saved after
  are byte-identical in shape.
- **Nothing is settable.** No control in either shell, no store action, no command signature gains a
  worktop depth. M5 never holds two worktop depths at once, which is exactly why it never has to
  answer what happens when one changes.
- **The constant is declared at the top level, not buried.** It is configurable data in the sense
  `docs/best-practices/engineering-conventions.md` means, and M6 replaces the constant with a value
  read from the setting. **Write it so that swap is a one-line change**: one exported constant that
  the map lookup and the formula both read, never two copies — the same discipline work item 5
  applies to the map itself, and for the same reason.
- **The seam is named in both plans.** `docs/milestones/M6-price-and-global-settings.md` work item 4
  builds the control and cites this wave; this bullet cites that item. Neither milestone may assume
  the other did it.

### 7. Base carcass depth as a formula

**New 2026-08-27, and the most constrained item in the phase.** Base carcass depth = worktop depth
minus a fixed overhang (decision 3), replacing the literal `CARC_D = 0.56`.

- **`CARC_D` is a `const` inside `makeKit`'s closure** (`kitchen-parts.ts:552`), read at 24 sites in
  that file. `counter(w, d = 0.62, ...)` (`:588`) is a **default parameter**, not a literal, and none
  of its four call sites (`:624`, `:697`, `:749`, `:1284`) overrides it. So the mechanical change is
  to derive both from the declared worktop constant and thread them through `KitOptions` — which
  already exists (`:193`) and already carries one field — rather than to hunt literals.
- **The M1 fidelity gate is the binding constraint, and it is not negotiable by editing the test.**
  `packages/three-adapter/tests/kitchen-parts.parity.test.ts` builds every part twice — once by the
  unmodified vendored reference library, once by the port — and diffs mesh names, hierarchy, and
  transforms and dimensions at a **1e-6 m** float epsilon. Its own header states the epsilon is a
  floating-point-artefact allowance with nothing to do with §2's product tolerances. `countertop`
  and all six base builders are in its key list.
  **So at worktop 600 the formula must reproduce today's numbers exactly** — `CARC_D` 0.560 and the
  counter 0.620 — to the last micrometre. A formula that "tidies" a dimension by even a millimetre
  turns evidence 1 of M1's fidelity gate red, and the only honest ways out are to keep the values or
  to re-vendor the reference, which is a decision, not a wave's discretion.
  `kitchen-parts.decomposition.parity.test.ts` sits beside it and must be checked the same way.
- **Which makes the 600-versus-620 question load-bearing, not cosmetic.** `CARC_D` 0.56 and
  `counter`'s 0.62 sit 60 mm apart, and the counter is offset z +0.02, so it overhangs 10 mm behind
  the carcass and 50 mm in front (ADR 0018 measured the same numbers from the other side: the
  counter's back face at −0.290 against the carcass back at −0.280). The owner's map is keyed on a
  **600** worktop while the modelled counter is 620. The parity gate settles what the answer must
  *achieve* — today's geometry at 600 — but not which quantity the map's key names. Recorded under
  *Not established* as question 7, and the wave answers it before it picks the overhang constant.
- **ADR 0018 clause 4 does not necessarily fire, and the wave decides that deliberately.**
  **This corrects an earlier draft of this plan, which asserted the trap fires unconditionally.** It
  does not. Clause 4's trigger is a builder that **consumes the depth argument it is handed**, which
  is what makes the rebuild round trip feed back on itself and grow one step per save/reload
  (`0.58 → 0.62 → 0.66 → ...`) with `refuseBuiltSize` checking width and height only, so no gate sees
  it. Deriving `CARC_D` from a kit-level constant does **not** do that: the value is the same on
  every call, the round trip is exactly as convergent as it is today, and the trap stays inert.

  So the wave has a choice, and it must make it on purpose rather than discover it:

  - **Read the kit-level constant** (`baseCabinet` keeps ignoring its `depthM` argument). The trap
    stays inert, no ADR is needed, and the wave is small. **This is the shape M5 needs**, since the
    worktop cannot vary within M5.
  - **Consume the per-call depth argument.** Clause 4 fires, one of clause 3's two undecided
    directions must be chosen and recorded in an ADR **before** the change lands, and the wave grows
    a persistence decision.

  **Recommended: the first.** M5 has one worktop depth by construction, so the second buys nothing
  and costs an ADR plus a persistence change. If a wave finds a reason to take the second, that is a
  scope change to raise, not to absorb. **Either way, say in the dispatch which one was taken** —
  ADR 0018 exists precisely so this is not discovered by the phase that trips it.
- **The pin exists already and must be extended, not replaced.** ADR 0018 clause 2 pinned the actual
  invariant with a test: `2 × seatOffsetM` equals the requested depth for `wall-*` and `open-shelf`,
  and is explicitly *not* claimed for the rest. Under the recommended shape that pin holds unchanged
  and is the evidence the trap stayed inert; under the alternative its "not claimed" half changes
  deliberately for `baseCabinet`.
- **§11 row 19 is the invariant that must survive either way.** A back face lands on the wall plane
  at 0.000 for any body, whatever its bounding-box asymmetry, because the seat cancels it.

## Acceptance criteria

State invariants and what must not happen. Rows are `DEVELOPMENT-SPEC.md` §11.

### The boundary move

> **SUPERSEDED 2026-08-27 by [ADR 0031](../decisions/0031-a-resize-moves-a-whole-column-into-adjacent-empty-space.md).**
> These criteria describe §5.4's donor rule, which is replaced. Read ADR 0031's *Consequences* for how
> §11 rows 9–11 are re-read against the new rule: **row 9**'s boundary arithmetic still holds with the
> empty column in the neighbour's place; **row 10**'s floor still binds, as the empty column may not
> be left under `MIN_W`; **row 11 becomes vacuous rather than false**, because nothing donates any
> more. Rows 12, 13 and 14 are unchanged in intent, and row 12 now covers **every member of the
> resized column**.
>
> Four criteria below are **not** superseded and still bind, because they are about what a resize does
> to the model rather than where the width comes from: *a resize does not change either body's
> recorded depth*; *identity is declared, never inferred*; *a persisted design never holds a seeded
> `buildId` at a width that id cannot build*; and the whole of **Column identity** in the next
> section.

- Neighbours are found on the same wall, in the same row (vertical starts within 0.06 m), and
  edge-adjacent (within 0.03 m). Never in the row above or below — decision 1.
- When growing, the donor is the first of right-then-left that can give **and** would remain at or
  above `MIN_W`. When shrinking, it is the first of right-then-left that can give.
- The edited body's outer edge — the one away from the donor — holds. The donor's far edge holds.
  Only the shared boundary moves.
- **The run total is conserved.** No resize creates an overlap or a gap. Only deletion creates free
  space.
- **Row 9.** Resizing 600 → 800 beside a 600 mm neighbour leaves the neighbour at 400 and both outer
  edges unmoved.
- **Row 10.** 600 → 1000 is not offered, because it would push the neighbour under 300. The row's
  own reason, and it is true: `MIN_W` stays at 300 (2026-08-26 decision, below). A second reason
  holds independently — 1000 mm is in no chip set at all (§7, §13.1: two doors top out at 800) — so
  a test that only ever exercises 1000 proves the weaker of the two. Exercise the floor with a width
  that *is* offered: 600 → 800 beside a 400 mm neighbour must be refused, because 400 − 200 = 200 is
  under `MIN_W`.
- **Row 11.** Beside a corner or an appliance every chip is blocked: corners and accessories never
  donate. Reachable on the shipped design in both directions — `p25` (`base-corner-x-900`, wall A,
  0–900 mm) is `p0`'s left neighbour since ADR 0025, and `p4` at 2900–3500 has no right neighbour at
  all, so growing it must fall back to the left donor `p2` and growing it beyond what `p2` can give
  must refuse.
- **Row 12.** A resize preserves both the chosen finish and the chosen handle, for the donor as well
  as the edited body. (The recorded defect: resizing silently reset a sage door with black bars to
  default white with steel.)
- **Row 13.** Resizing a top-row unit leaves it push-to-open unless a handle was explicitly chosen.
  Choice beats default; default beats nothing.
- **Row 14.** The dishwasher accepts only 450 and 600 and the hood only 600 and 900; anything else is
  refused with a reason. Both are already catalogue data (`DISHWASHER_WIDTHS_MM`, `HOOD_WIDTHS_MM`)
  and stay there.
- When no donor qualifies, the refusal names the reason — which side was tried and why it could not
  give.
- **A resize does not change either body's recorded depth.** `frame.d` before and after is identical
  for the edited body and the donor. (Read the Risks section: the adapter's wall clamp is the
  mechanism that would violate this, and three seeded bodies are the cases.)
- **Identity is declared, never inferred.** The rebuilt body resolves its builder through the
  placement's own `buildId` when insertable, otherwise through the entry's `catalogEquivalentId`
  (ADR 0022). No mesh-tree inspection anywhere in the resize path (ADR 0011 Gap A, §6.3, §13.2).
- **A persisted design never holds a seeded `buildId` at a width that id cannot build.** After
  resizing `p2` (`base-drawer2-600`) to 800, the stored placement carries `base-panbank`, not
  `base-drawer2-600`. Anti-invariant: reloading a resized design must not throw `UnknownBodyError`
  and must not render the pre-resize geometry.

### Column identity

Each of these is silent today and none is currently tested.

- **A successful resize creates no new opening and destroys none.** Void set before and after
  matches one-to-one on column and `[y0, y0+h]`. A void's `w` may change where the column's MIN width
  changed; its existence may not. **Anti-invariant, measured as row B: growing `p2` 600 → 800 must
  not produce `A|2.60 w=600` and `A|3.20 w=600`.** Two openings appearing where nothing was deleted
  is the failure this criterion exists to catch.
- **A delete after a resize produces exactly one opening, at the resized width** — measured as row D:
  resize `p2` to 800, then delete it, gives `A|2.70 w=800`. Not two 600 mm voids at the old positions
  (row E).
- **Delete alone still keeps every column frozen.** §10's signature flow is the gate: clearing `p7`
  and `p24` yields three openings — `y0=0 w=700 h=860`, `y0=1500 w=700 h=700`, `y0=2200 w=700 h=400`.
  **Anti-invariant: it must not yield zero.** A global recompute on delete makes the delete do
  nothing, which reads on screen as a broken delete button and is a column bug (ADR 0011 Gap D).
- **Only the touched keys change.** After a resize, every column key the operation did not move is
  byte-identical — `w`, `d`, `top` and `regions` included. `regions` and `top` are load-time facts and
  a resize changes no body's `y0` or `h`.
- **A resize that lands a body on an existing column key merges into it rather than replacing it.**
  The resulting column's `w` is the MIN and `d` the MAX over all members, and its `regions` cover
  every member. Nothing is dropped. If the correct answer here is instead to refuse the resize, that
  is a decision to record, not to pick at implementation.
- **The update is expressible for re-split.** The column update takes the record set before and after
  and the frozen map, with no parameter named for the donor or the target. Falsifiable: a test that
  feeds it a record set where one body has become two, at the same total width, gets a coherent column
  map out — without touching the function.

### Depth (new 2026-08-27)

**The map is the single source — wave 5A.** Each of these is silent today.

- **The reported defect, as the customer reproduces it.** Delete a top-row cabinet in the shipped
  kitchen and insert a `wall-2door` back into the void it leaves: the built body is **330 mm** deep,
  matching its neighbours. Measured through the **real** builders and the real `BodyProbe`, not a
  fake — backlog 9 records that a fake probe reports back the depth it was handed and cannot see a
  depth defect at all. **Anti-invariant: it must not be 400.**
- **Delete-then-insert and swap agree over a base run.** Both routes to "a `wall-2door` in this
  top-row slot" build 330 mm. (This does *not* close backlog 10, which is the same divergence over
  a **column**, where the cap is lifted and the two routes give 600 and 680. That stays open and is
  named in *Not established*.)
- **A single declared map governs both numbers.** Falsifiable, and the criterion the whole wave
  exists for: **there is exactly one 330 in the source.** A test reads the map and asserts that §7's
  `nominalDepthMm` for every wall entry and §5.2's cap both equal `map[worktopDepthMm]` — so
  changing the map's row moves both, and no future edit can move one alone. That gate is what makes
  the fixture's 330 checkable rather than a number somebody typed.
- **A worktop depth with no row fails loudly.** No interpolation, no nearest row, no silent default.
  The refusal names the value it was given.
- **The uncapped path is untouched.** `wall-2door-600-deep-top` and `wall-2door-700-over-fridge`
  still build 600 mm over their columns, and the two openings above a cleared `fridge-free` still
  behave as `insert-depth.test.ts` pins them. **Anti-invariant: the map must not flatten a deep
  cabinet to 330.**
- **The hood is unchanged.** `hood-600` builds 500 mm before and after, and `HOOD_DEPTH_MM` still
  reads 500. Pinned as a regression precisely because the question is open: the day the hood is
  decided, this assertion changes deliberately.
- **A resize does not change a depth** — the existing criterion under *The boundary move*, now
  measured against 330 rather than 400. This is why 5A lands before 5C.

**The worktop stays a constant, and that is falsifiable — wave 5F.**

- **`DesignSchema` is byte-identical before and after M5.** A design saved on `main` today and one
  saved after 5F have the same shape and the same fields. Anti-invariant: no new key, no version
  bump, no migration entry in `MIGRATIONS`.
- **No control can reach it.** Grep-level and real: no store action, no command signature and no
  panel section takes a worktop depth. The value is reachable only as a declared constant.
- **One constant, two consumers.** The map lookup and the base formula read the *same* exported
  constant. Falsifiable: changing it in one place moves both the wall depth and the base carcass, and
  there is no second copy to forget. This is what makes M6's swap a one-line change.

**The base carcass formula — wave 5F.**

- **The M1 fidelity gate stays green, and it is the gate that matters here.**
  `kitchen-parts.parity.test.ts` and `kitchen-parts.decomposition.parity.test.ts` pass **unchanged**,
  diffing the port against the vendored reference at 1e-6 m. At worktop 600 the formula reproduces
  `CARC_D` 0.560 and the counter 0.620 exactly. **Anti-invariant: not one shipped dimension moves.**
  If a wave finds it cannot satisfy this, it stops and raises it — editing the parity suite to match
  new geometry destroys the only evidence that the port is faithful, and that is a milestone
  decision, not a wave's.
- **The formula is exercised beyond its one reachable input.** Worktop 600 is the only value M5 can
  produce, so the formula is otherwise untested arithmetic. Unit-test the function directly across
  600 and 700 (and a value with no map row) so M6's control does not become the first thing to
  discover it. Per `docs/WORKFLOW.md`: a few hand-picked examples are not evidence that the
  transitions work.
- **§11 row 19 survives.** An inserted body's back face lands on the wall plane within the tolerance
  M3 measured (3.6e-9 m on both walls), re-measured after the builder change.
- **The rebuild round trip still converges.** Build → measure → persist → reload → rebuild → measure,
  three cycles, every measurement identical. ADR 0018's compounding growth is the anti-invariant, and
  `refuseBuiltSize` checks width and height only, so **this needs its own assertion or nothing sees
  it**. Under the recommended shape (work item 7) it converges because nothing changed about how the
  depth reaches the builder — and that is the point of asserting it rather than assuming it.
- **ADR 0018 clause 2's pin is not weakened.** `2 × seatOffsetM` equals the requested depth for
  `wall-*` and `open-shelf`, and the "explicitly not claimed for the rest" half stays as it is unless
  the wave deliberately took the alternative shape, in which case the new claim is stated.
- **The worktop overhangs the carcass by one constant.** It does not scale with depth.

### The chip section

- ~~Chip sets come from the body's own legal sizes, resolved through the declared catalogue equivalent
  for a seeded body: 450/600 for the dishwasher, 600/900 for the hood, 600/800 for the sink (ADR
  0017), 400/600/800 for everything else.~~ **Superseded by ADR 0034**: the set is the intersection
  over the **column's** members, because that is what `setWidth` narrows against. The dishwasher's
  450 is gone (the `wall-cabinet` above `A|2.00` is not made at 450 — ADR 0033's gap between a
  one-door and a two-door; **not** the open shelf, which is a ladder and accepts it) and `p4`'s
  column gained a 300
  (a standard-ladder entry constrains by its floor alone). **1000 mm still does not exist.**
- **A chip is `free` if and only if `setWidth` at that width would succeed.** Not "it is in the set
  and is not the current width" — that is the promise M4 deliberately refused to make.
- `active` is the body's current width; `blocked` is a width no command can reach; both are
  unclickable, for different reasons, which is why the state stays three-valued while `isDisabled` is
  published resolved beside it.
- A `widthFlex: 'fit'` body built to its opening may sit at a width that is not in its set (a
  `wall-2door` in a 700 mm opening). Its own width joins the chip row, sorted — already implemented,
  must survive.
- The consequence line states where the width comes from and what the limits are, in the mockups'
  form: *"Lățimea se ia de la vecinul din dreapta (600 mm). Maxim 800 mm; sub 300 mm nu se coboară."*
  Unchanged from §9's own wording — the 300 in it is `MIN_W`, which does not move.
- The section renders only when the selection is a body, is not empty, and is not fixed-width —
  §9's `canWidth`, nothing folded in. A body whose set is empty gets **no section**, decided in
  `describeWidthSection`, so missing catalogue data fails loudly rather than silently.
- Read-only disables every chip, `free` included.
- **No free-form width entry.** Only module values exist; a numeric field invites invalid states and
  arithmetic the customer should not be doing. Rejected in §13.2 and **re-confirmed by the owner on
  2026-08-26** (backlog 2, option C), with the added reasoning that fixed sizes make the price far
  easier to pre-calculate.
- **Nothing in the chip path may assume a particular set.** Sets already run from one member
  (`fridge-free`, `[700]`) to three, and a later entry may bring a set M5 has not seen. Chip sets are
  catalogue data end to end; no width may be a constant in the resize logic or in the panel.

### The rejection banner becomes reachable (ADR 0024)

M4 closed with one acceptance criterion unmet on purpose: §9's rejection banner has **no reachable
path** through the panel, because every list is fit-filtered through the evaluation the command runs.
ADR 0024 says to revisit it here, and §5.4 is where a §9 control can legitimately refuse (row 10, row
11's no-qualifying-donor case).

- A refusal reachable in a browser: attempting a width no donor can fund renders the banner at the
  **top of the panel body, above every section** — the placement §9 calls out with its own WHY.
- Two of frame 2C's three requirements become testable in a browser: the chip is marked, and the
  valid value is retained. **The third — "the total does not move" — still waits for M6's price bar**,
  and stays carried rather than quietly satisfied.
- **This does not weaken the "never offer the impossible" rule.** The reachable refusal must come
  from a control the panel *offers* — a chip whose donor situation changed, or a genuine boundary —
  never from an offered chip that the command routinely refuses. If M5 finds itself building a list
  that offers what the engine refuses in order to photograph the banner, that is the defect ADR 0024
  refused to manufacture, and the criterion goes back to unmet with the reason recorded.

### Surfaces

- **Mobile (gate):** at 390 × 844, changing a width by tapping a chip visibly resizes both bodies in
  the scene, the chip row scrolls horizontally, and a blocked chip cannot be activated by touch.
  Verified by real interaction, per `docs/best-practices/browser-and-visual-qa.md` — tests alone do
  not prove a mobile claim. ADR 0023 applies: a tap on the scene must not also press the sheet.
- **Desktop (same phase, separate line):** identical chip components at the larger spacing scale in
  the 420 px rail. §10.1 holds by construction — the branch is CSS only.

## Waves

**Six since 2026-08-27**, because the work does not fit one dispatch under `docs/WORKFLOW.md`'s limit
(about five must-fix items and five production files). Each names its review tier, so the choice is
recorded rather than drifted into.

**The letters were reassigned when depth joined**, because the depth defect fix must land first and
inserting it as "5A0" would have made the ordering unreadable. The mapping, so a session holding the
old plan is not confused:

| Old | New | Work |
| --- | --- | --- |
| — | **5A** | The depth map (new) |
| 5A | **5B** | Seeded width sets |
| 5B | **5C** | `setWidth` and the column update |
| 5C | **5D** | Chip freedom and the panel |
| 5D | **5E** | Browser and mobile gate |
| — | **5F** | The base carcass formula (new) |

| Wave | Work | Production surface | Tier |
| --- | --- | --- | --- |
| **5A** | Work item 5: the worktop → wall depth map as the single source, worktop pinned at 600; §7 and §2 amended | `catalog.ts`, `commands/insert-fit.ts`, and the new map's own module | **Full** — a §11-anchored product rule, and the class of defect ADRs 0016, 0017 and 0021 each caught: a rule stated in prose that the data did not implement. Small, and the tier is cheap at this size |
| **5B** | Work item 1: seeded width sets resolved through `catalogEquivalentId`, and the two tripwire assertions turned over | `fixtures/kitchen-l-design.ts`, `queries/describe-selection.ts`, `catalog.ts` if the resolution lands there | **Full** — catalogue data of the same shape as 5A's |
| **5C** | Work items 2 and 4: `setWidth`, donor selection, the rebuild through the catalogue equivalent, and the column update | a new `commands/set-width.ts`, `void-engine.ts`, the command exports, shared insert-fit helpers | **Full** — domain algebra anchored to §11 rows 9–14 and to ADR 0011 Gap D |
| **5C2** | ADR 0032's engine half: `offersFor` publishes a verdict with the reason it already computes instead of filtering on fit, and backlog 13's width bound moves into `resolveWidth` gated on `sizesAreStandardLadder`, so insert and resize answer the width question the same way | `queries/offers.ts`, `commands/insert-fit.ts` | **Full** — it changes what §9 offers, which is the class ADRs 0016/0017/0021 each caught |
| **5C3** | ADR 0033: the door-count pairs merge into one entry each, and the door count **and its label** are derived at the builder's own threshold. Eight seeded `catalogEquivalentId` pointers repoint; ADR 0029's gate becomes "the label's threshold and the builder's threshold are one constant"; `sizesAreStandardLadder`'s population is re-examined | `catalog.ts`, `fixtures/kitchen-l-design.ts`, the label derivation, ADR 0029's gate test | **Full** — catalogue shape and a customer-facing label, superseding two same-day ADRs' mechanism |
| **5D** | Work item 3: the domain query behind chip freedom, the store action, the panel projection, the refusal wiring | `queries/width-options.ts` (new), `commands/set-width.ts` (the candidate helper), `configurator-store.ts`, `apply-command-result.ts`, `panel-model.ts`, `use-panel-view.ts`, `editor-panel.tsx` | **Shipped 2026-08-27, ADR 0034.** Planned Light; it ran **Full**, and the plan's own condition is why — the freedom answer does come from the domain, but the wave also had to move the chip *row* there, which is a change to what §9 offers. Seven production files against the ~five limit, declared rather than stretched quietly (`docs/WORKFLOW.md`, scope discipline): four of them are one-function seams |
| **5E** | The browser and mobile gate, and ADR 0024's reachable banner | e2e only | Adversarial QA plus **visual review**; no logic tier |
| **5F** | Work items 6 and 7: base carcass depth derived from the declared worktop constant, with the worktop staying a constant | `kitchen-parts.ts` (`CARC_D` and `counter`, threaded through `KitOptions`), and the shared constant 5A already declared | **Full** — the only wave in M5 that changes a builder, and the only one that can turn M1's fidelity gate red. It carries **an ADR only if it takes the alternative shape** in work item 7 (consuming the per-call depth argument, which trips ADR 0018 clause 4). Under the recommended shape it needs none, and the dispatch says which was taken |

**Why 5A is first and not folded into 5B.** Both are small catalogue-data waves and merging them is
tempting. They stay separate because they fail differently: 5A is a **shipped defect on a real
device** and 5B is missing feature data, and batching a live fix behind a feature's data delays the
fix for no gain. `docs/WORKFLOW.md`'s batching rule applies to fixes that "share a subject"; a depth
constant and a width set do not.

**Why 5F is last and not beside 5A.** Recorded in full under *How this splits inside M5*. In short:
it is the only wave that touches a builder and so the only one that can reach M1's 1e-6 m fidelity
gate; if its formula moves any base dimension it moves `Column.d` for a reason unrelated to resize,
while 5C is already moving column identity; and it sits next to ADR 0018 clause 4's trap, which it
must decide about deliberately rather than trip.

**Re-checked after the floor change left M5** (2026-08-26, still true): 5B lost the constant, the
copy change and the boundary-test moves, and is a single work item over two or three files. It stays
its own wave rather than folding into 5C for two reasons — 5C is already at four production files of
domain algebra, and 5B must land first: until a seeded body has a width set, `setWidth` has nothing
to be exercised against on the real kitchen and every test of it is synthetic. 5B being small is not
a reason to merge it into the largest wave in the phase.

**M5 is now six waves and that is worth saying out loud.** If the owner wants the milestone smaller,
the clean cut is **5F**: waves 5A–5E deliver the whole width story plus the reported depth defect,
and 5F is a self-contained follow-on. Cutting anything else breaks a dependency. Note what deferring
5F would cost, so the choice is informed: M6's worktop control needs the base formula underneath it,
so 5F would have to land somewhere before M6 ships its control — cutting it from M5 moves it, it does
not remove it.

## Risks

- **The wall depth cap, and it does touch resize. Rewritten 2026-08-27 — the previous version of
  this bullet was stale.** It cited `packages/three-adapter/src/catalog-bodies.ts:36` and
  `WALL_CARCASS_MAX_DEPTH_M`, and **neither exists in `src` any more**: backlog 5's wave moved the
  cap into the domain on 2026-08-26 as `WALL_CARCASS_MAX_DEPTH_OVER_WORKTOP_M`
  (`commands/insert-fit.ts:56`), because the cap became a function of the *design* and the adapter
  cannot see a design. The name survives only in that file's own historical comment (`:51`).

  What the bullet got right, and what still binds: on a swap the depth comes from the outgoing
  body's own `frame.d` (`openingFromPlacement`), and three seeded bodies record `frameDepthMm: 600`
  while declaring `catalogEquivalentId: "wall-2door"` — `p22`, `p23` (`wall-2door-600-deep-top`) and
  `p24` (`wall-2door-700-over-fridge`). A resize rebuilds through that equivalent. **But the cap no
  longer fires on any of the three**, because all three stand over a full-height column and
  `hasFullHeightUnder` lifts it. The 200 mm recession the old bullet warned of is fixed. The
  regression test it asked for is still worth having, now for the opposite reason — to prove the
  lift survives the resize path — and 5A's map must not reintroduce the problem by capping
  unconditionally.
- **`frame.d` is not a depth** (ADR 0018, narrowed further by ADR 0025): it is `2 ×` the body's
  wall-normal **seat offset**. A resize re-measures and re-persists it. Today the round trip
  converges for every builder — the base builders ignore the depth argument, and `wallCabinet` /
  `openShelf` consume it and are centred on z = 0 — so the resize is safe. **It stops being safe the
  day a builder's depth is parameterised**, and ADR 0018 clause 4 assigns that trap to whichever
  phase does it. **Amended 2026-08-27: that phase is this one, and the wave is 5F.** The trap is no
  longer a risk to hand onward; it is a work item with an ADR of its own (work item 7). What stays a
  risk for 5C is narrower — the resize path must not bake in an assumption that the base builders
  ignore their depth argument, because 5F makes that false two waves later.
- **The map could be made to look like a formula, and it is not one.** 600 → 330 and 700 → 400 sits
  almost on a line, and the next reader will be tempted to write `worktop × 0.55` or to interpolate a
  missing row. Decision 4 forbids it: wall cabinets come in manufactured sizes and the owner's own
  numbers are non-linear, so a formula invents a 372 mm cabinet nobody makes. The gate is that an
  unknown worktop depth **fails** rather than computing something.
- **The seeded fixture is currently the only thing asserting 330, and it asserts it by being typed.**
  Nine rows carry the number and no gate compares them to the catalogue or the cap — which is
  exactly how the drift happened. 5A's single-source test is what turns that from a coincidence into
  a checked relationship, and it is the criterion the wave stands or falls on.
- **Backlog 9 records that the domain's own tests cannot see a depth defect.** A fake `BodyProbe`
  reports back the depth it was handed, so a wrong depth reads correct throughout. Every depth
  assertion in 5A and 5F must run against the real builders and the real probe, or it proves
  nothing. This is the single most likely way this phase ships a green suite over a live defect.
- **Auto-shifting the whole run to make room.** Rejected on record (§13.2): positions carry meaning —
  sink under the window, hob under the hood, dishwasher beside the sink — and silently sliding a run
  breaks those relationships invisibly. If ever wanted it must be an explicit named action.
- **Rebuild dropping the recorded finish and handle.** Row 12 exists because this happened. The
  rebuild path re-applies both, for the donor as well as the edited body. `setFinish` was decoration
  for the whole of M4 until the finish wiring landed — this is the same class of defect and the same
  place to look.
- **Chip taps are writes.** The save coalescer has no minimum interval (`docs/STATUS.md`): its
  sustained output is bounded by round-trip time, not by a timer. ADR 0019 decision 6 adds a 1 000 ms
  floor and it is unimplemented. M5 makes width taps repeatable; the risk is real but the fix is out
  of scope above, and it is the owner's call whether it joins.
- **The column merge case.** A resize can move a body onto a key that already exists. The criterion
  above chooses merge; that choice is not derived from a spec section and should be reviewed as a
  decision.
- **The width floor already has a direction, and M5 must read it. Rewritten 2026-08-27 — the
  previous version of this bullet was stale.** It said the direction "is about to" be gained and
  that M5 must not pre-empt it. **ADR 0026 shipped it on 2026-08-26**: §2's `MIN_W` is the *default*
  floor, a `minWidthMm` below it replaces it for that entry alone, and `base-bottle-cargo` declares
  200.

  The risk is now sharper, and backlog 6 states it. **`MIN_WIDTH_M` is the donor's floor, not the
  target's.** ADR 0026 kept the constant at 300 *because §5.4 reads it* — a resize must not leave a
  200 mm cabinet as the residue of somebody else's edit — and that reasoning is entirely about the
  neighbour that gives width away. A resize path that applies the same constant to the **target**
  refuses the cargo's 200 mm chip, and a capability the catalogue already declares lands nowhere.
  The target reads the entry's own declared floor; the donor reads §2's. Two floors, one constant
  each, and a path that hard-codes 300 gets both wrong.
- **A wave building the control anyway.** The owner scoped the control to M6 on 2026-08-27, and 5F
  will feel one small step from a settings chip. It is not: a control needs a persisted value, and a
  persisted value needs the migration question below answered. **Scope-Out names this explicitly and
  a dispatch that widens it is a scope change to raise, not to absorb** — `docs/WORKFLOW.md`, scope
  discipline.
- **The reverse risk, and it is the more likely one: both milestones assuming the other built it.**
  *Setări globale* is M6's surface (2E / D2E) and the geometry is M5's. M6 work item 4 now names this
  wave and this plan names that item. Keep the two in step; if 5F's shape changes, M6's item 4 is
  edited in the same pass.
- **The migration question travels with the control to M6, and M6 must not discover it at
  implementation.** Switching 600 → 700 changes every base body's depth in a document the customer
  already saved. Migration, re-derivation on load, or refusal — recorded under *Not established* and
  flagged as M6's to answer. M5 never has two worktop depths in play, so it never meets the question;
  M6 meets it on its first tap.
- **M6's control has a prerequisite most of M6 does not.** Material and hardware are presentation and
  pricing; worktop depth is geometry. If 5F is cut from M5, M6 item 4 cannot ship its fourth control
  until the formula lands somewhere.
- The approved discrete width set remains an open product question (`docs/milestones/README.md`).
  400/600/800 and the appliance sets are catalogue data and must never become constants in the resize
  logic.

## Conflicts raised, and how they were resolved

Per `docs/WORKFLOW.md`, a recorded decision is not overturned silently. An earlier draft of this plan
flagged three collisions rather than resolving them. All three were answered on **2026-08-26**; the
reasoning is kept because it is the valuable part, and because the rejected options are the ones that
cost a cycle if they are re-proposed.

**1. `MIN_WIDTH_M` stays at 300 mm. Decided by the owner; the narrower option won.**

*What was flagged.* `MIN_WIDTH_M` is the floor `resolveWidth` applies to **every** `widthFlex: 'fit'`
body (`insert-fit.ts:333`), and a per-entry `minWidthMm` (ADR 0017) can only raise it. So dropping the
constant to 0.2 for the narrow bottle cargo (backlog 2) would have made all six base entries and all
five wall entries insertable at 200–300 mm into any opening that narrow — **a 220 mm two-door base
cabinet, buildable and offerable, and not a product.** §2 describes `MIN_W` as "the narrowest
cabinet"; §9 requires that nothing be offered that cannot be satisfied.

*What was decided.* The constant does not move. **The bottle cargo is a single declared exception**,
carried by its own entry when that entry is built. One entry carries an exception rather than eleven
carrying a correction — which is what the plan's own recommendation (drop the constant, then declare
`minWidthMm: 300` on eleven rows) would have required. The remedy was sound; the owner chose the
change with the smaller blast radius, and it needs no new data on any existing row.

*The mechanism this defers.* ADR 0017's `minWidthMm` gains a **downward** direction, for one entry, in
the cargo's own ADR. §2's `MIN_W` then means "the default floor" rather than "an absolute floor", and
that re-reading is recorded there, not assumed here. It is named in Scope-Out and in Risks so the
phase that builds the cargo meets it before it writes the entry, rather than after.

*What happened next (2026-08-27).* It stopped being deferred. **ADR 0026 was written and the cargo
shipped on 2026-08-26**, the same day this section was written — the plan's text above was accurate
for a few hours and then was not. The three paragraphs are kept because the reasoning and the
rejected alternative are the valuable part and re-proposing them costs a cycle; the *sequencing*
claim in them is spent. What M5 inherits is backlog 6's trap, not a prohibition: the target's floor
is the entry's own and the donor's is §2's. Scope-Out and Risks have both been corrected in place.

*Also rejected, recorded so it is not re-proposed.* **Raising the general floor to 400 mm.** The
standard chips are already 400/600/800, so nothing a customer chooses sits below 400; the 300 floor
governs only a `'fit'` body filling an odd opening, and raising it would start refusing openings that
work today. Raised, then set aside.

**2. §11 row 10 keeps its original reason, and the criteria revert to it.** The earlier draft rewrote
row 10 against "1000 mm is in no chip set", because at `MIN_W` 200 the row's stated reason — "would
push the neighbour under 300" — would have stopped being true. With the constant unchanged the stated
reason is true again, and the criteria above say so. The knock-on the draft worried about is closed by
the same decision: **a 200 mm cabinet can never appear as the residue of somebody else's resize**,
because §5.4's donor rule refuses to shrink a neighbour below 300. The owner's rule, verbatim: "the
200 cabinet will not be automatically inserted, it should be deliberately selected." No second
constant is needed, and the donor floor and the catalogue floor stay one number.

**3. A citation in the backlog was wrong, and has been corrected there.** Backlog 2 cited ADR 0015 for
boundary tests "pinned at 299/300". ADR 0015 is the **`MIN_SPAN_M`** record — the shortest *vertical*
free interval that becomes an opening — and neither its rule (min span is exclusive) nor its value
moves. The width-floor tests are a different set of files. The backlog has been corrected and the
near-miss recorded rather than silently fixed, which matters because "lower the value in ADR 0015" is
precisely the wrong-constant edit that entry exists to prevent. Nothing in M5 depends on it any more,
now that the floor is not moving at all.

## Wave 5D2 — the width stepper (ADR 0035)

Decided by [ADR 0035](../decisions/0035-width-is-a-bounded-stepper-not-a-menu-of-sizes.md). This
section is *how*, in three sub-waves. They are sequential and each one compiles, lints and leaves the
suite green on its own — `docs/WORKFLOW.md`'s five-production-file guidance is what splits them, and
the order is data model, then behaviour, then presentation, so that no sub-wave renders a control
over an engine that cannot yet answer it.

### 5D2a — the catalogue's width model becomes a bound

`sizesMm` stops being a hand-maintained menu for cabinetry rows and becomes a floor, a ceiling and a
step. Appliance rows — anything `fixedWidth: true` — keep a discrete set, which is the shape they
genuinely have.

- Replace `STANDARD_WIDTHS_MM` / `STANDARD_LADDER` / `sizesAreStandardLadder` with a bounded range.
  ADR 0033's second amendment already publishes ranges, floors and chips as three separate facts on
  `CatalogOffer`; this is that model reaching the entry table it was inferred from.
- **Move `TWO_DOOR_MIN_WIDTH_MM` from 450 to 500 and the comparison from `>` to `>=`.** Forced, not
  incidental: `w > 450` makes 500 and 550 two doors of 250 mm each, and relative stepping reaches
  470. The constant's name has described a one-door value since it was written.
- ADRs 0026, 0029, 0030 and the door-count halves of 0033 survive as bounds. Their *rules* are
  acceptance criteria for this sub-wave; their *lists* are what is deleted.

Risk, and it is the whole reason this is its own sub-wave: `resolveWidth`, `resolveBuildableSizes`
and the insert path all read `sizesMm`. A range that silently widens what `insertBody` offers is
backlog 13 reappearing — ADR 0032 moved that bound into `resolveWidth` precisely so insert and resize
answer the width question the same way, and that must still hold at the end.

### 5D2b — square-up, and shrinking that creates space

Two behavioural rules from ADR 0035, both in `setWidth`.

- **A column is one width at every level**, and a resize squares a mixed column up rather than
  refusing it. `COLUMN_MEMBERS_UNALIGNED` has 15 lockouts in the shipped design; they become
  editable.
- **Shrinking creates adjacent empty space.** Without this, ADR 0031's consequence stands — the
  shipped kitchen has no empty column at load, so nothing is resizable until something is deleted,
  and a stepper whose buttons are always disabled is not worth rendering.

These are measured together on the shipped kitchen, not separately, because every path through them
starts from a delete today and stops needing to after this sub-wave.

### 5D2c — the panel renders a stepper

- `widthOptionsFor` becomes a step query: the current width, and a verdict for each of the two
  candidates. It keeps 5D's mechanism exactly — **judge by running `setWidth` and discarding the
  design** — so "offered" and "accepted" still cannot drift apart.
- Two controls, per ADR 0035 decision 3: `+50` / `−50` where width is free, a discrete choice where
  an appliance fixes it. A button at a bound is **disabled carrying its reason** (ADR 0032), never
  absent.
- 5D's pinned chip counts retire with the chips. The property test is rewritten stronger: at every
  reachable width, each button is enabled if and only if the step it offers succeeds.
- §9's width note is rewritten again. It was a customer-facing blocker in 5D for describing a
  surface that had changed; the same trap is open here.

### Not in 5D2

ADR 0037's column merge. It is decided but unassigned, it is not required by the stepper, and
`deriveColumns`' horizontal freeze gaining its first exception deserves its own measurement.

## Not established, and left flagged

- **Whether a resize should merge into an existing column key or refuse.** No spec section covers a
  body arriving at an occupied key; merge is chosen above because it matches `deriveColumns`'s own
  MIN/MAX semantics, but it is a choice.
- **What the bottle cargo's exact size set is.** Backlog 2 says "200–300, its own set"; the members
  are not established, and M5 does not need them.
- **Whether a resized body should keep the resized width when its opening later changes.** Nothing in
  §5.4 says, and no measurement exists.
- **The chip row's horizontal scroll behaviour at a set of two versus a set of five.** The mockups
  show three; 5E's browser pass is the first place this can be observed rather than assumed.

### Depth — recorded 2026-08-27, and none of these is decided

The owner has ruled on the six decisions above and on nothing here. **Each of these is a question,
not a gap to fill at implementation.** Each is tagged with who needs the answer: **M5** questions
gate a wave in this phase, **M6** questions travel with the control and are noted in
`docs/milestones/M6-price-and-global-settings.md` so they are not lost at the seam.

1. **Does the hood follow the rule?** — **M5 asks, nobody is blocked.** `HOOD_DEPTH_MM = 500` (`catalog.ts:73`) and the seeded
   `hood-600` already agree at 500, so nothing is broken today and 5A can proceed by leaving it
   alone. But a hood is a wall body over a worktop, and if the map governs wall depth it is not
   obvious why 500 is exempt. Related, and worth putting to the owner together: **backlog 9** — a
   hood round trip costs a wall opening 100 mm permanently, because `make.hood` takes no depth
   parameter at all and its canopy is a hardcoded 0.5 m box. Deciding the hood into the map means
   deciding whether `make.hood` gains a depth parameter, which is ADR 0018 clause 4 territory again.
2. **Is 800 real?** — **M6.** `800 -> 500` was named as a plausible future row and explicitly not
   committed. It reaches M5 only as a requirement that the map be extensible by one row, which 5A
   satisfies either way. It reaches M6 as the difference between a two-way toggle and a list of
   three.
3. **Does a 700 worktop change wall cabinet HEIGHT, or only depth?** — **M6, but M5 should ask.**
   Nothing in the owner's decisions says. §7 fixes wall entries at `nominalHeightMm` 700 and the
   seeded `-top` rows at 400, and `heightFlex` fills the opening. M5 never reaches it, because 600 is
   the only worktop it has. But if height moves too, §2's `LEVELS` move with it — and `LEVELS` is the
   spine of the void engine, so that is a far larger change than a second map row, and M6 should not
   be the first to find out. Worth putting to the owner during M5 even though no M5 wave is blocked.
4. **What happens to a design saved at 600 when the setting moves to 700?** — **M6, and it blocks
   M6's control.** Every base body's depth changes, and every capped wall body with it. Three shapes
   of answer, none chosen: **migrate** (rewrite the stored placements once, which needs a schema
   version and makes the change irreversible), **re-derive on load** (the stored document keeps only
   the setting and depths are computed, which is the cleanest but makes `seatDepthMm` a cache rather
   than a fact and contradicts ADR 0018's "the body's own measured seat"), or **refuse** (the setting
   is fixed once placements exist, which is defensible for a tool where the customer picks the
   worktop before laying out the kitchen). **M5 never meets this question** — one worktop depth, by
   construction — which is exactly why the owner's split works. M6 meets it on its first tap.
5. **The two deliberately-deep top bodies — do they track anything?** — **M6.**
   `wall-2door-600-deep-top` and `wall-2door-700-over-fridge` are 600 mm because the columns beneath
   them are, and the cap is lifted rather than mapped. If the worktop goes to 700 the base run
   deepens and `Column.d` over it rises, while these two stay at whatever their column is. Nothing
   says whether a deep top cabinet should follow the worktop, follow its column, or stay put. No M5
   wave reaches it, because the worktop does not move in M5.
6. **What number is the map's value — the carcass, or the carcass plus its door?** — **M5, and it
   gates wave 5A.** §2's own worked
   example has "a unit at `position.x = 0.165` with `D = 0.33`" spanning world x `0 → 0.369`: the
   door adds 39 mm in front. The owner's manufactured sizes (300 / 330 / 350 / 400) are presumably
   carcass depths, and the code treats the map's value as the depth argument handed to
   `wallCabinet`, which is the carcass. Worth confirming once rather than assuming, because a map
   read as the finished depth is 39 mm wrong on every row.
7. **Is the shipped worktop 600 or 620?** — **M5, and it gates wave 5F.** Work item 7's third
   bullet. `counter`'s 0.62 against `CARC_D` 0.56 is 60 mm of overhang, 50 of it in front, while the
   owner's map is keyed on 600. The M1 parity gate already fixes what the formula must *produce* at
   the default — today's geometry, to 1e-6 m — so this is not a licence to change a dimension. What
   it decides is which quantity the constant names and therefore what the overhang constant is, and
   5F cannot pick that number without it.
8. **Backlog 10 is untouched by any of this.** Delete-then-insert gives 680 mm over the fridge
   column where a swap gives 600, because the cap is lifted there and both numbers are legitimately
   the column's. The map governs the *capped* path only, so this divergence survives 5A intact. It
   is recorded as needing the owner, and the third of its three readings — "they should simply
   agree, whichever value wins" — is still the one worth deciding first.

## Verification

- Table-driven tests for rows 9–14, asserting the resulting widths of **both** bodies and the two
  edges that must not move.
- A sweep over donor configurations: no donor, left-only, right-only, both, corner-adjacent,
  accessory-adjacent, and donor-would-go-under-minimum. On the shipped design rather than only on
  synthetic worlds — `p0` has a structural corner on its left (ADR 0025) and `p4` has nothing on its
  right, so both edges of the sweep exist in real data.
- Assertions that the sum of widths along the affected run is identical before and after every
  successful resize.
- **The four column-identity regressions, each named for the failure it catches**: no new opening
  after a resize (row B), one opening at the resized width after resize-then-delete (row D), the
  §10 signature flow still yielding three openings after a plain delete (Gap D), and every untouched
  column key byte-identical.
- A property test over the whole seeded kitchen: for every selectable body, every chip the panel
  marks `free` is a width `setWidth` accepts, and every chip it marks `blocked` is one `setWidth`
  refuses. This is the assertion that keeps M4's tri-state honest once `free` becomes reachable.
- The three "no chip is ever free" tests rewritten, not deleted, with the new property in place.
- The two seeded width-section tests flipped from "renders nowhere" to their real content, and the
  chipless check doing work for the first time.
- Real touch interaction at 390 × 844, and a browser observation of the rejection banner.

Depth (added 2026-08-27). **Every item here runs against the real builders and the real `BodyProbe`
— backlog 9 records that a fake probe returns the depth it was handed and cannot see a depth defect
at all.**

- **The single-source gate**, which is 5A's reason to exist: a test that reads the map and asserts
  §7's `nominalDepthMm` for every wall entry and §5.2's cap both equal `map[worktopDepthMm]`. It
  must fail if either is edited alone.
- **The reported reproduction, end to end**: delete a top-row cabinet from the shipped design,
  insert a `wall-2door` into the void, assert 330 mm. Anti-invariant: not 400.
- **A sweep over every wall/top body in the fixture**, each keeping its own depth through a
  delete-then-insert and through a swap — the nine at 330, `hood-600` at 500, and the two deep top
  bodies at 600. One table, so a rule that moves the wrong subset is visible in one failure.
- **An unknown worktop depth is refused**, with the value named.
- **`DesignSchema` unchanged across the whole phase**: a design saved before M5 and one saved after
  5F have the same shape, and `MIGRATIONS` gains no entry. The worktop is a constant, not a field.
- **The M1 parity suites pass unchanged after 5F** — `kitchen-parts.parity.test.ts` and
  `kitchen-parts.decomposition.parity.test.ts`, diffing the port against the vendored reference at
  1e-6 m. Run them and quote the result: they are the evidence that the formula is value-preserving
  at worktop 600, and they are the gate 5F is most likely to break.
- **The formula unit-tested across 600, 700 and an unmapped value**, directly rather than through the
  single input M5 can reach — so M6's control is not the first thing to exercise it.
- **The rebuild round trip, three cycles**: build → measure → persist → reload → rebuild → measure,
  with every measurement identical. ADR 0018's compounding growth is the anti-invariant, and no
  existing gate catches it.
- **§11 row 19 re-measured after 5F**, on both walls, for the same seven bodies M3 measured at
  3.6e-9 m.
- **A browser observation at 390 × 844** that the re-inserted top-row cabinet is flush with its
  neighbours. This defect was reported from a handset by eye; per
  `docs/best-practices/browser-and-visual-qa.md` a passing test is not what closes it.
