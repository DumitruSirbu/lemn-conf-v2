# ADR 0120 — The room is a fact and the kitchen adapts to it; coverage is negotiable where the room's dimensions are not

Status: Accepted (owner ruling, 2026-09-15, verbatim; the audit, the classification of each site and
the sequencing recommendation are the architect's. **Overturns nothing on its own** — it states a
principle and finds one place where the shipped product sits against it, and that place is routed
back to the owner rather than changed here, because the alternative it points at was already refused
by an owner ruling: [ADR 0036](0036-a-declared-dimension-is-the-finished-cabinet.md) decision 5, via
[ADR 0108](0108-a-room-is-validated-against-policy-data-and-the-interim-policy-is-the-engines-own-limits.md)
Amendment A.)
Date: 2026-09-15
Type: Decision (owner ruling) + Finding (audit)
Milestone: M7 — binds wave **7F2**'s copy immediately; opens one owner question batch. Cross-cutting
on every later room, generation and preset wave.

**Amended the same day by [Amendment A](#amendment-a--2026-09-15-every-cabinet-is-custom-made-corners-included-and-that-is-the-other-half-of-this-record), a second owner ruling: every cabinet is custom made, corners
included.** It does not disturb the principle or any finding — it **removes the constraint that made
F1's padding look unavoidable**, and it changes decision 5's first question and the sequencing
recommendation. Read both; the record is incomplete without the amendment.

**Every citation in this record was read at HEAD `128e515` on 2026-09-15** (ADR
[0119](0119-a-remembered-fact-about-this-repository-is-a-claim-to-recheck-and-true-at-head-is-not-true-at-the-end-of-the-milestone.md)
decision 4). Line numbers in this repository drift daily; the file-and-symbol pairs are the durable
part of each reference.

**One cited file carried an uncommitted change while this audit ran, and it is named rather than
glossed** (ADR 0119 decision 5): `generation/generate-kitchen.ts` has a working-tree edit for ADR
0110 Amendment E7 (`risesIntoWallRow`). It does not touch either region cited below — both refusal
arms are byte-identical at `128e515`, checked against `git show HEAD:` rather than against the tree.
Every other file cited here is clean against `128e515`.

## The ruling, verbatim

Owner, 2026-09-15, by voice:

> *"If a user inserts that the wall has 900 millimeters, you can propose something that go over 900.
> It will not break a wall to make it larger. We need to adapt. We need to find a solution to adapt.
> Or we drop a cabinet, or we resize a cabinet, or we do something with cabinets, but we can resize
> the room. This is the most important thing. If the user insert, I understand when it inserts like
> large wall, like big wall, like more than five or six meters. And in this case, you can say that
> Okay, 100 millimeters you can drop, but when you have 900, this is critical minimum, you can say,
> oh, we need another 100 millimeters. He will not get this 100 millimeters from nowhere."*

### A transcription note, because a later reader will otherwise quote the wrong clause

**The words *"but we can resize the room"* are a transcription artefact and mean *"but we can**not**
resize the room."*** The owner speaks by voice and the transcript drops the negation.

This is not a reading imposed on the passage — the passage argues for it on both sides of the clause.
The sentence before it lists what *may* be adapted (*"we drop a cabinet, or we resize a cabinet, or
we do something with cabinets"*) as an exhaustive alternative to touching the room; the closing
sentence settles it outright: *"he will not get this 100 millimetres from nowhere."* Taken literally,
the clause would say the product may enlarge a customer's wall, which is precisely what the whole
passage forbids and what [ADR 0083](0083-wall-coverage-is-the-runs-extent-and-the-finished-end-is-part-of-it.md)
decision 2 already refused ten days earlier.

**Recorded here so nobody quotes the literal clause as licence.** The same hazard has a precedent in
this repository: ADR 0108 Amendment C carries an owner sentence verbatim from speech (*"ideallu
2000mm"*) and then states plainly where the transcribed numbers and the geometry disagree, rather
than smoothing either.

## The principle

**The room is a fact. The kitchen adapts to it.**

The product may drop a cabinet, resize a cabinet, or leave a run short. It may **never require a wall
the customer does not have.** The owner marks this *"the most important thing."*

### Coverage is negotiable; the room's dimensions are not

The second half of the ruling is a real distinction and not a softening of the first.

- On a 5–6 m wall, losing 100 mm of **coverage** — a run that stops short, a bare stretch of wall — is
  acceptable adaptation. This is already the product's settled position:
  [ADR 0067](0067-leftover-wall-is-the-normal-case-and-the-price-is-a-floor.md) rules leftover wall the
  normal case, and ADR 0110 Amendment A4 caps what the product *proposes* to leave at 599 mm.
- Demanding 100 mm **more wall** from a customer who entered 900 is not adaptation at all. It is the
  product asking for something that does not exist.

**So the two halves are about different quantities.** The first is the kitchen's extent, which the
product controls and may shrink. The second is the room's dimension, which the customer measured and
neither party can change. A rule that trades the second to protect the first has the direction
backwards.

### What the ruling does **not** say

**It does not say "never refuse."** A genuine physical floor is legitimate and survives this record
untouched. [ADR 0110](0110-generation-inserts-through-the-command-path-and-the-corner-is-structural-data.md)
Amendment A2 rules the minimum kitchen is **a sink and a hob** — the owner's own words, *"a kitchen
minimum should have sink and hub"* — and ADR 0108 Amendment D confirms it as ruled rather than
interim. A 400 mm wall holds neither, and saying so is honest, not a failure to adapt.

**The ruling is about two specific failures**, and a site is only in breach if it commits one:

1. **Padding** — a floor sized by the worst case over a choice the customer has not yet made, applied
   to every customer including those who will never make that choice.
2. **Refusing where adapting was available** — declining a room the product could have served by
   dropping, resizing, or covering less.

## The audit

Every site in the product that can require a room to be larger (or smaller) rather than adapting,
read at `128e515`. Each is judged on the brief's three questions: **(1)** genuine physical floor or
convenience; **(2)** if a floor, the tightest true floor or padded; **(3)** what the customer sees,
and whether it asks for millimetres they cannot produce.

| # | Site | (1) Floor or convenience | (2) Tightest? | (3) What the customer sees | Verdict |
| --- | --- | --- | --- | --- | --- |
| **F1** | `packages/configurator-domain/src/room/approved-room-policy.ts` — `APPROVED_L_WALL_B_MIN_MM = 1000`, mirrored by `ENGINE_ROOM_LIMITS`' `farthestCornerEdgeMm("B")` in `room/room-policy.ts` | A **floor at one of two depths**. The structural corner's base return `p26` ends at 900 mm along wall B at a 600 mm cabinet depth and at **1000 mm at 700**. Below its own reach a wall cannot hold its own corner, and the corner is structural (ADR 0021) — no delete, no resize. | **No — padded**, by a worst case over `declaredCabinetDepthsMm()`. A customer at 600 mm with wall B in **900–999** is refused for a reach that only occurs at a depth they have not chosen and may never choose. | Today: **nothing** (see F5). From wave 7F2: a reason beside wall B. | **In breach of failure mode 1 — with a real reason.** See *Is this a wrong number or a sequencing problem?* below; it is the second, and the fix is not in this file. |
| **F2** | `generation/shell-design.ts` `slideReserveMm` / `plannedEndMm` — wall B's generated run stops short of the wall by the largest chain shift over every declared depth (100 mm) | Neither. It is **coverage**, spent to keep a proposal valid after a later depth change. | Also worst-case, deliberately — the head comment says so: *"a proposal must still fit after the customer changes the depth."* | A wall B 100 mm barer than it needs to be at 600 mm depth. Nothing is asked of the customer. | **Correct under the ruling, and the finding of this audit.** Coverage is negotiable — but it is **the second half of F1's 1000**: `floorRunStartMm("B")` is 900 and this reserve is the other 100, so relaxing F1 alone changes nothing a customer can see. Stated as a binding rule at *[The paired invariant](#the-paired-invariant--the-corner-reach-and-the-reserve-move-together-or-nothing-moves)*, which is the section to read before touching either number. |
| **F3** | `room/validate-room.ts` `holdsMinimumKitchen` + the coupled `ROOM_TOO_SMALL_FOR_KITCHEN` refusal, over `APPROVED_ROOM_POLICY.minimumKitchen` (600 sink, 600 hob, reaches 900 / 1000) | **A genuine floor**, and owner-ruled twice: ADR 0110 A2 and ADR 0108 Amendment D's *"Must hold sink + hob"*. | Tightest for a **generated** kitchen. Its 600 mm sink is the generated target (ADR 0110 D3) rather than the catalogue's 560 mm manual floor — an owner-ruled product choice, not padding (ADR 0108 Amendment E). **But F1's pad propagates into it**: `freeB = wallB − 1000`, so every wall-B threshold in Amendment E's boundary table is 100 mm higher than a 600 mm-depth room needs. | A room-level refusal carrying **no number** (ADR 0108 decision 3) — and today nothing at all (F5). | **Legitimate floor, padded on wall B by F1 and only by F1.** No change owed here; it moves if and only if F1 moves. |
| **F4** | `generation/generate-kitchen.ts` — `MINIMUM_NOT_MET`, both arms (`if (!args.plan.minimumMet)` and the `hasMinimum` re-check after composition) | **A genuine floor**, the same one as F3, as backstop. It refuses to *produce a design*; it asks the customer for nothing. | Yes. And the machinery around it **is the ruling already implemented**: `planKitchenComposition`'s three attempts drop the fridge, then the preparation cabinet, before giving up, and `planLeftover` leaves up to 599 mm bare rather than demanding wall. That is *"we drop a cabinet… or we do something with cabinets."* | The first arm is **unreachable from Step 1** — ADR 0108 Amendment C rule 3 ties the validator to the generator by property, so 1C catches the room first. | **Exemplary under the ruling.** No change. |
| **F5** | `apps/web/src/room/room-screen.tsx` `canContinueFrom` — reads shape buildability and field completeness only, never `validateRoomInput` | Not a size rule at all. | — | **Nothing.** A 1C room leaves *Continuă* enabled; the tap runs `departTo("presets")`, `roomInDraft` returns `undefined` because the parse resolves to 1C, `run.compose` is never called, the phase stays `idle`, and the same form is redrawn. The customer is refused **without a sentence**. | **Known and scheduled, not a new defect.** The 1C sentence is wave **7F2**'s by prior ruling (M7 plan; `use-generation.ts`' `HandoffStatus` comment cites R16 for it). **This record binds that copy** — see decision 3. |
| **F6** | `approved-room-policy.ts` — the **maxima**, wall A 6300 and wall B 5100, derived in `ENGINE_ROOM_LIMITS` from `design-bounds.ts`' `MAX_ROOM_WIDTH_MM` / `MAX_ROOM_DEPTH_MM` | **A convenience.** Those constants are the three-adapter scene shell (4200 × 3400) times a `ROOM_HEADROOM_FACTOR` of 1.5, and `design-bounds.ts` says outright they are *"limits on what a document may say, not product rules."* | Not a floor, so the question does not apply — but it is the **mirror image of failure mode 2**: the product refuses a room for being too *large*, where covering part of it and leaving the rest bare was available and is already the ruled normal case (ADR 0067). | `WALL_TOO_LONG`. A customer whose side wall is 5.2 m — inside the owner's own *"more than five or six meters"* band — cannot enter their room at all. | **In breach of failure mode 2, and owner-approved *as a storage bound*, never as a product one.** Full citation chain and what actually binds at *[F6 in full](#f6-in-full--the-maxima-refuse-a-room-for-a-rendering-limit-and-the-limit-is-ending-inside-this-milestone)*: nothing about kitchens binds it, the headroom factor's stated premise is already false, and **wave 7H ends the rendering basis inside this milestone.** |
| **F7** | `apps/web/src/settings/global-settings-model.ts` `offeredCabinetDepthsMm` — offers every declared depth, filtered only by ADR 0059's dishwasher floor; **the design's room is never consulted** | Not a refusal. It is **the seam where F1's pad could be repaid**, and its own comment already names the principle: *"never offer what cannot be satisfied."* | — | Both depths offered in every room, including rooms where the deeper one would push a structural corner past a wall. | **Not a defect today** — F1's pad is exactly what makes the offer safe. It is listed because any fix to F1 lands here. |

### Is F1 a wrong number or a sequencing problem? It is a sequencing problem

The brief asked this to be settled before anything is built on it, and the two have completely
different fixes. **The room is validated before any depth is known.**

- `validate-room.ts`' head comment states it as a contract: *"it reads no cabinet depth (ADR 0083
  decision 2)."* The depth enters only the **derivation** of a constant, at module load, over the
  declared set — ADR 0108 Amendment A rule 3 says so in those words.
- The depth is a **design** setting chosen later, in *Setări globale*, through `setCabinetDepth`
  (wave 6J-b). At Step 1 there is no design and therefore no depth.
- Changing it is ruled to **succeed and adapt**, never to be confirmed or refused: ADR 0036 decision
  5, the owner's own *"automatically, we will make them deeper."* A body that no longer fits is
  **marked, not moved** ([ADR 0065](0065-a-body-past-the-end-of-its-wall-is-marked-not-moved.md)) —
  and a structural corner cannot be deleted or resized, so no cabinet edit clears that mark.

So 1000 is not a number somebody invented. It is the price of a guarantee: *every depth the product
offers stays usable in every room the product accepts.* ADR 0108 Amendment A measured the
alternative and found it real — a 900 × 900 L validated, `setCabinetDepth(700)` succeeded, and
`p21`, `p26` and `p9` were all marked past the wall, permanently.

**What the ruling changes is not the arithmetic but who pays.** Today the customer pays 100 mm of
wall they do not have, so that a setting they have not chosen stays available. The owner's ruling
says the kitchen adapts and the room does not — which puts the payment on the **depth offer**, not on
the wall.

**And that alternative was already refused.** ADR 0108 Amendment A, *Alternatives considered*:

> **Refuse 700 for rooms between 900 and 999.** Rejected: refusing the depth change is ruled out by
> ADR 0036 decision 5, and it would be a second rule where one bound suffices.

**This record does not overturn that**, and says so in the open rather than quietly reversing it.
Two reasons:

1. **ADR 0036 decision 5 is an owner ruling**, and Amendment A's rejection rests on it. One owner
   ruling does not silently retire another. There is a distinction available, and ~~it is thin enough
   that it must be the owner's to draw~~ — **struck: the distinction is sharper than this record
   first credited, and is stated properly at *How the two rulings retire this tension* below.** *Not
   offering* a depth never presents an option that cannot work; *refusing a change the customer made*
   takes something away after the fact. §9's *never offer what cannot be satisfied* is the first and
   ADR 0036 decision 5 forbids only the second. **The two were never the same act.**
2. **The wall-B minimum is owner-approved product data.** ADR 0108 Amendment B decision B1 makes the
   six bounds literals precisely so an engineering change cannot move a customer-facing number
   without the owner. Moving 1000 to 900 is a product change; the mechanism exists to force it back
   to the owner, and it should work as designed.

## F6 in full — the maxima refuse a room for a rendering limit, and the limit is ending inside this milestone

*(Expanded at the coordinator's request. The citation chain, then what actually binds.)*

**The chain, every link read at `128e515`:**

1. **`packages/three-adapter/src/kitchen-parts.ts`, `buildKitchen()`** — `const RW = 4.2, RD = 3.4,
   WH = 2.6`. The floor and both wall planes are built from those three literals. **The builder takes
   no room argument.**
2. **`apps/web/src/scene/kitchen-stage.tsx`** — `makeKit({ cabinetDepthMm, wallDepthMm })` then
   `buildKitchenShell(kit)`. The kit is parameterised on **depth only**. The stage does read
   `state.design.room`, but its own comment says what for: the run-end panel's wall-end veto (ADR
   0045 Amendment A). **The shell never sees it.**
3. **`packages/configurator-domain/src/design-bounds.ts`** — `SCENE_SHELL_WIDTH_MM = 4200`,
   `SCENE_SHELL_DEPTH_MM = 3400`, restated from the adapter rather than imported (*"the domain is
   I/O-free and `three-adapter` depends on **it**, never the reverse"*), times
   `ROOM_HEADROOM_FACTOR = 1.5` → `MAX_ROOM_WIDTH_MM = 6300`, `MAX_ROOM_DEPTH_MM = 5100`.
4. **`room/room-policy.ts`** — `ENGINE_ROOM_LIMITS` takes `wallA.maxMm: MAX_ROOM_WIDTH_MM`,
   `wallB.maxMm: MAX_ROOM_DEPTH_MM`.
5. **`room/approved-room-policy.ts`** — 6300 / 5100 as approved literals, held at or below the engine
   maxima by ADR 0108 decision 7 and Amendment B's guard test.
6. **`room/validate-room.ts`**, `judgeField` — over the maximum, `WALL_TOO_LONG`.

**So a customer with a 5.5 m side wall is refused by a number whose only justification is a
`PlaneGeometry` call.** `design-bounds.ts`' own head comment says these are *"limits on what a
**document** may say, not product rules"*, and no owner has ever been shown 6300 / 5100 as an answer
to *"how long a wall will you serve?"* — Amendment B put them to the owner as **storage** bounds, and
that is what they were approved as.

### The headroom factor's stated premise is already false, and a scheduled wave finishes it off

`ROOM_HEADROOM_FACTOR`'s comment gives its own reason: *"§13.3 question 4 records that `LEVELS` and
both wall planes are constants for this one room, so **in practice every room is the shipped one** —
sized so a room a little larger than it still loads."*

**That premise died when M7 began shipping customer-entered rooms**, and the owner has put a number
on it: they expect an entered room to match the mock's dimensions in roughly **1 %** of cases. The
1.5× slack was sized for a world where a room was a fixture with a little give, and the product no
longer lives there.

**And the rendering basis is ending inside this same milestone.** Wave **7H** — *"the 3D room follows
the design's room: shell planes and camera framing"* — is planned, pending, and its owner question is
already ruled: **Q7H-1, ruled (a): the drawn wall is the entered wall.** After 7H the shell follows
the room, and *"the shell is 4.2 × 3.4"* stops being a fact about the product at all.

**This is ADR 0119 decision 3's worked case, exactly**: 6300 / 5100 are true at HEAD, verified, and a
**scheduled wave in the same milestone** ends the reason for them. A record citing them without
naming 7H would be correct today and misleading for as long as it matters.

### What actually binds, once the shell follows the room

Three candidates were checked and only one survives, and it is not about kitchens:

- **The scene shell — does not bind, and does not bind *today* either.** The shell is already
  decoupled from the room: a 6.3 m room renders inside a 4.2 m box right now, cabinets extending past
  a drawn wall plane. Nothing crashes; it looks wrong. So the constraint was always **fidelity**, and
  7H is the wave that repairs it.
- **Camera framing — a real but small residue.** The three camera presets are constants framed on the
  seeded room. 7H's scope names camera framing alongside the shell planes, so it is inside that wave,
  not an argument for a room bound.
- **`MAX_DESIGN_BYTES` and SEC-002 — the one genuine cost, and it is an anti-abuse lever.**
  `MAX_PLACEMENTS` and `MAX_EMPTY_COLUMNS` are derived from `MAX_WALL_RUNS_MM`, which is the two room
  maxima, and `MAX_DESIGN_BYTES` is derived from those. Raising the room maxima raises the request
  body the save endpoint accepts. It scales automatically and correctly — `design-bounds.ts` designed
  it that way so a raised bound *"cannot leave a limit behind that refuses a design this product
  produces"* — but the ceiling does rise, and ADR 0118 decision 5 keeps security controls out of its
  *"do not build for it"* scope precisely because they answer a capability an adversary already has.

**The honest summary: nothing about kitchens binds the maxima.** What binds is (i) a rendering
fidelity gap that wave 7H closes, and (ii) the need for *some* finite bound so a byte cap exists.
**That is a reason to have a maximum. It is not a reason for this maximum**, and 5100 is an
indefensible answer to *"the longest side wall we serve"* when the owner's own example of an ordinary
big room is *"more than five or six meters."*

## Decision

**1. The room is a fact and the kitchen adapts to it.** Binding on every wave from here. No surface,
policy, generator or preset may require a room dimension the customer did not enter. Where a kitchen
cannot fill a room, it drops a cabinet, resizes a cabinet, or leaves the run short.

**2. Coverage is negotiable; the room's dimensions are not.** A rule that trades a room dimension to
protect coverage has the direction backwards and is a defect under decision 1, whatever else
recommends it. F2 is the correct shape: spend coverage, ask for nothing.

**3. A refusal may state a floor; it may never ask for millimetres.** *(Binds wave 7F2's copy, which
is unwritten at `128e515` and is the immediate consequence of this record.)* A genuine floor is
legitimate (F3, F4) and the customer is entitled to be told. But the sentence at 1C says **what this
room cannot hold**, never *"make wall B 100 mm longer."* The domain already refuses to carry the
number — ADR 0108 decision 3, *a field and a code, and in particular no number* — and this decision
extends that refusal from the payload to the **copy**. Related: ADR 0113 governs the copy lock the
sentence enters.

**4. F5 — a refusal the customer cannot see is worse than one that asks too much, and it is shipped
today.** `canContinueFrom` enables *Continuă* for a 1C room and the tap silently does nothing. This
is a known gap assigned to 7F2, not a new finding; it is recorded here because *"the button does
nothing"* is the defect class wave 7F1 was spent removing.

**And it has a consequence for this record that is worth saying plainly: decisions 1–3 are
unobservable in the product until 7F2 ships.** The 1C screen is the only place a customer ever meets
a room refusal, and it currently says nothing at all. So **nobody can verify by using the product
that the owner's ruling is honoured** — not the owner, not a visual pass, not a reviewer clicking
through. **A rule whose effect cannot be seen is a rule nobody will notice regressing**, and it can
be undone by an ordinary copy edit years from now with no test and no screen disagreeing. Until 7F2,
decisions 1–3 are held by this record and by code review alone, and that should be treated as the
weak guarantee it is.

**5. F1 and F6 go to the owner as one batch, and nothing is built for either first.** Both are
owner-approved numbers; both sit against decision 1; neither has a fix an architect may choose
unilaterally. Per [ADR 0118](0118-a-problem-that-has-not-occurred-is-recorded-with-its-trigger-and-not-built-for.md),
they are **recorded with their trigger and left unbuilt** — the trigger is the owner's answer, which
is a datable event.

The two questions, stated as they should be put:

- ~~**Q-A (F1).** In a room whose wall B is 900–999 mm, the 700 mm cabinet depth would push the
  structural corner past the wall. Today the product refuses the *room*. The alternative is to accept
  the room and **not offer the 700 mm depth in it** — the customer keeps their kitchen and loses a
  setting, instead of losing the kitchen. Which does the owner want? *(It bears directly on ADR 0036
  decision 5: is "the setting adapts every cabinet automatically" a promise that the setting is
  always **offered**, or only that a change, once made, is never refused or confirmed?)*~~
  **Struck by Amendment A the same day, and the owner answered a better question than this one**: a
  corner that adapts needs neither the room to grow nor the depth to be withdrawn. The residue of
  Q-A that survives is narrower and is restated as **Q-A′** in the amendment.
- **Q-B (F6).** Wall A over 6300 mm or wall B over 5100 mm is refused outright. Those ceilings are
  the 3D scene shell times 1.5 — **nothing about kitchens binds them**, and the owner's own example
  is a wall of *"more than five or six meters."* **They were approved as storage bounds, not as an
  answer to "how long a wall will you serve?"** Should a longer wall be accepted with the kitchen
  simply not covering all of it — which ADR 0067 already rules the normal case? **Ask alongside wave
  7H**, which makes the drawn wall the entered wall and removes the reason these numbers had.

**6. Neither question is a reason to pause a wave.** Nothing in M7 depends on the answers, and per the
standing rule nothing ships mid-milestone regardless.

**7. The paired invariant below is binding on its own**, independently of either question, and it
applies the moment anybody touches wall B's arithmetic.

## The paired invariant — the corner reach and the reserve move together, or nothing moves

**This is the finding of the audit, and it is stated as an invariant rather than as an implementation
note**, because the failure it predicts is a wave that ships, measures green, and changes nothing a
customer can see.

**The invariant.** Wall B's usable run is bounded at *both* ends by the same worst case:

- its **start** is the corner's reach, `floorRunStartMm("B")` — 900 at the shell's depth;
- its **end** is the wall less `slideReserveMm`, the largest chain shift over every declared depth —
  100.

**900 + 100 = 1000, which is exactly `APPROVED_L_WALL_B_MIN_MM`.** The two are not related by
coincidence and not related by a shared constant either: they are two independent derivations of the
same worst case, in two modules, that happen to sum to the approved bound. **So a change to either
one alone is a no-op for every customer.** Relax the reach to 900 and the reserve still ends wall B's
run 100 mm early; remove the reserve and the policy still refuses the room at the door.

**What this forbids.** No wave may change the corner reach, `slideReserveMm`, or
`APPROVED_L_WALL_B_MIN_MM` without addressing all three together. A partial change is not a partial
improvement — it is **zero improvement presented as progress**, and it will read as progress in a
diff, in a review and in a passing test suite.

**What a test must assert, and it is the load-bearing half.** A test that pins either number proves
nothing about the property being bought. **The assertion is the customer-visible outcome: for a room
at the new bound, `validateRoomInput` accepts it *and* `generateKitchen` returns a design containing
a sink and a hob.** Both arms, on the same room, in one test. A room that validates but composes
nothing is the exact state a one-sided fix produces, and only an end-to-end assertion can fail on it.

**This is ADR 0119 decision 7's family, and naming it is the point** — *a check that cannot
distinguish the property it claims to hold.* The precedent is already in this repository: ADR 0108
Amendment C rule 3 ties the validator to the generator by a property *"if and only if
`generateKitchen` places a sink and a hob"*, for the same reason and against the same hazard. **The
mechanism exists; this invariant says it is mandatory here too.**

## How the two rulings retire the ADR 0036 tension, and 0036 is left standing

*(Replaces the *"thin"* reading struck above. Recorded because it is a resolution the two rulings
produce jointly and neither produces alone.)*

**ADR 0036 decision 5 is untouched by this record and is not in tension with it.** The tension was
manufactured by a third assumption — that the corner is fixed — and the owner has now removed that
assumption ([Amendment A](#amendment-a--2026-09-15-every-cabinet-is-custom-made-corners-included-and-that-is-the-other-half-of-this-record)).

- **Today**, in a 900 mm wall B, the 700 mm depth and the room's floor compete: one of them has to
  give, and the shipped product makes the *room* give.
- **Under an adaptive corner**, 700 mm stays offered in a 900 mm room and **the corner absorbs it**.
  Nothing is withdrawn from the customer and nothing is refused after the fact, so §9's *never offer
  what cannot be satisfied* has nothing to suppress and ADR 0036 decision 5 has nothing to forbid.

**The two rulings point the same way**, which is the whole of the resolution: the owner said *adapt
the cabinet* rather than *refuse*, at both levels on the same day. **The room's floor and the depth
offer stop competing entirely**, and the question this record originally sent to the owner as Q-A
dissolves rather than being answered.

## Recommendation on sequencing

*(A recommendation, not a wave plan; the coordinator sequences.)*

**F1 is not an M7 correction and should not be slotted into M7 as a defect fix.** It is a real
finding, it is not an implementation defect, and it has no fix that does not first need an owner
ruling — decision 5. Treating it as a bug fix would overturn an owner ruling by the back door, which
is the failure ADR 0119 and the standing ADR sweep exist to prevent.

**What belongs in M7 now, and it is already on the path:** decision 3's constraint on wave **7F2**'s
1C copy. That is free — 7F2 is writing those sentences either way, and this record tells it which
sentences it may not write. Nothing else in M7 need move.

**If the owner answers Q-A in favour of adapting the depth offer, the cost is one wave, and it is not
small:**

- **Domain, four seams.** `room-policy.ts`' `farthestCornerEdgeMm` currently takes a `Math.max` over
  every declared depth and would become per-depth — which changes the **shape** of `LWallBounds`,
  not just a number. `approved-room-policy.ts`' wall-B literal needs a **fresh owner number** under
  ADR 0108 B1. `shell-design.ts`' `slideReserveMm` must move with it or F2 silently eats the gain
  (the 1000 is 900 of corner plus 100 of reserve, and only both together are visible to a customer).
  `validate-room.ts` needs nothing — it reads its policy, which is the point of ADR 0108 decision 1.
- **Web, one seam.** `global-settings-model.ts`' `offeredCabinetDepthsMm` gains the design's room.
  The design already carries it, so this is an argument, not an architecture change.
- **Tests, the bulk of the work.** `approved-room-policy.test.ts` pins 1000 twice (the six-bound
  table and the Amendment E minimum-kitchen table). `room-policy.test.ts` asserts **equality** with
  the max-over-depths derivation — deliberately, per ADR 0108 Amendment A's note on the surviving
  mutant — so its subject changes, not just its expected value. `minimum-kitchen.*`,
  `validate-room.*` and `shell-design.adversarial` carry boundary rows built on 1000.
- **The guard test's meaning inverts, and this is the part to be careful about.** Today
  *approved ≥ engine* reads as *the product is never more permissive than the engine*. With a
  per-depth engine minimum, "the engine's minimum" is no longer a single number and the guard needs
  restating before it can be re-asserted. That is design work, not a test edit.

**F6 is cheaper if the owner wants it** — the maxima are one literal each plus the `MAX_ROOM_*`
derivation's premise — **but it is not free either**: `design-bounds.ts` derives `MAX_PLACEMENTS`,
`MAX_EMPTY_COLUMNS` and `MAX_DESIGN_BYTES` from the same wall runs, and `MAX_DESIGN_BYTES` is a
security bound (SEC-002). A larger room means a larger accepted request body. **Not a data edit.**

## Alternatives considered

- **Rule F1 a defect and correct the 1000 in M7.** Rejected — decision 5's reasoning. It reverses
  ADR 0036 decision 5's reading without the owner, and it edits owner-approved data in a way ADR
  0108 B1's pin test exists to stop.
- **Judge the room against the minimum for the design's current depth.** Rejected, and it stays
  rejected: ADR 0083 decision 2 and ADR 0108 Amendment A's second alternative both refuse a room
  bound that moves with a setting, and ADR 0083 gives the decisive reason — a room that tracks the
  setting makes ADR 0065's fit gate vacuous, deleting a shipped feature.
- **Accept the 900–999 wall B and let the corner be marked at 700.** Rejected: ADR 0108 Amendment A
  measured exactly this and found the mark falls on a **structural** body the customer never chose
  and cannot clear by any edit. Adapting by marking something unremovable is not adapting.
- **Read the ruling as "never refuse a room."** Rejected as a misreading, at length, under *What the
  ruling does not say*. It would retire ADR 0110 Amendment A2 — an owner ruling of four days earlier
  — and promise a kitchen in a 400 mm room.
- **Quote the transcript's literal *"we can resize the room."*** Rejected; see the transcription
  note. It would license exactly what ADR 0083 decision 2 refuses.
- **Fold this into ADR 0108 as another amendment.** Rejected: 0108 is about *how a room is validated*
  — policy as data, handed to a pure validator. This is a **product principle** that binds
  generation, presets and copy as much as validation, and it is the standard F6 is judged against,
  which is not 0108's subject at all.

## Consequences

- **Every later plan gains one question**, alongside ADR 0118's and ADR 0119's: *does this rule ask
  the customer for a millimetre, or does it spend one of ours?*
- **Wave 7F2's copy is constrained before it is written** (decision 3), which is the cheapest moment
  it could have been.
- **Two owner questions are open** (decision 5) and are recorded with their triggers, not built for.
  They belong in the next batch rather than being asked one at a time.
- **F2's 100 mm reserve is now a recorded, accepted cost** rather than an implementation detail. If
  Q-A is answered in favour of adapting the depth offer, it is the first thing that must move, and a
  fix that misses it will measure as no change at all.
- **This record will go stale, and ADR 0119 decision 4 applies to it.** Its measurements are
  `128e515`, 2026-09-15. The wall-B figures move the day a third cabinet depth is declared — ADR 0056
  declines to write an `800 → 500` row, so that day is not scheduled, and nothing is built for it.

## Decision-record sweep

| Record | What it says | How it relates |
| --- | --- | --- |
| [0108](0108-a-room-is-validated-against-policy-data-and-the-interim-policy-is-the-engines-own-limits.md) Amendment A | Each L wall minimum is the corner's farthest reach over **every** declared depth: A 900, B 1000. Its third rejected alternative is *"refuse 700 for rooms between 900 and 999."* | **The earlier ruling this record sits against, and it is NOT overturned.** Amendment A is correct given that the room is judged before a depth is known and every depth must stay usable in every accepted room. The new ruling questions that second premise, and the question goes to the owner (Q-A). Amendment A's own measurement table is this record's evidence. |
| [0108](0108-a-room-is-validated-against-policy-data-and-the-interim-policy-is-the-engines-own-limits.md) Amendment B | The owner approved wall A 900–6300, wall B 1000–5100, ceiling 2200–3900, as literals pinned by a test. | **Why F1 and F6 are owner questions rather than corrections.** B1's pin test is working exactly as designed: it makes the change visible and sends it back. |
| [0108](0108-a-room-is-validated-against-policy-data-and-the-interim-policy-is-the-engines-own-limits.md) Amendments C–E, decision 3 | The coupled sink-and-hob rule; a refusal carries a field and a code and **no number**. | **Kept and extended.** F3 is a legitimate floor. Decision 3 of this record carries "no number" from the payload into the customer-facing sentence. |
| [0110](0110-generation-inserts-through-the-command-path-and-the-corner-is-structural-data.md) Amendment A2, A4 | The minimum kitchen is a sink and a hob; the 599 mm leftover cap binds what the product **proposes**. | **The limit of this ruling, and its clearest precedent.** A2 is the genuine floor the ruling does not abolish; A4 is already *coverage is negotiable*, ruled on 2026-09-11. |
| [0083](0083-wall-coverage-is-the-runs-extent-and-the-finished-end-is-part-of-it.md) decisions 1–2 | The room is a fixed dimension and never a function of the cabinet-depth setting; *"a room is a physical constraint the customer measures."* | **The same principle, ten days earlier, from the opposite direction.** 0083 forbids the room **growing** with a setting; this forbids the product **demanding** a larger one. Consistent, and 0083's third reason (a growing room makes ADR 0065's gate vacuous) is why the depth-aware alternative stays rejected. |
| [0036](0036-a-declared-dimension-is-the-finished-cabinet.md) decision 5 | Changing the depth setting adapts every cabinet automatically, *"with no confirmation step and nothing left behind."* | **The ruling Q-A puts back to the owner.** It plainly forbids refusing or confirming a change the customer made. Whether it also requires the depth to be **offered** in a room that cannot hold it is the open question, and the architect declines to read it either way. |
| [0065](0065-a-body-past-the-end-of-its-wall-is-marked-not-moved.md) | A body past the end of its wall is marked, not moved; going back to the shallower depth is a remedy. | **Why "accept the room and mark the corner" was rejected.** The mark would land on a structural body (ADR 0021) that no edit can clear. |
| [0067](0067-leftover-wall-is-the-normal-case-and-the-price-is-a-floor.md) | Leftover wall is the normal case; the manufacturer meets the real wall at the real measurement. | **The adaptation F6 should be using.** A wall longer than the product covers is already the ruled normal case, which is why refusing it outright reads as failure mode 2. |
| [0056](0056-two-cabinet-depths-are-declared-and-the-control-reads-the-map.md), [0028](0028-wall-depth-is-derived-from-the-worktop.md) | Exactly two declared depths, 600 and 700; no speculative third row. | **Bounds the size of the problem.** F1's pad is exactly one 100 mm step because there are exactly two depths. A third row would change it, and 0056 deliberately does not write one. |
| [0117](0117-generation-produces-the-cheap-correct-baseline-and-the-owners-taste-enters-through-presets.md) | Generation owes correct, complete and cheap — not the kitchen a designer would draw. | **Consistent, and it constrains the fix.** *"Adapt"* here means drop, resize or shorten. It is not licence to add a taste rule to the generator because one room composed awkwardly. |
| [0118](0118-a-problem-that-has-not-occurred-is-recorded-with-its-trigger-and-not-built-for.md) | A problem that has not occurred is recorded with its trigger and left unbuilt. | **How decision 5 is framed.** F1 and F6 have occurred and are real; what has not occurred is the owner's answer, so the *machinery* waits and the *record* does not. |
| [0119](0119-a-remembered-fact-about-this-repository-is-a-claim-to-recheck-and-true-at-head-is-not-true-at-the-end-of-the-milestone.md) | Re-read at HEAD before asserting; a citation carries when and against what it was checked. | **The standard this audit was held to.** Every file cited was read at `128e515` on 2026-09-15, and decision 3 names the scheduled wave (7F2) that ends F5 rather than describing F5 as permanent. |

## Amendment A — 2026-09-15: every cabinet is custom made, corners included, and that is the other half of this record

**The ruling, verbatim** (owner, 2026-09-15, minutes after the ruling above, answering how narrow the
corner return and the blind corner cabinet can actually be manufactured):

> *"every cabinet is custom made including corner. if for the algorithm it's easier to resize the
> corner or to adapt the corner cabinet — adapt the corner cabinet. this is the… it's not
> manufactured with the fixed size, it's custom made. any cabinet including corners are also custom
> made"*

> ### Read this before acting on the ruling: it does not make corners draggable in the editor
>
> **"Every cabinet is custom made" answers what the workshop can manufacture. It does not answer what
> a customer may drag.** The two are different questions and the owner's sentence answers one of them
> — its operative clause names its actor: *"if for **the algorithm** it's easier to resize the
> corner."*
>
> - **`DEVELOPMENT-SPEC.md` §13.1 — *"never a width donor"* — protects a customer from breaking a
>   corner by dragging a neighbour's width.** It is about the **editor**. Nobody has ruled on it, and
>   it still stands.
> - **The owner's ruling is about the workshop**, and it licenses the **generator** to size a corner
>   to the room it is composing for.
>
> **So a corner may gain a generation-time width while `fixedWidth: true` stays exactly as
> [ADR 0021](0021-corner-returns-are-structural-in-data.md) put it.** The product already holds this
> split: ADR 0108 Amendment E separates *"the generated sink and hob"* from *"the catalogue's
> manually buildable width ranges"*, and `GENERATION_PRIORITIES`' widths are not
> `resolveWidthRangesMm`'s.
>
> **Taking this ruling as licence to make corners resizable in the editor would overturn a spec rule
> and two ADRs on the strength of a sentence about manufacturing.** If that is wanted, it is
> **Q-A′.2** below and it needs the owner's word.

### The two rulings are one principle at two levels, and the first without the second is what produced the padding

- **The room is a fact.** The customer's wall does not move.
- **The cabinet is not.** Every cabinet, corner included, is made to size.

Held together, they say where the give is: **in the cabinet, always.** Held apart — the room fixed
*and* the corner fixed — there is nowhere for a short wall to go except into the room's minimum, and
that is exactly the shape of F1. **The padding was not a mistake in arithmetic; it was the only
remaining degree of freedom once the corner had been frozen.** This is why the second ruling
strengthens the audit rather than invalidating it.

### What the corner's literals actually are, read at `128e515`

**The lead's framing — that the corner literals encode the fixture rather than the product — is right
about the numbers and needs one correction about the flag.** Two different things are carried on
those four bodies and they must not be treated as one:

| | Where it lives | What it encodes | What the ruling does to it |
| --- | --- | --- | --- |
| The **literals** 900 / 320 / 570 | `fixtures/kitchen-l-design.ts` placements `p25`, `p26`, `p9`, `p21`; mirrored in `three-adapter/src/kitchen-parts.ts` as `W = 0.9` inside `cornerBaseX()`, `CORNER_RETURN_WIDTH_M = 0.32`, `UPPER_CORNER_RETURN_WIDTH_M = 0.57` | The **supplier's measured kitchen**, ported. ADR 0025 derives `p25`/`p26`'s seats from it explicitly. | **Released.** The owner has said there is no manufacturing fact behind them. |
| `fixedWidth: true` | The shared `STRUCTURAL_CORNER` shape in `fixtures/kitchen-l-design.ts` | **`DEVELOPMENT-SPEC.md` §13.1 expressed in data**, deliberately, by [ADR 0021](0021-corner-returns-are-structural-in-data.md) decision 1 and [ADR 0025](0025-the-corner-base-legs-seat-on-the-l-joint.md) decision 4: *"Corners are structural. No replace, no delete, **never a width donor**."* | **Not obviously released, and the record declines to release it here** — see immediately below. |

**The distinction, because conflating it would overturn a spec rule nobody ruled on.** §13.1's
`fixedWidth` is about what the **customer** may do in the editor: no swap list, no delete, no width
section, and no donating width to a neighbour that wants it. The owner's ruling is about
**manufacturing**, and its operative clause names the actor: *"if for the algorithm it's easier to
resize the corner… adapt the corner cabinet."* **The algorithm, not the customer.**

So the ruling licenses **generation-time corner sizing** and says nothing either way about
**customer-time corner resizing**. The product already holds exactly this split elsewhere and it is
the precedent to follow: ADR 0108 Amendment E distinguishes *"the generated sink and hob"* from
*"the catalogue's manually buildable width ranges"*, and `GENERATION_PRIORITIES`' declared widths are
not `resolveWidthRangesMm`'s. **A corner can gain a generation-time width range while
`fixedWidth: true` stays exactly as ADR 0021 put it**, and that is the reading this record adopts
until an owner says otherwise. Widening it to the editor is a separate question and a separate
record.

### The true floor for a corner piece — asked, and the honest answer is that no such number exists yet

The brief asked this to be established rather than assumed, told me to reuse the project's existing
answer for *"narrowest buildable cabinet"* if nothing contradicted it, and told me not to invent a
number. **Something does contradict it, and the answer is that the number does not exist.**

**The suggested 200 mm is not the project's general floor.** Read at `128e515`:

- **`DEFAULT_MIN_WIDTH_MM` = 300** (`catalog.ts`, from §2's `MIN_WIDTH_M`) is the floor every
  cabinetry row carries **unless it declares its own**. Eleven rows take it.
- **200 is a declared downward exception on three rows only** —
  `HINGED_CABINET_MIN_WIDTH_MM = 200` (`catalog.ts`) for `base-cabinet` and `wall-cabinet`, plus
  `base-bottle-cargo`'s discrete `[200, 300]` set. It exists through
  [ADR 0026](0026-the-width-floor-has-a-direction.md)'s mechanism, and that record is
  explicit that `MIN_WIDTH_M` *"does not move, so no row inherits the exception."*
- **`NARROWEST_CATALOG_WIDTH_MM` = 200 in `design-bounds.ts` is not a product rule either.** It is an
  aggregate minimum used to bound how many bodies can be packed into a wall, in a module whose head
  comment says its constants are *"limits on what a document may say, not product rules."* Reading a
  product floor off it is precisely ADR 0119 decision 7's *"a check that cannot tell a thing from a
  mention of it."*

**And neither 300 nor 200 is a fact about a corner.** Both are cabinetry floors reasoned from a door
leaf and a carcass standing against one wall. A corner return is not that shape: the adapter's own
comment records it as *"the one seeded base body with no front at all (`fronts: NO_OPENING_FRONTS`)"*.
The four corner bodies carry **no `catalogEquivalentId`**, therefore no `sizesMm` and no
`widthRangesMm` — deliberately, per ADR 0021's third rejected alternative (*"§13.1 is explicit that a
corner is not a body a customer chooses"*). **There has never been a corner width range to inherit
from.**

**One real constraint was found, and it is on the X-leg rather than the return.** `cornerBaseX()`
builds a lazy susan: `cyl(0.2, 0.018, …, "susan_tray")` — a **400 mm-diameter** tray on a pole
(`kitchen-parts.ts`, inside `cornerBaseX()`). A blind corner narrowed much below that cannot hold the
fitting it is built around. This is a **fitting** constraint, not a manufacturing one, and the owner's
ruling arguably answers it — a narrower corner drops the susan, as any custom cabinet would.
**Recorded as found, not converted into a number.**

**So: the floor is an open measurement, and `300` is what the project would apply by default to a row
that declares nothing.** Naming the corner's own floor is the owner's or a measurement's, and this
record deliberately does not name one.

#### An ADR 0119 instance, recorded because the person who made it asked for it to be

**The 200 mm figure came from `NARROWEST_CATALOG_WIDTH_MM` in `design-bounds.ts` — a module whose own
head comment says its constants are *"limits on what a **document** may say, not product rules"* —
and was read as a product floor anyway.** The coordinator reported it against their own interest, in
the terms ADR 0119 decision 5 asks for.

**It earns its place for a reason the other instances do not have: the disclaimer was in hand.** The
same coordinator quoted that exact comment, correctly and to good effect, about the room **maxima**
in F6 — and then read a product floor off the same module, one paragraph later, about **widths**.
**So this is not a case of missing the warning. It is a case of a module that is trusted for one
question being trusted for a different one.**

**That makes it [ADR 0119](0119-a-remembered-fact-about-this-repository-is-a-claim-to-recheck-and-true-at-head-is-not-true-at-the-end-of-the-milestone.md)
decision 7's family — *a check that cannot distinguish the property it claims to hold* — in its
sharpest form yet: `NARROWEST_CATALOG_WIDTH_MM` genuinely is the narrowest catalogue width. It is a
true statement that is not the statement anybody needed.** Reading it as a floor is the same shape as
0119's own examples: a ledger row read as a schema, a column's name read as its type, a grep for a
heading matching a pointer that quotes it.

**The generalisation worth keeping: a derived aggregate is evidence about the set it was derived
from, never about any member of it, and never about what the product permits.** `design-bounds.ts`
exists to bound an attacker's document. Every constant in it is an upper or lower envelope over
things the product happens to contain, and **none of them is a rule the product enforces** — which is
what its head comment says, and why the comment is there.

### What an adaptive corner does to the arithmetic — measured, and it does not eliminate the sequencing question, it moves who pays

Derived at `128e515` and checked against ADR 0108 Amendment A's independently measured table at both
depths, which it reproduces exactly:

- **Wall B's base floor** = the return leg's own depth + the return's width. The depth is
  `CORNER_RETURN_DEPTH_M = (cabinetDepthMm − 2 × COUNTER_REAR_OVERHANG_MM)` — **580 at 600, 680 at
  700**. With today's 320 mm return: 900 and 1000. ✓ (`p26` is `580–900` in the fixture and
  `680–1000` in Amendment A's 700 mm column.)
- **Wall B's wall-row floor** = `wallDepthMmForWorktop(depth)` + the upper return's width — 330 and
  400, plus 570: **900 and 970**. ✓
- **Wall A does not move at either depth**, because the corner is taken out of wall B
  (`WALL_THE_CORNER_IS_TAKEN_FROM`).

**The first half of that sum is the customer's chosen depth projected into wall B's run. It is not
negotiable — it is the cabinet they asked for. The second half is now negotiable.** The lead's
reading is confirmed.

**But note what survives.** Even with a zero-width return, wall B's base floor at a 700 mm depth is
**680 mm**, and at 600 mm it is 580. The floor still varies by 100 mm with a choice made after the
room is judged. So the sequencing fact this record established is **still true and still worth
knowing** — what changes is that the 100 mm is now payable **in the corner's width** instead of in
the customer's wall. At a 900 mm wall B the return must be ≤ 320 mm at a 600 mm depth and ≤ 220 mm at
700.

**That is the first ruling's own trade, executed: spend the cabinet, not the room.** It is the reason
these two rulings belong in one record.

### What the amendment does to each finding

| Finding | Amended verdict |
| --- | --- |
| **F1** — wall B's 1000 mm minimum | **Confirmed as padding, and by a larger margin than the depth question alone implied.** It is no longer *"the price of a guarantee"* — an adaptive return pays that price itself. The 1000 becomes a consequence of the room rather than a constant, which is what the ruling asks for. |
| **F2** — `slideReserveMm`'s 100 mm | **Unchanged as correct, and now partly redundant.** The reserve exists so a proposal survives a later depth change; a corner that re-sizes to its room is a second, better answer to the same problem. Whether both are still wanted is a design question for the wave, not this record. **The paired invariant binds harder under this amendment, not less**: an adaptive corner changes the reach, so a wave that does it and leaves the reserve alone is exactly the no-op the invariant forbids. |
| **F3** — the coupled sink-and-hob rule | **Still a genuine, owner-ruled floor.** Its wall-B thresholds fall with F1's pad, by whatever the corner's floor turns out to be. Amendment E's boundary table is re-derived, not overturned. |
| **F4** — `MINIMUM_NOT_MET` | **Unchanged and still exemplary.** |
| **F5** — the silent 1C refusal | **Unchanged.** Still 7F2's, still shipped today. |
| **F6** — the maxima 6300 / 5100 | **Untouched by *this* ruling** — nothing about a custom corner reaches a scene-shell ceiling — **but materially strengthened by wave 7H**, which ends the rendering basis for them inside this milestone. Q-B stands, and gains a moment to be asked at. |
| **F7** — `offeredCabinetDepthsMm` | **Demoted from "where the fix lands" to a fallback.** If the corner adapts, the depth need not be withdrawn from any room, which is the better outcome under ADR 0036 decision 5 and removes the tension this record flagged. |

### The 3D cost, verified at `128e515` — and it is larger than one door slab, but it already has a home

**The lead's citation holds exactly.** `three-adapter/src/kitchen-parts.ts:1972-1981` is
`doorSlab(0.28, CARC_H - 0.01, 0.3, …)` — a 280 mm door panel at x = 0.3, both literal, inside
`cornerBaseX()`. Resizable corner *data* against that builder produces a door that no longer matches
its carcass.

**Three further findings from reading the region, because the door is not the whole of it:**

1. **`cornerBaseX()` takes no arguments at all** and opens `const W = 0.9`. `seat-rule.ts`'s head
   comment already records this as load-bearing — *"`cornerBaseX()` takes no arguments and reads the
   kit's own depth"* — and names the defect it caused once.
2. **`cornerBaseReturn(LD)` is parameterised on its depth and never on its width**, reading
   `CORNER_RETURN_WIDTH_M` from module scope.
3. **Those two width constants also place the corner's neighbours.** `CORNER_RETURN_WIDTH_M` and
   `UPPER_CORNER_RETURN_WIDTH_M` are read at three further sites inside `buildKitchen()` to compute
   where the *next* bodies stand — `cornerReturnAlongWallM`, then `tallRunStartM` and wall B's whole
   tall run, and the upper corner return. A width that varies per design cannot stay a module
   constant.

**It is not an undiscovered cost.** The M7 plan already carries wave **7D7** — *"the corner
**builders** take their size as a parameter — `DEVELOPMENT-SPEC.md` §13.3 open question 6, corner
half only"* — as a Full-tier 3D wave with a fidelity gate at both depths, depending on 7D6 and 7H.
**What this amendment changes is its priority, not its existence.**

#### Is 7D7 under-scoped for the layout arithmetic? Asked, read, and the answer is mostly no — with one gap that is not about files

**The three layout sites are already a derived butting chain, not three independent literals, and
they were made one for exactly this failure.** The comment above them records it: before the fix,
*"at 700 the return leg stayed put while the X-leg grew into it — 100 mm of carcass through carcass
and 700 × 100 mm of worktop through worktop."* Each position is now *"derived by butting the body
against the one before it."* **So threading a variable corner width through that chain is threading
one value, not re-deriving three positions** — the propagation already exists and is already gated by
the M1 parity gate. **The cost here is smaller than "a change to the kit's layout arithmetic" implies,
and the record says so rather than leaving the stronger phrasing standing.**

**7D7's criterion 5 covers it textually**: *"No corner dimension is a literal in the adapter: each
comes from the domain's derivation through the existing body definition. **Must not:** a builder
constant 'kept in sync'."* `CORNER_RETURN_WIDTH_M` is a corner dimension and is a literal in the
adapter, so it is in scope by that criterion whether or not the wave's file list names it.

**The real gap is 7D7's *input*, and it is material.** Its stated scaling rule is: *"each corner
piece's **along-wall length** becomes a function of the **cabinet depth** (7D6's derivation)"*, and
its criterion 2 checks the built extent *"at **each** declared depth"*. **There is no room dimension
anywhere in the wave's scaling rule or its criteria.** Under this ruling the corner's length is a
function of **the depth and the room**, so criterion 2 must sweep rooms as well as depths. **That is
a re-scope of acceptance criteria, not a file the wave forgot** — and it is the same enlargement this
record already noted for 7D6, arriving downstream.

**One constraint falls out of 7D7 for free, and it is worth having.** Criterion 1 requires every
corner mesh to be **byte-identical at 600 mm in the reference room**, and calls a re-baseline *"a
failure, not a step"*; risk 2 names it *"the wave's spine."* **So 7D6's room-aware derivation must
return today's 900 / 320 / 570 for the reference room at 600 mm.** That is a free, checkable pin on
the new derivation, already written, and nobody has to invent it.

**What the owner should hear, stated as the true shape rather than the planned one:** the ruling does
not create a 3D wave — **it gives an existing one its reason and its deadline**, and it widens what
that wave must be tested against from *two depths* to *depths × rooms*.

### The 7D6 question, and a correction worth making precisely

**The lead is right that the question is retired and it would be wrong to read that as "7D6 is
cancelled."** 7D6's wave-table row reads: *"The corner's along-wall reach is **derived from the
cabinet depth** instead of carried as the fixture's 900 / 320 / 570 literals."*

- **Retired:** which of three families should govern a *derived* reach at 700 mm depth. Under this
  ruling the reach is not a constant to be derived from the depth at all.
- **Enlarged, not retired:** 7D6's actual job. Replacing the literals with a derivation is precisely
  what the ruling requires — and the derivation's input set grows from *the depth* to *the depth and
  the room*.

That row also already anticipates this record: *"may move an owner-approved wall minimum."* **F1's
fix therefore has a home in M7 already**, which is a material correction to this record's original
sequencing recommendation.

### Sequencing — amended, and the deadline is not this record's invention

**The original recommendation said F1 was not an M7 correction and should wait on an owner answer.
That was right on the evidence I had and is now superseded**, for a reason that outranks it: the
work has a scheduled home and a **datable deadline** that this record did not know about.

The M7 plan makes **wave 7P2 the project's freeze point** — *"From here the corner's reach, the wall
minima and `ROOM_TOO_SMALL_FOR_KITCHEN` are load-bearing on stored data — geometry that wants
re-deriving (7D6, 7D7) lands before this, not after"* — against the owner's own *"a critical moment
will be when I will start to save presets."*

**That is ADR 0118 decision 4's discriminator satisfied exactly: a cost that rises at a datable
event, not continuously.** Before 7P2 the corner is free to re-derive — the plan says so in terms,
on the owner's evidence that nothing is stored and nothing is in production. After it, the corner's
reach is load-bearing on saved presets.

**So the recommendation, amended:** the corner's adaptation belongs to the existing **7D6 → 7D7**
chain, before **7P2**, and this ruling raises that chain's priority rather than adding a wave.
Nothing here designs it. Three things the coordinator will want to weigh, and no more:

- **7D7 is Full-tier 3D with a fidelity gate at both depths**, and its own row orders its baseline
  *after* 7H. That ordering constraint is unchanged by this ruling.
- **The corner's floor is an open number** (above). 7D6 cannot derive a reach without one, so
  settling it is upstream of the chain, not inside it.
- **Moving wall B's minimum still needs the owner**, because it is approved product data under ADR
  0108 B1 — *"a conversation, not a data problem"*, in the plan's own words, since nothing is stored.

### The question that survives, restated

**Q-A′ (replaces Q-A).** The owner has said the corner adapts. Two things still want their word.
**Both are drafted below as they should be put** — in the owner's terms, with the consequence of each
answer stated, because a question that hides its consequence gets an answer to a different question.

**Q-A′.1 — how narrow may a corner go?**

> *"You told us the corner is custom made like everything else. So we need to know how small the
> workshop will actually build one. Two things we found: your other cabinets don't go below 300 mm
> unless we say so specially, and the blind corner in the current kitchen has a **round carousel
> tray 400 mm across** inside it. Below about 400 the carousel doesn't fit and the corner becomes a
> plain cupboard with a door. Is that fine — a small corner without the carousel — or is there a
> size below which you would not build a corner at all?"*

**Consequence of each answer, stated with the question:** the number becomes the floor of wall B's
minimum. A 200 mm answer puts wall B's floor at 780 mm at a 600 mm depth; 300 puts it at 880; today's
320 puts it at 900. **Nothing in the repository answers this** — the corner has never had a width
range, and every candidate number in the catalogue is reasoned from a door the return does not have.

**Q-A′.2 — does the corner stay fixed for the *customer*, or only for the generator?** *(The one the
architect most wants asked, because the next reader will otherwise assume an answer.)*

> *"Your words were 'if for **the algorithm** it's easier to resize the corner'. We've read that as:
> **our generator** may build a corner at whatever size the room needs. We have **not** changed what
> the customer can do — today a corner is the one cabinet they can't resize, delete or swap, and they
> can't take width from it to make a neighbour bigger. That rule exists so nobody can accidentally
> break the corner that holds the two runs together. Did you mean to change that too, or only what we
> build for them?"*

**Consequence of each answer:**

- ***"Only what you build"*** *(the reading this record adopts)*: `fixedWidth: true` stays, ADR 0021
  and §13.1 stay, and the corner gains a **generation-time** width range exactly as the sink and hob
  already have generated widths distinct from their catalogue ranges. **No further record needed.**
- ***"The customer too"***: this overturns §13.1's *"never a width donor"*, ADR 0021 decision 1 and
  ADR 0025 decision 4, and reopens the panel's width section, the swap list question and
  `canGive` for a structural body. **That is its own ADR and its own wave**, and it should not be
  inferred from a sentence about manufacturing.

**Q-B (F6) is unaffected** and still belongs in the same batch. **Ask it alongside wave 7H**, which
is what removes the reason those maxima had.

### Sweep for this amendment

| Record | What it says | How it is settled |
| --- | --- | --- |
| [0021](0021-corner-returns-are-structural-in-data.md) decision 1 | §13.1 in data: corners are `canReplace`/`canDelete`/`canHandle` false, `fixedWidth` true — *"never a width donor."* | **Kept, and deliberately not overturned.** The ruling addresses manufacturing and names the algorithm as the actor. Editor-side resizing is Q-A′.2, not a consequence taken here. |
| [0025](0025-the-corner-base-legs-seat-on-the-l-joint.md) decisions 1, 4 | `p25`/`p26` with `frameDepthMm` 560/580; both take `STRUCTURAL_CORNER`. | **The source of the literals, and the measurement this amendment's arithmetic was checked against.** Its seat rule is unaffected: a joint-seated leg stays joint-seated at any width. |
| [0026](0026-the-width-floor-has-a-direction.md) | `MIN_WIDTH_M` 300 is the default floor; a row may declare downward; *"no row inherits the exception."* | **The answer to "is 200 the project's floor?" — it is not.** 200 is a three-row declared exception, and 0026 forbids inheriting it. |
| [0036](0036-a-declared-dimension-is-the-finished-cabinet.md) decision 5 | The depth setting adapts every cabinet automatically. | **Tension dissolved.** An adaptive corner means no room need lose a depth option, so nothing has to be withdrawn and nothing has to be refused. |
| [0108](0108-a-room-is-validated-against-policy-data-and-the-interim-policy-is-the-engines-own-limits.md) Amendment A | Wall minima hold the corner at every declared depth: A 900, B 1000. | **Its premise is withdrawn by the owner, not its reasoning.** Amendment A is correct given a fixed corner; the corner is no longer fixed. Its measured table is this amendment's check and reproduces exactly. Moving the number is still the owner's (Amendment B, B1). |
| [0108](0108-a-room-is-validated-against-policy-data-and-the-interim-policy-is-the-engines-own-limits.md) Amendment E | Generated widths are distinct from the catalogue's manually buildable ranges. | **The precedent this amendment follows** for giving a corner a generation-time range without touching `fixedWidth`. |
| [0110](0110-generation-inserts-through-the-command-path-and-the-corner-is-structural-data.md) | Generation inserts through the command path; the corner is structural **data**, placed by the shell rather than inserted. | **Unaffected in mechanism, enlarged in scope.** The shell already authors the corner for its room; it would now author its width too. Nothing moves to the command path. |
| [0117](0117-generation-produces-the-cheap-correct-baseline-and-the-owners-taste-enters-through-presets.md) | Generation owes correct, complete and cheap — not a designer's kitchen. | **Consistent, and a guard on the fix.** Sizing a corner to its room is correctness. Choosing a corner *style* by proportion would be the taste rule 0117 forbids. |
| [0118](0118-a-problem-that-has-not-occurred-is-recorded-with-its-trigger-and-not-built-for.md) decision 4 | Act when the cost rises at a datable event; record and stop when it does not. | **Why the sequencing recommendation inverted.** 7P2 is that datable event, named by the owner, and it is the whole of the argument for doing this inside M7. |
| [0119](0119-a-remembered-fact-about-this-repository-is-a-claim-to-recheck-and-true-at-head-is-not-true-at-the-end-of-the-milestone.md) decisions 1, 7 | Re-check what you cite; a check must tell a thing from a mention of it. | **Paid for itself twice here.** *"The catalogue bottoms out at 200"* was a `design-bounds.ts` aggregate read as a product floor, and the original sequencing recommendation was written without knowing 7D7 existed. |
| **M7 wave 7D6, ruling J1** (`docs/milestones/M7-room-and-presets.md`) | *"A corner cabinet's size does **not** depend on the room — there is **one correct corner per declared depth**."* Written 2026-09-14. | **SUPERSEDED by this amendment**, and struck in place as **J1′** on 2026-09-16. **Added to this sweep because a reader arriving here would otherwise not learn that the milestone once said the opposite**, and J1 predates the owner's ruling by a day. A dated ADR outranks a milestone ruling; 7D6's criteria 1, 4 and 7 and wave 7D7's whole section were re-scoped in the same edit, so nothing downstream still asserts the retired form. |

## Amendment B — 2026-09-16: the product's intended size range is walls up to about 4 metres, and it narrows no bound

**Drafted by wave 7H's implementer from the owner's words; ~~awaiting the coordinator's
confirmation~~ — confirmed by the coordinator 2026-09-16, with the owner's words checked against
this record's quotation of them.** It is recorded here rather than in a wave's subsection because it is a fact about
the product, not about 7H — 7H is merely where it was said, while the owner was ruling on whether a
marked body framed off screen is a defect (wave 7H's Q7H-8).

> *"when somebody have enough space, like very big kitchen, and have enough money to build a lot of
> cabinets for that kitchen, I have doubts that they will go and use this tool, mainly because there
> is a lot of work on that kitchen, so they will go directly to a consultant and will ask to provide
> the design for them, ergonomic, functional, and so on. So we can see the statistic of how many use
> these big kitchens or have these big kitchens. But now let's focus on medium, small or medium,
> like till four meters per wall."*

**B1 — small-to-medium is the case to optimise for; 5–6 m rooms are the tail.** The reason is a
**market** one and not a technical one: a customer with a very large kitchen has a large budget and
goes to a consultant for an ergonomic design rather than to a self-service configurator. Walls up to
about **4 000 mm** are where the customers are.

**B2 — this narrows no bound, and that is the half a later reader will get wrong.** The owner
separately ruled **6000 mm per wall**, and that ruling stands. Large rooms remain buildable and must
remain correct. **B1 is not a reason to lower a maximum**, and a wave that cites it to shrink
`APPROVED_ROOM_POLICY` has misread it.

**B3 — it is a prioritisation rule, not a correctness rule.** Where a trade-off exists between
serving a small kitchen well and serving a 6 m one well, the small one wins. It is **not** a licence
to ship something wrong at 6 m. Q-B above is answered on the same day and independently: nothing in
the engine constrains room size any more, so the maxima are free product numbers.

**B4 — the owner's own open question, recorded so it is not lost.** *"we can see the statistic of
how many use these big kitchens"* — they want the real distribution of entered room sizes once the
product has traffic. A measurement request with no wave attached, no code owed, and no trigger but
traffic.

## Amendment C — 2026-09-16: the entered number is the run the customer wants furnished, not their wall

**Every claim below carries its evidence tier** — **[measured]** (executed against the current source
and the figures printed), **[source-verified]** (read at HEAD today), or **[inference]** (reasoned,
and marked so it can be argued with). Measured at HEAD `a70efc1`, against a `tsc` build of
`packages/configurator-domain/src` taken today, never against the checked-in `dist`.

**The ruling, verbatim** (owner, 2026-09-16):

> *"on wider wall you always place the sink and hub, and fridge you place on narrower wall. but in
> case wall have more than 4 meters it can fit on any wide wall (if all walls have more than 4
> meters) you can place all including fridge on same wall. Very often even if room is big enough
> people choose to furniture only part of the walls and this size the user should insert for each
> wall not the real walls sizes"*

### C1 — What the number means, and it is not what the form asks for

**The ruling.** The customer enters, for each wall, **the length they want furnished**. Not the
wall's real length. The two coincide only when someone furnishes wall to wall.

**Decision 1 of this record is unchanged and its subject is sharpened.** *The room is a fact and the
kitchen adapts to it* — the fact is the customer's **intended run**. It is still a fact: they chose
it, the product may not enlarge it, and a kitchen that needs 100 mm more than they asked to furnish
must drop or resize a cabinet. **The ruling narrows what "the room" refers to; it does not weaken the
principle.** If anything it strengthens it: a *wall* is a physical constraint the customer discovered,
while a *run* is a decision they made, and overriding a decision is worse than overriding a
measurement.

**The copy contradicts the ruling today. [source-verified]** `apps/web/src/messages/ro.json:54-58`
(`room.wallLabel`) labels the wall fields **"Perete A"**, **"Perete B"**, **"Perete C"** — *wall A*,
*wall B*, *wall C*. `:59` reads **"Înălțimea camerei"** — *the room's height*. `:66`'s summary is
`"{shape} · {wallA} × {wallB} m · h {height} m"`. **A customer reading "Perete A" enters their wall.**
Nothing in the form hints otherwise, and `dimensions-form.tsx:39-43`'s `FIELD_LABEL` maps each field
straight to those leaves.

*(Not to be confused with `ro.json:16-19`, `room.cameraPresets.wallA/wallB` — those name the 3D
camera views, not the form's inputs. An earlier draft of this amendment cited them by mistake; the
claim held, the citation did not.)*

**So the product currently collects one quantity and the owner has ruled it wants another.** This is
a **contract gap**, not an implementation defect: the code faithfully implements what was specified,
and the specification was wrong about the customer's intent.

#### What downstream assumes the number is a physical wall

`wallLengthMm(wall, room)` (`queries/overflowing-placements.ts`) is the single mapping — wall A is
`widthMm`, wall B is `depthMm` — and **six call sites read it. [source-verified]** Each was checked
against the run reading rather than assumed:

| Caller | Under the run reading |
| --- | --- |
| `queries/overflowing-placements.ts` — a body past the end is marked | **Still correct, arguably more so.** A body past the stretch the customer asked to furnish is still wrong, and the mark still means something they chose. |
| `validate-design.ts` — `endsPastWall` | **Still correct**, same reasoning. |
| `clip-empty-columns-at-wall-end.ts` | **Still correct.** Recorded space past the run's end is space the customer did not ask for. |
| `generation/shell-design.ts` — `plannedEndMm` | **Still correct.** The generated run ends where the customer said to stop. |
| **`run-end-panel.ts` — `passesWallAEnd`** | **Inverts. This is the finding.** See below. |
| The 3D shell (wave 7H) | **Under-draws. See below.** |

**The run-end panel's wall-end veto inverts, and it rests on an owner ruling. [source-verified]**
`runEndPanelSeatM` suppresses the finished end panel when its outer face would pass wall A's end. The
module states its authority: *"**The second veto is the wall's own end** (ADR 0045 Amendment A,
owner: *'No panel when run hits wall'*): a panel whose outer face would pass wall A's end is not
drawn — **a fitter closes that gap with a filler strip**."*

**That reasoning holds only if the number is a wall.** Under the run reading, a run ending at the
entered number stops **in the middle of the customer's wall, in open air** — there is no wall to hit
and no gap for a fitter to fill, and an exposed carcass side is exactly what a finished end panel
exists for. **[inference, and the strongest one in this amendment]** ADR 0083's own title is *"wall
coverage is the run's extent and **the finished end is part of it**."*

**This is a conflict between two owner rulings, and this record does not resolve it** — ADR 0045
Amendment A is the owner's, ruled 2026-09-01, and it is drafted in terms of a wall. It goes back to
them as **Q-C2** below.

**The 3D shell now draws walls at exactly the entered numbers. [source-verified]** Wave 7H shipped
(`a70efc1` and the four commits before it). `kitchen-shell.ts`' `resizeShellToRoom` moves the floor,
both wall planes and the wall-A backsplash: *"wall A's plane follows `widthMm`, wall B's follows
`depthMm`"*, each drawn at `drawnWallLengthM(mm) = toMetres(mm) + CORNER_OVERHANG_M`. Its own ruling
is **Q7H-1, ruled (a): the drawn wall is the entered wall.**

**So the honest answer to *"does the shell now under-draw?"* is: it draws exactly what it was ruled
to draw, and what it was ruled to draw is now the wrong quantity. [inference]** A customer who
furnishes 3 m of a 5 m wall would see a **3 m room**. Their kitchen would look correct and their room
would not exist. **Nobody has ruled on this** — Q7H-1 was answered before the run/wall distinction was
made, so it answered a question whose terms have changed. It is **Q-C3** below.

**What it is not.** It is not a 7H defect. 7H implemented its ruling exactly, and this record says so
plainly so the wave's close-out is not reopened as though it shipped something wrong.

#### What it does to the minima and the maxima

**[inference, flagged because it is the kind of claim that gets quoted as settled]** A run of 880 mm
is a different claim from a wall of 880 mm, and the two bounds are affected in opposite directions:

- **The minima get *stronger* justification, not weaker.** F1's argument was that a wall shorter than
  the corner's reach cannot hold its own corner — physics. Under the run reading it becomes: a
  customer who asks to furnish 900 mm cannot be given a corner that reaches 1000. **The corner could
  physically stand there** (their wall may be 5 m long) — but it would furnish 100 mm they did not
  ask for. **The refusal is now about consent rather than geometry, and decision 1 covers it
  either way.**
- **The maxima lose what little justification they retained.** A cap on the *run* is a cap on how much
  a customer may ask to furnish, which no physical fact supports at all. Amendment B3 already
  records that *"nothing in the engine constrains room size any more"*, and the ruled 6000 mm per
  wall is **not yet applied to the policy literals** — they are still 6300 / 5100 at HEAD.
  **[source-verified]**

**The coupled `ROOM_TOO_SMALL_FOR_KITCHEN` rule is unaffected in arithmetic and changes in
meaning.** It still asks whether a sink and a hob fit. It now asks it of a stretch the customer
chose, which is a better question.

#### What the 1C sentence must now say — and decision 3 already forbids the wrong version

**Decision 3 of this record says a refusal may state a floor and may never ask for millimetres.
Amendment C adds the second half: it must refuse the right noun.** *"This wall is too short"* is
false under the run reading — the wall may be enormous. **[inference]**

The sentence says, in substance, *"the stretch you asked us to furnish cannot hold a kitchen"*, and
the natural remedy it implies is one the customer can actually act on: **furnish more of the wall.**
That is a remedy, where *"find another 100 mm of wall"* was not — **which is the ruling of
2026-09-15 satisfied, in copy, a day later.**

**Wave 7F2 owns the sentence and it is still unwritten. [source-verified]** The Romanian
localisation gates are closed, so this is a copy change entering the lock through 7F2 rather than a
correction to shipped text.

### C2 — Sink and hob on the wider wall, fridge on the narrower: MEASURED, and the generator does not implement it

**The coordinator asked for this to be measured rather than reasoned about. It was.** Executed
against a fresh build of the current source, sweeping wall A 900–6300 and wall B 1000–5100 at 50 mm,
keeping only rooms `APPROVED_ROOM_POLICY` accepts and `planKitchenComposition` reports
`minimumMet` for — **8 615 rooms. [measured]**

**Aggregate, which is the misleading view and is shown first for that reason:**

| | share |
| --- | ---: |
| sink on the wider wall | 83.5 % |
| hob on the wider wall | 69.3 % |
| fridge on the narrower wall | **51.7 %** |

**Split by which wall is actually wider, which is the discriminating view: [measured]**

| | **A wider** (5 209 rooms) | **B wider** (3 335 rooms) |
| --- | ---: | ---: |
| sink on the wider wall | 95.6 % | 64.7 % |
| hob on the wider wall | **100.0 %** | **21.2 %** |
| fridge on the **narrower** wall | 82.3 % | **0.0 %** |

**The verdict: it correlates, and it does not implement.** A rule keyed on *width* cannot be 100 % on
one side of the split and 21.2 % on the other. **A rule keyed on *wall A* can, and that is what is
there.** And the fridge is on the narrower wall in **0.0 %** of the 2 760 B-wider rooms that have
one — the shipped behaviour is the **exact inverse** of the owner's rule whenever wall B is the wider
wall.

**Why, from the source. [source-verified]** `chooseWallCut` computes
`preferred = kept[0]?.role === "fridge" ? 1 : 0` and sorts the feasible cuts by distance from it.
Cut 1 puts the fridge on wall B and everything after it on wall A. **`capacities` enters only as a
feasibility filter — `sumWidths(...) <= capacities.B && sumWidths(...) <= capacities.A` — and never
as a preference.** There is no comparison of A's length to B's anywhere in the module. The
correlation arises because wall A is the longer wall in most *accepted* rooms, so "always wall A"
looks like "the wider wall".

**A worked counterexample, from the sweep: [measured]** a **900 × 3500** room. Wall B is the wider
wall by 2 600 mm. The generator places the sink on B and the hob on B — correct by luck, since wall A
at 900 has no free run at all — **and the fridge on B as well**, where the owner's rule puts it on A.
All three bodies on the wider wall, with the narrower wall bare.

**Classification: contract gap, and the fifth appearance of this milestone's recurring defect.**
Not an implementation defect — `chooseWallCut` does exactly what ADR 0110 Amendment A1's reading
order specified, and that specification never mentioned width. **The defect is the family ADR 0119
decision 7 names: *a check that cannot distinguish the property it claims to hold*.** A spot-check on
typical rooms — where A is wider — returns 100 % and 82 % and reads as confirmation that the rule
works. **The rooms that discriminate are the ones nobody screenshots**, and they are 39 % of the
accepted range.

**This record does not design the fix.** It records that the rule is not implemented, that the
current behaviour is keyed on a wall identity rather than a dimension, and that any fix owes a test
**split by which wall is wider** — an aggregate figure over the whole sweep would have passed at
83.5 % and hidden a 0.0 %.

### C3 — Two different 4-metre numbers, and a reader will conflate them

**They are consistent. They are not the same claim, and neither implies the other. [inference]**

| | [Amendment B1](#amendment-b--2026-09-16-the-products-intended-size-range-is-walls-up-to-about-4-metres-and-it-narrows-no-bound) | Amendment C's ruling |
| --- | --- | --- |
| **The claim** | *"let's focus on medium, small or medium, like till four meters per wall"* | *"in case wall have more than 4 meters it can fit on any wide wall… you can place all including fridge on same wall"* |
| **What it is about** | **Which customers to optimise for.** A market judgement. | **When the layout rule relaxes.** A geometric threshold. |
| **What it governs** | Priority between two correct behaviours | Whether the wider/narrower split applies at all |
| **Direction** | Above 4 m is *the tail we do not tune for* | Above 4 m is *where a single wall can hold everything* |

**The conflation to guard against, stated as the sentence somebody will write:** *"the owner said
4 metres, so above that we do not have to care."* **B2 already refuses half of that** — B1 narrows no
bound and large rooms must remain correct. **C3 refuses the other half**: above 4 m is not a region
the product stops caring about, it is a region where the product is *allowed to do something simpler*.
**A relaxation is not a licence to be wrong.**

**And note the shape they share, because it is the interesting part.** Both say the same thing about
constraint: **below 4 m the geometry forces the product's hand, and above it the product has
choices.** B1 says the choices are not worth tuning; C3 says one particular choice — everything on one
wall — becomes available. **Consistent, and they meet at the same number for the same underlying
reason: 4 m is about where one wall stops being a scarce resource.** That reason is worth recording
because it is what makes the coincidence not a coincidence.

### What this amendment does to the findings

| Finding | Amended verdict |
| --- | --- |
| **F1** — wall B's minimum | **Unchanged in arithmetic; its justification changes and gets stronger.** It is now a refusal to furnish more than the customer asked for, not a claim about their wall. |
| **F2** — the reserve, and the paired invariant | **Unchanged and still binding.** |
| **F3** — the coupled rule | **Unchanged in arithmetic**, and it now asks a better question. |
| **F4** — `MINIMUM_NOT_MET` | **Unchanged.** |
| **F5** — the silent 1C refusal | **Unchanged, and its copy gains a second constraint** (C1's noun, on top of decision 3's "no millimetres"). |
| **F6** — the maxima | **Weakened further.** A cap on a *run* has no physical basis at all, and the ruled 6000 mm is still unapplied. |
| **F7** — `offeredCabinetDepthsMm` | **Unchanged.** |
| **New: the run-end panel veto** | **Inverts under the run reading, and conflicts with an owner ruling** (ADR 0045 Amendment A). Q-C2. |
| **New: `chooseWallCut`** | **Contract gap, measured.** The wider-wall rule is not implemented. |

### What the milestone owes — reported, not written

*(`docs/milestones/M7-room-and-presets.md` is held by two other agents; this is a report for the
coordinator to sequence, not a punch list.)*

1. **7F2** already owns the 1C sentence. It gains C1's constraint on the **noun**, alongside decision
   3's on millimetres. **No new wave.**
2. **The field copy** (*"Perete A"* → a label naming the length to furnish) is a **new obligation with
   no home** at HEAD. It is copy, so it enters the lock; it is one leaf pair plus the summary at
   `ro.json:66`. **This is the item most likely to be dropped**, because it looks like a wording tweak
   and is the whole of C1 reaching the customer.
3. **`chooseWallCut`** needs the wider-wall rule and the 4 m relaxation. **No wave owns it** — 7D3
   and 7D4 own the tall-end rule, not the cut. **An obligation with no home.**
4. **The run-end panel veto** owes nothing until Q-C2 is answered.
5. **The 6000 mm policy-literal edit** is ruled and unapplied. Already known to the plan.

### The questions, drafted as they should be put

**Q-C1 — does the entered number include what is already there?** *(Asked because the ruling says
what the number is not, and leaves one case open.)*

> *"You said people often furnish only part of a wall, and we should ask for that part rather than
> the whole wall. If someone's wall is 5 metres and they want 3 metres of kitchen, they type 3. What
> if there's a fridge or a boiler already standing in the other 2 metres — do they still type 3, and
> we just never know about the rest of the wall? Or do you want to ask about the whole wall and let
> them mark the part to furnish?"*

**Consequence:** the first keeps one number per wall and the product never learns the room's real
size. The second is a second field per wall and a different screen. **[inference]** The first is what
the ruling literally says and is far cheaper; the question exists because the answer determines
whether the 3D room can ever be drawn truthfully (Q-C3).

**Q-C2 — the finished end, where a run stops mid-wall.**

> *"Today we don't fit an end panel when the run reaches the wall — you told us in September, 'no
> panel when run hits wall', because a fitter closes that gap with a filler strip. But now the number
> someone types is how much they want furnished, not how long the wall is. So a run can end in the
> middle of a wall with nothing beside it. Should that end get a finished panel?"*

**Consequence:** *yes* means the veto reads a real wall length the product no longer collects, which
depends on Q-C1. *No* means an exposed carcass side mid-wall. **[inference]** **This is the question
Q-C1 should be asked before**, because one answer to Q-C1 makes this one easy and the other makes it
hard.

**Q-C3 — what the 3D room should draw.**

> *"The 3D room now draws walls exactly as long as the numbers typed in. If those numbers are the
> part someone wants furnished, the room on screen is smaller than their real room. Would you rather
> the picture showed the kitchen they're buying, or the room they're standing in?"*

**Consequence:** the first is what ships today and needs no work. The second needs the real wall
length, which is Q-C1 again. **Ask all three together; they are one question wearing three hats.**

### Sweep for this amendment

| Record | What it says | How it is settled |
| --- | --- | --- |
| This record, decision 1 | The room is a fact and the kitchen adapts to it. | **Kept, subject sharpened.** The fact is the intended run. A decision overridden is worse than a measurement overridden. |
| This record, decision 3 | A refusal may state a floor, never ask for millimetres. | **Extended by C1**: it must also refuse the right noun. |
| [Amendment B](#amendment-b--2026-09-16-the-products-intended-size-range-is-walls-up-to-about-4-metres-and-it-narrows-no-bound) | Optimise for walls to about 4 m; narrows no bound. | **Consistent, and C3 states the difference explicitly** so the shared number is not read as one rule. |
| [ADR 0045](0045-a-run-end-panel-is-a-scene-fact-and-the-wall-end-vetoes-it.md) Amendment A | Owner: *"No panel when run hits wall."* | **In conflict under the run reading, and NOT resolved here.** It is an owner ruling drafted in terms of a wall; Q-C2 puts it back to them. |
| [ADR 0083](0083-wall-coverage-is-the-runs-extent-and-the-finished-end-is-part-of-it.md) | Wall coverage is the run's extent, and the finished end is part of it. | **The nearest relative, and it reads differently now.** That record already treats *the run* as the quantity that matters; this ruling makes the customer's input the same quantity. |
| [ADR 0110](0110-generation-inserts-through-the-command-path-and-the-corner-is-structural-data.md) Amendment A1 | The reading order — fridge, sink, preparation, hob — and the B-then-A traversal. | **Untouched as an order; incomplete as a placement rule.** A1 never said which wall is which, and C2 measures that the gap was filled by wall identity rather than by width. |
| [ADR 0119](0119-a-remembered-fact-about-this-repository-is-a-claim-to-recheck-and-true-at-head-is-not-true-at-the-end-of-the-milestone.md) decision 7 | A check must tell a thing from a mention of it. | **C2 is a fresh instance, measured rather than argued.** 83.5 % aggregate hides 0.0 % on the discriminating half. Also paid for itself in the drafting: `planKitchenComposition`'s signature had gained a required `columns` argument since this record's first draft, and the measurement failed loudly instead of silently measuring stale `dist`. |
| Wave 7H, Q7H-1 | Ruled (a): the drawn wall is the entered wall. | **Answered correctly to the question as then posed.** The terms have changed underneath it; Q-C3 re-asks it. **7H shipped no defect.** |

## Amendment D — 2026-09-16: Q-C1, Q-C2 and Q-C3 answered, and all three confirm what already ships

Amendment C closed with three questions and the note that they were *"one question wearing three
hats"*. The owner answered all three the same afternoon, within an hour of the amendment landing.
**Every answer is the cheap one, and together they mean no engine or rendering work is owed** — the
single obligation C1 created is a copy change, and it survives untouched.

**The answers, verbatim** (owner, 2026-09-16):

> 1. *"if they insert 3 and need only 3 meters of cabinets kitchen should have only those 3 meters"*
> 2. *"no panel needed"*
> 3. *"the kitchen we build only (you have no idea what is the real room size and we don't care about)"*

### D1 — Q-C1: one number per wall, and the product never learns the room

**Ruled: the entered number is the whole of what the product knows about that wall.** There is no
second field, no "wall length" beside "length to furnish", and no inference of the remainder. A
customer who types 3 gets three metres of cabinets, and the other two metres of their wall do not
exist as far as this product is concerned.

**This is the literal reading of Amendment C's ruling, and it settles C1's open case by refusing the
question's premise.** C1 asked what happens when a boiler or a fridge already stands in the
unfurnished remainder. The answer is that the remainder is not modelled at all, so the situation has
no representation to get wrong. **[inference]** The customer handles it by typing a smaller number.

**What this closes.** Amendment C1 raised the two-field screen as the expensive alternative and noted
it *"is a second field per wall and a different screen"*. **It is refused, not deferred.** A later
wave proposing to collect the real wall length is reopening this ruling and owes a dated decision.

### D2 — Q-C2: no panel, and the finding that the veto "inverts" is WITHDRAWN

**Ruled: a run ending mid-wall gets no finished end panel.** The shipped behaviour is correct.

**Verified at HEAD before recording this. [source-verified]** `runEndPanelSeatM`
(`run-end-panel.ts:99-116`) returns `undefined` when `passesWallAEnd(seatM, room)` — that is,
when the panel's outer face would pass `wallLengthMm("A", room)`, which under the run reading is the
end of the customer's run. **So the veto already fires exactly where the owner wants no panel.
Amendment C predicted an inversion; the ruling means there is none. C's "New: the run-end panel
veto" finding is withdrawn, and ADR 0045 Amendment A stands unamended in its behaviour.**

**One thing is left wrong, and it is a comment rather than a behaviour.** The head comment at
`run-end-panel.ts:94-98` justifies the veto as *"a fitter closes that gap with a filler strip"* — a
sentence about a physical wall that is no longer there. **The code is right and its stated reason is
false**, which is the more dangerous of the two states: a later reader who finds the reason wrong is
one step from concluding the behaviour is wrong and "fixing" it. **The correction is owed, and it is
a comment-only edit deliberately not made here** — `packages/configurator-domain` has an implementer
in flight on `body-choice.ts` at the time of writing, and this milestone has four freeze violations
already. **It lands with the next wave touching that package.**

**The lesson worth keeping, because this is the second time it has happened this milestone.** ADR
0045 Amendment A was an owner ruling recorded with the owner's *reason* attached. The ruling survived
the change of premise; the reason did not. **A recorded reason is not a second authority for the
ruling it accompanies** — when the premise moves, re-ask rather than deducing the new answer from the
old reason. Amendment C did the right thing by putting it back to the owner instead of resolving it.

### D3 — Q-C3: draw the kitchen, not the room; 7H is confirmed, not corrected

**Ruled: the 3D view shows the kitchen being bought.** The owner's phrasing is the strongest form of
the answer — *"you have no idea what is the real room size and we don't care about"* — and it is
consistent with D1, which is why the product has no idea: it never asked.

**Wave 7H's Q7H-1 was ruled (a), *the drawn wall is the entered wall*, before the run/wall
distinction existed. Amendment C flagged that it had answered a question whose terms then changed.
It is now re-answered on the new terms and the answer is the same.** `resizeShellToRoom` needs no
change, and 7H is confirmed correct twice over rather than merely "shipped no defect".

### What survives all three answers

| From Amendment C | After D |
| --- | --- |
| **C1's field copy** — *"Perete A"* names the wrong quantity (`ro.json:54-58`, `dimensions-form.tsx:39-43`) | **Untouched and now the only C1 obligation.** D1 makes it *more* load-bearing: the label is the single place the customer is told what number to type, and the product has no second source for it. **7F2 owns the refusal sentence; this label has no wave.** |
| **C2's `chooseWallCut`** — the wider-wall rule is not implemented, measured | **Untouched.** None of these three answers concerns which wall a body lands on. Still an obligation with no home. |
| **C1's run-end panel finding** | **Withdrawn by D2.** Replaced by a comment correction. |
| **C1's 3D under-draw finding** | **Withdrawn by D3.** It was never a defect; it is now not even a divergence. |
| **C3's two 4-metre numbers** | **Untouched.** Neither is touched by these answers. |
| **Decision 3 + C1's noun constraint on the 1C sentence** | **Untouched and sharpened by D1.** The refusal talks about the stretch the customer asked to furnish, and under D1 there is no other stretch it could mean. |

### Sweep for this amendment

| Record | What it says | How it is settled |
| --- | --- | --- |
| [Amendment C](#amendment-c--2026-09-16-the-entered-number-is-the-run-the-customer-wants-furnished-not-their-wall) C1 | The entered number is the run; the two-field screen is the alternative. | **Confirmed, and the alternative refused.** D1. |
| Amendment C, "New: the run-end panel veto" | The veto inverts under the run reading. | **WITHDRAWN.** D2. The prediction was sound and the ruling went the other way. |
| Amendment C, the 3D shell under-draws | The room on screen is smaller than the real one. | **WITHDRAWN as a concern.** D3 — that is the intended picture. |
| [ADR 0045](0045-a-run-end-panel-is-a-scene-fact-and-the-wall-end-vetoes-it.md) Amendment A | Owner: *"No panel when run hits wall."* | **Behaviour stands unamended.** Its recorded *reason* — the fitter's filler strip — is false under the run reading and owes a comment correction in `run-end-panel.ts:94-98`. |
| Wave 7H, Q7H-1 | Ruled (a): the drawn wall is the entered wall. | **Re-answered on the new terms; same answer.** 7H confirmed correct. |
| This record, decision 1 | The room is a fact and the kitchen adapts to it. | **Kept.** D1 makes the fact singular: the entered run is the only fact there is. |

## Amendment E — 2026-09-17: Amendment C2's obligation has a home, and the key is the entered wall length

> **Read the letter carefully: this is *ADR 0120* Amendment E, and it is not *ADR 0110* Amendment E.**
> The two records share a letter and are cited within a paragraph of each other throughout this
> milestone. ADR 0110's Amendment E is the **tall-unit and oven** amendment; this one is the
> **wall-keying** amendment. Every cross-reference below names its record. **This is
> [C3](#c3--two-different-4-metre-numbers-and-a-reader-will-conflate-them)'s hazard in a new costume
> — two things a reader will conflate — so it is flagged at the head rather than left to be
> discovered.**

**Written 2026-09-17 for wave 7D8 slice S1(b).** This amendment **decides** something Amendment C2
deliberately did not: it names the key. It is the architect's adjudication on a measured question,
not an owner ruling, and it overturns nothing — **C2 left the fix undesigned and unowned, and this
records who owns it and what it is keyed on.**

**Its companion is [ADR 0110 Amendment I](0110-generation-inserts-through-the-command-path-and-the-corner-is-structural-data.md#amendment-i--2026-09-17-the-block-follows-the-run-not-the-letter-a-and-a1s-order-survives-its-own-mirror)
of the same date**, which carries the owner ruling on where the tall block may stand. **This record
says what decides which wall the run starts on; that record says what the block does once it is
decided.** Neither is complete alone.

**Where the figures come from, before any of them is used.** Every count below is taken from **wave
7D8's plan** (`docs/milestones/M7-room-and-presets.md`, sections E0.1, E0.2, E1, E2 and E6), measured
on 2026-09-16 against a `tsc` build of `packages/configurator-domain/src/` at `8201915`, sweeping
this policy's L bounds at **10 mm** and keeping the **211 551** rooms `planKitchenComposition`
reports `minimumMet` for. **They were not re-measured here**; this record's warrant for them is
**doc-quoted from that plan** and the plan's is **[measured]**. C2's own 50 mm figures are quoted
beside them where the comparison is to C2. **The plan reproduced C2's sweep to the digit from one
instrument, and closed the one parameter C2 never stated — the ceiling — by re-running at 2200,
2600 and 3900 with every figure identical**, so the two populations are one population and this
amendment introduces no third number.

### E1 — C2's obligation was open at HEAD, and it is now wave 7D8's

**Checked at HEAD `5c915f8` rather than taken on trust, because this amendment's whole purpose is to
close it and closing something already closed would be worse than leaving it.** Three statements in
this record, read in order:

1. **[C2](#c2--sink-and-hob-on-the-wider-wall-fridge-on-the-narrower-measured-and-the-generator-does-not-implement-it)
   itself:** *"This record does not design the fix. It records that the rule is not implemented, that
   the current behaviour is keyed on a wall identity rather than a dimension, and that any fix owes a
   test **split by which wall is wider**."*
2. **[What the milestone owes](#what-the-milestone-owes--reported-not-written), item 3:**
   *"`chooseWallCut` needs the wider-wall rule and the 4 m relaxation. **No wave owns it** — 7D3 and
   7D4 own the tall-end rule, not the cut. **An obligation with no home.**"*
3. **[Amendment D](#amendment-d--2026-09-16-q-c1-q-c2-and-q-c3-answered-and-all-three-confirm-what-already-ships)'s
   survival table, the row that matters:** *"**C2's `chooseWallCut`** … **Untouched.** None of these
   three answers concerns which wall a body lands on. **Still an obligation with no home.**"*

**So Amendment D did not discharge it, and said so in its own words.** D answered three questions
about what the entered number *means*; C2 is about which wall a body *lands on*. They are adjacent
and they are not the same question.

**Ruled: wave 7D8 owns it.** The obligation now has a home, a plan, and acceptance criteria stated
**split by which wall is wider** exactly as C2 required — its criteria 1, 2 and 3 report both arms
separately and its criterion 5 asserts that **nothing outside the discriminating arm moves.**

### E2 — The key is the entered wall length, and the two candidates disagree in 1.83 % of rooms

**Two candidate keys exist. [doc-quoted from the 7D8 plan, E1]**

| candidate | what it is |
| --- | --- |
| **the entered wall length** | `room.widthMm` against `room.depthMm` — the two numbers the customer typed |
| **the free run capacity** | `runs.A` against `runs.B` — the entered length **less the corner's reach**, 900 mm on A and 1000 mm on B |

**They rank the walls differently in 3 861 of 211 551 placed rooms (1.83 %)** — at 50 mm, **213 of
8 615 (2.5 %)** — and the divergent population has an exact description: **every room whose two
entered lengths differ by less than 100 mm**, which is the difference between the two corner reaches.
**[doc-quoted from the plan, E1]**

**Ruled: the key is the entered wall length.** Two reasons, and the second is the durable one.

1. **It is the quantity the owner's sentence names.** The ruling at this amendment's parent —
   *"on wider wall you always place the sink and hub, and fridge you place on narrower wall"* — says
   *wider wall*, and under **[C1](#c1--what-the-number-means-and-it-is-not-what-the-form-asks-for)**
   the entered number **is** the run the customer chose to furnish. Under **D1** it is the *whole* of
   what the product knows about that wall. **So *wider* means *the bigger of the two numbers they
   typed*, because there is no other number.**
2. **The corner's reach is a fact about the corner, not about which wall is wider.** Keying on
   capacity would make *"which wall is wider"* mean something **no customer can compute from the two
   numbers they entered** — a 3000 × 2950 room would have its roles placed by a 50 mm asymmetry in
   the corner assembly that appears on no screen. **That is this milestone's recurring defect wearing
   the fix's clothes**: a key that correlates with the named quantity and is not it
   ([ADR 0121](0121-a-thing-is-identified-by-what-it-is-and-the-discriminating-case-is-the-one-nobody-screenshots.md)).

**The 1.83 % is recorded here precisely because it is the population a later reader will "fix" in the
other direction.** A room where the entered lengths differ by 40 mm and the free runs differ the
other way looks, from inside the generator, like a bug. **It is this ruling.** A wave that re-keys it
onto capacity is overturning a dated decision and owes its own record.

**And the choice is falsifiable rather than argued, which is why it can be a criterion.** The plan
implemented **both** keys and swept both, reporting the hob-on-the-wider-wall rate under each of the
two *splits*: **keyed on entered length it reads 100.0 % / 100.0 % on the entered-length split and
98.7 % / 100.0 % on the free-run split; keyed on capacity the pattern inverts.** **[doc-quoted from
the plan, E1]** **The split that reads 100 / 100 names the key** — and a criterion reading 100 / 100
on *both* splits has discriminated nothing and fails the wave. **This is C2's own requirement carried
one step further:** C2 demanded a test split by which wall is wider; the wave reports **two** splits
and shows which one the code answers.

### E3 — Why this is a re-keying and not a comparator, recorded because C2's own wording invites the wrong fix

**C2 described the defect correctly — *"`capacities` enters only as a feasibility filter … and never
as a preference"* — and that true sentence leads a reader to a fix that cannot work.
[doc-quoted from the 7D8 plan, E0.2, which marks the underlying argument source-verified and its
falsification measured]**

`GENERATION_PRIORITIES` is **fridge → sink → preparation → hob**, `builtPlan` sends `kept.slice(0, cut)`
to wall **B** and `kept.slice(cut)` to wall **A**, and `PREFIX_WALL` is the literal `"B"`. With **B**
the wider wall the owner's rule needs `fridge ∈ A` **and** `sink, hob ∈ B`. The fridge is the order's
**first** element, so `fridge ∈ A` forces `cut = 0` — which puts the sink and the hob on A with it.
**The rule is unreachable at every cut index, for any preference function whatsoever.** The plan
falsified this rather than arguing it: a variant ranking the feasible cuts lexicographically by rule
compliance produced output **identical on all 8 615 rooms** of the 50 mm sweep to the plain re-keying.

**So the fix is that the wall carrying the reading order's prefix becomes a function of the entered
wall lengths, instead of the module constant.** **The blast radius is exactly the discriminating
population:** **82 395 of 211 551 rooms change (38.95 %) — 0.00 % of the A-wider rooms and 100.00 %
of the B-wider ones — and `minimumMet` flips in 0 of 222 351 swept rooms.** **[doc-quoted from the
plan, E2]** **No room becomes buildable and none becomes unbuildable**; the wave moves where the
cabinets stand and never whether a kitchen exists.

**This is recorded in C2's own record because C2 is where the next reader will start.** The sentence
that misleads is C2's, it is true, and a correction that lives only in a milestone plan will not be
found by someone reading the ADR.

### E4 — The 4-metre relaxation is a permission the corrected generator never needs, and its absence is the compliance

**Held apart from [Amendment B1](#amendment-b--2026-09-16-the-products-intended-size-range-is-walls-up-to-about-4-metres-and-it-narrows-no-bound)'s
four metres, per [C3](#c3--two-different-4-metre-numbers-and-a-reader-will-conflate-them), and the
separation is restated because this is the first wave to act on either.** B1 is a **market judgement**
about whom to optimise for and narrows no bound. C's clause — *"in case wall have more than 4 meters
it can fit on any wide wall… you can place all including fridge on same wall"* — is a **geometric
threshold** for when the layout rule relaxes. **Neither implies the other, and *"the owner said
4 metres, so above that we do not have to care"* is the sentence both halves exist to refuse.**

**Measured. [doc-quoted from the 7D8 plan, E6]** **25 190 of 211 551 placed rooms (11.91 %) have both
entered walls over 4 000 mm**, **5 995** of them B-wider. **And in all 25 190, the corrected
generator already stands the fridge on the narrower wall, and in none of them is the fridge dropped.**
Above 4 000 mm on both walls the narrower wall offers at least 3 000 mm of free run and a 700 mm
fridge always fits, so the cut never collapses.

**Read against the free run instead of the entered length, the population collapses to 1 400 (0.66 %)**
— a second, independent reason to key the whole rule on the entered length (E2). **The same choice
answers two questions, which is worth noting because it is the kind of agreement that makes a key
right rather than merely chosen.**

**Ruled: the relaxation is satisfied by doing nothing, and a `> 4000` branch would be dead code.**
It enters the wave as a **must-not — no `4000` literal in `generation-priorities.ts`** — plus **one
line at the keying site saying that the clause's absence *is* the rule being satisfied**, so that a
later reader who greps for `4000`, finds nothing, and concludes the ruling was never implemented is
corrected at the place they are standing.

**The trigger that would make the branch live, recorded in
[ADR 0118](0118-a-problem-that-has-not-occurred-is-recorded-with-its-trigger-and-not-built-for.md)'s
shape and not built for:** *when a later ruling lets the wider-wall rule **drop a body** — wave 7D8's
**Q-7D8-2** answered the other way — then above 4 m becomes the region where it must not, and the
branch is written then.* **[This is 0118 decision 3's form: it names its trigger and not its
likelihood, so it can be acted on and it can be closed.]** Until that ruling exists, **building the
branch is building machinery for a state the system has never been in**, and 0118 decision 4's
discriminator does not rescue it: the cost of adding the branch later does not rise at any datable
event, because nothing is stored, migrated or authored against it.

**And the permission is not a licence.** C3's second half stands: **above 4 m is not a region the
product stops caring about, it is a region where the product is *allowed* to do something simpler.**
The corrected generator declines the permission and is correct there anyway — **which is the best
possible outcome for a relaxation and the easiest one to misread as an oversight.**

### E5 — What this amendment does not do

- **It does not reopen C1, D1, D2 or D3.** The entered number is still the run; there is still no
  second field; the run-end panel still gets no finished end; the 3D still draws the kitchen.
- **It does not discharge C1's field-copy obligation** (*"Perete A"* names the wrong quantity,
  `ro.json:54-58`, `dimensions-form.tsx:39-43`). **That is still an obligation with no wave**, and it
  is the item most likely to be dropped because it looks like a wording tweak. **It is named again
  here so that closing C2 does not read as closing Amendment C.**
- **It does not answer Q-7D8-2** — whether the wider-wall rule may cost a cabinet. The wave is
  planned for *the ladder wins*: **no body is dropped to satisfy this rule.** That is a criterion,
  not a ruling, and the owner may rule otherwise in a new dated record.
- **It rules nothing about where the tall block stands.** That is the owner's, and it is at
  [ADR 0110 Amendment I](0110-generation-inserts-through-the-command-path-and-the-corner-is-structural-data.md#amendment-i--2026-09-17-the-block-follows-the-run-not-the-letter-a-and-a1s-order-survives-its-own-mirror).

### Alternatives considered — Amendment E

1. **Key on the free run capacity.** Refused (E2): it is not the quantity the owner named, and it
   makes *wider* uncomputable from the two numbers the customer typed. **Its 1.83 % of divergent
   rooms is recorded so the refusal is falsifiable rather than a preference.**
2. **Add a width comparison inside `chooseWallCut` and leave `PREFIX_WALL` alone.** Refused, and
   **falsified rather than argued** (E3): unreachable at every cut index, and a lexicographic variant
   measured identical to the re-keying on all 8 615 rooms.
3. **Implement the 4-metre relaxation as a `> 4000` branch.** Refused (E4): dead code on every room
   the policy admits, with its trigger recorded instead.
4. **Leave C2's obligation unowned until the wave closes and record it then.** Refused. C2 has been an
   obligation with no home across two amendments and one owner round; **a record that names its owner
   before the code lands is the only version of this that cannot be lost.** It is also wave 7D8's own
   sequencing: **slice S1 lands before slice S2 writes a line of code.**

### Sweep for this amendment

| Record | What it says | Standing after E |
| --- | --- | --- |
| This record, **Amendment C2** | `chooseWallCut` is keyed on wall identity; the rule is not implemented; *"this record does not design the fix"*; any fix owes a test split by which wall is wider. | **Measurement confirmed and reproduced to the digit; obligation DISCHARGED into wave 7D8.** The fix is named (E2), its unreachable alternative falsified (E3), and the split-by-width requirement is carried into the wave's criteria 1–5. |
| This record, **Amendment C1 / D1** | The entered number is the run the customer wants furnished, and it is the whole of what the product knows. | **Load-bearing, and it is reason 1 for the key.** *Wider* can only mean the bigger of the two entered numbers, because under D1 there is no other number. |
| This record, **Amendment C3** | Two different 4-metre numbers; a reader will conflate them. | **Applied, and its guard sentence restated** (E4). The relaxation is declined by a generator that is correct without it. |
| This record, **Amendment D2** | A recorded reason is not a second authority for the ruling it accompanies. | **Applied in the companion record** (ADR 0110 Amendment I3), where the engineering argument is kept and demoted. |
| This record, **decision 1** | The room is a fact and the kitchen adapts to it. | **Kept, and this is the amendment that makes it operative in the generator.** Until now the kitchen adapted to *wall A*; after the wave it adapts to the wider of the two numbers the customer gave. |
| [ADR 0110](0110-generation-inserts-through-the-command-path-and-the-corner-is-structural-data.md) **Amendment A1** | The layout order, and the run reading from wall B's free end. | **Order restated, run-start corrected** — at ADR 0110 Amendment I5, on the owner's *"sometimes the arrangement is in mirror"*. **The correction is the direct consequence of this key.** |
| [ADR 0110](0110-generation-inserts-through-the-command-path-and-the-corner-is-structural-data.md) **Amendment E (the tall-unit one)** | The block stands at wall A's free end *"and nowhere else"*. | **OVERTURNED in its wall by the owner**, recorded at ADR 0110 Amendment I. **Not this record's doing and not this record's to rule.** |
| [ADR 0108](0108-a-room-is-validated-against-policy-data-and-the-interim-policy-is-the-engines-own-limits.md) | The room bounds and the minimum kitchen. | **Untouched.** `minimumMet` flips in **0 of 222 351** swept rooms; no bound moves and no room's admissibility changes. |
| [ADR 0117](0117-generation-produces-the-cheap-correct-baseline-and-the-owners-taste-enters-through-presets.md) | Generation owes the cheap, correct baseline; taste enters through presets. | **Respected.** This is an owner-stated rule being implemented, not a taste rule inferred from how a kitchen looked in one room. |
| [ADR 0118](0118-a-problem-that-has-not-occurred-is-recorded-with-its-trigger-and-not-built-for.md) | Record a foreseeable problem with its trigger and build nothing. | **Applied once and by the book** (E4): the 4-metre branch is named, its trigger stated as *when Q-7D8-2 is answered the other way*, and **no code is written for it.** |
| [ADR 0119](0119-a-remembered-fact-about-this-repository-is-a-claim-to-recheck-and-true-at-head-is-not-true-at-the-end-of-the-milestone.md) | Re-read a claim at HEAD before asserting it. | **Applied to the one claim that would have wasted this amendment.** *"C2 is still open"* was re-read at `5c915f8` in three places (E1) rather than taken from the brief that commissioned this slice. |
| [ADR 0121](0121-a-thing-is-identified-by-what-it-is-and-the-discriminating-case-is-the-one-nobody-screenshots.md) | A thing is identified by what it is, never by what correlates with it; measure a rule stated in a quantity **split by that quantity**. | **This amendment is its first instance being closed.** 0121's *Consequences* says *"`chooseWallCut` remains an open obligation with no wave"* (line 331 at `5c915f8`), and its index row in `README.md` says *"still unfixed and owned by no wave"*. **Both are out of date from this date, and this is the record that dates them.** Decision 5 is what E2's two-split instrument implements. |
