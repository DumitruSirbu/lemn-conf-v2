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
> understood well enough to write one accurate record instead of a narrow one. **7H is not
> dispatchable until 7F1 has landed**, because its anchor is 7F1's criterion 12.
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
| **7F4** | 1F composition steps, struck *nu încape*, straight into the editor | `src/room/generation-steps.tsx`, `generation-model.ts`, `use-generation.ts`, `room.module.css` (+ messages) | 7D2, 7E2, 7F1 | **Full** (kit lifetime) | **Yes** | — |
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
- **7F4:** the steps render in the log's order with the frames' three states; *nu încape* items are
  struck through and absent from the design that opens. *Property at the model:* for every valid room
  either at least one preset is listed or generation runs — no *"no results"* state exists. The kit
  lease is released even if the customer leaves mid-composition (ledger). The composition's duration
  on the verifier's device is **reported**, not assumed.

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
| **7D6** | The corner's along-wall reach is **derived from the cabinet depth** instead of carried as the fixture's 900 / 320 / 570 literals — the owner's *"correct shape and size"*. **Carries the pre-flight gate on 7D3** and may move an owner-approved wall minimum. **Deadline: land before 7P2** — once presets are saved the reach is load-bearing on stored data and stops being freely re-derivable | `src/room/room-policy.ts`, `src/generation/shell-design.ts` (run-start helpers), `src/fixtures/kitchen-l-design.ts` (corner widths), a new pure derivation module, `src/index.ts` | 7D1 (shipped) | **Full** | No | none to dispatch; **Q-K1 arises only if a number moves, and is a conversation, not a migration** |
| **7D7** | The corner **builders** take their size as a parameter — `DEVELOPMENT-SPEC.md` §13.3 open question 6, corner half only. **Ordering: its fidelity baseline is taken *after* 7H lands, never before. Deadline: before 7P2**, with 7D6 | `packages/three-adapter` corner builders (+ fidelity and parity coverage) | **7D6, and 7H for ordering** | **Full** (3D, fidelity gate) | **Yes**, both depths | — |
| **7E1** | `/configurator/room`, URL state, proxy, `/` → Step 1 — **DONE, `57f1e94`** | *carried* | 7A | Full | Unstyled | — |
| **7E2** | Create the design; `/d/{id}` only after the write; back links — **DONE, `470e5c9`** | *carried*, minus the demo-URL item | 7E1 | Full + security | Light | — |
| **7F1** | 1A shape cards; 1B fields, toggle, live plan | *carried*, plus `room/metres-text.ts`, `room/room-draft.ts`, `room/plan-preview-model.ts`, `room/room-url-state.ts` (two exports), `room/room-policy.ts` + `src/index.ts` (`isShapeBuildable`), `eslint.config.mjs`, `messages/ro.json` + `ru.json` | 7A, 7E1 | Light | **Yes** | answered (F8) — all three cards drawn |
| **7F4** | 1F composition steps into the editor | *carried*, plus *minimum not met* → 1C | 7D2, 7E2, 7F1 | Full (kit) | **Yes** | — |
| **7P1** | The preset store: migration, record schema, repository, read path, backup export | `persistence/src/migrations/0005_create_presets.sql`, `persistence/src/preset-repository.ts`, `configurator-domain/src/presets/preset-record.ts`, `apps/web/src/lib/server/backup-designs.ts` | 7A | Full + security | No | — |
| **7P2** | Authoring gate, save endpoint, editor button. **This wave is the project's freeze point**: the owner's *"a critical moment will be when I will start to save presets"*. From here the corner's reach, the wall minima and `ROOM_TOO_SMALL_FOR_KITCHEN` are load-bearing on stored data — **geometry that wants re-deriving (7D6, 7D7) lands before this, not after** | `apps/web/src/lib/server/preset-authoring.ts`, `app/api/preset-authoring/session/route.ts`, `app/api/presets/route.ts`, `src/panel/save-as-preset.tsx`, `app/[locale]/d/[id]/page.tsx` | 7P1, 7E2 | Full + security | **Yes** (owner surface) | — |
| **7G** | Thumbnail captured at save, stored, served | `src/panel/capture-preset-thumbnail.ts`, `app/api/presets/[id]/thumbnail/route.ts`, `preset-repository.ts` | 7P2 | Full + security (upload) | Capture | — |
| **7B** | Preset matching: ±600 window, fit, availability, one evaluation | *carried* files; revised criteria below | 7A | Full | No | — |
| **7C** | Preset adaptation from the free ends and **below a low ceiling**; leftover rule; declared changes | `src/presets/adapt-preset.ts`, `src/presets/evaluate-preset.ts`, `src/index.ts` | 7B, 7D2 | Full | No | answered (F4, F7) |
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
7E4 → 7E3a → 7E3c → 7E3b → 7H → 7I → 7J → 7K → 7L.**

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
`57f1e94`; next dispatchable wave: 7E2.** **Corrected again 2026-09-14: 7E2 is DONE at `470e5c9`;
next dispatchable wave: 7F1.** 7A2's shipped contract is ADR 0108 Amendment E and the
criteria below.

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
- **Between the fridge and a *tall oven tower*: the geometry does not answer it.** Measured,
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
half, ADR 0110 **OQ-2**).

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

  **Left open, blocking nothing, not put to the owner now** (their *"lets focus now on building
  algorithm"*): whether a **base** cabinet is enough between the fridge and a **tall** oven tower, or
  whether both being full height asks for a full-height separator. D7.3 has the geometry — the tower's
  oven reaches above the worktop line, the backsplash gap above it is open air, the wall row is
  shallower than either body. **Not reachable by this wave**; the natural moment to ask is the wave
  that first composes a fridge into a block.

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
| R3 | **The dishwasher stands beside the sink, after it.** Owner-confirmed. | New. No dishwasher is generated today. The word *after* is read in the owner's own order (A1) — see D7 and **Q-D1**. |
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

### Ground truth, measured at `41181d8`

Measured by importing the package's built `dist/generation/` from the scratchpad; nothing in the tree
was edited, and nothing below was taken from an earlier document without re-running it.

| # | Measured | Consequence for this plan |
| --- | --- | --- |
| G1 | **The eleven, re-measured.** At 6300 × 5100 × 2600 wall A plans `sink, preparation, hob` then **six** storage (remainder 0) and wall B plans **five** storage then `fridge:700` (remainder 400). Eleven storage slots, every one `base-cabinet:600`. | The figure the wave exists for holds at HEAD. |
| G2 | **After 7D3 the same room keeps eight.** Its block takes `min(3, wall-A leftover)` = 3, leaving wall A three and wall B five. | **7D4 composes eight slots there, not eleven** — the block removes three, and this wave must not assume otherwise. |
| G3 | **The whole approved policy, swept on a 10 mm grid at 2600 mm**: 222 351 rooms, 10 800 of them *minimum not met*. Storage slots **after** 7D3's block: `0:64 800  1:37 260  2:31 870  3:27 720  4:24 120  5:17 100  6:6 120  7:2 520  8:41`. | **30.6 % of placed rooms have no storage slot at all and 17.6 % have one**, so D9's degradation is the common case, not the corner. 51.8 % have two or more and are where the rule is visible. |
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

| Slots | Room | Wall A storage | Wall B storage | 7D3 block |
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

**So: 7D4 is dispatched only after 7D3 has closed**, and its ground truth above is measured at HEAD
*before* 7D3, with the block's effect applied arithmetically and marked as such (G2, G3).

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
> bottle cargo (D2.2), for the reason D11 gives. **Q-D1 — which side of the sink — is deliberately
> left open and travels with it**; it is not to be resolved on 7D4's record.

- **It is core, not storage.** Plumbing is the reason it must be *beside* the sink — it drains into
  the sink's waste and takes the sink's supply, so the two carcasses have to abut — and storage stands
  only at a run's ends, which is nowhere near the sink in most rooms. So it enters
  `GENERATION_PRIORITIES` as a role, not the cycle.
- **Which side: after the sink, in the owner's own order.** A1's order reads fridge → sink → hob left
  to right; the owner said *"dishasher is afetr sink"* in that vocabulary, so *after* is read there
  rather than reinterpreted. The order becomes **fridge → sink → dishwasher → preparation → hob**.
  **Confirm with Q-D1 before S5 is dispatched.**
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

**D9 — what a run too short for variety does, and it must never be worse than today.** Measured (G3):
after 7D3, **30.6 %** of placed rooms have no storage slot at all and **17.6 %** have exactly one, so
this is the common case.

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
  cycle, and `storageBodyAt(slotIndex)`. It imports nothing from generation — no catalogue, no probe,
  no design, no room — and it is written beside `leftover-rule.ts` for the reason that module exists.
  It is the **only declaration site** for `base-cabinet`, `base-3drawer` and `base-panbank` under
  `src/generation/`.
  **A second half of this leaf was planned and is withdrawn.** `upperBodyFor(baseRole)` was to move the
  wall row's choice out of the funnel; with D8's lift rule withdrawn the wall row's output is unchanged,
  so **moving the two constants would be a pure refactor buying nothing**, and the wave does not do it.
  `generate-kitchen.ts` keeps `WALL_CABINET_BUILD_ID` and `HOOD_BUILD_ID` exactly where they are.
- **`src/generation/generation-priorities.ts`** keeps the reading order, the cut, the spatial layout
  and the **core** role data. It calls `storageBodyAt` in place of today's `STORAGE_BUILD_ID`, builds
  the kitchen-wide storage sequence D5 defines, and — in S5 only — gains the dishwasher row and its
  place in the attempt ladder. **The preparation row reads `THREE_DRAWER_BASE_BUILD_ID` from the new
  leaf rather than writing the id again.** It gains no width literal and no ratio literal.
- **`src/generation/generate-kitchen.ts`** keeps the command funnel and, **in S1–S4, changes nothing at
  all** — the wall row's withdrawal (D8) removed this wave's only reason to touch it. In S5 it gains
  the dishwasher role in both `plan.bases` passes.
  **The funnel gains no new branch and no new refusal path** — an upper that cannot be placed is still
  logged *not placed* and still removes nothing below it (ADR 0110 Amendment C).
- **The split of authority, stated so criterion 20 is checkable:** the priorities table is the one
  authority for a **core role's own** body (it already is — `base-sink`, `base-hob-oven`,
  `fridge-free`), and `body-choice.ts` is the one authority for every body chosen **by position rather
  than by role data** — the storage cycle and the whole wall row. The two sets are disjoint, and
  `base-3drawer` belongs to the second even though the preparation role reads it.
