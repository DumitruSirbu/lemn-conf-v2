# Milestone 7 — Feedback log (U-shaped rooms and related)

Raw feedback on Milestone 7, including U-shaped rooms, recorded as reported. **Record only**: no
analysis, no root cause, no fix. Triage (review, priority, owner) happens afterwards.

Started 2026-10-01 on branch `m7b-u-shaped-rooms`.

## How to read this file

- **ID** — `M7-FB-NNN`, assigned in order, never reused or renumbered.
- **Status** — `New` (recorded, untriaged) · `Triaged` · `Planned` · `In progress` · `Fixed` ·
  `Won't fix` · `Duplicate`.
- **Priority** — `—` until triage assigns one (`P0` blocker · `P1` high · `P2` medium · `P3` low).
- **Evidence** — screenshot path or description, as supplied by the reporter.

## Issues

| ID | Area | Report | Evidence | Priority | Status |
| -- | ---- | ------ | -------- | -------- | ------ |
| M7-FB-001 | Navigation / room setup | After reaching step 2 (the 3D configuration), there is no way back to edit the room or wall sizes. Opening the base URL redirects straight to the existing kitchen, so a new kitchen can't be started. | None | P1 | Planned |
| M7-FB-002 | Configuration step (2/4) header | The "Verifică designul" button does nothing when clicked (dead button). Its intended goal needs checking. | [M7-FB-002.png](M7-FEEDBACK-assets/M7-FB-002.png) | P3 | Planned |
| M7-FB-003 | U-shape / wall (upper) cabinets | Wall (top) cabinets are missing from the U-shaped kitchen. They should be present. Default: cabinet without handles (push-to-open). Reporter considers adding them not hard. | [overview](M7-FEEDBACK-assets/M7-FB-003-005-u-shape-overview.png) | P1 | Planned |
| M7-FB-004 | U-shape / corner cabinets | Corner cabinets are missing: the middle (base) one and the top (wall) one. Reporter thinks the L-shape approach can be reused for U-shape. The kitchen looks incomplete without them; reporter wants a complete kitchen. Reporter marks this the most important item. | [overview](M7-FEEDBACK-assets/M7-FB-003-005-u-shape-overview.png) | P0 | Planned |
| M7-FB-005 | U-shape / back wall (A) content | Reporter specified that the back wall (wall A) of a U-shape holds only base cabinets, but the result also shows middle-level (wall) cabinets there. Question: when is it base-only, does a wider wall change that, and is this request taken into account at all? | [overview](M7-FEEDBACK-assets/M7-FB-003-005-u-shape-overview.png) | P1 | Won't fix |
| M7-FB-006 | U-shape / corner cabinet alignment | Corner cabinets are not aligned with the neighbouring cabinets: they sit slightly behind, both the worktop and the cabinet front, so the fronts are not on one line. Reporter believes earlier milestones already mentioned this and wants it fixed. | [M7-FB-006.png](M7-FEEDBACK-assets/M7-FB-006.png) | P1 | Fixed (`c4eeea6`, `48bbc0c`) |
| M7-FB-007 | Room step (1/4) / layout | The "Continuă" button is not centered. | [M7-FB-007.png](M7-FEEDBACK-assets/M7-FB-007.png) | P2 | Fixed (`8269440`) |
| M7-FB-008 | Room step (1/4) / L-shape copy + i18n | The L-shape question "Încotro merge cotul?" (hint "nu se deduce din lățimi") should be reworded, and all translations updated to mean the same. New text: "În care parte se află colțul bucătăriei?" | [M7-FB-008.png](M7-FEEDBACK-assets/M7-FB-008.png) | P3 | Fixed (`21c702b`) |
| M7-FB-009 | Room step (1/4) / footer layout | The "Înapoi" button in the footer is not vertically centered; it should be centered vertically. | [M7-FB-008.png](M7-FEEDBACK-assets/M7-FB-008.png) | P2 | Fixed (`8269440`) |
| M7-FB-010 | Layout generation / leftover gap beside fixed-size units | A small leftover gap (under ~250–300 mm) next to the fridge is left empty. The reporter had to remove the fridge, widen the neighbouring cabinet (600 → 750 mm), and re-add the fridge; a first-time user would not know to do that. Wanted: the generator automatically gives the leftover space to the cabinet nearest the edge beside the fridge (fridge and embedded fridge are fixed size), in 50 mm steps as far as the gap allows (e.g. 150 or 200 mm of a 200–250 mm gap). Goal: minimum manual manipulation. Reporter also asks how hard resizing without removing the fridge would be. | [M7-FB-010.png](M7-FEEDBACK-assets/M7-FB-010.png) | P2 | Planned |
| M7-FB-011 | L-shape / corner cabinet structure | The L-shape corner cabinet, the middle one, is not done properly compared with the earlier mock (the generator it was based on). Expected: the corner is a corner unit from base to top. The other cabinets are then aligned relative to the corner cabinet. Reporter's idea: remove the middle part of the corner cabinet and put a two-door cabinet there; open question: how a two-door cabinet in the corner would open, which suggests a corner cabinet is needed as well. Reporter notes many issues seem to come from the corner cabinets. | None | P1 | Planned |
| M7-FB-012 | CI / e2e on the runner | The e2e tests are red on `main` and need checking and fixing: CI run 36841795476. | [CI run 36841795476](https://github.com/DumitruSirbu/lemn-conf-v2/actions/runs/36841795476) | P1 | Planned |

<!-- Next row: M7-FB-013 -->


## Triage — 2026-10-01

Done by the architect. The plan is `docs/milestones/M7C-m7-feedback-fixes.md`; its *Triage* table carries
the classification and the evidence for each item. The reporter's text above and below is unchanged.

| ID | Triage note | Owner |
| -- | ----------- | ----- |
| M7-FB-001 | Desktop only: both back links are hidden from 900 px. A phone has the link. Going back keeps the old kitchen and makes a new one (ADR 0111); until M8 the old one opens only from its own link. Several kitchens is M8's profile dashboard (ADR 0115). Every edit is already saved. The owner asked for a confirmation with a warning on both phone and desktop; keeping the edits across a room change is recorded for the backlog. The warning's wording is the owner's, approved 2026-10-01. | M7C wave C1 S3 |
| M7-FB-002 | A named interim: drawn inert until the review screen exists (ADR 0104 decision 6). | M8 |
| M7-FB-003 | Read as the top row (2200–2600). Generation skips it in every shape, by the owner's ruling of 2026-09-14 (ADR 0110 E11). Changing it overturns that ruling. The owner withdrew that ruling on 2026-10-01: a top row is generated. | M7C wave C3, after C2 |
| M7-FB-004 | Read as the wall-row and top-row stretch of wall A above each corner base, which generation leaves empty on purpose. The base corner units and the side-wall corner cabinets are generated. The owner asked for a fixed, non-editable corner unit covering the whole corner (2026-10-01). | M7C wave C2 |
| M7-FB-005 | The request was recorded with a size threshold: base-only when the three walls total 10 m or more (ADR 0110 N1.3). The owner confirmed the room was under 10 m and kept the rule, so the output conformed. | No change |
| M7-FB-006 | No record names this setback. Measured by C0, confirmed by QA: the side-wall corner piece is behind its neighbour, worktop 20 mm, and its doorless front 8–10 mm behind the neighbour's door, at 600 and 700; the back-wall corner cabinet is 10 mm in front. The screenshot is reproduced for the side-wall pieces. The owner chose one line for everything, and to move the joint between the two corner pieces (2026-10-01). | M7C wave C4 |
| M7-FB-007 | Vertical centring is missing against the desktop mockup. The button stays on the right, as the mockup draws it. | M7C wave C1 S1 |
| M7-FB-008 | Romanian as given. The Russian question and its two answers change together and are a draft for the owner to read. Approved by the owner 2026-10-01. | M7C wave C1 S2 |
| M7-FB-009 | Same cause as M7-FB-007, in a second rule. | M7C wave C1 S1 |
| M7-FB-010 | The generator half is planned. The editor half (resize through the fridge) is a rejected direction in the design reference and is not built without the owner's word. The owner chose the generator half, gaps under 300 mm (2026-10-01); the editor half goes to the backlog. | M7C wave C5 |
| M7-FB-011 | The same gap as M7-FB-004, on the L. "The earlier mock" is read as the reference L kitchen, which has wall cabinets over the corner base. The owner asked for a fixed, non-editable corner unit covering the whole corner (2026-10-01). | M7C wave C2 |
| M7-FB-012 | Nine tests fail across six of seven e2e shards on `main` at `2615b51`; nothing was re-run and no cause is established. Re-run and grouped first, then fixed per group. M7C's phase gate needs a green runner. | M7C wave CE |

## Details

Longer descriptions, reproduction steps and screenshots for entries that do not fit a table row go
here under a heading per ID (`### M7-FB-NNN`).

### M7-FB-001

Reporter's observations, as given:

- Minimum need: be able to go back from the 3D configuration step and edit the room / wall sizes.
- The base URL always redirects to the initial kitchen, so there is no way to generate another one.
- Idea A: a button that starts a new kitchen from scratch. It would discard the current kitchen, with
  a warning message that the current kitchen will be lost.
- Idea B: keep multiple kitchens per user.
- Idea C: autosave, so the user can return and edit room and wall sizes.
- To check against the requirements before deciding. Reporter is unsure which idea is right.

### M7-FB-002

Screenshot of the step 2/4 "Configurare" header (RO locale; PAL melaminat, Stejar Bardolino Natur,
Feronerie Standard, Adâncime 700; "de la 82 000 MDL"). The reporter's annotation on the
"Verifică designul" button: "button is dead, clicking on it didn't do anything, need to check what is
its goal".

### M7-FB-003 to M7-FB-005

One screenshot, "Vedere generală" of a U-shaped kitchen (step 2/4, RO locale). The reporter called
this the longest feedback and suggested it may be split; it is recorded as three entries. In the
image, the left and right wall runs show blue dashed placeholder volumes where wall cabinets would
sit, and the back wall (A) shows wall-level cabinets above the sink. No base corner units are visible
at the two corners, and the near-left end shows an empty dashed volume.

### M7-FB-006

Top-down close-up with the sink base cabinet ("Dulap spălător", Perete A) selected. The reporter
boxed the two corners of the cabinet run in black: at both, the corner unit's front and worktop edge
are visibly set back from the adjoining cabinets. Reporter recalls earlier milestones mentioning this
(not verified here).

### M7-FB-007

Step 1/4 "Cameră" ("Ce formă are camera?", Liniară / În formă de L / În formă de U, desktop width).
The reporter's annotation points at the disabled "Continuă" button in the bottom-right corner:
"button is not centered". The reporter did not say where it should sit; centered horizontally in the
footer is the literal reading of the annotation.

### M7-FB-008 and M7-FB-009

One screenshot of step 1/4 with "În L" selected (corner "La dreapta", Perete A 3000 mm, Perete B
5000 mm, height 2900 mm, top-down preview). Two annotations:

- M7-FB-008: arrow at the "Încotro merge cotul?" label: "Change text and automatically translations
  to mean same. New text : In care parte se afla coltul bucatariei?" The proposed text is quoted
  without diacritics as written; the table entry restores them.
- M7-FB-009: box around the "Înapoi" button: "center button vertically". The same screenshot shows
  "Continuă" on the right; whether it shares the issue is not stated.

### M7-FB-010

L-shaped kitchen, white PAL melaminat, depth 600, "Dulap bază 2 uși" selected on Perete A (red
outline), with a fridge column to its left. The "Lățime" section of the panel shows −50 mm, 750 mm,
and a greyed +50 mm with the explanation that "Dulap bază" cannot reach 800 mm: the column would need
50 mm more, but there is no free space on the left, and none on the right. Reporter's annotation,
verbatim: "so initially the selected cabinet was 600mm wide, meaning the left place after the fridge
was 200mm. In order to be able to resize the selected cabinet I need to remove the fridge, resize
selected cabinet and add fridge back. How hard will be to make resizable the selected cabinet
without removing the fridge so it will took from the empty place? And most important I want that on
this particular scenarios the selected cabinet automatically to take maximum possible width from
remained space. For example like here the 150mm were able to be added to 600mm 2 door cabinet. This
should work if empty space that remains is less than 250 mm". 

Clarification from the reporter (follow-up message): the 750 mm shown is correct. The cabinet was
initially 600 mm; the reporter removed the fridge, resized the cabinet from 600 to 750 mm, then added
the fridge back. The reporter also said "it shows 450 after I do this resize"; what that figure
refers to was not stated. The real request is not the manual resize but that the generator does it
automatically: when a small gap remains (reporter's figures: 250 mm, "not more than 300 mm"), take it
and add it to the cabinet closest to the edge, next to the fridge, because the fridge (and the
embedded fridge) is a fixed size. Since width changes only in 50 mm steps, add as much as fits, e.g.
150 or 200 mm. Intent: "minimum manipulations from the user's end"; a first-time user has no idea
they must remove the fridge, resize and add it back, and the reporter asks why the algorithm can't
do it.

### M7-FB-011

Voice-style feedback with no screenshot. Points to carry into triage:

- "The middle one" is not defined in the message; elsewhere (M7-FB-004) the reporter lists middle and
  top corner cabinets as missing in the U-shape. Which level is meant here is unconfirmed.
- Related to M7-FB-004 (missing U-shape corner cabinets) and M7-FB-006 (corner alignment). The
  reporter links them: "a lot of issues came from these corner cabinets".
- "The earlier mock" is not identified by file; `docs/design/mockups/` is the likely place but is not
  checked here.
- The suggestion to drop the middle part of the corner cabinet and fill it with a two-door cabinet is
  an idea, not a decision; the reporter raised the opening problem against it and left it open.

### M7-FB-012

Reporter's words, 2026-10-01: *"add to backlog to check and fix e2e tests
https://github.com/DumitruSirbu/lemn-conf-v2/actions/runs/36841795476"*, then *"sorry not backend but
milestone feedback"*. First filed by the coordinator as backlog entry 103 and withdrawn on that
correction; recorded here instead.

The run is the `push` run on `main` at `2615b51` (the merge of pull request 9, M7B). Every non-e2e job is
green; `e2e shard (mobile) (1, 4)` is the only green shard.

**What the run's log shows** (the coordinator's reading with `gh run view --log-failed`, 2026-10-01;
nothing was re-run and no cause is established):

| Shard | Result | Failed test |
| --- | --- | --- |
| desktop 1/3 | 2 failed, 61 passed (38.3m) | `pixel-counter-witness.desktop.e2e.spec.ts:352` *a near neighbour of it* (`toBe`); `qa-7i-mirror-captures.desktop.e2e.spec.ts:18` (`toBeGreaterThan`; the file ran 5.1m against a 300 s test timeout) |
| desktop 2/3 | 1 failed, 69 passed (2.2m) | `room-desktop-line.desktop.e2e.spec.ts:551` *criterion 8*, at 1440 px |
| desktop 3/3 | 2 failed, 50 passed (32.1m) | `top-bar-pill-containment.desktop.e2e.spec.ts:788` (120 s test timeout); `support/u-gate-journeys.ts:648` *A5: a client transition between two designs' editors* |
| mobile 2/4 | 1 failed, 113 passed (14.0m) | `qa-7e3c-share.adversarial.e2e.spec.ts:638` *criterion 14* |
| mobile 3/4 | 2 failed, 86 passed (11.2m) | `qa-7i-mirror-captures.e2e.spec.ts:18`; `qa-u7s0-ssr.adversarial.e2e.spec.ts:271` |
| mobile 4/4 | 1 failed, 84 passed (13.6m) | `share-design.e2e.spec.ts:96` *the owner's own share link is read-only; /d/{id} restores write access* |

Nine tests. `seeded-design.qa.e2e.spec.ts:35` *a deliberately failing test still hands its row to
teardown* also prints `✘` in mobile 4/4 and is not in that shard's failed count, so it is read as the
expected failure it names (inference).

**A lead, not a diagnosis.** Four shards (desktop 3/3, mobile 2/4, 3/4, 4/4) each log
`expect(locator).toBeEnabled()` — *Expected: enabled, Received: disabled* — and desktop 3/3 quotes
`WRITE_ACCESS_TIMEOUT_MS` beside it. Which of the nine tests each of those belongs to was not traced.
