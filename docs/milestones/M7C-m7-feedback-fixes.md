# M7C — M7 feedback fixes

**Status: PLANNED 2026-10-01; plan review round 1 applied; C0 measured and confirmed by QA; the
owner answered Q1, Q3, Q4 and Q7 the same day. C1 S1 is done (`8269440`); C1 S2 is running. Dispatchable: CE S0 and C4 S0 (neither writes
production code). The owner answered Q5 and Q6. C1 S3 waits on the owner confirming two points of the warning (Q1b); C2 on
Q2; C3 after C2; C4 S1 after C3; C5 after C4.** Branch `m7c-m7-feedback-fixes`,
cut from `main` at `2615b51`. Sits between M7B and M8. Every wave follows `docs/WORKFLOW.md`.

Source: `docs/M7-FEEDBACK.md`, twelve items (FB-012, the red e2e shards, was added on 2026-10-01) from the owner's hands-on check of M7 and M7B, with
screenshots in `docs/M7-FEEDBACK-assets/`.

Evidence tiers used below: **[src]** read at `2615b51` (file:line), **[doc]** quoted from a record,
**[inf]** inference, owed a measurement; **[C0]** measured by C0, confirmed by QA 2026-10-01 (scripts and
outputs kept by name in the session scratchpad, `c0/` and `c0-qa/`).

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
| 004 | Architect adjudication to overturn | Wall A's wall and top rows over each corner base are empty shell tiles (`shell-design.ts:381-398, 750-786`). Archived M7 plan, *Adjudication 7D1-Q1*, criterion 14: *"composition places nothing in the wall band over wall A's corner zone … left as an empty column the customer can fill"*. Not an owner ruling. The base corner legs and the side-wall returns **are** generated in a U (`shell-design.ts:652-718`). The stretch is exactly 900 mm in every approved room, tiled 800 + 100; the side wall's corner cabinet covers its first 330 mm at 600 and at 700. | [src] [doc] [C0] | C2 | P0 |
| 005 | Conforms to the record (owner, 2026-10-01: the room was under 10 m; rule kept) | `isBackWallBaseOnly` requires `isLargeU` (`upper-policy.ts:46-56`), `LARGE_U_TOTAL_MM = 10_000` (`run-layout.ts:136`). ADR 0110 N1.3: *"Depends on size"*, then a relayed selection: *"A + B + C ≥ 10 m … the base-only wall is the back wall (A)"*. So the request was recorded, with a threshold. | [src] [doc] | none | P1 |
| 006 | Contract gap, two seams in opposite directions | No record states a front-line contract at the corner. Against its neighbour, the side-wall corner piece (return) is **behind**: worktop −20 mm, carcass +10 mm; it has no door, so its bare carcass face is 8 mm behind the neighbour's **door** (10 beside a hob). The back-wall corner cabinet (X-leg) is **proud**: worktop +10, front +11. Identical at 600 and after a change to 700, in an L, a right-hand L and both corners of a U (32 seams). The owner's screenshot is reproduced for the side-wall pieces only. | [C0] | C4 | P1 |
| 007 | Defect against the mockup | Frame D1A `:92` declares `align-items:center` on the 88 px footer; the shipped rule has none (`room.module.css:1240-1246`), so the 52 px button sits at the top. The button stays right-aligned, as the frame draws it. | [src] [doc] | C1 S1 | P2 |
| 008 | Copy change, owner's wording | `room.cornerQuestion` (`ro.json:51`, `ru.json:51`); ADR 0113: *"I will adjust when I will decide later"*. | [src] [doc] | C1 S2 | P3 |
| 009 | Defect against the mockup | Frame D1B `:190` declares `align-items:center`; `.dimensionsFooter, .composeFooter` have none (`room.module.css:1604-1610`). Same cause as 007, a second rule. | [src] [doc] | C1 S1 | P2 |
| 010 | New rule, departs from owner rulings | A4: *"the remainder, at most 599 mm, stays"*; *"let the edges empty"* (D2); RQ25a, 2026-09-29: *"Back wall only"*, side walls' ends stay bare. E6 already absorbs `0 < remainder ≤ 200` into the module beside a **tower**; nothing does so beside the **fridge**. The editor half: a resize is funded by adjacent empty space only (ADR 0031); a fixed neighbour in between blocks it, and moving it is §13.2's rejected *"Auto-shifting a whole run"*. Measured: a resize beside a standing fridge is refused `NO_EMPTY_SPACE`. QA reproduced the owner's sequence on an L 3000 × 3010 at 600: the fridge goes back at 2250–2950 with 50 mm left and +50 is refused, as `M7-FB-010.png` shows. The "450" is unexplained. | [doc] [C0] | C5 | P2 |
| 011 | Same gap as 004, on the L | The seeded reference L fills wall A over the corner base: `p8` `wall-2door-600` and `p10` `wall-1door-300` at 1500, `p15`/`p16` at 2200 (`kitchen-l-design.ts:1033-1047`). The generated L leaves it empty (criterion 14). *"The earlier mock"* is read as that reference kitchen [inf]; no file in `docs/design/mockups/` draws a corner unit. | [src] [inf] | C2 | P1 |
| 012 | Unclassified until re-run: flake, test-fidelity problem or defect, per test | Nine tests red across six of seven e2e shards on `main` at `2615b51` (CI run 36841795476). Four shards log `toBeEnabled` *Expected: enabled, Received: disabled*, one beside `WRITE_ACCESS_TIMEOUT_MS`. Nothing re-run; no cause established. | [doc] the coordinator's log reading | CE | P1 |

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