- **`leftover-rule.ts`, `shell-design.ts`, `tall-end-rule.ts`, `insert-fit.ts`, `merge-empty-columns.ts`,
  the void engine, the validator, the catalogue and the price book are read-only to this wave.**
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
`src/commands/**`; `src/void-engine.ts`; `src/merge-empty-columns.ts`; `src/validate-design.ts`;
`src/room/**` — in particular `room-policy.ts` and `approved-room-policy.ts`, whose minimum kitchen
stays **sink and hob**; anything under `apps/web`. **7D3's own assertions must not be edited**, with
the single declared exception in criterion 16.

### Acceptance criteria

Each names its proof mechanism. *Property* means a `fast-check` property over the **approved** L policy
(wall A 900–6300, wall B 1000–5100, height 2200–3900, on a 1 mm grid) with a stated minimum sample
count **per arm**, per `docs/WORKFLOW.md`. Every criterion says what must not happen. **Criteria 1–15,
19, 20 and 21 belong to S1–S2 and S4. **Criteria 16–18 moved to wave 7D5 with the dishwasher (D11) and are left in place, numbered, so every reference still reads.** The witness table above supplies a
measured room for every slot count, and a property that never samples a room with four or more slots
proves nothing.

**Two things no criterion here may do, and both are rulings rather than style.** No criterion asserts
a **ratio band** for lifts or open shelves (R7, D8), and no criterion asserts that **no drawer stands
after the hob** (R6, D6). Each would turn a proportion or a majority case the owner stated in
conversation into a hard constraint. A QA or review agent who finds one has found a defect in the
tests, not in the composer.

