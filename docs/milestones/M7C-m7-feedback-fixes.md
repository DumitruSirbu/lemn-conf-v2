# M7C — M7 feedback fixes

**Status: PLANNED 2026-10-01; plan review round 1 applied the same day. Dispatchable: C0 and C1 S1.
C1 S2 is held on the Russian set (Q7). No wave dispatched yet.** Branch `m7c-m7-feedback-fixes`, cut
from `main` at `2615b51`. Sits between M7B and M8. Every wave follows `docs/WORKFLOW.md`.

Source: `docs/M7-FEEDBACK.md`, eleven items from the owner's hands-on check of M7 and M7B, with
screenshots in `docs/M7-FEEDBACK-assets/`.

Evidence tiers used below: **[src]** read at `2615b51` (file:line), **[doc]** quoted from a record,
**[inf]** inference, owed a measurement. **Nothing here is measured**: no command was run against the
product for this plan. Wave C0 owns every number.

## Goal

A generated kitchen looks complete at its corners and upper rows, its corner fronts stand on one line
with their neighbours, a small leftover beside a fixed-width end body is absorbed, and Step 1 and the
desktop editor have no misaligned or missing navigation.

## Scope

**In.** FB-001 (desktop way back to Step 1), FB-003 to FB-011. Generation rules for the wall and top
rows, the corner zone on wall A, the U back wall, and the leftover beside a fixed-width end body; the
corner legs' front and worktop lines; Step 1 footers and one copy leaf.

**Out, with the owner of each.**

- FB-002, the inert *Verifică designul*: **M8** builds `/configurator/review` and wires it.
- Several kitchens per customer (FB-001 idea B): **M8** customer profiles and dashboard (ADR 0115).
- A dedicated corner wall unit as a new catalogue body: after beta (ADR 0110 E12.4), unless Q2 says
  otherwise.