**Q1 — FB-001. ANSWERED 2026-10-01.** Recorded in ADR 0104 Amendment D. Verbatim, typos included:

> *"so i saw on mobile the back link exists, but what if I done a lot of changes but I need only to edit
> the size, going back will wipe out all my changes, looks like I need the ability to edit room size
> withgout loosing current work. I know this can change a lot, especially when will be reduced the size,
> there should be decission what to drop from cabinets. So I think the simple solution is to show at
> least a big warning, with mention, if you go back you loose all the custom changes you done so far,
> please confirm. So this is simple and minimum needed doesn't matter on desktop or mobile I do this"*

Read as three things. (i) The back-to-room control is shown on desktop too. (ii) On phone and desktop,
using it asks for confirmation behind a prominent warning. (iii) Editing the room while keeping the
customised kitchen is the real wish, named by the owner as hard; **not this milestone**, recorded as a
new backlog entry with these words.

**Q1b — the warning's wording. Blocks C1 S3 until the two pending items below are confirmed.** The
owner rejected the architect's draft and gave the text, verbatim, 2026-10-01:

> *«The warning in RO : "Daca te intorci la pasul urmator modificarile efectuate vor fi pierdute. Esti
> sigur ca doresti sa reconfigurezi marimea bucatariei?" and translate also in RU»*

**The wording is the owner's.** It says the changes *will be lost*; the owner chose that knowing the
earlier draft. Storage is unchanged: the old design remains stored (ADR 0111 d5) and opens only from
its own link until M8. The warning is asked on leaving the editor, on phone and desktop.

**Pending with the owner, put by the coordinator, not decided:**
1. *"pasul urmator"* is *the next step*, and the control goes to the previous one. Proposed, with
   diacritics: *"Dacă te întorci la pasul anterior, modificările efectuate vor fi pierdute. Ești sigur
   că dorești să reconfigurezi mărimea bucătăriei?"*
2. The Russian, informal as the shipped copy is: *«Если вернёшься к предыдущему шагу, внесённые
   изменения будут потеряны. Точно хочешь заново задать размеры кухни?»* The owner reads it before it
   ships.

Buttons, none given by the owner; proposed: *Înapoi la cameră* / *Rămân aici*, *Назад к комнате* /
*Остаться здесь*.

**Q2 — FB-004, FB-011. Blocks C2.** Recorded in ADR 0110 Amendment O.
*On the back wall, above the corner base cabinet, there is a 900 mm stretch at the middle and top levels
that is empty today. The side wall's corner cabinet (570 mm wide) stands in front of the first 330 mm of
it. What should stand there?*
(a) **One 570 mm two-door cabinet**, from where the side wall's corner cabinet ends to the end of the
900 mm. It mirrors the 570 mm corner cabinet on the side wall, both doors open, and it lines up with the
base cabinets below. The 330 × 330 mm pocket in the very corner stays unbuilt behind the two cabinets.
(b) **A 600 mm and a 300 mm cabinet from the corner**, as the first reference kitchen had. The 600's
corner-side door (0–300 mm) is wholly behind the side wall's cabinet and cannot open.
(c) A dedicated corner wall unit: a new product with its own drawing and price; after beta.
(d) Leave it empty.
*Recommended: (a).* Why not the variants: 550 mm would leave a 20 mm slit; 600 mm would run 30 mm into
the side wall's cabinet; (b) with a fixed blind 300 mm front is a priced cabinet nobody can see or open,
or a new product. 570 is inside the cabinet's 200–800 mm range and is the width the side wall's corner
cabinet already has; the width stepper then moves it in 50 mm steps from 570. That the pocket is hidden
is [inf] until the captures for (a) and (b) are in. Also confirms: *middle* is the wall row.