1. *(unit — the wave's headline)* At **6300 × 4700 × 2600** the eight storage slots compose as
   **4 × `base-cabinet`, 2 × `base-3drawer`, 2 × `base-panbank`**, and at **6300 × 5100 × 2600** the
   same. **Must not:** eleven identical bodies; any run of two adjacent storage slots sharing a build
   id; a storage slot whose width is not 600.
2. *(property, ≥ 200 samples)* **Width neutrality — the wave's strongest invariant.** For every room,
   `plan.floorWidthsMm`, `plan.remainderMm`, `plan.dropped`, the chosen wall cut, and every planned
   base's `wall`, `startMm`, `endMm` and `widthMm` are **deep-equal to 7D3's** for the same room. The
   **only** difference in the whole plan is `buildId`, and only on storage slots and the preparation
   slot. **Must not:** any width, count, remainder, cut or dropped-list change **anywhere in the wave**
   — since D11 moved the dishwasher to 7D5 this criterion has **no exception and no asterisk**, which
   is the whole reason that ruling went the way it did.
3. *(property, ≥ 150 samples with ≥ 2 slots)* **Balance.** `|drawerBodies − doorBodies| ≤ 1` over the
   kitchen's storage slots; at an even count they are **equal**; at an odd count **drawers** carry the
   extra. **Must not:** a door majority at any count, on any room in the policy.
4. *(unit — the owner's own example)* At **5700 × 4100 × 2600** there are six storage slots and they
   compose **three drawer bodies and three door bodies**. **Must not:** the three-and-three arriving
   from a hardcoded six, a ratio constant or a `floor(n / 2)` count — criterion 20 is its guard.
5. *(property)* **Per-wall deviation is at most one body.** On each wall, the drawer count differs from
   half that wall's storage count by at most one. **Must not:** a wall composed entirely of one class
   while the other wall carries the balance.
6. *(property)* **Maximum variety, quantified.** The number of **distinct** storage build ids in a
   generated design is exactly `min(3, slotCount)`. **Must not:** a fourth body appearing; a kitchen
   with three or more slots showing fewer than three distinct bodies.
7. *(property)* **No two adjacent storage slots carry the same build id** — asserted **along the wall**
   (spatial order) as well as in the reading order, so wall B's reversal is exercised (G12).
   **Must not:** the assertion written only in reading order.
8. *(unit + property, the accepted awkward boundary)* **The cycle is per kitchen and the phase carries
   across the corner.** Where wall B's storage count is **even**, wall A's first storage slot is a
   **drawer** body; where **odd**, a **door** body. Witnesses **5700 × 4100** (even) and
   **5100 × 4700** (odd). **Must not:** a per-wall restart — it passes criteria 3 and 6 and fails this
   one, which is the only criterion that tells them apart.
9. *(property)* **Every generated base module is on the grid.** Every placed base's width equals its
   planned width, and no placed base is narrower than its opening (the centred-sliver case, G5).
   `base-bottle-cargo` appears in **no** generated design, at any room in the policy. **Must not:** a
   discrete-width row generated into a tile its set does not contain.
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
    criterion 15, restated because S5 adds a role to the same two `plan.bases` partitions — a role that
    falls through both is never inserted and its tile silently stays empty.)*
20. *(lint / grep in a test)* **One declaration site per build id, and no ratio constant.**
    `base-cabinet`, `base-3drawer` and `base-panbank` appear as literals in exactly one module under
    `src/generation/` (`body-choice.ts`); `base-dishwasher` in exactly one
    (`generation-priorities.ts`); `base-bottle-cargo` appears **nowhere** under `src/generation/`. No
    file under `src/generation/` encodes the balance as a percentage, a ratio or a halving — it is the
    cycle's shape. **Must not:** a generation-side width or price constant "kept in sync" with the
    catalogue; a percentage anywhere under `src/generation/` — neither the base row's half nor the wall
    row's 20–30 % nor the 5 % is a number this wave writes down.
21. *(property, ≥ 200 samples)* **The wall row is byte-identical to 7D3's, and it is asserted rather
    than composed** (D8). For every room: every upper's build id, opening, position and width are
    deep-equal to 7D3's; the hood stands over the hob; nothing stands over the fridge or over a
    full-height column (7D3 D5); an upper that cannot be placed is still logged *not placed* and still
    removes nothing below it. **And in no generated design, at any room in the policy, does a
    `wall-lift` or an `open-shelf` appear.** **Must not:** a `set_width` command logged for any upper;
    a lift reinstated without a new dated ruling — **this criterion is the guard on a rule that was
    written, built into this plan and withdrawn by the owner in one day**, and it exists so the next
    reader of D8's struck text does not re-add it.

*(Criteria 22–24 were the composed wall row's — `upperBodyFor`'s totality, the one lift above the
sink, and its measured share. **All three are withdrawn with D8's lift rule**, and the numbers are not
reused, so every reference above still reads.)*

### Slices, in dependency order — dispatched one at a time

The tree is frozen for QA and review between slices (`docs/WORKFLOW.md`); no two of these may be in
flight together.

- **S0 — the record. NOT WRITTEN.** ADR 0110 **Amendment F**: the owner's four statements verbatim;
  D1's grid rule and the merge measurement behind it; the cycle and why the ratio is not a constant;
  the per-kitchen sequence and its phase boundary; the preparation body as an amendment to A1's
  *interim data*, **with R6's softening recorded as a preference and the deleted criterion named**;
  D8's wall-row rule with R8's motion as its reason and R7's proportions recorded as guidance;
  **D10's priority and the owner's reasoning for it**; the dishwasher's position, drop order and
  threshold cost, with **Q-D1 and Q-D2 marked as open**; the bottle cargo's exclusion with ADR 0026's
  reason; G9's and G16's price figures, so the variety goal is a knowing choice; **R10's top-row lift
  rule with the stretch-ceiling reason stated first, recorded and not built**; and **D0's correction of
  the reason 7D4 was said to depend on 7D3**. Markdown only. **No other slice starts until it exists
  and is reviewed.**
- **S1 — the leaf, alone** (`body-choice.ts` + its unit tests). The cycle, `storageBodyAt`,
  `upperBodyFor`, and every build id both answers use. Criteria 3, 4, 6, 7 and 21 are provable against
  the leaf before anything calls it, and 20's grep runs here. **It changes no generated design**, which
  is why it goes first.
- **S2 — the storage sequence and the preparation body** (`generation-priorities.ts`). The kitchen-wide
  sequence of D5, `storagePriorities` reading the leaf, and the one-line preparation change. Criteria
  1, 2, 5, 8, 9, 10, 11, 13, 14 and 19. **This is the slice that removes the eleven.**
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

### Owner questions — three open, three answered, each with a recommendation

**Q-D1 — which side of the sink does the dishwasher stand on? PENDING FOR 7D5, and deliberately NOT
resolved here** (D11). It blocks nothing in 7D4, and it is to be **put to the owner when 7D5 is
planned rather than inferred now while inferring is cheap**. Both readings, kept whole:

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
- **What it owes the owner first: Q-D1**, which side of the sink, deliberately left open (D11).
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
- **Recommendation: a new ADR (next free number), with pointers from ADR 0110 Amendment F and
  ADR 0109.** **Not written** — the coordinator asked to be told before an ADR file is touched, and
  this is the telling.

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