- Taller uppers as a function of room height (ADR 0110 E11.3): not this milestone.
- Resizing a cabinet through a fixed-width neighbour in the editor (FB-010's second half): backlog,
  unless Q6 says otherwise.

**Why one milestone.** Six of the eleven items meet in three files (`upper-policy.ts`,
`generate-kitchen.ts`, `shell-design.ts`), so they must be sequenced by one plan with one writer. The
web items are small and independent. Splitting would add a branch and a PR and remove no dependency.

## Triage

| ID | Class | Finding | Tier | Wave | Pri |
| --- | --- | --- | --- | --- | --- |
| 001 | Contract gap (desktop); B and C already decided | Both back links render and are `display: none` from 900 px (`configure.module.css:650-653`), because frame D2A draws none. On a phone the link exists. Going back never erases: *"Choosing again creates a **new** design; the one the customer left is still stored"* (ADR 0111 d5). The base URL resumes the newest design by ADR 0114 d4. Every edit is already saved. Several kitchens is M8 (ADR 0115). | [src] [doc] | C1 S3 | P1 |
| 002 | Named interim | A `<span>`, *"inert until M8 because no review route exists"* (`configure-screen.tsx:232-247`); ADR 0104 d6: *"drawn exactly as the frames draw it and is wired to nothing"*. | [src] [doc] | M8 | P3 |
| 003 | Owner ruling to overturn | Generation inserts uppers at `WALL_ROW_Y0_MM` only (`generate-kitchen.ts:451-482`). ADR 0110 E11.1: *"Composition places no body in the top row (2200–2600)"*, owner 2026-09-14: *"let's stick to what we have now. Get some feedback."* Every shape, not only the U. | [src] [doc] | C3 | P1 |
| 004 | Architect adjudication to overturn | Wall A's wall and top rows over each corner base are empty shell tiles (`shell-design.ts:381-398, 750-786`). Archived M7 plan, *Adjudication 7D1-Q1*, criterion 14: *"composition places nothing in the wall band over wall A's corner zone … left as an empty column the customer can fill"*. Not an owner ruling. The base corner legs and the side-wall returns **are** generated in a U (`shell-design.ts:652-718`). | [src] [doc] | C2 | P0 |
| 005 | Conditional: a defect if the room's A + B + C ≥ 10 m, else it conforms to the record | `isBackWallBaseOnly` requires `isLargeU` (`upper-policy.ts:46-56`), `LARGE_U_TOTAL_MM = 10_000` (`run-layout.ts:136`). ADR 0110 N1.3: *"Depends on size"*, then a relayed selection: *"A + B + C ≥ 10 m … the base-only wall is the back wall (A)"*. So the request was recorded, with a threshold. The screenshot's room size is not known; Q3 asks for it. | [src] [doc] | C2 | P1 |
| 006 | Contract gap | No record states a front-line contract at the corner seam. By arithmetic on the builders, at depth D the base return's worktop front is at D and a run's at D + 20; the return has no door, so its carcass front (D − 20) is behind a neighbour's door face; the X-leg's worktop is at D + 30 (`kitchen-parts.ts:297-314, 1943, 2033, 2058-2063, 2115`). **This does not explain the screenshots**: both are at *Adâncime 700*, both corners read as behind, and the arithmetic puts the X-leg 10 mm proud. The cause is not established. | [src] [inf] | C0, C4 | P1 |
| 007 | Defect against the mockup | Frame D1A `:92` declares `align-items:center` on the 88 px footer; the shipped rule has none (`room.module.css:1240-1246`), so the 52 px button sits at the top. The button stays right-aligned, as the frame draws it. | [src] [doc] | C1 S1 | P2 |
| 008 | Copy change, owner's wording | `room.cornerQuestion` (`ro.json:51`, `ru.json:51`); ADR 0113: *"I will adjust when I will decide later"*. | [src] [doc] | C1 S2 | P3 |
| 009 | Defect against the mockup | Frame D1B `:190` declares `align-items:center`; `.dimensionsFooter, .composeFooter` have none (`room.module.css:1604-1610`). Same cause as 007, a second rule. | [src] [doc] | C1 S1 | P2 |
| 010 | New rule, departs from owner rulings | A4: *"the remainder, at most 599 mm, stays"*; *"let the edges empty"* (D2); RQ25a, 2026-09-29: *"Back wall only"*, side walls' ends stay bare. E6 already absorbs `0 < remainder ≤ 200` into the module beside a **tower**; nothing does so beside the **fridge**. The editor half: a resize is funded by adjacent empty space only (ADR 0031); a fixed neighbour in between blocks it, and moving it is §13.2's rejected *"Auto-shifting a whole run"*. | [doc] | C5 | P2 |
| 011 | Same gap as 004, on the L | The seeded reference L fills wall A over the corner base: `p8` `wall-2door-600` and `p10` `wall-1door-300` at 1500, `p15`/`p16` at 2200 (`kitchen-l-design.ts:1033-1047`). The generated L leaves it empty (criterion 14). *"The earlier mock"* is read as that reference kitchen [inf]; no file in `docs/design/mockups/` draws a corner unit. | [src] [inf] | C2 | P1 |

**The owner's vocabulary**, from ADR 0110 E11 and F: *middle* is the wall row (1500–2200), *top* is the
top row (2200–2600). The feedback file's parentheticals read them differently in FB-003 and FB-004; this
plan uses the owner's. Q2 confirms it.

## Decision-record sweep

Swept 2026-10-01 over `docs/decisions/`, `docs/backlog/open.md`, `DEVELOPMENT-SPEC.md`, `SPEC.md` for
*corner zone, wall-only, top row, base-only, large U, leftover, 599, edges empty, resume, Înapoi,
Verifică designul, cornerQuestion, proud, flush*.

| Record | What it says | How it is settled here |
| --- | --- | --- |
| ADR 0110 E11 (owner, 2026-09-14) | No generated top row; the eventual fix is *"the middle and the top cabinets to be just higher"*, not a composed row. | **FB-003 asks the opposite.** Not overturned without Q4. If overturned: Amendment O, E11.1 and E11.3 struck by name. |
| ADR 0110 F9 | The top row, when composed, is lift cabinets (stretch-ceiling reason); a lift needs 120–165 mm above it. Trigger: *"the first wave that composes a top row"*. | **Triggered by C3.** FB-003 asks for push-to-open doors. Put in Q4. |
| Archived M7 plan, 7D1-Q1, criterion 14; ADR 0130 sweep row (`:102`, *"7D2 c. 14 … no uppers over the corner"*) | Nothing composed over wall A's corner zone. | **Overturned by FB-004 and FB-011** (owner). Its property, no `RECORDED_SPAN_OVERLAPS_CORNER_BODY`, is kept. |
| ADR 0110 N1.3, *N3 revised* 11, RQ7 | Back wall base-only in a large U (≥ 10 m), hood kept, voids left for the editor. | **Kept unless Q3 changes the threshold.** |
| ADR 0110 A4, D2, E6, *N3 revised* 4, N11.9 (RQ25a/b) | Remainder ≤ 599 stays bare; E6 absorbs ≤ 200 beside a tower; a U's wall A fills from 300; side-wall ends stay bare; under 400 beyond the fridge stays bare. | **FB-010 departs from A4, D2, N3r 4 and RQ25a** for one case. Needs Q6, then Amendment O. E6 is the precedent. |
| ADR 0110 F7 / ADR 0108 H3 | Wall B and wall C keep a 100 mm reserve for the 600 → 700 slide. | **Kept.** The absorb never spends it. |
| ADR 0031, 0035, 0043, 0046, 0052 | A resize is funded by adjacent empty space; ±50 stepper; any gap is legal for a customer's edit; 800 caps a cabinet and an empty column. ADR 0043 superseded 0031's sub-300 floor. | **Unchanged.** C5 is generation only. |
| `DEVELOPMENT-SPEC.md` §13.2 | Auto-shifting a run is rejected: *"Positions carry meaning"*. | **Stands.** The editor half of FB-010 is not built (Q6). |
| ADR 0021, 0066, §13.1 | Corners are structural. | **Unchanged.** C2 places ordinary cabinets, not structural ones. |
| ADR 0025, 0077; §11 row 19 | The X-leg seats at −20, by its joint; 630 against a run's 620. | **C4 may amend the worktop figure**; the seat is not touched. |
| ADR 0089 | Corner widths frozen at a depth change; 30 mm upper-row residue on the side walls. | **Unchanged.** C2 and C3 criteria are stated at the generated depth. |
| ADR 0104 d6, d8, Amendments B, C | Mockups are the chrome contract; a departure needs the owner. D2A draws no back control. | **FB-001 on desktop is a departure**: Amendment D, on Q1. FB-007 and FB-009 restore the frames. |
| ADR 0111 d5, ADR 0114 d4, ADR 0115 | Back never erases; `/` resumes the newest design; profiles hold several, in M8. | **Unchanged.** Idea A's discard warning would contradict 0111 d5. |
| ADR 0113, ADR 0095 d2 | Step 1 copy approved as drafted; a leaf enters the copy lock in the commit that changes it; no agent approves a translation. | **Followed.** The Russian leaf is a draft the owner reads. |
| ADR 0117, ADR 0110 E12.4 | Cheap baseline; new catalogue rows wait for beta. | **Followed**: no new body in this milestone. |
| Backlog 63 | A hood over wall A's corner is offered, accepted, then marked. | **Not fixed here.** C2 must not make it worse: no hood in the strip. |

No record was found that names the corner setback as accepted or deferred. The owner's recollection
matches `SPEC.md`'s *"the corner unit protruded, the plinth stood proud"*, which is the opposite
direction and a prototype defect.

## Owner questions

Each answer is recorded verbatim, or marked relayed, in the record named.

**Q1 — FB-001. Blocks C1 S3 only.** Recorded in ADR 0104 Amendment D.
(a) Show the back-to-room control on desktop, as on the phone. It opens Step 1 with the room filled in;
*Continuă* makes a new kitchen and the old one stays stored. (b) Also add *Bucătărie nouă* with a
warning that the current kitchen is lost. (c) Neither.
*Recommended: (a).* The old kitchen is not deleted, but until M8 it is hard to get back to: `/` resumes
only the newest design (ADR 0114 d4), so the old one opens only from its own `/d/…` link in the same
browser, which the customer may not have kept. So (a) should say so in one line of copy at Step 1; that
line is drafted in C1 S3 and read by the owner. (b)'s *"will be lost"* is still stronger than the truth.
Idea B is M8. Idea C is already true for edits.

**Q2 — FB-004, FB-011. Blocks C2.** Recorded in ADR 0110 Amendment O.
What stands on the back wall above the corner base, at the middle and top levels?
The side wall's corner cabinet starts 330 mm along its wall (backlog 63), so it covers about the first
330 mm of the back wall's front there.
(a) Ordinary wall cabinets from the corner, as the reference kitchen has. No new product. **The door
nearest the corner is covered and cannot open**, which is the problem the owner raised in FB-011.
(b) An ordinary wall cabinet starting where the side wall's corner cabinet ends, so every door opens;
the pocket behind it in the corner stays unbuilt and hidden. No new product.
(c) A dedicated corner wall unit: a new body, builder and price (after beta, ADR 0110 E12.4).
(d) Leave it empty.
*Recommended: (b).* That the pocket is hidden from every camera is [inf]; C0 S2 captures (a) and (b)
before the owner chooses. Also confirms: *middle* is the wall row, and the base corner unit is present.

**Q3 — FB-005. Blocks C2.** Recorded in ADR 0110 Amendment O.
First: what were the three wall lengths of the kitchen in the screenshot? If they total 10 m or more,
FB-005 is a defect and is fixed in C2 whatever the answer below.
(a) Keep: the back wall is base-only when the three walls total 10 m or more. (b) Base-only in every U.
(c) Another threshold.
*Recommended: (a).* It is the recorded answer, and in a small U the side walls carry the fridge and
tall block, so (b) leaves little upper storage. Under (b) the corner stretch on wall A stays empty too.

**Q4 — FB-003. Blocks C3.** Recorded in ADR 0110 Amendment O; overturns E11.
(a) Compose a top row above every generated wall cabinet, same widths, push-to-open doors, in every
shape, where the room is at least 2600 mm high. (b) Taller uppers instead (E11.3); not in this
milestone. (c) Keep E11.
*Recommended: (a) if the owner confirms E11 is withdrawn.* Sub-questions: doors rather than the lifts
F9 records; whether the row runs above the hood, as the reference kitchen's does (`p19` over `p13`,
`kitchen-l-design.ts:1044, 1050`; default: yes); and whether it runs above full-height columns
(default: no, measured in C0).

