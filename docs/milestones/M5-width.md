# M5 — Width editing as a neighbour boundary move

> **STATUS: PLANNED.** Depends on M4 (shipped 2026-08-26). Summary: `docs/STATUS.md`.

Status: planned. Depends on M4.
Reference: `DEVELOPMENT-SPEC.md` §5.4, §3.2, §3.3, §4, §7, §9 item 6, §12, §13.1, §13.2, §13.3;
§11 rows 9–14 and 20.
Decisions: ADR 0011 (Gap A, **Gap D**), 0015, 0016, 0017, 0018, 0021, 0022, 0024, 0025.
Backlog entries this plan consumes: `docs/BACKLOG.md` **4** in full, **2**'s design obligation only,
and the edges of **1** and **5**.

**This plan was rewritten on 2026-08-26**, after M4 shipped and after five product decisions were
taken the same day, then amended later that day when the owner resolved the conflicts it raised. The
original was written against the pre-M4 codebase and said nothing about column identity — the one
thing §5.4 breaks and the reason this phase is not just an arithmetic exercise. What survives from
it: §5.4's mechanics, the donor rule, the chip states, rows 9–14, and the rejected directions. What
is new is marked as such.

## Goal

Changing a cabinet's width moves the boundary it shares with one neighbour **in the same row**. The
run total is conserved, so overlap is unrepresentable and shrinking cannot leave a gap. **The
columns the resize moved are updated; every other column stays frozen.**

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

## Scope

**In.**

- `setWidth(target)` in the domain: donor selection, the boundary move, rebuild of both bodies.
- The column update that a resize implies, and the frozen-column guarantee that `remove` keeps.
- Width sets on the seeded catalogue entries, so the width section renders on a real body at all.
- The width chip section's three states, its consequence line, and the resize refusal path.
- §9's rejection banner becoming **reachable** for the first time (ADR 0024).

**Out, and named rather than assumed.**

- **Run re-split.** §12's "a run's total offered as valid module combinations". The owner **decided
  on 2026-08-26 that re-split is wanted** (backlog 2, option B; free-form width stays rejected,
  confirming §13.2). It is not built here, but **M5's column-identity model must be designed so that
  re-split does not require redesigning it again** — see work item 4 and its criterion. The previous
  version of this plan said re-split "is designed but not built and is explicitly out of scope
  (§12, §13.3 q2)"; that sentence is now wrong as a statement of intent and right only as a statement
  of sequencing.
- **The two hob-bearing entries and the narrow bottle cargo** (backlog 1 and 2). New builders,
  entries, labels and an ADR each; not M5's job.
- **`MIN_WIDTH_M` stays at 300 mm.** An earlier draft of this plan moved it to 200 for the narrow
  bottle cargo (backlog 2). **The owner decided on 2026-08-26 that it does not move** — see
  *Conflicts raised, and how they were resolved* below for the reasoning and the rejected
  alternatives. Two consequences bind M5: §5.4's donor rule keeps its 300 mm floor exactly as §11
  row 10 states it, and the consequence line keeps "sub 300 mm nu se coboară". `MIN_SPAN_M` was never
  in question and stays at 300 for its own, different reason (ADR 0015).

  **The mechanism the cargo needs does not exist yet, and M5 does not build it.** ADR 0017's
  per-entry `minWidthMm` can only *raise* the general floor (`insert-fit.ts:333` applies
  `MIN_WIDTH_M` first, and the entry's own value above it); the cargo needs to *lower* it for one
  entry. Gaining that downward direction changes what §2's `MIN_W` means — "the default floor"
  rather than "an absolute floor" — and that wording change must be recorded in the cargo's own ADR
  rather than assumed. Whoever builds the cargo does that first; M5 must not pre-empt it.
- **The wall depth rule** (backlog 5: the depth cap follows what is below the opening). Not M5's
  work — but it **does** touch resize, and the plan says how in the Risks section rather than
  assuming either way.
- **The save coalescer's 1 000 ms floor** (ADR 0019 decision 6, still unimplemented per
  `docs/STATUS.md`). Every chip tap writes; M5 makes taps repeatable. Named as a dependency, not
  silently adopted — if the owner wants it in M5 it is a fifth work item, not a free rider.
- **Column reordering** (*Mută la stânga/dreapta*). §13.2's rejection stands, and backlog 4 confirms
  it: with independent per-level widths the customer resizes each level instead.
- **§13.3 q1** (unifying occupied swap sets with the fit-filtered catalogue). Still open, still not
  decided here.

## Work items

Four items, in dependency order. They do not fit one dispatch under `docs/WORKFLOW.md`'s scope
limit, so they are dispatched as four waves — see *Waves* below.

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

§5.4's mechanics, unchanged from the previous plan:

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

## Acceptance criteria

State invariants and what must not happen. Rows are `DEVELOPMENT-SPEC.md` §11.

### The boundary move

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

### The chip section

- Chip sets come from the body's own legal sizes, resolved through the declared catalogue equivalent
  for a seeded body: 450/600 for the dishwasher, 600/900 for the hood, 600/800 for the sink (ADR
  0017), 400/600/800 for everything else. **1000 mm does not exist.**
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

