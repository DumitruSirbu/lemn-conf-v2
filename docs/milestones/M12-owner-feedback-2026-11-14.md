# M12 — Owner feedback of 2026-11-14: corner handles, the cabinet over the fridge, the account menu, staff availability, the staff kitchen page

Status: **Planned** (2026-11-14). Nothing is built. **The owner answered §9 on 2026-11-14** (relayed by the coordinator;
§9's *Answer* column): every default stands except **Q7-3**, which adds a profile-based contact block with "Sună" /
"Scrie" (wave W6f). ADRs 0182, 0183 and 0184 are **Accepted** on those answers. **ADR 0185 is Accepted** after the security
read of 2026-11-14 [sec, relayed by the coordinator]: no blocker; its findings S1-S6, N1, N2, N4 are folded into ADR
0185 and into W6a-W6f below, each marked with its finding number.
Branch: `fix/owner-feedback-2026-11-14`, cut from `origin/main` at `c48992e8` (M11 merged as PR #17). Uncommitted owner
doc edits are in the tree (STATUS, archive, several ADRs and plans); this plan does not touch them.
Source of the work: [`docs/OWNER_FEEDBACK.md`](../OWNER_FEEDBACK.md), *Round 2026-11-14*, items 1-7. The owner's top
priority is to get these findings fixed.
Decision records: [ADR 0182](../decisions/0182-a-corner-cabinet-that-carries-a-handle-takes-the-kitchens-handle-and-a-handle-choice-of-its-own.md)
(items 1, 2), [ADR 0183](../decisions/0183-generation-hangs-a-cabinet-over-the-freestanding-fridge-and-a-cabinet-over-that-fridge-is-built-700-mm-deep-at-every-cabinet-depth.md)
(item 3), [ADR 0184](../decisions/0184-an-items-availability-on-its-staff-page-is-a-stated-status-and-a-separate-named-action-not-a-switch.md)
(item 5), [ADR 0185](../decisions/0185-the-staff-kitchen-page-leads-with-a-read-only-link-lists-every-cabinet-in-an-accordion-and-says-when-the-price-now-differs-from-the-price-sent.md)
(item 7). Items 4 and 6 need no record (a rename and a layout fix); their mockup departures are dated notes (§10).
Mockups read: `docs/design/mockups/Bucatarii clienti.dc.html` (new, item 7, also item 6's toolbar), `Lemnaria
Dashboard.dc.html` (item 5), `Lemnaria Cont Lot 2.dc.html` (item 4), `ContBlocks2.dc.html` (the toolbar template).

**Evidence tiers.** **[owner]**: `docs/OWNER_FEEDBACK.md` as recorded. **[doc]**: a repository document with
`file:line`. **[mock]**: a mockup file with line. **[src]**: this repository's source at `c48992e8` (no source file is
modified in the tree). **[measured]**: a run the architect made on 2026-11-14, described where cited; nothing else was
run — no test, gate or browser. **[inf]**: the architect's reasoning, with what would falsify it.

## 1. Goal

Fix the seven findings as the owner described them, without widening any access rule: corner cabinets follow the
kitchen's handle and offer their own; every generated kitchen with a freestanding fridge carries a cabinet over it,
700 mm deep at every cabinet depth; the account menu names the staff area "Panoul de administrare", last and set apart;
an item's availability on its staff page is a stated status plus a named action; the request-status filter's hint sits
under its select without lifting it; and the staff kitchen page leads with a read-only link, lists every cabinet in an
accordion, and says honestly when the price now differs from the price sent.

## 2. Scope

**In scope.** Items 1-7 as above, in thirteen waves (§5): W0 (docs) and twelve build waves.

**Out of scope, deliberately.**

- `Personal.dc.html` (S4, staff list and invitation [mock: its `<h1>`]) and `Traduceri.dc.html` (S7, Russian texts;
  **deferred by ADR 0174 O-L3-3**, unchanged): no owner item asks for them. The new staff-nav grouping drawn in the v3
  mockups (its Russian note reads "Клиенты · Каталог (+ Пресеты) · Цены · Контент (Переводы) · Команда",
  `Bucatarii clienti.dc.html:267` [mock]) is not built.
- The request's own contact (its personal columns) on the staff kitchen page: ADR 0153 d1 is kept. The mockup's contact
  block **is** built, from the account profile (ADR 0185 d7, owner Q7-3).
- A cabinet over a tower, pantry or built-in fridge housing (ADR 0183 d3, Q3-3).
- Re-generating stored designs (ADR 0167).
- Renaming the staff shell's own title "Zona personalului" (Q4-1 default).

## 3. Decision-record sweep (WORKFLOW, *Sweep the decision records before deciding*)

| Record | What it says | Effect here |
| --- | --- | --- |
| ADR 0021 d2 (2026-08-26) | Corners `canFinish`/`canHandle` false; *"this clause is the thing to revisit"* (`0021-…:33-46`) | **Handle half superseded** for five bodies by ADR 0182 (owner request) |
| ADR 0099 Amendment C (2026-09-09) | Corners choose a colour | Precedent for ADR 0182 |
| ADR 0092 d3 (`:233-262`) | `canHandle` disqualifies the recorded mode, nothing more; examples are the corner returns | Rule kept; examples become false for five bodies; dated note owed |
| ADR 0110 Amendment C (owner F2, 2026-09-11), E7, E11, O9 | Uppers never above the fridge; no upper over a full-height body; top row only over uppers | **Fridge clause superseded** by ADR 0183; E7 kept for every other full-height body; O9 unchanged |
| ADR 0167 Consequences (2026-10-17) | *"Above a full-height body nothing changes"*; 8 816 slots above fridges | Superseded for the fridge (ADR 0183) |
| ADR 0060 d2, ADR 0101 d1 | A build depth is declared, never measured; a lifted column answers the cabinet-depth line | **Amended**: a third declared answer over a freestanding fridge (ADR 0183 d4) |
| ADR 0101 d4 | *"The 600 mm kitchen is byte-identical"* (the deep-tops wave's first criterion) | **Superseded for `p24` only**: W3b moves it 600 → 700 at setting 600; every other placement stays byte-identical (W3a-2) |
| ADR 0103 d3 | Dependents re-plan on an insert into a column whose depth they follow | Carries the new fact (W3a-4) |
| ADR 0177 A-1 | Depth uplift iff the design's depth is 700 | Unchanged (ADR 0183 d6, Q3-2) |
| ADR 0102 | One authority per number; no generation-side copy | Fridge top and the 700 are read, not typed |
| ADR 0104 Amendment H | Departures from a frame are recorded, frames not edited | Items 4, 5, 7 depart from frames; notes owed (§10) |
| ADR 0178 A-17 | Availability is immediate and logged | Unchanged by item 5 |
| Code comments `staff-kitchen-page.tsx:70-72`, `staff-kitchen-client.tsx:9-10` (Lot 3) | *"no address or phone is made a link"* | **No ADR records it** (swept `docs/decisions/` for `tel:`, `mailto:`, "made a link", "not a link"; ADR 0173, 0174 and the Lot 3 plan). A code convention, **reversed by owner Q7-3**; comments rewritten in W6f |
| ADR 0153 d1; ADR 0174 O-L3-1 (c) (owner, 2026-10-20) | No personal request column read; staff page shows profile contact, request reference and date, as-sent kitchen | Request columns still not read; the profile contact becomes the contact block with links (ADR 0185 d7); **reference superseded by owner Q7-1** (ADR 0185 d2) |
| ADR 0154 | The stored review is never priced again | Sent figure and sent rows come from the stored snapshot |
| ADR 0178 F2; migration `0026:48-55` | `SELECT (priced)` alone on `contact_submissions`; any wider SELECT forbidden | The grant the sent lines ride on (not ADR 0153); unchanged; dated note owed on ADR 0178 [sec S2] |
| ADR 0173 (`:64`) | The staff profile block does not show the postal address | **Superseded by owner Q7-3** (ADR 0185 d7; detail page only); dated note owed [sec S2] |
| ADR 0180 d1, d5, d7 | Staff 3D route; link to the version on screen; no share link | Kept; wrapped in a link card |
| ADR 0168 | "No new tests" | M8C only; M12 follows WORKFLOW's paired tests |
| M11 W5 / staff cabinet-list brief | Cabinet list waits for a Claude Design round trip | **Discharged by the v3 mockup [inf]** |

No record was found that the owner's 2026-11-14 requests contradict other than those marked superseded above.

## 4. Findings per item

### Items 1 and 2 — corner cabinets ignore the kitchen's handle and offer none (ADR 0182)

**Classification: contract decision (a recorded reinterpretation the owner now reverses), not an implementation
defect.** `STRUCTURAL_CORNER` declares `canHandle: false` (`packages/configurator-domain/src/fixtures/kitchen-l-design.ts:126-147`,
`:143` [src]). `resolvedHandleOf` answers `undefined` for such a body (`kitchen-handle/kitchen-handle.ts:41-49` [src]),
so the scene keeps the builder's steel bar (`three-adapter/src/scene-sync.ts:233-260` [src]) and the panel draws no
*Mâner* (`apps/web/src/panel/panel-model.ts:558-559` [src]). The panel already orders handle after finish (§9;
`panel-model.ts:505-560` [src]) and the follow chip already exists (`:819-841` [src]), so **the change is data plus the
tests and comments that pin it**. The owner's screenshot body is `wall-corner-x-900` (`kitchen-l-design.ts:575-586`
[src]). Handle types carry no price of their own [inf: no price-book row or price-line arm names a handle value;
`pricing/catalogue-availability.ts:22`, `:189`]; output moves only through push-to-open latches
(`push-to-open.ts:62-67` [src]) and the black material.

### Item 3 — the cabinet over the fridge is missing and shallow (ADR 0183)

**Classification: contract decision (owner-ruled exclusion, now reversed for the fridge) plus a depth rule.**

- **Missing — always, by rule.** ADR 0110 Amendment C and E7; `upper-policy.ts:58-92`, `generate-kitchen.ts:785-815`
  [src]; tests `generate-kitchen.test.ts:603`, `top-row.test.ts:243` [src]. **[measured]** scratch census (vitest over
  `generateKitchen` with the suite's fake probe, run from the scratchpad, not committed): L/linear/U, widths 2400-6000
  step 400, depths and wall C 1800-5000 step 400, ceilings 2400/2600/2800 = 810 rooms, all generated; 777 placed a
  `fridge-free`; **0 had a body over the fridge.** "Pretty often" is every generated kitchen [inf: the owner saw one
  only on a non-generated kitchen such as the reference `p24` or a preset].
- **Shallow at 600 — the lifted arm.** A wall body over a full-height column builds to the cabinet-depth line, 600 at
  600 (`cabinet-depth-rule.ts:153-180`; read by `resolveDepthM`, `commands/insert-fit.ts:678-695` [src]). The fridge is
  742 finished at every setting (`catalog.ts:350` [src]); ADR 0101 measured `p24` 142 mm recessed (`0101-…:36-58` [doc]).
  A catalogue body declaring 700 would be ignored by `resolveDepthM`, so the 700 must enter the depth rule (ADR 0183 d4).
- **The opening over the fridge [measured].** A second scratch census derived the voids of each generated design
  (`derivePlacementRecords` → `deriveColumns` → `recomputeVoids`) and then ran `insertBody("wall-cabinet")` into the void
  over each fridge, on a coarser grid (L/linear/U, widths 2400-5600 step 800, depths 1800-5000 step 800: 69 fridges per
  ceiling and depth):
  - ceilings 2200-2500: the void exists, floor 1850, `h` 350 (clipped at the wall row's top, 2200) while `spanH` runs to
    the ceiling (350-650); **`insertBody` refuses `OPENING_TOO_SHORT` in all 69** at each ceiling and both depths;
  - ceilings 2600, 2800, 3000: one void 1850-2600 (`h` = `spanH` = 750; `LEVELS` ends at 2.6, `module-grid.ts:14-18`
    [src]); **placed in all 69**: `heightMm` 750, `widthMm` 700, `y0Mm` 1850, `seatDepthMm` 561 at depth 600 and 661 at
    700 (the lifted arm, finished 600/700);
  - ceiling 2000: no void over the fridge (44 fridges), and the 25 U rooms already throw in `generateKitchen` at `HEAD`
    (*"a U's hob has no hood over it"*) — pre-existing, outside this milestone, to be logged in the backlog.
  ~~So the cabinet fits exactly where the top row fits (ceiling ≥ 2600, `hasRoomForATopRow`, `upper-policy.ts:46-48`
  [src]); its height is always 750 there~~ **Corrected 2026-11-15 (W2 logic review R1.1; ADR 0183 Amendment A):** the
  census sampled ceilings in 100 mm steps and missed 2501-2599. The measured bands [relayed: W2 developer, QA and logic
  review, source-verified runs] are: no opening ≤ 2150 (no command, no throw); `OPENING_TOO_SHORT` 2151-2500; **placed
  from 2501**, shortened to the opening (651 mm at 2501 … 749 at 2599; one §4 opening across two levels, §5.2's
  height-flex arm); 750 from 2600. The opening never exceeds 900, so §5.2's nominal arm stays unreachable; and
  `plannedVoid` would **throw** where no void exists (`generate-kitchen.ts:953-977` [src]), so the new step must look the
  void up without throwing. §11 row 1's *"one 750 mm slot above"* (`DEVELOPMENT-SPEC.md:518` [doc]) is the same opening.

### Item 4 — the account menu's staff entry

**Classification: copy and order, owner-ruled.** Rows today: Bucătăriile mele (clients), Profil, Zona personalului (staff
who may enter), Ieși din cont, Ieși de pe toate dispozitivele; then the "Închide" button
(`apps/web/src/account/session/account-control.tsx:488-516` [src]). Copy `accountControl.staffArea` "Zona personalului" /
"Зона персонала" (`apps/web/src/messages/ro.json:876`, `ru.json:876` [src]). Frame Lot 2 `STAFF` puts the entry first
(`Lemnaria Cont Lot 2.dc.html:171` [mock]); the owner's order departs from it. The staff shell's own name
`staffShell.areaName` (`ro.json:1064`) is a different leaf.

### Item 5 — "Activă în configurator · Activ" (ADR 0184)

**Classification: implementation departure from frame D4B plus a control-type decision.** One shared section draws a
bordered `<button role="switch">` with label and state word and no track (`price-dashboard/item-edit-parts.tsx:42-95`,
`action-that-may-be-off.tsx:46-56`, `item-screen.module.css:319-355` [src]); D4B draws a track switch
(`Lemnaria Dashboard.dc.html:295-299`, `:474` [mock]). Pressing opens a confirm dialog in both directions
(`ro.json:1679-1691` [src]) — a switch that asks first. Hardware, material and accessory pages share it.

### Item 6 — the "Status cerere" filter's hint

**Classification: implementation (layout) defect.** At ≥ 900 px `.filters` is a wrapping row with `align-items:
flex-end` (`apps/web/src/staff/staff-kitchens.module.css:805-808` [src]). The status field is a column of label, select
and, on Ciorne and Toate, the hint (`staff-kitchen-filters.tsx:225-269`; `.statusField` `:117-124` [src]). Aligning the
row's bottoms aligns the hint's bottom with the other controls, which **lifts the select** above the search input's
line, and "Doar modificate" (`:213-218`) sits level with the hint, not the controls. [inf: read from the CSS, not captured; falsified if W4's "before" capture shows the select level with
the search input] The v3 template has the same
structure (`ContBlocks2.dc.html`, toolbar `is_tb` block [mock]) but no "Doar modificate". The owner: do not move the
input up; put the text below.

### Item 7 — the staff kitchen page (ADR 0185)

- **(a) The link.** M11's "Deschide în 3D" exists under the picture (`staff-kitchen-page.tsx:269-277` [src]); the owner
  did not find it as a way to view the kitchen, and the request id does nothing. The v3 design answers placement: a
  "Link către bucătărie · Doar citire" card under the preview, and the id removed (`Bucatarii clienti.dc.html:203`,
  `:287` [mock]). **Classification: contract gap (the page had no clear read-only entry).**
- **(b) The list.** The page lists only the bodies the two copies do not share (`kitchen-version-switch.tsx:85-120`
  [src]); the v3 design draws every cabinet in a grouped accordion with amounts (`:204-210`, `:289` [mock]). The client
  review's row facts come from `projectDesignForDisplay` and the review's row detail (`review/review-model.ts:278-300`
  [src]); `describeRowDetails` is private today. What was sent is stored as a priced snapshot,
  `contact_submissions.priced`, already read for the sent total (`persistence/src/staff-kitchen-statements.ts:206-215`
  [src]). **Classification: contract gap.**
- **(c) The price.** Both figures go through `describeStartingPrice`, which rounds up to the thousand
  (`price/starting-price.ts:26` [src]); "Acum" is priced with today's book (`lib/server/staff/staff-kitchen-estimates.ts:53-68`
  [src]). Equal printed figures can hide a difference of up to 990 MDL [inf: the screenshot's exact totals were not
  read]. A difference can come from a publish or a rule change, not only an edit, so the mockup's "Clientul a
  modificat…" (`:212` [mock]) is false for an unchanged kitchen. `versionsOf` tells whether the kitchen changed
  (`staff-kitchen-facts.ts:22-28` [src]). **Classification: contract gap (no difference shown) with a test-fidelity
  hazard (rounded equality).**

## 5. Waves

| Wave | Items | Review tier | Depends on | Production files (approx.) | ADR |
| --- | --- | --- | --- | --- | --- |
| W0 | docs: this plan, ADRs 0182-0185 Proposed, owner questions | Coordinator-only (docs) | none | 0 | 0182-0185 |
| W1 | 1, 2 corners take handles | **Full** + visual | W0, ADR 0182 accepted | 2 | 0182 |
| W2 | 3 cabinet over the fridge, placement | **Full** | W0, ADR 0183 accepted | 3 | 0183 |
| W3a | 3 the 700 depth rule (domain) | **Full** (mini-review named: 6 files) | W2 | 6 | 0183 |
| W3b | 3 the seeded over-fridge row and its 3D build | **Full** + visual (3D) | W3a | 2 | 0183 |
| W4 | 4 account menu; 6 filter hint | Light + visual | W0 | 4 + copy | none |
| W5 | 5 availability status and action | Light + visual | ADR 0184 accepted | 4 + copy | 0184 |
| W6a | 7a link card; request reference off the page and off the detail wire (N2) | Light + **security** + visual (mini-review named: 7 files) | ADR 0185 accepted | 7 + copy | 0185 |
| W6b | 7c price card with difference | Light + visual | W1 committed (its output moves "Acum") | 4 + copy | 0185 |
| W6c | 7b cabinet accordion (current amounts) | Light + visual (mini-review named: 6 files) | W6a | 6 + copy | 0185 |
| W6d | 7b the sent snapshot's lines and the profile's locality on the wire | **Full + security** (mini-review named: 7 files) | W6c | 7 | 0185 |
| W6e | 7b summary card folded into the accordion header | Light + visual | W6c | 4 | 0185 |
| W6f | 7, profile contact block with "Sună" / "Scrie" (owner Q7-3) | Light + **security** + visual | W6d (locality), W6e (column order) | 4 + copy | 0185 d7 |

Order: W0, then the domain and generation fixes W1 → W2 → W3a → W3b (sequential: W1 and W2/W3 share no file but the
fixture file `kitchen-l-design.ts` is in W1 and W3b), then UI. W4 and W5 touch no file the domain waves touch and may
run in a separate worktree while W2-W3 run (R2: one writing agent per tree). W6a-W6f are sequential (shared
`staff-kitchen-page.tsx`, `staff-kitchen.module.css`). `apps/web/src/messages/ro.json`, `ru.json`, `ro.d.json.ts`, the
copy lock and the golden hashes are shared by W4, W5, W6a-W6f: serialise those edits through the coordinator.
**Copy approval:** "Panoul de administrare" is the owner's own wording and enters the copy lock as approved. Every other
new Romanian leaf, including the v3 mockup's ("Link către bucătărie", "Doar citire", "Copiază linkul", "Diferă", "La
trimitere", "Acum", "Trimis și actual", "Nou după trimitere", "Extinde tot", "Restrânge tot", "Sună", "Scrie",
"Adresă / localitate" as a staff leaf), enters marked
**drafted**: ADR 0174 d5 pre-approved Lot 3's copy, not v3's. Russian is always drafted, never pinned.

**Every implementer, QA and reviewer brief bans by name** `git stash`, `git stash pop`, `git checkout -- .`, `git reset
--hard`, `git clean`, and editing the uncommitted owner doc files listed in `git status` (R2;
`docs/best-practices/agent-coordination.md`).

---

### W0 — docs (coordinator-only)

This plan and ADRs 0182-0185 as **Proposed**. The owner reads §9 and accepts or overturns each default; the scribe
records answers and flips the ADRs to Accepted. Verification: the coordinator checks each `file:line` cited in the four
ADRs against `c48992e8` and states what it checked.

---

### W1 — corner cabinets take the kitchen's handle and a choice of their own (items 1, 2; ADR 0182)

**Coordinate/structure.** No geometry moves. Bars are built on every corner body already (top-row ones built hidden,
`three-adapter/src/decomposed-bodies.ts:154-200` [src]); `dressBody` sets visibility both ways (`scene-sync.ts:233-236`
[src]). Structural dependency: none new.

| Slice | Work | Files likely touched | Reading |
| --- | --- | --- | --- |
| W1 | Remove `canHandle` from `STRUCTURAL_CORNER`; declare it per corner row (true on five, false on `base-corner-return-320`); rewrite the corner comments in `push-to-open.ts`; update the six tests that pin the old flag with reasons in the wave's test table | `packages/configurator-domain/src/fixtures/kitchen-l-design.ts`, `packages/configurator-domain/src/push-to-open.ts` (comments only) | This section; ADR 0182 (whole); ADR 0021 d2 (`:33-46`); ADR 0092 d3 (`:233-262`); ADR 0099 Amendment C (`:458-478`); DEVELOPMENT-SPEC §5.5, §6.5, §9 (`:422-447`), §13.1 (`:608`), §11 rows 12, 13, 16; `kitchen-handle/kitchen-handle.ts`; `push-to-open.ts`; `scene-sync.ts:200-310`; `panel-model.ts:505-560`, `:819-841`; `commands/set-appearance.ts:150-190`; `queries/design-projection.ts:140-200`; `three-adapter/tests/catalog-capability-parity.test.ts` |

**QA reading:** this section; ADR 0182; ADR 0092 d3; DEVELOPMENT-SPEC §6.5, §9, §11 rows 12, 13, 16;
`tests/hardware-mechanisms.test.ts`, `three-adapter/tests/cabinet-handle-count.parity.test.ts`,
`three-adapter/tests/push-to-open-seam.parity.test.ts`; `docs/best-practices/engineering-conventions.md`, *Coverage an
adversarial pass owes*. **Logic reviewer reading:** ADR 0182; ADR 0021; ADR 0092 d3; ADR 0061; the diff.
**Clean-code reviewer reading:** the diff; `engineering-conventions.md`. **Visual reviewer reading:** W1-4 below;
`browser-and-visual-qa.md`.

**Acceptance criteria.**

- **W1-1 (byte identity, property).** For every design in {`KITCHEN_L_DESIGN`; `generateKitchen` over an L/linear/U room
  grid} at cabinet depths 600 and 700, with the kitchen's `handle` ∈ {absent, `steel`} and `topRowHandle` ∈ {absent,
  `push`}: `priceDesign`'s result, `countHardwareMechanisms` per placement, and for every built body each
  cabinet-handle mesh's visibility and material are equal to `HEAD`'s. QA captures the `HEAD` baseline before the change.
  **Not** compared: `signBody` (a corner's signature now carries its resolved handle, `steel` or `push`, where it carried
  `""` — intended) and the display projection (W1-9).
- **W1-2.** Kitchen `handle: "black"`: every cabinet-handle mesh of `base-corner-x-900`, `wall-corner-return-570` and
  `wall-corner-x-900` carries the black handle material; the top-row corners keep theirs hidden (`topRowHandle` absent).
- **W1-3.** Kitchen `handle: "push"`: those three bodies' bars are hidden and the price bills one push-to-open latch per
  corner leaf below the top row; nothing else in the hardware line changes.
- **W1-4 (panel).** Selecting each of the five bodies shows, in this order: the structural note, *Finisaj* with "Preia
  culoarea bucătăriei", then *Mâner* with the three chips and a follow chip naming the kitchen's (or the slot's) handle.
  Selecting `base-corner-return-320` shows no *Mâner*. Captured at 390 × 844, ro and ru, with `wall-corner-x-900`
  selected and the kitchen handle black.
- **W1-5.** Choosing a handle on a corner writes `body.handle` on that placement only; a later kitchen-handle change
  does not override it; "follow" clears it.
- **W1-6 (must not).** No corner gains a swap list, a delete action or a width change; `canReplace`, `canDelete`,
  `fixedWidth`, `structuralReason` are unchanged on all six; `base-corner-return-320.canHandle` is `false`.
- **W1-7.** With "black" switched off in availability and a corner carrying its own `black`, pricing refuses
  `REPLACEMENT_REQUIRED` naming that handle, as for any cabinet.
- **W1-8.** ADR 0092's property `openingFronts > 0 ⇒ cabinetHandles > 0` still holds over every catalogue entry, and the
  capability-parity gate's `canHandle ⇒ cabinetHandles > 0` (`three-adapter/tests/catalog-capability-parity.test.ts:184-200`)
  holds with its corner pins (`:229-290`) updated, not exempted.
- **W1-9 (intended projection change).** `projectDesignForDisplay` gives the three corner bodies below the top row a
  `wornHandle` (`steel` by default, the kitchen's otherwise) where it gave none, so their rows on "Verifică designul" and
  in W6c's list gain a handle fact; top-row corners keep `push`. The review's golden hashes that move are listed in the
  wave's commit message.

**Verification.** Domain and three-adapter suites; the parity gates above; screenshots for W1-4.

---

### W2 — generation hangs a cabinet over the freestanding fridge (item 3, placement; ADR 0183 d1-d3)

**Coordinate anchors, scaling, dependency.** Anchor: wall = the fridge's; along-wall centre = the fridge's final centre
(after resizes and fills); floor = fridge `y0Mm` + the fridge row's declared `nominalHeightMm`; back face on the wall
plane. Scaling: width = the fridge's width; height = §5.2 (`resolveHeightM`): 651-749 mm from a 2501 to a 2599 mm
ceiling, 750 from 2600 (§4 finding as corrected 2026-11-15). Dependency: inserted after every base (and the free-end resizes and fills) and before the top row; never
before the fridge exists; the void is looked up without `plannedVoid`'s throw.

| Slice | Work | Files likely touched | Reading |
| --- | --- | --- | --- |
| W2 | A rule "a body over the freestanding fridge is owed" read from a catalogue declaration (not the id or role); one insert step per placed fridge through `insertOver`, with a stable step id and a role that no Step 1 row counts | `packages/configurator-domain/src/generation/generate-kitchen.ts`, `generation/upper-policy.ts` (or a new leaf beside it), `packages/configurator-domain/src/catalog.ts` + `fixtures/kitchen-l-design.ts` for the fridge declaration if W3a's declaration is not yet there (coordinate: one declaration serves both waves); `apps/web/src/room/generation-model.ts` only if its role typing requires | This section; ADR 0183 d1-d3, *Sweep*; ADR 0110 Amendment C (`:250-260`), E7 (`:785-794`), O9 (`:4864-`), O10; ADR 0167 D4 and Consequences (`:95-112`, `:165-167`); ADR 0102; DEVELOPMENT-SPEC §4, §5.2, §11 row 1; `generate-kitchen.ts:414-627`, `:740-830`; `upper-policy.ts`; `insert-fit.ts:54-59`, `:498-503`; `apps/web/src/room/generation-model.ts:140-160` |

**QA reading:** this section; ADR 0183; `tests/generation/generate-kitchen.test.ts:603`, `tests/generation/top-row.test.ts:243`,
`tests/support/fridge-end-census.ts`, `tests/support/fake-probe.ts`; DEVELOPMENT-SPEC §5.2, §11 row 1;
`engineering-conventions.md`, *Coverage an adversarial pass owes* (sweeps with a floor per arm). **Logic reviewer
reading:** ADR 0183; ADR 0110 C, E7, O9; ADR 0167 D4; the diff. **Clean-code reviewer reading:** the diff.

**Acceptance criteria.**

- **W2-1 (property, `fast-check` or a swept grid with a floor per arm; amended 2026-11-15).** Over L, linear and U rooms
  (widths, depths, wall C across their bounds) at ceilings ≥ 2501: for every generated design with a placed
  `fridge-free`, exactly one placement stands over the fridge; it is `wall-cabinet`, on the fridge's wall, `alongMm`
  equal to the fridge's, `widthMm` equal to the fridge's, `y0Mm` equal to the fridge's `y0Mm` + its row's
  `nominalHeightMm`, and `heightMm` equal to the opening: `ceiling − 1850` from 2501 to 2599 (651 … 749), 750 from 2600.
  Each of L, linear and U, each of depths 600 and 700, and each of the two height arms (2501-2599, ≥ 2600, with 2501 and
  2599 as witnesses) is reached at least once.
- **W2-2 (ceilings up to 2500, no throw; amended 2026-11-15).** For every ceiling from the room minimum to 2500 at which
  `HEAD` generates a room without throwing, the new code also generates it without throwing, and the design is equal to
  `HEAD`'s for that room. At ≤ 2150 there is no opening over the fridge: no command is issued. From 2151 to 2500 the
  refused `insertBody` command is logged with `OPENING_TOO_SHORT`. Witnesses at 2150, 2151 and 2500.
- **W2-8 (nothing over it).** At no ceiling is a body placed or a top-row step attempted over the fridge's cabinet (ADR
  0110 O9; `hasRoomForATopRow` is false below 2600).
- **W2-3 (only an addition, property).** For every room in W2-1, every placement other than the new one equals
  `HEAD`'s, and every column record (empty column or stored extent) whose span does not overlap the fridge's span equals
  `HEAD`'s; settings are equal.
- **W2-4 (must not).** No top-row step is attempted over the fridge's cabinet; no body is placed over a
  `tall-oven-tower`, `tall-pantry` or `tall-fridge-housing` (E7 still holds for them); a room whose fridge was dropped
  gets no step over a fridge; every generated design still passes `assertGeneratedDesign` and has exactly one oven.
- **W2-5.** Replaying `log.commands` on the shell reproduces the design byte for byte.
- **W2-6.** The Step 1 list renders unchanged for every swept room (the new step counts under no row).
- **W2-7.** The two tests asserting the empty slot are updated, their reason recorded in the wave's test table.

**Verification.** Domain suite; W2-1 to W2-3 and W2-8 as committed tests (they replace the architect's scratch census,
which is not in the repository and missed the 2501-2599 band).

**Accepted for the backlog (2026-11-15, coordinator ruling).** While the cabinet hangs over a generated fridge,
replacing that fridge with a tower or a pantry is refused. Recorded as known behaviour (ADR 0183 Amendment A); not built
in M12.

---

### W3a — the 700 mm depth over a freestanding fridge (item 3, depth; ADR 0183 d4-d7)

**Coordinate anchors, scaling, dependency.** Anchor: back face on the wall plane, depth grows into the room. Scaling:
depth = the deepest declared cabinet depth (`declaredCabinetDepthsMm()`'s maximum, 700), not the setting and not the
fridge's 742. Dependency: answered from the records by `withCurrentFullHeightMembers`, like `hasFullHeightUnder`;
re-planned by ADR 0103's trigger.

| Slice | Work | Files likely touched | Reading |
| --- | --- | --- | --- |
| W3a | A declaration on the freestanding fridge rows that a body over them is built to the deepest declared depth; the column answers it beside `hasFullHeightUnder`; `columnBuildDepthMm` gets the third arm; `resolveDepthM`, the depth-change map and the dependent re-plan read it | `catalog.ts` (the `fridge-free` row), `fixtures/kitchen-l-design.ts` (`fridge-free-700`), `void-engine.ts` (`Column`, `withCurrentFullHeightMembers`, the record field), `cabinet-depth-rule.ts`, `commands/insert-fit.ts`, `frozen-map-at-cabinet-depth.ts` (and `commands/replan-dependent-members.ts` if its trigger must compare the new fact) | This section; ADR 0183 d4-d7; ADR 0060 (whole); ADR 0101 d1 and Amendment A; ADR 0103 d3; ADR 0011 Gap D; ADR 0090 Amendment B; DEVELOPMENT-SPEC §3.2, §5.2, §7 (the `0.33` paragraph), §11 row 19; `cabinet-depth-rule.ts:140-200`; `insert-fit.ts:660-710`; `void-engine.ts:236-262`, `:830-880`; `frozen-map-at-cabinet-depth.ts:260-300`; `replan-dependent-members.ts:60-130`; `worktop-depth.ts:60-90`; `docs/best-practices/product-invariants.md` |

**From W2's logic review R1.3 (2026-11-15) [relayed].** The depth fact is a **sibling field** of the row declaration
W2 introduced, `WallBodyOverIt` (`packages/configurator-domain/src/wall-body-over-it.ts`), not a second meaning of
`isOwedByGeneration`. W2's QA test "generation is the only reader of the declaration" is relaxed to "generation and the
depth rule are the only readers", with that reason recorded beside the test (ADR 0183 Amendment A). Add
`wall-body-over-it.ts` and that test to this wave's reading.

**QA reading:** this section; ADR 0183 (with Amendment A); ADR 0101; ADR 0103 d3; `tests/build-depth.test.ts`,
`tests/…/seeded-equivalent-depth-agreement.test.ts`; DEVELOPMENT-SPEC §5.2, §11 rows 1, 19. **Logic reviewer reading:**
ADR 0183; ADR 0060; ADR 0101; ADR 0103; the diff. **Clean-code reviewer reading:** the diff. A **mini-review** after the
slice (six production files).

**Acceptance criteria.**

- **W3a-1 (setting 700, property).** Every generated design (W2's grid) and `KITCHEN_L_DESIGN` at depth 700 is byte-equal
  to its W2 result.
- **W3a-2 (setting 600, property).** At depth 600, against W2's result for the same room, the only placements that differ
  are wall bodies over a `fridge-free`, and each differs only in its recorded depth (seat) and its finished depth now
  700.
- **W3a-3.** In the editor at 600: inserting `wall-cabinet` over a `fridge-free` builds 700 deep; over
  `tall-fridge-housing`, `tall-pantry` or `tall-oven-tower` it builds 600 (unchanged); over a base cabinet 330 (unchanged).
- **W3a-4 (round trip and re-plan).** 600 → 700 → 600 leaves the over-fridge body at 700 throughout and every other body
  at its `HEAD` value at each step; deleting the fridge and inserting a pantry in its column re-plans the body above to
  600; deleting the pantry and re-inserting the fridge re-plans it to 700.
- **W3a-4b (ruling 2026-11-15, ADR 0183 dated note).** A wall body that straddles the fridge's edge keeps its recorded
  depth after a delete followed by an insert that does not reach under its column (ADR 0103's accepted interim, both
  arms alike); an insert that does reach under it, or a cabinet-depth round trip, re-plans it; the one-command swap
  re-plans it at once.
- **W3a-5.** The value is `max(declaredCabinetDepthsMm())`, and a test pins it to 700 (the owner's number) so a new depth
  row fails that test.
- **W3a-6 (must not).** The capped arm never exceeds the column's clearance; no body anywhere sits past the wall plane
  (§11 row 19); a stored design whose over-fridge body records 600 at setting 600 loads, validates and renders without a
  refusal (ADR 0167: never re-generated).

**Verification.** Domain suite; the properties; a depth round-trip test.

### W3b — the seeded over-fridge row and its 3D build (item 3; ADR 0183 d4)

| Slice | Work | Files likely touched | Reading |
| --- | --- | --- | --- |
| W3b | `wall-2door-700-over-fridge`'s `frameDepthMm` follows the fridge arm; the adapter builds it to the same depth; ADR 0101's replacement assertion for that row targets the fridge arm | `fixtures/kitchen-l-design.ts`, `three-adapter/src/decomposed-bodies.ts` (`:213-214`) | ADR 0183 d4, *Coordinate anchors*; ADR 0101 d1 (the replacement assertion and its non-vacuity clause); `kitchen-l-design.ts:600-633`; `decomposed-bodies.ts:150-220`; `scene-sync.ts:262-280` (`rebuildDepthM`); DEVELOPMENT-SPEC §6.2, §11 row 19; `browser-and-visual-qa.md`; `product-invariants.md` |

**QA reading:** this section; ADR 0183; ADR 0101 d1; the three-adapter parity tests for seeded builds. **Logic and
clean-code reviewer reading:** ADR 0183; ADR 0101; the diff. **Visual reviewer reading:** W3b-3; `browser-and-visual-qa.md`.

- **W3b-1.** `p24` at 600: built body's back face on the wall plane (0.000, §11 row 19), its finished depth 0.700 m by the
  real probe; at 700 unchanged from `HEAD`.
- **W3b-2.** The seeded-equivalence gate stays non-vacuous (rows on both sides, ADR 0101 d1) and asserts the fridge arm
  for `p24` and the lifted arm for `p22`, `p23`.
- **W3b-3 (visual).** A capture at 390 × 844, depth 600, overview and wall-B presets, `preserveDrawingBuffer` on, shows the
  cabinet over the fridge reaching 700 from the wall; the measurement comes from the probe, not from a model of the
  geometry (WORKFLOW, *Working conventions*). The fridge's door front stays 42 mm proud (742 − 700): expected, Q3-4.

---

### W4 — the account menu's staff entry (item 4) and the status filter's hint (item 6)

| Slice | Work | Files likely touched | Reading |
| --- | --- | --- | --- |
| W4.1 | Move the staff entry to the last row, after "Ieși de pe toate dispozitivele", as its own group with a visible divider; rename to "Panoul de administrare"; Russian drafted (e.g. "Панель администрирования"), unapproved | `apps/web/src/account/session/account-control.tsx`, `apps/web/src/account/account.module.css`, `messages/ro.json`, `ru.json`, `ro.d.json.ts`, the copy lock | §4 item 4; `account-control.tsx:425-560`; `account.module.css:1173-1240`, `:1317-`; `Lemnaria Cont Lot 2.dc.html:171`; `engineering-conventions.md` §4-§5 (copy) |
| W4.2 | Keep the hint under the select without the select or the switch leaving the controls' line at ≥ 900 px | `apps/web/src/staff/staff-kitchen-filters.tsx` (only if markup must change), `apps/web/src/staff/staff-kitchens.module.css` | §4 item 6; `staff-kitchen-filters.tsx:50-113`, `:225-269`; `staff-kitchens.module.css:42-124`, `:191-253`, `:800-830`; `Bucatarii clienti.dc.html:191` and `ContBlocks2.dc.html` toolbar block |

**QA reading:** this section; `browser-and-visual-qa.md`; `tests/account/` for the menu; `tests/staff/` for the
filters. **Combined reviewer reading:** this section; the diff; screenshots.

- **W4-1.** Signed in as staff (operator and administrator): the menu's rows read, in order, Profil, Ieși din cont, Ieși de
  pe toate dispozitivele, then a divider, then **Panoul de administrare**; the "Închide" button stays below the rows. Tab
  order equals that visual order. Signed in as a client: rows and markup unchanged (no divider, no entry).
- **W4-2.** The entry is a link to the same staff address as today, named "Panoul de administrare" (ro) and the drafted
  Russian (ru); the divider is not announced as an item and adds no Tab stop.
- **W4-3 (must not).** `staffShell.areaName` and the staff shell's own menu (`staffAreaEntry="omitted"`) are unchanged;
  sign-out behaviour unchanged. The Romanian leaf enters the copy lock (owner-given wording); the Russian is marked
  drafted, not approved.
- **W4-4 (filter, ≥ 900 px, Ciorne and Toate).** The status select's top and bottom edges equal the search input's
  (± 1 px), and equal the select's own edges on Trimise (± 1 px): the select does not move up. The hint's top is at or
  below the select's bottom and within 8 px of it. "Doar modificate" is vertically centred on the controls' line (± 2 px).
  The hint overlaps nothing below it.
- **W4-5 (390 × 844).** The hint sits directly under the select; nothing scrolls horizontally; the select keeps
  `aria-describedby` to the hint while disabled.

**Verification.** Component tests for W4-1 to W4-3; Playwright measurements for W4-4 at 1440 × 900 and 1920 × 1080 and
W4-5 at 390 × 844; before/after screenshots, ro and ru.

---

### W5 — availability as a status and a named action (item 5; ADR 0184)

| Slice | Work | Files likely touched | Reading |
| --- | --- | --- | --- |
| W5 | `ItemLifecycleSection` states the status (label + "Activ"/"Inactiv" badge) and offers one button, "Dezactivează" or "Activează", opening the existing dialogs; no `role="switch"` | `price-dashboard/item-edit-parts.tsx`, `price-dashboard/action-that-may-be-off.tsx` (only if its `switchState` arm is retired), `price-dashboard/item-screen.module.css`, the three `*-edit.tsx` only if their words object changes; copy only if a leaf is added | ADR 0184 (whole); ADR 0178 A-17; `item-edit-parts.tsx`; `action-that-may-be-off.tsx`; `use-item-availability.ts`; `item-screen.module.css:300-370`; `ro.json:1340-1370`, `:1575-1700`; `Lemnaria Dashboard.dc.html:295-299`, `:474`, `:693`, `:703`, `:868-869` |

**QA reading:** this section; ADR 0184; `tests/price-dashboard/` for the three edit pages. **Combined reviewer reading:**
ADR 0184; the diff; screenshots.

- **W5-1.** On a hardware class, a material and an accessory page: the status is text (a badge "Activ" or "Inactiv"),
  and no element in the section has `role="switch"` or `aria-checked`.
- **W5-2.** Active item: a button named "Dezactivează" opens the deactivation dialog; confirming leaves the badge
  "Inactiv" and the button "Activează". Inactive item: "Activează" opens the activation dialog. Cancel changes nothing and
  returns focus to the button.
- **W5-3.** Where the action is off (default item, last active option, draft-deleted item) the button is
  `aria-disabled`, its reason is shown under it, and the status is still shown.
- **W5-4 (must not).** The availability requests, the dialogs' copy, the delete section and the list's "⋯" menu are
  unchanged.
- **W5-5.** Captures at 390 × 844 and 1440 × 900, ro and ru, active and inactive.

---

### W6a — the read-only link card and the request reference (item 7a; ADR 0185 d1, d2)

| Slice | Work | Files likely touched | Reading |
| --- | --- | --- | --- |
| W6a | `OpenIn3dLink` becomes a card: title, "Doar citire" badge, the absolute address as selectable text, "Copiază linkul", "Deschide în 3D", the note; the request card drops the reference (owner Q7-1) and keeps the contact note; the now-unread `reference` leaves the detail statement, the reader's detail type and the detail wire [sec N2] | `staff/staff-kitchen-3d-link.tsx`, `staff/staff-kitchen-request.tsx`, `staff/staff-kitchen-page.tsx`, `staff/staff-kitchen.module.css`, `persistence/src/staff-kitchen-statements.ts`, `persistence/src/staff-kitchen-reader.ts` (+ the neon and fake readers), `lib/server/staff/staff-responses.ts`, `staff/staff-kitchens-wire-contract.ts` + `staff-kitchens-wire-reading.ts`; copy | ADR 0185 d1, d2, *Must not*, *Security read*; ADR 0180 d1, d5, d7; ADR 0174 O-L3-1; `docs/best-practices/environments-and-resources.md` (`LEMNARIA_PUBLIC_ORIGIN`); `staff-kitchen-statements.ts:180-240`; `lib/server/staff/staff-responses.ts:280-340`; `staff-kitchen-page.tsx:195-330`; `staff-paths.ts:55-75`; `staff-kitchen-request.tsx:110-131`; `staff-kitchen-facts.ts:73-91`; `Bucatarii clienti.dc.html:203`, `:221-222`, `:287` |

**QA reading:** ADR 0185 d1, d2; ADR 0180 d5, d7; `tests/staff/` (the W3b link tests and e2e spec); the persistence
staff-reader tests. **Combined reviewer reading:** ADR 0185; ADR 0180; the diff; screenshots. **Security reviewer
reading:** ADR 0185 d1, d2, *Security read* (N1, N2); ADR 0180 d7; the diff.

- **W6a-1.** The card stands directly under the preview (desktop left column; phone after the preview). Its address text
  equals the page origin + `staffKitchen3dPathOf({ locale, kitchenId, version })` for the copy on screen; switching the
  version changes the text and the link's `href` together.
- **W6a-2.** "Copiază linkul" writes exactly that address; success is announced in a polite live region; a refused
  clipboard says so and leaves the text selectable; nothing throws.
- **W6a-3.** "Deschide în 3D" keeps `target="_blank"` and `rel="noopener noreferrer"`; opening it writes the same audit row
  as today (`kitchen-viewed-3d`).
- **W6a-4 (owner Q7-1).** No request reference text appears on the page; the contact note and the header's sent date
  remain. **[sec N2]** The staff kitchen **detail** statement no longer selects `cs.reference`, and the detail wire has no
  `reference` key (a test asserts its absence); the list read is unchanged.
- **W6a-5 (must not).** No share link is minted (no request to a share endpoint during the page's life). (Contact links
  are W6f's, not this wave's.)
- **W6a-6.** Captures at 390 × 844 and 1920 × 1080, sent and draft kitchens, ro and ru.
- **W6a-7 (origin, no hydration mismatch) [sec N1].** The origin is `window.location.origin` read after mount, or the
  configured `LEMNARIA_PUBLIC_ORIGIN`; it is **never** taken from a request's `Host` or `X-Forwarded-Host` header (a test
  renders the page under a forged `Host` and finds it absent from the address). A production build shows no React
  hydration error (#418) on the page (precedent: `docs/milestones/m10-hydration-418-diagnosis.md`).

### W6b — the price card says when the price now differs (item 7c; ADR 0185 d5)

| Slice | Work | Files likely touched | Reading |
| --- | --- | --- | --- |
| W6b | A pure model of the price card (same / different / not comparable, the signed exact difference, the note by cause) and its rendering; a signed line-amount formatter in the one rounding module if none fits | `staff/kitchen-estimates.tsx`, a new `staff/kitchen-estimates-model.ts`, `price/starting-price.ts` (only a signed line amount), `staff/staff-kitchen.module.css`; copy | ADR 0185 d5; ADR 0154; `kitchen-estimates.tsx`; `lib/server/staff/staff-kitchen-estimates.ts`; `staff-kitchens-wire-contract.ts:375-412`; `price/starting-price.ts`; `staff-kitchen-facts.ts:22-45`; `Bucatarii clienti.dc.html:212`, `:288` |

**QA reading:** ADR 0185 d5; `starting-price.ts`; `javascript-testing-expert` guidance for properties. **Combined
reviewer reading:** ADR 0185 d5; the diff.

- **W6b-1 (property).** For any two totals in minor units and currencies: "same" iff both exist, the currencies match and
  the totals are equal; the shown difference is `current − sent` formatted at ten lei with an explicit sign ("+" or "−")
  in text.
- **W6b-2 (the owner's case).** Sent 5 612 000 and current 5 683 000 minor (56 120 and 56 830 MDL): both figures read
  "De la 57 000 MDL", the card reads "Diferă" and the difference "+710 MDL"; it never reads "Prețul nu s-a schimbat".
- **W6b-3.** With the copies different (`versionsOf` defined) the note says the client changed the kitchen after sending;
  with them equal it says the kitchen is unchanged and the current price uses today's prices and rules; it never says the
  client changed an unchanged kitchen.
- **W6b-4.** Sent total missing, current refused or empty, or currencies different: no difference and no "Diferă"; each
  keeps today's sentence.
- **W6b-5.** Colour is never the only carrier of the difference. Captures at 390 × 844 and 1920 × 1080 for same, different
  and not comparable.

### W6c — every cabinet, in an accordion (item 7b; ADR 0185 d3, d4)

| Slice | Work | Files likely touched | Reading |
| --- | --- | --- | --- |
| W6c | Export the review's row-detail builder; a model that turns the shown copy (and, with both copies, D10B's marks) into groups of rows with names, facts, tags and amounts (current copy: its priced lines by `placementId`; sent copy: none yet); an accordion component; replace `KitchenVersionCabinets` on the page | `review/review-model.ts` (export only), new `staff/staff-cabinet-list-model.ts`, new `staff/staff-cabinet-list.tsx`, `staff/kitchen-version-switch.tsx`, `staff/staff-kitchen-page.tsx`, `staff/kitchen-version-switch.module.css` or a new module; copy | ADR 0185 d3, d4, *Must not*; `claude-design-brief-staff-cabinet-list.md` (open questions); `review/review-model.ts:44-60`, `:262-310`; `review/review-groups.tsx`; `configurator-domain/src/queries/design-projection.ts:33-200`; `kitchen-version-rows.ts`; `kitchen-version-switch.tsx`; `staff-kitchen-view.tsx:187-280`; `Bucatarii clienti.dc.html:204-210`, `:221-222`, `:289` |

**QA reading:** ADR 0185 d3, d4; `kitchen-version-rows.ts` and its tests; `review-model` tests. **Combined reviewer
reading:** ADR 0185; the diff; screenshots. A **mini-review** after the slice (six production files).

- **W6c-1 (property over generated designs).** The groups and their order equal `projectDesignForDisplay`'s; the rows'
  count equals the shown copy's placements, plus, when the current copy is shown with both copies readable, one row per
  body only in the sent copy (W6c-4); each listed placement's name and facts equal the review's row detail for the same
  design.
- **W6c-2.** Each group header is a button with `aria-expanded` and `aria-controls`, at least 44 px tall; "Extinde tot" /
  "Restrânge tot" sets every group; the state survives a version switch while the page is open and is not persisted.
- **W6c-3.** Default open: the first two groups at ≥ 900 px, the first on a phone.
- **W6c-4.** With both copies readable: a body only in the current copy is tagged "Nou după trimitere"; a differing body
  keeps D10B's mark; a body only in the sent copy is listed with D10B's "removed" mark when the current copy is shown.
- **W6c-5 (amounts, must not).** Current copy: each row's amount equals that placement's priced cabinet line, shown at
  ten lei. Sent copy: no amount on any row (until W6d). No amount is ever priced with today's book for the sent copy,
  and none is shown as zero.
- **W6c-6.** Captures at 390 × 844 and 1920 × 1080, sent and changed kitchens, ro and ru.

### W6d — the sent copy's stored row amounts (item 7b; ADR 0185 d4) — Full + security

| Slice | Work | Files likely touched | Reading |
| --- | --- | --- | --- |
| W6d | The staff kitchen **detail** read returns the stored snapshot's cabinet lines, projected in SQL to `{placementId, amountMinor}` for `kind = 'cabinet'` only and bounded by `MAX_PLACEMENTS` [sec S5], beside the sent total; and the profile's `address` through a **detail-only** client type and wire mapper, the list's left as they are [sec S1]; the list shows the lines on the sent copy (the address is drawn by W6f); rewrite the stale comments `staff-kitchen-reader.ts:74-75`, `staff-kitchens-wire-contract.ts:35`, `staff-kitchen-statements.ts:30-31` [sec S2] | `persistence/src/staff-kitchen-statements.ts`, `persistence/src/staff-kitchen-reader.ts`, `persistence/src/neon-staff-kitchen-reader.ts`, `persistence/src/fake-staff-kitchen-reader.ts`, `apps/web/src/lib/server/staff/staff-responses.ts`, `staff/staff-kitchens-wire-contract.ts` + `staff-kitchens-wire-reading.ts`, `staff/staff-cabinet-list-model.ts` | ADR 0185 d4, d7, *Must not*, *Security read* (S1, S2, S5, S6); ADR 0153 d1; ADR 0154; ADR 0178 F2 and `migrations/0026_create_design_staff_seen.sql:48-55` (the `priced` grant); ADR 0179 (profile fields); ADR 0173 (`:64`) and P-L3-3, P-L3-4; ADR 0156; `migrations/0017_add_account_profile_columns.sql`; `persistence/src/staff-kitchen-reader.ts:70-100`, `:170-190`; `staff-kitchens-wire-contract.ts:30-110`; `lib/server/staff/staff-responses.ts:280-340`, `:460-480`; `configurator-domain/src/design-bounds.ts:60-105`; `staff-kitchen-statements.ts:180-240`; `neon-staff-kitchen-reader.ts:230-300`; `contact-submission-store.ts:160-200`; `staff-kitchen-estimates.ts`; `docs/best-practices/environments-and-resources.md` (no migration expected) |

**QA reading:** ADR 0185 d4; ADR 0153 d1; the persistence suite's staff reader tests and the privilege test as the
application role. **Logic and clean-code reviewer reading:** ADR 0185; ADR 0154; ADR 0173; the diff. **Security
reviewer reading:** ADR 0185; ADR 0153 d1 and Amendment A; ADR 0172's grant decisions (D7 and *Remaining before
production*); the column grants on `contact_submissions` in the migrations; the privilege test file as the application
role; ADR 0178 F2 and `0026:48-55`; ADR 0185 *Security read*; the diff. A **mini-review** after the slice (seven
production files).

- **W6d-1.** On the sent copy each row's amount equals the stored snapshot's line for that placement id, exactly;
  a placement with no stored line shows none; a snapshot whose lines this build cannot read shows none on any row and the
  page still renders (never a zero).
- **W6d-1b (projection and bounds) [sec S5].** The statement returns only `{placementId, amountMinor}` pairs, only for
  lines of `kind` `'cabinet'`, at most `MAX_PLACEMENTS`; the reader drops a pair whose id is not a string of at most
  `MAX_IDENTIFIER_LENGTH` or whose amount is not a safe integer; the client keys amounts by `Map` or `Object.hasOwn`, and
  a snapshot carrying a line with id `__proto__` or `constructor` changes no other row and no prototype (adversarial
  test).
- **W6d-2 (must not).** The statement selects no personal column of `contact_submissions` (named columns only, reviewed
  against ADR 0153 d1's list); the privilege test as the application role passes unchanged; no migration and no grant
  change.
- **W6d-3.** The sent total, the audit row and the response for a draft are unchanged; the response stays bounded by the
  design's placement limit.
- **W6d-4 (address, detail only) [sec S1].** The detail read's client carries `address` exactly as stored (`null` when
  not given), through a detail-only client type and wire mapper. **Must not:** the list wire has no `address` key, and the
  list statements neither select nor search `a.address` (both asserted by tests). No grant changes (`SELECT` on
  `accounts` is table-wide, `0017:28`).
- **W6d-5 (privacy notice, owed) [sec S6].** The privacy notice is still a placeholder
  (`apps/web/src/account/privacy-notice-stub.tsx`). This wave records, in its commit and in plan §10, that the written
  notice must say staff see a client's profile name, phone and address with the kitchens the client sends; it does not
  claim the notice already says so.
- **W6d-6 [sec S2].** The three stale comments are rewritten to the new truth (address read on the detail only; `priced`
  yields the total, the currency and the cabinet lines).

**Verification.** The live persistence staff-reader suite against `TEST_DATABASE_URL`, run alone (WORKFLOW, *Evidence
standards*: contention first); the privilege test as the application role; `apps/web` staff tests; the security review's
report; captures of the sent copy's rows at 390 × 844.

### W6e — the summary card folds into the accordion's header (item 7b; ADR 0185 d6, Q7-4)

| Slice | Work | Files likely touched | Reading |
| --- | --- | --- | --- |
| W6e | The accordion header carries shape · walls and material · hardware · finish and the count; the differing marks move with them; the right column's summary card is removed | `staff/staff-cabinet-list.tsx`, `staff/staff-kitchen-view.tsx`, `staff/staff-kitchen-page.tsx`, `staff/staff-kitchen.module.css` | ADR 0185 d6; `staff-kitchen-view.tsx:172-452`; `staff-kitchen-page.tsx:250-330`; `Bucatarii clienti.dc.html:210`, `:214`, `:221-222` |

- **W6e-1.** Every fact the summary card showed (shape, walls, material, hardware, finish, cabinet count) is in the
  header, from `describeStaffSummaryRows` unchanged; a fact that differs between copies keeps its mark and "în varianta
  trimisă: …".
- **W6e-2.** Desktop columns: preview, link, list | profile contact, request card, price, status, the log line | notes.
  Phone order: preview, link, profile contact, request card, price, status, list, notes, log line [mock `:221-222`, with
  the request contact replaced by the profile contact per ADR 0185 d7].
- **W6e-3 (must not).** No today-priced figure beside the sent copy other than "Acum".

**QA reading:** ADR 0185 d6; `staff-kitchen-view.tsx` and its tests (`describeStaffSummaryRows`, the differing facts);
`Bucatarii clienti.dc.html:210`, `:221-222`. **Combined reviewer reading:** ADR 0185 d6; the diff; screenshots.

**Verification.** Component tests for W6e-1 and W6e-3; Playwright order check for W6e-2; captures at 390 × 844 and
1920 × 1080, sent and changed kitchens, ro and ru.

### W6f — the profile contact block, with "Sună" and "Scrie" (item 7; ADR 0185 d7; owner Q7-3)

**Owner ruling (2026-11-14, relayed).** The page already shows the client's e-mail, name and phone under "Contul
clientului · Din profil"; build the mockup's contact block from that profile data (ADR 0174 O-L3-1 (c)), not from the
request (ADR 0153 d1 kept); add "Sună" (`tel:`) and "Scrie" (`mailto:`); locality only if the profile carries it.

| Slice | Work | Files likely touched | Reading |
| --- | --- | --- | --- |
| W6f | A pure builder of the two link targets from profile values (refusing anything decision 7 refuses); the profile card becomes the contact block (first in the middle column): e-mail + "Scrie", name, phone + "neverificat" + "Sună", "Adresă / localitate" when non-null [sec N4]; accessible names through `isolated()` [sec S4]; rewrite the two "no link" comments | new `staff/contact-links.ts`, `staff/staff-kitchen-client.tsx`, `staff/staff-kitchen-page.tsx` (comment and order), `staff/staff-kitchen.module.css`; copy | ADR 0185 d7, *Must not*, *Sweep*; ADR 0153 d1; ADR 0174 O-L3-1; ADR 0179 (profile fields, one normaliser); ADR 0163 d9 and `apps/web/src/shop/shop-phone.ts` (the precedent `tel:` derivation); `configurator-domain/src/contact/phone-number.ts`; `configurator-domain/src/account/account-fields.ts:119-200`; `apps/web/src/staff/bidi-isolate.ts`; `apps/web/src/messages/ro.json:982` (`accountProfile.addressLabel`); `staff-kitchen-client.tsx`; `staff-kitchen-page.tsx:68-80`, `:282-295`; `Bucatarii clienti.dc.html:215-216` |

**QA reading:** ADR 0185 d7; `phone-number.ts` and its tests; `account-fields.ts` (`judgeAccountEmail`); `tests/staff/`
for the profile card; `engineering-conventions.md`, *Coverage an adversarial pass owes*. **Combined reviewer reading:**
ADR 0185 d7; the diff; screenshots. **Security reviewer reading:** ADR 0185 d7, *Must not* and *Security read* (S3,
S4); ADR 0153 d1; `bidi-isolate.ts`; the diff; `contact-links.ts`'s tests.

- **W6f-1 (`tel:`, property).** For any profile phone string: a "Sună" link exists iff `normalisePhoneNumber` accepts it
  and its normal form matches `^\+[1-9][0-9]{6,14}$`; then the `href` is exactly `tel:` + that normal form. Witnesses:
  "069 123 456" → `tel:+37369123456`; "+40 721 000 000" → `tel:+40721000000`; a value with letters, `;`, `,`, `?`,
  `javascript:` or a newline → no link and the phone shown as text.
- **W6f-2 (`mailto:`, property) [sec S3].** For any stored profile e-mail: a "Scrie" link exists iff the stored string
  matches `^[A-Za-z0-9._'+-]+@[A-Za-z0-9.-]+$` **and** `judgeAccountEmail(stored)` is `ok` with its judged e-mail equal
  to the stored string; then the `href` is exactly `mailto:` + the stored string — no query, no second scheme. Otherwise
  the e-mail is plain text. Witnesses: `ana.popescu@mail.md` → link; an address with `?cc=`, `%0A`, a space, a
  non-ASCII letter or a different case from what the judge returns → no link.
- **W6f-3 [sec S4].** Both actions are anchors with visible text, at least 44 × 44 px, no `target`. Accessible names:
  "Scrie la {email}" with the typed address wrapped in `isolated()`; "Sună la {phone}" with the **dialled normal form**
  (the `tel:` value), also isolated. The values themselves stay React text children (no markup built from them).
- **W6f-4 (address) [sec N4].** The row labelled "Adresă / localitate" (the profile's own wording, without the profile
  form's "(opțional)" of `accountProfile.addressLabel`) appears exactly when the profile's `address` is non-null, as
  text; never from the request.
- **W6f-5 (must not).** No request personal column is read (the wire is W6d's, unchanged here); no link for a client with
  no account (the card's "no account" sentence is unchanged); "neverificat" stays beside the phone.
- **W6f-6.** The block stands first in the middle column on desktop and after the link card on a phone (W6e-2). Captures
  at 390 × 844 and 1920 × 1080, with and without phone and locality, ro and ru.

**Verification.** Unit properties for `contact-links.ts` (W6f-1, W6f-2); component tests for W6f-3 to W6f-5; captures;
the security reviewer's report.

## 6. Risks

1. **W1 moves output of saved and sent kitchens** whose kitchen handle is `black` or `push` (corner bars painted or
   hidden, latches billed). Sent totals do not move (stored); "Acum" can. W6b's note wording covers it; W6b depends on
   W1 for that reason.
2. **W3a touches the column model.** `hasFullHeightUnder` stays current only because every `Column` reaching
   `insert-fit.ts` passes through `withCurrentFullHeightMembers` (`void-engine.ts:256-258` [src]). The new fact must take
   the same route; a second route breaks it silently. QA sabotages it both ways (R6).
3. **W2's new step** may meet typed role handling in `apps/web/src/room/generation-model.ts:140-160` and any persisted
   generation log. Stated as W2-6.
4. ~~**The tree carries uncommitted owner doc edits** (ADRs 0167, 0180 among them). The scribe's dated notes on those
   files (§10) wait until the owner's edits are committed, or are made with the owner's knowledge.~~ **Discharged
   2026-11-15:** `git status` shows no uncommitted change under `docs/decisions/` (the owner's edits went in with W0's
   commit `348a157f`, which `git log` names as the last commit to touch ADR 0167).
5. **Copy-lock and golden-hash churn** across W4-W6; serialise through the coordinator.
6. **W6d reads near a personal table, and W6f turns customer contact into links.** Security review on both; the
   statement names columns; link targets come only from the builder's refusals-first rules (W6f-1, W6f-2); `address`
   stays off the list wire (W6d-4); W6a touches the persistence statement and the wire to drop `reference`, so it gets
   a security reviewer too.
7. **Hydration.** W6a renders an origin-dependent address; see W6a-7.
8. **Interim states** (WORKFLOW, *Nothing ships mid-milestone*): after W6c and before W6d the sent copy's rows have no
   amounts; after W2 and before W3a the cabinet over the fridge is 600 deep at 600. Both are recorded interims, closed
   by the next wave.

## 7. Verification at close

- Each wave: its criteria, QA green before review, the named tier, and `pnpm format:check` whole-tree.
- Before the push: `pnpm ci:local`, quoted.
- Visual passes at 390 × 844 (priority) and desktop, ro and ru, for W1, W3b, W4, W5, W6a-W6f.
- The milestone's test audit (`docs/skills/lemnaria-test-audit/SKILL.md`), including the six corner tests rewritten in
  W1 and the two empty-slot tests rewritten in W2.

## 8. Not decided here

- Whether a cabinet over towers, pantries or the built-in fridge housing should also be generated (Q3-3).
- Splitting the price difference into "client edit" and "price change" (ADR 0185, *Alternatives*): recorded, not
  planned.

## 9. Questions only the owner can answer — answered 2026-11-14

The owner answered in chat on 2026-11-14 [owner, relayed by the coordinator]. The *Answer* column is the ruling; where it
says "default stands" the owner did not overturn the proposed default.

| # | Question | Default proposed | Answer (2026-11-14) |
| --- | --- | --- | --- |
| Q3-1 | Below a 2600 mm ceiling the opening over the fridge is cut at 2200 mm, leaving 350 mm, and no cabinet fits (measured: refused in every room from 2200 to 2500). These are the same rooms that get no top row. Accept "not placed" there, or should a lower ceiling get a shorter cabinet up to the ceiling (a change to how openings are cut, its own wave)? | Not placed, logged; nothing else changes | Answered 2026-11-14: leave empty below 2600. **Superseded 2026-11-15 on a corrected measurement** (coordinator ruling, owner told in chat the same day; ADR 0183 Amendment A): the question's premise was false — the census sampled 100 mm steps and missed 2501-2599, where the cabinet fits shortened (651-749 mm) with no §4 change. Ruling: placed wherever `insertBody` succeeds, i.e. from a 2501 mm ceiling; refused 2151-2500; no opening ≤ 2150 |
| Q3-2 | A 700 mm cabinet in a 600 mm kitchen: should it take the 700 mm depth surcharge? | No surcharge (ADR 0177 A-1 unchanged) | No surcharge (default, answered explicitly) |
| Q3-3 | Should generation also hang a cabinet over the oven tower, pantry or built-in fridge housing? | No; only the freestanding fridge | Default stands |
| Q3-4 | 700 mm leaves the fridge's door front 42 mm proud (it is 742 deep with its doors); and the cabinet is 750 mm tall, 1850-2600, so above a 2600 mm ceiling it stops at 2600 like every top-row cabinet. Both as intended? | Yes to both (the owner's 700; the module grid ends at 2600) | Default stands |
| Q4-1 | Rename the staff area's own title ("Zona personalului" in the staff pages' header) too? | No; only the menu entry | Default stands |
| Q4-2 | "Last option": last row under the two sign-out rows, with "Închide" staying as the menu's close button below? | Yes | Default stands |
| Q5-1 | The Materiale screenshot is the same complaint? And a status plus a "Dezactivează"/"Activează" button rather than the mockup's track switch? | Yes and yes (ADR 0184); the track switch is the fallback | Default stands |
| Q7-1 | Remove the request reference ("LM-…") from the staff page, as the new design does? It is the reference printed in the shop's e-mail. | Remove (ADR 0185 d2); keeping it, relabelled, is the fallback | Remove the `LM-` reference (default, answered explicitly) |
| Q7-2 | Row amounts in the cabinet list: the sent copy shows the amounts stored when it was sent; the current copy shows today's. Agreed? | Yes (ADR 0185 d4) | Default stands |
| Q7-3 | The new design shows the request's contact (name, phone, locality) and "Sună / Scrie". The application is ruled not to read a request's contact (ADR 0153 d1). Keep it that way? | Keep: not built. Changing it is a new ruling plus a security read | **Overturned.** The owner: the page already shows the client's e-mail, name and phone from the profile, so what is the difference? Build the contact block from the **account profile** (no request personal columns, ADR 0153 d1 kept), add "Sună" (`tel:`) / "Scrie" (`mailto:`), locality only if the profile carries it — ADR 0185 d7, waves W6d (locality on the wire) and W6f |
| Q7-4 | Fold the right-hand summary card into the cabinet list's header, as the new design does? | Yes (W6e) | Default stands |

## 10. Owed at close or by the scribe (not done in this planning step)

- STATUS row for M12 and the "what to do next" pointer (scribe, after W0's commit).
- Dated notes: ADR 0021 (d2 handle half superseded by 0182); ADR 0092 d3 (examples); ADR 0120's row on ADR 0021; ~~ADR
  0110 (Amendment C's fridge clause and E7's witness, by 0183); ADR 0167 (Consequences, by 0183);~~ **written
  2026-11-15 by the architect** (appended dated notes at the end of ADR 0110 and ADR 0167, carrying ADR 0183 Amendment
  A's 2501 mm boundary); ADR 0060 and ADR 0101 (the third arm); ADR 0174 O-L3-1 (reference removed by owner Q7-1; profile contact extended with links by Q7-3, ADR 0185 d2
  and d7); ADR 0180 (the link card); ADR 0104 amendment and `docs/design/README.md` dated notes for the departures from
  frames Lot 2 `STAFF` (item 4), D4B (item 5) and S3 v3 (contact block sourced from the profile, not the request; route
  address).
- ADR 0185: Accepted after the security read of 2026-11-14 (done; recorded in the ADR). Index row owed.
- Dated notes from the security read [sec S2]: ADR 0173 (`:64`, the postal address on the staff profile block,
  superseded by owner Q7-3); ADR 0178 F2 (its `priced` column now also yields per-cabinet lines on the detail read).
- Launch item [sec S6]: the written privacy notice must say staff see a client's profile name, phone and address with
  the kitchens the client sends (the notice is a placeholder today).
- ADR 0101 d4: dated note (byte identity at 600 superseded for `p24` only).
- Backlog (2026-11-15): replacing a generated fridge with a tower or a pantry is refused while the cabinet hangs over it
  (ADR 0183 Amendment A).
- Backlog: `generateKitchen` throws for U rooms at a 2000 mm ceiling at `HEAD` (*"a U's hob has no hood over it"*),
  measured 25 of 25 U rooms on the architect's grid on 2026-11-14; outside M12.
- M11 plan: W5 marked discharged by the v3 mockup (the scribe confirms with the coordinator).
- Decisions index rows 0182-0185.
