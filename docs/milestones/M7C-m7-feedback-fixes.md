# M7C — M7 feedback fixes

**Status: IN PROGRESS, 2026-10-01; plan review round 1 applied; C0 measured and confirmed by QA. The owner
has answered Q1, Q1b, Q3, Q4, Q5, Q6, Q7 and the corner joint (J). Done: C1 S1 (`8269440`), C1 S2
(`21c702b`), and wave C4 (S0; S1 `c4eeea6`; S2 `48bbc0c`). Next: C2, which is re-planned on the owner's Q2 answer; its S0 is done and reviewed, S1 is built and in its fix batch, gate G-C2 is passed (Q9: handles kept as built), and S2 is ready once S1 is committed. Then C1 S3, C3, C5, and wave CE last, by the owner's word. Nothing is pushed, and `pnpm check`, `pnpm ci:local` and e2e have not been run on this branch.** Branch `m7c-m7-feedback-fixes`,
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
| 002 | Named interim | Inert until M8 builds the review route (ADR 0104 d6; `configure-screen.tsx:232-247`). | [src] [doc] | M8 | P3 |
| 003 | Owner ruling to overturn | Generation inserts uppers at `WALL_ROW_Y0_MM` only (`generate-kitchen.ts:451-482`). ADR 0110 E11.1: *"Composition places no body in the top row (2200–2600)"*, owner 2026-09-14: *"let's stick to what we have now. Get some feedback."* Every shape, not only the U. | [src] [doc] | C3 | P1 |
| 004 | Architect adjudication to overturn | Wall A's wall and top rows over each corner base are empty shell tiles (`shell-design.ts:381-398, 750-786`). Archived M7 plan, *Adjudication 7D1-Q1*, criterion 14: *"composition places nothing in the wall band over wall A's corner zone … left as an empty column the customer can fill"*. Not an owner ruling. The base corner legs and the side-wall returns **are** generated in a U (`shell-design.ts:652-718`). The stretch is exactly 900 mm in every approved room, tiled 800 + 100; the side wall's corner cabinet covers its first 330 mm at 600 and at 700. | [src] [doc] [C0] | C2 | P0 |
| 005 | Conforms to the record (owner, 2026-10-01: the room was under 10 m; rule kept) | `isBackWallBaseOnly` requires `isLargeU` (`upper-policy.ts:46-56`), `LARGE_U_TOTAL_MM = 10_000` (`run-layout.ts:136`). ADR 0110 N1.3: *"Depends on size"*, then a relayed selection: *"A + B + C ≥ 10 m … the base-only wall is the back wall (A)"*. So the request was recorded, with a threshold. | [src] [doc] | none | P1 |
| 006 | Contract gap, two seams in opposite directions | No record states a front-line contract at the corner. Against its neighbour, the side-wall corner piece (return) is **behind**: worktop −20 mm, carcass +10 mm; it has no door, so its bare carcass face is 8 mm behind the neighbour's **door** (10 beside a hob). The back-wall corner cabinet (X-leg) is **proud**: worktop +10, front +11. Identical at 600 and after a change to 700, in an L, a right-hand L and both corners of a U (32 seams). The owner's screenshot is reproduced for the side-wall pieces only. | [C0] | C4 | P1 |
| 007 | Defect against the mockup | Desktop footer lacked the frame's `align-items:center`. **Fixed, `8269440`.** | [src] [doc] | C1 S1 | P2 |
| 008 | Copy change, owner's wording | `room.cornerQuestion` and the Russian answers. **Shipped, `21c702b`.** | [src] [doc] | C1 S2 | P3 |
| 009 | Defect against the mockup | Same cause as 007, a second rule. **Fixed, `8269440`.** | [src] [doc] | C1 S1 | P2 |
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
| Archived M7 plan, 7D1-Q1, criterion 14; ADR 0130 sweep row (`:102`, *"7D2 c. 14 … no uppers over the corner"*); ADR 0110 B2 (*"0 for wall A's wall and top bands, where nothing structural stands above the corner base"*) | Nothing composed over wall A's corner zone; the stretch is an empty column the customer can fill. | **Overturned by the owner's Q2 answer**: a structural piece stands there, so the stretch is no longer an opening. Criterion 14's property, no `RECORDED_SPAN_OVERLAPS_CORNER_BODY`, holds trivially. |
| ADR 0110 N1.3, *N3 revised* 11, RQ7 | Back wall base-only in a large U (≥ 10 m), hood kept, voids left for the editor. | **Kept unless Q3 changes the threshold.** |
| ADR 0110 A4, D2, E6, *N3 revised* 4, N11.9 (RQ25a/b) | Remainder ≤ 599 stays bare; E6 absorbs ≤ 200 beside a tower; a U's wall A fills from 300; side-wall ends stay bare; under 400 beyond the fridge stays bare. | **FB-010 departs from A4, D2, N3r 4 and RQ25a** for one case. Needs Q6, then Amendment O. E6 is the precedent. |
| ADR 0110 F7 / ADR 0108 H3 | Wall B and wall C keep a 100 mm reserve for the 600 → 700 slide. | **Kept.** The absorb never spends it. |
| ADR 0031, 0035, 0043, 0046, 0052 | A resize is funded by adjacent empty space; ±50 stepper; any gap is legal for a customer's edit; 800 caps a cabinet and an empty column. ADR 0043 superseded 0031's sub-300 floor. | **Unchanged.** C5 is generation only. |
| `DEVELOPMENT-SPEC.md` §13.2 | Auto-shifting a run is rejected: *"Positions carry meaning"*. | **Stands.** The editor half of FB-010 is not built (Q6). |
| ADR 0021, 0066, §13.1 | Corners are structural. | **Unchanged.** C2 places ordinary cabinets, not structural ones. |
| ADR 0025, 0077; §11 row 19; `SPEC.md` corner element, *Junction* | The X-leg seats at −20, by its joint. Its worktop reaches 630 against a run's 620: that figure is `SPEC.md`'s (*"z −0.010 → 0.630"*), not ADR 0025's; a comment at `kitchen-l-design.ts:106` misattributes it. | **C4 S2 restates `SPEC.md`'s figure**; the seat is not touched. |
| ADR 0089 | Corner widths frozen at a depth change; 30 mm upper-row residue on the side walls. | **Unchanged.** C2 and C3 criteria are stated at the generated depth. |
| ADR 0104 d6, d8, Amendments B, C | Mockups are the chrome contract; a departure needs the owner. D2A draws no back control. | **FB-001 on desktop is a departure**: Amendment D, on Q1. FB-007 and FB-009 restore the frames. |
| ADR 0111 d5, ADR 0114 d4, ADR 0115 | Back never erases; `/` resumes the newest design; profiles hold several, in M8. | **Unchanged.** Idea A's discard warning would contradict 0111 d5. |
| ADR 0113, ADR 0095 d2 | Step 1 copy approved as drafted; a leaf enters the copy lock in the commit that changes it; no agent approves a translation. | **Followed.** The Russian leaf is a draft the owner reads. |
| ADR 0117, ADR 0110 E12.4 | Cheap baseline. E12.4: *"adding new cabinets will be like after having the beta testing"*, recorded under *new tall body types*. | **Overridden for this one unit by the owner's Q2 instruction** (2026-10-01), named in Amendment O; E12.4 stands for everything else. **ADR 0117 is narrowed** the same way: every cornered kitchen gains priced pieces. |
| ADR 0110 7D6 J2 (the comment on `CORNER_ASSEMBLY_PIECES`, `corner-assembly-size.ts`) | *"No piece is added or removed here"*: the assembly is the four seeded corner bodies. | **Overturned by Q2**: six pieces. Struck by name in Amendment O. |
| Backlog 63 | A hood over wall A's corner is offered, accepted, then marked; reproduced on the seeded kitchen. | **Narrowed, not closed.** After C2 the opening exists only in a U of 10 m or more (Q8 (iii)), the seeded kitchen and designs stored before C2. The entry stays open with that scope. |
| ADR 0021, 0066, §13.1, §11 row 16; backlog 60 (owner, 2026-09-09) | Corners are structural: no replace, delete, width or handle control; a colour of their own since 2026-09-09; each corner body has its own kind and name. | **Fits.** The new unit takes `STRUCTURAL_CORNER` unchanged; `panel.structuralReasons.corner` already says it. Names: Q8. |

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

**Q1b — the warning's wording. ANSWERED 2026-10-01.** The owner rejected the architect's draft and
gave the text, verbatim: *«The warning in RO : "Daca te intorci la pasul urmator modificarile efectuate
vor fi pierdute. Esti sigur ca doresti sa reconfigurezi marimea bucatariei?" and translate also in RU»*.
The coordinator put back *"pasul anterior"* for *"pasul urmator"*, diacritics, a Russian draft and the
buttons; the owner answered *"Approve as proposed"* (relayed selection). The approved set:

| | Romanian | Russian |
| --- | --- | --- |
| Warning | Dacă te întorci la pasul anterior, modificările efectuate vor fi pierdute. Ești sigur că dorești să reconfigurezi mărimea bucătăriei? | Если вернёшься к предыдущему шагу, внесённые изменения будут потеряны. Точно хочешь заново задать размеры кухни? |
| Confirm | Înapoi la cameră | Назад к комнате |
| Stay | Rămân aici | Остаться здесь |