**Q3 — FB-005. ANSWERED 2026-10-01** (relayed selection): *"Was under 10 m; keep rule"*. The output
conformed; the 10 m threshold of ADR 0110 N1.3 stands. No code change; C2 S2 is dropped.

**Q4 — FB-003. ANSWERED 2026-10-01** (relayed selection): *"Generate a top row"*. A 400 mm push-to-open
cabinet above every wall cabinet and above the hood, in every shape, in rooms at least 2600 mm high;
doors, not lift fronts; none above tall columns. About 6 more cabinets per kitchen [C0], so the price
rises. **ADR 0110 E11 is withdrawn** (E11.1 and E11.3 struck by name in Amendment O; F9's lift rule is
recorded as not applied, its 120–165 mm clearance note kept).

**Q5 — FB-006. ANSWERED 2026-10-01** (relayed selection): *"Everything on one line"*. Recorded in a
new ADR 0135. The side-wall corner piece gets a front panel level with the doors beside it and its
worktop comes forward 20 mm; the back-wall corner cabinet goes back 10 mm. Measured today [C0]: the
side piece's worktop is 20 mm back and its doorless front 8–10 mm behind the neighbour's door; the
back-wall corner cabinet is 10 mm in front, worktop and door.

**Q6 — FB-010. ANSWERED 2026-10-01** (relayed selection): *"Absorb gaps under 300 mm"*. Recorded in
ADR 0110 Amendment O. Where the fridge ends a run with under 300 mm beyond it, the door cabinet beside
it grows in 50 mm steps up to 800 mm and the fridge moves out by the same amount. Only where the
neighbour is a door cabinet. On a side wall 100 mm stays free. Resizing a cabinet through a standing
fridge in the editor is not built and goes to the backlog (104, below).

**Q7 — FB-008. ANSWERED 2026-10-01** (relayed selection): *"Approve both"*. Recorded as a pointer in
ADR 0113.

| Leaf | Romanian | Russian |
| --- | --- | --- |
| `room.cornerQuestion` | În care parte se află colțul bucătăriei? | В какой стороне находится угол кухни? |
| `room.cornerLeft` | La stânga (unchanged) | Слева |
| `room.cornerRight` | La dreapta (unchanged) | Справа |

`room.cornerHint` is unchanged in both (default; the owner did not object).

**Non-blocking, default built.** FB-007: the button stays right, centred vertically.

## Waves

| Wave | Covers | Pri | Tier | State |
| --- | --- | --- | --- | --- |
| C0 | Census and measurements; the questions | — | Light | **Ready** |
| C1 | FB-007, FB-009, FB-008, FB-001 | P1–P3 | Light + visual | S1 **done**; S2 **ready**; S3 on Q1b |
| C2 | FB-004, FB-011 | P0 | Full + visual | On Q2 |
| C3 | FB-003 | P1 | Full + visual | After C2 |
| C4 | FB-006 | P1 | Full + visual | S0 **ready** |
| C5 | FB-010 | P2 | Full | After C3 |
| CE | FB-012 | P1 | S0 Light; fixes Light, or Full + security if a defect | S0 **ready** |
| C6 | Phase gate | — | Coordinator + visual | Last |

**Order: C0 → C1 S1 → C1 S2 → CE S0 → CE fixes → C1 S3 → C2 → C3 → C4 → C5 → C6.** CE comes before C1 S3
and C2 because both change what the red tests look at (the desktop top bar; the generated kitchen and
its captures), and a wave that lands on a red baseline cannot tell its own regression from an old one.
C3 follows C2 because both write `upper-policy.ts`. C4 follows them so its captures show a complete
corner. C5 is last because it moves every baseline C2 and C3 also move. One writing agent in the tree
at a time (R2); CE S0 writes no tracked file, so it may run beside C1 S2, but only one e2e run at a
time uses port 4320 and the test database.

### C0 — census, measurements, questions (no production code)

