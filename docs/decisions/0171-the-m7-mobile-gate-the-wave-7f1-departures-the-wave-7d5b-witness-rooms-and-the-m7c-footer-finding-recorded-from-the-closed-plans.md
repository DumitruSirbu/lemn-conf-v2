# ADR 0171 — The M7 mobile gate, the wave 7F1 departures, the wave 7D5b witness rooms and the M7C footer finding, recorded from the closed plans

Status: Accepted (the 7K gate, the 7F1 departures and the 7D5b witnesses shipped per their close-outs); one criterion the footer test cites (C1 criterion 1, the 1 px / three-viewport tolerance) is **not recorded in any plan** and is carried here only as the test's own statement, labelled as such
Date: 2026-10-18
Type: Finding (recovered criteria; no behaviour changes)
Milestone: M7 (waves 7K, 7F1, 7D5b) and M7C (wave C1 S1), archived in `docs/milestones/done/`; filed under ADR 0136 decision 3

**Why this record exists.** Four code or test comments cite a wave's plan for a gate, a departure list or a
set of witness rooms that no ADR records. The owner's rule is that a code comment cites an ADR, never a
milestone plan. Cite as `see ADR 0171 7K D5`, `see ADR 0171 7F1 departures`, `see ADR 0171 7D5b E4`,
`see ADR 0171 FB-009`. Every anchor starts with its wave.

**Evidence tier.** **Doc-quoted** (quoted or condensed) from `docs/milestones/done/M7-room-and-presets.md`,
`docs/milestones/done/M7C-m7-feedback-fixes.md` and `docs/archive/M7-FEEDBACK.md`, read on 2026-10-18.
Figures from the 7D5b plan are **that plan's planning measurements** (taken by its scratch build at
`dd7a25b`, per the plan), not re-measured for this record. Where a neighbouring ADR already holds the same
content, this record cites it instead of restating it. No criterion was edited.

**Shipped (doc-quoted).** 7K: *"DONE 2026-09-28. Commits: plan `d0a21a2`; S0-S2 implementation `d841d9a`;
review fixes `daea173`"*. 7F1: *"7F1 close-out — 2026-09-14, `5d2ff54` + `852df10`"*. 7D5b: *"DONE. Commits,
in order: plan + Amendment M `acb7b6f`; S0 `c0018ef`; S0b `4e88ae0`; S1 `f116b1c`; S2 `09cea46`; SW
`f6e3730`"*. M7C C1 S1: *"Done, `8269440`"*.

## 7K — the M7 mobile gate (wave 7K, planned 2026-09-28)

*Cited by:* `apps/web/tests/e2e/mobile-gate.e2e.spec.ts:1-20` (the header cites §3, G3, G6, G16, D2, D5, D7 and
D10; `:55` cites criterion 6).

**Why this record arrives late (doc-quoted, 7K §7).** *"**No ADR is written for 7K.** Its decisions are test
structure inside a charter the milestone already set, and D2 is a consequence of rulings already recorded.
**Flagged for the coordinator, not blocking:** the preset story's deferral past M8 (2026-09-15, 2026-09-22)
exists **only in this milestone file and `STATUS.md`** … when M7 is archived, the reason must survive in
`docs/decisions/`."* The deferral is now [ADR 0131](0131-the-preset-story-is-deferred-past-m8-and-every-room-goes-from-its-dimensions-straight-to-composition.md).

**7K goal (doc-quoted).** Prove, on the `mobile` Playwright project at 390 × 844 and **by touch**, that a
customer can walk every Step-1 state the product draws into the editor at `/d/{id}`, leave it by every Back
the product offers, reload at every addressable state, and come back, and that nothing is written, lost or
duplicated on the way. A test-writing wave: no production file changes.

### 7K §3 — the gate manifest

The M7 mobile gate is the manifest: four specs earlier waves wrote and 7K inherits unchanged, plus one new
spec.

| Spec | What it gates | Written by |
| --- | --- | --- |
| `room-to-editor.qa.e2e.spec.ts` | L, `ro`, by mouse: 1A → 1F → editor → *‹ Cameră* → 1D refilled | 7F4b (criterion 44) |
| `room-traversal.qa.e2e.spec.ts` | *Înapoi* and browser Back/Forward inside Step 1; the I5 flush | 7F1-D45 (criterion 23) |
| `linear-flow.e2e.spec.ts` + `support/linear-flow.ts` | the straight kitchen: reload at 1D and `/d/{id}`, back link, share view | 7J (A16) |
| `mirror-real-flow.e2e.spec.ts` + `support/mirror-flow.ts` | the right-hand L: reflection, reload, back link, share view | 7I (A17) |
| **`mobile-gate.e2e.spec.ts`** (new) | by touch: 1C typed and corrected, reloads at 1A to 1D, the round trip, the editor touched, browser Back/Forward from the editor, re-compose, resume, leaving 1F mid-write, Russian | 7K |