**Q5 — FB-006. Blocks C4.** Recorded in a new ADR 0135.
Confirm the contract: at each corner, the corner units' fronts and worktop front edges stand on the
same line as the neighbouring cabinets on that wall. This departs from the supplier's geometry.
*Recommended: yes.* **Not put to the owner until C0 S1 has reproduced the screenshot's state** (a U at
700) and the question can name which face is behind and by how much.

**Q6 — FB-010. Blocks C5.** Recorded in ADR 0110 Amendment O.
(a) Generator: where a fixed-width body ends a run and under 300 mm is left beyond it, widen the
cabinet beside it in 50 mm steps, up to 800 mm, and move the fixed body outward by the same amount. Up
to 49 mm, and a side wall's 100 mm reserve, stay bare beyond it. (b) A different
threshold. (c) Also allow the editor resize through the fridge.
*Recommended: (a), and (c) to the backlog.* (c) is one Full-tier domain wave on its own: a new funding
arm in `plan-width-funding.ts`, column moves, the frozen map and every body stacked over the neighbour.

**Q7 — FB-008. Blocks C1 S2.** Recorded as a pointer in ADR 0113.
The new question asks *where*, the shipped one *whither*, so the answers must follow. Draft set:

| Leaf | Romanian | Russian (draft) |
| --- | --- | --- |
| `room.cornerQuestion` | În care parte se află colțul bucătăriei? | В какой стороне находится угол кухни? |
| `room.cornerHint` | nu se deduce din lățimi (kept) | по ширинам не определить (kept) |
| `room.cornerLeft` | La stânga (kept) | Слева (was *Налево*) |
| `room.cornerRight` | La dreapta (kept) | Справа (was *Направо*) |