| Slice | Does | Reading |
| --- | --- | --- |
| S1 | **First, the owner's state: a generated U changed to 700, both corners, compared with `M7-FB-006.png`.** Then a generated L, right-hand L and U at 600 and after a change to 700: the world-space front face and worktop front edge of each corner leg and of the neighbour it meets, in mm. If the measured U at 700 does not show the corner behind, S1 stops and reports. | `kitchen-parts.ts:290-314, 1932-2131`; `measure-built-body.ts`; ADR 0025, 0077; `SPEC.md` corner element |
| S2 | The wall-A corner strip: its tile spans over the approved L and U ranges, what the editor's insert offers there, and two captures for Q2 (the reference's 600 + rest; one cabinet from the return's depth to the strip's end). | `shell-design.ts:379-407, 739-795`; `upper-policy.ts`; backlog 63 |
| S3 | FB-010's witness: an L where the fridge ends a run with 150–299 mm beyond it. The count of approved rooms with such a remainder, per shape and wall. What the top-row voids offer over a wall cabinet and over a column. | `generation-priorities.ts`; `u-fridge-wall.ts`; `tall-end-rule.ts`; ADR 0110 A4, E6, N3r 4 |

**Done 2026-10-01; S1, S2 and the S3 census confirmed by QA the same day** (independent scripts, `c0-qa/`).
Beyond the triage rows:
- S2: the strip is 900 mm (800 + 100) in all 256,011 L and 88,434 U grid rooms, also at 1 mm steps. One
  570 mm `wall-cabinet` inserts with no finding at both corners and both depths. At 600 the return is at
  330–900 and the strip tiles are 330 deep; at 700, 400–970 and 400 deep, so the strip cabinet's front and
  the return's start move together. A hood (600–800) no longer fits a 570 tile, so backlog 63's offer
  disappears there [inf from the offer list].
- S3 census: the fridge ends a run with 150–299 mm beyond it in 46,425 of 245,211 planned L rooms (10 mm
  grid) and 3,054 of 86,706 U rooms (100 mm grid); a straight kitchen, none. C0's own output for the
  rule's range, 50–299 with a door cabinet inboard: 44,766 L rooms (wall A 22,995, B 21,771) and 4,752 U
  rooms; in 16,300 more L rooms the neighbour is the dishwasher or the sink, or the fridge is at the
  corner.
- S3 witness: C0's first replay did not go through the store's path and wrongly reported unmerged empty
  space. Applied as the store does, the spaces merge and the owner's sequence succeeds. **There is no
  merge defect.**
- S3: generated placements peak at 43 (U) and 34 (L); with a top row, 54 / 47 / 22, against
  `MAX_PLACEMENTS` 279.

*Criteria.* Every figure comes from a script kept by name in the scratchpad, run on a build of `HEAD`.
No file under `packages/` or `apps/` changes. S1 reports each seam as a signed difference, so *behind*
and *proud* cannot be confused. *QA reading:* the three scripts and their outputs. *Reviewer reading
(logic):* this plan's *Triage* and *Sweep*, the outputs, ADR 0110 E11, N3r.

### C1 — Step 1 footers, one leaf, the desktop way back (web)

| Slice | Does | Files | Reading |
| --- | --- | --- | --- |
| S1 | `align-items: center` on the three desktop footers. | `room.module.css` | Desktop mockup `:92, :190`; `room.module.css:207-225, 780-810, 1234-1246, 1598-1620`; ADR 0104 d1 |
| S2 | Q7's approved set in both locales, the type file, the copy lock, the golden manifest. | `ro.json`, `ru.json`, `ro.d.json.ts` | ADR 0113 d2–d3; ADR 0095 d2; `tests/support/approved-romanian-messages.ts`; `dimensions-form.tsx:125-210` |
| S3 | The back-to-room link shown from 900 px; both back links, on every viewport, open a confirmation before navigating. The dialog is the one the material change already uses. | `configure-screen.tsx`, `configure.module.css`, the settings confirmation component (extracted for reuse, not copied), `i18n/content.ts`, `ro.json` / `ru.json` / `ro.d.json.ts`; `configure/top-bar-fit.ts` only if the fit ladder must count the link | Q1, Q1b; ADR 0104 d8 and Amendment C; ADR 0111 d5; ADR 0081, 0086 (the existing confirmation); `settings/global-settings.tsx`, `global-settings-model.ts`; `configure-screen.tsx:100-120, 232-250`; `configure.module.css:176-200, 371-400, 549-700`; `browser-and-visual-qa.md` |

