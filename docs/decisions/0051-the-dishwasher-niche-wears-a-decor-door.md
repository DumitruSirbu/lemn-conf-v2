# ADR 0051 — The dishwasher niche wears a decor door

Status: Accepted
Date: 2026-09-01
Type: Decision
Milestone: M5B — Manual UX remediation, wave 5B10

## Context

`docs/BACKLOG.md` entry 11 has been open since 2026-08-27, when the catalogue-wide capability gate
(`packages/three-adapter/tests/catalog-capability-parity.test.ts`) found `base-dishwasher` declaring
two capabilities its geometry does not have. `dishwasherHousing`
(`packages/three-adapter/src/kitchen-parts.ts:1438`) builds an **open niche** — plinth, two sides, a
back panel, `builders.dishwasher` inside it, and a worktop — and inherits `canFinish: true,
canHandle: true` from `INSERTABLE_DEFAULTS`.

**Re-measured live at the mobile viewport on 2026-09-01**, during wave 5B6's visual verification:

- Five finish chips are enabled and the pick is *recorded* — `finish-graphite` comes back
  `aria-pressed="true"` with no rejection — and the fascia stays `222,223,221` under all four solid
  finishes while its immediate neighbour tracks each one. The customer is told the choice was
  accepted and nothing changes.
- The reason is exactly ADR 0050's: the builder produces no `door_front`/`drawer_front` mesh, so
  `finishes.ts`'s `FRONT_MESH_NAME = /door_front|drawer_front/` reaches nothing and `collectFronts`
  returns `[]`. The appliance's own `dw_panel` **is** built in `M.door` and its front face lands on
  the same plane as a neighbouring cabinet door — it is default white by coincidence, not by choice.
- `handle: "push"` hides the **dishwasher's** own bar: `hidesHandles` accepts the mode because
  `canHandle` is `true`, and `setHandlesVisible` walks every `handle` mesh in the group. That is
  `fridge-free-700`'s live defect (ADR 0027's amendment) on a second body.

Entry 11 framed the product question first and named the one-line fix it would displace: *"an
integrated dishwasher in a real kitchen usually wears a decor door matching the cabinets. If that is
wanted, the answer is not to turn the flags off but to give the builder a front — in which case the
flags were right all along and the geometry is what is missing."*

**The owner decided it on 2026-09-01: give `base-dishwasher` a decor door front**, following the
precedent of Q6 and [ADR 0050](0050-the-hob-oven-filler-is-a-finishable-front.md), where the same
choice was met on `base-hob-oven` and settled the same way. This record settles it on this body's own
terms — ADR 0050's Consequences say plainly that a hob band's filler and an integrated dishwasher's
decor door are different products — and the two bodies get **different** `canHandle` answers for
that reason.

## Decision

**The dishwasher niche is a fronted cabinet: it owns one decor door, and the appliance behind that
door is built in its fully-integrated form.**