### 7K G3 — the preset story is past M8

*"The preset story is past M8 — 7P1, 7P2, 7G, 7B, 7C (coordinator 2026-09-15) and 7F3 (coordinator
2026-09-22) … Consequently no preset list, card, *Folosește* or save-as-preset control exists."* (The plan
read this at `642ce47`; at that commit `git grep` for `preset-authoring`, `saveAsPreset`, `save-as-preset`
over `apps/web/src` returned nothing.)

> **Drift note, 2026-10-18 (nothing struck).** The preset story has since been revived: the recent commits on
> this branch ("M8C P4 … Save-as-preset button", "M8C P7 … Step 1 fetches presets") build it. G3 describes
> the product at `642ce47`, and the header of `mobile-gate.e2e.spec.ts` still says what it says; I did not
> read whether the gate has been re-scoped.

### 7K G6 — none of the inherited journeys is driven by touch

Counted in the tree at `642ce47` (plan, `grep`): `.tap(`/`touchscreen` occurrences were 0 in `room-to-editor`,
`room-traversal`, `linear-flow.ts` and `mirror-flow.ts`. Under the `mobile` project, which sets `hasTouch` and
`isMobile`, `.click()` dispatches mouse events, not a touch sequence. *"No Step-1 journey has ever been walked
by touch in the suite."* The precedent that tap and click differ in this product is
[ADR 0023](0023-touch-compatibility-clicks-reach-the-sheet.md) (G7).

### 7K G16 — ADR 0105's figures are pre-M7, and local runs serve `next dev`

*"ADR 0105's figures are pre-M7: mobile leg 120 tests in 28.6 minutes on the runner (2026-09-10); ceiling
**45 per leg** (`ci.yml:265`). … **No `ci.yml` run has ever executed on this branch** … Local runs serve
`next dev`, not a build."* Hence the header's *"CI is the verdict. Locally the suite serves `next dev`, not a
build (G16)."*

### 7K D1 to D12 — decisions (condensed)

- **D1.** "All six states", at HEAD then, are 1A, 1B, 1C, 1D, 1F and the editor. Frame 1D's skeletons and 1E's
  list are not drawn, so the gate asserts the marker 1D as the product draws it and the absence of a state
  between 1D and 1F. A gate that passes over a surface that does not exist is the vacuous guard
  `engineering-conventions.md` forbids.
- **D2.** *"The preset arm leaves 7K by derivation, not by choice."* Out: 1E, *Folosește*, the card's price
  equalling the editor's, the evaluated-design round trip **on a preset**, and the save-as-preset absence
  sweep (AU12). None is written as an assertion against an absent control. The evaluated-design round trip is
  **not** dropped: it is asserted on the **composed** design (D7), the only design Step 1 creates today.
- **D3.** Inherit, do not rewrite the four specs in §3. Rejected: converting their `.click()` to `.tap()`.
- **D4.** One new spec and one support module (`mobile-gate.e2e.spec.ts`, `support/step-one-by-touch.ts`);
  the support module carries navigation and readout helpers only, every assertion stays in the spec.
- **D5.** *"'By touch' is a rule on the new spec, not a style."* Every control is activated with
  `locator.tap()` or `page.touchscreen.tap()`; digits are typed with `pressSequentially`. **No `.click()`, no
  `page.mouse`, no `fill` over a length, and no `goto` to a room query** — every state is reached from the one
  before it. The only navigations not caused by a tap are `reload()`, `goBack()`/`goForward()`, and `goto` of
  the entry routes `/ro` and `/ro/configurator/configure`, or of a design's own `/d/{id}`.
