# M7 — Screen 1: room shape, dimensions, presets, bespoke fallback

> **STATUS: PLANNED.** Depends on M6. Summary: `docs/STATUS.md`.
>
> **Revised 2026-09-11 by the architect, on branch `m7-room-and-presets` from `main` at `995ad03`**
> (M6 and M6B have both shipped; M6B merged as PR #8). The sections written before M6/M6B are kept;
> what the code has since made stale is struck in place and dated. **New, below the original plan:**
> *Where the code stands*, the *Decision-record sweep*, the *Wave plan* and the dispatchable **7A**
> punch list. Engineering decisions are ADRs 0108–0111. **Wave 7A can be dispatched now; no owner
> answer blocks it.**

Status: planned. Depends on M6.
Reference: mockup frames 1A, 1B, 1C, 1D, 1E, 1F and D1A–D1F; `DEVELOPMENT-SPEC.md` §10, §13.3 q4/q5;
`ARCHITECTURE_PROPOSAL.md` §5.2, §8.

## Owner questions for M7

Asked 2026-09-11. Answer in plain words — *"yes to the recommendation"* is a complete answer.
**Nothing here blocks the first waves**: every question has an interim the build runs on, marked
unapproved in the code, and the wave table says which wave, if any, waits for which answer.

**Q1 — Room size limits.** What are the shortest and the longest wall the product should accept, and
the lowest and the highest ceiling?

- *Recommended:* shortest wall **900 mm** on either wall of an L-shaped room — the corner cabinet alone
  reaches 900 mm along both walls, so a shorter wall cannot hold it. Longest **6300 mm** for the back
  wall (A) and **5100 mm** for the side wall (B) — the most a saved design can hold today; longer is
  possible, as a deliberate storage change. Lowest ceiling **2200 mm** — the upper-cabinet row ends
  there, so any lower and a kitchen has no upper cabinets (below 2600 mm the top row is simply left
  out). Highest ceiling **3900 mm**; the cabinets stop at 2600 mm whatever the ceiling.
- *Until you answer:* the screen uses the engine's own limits — walls 900 to 6300 / 5100, ceiling
  860 to 3900 — marked unapproved in the code (ADR 0108). No wave waits; M7 cannot close on them.

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
  stretch become empty space the customer can fill in the editor? *Recommended:* yes; stretches under
  300 mm stay invisible, as today.
- *Until you answer:* a preset is listed only if it fits unchanged, ordered as in (c), and a leftover
  stretch is bare wall. **Blocks wave 7C only.**

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

**Q4 — Which presets should exist?** The mockups' four (*Ozun clasic*, *Nistru compact*, *Codru
insulă*, *Buștean deschis*) with their counts and prices are illustrations: nothing defines them, and
*Codru insulă* has an island, which the product cannot draw.

- *Recommended:* M7 ships with the reference kitchen as the only real preset. You send further
  presets as a list of cabinets per wall plus a material, a colour and a name; each is added as data,
  with no code. With one preset, most rooms will get a composed kitchen instead.
- Blocks no wave; it decides how useful the preset list is to a real customer.

**Q5 — Straight (linear) and U-shaped rooms.** The plan refuses both, but the mockups themselves offer
*"alege o formă liniară"* as the fix for a too-short wall (1C, and D1C's *"Treci la formă liniară pe
peretele A"*) and show a straight 2.00 m room being composed (1F/D1F).

- *Recommended:* allow straight kitchens **through composition only** (one wall; no straight presets
  until you supply one) — the engine already builds one wall. Keep U refused, with a plain reason.
- *If no:* the *"choose a linear shape"* suggestion is removed from the too-short-wall message.
- *Until you answer:* both are refused, and the message does not suggest a linear shape. **Blocks
  wave 7J** and the final wording of 1C/D1C.

**Q6 — "Încotro merge cotul? — La dreapta."** When a customer chooses a corner on the right, should
their 3D kitchen be the **mirror image** of the left-hand one — the same cabinets, the long run still
on the back wall, the corner moved to the right?

- *Recommended:* yes. The alternatives are refusing *right* (half of all L rooms) or drawing it as a
  left corner, which shows the customer a room they do not have.
- *Until you answer:* the toggle mirrors the 2D plan only and the editor draws a left corner — a named
  interim. **Blocks wave 7I.**

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

**Q8 — New wording.** Step 1 adds new Romanian sentences. Do you want to review them once, when the
screen is built, the way you did Gate O1?

- *Recommended:* yes — one sitting at the end of the screen work. Mockup wording is used as written;
  only what the mockups lack is drafted (the refusal for U, the loading and error states, the
  composed-kitchen step labels). The Russian is drafted after your Romanian edits and you check it
  last, as at Gate O2.
- Blocks M7's close, not any wave.

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

Out: the editor (M1–M6); linear and U-shape **layout** logic, which stays out of scope until product
supplies a recipe and per-wall band data.

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
3. If Q2(d) is *yes*: a remainder of 300 mm or more is recorded as empty columns split at 800 mm, the
   design still has zero findings, and a remainder under 300 mm publishes no opening (ADR 0015).

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
4. `/` redirects to `/[locale]/configurator/room` (interim, Q7); `/configurator/configure` is
   unchanged and all 34 e2e navigations to it stay green.

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
   stays reachable at its link. The load-error start-over leads to Step 1. A demo design's first
   successful save replaces the URL with `/d/{id}` without a reload (interim, Q7).
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
  internal reason. Until Q5, no message suggests the linear shape.
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

**7G — thumbnails.** Every recipe has exactly one thumbnail, rendered from its own instantiated design
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
   kitchen's structural corner placements on each wall (900 on both today); the maxima from
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