The wave exceeds the five-file limit, so each slice is its own dispatch and its own review. S3 alone is
about five production files plus the three message files, which change as one leaf set. **S3's tier is
Light plus visual, with QA owning the interaction**: it adds a behaviour to the phone, but no domain
rule, persistence or endpoint.

*Criteria.*
1. At 1280, 1440 and 1920 px wide, in 1A, 1B, 1C and 1F, each footer control's vertical centre is
   within 1 px of the footer's. *Must not:* any phone footer rule changes; a control moves horizontally.
2. The four leaves hold exactly the set the owner approved under Q7. No leaf outside
   `room.cornerQuestion`, `cornerHint`, `cornerLeft`, `cornerRight` changes in either file. The label does not wrap or clip at 390 px or at 520 px form width, in both
   locales.
3. From 900 px the editor shows one back-to-room control whose destination equals the phone's. It is
   absent in the shared variant. The top bar's containment test stays green at 900–1920 px; price, CTA
   and locale chip are never clipped.
3a. At 390 × 844 and at 1440 px, activating either back link opens the confirmation and does **not**
   navigate. *Stay* closes it, returns focus to the link and leaves the URL and the design unchanged.
   *Confirm* opens Step 1 with the room filled in. Escape and a backdrop press behave as *Stay*.
3b. *Must not:* confirming writes, deletes or re-mints anything (no request other than the navigation);
   the design is still at its `/d/…` link afterwards, and `/` still resumes it until a new kitchen is
   made. The dialog holds exactly the text and buttons the owner confirmed under Q1b, in both locales.
3c. The shared variant shows neither the link nor the dialog. Keyboard: the link is reachable by Tab, the
   dialog traps focus (backlog 48: no DOM in vitest, so this is the visual agent's check).
4. *Must not:* the review CTA gains a handler, role or pointer cursor.

*Visual evidence:* captures of 1A and 1B at 1440 px, the editor at 900 and 1440 px, 1B at 390 px in
`ro` and `ru`, and the open confirmation at 390 × 844 and 1440 px in both locales. *QA reading:* the criteria, `room.module.css` desktop block, `top-bar-fit.ts`.
*Reviewer reading (combined):* the diff, both mockup frames, ADR 0104 d8. *Visual reading:* the frames
and the captures.

### C2 — the corner stretch on wall A, and the U back wall (domain)

Written for Q2 (a), the 570 mm cabinet. Q3 kept the 10 m rule, so the back-wall rule is untouched.

| Slice | Does | Files | Reading |
| --- | --- | --- | --- |
| S1 | The shell tiles wall A's strip as one 570 mm tile, 330–900 (and `W − 900` to `W − 330` at a U's right corner), with no tile over the pocket. Generation puts one `wall-cabinet` in it, through `insertBody`. L, right-hand L, U (both corners). | `upper-policy.ts`, `generate-kitchen.ts`, `shell-design.ts` | ADR 0110 decisions 1–2, B2, C, E7, N3r 9–11; C0 S2; `shell-design.ts:379-407, 739-795`; `generate-kitchen.ts:449-482, 583-628` |

*3D contract.* Each strip cabinet is an ordinary wall-A body: back face on wall A's plane at 0.000
(§11 row 19), `y0` 1500, drawn unmirrored at both corners. Its near edge is the plane of the side
wall's return front (330 mm from the side wall, at 600 and 700); its far edge is the corner base's far
edge (900). Depth from the wall-depth map: 330 at 600, 400 at 700. It may not intersect the side wall's
corner return.

*Criteria.*
1. For every room on the approved L, right-hand L and U grids at 600, when the back wall is not
   base-only: wall A carries exactly one wall cabinet over each corner base, 570 mm wide, spanning
   330–900 from that corner, two doors. The right corner of a U is the left's mirror: the pocket is at
   the corner end at both. No empty column lies over the pocket. **[prop]**
1a. **Every door opens.** No door leaf of a strip cabinet lies, in whole or in part, within the
   side-wall return's depth of the corner. Checked on the leaf's own along-wall span, at both corners.
2. No generated design carries `RECORDED_SPAN_OVERLAPS_CORNER_BODY` or any other finding. *Must not:* a
   hood in a strip. With the strip cabinet deleted in the editor, the opening offers no hood.
2a. After a change to 700 the strip cabinet keeps its span and width, and no finding appears.
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

Q4 answered: a top row, above the hood too, not above tall columns, doors.

