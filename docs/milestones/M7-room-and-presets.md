# M7 — Screen 1: room shape, dimensions, presets, bespoke fallback

> **STATUS: IN PROGRESS.** Depends on M6 (shipped). Summary: `docs/STATUS.md`. **Wave 7A shipped
> 2026-09-11 at `8df0d49`**, ~~next wave 7D1~~ **wave 7D1 shipped at `f5b4cd9`** — both on branch
> `m7-room-and-presets`; their close-outs are below. F1–F7 are all answered and M7B is confirmed by
> the owner. **Next wave: 7D1b.**
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
below. **Nothing in M7 is blocked on the owner any more.** F7 was asked afterwards by the coordinator.

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
| **7E1** | `/configurator/room` route, URL state, proxy allow-list, `/` → Step 1 | `apps/web/src/proxy.ts`, `app/[locale]/configurator/room/page.tsx`, `src/room/room-url-state.ts`, `app/[locale]/page.tsx` | 7A | **Full** (every route) | Unstyled only | Q7 interim |
| **7E2** | Create the design (mint, then an awaited `PUT`), `/d/{id}` only after the write, editor back links, start-over, demo URL after first save | `src/room/create-design.ts`, `app/configurator/configure/configure-screen.tsx`, `app/d/[id]/design-load-error.tsx`, `src/store/configurator-store.ts` | 7B, 7E1 | **Full + security** | Light check | Q7 interim |
| **7F1** | 1A shape cards; 1B fields, corner toggle, live 2D plan | `src/room/room-screen.tsx`, `shape-picker.tsx`, `dimensions-form.tsx`, `plan-preview.tsx`, `room.module.css` (+ `messages/ro.json`, `ru.json`) | 7A, 7E1 | Light | **Yes** | Q8 at close |
| **7F2** | 1C validation state, shape refusal, the wall marked red | `dimensions-form.tsx`, `plan-preview.tsx`, `src/room/room-issue-copy.ts` (+ messages) | 7F1 | Light | **Yes** | Q5 interim |
| **7F3** | 1D skeletons; 1E list and cards — counts by band, finish summary, starting price, **Folosește** | `src/room/preset-list.tsx`, `preset-card.tsx`, `preset-card-model.ts`, `room.module.css` (+ messages) | 7B, 7E2, 7F1 | Light | **Yes** | — |
| **7F4** | 1F composition steps, struck *nu încape*, straight into the editor | `src/room/generation-steps.tsx`, `generation-model.ts`, `use-generation.ts`, `room.module.css` (+ messages) | 7D2, 7E2, 7F1 | **Full** (kit lifetime) | **Yes** | — |
| **7G** | Preset thumbnails from the recipe; in-repo rig; recipe fingerprints | `app/internal/scene-shot/shot-request.ts`, `scene-shot.tsx`, `apps/web/scripts/capture-preset-thumbnails.mjs`, `src/room/preset-thumbnails.ts` (+ `public/presets/*.png`) | 7B, 7F3 | Light | Capture | Q4 (which recipes) |
| **7H** | The 3D room follows the design's room: shell planes and camera framing | `three-adapter/src/kitchen-shell.ts`, `three-adapter/src/stage.ts`, `apps/web/src/scene/kitchen-stage.tsx`, `apps/web/src/scene/scene-view.ts` | 7E2 | **Full** (3D, fidelity gate) | **Yes**, and desktop | — |
| **7I** | Corner to the right: the mirrored kitchen | `configurator-domain/src/design.ts` (optional `room.cornerDirection`), the adapter's scene root, `plan-preview.tsx`, `stage.ts` | 7H | **Full** | **Yes** | **blocked on Q6** |
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

- **Anchor:** the corner (0, 0, 0), where wall A's plane (z = 0, fronts +Z) meets wall B's (x = 0,
  fronts +X) — `room-transforms.ts:34-49`. No body moves.
- **Scaling rule:** only the shell's floor, its two wall planes and the wall-A backsplash change
  extent. No body, appliance, sink, handle or chamfer scales.
- **Structural dependencies:** the run-end panel keeps following the records (ADR 0045), not the
  shell; the backsplash's relation to the base run is measured before it is changed.