- **D6.** Shapes and locales: L runs the full journey twice, `{ro, left}` and `{ru, right}` (the right-hand
  case is the round trip's discriminating case, ADR 0121); the straight kitchen a targeted journey in `ro`;
  U gets one tap at 1A.
- **D7.** *"The round trip's oracle."* The test captures the **real** `PUT /api/designs/{id}` body the browser
  sent (`page.on("request")`, observation only) and reads `GET /api/designs/{id}` from the same browser; the
  two deep-equal. Independent of both: the stored `room` equals the millimetres typed (for the straight room,
  `depthMm` equals ADR 0130 D3's 3400, a named test constant, never imported from the domain), `presetId` is
  `null`, and `room.cornerDirection` is present **iff** the case is right-hand. Rejected: recomputing
  `generateKitchen` inside the Playwright worker (a second authority on geometry).
- **D8.** Every Back, and one new witness: (a) *‹ Cameră* → 1D refilled; (b) browser Back from the editor →
  the form, no `POST`; (c) choosing again after Back → one more `POST`, a new id, the first still opens; (d)
  resume lands on the newest composed design; (e) leaving 1F mid-write, the in-flight precondition asserted,
  never assumed.
- **D9.** The editor end is touched: a base-row body chosen from the scene readout, tapped on the
  touchscreen, selection asserted, no `PUT` follows. Never a stored pixel constant.
- **D10.** *"A defect the gate finds is a finding, not a test edit."* The failing test stays red and
  unweakened; the implementer stops and reports; the coordinator dispatches the product fix separately.
  `test.fail` only with a named wave owing the flip.
- **D11.** ADR 0105's measurement is local, and says so; no local figure is scaled into a runner projection.
- **D12.** The visual gate is a verifier's walk in a production build at 390 × 844, captures outside the tree.

### 7K A1 to A20 — acceptance criteria (condensed; "criterion N" in the spec means A-N)

1. By touch, and nothing but (grep finds no `.click(`, `page.mouse`, `.fill(` on a length field, or `goto` of
   a room query). 2. 1A: U refused, L enabled; reload with a card chosen gives no card chosen. 3. 1B: pill at
   step 1 of 4; the corner toggle drives `direction`; reload refills the settled field. 4. 1C typed and
   corrected: wall A at 899 (minimum 900, ADR 0125) → 1C; reload keeps it; re-typed by keyboard → 1D; never by
   `goto`. 5. 1D, nothing persisted before it is left: zero `POST` and zero `PUT` from the first tap to
   *Continuă*, every reload included. 6. **1D → 1F → editor, with no screen between:** one tap on *Continuă*
   at 1D → `room-compose` visible, then `/{locale}/d/{id}` with no query string; no other pathname committed
   between; **exactly one `POST`**; the editor's pill at step 2; `data-design-id` equals the URL's id;
   `room-compose-dropped` absent. 7. The round trip (D7). 8. Reload on `/d/{id}` → same
   `data-design-id`, no `POST`. 9. The editor touched (D9). 10. *‹ Cameră* tapped → 1D. 11. Browser Back from
   the editor → the form, not 1F, no `POST`; Forward → same `/d/{id}`. 12. Choosing again after Back → one
   more `POST`, a different id, the first id still opens (ADR 0111 decision 5). 13. Resume lands on the
   newest composed design. 14. Leaving 1F mid-write under network emulation, precondition asserted. 15. The
   straight kitchen in `ro` (wall A at 1199, minimum 1200, ADR 0108 Amendment G; `depthMm` 3400; no
   `cornerDirection`). 16. Hygiene: zero `pageerror`; every minted id deleted in `afterAll` (ADR 0006). 17.
   The gate bites: named sabotages redden named criteria. 18. Scope: only the two new test files and
   documents change; the four inherited specs are byte-identical. 19. ADR 0105 figures quoted, runner figure
   stated outstanding. 20. The visual gate; what cannot be verified is stated (at minimum real hardware
   touch).

**7K close-out (doc-quoted).** *"One new spec of 5 tests plus one support module"*; *"Final `pnpm ci:local`
at `daea173`: ALL GATES GREEN — … e2e 451 passed (2 skipped, up from 446 pre-wave …)"*; Q-7K-1 (real-hardware
walk) answered no by the owner. *"Not verified"*: real touch-versus-click divergence on actual hardware.

## 7F1 departures — *Departures from frames 1A and 1B*

*Cited by:* `apps/web/src/room/room.module.css:5`, whose comment names the section by its title.

**The one departure (doc-quoted, owner-ruled 2026-09-14, R4).** *"The owner's F8 ruling says 'use the design
that was proposed'. This plan departs from the frames in exactly one place … Anything else that differs from
frame 1A or 1B is a defect in the implementation."* The departure is **the plan preview's scale** (criterion
12): the frame draws the two walls at two different scales; the plan draws one isotropic scale, so a 6,0 ×
1,0 m room is not drawn as a square. *"It stays listed here as a departure, because that is still what a
reviewer comparing the screen against frame 1B will see"*; the visual verifier still reports it and the
close-out still names it. Everything else about the preview card (its box, uppercase caption, wall labels)
follows the frame. The ruling's own record is [ADR 0139](0139-the-room-screens-routing-generation-and-back-guard-reasons-recovered-from-code-comments.md)
decision 7. The scale arithmetic stays inside one function, `isotropicScalePxPerMm`, whose purpose changed
from isolation against a pending reversal to clarity and criterion 12's ratio property.