1. **`dishwasherHousing` builds the decor door itself, with `doorSlab`.** Same anchors as
   `baseCabinet`'s single door, expressed as the same expressions and not as copied numbers:
   width `W − 0.006`, height `CARC_H − 0.01`, `x = 0`, `y = PLINTH + CARC_H − 0.004`, and the front
   plane `fz = CARC_D / 2 + TH / 2`. It is therefore **flush with every neighbouring base front by
   construction**, at both declared sizes, and it follows `carcassDepthM` if the cabinet-depth
   setting moves (wave 5F's formula) instead of decoupling at a 700 mm kitchen.

2. **The mesh name is load-bearing, and it is satisfied by reuse rather than by a rename.**
   `doorSlab`'s slab is already named `door_front`, so `FRONT_MESH_NAME` reaches it with no rename
   and no change to the pattern. ADR 0050 item 1's rejection of widening `FRONT_MESH_NAME` stands
   untouched. **The standing constraint, stated so a future change cannot break it silently:** a
   body is finishable only if its front mesh's name matches `/door_front|drawer_front/`. A
   hand-rolled panel with a private name is not a front however much it looks like one — that is
   what `oven_filler_front` was — and renaming `doorSlab`'s slab would silently unfinish every
   cabinet in the catalogue at once. The capability gate is what holds this: `base-dishwasher` and
   `base-dishwasher-600` leave `RECORDED_CAPABILITY_GAPS` in this same change and are gated from
   then on.

3. **Inside a housing, the appliance is built fully integrated: `dw_body` and nothing else.** Its
   own door skin `dw_panel`, its `dw_control_strip` and its `handle` group are not built there. Two
   reasons, both measured:
   - `dw_panel`'s front face lands on **the same plane** as the decor door's (0.298 m from the
     carcass centre, from `D/2 + TH/2 − 0.02` inside the appliance plus the appliance's own 0.02
     seat). Keeping both means two coplanar 18 mm slabs, which z-fight.
   - `dw_control_strip` spans 0.275–0.305 m and would cross the door plane by 7 mm.

   A fully-integrated machine has no exposed fascia, no visible control strip and no bar of its own:
   the door is the cabinet's. `dw_body`'s front sits at 0.24 m, 40 mm behind the door's inner face —
   the mounting space a real decor door hangs in.

   **`dw_body` keeps its name exactly.** `CARCASS_MESH_NAME_PATTERN` (`measure-built-body.ts:25`,
   [ADR 0016](0016-hood-chimney-is-carcass.md)) reads it, so a rename would move the recorded seat.

   **The standalone appliance is untouched.** `builders.dishwasher()` still builds the 596 × 720 ×
   560 machine `SPEC.md` describes, with its panel, strip and bar, for the parts gallery and for M1's
   `dishwasher` parity key. The two forms are **two named factories over a shared body helper**, not
   one factory with a boolean argument.

4. **Neither flag changes, and both become true of the geometry.** `base-dishwasher` keeps
   `canFinish: true, canHandle: true` from `INSERTABLE_DEFAULTS`. Backlog entry 11 predicted this
   exactly — *"the flags were right all along and the geometry is what is missing"* — so the fix
   edits no declaration; it builds what the declaration always promised. The catalogue row gains a
   comment saying which mesh carries the finish and why the handle is the cabinet's, so the next
   sweep finds a stated ground rather than a silence.

5. **`canHandle` stays `true`, and this deliberately differs from ADR 0050's `false`.** The hob
   filler is a facade — nothing behind it opens — and the only bar on that body is the oven's, so a
   handle chip there would mutate an appliance. A decor door on an integrated dishwasher **is a
   door**: it opens, and after decision 3 the only `handle` group inside `dishwasher_housing` is the
   one `doorSlab` hangs beside the front it opens. `opensAFront()` therefore classifies it as the
   cabinet's handle — correctly, by the rule as written, not by widening it — and `handle: "push"`
   hides **the cabinet's** bar, which is the whole of the recorded defect's second half.

   Note what decision 3 does to that classification, since it is the reason the two halves cannot be
   split: had the decor door been added *without* removing the appliance's bar, the bar would have
   become a sibling of a front and `opensAFront()` would have started counting an appliance's handle
   as a cabinet's — corrupting the one distinction the gate exists to draw.

   The bar is on the **top edge** (`doorSlab(..., "top")`): the edge a hand pulls a dishwasher door
   from, and the same horizontal bar a drawer front carries, which reads as a niche rather than as a
   hinged cupboard at a glance. The base slot is not push-open by default
   (`isPushOpenByDefault(0) === false`), so the seeded body shows that bar unless the customer turns
   it off.

6. **The declared occupied depth follows the geometry down: 632 → 620.** What reached 632 was the
   appliance's bar, at `0.29 + 0.342`. The decor door's bar reaches 0.319, behind the worktop's
   0.33, so the niche becomes an ordinary base body: `occupiedDepth: finishesAtMm(
   BASE_FINISHED_DEPTH_MM)`. `DISHWASHER_BASE_FINISHED_DEPTH_MM = 632` is deleted along with the
   comment calling this *"the one ordinary base body whose front passes its own worktop"*, which
   stops being true in this change.

   **The seat does not move.** `frame.d` is derived from `CARCASS_MESH_NAME_PATTERN`, which matches
   neither `door_front` nor `dw_panel`, so `base-dishwasher` still records 580 and
   [ADR 0040](0040-a-recorded-seat-is-converted-back-not-read-as-a-depth.md)'s conversion is
   untouched. Only the occupied number moves, and it is **measured** by
   `occupied-depth.parity.test.ts` against the built meshes rather than asserted.

7. **M1's 1e-6 m parity gate is re-baselined as a declared divergence, never relaxed.** This is the
   first M5B wave that moves seeded geometry — `base-dishwasher-600` is in the seeded kitchen — and
   ADR 0036's Consequences already rule how that is done: *"deliberately re-baselined with the change
   recorded, not relaxed."* `DECLARED_DIVERGENCES` today expresses only numeric deltas on nodes that
   exist on both sides, and mesh-name sets, hierarchy and child order are compared before the ledger
   is consulted. So the ledger gains a second declaration form — **a declared structural change**,
   naming each added and removed node, its parent, and how many times it occurs — with the same
   discipline the numeric one has: an undeclared difference fails, and a declaration that goes unused
   or occurs the wrong number of times fails just as loudly. Deleting a builder from the sweep, or
   dropping the `kitchen-l` comparison, is not available.

8. **`tall-oven-tower` is deferred, and re-recorded rather than left in a closing entry.** See
   *Consequences*.

## Alternatives considered

**Turn the flags off — `canFinish: false, canHandle: false`, the way `open-shelf` and `hood` do.**
The one-line fix entry 11 named, and the cheapest of all of these: no geometry, no parity, no depth
change. **Rejected by the owner on 2026-09-01.** It answers the gate rather than the customer: the
niche would keep an appliance-fronted face in a run of finished doors, and the two panel sections
would be removed instead of made to work. ADR 0050 met the same fork on `base-hob-oven` and went the
same way; entry 11 itself records that this framing *"is no longer the neutral default"*.

**Rename `dw_panel` → `dw_decor_door_front` in place, and change nothing else.** By far the cheapest
against parity — no mesh moves, no mesh is added or removed, and M1's gate would see one name change
instead of a structural one. It is also geometrically honest, since that panel already sits on the
plane a cabinet door sits on. **Rejected**, because the panel lives in the **appliance's** group,
beside the appliance's bar: renaming it makes that bar a sibling of a front, and `opensAFront()`
starts counting the dishwasher's own handle as the cabinet's. That is the exact distinction the
capability gate was written to draw, and the census control test
(*"does not count an appliance's handle as the cabinet's"*) is what would have to be weakened to
accept it. It also leaves `handle: "push"` hiding an appliance bar — half the reported defect
untouched. Saving a re-baseline is not worth corrupting a catalogue-wide rule.

**Add a decor door in front of the existing `dw_panel`, leaving the appliance intact.** The smallest
edit that still produces a real cabinet front. **Rejected**: the two are coplanar, so either they
z-fight or the decor door must stand 18 mm proud of every neighbouring front — losing flushness and
pushing occupied depth to roughly 650 mm, past the worktop, for no product reason.

**Build the niche semi-integrated: decor door with the appliance's control strip visible above it.**
A real product, and arguably a nicer one. **Rejected for this wave**: it is a second product on one
catalogue row, it needs its own geometry rather than a leftover (the existing strip crosses the door
plane), and the owner asked for a decor door, not for a second dishwasher variant. If it is ever
wanted it is a new entry, decided on its own.

**Widen `FRONT_MESH_NAME` to reach whatever the niche's front is called.** Not needed here — reusing
`doorSlab` gets the name for free — and ADR 0050 already rejected widening it, because the pattern is
read across the whole catalogue and loosening it risks catching a future non-front mesh. Recorded so
this record is not read as re-opening it.

## Records swept before deciding, and how each is settled

The owner's standing instruction is to check whether an earlier record said the opposite or was
ambiguous before implementing. 5B1's lesson (`docs/STATUS.md`, *5B1's real lesson*) is that the sweep
must cover `docs/milestones/` as well as `docs/decisions/`, the spec and the backlog. ADR 0050's
lesson is to search for what a comment **points at**, not only for what it says, because a deleted
cross-reference leaves no stale phrase behind — so this sweep also grepped for the *referents*
(`base-dishwasher`, `base-dishwasher-600`, `dw_panel`, `dw_body`, `dishwasherHousing`, `632`,
`DISHWASHER_BASE_FINISHED_DEPTH_MM`, `RECORDED_CAPABILITY_GAPS`, "decor") rather than only for the
claims.