- **Criteria:** at the seeded room every shell child is byte-identical to today's and the M1 fidelity
  gate passes **without a re-baseline**; for every sampled room inside the policy, every placement's
  along-wall extent lies inside its wall's drawn plane and every body's top is at or under the drawn
  height. Camera presets become a function of the room that returns `CAMERA_PRESETS` exactly at the
  seeded room; §11 row 21 holds for sampled rooms **by capture at 390 × 844**, not by projection
  alone; backlog 16's fit-to-run framing on *Perete A* lands here.

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
| **7D1b** | The run-end panel veto at wall A's end (ADR 0045 Amendment A); B3a's reserve removed | `run-end-panel.ts`, `three-adapter/src/kitchen-shell.ts`, `three-adapter/src/scene-sync.ts`, `apps/web/src/scene/kitchen-stage.tsx`, `src/generation/shell-design.ts` | 7D1 | Full | **Yes** | answered (backlog 64 ruling) |
| **7D2** | Composition in the owner's order; minimum kitchen; leftover rule; step log; **the row plan and the shell tiled at its boundaries (R1.1)** | `src/generation/generate-kitchen.ts`, `src/generation/generation-priorities.ts`, `src/generation/leftover-rule.ts`, `src/generation/shell-design.ts` (the plan argument), `src/index.ts` | 7D1 | Full | No | answered (F2, F3, F7) |
| **7E1** | `/configurator/room`, URL state, proxy, `/` → Step 1 | *carried* | 7A | Full | Unstyled | — |
| **7E2** | Create the design; `/d/{id}` only after the write; back links | *carried*, minus the demo-URL item | 7E1 | Full + security | Light | — |
| **7F1** | 1A shape cards; 1B fields, toggle, live plan | *carried* | 7A, 7E1 | Light | **Yes** | — |
| **7F4** | 1F composition steps into the editor | *carried*, plus *minimum not met* → 1C | 7D2, 7E2, 7F1 | Full (kit) | **Yes** | — |
| **7P1** | The preset store: migration, record schema, repository, read path, backup export | `persistence/src/migrations/0005_create_presets.sql`, `persistence/src/preset-repository.ts`, `configurator-domain/src/presets/preset-record.ts`, `apps/web/src/lib/server/backup-designs.ts` | 7A | Full + security | No | — |
| **7P2** | Authoring gate, save endpoint, editor button | `apps/web/src/lib/server/preset-authoring.ts`, `app/api/preset-authoring/session/route.ts`, `app/api/presets/route.ts`, `src/panel/save-as-preset.tsx`, `app/[locale]/d/[id]/page.tsx` | 7P1, 7E2 | Full + security | **Yes** (owner surface) | — |
| **7G** | Thumbnail captured at save, stored, served | `src/panel/capture-preset-thumbnail.ts`, `app/api/presets/[id]/thumbnail/route.ts`, `preset-repository.ts` | 7P2 | Full + security (upload) | Capture | — |
| **7B** | Preset matching: ±600 window, fit, availability, one evaluation | *carried* files; revised criteria below | 7A | Full | No | — |
| **7C** | Preset adaptation from the free ends and **below a low ceiling**; leftover rule; declared changes | `src/presets/adapt-preset.ts`, `src/presets/evaluate-preset.ts`, `src/index.ts` | 7B, 7D2 | Full | No | answered (F4, F7) |
| **7A2** | The coupled room rule: the room must hold a sink and a hob (`ROOM_TOO_SMALL_FOR_KITCHEN`), tied to the generator by a property | `src/room/room-policy.ts`, `src/room/approved-room-policy.ts`, `src/room/validate-room.ts` | 7D2 | Full | No | answered (F6) |
| **7F2** | 1C validation state, incl. *minimum not met* | *carried*, plus the room-level reason | 7F1, 7D2 | Light | **Yes** | — |
| **7F3** | 1D skeletons; 1E list from the library, with declared changes | *carried*, reading 7P1 | 7C, 7E2, 7F1, 7P1 | Light | **Yes** | — |
| **7E4** | e2e and tooling off `/configurator/configure` | `apps/web/tests/e2e/*`, `playwright.config.ts`, `scripts/capture-fidelity.mjs` | — | Light (tests; CI is the verdict) | No | — |
| ~~**7E3**~~ | ~~Returning visitor: pointer cookie~~ — **split 2026-09-11 into 7E3a and 7E3b (ADR 0114)** | | | | | |
| **7E3a** | Visitor identity: the `__Host-` secret cookie, the visitor-hash column and its migration, mint linking, server-side resume; editor only at `/d/{id}` | `persistence/src/migrations/0006_add_design_visitor_hash.sql`, `persistence/src/neon-configuration-repository.ts`, `apps/web/src/lib/server/visitor.ts`, `app/api/designs/route.ts`, `app/[locale]/page.tsx` (+ `configurator/configure/page.tsx`) | 7E2, 7E4 | **Full + security** | Light | — |
| **7E3c** | The private share link: create, revoke, re-issue; `/[locale]/s/{token}` read-only view (ADR 0114 Amendment B) | `persistence/src/migrations/00NN_create_design_share_links.sql`, `persistence/src/share-link-repository.ts`, `app/api/designs/[id]/share/route.ts`, `app/[locale]/s/[token]/page.tsx`, `src/panel/share-design.tsx` (+ `proxy.ts` allow-list) | 7E3a | **Full + security** | **Yes** | answered (F5 final, ADR 0114 C, ADR 0115) |
| **7E3b** | A design opens only in its owning browser; ~~the read-only share view retired~~ **the read-only view moves to the share link** | `app/[locale]/d/[id]/page.tsx`, `app/api/designs/[id]/route.ts`, `app/d/[id]/design-load-error.tsx`, `lib/server/visitor.ts` | 7E3a, **7E3c** | **Full + security** | Light | answered (F5 final, ADR 0115) — **off hold** |
| **7H** | The 3D room follows the entered room | *carried* | 7E2 | Full | **Yes** + desktop | — |
| **7I** | Mirrored right-hand L; a mirror that works on one group | *carried*, plus the per-group primitive | 7H | Full | **Yes** | answered (Q6) |
| **7J** | Straight kitchens through composition | `room/approved-room-policy.ts` (the linear bounds), `generation/shell-design.ts`, `room/validate-room.ts` | 7D2, 7F2 | Full | **Yes** | answered (F1) — unblocked |
| **7K** | The mobile gate | `apps/web/tests/e2e/*` | all UI waves, 7E3a, 7E3c, 7E3b | Light (tests) | **Yes — the phase gate** | — |
| **7L** | The desktop line | *carried* | 7F1–7F4 | Light | Desktop | — |
| ~~**Gate M7-C**~~ | ~~Owner copy review~~ — **withdrawn by ADR 0113** | | | | | |