| Slice | Does | Files | Reading |
| --- | --- | --- | --- |
| S1 | For each generated wall-row cabinet, strip cabinets included, one top-row cabinet of the same width above it, push-to-open. | `upper-policy.ts`, `generate-kitchen.ts` | ADR 0110 E11, F9, Amendment O draft; `push-to-open.ts`; §13.1 *Top row ships push-to-open*; C0 S3 |

*3D contract.* `y0` 2200, height 400, back face on the wall plane, same along-wall span as the cabinet
below. Handles hidden, not removed (§13.1).

*Criteria.*
1. In a room at least 2600 mm high, every generated wall cabinet and the hood has exactly one top-row
   body over exactly its span. Below 2600, none, and generation does not throw across the approved height range.
   **[prop]**
2. *Must not:* a top-row body over a full-height column, over the fridge, or on a base-only back wall
   (there the hood, if on wall A, is the one body with a top cabinet over it).
3. Each top-row body resolves push-to-open with no customer action; a kitchen-wide handle change does
   not show a bar on it.
4. Everything below 2200 is byte-identical to C2's output. No finding on any generated design.
5. The largest generated design stays under `MAX_PLACEMENTS`; the measured peak is restated (C0
   predicts 54 before C2's strip cabinets).

*Visual evidence:* as C2, plus one room at 2500 and one at 2600 high. *Readings:* as C2, with ADR 0110
E11 and F9 for the logic reviewer.

### C4 — the corner seam (adapter and domain)

Q5 answered: everything on one line. Two seams, opposite directions [C0]: the side-wall return is behind (worktop −20,
carcass +10; its bare carcass is 8 / 10 mm behind the neighbour's door), the back-wall X-leg is proud
(worktop +10, door +11, carcass +10).

| Slice | Does | Files | Reading |
| --- | --- | --- | --- |
| S0 | Design, no production code: which constants move each of the four offsets to zero, and whether the X-leg's front can move without moving the joint (its carcass front is the return's along-wall start, 580 at 600). If it cannot, S0 stops and reports. | — | `kitchen-parts.ts:290-314, 1932-2131`; ADR 0025, 0077; `corner-assembly-size.ts`; C0 S1's script and output |
| S1 | The return: worktop front +20; a front on its bare carcass so its face meets its neighbour's. | `three-adapter/src/kitchen-parts.ts`; `configurator-domain/src/catalog.ts`, `fixtures/kitchen-l-design.ts` (declared occupied depths, fronts) | as S0; ADR 0135 draft; ADR 0021 d2; `product-invariants.md` |
| S2 | The X-leg: worktop front −10; front −11, as S0 designed it. | as S1; `docs/design/SPEC.md` | as S1; backlog 50 |

*3D contract.* Anchor: each wall's own plane. At depth D every base body on a wall, corner pieces
included, has its worktop front edge at one distance from that plane (620 at 600, 720 at 700) and its
front face at one distance (588 / 688). Scaling: follows the depth setting. Dependencies kept: the
X-leg's −20 seat; each leg's plinth recess from its own depth only; no two stone volumes interpenetrate
and no coplanar faces; the right corner's four pieces mirror the left's.

*Criteria.*
1. For L, right-hand L and U at 600 and after a change to 700, at all four kinds of seam, the signed
   worktop difference (corner minus neighbour) is 0 ± 1 mm. C0 S1's script is the instrument; today it
   reads −20 and +10.
2. At the same seams the signed front-face difference is 0 ± 1 mm beside a door or drawer front.
   Today: −8, −10 (beside a hob; the return's carcass against a door) and +11 (door against door). Beside a hob the bound is ADR 0135's, stated with its reason.
3. *Must not:* the two legs' slabs intersect; the X-leg's seat changes; a plinth stands proud of its own
   carcass front; any non-corner body's geometry moves; the return gains a handle, a finish control or a
   door count (ADR 0021 d2), or a price line.
4. The M1 parity gate's corner pins change only for the meshes ADR 0135 lists, each with its old and
   new value. An unlisted change is a failure.
5. `findCornerOverlaps` reports nothing on the seeded kitchen and on every generated one.

*Visual evidence:* top-down captures of both corners of a U and of an L at 600 and 700, beside
`M7-FB-006.png`. *QA reading:* the criteria, C0 S1's script, `kitchen-parts.decomposition.parity.test.ts`.
*Logic reviewer:* ADR 0025, 0077, 0135, S0's design, the diff. *Clean-code reviewer:* the diff.
*Visual:* the captures.

### C5 — the leftover beside a fixed-width end body (domain)

Q6 answered: absorb under 300 mm.

| Slice | Does | Files | Reading |
| --- | --- | --- | --- |
| S1 | L and straight: the plan widens the fit-width base beside the fridge and moves the fridge outward by the same amount. | `generation-priorities.ts`, `leftover-rule.ts`, `tall-end-rule.ts` (E6's absorb, `:143-162`, shared rather than restated) | ADR 0110 A4, D revised, E6, F7; C0 S3 |
| S2 | U: the same on the fridge wall. | `u-fridge-wall.ts` | ADR 0110 N3r 2–4, N11.1, N11.9 |

*Criteria.*
1. `r` is the free run's end minus the outermost body's end, as C0 S3 measured it. The free run already
   excludes a side wall's 100 mm reserve; an L's wall A has none. The reserve is never part of `r`.
   The rule applies to the fridge as the outermost body and a `base-cabinet` directly inboard of it.
   Where `r` is 50–299 mm, the adjacent `base-cabinet` is planned at `w + min(floor50(r), 800 − w)`, the
   fixed body moves outward by that amount, and the rest of `r` stays bare beyond it. Boundaries: `r` = 49, 50, 199, 200, 249, 299, 300; a neighbour already at 800; no
   fit-width neighbour. **[prop]**
2. *Must not:* the 100 mm side-wall reserve is spent; a cabinet exceeds 800; the reading order changes;
   the sink, hob, dishwasher or any fixed-width body changes width; an interior gap appears.
3. The upper over the widened base has the same width.
4. Rooms outside the rule are byte-identical to C3's output; the count of rooms that change is measured
   and stated. C0 predicts 44,766 of 245,211 L rooms (10 mm grid), 4,752 of 86,706 U rooms (100 mm grid)
   and no straight kitchen; a different count is a finding. Where the inboard body is fixed-width,
   nothing changes.
5. The editor's width stepper is untouched: no file under `src/commands/` changes.

*QA reading:* the criteria, C0 S3, `qa-7d3-tall-end-block.adversarial.test.ts`. *Logic reviewer:* ADR
0110 A4, E6, N3r 4, N11.9, Amendment O draft. *Clean-code reviewer:* the diff.

### CE — the e2e shards on the runner (FB-012)

| Slice | Does | Files | Reading |
| --- | --- | --- | --- |
| S0 | No tracked file changes. **Local half, dispatchable now and not waiting on the runner:** the agent runs each of the nine tests alone, locally, three times, on `main`'s tree at `2615b51` and on `HEAD`, and reads the saved log to attach each `toBeEnabled` failure to its test. **Runner half, owed:** a re-run of run 36841795476's failed jobs was refused on 2026-10-01 (*"Resource not accessible by personal access token"*) and is not worked around; the owner re-runs it, or the first push of this branch supplies a fresh run. Until then no row is classed *runner-only*, only *not reproduced locally*. Output: one table, test → deterministic or intermittent → local or runner-only → cause group → class (flake, test-fidelity, defect). | — | `M7-FEEDBACK.md` *M7-FB-012*; scratchpad `run-36841795476.log`; `ci-and-local-gates.md`; `agent-coordination.md` (port 4320, `TEST_DATABASE_URL`); ADR 0105; `playwright.config.ts`; `.github/workflows/ci.yml` e2e jobs; the nine spec files and `support/u-gate-journeys.ts`, `support/u-gate.ts` |
| S1… | One slice per cause group from S0, each named in this table before dispatch, with its files and reading. | from S0 | from S0 |

*Expected groups, [inf] from the log, for S0 to confirm or replace.* (1) Write access arriving late:
`share-design:96`, `qa-7e3c-share:638`, `qa-u7s0-ssr:271`, `u-gate-journeys:648`. (2) Captures and pixel
counts: `pixel-counter-witness.desktop:352`, both `qa-7i-mirror-captures:18`. (3) Desktop layout:
`room-desktop-line.desktop:551`, `top-bar-pill-containment.desktop:788`.

*Which of the nine later waves also touch, so they are not fixed twice.* `top-bar-pill-containment` is
C1 S3's (it adds a link to that row). `room-desktop-line` criterion 8 is checked against C1 S1's footer
change (`8269440`) first. The capture and pixel-count tests read generated kitchens that C2, C3 and C4
change: CE fixes their timing or instrument only, and each later wave restates their expected values
for its own change.

*Criteria.*
1. S0's table has all nine tests, each with the runs it was judged on. A cause is stated only where a
   run shows it; otherwise the row says *not established*.
2. A fix never weakens an assertion, raises a timeout without a measured reason, adds a retry, or skips
   a test. A timeout that moves is stated with the measured duration it must cover.
3. A test found to assert a real defect stays red and returns to planning; if the defect is in write
   access, the visitor cookie or a share link, its fix is Full tier with security review.
4. After the fixes, all seven shards are green on the runner **twice in a row** on one commit.
5. *Must not:* any file under `apps/web/src` or `packages/*/src` changes in a slice classed as flake or
   test-fidelity.

*QA reading:* S0's table and the runs behind it. *Reviewer reading (combined):* the diff, S0's table,
`engineering-conventions.md` *Three guards that look thorough and cannot fail*. *Security reading, if
triggered:* ADR 0114, the diff.

### C6 — phase gate

`pnpm check`, `pnpm ci:local`, **a green runner** (wave CE; this gate cannot close on a red one), a visual pass at 390 × 844 and 1440 px in both locales over one L, one
right-hand L, one straight and two U kitchens, then the push and the PR. *Visual reading:* every wave's
criteria and captures.

## ADRs this milestone needs

- **ADR 0110 Amendment O**: the corner stretch (overturns criterion 14), the back-wall rule, the top row
  (strikes E11.1 and E11.3 if Q4 = a), the absorb (departs from A4, D2, N3r 4, RQ25a).
- **ADR 0135**: the corner seam's front-line contract; amends ADR 0025's 630 figure and `SPEC.md`.
- **ADR 0104 Amendment D**: the desktop back control.
- A pointer in ADR 0113 for the reworded leaves (Q7).
- **Backlog 104**, for the scribe to file: *A cabinet cannot be resized through a fixed-width
  neighbour* — the owner asked on 2026-10-01 (M7-FB-010) how hard it is to widen a cabinet without
  removing the fridge beside it, and on Q6 sent it to the backlog. A resize is funded by adjacent empty
  space only (ADR 0031); moving the fridge inside the command is §13.2's rejected auto-shift. Cost: a
  new funding arm in `plan-width-funding.ts`, column moves, the frozen map and every body stacked over
  the neighbour; one Full-tier domain wave.
- **Backlog 103**, for the scribe to file:

  > **103. Editing the room's size keeps none of the customer's changes — WANTED BY THE OWNER
  > 2026-10-01, NOT BUILT, NO PHASE.** The owner, verbatim (M7C Q1): *"what if I done a lot of changes
  > but I need only to edit the size, going back will wipe out all my changes, looks like I need the
  > ability to edit room size withgout loosing current work. I know this can change a lot, especially
  > when will be reduced the size, there should be decission what to drop from cabinets."* **Today:**
  > continuing from Step 1 generates a new design; no edit is carried over; the old design stays stored
  > (ADR 0111 d5) and opens only from its own link until M8 (ADR 0114 d4). M7C C1 S3's confirmation is
  > the owner's stated minimum, not this entry. **Cost:** a room change applied to a stored design, not
  > a regeneration. Growing a wall adds empty space; shrinking one needs an undecided rule for what is
  > dropped or narrowed. A domain milestone of its own, with owner questions first.

## Risks

- **Baselines.** C2, C3 and C5 each change generated output for most rooms. The recorded baselines under
  `tests/generation/` are restated per wave with the reason, never regenerated silently.
- **Parity gate.** C4 changes geometry the M1 gate pins at 1e-6 m. The pins move only by ADR 0135's list.
- **Depth change.** At 700 the return starts at 400 along its wall and the strip tiles are 400 deep [C0],
  so the strip cabinet and the return still meet. C2 criterion 2a holds it; ADR 0089's 30 mm residue on
  the side walls is untouched.
- **Top bar fit.** A desktop back control enters a row whose fit ladder is ruled (ADR 0104). S3 may need
  to return to planning.
- **Price.** C2 and C3 add priced cabinets to every kitchen. The owner sees the new *de la* figure for
  the witness rooms before C3 closes.
- **Storage bound.** More placements per design. `MAX_PLACEMENTS` is checked in C3, not assumed.

## Verification

Per wave: paired tests, sabotage in both directions (R6), `pnpm format:check` whole-tree, the affected
packages' suites, then QA, then review at the named tier. Visual claims need captures of the real
surface. The coordinator re-runs every cited command as `rtk proxy`.
