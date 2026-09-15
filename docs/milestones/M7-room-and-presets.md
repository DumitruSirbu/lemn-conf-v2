# M7 — Screen 1: room shape, dimensions, presets, bespoke fallback

> **STATUS: IN PROGRESS.** Depends on M6 (shipped). Summary: `docs/STATUS.md`. **Wave 7A shipped
> 2026-09-11 at `8df0d49`**, ~~next wave 7D1~~ **wave 7D1 shipped at `f5b4cd9`** — both on branch
> `m7-room-and-presets`; their close-outs are below. F1–F7 are all answered and M7B is confirmed by
> the owner. **Wave 7D1b is DONE in implementation commits `f61c361` + `85091cc`; next wave: 7D2.**
> The branch-wide `pnpm ci:local` passed on the frozen tree; close-out commit `1e96104` and every
> local M7 commit through it are pushed to `origin/m7-room-and-presets`.
> **Updated 2026-09-12: wave 7D2 is DONE at `4133cdc`, closed at `2126d52`. Updated 2026-09-13:
> wave 7A2 is DONE at `f97d621`, closed at `6cde5ef`. Wave 7E1 is DONE at `57f1e94`, closed at
> `160983d`.** Final `pnpm ci:local` and the pre-push rerun passed in full; every M7
> commit through `160983d` is pushed to
> `origin/m7-room-and-presets`.
> **Updated 2026-09-14: wave 7E2 is DONE at `470e5c9`, closed at `8434e76`; next wave: 7F1.** Final
> `pnpm ci:local` and the pre-push rerun both passed in full; `41181d8..8434e76` is pushed to
> `origin/m7-room-and-presets`, local and origin both at `8434e76`.
> **Updated again 2026-09-14 at `095d417`: 7F1 is planned and dispatchable** — read
> [*Wave 7F1 — dispatchable punch list*](#wave-7f1--dispatchable-punch-list), which is the binding
> version of the 7F1 bullet in the earlier criteria section. 19 criteria, five slices dispatched one at
> a time, and **seven rulings (R1–R7) taken the same day** on questions the architect raised: the
> constant ban's mechanism, the URL updating while the customer types, the three shape cards, the plan's
> isotropic scale, the locale-menu extraction, `direction` in the URL, and the step pill's key. Two of
> them place obligations on **7F2 and 7F3**, recorded on those waves' rows. **F8 is answered by the
> owner the same day** — all three shape cards are drawn as the design shows them, the U card drawn and
> inert until M7B, which makes R3 the owner's ruling rather than a build decision. **R4 is the owner's
> too, ruled 2026-09-14** — the plan preview uses one shared isotropic scale, over the alternative of
> taking frame 1B's two scales literally. **R5 was corrected on a measurement the same day** and the
> locale-menu extraction is deferred to its own wave; 7F1 imports the component where it stands.
> **No owner question on 7F1 is open.**
> **Updated again 2026-09-14: 7F1's visual gate found two defects the suite could not — D4 (Back loses
> a typed room) and D5 (a traversal renders 1A under a 1B URL) — ruled on as R9 and planned as
> [*Wave 7F1-D45*](#wave-7f1-d45--dispatchable-punch-list-back-keeps-the-room-the-customer-typed):
> three slices, five amended criteria and four new ones. R9 is upheld against the Next 16.3.4 docs in
> this repository and against the production build output; `roomEntryKey` is deleted rather than
> repaired, and `router.bfcacheId` is rejected on the documentation's own words. **Q-D45-1 to Q-D45-4
> are answered the same day** — its own wave row, the traversal e2e lands here rather than at 7K,
> `URL_SETTLE_MS` is 400 ms, and the fallback stays deliberately undecided as the escape hatch. **The
> departure path was corrected by the coordinator before dispatch** — a deliberate navigation
> **flushes** the pending write and leaves once it has landed; cancelling, or dispatching the
> `replace` and the `push` in one tick, each silently restores D4. **Q-D45-5 is answered too** — the
> 1B *Continuă* keeps its `<button>`, and it does nothing because **step 2 does not exist yet**, not
> because of R9; the *Departures* bullet carries the amendment and the visual gate carries it as a
> must-not-file. **No question on this wave is the owner's.**
> **Updated once more 2026-09-14: both waves are DONE. 7F1 is DONE at `5d2ff54`** (five slices, with
> the visual gate's D1–D3 fixed at `852df10`), **and 7F1-D45 is DONE at `8437c95`** (review fold
> `6682d8e`), **which is where D4 and D5 are closed.** 7F1 closes on what it actually verified and
> names D4/D5 as 7F1-D45's — two waves, two records, and the close-outs are below. Verification on
> 7F1-D45: 203 test files / 3,034 tests, typecheck, lint and whole-tree `format:check` green; a
> production-build gate whose five checks all passed; adversarial QA with 19 deliberate breaks, 18 of
> which reddened a test; one combined review, no blocker; and a closing 390 × 844 visual gate in both
> locales with zero defects, which re-confirmed D4 and D5 closed in production. **`pnpm ci:local`
> PASSED** — the script's own verdict line, `LOCAL CI PASSED — all gates green, safe to push`, with
> **193 e2e tests in 5.7 minutes** against a production build, the new traversal spec among them; read
> from the log rather than from an exit code. **CI is still the verdict for the runner's timing.** The
> closing gate also found **one defect that is not this wave's** — the U chip drawing the L plan while
> `wallC` is empty, 7F1-shipped behaviour, recorded against **7F2**. Next wave: **7F4**.
> **Updated once more 2026-09-14 at `e8027f5`: 7F4 is planned** — read
> [*Wave 7F4 — dispatchable punch list*](#wave-7f4--dispatchable-punch-list-the-composition-runs-and-the-kitchen-it-makes-is-the-one-that-opens),
> which is the binding version of the 7F4 bullet in the earlier criteria section and of the 7F4 row in
> the revised wave table. **7F4 is where the generation algorithm gets its first production caller** —
> foreseen by ADR 0110 decision 6 and by the row's *Full (kit lifetime)* tier, not discovered here —
> so Step 1 must now build a Three.js kit in the browser. **Recommended: split into 7F4a (the
> composition runs and is drawn) and 7F4b (the hand-off into the editor)**, because the two halves
> fail differently: a bundle and a frozen main thread against **a duplicate design row**. Nine rulings
> (**R10–R18**) and 21 criteria (**24–44**); **two clauses of the earlier 7F4 bullet are overturned**
> — the list is the frame's five rows rather than the log's twenty (R11), and the frame's third state
> is a whole-list *pending* rather than per-row progress, because `generateKitchen` is one synchronous
> call (R12). ***Minimum not met* needs no new screen**: 7A2's `ROOM_TOO_SMALL_FOR_KITCHEN` already
> resolves such a room to 1C before generation runs, and the sentence there is 7F2's.
> **Three questions were not the architect's, and all three are answered the same day at `f0f3ae9`:**
> **Q7F4-2 — the split is approved**, 7F4a closed and reviewed on its own before 7F4b is dispatched;
> **Q7F4-3 — R11 and R12 are upheld and ruled by the coordinator rather than deferred to the owner**,
> because the owner's F8 answer pointed at a frame and not at a paragraph, with the overturned clauses
> **struck in place** at the 7F4 bullet so a reader who finds the prose alone sees what lost; and
> **Q7F4-1 — the dropped-roles wording is with the owner**, the drafted interim ships marked
> unapproved, and it blocks no slice because the answer is a message-file edit. **The wave table's
> 7F4 row is corrected too:** it omitted `src/room/room-screen.tsx`, which must change because the
> frames put *Cameră* on 1A–1C and *Preset* on 1D–1F.
> **Updated once more 2026-09-14 at `b18b38e`: 7H is planned ahead of its turn, at the owner's
> request** — read [*Wave 7H — dispatchable punch list*](#wave-7h--dispatchable-punch-list), which is
> the binding version of the 7H bullet in the earlier criteria section. 16 criteria, six slices, and
> **four questions the architect refused to settle alone (Q7H-1 to Q7H-4)**: the wave's stated
> *"byte-identical at the seeded room"* criterion and **the still-open half of backlog 21** could not
> both be honoured, because the drawn shell (4200 × 3400) and the seeded document (3560 × 2920) have
> never agreed. **All four are now answered, the same day.** **Q7H-1 is the owner's and it is
> reading (a): the shell follows the entered room**, the seeded shell becomes 3560 × 2920, backlog
> 21's open half closes in this wave, and *"byte-identical, no re-baseline"* is **withdrawn as a
> criterion** — the owner's framing is that today's kitchen is a mock on one wall size that will
> match roughly 1% of entered rooms, and its real future is as the preset library's first entry.
> Q7H-2 to Q7H-4 are the coordinator's, all three taking the architect's recommendation. **One new
> question, Q7H-5, was raised *by* those rulings** and is **confirmed the same day**: the camera
> presets' fixed point at the seeded room was the same withdrawn species of claim, so it is withdrawn
> too and `CAMERA_PRESETS` is kept as evidence of where the framing began rather than as an assertion
> about where it must land. **Every slice is now ungated.** **ADR
> 0117 is owed for Q7H-1 and Q7H-3 and is deliberately held** until the owner's product framing is
> understood well enough to write one accurate record instead of a narrow one. ~~**7H is not
> dispatchable until 7F1 has landed**, because its anchor is 7F1's criterion 12.~~ **That gate is met
> as of 2026-09-14: 7F1 is DONE at `5d2ff54` and 7F1-D45 at `8437c95`.** The recommended order still
> puts 7F4 next; 7H is no longer blocked by this dependency.
> **Updated 2026-09-15: wave 7F4a is DONE at `bf6901b` + `37f1ecb` + `6113176` + `52504d1`; next
> wave: 7F4b.** The generation algorithm has its first production caller — a tap on *Continuă* at 1B
> dynamically imports the adapter, borrows a transient kit through a lease, runs `generateKitchen`
> once synchronously and draws frame 1F's five rows. **1F is a dead end by design** until 7F4b hands
> off to the editor. Verification: web **210 files / 3,173 tests**, `three-adapter` **78 / 3,071**;
> typecheck, lint and whole-tree `format:check` green; **adversarial QA with 45 tests and 19
> deliberate breaks, 18 of which reddened a test**; one combined logic + clean-code review, no
> blocker, three findings folded; and a **production-build visual gate at 390 × 844 in both locales**
> — criterion 14 across 16 elements, criterion 15 across five layout states, five *Înapoi* round
> trips with the draft intact, `history.length` never moving, and **tap-to-rows medians of 24–26 ms**
> (n = 10 each). **`pnpm ci:local` has NOT been run for this wave and nothing is pushed — both are
> pending.** Four defects were found and fixed: **a kit leaked on every throw between `makeKit` and
> the lease** (measured `{ built: 1, disposed: 0 }`), **a failed screen drew green *inclus* rows for
> a discarded design**, **browser Back out of 1F did nothing**, and **nothing guarded the
> `.composeRow*` classes** — the last being the one deliberate break that reddened no test.
> **Criterion 34's boundary list was mis-notated and the code was right** (`validateRoomInput` agreed
> with the screen 12 for 12); **criterion 38's measurement was taken after slice 3 rather than before
> its dispatch**, and a comfortable number is what made that harmless rather than a justification.
> **Owner rulings:** *așezat* → **inclus**, *nu încape* → **nu poate fi inclus**, the dropped sentence
> names the wall sizes, and the report stays. Full close-out below.
>
> **Revised 2026-09-11 by the architect, on branch `m7-room-and-presets` from `main` at `995ad03`**
> (M6 and M6B have both shipped; M6B merged as PR #8). The sections written before M6/M6B are kept;
> what the code has since made stale is struck in place and dated. **New, below the original plan:**
> *Where the code stands*, the *Decision-record sweep*, the *Wave plan* and the dispatchable **7A**
> punch list. Engineering decisions are ADRs 0108–0111. **Wave 7A can be dispatched now; no owner
> answer blocks it.**
>
> **Re-planned 2026-09-11, the same day, on the owner's answers to all eight questions.** Every
> question below is marked answered with the owner's words. The consequences are ADR 0108 Amendment B
> (approved bounds), ADR 0109 Amendment A (library, ±600, edge adaptation), ADR 0110 Amendment A
> (fridge → sink → preparation → hob, minimum sink + hob, ≤ 599 mm empty), ADR 0111 Amendment A (the
> editor only at `/d/{id}`, a returning-visitor cookie), **ADR 0112** (the owner-authored preset
> library behind a server-side gate), **ADR 0113** (Step 1 copy approved as drafted) and — on two
> later owner statements the same day — **ADR 0114** (the visitor cookie's security design; read-gating
> pending F5) and **ADR 0108 Amendment C** (the room must hold a sink and a hob; the owner's 1500 / 2000
> measured and put back as F6). **Read
> [*Re-plan after the owner's answers*](#re-plan-after-the-owners-answers--2026-09-11) for the
> current wave table**; the earlier wave plan is kept, marked superseded, for its criteria that carry
> over. ~~**Proposed: U-shaped rooms split into a milestone of their own, M7B.**~~ **M7B is confirmed
> by the owner, 2026-09-11: *"Yeah let make separate"*** — U-shaped kitchens are their own milestone
> between M7 and M8.

Status: planned. Depends on M6.
Reference: mockup frames 1A, 1B, 1C, 1D, 1E, 1F and D1A–D1F; `DEVELOPMENT-SPEC.md` §10, §13.3 q4/q5;
`ARCHITECTURE_PROPOSAL.md` §5.2, §8.

## Owner questions for M7

Asked 2026-09-11. Answer in plain words — *"yes to the recommendation"* is a complete answer.
**Nothing here blocks the first waves**: every question has an interim the build runs on, marked
unapproved in the code, and the wave table says which wave, if any, waits for which answer.

**Q1 — Room size limits.** What are the shortest and the longest wall the product should accept, and
the lowest and the highest ceiling?

- *Recommended:* ~~shortest wall **900 mm** on either wall of an L-shaped room — the corner cabinet alone
  reaches 900 mm along both walls, so a shorter wall cannot hold it.~~ **Corrected 2026-09-11 (ADR 0108
  Amendment A):** shortest back wall (A) **900 mm** and shortest side wall (B) **1000 mm** — the corner
  cabinet reaches 900 mm along the back wall, and along the side wall 900 mm with the standard 600 mm
  cabinets but 1000 mm with the deeper 700 mm ones, so a shorter wall cannot hold the corner at every
  depth the customer can choose. Longest **6300 mm** for the back
  wall (A) and **5100 mm** for the side wall (B) — the most a saved design can hold today; longer is
  possible, as a deliberate storage change. Lowest ceiling **2200 mm** — the upper-cabinet row ends
  there, so any lower and a kitchen has no upper cabinets (below 2600 mm the top row is simply left
  out). Highest ceiling **3900 mm**; the cabinets stop at 2600 mm whatever the ceiling.
- *Until you answer:* the screen uses the engine's own limits — ~~walls 900 to 6300 / 5100~~ **back
  wall 900 to 6300, side wall 1000 to 5100** (corrected 2026-09-11), ceiling 860 to 3900 — marked
  unapproved in the code (ADR 0108). No wave waits; M7 cannot close on them.
- **Answered 2026-09-11:** *"1. Yes looks like good boundaries"* — the L bounds are approved as
  recommended: wall A 900–6300, wall B 1000–5100, ceiling 2200–3900 (ADR 0108 Amendment B).

**Q2 — Presets that fit "after an adjustment"** (frames 1E/D1E: *"Ajustată −20 cm ca să intre pe
peretele B"*).

- (a) By how much, at most, may a preset be shrunk to fit a wall? *Recommended:* **300 mm per wall**,
  the mockup's own figure.
- (b) What may shrink? *Recommended:* only cabinets the preset marks as adjustable, within that
  cabinet's own width limits. Appliances, corners, tall appliance housings and the sink cabinet below
  its minimum never change; nothing is removed; the card always states the change.
- (c) In what order are fitting presets listed? *Recommended:* exact fits first, then adjusted ones
  by the smallest adjustment, otherwise your own order — **never ranked by how much of the wall they
  fill**, because leftover wall is the normal case (ADR 0067).
- (d) When a preset leaves a long stretch of bare wall (say 1.5 m in a large room), should that
  stretch become empty space the customer can fill in the editor? *Recommended:* yes~~; stretches under
  300 mm stay invisible, as today~~. **Struck 2026-09-11 — false.** ADR 0015's 300 mm is a
  *vertical* threshold; an empty column of any width publishes its openings (ADR 0043). See ADR 0110
  Amendment A6.
- *Until you answer:* a preset is listed only if it fits unchanged, ordered as in (c), and a leftover
  stretch is bare wall. **Blocks wave 7C only.**
- **Answered 2026-09-11:** *"2. if you mean how much empty space can remain if is not possible to fit
  ideally all cabinets I will say maximum 599, why? because this is the default with of majority of
  cabinets. In that empoty space you have limited options like cabinet with one door 599-350, bottle
  cargo 300 and that all. So we can be more permissive and try to fix exactly what fits and let the
  edges empty for user to play with resizez or insettion of another cabinets. WHat should be in that
  empoty space? the posibility to insert a cabinet and it should look like a empty column exact like
  after you remove the cabinets"* — no narrowing adjustment: presets and generated kitchens **fit
  exactly what fits**, leave **at most 599 mm** bare per run, and that space is an ordinary empty
  column (ADR 0109 Amendment A, ADR 0110 Amendment A). (a) and (b) are retired; (c) is kept as
  amended; (d) is *yes*.

**Q3 — The kitchen the app composes when no preset fits** (frames 1F/D1F).

- (a) What must it contain, and in what order are things dropped on a short wall? *Recommended — the
  mockup's own list:* 1 sink cabinet 600, 2 hob-and-oven cabinet 600, 3 storage filling the rest of
  the base run, 4 fridge only if it fits.
- (b) Upper cabinets above the base run (same widths) and a hood over the hob — yes or no?
  *Recommended:* yes; every preset in the mockups has upper cabinets.
- (c) On an L, the corner cabinet goes in the corner and tall items (the fridge) go on wall B?
  *Recommended:* yes, as in the reference kitchen.
- (d) No fillers: leftover wall stays bare and the manufacturer closes it at measurement (ADR 0067),
  and only widths the catalogue already builds are used. *Recommended:* confirm.
- (e) If even the sink and the hob do not fit, is the room refused on the dimensions screen rather
  than given a kitchen without them? *Recommended:* yes — it is the same number as Q1's shortest wall.
- *Until you answer:* the app composes from the four-item list in (a), base row only, marked
  unapproved (ADR 0110). No wave waits; the answer changes data.
- **Answered 2026-09-11:** *"3. fridge position is not mandatory on a specific wall but form left to
  right should be fridge, sink, and hub, this is a regular order on cooking, take something from
  fridge, wash, then process on worktop, thats why ideal between sink and hub to be a cabinet to have
  that preparation surface and after you cook on hub or oven unde the hub... but a kitchen minimum
  should have sink and hub"* — the order is fridge → sink → preparation cabinet → hob with the oven
  under it; the fridge is not tied to a wall; the minimum kitchen is a sink and a hob (ADR 0110
  Amendment A). (b) upper cabinets and hood, and the drop order on a short wall, were not answered —
  follow-ups F2 and F3.

**Q4 — Which presets should exist?** The mockups' four (*Ozun clasic*, *Nistru compact*, *Codru
insulă*, *Buștean deschis*) with their counts and prices are illustrations: nothing defines them, and
*Codru insulă* has an island, which the product cannot draw.

- *Recommended:* M7 ships with the reference kitchen as the only real preset. You send further
  presets as a list of cabinets per wall plus a material, a colour and a name; each is added as data,
  with no code. With one preset, most rooms will get a composed kitchen instead.
- Blocks no wave; it decides how useful the preset list is to a real customer.
- **Answered 2026-09-11 — and it is a new feature:** *"4. Here is a important question, I would like
  to have a temporary button displayed that by clicking it will save the generated preset and
  adjusted after by me as a preset. In this way I will prepare a library of presets and after we will
  hide that button but will keep the functionality to be reactivated later on demand. So the process
  will be : a) I choose configuration, liniar, 2 walls, b) 3 walls, I set the wals width and c) you
  start to generate a preset (we don't have now presets) d) I make adjustments and save the preset e)
  later if I insert nearly similar walls confioguration and width +- 600 mm, you show me the preset so
  I am able to choose it"* — an owner-authored library saved from the editor behind a server-side
  gate (ADR 0112); it starts empty; a preset matches within ±600 mm per wall (ADR 0109 Amendment A).

**Q5 — Straight (linear) and U-shaped rooms.** The plan refuses both, but the mockups themselves offer
*"alege o formă liniară"* as the fix for a too-short wall (1C, and D1C's *"Treci la formă liniară pe
peretele A"*) and show a straight 2.00 m room being composed (1F/D1F).

- *Recommended:* allow straight kitchens **through composition only** (one wall; no straight presets
  until you supply one) — the engine already builds one wall. Keep U refused, with a plain reason.
- *If no:* the *"choose a linear shape"* suggestion is removed from the too-short-wall message.
- *Until you answer:* both are refused, and the message does not suggest a linear shape. **Blocks
  wave 7J** and the final wording of 1C/D1C.
- **Answered 2026-09-11:** *"5. Hmm no, need to do also the U shaped - this can be a hard milstone
  maybe multiple but at this stage we should support at the end all kitchen shapes (exluding
  island)"* — all three shapes are in scope, islands out. Linear is built in M7 (wave 7J); **U is
  proposed as its own milestone, M7B** (see the re-plan). The 1C/D1C suggestion to switch to a linear
  shape stands, because linear becomes buildable.

**Q6 — "Încotro merge cotul? — La dreapta."** When a customer chooses a corner on the right, should
their 3D kitchen be the **mirror image** of the left-hand one — the same cabinets, the long run still
on the back wall, the corner moved to the right?

- *Recommended:* yes. The alternatives are refusing *right* (half of all L rooms) or drawing it as a
  left corner, which shows the customer a room they do not have.
- *Until you answer:* the toggle mirrors the 2D plan only and the editor draws a left corner — a named
  interim. **Blocks wave 7I.**
- **Answered 2026-09-11:** *"6. Yes mirror, plus this mirroring especially of corner cabinet will help
  in building the U shape kitchens"* — 7I is unblocked, and its mirror capability is built so M7B can
  mirror the corner assembly on its own to make a U's right-hand corner.

**Q7 — Where a customer starts, and the demo.**

- (a) Should the address `/` open Step 1 (the room shape)? *Recommended:* yes.
- (b) Should the demo kitchen stay reachable at its current page? *Recommended:* yes, unchanged — the
  test suite and the 3D fidelity checks run against it — and once a demo edit is saved, the address
  changes to that design's own link so a refresh keeps it (your proposal of 2026-09-02, backlog 30).
- (c) Choosing a preset or a composed kitchen saves it and moves to its own link at once; *"‹ Cameră"*
  in the editor returns to Step 1 with the room filled in, and choosing again starts a new design
  while the old link keeps working. *Recommended:* confirm.
- (d) Design links keep today's unguessable kind rather than a time-ordered one. *Recommended:*
  confirm.
- *Until you answer:* exactly the recommendations (ADR 0111). Blocks nothing.
- **Answered 2026-09-11:** *"7. Yes I need custom link for each user (save uuid related to potential
  user in session / cookies), on reopening detect he uuid from browser and load its previous
  configuration. Current screen should bot be displayed with current URL, only with custom user
  uuid"* — (a), (c) and (d) confirmed; **(b) is overturned**: the demo is not reachable as a screen,
  the editor is shown only at `/d/{id}`, and a per-visitor cookie brings a returning visitor back to
  their design (ADR 0111 Amendment A).

**Q8 — New wording.** Step 1 adds new Romanian sentences. Do you want to review them once, when the
screen is built, the way you did Gate O1?

- *Recommended:* yes — one sitting at the end of the screen work. Mockup wording is used as written;
  only what the mockups lack is drafted (the refusal for U, the loading and error states, the
  composed-kitchen step labels). The Russian is drafted after your Romanian edits and you check it
  last, as at Gate O2.
- Blocks M7's close, not any wave.
- **Answered 2026-09-11:** *"8. Mark as approved at the moment, as I said I will adjust when I will
  decide later"* — Gate M7-C is withdrawn; each new Romanian leaf enters the copy lock in the wave that
  adds it, and the Russian draft is approved by the same ruling (ADR 0113).

### Follow-up questions — 2026-09-11

~~Four, all short. **Only F1 blocks a wave** (7J); the rest have defaults the build runs on.~~
~~**Six, all short (F5 and F6 added later the same day). F1 blocks wave 7J and F5 blocks wave 7E3b;**
the rest have defaults the build runs on.~~ **All answered 2026-09-11** — the owner picked the
recommended option on each, through a structured prompt; the option labels are quoted verbatim
below. **Nothing in M7 is blocked on the owner any more.** F7 was asked afterwards by the coordinator,
and **F8 by the architect on 2026-09-14 while planning 7F1** — **answered by the owner the same day**.

- **F1 — Straight kitchen wall length.** Accept a straight wall from **1200 mm** to **6300 mm**?
  1200 is a sink plus a hob, the minimum kitchen you ruled; 6300 is the most a design can store.
  ~~*Blocks wave 7J.*~~ **Answered 2026-09-11: "Yes, 1200–6300 mm"** — 7J is unblocked (ADR 0108
  Amendment D).
- **F2 — Upper cabinets in a composed kitchen.** Should the app put upper cabinets above the base run
  (same widths) and a hood over the hob? *Recommended:* yes. ~~*Until you answer:* base row only.~~
  **Answered 2026-09-11: "Yes, uppers + hood"** (ADR 0110 Amendment C).
- **F3 — What goes first on a short wall.** The ideal row is fridge, sink, preparation cabinet, hob.
  When it does not all fit, drop the fridge first and then the preparation cabinet — keeping the sink
  and the hob? *Recommended:* yes (the mockup's own example drops the fridge). ~~*Until you answer:*
  exactly that.~~ **Answered 2026-09-11: "Fridge first, then prep"** (ADR 0110 Amendment C).
- **F4 — Adapting a preset to a smaller or larger room.** A preset shown for a room up to 600 mm
  smaller loses cabinets from the free end of each wall until it fits (never the sink, the hob or the
  corner), and any bare stretch of 600 mm or more — in a smaller or a larger room — gets a 600 mm
  storage cabinet, so at most 599 mm is ever left empty. Is that what you meant? ~~*Until you answer:*
  exactly that.~~ **Answered 2026-09-11: "Yes, drop from free ends"** (ADR 0109 Amendment D); F7
  bounds the 599 on wall B.
- **F5 — Who can open a design's link.** Today anyone who has a design's link can open it read-only.
  You asked that nobody can open a configuration by accident or as a hacker. Should a design's link
  open **only in the browser that created it** — so a link that leaks through history, a screenshot
  or a forwarded message shows nothing — with sharing added later as an explicit "share" button?
  *Recommended:* yes. *The cost:* a customer who clears their browser or changes device cannot reopen
  their design until M8's e-mailed link. *Until you answer:* links stay readable by anyone who has
  them; the browser cookie is already secure either way (ADR 0114). **Blocks wave 7E3b.** *Related,
  and only if you want to change it:* the browser remembers a visitor for 30 days after their last
  change, because an untouched design is deleted after 30 days (ADR 0019); remembering visitors
  longer means keeping designs longer too. ~~**Answered 2026-09-11: "Only its own browser"** — the
  30-day lifetime stands; ADR 0114 decision 5 is accepted (its Amendment A), ADR 0002 and ADR 0019
  decision 1 carry dated supersession notes, and 7E3b is unblocked.~~ **Superseded the same day: the
  owner revisited F5 and chose "Own browser + private share link"** — *"Normal link opens only in the
  owner's browser; a separate 'share' button creates a second read-only link the customer can send
  (e.g. to the manufacturer or family) and revoke later."* ADR 0114 Amendment B designs it (one
  revocable, hash-stored, read-only token per design at `/[locale]/s/{token}`); the 30-day lifetime
  stands; ADR 0002 and ADR 0019 decision 1 carry revised dated notes. New wave **7E3c** builds the share
  link, and 7E3b follows it. **Restated later the same day** — *"For editing we should request a
  password or pin code, but for sharing we need to generate a short link that will offer only read
  only configuration without any passowrds."* — **the sharing half is recorded** (ADR 0114 Amendment C:
  a 12-character base62 link, ~71 bits, no password); ~~**the editing half is pending**: the owner is
  choosing between a PIN and customer profiles (e-mail and password, with a small dashboard). 7E3b is
  on hold until that answer.~~ **Settled the same day ([ADR 0115](../decisions/0115-customer-profiles-replace-the-pin-and-arrive-in-m8-and-m7-ships-the-browser-cookie-and-share-links.md)):** three PIN answers
  (*"Only on a new browser"*, *"6-digit PIN + lockout"*, *"Reset by e-mail, from M8"*) were given and
  then superseded by **"Profile replaces PIN"** and **"In M8, with e-mail"** — customer profiles
  (e-mail + password, a dashboard, a modal after the first configuration) are built in **M8**. **M7
  ships the owning-browser cookie and the short share link, and no PIN work.** Clarified: *"short link
  only to share"* — `/d/{id}` keeps its identifier. 7E3b is off hold.
- **F6 — The second wall when one wall is only 900 mm.** You said *"the second wall should have at
  1500 mm ideally 2000 mm"*. Measured, the corner takes the first 900 mm of the second wall (1000 mm
  with the deeper 700 mm cabinets), so **1500 mm holds a sink or a hob, not both, and 2000 mm still
  cannot hold both** — a sink and a hob need the second wall to be at least **2160 mm** (2060 mm with
  the standard 600 mm cabinets). Which do you want: (a) the room must hold a sink and a hob, so the
  second wall is at least 2160 mm when the first is 900 mm *[recommended — it keeps your "minimum sink
  and hob"]*; or (b) keep 1500 mm and accept a kitchen with only a sink or only a hob in such rooms?
  ~~*Until you answer:* (a).~~ **Answered 2026-09-11: "Must hold sink + hob"** — option (a), now an
  owner ruling rather than an interim (ADR 0108 Amendment D).
- **F7 — Keep wall B's 100 mm reserve?** *(Asked by the coordinator after the 7D1-P adjudication.)*
  Composed kitchens keep the last 100 mm of wall B free so that a later switch to 700 mm cabinets
  marks nothing, at the cost of wall B's bare end reaching up to 699 mm at the 600 mm depth — above
  Q2's 599 mm. **Answered 2026-09-11: "Keep the 100 mm reserve"** — the owner confirms ADR 0110
  Amendment B3 and ADR 0109 Amendment C, and the reserve is a stated exception to the 599 mm rule on
  wall B (ADR 0110 Amendment C).

- **F8 — Does Step 1 draw a **U** card during M7?** *(Asked by the architect while planning wave 7F1,
  2026-09-14; re-posed the same day once the coordinator checked why each shape is refused.)*
  **Answered by the owner, 2026-09-14: draw all three, exactly as the design shows them.** Their words,
  verbatim:

  > *"I understand that u shape will not be radiant clicking on its specific icon will not do anything,
  > but I don't say issue to to draw liking design. There is already design. Use the the design that was
  > proposed and implement the the logic. Remains only after these waves to weight the special milestone
  > for the u shape."*

  Read as a ruling: **all three cards are drawn as the reference draws them; the U card is drawn and
  inert, and its inertness is accepted knowingly rather than treated as a defect; the design is not
  departed from; and U's own milestone comes after these waves.** This closes F8 as option (a) and
  confirms ADR 0104 decision 1 for screen 1 — the frames are the specification here as they are for
  screen 2.

  Frame 1A draws three cards — *Liniară*, *În formă de L*, *În formă de U* — and today only the L can be
  continued from. **The description below stays, because it is still why each card behaves as it does —
  but neither is a pending decision any more:**

  | card | why it is refused today | when it becomes live |
  | --- | --- | --- |
  | *Liniară* | **You have already approved it** — F1, verbatim: *"Yes, 1200–6300 mm"* (1200 mm being a 600 mm sink plus a 600 mm hob, your own minimum kitchen). Those numbers deliberately do not enter `APPROVED_ROOM_POLICY` until the wave that can build the shape, so a straight room cannot validate before it can be composed (ADR 0108 Amendment D, Amendment B decision B2) | **wave 7J, inside M7** |
  | *În formă de U* | **Never put to you.** No bounds exist, none has been proposed, and your answer to Q5 made U its own milestone | **M7B** |

  So *Liniară* is a card whose product answer already exists and whose wave lands **inside this
  milestone**; the policy table simply has not caught up yet. *În formă de U* stays drawn and inert
  until M7B — which is what the owner ruled, in those terms, having been told the card would do nothing.

  **What the ruling makes load-bearing.** With all three cards permanently drawn, `isShapeBuildable` is
  the only thing standing between a drawn card and a working one. So wave **7J must be able to make the
  *Liniară* card start continuing by adding the approved bounds to `APPROVED_ROOM_POLICY` alone, with no
  edit under `apps/web/src/room`** — and wave 7F1's criterion 3 carries the adversarial arm that proves
  it will. That is now the contract between the two waves, not an implementation detail of either.

**Not asked, because it is already decided:** what gives when a deeper cabinet (700 mm) will not fit
a narrower wall. [ADR 0065](../decisions/0065-a-body-past-the-end-of-its-wall-is-marked-not-moved.md)
(2026-09-03, the owner's words): nothing gives — cabinets past the wall are marked red with the
warning. A preset is proposed only if it fits at its own depth; a later depth change is the
customer's own edit and is marked like any other
([ADR 0109](../decisions/0109-a-preset-is-a-recipe-document-and-is-listed-only-if-the-product-would-never-mark-it.md)
decision 5).

## Goal

The way in: choose a shape, enter dimensions, and get a kitchen — either a preset that fits, or one
composed for the room when none does. After this phase the seeded development room is no longer the
only entry point.

**This is one step with six sub-states, not six steps.** The customer sees "Pasul 1 din 4"
throughout, and the step resolves directly into the 3D editor — choosing a preset, or finishing a
bespoke composition, opens Step 2 with the editor already up. There is no confirm-and-continue
screen between them, and this phase must not introduce one.

## Why last among the build phases

`DEVELOPMENT-SPEC.md` §12 step 7 puts presets after the editor, calling them plain by comparison.
The customer meets this screen first, but it is a form over an evaluator; the editor is the risk.

## Scope

In: `/configurator/room` and its six states; the room schema and its validation; preset evaluation
and application; bespoke generation.

Out: the editor (M1–M6); ~~linear and U-shape **layout** logic, which stays out of scope until product
supplies a recipe and per-wall band data.~~

> **Scope changed 2026-09-11 by the owner's answers.** **In**, added: straight (linear) kitchens
> through generation (Q5); the mirrored, right-hand L (Q6); an owner-only preset library saved from the
> editor behind a server-side gate (Q4, ADR 0112); a returning visitor resuming their own design, with
> the editor shown only at `/d/{id}` (Q7, ADR 0111 Amendment A). **Proposed out, into M7B:** U-shaped
> rooms — in scope for the product (*"we should support at the end all kitchen shapes (exluding
> island)"*), split into their own milestone for the reasons in the re-plan. **Still out:** islands;
> the editor's own behaviour beyond what these items touch.

## Security note — the firewall goes up after this phase

M7 is the phase that first puts real customers in front of the app, which is the point at which
`docs/decisions/0019-security-baseline-writes-throttling-retention.md`'s edge layer stops being
premature. It was deliberately deferred until now: a firewall protecting zero users is waste, and
rules staged for months go stale against an app that changed underneath them.

Nothing in M7 implements it. The exact commands, the plan constraints (**this plan permits exactly
one `rate_limit` rule**), and the mandatory log → preview → production rollout are in
`docs/runbooks/firewall-setup.md`. The owner publishes firewall changes; an agent never does.

Note also that ADR 0019 decision 1 — the read/write split — ~~is expected to have shipped in M3 Wave
3C. If it has not, it blocks this phase rather than M8~~ **shipped in M3 wave 3C — confirmed
2026-09-11** against the tree (`apps/web/src/lib/server/write-token.ts`; the `PUT` refuses a request
without the design's token at `apps/web/src/app/api/designs/[id]/route.ts:137-138`) and against
`docs/STATUS.md`'s ADR 0019 table (*Done*), so it does not block: M7 is where a shared link first
reaches someone who is not its creator.

**Added 2026-09-11 — M7 gives the unthrottled mint a real customer trigger.** ADR 0014 flagged S3 for
*"before M7"*; ADR 0019's 2026-08-31 correction deferred SEC-001 to M8/pre-launch by owner decision and
gated `POST /api/designs` behind M8's launch gate. Nothing ships before M8, so that gate still holds
the exposure back; M7 must not widen it, which is why `POST` stays bodyless
([ADR 0111](../decisions/0111-step-1-creates-the-design-through-the-existing-mint-then-save-and-the-room-entry-lives-in-the-url.md)
decision 1).

## Work items

1. **1A / D1A** — the shape picker: three cards with 2D plan glyphs, not renders. The continue
   action stays disabled until a valid shape is chosen. Cards, not a dropdown.
2. **1B / D1B** — dimensions: one numeric field per wall in the chosen shape, plus room height, plus
   a corner-direction toggle for L and U that mirrors a live 2D top-down plan preview.
3. **1C / D1C** — the validation state.
4. **1D / D1D** — the preset-loading state: skeleton cards and the waiting copy.
5. **1E / D1E** — the list of presets that fit.
6. **1F / D1F** — bespoke generation when none fits.
7. Wire preset application to the editor, and carry the room through to the editor's state.

**Added 2026-09-11 — two work items the plan did not have, found in the code:**

8. **The 3D room must follow the design's room.** The shell is a fixed 4.2 × 3.4 × 2.6 m room built
   *"without consulting the currently loaded design"* (`packages/three-adapter/src/kitchen-parts.ts:2156-2158`,
   `kitchen-shell.ts:25-31`), and the three camera presets are constants framed on the seeded room
   (`packages/three-adapter/src/stage.ts:199-203`). A customer's 5 m wall would stand bodies past the
   drawn wall, and §11 row 21 (top row reachable from every preset) stops being guaranteed. Wave 7H.
9. **Preset thumbnails need an in-repo rig.** `preset-shots.html` lives in `design-source/`, which is
   untracked and will be deleted (`AGENTS.md` rule 3). The in-repo equivalent is
   `/internal/scene-shot` plus `apps/web/scripts/capture-fidelity.mjs`, and it renders only the
   store's seeded design, never a recipe. Wave 7G.

## Acceptance criteria

Shape and dimensions:

- All three shapes are offered. The affordance ships even though only the L layout is buildable.
- A shape whose layout does not exist is refused at this screen with a human reason before any
  preset work begins. It is never accepted and then rendered wrong, and the refusal does not expose
  an internal reason like "not implemented".
- Dimension fields use tabular numerals, an inline unit, and the Romanian decimal comma. A value is
  parsed once at the form boundary and normalised to exact integer units before entering the domain;
  a non-integral value is rejected, not rounded.
- The corner-direction toggle appears only for L and U. **The direction is never inferred from the
  wall lengths** — the mockup states this explicitly next to the control.
- The 2D plan preview updates as the customer types and mirrors with the toggle.
- The example values in the mockups (3.60 × 2.40 m, height 2.60 m) are the mockup's example, not
  constants. Nothing in the implementation may treat them as fixed.

Validation (1C / D1C):

- The reason appears next to the offending field, in human language.
- **No limit number and no error code is shown**, because the bounds are unapproved data. The
  mockup's own wording is the model: this wall is shorter than we can support, increase it or choose
  a linear shape.
- The plan preview marks the offending wall in red.
- The screen states that presets appear once every value is valid.
- Desktop uses its extra space for an actionable suggestion, not for more prose.

Preset list (1E / D1E):

- **A vertical list on mobile with a per-card "Folosește" button, and a grid on desktop with the
  same per-card button. There is no separate confirmation screen** — choosing a preset applies it
  and continues.
- Only presets that fit are shown. One that fits after a declared adjustment shows that adjustment
  inline on its card, in the mockup's form: "Ajustată −20 cm ca să intre pe peretele B". An
  adjustment is never applied silently.
- The header states the result count and how many were adapted.
- Each card carries its body counts by band, its finish summary, and its starting price.
- Thumbnails are renders produced from the preset's own recipe by ~~the `preset-shots.html` rig~~
  **the in-repo capture rig (`/internal/scene-shot`, wave 7G) — corrected 2026-09-11, since
  `design-source/` may not be imported from and will be deleted**, loaded
  separately from the card. A card must never promise a layout different from the recipe it applies.
- The same evaluator decides what is listed and what is applied, so a card shown as fitting cannot
  fail on application.
- **Loading (1D / D1D):** skeleton cards with the waiting copy. The number of skeletons must not
  imply the number of results.

Bespoke generation (1F / D1F):

- When no preset fits, the flow composes one instead of dead-ending. There is no "no results" state
  anywhere in this screen.
- The placement steps are visible in priority order, so the wait is legible and the omissions are
  explained.
- The stated rule holds: on short walls keep the sink and cooking first, then storage. What does not
  fit is **removed and labelled** — shown struck through with "nu încape" — never crammed in.
- Every generated design is a valid design under the M2/M3 engine. Generation produces placements
  through the same guards as manual insertion; it has no privileged path.
- Desktop shows the composition steps beside a preview that fills as bodies are placed.

Surfaces:

- **Mobile (gate):** all six states complete by touch at 390 × 844, including reaching the editor
  from a chosen preset and from a bespoke composition. This is the phase gate.
- **Desktop (same phase, separate line):** D1A–D1F, with the step labels in the top bar rather than
  a progress bar, the large live plan beside the fields, and the four-up preset grid.

Step framing:

- All six sub-states live under one step and one route, and the progress indicator reads "Pasul 1
  din 4" across every one of them. On desktop the steps are labels in the top bar, not a progress
  bar.
- Choosing a preset applies it and opens the 3D editor. Finishing a bespoke composition does the
  same. **No confirm-and-continue screen exists between Step 1 and Step 2.**
- Applying a preset creates the stored design and its identifier, so from this point the customer's
  work is reachable by link.

Boundaries:

- Route guards: reaching a later step without a valid configuration returns to the earliest missing
  step with an explanation. Browser Back never erases a valid design.
- A design identifier in the URL resolves the stored design and restores the step it belongs to,
  rather than restarting the flow.

## Risks

- **Inventing a bound to make validation implementable.** The bounds are unapproved. Implement the
  validation *mechanism* against policy data and keep the wording free of numbers, exactly as the
  mockup does.
- **Copying the L scene to fake a linear or U preset.** Explicitly forbidden. §13.3 q4 records that
  the band lines and the two wall planes are constants of this room and must become per-wall data
  first.
- **Bespoke generation growing its own placement rules.** It must call the same engine.
- The reference's four presets share one scene and differ only by finish and camera angle. Real
  per-preset recipes are unbuilt product work; this phase can prove the mechanism with one real
  recipe and explicit fixtures.

## Owner's statement of intent for this phase — recorded 2026-09-03

In the owner's own words:

> *"any future presets (after user will introduce walls size the app will search in presets to found
> a near to sizes kitchen and will propose it to be selected, if not app will gather based on a algo
> the cabinets and electric devices to have a functional kitchen) and this should always fit the
> existing walls, including demo."*

**This is more than "presets fit".** It describes three things, and only the third is in this plan's
current work items:

1. **Preset selection by nearest room size.** The customer enters wall sizes and the app searches the
   preset set for a *near* match to propose. This plan's work item 5 says "the list of presets that
   fit" — a filter — and the owner describes a **search for the nearest**, which is a different
   operation and needs a distance rule nobody has written.

   **When that rule is written, read [ADR 0067](../decisions/0067-leftover-wall-is-the-normal-case-and-the-price-is-a-floor.md)
   first.** Real walls are not round — the owner's own example is 2444 mm — so *"the run fits and
   leaves a remainder"* is the **normal successful outcome** of preset selection, not a near-miss to
   be corrected. **A distance metric that penalises leftover space would systematically pick the
   wrong preset**: it would prefer one that fills a wall it was never measured for over one that
   fits with room to spare. The remainder is closed with filler by the manufacturer at the real
   measurement, outside this product.
2. **A generative fallback.** Where no preset is near enough, the app **assembles** a functional
   kitchen from cabinets and appliances by algorithm. Work item 6 calls this *"bespoke generation
   when none fits"* and the acceptance criteria carry a priority order; the owner's framing is
   stronger — the fallback must produce **a functional kitchen**, not merely a placement that fits.
3. **Everything the product proposes must fit the walls, the demo included.**

**Point 3 is an invariant and it reaches M6.** It is stronger than the fit *gate*
[ADR 0065](../decisions/0065-a-body-past-the-end-of-its-wall-is-marked-not-moved.md) defines: that
gate marks a body the **customer** has driven past the end of a wall, and this says the product must
never **propose** such a kitchen in the first place. A marked body is an acceptable outcome of a
customer's own edit; it is not an acceptable outcome of a preset, of generation, or of the demo
design loading. Recorded in M6 as well, at wave 6A3.

**What this phase currently assumes instead**, so the gap is explicit rather than discovered: the
acceptance criteria below say a listed preset always applies successfully, but nothing asserts that
what it applies **fits its walls**, and nothing distinguishes "fits" from "nearest". Both are this
phase's to close.

> **How they close — 2026-09-11.** *Fits* becomes mechanical in
> [ADR 0109](../decisions/0109-a-preset-is-a-recipe-document-and-is-listed-only-if-the-product-would-never-mark-it.md)
> decision 3: a recipe fits only if its instantiated design carries **zero validation findings of
> either severity** — the write seam's *no fatal finding* rule would accept a design the scene then
> marks, which is exactly what point 3 forbids (and what ADR 0069 decision 6 restates). *Nearest*
> becomes an ordering among fitting presets with no score over the remainder, proposed to the owner
> as Q2(c). The generated kitchen is held to the same rule (ADR 0110 decision 5), and what counts as
> *functional* is Q3.

## A rule this phase owns, handed over by M6 — recorded 2026-09-03

> **SUPERSEDED — found 2026-09-11 while revising this plan; nothing here is owed.** This section was
> written the same day as [ADR 0065](../decisions/0065-a-body-past-the-end-of-its-wall-is-marked-not-moved.md)
> and never revised against it. The owner **replaced the question** instead of choosing among the
> four options below: *"if the last cabinets go off the wall to highlight it with red and show a
> warning"*. ADR 0065 decision 1 — **nothing gives**: depths adapt, the run extends, a body past its
> wall is marked, none is narrowed or removed, the depth change is not refused. Decision 2 — **ADR
> 0055 stays unamended**, and ADR 0055's own removal amendment was withdrawn the same day. The rule
> holds on both paths the last paragraph names, because it is a property of the depth command, not
> of the phase that introduced the room. What M7 adds is only
> [ADR 0109](../decisions/0109-a-preset-is-a-recipe-document-and-is-listed-only-if-the-product-would-never-mark-it.md)
> decision 5: a preset is evaluated at its own declared depth, and a customer's later depth change is
> their own edit, which may be marked. **Not an owner question.** The text below is struck rather
> than deleted so that a reader meeting the four options elsewhere can see they were drafted and
> overtaken.

~~**What gives when a run will not fit its wall at a deeper cabinet depth.** Raised by M6 wave 6I and
handed here because the case does not occur in M6.~~

**The requirement, in the owner's terms:** the run must fit the wall it stands on — *"in reality the
cabinets will not fit the existing wall"*. In M6 that is satisfied by measurement at both declared
depths: a deeper wall-A run consumes more of wall B at the corner, so wall B's run ends 100 mm
further along at 700, and it still fits. Nothing has to give, and
[ADR 0055](../decisions/0055-a-depth-change-migrates-the-stored-design.md) — every body adapts,
nothing left behind, no confirmation — holds unamended.

**M7 is where that stops being free.** This phase brings real room dimensions and presets, so a
customer with a **narrower wall** choosing 700 is the first configuration in which a run cannot
simply extend. Then something must give, and the options were worked out in M6 without being needed:

- **Shrink the structural corner return.** It absorbs the delta exactly — its left edge moves with
  the deeper run and its right edge holds, so the width falls out as `320 − delta`. Costs no cabinet
  and no width the customer chose, because a corner return is structural
  ([ADR 0021](../decisions/0021-corner-returns-are-structural-in-data.md)) with no chips and no
  resize. Runs out when the return does, and needs a manufacturable minimum only the owner can give.
- **Narrow a customer cabinet.** Needs a give-way rule nobody has written, against ADR 0017/0026
  floors and ADR 0031's funding rules, and it overwrites a width the customer set through ADR 0035's
  stepper.
- **Drop a body.** The customer loses a cabinet they chose.
- **Refuse the depth for that room.** Ruled out in general by
  [ADR 0036](../decisions/0036-a-declared-dimension-is-the-finished-cabinet.md) decision 5, which is
  why it cannot simply be picked here without a dated amendment.

~~**The last two, and refusal, require amending ADR 0055** — *"nothing left behind"* is exactly what
they break. Whichever is chosen, the amendment is this phase's to write, not M6's.~~ **None is
chosen and no amendment is written — ADR 0065, see the banner above (2026-09-11).**

**It interacts with M6 wave 6K**, the wave that first lets a customer choose 700 at all: a room saved
under M7 can be reopened and re-depthed there, so the rule has to hold on both paths rather than only
in the phase that introduces the room.

## A seam this phase owes a later one — recorded 2026-09-02

[ADR 0062](../decisions/0062-a-manufacturer-price-dashboard-comes-after-m8-and-shapes-seams-now.md):
after M8 the project gains a manufacturer-facing dashboard, and one of its **probable** properties —
the owner's own *"I will think about"*, so not committed — is **enabling or disabling a specific
cabinet type**. Adding new cabinets is explicitly out of its scope.

**M7 builds nothing for it.** What this phase owes is one shape: **a preset recipe names build ids,
so preset application must ask whether a body is available rather than assume its presence in the
catalogue.** If a type is later disabled, a preset referencing it must fail in a *stated* way — the
phase's own acceptance criterion that a listed preset always applies successfully is what would
otherwise break silently, or half-apply.

Availability funnels through one predicate today (`toInsertableBody`, and
`resolveCatalogEquivalent` for the swap path). ~~Route preset application through the same one.~~ No
flag, no data, no schema — that is the dashboard's work, not this phase's.

> **Corrected 2026-09-11.** Routed literally, this would refuse the only real recipe: `toInsertableBody`
> returns `undefined` for every entry that is not `insertable: true` (`catalog.ts:1311-1316`), which
> is every seeded body of the reference kitchen. And the *one* predicate ADR 0062 decision 2 asked to
> be named was never named — two call sites still test the boolean inline (`catalog.ts:1316`,
> `:1479`). [ADR 0109](../decisions/0109-a-preset-is-a-recipe-document-and-is-listed-only-if-the-product-would-never-mark-it.md)
> decision 6 names it in wave 7B and makes it answer for a body's **type** — itself if insertable,
> its declared catalogue equivalent otherwise, and *available by presence* for the corners and the
> seeded hob, which declare no equivalent. The intent here is unchanged: a disabled type makes a
> preset fail in a stated way, never half-apply.

## Open questions gating this phase

- Exact minimum and maximum wall lengths and room heights.
- The real value behind the "fits after a ≤ 30 cm adjustment" rule.
- Bespoke-generation thresholds beyond the stated priority order.
- Approved discrete width and filler sets, which bound what generation may place.
- Real per-preset geometry recipes.
- When linear and U layouts return, and with which per-wall data.

> **2026-09-11: these six, plus the owner's-intent items, are now put as eight answerable questions
> in [*Owner questions for M7*](#owner-questions-for-m7) at the top of this file**, each with a
> recommended default, the interim the build runs on and the wave it blocks. The mapping: bounds →
> Q1; the ≤ 30 cm value and *nearest* → Q2; generation thresholds, *functional kitchen* and approved
> widths/fillers → Q3; recipes → Q4; linear/U → Q5. Q6 (corner direction), Q7 (entry and the demo)
> and Q8 (copy) are new, found in the mockups, the code and backlog entries 29/30.

## Where the code stands — measured 2026-09-11 at `995ad03`

Everything below was read in the tree, not inherited from a document. Paths are relative to the
repository root unless a package prefix is obvious from context.

**Domain (`packages/configurator-domain/src`)**

| # | What exists | What it means for M7 |
| --- | --- | --- |
| D1 | `DesignRoomSchema` = `{ shape: "L" \| "linear", widthMm, depthMm, heightMm }` (`design.ts:48-52, 144-149`). Wall A's run is `widthMm`, wall B's is `depthMm` (`queries/overflowing-placements.ts:45-50`). `presetId` already exists (`design.ts:209`); the seed carries `null` (`fixtures/kitchen-l-design.ts:973`). | A valid L room maps onto the document with **no schema change**. U is not storable, which is fine while it is refused. |
| D2 | **§13.3 q4's "constants of this room", located:** walls A (z = 0, fronts +Z) and B (x = 0, fronts +X) are two fixed transforms from the corner (`room-transforms.ts:34-49`); the band lines are `LEVELS` = 0–0.86 / 1.5–2.2 / 2.2–2.6 m (`module-grid.ts:16-20`). | The engine expresses a **left-corner L** and a **single wall A** and nothing else. A right corner needs a mirror (Q6). A ceiling below 2600 loses the top row — `PLACEMENT_ABOVE_ROOM` is a **refusal** (`validate-design.ts`, severity table); above 2600 the grid still stops at 2.6 m. |
| D3 | Wire bounds `MAX_ROOM_WIDTH_MM` / `DEPTH` / `HEIGHT` = 6300 / 5100 / 3900 (`design-bounds.ts:18-38`), the adapter shell ×1.5; `MAX_PLACEMENTS` and `MAX_DESIGN_BYTES` are derived from them (`:90-94`, `:192-196`). | Any owner maximum above them is a deliberate storage change (ADR 0108 decision 7). |
| D4 | **ADR 0065's fit gate exists**: `findOverflowingPlacementIds` / `placementExtendsPastOwnWall` (`queries/overflowing-placements.ts:20-36`), equality fits. `PLACEMENT_PAST_WALL_END` is a **mark**, not a refusal (ADR 0069). | The write seam accepts an overflowing design, so a preset's fit must be **zero findings of either severity** (ADR 0109 decision 3). |
| D5 | One document validator, `validateDesignForCatalog` (`validate-design.ts:90-108`), including `findCornerOverlaps` (`:916`), run at the write seam (`apps/web/src/app/api/designs/[id]/route.ts:233-249`) and on every load (`migrate-design.ts`). | The gate presets and generated kitchens pass — the same one the API runs. |
| D6 | `insertBody` needs frozen `columns`, the published `voids` and a `BodyProbe` (`commands/insert-body.ts:59-93`; the port is `body-probe.ts:37-41`, the factory `:104`). Openings stop at the wall (ADR 0090 Amendment B). Corner bodies are not insertable (`catalog.ts:1311-1316`). | Generation *"through the same guards"* needs a shell of recorded empty space, the corner as data, and a borrowed probe (ADR 0110). |
| D7 | Availability is tested inline at two sites — `toInsertableBody` (`catalog.ts:1311-1316`) and `resolveCatalogEquivalent` (`:1469-1479`); ADR 0062 decision 2's named predicate **does not exist**. 16 entries are insertable at 600 (measured: `listInsertableBodies(buildKitchenLBodyCatalog(600))` on the package's built `dist/`), among them `base-sink` 600–800 (floor 560), `base-hob-oven` 600, `base-cabinet` 200–800, `tall-fridge-housing` 600, `fridge-free` 700, `hood` 600–800, `wall-cabinet` 200–800. | ADR 0109 decision 6 names it in 7B. The plan's *route through `toInsertableBody`* would have refused the reference kitchen. |
| D8 | The seed `KITCHEN_L_DESIGN`: room 3560 × 2920 × 2600, depth 600, 26 placements (`fixtures/kitchen-l-design.ts:907-977`). Wall B's 2920 is **chosen, not measured** (`:941-957`, ADR 0083 decision 1). Furthest along-wall extents 3500 mm on A and 2800 mm on B; the top row reaches 2600 mm. | M7's one real recipe, derived from this fixture (ADR 0109 decision 2). Rooms below those extents are expected to go to generation; 7B measures the boundary. |
| D9 | M6's depth control: `setCabinetDepth` (`commands/set-cabinet-depth.ts:74`), declared depths on `settings.cabinetDepthMm` (`design.ts:174-181`). | A customer's depth change is an edit and is marked if it overflows (ADR 0065) — the plan's hand-over section is decided. |
| D10 | `CURRENT_SCHEMA_VERSION = 5` (`migrate-design.ts:62`); the 3600 × 2400 room correction is keyed at version ≤ 2 (`migrate-design.ts:201-307`). | M7 writes version 5, so a customer who enters 3600 × 2400 is never "corrected" — 7E2 proves it. |
| D11 | Test support: a fake probe and a lease ledger (`tests/support/fake-probe.ts`); `fast-check` 4.9.0 at the workspace root (`package.json:31`). | Property criteria below are directly implementable. |

**Adapter (`packages/three-adapter/src`)**

| # | What exists | What it means for M7 |
| --- | --- | --- |
| A1 | The room shell is a fixed `RW 4.2 × RD 3.4 × WH 2.6` (`kitchen-parts.ts:2155-2181`), built *"without consulting the currently loaded design"* (`kitchen-shell.ts:25-31`). The three camera presets are constants framed on the seeded room (`stage.ts:199-203`). Backlog 16 — fit-to-run framing on *Perete A* — was ruled by the owner 2026-09-05 and is unbuilt. | Work item 8, wave 7H. |
| A2 | A transient kit at a depth the scene is not standing at is already built and released by `probeFactoryFor` (`apps/web/src/scene/kitchen-stage.tsx:66-90`, ADR 0076). | The pattern generation borrows at Step 1 (ADR 0110 decision 6). |

**Web (`apps/web/src`)**

| # | What exists | What it means for M7 |
| --- | --- | --- |
| W1 | `/` redirects to `/configurator/configure` (`app/[locale]/page.tsx:15-16`, *"the room step arrives in a later milestone"*). No room route. `proxy.ts`'s customer-path allow-list is `configure`, `contact`, `d/{id}` (`proxy.ts:64-80`). | 7E1 adds the route and the allow-list entry. |
| W2 | `POST /api/designs` takes no body and mints the seed with the write token (`app/api/designs/route.ts:22-51`); the client mints then `PUT`s the real document (`persistence/fetch-configuration-repository.ts:208-242`); the store is seeded with `KITCHEN_L_DESIGN` and `designId: null` (`store/configurator-store.ts:725-731`); `hydrate` replaces the design wholesale (`:654-680`); `/d/{id}` loads server-side and hydrates before first render (`app/[locale]/d/[id]/page.tsx`, `app/d/[id]/hydrate-and-configure.tsx:16-37`). **Nothing moves the browser to `/d/{id}`** (backlog 29). | Creation needs no new endpoint (ADR 0111). |
| W3 | The editor's `‹ Cameră` and `Înapoi` are inert `<span>`s (`app/configurator/configure/configure-screen.tsx:95-101, 218-220`); the load-error page's start-over links to the demo (`app/d/[id]/design-load-error.tsx:24`). | 7E2 wires them. |
| W4 | Every string is a key in `messages/ro.json` / `ru.json`, held by a whole-file copy lock (`tests/i18n/romanian-copy-lock.test.ts`, `tests/support/approved-romanian-messages.ts`), golden hashes, catalogue parity and 6B-j's diacritic lint. `configure.step` is already *"Pasul {step, number} din {totalSteps, number}"* and `configure.stepPill` *"{step}/{totalSteps}"*. | The plan's Romanian examples are **mockup evidence, not code**: each becomes an ICU leaf (e.g. the adjustment line takes the wall and the centimetres as arguments). Step 1 reuses the step leaves. New leaves pass Gate M7-C (Q8). |
| W5 | One figure formatter, `describeStartingPrice` (`price/starting-price.ts:140`), and `holdsNoCabinets` (`:134`) for the owner's M6-AUD-014 ruling (a design with no cabinets is valid and has no price). | Card prices reuse it, so a card and the editor cannot show two figures for one design. |
| W6 | `/internal/scene-shot` reproduces *"exactly the conditions `preset-shots.html` pinned"* over the store's seeded design, opt-in in production (`app/internal/scene-shot/*`, SEC-003); `scripts/capture-fidelity.mjs` drives it. | 7G extends it to render a recipe. |
| W7 | 34 `goto("/configurator/configure")` calls in `apps/web/tests/e2e` (grep, 2026-09-11); the e2e job is split into `mobile` / `desktop` legs (ADR 0105). | Retiring the demo route would move all 34 (Q7). M7's new e2e lands on those legs. |

**What the code made stale in the original plan**, each corrected in place above or in a record:

- The depth hand-over section — decided by ADR 0065 before this plan was ever revised (struck above).
- *"Route preset application through `toInsertableBody`"* — it refuses every seeded body (corrected above; ADR 0109 decision 6).
- *"ADR 0019 decision 1 is expected to have shipped"* — it has (confirmed above).
- *"The `preset-shots.html` rig"* — `design-source/` may not be imported from (corrected above).
- Copy written as Romanian literals — superseded by ADR 0095: message files, a copy lock, codes from the domain.
- Nothing in the plan made the 3D room or the cameras follow the entered room (work item 8, added above).
- `ARCHITECTURE_PROPOSAL.md` §5.2's `fixed-fit` / `module-pack` strategies: 7B is `fixed-fit`; `module-pack` is 7C and waits for Q2. §1's `packages/catalog-data` was never built, so recipes live in the domain as data handed in by parameter, the way `pricing/sample-price-book.ts` is.

## Decision-record sweep — 2026-09-11

Swept for rooms, walls and wall lengths, room height, presets, generation, route guards, design
identifiers, the seeded room and the `/configurator/*` routes (the ADR 0073-onward table form).

| Record | What it says | How it is settled for M7 |
| --- | --- | --- |
| [0001](../decisions/0001-initial-product-and-stack.md) decisions 2, 4 | Presets adapt by module-pack with discrete widths; prices are MDL estimates, *De la*, rounded up. | **Decision 2 survives weakened** (ADR 0003 §3): fixed-fit in 7B, module-pack in 7C on Q2. Decision 4 through `describeStartingPrice`. |
| [0002](../decisions/0002-db-backed-shareable-persistence.md) decision 17, *Consequences* | No link before a successful write; route guards resolve a design by identifier. | **Followed** — ADR 0111 decisions 2–3. |
| [0003](../decisions/0003-design-reference-supersession.md) §2, §4, §4b, *Open questions* 1–3, 7 | One step, six sub-states, no confirm screen; all three shapes shown, unbuilt ones refused with a human reason; the list shows only fits; bounds, the 30 cm value, generation thresholds and width/filler sets are open. | **Followed**; the open items are Q1–Q3. |
| [0010](../decisions/0010-m3-client-write-path-unwired.md) | Mint on the first mutation, never on page load; a burst makes exactly one row. | **Followed**: choosing a preset is the first mutation (ADR 0111). |
| [0014](../decisions/0014-unauthenticated-write-surface.md) S1, S3 | S1 needs a decision *before M7*; S3 is revisited *before M7*. | **Superseded by 0019**: S1 by its decision 1 (shipped), S3 by its 2026-08-31 correction (deferred to M8, gated). Not re-litigated. |
| [0019](../decisions/0019-security-baseline-writes-throttling-retention.md) decision 1, decision 10, 2026-08-31 correction | Read/write split in M3 3C; WAF after M7; `POST` must not face real traffic until M8's three controls ship together. | **Decision 1 shipped** (confirmed above). `POST` stays bodyless (ADR 0111 decision 1). The firewall is the owner's, pre-launch. |
| [0021](../decisions/0021-corner-returns-are-structural-in-data.md), [0022](../decisions/0022-seeded-entries-declare-their-catalogue-equivalent.md), [0066](../decisions/0066-the-wall-corner-returns-get-their-own-kinds-and-names.md), [0077](../decisions/0077-a-joint-seated-body-declares-its-seat-and-is-never-measured-for-one.md) | Corners are structural and declared; a seeded body's identity is its declared equivalent; joint-seated bodies declare their seat. | **Followed**: the corner is data in presets and in the generation shell, never inserted (ADR 0110); availability reads the declared equivalent (ADR 0109). |
| [0036](../decisions/0036-a-declared-dimension-is-the-finished-cabinet.md) decision 5, [0055](../decisions/0055-a-depth-change-migrates-the-stored-design.md), [0065](../decisions/0065-a-body-past-the-end-of-its-wall-is-marked-not-moved.md) decisions 1–2 | Refusing a depth change is ruled out; every body adapts; **nothing gives — a body past its wall is marked**; ADR 0055 unamended. | **Decides the plan's hand-over section** (struck above). No amendment is owed; not an owner question. |
| [0038](../decisions/0038-pre-release-no-stored-designs-no-migrations.md) | Expires at first release; M7 or M8 decides the first stored schema. | **Assigned to M8's pre-launch gate** (ADR 0111 decision 8). |
| [0041](../decisions/0041-the-browser-security-policy-is-versioned-and-the-csp-only-reports.md) | Every customer route carries the nonce'd CSP. | **Followed**: `configurator/room` joins `proxy.ts`'s allow-list (7E1). |
| [0043](../decisions/0043-an-empty-space-of-any-width-is-a-legal-state.md), [0044](../decisions/0044-an-empty-space-is-recorded-in-the-design-document.md), [0046](../decisions/0046-adjacent-empty-columns-merge-under-a-cap-and-an-insert-splits-its-column.md), [0052](../decisions/0052-800-mm-is-the-ceiling-on-any-empty-column.md), [0053](../decisions/0053-the-design-document-records-the-whole-frozen-map.md) | Empty space of any width is legal and recorded; an insert splits its column; no empty column exceeds 800 mm; the whole frozen map is stored. | **The generation shell is built from them** (ADR 0110 decision 1). A load that refuses is a dead link (0052) — why product bounds stay out of the wire schema (ADR 0108). |
| [0056](../decisions/0056-two-cabinet-depths-are-declared-and-the-control-reads-the-map.md) | Two declared cabinet depths. | A recipe declares one of them and is evaluated there (ADR 0109 decision 5). |
| [0062](../decisions/0062-a-manufacturer-price-dashboard-comes-after-m8-and-shapes-seams-now.md) decisions 1–3 | The book is a parameter; name the availability predicate once; a preset must fail in a stated way if a type is disabled. | **Fulfilled** by ADR 0109 decision 6; the preset set and the room policy are parameters in the same spirit. |
| [0067](../decisions/0067-leftover-wall-is-the-normal-case-and-the-price-is-a-floor.md) | Leftover wall is the normal case; no metric may penalise it; a remainder is closed by the manufacturer. | **Followed**: fit is one-sided, no *nearest* score (Q2(c)), no fillers (Q3(d)). |
| [0069](../decisions/0069-past-the-wall-is-one-code-family-and-severity-is-declared-per-code.md) decisions 5b, 6 | *"Before M7 there is no room control"*; a preset and generation must not overflow at all. | **Consistent**, and decision 6 is made mechanical (ADR 0109 decision 3). |
| [0076](../decisions/0076-a-probe-lease-is-a-scoped-borrow-and-the-store-publishes-no-probe.md) | A probe is borrowed through a lease, released where it was allocated. | **Followed** at Step 1 (ADR 0110 decision 6; wave 7F4). |
| [0083](../decisions/0083-wall-coverage-is-the-runs-extent-and-the-finished-end-is-part-of-it.md) decisions 1–3 | The room is customer input and never a function of depth; equality fits; the demo's wall B is chosen. | **Followed** (ADR 0108). |
| [0085](../decisions/0085-a-normalisations-guard-asks-what-the-normalisation-changes.md) | A future room control could arm the room-correction coupling. | **Disarmed by version**: M7 writes version 5; 7E2 proves a customer's 3600 × 2400 survives. |
| [0090](../decisions/0090-a-frozen-space-slides-with-its-run-and-follows-the-body-it-recorded.md) Amendment B, [0103](../decisions/0103-a-standing-body-is-re-planned-when-something-is-inserted-beneath-it-and-a-delete-leaves-it-alone.md) | No opening past the wall is derived or offered; an insert re-plans the column it touched. | **Inherited by generation** through `insertBody`. |
| [0095](../decisions/0095-romanian-is-the-source-and-lives-in-message-files-and-the-domain-publishes-codes-not-sentences.md) (and amendments A–D), [0106](../decisions/0106-the-price-books-display-prose-publishes-descriptors-and-the-book-keeps-the-tier.md) | Romanian is the source, in message files; the domain publishes codes; approved copy is pinned in one whole-file lock; a Romanian change is O1-class. | **Binds every new leaf.** Room issues, availability and the generation log publish codes (ADRs 0108–0110); Gate M7-C is Q8. |
| [0104](../decisions/0104-the-mockups-are-the-chrome-specification-and-the-strips-own-row-is-withdrawn.md), [0107](../decisions/0107-appliances-are-drawn-and-not-sold-and-a-language-is-named-in-its-own-language.md) decisions 1, 3 | The mockups are the chrome specification; the language control is a dropdown; an entry the engine cannot satisfy is removed, not greyed. | **Followed**: frames 1A–1F / D1A–D1F are the specification; the room screen carries the same locale menu; the list shows only fits. |
| [0105](../decisions/0105-the-e2e-job-splits-by-playwright-project-rather-than-raising-its-ceiling-again.md) | The e2e job splits by project; the ceiling came down to 45 minutes per leg. | **A risk to measure**: 7K reports what M7's specs add to each leg. |
| `DEVELOPMENT-SPEC.md` §13.3 q4, q5 | `LEVELS` and the two wall planes are constants of this room; presets have no per-preset geometry. | **Located** (D2 above); per-preset geometry is recipe data (ADR 0109). `LEVELS` stay constants — they are manufacturing heights; the room height only removes rows that no longer fit. |
| `docs/BACKLOG.md` 16, 29, 30 | Fit-to-run framing ruled, unbuilt; a refresh on the default route loses saved edits; the owner's proposal to mint at Step 1 and redirect. | 16 → 7H. 29 and 30 → 7E2 (ADR 0111), with Q7 confirming the demo half. |

**No record was found that contradicts or is ambiguous against ADRs 0108–0111.** The two places the
original plan contradicted a later record — the depth hand-over (ADR 0065) and the availability seam
(ADR 0062 decision 2 was never implemented as written) — are struck in place above.

## Wave plan — 2026-09-11

> **SUPERSEDED the same day by [*Re-plan after the owner's answers*](#re-plan-after-the-owners-answers--2026-09-11),
> which holds the current wave table.** Kept because most of its criteria carry over unchanged and
> the re-plan cites them by wave rather than restating them. What changed in this section, marked in
> place below: 7C's narrowing arm is retired and its criterion 3 was false; 7E1 criterion 4 and 7E2
> criterion 5 assumed the demo route stays; 7F2's *"no message suggests the linear shape"* no longer
> holds once linear is buildable; 7G's build-time thumbnails became a capture at save; Gate M7-C is
> withdrawn. The re-plan lists exactly which criteria carry over.

Domain first, then routing and persistence, then the six sub-states, then 3D, then the gates. Each
wave is ≤ 5 must-fix items and about five production files, paired tests not counted; where the two
message catalogues push a UI wave past five, the dispatch says so. Tiers follow `docs/WORKFLOW.md`.
Branch: waves land on `m7-room-and-presets`.

| Wave | Goal | Production files (likely) | Depends on | Tier | Visual at 390 × 844 | Owner |
| --- | --- | --- | --- | --- | --- | --- |
| **7A** | Room input validated against policy data; the form-boundary metres parser | `configurator-domain/src/room/room-policy.ts`, `src/room/validate-room.ts`, `src/index.ts`; `apps/web/src/room/parse-metres.ts` | — | **Full** | No | none (interim policy) |
| **7B** | Preset recipe; fixed-fit evaluator; the availability predicate; one evaluation for list and apply | `src/presets/preset-recipe.ts`, `src/presets/reference-l-recipe.ts`, `src/presets/evaluate-preset.ts`, `src/catalog.ts`, `src/index.ts` | 7A | **Full** | No | none |
| **7C** | Declared adjustment within the threshold; a preset's long remainder recorded as empty space | `src/presets/adjust-recipe.ts`, `src/presets/evaluate-preset.ts`, `src/presets/preset-recipe.ts`, `src/room/room-policy.ts` | 7B, 7D1 | **Full** | No | **blocked on Q2** |
| **7D1** | Generation shell: the structural corner plus recorded empty space fitted to the room | `src/generation/shell-design.ts`, `src/index.ts` | 7B | **Full** | No | none |
| **7D2** | Priority insertion through `insertBody`; the step log | `src/generation/generate-kitchen.ts`, `src/generation/generation-priorities.ts`, `src/index.ts` (+ a real-probe parity test in `three-adapter/tests`) | 7D1 | **Full** | No | none (interim priorities; Q3 is data) |
| **7E1** | `/configurator/room` route, URL state, proxy allow-list, `/` → Step 1 — **DONE, `57f1e94`** | `apps/web/src/proxy.ts`, `app/[locale]/configurator/room/page.tsx`, `src/room/room-url-state.ts`, `app/[locale]/page.tsx` | 7A | **Full** (every route) | Unstyled only | Q7 interim |
| **7E2** | Create the design (mint, then an awaited `PUT`), `/d/{id}` only after the write, editor back links, start-over, demo URL after first save — **DONE, `470e5c9`** | `src/room/create-design.ts`, `app/configurator/configure/configure-screen.tsx`, `app/d/[id]/design-load-error.tsx`, `src/store/configurator-store.ts` | 7B, 7E1 | **Full + security** | Light check | Q7 interim |
| **7F1** | 1A shape cards; 1B fields, corner toggle, live 2D plan | `src/room/room-screen.tsx`, `shape-picker.tsx`, `dimensions-form.tsx`, `plan-preview.tsx`, `room.module.css` (+ `messages/ro.json`, `ru.json`) | 7A, 7E1 | Light | **Yes** | Q8 at close |
| **7F2** | 1C validation state, shape refusal, the wall marked red | `dimensions-form.tsx`, `plan-preview.tsx`, `src/room/room-issue-copy.ts` (+ messages) | 7F1 | Light | **Yes** | Q5 interim |
| **7F3** | 1D skeletons; 1E list and cards — counts by band, finish summary, starting price, **Folosește** | `src/room/preset-list.tsx`, `preset-card.tsx`, `preset-card-model.ts`, `room.module.css` (+ messages) | 7B, 7E2, 7F1 | Light | **Yes** | — |
| **7F4** | 1F composition steps, struck *nu încape*, straight into the editor | `src/room/generation-steps.tsx`, `generation-model.ts`, `use-generation.ts`, `room.module.css` (+ messages) — **corrected 2026-09-14: `src/room/room-screen.tsx` is missing from this list and must change**, because the frames put *Cameră* on 1A–1C and *Preset* on 1D–1F and `RoomTopBar` hardcodes `room.title`. A file list that is wrong is worse than one that is absent | 7D2, 7E2, 7F1 | **Full** (kit lifetime) | **Yes** | — |
| **7G** | Preset thumbnails from the recipe; in-repo rig; recipe fingerprints | `app/internal/scene-shot/shot-request.ts`, `scene-shot.tsx`, `apps/web/scripts/capture-preset-thumbnails.mjs`, `src/room/preset-thumbnails.ts` (+ `public/presets/*.png`) | 7B, 7F3 | Light | Capture | Q4 (which recipes) |
| **7H** | The 3D room follows the design's room: shell planes and camera framing | `three-adapter/src/kitchen-shell.ts`, `three-adapter/src/stage.ts`, `apps/web/src/scene/kitchen-stage.tsx`, `apps/web/src/scene/scene-view.ts` | 7E2 | **Full** (3D, fidelity gate) | **Yes**, and desktop | — |
| **7I** | Corner to the right: the mirrored kitchen. **Owes 7E2's deferral**: `room-url-state.ts`'s `roomHrefFromDesignRoom` hardcodes `cornerDirection: "left"` (correct today, ADR 0111 decision 8 — absent means left) and must gain the optional field | `configurator-domain/src/design.ts` (optional `room.cornerDirection`), the adapter's scene root, `plan-preview.tsx`, `stage.ts`, `apps/web/src/room/room-url-state.ts` | 7H | **Full** | **Yes** | **blocked on Q6** |
| **7J** | Straight kitchens through composition | `src/room/room-policy.ts`, `src/generation/shell-design.ts`, `src/room/validate-room.ts` | 7D2, 7F2 | **Full** | **Yes** | **blocked on Q5** (only if *yes*) |
| **7K** | **The mobile gate**: touch through all six states into the editor, Back, reload, restore | `apps/web/tests/e2e/*` only | 7F1–7F4, 7G, 7H | Light (tests) | **Yes — the phase gate** | — |
| **7L** | The desktop line, D1A–D1F | `room.module.css`, `room-screen.tsx`, `plan-preview.tsx`, `src/room/validation-suggestion.tsx` | 7F1–7F4 | Light | Desktop 1440 × 900 | Q5 (D1C's suggestion) |
| **Gate M7-C** | The owner reads the new Romanian; the Russian is re-drafted for any edit; the owner checks the Russian | — | 7F4, 7L | — | — | **Q8** |

### Which waves can start before any owner answer

- **Now:** **7A**. Its punch list is below and needs nothing from the owner.
- **Then, on interims, in dependency order:** 7B → 7D1 → 7D2 in the domain; 7E1 after 7A; 7E2 after
  7B; 7F1–7F4, 7G, 7H, 7K and 7L after their dependencies. Every interim is named in the wave's own
  criteria and marked unapproved in the code.
- **Blocked:** **7C** (Q2), **7I** (Q6), **7J** (Q5, and only if the answer is *yes*).
- **M7 cannot close** until Q1 and Q3 are answered or their interim values are approved as they
  stand, Gate M7-C is passed, 7C / 7I / 7J are built or dropped by their answers, and Q4 is
  addressed.
- **Sequencing:** the four domain waves share `src/index.ts`, and `docs/WORKFLOW.md`'s tree-freeze
  and partial-staging rules apply — run them one after another. 7E1 touches only `apps/web` and may
  overlap 7B, but not while 7B's QA or review is reading the tree.

### Acceptance criteria per wave

Every criterion names what must not happen. *Property* means a `fast-check` property with a stated
range and, where the property branches, a **minimum sample count per arm** (`docs/WORKFLOW.md`,
*a predicate over a set*). Every wave ends with the affected per-package suites, `typecheck`, `lint`
and a whole-tree `pnpm format:check`.

**7A — see the dispatchable punch list below.**

**7B — preset recipe and fixed-fit evaluator** ([ADR 0109](../decisions/0109-a-preset-is-a-recipe-document-and-is-listed-only-if-the-product-would-never-mark-it.md))

1. *Property* over L rooms inside `INTERIM_ROOM_POLICY` (walls on a 1 mm grid, height likewise), with
   at least 100 samples in each of the *fits* and *does not fit* arms: `evaluatePreset` says *fits*
   **if and only if** the instantiated design has zero `validateDesignForCatalog` findings, no
   overflowing placement id and no unavailable body.
2. *Property*, monotonicity: if a recipe fits (A, B, H) it fits every larger room inside the policy —
   leftover wall never disqualifies (ADR 0067). Must not: any ranking or filter that reads the
   remainder.
3. **Make the two rules disagree:** a fixture recipe whose only finding is `PLACEMENT_PAST_WALL_END`
   (a mark the write seam accepts) evaluates to *does not fit*. A test that passes with the
   no-fatal rule is not a test of this wave.
4. Boundary: the reference recipe fits at exactly its furthest extent on each wall and at exactly its
   top, and not one millimetre below — equality fits (ADR 0083 decision 3). The extents are read from
   the recipe in the test, and the test states what it therefore does not prove.
5. Availability: in a test catalogue where one recipe body's type is not insertable, the recipe
   evaluates to *does not fit* with a code naming that build id, and **no design is returned**. The
   corner bodies and the seeded hob are available by presence. `toInsertableBody` and
   `resolveCatalogEquivalent` return exactly what they returned before, checked row by row over every
   catalogue entry at both declared depths.
6. One evaluation: applying a listed evaluation returns its design with `presetId` set and the
   caller's timestamps, **without calling the evaluator again** (spied), and — *property* over the
   sweep — every listed evaluation applies. Must not: a second code path that instantiates a recipe.
7. Evaluated at the recipe's declared depth only; the result's `settings.cabinetDepthMm` equals the
   recipe's. A shape the recipe does not support evaluates to *does not fit* before any geometry runs.
8. Must not: the evaluator narrows, removes, moves or re-orders a body; imports a price book; or
   returns a design carrying any validation finding.

**7C — adjustment and remainder** (blocked on Q2). Written against the recommended answer; revised
when Q2 is answered.

1. Only recipe-declared adjustable bodies narrow, only within `acceptsWidthMm`, only downward, and the
   total per wall never exceeds `policy.maxAdjustmentMm` (interim 300, the mockup's figure, marked
   unapproved until Q2(a)). Bodies after a narrowed one shift toward the corner by exactly the
   narrowing, so order and adjacency are preserved.
2. An adjusted card carries `{ wall, deltaMm }` and the adjusted design passes the same zero-findings
   rule. *Property:* adjusted ⇒ `0 < −deltaMm ≤ threshold`; an exact fit is never reported as
   adjusted; an adjustment is never applied without being reported.
3. ~~If Q2(d) is *yes*: a remainder of 300 mm or more is recorded as empty columns split at 800 mm, the
   design still has zero findings, and a remainder under 300 mm publishes no opening (ADR 0015).~~
   **Struck 2026-09-11 — the last clause was false** (ADR 0015 is a vertical threshold; ADR 0110
   Amendment A6), and the whole 7C section is superseded by the re-plan's 7C.

**7D1 — the generation shell** ([ADR 0110](../decisions/0110-generation-inserts-through-the-command-path-and-the-corner-is-structural-data.md))

1. *Property* over L rooms inside the policy: the shell has **zero** validation findings, including
   `RECORDED_SPAN_OVERLAPS_CORNER_BODY`; it contains exactly the structural corner pieces whose top is
   at or under the room height; no empty column is wider than 800 mm or rises above
   `min(room height, LEVELS' top)`; on each wall the recorded space and the corner together cover the
   wall's run with no gap and no overlap.
2. Deterministic: the same room gives a byte-identical shell.
3. Must not: write frozen-map arithmetic the commands already own. The recommended construction —
   the reference design with every non-structural body removed through `removePlacement`, then fitted
   to the room — is the wave's to confirm or to replace with a stated reason.

**7D2 — priority insertion**

1. *Property* over L rooms inside the policy, at least 50 samples each where the sink is placed and
   where it is not: every generated design has zero validation findings of either severity and no
   overflowing placement; same inputs → deep-equal design **and** log.
2. **No privileged path:** replaying the log's insertions on the shell with `insertBody` reproduces
   the generated design exactly. Must not: any placement the log did not produce.
3. The log lists every priority item exactly once, in priority order; an item is attempted only after
   every higher-priority item; *not placed* ⇒ absent from the design; *placed* ⇒ present exactly once
   with the logged build id.
4. Nothing crammed: every placed width is accepted by its entry (`acceptsWidthMm`) and at or above
   its floor. Leftover wall after *storage* is never logged as an issue.
5. The probe lease is released on every path, including a throw (the lease ledger in
   `tests/support/fake-probe.ts`).
6. A `three-adapter` parity test builds a sample of generated designs with the **real** probe: no two
   bodies intersect beyond `room-composition.parity.test.ts`'s shared-face tolerance, and every back
   face is on its wall plane except §11 row 19's two named exceptions.

**7E1 — route and URL state** ([ADR 0111](../decisions/0111-step-1-creates-the-design-through-the-existing-mint-then-save-and-the-room-entry-lives-in-the-url.md))

1. `/ro/configurator/room` and `/ru/configurator/room` render with the CSP nonce; `/ro/configurator/room/x`
   and a locale prefix in front of `/api` still 404 (`tests/proxy.test.ts` extended).
2. *Property:* the room query round-trips (parse ∘ serialise is the identity on valid states), and any
   string never throws and never reaches the domain unparsed; an invalid or missing value lands on the
   earliest sub-state that needs it, with that field marked.
3. The query carries shape, walls, height and direction only — never a placement, a price or a design.
4. `/` redirects to `/[locale]/configurator/room` (interim, Q7); ~~`/configurator/configure` is
   unchanged and all 34 e2e navigations to it stay green.~~ **Superseded 2026-09-11 (Q7):** the route
   stays unchanged *in 7E1 only*; waves 7E3 and 7E4 retire it.

**7E2 — creating the design** (security reviewer dispatched)

1. Choosing a preset writes exactly one row, however many times it is tapped (fake repository,
   concurrent taps). The stored document read back through `GET /api/designs/{id}` deep-equals the
   evaluated design.
2. Navigation to `/[locale]/d/{id}` happens **only after** the `PUT` resolves; a mint or `PUT` failure
   leaves the customer on Step 1 with the chosen card and a retry, and no navigation.
3. The editor opens on that design with no frame of the seed (`HydrateAndConfigure`'s rule held).
   `presetId` is the recipe id, or `null` for a generated kitchen.
4. **Adversarial:** a customer's 3600 × 2400 room survives save and reload unchanged (ADR 0069
   decision 5b, ADR 0085).
5. `‹ Cameră` and `Înapoi` lead to `/configurator/room` with the design's room filled in; the design
   stays reachable at its link. The load-error start-over leads to Step 1. ~~A demo design's first
   successful save replaces the URL with `/d/{id}` without a reload (interim, Q7).~~ **Superseded
   2026-09-11 (Q7):** no editor is reachable without an id; the pointer cookie is wave 7E3's.
6. Must not: `POST /api/designs` reads a body — a body sent to it is ignored, asserted; the write-token
   cookie's path and flags change; the locale reaches the document, a save payload or a revision.

**7F1–7F4 — the six sub-states on mobile.** Chrome follows frames 1A–1F (ADR 0104); the top bar
carries the step pill *1/4* with *"Pasul 1 din 4"* as its accessible name in **every** sub-state, and
the locale menu. Each wave's visual verifier captures the real surface at 390 × 844 and owns the
tree while it does (`docs/best-practices/browser-and-visual-qa.md`).

- **7F1:** three cards with 2D plan glyphs, never a dropdown; *Continuă* is disabled with no card
  chosen and with a refused shape. One field per wall of the chosen shape plus the height, `inputmode="decimal"`,
  tabular numerals, the unit inline, values shown with a decimal comma. The corner toggle exists
  **only** for L and U. The plan redraws on every keystroke and mirrors with the toggle. Must not: a
  3600, 2400 or 2600 constant anywhere under `apps/web/src/room` (the mockup's example is an example);
  a touch target under 44 px; horizontal overflow at 390 px.
  **Expanded 2026-09-14 into [*Wave 7F1 — dispatchable punch list*](#wave-7f1--dispatchable-punch-list),
  which is the binding version:** these become 17 numbered criteria, each naming whether a unit test, a
  component test, a property, the visual gate or a lint rule proves it. Three things that paragraph
  leaves implicit are settled there — the 7E2 back-link round-trip becomes criterion 7, the constant ban
  gets an AST mechanism and a gate on the gate (criterion 16), and the metre↔millimetre and comma↔dot
  conversions are placed at the form boundary rather than in the domain.
- **7F2:** the reason sits beside its field (`aria-describedby`), the plan marks the offending wall
  red, *"Presetele apar după ce toate valorile sunt valide."* is shown. *Property over every issue
  code, both locales:* the resolved message contains **no digit and no code**. The U refusal names no
  internal reason. ~~Until Q5, no message suggests the linear shape.~~ **Superseded 2026-09-11 (Q5):**
  the suggestion is shown once wave 7J makes linear buildable, and not before.
- **7F3:** the skeleton count is a constant of the layout and is identical for rooms with 0, 1 and 3
  fitting presets. The header's counts are an ICU plural. A card shows counts by band through
  `normaliseBand`, the finish summary through the existing finish and material resolvers, and its
  price through `describeStartingPrice` — and, after **Folosește**, the editor's figure equals the
  card's (asserted in 7K). A missing thumbnail paints nothing, never a broken image. Must not: a
  confirm screen, a card the evaluator did not list, or a card for a room the list was not computed
  for.
- **7F4:** ~~the steps render in the log's order with the frames' three states; *nu încape* items are
  struck through~~ **and** absent from the design that opens. *Property at the model:* for every valid room
  either at least one preset is listed or generation runs — no *"no results"* state exists. The kit
  lease is released even if the customer leaves mid-composition (ledger). The composition's duration
  on the verifier's device is **reported**, not assumed.
  **Expanded 2026-09-14 into [*Wave 7F4 — dispatchable punch list*](#wave-7f4--dispatchable-punch-list-the-composition-runs-and-the-kitchen-it-makes-is-the-one-that-opens),
  which is the binding version, and the struck clauses above are struck by rulings R11 and R12 —
  ruled by the coordinator 2026-09-14, not deferred to the owner.** They are struck **in place rather
  than rewritten**, so a reader who finds this paragraph alone sees what lost and why. **R11:** a
  6300 × 4700 room logs 4 core + 8 storage + ~11 upper steps, while frame 1F draws **four** rows, one
  of them the aggregate *Depozitare · restul peretelui* — so the rows are one per
  `GENERATION_PRIORITIES` role plus one storage row, **resolved from** the log rather than mirroring
  it. *"In the log's order"* was written before anyone had read the log's shape. **R12:**
  `generateKitchen` is **one synchronous call**, so the frame's middle state is a whole-list *pending*
  and never per-row progress — a paced reveal would be **animating a fiction**. The surviving clause,
  *absent from the design that opens*, is criterion 31. The owner's F8 answer — *"use the design that
  was proposed"* — points at the frame, which is what these rulings follow; the prose is a description
  of it and lost to it.

**7G — thumbnails.** ~~Every recipe has exactly one thumbnail, rendered from its own instantiated design
by `/internal/scene-shot`~~ **Superseded 2026-09-11 (ADR 0112 decision 6): captured at save** — the rest
of this paragraph describes the retired build-time rig: every recipe has exactly one thumbnail, rendered from its own instantiated design
by `/internal/scene-shot` (still opt-in in production, SEC-003's bounds unchanged); a manifest records
each recipe's fingerprint and a test fails when a recipe changes without a re-capture. Must not:
anything imported from `design-source/`.

**7H — the 3D room follows the design's room** (`lemnaria-3d-reference` skill applies)

> **Expanded 2026-09-14 into [*Wave 7H — dispatchable punch list*](#wave-7h--dispatchable-punch-list),
> which is the binding version of this bullet.** The **Anchor**, **Scaling rule** and **Structural
> dependencies** below were verified against the tree and stand. **Two clauses of the Criteria
> sentence are struck in place below**, by the owner's Q7H-1 ruling of 2026-09-14 and by the Q7H-5 it
> raised: the drawn shell and the seeded document have never been the same room, so *byte-identical at
> the seeded room* and backlog 21's still-open half could not both be honoured — and the owner ruled
> that the shell follows the entered room and the seeded picture is free to change. The punch list
> carries the reasoning; read it there rather than through this bullet.

- **Anchor:** the corner (0, 0, 0), where wall A's plane (z = 0, fronts +Z) meets wall B's (x = 0,
  fronts +X) — `packages/configurator-domain/src/room-transforms.ts:29-49` (**corrected 2026-09-14**:
  the file is the domain's, not the three-adapter's, and `:29` is where the convention is stated;
  `DEVELOPMENT-SPEC.md` §2 `:45-46` is its source). No body moves. **7H cites wave 7F1's criterion 12
  for the anchor rather than re-deriving it** — the 2D plan adopts this same convention, and a
  divergence between the two views is a defect neither side's unit tests can catch.
- **Scaling rule:** only the shell's floor, its two wall planes and the wall-A backsplash change
  extent. No body, appliance, sink, handle or chamfer scales.
- **Structural dependencies:** the run-end panel keeps following the records (ADR 0045), not the
  shell; the backsplash's relation to the base run is measured before it is changed.
- **Criteria:** ~~at the seeded room every shell child is byte-identical to today's and the M1 fidelity
  gate passes **without a re-baseline**~~ **— struck 2026-09-14 by the owner's Q7H-1 ruling; the shell
  follows the entered room, the seeded shell becomes 3560 × 2920, and what must hold is that the shell
  is a correct function of the room at every room in the policy. The M1 gate declaring nothing new
  still holds, for a different reason: the change lands downstream of the builder that gate diffs.**
  For every sampled room inside the policy, every placement's
  along-wall extent lies inside its wall's drawn plane and every body's top is at or under the drawn
  height. Camera presets become a function of the room ~~that returns `CAMERA_PRESETS` exactly at the
  seeded room~~ **— the fixed point is withdrawn under Q7H-5 for the same reason, pending the
  coordinator's confirmation; `CAMERA_PRESETS` is kept as the recorded starting point and the presets
  are judged at every sampled room**; §11 row 21 holds for sampled rooms **by capture at 390 × 844**,
  not by projection alone; backlog 16's fit-to-run framing on *Perete A* lands here, and backlog 21's
  remaining half closes here.

**7I — the mirrored corner** (blocked on Q6). With the direction left, every capture and every
parity test is unchanged. With it right, every body's world transform is the reflection of the
left-hand one, fronts face into the room and no face renders inside out (captured); picking, the
overflow mark and the cameras follow; the stored field is optional and its absence means left
(ADR 0053's argument).

**7J — straight kitchens** (blocked on Q5). A linear room asks for one wall and the height; its shell
has no corner; it goes straight to composition because no straight recipe exists; the generated
design passes every 7D2 property on wall A alone. What `depthMm` means for a one-wall room is 7J's to
decide and record.

**7K — the mobile gate.** Playwright's `mobile` project at 390 × 844, by touch: 1A → 1B → 1C → fix →
1D → 1E → **Folosește** → editor at `/d/{id}`; a room no preset fits → 1F → editor; Back from the
editor returns to the room with its values; a reload on `/d/{id}` and on a room query restores each;
the card's price equals the editor's. What M7's specs add to the `mobile` leg is reported against ADR
0105's 45-minute ceiling.

**7L — the desktop line.** D1A–D1F: step labels in the top bar, not a progress bar; the large live
plan beside the fields; D1C's actionable suggestion (its wording follows Q5); the four-up grid; D1F's
steps beside a preview that fills as bodies are placed — **proposed** as the 2D plan filling, which
the visual verifier judges against the frame's placeholder. A CSS fork only (§10.1): no rule and no
copy differs by viewport.

## Wave 7A — dispatchable punch list

**Tier: Full** (domain rules and a property sweep): adversarial QA, then logic and clean-code review
in parallel. **No visual surface.** **Owner answers needed: none.** **ADRs to check intent against
before starting, and to stop and report on if they disagree:**
[0108](../decisions/0108-a-room-is-validated-against-policy-data-and-the-interim-policy-is-the-engines-own-limits.md)
(this wave's decision), [0052](../decisions/0052-800-mm-is-the-ceiling-on-any-empty-column.md) (why
no product bound goes near the wire schema),
[0095](../decisions/0095-romanian-is-the-source-and-lives-in-message-files-and-the-domain-publishes-codes-not-sentences.md)
decision 3 (codes, not sentences), [0083](../decisions/0083-wall-coverage-is-the-runs-extent-and-the-finished-end-is-part-of-it.md)
decision 2 (the room is never a function of depth).

**Must-fix items (5):**

1. **`packages/configurator-domain/src/room/room-policy.ts`** — `RoomPolicy` (buildable shapes;
   per-shape, per-wall minimum and maximum; height minimum and maximum; `approval`) and
   `INTERIM_ROOM_POLICY` with `approval: "interim-unapproved"`. Every bound is **derived at module load,
   never written as a literal**: the L wall minima from the far along-wall edge of the reference
   kitchen's structural corner placements on each wall ~~(900 on both today)~~ **— the largest over
   every depth in `declaredCabinetDepthsMm()`, each wall-B piece positioned by
   `alongWallPositionAtMm` from the fixture's own depth: wall A 900, wall B 1000 (corrected
   2026-09-11, ADR 0108 Amendment A; see *Adjudication Q1.1* below)**; the maxima from
   `MAX_ROOM_WIDTH_MM` / `MAX_ROOM_DEPTH_MM`; the height minimum from `LEVELS[0]`'s top; the height
   maximum from `MAX_ROOM_HEIGHT_MM`. Buildable shapes: L only. Watch for an import cycle —
   `module-grid.ts`'s head comment records one that failed silently.
2. **`packages/configurator-domain/src/room/validate-room.ts`** — `RoomInput` (shape `linear | L | U`;
   the walls that shape has, in millimetres; height; `cornerDirection: "left" | "right"` for L and U)
   and `validateRoomInput(input, policy)` returning `{ ok: true; room: DesignRoom }` or
   `{ ok: false; issues: readonly RoomIssue[] }`. `RoomIssue` is exactly `{ field, code }` —
   `field` ∈ `shape | wallA | wallB | wallC | height`; `code` ∈ `SHAPE_NOT_BUILDABLE`,
   `VALUE_MISSING`, `VALUE_NOT_WHOLE_MILLIMETRES`, `WALL_TOO_SHORT`, `WALL_TOO_LONG`,
   `HEIGHT_TOO_LOW`, `HEIGHT_TOO_HIGH`. Shape first and alone; otherwise every field, in field order.
3. **The valid arm's room** — L maps to `{ shape: "L", widthMm: A, depthMm: B, heightMm }`, carrying
   no direction; it must parse under `DesignRoomSchema` unchanged.
4. **`apps/web/src/room/parse-metres.ts`** — `parseMetresToMillimetres(text)` for the form boundary:
   metres with a decimal comma or point, surrounding whitespace allowed; a non-zero digit past the
   third decimal is `notWholeMillimetres` (so `3,6000` is 3600 and `3,6005` is refused); worked on the
   **digit string**, never by multiplying a float. Returns `{ ok: true, mm }` or
   `{ ok: false, reason }` with `reason` ∈ `empty | notANumber | notWholeMillimetres | notPositive`.
   No `Intl`, no grouping separators, no sign, no exponent.
5. **`packages/configurator-domain/src/index.ts`** — export the policy, the input type, the
   validator and the issue types; nothing else changes in the package's public surface.

**Acceptance criteria:**

1. *Property* — boundaries inclusive, per field. For every wall and the height of the interim policy,
   and for every integer in `[min, max]` (sampled, plus both ends explicitly), a valid input changed in
   that one field reports no issue on it; `min − 1` reports exactly one issue on that field
   (`WALL_TOO_SHORT` / `HEIGHT_TOO_LOW`) and `max + 1` exactly one (`…_TOO_LONG` / `…_TOO_HIGH`).
2. **No number reaches a surface:** every `RoomIssue` produced anywhere in the suite has exactly the
   keys `field` and `code`.
3. *Property* — shape first: for `U` and `linear` under the interim policy the result is exactly
   `[{ field: "shape", code: "SHAPE_NOT_BUILDABLE" }]` for **arbitrary** dimensions, including missing
   and invalid ones.
4. *Property* — direction is never read: flipping `cornerDirection` leaves every result deep-equal,
   and no valid room carries a direction.
5. **Never rounded:** `3600.5`, `NaN` and `±Infinity` report `VALUE_NOT_WHOLE_MILLIMETRES`;
   *property* — every valid result's room values equal the input's exactly, and
   `wallLengthMm("A", room)` / `wallLengthMm("B", room)` return the entered A and B (the fit gate's
   own mapping, so the two cannot disagree).
6. *Property:* every valid result parses under `DesignRoomSchema`.
7. **The interim is honest and cannot drift:** `approval` is `"interim-unapproved"`; a test fails if
   any bound differs from the constant it is derived from, so hand-editing one to a chosen number turns
   it red; every maximum is at or below the wire bound for its axis; the seeded kitchen's own room
   (`KITCHEN_L_DESIGN.room`) validates under the interim policy.
   **Added 2026-09-11 (Adjudication Q1.1):** each L wall minimum **equals** — not merely *is at least*
   — the largest far edge of that wall's structural corner pieces in `setCabinetDepth`'s actual
   output at each declared depth; and a room at exactly the minima, taken to every declared depth,
   reports no overflowing placement.
8. **Parser table:** `3,60` → 3600; `3,6` → 3600; `3.60` → 3600; `" 2,605 "` → 2605; `3` → 3000;
   `0,45` → 450; `4,1` → 4100; `3,6000` → 3600; `3,6005` → `notWholeMillimetres`; `3 600`, `3.600,5`, `3e3`, `-3`,
   `+3`, `abc` → `notANumber`; `0` and `0,000` → `notPositive`; `""` and `"  "` → `empty`.
   *Property:* for every integer millimetre value in `[1, 99 999]`, rendering it as metres with a
   decimal comma (with and without trailing zeros) and parsing it returns exactly that value.
9. **Must not:** change `DesignRoomSchema`, `design-bounds.ts`, `validateDesignForCatalog` or any
   existing export's behaviour; put a Romanian string in `packages/configurator-domain` (6B-j's lint
   rule is the witness); add a dependency.

**Tests expected:** `packages/configurator-domain/tests/room/room-policy.test.ts`,
`tests/room/validate-room.test.ts`, `tests/room/validate-room.property.test.ts`, and
`apps/web/tests/room/parse-metres.test.ts`.

**Verification the coordinator runs:** `cd packages/configurator-domain && pnpm exec vitest run
tests/room`, then the package's `typecheck` and `lint`; `pnpm --filter @lemnaria/configurator-domain
build` before the web test (web resolves the domain from `dist/`); `cd apps/web && pnpm exec vitest
run tests/room`; whole-tree `pnpm format:check` last. QA should prove the interim-drift test (criterion
7) fails by editing one bound, and restore.

### Adjudication Q1.1 — 2026-09-11: the wall minima were derived at one depth

**Finding (QA, Medium):** `INTERIM_ROOM_POLICY`'s wall minima come from `KITCHEN_L_DESIGN` at its only
depth, 600. At 700 wall B's structural corner stands further out, so a 900 × 900 L validates, accepts
`setCabinetDepth(700)`, and is then marked on three structural bodies no cabinet edit can clear. Held
red by `packages/configurator-domain/tests/room/validate-room.adversarial.test.ts` (*"at a 700 mm
cabinet depth, wall B's minimum reaches its structural corner's far edge"*, `expected 900 ≥ 1000`).

**Classification: contract gap.** The implementation follows punch-list item 1 and ADR 0108 decision
6 exactly; the contract's derivation did not match the contract's own stated reason. Not a
test-fidelity problem: the test measures a state a customer reaches through the product's own
commands.

**Measured by the architect** (scratch run of `setCabinetDepth` over `KITCHEN_L_DESIGN` with the fake
probe, at both declared depths): **wall A's corner does not move** — `p25` is 0–900 at 600 and at 700,
because wall A is anchored at the corner. **Wall B's does**: `p26` 580–900 → **680–1000**, `p9` and
`p21` 330–900 → 400–970. QA's figures are confirmed.

**Ruling — [ADR 0108](../decisions/0108-a-room-is-validated-against-policy-data-and-the-interim-policy-is-the-engines-own-limits.md)
Amendment A:** each L wall minimum is the largest far edge of that wall's structural corner pieces
over **every** declared cabinet depth — **wall A 900, wall B 1000**. Owner question Q1's figures are
corrected above to match. `validateRoomInput` still reads no depth; the depth enters only the
module-load derivation of the constant.

**The implementer's change list (the tree is otherwise frozen):**

1. **`packages/configurator-domain/src/room/room-policy.ts`** — `farthestCornerEdgeMm(wall)` becomes
   the maximum, over every `depth` in `declaredCabinetDepthsMm()` (`worktop-depth.ts`), of
   `alongWallPositionAtMm({ placement, catalog: KITCHEN_L_BODY_CATALOG, fromCabinetDepthMm:
   cabinetDepthMmOf(KITCHEN_L_DESIGN), toCabinetDepthMm: depth }) + placement.body.widthMm / 2`, over
   the wall's structural corner placements. `alongWallPositionAtMm` (`along-wall-chain-shift.ts:121`)
   is the reader `setCabinetDepth` itself positions bodies with (`commands/set-cabinet-depth.ts:473`)
   and returns a wall-A coordinate unchanged, so no wall branch is written. Structural-ness keeps being
   read from `KITCHEN_L_BODY_CATALOG`: corner pieces are structural at every depth. **No numeric
   literal** — QA's literal-scan test still applies — and **no call to `setCabinetDepth`**, which
   needs a probe the domain does not have. Keep the empty-list throw; add one if
   `declaredCabinetDepthsMm()` is empty. Re-run QA's *first module loaded* test: the new imports
   (`along-wall-chain-shift.ts`, `worktop-depth.ts`, `design.ts`'s `cabinetDepthMmOf`) must not close a
   cycle through `room/`.
2. **The header comment on `INTERIM_ROOM_POLICY` and `farthestCornerEdgeMm`** — say the minimum holds
   the corner at every declared depth, and cite Amendment A.
3. **`packages/configurator-domain/tests/room/room-policy.test.ts`** (the implementer's paired test;
   QA's adversarial file is not edited) — replace any expectation computed from `KITCHEN_L_DESIGN` at
   its single depth with an **independent** re-derivation: run `setCabinetDepth` (with
   `createFakeProbeFactory()` from `tests/support/fake-probe.ts`) on `KITCHEN_L_DESIGN` at each
   declared depth, take the largest structural-corner far edge per wall from the **command's output**,
   and assert the policy minimum **equals** it (`toBe`, not `toBeGreaterThanOrEqual`). The command and
   the policy share the chain reader, so state in the test what it does *not* prove: that the reader
   matches built geometry, which `three-adapter/tests/room-composition.parity.test.ts` holds at both
   depths.
4. **Add the boundary pair**, same file: a design holding only `KITCHEN_L_DESIGN`'s structural corner
   placements, in a room at exactly the interim minima (A 900, B 1000, height from the policy's range
   at or above the corner's top), taken through `setCabinetDepth` to every declared depth, reports
   `findOverflowingPlacementIds(...) = []` at each; the same with wall B one millimetre shorter reports
   the wall-B corner pieces at 700. If `setCabinetDepth` refuses the corner-only design for a reason
   unrelated to this finding, **stop and report** rather than work around it.
5. **Expected result:** QA's four-case `it.each` goes green (A at 600/700: 900 ≥ 900; B: 1000 ≥ 900,
   1000 ≥ 1000) with no edit to QA's file; every existing boundary property keeps passing because it
   reads the bounds off the policy. Rebuild the domain `dist/` before any web test reads it.

**QA's secondary point.** A mutation deriving wall B's minimum from wall A's corner survived because
both were 900. After the fix they are 900 and 1000, so that mutation yields 900 for wall B and QA's
wall-B-at-700 case fails on it. The **reverse** mutation (wall A from wall B's corner → 1000) would
still satisfy QA's `≥` cases; item 3's equality assertion is what kills it — QA should apply both
mutations after the fix and confirm each goes red.

### 7A close-out ruling — 2026-09-11: the owner approved the L bounds (ADR 0108 Amendment B)

The owner answered Q1 — *"1. Yes looks like good boundaries"* — so 7A commits with the approved policy,
not the interim one. **Approved bounds are named literals of product data** in
`src/room/approved-room-policy.ts` (`APPROVED_ROOM_POLICY`, `approval: "owner-approved"`: wall A
900–6300, wall B 1000–5100, ceiling 2200–3900, L only). **The engine's limits stay derived** and are
renamed `ENGINE_ROOM_LIMITS` in `room-policy.ts`, no longer exported from the package. A guard test
holds every approved bound inside the engine's, and a pin test holds the six numbers to Amendment B's
table. Why literals: the owner approved numbers, and a derived bound would move under a later
engineering change without the owner — ADR 0108 Amendment B, decision B1. Linear and U stay refused
until their waves (B2). The ceiling minimum moves 860 → 2200 for the product only; nothing in
production read 860, and every fixture room is 2600. The change list sent to the coordinator:

1. New `approved-room-policy.ts` (named constants, the owner's words and Amendment B cited, type-only
   imports).
2. Rename `INTERIM_ROOM_POLICY` → `ENGINE_ROOM_LIMITS`; derivation and approval value unchanged; test
   references renamed mechanically, no assertion changed.
3. `src/index.ts` exports `APPROVED_ROOM_POLICY` and stops exporting the engine object.
4. New `tests/room/approved-room-policy.test.ts`: approval; shapes ⊆ the engine's; approved min ≥
   engine min, approved max ≤ engine max, min < max, per field; the literal pin; the seeded and
   narrowed fixture rooms validate; the guard proved to fire by a temporary edit, then restored.
5. The boundary property also runs on `APPROVED_ROOM_POLICY` (2199 / 2200 / 3901; B 999 / 1000;
   A 899).
6. Must not touch `validateRoomInput`, `DesignRoomSchema`, `design-bounds.ts`, the derivation, or any
   QA assertion.

### 7A close-out — 2026-09-11, `8df0d49`

**What shipped:** `validateRoomInput(input, policy)`, publishing `{ field, code }` issues only.
`APPROVED_ROOM_POLICY` — the owner-approved literals from the ruling above, L only, wall A
900–6300, wall B 1000–5100, ceiling 2200–3900 (ADR 0108 Amendment B). `ENGINE_ROOM_LIMITS` —
derived, unexported; each L wall minimum is the corner's farthest reach over every declared cabinet
depth (Amendment A). `parseMetresToMillimetres` in `apps/web/src/room/parse-metres.ts`. ESLint
import boundaries widened to any depth via an anchored regex.

**Verified at the commit by the coordinator:** domain **3934/3934**, web `tests/room` **96/96**,
whole-workspace `pnpm lint` exit 0, domain typecheck exit 0, whole-tree `pnpm format:check` clean.
The 7A code commit ran the pre-commit hook (format and lint) normally.

**QA round 1** (Q1.1–Q1.5): Q1.1 (Medium) — the wall-B minimum held only at 600 mm depth, because
at 700 the corner reaches 1000 mm; a contract gap, ruled as Amendment A above. Q1.2–Q1.5 — weak
tests (the validator ignoring its own policy, a float-multiplying parser, a drift test blind to
same-value literals, a depth-read regex keyed to a name list); closed by QA's own tests.

**QA round 2** (Q2.1–Q2.3): Q2.1 — the ESLint pattern matched only `../../`; fixed to match any
depth. Q2.2 — a ceiling under 2600 mm makes the seeded top row `PLACEMENT_ABOVE_ROOM`; deferred to
waves 7B/7C/7D, ADR 0109 Amendment B. Q2.3 — informational only, no change.

**Logic review** (R1.1–R1.3): R1.1 — the domain's `../three-adapter` / `../catalog-data` boundary
patterns had the same depth gap as Q2.1; fixed alongside it. R1.2 — `**/apps/**` over-matched bare
specifiers; replaced by an anchored regex. R1.3 — the exemption comment now cites QA's type-only-
import test as the structural guard it relies on. The reviewer also found that 7C's low-ceiling fix
cannot remove the structural corner `p21` (`canDelete: false`); ADR 0109 Amendment B was corrected
in place to filter it at instantiation rather than calling `removePlacement` on it.

**Clean-code review:** C1.1 — an `index.ts` comment claimed wiring that does not exist; reworded.
C1.2 — a nit; both guards were kept as written.

**Deviations — extra files touched beyond the wave's named production set:**
`demo-room-envelope.test.ts` (a named exemption plus a depth-read check, closing Q1.2–Q1.5's weak
coverage) and `eslint.config.mjs` (the anchored-regex fixes for Q2.1 and R1.1/R1.2).

**Process note:** rtk's output filter twice falsified a result this wave — it reported an ESLint
`--stdin` probe as "No issues found" when it had flagged an error, and it reported prettier
`--check` on docs as passing when it was not. Both were caught only by re-running with `rtk proxy`.

## Re-plan after the owner's answers — 2026-09-11

### What the answers settle

| Question | Owner's ruling (quoted in full above, at each question) | Record | What it changes |
| --- | --- | --- | --- |
| Q1 bounds | *"Yes looks like good boundaries"* | ADR 0108 Amendment B | 7A commits with approved literals; linear and U bounds come with their waves (F1). |
| Q2 leftover | *"maximum 599 ... fix exactly what fits and let the edges empty ... it should look like a empty column"* | ADR 0109 A, ADR 0110 A | No narrowing; ≤ 599 mm bare per run; the space is an ordinary empty column. |
| Q3 generation | *"fridge, sink, and hub ... a cabinet to have that preparation surface ... a kitchen minimum should have sink and hub"* | ADR 0110 A | Layout order, minimum kitchen, a second Step 1 refusal. Uppers (F2) and drop order (F3) open. |
| Q4 presets | *"a temporary button ... I will prepare a library of presets ... +- 600 mm, you show me the preset"* | ADR 0112, ADR 0109 A | A new feature: owner-authored library behind a server gate; ±600 matching; adaptation from the edges (F4). |
| Q5 shapes | *"need to do also the U shaped ... all kitchen shapes (exluding island)"* | this re-plan | Linear in M7 (7J); U proposed as M7B. |
| Q6 mirror | *"Yes mirror, plus this mirroring especially of corner cabinet will help in building the U shape"* | ADR 0108 decision 5 stands; 7I | 7I unblocked; its mirror works on one group so M7B can mirror the corner alone. |
| Q7 visitor | *"custom link for each user ... on reopening ... load its previous configuration ... only with custom user uuid"* | ADR 0111 A | Editor only at `/d/{id}`; pointer cookie; demo route retired; e2e migration first. |
| Q8 copy | *"Mark as approved at the moment"* | ADR 0113 | Gate M7-C withdrawn; leaves enter the lock in their own wave; Russian approved by the same ruling. |

### Scope, and a ~~proposed~~ **confirmed** split: M7 and M7B

> **Confirmed by the owner, 2026-09-11:** *"Yeah let make separate"*.

~~**Proposed:**~~ **Confirmed:** M7 keeps Step 1 for the **L** (left and mirrored right) and for **straight** kitchens,
composition, the owner's **preset library** and its matching, the **returning visitor**, and the 3D
room following the entered room. **U-shaped rooms become M7B**, planned in their own file when M7's
domain waves have landed. Order: **M7 → M7B → M8**. Nothing ships before every milestone is done, so
the split costs no release.

Why, measured in the tree:

1. **U changes the stored document and everything keyed on two walls.** A third wall reaches
   `DesignWallSchema` and `DesignRoomShapeSchema` (`design.ts:48-52`), the wall transforms
   (`room-transforms.ts:34-49`), the column key and along-wall helpers (`module-grid.ts:67-94`),
   `wallLengthMm` (`queries/overflowing-placements.ts:45-50`), the validator's across-wall bound and
   corner-overlap check (`validate-design.ts`, `findCornerOverlaps` at `:916`), the corner chain's
   `WALL_THE_CORNER_IS_TAKEN_FROM = "B"` (`along-wall-chain-shift.ts:48`), the storage bounds that are
   derived from two wall runs (`design-bounds.ts:57-60, 107`, hence `MAX_PLACEMENTS` and
   `MAX_DESIGN_BYTES`), the shell and cameras, the price breakdown's wall grouping, and M8's review.
   That is a cross-cutting change through M2–M6 code, and it earns its own plan, sweep and review.
2. **U is built from M7's parts**: the mirror (7I), the shell and composition (7D1/7D2), the Step 1
   screens, and the approved-policy mechanism. Planning it before they exist would plan against
   guesses.
3. **Its bounds need the owner**, and the question is only answerable once the shape exists on
   screen.
4. **M8 after M7B**, because M8's review groups by wall → band → order; doing M8 first would rework it
   for wall C.

*Alternative, kept one milestone:* rejected — well over twenty waves with a stored-schema change in
the middle, and a milestone that cannot close for a long time is how its wave table goes stale
(`docs/WORKFLOW.md`, *The scribe runs after the commit*).

**What U means for stored documents** — recorded now so M7 does not paint M7B into a corner:

- Widening `DesignWallSchema` to `A | B | C` and adding `"U"` plus an optional third wall length is
  **additive**: every stored document stays valid, so no migration arm is owed for old documents
  (ADR 0053's argument). The hazard runs backward — a document using wall C is unreadable by an older
  build — which is the same no-rollback note `DesignSettingsSchema.finish` already carries.
- The storage bounds grow with a third wall run, which moves the write seam's byte cap on purpose.
- **The right-hand L that 7I builds is a mirrored left L** (`room.cornerDirection`, optional, absent =
  left). M7B decides whether it stays that or is re-expressed as walls A + C; if the latter, stored
  right-hand documents need a version-keyed migration arm (ADR 0055's precedent). Either way it is a
  pre-launch change: the first stored schema is M8's decision (ADR 0111 decision 8; ADR 0038).
- **§13.3 q4, answered for U:** `LEVELS` are manufacturing heights and stay constants for every wall.
  What becomes per-wall data is each wall's transform, its length, and which wall a corner takes its
  reach from.

### The leftover rule (Q2), reconciled

**The rule:** whatever the product *proposes* — a composed kitchen or an adapted preset — leaves **at
most 599 mm** of bare wall at the end of any run. A bare stretch of 600 mm or more receives 600 mm
storage bases; the remainder stays an ordinary empty column, placed by the same commands a customer
uses, so it looks and behaves *"exact like after you remove the cabinets"*.

| Record | Reconciliation |
| --- | --- |
| [0015](../decisions/0015-min-span-is-exclusive.md) | **No conflict.** Its 300 mm is a *vertical* span threshold. This plan said otherwise twice; both sentences are struck (ADR 0110 Amendment A6). |
| [0043](../decisions/0043-an-empty-space-of-any-width-is-a-legal-state.md), [0044](../decisions/0044-an-empty-space-is-recorded-in-the-design-document.md), [0053](../decisions/0053-the-design-document-records-the-whole-frozen-map.md) | Empty space of any width is legal and recorded — which is what the owner asked the leftover to be. The 599 cap binds proposals, not customers' own edits. |
| [0046](../decisions/0046-adjacent-empty-columns-merge-under-a-cap-and-an-insert-splits-its-column.md), [0052](../decisions/0052-800-mm-is-the-ceiling-on-any-empty-column.md) | `insertBody`'s split already records the remainder; a ≤ 599 mm column is under the 800 mm ceiling. |
| [0067](../decisions/0067-leftover-wall-is-the-normal-case-and-the-price-is-a-floor.md) | Leftover is still normal and still never reported. The cap does not report a remainder; it decides, at proposal time, that 600 mm or more holds a cabinet. |
| Owner's sizes | *"one door 599-350, bottle cargo 300"* — the catalogue builds `base-cabinet` 200–800 with one door up to 600 (ADR 0030, 0033) and `base-bottle-cargo` 200/300 (ADR 0026), so the space accepts at least what the owner named. |

### Generation (Q3) — ADR 0110 Amendment A

Left to right as seen from inside the room — on a left-corner L, from wall B's free end toward the
corner, then along wall A — **fridge → sink → preparation cabinet → hob with the oven under it**, then
storage, then the leftover rule. The fridge stands wherever that order puts it. **A room that cannot
hold a sink and a hob** gets no kitchen: generation returns *minimum not met*, and Step 1 goes back to
the dimensions with a room-level reason that carries no number. The approved bounds admit such rooms
(a 900 × 1000 L), and they stand (ADR 0108 Amendment B). Drop order (F3) and upper cabinets (F2) run
on their defaults.

### The preset library (Q4) — ADR 0112, ADR 0109 Amendment A

The owner generates a kitchen, adjusts it in the editor and saves it; customers later see it when
their room is the same shape and every wall is within ±600 mm of the room it was saved in. **The fit
invariant still binds**: a preset larger than the room loses whole columns from the free end of each
run until it fits, never the sink, the hob or the corner, and then takes the leftover rule; one that
cannot is not shown. Every change is declared on the card. The library lives in a new `presets` table;
authoring is behind a **feature flag and an owner secret, both checked on the server**, and a save
snapshots the stored design by id. **Full tier with a security reviewer** for the table, the gate and
the save endpoint.

### The returning visitor (Q7) — ADR 0111 Amendment A, ADR 0114

~~A per-visitor cookie holds the id of the design this browser may edit;~~ **Superseded the same day
by the owner's security requirement** — *"no JavaScript script will be able to read these values ...
nobody will be able to open it accidentally or like a hacker. So maximum attention for this."* — and
designed in [ADR 0114](../decisions/0114-a-visitor-is-a-host-only-httponly-secret-and-a-design-link-opens-only-in-its-own-browser.md):
one `__Host-lemnaria_visitor` cookie holding a **256-bit random secret, never the design id** —
`HttpOnly`, `Secure`, `SameSite=Lax`, host-only, `Path=/`, 30 days sliding — whose hash is stored on
each design the browser mints. No script reads or writes it and nothing mirrors it. The write token is
**not** the identity: it is scoped to `/api/designs/{id}` and never reaches `/`. `/` and
`/configurator/configure` resolve on the server to the visitor's latest design's `/d/{id}`, or to
Step 1. The editor is never rendered anywhere else. The e2e suite and two tooling probes move off the
retired route **before** it redirects.

**The tension ADR 0114 surfaces:** a URL leaks, and today a design link is a read capability for
whoever holds it. Recommended — reads require the owning browser, sharing becomes an explicit later
action — changes ADR 0002 and ADR 0019 decision 1 and is put to the owner as **F5**; it is wave 7E3b
and waits on the answer. The preset-author credential stays separate: the visitor cookie grants
nothing on the save endpoint. Nothing is pulled forward from M8's abuse controls; M8's limiter and WAF
scope gain `/` and `/d/*`. **Both waves are Full tier with a security reviewer.**

### Copy (Q8) — ADR 0113

No end gate. Each wave that adds a Romanian leaf adds it to the copy lock and the golden manifest in
the same commit, citing ADR 0113; its Russian draft is approved by the same ruling.

### Revised wave table

Criteria marked *carried* are the earlier plan's, above, unchanged; everything else is below this
table.

| Wave | Goal | Production files (likely) | Depends on | Tier | Visual | Owner |
| --- | --- | --- | --- | --- | --- | --- |
| **7A** | Room validation; the approved L policy — **DONE, `8df0d49`** | as above, plus `src/room/approved-room-policy.ts` | — | Full | No | answered (Q1) |
| **7D1** | Composition shell for the L — **DONE, `f5b4cd9`** | `src/generation/shell-design.ts`, `src/index.ts` | 7A | Full | No | — |
| **7D1b** | The run-end panel veto at wall A's end (ADR 0045 Amendment A); B3a's reserve removed — **DONE, `f61c361` + `85091cc`** | `run-end-panel.ts`, `three-adapter/src/kitchen-shell.ts`, `three-adapter/src/scene-sync.ts`, `apps/web/src/scene/kitchen-stage.tsx`, `src/generation/shell-design.ts` | 7D1 | Full | **Yes** | answered (backlog 64 ruling) |
| **7D2** | Composition in the owner's order; minimum kitchen; leftover rule; step log; the row plan and shell tiled at its boundaries — **DONE, `4133cdc`** | `src/generation/generate-kitchen.ts`, `src/generation/generation-priorities.ts`, `src/generation/leftover-rule.ts`, `src/generation/shell-design.ts` (the plan argument), `src/index.ts` | 7D1 | Full | No | answered (F2, F3, F7) |
| **7D3** | Tall units at the run ends and the oven rule: one `tall-oven-tower` at wall A's free end where the run affords it, and the hob base follows it | `src/generation/tall-end-rule.ts` (new), `src/generation/generation-priorities.ts`, `src/generation/generate-kitchen.ts`, `src/index.ts` | 7D2 | Full | No | fully answered 2026-09-14 — the tall-unit rules, the block and its composition, the oven-beside-fridge ruling, the top-row exclusion, QT-1/QT-2/QT-6 (owner); QT-3/QT-4/QT-5 (coordinator). ADR 0110 Amendment E, E1–E12. **Dispatch gate: run wave 7D6's pre-flight first** — derive the corner reach at 600 mm and assert it is 900; if it is not, this wave's threshold table is re-measured before its criteria are written |
| **7D4** | **A long storage run is composed, not repeated**: the storage cycle, the per-kitchen sequence carried across the corner, and the preparation cabinet's drawer body. **Changes which body fills a slot, and never how many slots there are or how wide they are** | `src/generation/body-choice.ts` (new), `src/generation/generation-priorities.ts`, `src/index.ts` | **7D3** — file collision, and the block spends the free-end modules first (D0) | Full | No | **answered 2026-09-14** — R1, R2, R4, R6, R11, and the wall row withdrawn (D8). ADR 0110 **Amendment F is slice S0 and is not written**. Q-7D4-1…4 are **confirmations, not gates** |
| **7D5** | **The run gains the two bodies that take width**: the dishwasher (600 mm, adjacent to the sink, across the corner counting) and the bottle cargo (300 mm, after the hob). **Re-baselines 7D3's block-threshold table and restates its criterion 12** | `src/generation/generation-priorities.ts`, `src/generation/generate-kitchen.ts`, `src/generation/body-choice.ts` | **7D4**, and 7D3 through it | Full | No | answered — Q-D1 twice (2026-09-14, and the corner clause 2026-09-15); **Q-D2 open and blocks this wave only** |
| **7D6** | The corner's along-wall reach is **derived from the cabinet depth** instead of carried as the fixture's 900 / 320 / 570 literals — the owner's *"correct shape and size"*. **Carries the pre-flight gate on 7D3** and may move an owner-approved wall minimum. **Deadline: land before 7P2** — once presets are saved the reach is load-bearing on stored data and stops being freely re-derivable | `src/room/room-policy.ts`, `src/generation/shell-design.ts` (run-start helpers), `src/fixtures/kitchen-l-design.ts` (corner widths), a new pure derivation module, `src/index.ts` | 7D1 (shipped) | **Full** | No | none to dispatch; **Q-K1 arises only if a number moves, and is a conversation, not a migration** |
| **7D7** | The corner **builders** take their size as a parameter — `DEVELOPMENT-SPEC.md` §13.3 open question 6, corner half only. **Ordering: its fidelity baseline is taken *after* 7H lands, never before. Deadline: before 7P2**, with 7D6 | `packages/three-adapter` corner builders (+ fidelity and parity coverage) | **7D6, and 7H for ordering** | **Full** (3D, fidelity gate) | **Yes**, both depths | — |
| **7E1** | `/configurator/room`, URL state, proxy, `/` → Step 1 — **DONE, `57f1e94`** | *carried* | 7A | Full | Unstyled | — |
| **7E2** | Create the design; `/d/{id}` only after the write; back links — **DONE, `470e5c9`** | *carried*, minus the demo-URL item | 7E1 | Full + security | Light | — |
| **7F1** | 1A shape cards; 1B fields, toggle, live plan — **DONE, `5d2ff54`** (five slices), with the visual gate's D1–D3 fixed at `852df10`; **its D4 and D5 are closed by 7F1-D45, not here** | *carried*, plus `room/metres-text.ts`, `room/room-draft.ts`, `room/plan-preview-model.ts`, `room/room-url-state.ts` (two exports), `room/room-policy.ts` + `src/index.ts` (`isShapeBuildable`), `eslint.config.mjs`, `messages/ro.json` + `ru.json` | 7A, 7E1 | Light | **Yes** | answered (F8) — all three cards drawn |
| **7F1-D45** | Back keeps the room the customer typed: the debounced `router.replace`, the client-derived sub-state, the departure flush and the traversal e2e (R9) — **DONE, `8437c95`**, review fold `6682d8e` | `room/room-query-sync.ts` (new), `room/room-screen.tsx`, `app/[locale]/configurator/room/page.tsx`, `eslint.config.mjs` (+ `tests/e2e/room-traversal.qa.e2e.spec.ts`) | 7F1 | Light | **Yes** | none |
| ~~**7F4**~~ | ~~1F composition steps into the editor~~ — **split 2026-09-14 into 7F4a and 7F4b (Q7F4-2, coordinator)**, because the two halves fail differently and different instruments catch them | | | | | |
| **7F4a** | The composition runs and is drawn: 1F's rows, the borrowed kit, the measured cost — **DONE, `bf6901b` + `37f1ecb` + `6113176` + `52504d1`**; `ci:local` and the push are **pending** | `src/room/generation-model.ts`, `use-generation.ts`, `generation-steps.tsx`, `room-screen.tsx`, `room.module.css` (+ messages) | 7D2, 7F1 | **Full** (kit lifetime) | **Yes** | Q7F4-1 **answered** — the owner's words for 1F, 2026-09-15 |
| **7F4b** | The hand-off into the editor: one attempt, one row, navigation after the write | `src/room/use-generation.ts`, `generation-steps.tsx`, `room.module.css` (+ `tests/e2e`) | **7F4a**, 7E2 | **Full** | **Yes** (short) | — |
| ↳ | ***Minimum not met* → 1C needs no new screen** (carried from the struck row, answered 2026-09-14): 7A2's `ROOM_TOO_SMALL_FOR_KITCHEN` already resolves such a room to 1C **before** generation runs, and the sentence there is **7F2's**. The generator's own refusal arm is unreachable from 1D and is asserted so, not drawn for (R16) | | | | | |
| **7T** | **The live persistence suite actually runs.** Five live suites gate on `DATABASE_URL`, which `ci.yml` deliberately never sets, so the database seam's live coverage has been **green by never executing**. Re-gate what is safe to re-gate onto `TEST_DATABASE_URL`, run it, and **report what it finds** — a red suite is the finding, not a reason to re-skip. **Ordered before 7P1** so the repository never holds two meanings of *"the persistence tests pass"* at once (coordinator's ruling on Q-7P1-1, 2026-09-15) | `packages/persistence/tests/*` (gating only), `tests/support/exclusive-migration-access.ts` (new, test support — T-J2's advisory lock), `.github/workflows/ci.yml`; **no production file** | — | Full (test infrastructure; CI is its verdict) | No | — |
| **7P1** | The preset store: migration, record schema, repository, read path, backup export | `persistence/src/migrations/0005_create_presets.sql`, `persistence/src/preset-repository.ts`, `configurator-domain/src/presets/preset-record.ts`, `apps/web/src/lib/server/backup-designs.ts` | 7A | Full + security | No | — |
| **7P2** | Authoring gate, save endpoint, editor button. **This wave is the project's freeze point**: the owner's *"a critical moment will be when I will start to save presets"*. From here the corner's reach, the wall minima and `ROOM_TOO_SMALL_FOR_KITCHEN` are load-bearing on stored data — **geometry that wants re-deriving (7D6, 7D7) lands before this, not after** | `apps/web/src/lib/server/preset-authoring.ts`, `app/api/preset-authoring/session/route.ts`, `app/api/presets/route.ts`, `src/panel/save-as-preset.tsx`, `app/[locale]/d/[id]/page.tsx` | 7P1, 7E2 | Full + security | **Yes** (owner surface) | — |
| **7G** | Thumbnail captured at save, stored, served — **and backfilled for every preset authored before this wave** (coordinator's ruling on Q-7P1-2, 2026-09-15). 7P2 ships the save before this wave ships the capture, so presets authored in the gap would otherwise have no thumbnail and no way to acquire one: the application holds no `UPDATE`. **Not accepted** — those presets are the owner's first authored artefacts and the first data here that cannot be re-derived. The backfill re-captures from each preset's own snapshot (ADR 0112 decision 6) and needs only a **column-level** grant, so `status` stays unwritable by the application | `src/panel/capture-preset-thumbnail.ts`, `app/api/presets/[id]/thumbnail/route.ts`, `preset-repository.ts`, the thumbnail migration (not created by 7P1 — ruling P5) | 7P2 | Full + security (upload) | Capture | — |
| **7B** | Preset matching: ±600 window, fit, availability, one evaluation. **DEFERRED PAST M8 with the rest of the preset story (coordinator, 2026-09-15) — and this is DERIVED, not an independent choice**: matching searches the preset library, and **there is no library until the owner authors one**, which the owner has deferred past M8. It is not separately revisable — if the preset store moves, this moves with it, for that reason and no other | *carried* files; revised criteria below | 7A, **and a populated library** | Full | No | — |
| **7C** | Preset adaptation from the free ends and **below a low ceiling**; leftover rule; declared changes. **DEFERRED PAST M8**, by 7B's derivation — it adapts what 7B matched, so it cannot precede it | `src/presets/adapt-preset.ts`, `src/presets/evaluate-preset.ts`, `src/index.ts` | 7B, 7D2 | Full | No | answered (F4, F7) |
| **7A2** | The coupled room rule: the room must hold a sink and a hob (`ROOM_TOO_SMALL_FOR_KITCHEN`), tied to the generator by a property — **DONE, `f97d621`** | `src/room/room-policy.ts`, `src/room/approved-room-policy.ts`, `src/room/validate-room.ts` | 7D2 | Full | No | answered (F6) |
| **7F2** | 1C validation state, incl. *minimum not met* | *carried*, plus the room-level reason | 7F1, 7D2 | Light | **Yes** | — |
| ↳ | **Owes, from 7F1's rulings R2/R3 (2026-09-14):** the refusal sentence for a non-buildable shape, which 7F1 ships silent and asserted; and 1C as a **live** state reached by typing, so reasons appear and clear mid-field | | | | | |
| **7F3** | 1D skeletons; 1E list from the library, with declared changes | *carried*, reading 7P1 | 7C, 7E2, 7F1, 7P1 | Light | **Yes** | — |
| ↳ | **Owes, from 7F1's ruling R2 (2026-09-14):** *Continuă* at 1B, which 7F1 leaves pushing the canonical query and nothing more | | | | | |
| **7E4** | e2e and tooling off `/configurator/configure` | `apps/web/tests/e2e/*`, `playwright.config.ts`, `scripts/capture-fidelity.mjs` | — | Light (tests; CI is the verdict) | No | — |
| ~~**7E3**~~ | ~~Returning visitor: pointer cookie~~ — **split 2026-09-11 into 7E3a and 7E3b (ADR 0114)** | | | | | |
| **7E3a** | Visitor identity: the `__Host-` secret cookie, the visitor-hash column and its migration, mint linking, server-side resume; editor only at `/d/{id}` | `persistence/src/migrations/0006_add_design_visitor_hash.sql`, `persistence/src/neon-configuration-repository.ts`, `apps/web/src/lib/server/visitor.ts`, `app/api/designs/route.ts`, `app/[locale]/page.tsx` (+ `configurator/configure/page.tsx`) | 7E2, 7E4 | **Full + security** | Light | — |
| **7E3c** | The private share link: create, revoke, re-issue; `/[locale]/s/{token}` read-only view (ADR 0114 Amendment B) | `persistence/src/migrations/00NN_create_design_share_links.sql`, `persistence/src/share-link-repository.ts`, `app/api/designs/[id]/share/route.ts`, `app/[locale]/s/[token]/page.tsx`, `src/panel/share-design.tsx` (+ `proxy.ts` allow-list) | 7E3a | **Full + security** | **Yes** | answered (F5 final, ADR 0114 C, ADR 0115) |
| **7E3b** | A design opens only in its owning browser; ~~the read-only share view retired~~ **the read-only view moves to the share link** | `app/[locale]/d/[id]/page.tsx`, `app/api/designs/[id]/route.ts`, `app/d/[id]/design-load-error.tsx`, `lib/server/visitor.ts` | 7E3a, **7E3c** | **Full + security** | Light | answered (F5 final, ADR 0115) — **off hold** |
| **7H** | The 3D room follows the entered room. **Ordering: 7D7 lands on the builder the M1 fidelity gate diffs, so 7D7's baseline is taken *after* this wave lands, never before, and the two are never in flight together** | *carried* | 7E2 | Full | **Yes** + desktop | — |
| **7I** | Mirrored right-hand L; a mirror that works on one group. **Owes 7E2's deferral**: `roomHrefFromDesignRoom` hardcodes `cornerDirection: "left"` and needs the optional field once mirroring lands | *carried*, plus the per-group primitive, plus `apps/web/src/room/room-url-state.ts` | 7H | Full | **Yes** | answered (Q6) |
| **7J** | Straight kitchens through composition | `room/approved-room-policy.ts` (the linear bounds), `generation/shell-design.ts`, `room/validate-room.ts` | 7D2, 7F2 | Full | **Yes** | answered (F1) — unblocked |
| ↳ | **Owes, from 7F1's ruling R8 (2026-09-14):** widen `BuildableShapes`, `ENGINE_ROOM_LIMITS`, `APPROVED_ROOM_POLICY` and `validateRoomInput` **together**, and delete both `as BuildableShapes` test helpers in the same wave. **Must change nothing under `apps/web/src/room`** — that is 7F1 criterion 3's claim, and 7J is its test | | | | | |
| **7K** | The mobile gate | `apps/web/tests/e2e/*` | all UI waves, 7E3a, 7E3c, 7E3b | Light (tests) | **Yes — the phase gate** | — |
| **7L** | The desktop line | *carried* | 7F1–7F4 | Light | Desktop | — |
| ~~**Gate M7-C**~~ | ~~Owner copy review~~ — **withdrawn by ADR 0113** | | | | | |

**Recommended order, and why.** The owner's own process — *choose the room, generate, adjust, save* —
is the critical path, because matching is useless until the library has presets: **7A → 7D1 → 7D2 →
7E1 → 7E2 → 7F1 → 7F4 → 7P1 → 7P2 → 7G**, then 7B → 7C → 7F2 → 7F3 for matching, ~~with 7E4 → 7E3, 7H,
7I and 7J fitted in where the tree is free~~ ~~**then 7A2 once 7D2 exists, with 7E4 → 7E3a (→ 7E3b on
F5), 7H, 7I and 7J fitted in where the tree is free** (corrected 2026-09-11; **and again the same day:
7E4 → 7E3a → 7E3c → 7E3b** — the share path lands before the open read closes).~~ **Corrected
2026-09-13 after 7A2 closed: 7E1 → 7E2 → 7F1 → 7F4 → 7P1 → 7P2 → 7G → 7B → 7C → 7F2 → 7F3 →
7E4 → 7E3a → 7E3c → 7E3b → 7H → 7I → 7J → 7K → 7L.** **Corrected again 2026-09-14: 7F4 is two waves
— `… → 7F1 → 7F4a → 7F4b → 7P1 → …` (Q7F4-2).** **Corrected again 2026-09-15: wave 7T lands between
them — `… → 7F4a → 7F4b → 7T → 7P1 → 7P2 → 7G → …` (coordinator's ruling on Q-7P1-1).** 7T blocks
nothing it does not already gate: it touches **no production file**, and it is placed before 7P1
because 7P1 adds live suites that run in CI alongside five that do not, and a repository in which
*"the persistence tests pass"* means two different things is how the next green badge is misread.

**The 7E3 split, confirmed against F5's final answer (ADR 0115) — three waves, not two.**
- **7E3a — cookie and resume.** Needed under every answer the owner gave; nothing reads a design by
  owner until the cookie and the visitor hash exist.
- **7E3c — the short share link, before 7E3b.** It is the only read path a non-owner will have, so it
  must exist before the open read closes: the three read-only e2e specs move to `/s/{token}` instead of
  being deleted, and no state in between has the read-only view gone.
- **7E3b — gating `/d/{id}` to the owning cookie.** Last, because it is the change that takes the open
  read away.
- **Not merged, although coupled:** 7E3c alone is a migration, a repository, two endpoints, a page and
  a control; adding 7E3b's route and API changes would pass `docs/WORKFLOW.md`'s five-file limit and
  put two security surfaces in one review. Instead the **same security reviewer is kept across the
  three** (*Review continuity*), so the read path and its gate are judged by one agent with the whole
  picture.
- **Security review on each; adversarial QA emphasis:** cookie fixation and tossing (7E3a — the
  `__Host-` prefix); share-token guessing and enumeration through response differences (7E3c); timing
  and byte-identity of *"not available"* across a wrong id, a foreign cookie and a missing cookie
  (7E3b); CSRF on the share create/revoke endpoints (7E3c); a share view reaching any write, any cookie
  or the design id (7E3c); revocation racing a read (7E3c). The four domain waves share `src/index.ts`; run them one
after another.

~~**Next dispatchable wave after 7A: 7D1**~~ — ~~**7D1 shipped at `f5b4cd9`; 7D1b was next.**~~
~~**7D1b is DONE in `f61c361` + `85091cc`. Next dispatchable wave: 7D2**, whose criteria 9–14 and
ADR 0110 Amendments A–D are the live contract below.~~ ~~**Corrected 2026-09-12: 7D2 is DONE at
`4133cdc`; next dispatchable wave: 7A2.**~~ **Corrected 2026-09-13: 7A2 is DONE at `f97d621`,
closed at `6cde5ef`; next dispatchable wave: 7E1.** **Corrected again 2026-09-13: 7E1 is DONE at
`57f1e94`; next dispatchable wave: 7E2.** ~~**Corrected again 2026-09-14: 7E2 is DONE at `470e5c9`;
next dispatchable wave: 7F1.**~~ **Corrected once more 2026-09-14: 7F1 is DONE at `5d2ff54` and its
follow-on 7F1-D45 at `8437c95`; next dispatchable wave: 7F4.** 7A2's shipped contract is ADR 0108
Amendment E and the criteria below.

### Revised criteria for new and changed waves

**7B — preset matching** (replaces the earlier 7B criteria 2 and 4; 1, 3, 5, 6, 7 and 8 carry, read
with *recipe* meaning a library row or a fixture)

1. *Property* — the window: a preset is a candidate **if and only if** the shapes are equal and every
   wall differs from the length the preset was saved in by at most 600 mm; 600 is in, 601 is out, in
   both directions. Corner direction is not read.
2. A candidate is shown **unchanged** when its instantiated design has zero findings, every body is
   available and a sink and a hob are present; *property* with at least 100 samples in each arm.
3. Order: no change needed first, then fewer cabinets removed, then the library's order, newest
   first; deterministic; no expression reads the remainder.
4. The reference kitchen is a test fixture here and is not published (ADR 0109 A1).
5. **A ceiling below a preset's tallest body** (QA's forward risk Q2.2): for every room height in
   2200–2599, a preset with any body whose top is above the room is **never shown unchanged**; at
   2600 the reference fixture is shown unchanged in its own room. The boundary pair 2599 / 2600 is
   asserted explicitly.
6. ~~**The finished end fits (Adjudication 7D1-Q1):** a preset is shown only if its run-end panel's
   outer face — `runEndPanelSeatM` plus half the panel's thickness — is at or before wall A's end; the
   zero-findings rule cannot see the panel. 7C's adaptation plans wall A's floor run to
   `A − panel footprint`, as the shell does.~~ **Superseded 2026-09-11 by ADR 0045 Amendment A** (no
   panel when the run hits the wall): once 7D1b lands, a panel that would pass the wall is not drawn,
   so there is nothing to check and no reserve to plan. Kept as the witness instead: a preset whose run
   ends within 19 mm of wall A's end is shown, and its view has no finished end.

**7C — adaptation** (supersedes the earlier 7C)

1. A run longer than its wall loses **whole columns from its free end** — through `removePlacement`,
   so the freed space is exactly what a customer's delete leaves — and stops as soon as it fits. Never
   a structural body, the sink or the hob; if either would have to go, the preset is not shown.
2. Then the leftover rule, **the one implementation 7D2 also calls**, fills bare run ends of 600 mm
   or more with 600 mm storage through `insertBody`.
3. *Property* over rooms inside the window: every shown preset has zero findings, a sink and a hob,
   and no bare run end of 600 mm or more; replaying its declared changes on the saved design with
   `removePlacement` and `insertBody` reproduces it exactly.
4. The card's declaration lists every removed and added cabinet per wall; a preset adapted without a
   declaration cannot be built (the evaluation type carries the list).
5. **Below a low ceiling** (ADR 0109 Amendment B): ~~every body whose top is above the room height is
   removed through `removePlacement` and declared as a dropped row; the recorded space it leaves is
   capped at the room height by the **one** helper the 7D1 shell also uses.~~ **Corrected 2026-09-11
   (7A logic review; ADR 0109 Amendment B's correction):** a **non-structural** body above the
   ceiling is removed through `removePlacement`; a **structural** corner piece above it (`p21`, which
   `removePlacement` refuses as `NOT_DELETABLE`) is **not instantiated**, by the 7D1 shell's own
   selection rule; both are declared as a dropped row; then every recorded extent — `emptyColumns`
   and `columnExtents`, the corner's own column included — is capped at the room height by the
   **one** shared helper, ~~which the 7D1 shell also uses~~ **written in this wave** (Adjudication 7D1-P:
   the shell needs no cap). A test asserts `removePlacement` is never called on a
   structural piece. *Property* over heights
   2200–2599: no body and no recorded extent rises above the room, the design has zero findings, and
   the sink and the hob are untouched. Consistent with *"a listed preset always applies"*: the listed
   evaluation already carries the dropped row, and application writes exactly it.

**7D2 — composition** (criteria 1–6 of the earlier 7D2 carry; add)

7. The placed items read fridge → sink → preparation → hob-with-oven along the run, left to right as
   seen from inside the room; *property*: for every generated design, the along-run order of the
   placed items is a subsequence of that list.
8. A room that cannot hold a sink and a hob returns *minimum not met* and no design; *property*: every
   design returned contains both.
9. The leftover rule: no bare run end of 600 mm or more in any returned design (*property*), and the
   remainder is an empty column the published openings include. **Owner-ruled exception (F7,
   2026-09-11):** on wall B, measured at the shell's depth, the bare end may reach 599 mm **plus the
   depth reserve** (`alongWallShiftMm` to the deepest declared depth — 699 today); after
   `setCabinetDepth` to the deepest depth it is at most 599 again.
10. ~~F3's default drop order~~ **F3's ruled drop order ("Fridge first, then prep", 2026-09-11)** —
    storage, then the fridge, then the preparation cabinet — holds on a sweep of short walls; the sink
    and the hob are never dropped. **Clarified 2026-09-12 after logic review R1.1:** this is a
    two-stage rule. Candidate storage yields while choosing the surviving core and wall cut; after
    that choice, ADR 0110 A4 recomputes mandatory 600 mm storage on every final per-wall remainder
    of at least 600 mm. There is no persistent no-storage flag, and `dropped` lists omitted core
    roles only. The wall-A 2700 sweep pins wall B at **1599 / 1600 / 1699 / 1700**: 1599 has no
    600 mm final storage fit; 1600 crosses that fit boundary; 1699 keeps the fridge dropped and
    refills one wall-B storage unit, ~~leaving 99 mm planned~~ **corrected 2026-09-13: leaving 98 mm
    planned, plus 1 unrecordable millimetre and the 100 mm reserve = 199 mm physical**; 1700 crosses
    the next core-selection boundary. At 1599 the corresponding planned remainder is 598 mm, not
    599. Every result still obeys the shallow wall-B 699 mm physical-empty cap; the product boundary
    and 200 mm usable-remainder rule are unchanged.
11. **Low ceilings**: the property in criterion 1 includes heights 2200–2599, and no generated body
    rises above the room — the shell's cap means a top-row body is never offered there. ~~**If F2 adds
    upper cabinets and a hood**~~ **The upper cabinets and hood F2 added** stand in the wall band (1500–2200 mm, `LEVELS[1]`), which fits
    under every approved ceiling (≥ 2200); the top row (2200–2600) is never part of a composed kitchen
    and is offered to the customer only where the room is 2600 or higher.
12. **Upper cabinets and the hood (F2, "Yes, uppers + hood", 2026-09-11):** above every body of the
    base run the composed kitchen places a `wall-cabinet` of the same width, and over the hob a `hood`
    of the hob's width instead, all through `insertBody` into the wall-band openings — never above the
    fridge (a column) and never in the top row. *Property:* every base body of a returned design has
    exactly one wall-band body above it with the same along-wall extent, the one above the hob is a
    hood, and the log lists the uppers after their bases. An upper that cannot be placed is logged as
    *not placed* and removes nothing below it.
~~13. **Widths come from insert, then `setWidth` (ADR 0110 Amendment D) — added 2026-09-11 on the 7D1~~
    ~~implementer's finding** that a `'fit'` body fills its opening and the shell's first openings are~~
    ~~800 wide. Each `'fit'` base (sink, preparation, storage) is inserted into the first opening from~~
    ~~the corner and then stepped to its target width with `setWidth`; fixed bodies (hob 600, fridge~~
    ~~700) are inserted as they are. Targets: **sink 600, preparation 600, hob-with-oven 600, fridge~~
    ~~`fridge-free` 700, storage 600**; uppers and hood take their column's width. On wall B the items~~
    ~~are inserted in **reverse** reading order, so everything packs against the corner and the leftover~~
    ~~gathers at each wall's free end.~~
    - ~~*Property:* every returned design's composed bodies have exactly their target widths; between two~~
    ~~composed bodies on one wall there is **no** recorded empty column (the leftover is only at the~~
    ~~free end); the log records each `setWidth` beside its insert, and the replay of criterion 2 runs~~
    ~~both commands.~~
    - ~~**Stop and report, do not compensate,** if on either wall an insert's remainder or a shrink's~~
    ~~freed width lands between two composed bodies — the seating (`seatAlongColumn`) and funding~~
    ~~(`EMPTY_SPACE_ORDER`) conventions are along-wall, and wall B reads against its along direction.~~
    - ~~Bases first, then their widths, then uppers — an upper over a column that already holds its base~~
    ~~is centred and takes the column's width, so it needs no resize.~~
13. **(revised 2026-09-11, 7D1 logic review R1.1 — ADR 0110 Amendment D, revised) Plan the row, tile
    at its boundaries, insert each body into its own column.**
    - The generator first plans each wall's row as widths — owner's order, F3 drop order, minimum
      kitchen and D3 widths (sink 600, preparation 600, hob-with-oven 600, `fridge-free` 700) — as
      pure arithmetic that writes no placement. It chooses the surviving core and wall cut first,
      then refills each final per-wall remainder with 600 mm storage under A4, and finally applies the
      leftover rule and wall B's reserve (ADR 0110's 2026-09-12 clarification).
    - `buildLShellDesign` takes that plan and tiles each free run at exactly its boundaries (one column
      per planned body, then the leftover split at 800); with no plan it tiles 800-first as 7D1 ships.
    - Each body goes into its own column with `insertBody`; `setWidth` is used **only** for a `'fit'`
      body in a wall's last column when ADR 0046's merge joined it with a leftover of 200 mm or less.
    - *Property* over the approved L range (and linear, once 7J lands): **no recorded empty column
      stands between two composed bodies on a wall** — the reviewer's reference-room case (sink
      `[900,1500]`, preparation `[1500,2100]`, hob `[2100,2700]`) is asserted by name; every composed
      body has exactly its planned width and position; the leftover is only at each wall's free end.
    - *Replay:* the plan, the shell and the log's `insertBody` / `setWidth` calls, run through the
      store's own funnel between commands (the reviewer's script at
      `scratchpad/r7d1/compose.mjs` is the model), reproduce the returned design exactly.
    - Bases first, then the one possible free-end `setWidth`, then uppers — an upper over a column that
      holds its base is centred there and takes the column's width.
14. **Nothing composed over wall A's corner (Adjudication 7D1-Q1):** no wall cabinet and no hood in the
    wall band over `[0, 900]` on wall A; the zone stays an empty column. *Property:* no returned design
    carries `RECORDED_SPAN_OVERLAPS_CORNER_BODY`.

~~**7E3 — the returning visitor** (security reviewer dispatched)~~ — **superseded by 7E3a and 7E3b
below (ADR 0114)**; the struck criteria assumed a cookie holding the design id.

- ~~1. The mint response and every successful save set or refresh the pointer — `HttpOnly`, `Secure` outside development, `SameSite=Lax`, `Path=/`, 30 days — naming that design. Viewing another design's `/d/{id}` never sets or moves it.~~
- ~~2. `/` and `/configurator/configure`, in both locales: a pointer whose design loads → 307 to `/[locale]/d/{id}`; no pointer → Step 1; a pointer whose design does not load → the pointer is cleared and the visitor lands on Step 1, never an error page. No response from either route contains the editor.~~
- ~~3. The pointer holds nothing but an id; no route authorises a read or a write from it; a request carrying a pointer but no write token cannot save.~~
- ~~4. Must not: the locale reaches the pointer; the pointer is readable from script; the design id appears in a log line it did not already appear in.~~

**7A2 — the coupled room rule** (ADR 0108 Amendments C–E — **owner-ruled 2026-09-11, F6 "Must
hold sink + hob"**; Amendment E corrects the generated widths; dispatched after 7D2)

1. `validateRoomInput` gains one code, `ROOM_TOO_SMALL_FOR_KITCHEN`, on a room-level field, with no
   number; the per-field codes are unchanged and are reported first, so a room with a bad wall never
   also reports the coupled rule.
2. The widths it uses — the generated sink target **600**, generated hob target **600**, and each
   wall's corner reach at every declared depth — come in through the policy, derived from the same
   composition data and Amendment A's corner edges; the validator still imports types only. The
   catalogue's **560 mm manual sink floor remains legal** and is not this rule's input.
3. *Property* over the approved L range, at least 100 samples in each arm: the rule passes **if and
   only if** `generateKitchen` places a sink and a hob in that room. Must not: a validator and a
   generator that disagree on any sampled room.
4. **Corrected by ADR 0108 Amendment E:** 7A2 uses the generated 600 mm sink plus 600 mm hob, not
   the catalogue's 560 mm manually buildable sink floor. Boundary rows: with wall A at 900, wall B
   2199 fails and 2200 passes; with wall B at 1000, wall A 2099 fails and 2100 passes; with wall A at
   1500, wall B 1599 fails and 1600 passes. In particular, 900 × 2160 refuses. Manual 560 mm sinks
   remain legal.
5. ~~If F6 is answered (b), only the policy's data changes — the rule becomes *either fits* — and the
   property is rerun.~~ **F6 was answered (a).** The rule's data enters `APPROVED_ROOM_POLICY` as
   owner-approved, guarded by the same test pattern as 7A: each approved figure at or above the
   engine's derived one. **The linear bounds do not enter here** — they arrive with 7J (see 7J).

**7E3a — visitor identity and resume** (security reviewer dispatched; ADR 0114 decisions 1–4, 6, 7)

1. The only visitor cookie is `__Host-lemnaria_visitor`, set only in `Set-Cookie` by the mint and
   refreshed only by a successful save, with exactly `HttpOnly; Secure; SameSite=Lax; Path=/`, no
   `Domain`, 30-day `Max-Age`. Its value is 256 random bits from `node:crypto`; only its hash reaches
   the database, and neither appears in any log line.
2. **No script can read it and nothing mirrors it:** a browser test reads `document.cookie` on every
   Step 1 and editor page and never finds it; no source file under `apps/web/src` touches
   `localStorage`, `sessionStorage` or `document.cookie` for it (grep).
3. The migration adds a nullable visitor-hash column with a shape check and an index, runs through
   the ledger, and its schema is read back; the mint stores the hash in the same insert;
   `POST /api/designs` still reads no body.
4. `/` and `/configurator/configure`, both locales: a cookie matching a design → 307 to the visitor's
   most recently updated design; no cookie → Step 1; a cookie matching nothing → cleared on that
   response, Step 1, never an error page. **No response from either route contains the editor.**
5. Opening another design's `/d/{id}` never sets or changes the visitor cookie; a request carrying a
   visitor cookie but no write token cannot save; a valid visitor cookie and write token without the
   author cookie cannot save a preset.
6. Local development and Playwright keep the cookie on `http://localhost` (measured in the wave, not
   assumed).

**7E3c — the private share link** (F5 revised, *"Own browser + private share link"*, 2026-09-11;
**security reviewer dispatched**; ADR 0114 Amendment B; lands before 7E3b)

1. The token is ~~256 random bits~~ **12 base62 characters (~71 bits, ADR 0114 Amendment C),
   rejection-sampled** from `node:crypto`; only its hash is stored; the link handed out is the
   unprefixed `/s/{token}`, which the proxy redirects to the recipient's locale; the migration runs
   through the ledger with the hash-shape check, and its schema is read back. A partial unique index
   allows one active link per design.
2. `POST /api/designs/{id}/share` creates a link only with the design's write token **and** the owning
   visitor cookie (the whole of *"what authorises editing"* in M7 — ADR 0115), returns the link once, and revokes any active one; `DELETE` revokes. Without both
   credentials, both answer as a missing design does.
3. `/[locale]/s/{token}` renders the design in the existing read-only mode with `Referrer-Policy:
   no-referrer`, `noindex, nofollow` and `Cache-Control: private, no-store`. Its HTML, its payload and
   every response it triggers contain **no design id, no visitor cookie and no write token**; it sets
   no cookie, mints nothing and runs no write-access probe.
4. **Revocation is immediate:** the request after a `DELETE` gets the *"not available"* response,
   byte-identical to an unknown token's; a re-issued link works and the revoked one never does again.
5. A share view offers no edit, save, depth, Step 1 or "Verifică designul" control, and a crafted write
   through it is refused.
6. When retention deletes the design, its share row goes with it; a share read never refreshes the
   design's retention clock.
7. The three read-only e2e specs (`read-only-panel`, `read-only-global-settings`,
   `shared-design-locale-identity`) are **re-pointed at `/s/{token}`** rather than deleted.

**7E3b — a design opens only in its owning browser** (~~blocked on F5~~ **unblocked: F5 "Only its own
browser", 2026-09-11**; security reviewer dispatched; ADR 0114 decision 5 and Amendment A) — **F5 was
revised the same day (Amendment B): 7E3b now lands after 7E3c**

1. `/[locale]/d/{id}` and `GET /api/designs/{id}` serve the design only when the row's visitor hash
   equals the request's, compared in constant time.
2. A mismatch, a missing cookie and a nonexistent id produce **byte-identical** responses — the same
   page, and the same 404 body from the API — so neither existence nor ownership is confirmed.
3. ~~The three read-only e2e specs are rewritten to assert the refusal;~~ **A new spec asserts the
   refusal on `/d/{id}` for a foreign or missing cookie; the three read-only specs already moved to
   `/s/{token}` in 7E3c;** the write-access probe and `canWrite` keep working for the owner.
4. ~~Dated amendments land in ADR 0002 and ADR 0019 decision 1 in the same wave.~~ **Recorded at the
   ruling, 2026-09-11** — both records carry a dated supersession note naming this wave as the one that
   implements it; the wave's close-out adds the commit hash to both notes.

**7E4 — e2e and tooling off the retired route** (lands before 7E3a)

1. A Playwright fixture mints the seeded design through `POST /api/designs` and opens its `/d/{id}`;
   every spec that navigated to `/configurator/configure` uses it.
2. After the wave, no spec, config or script names `/configurator/configure` except 7E3a's own
   redirect spec (grep). The fixture's mint also sets the visitor cookie once 7E3a lands, so the
   minted design stays readable under 7E3b.
3. Both Playwright projects pass on the runner — a local run is not the verdict for runner timing.

**7P1 — the preset store** (security reviewer dispatched)

1. The migration is the next number, runs through the ledger, and the test database's schema is read
   back after it (ADR 0020, 0042); the application role holds `SELECT, INSERT` on `presets` and
   nothing more, proved by a live privilege test like ADR 0008's.
2. `PresetRecordSchema` is strict; its snapshot parses as `CurrentDesignSchema`; the repository reads
   published presets by shape and writes one row.
3. The scheduled export includes the presets table, and its restore path is exercised.
4. Must not: an agent applies the migration to a deployed database; a customer-reachable route writes
   to the table.

**7P2 — authoring** (security reviewer dispatched)

1. Flag off: both authoring routes answer 404 to every method, and the server-rendered editor carries
   no save control.
2. Flag on, no author cookie: no save control; a save is refused, indistinguishably from flag off.
3. A wrong secret gets the same response shape as a disabled feature; a right one sets an `HttpOnly`,
   `Secure`, `SameSite=Strict`, expiring cookie that is not the secret and is verified on the server
   in constant time. The secret travels only in a request body and appears in no log.
4. A save accepts a design id and optional names and nothing else; the server loads that design
   through the repository and snapshots it. A snapshot with any finding, or without a sink and a hob,
   is refused with a code.
5. Turning the flag off after presets exist leaves them published and hides only authoring.

**7G — the thumbnail**: captured from the owner's scene at one fixed camera when saving; the server
accepts only an image of a declared type, under a stated byte and pixel cap; it is served read-only
with its content type, `nosniff` and cache headers; a preset without one renders its card without an
image, never a broken one.

**7I — the mirror** (carried, plus): the mirror primitive applies to one group as well as the whole
scene, with correct face winding either way — captured, not only asserted — because M7B mirrors the
corner assembly on its own.

**7J — straight kitchens** (**unblocked: F1 "Yes, 1200–6300 mm", 2026-09-11**): **this wave adds
`linear: { wallA: { minMm: 1200, maxMm: 6300 } }` to `APPROVED_ROOM_POLICY`**, together with the
engine's derived linear limits it is guarded against — not 7A2, because a shape's bounds in the
approved policy are what make `validateRoomInput` accept it, and linear must not validate before the
wave that can build it lands. Then: a shell with no corner; composition
on wall A under every 7D2 property; the 1C/D1C suggestion to switch to a straight kitchen appears; what
`depthMm` means for a one-wall room is decided and recorded in the wave.

**7F2 (add, 2026-09-14, from wave 7F1's rulings R2 and R3 — read them before starting):**

- **1C is a live state reached by typing**, not only by arriving at a stale or hostile link. 7F1 syncs
  the URL on every edit (~~`history.replaceState`~~ **a debounced `router.replace`, R9**), so a value
  that leaves the policy's range resolves to 1C while the customer is still in the field: 7F2's reasons
  must appear **and clear** as they type, not only on a commit. **And they are the client's, not the
  server's** — R9's read side makes the live sub-state a client derivation from `useSearchParams()`,
  so 7F2 must not wait on a server render for a reason to appear or clear.
- **7F2 owes the refusal sentence for a shape that is not buildable.** 7F1 ships all three cards with
  *Continuă* disabled on `linear` and `U` and **no sentence saying why** — a deliberate, asserted state
  (7F1 criterion 3), not an oversight. 7F2 is where the customer is told. The U refusal still names no
  internal reason, and no message suggests the linear shape until 7J makes it buildable.
- **A defect 7F1-D45's closing visual gate found and did not fix, because it is not that wave's:
  selecting the U chip while `wallC` is empty leaves the plan preview drawing the L plan.** Found
  2026-09-14 at `6682d8e`, in a production build at 390 × 844. **It is 7F1-shipped behaviour, not a
  regression**, and the reasoning is a diff rather than an argument: 7F1-D45's source diff is exactly
  three files — `app/[locale]/configurator/room/page.tsx`, `src/room/room-query-sync.ts` and
  `src/room/room-screen.tsx` — while `plan-preview.tsx` and `dimensions-form.tsx` are **untouched**.
  The surface is 7F2's, which owns what an incomplete room shows, so this is where the implementer
  meets it. It is recorded here rather than in `docs/backlog/open.md` because that file is for items
  with no owner and no phase, and this one has both.
- **Must not: remove a control 7F1 shipped, because frame 1C does not draw it.** The shape chips and the
  corner toggle **survive into 1C** and are asserted present there. 1C *adds* the reasons beside their
  fields and the red wall, and removes nothing.

  **Why the frame's silence is not a ruling**, since the owner's F8 instruction is *"use the design that
  was proposed"* and a literal reading points the other way: frame 1B (`:117-131, 141-156`) draws the
  chips row and the corner toggle; frame 1C (`:205-213`) goes straight from the plan preview to the
  fields and draws neither. **A static mockup omitting a control is not an instruction to remove it** —
  1C exists to show what an error looks like, and its author drew the part that differs. Taking the
  omission literally would delete working controls and call it fidelity, stranding a customer at 1C with
  no way back to the shape they chose or the corner they set. ADR 0104 decision 1 already draws this
  line: *"A frame is silent about behaviour it does not draw"* — silence is not a deletion, and a frame
  cannot remove something another frame of the same screen declares.

**7F3 (add, 2026-09-14, from wave 7F1's ruling R2):** ***Continuă* at 1B is 7F3's destination.** 7F1
leaves it pushing the canonical query and nothing more, which is the seam 7F3 takes over; there is no
wave in between in which it is a control with a control's affordances and no behaviour.

**7F2 (add):** *minimum not met* is shown at 1C with a room-level reason, no digit and no code, and no
wall marked red.

**7F3 (add):** the list reads the library (7P1); a card shows every declared change per wall.

> **Carried forward from 7E2's close-out, 2026-09-14.** (a) Construct the design-creation attempt
> where the selection's state lives, never inside the click handler. (b) Acceptance criterion: two
> taps on the rendered **Folosește** issue exactly one `POST /api/designs`, asserted through the
> component with a stubbed fetch — a factory-level test cannot substitute, which is precisely the
> gap 7E2 could not close from below. **Why this is owed rather than optional:** each attempt carries
> its own mint identity, correctly implementing ADR 0111 decision 5 (choosing again creates a new
> design) but opting out of `FetchConfigurationRepository`'s shared
> `defaultProvisionalMintIdentity` — so "exactly one row however many times it is tapped" holds only
> *within* one attempt instance today, and a handler written the obvious way mints a row per tap with
> nothing currently red to catch it. (c) Consider a `useDesignCreationAttempt(design)` hook so
> per-tap construction fails loudly. (d) Re-assert criterion 1's round-trip deep-equal on a genuinely
> *evaluated* preset design — 7E2 proved it only for fixture-derived documents.

**7K (add):** a returning visitor opening `/` lands on their design; opening `/configurator/configure`
never shows an editor; no customer journey can reach the save-as-preset control.

> **Carried forward from 7E2's close-out, 2026-09-14.** Add the evaluated-design round-trip assertion
> from 7F3 item (d) above to 7K's own sweep.

**7F4 (add), carried forward from 7E2's close-out, 2026-09-14:** one attempt is one hand-off,
discarded after success — `runPromise` is deliberately never cleared on success, since it is
terminal. A re-run of generation is a new selection and needs a new attempt. 7F3's (a) and (b) above
apply equally to the generation hand-off.

## Wave 7D1 — dispatchable punch list

> **Amended 2026-09-11 by [*Adjudication 7D1-P*](#adjudication-7d1-p--2026-09-11-the-implementers-seven-premises),
> below, which is the binding version.** Item 2's construction (a) is withdrawn; criteria 3 and 5 are
> restated; wall B is planned against the deepest declared depth; the height cap moves to 7C. Read
> the adjudication before the items.

**Tier: Full.** No visual surface. **Owner answers needed: none.** Dispatch after 7A commits.
**ADRs to check intent against first, and to stop and report on if they disagree:**
[0110](../decisions/0110-generation-inserts-through-the-command-path-and-the-corner-is-structural-data.md)
(and Amendment A), [0021](../decisions/0021-corner-returns-are-structural-in-data.md),
[0044](../decisions/0044-an-empty-space-is-recorded-in-the-design-document.md),
[0046](../decisions/0046-adjacent-empty-columns-merge-under-a-cap-and-an-insert-splits-its-column.md),
[0052](../decisions/0052-800-mm-is-the-ceiling-on-any-empty-column.md),
[0053](../decisions/0053-the-design-document-records-the-whole-frozen-map.md),
[0073](../decisions/0073-a-frozen-extent-records-the-body-its-depth-came-from.md),
[0077](../decisions/0077-a-joint-seated-body-declares-its-seat-and-is-never-measured-for-one.md),
[0090](../decisions/0090-a-frozen-space-slides-with-its-run-and-follows-the-body-it-recorded.md)
Amendment B, [0108](../decisions/0108-a-room-is-validated-against-policy-data-and-the-interim-policy-is-the-engines-own-limits.md)
Amendments A and B.

**Must-fix items (4):**

1. **`packages/configurator-domain/src/generation/shell-design.ts`** — `buildLShellDesign({ room,
   occurredAt })`, returning a `Design` at the reference kitchen's cabinet depth with the entered
   room, the reference kitchen's settings, `presetId: null`, and **only** the structural corner
   placements of `KITCHEN_L_DESIGN` whose top is at or under the room height — selected by the
   catalogue's `structuralReason`, never copied as literals. **A corner piece above the ceiling is
   excluded by this selection, never through `removePlacement`**, which refuses a structural body as
   `NOT_DELETABLE` (`commands/remove-placement.ts:41-50`) — under construction (a), filter the
   structural pieces first and remove only non-structural ones (7A logic review, 2026-09-11).
2. **Recorded empty space** for every free stretch of each wall, in each band, from that band's
   corner far edge (0 where the band has no structural piece on that wall) to the wall's length. Two
   constructions are acceptable, and the wave picks one and says why in the module head: (a) remove
   every non-structural placement of the reference design through `removePlacement`, then fit the
   recorded map to the room — clip past a shorter wall's end, extend to a longer wall's end split by
   `splitEmptySpanAtCap`; or (b) tile directly with `splitEmptySpanAtCap`, with depths and
   `depthFromBuildId` as the removal would record them. **No frozen-map arithmetic a command already
   owns may be re-implemented.**
   **Added 2026-09-11 (ADR 0109 Amendment B):** capping recorded space at `min(room height, 2600)` is
   written **once**, as a small helper beside `clip-empty-columns-at-wall-end.ts`, because wave 7C
   needs the same cap when it drops a preset's rows above a low ceiling. **The cap applies to every
   recorded extent — `emptyColumns` and `columnExtents` alike, including the corner's own column**
   (whose recorded span reaches 1500–2600 in the reference kitchen and reports
   `COLUMN_EXTENT_ABOVE_ROOM` below 2600 if left uncapped).
3. **The shell is a design the engine can insert into**: `deriveColumns` and `recomputeVoids` over it
   publish the openings `insertBody` targets.
4. **`src/index.ts`** — export the builder and its input type.

**Acceptance criteria:**

1. *Property* over `APPROVED_ROOM_POLICY`'s L range (walls on a 1 mm grid, height 2200–3900, at least
   200 runs): the shell has **zero** `validateDesignForCatalog` findings of either severity,
   including `RECORDED_SPAN_OVERLAPS_CORNER_BODY`.
2. The corner pieces are exactly the structural ones whose top is at or under the height: at 2599
   the top-row wall-B return is absent and at 2600 it is present. **At 2200 and at 2599 — the shell
   as built, and again after `setCabinetDepth` to every other declared depth — it reports neither `PLACEMENT_ABOVE_ROOM` nor `COLUMN_EXTENT_ABOVE_ROOM`
   / `EMPTY_COLUMN_ABOVE_ROOM`** — the 7A logic reviewer's failing case, asserted by name.
3. *Property* — coverage: on each wall, in each band, the recorded space covers exactly
   `[that band's corner far edge, wall length]` with no gap and no overlap; no recorded column is
   wider than 800 mm or rises above `min(room height, 2600)`.
4. For every wall whose free base run is at least 600 mm, a `base-sink` 600 inserts into its first
   base opening with the fake probe; no published opening passes a wall's end.
5. **Two sources made to agree:** if construction (b) is chosen, the shell for the reference room
   equals, field for field, the reference design with every non-structural placement removed through
   `removePlacement` — the command is the witness for the tiling. If (a) is chosen, a direct tiling of
   the reference room is the witness for the command path.
6. Deterministic: the same input gives a byte-identical shell.
7. **Must not:** place any non-structural body; read a probe; import a price book; change
   `removePlacement`, the void engine or the validator.

**Tests expected:** `packages/configurator-domain/tests/generation/shell-design.test.ts` and
`tests/generation/shell-design.property.test.ts`.

### Adjudication 7D1-P — 2026-09-11: the implementer's seven premises

The 7D1 implementer read the code before writing anything and found seven premises of this punch list
that the code does not bear out. Ruled here; the durable parts are
[ADR 0110](../decisions/0110-generation-inserts-through-the-command-path-and-the-corner-is-structural-data.md)
Amendment B, [ADR 0109](../decisions/0109-a-preset-is-a-recipe-document-and-is-listed-only-if-the-product-would-never-mark-it.md)
Amendment C and a note on [ADR 0090](../decisions/0090-a-frozen-space-slides-with-its-run-and-follows-the-body-it-recorded.md).

| # | Finding | Ruling |
| --- | --- | --- |
| P1 | `removePlacement` records nothing; freed space survives only through the web store's fall-through, so (a) would restate that order in the domain. | **Accepted as a finding; construction (a) is withdrawn** (ADR 0110 B1). The shell uses no `removePlacement`. Keep the implementer's canonicalisation step: `deriveRecordedColumns` → `projectFrozenMap` → `withFrozenMap`. |
| P2 | Clipping to a shorter wall collides with ADR 0090 B: a clipped column crossing a key boundary is unprojectable; proposal: re-key. | **Refused as unnecessary; the principle is ruled** (ADR 0110 B4, note on 0090). Nothing is clipped: each free run is **tiled to its planned end** with `splitEmptySpanAtCap`, each piece keyed from its own centre. 0090 B does not govern authoring a new document for a fixed room, and `clipEmptyColumnsAtWallEnd` is never applied to a recorded face in composition. |
| P3 | Whole-mm centres need even-width pieces from a whole-mm edge; an odd span loses 1 mm. | **Accepted.** Coverage is exact to the planned end when the span is even and to the planned end − 1 when odd; **the lost millimetre is at the far end**, and the tests assert exactly that — the same give `widestOnTheGrid` already makes. |
| P4 | Criterion 5's field-for-field witness cannot hold. | **Amended.** (i) Accepted: per wall and band, the union of the shell's recorded intervals equals the planned free runs. (ii) The command-path replay (`clearBodies` / `advance`, then `projectFrozenMap`) is kept as the independent witness but asserted as **containment**, not equality: for the reference room, every interval the replay records lies inside the shell's union, and every shell interval outside the replay's lies between the reference run's end and the planned end. Boundaries and depth sources differ by design (P6) and are not compared. |
| P5 | Criterion 3's wording. | (i) **Accepted:** the 800 mm ceiling is asserted on `emptyColumns` only; the corner-x extent is 900 by its member (ADR 0052 governs empty columns). (ii) **Accepted:** a band is a `LEVELS` interval intersected with each entry's `[y0, top]`. (iii) **Amended:** a run's start is the far edge of the reference's structural pieces **on that wall in that band over the full assembly** — a ceiling-excluded piece (`p21`) still reserves its footprint — so wall B's top band starts at 900, not 0, and the `p21` zone stays unrecorded. Wall A's wall and top bands start at 0; its base band at 900. |
| P6 | Extension pieces copy the run's last column, inheriting `fridge-free-700` on wall B. | **Refused.** It records a false provenance (ADR 0073, 0102): a depth explained by a fridge that never stood there, pinned at 742 so it would not follow the setting (ADR 0080). **Every tile takes a neutral declared source** — `base-cabinet` for floor tiles, `wall-cabinet` for wall-only tiles, the bodies composition fills them with — with its depth read through `occupiedDepthOfEntryM` at the shell's cabinet depth. No new depth arithmetic. Corner columns keep their own declared sources and seats (ADR 0077); no tile stands over a full-height member, so ADR 0101's lift does not arise. Base and full-height builders ignore the column depth anyway (`resolveDepthM`), so a sink inserted later is built at the kitchen's depth either way. |
| P7 | Timestamps; invalid input. | **Accepted.** `createdAt = updatedAt = occurredAt`; an invalid `occurredAt` or a non-L room throws a named error — the builder sits behind the validator and a bad input there is a programming error. |
| Obs. | At 700, space flush to wall B's end slides 100 mm past the wall and is marked; a composed kitchen or preset could then be pushed past too. | **It does conflict with the owner's point 3 in spirit**, and ADR 0083 decision 1 is the owner's own precedent (the demo clears its run at both depths). **Ruled: a proposal fits at every declared depth.** Each wall-B run's planned end is the wall's length **minus the chain shift to the deepest declared depth** (`alongWallShiftMm`, 100 mm on the base chain today), so the shell, anything composed into it and any adapted preset still fits after a depth change (ADR 0110 B3, ADR 0109 C). |

**What 7D1 now builds** (items 1, 3 and 4 stand; item 2 and criteria 3 and 5 as restated):

- Corner columns: `deriveRecordedColumns` over the kept structural placements only.
- Free runs, tiled with `splitEmptySpanAtCap` and keyed from their own centres: wall A base band
  ~~`[900, A]`~~ **`[900, A − panel]`**, where *panel* is the run-end panel's footprint
  (`RUN_END_PANEL_THICKNESS_M + RUN_END_PANEL_GAP_M`, 19 mm; **amended 2026-09-11, Adjudication
  7D1-Q1; removed again by 7D1b, Adjudication 7D1-Q2**), as full-height floor tiles; wall A wall-and-top band `[0, 900]` as wall-only tiles from
  `LEVELS[1]`'s start; wall B all bands `[900, B − shift]` as full-height floor tiles, where `shift` is
  `alongWallShiftMm` from the shell's depth to the deepest declared depth. Tops at
  `min(room height, LEVELS' top)`. Sources and depths per P6.
- **No height cap in 7D1** (ADR 0110 B5): nothing in the shell can exceed the room. The shared cap
  helper is written in 7C.

**Criteria added or restated:**

- **3 (restated):** P5 (i)–(iii) and P3 — per wall and band, the recorded union equals the planned run
  to the millimetre, or to planned end − 1 on an odd span; no `emptyColumns` entry wider than 800.
- **5 (restated):** P4 (i) and (ii).
- **8 (new):** every tile's `depthFromBuildId` is `base-cabinet` or `wall-cabinet`, and its `depthMm`
  equals `occupiedDepthOfEntryM` for that entry at the shell's depth — no tile records a source the
  reference placed there.
- **9 (new):** after `setCabinetDepth` to every declared depth, the shell reports **no**
  `EMPTY_COLUMN_PAST_WALL_END` and no `COLUMN_EXTENT_PAST_WALL_END` on wall B; with the reserve
  deliberately removed in a test, the same run reports them — proving the reserve is what holds it.
- **10 (new):** no `removePlacement` call and no `clipEmptyColumnsAtWallEnd` call anywhere in
  `src/generation/` (grep in the test).

**Addendum — 2026-09-11, on the implementer's measured evidence** (scratch runs against the domain
`dist/` at `c9f43ea`; nothing in the tree edited). The evidence confirms P1 and P2 as findings, and
the prototype of the *proposed* pipeline gave zero findings over 2004 rooms — which proves the
proposals are internally consistent, not that they are right against the records. **No ruling
moves.** Two points made explicit:

- **P6, answered as asked: yes, the shell's recorded depths are normalised.** The removal path left
  the freed columns carrying their former bodies' sources — `d638` from the oven tower, `d600` from a
  pinned deep top, `d742` from `fridge-free-700` — which is ADR 0073 working correctly *for a
  customer's delete* and wrong for a fresh composition, where none of those bodies ever stood. Under
  the ruling every free-run tile records `base-cabinet` (floor) or `wall-cabinet` (wall-only) with its
  depth from `occupiedDepthOfEntryM` at the shell's cabinet depth — the carcass-based depth the
  bodies composition places there would give the column. Only the corner's own columns keep their
  reference sources, because those pieces are really there.
- **The height-cap helper waits for 7C.** The shell has no caller for it (ADR 0110 B5), and a module
  with no caller is dead code in 7D1's diff. Keep it out of 7D1's commit and bring it in with 7C's
  first call; set it aside by moving the file, not by any `git` discard.

### Adjudication 7D1-Q1 — 2026-09-11: QA round 1's findings

**Q1.1 (Medium) — the run-end panel lands 19 mm past wall A. Classification: contract gap**, in ADR
0110 Amendment B2 (the architect's), which planned wall A's floor run to the wall's end without
counting the finished end ADR 0083 decision 5 makes part of wall A's occupied width. The implementation
followed B2; QA's two tests measure a real outcome. **Ruling: option 1** — wall A's floor run stops short
by the panel's footprint, derived from `run-end-panel.ts`'s constants (ADR 0110 B3a). **Option 2 is not
taken:** vetoing the panel at the wall's end would hide a declared product element (ADR 0045) to make a
proposal fit, and a validator mark would mark something the product itself proposed — both against the
owner's point 3. **Is option 1 mandatory for the shell whatever the editor does? Yes** — the shell is a
proposal, and a proposal fits its walls, finished end included.

**Can a customer reach it today? Not in the shipped kitchen, by any command found reading the code.**
Recorded space on wall A comes only from bodies' own extents there, and the reference run ends at 3500:
`setWidth` needs an adjacent empty column to fund a growth (ADR 0031) and there is none past 3500; an
insert fills only a recorded opening. **M7's shell was the first producer of recorded space flush to
wall A's end**, which is why the finding is new. What remains reachable is a stored document written
through `PUT` with recorded space to the wall's end — a crafted one, drawn with the panel past the
wall, which no validator reads; recorded as backlog 64, not fixed here. QA should confirm the
"unreachable" reading by trying the widen-to-the-end path on the seeded kitchen.

**Q1.3 (Low, pre-existing) — a hood offered over wall A's corner is accepted and then marked
`RECORDED_SPAN_OVERLAPS_CORNER_BODY`. Both:** a 7D2 criterion (below) guarantees composition never
causes it, and the customer-facing offer goes to **backlog 63** — whether the offer list should drop an
entry the engine would accept and then mark is a product question, since ADR 0107 decision 3 removes
only entries the engine *refuses*.

~~**Q1.5 (Info) — accepted.** The builder copies exactly the four `DesignRoom` fields; an input carrying
an extra key yields a document `DesignSchema` accepts.~~ **Q1.5 — revised by the coordinator,
2026-09-11 (option b, refuse rather than copy):** building the room object in `shell-design.ts` trips the
room-writer guard (`demo-room-envelope.test.ts`), and validate-room's exemption argument — *it imports
types only* — does not carry over. So the builder **throws `LShellInputError`** with a new refusal code
when `DesignRoomSchema.safeParse(input.room)` fails (it is a strict object), and otherwise passes the room
through. No guard change, no literal, and no document `DesignSchema` would refuse is ever produced.

**The implementer's change list (the code is frozen until dispatched):**

1. **`src/generation/shell-design.ts`, `plannedEndMm`** — wall A's floor run ends at
   `wallLengthMm("A") − panelFootprintMm`, with `panelFootprintMm` computed from
   `RUN_END_PANEL_THICKNESS_M + RUN_END_PANEL_GAP_M` (imported, converted through the whole-millimetre
   reader, never a literal); wall A's wall-only run over the corner and all of wall B are unchanged.
2. ~~**The room** — build `{ shape, widthMm, depthMm, heightMm }` explicitly from the input (Q1.5).~~
   **The room (Q1.5, revised):** refuse an input room that `DesignRoomSchema` rejects with a named
   `LShellInputError`; pass a valid one through untouched.
3. **The implementer's criterion-3 and criterion-5 tests** move their expected wall-A floor interval
   from `[900, A]` to `[900, A − panelFootprint]`, the footprint read from the same constants. **This is
   an anchor change this adjudication orders, not a weakened assertion**: no tolerance widens, no case is
   dropped, and the P3 parity rule applies to the new end unchanged.
4. **New test:** in the reference room and across the approved range, after filling every wall-A floor
   opening with a `base-cabinet`, `runEndPanelSeatM` plus half the panel's thickness is at or before
   wall A's end. QA's two adversarial tests stay as written and must turn green. **Amended 2026-09-11
   (Adjudication 7D1-Q2):** for wall A from 900 to 918 mm the bare shell's corner base alone puts the
   panel past the wall, which only 7D1b's veto fixes — so that band is an **`it.fails`** case in 7D1,
   named for 7D1b, at 900 and 918 at least, and 7D1b flips it.
5. ~~**New test (Q1.5):** a room input with an extra key produces a shell `DesignSchema` parses.~~
   **New test (Q1.5, revised):** a room input with an extra key throws `LShellInputError` with its code,
   and produces no document.
6. **Must not:** touch `run-end-panel.ts` or its veto; add a validator code; move wall B's reserve.

**Criteria added elsewhere by this adjudication:**
- **7D2 (criterion 14):** composition places nothing in the wall band over wall A's corner zone
  (`[0, 900]`) — no wall cabinet, no hood. F2's *"same widths"* cannot be honoured over a 900 mm corner
  base (the widest wall cabinet is 800), so the zone is left as an empty column the customer can fill;
  and the hood stands only over the hob, which is never in the corner. *Property:* no returned design
  carries a `RECORDED_SPAN_OVERLAPS_CORNER_BODY` finding.
- ~~**7B / 7C:** a preset fits only if, after adaptation, its run-end panel's outer face is at or before
  wall A's end — the zero-findings rule cannot see the panel, so it is checked explicitly.~~
  **Superseded by Adjudication 7D1-Q2 below.**

### Adjudication 7D1-Q2 — 2026-09-11: the owner's panel ruling, and where it lands

**The ruling** — owner, option chosen verbatim: **"No panel when run hits wall"**; recorded as
[ADR 0045](../decisions/0045-the-run-end-panel-follows-the-run-it-closes.md) Amendment A, closing
backlog 64. The panel is hidden when its outer face (`run end + 19 mm`) would pass wall A's end, and
drawn when it lands on or before it. Wall A's minimum stays 900.

**Where the veto lands: `runEndPanelSeatM`, in a new small wave 7D1b — not folded into 7D1.** The
seat function is the one place the panel's vetoes live (ADR 0083 decision 5), so the new veto goes
there and gains wall A's length; the adapter only threads the room through to it, and pricing is
untouched because **the panel carries no price line** — no module under `pricing/` or
`apps/web/src/price/` reads it, so a hidden panel changes no figure and no breakdown row. **Why its own
wave:** 7D1 is a pure-domain wave already through QA; the veto changes what the editor draws for every
customer, the demo included, through the adapter and the stage, so it wants its own visual
verification and its own review rather than a late fold into a diff whose QA has run.

**B3a's wall-A reserve goes, in 7D1b, together with the veto.** It existed only so a composed run
could never push the panel past the wall; with the veto that cannot happen, and the reserve would cost
19 mm of every wall A for nothing — against the owner's *"fit exactly what fits"*. It must leave in the
**same** wave as the veto arrives: removing it first would reopen Q1.1. Until then 7D1 commits green
with the reserve, and the one band the reserve cannot help (wall A 900–918, where the corner base alone
reaches the wall) is an `it.fails` case naming 7D1b.

**The seeded kitchen and the M1 gate are untouched:** its run ends at 3500 on a 3560 wall, 60 mm
clear of the 19 mm the veto reads, so the panel stays at 3.510 and visible; the fidelity capture renders
the seeded design and does not move.

**7D1b — the panel veto** (Full tier: a rule change the editor draws for every customer; visual
verifier at 390 × 844; depends on 7D1):

1. **`packages/configurator-domain/src/run-end-panel.ts`** — `runEndPanelSeatM(records, room)`: after the
   existing column veto, return `undefined` when `seat + RUN_END_PANEL_THICKNESS_M / 2` exceeds
   `wallLengthMm("A", room)` in metres; equality keeps the panel. No new constant.
2. **`packages/three-adapter/src/kitchen-shell.ts`, `scene-sync.ts`** — `syncRunEndPanel` and
   `SolidSyncInput` gain the room and pass it through; no rule in the adapter.
3. **`apps/web/src/scene/kitchen-stage.tsx`** — hands the design's room to the solid sync.
4. **`packages/configurator-domain/src/generation/shell-design.ts`** — remove B3a's wall-A reserve: wall
   A's floor run ends at the wall again; the criterion-3/5 tests' wall-A interval returns to
   `[900, A]` (an anchor change this adjudication orders).
5. **Tests:** the 7D1 `it.fails` band (900–918) flips to passing; a run ending exactly 19 mm short keeps
   its panel, 18 mm short hides it, flush hides it; the seeded kitchen's seat and visibility are
   byte-identical to before; QA's two panel tests stay green; `run-end-panel.test.ts` and
   `qa-6n-a-run-end-panel.adversarial.test.ts` keep every existing case.
6. **Must not:** change the panel's existence in the shell manifest, its thickness or gap, the column
   veto, or anything under `pricing/`.

**Q1.5** is revised by the coordinator (refuse, not copy) — recorded at its line above.

### 7D1 close-out — 2026-09-11, `f5b4cd9`

**What shipped:** `buildLShellDesign`, the generation shell. Structural corner pieces are kept if
they fit under the ceiling. Each free run is tiled at 800 mm from its own centre: wall A's floor run
`[900, A − 19]` (the run-end panel reserve, B3a — removed again in 7D1b); wall A's wall-and-top band
`[0, 900]`; wall B's run `[900, B − 100]` (the 700 mm depth reserve, ADR 0109 Amendment C / owner
F7). `base-cabinet` and `wall-cabinet` are the neutral depth sources. No `removePlacement` and no
clip. Refusals fire in order: `ROOM_NOT_A_DESIGN_ROOM`, `ROOM_NOT_L`, `ROOM_OUTSIDE_ENGINE_LIMITS`,
invalid timestamp; a zero-height run records nothing. The wall A 900–918 mm band is 19 `it.fails`
cases, owned by wave 7D1b.

**Verified at the commit by the coordinator:** domain **4072/4072**, the web QA store file **23/23**,
domain typecheck clean, whole-tree `format:check` clean. The pre-commit hook (format +
whole-workspace lint) ran normally on `f5b4cd9`; the docs commits `f3808ea` and `9654526` used
`--no-verify`.

**Premises (7D1-P, P1–P7):** the implementer found seven punch-list premises that did not match the
code, before writing anything. The architect withdrew construction (a) — removing bodies from the
reference kitchen — in favour of tiling. Inherited appliance depths were refused (P6).

**QA round 1:** Q1.1 (Medium) — the run-end panel landed 19 mm past wall A; a contract gap, fixed by
the reserve. Q1.2 — guard evasions, closed by QA's own tests. Q1.3 — a corner hood is offered and
then marked; pre-existing, now backlog entry 63 and 7D2 criterion 14. Q1.4 — a stale mutation log.
Q1.5 — the room was copied as given; now refused.

**QA round 2:** confirmed a customer cannot push the panel past the wall in today's seeded kitchen,
across hundreds of command sequences. Q2.1 (Low) — `it.fails` premise honesty, closed by QA's own
test.

**QA round 3:** green. Q3.1 (Low, pre-existing) — `insert-fit.ts:636/675` lets a body stand up to
`FIT_TOLERANCE_M` (12 mm) above the room while the validator is strict, so in engine-limit shells at
heights 2188–2199 a 2200 mm column body yields `PLACEMENT_ABOVE_ROOM`. Not reachable by a customer —
approved heights start at 2200. Recorded as backlog entry 65.

**Logic review:** R1.1 — the contract claim in ADR 0110 Amendment D2 was false (it implied a 400 mm
gap between the preparation cabinet and the hob); revised as Amendment D, plan widths first. R1.2 —
rooms outside the engine limits are now refused; heights 860–1500 were fixed by the zero-height
guard. R1.3 — stale QA comments and seams, fixed by QA. R1.4 — literal depth anchors 620/720/330/400.

**Clean-code review:** C1.1 a rename; C1.2 helpers moved into test support; C1.3 a function split;
C1.4 noted only, no change.

**Deviations from the punch list:** the seven premise corrections above (7D1-P), and the owner's two
adjudications reached mid-wave (7D1-Q1 on the reserve and the corner-hood finding, 7D1-Q2 on the
run-end-panel ruling that opened wave 7D1b) rather than being settled before dispatch.

### 7D1b close-out — 2026-09-11, `f61c361` + `85091cc`

**What shipped:** ADR 0045 Amendment A's run-end-panel veto now hides the panel when its outer face
would pass wall A's end; equality, including floating-point noise within the existing touching
tolerance, keeps it. The earlier column veto still runs first. `room` is threaded through the domain,
three-adapter and `KitchenStage`; the adapter contains no duplicate policy. ADR 0110 B3a's 19 mm
wall-A shell reserve is removed, so the shell again uses the full wall-A run. Nothing under pricing
depends on the panel, and no pricing surface changed.

**Commit correction, preserved rather than smoothed over:** `f61c361` is the WIP implementation
commit and was made with `--no-verify`. It captured `shell-design.ts` while QA's mutation runner had
temporarily restored the 19 mm subtraction. `85091cc` immediately restores the intended full-wall
line. The green evidence below is from `85091cc`, not from the transient mutant in the WIP commit.

**Adversarial QA at `85091cc`:** domain **4082**, three-adapter **3037**, web **2587**; typecheck,
lint and whole-tree format clean. The earlier two red B3a tests were rewritten against the veto and
are superseded by this pass. QA findings Q4.1–Q4.3 are embodied in tests. The seeded panel remained
visible at seat **3.510** across the tested customer command sequences. Approximately 26 other test
files changed only by adding the required `room` argument.

**Full-tier review:** logic review of `a5c1e0e..85091cc` found no defect. It checked the veto's
boundary, equality and tolerance; the existing column veto; shell-reserve removal; room threading;
the seeded invariant; the tests; and the absence of a pricing dependency. Clean-code review finding
**R1.1 (Low)** notes that the new 236-line dependency-aware `KitchenStage` test duplicates mock
harnesses. It is **not a defect and is not changed in this wave**: that test intentionally models
dependency-aware rerenders that the existing always-run effect test cannot. Consolidating every
`KitchenStage` harness would be a cross-wave refactor. Re-open R1.1 only when a second
dependency-sensitive `KitchenStage` test is added or these mocks next change.

**Visual verification:** passed at exact **390 × 844** and **1440 × 900**, on
`/configurator/configure` redirecting to `/ro/configurator/configure`. The seeded panel was visibly
present at wall A's end; presets and orbit worked; there was no application exception, `pageerror` or
failed request. The verifier's build passed. The numeric 3.510 was **not** browser-derived because no
scene debug hook exists; the adapter test establishes it. No strict pixel-identity baseline existed,
so this is an observed presence and interaction pass, not a pixel-diff claim. The inspected evidence
was transient at `/tmp/lemnaria-7d1b-visual-85091cc/report.json`. Non-blocking diagnostics:
`THREE.Clock` deprecation, `ambient-light-sensor` permissions-policy, report-only CSP, expected WebGL
`readPixels` stall and favicon 404.

**Final local gate, coordinator-run on the frozen tree, 2026-09-11:** `pnpm ci:local` exited **0**.
Format, lint and typecheck passed. Domain **4082/4082**, persistence **282/282**, three-adapter
**3037/3037** and web **2587/2587** passed; Playwright reported **191 passed + 2 expected skipped
(193 total)**. Build, boundary, lockfile and SCA passed, with **no known vulnerabilities**.

**Close-out and push:** documentation committed at `1e96104`. The pre-push `pnpm ci:local` passed
in full again, then `origin/m7-room-and-presets` advanced from `c9f43ea` through `1e96104`.

### 7D2 close-out — 2026-09-12, `4133cdc`

**What shipped:** generation now starts with a pure arithmetic row plan in the owner's
fridge-free 700 → sink 600 → preparation 600 → hob-with-oven 600 order, applies F3's core-drop
order, chooses the wall cut, then recomputes 600 mm storage on each final remainder. The shell is
tiled at those exact boundaries and every body is placed through `insertBody`; `setWidth` is used
only where a free-end fit column merged with at most 200 mm of remainder. The wall-B depth reserve
is retained. Bases precede resizes and wall-band uppers; the hood replaces the upper over the hob,
and nothing is composed above the fridge, corner or in the top row. A failed minimum returns no
design. Generation and replay borrow one probe lease apiece and replay exactly.

The successful-command reconciliation now belongs to the domain and is shared by generation,
replay and the web store. `GenerationLog.occurredAt` makes replay self-contained. Real-Three parity
includes actual worktop intersections at both 600 and 700 mm depths. The no-plan 7D1 shell path is
unchanged.

**Adversarial QA:** the first round added **44 independent tests** — **33 domain** and **11
real-Three** — and ran the full domain suite at **4,131** and adapter suite at **3,054**. The final
round passed domain **4,136**, adapter **3,059** and web **2,588**, restored exact production
fingerprints and left no mutant active. Across both rounds, nine mutation classes were caught:
replay-step omission, resize suppression, wrong sink build, an extra probe lease, moved-column stage
omission in shared reconciliation, clipping-order reversal, a fresh replay timestamp, a 2 mm
worktop widening, and storage suppression. The wall-A 2700 / wall-B 1599, 1600, 1699 and 1700
boundaries are asserted explicitly.

**Full-tier review:** logic review initially raised ambiguous criterion-10 storage wording and
missing worktop intersections. Clean-code review found the domain/web reconciliation funnel
duplicated and replay dependent on a caller timestamp. The implementation and contract were
repaired as described above. Architecture adjudicated storage as two stages — core selection, then
A4 final-remainder refill — without a new owner decision; ADR 0110's 2026-09-12 clarification records
it. QA finding Q1.1 identified the future 7A2 contract gap: its 560 mm catalogue-floor sink did not
match 7D2's 600 mm generated target. ADR 0108 Amendment E preserves legal manual 560 mm sinks and
corrects only the generated-room predicate. The same reviewers re-ran their reviews: logic reported
“matches intent — no remaining actionable logic findings”; clean-code reported no actionable
defect.

**Coordinator verification on the frozen `4133cdc` tree:** `pnpm check` exited **0** with live
database access. Domain **4,136**, persistence **282**, three-adapter **3,059** and web **2,588**
passed; format, lint and typecheck were clean. The first sandboxed attempt failed when its network
policy blocked Neon and is not green evidence. The wave table marks 7D2 visual **No**, so no visual
verification was run.

**Final gate and push:** implementation is `4133cdc`; documentation close-out is `2126d52`. The
first final `pnpm ci:local` attempt is preserved as a failure: one live-Neon backup/restore case hit
its 30-second timeout, so persistence was 281/282 while every later gate completed green. The
complete rerun passed domain **4,136**, persistence **282**, three-adapter **3,059**, web **2,588**,
Playwright **191 passed + 2 expected skipped (193 total)**, build, boundaries, lockfile and SCA. The
pre-push hook then passed that full gate set again and advanced `origin/m7-room-and-presets` from
`4fa463f` through `2126d52`.

### 7A2 close-out — 2026-09-13, `f97d621`

**What shipped:** `APPROVED_ROOM_POLICY` now carries an owner-approved `minimumKitchen` with a
600 mm generated sink, 600 mm hob and the L corner's 900 mm wall-A / 1000 mm wall-B reaches; its gate
is enabled. `ENGINE_ROOM_LIMITS` derives the same figures from generation priorities and corner
reach, while its gate remains informational and disabled because the engine object describes the
shell envelope rather than the product rule. `validateRoomInput` evaluates the coupled predicate
only after every field passes and then emits exactly
`{ field: "shape", code: "ROOM_TOO_SMALL_FOR_KITCHEN" }`. In B→A order the minimum can place both
bodies on A, both on B, or the sink on B and hob on A. The public package exports
`LMinimumKitchen`. Manual insertion and resizing still permit the catalogue's 560 mm sink floor.

The exact ADR 0108 Amendment E boundaries ship: A=900 has B2199 refuse / B2200 accept; B=1000 has
A2099 refuse / A2100 accept; A=1500 has B1599 refuse / B1600 accept. A 900 × 2160 room refuses.

**Implementation finding I1.1, adjudicated without a new owner decision:** the implementer's
property found that 3501 × 1700 × 2200 passed validation but generation threw. A 201 mm physical
remainder had been compared where the usable whole-millimetre grid remainder was 200 mm. This is a
pre-existing 7D2 defect under ADR 0110's odd-span rule and revised Amendment D, not part of the new
room policy. `wholeMillimetreReachableEndMm` now supplies both shell tiling and `lShellFloorRuns`;
exact wall-A and mirrored wall-B regressions hold the existing 200 mm rule with no `<= 201`
exception. ADR 0110's 2026-09-13 correction records the related witness arithmetic: B=1699 has
98 mm planned, plus 1 unrecordable millimetre and the 100 mm reserve = 199 mm physical; B=1599 has
598 mm planned, not 599. The product cap and transition boundaries do not move.

**Adversarial QA:** the initial dispatch was invalidated because implementer cleanup moved the tree;
QA restarted from the new frozen baseline. It added **37 tests in two files**, passed **409/409**
focused cases and the full domain suite at **4,196/4,196 across 190 files**, killed and restored
**10 mutation classes**, and ran a **287-case odd/even generation sweep**. Production fingerprints
were restored and QA reported no production findings.

**Full-tier review, no visual or security pass:** logic and clean-code review ran in parallel after
QA. Clean-code R1.1/R1.2 produced a public type export and removed unsafe test-helper casts; QA's
TS2339 test narrowing was also repaired. The second round was clean. Coordinator lint then exposed
an optional-chain style issue and QA-test lint errors; after those fixes the same reviewers ran R3
and both reported clean. Logic R1.1 was the documentation disagreement in ADR 0110's odd-span
witness, corrected here and in that record. The wave-table visual column is **No**.

**Coordinator verification on the frozen tree:** the first `pnpm check` attempt caught seven lint
errors and stopped. After repair, a sandboxed rerun passed format, lint, typecheck and domain
**4,196**, then failed only because the sandbox blocked Neon: persistence **14 failed, 196 passed,
72 skipped**; it is not green evidence. The complete elevated `pnpm check` exited **0**: format,
lint and typecheck passed; domain **4,196**, persistence **282**, three-adapter **3,059** and web
**2,588** passed. The pre-commit hook formatted the staged files without changing them and reran
lint green. Implementation is `f97d621`; documentation close-out is `6cde5ef`.

**Final gate and push:** coordinator-run `pnpm ci:local` exited **0** on the frozen tree. Format,
lint and typecheck passed; domain **4,196**, persistence **282**, three-adapter **3,059** and web
**2,588** passed; Playwright reported **191 passed + 2 expected skipped (193 total)**. Build,
boundaries, lockfile and SCA passed, with no known vulnerabilities. The pre-push hook passed the
same full gate set again, then advanced `origin/m7-room-and-presets` from `43bf2dc` through
`6cde5ef`.

### 7E1 close-out — 2026-09-13, `57f1e94`

**What shipped:** `/ro/configurator/room` and `/ru/configurator/room` are exact localized customer
routes under the existing CSP/nonce proxy. The root redirects through one locale-aware href to Step
1. A pure `room-url-state` boundary accepts Next's raw query shape, rejects repeated or malformed
values before the domain, converts canonical metre text to whole millimetres through the existing
integer-only parser, and then hands a typed `RoomInput` to `validateRoomInput` with
`APPROVED_ROOM_POLICY`. Missing or invalid input resolves to the earliest truthful 1A/1B/1C state
with its fields marked; a valid L reaches 1D with the domain's `DesignRoom`. Serialisation emits only
the chosen shape's walls, height and direction, and no unknown input key survives it. The localized
page is deliberately an unstyled semantic placeholder for 7F1.

Scope held to **four production and six test files, 953 insertions and 10 deletions**. The configure
page, editor, its existing e2e navigations, Playwright readiness URL and fidelity capture remain
unchanged. That is the 7E1-only staging required by ADR 0111 Amendment A: 7E4 first moves the suite
and tooling, then 7E3a retires the customer demo route while adding server-side visitor resume.

**Adversarial QA:** the final focused suite passed **122/122**. The round-trip property ran **500
cases per arm**, **2,500 total**, across linear, L-left, L-right, U-left and U-right. QA killed and
restored **9/9 meaningful mutation classes** and reported no Q findings. QA was cut off while one deliberate page
mutation was present; the coordinator identified and restored that exact residue before rerunning
the focused tests and static gates, so no mutation entered the code commit.

**Full-tier review, unstyled-only:** logic L1.1 found that the runtime e2e route matrix had not yet
asserted the new exact room route and its nested-route 404; logic L1.2 found a probabilistic
branch-coverage hole. Both were test-only findings, both were repaired, and logic re-review passed.
Clean-code review reported no findings. The visual column is **Unstyled**, so no visual pass ran.
The wave changes no authentication, persistence, customer data, write endpoint or dependency, so no
security pass ran.

**Coordinator verification:** the complete elevated `pnpm check` exited **0**: format, lint and
typecheck passed; domain **4,196**, persistence **282**, three-adapter **3,059** and web **2,667**
passed. Focused locale-routing Playwright passed **4/4** on the rerun outside the sandbox. The first
sandboxed `pnpm check` was intentionally terminated after persistence network timeouts, and the
first sandboxed Playwright attempt failed to bind with `EPERM`; neither is recorded as green
evidence.

Implementation is `57f1e94`; documentation close-out is `160983d`. The final `pnpm ci:local` and
the pre-push rerun both passed all gates: format, lint, typecheck, unit tests, **191 Playwright
passes with 2 expected skips**, build, boundaries, lockfile and SCA. Every M7 commit through
`160983d` is pushed to `origin/m7-room-and-presets`. Next wave: **7E2**.

### 7E2 close-out — 2026-09-14, `470e5c9`

**What shipped:** `createDesignCreationAttempt` (`apps/web/src/room/create-design.ts`, new) — one
deliberate selection, minting once and writing before navigation. Concurrent taps on one attempt
collapse to a single `POST`; a failed `PUT` retries onto the already-minted row; a failed mint
re-mints with no stray write; the completed write is cached before navigation so a throwing router
retries only the hand-off; a synchronous repository throw becomes a rejection so both failure shapes
share one retry path. The editor's two back controls and the load-error start-over are now live
links to `/configurator/room` carrying the design's room, through `roomHrefFromDesignRoom` in
`room-url-state.ts`. 15 files, 1,297 insertions, 18 deletions.

**Adversarial QA:** round 2, the final focused suite, passed **22 test files, 381 tests, 0 failed**,
under `rtk proxy`. The coordinator re-ran it after the review fixes and reproduced the identical
22/381.

**Reviews:** logic review found all six criteria met, nothing contradicting ADR 0111, ADR 0069
decision 5b, ADR 0085 or ADR 0104/0108. Clean-code review reported no must-fix items and three
clarity items, all applied. Security review is **clean** — the wave adds no dependency, no
environment variable and no API route.

**Light visual check at 390 × 844:** all four navigation items pass. Both back controls keep the
22 px back column and 52 px bottom row; no underline or link colour; 44 px targets met; no
horizontal overflow on the editor, the room route or the error page.

**Coordinator verification, as measured — none of it rounded up:** whole-tree `pnpm format:check`
clean; `git diff --check` clean; typecheck and lint clean. ~~**`pnpm ci:local` had not been run at
the time of this close-out** — it is not claimed here, and is recorded separately when it lands, as
with 7E1's push.~~ **Recorded 2026-09-14, separately, once it landed — see the push paragraph below.**

**An unexplained transient, recorded rather than softened.** The first `pnpm ci:local` run for this
wave reported `LOCAL CI FAILED: e2e`. It did not reproduce: an e2e run alone immediately afterwards
was **191 passed, 2 skipped, 0 failed**, and a full `ci:local` re-run was green on every gate, as was
the pre-push rerun — three consecutive green runs against the identical commit. **The cause is
unknown and was not diagnosed**, because the first run was piped through `tail -60`, which discarded
the e2e output before it reached the log. Port 4320 was confirmed free before the re-run. This is not
called a flaky test or resolved on retry — a failure occurred, was never explained, and the evidence
was lost. If e2e fails once and then passes on this branch again, this is the precedent to check
first.

**Honest limits, recorded rather than smoothed over:**

1. `createDesignCreationAttempt` has no production caller this wave. Waves 7F3 (**Folosește**) and
   7F4 (generation) wire it — a deliberate seam between waves, not an oversight.
2. Consequently criterion 2's *"a mint or `PUT` failure leaves the customer on Step 1 with the chosen
   card and a retry"* has no UI to exercise this wave. It is proven at the unit level only.
3. Criterion 5 is satisfied only as far as this wave can reach. The criterion says the back links
   lead to Step 1 *"with the design's room filled in"*; 7E1's route renders no input elements at all,
   so no field population could be verified. What was verified: the room reaches the URL to the
   millimetre (seed `3560/2920/2600` → `3.56/2.92/2.6`) and the server parses it to substate 1D with
   nothing marked. Field population is 7F1's surface.
4. Visual gaps: no hydrated `/d/{id}` design was exercised (the verifier declined to write a row into
   the live database for a light check); the `linear` branch of `roomHrefFromDesignRoom` was never
   exercised in a browser (covered by the unit sweep; reachable only once 7J lands); keyboard
   activation was not verified.
5. Criterion 4 detail worth recording: QA found the route round-trip could **not** reach the
   version-keyed room correction, because it lives in `NeonConfigurationRepository.load` and a fake
   repository returns the document untouched. Closed by two `migrateDesign` tests — unchanged at
   `CURRENT_SCHEMA_VERSION`, rewritten at version 2 — built from one shared factory so the version key
   is provably the only difference.

**Two security facts worth recording as findings, not absences:** a `PUT` that lands but fails at the
gateway is safe to retry — it re-sends the mint's revision, which the row refuses with 409 rather
than overwriting. `provisionalMintIdentity` is opaque and per-attempt, so wave 7E3a can add the
visitor hash and the `__Host-` cookie at the route without changing this client's contract.

**Carry-forwards against 7I, 7F3, 7F4 and 7K** are recorded at each wave's own row or criteria above,
not repeated here.

**Final gate and push, recorded 2026-09-14:** `pnpm ci:local` passed in full, and the pre-push rerun
passed in full — format, lint, typecheck, test, e2e, build, boundary, lockfile and SCA all PASS. Test
totals from the green run: e2e **191 passed, 2 skipped** (5.4 minutes); unit/integration **4,196,
282, 3,059 and 2,704** tests across their suites, all passing. `41181d8..8434e76` is pushed to
`origin/m7-room-and-presets`; local and origin are both at `8434e76`.

Implementation is `470e5c9`; documentation close-out is `8434e76`. Next wave: **7F1**.

### 7F1 close-out — 2026-09-14, `5d2ff54` + `852df10`

**This wave closes on what it actually verified, and two of the five defects its visual gate found are
closed by a different wave.** D4 and D5 are named here and their evidence lives in the 7F1-D45
close-out below. Two waves, two records; they are deliberately not blurred into one.

**What shipped — Step 1's room screen, in the five planned slices**, each its own commit:

| Commit | Slice |
| --- | --- |
| `0ee5ca6` | slice 1 — metre conversions and the shape predicate |
| `b18b38e` | slice 2 — Step 1 copy, and the constant ban with a gate on the gate |
| `b4521dd` | slice 3 — the plan's geometry as a value |
| `8d73385` | slice 4 — sub-state 1A: the top bar, three shape cards, *Continuă* |
| `5d2ff54` | slice 5 — sub-state 1B: fields, corner toggle, live plan, URL sync |

Then, in order: **`91fe900`** — adversarial QA, whose commit subject records **81 tests** and the
constant ban's own guard; **`8c05a74`** — query values escaped in the remount key, a QA finding;
**`1d5bc08`** — the combined review's **two taste findings** folded; **`852df10`** — **three
plan-preview defects found by the visual gate**, fixed.

**The visual gate at 390 × 844 filed five defects, and that is why this wave did not close the day it
shipped.** D1–D3 were plan-preview defects and are fixed at `852df10` — the defect detail is in that
commit rather than restated here. **D4** (browser Back loses a typed room) and **D5** (a traversal
renders 1A under a 1B URL) were **ruled and not fixed**: the ruling is **R9** in this wave's punch list
above, taken on a `next build` + `next start` measurement with `history.length` constant across every
traversal. R9 struck R2's `history.replaceState` mechanism while leaving R2's *outcome* — the URL
carries the room as it is typed — standing.

**So 7F1's own verification ended with D4 and D5 open.** Both are fixed by **wave 7F1-D45**, whose
close-out below carries the production-build gate, the traversal e2e and the closing visual gate that
re-confirmed them closed. Nothing in this section claims that verification.

**Owner input:** F8 (all three shape cards drawn as the design shows them, the U card inert until M7B)
and R4 (one isotropic scale for the plan preview) are the owner's; R1, R2, R5, R6, R7 and R9 are the
coordinator's. All are recorded with their basis in *Seven rulings* above, and **no owner question on
7F1 was left open**.

**Limits and departures carried out of this wave, recorded rather than smoothed over:**

1. **The one departure from frames 1A and 1B is the plan preview's isotropic scale** (criterion 12,
   owner-ruled R4). The frame draws the two walls at two different scales; the screen draws one. It is
   named here because a reviewer comparing the screen against frame 1B will see it, and a ruled
   departure belongs in the record rather than normalised into looking like the frame.
2. **`wallC` is covered by criterion 4's property and by no visual evidence.** U is M7B, so the third
   field was never exercised at the gate. This is risk 4's stated limit, recorded as that risk required.
3. **The locale menu is imported across routes from `src/app/configurator/configure/`**, knowingly and
   with a comment at the import naming R5's own wave as its removal. R5's re-estimate — five bindings,
   two of them ADR 0104 structural guards on the top bar's grid — is written up above so that wave is
   not costed cheaply a second time.
4. ***Continuă* at 1B does nothing observable, and it is waiting for a destination rather than broken**
   (Q-D45-5). Step 2 is 7F4's. The `<button>` stays.

**Carry-forwards are recorded at the waves that owe them, not repeated here:** 7F2 (the refusal
sentence and 1C as a live state), 7F3 (*Continuă*'s destination), 7J (widening `BuildableShapes`,
`ENGINE_ROOM_LIMITS`, `APPROVED_ROOM_POLICY` and `validateRoomInput` together, changing nothing under
`apps/web/src/room`).

Implementation is `5d2ff54`, with the visual-gate fixes at `852df10`. **D4 and D5 close at
`8437c95`/`6682d8e` under wave 7F1-D45.** Next wave after 7F1-D45: **7F4**.

### 7F1-D45 close-out — 2026-09-14, `8437c95` + `6682d8e`

**What shipped — D4 and D5 closed by making the client the single authority on the room the customer
is looking at**, under ruling R9. Commits in order:

| Commit | What |
| --- | --- |
| `461b739` | the wave plan |
| `74c5b39` | **slice A** — the convergence loop: new `src/room/room-query-sync.ts` (`queryFromSearchParams` over `getAll`, the pure `reconcileRoomDraft`, `URL_SETTLE_MS` = **400 ms** as one named constant, and `canonicalRoomQuery` / `roomDraftFromQuery` moved verbatim out of `room-screen.tsx`); `roomEntryKey` and `useCanonicalQueryInTheAddressBar` deleted; the departure path — flush, observe the echo, then push; `ROOM_HISTORY_WRITE_SELECTORS` added to `eslint.config.mjs`'s room block with the full list re-declared, as R1 requires |
| `8187a80` | slice A's production gate measured — **all five checks green**, tabled in the wave section above |
| `8437c95` | **slices B and C** — the server's parse removed (`await connection()`, `<RoomScreen />`, `data-room-substate` and `data-marked-fields` derived from the live query) and the traversal e2e added |
| `0c0f1da` | adversarial QA — **45 tests** — committed together with two owner rulings that belong to the generation waves, not to this one |
| `0e4e092` | the no-second-discriminator guard recorded as *Înapoi*'s only guard |
| `6682d8e` | the review's **two legibility findings** folded |

**Verification actually performed, as measured and not rounded up:**

- **The suite: 203 test files, 3,034 tests, 0 failed.**
- **Typecheck, lint and whole-tree `pnpm format:check` green.**
- **A production-build measurement gate on slice A, before slice B was dispatched** — `next build` +
  `next start`, Playwright against chromium at 390 × 844 / hasTouch / isMobile with real keyboard
  events. **All five checks passed:** the caret and value survive the settle, `history.length` does not
  grow while typing, Back returns the full typed room (**D4's original repro, closed**), the departure
  flush keeps a digit typed inside the settle window, and neither button is dead. The full table, with
  the measured values, is in the wave section above and is not restated here. The route table printed
  `ƒ /[locale]/configurator/room`, which is criterion 17's build-output check.
- **Adversarial QA with 19 deliberate breaks, of which 18 reddened a test.** The nineteenth did not.
- **One combined logic + clean-code review, no blocker**; its two legibility findings are folded at
  `6682d8e`, and a third finding it made is recorded as a rule rather than a repair — see *Înapoi*'s
  guard below.
- **A closing visual gate at 390 × 844 in both locales, with zero defects filed.** Criterion 14 —
  **44 px targets across 16 elements**, over both sub-states. Criterion 15 — **no horizontal overflow
  at 390**, in both locales, across **five layout states**. The new caret check passed in **both**
  locales. It re-confirmed **D4 and D5 closed in a production build**, and confirmed that a
  **non-canonical arrival canonicalises in exactly one write with a `history.length` delta of 0** —
  risk 1's replace loop, measured rather than argued.
- **`pnpm ci:local` — PASSED.** The script's own verdict line: `LOCAL CI PASSED — all gates green,
  safe to push`. **193 e2e tests in 5.7 minutes** against a production build, including the new
  `room-traversal.qa.e2e.spec.ts`. Read from the log rather than taken from an exit code — a gate
  piped through `tail` once reported the pipe's status while the run itself had failed.

**The new e2e, `dev` versus CI, stated honestly.** `apps/web/tests/e2e/room-traversal.qa.e2e.spec.ts`
**passed locally against `next dev`** while it was being written — which criterion 23 explicitly
refuses as sufficient, because D4 and D5 were both found in a production build. **It ran against
`next dev` inside `ci:local` too, and criterion 23's production requirement is therefore NOT met by
any local run.** `playwright.config.ts:15` gates the server on `process.env.CI !== undefined`;
`scripts/local-ci.sh` calls `pnpm test:e2e` without setting `CI`, so every one of that run's 193 e2e
tests used `next dev`. **CI is the only run that satisfies criterion 23**, and the push reruns the
gate.

> **This paragraph briefly claimed the opposite and was corrected before the commit landed.** The
> claim — that `ci:local` satisfied criterion 23 — is the kind that is *plausible from the gate's
> name*: a script called `ci:local` reads as though it reproduces CI, and its own banner says *"safe
> to push"*. It does not reproduce the one thing this criterion asks for. The check that settled it
> was two greps and `printenv CI`, not a re-reading of the prose.
>
> **What does hold locally in a production build** is separate and stronger evidence for the same two
> defects: slice A's five-check measurement gate and the closing visual gate, both above, each built
> and served with `next build` + `next start` and each re-confirming D4 and D5 closed. The e2e's
> value is that it will **keep** them closed on the runner; it is not what proved them closed.

**One defect the closing gate found that this wave does not fix, recorded where the wave that owns it
will meet it.** *Selecting the **U** chip while `wallC` is empty leaves the plan preview drawing the
**L** plan.* It is **7F1-shipped behaviour and not a regression**, settled by the diff rather than by
argument: this wave's source diff is exactly `app/[locale]/configurator/room/page.tsx`,
`src/room/room-query-sync.ts` and `src/room/room-screen.tsx`, and `plan-preview.tsx` and
`dimensions-form.tsx` are untouched. The surface is **7F2's**, and the entry is on 7F2's list of
additions above — not in `docs/backlog/open.md`, which is for items with no owner and no phase.

**Two observations that are not defects**, recorded so they are not filed as ones later: *Continuă*
stays disabled on `linear` and `U` even when every field is filled, because only `L` carries bounds in
`APPROVED_ROOM_POLICY` — that is criterion 3's asserted state, with the refusal sentence owed by 7F2;
and the browser's default focus ring is blue against the brown palette, which this wave did not change
and did not introduce.

**Three things that must survive into the record.**

1. ***Înapoi*'s only guard is the no-second-discriminator rule.** It is not a cosmetic-residue rule. It
   is what makes `draftText === liveText` hold in the commit where a flush echo lands, and so it is the
   only thing stopping the write effect arming a timer after a departure push has been dispatched —
   which would discard the pending navigation and make *Înapoi* silently do nothing, reading as
   flakiness because a second tap works. **There is exactly one guard and it rests on I4 / criterion
   21**, property-tested at `room-query-sync.test.ts:217-269`, not on "the queries this screen can
   currently produce". The full statement — trigger condition, failure mode and secondary trigger — is
   the block quote under *One residue, accepted and bounded* in the wave section above; **read it there
   rather than through this paragraph.** It was found in **review**, after QA had swept the same code
   and not found it.
2. **Three claims the wave rested on without stating them, all found after the code was written and
   green**, by QA or by review rather than by the implementer:
   - **Next's discard semantics carry the two-tap case** — the behaviour read off
     `app-router-instance.js:146-160` is load-bearing for what happens when a second navigation arrives
     while one is pending, and the wave depended on it before it was written down.
   - **`liveQueryNamesARoom` is tautological after slice B.** Once the server's parse is gone it can no
     longer be false, so it asserts nothing about the state it appears to guard.
   - **The suppression rule costs more than its comment claimed.**
   Each is recorded because an unstated premise that happens to hold is not the same as a verified one,
   and the next reader needs to know which of the three they are relying on.
3. **One accepted limit, with the baseline it must be read against.** A browser Back **gesture** taken
   within `URL_SETTLE_MS` of a keystroke leaves that keystroke out of the entry being left; the buttons
   flush (I5), the gesture cannot be flushed for. It is **bounded by exactly one constant** (400 ms),
   **never happens on a reload**, and is **strictly better than what 7F1 shipped** — where that same
   gesture lost **the whole room**, which is D4, measured in a production build. **The baseline is
   stated so a later reader does not read an improvement with its remaining edge named as a new
   regression** and argue for reverting the fix that produced it. Flush-on-blur was evaluated and
   rejected: a second write path that shrinks the window without closing it.

**Two record corrections this wave made to its own plan, kept because they change what a reader should
believe:** the departure path is *flush then leave*, never *cancel then push* and never both
navigations in one tick — either silently restores D4 on the fastest customer path; and *Continuă*'s
push was **already** demoted to a replace before R9, so R9 removes no evidence of that tap at all
(Q-D45-5).

Implementation is `74c5b39` + `8437c95`, with the review fold at `6682d8e`. **7F1's D4 and D5 are
closed here.** Next wave: **7F4**.

### 7F4a close-out — 2026-09-15, `bf6901b` + `37f1ecb` + `6113176` + `52504d1`

**What shipped — the generation algorithm's first production caller.** A tap on *Continuă* at 1B
dynamically imports `@lemnaria/three-adapter`, borrows a transient kit through
`createBodyProbeLease`, runs `generateKitchen` **once, synchronously**, and draws frame 1F's five
rows. **7F4b — the hand-off into the editor — is not in this wave, and 1F is a dead end by design:**
the primary control stays disabled reading *Se compune…* after the rows have settled, because its
destination does not exist yet. That is the visual gate's first must-not-file, not a defect.

Commits, with the subjects as the log records them:

| Commit | What |
| --- | --- |
| `bf6901b` | **M7 wave 7F4a: the composition runs in the browser and is drawn** — `src/room/generation-model.ts`, `use-generation.ts`, `generation-steps.tsx` (all new), `room-screen.tsx` and `room.module.css` edited, both catalogues, the lock and the golden manifest |
| `37f1ecb` | **stop stranding a kit, and deliver a composition whose kit would not go back** — adversarial QA's two live findings |
| `6113176` | **fold the review's three findings**, and plan waves 7P1 and 7T (the planning half is those waves', not this one's) |
| `52504d1` | **the owner's words for 1F**, and preset retention recorded |

Two commits inside the `bf6901b~1..1afd65c` range belong to other waves and are named so they are not
read as this one's: `30a52a0` re-measures wave 7H at `bf6901b`, and `a03ecca` records that the corner
does not break the dishwasher's adjacency to the sink. **Which of the four defects below landed in
which commit is not stated here**, because this pass read the tree and the log's subjects, not the
diffs.

**Verification actually performed, as reported and not rounded:**

- **The suite: web 210 files / 3,173 tests; `three-adapter` 78 files / 3,071 tests.**
- **Typecheck, lint and whole-tree `pnpm format:check` green.**
- **Adversarial QA: 45 tests, 19 deliberate breaks, of which 18 reddened a test.** The nineteenth did
  not, and it is QA finding **F2** — defect 4 below.
- **One combined logic + clean-code review: no blocker, three findings, all folded** at `6113176`.
- **A production-build visual gate at 390 × 844 in both locales.** Criterion 14 — **44 px targets
  across 16 elements**. Criterion 15 — **no horizontal overflow at 390**, across **five layout
  states**. **No `line-through` on a *nu poate fi inclus* row** (R10). **Five *Înapoi* round trips
  with the draft intact**, and **`history.length` never moved** (criterion 24, R13). **Tap-to-rows
  medians of 24–26 ms, n = 10 each** (criterion 38).
- **`pnpm ci:local` has NOT been run for this wave, and nothing is pushed.** Both are **pending**.
  This record does not claim a gate that has not run; `origin/m7-room-and-presets` is behind local by
  the whole of this wave.

**The four defects the wave found and fixed. These are the record's substance.**

1. **A kit leaked whenever anything between `makeKit` and the lease threw.** `createBodyProbeLease`'s
   `finally` brackets the body of `lease.use` and **not** the factory that built the kit, so the two
   steps between `makeKit` and the lease — building the room, and building the probe over it — had no
   `finally` above them, and `composeKitchen`'s `catch` turned the throw into the failure screen
   without freeing anything. **Measured `{ built: 1, disposed: 0 }` at both throw sites.** The
   realistic trigger is a low-end phone running out of memory after the textures baked (risk 2), where
   **every retry from *Înapoi* stranded one more kit for the page's lifetime**. Fixed by
   catch-release-rethrow at the allocating site (`use-generation.ts:200-227`) rather than by a second
   lease, because `body-probe.ts` declares itself the only `finally` in that seam — its contract is
   that `release` runs exactly once per `use`, not that `release` cannot fail.
   **The same finding has a second half that is a separate rule:** a `finally` that throws *replaces*
   what its block was returning, so a `disposeKit` that failed used to travel out of a
   `generateKitchen` that had already returned `ok: true` and land in `composeKitchen`'s `catch` — the
   customer reading *composition could not be completed* over a kitchen that was composed correctly.
   **A composition that succeeded is delivered**; a kit that will not go back is logged
   (`releaseOrReport` / `reportKitReleaseFailure`, `use-generation.ts:229-283`).
2. **A failed screen drew green *inclus* rows.** `generateKitchen` has a second refusal arm
   (`generate-kitchen.ts:296-300`) that returns `ok: false` over a log in which the fridge and the
   storage cabinets may already be `placed` — so the customer read *Compunerea nu s-a putut finaliza*
   above *Frigider — inclus*, **for a design that was discarded and that nobody will ever open**. The
   `failed` state now carries **no `rows` property at all** (`use-generation.ts:75-94`), so drawing
   them is a **compile error** rather than a branch a component has to remember not to take. The same
   absence covers the throw, which ends before a log exists.
3. **Browser Back out of 1F did nothing.** The history entry behind 1F is the settle's `replace` of
   the same room query, so the URL never moved and the screen stayed in composition — the
   dead-control class wave 7F1 was spent removing. Cleared by a `popstate` listener
   (`room-screen.tsx:130-135`). **R13 is intact:** the run is cleared by an *event*, and nothing about
   composition is written to or read from the URL, so composition stays unaddressable.
4. **A comment cited a test file that did not exist, and nothing guarded the `.composeRow*`
   classes.** `ROW_STATUS_CLASS` satisfies `Record<GenerationRowStatus, string | undefined>` because a
   CSS module's exports are typed `string | undefined`; renaming or dropping `.composeRowDropped`
   makes the `not_placed` entry `undefined`, `classNames` filters it out, and **the dropped row
   silently loses its dashed border, its muted background and its `−` glyph — all of R10 — with the
   suite green.** The one R10 assertion that existed before was
   `expect(fridge.className).not.toContain("strike")`, which is **negative and passes more easily once
   the class is gone**. The replacement is `tests/room/generation-steps.dom.test.ts`.

**Three things that must survive into the record.**

1. **The guard the coordinator specified would have been vacuous, and the implementer measured that
   rather than building it.** `vitest.config.ts` enables no CSS processing, so a `.module.css` import
   resolves to a stub that **fabricates a class name for any property**: `styles.composeRowDropped`
   and `styles.thisClassDoesNotExist` are both `"_<key>_<hash>"` strings under the test runner. A
   presence check — in the module or in the DOM — therefore asserts nothing. What is not vacuous is
   the **pair**: the class the row *actually renders with*, read off the DOM, against
   `room.module.css`'s own text, **read by path** exactly as `plan-preview.dom.test.ts:45` reads it.
   **This is the fourth "green over something that never ran" recorded against this milestone** — the
   others are M6B's four dead gates, its parity gate that enforced the Russian plural defect, and
   7F1-D45's tautological `liveQueryNamesARoom`. The pattern is not a coincidence and the lesson is
   the one that keeps recurring: **a guard is worth what its falsification shows, not what its name
   claims.**
2. **Criterion 34's boundary list was mis-notated, and the code was right.** One pair was written
   `(wall B × wall A)` while its neighbours were `(A × B)`, because the three pairs were flattened out
   of ADR 0108 Amendment E's table **whose middle row fixes wall B**. `validateRoomInput` was run
   against all twelve rooms the visual gate typed and agreed with the screen **12 for 12**. The
   correction is recorded in place at the head of the 7F4 wave section above. **No code defect, no
   owner question, and owner approval is not at risk** — the orientation asymmetry itself is ruled
   (the corner assembly reaches 900 mm along wall A and 1000 mm along wall B, ADR 0108 Amendment A).
3. **Criterion 38's measurement was taken after slice 3 rather than before its dispatch.** The plan
   made it a **gate inside slice 2** — *"taken in a production build before slice 3 is dispatched"* —
   and the coordinator's correction arrived late, so it was **a number in a close-out rather than a
   gate**. The medians (24–26 ms) are far enough under the one-second stop-and-report threshold that
   the ordering changed no decision. **That is what made it harmless — it is not a justification**,
   and a slice gate taken after the slice it gates is not a slice gate.

**Owner rulings recorded during the wave.**

- ***așezat* → *inclus*, *nu încape* → *nu poate fi inclus***, and the dropped-roles sentence must say
  the wall sizes did not leave enough space. Both catalogues carry it: `room.compose.status.placed` is
  *inclus*, `.notPlaced` is *nu poate fi inclus*, `room.compose.rule` is reworded to match, and
  `room.compose.dropped` reads *"Dimensiunile pereților nu au lăsat destul spațiu pentru toate
  dulapurile, așa că nu am putut include: {roles}…"*.
- ***"not Ce includem but Ce este inclus"*** *(owner, 2026-09-15)* — the 1F list heading.
  `room.compose.stepsLabel` was still frame 1F's *Ce așezăm, în ordinea priorității* after the rows
  under it stopped saying *așezat*, and 7F4a's implementer correctly declined to change approved 1F
  copy without a ruling. **This is that ruling**, and the owner chose the **passive** form over the
  first-person *includem* that was proposed to them, so the heading and the `status.placed` row now
  carry *inclus* in the same voice. Romanian reads *Ce este inclus, în ordinea priorității*; the
  Russian is **re-drafted to follow it** into *Что включено, в порядке приоритета*, which is
  [ADR 0113](../decisions/0113-step-1-copy-is-approved-as-drafted-and-enters-the-copy-lock-in-the-wave-that-adds-it.md)
  decision 4's ordinary consequence of a reworded Romanian leaf and **not a pending approval** —
  the same footing as the other four `room.compose.*` Russian leaves.
  **`room.compose.noPresetNotice` keeps *nu încape* deliberately** — its subject is a ready-made
  preset fitting the room, not a cabinet being included in a composition.
- **The owner asked whether the algorithm could drop non-fitting cabinets by itself. It already does,
  and has since 7D1** — and the owner then ruled that **the report stays**.
- **The Romanian is approved. The Russian is an agent translation and must not be recorded as
  approved** *(coordinator, 2026-09-15)*. **An earlier ruling says something different and is named
  here rather than overwritten:** [ADR 0113](../decisions/0113-step-1-copy-is-approved-as-drafted-and-enters-the-copy-lock-in-the-wave-that-adds-it.md)
  decision 3 approves *"the Russian draft of the same leaves… by the same ruling"*. The two reconcile
  on the facts of this wave — ADR 0113 approved the **drafted** Step 1 copy, and the owner then
  **changed the Romanian**, which makes the Russian now in `ru.json` a **fresh agent re-draft** of the
  changed leaves, exactly the case ADR 0113 decision 4 calls *"the Russian re-drafted"*. **If the
  coordinator meant the wider claim — that all of 7F4a's Russian is unapproved — that overturns ADR
  0113 decision 3 and is the coordinator's to record there.** This paragraph does not do it for them.
  - **Settled against the record on 2026-09-15, and the coordinator's half of it was wrong.**
    **Gate O2 closed on 2026-09-11** — `docs/STATUS.md:6`, the owner's own words, all 235 leaves of
    `ru.json` approved as drafted — so there was no open gate for these leaves to await. The
    coordinator was citing a note that had been true when written and had gone stale by four days,
    and the brief built on it put *"awaiting Gate O2"* and *"do not record them as ruled"* into
    `generation-steps.tsx`'s header, where it would have sent a reader looking for an approval step
    that no longer exists. **ADR 0113 decision 4 is the whole mechanism**: the owner reworded the
    Romanian, so the Russian is re-drafted. The code comment now says that and cites the decision
    number.

**Stated limits, not softened.**

- **The 24–26 ms medians are a laptop over localhost.** The **399 kB** adapter chunk is paid on the
  customer's first tap, at their own network speed, on their own device. **The durable fact is the
  manifest one: `three` is absent from the room route's first load** (criterion 33) — not the
  millisecond number, which will not survive contact with a phone on mobile data.
- **The list jumps up 18.1 px when the rows resolve**, as the notice band reflows. Measured,
  repeatable, in both locales. Not filed as a defect; recorded.
- **Opening composition drops focus to `<body>`, and nothing announces the run to a screen reader.**
  Recorded, not fixed.
- **A room the domain refuses still gives a silent dead tap.** 1C's surface is **7F2's**, and of the
  five dead-tap rooms the visual gate found, **2,20 × 0,90 refuses for a different reason than the
  other four** — `WALL_TOO_SHORT` on wall B's own floor, a per-field code, rather than the coupled
  `ROOM_TOO_SMALL_FOR_KITCHEN`.
- **`ADR 0110 Amendment F` does not exist and is cited by four places in the tree** —
  `apps/web/src/room/generation-steps.tsx:232`, `apps/web/src/room/room.module.css:723`, ADR 0117 (at
  three points) and this milestone. Measured: ADR 0110 carries Amendments **A–E** and no F. **It is
  owed by wave 7D4's slice S0**, which that wave's punch list already marks *NOT WRITTEN* — the
  dispatch brief for this close-out said 7D3, and the record and both code comments say 7D4. **An open
  obligation, carried until 7D4 writes it.**

**Next wave: 7F4b**, which inherits the seam this wave armed: **a departure armed by the primary tap
resolves after the customer has left 1F.** Risk 6 named it before the wave — while *Continuă*'s push
was a no-op a discarded navigation cost nothing, and 7F4b is where it stops being a no-op.

## Wave 7F1 — dispatchable punch list

**Tier: Light** (UI assembly against a settled contract): adversarial QA, then **one** combined
reviewer. **Visual: Yes** — the 390 × 844 mobile gate applies
(`docs/best-practices/browser-and-visual-qa.md`). **Owner answers needed: none — F8 is answered.**
Seven questions the architect raised are recorded as **R1–R7** below, ruled by the coordinator on
2026-09-14; **R3 is the owner's own ruling of the same day** (F8: draw all three cards as the design
shows them). **ADRs to check intent against before starting, and to stop and report on if they
disagree:**
[0104](../decisions/0104-the-mockups-are-the-chrome-specification-and-the-strips-own-row-is-withdrawn.md)
decisions 1, 5 and 6 (the frames are the chrome specification; the 44 px mechanism; a control with a
control's affordances and no behaviour),
[0111](../decisions/0111-step-1-creates-the-design-through-the-existing-mint-then-save-and-the-room-entry-lives-in-the-url.md)
decision 3 (the room entry lives in the query string; Back restores it and a reload keeps it),
[0108](../decisions/0108-a-room-is-validated-against-policy-data-and-the-interim-policy-is-the-engines-own-limits.md)
decisions 3 and 4 and Amendment B decision B2 (no bound and no code reaches a surface; the
conversion happens once at the form boundary; linear and U stay refused),
[0113](../decisions/0113-step-1-copy-is-approved-as-drafted-and-enters-the-copy-lock-in-the-wave-that-adds-it.md)
(the lock and the golden manifest move in the commit that adds the leaf),
[0095](../decisions/0095-romanian-is-the-source-and-lives-in-message-files-and-the-domain-publishes-codes-not-sentences.md)
decisions 2 and 3, [0082](../decisions/0082-the-settings-strip-wraps-and-nothing-leaves-the-viewport.md)
decisions 1, 2 and 8 (nothing leaves the viewport; horizontal scrolling refused; 44 px).

**Goal.** Give `/[locale]/configurator/room` its real chrome and its real controls for sub-states
**1A** and **1B**. This is the wave in which a stored room becomes *visible* to the customer, which
is what closes the half of 7E2's criterion 5 that no field existed to verify.

**Not in scope, named so an implementer does not drift:** 1C's reasons beside their fields and the
red wall (7F2); 1D/1E (7F3); 1F and any call into `createDesignCreationAttempt` (7F4); the desktop
line (7L); making linear buildable (7J) or U buildable (M7B); the mirrored *kitchen* (7I — 7F1
mirrors a drawing, never a design).

### Ground truth, measured at `095d417`

- `app/[locale]/configurator/room/page.tsx` renders `<main data-room-substate data-marked-fields>`
  with a bare `<section>` and **zero** input, select or textarea elements.
- `src/room/room-url-state.ts:76-119` resolves the query into 1A/1B/1C/1D with `markedFields`;
  `serialiseRoomInput` (`:122`) emits only the shape's canonical keys; `roomHrefFromDesignRoom`
  (`:144`) emits `?shape=L&wallA=3.56&wallB=2.92&height=2.6&direction=left`. `requiredFieldsFor`
  (`:181`) and `metresText` (`:254`) are **private**, and 7F1 needs both.
- `src/room/parse-metres.ts` accepts **either** a decimal comma or a point, returns whole
  millimetres, and refuses rather than rounds. Its head comment is ADR 0108 decision 4 written into
  the code. It is settled; 7F1 does not touch it.
- `room/approved-room-policy.ts` states **`buildableShapes.L` only**, and `validateRoomInput`
  (`validate-room.ts:71-86`) refuses every non-L shape with one `SHAPE_NOT_BUILDABLE`. **Exactly one
  of the three cards can be continued from today**, and that is ADR 0108 Amendment B decision B2.
- Frames **1A** (`docs/design/mockups/Lemnaria Configurator Mobil.dc.html:48-99`) and **1B**
  (`:101-187`). 1B's order down the screen: shape chips → plan preview card → corner toggle → the
  length fields → the footer (`Înapoi` + `Continuă`). 1A's CTA is drawn inactive, 1B's active. The
  mockup's `.num` (`:16`) is `font-variant-numeric: tabular-nums`.
- `configure.step` and `configure.stepPill` already exist in `ro.json` **and in the copy lock**, so
  the room's pill needs no new leaf — it renders the same two keys at `step: 1`.
- `--touch-target: 44px` exists (`app/globals.css:22`).
- `LocaleMenu` renders `configure.module.css`'s `.locale`, which carries `grid-area: locale`
  (`:167-171`) and a desktop override (`:706`): it is positioned **by the configure screen's grid**
  and cannot be reused untouched.
- `apps/web/vitest.config.ts` includes only `tests/**/*.test.ts` — **no `.tsx`**. Component tests are
  `*.dom.test.ts` with a `// @vitest-environment happy-dom` docblock, `createElement` + `createRoot`
  + `act`, no testing-library; `tests/i18n/locale-menu.dom.test.ts` is the model. `fast-check` 4.9.0
  is already a dependency.
- **`3600`, `2400` and `2600` appear under `apps/web/src` today only inside comments**
  (`room/parse-metres.ts:37`, `configure/selection-debug.tsx:18`). That one fact decides the ban's
  mechanism — see below.

### Module boundaries

**The domain owns whether a shape is buildable, and nothing else this wave.** `room/room-policy.ts`
gains one pure predicate, `isShapeBuildable(shape, policy): boolean`, exported from `src/index.ts`.
It exists so no component ever writes `shape === "L"`: when linear becomes buildable in 7J the card
enables with **no edit under `apps/web/src/room`**, and criterion 3's adversarial arm proves it. It
returns a boolean and **no bound**, which is ADR 0108 decision 3 held exactly.

**The metre↔millimetre and comma↔dot conversions are presentation and stay in `apps/web/src/room`.**
ADR 0108 decision 4 already ruled the conversion happens once at the form boundary; a decimal comma
is a locale rule and the domain is locale-free (ADR 0095 decision 3); and the domain never sees a
metre — `validateRoomInput` takes `EnteredMillimetres`, so a metre formatter in the domain would have
no caller. **One new module owns both directions**, `src/room/metres-text.ts`:

- `metresTextForUrl(mm)` — **moved verbatim** from `room-url-state.ts:254`'s private `metresText`.
  Locale-free, always a dot: the URL is a wire form, not a reading surface.
- `formatMetresForDisplay(mm, locale)` — the customer's form, with the separator **derived** from
  `Intl.NumberFormat(locale).formatToParts(1.1)`. Never a `","` literal and never a
  `.replace(".", ",")`; `ro` and `ru` both happen to give a comma and neither is hardcoded.
- Both work on the digit string. Neither multiplies or divides by 1000 as a float —
  `parse-metres.ts:2-4` already records why.

**Everything else is presentation.** The draft being typed, the sub-state shown while typing, the
plan's geometry and the URL sync live under `apps/web/src/room`. Nothing there may import from
`packages/persistence`, and nothing may write to `localStorage`, `sessionStorage`, a cookie or a
store — the URL is the room's only store (ADR 0111 decision 3). The page stays a server shell.

### Acceptance criteria

Each names what proves it: **[unit]** a plain vitest, **[component]** a `.dom.test.ts`, **[property]**
a `fast-check` sweep, **[visual]** the 390 × 844 gate, **[lint]** a rule run by `pnpm lint`.

1. **The top bar is in every sub-state.** For each of the four URLs resolving to 1A, 1B, 1C and 1D the
   screen carries the wordmark, a step pill rendering `configure.stepPill` at `step: 1,
   totalSteps: 4` (*1/4*) whose **accessible name** is `configure.step` at the same arguments (*"Pasul
   1 din 4"*), the title, and the locale menu. **Must not:** a literal `"1/4"` or a pill composed from
   `"1"` and `"4"` in the component — the numbers are ICU arguments, so a locale change re-renders
   them. **[component]** for the four states and the accessible name; **[visual]** for the drawing.
2. **Three cards, never a dropdown.** 1A renders exactly three shape choices with 2D plan glyphs.
   **Must not:** any `select`, `option`, `datalist` or `role="combobox"` under `apps/web/src/room` —
   asserted as a count of zero over the rendered tree in **every** sub-state, not only 1A.
   **[component]**
3. ***Continuă* is disabled with no card chosen and with a refused shape.** Nothing chosen: disabled.
   `linear` or `U` chosen: disabled. `L` chosen: enabled. **Adversarial, and this is the real claim:**
   rendered against a *fabricated* policy whose `buildableShapes` names a second shape, that shape's
   CTA **enables with no edit to the component** — which proves it asks `isShapeBuildable` rather than
   spelling `L`. **[component]**

   > **R8 — `BuildableShapes` stays narrow; the fabricated policy keeps its cast, behind one named
   > helper per package. Ruled 2026-09-14, on slice 1's finding, and recorded as
   > [ADR 0116](../decisions/0116-a-type-that-refuses-an-undesigned-shape-is-a-guard-and-the-cast-that-witnesses-it-is-confined-to-a-test.md),
   > which is the binding version and carries the full sweep.** Slice 1 could not build the
   > fabricated policy without `as BuildableShapes` (`tests/room/is-shape-buildable.test.ts:39-45`) and
   > confined it rather than deciding; slice 4's component test meets the identical wall. **Widening
   > the type to declare `linear?` now was proposed and is refused, on three grounds:**
   >
   > 1. **It would let production state something the validator does not honour.**
   >    `isShapeBuildable` is deliberately shape-agnostic — it reports any key present in
   >    `buildableShapes` (`room-policy.ts`, slice 1) — while `validateRoomInput` still refuses every
   >    non-L input outright (`validate-room.ts:76`). Declaring `linear?` makes it **typechecked** to
   >    populate linear bounds in `APPROVED_ROOM_POLICY`, at which point the card enables and the room
   >    is then refused: two authorities disagreeing about one question, which is the defect
   >    [ADR 0102](../decisions/0102-a-recorded-source-must-explain-its-depth-and-a-second-authority-in-a-test-is-the-defect-laundered.md)
   >    names. **Today that state is unreachable because the type forbids it.** A cast in a test cannot
   >    reach production; a widened type invites a half-change into it.
   > 2. **Only the *numbers* are approved, not the *structure* that holds them.** F1 approved
   >    1200–6300 mm (ADR 0108 Amendment D). It did not say whether a one-wall policy carries a
   >    `minimumKitchen` block — the coupled sink-and-hob rule is a **two-wall** rule (Amendment C) and
   >    plausibly collapses into the 1200 minimum, but that is 7J's analysis and it has not been done.
   >    `ENGINE_ROOM_LIMITS` has **no linear entry** either, and Amendment D requires one
   >    (*"approved values inside the engine's derived linear limits"*). Declaring the type now means
   >    designing 7J's policy record from this chair, which is what ADR 0108 Amendment B decision B2's
   >    *"Nothing here guesses them"* forbids.
   > 3. **The inter-wave contract does not need it.** *"7J is a data-only change"* was the attraction,
   >    and it was never quite true: 7J must also teach `validateRoomInput` to map a linear input onto
   >    a `DesignRoom` (ADR 0108 decision 8). The contract 7F1 actually owes is narrower and survives
   >    intact: **7J changes nothing under `apps/web/src/room`.** That is what criterion 3 proves.
   >
   > **So:** slice 4 repeats the cast behind **one named helper in `apps/web`**, commented as slice 1's
   > is, naming this ruling. Two casts in two packages' tests is the honest price of a type that
   > refuses to describe a shape nobody has designed yet. **7J widens `BuildableShapes`,
   > `ENGINE_ROOM_LIMITS`, `APPROVED_ROOM_POLICY` and `validateRoomInput` together**, and deletes both
   > helpers in the same wave — at which point the cast's absence is the proof the widening was real.
4. **One field per wall of the chosen shape, plus the height.** For each shape the rendered field-name
   set equals `requiredFieldsFor(shape)` — the **same function the URL parser uses**, exported rather
   than copied, so a wall added to a shape there makes the form grow with no edit to the form. This is
   also why U's third field costs nothing and must **not** be a hand-written branch. **[property]** over
   `RoomShape`.
5. **Every length field is a text field with a decimal keypad.** `type="text"`,
   `inputmode="decimal"`, a real `<label for>` bound to the input id, the unit *m* drawn inside the
   field box, and `font-variant-numeric: tabular-nums` on the value. **Must not:** `type="number"` (it
   refuses a comma on several locales, adds spinners, and `valueAsNumber` is a float), a `step`
   attribute, or a `pattern` re-implementing `parse-metres.ts`. **[component]** for the attributes,
   **[visual]** for the tabular alignment.
6. **The corner toggle exists only for L and U.** Present for `L` and `U`; for `linear` the element
   **count is zero** — absent from the tree, not hidden by CSS. **[component]** over the three shapes.
7. **A stored room lands in the fields to the millimetre — 7E2's criterion 5, finally checkable.** For
   a `DesignRoom` sampled across the approved policy's ranges, rendering at
   `roomHrefFromDesignRoom(room)` puts each wall and the height into its own field such that
   `parseMetresToMillimetres(field.value).mm` equals the stored millimetres **exactly**, and the
   direction toggle reads `left`. The editor's own back-link case
   (`?shape=L&wallA=3.56&wallB=2.92&height=2.6&direction=left` → `3,56` / `2,92` / `2,60`) is asserted
   by name beside the property. At least 500 cases. **[property]** + **[component]**
8. **The customer sees a decimal comma and the URL keeps a dot.** For every whole-millimetre length in
   the policy range and every locale in `routing.locales`:
   `parseMetresToMillimetres(formatMetresForDisplay(mm, locale)).mm === mm`, and `metresTextForUrl(mm)`
   contains no comma. **Must not:** a `","` literal or a `.replace(".", ",")` in the formatter.
   **[property]** + **[unit]**
9. **The URL is the room's only store.** After any edit the query holds exactly the canonical keys for
   the chosen shape — `serialiseRoomInput`'s own output — and nothing else; reloading it restores every
   field byte-identically. **Must not:** a `localStorage`, `sessionStorage`, cookie or store write
   anywhere under `apps/web/src/room`; an unknown key surviving into the query. **[component]**
10. **`markedFields` on arrival is not an error paint.** Arriving at `?shape=L` with no lengths renders
    empty fields with **no** `aria-invalid`, no error class, no message and no red — even though the
    parser marks all four fields, because at 1B *marked* means *still to be filled*, not *wrong*. The
    same holds for `direction` when the query omits it. **[component]**
11. **The plan redraws on every keystroke, locally.** One digit typed into *Perete A* changes the
    plan's wall-A geometry in the same tick, with **no navigation call and no server round trip on the
    keystroke itself** — asserted by spying on the navigation mock. The plan is a **pure function** of
    `(wallA, wallB, wallC, height, direction, box)`: identical inputs give a byte-identical drawing.
    **[component]** for the keystroke, **[property]** for the purity.

    > **Restated 2026-09-14 by R9.** This read *"no `router.push`/`router.replace` call"* without
    > qualification, which R9 now makes wrong: it would pin D4's defect in place by forbidding the very
    > mechanism that fixes it. **The claim was always about the keystroke, not about the wave**, and it
    > is now written that way. Its companion is criterion 19.
19. **The URL is written by a debounced `router.replace`, and the live sub-state is the client's**
    (R9). Three things, each separately asserted: **no navigation call fires on a keystroke**; **exactly
    one fires after the settle interval**, carrying `serialiseRoomInput`'s canonical query and
    `{ scroll: false }`; and **after mount the rendered sub-state is derived from the URL the client
    holds** — `useSearchParams()` — so a cached payload restored on browser Back self-corrects instead
    of being believed. **Must not:** `window.history.replaceState` or `pushState` for the draft (D4 —
    the entry does not keep it); a navigation per keystroke (Back becomes character-by-character undo);
    or treating the server's `data-room-substate` as authoritative after the first paint (D5 — page
    segments are reused on back/forward **by design**, `version-15.md:525`). **[component]** for all
    three, and the **e2e mobile gate (7K) owns the traversal**: type, Back, and assert the fields and
    the sub-state, in a production build — **no unit or component test can catch D4 or D5**, which is
    why they reached a verifier rather than a suite.
12. **One isotropic scale for both axes.** For any two walls in the policy range `drawnA / drawnB`
    equals `wallA / wallB` to within half a device pixel; the drawing never leaves the preview box at
    either extreme of the range; and the drawn **wall thickness is a drawing constant that does not
    scale with the room**. **Must not:** an axis-independent normalisation (it would draw a 6,0 × 1,0 m
    room as a square), a wall drawn at a fixed length, or a scale read off the frame's example pixels.
    **Structural dependency: none** — the plan reads the draft's lengths and direction and nothing else:
    no cabinet, no placement, no catalogue, and no depth (ADR 0083 decision 2). **[property]** on the
    pure model, **[visual]** for the drawing.

    > **The anchor is adopted, never re-derived. Added 2026-09-14, before slice 3, and verified in the
    > tree.** The 2D plan uses the project's **existing** wall convention rather than inventing a
    > parallel one, because a 2D plan that disagrees with the 3D room it produces is a defect **no unit
    > test on either side can catch — each is self-consistent**, and only a customer comparing the two
    > would see it.
    >
    > **The convention, quoted from its source.** `DEVELOPMENT-SPEC.md` §2 (`:45-46`): ***Wall A** =
    > back wall, plane **z = 0**, fronts face +Z, `rotation.y = 0`*; ***Wall B** = left wall, plane
    > **x = 0**, fronts face +X, `rotation.y = π/2`*. Implemented in `WALL_TRANSFORMS`, whose own
    > comment adds the part that matters here — *"Both walk 'along' from the corner where they meet
    > (0,0,0)"*: wall A's tangent is +X and wall B's is +Z, from a shared origin.
    >
    > **So, for a top-down drawing with +X to the right and +Z downward:** the corner is the drawing's
    > origin; **wall A runs right along the top** and **wall B runs down the side**. That is the view
    > frame 1B draws, so the frame and the domain already agree and this criterion only writes the
    > agreement down. **Must not:** flip the +Z axis (a top-down view looks *down*, so +Z goes down the
    > screen, not up as a plotted Y axis would), or place the corner anywhere but the drawing's origin.
    >
    > **Two corrections to the citation the earlier 7H plan carries**, both verified today rather than
    > copied: the file is **`packages/configurator-domain/src/room-transforms.ts`** — the **domain**,
    > not `packages/three-adapter`, which matters because 7F1's must-not list fences off the adapter and
    > an implementer chasing the wrong package would find nothing. And the convention is stated at
    > **`:29-49`** (the doc comment plus `WALL_TRANSFORMS`); the earlier plan's `:34-49` names only the
    > constant and omits the sentence that states the rule. **Wave 7H cites this criterion by name
    > instead of re-deriving the anchor**, so the 2D and 3D views cannot drift apart.
    >
    > **The anchor and the scale are separable, and both are now settled.** The anchor is adopted from
    > the domain, as above. **The isotropic-scale clause was ruled by the owner on 2026-09-14** (R4):
    > both walls at the same millimetres-per-pixel, over the alternative of taking frame 1B's two
    > scales literally. There is no pending branch here — the clause above is the shipped rule, and
    > `isotropicScalePxPerMm` is where it lives.
13. **Mirroring reflects the drawing and nothing else.** With `direction: "right"` the plan is the
    reflection of the `"left"` plan about the preview box's vertical centre line. **Must not:** swapping
    `wallA` and `wallB`; changing a field label (*Perete A* stays the horizontal wall); changing any
    serialised value — the query after a toggle is identical apart from `direction`. **[property]** for
    `reflect(plan(left)) === plan(right)`, **[component]** for the query.
14. **Every touch target is at least 44 px.** For each interactive element under `apps/web/src/room`,
    `document.elementFromPoint` at the four corners of its 44 px box returns that element or its own
    descendant — ADR 0104 decision 5's mechanism, because `getBoundingClientRect` would measure the
    painted box. **Must not:** a `min-height: 44px` on a box the frame draws shorter; the expansion is a
    pseudo-element taking no layout space. **[visual]**
15. **No horizontal overflow at 390 px**, at 1A and 1B, in **both** locales — `ru` is the longer one and
    is the case that matters. **Must not:** `overflow-x: auto` or `scroll` anywhere under
    `apps/web/src/room` (ADR 0082 decision 2's refusal, kept). **[visual]**
16. **No `3600`, `2400` or `2600` numeric literal under `apps/web/src/room`**, enforced by ESLint, with
    the enforcement itself tested. **[lint]** + **[unit]** — see the next section.
17. **The page stays a server shell.** `app/[locale]/configurator/room/page.tsx` parses the query and
    renders one client component; it declares no copy key, no field, no style and no `"use client"`.
    **[component]** + review.
18. **`direction` is written for every shape that carries the toggle, and its absence keeps its
    meaning** (ruling R6). Three layers, asserted separately because confusing them is the whole risk:
    arriving at `?shape=L` with no `direction` shows the toggle at **left** and the first sync writes
    `direction=left`; the **parser is unchanged** — an absent `direction` still marks the field and
    resolves to 1B, never silently to left; and a *stored* room's absent direction still means left
    (ADR 0053, 7E2's deferral to 7I). This criterion exists so **7I cannot move any of the three
    unnoticed**. **[component]** for the draft and the sync, **[unit]** for the parser, and the frozen
    `room-url-state.test.ts:304` is itself the guard on the middle layer.

### The no-magic-constant gate, and the trap in it

**A `git grep` gate would be red on arrival.** `3600` is already under `apps/web/src/room`, inside a
comment explaining the parser (`parse-metres.ts:37`, *"so `3,6000` is 3600"*). A text gate would
either fail on landing or need an exclusion that hollows it out. An **AST** rule reads the literal and
ignores the comment, which is the right reading: quoting the frame's example in prose is fine,
building against it is not. `eslint.config.mjs:12` already records this argument for the Romanian gate.

**The trap: flat config *replaces* a rule's options, it does not merge them.**
`eslint.config.mjs:391-407` already sets `no-restricted-syntax` over `apps/web/src/**/*.{ts,tsx}` with
`ROMANIAN_LITERAL_SELECTORS` + `UNKEYED_JSX_TEXT_SELECTORS`, and its own comment (`:394-396`) warns
that a second block naming the same rule over the same files *"would silently disarm the first"*. A new
block scoped to `apps/web/src/room/**` would do exactly that — **on the directory about to gain more
new JSX text than any other in this milestone** — so both existing gates would go dark precisely where
they are most needed, and every test would stay green.

**So the mechanism is three things, and the third is the one that must not be dropped as "extra":**

1. A named `ROOM_EXAMPLE_DIMENSION_SELECTORS` in `eslint.config.mjs`: `Literal[value=3600]`,
   `[value=2400]`, `[value=2600]`, each with a message naming this wave's rule and the reason — *the
   mockup's example is an example*.
2. One new block, `files: ["apps/web/src/room/**/*.{ts,tsx}"]`, placed **after** the existing block and
   declaring the **full** list: `...ROMANIAN_LITERAL_SELECTORS, ...UNKEYED_JSX_TEXT_SELECTORS,
   ...ROOM_EXAMPLE_DIMENSION_SELECTORS`, citing `:391-396` by line.
3. **A gate on the gate**, `apps/web/tests/lint/room-example-dimensions.test.ts`: run ESLint's own
   `lintText` against the repository config at a `filePath` under `apps/web/src/room/` and assert three
   things — `const wallA = 3600;` errors; a bare Romanian string literal **still** errors; unkeyed JSX
   text **still** errors. The last two are what catch a future editor dropping a spread from the room
   block. If running ESLint inside vitest measures slow, the fallback is to export the selector arrays
   and assert the room block's list is a superset — weaker, and only on a measurement.

**Scope, stated honestly:** the rule reads `.ts`/`.tsx` under `apps/web/src/room`. It does not read
`room.module.css`, and it does not read `app/[locale]/configurator/room/page.tsx` — which is why
criterion 17 keeps that file a shell and every component under `src/room`, so the ban covers the whole
surface rather than most of it.

### The copy obligation (ADR 0113)

Every leaf is **frame wording used as written** unless marked *drafted*. `ro.json`, the copy lock, the
golden fixtures and hashes, and the Russian draft move in the **same commit**, whose message names the
added keys and cites ADR 0113 decision 2.

From frame 1A (`:48-99`): `room.title` *"Cameră"*; `room.shapeQuestion` *"Ce formă are camera?"*;
`room.shapeLead` *"Alege conturul pereților pe care va sta bucătăria."*; `room.shapes.linear.name`
*"Liniară"* / `.detail` *"Un singur perete"*; `room.shapes.L.name` *"În formă de L"* / `.detail` *"Doi
pereți, un colț"*; `room.shapes.U.name` *"În formă de U"* / `.detail` *"Trei pereți"*;
`room.dimensionsLater` *"Dimensiunile se cer după ce alegi forma."*; `room.continue` *"Continuă"*.

From frame 1B (`:101-187`): `room.shapes.linear.short` *"Liniară"*, `room.shapes.L.short` *"În L"*,
`room.shapes.U.short` *"În U"*; `room.planCaption` *"Plan de sus · previzualizare"*;
`room.planWallLabel` *"{wall} · {metres} m"* (the frame draws *"A · 3,60 m"*; the wall letter and the
already-formatted metres are ICU arguments); `room.cornerQuestion` *"Încotro merge cotul?"*;
`room.cornerHint` *"nu se deduce din lățimi"*; `room.cornerLeft` *"La stânga"*; `room.cornerRight` *"La
dreapta"*; `room.wallLabel.wallA` *"Perete A"*; `room.wallLabel.wallB` *"Perete B"*;
`room.heightLabel` *"Înălțimea camerei"*; `room.unitMetres` *"m"*; `room.back` *"Înapoi"*.

**Exactly one leaf is drafted rather than quoted:** `room.wallLabel.wallC` — *"Perete C"*. No frame
draws a U's third wall. It follows the pattern the frames establish and that
`configure.cameraPresets.wallA` already uses, and it says nothing the domain has not published
(ADR 0113 decision 5).

**Three leaves are deliberately *not* added, and each absence is a decision:**

- **The step pill** reuses the already-approved `configure.step` / `configure.stepPill` at `step: 1`.
  Duplicating them under `room.*` would pin one approved sentence in the lock twice.
- **The two group labels.** The visible *"Ce formă are camera?"* and *"Încotro merge cotul?"* label
  their radiogroups through `aria-labelledby`. No invented accessible name.
- **The plan's alternative text.** The SVG is `aria-hidden="true"` with its wall labels as real text
  nodes beside it, so a screen reader reads the measurements rather than a drafted description of a
  picture.

**Russian:** `ru.json` gains the same key set, drafted, approved by ADR 0113 decision 3; it is never
pinned by literal (ADR 0095 decision 2, layer 4), so its status is recorded here and in the close-out
with no code consequence. **Golden manifest:** fixtures are added for the new keys and **no existing
hash moves** — a moved existing hash is a defect in this wave, not a re-baseline.

### Files

**New, under `apps/web/src/room/`:** `metres-text.ts`, `room-draft.ts`, `plan-preview-model.ts`,
`room-screen.tsx`, `shape-picker.tsx`, `dimensions-form.tsx`, `plan-preview.tsx`, `room.module.css`.

**Modified:** `app/[locale]/configurator/room/page.tsx`; `src/room/room-url-state.ts` (export
`requiredFieldsFor`, import the moved `metresTextForUrl` — **no behaviour change**);
`configurator-domain/src/room/room-policy.ts` and `src/index.ts`; `eslint.config.mjs`;
`src/messages/ro.json` and `ru.json`; `tests/support/approved-romanian-messages.ts`;
`tests/i18n/golden-output-fixtures.ts` and `golden-output-hashes.ts`.

~~Plus the locale-menu extraction ruled at R5: `src/chrome/locale-menu.tsx` (**moved** from
`app/configurator/configure/locale-menu.tsx`, gaining a `className` prop) and **one import line** in
`app/configurator/configure/configure-screen.tsx`.~~ **Corrected 2026-09-14 (R5): no such file is
created and `configure-screen.tsx` is not touched at all.** The room's top bar imports `LocaleMenu`
from its current path, under a comment naming R5's wave as the import's removal. **This makes the
wave's must-not list strictly stronger than planned, not weaker** — `src/app/configurator/configure/`
becomes read-only to 7F1, alongside the rules already frozen: `configure.module.css` keeps every rule
it has, the component keeps every class it renders, and `tests/i18n/locale-menu.dom.test.ts`,
`locale-menu-scales.dom.test.ts`, `tests/app/configurator/configure/top-bar-box.test.ts`,
`qa-w4-top-bar.adversarial.test.ts` and `qa-0104-the-stacking-table.adversarial.test.ts` all pass
**unedited**. A changed class, a `className` prop on `LocaleMenu`, or an edited top-bar test is a
finding, not a repair.

**This exceeds the wave table's five-file guess**, which listed only the four components and the
stylesheet. The three extra production modules exist so criteria 8, 11, 12 and 13 are provable without
a DOM, and that is why the wave is split into five slices with a mini-review between them rather than
dispatched as one (`docs/WORKFLOW.md:159-173`).

**Must NOT change — a change to any of these is a finding, not a repair:**

- `room/approved-room-policy.ts` — **no bound moves this wave.** A bound edited to make a field or a
  plan behave is exactly the defect ADR 0108 Amendment B decision B1 exists to make visible.
- `room/validate-room.ts` — no new field, no new issue code, no new rule. 7F2, 7J and M7B touch it.
- `room/parse-metres.ts` — settled at 7E1.
- `room/create-design.ts` — 7F3 and 7F4 wire it (7E2 close-out, *Honest limits* 1).
- `src/proxy.ts` — the route is already a customer path (ADR 0111 decision 4, shipped in 7E1).
- Anything under `packages/three-adapter`, `apps/web/src/scene` or `apps/web/src/store`.
- **Four test files must pass with not one line edited**, and this is the guard on the
  `room-url-state.ts` edit: `tests/room/room-url-state.test.ts`, `qa-7e2-room-href.adversarial.test.ts`,
  `parse-metres.test.ts`, `parse-metres.adversarial.test.ts`. **If a change to `room-url-state.ts`
  appears to require touching one of them, that is the signal the change is wrong: stop and report,
  rather than editing the test** (coordinator, 2026-09-14). Ruling R6's correction is what this rule
  already caught once.
- Existing entries in `tests/i18n/golden-output-hashes.ts`.
- `configure.module.css`'s rules — under the *move*, the file keeps every rule it has and only the
  component's location changes.

### Punch list — five slices, dispatched one at a time, in this order

**Slice 1 — the conversions and the shape predicate.** No UI. Production: `room/metres-text.ts` (new);
`room/room-url-state.ts` (two exports, no behaviour change); `room-policy.ts` + `src/index.ts`. Tests:
`tests/room/metres-text.test.ts` with criterion 8's property; a domain test for `isShapeBuildable`
pinning *L only, today*. **Done when** criteria 8 and half of 4 hold and the four frozen test files
pass unedited.

**Slice 2 — the copy, the lint gate, and the gate on the gate.** No UI. Production:
`src/messages/ro.json`, `ru.json`. Config: `eslint.config.mjs`. Tests: the copy lock, the golden
fixtures and hashes, `tests/lint/room-example-dimensions.test.ts`. **Done when** criterion 16 holds,
the lock is green, no existing golden hash moved, and the commit message names the keys and cites
ADR 0113. *Second on purpose:* every later slice reaches for a key, and the lint block must be armed
**before** the room directory grows the JSX it is meant to police.

**Slice 3 — the plan's geometry, as a value.** No DOM. Production: `room/plan-preview-model.ts`,
`room/room-draft.ts`. Tests: properties for isotropic scale, containment, constant wall thickness,
mirroring and purity. **Done when** criteria 12, 13's property arm and 11's purity arm hold.

**Slice 4 — 1A: the top bar, the three cards, *Continuă*.** Production: `room/room-screen.tsx`,
`room/shape-picker.tsx`, `room/room.module.css`, `app/[locale]/configurator/room/page.tsx`. Tests:
`tests/room/room-screen.dom.test.ts`. ~~…and the locale-menu resolution.~~ **Corrected 2026-09-14
(R5): the locale menu is imported where it stands and nothing under
`src/app/configurator/configure/` is touched.** Carries the R8 cast helper for criterion 3's
adversarial arm. **Done when** criteria 1, 2, 3 and 17 hold.

**Slice 5 — 1B: the fields, the corner toggle, the live plan, the URL sync.** Production:
`room/dimensions-form.tsx`, `room/plan-preview.tsx`, `room/room-screen.tsx` (edit), `room.module.css`
(edit). Tests: `tests/room/dimensions-form.dom.test.ts`, `tests/room/room-url-round-trip.dom.test.ts`.
**Done when** criteria 4, 5, 6, 7, 9, 10, 11 and 13's query arm hold.

**Then the visual gate** at 390 × 844 over 1A and 1B in both locales: criteria 14, 15, and the drawing
of 1, 5 and 12. The tree is frozen while it runs.

### Risks

1. **The URL sync re-runs the server component and steals the caret.** A `router.replace` per keystroke
   re-renders the server tree and can drop focus mid-word. ~~The mitigation is
   `window.history.replaceState`~~ — **this risk fired, and not in the way it was written
   (R9, 2026-09-14).** The named mitigation was the defect: `replaceState` kept the caret and lost the
   history entry. **The mitigation is now a debounced `router.replace` on a settle interval**, which
   re-renders a server component that reads no database and no catalogue, and does so after typing
   stops rather than during it — so the caret risk this entry names is addressed by *when* the call is
   made, not by avoiding the router. **The clause that earned its keep is the rest of it:** the
   implementer **verifies against `apps/web/node_modules/next/dist/docs/`** before building on it
   (`apps/web/AGENTS.md`), not against training data. That verification is what R2 performed
   incompletely — it confirmed the hook sync the doc promises and read a history guarantee into it that
   the doc never states — and it is why the wave, not a customer, found this.
   **Criterion 11's navigation spy must be rewritten with the mechanism:** as written it asserts that
   *no* `router.replace` occurs, which would now pin the defect in place. It becomes: no navigation call
   on a keystroke, and exactly one after the settle interval.
2. **An anisotropic plan is an easy accident** — filling both axes of the preview box is what the
   frame's example pixels look like, and it is a lie about the room. Criterion 12's ratio property is
   the guard, and it is written on the model so CSS cannot satisfy it.
3. **The flat-config disarm**, named above. Without the gate on the gate this wave has a promise and
   not a mechanism.
4. **A wallC field nobody can reach.** U is M7B. The third field is covered only by criterion 4's
   property and never by the visual gate — a stated limit of this wave, to be recorded in the close-out
   rather than smoothed over.
5. **`ru` is longer than `ro`**, and a visual gate run in one locale proves half of criterion 15.
6. **Scope creep into 7F2.** A validation reason typed beside a field is 7F2's, and its copy is frame
   1C's. An implementer who "just adds the message" ships 7F2's surface without 7F2's criteria.

### Seven rulings — 2026-09-14, and what each rests on

Every one was raised by the architect as an open question and **ruled by the coordinator on
2026-09-14**, after independently verifying the three load-bearing facts in R1, R3 and R6 against the
tree. They are recorded with their basis so the next reader sees *why* rather than re-litigating.

**R1 — the constant ban is AST-based, re-declares the full selector list, and carries a gate on its
own gate.** *Basis:* `eslint.config.mjs:394-396` already records that flat config **replaces** a
rule's options and that *"a second block naming `no-restricted-syntax` over the same files would
silently disarm the first — that is the shape of gate this milestone produced four of"*; and `3600` is
already under `apps/web/src/room` in a comment (`parse-metres.ts:37`), so a grep gate would be red on
arrival. **The probe test is the part that matters and is not optional**: it is what catches a future
editor dropping a spread from the room block, which no other test in the repository would notice.

**R2 — the URL updates while the customer types, by ~~`history.replaceState`~~**, and *Continuă* pushes
the canonical query. *Basis:* ADR 0111 decision 3, read directly — *"Back restores it, a reload keeps
it, and the sub-state is derived from it: no valid room gives 1A/1B/1C"*. A half-entered room
surviving a reload follows necessarily, and a URL written only on *Continuă* would lose it.

> **R2's *outcome* stands. Its *mechanism* is superseded by R9 below, 2026-09-14, on a production
> measurement.** The requirement — the URL carries the room as it is typed — is unchanged and still
> follows from ADR 0111 decision 3. What failed is `history.replaceState`, which delivered the address
> bar and not the history entry. The reasoning that chose it was sound on the documentation available,
> **and this plan's own risk 1 named it as the one assumption no unit test could pin** — *"the
> implementer verifies this against `apps/web/node_modules/next/dist/docs/` before building on it"*.
> That flag is why a production build was run against it, and why this was found in wave 7F1 rather
> than by a customer. The mechanism is struck, not edited away, because the next reader needs to see
> that the inference was checkable and was checked.

**Two consequences that belong to the next two waves, not to this one.** They are repeated at 7F2's
and 7F3's criteria so neither wave discovers them:

- **1C becomes a live state reached by typing**, not only by arriving at a stale or hostile link. It is
  what the customer sees while a value is out of range, so 7F2's reasons appear and clear as they type.
- **_Continuă_ at 1B has no destination until 7F3 lists presets.** In 7F1 it pushes the canonical query
  — a real effect, and the seam 7F3 takes over. It is never drawn as a control with a control's
  affordances and no behaviour, which `configure.module.css` and ADR 0104 decision 6 both refuse.

**R9 — the URL is written through `router.replace`, debounced; and the live sub-state is the client's,
not the server's. Ruled 2026-09-14, superseding R2's mechanism on a production measurement.**

**What was measured**, by the visual verifier in `next build` + `next start`, with `history.length`
constant across every traversal — so these are true traversals, not fresh pushes:

- **D4 — the replaced URL never entered session history.** While typing, `location.href` holds the full
  room. After Back, `location.href` is the **pushed** URL `?shape=L&direction=left`, and the server
  then correctly renders 1B-empty for that reverted query. The URL itself reverted; this is not a cache
  problem.
- **D5 — a correct URL served a stale render.** After Back in the other traversal `location.href` is
  correct (`?shape=L&wallA=4.2&wallB=3.1&height=2.5&direction=left`) while the page renders
  `data-room-substate="1A"`, `markedFields="shape"`. Stable at 6 s; Back→Forward reproduces.
- **Reload still restores byte-exactly**, so ADR 0111 decision 3's *reload* half holds in production
  and its ***Back*** half does not — and *"Back restores it"* is the clause R2 cited as the reason to
  write the URL while typing at all.

#### What the Next documentation actually promised, checked rather than recalled

`01-app/01-getting-started/04-linking-and-navigating.md:345-347` — R2's basis — says the native
methods *"update the browser's history stack without reloading the page"* and that they *"integrate
into the Next.js Router, **allowing you to sync with `usePathname` and `useSearchParams`**"*.

**That is a promise about client hooks reflecting the new URL, and Next kept it** — the verifier's own
evidence is that `location.href` holds the full room while typing. **It is not a promise that the
entry survives a traversal**, and the `replaceState` section (`:401`) points the other way in its own
words: *"replace the current entry… **The user is not able to navigate back to the previous state**"*,
illustrated by a one-shot locale switch rather than an entry rewritten on every keystroke.

> **So the documentation was not wrong and was not misquoted. R2 read a client-state-sync guarantee as
> a history-persistence guarantee**, and nothing in the page says the second. That inference is the
> defect, and it is the architect's, not the implementer's and not the doc's.

#### D4 and D5 have different causes and take different fixes

They must not be closed as one, and fixing D4 alone would leave D5 latent rather than absent.

**D4 is a write-side defect.** Next's router keeps its own record of each history entry's URL and
restores *that* on traversal. A native `replaceState` updates `location` and the client hooks without
Next's record following it, so on popstate Next's record wins and the typed values are gone. **This is
data loss**: no reader, however careful, can recover a query the entry no longer holds.

**D5 is a read-side consequence of documented behaviour, not a bug.**
`01-app/02-guides/upgrading/version-15.md:525`: *"When navigating between pages via `<Link>` or
`useRouter`, page segments are no longer reused from the Client Cache. **However, they are still
reused during browser backward and forward navigation** and for shared layouts."* The glossary
(`01-app/04-glossary.md:47`) repeats it: *"Pages are not cached by default but are reused during
browser back/forward navigation."* **So a traversal is served from the client cache by design, and
`staleTimes` only opts *into* more caching — there is no switch that turns this off.** Any design in
which the server is the authority for what the customer sees after Back is therefore unsound,
**including one built on `router.replace`**. D5 would have been reachable under the mechanism that
fixes D4.

#### The ruling, in two parts

**1. Write side — `router.replace(url, { scroll: false })`, debounced on a settle interval, replaces
`history.replaceState`.** Going through the router is what makes Next's own record of the entry the
URL we intend, which is exactly what D4 shows the native call does not do.

**The round trip R2 was avoiding is affordable, and the estimate was never made.** The room page is a
server component that parses the query and renders a client component — **no database, no fetch, no
catalogue read** — so the cost is network latency plus a trivial RSC render. Debounced on a settle
interval rather than per keystroke, a customer filling three fields spends a handful of requests once,
while editing Step 1. R2 traded a real guarantee away for a cost it never quantified.

**2. Read side — the client derives the live sub-state from the URL it actually holds; the server's
parse is the first paint's seed, not the running authority.** After mount the screen reads
`useSearchParams()` and re-derives, so a cached payload restored on traversal self-corrects instead of
being believed. **This is already the plan's shape** — criterion 11 requires the plan to redraw from
the draft with no server round trip, so the client is *already* the renderer of the live sub-state.
R2's error was letting `data-room-substate` remain the authority after the first paint. **Caveat for
the implementer:** `use-search-params.md:82` warns that on a *prerendered* route the hook forces
client rendering to the nearest `Suspense` boundary. This route reads `searchParams` on the server and
is dynamic, so the warning does not bite — **verify that rather than assume it**, and if the route ever
becomes prerenderable, the boundary is owed.

**Rejected, with reasons, so they are not revisited:**

- ***Keep `replaceState` and separately make Next's record follow it.*** No public API does this; it
  would mean writing to router internals, which is a worse dependency than the one that just failed.
- ***`pushState` / `router.push` per keystroke.*** Twenty keystrokes become twenty entries, and Back
  turns into character-by-character undo. It also breaks *Continuă*'s push as the one meaningful entry.
- ***Write only on *Continuă*.*** This is the option R2 rejected and the rejection stands: a reload
  mid-entry would lose the room, which ADR 0111 decision 3 forbids. The debounce is the middle position
  R2 should have taken in the first place — it is neither per-keystroke nor commit-only.
- ***Treat D5 as fixed because D4's fix hides it.*** Refused: documented back/forward cache reuse is
  permanent, so a design that depends on a fresh server render after Back is unsound whether or not it
  currently appears to work.

**R3 — all three cards ship, and the refusal stays silent until 7F2.** **Ruled by the owner,
2026-09-14** (F8), having been told plainly that the U card would do nothing when tapped:

> *"…I don't say issue to to draw liking design. There is already design. Use the the design that was
> proposed and implement the the logic. Remains only after these waves to weight the special milestone
> for the u shape."*

*The grounds it confirms:* frame 1A draws three, ADR 0108 Amendment B decision B2 rules that linear and
U stay **refused** and not hidden, and nothing ships mid-milestone (owner rule, 2026-08-27), so a silent
dead end between 7F1 and 7F2 never reaches a customer. **Two requirements follow:** criterion 3
**asserts** the disabled *Continuă* on a refused shape, so the dead end is deliberate and tested rather
than incidental; and **7F2 owes the refusal sentence**, recorded on its own row, naming 7F1 as the wave
that shipped the silent state. 7F1 still must **not** hand-write a U branch — criterion 4 derives the
field set from `requiredFieldsFor`, which already knows U, so the shape costs nothing to carry.

***"Use the design that was proposed"* is also an instruction against improvisation on the visible
surface**, and it binds every 7F-wave implementer: where this plan departs from frame 1A or 1B it says
so by name, and nothing else may depart silently. The departures are listed at R4.

> **The two refused cards are not alike, and the criteria must not treat them as one thing**
> (coordinator, 2026-09-14). ***Liniară* is already owner-approved** at 1200–6300 mm — F1 verbatim,
> *"Yes, 1200–6300 mm"* — and is refused today only because ADR 0108 Amendment D holds those numbers
> out of `APPROVED_ROOM_POLICY` until **wave 7J, inside this milestone**, so that a straight room
> cannot validate before it can be composed. ***U* has never been put to the owner at all** and is
> **M7B**. Criterion 3 is therefore written against `isShapeBuildable` and **never against the letter
> `L`**.
>
> **Since F8 was answered this is the contract between two waves, not a stylistic preference.** All
> three cards are now permanently drawn, so `isShapeBuildable` is the only thing standing between a
> drawn card and a working one: **wave 7J must make the *Liniară* card start continuing by adding the
> approved bounds to `APPROVED_ROOM_POLICY` alone, with no edit under `apps/web/src/room`**, and
> criterion 3's adversarial arm is what proves 7F1 left it able to.

**R4 — one isotropic scale. Proposed by the architect; ruled by the owner, 2026-09-14.** *Basis:* frame
1B draws wall A at 250 px for 3,60 m and wall B at 50 px for 2,40 m — two different scales — so its
pixels are an illustration of one example room, not a declared scaling rule, and ADR 0104 decision 1's
authority runs over chrome while the plan glyph is content. Leaving the frame's example pixels as an
implied contract is what this ruling exists to prevent. Criterion 12 is the enforcement.

**The owner was shown both readings and chose this one.** Both walls are drawn at the same
millimetres-per-pixel, so the plan is a true top-down shape of the room. **What they rejected** was
taking the frame's pixels literally, which would draw a 2,40 m wall at about a fifth of its true
proportion and make a nearly square room look like a corridor. **This closes the last open owner
question on wave 7F1.**

#### Departures from frames 1A and 1B, and the two things that only look like one

The owner's F8 ruling says *"use the design that was proposed"*. **This plan departs from the frames in
exactly one place, and it is listed here so it reaches the close-out rather than passing as though the
frame said it.** Anything else that differs from frame 1A or 1B is a defect in the implementation.

- **The departure: the plan preview's scale** (criterion 12) — **owner-ruled 2026-09-14 (R4), no longer
  open.** The frame draws the two walls at two different scales; this plan draws one isotropic scale,
  so a 6,0 × 1,0 m room is not drawn as a square. **It stays listed here as a departure, because that
  is still what a reviewer comparing the screen against frame 1B will see** — only its standing has
  changed, from awaiting an answer to having one. **The visual verifier still reports it against the
  frame and the close-out still names it:** a ruled departure belongs in the record, not silently
  normalised into looking like what the frame drew. Everything else about the preview card — its box,
  its uppercase caption, its wall labels — follows the frame.

  **Slice 3 kept every multiplication by the scale inside one function**, `isotropicScalePxPerMm`
  (`apps/web/src/room/plan-preview-model.ts:161`), whose doc comment names R4 as the reason. That
  remains accurate and the isolation is worth keeping — but **its purpose has changed**: it was
  isolation against a pending reversal, and it is now isolation for clarity and for criterion 12's
  ratio property, which needs one place to reason about. A later reader should not infer from the
  seam that the scale is still undecided.

**Two things that differ from the frame's markup and are *not* departures**, named so no reviewer
records them as findings and no implementer "fixes" them back:

- **The length fields are real `<input>` elements** (criterion 5), where the frame draws a
  `<span class="num">` inside a styled box. A static mockup cannot draw a text field; the box, its
  height, its inline *m* and its tabular numerals are all the frame's, and the input is the control the
  frame is depicting.
- ***Continuă* is a real `<button>`**, where the frame draws a `<div>`. ADR 0104 decision 6 requires a
  `div` for a control **wired to nothing** — `Verifică designul`'s case. *Continuă* is wired (R2: it
  pushes the canonical query), so the rule does not reach it, and a `div` here would be the opposite
  error: a thing that acts as a control while announcing itself as text.

  > **Amended 2026-09-14 (Q-D45-5, coordinator's ruling): the `<button>` stays, and the reason above
  > is only half of it.** ***Continuă* at 1B does nothing observable, and it is waiting for a
  > destination rather than broken by a navigation mechanism.** `continueToPresets` pushes the same
  > route (`room-screen.tsx:215`), `DimensionsStep` branches on no sub-state at all — 1B, 1C and 1D
  > render the same chips, plan, form and footer, and `state.substate` reaches only `page.tsx`'s
  > `data-` attributes — and the CTA is enabled only once every field parses, at which point the
  > canonical query *is* the URL. **Step 2 is 7F4's**, and the router declines to mint an entry for a
  > push to the URL already showing (`app-router.js:59-61`). **The affordance is still correct**: the
  > element is load-bearing the moment 7F4 lands, and a `div` would have to be undone that same wave.
  > **For the visual verifier: this tap is expected to do nothing, and it must not be filed as a
  > defect.** *(Wave 7F1-D45 changes nothing here — see its departure section for the measurement that
  > the push was already being demoted before R9.)*

**R5 — ~~the locale menu is extracted~~ → the extraction is deferred to its own wave; 7F1 imports it
where it stands. Corrected 2026-09-14 on a measurement, and the correction is the part worth reading.**

~~*Basis:* `configure.module.css:167-171` gives `.locale` `grid-area: locale`, with a desktop override
at `:706` — it is positioned **by the configure screen's grid**, which is a genuine coupling and not a
reuse opportunity. The component moves to `apps/web/src/chrome/locale-menu.tsx` and takes a `className`
for its positioning cell; its stylesheet stays where it is, so the editor carries **zero CSS risk**.~~
*The CSS coupling above is real and still the reason a bare reuse is wrong.* **What was wrong is the
cost**: R5 was ruled at *"one moved file, one import line, zero CSS risk"*, and slice 4's developer
measured **five bindings** in the tree at `b4521dd` — about four times the estimate.

| binding | what it does |
| --- | --- |
| `tests/i18n/locale-menu-scales.dom.test.ts:69` | imports the component by its current path — **and is on this wave's must-not-change list** |
| `tests/app/configurator/configure/top-bar-box.test.ts:517-530` | reads the component's **source text**: asserts it contains `<div className={styles.locale}`, that the screen contains `<LocaleMenu />`, and that the screen does **not** contain `styles.locale}` |
| `qa-w4-top-bar.adversarial.test.ts:126-140` | concatenates both files' source and compares the `className={styles.*}` set **by equality** |
| `qa-0104-the-stacking-table.adversarial.test.ts:255` | reads the file's text and regexes its structure |
| `tests/app/configure-room-navigation.test.ts:39` | mocks the old path |

**The decisive finding, and it is not about the move at all: the `className` prop breaks two of these
with the file left exactly where it is.** `top-bar-box.test.ts` asserts that the locale cell's
positioning lives **in the component** and that the screen does not carry `styles.locale}` — and its
own comment says why: *"The cell left the screen with the owner's 2026-09-10 ruling — the menu is
positioned against it, so the cell and the popover that fills it are one component."* `qa-w4` fails the
same way, because `className={styles.locale}` becoming `className={className}` drops a member from a
set compared by equality.

**So R5 was not a relocation, and calling it one is what made it look cheap.** Those are **ADR 0104
structural guards on the top bar's grid**, derived from an owner ruling — not path constants. Editing
them is overturning an invariant, not renaming a file, and a Light-tier wave that is also building a
screen from scratch is not where that happens.

**What 7F1 does instead.** The room's top bar imports `LocaleMenu` **from where it stands**, a
cross-route import from `src/room` into `src/app/configurator/configure`. It is **commented at the
import as temporary, naming R5's own wave as its removal**, and accepted knowingly. The room's top bar
draws the band rule **per cell**, so `grid-area: locale` is inert outside the configure grid and the
chip needs no repositioning. `configure.module.css` keeps every rule it has; **no locale-menu test is
edited**; `configure-screen.tsx` is not touched at all.

**What R5's own wave must budget for**, so it is not re-estimated cheaply a second time: inverting
`top-bar-box.test.ts`'s and `qa-w4`'s assertions **deliberately**, as the ADR 0104 guards they are,
with the end state named — **the `.locale*` rules lifted into their own module**, which is the chore
this record identified as right from the start and which is what actually severs the coupling. A
`className` prop was always the half-measure; the measurement is what exposed it as one.

**R6 — `direction` is written into the URL for every shape that carries the toggle, and a missing
`direction` keeps its existing meaning.** *Basis:* the control is visible with a default position, so
the URL should say what the customer sees; a silent default is the worse of the two.

> **One correction to the ruling's premise, verified in the tree rather than assumed.** The ruling was
> given as *"the parser must keep accepting a missing `direction` as left"*. The parser does not do
> that today and never has: `room-url-state.ts:90-96` puts `direction` in `markedFields` when it is
> absent, and `tests/room/room-url-state.test.ts:304` asserts exactly that for an L. Nothing relies on
> the other reading either — `roomHrefFromDesignRoom` always **emits** `direction=left` (`:157`), so no
> link it produces omits the key. **Making the parser default to left would change 7E1's shipped
> contract and require editing a frozen test, which the rule below forbids.** So the ruling is recorded
> in the form that is true, in three layers that must not be confused:
>
> - **The stored document:** an absent corner direction means left — ADR 0053's argument, and 7E2's
>   recorded deferral to 7I (`room-url-state.ts:139-143`). **Unchanged.**
> - **The URL parser:** an absent `direction` marks the field and resolves to 1B. **Unchanged**, and
>   criterion 18 pins it so 7I cannot move it unnoticed.
> - **The form's draft:** when the URL omits `direction`, the toggle shows **left** — frame 1B draws
>   *La stânga* pre-selected — and 7F1's first sync writes `direction=left` into the URL. That marked
>   field is **not** painted as an error (criterion 10).

**R7 — the step pill reuses `configure.step` and `configure.stepPill`.** *Basis:* duplicating an
owner-approved sentence into a second lock entry is how two copies drift apart, and this repository
already carries that scar. The cost is a key namespace that no longer matches its screen; a `chrome.*`
rename would touch the editor and is not this wave's.

**Scope is approved as planned rather than as the wave table guessed it:** the three extra production
modules and the five slices stand, because *provable without a DOM* is a sound reason to add a module,
and the table's row has been corrected.

## Verification

> **Added 2026-09-11.** The per-wave criteria above are the verification plan; the bullets below are
> the original summary, kept as written, with two additions: the evaluator's assertion now includes
> *no mark* (ADR 0109 decision 3), and generation's includes the replay check (7D2 criterion 2).

- Evaluator tests: fitting, fitting-with-declared-adjustment, and not-fitting, with the assertion
  that a listed preset always applies successfully.
- Generation tests: every generated design passes full validation, and an item that does not fit is
  absent and labelled rather than overlapping.
- Form tests: Romanian decimal parsing, exact integer conversion, toggle-independent-of-lengths, and
  the plan preview mirroring.
- Real touch interaction through all six states at 390 × 844.

## Wave 7H — dispatchable punch list

**Tier: Full** (§11 row 21 is anchored here, and this wave changes the geometry every screenshot has
ever shown): adversarial QA, then logic **and** clean-code review in parallel. **Visual: Yes** — the
390 × 844 mobile gate **and** the 1440 × 900 desktop pass
(`docs/best-practices/browser-and-visual-qa.md`). **Owner answers needed: none — Q7H-1 was answered
2026-09-14 and Q7H-2 to Q7H-4 are ruled. One question is open and it is the coordinator's: Q7H-5,
before slice 4.** The `lemnaria-3d-reference` skill applies to every slice. **ADRs to check intent
against before starting, and to stop and report on if they disagree:**
[0045](../decisions/0045-the-run-end-panel-follows-the-run-it-closes.md) (the panel follows the
records, never the shell — and its Amendment A, which is why the room reaches `syncSolidBodies` at
all), [0065](../decisions/0065-a-body-past-the-end-of-its-wall-is-marked-not-moved.md) decisions 1 and
5 (a body past the end of its wall is **marked**, and the wall is its own run),
[0074](../decisions/0074-the-scene-rebuilds-whole-at-a-depth-change.md) decisions 1 and 7 (the stage
memo is keyed on the depth **and on nothing else**; the seating runs per generation and the camera
moves only on the first), [0083](../decisions/0083-wall-coverage-is-the-runs-extent-and-the-finished-end-is-part-of-it.md)
decisions 2 and 5 (the room is never a function of depth; one declaration of the panel's numbers),
[0108](../decisions/0108-a-room-is-validated-against-policy-data-and-the-interim-policy-is-the-engines-own-limits.md)
Amendment B (the owner-approved bounds this wave samples inside),
[0051](../decisions/0051-the-dishwasher-niche-wears-a-decor-door.md) (`DeclaredStructuralChange`, and
its amendment's finding that a bad declaration hid a 25 mm move at 71/71 green).

**Goal.** Make the drawn room a function of the room the customer entered, so that a kitchen composed
for a 2,4 × 5,0 m room is not drawn standing in the seeded 4,2 × 3,4 m one, and so that the three
camera presets frame *that* room rather than the seeded one. Backlog 16's fit-to-run framing on
*Perete A* — ruled by the owner 2026-09-05 and unbuilt — lands here, and **backlog 21's remaining
half closes here** (Q7H-1).

**Why it matters more than a shell resize, in the owner's own framing** (2026-09-14, answering
Q7H-1): today's second-screen kitchen is a **mock built on one L-shape wall size**, and the product's
real flow is that a customer enters wall sizes and a kitchen is generated for them. The owner expects
an entered room to match the mock in roughly **1%** of cases. **This is the wave that stops the other
99% being drawn in the wrong room.**

**Not in scope, named so an implementer does not drift:** the mirrored right-hand L (7I, which
depends on this wave); any change to how a body is placed, sized or marked; any new copy; the 2D
plan (7F1's, and already shipped); the preset library and generation (7F3/7F4) — including **making
the seeded kitchen the library's first entry**, which is the other half of the owner's framing and
belongs to the preset waves, not here; linear and U rooms, which are not buildable and therefore
never reach this code.

### Ground truth, measured at `b18b38e` — three corrections to the record

The milestone's 7H criteria block above records three facts. **Two hold; one is incomplete in a way
that decides the whole wave**, so they are restated here with what the tree actually says.

- **Holds.** The room shell is a fixed `RW 4.2 × RD 3.4 × WH 2.6`, declared at
  `packages/three-adapter/src/kitchen-parts.ts:2156-2158` and built from there into the floor and the
  two wall planes (`:2159-2182`); `buildKitchenShell` takes a `Kit` and no room, and its head comment
  says so — *"without consulting the currently loaded design"* (`kitchen-shell.ts:26-32`).
- **Holds.** The three camera presets are constants framed on the seeded room
  (`packages/three-adapter/src/stage.ts:199-203`), reached through `resolveSceneView`
  (`apps/web/src/scene/scene-view.ts:23-33`) and `KitchenStage`'s goal effect
  (`kitchen-stage.tsx:425-433`). Which of the three is standing lives in
  `apps/web/src/scene/camera-preset-store.ts`, a module-scope store deliberately outside the design.
- **Holds.** Backlog 16 is ruled and unbuilt (`docs/backlog/open.md:187-206`). Its measurement is the
  falsification case this wave inherits: at 390 × 844 under *Perete A*, `end_panel_right` projects to
  **x ≈ 514 of a 390 px viewport**.

**The correction, and it is what Q7H-1 below was raised on and answered.** *"The seeded room"* names
two different things in this repository and they have never been equal. **These are the numbers slice
2 changes**, so they are the measurement it starts from rather than a finding to re-derive.

- The **drawn** shell is 4200 × 3400 × 2600, and it is **not anchored at the corner**: the floor and
  both wall planes are offset −0.3 m on each floor axis (`RW / 2 - 0.3`, `RD / 2 - 0.3`), so the floor
  spans x ∈ [−0.30, 3.90] and z ∈ [−0.30, 3.10] and each wall plane overhangs the corner by 300 mm
  into the other. The wall *planes* are at z = 0 and x = 0 as §2 says; the drawn *extents* start
  behind the corner.
- The seeded **document's** room is `3560 × 2920 × 2600`
  (`packages/configurator-domain/src/fixtures/kitchen-l-design.ts:957, 967-972`).
- So today's slack is **640 mm along wall A** (300 behind the corner, 340 past the room's far end) and
  **480 mm along wall B** (300 behind, 180 past). **Only the height already agrees exactly**; neither
  floor axis does, and the two per-axis slacks are unequal and unexplained.
- **That disagreement is a recorded, still-open finding, not a discovery of this pass.**
  `docs/backlog/resolved.md:514-517`, closing entry 21: *"One half of this entry stays open: the
  **shell** renders `RW 4.2 × RD 3.4` and matches neither the reference nor the corrected document …
  correcting the shell moves seeded geometry and needs a `DeclaredStructuralChange` under ADR 0051."*
  **7H is the wave that half lands in, and Q7H-1 closes it.** (One stale number in that entry, for
  the next reader: it says the corrected depth is 2830; the fixture has since moved to 2920. The
  entry was not updated. A second thing that entry gets wrong under this wave's module boundary: no
  `DeclaredStructuralChange` is needed, because the change lands downstream of the builder the M1
  gate diffs — see fact 2 below.)

**Four more facts this wave is built on, each measured rather than carried over.**

1. **The M1 fidelity gate is a unit test and it runs locally.** It is
   `packages/three-adapter/tests/kitchen-parts.parity.test.ts`, in `pnpm test`, diffing the port
   against the vendored unmodified reference library at 1e-6 m with two declaration tables
   (`DeclaredDivergence`, `DeclaredStructuralChange` at `:250`). The image tooling —
   `apps/web/scripts/capture-fidelity.mjs`, `diff-fidelity.mjs` — is internal verification tooling and
   is in **no** gate (`scripts/local-ci.sh:124-132`). *"The fidelity gate passes without a
   re-baseline"* is therefore a claim provable on a laptop.
2. **And that gate does not watch the shell.** It calls `kit.builders["kitchen-l"]()` directly; it
   never calls `buildKitchenShell`. Anything this wave does downstream of the builder is **invisible**
   to it. This is the wave's largest trap and criterion 2 exists because of it.
3. **`design-bounds.ts:11-20` restates the shell's three numbers in the domain** as *"the room shell
   the scene actually builds"*, and `MAX_ROOM_WIDTH_MM` / `_DEPTH_` / `_HEIGHT_` are 1.5× them. The
   owner-approved maxima — 6300 / 5100 / 3900 in `approved-room-policy.ts` — are exactly those three.
   So those constants are load-bearing under owner-approved product data, and the moment the shell
   follows the room their **comment** becomes false while their **values** must not move.
4. **Four numbers live within 60 mm of each other at wall A's right-hand end**, and the backsplash is
   the one with no owner: the base run measures **3500** (backlog 21's corroboration), the run-end
   panel's unsynced seat is **3510** (`kitchen-parts.ts:404`), `backsplash_wall_a` spans **x 0 → 3500**
   (`kitchen-parts.ts:2417-2428` — width 3.5 centred at 1.75, so it starts exactly at the corner), and
   the room is **3560**. Nothing reconciles them and nothing ever has.

### The anchor, the scaling rule, the structural dependencies

**Anchor — adopted from wave 7F1's criterion 12, never re-derived.** The corner (0, 0, 0) where wall
A's plane (z = 0, fronts +Z, `rotation.y = 0`) meets wall B's (x = 0, fronts +X, `rotation.y = π/2`),
both walking "along" from that shared origin. The convention is stated at
`packages/configurator-domain/src/room-transforms.ts:29-49` — the **domain**, not the three-adapter —
and its source is `docs/design/DEVELOPMENT-SPEC.md` §2 (`:45-46`). 7F1 criterion 12 writes the same
agreement down for the 2D plan, with the reason: **a plan that disagrees with the room it produces is
a defect no unit test on either side can catch, because each stays self-consistent**, and only a
customer holding the two views side by side would see it. 7H cites that criterion rather than
restating the derivation, so the two views cannot drift apart. **No body moves.**

**Scaling rule.** Only the shell's **floor**, its **two wall planes** and the **wall-A backsplash**
change extent, and only along the axes the room names: wall A's drawn length follows the room's
`widthMm`, wall B's follows `depthMm`, both planes' height follows `heightMm`, and the floor follows
both floor axes. **Must not:** scale any body, appliance, sink, handle, chamfer, plinth or worktop;
scale a finished group rather than building it to size (M3's Risks name this); apply a uniform scale
to the shell group, which would take the floor's 40 mm slab and the backsplash's 14 mm with it.

**Structural dependencies.**

- **The run-end panel keeps following the records** (ADR 0045). `syncRunEndPanel` derives
  `position.x` from `runEndPanelSeatM(records, room)` and from nothing else; the shell's new extent
  must reach it nowhere. Widening the room for a fixed record set must leave the panel where it was.
- **The backsplash's relation to the base run is measured before it is changed** — the four numbers in
  ground-truth fact 4 above are that measurement, and Q7H-4 is the ruling they feed.
- **The two wall planes and the floor share the corner overhang**, which today is 300 mm and is what
  stops the two planes ending in a visible seam where they meet. It survives as a named constant or
  the corner opens; it is not slack to absorb into a wall length.
- **No depth.** ADR 0083 decision 2: the room is never a function of the cabinet depth. The shell
  reads `DesignRoom` and nothing else — not `Kit.depths`, not `DEFAULT_CABINET_DEPTH_MM`.

### Module boundaries

**`packages/three-adapter` owns the geometry and the framing arithmetic; `apps/web/src/scene` owns
only the wiring.** Concretely:

- **`kitchen-shell.ts` gains the room and becomes the only place the shell's extent is decided.**
  `buildKitchenShell(kit, room)`. It keeps its fixed five-name manifest and its disposal of the other
  27 children unchanged — the reference-ghost guarantee is that manifest, not the number of builds
  (`kitchen-stage.tsx:200-207`), and this wave must not weaken it.
- **`kitchen-parts.ts` is not touched.** `buildKitchen()`'s literals stay, `PARTS` stays, and
  `Builders`' `() => Group` signature stays. Three call sites depend on the zero-argument form — the
  M1 parity sweep, `stage.test.ts`, and the transient probe kit at `kitchen-stage.tsx:82` — and the
  first of those is the gate criterion 3 protects. **An implementer who finds they must edit
  `kitchen-parts.ts` has found a contract problem and reports it rather than editing.**
- **`stage.ts` gains `cameraPresetsForRoom(room)`.** `CAMERA_PRESETS` stays exported and its three
  literals stay unmoved, as the seeded fixed point and as what the new function is proved against —
  but it stops being what the app reads. **Must not:** two live sources for the same fact.
- **`apps/web/src/scene/kitchen-stage.tsx` passes the room down and resizes it in an effect keyed on
  the room — it does not add the room to the stage memo's dependency array.** ADR 0074 decision 1's
  comment at `:193` says the memo is *"keyed on the depth, and on nothing else"*, and that is a
  recorded decision about kit and room sharing a lifetime; a room change owns no GPU resource and must
  not force a whole-stage rebuild. **Must not:** move the shell resize into the memo; re-run
  `seatObjectOnStage`'s camera write on a room change (decision 7 — the customer's orbit is theirs).
- **The domain gains nothing.** 7H adds no rule, no bound and no code. `room-transforms.ts`,
  `approved-room-policy.ts`, `run-end-panel.ts` and `design-bounds.ts`'s three values are read, never
  written.

### Four rulings, and one new question the rulings raised — 2026-09-14

**They were raised as open questions and are now settled.** Q7H-1 is the **owner's**, answered
2026-09-14; Q7H-2 to Q7H-4 are the coordinator's, ruled the same day. The alternatives each was chosen
against are kept, so a later reader sees *why* rather than re-litigating. **ADR 0117 is owed for
Q7H-1 and Q7H-3 together** — they close backlog 21's open half and restate a §11-anchored assertion —
and the coordinator is **deliberately holding it**: the owner's framing below describes a product flow
that may reshape more than this wave, and one accurate record afterwards beats a narrow one now that
needs amending. Until it exists, this section is the record.

**Q7H-1 — RULED (a): the drawn wall is the entered wall.** The shell follows the room. At the seeded
document the drawn shell changes from 4200 × 3400 to 3560 × 2920 and loses its −0.3 m offsets, and
**that is expected and correct, not a regression**.

> **The owner's framing, which reframes the wave rather than just answering it.** The kitchen on the
> second screen today is **a mock built on one specific L-shape wall size**. The real flow is that a
> customer enters wall sizes and a kitchen is **generated for those sizes**; the owner expects an
> entered room to match the mock's dimensions in roughly **1% of cases**. The seeded kitchen's role is
> to become **the first entry in the preset library** — offered when someone happens to enter a
> similar L — not to be the thing the product shows. In the owner's words: *"now it's not so critical
> how much we consider that the mock kitchen on the second screen has."*

**Three consequences, and they are what the criteria below were rewritten around.**

- **Backlog 21's open half closes in this wave**, by the owner's ruling: the shell stops disagreeing
  with the document. `docs/backlog/open.md` / `resolved.md` are updated at close-out, not before.
- ***"Byte-identical at the seeded room, no re-baseline" is withdrawn as a criterion.*** What must
  hold is that the shell is a **correct function of the room at every room in the policy, including
  the seeded triple** — not that one room's pixels are preserved. The seeded triple stays pinned as a
  non-random case (criterion 7), now as the **preset-library case** rather than as a frozen image.
- **The guard against reading (b) shipping silently is withdrawn with it.** (b) is ruled out, so a
  criterion existing only to catch it would be a dead criterion; it is struck rather than left
  standing. See the note under the criteria.

**The alternative it was chosen against**, kept because the argument still explains the shape of
criterion 8's replacement: **(b) the drawn wall is the entered wall plus per-axis margins**,
calibrated so the seeded room reproduced 4,20 and 3,40 exactly. It would have frozen two arbitrary,
unequal constants (340 mm past wall A, 180 mm past wall B) into a formula forever, left backlog 21
open with its contradiction now load-bearing, and **contradicted ADR 0065**: a body marked *past the
end of its wall* would have been drawn standing on wall with wall visibly left over past it.

**Q7H-2 — RULED: the corner overhang stays fixed at 300 mm and named.** It is a construction detail —
what stops the two wall planes ending in a visible seam where they meet — not a room dimension.
Refused: a **proportional** overhang, which stops being a construction detail and becomes a lie about
the room; and **butting the two planes**, which creates the seam the reference deliberately avoids
(the `lemnaria-3d-reference` skill's *avoid coplanar or intersecting solid faces*).

> **What it looks like at the policy minimum, written down so nobody rediscovers it as a bug.** At
> wall A = 900 mm the drawn plane is 900 + 300 = 1200 mm long and a third of it sits behind the
> corner; at wall B = 1000 mm it is 1300 mm. The corner of a minimum room therefore looks
> proportionally heavier than the corner of a 6300 mm one. **This is the accepted appearance of the
> ruling, not a defect**, and the 900 × 1000 mm room is an explicit case in the visual pass so it is
> seen once, deliberately, rather than reported later.

**Q7H-3 — RULED: the presets frame the kitchen, not the ceiling, and *Perete A* frames the room's
wall-A extent.** Two independent problems sat under one criterion, and the second was a genuine
contradiction in the stated contract. Both recommendations below are the ruling; the marked-body limit
is recorded rather than hidden. **The first half restates a §11-anchored assertion, which is why it
goes into ADR 0117 and not only here.**

- **The framing problem.** `stage.test.ts` asserts two properties that pull apart as the room grows:
  *every preset frames floor to ceiling* (hardcoding `2.6` as the ceiling) and *the 2.20–2.60 row
  projects ≥ 44 px at 390 × 789*. At the owner-approved ceiling maximum of **3900 mm**, a camera
  pulled back far enough to hold floor-to-ceiling shrinks that row by roughly a third against today.
  §11 row 21 is the one that must not break. **Recommendation:** the presets frame the **kitchen**,
  not the ceiling — floor to the top of the tallest body, with headroom — and the *floor to ceiling*
  assertion is restated as *floor to the top of the tallest body, with the ceiling permitted above the
  frame*. **That restates an assertion §11 anchors, so it is a ruling, not an implementer's judgement.**
- **The fit-to-run problem, and it is why backlog 16 and "a function of the room" fight.** A run's end
  is `runEndPanelSeatM(records, room)` — a function of the **records**. A preset that is a function of
  the room alone therefore cannot fit the run. Making it a function of `(room, records)` would move
  the camera every time the customer deletes the last cabinet, which nobody asked for and which ADR
  0074 decision 7 argues against for the same reason it holds the orbit. **Recommendation:** *Perete
  A* frames the **room's** wall-A extent; the run end is then on screen **whenever the run is
  contained by its wall**, which satisfies the owner's 2026-09-05 ruling for every generated kitchen
  and for the seeded one (run 3500 inside room 3560). **The limit is named rather than hidden:** a
  body ADR 0065 has *marked* may still frame outside the preset — and the mark, not the camera, is
  what reports it.

**Q7H-4 — RULED, and now unconditional: the backsplash follows the room's wall A, with its start
pinned at x = 0.** The recommendation was conditional on Q7H-1 being answered (a); (a) is the ruling,
so the condition is discharged. Under (a) the room and the run agree to within 60 mm at the seeded
kitchen and by construction for a generated one, which is what makes the room a sound referent for a
child whose meaning is *"behind the worktop"*. **Refused:** making it follow the **records** as ADR
0045's panel does — records do not reach the shell build and plumbing them there is a larger change
than this wave's scaling rule — and leaving it a literal, which only made sense under reading (b),
where it would have been drawn 640 mm past the end of the run it exists to sit behind.

**Q7H-5 — RULED: the fixed point is withdrawn.** Raised by Q7H-1's ruling, confirmed by the
coordinator 2026-09-14, and **slice 4 is ungated**. The recommendation below is the ruling, and
criterion 9 already stands in that form.
The wave's stated contract also asks that camera presets *"become a function of the room that returns
`CAMERA_PRESETS` exactly at the seeded room"*. **That fixed point is the same species of claim Q7H-1
just withdrew for the shell, and it does not survive Q7H-1 and Q7H-3 together.** `CAMERA_PRESETS`'
three literals were framed on the **old** 4200 × 3400 shell, under a framing rule Q7H-3 has now
replaced: the seeded shell is 3560 × 2920 and the presets frame the kitchen rather than the ceiling,
so a function that is *correct* at the seeded room will almost certainly **not** reproduce those three
triples. Demanding both would force the implementer to choose between a correct framing rule and three
stale numbers, and the cheap way out is the special case criterion 9 forbids.

- **Recommendation: withdraw the fixed point, on Q7H-1's own reasoning** — what must hold is that the
  presets are correct at **every** room in the policy, including the seeded triple, not that one
  room's three camera vectors are preserved. Correctness is already stated and testable: criteria 10,
  11 and 12. `CAMERA_PRESETS` stays exported and unmoved as the recorded starting point and as the
  witness that the framing did not regress to today's (criterion 12's 514-of-390 case).
- **This was the coordinator's to confirm, not the owner's**: the owner ruled on what the customer
  sees, and this is a criterion's wording. It was flagged rather than silently applied because it
  changes the wave's stated contract. **The coordinator's own note on confirming it is the reason
  this is recorded rather than quietly fixed:** keeping the fixed point *"would have handed someone a
  criterion that rewards the defect it names"* — the `if (isSeeded(room)) return CAMERA_PRESETS`
  special case that criterion 9's continuity half exists to forbid.

### Acceptance criteria

Each is tagged with its proof mechanism: **[unit]**, **[property]** (`fast-check`, already a
dependency), **[parity]** (the M1 gate), **[capture]** (Playwright — **CI is the verdict**),
**[visual]**, **[review]**.

1. **The shell's extent is a function of `DesignRoom` and of nothing else.** `buildKitchenShell` takes
   the room; the floor's two footprint axes, both wall planes' lengths and both planes' height are
   derived from `widthMm`, `depthMm` and `heightMm`. **Must not:** read placements, records, the
   catalogue, any cabinet depth, `MAX_ROOM_*`, or the mounted scene; change `Builders`' signature;
   leave a second path that still builds a fixed shell. **[unit]** + **[review]**
2. **The five shell children are pinned by a characterisation test, written before anything moves —
   as a measurement to reason from, not as an image to preserve.** Name, position, rotation, scale,
   geometry parameters and material name of `floor`, `wall_back`, `wall_left`, `end_panel_right` and
   `backsplash_wall_a`, at 1e-6 m, against the values `HEAD` produces. **This test is the only thing
   in the repository that watches the shell** — the M1 gate never calls `buildKitchenShell`
   (ground-truth fact 2) — so without it slices 2 and 3 could move the shell in ways no one intended
   and no gate would notice. **It is re-baselined in the commit that lands slice 2**, deliberately,
   with the five children's before-and-after values in the commit message: Q7H-1 rules that the seeded
   shell *changes*, so a test asserting it does not would be the wrong assertion. Landing it **first**,
   red against a deliberately mutated shell, is part of the criterion. **[unit]**
3. **The M1 fidelity gate passes with no new entry in either declaration table.**
   `kitchen-parts.parity.test.ts`'s `DeclaredDivergence` and `DeclaredStructuralChange` arrays are
   byte-identical to `HEAD`'s. **A required new entry is a defect signal, not a step:** it means the
   change reached inside `kitchen-parts.ts`, which the module boundary forbids. ADR 0051's amendment
   records QA proving a bad declaration hid a 25 mm move at 71/71 green — so the table is not where a
   red gate gets fixed. **[parity]**
4. **No body moves, at the seeded room and at every sampled room.** For every object carrying
   `userData.placementId`, the world transform equals what `derivePlacementRecords` +
   `syncSolidBodies` give with the shell absent entirely. **Must not:** any translation, rotation or
   scale of a body, appliance, sink, handle or chamfer attributable to the shell. **[property]**
5. **The anchor is 7F1's criterion 12, adopted and not re-derived.** Wall A's plane stays z = 0 with
   fronts +Z; wall B's stays x = 0 with fronts +X; both grow along from (0, 0, 0). The implementation
   cites `packages/configurator-domain/src/room-transforms.ts:29-49` and **7F1 criterion 12 by name**.
   **Must not:** a second copy of the convention inside `packages/three-adapter`; a flipped or
   swapped axis; a wall whose drawn extent grows in the negative direction past the overhang.
   **[unit]** + **[review]**
6. **The corner overhang is one named constant and is the only literal left in the shell's extents.**
   No other bare number survives in the derivation; the constant carries its unit and its reason (it
   is what stops the two planes opening a seam where they meet). **[unit]** + **[review]**
7. **Containment, over the owner-approved policy box.** For every sampled room, every placement's
   along-wall extent lies inside its wall's drawn plane and every body's top is at or under the drawn
   wall height. Sampled by `fast-check` over wall A 900–6300, wall B 1000–5100, height 2200–3900
   (`approved-room-policy.ts`), **with the eight box corners and the seeded triple
   `3560 × 2920 × 2600` as explicit non-random cases** — a property that only ever sees random rooms
   will almost never generate the seeded triple, and that one is the **preset-library case** (Q7H-1's
   ruling: the seeded kitchen becomes the library's first entry). **[property]** + **[unit]**
8. ~~**A marked body is drawn past the end of its drawn wall.**~~ **Struck 2026-09-14 by Q7H-1's
   ruling, and struck rather than deleted so the reason survives.** This criterion existed to stop
   reading (b) shipping silently — under (b) a body ADR 0065 had *marked* would have been drawn with
   wall left over past it. **(a) is ruled, so the failure it guarded against is unreachable**: the
   drawn wall *is* the entered wall, so a placement past the end of its wall is past the end of the
   plane by construction. **Its substance is not lost** — criterion 7's containment property is the
   same fact stated positively, and `OVERFLOWING_KITCHEN_L_DESIGN` stays in that property's explicit
   cases so the marked kitchen is still exercised. A dead criterion left standing would have been
   re-implemented by someone who did not read this note.
9. **Camera presets become a function of the room, and the function is not a lookup around a special
   case.** `cameraPresetsForRoom(room)` returns all three presets for any room in the policy, and
   **the function is continuous**: two rooms one millimetre apart on any axis return presets within a
   stated epsilon of each other. **The continuity half is not optional** — without it
   `if (isSeeded(room)) return CAMERA_PRESETS` satisfies a fixed-point criterion and the whole thing
   is a tautology. **The presets are judged by criteria 10, 11 and 12 at every sampled room, not by
   matching three literals at one of them** — see **Q7H-5** below, which withdraws the fixed point.
   `CAMERA_PRESETS` is retained, exported and unmoved as the recorded starting point and as a
   regression witness, and stops being what the app reads. **Must not:** two live sources for the same
   fact; a change to the `overview | wallA | wallB` union. **[unit]** + **[property]**
10. **§11 row 21, by projection, for every sampled room.** For all three presets, the 2.20–2.60 m band
    of every wall cabinet projects at least 44 px at **390 × 789** — the existing measurement in
    `packages/three-adapter/tests/stage.test.ts`, extended from the seeded room to sampled ones.
    **Must not:** change that file's 390 × 789 to 844. They are different quantities — 789 is the
    canvas under the chrome and 844 is the viewport — and reconciling them by editing one is how the
    evidence gets lost. The recorded 37 px failure at 540 px stays as a falsification case.
    **[property]**
11. **§11 row 21, by capture, at 390 × 844.** A Playwright spec in the `mobile` project loads a design
    at a sampled room, switches to each preset, waits on the scene's own settle signal, and reads the
    projected band height back out of the running scene. **Must not:** measure from screenshot pixels;
    **must not** compute the expectation with the same production function it is testing (WORKFLOW's
    *both sides fed by the same source*); **must not** wait on a timeout instead of `onSettled` —
    `CAMERA_EASE_SECONDS` is 0.7 s and the runner is slower than a laptop. **[capture]**
12. **Backlog 16 — *Perete A* puts the run end on screen at 390 × 844.** `end_panel_right`'s projected
    x lies inside the viewport with a stated margin, for the seeded room and for every sampled room in
    which the panel is visible. The recorded failure — **x ≈ 514 of 390** — is kept as the
    falsification case, so a preset that regresses to today's framing turns this red. The named limit
    from Q7H-3 is asserted rather than assumed: a body ADR 0065 has marked may frame outside, and a
    case pins that this is the only circumstance in which it does. **[capture]** + **[property]**
13. **The run-end panel still follows the records, not the shell.** `syncRunEndPanel` writes
    `position.x` from `runEndPanelSeatM` alone. Proved by mutation: for a fixed record set, widening
    the room across the policy's whole range moves the panel **not at all**. **Must not:** derive the
    seat, the veto or either slab constant in the adapter — ADR 0083 decision 5's single declaration.
    **[unit]** + **[property]**
14. **The backsplash's relation is declared, measured and pinned.** Whichever way Q7H-4 is ruled, the
    wave records the four measured numbers (3500 run / 3510 panel seat / 3500 backsplash / 3560 room)
    and a test pins the chosen relation with the two rejected ones named in the test's own comment, so
    the next reader does not "make them consistent" and undo the ruling. **Must not:** a backsplash
    whose start leaves x = 0. **[unit]**
15. **Owner-approved data is unmoved.** `design-bounds.ts`'s `SCENE_SHELL_WIDTH_MM`,
    `SCENE_SHELL_DEPTH_MM` and `SCENE_SHELL_HEIGHT_MM` keep their values — the owner-approved maxima
    6300 / 5100 / 3900 rest on them — and `APPROVED_ROOM_POLICY`'s six bounds keep theirs. **Only the
    comment changes**, to say these are the *seeded* shell rather than *"the room shell the scene
    actually builds"*, which this wave makes false. **Must not:** derive the shell from `MAX_ROOM_*`
    (circular: the maxima are derived from the shell). **[unit]** + **[review]**
16. **The shell reads no depth.** ADR 0083 decision 2, asserted rather than reviewed for: building the
    shell at 600 mm and at 700 mm cabinet depth for the same room yields identical shell children.
    **[unit]**

### Files, and the must-not-change set

**Production, expected:** `packages/three-adapter/src/kitchen-shell.ts`,
`packages/three-adapter/src/stage.ts`, `packages/three-adapter/src/index.ts` (exports only),
`apps/web/src/scene/kitchen-stage.tsx`, `apps/web/src/scene/scene-view.ts`, and
`apps/web/src/scene/kitchen-canvas.tsx` **only if** the room has to reach `resolveSceneView` through
it. Documentation: `packages/configurator-domain/src/design-bounds.ts`'s comment for criterion 15 —
a comment edit, no value.

**Tests, expected:** `packages/three-adapter/tests/kitchen-shell.*.test.ts`,
`packages/three-adapter/tests/stage.test.ts`, a new adversarial file under the wave's own name, and
one new Playwright spec under `apps/web/tests/e2e/`.

**Must not change:**

- `packages/three-adapter/src/kitchen-parts.ts` — in any way. See *Module boundaries*.
- `packages/three-adapter/tests/kitchen-parts.parity.test.ts`'s two declaration tables — criterion 3.
- `packages/configurator-domain/**` production values: `room-transforms.ts`,
  `approved-room-policy.ts`, `run-end-panel.ts`, and `design-bounds.ts`'s three shell constants.
- `apps/web/src/room/**` — 7F1's and 7F2's, and fenced off by 7F1's own must-not list.
- `apps/web/src/store/**` — the camera is not design state, and `camera-preset-store.ts:27-31` is the
  argument for why. A room-driven preset does not make the camera part of the design.
- `apps/web/src/messages/ro.json` and `ru.json` — 7H ships no copy, so neither the copy lock nor the
  golden manifest moves. A moved hash in this wave is a defect.
- `apps/web/src/room/room-url-state.ts:139-143` — 7E2's recorded deferral to **7I**, not to 7H.

### Slices, in dependency order — dispatched one at a time

**Slice 1 — measure, before anything moves.** No production change. The characterisation test of the
five shell children and of the three presets at the seeded room, plus the four backsplash numbers
recorded in its comment. **Done when** criterion 2 holds and the test is demonstrated red against a
deliberately mutated shell. **Its job is to make slice 2's change visible and deliberate, not to
protect the seeded picture** — Q7H-1 rules that picture is free to change.

**Slice 2 — the shell follows the room, in the adapter.** `kitchen-shell.ts`, `index.ts`. **Done
when** criteria 1, 2, 4, 5, 6, 7, 13, 14 and 16 hold. **Unblocked** — Q7H-1, Q7H-2 and Q7H-4 are all
ruled. Its commit re-baselines slice 1's characterisation test with the before-and-after values in the
message, and names backlog 21's open half as closed.

**Slice 3 — the web side mounts it.** `kitchen-stage.tsx`, and `scene-view.ts` only if needed. **Done
when** criterion 1's wiring and criterion 4 hold at the mounted scene, and the stage memo's dependency
array is unchanged.

**Slice 4 — presets become a function of the room.** `stage.ts`, `scene-view.ts`,
`kitchen-canvas.tsx`. **Done when** criteria 9, 10 and 15 hold. **Ungated** — Q7H-3 and Q7H-5 are both
ruled.

**Slice 5 — backlog 16's fit-to-run framing on *Perete A*.** **Done when** criterion 12's property arm
holds. Kept separate from slice 4 so a framing regression is attributable to one of the two.

**Slice 6 — the captures.** `apps/web/tests/e2e/`. **Done when** criteria 11 and 12's capture arms are
written and green **on CI**.

**Close-out owes three records beyond the usual**: backlog 21's remaining half marked closed with the
owner's 2026-09-14 ruling as its authority; a pointer to **ADR 0117** once the coordinator writes it;
and **one line naming a recurring shape rather than three coincidences** (coordinator, 2026-09-14).
This wave's planning turned up the same failure mode three times — **a criterion or an assertion that
can be satisfied by editing a number instead of the rule**: risk 6's stage memo, risk 5's stale
picture, and risk 7's hardcoded `2.6` ceiling in `stage.test.ts`, which an implementer can make green
by changing the literal while the framing rule stays wrong. It is the same species as editing a frozen
test to make a change compile, and the close-out says so once rather than three times.

**Then the visual gate**, tree frozen: 390 × 844 and 1440 × 900, at the seeded room, at the 900 × 1000
mm minimum corner room (Q7H-2's case) and at a large room — corner seam, wall-to-floor seam, front
direction, no z-fighting at the backsplash, and the run end in shot under *Perete A*.

### What is provable locally, what needs CI, and what a re-baseline would mean

**Provable locally, and completely:** criteria 1–7, 9, 10 and 13–16. Every one is `pnpm test`. **This
includes the M1 fidelity gate** — it is a vitest unit test, not a captured image (ground-truth fact 1),
so *"the parity gate declares nothing new"* is settled on a laptop before anything is pushed.

**CI is the only verdict:** criteria 11 and 12's **capture** arms. A green local Playwright run proves
nothing about a runner-only failure here, and this wave has three runner-specific hazards that a
laptop does not reproduce: the runner's software WebGL rasteriser, its device pixel ratio against
`MAX_DEVICE_PIXEL_RATIO`, and the camera ease — a 0.7 s lerp that a slow runner may not have settled
when a laptop has. **A capture that waits on a timeout will be green locally and flaky on CI**, which
is exactly the failure mode `docs/STATUS.md` records for 7E2's unexplained `LOCAL CI FAILED: e2e`.

**Judged by a person, not a gate:** the visual pass. Seams, front direction and z-fighting at the
corner and at the backsplash are what a capture assertion cannot see.

**Two re-baselines are in play, they are not the same event, and reporting them as one would be
false.**

- **The M1 parity gate must not be re-baselined.** Criterion 3 asks for *no new entry* in either
  declaration table. If an implementer finds one is needed, that is **a defect signal and a
  stop-and-report, not a step**: it can only happen if the change reached inside `kitchen-parts.ts`'s
  builder, which *Module boundaries* forbids and which the whole shape of this wave is designed to
  avoid. Turning a red parity gate green by declaring the divergence is the precise failure ADR 0051's
  amendment recorded — QA proved a bad declaration hid a 25 mm move while 71 of 71 tests stayed green.
- **Criterion 2's characterisation test *is* re-baselined, deliberately, in slice 2's commit.**
  Q7H-1 rules that the seeded shell changes — 4200 × 3400 → 3560 × 2920, and the −0.3 m offsets go —
  so a test asserting it does not would be asserting the wrong thing. The commit carries the five
  children's before-and-after values in its message and names **backlog 21's open half as closed**.
  That is a declared change to a test this wave wrote in the slice before; it is not a fidelity-gate
  re-baseline, and **the wave's original *"no re-baseline at the seeded room"* criterion is withdrawn
  by the owner's ruling rather than met**.

### Risks

1. **The M1 gate does not watch the shell, and everyone will assume it does.** It never calls
   `buildKitchenShell`. An implementer who leans on *"parity is green"* has no evidence about the five
   children at all. Criterion 2's characterisation test, landed in slice 1, is the whole mitigation.
2. **Criterion 9 is a tautology without its continuity half.** A fixed point at one room is satisfied
   by a special case that does nothing for any other room, and it would pass QA. The 1 mm
   perturbation is what makes it a real claim. Q7H-5 removes the fixed point; **the continuity half
   stays either way**, because it is the part that has teeth.
3. **The property sweep misses the preset-library room.** `fast-check` over a 5400 × 4100 × 1700 mm
   box will almost never generate `3560 × 2920 × 2600`. Criterion 7's explicit corners and seeded
   triple exist for that reason, and a sweep without them is a green gate measuring the wrong thing —
   the failure this repository has recorded four times.
4. ~~**Reading (b) of Q7H-1 can be implemented without anyone noticing it was a choice.**~~ **Closed
   2026-09-14 by the owner's ruling (a)**, together with criterion 8. Left struck rather than deleted
   because it was the argument that decided Q7H-1.
5. **The seeded picture changes, and three kinds of reader will call that a regression.** Every
   screenshot in this repository, every reviewer's memory, and any stale visual baseline all show the
   4200 × 3400 room. **Carried into four briefs, in these words** (coordinator, 2026-09-14): *the
   seeded room's drawn picture **changes by design in this wave**, on the owner's ruling, and a
   difference from any earlier capture is expected rather than a finding.* It goes in the **dispatch
   brief**, the **commit message**, the **QA brief** and the **visual verifier's brief** — the last
   because that agent is the one most likely to open a screenshot from an earlier wave and conclude
   the shell broke. Without it the wave spends a round proving it did what it was told.
6. **The stage memo.** Adding `designRoom` to `[cabinetDepthMm]` is the obvious fix and it overturns
   ADR 0074 decision 1's written intent, rebuilds a whole kit and room on a room change, and routes
   through `hasSeatedAStage`'s camera-hold branch. The resize belongs in its own effect.
7. **Tall rooms versus §11 row 21.** At the 3900 mm ceiling maximum the two existing `stage.test.ts`
   properties pull against each other. Q7H-3 rules that the presets frame the kitchen rather than the
   ceiling, which resolves it — **but the assertion in that file still hardcodes `2.6`** and an
   implementer who edits the number rather than the rule has not made the change.
8. **7H depends on 7F1 having landed**, because criterion 5 cites 7F1's criterion 12 as its anchor. It
   is not dispatchable while 7F1 is in flight, and its file set is exactly what 7F1's must-not list
   fences off — so the two never collide, and never overlap in time either.

### 7H addendum — re-measured at `bf6901b`, 2026-09-15: what still holds, three facts the plan does not have, two questions

**The punch list above stands and is not re-planned.** It was written at `b18b38e`; eleven commits
have landed since, and **none of them touched the code this wave changes** —
`git log b18b38e..HEAD -- packages/three-adapter/src apps/web/src/scene packages/configurator-domain/src`
is empty. Every citation was re-checked rather than carried over: `kitchen-parts.ts:2156-2158` still
declares `RW = 4.2, RD = 3.4, WH = 2.6` and builds the floor and both planes from them at the
−0.3 m offsets; `stage.ts:199` still exports the three preset literals; `kitchen-shell.ts:32-33`
still takes a `Kit` and no room and still gets its five children from
`kit.builders["kitchen-l"]()`; `design-bounds.ts:11-20` still restates the shell's three numbers as
*"the room shell the scene actually builds"* and derives `MAX_ROOM_*` from them at 1.5×;
`approved-room-policy.ts:15-34` still gives 900–6300 / 1000–5100 / 2200–3900; `stage.test.ts:23`
still hardcodes `CEILING_ROW_TOP_M = 2.6` and `:136` the bare literal `2.6`.
**Criteria 1–16 and slices 1–6 are dispatchable as written.** Nothing below overturns any of them;
it adds.

> **Two facts below are load-bearing on how slice 2 is implemented. They are not context, and an
> implementer who reads the criteria and skips the prose will build the wrong thing.** They are
> **fact A** — the shell's four geometries sit outside the kit's ownership story, which decides
> *rebuild* over *scale* and leaves a replaced geometry nobody's to free — and **fact B** — the floor
> and the backsplash are tiled at a fixed repeat **count**, so plank and tile size become a function
> of the customer's wall length the moment the shell follows the room. **Both go into slice 2's
> dispatch brief verbatim**, and fact B carries an open question, **Q7H-6**.

#### The five rulings, re-checked against HEAD rather than inherited

Q7H-1 to Q7H-5 were ruled at `b18b38e`. **7F4a landed after them and changed the world they were
ruled in:** `generateKitchen` now has a production caller, so the 99% case Q7H-1 was answered on is
reachable by a customer rather than predicted. Each was re-read against that rather than carried
forward. **All five hold**, and here is what each rests on now:

- **Q7H-1 — the drawn wall is the entered wall. Holds, and 7F4a strengthens it.** When the ruling was
  made, the mismatch between the entered room and the drawn shell was a *future* customer's problem;
  since `bf6901b` a tap on *Continuă* composes a kitchen for the entered room, so the 99% case is
  live in the tree and only 7H's absence keeps it off the screen. Nothing weakens the ruling and its
  urgency went up.
- **Q7H-2 — the corner overhang stays 300 mm, fixed and named. Holds, untouched.** No commit since
  `b18b38e` goes near the corner, and the ruling is about a construction detail of the two planes,
  which nothing outside this wave can move.
- **Q7H-3 — the presets frame the kitchen, and *Perete A* frames the room's wall-A extent. Holds, and
  its second half has stopped being precautionary.** It was ruled to stop the camera being a function
  of the records; with generation live, the run's extent now genuinely varies per room, so a
  records-driven preset would move the camera for real rather than in principle.
  **One consequence to state before an implementer meets it as a puzzle:** D8 excludes the 2200–2600
  top row from composition, so a **generated** kitchen has no ceiling-row body at all. Criterion 10
  measures the seeded scene's ceiling-row boxes while varying the room and the presets — that is the
  intended reading, and `stage.test.ts:71-73`'s existing *"finds ceiling-row bodies, so the sweep is
  not vacuous"* guard is what stops it being satisfied by an empty set. **Must not:** re-point
  criterion 10 at a generated kitchen, which would make §11 row 21's property vacuously green.
- **Q7H-4 — the backsplash follows the room's wall A, pinned at x = 0. Holds, and one premise of it is
  now testable.** The ruling rests on the room and the run agreeing closely — measured at the seeded
  kitchen, asserted *"by construction"* for a generated one. That second half can now be exercised
  rather than assumed. **It does not depend on the answer:** the backsplash follows the **room**, so
  7D3's and 7D4's still-unlanded changes to how a run is composed cannot invalidate it.
- **Q7H-5 — the fixed point is withdrawn. Holds trivially.** It is a claim about a criterion's
  wording, and no commit can move it.

**Ordering, restated plainly because it is the one thing two waves share.** **7D7's fidelity
baseline is taken *after* 7H lands, never before, and the two are never in flight together.** 7D7
parameterises the corner builders *inside* `kitchen-parts.ts` — the file the M1 gate diffs and the
file this wave must not touch — so a baseline taken before 7H would be re-taken, and a baseline
taken during it would be taken against a moving shell. The chain is 7D6 → 7D7, both before 7P2.

**The mockups do not settle the camera, and neither does the spec.** Checked rather than assumed:
both mockup files draw the scene area as a live canvas with no framing to read off (the only 3D
artwork in them is the *"Browserul acesta nu poate afișa 3D"* refusal illustration), and
`DEVELOPMENT-SPEC.md` §6.4 gives one sentence — *"all must frame floor to ceiling"* — plus the three
literal vectors for the **seeded** room. **Q7H-3 is therefore the only framing rule in force**, and
it is a ruling rather than a reading. No further owner answer is owed on it.

#### One correction to the module boundary's arithmetic

*Module boundaries* says three call sites depend on the zero-argument `builders["kitchen-l"]()` form.
**There are now four.** 7F4a (`bf6901b`) added `apps/web/src/room/use-generation.ts:178`, the
transient lease that borrows a kit to run one `generateKitchen`. **The boundary is unaffected** —
`kitchen-parts.ts` is untouched either way and `Builders`' `() => Group` signature does not move —
but an implementer auditing the three named sites will find a fourth and must not read it as a
discovery. It is also a second reason `apps/web/src/room/**` stays on the must-not list: 7F4b is in
flight there.

#### Fact A — the shell's five geometries are unowned and uncached, and that decides the mechanism

**The plan says what the shell must become and not how it is built to size, and the tree makes that
choice for us.** Measured:

- `plainBox` (`kitchen-parts.ts:681-693`) calls `new THREE.BoxGeometry(w, h, d)` directly. It does
  **not** go through `geoCache` and its result is **not** added to `owned.geometries` — only
  `chamferBox` memoises and registers (`:640-663`, and the comment at `:621-625` says the cache is
  what makes a buffer shared). The floor (`:2160`) and `backsplash_wall_a` (`:2417`) are `plainBox`
  calls; `wall_back` (`:2172`) and `wall_left` (`:2177`) are inline `new THREE.PlaneGeometry`.
- So **all four shell geometries are private to their mesh and owned by nobody.** Nothing else in the
  scene renders from them, and `disposeKitAndStage` frees them only by walking `stage.room` and
  finding them **still attached** (`kit-disposal.ts:58-66`).

**Two consequences, and they are the implementation's shape.**

1. **Rebuild the geometry; do not scale the mesh.** Replacing a private, unshared geometry is safe
   here in a way it would not be for anything `chamferBox` hands out. A per-axis `scale` would
   otherwise be tempting — it preserves the floor's 40 mm slab and the backsplash's 14 mm, which is
   what the plan's scaling rule is protecting — but it compounds with fact B below (a scaled mesh
   stretches its UVs exactly as a resized one does, so it fixes nothing), and it leaves every
   downstream world-space measurement in criteria 4, 7, 10, 12 and 13 reading through a non-unit
   transform. **Inference, marked as mine:** the plan's ban on *"a uniform scale to the shell group"*
   is about the group; this extends it to the meshes, for a different and additional reason.
2. **The replaced geometry is disposed at the moment of replacement, or slice 2 leaks.** An orphaned
   geometry is not attached to `stage.room` when the teardown walks it, and it is not in
   `owned.geometries` for the kit teardown to find, so **nothing frees it** — one leaked buffer per
   shell build, and the shell is rebuilt on every depth change (ADR 0074 decision 1). This is
   criterion 18.

#### Fact B — the floor and the backsplash are tiled at a fixed repeat, and one texture is shared with bodies (Q7H-6)

**Not in the plan, and it is a visible-product problem rather than a code one.** Measured:

- `floorTex.repeat.set(4, 4)` and `tileTex.repeat.set(6, 1)` (`kitchen-parts.ts:607-608`), with
  `wrapS = wrapT = RepeatWrapping` (`:461`). Both are **kit-owned shared textures**, registered in
  `owned.textures` at `:614-616`.
- `BoxGeometry` and `PlaneGeometry` UVs run 0→1 per face **regardless of the face's size**. So the
  repeat is a count over the whole face, not a density in metres: today 4 × 4 planks across a
  4.2 × 3.4 m floor, and 6 tiles across a 3.5 m backsplash.
- **Therefore the moment the shell follows the room, plank size and tile size become a function of
  the room.** At the policy minimum (wall A 900) the floor still draws 4 planks across 0.9 m — about
  **4.7× too small**; at wall A 6300 they are about **1.5× too large**. A floorboard and a wall tile
  are manufactured sizes. This is the same species of error as scaling a cabinet body, and the
  `lemnaria-3d-reference` skill's texture guidance and `product-invariants.md`'s *"a bought appliance
  … has fixed real-world dimensions"* both point the same way.
- **And the obvious fix is wrong twice.** Mutating `floorTex.repeat` / `tileTex.repeat` mutates a
  **kit-owned shared** texture, and `M.tile` is used by two customer bodies as well as the shell —
  the counter builder's `backsplash` (`:1582-1590`) and the open shelf's `back_panel`
  (`:1866-1876`). Retiling the shell's backsplash would retile those bodies, which is a change to a
  body's appearance that this wave's scaling rule forbids and that **no criterion in the plan
  currently catches**: criterion 4 asserts world **transforms**, and a texture is not a transform.

**No prior ADR rules on this.** Swept `docs/decisions/` for texture, repeat, tiling and plank —
every hit is ADR 0110's *column* tiling, a different subject. So this is new ground, not an overturn.

**Q7H-6 — RULED 2026-09-15 by the coordinator: constant world density, per-mesh clones, every clone
registered for disposal.** The recommendation was taken whole. **Slice 2 is ungated; no question
remains open on this wave.**

- **The ruling.** The shell clones `floorTex` for its floor and `tileTex` for its backsplash, sets
  each clone's `repeat` from the drawn extent so that **one plank and one tile keep the world size
  they have at the seeded room**, and **registers every clone in the kit's owned textures** so the
  teardown frees them. The seeded room looks as it does today because the density is calibrated from
  it; every other room gets the same floor rather than a scaled photograph of one.
- **Refused, and this is the one an implementer reaches for first, so it is written as a
  prohibition rather than an alternative: mutating the shared kit texture's `repeat` in place.**
  `M.tile` also dresses the counter `backsplash` (`kitchen-parts.ts:1582-1590`) and the open shelf
  `back_panel` (`:1866-1876`). Retiling it to correct the shell **silently retiles two customer
  bodies** — a defect introduced into the customer's kitchen while fixing the room around it, and
  **nothing in the fidelity gate is looking at texture repeat.** It also makes the shell's build
  order load-bearing on every body built after it.
- **Refused: leaving the repeat alone.** Cheapest, and it ships a floor whose plank width is a
  function of the customer's wall length — the defect this wave exists to stop, arriving through the
  material instead of through the geometry.
- **The disposal half is not boilerplate, and the coordinator's reason for saying so is recorded
  because it is evidence rather than caution.** Adversarial QA found a live kit leak in 7F4a: a kit
  allocated before `createBodyProbeLease`'s bracket begins is stranded when the room builder throws.
  **A texture clone per mesh per room change, unregistered, is that same defect with a different
  noun** — and fact A establishes that nothing else in the teardown would find it. See risk 11.

#### Fact C — the height ruling exists, it is about cabinets, and here is what it means for the shell

**Found, as asked.** The owner, 2026-09-14, quoted in full at ADR 0110 **E11** and carried into wave
7D3's ruling **D8**: *"in majority of the cases, it's still the ceiling. But this ceiling, in majority
of the cases, is different. So somewhere is two thousand five hundred, somewhere is three thousand
millimetres height. And in this case, let's stick to what we have now. Get some feedback. And after
that, we can make them higher."*

**It rules on the cabinets, not on the shell, and it does not change one line of the plan above.**
`LEVELS` stay fixed, composition still places nothing in the 2200–2600 top row, and 7H adds no
criterion for it. **But three things follow that this wave must carry, and two of them are traps.**

1. **The wall planes' height follows `heightMm` anyway.** D8 freezes the *cabinet* bands; the drawn
   room is what the customer entered. Criterion 1 is unaffected.
2. **So the bare strip above the uppers grows with the room, and it is D8's deferral seen in 3D.**
   At 2600 there is none; at 3000 there is roughly 400 mm of empty wall above the top row; at the
   3900 policy maximum, roughly 1300 mm.

   > **Into the visual brief verbatim, as a must-not-file** (coordinator, 2026-09-15): *the band of
   > bare wall above the top row — about 400 mm at a 3000 mm room and about 1300 mm at 3900 — is
   > **ADR 0110 E11's deferral seen in 3D, ruled by the owner on 2026-09-14, and is not a defect**.
   > Do not file it. The fix when it comes is taller uppers, not a composed top row, and it is a
   > later wave's.*

   Without that line the visual verifier files it, which is the same near-miss the last wave had
   with the *Continuă* dead tap. It goes beside risk 5's warning about the seeded picture — the two
   are the same species and reach the same agent.
3. **It is independent corroboration for Q7H-3, and it makes 2500–3000 the range that matters.**
   Framing floor-to-ceiling at a 3000 mm room already spends a seventh of the frame on empty wall;
   the presets frame the kitchen, which is what Q7H-3 ruled.

   **And one number stated plainly, because a number that looks like a product decision and is
   actually an arithmetic artefact will one day be defended by someone as though the owner chose
   it: the 3900 mm policy maximum is not a product claim.** It is
   `SCENE_SHELL_HEIGHT_MM × ROOM_HEADROOM_FACTOR` — 2600 × 1.5 — the wire-shape slack
   `design-bounds.ts:22-40` invented so *"a room a little larger than [the shell] still loads"*,
   later adopted into `approved-room-policy.ts:34`. **The owner's stated real range is 2500–3000**
   (ADR 0110 E11). 3900 stays in criterion 7's sampling because it is the approved bound and the
   shell must be correct there — **but no framing rule is tuned for 3900 at the cost of 2500–3000**,
   which is where the owner says the customers are.

#### Criteria 17 to 20, continuing the scheme above

17. **Plank and tile size are constant in world space across the policy box** (Q7H-6, ruled — no
    longer conditional). For every sampled room, the world-space size of one floor plank and one
    backsplash tile is within a stated epsilon of its size at the seeded room. **The assertion is on
    the density, never on the repeat count:** a repeat count that happens to be right for one room is
    the bug restated, and a test that pins the count pins the defect. **Must not:** mutate a
    kit-owned texture in place; leave the repeat a literal; let `M.tile`'s appearance on the counter
    `backsplash` or the shelf `back_panel` change at any room; **clone a texture without registering
    the clone for disposal** — an unregistered clone per mesh per room change is 7F4a's stranded-kit
    defect with a different noun (risk 11), and fact A establishes that nothing else in the teardown
    would find it. **[property]** + **[unit]**
18. **The shell allocates nothing it does not free.** Building the shell N times for N different
    rooms leaves no geometry and no texture unreferenced and undisposed. Proved the way
    `kit-disposal.test.ts` already proves it for the 27 discarded bodies — spy on `dispose`, count.
    **Why it is a criterion and not a review note:** the four shell geometries are outside
    `geoCache` and outside `owned.geometries` (fact A), so **no existing teardown path frees a
    replaced one**, and a leak here is invisible to every other criterion in this wave.
    **[unit]**
19. **The shell's own resources stay private to the shell.** No geometry and no material the shell
    replaces or clones is one a customer body renders from, at any sampled room. This is fact B's
    trap stated as an assertion rather than a warning: it is what turns *"we retiled the backsplash
    and the open shelf changed"* from a visual-pass finding into a red unit test.
    **[unit]** + **[review]**
20. **The desktop pass is judged, and the projection properties stay mobile** (ruled 2026-09-15 by
    the coordinator, who checked the reasoning rather than accepting it). The wave's row owes a
    1440 × 900 pass; criteria 10, 11 and 12 stay at 390 × 789 / 390 × 844 and are **not** duplicated
    at desktop. **The reason is recorded with the scope, deliberately: an unpinned desktop looks like
    an oversight and a later reader will "fix" it.** `PerspectiveCamera`'s `fov` is **vertical** and
    is one constant, `CAMERA_FIELD_OF_VIEW_DEGREES` (`kitchen-canvas.tsx:43`), with `aspect` widening
    the frustum **horizontally**. So at a fixed preset, desktop frames the *same* vertical world
    extent over *more* pixels (900 > 789) and a *wider* horizontal extent — **strictly weaker than
    mobile on criteria 10 and 12**. Pinning it numerically would therefore add **a gate that cannot
    fail while mobile passes**: a green that means nothing, which is this milestone's recurring
    failure in a new costume. Desktop's obligation is the human pass — proportion, the corner seam,
    the wall-to-floor seam, and the bare strip of fact C at a tall room.

**Two amendments to criteria already written**, both because fact B is invisible to them as they
stand:

- **Criterion 2** additionally records, per shell child, the **material name and the `map`'s
  `repeat`** — not only name, transform, geometry parameters and material name. Without the repeat,
  the one test in the repository that watches the shell cannot see the change Q7H-6 rules on.
- **Criterion 4**'s *must not* gains **"or any change to a body's material, its `map`, or that
  map's `repeat`"**. Criterion 4 asserts world transforms; a shared-texture mutation moves nothing
  and changes two bodies, and that is exactly the gap fact B found.

#### Risks 9 and 10, ranked with the reason for the rank visible

9. **Fact B ranks second only to risk 1, and for the same reason.** It is a change with **no gate
   watching it**: the M1 parity gate never calls `buildKitchenShell` (risk 1), criterion 2 as
   originally written records transforms and not textures, and criterion 4 records transforms too.
   A shell that silently retiles the floor and two customer bodies would pass every criterion 1–16 —
   and the visual pass would catch it only at the seeded room, which is the one room where the
   density is unchanged. **The amendments to criteria 2 and 4 are the whole mitigation.**
10. **Fact A's leak ranks below it because a leak degrades and a wrong floor ships.** One stranded
    buffer per shell build is real but bounded — the shell rebuilds on a depth change, not on a
    keystroke — and criterion 18 catches it with an instrument the repository already has. It is
    ranked at all because the **absence** of ownership is counter-intuitive: an implementer who reads
    `kit-disposal.ts` will find a careful ownership story and reasonably assume the shell is inside
    it. It is not.
11. **The allocation that happens before the bracket that would release it — 7F4a's live finding, and
    7H can reproduce it exactly.** Recorded here 2026-09-15 from the coordinator, with a fix in
    flight: QA found that 7F4a's transient kit is **allocated before `createBodyProbeLease`'s bracket
    begins**, so a throw in the room builder strands it. **That is a shape, not a one-off, and slice 2
    is where it recurs:** the shell's resize allocates new geometry — and, under Q7H-6, a cloned
    texture — and the old resource is disposed and the new one registered *afterwards*. A throw
    between the two strands one or both, and `disposeKitAndStage` cannot recover either, because it
    frees only what it finds **still attached** to `stage.room` (`kit-disposal.ts:58-66`) plus what
    the kit records as owned — and fact A establishes the shell's geometries are in neither.
    **Must not:** allocate a shell resource outside the path that registers or disposes it; let a
    room change allocate in an effect whose cleanup is registered after the allocation. **It is
    ranked here rather than merged into risk 10 because it is a different failure:** risk 10 leaks on
    the *success* path and is caught by counting, this one leaks only when something throws, and a
    test that never makes the builder throw is green against it. **Carry it into the review brief** —
    the reviewer who found it in 7F4a has the probe, and 7H is the next wave to touch kit and scene
    lifetime.

#### What is owner's, what is the coordinator's, what is mine — settled 2026-09-15

**Nothing in this wave is open.** Both questions this addendum raised were the coordinator's and both
were ruled the same day.

- **Owner's: nothing, and nothing for the next owner batch.** Q7H-1 is answered, and D8 was found in
  the record rather than needing to be re-asked.
- **The coordinator's, both RULED 2026-09-15:** **Q7H-6** — constant world density, per-mesh texture
  clones, every clone registered for disposal, with mutating the shared kit texture written as a
  prohibition rather than an alternative; and **criterion 20** — criteria 10–12 stay mobile-only and
  desktop is the human pass, because a numerically pinned desktop is a gate that cannot fail while
  mobile passes.
- **Mine, and still marked as inference rather than record** — each derived from code cited above and
  each stated so it can be falsified by reading the same lines: the rebuild-don't-scale mechanism
  (fact A.1), the desktop-is-weaker argument (criterion 20, since checked independently by the
  coordinator), and the reading that D8 leaves the shell's height free (fact C.1).

**Dispatch state, recorded 2026-09-15.** **7H is fully ungated on questions and is not yet
dispatchable on sequencing:** it waits on **7F4a's kit-leak fix landing** and on **7F4b closing**,
and it is **never in flight with 7D7** — whose fidelity baseline is taken after this wave lands.

## Wave 7D3 — dispatchable punch list: tall units at the run ends and the oven rule

**Tier: Full.** No visual surface — `generateKitchen` still has no production caller; 7F4 wires it.
**Dispatchable. Nothing waits on the owner.** All six questions are answered (2026-09-14), the hold
placed that day is fully lifted, and the wave composes **a block of one to three full-height columns —
one `tall-oven-tower` innermost, up to two `tall-pantry` outboard — at wall A's free end**, with the
hob's base following the tower. Both questions raised by the owner's ten reference photographs are
answered: **the block is the normal case** (D1.2) and **the top row stays excluded** (D8). **No
catalogue change is needed or authorised**; new full-height body types wait for beta (backlog 66).
Dispatch after 7D2 (landed, `4133cdc`); the wave shares `generation-priorities.ts` and
`generate-kitchen.ts` with no other wave in flight.

> **This section was reversed twice on 2026-09-14 and both reversals are left visible.** The block
> reading was briefly taken to be refused (D1's single module standing, D2's 3900 / 4500 mm retired)
> and the owner then confirmed the block; and `tall-pantry` was deferred (QT-2) and then reinstated by
> the owner once it became clear a block needs a second body. **What held through every reading —
> D1's *site*, R4, D4, D5, D7's two reasons — is marked where it stands**, so a reader can tell what
> survived from what was written afterwards. Superseded answers are struck, not deleted: the sequence
> is why the rulings read as they do.

**Where the record lives.** The rules below are new owner rulings about *what generation composes*,
which is [ADR 0110](../decisions/0110-generation-inserts-through-the-command-path-and-the-corner-is-structural-data.md)'s
subject — Amendment A ruled the layout order and the minimum kitchen, Amendment C the uppers and the
drop order. They are recorded there as **Amendment E, not as a new ADR**, so composition keeps one
authority. **Amendment E is drafted (2026-09-14) and awaits the coordinator's review; it is slice S0
and no other slice may start before it is reviewed.** Where this section and the amendment differ,
**the amendment is binding** — D1–D6 below are its E1–E9 stated for an implementer.

**ADRs to check intent against first, and to stop and report on if they disagree:**
[0110](../decisions/0110-generation-inserts-through-the-command-path-and-the-corner-is-structural-data.md)
Amendment A (the reading order, the minimum kitchen, A4's leftover rule), Amendment C (uppers, the
drop order, F7's wall-B reserve), Amendment D revised (the row plan and the free-end resize) and the
2026-09-12 *Clarification* (storage yields, then returns);
[0107](../decisions/0107-appliances-are-drawn-and-not-sold-and-a-language-is-named-in-its-own-language.md)
(an appliance is drawn and not sold — QT-1 turns on it);
[0048](../decisions/0048-the-pantry-column-is-the-one-resizable-column.md) (the pantry is the one
resizable column — QT-2);
[0101](../decisions/0101-a-lifted-columns-depth-is-declared-and-the-three-deep-tops-follow-the-setting.md)
(what stands above a full-height member);
[0052](../decisions/0052-800-mm-is-the-ceiling-on-any-empty-column.md) and
[0046](../decisions/0046-adjacent-empty-columns-merge-under-a-cap-and-an-insert-splits-its-column.md)
(the merge that creates this wave's one real hazard);
[0083](../decisions/0083-wall-coverage-is-the-runs-extent-and-the-finished-end-is-part-of-it.md)
decision 3 (equality fits — the 2200 mm ceiling boundary);
[0102](../decisions/0102-a-recorded-source-must-explain-its-depth-and-a-second-authority-in-a-test-is-the-defect-laundered.md)
(no second authority for a declared size).

### The owner's words, 2026-09-14, and what they rule

> *"Let's start without any Symmetry. So the tall cabinets should be added also, but at the sides…
> not in the middle, but with the edges. So if you have, let's say, tall cabinet with oven and
> microwave, in this case maybe you don't need to use the hob with microwave because you'll have not
> the hob microwave but hob with oven. In this case you'll have two ovens and maybe don't need… let's
> focus on the minimum that can be added in the kitchen, because always it means that it will cost
> less. So if you will add the tall cabinet with oven and microwave, in this case you will choose hob
> with drawers. In case that you don't have this tall cabinet with oven and microwave, we add the hob
> with the oven, not with the drawers. If you'll have space, we insert the tall cabinets, especially
> it's useful when the kitchen have more than, I think, four or five meters — four, five thousand
> millimeters. Less, you'll not have space to make… to put these tall cabinets, only maybe to cover
> something. But in majority of the cases these tall cabinets are used at the edges."*

| # | Read as a rule | Status against the code |
| --- | --- | --- |
| R1 | **No symmetry.** | Nothing in `src/generation/` mentions symmetry; this is a confirmation, and the wave's must-not list keeps it that way. |
| R2 | **A tall unit stands at an end of a run, never in its middle.** | New. Today no tall unit is generated at all. |
| R3 | **A tall unit is placed only where there is space** — the owner's feel for it is "four or five thousand millimetres". | New, and **the number is derived below rather than taken from the sentence.** |
| R4 | **The oven rule:** with a `tall-oven-tower`, the hob base is `base-hob-2drawer`; without one, `base-hob-oven`. Never two ovens. | New. `GENERATION_PRIORITIES` hardcodes `base-hob-oven` today (`generation-priorities.ts:24`). |
| R5 | **Prefer the cheaper minimum.** | New as a stated principle; it is the reason QT-1 and QT-2 are recommended *against* below. |

**The unstated half of R4, and it is the dangerous one: never *zero* ovens.** The owner's sentence
guards against two; a substitution that fires while the tower is not actually placed produces a
kitchen with no oven anywhere, which is worse and which no test of "not two" would catch. Criterion 2
asserts **exactly one**, in both directions.

### Ground truth, measured at `8d73385`

Measured by running the package's built `dist/` from the scratchpad; nothing in the tree was edited.

| # | Measured | Consequence for this plan |
| --- | --- | --- |
| G1 | Both hob bodies are **discrete 600 mm and nothing else**: `HOB_BASE_WIDTHS_MM = [600]` (`catalog.ts:221`) is shared by `base-hob-2drawer` and `base-hob-oven` through `hobBase` (`:612-623`). | **The substitution is width-neutral.** It changes no planned width, no tile, no remainder, and therefore nothing in `shell-design.ts`. R4 is a pure build-id swap. |
| G2 | Every `fullHeightUnit` is **fixed at 600 mm** (`COLUMN_WIDTHS_MM = [600]`, `catalog.ts:244`, `fixedWidth: true` at `:684`) and **2200 mm tall** (`COLUMN_HEIGHT_MM`, `:260`). `tall-pantry` alone declares a 400–800 `'fit'` bound (`:1036-1044`). | A tower consumes **exactly one storage module's worth of run**, so `planLeftover` returns the same count and `leftover-rule.ts` is not touched. |
| G3 | All six bodies exist and are insertable at 600 mm: `base-hob-2drawer`, `base-hob-oven`, `tall-oven-tower`, `tall-fridge-housing`, `tall-pantry`, `fridge-free` (`catalog.ts:758, 765, 1049, 1078, 1021, 1092`), and `buildKitchenLBodyCatalog` — the catalogue generation already uses — contains every insertable row (`fixtures/kitchen-l-design.ts:874-888`). | **No catalogue change is in scope.** |
| G4 | Wall B's spatial order is `[storage…, reverse(reading prefix)]` (`generation-priorities.ts:127-135`): **storage stands at wall B's *corner* end and the reading prefix at its free end.** Wall A's is `[reading suffix…, storage…]`: **storage stands at wall A's free end.** | **Wall A's free end is the only leftover end a run has.** R2 therefore has exactly one eligible site, and it is discovered rather than chosen. |
| G5 | Over a sparse deterministic sample of 228 347 rooms across the approved L policy, the hob stands on wall A in 199 269, on wall B in 17 944, and does not stand at all (minimum not met) in the rest. | The hob-on-B case is real and must be ruled, not assumed away. |
| G6 | **The free-end merge is real and measured.** At 4000 × 3000 the plan is A `[600, 600, 600, 600, 600]` with a 100 mm remainder, and the shell's floor voids on wall A end **`{start: 3300, w: 700}`** — the last planned 600 mm tile merged with the 100 mm remainder under ADR 0052's 800 mm cap. | A **fixed-width** 600 mm tower dropped into that 700 mm opening is built at 600 and **centred** (`insert-fit.ts:396-412`, the *"a 700 mm slot gets a 600 mm hood, centred"* branch), leaving a 50 mm sliver on each side: not at the edge, and two bare stretches where the rule allows one. **This is the wave's one genuine hazard.** |
| G7 | The window is `0 < remainder ≤ 200` and it is common: of the 121 825 sampled rooms eligible under the threshold below, **40 835 (34 %) fall in it**; of those, 8 454 have only a single leftover module. | The hazard cannot be waved off as a corner case, and it cannot be answered by refusing a tower in the window without losing a third of them. |
| G8 | **The absorb works, measured.** Planning wall A at 4000 × 3000 as `[600, 600, 600, 700, 600]` — the module *inboard* of the tower widened by the remainder — gives floor voids ending `{start: 2700, w: 700}, {start: 3400, w: 600}` and `validateDesignForCatalog` returns **zero findings**. | The construction ruled in D3 below is not a proposal on paper. |
| G9 | Threshold witnesses: **3300 × 1700** plans wall A as `[600, 600, 600, 600]` — sink, preparation, hob and exactly one leftover module, remainder 0. **3299 × 1700** plans `[600, 600, 600]`, remainder 598: no leftover module at all. | The threshold below has an exact, discovered boundary pair. |
| G10 | At **3400 × 1600** wall B's usable run is 600 mm, so the fridge cannot go there: the plan is A `[700, 600, 600, 600]` — **the fridge stands against the corner**, and the hob is the outermost module. | A pre-existing tension with R2, ruled in D6 and raised as QT-5. **This wave does not move the fridge.** |

### Field evidence — ten photographs of built kitchens, read 2026-09-14

The owner sent **ten photographs of eight distinct kitchens their company has actually built**; the
coordinator read them. **Photographs are evidence, not a ruling**: nothing here decides anything, and
where a photograph and an owner ruling disagree, the ruling governs. They matter to this wave because
**D1/E2 was derived from code geometry alone** — a derivation that turns out to match eight built
kitchens is corroboration worth recording.

**What they confirm:**

| Observed | What it corroborates |
| --- | --- |
| Full-height columns sit at run **ends**, never mid-run. | **D1** — its siting, independently of the spatial-order argument. |
| **The corner is always continuous worktop**; no column ever turns it. | **D1's refusal of the corner end**, which this plan argued from worktop continuity and which the field confirms. |
| Sink and hob are always separated by worktop. | **ADR 0110 Amendment A1's preparation cabinet** between them — unchanged, and now observed. |
| Where a tall column carries microwave-over-oven the hob has **drawers**; where there is no such column the **oven sits under the hob**. | **R4/E4 in both directions**, including the *never zero ovens* half the owner's sentence left unstated. The rule is what these builders do, not a preference. |

**Two facts they add that this plan did not address. Both are now answered and the hold is lifted.**

1. **The full-height block is a group, not a single 600 mm unit** — typically 1200–1800 mm of
   contiguous full height. **Answered by the owner, 2026-09-14: the block is the normal case.**
   Verbatim: *"You're right. Pretty often, the tall cabinets are near. So two, three columns of tall
   cabinets are near. Your instinct is right."* **D1's site is unchanged; its extent becomes a block
   of up to three columns** (ADR 0110 E2.2), and **D2's threshold moves with the block size** — the
   3900 / 4500 mm figures, briefly retired, are **reinstated and measured** (see D2's table). The
   block sits with D7 because **the fridge stays where A1's reading order puts it** — at a run's start,
   never at wall A's free end — so no generated block holds one (D7.2).
   **It briefly looked uncomposable** — a block of two or three needs two or three tall bodies and only
   one seemed available — until the owner **reinstated `tall-pantry`** as the door column the same day
   (QT-6, ADR 0110 E12). **The block composes from the catalogue as it stands.**
2. **Wall cabinets run to the ceiling in seven of the eight kitchens** — tall uppers, or a standard
   upper with a top box above. **Answered by the owner, 2026-09-14: the top row stays excluded** (ADR
   0110 **E11**, ruling **D8** below). Amendment C's exclusion is now **owner-confirmed** rather than
   inherited, their reason is **ceiling variance** rather than preference, and the eventual fix is
   **taller uppers, not a composed top row**. **So the empty strip above a generated kitchen's uppers
   is a deliberate deferral, not a defect** — and this observation, which records that the owner's own
   kitchens do run to the ceiling, **must not be read by a later wave as a standing defect against the
   generator.**

**This is the case the opening paragraph was written for.** A photograph disagreed with a written
exclusion, and **the ruling governed** — the owner kept the exclusion. Observation 2 is evidence that
the product differs from their built kitchens today; it was never authority to change it.

### Eight rulings

**D1 — "the end of a run" is the *free* end, and never the corner end.** A run starts past the
structural corner (`shell-design.ts:266-271`, wall A at 900 mm); its other end is the wall's reachable
end. The corner end abuts the corner assembly, where the worktop turns and the two runs meet, and a
2200 mm column planted there walls the corner in and interrupts the only continuous work surface the
L has. The free end is also where the run stops being a kitchen, which is what "edge" means in the
owner's sentence. **Combined with G4 this is not a choice at all**: wall B's leftover is at the corner
end, so wall B has no free-end leftover module to give, and wall A's leftover is at the free end. The
wave therefore states the geometric claim plainly: **a generated tall unit stands at wall A's free
end, and nowhere else.** The fridge, which is also full height, stands at wall B's free end whenever
wall B holds it — so a large generated L carries one full-height group at each outer edge of the L and
none between them, which is the owner's picture.

**D1.2 — the extent, added 2026-09-14: a block of up to three columns** (ADR 0110 E2.2, E12). The
**site above is unchanged**; how much of the run it takes is not.

- **What it is made of** (owner: *"at most one incorporated fridge… one tall cabinet with oven and
  microwave, and you can have multiple cabinets, tall cabinets with doors"*): **one `tall-oven-tower`
  and up to two `tall-pantry`** — at most one oven column, any number of door columns, and no fridge
  column because D7 puts `fridge-free` at the opposite end. **No catalogue change is needed or
  authorised.**
- **In what order: the oven tower innermost, the pantries outboard.** Two reasons pointing the same
  way — the oven sits as near the hob as the block allows, and the outermost body is then the `'fit'`
  pantry, which dissolves D3's merge hazard for every block of two or three (D3.2).
- **How big: the largest that fits, `min(3, leftover modules)`**, with the single exception D3.2
  names. Three is the owner's own *"two, three columns"* and is the one number this rule states.
- **A larger block never displaces a core role.** The block draws from wall A's **leftover** modules,
  computed after the core is placed and after `chooseWallCut` has chosen the split; the cut chooser
  never sees the block. So no room that qualifies for one column fails for two — it has fewer modules
  and takes a smaller block. Confirmed by sweeping wall A millimetre by millimetre: **block size never
  decreases except the one `1 → 0` case in D3.2** (111 occurrences, all of that shape).
- **Measured distribution** over the 228 347-room sample: **no block 114 976, one column 16 910, two
  25 367, three 71 094** — a block in 58 % of rooms, most of them taking all three.

**D2 — the threshold, derived.** Not 4000, not 5000: the wave asks *what must the run already hold
before a tall unit is affordable*, exactly as the minimum kitchen was derived from the sink and the
hob. **A tower is planned when, and only when, all four of these hold:**

1. **The full core survived** — `plan.dropped` is empty, so the fridge, the sink, the preparation
   cabinet and the hob are all present. A kitchen that had to give up its fridge has no business
   gaining a second oven; this is R5 stated as a precondition rather than as a preference.
2. **The hob stands on wall A** (D6 rules the other case).
3. **Wall A's post-core leftover yields at least one whole 600 mm module** — the tower takes a module
   the leftover rule was going to place anyway, and takes it from the free end.
4. **The room is at least `COLUMN_HEIGHT_MM` (2200 mm) tall**, so the tower fits under the ceiling it
   is planned into. The *approved* policy floor is already 2200 (ADR 0108 Amendment B) and equality
   fits (ADR 0083 decision 3), so this clause never fires for a customer's room — it fires for the
   engine limits, which admit 860 mm, and it is what stops a planned tower from being refused at
   insert time.

**What that costs in millimetres, measured (G9):** the first room that qualifies is **wall A 3300 mm
with wall B 1700 mm** — corner 900 + sink 600 + preparation 600 + hob 600 + tower 600 on wall A, and
corner 900 + fridge 700 + F7's 100 mm reserve on wall B — i.e. **3300 mm on the cooking wall and
5000 mm of wall A + wall B together**. At 3299 mm there is no leftover module and no tower. The wave
hardcodes no number: the boundary is whatever the widths and the corner reach make it, and it moves by
itself if a width changes. See **QT-3**.

**D2.2 — the threshold follows the block size, measured 2026-09-14.** Clause 3 reads **at least `N`
whole modules**, where `N` is D1.2's block size:

| Block | Minimum wall A | Minimum wall A when wall B is too short to hold the fridge |
| --- | --- | --- |
| 1 column | **3300 mm** | **4000 mm** |
| 2 columns | **3900 mm** | **4600 mm** |
| 3 columns | **4500 mm** | **5200 mm** |

**There is no single threshold — there is this table, and the planner takes the largest block that
fits.** Each row is its own boundary: below 3300 no block, at 3300 one column, at 3900 two, at 4500
three.

Each figure is the smallest wall A at which the full core survives and wall A's leftover yields that
many modules, measured against the built planner with wall B at 1700 (and at 1600 for the right-hand
column); the rows differ by exactly one module's 600 mm. **The owner's spoken *"four or five thousand
millimetres"* lands on the two- and three-column rows** — 3900 and 4500 are inside the sentence where
the single-column 3300 sat under it, which is corroboration for the block arrived at from the run's
own arithmetic. It is **not** a reason to encode 4000 or 5000; that stays refused for the reason below.
**A 3900 / 4500 figure was briefly retired from this plan while the block reading was thought to be
refused — it is reinstated, and these are the measured values.**

**Alternatives refused.** *A literal 4000 or 5000 mm on a wall*: it would refuse a tower in the
3300 × 1700 kitchen that demonstrably holds one, and accept one in a 4200 mm wall B that holds no hob
— a number that answers a different question from the one asked. *"Any leftover module gets a
tower"*: it would put a second oven in a kitchen that had just dropped its fridge for want of space,
which contradicts R5. *Total wall length*: not a property of the run the tower stands in.

**D3 — the merge hazard, and the absorb that answers it** (G6–G8). When wall A's remainder is
`0 < r ≤ 200`, the free-end 600 mm tile merges with it and a fixed-width tower would be **centred in
a 600 + r opening**. The ruling: **the module immediately inboard of the tower is planned at
`600 + r`** — inside `base-cabinet`'s own 200–800 range and inside ADR 0052's 800 mm ceiling — so the
composed run reaches wall A's reachable end exactly, no empty tile is left to merge with, and the
tower's opening is exactly 600 mm. The wall's bare end becomes 0 mm, which the ≤ 599 rule permits (it
is a maximum) and which the run already produces whenever the remainder divides evenly.
**Where there is no inboard module to absorb it** — a single leftover module, 7 % of eligible rooms
(G7) — **no tower is planned** and the wall composes exactly as it does today. Refused alternatives:
*refuse a tower whenever `0 < r ≤ 200`* (loses a third of eligible kitchens for an internal reason
the customer cannot see); *put the tower one module inboard so a `'fit'` body takes the free end*
(contradicts R2, for the convenience of the engine); *resize the tower* (`fixedWidth: true`, and
`setWidth` refuses it).

**D3.2 — re-derived 2026-09-14 for a block of `N`; a re-derivation, not an edit.** Three things change
and one does not:

- **The exposed tile is still only the outermost one.** Two adjacent 600 mm tiles sum to 1200 and
  never merge under the 800 mm cap, so a block is exposed at its free-end face alone. **The hazard
  does not grow with `N`.**
- **The absorbing body is the outermost `'fit'` body of the run, and D1.2's order makes that the
  block's own last column.** `tall-pantry` is the one `'fit'` full-height row (400–800, ADR 0048), and
  the tower stands innermost — so in every block of two or three the outermost body is a pantry,
  **planned at `600 + r`** and taking that opening the way any fit body takes its tile. **No absorb,
  no reduction, no `N + 1` bookkeeping.** A naive *"the module immediately inboard of the tower"*
  would have named a `fixedWidth` column as soon as `N ≥ 2`; that is why this is a re-derivation.
- **Only the tower-alone block still needs the original absorb**, because a lone `tall-oven-tower` is
  `fixedWidth` and is then the outermost body: the remainder goes to the last `base-cabinet` inboard
  of it, and where there is none, nothing is placed. **This is the one place the block can shrink as
  the room grows** — one column to none, across the 200 mm window — and it is an **accepted, stated
  awkward boundary**, not an accident: measured by sweeping wall A millimetre by millimetre, all 111
  dips in the sweep are of that single `1 → 0` shape and **no two- or three-column block ever
  shrinks**. Criterion 22 asserts it rather than leaving it to be rediscovered.
- **A prediction this plan's author got wrong, corrected by the measurement.** It was predicted the
  *"nothing inboard to absorb it"* fallback would **grow more common as the block grows**. In absolute
  terms it does not: **8 454 rooms at `N = 1`, 8 456 at `N = 2`, 8 455 at `N = 3`** — a boundary ring
  that moves outward without changing size; only its **share** rises (6.9 %, 8.8 %, 11.9 %) because
  the eligible population shrinks. Under D1.2's ordering it is moot for `N ≥ 2` anyway. **The
  measurement goes in the plan, and so does the fact that the prediction was wrong.**

**D4 — the substitution is not a degradation, and the two stages stay apart.** ADR 0110's 2026-09-12
*Clarification* already reads composition as two stages: select the surviving core (storage yields,
then the fridge, then preparation; sink and hob never), then refill each final remainder with storage.
**The tower is a third stage over the second one, and it never enters the first.** In order:

1. **Core selection — untouched.** The tower does not compete with the fridge or the preparation
   cabinet, is not in `GENERATION_PRIORITIES`, and cannot cause a role to be dropped. Criterion 12
   pins the surviving core and the wall cut to what 7D2 produces for the same room.
2. **Leftover fill — unchanged in count.** `planLeftover` is called with the same argument and
   returns the same `storageCount` (G2); the free-end module's *identity* changes, and in the absorb
   window one inboard module's width does.
3. **Substitution — reads the plan, in one place.** The hob's build id is `base-hob-2drawer` if and
   only if the plan contains a tower, decided by the same function that decided the tower.

**A tower that is planned and then refused is a programming error, and throws** — the precedent is in
the file already (`generate-kitchen.ts:249-253` throws when the free-end resize is refused). The plan
guarantees a 600 mm opening at the free end (D3), so a refusal means the plan and the shell have
disagreed, and the alternative — logging it *not placed* and carrying on — ships a kitchen whose hob
has drawers and whose oven does not exist.

**D5 — no upper above a full-height body, derived from the body and not from a role list.** Today the
upper loop skips one role by name (`generate-kitchen.ts:269`, `if (planned.role === "fridge")`), and a
tower reaching 2200 mm has no opening at `WALL_ROW_Y0_MM` above it — `plannedVoid` would throw
(`:521-526`). The rule becomes: **an upper is attempted above a base only where the body's declared
top is at or below the wall row's floor**, read from the catalogue entry's `nominalHeightMm`. The
fridge (1850 mm) keeps its exact present behaviour as the witness that the derivation is right, and
the special case disappears rather than gaining a sibling. The top row (2200–2600) stays uncomposed,
as it is today; the space above a placed tower is an ordinary recorded column.

**D6 — when the hob stands on wall B, no tower is generated** (G4, G5). Wall B's leftover is at the
corner end, which D1 forbids, and putting the tower on wall A while the hob is on wall B would leave
the oven around the corner from the cooking zone *and* take the oven out from under the hob. Both are
worse than the shipped behaviour, which is a hob with an oven under it. **The kitchen keeps
`base-hob-oven` and gains nothing** — R5's answer. See **QT-4**.

**D7 — the oven is never adjacent to the fridge, and it already isn't.** Owner, 2026-09-14, verbatim
(the full quotation is in ADR 0110 **E10**): *"What is the problem of having the oven near the fridge?
Fridge consume much more electricity because oven will emit a lot of heat. Plus… the order of cooking
is… you're taking from fridge something, you wash, you cut, you prepare, and you go to the hob or to
the oven."* **Two independent reasons, and the first is physical:** an oven radiating into a fridge's
side raises that fridge's consumption for the life of the kitchen. **An implementer or reviewer must
not read this as a workflow preference and trade it against a layout argument** — a layout argument
can be answered with another layout argument, and a thermal one cannot.

**It needs no clause in the planner**, and adding one would be a second authority. Measured over the
228 347-room sample: **16 604 rooms put the fridge on wall A *and* qualify for a tower, and in none of
them are the two adjacent** — the minimum separation is **1800 mm**, exactly sink + preparation + hob,
tightest at 4000 × 1077. The hob is never adjacent to the fridge either (0 of 228 347), because the
drop order removes the fridge before the preparation cabinet, so a surviving fridge always has both
the sink and the preparation cabinet after it. **Witness, measured — 4000 × 1600:** wall A composes
`fridge[900–1600] sink[1600–2200] preparation[2200–2800] hob[2800–3400] storage[3400–4000]`, and the
free-end storage becomes the tower: the cooking order laid out left to right along one wall, ending at
the oven, 1800 mm clear of the fridge.

**So D7 is an invariant to assert, not a gate to build** — criterion 19. Assert it precisely *because*
it is free today: it is bought by ADR 0110 Amendment A1's reading order, and a later wave that
re-orders a run (7D4) or grows the block would otherwise break a physical constraint with no test to
notice.

**D7.2 — what D7 forbids is ADJACENCY, not proximity — and an inference of this plan's, withdrawn.**

~~*The block excludes the fridge*, the coordinator's reconciliation of two owner statements.~~
**WITHDRAWN 2026-09-14.** It was marked in this plan as the one place resting on inference rather than
a ruling, and as something not to be hardened before the owner answered. It was put to them; **it was
wrong.** Shown the contradiction directly — their photographs show a fridge beside an oven tower,
which D7 appeared to forbid — and offered three readings (the rule governs and the photos are the
minority case; the photos govern and adjacency is fine; a column always separates them in a block),
**the owner chose none and ruled**: *"or minimum have another cabinets between them"*.

- **The rule: the fridge and the oven may stand in the same run, and even in the same block, provided
  at least one cabinet stands between them.** What is barred is the **shared side panel**, not
  nearness. **Both of D7's reasons stand unchanged, the thermal one first** — a separating carcass
  answers it *physically*, by breaking the conduction path, which is why the narrower form is coherent
  rather than a softening. **The scope narrows; the authority does not.**
- **It changes nothing this wave composes, and the reason improves.** The block holds no fridge
  **because ADR 0110 Amendment A1 places the fridge and QT-5 rules that this wave does not move it** —
  it stands where the reading order puts it, at a run's start, and the block stands at wall A's free
  end. The shape is the same; its justification is now a standing owner ruling instead of an inference.
- **Everything measured survives, with a wider margin.** The reading order delivers **two or three
  cabinets** between the fridge and any oven where the rule asks for **one**.

**D7.3 — does a *base* cabinet count as the separator? Half settled by the geometry, half open.**
Worked from the heat path rather than the module count.

- **Between the fridge and an oven *under the hob*: yes, and it is already owner-ruled.** A1's order is
  fridge → sink → **preparation** → hob, so the product has always put two base cabinets between them —
  the owner's own arrangement, for their own reason, and what the photographs show. The geometry
  agrees: `base-hob-oven`'s oven sits **entirely below the worktop**, in the same 0–860 mm band as the
  separating carcasses, so the separator covers its full height.
> **ANSWERED by the owner, 2026-09-14 (ADR 0110 **E13**), and the split below is the split they
> ruled:** *"if oven is in tall cabinet than between fridge and that particular cabinet should be
> another tall cabinet, if the oven is under the hob being part of that cabinet with hob, than can be
> used any type tall or standard cabinet"*. **Branch 2 blesses what this wave already composes** —
> fridge, sink, preparation, hob-with-oven, two base cabinets between. **Branch 1 is unreachable
> here**, because the generator never places a fridge near the tower. **No criterion changes and no
> threshold moves.**

- **Between the fridge and a *tall oven tower*: the geometry does not answer it** — *the owner did,
  and it answered as this working predicted: the separator must itself be tall.* Measured,
  `OVEN_TOWER_DOOR_BAND_HEIGHTS_MM` is `[500, 500]` in a 2200 mm frame — one leaf under the oven, one
  over the microwave — so the appliances sit in the column's middle and the oven reaches **above** the
  860 mm worktop line. A base cabinet covers only its lower part; **860–1500 is the backsplash gap and
  is open air** (`recomputeVoids` never subdivides it), and the wall row above is 330–400 mm deep
  against the fridge's 742, so even an upper leaves the front third facing across open air. **Stated as
  QT-7, not chosen.**
- **It blocks nothing and is unreachable by this wave**: a generated kitchen never puts a fridge
  next-but-one to a tower, the measured minimum separation being **1800 mm — sink, preparation and
  hob**. It becomes live only when a wave places a fridge inside or beside a block.

**D8 — the top row stays excluded, and it is now the owner's own ruling.** Owner, 2026-09-14, verbatim
(full quotation at ADR 0110 **E11**): *"in majority of the cases, it's still the ceiling. But this
ceiling, in majority of the cases, is different. So somewhere is two thousand five hundred, somewhere
is three thousand millimetres height. And in this case, let's stick to what we have now. Get some
feedback. And after that, we can make them higher. So the middle and the top cabinets to be just
higher. But now let's keep like it is."* Three things this wave must carry:

1. **Nothing changes here.** Composition places no body in the top row (2200–2600), as Amendment C
   already said; the exclusion is **owner-confirmed** rather than inherited. **This wave adds no
   criterion and no code for it.**
2. **The empty strip above a generated kitchen's uppers is a deliberate deferral, not a defect.** A
   reviewer or QA agent who notices it against the reference photographs should cite D8, not raise it.
3. **The eventual fix is *taller uppers*, not a composed top row**, and the difference is material:
   one changes a band's height as a function of the room, the other adds a body. Whoever plans that
   wave starts from *"make the uppers taller as a function of the room height"* — the owner's form,
   not the obvious one. **Their reason is ceiling variance, not preference**, which is also why they
   want feedback from the built product first.

### Module boundaries

- **`src/generation/tall-end-rule.ts` (new leaf).** One pure function answering one question: given
  the surviving core, the chosen cut, each wall's run and leftover plan, and the room height, **does a
  tower stand at wall A's free end, and which hob build id follows?** It imports the leftover rule's
  constant and nothing else from generation; no catalogue, no probe, no design. It is the **only**
  module that may name `base-hob-2drawer` or `tall-oven-tower`. Written beside `leftover-rule.ts` and
  for the same reason that module exists: `generation-priorities.ts` already carries the cut chooser
  and the spatial layout, and a second rule of this size inside it is the "cannot name it without
  *and*" split.
- **`src/generation/generation-priorities.ts`** keeps the reading order, the cut and the spatial
  layout. It *calls* the rule, places the block's columns as the last wall-A items, applies the absorb
  width to **the last `'fit'` body inboard of the whole block** (D3.2 — never to a column, which
  cannot take it), reports the true `remainderMm`, and substitutes the hob's build id. It gains no new
  width literal.
- **The block's size is `min(3, leftover modules)`** (D1.2), and **3 is the only number the rule
  states** — the owner's own *"two, three columns"*. Its **composition** (one oven tower, the rest
  door columns) and its **order** (tower innermost) belong to `tall-end-rule.ts` and to nothing else.
- **`src/generation/generate-kitchen.ts`** keeps the command funnel. It gains: the tall role in the
  two `plan.bases` passes so **every planned base is attempted exactly once** (see R-6 below), D5's
  derived upper suppression, and the exactly-one-oven post-condition.
- **`leftover-rule.ts`, `shell-design.ts`, `insert-fit.ts`, the void engine, the validator, the
  catalogue and the price book are read-only to this wave.**
- **The declared sizes stay in the catalogue.** No generation module may write `600`, `2200` or
  `2.2` for the tower: the width comes from the entry's `widthFlex` and the height from its
  `nominalHeightMm`, threaded in by `generateKitchen` from the catalogue it already builds. A
  generation-side constant checked against the catalogue in a test is the second authority ADR 0102
  forbids, not a safeguard.

### Files, and the must-not-change set

**May change (4 production files + tests):**

- `packages/configurator-domain/src/generation/tall-end-rule.ts` *(new)*
- `packages/configurator-domain/src/generation/generation-priorities.ts`
- `packages/configurator-domain/src/generation/generate-kitchen.ts`
- `packages/configurator-domain/src/index.ts` *(exports only, if the rule's type is needed outside)*
- `packages/configurator-domain/tests/generation/*` and one `packages/three-adapter/tests/*` parity
  addition

**Must not change:** `src/generation/leftover-rule.ts`; `src/generation/shell-design.ts`;
`src/catalog.ts`; `src/pricing/**`; `src/commands/**` (including `insert-fit.ts` and `set-width.ts`);
`src/void-engine.ts`; `src/merge-empty-columns.ts`; `src/validate-design.ts`; `src/room/**` —
in particular `room-policy.ts` and `approved-room-policy.ts`, whose minimum kitchen stays **sink and
hob**; anything under `apps/web`. **`GenerationCoreRole` must not gain a member**: the new role joins
`GenerationBaseRole` beside `storage`, so `dropped` still names core roles only and
`generatedRequiredWidthMm` (`room-policy.ts:123-135`) still reads exactly what it reads today.

### Acceptance criteria

Each names its proof mechanism. *Property* means a `fast-check` property over the **approved** L
policy (wall A 900–6300, wall B 1000–5100, height 2200–3900, on a 1 mm grid) with a stated minimum
sample count **per arm**, per `docs/WORKFLOW.md`. Every criterion says what must not happen.

**Every criterion below is owed at block sizes 1, 2 and 3**, against the **real** catalogue: QT-6 is
answered and `tall-pantry` supplies the door columns, so all three sizes are reachable in approved
rooms. Boundary rooms to use throughout, measured: **3300 × 1700** (one column), **3900 × 1700** (two),
**4500 × 1700** (three), and **4000 × 3000** (two, with a 100 mm remainder the outermost pantry
absorbs). **No slice may add a body to the catalogue** — the block is composed from rows that already
exist.

1. *(unit, two fixtures)* At **3300 × 1700 × 2600** the plan contains exactly one `tall-oven-tower`,
   it is wall A's last module, and the hob's build id is `base-hob-2drawer`. At **3299 × 1700 × 2600**
   there is no tower and the hob is `base-hob-oven`. **Must not:** a tower in either room's wall B.
2. *(property, ≥ 150 samples per arm)* **Exactly one oven, never two and never zero.** For every
   generated design, `count(base-hob-oven) + count(tall-oven-tower) === 1`. Arms: with a tower and
   without. **Must not:** a design carrying both bodies, or neither, on any path — including the paths
   where an upper or the fridge was refused.
3. *(property, same run)* **Exactly one hob body**, and `base-hob-2drawer` appears **if and only if**
   a tower does. **Must not:** a `base-hob-2drawer` in a kitchen with no tower.
4. *(property, ≥ 150 samples in the tower arm)* **At the end, never in the middle.** Where a block is
   placed, **its columns are contiguous and outermost**: the outermost column's far edge is the
   maximum composed edge on wall A, and no non-column body stands between any two of its columns.
   **Must not:** any composed body between the block and the wall's end, or a column detached from the
   block. *(At block size 1 this reads as the tower's own far edge being the maximum — write it for
   the block so it keeps holding when QT-6 is answered.)*
5. *(unit + property)* **Never at the corner end.** No tower is ever planned at a run's `startMm`, on
   either wall, in any room of the policy — and no tower is planned on wall B at all. Stated as a
   universally quantified assertion, not as a fixture.
6. *(property, ≥ 100 samples per arm)* **The threshold, all four clauses, at every block size.** A
   block appears if and only if D2's conjunction holds, with clause 3 read at the block's own size,
   **and its size is the largest that fits.** Arms to sample explicitly: dropped-core rooms (no
   block), hob-on-B rooms (no block), zero-leftover-module rooms (no block), and one arm per block
   size 1, 2 and 3. **Must not:** a block in a room whose `dropped` list is non-empty; a block smaller
   than the modules allow.
7. *(unit, boundary, derived)* The boundary pair of criterion 1 is **computed in the test** from
   `lShellFloorRuns` and the priorities' declared widths, and the computed numbers (3300 / 3299 on
   wall A at wall B 1700) are then asserted as literals so a change to any width shows up as a failing
   number rather than as a silently moved boundary. **Must not:** a test that only asserts the
   computed value against itself.
8. *(unit, boundary, the hazard)* **The tower's opening is exactly 600 mm and it is flush to the
   composed run.** At **4000 × 3000** (remainder 100, G6) the placed tower's centre is exactly
   `runEnd − 300`; wall A's planned widths are `[600, 600, 600, 700, 600]`; the design reports zero
   findings; and **no `set_width` command is logged for the tower**. Neighbouring boundary: at a
   remainder of 201 no absorb occurs and the plan is unchanged from 7D2's apart from the last module's
   identity. **Must not:** a tower whose placed width is 600 in an opening wider than 600 (the centred
   case), or a bare stretch on both sides of it.
9. *(unit)* **The absorb has a floor, and it never lands on a column.** Where wall A's leftover is
   exactly the block's own size and the remainder is in `(0, 200]`, the block **reduces by one column**
   so the freed `'fit'` module can absorb it; where that would take it below one column, **nothing is
   planned** and the wall's widths and remainder equal 7D2's exactly. **Must not:** an absorbed width
   above 800 mm or below `base-cabinet`'s 200 mm floor, or an absorb applied to any `fixedWidth` body
   (D3.2 — at block size 2 or 3 the naive "module immediately inboard" is a column).
10. *(property)* **No upper above a full-height body.** No `wall-cabinet` or `hood` placement shares
    along-wall extent with any body whose declared top is above the wall row's floor; `generateKitchen`
    never throws *"no A opening covers …"*. **Must not:** a role-name list deciding it — the test reads
    the suppression's input from the catalogue entry.
11. *(unit)* **The fridge is the witness that D5 is a refactor.** For a room where the fridge is
    placed, the steps, commands and design are deep-equal to 7D2's for the same room **when no tower is
    planned**. **Must not:** an upper appearing above `fridge-free`.
12. *(property, ≥ 200 samples)* **Degradation is untouched.** For every room, the surviving core roles,
    the `dropped` list and the wall cut equal what 7D2's planner produces for the same room, tower or
    no tower. **Must not:** the tower's presence changing which core roles survive.
13. *(property)* **The leftover rule is untouched.** Per wall, the composed run leaves at most 599 mm
    bare — at most 599 + the chain shift on wall B (ADR 0110 Amendment C / F7) — and the count of
    600 mm modules wall A receives equals `planLeftover`'s for the same free end. The plan's
    `remainderMm` equals the physical bare wall, including **0** in the absorb case. **Must not:** a
    second remainder arithmetic anywhere in generation.
14. *(unit, boundary)* **The ceiling.** At a 2200 mm room height a tower is placed and the design
    reports no `PLACEMENT_ABOVE_ROOM`, no `COLUMN_EXTENT_ABOVE_ROOM` and no `EMPTY_COLUMN_ABOVE_ROOM`
    (equality fits, ADR 0083 decision 3). At 2199 mm — reachable through `ENGINE_ROOM_LIMITS`, not
    through the approved policy — no tower is planned and the hob keeps its oven. **Must not:** a
    planned tower that `insertBody` then refuses.
15. *(property)* **Every planned base is attempted exactly once.** The log's step ids for base roles
    are a permutation of `plan.bases`' ids, with no duplicate and no omission, for every room. *(This
    is the criterion that catches the wave's most likely defect: a new role that falls through both of
    `compose`'s two `plan.bases` passes — `!== "storage"` and `=== "storage"` — is never inserted, and
    its tile silently stays empty while the hob has already lost its oven.)*
16. *(property)* **7D2's guarantees still hold, unedited.** Zero `validateDesignForCatalog` findings of
    either severity and no overflowing placement; the same room gives a deep-equal design **and** log;
    `replayGenerationLog` reproduces the design exactly, including the tower's insert; the probe lease
    is released on every path including a throw (the ledger in `tests/support/fake-probe.ts`). The
    existing 7D2 suites pass **without edits to their assertions** — an edited 7D2 assertion is a
    finding to report, not a fix to make.
17. *(unit)* **The room rule is unmoved.** `ENGINE_ROOM_LIMITS` and `APPROVED_ROOM_POLICY` are
    byte-identical before and after, the minimum kitchen is still sink + hob, and 7A2's coupled
    `ROOM_TOO_SMALL_FOR_KITCHEN` property passes unedited. **Must not:** the tower becoming a room
    prerequisite by any route.
18. *(three-adapter parity, real probe)* A sample of generated designs **that contain a tower** builds
    with the real probe: no two bodies intersect beyond `room-composition.parity.test.ts`'s shared-face
    tolerance, the tower's back face is on its wall plane, its top measures 2200 mm, and its finished
    depth does not collide with wall A's run-end panel (ADR 0045 Amendment A). **Must not:** a
    re-baselined fidelity capture — this wave changes no builder.
19. *(property, ≥ 150 samples in the fridge-and-tower arm)* **At least one cabinet stands between the
    fridge and the oven** (D7 / ADR 0110 E10.4, the owner's *"or minimum have another cabinets between
    them"*). For every generated design, between any placed `fridge-free` and any placed
    `tall-oven-tower` or `base-hob-oven` there is **at least one other placed body along the run** —
    **on either wall and across the corner**. **Assert the owner's rule, not a distance and not
    non-adjacency-by-construction:** a future wave that legitimately places the two *two columns apart
    inside a block* must still pass this unchanged. The arm that matters is *fridge on wall A **and** a
    tower planned* (16 604 rooms in the sample); a property that never samples it proves nothing.
    Witness room **4000 × 1600**, where the separation is sink + preparation + hob — three bodies where
    the rule asks for one. **Must not:** a planner clause enforcing this — it is bought by the reading
    order, and a second enforcement site is a second authority. The test's failure message must name
    the **thermal** reason, so the next person to see it red does not take it for a styling rule.
20. *(unit, boundary)* **The block's size steps where the table says** (D2.2). Against the real
    catalogue: at wall A **3900 / 1700** a two-column block is planned and at 3899 one; at **4500 /
    1700** three and at 4499 two. **Must not:** a block of four; a block that grows past the modules
    available.
21. *(unit)* **The block's composition and order** (D1.2 / ADR 0110 E12). A block of `N` is **one
    `tall-oven-tower` innermost and `N − 1` `tall-pantry` outboard**, contiguous, at wall A's free
    end. **Must not:** two oven towers in a block; a pantry inboard of the tower; a `fridge-free`,
    a `tall-fridge-housing`, or any non-column body inside the block; a block body drawn from a
    catalogue row this wave added.
22. *(unit, boundary — the one place the block shrinks as the room grows)* With **one** leftover
    module and a remainder in `(0, 200]`, **no block is planned** and the wall's widths and remainder
    equal 7D2's exactly; with two or more modules the block is placed at every remainder, because its
    outermost pantry absorbs. Assert the dip **by name**, at the measured shape `1 → 0` and at no
    other: a two- or three-column block must never shrink as wall A grows. **Must not:** a `2 → 1` or
    `3 → 2` step anywhere in a millimetre sweep of wall A.
23. *(lint / grep in a test)* **One authority for the substitution.** `base-hob-2drawer`,
    `tall-oven-tower` and `tall-pantry` appear in exactly one module under `src/generation/`. No file
    under `src/generation/` contains a column's width or height as a literal, and none contains the
    word *symmetry*. **Must not:** a generation-side constant "kept in sync" with the catalogue.

### Slices, in dependency order — dispatched one at a time

The tree is frozen for QA and review between slices (`docs/WORKFLOW.md`); no two of these may be in
flight together, and **S2 must not be split further**, for the reason stated in it.

- **S0 — the record. DRAFTED 2026-09-14; the hold placed that day is lifted.** ADR 0110
  **Amendment E** (E1–E**11**, plus **OQ-1**): the owner's words verbatim for the tall-unit rules, the
  block, the oven-beside-fridge ruling and the top row; QT-1 and QT-2 marked as **relayed rather than
  quoted**; the coordinator's QT-3 / QT-4 / QT-5 and the E10.4 reconciliation marked as **the
  coordinator's, not the owner's**; the single-site geometry; the threshold table; the QT-5 tension
  with A1; the field corroboration; and the 2026-09-14 reversal left visible. Markdown only; awaiting
  the coordinator's review before commit. **No other slice starts until it is reviewed**, and where it
  and this section differ the amendment is binding.
- **S1 — the upper suppression, as a pure refactor** (`generate-kitchen.ts` only). D5: the role-name
  skip becomes a derived one, the fridge is its witness, and the generated output is byte-identical
  for every room. Criteria 10 (its non-throw half) and 11. **Green on its own, and it changes no
  design** — which is exactly why it goes first, so S2's diff contains only new behaviour.
- **S2 — the rule, the tower and the substitution, together** (`tall-end-rule.ts`,
  `generation-priorities.ts`, `generate-kitchen.ts`). Criteria 1, 3–9, 12–15, 17, 20–23. **Not
  splittable:** a commit that places the tower without the substitution ships two ovens, and one that
  substitutes without the tower ships none — criterion 2 fails at either intermediate commit, and a
  wave whose own invariant is false between its commits has no green tree to bisect against.
- **S3 — the properties and the parity test** (`tests/` only). Criteria 2, 10, 16, 18, 19, and the arm
  counts on 6 and 12. Dispatched to QA-style adversarial authorship: **the properties are written
  against the criteria, not against the implementation**, and any property that cannot be made to fail
  by a deliberate one-line sabotage of `tall-end-rule.ts` is reported as not proving its criterion.

### Risks

1. **The centring hazard (G6).** The likeliest silent defect in the wave, and it is invisible to every
   test that only asks *"is there a tower?"*. Criterion 8 asks where its edges are. An implementer who
   discovers it late will be tempted to refuse the tower in the window — refused in D3, with the 34 %
   measurement as the reason.
2. **A role that falls through both `plan.bases` passes.** `compose` partitions on `role !== "storage"`
   and `role === "storage"` (`generate-kitchen.ts:167-243`); a third role added without touching both
   is never inserted, and the failure is *silent* — the hob has already been substituted. Criterion 15
   is the guard, and it is worth writing before the role exists.
3. **A planned tower refused at insert time** leaves a kitchen with no oven. D2 clause 4 and D4's throw
   are the answer; criterion 14 is the witness. **Do not soften the throw into a logged refusal**
   without a new ruling.
4. **Two authorities for a declared size.** The tower's 600 and 2200 are the catalogue's (ADR 0102).
   Criterion 23 is a grep, deliberately, because this is the failure that looks harmless in review.
5. **Quietly widening the minimum kitchen.** `room-policy.ts` reads `GENERATION_PRIORITIES`; a tower
   entry added to that table with `required: true`, or a hob entry losing its `widthMm`, changes which
   rooms Step 1 refuses — a customer-visible change made by accident, in a file this wave must not
   touch. Criterion 17.
6. **Property arms that never fire.** A naive room generator spends most of its samples in rooms with
   no tower; a property that "passes" over 200 samples with zero tower arms proves nothing. Every
   property above states a minimum per arm and the suite must fail when an arm is starved.
7. **D7 read as a preference.** The oven-beside-fridge rule costs this wave nothing — the reading order
   already satisfies it — which is exactly what makes it easy for a later reader to treat criterion 19
   as fussiness and relax it while re-ordering a run. **Its first reason is thermal and physical**, and
   the criterion's failure message must say so. A wave that re-orders a generated run without reading
   ADR 0110 E10 can raise a real customer's electricity bill and see nothing go red.
8. **`tall-pantry` gains its first automatic caller, and its width is now chosen by a run.** Until now
   a pantry only ever existed where a customer put one. Generation will insert them at 600 mm, and at
   **600 + `r` (up to 800)** where the outermost one absorbs a remainder — which crosses ADR 0048's
   500 mm door-count threshold in the normal case and exercises its 400–800 bound from a caller that
   never chose it deliberately. **A wave that later narrows that bound changes generated kitchens**,
   and nothing outside ADR 0048 would say so. Criterion 21 names the pantry explicitly for this reason.
9. **Building past what the owner ruled.** The block is *one* oven column and *any number* of door
   columns, capped at three. A slice that composes two oven towers breaks R4; one that reaches for a
   body the catalogue does not have breaks E12.4's beta deferral. Criteria 20–22 bound the size, the
   composition and the one place the size may fall.
10. **The wave has no UI and no visual gate.** Everything is provable in `configurator-domain` plus
    one `three-adapter` parity test. **Nothing here is provable by looking at the app**, because
    `generateKitchen` still has no production caller until 7F4 — so "it looked right in the browser"
    is not evidence in this wave, in either direction.

### Owner questions — all seven answered 2026-09-14

QT-1 … QT-5 are recorded as ADR 0110 Amendment E's E8, E9, E3, E2 and E8; **QT-6 is answered by E12**
(which also supersedes QT-2) and **QT-7 by E10.4**. **Nothing in this wave waits on the owner**, and
their closing instruction was *"lets focus now on building algorithm"* — so no new question goes to
them unless something genuinely blocks a slice. One thing is left **open and unreachable** rather than
asked: **whether a base cabinet is enough between a fridge and a tall oven tower** (QT-7's second
half, ADR 0110 **OQ-2**) — **answered by the owner on 2026-09-14 as ADR 0110 E13; nothing in this
wave is open.**

- **QT-6 — a block of two or three columns needs two or three tall bodies, and the catalogue appeared
  to have one. ANSWERED by the owner, 2026-09-14: `tall-pantry` is reinstated; new body types wait for
  beta.** *(Raised by the coordinator after the owner confirmed the block; ADR 0110 **OQ-1** and
  **E12**.)*

  **The arithmetic that made it a question.** Three full-height rows exist. `tall-oven-tower` — **one
  per kitchen**, since R4 forbids two ovens. `tall-fridge-housing` — **ruled out on cost** (QT-1).
  `tall-pantry` — **deferred** (QT-2). One usable body left, so a two-column block could not be
  composed at all.

  **The answer.** *"add pantry and other cabinets let for later, adding new cabinets will be like
  after having the beta testing… lets focus now on building algorithm"*, with the composition ruling
  *"only one incorporated fridge… one tall cabinet with oven and microwave, and you can have multiple
  cabinets, tall cabinets with doors"*. So: **one oven column, any number of door columns, no fridge
  column** — `tall-oven-tower` + up to two `tall-pantry`, **from the catalogue as it stands. No
  catalogue change is needed and none is authorised.** The third possibility this question raised — a
  plain shelved full-height cupboard rather than a fitted pantry — was **not** taken; it is deferred
  with the other new bodies (backlog 66).

- **QT-7 — the fridge-beside-the-oven contradiction. ANSWERED by the owner, 2026-09-14, and it
  withdrew an inference of this plan's** (D7.2). Shown that their photographs contain the adjacency
  D7 appeared to forbid, and offered three readings, they ruled a fourth: *"or minimum have another
  cabinets between them"* — **adjacency is what is barred, not proximity.** The
  block-excludes-the-fridge reading was the coordinator's and is **withdrawn, not confirmed**. It had
  been marked as this plan's one inference and as something not to harden before an answer; that
  marking is why it was asked rather than built on.

  ~~**Left open, blocking nothing, not put to the owner now**: whether a **base** cabinet is enough
  between the fridge and a **tall** oven tower.~~ **ANSWERED by the owner, 2026-09-14 (ADR 0110
  E13):** *"if oven is in tall cabinet than between fridge and that particular cabinet should be
  another tall cabinet, if the oven is under the hob being part of that cabinet with hob, than can be
  used any type tall or standard cabinet"*. **Two branches, conditional on where the oven is — not on
  how wide the run is, and they must not be flattened.** The answer matches what D7.3's geometry
  predicted. **For this wave: branch 2 blesses what it already composes; branch 1 is unreachable, and
  nothing changes.** The consequence for a later wave: a fridge column and an oven tower in one block
  imply a **third** tall body between them, so **three columns minimum — 4500 mm of wall A** by D2.2's
  table. **No threshold is adjusted on that reading.**

  **And the rule is conditional on proximity** — owner, verbatim, 2026-09-14: *"i said that fridge
  should not be near oven but if they are not near then is not needed any special separator cabinet"*.
  **So the separator branches govern only a fridge and an oven that would otherwise touch.** Where they
  stand at opposite ends of a run with base cabinets between — which is every kitchen this wave
  composes — **no special separator is required at all.** **What the owner refuses is ADJACENCY, a
  shared side panel, and never proximity**; every loose phrasing of it (*"near"*, *"beside"*) is that
  same constraint. **Nothing about this is an open question any more**, and no wave is owed a
  follow-up on it.

- **QT-1 — should `tall-fridge-housing` replace `fridge-free` at an end?** **Answered by the owner:
  no — `fridge-free` stands.** They accepted all three reasons. *Cost:* under ADR 0107 a free-standing
  fridge is the customer's own appliance and is priced at **zero** (`sample-price-book.ts:208-212`,
  `drawnButNotSupplied`), while the housing is joinery and carries **700 000 minor** (`:198-202`) — so
  the swap is the *more* expensive kitchen, against R5. *Product:* a housing is the niche an
  **integrated** fridge sits in, which the customer would then have to buy. *Geometry:* 600 mm against
  the fridge's 700 mm, handing 100 mm back to the bare end for no gain. **They were offered the
  opposite reading explicitly — that they might have meant a built-in fridge — and did not take it**,
  so the free-standing fridge is settled rather than merely unexamined. *(Recorded from the
  coordinator's relay, not verbatim: no agent may quote it as the owner's own sentence.)*
- **QT-2 — should `tall-pantry` ever be generated? ~~Not in this wave.~~ SUPERSEDED THE SAME DAY —
  the pantry is in 7D3.** The original answer is kept rather than edited away, because the sequence is
  the point: it was given when a tall unit meant **one** 600 mm column, before the block reading
  existed and before anyone knew a block would need a second body. ~~Answered by the owner: not in
  this wave and not assigned to a later one; they were also offered *"later, with the long-run
  rework"* and chose the plain deferral.~~ **Superseded by the owner, 2026-09-14** — *"add pantry and
  other cabinets let for later, adding new cabinets will be like after having the beta testing… lets
  focus now on building algorithm"* — read with their composition ruling (*"you can have multiple
  cabinets, tall cabinets with doors. Because under the doors, you can just have the shelves and
  different organizers"*): **`tall-pantry` is the block's door column** and ships in this wave. What
  stays deferred is **new** body types (QT-6). The cost figure still stands and is now a knowing
  choice — see D1.2 and ADR 0110 **E12.3**.
- **QT-3 — the threshold.** **Ruled by the coordinator: adopt the derived rule** (D2). The owner's
  *"four or five thousand"* is **confirmed by the derivation instead of encoded as a literal**, and the
  boundary moves by itself when a width changes. The witness pair is **3300 / 3299 on wall A at wall B
  1700** — criterion 7 holds the wave to it.
- **QT-4 — the single site.** **Ruled by the coordinator: as stated** (D1, D6). Wall A's free end is
  the only site. In the ~8 % of rooms where the hob lands on wall B, **no tower is planned and the hob
  keeps its oven — and that is correct rather than a gap**: a tower on wall A with the hob on wall B
  puts the oven **round the corner from the cooking position**, which is worse than no tower. A tower
  separated from the hob by one or two storage cabinets **is acceptable**: the owner said *at the
  edges*, not *beside the hob*, and the edge is the rule.
- **QT-5 — the fridge against the corner** (G10). **Ruled by the coordinator: leave it.** In rooms
  where wall B cannot hold the fridge the reading order puts it on wall A **against the corner** — a
  full-height body mid-run, which R2 reads against — but that position is ADR 0110 Amendment A1, the
  owner's own cooking-order ruling. **A1 wins, and the disagreement is recorded rather than resolved
  by side effect:** this wave does not overturn an owner ruling as a consequence of a different one.
  Moving the fridge is a change to A1, with its own question to the owner and its own wave. *A
  conflict written down is a decision; the same conflict discovered later is a defect.* **The wave
  must not move the fridge**, and criterion 12 is what catches it if a slice tries.

### The leftover problem is a separate wave — **7D4, approved 2026-09-14**

At the largest approved room the current output is **eleven identical 600 mm `base-cabinet`s** with an
identical `wall-cabinet` above each (measured at 6300 × 5100: wall A nine modules, of which six are
storage; wall B six, of which five are storage). **A three-column block removes three of them** — the
figure was *one* while the block was thought to be a single column — leaving eight. It is not this
wave's problem, for three reasons: it changes `leftover-rule.ts`, which this wave deliberately reads
and does not touch; it needs an owner ruling this wave does not have — *which* bodies a long run is
composed from, in what proportion and in what order (`base-3drawer`, `base-panbank`,
`base-bottle-cargo`, wider modules); and it would collide file-for-file with S2, so **it cannot run
beside 7D3**. **Approved 2026-09-14 as 7D4 — *a long storage run is composed, not repeated*.** It
depends on 7D3 (the free-end modules are spoken for) and **is still owed the owner ruling above**
before it can be planned. **New full-height body types are not part of it either** — the owner
deferred those to after beta testing (ADR 0110 E12.4, backlog entry 66).

### Verification

Per-package `vitest` for `configurator-domain` and `three-adapter`, `typecheck`, `lint`, and a
whole-tree `pnpm format:check` at the wave's end. **No e2e, no Playwright, no visual capture** — the
wave has no surface. The property suites state their seeds and their per-arm counts in the test names.
The scratch probes that produced G1–G10 are reproducible against the package's built `dist/`; an
implementer who disagrees with a measured figure re-measures it and reports, rather than adjusting the
plan.

## Wave 7D4 — dispatchable punch list: a long run is composed, not repeated

**Tier: Full.** No visual surface — `generateKitchen` still has no production caller; 7F4 wires it.
**Blocked on 7D3, and on two owner answers for its last slice only.** The wave answers the eleven
identical cabinets measured at 6300 × 5100 by changing **which body fills a slot**, never how many
slots there are or how wide they are. It **cannot run beside 7D3** — see D0 for the real reason, which
is not the one recorded when the wave was approved.

**The wall run was taken into scope on 2026-09-14 and ruled back out the same day, and the sequence is
left visible.** The owner ruled the wall level, this plan composed a lift above the sink (D8), and the
owner then **ruled lifts out entirely on cost**. **The wall row's composed output is therefore exactly
what it is today** — `wall-cabinet` above every non-fridge base, `hood` over the hob — and **this wave
changes no production code for it.** D8 is struck in place rather than deleted, because three
narrowings in one day is the record worth keeping.

**Where the record lives.** These are new owner rulings about *what generation composes*, which is
[ADR 0110](../decisions/0110-generation-inserts-through-the-command-path-and-the-corner-is-structural-data.md)'s
subject — Amendment A ruled the layout order, C the uppers and the drop order, E the tall block. They
belong there as **Amendment F, not as a new ADR**, so composition keeps one authority. **Amendment F
is not written.** It is slice S0 and the coordinator asked to be told before an ADR file was touched;
this section is the draft it will be written from, and no other slice may start before it exists and
is reviewed. Where it and this section differ, **the amendment is binding**.

**ADRs to check intent against first, and to stop and report on if they disagree:**
[0110](../decisions/0110-generation-inserts-through-the-command-path-and-the-corner-is-structural-data.md)
Amendment A1 (the reading order and its *interim data*), Amendment C (F3's drop order), Amendment E
(the tall block, R5's cheaper minimum, E10's thermal rule), the 2026-09-12 *Clarification* (storage
yields, then returns);
[0033](../decisions/0033-door-count-is-derived-from-width-not-declared.md) (why there is exactly one
door-front base row);
[0026](../decisions/0026-the-width-floor-has-a-direction.md) (the bottle cargo's proportion is the
product — D2 turns on it);
[0046](../decisions/0046-adjacent-empty-columns-merge-under-a-cap-and-an-insert-splits-its-column.md)
and [0052](../decisions/0052-800-mm-is-the-ceiling-on-any-empty-column.md) (the 800 mm merge, which
is this wave's structural boundary);
[0051](../decisions/0051-the-dishwasher-niche-wears-a-decor-door.md) and
[0059](../decisions/0059-the-dishwasher-niche-declares-a-cabinet-depth-floor.md) (what a generated
dishwasher niche is and costs);
[0107](../decisions/0107-appliances-are-drawn-and-not-sold-and-a-language-is-named-in-its-own-language.md)
(drawn and not sold);
[0102](../decisions/0102-a-recorded-source-must-explain-its-depth-and-a-second-authority-in-a-test-is-the-defect-laundered.md)
(no second authority for a declared size).

### The owner's words, 2026-09-14, and what they rule

> *"drawers are often preffered and in many cases there are multiple drawers cabinets but if there is
> like space for 6 cabinets will be like 3 with drawers and 3 with doors. Clinets with money preffer
> drawers, those that what to spend less doors and this is logic but out goal is to use maximum
> cabonets types possible. the rule that dishasher is afetr sink is right but drawers often ar before
> hob, because during cutting and preparations you take from drawer the knife, spoon, forks and other
> kitchen cutlery"*

| # | Read as a rule | Status against the code |
| --- | --- | --- |
| R1 | **Roughly half drawers, half doors** — their own worked example is six slots giving three and three. | New. Every leftover slot is `base-cabinet` today (`generation-priorities.ts:27`, `:165-172`). |
| R2 | **Maximising the variety of cabinet types is an explicit goal**, stated in as many words. | New, and it is the answer to the eleven, not a decoration on it. `base-3drawer`, `base-panbank`, `base-dishwasher` and `base-bottle-cargo` exist and are never generated. |
| R3 | **The dishwasher is directly adjacent to the sink — either side, and across the corner counts — or it is not placed at all** (owner, 2026-09-14 answering Q-D1 twice, the second answer binding; **and 2026-09-15**: *"yes, should be counted as near the sync"*). ~~after it~~ ~~*"ideally directly near"* rather than necessarily touching~~ | New. No dishwasher is generated today. ~~The word *after* is read in the owner's own order (A1)~~ — the owner refused that premise (*"left or right… not mandatory left"*) and then **upgraded adjacency from a preference to a rule**: *"it should not be near only if is totally missing"*. **The fallback is omission, not displacement.** See D7 and **Q-D1**. |
| R4 | **Drawers go before the hob**, for cutlery reached during cutting and preparation. | A1 already puts a **preparation** cabinet there. This names what that role's body should be — D6. |
| R5 | Richer clients prefer drawers, thriftier ones doors. | **Context, not a rule.** There is no customer budget input and this wave invents none. It is why both classes appear at all, and it is why the price consequence in G9 is recorded rather than hidden. |

### Three further owner statements the same day, and what each changes

**The first softened a rule of this plan's before it could be written as a test.**

> *"scan the before and after the oven and the hob. It's not a rule that it's always only before. But
> in majority of the cases, is before. But if the kitchen is white, you can have and before and after
> also drawers. It's not like a hard rule."*

**R6 — drawers before the hob is a preference, not an invariant.** Before is the majority case and the
default, and the cutlery reason in R4 still explains why. **Drawers after the hob are legitimate**, and
a wide run may carry drawers on **both** sides. The owner says *"it's not like a hard rule"* in as many
words. **This changes D6 and it forbids a criterion** — see D6 and criterion 11. *(The coordinator
reads* **"if the kitchen is white"** *as* **"if the kitchen is wide"**, *given the sentence. **Marked
as the coordinator's reading, not the owner's verbatim intent.** Nothing in this plan rests on it: the
rest of the quotation is unambiguous without it, and the rule below would be identical if the word were
dropped altogether.)*

**This wave's composition already puts drawers after the hob** — wall A's storage follows the hob, and
the cycle's first slot there is a drawer body in half of all rooms (D5's phase). Before R6 that was a
latent contradiction with R4 nobody had noticed. **R6 removes it**, and the arrangement it permits is
one more legitimate shape available to the composer rather than an exception to police.

**The second rules the wall level.**

> *"So related to wall cabinets. It is hard to make a rule. Having open shelves, it's pretty rare,
> especially here in Moldova. I know that it used to be in US, especially, where you have on the wall
> only shelves… here in Moldova people prefer to have closed cabinets. Meaning, very often, there are
> only door cabinets, but time to time, in my particular case, I choose lift cabinets in the middle,
> mostly because it's more convenient to lift them up and to place… because I place the plates on the
> top of the sink. So for me it's easy because I wash and put it on top of the sink in this lift door
> cabinet above the sink… so in majority of the cases, we choose doors. Twenty, thirty percent of the
> cases, it's lifted cabinets. And given less than five percents, we'll have open shelves cabinets.
> The top level, not the middle, but the top level, in majority of the cases are lift cabinets, mainly
> because you lift them from down up… I use on the ceiling the extendable material that is easy to be
> damaged. So having the lift cabinet at the top level includes less risk for them to be damaged,
> because if I would use a door, by opening and closing it, the top corner of the door has a big
> probability to damage the material on the ceiling."*

| # | Read as a rule | Where it lands |
| --- | --- | --- |
| R7 | **The wall level is mostly doors**; lift cabinets are the occasional second type. The owner opens with *"it is hard to make a rule"* and gives **proportions** — roughly 20–30 % lifts, under 5 % open shelves. | D8. **The proportions are guidance, not invariants**, and no criterion asserts a ratio band. |
| R8 | **The lift stands above the sink**, and the reason is a motion rather than a taste: you wash a plate and lift it straight up into the cabinet over the sink. | D8. This is the one lift placement with a reason, and it is the only one this wave generates. |
| R9 | **Open shelves are a regional exception**, not a rule — a US habit, rare in Moldova, under 5 %. | D8: **not generated.** |
| R10 | **The top level is mostly lift cabinets, and the reason is physical**: a stretch ceiling's material damages easily, and a hinged door's top corner is likely to catch it on opening. A lift opens upward and away. | **Recorded, not built** — the top row stays excluded (7D3 D8 / ADR 0110 E11). Handed to the deferred top-row wave at the end of this section. **Unaffected by the withdrawal below:** it is a rule about the *top* row and it survives on its own physical reason. |

> **R7 and R8 are WITHDRAWN by the owner, 2026-09-14, the same day, in two further steps.** They are
> struck at D8 rather than here, because what changed is the ruling, not what the owner said. **R9
> stands** — open shelves are not generated, and now neither is anything else but doors.

**The third gives the bottle cargo a position, against this plan's ruling that it is not generated.**

> *"later to bottle cargo. In majority of the cases, it's on the… it's next on the right of the hob
> and oven or the hob cabinet because you need to take from there the bottle of oil or something like
> this that you use when preparation on the hob. So pretty often, it's after. It can be before, but
> it's often just after the hob."*

**R11 — the bottle cargo stands immediately after the hob, and it is once again a majority case.** The
reason is a motion, like R4's cutlery and R8's plates: you reach for oil while cooking at the hob.
*Before* is acceptable and less common. **It must not become an asserted invariant** — the fourth such
rule in a day (risk 10). *(The coordinator reads* **"later to bottle cargo"** *as* **"as a follow-up on
the bottle cargo"**, *not as* **"defer it"**, *since the rest of the sentence gives a placement rule.
**Marked as the coordinator's reading.** **Nothing in this plan depends on which reading is right** —
D2 recommends recording the rule and building it in a later wave under either one, so the question
need not go back to the owner on this plan's account.)*

**The fourth rules the dishwasher's frequency.**

**Ruled by the owner, 2026-09-14: generate a dishwasher whenever it fits.** Every generated kitchen
with room for one gets one, beside the sink, on the plumbing reason they had already confirmed. **They
were offered *"only in larger kitchens"* and *"never — the customer adds it"* and took neither.**
*(Recorded from the coordinator's relay, **not verbatim**.)* See D7.

**The fifth is a statement of priority, not a rule** — see D10.

> *"to previous question about if the kitchen have… if the wall have only fit the sink and the hob.
> People that don't have space, in majority of the cases, don't have money and prefer the modular
> kitchens like IKEA. People that came to manufacturers to do the custom made kitchens, in majority of
> the cases, they have much more space. And this scenario when they don't have space for all kitchen
> electronics and cabinets, it's very rare."*

### Ground truth — **re-measured 2026-09-15 against 7D3's own build**, not derived

**The first version of this table was measured at `41181d8`, *before* 7D3, with the block's effect
applied arithmetically. 7D3 has since landed — S1 at `03c98dc`, S2 at `97a4913` — so the block is
measurable rather than modelled.** Rows G1, G4–G14 and G17 are unchanged and re-confirmed; **G2 is
confirmed exactly; G3's histogram was wrong in six of its nine buckets and is replaced.**

**The lesson is worth more than the corrected numbers, and it generalises past this table: an
arithmetic model of a rule with a refusal arm under-counts the arm.** The derived histogram applied
`min(3, wall-A leftover)` uniformly, and the real rule **refuses a block outright** where the outermost
column cannot take the remainder (E6.2's `1 → 0` step). **Its total was right and its distribution was
not** — which is exactly why it passed: the model was wrong in a way its own consistency check could
not see. **A row whose figures sum correctly has not been checked; it has been added up.**

Measured by importing a **scratchpad snapshot** of the package's built `dist/`; nothing in the tree was
edited, built or written, and nothing below was taken from an earlier document without re-running it.
Sweeps are the approved L policy on a **10 mm grid at 2600 mm** — wall A 900–6300, wall B 1000–5100 —
giving **222 351 rooms, 211 551 placed**.

| # | Measured | Consequence for this plan |
| --- | --- | --- |
| G1 | **The eleven, re-confirmed.** At 6300 × 5100 × 2600, **before the block**, wall A plans `sink, preparation, hob` then **six** storage (remainder 0) and wall B plans **five** storage then `fridge:700` (remainder 400). Eleven storage slots, every one `base-cabinet:600`. | **Right.** The figure the wave exists for holds at HEAD. |
| G2 | **After 7D3 the same room keeps eight — measured, not derived.** Wall A three cycle slots and a three-column block; wall B five. Composed wall A, corner outward: `base-sink 600, base-cabinet 600, base-hob-2drawer 600, storage ×3 @ 600, tall-oven-tower 600, tall-pantry 600, tall-pantry 600`. | **Right to the module.** **7D4 composes eight slots there, not eleven**, and this wave must not assume otherwise. |
| G3 | **The storage-slot histogram over the whole approved policy, measured after the block**: `0:62 400  1:38 260  2:32 070  3:27 720  4:24 120  5:17 480  6:6 940  7:2 520  8:41`. As a share of the 211 551 placed rooms: **0 slots 29.5 %, 1 slot 18.1 %, ≥ 2 slots 52.4 %.** | **The derived row was wrong in six buckets.** It read `0:64 800  1:37 260  2:31 870  3:27 720  4:24 120  5:17 100  6:6 120  7:2 520  8:41`, over-counting zero-slot rooms by **2 400** and under-counting the 1-, 2-, 5- and 6-slot rooms. **The conclusions survive and that is what makes this instructive rather than alarming**: D9's degradation is still the common case, and the recorded 30.6 / 17.6 / 51.8 becomes **29.5 / 18.1 / 52.4**. |
| G3.1 | **Why the derivation was wrong, so nobody repeats the method.** It applied `min(3, wall-A leftover)` uniformly. The real rule refuses a block where the outermost column cannot take the remainder — **E6.2's `1 → 0` step**, `outermostColumnOf` returning `undefined` in `tall-end-rule.ts`. Those rooms **keep** the storage slot the arithmetic took away. | The 2 400-room error is exactly that arm. **A refusal arm is invisible to arithmetic that only models the success path.** |
| G3.2 | **A block stands in 110 591 of 211 551 placed rooms — 52.3 %**, distributed `1 column: 16 440   2: 24 660   3: 69 491`. | **An open discrepancy, recorded and not resolved here.** 7D3's own measurement, cited by this section's D10, says **a block lands in 58 % of sampled rooms**; the same question measured over the approved policy on a 10 mm grid gives **52.3 %**. **Both figures stand as measured and neither is adjusted.** The likely cause is that the two were taken over **different room populations** — this sweep is uniform over the policy, and 7D3's sampling is not stated here — but **that is unverified**, and it is **7D3's number to reconcile**, not this wave's. **D10's argument is unaffected either way**: a block is still the typical output. |
| G3.3 | **Where the cycle is actually visible.** Wall A keeps **≥ 1** cycle storage slot in **53 751 rooms (25.4 % of placed)**; wall B in 135 831 (64.2 %); **both walls in only 40 431 (19.1 %)**. Wall A's cycle-slot count never exceeds **3**, wall B's never exceeds **5**, and in **95 400 rooms (45.1 %)** every cycle slot in the kitchen is on wall B. | **New, and load-bearing on criterion 8.** In roughly three kitchens in four the whole varied run stands on wall B while wall A carries only the core and the block. The phase-carry criterion has a **19.1 % arm** that splits again by wall B's parity — risk 14 — and the customer-facing half of it is **Q-7D4-1**. |
| G3.4 | **Every witness room in the table below re-measured, and every slot count is exactly as claimed**: 900 × 2200 → 0, 3300 × 1000 → 1, 3300 × 1600 → 2, 5100 × 2900 → 3, 5100 × 3500 → 4, 5100 × 4100 → 5, **5700 × 4100 → 6**, 5700 × 4700 → 7, **6300 × 4700 → 8**. | **The witness table is sound and needs no change but a header fix** — its *Wall A storage* and *Wall B storage* columns are **pre-block** counts, and a reader will take them for composed ones. |
| G3.5 | **Criterion 10's merge witness re-measured: at 2700 × 1699 the single storage slot is on wall B**, at `[900, 1500]`, wall B remainder **98**, no block, fridge dropped. At 2700 × 1700 the fridge is kept and there is no storage slot at all. | **Right as written.** The 98 mm merges into the slot's tile, giving a 698 mm opening a `'fit'` body steps back to 600. |
| G3.6 | **G10's and G17's figures re-measured and exact to the room.** At **1500 × 2800** the plan is `B sink, B preparation, B storage \| A hob` in reading order. G10's three shares: preparation 190 491 (90.0 %), sink 10 800 (5.1 %), wall-B storage 10 260 (4.9 %). G17's: 4.9 % refused; of the placed, 86.6 % full core, 8.3 % fridge only, 5.1 % fridge and preparation. | **G10 and G17 needed no correction of any kind.** |
| G3.7 | **G9's prices re-derived from the book's own formulas at HEAD** (`sample-price-book.ts:68-90`): `base-cabinet` 120 000 + 400/mm + 18 000/leaf = **396 000** at 600 with two leaves; `base-3drawer` 180 000 + 500/mm = **480 000**; `base-panbank` 160 000 + 480/mm = **448 000**; `base-dishwasher` 140 000 + 300/mm = **320 000**. Eight slots: 3 168 000 → **3 440 000 minor, +8.59 %**. | **G9 and D7's cost note are exact.** |
| G3.8 | **D2's *three is every storage body the catalogue can build at 600* re-verified by enumeration.** Every row in `buildKitchenLBodyCatalog` at base height 860 is `base-cabinet`, `base-3drawer`, `base-panbank`, `base-hob-2drawer`, `base-hob-oven`, `base-bottle-cargo`, `base-sink`, `base-dishwasher`. Of those, the **general storage** rows buildable at 600 are exactly **three**. | **Criterion 6's `min(3, slotCount)` is right at HEAD**, and the `3` is a measured property of the catalogue rather than a guess. |
| G3.9 | **G7's width claim is correct at 600 and imprecise below it.** Measured at HEAD: `base-cabinet` `'fit'` **200–800**; `base-3drawer` and `base-panbank` `'fit'` **300–800**; `base-dishwasher` discrete `{450, 600}`; `base-bottle-cargo` discrete `{200, 300}`; `tall-pantry` `'fit'` **400–800**; `wall-lift` `'fit'` **300–800**; `open-shelf` `canFinish: false`. | **The drawer rows are drop-in replacements at every width generation plans, not at every width the catalogue allows** — their floor is 300 against `base-cabinet`'s 200. Harmless today, because `planLeftover` plans only whole 600 mm modules; **it is the constraint a later wave that plans a narrower storage module would break.** State it as a bound, never as equivalence. |
| G3.10 | **Two stale line references in G7, re-read at HEAD** (ADR 0119): `base-dishwasher`'s row is at `catalog.ts:860`, not `:875`; `base-bottle-cargo`'s at `:800`, not `:810`. `CABINETRY_WIDTHS` is declared at `:193` and spread at `:605`; the drawer rows are at `:734` and `:744` as cited; `widestBlockFrom` is at `merge-empty-columns.ts:265` with the inclusive cap at `:278`, as cited. | **The implementer cites what they re-read**, not what this table says. |
| G3.11 | **`MAX_EMPTY_COLUMN_WIDTH_MM` is declared in `src/module-grid.ts`**, not in `merge-empty-columns.ts`; the merge module and `tall-end-rule.ts` both import it from there. | **`src/module-grid.ts` was missing from the must-not-change set**, which named the merge module and stopped one file short of the constant D1's whole safety argument rests on. Added below. |
| G4 | **The 800 mm merge is the wave's structural boundary.** `widestBlockFrom` merges adjacent *empty* columns while the run's running total stays **at or under** `MAX_EMPTY_COLUMN_WIDTH_MM` = 800 (`merge-empty-columns.ts:265-283`), and it runs over the shell's tiles **before any body is inserted**. `600 + 600 = 1200` never merges; `450 + 300 = 750` does, and so does `200 + 600 = 800` — the cap is inclusive. | **Width variety is not free and type variety is.** A plan that mixed 450 and 300 mm tiles would hand `plannedVoid` an opening it cannot match (G6) and hand `insert-fit` a discrete body it would centre with slivers (G5). D1 is derived from this row. |
| G5 | A discrete-width body dropped into a wider opening is built at **the widest listed size that fits, centred** (`insert-fit.ts`, `resolveFixedSetWidth`); a `'fit'` body takes the opening exactly (`resolveFitWidth`). | The only safe non-600 body is one whose set contains the tile's own width. |
| G6 | `plannedVoid` matches an opening by **exact `startMm`** and `end ≥ planned end`, and throws otherwise (`generate-kitchen.ts:503-527`). | A merge that moves a tile boundary is a throw, not a cosmetic defect. |
| G7 | **Widths of the four candidate rows.** `base-3drawer` and `base-panbank` are plain `baseCabinet(…)`, so `widthFlex: 'fit'` over `CABINETRY_WIDTHS` (`catalog.ts:599`, `:605`, rows at `:734`, `:744`). `base-dishwasher` is discrete `{450, 600}` (`:229`, `:875`). `base-bottle-cargo` is discrete `{200, 300}` (`:210`, `:810`). | Two drawer rows are **exact drop-in replacements** for `base-cabinet` at any planned width; the dishwasher fits a 600 tile exactly; the bottle cargo fits no tile this generator plans. |
| G8 | **All four are priced and all four are in the generator's catalogue.** `sample-price-book.ts:77, 85, 109, 122`; `buildKitchenLBodyCatalog` spreads every insertable row (`fixtures/kitchen-l-design.ts:874-877`). | **No catalogue change and no price-book change is in scope or authorised.** |
| G9 | **What variety costs, computed from the sample book's own formulas** (`sample-price-book.ts:67-90`; not run through the pricing engine). At 600 mm: `base-cabinet` 396 000 minor (two leaves), `base-panbank` 448 000, `base-3drawer` 480 000. The eight slots of G2 go from 3 168 000 to **3 440 000 minor, +8.6 %**. | R5 made visible: the owner's variety goal costs money, and the figure belongs in Amendment F so the choice is a knowing one. |
| G10 | **What stands immediately before the hob in the reading order**, over the same sweep of 211 551 placed rooms: the **preparation cabinet in 190 491 (90.0 %)**, the **sink in 10 800 (5.1 %)** where preparation was dropped, and a **wall-B storage slot in 10 260 (4.9 %)**. Witness for the third: **1500 × 2800**, which plans `B sink, B preparation, B storage | A hob`. | R4 is a rule about the **preparation role**, and D6 says so. The 4.9 % is a pre-existing consequence of A1's cut, raised as **Q-D3** rather than patched here. |
| G11 | `generatedRequiredWidthMm` reads **only** the `sink` and `hob` rows and throws unless each is `required: true` (`room-policy.ts:121-134`). | A new `required: false` row in `GENERATION_PRIORITIES` cannot move the room minimum. Criterion 12 holds it there. |
| G12 | Wall B's spatial array is `[storage…, reverse(reading prefix)]` placed from the corner outward (`generation-priorities.ts:127-138`), so **wall B's storage stands at the corner end** and its reading order is the reverse of its spatial order. Wall A's storage stands at the free end and reads in spatial order. | D5's sequence definition is this row stated once, and it is the wave's most likely off-by-one. |
| G13 | **An upper's opening is its own base's column, so the wall row carries no merge hazard of its own.** `insertUpper` looks for a void at `WALL_ROW_Y0_MM` spanning exactly the placed base's extent (`generate-kitchen.ts:406-414`), and the floor tiles are full-height columns, so the opening above a base is that base's width by construction. | **A wall-row substitution is width-neutral in the same way the base-row one is** — D8 needs no geometry of its own. |
| G14 | `wall-lift` is a plain `wallCabinet(…)`: `widthFlex: 'fit'` over `CABINETRY_WIDTHS`, `heightFlex: true`, one full-face leaf on the band's own hinges (`catalog.ts:625-657`, row at `:910`). It is priced (`sample-price-book.ts:146-153`) and it is in `buildKitchenLBodyCatalog`. **It has never been generated.** | **An exact drop-in for `wall-cabinet` at any opening**, and no catalogue or price-book change is needed. |
| G15 | **WITHDRAWN AS A CONSEQUENCE, KEPT AS A FACT (D8):** it describes a rule the owner ruled out the same day. **What one lift above the sink actually produced**, over the same 10 mm sweep, counting middle-level door-or-lift cabinets after 7D3's block removes the columns' uppers: **833 130 cabinets in 211 551 kitchens, of which 211 551 are lifts — 25.4 % by total count.** Mean per-room share 33.7 % (inflated by kitchens with one or two uppers); in the 49 901 kitchens with six or more middle-level cabinets it falls to **15.1 %**. | **The owner's 20–30 % arrives as a consequence of R8's placement, with no percentage anywhere in the code** — which is exactly the shape R7 asks for. The 15.1 % in long runs is the one place it falls below the band, and it is **Q-D5**. |
| G16 | **WITHDRAWN AS A CONSEQUENCE, KEPT AS A FACT (D8).** **At 600 mm × 700 mm, computed from the sample book's own formulas** (`sample-price-book.ts:134-163`): `wall-cabinet` 297 000 minor (two leaves), `wall-lift` 350 000, `open-shelf` 190 000. | One lift per kitchen costs **+53 000 minor**. Recorded for the same reason G9 is. |
| G17 | **The thin-kitchen band, measured, because the owner's *"very rare"* is an impression and this is a count.** Of 222 351 swept rooms: 10 800 (4.9 %) are refused outright; of the 211 551 placed, **86.6 % keep the full core**, 8.3 % drop only the fridge, and **5.1 % (10 800) drop both the fridge and the preparation cabinet** — the sink-and-hob-only kitchen, every one of which also has zero storage slots. | **The measurement agrees with the owner**, and the real share is lower still: a uniform sweep weights a 900 × 1000 room the same as a 6300 × 5100 one, while their customers are self-selected for space. D10 and risk 10. |

**Witness rooms, measured, for every slot count this wave can produce** (wall A × wall B at 2600 mm;
*slots* counts what remains after 7D3's block):

| Slots | Room | Wall A storage *(before the block)* | Wall B storage | 7D3 block |
| --- | --- | --- | --- | --- |
| 0 | 900 × 2200 | 0 | 0 | 0 |
| 1 | 3300 × 1000 | 1 | 0 | 0 (fridge dropped) |
| 2 | 3300 × 1600 | 1 | 1 | 0 (fridge dropped) |
| 3 | 5100 × 2900 | 4 | 2 | 3 |
| 4 | 5100 × 3500 | 4 | 3 | 3 |
| 5 | 5100 × 4100 | 4 | 4 | 3 |
| **6 — the owner's own example** | **5700 × 4100** | 5 | 4 | 3 |
| 7 | 5700 × 4700 | 5 | 5 | 3 |
| 8 — the maximum | 6300 × 4700 | 6 | 5 | 3 |

### Twelve rulings

**Read first — ADR 0117 and this wave's criterion 3, related here rather than left for a reviewer to
collide with.** ADR 0117 decision 4 forbids, in as many words, that *"no criterion may assert a ratio,
a share or a frequency band"*. **Criterion 3 asserts a balance, and a balance is a ratio.** They do not
conflict, and the reason is inside 0117 itself:

- 0117's §*Where the boundary is genuinely unclear* **#1** names this exact pair — the owner's *"3 with
  drawers and 3 with doors"* and their 20–30 % lift band — calls them *"formally identical"*, and
  records that **the first is being built as wave 7D4 at a measured +8.6 %** and the second is not. The
  discriminator it offers is **not cost**: R1 is a property the owner wants every baseline to have, and
  the lift is a per-kitchen judgement they said they would make by eye.
- 0117 §**#3** goes further: a reader who cites decision 2 (*the cheaper composition is correct*) to
  argue 7D4 away **is reading it wrong**, because the owner ruled the variety.
- 0117 decision 8: *"No 7D3, 7D4 or 7D5 criterion changes on its strength."*

**So the rule is: a criterion may assert a proportion that is a consequence of a composition the owner
ruled; it may not assert a proportion observed in the owner's practice.** Criterion 3 is the first kind
— there is no ratio constant in the code and *half* falls out of the cycle's shape (D3). Criterion 21's
refusal to assert a lift band is the second. **A reviewer who flags criterion 3 against 0117 decision 4
has found this paragraph, not a defect.** *(Source-verified against ADR 0117 at `f898b87`.)*

**ADR 0120 checked and compatible.** Decision 1 — *the room is a fact* — is untouched: this wave
changes body identity and never a dimension, so nothing it composes needs a wall the customer did not
enter. Decision 2 — *coverage is negotiable where dimensions are not* — is what D9 is an instance of.

**ADR 0118 applied to this plan's own content.** D4 rules what happens *if* variety and balance ever
conflict, for a catalogue that does not exist until backlog 66. That is a problem which has not
occurred, **recorded with its trigger and not built for**, which is 0118's own shape. **No slice may
contain machinery for a fourth storage body**; criterion 6's `min(3, …)` is expected to go red when one
arrives, and **that redness is the notification.**

**D0 — the dependency on 7D3 holds, and the reason recorded when 7D4 was approved is wrong.** That
paragraph says 7D4 *"changes `leftover-rule.ts`, which this wave deliberately reads and does not
touch"*. **Measured against the module, it does not have to.** `leftover-rule.ts` is a pure
`freeEndMm → {storageCount, remainderMm}` function; this wave changes **which body fills a slot**, not
how many slots exist, so the file is **read-only here too** and criterion 14 asserts it byte-identical.
The dependency is real for two other reasons, and they are stronger:

1. **File collision is certain.** 7D4 rewrites `storagePriorities` and the spatial layout in
   `generation-priorities.ts` and touches both `plan.bases` passes in `generate-kitchen.ts` — the two
   files 7D3's S2 rewrites. Two waves cannot share them (`docs/WORKFLOW.md`; the pre-commit hook
   re-adds whole files).
2. **7D3 spends the free-end modules first.** The block claims `min(3, wall-A leftover)` modules
   before any of this wave's arithmetic runs (G2). Composed before 7D3, wall A's cycle would be
   computed over slots the block then takes away, and every measured figure in G3 and the witness
   table would be wrong.

**Re-judged 2026-09-15, after 7D3 landed: the dependency holds, and both reasons are now measured
rather than argued.**

1. **File collision was not a forecast — it was the tree's own state.** While 7D4 was being planned,
   `generation-priorities.ts` and `generate-kitchen.ts` stood **modified and uncommitted** and
   `tall-end-rule.ts` **untracked**: 7D3's S2 was in the working tree and not in git. It is now
   committed at **`97a4913`** (S1 at `03c98dc`). **7D4's S1 may not start on a tree that is not
   clean**, and the reason is the pre-commit hook re-adding whole files, not politeness.
2. **The block spends the free-end modules first, and the figure is now measured.** At 6300 × 5100 the
   sequence 7D4 composes is **eight slots, not eleven**; over the whole policy the block stands in
   **52.3 %** of placed rooms and wall A keeps a cycle slot in only **25.4 %** (G2, G3.2, G3.3).
   Composed before 7D3, wall A's phase would have been computed over modules the block then takes
   away, and **every figure in G3 and every row of the witness table would be wrong.**
3. **D0's correction of the approval note is confirmed at HEAD.** `leftover-rule.ts` is a pure
   `freeEndMm → {storageCount, remainderMm}` function, it was **unmodified through the whole of 7D3**,
   and this wave does not have to touch it. Criterion 14 asserts it byte-identical.

**The ground truth above is no longer derived.** G2 and G3 are measured against 7D3's own build; where
the arithmetic was right that is now confirmed rather than assumed, and where it was wrong — G3's
distribution — it is replaced.

**D1 — this wave changes a body's identity and never its width.** Every planned width, every slot
count, every remainder, the surviving core and the wall cut stay exactly what 7D2 and 7D3 produce.
Only `buildId` changes, and only on storage slots and on the preparation slot (the dishwasher of D7 is
the single, isolated exception, and it is the last slice for that reason). The rule that follows:
**every generated base module stays on the 600 mm grid**, and **a body that cannot be built at its
planned tile width is not generated.**

This is derived from G4–G6 and not from taste. Varying widths would break the generator in three
places at once: adjacent tiles summing to 800 or less merge before any insert, so the plan's tile
boundaries stop existing; `plannedVoid` then throws on an exact-start lookup; and a discrete body that
did find its opening would be centred in it with a sliver at each side, which is the same hazard
7D3 spent D3 on, moved from the run's end into its middle where no absorb can reach it. **Refused
alternatives:** *mixing 450 and 300 mm modules to vary the rhythm* (backlog 2's option B is a
**customer-facing re-split** and is not this wave); *letting the cycle pick a width as well as a body*
(two variables, one of which the engine forbids).

**D2 — which bodies are in, which are out, and why.** There are exactly two classes, because the
owner named two.

- **Door-front storage: `base-cabinet`, and it is the only one.** ADR 0033 merged `base-1door` and
  `base-2door` into one row whose door count follows its width, so the catalogue has a single
  door-front base body by decision. This is why R2's *maximum types* cannot be answered inside the
  door half.
- **Drawer-front storage: `base-3drawer` and `base-panbank`.** Both are plain `baseCabinet(…)`, both
  `'fit'`, both drop into a 600 mm tile at 600 mm (G7). Three drawers and two deep pan drawers are two
  genuinely different products, which is R2 satisfied with the catalogue as it stands.
- **`base-bottle-cargo` is not generated *in this wave*, and the reason has changed** — see **D2.2**,
  which re-opens it on the owner's R11 and answers it with arithmetic rather than with the first
  ruling's geometry.
- **`base-dishwasher` is generated, but as an appliance niche placed by a rule of its own (D7), not as
  a storage slot.** It is excluded from the balance count and from the cycle.
- **The wall row is untouched** — D8.

**D2.2 — the bottle cargo, re-examined on the owner's R11, and it is *buildable*. The first ruling's
geometry was half right and the half that was wrong is the half that mattered.** This plan first said
the cargo *"fits no tile this generator plans"* and that *"a 200 or 300 mm tile would merge with its
neighbour"*. **Measured against the shell and the real merge, that is false for 300 and true for 200.**

**The arithmetic, measured** (probe against `buildLShellDesign` + `deriveColumns`, wall A 5100, wall B
1700; each row is the derived floor columns for a planned run):

| Planned wall A | Derived columns | Verdict |
| --- | --- | --- |
| `600, 600, 600, 300, 600, 600` — **a 300 cargo after the hob** | `…600, 600, 600, **300**, 600, 600, 800, 100` | **Survives.** `600 + 300 = 900 > 800`, so neither neighbour can take it. The planned boundary is intact and `plannedVoid` finds a 300 mm opening. |
| `600, 600, 600, 200, 600, 600` — a 200 cargo after the hob | `…600, 600, **800**, 600, 600, 800, 200` | **Destroyed.** `600 + 200 = 800` and the cap is **inclusive**, so the hob's tile swallows it; the plan's boundary no longer exists and `plannedVoid` throws. |
| `600, 600, 600, 300, 300, 600` — two cargos adjacent | `…600, 600, 600, **600**, 600, 800, 400` | **Destroyed.** `300 + 300 = 600 ≤ 800`; the pair merges into one 600 and the run is re-tiled. |
| `600, 600, 600, 600, 300` — a 300 cargo at the free end | `…600, **300**, 800, 700` | **Survives here, conditionally** — only because the leftover tile beside it is 800. A remainder of 500 or less would merge with it. |

**The general rule, and it is the thing to carry: a 300 mm bottle cargo survives if and only if both
its neighbours are at least 500 mm wide.** 200 mm never survives beside a 600, and two cargos may
never touch. **The owner's *immediately after the hob* is a witness of that rule, not the rule itself**
— written in this order deliberately, because a reader who has only the placement will one day widen it
and the arithmetic is what must stop them.

**The convergence is worth naming rather than leaving as a coincidence: the owner's ergonomic rule and
the engine's merge cap independently select the same slot.** They reach it from unrelated premises —
*you reach for oil while cooking at the hob*, and `600 + 300 = 900 > 800` clears the cap where
`600 + 200 = 800` does not. **Neither was derived from the other**, and this plan's first ruling
asserted the opposite on geometry alone and was **half wrong**: the cargo does fit a tile this
generator can plan, at 300 and nowhere else. **Two independent authorities agreeing on one slot is the
strongest form this rule can take**, and it is why the position must not be generalised away from
*"both neighbours ≥ 500 mm"* by anyone who remembers only the hob.

**What it costs, and why it is still not in 7D4.** A cargo is a **width** change, and a worse-behaved
one than the dishwasher's:

- It consumes 300 mm, so the free end becomes `free − 300`: the slot count drops by one where the old
  remainder was under 300, and **every** room's remainder moves to `(r + 300) mod 600`.
- That shifts essentially every room **into or out of 7D3's `(0, 200]` absorb window** (its D3 / D3.2),
  which is the one hazard 7D3 spent a whole ruling on. The dishwasher's 600 preserves the residue
  class; a 300 changes it for the whole policy.
- It therefore breaks criterion 2 — this wave's strongest invariant — and re-baselines 7D3's measured
  figures a second time.

**Ruling: the cargo is recorded, not built here, and it is recommended into 7D5 with the dishwasher**
(**D11**). The other two reasons from the first ruling still stand and go into Amendment F with it:
`catalog.ts:205-209` records that the cargo's exact member set is **not established** (backlog 2), and
`sample-price-book.ts:109` records that its hardware is **knowingly under-priced** — so generating one
puts an unestablished width and an admitted price gap into every kitchen that gets one. **Neither is a
reason to lose the owner's rule**, and R11 is written into the record so the placement is findable by
whoever builds it.

**D3 — the balance rule: one alternating cycle, and the owner's three-and-three falls out of it.** The
kitchen's storage slots form **one ordered sequence** (D5). Slot *i* takes `STORAGE_CYCLE[i mod 4]`,
where the cycle is:

```
[ base-3drawer , base-cabinet , base-panbank , base-cabinet ]
```

| Slots | Composition | Drawer : door |
| --- | --- | --- |
| 1 | `3drawer` | 1 : 0 |
| 2 | `3drawer, cabinet` | 1 : 1 |
| 3 | `3drawer, cabinet, panbank` | 2 : 1 |
| 4 | `3drawer, cabinet, panbank, cabinet` | 2 : 2 |
| **6** | `3drawer, cabinet, panbank, cabinet, 3drawer, cabinet` | **3 : 3 — the owner's own example, derived** |
| 8 | the above + `panbank, cabinet` | 4 : 4 |

What the shape buys, and each of these is a criterion rather than a claim:

- **At every even count the split is exactly half and half**, and at every odd count **drawers carry
  the extra** — index 0 is a drawer, because the owner says drawers are the preferred option.
- **No two adjacent slots carry the same body**, which is the eleven-identical defect stated as an
  invariant. It survives wall B's reversal (G12), because reversing an alternating sequence leaves it
  alternating.
- **The number of distinct storage bodies is `min(3, slotCount)`** — maximum variety at every length,
  and three is every storage body the catalogue can build at 600.
- **There is no ratio constant anywhere.** "Half" is a consequence of the cycle's shape, so a future
  drawer row extends the cycle and the balance follows without a number being edited. **Refused:**
  computing a count as `floor(n / 2)` and then distributing it — two authorities for one fact, and the
  distribution step is where a run of identical cabinets comes back.

**D4 — maximum variety and half-and-half cannot conflict in this catalogue, and if they ever do,
balance governs.** The two goals operate at different levels: balance partitions the slots into two
**classes**, variety chooses **inside** a class. With one door body and two drawer bodies the 4-cycle
reaches every available type while holding an exact 50 : 50, so the conflict the coordinator asked
about **does not exist at HEAD** — that is the honest answer, and it is measurable rather than
philosophical. Stated for the catalogue that will exist after backlog 66: **balance governs and
variety is maximised subject to it**, because the balance is the one thing the owner put a number on
and the variety is a goal they stated without one.

**D5 — the ratio is per kitchen, not per wall, and the sequence is the reading order.** One cycle,
advanced along ADR 0110 A1's reading order, **continuously across the corner**. Concretely, the
storage sequence is:

1. **wall B's storage, from its free end toward the corner** — the reverse of wall B's spatial array
   (G12);
2. then **wall A's storage, from the corner toward its free end** — wall A's spatial array as it
   stands.

**Why per kitchen.** The owner's number is a claim about a kitchen (*"if there is like space for 6
cabinets"*), not about an engineering wall split the customer never sees; 7D3's field evidence records
that **the corner is always continuous worktop**, so the L is one run that turns rather than two runs;
and a per-wall restart gives three-and-three slots a 4 : 2 drawer majority, which contradicts R1 in the
owner's own example. **Refused: restarting the cycle on each wall.** Its one real advantage is stated
rather than hidden — it would make the body standing beside the hob deterministic.

**Which *end* the sequence starts from is a separate question from its shape, and it is open —
`Q-7D4-1`, put to the owner 2026-09-15.** This ruling starts it at **wall B's free end**, so sequence
index 0 stands beside the fridge. Measured consequences: a drawer body stands **next to the fridge in
48.0 %** of placed rooms, and **in 45.1 % every cycle slot in the kitchen is on wall B** while wall A
carries only the core and the block (G3.3). **The plan is built on this default and no slice waits for
the answer.** The alternative — starting at wall A's free end, so the first drawer lands nearest the
hob — **costs one line at the leaf's caller and a new pair of phase witnesses for criterion 8, and it
is cheap only until the criteria harden.** That is why the question is asked before S2 rather than
after, and it is the only reason it is asked at all.

**The accepted awkward boundary, stated rather than discovered later: wall A's phase is set by wall
B's storage count.** Wall B storage even → wall A's first storage slot is a drawer body; odd → a door
body. So lengthening wall B can change which body stands nearest the hob on wall A. This is inherent
in any deterministic pattern over a single sequence, it is invisible within one kitchen, and criterion
8 asserts it **by name** so it is never mistaken for a defect. Witness pair, measured: **5700 × 4100**
(wall B storage 4, even) and **5100 × 4700** (wall B storage 5, odd).

**Per-wall deviation is bounded.** A wall holding *m* of the sequence's slots takes `⌈m/2⌉` or `⌊m/2⌋`
drawer bodies, so **no wall is ever off half by more than one body** — criterion 5.

**D6 — the preparation cabinet is a drawer cabinet. It is a *default*, not an invariant, and the
difference is the whole of this ruling** (R4, narrowed by **R6**). ADR 0110 A1 already places a
preparation cabinet between the sink and the hob, for the owner's own cooking-order reason. R4 names
what that role's **body** should be: the cutlery reached during cutting and preparation lives in
drawers, and it has to be within reach of the preparation surface. So `GENERATION_PRIORITIES`'
preparation row changes `buildId` from `base-cabinet` to `base-3drawer`.

**What R6 forbids, and it is a criterion this plan had drafted and has removed.** The owner ruled the
same day that before is the *majority* case and *"not like a hard rule"*, that drawers after the hob
are legitimate, and that a wide run may carry drawers on **both** sides. So:

- **Permission and preference are separated.** *Preference:* where only one drawer bank fits, it goes
  **before** the hob — which is what the preparation role already is, so the default costs nothing.
  *Permission:* a drawer body standing **after** the hob is correct, expected, and must not fail a
  test.
- **No criterion asserts "no drawer after the hob".** One was drafted here and is deleted, not
  weakened. It would have turned the owner's own majority-case phrasing into a hard constraint and
  rejected an arrangement they had just called normal. Criterion 11 asserts the preparation **role's**
  body and says nothing about what stands after the hob.
- **This wave already generates drawers after the hob, and that is now known to be right.** Wall A's
  storage follows the hob, and D5's phase puts a drawer body in wall A's first storage slot in half of
  all rooms. Before R6 this was a latent contradiction with R4 that nobody had spotted; R6 resolves it
  in favour of what the composer was going to do anyway.

**This adds no stage, and adding one would be the defect.** The role's width (600), its position, its
`required: false` and its place in the drop order are all unchanged, and both bodies are `'fit'`, so
the change is width-neutral in exactly the way 7D3's hob substitution was (that wave's G1). A1 calls
its own body list *interim data*; this amends the data, not the order. **Must not:** a new "drawers"
role inserted before the hob. A1 names one cabinet there and the owner named what it should be.

**In 90.0 % of placed rooms the preparation cabinet is what stands immediately before the hob** (G10).
In 5.1 % it was dropped and the sink stands there — nothing to do, the kitchen is below the size the
rule describes. In **4.9 %** a wall-B storage slot stands there, because the cut put the hob alone on
wall A (witness **1500 × 2800**). **This wave does not add a rule for that 4.9 %** — see **Q-D3**.

**D7 — the dishwasher is a new optional core role, immediately after the sink.**

> **MOVED TO WAVE 7D5 by D11, 2026-09-14. Nothing here is built by 7D4.** The rulings below are the
> owner's and are recorded where they were worked out; the wave that builds them is 7D5, with the
> bottle cargo (D2.2), for the reason D11 gives. ~~**Q-D1 — which side of the sink — is deliberately
> left open and travels with it**~~ — **Q-D1 was answered by the owner on 2026-09-14: either side, and
> ~~adjacency is a preference rather than an invariant~~ **and — on their second answer the same day,
> which binds — adjacency is a RULE: the dishwasher abuts the sink or is dropped.** The answer travels
> to 7D5 with the rest.

- **It is core, not storage.** Plumbing is the reason it must be *beside* the sink — it drains into
  the sink's waste and takes the sink's supply, so the two carcasses have to abut — and storage stands
  only at a run's ends, which is nowhere near the sink in most rooms. So it enters
  `GENERATION_PRIORITIES` as a role, not the cycle.
- ~~**Which side: after the sink, in the owner's own order.** A1's order reads fridge → sink → hob left
  to right; the owner said *"dishasher is afetr sink"* in that vocabulary, so *after* is read there
  rather than reinterpreted. The order becomes **fridge → sink → dishwasher → preparation → hob**.~~
  **SUPERSEDED by the owner, 2026-09-14 (Q-D1): *"dishwasher can be on left or right of the sink not
  mandatory left. Ideally directly near"*.** Either side is valid, adjacency is a **preference and not
  an invariant**, and the planner chooses by fit. `fridge → sink → dishwasher → preparation → hob`
  remains a **permitted** layout — it is no longer *the* layout, and nothing may assert it.
- **Three things that fall out of it for free, and none of them is the reason it was chosen.** The
  sink stands between the fridge and the dishwasher, so a dishwasher's heat is never against a fridge
  (ADR 0110 E10's thermal reason names the oven and is **not** extended here by side effect); the
  preparation cabinet stays immediately before the hob, so D6 is untouched; and the sink-to-hob
  preparation surface A1 asks for is unbroken.
- **The alternative, and why it is recorded rather than taken:** the sink's far side, between the
  fridge and the sink. The ergonomic case for it is real — a dishwasher door drops into the floor in
  front of it, and on the cooking side that is where the cook stands. It loses on two counts: it is
  not the owner's word, and it puts the machine against the fridge.
- **Data:** `base-dishwasher`, 600 mm, `required: false`. Its set is `{450, 600}`, so a 600 mm tile
  resolves to 600 exactly and the 450 slimline is never generated (G5, G7).
- **Drop order: storage, then dishwasher, then fridge, then preparation; sink and hob never.** This
  **does not overturn Amendment C's F3** — F3's relative order is preserved exactly and the new role is
  inserted ahead of it. It is still an owner ruling to record, because F3 was answered by the owner.
  **Q-D2.**
- **Frequency: OWNER-RULED 2026-09-14 — generate it whenever it fits.** This plan had proposed exactly
  that and the owner confirmed it directly, having been offered *"only in larger kitchens"* and
  *"never — the customer adds it"* and taken neither. **No new threshold:** the existing attempt ladder
  (`generation-priorities.ts:67-73`) drops roles in order until a cut fits, so *"whenever it fits"* is
  what that ladder already computes.
- **The ladder position: OWNER-RULED 2026-09-14, and it confirms the inference this plan had marked as
  one.** Q-D2 is **closed**; it is no longer inferred.

  > *"For example, in my kitchen, I have only three thousand seven hundred millimeters wide kitchen.
  > And if I would choose to have a dishwasher, I will miss the cabinet with drawers. And for me, it
  > was more important to have cabinet with drawers than have a dishwasher. It should be default option
  > for kitchens that have space… I was not able to have an L shape kitchen, only a linear one. That's
  > why I didn't have space to place dishwasher because I had the fridge and after that the sink, the
  > cabinet drawers, the hob, and the tall cabinet that covers the thermal system of entire house… But
  > in majority of the cases, it should be. So especially when there is place, we need to take care to
  > put a dishwasher. But if to choose between a dishwasher and a cabinet with drawers, cabinet with
  > drawers have higher priority."*

  **The ruled relation is *drawers beat the dishwasher*.** Where it lands in the ladder is the
  coordinator's, and it lands here: **leftover storage, then the dishwasher, then the fridge, then the
  preparation cabinet; sink and hob never.** Three grounds, and the first is the owner's own witness:

  1. **Their 3700 mm kitchen kept the fridge and gave up the dishwasher.** It held *fridge, sink,
     drawers, hob, tall cabinet* — so the dishwasher ranks **below the fridge** as well as below the
     drawers, by their own example. That fixes it beneath both, which leaves exactly one slot in F3's
     order.
  2. **It does not disturb Amendment C's F3** (storage → fridge → preparation). The new member is
     inserted between storage and the fridge; every relative order the owner previously ruled is
     preserved, which is what stops this from silently overturning F3.
  3. **The drawers relation is then satisfied *a fortiori*.** The preparation cabinet is a **core** role
     and the dishwasher yields before any core role does, so a run can never trade the preparation
     drawer for a dishwasher. **It is the thing a kitchen gives up last**, which is the same cabinet D6
     made a drawer body — the two rulings reinforce rather than complicate each other.

  **One honest wrinkle, stated rather than smoothed over.** Because the dishwasher is placed from
  **leftover** capacity, it takes a 600 mm module that the storage cycle would otherwise have filled —
  and under D3 roughly half of those are drawer bodies. So in an L with leftover, the trade *can* be a
  dishwasher against one storage drawer slot. **The owner's example is not that case**: their run was
  linear and full, with no leftover at all, so what they gave up was the **preparation** drawer. The
  rule is ranked against the cabinet they actually named, and the leftover-slot trade is the price of
  *"default where there is space"* — a dishwasher that could never take a leftover module could never
  be placed at all, since the core is fixed.
- **It sits outside the cycle, like the sink and the hob.** It is a core role with declared data, so it
  is not a storage slot and is not counted in D3's balance or D6's variety. What it does is consume one
  600 mm module from the leftover, so **the kitchen has one fewer storage slot** and the cycle is one
  shorter. D1's grid rule holds — it lands on an existing 600 mm module and moves no boundary — but the
  *run's arithmetic* changes, which is the whole of the next bullet.
- **The cost, recorded beside R5 so the two are not read as contradictory.** A dishwasher niche is a
  real line item: 320 000 minor at 600 mm (`sample-price-book.ts:122-129`), and this ruling makes
  **every fitting kitchen more expensive**. That is the owner's deliberate choice. It does **not**
  contradict 7D3's R5 (*prefer the cheaper minimum*) or D9's scoping of it: **R5 is a principle about a
  kitchen that is already tight, and this is a dated ruling about a specific body in a kitchen that has
  room.** A later ruling on a named body beats an earlier general principle, and the owner was offered
  the cheaper option explicitly and declined it — so this is settled rather than merely unexamined.
- **What it costs, and it is not small.** It consumes 600 mm of the run, so 7D3's D2.2 block table
  moves by exactly one module and the wall cut changes at each boundary. **7D3's criterion 12
  (*degradation is untouched*, asserted against 7D2's planner) will fail by design once this slice
  lands.** It must be **restated against 7D4's own planner and the restatement recorded in Amendment
  F** — not edited quietly, which is the shape of defect `docs/WORKFLOW.md` calls an edited assertion.
- ~~**Refused: giving the dishwasher its own wave, 7D5.**~~ **REVERSED 2026-09-14, the same day, by
  the arrival of a second width-changing body** (D2.2's cargo). The original reason — one file, one
  freeze cycle — was right when the dishwasher was the only such body and is wrong now. **See D11**,
  which recommends both into 7D5.

**D8 — the wall row composes exactly what it composes today: doors throughout, and the hood over the
hob as a separate body. No lift is generated anywhere.** *(Owner-ruled 2026-09-14. **This ruling
replaced two earlier ones on the same day** and the superseded text is struck below, not deleted.)*

**The rule, and it needs no production code:** every middle-level upper is a `wall-cabinet`, the hood
stands over the hob, nothing stands over the fridge or over a full-height column (7D3 D5), and
**neither `wall-lift` nor `open-shelf` is ever generated**. That **is** the shipped behaviour, so
**7D4's only obligation to the wall row is to assert it** — criterion 21.

**The sequence, recorded honestly, because it narrowed three times in one day and each step was the
owner's own.**

1. **First they described the wall level with proportions** — doors the majority, lifts 20–30 %, open
   shelves under 5 % (R7) — and gave a *placement reason* for a lift above the sink (R8). This plan
   composed one lift there and refused to derive anything from the percentages.
2. **Then, asked whether 20–30 % was observed**, they answered: *"20-30% was a rough impression, not
   measured, clear statistic, maybe you can search the Internet. is just my impression. my guess, I
   guess like this."* **So the band was never a measurement**, and nothing was ever a target.
3. **Then, unprompted, they priced it and ruled it out:** *"and lift is above the hob. And under it, in
   that cabinet, is the… how it's named. under it is incorporated hood. lift mechanism are very
   expensive. So for sure the default will be the doors."* Offered a lift only at the hood, no lifts at
   all, or lifts at both hob and sink, **they chose no lifts at all.**

**None of the three contradicts the others, and the fourth step explains all of them.** The owner
later stated where the lift really belongs — *"I will add it, and we'll save it as a preset"* — which
is the **division of labour recorded at the end of this section**. **Read through that principle this
is not a reversal at all**: the lift was always a judgement call, and judgement calls enter through
presets rather than through generation rules. A description became an admitted impression became a
priced decision — the same cost principle that rules the corner mechanism (*"those mechanisms are very
expensive"*) and that 7D3 recorded as R5. **The narrowing is the owner thinking, not the owner
changing their mind**, and a reader who sees only the last step will not understand why `wall-lift`
appears nowhere in a plan that discusses it at length.

**What survives the withdrawal, and it is worth keeping.**

- **R9 stands:** `open-shelf` is never generated. R9 makes it a regional exception at under 5 %, which is below
   the level at which a generated default serves anybody, and a customer who wants one adds it in the
   editor in one action. The coordinator's recommendation and this plan agree. Two further reasons on
   the record: it is a **different product** rather than a variant — no front at all, `canFinish:
   false`, and it follows the kitchen's colour with no control of its own (`catalog.ts:925-947`) — and
  putting open storage into every kitchen by default is a taste decision made on the customer's
  behalf. **It is the one wall-row exclusion this wave still asserts** (criterion 21).
- **The refusal to derive a rule from a percentage was right, and Q-D5 proves it twice over.** The
  question asked whether a long run should carry a second lift; the answer turned out to be that
  **neither the band nor the placement survived.** A ratio criterion would have encoded an admitted
  guess as a contract, and a second lift would have been derived from a rule that no longer exists.
- **The measurements are withdrawn as consequences and kept as facts** (G15, G16): **25.4 % lifts by
  total count and 15.1 % in kitchens with six or more middle-level cabinets** described **a rule that
  is no longer built**, and one lift cost **+53 000 minor**. They are left on the record so nobody
  re-derives them and mistakes them for a target — which is exactly what the 20–30 % band was not.

~~**The upper above the sink is a `wall-lift`, on R8's motion — washing a plate and lifting it
straight up into the cabinet over the sink.**~~ **WITHDRAWN 2026-09-14, the same day, on cost.** The
placement reasoning was sound and is not what failed: **the owner priced the mechanism and chose
doors**, which is a different kind of objection from the one the rule was built to answer.

**Supporting evidence, kept because it still explains why the plan never chased the band.** The
coordinator searched, at the owner's own suggestion. **There is no published statistic on
lift-versus-hinged prevalence** — recorded plainly so nobody spends the search again. What the search
returned is better than a number: **hinged doors are the industry baseline, and lifts are specified by
cabinet size, position and configuration** — Blum's AVENTOS range is organised exactly that way (HF
bi-fold for tall cabinets, HL parallel lift for wide fronts, HS up-and-over where a cornice is in the
way). *Sources: `blum.com/us/en/products/liftsystems/aventos/overview/`,
`durasupreme.com/blog/easy-cabinet-access-with-lift-door-options/`,
`usacabinetexpress.com/how-to-choose-kitchen-cabinet-door-opening-mechanisms/`.*

**Why that still matters after the withdrawal:** the trade's own logic is *placement*, and the owner's
final answer is *cost*. **Neither is a proportion**, so the plan's refusal to build a ratio rule is
vindicated by both the industry and the owner, from opposite directions.

**One measured physical fact, carried because it is load-bearing elsewhere: a lift mechanism needs
roughly 120–165 mm of clearance above the cabinet to swing up** (4.75–6.5 in, varying with door
height). **It constrains nothing in this wave** — no lift is generated at all now — but it **must not
be lost with the withdrawn rule**, because it bites in the top-row hand-off, where R10 asks for lifts
against a ceiling.

**No criterion asserts a ratio band**, and none ever did. The criteria assert the **shape**: doors
throughout, the hood over the hob, and **no `wall-lift` and no `open-shelf` anywhere**.

**The wall row's repetition is not the same defect as the base row's, and the plan says so.** The owner
described the base run as varied (*"3 with drawers and 3 with doors"*) and the wall run as doors —
*"for sure the default will be the doors"*. So a wall row of identical `wall-cabinet`s is **what the
owner builds**, not a failure to compose, and a later reviewer who counts identical uppers cites this
paragraph rather than raising it.

**Product knowledge from the withdrawal, and it is a catalogue gap rather than a rule.** In the owner's
practice **the cabinet above the hob is a lift with the hood built inside it**. The product does not
build that: `hood` is a separate body of its own (`catalog.ts:949`), and `wall-lift` carries no
appliance. **The difference is now known rather than assumed**, and **an integrated-hood wall cabinet
is a body the catalogue does not have** — it belongs with backlog 66's tall-body gap as one more row
the owner's own practice uses and this catalogue lacks. **Not actionable here and not a request.**

**D10 — a stated priority, not a rule: effort belongs in the long run, and the minimal kitchen is
deliberately left simple.** The owner's third statement is recorded above. Their reasoning, which is
the part a later reader needs: **people without space mostly do not have money and buy modular
kitchens; people who come to a manufacturer for a custom kitchen mostly have space**, so the
cannot-fit-everything scenario is *"very rare"*.

- **Measured, and the measurement agrees with them** (G17): the sink-and-hob-only kitchen is **5.1 % of
  placed rooms** in a uniform sweep, and a uniform sweep over-represents tiny rooms relative to a
  self-selected custom-kitchen customer. **Their impression is corroborated; the real share is lower.**
  Reported here because an impression and a count are different things and the plan should say which
  it has.
- **Where this wave spends its effort:** the long run. 7D3's own measurement points the same way — a
  tall block lands in 58 % of sampled rooms and most take all three columns — so **a run with room for
  variety is the typical output, not the exotic one.** The variety rules are the main event.
- **Degradation stays correct and stays unsophisticated.** The existing ladder (storage → fridge →
  preparation) keeps working, criterion 2 pins it, and **nothing tunes it**. Where a choice arises
  between a rule that composes a 6300 mm wall well and one that handles a 1700 mm wall gracefully,
  **the long wall wins.**
- **This is recorded so the simplicity is not read later as an oversight.** A reader who finds the
  thin-kitchen path plain and "fixes" it is undoing a deliberate decision with the owner's reasoning
  behind it.
- **The minimum kitchen itself is not reopened.** The owner did not ask for it and this plan does not
  propose it; sink + hob stands (ADR 0110 A2, ADR 0108 Amendment B), and criterion 12 holds it there.
  Risk 10 carries the one line the measurement earns.

**D11 — RULED 2026-09-14 by the coordinator: both width-changing bodies go to a separate wave 7D5.
S5 is withdrawn from this wave.** Two bodies change the run's arithmetic
rather than a body's identity: the **dishwasher** (600, D7) and the **bottle cargo** (300, D2.2). Each
one re-baselines 7D3's D2.2 threshold table and restates 7D3's criterion 12.

- **Doing them in one wave re-baselines 7D3's figures once instead of twice.** That is the whole
  argument, and it is the same argument that put the dishwasher in its own slice in the first place,
  applied one level up.
- **It makes 7D4 purely identity-changing, with no exception.** Criterion 2 — *every width, count,
  remainder, cut and dropped list is deep-equal to 7D3's* — then holds for the **entire wave** rather
  than for four slices out of five, which is a materially stronger thing to put in front of QA. D1
  becomes absolute instead of nearly absolute.
- **The cargo makes the case, not the dishwasher.** The dishwasher's 600 preserves the remainder's
  residue class; the cargo's 300 moves every room into or out of 7D3's `(0, 200]` absorb window. Doing
  them separately means measuring that window twice, against two different baselines.
- **The cost of the split** is one extra freeze cycle and one extra dispatch, against a wave whose
  files are already serialised behind 7D3.
- **The consequence, and it is the reason the ruling went this way: 7D4's central guarantee stops
  needing an asterisk.** D1 — *this wave changes a body's identity and never its width* — becomes
  **absolute**, and criterion 2 holds for every slice rather than four of five. **A wave whose central
  guarantee has one exception is a wave whose guarantee gets quietly widened later.**
- **7D4 is therefore S0–S4 and has no dishwasher slice.** The dishwasher's rulings stay recorded in D7
  below, because they are the owner's and this is where they were worked out; **they are 7D5's to
  build.** See *Wave 7D5* at the end of this section.

**D12 — a storage slot is identified by *what composed it*: never by its role, and never by its width.
Read this before you write a property, because four criteria in this wave fail against 7D3's own
correct output if you do not, and the first instinct on seeing them go red will be to edit 7D3.**

7D3's block columns are declared with **`role: "storage"`** (`generation-priorities.ts`,
`tallColumnItems`) — deliberately, because ADR 0110 **E5.2** keeps frame 1F's row set from moving. So
after 7D3 the word *storage* has two referents inside one plan: **the cycle's slots**, which this wave
composes, and **the block's columns**, which 7D3 composes and this wave must not touch.

**Measured against the built planner over all 211 551 placed rooms**, reading *storage slot* as
`role === "storage"`:

| Criterion, scoped by role | Rooms it fails on, **against output that is correct** |
| --- | --- |
| **7** — no two adjacent storage slots share a build id | **69 491 (32.8 %)**. Every three-column block is `tall-oven-tower, tall-pantry, tall-pantry`; the outer two are adjacent and identical. Witness: **4500 × 1700**. |
| **1**'s must-not — no storage slot whose width is not 600 | **31 480 (14.9 %)**. E6.2's outermost column absorbs the remainder and is planned at 600 + *r*, to 800. Witness: **3910 × 1700**, `column:A:1 @ 610`. Measured column widths run 600 and then every 10 mm step to 800. |
| **6** — distinct storage build ids = `min(3, slotCount)` | Every room with a block and no cycle slot: two distinct ids against an expected zero. |
| **3** — the drawer/door balance | `tall-pantry` is a door body and `tall-oven-tower` is neither; both would enter the count. |

**And measured with *storage slot* read as *the modules the cycle composed*, the cycle satisfies
criteria 3, 5, 6 and 7 on every one of the 211 551 placed rooms, with zero failures.** **The rules were
right and only their subject was wrong.**

**The ruling, in three clauses:**

1. **Every criterion in this wave that says *storage slot* means *a module the storage cycle
   composed*.** The block's columns are **out of the cycle, out of the balance, out of the variety
   count and out of the adjacency check**, and each criterion says so in its own text rather than
   leaning on this paragraph.
2. **The discriminator is declared, not parsed.** Today it exists only as a string convention:
   `storagePriorities` writes `storage:{wall}:{n}` and `tallColumnItems` writes `column:A:{n}`, both as
   bare template literals with no named authority and no test. **A property that does
   `id.startsWith("storage:")` is one more reader of an undeclared contract.** S1 exports **one
   predicate** — `isCycleStorageSlot(base)` — beside the cycle, and it is the only thing in the
   repository that knows the convention. **Criterion 22 is its guard.**
3. **The role does not change, and changing it would be the defect.** E5.2 rules that a column carries
   the storage role so 1F's row set does not move. **This wave must not "fix" the ambiguity by giving
   the block a role of its own**; it fixes it by naming the subject precisely.

*(Checked against ADR 0110 Amendment E at `128e515`: E5.2 and E12.2 both stand, and this ruling refines
nothing in either.)*

**D13 — the kitchen-wide sequence has exactly two call sites and one index map, and the map is written
here because it is this wave's most likely silent defect.**

`storagePriorities(wall, count)` is called twice in `builtPlan` — once for wall A with
`tallEnd.storageCount`, once for wall B with `leftovers.B.storageCount`. The cycle is per kitchen (D5),
so the second call needs a **start index**, and wall B's slots are consumed in the reverse of their
spatial order (G12). The map, stated once:

```
let bCount = leftovers.B.storageCount              // wall B's cycle slots
storage:B:i   ->   sequence index  (bCount - 1 - i)   // i is spatial, corner outward
storage:A:j   ->   sequence index  (bCount + j)       // j is spatial, corner outward
```

**Measured: this map, and only this map, satisfies criteria 3, 5, 6 and 7 on all 211 551 placed
rooms.** The wall-B term is the one that inverts, and an implementer who writes `bCount + i` for wall B
produces a plausible alternating run that **passes criteria 3, 5, 6 and 7 and fails only criterion 8**.
That is risk 2, now with its exact expression.

**Must not:** a third call site; a sequence index recomputed anywhere outside `builtPlan`; the wall-B
inversion expressed as a `reverse()` on the *placed* array after the fact, which would leave the plan's
ids disagreeing with its bodies.

**D9 — what a run too short for variety does, and it must never be worse than today.** Measured (G3):
after 7D3, **29.5 %** of placed rooms have no storage slot at all and **18.1 %** have exactly one, so
this is the common case. *(The 30.6 / 17.6 this paragraph carried were the derived figures G3 replaced;
the conclusion is unchanged.)*

| Slots | What is composed | Against today |
| --- | --- | --- |
| 0 | nothing changes | identical |
| 1 | one `base-3drawer` | same count, same width, same position; a different body and a higher price (G9) |
| 2 | `3drawer, cabinet` | already the balance |

**Nothing degrades, because nothing about the run's geometry moves** — that is D1 restated at the
bottom end. **The one thing that does change for a small kitchen is the price** (G9), and that is
where this rule meets 7D3's **R5** (*prefer the cheaper minimum*). **They do not conflict, and the
reason is recorded rather than assumed:** R5 governs **how many** bodies a kitchen gets — a second
oven, a fridge housing — and this rule governs **which** body fills a slot that exists either way. The
owner's variety goal is explicit, later, and stated as a goal rather than a preference. **A wave that
later reads R5 as covering body choice is overturning this paragraph and owes a dated decision.**

### Module boundaries

- **`src/generation/body-choice.ts` (new leaf).** One pure module answering one question:
  **which cabinet body stands in this base-row slot?** It declares the three storage build ids, the
  cycle, `storageBodyAt(slotIndex)`, and **`isCycleStorageSlot(base)`** — the one answer to *is this
  module the cycle's, or the block's?* (D12). It imports nothing from generation — no catalogue, no
  probe, no design, no room — and it is written beside `leftover-rule.ts` for the reason that module
  exists. It is the **only declaration site** for `base-cabinet`, `base-3drawer` and `base-panbank`
  under `src/generation/`, **and the only place in the repository that knows the `storage:` /
  `column:` id convention.**
  **A second half of this leaf was planned and is withdrawn.** `upperBodyFor(baseRole)` was to move the
  wall row's choice out of the funnel; with D8's lift rule withdrawn the wall row's output is unchanged,
  so **moving the two constants would be a pure refactor buying nothing**, and the wave does not do it.
  `generate-kitchen.ts` keeps `WALL_CABINET_BUILD_ID` and `HOOD_BUILD_ID` exactly where they are.
- **`src/generation/generation-priorities.ts`** keeps the reading order, the cut, the spatial layout
  and the **core** role data. It calls `storageBodyAt` in place of today's `STORAGE_BUILD_ID`, builds
  the kitchen-wide storage sequence D5 defines, on **D13's index map and no other**. ~~and — in S5 only
  — gains the dishwasher row and its place in the attempt ladder~~ **struck: S5 went to 7D5 (D11), so
  this module gains no dishwasher row in this wave.** **The preparation row reads
  `THREE_DRAWER_BASE_BUILD_ID` from the new leaf rather than writing the id again.** It gains no width
  literal and no ratio literal.
- **`src/generation/generate-kitchen.ts`** keeps the command funnel and **changes nothing at all** —
  the wall row's withdrawal (D8) removed this wave's only reason to touch it, and D11 removed the
  other. ~~In S5 it gains the dishwasher role in both `plan.bases` passes.~~ **Struck with S5.** The
  file therefore belongs on the must-not-change side for the whole of 7D4, and it is listed under *may
  change* above only because 7D5 inherits this section.
  **The funnel gains no new branch and no new refusal path** — an upper that cannot be placed is still
  logged *not placed* and still removes nothing below it (ADR 0110 Amendment C).
- **The split of authority, stated so criterion 20 is checkable:** the priorities table is the one
  authority for a **core role's own** body (it already is — `base-sink`, `base-hob-oven`,
  `fridge-free`), and `body-choice.ts` is the one authority for every body chosen **by position rather
  than by role data** — the storage cycle and the whole wall row. The two sets are disjoint, and
  `base-3drawer` belongs to the second even though the preparation role reads it.
- **`leftover-rule.ts`, `shell-design.ts`, `tall-end-rule.ts`, `insert-fit.ts`, `merge-empty-columns.ts`,
  `module-grid.ts`, the void engine, the validator, the catalogue and the price book are read-only to
  this wave.** `module-grid.ts` is named because it, and not the merge module, declares the 800 mm cap
  D1's safety argument rests on (G3.11).
- **No declared size is restated.** A generation-side width or price constant checked against the
  catalogue in a test is the second authority ADR 0102 forbids.

### Files, and the must-not-change set

**May change (4 production files + tests):**

- `packages/configurator-domain/src/generation/body-choice.ts` *(new)*
- `packages/configurator-domain/src/generation/generation-priorities.ts`
- `packages/configurator-domain/src/generation/generate-kitchen.ts` *(S3 and S5 only)*
- `packages/configurator-domain/src/index.ts` *(exports only, if the new leaf's type is needed
  outside)*
- `packages/configurator-domain/tests/generation/*` and one `packages/three-adapter/tests/*` parity
  addition

**Must not change:** `src/generation/leftover-rule.ts` (D0 — and criterion 14 asserts it byte-identical);
`src/generation/shell-design.ts`; `src/generation/tall-end-rule.ts`; `src/catalog.ts`; `src/pricing/**`;
`src/commands/**`; `src/void-engine.ts`; `src/merge-empty-columns.ts`; **`src/module-grid.ts`**;
`src/validate-design.ts`; `src/room/**` — in particular `room-policy.ts` and `approved-room-policy.ts`,
whose minimum kitchen stays **sink and hob**; anything under `apps/web`. **7D3's own assertions must
not be edited**, with the single declared exception in criterion 16.

**Two additions, each with its reason** (G3.11, D12):

- **`src/module-grid.ts`** declares `MAX_EMPTY_COLUMN_WIDTH_MM`, which is **the whole of D1's safety
  argument**, and which `merge-empty-columns.ts` and `tall-end-rule.ts` both import from there. The
  list named the merge module and stopped one file short of the constant.
- **`src/generation/tall-end-rule.ts` is read-only, and every one of its outputs is asserted
  *unchanged* rather than merely unmentioned** — the column build ids, the block's size, the absorbed
  outermost width and the hob's build id. Criterion 2 carries the assertion. **A criterion of this wave
  going red on a block column is this wave's defect, not 7D3's** (D12).

### Acceptance criteria

Each names its proof mechanism. *Property* means a `fast-check` property over the **approved** L policy
(wall A 900–6300, wall B 1000–5100, height 2200–3900, on a 1 mm grid) with a stated minimum sample
count **per arm**, per `docs/WORKFLOW.md`. Every criterion says what must not happen. Criteria 1–15 and
19–22 belong to S1, S2 and S4. **Criteria 16–18 moved to wave 7D5 with the dishwasher (D11) and are
left in place, numbered, so every reference still reads.** The witness table above supplies a measured
room for every slot count, and a property that never samples a room with four or more slots proves
nothing.

**Before you write any of them — D12.** **Every criterion below whose subject is a *storage slot* means
a module the storage cycle composed, and says so in its own text.** A criterion that reaches its
subject through `role === "storage"`, or through a width, is a defect **in the test**: measured, the
role scoping fails on **32.8 %** of placed rooms and the width scoping on **14.9 %**, in both cases
against 7D3's output being **correct**. The failure therefore presents as a defect in a closed wave,
and **the first instinct will be to edit 7D3. It is the wrong one.** Scope by provenance — the exported
`isCycleStorageSlot` — and the same rules pass on all 211 551 placed rooms.

**Sample floors come from risk 14's measured table**, taken under `fc.integer` against the real
generator, and never from a uniform model of the room space.

**Two things no criterion here may do, and both are rulings rather than style.** No criterion asserts
a **ratio band** for lifts or open shelves (R7, D8), and no criterion asserts that **no drawer stands
after the hob** (R6, D6). Each would turn a proportion or a majority case the owner stated in
conversation into a hard constraint. A QA or review agent who finds one has found a defect in the
tests, not in the composer.

1. *(unit — the wave's headline)* At **6300 × 4700 × 2600** the eight storage slots compose as
   **4 × `base-cabinet`, 2 × `base-3drawer`, 2 × `base-panbank`**, and at **6300 × 5100 × 2600** the
   same. **Must not:** eleven identical bodies; any two adjacent **cycle slots** sharing a build id; a
   **cycle slot** whose width is not 600. **The block's three columns are not cycle slots** — at both
   rooms they are `tall-oven-tower, tall-pantry, tall-pantry` and the test asserts them **unchanged**
   rather than exempting them silently (D12).
2. *(property, ≥ 200 samples)* **Width neutrality — the wave's strongest invariant.** For every room,
   `plan.floorWidthsMm`, `plan.remainderMm`, `plan.dropped`, the chosen wall cut, and every planned
   base's `wall`, `startMm`, `endMm` and `widthMm` are **deep-equal to 7D3's** for the same room. The
   **only** difference in the whole plan is `buildId`, and only on the modules whose planned ids are
   `storage:{A|B}:{n}` and on the **preparation** role. **Every block column's `buildId`, `widthMm`,
   `startMm` and `endMm` is deep-equal to 7D3's**, and so is the hob's `buildId` — which 7D3's rule
   sets and this wave never reads. **Must not:** any width, count, remainder, cut or dropped-list change
   **anywhere in the wave** — since D11 moved the dishwasher to 7D5 this criterion has **no exception
   and no asterisk**, which is the whole reason that ruling went the way it did; a block column whose
   identity moved.
3. *(property, ≥ 150 samples with ≥ 2 slots — measured arm rate 43.7 %, so ≥ 350 runs)* **Balance.**
   `|drawerBodies − doorBodies| ≤ 1` over the kitchen's **cycle slots**; at an even count they are
   **equal**; at an odd count **drawers** carry the extra. **Must not:** a door majority at any count,
   on any room in the policy; the block's columns entering the count — `tall-pantry` is a door body and
   `tall-oven-tower` is neither, and both would corrupt it (D12).
4. *(unit — the owner's own example)* At **5700 × 4100 × 2600** there are six storage slots and they
   compose **three drawer bodies and three door bodies**. **Must not:** the three-and-three arriving
   from a hardcoded six, a ratio constant or a `floor(n / 2)` count — criterion 20 is its guard.
5. *(property)* **Per-wall deviation is at most one body.** On each wall, the drawer count differs from
   half that wall's **cycle-slot** count by at most one. **Must not:** a wall composed entirely of one
   class while the other wall carries the balance.
6. *(property)* **Maximum variety, quantified.** The number of **distinct** build ids across a
   generated design's **cycle slots** is exactly `min(3, slotCount)`. Measured: a room with a
   three-column block and **no** cycle slot holds two distinct full-height build ids and **zero** cycle
   slots, and this criterion's expected value there is **0** — scoping by role gives 2 and a false red
   (D12). **Must not:** a fourth body appearing; a kitchen with three or more slots showing fewer than
   three distinct bodies.
7. *(property)* **No two adjacent cycle slots carry the same build id** — asserted **along the wall**
   (spatial order) as well as in the reading order, so wall B's reversal is exercised (G12). Adjacency
   is between two **cycle slots**; a cycle slot adjacent to a block column, to the hob or to the corner
   is not a pair this criterion looks at. **Must not:** the assertion written only in reading order;
   **the assertion scoped by `role === "storage"`** — measured, that form fails on **69 491 rooms
   (32.8 %)** against 7D3's own correct output, witness **4500 × 1700** where wall A is
   `tall-oven-tower, tall-pantry, tall-pantry`, and whoever meets it will be tempted to change 7D3.
8. *(unit + property, the accepted awkward boundary)* **The cycle is per kitchen and the phase carries
   across the corner.** Where wall B's cycle-slot count is **even**, wall A's first cycle slot is a
   **drawer** body; where **odd**, a **door** body. Witnesses **5700 × 4100** (even) and
   **5100 × 4700** (odd). **Must not:** a per-wall restart — measured, it passes criteria 3, 5, 6 **and
   7** and fails only this one, which is the sole criterion that tells them apart; and **an arm floor
   taken from anywhere but risk 14's table** — the property's arm is rooms with cycle storage on both
   walls (**17.4 % of runs**), and its even branch is **6.4 %**, so ≥ 100 samples of it needs
   **≥ 1 600 runs**. At the house default of 200 it sees about thirteen.
9. *(property)* **Every generated base module is on the grid.** Every placed base's width equals its
   planned width, and no placed base is narrower than its opening (the centred-sliver case, G5).
   `base-bottle-cargo` appears in **no** generated design, at any room in the policy. The **width**
   assertion is over **cycle slots**: the block's outermost column is legitimately 600 + *r* up to 800
   (E6.2) in **31 480 rooms (14.9 %)**, witness **3910 × 1700** at 610 mm, and a criterion that reads
   that as a storage width fails against correct output. **Must not:** a discrete-width row generated
   into a tile its set does not contain.
10. *(unit, boundary — the merge)* **The free-end merge still lands on a `'fit'` body.** At
    **2700 × 1699** (wall B remainder 98, one storage slot on B) the slot is inserted into the merged
    698 mm opening and stepped back to 600, exactly as it is today, whichever body the cycle assigned
    it. **Must not:** the absorb or the merge landing on a `fixedWidth` or discrete-width body — every
    member of the cycle is `'fit'`, and the test reads that from the catalogue entry rather than
    asserting it by name.
11. *(property)* **The preparation cabinet is a drawer cabinet and nothing else moved.** Wherever the
    preparation role is placed its build id is `base-3drawer`, its width is 600, its position is
    deep-equal to 7D3's, it is still `required: false` and it is still the last core role dropped.
    **Must not:** a new role before the hob; a preparation cabinet at any other width; the preparation
    role becoming required; **and — R6, D6 — any assertion anywhere in this wave's suites that no
    drawer body stands after the hob.** A drafted criterion of exactly that shape was deleted from
    this plan; re-adding it is a finding, because this composer legitimately places drawers on both
    sides of the hob in a long run.
12. *(unit)* **The room rule is unmoved.** `ENGINE_ROOM_LIMITS` and `APPROVED_ROOM_POLICY` are
    byte-identical before and after; `generatedRequiredWidthMm` still reads only `sink` and `hob`
    (G11); the minimum kitchen is still sink + hob; 7A2's coupled `ROOM_TOO_SMALL_FOR_KITCHEN` property
    passes unedited. **Must not:** any body this wave adds becoming a room prerequisite by any route.
13. *(property, ≥ 200 samples)* **7D2's and 7D3's guarantees still hold, unedited.** Zero
    `validateDesignForCatalog` findings of either severity and no overflowing placement; the same room
    gives a deep-equal design **and** log; `replayGenerationLog` reproduces the design exactly; the
    probe lease is released on every path including a throw. **7D3's criteria 2, 4, 20, 21 and 22 pass
    without edits** — exactly one oven, the block at the end, its size table, its composition, and the
    `1 → 0` dip. **Must not:** an edited 7D2 or 7D3 assertion — that is a finding to report, not a fix
    to make.
14. *(unit + property)* **The leftover rule is untouched.** `leftover-rule.ts` is byte-identical to
    7D3's; per wall the composed run leaves at most 599 mm bare (599 plus the chain shift on wall B,
    ADR 0110 F7); and the count of slots wall A receives equals `planLeftover`'s for the same free end.
    **Must not:** a second remainder or slot-count arithmetic anywhere in generation.
15. *(three-adapter parity, real probe)* A sample of generated designs containing **all three** storage
    bodies builds with the real probe: no two bodies intersect beyond
    `room-composition.parity.test.ts`'s shared-face tolerance, each body's back face is on its wall
    plane, and each drawer body draws its declared fronts (three and two). **Must not:** a re-baselined
    fidelity capture — this wave changes no builder.
16. **7D5** *(unit, boundary, derived)* **The dishwasher's cost in millimetres.** With the dishwasher in
    the core, 7D3's D2.2 table moves by exactly one module: with the fridge on wall B the minimum wall
    A for a one-, two- and three-column block becomes **3900 / 4500 / 5100**, and where wall B is too
    short to hold the fridge **4600 / 5200 / 5800**. *(Derived arithmetically from D2.2 + 600; **the
    implementer re-measures these against the built planner and reports a disagreement rather than
    adjusting the plan**.)* The figures are computed in the test from `lShellFloorRuns` and the
    declared widths and then asserted as literals. **7D3's criterion 12 is restated against 7D4's own
    planner, and the restatement is recorded in Amendment F.** **Must not:** a silently edited 7D3
    assertion; a hardcoded threshold; a block table left stale.
17. **7D5** *(property, ≥ 150 samples in the dishwasher arm)* **Beside the sink, after it, droppable.**
    Wherever a dishwasher is placed it is immediately adjacent to the sink in the reading order, on the
    sink's hob side; the sink stands between the fridge and the dishwasher whenever both are placed;
    and it is dropped **before** the fridge and before the preparation cabinet, while the sink and the
    hob are never dropped. **Must not:** a dishwasher not adjacent to the sink; a dishwasher in a
    design whose `dropped` list already names another role; a dishwasher generated at 450.
18. **7D5** *(unit)* **`dropped` may now name `dishwasher`, and every reader survives it.**
    `GenerationCoreRole` gains the member, `room-policy.ts`'s
    `Extract<GenerationCoreRole, "sink" | "hob">` still compiles and still reads two rows, and the
    `GenerationLog` type change is exported. **Must not:** a `dropped` member with no defined meaning
    at the 7F4 seam — 7F4 names what was dropped in a customer-visible sentence.
19. *(property)* **Every planned base is attempted exactly once.** The log's step ids for base roles are
    a permutation of `plan.bases`' ids, with no duplicate and no omission, for every room. *(7D3's
    criterion 15, restated. **Its original reason has expired**: it was restated because S5 added a role
    to the same two `plan.bases` partitions, and D11 moved S5 to 7D5. **It is kept for a better
    reason** — `compose` partitions on `role !== "storage"` and `role === "storage"`, which is exactly
    the word D12 showed has two referents, and a permutation check over planned ids is the cheapest
    guard there is against a module falling through both.)*
20. *(lint / grep in a test)* **One declaration site per build id, and no ratio constant.**
    `base-cabinet`, `base-3drawer` and `base-panbank` appear as literals in exactly one module under
    `src/generation/` — `body-choice.ts`. **`base-dishwasher` and `base-bottle-cargo` appear nowhere**
    under `src/generation/`. *(The dishwasher's clause is **withdrawn from its earlier form**, which
    named `generation-priorities.ts` as its one site; that was written before **D11** moved the body to
    7D5, and at HEAD the id appears in no generation module at all, so the old form would fail.)*
    `tall-oven-tower` and `tall-pantry` stay where **7D3's criterion 23** put them, in
    `tall-end-rule.ts`, and this criterion does not reach them. No file under `src/generation/` encodes
    the balance as a percentage, a ratio or a halving — it is the cycle's shape. **Must not:** a
    generation-side width or price constant "kept in sync" with the catalogue; a percentage anywhere
    under `src/generation/` — neither the base row's half nor the wall row's 20–30 % nor the 5 % is a
    number this wave writes down.
21. *(property, ≥ 200 samples)* **The wall row is byte-identical to 7D3's, and it is asserted rather
    than composed** (D8). For every room: every upper's build id, opening, position and width are
    deep-equal to 7D3's; the hood stands over the hob; nothing stands over the fridge or over a
    full-height column (7D3 D5); an upper that cannot be placed is still logged *not placed* and still
    removes nothing below it. **And in no generated design, at any room in the policy, does a
    `wall-lift` or an `open-shelf` appear.** **Must not:** a `set_width` command logged for any upper;
    a lift reinstated without a new dated ruling — **this criterion is the guard on a rule that was
    written, built into this plan and withdrawn by the owner in one day**, and it exists so the next
    reader of D8's struck text does not re-add it.
22. *(unit + grep — **D12's guard**)* **The cycle's slots are identified by one exported predicate, and
    nothing else knows the convention.** `isCycleStorageSlot` is exported from `body-choice.ts`; it
    returns `true` for every `storage:{A|B}:{n}` module and `false` for every `column:A:{n}` module,
    over a sample of designs covering block sizes **0, 1, 2 and 3**; and the literal `"storage:"`
    appears in exactly **two** places in the repository — the predicate, and the one `Array.from` that
    writes the id. **Must not:** a test, a property or a production module that parses a planned id
    itself; **a predicate that answers by role or by width** — the two forms D12 measured to fail on
    32.8 % and 14.9 % of placed rooms; a second discriminator added anywhere, including a new field on
    `PlannedGenerationBase` or a role of the block's own, which E5.2 forbids.

*(Criteria 23 and 24 were the composed wall row's — the one lift above the sink and its measured share
— and are **withdrawn with D8's lift rule**. **Number 22 was theirs too** — `upperBodyFor`'s totality —
and is **reused here deliberately**: no surviving text references the withdrawn 22, and retiring a
number permanently for a criterion nobody cites costs more than it saves. Every other reference above
still reads.)*

### Slices, in dependency order — dispatched one at a time

The tree is frozen for QA and review between slices (`docs/WORKFLOW.md`); no two of these may be in
flight together.

- **S0 — the record. NOT WRITTEN.** ADR 0110 **Amendment F**: the owner's four statements verbatim;
  D1's grid rule and the merge measurement behind it; the cycle and why the ratio is not a constant;
  the per-kitchen sequence and its phase boundary; the preparation body as an amendment to A1's
  *interim data*, **with R6's softening recorded as a preference and the deleted criterion named**;
  D8's wall-row rule with R8's motion as its reason and R7's proportions recorded as guidance;
  **D10's priority and the owner's reasoning for it**; the dishwasher's position, drop order and
  threshold cost, with ~~**Q-D1 and**~~ **Q-D2 marked as open** (**Q-D1 was answered 2026-09-14**);
  the bottle cargo's exclusion with ADR 0026's
  reason; G9's and G16's price figures, so the variety goal is a knowing choice; **R10's top-row lift
  rule with the stretch-ceiling reason stated first, recorded and not built**; and **D0's correction of
  the reason 7D4 was said to depend on 7D3**. Markdown only. **No other slice starts until it exists
  and is reviewed.**
- **S1 — the leaf, alone** (`body-choice.ts` + its unit tests). The cycle, `storageBodyAt`,
  **`isCycleStorageSlot`** (D12), and every storage build id those answers use. **`upperBodyFor` is not
  in it** — the module-boundaries section withdrew that half of the leaf when D8's lift rule was
  withdrawn, and this bullet went on naming it. Criteria 3, 4, 6, 7 and **22** are provable against the
  leaf before anything calls it, and 20's grep runs here. **Criterion 21 is not S1's** — it is a
  whole-design property and belongs to S4; this bullet listed it here and was wrong. **S1 changes no
  generated design**, which is why it goes first.
  **It is not gated on any owner answer.** Q-7D4-1 confirms the cycle's *starting end*, not its shape,
  and the leaf is identical under either answer. **A reader must not treat this wave as blocked.**
- **S2 — the storage sequence and the preparation body** (`generation-priorities.ts`). The kitchen-wide
  sequence of D5, `storagePriorities` reading the leaf, and the one-line preparation change. Criteria
  1, 2, 5, 8, 9, 10, 11, 13, 14 and 19. **This is the slice that removes the eleven.**
  **D13's index map is this slice's contract**, and the wall-B inversion is written before the cycle is
  called — not discovered by running criterion 8.
- ~~**S3 — the wall run** (`generate-kitchen.ts`).~~ **WITHDRAWN with D8's lift rule, 2026-09-14.**
  With no lift generated, the wall row's output is already correct and the slice's whole content was a
  refactor. **It does not fold into S2 either** — there is nothing to fold. What the wall row is owed
  is an **assertion**, criterion 21, and that belongs to S4 with the other properties. **The slot is
  left empty rather than renumbered**, so every criterion and risk reference above still reads.
- **S4 — the properties and the parity test** (`tests/` only). Criteria 2, 3, 5–9, 12, 13, 15, 21
  and the arm counts. Dispatched to QA-style adversarial authorship: **the properties are written
  against the criteria, not against the implementation**, and any property that cannot be made to fail
  by a deliberate one-line sabotage of `body-choice.ts` is reported as not proving its criterion.
  **The two forbidden assertions named above the criteria are part of this slice's brief.**
  **Every property in this slice is mutation-verified before the slice closes** (risk 13): delete the
  clause the criterion is about, show the property **red**, revert. A property that stays green under
  the deletion **has not proved its criterion** and is reported, not patched. **Every arm floor comes
  from risk 14's measured table**, and the suite **fails** — never warns — when an arm is starved.
- ~~**S5 — the dishwasher.**~~ **WITHDRAWN from 7D4 by D11, 2026-09-14, and moved to wave 7D5 with the
  bottle cargo.** **7D4 is S0–S4 and contains no width-changing commit at all**, which is what makes
  criterion 2 hold across the whole wave.

### Risks

1. **A width sneaks into the composition.** The wave's whole safety argument is D1, and it is bought
   by a rule that is easy to relax in good faith — "a 450 dishwasher here would tidy the run". The
   failure is not cosmetic: the tile merges (G4), `plannedVoid` throws (G6), or a body is built
   centred with slivers (G5). Criteria 2 and 9 are the guards, and criterion 2 is the one that fails
   loudly on the first sample.
2. **The wall-B reversal, off by one.** The storage sequence runs free-end-to-corner on wall B and
   corner-to-free-end on wall A (G12). An implementer who takes wall B's spatial array as the reading
   order gets a plausible-looking alternating run that fails criterion 8 and nothing else. **Write
   criterion 8 before the sequence.**
3. **A per-wall restart that passes almost everything.** It satisfies balance, variety and
   non-adjacency; only criterion 8 separates it from the ruled behaviour. Do not weaken 8.
4. **The dishwasher moving 7D3's thresholds silently — now wave 7D5's risk, kept here because that wave inherits this list.** It changes which core roles survive in the
   rooms at every block boundary. The tempting fix is to edit 7D3's criterion 12; the required one is
   to restate it and record the restatement (criterion 16). **An edited 7D3 assertion is a finding.**
5. **Quietly widening the minimum kitchen.** A dishwasher row added with `required: true`, or the
   preparation row losing its `widthMm`, changes which rooms Step 1 refuses — a customer-visible change
   made by accident, in a file this wave must not touch. G11 and criterion 12.
6. **Reading R5 as governing body choice.** 7D3's *prefer the cheaper minimum* and this wave's variety
   goal point opposite ways for one slot, and D9 rules why they do not conflict. A later reader who
   collapses them will make small kitchens uniform again and see nothing go red. G9's figure is in the
   amendment so the cost is a recorded choice.
7. **Property arms that never fire.** 30.6 % of rooms have no storage slot at all and 17.6 % have one
   (G3), so a naive generator spends most of its samples where the cycle is invisible. Every property
   states a minimum per arm and the suite must fail when an arm is starved.
8. **`base-3drawer` and `base-panbank` gain their first automatic callers.** Until now both existed
   only where a customer put one. Their fronts, handles and prices are now produced by a run rather
   than chosen, and criterion 15 is the first parity coverage they get from generation. A later wave
   that changes either row's front or handle declaration changes generated kitchens.
9. **The wave has no UI and no visual gate.** Everything is provable in `configurator-domain` plus one
   `three-adapter` parity test; `generateKitchen` has no production caller until 7F4. "It looked right
   in the browser" is not evidence here, in either direction.
10. **A rule described in conversation must not become an asserted invariant without being put back to
    the owner in the form it is about to be built.** This is a **standing guard**, not a risk local to
    this wave. **Its earlier wording said *majority case* and was too narrow** — not every instance was
    about a proportion. **What they share is the trigger, and that is the guard's real content: someone
    turned a description into a rule, and asking one narrow question changed the answer.** Four times
    in one day:
    - the **oven-beside-fridge** rule forbade *adjacency*, not proximity (7D3 D7.2);
    - **`tall-pantry`'s deferral** reversed once a block needed a second body (7D3 QT-2, QT-6);
    - **drawers-before-the-hob** was a preference, not an invariant (R6, D6);
    - **the wall-row lift** was a described habit that the owner, once asked, **priced and declined**
      (D8) — *not a percentage at all*, which is why the old wording would have missed it.

    **Each was caught at the moment the rule was about to be hardened into a test or a body**, which
    is the cheapest moment there is. The cost of the guard is one question; the cost of missing it is a
    suite that rejects an arrangement the owner calls normal, and a composer narrowed to match.

    **The concrete case that proves the guard, and it is stronger than the guard's own wording.** The
    drawers-before-the-hob invariant was about to be written as a criterion. **This wave's composer
    already generates drawers *after* the hob in half of all rooms** — wall A's storage follows the hob
    and D5's phase puts a drawer body in its first slot whenever wall B's storage count is even. **So
    the assertion would have failed against the composer's own output**, and it was caught only because
    the owner softened the rule in conversation — **not because any test found it, and not because
    anyone re-read the composition.** A rule that contradicts the thing it is about to be asserted over
    can survive review; what caught it was asking. **The same applies to the 20–30 % lift band, which
    the owner has since confirmed was an impression rather than a measurement** — a ratio criterion
    would have encoded a guess as a contract.
11. **A 300 mm tile is legal but fragile, and only in one position** (D2.2). It survives **only**
    between two neighbours of 500 mm or more; 200 mm never survives beside a 600, and two cargos may
    never touch. Whoever builds 7D5 must assert the neighbours, not the cargo — a test that only checks
    *"is there a bottle cargo?"* passes while the merge has quietly eaten the tile and moved every
    boundary after it. This is the same shape as 7D3's centring hazard and it is nastier, because the
    failure is a throw in one room and a silently re-tiled run in the next.
12. **The thin-kitchen band is small, and the measurement says so** (G17): 5.1 % of placed rooms
    compose a sink-and-hob-only kitchen, in a sweep that over-weights tiny rooms. **The owner's
    impression and the count agree**, so D10's simplicity is well founded and the minimum kitchen is
    not reopened. The risk is the opposite one: a later reader finding that path plain and *improving*
    it, spending the wave's attention where 5 % of rooms and a smaller share of customers live.
    **D10 exists to be cited when that happens.**
13. **An arm-minimum guard is only as good as the diversity *inside* the arm — 7D3's finding, and it
    cost that wave a clause.** 7D3 carried a property demanding ≥ 100 samples per arm; it complied
    exactly, and **the clause it existed to protect could be deleted with every test green**, because
    the discriminating sub-case was 234 rooms in 2.34 M. **So every property in this wave is
    mutation-verified**: delete the clause the criterion names, run the property, and it must go
    **red**. Three are named because a green mutation is likeliest there, and each was checked against
    the measured composition rather than guessed:
    - **criterion 8's phase clause** — delete the `bCount +` term in D13's wall-A map and the cycle
      restarts per wall; **criteria 3, 5, 6 and 7 all stay green** (measured over 211 551 rooms);
    - **criterion 3's odd-count clause** — swap the cycle's index 0 and index 1 bodies and the balance
      still holds at every even count, so only the odd arm separates them;
    - **criterion 6's `min(3, n)`** — replace the cycle with `[3drawer, cabinet, 3drawer, cabinet]` and
      criteria 1, 3, 5 and 7 stay green.
14. **A sample floor derived from a uniform model of the input space ships a flaky gate.** `fc.integer`
    is boundary-biased, and the divergence here is real and measurable: zero-slot rooms are **29.5 %**
    of placed in the uniform 10 mm sweep and **32.9 %** under `fc.integer` over the same policy, so a
    floor set from the sweep is **optimistic for every rich arm**. **Set every floor from the second
    column below** — measured with `fc.integer` over the approved L policy, 5 000 runs, seed
    `20260915`, against the real planner:

    | Arm | % of runs | Runs for 100 samples |
    | --- | --- | --- |
    | a room is placed at all | 89.0 % | 113 |
    | ≥ 2 cycle slots — **criterion 3's arm** | 43.7 % | 229 |
    | ≥ 6 cycle slots — the owner's own example | 6.1 % | 1 640 |
    | cycle storage on **both** walls — **criterion 8's arm** | 17.4 % | 575 |
    | ↳ with wall B's count **even** | **6.4 %** | **1 563** |
    | ↳ with wall B's count odd | 11.0 % | 910 |
    | the block absorbed a remainder | 10.9 % | 918 |

    **The scarcest arm is criterion 8's even branch at 6.4 %.** A property at the house default of 200
    runs sees about **thirteen** samples of it. **Criterion 8 needs ≥ 1 600 runs, or an arbitrary that
    constructs the arm**, and the suite must **fail** rather than warn when an arm is starved.
15. **Identify a body by what composed it — not by its role, and not by its shape** (D12). 7D3 met the
    **shape** form three times: a check that identified cabinets dimensionally by the `column` band
    swept in `fridge-free`, which is declared in the same band and is Amendment A1's body, not the
    block's; each fix was the same distinction. **This wave meets the *role* form, and it is worse,
    because the role is correct** — E5.2 puts the storage role on a block column deliberately.
    Measured, the naive scoping fails on **32.8 %** and **14.9 %** of placed rooms **against output
    that is right**, so the failure presents as a defect in a closed wave. **The first instinct on
    seeing criterion 7 go red will be to edit 7D3, and it will be wrong.** A wave composing a *varied*
    run meets this far more often than 7D3 did: provenance is the only thing separating one 600 mm
    module from another once they stop being identical. **One exported predicate, not a string
    convention repeated at each reader** — criterion 22.

### Owner questions — two open, five answered, plus four confirmations raised 2026-09-15

**Read this before treating the wave as blocked.** The brief that dispatched this planning said 7D4
*"is owed an owner ruling it does not have — which bodies, in what proportion, and in what order"*.
**Measured against the record at HEAD, two of those three are closed and the third is closed in part:**

- **Which bodies** — R2, *"out goal is to use maximum cabonets types possible"*, together with the
  measured fact (G3.8) that the catalogue holds exactly **three** general storage bodies buildable at
  600 mm. The cycle uses all three. **Nothing to ask.**
- **In what proportion** — R1, verbatim: *"if there is like space for 6 cabinets will be like 3 with
  drawers and 3 with doors"*. **Nothing to ask**, and ADR 0117 §*unclear* #1 records that this
  proportion is being built while the lift band is not.
- **In what order** — **partly open.** The owner gave *ergonomic anchors* (cutlery before the hob, oil
  after the hob) and never an order for the storage run itself. **The 4-cycle and the end it starts
  from are the coordinator's derivation, not the owner's sentence.**

**So the wave is owed a confirmation, not a ruling** — which is risk 10 and ADR 0117 decision 7 doing
their job. **None of Q-7D4-1…4 gates S1 or S2**, and the plan is written on the stated default so
neither slice waits.

**Q-7D4-1 — the storage pattern, put in the exact form it is about to be built. OPEN; put to the owner
2026-09-15; not a gate.** The pattern, as they should see it: *drawer cabinet (3 drawers) → door
cabinet → drawer cabinet (2 deep pan drawers) → door cabinet*, repeated. Six cabinets give three and
three, which is their number, and no two neighbours are alike. **The two consequences they have not
seen, both measured**: the sequence starts at the **far end of the fridge wall**, so the first drawer
cabinet stands **next to the fridge in 48.0 %** of kitchens; and **in 45.1 % of kitchens every varied
cabinet is on the fridge wall**, with the cooking wall carrying only the core and the tall block —
**only 19.1 % have variety on both walls** (G3.3).

- *Answer "as described":* **the plan as written** (D3, D5). This is the default and **is what S1 and
  S2 build unless the answer arrives first.**
- *Answer "start at the cooking end":* the sequence reverses — wall A's slots take indices 0…*n* and
  wall B's follow. The drawer cabinet lands nearest the hob instead of nearest the fridge. **The cost
  is one line in `body-choice.ts`'s caller and a new pair of phase witnesses for criterion 8.** It is
  cheap **now** and stops being cheap once the criteria harden, which is the whole reason the question
  is asked before S2 rather than after.
- *Answer "restart on each wall":* **refused in D5, and the refusal goes back to them with their own
  example** — three-and-three then comes out **4 drawers and 2 doors**, not 3 and 3.

**Q-7D4-2 — the block's two identical tall door cabinets. OPEN; not a gate.** Measured: in **32.8 %**
of placed rooms the block is `tall-oven-tower, tall-pantry, tall-pantry` — a pair of identical tall
door cabinets side by side, which is the shape of the repetition the owner objected to, and which the
variety rule does not reach. *Answer "fine":* **nothing is built**; one sentence records that the
variety rule stops at the block, so the next person who counts identical cabinets finds the answer
instead of raising it. **This is the cheap answer and the expected one.** *Answer "same objection":*
**it cannot be built in this wave or this milestone** — the catalogue has exactly one full-height door
body, and a second is a **new catalogue row**, deferred to after beta (ADR 0110 E12.4, backlog 66).
**Say so before they answer.** Either way the answer decides whether a criterion reads *exempt and
correct* or *exempt and a known gap*, which read very differently to whoever builds the tall-body wave.

**Q-7D4-3 — three drawer fronts in a row at the cooking position. OPEN; the one most likely to change
something.** D6 makes the preparation cabinet a drawer body; 7D3 already makes the hob cabinet
`base-hob-2drawer` whenever the oven moves into a column. **Measured together: two drawer-fronted
cabinets stand side by side at the cooking position in 52.3 % of placed rooms, and three in a row in
11.7 %.** The two rules were ruled on different days in different waves and **the owner has never seen
them next to each other.** *Answer "fine":* D6 stands as written and the record gains the measured
share, so it is a knowing choice. *Answer "make them different":* the preparation body becomes
conditional on the hob's body — **a new rule, a new criterion, and the first place in this wave where
one body's identity depends on another's.** *Answer "doesn't matter":* built as the first, and recorded
as **not important to the owner** rather than as **approved** — six months from now those are different
facts.

**Q-7D4-4 — the price of variety, confirmed rather than assumed. OPEN; one line, ask it last.** Eight
storage cabinets go from 3 168 000 to **3 440 000 minor, +8.6 %** (G9, G3.7). The choice is already
theirs and this does not reopen it; the point is that ADR 0110 E12.3 records the `tall-pantry` choice
as knowing **because the number was in front of them**, and G9's number has not been. If they push
back, the answer is in D3: the cycle holds no ratio constant, so a cheaper cycle is a one-line change
rather than a redesign.

**A discrepancy of record, for the coordinator and not for the owner.** A relay dated 2026-09-15 has
the owner saying *"whenever it fits"* about **mechanisms**. This section has *"whenever it fits"* about
the **dishwasher** (D7, itself marked as a relay rather than a quotation), while **Q-D7** records the
opposite shape for the corner mechanism — *blind by default, mechanism in larger kitchens*, with no
number — and D8 records the owner pricing mechanisms out in general. **These cannot both be current.**
Either the dishwasher's ruling has been attached to the mechanism in passing, or the owner said
something new that **overturns Q-D7**. Under ADR 0119 it is **not treated as a ruling here and nothing
in this plan rests on it**; it affects **no 7D4 slice**, because the corner is unbuildable until a
corner body exists. **It would change 7D5 and the corner wave, so it is worth one line of
clarification before either is planned.** *(The other two relays check out: "drawers are often
preferred" is R1, recorded verbatim and at greater length; "lift mechanisms are very expensive, so for
sure the default will be the doors" is D8's third step, recorded verbatim, and is the basis of ADR
0117's whole lift section.)*

*(Q-D1 moved from open to answered on 2026-09-14.)*

**Q-D1 — which side of the sink does the dishwasher stand on? ANSWERED by the owner, 2026-09-14 —
their own words, not a relay:**

> *"dishwasher can be on left or right of the sink not mandatory left. Ideally directly near"*

**Neither reading below was chosen: the owner refused the question's premise.** Read as rules, for
wave 7D5 to build:

- **Either side of the sink is valid.** The wave **must not encode a left-hand preference**, and a
  test that asserts one is wrong. The planner still produces one deterministic layout — the quote
  permits a choice, it does not demand a coin toss — but *which* side is the planner's to decide by
  fit, not a rule to be asserted.
- **A useful freedom falls out: the dishwasher may go to whichever side fits.** A run that cannot
  take it after the sink may take it before, instead of dropping it.
- ~~**Adjacency is a preference, not an invariant.** *"Ideally directly near"* — **a dishwasher one
  slot from the sink is acceptable output, not a defect.** No criterion may fail a composition because
  the dishwasher is not touching the sink.~~
  **SUPERSEDED THE SAME DAY — adjacency is a RULE. Both quotes, so the progression is visible:**
  *"Ideally directly near"* became **"I preffer tha it will be like a rule, its most convienent
  placement and it should not be near only if is totally missing"** (owner, verbatim, 2026-09-14).
  **The dishwasher is directly adjacent to the sink — left or right, and *across the corner counts*
  (owner, 2026-09-15) — or it is not placed at all. There is no third state, and a dishwasher two slots
  from the sink is not a degraded layout but wrong output.** Read as three clauses:
  1. **Adjacency is a constraint, not a tiebreaker.** The planner **rearranges around it** rather than
     taking whatever fits — which reverses the *"chosen by fit"* framing of the struck clause above.
  2. **Either side stays valid.** *"left or right of the sink not mandatory left"* is **not**
     withdrawn; no test may assert a side.
  3. **The fallback is omission, never displacement.** Where the sink's neighbours cannot take it, the
     dishwasher is **dropped** — *"should not be near only if is totally missing"*.
- **Clause 3 closes a loop with an existing ruling rather than opening one.** It is the owner's earlier
  priority ruling arrived at from the other direction — *"if to choose between a dishwasher and a
  cabinet with drawers, cabinet with drawers have higher priority"*. Both say **the dishwasher is the
  thing that gives way**. **So a narrow kitchen losing its dishwasher is intended output, not a
  compositional failure**, and nobody may later read an absent dishwasher as a bug to fix.
- **What stands beside the sink today, measured — for 7D5 to plan against, and the reason clause 1 is
  harder than it sounds.** Over 217 213 sampled rooms in which a sink is placed:

  | what is on either side of the sink, on its own wall | rooms |
  | --- | --- |
  | `CORNER │ sink │ preparation` | **131 309 (60 %)** |
  | `preparation │ sink │ fridge` | 23 518 |
  | `fridge │ sink │ preparation` | 20 936 |
  | `storage │ sink │ fridge` | 13 614 |
  | `preparation │ sink │ FREE-END` | 8 659 |
  | `CORNER │ sink │ FREE-END` (the sink alone on its wall) | 7 422 |
  | the remaining four shapes, hob- or storage-sided | 11 755 |

  **In 67 % of rooms the sink is the first body on its wall, so one of its two sides is the structural
  corner and cannot be given to anything.** The dominant single shape is corner-on-one-side,
  preparation-on-the-other — **so in most kitchens the only slot the dishwasher can have is the
  preparation cabinet's**, and taking it pushes preparation and the hob 600 mm along the run.
- **The one slot two rules can both want, and it is already resolved.** Where the run affords exactly
  one body between the sink and the hob, D6's *preparation immediately before the hob* and clause 1's
  *dishwasher against the sink* want the same slot. **The owner has already ruled it** — *"if to choose
  between a dishwasher and a cabinet with drawers, cabinet with drawers have higher priority"* — so
  **the drawers win and the dishwasher is dropped**, which is clause 3 again. **No new owner question
  arises from this**, and 7D5 must not invent one.
- **How often that actually costs the kitchen its dishwasher — re-measured 2026-09-15 under the
  owner's corner ruling, because the earlier figure was derived from the overruled reading.** Modelling
  a `preparation` slot as contested (the drawers win) and a `storage` slot as free:

  | | rooms with a sink | share |
  | --- | --- | --- |
  | dishwasher dropped, **under the overruled reading** | 202 981 | **93.4 %** |
  | dishwasher dropped, **under the owner's ruling** | 98 275 | **45.2 %** |
  | **rescued by the across-the-corner slot** | **104 706** | **48.2 %** |

  **The overruled reading would have dropped the dishwasher from almost every kitchen this generator
  composes.** The reason is in the shape table above: the sink's same-wall neighbour is the preparation
  cabinet in 85 % of rooms, and the drawers win that slot — so with the corner closed off, most
  kitchens had no uncontested slot at all. Across the corner there is **storage** in 104 706 of the
  146 156 corner-adjacent-sink rooms, and a storage slot costs no core role to give away.

  **What this model does and does not prove.** It measures **slot availability** against today's
  planner, not final placement: 7D5's planner does not exist yet, and the contested/free split is the
  coordinator's reading of the priority ruling rather than a measured behaviour. **Treat 45.2 % as the
  order of magnitude and re-measure inside 7D5**, against its own planner. The load-bearing figure is
  not 45.2 % but the *difference* — the ruling roughly halves the drop rate.
- **Adjacency across the corner — ANSWERED by the owner, 2026-09-15, and it overruled the
  coordinator's reading.** Asked whether a dishwasher on the far side of the corner counts as adjacent
  to the sink, they said, verbatim: ***"yes, should be counted as near the sync"*** *(their spelling;
  they mean sink)*.

  **The rule: a dishwasher on the other wall, immediately past the corner cabinet, satisfies
  *"adjacent to the sink"*. The corner does not break adjacency.** Everything else stands unchanged —
  either side is valid, no test may assert a side, and the fallback is omission, never displacement.

  > ~~**The coordinator's reading is that it does not**, since a 900 mm structural corner physically
  > stands between the two carcasses and the plumbing argument (*"drains into the sink's waste"*)
  > assumes abutting bodies.~~ **OVERRULED. Struck in place, not deleted, so the next reader meets the
  > argument that lost instead of re-deriving it.** The reasoning was sound and the owner simply
  > decided otherwise: their *"near"* is about the working triangle, not about carcasses touching.
  > **It was marked as a reading, and that is the only reason it was asked rather than built** — it
  > governed 67 % of rooms and would have been wrong in all of them.
- **The coordinator's earlier reading — *"between sink and preparation"* — is superseded**, struck
  below rather than deleted, with the owner's words beside it.
- ~~**The standing rule applies, and the binary to watch for:** the quote does not say how far *"near"*
  may drift. If 7D5's implementation needs a hard bound — *at most one slot away*, say — **that is a
  specific choice to put back to the owner, not to pick.**~~ **CLOSED the same day: the bound is ZERO
  slots.** The question was right to ask and was one round short of settled; **it is struck rather than
  left standing, because an open question the owner has already answered is worse than one never
  asked.**

~~Both readings, kept whole:~~ **kept below as the record of what was put to the owner and refused.**

- **Reading A — *after* the sink in A1's own order: fridge → sink → dishwasher → preparation → hob.**
  The owner said *"dishasher is afetr sink"* in the left-to-right vocabulary they themselves set, so
  *after* is read there rather than reinterpreted. It also keeps the sink between the fridge and the
  machine, and leaves the preparation drawer immediately before the hob.
- **Reading B — the sink's far side, between the fridge and the sink.** The ergonomic case is real and
  is not a tie-breaker but an argument: **a dishwasher door drops flat into the floor in front of the
  machine**, and on the cooking side that is exactly where the cook stands. **This owner has ruled on
  motion four times in one day** — cutlery at the preparation drawer, plates over the sink, oil beside
  the hob, heat beside the fridge — and **more than once ruled against the obvious reading.**
- **Plumbing settles adjacency and nothing else**: the dishwasher drains into the sink's waste and
  takes its supply, so the carcasses must abut. Both readings satisfy it.
- *Coordinator's lean is A; it should still be their sentence rather than our reading of their
  preposition.*

**Q-D2 — is the dishwasher dropped first, before the fridge?** **Re-scoped 2026-09-14: the owner's
*"whenever it fits"* answers the frequency and leaves this open.** *Fit* says how often, not what gives
way when something must. *Recommendation: yes, it yields first.* A kitchen without a dishwasher is
ordinary; dropping it first preserves Amendment C's F3 order exactly (storage → fridge → preparation)
rather than reordering it; and the opposite order would drop the **fridge** — A1's own first item — to
keep a dishwasher. **Marked in the plan as an inference, not a ruling** (D7). **Blocks S5 only.**

**Q-D6 — the corner: blind cabinet, or no cabinet?** The owner ruled out the expensive mechanism and
chose neither of the other two. *Recommendation: ask, and tell them the cost asymmetry first.* **No
cabinet is what ships today and is free; a blind cabinet is a body the catalogue does not have** and
cannot be generated at all until the post-beta body deferral is lifted (C1–C3 above, ADR 0110 E12.4,
backlog 66). **Blocks nothing in 7D4** — the generator composes nothing into the corner either way.

**Q-D3 — in the 4.9 % of rooms where a wall-B storage slot, not the preparation cabinet, stands
immediately before the hob (G10, witness 1500 × 2800), should that slot be forced to a drawer body?**
*Recommendation: no, not in this wave.* R4 is a rule about the preparation role, and forcing a slot
would put a second authority beside the cycle and break its phase for one room in twenty. The
underlying oddity — the cut putting the hob alone on wall A with the preparation cabinet round the
corner — is A1's, not this wave's, and is the same family as 7D3's QT-5. **Blocks nothing.**

**Q-D4 — should the wall row vary too? ANSWERED by the owner, 2026-09-14, the same day it was asked,
and the answer folded the wall run into this wave.** The question as put — *"the wall row has no
drawer body, so half-and-half has no reading there; not in 7D4"* — was **overtaken**: the owner ruled
the wall level directly (R7–R10), and D8 is that ruling. The original recommendation is kept rather
than edited away, because the sequence matters: this plan proposed a deferral, the owner answered
instead, and **the answer was a rule about lifts that the deferral would have missed for a whole
wave.** What the deferral got right is also on the record — the wall row has no drawer body, and the
owner's own description confirms it is mostly doors.

**Q-D5 — should a long run carry a second lift? MOOT, and closed twice over.** First the band turned
out to be *"a rough impression, not measured"*, so it governed nothing and G15's 15.1 % was never a
shortfall; then the owner **ruled lifts out entirely on cost**, so there is no first lift for a second
one to follow. **Do not re-open it as a proportion question.** What the question got right is worth
keeping: a second lift would have needed a **placement reason**, and asking for one is what surfaced
that neither the band nor the placement survived.

**Q-D7 — the corner mechanism's threshold.** The owner ruled *blind by default, mechanism in larger
kitchens*, and gave no number. *Recommendation: propose the three-column tall block as the marker*
(32.8 % of placed rooms; witness pair 4500 × 1700 against 4499 × 1700), **and say plainly that it is a
proxy** — it stands for a price judgement, not for a geometric fact about the run, which is what made
7D3's own thresholds derivable. **Blocks nothing, and is moot until a corner body exists** (C2).

### Handed to wave 7F4 — an owner ruling recorded here, and not planned here

**A room just above the minimum generates a sink, a hob and two wall cabinets — no fridge, no
preparation surface, no storage.** Measured: **900 × 2200 × 2600** drops the fridge *and* the
preparation cabinet and composes no storage slot at all (witness table above).

**The owner ruled: generate it anyway, but warn** — the screen shows a message naming what had to be
dropped. *(Recorded from the coordinator's relay, **not verbatim**: no agent may quote it as the
owner's own sentence. Amendment F records it in this form and the wave that builds it should confirm
the wording with the owner.)*

**The ruling stands and is not to be reopened. But it is a rare path, and the warning must be the
cheapest honest thing that names what was dropped.** The owner's own reasoning is quoted in full above
and ruled as D10: customers without space mostly buy modular kitchens, customers who come to a
manufacturer mostly have space, and this scenario is *"very rare"*. Measured (G17), the
sink-and-hob-only kitchen is **5.1 % of placed rooms in a sweep that over-weights small ones**.

**So, explicitly, for 7F4's implementer: do not over-build this.** One message naming the dropped
roles, in the state the screen already has, reading `plan.dropped` as it stands. **No new sub-state,
no per-role explanation, no recovery flow, no dismissal persistence, no illustration of what a bigger
room would have given.** If the honest message needs one new string and one conditional, that is the
whole of it. **This sentence is here so that the plainness is read as a decision rather than as an
unfinished job** — the effort belongs in the long-run composition, which is what the customers this
product is for actually get.

**It is 7F4's, not 7D4's**, because it needs new copy and a new UI state and 7F4 is the wave that
wires generation to the screen. **The data it needs already exists**: `generateKitchen` returns a
`GenerationLog` carrying `plan.dropped`, a list of omitted **core** roles only (ADR 0110's 2026-09-12
*Clarification*, point 3 — a storage slot displaced while selecting the core is not an omission and
never appears there). Two things 7F4 must know:

- **`dropped` gains a member if 7D4's S5 lands**: `dishwasher`, alongside `fridge` and `preparation`.
  The copy must name all three, and criterion 18 is what stops a member reaching the seam with no
  meaning.
- **A dropped role is not a refusal.** *Minimum not met* — no sink or no hob — is the separate, already
  planned 1C state (ADR 0110 A2); this ruling is about a design that **is** produced and is thin.

### Wave 7D5 — approved 2026-09-14: the run gains the two bodies that take width

**Approved by the coordinator on D11's ruling.** Not planned here; this is its charter.

- **Goal: the two bodies that change the run's arithmetic rather than a body's identity** — the
  **dishwasher** (600 mm, beside the sink, D7) and the **bottle cargo** (300 mm, after the hob, D2.2).
- **Why they share a wave:** each re-baselines **the same two things** — 7D3's D2.2 block-threshold
  table and 7D3's criterion 12. Doing them together measures that once; doing them apart measures it
  twice, against two different baselines.
- **Depends on 7D4**, and on 7D3 through it. Same files, same serialisation.
- **What it inherits ready-made:** the dishwasher's frequency, ladder position and cost note (D7); the
  cargo's feasibility arithmetic and its *both neighbours ≥ 500 mm* rule (D2.2); criteria 16–18 above,
  already written; and risk R11.
- ~~**What it owes the owner first: Q-D1**, which side of the sink, deliberately left open (D11).~~
  ~~**Q-D1 is answered: either side, and *"ideally directly near"* is a preference, not an
  invariant.**~~ **Q-D1 is answered twice, and the second answer is the binding one (owner,
  2026-09-14): either side, and adjacency is a RULE — *"it should not be near only if is totally
  missing"*. The dishwasher abuts the sink or is dropped. This wave owes the owner nothing further on
  it.**
- **What that changes for this wave's shape, and it is not nothing.** The dishwasher was charted here
  as one of *"the two bodies that change the run's arithmetic"* — a **width** story. Adjacency makes it
  additionally a **placement constraint on the sink's neighbours**, which the cargo is not. **The
  charter still holds** — both bodies still re-baseline the same two things, which is why they share a
  wave — **but the planner work is no longer symmetric between them, and the wave's slice order should
  be planned against that rather than inherited from this bullet.**
- **And the constraint reaches across the corner** (owner, 2026-09-15): a sink at the start of its wall
  may take its dishwasher from the **other wall's corner-most slot**. So the dishwasher is the first
  generated body whose placement is **not confined to one wall's run**, which every planner rule in
  7D1–7D4 has been. **7D5 should treat that as its most likely source of surprise** — the wall cut, the
  reversed spatial order on wall B, and `plannedVoid`'s per-wall lookup all assume a body belongs to one
  run. **Nothing here says it is hard; it says it is the thing to look at first.**
- **One question to put back only if the build forces it, and not before.** The owner's ruling settles
  that across-the-corner counts. It does **not** rank an across-the-corner slot **against** a same-wall
  adjacent one where both are free. **Do not invent a preference.** In the measured shapes that choice
  barely arises — where the corner slot rescues the dishwasher, the same-wall slot is the contested
  preparation one, and the priority ruling already says not to take it — so this is expected to stay
  theoretical. **Flag it if it becomes real.**
- **Its hardest single obligation** is restating 7D3's criterion 12 against its own planner and
  recording the restatement in the ADR — **not editing a 7D3 assertion**, which is a finding.

### The corner — RULED by the owner, and not buildable by this generator

**The ruling, 2026-09-14: a blind corner cabinet by default, with a mechanism in larger kitchens.**
Their earlier note is the reason and still stands — *"it can have mechanisms but those mechanisms are
very expensive"* — so the corner is enclosed and usable at no added cost in the ordinary case, and a
carousel or pull-out appears only where the kitchen is already large. *(Recorded from the
coordinator's relay, **not verbatim**, apart from the quoted clause.)*

**The plain answer first, because it governs everything below: neither half of this ruling is
buildable today, and the blocker is a missing body rather than a missing rule.** C2 is the whole of
it — there is **no insertable corner row in the catalogue at all**, so `insertBody` cannot place a
blind corner in any room, at any size, and no threshold can change that. **The ruling needs a wave that
makes a corner body placeable before it needs a threshold**, and until then 7D4 composes the corner
exactly as it does today: nothing. **This is reported rather than worked around**, so the owner can be
told that their ruling is recorded and waiting on a body, not quietly missed.

| # | Fact, measured or read | What it means for the choice |
| --- | --- | --- |
| C1 | **The generator composes nothing into the corner today.** The shell inherits the corner from `STRUCTURAL_ASSEMBLY`, filtered to the pieces that fit under the ceiling (`shell-design.ts:186-190`), and both runs start past it — wall A at 900 mm, wall B at 900 mm. | *"No cabinet at all"* is **what ships today**, costs nothing to keep, and is what every measurement in this plan was taken against. |
| C2 | **There is no insertable corner row in the catalogue at all.** The four corner bodies are **seeded**, and they declare **no catalogue equivalent** because §13.1 says a corner cannot be swapped (`catalog.ts:1159-1160`, `:1234`). `toInsertableBody` returns `undefined` for a seeded row and `insertBody` turns that into `NOT_INSERTABLE` (`catalog.ts:1311-1316`). | **A blind corner cabinet is not placeable by this generator, at any room, today.** It is not a rule that is missing — it is a body that does not exist. |
| C3 | **What one would cost to add:** a `catalog.ts` row, a builder in `packages/three-adapter`, a price rule, a `kind` leaf in **both** message catalogues (ADR 0095), and the fidelity and parity coverage every body carries. | Exactly the cost `docs/backlog/open.md` entry 66 records for a new body — which **the owner deferred to after beta testing** (ADR 0110 **E12.4**). A blind corner would be the first exception to that deferral. |
| C4 | **7D3's field evidence: the corner is continuous worktop in all eight of the owner's own built kitchens**, and no column ever turns it. | The photographs corroborate C1 rather than arguing for a blind cabinet, though they say nothing about what is *under* that worktop. |

**So the ruling costs a body, and the body sits under a deferral the owner themselves set.** A blind
corner is a new catalogue row under backlog 66 / ADR 0110 **E12.4** — *"adding new cabinets will be
like after having the beta testing"*. It would be the **first exception** to that deferral, and whether
to make it is theirs to decide with the cost in front of them.

**The mechanism's threshold, derived — and the derivation's honest limit, stated first.** 7D3's block
threshold was derivable because it answered a **geometric** question: *does the run have room for this
body?* **The corner mechanism's threshold answers a different kind of question** — *is this customer
price-insensitive?* — and that is **not a property of the run**. There is no customer budget input and
this plan invents none (R5). **So any threshold here is a proxy, and it must be labelled one.**

**The best proxy available, and it is already derived, measured and owner-anchored: the kitchen carries
a three-column tall block.** 7D3's D1.2 caps the block at three on the owner's own *"two, three
columns"*, and reaching that cap is this composer's existing marker for *"this room is large"*. It
inherits every property that made 7D3's threshold good — it is computed from the run's own arithmetic,
it moves by itself if a width changes, and it hardcodes no millimetre.

| Measured over the 10 mm sweep (211 551 placed rooms) | Share |
| --- | --- |
| No block — the room is not large by any reading | 92 740 (43.8 %) |
| One column | 24 660 (11.7 %) |
| Two columns | 24 660 (11.7 %) |
| **Three columns — the proposed mechanism band** | **69 491 (32.8 %)** |

**Witness pair, from 7D3's own measured table: 4500 × 1700 gets the mechanism and 4499 × 1700 does
not** (three columns against two). **Recommendation: put this to the owner rather than adopt it** —
`Q-D7`. A third of kitchens is a defensible reading of *"larger kitchens"*, but it is the
coordinator's proxy for a price judgement the owner made, and unlike the block threshold it is not
derivable from the thing it governs. **It is moot until a corner body exists**, which is why it is a
recommendation and not a ruling.

### Handed to the deferred top-row wave — a physical rule, recorded and not built

**The top level is mostly lift cabinets, and the reason is the ceiling** (R10; the owner's words are
quoted in full above). Their reason, **stated first because it is physical and not aesthetic**: they
use a **stretch ceiling**, whose material damages easily, and *"if I would use a door, by opening and
closing it, the top corner of the door has a big probability to damage the material on the ceiling."*
A lift opens upward and away from it; a hinged door's top corner sweeps into it.

**This is the same species as ADR 0110 E10's oven-beside-fridge rule**, and it is recorded the same
way for the same reason: **a later reader could mistake it for a styling preference and trade it
against a layout or cost argument.** A layout argument can be answered with another layout argument; a
customer's marked ceiling cannot. **Whoever plans the top-row wave starts from *"lift, because of the
ceiling"*, not from *"doors, like the row below"*.**

**Nothing here is built.** The top row (2200–2600) stays uncomposed — 7D3's D8 and ADR 0110 **E11**,
the owner's own confirmed exclusion — and **this wave adds no criterion and no code for it**. Two
things it does add for whoever picks it up:

- **It sharpens 7D3 D8.3's framing.** That ruling says the eventual fix is *taller uppers*, not a
  composed top row. R10 adds that when the uppers grow, the added band **is not simply more cabinet**:
  the top band has a different opening mechanism, for a stated physical reason. A wave that only
  stretches `wall-cabinet` upward would satisfy D8.3's letter and walk straight into R10.
- **The body already exists.** `wall-lift` is `'fit'`, `heightFlex: true`, and priced (G14, G16) — the
  same properties that make it a drop-in in the wall row make it one in the top row. **The expensive
  half is the band, not the body.**
- **The clearance, and it bites here even though it does not bite in 7D4.** A lift mechanism needs
  roughly **120–165 mm above the cabinet** to swing up (4.75–6.5 in, with door height). **The top row
  is the band that runs into the ceiling**, so the mechanism chosen *to protect* the stretch ceiling
  can **foul** it if the top cabinet is planned flush. **Whoever plans that wave checks the clearance
  against the room height before choosing the body** — otherwise the fix and the hazard are the same
  object. *(Sources as in D8.)*

### The division of labour between generation and presets — a principle, and it needs its own record

**The owner, verbatim, 2026-09-14:**

> *"After you'll generate, I will play with the generated kitchens. And when… where I will think that
> it fits to have a lift cabinet, I will add it, and we'll save it as a preset, and you will load the
> preset. And the preset when we'll be able to… when the walls will have a preset, we will load the
> presets, and it will include this. But by default, let you doors. Doors only."*

**The principle: generation produces a correct, cheap baseline; the owner's taste enters through
presets, not through generation rules.** They take a generated kitchen, add what judgement says belongs
— a lift where it fits — and save it as a preset; a later customer with matching walls gets the refined
kitchen instead of the bare one.

**Four consequences, and the first is retrospective.**

1. **It justifies a class of decisions that were each argued separately, and shows they were right for
   a reason nobody had articulated.** Not generating open shelves (D8/R9), not generating mechanisms
   (the corner), not housing the fridge (7D3 QT-1), doors-only uppers (D8): four refusals defended on
   cost, on regional habit, on price and on taste. **They are one rule** — *if it is a judgement call,
   generation does not make it; a preset does.*
2. **It changes what *good* means for this algorithm.** Generation does not need to produce the kitchen
   a designer would draw. It needs to produce one that is **correct, complete and cheap, and that a
   human can improve in a few moves.** **7D4's criteria should be read against that target**, which is
   materially easier than the one the eleven-identical-cabinets problem first implied.
3. **It raises the stakes on the preset waves.** 7P1, 7P2 and the *save as preset* control are **not a
   convenience feature — they are the mechanism by which quality enters the product at all.** Noted
   against those waves below.
4. **It gives a standing test for every future rule of this shape.** When someone proposes generating a
   body because it looks better, the question is: **is this correctness, or is this taste?** Taste goes
   to presets.

**D8's withdrawal is this principle's worked example, not a change of mind.** The owner described
lifts, admitted the proportion was a guess, priced the mechanism, and then said where the lift really
belongs: *"I will add it, and we'll save it as a preset."* **Read through this principle the reversal
is an application of a rule rather than a reversal at all** — the lift was always a judgement call, and
judgement calls do not live in the generator. D8 cross-references here for that reason.

**Where it should be recorded — the coordinator asked, and my answer is: its own ADR, not only
Amendment F.** Reasons, with the counter-argument stated:

- **It is not a rule about how generation inserts** (ADR 0110's subject) **and not a rule about what a
  preset is** (ADR 0109's subject). **It is the rule that allocates decisions between them**, and it
  will be cited by preset and matching waves — 7B, 7C, 7P1, 7P2 — whose implementers have no reason to
  open ADR 0110 at all. **Burying a cross-cutting principle inside one wave's amendment to one record
  is how it gets missed.**
- **The counter-argument, and it is real:** ADR 0110 has been the single authority for composition
  since Amendment A, and this principle *does* constrain composition. **The answer is a pointer, not a
  fork:** the new record is the authority, and **Amendment F carries one line naming it**, so
  composition's own record still leads a reader to the rule that bounds it. The same line belongs in
  ADR 0109.
- ~~**Recommendation: a new ADR (next free number), with pointers from ADR 0110 Amendment F and
  ADR 0109.** **Not written** — the coordinator asked to be told before an ADR file is touched, and
  this is the telling.~~
- **WRITTEN 2026-09-14 as [ADR 0117](../decisions/0117-generation-produces-the-cheap-correct-baseline-and-the-owners-taste-enters-through-presets.md)**
  — *Generation produces a correct, cheap baseline, and the owner's taste enters through presets*. It
  is the authority; this section is the draft it was written from, and **where the two differ the ADR
  is binding**. ADR 0109 carries its pointer; **ADR 0110's Amendment F must carry the same line when
  7D4's slice S0 writes it** — that amendment does not exist yet, which is why the obligation is
  recorded here and in 0117's consequences rather than written into 0110 by someone who is not
  authoring 7D4's rulings.

**No 7D4 criterion changes on the strength of this.** Everything already settled stays settled; the
principle explains the settlements rather than reopening them.

### Handed to the preset waves — 7P1, 7P2 and the *save as preset* control

**They are the quality mechanism, not a convenience.** Under the principle above, **every judgement
call this generator refuses to make is deferred to a preset**, so until a preset can be authored,
saved, matched and loaded, **the product ships only the cheap baseline and has no route to the refined
kitchen the owner described.** Two things for those waves to carry:

- **The owner's own workflow is the acceptance test**: generate → adjust → *save as preset* → a later
  customer with matching walls loads it. If that loop does not close, the principle has no effect.
- **The lift is the first named example of something that only a preset can supply** (D8). A preset
  library with no way to carry a `wall-lift` into a matched kitchen would silently drop the one body
  the owner said they would add by hand.

### Two things recorded from the owner's own kitchen that are not rules

- **Their kitchen is linear, 3700 mm, and this generator refuses linear rooms today.** Its contents, in
  their words: *fridge, sink, cabinet with drawers, hob, and a tall cabinet covering the house's
  thermal system.* **It is the clearest statement yet of what a real linear kitchen holds**, and it
  belongs to wave **7J**, which builds straight kitchens. Worth carrying because the owner described a
  layout the product cannot yet produce while explaining a rule for one it can.
- **A boiler or service housing is a full-height body the catalogue does not have.** *"The tall cabinet
  that covers the thermal system of entire house"* has no catalogue row, no equivalent and no role in
  `GENERATION_PRIORITIES`. **Not a request and not actionable now** — it is **evidence for backlog 66's
  tall-body gap**, alongside the broom/utility unit already recorded there: the three full-height rows
  the catalogue has do not cover what the owner's customers actually build.

### Verification

Per-package `vitest` for `configurator-domain` and `three-adapter`, `typecheck`, `lint`, and a
whole-tree `pnpm format:check` at the wave's end. **No e2e, no Playwright, no visual capture** — the
wave has no surface. The property suites state their seeds and their per-arm counts in the test names.
The scratch probes that produced G1–G3, G9, G10, G15, G17 and the witness table are reproducible
against the package's built `dist/generation/`; an implementer who disagrees with a measured figure
**re-measures it and reports, rather than adjusting the plan**. **G15 and G17 are the two figures most
likely to be mistaken for targets** — they are consequences of the rules, and nothing asserts either.

## Wave 7D6 — dispatchable punch list: the corner's reach is derived from the cabinet depth

**Tier: Full.** No visual surface *(7D7 carries the 3D half)*. **Owner answers needed to dispatch:
none — but the wave may raise one, and it is the most consequential in M7's domain work:** if the
derived reach differs from today's, an **owner-approved room bound moves**. See *The three
owner-facing numbers*. **Depends on nothing unbuilt**; 7D1 and 7D2 are shipped and this wave changes
how one of their inputs is derived, not what it means.

**What the owner asked for**, 2026-09-14: *"use the corner cabinets that we have now"* and *"update
the generator to generate corner cabinets with the correct shape and size."* **No new body** — the
four shipped corner rows stay, and their dimensions stop being literals.

**ADRs to check intent against first, and to stop and report on if they disagree:**
[0110](../decisions/0110-generation-inserts-through-the-command-path-and-the-corner-is-structural-data.md)
decision 1 and Amendment B (the shell authors the corner), and its 2026-09-14 *Clarification*;
[0021](../decisions/0021-corner-returns-are-structural-in-data.md) (corners are structural in data);
[0108](../decisions/0108-a-room-is-validated-against-policy-data-and-the-interim-policy-is-the-engines-own-limits.md)
Amendments A, B and D (**the wall minima are derived from the corner and were approved by the owner
personally**); [0089](../decisions/0089-the-along-wall-chain-is-kept-and-its-reader-is-the-depth-command.md)
and [0090](../decisions/0090-a-frozen-space-slides-with-its-run-and-follows-the-body-it-recorded.md)
(the along-wall chain, which is what slides the corner today);
[0065](../decisions/0065-a-body-past-the-end-of-its-wall-is-marked-not-moved.md) (**a body past its
wall is marked, not moved** — read it for what a *grown* reach does to a generated kitchen at
development time; ~~the stored-design consequence~~ is struck, there being no stored designs);
`docs/design/DEVELOPMENT-SPEC.md` **§13.1** *Corners are structural* and **§13.3 open question 6**.

### Read this before anything else: what is and is not missing

**The generator already places corner cabinets in every kitchen it composes, including the smallest
room the policy admits.** Measured directly from `buildLShellDesign`, at 900 × 1000 × 2200 through
6300 × 5100 × 2600: `base-corner-x-900` on wall A, `base-corner-return-320` on wall B,
`wall-corner-return-570` at the wall row, and `wall-corner-return-570-top` where the ceiling reaches
2600. Both runs start at **900 mm — the corner assembly's own far edge** — so **composition already
starts from the corner and fits what remains between it and each wall's end**, which is the owner's
rule 2, shipped in 7D1.

**The true-but-misleading fact that must not be reconnected wrongly.** The four corner rows are **not
insertable** — `toInsertableBody` returns `undefined` for a seeded row and `insertBody` answers
`NOT_INSERTABLE`. That is true, and it does **not** mean the corner is absent. **The generator does not
insert corner bodies because the shell authors them; that is the design, not a gap**
(ADR 0110 decision 1, Amendment B1, and its 2026-09-14 *Clarification*). Reading the first fact as
*"the corner is empty"* once produced a report to the owner that the product omits corner cabinets.

**So "make the corner placeable" means "make it correctly sized", never "route it through
`insertBody`".** A corner body spans **two walls**; the void and column model is **per wall**
(`deriveColumnKeyAt`, `alongWallPosition`), and `findCornerOverlaps` exists to police exactly that.
Making a corner insertable is a far larger change than making it derived, **nothing in the owner's
instruction asks for it, and this wave must not do it.**

**Wave 7D4's Q-D6 is a different question** and does not overlap: that asks whether a **blind corner
cabinet** — a new body, for the space *behind* the assembly — should exist, and it is blocked on the
post-beta body deferral. This wave adds no body.

### Ground truth, measured at `8d73385`

| # | Measured | Consequence |
| --- | --- | --- |
| K1 | **Every corner width is a literal that does not follow the cabinet depth.** `base-corner-x-900` is 900, `base-corner-return-320` is 320, both wall returns 570 — **identical at 600 mm and at 700 mm**. What moves with the depth is the **position**, through the along-wall chain. | This is the whole of *"correct shape and size"*. The corner does not resize with the kitchen it belongs to; it slides. |
| K2 | **At 600 mm all four pieces land flush: far edge exactly 900 on both walls.** | Today's runs start at 900/900, and **every 7D3 and 7D4 measurement was taken against that origin.** |
| K3 | **At 700 mm they no longer agree: the base row reaches 1000 while the wall row reaches 970 — a 30 mm disagreement between rows**, produced by two chains sliding fixed widths rather than by either width being re-derived. | **The concrete motivating defect.** It is a fidelity defect at the deeper declared depth, not a missing cabinet, and it is what the owner's instruction actually names. |
| K4 | The shell validates clean at 600 mm in every room sampled — zero `validateDesignForCatalog` findings at 900 × 1000, 3600 × 2920 and 6300 × 5100. | **Nothing is broken today at the shipped depth.** This wave is correctness at the *other* depth, and derivation in place of literals. |
| K5 | **Run origins are on the grid and stay there.** 900 on both walls: `% 50 = 0`, `% 100 = 0`. The 570 mm return's non-grid width **never reaches the run origin**, because a run reads the **assembly's far edge**, not any single piece's width. | A worry worth having had, and it does not bite: neither ADR 0052's 800 mm merge cap nor 7D3's ≤ 200 mm absorb window is affected. At 700 mm the wall row's origin would be 970 — off the 50 mm grid — but **generation never sees it**: the shell is built at 600 and a depth change is a later customer edit. |
| K6 | §13.1's *"Corners are structural"* rationale is **"No replace, no delete, never a width donor. A sink-in-corner request is a custom product, not a loosened rule."** | It governs **customer editing**, says nothing about who authors a corner, and **is untouched by this wave**. Nothing needs loosening. |
| K7 | §13.3 open question 6: *"Hob and corner widths are still fixed in geometry; parameterising them is the remaining builder work."* | **The spec already carries this as its own open question.** It is `three-adapter` work and it is **wave 7D7**, not this one. |

### Pre-flight — a gate on wave 7D3's dispatch, and the cheapest thing in this plan

**Before 7D3 is dispatched, derive the corner's along-wall reach at 600 mm depth and assert it equals
900 mm.** One measurement, one assertion.

- **900 is the owner-approved reference, not a coincidence**: it is the reference kitchen's own corner,
  and ADR 0108 Amendment B's approved wall-A minimum of 900 is derived from it.
- **If it reproduces 900**, 7D3 dispatches unchanged and 7D6 is a pure refactor at the shipped depth.
- **If it does not**, 7D3's *rules* all survive but its **threshold table dies**: 3300 / 3900 / 4500,
  the 3299 boundary and the absorb-window population were all measured from a 900 origin and shift by
  the delta. Re-measuring is hours, not a re-plan — **but it must happen before 7D3's criteria are
  written, not after they fail.**
- **7D4 is unaffected either way.** It measures leftover from the run origin, whatever that origin is.

### The three owner-facing numbers the reach is the root of

**The corner's reach is not a local geometry constant.** `farthestCornerEdgeMm` feeds
`ENGINE_ROOM_LIMITS`, and from there:

1. **The wall minima** — wall A ≥ 900, wall B ≥ 1000 — which the owner **approved personally** under
   Q1 (*"Yes looks like good boundaries"*, ADR 0108 Amendment B).
2. **7A2's `ROOM_TOO_SMALL_FOR_KITCHEN`**, derived from the reach plus the sink and hob widths: it
   decides which rooms Step 1 refuses outright.
3. ~~**Stored-design validity** — every saved design was written against today's reach.~~ **Struck
   2026-09-14: there are no saved designs.** It becomes true again at wave 7P2 — see *the freeze
   point* below. **Two numbers, not three, until then.**

**The asymmetry, and it is the heart of this wave's risk:**

| direction | what happens | who notices |
| --- | --- | --- |
| **Reach grows** | The engine minimum passes the approved bound. `room-policy.ts`'s own contract fires: *"an engineering change that moves a limit past an approved bound turns a test red instead of silently moving what a customer may enter."* | **Loudly — a guard test.** But the fix is not an engineering choice: **Q1 goes back to the owner**, because they approved 900/1000 themselves. |
| **Reach shrinks** | The approved bound stays, now stricter than the engine needs. **Nothing fails.** The product silently refuses rooms it could build. | **Nobody. This is the direction that needs a criterion written for it** (criterion 4), because nothing catches it today. |

**~~The stored-design consequence~~ — VOIDED by the owner, 2026-09-14, and struck rather than left as
a hypothetical.** It read: a grown reach pushes the corner past a short wall, ADR 0065 marks rather
than moves it, and a customer reopens a saved kitchen to find it red. **It cannot happen.** The owner:
*"there are no existing saved kitchens at the moment… until we'll not implement all the milestones,
and I will not explicitly mention that we move it to production, we are pretty safe to not worry about
existing kitchens."* **Nothing is stored, nothing is in production, and nothing will be until every
milestone is implemented and the owner says so explicitly.** A risk that cannot fire is noise that
makes the real one harder to see, so it is struck here rather than carried.

**What that makes materially easier, stated plainly because the plan otherwise implies a delicacy that
no longer applies: 7D6 may re-derive the corner freely.** No migration, no compatibility window, no
frozen bounds, no stored geometry to honour. **Re-deriving a number the owner approved still needs
their ruling — but it is a conversation, not a data problem.**

**The freeze point is real, and it is not far away.** The owner names it: *"a critical moment will be
when I will start to save presets."* **Presets are the first durable artefact this product will hold**
— authored by the owner, matched against a customer's walls, and outliving the wave that wrote them.
**From the moment preset authoring ships (wave 7P2), the corner's reach, the wall minima and
`ROOM_TOO_SMALL_FOR_KITCHEN` become load-bearing on stored data and stop being freely re-derivable.**
So this is a **deadline, not a caveat: geometry that wants re-deriving is re-derived before 7P2, not
after.** The owner's own ordering after that point, recorded so the preset waves can see it: M8's
review / contact / share page, then customer profiles, then a further milestone for deployment,
production readiness and a security audit.

### Rulings

**J1 — what "correct shape and size" resolves to: a function of the cabinet depth and the two wall
directions, and of nothing else.** A corner cabinet's size does **not** depend on the room — there is
**one correct corner per declared depth**. So the wave replaces four literals with one derivation and
changes no behaviour at 600 mm, where the derivation must reproduce the reference kitchen.

**J2 — the corner is authored by the shell, and stays so.** No corner body becomes insertable, no
catalogue row is added, `toInsertableBody` is untouched, and the per-wall column model is not taught
about two-wall footprints. **Must-not, not merely out of scope.**

**J3 — the wall row and the base row must agree at every declared depth.** K3's 30 mm disagreement is
the defect. The two rows' reaches are derived from the same depth, so they cannot drift apart.

**J4 — no approved bound moves silently, in either direction.** Criterion 4 asserts the approved
minima and the derived reach **agree**, rather than only that the approved ones are not lower.

### Module boundaries

- **The derivation is one pure function with one caller apiece.** It answers *"how far does the corner
  assembly reach along wall W at cabinet depth D?"* and is read by `ENGINE_ROOM_LIMITS`
  (`farthestCornerEdgeMm`) and by the shell's `floorRunStartMm` / `wallRowStartMm`. **Two readers, one
  authority** — today both re-derive it from the fixture's placements.
- **The fixture keeps its placements**; what changes is that their along-wall widths come from the
  derivation rather than from stored literals.
- **`along-wall-chain-shift.ts` is read, not rewritten.** The chain is how a corner *slides*; this wave
  is about how it is *sized*. If the derivation makes part of the slide redundant, **report it — do not
  remove it in this wave.**
- **Nothing under `packages/three-adapter` is touched.** The builders are 7D7's.

### Files, and the must-not-change set

**May change:** `packages/configurator-domain/src/room/room-policy.ts`;
`src/generation/shell-design.ts` (the two run-start helpers only);
`src/fixtures/kitchen-l-design.ts` (the corner placements' widths);
a new pure module for the derivation; `src/index.ts` (exports only); the paired tests, plus the guard
test that holds `APPROVED_ROOM_POLICY` against `ENGINE_ROOM_LIMITS`.

**Must not change:** `src/catalog.ts` — **no row gains or loses insertability**; `src/commands/**`;
`src/void-engine.ts`; `src/module-grid.ts`; `src/validate-design.ts`;
`src/room/approved-room-policy.ts` — **the owner's literals are not edited by this wave; if the
derivation disagrees with them, the wave stops and reports**; `src/generation/generate-kitchen.ts`,
`generation-priorities.ts`, `leftover-rule.ts`, `tall-end-rule.ts` — **7D3's and 7D4's files**;
anything under `packages/three-adapter` or `apps/web`.

### Acceptance criteria

1. *(unit, the pre-flight)* **The derived reach at 600 mm is 900 mm on wall A and 900 mm on wall B**,
   equal to the reference kitchen's own corner, asserted as a literal so a change is visible as a
   failing number. **Must not:** a test that compares the derivation only against itself.
2. *(unit, boundary — the motivating defect)* **At 700 mm the base row and the wall row reach the same
   figure on wall B.** K3's 1000-versus-970 disagreement is gone, and the test names both rows.
   **Must not:** the two rows agreeing at 600 and drifting at 700.
3. *(property, over both declared depths and every room in the approved policy)* The shell reports
   **zero** `validateDesignForCatalog` findings and no overflowing placement, **at each declared depth
   and after `setCabinetDepth` between them** — the invariant 7D1 criteria 2 and 9 already hold, now
   re-run against the derivation.
4. *(unit — the criterion nothing has today, J4)* **The approved minima and the derived reach agree.**
   `APPROVED_ROOM_POLICY`'s wall-A and wall-B minima **equal** the derived reach at the depth that
   maximises it, not merely *"are not below"* it. **Must not:** a guard that passes when the derivation
   shrinks — that is the silent direction, and this criterion exists for it alone.
5. *(unit)* **No insertability changes.** The count of insertable rows is **16**, unchanged, and no
   row whose `structuralReason` is `"corner"` is among them. **Must not:** a corner row gaining a
   catalogue equivalent.
6. *(unit)* **Run origins stay on the grid at the shipped depth** (K5): 900 on both walls,
   `% 50 === 0`. **Must not:** a derivation that lands a run origin off the 50 mm grid at 600 mm.
7. *(unit, boundary)* The smallest approved room, **900 × 1000 × 2200**, still holds its corner
   assembly and still returns *minimum not met* from `generateKitchen`. **Must not:** the smallest room
   changing its answer as a side effect.
8. *(unit)* **7D3's origin is unmoved**, asserted here rather than in 7D3: `lShellFloorRuns` returns
   `A.startMm === 900` and `B.startMm === 900` at 600 mm for the rooms 7D3's threshold table names
   (3300 × 1700, 3900 × 1700, 4500 × 1700, 4000 × 3000). **Must not:** this wave moving a number 7D3
   measured, without 7D3's table being re-measured in the same commit.
9. *(unit)* **Determinism:** the same room and depth give a byte-identical shell.
10. *(lint / grep in a test)* **No corner width survives as a literal** under `src/generation/` or
    `src/room/`: `900`, `320` and `570` do not appear as corner dimensions outside the fixture and the
    derivation. **Must not:** a constant "kept in sync" with the derivation — that is the second
    authority [ADR 0102](../decisions/0102-a-recorded-source-must-explain-its-depth-and-a-second-authority-in-a-test-is-the-defect-laundered.md)
    forbids.

### Slices, in dependency order — dispatched one at a time

- **S1 — the pre-flight, alone.** Derive the reach, assert 900/900 at 600 mm, and **report the number
  before writing anything else.** If it is not 900, stop: the coordinator decides whether 7D3's table
  is re-measured first. **This slice exists so the expensive discovery happens in an hour.**
- **S2 — the derivation and its two readers**, with criteria 1–3 and 5–9. Behaviour at 600 mm is
  byte-identical; the only visible change is at 700 mm.
- **S3 — the agreement guard** (criterion 4) and the literal sweep (criterion 10). Separate because it
  is the criterion most likely to turn red for a legitimate reason, and its failure is a **report to
  the owner**, not a fix.

### Risks

1. **The silent shrink — now the wave's principal risk, and the only one with no natural alarm.**
   Nothing today fails when the derivation is more conservative than the approved bound; the product
   then quietly refuses rooms it could build, and no test says so. **It was previously the second item
   here because the stored-design risk stood above it; that risk is struck, and this one moves up.**
   Criterion 4 is the only thing standing in front of it and **must be written as an equality**, not as
   *"not below"*.
2. **An approved bound moved without the owner.** `approved-room-policy.ts` is in the must-not-change
   set for this reason. **If the derivation and the owner's literals disagree, the wave stops and
   reports** — the number is theirs, not the implementer's. **This is the loud direction and the guard
   already catches it**, which is precisely why item 1 outranks it.
3. ~~**The stored-design consequence.**~~ **Struck 2026-09-14 — there are no stored designs, and
   nothing is in production until every milestone is implemented and the owner says so.** Kept as a
   struck line rather than deleted, because it **returns at wave 7P2** when the owner begins saving
   presets, and a later reader who finds it missing may re-derive it as new.
4. **7D3's table quietly invalidated.** Criterion 8 pins the origin this wave must not move; the
   pre-flight is what makes the risk cheap.
5. **Removing chain-shift code that looks redundant.** The along-wall chain has readers beyond this
   wave (the depth command, the frozen map). Report, do not delete.
6. **Reading "placeable" literally.** J2 is a must-not for this reason; the whole per-wall column model
   would otherwise be in scope.
7. **Leaving this wave until after 7P2.** The freeze point above is a real deadline: once the owner
   begins saving presets, the corner's reach is load-bearing on stored data and risk 3 stops being
   struck. **The cheapest moment to re-derive this geometry is now.**

### Owner question — raised only if the derivation moves a number

- **Q-K1 — if the derived reach differs from 900 / 1000, may the approved wall minima move?** Not asked
  unless the pre-flight or criterion 4 turns red. **It is a conversation, not a data problem:** nothing
  is stored and nothing is in production, so there is no migration behind it and no compatibility
  window to hold open. ~~Put it with the stored-design sentence about a customer reopening a saved
  kitchen~~ — **struck, and it must not be used to argue for caution here.** **Recommendation if it
  arises:** take the owner's ruling on the bound before any code lands, and **ask it before 7P2**,
  while the answer is still free.

## Wave 7D7 — dispatchable punch list: the corner builders take their size as a parameter

**Tier: Full, 3D — the `lemnaria-3d-reference` skill applies.** **Visual: yes.** **Depends on 7D6**
(the domain must know the correct size before a builder can be asked to draw it) **and on 7H, for
ordering rather than for content — see the baseline constraint.**

**This is `DEVELOPMENT-SPEC.md` §13.3 open question 6 being closed:** *"Hob and corner widths are still
fixed in geometry; parameterising them is the remaining builder work."* The spec has carried it as an
open question since before M7; the owner's *"correct shape and size"* is what makes it due. **Scope
here is the corner only** — the hob half of that sentence stays open and is not this wave's.

**Anchor, scaling rule and structural dependencies**, per `docs/best-practices/product-invariants.md`:

- **Anchor:** the corner at (0, 0, 0), where wall A's plane (z = 0, fronts +Z) meets wall B's
  (x = 0, fronts +X) — `packages/configurator-domain/src/room-transforms.ts:29-49`. **The anchor does
  not move**: the corner assembly grows away from it along each wall, never through it.
- **Scaling rule:** each corner piece's **along-wall length** becomes a function of the cabinet depth
  (7D6's derivation). **Its depth already follows the setting and must keep doing so unchanged.**
  Nothing else scales — not the door leaves' thickness, not the handles, not the chamfers, not the
  plinth height.
- **Structural dependencies:** the worktop runs continuously through the corner (7D3's field evidence,
  in all eight of the owner's built kitchens) and must still do so at every depth; the run-end panel
  follows the records and not the corner (ADR 0045); the wall corner return's relation to the base
  corner is **measured before it is changed**, because K3's 30 mm disagreement is exactly that relation
  going wrong.

### The ordering constraint — put on both waves' rows deliberately

**7D7 lands on the builder the M1 fidelity gate diffs, so a re-baseline is likely, and 7D7's baseline
must be taken *after* 7H lands — never before.** 7H argues it needs no re-baseline because its change
sits *downstream* of that builder; 7D7 changes the builder itself. Running them in the other order, or
concurrently, produces a baseline that silently contains half of 7H. **The two must not be in flight
together**, and the visual verifier owns the tree while it captures (`docs/best-practices/browser-and-visual-qa.md`).

### Acceptance criteria

1. *(fidelity)* At the reference room and 600 mm depth, **every corner mesh is byte-identical to
   today's** — the parameterisation reproduces the shipped corner exactly at the shipped depth. **A
   re-baseline at 600 mm is a failure, not a step.**
2. *(parity, real probe)* At **each** declared depth, the corner assembly's built extent equals 7D6's
   derived reach on both walls, within `room-composition.parity.test.ts`'s shared-face tolerance.
   **Must not:** a builder that agrees with the domain at 600 and drifts at 700 — K3's defect, in the
   other layer.
3. *(parity)* **The base row and the wall row meet at the same along-wall figure** at every declared
   depth, and the worktop is continuous through the corner. **Must not:** a visible seam or a
   30 mm step at 700 mm.
4. *(visual, 390 × 844 and desktop)* The corner is captured at **both** declared depths and judged
   against the owner's photographs for a continuous worktop. **Must not:** a capture taken inside the
   watched root — it resets the dev server and fakes a defect.
5. *(unit)* No corner dimension is a literal in the adapter: each comes from the domain's derivation
   through the existing body definition. **Must not:** a builder constant "kept in sync".
6. **Must not:** touch `kitchen-shell.ts`, `stage.ts` or the scene wiring — **7H's files**; re-baseline
   anything at 600 mm; or change the hob's parameterisation, which is §13.3 q6's other half and is not
   in scope.

### Risks

1. **A re-baseline taken before 7H lands** bakes half of 7H into the corner's reference images. The
   ordering constraint above is the whole mitigation, and it is on both waves' rows.
2. **The 600 mm identity is the wave's spine.** If the corner cannot be reproduced byte-for-byte at the
   shipped depth, the derivation in 7D6 is wrong and this wave stops rather than re-baselining.
3. **The hob half of §13.3 q6 will look adjacent and cheap.** It is neither in scope nor measured here.

## Wave 7F1-D45 — dispatchable punch list: Back keeps the room the customer typed

**Tier: Light** (one screen, a settled contract, no new copy): adversarial QA, then **one** combined
reviewer. **Visual: yes** — the 390 × 844 gate is re-run over 1A and 1B in both locales, and it gains
one check it never had (the caret, below). **Owner answers needed: none.** **Planned 2026-09-14 by the
architect, against Next 16.3.4's own docs in `apps/web/node_modules/next/dist/docs/` and against the
production build output in `apps/web/.next`.**

**Goal.** Close wave 7F1's two open visual-gate defects — **D4** (browser Back loses a typed room) and
**D5** (a traversal renders 1A under a 1B URL) — by making the client the single authority on what
room the customer is looking at, under the coordinator's ruling **R9**. Read R9 first; this plan
implements it and does not re-open it.

**Not in scope, named so an implementer does not drift:** ruling **R5**'s locale-menu extraction
(deferred, and the reason is at `room-screen.tsx:27-39`); 1C's reasons (7F2); any change to
`room-url-state.ts`'s parser, `parse-metres.ts` or `approved-room-policy.ts`; the desktop line (7L).

### R9 is upheld, and here is what the documentation actually says

Every quote below was read in this repository at `apps/web/node_modules/next/dist/docs/` today.
**Where a claim is mine rather than the documentation's, it says so.**

- **The coordinator's note checks out.** `01-app/02-guides/upgrading/version-15.md:525` reads, exactly:
  *"When navigating between pages via `<Link>` or `useRouter`, page segments are no longer reused from
  the Client Cache. **However, they are still reused during browser backward and forward navigation**
  and for shared layouts."* The line number is unmoved and the glossary repeats it at
  `01-app/04-glossary.md:47`. **So D5's read side is documented behaviour and R9's conclusion — that no
  design may leave the server's parse authoritative after a traversal — follows from the docs, not from
  an inference.**
- **`useSearchParams` is the sanctioned reader of the live query, for exactly this reason.**
  `use-search-params.md:74` (Good to know): it *"is **not supported** in Server Components **to prevent
  stale values during partial rendering**"*. The hook exists because the server value can be stale.
- **R9's prerendering caveat is now measured rather than assumed.** `use-search-params.md:82` warns
  that on a prerendered route the hook forces client rendering to the nearest `Suspense` boundary.
  `page.md:119` states that `searchParams` is a Request-time API and *"using it will opt the page into
  dynamic rendering at request time"*. **The build agrees:** in `apps/web/.next` (production build,
  2026-09-14) `/[locale]/configurator/configure` and `/contact` appear in `prerender-manifest.json`
  with `.html`/`.rsc` artefacts, while `[locale]/configurator/room` has **`page.js` and nothing else**
  and appears in no prerender manifest. The route is dynamic; the warning does not bite. **Criterion 17
  below is what keeps it that way**, because the mechanism that makes it dynamic is about to change.
- **`router.replace(href, { scroll: false })` is the documented call** (`use-router.md:45` for the
  signature, `:118-136` for `scroll`), and next-intl 4.14.2's wrapper forwards `Partial<NavigateOptions>`
  unchanged (`node_modules/next-intl/dist/types/navigation/react-client/createNavigation.d.ts`), so
  `router.replace({ pathname, query }, { scroll: false })` typechecks against the repository's own
  `@/i18n/navigation`.

**One thing R9 does not name, and it is the premise the whole write side rests on.** `use-router.md:50`
says `router.bfcacheId` *"changes when the surrounding segment is **freshly created** by a push or
replace navigation, and **stays the same** for back/forward navigations, `router.refresh()`, and
**search-param- or hash-only navigations**"*. Our debounced write is a search-param-only navigation, so
**the documentation states the segment is not freshly created by it** — from which state preservation,
and therefore the caret, ought to follow. **But the docs never state it for a repository without
`cacheComponents`**, and this one does not enable it (`apps/web/next.config.ts`);
`preserving-ui-state.md:13-15` is explicit that its guarantees assume Cache Components and that before
them *"preserving page-level state across navigations required workarounds"*. **That is a gap between
two documented facts, and no test in this repository can close it.** Slice A therefore carries a
production-build measurement as a gate, and if it comes back red the write side stops there.

**And one tempting wrong answer, killed in writing so nobody finds it later.** `router.bfcacheId` looks
like the ready-made fix for the remount key and it is not: by the sentence above it **stays the same**
for search-param-only navigations **and** for back/forward — which is every navigation Step 1 makes,
including *Continuă*'s push. As a key it would never move, so it would prevent the remount and never
re-seed the draft. The docs also mark it *"a last resort, like when migrating an existing codebase"*
(`use-router.md:180`) and say to prefer deriving a key from your data. **Rejected on the doc's own
words, not on taste.**

### The design: one convergence loop, in one module

The draft and the URL are two representations of one room, and the screen's whole job is to make them
agree. **Three values, and every rule below is stated over them:**

- **`liveText`** — the query the client actually holds, `useSearchParams().toString()`. After a
  traversal this is the entry's own query; after our own write it is what we wrote.
- **`draftText`** — `canonicalRoomQuery(draft).toString()`, unchanged from what 7F1 shipped: the
  shape, every field that already reads as a length, the direction for the shapes that carry one, and
  nothing else. **No raw draft text ever reaches it, so a half-typed *"3,"* still cannot come back from
  a reload as a value the customer never entered.**
- **`lastSeenText`** — a piece of component state holding the `liveText` the screen has already
  reconciled against. It is what tells *the URL changed* apart from *the draft changed*, which a
  comparison of the first two values alone cannot do.

**The reconciliation rule, stated to be implemented.** During render, in React's documented
adjust-state-when-props-change form (a `setState` during render on this component, not an effect —
an effect would paint the stale room first):

1. If `liveText === lastSeenText`, do nothing. **This is the typing path**, and it is why a keystroke
   can never re-seed the draft: typing moves `draftText` and leaves `liveText` alone.
2. Otherwise the URL changed. Set `lastSeenText` to `liveText`, and then:
   - if `liveText === draftText`, **this is our own write echoing back** — keep the draft exactly as it
     is, caret, half-typed text and all;
   - else **the customer is in a different room** — re-seed the draft with
     `roomDraftFromQuery(shape, liveQuery, locale)`.

**The write rule.** One effect, keyed on `[liveText, draftText]`. If they are equal it schedules
nothing. Otherwise it starts a `URL_SETTLE_MS` timer whose callback is
`router.replace({ pathname, query }, { scroll: false })` with `canonicalRoomQuery(draft)`'s entries,
and its cleanup clears the timer.

**Six invariants fall out of those two rules, and each is an acceptance criterion below.**

- **I1 — echo immunity.** After our write lands, `liveText === draftText`, so the render rule keeps the
  draft and the effect schedules nothing. The loop settles in exactly one write.
- **I2 — a navigation beats a pending write.** Any change to `liveText` runs the effect's cleanup
  before the new effect, so a timer started for the old entry is cleared. **No `router.replace` can
  carry a query the customer has already navigated away from.**
- **I3 — typing never re-seeds.** By rule 1.
- **I4 — the loop has a fixed point.** For every query `q`,
  `canonical(draftFrom(canonical(draftFrom(q)))) === canonical(draftFrom(q))`. This is what forbids a
  replace loop, and it rests on criterion 8's existing round-trip property
  (`parse(format(mm)) === mm`). **It is a property test, not a reasoning step.**
- **I5 — a deliberate navigation flushes the pending write and leaves only once it has landed. It
  never cancels one.** ~~Cancel the timer, then push.~~ **Corrected 2026-09-14 by the coordinator,
  before dispatch, and the correction is the part worth reading.** Cancelling reintroduces D4 through
  the very mechanism added to prevent it: a customer who types the last digit and taps *Continuă*
  100 ms later leaves a 1B entry that never received the last 400 ms of typing, and browser Back from
  the next screen lands on a truncated room. **It fires on the fast, confident path rather than a rare
  one.** The full rule and its evidence are the next section; both buttons take it, for the reason
  the coordinator gave — *Înapoi* **pushes** 1A as a new entry (`room-screen.tsx:243-245`), so 1B
  stays behind as a back-target exactly as it does after *Continuă*. **Cancel is only correct when the
  entry is going away, and neither button makes that true.**
- **I6 — 1A writes nothing.** No shape in the query means `ShapeStep`, which has no sync at all. A
  screen that rewrote the address bar here would erase the link the customer arrived on.

**Three boundaries the rule has to be right about, named because each is where it would be got wrong.**

- **A repeated key is still not a value.** `useSearchParams().get()` returns the **first** of
  `?wallA=3.56&wallA=4.2`, which would silently overturn a contract 7F1 shipped and tested
  (`qa-7f1-url-seam.adversarial.test.ts:274-283`) while leaving every other test green. The live query
  is therefore built by a single exported `queryFromSearchParams`, over `getAll`, preserving a repeated
  key as an array — the same *exported rather than copied* rule that `singleValue`, `requiredFieldsFor`
  and `isCornerDirection` already live under, and for the same reason.
- **Arriving at a non-canonical URL rewrites the entry once.** An unknown key, a different key order or
  an absent `direction` all make `draftText !== liveText` on arrival, so exactly one canonicalising
  `router.replace` fires after the settle. That *is* criterion 18's *"the first sync writes
  `direction=left`"*, now performed by the router. **Must not:** a push — it would give the customer a
  Back that leads to the same screen minus one key.
- **One residue, accepted and bounded.** A Back landing on a URL that happens to equal the current
  `draftText` is read as an echo, so unparsed text the customer typed into a field (*"3,"*) stays in
  that field. The room shown and the URL still agree; only a character that was never a value survives.
  **Do not add a second discriminator to chase it** — every candidate re-seeds on an echo somewhere,
  which is the defect that matters.

  > **This prohibition is load-bearing for the departure path, not only for the residue above, and
  > the sentence before this one understated it** (found in review, 2026-09-14, after QA had swept
  > the same code and not found it). The re-seed is what makes `draftText === liveText` hold in the
  > commit where a flush echo lands, which is the *only* reason the write effect declines to arm a
  > timer after a departure push has been dispatched. **There is exactly one guard and it is I4.**
  >
  > **Trigger condition, stated so it can be checked rather than remembered:** *any edit that lets
  > the write effect see `liveText !== draftText` in the same commit as a departure push.* Concretely,
  > any rule that keeps a moved draft instead of re-seeding on a non-echo URL change — which is
  > exactly the "second discriminator" forbidden above.
  >
  > **The failure it produces, and note that *Înapoi* has no second guard today:** the customer types
  > a character after tapping *Înapoi*; the flush echoes; the push to the bare pathname is dispatched;
  > the write effect arms a 400 ms timer for the stray character; the push's RSC round trip exceeds
  > 400 ms; the `replace` fires and discards the pending navigation
  > (`app-router-instance.js:148-150`). ***Înapoi* silently does nothing** and the URL gains the
  > character. A second tap works — so it reads as flakiness rather than as a rule that was relaxed.
  >
  > **Guaranteed, not incidental.** Where no keystroke followed the tap the equality is the echo
  > branch's own test condition and is tautological. Where one did, the draft is re-seeded and the
  > equality *is* I4 / criterion 21 — `canonical ∘ draftFrom` idempotent — property-tested at
  > `room-query-sync.test.ts:217-269`. So the record should say this rests on **I4**, not on "the
  > queries this screen can currently produce".
  >
  > **Secondary trigger, and this one is caught:** breaking idempotence itself — a new length field,
  > a locale with a different decimal separator, a more lenient parser — fails criterion 21's
  > property test, *provided the property is extended over the new surface*. Wave 7F4 giving
  > `"presets"` a destination that is not the current pathname is an amplifier of the first trigger,
  > not a cause; it deserves a pointer here and does not change the guard.

### The departure path — flush, then leave, and never in one tick

**The documentation is silent**: neither `use-router.md` nor the linking guide says anything about two
navigations dispatched in the same tick. **The installed implementation is not silent, and it refuses
the obvious design.** Read at `apps/web/node_modules/next/dist/client/`, version 16.3.4:

- **A second navigation discards the first before it commits.** `app-router-instance.js:146-160`: when
  a navigation is dispatched while one is pending, *"Navigations (including back/forward) take
  priority over any pending actions. **Mark the pending action as discarded (so the state is never
  applied)** and start the navigation action immediately."* `runAction`'s `handleResult` (`:82-90`)
  returns before `actionQueue.state = nextState` for a discarded action.
- **The history write only happens when the state commits.** `app-router.js:44-68` writes
  `history.pushState` / `history.replaceState` inside an effect keyed on `appRouterState`. A discarded
  action never reaches it.

> **So `router.replace(canonical)` followed synchronously by `router.push(next)` loses the replace
> entirely — the flush never reaches history, and it fails silently.** This is source-verified rather
> than documented, which is weaker evidence than a doc quote and stronger than an inference; **criterion
> 23 makes it falsifiable on CI rather than argued.** And because `runAction` awaits an RSC round trip,
> no fixed delay fixes it — a sleep would be guessing at a network, which this plan will not do.

**The rule, therefore: arm a departure, flush at once, and push when the flush is observed.** The loop
already computes the signal — an echo is a committed write.

1. On *Continuă* or *Înapoi*, if `draftText === liveText` there is nothing pending and the entry is
   already correct: **navigate immediately.** This is the ordinary case.
2. Otherwise: clear the timer, call `router.replace(canonical, { scroll: false })` **now** rather than
   on the settle — the customer is leaving — and record a departure holding **the destination as a
   value** (*the presets step* or *the shape step*, not a closure over the draft) **and the exact text
   flushed**.
3. When the reconciliation next observes `liveText === departure.flushedText`, the flush has committed:
   dispatch the push and disarm. **Any other change to `liveText` disarms without pushing** — that is a
   traversal overtaking the departure, and a customer who has gone Back does not want the push.

**Why this does not become a dead button.** If the flush's request fails, Next falls back to a hard
navigation to the same URL (`pushRef.mpaNavigation`), so the room is still in the URL and nothing is
lost; the tap looks like it did nothing and a second one works. The other way to strand a departure —
a URL that comes back different from what we asked for — is exactly what criterion 21's idempotence
property forbids. **That property is now load-bearing in two places, which is why it is risk 1's
guard and not a nicety.**

**Two consequences that must be written down before an implementer meets them as surprises.**

- **A push whose target equals the current URL creates no history entry.** `app-router.js:59-61`:
  `pushState` is used only if `createHrefFromUrl(new URL(window.location.href)) !== canonicalUrl`,
  otherwise the router **replaces** — *"This mirrors the browser behavior for normal navigation"* — and
  `createHrefFromUrl` is `pathname + search + hash` (`router-reducer/create-href-from-url.js:11`).
  **So *Continuă* at 1B produces no entry and no visible change** — and **the reason is that step 2
  does not exist yet, not the mechanism** (coordinator, 2026-09-14, correcting this plan's first
  framing; the full reading is at Q-D45-5). It is not broken and it must not be "fixed".
  **One correction of my own, in the other direction, because the record should not carry it wrong:**
  the push was **already** demoted before R9, so R9 removes no evidence of the tap at all. The
  demotion compares against `window.location.href`, and the shipped
  `useCanonicalQueryInTheAddressBar` wrote exactly that — Next's patched `replaceState` forwards to
  `originalReplaceState` (`app-router.js:268-282`), so `location.href` already held the canonical
  query when the tap arrived, and the CTA is only enabled once every field parses. *(Source-verified.)*
- **Which entry D4's Back came from, settled 2026-09-14 rather than left hanging.** The finding above
  briefly contradicted R9's narrative trace, which had a third entry minted by a second *Continuă*.
  **The coordinator went back to the gate's own measurement rather than reasoning further from the
  trace, and the trace was what was wrong:** ***Înapoi*** mints that entry. `router.push({ pathname })`
  (`room-screen.tsx:243-245`) targets the bare path with **no query at all**, so it is never demoted.
  **The flow that produced D4 is:** 1A (entry 1) → *Continuă* pushes `?shape=L` (entry 2) → typing
  rewrites entry 2's address bar with `replaceState` → ***Înapoi*** pushes the bare pathname (entry 3)
  → **Back** → entry 2, restored from Next's own record, lengths gone. **Same defect, same cause, same
  fix** — and `history.length` constant across the traversals, exactly as the measurement records.
- **Criterion 23 uses *Înapoi* for two reasons now, and the second is the better one.** It avoids a
  vacuous pass, and **it is the exact gesture that produced the original measurement** — a probe that
  reproduces the reported defect step for step, not merely its class.

**An unexplained observation in the gate's own log, recorded so it is not rediscovered as an
argument.** *(Coordinator, 2026-09-14, from the measurement at the R9 section above; named as
unexplained on purpose.)* The URL D4's Back landed on — `?shape=L&direction=left` — **is not the pushed
URL**, whatever the verifier's note calls it: `continueToLengths` pushes `{ shape }` alone
(`room-screen.tsx:158`), and `direction=left` was written by the **first debounced sync**, a
`replaceState`. **So at least one `replaceState`-written key survived the traversal while the later
ones did not.** There are several candidate mechanisms and no evidence separating them, so none is
named here and **no slice is spent on it**: the fix is insensitive to it, because going through the
router makes Next's record authoritative whatever partial behaviour the native call has.
**Why it is written down at all:** a future reader will find that `replaceState` *"partly works"* and
argue for softening criterion 9's ban. **Partial survival is not a reason to weaken it — it is a
reason to keep it.** A write path that persists some keys and silently drops others is worse than one
that reliably persists none, because nothing at the call site can be reasoned about.

**One limit that is irreducible, stated rather than smoothed over.** The buttons can flush; **the
browser's own Back cannot be flushed for**. Once popstate fires the outgoing entry can no longer be
written, and a restore discards a pending action by the same rule quoted above. **So up to
`URL_SETTLE_MS` of typing can fail to reach an entry the customer leaves by a Back gesture rather than
by a button.** The only lever is the constant, which is Q-D45-3's answer and is worth revisiting
against a real customer. **Flush-on-blur was evaluated and is not recommended:** it shrinks the window
without closing it — the commit is still asynchronous and a traversal still discards it — at the cost
of a second write path.

### Trap 1 — `roomEntryKey` is deleted, not repaired

**R9 destroys its premise and nothing rebuilds it.** Its doc comment (`room-screen.tsx:303-312`) says
the key is safe because *"the query the page hands over changes on a navigation and on nothing else"*.
Under a debounced `router.replace` the live query changes on every write, so a query-derived key moves
while the customer is typing, the form remounts, and — worse than the caret — the re-seed drops any
field whose text does not yet parse, clearing *"3,"* out from under them 400 ms after they stopped.

**The key is not needed once the rule above exists.** Everything the key bought is bought again, and
more precisely, by the reconciliation: a different room re-seeds the draft, an echo does not, and the
fields are controlled inputs, so a re-seed updates them without a remount. Keeping a remount as well
would only add the one failure the rule is built to avoid.

**Evaluated against the two alternatives the coordinator named**, and the recommendation is the rule,
not a key:

- **A ref holding the last URL written.** Behaviourally near-identical — it is `lastSeenText` under
  another name — but it must be written during render to be read on the same render, and a ref written
  during render is the pattern React documents against. Held in state it is the same rule, so this is
  the same recommendation with a worse mechanism. *(Inference: mine.)*
- **A navigation-identity key not derived from the query.** In this version that means
  `router.bfcacheId`, and the doc quote above disqualifies it: it does not change on the navigations
  Step 1 makes. *(The disqualifying sentence is the documentation's; the conclusion is mine.)*

**The escaping goes with the key, and the test that justified it stays.** The `|` escaping at
`room-screen.tsx:315-323` is load-bearing *for a joined key* and for nothing else; comparing parsed
query text has no separator to borrow. `room-screen.dom.test.ts:419-443` is therefore **kept and
re-aimed**, not deleted: two queries differing only in where a `|` falls are two different rooms and
the second must show its own 3,56. Its comment gains the reason the escaping is gone, so a later reader
does not reinstate a guard against a collision the design can no longer have.

### Trap 2 — what the tests assert instead

**The mechanism is asserted in more places than criterion 11's spy.** Both DOM suites read the customer's
URL off `window.location.search`, which only worked because the component wrote it. Under R9 the
component asks a router, so **the harness has to close the loop the router closes**: the `next/navigation`
mock gains `useSearchParams`, and its `replace` double applies the href to the mocked search params
(and to `window.location`, so `addressBar()` keeps meaning *the URL the customer now has*) and
re-renders. A double that records the call without applying it would let every address-bar assertion in
both files pass over a screen that never updates — so **one test asserts the double itself**: after a
`replace`, `useSearchParams` returns the new query. **Criterion 22 needs one more thing from it — an
echo it can withhold**, so that *"the push has not fired yet"* and *"the push fires once the flush
comes back"* are two separate, ordered assertions rather than one that cannot tell them apart.

**Named changes, file by file. Each keeps catching a regression; none merely stops failing.**

- **`tests/room/room-url-round-trip.dom.test.ts:324-336`** — *"asks the router for nothing while the
  customer types"* asserts `browser.replace` was **never** called, which R9 makes exactly backwards.
  It becomes **two** tests: *"asks the router for nothing on the keystroke itself"* (after `type`, before
  the settle: no `push`, no `replace`, **and the plan has already redrawn** — criterion 11's two arms in
  one test so they cannot drift apart), and *"writes once, after typing stops"* (two keystrokes, then
  the settle: `toHaveBeenCalledTimes(1)`, with `{ scroll: false }` and the canonical query). **The count
  is the load-bearing half** — a per-keystroke replace also ends on the right URL.
- **Its comment at `:325-327`**, which records R2's rationale, is rewritten to R9's and cites
  `use-router.md:50` rather than the linking guide.
- **Every `addressBar()` assertion in both suites** (`room-url-round-trip.dom.test.ts:259, 270, 279,
  291, 304, 355, 374, 404` and `qa-7f1-url-seam.adversarial.test.ts:249, 269, 282, 300, 312, 323, 332,
  368, 491`) gains a `settle()` — fake timers advanced inside `act` — before it. The assertions
  themselves do not change, because what they claim about the URL is unchanged.
- **`qa-7f1-url-seam.adversarial.test.ts:241-257`**, the fixed-point test, becomes the **loop-freedom**
  property: for an arriving query, after one settle `replace` has been called **at most once**, and a
  second settle calls it **zero** more times. **This is the assertion I would not let anyone drop**; it
  is the only guard on risk 1.
- **`qa-7f1-url-seam.adversarial.test.ts:335-345`** — *"writes nothing at all into the address bar while
  no shape is chosen"* becomes *"asks the router for nothing while no shape is chosen"* (I6). The
  address-bar form stops being meaningful once the component is not the writer.
- **`room-screen.dom.test.ts:164-187`** — `render()` stops passing `state` and `query` and sets the
  mocked search params instead. **`:451`**'s shell assertion changes from
  `"<RoomScreen state={state} query={query} />"` to `"<RoomScreen />"`, and gains a must-not that is the
  real content of criterion 17 now: the route source contains **no** `parseRoomUrlState`.
- **The four frozen files stay unedited** — `tests/room/room-url-state.test.ts`,
  `qa-7e2-room-href.adversarial.test.ts`, `parse-metres.test.ts`,
  `parse-metres.adversarial.test.ts`. **That is the check that this fix changes no parser behaviour**,
  and the wave's standing rule applies: if a change appears to require touching one of them, stop and
  report rather than edit.
- **New, and the only place either defect is falsifiable:**
  `apps/web/tests/e2e/room-traversal.qa.e2e.spec.ts`. Each assertion names the defect it would have
  caught — after Back, `location.href` still carries `wallA` (D4), and `data-room-substate` reads `1B`
  and not `1A` (D5).

**R2's caret concern survives the mechanism change and is verified by the visual gate, explicitly.**
The debounce moves the risk rather than removing it: the round trip now happens while the customer is
looking at a filled field rather than between two digits. **The 390 × 844 pass must, in a production
build: focus *Perete A*, type a full value, wait past the settle interval without touching anything,
and confirm the caret is still in that field, the value is unchanged, and the page has not scrolled.**
That last one is what `{ scroll: false }` is for and nothing else checks it.

### Acceptance criteria as they now read

Numbering continues 7F1's. **9, 11, 17 and 18 are amended in place; 19 is restated; 20–23 are new.**

9. **The URL is the room's only store.** After any edit the query holds exactly the canonical keys for
   the chosen shape and nothing else; **a reload restores every field byte-identically, and a browser
   Back restores the room that entry held** (ADR 0111 decision 3's *"Back restores it, a reload keeps
   it"*, both halves). **Must not:** a `localStorage`, `sessionStorage`, cookie or store write anywhere
   under `apps/web/src/room`; an unknown key surviving into the query; **a `window.history.pushState`
   or `replaceState` under `apps/web/src/room`** — that is D4's own mechanism and it is now banned by
   the lint block rather than by a promise. **[component]** + **[lint]** + **[e2e]**
11. **The plan redraws on every keystroke, locally** — unchanged, with one addition: the redraw is
    asserted **in the same test as the navigation spy**, so *"no call on the keystroke"* and *"the plan
    moved anyway"* cannot drift into two files that agree separately and disagree together.
17. **The page stays a server shell, and the route stays dynamic.** `page.tsx` renders one client
    component, declares no copy key, field, style or `"use client"`, **parses nothing**, and keeps the
    route out of the prerender manifest by an intention-revealing request-time call — `await
    connection()` from `next/server` (`connection.md`), which replaces today's `await searchParams`
    now that nothing consumes it. **Must not:** `parseRoomUrlState` in the route; a prop carrying the
    server's parse into the screen (D5 is unrepresentable only if the value is absent, not merely
    unused); a route that a build leaves prerendered — **verify in `next build`'s output, not by
    reading the source**. **[component]** + **[build]** + review
18. **`direction` is written for every shape that carries the toggle, and its absence keeps its
    meaning** — the three layers of ruling R6 stand exactly as written. **What changes is only who
    writes it:** the first sync is the debounced `router.replace`, which **rewrites the current entry**.
    **Must not:** a push for the first sync. **[component]** for the draft and the sync, **[unit]** for
    the parser.
19. **The URL is written by a debounced `router.replace`, and the live sub-state is the client's** (R9).
    Three arms, separately asserted: **no navigation call fires on a keystroke**; **exactly one fires
    after the settle interval**, carrying the canonical query and `{ scroll: false }`; and **after
    mount every rendered sub-state is derived from `useSearchParams()`**, including
    `data-room-substate` and `data-marked-fields`, so a cached payload restored on Back self-corrects
    instead of being believed. **Must not:** a navigation per keystroke; the server's parse as an
    authority after the first paint. **[component]** for all three; **[e2e]** owns the traversal.
20. **Re-seed on a different room; never on our own echo.** Rules 1 and 2 above, asserted as
    behaviour: typing does not re-seed (I3); a `replace` echoing back leaves the draft and any
    unparsed field text untouched (I1); a live query the draft did not write re-seeds every field,
    the shape and the direction (the rule's reason for existing). **Must not:** a `key` on the
    dimensions step derived from the query's contents — it would remount the form on our own write.
    **[unit]** on the pure reconciliation, **[component]** for the three behaviours.
21. **The loop settles, and it settles once.** For any arriving query — canonical, non-canonical,
    hostile or empty — at most one `router.replace` fires, and a second settle interval fires none.
    Stated as the property behind it: `canonical ∘ draftFrom` is idempotent over every query the
    parser accepts, at least 500 cases. **Must not:** a design that needs a render count to stay
    bounded by luck. **[property]** + **[component]**
22. **A deliberate navigation flushes first and leaves second.** With a write pending, tapping
    *Continuă* or *Înapoi* issues **a `replace` immediately** — not on the settle — and the `push`
    **only after that `replace` has been observed coming back**, so the entry being left behind is
    correct before it becomes a back-target (I5). Four arms: no `push` fires in the same tick as the
    flush; the `push` fires once the flush echoes; a traversal arriving first **disarms** the
    departure and no `push` fires at all; and with nothing pending the navigation is immediate, with
    no `replace`. **Must not:** cancelling the timer and pushing (it re-creates D4 on the fast path);
    `replace` and `push` dispatched in one tick (the first is discarded before it writes history —
    `app-router-instance.js:146-160`); a fixed delay between them. **[component]** with fake timers
    and a router double that only echoes when told to.
23. **The traversal, in a production build.** `next build` + `next start`: open 1A, choose **L**,
    *Continuă* (entry 2), type wall A, wall B and the height, let the URL settle, tap ***Înapoi***
    (entry 3, 1A), then **Back** — the fields hold what was typed, `location.href` carries every
    length (D4), and the screen reads `data-room-substate="1B"` and not `1A` (D5). Then **Forward**,
    then **Back** again: both hold. `history.length` grows by **zero** while typing, and by one per
    navigation **whose URL differs from the current one** — a push to the URL already showing creates
    no entry (`app-router.js:59-61`), which is why *Continuă* at 1B is not the probe here.
    **This is the original repro, step for step:** *Înapoi* pushing the bare pathname is the gesture
    that minted the entry D4's Back came from, so this spec reproduces the reported defect rather than
    its class.
    **A second case, and it is the one the flush exists for:** type the last digit and tap *Înapoi*
    **inside** the settle interval, then Back — the fields still hold the last digit (I5).
    **Must not:** asserting this in a dev build only — D4 and D5 were both found in a production one;
    a fixed `waitForTimeout` standing in for the flush, rather than waiting on the URL. **[e2e]**, and
    **CI is the verdict**: a green local run of this spec proves nothing about the runner.

### Punch list — three slices, dispatched one at a time, in this order

**Slice A — the loop.** Production: **new** `src/room/room-query-sync.ts` — `queryFromSearchParams`,
the pure `reconcileRoomDraft`, `URL_SETTLE_MS` (**400 ms**, one named constant carrying its reason),
and `canonicalRoomQuery` / `roomDraftFromQuery` moved verbatim out of `room-screen.tsx`;
`src/room/room-screen.tsx` — delete `roomEntryKey` and `useCanonicalQueryInTheAddressBar`, adopt the
hook, and route *Continuă* and *Înapoi* through it so the **departure** — flush, observe, then push
(I5) — lives with the timer that makes it necessary rather than at two call sites;
`eslint.config.mjs` — a named `ROOM_HISTORY_WRITE_SELECTORS` added to the room block, **re-declaring
the full list exactly as ruling R1 requires**, because that block replaces rather than merges.
Tests: **new** `tests/room/room-query-sync.test.ts` (no DOM: the reconciliation table and criterion
21's property); the harness and assertion changes listed above in `room-url-round-trip.dom.test.ts`
and `qa-7f1-url-seam.adversarial.test.ts`; a fourth probe in
`tests/lint/room-example-dimensions.test.ts` asserting `window.history.replaceState(…)` errors under
`src/room/` **and** that the three existing gates still error there. **Done when** criteria 9, 11, 18,
19's first two arms, 20, 21 and 22 hold — **and the measurement below is green.**

> **The gate inside slice A, and it is a stop-and-report.** In `next build` + `next start`: type into
> *Perete A*, wait past the settle, and confirm (i) the caret is still in the field and nothing typed
> during the settle was lost, (ii) `history.length` did not grow, (iii) Back returns the full typed
> query in `location.href`; then (iv) type a last digit and tap *Înapoi* **inside** the settle window,
> and confirm Back finds that digit. **(i) is the premise the documentation does not state for a
> repository without `cacheComponents`; (iv) is the departure path, whose refusal of the same-tick
> design is read off the installed source rather than a doc** — measuring it here rather than waiting
> for slice C is the point of putting it in the slice that builds it. If (i) fails, R9's write side is
> unsound as built and the implementer stops — the fallback is the coordinator's to rule on, not the
> implementer's to improvise.

#### The gate was run on 2026-09-14 against slice A at `74c5b39`, and **all five checks passed**

`next build` + `next start --port 4320`, Next 16.3.4 (Turbopack), Playwright 1.62.1 against chromium
at **390 × 844 / hasTouch / isMobile** with real keyboard events, RO locale. **The route table printed
`ƒ /[locale]/configurator/room` — dynamic, server-rendered on demand, not prerendered**, which is
criterion 17's build-output check and the reason `useSearchParams` does not bail out to CSR.

| Check | Verdict | Measured |
|---|---|---|
| (i) caret and value | **PASS** | `activeElement` stays `room-length-wallA`; `selectionStart/End` **4 / 4**, unchanged from immediately after the last keystroke; value `3,56` character for character; **`scrollY` 0 before and 0 after**, which is the only check `{ scroll: false }` has. Typing *across* the boundary (`4`, 500 ms pause, `,25`) yields `4,25` with nothing dropped or reordered. Re-run at 30 / 90 / 200 ms keystroke delays **and** a pathological case with a full settle between every character: identical each time. Not a flake. |
| (ii) `history.length` | **PASS** | **3 before typing, 3 after** all three fields filled and settled. |
| (iii) Back returns the room | **PASS** | `?shape=L&wallA=3.56&wallB=4.25&height=2.7&direction=left`; fields `3,56 / 4,25 / 2,70`; `data-room-substate="1D"`. **This is D4's original repro, and it is closed.** |
| (iv) departure flush | **PASS — the digit is kept** | Digit typed at +6 ms, the *Înapoi* tap returning at +29 ms. Back gives `height=2.75` and the field reads `2,75`. |
| (v) neither button dead | **PASS** | *Continuă* at 1B: enabled, no visible effect, URL, history and substate unchanged, one same-URL RSC fetch — expected per Q-D45-5. *Înapoi*: lands at 1A on every one of four taps. |

**No React warning of any kind** — no state-during-render warning, no update loop, no page error. The
only console output is two environmental lines present on every page. **Four room-route requests to
fill three fields**, one per settled value: the debounce holds and nothing approaches one per
keystroke.

> **A correction worth keeping, because the coordinator got it wrong and the plan did not.** The
> coordinator's brief to the verifier said (iv) should **lose** the digit. It does not, and gate (iv)
> above never asked it to. Typing and *then* tapping inside the settle is the flush path working: by
> the time `departTo` runs, the keystroke is already in `canonicalText`, so the flush carries it. The
> loss recorded at `URL_SETTLE_MS` is **the other order** — a character typed *after* the tap, while
> the flush is in flight — plus the Back **gesture**, which cannot be flushed for at all. Two
> different windows, and only the second pair is lossy.

**One cosmetic observation, pre-empted so the visual gate does not file it.** A height typed `2,7`
comes back from a traversal rendered **`2,70`** while the URL still says `height=2.7`. That is
`roomDraftFromQuery`'s canonical two-decimal notation applied on a genuine re-seed — the room and the
URL agree, and nothing drifted on its own. It is **not** the must-not-file list's *"a value that
changes on its own"*.

**Not exercised, stated rather than implied:** the RU locale, the `linear` and `U` shapes, real
hardware touch (the run used synthesised touch at the pinned viewport), and a Back **gesture**
mid-settle. The first three belong to the wave's closing visual gate; the fourth is the accepted
limit and stays unexercised by design.

**Slice B — the stale authority is removed.** Production: `src/room/room-screen.tsx` — `<main
data-room-substate data-marked-fields>` moves in and is derived from the live query;
`RoomScreenProps` loses `state` and `query` and keeps only `policy`, which criterion 3's fabricated
policy still needs. `app/[locale]/configurator/room/page.tsx` — `await connection()`, `notFound()` for
a bad locale, `<RoomScreen />`, nothing else. Tests: `room-screen.dom.test.ts`'s harness and its
criterion 17 assertions. **Done when** criteria 17 and 19's third arm hold and the traversal shows
`data-room-substate` self-correcting. *Second on purpose:* slice A carries all the risk and deserves
its own review; this slice is what makes D5 unrepresentable rather than merely absent.

**Slice C — the traversal gate and the record.** Tests only:
`apps/web/tests/e2e/room-traversal.qa.e2e.spec.ts` (criterion 23), plus the comment sweep —
`room-screen.tsx:14-17` and `:263-275` and `page.tsx:21-28` all still describe `replaceState` and R2's
mechanism and must describe R9's. **Done when** the spec passes on CI and each assertion names the
defect it would have caught.

**Then the visual gate**, 390 × 844, 1A and 1B, both locales: criteria 14 and 15 re-run unchanged,
plus the caret check spelled out above. The tree is frozen while it runs.

> **Two must-not-files for the gate's brief, so a correct screen is not reported as a broken one.**
> **(1) Tapping *Continuă* at 1B does nothing, and that is expected** — the destination is 7F4's
> (Q-D45-5). **(2) The URL changes about 400 ms after typing stops, not as the digits land** — that is
> `URL_SETTLE_MS`, and a URL that lags the field by a beat is the mechanism working. **What *is* a
> finding:** a caret that leaves the field, a value that changes on its own, a page that scrolls when
> the URL settles, or a URL that never catches up at all.

### Must not change — a change to any of these is a finding, not a repair

- The four frozen test files, and `room-url-state.ts`'s behaviour. **This fix adds no parser rule**; it
  only calls the parser from a second place.
- `room/approved-room-policy.ts`, `room/validate-room.ts`, `room/parse-metres.ts`,
  `room/create-design.ts`, `src/proxy.ts`, and anything under `src/app/configurator/configure/` —
  ruling R5 stands deferred and its reason is at `room-screen.tsx:27-39`.
- The existing `no-restricted-syntax` block at `eslint.config.mjs:391-407`, and the room block's
  **full** re-declaration of both existing selector lists. Dropping a spread while adding one is the
  exact failure R1's probe test exists to catch.
- `staleTimes`, `cacheComponents` or any other caching switch in `next.config.ts`. **There is no switch
  that turns off back/forward segment reuse** (R9), so reaching for one is a sign the read side has
  been misunderstood.

### Risks, ranked, with the reason for the rank visible

1. **A replace loop** — render writes, write re-renders, re-render writes. Ranked first because it is
   the only failure that gets *worse* with traffic (a request per settle interval, per customer,
   forever), because no existing test would notice, and because it is invisible in development where
   one machine's requests look free. **Guard:** the pure `reconcileRoomDraft`, criterion 21's
   idempotence property, and the at-most-once component assertion. This is the criterion to check
   first in review.
2. **The departure path built as *cancel then push*, or as *replace and push in one tick*.** Ranked
   second because **both silently restore D4** on the fastest, most confident customer path — type the
   last digit, tap on — and because both look obviously correct: the first loses the last 400 ms of
   typing from the entry left behind, and the second has its `replace` discarded before it writes
   history (`app-router-instance.js:146-160`), leaving no trace at all. **Guard:** I5's three steps,
   criterion 22's four arms, and criterion 23's second case, which is the one a customer would hit.
3. **Client state or the caret not surviving the replace.** Ranked third rather than first only because
   the documentation points the right way (`use-router.md:50`) and because it fails **loudly** —
   a cleared field is not a subtle defect. **Guard:** slice A's production measurement, before slice B
   is dispatched; then the visual gate's caret check.
4. **`useSearchParams().get()` collapsing a repeated key**, silently overturning a shipped contract
   while every other test stays green. Ranked fourth because the blast radius is one adversarial case,
   and high within that because *silent* is the whole problem. **Guard:** one exported
   `queryFromSearchParams` over `getAll`, and the existing repeated-key test re-run through it.
5. **The e2e is the only proof, and only CI can give the verdict.** Ranked here because it is a
   certainty rather than a risk: a green local run of criterion 23 says nothing about runner timing.
   **Guard:** it is stated in the criterion, so nobody closes the wave on a laptop.
6. **A test double that records without applying.** Ranked sixth because it is caught by one assertion
   and because a reviewer reading the harness will see it; ranked at all because if it slips, *both*
   DOM suites go green over a screen that never updates.
7. **Scope creep into 7F2 and 7K.** 1C is now reachable by typing (R2's recorded consequence), and an
   implementer in this file will be one line from adding a validation message. It is 7F2's, with 7F2's
   criteria and frame 1C's copy.
### One accepted limit — accepted by the coordinator 2026-09-14, and it is not a risk

**A browser Back *gesture* taken within `URL_SETTLE_MS` of the last keystroke leaves that keystroke
out of the entry being left.** The buttons flush (I5); the gesture cannot be flushed for, because the
outgoing entry is unwritable once popstate has fired and a restore discards a pending action by the
rule quoted in the departure section. **Flush-on-blur is rejected** — a second write path that shrinks
a window without closing it doubles the surface and buys nothing.

**Two things belong in the record with it, so it is not rediscovered as a defect and — worse — used to
argue for reverting the fix that improved it.**

- **It is bounded by exactly one constant.** At most `URL_SETTLE_MS` of typing, only on a gesture, and
  **never on a reload** (a reload reads the entry's URL, which the settle has already written, and
  ADR 0111 decision 3's *reload* half holds in production today). The only lever is Q-D45-3's number.
- **It is not a regression; it is strictly better than what 7F1 ships today.** Today the gesture loses
  **the whole room** — that is D4, measured in a production build — and after this wave it loses at
  most the tail typed in the last 400 ms. **Anyone reading this limit is reading an improvement with
  its remaining edge stated, not a new defect.**

### Questions that are the coordinator's, not mine — Q-D45-1 to Q-D45-5 answered 2026-09-14

- **Q-D45-1 — own wave row, or 7F1 slices 6–8? → *Its own row*, `7F1-D45`, depending on 7F1.**
  *(Coordinator, 2026-09-14, taking the recommendation and its reason.)* 7F1's five slices are
  shipped, QA'd and reviewed; folding this back in would make *"7F1 is DONE"* mean two different
  things depending on when it was read. **7F1 closes on what it actually verified, with its two open
  defects named and pointed at this row.**
- **Q-D45-2 — criterion 23's e2e here, or at 7K? → *Here*.** *(Coordinator, 2026-09-14.)* Without it
  the wave would close on a verifier's screenshots, and **both defects already survived a review and a
  QA pass** — *"a defect that has evaded the suite once has earned a permanent test"*. 7K inherits the
  spec rather than writing it.
- **Q-D45-3 — `URL_SETTLE_MS` → *400 ms*, as proposed.** *(Coordinator, 2026-09-14: the reasoning is
  sound and it is better revisited against a real customer than tuned now against an imagined one.)*
  It is longer than a fast typist's gap between digits (~150–250 ms), so a value is written once
  rather than three times, and short enough that a customer who stops to look and then reloads still
  has their room. **One named constant carrying that reason, never a literal.** Risk 8's bound is
  stated in terms of it.
- **Q-D45-4 — the fallback if slice A's measurement is red → *deliberately not pre-decided*.**
  *(Coordinator, 2026-09-14: a fallback chosen now would be chosen against a failure nobody has
  seen.)* Every candidate breaks something recorded — hoisting the draft to a layout crosses the route
  boundary criterion 17 draws, an external store is refused by ADR 0111 decision 3, and writing only on
  blur loses a room to a mid-field reload, the option R2 rejected and R9 upheld the rejection of. **The
  implementer stops and reports with the measurement in hand; the coordinator rules then.** This
  question stays open on purpose: it is the escape hatch, and that is its whole job.
- **Q-D45-5 — *(raised by the departure design)* — is a CTA whose push produces no entry and no
  visible change still "wired", for ADR 0104 decision 6's purposes? → *Yes; the `<button>` stays, and
  the recorded reason is corrected.*** *(Coordinator, 2026-09-14, checking the screen rather than
  taking my framing — and the correction is worth more than the answer.)* **I attributed the dead tap
  to R9 and that is secondary at best.** ***Continuă* at 1B was already a no-op once every field
  parses:** it pushes the same route (`room-screen.tsx:215`), `DimensionsStep` branches on no
  sub-state — 1B, 1C and 1D render the same screen and `state.substate` reaches only `page.tsx`'s
  `data-` attributes — and the CTA is enabled only when the canonical query is already the URL.
  **The button does nothing because step 2 does not exist yet, and that destination is 7F4's.**
  The amendment is recorded at the *Departures from frames 1A and 1B* bullet, citing ADR 0104
  decision 6 and the absent destination, with R9 subordinate.
  **The correction matters for two readers**, which is why it is written twice: **the visual
  verifier**, for whom *"this tap is expected to do nothing"* is now an explicit **must-not-file**
  in the gate's brief below; and **7F4's implementer**, who needs to know the button is waiting for a
  destination rather than broken by a navigation mechanism — under my framing they would have gone
  looking for a mechanism to fix.
  **And one correction back, source-verified, so the record is not half-wrong in the other
  direction:** *"before, the push at least minted a history entry"* does not hold either — the
  demotion reads `window.location.href`, which the shipped `replaceState` sync had already set to the
  canonical query (`app-router.js:268-282` forwards to `originalReplaceState`). The tap minted nothing
  before R9 and mints nothing after. **R9 changes this CTA not at all**, which makes *waiting for a
  destination* the whole of the explanation rather than most of it.

## Wave 7F4 — dispatchable punch list: the composition runs, and the kitchen it makes is the one that opens

> **Planned 2026-09-14 by the architect, on branch `m7-room-and-presets` at `e8027f5`.** This is the
> binding version of the **7F4** bullet in *Acceptance criteria per wave* and of the 7F4 row in the
> revised wave table; where this section and those disagree, this section is later and says why.
>
> **Criterion 34's boundary list was mis-notated and is corrected above (2026-09-15). The code and
> the shipped test were already right.** 7F4a's visual gate mapped which L rooms actually reach 1F in
> a production build and reported that criterion 34 named **1000 × 2100** as accepted while the screen
> refused it. Adjudicated: the criterion's three pairs were flattened out of ADR 0108 Amendment E's
> table, whose middle row **fixes wall B** — so that one pair alone was written `(B × A)` while its
> neighbours were `(A × B)`. `validateRoomInput` was run against all twelve rooms the verifier typed
> and agreed with the screen **12 for 12**; `minimum-kitchen.test.ts` and
> `generated-kitchen-minimum.boundary.test.ts` both list `[2100, 1000]` in `wallA × wallB` order and
> assert `widthMm: wallAMm`, so **the test types what a customer types**. `:7543` was the only
> mis-notated occurrence in `docs/`.
>
> **The orientation asymmetry itself is correct and ruled**, not an accident: the corner assembly
> reaches 900 mm along wall A and 1000 mm along wall B at 700 mm depth (ADR 0108 Amendment A), so wall
> B must be 100 mm longer to offer the same free run — and the owner approved A ≥ 900 / B ≥ 1000 with
> that corrected table in front of them. **Owner approval is not at risk and no owner question
> arises.** Recorded here so the next reader does not re-derive it.
>
> One measured detail worth keeping: of the five dead-tap rooms the gate found, **2,20 × 0,90 refuses
> for a different reason than the other four** — `WALL_TOO_SHORT` on wall B's own floor, a per-field
> code, rather than the coupled `ROOM_TOO_SMALL_FOR_KITCHEN`. Same silent tap, two mechanisms; 7F2
> owns the surface that tells them apart.
> **Two clauses of the earlier 7F4 bullet are overturned here, deliberately and with reasons**
> (R11, R12), and **one sentence of frame 1F is refused as customer copy** (R18). **Three questions
> are not mine** — Q7F4-1 (the owner's, the warning's wording), Q7F4-2 (the coordinator's, the split)
> and Q7F4-3 (the coordinator's, confirming R11/R12 against the owner's *"use the design that was
> proposed"*).

### Read this before anything else: what this wave actually is

**7F4 is the wave in which the generation algorithm gets its first production caller.** That is not
an implication of the row — it is the row, read against the tree:

- `generateKitchen` is exported from the domain's public index (`packages/configurator-domain/src/index.ts:267`)
  and is called from **no file under `apps/web/src`**. Its only callers are tests.
- It needs a `BodyProbeFactory`, which needs a **Three.js kit**. The web has exactly one place that
  builds one — `apps/web/src/scene/kitchen-stage.tsx:65-89`, inside a `dynamic(..., { ssr: false })`
  canvas — and Step 1 has no scene. **ADR 0110 decision 6 already decided this**: *"It runs in the
  browser at Step 1 with a borrowed probe… Nothing runs on the server, which has no kit."*
- The wave table's tier column has said **Full (kit lifetime)** since 2026-09-11 for this reason, and
  ADR 0110's Consequences say *"Step 1 builds a Three.js kit when it generates. Its cost on a phone is
  measured in wave 7F4."*

So the answer to the question the coordinator most wanted answered is **yes, loudly** — and it was
foreseen rather than discovered. What is *not* in the row, and is this plan's news, is that the
customer's **first** screen must now pull a Three.js bundle in order to finish, which is a bundle
decision (R15) and a measurement gate (criterion 33), not a wiring detail.

**One worry the coordinator raised is not real, and is worth closing so no slice is spent on it.**
`POST /api/designs` hardcoding `KITCHEN_L_DESIGN` (`apps/web/src/app/api/designs/route.ts:40`) is the
**mint seed**, not the saved document: `createDesignCreationAttempt` mints with `id: null` and then
**awaits a `PUT` of the real design** before navigating (`src/room/create-design.ts:55-79`, 7E2
criterion 1 asserts the read-back deep-equals). The seed exists so the route takes **no request
body**, which is ADR 0019's 2026-08-31 correction and ADR 0110's own decision-record sweep row.
**7F4 must not touch that route.** A generated design reaches the database through the `PUT`, exactly
as an applied preset will.

> **Recorded because the way it was misread is the useful part** *(coordinator, 2026-09-14, correcting
> their own dispatch brief)*: the hardcoded fixture was carried forward as a worry from a fact
> recorded weeks earlier, *"without re-reading what it meant"*. The fact was true and its consequence
> was not. **A fact about a file is not a fact about the behaviour** — the route's line is unchanged
> since M2 and what changed around it is 7E2's awaited `PUT`.

### Ground truth, measured at `e8027f5`

Each fact is a file and a line, because four of them contradict something a reader would reasonably
assume from the prose.

- **G1 — the URL has four sub-states and *1D is simply "the room is valid"***
  (`apps/web/src/room/room-url-state.ts:50-71, 99-119`). There is no 1E and no 1F in
  `RoomUrlState`, and there is nowhere in the query for one: `canonicalRoomQuery`
  (`room-query-sync.ts:384-399`) writes the shape, the parsed lengths and the direction and
  **nothing else**, and any other key makes `draftText !== liveText`, which the settle then strips
  with a `router.replace`. **A composition step cannot be put in the URL without fighting the
  convergence loop for it.**
- **G2 — the screen does not branch on the sub-state at all today.** `RoomScreen` branches on
  *"is there a shape in the URL"* (`room-screen.tsx:102-106`), so 1B, 1C and 1D render the identical
  `DimensionsStep`. Q-D45-5 already recorded this; it is repeated because it is the seam 7F4 opens.
- **G3 — *Continuă* at 1B calls `departTo("presets")`** (`room-screen.tsx:244-246`), which flushes the
  pending write and, when the flush echoes, pushes `{ pathname, query }` — **the URL already showing**,
  so Next demotes the push to a replace and no history entry is minted
  (`app-router.js:59-61`). The tap is not broken and the mechanism is not the reason it is invisible.
- **G4 — the generated design is directly savable.** `buildLShellDesign` sets `presetId: null` and
  `createdAt`/`updatedAt` from `occurredAt` (`generation/shell-design.ts:134-138`), so
  `generateKitchen(...).design` satisfies `DesignSchema` and is what 7E2's attempt writes. `presetId:
  null` is 7E2 criterion 3's *"or `null` for a generated kitchen"*, already true by construction.
- **G5 — the refusal arm is unreachable from a URL the screen can be at.** `validateRoomInput` emits
  `ROOM_TOO_SMALL_FOR_KITCHEN` (7A2), and
  `packages/configurator-domain/tests/room/minimum-kitchen.test.ts:161-215` asserts
  `validation.ok === generated.ok` over the **whole approved L rectangle**, ≥ 100 samples per logical
  arm plus a full-rectangle sweep. A room that resolves to 1D therefore generates. **The honest limit,
  and it is this wave's to close:** that property runs against `createFakeProbeFactory()`. 7F4 runs
  the **real** probe, and fit is judged on the **measured carcass**
  (`body-probe.ts:22-33`), so agreement between validator and generator is proven for a probe the
  product does not use. See criterion 34 and risk 3.
- **G6 — the log is richer than the frame.** `GenerationStep` covers the four core roles **plus**
  `storage`, `upper` and `hood` (`generate-kitchen.ts:65-81`), and a 6300 × 4700 room produces four
  core steps, eight storage steps and about eleven uppers. **Frame 1F draws four rows.**
- **G7 — widths come off the plan, not the step.** `GenerationStep` carries a `buildId` and no width;
  `plan.bases[].widthMm` carries it (`generation-priorities.ts:35-43`), and `plan` is on the log
  (`generate-kitchen.ts:86`). `GENERATION_PRIORITIES` carries the declared width for each core role
  (`:15-25`), which is what a **pending** row can show before any log exists.
- **G8 — `plan.dropped` is core roles only** (`generation-priorities.ts:50`, ADR 0110's 2026-09-12
  clarification point 3). A storage slot that was never planned is **not** in `dropped`.
- **G9 — the kit needs a 2D canvas and no WebGL.** `makeKit` falls back to
  `document.createElement("canvas")` for its textures (`packages/three-adapter/src/kitchen-parts.ts:406-408`);
  `packages/three-adapter/tests/generated-kitchen.parity.test.ts:40-48` is the exact
  `BodyProbeFactory` shape the web needs, headless canvas aside. **No renderer, no `<canvas>` in the
  document, no WebGL context.** A Web Worker is *not* an option: the kit reaches for `document`.
- **G10 — `reactStrictMode: true`** (`apps/web/next.config.ts:9`). An effect that generates runs
  **twice** in development, which in 7F4b means two kits, two designs and two rows.
- **G11 — the frames change the top bar's title.** 1A/1B/1C draw **Cameră**, 1D/1E/1F draw **Preset**
  (`docs/design/mockups/Lemnaria Configurator Mobil.dc.html:58, 111, 199, 261, 311, 414`). The step
  pill stays *1/4* in all six. `RoomTopBar` hardcodes `room.title`
  (`room-screen.tsx:133-135`), so 7F4 touches `room-screen.tsx` — **a file the wave-table row does not
  list**.
- **G12 — the room group in the golden manifest is built from `ro.json`'s own subtree**
  (`apps/web/tests/i18n/golden-output-fixtures.ts:565-587`), so every leaf 7F4 adds arrives hashed on
  its own; **an ICU leaf without an entry in `ROOM_RENDER_ARGUMENTS` throws** rather than passing
  unwatched.

### The three questions the coordinator asked, answered

**1. What *"struck nu încape"* refers to, and what replaced it.** Nothing in that row is struck
through — there is no `~~` in it. *"struck *nu încape*"* is the row's description of the **not-placed
rows**: frame 1F's last row, *Frigider — nu încape*, an item struck from the composition. The
sentence that expands it is the 7F4 bullet at *Acceptance criteria per wave*: *"the steps render in
the log's order with the frames' three states; nu încape items are struck through and absent from
the design that opens."* What replaced the row is the **revised** table's row — *"1F composition
steps into the editor | carried, plus minimum not met → 1C"* — which carries that bullet forward
unchanged and adds one item. **Two clauses of the carried bullet are wrong against the frame and the
engine, and R10–R12 below overturn them.**

**2. Where *minimum not met* goes.** It goes to **1C, before generation ever runs**, and it is
already wired: `validateRoomInput` refuses the room with `ROOM_TOO_SMALL_FOR_KITCHEN` (7A2, ADR 0108
Amendment E) and `parseRoomUrlState` resolves such a URL to substate `1C`
(`room-url-state.ts:100-108`). The **sentence** the customer reads there is **7F2's**, recorded at
*"7F2 (add): minimum not met is shown at 1C with a room-level reason, no digit and no code, and no
wall marked red"* — and 7F2 lands **after** 7F4 in the recommended order, so for the length of this
wave a too-small room sits at 1C with its field marked and no prose. That is 7F1 criterion 3's
already-asserted silence, not a regression. **The generator's own `MINIMUM_NOT_MET` arm is therefore
unreachable from the screen** (G5), and 7F4's obligation against it is R16: prove it, and fail safely
if it happens anyway. **This does not overturn the row** — *minimum not met → 1C* is satisfied
upstream of generation rather than by a new screen state.

**3. Does this wave run the generator, or only stage the hand-off.** It runs it. See *Read this
before anything else*. ~~**Recommendation: split the wave**~~ **Split — approved by the coordinator
2026-09-14 (Q7F4-2)** — **7F4a** runs the composition and draws it, **7F4b** hands off to the editor.
The two halves fail differently and are caught by different instruments: 7F4a's failures are a bundle,
a frozen main thread and a leaked kit, all measurable in a browser; 7F4b's failure is **a duplicate
row in the database**, which only a component test with a stubbed fetch catches — and that is
precisely the gap 7E2's close-out says *"a factory-level test cannot substitute"* for. The cost is one
extra Full-tier cycle and one extra visual gate; the alternative is one wave of nine must-fix items,
which `docs/WORKFLOW.md`'s scope rule refuses at five.

### Rulings — R10 to R18, 2026-09-14

Numbering continues 7F1's R1–R7 and 7F1-D45's R8–R9.

**R10 — *nu încape* is drawn the way frame 1F draws it, and `text-decoration: line-through` is not
that.** The frame's dropped row is a **dashed** border, a muted background, a `−` glyph in a grey
disc, grey text and the trailing label *nu încape* (`…Mobil.dc.html:448-452`). No strikethrough
anywhere. ADR 0104 decision 1 makes the mockups the chrome specification, and the owner's F8 answer
is *"use the design that was proposed"*; the earlier bullet's word *"struck through"* describes the
item being struck from the **composition**, and a reader took it for a text decoration. **The frame
governs.** *Must not:* a line-through; a row removed from the list instead of shown.

**R11 — the list is the frame's five rows, not the log's twenty.** One row per
`GENERATION_PRIORITIES` entry, in the domain's own order, plus **one aggregate row for storage**.
**No row for an `upper` and none for a `hood`.** Reasons, in order of weight: the frame draws four
rows and one of them is *Depozitare · restul peretelui* — an aggregate, not eight cabinets (G6); the
section's own heading is *Ce așezăm, în ordinea priorității*, and uppers are not in
`GENERATION_PRIORITIES`; a 390 px transient screen cannot hold twenty rows without scrolling past the
footer; and the row set stays **constant as 7D3, 7D4 and 7D5 land**, because those waves change what
storage *is* and not that storage happened. **This overturns *"the steps render in the log's
order"* as a literal instruction** — the *rows* render in priority order, each **resolved from** the
log's steps. *Must not:* one row per storage cabinet; a row for an upper or a hood; a row for a role
`GENERATION_PRIORITIES` does not carry.

**R12 — the frame's third state is real, and it is a whole-list *pending*, never per-row progress.**
`generateKitchen` is **one synchronous call** that returns the finished log; there is no step-by-step
signal to render and there will not be one in this wave. So: on entering composition every row is
drawn **pending** (the frame's spinner and *se calculează*) from `GENERATION_PRIORITIES`' declared
widths, and they all resolve together when the log arrives. **Nothing animates, nothing is sequenced,
and no timer paces a computation that has already finished.** *Why this matters beyond honesty:* a
staged reveal would immediately raise *"what does Back do mid-sequence"* and *"what does the URL say
during it"* — the coordinator's trap 2 — and the answer is that there is no sequence to be in the
middle of. *Must not:* a per-row delay; a progress bar; a row that changes state without the log
changing.

**R13 — composition is a client sub-state over the same URL, and it is not addressable.** No new
query key, no new path segment, no history entry. Three independent reasons, any one sufficient:
a new key is stripped by the settle (G1); a new path segment 404s under the proxy allow-list and
breaks 7E1 criterion 1's *"`/ro/configurator/room/x` still 404s"*; and **an addressable composition
URL means a reload re-runs generation and mints a second design**, which is the exact defect
`createDesignCreationAttempt`'s doc comment exists to prevent. R9 already put the live sub-state in
the client's hands; this is the same rule one step further on. *Must not:* `?step=`, `/room/compose`,
a `pushState`, or any persistence of *"the customer was composing"*.

**R14 — the composition body is rendered *inside* the dimensions step, over the same draft and the
same sync; `room-query-sync.ts` is not touched and `RoomDestination` gains no member.** If entering
composition unmounted `DimensionsStep`, the convergence loop would unmount with a departure armed and
a flush in flight, and *Înapoi* out of 1F would have to re-seed the form from whatever the URL
happened to hold. Keeping the hook mounted makes *Înapoi* out of 1F a **pure state clear**: the draft
is still in memory, caret residue and all, and nothing re-seeds. The screen's composition state lives
in `RoomScreen` (so the top bar can read it for G11's title) and is passed down; `DimensionsStep`
renders either the form body or the steps body and **never unmounts**. *Must not:* a `key` that
remounts the dimensions step on entering or leaving composition; a fifth `RoomDestination`; any edit
to the reconciliation — **the no-second-discriminator block quote applies unchanged**, and this wave
is the *amplifier* that quote already names, because the departure's push is about to matter.

**R15 — generation starts from the event handler, and the adapter is imported dynamically.**
`reactStrictMode: true` (G10) double-invokes effects in development, so an effect that generates
would build two kits and, in 7F4b, mint two rows — with nothing red to catch it, because the second
mint is a *different* attempt and 7E2's guarantee is per-attempt by design. The handler runs once per
tap. And `@lemnaria/three-adapter` reaches the room route **only** through
`await import("@lemnaria/three-adapter")` inside that handler's continuation, so the customer's first
screen does not carry Three.js. *Must not:* a top-level adapter import anywhere under
`apps/web/src/room`; a `useEffect` that starts a run; a run started by a URL change.

**R16 — the generator's refusal is a failure, not a sub-state.** `MINIMUM_NOT_MET` is unreachable
from 1D (G5) and 7F4 asserts that rather than drawing a screen for it. If it is returned anyway, the
screen shows the same *composition could not be completed* state a throw produces: **no mint, no
navigation, no crash**, and *Înapoi* still works. The customer-facing sentence for a room too small
stays 7F2's, at 1C, where a customer can actually act on it.

**R17 — *(7F4b)* the attempt is a field of the run's state, constructed once in the transition that
stores the design.** Not a `useDesignCreationAttempt(design)` hook: a hook keyed on the design
re-creates the attempt whenever that identity changes, which is the per-tap mint the doc comment
warns about wearing a hook's clothes. 7E2's carry-forward (c) said *"consider"*; this is the
consideration, and the answer is no. **The deliberate selection is the *Continuă* tap**; its state is
the composition run; the attempt is created exactly where the design first exists and is reused by
every retry. *Must not:* an attempt constructed in a click handler, in a render, or in a `useMemo`
over the design.

**R18 — frame 1F's last sentence is a note to the mockup's reader and does not ship.** The paragraph
reads *"Regula: pe pereți scurți păstrăm întâi spălătorul și gătitul, apoi depozitarea; ce nu încape
este scos și marcat, nu înghesuit. **Pragurile exacte sunt decizie de produs nefinalizată.**"* The
first two sentences are customer copy and describe ADR 0110 A1/A3 accurately. The third announces an
unfinished product decision — **which has since been taken** (ADR 0110 Amendment A, the owner's
2026-09-11 ruling) — and telling a customer that a threshold is undecided is not copy. *Must not:*
shipping it; silently dropping the whole paragraph with it.

### Module boundaries

| Module | Owns | Must not |
| --- | --- | --- |
| `src/room/generation-model.ts` | **Pure.** The row model: `GENERATION_PRIORITIES` + one storage row → rows with `pending` / `placed` / `not_placed`, each carrying a role, a width or *the rest of the wall*, and nothing else. Folds a `GenerationLog` onto that row set. Also the dropped-roles list for the warning. | Import React, next-intl, `three`, or the adapter. Resolve a sentence — it publishes roles and codes (ADR 0095 decision 3). Read a `Design`. |
| `src/room/use-generation.ts` | The run: the dynamic adapter import, the probe factory (a transient kit, `createBodyProbeLease`, disposal), the one `generateKitchen` call, the state machine and its failure arms. **7F4b adds the hand-off.** | Render. Start itself from an effect (R15). Hold a probe past `lease.use`. Write to the URL, a store, a cookie or web storage. |
| `src/room/generation-steps.tsx` | Frame 1F's body: heading, room summary, the notice, the row list, the rule paragraph, the footer's two controls. | Own any state the model can derive. Spell a role's label at a call site. Import the adapter. |
| `src/room/room-screen.tsx` *(edit)* | Holding the composition state, the top bar's title per G11, and passing both down. | Unmount `DimensionsStep` (R14). Branch on anything the URL does not say **except** this one client flag. |
| `src/room/room.module.css` *(edit)* | 1F's layout. | Touch a class the form or the plan uses. |
| `src/messages/{ro,ru}.json` *(edit)* | The new `room.*` leaves. | A sentence built by concatenation; a digit baked into a sentence rather than passed as an ICU argument. |

**Where the seam for 7F3 is, stated so it is not discovered by rewriting.** `use-generation` is
entered by **one exported function call**. 7F3 inserts 1D/1E in front of it and calls the same
function when its list is empty or when the customer asks to generate; it does not reach inside the
run. Nothing in 7F4 may assume *Continuă* is the only caller.

### Files, and the must-not-change set

**7F4a production:** `src/room/generation-model.ts` (new), `src/room/use-generation.ts` (new),
`src/room/generation-steps.tsx` (new), `src/room/room-screen.tsx` (edit),
`src/room/room.module.css` (edit), `src/messages/ro.json` + `ru.json` (edit). **Five modules plus the
two catalogues** — at `docs/WORKFLOW.md`'s limit, and the catalogues are the documented UI-wave
exception.

**7F4b production:** `src/room/use-generation.ts` (edit), `src/room/generation-steps.tsx` (edit,
the footer's states), `src/room/room.module.css` (edit). Tests do the rest.

**Must not change — a change to any of these is a finding, not a repair:**

- `src/room/create-design.ts`. 7F4b **calls** it and does not edit it; its per-attempt mint identity
  is the contract, not an obstacle.
- `src/room/room-query-sync.ts`, `room-url-state.ts`, `room-draft.ts`, `plan-preview*`,
  `dimensions-form.tsx`, `shape-picker.tsx` (R14). The U-chip-draws-the-L-plan defect is **7F2's** and
  is not to be fixed here.
- `app/api/designs/route.ts` and anything under `apps/web/src/app/configurator/configure/` — R5 stays
  deferred.
- `packages/configurator-domain/**` and `packages/three-adapter/**`. **If a row cannot be built
  without a new domain export, stop and report**; a UI wave that edits the generator has stopped being
  this wave.
- `eslint.config.mjs`'s room block, except to **add** a selector — and if one is added, the full lists
  are re-declared, as ruling R1 requires.

### Acceptance criteria

Numbering continues the room screen's: 7F1 shipped 1–19 and 7F1-D45 added 20–23, and those criteria
are live against the same screen, so restarting at 1 would give this file two *criterion 3*s for one
surface. Each criterion names its proof: **[unit]**, **[property]** (`fast-check`), **[component]**
(DOM), **[build]** (`next build` output), **[visual]** (390 × 844), **[e2e]** (**CI is the verdict**),
**[measure]** (reported, not asserted), **[review]**. Every criterion says what must not happen.

**7F4a — the composition runs and is drawn**

24. **Tapping *Continuă* at 1B enters composition, and composition is nowhere in the URL.** The tap
    still flushes through `departTo` exactly as it does today; the screen additionally enters the run.
    After it: the query is byte-identical to the canonical room, `history.length` is unchanged, and a
    **reload returns the customer to the form** with every field intact and no run in progress.
    **Must not:** a new query key; a new path segment; a `pushState`; any storage of *"was composing"*
    (R13). **[component]** + **[visual]** + **[review]**
25. **The top bar changes title and nothing else.** *Cameră* → *Preset* on entering, back on leaving;
    the step pill still resolves `configure.step` / `configure.stepPill` at `{ step: 1, totalSteps: 4 }`
    and the locale menu is still there (M7 criterion 1, ruling R7). **Must not:** a second title leaf
    under `room.*` that could drift from `room.title`; a pill that changes; a bare string as an
    accessible name. **[component]** + **[visual]**
26. **The body is replaced, not hidden, and 1F's own *Înapoi* returns to the fields.** In composition
    the chips, the plan preview and the length fields are **absent from the DOM**; *Înapoi* restores
    them with **the draft exactly as it was**, including text that never parsed as a length, because
    the sync never unmounted (R14). **Must not:** `display: none` over the form; a re-seed from the
    URL on the way back; `departTo` called for this transition. **[component]**
    > **This is not in tension with 7F2's *"must not remove a control 7F1 shipped"*.** That rule is
    > about **1C**, which is the same editing state with reasons added. 1F is a different step of the
    > screen — the frames even change the title for it — and replacing the body is what the frame
    > draws.
27. **Generation is called exactly once per entry into composition, from the event handler.** A spy on
    `generateKitchen` sees **one** call per tap, with ~~the room the URL holds~~ **the room the draft
    holds**; re-rendering the screen, settling the URL, or changing the locale calls it **zero** further
    times. **Must not:** a call from `useEffect` (a **mount** effect is double-invoked under React
    StrictMode — G10, and see slice 2's corrected table for the shape StrictMode does *not* catch); a
    call on mount; a call per keystroke. **[component]** + **[review]**

    > **Amended 2026-09-14 during 7F4a, on the implementer's finding.** *"The room the URL holds"* was
    > wrong and would have shipped a dead button. **The URL trails the draft by up to `URL_SETTLE_MS`
    > (400 ms)**, so within that window the live query holds the *previous* room or — at 1B, which is
    > the ordinary way to arrive, because you type the last field and tap — **no room at all**. A
    > URL-derived room would therefore return `undefined` and compose nothing, leaving *Continuă* dead
    > for 400 ms after the last keystroke on the most common path. **That is 7F1-D45's dead-CTA defect
    > arriving through a different door**, in the wave immediately after the one that fixed it.
    >
    > **The draft is not a second authority.** *Continuă*'s enabled-ness is already a draft question
    > (`canContinueFrom(draft, policy)`), and at the moment of the tap `departTo` is flushing that same
    > draft to the address bar — so the draft is the query the URL is about to hold, one round trip
    > early. Ruling R9 is untouched: the client remains the sole authority on live sub-state, and
    > nothing here reads a second copy of the URL.
28. **The kit is borrowed through a lease and released on every path, including a throw.** A ledger
    like `tests/support/fake-probe.ts`'s records one allocation and one release per run, for: a normal
    run, a run whose `generateKitchen` throws, a run the customer leaves mid-flight, and two runs in
    succession. **Must not:** a kit created outside `createBodyProbeLease`; a probe referenced after
    `use` returns; a kit cached between runs (ADR 0074 decision 3, ADR 0076). **[component]** +
    **[unit]**
29. **Every row is pending first, and they all resolve together** (R12). Before the log exists the
    list holds one row per `GENERATION_PRIORITIES` entry plus the storage row, each pending, each
    showing the declared width (storage shows *the rest of the wall*, never a number). The pending
    frame is **painted before** the blocking call — asserted in the browser, not argued. **Must not:**
    a row appearing or disappearing when the log lands; a per-row timer; an empty screen during the
    run. **[component]** + **[visual]**
30. **The resolved rows are a total function of the log, over every role the domain can name.**
    *Property* over `GenerationBaseRole | "upper" | "hood"` and over every
    `RejectionReason | GenerationPlanningReason` code: the model returns a row set and a label for
    every input and **throws for none**, and a role added to `GENERATION_PRIORITIES` without a
    catalogue leaf **fails a test** rather than rendering a key. This is what stops 7D5's `dishwasher`
    reaching the seam with no meaning. **Must not:** a `switch` with a silent default; a raw code or a
    build id rendered to the customer. **[property]** + **[unit]**
31. **A *nu încape* row is drawn as the frame draws it and is absent from the design.** Dashed border,
    muted background, `−` glyph, grey text, trailing *nu încape* (R10) — and, asserted against the
    same log: every `not_placed` step's build id appears in **no** placement of the design that is
    handed on. **Must not:** `text-decoration: line-through`; a dropped row omitted from the list; a
    per-reason explanation. **[component]** + **[unit]** + **[visual]**
32. **The storage row is one row and tells the truth about zero.** It is *placed* when any storage
    step placed, and drawn *nu încape* when none did — the 900 × 2200 case the owner ruled on.
    **Must not:** one row per storage cabinet; a count; a storage row that disappears when nothing was
    placed. **[unit]** + **[component]**
33. **The room route does not carry Three.js.** `next build`'s route table still prints
    `ƒ /[locale]/configurator/room`, and its **First Load JS is reported before and after** and grows
    by **under 20 kB** — the adapter and `three` are reachable only through a dynamic import taken in
    the handler (R15). **Must not:** a top-level `@lemnaria/three-adapter` or `three` import under
    `apps/web/src/room`; a prerendered room route. **[build]** + **[review]**
34. **The real probe agrees with the validator where it matters most.** Against the **real** adapter
    kit, `generateKitchen` returns `ok` for each of ADR 0108 Amendment E's accepted boundary rooms —
    stated **wall A × wall B**: **900 × 2200, 2100 × 1000, 1500 × 1600**, plus their +1 mm
    neighbours — closing the gap that
    `minimum-kitchen.test.ts`'s fake-probe agreement property leaves open (G5). **A disagreement here
    is ADR 0110's to settle, not a number to nudge** — the implementer **stops and reports**, and the
    coordinator rules. **Must not:** a constant adjusted, a boundary moved or an exception added in the
    domain to make this go green; a failure absorbed as a tolerance. **[unit]** in
    `packages/three-adapter/tests` (tests only; the package's production code is in the
    must-not-change set).
35. **A refusal or a throw is a dead end the customer can leave, and nothing was written.** With
    `generateKitchen` stubbed to return `ok: false` and, separately, to throw: the screen shows the
    failure state, *Înapoi* still returns to the fields with the draft intact, the lease ledger is
    balanced, and **no navigation happens**. (7F4b adds: and no `POST` is issued.) **Must not:** a
    crash boundary; a blank screen; a room-level reason invented here — that sentence is 7F2's, at 1C
    (R16). **[component]**
36. **Copy: every new leaf lands in both catalogues, in the lock and in the golden manifest.** Each
    new `room.*` leaf exists in `ro.json` **and** `ru.json`; every ICU leaf has an entry in
    `ROOM_RENDER_ARGUMENTS`, or `golden-output-fixtures.ts` throws (G12); `GOLDEN_OUTPUT_SHA256` and
    `romanian-copy-lock.test.ts` are re-baselined **in the same commit**, citing ADR 0113. **Must
    not:** a width or a metre count concatenated into a sentence; a Romanian string outside the
    catalogue; a Russian leaf left to a later wave. **[unit]**
37. **The mobile gate, re-run.** 44 px minimum touch targets across 1F's controls, no horizontal
    overflow at 390 px, in **both** locales — criteria 14 and 15 applied to the new surface. **Must
    not:** a footer the list scrolls under; a row that wraps into the spinner. **[visual]**
38. **The composition's cost is measured and reported, not assumed.** On the verifier's device, at
    390 × 844 in a **production build**: the dynamic import's transfer size, and the wall-clock from
    tap to resolved rows, for a small room and for 6300 × 5100. **Reported.** **A median above one
    second is a stop-and-report**, not a fix improvised in the slice. **[measure]**

**7F4b — the hand-off**

39. **One composition is one design row, however many renders and taps occur.** Through the rendered
    screen with a stubbed `fetch`: a complete run issues **exactly one** `POST /api/designs`; a retry
    after a failed `PUT` issues **none**; re-rendering issues none. This is 7E2's carry-forward (b),
    and a factory-level test does not discharge it. **Must not:** an attempt built in a handler, a
    render or a `useMemo` (R17). **[component]**
40. **Navigation happens only after the `PUT` resolves, and only to the design just written.** The
    router is called once, with `/d/{id}` for the `id` the mint returned, after the write — never
    before, never twice. **Must not:** a navigation on the mint's 201; a navigation while the write
    is in flight. **[component]**
41. **A failed hand-off keeps the customer where they are, with a way forward.** A failed mint, a
    failed `PUT` and a synchronous repository throw each leave the screen in 1F with the composed rows
    still shown and a retry control; the retry **reuses the same attempt**, so a retry after a failed
    `PUT` writes to the already-minted row. **Must not:** a second mint; a silent failure; a retry
    that re-runs generation. **[component]**
42. **Leaving disarms the hand-off.** If the customer taps *Înapoi*, or the screen unmounts, while the
    write is in flight, the write may still land — **but no navigation follows it**. The customer stays
    where they went. **Must not:** a router call from a closure that outlived the run; cancelling the
    write and leaving a half-written row. **[component]**
43. **The editor opens on the generated kitchen.** The document read back through
    `GET /api/designs/{id}` **deep-equals** `generateKitchen(...).design` — 7E2's criterion 1 re-asserted
    on a **genuinely generated** document rather than a fixture-derived one, which is 7E2's
    carry-forward (d) — with `presetId: null` and `room` equal to the room the customer typed, to the
    millimetre. **Must not:** a locale, a price or a placement id in the URL; the seed fixture
    surviving into the stored document. **[component]** + **[e2e]**
44. **The journey, once, end to end.** `/ro/configurator/room` → choose **L** → type a room → *Continuă*
    → 1F → the editor at `/ro/d/{id}` showing that kitchen; then *‹ Cameră* returns to Step 1 with the
    room filled in (7E2 criterion 5, now with fields to fill). **CI is the verdict** — a green local
    run proves nothing about the runner. 7K inherits this spec rather than rewriting it. **[e2e]**

### The copy 7F4a adds

Romanian is the source (ADR 0095, ADR 0113). Drafted from frame 1F; **the Russian is drafted by the
same rule and approved by ADR 0113**. Keys under `room.compose.*`:

| Key | Romanian, as drafted | Source |
| --- | --- | --- |
| `room.compose.title` | *Preset* | frame's top bar (G11) |
| `room.compose.heading` | *Ți-o construim pe a ta* | frame 1F |
| `room.compose.roomSummary` | ICU over the shape's `short` label, the walls and the height | frame 1F, `În L · 3,60 × 2,40 m · h 2,60 m` |
| `room.compose.noPresetNotice` | *Niciun preset gata făcut nu încape aici. Compunem una pe măsura camerei tale — durează puțin mai mult.* | frame 1F |
| `room.compose.stepsLabel` | *Ce așezăm, în ordinea priorității* | frame 1F |
| `room.compose.role.{fridge,sink,preparation,hob,storage}` | *Frigider*, *Spălător*, *Blat de lucru*, *Plită și cuptor*, *Depozitare* | frame 1F; `preparation` is not drawn and is drafted |
| `room.compose.rowWidth` | ICU, `{millimetres}` | frame's `· 600` |
| `room.compose.storageExtent` | *restul peretelui* | frame 1F |
| `room.compose.status.{pending,placed,notPlaced}` | *se calculează*, *așezat*, *nu încape* | frame 1F |
| `room.compose.rule` | the paragraph's **first two sentences only** (R18) | frame 1F |
| `room.compose.busy` | *Se compune…* | frame 1F's footer |
| `room.compose.dropped` | **owed to the owner — Q7F4-1** | ADR 0110 Amendment F |
| `room.compose.failed` / `room.compose.retry` | not drawn in any frame — drafted, and named as drafted | criteria 35, 41 |

**The dropped-roles message is the one piece of copy no frame supplies**, and the ruling that created
it says so: *"the wave that builds it should confirm the wording with the owner"*, and *"do not
over-build this… one message naming the dropped roles, in the state the screen already has, reading
`plan.dropped` as it stands. No new sub-state, no per-role explanation, no recovery flow."* **That
instruction is binding on this wave.** The draft to put to the owner, one leaf and one conditional:
*"Camera nu a lăsat loc pentru: {roluri}. Restul bucătăriei e compus pe măsura ei."*

### Slices, dispatched one at a time

**7F4a**

- **Slice 1 — the model.** `generation-model.ts` and its tests only. No React, no adapter. **Done
  when** criteria 30, 31 (the *absent from the design* half) and 32 hold, and the pending row set is
  produced from `GENERATION_PRIORITIES` with no log at all. *First because everything else asserts
  against it, and because it is the only part that can be proven without a browser.*
- **Slice 2 — the run.** `use-generation.ts`: the dynamic import, the probe factory copied in shape
  from `generated-kitchen.parity.test.ts:40-48`, the lease, the one call, the state machine and its
  failure arms. **Done when** criteria 27, 28, 33 and 35 hold. **Gate inside this slice, and it is a
  stop-and-report:** criterion 38's measurement, taken in a production build **before slice 3 is
  dispatched**. If the median exceeds one second the implementer stops; whether to accept it, to move
  the work, or to change the screen is the coordinator's to rule, not the implementer's to improvise.
  > **In the slice, not only in the rulings: `reactStrictMode: true`** (`apps/web/next.config.ts:9`).
  > A run started from a **mount** `useEffect` **double-fires in development** — two kits, and in 7F4b
  > two design rows — and nothing currently red would catch the second, because it is a *different*
  > attempt and 7E2's one-row guarantee is per-attempt by design. **The run starts from the tap
  > handler** (R15), and criterion 27's spy is what proves it.
  >
  > **Corrected 2026-09-14 by 7F4a's implementer, who falsified the guard rather than trusting it.**
  > The word **mount** above was added, and it matters. R15's *rule* refuses two shapes of
  > effect-started run, but the reason as first written is true of only one of them:
  >
  > | Shape | Double-fires under StrictMode? | What actually catches it |
  > |---|---|---|
  > | An effect that generates **on mount** | **Yes** | Eleven tests, loudly — composition starts with no tap and the bar reads *Preset* on arrival |
  > | An effect keyed on **a tap flag** | **No** — React re-runs effects at *mount* only, so an effect whose first run is an update fires once either way | *"balances the ledger over two runs in succession"* — a dep that does not change cannot fire a second run, so the **second** tap composes nothing |
  >
  > **So a later reader must not use "StrictMode would catch it" to judge whether some other
  > effect-started run is safe.** For the tap-flag shape it would not, and the guard that does catch
  > it is a different test entirely. The measurement is recorded at the test site so the next person
  > inherits the finding rather than the claim.
- **Slice 3 — the screen.** `generation-steps.tsx`, `room-screen.tsx`, `room.module.css`, both
  catalogues, the golden and lock re-baseline. **Done when** criteria 24, 25, 26, 29, 36 hold.
- **Then the visual gate**, 390 × 844, both locales, on a **production build**, with the tree frozen.

> **Three must-not-files for the gate's brief, so a correct screen is not filed as a broken one.**
> **(1) In 7F4a the primary control never resolves** — it stays disabled reading *Se compune…* after
> the rows have settled, because the destination is 7F4b's. **(2) The list does not animate**; every
> row resolves in the same frame (R12). **(3) Selecting the **U** chip with `wallC` empty draws the
> **L** plan** — 7F1-shipped, **7F2's**. *What **is** a finding:* a frozen screen with no pending rows
> painted, a row that changes state on its own, horizontal overflow at 390, a touch target under
> 44 px, or a browser console error from the adapter import.

**7F4b**

- **Slice 4 — the hand-off.** The attempt as a field of the run's state (R17), the navigation, the
  failure and retry states, the departure disarm. **Done when** criteria 39–43 hold.
- **Slice 5 — the journey.** Tests only: criterion 44's e2e. **Done when** it passes **on CI**.
- **Then a short visual pass** on the resolved footer and the retry state.

### Risks, ranked, with the reason for the rank visible

1. **A second design row per composition.** Ranked first because it is the only failure here that
   **writes to the database**, it is invisible locally, and the shape that produces it is the obvious
   one to write — `createDesignCreationAttempt` inside a handler or a `useMemo` over the design mints
   and navigates per call, and every existing test would stay green (7E2's close-out says so in
   terms). Guard: R17, criterion 39, and 7F4b being its own reviewed wave.
2. **A frozen phone.** `generateKitchen` is synchronous and runs on the main thread after building a
   Three.js kit; the pending rows must have painted before it starts or the customer sees a stopped
   screen. Ranked second because it is certain to *happen* — the only question is for how long — and
   because **no local intuition substitutes for the measurement** (criterion 38, and it is a slice
   gate rather than a closing check for exactly that reason).
3. **The real probe disagrees with the validator.** The validator-generator agreement property runs on
   a **fake** probe (G5), fit is judged on the **measured** carcass, and the real adapter is what this
   wave introduces. Ranked third rather than first because `generated-kitchen.parity.test.ts` already
   generates sample rooms with the real probe and would have caught a gross disagreement — but it
   samples comfortable rooms, and the disagreement, if any, lives at the minimum boundary. Criterion 34
   is aimed exactly there. **A failure here is ADR 0110's to settle, not a number to nudge.**
4. **Three.js in the room route's first load.** Ranked fourth because it is loud once measured and
   silent until then: a static import compiles, tests pass, and the customer's first screen quietly
   gains ~600 kB. Guard: R15 and criterion 33's before/after figures.
5. **A leaked kit.** Each kit owns buffers, materials and canvas textures; a run that throws between
   `makeKit` and `disposeKit` leaks one, and a customer who retries leaks one per attempt. Ranked here
   rather than higher because `createBodyProbeLease`'s `finally` makes the correct shape the easy one —
   the risk is a factory written without it. Guard: criterion 28's ledger.
6. **The departure's push meeting a real destination.** 7F1-D45's block quote names this wave as the
   *amplifier* of its one trigger: while *Continuă*'s push was a no-op, a discarded navigation cost
   nothing. Ranked sixth, not lower, because the failure reads as flakiness — a second tap works.
   Guard: R14 (touch nothing in the loop) and criterion 24's assertion that the query and
   `history.length` are unchanged.
7. **Scope creep into 7F3 and 7F2.** A composition screen invites a *"no presets yet"* list, a
   per-reason explanation and a recovery flow; the owner's ruling forbids the third by name and R11
   forbids the second. Ranked last because it costs a review round rather than a defect — but it is the
   most likely of the seven to actually occur.

### Questions that are not mine — all three answered 2026-09-14, at `f0f3ae9`

- **Q7F4-1 — the owner's.** The dropped-roles sentence's wording, per ADR 0110 Amendment F's own
  instruction to confirm it. Draft above. **Put to the owner 2026-09-14; the interim stands and the
  wave is not blocked** *(coordinator)*: ship the draft marked unapproved in the code. **If the answer
  changes it, that is a message-file edit — the cheapest kind of change to absorb late**, which is why
  it does not gate a slice.
  > **Answered 2026-09-15, during 7F4a, and it changed the wording.** The owner ruled that the
  > dropped sentence **must say the wall sizes did not leave enough space**, and ruled two status
  > labels with it: *așezat* → **inclus**, *nu încape* → **nu poate fi inclus**. `room.compose.dropped`
  > now reads *"Dimensiunile pereților nu au lăsat destul spațiu pentru toate dulapurile, așa că nu am
  > putut include: {roles}. Restul bucătăriei e compus pe măsura camerei tale."*, and
  > `room.compose.rule` is reworded to match the new label. **The interim did not survive**, which is
  > the argument for keeping such a question off the critical path rather than against it: the change
  > was a message-file edit, absorbed late, exactly as ruled.
  >
  > **The owner also asked whether the algorithm could drop non-fitting cabinets by itself.** It
  > already does, and has since 7D1 — and the owner then ruled that **the report stays**.
- **Q7F4-2 — the coordinator's. → *Split: 7F4a, then 7F4b.*** *(Coordinator, 2026-09-14, taking the
  recommendation and its reason.)* **The halves fail differently and different instruments catch
  them:** a bundle, a frozen main thread and a leaked kit are browser-measurable; **a duplicate design
  row is not**, and only a component test with a stubbed fetch sees it — the gap 7E2's close-out
  already named. A single wave would have hidden it behind nine must-fix items and a dispatch limit
  exceeded *"deliberately"*. **7F4a is closed and reviewed on its own before 7F4b is dispatched.**
- **Q7F4-3 — raised as possibly the owner's. → *Both upheld, and ruled by the coordinator rather than
  deferred.*** *(Coordinator, 2026-09-14.)* **The frame is the design that was proposed** — the owner's
  F8 answer pointed at a frame, not at a paragraph. **R11:** four rows and an aggregate against a log
  of twenty-three steps *"is not a close call"*, and the prose *"in the log's order"* was written
  before anyone had read the log's shape. **R12:** one synchronous call means there is no sequence to
  be in the middle of, and a per-row progress UI would be **animating a fiction** — *"that it also
  deletes my trap 2 is a consequence, not the reason."* **Recorded by striking the clauses in place**
  at the 7F4 bullet above, never by rewriting them, so a later reader who finds the prose alone sees
  what lost and why.

### Verification

Per-package `vitest` for `apps/web` (and, for criterion 34, `three-adapter`'s **tests** only),
`typecheck`, `lint` and a whole-tree `pnpm format:check` at each wave's end. `next build` for
criteria 33's route table and First Load JS. A 390 × 844 visual gate in **both** locales against a
production build, with the tree frozen. 7F4b adds e2e, and **CI is its verdict** — `scripts/local-ci.sh`
never sets `CI`, so every local e2e runs against `next dev` (7F1-D45's close-out records this in full).
**The composition duration is reported, never rounded and never assumed.**

## Wave 7P1 — dispatchable punch list: the preset store

> **Planned 2026-09-15 by the architect, on branch `m7-room-and-presets` at `41181d8`.** This is the
> binding version of the **7P1** bullet at *Revised criteria for new and changed waves* (four
> criteria, above) and of the 7P1 row in the revised wave table; where this section and those
> disagree, this section is later and says why. The four carried criteria all survive and are
> widened — see the map at the end of *Acceptance criteria*. **Nine rulings below are the
> architect's and are marked as such**; ADR 0112 settles the shape of the row and does not settle
> most of what an implementer has to type. **Three questions are not mine** — Q-7P1-1 and Q-7P1-2
> are the coordinator's, Q-7P1-3 is owner-facing and goes in tomorrow's batch rather than blocking.

### Read this before anything else: what the freeze does and does not make expensive

**Wave 7P2 is the project's freeze point**, and 7P1 builds the store 7P2 starts writing into. The
owner's ruling of 2026-09-14 — *"there are no existing saved kitchens at the moment… until we'll not
implement all the milestones, and I will not explicitly mention that we move it to production, we
are pretty safe to not worry about existing kitchens"* — is what makes every wave up to here free
with stored data. **From 7P2 onward it is not.** So the preset record's shape is the most
consequential thing this wave decides, and it is decided once.

**But the boundary has to be stated precisely, or the wave will over-build.** What the freeze makes
expensive is:

1. **a change to the meaning of a column that already holds the owner's data** — a rename, a retype,
   a re-derivation, or anything needing a backfill;
2. **any field the matcher reads**, because a field 7B needs and the row lacks cannot be filled in
   retrospectively for presets already authored;
3. **a change to what `document` means**, because the snapshot is a `Design` and is migrated by the
   design mechanism.

What the freeze does **not** make expensive is **adding a nullable column**. `alter table … add
column if not exists` is additive, idempotent, recognised by the unattended screen, and touches no
stored row. That distinction is why ruling **P5** declines to guess at 7G's thumbnail storage rather
than creating a column now "to be safe".

**One correction to a premise that is repeated in this file and is false.** *"There are no stored
designs"* is the owner's statement about **customers' kitchens**, and it is true of those.
[ADR 0038](../decisions/0038-pre-release-no-stored-designs-no-migrations.md)'s founding premise was
measured false twice, most recently by [ADR 0052](../decisions/0052-800-mm-is-the-ceiling-on-any-empty-column.md)
on 2026-09-02: **five `designs` rows exist at `schema_version` 1.** Those are development rows.
**What is genuinely new about a preset is not that it is stored — it is that it is not
reproducible.** A generated kitchen can be regenerated from its room; a customer's design is theirs
and is replaceable by them; **an adjusted-by-hand preset exists nowhere else, and
[ADR 0117](../decisions/0117-generation-produces-the-cheap-correct-baseline-and-the-owners-taste-enters-through-presets.md)
decision 3 makes it the only route the product has to a refined kitchen.** That, and not a row
count, is why the backup half of this wave matters and why it is not a chore appended to the
migration. *(The framing is the architect's; the facts in it are ADR 0052's and ADR 0117's.)*

~~**A sequencing note, recorded as LIKELY and not decided — do not act on it.**~~ **RULED, later the
same day: the whole preset story is DEFERRED PAST M8, this wave included. Do not dispatch 7P1 from
this plan without re-measuring it first.** The owner first said *"now I will focus on building
automatically this kitchen configurations and just after focus on the presets functionality"*, and
then settled it — **storage, authoring and admin panel all come *"after even third page that is
milestone 8"*** (relayed; recorded in full in the 7P2 section's own deferral banner, which is that
wave's author's and not edited here).

Three consequences, and the first is now a **precondition of dispatch** rather than a caution:

1. **This plan's ground truth at `41181d8` is re-measured, never inherited.** Every `file:line` in
   the table below is a fact about a tree that will be a milestone old by the time anyone acts on it.
   **A wave that re-measures nothing is a wave planning against a memory** — and the G-rows most
   likely to have moved are exactly the load-bearing ones: G3's deployed-schema gate, G5's CI gating
   (7T may have closed it), and G1's migration number, which **another wave will almost certainly
   have taken** (risk 8 anticipated 7E3a and 7E3c; over a whole milestone, assume it).
2. **The 7D6 / 7D7-before-7P2 deadline gets *easier*, not harder**, because the freeze moves out with
   the wave. **It does not disappear**: the deadline is *before the owner first saves a preset*, not
   *before a date*, and that is still 7P2.
3. **Nothing in 7T, the deployed-schema gate gap (G3) or T-J2 changes.** They are facts about the
   repository rather than about the order, and 7T in particular **should not wait for the preset
   story** — it repairs coverage the database seam has been missing all along.

*(The deferral is the owner's, relayed. Which parts of this plan it makes stale is the architect's
reading, and it is deliberately stated as a dispatch precondition rather than as a note, because a
plan this detailed is exactly the kind a later reader trusts without re-checking.)*

**Sharpened 2026-09-15 by the owner's retention ruling — *"presets will be stored forever"* (P11).**
The freeze argument above is now stronger than when it was written, and in a way worth stating
plainly: **a row that is never deleted is a row whose schema mistakes are permanent.** For a table
with a retention policy there is a natural horizon past which the oldest shape ages out and the
problem solves itself. **Presets have no such horizon, by the owner's own ruling.** So *"free until
7P2"* has a second half that was previously implicit: **after 7P2, wrong is forever.**

> **Corrected the same day, and the true version is broader than the one above.** That contrast
> leaned on `designs` being the table that *does* age out. **It no longer is.** The owner retired the
> 30-day cleanup outright (P11, third position), so **no table in this project has a retention
> horizon: every stored shape is permanent by default.** The paragraph above is not false, but it
> misleads by implication, and the honest statement is that **the freeze argument is a fact about the
> database, not a fact about presets.** Presets were only the first place it bit, because they are
> the first thing the owner authors by hand.
>
> **The observation generalises; this wave's rulings do not.** 7P1 rules on `presets` and on nothing
> else. **A later planner must not read the sentence above as licence to rule on a table this wave
> does not own** — it is a reason to look at that table's own shape, not a decision already taken
> about it. *(Correction the architect's, ruled with the coordinator 2026-09-15.)*

**A standing preference of the owner's, recorded once because three plans grew obligations for
hazards that do not exist.** They gave the same instruction twice in one day from opposite
directions — *"to try to solve conflicts that at the moment we shouldn't create in general"* (on the
reaper) and *"we try to solve an issue that we don't have"* (on schema versioning), with
*"let's focus on the functionality, not on solving potential problems that we didn't have yet. So
just keep it stupid simple."*

**The test is whether a problem has occurred, not whether it is foreseeable.** And the half that
keeps this from becoming an argument against all foresight: **recording an obligation with its
trigger named is cheap and reversible; building machinery for it is neither.** A sentence saying
*"when X happens, do Y"* costs a line and can be deleted. A column, a flag, a screen or a sweep
built for the same X is a thing that must be kept working whether or not X ever arrives.

**Its durable home is an ADR, not this file.** Milestone plans are archived when a phase closes, and
[ADR 0117](../decisions/0117-generation-produces-the-cheap-correct-baseline-and-the-owners-taste-enters-through-presets.md)'s
own alternatives rejected *"record it in the milestone plan and nowhere else"* for exactly that
reason. **Recommended to the coordinator, not written here** — it is a cross-cutting preference and
authoring its record is not this wave's to take unilaterally.

### Ground truth, measured at `41181d8`

Each is a file and a line, because six of them contradict something a reader would reasonably assume.

| # | Measured | Consequence |
| --- | --- | --- |
| G1 | Migrations run `0001`–`0004`; `readMigrationFiles` enforces a contiguous run from 0001 (`migration-files.ts:73-93`). Two test files carry the literal filename list (`tests/migrate.test.ts:51`, `tests/migration-files.test.ts:30`), and the package's `build` script asserts `src/migrations/*.sql` and `dist/migrations/*.sql` have the **same count**. | **`presets` is `0005`.** Three places outside the migration directory must change with it, and the build's count check is the one that fails silently-looking at a `tsc` step rather than in a test. |
| G2 | **No migration file contains a `grant`.** The application role's privileges on `designs` are granted by hand outside the runner; `tests/application-role-privileges.test.ts:57-72` asserts exactly `INSERT, SELECT, UPDATE`. | **A new table is created owned by the migration role, and the application role gets nothing.** The read path answers `permission denied for table presets` until an operator grants. **That is a deployment step, not a code step**, and ADR 0112 decision 1's *"granted `SELECT, INSERT` and nothing else"* is an instruction to a human. |
| G3 | **The deployed-schema gate is `designs`-only.** `TABLE_PRESENCE_SQL` asks about `schema_migrations` and `designs` and nothing else (`migrate-status.ts:54-57`); `DESIGN_COLUMNS_SQL` reads only `designs` (`:62-64`); `REQUIRED_DESIGN_COLUMNS` lists only `designs` columns (`migration-status.ts:97-119`). `deploy.yml`'s *"Verify by reading the schema back"* step is **THE GATE**. | **It would report `level` against a production database with no `presets` table at all.** That is the 2026-09-07 incident's exact shape, one table over — and the gate is structurally blind to it, not merely untested. **Closing it is a work item of this wave** (ruling P8, criterion 8). |
| G4 | `migrate:status` connects as `MIGRATION_DATABASE_URL` — the owner role — and reads `information_schema`, which is privilege-filtered **by the reader**. | **The gate cannot see a missing application grant in either direction.** Nothing in the deploy path can. G2's step has no automated witness at all except the privilege test in G5. |
| G5 | **Every live persistence suite gates on `Boolean(process.env["DATABASE_URL"])`** — `application-role-privileges.test.ts:16`, `backup-restore-round-trip.adversarial.test.ts:37`, `design-row-source.test.ts:12`, `migrate.test.ts:33`, `neon-configuration-repository*.test.ts` — and `ci.yml`'s `test` job **deliberately does not set it** (`:136-138`), while it does set `TEST_DATABASE_URL` (`:143`). `resolveTestDatabaseUrl()` needs only the latter (`test-database-url.ts:120-130`). | **The whole live persistence suite is skipped in CI.** Four of those five suites *could* run there and do not. A Full + security wave whose centre is a migration therefore has **no CI gate on its central artefact** — see ruling P7 and risk 4. |
| G6 | Wall lengths are derived, not stored: `wallLengthMm(wall, room)` maps **A → `room.widthMm`, B → `room.depthMm`** (`queries/overflowing-placements.ts:45-50`), and that mapping is deliberately not `max(width, depth)` (ADR 0065 decision 5). `DesignRoom` carries `shape`, `widthMm`, `depthMm`, `heightMm` and **no per-wall lengths and no corner direction** (`design.ts:144-150`). | ADR 0109 Amendment A2's ±600 window has exactly **three inputs**: the shape, wall A and wall B. Height is **not** a match criterion — a ceiling below the preset's tallest body is an *adaptation* (Amendment B), not a filter. *(That reading is the architect's; A2 says "every wall" and B rules the ceiling separately.)* |
| G7 | **`migrateDesign` can rewrite the room.** `correctPreCorrectionRoom` is the version-2 arm (`migrate-design.ts:117`, `196-`), and it exists precisely to replace the room a stored document carries. | **The room read off a loaded snapshot is not necessarily the room the preset was authored at.** This is the argument that keeps ADR 0112 decision 1's room columns from being redundant — and the reason ruling **P2** puts an executable guard between them rather than trusting them to agree. |
| G8 | `CURRENT_SCHEMA_VERSION` is **5** (`migrate-design.ts:62`). `mint` stamps it; `load` passes `row.schema_version` — never the constant — to `migrateDesign` (`neon-configuration-repository.ts:133-141, 231-246`). ADR 0096 decision 9 exists because the **document** version and the **migration** number were conflated once during a live diagnosis. | The row's `schema_version` is the *document*'s version; the row's *columns* are versioned by migration number. **Two mechanisms, already both present, and a preset needs no third** (ruling P1). |
| G9 | **A design id is today a read capability to anyone holding it.** 7E3b is what closes that, and the recommended order puts it after 7P1, 7P2, 7G, 7B, 7C, 7F2, 7F3 and 7E4. | **The preset row must not carry the design id it was snapshotted from** (ruling P3). This row is read on every customer's Step 1. |
| G10 | `Design.presetId` already exists — `z.string().max(…).nullable()`, **mandatory, nullable** (`design.ts:209`) — and a generated design sets it to `null` (`generation/shell-design.ts:134-138`). | The link from an applied design back to its preset already has a home. **This wave adds no field for it and no foreign key**; the two tables have different lifetimes and a customer's design must not be deletable-blocked by a preset or vice versa. |
| G11 | Locales are exactly `["ro", "ru"]` (`apps/web/src/i18n/routing.ts:4`). | The name map has two possible keys today and must not be typed as a fixed pair of required strings. |
| G12 | One cron path, `0 3 * * *` → `/api/cron/backup-designs` (`apps/web/vercel.json`); the route maps a **single** `BackupStatus` to a status code (`route.ts:21-25`); `BACKUP_PAGE_SIZE` is 200 rows held in memory at once (`backup-designs.ts:53`). | Ruling **P6**: one invocation, two separately-scoped exports, and the route's status contract changes — which is a monitoring-visible change and needs its own criterion (15). |
| G13 | The unattended screen recognises `create table if not exists` as the first of six additive shapes (`migration-safety.ts:70-92`), strips comments first (`:226-234`), and diagnoses a bare `drop`, `update`, `delete` or `truncate` **anywhere in a statement**. | A prose header discussing `drop` is fine; **a clause naming it is not.** This is why ruling **P4** declines a `check` constraint whose value space is known to be growing — widening one needs a drop, which the screen refuses by construction. |
| G14 | `deleteDesignsForTests` is the only cleanup path, is `designs`-only, refuses outside a test runner and resolves its own URL (`delete-designs-for-tests.ts:34-47`). ADR 0006's rule is that a suite minting rows removes them. | A `deletePresetsForTests` counterpart is owed, in the same package, under the same refusals. |

### Rulings

**P1 — the record shares `designs`' schema-version mechanism and gains no version number of its
own.** *(Architect's; ADR 0112 does not settle it.)* The snapshot **is** a `Design` document, so it
carries the document's `schema_version`, stamped with `CURRENT_SCHEMA_VERSION` at insert and read
back and handed to `migrateDesign` on load — the same two lines `mint` and `load` already contain.
The row's **columns** are versioned by migration number, as `designs`' are. A third scheme —
`preset_record_version` — would be a second authority over the same question and would have to be
kept in step with both existing ones; **G8 is the record of what happened the last time two of these
were confused**, and adding a third is the same mistake with more surface.

**P2 — ADR 0112 decision 1's room columns stay, and an executable guard is what stops them becoming
a second authority.** *(Architect's; this is how decision 1 is implemented, not a change to it.)* The
row carries `shape`, `wall_a_mm`, `wall_b_mm`, `height_mm`, and all four are derived **at insert** by
one exported function, `presetRoomOf(design)`, reading `wallLengthMm`'s own mapping (G6) so no second
wall mapping exists in the tree. The read path re-derives from the loaded snapshot and **compares**.

> **Corrected 2026-09-15, and it is a correction to this ruling rather than an addition to it.**
> ~~All four columns are `not null`.~~ **Every wall column is NULLABLE, and carries a length only for
> a wall the shape actually has.**
>
> **The defect this removes, which was live in the ruling above.** `wallLengthMm("B", room)` returns
> `room.depthMm` **unconditionally, for every shape** (`queries/overflowing-placements.ts:45-50`). A
> **linear** kitchen has no wall B — so a linear preset would have stored the room's *depth* in a
> column named `wall_b_mm`. **A wrong value under a column name that asserts otherwise is worse than
> a missing one**, and it would have surfaced first in the owner's own dashboard filter — *"wall B
> between three and four metres"* matching linear presets on a number that is not a wall.
>
> **Why the timing is the whole point.** 7J ships linear kitchens **after** 7P2, so the first linear
> preset would have been authored into a frozen `not null` column, and the obvious thing to put there
> is the wrong number. Nullable now is free; nullable later is an `alter column drop not null` the
> unattended screen does not recognise (G13), on a table holding the owner's data.
>
> **It also sharpens the matcher, which is the tell that it is the right model and not a patch.**
> ADR 0109 Amendment A2's *"every wall is within ±600 mm"* means **the walls the shape has**. With a
> NULL wall B, a linear preset compares wall A alone by construction, instead of silently comparing a
> room depth against a wall length.
>
> **And it makes M7B's third wall free.** `wall_c_mm` arrives as another nullable column when the U
> shape does; no existing L or linear preset has a wall C, so NULL is already correct and **nothing
> is backfilled**. Adding a nullable column is free before and after the freeze, by this plan's own
> reasoning — it is changing a column that already holds data that is not.
>
> *(Found by taking the coordinator's dashboard-filter question seriously, three waves away from the
> matcher. Recorded that way on purpose: neither of us found it by re-reading the schema.)*
They cannot merely be trusted to agree — G7 shows `migrateDesign` rewriting the room is a thing this
codebase has actually done — and two numbers agreeing by luck is precisely
[ADR 0028](../decisions/0028-wall-depth-is-derived-from-the-worktop.md)'s defect and
[ADR 0102](../decisions/0102-a-recorded-source-must-explain-its-depth-and-a-second-authority-in-a-test-is-the-defect-laundered.md)'s.
**Fail-closed and per row:** a record whose columns and snapshot disagree is dropped from the list
with a named code and logged; the list still returns every other row. **The obligation this creates,
recorded here so a later author finds it:** once presets exist, a new `migrateDesign` arm that
rewrites `room` owes the preset table a re-stamp, and that is an operator migration rather than a
code change.

**P3 — the record does not carry the design id it was snapshotted from. Must-not, not merely out of
scope.** *(Architect's.)* ADR 0112 decision 1 does not list it, and G9 is why its absence has to be
deliberate: until 7E3b lands, a design id is a read capability, and this is the one row read on every
customer's Step 1. One careless serialisation publishes the owner's own kitchen link. If provenance
is ever wanted, a **hash** of the id is the shape to use, and it is a later wave's.

**P4 — no database-level `check` constraint on `shape` or `status`.** *(Architect's.)* `0003`'s check
constraint is the precedent the other way and it is a good one — but it guards a **security**
invariant over a value space fixed forever (a SHA-256 digest), and application code is not on the
path a manual insert takes. `shape` is a domain enum **known to be growing**: M7B adds `"U"` and a
third wall, and widening a check needs a `drop`, which the unattended screen refuses by construction
(G13) and which would be an operator migration on live preset data after the freeze. `status` has a
fixed value space but no attacker: the application holds no `UPDATE`, so only an operator at the
console can write an odd one, and the strict domain parse at the read seam refuses it immediately and
visibly. **The columns are `text not null`; `PresetRecordSchema` is the authority.**

**P5 — this wave creates no thumbnail column.** *(Architect's; ADR 0112 decision 1 lists a thumbnail
among the row's fields and decision 6 rules how it is captured, neither of which says when the column
appears.)* Where the bytes live — in the row or in Blob behind a pathname — is 7G's decision, and
creating the wrong column now is worse than creating none: it would be a column already holding
owner data at the moment 7G wanted to change it, which is exactly case 1 of the freeze. **The freeze
does not bind here**, because adding a nullable column is free before and after it. **What the wave
order does bind was raised as Q-7P1-2 and is now ruled: 7G adds the column *and backfills every
preset authored before it*** (coordinator, 2026-09-15). So this ruling costs nothing and leaves no
hole — see Q-7P1-2 for the two mechanisms that make the backfill cheap.

**P6 — the export is a second, separately-scoped export and never a widened one.** ADR 0112's
consequences say 7P1 *"extends the export"* to presets;
[ADR 0012](../decisions/0012-scheduled-export-is-a-scoped-sql-select.md) says in terms that the
`designs` export **must not be widened** and that *"another table needs a second, separately-scoped
export — not a broader query."* **The two are reconciled by ADR 0012's own sentence**, and the
outcome is: `backup-presets.ts`, blob prefix `backups/presets/`, its own row source, **reusing** the
streaming, truncation-detection and rotation machinery rather than copying it — **including its
retention settings, which P11 fixes at the same fourteen days and the same count cap `designs` uses
(owner, 2026-09-15: *"14 days backups for me is ok"*). Separately scoped does not mean differently
configured**, and a second constant here would be a second number to keep right for no stated reason. **One cron
invocation, two exports** — a second cron path is a second entry on a plan whose cron limits ADR 0012
already had to reason about, and two exports of one database want one schedule and one alarm. The
route answers **503 if either export failed** and names both in the body (criterion 15).

**P7 — this wave's new live suites gate on `TEST_DATABASE_URL`, and the five existing ones are
reported, not re-gated.** *(Architect's.)* G5 is a real defect and it is not 7P1's: re-gating five
suites is five files belonging to other waves, and a mistake there points a destructive suite at the
wrong database. **New tests may follow the better rule without changing the old ones**, so 7P1's own
live evidence runs in CI. **The existing gap is wave 7T, ruled by the coordinator on 2026-09-15 to
land *before* this wave** (Q-7P1-1) — which means that by the time 7P1 is dispatched, P7's
distinction should already have been retired by 7T rather than carried. **If 7T has not landed, P7
still holds**: this wave does not re-gate anything.

**P8 — the deployed-schema gate learns about `presets` in this wave.** G3. Without it, `deploy.yml`'s
gate reports `level` over a database that cannot serve Step 1. `REQUIRED_PRESET_COLUMNS` is stated
**independently of the migration file**, for the reason `REQUIRED_DESIGN_COLUMNS` already gives in
its own header: a requirement derived from `0005` would agree with any database `0005` had been run
against, which is the very thing under test.

**P9 — the repository is insert-only and the row carries no `revision`.** `0004`'s lost update cannot
occur where there is no update, and ADR 0112 decision 1 grants `SELECT, INSERT` and nothing else.
Stated so a reviewer does not ask for a concurrency token, and so that **a later wave wanting
`UPDATE` knows it is adding two things, not one** — the grant and the token.

**P10 — the name is one `names jsonb not null default '{}'`, keyed by locale code. A third locale is
a KEY, not a migration.** *(Requirement owner-ruled 2026-09-15, verbatim: **"each locale its own
name"**, relayed by the coordinator. The shape below is the architect's.)*

**The alternative that loses, and why the answer is not `name_ro` / `name_ru` columns.** Adding a
locale would then be a migration **and** a change to `REQUIRED_PRESET_COLUMNS` — so the
**deployed-schema gate would have to learn what a locale is**, and a language added to the product
would turn `deploy.yml`'s gate red until someone edited a file about database columns. With one
`jsonb` map, **the gate never learns what a locale is**, and a third language is a key in a row
nobody has to migrate. A separate `preset_names` table also makes a locale a row, and loses on cost:
a second table is a second grant, a second entry in the deployed-schema gate, and — under ADR 0012 —
**a third separately-scoped backup export**, all for a handful of short strings on a tiny table.

**The domain does not know what the locales are, and that is deliberate — the codebase has already
answered this exact question.** `routing.locales` lives in `apps/web/src/i18n/routing.ts`, which the
domain cannot import and must not mirror. The precedent is `DesignSettingsSchema`, verbatim at
`design.ts:164-167`: *"A tier id is an opaque identifier, validated for shape only. The domain
imports no price book (ADR 0062 seam 1), so whether a tier exists is not a question this schema can
ask; it is answered where the book is."* **A locale code is the same kind of thing.**
`PresetRecordSchema` validates the **shape** of a key and never its membership; which key is rendered
is answered where `routing.locales` is, in the web layer. **So there is no second list to disagree
with the first** — the lead's constraint is met by the domain having no list at all.

**A half-filled map is legal, and it is the normal state rather than an edge case.** The owner
authors presets one at a time, by hand; a schema that required both names would be discovered by the
owner, at the moment of saving, as a refusal. So: the empty map is legal, a map with one locale is
legal, and **no preset is ever hidden for want of a name** — a text field must never be able to
change which kitchens fit, which is also why matching does not read names (it compares rooms only).

**What the list shows for a missing name is 7F3's, and it needs a copy leaf either way — but one
option must be ruled out here, before it is implemented by default.** ~~Falling back to the other
locale's name~~ is **rejected**: it would put Romanian text on a Russian screen, which ADR 0113's
copy lock exists to prevent, and — the stronger reason — **it would hide the gap from the only person
who can close it.** A generic label makes a missing Russian name visible to the owner at a glance;
the other locale's name makes the preset look finished when it is not. **Recommendation to 7F3: a
product-copy label derived from the preset's own shape and room**, entering the copy lock in 7F3
under ADR 0113. *(The rejection is the architect's and binds; the label's wording is 7F3's.)*

**Two bounds, and the distinction between them matters after the freeze.** Each name is a bounded
string and the map holds a bounded number of keys — the row is read on **every** customer's first
screen, so an unbounded free-text field there is a payload surface as well as a layout one. **Both
bounds are code-level constants in the domain schema, not columns**, so under this wave's own freeze
reasoning they are **free to loosen at any time and expensive to tighten** — tightening could refuse
a row the owner has already written. 7P2's authoring form is where the numbers get their reason (the
390 px card is the constraint), and it may lower nothing without checking what is stored.

**P11 — a preset is never deleted and its backup is never rotated by age. Two properties, two
classes, four cells — stated in full because the question and the answer were about different
things.** *(Owner ruling 2026-09-15, relayed verbatim by the coordinator; the derivation of which
mechanism they answered is the architect's, from the code and ADR 0012.)*

> *"presets will be stored forever. the visitors that didn't register but made some configuration,
> those configuration can be stored for lets say 1-2 months, I have doubts we will have so many
> visitors and configuration should not take so much db memory to save. In the end is a record in a
> table and a json format of configuration that has few kbs, so we can store even for half a year
> and more and later we can adjust"*

**The question asked was about a *backup* window; the answer is in the language of *retention*. They
are different mechanisms and this repository already holds both, so the record must not blur them.
Derived rather than re-asked:**

- **Fourteen days is a *backup export* window, not a deletion policy.** `BACKUP_RETENTION_DAYS`
  (`backup-designs.ts:28`) governs how long an **ndjson snapshot survives in Blob** — *"a mistake can
  be undone for this long and no longer"* — and its own comment draws the line explicitly:
  *"Bounding what each dump contains is the retention cron in ADR 0019 decision 7, not this."*
- **Row deletion is a separate, unbuilt mechanism.** ADR 0019 decision 7 deletes an abandoned design
  after **30 days**, and that ADR's own schedule places it in **M8**. **Nothing deletes any row
  today.**

| | **Row lifetime** (is it ever deleted?) | **Backup retention** (how far back can a restore reach?) |
| --- | --- | --- |
| **Presets** | **Never.** Owner: *"stored forever"*. Already true by construction in this wave — insert-only, no `DELETE` grant, no reaper (P9) — and now true by ruling as well. | ~~No age rotation; count cap only.~~ **Corrected the same day by the owner — *"14 days backups for me is ok"*. `BACKUP_RETENTION_DAYS` stays at 14 for presets too**, with `MAX_RETAINED_BACKUPS` as the second bound, exactly as `designs` has it. |
| **Customers' designs** | ~~Abandoned after 30 days (ADR 0019 d7); raised to a 1–2 month floor.~~ **Superseded the same day, third position: NOTHING is deleted automatically. The 30-day reaper is removed, not raised — ADR 0019 decision 7 is RETIRED by owner ruling.** Private configurations, visitors' included, are kept indefinitely. *Later*, a **manual script** for kitchens older than roughly a year — *"not automatically"*. | **14 days** (`BACKUP_RETENTION_DAYS`) plus `MAX_RETAINED_BACKUPS = 30`. **Unchanged by every one of the three positions** — the owner ruled it separately and explicitly, and no retention ruling absorbs it. |

~~**Why no age rotation for presets, and why that is affordable where it would not be for designs.**
*"Forever"* applied to the question actually asked means a preset must be recoverable at any later
date, which an age cap forbids by construction. The cost is bounded by arithmetic rather than by
hope: the library is tens of rows of a few kB, so a nightly full copy kept indefinitely is a
rounding error, while `designs` **grows with customers**, which is precisely why its export has an
age cap and this one does not.~~ *(The reading that "forever" answers the backup question was the
architect's — the owner did not use the word "backup" — and was **flagged as a reading for that
reason**.)*

> **Struck the same day: the owner said "backup" and named a number.** *"14 days backups for me is
> ok"* (2026-09-15, relayed verbatim). **`BACKUP_RETENTION_DAYS` stays at 14 for everything, presets
> included**, and the presets export takes the same two bounds `designs` has. **Struck in place
> rather than rewritten**, because a flagged inference that got tested and lost is the loop working,
> and a reader who finds only the corrected version learns nothing from it. **The cost argument above
> was sound and is simply not what the owner wanted** — it is kept intact because it is exactly the
> reasoning somebody will re-derive in a year, and they should find it already answered.

**How *"stored forever"* and a fourteen-day backup sit together, answered before a reader asks.**
**The backup is not the archive — it is the undo.** It exists so a mistake can be reversed for a
bounded period; **the row is the thing that lasts.** A preset being irreplaceable is what makes the
*row* durable, and it does not follow that every nightly snapshot of that row must be kept for ever.
The two rulings are about different objects and they do not compete: nothing deletes a preset, so
after fourteen days the backup's job is done — **the preset is still there.** *(The framing is the
coordinator's, recorded because it is the question a reviewer will actually arrive with.)*

**The third position, and the movement is the useful part.** Retention was ruled three times on
2026-09-15 and each is struck in place rather than flattened, because **the direction — steadily
looser — is what tells the next reader which way to lean when this returns.** Inherited: *14-day
backups, 30-day row deletion.* Then: *1–2 months, half a year fine.* Finally:

> *"presets will not be removed… just to avoid accidental removal, we can remove for the first
> period of time this 30 days cleanup. We'll just keep collecting all the configuration of visitors,
> of users and so on. And later we can implement a functionality or just manually detect a period of
> time, let's say all the private kitchens that are older than one year, we can remove, not
> automatically, but we'll make this a script… So we can focus now on storing and not removing. We
> can remove this rule of 30 days clearance."*

**Their reasoning is the test a later reader should apply, not the number:** few visitors expected, a
row plus a few kB, so storage does not bind. And their closing sentence is a design principle rather
than a decision, kept verbatim:

> *"to try to solve conflicts that at the moment we shouldn't create in general, like removing a
> private configuration that is used somewhere as a preset source."*

**The cheapest way to avoid a class of conflict is not to create it** *(the coordinator's reading,
2026-09-15)* — the same instinct as the owner's copy-on-use model, arrived at from the other end.

**One finding dissolved rather than left standing.** `arch-7p2` found that under the single-table
model the reaper would delete the preset library thirty days after the owner stopped editing. **It is
void twice over** — the owner settled on a separate table, *and* there is no reaper — and it was a
real finding against a model that no longer exists. **7P2's own section already records this**; it is
noted here only so a reader of 7P1 does not re-derive it. *(That section is its author's and is not
edited from here.)*

**Two obligations this creates, neither of them 7P1's to build.**

1. **ADR 0019 decision 7 owes a dated record — for its RETIREMENT, not for a raise.** ~~Thirty days
   is now a floor of one to two months.~~ **Corrected by the third ruling:** the reaper is removed.
   **7P1 builds no reaper and never did; now nothing else does either.** Written down while it is a
   sentence rather than rediscovered as a conversation when M8 opens.
2. ~~**The number is deliberately loose and must be encoded as such** — one named constant carrying
   the owner's *"lets say"*.~~ **DISSOLVED by the third ruling: there is no number and no mechanism
   to put one in.** A constant with no reader is precisely the dead configuration this plan objects
   to elsewhere, and carrying this obligation forward would have been the failure the owner's own
   standing preference names — machinery for a problem nobody has. **The looseness survives only in
   the future manual script's *"about a year"*, and nobody builds that either.**
3. **The manual deletion script, when it comes, cannot run as the application — and P13 already
   answers it.** `application-role-privileges.test.ts` asserts the application role holds exactly
   `INSERT, SELECT, UPDATE` on `designs`, with a standing *"cannot delete a design"* test, so
   **`DELETE` is absent by design and must stay absent.** The owner's *"not automatically… we'll make
   this a script"* is already the right shape: a deliberate operator action under **its own narrow
   credential**, on P13's pattern. **Recorded so a later wave reaches for a second credential rather
   than widening the customer-facing role on the `designs` side — after this milestone spent a day
   refusing exactly that on the `presets` side.** *(The connection is the architect's; no grant, no
   script and no horizon constant is added by this wave.)*

**Why this answer was the right shape of question, recorded because it generalises.** The owner did
not answer with a number — they answered with a **class distinction**: the thing that can be
re-derived gets a window, the thing that cannot is kept. **That is
[ADR 0117](../decisions/0117-generation-produces-the-cheap-correct-baseline-and-the-owners-taste-enters-through-presets.md)'s
principle arrived at independently and from the other end** — ADR 0117 divides *decisions* into the
generator's and the owner's by whether a rule can be applied without looking at the particular
kitchen; this divides *data* by whether it can be reproduced without the owner. **Same author, same
instinct, two mechanisms.** *(The cross-reference is the architect's.)*

**P12 — `status` is the ONE gate on whether a preset is offered, it records a decision and never a
measurement, and it gains a third member.** *(Owner ruling 2026-09-15, relayed; the two invariants
are the architect's, ruled by the coordinator the same day.)*

> *"we'll need to have a status column that will display us those presets that somehow conflict with
> the current implementation. So in this way, if a preset is not valid, that specific preset will not
> be provided to be selected by end users, but will be provided to be fixed by the administrator…
> Nothing should be automatically done. Everything should be manually reviewed and the decision will
> be made by the administrator."*

**The column already exists and this ruling costs one string.** ADR 0112 decision 1 gives it
`published | hidden`, and **P4 already declined a `check` constraint on it**, so
`PresetRecordSchema` is the authority and the column is plain `text not null`. **Adding a member is
therefore a code change and not a migration — free forever. Renaming or removing one is not**, and
that asymmetry is the only part of this a later wave must respect.

**Three members, and the third is the owner's new one.** *Offered to customers*; *withheld by the
owner's choice* (ADR 0112 decision 1's `hidden`); *withheld because it conflicts with the current
implementation and is waiting for the administrator*. **Hidden and conflicting are not the same
fact** — one is a decision the owner made, the other a finding the product made, and the dashboard
lists the second specifically. **No fourth member is invented here.**

**Invariant 1 — one column, one predicate. `status` is the only thing that decides whether a preset
is offered, and no later wave may add a sibling that also withholds one.** This is the ruling that
decays silently: with two withholding columns, 7B can satisfy one check, miss the other, and offer a
kitchen the product knows is broken — and every test of the check it *did* write would pass. **Any
future reason to withhold is a member of this column.**

**Invariant 2 — `status` records a decision, never a measurement.** *Conflicting* means *an
administrator has been told and has not yet acted*, not *this preset was invalid when we last
looked*. That is the owner's *"nothing should be automatically done"* stated as a data property, and
it is what makes the column safe to trust: **a decision cannot go stale the way a cached measurement
can.** It also settles who writes it — a person, through the administrator's surface — and confirms
that nothing in 7P1 or 7P2 writes anything but the initial value.

**One reading, ruled by the coordinator rather than left as mine: a preset's prior status is not
remembered when a conflict clears.** The administrator chooses where a fixed preset goes. A
remembered prior status would be a machine making that choice, which is the thing the owner ruled
out in terms.

**What the conflict detector and the assisted repair will need from the row — asked, and the answer
is nothing.** *(The coordinator asked for this explicitly so a later wave knows the question was put
rather than skipped.)* Every conflict the owner describes is **computable from `document` against
today's build** — a body id the catalogue no longer holds or no longer offers (ADR 0109 decision 6),
any `validateDesignForCatalog` finding, a geometry re-derivation such as 7D6's, a room the approved
policy no longer admits, a `schema_version` this build can no longer migrate. **The snapshot is the
whole design, so the detector re-derives rather than reads.** And the *reason* a preset conflicts
**must be derived at display time and never stored**: a stored reason is a claim about *the current
implementation*, which is by definition the thing that changes — it would be a second authority of
exactly ADR 0028's and ADR 0102's kind, and it would be wrong precisely when somebody relied on it.
**So the row carries the decision and derives the diagnosis. No column is owed, and this is the last
cheap moment at which that could have been false.**

**P13 — 7P1 grants nothing new, and the administrator's writes get their own credential rather than
a widened one.** *(Ruled with the coordinator, 2026-09-15.)* The owner wants to update and delete
presets, and ADR 0112 decision 1's *"until a later wave needs `UPDATE`"* is now that wave — **but it
is not 7P1**, and the grant is not the app role's.

- **The authorisation model is not invented and does not need to be.** ADR 0112 decision 2 already
  designs it: an environment flag that 404s when off, an owner secret compared in constant time and
  sent only in a request body, and an `HttpOnly`, `Secure`, `SameSite=Strict`, expiring author cookie
  that is not the secret, re-checked on every write. **An administrator update or delete sits behind
  exactly that**, and 7P2 is where it is built.
- **The grant is the sharper half.** There is one Postgres role in play: every Next route connects
  with `DATABASE_URL`. Granting it `UPDATE, DELETE` on `presets` would leave **route-level checks as
  the only thing between a customer request and a destroyed preset**. The stronger shape is a
  **second, narrower credential used only by the administrator path** — and that is this repository's
  existing pattern rather than a new idea: `MIGRATION_DATABASE_URL` is already a second,
  more-privileged credential reserved to one narrow path and deliberately never `DATABASE_URL`
  (ADR 0096 decision 4, and `migrate-status.ts`'s header says why in terms).
- **It needs an owner action** — a database role and a deployment secret — **so it belongs to the
  wave that builds the surface.** 7P1's runbook line stays `SELECT, INSERT` and criterion 9 is
  unchanged.
- **Flagged, not asserted, and deliberately not verified here.** 7G's thumbnail backfill (Q-7P1-2)
  needs a **column-level** `grant update (thumbnail…)`. Whether a column-level grant appears in
  `information_schema.role_table_grants` — and so whether it would trip criterion 9 — **is not
  checked in this plan**. 7G's implementer checks which view shows what **before** assuming the
  criterion and the backfill can coexist.

**P14 — schema versioning: migrate forward, default the new, drop the unread. No multi-version
support. This ratifies P1's mechanism and REMOVES work rather than adding it.** *(Owner ruling
2026-09-15, relayed.)*

> *"migration solve this. You can set default values where you introduce a new one or you can drop
> existing values when the new functionality don't use them already… let's focus on the
> functionality, not on solving potential problems that we didn't have yet. So just keep it stupid
> simple."*

> *"I know that it's better to have this versioning and support multiple versions, but with less
> effort it will be like just migrating to newer schema… otherwise the logic in the code will be just
> become a mess."*

**It changes nothing, and that is the finding.** The codebase already works exactly this way:
`CURRENT_SCHEMA_VERSION = 5`, `migrateDesign` carrying a stored document forward arm by arm, each arm
keyed to the version that owes it (G8). **P1 — that presets share the designs' document-version
mechanism and gain no second scheme of their own — is therefore not merely convenient but ruled**:
the owner has said that mechanism *is* the strategy, so a preset-specific versioning scheme would be
a second strategy for a problem the first one already solves.

**What must NOT be built, recorded as a must-not so a later plan does not grow it.** No *unsupported*
marker on a row; no *"this kitchen is too old, generate a new one"* screen; no sweep that sets such a
marker. **All three are machinery for a problem that has not occurred.**

**And the known gap, named with its trigger rather than filled.** `refuseUnsupportedVersion`
currently **throws** an `InvalidDesignError` for a version outside 1–`CURRENT_SCHEMA_VERSION`
(`migrate-design.ts:700-712`) — it does not produce a graceful screen, and **today it is
unreachable**, because every version this build has ever written is inside that range. **The trigger
for building anything better is a migration that genuinely cannot be written** — a stored shape the
current code cannot carry forward — **and not the mere possibility of one.** Until then the throw is
correct: it is a loud failure for a state no document is in.

*(The ruling and both quotations are the owner's. That it ratifies P1 rather than changing it, and
the naming of the trigger, are the architect's.)*

### Module boundaries

- **The domain owns the record and its parse. It owns no SQL and chooses no locale.**
  `packages/configurator-domain/src/presets/preset-record.ts` publishes `PresetRecordSchema`,
  `PresetRecord`, `presetRoomOf(design)` — the **one** derivation P2 guards — and the named code a
  disagreeing row is dropped with. It publishes the **name map**, never a sentence:
  [ADR 0095](../decisions/0095-romanian-is-the-source-and-lives-in-message-files-and-the-domain-publishes-codes-not-sentences.md)
  survives untouched because a preset's name is owner-authored **content**, not product copy, and
  content cannot live in a message file. *(That distinction is the architect's reading; ADR 0095
  addresses copy and is silent on content.)* Which locale a card renders is 7F3's and is presentation.
- **Persistence owns the row, the SQL and the id.** `preset-repository.ts` (`PresetRepository` with
  `listPublished()` and `insert()`, and `NeonPresetRepository`), `generate-preset-id.ts` reusing
  `nanoid` exactly as `generateDesignId` does, `fake-preset-repository.ts`,
  `delete-presets-for-tests.ts`, `preset-row-source.ts` for the export. **No Postgres driver leaves
  this package** — `scripts/gates/boundary.sh` is the standing rule and `delete-designs-for-tests.ts`
  is the record of what happens when it is bent.
- **The web owns composition and nothing else.** A lazy singleton beside `getRepository()`, in the
  same shape and for the same `next build` reason. **No route is added in this wave.** The read is a
  server-component call 7F3 makes; a public list endpoint is ruled out by ADR 0112 decision 5.
- **The evaluator is 7B's and is not started here.** 7P1 publishes the record 7B's evaluator
  consumes and **no matching logic whatsoever**. A ±600 comparison appearing anywhere in this wave is
  the defect, not a head start.

### Files, and the must-not-change set

**May change** — grouped by slice, so each dispatch stays near `docs/WORKFLOW.md`'s five production
files:

- `packages/configurator-domain/src/presets/preset-record.ts` (new), `src/index.ts` (exports only).
- `packages/persistence/src/migrations/0005_create_presets.sql` (new),
  `src/migration-status.ts`, `src/migrate-status.ts` (+ the filename lists in `tests/migrate.test.ts`
  and `tests/migration-files.test.ts`).
- `packages/persistence/src/preset-repository.ts`, `src/generate-preset-id.ts`,
  `src/fake-preset-repository.ts`, `src/delete-presets-for-tests.ts` (all new), `src/index.ts`.
- `apps/web/src/lib/server/preset-library.ts` (new).
- `packages/persistence/src/preset-row-source.ts` (new),
  `apps/web/src/lib/server/backup-presets.ts` (new),
  `apps/web/src/app/api/cron/backup-designs/route.ts`, `docs/runbooks/design-db-restore.md`.
- `packages/persistence/tests/application-role-privileges.test.ts`.

**Must not change:** `neon-configuration-repository.ts` — **the design write path is untouched by
this wave**; migrations `0001`–`0004`, whose **bytes are frozen** and whose `0004` header says so in
terms; `apps/web/src/app/api/designs/**`; `validate-design.ts`; **`migrate-design.ts` — no schema
version bump is owed here**, and one taken in this wave would rewrite the *design* document for a
reason that has nothing to do with designs; `backup-designs.ts`'s row source and its
`designs`-only query (ADR 0012, P6); the five existing live suites' `DATABASE_URL` gating (P7);
`approved-room-policy.ts`; anything under `packages/three-adapter`.

### For the security reviewer — the four questions, answered where they can be checked

**The tier is Full + security** (ADR 0112 decision 7). This wave adds no authentication mechanism —
that is 7P2's — but it creates **the table every customer's first screen reads**, so the reviewer's
questions are about a read path and a schema rather than about a credential.

**1. Who may read a preset? Everyone, by design — and that is the asymmetry the rest of this section
turns on.** A preset is **product data**: owner-authored, shown to every visitor, deliberately not
secret. A design is a **customer's document** under a per-design write token
([ADR 0019](../decisions/0019-security-baseline-writes-throttling-retention.md) decision 1). ADR 0112
rejected storing presets as `designs` rows with a flag for exactly this reason, and the reviewer
should hold the wave to that separation rather than to designs' rules.

**One surface this adds that the rest of the row does not have: `names` is free text an author types,
stored, and rendered to every visitor** (P10). It is the only attacker-shaped-looking field here —
except that its only writer is the owner behind 7P2's gate, so the realistic failure is **size, not
script**: an unbounded name on a row read at Step 1 is a payload the whole audience pays for. Both
bounds are in the domain schema and are asserted (criterion 1). **Escaping is the renderer's** and is
React's by default; **the reviewer's question is whether 7F3 ever reaches for `dangerouslySetInnerHTML`
to style a name**, which is where an owner-typed string would stop being inert.

**2. Are preset ids guessable, and does it matter? They are `nanoid` (21 characters, ≈ 126 bits, the
same generator `generateDesignId` uses) — and the answer that matters is that a preset id is NOT a
capability.** Guessing one buys an attacker what every visitor is shown anyway. **A design id today
*is* a capability** — it is a read on the document until 7E3b lands, which is after this wave, after
7P2 and after 7G in the recommended order. **The reviewer's question is therefore not "is the id
strong enough" but "is anything here a capability that looks like data".**

**3. Can the read path leak anything about a design? This is P3, and it is a security property wearing
a schema decision's clothes.** ADR 0112 decision 3 has the server snapshot a design **by id**, so the
save knows an id that is, today, a read capability on the owner's own kitchen (G9). **The record must
not carry that id in any form.** It is not "out of scope" and it is not a field anyone forgot — it is
a must-not, criterion 11 is its executable form, and provenance, if a later wave wants it, is a
**hash** and never the id. The failure this prevents is concrete: one `select *` reaching a card
publishes a working `/d/{id}` link to the owner's design on every Step 1 screen.

**What the snapshot itself carries, checked against `design.ts` rather than assumed:** `room`,
`presetId`, `placements`, `emptyColumns`, `columnExtents`, `settings`, `createdAt`, `updatedAt`.
**No credential and no visitor identity are in the document** — the write-token hash is a *column* on
`designs` (`0002`) and the visitor hash will be another (`7E3a`), and neither has ever been part of
`Design`. So the snapshot is safe to publish **by construction of the document type**, and the
reviewer can check that claim in one file rather than by reasoning about what a save might include.

**4. Who may write one? Nobody, in this wave.** No route is added (criterion 16), the repository's
`insert` has no caller until 7P2, and the application role holds no `UPDATE` and no `DELETE`
(criterion 9, P9). **Three further things the reviewer should look for, because each is a plausible
"helpful" addition that would breach something recorded:**

- **an `/api/presets` GET** — ADR 0112 decision 5 rules out a public list endpoint; the read is a
  server-component call;
- **`UPDATE` granted "so the owner can hide one"** — ADR 0112 decision 1 reserves hiding to the
  database console until a wave needs it, and Q-7P1-2's backfill is answered by a **column-level**
  grant in 7G rather than by widening the row's;
- **a `grant` statement inside the migration file** — G2: the grant is an operator step, and the
  unattended screen would refuse the file (G13).

**One honest limit the reviewer must be told rather than left to infer:** the privilege assertion
(criteria 9 and 10) needs the *application* role on the *application* database and therefore **cannot
run in CI** (G4, G5). The grant has no automated witness in the deploy path. That is a stated gap,
not an oversight, and it is risk 3.

### Acceptance criteria

1. *(unit)* **`PresetRecordSchema` is strict.** An unknown key is refused; the snapshot parses as
   **`CurrentDesignSchema`**, so `settings.cabinetDepthMm` is mandatory; `status` is one of exactly
   two literals. **`names` is the map P10 rules**: the **empty map, a one-locale map and a two-locale
   map are all legal** and are asserted as three separate cases, because half-filled is the owner's
   normal authoring state; each name is length-bounded and the key count is bounded, both asserted at
   their boundary; **a key is validated for shape and never for membership of a locale list** — a
   test proves the domain package names no locale, so a third language needs no change here.
   **Must not:** a passthrough object; a snapshot admitted under `LegacyDesignSchema` — a preset that
   cannot state its own depth cannot be evaluated at every declared depth (ADR 0109 Amendment C); a
   schema that **requires** both names, which the owner would discover as a refusal mid-save; a
   hard-coded `"ro"` or `"ru"` anywhere under `packages/configurator-domain`.
2. *(unit, the P2 guard — the criterion this wave exists for)* `presetRoomOf` is the **only**
   derivation of shape, wall A, wall B and height, and it reads `wallLengthMm`'s mapping. A record
   whose stored columns disagree with its snapshot is **dropped from the list with a named code and
   logged**; a list containing one such row still returns every other row. **Must not:** a read path
   that silently prefers either side; a read path that throws and so empties the library; a second
   wall mapping anywhere (`widthMm`/`depthMm` re-read at a second site).
   - *(unit, boundary — P2's 2026-09-15 correction, and the case a linear preset would have broken)*
     **A wall column is populated only for a wall the shape has.** An **L** preset carries wall A and
     wall B; a **linear** preset carries wall A and **`wall_b_mm` is NULL** — asserted as a literal
     null, because the value that would otherwise be there is `room.depthMm`, which is not a wall
     (`queries/overflowing-placements.ts:45-50`). **Must not:** a linear preset storing its room
     depth under `wall_b_mm`; a `not null` constraint on any wall column; `presetRoomOf` asking
     `wallLengthMm` for a wall the shape does not have.
3. *(property, ≥ 100 samples per arm)* Over rooms drawn from the approved L policy: insert, then
   read, round-trips **byte-identically** under canonical serialisation — including the empty name
   map, both statuses, and every `schema_version` 1–5 a row can carry.
4. *(unit, boundary)* **The snapshot is migrated on read exactly as a design is**, using the row's
   own `schema_version` and never the constant: a row stamped 1 loads migrated; a row stamped 6 is
   refused as unsupported and dropped under criterion 2's arm rather than raising. **Must not:** a
   read that assumes `CURRENT_SCHEMA_VERSION`.
5. *(live, test database)* The migration runs through the ledger and **the schema is read back after
   it** — the test asserts the `presets` columns out of `information_schema`, never the runner's exit
   status (ADR 0020 decision 2, ADR 0042). **Must not:** a green `migrate` taken as evidence.
6. *(unit)* `migrate:unattended-check` passes with `0005` present, and the file is recognised
   **by shape name** as `create table if not exists`. **Must not:** a clause that makes the screen
   refuse, discovered in `deploy.yml` instead of in a unit test (G13).
7. *(unit)* The migration filename lists in `tests/migrate.test.ts` and `tests/migration-files.test.ts`
   carry `0005`, versions stay contiguous, and `pnpm --filter @lemnaria/persistence build` still
   passes its `src`/`dist` `.sql` count check (G1).
8. *(unit — P8, the gate nothing has today)* `describeDeployedSchemaStatus` reports **not level** for
   a reading whose `presets` table is **absent**, and for one where a required presets column is
   present but **misshapen**; `REQUIRED_PRESET_COLUMNS` is written as the application's independent
   statement of what it needs. **Must not:** a requirement derived from `0005_create_presets.sql` —
   that is a guard that agrees with the file under test.
9. *(live, application role, application database)* The application role holds **exactly `SELECT` and
   `INSERT`** on `presets` — not `UPDATE`, not `DELETE` — and an `update presets set status = …` is
   refused. **Must not:** `UPDATE` granted "so hiding works", which is ADR 0112 decision 1's explicit
   exclusion. **Its purpose outlives this wave, and the next implementer to meet it should read it as
   a purpose rather than an obstacle (P13):** the owner has asked for administrator update and
   delete, and **this criterion is what stands between that requirement and the easy, wrong answer of
   widening the customer-facing role.** The administrator's writes get their own credential; when
   this criterion turns red, the question to ask is *which role is this?* and not *how do I relax
   it?*
10. *(live, and stated honestly)* A read through `NeonPresetRepository` under the **application**
    credential succeeds. **This is the only witness the grant of G2 has**, it runs only where
    `DATABASE_URL` is set, and it therefore **does not run in CI** (G4, G5). The grant itself is an
    operator step recorded in the runbook and is never a statement in the migration file.
11. *(unit)* **No design id anywhere on the record** (P3): the record module and the row type contain
    no `designId`/`sourceDesignId`, asserted by a grep-in-a-test, and `insert` takes a `Design` and
    never an id. **Must not:** provenance travelling as an id "for debugging".
12. *(unit)* `listPublished` returns **newest first**, deterministic on equal timestamps by id, and
    returns **only** rows whose `status` is the offered member — a `hidden` row and a *conflicting*
    row are both absent, asserted separately (P12). Its bound is **stated**, and the read reports when
    the bound was reached rather than truncating silently. **Must not:** an unbounded `select` over a
    table read on a customer's first screen; **a second column consulted alongside `status` to decide
    whether a preset is offered** — P12's one-column invariant, and the test is that the predicate
    names exactly one column.
13. *(live, round trip — the criterion P6 is for)* A preset is exported through the production row
    source, its row destroyed, restored through **the runbook's own statement copied verbatim into
    the test**, and then **read back through the repository and parsed**. **Must not:** a test that
    asserts the column list instead of performing the loop — `backup-restore-round-trip.adversarial.test.ts`'s
    own header records why that would have passed against the defect it was written for.
14. *(unit)* The presets export is a **second scoped export**: its own `backups/presets/` prefix, its
    own rotation, and a test asserting the designs row source is **unchanged** and still names only
    `designs`. **Must not:** one query over two tables (ADR 0012).
15. *(unit)* The cron route answers **503 when either export failed**, 200 when both succeeded or only
    rotation failed, and the body names each export's status **separately**. **Must not:** a failed
    preset export hidden behind a successful designs export — that is ADR 0012's *"a backup that did
    not happen must not look like one that did"*, one table over.
16. *(unit)* **No route is added and no route writes to the table**: an enumeration of
    `apps/web/src/app/api/**` finds no preset path in this wave. **Must not:** an `/api/presets` GET
    "ready for 7F3" — ADR 0112 decision 5 rules out a public list endpoint.

**Wave-wide must-nots.** **No agent applies this migration to any deployed database** (ADR 0020
decision 1, ADR 0112 decision 1, `AGENTS.md`); the test database only, and the fact is stated in the
close-out. No customer-reachable route writes to `presets`. `CURRENT_SCHEMA_VERSION` is not bumped.
No ±600 comparison is written in this wave. **And, from the owner's dashboard ruling of 2026-09-15:
no admin surface, no conflict detector, no repair — assisted or otherwise — and no new grant.** The
owner was explicit that *"nothing should be automatically done"* and that the area needs testing
sessions with their feedback first. **7P1 provides the column (P12) and withholds the grants (P13);
who sets a status and how a conflict is found are a later wave's, and that wave starts from a
recorded ruling rather than a fresh conversation.**

**The four carried criteria, mapped.** Carried 1 → criteria 5, 7, 9; carried 2 → criteria 1, 3, 12
(and its *"reads published presets by shape"* is satisfied by the domain evaluator's input, not by a
SQL filter, per ADR 0112 decision 5); carried 3 → criteria 13, 14; carried 4 → the wave-wide
must-nots and criterion 16. **None is withdrawn.**

### Slices, in dependency order — dispatched one at a time, with the tree frozen between

- **S1 — the record, in the domain, alone.** `preset-record.ts` + `index.ts`. Criteria 1, 2 (the
  derivation half), 11. **Dispatched alone and reviewed before anything is built on it**, because
  this slice is the freeze decision and every later slice inherits it.
- **S2 — the migration and the deploy gate.** `0005_create_presets.sql`, `migration-status.ts`,
  `migrate-status.ts`, the two filename lists. Criteria 5, 6, 7, 8. **The gate and the migration
  belong in one slice**: a migration that ships without the gate is the state G3 describes.
- **S3 — the repository.** `preset-repository.ts`, `generate-preset-id.ts`,
  `fake-preset-repository.ts`, `delete-presets-for-tests.ts`, `index.ts`. Criteria 2 (the read half),
  3, 4, 12.
- **S4 — the web read composition.** `preset-library.ts`. Criterion 16. Small on purpose: it is one
  lazy singleton and a boundary this wave must not cross.
- **S5 — the backup.** `preset-row-source.ts`, `backup-presets.ts`, the cron route, the restore
  runbook. Criteria 13, 14, 15.
- **S6 — the grant and its witness.** The runbook's operator line and
  `application-role-privileges.test.ts`. Criteria 9, 10. **Last, and not code**, so the operator step
  is a reviewed artefact rather than a sentence in a close-out.

### The test contract

- **Unit and property suites** run in `configurator-domain`, `persistence` and `apps/web` and are
  the wave's CI gate. Property suites **state their seeds and their per-arm counts in the test
  names**, as every M7 property suite does.
- **Live suites** are new and gate on `TEST_DATABASE_URL` (P7), so criteria 3, 5 and 13 **do** run in
  CI. Every row they mint is removed through `deletePresetsForTests`, under the same refusals
  `deleteDesignsForTests` carries (G14).
- **Criteria 9 and 10 cannot run in CI at all**, because they need the *application* role on the
  *application* database (G4, G5). They are run by hand and **their output is pasted into the
  close-out**. A green CI run is not evidence for either, and the close-out says so rather than
  implying coverage it does not have.
- **No e2e, no Playwright, no visual capture.** The wave has no surface.

### Risks, ranked — with the reason for the rank

1. **A field the matcher needs, missing after the freeze.** Rank 1 because it is the **only** item
   here whose cost is unbounded and whose discovery is silent: every other risk is caught by a test
   or by a deploy gate within minutes, and this one is caught by nobody until the owner has authored
   a library and 7B cannot match it. Criteria 1, 2 and 3 stand in front of it, and the window's
   entire input set is enumerated in G6 and P2 for exactly this reason.
2. **The deployed-schema gate reporting `level` over a database with no `presets` table.** Rank 2 and
   not 1 **only because the failure is loud** — the first customer to reach Step 1 gets an error —
   whereas risk 1 is silent. It is the 2026-09-07 incident's exact shape and the gate is structurally
   blind to it today (G3), so it is a certainty rather than a hazard if criterion 8 is skipped.
3. **The grant nobody runs.** Ranks above 4 because **no test in CI can catch it** (G4, G5) and the
   symptom lands on a deployed environment rather than on the implementer's machine, where every
   other failure in this wave lands.
4. **The live persistence suite skipped in CI.** Ranked here rather than higher because P7 keeps
   *this wave's* evidence out of the gap; ranked above 5 because a Full + security wave whose centre
   is a migration and a live repository deserves a CI gate and, for the five existing suites, does
   not have one. **Ruled 2026-09-15 into wave 7T, landing before this one** (Q-7P1-1), which retires
   this risk if 7T lands first and leaves it exactly as written if it does not.
5. **A second authority between the row's room and the snapshot's.** G7 makes it real rather than
   theoretical — this codebase has shipped an arm that rewrites a stored room. Rank 5 because
   criterion 2 converts it from a silent mismatch into a dropped row with a code, which is a
   contained failure.
6. **Thumbnail limbo between 7P2 and 7G.** The owner may author presets that can never show a
   picture (P5, Q-7P1-2). Ranked low **because it is not a code risk at all** — it is a wave-order
   one, and the fix is a decision rather than a criterion.
7. **Scope creep into 7B.** A ±600 comparison written here would be a second matcher, and the
   evaluator is the thing ADR 0112 decision 5 keeps single. Low rank, high visibility: the must-not
   is stated twice on purpose.
8. **The migration number raced by 7E3a and 7E3c**, which both plan migrations
   (`0006_add_design_visitor_hash.sql`, `00NN_create_design_share_links.sql`). **Last, because
   contiguity is enforced (G1), so two waves both taking `0005` is a hard, immediate failure rather
   than a silent one** — but it is named because the recommended order puts 7P1 first and the number
   must be claimed in the same commit that uses it.

### Questions that are not mine

**Q-7P1-1 — ~~the coordinator's~~ RULED by the coordinator, 2026-09-15: yes, and as its own wave
*before* 7P1.** Four live persistence suites need only `TEST_DATABASE_URL` and gate themselves on
`DATABASE_URL`, so they never run in CI (G5). The coordinator's reason for putting the wave **first**
rather than after, recorded because it is better than the recommendation it replaced: 7P1 adds new
live suites that *do* run alongside five that do not, so landing 7P1 first leaves the repository in a
state where *"the persistence tests pass"* means two different things depending which file you are
looking at. **It is wave 7T, planned below.** The coordinator's instruction stands on the record:
*"I am not assuming they pass… if they are red, that is the finding — not a reason to re-skip them."*

**Q-7P1-2 — ~~the coordinator's~~ RULED by the coordinator, 2026-09-15: 7G backfills, and the gap is
not accepted.** 7P2 ships *save as preset* **before** 7G ships the thumbnail capture, and the
application role holds no `UPDATE` (P9), so presets authored in that window would have no thumbnail
and no way to acquire one. ~~Recommendation: accept the gap and tell the owner.~~ **Overturned, and
the reason is the stronger one:** the presets authored in that window are the owner's first
authored artefacts and the first data in this system that cannot be re-derived, which is the worst
place in the product to accept a permanent hole — *"'we told them' does not repair it."* **7G carries
a backfill for every preset authored before it**, recorded on 7G's row now while it is cheap; an
obligation recorded after the data exists is a migration.

**The mechanism, checked rather than assumed, so 7G does not have to rediscover it.** A backfill is
not merely possible here, it is already provided for twice over. (1) **The source exists**:
ADR 0112 decision 6 states that the rig (`/internal/scene-shot`) *"can re-capture any preset from its
snapshot"* — the snapshot is the whole design, so nothing about an un-thumbnailed preset is lost.
(2) **The grant need not be widened to `UPDATE` on the row.** Postgres grants privileges per column:
`grant update (thumbnail…) on presets to <app role>` lets 7G write the image while **`status` stays
unwritable by the application**, which is precisely the privilege ADR 0112 decision 1 withholds. So
P9's *"a later wave wanting `UPDATE` is adding two things"* is satisfied narrowly rather than by
abandoning least privilege. *(The column-grant reading is the architect's; ADR 0112 does not
contemplate a backfill, and 7G owns the final shape.)*

**Q-7P1-3 — ~~owner-facing, for tomorrow's batch~~ BOTH HALVES ANSWERED by the owner, 2026-09-15.**
Kept in full rather than deleted, because the reasoning below is what made each answerable and
because the second half was answered *in a different mechanism from the one it asked about* — see
**P11**, which derives which. Two halves, and the second is the one worth their attention.

- ~~**Names.**~~ **ANSWERED by the owner, 2026-09-15, verbatim: *"each locale its own name"*** (relayed
  by the coordinator). **The requirement is settled and the shape is ruling P10**: one `names jsonb`
  map keyed by locale code, a third language a key rather than a migration, half-filled legal because
  it is the owner's normal authoring state. What remains is **7F3's**, not the owner's: the label a
  card shows when the customer's locale has no name — and P10 rules out the option that would
  otherwise be implemented by default, falling back to the other locale's name.
- **How long the library's backup reaches back.** Their authored presets are the first thing in this
  system that **cannot be re-derived**: a generated kitchen can be regenerated from a room, and a
  customer's design is theirs, but a kitchen the owner adjusted by hand and saved exists nowhere
  else. The library would inherit `designs`' recovery window — **fourteen nightly exports**
  (`BACKUP_RETENTION_DAYS`), chosen for *"a problem introduced before a weekend and noticed the week
  after"*. Presets are written rarely and lost permanently, which is the opposite profile. **Do they
  want a longer window for the library?** *Recommendation: yes — and it is one constant in
  `backup-presets.ts`, not a design, so it can be answered after the wave lands.*

  **Strengthened 2026-09-15 by the owner's own answer to the other half.** *"Each locale its own
  name"* means the row now carries **two independent kinds of authorship** — the adjusted kitchen and
  the typed names — and a name is authorship with **no derivable substitute at all**: a lost snapshot
  could at worst be re-adjusted from a regenerated kitchen, while a lost name can only be retyped
  from memory. **The mechanism does not change** — the export is a whole-row export and covers both —
  **but the case for the longer window is stronger than when the question was written**, and the
  question should be put with that sentence in it rather than as a number.

  **ANSWERED the same day, in two replies, and the framing is why it was answerable: the owner
  replied with a class distinction rather than a number — *"presets will be stored forever"*,
  anonymous configurations *"1-2 months … even half a year and more"* — and then, asked nothing
  further, settled the backup half themselves: *"14 days backups for me is ok"*. Ruled in P11.**
  **The question as posed — should the library's backup window be longer? — is answered NO**, and the
  architect's inference that *"forever"* meant the backup was **tested and lost**. What the framing
  actually bought was the *first* reply: the owner reasoned about **which data can be re-derived**,
  which is the durable part, and it turned out to govern the **row** rather than the export.

### Verification

Per-package `vitest` for `configurator-domain`, `persistence` and `apps/web`; `typecheck`; `lint`;
and a whole-tree `pnpm format:check` at the wave's end. **No e2e, no Playwright, no visual capture.**
The live suites' output is pasted into the close-out, and the close-out states plainly which criteria
CI proved and which it could not (criteria 9 and 10). **The migration is applied to the test database
and to nothing else**, and that is recorded as a sentence, not implied by silence.

## Wave 7T — dispatchable punch list: the live persistence suite actually runs

> **Planned 2026-09-15 by the architect**, on the coordinator's ruling of the same day (Q-7P1-1),
> from a finding made while planning 7P1. **Ordered before 7P1.** **It touches no production file**
> and its whole output is a change to which tests execute, plus whatever those tests then say.
> **The coordinator's instruction is the wave's governing sentence and is quoted rather than
> paraphrased:** *"I am not assuming they pass. Five suites that have never executed against a real
> database may well be red, and if they are, that is the finding — not a reason to re-skip them."*

### What this wave is, stated so nobody dispatches the easy version of it

**The persistence layer's live coverage has been green by never executing.** Five suites gate
themselves on `Boolean(process.env["DATABASE_URL"])`; `ci.yml`'s `test` job **deliberately never sets
it** and says why (`:136-138`); `TEST_DATABASE_URL` **is** set (`:143`) and is all
`resolveTestDatabaseUrl()` needs (`test-database-url.ts:120-130`). So the mismatch is between a gate
written for one reason and a CI configuration written for another, and neither is wrong on its own
terms.

**It is not a one-line env-var flip, and the failure shape if it is dispatched as one is the worst
available.** Turned on as it stands, `migrate.test.ts` **flakes by construction** — not occasionally,
by construction — **and the flake looks exactly like a bug in the migration runner.** So it would
burn somebody's day chasing a defect that is not there, and **the natural fix is to re-skip the
suite**, which puts the repository back where it started with a story about why it had to be. That
outcome is worse than never having enabled it, because the second attempt would face a precedent.
**This is why the isolation answer is decided below (T-J2) rather than left to the implementer.**

The measured reason:

| # | Measured at `41181d8` | Consequence |
| --- | --- | --- |
| T1 | **`migrate.test.ts`'s live tests are deliberately destructive to the shared database's ledger.** They call `dropMigrationLedger`, `forgetAppliedMigrations([2])` and `forgetAppliedMigrations(VERSIONS_AFTER_THE_FIRST)`, run two concurrent `runMigrations`, and assert **exact ledger contents** (`:124-232`). Its own `afterEach` comment says *"This database is shared by every suite in the package and by whoever else is running them."* | **This suite cannot simply be turned on.** Its assertions are about the whole ledger, so a second runner doing the same thing at the same time breaks both. |
| T2 | **`vitest.config.ts` sets `fileParallelism: false`** — and its comment is explicit that this is about files *within one runner* sharing one `designs` table. | **It gives no protection at all across runners**, which is the case CI introduces. |
| T3 | **`ci.yml`'s concurrency group is `${{ github.workflow }}-${{ github.ref }}`** with `cancel-in-progress` on pull requests only (`:23-26`). | **Two different PRs, or a PR and a `main` push, run their `test` jobs simultaneously** against `lemn-conf-v2-staging`. T1 + T3 is a guaranteed flake, not a hazard. |
| T4 | **The other three live suites are concurrency-tolerant by construction.** `design-row-source.test.ts` mints tracked ids and asserts *per id* within a full walk (`:99-102`); `backup-restore-round-trip.adversarial.test.ts` finds its own row in the export (`:82-89`) and restores by `on conflict do update`; both clean up by `delete … where id = any(ids)`. Nothing asserts a whole-table count. | **These three can be re-gated as they stand.** The split between T1 and T4 is what the slices below are built on. |
| T5 | Both of those suites' `beforeAll` already calls `runMigrations(testDatabaseUrl)`. | **Re-gating does not make CI start applying migrations — it changes who triggers something that already happens.** It is a test database and not a deployed one, so ADR 0020 decision 1 and `AGENTS.md` are untouched; **say so in the close-out** rather than leaving a reviewer to work it out. |
| T6 | `migrate:status` runs **only in `deploy.yml`** and nowhere in `ci.yml`. | **A gate/migration mismatch is discovered as a blocked deploy rather than as a red test.** That is what makes 7P1's criterion 8 expensive to get wrong, and closing it belongs here — see ruling T-J3. |

### Rulings

**T-J1 — the first slice is a measurement and produces no fix.** Re-gate, run, **report the output
verbatim**, and stop. *(The shape is wave 7D6's S1 pre-flight and is used for the same reason: the
expensive discovery should cost an hour.)* **A suite that fails is reported as a finding with its
output, and is neither repaired in the same slice nor re-skipped.** Whoever dispatches slice 2 does
so knowing what is red.

**T-J2 — `migrate.test.ts` is isolated by a session-scoped advisory lock taken around every
`runMigrations` call, in one shared test-support helper. Decided here, not left to the implementer**
(coordinator's instruction, 2026-09-15: *"what that answer is belongs in the plan, not in the
implementer's judgement"*).

**The mechanism, source-verified at `41181d8` rather than recalled:**

- `MIGRATION_ADVISORY_LOCK_KEY` is **already exported** (`migration-ledger.ts:60`), and `migrate.ts`
  already connects with a **`Client`** rather than the HTTP `neon()` function — its own header says
  why (`:43`): *"The HTTP driver has no session: it cannot hold a lock across a read and a write."*
  **So a session-capable driver and a greppable key both already exist**, and the helper adds neither.
- The suite takes `pg_advisory_lock` on a **separate, test-only key** — never
  `MIGRATION_ADVISORY_LOCK_KEY` itself, which the runner takes per transaction and which a test
  holding across a whole suite would deadlock against.
- **It wraps the `runMigrations` call, not the whole suite**, so the hold is short and the three T4
  suites queue for milliseconds rather than for a test run.
- Acquisition is `pg_try_advisory_lock` in a **bounded retry**, failing with a named message. Stated
  because the obvious alternative does not work: `lock_timeout` does not govern advisory locks *(the
  architect's understanding of Postgres, not verified in this session — but the bounded retry is
  correct either way, which is why it is what the plan prescribes)*. A blocking `pg_advisory_lock`
  would hang to vitest's 30-second `hookTimeout` and report a timeout rather than a contended lock.

**Why this and not the two alternatives, both of which were live and are recorded so they are not
re-proposed:**

- **A repository-wide CI `concurrency` group on the `test` job** — about four lines and no test code.
  **Rejected, and the two reasons below are the whole of it.** *(1)* It **serialises every unrelated
  CI job in the repository** behind the database suite, which is a large cost for a narrow problem.
  *(2)* It **does nothing about the case that is live right now**: a developer running the suite
  locally while CI runs it. A concurrency group cannot see a laptop.

  **What it does NOT lose on, corrected 2026-09-15 so the record is not over-broad.** The first
  version of this bullet rejected the option because *"a queued job is cancelled when a third run
  arrives"* — **that behaviour is real and is the default**, and a cancelled required check reads as
  a blocked merge on a repository where several agents push in a day. **But it is avoidable, not
  intrinsic:** setting **`queue: max`** makes runs **wait** instead of being cancelled, up to 100 in
  the group, with only the overflow beyond that dropped. **Verified by the coordinator on
  2026-09-15** against `docs.github.com` → *Control the concurrency of workflows and jobs*; the
  default-cancellation half was flagged in this plan as the architect's recollection and was checked
  because it was load-bearing. **The correction is recorded rather than folded in, because this
  option is T-J2's own fallback, and a rejection resting on a reason that turns out to be wrong is
  how a good option gets permanently excluded.**
- **A second Neon database for the ledger tests**, with its own entry in
  `ALLOWED_TEST_DATABASE_NAMES`. **The cleanest answer and still rejected for this wave**, on one
  fact rather than on taste: creating a Neon database and adding a repository secret is **the
  owner's action**, so it would block a test-infrastructure wave on a person who is asleep. **Kept on
  the record as the right destination** if the lock proves awkward, and it is the option to reach for
  before ever re-skipping a suite.

**The one thing a reviewer will challenge, answered here.** `migration-ledger.ts:42-53` explicitly
rejects a session-scoped lock — *"would need a matching unlock on every path and would additionally
rely on the server noticing a dropped connection"*. **That reasoning is not overturned and does not
apply here**, because it is about the **production runner**: a lock left held there wedges a deploy.
In a test the worst case is a suite that waits and then fails with a named message, and a dead worker
drops its connection, which releases a session lock. **Different blast radius, same mechanism** — and
the distinction is written down so nobody reads the helper as contradicting the file it imports from.

**T-J3 — `migrate:status` runs in CI against the test database, and that is this wave's one addition
rather than 7P1's.** T6. **7P1's gate extension itself must stay in 7P1**, because
`REQUIRED_PRESET_COLUMNS` landing before `0005_create_presets.sql` exists makes
`describeDeployedSchemaStatus` report `columns-missing` against **every** environment — which turns
`deploy.yml`'s *"Verify by reading the schema back"*, THE GATE, red and blocks deploys until the
migration arrives. **The requirement and the table have to be in one commit.** What this wave adds is
the thing that makes the *next* such mismatch cheap: a `migrate:status` run in `ci.yml`, so a gate
that disagrees with the migration set is a **red CI job** rather than a blocked deploy. **Its own
design question, and it is the implementer's to answer in slice 3:** the command requires
`MIGRATION_DATABASE_URL` and a DDL-capable credential, and it must run **after** whatever applies
migrations to the test database or it reports *behind* by construction.

**T-J4 — nothing in this wave changes a test's assertions to make it pass.** A gate change is in
scope; an assertion change is not, and a suite that needs one is a finding for the coordinator. **This
is the must-not the wave exists for**: the failure mode being repaired is a test that reported success
without running, and repairing it by weakening what it checks reproduces it in a new shape.

### Acceptance criteria

1. *(CI, the point of the wave)* The three concurrency-tolerant live suites (T4) execute in `ci.yml`'s
   `test` job — **proved by their names appearing as run, not skipped, in the job log**, quoted in the
   close-out. **Must not:** a green job in which they are still skipped, which is the exact state
   being repaired.
2. *(report)* Slice 1's full output is recorded, **pass or fail**, before any remedy is written.
   **Must not:** a slice that re-gates and fixes in one commit, so nobody can see what was broken.
3. *(unit)* Every re-gated suite refuses to run against anything but an allowlisted test database —
   `assertSafeTestDatabaseUrl` is still on the path, and the re-gating does not bypass it. **Must
   not:** a suite reachable with `DATABASE_URL` pointed at the application database.
4. *(live, T-J2)* **Two simultaneous runners cannot corrupt each other's migration run** — proved by
   running the ledger suite twice **concurrently** and having both pass, which is the assertion the
   helper exists to make true. The lock is taken on a key that is **not**
   `MIGRATION_ADVISORY_LOCK_KEY`, and acquisition is bounded so contention fails with a named message
   rather than as a hook timeout. **Must not:** a helper whose correctness rests on a comment; a
   blocking acquire that reports a 30-second timeout and tells the reader nothing.
5. *(CI, T-J3)* `migrate:status` runs in `ci.yml` and reports **level** against the test database,
   after migrations are applied. **Must not:** a step that reports *behind* on every run and is
   therefore read as noise — that is a gate nobody will believe.
6. *(docs)* `ci.yml`'s comment at `:136-138` is corrected. It currently explains why `DATABASE_URL` is
   absent and reads, to anyone checking, as though the live suites are covered. **Must not:** a
   workflow whose comment describes the state before this wave.

### Slices

- **S1 — the measurement, and it is a step of its own before any editing.** Re-gate the three T4
  suites onto `TEST_DATABASE_URL`, run them locally and in CI, and **report the raw output**.
  Criteria 1, 2, 3. **No remedy is written in this slice** (T-J1).
  - **Red is the expected outcome, not a surprise and not a blocker.** These suites have never
    executed against a real database. **A failure is the wave's product**: it is reported with its
    output and it is neither repaired in this slice nor made to pass by editing what it asserts
    (T-J4), and it is **never** a reason to restore the gate that hid it.
  - **The measurement is deliberately the implementer's and was not taken in advance**, although it
    could have been. The coordinator's reason, recorded because it generalises: *"the measurement is
    the finding, and the finding belongs to the wave that acts on it"* — an implementer whose first
    act is to trust a number somebody else produced starts one step away from the evidence. The
    second reason is ordinary care: the suite writes to a shared Neon database and one of its files
    drops the ledger, so it is not run while another wave is in flight.
- **S2 — whatever S1 found**, plus T-J2's advisory-lock helper for `migrate.test.ts`. Criterion 4.
  Dispatched only after S1's output is in front of the coordinator.
- **S3 — `migrate:status` in CI** and the comment correction. Criteria 5, 6. Separate because its
  credential question (T-J3) is the one thing here that can fail for a configuration reason rather
  than a code one.

### Risks, ranked — with the reason for the rank

1. **A red suite quietly re-skipped.** Rank 1 because it is the **only** outcome that leaves the
   repository worse than before the wave: the coverage would then be absent *and* documented as
   considered. T-J1 and T-J4 exist for this and criterion 2 is its executable form.
2. **A flaky CI job blamed on the migration runner.** Rank 2 because it is **certain** rather than
   likely — T1 and T3 together guarantee it if `migrate.test.ts` is re-gated without T-J2's helper —
   and because a flake in a newly-enabled suite is usually "fixed" by disabling it, which collapses
   into risk 1 and leaves a precedent behind it. **T-J2 exists to remove this risk rather than to
   manage it**, which is why the remedy is decided in this plan and not deferred to slice 2's
   author.
3. **An assertion weakened to get to green.** Ranked third only because T-J4 names it; it would
   otherwise rank first, since it reproduces the original defect in a form no future reader can see.
4. **The staging database's `designs` table growing without bound**, since CI runs would now walk it
   (`readAllDesignRows`, page size 2) on every push. Low rank: the suites delete what they mint, the
   walk is O(rows) rather than incorrect, and the e2e job already writes there — but if slice 1 is
   slow, this is the first thing to measure.
5. **`migrate:status` in CI reporting *behind* by construction** and being ignored (T-J3). Low rank
   because criterion 5 states the required outcome rather than the step.

### Verification

`pnpm --filter @lemnaria/persistence test` with `TEST_DATABASE_URL` set, and **the CI job log** — CI
is this wave's verdict by definition, since the whole claim is about what CI executes. A local run
proves the suites pass; **only the job log proves they ran**. Whole-tree `pnpm format:check` at the
wave's end. No e2e, no visual capture, and **no production file in the diff** — a production file
appearing in this wave's diff is itself a review finding.

## Wave 7P2 — dispatchable punch list: the authoring gate, the save, and the owner's button

> **DEFERRED, AND ITS ARCHITECTURE CHURNED BEFORE IT SETTLED — 2026-09-15, the same day this was
> planned. Read this before the section; do not dispatch it.** Three things, recorded apart because
> they answer different questions.
>
> **1. Deferred past M8 — *when*.** The owner ruled that the whole preset story — **storage,
> authoring and admin panel** — comes *"after even third page that is milestone 8"*. 7P2 is not next
> and is not in M7's order as it stands.
>
> **2. The ground truth below is dated — *how far to trust it*.** Every measurement in it was taken
> at `41181d8`, and months of waves land before this work does. **Re-measure; do not inherit.** The
> file-and-line citations are how to re-measure in minutes; they are not a warrant that those lines
> still say that.
>
> **3. The model moved twice on one day and came back — *what*.** Both owner rulings are quoted in
> order, so a reader can see the movement rather than inherit a conclusion.
>
> **First, it collapsed into a single table** — a preset as a `designs` row carrying a public flag:
> *"it will not be two separate type of kitchens it will be the same model the same object but with
> the special status that it also used as a preset."* **Then it settled back onto the separate table
> this section assumes**, with one thing added that was never in ADR 0112: *"we mark private
> configuration as a preset. This preset we can move to its own table, and it shouldn't depend on the
> initial private configuration. So these presets will be updated only by the administrator… private
> configurations should not be messed and mixed with presets… when a user will click on a preset it
> will make a copy of this preset… each time a user clicks to use a preset, this preset creates a new
> record in private kitchens, linked to the specific user. In this way, we will avoid any
> conflicts."* So, for a reviver:
>
> - **The separate `presets` table survives, and so does
>   [ADR 0112](../decisions/0112-the-preset-library-is-owner-authored-data-behind-a-server-side-gate.md)
>   decision 3's snapshot.** Two tables of the same document shape, copies in both directions, no
>   shared row, administrator-only writes on the preset side.
> - **Wave 7P1's punch list above therefore largely SURVIVES**, and this is the sentence most worth
>   getting right, because the costly error is discarding live work: the separate table, the `names`
>   map (P10), `status` as the one gate and its three members (P12), **the nullable wall columns**
>   (P2, as amended — `wallLengthMm("B", room)` returns `room.depthMm` unconditionally, so a linear
>   preset would have stored a room depth under `wall_b_mm`), P3's must-not on the design id, and
>   P13's separate administrator credential. **None of it is superseded.**
> - **The gate survives entirely** — a server-read flag, a secret exchanged for a signed cookie, and
>   *the client never decides*. None of it ever depended on where the row lived, which is why it is
>   the half worth reading here. **On the criteria, a count that was reported during the churn is
>   worth correcting rather than repeating: "fourteen of eighteen survive" was measured against the
>   *single-table* model.** Against the **settled** one, essentially all eighteen stand — criteria 9,
>   10 and 12 were the three written off, and each returns with the thing that killed it: 9 (no design
>   id on the record) with P3, 10 (the staleness guard) with the snapshot, and 12 (the name bounds)
>   with `names`. **Copy-on-use adds criteria; the churn removed none.**
> - **Copy-on-use is new and is planned nowhere.** Clicking a preset mints a private design from the
>   snapshot, linked to that visitor. **It is the seam matching hangs off and no section of this file
>   plans it** — a reviver plans it before anything else here.
>
> **Four measurements outlive all of it**, because each is a fact about this repository rather than
> about presets:
>
> - **`route-availability.ts:20` returns `true` for every non-production build** (H1 below), so
>   copying the `/internal/scene-shot` pattern that ADR 0112 decision 2 names by name would put a
>   working owner-only control into every developer's browser and into the e2e server.
>   `selection-debug-availability.ts` is the corrected precedent and says so about itself (H2).
>   **A live trap for any wave adding an owner-only surface**, and the owner still wants a button.
> - **`saveStatus: "idle"` is not an assertion about the database** (H6). `requestSave` arms a
>   `MIN_SAVE_INTERVAL_MS` timer and reports no status change while it waits, and `SaveCoalescer`
>   exports neither a flush nor a pending accessor. **Any feature that reads the stored design while
>   the screen shows something newer inherits that window**, and a save-as-preset is exactly such a
>   feature: ADR 0112 decision 3 snapshots the *stored* design. Ruling AU4's answer — state the
>   `updatedAt` that is on screen and refuse anything but equality — needs no change to the write
>   path and may generalise beyond presets.
> - **`carriesAccessoryKind` has no reader anywhere in `src`** (H8): the hob is pinned only by the
>   literal build-id list at `hob-front-clearance.parity.test.ts:39`, where the sink has a
>   two-directional parity gate and `BodyDefinition.sink`'s own comment names a list of ids as the
>   wrong shape. **A hob-bearing row added tomorrow that forgets the declaration is invisible**, and
>   that is a catalogue-discipline gap rather than a preset one.
> - **`failure-text.ts:52` emits `path:code` and nothing else** (H7) — a plausible worry about a
>   schema describer echoing a secret into a log, checked and found false. Kept because somebody
>   will worry again.
>
> **And one fact any preset wave needs, because it is easy to get wrong in exactly one direction: a
> design id is a read capability *today*, and M7 is scheduled to end that.** ADR 0114 decision 5 —
> final per [ADR 0115](../decisions/0115-customer-profiles-replace-the-pin-and-arrive-in-m8-and-m7-ships-the-browser-cookie-and-share-links.md)
> — is wave **7E3b**, which makes `/[locale]/d/{id}` and `GET /api/designs/{id}` refuse a design that
> is not the requesting browser's; 7P1's own **G9** says the same in one line. So *"a design id is
> already public"* is true at HEAD and is **deliberately being removed inside this milestone**. Under
> the settled two-table model it costs nothing — a preset is its own row and `/d/{id}`'s check applies
> to `designs` only — but under the single-table model it would have made the public flag a
> **read-authorisation input**, which is the one role every record here keeps it out of. **Check the
> date on that sentence before relying on it.**
>
> *(Banner written 2026-09-15 by the architect who planned the section, on the coordinator's
> instruction, and revised the same day when the model settled — the intermediate single-table shape
> is recorded above rather than quietly dropped, because a reader who meets only the final answer
> cannot tell which parts were tested. The section is left intact rather than deleted, for the reason
> the struck stored-design risk earlier in this file gives: a later reader who finds it missing may
> re-derive it as new.)*

> **Planned 2026-09-15 by the architect**, from the tree at `41181d8` (the working tree carried
> uncommitted 7E2 and 7F4b work while this was written; **every file and line number below was read
> at `41181d8`** and none of it was measured against the uncommitted half). This is the binding
> version of the **7P2** row in the revised wave table and of the five 7P2 bullets at *Revised
> criteria for new and changed waves*; where they disagree, this section is later and says why.
> **Twelve rulings below are the architect's (AU1–AU12) and are marked as such.**
> [ADR 0112](../decisions/0112-the-preset-library-is-owner-authored-data-behind-a-server-side-gate.md)
> settles the gate's *shape* and hands its *mechanism* to this wave in terms — its status line reads
> *"the gate's mechanism is an engineering decision and goes to a security reviewer in its wave"* —
> so the mechanism is decided here rather than left to an implementer. **Four questions are not
> mine**, and **Q-7P2-1 wants answering before this wave is dispatched, not before it is merged.**
>
> **One dependency stated plainly because it is unusual: 7P1 has not been built.** This plan is
> written against **7P1's plan**, not against shipped code, and it consumes exactly five things from
> it — `PresetRecordSchema`, `presetRoomOf(design)`, `PresetRepository.insert`, the `names` map's two
> code-level bounds, and the operator's `SELECT, INSERT` grant. **If 7P1 lands differently from its
> punch list, those five are where this wave breaks**, and a dispatcher should re-read them rather
> than assume. Criteria numbering restarts at 1, as 7P1's and 7T's do.

### The governing fact: this is the wave that starts the freeze, and nothing here expires

The owner named the moment: *"a critical moment will be when I will start to save presets."* 7P1's
own opening states what that costs, and its retention ruling **P11** sharpens it past recovery:
presets are **stored forever** by the owner's ruling of 2026-09-15 — no reaper, no expiry, no age
rotation on the row. **A table with a retention policy has a horizon past which its oldest mistakes
age out. This one has none.** Until 7P2 runs, the preset record's shape and the geometry underneath
it are free; **from the first row this wave writes, wrong is forever.** That sentence is the wave's
governing fact and belongs at the top of every dispatch inside it.

**One precision, because it is what makes Q-7P2-1 cheap rather than expensive: the freeze does not
begin at this wave's merge commit. It begins at the first row in the *production* database** — and by
ADR 0112 decision 2's own design that row cannot exist until the owner sets two environment variables
that are not in this repository and that no agent may set (`AGENTS.md` rule 1). Rows minted against
the **test** database by this wave's own suites are removed through `deletePresetsForTests` (7P1, G14)
and freeze nothing. **So "7P2 ships" and "the freeze starts" are two separate events, and the second
one is an owner action.** Everything that follows from that is in Q-7P2-1.

### Ground truth, measured at `41181d8`

Each is a file and a line. Six of them contradict something the wave table or a neighbouring record
would reasonably lead an implementer to assume.

| # | Measured | Consequence |
| --- | --- | --- |
| H1 | **`isSceneShotRouteEnabled` returns `true` for every non-production build** — `route-availability.ts:20` is `if (environment.NODE_ENV !== "production") return true;`, with the reason stated: the route *"would only teach people to set it everywhere"*. | ADR 0112 decision 2 names *"the pattern `/internal/scene-shot` uses"*. **Copying that module is the defect this wave must not commit**: it would put a working *save as preset* control into every developer's browser and into the e2e dev server, and 7K's *"no customer journey can reach the save-as-preset control"* would be asserting against a build that is not the deployed one. Ruling **AU1**. |
| H2 | **The repository already contains the corrected form of that pattern.** `selection-debug-availability.ts` carries, verbatim: *"there is **no development exemption**: `NODE_ENV === "development"` must not imply E2E observability"* (finding WEB-004), and Playwright sets its flag on the server it starts. | **That module, not `route-availability.ts`, is this wave's precedent** — and its other difference is the one to invert: it is `NEXT_PUBLIC_`-prefixed *because a client component reads it*. Authoring's flag is read by the server only and **must not** carry that prefix (AU1). |
| H3 | **No rate limiting exists anywhere in the product.** [ADR 0014](../decisions/0014-unauthenticated-write-surface.md) S4 says so in terms; [ADR 0019](../decisions/0019-security-baseline-writes-throttling-retention.md)'s own schedule table places *"application rate limiting"* in **M8**, and the firewall's whole contribution is one rule at **120 requests / 60 s per IP**, *"there to stop a flood… not to express any of the policy"*. | **The unlock route is the first endpoint in this product that compares a human-supplied secret**, and nothing throttles it. 120/60 s is ~170 000 guesses a day per IP — irrelevant against 256 bits and useless against a passphrase. **The control is the secret's entropy, and that is an owner action** (Q-7P2-2), not a code one. |
| H4 | **`EditorPanel` returns `null` when nothing is selected** — `editor-panel.tsx`, `if (view.kind === "closed") return null;` — and every section it draws arrives already decided inside a `PanelView` that `describePanel` produced, a file whose header says *"No product rule lives here either."* | **The save control cannot live inside the panel.** It would be invisible unless a body happened to be selected, and teaching `panel-model.ts` about authoring would put an owner-only, non-product rule into the model whose stated invariant is that it holds none. Ruling **AU6**. |
| H5 | **A server-decided value already reaches `ConfigureScreen` as an optional prop**: `webglUnavailableTitleMobile?: string`, passed by `app/[locale]/configurator/configure/page.tsx` and **not** passed by `d/[id]`'s `HydrateAndConfigure`, which renders `<ConfigureScreen />` bare. | The seam ADR 0112 decision 2 asks for — *"the `/d/{id}` page… reads the flag and the author cookie and passes one boolean down"* — **exists and has a precedent**. It also means the legacy configure page gets `false` by omission, which is the safe direction (AU6). |
| H6 | **`saveStatus: "idle"` does not mean "the stored design matches the screen".** The coalescer's `requestSave` arms a `setTimeout` for `MIN_SAVE_INTERVAL_MS = 1000` and **reports no status change while it waits** (`save-coalescer.ts`, `requestSave`); `onSaveStatusChange("saving", …)` fires only when a request actually goes out. There is **no `flush` and no pending accessor** on the `SaveCoalescer` interface — it exports `scheduleSave` and `overwriteConflict` and nothing else. | **ADR 0112 decision 3 snapshots the *stored* design.** An owner who adjusts a kitchen and clicks *save as preset* within that window stores a preset **missing their last adjustment**, with no error, and the row is permanent. This is the wave's sharpest product hazard and it is invisible to every test that does not look for it. Ruling **AU4**, criterion 10. |
| H7 | **`describeSchemaIssues` is value-free by construction** — `failure-text.ts:52` maps each issue to `` `${path}:${code}` `` and nothing else, then bounds the result. | Checked rather than assumed, because the obvious worry — *a schema describer echoing the owner's secret into a log* — **is not true of this one**. It is therefore safe to reuse on the unlock route, and the must-not is narrower and more useful: **no new describer may interpolate a parsed value**, and the raw body is never logged (AU11). |
| H8 | **A sink is a declared property with a two-directional gate; a hob is not.** `declaresASink(definition)` reads `BodyDefinition.sink` (`void-engine.ts`), and `sink-declaration.parity.test.ts` holds every row's declaration to the `sink_faucet` group its builder draws in both directions. The hob's counterpart, `carriesAccessoryKind: HOB_ACCESSORY_KIND` (`catalog.ts:621`), has **no reader anywhere in `src`** and `HOB_ACCESSORY_KIND` is not exported; the hob is identified in `hob-front-clearance.parity.test.ts:39` by a literal list, `HOB_BEARING_BUILD_IDS = ["base-hob-2drawer", "base-hob-oven"]`. | ADR 0112 decision 4's *"must contain the minimum kitchen — a sink and a hob"* has **half a mechanism**. This wave writes the other half and must write it as a declaration reader, not as a second literal list — the shape `BodyDefinition.sink`'s own doc comment names as wrong (*"pricing must key on the property, not on a list of ids"*, ADR 0068). Ruling **AU5**. |
| H9 | **Nothing in the domain answers *"does this design contain a sink and a hob?"*.** `minimumMet` is a field of `KitchenCompositionPlan` (`generation-priorities.ts:51`), set by `planKitchenComposition` **before** anything is placed; it is a property of a *plan*, not of a *design*. | The predicate is new. **Reusing `minimumMet` would answer a different question** — it says the generator could have fitted the core, not that the kitchen in front of the owner still has a sink after they deleted one (AU5). |
| H10 | **The write-token cookie is `Path=/api/designs/{id}`, and `write-token.ts` explains at length that a server component therefore *cannot* read it** — *"the answer is not a lookup that missed, it is a question that route cannot be asked."* | **The author cookie must not be path-scoped the same way.** ADR 0112 decision 2 requires the `/d/{id}` **page** to read it, so its path is `/` — which is exactly the condition [ADR 0114](../decisions/0114-a-visitor-is-a-host-only-httponly-secret-and-a-design-link-opens-only-in-its-own-browser.md)'s `__Host-` prefix is built for (AU2). |
| H11 | **`playwright.config.ts` has one `webServer` shared by both projects**, and it already sets a test-only flag there (`SELECTION_DEBUG_FLAG`) *"so the opt-in travels with the runner that needs it"*. | The authoring flag can be set the same way **without** making the control reachable: the flag alone renders nothing, because the page also needs the author cookie. So one spec unlocks and every other spec is a live witness that nothing else can see the control (AU12, criterion 18). |
| H12 | `.env.example` is *"key names only, no values"* and tracked; `AGENTS.md` rule 1 is add-only and *"never print a secret's value"*. | The two new variables are added to `.env.example` as **names**; the owner sets the values; **no agent reads, prints, echoes or commits either value**, including into a test fixture or a message to another agent. |
| H13 | 7P1 ships the repository with **`insert` and no caller**, the application role with **no `UPDATE` and no `DELETE`**, and — by G2 — a table whose grant is **an operator step with no automated witness** (7P1 risk 3, criteria 9 and 10, which cannot run in CI). | **This wave is where that grant is first exercised by the application.** If the operator step was missed, the symptom is `permission denied for table presets` **at the owner's first save**, not in CI and not on an implementer's machine. Risk 3. |
| H14 | A new Romanian leaf **enters the copy lock in the same commit that adds it** (ADR 0113 decision 2, `tests/i18n/romanian-copy-lock.test.ts`), and the Russian half is Gate O2's. | The owner-only control still carries product copy in the message files. Whether an owner-only surface owes a Russian leaf is **Q-7P2-4**, and the recommendation is that it owes one exactly like every other leaf. |
| H15 | Method coverage on an App Router route is per exported handler: a verb with no export does not reach the module's own refusal. | Criterion 2 is written **behaviourally** — *every* method answers 404 — rather than as an instruction about which handlers to export, because a 405 on `DELETE` tells a prober the file exists and would defeat ADR 0112 decision 2's *"nothing distinguishes the feature from one that does not exist."* |

### Rulings

**AU1 — the flag is a new server-only module, it has no development exemption, and it is not
`NEXT_PUBLIC_`.** *(Architect's; ADR 0112 decision 2 names the scene-shot pattern and H1 shows that
copying it is a defect.)* `preset-authoring-availability.ts` publishes `PRESET_AUTHORING_FLAG`, the
single opt-in value `"1"`, and a predicate that reads **only that variable** — no `NODE_ENV` arm, in
any direction. `selection-debug-availability.ts` is the precedent and its sentence is the reason
(H2). It is a **pure** module so `playwright.config.ts` and the tests can import the constants, and
the crypto lives one file over in a `server-only` module. **Must not:** a `NEXT_PUBLIC_` prefix on
either variable — that publishes the feature's existence to every visitor's bundle and moves the
decision to the client, which ADR 0112 decision 2 forbids in terms (*"The client never decides"*);
a call to `isSceneShotRouteEnabled`; a second flag for the save route, because two flags can disagree
and ADR 0112 describes one.

**AU2 — the author credential is a stateless, signed, expiring token in a `__Host-` cookie. No
session table, no row, no store.** *(Architect's; ADR 0112 decision 2 fixes the cookie's attributes
and says only that the value is "not the secret" and "server-verifiable".)*

- **Why stateless.** The alternative is a session row, and a session row means a table, a migration,
  a grant and a second thing the deployed-schema gate must learn — **all of it inside the wave whose
  governing fact is that its schema decisions are permanent.** A signed token needs none of them.
- **The shape.** Value = an expiry plus a MAC over it, verified in constant time; the signing key is
  derived from the owner-set secret **hash**, so the deployment holds exactly one authoring secret
  and **rotating it invalidates every outstanding cookie** — a property worth having and worth
  stating, because it is the only revocation this design has.
- **The attributes**, from ADR 0112 decision 2 and H10: `__Host-` prefix (which *enforces* `Secure`,
  `Path=/` and no `Domain`, so a sibling subdomain cannot set it), `HttpOnly`, `SameSite=Strict`,
  and an expiry from **one named constant**. `Path=/` is not laxity: the page must read it (H10),
  and `__Host-` is what makes a root path safe.
- **The lifetime is not in the record.** Recommendation **12 hours, fixed, not sliding** — the write
  token slides because it is pinned to a retention clock (`write-token.ts`), and there is no such
  clock here. A long-lived author cookie is a standing capability to publish onto every customer's
  first screen. **Q-7P2-3** puts the number to the owner; the wave is not blocked on it.
- **Must not:** binding the cookie to an IP or a user-agent (serverless, and it breaks the owner's
  own browser more often than an attacker's); a cookie that carries the secret or its hash; any
  decision taken from the token's payload **before** its signature verifies.

**AU3 — the write surface is an id, a name map and one timestamp. The body can never become
content.** ADR 0112 decision 3 is the rule and this is its executable form: the route parses
`{ designId, names, sourceUpdatedAt }` strictly, loads **that design through the repository**, and
builds the record from what it loaded. Nothing the client sent reaches the row except the names.
**The body is read under its own small byte bound**, not `MAX_DESIGN_BYTES` — the design route's
limit exists because its body *is* a document, and reusing it here would make an authoring endpoint
an unnecessarily large sink. **Must not:** a design id in a query string or a path segment (it is a
read capability until 7E3b — G9 — and a URL is the one place it will be logged by an intermediary);
a document, a placements array, or any field the server would store verbatim.

**AU4 — the save states the design the owner is looking at, and a mismatch is refused rather than
snapshotted.** *(Architect's, and it is the ruling this wave most needs. H6 is the measurement.)*

The client sends `sourceUpdatedAt`: the `updatedAt` of the design **on screen**. The server compares
it with the loaded snapshot's `updatedAt` and refuses anything but equality with a named code. It
costs one string.

- **Why `updatedAt` and not a fingerprint.** `updatedAt` already moves on every successful command —
  `command-result.ts` writes it on success and only on success — so it is a version marker the
  document carries, needing no hashing, no `crypto.subtle`, and no new client dependency. A
  canonical-serialisation hash is exact and is the better answer **if** the sub-millisecond bound
  below is ever shown to bite; it is not the cheaper answer today.
- **The honest bound, stated rather than discovered later:** two commands within the same millisecond
  produce the same ISO timestamp, so the guard cannot separate them. It closes the second-scale
  window `MIN_SAVE_INTERVAL_MS` opens, which is the one an owner can actually hit by clicking.
- **Why not the revision header the design route uses.** The client's revision only advances on a
  *successful save*, so with an edit still queued the client's revision **equals** the stored one and
  the check would pass. `x-expected-revision` is a lost-update guard; this is a staleness guard, and
  they are not the same question.
- **It is a field and not a header**, which inverts the design route's own reasoning deliberately:
  that route used a header because its body *is* the customer's document under a strict schema
  (`route.ts`'s `EXPECTED_REVISION_HEADER` comment). Here the body is a request object this wave
  defines, so the reason does not reach.
- **Must not:** snapshotting a row the owner has not seen; writing the client's timestamp anywhere;
  a UI that merely *hopes* the coalescer has flushed. **The refusal is what the owner sees**, and it
  is recoverable by clicking again a moment later.

**AU5 — the minimum kitchen is one domain function reading declarations, and it is new.**
*(Architect's; ADR 0112 decision 4 states the rule and H8/H9 show the product cannot currently
answer it.)* One exported function in `configurator-domain` answers *may this design be a preset?*
with a list of named codes: any `validateDesignForCatalog` finding **of either severity** (ADR 0109
decision 3, the owner's *"this should always fit the existing walls"*), no sink, no hob. The sink is
`declaresASink`; the hob is a new `declaresAHob` reading `carriesAccessoryKind` — so the wave either
exports `HOB_ACCESSORY_KIND` or places the reader beside it. **Must not:** a literal build-id list
(H8: the shape ADR 0068 names as the failure, and the shape `hob-front-clearance.parity.test.ts`
already has); reusing `minimumMet`, which answers about a plan and not about the kitchen on screen
(H9); the *fatal-only* filter `fatalDesignValidationIssues`, which is the design save's rule and is
deliberately weaker than a preset's.

**One limit this creates, recorded because nobody else will find it.** `declaresASink` is safe
because a **two-directional** parity gate holds every row's declaration against the mesh its builder
draws. `carriesAccessoryKind` has no such gate, so a future hob-bearing row that forgets the
declaration would be invisible to this predicate. **Closing it is a `three-adapter` test and this
wave must not touch that package** — recommendation: a backlog entry naming the asymmetry, written
by whoever closes this wave. *(The gap is the architect's finding; the remedy is not this wave's.)*

**AU6 — the control is the configure screen's, never the panel's, and the server decides.**
*(Architect's; H4 and H5.)* `save-as-preset.tsx` may live under `src/panel/` as the wave table has
it — it is an editor-surface component — but it is rendered by `configure-screen.tsx` as a sibling
of `EditorPanel`, and **`PanelView`, `panel-model.ts` and `describePanel` learn nothing about
authoring**. The boolean travels `page.tsx` → `HydrateAndConfigure` → `ConfigureScreen` as an
**optional prop defaulting to `false`**, which is the safe direction by construction: a surface that
forgets to pass it shows nothing, and `/[locale]/configurator/configure` forgets it deliberately.
**Must not:** a new `PanelSection` kind; the flag or the cookie read in a client component; the
control's visibility stored in the configurator store, which would make an owner-only affordance part
of the document editor's state.

**AU7 — the form accepts a half-filled name map, and its bounds are the domain's.** 7P1 ruling P10 is
explicit that *"a half-filled map is… the normal state rather than an edge case"* — the owner authors
one at a time, by hand, and a schema demanding both names would be *"discovered by the owner, at the
moment of saving, as a refusal."* So: both fields optional, an empty map accepted, one locale
accepted, and **no refusal anywhere in this wave mentions a missing name**. Each field's `maxLength`
is **read from the domain constant**, never typed — a second bound here is exactly
[ADR 0102](../decisions/0102-a-recorded-source-must-explain-its-depth-and-a-second-authority-in-a-test-is-the-defect-laundered.md)'s
laundered second authority. **On changing the bound:** P10 leaves the numbers' reason to this wave
(the 390 px card). Raising one is free forever; **lowering one is free only until the owner authors**,
after which it could refuse a row that already exists — so a downward change is taken in this wave or
not at all.

**AU8 — off means absent, and "off" is checked twice on every save.** Flag off: **both** routes answer
**404 to every method**, with one body, and the editor renders no control. Flag on, no author
cookie: 404 from the save, and no control. **A valid author cookie with the flag off is refused** —
ADR 0112 decision 2's own sentence. A wrong secret gets the **same response as a disabled feature**,
so the unlock endpoint is not an existence oracle; this is the same discipline
`writeForbiddenResponse` already keeps for design ids (*"no cookie, a token belonging to a different
design, or an id no row carries"* all answer alike). **Must not:** a 405 on an unexported verb
(H15); a distinct body, header or timing between "off" and "wrong secret"; **a `GET` on
`/api/presets`** — 7P1 criterion 16 forbade it for a wave that had no route at all, and ADR 0112
decision 5 is what makes it permanent: the read is a server-component call and there is no public
list endpoint.

**AU9 — no thumbnail, no column, no grant, and the obligation is 7G's — checked, and it is
recorded.** *(The coordinator's ruling on Q-7P1-2, 2026-09-15, verified present in two places: 7G's
row in the revised wave table and Q-7P1-2's own answer.)* 7P1's **P5** creates no thumbnail column;
this wave adds none either, captures no image, and asks for no widened grant. **Every preset authored
between this wave and 7G has no picture and no way to acquire one until 7G backfills it** — which 7G
does from each preset's own snapshot (ADR 0112 decision 6) under a **column-level**
`grant update (thumbnail…)`, so `status` stays unwritable by the application. **This wave's
close-out states that fact in a sentence**, so the backfill's scope is *"every row that exists"*
rather than a date someone has to reconstruct. **Must not:** an image field on the request "so 7G
only has to store it"; a nullable column added early; an `UPDATE` grant.

**AU10 — the visitor cookie grants nothing here, whether or not 7E3a has landed.**
[ADR 0114](../decisions/0114-a-visitor-is-a-host-only-httponly-secret-and-a-design-link-opens-only-in-its-own-browser.md)
decision 6 is verbatim: *"The save endpoint (ADR 0112) never reads the visitor cookie; a request with
a valid visitor cookie and write token but no author cookie is refused exactly as when authoring is
off."* Recorded here because 7E3a lands **after** this wave in the recommended order, so the
temptation is the opposite one — to treat the absence as something to fix later. **Must not:** the
authoring gate reading any cookie but its own; the write token consulted as evidence of authorship.

**AU11 — what is logged, and the two things that must never be.** Every authoring refusal is logged
with a stable code, through one transport, as the designs routes do (`design-failure-log.ts` is the
shape: one module chooses the transport so *"an error tracker dropped behind it sees every line or
none"*). **Never logged: the submitted secret, any fragment of it, and the author cookie's value.**
H7 is why the existing describer is safe to reuse and why the must-not is narrower than it looks:
**no new describer may interpolate a parsed value.** The *responses* name no design id, no room and
no reason beyond a code (ADR 0014 finding S2, held to on every existing route).

**AU12 — the e2e suite proves absence, and it needs the flag on to do it.** *(Architect's; H11.)* The
Playwright `webServer` sets the authoring flag and a **test** secret hash, exactly as it already sets
`SELECTION_DEBUG_FLAG` and for the same stated reason. That does **not** make the control reachable:
the page also requires the author cookie, so every existing spec becomes a live witness that a
customer journey cannot see it, and **one** spec unlocks through the session route and then can.
**7K inherits the sweep** it already carries — *"no customer journey can reach the save-as-preset
control"* — and it is now testable rather than vacuous. **Must not:** the owner's real secret, or any
value derived from it, anywhere near a test.

### Module boundaries

- **The domain owns the product rule and nothing else.** One module publishing the
  may-this-be-a-preset function and its codes, plus `declaresAHob` beside the sink's reader. **It
  knows nothing about cookies, flags, requests or locales** — P10's *"the domain names no locale"*
  survives this wave untouched, because the names arrive as a map and are validated for shape.
- **`lib/server` owns the gate.** Two modules: the pure flag constants (importable by
  `playwright.config.ts` and tests) and a `server-only` module holding the secret comparison and the
  cookie's mint and verify. **The flag lives here rather than beside a surface** — unlike
  `route-availability.ts` and `selection-debug-availability.ts`, which each gate one thing, this flag
  gates two routes and a page, so no single surface owns it.
- **The routes compose and decide nothing.** The session route unlocks; the save route re-checks both
  gates, loads, applies the domain rule, and inserts through 7P1's repository. **No SQL, no driver,
  no id generation** — `generate-preset-id.ts` is persistence's (7P1) and `scripts/gates/boundary.sh`
  is the standing rule.
- **The editor surface renders a decision it was handed.** `save-as-preset.tsx` takes a boolean and a
  design, posts, and shows a result. **No product rule and no gate logic** on the client.
- **Persistence and the migration are untouched.** This wave adds no migration, changes no grant, and
  does not open `preset-repository.ts` except to call `insert`.

### Files, and the must-not-change set

**May change** — grouped by slice, so each dispatch stays near `docs/WORKFLOW.md`'s five production
files:

- `packages/configurator-domain/src/presets/preset-save-rules.ts` (new), the hob reader beside
  `declaresASink`, `src/index.ts` (exports only).
- `apps/web/src/lib/server/preset-authoring-availability.ts` (new),
  `apps/web/src/lib/server/preset-authoring.ts` (new).
- `apps/web/src/app/api/preset-authoring/session/route.ts` (new),
  `apps/web/src/app/api/presets/route.ts` (new, `POST` only).
- `apps/web/src/panel/save-as-preset.tsx` + its CSS module (new),
  `apps/web/src/app/configurator/configure/configure-screen.tsx`,
  `apps/web/src/app/d/[id]/hydrate-and-configure.tsx`,
  `apps/web/src/app/[locale]/d/[id]/page.tsx`.
- `apps/web/src/messages/ro.json`, `ru.json`, `src/i18n/content.ts`,
  `tests/i18n/romanian-copy-lock.test.ts`.
- `.env.example`, `apps/web/playwright.config.ts`, `docs/runbooks/preset-authoring.md` (new).

**Must not change:** `packages/persistence/src/migrations/**` — **no migration in this wave**;
`preset-repository.ts` and `preset-record.ts` — **7P1's, and the freeze is why**; `migrate-status.ts`
and `migration-status.ts`; `neon-configuration-repository.ts` and `api/designs/**` — **the design
write path is untouched**; `write-token.ts`; `save-coalescer.ts` — AU4 exists precisely so this wave
does not open the write path to add a flush; `panel-model.ts` and `editor-panel.tsx` (AU6);
`validate-design.ts`; `approved-room-policy.ts`; anything under `packages/three-adapter`.

### For the security reviewer — the four questions, answered where they can be checked

**The tier is Full + security** (ADR 0112 decision 7), and this wave is the one that decision was
written for: it adds **an authentication mechanism, a write endpoint, and an owner-only UI** — three
of the five things [ADR 0062](../decisions/0062-a-manufacturer-price-dashboard-comes-after-m8-and-shapes-seams-now.md)
rules out for M6–M8, permitted here by that record's dated amendment and by nothing else.

**1. Who may reach the authoring route?** With the flag unset — the default in every environment,
including every developer's (AU1) — **nobody**: both routes are 404 to every method and the control
is not rendered. With the flag set, reaching the *save* additionally requires the author cookie,
which requires the secret. **The reviewer's first check is that the two gates are re-evaluated on
every request rather than at module load**, and the second is that nothing short-circuits them: a
valid cookie with the flag off is refused, and the page's boolean is computed on the server per
request (the `/d/{id}` page is already dynamic — it reads the repository).

**2. Is a preset id guessable, and does it matter?** It is `nanoid`, and **a preset id is not a
capability** — 7P1 settled this, and its sharpest line carries into this wave unchanged: *a preset id
is not a capability but a design id still is.* **The concrete failure this wave could create, and the
thing to look for, is a working `/d/{id}` link to the owner's own kitchen appearing on a customer's
screen.** The save request **names a design id** (ADR 0112 decision 3), so this is the one wave in
which that id is in the hands of a route that writes the row every customer reads. 7P1 ruling **P3**
is the must-not — the record carries no design id in any form — and criterion 9 is its executable
form here: what the route stores is built from the **loaded design**, and the id it was loaded by is
not among the record's fields. Until 7E3b lands (after this wave), a design id in a response body, a
log, a URL or a `names` value is a read capability handed out.

**3. Can the write path be driven by anyone but the owner?** The credential is a secret the owner
holds and a cookie the server signs. Three things to check, each of which has a recorded reason:
**(a)** the comparison is constant-time over equal-length digests and a missing or malformed
environment hash behaves as flag-off rather than as "no secret required" — a fail-open default here
publishes to every customer's screen; **(b)** `SameSite=Strict` plus a body-only secret is what
stands in for CSRF protection, and the reviewer should confirm no `GET` and no URL parameter can
drive either route; **(c)** **there is no rate limiter in this product** (H3) and there will not be
one until M8, so the unlock endpoint's only real defence is the secret's entropy — which is why
Q-7P2-2 is put to the owner rather than assumed, and why **this wave records an obligation for M8's
limiter table: two new rows, the unlock and the save.**

**4. What would a `select *` on this table publish?** The same answer 7P1 gave, now with a writer:
the row is the snapshot, the room columns, the names, the status and the timestamps — **no
credential, no visitor identity, no design id** — and the snapshot is safe *by construction of the
`Design` type*, because the write-token hash and the visitor hash are **columns on `designs`**, never
fields of the document. The new surface this wave adds to that answer is **`names`: free text the
owner types, stored, and rendered to every visitor.** Its only writer is behind this gate, so the
realistic failure is **size, not script** — both bounds live in the domain schema and are asserted —
and escaping is the renderer's, React's by default. **The reviewer's question is whether anything
downstream reaches for `dangerouslySetInnerHTML` to style a name.**

**One honest limit, stated rather than left to inference:** the grant this wave finally exercises has
**no automated witness anywhere in the deploy path** (7P1 G2, G4, risk 3). No test in CI can prove
the application role may insert. The first proof is the owner's first save, and risk 3 is where that
is ranked.

### Acceptance criteria

*(Numbered from 1, per wave, as 7P1's and 7T's are.)*

1. *(unit)* **The flag opts in and nothing else does.** Only the exact value enables; a missing,
   empty, `"0"`, `"false"` or `"true"` value does not; and a grep-in-a-test proves the module
   contains **no `NODE_ENV` branch** and that neither variable name begins with `NEXT_PUBLIC_`.
   **Must not:** a call to `isSceneShotRouteEnabled`, whose non-production arm is the defect (H1).
2. *(unit)* **Flag off: both routes answer 404 to `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD` and
   `OPTIONS`**, with one body and no `Set-Cookie`. The verbs are enumerated in the test.
   **Must not:** a 405 for any of them — it confirms the file exists (H15).
3. *(unit)* **Flag on, wrong secret: the response is indistinguishable from criterion 2's** — same
   status, same body, same headers but `Date` — and no cookie is set. The log line names a refusal
   code and contains **no fragment of the submitted value**, asserted by searching the captured line
   for the test secret.
4. *(unit, boundary)* **Flag on, right secret: 204 and exactly one `Set-Cookie`** whose name carries
   the `__Host-` prefix and whose attributes are `HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/`,
   no `Domain`, and a `Max-Age` equal to the named constant. The cookie value is asserted **unequal**
   to both the secret and its stored hash.
5. *(unit)* **A missing or malformed secret hash in the environment behaves exactly as flag-off**,
   even with the flag on. **Must not:** a default, a fallback, or a development secret anywhere in
   the tree — a fail-open default here publishes to every customer's first screen.
6. *(unit, boundary)* **Cookie verification refuses an expired token, a tampered one, and one minted
   under a different secret hash** (rotation invalidates), and **no value from the token's payload is
   read before its signature verifies**.
7. *(unit)* **Both gates are re-checked on every save**: flag on with no cookie → 404; **flag off
   with a valid cookie → 404** (ADR 0112 decision 2). **Must not:** a gate evaluated once at module
   load.
8. *(unit)* **The request body is `{ designId, names, sourceUpdatedAt }`, parsed strictly, under its
   own byte bound.** An unknown key is refused. **Must not:** `MAX_DESIGN_BYTES`; a design id read
   from a query string or a path segment; any document-shaped field.
9. *(unit, the P3 guard in this wave's form)* **What is stored is built from the loaded design.** A
   body carrying extra document-shaped keys changes nothing about the record, and **no field of the
   record holds the design id in any form** — asserted over the object actually passed to `insert`.
   **Must not:** provenance "for debugging".
10. *(unit, the staleness guard — AU4, the criterion this wave most needs)* **A `sourceUpdatedAt`
    that differs from the loaded design's `updatedAt` is refused with a stable code and nothing is
    inserted**; equality passes. Both directions are asserted: a screen ahead of the row (the unsaved
    edit, H6) and a row ahead of the screen (a second tab). **Must not:** a save that snapshots a row
    the owner has not seen; the client's timestamp persisted anywhere.
11. *(unit, domain)* **The preset rule refuses a design with any finding of *either* severity, one
    with no sink, and one with no hob, and accepts the reference kitchen** — each as a separate case
    with its own code. The sink and hob are answered from **declarations**. **Must not:** a literal
    build-id list (H8); `fatalDesignValidationIssues`, which is the weaker design-save rule;
    `minimumMet`, which answers about a plan (H9).
12. *(unit, boundary)* **Names: the empty map, a one-locale map and a two-locale map all save**, and
    no refusal in this wave mentions a name. A name one character over the domain bound is refused,
    and the form's `maxLength` is asserted **equal to the domain constant read in the test**.
    **Must not:** a literal length in the component; a required second locale (P10).
13. *(dom)* **The control renders only when the server-decided prop is true**: absent by default,
    absent on `/[locale]/configurator/configure`, present in `/d/{id}` when the page passes `true`.
    A grep-in-a-test finds **no authoring section in `panel-model.ts`** and no flag or cookie read in
    any client module. **Must not:** the control inside `EditorPanel`, which renders nothing when no
    body is selected (H4).
14. *(dom)* **Two taps issue exactly one `POST`**, asserted through the rendered component with a
    stubbed fetch — 7E2's close-out carried this lesson forward in terms, and an owner double-tapping
    a save that mints a permanent row is precisely the case it was written for.
15. *(unit)* **Every refusal reaches the owner as a code and the log as a line**, and the **response
    names no design id, no room and no reason** beyond the code (ADR 0014 S2).
16. *(unit)* **No thumbnail anywhere in this wave**: no image field on the request, no column, no
    grant, and a grep over the wave's files finds no `thumbnail`. **Must not:** a nullable column
    "for 7G" — P5 and Q-7P1-2 settled the order.
17. *(unit)* **`.env.example` names both variables and carries no value**, and a grep-in-a-test
    proves neither variable is ever *assigned* in the tree — only read. **Must not:** a secret, a
    hash, or an example value in any tracked file (`AGENTS.md` rule 1).
18. *(e2e, both projects + one visual capture)* **With the flag set on the Playwright server, every
    existing spec still finds no save control**, and one spec unlocks through the session route and
    then sees it. The control is captured at 390 × 844 and 1440 × 900 in a production build.
    **Must not:** the flag set in a way that leaks into a developer's `next dev` (H2, AU1).

**Wave-wide must-nots.** **No agent sets either environment variable in any deployed environment, and
no agent ever sees or prints the owner's secret** (`AGENTS.md` rule 1). No migration, no `grant`, no
`UPDATE`, no `DELETE`. No public `GET` on `/api/presets` (ADR 0112 decision 5, 7P1 criterion 16). No
±600 comparison — the evaluator is 7B's. The visitor cookie is not read (AU10). `CURRENT_SCHEMA_VERSION`
is not bumped.

**The five carried 7P2 bullets, mapped.** Carried 1 → criteria 2, 13; carried 2 → criteria 7, 13;
carried 3 → criteria 3, 4, 5, 6; carried 4 → criteria 8, 9, 10, 11; carried 5 → criterion 7's flag-off
arm plus the close-out statement that turning the flag off hides **authoring only** and publishes
nothing and unpublishes nothing. **None is withdrawn**; criteria 10, 12, 14 and 18 are additions this
plan makes.

### Slices, in dependency order — dispatched one at a time, with the tree frozen between

- **S1 — the product rule, in the domain, alone.** `preset-save-rules.ts`, the hob reader,
  `index.ts`. Criterion 11. **First and alone** because it is the only piece whose *meaning* is
  frozen by the first authored row: a rule that admits a sink-less kitchen admits it permanently.
- **S2 — the gate, with no route on it.** The two `lib/server` modules. Criteria 1, 4, 5, 6.
  Reviewed before anything is mounted on it; this is the wave's security core and it is testable
  without a request.
- **S3 — the session route.** Criteria 2 (its half), 3, 17, plus `.env.example` and the runbook.
- **S4 — the save route.** Criteria 2 (its half), 7, 8, 9, 10, 15, 16. The largest slice, and it
  consumes S1–S3 rather than re-deciding anything.
- **S5 — the control and its copy.** `save-as-preset.tsx`, the three files that pass the boolean,
  the message files and the copy lock. Criteria 12, 13, 14. **Sequenced against whoever else holds
  `configure-screen.tsx` and `hydrate-and-configure.tsx`** — see risk 7.
- **S6 — the e2e witness and the capture.** `playwright.config.ts` and one spec. Criterion 18.
  **Last, because it is the only slice that can prove absence**, and absence is only meaningful once
  everything that could leak exists.

### The test contract

- **Unit and DOM suites** in `configurator-domain` and `apps/web` are the wave's CI gate. Route
  handlers are exercised by direct invocation, as `tests/app/api/designs/**` already does, against
  7P1's `fake-preset-repository.ts`.
- **No new live suite is owed.** The insert path's live evidence is 7P1's criteria 3 and 13. If one
  is added anyway it gates on `TEST_DATABASE_URL` (7P1 ruling P7), never on `DATABASE_URL`.
- **e2e: yes, and it is the only wave where the suite's value is what it does *not* find.** Both
  Playwright projects; the runner is the verdict, and a green local run is not one.
- **Visual: yes** — the wave table says so, and the surface is the owner's. One capture per project
  with the control visible.
- **Criterion 5's environment arms run by construction** (the test supplies the environment), but
  **the grant of H13 has no test at all** — the close-out says so in a sentence rather than implying
  coverage, exactly as 7P1's does for its criteria 9 and 10.

### Risks, ranked — with the reason for the rank

1. **The corner geometry frozen by the owner's first authored row.** Rank 1 because it is the only
   risk here whose cost is **unbounded and irreversible by code**: 7D6 and 7D7 both carry *"deadline:
   land before 7P2"* on their own rows, and the recommended order does not schedule either of them
   before this wave. Every other item below is caught by a test, a gate or a retry. **Q-7P2-1 is
   this risk**, and its cheapest answer is not a reorder.
2. **A silently stale snapshot** (H6). Rank 2 because it is **silent and permanent** — the owner sees
   a success, the preset is missing the adjustment they just made, and nothing anywhere will ever say
   so. Criterion 10 converts it into a refusal the owner can act on, which is the whole of the
   remedy.
3. **The grant nobody ran** (H13). Rank 3 because **no test in CI can catch it**, the symptom lands
   on the owner mid-authoring rather than on an implementer, and its fix is an operator action taken
   under time pressure. It ranks below 2 only because it is **loud**: `permission denied for table
   presets` names itself.
4. **Guessing the secret, with no limiter in the product** (H3). Rank 4 rather than higher because
   the mitigation is **complete if the secret is generated** — 256 bits is not guessable at 170 000
   attempts a day — and **absent if it is chosen**. That makes it an owner question (Q-7P2-2) rather
   than an engineering risk, and it is ranked here so nobody treats the firewall's flood rule as an
   answer.
5. **A half-filled name map refused mid-authoring** (P10). Rank 5: cheap to prevent, and the owner
   discovers it at the worst possible moment — holding a kitchen they have just adjusted by hand.
6. **The control reaching a customer.** Ranked below 5 because **three independent things must all
   fail** — the flag, the cookie and the prop — and each has its own criterion. It is named because
   the consequence is the largest on the list: a customer publishing to every Step 1 screen.
7. **Two agents in `configure-screen.tsx`.** Rank 7, and it is a process risk rather than a code one:
   7E2, 7F4b and 7E3a all touch the three files S5 needs, and the pre-commit hook re-adds whole
   files, so **two agents cannot share one file — they must be sequenced.** Named because it is the
   likeliest thing to cost this wave a day.
8. **A Romanian leaf added outside the copy lock** (H14). Low: a test catches it in the same commit.
9. **Scope creep into 7G.** A thumbnail captured "while the scene is right there" would create the
   column P5 declined, in the wave whose mistakes are permanent. Low likelihood, high visibility, and
   the must-not is stated twice on purpose.

### Questions that are not mine

> **All four are closed by the deferral, 2026-09-15 — read this before the four below, which are
> written as if the wave were next.** **Q-7P2-1 is dissolved**: 7D6 and 7D7's *"land before 7P2"*
> deadline is trivially satisfiable now that 7P2 has moved out by more than a milestone, so the
> contradiction it reports is no longer one. Its recommendation — that the freeze begins at the first
> **production** row rather than at a merge commit — was the right answer to the question as it then
> stood, and is kept for whoever revives the wave, because that distinction is what makes the deadline
> cheap under any ordering. **Q-7P2-2, Q-7P2-3 and Q-7P2-4 are parked until revival, not asked**: each
> is written below as *cheap to ask today*, and that is no longer true — the owner deferred this area
> precisely so they could look at real generated kitchens first, and asking them now to settle an
> unlock duration would be asking them to shape something they have said they cannot yet picture.
> **The three recommendations stand and the coordinator agrees with all three** — a generated secret
> rather than a chosen one, twelve hours fixed, and yes to the Russian leaf because the copy lock's
> value is that it has no exceptions.

**Q-7P2-1 — the coordinator's, and it wants answering before dispatch. 7D6 and 7D7 carry
*"deadline: land before 7P2"*; the recommended order does not contain them.** The wave table's 7D6
row reads *"Deadline: land before 7P2 — once presets are saved the reach is load-bearing on stored
data and stops being freely re-derivable"*, and 7D7's reads *"Deadline: before 7P2, with 7D6"* — and
7D7 additionally takes its fidelity baseline **after 7H**. The corrected recommended order
(2026-09-15) reads `… → 7F4a → 7F4b → 7T → 7P1 → 7P2 → 7G → 7B → …` and places **7H after 7E3b**,
with 7D6 and 7D7 not scheduled at all. **Those two statements cannot both be followed.**

**Recommendation, and it is not a reorder.** The freeze begins at the first **production** row, not
at the merge commit, and that row needs two environment variables only the owner can set. So:
**ship 7P2, and make "the owner does not unlock authoring until 7D6 and 7D7 have landed" an explicit,
recorded instruction** — in `docs/runbooks/preset-authoring.md`, which this wave creates anyway, and
on the launch-gate line ADR 0112's consequences already add to M8. That keeps the corner freely
re-derivable for exactly as long as it needs to be, without holding the authoring code behind three
waves. **The cost, stated so it is chosen rather than discovered: it converts a wave-order guarantee
into an operational one**, and an operational guarantee is only as good as the record of it — which
is why the recommendation names two places to write it down rather than one. **The alternative is the
literal reading — 7D6 → 7D7 (→ 7H first) → 7P2 — and it is defensible; it is simply three waves of
delay to protect a moment the owner controls anyway.** *(The analysis is the architect's; the choice
is the coordinator's, and either way it should be recorded as a dated ruling, because 7D6's and
7D7's rows say something this plan would otherwise quietly contradict.)*

**Q-7P2-2 — the owner's, and cheap to ask today. The authoring secret must be *generated*, not
chosen.** There is no rate limiter in this product and there will not be one before M8 (H3), so a
memorable passphrase is the one failure mode that would hand a stranger the ability to publish onto
every customer's first screen. **The ask is one sentence:** *will you paste a randomly generated
value (the runbook gives the exact command) rather than choose a phrase?* **Recommendation: yes**, and
the runbook carries the command and the reminder that **no agent may ever see the value.** This is
also the wave's one M8 obligation: **ADR 0019's limiter table gains two rows** — the unlock and the
save — recorded now, while it is a sentence.

**Q-7P2-3 — the owner's, not blocking. How long should one unlock last before the secret is typed
again?** The record fixes every attribute of the cookie except its lifetime. **Recommendation: 12
hours, fixed rather than sliding** — long enough for an authoring session, short enough that a
forgotten browser is not a standing capability. It is one named constant, so the answer can arrive
after the wave lands.

**Q-7P2-4 — the coordinator's. Does an owner-only control owe a Russian leaf?** The control's copy
goes in the message files like all copy, which under ADR 0113 means each Romanian leaf enters the
copy lock in the same commit and the Russian value is Gate O2's — **the owner's own work, for a
button only the owner will ever see. Recommendation: yes, treat it like every other leaf.** The lock's
whole value is that it has no exceptions, and the first exception would be argued from a surface
nobody sees — which is exactly the argument that is hardest to bound afterwards.

**One thing to tell the owner that is not a question.** Between this wave and 7F3, **the owner authors
blind**: there is no screen in the product that lists what is in the library, because ADR 0112
decision 5 rules out a public list endpoint and 7F3 is the wave that reads it. **Recommendation, and
it costs one line:** the save's confirmation names the preset's shape and room back to the owner, so
the library is at least countable from the confirmations. Not a criterion; a courtesy the wave can
afford.

### Verification

Per-package `vitest` for `configurator-domain` and `apps/web`; `typecheck`; `lint`; both Playwright
projects **on the runner**; one visual capture per project; and a whole-tree `pnpm format:check` at
the wave's end. **No migration is written and no database schema changes**, and that is recorded as a
sentence rather than implied by silence. **The close-out states three things plainly:** that the
grant of H13 has no automated witness and was proved (or not) by hand; that every preset authored
before 7G has no thumbnail and is 7G's backfill to repair; and **whether the two environment
variables have been set in any deployed environment — by the owner, never by an agent.**