The Romanian answers read correctly after either question, so they are kept; the owner may prefer
*În stânga / În dreapta*. The owner reads the whole set before S2 is dispatched.

**Non-blocking, default built.** FB-007: the button stays right, centred vertically.

## Waves

| Wave | Covers | Pri | Tier | State |
| --- | --- | --- | --- | --- |
| C0 | Census and measurements; the questions | — | Light | **Ready** |
| C1 | FB-007, FB-009, FB-008, FB-001 | P1–P3 | Light + visual | S1 **ready**; S2 on Q7; S3 on Q1 |
| C2 | FB-004, FB-011, FB-005 | P0 | Full + visual | On Q2, Q3, C0 |
| C3 | FB-003 | P1 | Full + visual | On Q4, C2 |
| C4 | FB-006 | P1 | Full + visual | On Q5, C0 |
| C5 | FB-010 | P2 | Full | On Q6, C0 |
| C6 | Phase gate | — | Coordinator + visual | Last |

**Order: C0 → C1 → C2 → C3 → C4 → C5 → C6.** C0 and C1 S1 need no answer and start now. C2 is first among
the blocked waves because it is the owner's top item. C3 follows C2 because both write
`upper-policy.ts`. C4 follows them so its captures show a complete corner. C5 is independent and last
because it moves every baseline that C2 and C3 also move. One writing agent in the tree at a time (R2).