**The wording is the owner's.** Storage is unchanged: the old design remains stored (ADR 0111 d5) and
opens only from its own link until M8. The warning is asked on leaving the editor, on phone and desktop.

**Q2 — FB-004, FB-011. ANSWERED 2026-10-01, in the owner's own words; none of the offered options.**
Recorded in ADR 0110 Amendment O.

> *"I think in the reference there is a good example of how the corner cabinets should be placed, even
> that is not perfect but at least is exists. I now that corner is somehow a 2 cabinets cabinet (it has 2
> parts) and only one has door the wider part has door. So I gave no idea on what sizes should be there,
> make calculations yourselve but corner should be fixed, non editable and cover all empty space withing
> the corner"*

Read as: one fixed corner wall unit on the back wall, covering the whole stretch above the corner base;
two parts, a blind one behind the side wall's corner cabinet and a wider one with a door; structural
like the other corner pieces. Sizes are ours. The 570 mm ordinary cabinet this plan recommended is
withdrawn. Design and what remains open: wave C2 and Q8.

**Q9 — which edge the corner doors' handles are on. ANSWERED 2026-10-01** (two relayed selections):
*"Keep as built"*, handles at the corner and hinges on the outer edges for both corner wall doors; and
*"No, wall cabinets only"*, the base corner cabinet is not affected. The owner then typed, verbatim:
*"keep handles as you draw, no changes"*. Nothing changes in the builder.
The comparison put to the owner follows; column (b)'s figures are QA's measurements, the rest is the
architect's arithmetic. The owner asked for the handles on the outer edges, away from the corner, to avoid a door
conflict. The kit draws no hinge, so the handle edge is the hinge side's opposite. By arithmetic on the
built figures (plan view; a leaf turning about its hinge-edge back corner; 18 mm slab; bar 40 mm in,
reaching 39 mm proud):

| | (a) as asked: both handles outer, hinges at the corner | (b) as built: handles at the corner, hinges outer | (c) only the new unit's handle outer |
| --- | --- | --- | --- |
| The unit's door alone | opens to about 93° (94° at 700), 33 mm from the side door | free to 110°, at least 34.9 mm clear (QA) | opens to about 91°, 12 mm from the side cabinet's bar |
| The side cabinet's door alone | meets the unit's bar at about 88° | free; passes the unit's bar 12.0 mm clear (QA) | free |
| One door open, then the other | **blocked**: the open side door stands 6 mm in front of the unit's whole door; the open unit door stops the side door within about 4° | free in either order | free only if the side door is opened first |
| Both open at 90° | **impossible**: they would occupy the same place by the corner | possible; they stand apart, away from the corner | possible |
| Both moved at the same moment | collide | cross at about 45° | collide |
| Bars | 500 mm and more apart | 64 mm apart at the corner | apart |

**The real conflict is in (a), not in (b).** Doors hinged at an inside corner swing into each other's
fronts; doors hinged away from it swing apart. What (b) has is two bars close together.
*Recommended and chosen: (b).* If the two bars are the objection, a fourth option removes it without moving a
hinge: (d) the two corner doors push-to-open, no bars. **What (a) or (c) would touch:** the handle edge
is derived in the builder, not stored (`wallCabinet`, `kitchen-parts.ts` about `:1701`), so no stored
design changes. The new unit's edge is one literal and moves no pin. The side cabinet's is
`wallCabinet`'s one-door rule, shared with every ordinary one-door wall cabinet, so it needs its own
parameter; it stands in every L and U and in the seeded kitchen, so its bar and stems become named
departures in the parity gate. The top units' bars are on the bottom edge and hidden; nothing of theirs
moves. Whether the base corner cabinet (handle on the corner side today) is meant too was not said.

**Q8 — the corner wall unit.** (i) and (ii) are non-blocking; their defaults are built and labelled.
(i) *Price:* no price row exists. Default: the side wall's corner cabinet's placeholder figures.
(ii) *Name:* default, the side wall's names (*Dulap suspendat de colț*, *Dulap de colț rând de sus*);
one name at one amount twice does not confuse a breakdown (ADR 0066).
(iii) *A U of 10 m or more.* **ANSWERED 2026-10-01** (relayed selection): *"No, back wall stays
base-only"*. In a U whose walls total 10 m or more the corner wall unit does not stand on the back wall;
the corner stretch stays empty and free for the customer to fill by hand. ADR 0110 *N3 revised* 11 stands.

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

**Q7 — FB-008. ANSWERED 2026-10-01** (relayed selection): *"Approve both"*; shipped in `21c702b`.
Romanian *«În care parte se află colțul bucătăriei?»*, answers unchanged; Russian *«В какой стороне
находится угол кухни?»*, *«Слева»* / *«Справа»*; the hint unchanged.

## Waves

| Wave | Covers | Pri | Tier | State |
| --- | --- | --- | --- | --- |
| C0 | Census and measurements; the questions | — | Light | **Done**, confirmed by QA |
| C1 | FB-007, FB-009, FB-008, FB-001 | P1–P3 | Light + visual | S1 **done** (`8269440`), S2 **done** (`21c702b`); S3 **open**, after C2 |
| C2 | FB-004, FB-011 | P0 | Full + visual | S0 done. S1 built, in its fix batch. S2 **ready** once S1 is committed |
| C3 | FB-003 | P1 | Full + visual | After C2 |
| C4 | FB-006 | P1 | Full + visual | **Done**: S0; S1 `c4eeea6`; S2 `48bbc0c` |
| C5 | FB-010 | P2 | Full | After C3 |
| CE | FB-012 | P1 | S0 Light; fixes Light, or Full + security if a defect | After C5 (owner) |
| C6 | Phase gate | — | Coordinator + visual | Last |

**Order: C4 S1 → C4 S2 → C2 → C1 S3 → C3 → C5 → CE → C6.** C4 leads: it shares no figure with C2 or
C3. C2 follows C4 S2 directly: both write `kitchen-parts.ts`, `corner-assembly-size.ts` and the fixture.
C3 follows C2 (both write `upper-policy.ts`). C5 moves every baseline, so it is the last change.
**CE is last, by the owner's word, 2026-10-01: *"e2e do the last after all fixes"*.** One writing agent
per tree (R2).

### C0 — census and measurements: DONE 2026-10-01, confirmed by QA

Scripts and outputs: scratchpad `c0/` and `c0-qa/`. Figures later waves cite:
- **Corner seam** (32 seams; L, right-hand L, U; 600 and 700): in the triage row for 006 and in C4.
- **Corner strip:** 900 mm (800 + 100) in all 256,011 L and 88,434 U grid rooms; the side return starts
  330 along its wall at 600 and 400 at 700. **Correction, 2026-10-01:** C0's and QA's *"return 330 deep
  at 700"* is a harness artefact, see C2.