**Two things that differ from the frame's markup and are not departures (doc-quoted):**
- The length fields are real `<input>` elements (criterion 5), where the frame draws a `<span class="num">`
  inside a styled box; the box, height, inline *m* and tabular numerals are the frame's.
- *Continuă* is a real `<button>`, where the frame draws a `<div>`. ADR 0104 decision 6 requires a `div` for
  a control **wired to nothing**; *Continuă* is wired.

**Amended 2026-09-14 (Q-D45-5, coordinator's ruling, doc-quoted).** *The `<button>` stays, and the reason
above is only half of it.* *Continuă* at 1B does nothing observable once every field parses, because the
canonical query already is the URL and the router declines a push to the URL already showing; step 2 is
7F4's. *"For the visual verifier: this tap is expected to do nothing, and it must not be filed as a defect."*
The same plan section records, source-verified at the time, that the tap minted nothing before R9 and mints
nothing after (`app-router.js:59-61`, `:268-282`).

**Also doc-quoted from 7F2's carry-forward:** *Must not: remove a control 7F1 shipped, because frame 1C does
not draw it* — *"A static mockup omitting a control is not an instruction to remove it"*; ADR 0104 decision 1:
*"A frame is silent about behaviour it does not draw."*

> **Drift note, 2026-10-18 (nothing struck).** The preset chooser's frames 1E and D1E have since been departed
> from by [ADR 0104](0104-the-mockups-are-the-chrome-specification-and-the-strips-own-row-is-withdrawn.md)
> Amendment F (2026-10-17). That is a different frame pair and is not part of "frames 1A and 1B".

## 7D5b — the plan's witness rooms E2 to E7

*Cited by:* `packages/configurator-domain/tests/generation/qa-7d5b-s0-pre-state-witnesses.test.ts:4` (*"the
plan's witness rooms … E2-E7"*).

The owner rulings of 2026-09-21 that these rooms illustrate (Q-DW1/2/3, the drawer "beside the sink", tower
over bottle narrowed, at least one oven, across the corner) are recorded as **Amendment M (M1 to M16)** of
[ADR 0110](0110-generation-inserts-through-the-command-path-and-the-corner-is-structural-data.md); this
section records only the **rooms** and what each is a witness of. Figures are the plan's planning
measurements, over the approved L rectangle at 10 mm.

| Plan item | Witness room (width × depth, mm) | What it witnesses (plan) |
| --- | --- | --- |
| **7D5b E2** (M1, a door cabinet already beside the sink) | **2100 × 2200** | the 1,055 rooms where it stands on the sink's own wall |
| | **1500 × 2800** | the 140,206 rooms where it stands across the corner |
| | **1500 × 3500** | the 5,120 rooms where a door cabinet exists but is not beside the sink; M1 must not convert them |
| **7D5b E3** (dishwasher first) | **4600 × 5200** | after the hob, `threshold | tower | pantry` becomes `tower | pantry | pantry` |
| | **4600 × 5800** | the bottle returns |
| **7D5b E4** (free-end resize path) | **1510 × 2800** | the 1,260 rooms where an M1 conversion lands on the last base of its wall with a 1 to 200 mm remainder; `base-dishwasher` is discrete (`{450, 600}`) and never enters the free-end resize branch |
| **7D5b E5** (the quote) | none | `base-cabinet` at 600 mm: **396 000 minor**; `base-dishwasher` at 600 mm: **320 000 minor** (both `[source-verified]` in the plan) |
| **7D5b E6** ((e), the drawer swap) | **900 × 3400** | 24,100 rooms with two drawer cabinets |
| | **6000 × 1700** | 60 rooms with three |
| **7D5b E7** (S0b, the tower over the bottle) | **3560 × 2920** (the reference room) | wall A ends `hob-oven · bottle [2700, 3000] · 560 mm bare` at HEAD, `hob-2drawer · oven tower [2700, 3300] · 260 mm bare` after S0b |
| | **900 × 4100** | `hob-oven · bottle · 300 mm bare` at HEAD, `hob-2drawer · tower · 0` after S0b; in 2,600 of S0b's 5,260 rooms (c) later takes the tower S0b kept (plan, E7) |
| | **900 × 4410** | the 11,240 rooms where the bottle also carried a pan drawer keep *pan drawer · hob-with-oven · bottle*, as at HEAD |

*Plan wording to keep with the E5 row (doc-quoted):* an M1 conversion is −76 000 minor *[inference,
arithmetic]* except in the 1,260 merge rooms and the 10,070 re-planned rooms; two close-out claims would be
wrong: *"+320 000 per kitchen"* and *"−76 000 per converted kitchen"*.

**Which E-items the test header names.** It cites witnesses for E2, E4, E6, E7 and E3 ("where the door cabinet
beside the sink stands (E2, E4), which drawer cabinets stand (E6), what S1's bottle cost (E7) and where the
threshold drawer stands (E3)") and E5's two prices; the rooms in the table are the plan's, and the test
header does not list the room dimensions itself beyond those it restates (900 x 4100, 4650 x 1000, 1500 x
3500, 2100 x 2200, 1500 x 2800, 1510 x 2800, 900 x 3400, 6000 x 1700, 4600 x 5200, 4600 x 5800).

**What the test restates (source-verified, header read 2026-10-18).** The test file says S0b, S1 and S2 move
some of these witnesses, so their HEAD shape is read from recordings (`7d5b-pre-tower-baseline.json`,
captured at `acb7b6f`) or from the planner with later slices switched off; the room-level evidence sits beside
`qa-7d5b-s0-pre-state-census.adversarial.test.ts`.

**7D5b close-out (doc-quoted).** The visual gate's seven witness rooms (390 × 844, touch) all passed:
reference 3560 × 2920; 1500 × 2800 across the corner; (e) 900 × 3400; (c) 4650 × 1000 with 350 mm bare; (b)
900 × 5000; (d) 900 × 4700; none 1500 × 3500. The final measured composition in the close-out table is the
plan's E1 "Final" column (e.g. dishwashers 196,621; threshold drawers 5,725), measured by S2 and quoted
there; this record does not restate it as re-measured.

## M7C C1 S1 — the desktop footer finding (FB-009)

*Cited by:* `apps/web/tests/e2e/qa-m7c-c1-footer-centring.adversarial.desktop.e2e.spec.ts:2`.

**FB-009 (doc-quoted, `docs/archive/M7-FEEDBACK.md`).** *Room step (1/4) / footer layout:* the reporter's text
is *"The 'Înapoi' button in the footer is not vertically centered; it should be centered vertically."*
Priority P2; status *Fixed (`8269440`)*. The reporter's detail: a box around "Înapoi" with the annotation
*"center button vertically"*; whether "Continuă" shares the issue is not stated. **FB-007** (same screenshot
family): *"The 'Continuă' button is not centered."*

**Triage (doc-quoted).** M7C plan, triage rows 007 and 009: *"Defect against the mockup. Desktop footer
lacked the frame's `align-items:center`. **Fixed, `8269440`.**"* and *"Same cause as 007, a second rule.
**Fixed, `8269440`.**"* Triage note in `M7-FEEDBACK.md`: *"Vertical centring is missing against the desktop
mockup. The button stays on the right, as the mockup draws it."* The wave table row: *"S1 … Done, `8269440`.
Desktop footers centred vertically (FB-007, FB-009)."* The row's reading cell and file list are `—`.

**C1 criterion 1 — NOT LOCATED in any plan.** The test's header attributes to *"criterion 1 (`M7C-m7-feedback-fixes.md`,
*C1*)"* a tolerance (*"at 1280, 1440 and 1920 px wide, in 1A, 1B, 1C and 1F, each footer control's vertical
centre is within 1 px of the footer's. Must not: any phone footer rule changes; a control moves
horizontally"*). A grep of the M7C plan, `M7-FEEDBACK.md`, `STATUS-history.md` and `docs/backlog/` for that
text found **no plan criterion** (the M7C *Criteria* that the plan numbers for C1 begin at "3." for slice S3).
It is therefore carried here only as **the test's own statement, recovered from the test comment on
2026-10-18, not a plan quote and not re-measured**. If the owner wants the tolerance to be a recorded
criterion, that is a decision for them; this record does not make it one.

**Related (doc-quoted, `docs/backlog/open.md:2137`).** The review of C1 S1 (`8269440`) *centred the footer
controls and left these* … — read the backlog entry for what it left; this record does not carry it.

## Consequences

- A comment that needs these criteria cites `ADR 0171` with a wave-prefixed anchor: *7K §3*, *7K G3*, *7K G6*,
  *7K G16*, *7K D2*, *7K D5*, *7K D7*, *7K D10*, *7K A6*, *7F1 departures*, *7D5b E2* to *E7*, *FB-009*.
- The plans stay archived. The 7K G3 drift note matters most: the gate's text predates the revived preset
  story and the next wave that touches `mobile-gate.e2e.spec.ts` should say whether D2's absences still hold.