Swept: `docs/decisions/` (all 50 records), `docs/decisions/README.md`, `docs/milestones/` excluding
`done/`, `docs/BACKLOG.md`, `docs/STATUS.md`, `docs/design/DEVELOPMENT-SPEC.md`,
`docs/design/SPEC.md`, and the code and test sites each of those points at.

| Record | What it says | Settled how |
| --- | --- | --- |
| [ADR 0027](0027-the-hob-is-part-of-the-cabinet.md)'s amendment, closing paragraph: *"Two entries therefore remain… Both are open niches where the appliance is the front, so the builder produces no `door_front` and its only handle is the appliance's. **The owner scoped this wave to the new entry and decided to keep both as they are**, so each is exempted from the implication and pinned to the inverse assertion instead."* | **The one earlier owner decision that this record reverses**, and the reason the sweep exists. It is a *scoping* decision — keep both as they are, for that wave — not a product ruling that the niche must stay frontless; its own last sentence hands the product question to backlog entry 11. | **Struck through in place, with a dated pointer to this record.** The exemption ends: the owner decided the product question on 2026-09-01 and both pins come out. The paragraph's *description* of the geometry ("the appliance is the front… its only handle is the appliance's") was true when written and is what this wave changes; the rest of ADR 0027, including the gate it created and the four entries it corrected, is untouched. |
| [ADR 0050](0050-the-hob-oven-filler-is-a-finishable-front.md), Consequences: *"`base-dishwasher`'s open-niche `canFinish`/`canHandle` question is unaffected by this record: that body still has no fixed panel of any kind, so its situation is not analogous to `base-hob-oven`'s any more, and entry 11 stays open on its own terms."* | Not opposite — it deliberately declined to settle this row by analogy. | **Respected, not overturned.** This record settles entry 11 on its own terms and reaches a **different** `canHandle` answer for the stated reason (decision 5). ADR 0050 is precedent for *which fork the owner takes*, and for nothing else. No edit needed there. |
| [ADR 0040](0040-a-recorded-seat-is-converted-back-not-read-as-a-depth.md), *"dishwasher **632**"* in its four-bodies table, and its Consequences on declared finished depths | States a measured number this wave moves to 620. | **Corrected 2026-09-01** (record maintainer): a dated correction is appended saying the 632 was correctly measured off the appliance's bar and stops being true when decision 3 removes that bar from the housing. The record's *method* — declare, then gate the declaration against the meshes — is what produces the new number and is unaffected. |
| [ADR 0016](0016-hood-chimney-is-carcass.md) — `CARCASS_MESH_NAME_PATTERN` includes `dw_body` | Fit and seat are judged on carcass meshes; `dw_body` is one of them. | **Nothing to correct, and it constrains the work.** Decision 3 keeps `dw_body`'s name and geometry, and `door_front` is deliberately outside the pattern, so §7 fit, picking and the recorded seat are all unchanged. Named as an acceptance criterion rather than assumed. |
| [ADR 0018](0018-frame-depth-is-rear-overhang.md) — `base-dishwasher` 600 declared / **580** seat | The seat table. | **Still true.** Decision 6 moves the occupied number only. |
| [ADR 0035](0035-width-is-a-bounded-stepper-not-a-menu-of-sizes.md) (the dishwasher is 450/600 because dishwashers are; `fixedWidth` is `false` on it and cannot be corrected to `true`), [ADR 0033](0033-door-count-is-derived-from-width-not-declared.md), [ADR 0034](0034-width-chips-are-column-scoped-and-judged-by-the-command.md), [ADR 0030](0030-a-single-hinged-door-tops-out-at-600.md), [ADR 0026](0026-the-width-floor-has-a-direction.md), [ADR 0032](0032-an-entry-that-does-not-fit-is-shown-disabled-with-its-reason.md), [ADR 0022](0022-seeded-entries-declare-their-catalogue-equivalent.md), [ADR 0046](0046-adjacent-empty-columns-merge-under-a-cap-and-an-insert-splits-its-column.md) | Every other `base-dishwasher` hit in `docs/decisions/`. All of them are about **width, seat or insertion** — 450/600, `fixedWidth`, §11 row 14, the end of centring in a 700 mm opening. | **Nothing to correct.** None of them says anything about fronts, finishes or handles on this body, and this record changes no width, no size set and no insertion rule. `deriveDoorCount` is not consulted: the niche builds one decor door at both sizes, because what is behind it is one appliance — not because of a width threshold. |
| [ADR 0036](0036-a-declared-dimension-is-the-finished-cabinet.md), Consequences: M1's gate *"must be deliberately re-baselined with the change recorded, not relaxed"* | Rules how a deliberate product change meets the fidelity gate. | **Followed, and extended.** Decision 7 adds a second declaration form to the same ledger under the same discipline. This record does not weaken the epsilon, drop a builder from the sweep, or exempt `kitchen-l`. |
| [ADR 0047](0047-an-open-shelf-count-follows-its-clearance.md)'s 2026-09-01 correction (Q7), where a ~9 mm spacing defect was left standing because *"re-pinning parity for 9 mm was judged not worth it"* | The nearest thing to an opposite ruling on **re-baselining**: the project has once decided *not* to re-pin. | **Not in conflict, and the distinction is stated rather than assumed.** Q7 declined to re-pin for a cosmetic millimetre nobody had asked for. This is an owner-requested product change to what the customer sees on a body they select, and the re-baseline is the recorded cost of it, not a side effect. The two together give the rule: re-pin for a decided product change, not for an incidental measurement. |
| `packages/three-adapter/tests/catalog-capability-parity.test.ts:60-73` — the `RECORDED_CAPABILITY_GAPS` comment, which **points at backlog entry 11** for the open product question, plus the *"has exactly two recorded gaps"* test and the `it.each(RECORDED_CAPABILITY_GAPS)` inverse assertion | The pin asserts the defect is **still present**. | **Goes red the moment this is built, by design, and comes out in the same change** — including its comment, re-pointed at this record rather than deleted (ADR 0050's lesson). The list becomes empty and the census control test gains this body's numbers. The `it.each` over an empty list is a named implementation hazard in the wave plan. |
| `packages/configurator-domain/src/catalog.ts:306` (`DISHWASHER_BASE_FINISHED_DEPTH_MM`, *"the one ordinary base body whose front passes its own worktop"*) and `:512-518` (the row itself, which carries **no comment** on its inherited flags) | A stated ground that stops being true, and a silence. | **Both fixed in this change**: the constant and its comment are deleted, and the row gains the comment decision 4 requires. The silence is the same shape as `open-shelf`/`hood` after ADR 0050 — a row whose flags nothing explains. |
| `packages/configurator-domain/src/fixtures/kitchen-l-design.ts:3,173` | Imports the constant for the seeded `base-dishwasher-600` entry. | **Moves with it**, or the package does not compile. Named in the wave's file list. |
| `docs/design/DEVELOPMENT-SPEC.md` §7 body table (`base-dishwasher … make.dishwasherHousing(w)`), §11 row 14 (*"Dishwasher niche: only 450 / 600; both build a real carcass"*), §9's Finisaj/Mâner rules | The behavioural contract. | **Nothing to correct.** The builder arm is the same call; row 14 is about widths and stays literally true (both sizes still build a real carcass — now with a front on it); §9's rule is *a body that can be finished shows the section*, and this change makes the body match the flag rather than changing the rule. Grep found no spec sentence stating that the niche has no front. |
| `docs/design/SPEC.md:111` — appliance geometry, *"dishwasher 596 × 720 × 560"* | The original 3D contract for the **appliance**. | **Preserved by decision 3's split.** `builders.dishwasher()` still builds it unchanged; only the housing's arm builds the integrated form. Named as an acceptance criterion. |
| `docs/milestones/adversarial-review-remediation.md:1179, 1219, 1261` — three depth tables giving `base-dishwasher` **632**, *"the appliance's door bar"* | Presented as current measurements, not as history. | **Corrected 2026-09-01** (record maintainer): a dated one-line pointer added at each table saying the bar was removed by this record and the number is 620 from 2026-09-01. The tables themselves are unedited: they record what was measured then, and DOM-002's story depends on them. **Locator note, 2026-09-02:** the milestone file was trimmed for length in a documentation
pass; the same three tables and their dated pointers now sit at lines 179–254, under *The measured
figures*, *Existing assertions whose meaning changed* and *The per-column behaviour change* in the
wave S9 section, still verbatim and still unedited — only the surrounding prose was compressed. |
| `docs/milestones/M5-width.md:1125` — *"`base-corner-x`, `base-corner-return`, `base-dishwasher` and the oven inside `tall-oven-tower` are byte-identical at every depth"* | A carried-out-of-M5 note: these builders ignore the cabinet-depth setting. | **Must not be made worse, and is not.** Decision 1 anchors the decor door on `CARC_D` (= `carcassDepthM`), which is the *derived* depth — so the door follows the setting even though the surrounding niche does not. The note stays true of the rest of the body and this record narrows rather than widens it. |
| `docs/milestones/done/M5B-manual-ux-remediation.md` — the Q6 row in *Answered*, the risk *"A geometry wave moves the seeded kitchen"* (control: M1's parity suite, named as a criterion in each wave), and 5B6's criterion 4 | Every M5B wave so far was designed so that **nothing seeded moves**. | **This wave is the exception and says so out loud.** Its risk row names the re-baseline as the control instead of "nothing moves", so the phase's own risk table is not silently contradicted. Q6's row is history and needs no edit. |
| `docs/BACKLOG.md` entry 11, in full | The open entry this closes, including its *"Two ids, one defect"* paragraph and its `tall-oven-tower` tail. | **Closed as DECIDED 2026-09-01 with this record, except its tail**, which is deferred and must be re-recorded as its own entry before entry 11 is marked closed — see *Consequences*. |
| `docs/STATUS.md` | Describes M5B's open waves and the 2026-09-01 answers. No claim about this body's fronts or flags. | **Updated 2026-09-01** (record maintainer): the phase row and *What is open right now* now mark 5B10 complete, as for every wave. |
| `packages/three-adapter/tests/seeded-appliance-handles.test.ts` | Pins the **fridge's** live consequence of the same defect class (`p7`). | **Stays green and unmodified.** It is the natural home for this body's companion assertion (`p1`: `push` hides the cabinet's bar and there is no appliance bar left to erase), which the wave adds rather than replacing anything. |
| `packages/three-adapter/tests/kitchen-parts.contract.test.ts:237-254`, `occupied-depth.test.ts:156`, `measure-built-body.test.ts:312`, `kitchen-parts.decomposition.parity.test.ts` | Assert `dw_panel`'s size, the 632 mm occupied depth, the 580 mm seat, and that the seeded and decomposed builds agree. | **Each re-pointed or confirmed by measurement in the wave**, and every re-pinned number listed in the wave report with what it was read off. The seat and the decomposition agreement are expected to be **unchanged**; a change in either is a defect, not a re-baseline. |

**Nothing else was found.** Outside the files named above, the sweep returned no record, comment or
test that says the dishwasher niche must stay frontless, that its flags must be turned off, or that
its 632 mm depth is a rule rather than a measurement. `docs/design/mockups/` was not searched — it is
a screen reference and this change is geometry — and `docs/milestones/done/` was deliberately not
read, per `AGENTS.md`.

## Consequences

- `base-dishwasher` and `base-dishwasher-600` become ordinary fronted base bodies: one `door_front`,
  one cabinet handle, both flags truthful, and the fascia tracks all four solid finishes with the run
  instead of standing permanently `222,223,221`.
- **The seeded kitchen changes visibly**, and this is the intended change, not a regression: the
  dishwasher stops reading as a stainless appliance face with its own bar and starts reading as a
  cabinet door matching its neighbours. It is the first M5B wave to move seeded geometry, and the
  before/after capture at the mobile viewport is part of the evidence.
- M1's structural-parity gate is re-baselined with named additions and removals confined to one
  body; every other builder, and every other seeded body, still diffs exactly at 1e-6 m. That
  confinement is itself the evidence that the move is deliberate.
- `base-dishwasher`'s occupied depth drops 632 → 620 mm and the column that holds it loses those
  12 mm of declared occupancy. The seat stays 580 mm. Anything that reads occupied depth — §7 fit
  over the column, what may hang above it — sees a slightly shallower body, which is the honest
  reading of a body that no longer has an appliance bar sticking out of it.
- The catalogue loses a special case: `DISHWASHER_BASE_FINISHED_DEPTH_MM` is deleted and the niche
  uses `BASE_FINISHED_DEPTH_MM` like every other base body.
- **`tall-oven-tower` is deferred, with the deferral recorded where it can still be found.** Its
  exposure is a different defect with a different cause: `setHandlesVisible` and
  `applyBlackHandleMaterial` (`decomposed-bodies.ts`) act on **every** `handle` group in a body, so a
  cabinet-hardware choice reaches the oven's and the microwave's bars beside the tower's two real
  door handles. Nothing about a missing front is involved; the fix is to teach the handle-application
  path the same cabinet-versus-appliance rule `opensAFront()` already encodes, in a file every body
  in the scene goes through. Folding that into this wave would put a seeded-geometry move and a
  catalogue-wide handle-behaviour change in one commit — the coupling M5B's risk table exists to
  avoid. Backlog entry 11's tail assigned it to *"whoever owns §6.5"*, and that placement is not
  overturned here. Because entry 11 closes with this record, the tail must be **re-recorded as its
  own backlog entry in this same change** — otherwise closing entry 11 deletes the only pointer to
  it, which is exactly the silence ADR 0050's lesson warns about. `base-dishwasher` stops being an
  instance of that defect once this wave lands; `base-hob-oven`'s oven bar and `tall-oven-tower`'s
  two appliance bars remain.

## Amendment — 2026-09-01: two holes in the declared-structural-change form, found by adversarial QA

**This section corrects nothing above it — decision 7's re-baseline stands exactly as decided — and
adds a rule to the *form* the ledger takes, discovered only once that form existed and QA tried to
break it.** It is recorded here, on the record that introduced `DeclaredStructuralChange`, so a
future wave that has to move seeded geometry finds the rule before it needs it.

**The hole.** Decision 7 gave M1's parity ledger a second declaration form alongside its numeric
deltas: a node's parent, name, `added`/`removed`, and its subtree's mesh names. Adversarial QA on this
wave found that the form as first built let a declaration **erase a node from comparison entirely**:
declaring the same `(parent, node)` key as both `added` and `removed` satisfied the ledger's
bookkeeping without the gate ever diffing that node against the reference. QA proved it live — moving
a seeded `back_panel` **25 mm** with the parity suite still reporting **71/71 green**. That is the
exact failure the numeric form was built to prevent, reproduced one level up, in the form meant to
gate structural changes.

A second, narrower hole sat beside it: the `meshes` field on each declaration was checked only as a
**net multiset delta** against the mesh-name-set comparison, added and removed declarations pooled
together. Two declarations that each got a shared constant wrong in the same direction could cancel
in the sum and pass.

**The fix, and the rule it enforces.** `refuseTwoDeclarationsOnOneNode`
(`packages/three-adapter/tests/kitchen-parts.parity.test.ts`) rejects **any** repeated `(parent,
node)` key among the declared structural changes, before the ledger opens — not only an `added` paired
with a `removed` on the same key, which is the narrower rule QA's reproduction would have been enough
to justify. The wider rule is deliberate: two declarations naming one node are never an honest
statement about that node, whatever their `change` values are, so the check does not try to enumerate
which combinations are dishonest. The `meshes` hole is closed by checking each declaration's list
against its own subtree, not against a pooled delta — so a wrong constant in a shared mesh cannot be
cancelled by an unrelated declaration elsewhere in the same body.

**The rule the gate now enforces, stated for a reader who has not read this milestone:** a declaration
may say a node stopped existing on one side of the comparison, or started to exist on the other side.
It may never say a node exists on both sides and is not to be compared — that is not a smaller
version of honesty, it is the one thing a structural declaration exists to rule out. Any future wave
that moves seeded geometry and needs a second declaration form should read this rule before writing
one, rather than rediscovering it the way this wave's QA round did.

## Correction — 2026-09-05: `opensAFront()` was never shipped production code

**Found by the M6 certification audit, sweeping every mention of `opensAFront()` in `docs/` after the
same error was found in [ADR 0061](0061-a-cabinet-handle-is-declared-and-an-appliance-bar-is-not-one.md).**
This record refers to `opensAFront()` four times — decision 5 (twice: *"the one `doorSlab` hangs
beside the front it opens. `opensAFront()` therefore classifies it..."* and *"`opensAFront()` would
have started counting an appliance's handle..."*), the second Alternative considered (*"renaming it
makes that bar a sibling of a front, and `opensAFront()` starts counting the dishwasher's own
handle..."*), and the Consequences' `tall-oven-tower` deferral (*"the same cabinet-versus-appliance
rule `opensAFront()` already encodes"*) — in each case as though it were shipped production code.

**It never was.** `opensAFront()` has only ever lived in
`packages/three-adapter/tests/catalog-capability-parity.test.ts:152`, a test-local helper whose own
comment calls it "this gate's own reading of ADR 0061's rule … used nowhere but the independence
assertion." The rule as **shipped** is `isCabinetHandleGroup`
(`packages/three-adapter/src/cabinet-handle-meshes.ts:26`), read by both the apply path
(`setHandlesVisible`, `decomposed-bodies.ts`) and the capability gate. The capability gate itself
decides whether a body *has* a handle choice at all through the declared `BodyDefinition.canHandle`
flag (`catalog.ts`), not through either of these functions — those decide which meshes *within* a
body a handle choice reaches, a narrower and later question.

**Nothing in this record's substance changes.** Decision 5's classification of the dishwasher's own
bar, the rejected rename alternative's reasoning, and the `tall-oven-tower` deferral all hold exactly
as decided — only the name borrowed from the test is corrected here rather than silently swapped, the
same treatment ADR 0061 gave its own four mentions on the same date.