### C0 — census, measurements, questions (no production code)

| Slice | Does | Reading |
| --- | --- | --- |
| S1 | **First, the owner's state: a generated U changed to 700, both corners, compared with `M7-FB-006.png`.** Then a generated L, right-hand L and U at 600 and after a change to 700: the world-space front face and worktop front edge of each corner leg and of the neighbour it meets, in mm. If the measured U at 700 does not show the corner behind, S1 stops and reports. | `kitchen-parts.ts:290-314, 1932-2131`; `measure-built-body.ts`; ADR 0025, 0077; `SPEC.md` corner element |
| S2 | The wall-A corner strip: its tile spans over the approved L and U ranges, what the editor's insert offers there, and two captures for Q2 (the reference's 600 + rest; one cabinet from the return's depth to the strip's end). | `shell-design.ts:379-407, 739-795`; `upper-policy.ts`; backlog 63 |
| S3 | FB-010's witness: an L where the fridge ends a run with 150–299 mm beyond it. The count of approved rooms with such a remainder, per shape and wall. What the top-row voids offer over a wall cabinet and over a column. | `generation-priorities.ts`; `u-fridge-wall.ts`; `tall-end-rule.ts`; ADR 0110 A4, E6, N3r 4 |

*Criteria.* Every figure comes from a script kept by name in the scratchpad, run on a build of `HEAD`.
No file under `packages/` or `apps/` changes. S1 reports each seam as a signed difference, so *behind*
and *proud* cannot be confused. *QA reading:* the three scripts and their outputs. *Reviewer reading
(logic):* this plan's *Triage* and *Sweep*, the outputs, ADR 0110 E11, N3r.

### C1 — Step 1 footers, one leaf, the desktop way back (web)

| Slice | Does | Files | Reading |
| --- | --- | --- | --- |
| S1 | `align-items: center` on the three desktop footers. | `room.module.css` | Desktop mockup `:92, :190`; `room.module.css:207-225, 780-810, 1234-1246, 1598-1620`; ADR 0104 d1 |
| S2 | Q7's approved set in both locales, the type file, the copy lock, the golden manifest. | `ro.json`, `ru.json`, `ro.d.json.ts` | ADR 0113 d2–d3; ADR 0095 d2; `tests/support/approved-romanian-messages.ts`; `dimensions-form.tsx:125-210` |
| S3 | The back-to-room link shown from 900 px. | `configure.module.css`, `configure/top-bar-fit.ts` if the fit ladder must count it | ADR 0104 d8 and Amendment C; `configure-screen.tsx:100-120, 232-250`; `configure.module.css:176-200, 371-400, 549-700` |