- **Fridge-ended runs:** 150–299 mm beyond the fridge in 46,425 of 245,211 planned L rooms (10 mm grid)
  and 3,054 of 86,706 U rooms (100 mm grid); none in a straight kitchen. For the rule's own range,
  50–299 with a door cabinet inboard (C0's output): 44,766 L rooms (wall A 22,995, B 21,771) and 4,752 U
  rooms; in 16,300 more L rooms the neighbour is the dishwasher or the sink, or the fridge is at the
  corner.
- **The owner's FB-010 sequence** succeeds on an L 3000 × 3010 when applied as the store applies it;
  there is no merge defect.
- **Placements:** peak 43 (U), 34 (L); with a top row 54 / 47 / 22, against `MAX_PLACEMENTS` 279.

### C1 — Step 1 footers, one leaf, the desktop way back (web)

| Slice | Does | Files | Reading |
| --- | --- | --- | --- |
| S1 | **Done, `8269440`.** Desktop footers centred vertically (FB-007, FB-009). | — | — |
| S2 | **Done, `21c702b`; visually verified 2026-10-01.** Q7's copy in both locales (FB-008). At 1440 px one line in `ro` and `ru`; at 390 px `ro` fits one line, `ru` wraps the question and the hint to two lines side by side, radios untouched. | — | — |
| S3 | The back-to-room link shown from 900 px; both back links, on every viewport, open a confirmation before navigating. The dialog is the one the material change already uses. | `configure-screen.tsx`, `configure.module.css`, the settings confirmation component (extracted for reuse, not copied), `i18n/content.ts`, `ro.json` / `ru.json` / `ro.d.json.ts`; `configure/top-bar-fit.ts` only if the fit ladder must count the link | Q1, Q1b; ADR 0104 d8 and Amendment C; ADR 0111 d5; ADR 0081, 0086 (the existing confirmation); `settings/global-settings.tsx`, `global-settings-model.ts`; `configure-screen.tsx:100-120, 232-250`; `configure.module.css:176-200, 371-400, 549-700`; `browser-and-visual-qa.md` |

S3 is its own dispatch: about five production files plus the three message files, which change as one
leaf set. **Tier: Light plus visual, with QA owning the interaction.**

*Criteria.*
3. From 900 px the editor shows one back-to-room control whose destination equals the phone's. It is
   absent in the shared variant. The top bar's containment test stays green at 900–1920 px; price, CTA
   and locale chip are never clipped.
3a. At 390 × 844 and at 1440 px, activating either back link opens the confirmation and does **not**
   navigate. *Stay* closes it, returns focus to the link and leaves the URL and the design unchanged.
   *Confirm* opens Step 1 with the room filled in. Escape and a backdrop press behave as *Stay*.
3b. *Must not:* confirming writes, deletes or re-mints anything (no request other than the navigation);
   the design is still at its `/d/…` link afterwards, and `/` still resumes it until a new kitchen is
   made. The dialog holds exactly Q1b's approved set, in both locales.
3c. The shared variant shows neither the link nor the dialog. Keyboard: the link is reachable by Tab, the
   dialog traps focus (backlog 48: no DOM in vitest, so this is the visual agent's check).
4. *Must not:* the review CTA gains a handler, role or pointer cursor.

*Visual evidence:* the editor at 900 and 1440 px, and the open confirmation at 390 × 844 and 1440 px in both locales. *QA reading:* the criteria, `room.module.css` desktop block, `top-bar-fit.ts`.
*Reviewer reading (combined):* the diff, both mockup frames, ADR 0104 d8. *Visual reading:* the frames
and the captures.

### C2 — the corner wall unit (adapter and domain)

Re-planned 2026-10-01 on the owner's Q2 answer. **S0 (design check, source only, nothing run) is done
the same day; its result is *S0 — settled* below. Not dispatched until the plan reviewer has read it.**

**What the reference has** [src]. On the back wall above the corner base: `p8` `wall-2door-600` at 0–600
and `p10` `wall-1door-300` at 600–900, with `p15` / `p16` above them (`kitchen-l-design.ts`, the seeded
placements). The 600's corner-side door is behind the side wall's corner cabinet: the owner's *"not
perfect"*. The base corner is the two-part model the owner describes: `base-corner-x-900` is one 900 mm
body, blind for the span the side wall's piece covers, with one door on the rest. The side wall's
`wall-corner-return-570` and `-top` are 570 mm, one door each, `STRUCTURAL_CORNER`.

**The unit: the base X-leg's shape, one level up.**

| | Middle unit | Top unit |
| --- | --- | --- |
| Build id (new, seeded, structural) | `wall-corner-x-900` | `wall-corner-x-900-top` |
| Span on the back wall | 0–900 from the corner (the corner reach; the base X-leg's own width in that room) | same |
| Height, `y0` | 700, 1500 | 400, 2200; not built in a room under 2600 (the existing ceiling rule) |
| Depth | the wall-cabinet depth: 330 at 600, 400 at 700 | same |
| Blind part | the side wall's corner cabinet's depth: 330 at 600, 400 at 700 | same |
| Door part | 570 at 600, 500 at 700; **one door**, 537 / 467 wide, beside a fixed stile | same, push-to-open (§13.1) |
| Hinge | on the edge away from the corner; handle on the corner side (owner, Q9) | same; bar on the bottom edge, hidden |
| Right corner of a U | the same body in its own mirrored wrapper (ADR 0132 d2), `cornerOf` = right | same |
| Flags | `STRUCTURAL_CORNER`: no replace, delete, width or handle control; follows the kitchen's colour and may take its own (backlog 60) | same |
| Kind and name | the side wall's kinds, pending Q8 (ii) | same |
| Price | a flat rule under its own build id, at the side wall piece's placeholder, pending Q8 (i) | same |

The blind part is not seen from the room; with the closure and the stile it leaves no slot and no
recess, which is the owner's *"cover all empty space"*.

**Where the pieces come from: generated shells only; the seeded kitchen is not touched** [S0, confirmed].
`STRUCTURAL_ASSEMBLY` is the seeded kitchen's structural placements (`shell-design.ts:250`); the shell
gains two template placements of its own beside it. The seeded kitchen keeps `p8` (600) and `p10` (300)
at 1500 and `p15`, `p16` at 2200 over its corner base. **It is the supplier's corner, kept on purpose, and a customer can still meet it:** a mint stores
`KITCHEN_L_DESIGN` (`api/designs/route.ts:77`) and the store starts from it
(`configurator-store.ts:735`) until Step 1's save replaces it (ADR 0111), so a visitor whose save failed
after the mint may resume the reference kitchen with `p8` and `p10` over its corner. C2 does not change
that path. Amendment O says: the reference's corner is the supplier's and is pinned mesh for mesh by
M1's parity gate; every kitchen generation produces has the shell's corner; the failed-save path is
named, not denied.
Cost avoided: 62 files name those four ids [src: grep; `p10` may over-count].

**S0 — settled** (read from source; figures at kit depth 600 unless said; *measure* marks what S1 or
S2's implementer confirms on built geometry).

*Parts, group-local metres, in `wallCabinet`'s own frame* (x centred on the body, y from its floor, z
centred on the shell; `W` = 0.9; `D` = `wallDepthM`; `shellD` = `D − 0.039`; `blind` = `D`, the side
return's finished depth from its own wall). Size, then centre x and z:

| Part | At 600 (`D` 0.33, `shellD` 0.291) | At 700 (`D` 0.40, `shellD` 0.361) |
| --- | --- | --- |
| `carcass` | 0.900 × `H` × 0.291; x 0, z 0 | 0.900 × `H` × 0.361; x 0, z 0 |
| blind closure (new, wears the finish): `shellD` wide, `D − shellD` deep | 0.291 × `H` × 0.039; x −0.3045, z 0.165 | 0.361 × `H` × 0.039; x −0.2695, z 0.200 |
| fixed stile (new, wears the finish), on the leaf's plane, from the closure to the leaf less one `GAP` | 0.065 × (`H` − 0.006) × 0.018; x −0.1265, z 0.1545 | 0.065 × (`H` − 0.006) × 0.018; x −0.0565, z 0.1895 |
| leaf (`doorSlab`), `W − (blind + 0.03) − 0.003` wide, far edge at `W/2 − 0.003` | 0.537 × (`H` − 0.006); x 0.1785, z 0.1545 | 0.467 × (`H` − 0.006); x 0.2135, z 0.1895 |
| handle | middle unit: vertical bar, `"left"` edge (the corner side), 40 mm in. Top unit: `"bottom"` edge, built and hidden | same |

`H` is 0.7 (middle) or 0.4 (top); the leaf and stile hang from `H − 0.003`. **Ruled 2026-10-01 on QA's Q3.1: the far edge takes an ordinary wall door's 3 mm reveal, not the base
corner cabinet's 10 mm.** The leaf was first built 530 / 460 wide with 10 mm at the far edge, which
left a 10 mm strip of carcass 18 mm back and a 12.5 mm joint to the next door where two wall cabinets
leave 5.5. The 10 mm is the supplier's literal on `cornerBaseX` with no reason recorded; a hinge at
that edge does not need it, since every ordinary hinged door stands 2.5–3 mm from its cabinet's side.
Old → new: leaf 530 → 537 and 460 → 467; centre x 0.175 → 0.1785 and 0.210 → 0.2135; far-edge reveal
10 → 3; joint to a two-door neighbour 12.5 → 5.5. The near clearance stays `cornerBaseX`'s 30 mm; the
far reveal is `wallCabinet`'s own (half its `0.006`), named once. The base X-leg's own 10 mm is not
touched. **Split: 330 blind + 570 door part at 600; 400 + 500 at 700.**
*"The wider part has the door"* holds at both.

**Why 400 at 700, against C0 and QA.** The side return is `FOLLOWS_CABINET_DEPTH_ON_WALL_MAP` and is
built by `wallCabinet(width, 1)` at the kit's `wallDepthM` (`decomposed-bodies.ts:141-144`). The product
builds its kit with `wallDepthMm: wallCarcassDepthMm(cabinetDepthMm)` (`kitchen-stage.tsx:93, 233`): 400
at 700. Both measuring scripts call `makeKit({ cabinetDepthMm })` with no `wallDepthMm` (`c0/s1-lib.mts:25,
68`; `c0-qa/qa-lib.mts:18`), so it fell to `DEFAULT_WALL_DEPTH_MM` = 330 (`kitchen-parts.ts:287, 433`).
**The source is right; the 330 at 700 was the harness.** Their base-row figures do not read
`wallDepthM` and stand. S1's first item re-measures the return at 700 on a kit built as the product
builds it; the 700 column above is the expected result, and a different one stops S1.

*What meets the side wall's corner cabinet.* The blind closure's front face lies at `D` from the back
wall, on the return's near side face: one shared, hidden face. The return's door face is at `D − 0.021`
from the side wall and its handle reaches `D`. The stile and the leaf together cover the unit's front
from the closure's edge to 3 mm from the far end, with one `GAP`-wide joint between them, so **no carcass face
shows between the return's door and the unit's far edge**. The unit lies wholly within `D` of the back
wall and the return wholly beyond it: nothing interpenetrates and no two visible faces are coplanar.

*Hinge and swing (kept by the owner, Q9).* Left corner: hinge on the unit's right edge, away from the corner; handle at the
left. The base X-leg's leaf does exactly this (`doorSlab(…, "left")`, `kitchen-parts.ts:2030`); the
side return's door has its handle on its corner side too; and a door hinged away from the corner opens
toward the blind part. Right corner of a U: the mirrored wrapper puts the hinge on the left edge. Both
swings clear by arithmetic (the reviewer confirmed them at 600). *Measure both envelopes at 600 and 700
(S1).*

*How the shell stops tiling the strip, and where it must not.* `wallRowStartMm("A")` is `cornerReachMm`
over `CORNER_ASSEMBLY_PIECES` in the wall and top bands (`shell-design.ts:466-503`). With the two wall-A
pieces it answers 900, the L's wall-only span collapses to zero length by the existing `Math.max` /
`Math.min` (`:392-397`), and no tile is written. **That list is room-independent, and Q8 (iii) makes
the answer depend on the room:** in a U of 10 m or more the unit is absent and the strip must be tiled
exactly as today, 800 + 100 at both corners, explicit right strip included (`wallAFreeRunTilesForU`,
`:773-783`). So the shell asks one room-level predicate, *is the back wall base-only*, in two places:
which pieces `cornerPiecesUnder` and `rightCornerPiecesUnder` instantiate, and which bands
`wallRowStartMm("A")` reads. **It is the predicate `upper-policy.ts` already has** (`isBackWallBaseOnly`,
`:46-56`, over `isLargeU`), lifted to a room-level function beside `isLargeU` in `run-layout.ts` and read
by both; a second copy is the defect ADR 0102 names. For every other U the right strip is not written;
the odd millimetre it carried then stays where the base row already leaves it. *Measure with an odd `W`
(S2).* **`blindSpanMm` stays as it was, one value for every wall-A piece** (ruled 2026-10-01 on QA's Q4.3,
reversing this plan's *"band-aware"*): the band-aware arm is unpinned because no admitted room can
tell it apart. It would only lower the unit's width floor from 870 to 630 / 700, and wall A is never
under 870. With one floor the unit and the X-leg below it have the same width in every room by
construction, which is criterion 1's own claim. **The band-aware arm is removed**
(`corner-assembly-size.ts`, about `:455`), not pinned. No engine limit moves. *Considered and not
taken:* the logic reviewer preferred keeping the arm and pinning it on a 640 mm wall A at 600 (640
band-aware against 870 reverted). Removal won because that wall is below the engine's own 870 floor, so
the pin would hold a behaviour no room the product admits can reach, and because one floor is what makes
the unit's width equal the X-leg's by construction.

**A narrowing of the validator's corner check, recorded on logic review R6.2.** With the height clause,
a wall-row body on the side wall starting between the unit's 291 mm seat and 330 mm is no longer
flagged, though the unit's closure is solid there. It is reachable only by a hand-made or corrupted
document. It is safe by construction: the side cabinet's near edge and the closure's front come from
the same wall-depth map, and no command moves a structural piece. Filed under backlog 63 at close.

*Stored designs and depth changes.* A design stored before C2 loads unchanged: it keeps its 800 + 100
empty columns and whatever the customer put there, and has no unit. No migration (ADR 0038). A depth
change re-seats a structural body and rebuilds nothing else of it (`set-cabinet-depth.ts:216-241`); the
unit's 900 mm is the recorded corner reach and stays frozen (ADR 0089), and wall-A pieces do not slide.

*Price and name.* Two flat rules beside the existing four (`sample-price-book.ts:213-235`):
`cabinet.wall-corner-x-900` at the side piece's placeholder 160 000 and `cabinet.wall-corner-x-900-top`
at 90 000 (the book's own units), both marked *pending owner input* (Q8 (i)). The lines read *Dulap
suspendat de colț* and *Dulap de colț rând de sus*, the side pieces' kinds reused (Q8 (ii)).

*Against C4 S2.* After the joint moves, the base X-leg is 570 blind + 330 with a 290 door; the unit
above is 330 blind + 570 with a 537 door. **The split lines do not align, and should not:** each blind
span is the depth of the piece on the other wall at that level. The far edge, 900, aligns at every
level. The doors' far edges differ: 3 mm inside it on the unit, 10 on the base X-leg (the supplier's).

*Against C3, and low ceilings.* The top unit is instantiated only where its top fits under the ceiling
(`cornerPiecesUnder`, `:348-349`), so from 2600. Below that nothing stands above the middle unit and its
footprint stays reserved and untiled, exactly as above the side return today. The middle unit always
fits (approved heights start at 2200). C3 composes nothing over the corner.

*Different from the re-plan:* the door is 530 mm (460 at 700), not 570; the unit has a blind closure
and a fixed stile; at 700 the split is 400 + 500. **The witness for an empty shell is an approved room,
L 900 × 1000:** wall A is all corner and wall B's run is zero, so after C2 its shell has no empty column
at all, where today it is that strip (`shell-design.ts:497-500`). The customer gets what they get today:
Step 1 refuses that room as too small for a kitchen (ADR 0110 A2 names it). *Measure that its shell
still builds and validates (S2).*

**Gate G-C2: PASSED 2026-10-01.** The owner saw S1's captures and raised one thing, verbatim: *"so put
handles opposite to be able to open it from edges to not have door opening conflict"*. That was put
back with the swing comparison (Q9) and the owner kept the handles as built. Nothing else was raised
about the unit.


| Slice | Does | Files | Reading |
| --- | --- | --- | --- |
| S1 | Adapter: the `wallCornerX` builder and its finish helper. Nothing mounts it yet. | `three-adapter/src/kitchen-parts.ts`, `body-finish-surfaces.ts` | S0's output; `SPEC.md` wall cabinet and corner elements; `product-invariants.md` |
| S2 | Domain: the two seeded entries, the two assembly pieces, the shell's corner pieces and runs, the two price rules. | `configurator-domain/src/fixtures/kitchen-l-design.ts`, `corner-assembly-size.ts`, `generation/shell-design.ts`, `pricing/sample-price-book.ts`, `body-kinds.ts` only if Q8 (ii) gives own names | S0's output; ADR 0110 d1, B2; ADR 0089; ADR 0066; `corner-of.ts`; `validate-design.ts` corner sweeps |

*3D contract.* Back face on the back wall's plane at 0.000 (§11 row 19). Near edge at the corner, far
edge at the base X-leg's far edge. The door part's near edge is the plane of the side wall's corner
cabinet's front. Scaling: width is the corner reach, recorded at generation and frozen at a depth change
(ADR 0089); depth follows the wall-depth map; the handle is a fixed size. The right corner's units have
determinant −1, each through its own wrapper; every other wall-A body +1.

*Criteria.*
1. Every generated L and right-hand L, and every generated U whose entered walls total under 10 000 mm,
   carries the middle unit at each corner, spanning exactly the base X-leg's span; and the top unit iff
   the room is at least 2600 high. **[prop]** Boundary: totals 9 999 and 10 000.
2. In those kitchens no empty column and no void lies over a corner base on the back wall, at any
   level; the editor offers nothing there and no hood can be placed there.
2a. **A U of 10 000 mm or more is byte-identical to the tree before C2 over its corners:** no unit, the
   800 + 100 tiles at both rows and both corners, the same offers. *Must not:* a unit there; a strip
   tile anywhere else.
3. Selecting either unit shows the structural panel: no replace list, no delete, no width and no
   handle section; **it does show *Finisaj***, as every corner piece does. (Corrected 2026-10-01 on QA's
   Q4.1: the plan's *"no finish"* was ADR 0021 d2's, which the owner's ruling of 2026-09-09, backlog
   60, *"support setting custom color for all corner cabinet parts"*, reversed for the corner bodies;
   `STRUCTURAL_CORNER` carries `canFinish: true`, `kitchen-l-design.ts`. A colour of its own is the
   ruled exception to *structural*, so the owner's *"fixed, non editable"* is told, not asked: the unit
   cannot be moved, replaced, deleted or resized, and takes a colour like the corner pieces beside it.) `removePlacement`, a replace and `setWidth` each refuse it.
4. The leaf lies wholly outside the side wall's corner cabinet's depth from the corner, at 600 and 700,
   at both corners. No finding on any generated design; `findCornerOverlaps` is silent.
5. After a change to 700 the unit keeps its span; its front and the side cabinet's near edge meet.
6. Every other placement of every generated design is byte-identical to the tree before C2. A straight
   kitchen is byte-identical. The seeded kitchen is byte-identical.
7. The price rises by exactly the two units' lines per corner. A kitchen colour paints the unit.
6a. **Item 6 changes no finding that is right today.** (i) On the seeded kitchen and on every design
   the generated grids produce at `HEAD`, the validator's findings are byte-identical before and after.
   (ii) Over arbitrary valid documents, the findings after are a subset of the findings before.
   **[prop]** (iii) Backlog 63's witness, a hood in the opening over the corner (the seeded kitchen
   with `p8` and `p15` cleared, and a U of 10 m or more), reports exactly the findings it reports at
   `HEAD`. (iv) A wall-level body deliberately placed in the X-leg's column so that its own seat
   reaches past the side cabinet's start still reports. (v) A column with a base member and nothing at
   the body's height keeps the column-wide reach. Sabotage both ways (R6): the old whole-column reach
   must turn the new shell red; a reach of zero must turn (iii) and (iv) red.
7a. The mounted top unit has its handle meshes present and hidden, and its declared handle count equals
   them. Either unit picks as one group, `wall_corner_x`. Exactly four of its meshes wear the finish:
   shell, closure, stile, leaf.
8. *Must not:* a literal 330, 570 or 900 in the builder or the assembly; a new catalogue row a customer
   can choose; the unit in an offer list.

*Visual evidence:* overview, back-wall and top-down captures of an L, a right-hand L and a U (both
corners), both rows, at 600 and 700, 390 × 844 and 1440 px; one room under 2600; the far-edge joint
beside a wall cabinet, a hood and a fridge; the stile behind the side cabinet's bar; the 21 mm strip of
the closure's side that stays visible at the inner corner, painted; a U of 9 999 mm and one of
10 000 mm in total; the approved L 900 × 1000.
*QA reading:* the criteria, S0's output, `generate-kitchen.u.uppers.test.ts`,
`qa-7d3-upper-suppression.adversarial.test.ts`, `qa-7d7-sized-shell.test.ts`. *Logic reviewer:* ADR 0110
d1, B2, Amendment O draft, ADR 0021, 0066, 0089, the diff. *Clean-code reviewer:* the diff. *Visual:* the
captures, `SPEC.md`.

**C2 S1 — dispatch, to paste.** *Full + visual. Adapter only; nothing mounts the body. After C4 S2.
Never `git stash`, `git stash pop`, `git checkout -- .`, `git reset --hard` or `git clean`.*
1. **First, measure:** the side return's built depth from its wall at 700, on a kit built with
   `wallDepthMm` as `kitchen-stage.tsx` builds it. Expected 0.400. Anything else: stop and report.
2. `wallCornerX(W, H, pushOpen)` in `kitchen-parts.ts`: carcass, blind closure, fixed stile, one leaf,
   handle, as the parts table; every dimension from `wallDepthM`, `wallCarcassDepth`, `TH`, `GAP` and
   `cornerBaseX`'s near clearance and `wallCabinet`'s door reveal.
3. `kit.make.wallCornerX` on the kit's surface and its contract test.
4. A helper in `body-finish-surfaces.ts` so the carcass shell, the closure and the stile wear the finish.

*Files:* `three-adapter/src/kitchen-parts.ts`, `body-finish-surfaces.ts`. **No `buildDecomposedBody`
case and no build id in S1**: a build id the catalogue lacks would turn `catalog-capability-parity.test.ts`
red between the slices, so the two cases land in S2 with the catalogue rows.
*Criteria.* (a) Both columns of the parts table to 1e-6, on kits built at 600 and at 700 with the
product's wall depth. (b) No mesh of an existing builder moves; every parity pin unchanged. (c) Placed
beside a built `wall-corner-return-570` at a left corner, at both depths: no two meshes intersect, no
two visible faces are coplanar. (d) **No recess:** between the return's door face and the unit's far
edge, every point of the unit's front is on the leaf's plane, except exactly two strips: the `GAP`
(4 mm) joint between stile and leaf, and the 3 mm reveal at the far edge. Beside an ordinary two-door
wall cabinet the door-to-door joint is 5.5 mm. A strip wider than that fails. (e) Both
swing envelopes clear at both depths. *Pins expected to move:* none; the kit-surface contract gains one
member. *Visual evidence, and gate G-C2's input:* captures of the unit beside the side cabinet, front
and top-down, middle and top unit, 600 and 700. *Reading:* S1's row.

**C2 S2 — dispatch, to paste. Ready once S1 (with its fix batch) is committed.** *Full + visual. Domain and the adapter's two
build cases. After S1. Check against ADR 0110 d1 and B2's
intent first; stop and report on a conflict.*
1. Two seeded structural entries in the fixture catalogue, copied from the side returns' shape:
   `STRUCTURAL_CORNER`, one handle, one leaf, the side pieces' kinds, wall-map depth.
2. `CORNER_ASSEMBLY_PIECES` gains wall A's wall and top pieces; `blindSpanMm` is not made band-aware.
3. The shell instantiates them at each corner (ids appended, `right-` prefixed at a U's right corner,
   under the ceiling rule), except on a base-only back wall, where it tiles the strip as today. One
   room-level predicate, shared with `upper-policy.ts`.
4. Two price rules at the placeholders.
4a. The top unit is mounted as every top-row body is: built **with** its bar, then hidden by
   `hidePushOpenHandles` (`decomposed-bodies.ts:153-160`). **Not** `pushOpen = true`, which builds no
   bar and breaks the declared handle count against the meshes.
5. Restate, each with its reason: the assembly's count of four, B2's zero start, the shell baselines.
6. **The corner sweep's reach becomes band-aware** (adjudicated 2026-10-01 on S2's stop-and-report; an
   eighth file, `validate-design.ts`). The unit and the base X-leg share the column `A|0.45`, recorded
   as one entry, y 0–2600. `deepestSeatByColumnMm` gives that whole column the X-leg's 550, so it meets
   the side wall's corner cabinet (along from 330, reach 291, y 1500–2200) and every shell reports
   `RECORDED_SPAN_OVERLAPS_CORNER_BODY`, though at that height the column reaches 291. S0 and review
   round 2 checked the geometry and missed this sweep. The seeded kitchen never met it: its `p8` stands
   at 300, a different column from the X-leg's.
   **The rule.** When a recorded column that holds members is compared with a body across the corner,
   its reach is the deepest carcass seat among the members whose vertical span overlaps that body's
   (a positive overlap; abutting is not overlapping). If no member overlaps the body's span, the reach
   is the column's deepest seat, as today. Rungs 2 and 3 (member-less entries) are untouched. The reach
   stays the carcass seat (backlog 50). This amends one sentence of that ruling, *"over the whole
   column … an entry describes a column and not a band of one"* (`validate-design.ts`,
   `deepestSeatByColumnMm`'s comment), named in Amendment O.
   **It can only remove a finding, never add one**: the banded reach is never greater than the
   column's deepest seat.
   Rejected: another column key (the key is wall and along only); exempting structural pairs (hides a
   real check); splitting the unit into two bodies (it is one cabinet).

*Files:* `fixtures/kitchen-l-design.ts`, `corner-assembly-size.ts`, `generation/shell-design.ts`,
`pricing/sample-price-book.ts`, `generation/run-layout.ts` and `upper-policy.ts` (the predicate lifted,
no rule changed), `three-adapter/src/decomposed-bodies.ts` (the two cases, and a default width that
reads the reference reach, not a seeded placement), `validate-design.ts` (item 6). **Eight files
against the limit of about five**, accepted and said here: two are the predicate lift with no behaviour
change, and one is a single function of validator logic the wave cannot pass without. **The logic
reviewer checks item 6 first, then the lift, before anything else.** *Reading added for item 6:*
`validate-design.ts` from `findCornerOverlaps` to `reachesInto`; backlog 50's entry; ADR 0069; ADR 0132
d7; ADR 0090 d2; `backlog-50-the-corner-the-validator-cannot-see.test.ts`;
`qa-m7b-u1-wall-c.adversarial.test.ts`. *Criteria:* C2's eight above. *Pins expected to move:* every generated
L, and every U under 10 m, loses its 800 + 100 wall-A tiles at both rows and gains one or two placements per corner; the
recorded generation baselines under `tests/generation/`; `qa-7d7-sized-shell.test.ts`; the tests that
pin four corner pieces (`corner-assembly-size*.test.ts`, `kitchen-l-corner-base.test.ts`,
`wall-corner-return-kinds.test.ts`); any price total a test or e2e spec states for a generated kitchen,
up by 250 000 per corner at 2600 and over; the U upper tests (`generate-kitchen.u.uppers.test.ts`,
`support/generated-u-uppers.ts`), whose large-U arm must **not** move. `ENGINE_ROOM_LIMITS` and the seeded
kitchen: unchanged.
*Measure:* an odd-`W` U; the approved L 900 × 1000's shell; a design stored before the change loads with no
new finding; a 600 → 700 → 600 round trip leaves the unit's span and the design's findings unchanged;
placements against `MAX_PLACEMENTS`. *Reading:* S2's row.

*At the far edge, x 900 (QA's Q3.3; corrected on review R5.4).* The leaf hinges there. The earlier
sentence here, that it needs no room on the neighbour's side, **holds only up to about 90°**. In the
tests' model the leaf turns about its back outer corner, so its front corner sweeps `TH · sin θ` past
the pivot: 15 mm past x 900 at 90°. In that pure edge-pivot model a flush neighbouring door is touched
from about 18° (QA measured 17.8°; 9.6° against a hood or fridge). That is true of every pair of
adjacent hinged wall doors in the kit, which draws no hinge; a real cranked hinge moves the door clear.
It is the model's limit, not a defect of the unit. What is real: beside a body standing proud at 900, a
hood (291–321 mm proud) or a fridge (317–387 mm), the leaf cannot open past about 90°, as any wall door
beside such a body cannot. **S2 gets a note and no hinge-side criterion:** a criterion would test the
model's pivot, and the product has no hinge to place. The swing tests cover the corner side only, and
say so. No generation rule; a hood stands at 900 only over a hob, which is the hob rule's.

**As built, QA 2026-10-01** (full census, L 245,211 and U 92,781 rooms): the only differences are the
strip tiles removed, the unit or units added and the X-leg's recorded column top; 0 findings; the
66,711 large U rooms of the 92,781 byte-identical; the validator change alone gains no finding over 100,000 arbitrary documents; the
predicate lift alone is byte-identical. 1,726 rooms now store no `emptyColumns` key. L 900 × 1000 is
still refused by Step 1; L 900 × 2200 composes with its back wall all unit. Price per corner: +160 000
and +90 000 (placeholders, Q8 (i)) plus hardware lines of +3 520 (wall leaf) and +7 520 (top leaf),
declared as the side corner cabinets' are.

**What the neighbours need.** *C3:* nothing for the corner; the top unit is the shell's. C3's count of
top-row bodies excludes structural pieces. *C4 S2:* nothing; it moves the base row's joint, and the wall
rows' near edge is a separate arm. They share three files, so C2 lands after C4 S2. *Large U:* no unit and
the strip as today (Q8 (iii)); C3 places no top-row body there either, by its own criterion 2.

### C3 — the top row (domain)

Q4 answered: a top row, above the hood too, not above tall columns, doors.

| Slice | Does | Files | Reading |
| --- | --- | --- | --- |
| S1 | For each generated wall-row cabinet (the structural corner units carry their own top unit, C2), one top-row cabinet of the same width above it, push-to-open. | `upper-policy.ts`, `generate-kitchen.ts` | ADR 0110 E11, F9, Amendment O draft; `push-to-open.ts`; §13.1 *Top row ships push-to-open*; C0 S3 |

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
   predicts 54 before C2's corner units, at most four more in a U).

*Visual evidence:* as C2, plus one room at 2500 and one at 2600 high. *Readings:* as C2, with ADR 0110
E11 and F9 for the logic reviewer.

### C4 — the corner seam (adapter and domain)

Q5 answered: everything on one line. **S0 (design) ran 2026-10-01. The owner ruled (J), move the joint,
the same day. S1 and S2 are both concrete; S1 goes first.**

**S0 — what the source says** (figures at depth D; world distance from the piece's own wall plane).

| Piece | Carcass front | Face | Worktop front | Plinth front | Source |
| --- | --- | --- | --- | --- | --- |
| A base run body | D − 30 | D − 12 (door: `carcassFrontM + TH / 2`, slab 18 mm, `:947`; C0 reads 588 at 600) | D + 20 | D − 90 | `kitchen-parts.ts:297-314, 426-429, 884-886, 942` |
| Return today | D − 20 | D − 20 (bare carcass) | D | D − 80 | `:2058-2063, 2084-2131` |
| X-leg today | D − 20 | D − 1 (door: `cFront + TH/2 + 0.001`, `:2042`; C0 reads 599) | D + 30 | D − 80 | `:1943, 1968-2047` |

- **The return** is behind because it is built `D − 20` deep with a 20 mm worktop overhang and no front.
  Built `D − 30` deep, with the run's own 50 mm overhang and a fixed front at the run's own door
  offset (`carcass front + TH/2`, the expression `baseCabinet` uses, `kitchen-parts.ts:947`; the extra
  `+ 0.001` is the X-leg leaf's alone, `:2042`), all four of its
  lines equal a base run's **by construction**, at every depth. Its back face stays on the wall (row 19).
- **The X-leg's door stands on its carcass front** (`:2029`), and that carcass is a solid box whose front
  is the joint: the return's near edge along its wall is `baseSeatDepthMm` = `D − 20`
  (`corner-assembly-size.ts:404-411`), the same plane. To bring the door back 11 mm the carcass front
  must go to `D − 30`. Then either a 10 mm open slit appears between the X-leg and the return, or the
  return's near edge moves to `D − 30` too. **That is moving the joint.**
- The X-leg's worktop alone could move (overhang 50 → 40) without the joint, but if the joint moves the
  worktop lands on the line with no constant changed. So S2 is one decision, not two.
- **The wall-row return does not move with the X-leg.** Its near edge is the wall-cabinet depth (330 /
  400), a separate arm of `nearEdgeMm`. **C2's corner wall unit is unaffected under either ruling,
  and C4 does not depend on C2 or C3** except for complete captures.

**The ruling: (J), move the joint to `D − 30`. Owner, 2026-10-01** (relayed selection of the offered
wording): *"Everything ends on one line, as you chose in Q5. The side corner piece becomes 330 mm wide
(was 320) and the corner cabinet's door 290. It changes a recorded corner-geometry decision (ADR 0025)
and the smallest corner the engine accepts (880 → 870; approved room minimums unchanged). Kitchens
already saved in preview/test databases keep the old piece and would show a 10 mm slit; no migration,
since nothing is released."* Rejected: (K) keep the joint, which moves only the X-leg's worktop and
leaves its door 11 mm proud.

**How the X-leg gets there: built `D − 10` deep and kept seated at −20.** Three ways put its carcass
front at `D − 30`: (i) full depth `D`, seated −30; (ii) depth `D − 10`, seated −20; (iii) depth `D − 30`,
back on the wall. (ii) is chosen because it moves the fewest dated values: ADR 0025 d3's pinned −0.020
and §11 row 19's named exception stay as written, and the leg stays joint-seated (ADR 0077). (i) restates
both for a cabinet standing further inside the wall. (iii) is the cleanest geometry but ends the
joint-seated class and row 19's exception, which reaches `set-cabinet-depth.ts`'s joint arm and ADR 0077's
witness; recorded as the follow-up, not built here.

**S1 and S2 are separable and S1 goes first.** They move different axes of the return: S1 its depth from
its own wall, S2 its near edge and width along that wall. S1 alone leaves a consistent product. The one
cost is a temporary constant holding the X-leg's leaf still in S1, which S2 deletes.

| Slice | Does | Files | Reading |
| --- | --- | --- | --- |
| S1 | The return leg, as below. First. | `three-adapter/src/kitchen-parts.ts`, `three-adapter/src/body-finish-surfaces.ts`; `configurator-domain/src/fixtures/kitchen-l-design.ts`, `catalog.ts` (only if `baseCarcassDepthMm`'s neighbour needs a named sibling); `docs/design/SPEC.md` | this section; ADR 0135 draft; ADR 0025, 0077, 0021 d2, 0099 (corner colour); `kitchen-parts.ts:290-314, 884-962, 1932-2131`; `kitchen-l-design.ts:105-128, 385-428`; C0 `s1-seams.mts`, QA `c0-qa/qa-s1s2.mts`; `product-invariants.md` |
| S2 | The joint moves to `D − 30`, as below. After S1. | `three-adapter/src/kitchen-parts.ts`; `configurator-domain/src/corner-assembly-size.ts`, `catalog.ts`, `fixtures/kitchen-l-design.ts`; `docs/design/SPEC.md`, `DEVELOPMENT-SPEC.md` only if a figure it states moves | this section; ADR 0135 draft; ADR 0025, 0077, 0125, 0110 (7D6 and 7D7's corner derivation), 0089; `corner-assembly-size.ts:124-270, 379-456`; `kitchen-parts.ts:1960-2049`; `kitchen-l-design.ts:105-128, 385-428, 1010-1030`; `room/room-policy.ts` (`ENGINE_ROOM_LIMITS`) |

**S1 — constants, old → new** (`kitchen-parts.ts`; values at 600 / 700):

| Constant or expression | Old | New |
| --- | --- | --- |
| `CORNER_RETURN_DEPTH_M` (`:2058`), the return's carcass depth | `D − 20` (580 / 680) | `D − 30` (570 / 670), written as the run's carcass front, not as a literal |
| `CORNER_RETURN_WORKTOP_FRONT_OVERHANG_M` (`:2063`) | 0.02 | the run's own front overhang, 0.05, read from the counter's constants |
| `CORNER_RETURN_WORKTOP_DEPTH_M` (`:2078`) | 600 / 700 | 620 / 720 (derived; back face still on the wall) |
| New mesh `fixed_front` in `cornerBaseReturn` | — | a box `W − 0.006` × `CARC_H − 0.01`, 18 mm, at `cFront + TH/2`, wearing the body's finish; no handle |
| The X-leg's leaf: `accessibleFrontM`, `leafWidthM` (`:2015-2019`) | read `CORNER_RETURN_DEPTH_M` | read a constant of their own, held at `D − 20`, so the leaf does not move in S1 |
| Domain: return's `frameDepthMm` (`kitchen-l-design.ts:423`) | `baseSeatDepthMm` (580) | `D − 30` (570) |
| Domain: `cornerBaseReturnFinishedDepthMm` (`:125`) | `D` | `baseFinishedDepthMm(D)` (620 / 720) |

**S2 — old → new** (values at 600 / 700):

| What | Old | New |
| --- | --- | --- |
| `cornerBaseX`'s carcass depth `LD` (`kitchen-parts.ts:1970`) | `D` (600 / 700) | `D − 10` (590 / 690) |
| X-leg `frameDepthMm` (`kitchen-l-design.ts:409`) | `baseCarcassDepthMm`, `D − 40` (560 / 660) | `D − 50` (550 / 650), a named function; the back face stays at −20 |
| `nearEdgeMm`, base row (`corner-assembly-size.ts:410`) | `baseSeatDepthMm`, `D − 20` | the run's carcass front, `D − 30`, one named function shared with the adapter's meaning |
| `blindSpanMm` (`:452`) | `D − 20` | `D − 30` |
| Base return, reference width and span | 320; 580–900 | 330; 570–900 (derived, `:391`) |
| X-leg leaf (`kitchen-parts.ts:2015-2022`) | 280, on S1's temporary constant | 290, reading `CORNER_RETURN_DEPTH_M` again; the temporary constant is deleted |
| X-leg leaf's plane (`:2042`) | `cFront + TH/2 + 0.001`: face at `D − 1` | `cFront + TH/2`: face at `D − 12`, the run's. The leaf moves back 11 mm in all: 10 with the carcass, 1 from the dropped offset |
| `CORNER_BASE_X_WORKTOP_REACH_MM` (`kitchen-l-design.ts:108`) | 10 | removed; the X-leg finishes at `baseFinishedDepthMm` |
| X-leg worktop overhang, rear inset, plinth recesses | — | **unchanged**; they follow `LD` and land on the line |
| Engine corner floor (`narrowestCornerReachMm`) | 880 | 870 [derived: 570 + 300; S2 confirms]; `APPROVED_ROOM_POLICY` unchanged |

Expected after S2 [inf until measured]: X-leg against its neighbour, worktop +10 → 0, door +11 → 0,
carcass +10 → 0. *S2 must measure, not assume:* the clearance between the return's fixed front and the
290 mm leaf (12 mm by arithmetic: front at `D − 12`, leaf from `D`), and that the leaf opens; that no stored-document reader refuses a
320 mm return (a design generated before S2 must still load, with the slit); the count of generated
rooms whose corner widths change; the 700 chain (ADR 0089's residue is not to grow).

*Criteria (S2).*
1. At every X-leg seam, L, right-hand L and U, 600 and 700: worktop, door, carcass and plinth
   differences 0 ± 1 mm (door within 2 mm beside a hob cabinet). Every return seam still reads S1's zeros.
2. The X-leg's back face is at −0.020 exactly; `KNOWN_WALL_GAP_M` is unchanged. The two legs' carcasses
   share the face at `D − 30` with no gap and no intersection; the slabs butt.
3. Every generated design: base return 330 wide from `D − 30`, far edge unchanged at the corner reach;
   every other placement byte-identical to S1's output. A design stored before S2 loads without a finding
   other than those it had.
4. `ENGINE_ROOM_LIMITS`' corner figure is the derived one; `APPROVED_ROOM_POLICY` is byte-identical.
5. *Must not:* a literal 570, 330 or 290 anywhere in `src`; a second definition of the run's carcass
   front; any wall-row or top-row corner piece moves.
6. **The temporary constant is gone.** The constant S1 added to hold the X-leg's leaf at `D − 20`
   (`kitchen-parts.ts`, about `:1962-1971`, commented *M7C C4 S2*) is deleted and the leaf reads
   `CORNER_RETURN_DEPTH_M`; a grep for its name and for *M7C C4 S2* under `packages/` returns nothing.
7. **`findCornerOverlaps` keeps reading the seat** (`validate-design.ts`, about `:1021`): the return's
   reach is 570 while its fixed front stands at 588, and S2 does **not** bring the reach to the front.
   The sweep measures every body by its carcass seat on purpose (backlog 50: *"The reach is the carcass
   seat … true of two cabinets and false of two worktops"*), and every fronted base body's door stands
   past its seat the same way; one body measured at its front would be the inconsistent one. S2 states
   the return's and the X-leg's reach before and after, and that the seeded and every generated kitchen
   stay silent.

*S2's captures:* the corner seam at 600 and 700 as S1's, plus a corner piece beside an oven tower. No
generated layout the visual agent tried puts one there, and none is derived from source here; **the
witness is the seeded reference kitchen**, whose tower `p5` stands at 900–1500 on the side wall,
directly beside the return. S2's implementer also reports whether any approved room generates one.

**C4 S2 — dispatch, to paste** (once S1 is committed). *Full + visual. Check against ADR 0025 d1–d3
and ADR 0077's intent first; stop and report on a conflict. Never `git stash`, `git stash pop`,
`git checkout -- .`, `git reset --hard` or `git clean`.*
1. `cornerBaseX` is built `D − 10` deep; its seat stays −0.020 (frame `D − 50`, a named function).
2. The base row's near edge and blind span become the run's carcass front, `D − 30`, from one named
   function; the base return's reference width follows (330).
3. The X-leg's leaf reads `CORNER_RETURN_DEPTH_M` again; S1's temporary constant is deleted. The leaf
   hangs at `cFront + TH/2`, the run's own expression: its extra `+ 0.001` goes, or the door ends 1 mm proud.
4. `CORNER_BASE_X_WORKTOP_REACH_MM` is removed; the X-leg finishes at `baseFinishedDepthMm`.
5. Restate, each with its reason: the engine corner floor, ADR 0025's *Finding* (the 0.58 seam) and d1
   (the 560 frame), the
   generation baselines, `SPEC.md`'s seam figure.

*Files, reading:* S2's row. *Old → new, what to measure, criteria 1–7, captures:* the three blocks above.

Expected result of S1, to be measured by S1's implementer with C0's script [inf until then]: return against
a base neighbour, worktop −20 → 0, face −8 → 0 (−2 beside a hob), carcass +10 → 0, plinth +10 → 0.

*Checked in S0, from source.* **Price:** the return is priced by its build id
(`sample-price-book.ts:223-224`), so a new mesh adds no line; `fronts: NO_OPENING_FRONTS` stays, so no
hardware line. **Picking and outline:** the front is a child mesh of the return's own group [inf that
picking resolves it to the placement; S1 verifies]. **Finish:** `body-finish-surfaces.ts`'s census gains
one painted mesh for the return. **Name:** not `door_front`, so no front, handle or push-to-open census
counts it. **`findCornerOverlaps`:** reads the seat, which shrinks by 10; no new overlap [inf; S1's
criterion 5].

*Parity pins that move in S1* (`kitchen-parts.parity.test.ts:842-850` builds the return against the
vendored reference at each depth): the return's `carcass` (depth, z), `plinth` (depth, z), `countertop`
(depth, z) and the added `fixed_front`. Each is entered as a named departure with old and new value, the
way ADR 0098's sink slabs are (`:138-170`). Also restated, each with its reason:
`cabinet-depth-sweep.parity.test.ts` (the return *"1 mm proud of the column run"*),
`declared-frame-depth-sweep.test.ts`, `corner-seat-chain.test.ts`, `the-corner-wears-a-colour.test.ts`,
`fixtures/kitchen-l-corner-base.test.ts`, `occupied-depth.test.ts`,
`backlog-50-the-corner-the-validator-cannot-see.test.ts`. This list is from a grep, not a run; a pin
outside it that moves is reported, not absorbed.

**S1 is DONE: QA, both reviews and visual passed 2026-10-01.** Measured: against a base neighbour the
return's four lines are level. **Beside a tall column the return is 10 mm proud of the oven tower's
door, as any base cabinet is** (this plan had predicted 10 mm behind; the sign was wrong). That retires
ADR 0058's *"1 mm proud — flush"* relation between the return and the column run; the owner is shown
the measured figures. Left for S2's gate: with S1 alone 22 mm of X-leg carcass shows between the new
front and the X-leg's leaf (it was 30), and at 700 the back-wall corner's worktop still steps against
its neighbour.

*3D contract.* Anchor: each wall's own plane. At depth D every base body on a wall, corner pieces
included, has its carcass front at `D − 30`, its worktop front at `D + 20`, its plinth front at `D − 90`
and its front face on the run's door plane. Scaling: follows the depth setting. Dependencies kept: each
leg's plinth recess from its own depth only; no two stone volumes interpenetrate and no coplanar faces
(the return's slab still butts the X-leg's); the right corner's pieces mirror the left's; the X-leg's
seat is not touched in S1.

*Criteria (S1).*
1. For L, right-hand L and U at 600 and after a change to 700, at every return seam with a base
   neighbour, the signed worktop, face, carcass and plinth differences are 0 ± 1 mm; beside a hob
   cabinet the face is within 2 mm. C0's script is the instrument; today it reads −20, −8 / −10, +10.
2. Beside a tall column the differences are measured and stated, and are those of a base cabinet
   beside the same column.
3. The X-leg's meshes are byte-identical to `HEAD`'s at both depths. *Must not:* the return gains a
   handle, a door count, a finish control or a price line (ADR 0021 d2); its back face leaves the wall;
   the two legs' slabs intersect; any non-corner body moves.
4. The parity gate's pins move only for the meshes listed above.
5. `findCornerOverlaps` and `validateDesignForCatalog` report nothing on the seeded kitchen and on
   every generated one, at 600 and 700.
6. Tapping the fixed front selects the return and shows its structural explanation; a kitchen colour
   paints it.

*Visual evidence:* top-down captures of both corners of a U and of an L at 600 and 700, beside
`M7-FB-006.png`, and the seeded kitchen's corner against its tower. *QA reading:* the criteria, C0's
and QA's scripts, the parity test. *Logic reviewer:* ADR 0025, 0077, 0135 draft, this section, the
diff. *Clean-code reviewer:* the diff. *Visual:* the captures.

**C4 S1 — dispatch, to paste.** *Tier: Full + visual. Check the change against ADR 0025's and ADR
0077's intent before writing; if they disagree, stop and report. Never `git stash`, `git stash pop`,
`git checkout -- .`, `git reset --hard` or `git clean`. No e2e run and no dev server until the
coordinator says port 4320 is free.*
1. `cornerBaseReturn`'s default depth `CORNER_RETURN_DEPTH_M` becomes the run's carcass front, `D − 30`.
2. Its worktop takes the run's 50 mm front overhang; the slab is `D + 20` deep, back face on the wall.
3. A `fixed_front` mesh on the run's door plane, wearing the body's finish; `body-finish-surfaces.ts`'s
   census updated.
4. The X-leg's leaf reads a temporary constant held at `D − 20`, so no X-leg mesh moves.
5. Domain: the return's `frameDepthMm` → `D − 30`; `cornerBaseReturnFinishedDepthMm` → `baseFinishedDepthMm`.

*Production files:* `three-adapter/src/kitchen-parts.ts`, `three-adapter/src/body-finish-surfaces.ts`,
`configurator-domain/src/fixtures/kitchen-l-design.ts`, `configurator-domain/src/catalog.ts` (a named
`D − 30` function, if none exists), `docs/design/SPEC.md`. *Criteria:* S1's six above. *Reading:* S1's
row above.

*Pins expected to move* (return at `W` = 0.32, group-local metres, by arithmetic from the source; the
implementer confirms each):

| Mesh | Old | New |
| --- | --- | --- |
| `countertop`, `cornerBaseReturn(LD, …)` at `LD` 0.56 / 0.58 / 0.6 | depth 0.600; centre z 0.000 / 0.010 / 0.020 | depth 0.620; centre z 0.020 / 0.030 / 0.040 |
| `fixed_front`, same three calls | absent | 0.314 × 0.710 × 0.018; centre z `LD/2 + 0.009` |
| In the built room and the decomposed body (default depth, kit at 600): `carcass` | depth 0.580 | 0.570 |
| `plinth` | depth 0.520 | 0.510 |
| `countertop` | depth 0.600, centre z 0.010 | depth 0.620, centre z 0.025 |
| The return's world seat (frame) | 580 | 570 |

The explicit-depth parity calls keep their `carcass` and `plinth`, which follow the `LD` they are handed.

*Measure, do not assume:* all four signed differences at every return seam with C0's script, base and
hob neighbours, 600 and 700; the same beside a tall column; that a tap on `fixed_front` selects the
return; that the price of the seeded kitchen and of one generated L and U is byte-identical; the
reference kitchen's finished-depth pin (*"1 mm proud of the column run"*) before and after.

**ADR 0135 — draft decision text, for the scribe.** *The corner pieces stand on the run's lines, and
the base return is a base body with a fixed front.*
1. Owner, 2026-10-01 (M7C Q5, relayed selection): *"Everything on one line"*. At a corner, every base
   piece's worktop front edge and front face stand on the same line as the base cabinets beside it.
2. Measured before the change (C0, confirmed by QA): the base return's worktop 20 mm behind, its bare
   carcass 8–10 mm behind the neighbour's door; the X-leg's worktop 10 mm and door 11 mm in front.
   Identical at 600 and 700.
3. The base return is built to the run's carcass depth (`D − 30`), carries the run's worktop overhang
   and a fixed front on the run's door plane. Each figure is derived from the run's own constants, never
   tuned to a measured gap. It stays structural (ADR 0021): no handle, no door count, no control, no
   price line of its own.
4. This amends, each by name: ADR 0025's table and decision 1 for the return (580 → 570 deep, frame
   580 → 570) and its *Finding*'s sentence *"the seam at z = 0.58, which is the return leg's own depth"*
   (the seam holds after S1; that identity ends); ADR 0077's and ADR 0079's statements of the return's
   580 and 0.6, each at the scribe's dated pointer; and ADR
   0058's *"1 mm proud"* relation between the return and the column run, now 10 mm proud of a column's
   door, as a base cabinet is. Its back face stays on the wall plane; §11 row 19 is untouched.
4a. **Stored designs after S1.** A design whose depth was changed before S1 stores the return's
   `seatDepthMm` as 680 (580 after 700 → 600) against a body now 670 (570) deep, and
   `columnExtents[].depthMm` 600 for it. Its return stands 5 mm off the wall and 5 mm proud, with no
   finding, until the next depth change rewrites the seat. Accepted under ADR 0038 d1. Reading it right
   without a migration is possible, since the return is built by name at the kit's depth
   (`decomposed-bodies.ts:111`), but that is a new rule extending ADR 0077 d4; deferred, and recorded
   in the backlog with this paragraph.
5. The X-leg: **the joint moves to the run's carcass front, `D − 30`** (owner, 2026-10-01, relayed
   selection (J)). The X-leg is built `D − 10` deep and stays seated at −0.020, so ADR 0025 d3's pin and
   §11 row 19's exception are unchanged; its *Finding*'s seam (`0.58`) and d1's frame (560) are restated
   as 0.57 and 550.
   The base return is 330 mm wide at the reference corner and the leaf 290. The engine's corner floor
   follows the derivation (880 → 870); the approved minima (ADR 0125) do not move. Designs stored before
   the change keep a 320 mm return and show a 10 mm slit; no migration (ADR 0038). Alternatives: (K) keep
   the joint, rejected by the owner, the door stays 11 mm proud; full depth seated −30, rejected, it
   restates the pin for a cabinet further inside the wall; depth `D − 30` on the wall, the cleaner
   geometry, deferred because it ends the joint-seated class (ADR 0077).
6. Rejected: an 8 mm panel on the unchanged carcass (a thickness chosen to close a measured gap, and the
   carcass and plinth stay 10 mm proud); a door on the return (it would be a front that opens onto a
   blind box).
7. The supplier's reference geometry is departed from on purpose; each moved mesh is a named departure
   in the parity gate.

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
| S0 | No tracked file changes. After C5, in the main tree: the agent runs each of the nine tests alone, three times, at `HEAD`, and compares each failure with the saved log of run 36841795476. A runner re-run of that run was refused on 2026-10-01 (*"Resource not accessible by personal access token"*) and is not worked around; the first push of this branch supplies a fresh runner result. Output: one table, test → deterministic or intermittent → matches the saved log or not → cause group → class (flake, test-fidelity, defect). | — | `M7-FEEDBACK.md` *M7-FB-012*; scratchpad `run-36841795476.log`; `ci-and-local-gates.md`; `agent-coordination.md` (port 4320, `TEST_DATABASE_URL`); ADR 0105; `playwright.config.ts`; `.github/workflows/ci.yml` e2e jobs; the nine spec files and `support/u-gate-journeys.ts`, `support/u-gate.ts` |
| S1… | One slice per cause group from S0, each named in this table before dispatch, with its files and reading. | from S0 | from S0 |

*Read from the CI log by S0's agent, 2026-10-01 [log-verified; nothing run].* Group 1, four tests:
`toBeEnabled` on `global-settings-trigger`, stuck at *"Se verifică accesul"*; A5 still so after 15 s,
which points at the write-access probe not answering on a production build rather than at a tight
timeout [inf]. Group 2: `pixel-counter-witness:352` reads its probe *"off"*; both mirror capture sets.
Group 3: `top-bar-pill-containment:788`, pill x 389.67 against 481.67 at 1440 and the price cell 180.11
against 196.11; `room-desktop-line:551`, 6 pre-hydration paints against a CI bound of 4. That bound is
`CI ? 4 : 7`, so a local run cannot exercise it. **S0 runs in the main tree after C5**, so it needs no worktree and no environment file of its own.
**Limitation, stated:** by then C1 S3, C2, C3, C4 and C5 have changed the top bar, the built geometry
and every generated kitchen. A capture, pixel-count or layout test that is red then cannot be split
into *red before M7C* and *made red by M7C* by running anything: the only evidence of the earlier state
is the saved log of run 36841795476. S0's table therefore carries, per test, whether its failure
message matches that log's.

*Expected groups, [inf] from the log, for S0 to confirm or replace.* (1) Write access arriving late:
`share-design:96`, `qa-7e3c-share:638`, `qa-u7s0-ssr:271`, `u-gate-journeys:648`. (2) Captures and pixel
counts: `pixel-counter-witness.desktop:352`, both `qa-7i-mirror-captures:18`. (3) Desktop layout:
`room-desktop-line.desktop:551`, `top-bar-pill-containment.desktop:788`.

*Not fixed twice.* Each earlier wave restates the tests its own change moves, with the reason
(`top-bar-pill-containment` in C1 S3; the capture and pixel-count tests in C2, C3, C4). CE fixes what is
still red after that, and never re-litigates a restatement a wave already recorded.

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

- **ADR 0110 Amendment O** also strikes 7D6's J2 (*"No piece is added or removed here"*,
  the comment on `CORNER_ASSEMBLY_PIECES`): the assembly becomes six pieces.
- **ADR 0110 Amendment O**: the structural corner wall unit (the owner's Q2 words; overturns criterion 14 and B2's zero start), the back-wall rule, the top row
  (strikes E11.1 and E11.3 if Q4 = a), the absorb (departs from A4, D2, N3r 4, RQ25a).
- **ADR 0135** (written 2026-10-01): the corner seam's front-line contract; C4 S2 adds its X-leg ruling and
  restates `SPEC.md`'s 630.
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
  so the corner wall unit's front and the return still meet. C2 criterion 5 holds it; ADR 0089's 30 mm residue on
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