Four, because the work does not fit one dispatch under `docs/WORKFLOW.md`'s limit (about five
must-fix items and five production files). Each names its review tier, so the choice is recorded
rather than drifted into.

| Wave | Work | Production surface | Tier |
| --- | --- | --- | --- |
| **5A** | Work item 1: seeded width sets resolved through `catalogEquivalentId`, and the two tripwire assertions turned over | `fixtures/kitchen-l-design.ts`, `queries/describe-selection.ts`, `catalog.ts` if the resolution lands there | **Full** — catalogue data of exactly the shape ADRs 0016, 0017 and 0021 each caught: a rule stated in prose and absent from the row. Small, and the tier is cheap at this size |
| **5B** | Work items 2 and 4: `setWidth`, donor selection, the rebuild through the catalogue equivalent, and the column update | a new `commands/set-width.ts`, `void-engine.ts`, the command exports, shared insert-fit helpers | **Full** — domain algebra anchored to §11 rows 9–14 and to ADR 0011 Gap D |
| **5C** | Work item 3: the domain query behind chip freedom, the store action, the panel projection, the refusal wiring | `configurator-store.ts`, `apply-command-result.ts`, `panel-model.ts`, the panel component | **Light** — assembly against a contract 5B settled, *provided* the freedom answer comes from the domain. If any of it lands in `panel-model.ts`, the wave is Full |
| **5D** | The browser and mobile gate, and ADR 0024's reachable banner | e2e only | Adversarial QA plus **visual review**; no logic tier |

**Re-checked after the floor change left M5** (2026-08-26): the wave count does not change. 5A lost
the constant, the copy change and the boundary-test moves, and is now a single work item over two or
three files. It stays its own wave rather than folding into 5B for two reasons — 5B is already at
four production files of domain algebra, and 5A must land first: until a seeded body has a width set,
`setWidth` has nothing to be exercised against on the real kitchen and every test of it is synthetic.
5A being small is not a reason to merge it into the largest wave in the phase.

## Risks

- **The wall depth clamp, and it does touch resize.** Checked rather than assumed. On a swap, the
  depth comes from the outgoing body's own `frame.d` (`insert-fit.ts`, `openingFromPlacement`), and
  the adapter then clamps every wall carcass to `min(d, 0.4)`
  (`packages/three-adapter/src/catalog-bodies.ts:36`, `WALL_CARCASS_MAX_DEPTH_M`). Three seeded
  bodies record `frameDepthMm: 600` and declare `catalogEquivalentId: "wall-2door"` — `p22`, `p23`
  (`wall-2door-600-deep-top`) and `p24` (`wall-2door-700-over-fridge`). A resize rebuilds through
  that equivalent, so **resizing any of the three recedes it 200 mm**, by the same mechanism as the
  swap-depth defect and in the same direction. Backlog 5 owns the rule (the cap is head clearance
  over a worktop, and there is nothing to lean over above a column); M5 owns not making it worse.
  Pair the resize with a regression test over these three bodies asserting each keeps its depth.
- **`frame.d` is not a depth** (ADR 0018, narrowed further by ADR 0025): it is `2 ×` the body's
  wall-normal **seat offset**. A resize re-measures and re-persists it. Today the round trip
  converges for every builder — the base builders ignore the depth argument, and `wallCabinet` /
  `openShelf` consume it and are centred on z = 0 — so the resize is safe. **It stops being safe the
  day a builder's depth is parameterised**, which is exactly what backlog 5 and ADR 0017's real fix
  both point at. ADR 0018 clause 4 assigns that trap to whichever phase parameterises a depth; if
  M5's rebuild path makes that phase's job harder, say so rather than absorbing it.
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
- **The width floor is about to gain a direction it does not have, and M5 must not pre-empt it.**
  `MIN_WIDTH_M` stays at 300 (decision below), and ADR 0017's per-entry `minWidthMm` can only raise
  it — `resolveWidth` applies the general floor first and the entry's own value above it
  (`insert-fit.ts:333`). The narrow bottle cargo needs the opposite: one entry declaring a floor
  *below* the general one. That change belongs to the cargo's phase and its ADR, and it re-reads §2's
  `MIN_W` as "the default floor" rather than "an absolute floor". The risk for M5 is a resize path
  that hard-codes 300 anywhere instead of reading `MIN_WIDTH_M` and the entry's declared floor
  together; the day the direction is added, such a path refuses a cabinet the catalogue permits.
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

## Not established, and left flagged

- **Whether a resize should merge into an existing column key or refuse.** No spec section covers a
  body arriving at an occupied key; merge is chosen above because it matches `deriveColumns`'s own
  MIN/MAX semantics, but it is a choice.
- **What the bottle cargo's exact size set is.** Backlog 2 says "200–300, its own set"; the members
  are not established, and M5 does not need them.
- **Whether a resized body should keep the resized width when its opening later changes.** Nothing in
  §5.4 says, and no measurement exists.
- **The chip row's horizontal scroll behaviour at a set of two versus a set of five.** The mockups
  show three; 5D's browser pass is the first place this can be observed rather than assumed.

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