Up to six production files against the limit of about five. Accepted because S2's three message files
are one leaf set changed mechanically, and the three slices are reviewed as three diffs.

*Criteria.*
1. At 1280, 1440 and 1920 px wide, in 1A, 1B, 1C and 1F, each footer control's vertical centre is
   within 1 px of the footer's. *Must not:* any phone footer rule changes; a control moves horizontally.
2. The four leaves hold exactly the set the owner approved under Q7. No leaf outside
   `room.cornerQuestion`, `cornerHint`, `cornerLeft`, `cornerRight` changes in either file. The label does not wrap or clip at 390 px or at 520 px form width, in both
   locales.
3. From 900 px the editor shows one back-to-room control whose `href` equals the phone's. It is absent
   in the shared variant. The top bar's containment test stays green at 900–1920 px; price, CTA and
   locale chip are never clipped.
4. *Must not:* the review CTA gains a handler, role or pointer cursor.

*Visual evidence:* captures of 1A and 1B at 1440 px, the editor at 900 and 1440 px, 1B at 390 px in
`ro` and `ru`. *QA reading:* the criteria, `room.module.css` desktop block, `top-bar-fit.ts`.
*Reviewer reading (combined):* the diff, both mockup frames, ADR 0104 d8. *Visual reading:* the frames
and the captures.

### C2 — the corner stretch on wall A, and the U back wall (domain)

Written for Q2 (b) and Q3 (a). Another answer returns this wave to planning.

| Slice | Does | Files | Reading |
| --- | --- | --- | --- |
| S1 | Generation fills wall A's wall-row strip over each corner base, from the side-wall return's depth to the strip's end, with `wall-cabinet`, through `insertBody`. L, right-hand L, U (both corners). | `upper-policy.ts`, `generate-kitchen.ts`, `shell-design.ts` (the strip's tiles start at the return's depth) | ADR 0110 decisions 1–2, B2, C, E7, N3r 9–11; C0 S2; `shell-design.ts:379-407, 739-795`; `generate-kitchen.ts:449-482, 583-628` |
| S2 | Q3's rule in `isBackWallBaseOnly`. | `upper-policy.ts`, `run-layout.ts` | ADR 0110 N1, N3r 11, RQ7 |

*3D contract.* Each strip cabinet is an ordinary wall-A body: back face on wall A's plane at 0.000
(§11 row 19), `y0` 1500, drawn unmirrored at both corners. Its width comes from the strip's tiles, which
sum to the generated corner width; depth from the wall-depth map. It may not intersect the side wall's
corner return.

*Criteria.*
1. For every room on the approved L, right-hand L and U grids at 600: the strip from the return's depth
   to the corner width on wall A, and its mirror at the right corner of a U, holds wall cabinets with no
   gap, when the back wall is not base-only. Boundary: a strip tile of zero length, or narrower than
   `wall-cabinet`'s declared minimum, takes no body and stays an empty column; the count of such rooms
   is measured and stated. **[prop]**
1a. **Every door opens.** No door leaf of a strip cabinet lies, in whole or in part, within the
   side-wall return's depth of the corner. Checked on the leaf's own along-wall span, at both corners.
2. No generated design carries `RECORDED_SPAN_OVERLAPS_CORNER_BODY` or any other finding. *Must not:* a
   hood in a strip.
3. In a base-only U, wall A's wall row carries the hood if the hob is on wall A and otherwise nothing
   (the hob may go round the corner, N3r 5); both strips stay empty and insertable.
4. The four corner pieces, every base and every upper outside the strips are byte-identical to
   `2615b51` for every room. A straight kitchen's output is byte-identical.
5. A strip cabinet can be deleted, replaced and resized in the editor like any wall cabinet. It is not
   structural.
6. The price rises by exactly the strip cabinets' own lines.