**Recommended order, and why.** The owner's own process — *choose the room, generate, adjust, save* —
is the critical path, because matching is useless until the library has presets: **7A → 7D1 → 7D2 →
7E1 → 7E2 → 7F1 → 7F4 → 7P1 → 7P2 → 7G**, then 7B → 7C → 7F2 → 7F3 for matching, ~~with 7E4 → 7E3, 7H,
7I and 7J fitted in where the tree is free~~ **then 7A2 once 7D2 exists, with 7E4 → 7E3a (→ 7E3b on
F5), 7H, 7I and 7J fitted in where the tree is free** (corrected 2026-09-11; **and again the same day:
7E4 → 7E3a → 7E3c → 7E3b** — the share path lands before the open read closes).

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

~~**Next dispatchable wave after 7A: 7D1**~~ — **7D1 shipped at `f5b4cd9`. Next dispatchable wave:
7D1b** (the run-end panel veto, backlog 64 / ADR 0045 Amendment A) — its punch list follows the
revised criteria.

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
    and the hob are never dropped.
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
      kitchen, D3 widths (sink 600, preparation 600, hob-with-oven 600, `fridge-free` 700, storage 600),
      leftover rule, wall B's reserve — as pure arithmetic that writes no placement.
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

**7A2 — the coupled room rule** (ADR 0108 Amendments C and D — **owner-ruled 2026-09-11, F6 "Must
hold sink + hob"**; dispatched after 7D2)

1. `validateRoomInput` gains one code, `ROOM_TOO_SMALL_FOR_KITCHEN`, on a room-level field, with no
   number; the per-field codes are unchanged and are reported first, so a room with a bad wall never
   also reports the coupled rule.
2. The widths it uses — the sink's floor, the hob's width and each wall's corner reach at every
   declared depth — come in through the policy, derived in the engine's limits from the catalogue and
   Amendment A's corner edges; the validator still imports types only.
3. *Property* over the approved L range, at least 100 samples in each arm: the rule passes **if and
   only if** `generateKitchen` places a sink and a hob in that room. Must not: a validator and a
   generator that disagree on any sampled room.
4. Boundary rows from Amendment C's table: with wall A at 900, wall B 2159 fails and 2160 passes;
   with wall B at 1000, wall A 2059 fails and 2060 passes; wall B 1560 with wall A 1500 passes.
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

**7F2 (add):** *minimum not met* is shown at 1C with a room-level reason, no digit and no code, and no
wall marked red.

**7F3 (add):** the list reads the library (7P1); a card shows every declared change per wall.

**7K (add):** a returning visitor opening `/` lands on their design; opening `/configurator/configure`
never shows an editor; no customer journey can reach the save-as-preset control.

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