*Visual evidence:* overview and wall-A captures of one L, one right-hand L, one U below 10 m and one at
or above it, at 390 × 844 and 1440 px. *QA reading:* the criteria, C0 S2, `generate-kitchen.u.uppers.test.ts`,
`qa-7d3-upper-suppression.adversarial.test.ts`. *Logic reviewer:* ADR 0110 C, E7, N3r, Amendment O
draft, the diff. *Clean-code reviewer:* the diff, `engineering-conventions.md`. *Visual:* the captures,
`SPEC.md` wall cabinet and L-scene elements.

### C3 — the top row (domain)

Written for Q4 (a).

| Slice | Does | Files | Reading |
| --- | --- | --- | --- |
| S1 | For each generated wall-row cabinet, strip cabinets included, one top-row cabinet of the same width above it, push-to-open. | `upper-policy.ts`, `generate-kitchen.ts` | ADR 0110 E11, F9, Amendment O draft; `push-to-open.ts`; §13.1 *Top row ships push-to-open*; C0 S3 |

*3D contract.* `y0` 2200, height 400, back face on the wall plane, same along-wall span as the cabinet
below. Handles hidden, not removed (§13.1).

*Criteria.*
1. In a room at least 2600 mm high, every generated wall cabinet has exactly one top-row body over
   exactly its span. Below 2600, none, and generation does not throw across the approved height range.
   **[prop]**
2. A top-row body stands over the hood, or not, as Q4 answers (default: yes, as the reference). *Must
   not:* one over a full-height column (unless Q4 says so), or on a base-only back wall.
3. Each top-row body resolves push-to-open with no customer action; a kitchen-wide handle change does
   not show a bar on it.
4. Everything below 2200 is byte-identical to C2's output. No finding on any generated design.

*Visual evidence:* as C2, plus one room at 2500 and one at 2600 high. *Readings:* as C2, with ADR 0110
E11 and F9 for the logic reviewer.

### C4 — the corner seam (adapter and domain)

Written for Q5 = yes, on C0 S1's measurements. If C0 shows the setback is a defect in seating rather
than in the builders, this wave is re-cut before dispatch.

| Slice | Does | Files | Reading |
| --- | --- | --- | --- |
| S1 | The return leg's and X-leg's worktop front edge and front face meet their neighbour's line. | `three-adapter/src/kitchen-parts.ts`; `configurator-domain/src/catalog.ts` and `fixtures/kitchen-l-design.ts` for the declared occupied depths; `docs/design/SPEC.md` | `kitchen-parts.ts:290-314, 1932-2131`; ADR 0025, 0077, 0135 draft; `product-invariants.md`; backlog 50 |

*3D contract.* Anchor: each wall's cabinet-depth line. At depth D the worktop front edge of every base
body on a wall, corner legs included, is at one distance from that wall's plane, and a corner leg's
outward face is not behind its neighbour's carcass front. Scaling: follows the depth setting, 600 and
700. Dependencies kept: the X-leg's −20 seat; each leg's plinth recess from its own depth only; no two
stone volumes interpenetrate and no coplanar faces; the right corner's four pieces mirror the left's.

*Criteria.*
1. For L, right-hand L and U at 600 and 700, at every corner seam, the worktop front edges differ by at
   most 1 mm, measured on built geometry.
1a. At the same seams, the signed distance from the neighbour's front face to the corner leg's outward
   face (door where it has one, carcass where it has none) is within the bound ADR 0135 states, and is
   never negative: no corner face is behind its neighbour's. The owner's U at 700 is a named witness.
2. *Must not:* the slabs of the two legs intersect; the X-leg's seat changes; a plinth stands proud of
   its own carcass front; any non-corner body's geometry moves.
3. The M1 parity gate's corner pins change only for the meshes named in ADR 0135, each restated with its
   old and new value. An unlisted change is a failure.
4. `findCornerOverlaps` reports nothing on the seeded kitchen and on every generated one.

*Visual evidence:* top-down captures of both corners of a U and of an L at 600 and 700, beside the
owner's screenshot. *QA reading:* the criteria, C0 S1's script, `kitchen-parts.decomposition.parity.test.ts`.
*Logic reviewer:* ADR 0025, 0077, 0135, the diff. *Clean-code reviewer:* the diff. *Visual:* the captures.

### C5 — the leftover beside a fixed-width end body (domain)

Written for Q6 (a).

| Slice | Does | Files | Reading |
| --- | --- | --- | --- |
| S1 | L and straight: the plan widens the fit-width base beside the fridge and moves the fridge outward by the same amount. | `generation-priorities.ts`, `leftover-rule.ts`, `tall-end-rule.ts` (E6's absorb, `:143-162`, shared rather than restated) | ADR 0110 A4, D revised, E6, F7; C0 S3 |
| S2 | U: the same on the fridge wall. | `u-fridge-wall.ts` | ADR 0110 N3r 2–4, N11.1, N11.9 |

*Criteria.*
1. `r` is the bare length between the fixed-width body and the end of the wall's **free run**, which on
   a side wall already stops 100 mm short of the wall (N3r preamble). The reserve is never part of `r`.
   Where `r` is 50–299 mm, the adjacent `base-cabinet` is planned at `w + min(floor50(r), 800 − w)`, the
   fixed body moves outward by that amount, and the rest of `r` stays bare beyond it. Boundaries: `r` = 49, 50, 199, 200, 249, 299, 300; a neighbour already at 800; no
   fit-width neighbour. **[prop]**
2. *Must not:* the 100 mm side-wall reserve is spent; a cabinet exceeds 800; the reading order changes;
   the sink, hob, dishwasher or any fixed-width body changes width; an interior gap appears.
3. The upper over the widened base has the same width.
4. Rooms outside the rule are byte-identical to C3's output; the count of rooms that change is measured
   and stated.
5. The editor's width stepper is untouched: no file under `src/commands/` changes.

*QA reading:* the criteria, C0 S3, `qa-7d3-tall-end-block.adversarial.test.ts`. *Logic reviewer:* ADR
0110 A4, E6, N3r 4, N11.9, Amendment O draft. *Clean-code reviewer:* the diff.

### C6 — phase gate

`pnpm check`, `pnpm ci:local`, a visual pass at 390 × 844 and 1440 px in both locales over one L, one
right-hand L, one straight and two U kitchens, then the push and the PR. *Visual reading:* every wave's
criteria and captures.

## ADRs this milestone needs

- **ADR 0110 Amendment O**: the corner stretch (overturns criterion 14), the back-wall rule, the top row
  (strikes E11.1 and E11.3 if Q4 = a), the absorb (departs from A4, D2, N3r 4, RQ25a).
- **ADR 0135**: the corner seam's front-line contract; amends ADR 0025's 630 figure and `SPEC.md`.
- **ADR 0104 Amendment D**: the desktop back control.
- A pointer in ADR 0113 for the reworded leaf.

## Risks

- **Baselines.** C2, C3 and C5 each change generated output for most rooms. The recorded baselines under
  `tests/generation/` are restated per wave with the reason, never regenerated silently.
- **Parity gate.** C4 changes geometry the M1 gate pins at 1e-6 m. The pins move only by ADR 0135's list.
- **Depth change.** A strip cabinet beside a frozen corner at 700 may meet ADR 0089's residue. C2 states
  its criteria at 600; C0 S2 measures 700, and a finding there is recorded, not absorbed.
- **Top bar fit.** A desktop back control enters a row whose fit ladder is ruled (ADR 0104). S3 may need
  to return to planning.
- **Price.** C2 and C3 add priced cabinets to every kitchen. The owner sees the new *de la* figure for
  the witness rooms before C3 closes.
- **Storage bound.** More placements per design. `MAX_PLACEMENTS` is checked in C3, not assumed.

## Verification

Per wave: paired tests, sabotage in both directions (R6), `pnpm format:check` whole-tree, the affected
packages' suites, then QA, then review at the named tier. Visual claims need captures of the real
surface. The coordinator re-runs every cited command as `rtk proxy`.
