# Backlog — open items

Things found in use that are **not** currently being fixed and are **not** in a milestone plan. A
finding recorded only in a chat log is a finding lost.

This file is for product behaviour observed by someone using the app. It is not:

- **`docs/decisions/`** — the durable "why" behind the code. When a backlog item is decided, the
  decision goes there and the item leaves this file.
- **`docs/STATUS.md`** — where the project stands, including engineering deferrals from review
  rounds. Those stay there; this file does not duplicate them.
- **A milestone plan.** An item here has no owner and no phase until someone gives it one.

Each entry records what was observed, what is actually true in the code, and what deciding it would
cost — so the next person can act without re-deriving the investigation.

This is one of three backlog files — see `docs/BACKLOG.md` for the index. **This file holds the
still-open items.** `docs/backlog/resolved.md` holds everything already fixed and shipped — skip it
unless you are specifically researching a past decision.

Ordering below: items the owner or an architect has already **ruled or scheduled** (awaiting a wave)
come first; fully **undecided** items follow, in their original relative order. An "Also open,
recorded elsewhere" appendix closes the file, for items whose full record lives in another document.

---

## Ruled or scheduled, awaiting a wave

## 66. The catalogue has three full-height rows and no broom / utility unit — DEFERRED TO AFTER BETA, 2026-09-14

> **Ruled by the owner, 2026-09-14**, while settling wave 7D3's tall-unit composition: *"add pantry and
> other cabinets let for later, adding new cabinets will be like after having the beta testing… lets
> focus now on building algorithm"*. Recorded at
> [ADR 0110](../decisions/0110-generation-inserts-through-the-command-path-and-the-corner-is-structural-data.md)
> Amendment E, **E12.4**. **Not part of wave 7D3, not planned, and gated on beta feedback** — it has no
> wave and must not be given one before the owner has run the built product.

**What is true in the code.** `buildInsertableBodyDefinitions` (`packages/configurator-domain/src/catalog.ts`)
declares exactly three full-height rows: `tall-oven-tower` (fixed 600, an oven and a microwave),
`tall-fridge-housing` (fixed 600, the niche for an integrated fridge) and `tall-pantry` (`'fit'`
400–800, two tiers of door leaves, ADR 0048). `fridge-free` is full height in the drawn sense but is a
free-standing appliance, priced at zero under ADR 0107, and is not a column.

**The gap, against the ordinary industry taxonomy.** The notable absence is a **broom / utility
unit** — a full-height cupboard with **one tall internal space** rather than shelves, for an ironing
board, a vacuum cleaner or a broom. The pantry cannot stand in for it: its two door tiers imply a
mid-height carcass division, so a customer who wants one tall void has nothing to choose. Behind that,
in rough order of how often they are offered: a **pull-out larder** (full-height wire or solid
pull-out), an **internal-drawer larder** (drawers behind full-height doors) and a **compact / midi
housing** for a single built-in oven or a microwave at eye level in a shorter column.

**Why it matters now.** Wave 7D3 composes a **block of up to three full-height columns** at a run's
free end (ADR 0110 E2, E12). Its door columns are `tall-pantry` because that is the only door column
the catalogue has — so **every generated three-column block is an oven tower plus two identical
pantries**. A broom unit is the first body that would make a generated block look like the owner's own
photographs rather than like a repetition, and the same argument applies to backlog entry 2's
long-storage-run question and to wave **7D4**.

**What deciding it would cost.** Each new row is a `catalog.ts` entry, a builder in
`packages/three-adapter`, a price rule, a `kind` leaf in both message catalogues (ADR 0095), and the
fidelity and parity coverage every body carries. The composition side is cheap by comparison: ADR 0110
E12.1 already says *"any number of door columns"*, so a new door column enters the block as **data**
with no rule change. **The expensive half is the body; the cheap half is using it.**

## 91. There is no full-height oven column without a microwave — RECORDED 2026-09-29, NOT IN M7B

> **Owner, 2026-09-29, relayed by the coordinator** while answering M7B's Q-U3 (how a U kitchen is
> composed), verbatim with its typos: *"can be 2 ovens like 2 near full heigh cabinets with ovens (but
> in that case no need to have 2 microwaves (we miss an oven cabinets wiithout microwave)"*. The
> coordinator's relay adds: note it for the backlog as a catalogue gap, and **do not add it in M7B**.
> Recorded at [ADR 0110](../decisions/0110-generation-inserts-through-the-command-path-and-the-corner-is-structural-data.md)
> Amendment N, N5.

**What is true in the code** (read at `dd9f63a`). `buildInsertableBodyDefinitions`
(`packages/configurator-domain/src/catalog.ts`) declares one oven column, `tall-oven-tower`: fixed at
600 mm, and it holds an oven and a microwave. No column holds an oven alone. This is the *"compact /
midi housing"* gap that entry 66 lists, now named by the owner for a particular use.

**Why it matters for M7B.** ~~In a large U, Amendment N lets the generator place two oven columns.~~
**2026-09-29, RQ5:** the generator places **one** oven column. The owner's *"allow second and third"*
leaves further ovens to the customer, and today the only column a customer can add is
`tall-oven-tower`, so every extra oven brings a microwave the owner says is not needed.

**What deciding it would cost.** Entry 66 lists the cost: a catalogue row, an adapter builder, a price
rule, a `kind` leaf in both message catalogues and fidelity coverage. On the composition side, a U's
second oven column then changes build id, which is data only. Entry 66's gate, beta feedback before
new cabinets, applies unless the owner rules otherwise. No owner, no phase.

## 2. Rearranging a run: re-split, and the narrow bottle cabinet — DECIDED 2026-08-26; RE-SPLIT MECHANISM DECIDED 2026-08-28

> **STILL OPEN, and now half planned.** ~~The re-split half now has its mechanism: [ADR 0037](../decisions/0037-adjacent-empty-columns-merge-into-one-space.md).~~
> ADR 0037 was built in wave 5D2b on 2026-08-29 and **withdrawn on 2026-08-30**: merging the columns
> without the re-split makes it worse, because §4 subtracts height and never width, so the first
> cabinet inserted into a merged span closes the level and strands the rest. **Clearing two adjacent
> cabinets still gives two openings.** The mechanism below is right and waits on the re-split.
>
> **AMENDED 2026-09-01 — [ADR 0046](../decisions/0046-adjacent-empty-columns-merge-under-a-cap-and-an-insert-splits-its-column.md).**
> The owner has revived the merge under an **800 mm cap** and decided the missing half is built first,
> as an **insert-time column split**: a body inserted into a column wider than itself is seated at one
> edge and the remainder becomes a new empty column. That is the *mechanism* option B needs — one span
> yielding several columns — and it ships in waves 5B4a and 5B4b (`docs/milestones/done/M5B-manual-ux-remediation.md`).
> **This entry stays open for the other half**: nothing offers a customer `800+600` versus
> `600+400+400` for a run, which is what option B's own wording describes. The cap does **not** by
> itself cure the stranding — the split does — and ADR 0046 records why.
> Adjacent columns that are empty at **every** level merge into one space — the same predicate ADR 0031
> funds a resize from. **800 mm still caps every cabinet**, so a merged 1400 mm space is filled with
> cabinets up to 800, never with one 1400. Option C (free-form width) stays rejected: ADR 0035's 50 mm
> stepper is option B at a finer module, not a numeric field.

**What was wrong:** clearing two adjacent cabinets gives two separate openings (800 and 600), never
one 1400. §4 merges openings vertically within a column; columns are frozen at load and never merge
horizontally. The consequence is that **the number and position of columns is permanent** — a
customer can never turn two cabinets into three.

**Decision (owner, 2026-08-26): module re-split is in scope. Free-form width stays rejected.**

Three levels were considered:

- **A — module widths, boundary move only.** §5.4's resize alone: 600 → 800 takes 200 from a
  neighbour, and the *count* never changes. Rejected as too limiting — "otherwise we stick to not a
  custom furniture but to like IKEA".
- **B — module re-split.** §12's design: a run's total offered as valid module combinations
  (`800+600`, `600+400+400`, `600+600+200`), never free-form arithmetic. **Chosen.**
- **C — free-form width.** A numeric field, any millimetre value. **Rejected**, confirming §13.2:
  "a numeric field invites invalid states and arithmetic the user shouldn't do". The owner's added
  reasoning: fixed sizes make the price far easier to pre-calculate, and "too much flexibility gave
  us a lot of issues and calculations".

**Why B is the right level, and it is worth keeping this argument.** The real workflow is: the
customer conveys a vision with this tool, then someone visits to measure, and the real price comes
from the real room. So the tool needs to express **intent** ("three cabinets along this wall, not
two"), not **precision** ("617 mm") — precision the measurement visit supersedes anyway. B is not
the IKEA option; A is. B is "you choose the rhythm of your kitchen, we build it to your room".

### The narrow bottle cabinet — an exception, not a new general floor

**AMENDED 2026-08-26, after the M5 architect flagged two conflicts.** The original wording here said
`MIN_WIDTH_M` moves from 300 to 200. **It does not. It stays at 300.**

The architect's finding: `MIN_WIDTH_M` is the floor `resolveWidth` applies to **every**
`widthFlex: 'fit'` body, so dropping it to 200 would make a 220 mm two-door base cabinet buildable
and offerable — not a product. Its proposed remedy was to drop the constant and give all eleven other
entries a `minWidthMm: 300` to raise them back.

**The owner chose the narrower change:** keep the general floor at 300 and make the bottle cargo a
single declared exception. One entry carries the exception instead of eleven carrying a correction,
and the exception is visible on the row that needs it.

**This also resolves the second conflict at no cost.** §5.4's donor rule is "the neighbour must remain
at or above `MIN_W`". Had the constant dropped to 200, resizing a 600 to 800 could have shrunk a
400 mm neighbour to 200 — producing a 200 mm cabinet as the **residue of somebody else's resize**
rather than as a deliberate choice. The owner's rule: *"the 200 cabinet will not be automatically
inserted, it should be deliberately selected."* With the constant unchanged, the donor rule is
already correct and needs no second constant.

**What implementation must do.** The two floors already exist and are deliberately distinct
(`insert-fit.ts`): §2's `MIN_WIDTH_M`, "no cabinet may go under", and ADR 0017's per-entry
`minWidthMm`, "this entry's builder cannot go under" — carrying different rejection codes so the
customer reads the right sentence. Today the per-entry floor can only **raise** the general one. The
cargo needs to **lower** it, so that mechanism gains a downward direction, for one entry, recorded in
its own ADR. §2's `MIN_W` then means "the default floor", not "an absolute floor", and that wording
change must be recorded rather than assumed.

**SHIPPED 2026-08-26 — `docs/decisions/0026-the-width-floor-has-a-direction.md`.** The cargo half of
this entry is built: `base-bottle-cargo`, `minWidthMm: 200`, widths `[200, 300]`, its own builder and
the vendored `base-bottle-cargo.svg` thumbnail. `MIN_WIDTH_M` is unchanged at 300 and `MIN_SPAN_M`
was not touched. **The size set's two members are not confirmed** — this entry fixes the range at
200–300 and leaves the members open, so `[200, 300]` awaits the owner. The re-split half (level B)
is still unbuilt and stays here.

**Not changed, and deliberately:** raising the general floor to 400. The owner raised it as a
possibility ("one door cabinet minimum should also be 400"). Standard chips are already 400/600/800,
so nothing is *chosen* below 400; the 300 floor only governs `'fit'` bodies filling an odd opening.
Raising it would begin refusing openings that work today — a separate decision with its own
consequences, not bundled here.

### Original wording, superseded by the amendment above

Kept because the near-miss is the point. **The two paragraphs below are wrong as written**: they say
`MIN_WIDTH_M` moves to 200, and it does not — see the amendment above and ADR 0026. Everything else
in them still holds.

The owner has one in their own kitchen: a ~200 mm pull-out for oil and vinegar bottles, "in the
majority of cases placed near the hob". It is a common cabinet and the catalogue has nothing like it.

**`MIN_WIDTH_M` moves from 300 mm to 200 mm.** That also makes the owner's own example
representable: 1400 = `600+600+200`.

**Do not lower the wrong constant.** Two constants sit at 0.3 today and they are different concerns:

- `MIN_WIDTH_M` (§2's `MIN_W`) — the narrowest **cabinet**, and M5's resize floor. **This becomes
  0.2.**
- `MIN_SPAN_M` — the shortest **vertical** free interval that becomes an opening
  (`subdivideFreeSpan` tests `heightM > MIN_SPAN_M + SPAN_EPSILON_M`). A 200 mm-tall sliver must
  still not become a slot. **This stays 0.3.**

**Knock-on effects to handle at implementation:**

- §9's width consequence line keeps saying "sub 300 mm nu se coboară" — the general floor is unchanged.
- The **width-floor** boundary tests stay pinned at 299/300 for the general floor; the cargo's own exception needs its own boundary case at 199/200.
  **Corrected 2026-08-26 (found by the M5 architect):** an earlier revision of this line said
  "ADR 0015's boundary tests". ADR 0015 is the **`MIN_SPAN_M`** record, and neither its rule nor
  its value moves — `MIN_SPAN_M` stays at 300, as the paragraph above says. Citing it here was
  precisely the wrong-constant edit this entry exists to prevent, made while writing the warning
  against it. Recorded rather than silently fixed, because the near-miss is the point.
- The bottle cabinet needs a **new builder** — nothing in `kitchen-parts.ts` builds a narrow
  pull-out cargo. Its size set is its own (200-300), not a new general module width: the standard
  set stays {400, 600, 800}.
- Every re-split combination must respect the new floor, so `600+600+200` becomes valid where
  `600+600+200` was previously unrepresentable.

**Sequencing:** M5 must design the column-identity change knowing re-split is coming, so the model is
redesigned once rather than twice. Building re-split itself is not required in M5 — M5's own plan
already lists it as out of scope, and that stands.

---

## 8. A fixed-set body in a much wider opening leaves an unbuilt gap — RULED 2026-09-05, NOT M6 SCOPE

**Ruled by the owner, 2026-09-05: the third option.** Split the opening so the remainder becomes a
void the customer can fill — the same mechanism as backlog entry 2's level-B re-split. **This is not
M6 scope and needs its own plan**; the entry stays open here because nothing is built yet, only
decided which of the three shapes below is wanted.

### The finding, as recorded before it was ruled

**Raised by logic review as a disagreement, 2026-08-26.** §5.2 has a millimetre-set body take the
widest size in its set that fits. Choose the bottle cargo in an 800 mm opening and it builds 300 mm
and leaves **500 mm of nothing**: §4 splits voids vertically only, so no void appears beside it,
no cabinet stands there, and the worktop line is broken.

§5.2 sanctions this and the dishwasher has always behaved this way — a 450 mm niche in a 600 mm
opening leaves 150 mm. The cargo changes the amplitude, and it changes who hits it: 500 mm rather
than 150 mm, in a body a customer reaches for **because** it is narrow.

Three shapes of answer, none of them chosen here:

- Leave it. It is what §5.2 says, and the customer can see the gap.
- Refuse a fixed-set body whose widest fitting size leaves more than some margin, with a sentence
  saying so.
- Split the opening horizontally so the remainder becomes a void the customer can fill — which is
  backlog entry 2's level-B re-split, and would answer this as a side effect.

The owner should decide before the cargo reaches a customer, since ADR 0026's size set is
unconfirmed anyway.

## 16. No camera preset frames the right end of wall A's base run at the mobile viewport — RULED 2026-09-05, NOT YET BUILT

**Ruled by the owner, 2026-09-05: fit-to-run framing on the *Perete A* preset**, so the run end is on
screen at 390 px, rather than a separate preset. The owner accepted the proposal as put to them. Not
built yet — this entry stays open until a wave implements it.

### The finding, as recorded before it was ruled

**Found by visual verification of M5B wave 5B3, 2026-09-01**, outside that wave's scope and outside
every other wave's. At 390 × 844 the run-end panel (`end_panel_right`, entry point for wave 5B3)
projects to **x ≈ 514 of a 390 px viewport** under the *Perete A* camera preset — off the right edge
of the screen. The reviewer needed one orbit drag and 11 zoom steps to bring it into frame.

**What this means for a customer.** On a phone, a customer cannot see the end of their own base run
— the exact panel wave 5B3 makes follow the run — without doing manual camera work no preset does
for them. It is a framing/camera-preset issue, not a geometry one: the panel itself renders correctly
at the position measured, the presets simply do not show it.

**Not scheduled.** No milestone currently owns the camera presets' framing at the mobile viewport;
this is a new gap, not a regression of anything M5B changed.

### Widened 2026-10-08, at M8 wave 8D's close — it now bears on the review's links

**Sources [doc, M8 plan, *8D — QA15 classified under the stopping rule* and *review round 2 and the close*; ADR
0148 Amendment A, A8].** Wave 8D's QA and visual verifier found the same matter on more views. Nothing is fixed.

- **The overview of a U on a phone crops to wall A** (the visual verifier's V4). Both screens hand the stage one
  preset; the canvases differ in shape, so what is cropped differs [inf]. Noticed in 8D, not caused by it.
- **A wall's own view leaves bodies at the wall's ends outside the frame at 390 px** (QA15) [QA-run, relayed]. In a
  U the first *Perete A · bază* body spans −2.30 to −1.14 and the refusal's wall C body 1.19 to 2.30 in normalised
  device x, where the frame is −1 to 1; 6 of 8 U first bodies, and 5 of 8 in the narrowed L, straddle the edge.
- **The review's links now land on a selected body the customer may not see.** *Editează*, the refusal's named
  bodies and the conflict link select a body at its wall's own view (ADR 0148, rule G2); the panel is open on it
  and the cabinet may be off the canvas. In eleven arrivals the visual verifier saw the right view and the right
  body selected and no body visible above the editor's sheet [reviewer-run, relayed].
- **The ruled answer must cover walls B and C and the overview, not wall A alone.**
- **QA keeps two declared deferrals** in `apps/web/tests/e2e/qa-8d-review-arrival.adversarial.e2e.spec.ts`; they go
  red on the day the framing is fixed, and are re-aimed then.

**Why it is not fixed.** It is how the stage frames a view on a tall, narrow canvas: the 3D adapter's, with
anchors and a fidelity gate, at the Full tier, and D4 keeps every M8 wave out of the adapter. **It waits for a
wave, not a trigger.** **The owner's call at the hand check.** *Recommended, the architect's:* its own wave before
M8's phone gate (8T), with D4 lifted for that wave by name, since 8T walks a refused kitchen back to the body to be
fixed.

## 53. A LAUNCH REQUIREMENT DECIDED ON DAY ONE THAT NO MILESTONE OWNS: Russian is a supported locale

**This is not new scope, and that is the finding.**
[ADR 0001](../decisions/0001-initial-product-and-stack.md) **decision 5** — Accepted 2026-08-20 by the
product owner, never superseded — reads:

> *"Launch with Romanian as the default locale and Russian as a supported locale."*

**No milestone implements it.** Counted 2026-09-06: `locale`, `russian`, `translat` and `i18n` appear
**zero** times in `docs/milestones/M7-room-and-presets.md`, `docs/milestones/M8-review-contact-success.md`,
`docs/milestones/README.md`, `docs/STATUS.md` and `docs/design/DEVELOPMENT-SPEC.md`. A requirement
accepted in M0 has travelled through M1–M6 without a phase, and M8 is the last planned milestone.

**The code has been drifting against the project's own written convention the whole time.**
`docs/best-practices/engineering-conventions.md:61` says: *"Keep user-visible copy in the project's
localization/content system. Add every required locale at the same time; do not hardcode
one-language fallbacks in components."* `apps/web/src/content/ro.ts` is exactly the hardcoded
one-language fallback that forbids, and Russian was never added beside it. `docs/brand.md:30` and
`docs/ARCHITECTURE_PROPOSAL.md:774` both carry the two-locale intent as well, so the record has said
this in four places while the code said it in none.

**What the owner added 2026-09-06** is therefore the *shape*, not the requirement — and one ruling
that narrows it.

**The owner's instruction**, 2026-09-06:

> *"I would like all the strings that I used, all the text warnings, all the text, to be like the
> standard language files. So we'll implement this easy translation … I want to go in the standard
> way, like this international standard of translations … And in the code, you need to use, like, the
> short code of the specific string."*

**And the ruling that scopes it**, same day, after being shown the cost of making English the source:

> *"for translations, yeah, we can keep romanian as the main and translate the rest."*

**So: Romanian stays the source language.** English, Russian and any further locale are translations
*of* it. This is the cheaper of the two shapes and it is the one ruled — no approved Romanian copy is
re-authored, and no owner-ruled string round-trips through English on its way to becoming a key.

**What is actually there today**, measured 2026-09-06:

- `apps/web/src/content/ro.ts` — one file, **603 lines**, Romanian hardcoded, no locale concept.
- **48 import sites** across `apps/web/src` and the tests.
- **39 test files** assert its literals. That is not incidental: this project's standing rule is that
  *every owner-ruled string is pinned by a literal* (wave 6D). Keys change what those tests pin, and
  that is a convention change to be decided, not drifted into.
- **16 entries are functions**, not strings — interpolated copy such as
  ``handleDefaultNote: (label) => `Implicit pentru acest corp: ${label}.` ``. These are what become
  ICU placeholders, and they are the part a naive key/value extraction gets wrong.
- **11 nested groups**, which map onto namespaces.
- **No i18n dependency in the tree**, and nothing else is locale-aware: MDL and `Pasul 2 din 4` are
  baked in, and there is no locale routing or per-locale number/currency formatting.

**The standard the instruction names** is **ICU MessageFormat** (Unicode CLDR) — the actual
international standard for interpolation, plurals and gendered forms, and what the 16 function
entries should become. For this stack the native fit is **next-intl** (per-locale JSON, namespaced
keys, ICU syntax, and a TypeScript declaration that makes an unknown key a compile error rather than
a blank label at runtime). Recorded as the investigated candidate, **not** as a decision — the
architect owns that.

**What deciding it costs.** The mechanical part (extract 603 lines to `messages/ro.json`, repoint 48
sites) is large but dull. The two real questions are (a) what the 39 literal-pinning tests assert
once a string is reached by key, and (b) whether the same milestone takes on locale routing and
`Intl` formatting for currency and numbers, or whether that is a second phase — nothing in the
product is locale-aware today, so translation files alone do not make it multilingual.

## SCHEDULED 2026-09-06, owner ruling: it runs immediately after M6, before M7

The owner ruled the sequencing on being shown that no milestone owned it:

> *"Translations we can done … we can do after this one. Because the next one should implement the
> first screen. And the last one should implement the last screen, and all of them have strings and
> texts, and maybe it's worth that they already benefit from internalization."*

**The reasoning is a cost argument and it is correct.** M7's scope is `/configurator/room` **and its
six states**, plus the room schema and its validation; M8's is `/configurator/review`,
`/configurator/contact`, the success route and the failure safety net. Both are form- and
error-message-heavy — validation copy is the densest string surface this product has, and neither
screen exists yet.

Measured against what exists today: `ro.ts` holds **8 top-level groups, 59 plain string entries and
16 interpolated ones** — about 75 messages, covering the whole editor across M1–M6. M7 and M8 between
them plausibly add a comparable set again. Migrating ~75 messages once, now, is cheaper than
migrating ~150+ later, and it means M7's and M8's implementers author keys natively instead of
writing hardcoded Romanian that a later phase has to find and move. `ro.ts` already carries a
`contactPlaceholder` group — an M8 stub — so the drift has started.

**This entry has a phase now, so by this file's own rule it stops belonging here.** It stays only
until the architect writes the plan; at that point it moves to `docs/milestones/` and this entry is
replaced by a pointer. Suggested name **M6B**, following M5B's precedent for a milestone inserted
between two already-numbered ones rather than renumbering M7 and M8 and every reference to them.

**Still to be decided by whoever plans it, not assumed:** what the 39 literal-pinning test files
assert once a string is reached by key; and whether locale routing and per-locale currency/number
formatting (`Intl`) land in the same phase or a later one — nothing in the product is locale-aware
today, so translation files alone do not satisfy ADR 0001 decision 5.

---

## Fully undecided

## 6. The 200 mm cargo is unreachable by any insert — INPUT FOR M5

**Found by logic review of waves A and C, 2026-08-26.** ADR 0026 added `base-bottle-cargo` with
`minWidthMm: 200` and the size set `[200, 300]`. The 200 mm member cannot be reached.

**Why.** §3.2 derives `Column.w` as the **MIN** of its members' widths, and every opening in a column
takes that width. The narrowest seeded placement in the shipped kitchen is 300 mm (`p10`, `p16`), so
no column is under 300 mm wide, so **no opening under 300 mm exists**. There is no bootstrap either:
the only way to make a narrower opening is to put a narrower body in the column first, and inserting
one needs the opening.

> **Amended 2026-09-01 — the second sentence is no longer true, and openings under 300 mm are now
> ordinary.** [ADR 0035](../decisions/0035-width-is-a-bounded-stepper-not-a-menu-of-sizes.md) decision 7
> already falsified it on 2026-08-28: a shrink funds itself out of the space it vacates, so one `−50`
> on a 600 mm column makes a 50 mm empty column where none could exist before.
> [ADR 0043](../decisions/0043-an-empty-space-of-any-width-is-a-legal-state.md) makes them ordinary in
> the other direction too — a growth may now *leave* a gap of any width. **This entry's subject is
> unaffected**: a narrow *opening* is still not a narrow *cabinet*, and reaching the 200 mm cargo
> needs a column whose members are 200 mm, which a resize refuses on the entry's own floor. The trap
> two paragraphs below — that `MIN_WIDTH_M` must not be lowered — is unchanged and was honoured by
> both records.

So `600 + 600 + 200` — the owner's own example, and the sentence that opens ADR 0026 — is still not
expressible. The only command that could reach it is §5.4's resize, which does not exist yet.

**The trap this sets for M5, which is why it is written down before M5 starts.** ADR 0026 kept
`MIN_WIDTH_M` at 300 *precisely because §5.4 reads it* — the donor rule is "the neighbour must remain
at or above `MIN_W`", and dropping the constant to 200 would let a resize leave a 200 mm cabinet as
the residue of somebody else's edit. That reasoning is about the **donor**. If M5 applies
`MIN_WIDTH_M` to the resize **target** as well, the 200 mm chip is refused there too and the
capability never lands anywhere. The target's floor is the entry's own; the donor's is §2's.

Meanwhile `describe-selection.ts` already publishes the cargo's chips through `buildableSizes`, which
returns `[200, 300]` — so §9 shows a 200 mm chip that nothing in the product can honour. Every chip
is `blocked` until M5 ships, so nothing is broken on screen today; it becomes wrong the moment the
resize command starts accepting chips.

## 7. A narrow body poisons the openings above it after a reload

**Found in the same review.** `Column.w` is the MIN of its members' widths, and it is frozen at load
(ADR 0011 Gap D). Replace a 600 mm base cabinet with a 300 mm cargo, save, reload: the column derives
at 300 mm, and **every void in that column is now 300 mm wide** — including the wall-level ones.

What that costs, swept against the catalogue at a 300 mm opening: the `'fit'` bodies still go in, at
300 mm, so the 600 mm hood the customer deletes above the cargo comes back 300 mm wide — narrower
than the hob it vents. Everything with a millimetre set is refused outright and can never be put
back in that column: `base-dishwasher` (450), `base-sink` (560, its own floor), and all four
full-height units (600, and 700 for `fridge-free`).

It only bites across a reload, because in-session the extent stays frozen at what it was.

**Pre-existing, newly amplified.** The 450 mm dishwasher already had this shape at lower amplitude.
What changed is that a shipped entry can now drive a column to exactly `MIN_WIDTH_M`, and to 200 mm
once M5 makes the cargo reachable — at which point the column is narrower than any other body in the
catalogue.

The fix is a decision, not a repair: `w` as the MIN over a whole vertical run is the thing to
question, since the widths in a run are independent per level (backlog entry 4 records that they
already are — see `docs/backlog/resolved.md`, entry 4, now shipped). Related: entry 6 above.

## 12. §3.2's column cannot express a middle level at its own width — RAISED BY M5 WAVE 5C

Found while implementing §5.4's resize (M5 wave 5C, 2026-08-27), and **rewritten later the same day**
when ADR 0031 replaced the rule it was raised under. §5.4's per-level resize is what hit this limit;
ADR 0031's column-scoped resize does not, and the entry survives as the record of what a *per-level*
width would cost — the owner's first instinct, deferred on cost rather than on merit.

**The mechanism.** §3.2's column is a vertical run at one along-wall coordinate, and `deriveColumnKey`
keys it on a body's **centre**. A resize moves that centre. Move a *middle-level* body sideways while
the levels above and below stay where they are, and the level it left reads as free space.

Measured on the shipped kitchen: resizing `p11` yields `A|1.30@1.50 h0.70 w0.80` — an **800 mm empty
slot offered on the stretch of wall where `p10` and `p11` are physically standing**. A body inserted
into it would overlap them both. **A full recompute of the column map produces the same opening**, so
this is the model's limit, not the touched-key update rule's.

**What shipped instead — rewritten 2026-08-27, after the rule this entry was raised under was
replaced.** The first implementation refused with `RESIZE_OPENS_GAP` whenever the derived opening set
changed at all. **ADR 0031 superseded §5.4's donor rule the same day**, and under it a legal resize
moves a whole column and shrinks the empty column funding it — so the opening set changes on *every*
success and that comparison had to go. The refusal was **re-stated, not deleted**: it is now the
assertion it always stood for, that **no opening may appear where a body physically stands**, and it
is still reachable — narrowing `A|0.75` into a cleared `A|1.30` widens the empty column to 900 mm and
offers a base opening across the corner leg `p25` occupies.

**What it costs under ADR 0031.** The old figure — "no middle-row wall cabinet can be resized:
exactly `p10`, `p11`, `p12`" — is obsolete, because per-level resize no longer exists. Column scope
sidesteps this entry's mechanism entirely: every member of a column moves by the same amount, so no
body leaves the column its neighbours above are in and no vacated key reads as free. Measured after
the pivot: **six distinct column moves are reachable once one column is deleted**, against the donor
rule's two chips.

**This entry is now the record for the deferred product, not for a defect.** ADR 0031 cites it by
name: per-level independence was the owner's first instinct and is deferred **on cost, not on
merit** — it needs §3.2 inverted from columns to rows, and the ADR carries the measured blast radius.

**Do not attempt 3 inside a wave.** It changes the derivation every other rule reads, and ADR 0011
Gap D records what a blanket recompute costs: clearing the fridge column then yields **no voids at
all**, and the delete does nothing.

**The owner decided on 2026-08-27, before it reached the app**: ship the column-scoped rule and let
real use decide. If testers find mismatched level widths necessary, direction 3 becomes its own
milestone, chosen on evidence. Until then this entry is the record, not a scheduled item.

## 17. An emptied wall-A base run may render no void to insert into — SUSPECTED, NEEDS VERIFICATION

**Observed incidentally, 2026-09-01**, while verifying M5B wave 5B3's hide-on-empty-run branch
through the app's save/hydrate path (that path was needed because the seeded design has no reachable
UI route to a fully-emptied wall-A base run — see wave 5B3's *Verified by visual review*). In a
design hydrated with **no** wall-A base placements, no base void slots appeared to render on wall A
at all.

**Not confirmed as a defect.** It was seen in passing, not investigated as its own question, and
nothing in this backlog entry pins a reproduction, a file, or a mechanism. If it is real, the
consequence would be serious: a customer who empties their whole base run on a wall would have
nothing to insert into and no way back to a base cabinet there short of reloading a different design.

**What deciding this needs.** A deliberate reproduction — hydrate a design with zero wall-A base
placements and check whether `deriveColumns`/`recomputeVoids` publish a base-row opening for that
wall — before this is treated as more than a hunch. Out of scope for every wave in M5B.

## 23. ADR 0032's refused rows are published but never rendered, and only a code comment says so

Found while closing M5B wave 5B4a (2026-09-01). ADR 0032 — *an entry that does not fit is shown
disabled with its reason* — is Accepted, and its **domain half ships**: `offersFor` publishes the
refused entries into the offer list, each carrying the engine's own reason. The **panel drops every
one of them**: `apps/web/src/panel/panel-model.ts:601`, `input.offers.filter(isOffered)`.

So the customer sees a shorter list, not a disabled row with a sentence. Select a 300 mm empty
column and the too-narrow rows — `base-sink`, `base-dishwasher`, `base-hob-*`, `tall-*` — are simply
absent, which is the behaviour ADR 0032 exists to replace.

**This is deliberate and the code says so.** The comment above that filter records that rendering
the disabled row, its sentence, and its effect on the count line "is the panel's own wave", and that
the filter "is the seam that wave replaces". Nothing is broken; the work is half-landed on purpose.

**The defect is that the other half was tracked nowhere.** It is not in `STATUS.md`, not in this
file, and not in any milestone — the only record that ADR 0032 is unfinished was that one comment,
which no one reads unless they are already in that function. M5B wave 5B4a's criterion 3 was written
as "shown disabled with a reason, never absent" and its visual verification duly found them absent;
the criterion had to be corrected to be about the offer list rather than the screen. A record that
lives only in the code it describes will keep producing criteria nobody can pass.

**What the work is.** Render the refused verdicts as disabled rows with their reasons, and decide
what they do to the "N corpuri intră" count line — the count is the part with a real choice in it.
`describeReplaceSection` and `describeOfferRow` are where it lands, and `describeEmptyLine` already
receives the full unfiltered `input.offers`, so the data is there.

Not scheduled. Worth pairing with the next panel wave rather than done alone.

**Verified still open, 2026-09-06 (this pass):** `apps/web/src/panel/panel-model.ts:757` still runs
`input.offers.filter(isOffered)` — the filter this entry describes has not moved.

## 25. A narrow empty column can sit clipped against the frame edge, where nobody will see it

Found by wave 5G's visual verification (2026-09-02). Shrinking `p6` from 600 to 400 splits the freed
900 mm span into `B|2.30` at 800 mm and `B|2.75` at 100 mm, correctly. At the `Perete B` camera
preset the 100 mm piece renders at canvas x from about 0 to 22 and is **partly clipped by the left
frame edge** — the verifier had to enlarge the crop to see the seam at all.

Nothing is wrong with the geometry, the split, or the panel: select the sliver and it explains itself
("the opening is 100 mm, narrower than the narrowest cabinet in the catalogue... the space may be
left as it is"). The problem is that a customer who never pans has no reason to select it, because
they cannot see that it is there.

**It is camera framing, not wave 5G.** The presets were fixed long before an empty column could be
100 mm wide, and every seeded body is wide enough to sit clear of the frame. What changed is that
ADR 0052's ceiling makes narrow leftovers a *routine* outcome of an ordinary shrink rather than a
rarity — so a framing rule that was always slightly tight is now load-bearing.

**Worth pairing with whoever next touches the camera presets.** The narrow question to answer is
whether a preset should frame the wall run plus a margin, rather than the run's nominal extent, so
that anything the domain can legally leave at the end of a run is visible without panning.

## 27. An empty-column selection box is drawn deeper than what will actually fit there

Reported by the owner (2026-09-02), from the same left-wall screenshot as entry 26 (freed columns
flanking a full-height fridge; entry 26 is closed — see `docs/backlog/resolved.md`). The dashed
selection/highlight box for an empty column is drawn at the fridge's own depth for its full height —
wall level and base level alike — even though a wall cabinet or a base cabinet inserted there would
be shallower than a full-height column.

The owner's read: a full-depth box is the right cue **only** where the slot could plausibly take a
full-height body bottom-to-top with a matching depth at the top (i.e. genuinely as deep as the
column it sits beside). In every other case — an ordinary wall-cabinet-over-base-cabinet slot next
to a full-height neighbor — the box overstates the depth of whatever will actually be offered
there, which is misleading about what the space can hold.

Not yet triaged: need to find where the empty-column highlight geometry is built (likely near the
picking/selection outline code in `packages/three-adapter`, paired with whatever computes an empty
column's candidate depth in `packages/configurator-domain`) and check whether the highlight already
has access to a per-level candidate depth it simply isn't using, or whether it only knows the
column's nominal (fridge-derived) depth today.

## 28. PROPOSAL: remove all cabinets in a column at once, not one level at a time

Proposed by the owner (2026-09-02), from the cabinet detail panel's "Șterge corpul" (remove body)
button (Pasul 2/4, `Corp bază 3 sertare`, Perete B). Today removing a column with a wall cabinet
over a base cabinet over drawers means opening each body's own panel and pressing "Șterge corpul"
separately, once per level.

**Idea:** add a second action beside "Șterge corpul" — something like "Șterge toată coloana" —
that removes every body stacked in that column in one action, leaving the whole column empty
(subject to whatever entries 2/22/25/26 already say about how a freed column then behaves).

Not a bug, not decided. Needs: where the action lives (per-body panel vs. a column-level
selection), what it does when the column contains a fixture the customer can't remove (an
appliance, a fixed member), and how it composes with the existing single-body removal command —
before this becomes a real work item.

## 29. A refresh on the default route loses edits that were already saved to the database

Found while answering the owner's question (2026-09-02) about whether autosave survives a refresh.
Autosave itself works: every successful command schedules a coalesced save
(`apps/web/src/store/configurator-store.ts:310,476,490-492` →
`apps/web/src/persistence/save-coalescer.ts`), which writes to Postgres via `/api/designs` /
`/api/designs/{id}` (`apps/web/src/persistence/fetch-configuration-repository.ts:33,151-274`), at
least one save per second, with retry on transient failure. No localStorage is involved.

**The gap is on load, not save.** `/d/{id}` does a real server-side load and hydrates correctly on
refresh (`apps/web/src/app/d/[id]/page.tsx:19-38`). But the app's actual landing route — `/` →
`/configurator/configure` (`apps/web/src/app/page.tsx`,
`apps/web/src/app/configurator/configure/page.tsx`) — never navigates the browser to `/d/{id}`
after the first edit mints a design row. It always constructs the store from the hardcoded
`KITCHEN_L_DESIGN` fixture with `designId: null`. So a customer who edits on the default route and
refreshes loses everything they see, even though every edit up to that point is sitting in
Postgres under a design id the browser was never given.

`docs/decisions/0010-m3-client-write-path-unwired.md:65-68` defers the shareable-link *surface*
("before the first edit there is nothing to share"), which is the right call — but the follow-on
step, navigating to `/d/{id}` once there *is* something to share, doesn't appear to be a tracked
work item anywhere. `docs/PRODUCT_REQUIREMENTS.md:145-146` lists the shareable link as in-scope but
the client-side wiring to reach it isn't in any milestone doc found so far. Worth confirming which
milestone owns this before someone hits it as a support ticket.

**Not the same gap as M8's planned lead-gen link.** M8 (`docs/milestones/M8-review-contact-success.md`)
already plans a session/shareable identifier and an emailed edit link — but only on the **success
screen after a contact-form submission**, per ADR 0002 decision 17 ("a design that has never been
written successfully must not present a shareable link... this binds M8's success screen"). That is
a lead-gen artifact for a customer who has already asked to be contacted. This entry is about
ordinary mid-session editing, before any contact submission: the browser is never pointed at
`/d/{id}` even though the design is already being saved, so a plain refresh loses visible state
regardless of whether the customer ever reaches M8's flow. Confirmed unscheduled in any milestone
doc (M3, M4, M8) as of 2026-09-02.

**Verified still open, 2026-09-06 (this pass):** `apps/web/src/app/page.tsx` still redirects to
`/configurator/configure` with no `designId` navigation; the gap is unchanged.

## 30. PROPOSAL: mint the session id at intake (step 1), not on first edit, and redirect there immediately

Proposed by the owner (2026-09-02), as a way to close entry 29 and extend M8's lead-gen link
earlier in the funnel. Shape of the idea:

1. Step 1 of the wizard (room type, wall sizes, then either an existing mock or a newly generated
   one) mints a session id **at that point**, before the customer has made a single cabinet edit.
2. The browser is redirected to that session's own URL immediately — not deferred until a later
   mutation — so the id exists in the address bar from the start of editing, not after it.
3. That same id is later attached to the customer's contact details, if and when they submit them,
   so it can identify their profile/session for lead follow-up.
4. The session URL is also the shareable link, and loading it restores the saved configuration —
   which is also what makes a refresh mid-session safe, closing entry 29 as a side effect rather
   than needing separate work.

**Grounding against the code as of 2026-09-02:**
- Step 1 does not exist yet. The wizard shows "Pasul 2 din 4" as a hardcoded label
  (`apps/web/src/content/ro.ts:18`) and a decorative, non-functional "‹ Cameră" back link
  (`apps/web/src/app/configurator/configure/configure-screen.tsx:45`), but `/` redirects straight
  into `/configurator/configure` with a comment that room setup "arrives in a later milestone"
  (`apps/web/src/app/page.tsx:3-6`). There is no room-type/wall-size intake route and no
  mock-selection UI anywhere in `apps/web/src/app` today — every new design is minted from the
  single hardcoded `KITCHEN_L_DESIGN` fixture (`apps/web/src/store/configurator-store.ts:17-18,474-475`).
- Minting itself already happens server-side from that fixture on `POST /api/designs`
  (`apps/web/src/persistence/fetch-configuration-repository.ts:231-234`), so "mint earlier" is a
  matter of *when* the client calls that endpoint and redirects, not new mint machinery.
- **Open question: id format.** The owner's phrasing suggested a UUID v7 (time-ordered). The
  current id generator is `nanoid()`, chosen deliberately for the opposite property — its own doc
  comment says "unguessable and non-sequential... never derive one from a counter, a timestamp, or
  the database's own sequence" (`packages/persistence/src/generate-design-id.ts:1-8`). A v7 UUID
  embeds a creation timestamp, which cuts against that stated invariant (a leaked/logged id would
  reveal roughly when a session started, and ids would sort creation-adjacent in a DB scan). Worth
  a deliberate decision, not an assumption, before swapping the generator — nanoid can stay and
  still be minted earlier; the "mint earlier" and "which id scheme" choices are independent.

**Depends on / relates to:**
- Closes entry 29 (default-route refresh loses state) as a side effect, once step 1 exists and
  redirects.
- Is the earlier half of M8's already-planned lead-gen link
  (`docs/milestones/M8-review-contact-success.md`, ADR 0002 decision 17) — M8 attaches a shareable
  identifier at the *contact-submission* success screen; this proposal would mean that identifier
  already exists by the time the customer reaches M8, rather than M8 minting fresh.
- Needs step 1 itself designed and scheduled first (room type, wall sizes, mock selection/generation)
  — currently pure UI scaffolding, not a real milestone item found in `docs/milestones/` as of
  2026-09-02.

Not decided. Needs an owner call on: id scheme (keep nanoid vs. adopt v7 and accept the tradeoff),
whether step 1 mints before or after the wall-size intake is complete, and which milestone this and
step 1 itself belong to.

## 41. The sink, its bowl and its faucet do not follow the cabinet-depth setting — RULED 2026-09-07 ([ADR 0098](../decisions/0098-the-sink-is-centred-at-the-declared-depth-and-a-deeper-worktop-grows-behind-it.md)), **SHIPPED 2026-09-08**

**The owner ruled 2026-09-07:** *"It should be centered. And the gap should become bigger behind — so between the wall and the sink and faucet. Same principle as with hob."* [ADR 0098](../decisions/0098-the-sink-is-centred-at-the-declared-depth-and-a-deeper-worktop-grows-behind-it.md) declares `SINK_FRONT_CLEARANCE_MM = 110` — the centred value at 600 — and derives the seat from it, so the bowl's front clearance is 110 at every depth and the faucet's clearance to the wall goes 2 -> 22 mm at 600 and 52 -> 122 mm at 700. **It moves the shipped 600 mm kitchen forward by 20 mm**, deliberately, which is the one place it departs from ADR 0087; the wave's close-out must record that parity re-baseline rather than absorb it. This entry closes when that wave ships, not before. **Closed 2026-09-08.** The wave shipped: `SINK_FRONT_CLEARANCE_MM = 110` derived from `(620 - 400) / 2`,
`SINK_SEAT_OFFSET_M` derived like the hob's, and the hardcoded `az = 0.2` removed. Adversarial QA
measured it independently and the result is **stronger than the ruling asked for**: the front clearance
is exactly 110 mm at *every* integer depth from 490 to 1400 mm, not merely at the two the wave
measured, so the centring is a genuine relation rather than a constant fitted to two data points, and
`faucetToWallMm(d) = d - 578` holds exactly with the sign change at 578. The six re-baselined M1 parity
rows are each provably the 20 mm centring and nothing else, and the ledger is exact rather than a
tolerance — nudging the clearance to 111 turns parity red. The parity re-baseline this entry required
the wave to *record rather than absorb* is recorded in ADR 0098 and in the wave's commits
(`30b5e3d`, `0ff3faa`, `cd0e43c`). **The observation below is left unedited as the original report.**

Found 2026-09-05 while measuring the hob for
[ADR 0087](../decisions/0087-the-hob-holds-its-reach-and-a-deeper-worktop-grows-behind-it.md). **Same
class of defect, different fixture, and deliberately not decided by that record** — the owner ruled
on the hob and only the hob, and inventing the parallel ruling for a sink is the silent product
change this file exists to prevent.

**What was observed.** Build `base-sink` at both depths ADR 0056 declares and the entire sink
assembly is **byte-identical** at 600 and at 700 — `sink_rim_*`, `bowl_*`, `drain_*` and every
`faucet_*` mesh — while the worktop around it grows 50 mm forward and 50 mm back. Measured in the
body's own local frame, metres, `+z` towards the customer:

| Local `z` | at 600 | at 700 |
| --- | --- | --- |
| worktop back edge — the wall plane | −0.290 | −0.340 |
| `faucet_escutcheon` | −0.288 … −0.192 | −0.288 … −0.192 |
| sink aperture (`sink_rim_back` … `sink_rim_front`) | −0.200 … 0.200 | −0.200 … 0.200 |
| door front face | 0.298 | 0.348 |
| worktop front edge | 0.330 | 0.380 |

So at 600 the bowl's front rim is **130 mm** behind the worktop's front edge and the faucet stands
**2 mm** off the worktop's back edge; at 700 those become **180 mm** and **52 mm**.

**What is actually true in the code.** `baseCabinet`'s sink arm (`packages/three-adapter/src/
kitchen-parts.ts`) splits the counter around a fixed `0.70 × 0.36` aperture centred on the body
origin, and seats `builders["sink-faucet"]()` by setting **only** its `y` — its `z` stays at the
carcass centre. Nothing in the assembly reads `carcassFrontM` or `counterDepthM`, which is what
`OVEN_FORWARD_OFFSET_M`, `MICROWAVE_FORWARD_OFFSET_M` and `HOOD_SEAT_OFFSET_M` all do.

**It is not a geometry defect and no gate is wrong to be green.** Nothing intersects, nothing
floats, no wall is crossed, and the body's finished depth is its worktop's at both depths
(`baseFinishedDepthMm`, 620 / 720) — so `cabinet-depth-sweep.parity.test.ts`,
`room-composition.parity.test.ts` and `occupied-depth.parity.test.ts` are all correct to pass. The
sink also stays a constant 20 mm rear of its worktop's centre at both depths, which is a **coherent
rule** — "a sink is centred in its worktop" — and may well be the right one.

**Why it still needs an answer.** The owner's reason for the hob ruling was reach: *"when you cook
you should use easy the back hob circles in same way as it was 600 mm worktop"*. A bowl 50 mm further
away and a tap 50 mm further back are the same argument on the fixture a customer leans over most.
Three shapes, and only the owner can choose:

- **Front-aligned, like the hob and the hood** — the aperture holds a constant clearance to the
  worktop's front edge and the added depth appears behind the tap. Consistent with ADR 0087 and
  ADR 0039; costs the tap its position hard against the back edge, which is where a tap normally
  goes.
- **Centred in the worktop** — what ships today. Splits the 100 mm evenly; the bowl loses 25 mm of
  reach and the tap gains 25 mm of counter behind it.
- **Rear-aligned** — the tap holds its 2 mm to the back edge and all 100 mm appears in **front** of
  the bowl. Physically what a plumber would do, and the worst of the three for reach.

**What deciding it would cost.** One wave in `packages/three-adapter` only, the shape of wave 6U: the
aperture's and the faucet's seats become derived from the depth-parameterised locals instead of the
body origin, with a sweep over ADR 0056's declared depths asserting the chosen relation at both. No
domain declaration moves (the body finishes at its worktop either way), no stored field changes and
no migration is owed, for the reason ADR 0087 decision 5 gives for the hob. **Reachable today** —
`p0` is the shipped 800 mm sink base and the depth control shipped in wave 6K.

## 42. `tall-pantry`'s door-leaf/handle declaration should be pinned separately from the real catalogue — HIGH, QUEUED FROM THE 2026-09-05 CERTIFICATION AUDIT

**Found by the 2026-09-05 certification audit.** `catalog.ts:1020-1022`
(`packages/configurator-domain/src/catalog.ts`) declares `tall-pantry`'s
`cabinetHandles: handlesOnDoorLeaves({ doorTiers: 2, handlesPerLeaf: 1 })`. Swapping the pair to
`{ doorTiers: 1, handlesPerLeaf: 2 }` keeps wave 6L's 391 tests **and** all 2186 adapter tests green
while halving the door-leaf count the price step bills — a mutation the wave's own suite cannot
catch today. Needs a literal test pinning the declared shape on its own, separate from the general
catalogue sweep, so a swap like this fails loudly instead of passing every gate. Recorded here as a
docs-only entry; the fix itself is code and is not attempted in this pass.

**Verified still open, 2026-09-06 (this pass):** `catalog.ts` still declares `tall-pantry` as
`doorTiers: 2, handlesPerLeaf: 1` and no test file pins that shape on its own.

## 43. Wave 6A2's own files carry no literal pin on the seeded row's rendered name

**Found by the 2026-09-05 certification audit.** 6A2's invariant — a body's name does not change when
its `buildId` migrates on resize — is proven by construction, and holds, but the guarantee is
currently covered by wave 5B8's own literals rather than by a pin inside 6A2's own files (measured:
4/6 mutations killed by 6A2's own files, 6/6 by the full suite — see `docs/STATUS.md`'s certification
note). Add one literal pin, in 6A2's own file, with a comment stating why it is the one allowed copy
— the invariant test already derives both sides, and this is the one place a literal earns its keep.

## 48. `apps/web`'s vitest environment has no DOM — a focus-trap defect is only catchable by the visual agent

**Found by wave 6Q-c's visual verification, 2026-09-05.** `apps/web/vitest.config.ts:11` sets
`environment: "node"`, and `apps/web/package.json` lists neither `jsdom` nor any
`@testing-library/*` package. No headless test in that package can dispatch a keypress or read
`document.activeElement`, so nothing but Playwright can observe whether focus is where a trap
requires it to be.

6Q-c shipped exactly this class of defect: the confirm-step swap unmounted the focused button,
`document.activeElement` fell back to `<body>`, and the dialog's key trap — hung off its own
`onKeyDown` (`apps/web/src/settings/global-settings.tsx`) — went silent, so one Shift+Tab reached
the trigger and a stray Enter discarded the customer's pending material choice with no warning. It
was found by the visual agent's real-interaction pass, not by the package's own suite, and could not
have been: no assertion in `apps/web`'s headless suite is capable of noticing it. The fix (keying the
focus effect on the step as well as on open) has a headless-looking shape, but nothing in the package
can regress-test it.

This is a standing gap, not a one-off: any future focus-management defect in this app — a trap, a
restore-on-close, a roving tabindex — is only ever catchable by a human or an agent driving a real
browser. Closing it means adding `jsdom` (or `happy-dom`) and `@testing-library/react` to `apps/web`
and giving at least the existing dialogs (`global-settings.tsx`, the price breakdown) a headless
focus-trap regression suite. Not scheduled to any wave.

**Verified still open, 2026-09-06 (this pass):** `apps/web/package.json` still lists neither `jsdom`
nor any `@testing-library/*` package.

> **Dated annotation, 2026-10-07 — stale in part.** `apps/web/vitest.config.ts:11` still sets
> `environment: "node"`, but `apps/web/package.json:41` now lists `happy-dom` and a DOM is available per
> file: Glob finds **36** `apps/web/**/*.dom.test.ts` files (none `.tsx`), and a Grep for `happy-dom`
> matches all 36 [source-verified, 2026-10-07]. The M8 plan says 43; that figure did not reproduce. No
> `@testing-library/*` package is listed (Grep of `package.json`). Whether the focus-trap regression
> suite this item asks for exists was not checked, so the item stays open.

## 49. The hob's front clearance reads as flush with the worktop's edge, more conspicuously at 700 — NEEDS THE OWNER

**Found by wave 6U's visual verification, 2026-09-06.** The wave itself reads correctly: 190 mm of
bare worktop behind the hob at 700 mm cabinet depth reads as a usable back ledge, bounded by the
backsplash, not as a void. What it raised is something wave 6U **preserves rather than causes** — the
hob's front edge sits 10 mm from the worktop's front lip, essentially flush, at every declared cabinet
depth ([ADR 0087](../decisions/0087-the-hob-holds-its-reach-and-a-deeper-worktop-grows-behind-it.md)
decision 1).

At 600 mm that is already what ships today, unchanged by 6U. At 700 mm the contrast is more
conspicuous: a generous ledge behind the hob and effectively zero landing space in front of it, so the
appliance reads as pushed hard against the front edge. To someone who cooks, near-zero margin in front
of a hob is the part that looks off — pan handles project past the counter edge, and there is nowhere
to set a lid down in front.

**This is not a 6U defect.** Changing it means reopening ADR 0087 itself, whose 10 mm front clearance
is the owner's own ruling (*"the gap should be not in front but between wall and hob"*), not fixing
something 6U got wrong. Recorded here as a product observation for the owner to decide, not scheduled
to any wave.

**What visual verification did not cover, so this is not read as a broader clearance beyond it.**
390 × 844 was skipped deliberately (6U is a `packages/three-adapter`-only, non-interactive geometry
fix). Fore-aft hood-over-hob overlap was not measurable from the captured angles — the shots confirm
width alignment; the depth axis rests on the algebraic concentricity ADR 0087's consequences already
derive, not on a fourth screenshot. Only the seeded L-kitchen was exercised.

## 50. `validateDesignForCatalog` is blind to a cross-wall corner intersection — RECORDED 2026-09-06; SEVERITY RULED AND BUILT 2026-09-09

> **CLOSED by the owner's ruling of 2026-09-09 and the wave that carried it.** The gate now compares
> across the corner and reports **`RECORDED_SPAN_OVERLAPS_CORNER_BODY`** at severity **`mark`** —
> never a refusal. The owner's reasoning constrains anyone who revisits it: a new refusal code can
> make an already-stored document unloadable, which is [ADR 0052](../decisions/0052-800-mm-is-the-ceiling-on-any-empty-column.md)'s
> dead link, and **every stored document must still load**. The precedent followed is
> `PLACEMENT_PAST_WALL_END` and [ADR 0065](../decisions/0065-a-body-past-the-end-of-its-wall-is-marked-not-moved.md) —
> marked, warned, not moved, not refused. Severity stays declared per code
> ([ADR 0069](../decisions/0069-past-the-wall-is-one-code-family-and-severity-is-declared-per-code.md)), and this
> is the first member of the mark set that is **not** in that record's past-the-wall family, so it is
> a ruling and not a membership.
>
> The comparison lives in `findCornerOverlaps` in `packages/configurator-domain/src/validate-design.ts`,
> beside the same-wall sweep it extends: recorded spans from both stored arrays against the
> **placements on the other wall**, each having to reach into the other's along-wall interval from
> the shared origin, plus a vertical overlap. A placement is still never named — `overlapCodeFor`'s
> rule is untouched — so two bodies meeting across the corner report nothing, exactly as two bodies
> meeting on one wall do not. The witness below was **inverted**, not deleted.
>
> **The reach is the carcass seat, and that was measured rather than chosen.** The wave's brief first
> said to use the body's `occupiedDepth`, on the principle that overlap is about solid. That is true
> of two cabinets and false of two worktops. `base-corner-x-900` seats on 560 and *occupies* 630,
> because ADR 0025 gives its corner worktop 10 mm more reach than a straight run's, and
> `base-corner-return-320`'s slab stands 20 mm proud of its own 580 seat — so **the shipped kitchen's
> two corner legs share 50 mm of plan area by design**, which is what an L-joint is. Measured against
> the occupied depth the gate marks the demo kitchen on its own declared geometry and turns eleven
> assertions red across six domain files and three in `apps/web`; measured against the seat the
> shipped kitchen is silent. **This entry's own 80 mm and 31 mm are seat figures** — 560 − 480 and
> 291 − 260 — which is what *"the reach `cornerReachAlongWallMm` already computes"* meant, and the
> gate now reproduces both: `qa-6x-slide-witness`'s un-slid fixture at 700 mm carries exactly those
> two overlaps, because a settings swap moves no placement, and the gate names them.
>
> **The reach ladder, for the document that cannot answer directly.** A recorded span's reach is the
> deepest **seat** among the placements standing in its column; failing that, the seat of the body
> its `depthFromBuildId` names (ADR 0073 decision 1, read on a second axis); failing that, its
> recorded `depthMm`. The first rung is what keeps a document written before ADR 0073 quiet — it
> needs nothing the document carries. The last rung is §3.2's MAX **clearance** and over-reaches, so
> a member-less sourceless column at the corner can carry a spurious mark; it cannot carry a refused
> load.
>
> **STILL OPEN, and this is the known better shape rather than a new idea.** An `occupiedDepth` reach
> with an exemption where **both** runs are declared structural corner legs is more truthful about
> solid than the seat is: `frameDepthMm` is ADR 0018's encoding of twice a rear overhang and is not a
> distance at all — `hood-600` seats on 700 and fills 500 — so the number the gate reads is right at
> the corner and a fiction away from it. It was **not** taken on 2026-09-09 because it is a new rule
> needing its own record: which bodies count as structural, what the exemption means for a document
> that merely *claims* a corner leg as its source, and whether an exemption or a tolerance is the
> honest instrument. Whoever revisits this should start there and not re-derive the seat/occupied
> question, which is settled and measured above.

**Found by wave 6J-c, confirmed by [ADR 0090](../decisions/0090-a-frozen-space-slides-with-its-run-and-follows-the-body-it-recorded.md).**

The validator has no rule that compares a wall-A body against a wall-B body at the corner they share.
It returned `[]` on the design where `base-corner-return-320` overlapped wall A's corner by **80 mm**
and `wall-corner-return-570`/`-top` overlapped by **31 mm** — [ADR 0089](../decisions/0089-the-along-wall-chain-is-kept-and-its-reader-is-the-depth-command.md)
decision 3's measurement at `14cef90` — and it would have returned `[]` had 6J-c's fix been wrong in
the same direction. So the one geometry the wave existed to correct is invisible to the gate that runs
at both the load and the write seam.

**The blindness is declared, not accidental**, and its declaration names the reason it is only true
away from the corner. `findWallOverlaps` groups spans by wall, and `groupSpansByWall`
(`packages/configurator-domain/src/validate-design.ts`) carries the comment:

> *"Both walls originate at the same corner and walk their own axis (§2), so the same along-wall
> coordinate on wall A and on wall B are two different places and are never compared."*

True everywhere except at the corner, where a wall-A body's **depth** is measured along wall B — the
exact fact `along-wall-chain-shift.ts` is built on.

**The same-wall case is covered and works.** ADR 0090 measured the sweep firing correctly: five
`EMPTY_COLUMN_OVERLAPS_PLACEMENT` on the same wall, at the same tree. The gap is the corner and only
the corner.

**What deciding it would cost.** It is a **reporting** gap, not a geometry gap — the geometry is
correct once 6J-c and 6J-d land — so nothing on screen changes. The cost is at the load seam: a new
code can make an already-stored document unloadable, which is
[ADR 0052](../decisions/0052-800-mm-is-the-ceiling-on-any-empty-column.md)'s dead link and needs its own
adjudication before a severity is chosen. The likely answer is a **`mark`** beside
`PLACEMENT_PAST_WALL_END` rather than a refusal, and severity is declared per code
([ADR 0069](../decisions/0069-past-the-wall-is-one-code-family-and-severity-is-declared-per-code.md)), so
it is a choice someone has to make rather than a default to inherit. Implementation is small: one
extra comparison for spans within the corner reach on either wall, using the reach
`cornerReachAlongWallMm` already computes.

**Measured and pinned 2026-09-08** —
`packages/configurator-domain/tests/backlog-50-the-corner-the-validator-cannot-see.test.ts`. The same
recorded space is placed twice at a 600 mm setting: on wall A over `base-corner-x-900`, where the
sweep reports `EMPTY_COLUMN_OVERLAPS_PLACEMENT`, and on wall B — inside the corner body's reach along
wall B, sharing the whole 300 mm of the recorded space — where the gate reports **nothing**. The
witness derives every span through §12's convention (`alongMm` is a **centre**, which the first
version of it got wrong) and takes the reach from the body's `occupiedDepth` (630 mm) rather than its
seat (560), because overlap is about solid. The wave that closes this should **invert** its last two
blocks rather than delete them.

**A second fact that file records, wider than this entry states it**: `findWallOverlaps` returns
early when a document carries neither `emptyColumns` nor `columnExtents`, so two **placements** in
one span are never compared — on either wall, corner or not. Shipped documents always carry a frozen
map (ADR 0090 decision 1), so this is about a hand-crafted document at the load seam, which is the
same seam the severity ruling is about.

**Deserves its own small wave, not M6's depth track.** Widening 6J-d into it would enlarge a wave that
is already on the critical path, and the wave that adds it should be the one that also decides the
severity.

## 51. Column chain-homogeneity is an invariant nothing enforces — RECORDED 2026-09-06, NOT SCHEDULED

**Raised by [ADR 0090](../decisions/0090-a-frozen-space-slides-with-its-run-and-follows-the-body-it-recorded.md)
decision 3, recorded there and deliberately not ruled.**

A column is one vertical stack at one along-wall coordinate and must slide as one thing or tear. ADR
0090 decision 2 relies on that: a frozen extent slides on the chain its recorded `depthFromBuildId`
declares, and the recorded source is a member of that column, so the extent lands where its members
land **provided every member of a column declares the same `alongWallPositionFollows`**.

**Measured true on the seeded design at 600** (ADR 0090): `B|0.61` is `wall-map` on both its members
(`wall-corner-return-570`, `wall-corner-return-570-top`) and every other column is `base-formula`
throughout. Wave 6J-d asserts it at both settings.

**Nothing enforces it on an arbitrary document.** A column whose members declared two different chains
would tear by 30 mm at 700 — 6J-c's own measured difference between the chains — with the frozen
extent sliding on its recorded source's chain while a member slid on its own, and every layer
downstream internally consistent and wrong together.

**Reachability measured 2026-09-08 — it is not reachable through the offer list** —
`packages/configurator-domain/tests/backlog-51-chain-homogeneity-is-unreachable.test.ts`, which keeps
the measurement as a standing guard. At both declared depths, on the seeded kitchen and on the same
kitchen with all 22 deletable bodies cleared: **400 offer rows over 29 targets name no `wall-map`
body**; that world is also swept after a real `setCabinetDepth(700)` and back
(`apps/web/tests/store/backlog-51-after-the-real-depth-command.test.ts`), because the shipped command
rebuilds bodies and renames build ids where a settings swap does not; the only two such entries are
the structural corner returns, each `insertable: false`,
`canReplace: false`, `canDelete: false`; and the single column holding them (`B|0.61`) opens **no
void** even when the rest of the kitchen is emptied, so nothing can be inserted beside them either.
The mixing is blocked from both directions.

So **no validator is owed for the product's own paths**, and what remains is only the load seam: a
hand-crafted document can still declare a mixed column. That is the same refuse-or-mark ruling
entry 50 needs, and the two should be decided together. A third `wall-map` entry, or one of these
turned insertable, fails the guard's first block.

The original note, which the measurement above answers, follows.

**Whether it is reachable was not measured.** It needs an offer list that can place a `wall-map` entry
into a column already holding a `base-formula` one, and the two shipped `wall-map` entries are
`STRUCTURAL_CORNER`. **What deciding it would cost**: either a new refusal code at the load seam
(ADR 0052, [ADR 0084](../decisions/0084-canfinish-is-the-load-seams-and-a-command-fixture-constructs-only-its-own-contracts-inputs.md))
or a catalogue-level sweep that cannot see which entries share a column. Choosing between those is the
decision, and it should start by measuring whether the state is reachable at all through the offer
list.

---

## 54. Cabinet depth changes the material used and does not change the price — SHAPE RULED 2026-09-07 ([ADR 0100](../decisions/0100-depth-is-priced-by-a-dashboard-editable-multiplier-on-the-600-mm-base-and-it-is-deferred.md)), IMPLEMENTATION DEFERRED BY THE OWNER

**Ruled and postponed, 2026-09-07 — this is a decided item awaiting the owner's own return to it, not an open question.** The owner chose a single **depth coefficient applied as a multiplier to the 600 mm base price**, owned as a **dashboard-editable setting** rather than a constant, explicitly over the per-cabinet 600/700 price mapping because that *"would need two price records per cabinet"*. *"Like fifteen percent"* is a working figure and **not a committed rate**. The owner then said, twice on the same day, *"Record and postpone… I really don't want to waste time and effort on this."*

**So: do not re-ask the owner what shape depth pricing takes — they answered.** What is still owed is the manufacturer's actual rate, which is the owner's to obtain when they return. Do not plan a wave. [ADR 0100](../decisions/0100-depth-is-priced-by-a-dashboard-editable-multiplier-on-the-600-mm-base-and-it-is-deferred.md) carries the ruling, the two rejected alternatives, and two implementation constraints measured on 2026-09-07 — the runtime parser's derived `MAX_PRICE_COEFFICIENT_MINOR` bound, and the fact that a multiplier is not a fifth linear term and needs a declared rounding rule at a named seam.

**Note 2026-10-25: the postponement is lifted.** The owner un-postponed depth pricing and it is now backlog 283 ([ADR 0100](../decisions/0100-depth-is-priced-by-a-dashboard-editable-multiplier-on-the-600-mm-base-and-it-is-deferred.md) Amendment). The paragraph above ("Do not plan a wave") is superseded; the shape and the unapproved ~15% stand.

**Note 2026-10-26: M10, waves P2/P3 and Q1** (as backlog 283); superseded in part by 283. [ADR 0100](../decisions/0100-depth-is-priced-by-a-dashboard-editable-multiplier-on-the-600-mm-base-and-it-is-deferred.md) Amendment of 2026-10-26. Not built.

**The original entry, unedited, follows.**

**Observed by the owner, 2026-09-06**, reading the collected copy at Gate O1: *"changing kitchen
worktop depth didn't change the cabinets price? … is not logic, as it uses more material"*.

**Confirmed in the code, not inferred.** A cabinet line is
`baseMinor + perWidthMillimetreMinor × width + perHeightMillimetreMinor × height + perDoorLeafMinor × leaves`,
plus its hardware (`packages/configurator-domain/src/pricing/price-book.ts:63-112`, `:227-238`).
**There is no depth coefficient**, and a grep across `packages/configurator-domain/src/pricing/`
returns no reference to depth in any non-comment line. A deeper carcass — more board in the sides,
base, shelves and back — prices identically to a shallow one.

**The product copy states this as though it were intended.** `globalSettings.depthNote` reads
*"Adâncimea nu schimbă prețul bucătăriei — doar dimensiunile dulapurilor."* That sentence is
accurate about the code and wrong about furniture. It is **not** to be edited while the code still
behaves this way: a note that promised a depth-dependent price the book cannot produce would be the
worse of the two errors.

**Why this is not a wave yet.** The fix is a **price-book shape change** — most plausibly
`perDepthMillimetreMinor`, mirroring the width and height coefficients that already exist — and the
rate is a manufacturer figure nobody in this repo may invent. Drafting one would repeat exactly the
failure ADR 0092's push-to-open rates already cost this milestone: a placeholder that becomes
load-bearing on a customer-visible price the moment something starts depending on it.

~~**Owner input, held by the owner:** *"I need to check with manufacturer"* (2026-09-06).~~ **Half answered 2026-09-07 — the owner ruled the shape (ADR 0100) and postponed the rest.** The rate is still theirs to obtain. Two things
are needed together — whether depth is priced at all, and if so the rate per millimetre of depth (or
whatever shape the manufacturer actually quotes: per square metre of board, per depth band, or a
surcharge above a standard depth). **The shape of the answer decides the coefficient's shape**, so
the book must not be extended before the answer arrives.

**Where it lands.** The manufacturer price dashboard owns book authoring
([ADR 0062](../decisions/0062-a-manufacturer-price-dashboard-comes-after-m8-and-shapes-seams-now.md)
seam 1, [ADR 0072](../decisions/0072-price-book-versioning-is-deferred-to-the-manufacturer-dashboard.md)), so this is
a coefficient the dashboard's book validation and its authoring surface must both know about.
Recorded here rather than scheduled: **no change to M6**, on the owner's explicit instruction.

**Related, same root — the book's coefficient set is under-specified against the product's own
settings.** Entry 41 records that the sink, bowl and faucet do not follow the cabinet-depth setting
either; that one is geometry, this one is money, and both are downstream of depth being a setting
the rest of the system half-ignores.

## 55. The global settings actions are absent on a first visit and present after a reload — RECORDED 2026-09-07, NOT REPRODUCED, NOT W2's FIX

**Observed by the owner, 2026-09-07**, correcting their own earlier item 2/item 3 report:

> "There is already the button. It was a glitch that it didn't show… when you open the browser and
> don't make a reload, when you open the global settings, the refuse and apply buttons are missing.
> But if you make a refresh, these buttons are on the place… we need to play more with this to find
> how to reproduce the issue."

**The owner withdrew the layout request that originally accompanied this** (move the save control to
the top of the sheet). That request is closed and no record was written for it. What is recorded here
is the **defect** the owner described while withdrawing it, because it is new information and sharper
than the original report: not "the buttons are missing" but **"the buttons are missing until you
reload"**.

**It is not what wave W2 fixed, and this was checked rather than assumed.** W2 shipped
`padding-bottom: env(safe-area-inset-bottom, 0px)` on `.surface`
(`apps/web/src/settings/global-settings.module.css:151`), written against a scroll-state and
home-indicator inset problem — its own comment reads *"the owner's 'the save buttons are sometimes
there and sometimes not', read as an inset problem"*. **`env(safe-area-inset-bottom)` has the same
value on a first visit and after a refresh.** A constant inset cannot produce a reload-sensitive
symptom, so W2's fix is not this and closing W2 does not close this.

**What is true in the code.** The cancel/apply pair renders **unconditionally** in the choosing
step's footer (`apps/web/src/settings/global-settings.tsx`) — no viewport condition, no feature flag,
no state in which `ChoosingStep` renders without them. So the report is about where they landed, not
whether they existed. The sheet is `position: fixed; bottom: 0; max-height: 77dvh` with `.body`
scrolling internally and the footer pinned, and there is **no JavaScript layout measurement anywhere
in this surface** — no `ResizeObserver`, no `getBoundingClientRect`, no `visualViewport` reader — so
the client-side-navigation-versus-server-render distinction has no code path to act through. That is
what makes this hard rather than obvious.

**The most plausible remaining mechanism, stated as a lead rather than a diagnosis.** iOS Safari with
a restored tab: opening the browser onto an already-open tab restores a layout viewport from the
previous session while the toolbars are expanded, and a `position: fixed; bottom: 0` element measured
in `dvh` can land below the visual viewport until something forces a re-layout. A reload is such a
force. W2's inset reduces the overlap by a constant and does not eliminate a mis-measurement that is
not constant. **Not reproduced from this machine** — it needs a real iOS Safari and the owner's own
open-the-browser-without-reloading sequence.

**What evidence would confirm it**, in the order it is cheapest to collect:

1. The owner repeating the sequence and reporting whether the buttons appear after **scrolling the
   page** (or rotating the device) *without* reloading. If they do, it is the layout mechanism above
   and not a rendering one.
2. A screenshot of the sheet in the failing state, so the sheet's own bottom edge can be located
   relative to the toolbar — the actions being *below the fold* and the actions being *absent from
   the DOM* look identical in a report and are different defects.
3. If neither, an inspected DOM in the failing state: `global-settings-cancel` and
   `global-settings-apply` present with a bounding box outside the visual viewport (layout) versus
   absent from the document (rendering). This is the measurement that splits the field, and until
   somebody has it the fix cannot be chosen.

**What deciding it would cost.** Unknown until it is reproduced, and that is the honest state. If it
is the layout mechanism, the fix is in the same stylesheet W2 already touched and is small; if the
actions are genuinely absent from the DOM on a first paint, it is a rendering defect in a surface
that has no conditional rendering today, which would mean something upstream of the sheet is at
fault. **Do not schedule a fix before step 3 above.** Guessing between those two produces a change
that cannot be shown to have worked, which is how this item got reported twice already.

## 56. An emptied column over a full-height member can lose 269 mm of depth after a depth round trip — RULED 2026-09-08 ([ADR 0102](../decisions/0102-a-recorded-source-must-explain-its-depth-and-a-second-authority-in-a-test-is-the-defect-laundered.md)), AWAITING WAVE 6Y

**Found 2026-09-08** while adjudicating a finding the item 8 implementer raised and refused to treat
as settled. Ruled in [ADR 0102](../decisions/0102-a-recorded-source-must-explain-its-depth-and-a-second-authority-in-a-test-is-the-defect-laundered.md);
this entry exists so the **product** half survives independently of whether wave 6Y is scheduled this
milestone.

**What was observed.** Four ordinary commands on the shipped kitchen — change the depth to 700, delete
the top cabinet at `B|1.80`, delete the pantry beneath it, change the depth back to 600 — leave that
column's frozen extent at **330 mm**. It was 600 mm when the kitchen loaded and 700 mm one command
earlier, and a 699 mm pantry had been standing in it. Anything inserted there afterwards is planned
against 330.

**Measured 2026-09-08 at `ed12804`**, driven through `removePlacement`, `setCabinetDepth`,
`deriveColumns` and `projectFrozenMap` with the domain's own fake probe. The only variable is whether
the two deep tops are pinned (as before ADR 0101) or lifted (as after it):

| Step | pinned — before ADR 0101 | lifted — after ADR 0101 |
| --- | --- | --- |
| load @600 | `B\|1.80 d=600.0 src=wall-2door-600-deep-top` | same |
| after `setCabinetDepth(700)` | `B\|1.90 d=699.0 src=tall-pantry` | `B\|1.90 d=700.0 src=wall-cabinet` |
| after both deletes | `d=699.0` | `d=700.0` |
| **back at 600** | **`d=599.0`** | **`d=330.0`** |

**What is actually true in the code.** `resolveDepthM` (`packages/configurator-domain/src/commands/
insert-fit.ts:835`) builds a wall body over a full-height column to `columnBuildDepthM`'s lifted arm —
the cabinet-depth line, 600 or 700 — and never to the entry's own `frameDepthMm`. `restoredColumns`
(`void-engine.ts:668`) then records `depthFromBuildId: deepest.buildId` for that depth anyway, so the
column names a body declaring 330 or 400 as the source of 600 or 700. When the column is later emptied,
`frozenDepthAtThisSetting` (`frozen-map-at-cabinet-depth.ts:391`) re-answers the extent from that
entry's declaration and publishes the 330.

**330 is wrong under both of that function's own arms**, which is what makes this a defect rather than
a preference: the sourceless fallback would have kept 700 as a surplus (ADR 0080 decision 4,
deeper-only), and the honest re-answer of the body that actually stood there is 599, which is what the
product gave before ADR 0101. It is also shallower than the 600 the extent was frozen at, which wave
6K-c's own criterion — *"nothing shrinks, in any arm"* — forbids.

**It is pre-existing, and that was checked rather than assumed.** The mechanism is **wave 6I2's**, on
`main` since 2026-09-04, and it reproduces in **three ordinary commands on declarations ADR 0101 never
touched**: delete `p23`, insert the **offered** `wall-cabinet` into `B|1.80`'s `y0` 2.2 void (the offer
list returns `wall-cabinet`, `wall-lift` and `open-shelf` there), then one `setCabinetDepth(700)` —
`["B|1.90 d=700.0 src=wall-cabinet declares 400.0 at 700"]`. ADR 0101 did not create it; it moved the
**shipped** kitchen into the population that reaches it.

**What deciding it would cost.** Already decided — ADR 0102 decision 4 opens wave **6Y**, against
`restoredColumns`, on a principle ADR 0080 decision 4 already states (*"`columnBuildDepthM` is a
declared size and no body's declaration, so claiming one for it would be an invention"*). Two shapes
are admissible and the wave picks between them on measurement: record no source for a depth the lifted
arm produced, or record the member that does explain it. **This wave moves published depths**, so
ADR 0079 decision 9 binds it in the opposite direction and its first acceptance criterion is an
enumeration of every state whose `Column.d` moves, with the 600 mm kitchen byte-identical as it loads.

**Not the same entry as 15 or 37.** Entry 15 (resolved, wave 6I2) is *what a wall body over a column is
built to*; entry 37 (resolved, ADR 0101) is *the pinned tops being proud at 700*. This is the **record
beside the depth** rather than the depth itself, and it survived both of them.

**Nor the same entry as 57.** Entry 57 is the *hood* swapping its catalogue equivalent on a depth
change; this is the *record* beside a column's depth. Unrelated mechanisms, found in the same week.

## 57. A depth change hands the hood a width control it is declared not to have — RECORDED 2026-09-08, PRE-EXISTING, NOT WAVE 6Z's

**Found 2026-09-08** while establishing wave 6Z's exclusion rule
([ADR 0103](../decisions/0103-a-standing-body-is-re-planned-when-something-is-inserted-beneath-it-and-a-delete-leaves-it-alone.md)
decision 12). Recorded here because it is a real, reachable, customer-visible change that no wave owns
and no record mentions.

**What was observed.** One ordinary `setCabinetDepth(700)` on the shipped kitchen, with no insert, no
delete and no resize, turns `p13` from `hood-600` into `hood` and flips its `fixedWidth` from **`true`
to `false`**. The customer is handed a width control on an extractor hood that the fixture
deliberately withholds.

**Measured 2026-09-08 at `ed6c545`**, through `createConfiguratorStore` and the web fake probe:

```
p13/hood-600  band=wall  w=600  h=700  seat=undefined  frame.d=700  fixedWidth=true
  setCabinetDepth(700)
p13/hood      band=wall  w=600  h=700  seat=900        frame.d=900  fixedWidth=false
```

**Half of that is correct and must not be "fixed".** The seat moving 700 → 900 is right: a front-hung
500 mm hood at a 700 mm kitchen centres 450 mm from the wall ([ADR 0039](../decisions/0039-the-hood-is-front-hung-and-standard-depth.md)
decision 2), and `2 × 450 = 900`. The height is unchanged at 700, which is
[ADR 0039](../decisions/0039-the-hood-is-front-hung-and-standard-depth.md) decision 5 holding since
wave 5F. **The `fixedWidth` flip is the defect**, and it is the one half nothing checks.

**What is actually true in the code.** `rebuildEveryBodyAt`
(`packages/configurator-domain/src/commands/set-cabinet-depth.ts`) asks `movesWithTheSetting`, which is
`true` for `hood-600` — its `depthRule` follows the cabinet depth — and then resolves an
`InsertableBody` through `resolveRebuildBody`, which takes ADR 0022's `catalogEquivalentId`. `hood-600`
declares `hood`, and the two rows disagree on exactly one field: `fixedWidth` is `true` on the seeded
row and `false` on the catalogue row.

**This is product-logic review R3.2's own defect, arriving through the other door.** `moveHood`
(`commands/rebuild-resized-bodies.ts`) exists precisely because rebuilding a hood through
`evaluateInsertFit` *"resolved the seeded instance to its catalogue equivalent: `hood-600` became
`hood` … and `fixedWidth` flipped true → false, handing the hood a width control the fixture
deliberately withholds."* `setWidth` was taught to route around it. **`setCabinetDepth` was not.**

**What deciding it would cost.** Not measured, and deliberately not designed here. Three shapes are
visible and each has a cost the deciding record has to weigh: reconcile the two rows so
`hood`'s `fixedWidth` is `true` (changes what an *inserted* hood offers, which is a different product
question); give `setCabinetDepth` a `moveHood`-shaped branch (a fourth branch in a loop that already
has three); or declare `fixedWidth` non-migrating so no rebuild may change it (widest, and the only
one that also protects `canFinish` and `canHandle`). **A wave should not pick one without measuring
whether the hood is resizable in practice after the change** — the width chips are `blocked` for other
reasons on some rows, and "the control appears" and "the control does anything" are two findings.

**It is not wave 6Z's, and 6Z must not touch it.** ADR 0103 decision 4 excludes the hood from 6Z's
re-plan by declaration — a `wall-plane` entry states where it finishes and the column does not decide
it — precisely so that this wave does not deliver the same flip through an *insert* as well. A 6Z
acceptance criterion asserts the hood's `fixedWidth` stays `true` across an insert beneath it.

## 58. `THREE.Clock` is deprecated and React Three Fiber still constructs one — DIAGNOSED 2026-09-08, THIRD-PARTY, NOTHING TO FIX HERE

**M6-AUD-011, closed as an upgrade to track rather than a defect to fix.** The browser logged
`THREE.Clock: This module has been deprecated. Please use THREE.Timer instead.` throughout the
audit's 110-test run, and the audit could only say the symbol is absent from repo source. It is now
traced, so nobody investigates it twice:

- `three@0.184.0` deprecated the class at **r183** —
  `three/build/three.core.js:55989`, `warn( 'Clock: This module has been deprecated...' )`.
- `@react-three/fiber@9.7.0` constructs one for its own store —
  `dist/events-*.esm.js:1016`, `clock: new THREE.Clock()`.

So the warning is emitted once per R3F store, from a dependency, and **no change to this repository
can silence it**. It is noise, not breakage: `Clock` still works.

**What to do**: nothing, until React Three Fiber moves to `THREE.Timer`. Then take the upgrade with
the rest of the R3F/Three bump and confirm the log is quiet. Pinning or patching R3F to remove one
console line would cost more than the line does. **Do not** add a console filter — it would hide the
next deprecation too.


## 59. `setCabinetDepth` slides every wall-B column and has no key-collision guard — RECORDED 2026-09-08, LATENT, NOT SCHEDULED

**Found by the logic review of the backlog-50/51 witnesses, 2026-09-08.** A depth change is not only
a rebuild: `alongWallPositionAtMm`
([`along-wall-chain-shift.ts`](../../packages/configurator-domain/src/along-wall-chain-shift.ts))
slides every wall-B placement by **its own chain's delta** — `base-formula` +100 as the reach goes
560 -> 660, `wall-map` +70 as it goes 291 -> 361 — so the two chains move by **different amounts**
and wall B's column keys are not the same set at the two settings:

```
600:  B|0.61 (wall-map)  B|0.74  B|1.20  B|1.80  B|2.45
700:  B|0.69 (wall-map)  B|0.84  B|1.30  B|1.90  B|2.55
```

Measured 2026-09-08 through `createConfiguratorStore` and the web fake probe, and now swept at both
settings by `apps/web/tests/store/backlog-51-after-the-real-depth-command.test.ts`.

**Nothing refuses a collision on that path.** A width resize has `refuseKeyCollision`
([`apply-column-moves.ts:118`](../../packages/configurator-domain/src/commands/apply-column-moves.ts)),
which refuses a member landing on an occupied key. `setCabinetDepth` has no equivalent — grep it for
"collision" and there is nothing.

**It is safe on the shipped catalogue, and safe for a reason nobody wrote down**: each chain
translates rigidly, so relative order is preserved, and the 130 mm gap between the wall-map column
and its nearest base neighbour comfortably exceeds the 30 mm of relative slide between the two
chains. **That margin is a property of the current numbers, not a rule.** If either reach formula
moved — a new head-clearance row, a different front assembly — a depth change could file two chains
under one key, and every suite would stay green while it happened.

**What deciding it would cost**: a collision check in `setCabinetDepth`'s republish step, and a
decision about what a collision *means* there. A resize can refuse and leave the design alone; a
depth change is a whole-kitchen command the customer has already been shown the price of, so
refusing it wholesale is a different product answer from refusing one member's move. That is the
decision, and it should be taken with backlog 50 and 51's shared load-seam severity rather than on
its own.

## 60. A colour leaves the structural corner base white, and nothing tells the customer why — RULED AND SHIPPED 2026-09-09, IN TWO WAVES; ADR AMENDMENT OWED

**Seen in a browser, not inferred** — the wave 6Z / ADR 0099 visual pass, evidence in
`testing-reports/vis6z-2026-09-09/`. Apply a kitchen colour and the structural corner base
(*Corp bază de colț*) keeps the material's default white: a white door with a handle standing
between Antracit or Gri Havanna neighbours.

**It is correct, and that is the problem.** `STRUCTURAL_CORNER`
([`kitchen-l-design.ts`](../../packages/configurator-domain/src/fixtures/kitchen-l-design.ts))
declares `canFinish: false`, and [ADR 0099](../decisions/0099-a-colour-is-chosen-at-two-levels-and-the-cabinets-wins.md)
decision 8 rules such a body unaffected at **both** levels — the kitchen's colour and the cabinet's
own. The open shelf, the hood and the freestanding fridge carry the same declaration and behave the
same way. Nothing is broken.

**But on screen it reads exactly like a body that failed to repaint**, and the verifying agent chased
it as a defect before reading the record. On a dark kitchen it is the first thing a customer will
point at, and **no copy anywhere explains it**.

**What the owner was asked**: is a white corner between coloured neighbours the intended product?
The options were the owner's to choose between — leave it and say nothing, leave it and explain it in
§9 or the settings sheet, or make these bodies take the kitchen's colour after all, which is an
ADR 0099 decision 8 amendment rather than a fix.

### RULED 2026-09-09 by the owner: the third option

> *"structural cabinetry follows the kitchen, appliances never do"* — with *"fridge no, hood also
> no"* — and *"open shelves can have and by default should inherit global set color"*.

**Delivered in two waves, and the second was owed precisely because the first looked complete.**
Every following body resolves to the kitchen's colour in the document and in
`PlacementRecord.drawnFinish` — but the renderer painted only fronts, so `base-corner-x-900`,
`wall-corner-return-570` and `wall-corner-return-570-top` changed on screen and the open shelf, the
body the owner named, did not. **A declaration flip on a frontless body passes every test while
changing nothing a customer can see**; the mesh census below is what caught it, and it is the reason
this entry records what moved rather than that the work was done. The second wave gave the shelf a
surface. `base-corner-return-320` has none and needs none — the finding is recorded below rather than
left open.

So the class `canFinish: false` used to hold whole is now two:

| Body | Behaviour |
| --- | --- |
| `base-corner-x-900`, `base-corner-return-320`, `wall-corner-return-570`, `wall-corner-return-570-top` | **Follow the kitchen's colour.** All four wear `STRUCTURAL_CORNER`, which declares it once. |
| `open-shelf-600` / `open-shelf` | **Follows the kitchen's colour.** |
| `hood-600` / `hood`, `fridge-free-700` / `fridge-free` | **Never painted, at any level.** |
| Every other catalogue entry | **Chooses its own colour**, and falls back to the kitchen's and then the material's — ADR 0099 decision 1's order, unchanged. |

**None of the seven gains a colour control.** They follow; they do not choose. `canFinish: false` is
unchanged for every one of them, which is the half of ADR 0099 decision 8 that stands — and it is
what keeps ADR 0099 decision 2 intact, because `setFinish` still refuses them, `carriedAppearance`
still declines to copy a colour onto them and the load seam still strips one that arrived by another
route. A following body's `finish` key stays **absent** through any number of colour changes.

### The declaration: `BodyDefinition.finishRule`

**`packages/configurator-domain/src/body-finish-rule.ts`** — `BodyFinishRule`, three arms and no
default: `CHOOSES_ITS_OWN_COLOUR`, `FOLLOWS_THE_KITCHENS_COLOUR`, `IS_NEVER_PAINTED`. Declared per
catalogue entry, never a list of build ids anywhere (ADR 0058 decision 2, ADR 0103 decision 4).

It **fails closed twice**, the way `cabinetDepthRuleOf` does. `bodyFinishRuleOf` refuses an entry that
declares nothing — reading absence as *chooses* paints a fridge and reading it as *never* recreates
this very defect — and refuses one whose `finishRule` and `canFinish` disagree, so the two
declarations cannot become two authorities. `refuseUndeclaredFinishRules` runs it over both
populations as `buildKitchenLBodyCatalog` assembles the map.

**It is a second declaration rather than a widened `canFinish`, because the two answer different
questions**: `canFinish` is *may this body's document carry a colour of its own*, which the ruling
moved for nobody; `finishRule` is *what colour is this body drawn in*, which is what moved.

The resolution is `drawnFinishOf` (`resolved-finish.ts`), read by `derivePlacementRecords` into
`PlacementRecord.drawnFinish`. `resolvedFinishOf` is untouched, so `chosen-finishes.ts` and the
settings sheet compare against what they always did. The adapter's `record.canFinish` paint guard is
**gone** — after the ruling that flag is `false` for bodies that must be painted and for bodies that
must not, so the refusal moved into the domain beside the declaration and `three-adapter` still
learns no rule (§12).

**Owed: the ADR 0099 amendment**, which the coordinator writes. `docs/decisions/0099-*.md` was not
edited by this change.

### CLOSED 2026-09-09: the open shelf shipped too, and the corner base return is nothing owed

The ruling landed in two waves because the declaration and the surface are different problems. The
first gave every following body the kitchen's colour in its document and in
`PlacementRecord.drawnFinish`; the second gave the open shelf something to show it on.

**Measured both times the same way** — the seeded kitchen built twice, every mesh's rendered colour
read off the built object, comparing the wave against its own predecessor. Colour and not material
uuid: a uuid is only meaningful inside one process, since two runs of `makeKit` mint different
instances for identical scenes.

| Placement | Body | Meshes | What moved, and in which wave |
| --- | --- | --- | --- |
| `p25` | `base-corner-x-900` | 10 | `door_front` `#eceeeb` → `#2b2d30` (first) |
| `p9` | `wall-corner-return-570` | 7 | `door_front` `#eceeeb` → `#2b2d30` (first) |
| `p21` | `wall-corner-return-570-top` | 7 | `door_front` `#eceeeb` → `#2b2d30` (first) |
| `p12` | `open-shelf-600` | 7 | its **six boards** → `#2b2d30` (second); `back_panel` unchanged |
| `p26` | `base-corner-return-320` | 3 | **nothing, and nothing should** — see below |
| `p13` | `hood-600` | 4 | nothing — correct, it is never painted |
| `p7` | `fridge-free-700` | 14 | nothing — correct, it is never painted |

#### The open shelf, ruled by the owner 2026-09-09 and shipped

> The six boards take the kitchen's colour; the tiled `back_panel` does not — *a coloured shelf
> mounted on the wall, not a coloured niche*. And **one rule, no wood special case**: the shelf takes
> whatever the kitchen has, flat palette colour or wood decor alike, and falls back to the material's
> default when the kitchen has none.

`side_left`, `side_right`, `shelf_top`, `shelf_bottom`, `shelf_1` and `shelf_2` follow;
`back_panel` keeps `M.tile` at every colour. Verified at a flat decor (`pal.antracit`, `#2b2d30`), at
a wood decor (`pal.nuc-warmia`, `#8a5c3b`) and with no kitchen colour on veneer, where it takes the
declared default (`veneer.stejar`, `#cba173`).

**How, and why not the obvious way.** A new declaration — `wearsTheBodysFinish`, in
[`body-finish-surfaces.ts`](../../packages/three-adapter/src/body-finish-surfaces.ts) — is written by
the builder that makes the mesh, and `applyBodyFinish` now paints `collectPaintedSurfaces` (fronts
**plus** declared surfaces) instead of `collectFronts`. `openShelf` is the only builder in the kit
that declares anything.

**Widening `FRONT_MESH_NAME` was the obvious fix and is the wrong one**, ruled out by a census rather
than by argument: the shelf's mesh names are not its own.

| Mesh name | Bodies that build it |
| --- | --- |
| `side_left`, `side_right`, `back_panel` | `base-dishwasher-600`, `base-sink-800`, `open-shelf-600`, `tall-oven-tower-600` |
| `shelf_mid` | `tall-oven-tower-600` |

A `side_|shelf_` pattern would have painted three other bodies' carcass interiors and the oven
tower's shelf. It would also have moved two unrelated readers, because `isFrontMesh` is this
package's single definition of a *front*: `cabinet-handle-meshes.ts` asks it to decide whether a
handle belongs to a cabinet, and `apps/web/src/scene/kitchen-stage.tsx` repaints a whole room through
`collectFronts(stage.room)`. Both read exactly what they read before, and that is asserted rather
than assumed. Applying the widening anyway turns **26 adapter tests red across 5 files** — measured.

#### `base-corner-return-320` — nothing owed, and not a defect to reopen

It builds three meshes: `plinth` (`M.dark`), `carcass` (`M.carcass`) and `countertop` (`M.stone`).
There is no front and no outward face of its own; its only cabinetry surface is the carcass, which is
the box **interior** every cabinet in the kit shares — and no body is painted there at any colour.
So there is nothing to give it that would not also recolour the inside of every other cabinet.

**Its following is real and is proved** — in the document, where its `finish` key stays absent, and
in the record, where `drawnFinish` resolves to the kitchen's colour
(`configurator-domain/tests/structural-cabinetry-follows-the-kitchens-colour.test.ts`). There is
simply nothing outward for it to show, and the return leg stands against the corner where almost none
of it is visible anyway. **This is a conclusion, not a deferral: it should not be reopened as a bug.**
Pinned by name in `qa-0099c-each-unchoosing-body-by-name.adversarial.test.ts`, which asserts it mounts
exactly those three meshes and renders identically with and without a kitchen colour.

**Owed: the ADR 0099 amendment**, which the coordinator writes. `docs/decisions/0099-*.md` was not
edited by either wave.


## 63. A hood is offered over wall A's corner, accepted, and then marked — RECORDED 2026-09-11, PRE-EXISTING, NO OWNER

Found by M7 wave 7D1's QA (finding Q1.3) and reproduced on the seeded kitchen: clear `p8` and `p15`
(the wall and top cabinets over the corner base), and the wall-band opening over wall A's corner offers
`hood`. The insert is accepted, and the design then carries `RECORDED_SPAN_OVERLAPS_CORNER_BODY`,
because the hood's depth reaches past wall B's corner return (which starts at 330 mm along wall B).
That code is a **mark** by the owner's ruling of 2026-09-09 (`validate-design.ts`, severity table), so
the design saves and loads.

**What deciding it would cost.** [ADR 0107](../decisions/0107-appliances-are-drawn-and-not-sold-and-a-language-is-named-in-its-own-language.md)
decision 3 removes from the offer list only an entry the engine *refuses*; this one it accepts and
then marks. Dropping it from the offer would be a new rule — "an entry that would be marked is not
offered" — for the owner. **Composition never produces it**: M7 wave 7D2 places nothing over wall A's
corner zone (milestone, *Adjudication 7D1-Q1*).

**Narrowed 2026-10-01 by M7C wave C2 (`0a1a69a`), not closed.** [ADR 0110 Amendment O](../decisions/0110-generation-inserts-through-the-command-path-and-the-corner-is-structural-data.md#amendment-o--2026-10-01-a-fixed-corner-wall-unit-stands-over-every-generated-corner-the-top-row-the-validators-banded-reach-and-the-fridge-gap-absorb)
(O8) records that the opening no longer exists in any room that gets the corner wall unit. It remains on
**the seeded reference kitchen**, on **the back wall of a U of 10 m or more** (where the unit is
deliberately absent), and on **designs stored before `0a1a69a`**. **A narrowed validator case came with
it** (Amendment O5): a wall-B wall-row body that starts between the unit's 291 mm seat and 330 mm is no
longer flagged, though the closure is solid there. It is reachable only by a hand-made or corrupted
document, and safe because the side return's near edge and the closure's front come from one wall-depth
map and no command moves a structural piece [relayed from the logic review R6.2].

## 65. An `it.fails` shell at height 2188–2199 can yield `PLACEMENT_ABOVE_ROOM` against `FIT_TOLERANCE_M`'s 12 mm — RECORDED 2026-09-11, PRE-EXISTING, NOT REACHABLE, NO OWNER

Found by M7 wave 7D1's QA, round 3 (finding Q3.1, Low), and pre-existing rather than introduced by the
wave. `insert-fit.ts:636/675` lets a body stand up to `FIT_TOLERANCE_M` (12 mm) above the room while
`validate-design.ts`'s check is strict, with no matching tolerance. In an **engine-limit** shell — one
built at the engine's own bounds rather than the owner-approved ones — at a room height in
**2188–2199 mm**, a 2200 mm column body fits by the insert's tolerance and then reads
`PLACEMENT_ABOVE_ROOM` from the validator.

**Not reachable by a customer today.** `APPROVED_ROOM_POLICY`'s ceiling starts at **2200 mm** (ADR
0108 Amendment B), so no approved room falls in the 2188–2199 band; only a shell built directly against
`ENGINE_ROOM_LIMITS` (860 mm floor) can reach it, and nothing in M7 does that yet.

**What deciding it would cost.** Either the insert's `FIT_TOLERANCE_M` and the validator's strict check
converge on one tolerance, or the gap is left as a known asymmetry documented at both sites. Worth
revisiting if a later wave (linear kitchens, M7B) ever builds a shell at the engine's own limits rather
than the approved ones.

## Also open, recorded elsewhere — do not duplicate here

- **Width editing does nothing yet.** ~~Every width chip is `blocked` because §5.4's resize command
  does not exist.~~ **Stale as of M5**: `setWidth` shipped in M5 wave 5C (see
  `docs/backlog/resolved.md`, entry 4). This bullet is kept only as a record that the note existed;
  it is no longer an accurate description of the product.
- **Depth joined M5 on 2026-08-27** and is no longer "M5's entire scope" being width alone. Entry 5's
  unfinished half (the unlinked cap and nominal) is M5 wave **5A**, and base carcass depth as a
  formula is wave **5F** — both shipped (see `docs/backlog/resolved.md`, entry 5). The wave letters
  were reassigned when that landed — `docs/milestones/done/M5-width.md` carries the old→new mapping.
- **The worktop depth control is M6's, not M5's** (owner, 2026-08-27). M5 owns the geometry with the
  worktop as a declared constant at 600; `docs/milestones/done/M6-price-and-global-settings.md` work item
  4 adds the control. Scheduled in both, so it is not backlog in either.
- **M4's deferred review findings** (the redundant panel test-file split, `advancePast` opening a
  span no command can produce, the notice remounting on every retry, the write-access probe's
  doubled read rate that M8's rate limits must be sized against) are recorded in `docs/STATUS.md`
  under "What is open right now".
- **The handset pass itself** was open in `docs/STATUS.md` and is now partly done: the scene renders
  correctly on iOS Safari against production. The items in this file were all found during it.
- **The mint endpoint is unbounded at the application layer right now** (recorded 2026-08-31).
  `POST /api/designs` has no application limiter and no active retention; an adversarial review on
  2026-08-30 reproduced it as SEC-001 (High) and chained it into AV-4 with SEC-002 and DB-002. The
  owner reaffirmed the M8 / pre-launch deferral on 2026-08-31 — so this is a scheduled, gated
  decision, not a backlog item. The gate is `docs/milestones/M8-review-contact-success.md` under
  "Launch gate"; the decisions are ADR 0019 and its 2026-08-31 correction. Until that gate is
  checked off, do not expose the endpoint to real traffic.

## 61. The open shelf sits on the handle line where the owner ruled it onto the door line — RULED 2026-09-09, DEFERRED TO ITS OWN WAVE

**Ruled by the owner on 2026-09-09**: the open shelf's boards sit on the **door line — 309 mm at a
600 mm kitchen and 379 at a 700 mm one**. They were shown three planes and chose the middle one:

| the shelf's boards sit at | 600 | 700 | reads as |
| --- | --- | --- | --- |
| the handle line (today) | 330 | 400 | proud of the doors by 21 mm |
| **the door line — RULED** | **309** | **379** | flush with the door faces |
| the shell line | 291 | 361 | recessed 18 mm *behind* the doors |

**Deferred to a wave of its own, after M6**, on the consequence in "What stopped it" below. The
analysis is complete and a working patch exists; the next wave starts from there, not from scratch.

### The measurement that made it decidable

The report was *"the open shelves cabinet in both 600 and 700mm have bigger depth than other
cabinets"*. Measured on the mounted bodies — `open-shelf-600` (`p12`) against its neighbour
`wall-2door-800` (`p11`), world-space front faces:

| surface | 600 mm | 700 mm |
| --- | --- | --- |
| neighbour `carcass_shell` front | 291 | 361 |
| neighbour `door_front` outer face | **309** | **379** |
| neighbour `handle_bar` outer tip | **330** | **400** |
| shelf boards, all six | **330** | **400** |

So the shelf is **exactly flush with the neighbour's handle tips** and **21 mm proud of its door
faces**, at both depths. `WALL_FRONT_ASSEMBLY_MM`'s 39 decomposes, measured rather than inferred, as
**18 mm of door slab plus 21 mm of handle projection**.

**Neither the drawing nor the declaration is wrong.** `frontAssemblyMm: 0` and the geometry agree to
the millimetre, and the shelf's *occupied* depth is identical to its neighbours'. What disagrees is
the declaration and the eye: two thin handle bars and a solid full-height plane do not read alike
even where they measure alike. Without the 18/21 decomposition this reads as a vague complaint about
depth; with it, it is a choice between three named planes.

### Why there is no drawing-only fix

`deriveFrame` ([`void-engine.ts`](../../packages/configurator-domain/src/void-engine.ts)) seats a
body from **`definition.frameDepthMm`**, halved by `deriveCabinetWorldTransform`, and
`scene-sync.ts` applies `record.frame.z` verbatim — **nothing measures the built body**. A 309-deep
shelf under a 330 declaration would span 10.5 → 319.5: short of the door line *and* hanging 10.5 mm
off the wall. And the shelf is `seatedOnWallPlane`, so its front-face position and its seat are one
number and cannot be separated. **It is a domain change.**

### What stopped it — read this before assuming the shelf broke something

A shallower shelf is *genuinely* shallower, and `insertBody` calls `replanDependentMembers`, which
rebuilds a dependent body through the probe. A swap that took one probe measurement now takes two.

> **The mechanism first written here was wrong, and is struck rather than deleted so nobody
> re-derives it.** It said: *a column's depth is the MAX over its vertical run, so a shallower shelf
> lowers that column's maximum.* ~~That does not follow.~~ `Column.d`
> ([`void-engine.ts`](../../packages/configurator-domain/src/void-engine.ts)) is §3.2's MAX over
> **every** member's `occupiedDepthM`, base bodies included at ~620 mm, so a wall shelf moving
> 330 → 309 cannot move it and `columnDecidesADifferentDepth` stays false. **The failures below are
> observed and real; what triggers them is not settled.** Re-derive it from a failing row before
> the wave starts — do not start from the struck sentence.

`insert-depth.test.ts` goes from 22 passing to **4 failing**. Three of those four are **fronted**
rows — `p11 wall-2door-800`, `p17`, `p18` — and they fail **only because every case in that file
inserts `SWAP_BUILD_ID = "open-shelf"`**. The shelf does not break unrelated cabinets; each of those
cases *is* "swap a shelf into this slot". The fourth is the shelf itself, receiving 330 where the
declaration now says 309.

**The behaviour is correct** — the re-plan machinery exists for exactly this — but it is a new side
effect on a customer's tap, discovered after the change was written, and that class was reserved for
the owner. Hence the deferral.

### Three fields per entry, not two

Both `open-shelf` ([§7, `catalog.ts`](../../packages/configurator-domain/src/catalog.ts)) and
`open-shelf-600` ([seeded, `kitchen-l-design.ts`](../../packages/configurator-domain/src/fixtures/kitchen-l-design.ts))
move together (ADR 0075 decision 1):

1. **`frameDepthMm`** — the seat, `wallCarcassDepthMm` → the door line.
2. **`nominalDepthMm`** — what `buildCatalogBody` builds an *inserted* shelf to. Left at the handle
   line it draws a 330 body against a 309 declaration, and `occupied-depth.parity.test.ts` catches
   it. This is the field that was missed in the first scoping.
3. **`occupiedDepth`** — the *expression* (`shellPlusFrontMm(NO_FRONT_ASSEMBLY_MM)`) is unchanged;
   its published value follows the shell to 309/379.

`wallCarcassDepthMm` and `wallCarcassSeatDepthMm` themselves **must not move** — fifteen readers,
including every fronted wall and top row, `along-wall-chain-shift.ts`'s `wall-map` arm and the frozen
map.

### The new domain constant

The door line is `wallCarcassSeatDepthMm(d) + door thickness`, and **the door thickness is not
declared anywhere in the domain**: `WALL_FRONT_ASSEMBLY_MM = 39` states the whole assembly and its
18/21 decomposition lives only in its prose. The patch adds `WALL_DOOR_SLAB_MM` and
`WALL_HANDLE_PROJECTION_MM` beside it with a load-time guard that the three add up, following that
constant's **own** stated precedent: the domain declares it, the adapter goes on deriving its `TH`
from the door it actually builds, and a three-adapter gate holds the two to one number — ADR 0028's
remedy for two constants agreeing by luck.

### Price is unaffected

Confirmed, not assumed: no depth token of any kind reaches `packages/configurator-domain/src/pricing/`
(its only `depth` matches are a prototype-chain bound and a comment), the pricing path reads
`widthMm` and `heightMm` and no other millimetre quantity, and `cabinet.open-shelf` is priced by
width and height. The shelf also declares `NO_OPENING_FRONTS` and `NO_CABINET_HANDLES`, so ADR 0070's
per-leaf hardware gives it nothing either way.

### What is already written — start here

**The patch is 255 lines at
`testing-reports/backlog-61-shelf-door-line/item3-shelf-door-line.patch`** (gitignored, and
deliberately not left in the shared scratchpad, which is wiped). It carries: the two constants and
their guard; `wallDoorFaceDepthMm` deriving 309/379; both catalogue entries moved; the adapter's
`openShelfDepth` derived from the `TH` it builds, wired through `decomposed-bodies.ts` and
`buildKitchen`; and `qa-6k-d-shell-declaration-pairing.adversarial.test.ts` re-pointed.

### Remaining work, enumerated

1. Re-point five pinned numbers: `occupied-depth.test.ts:172`, `cabinet-depth-parameter.test.ts:86`,
   `qa-5f-depth-roundtrip.adversarial.test.ts:195`, `qa-6k-d-frame-depth-fixed-point`'s comment, and
   `worktop-depth.qa.test.ts`.
2. `cabinet-depth-parameter.test.ts` gets a **second dated re-baseline note** naming the owner's
   ruling, written *beside* the 2026-09-05 one rather than editing numbers underneath it
   (`docs/WORKFLOW.md`: a re-baseline is announced, never relaxed).
3. Re-point `insert-depth.test.ts` to expect the dependent re-plan, saying why the three fronted rows
   are involved.
4. Add the three-adapter gate holding `TH` to `WALL_DOOR_SLAB_MM`.
5. Add the relation assertion.

### Rulings that survive into that wave

- **The parts-gallery specimen at `kitchen-parts.ts:1188`, `openShelf(0.8, 0.3, 2)`, stays at 0.3**
  and carries a comment saying it is deliberately outside this rule — it is not in a kitchen, follows
  no depth map, and must not acquire a dependency on the wall map to keep a screenshot honest.
- **Assert the relation, never the literal**: the shelf's board front equals the neighbour's
  `door_front` outer face at **every declared depth**. A test pinning 309 passes at 600 and says
  nothing about 700 or about a third depth.
- **Do not change a declared depth to make a picture look right.** The two shared depth functions
  above feed ADR 0028's map, the corner reach, the frozen map and the price.

## 62. The narrower stacking fix on desktop — delete a number instead of adding one

Wave 6's chrome parity raised `.priceRow` to `z-index: 5` on desktop so the breakdown's popover,
nested in that cell, could clear §9's rail at `4`. It works and it is the fix that shipped, but it is
the *wider* of the two available fixes: it adds a layer where the alternative removes one.

**The alternative.** Drop the rail to `z-index: auto` above 900 px.
[`editor-panel.module.css`](../../apps/web/src/app/configurator/configure/editor-panel.module.css)'s
`.shell` is `position: static` on that shell and stands in normal flow beside the scene, so its `4`
buys it nothing there. With the rail out of the way the popover's own `6` reaches past it unaided,
and `.priceRow` goes back to `3` on **both** shells — one number instead of a per-shell fork, and the
stacking table in
[`configure.module.css`](../../apps/web/src/app/configurator/configure/configure.module.css) loses
its most-explained row.

**What it waits on, and why it was not taken on the last day of M6.** One measurement nobody could
make on 2026-09-09: that the rail overlaps *nothing else* on desktop. Its `4` is load-bearing only if
some surface needs to pass under it, and no one has enumerated those surfaces at 900–1920 px. A
change whose premise is unverified is not the one to make while closing a milestone, so the wider fix
landed and this is written down to be taken on purpose.

**The work.** Check the rail against every surface it can meet across 900–1920 px. If it meets none,
set `.shell` to `z-index: auto` in the desktop branch, return `.priceRow` to a single `3`, delete the
per-shell fork and its comment, and re-point
`qa-0104-the-stacking-table.adversarial.test.ts`'s desktop cases — the mobile ones already assert the
`3` this would restore. If it meets something, record what and close this entry: the fork is then the
right answer and the table should say so.

## 67. Tapping the overflow warning should move the camera to the marked body — WANTED BY THE OWNER 2026-09-16, NOT BUILT, NOT SCHEDULED

> **Numbered 66 when first written, on 2026-09-16, and corrected to 67 the same day at wave 7H's
> close-out.** **66 was already taken** — by *The catalogue has three full-height rows and no broom /
> utility unit* at the top of this file, ruled 2026-09-14 — and that number is cited as *"backlog 66"*
> in [ADR 0110](../decisions/0110-generation-inserts-through-the-command-path-and-the-corner-is-structural-data.md),
> [ADR 0117](../decisions/0117-generation-produces-the-cheap-correct-baseline-and-the-owners-taste-enters-through-presets.md)
> and roughly ten places in `../milestones/M7-room-and-presets.md`, so **the newer item is the one
> that moves.** The collision is recorded rather than silently fixed because 7H's own close-out and
> `../STATUS.md` were written against the wrong number first.

**Wanted, unscheduled, and deliberately unbuilt** — recorded in
[ADR 0118](../decisions/0118-a-problem-that-has-not-occurred-is-recorded-with-its-trigger-and-not-built-for.md)'s
shape, with a trigger a later reader can check.

**Where it came from.** M7 wave 7H made the camera presets a function of the customer's room. The
bodies [ADR 0065](../decisions/0065-a-body-past-the-end-of-its-wall-is-marked-not-moved.md) **marks**
are the ones past the end of a wall, and a preset that frames the middle of the room does not frame
them — measured on the narrowed-room document, **not one of the six marked bodies is on the canvas at
any pixel**, and the mark's wash reaches 333 px against the 7 875 it measured before the wave.

**The owner ruled that state accepted on 2026-09-16** (wave 7H's Q7H-8): the warning band tells the
customer their kitchen overflows, the body stays editable through the rail, and nothing is built. On
being shown the alternative they added: *"you can somewhere mark that it's great to have what you
propose on the second option."*

**The improvement.** The overflow warning band becomes a control: tapping it moves the camera to the
marked body, so a customer who is told their cabinets do not fit can see which ones without orbiting
for them.

## 69. Two gate runs against one test database corrupt its migration ledger — OBSERVED 2026-09-18, ENVIRONMENTAL, NOT SCHEDULED

**What happened, and it is recorded because a retry made it disappear.** On 2026-09-18 `pnpm ci:local`
passed in full on `0d79ce9` (wave 7D6). The push started minutes later, and its pre-push gate —
the same script, the same commit — **failed**: `LOCAL CI FAILED: test e2e`.

- **`test`:** 3 failed / 216 passed / **63 skipped** in `@lemnaria/persistence`, against 20 files /
  282 passed with no skips in the run ten minutes earlier. Every failure was one error:
  `MigrationSequenceError: Migration 4 ("0004_add_design_revision.sql") is recorded as applied, but 2
  ("0002_add_write_token_hash.sql") is not`, plus `NeonDbError: column "write_token_hash" does not
  exist`.
- **`e2e`:** `http://localhost:4320/configurator/configure is already used` — the previous run's
  server had not released the port.

**The database was healthy again when inspected**, read-only, straight afterwards: all four
migrations present with their checksums (applied_at 22:29 and 22:31) and `designs` carrying
`write_token_hash`. So the ledger was observed **mid-reset**: the live suites migrate and reset the
shared test database as part of running, and a second runner entering while the first is still
finishing sees a schema that is neither the old one nor the new one.

**Read as a defect in the arrangement, not in the wave.** Nothing in 7D6 touches persistence, and the
retry — with port 4320 free and no vitest or next process alive — passed every gate and pushed.
**The retry is not offered as evidence that the first run was wrong**: what the first run showed was
real, and it will recur for anyone who starts a second gate run before the first has fully released
its port and its database.

**Whose it is: wave 7T** owns the live persistence suites (*"the live persistence suite actually
runs"*), and this is exactly its subject — a live suite whose isolation is the runner's good manners
rather than a mechanism. **Not scheduled here, and no fix attempted.** Two things a fix would have to
decide: whether each runner gets its own database or branch, and whether the pre-push hook should
refuse to start while a port it needs is held rather than failing eight minutes later.

**Not done, deliberately:** nothing was repaired by hand. The error's own text says to resolve the gap
by hand before migrating again, and the gap had already resolved itself.

## 68. A large wood-decor run-end panel shows a visible grain tiling seam — OBSERVED 2026-09-17, OWNER QUESTION, NOT BUILT, NOT SCHEDULED

**Where it came from.** M7 wave 7D8's visual check of the panel-colour fix (`dcec03f`), a production
build at 390 × 844 and 1440 × 900, on the desktop crop for **Stejar Halifax**: on a large wood-decor
panel the grain texture shows a visible tiling seam — **horizontal at half height, vertical down the
middle**.

**Suspected mechanism, marked as an inference and not measured.** Likely the texture's repeat set to
`1, 1` on a panel-sized mesh, so one texture tile is stretched across the whole panel rather than
repeating at the plank/board scale; **not verified against the material or geometry source**.

**What is not known.** The check that found it was **not compared against a pre-`dcec03f` build**, so
whether the seam pre-dates this wave — and would therefore show on M.oak too — is unmeasured. Only
Stejar Halifax was observed; the other wood decors (Nuc Warmia, Stejar Bardolino) were checked for
colour-following in the same pass but not inspected for this seam specifically.

**Owner question, not yet asked: does it matter?** No wave is assigned and none is proposed here.

**The trigger.** The owner asks for it, **or** usage shows customers reaching the overflow state and
not resolving it. Until one of those, the band alone is the report and Q7H-8's ruling stands — a
marked body framed off screen is **not** a defect and must not be filed as one.

**What it would restore if built.** `apps/web/tests/e2e/overflow-mark.e2e.spec.ts` lost its
browser-level witness that the mark's wash is not a raycast target, because there is no marked body
on screen to tap through. The adapter's suite still holds that claim at unit level. Building this
makes the running-scene half assertable again, and the spec carries a tripwire — `MIN_MARK_PIXELS`,
kept at its measured 2 000 — that turns red the day a marked body is framed again.

## 70. The editor allows a kitchen with no oven — RECORDED 2026-09-21, NO OWNER, NO PHASE

**Owner principle** ([ADR 0110](../decisions/0110-generation-inserts-through-the-command-path-and-the-corner-is-structural-data.md)
Amendment M, M12, 2026-09-21): *"only one oven is not correct, at least one oven is correct, a
kitchen can have multiple ovens, but at least one is a must."*

**What is true in the code, source-verified at M7 wave 7D5b's planning HEAD.** Generation enforces
this through `assertExactlyOneOven` (`packages/configurator-domain/src/generation/generate-kitchen.ts:646-658`),
which is stricter than the principle — it throws unless a generated kitchen carries **exactly one**
oven, never zero and never two — and is kept deliberately, because generation always composes
exactly one oven by construction. The **editor** — `validate-design.ts`, `src/commands/` and
`src/queries/` — has **no oven-count rule of any kind**, so a customer's own edits (removing the
hob's oven and never adding a tall oven tower, for instance) can reach a kitchen with zero ovens,
which the owner's principle forbids.

**No owner, no phase yet.** Whether the editor should refuse the edit, warn, or do nothing is an
open product question for a later wave; M7 wave 7D5b records the gap and does not close it.

## 71. Re-tapping the selected *Vedere generală* chip does not reset the camera — RECORDED 2026-09-21, NO OWNER, NO PHASE

**Observed by the M7 wave 7D5b visual gate** (production build, 390 × 844, touch, 2026-09-21): after
orbiting the editor's camera, tapping the *Vedere generală* chip that is already selected leaves the
view where it was instead of returning to the overview. The gate's `*-700-overview.png` captures
stayed top-down because of it (`testing-reports/7d5b/`, gitignored). Outside wave 7D5b's scope — no
camera or chip code changed in it. Whether re-selecting the current view should reset the camera is
an open product question; nothing asserts either behaviour today.

## 72. Wide-U facing labels overlap — PRE-EXISTING, CONFIRMED 2026-09-22, NO OWNER, NO PHASE

**Confirmed on screen by M7 wave 7F2's closing visual gate** (production build, 390 × 844, touch,
2026-09-22): a wide U room (e.g. 4000 × 2400 × 2400) draws two facing wall labels that overlap and
read as one run-together string, *"B · 24002400 mm"*. Pre-existing per wave 7F2's S2 close-out note
(S2 only changed a label's side or its `topPx`, never its overlap behaviour); needs a new placement
rule for the facing-label case, not a fix inside S2's own change. Severity: medium — cosmetic on a
plan the customer reads to confirm their room, not a validation defect. No owner, no phase yet.

## 73. Language switch at Step 1B drops the room — CONFIRMED 2026-09-22, NO OWNER, NO PHASE

**Confirmed on screen during M7 wave 7F2's closing visual gate**, 2026-09-22: `locale-menu.tsx`
links to `menu.pathname` without the room's query string, so switching ro/ru at frame 1B loses the
typed room instead of carrying it to the new locale. This contradicts `use-locale-menu.ts`'s own
documented contract, which describes the query as preserved. Severity: medium — a customer who
switches language mid-entry loses typed work, silently. No owner, no phase yet.

**Added 2026-10-08, from M8 wave 8D's review round 2 (R2.1) [doc, M8 plan; ADR 0148 Amendment A].** The same links
lose the editor's two arrival parameters (`?select=`, `?settings=open`): while the editor, reached by a review
link, waits for the scene, a language switch removes the parameter with the navigation, so a pending selection is
lost for the length of the wait (about 5 s in the verifier's eleven arrivals [reviewer-run, relayed]). Nobody has seen it in a browser; the reviewer read it
from source (`configure/locale-menu.tsx:139`) and QA could not send a switch in the wait. The menu is drawn on
**three screens**: the room entry, the editor and the review (`room-screen.tsx:149`, `configure-screen.tsx:178`,
`review-screen.tsx:105`). **One fix serves both**, and it belongs with this entry, which loses work.
*What must hold when it is fixed:* the switch still *"changes the language and not the place"*
(`i18n/use-locale-menu.ts:31`), so the path is the same page's; the review, which has no query of its own, gains
none; and a parameter the arrival hook has already removed does not come back through the link. That hook's
comment also calls `/d/{id}` *"the only route that renders this menu"*, which three call sites contradict; it is
corrected with the fix. **Owner:** whoever takes this entry.

## 74. An open help popover covers the field above it — FOUND 2026-09-22, LOW, NO OWNER, NO PHASE

**Found during M7 wave 7F2's S5b × 7A3 interaction**, 2026-09-22, visual gate: `.lengthHelpText`
opens upward and covers wall A's new unreadable-input sentence (ADR 0126) while both are on screen;
the sentence becomes visible again once the popover is dismissed. New in this wave's combination of
S5b's field reason and 7A3's per-wall help button — neither alone reaches the case. Severity: low.
No owner, no phase yet.

## 75. A second field problem is not re-announced while the note already shows — NEEDS COPY, RECORDED 2026-09-22

**Raised by M7 wave 7F2's S3 logic review, R1.6**, and routed here per the wave's close-out
(2026-09-22): if a second field becomes invalid while 1C's room-level note is already showing for a
first, the note does not re-announce — a screen-reader customer is not told a second thing is now
wrong. Needs new copy (a plural or "also" form) before it can be built; not scheduled. No owner, no
phase yet.

## 76. `DRAWABLE_WALLS` has no exhaustiveness tie to `requiredFieldsFor` — RECORDED 2026-09-22

**Raised by M7 wave 7F2's S5 logic review, R1.4**, 2026-09-22: `DRAWABLE_WALLS` (which walls a
shape draws) and `requiredFieldsFor` (which fields a shape requires) are two independent
enumerations over the same underlying fact — which walls a room shape has — with nothing that fails
to compile if a new shape is added to one and not the other. The domain is the natural owner of
"which walls a shape has"; today it is duplicated in `apps/web/src/room`. No owner, no phase yet.

## 77. Press completion assumes `click` fires in the same task as `mouseup` — RECORDED 2026-09-22

**Recorded in `src/lib/use-after-press.ts`'s own header comment**, surfaced by M7 wave 7F2's S5b
close-out, 2026-09-22: the press-completion logic assumes a synthesised `click` event fires in the
same task as the `mouseup` that produced it. Verified true in Chromium (the visual gate's engine);
**not verified in WebKit**, which this project's visual gates do not currently cover. No owner, no
phase yet — a WebKit-specific check is owed before this can be closed either way.

## 78. Mid-typing slivers under mm entry — CAPTURED, NOT JUDGED, OWNER QUESTION, 2026-09-22

**Captured by M7 wave 7F2's closing visual gate** (production build, 390 × 844, touch, 2026-09-22),
under ADR 0126's millimetre entry: a wall mid-typing (e.g. `3`, `36` on the way to `3600`) draws as
a red sliver on the plan, labelled *"A prea scurt"*, for the length of the 400 ms typing pause. This
is the S5 slice's own recorded note (*"36 mm beside 2400"*) now visible in a production build, not a
new defect — it is deliberate under C-7F2-1's single-clock ruling. Recorded as an owner question:
whether this reads acceptably to a first-time customer has not been asked. No owner, no phase yet.

## 79. 16 rows leaked in the test database, pre-S1 configure-route specs — FOUND 2026-09-23, LEAK CLOSED, ROWS NOT DELETED

**Found by M7 wave 7E4's adversarial QA, 2026-09-23.** 16 design rows in the test database were
minted and never deleted, created 2026-09-22 in four batches of four, at roughly 09:33Z, 11:07Z,
19:48Z and 20:32Z. The cause: configure-route e2e specs that predate wave 7E4's S1 minted a design
through the store's own client but never registered it for teardown deletion — the pattern S1
replaced with `mintSeededDesign`'s guaranteed cleanup.

**The leak is closed going forward, not retroactively.** A full e2e run after wave 7E4's S3
(`d00212a`) left 0 leaked rows; every remaining spec that mints now deletes what it minted, including
on a failing test (criterion 4's teardown proof). **The 16 existing rows are untouched** — under
ADR 0006 (environments and provisioned resources are add-only), no agent deletes a database row on
its own judgment; that is the owner's call. No owner, no phase yet.

**Another leftover row, 2026-10-07:** `su3IuyF9TqeLXtm6AegGl`, from M8 wave 8A S1's measurement; see backlog
100, where it is recorded with the other leftover rows.

## 80. The store's mint-on-first-command branch has no reaching route since 7E3a — FOUND 2026-09-23, NOT RETIRED

**Found by M7 wave 7E3a's review, 2026-09-23** (finding L1.3). Since 7E3a moved Step 1's
`/[locale]/configurator/configure` and `/[locale]` to route handlers and every remaining editor entry
opens `/{locale}/d/{id}`, the store's `designId: null` / `canWrite: true` mint-on-first-command
branch — ADR 0010's path, still witnessed by `client-write-path.test.ts` — is no longer reachable
from any production route. The mechanism stays in code; the plan's own ground truth (G5) already
observed this route was the *only* one that could reach it. **Not retired in 7E3a**, because
retiring ADR 0010's write path is its own dated decision, not a residue of the wave that removed the
last caller. Trigger: whenever ADR 0010's write path is next revisited, or before M8 closes. No
owner, no phase yet.

## 82. `/{l}/s/{t}/` (a share link with a trailing slash) gets Next's own headerless 308 before the proxy runs — FOUND 2026-09-23

**Found by M7 wave 7E3c's close-out, coordinator ruling (b).** Criterion 8 expects every malformed or
mis-shaped share path to carry criterion 7's headers (`no-referrer`, `noindex, nofollow`, `private,
no-store`). A trailing-slash variant of a share link is instead answered by Next's own built-in
redirect, which runs **before** the proxy and therefore carries none of them. Accepted by the
coordinator and upheld by the security reviewer as out of this wave's scope — it is a general Next.js
routing behaviour, not specific to the share surface. No owner, no phase yet.

## 83. A client-side transition between two hydrated designs logs a dev-only React warning — FOUND 2026-09-23

**Found by M7 wave 7E3c's close-out, coordinator ruling (c).** *"Cannot update a component while
rendering a different component"* fires in `next dev` on a client-side transition between two
hydrated designs (e.g. share view to share view, or share view to the owner's `/d/{id}`). Reproduced
as pre-existing in `HydrateAndConfigure`'s render-time hydrate pattern, which 7E3c's
`SharedDesignView` reuses rather than introduces. Not observed on `next start` (visual pass). No
owner, no phase yet.

## 84. SEC-7E3c.5 — the platform's own error logger may print a Postgres `detail` carrying a token hash on a share-token primary-key collision — FOUND 2026-09-23

**Found by M7 wave 7E3c's security review, 2026-09-23.** A primary-key collision on
`design_share_links.token_hash` (astronomically unlikely, given rejection-sampled 12-character base62
tokens) would surface a Postgres constraint-violation error whose `detail` field can include the
colliding key value. This project's own log lines are clean — `reportDesignFailure("share-issue", …)`
logs no token or hash — but the platform's own unhandled-error logger sits outside this project's
control and may print the raw driver error, including that `detail`, if the error is ever rethrown
uncaught. Not fixed here: no code path in this wave rethrows uncaught to that logger. No owner, no
phase yet.

## 85. Criterion 9's share-view leak scan did not exercise a camera preset — FOUND 2026-09-23

**Found by M7 wave 7E3c's review, finding L1.5.** Criterion 9 requires zero `/api/` requests from the
share view "during load and after every enabled control (camera presets, a selection tap, a locale
switch)". QA's scan covered a selection tap and a locale switch but not a camera-preset tap. No
production defect is suspected — camera presets are a client-only 3D-adapter concern with no
persistence call in their path — but the criterion as written is not fully discharged. No owner, no
phase yet.

## 86. Optional hardening: grant `UPDATE (revoked_at)` on `design_share_links` instead of table-wide `UPDATE` — FOUND 2026-09-23

**Found by M7 wave 7E3c's security review, SEC-7E3c.3.** D9 grants `app_designs` `SELECT, INSERT,
UPDATE` on `design_share_links`, table-wide. Revocation only ever needs to write `revoked_at`; a
column-scoped `GRANT UPDATE (revoked_at) ON design_share_links TO app_designs` would narrow the blast
radius of an application-layer bug or injection to that one column, at the cost of a second grant
statement to maintain. Reported to security and recorded as optional hardening, not required for this
wave's threat model. No owner, no phase yet.

## 87. Visual J6 — a share section on a never-saved design is unreachable via the UI and is covered only by a DOM test — FOUND 2026-09-23

**Found by M7 wave 7E3c's visual pass, journey J6 (PARTIAL).** ADR 0002 decision 17 gates the share
control on `hasPersistedSuccessfully`, so a never-saved design should show no share section. The
non-owner `/d/{id}` half of J6 was verified visually; the never-saved-design half could not be reached
through the UI in the visual pass's session (every reachable design had already persisted) and is
covered only by the component-level DOM test that asserts the gate directly. No owner, no phase yet.

## 88. SEC-7E3b.1 — an attacker's rows planted under a fixated value move into the victim's identity on rotation, and can surface as the victim's newest design — FOUND 2026-09-23, OWNER TO DECIDE

**Found by M7 wave 7E3b's security review** (R4 in the plan; SEC-7E3b.1 at the
[7E3b close-out](../milestones/M7-room-and-presets.md#7e3b-close-out--2026-09-23)). Rotation (ADR 0114
H1/H6) moves **every** row under a carried value `P` into the mint's new identity, including rows an
attacker created while `P` was planted in the victim's browser. Resume lands on the most recently
updated design, so the attacker's planted design can surface ahead of the victim's own on the next
resume. Same precondition as backlog 81's, now closed (a same-host script, or physical access to the
browser). **Owner to decide:** record acceptance, or have resume prefer rows the browser itself
minted over rows moved in by a rotation. No owner yet; no phase.

## 89. R2.2 / SEC-7E3b.2 — the create-design lock covers only the mint `POST`; a save that commits before a rotation, answered after it, reverts the jar to a value owning nothing — FOUND 2026-09-23, TELL THE OWNER

**Found independently by two reviewers of M7 wave 7E3b**, converging on the same race: the logic
reviewer's R2.2 (inference) and security's SEC-7E3b.2. ADR 0114 Amendment H6's Web Lock
(`lemnaria:create-design`) serialises only the mint request, so tab A's first save can run
concurrently with tab B's rotating mint. If A's save's `UPDATE` commits before B's rotation, but A's
response reaches the browser after B's `Set-Cookie`, the jar ends holding B's new value — which owns
none of A's rows. ~~Plausibly rare (the shipped e2e criterion S6-1 is green regardless);~~ **(Contradicted by a
measurement, 2026-10-09: see below.)** Widening the
lock to cover saves would contradict the plan's decision D2 (nothing but the mint rotates).
**Recorded to tell the owner**, per the close-out; not fixed here. No owner yet; no phase.

**Measured 2026-10-09 [QA-run by the agent `m8-e2e-triage` at `af55c16`, relayed; traces in the session scratchpad].** The sentence
struck above is contradicted: the mobile two-tab spec (`qa-7e3b-s6-two-tab-convergence.adversarial.e2e.spec.ts`) failed **12 of 100
rounds under eight workers** and **1 of 10 in a whole `CI=1` run**; alone 0 of 100, one worker 0 of 40 (250 rounds, 13 failed in all;
backlog 125's triage has the method). *The network order, the same in 13 of 13 failing traces:* a prior POST sets visitor value V0;
tab A's POST (sent V0) sets V1; tab B's POST (sent V1, so the lock worked) sets V2 and moves the rows; tab A's hand-off PUT (sent V1)
answers 200 with `Set-Cookie` V1; tab B's PUT is sent with V1; a GET of the prior design with V1 answers 404. [src, the agent's
reading] `fetch-configuration-repository.ts:193-199`: the lock wraps the POST only; `app/api/designs/[id]/route.ts:151` refreshes the
visitor cookie when the save owns the visitor, true because A's update committed before B's rotation. *Customer effect [the agent's
statement]:* after tapping Continuă in two tabs within one request's latency, the browser holds a visitor value that owns nothing;
every design of that browser, earlier ones included, answers "not available in this browser"; V2 is stored nowhere, so it is not
recoverable. An ordinary autosave in one tab overlapping a mint in another is the same window [inferred, not run]. *Two fixes the agent
proposes, both the owner's decision because this entry says widening the lock contradicts plan decision D2:* (1) take the
`lemnaria:create-design` lock in shared mode around every save and keep the mint exclusive, so no save is in flight across a rotation;
or (2) hold the lock across the hand-off PUT, which closes only the create path. *Not established:* that it fires on a CI runner (it
needed parallel load here: 0 of 140 rounds at one worker, and CI runs one worker on a two-core runner). **Owner:** the owner decides.

**Updated 2026-10-09, after wave 8F: this is now Q35, recorded and not decided.** The plan's three options: **(a)** every save takes the lock
shared and the mint takes it alone; **(b)** the lock is held across the first save (the create path only); **(c), the architect's
recommendation** [inf, unmeasured]: a save never sets the visitor cookie, only a mint does (closes it on the server for every browser; the
cookie's thirty days then run from the last design created unless the lifetime is lengthened; the security reader's view: the only one the
server enforces for every browser; browsers cap a lifetime near 400 days [recalled]). **A second measurement, with the limiter in place:** 0 of
100 rounds [QA-run, one sample], against the triage's 12 of 100 before it; **0 of 100 is not a fix.** Until decided the two-tab spec stays unskipped, and 8T's gate
cannot be ticked unless the owner accepts the residual. [ADR 0155](../decisions/0155-the-mint-asks-a-keyed-per-day-per-network-limiter-first-and-refuses-what-it-cannot-judge-the-owner-names-the-network-source-and-a-destructive-mutant-never-touches-a-database.md), *Q35*.

## 90. SEC-7E3b.3 — the rotation `UPDATE` has no rate limit — FOUND 2026-09-23, DEFERRED TO M8

**Found by M7 wave 7E3b's security review** (SEC-7E3b.3 at the
[7E3b close-out](../milestones/M7-room-and-presets.md#7e3b-close-out--2026-09-23)). Every mint issues
one `UPDATE designs SET visitor_hash = …` unconditionally; nothing bounds how often one caller can
trigger it. ADR 0114 decision 7 already names M8's limiter and WAF scope as the control for mint
abuse generally; this is that same gap, named for the rotation write specifically rather than built
here. No owner yet; phase is M8.

**Closed 2026-10-09 by wave 8F:** a rotation happens only in a mint the limiter passed ([ADR 0155](../decisions/0155-the-mint-asks-a-keyed-per-day-per-network-limiter-first-and-refuses-what-it-cannot-judge-the-owner-names-the-network-source-and-a-destructive-mutant-never-touches-a-database.md), decision 6; the plan's *8F, the records*).

## 92. SEC-U1.1 — the largest storable design row grows to 523,972 bytes — FOUND 2026-09-29, DEFERRED TO M8's LAUNCH GATE

**Found by M7B wave U1's security review** (S1.1, Low; `docs/milestones/done/M7B-u-shaped-rooms.md`, *U1
close-out*). Wave U1's storage-bounds slice (S2, `7e3b99d`) re-derives `MAX_DESIGN_BYTES` from
186→279 placements and 1262→1893 empty columns for the third wall run: 349,656 → 523,972 bytes, a
1.5× growth over the two-wall figure. This grows the accepted risk
[ADR 0019](../decisions/0019-security-baseline-writes-throttling-retention.md)'s SEC-001/DB-002
section already carries for the write route's per-row body cap. **M8's launch gate should re-measure
the backup's per-row budget at 523,972 bytes** before it is treated as settled. No owner yet; phase
is M8.

## 93. SEC-U1.2 — no per-shape empty-column count check bounds an L/straight document — FOUND 2026-09-29, OPTIONAL, NOT SCHEDULED

**Found by M7B wave U1's security review** (S1.2, Low; `docs/milestones/done/M7B-u-shaped-rooms.md`, *U1
close-out*). After U1, an L or straight document may carry up to 1893 empty columns and marked
wall-C entries even though it has no wall C — `MAX_EMPTY_COLUMNS` is a global cap, not a per-shape
one. An optional per-shape count check (walls × 631) would tighten this; it is recorded, not built.
No owner, no phase.

## 94. AC6's mirror-equivariance property ran on arbitrary U documents, not generated U kitchens — FOUND 2026-09-29, CLOSED 2026-09-29 (M7B wave U2)

**Found by M7B wave U1's logic review** (R1.3; `docs/milestones/done/M7B-u-shaped-rooms.md`, U1 acceptance
criterion 6 and *U1 close-out*). The property (1000 runs, `mirrorUDesign` reviewed, sabotage both ways
confirmed) exercised arbitrary U documents and a restated fixture rather than designs
`generateKitchen` actually produces for a U shell. This is not a defect in what shipped — U1 has no
generator arm for a U yet — but the property should be re-run against real generated U shells once
one exists. **Owed to wave U2's acceptance criterion A2**, not open-ended.

**CLOSED 2026-09-29 — discharged by M7B wave U2.** AC6's mirror property now runs on real
`buildUShellDesign` outputs through `mirrorUDesign`, 200 samples plus about 80 boundary rooms, zero
findings, voids mirroring as predicted (`docs/milestones/done/M7B-u-shaped-rooms.md`, *U2 close-out*). No
further action owed.

## 95. The A∩C corner sweep also marks a stray wall-C span on an L or straight document — FOUND 2026-09-29, OPTIONAL, NOT SCHEDULED

**Found by M7B wave U1's logic review** (R1.4, a disagreement rather than a bug;
`docs/milestones/done/M7B-u-shaped-rooms.md`, U1 acceptance criterion 7 and *U1 close-out*). The A∩C
corner-overlap sweep (`findCornerOverlaps`) runs unconditionally, so it also fires on an L or straight
document that happens to carry a stray wall-C span, producing an extra mark-severity finding there.
Acceptance criterion 2 (old documents load with identical findings) is not at risk, because no
generated L or straight document carries a wall-C span. Gating the sweep on `wallsOf(shape)` so it
skips wall C entirely for a shape that lacks it is optional and was left undone. No owner, no phase.

## 96. The engine's minimum-kitchen figures omit the 100 mm reserve, so they cannot be switched on as a gate — FOUND 2026-09-30, LATENT, U6 BRINGS THE APPROVED FIGURE

**Found by M7B wave U3b's close-out** (`docs/milestones/done/M7B-u-shaped-rooms.md`, *U3b close-out*). The
engine's minimum-kitchen figures, L and U alike (`wallMinimumMm` 880), exclude the 100 mm reserve, so
they cannot be turned on as a gate without adding it. With the gate forced on, 2,160 of 36,506 sampled U
rooms (sides 1480–1599, for example 2400/6000/1599) pass the gate while the generator refuses them.
**Latent:** the engine gate is `isRequired: false`, and U6 brings the approved 1000. No owner until U6.

## 97. Generation below the approved ceiling floor (2200) throws for every shape — FOUND 2026-09-30, UNREACHABLE UNDER APPROVED HEIGHTS

**Found by M7B wave U3b's close-out** (same source). `generateKitchen` throws below the approved
ceiling floor of 2200 for every shape. A U throws already at 1900–2199 because of RQ7's mandatory hood
("a U's hob has no hood over it"), where the L succeeds at 2000. Not reachable under approved heights.
No owner, no phase.

## 98. A reload shows the seeded L (3 chips) before the loaded design — FOUND 2026-09-30, PRE-EXISTING, NOT A U6 BLOCKER

**Found by M7B wave U5's QA and review** (`docs/milestones/done/M7B-u-shaped-rooms.md`, *U5 close-out*).
Zustand 5.0.15's `useStore` server snapshot is `getInitialState()`, so server rendering and the
hydration render show the seeded L (3 chips) before the loaded design. It affects every `/d/{id}` and
`/s/{token}` load for every non-L design, and lasted about 130 ms in dev. Pre-existing since zustand 5,
not a U6 blocker. It sits beside backlog 83, in the same component (`HydrateAndConfigure`); the code
comment in `hydrate-and-configure.tsx` points here.

**Side risk, for a security reviewer.** On the server, `hydrate` writes each request's design into the
process-wide singleton store. Nothing server-rendered reads `getState()` today, so it is a latent
cross-request leak: it becomes a real one the day something server-rendered does. No owner, no phase.

## 99. Plan-preview label fit has known limits — FOUND 2026-09-30, RECORDED IN TEST COMMENTS, NOT FIXED

**Found by M7B wave U5's review** (`212b49a` guarded label width with a glyph-advance table,
`PLAN_LABEL_REASON_MAX_EM = 11.7`, and added a "beneath" arrangement; these cases remain):
- two walls both over 6000 draw a sliver with no room beneath, so a 148 px ru reason cannot fit a 190 px
  box;
- an unmarked pair at a 283 px box with one deep wall is cramped;
- mixed marked and unmarked pairs at mid lengths can overflow at the phone.

All of these need a copy or layout decision (a wrapped or shorter reason), not a code fix. No owner, no
phase.

## 100. Six orphan design rows in the test database — FOUND 2026-09-30, OWNER DECIDES

**Found by M7B wave U5's visual review.** It left 6 orphan design rows in the test database,
`TEST_DATABASE_URL` (`lemn-conf-v2-staging`). Their ids were lost because run cleanup had no
`DATABASE_URL` in the worker environment. **They were not deleted**, per the add-only rule
(`docs/best-practices/environments-and-resources.md`); the owner decides whether to remove them.

**Answered 2026-09-30 (Q-U7-2, relayed selection, not verbatim): "Leave them (Recommended)."** The six
rows stay; nothing removes them. The architect recorded the answer in the milestone
(`docs/milestones/done/M7B-u-shaped-rooms.md`, *U7 — the plan*, Q-U7-2) but not here.

**Another leftover row, 2026-10-07.** M8 wave 8A S1's measurement left one row, `su3IuyF9TqeLXtm6AegGl`, in
the test database, undeleted as its brief required (add-only); it is recorded in the M8 plan's *8A figures*.
It belongs with these rows and with backlog 79's; the same owner decision covers it, and no answer to
Q-U7-2 extends to it.

**Five more, 2026-10-08, from M8 wave 8D's visual verifier [reviewer-run, relayed].** The verifier created five
designs through the app and left them in the test database, undeleted (add-only): `dnWHjvrO-7480l3hh3u2c`,
`FzHpljg1AMT0zJWGuc13z`, `fRvYfjiUgKIbHIHnts9Yj`, `W2eQRlJLDYlzek4SaX0Fv` and `y_9k4CnmX1Mo9h7wXnRDS`. They belong
with the rows above and with backlog 79's; no earlier answer extends to them.

## 101. The shape-refusal region is kept on purpose, though no shipped path draws it — RECORDED 2026-09-30, NO OWNER

**Recorded at M7B wave U6's close-out.** `room-shape-refusal` and `room.issue.shapeNotBuildable` stay:
ADR 0116 reads buildability from policy data, so a policy that stops stating a shape refuses it again.
**If any future policy stops stating a shape, the e2e tests removed in U6 must come back:** census E3, E4's
U half, E5 and E9 (the region's colours, its gap, and its clipping;
`docs/milestones/done/M7B-u-shaped-rooms.md`, *U6 S0 census*). No owner, no phase.

## 102. Dev-only security candidates from the undici review — FOUND 2026-09-30, NOT SCHEDULED

**Found by the review that produced the `undici` override** (commits `565dd54` / `52c0a94`). All three are
development tooling; none is in the shipped runtime.
- **js-yaml 4.3.1** (high, via eslint → @eslint/eslintrc): a lockfile refresh fixes it.
- **vitest / @vitest/mocker 3.2.6** (moderate): needs a major upgrade to ≥ 4.1.11, its own wave.
- **Node's bundled undici:** local Node 24.19.0 has 7.29.0, inside the advisories' 7.x range. It needs a
  Node patch release, not the lockfile.

No owner, no phase.

## 103. Editing the room's size keeps none of the customer's changes — WANTED BY THE OWNER 2026-10-01, NOT BUILT, NO PHASE

The owner, verbatim (M7C Q1): *"what if I done a lot of changes but I need only to edit the size, going
back will wipe out all my changes, looks like I need the ability to edit room size withgout loosing
current work. I know this can change a lot, especially when will be reduced the size, there should be
decission what to drop from cabinets."* **Today:** continuing from Step 1 generates a new design; no edit
is carried over; the old design stays stored (ADR 0111 d5) and opens only from its own link until M8
(ADR 0114 d4). M7C C1 S3's confirmation is the owner's stated minimum, not this entry. **Cost:** a room
change applied to a stored design, not a regeneration. Growing a wall adds empty space; shrinking one
needs an undecided rule for what is dropped or narrowed. A domain milestone of its own, with owner
questions first.

## 104. A cabinet cannot be resized through a fixed-width neighbour — ASKED BY THE OWNER 2026-10-01, NOT BUILT, NO PHASE

The owner asked on 2026-10-01 (M7-FB-010) how hard it is to widen a cabinet without removing the fridge
beside it, and on M7C Q6 sent this half to the backlog; the generator half is M7C wave C5. A resize is
funded by adjacent empty space only (ADR 0031); moving the fridge inside the command is §13.2's rejected
auto-shift. **Cost:** a new funding arm in `plan-width-funding.ts`, column moves, the frozen map and every
body stacked over the neighbour; one Full-tier domain wave.

## 105. Step 1's desktop footer departs from the mockup frames in three places — FOUND 2026-10-01 BY C1 S1's REVIEW, NOT FIXED, NO OWNER

**Found by the review of M7C wave C1 S1 (`8269440`), which centred the footer controls and left these
alone [relayed from that review].** (1) *"Înapoi"* ships as a 96 × 52 bordered button where frames
D1B, D1C and D1F draw bare text. (2) The disabled *"Continuă"* lacks the frames' 1 px border. (3) On 1F,
`.composeCta` keeps `flex: 1` (`apps/web/src/room/room.module.css:1054-1056`, read 2026-10-01), so the
call to action spans the footer where frame D1F draws it content-width at the right. The mockups are the
chrome specification (ADR 0104); each of the three is a departure from them with no recorded ruling. No
owner, no phase.

## 106. The e2e desktop shard 2/3 sits at exactly its 70-test budget — FOUND 2026-10-01 BY C1 S1's QA, NOT SCHEDULED

**Found when C1 S1's QA spec was added [relayed].** `docs/best-practices/ci-and-local-gates.md`,
*The per-shard test budget* (`:453-466`), names 70 tests as the largest shard and the ratchet; the guard
is `pnpm gate:e2e-shard-budget`. The next desktop e2e spec lands the shard over the budget unless the
shards are rebalanced or a fourth is added. M7C waves C1 S3 and C2 to C4 each add or restate e2e specs.
Not measured by the scribe. No owner, no phase.

**Update 2026-10-08, M8 wave 8D [QA-run, relayed].** At `9f4c123` the desktop shards stand at 69 / 70 / 62 of 70,
so the middle shard is still exactly at the ceiling; the mobile project went to six shards in `c62feb1` (83 / 79 /
81 / 83 / 95 / 63 of 125).

## 107. A design stored before ADR 0135 keeps the old corner geometry — ACCEPTED PRE-RELEASE, 2026-10-01, READ-SIDE FIX NOT BUILT

[ADR 0135](../decisions/0135-the-corner-pieces-stand-on-the-runs-lines-and-the-base-return-is-a-base-body-with-a-fixed-front.md),
*Consequences*, holds the measurement and the reasoning; it is not repeated here. In short: a design
stored before C4 S2 (`48bbc0c`) shows a permanent 10 mm slit in the carcass and the worktop stone at the
corner, and one depth-changed before C4 S1 (`c4eeea6`) stands 5 mm off the wall. A load-time re-derivation
of the structural return's width would amend ADR 0089 and count as a migration under ADR 0038 decision 1.
The owner was told. No owner, no phase.

## 108. `wallCabinet`'s two-door leaves are 3 mm apart where the kit's `GAP` is 4 mm — FOUND 2026-10-01 BY C2 S1's REVIEW, PRE-EXISTING, NOT CHANGED

**Found by the review of M7C wave C2 slice S1 (`075529b`) [relayed].** In `wallCabinet`, a two-door body
sizes each leaf `dw = (W - 0.009) / 2` (`packages/three-adapter/src/kitchen-parts.ts:1752`, read
2026-10-01), which leaves 3 mm between the two leaves, where the kit's `GAP` is 0.004
(`kitchen-parts.ts:838`). Nothing was changed, because every parity pin of an ordinary wall cabinet would
move. No owner, no phase.

## 109. The corner wall unit's names and prices are placeholders — AWAITING THE OWNER, BUILT WITH DEFAULTS 2026-10-01

M7C plan Q8 (i) and (ii). The unit (`wall-corner-x-900` and `-top`) reuses the side corner pieces' names
(*Dulap suspendat de colț*, *Dulap de colț rând de sus*, ADR 0066) and their placeholder prices, 160 000
and 90 000 in the book's units, each plus the leaf's hardware line
([ADR 0110 Amendment O](../decisions/0110-generation-inserts-through-the-command-path-and-the-corner-is-structural-data.md#amendment-o--2026-10-01-a-fixed-corner-wall-unit-stands-over-every-generated-corner-the-top-row-the-validators-banded-reach-and-the-fridge-gap-absorb),
O7). Both are marked *pending owner input*. The owner has not answered. Non-blocking; no phase.

## 110. A wall door beside a hood or fridge at the corner unit's far edge cannot open past about 90° — RECORDED 2026-10-01, A MANUFACTURING NOTE, NOT A DEFECT

Beside a body standing proud at the unit's far edge (x 900), a hood (291–321 mm proud) or a fridge
(317–387 mm), the unit's leaf cannot open past about 90° [doc-quoted: M7C plan, C2 S2, *At the far edge*].
The kit draws no hinge, so this is true of any wall door beside such a body, and a real cranked hinge
moves the door clear. C2 S2 carries a note and no criterion, since a criterion would test the model's
pivot. No generation rule: a hood stands at 900 only over a hob. No owner, no phase.

## 111. On the 900 px desktop card the back confirmation's text is left-aligned and its buttons are centred — FOUND 2026-10-02 BY C1 S3's QA, OWNER ASKED FOR THE BUTTONS ONLY

**Found by QA of M7C wave C1 slice S3 (`01c40be`) [relayed].** The owner asked, verbatim, *"also the
buttons center to modal"*, and the buttons were centred. The heading and body stay left-aligned. In
Russian, with a two-line body, the buttons sit visibly off the text's axis: the text starts at x 297 and the
buttons are around x 720 at 1440 px [relayed, QA]. Not changed, because the owner asked for the buttons
only. A one-line decision for the owner if it reads wrong. No owner, no phase.

## 112. The settings confirmation's alignment has no unit-level guard — FOUND 2026-10-02 BY C1 S3's QA, NOT SCHEDULED

**Found by QA of C1 S3 [relayed].** The back confirmation centres its buttons and the settings
(material-change) confirmation keeps `justify-content: space-between`; the difference is a property of the
asker. Adding the centred class to the settings call site leaves the unit suite green. Only QA's browser
specs catch it, `top-bar-back.qa-m7c-c1-s3.adversarial.desktop.e2e.spec.ts` and its mobile counterpart
(the file names are the coordinator's; not re-read by the scribe). No owner, no phase.

## 113. The shared confirmation component lives under `apps/web/src/settings/` though `configure/` now uses it — RECORDED 2026-10-02, MOVE WHEN A THIRD ASKER APPEARS

**Recorded at the close of C1 S3 [relayed].** The component and its styles
(`global-settings.module.css`) stay under `apps/web/src/settings/`, although the editor's back links, in
`configure/`, now use it as well as the settings strip. The extraction was for reuse and not a move
(M7C plan, C1 S3). **Trigger:** a third asker. Then move it to a shared location. No owner, no phase.

## 114. Two e2e helpers break on the generated top row — FOUND 2026-10-02 BY C3 S1's QA — CLOSED 2026-10-06, FIXED IN `fecd430` (CE S1)

**Read by QA, not run [relayed].** (1) `apps/web/tests/e2e/support/qa-u5-cutaway.ts:101, :145, :233`: wall
B's top-row openings in the U 3000 fixture drop from three to one, and the taps aim at the wall's middle and
expect a void. (2) `apps/web/tests/e2e/support/u-gate-journeys.ts:498-503, :520-531`: `toEqual([hood])` now
gets the hood and a wall cabinet, and `find` returns the generated top over the hood. Both follow from
`02b1c7b` and are owed to M7C wave CE, which restates what earlier waves moved. Not re-read by the scribe.

## 115. The 2600 mm top-row line is derived in two places — RECORDED 2026-10-02 BY C3 S1, PINNED, NOT SCHEDULED

The line is `TOP_ROW_Y0_MM + HEIGHT_FLEX_MIN_OPENING_MM` in `upper-policy.ts` and `y0 + height ≤ room
height` for the corner top unit in `shell-design.ts` [relayed]. They agree while that constant equals the
unit's 400. QA's test *"agrees with the corner's own top units at every height"* pins that both switch at
the same millimetre. If either figure moves, the pin goes red first. No owner, no phase.

## 116. A refused top-row insert becomes a `not_placed` step with no customer-visible reason — RECORDED 2026-10-02 BY C3 S1, NOT OBSERVED

Generation continues past a refused top insert, as it does for the wall row. None occurs in the census, and
a property test now fails if one appears [relayed]. If it ever does, the customer sees a kitchen with no
top cabinet over that body and no explanation. No owner, no phase.

## 117. The remote test database drops connections intermittently (first seen as a 500 on `POST /api/designs/{id}/share`) — FOUND 2026-10-06 BY THE PRE-PUSH GATE, UNEXPLAINED

**Widened 2026-10-06 [coordinator-run].** Five pre-push gate runs that day failed in turn on: (1) the
share 500 below; (2) criterion 8's paint bound (fixed in `d015738`, ADR 0139 decision 11); (3) SCA, a new
advisory (fixed in `8d357a2`); (4) `packages/persistence/tests/qa-7t-s2b-lock.adversarial.test.ts`, "the
named timeout > carries SQLSTATE 55P03 …", `Error: Connection terminated unexpectedly`, which passed 45/45
five times alone right after; (5) all green. **Items (1) and (4) are the same family [inference]: the
remote test database (Neon, `TEST_DATABASE_URL`) dropping a connection.** No M7C change touches
persistence or the share route. **Cost:** each blocked gate run is about 15 minutes.

**First observed [coordinator-run].** The first pre-push gate run on 2026-10-06 failed
`linear-flow.e2e.spec.ts:22` (mobile) because the share POST answered 500. The server log shows
`⨯ SyntaxError: Unexpected end of JSON input at JSON.parse` for that page, and **no `reportDesignFailure`
log line before it**, which the route's catch would emit. Unexplained. It passed 5 of 5 run alone
afterwards. No M7C change touches the share route or persistence. **Inference, not verified:** an empty
response from the remote test database's HTTP driver. **Also noted:** the pre-push gate runs Playwright
with 8 workers against one dev server while the runner uses 1, so the gate sees more load than the
runner; the second gate run failed on criterion 8 (8 > 7) before CE S3a (ADR 0139 decision 11). No owner,
no phase; re-open if it recurs on the runner.

**Status after CE S4 (`556abb3`, 2026-10-06): stays open.** An empty reply is now retried (ADR 0145). A
mid-reply drop and `Connection terminated unexpectedly` are not (owner ruling). The share 500's source is
still not established: the route's catch would have logged a repository error and none was seen.

## 118. Dev-scope advisories in the lockfile — FOUND 2026-10-06 BY THE SECURITY REVIEW, NOT SCHEDULED

**Source [reviewer-run `pnpm audit --json`, 2026-10-06].** CI's `pnpm audit --audit-level=high --dev` is
non-blocking (`ci.yml:747-749`). Backlog 102 already holds js-yaml and vitest; this entry adds the
rest and does not replace it.

- **2 critical.** tinypool 1.1.1 via vitest 3.2.6: GHSA-5gmw-xhrv-c9v3 (fixed from 2.1.1) and
  GHSA-85c8-ppgw-ccpr (from 2.1.2).
- **6 high.** js-yaml 4.3.1 via eslint: GHSA-2883-xcg3-v3hh (from 4.3.2). brace-expansion 1.1.18 and 2.1.4
  via eslint and typescript-eslint's minimatch: GHSA-qhr7-859c-m2p7, GHSA-6j4f-fj2g-mc7p. braces 3.0.3 via
  typescript-eslint > fast-glob > micromatch: GHSA-vfj7-8cjw-p6xm, **no patched version**.
- **4 moderate.** vitest and @vitest/mocker 3.2.6: GHSA-82fw-gwwq-j7x9 (from 4.1.11); brace-expansion:
  GHSA-q2hr-2g5m-vwhr.
- **Exposure.** None runs behind a network listener (no vitest browser, ui or api server); the attacker
  must already control repo code or config. The reviewer also noted, **unverified**, that `next dev` binds
  0.0.0.0 by default, so a dev server is LAN-reachable.
- **Likely routes [inference].** A vitest 4.1.11 or later upgrade probably clears tinypool; a lockfile
  refresh or overrides for brace-expansion and js-yaml; braces only by dropping the dependency path.
  No owner, no phase.

## 119. A client transition probes write access for the design being left — FOUND 2026-10-06 BY CE S2, HARMLESS

**Source [implementer-run, trace-verified].** After a transition from design B to design A, A's
`store.hydrate` sets `canWrite: "checking"`, and the still-mounted B tree's effect
(`hydrate-and-configure.tsx:82`, deps `[designId, canWrite]`) fires one probe for B. It is harmless:
`applyWriteAccess` drops the answer (`configurator-store.ts:613`). The cost is one wasted request. A fix is
production code (Full tier). The owner's call; no owner, no phase.

## 120. The first WebGL frame can hold "Se verifică accesul" for seconds on a slow device — FOUND 2026-10-06 BY CE S2, A PRODUCT QUESTION

**Source [implementer-run, trace- and profile-verified; ADR 0144 decision 1].** The write-access probe
answers in milliseconds, but the settings trigger enables only after the first frame's main-thread block:
7-11 s under local load, 7-10 s on the runner. A real low-end device may show the disabled state for that
long. A product question, not a defect; no owner, no phase.

## 121. F1 — `scripts/gates/boundary.sh` matches a driver import on one line only — FOUND 2026-10-07 BY M8 8B's QA — CLOSED 2026-10-08 BY M8 WAVE 8D3 (`b5aed77` … `be4ffe2`)

**Closed 2026-10-08 by wave 8D3** (*8D3 as closed* in the M8 plan): the gate reads every import form and
eight extensions, checks manifests, and has a fixture test; it runs at pre-commit and in `pnpm check`.
Follow-ups are 136 to 138. The entry below is kept as found.

**Source [doc, `docs/milestones/M8-review-contact-success.md`, 8B adjudication of QA, F1].** The architecture
gate matches a Postgres-driver import on one line, so a Prettier-wrapped import or a dynamic import outside
`packages/persistence` passes it. It predates wave 8B and is not in its files. **Owner:** the coordinator,
under `docs/best-practices/ci-and-local-gates.md`. **Trigger:** before wave 8E adds persistence code.

## 122. F5 — a session close that never returns hangs `applyMigrations` — FOUND 2026-10-07 BY M8 8B's QA, UNMEASURED

**Source [doc, same section, B8 restated and F5].** If `end()` never settles, `applyMigrations` never
returns, and the CLI (which sets `process.exitCode` and never calls `process.exit`) does not exit. Seen only
with a mocked driver; whether a connection dropped mid-run leaves a real `end()` pending is unmeasured. It
leaks nothing, and the same `await` stood in the `finally` before wave 8B. **Owner:** the coordinator, before
wave 8S. **Next step:** a measurement on the test database, which needs the owner's approval because it ends a
backend there; if it hangs with the installed driver, the fix is the CLI's shutdown, as its own small wave.
QA's two tests for it stay as declared deferrals that go red when the hang is fixed.

## 123. F6 — do Neon's connection strings carry `sslrootcert` or a sibling? — RECORDED 2026-10-07, A READ, NOT A DEFECT

**Source [doc, same section, F6].** One read of Neon's documentation for whether the strings it hands out
carry `sslrootcert`, `sslcert` or `sslkey`. If they do, the backlog records that the migration tools cannot
use that form: the session client's constructor throws on it, as it did before wave 8B, while the HTTP entry
point still accepts it (ADR 0146, B10). **Owner:** the coordinator, with 121 and 122.

## 124. QA18 and the "Finding …" journal comments in three test files — RECORDED 2026-10-07, LOW PRIORITY, NO OWNER

**Source [doc, M8 plan 8B, and the clean-code reviewer, relayed].** Two small tidy-ups, one entry.

- **QA18:** the connection-opening census does not see a second `Client` constructed through the opener's own
  export.
- **Journal comments:** `test-database-url.test.ts`, `delete-designs-for-tests.test.ts` and
  `migration-target.test.ts` carry pre-existing comments beginning "Finding …", which ADR 0136 says belong in
  the records.

No trigger; do it when one of those files is next touched.

**Added 2026-10-07, from M8 wave 8C's clean-code review (round 2, reviewer-run, relayed).** Two more nits
of the same kind, in `apps/web/src/review/review-model.ts`: a comment on `refuseFirstActionable` says it is
called only for a refused kitchen, though the available path calls it too; and the listed-ids expression
is built twice. Same trigger: when that file is next touched.

**Added 2026-10-08, from M8 wave 8D's close (combined reviewer and visual verifier, relayed).** (1) Two doc
comments in `use-honour-arrival.ts` still run past ADR 0136's length; trimmed by the next wave that opens the file.
(2) A faint vertical line beside the locale chip at 1440 px that the visual verifier could not attribute. (3) The
editor's Russian top-bar title is truncated to *"Конфигур…"* (pre-existing). (4) The locale chip's height, a
shared component (the verifier's V7). Same trigger as above, except that (4) and (2) need a look first.

## 125. Three e2e specs fail under `CI=1` and nobody has investigated them — FOUND 2026-10-07 BY M8 8A S1, TRIAGE BEFORE 8F — TRIAGED 2026-10-09, CLOSED; RESIDUE IS 161, THE DEFECT IS 89

**Source [doc, M8 plan, *8A figures* S1 row B ii].** A full e2e run with `CI=1` (a build and `next start`)
gave 619 passed, 3 failed, 2 skipped: `qa-7e3b-s6-lock.adversarial.e2e.spec.ts:112` (rounds 1 and 5) and
`qa-7e3b-s6-two-tab-convergence.adversarial.desktop.e2e.spec.ts:21` (round 2 of 3; *"did not open with
canWrite: true"*; **annotated 2026-10-08: that desktop spec file was deleted in the tests-review fix-up (row E1), the
mobile project's rounds carry the race [relayed]; Glob finds no such file**). Backlog 117 (the remote test database dropping connections) does not mention them, so this
is a separate entry; whether they are the same family is unknown. **Owner:** the coordinator. **Trigger:**
wave 8F is not dispatched until each has been re-run alone and recorded as a flake, a test fault or a defect
(plan, 8F S0, item 5).

**A fourth, 2026-10-08 (QA10, M8 wave 8D's QA) [QA-run, relayed].** `top-bar-back…desktop:179` (the Control/Meta
click) failed once under `CI=1` on a 5 s URL wait and passed 4 of 4 on repeat. A pre-existing desktop spec, not
8D's; classified test-fidelity. It joins the three above for the 8F S0 triage.

**TRIAGED 2026-10-09 [QA-run by the agent `m8-e2e-triage` at `af55c16`, relayed; raw logs and traces are in the session scratchpad, not
in the repo].** *Method:* CI's own step (`CI=1 … playwright test <file> --project=<mobile|desktop>`, a build and `next start`), each spec
alone, 42 invocations, about 45 minutes; config retries is 0. The trigger above (*"not dispatched until each has been re-run alone and
recorded as a flake, a test fault or a defect"*) is **met as a recording**. Whether the measured defect holds 8F is **put to the owner**;
the coordinator proceeds with 8F's planning meanwhile, on the owner's standing instruction of 2026-10-09 (his words: *"if any blockers
just skip that part and do next one till I will come and will decide"* [relayed]).

- **"round N/10: two tabs … converge on the lock"** (`qa-7e3b-s6-two-tab-convergence.adversarial.e2e.spec.ts`, mobile): 250 rounds, 13
  failed. Alone 0 of 100; one worker 0 of 40; eight workers x10 12 of 100; in the whole suite 1 of 10. **Class: a product DEFECT**, the
  race backlog 89 already records (the save-versus-rotation residual of ADR 0114 H1/H6), now measured. The measurement, the customer
  effect and the proposed fixes are written in 89.
- **"release timing, round N"** (`qa-7e3b-s6-lock.adversarial.e2e.spec.ts`, mobile): 144 rounds, 0 failed here. Classed the same race
  [inferred from the 2026-10-07 log's signature: it failed at `:134` after `:132` passed]; **not reproduced**. The lock spec's other
  four tests: 24 runs each, 0 failed, and no failure was ever recorded.
- **"a Control/Meta click opens Step 1 in a new tab"** (`top-bar-back.qa-m7c-c1-s3.adversarial.desktop.e2e.spec.ts`): 24 runs, 7
  failed (alone 6 of 10; eight workers 1 of 10; one worker x3 0 of 3). **Class: a TEST FAULT.** The product is right: the new tab did
  one GET, 200, and its screenshot shows Step 1 filled in. The assertion `expect(opened).toHaveURL(...)` at `:194` times out with
  `Received: ""` [cause inferred from `playwright-core` 1.62.1's source: its pre-check waits while the frame has a pending document].
  Proposed smallest fix, **not applied and not tested:** poll `opened.url()` for the expected URL. Now entry 161.
- **The deleted desktop two-tab file** (`qa-7e3b-s6-two-tab-convergence.adversarial.desktop.e2e.spec.ts`, 31 lines, 3 rounds of
  `runOneTwoTabRound`) was deleted in `ee834b6` (tests review E1) as a duplicate with no viewport branch [the agent ran git]; the
  mobile file's 10 rounds and the lock spec's 6 release-timing rounds cover it.
- **The whole e2e suite under `CI=1`, eight workers, once**, split by project and shard: 677 tests, 676 passed, 1 failed, 0 skipped
  (desktop 193 of 193; mobile shard 1 of 2: 242 of 243; mobile 2 of 2: 241 of 241). The one failure is two-tab round 10/10, the same
  trace pattern. **Nothing failed outside the four named.**
- *Not established:* the lock spec's own failure (its class rests on the old log's signature); behaviour on a real CI runner; why the
  top-bar test fails 6 of 10 alone and 0 of 3 repeated at one worker; in 4 of 13 traces the recorded PUT end precedes the POST end
  although the jar still ends stale. The tree was clean and port 4320 free afterwards; no file changed.

**Closed by this triage;** the residue is 161 (the test fault's fix and the fidelity note), and the defect stays in 89.

## 126. The price bar and the breakdown print "De la 0 MDL" for a kitchen holding only customer-supplied bodies — FOUND 2026-10-07 BY M8 8C's QA, A PRODUCT QUESTION

**Source [doc, M8 plan, 8C adjudication, QA1 and rule C1].** A kitchen in which every body is supplied by
the customer (ADR 0107 decision 2: appliances are drawn, not sold) is reviewed as *no cabinet* by 8C, but
the price bar and the breakdown predate the wave and still print *"De la 0 MDL"* for it. 8C's plan said
this is "their surfaces' matter" and promised this entry. **The question:** what should such a kitchen
show? **Owner:** the owner's; C1 itself is the architect's ruling and open to the owner. No phase.

## 127. No test pins the Russian wording of any leaf, project-wide — FOUND 2026-10-07 BY M8 8C's QA, A FIDELITY GAP

**Source [doc, M8 plan, 8C adjudication, *Wording, for the owner*, relayed from QA].** QA's surviving
mutation: the plan records only that no test pins the Russian wording anywhere in the project. A fidelity
fact, not a defect in shipped copy. **Owner:** none; no phase.

## 128. The editor shows a save conflict only inside the panel, so an editor with nothing selected says nothing — FOUND 2026-10-08 BY M8 8D's QA (QA11), PRE-DATES THE WAVE

**Source [doc, M8 plan, 8D adjudication of QA's re-run, rule E5a; ADR 0148 Amendment A].** The editor draws a
save conflict, and its two controls (reload, overwrite), in the panel, and the panel needs a selection. It is
the question M4 left open: how a failed background write is told to the customer. The review's conflict link works
around it by arriving with the first body selected. **A kitchen with no body has no panel to open, and the link
then lands on an editor that says nothing.** **Owner:** none; a product question first. No phase.

## 129. A real finger during the scene's first frame is delivered only after the scene rests, and lands on the just-opened panel — RECORDED 2026-10-08 AT M8 8D's CLOSE, UNMEASURED

**Source [doc, the coordinator's close-out brief, relayed].** An arrival selects its body when the scene comes to
rest (about 2.8 s after it mounts); a touch made before then reaches the page after the rest and lands on the
panel that has just opened. A real touch before the scene rests is on 8D's unproven list; it was not measured.
**Trigger:** the first real-device pass (iOS Safari is also unproven). **Owner:** the coordinator, at that pass.

## 130. A two-finger pinch may read as a tap and drop a pending arrival — RECORDED 2026-10-08 AT M8 8D's CLOSE, AN INFERENCE

**Source [inf, the combined reviewer's R1.4, relayed].** The customer's own act cancels a pending arrival (ADR 0148,
E2a); a pinch on the scene during the wait may be read as a tap and cancel it. Not measured; falsified by a real
pinch that leaves the arrival pending. **Trigger:** the first real-device pass. **Owner:** the coordinator.

## 131. The camera chips are written twice — RECORDED 2026-10-08 (8D ruling 5), TRIGGER NAMED

**Source [doc, M8 plan, 8D restated, ruling 5].** The editor draws the room's view chips and the review draws its
own; the review styles its own from `review.module.css`. Extracting them now would disturb the tests that read
`configure.module.css`, and two copies are not three. **Trigger: a third place that draws them** (ADR 0118).
**Owner:** the wave that adds that place.

## 132. `loadOwnedDesign` takes an id of any shape — FOUND 2026-10-08 BY M8 8D's SECURITY REVIEW (R1.2), POINTER ONLY

**Source [doc, M8 plan, 8D adjudication of review round 1; the reviewer's inference that it is no oracle].** The
shared owned load, which both `/d/{id}` and `/d/{id}/review` call, does not check that an id has the shape of a
design id before it queries. It predates the wave, is the same on both doors and answers alike. Ids that are not a
design id's shape stand in existing tests, so the fix is not free. **Owner: wave 8L, slice S2**, which adds the
next caller: an id that has not the shape of a design id is refused as *unavailable* before any query, in the one
function, for every door at once.

## 133. The review's first screenful holds about half the rows it held before 8D2 — RECORDED 2026-10-08 AT M8 8D2's CLOSE, AN OWNER HAND-CHECK ITEM

**Source [visual verifier m8-8d-verify-visual, at `0fad22c`, production build, Chromium 390 × 844, relayed].**
Complete rows in the first screenful, after 8D2 against before: L-ro 6 against 11; L-ru 6 against 9 plus 1 cut;
U-ro 4 against 7; U-ru 3 plus 1 cut against 6 plus 1 cut. The cost comes from the two-line rows and from the chips
standing under the picture, which starts the list 54 px lower (8D2 ruling 2). Both were ruled; the size of the
cost is what the owner has not seen. **Owner: the owner's hand check**, alongside the picture's height (158 px).
What deciding costs: a taller or shorter picture, or chips elsewhere, is a change to `review.module.css` and
criteria 7 and 12 of 8D2/8D; nothing is built.

## 134. A faint vertical hairline left of the Russian chip at 1440 px — CARRIED FROM 8D, CAUSE NOT FOUND, 2026-10-08

**Source [m8-8d-verify-visual, relayed].** Seen again at 1440 px at 8D2's close, cause not found. Probably the
"faint vertical line beside the locale chip at 1440 px" already listed in entry 124 (item 2) [inf: same viewport,
same chip, neither attributed; falsified by finding two causes]. Kept as its own entry so a look has a place to
record the cause. Low; no owner, no phase; needs a look before a fix.

## 135. The app has no `error.tsx` or `global-error.tsx`, so a render-time throw shows Next's default error screen — FOUND 2026-10-08 BY M8 8D2's COMBINED REVIEW, NO OWNER

**Source [m8-8d-review-combined, relayed; the reviewer ran `find` under `apps/web/src/app` and found neither
file].** Any throw during rendering reaches the customer as Next's default error screen. Newly reachable cases
include the review model's throws, among them `MissingRowDetailError` added by 8D2's fix round (`0fad22c`), which
is by design a branch that cannot happen when the model is consistent. Not observed as a defect. Deciding it is a
product question (what the customer sees, in both languages, and what is logged) and new copy. Whether M9 (delivery preparation) is its home is
not established by anything read. No owner, no phase.

## 136. The boundary gate's supplier-folder check has no manifest behind it — FOUND 2026-10-08 BY M8 8D3's COMBINED REVIEW, NO OWNER

**Source [m8-8d-review-combined, relayed; the reviewer ran probes].** `vi.mock("../design-source/a")` and a
template-literal or next-line specifier pass the gate. [coordinator ran] A quoted-path match was tried and
rejected: it flags `eslint.config.mjs:291`, `:414` and `apps/web/scripts/capture-reference-rig.mjs:29`.
Separately, `capture-reference-rig.mjs:29` names a path inside `design-source/`, which `AGENTS.md` rule 3 says
will be deleted; whether that script still has a use is unexamined. No owner, no phase.

## 137. The boundary gate knows two driver names — FOUND 2026-10-08 BY M8 8D3's COMBINED REVIEW, NO OWNER

**Source [m8-8d-review-combined, relayed; the reviewer ran probes].** `postgres`, `pg-pool`, or a relative
path into `packages/persistence/node_modules` pass, in the manifest check and the import check alike. No
such use exists on the real tree that anyone has recorded. No owner, no phase.

## 138. The boundary gate flags a string literal that contains `import 'pg'` — FOUND 2026-10-08 BY M8 8D3's COMBINED REVIEW, NO OWNER

**Source [m8-8d-review-combined, relayed; the reviewer ran a probe].** A false positive, not a miss. None on
the real tree. No owner, no phase.

## 139. The older three tables' grant tests are blind to `PUBLIC`, and the privilege file has further gaps — FOUND 2026-10-08 BY M8 8E's QA AND SECURITY REVIEW, OWNER THE COORDINATOR WITH THE SECURITY REVIEWER

**Source [8E adjudication of QA and *the three reviews*, relayed by the coordinator].** The grant tests for
`designs`, `schema_migrations` and `design_share_links` in `packages/persistence/tests/application-role-privileges.test.ts`
read `role_table_grants` for `current_user`. That view does not show what `PUBLIC` holds, and the queries name no
schema. 8E's own table was rewritten to ask the server for the effective privilege (ADR 0149 decisions 5 and 6); these
three were not. Gathered here:

- **S-R1.9:** grant option and column grants are not asked about. The shared helper learns both once, for all four
  tables.
- **The database-owner gap:** the guard reads `datdba` once; `memberOf` never shows `pg_database_owner`'s implicit
  member.
- `CREATE` on the database and `TEMP` are not asked.
- **Clean-code R2.1 / R2.2** in that file: the `to_regclass`-skip and the grant query are repeated; the doc block's
  placement. The file also still carries wave-history comments from before 8E.

**Trigger:** the delivery milestone's launch gate. When the three tests move to effective privilege they take the
helper under `tests/support/`.

## 140. CI never sets `DATABASE_URL`, so the privilege file never runs on a runner — RECORDED 2026-10-08 AT M8 8E's CLOSE, THE DELIVERY MILESTONE'S

**Source [8E adjudication, relayed].** The persistence suite's privilege file runs only where `DATABASE_URL` is set,
which CI does not do. Criterion 7's grant half has therefore never run on a runner, and the 8E grant test has never run
anywhere (ADR 0149, *Not proven*). Needs a database CI can reach with the application role. Owner: the delivery
milestone.

## 141. Once, one of 150 concurrent hits was rejected with a `NeonDbError` that carried no SQLSTATE — SEEN ONCE, NOT REPRODUCED, 2026-10-08

**Source [m8-8e-qa, relayed; the logic reviewer's reading is src, driver 1.1.0].** 150 concurrent hits, one rejected
with `RateLimitStoreError`, cause `{ name: "NeonDbError" }`. 12 isolated runs and three further full runs were green.
The store constructs no `NeonDbError`; a code-less one is a rejected fetch, a non-400 status, or a 400 without a code:
transport or proxy [inf from that reading]. It failed closed. The test now records the HTTP status. **Trigger:** a
recurrence, which the test names. No owner until then.

## 142. Four owner decisions from wave 8E are pending — RECORDED 2026-10-08; UPDATED 2026-10-08 AT 8H's CLOSE: TWO DECIDED, ONE MOOT, ONE NEW

1. ~~**Rule S2's over-count** (ADR 0149 decision 3): a retried hit may count high. The architect's ruling, open to the
   owner, to be put with the limit's "track and adjust later".~~ **Decided 2026-10-08: accepted**, *"Accept
   (Recommended)"* [owner, relayed]. ADR 0149's amendment.
2. ~~**The keyed hash**, decided in 8K's S0 before an e-mail is a subject. Keyed is recommended; a key added later
   restarts every count.~~ **Decided 2026-10-08: keyed, one secret, from 8F's first deploy** (*"lets add this secret"*,
   *"lets use same secret"* [owner, relayed]). ADR 0149's amendment; `DIGEST_SECRET` in `environments-and-resources.md`.
3. **Whether the two guarded deletes stay.** Removing both loses nothing if the owner wants no write-shaped statement
   sent. **They now go to the preview database**, not production, since the repo-root `.env.local` was repointed
   [coordinator-run]. Still the owner's.
4. ~~**Whether the persistence suite should read production at all**~~ **Largely moot:** by default it no longer does
   (see 3). A deliberate run against production per the runbook remains the way to check its grants.
5. **New:** `vercel env pull` appended `.env*` to `.gitignore` on 2026-10-08. The line is uncommitted and the owner's to
   keep or drop. (The tracked pattern before it was `.env*.local`.)

~~Also unruled and the owner's: whether the deletion of the 3 rows QA's crashed cleanup left in the test database's
`rate_limit_counters` was within the rules.~~ **Ruled 2026-10-08:** *"If were added by tests , delete , if added by
production user keep"*; [ADR 0151](../decisions/0151-a-test-may-delete-the-rows-tests-added-and-never-a-row-a-production-user-added.md).

## 143. The revision shape admits nineteen digits, past a bigint column's range (QA F12) — FOUND 2026-10-08 BY M8 8H's QA

**Source [m8-8h-qa, relayed; the plan's 8H adjudication].** `isDesignRevision` (persistence) and the domain's
`isDesignRevisionShape` accept nineteen digits, which is wider than the column holds. A revision the column cannot hold is
a mismatch, a refusal and not a failure (for 8K). The two predicates are tied by a persistence property, so narrowing one
alone breaks the tie. **Owner:** persistence's: whoever next opens `design-revision.ts`. **Trigger:** that file is opened.

## 144. Any export of contact data must neutralise a leading `=`, `+`, `-` or `@` — RECORDED 2026-10-08 AT M8 8H's CLOSE

**Source [the plan's 8H, *Backlog*].** A name or locality may be a spreadsheet formula; the validated request accepts it
and the mail does nothing to make it live. **Trigger:** an export of contact data is built. ADR 0012 has none today.

## 145. A web-suite run failed once, unidentified — SEEN ONCE IN FIVE RUNS, 2026-10-08, AT `fd2c958`

**Source [coordinator-run, relayed].** One run of the web suite showed 1 failed of 6227 (exit 1); which test was not
captured. Four runs straight after were 6227 passed. **Trigger:** a recurrence, with the failing test's name. No owner until
then.

**A possible recurrence, 2026-10-08 [developer-run, relayed by the coordinator; not established to be the same test].** With
the machine at a load average of about 280, the developer saw `client-write-path.adversarial.test.ts` "… does not send a
further request for later edits once refused" fail once (3 requests, expected 2) and pass when run alone. It also passed
in the coordinator's full `pnpm ci:local` at `ee834b6`. **Whether it is the same test as the failure above is not
established**, because the first failure's name was never captured. A request count that depends on timing may be a real
race. **Trigger unchanged:** a recurrence with its name; this one has a name, so the next sighting of the same title makes it
a candidate for a defect.

**A second named sighting, 2026-10-09 [relayed, QA-run]:** `tests/room/plan-preview-model.facing-labels.test.ts:255`, "never intersect, over lengths across the approved U (Q-U1)", failed once in a whole run with "inside was reached: expected 6 to be >= 8" and passed alone three of three. Its cause is in the test: the property is unseeded and its floor counts how often a random draw reaches an arrangement [src :231-256]. No label intersected. Not established to be the entry's first failure. This one needs no recurrence: seed the property or build its arms so the floor is met by construction. No owner yet; not 8J's.

**Dated note, 2026-10-17 [relayed by the coordinator at the 8J2 / 8U / 8V close].** `tests/room/plan-preview-model.facing-labels.test.ts` is reported flaky: the random test runs without a seed. **Owner action:** the next test-hygiene pass seeds it (or the M8 test audit, ADR 0152).

## 146. Count the stored design ids that do not have the generator's shape before 8L S2 gates a page — OWNER, RECORDED 2026-10-08

**Source [the plan's 8H, *S2's readings*].** Whether every stored design id has the shape the generator makes is not
measured. A page that refuses by `isDesignId` would close an older design's link. The owner reads the live ids once, a
count and no value. **Owner:** the owner. **Trigger:** before 8L's S2 ships.

## 147. `e2e-shard-budget` fails at `ee834b6`, and the pre-push hook runs it — FOUND 2026-10-08 BY THE COORDINATOR'S `ci:local` — CLOSED 2026-10-08, FIXED IN `8aba717` (option 1)

**Closed 2026-10-08 [relayed by the coordinator, who ran the commands].** The owner, verbatim: *"ok do option 1, split the file"*.
`8aba717` split `room-desktop-line.desktop.e2e.spec.ts` (69 tests) into `room-desktop-line.criteria-03.desktop.e2e.spec.ts` (2),
`room-desktop-line.criteria-04-10.desktop.e2e.spec.ts` (37) and `room-desktop-line.criteria-12-17.desktop.e2e.spec.ts` (30), with the
shared helpers in `apps/web/tests/e2e/support/room-desktop-line.ts`; a move, not a rewrite (QA found the 193 desktop titles
identical). Desktop shards of 3 are now 65 / 67 / 61 against the ceiling of 70 (`e2e-shard-budget.mjs` exit 0); mobile unchanged at
82 / 89 / 73 / 81 / 97 / 63. `pnpm ci:local` at `8aba717`: all gates green. The residue is entry 153. The text below is the entry as
first written and is kept as history.

**Source [coordinator-run, `pnpm ci:local` at `ee834b6`; `docs/archive/TESTS_REVIEW.md`, *Progress*].** The tests-review fix-up deleted three
desktop e2e spec files (6 tests), which moved Playwright's split, because a file is never divided across shards
(`scripts/gates/e2e-shard-budget.mjs`, `RATCHETED_CEILINGS`). Desktop shards of 3 now hold 132 / 0 / 61 tests against a
ceiling of 70. `room-desktop-line.desktop.e2e.spec.ts` holds 69 of the 193 desktop tests. **Measured by the coordinator** with
`playwright test --list --shard` [relayed]:

| Desktop shards | Tests per shard |
| --- | --- |
| 4 | 52 / 80 / 40 / 21 |
| 5 | 39 / 93 / 0 / 40 / 21 |
| 6 | 33 / 99 / 0 / 0 / 40 / 21 |
| 7 | 28 / 34 / 70 / 0 / 10 / 30 / 21 |

Only 7 fits. **Options put to the owner, undecided:** (1) split `room-desktop-line.desktop.e2e.spec.ts` (the coordinator's
recommendation, and what the gate's own comment asks for); (2) raise desktop to 7 shards in `ci.yml` and in the gate; (3)
restore the deleted specs. **The pre-push hook runs this gate, so the branch cannot be pushed until this is decided.**
Related: entry 106 (desktop shard 2 of 3 sat at exactly its 70-test budget). **Owner:** the owner.

## 148. A metres field and a dangling separator (`3,` `3.` `,5` `.45`): refuse, or read as 3000 / 3000 / 500 / 450 mm? — FOUND 2026-10-08 BY THE TESTS REVIEW — CLOSED 2026-10-08, RULED BY THE OWNER AND PINNED IN `eaef634`

**Closed 2026-10-08 [relayed by the coordinator, who read the source; QA confirmed by mutation].** Asked the question, the owner
answered, verbatim: *"is now milimiters so no separator should be accepted"*. The customer's length fields already refuse any
separator (`parse-millimetres.ts`, `/^[0-9]+$/`, `notDigits`, ADR 0126); `parse-metres.ts` is only the URL wire-form reader and
refuses all four forms. **The coordinator's reading, not the owner's:** the either-answer tests concerned the URL reader. `eaef634`
pins the four forms as `refusal("notANumber")` and in the `notDigits` table, red under mutation [QA's recorded runs]. The open
question that remains is entry 154. The text below is the entry as first written and is kept as history.

**Source [doc, `docs/archive/TESTS_REVIEW.md` line 285; the architect's reading, relayed].** No decision record rules on it. Four
tests in `parse-metres` accept either answer (`expectRefusedOrExactly`), so they cannot tell the two behaviours apart; the
review's mutation turned the parser's pattern from `\d+` to `\d*` and the four stayed green. **The architect did not read
the parser: which answer is today's behaviour is unverified.** The same file's tests `refuses ","` and `refuses "."` went red
under that mutation [doc, same row], which suggests a lone separator is refused; that is an inference and does not decide
`3,`. **Owner:** the owner (a product question first).

## 149. The empty `test.fixme` in `global-settings-apply.e2e.spec.ts` is the only record of an unasserted behaviour — TESTS REVIEW ROW 2881, 2026-10-08 — THE QUESTION CLOSED 2026-10-08 (fixme deleted in `eaef634`); THE GAP STAYS OPEN

**Question closed 2026-10-08 [relayed by the coordinator].** Asked what happens to the empty `test.fixme`, the owner chose
**"Delete it (Recommended)"**. `eaef634` removed it; the e2e listing went from 678 to 677 tests [QA's listing]. **The gap is not
closed and stays recorded here:** "the sheet stays open" after a `BODY_PROBE_UNAVAILABLE` refusal is asserted one layer down and
not in a browser, because no browser route reaches a detached probe. The refusal is live. Trigger: a browser route that can
reach a detached probe. The text below is the entry as first written, kept as history.

**Source [relayed; the fixme's presence checked at `apps/web/tests/e2e/global-settings-apply.e2e.spec.ts:214`].** That `test.fixme`
is the only record that "the sheet stays open" after a `BODY_PROBE_UNAVAILABLE` refusal is not asserted in a browser. The
refusal is live and no browser route reaches a detached probe. Whether the fixme stays once this entry exists is the owner's
call. **Owner:** the owner.

## 150. A third copy of the "undeclared or offers" check, without the schema check — FOUND 2026-10-08 BY THE TESTS REVIEW'S D3 LOGIC REVIEW

**Source [relayed; the function's presence checked at `apps/web/src/settings/global-settings-model.ts:365`].**
`withoutAFinishTheMaterialRefuses` repeats the undeclared-or-offers check that `designOffersFinish`
(`packages/configurator-domain/src/design-material.ts`, `6eef46c`) now holds once for the two commands, without the schema
check. No customer-visible disagreement (the logic review); a drift risk. It could call `designOffersFinish`. **Trigger:** that
function is next opened. No owner. See [ADR 0084](../decisions/0084-canfinish-is-the-load-seams-and-a-command-fixture-constructs-only-its-own-contracts-inputs.md)'s note of 2026-10-08.

## 151. `DESIGN_ENVELOPE_BYTES` is public through the domain package's `export *`, for one test — RECORDED 2026-10-08

**Source [relayed; the clean-code review's trade-off].** The constant is exported so that one test can read it; the owner
approved the export. Recorded so a later reader does not take it for a public contract. **Trigger:** a second reader appears,
or the package's public surface is next trimmed. No owner.

## 152. Single-guard behaviours were listed per wave and never collected; the two-tab lock's desktop rounds were removed — RECORDED 2026-10-08

**Source [doc, `TESTS_REVIEW.md`, *What is still open*; relayed for the second half].** Many behaviours now rest on one test each;
the QA agents listed them per wave but the lists were not collected into one place, so no total exists. Separately, the
two-tab lock's desktop run had added 3 rounds of a probabilistic race that the mobile project's 10 now carry alone
[relayed]. **Trigger:** the next test audit ([ADR 0152](../decisions/0152-a-test-is-kept-only-if-it-can-fail-for-the-reason-its-title-names-and-is-deleted-only-on-evidence.md)
decision 4): it should not report "one test" as a finding by itself. No owner.

## 153. The desktop e2e ceiling is still 70 with a largest shard of 67, and the gate script's comment is stale — RECORDED 2026-10-08, AFTER `8aba717` — CLOSED 2026-10-08, FIXED IN `18283a8`

**Closed 2026-10-08 [relayed by the coordinator, who ran the gate].** `RATCHETED_CEILINGS.desktop` went from 70 to 67 in
`scripts/gates/e2e-shard-budget.mjs`, with its comment rewritten (no single desktop file is over budget; the largest shard is 67
against a derived budget of 66 because a shard is whole files; the ceiling only comes down). Its own test asserts 67, and three
test comments now point at the split spec files. The developer's run showed the gate failing at 66 naming shard 2. The entry
cannot be deleted from `RATCHETED_CEILINGS` until the derived budget is enough. `pnpm ci:local` at `18283a8`: all gates green. The
text below is the entry as first written, kept as history.

**Source [relayed by the coordinator, who ran the gate].** After the split (entry 147) the largest desktop shard is 67. The
derived budget is 66, so `RATCHETED_CEILINGS.desktop` (70) could come down to 67 but not be removed. Lowering it is the
owner's call. The comment above that constant in `scripts/gates/e2e-shard-budget.mjs` still names the deleted file and the
figure 69; it is code and has not been edited. Three test files also still name the deleted spec in comments
(`qa-7l-suggestion-card-is-the-chip.adversarial.dom.test.ts`, `u-gate.e2e.spec.ts`,
`qa-m7c-c1-footer-centring.adversarial.desktop.e2e.spec.ts`). **Owner:** the owner for the ceiling; the next developer
dispatch for the comments.

## 154. Should the room URL carry millimetres instead of metres? — RECORDED 2026-10-08, AN OPEN QUESTION, NOT DECIDED

**Source [relayed by the coordinator; told to the owner as undecided].** After the owner's answer on entry 148, the customer's
fields take whole millimetres with no separator (ADR 0126), but the URL (`room-url-state.ts`, `room-query-sync.ts`) still carries
metres, where a separator between digits is the format by design. Whether the URL should switch to millimetres with no separator
is **not decided**. Existing shared links carry metres, so a switch is its own decision with its own compatibility question.
**Owner:** the owner. **Trigger:** the URL's wire form is next touched. See the dated note in
[ADR 0126](../decisions/0126-the-rooms-lengths-are-typed-in-whole-millimetres.md).

## 155. The only consent text version in code is `"placeholder"` — RECORDED 2026-10-09 AT M8 8I's CLOSE

**Source [the plan's 8I, *the security read of `0008`*; src `packages/configurator-domain/src/contact/contact-fields.ts:26`].** A
stored request records the consent text version it was given under, and the only version the code has is `"placeholder"`. A
launch item, and the owner's words. **Owner:** the owner (Q7, the consent text). **Trigger:** before launch (M9).

## 156. The boundary gate does not catch a test importing another package's tests by relative path — FOUND 2026-10-09 IN M8 8I's REVIEW

**Source [the plan's 8I, *the three reviews*, C-R1.1].** A test file in `packages/persistence` imported another package's test
files; `scripts/gates/boundary.sh` did not see it. Fixed in the one file (the real snapshots are made through the domain's public
exports or from copied fixtures); the gate itself is unchanged. **Owner:** the coordinator. **Trigger:** the next change to the gate.

## 157. For the milestone-close test audit: 8I's QA files and the clean-code nits — RECORDED 2026-10-09 AT M8 8I's CLOSE

**Source [the plan's 8I, *review round 2, ruled*; clean-code C-R2.9, C-R2.7].** 8I's QA files restate six cases the developer's
tests hold (C-R2.9); file sizes were 1569, 1395 and 621 lines at the time of review (C-R2.7); the other nits are listed in *review
round 2, ruled*. The `qa-8i-*` files are the only guard of the check's rules 2 and 3 and are not duplicates (ADR 0153 decision 8).
**Owner:** the test audit. **Trigger:** the M8 close audit (ADR 0152, Amendment A).

## 158. The mail tests' fixtures are duplicated between the developer's and QA's files — RECORDED 2026-10-09 AT M8 8J's CLOSE

**Source [the plan's 8J, *the three reviews*, JC-R1.12 and JC-R1.18, recorded not taken].** The fake key and addresses, the fetch and
answer stubs, the notice fixtures and the dressed-kitchen fixture exist in three or more copies across ten test files and both authors'
support. The developer's support is the home, and QA imports it, never the reverse. **A third instance noted at `45e2c39` [reviewer,
clean-code]:** the all-traps-throw `Proxy` helper is built in both `qa-8j-notice-kitchen` and `lead-notification.test.ts`. **Owner:** the
coordinator. **Trigger:** 8K's first test that needs them (the third consumer).

## 159. For the milestone-close test audit: 8J's restated pairs, the nits and JC-R1.20/1.21 — RECORDED 2026-10-09 AT M8 8J's CLOSE

**Source [the plan's 8J, *the three reviews*, JC-R1.13; the findings file].** Pairs where an adversarial file restates a case the
developer's tests hold, the remaining nits, and JC-R1.20 and JC-R1.21 [reviewer, clean-code, at `ab5d77a`]. **JC-R1.20 (nit):** `dressed`
in `lead-notification.test.ts` is about 22 lines and `dressedKitchens` calls `.map(dressed)`, passing the array index as `offset`
implicitly; the developer's tests spell the fact indent as a raw two-space string three times where QA names `FACT_INDENT`; `"QA-HOSTILE"`
is repeated beside `HOSTILE_ID` in `qa-8j-notice-kitchen`. **JC-R1.21 (nit):** `create-mail-sender.test.ts` ("hands back `send` alone",
fake) and `qa-8j-environment` assert the same own keys `["send"]`: a newly added restatement in JC-R1.13's class. **File sizes at review**
[coordinator ran `wc -l` at `08ead7b`]: `qa-8j-provider-answers.adversarial.test.ts` 833 lines, `qa-8j-environment` 604,
`qa-8j-request-and-predicate` 593, `qa-8j-notice-customer-text` 552, `qa-8j-notice-kitchen` 315; the developer's
`lead-notification.test.ts` 687, `resend-mail-sender.test.ts` 615. **Owner:** the test audit. **Trigger:** the M8 close audit (ADR 0152, Amendment A).

## 160. The mail adapter's answer mapping moves to its own module — RECORDED 2026-10-09 AT M8 8J's CLOSE — CLOSED 2026-10-17 BY 8J2

**Source [the plan's 8J, *the three reviews*, JC-R1.8].** `resend-mail-sender.ts` (231 lines) does request building, the timeout race and
the answer mapping with body parsing. A move now costs a re-read and three source scans' lists for no behaviour. **Owner:** whoever next
changes the file. **Trigger:** a second adapter, or the file's next change of behaviour.

**Closed 2026-10-17.** The trigger fired: wave 8J2 (planned as 8N) replaced the Resend adapter with a Gmail SMTP one, whose answer
table is its own module, `apps/web/src/lib/server/mail/smtp-answer.ts` [src: the file exists; S1 `b51899a6`, commit subject]. The Resend
adapter was deleted (`fb15fa08`). [ADR 0164](../decisions/0164-the-shops-notice-leaves-through-gmail-smtp-by-nodemailer-behind-the-unchanged-port-and-the-stored-mark-is-the-only-guard-against-a-second-notice.md) decision 5.

## 161. The Control/Meta-click spec's URL wait is a test fault, and the two-tab helpers hide the status of a lockout — RECORDED 2026-10-09 BY THE TRIAGE OF 125 — CLOSED 2026-10-09, FIXED IN `c5432da`

**Source [QA-run by `m8-e2e-triage` at `af55c16`, relayed; see 125].** (1) `top-bar-back.qa-m7c-c1-s3.adversarial.desktop.e2e.spec.ts:194`:
`expect(opened).toHaveURL(...)` times out with `Received: ""` although the product is right (7 failures in 24 runs). Smallest fix
proposed: poll `opened.url()` for the expected URL. (2) A test-fidelity note: `canWriteDesign`
(`tests/e2e/support/two-tab-convergence.ts`) and `canWrite` (the lock spec, about `:103-109`) return false for any non-200, so a 404
lockout reads the same as a 5xx; the status belongs in the failure reason. **Closed 2026-10-09: both fixed in `c5432da` (the two e2e test
faults, before wave 8F), one combined reviewer approved** [coordinator ran `git log`; relayed].

## 162. A pixel comparison in the review scene's e2e spec flickered once in a whole `CI=1` run — RECORDED 2026-10-09 AT M8 8F's CLOSE

**Source [QA-run, relayed].** `tests/e2e/qa-8d-review-scene.adversarial.e2e.spec.ts:188`, "a tap on a body in the review's scene selects
nothing…", failed once in a whole `CI=1` run at eight workers (`expected <= 60, received 32757` changed pixels) and passed alone 6 of 6 and in
an earlier whole run. A flicker of an 8D pixel comparison, not 8F's. **Owner:** none yet. **Trigger:** a recurrence, or the M8 test audit.

**Third sighting, 2026-10-10 [QA-run, relayed]:** the first review round of 8G, in a whole `CI=1` run (746 passed, 1 failed); a second sighting had been
noted during 8G's earlier QA work. Still not 8G's; the trigger stands.

## 163. A tap on *Continuă* immediately after Step 1 loads does nothing — RECORDED 2026-10-09 AT M8 8F's CLOSE

**Source [the visual verifier, relayed].** The tap lands before hydration; with a two-second wait it works every time. **A product question;**
no owner. **Trigger:** none set.

## 164. One unidentified `404` resource appears on Step 1 in every run — RECORDED 2026-10-09 AT M8 8F's CLOSE

**Source [the visual verifier].** "Failed to load resource: 404" appears on Step 1 in every run; **what it is has not been established.**
**Owner:** none yet. **Trigger:** none set.

## 165. Both e2e harness servers listen on every interface — RECORDED 2026-10-09 AT M8 8F's CLOSE

**Source [the security reader, F-S2.4, recalled: the framework's default host].** The suite's first server always has; the second is CI-only.
A developer's first server is reachable on the local network under the e2e policy, on the test database. Binding it to loopback changes how
every e2e test reaches its server and is measured on its own. **Owner:** the coordinator. **Trigger:** that measurement.

## 166. The environment type and its own-member read are written three times across mail, digest and network — RECORDED 2026-10-09 AT M8 8F's CLOSE

**Source [the plan's 8F, *the three reviews*, clean-code FC-R1.9 and FC-R1.11].** The environment's type and the own-member read exist in the
mail, digest and network modules, and the deadline helper twice; one module would hold them, but moving them goes through 8J's closed modules
and their source scans. **Owner:** the wave that builds the fourth reader. **Trigger:** the fourth reader, 8G's or 8K's.

## 167. For the milestone-close test audit: 8F's restated pairs and the remaining should-fix and nits — RECORDED 2026-10-09 AT M8 8F's CLOSE

**Source [the plan's 8F, *the three reviews*; `coord-8f-review-clean.md`, session scratchpad].** FC-R1.18, FC-R1.21, FC-R1.24, FC-R1.25,
FC-R1.28, FC-R1.29, the rest of FC-R1.20 and FC-R1.22, the nits and the restated pairs. From the final re-check [reviewer, clean-code]: the
listener still removed in the test body in `qa-8f-refused-mint-through-the-route` (about `:828-845`), and three duplications in
`qa-8f-mint-limit-code`. **Owner:** the test audit. **Trigger:** the M8 close audit (ADR 0152, Amendment A).

## 168. A design returned to by Back or Forward is shown from the page's kept copy, older than the stored one, and as saved — FOUND 2026-10-10 BY M8 8G's QA (C2-1); A WAVE OF ITS OWN BEFORE 8T's GATE — CLOSED 2026-10-12 BY M8 WAVE 8K2 (`5f0d93f6` … `7d282603`)

**Closed 2026-10-12 [scribe, from the plan's *8K2 as closed* and ADR 0158; the scribe ran nothing].** Both halves shipped: the probe's answer taken whole (K2.2) and the write the tab holds handed to a load in all four states (K2.3, with GL-R4.1 and the write in flight). QA's two tests pass unmarked in the whole e2e under `CI=1`: 793 passed, 0 failed, 0 skipped, 10.1 minutes [coordinator-ran, `18caaea4`]. **What stays:** item (2) of the entry below (*the same for the page's three steps*) was withdrawn (K2.6); the review's own case is L2 and 8L's criterion 14. The push waits on Q42 (backlog 182). The entry below is the original, kept.

**Source [QA-run on a built server, with no limit met; `qa-8g-pass-c2-report.md`, session scratchpad; the plan's 8G, *pass C's finding C2-1, ruled*].**
Step 1 makes design A; one edit is saved (`200`, revision 3); Back; one press makes a second design B; browser Back twice returns to A's address in the
same document with no request for A's page (the router's own copy): **the screen shows A without the edit, status idle (saved)**, while the stored design
holds it. The next edit is sent with `x-expected-revision: 2` and answered `409`; the screen says `conflict`. Nothing is overwritten unless the customer
presses *overwrite*, which writes the screen's copy and **drops the earlier edit**. *Cause [src, not varied]:* `HydrateAndConfigure` replaces the store
whenever it holds another design id with the page's props, and on a Back traversal those are the router's kept copy; `HydrateAndReview` already guards
this for one design (`hydrate-and-review.tsx:21`) and the editor has no such guard across two. **It is older than 8G** (nothing in 8G made it) and **not
Q35's family** (an older *page*, not an older *cookie*). **The rule for the wave, the architect's:** *a design's page shown again by Back or Forward never
shows a copy older than the one stored.* The review already holds that for one design. The editor already asks the server for the design after it loads
(its write-access probe), and that answer carries the stored copy and its revision. **Where the screen holds no unsaved edit and that answer is newer, the
screen takes it.** With an unsaved edit, the conflict's own path as today. **Its items:** (1) the rule above in the editor's load, with QA's two tests going
red and their marks removed; (2) the same for the page's three steps; (3) a trace that a write still in flight when its design is loaded again ends on the
stored copy; (4) that no extra request is made on a first load. *It stops if* the probe's answer cannot be told newer from older without a second
request. **QA's two tests**, in `qa-8g-leave-while-waiting.adversarial.e2e.spec.ts`, are **marked expected to fail with this number as the reason**
(`18a9f319`); they run on every run and go red the day the defect is fixed, until the mark is removed. *Tier:* Full. **Owner:** the architect's wave; before
8T's gate; the owner is told.

**GL-R4.1, in the same entry [reviewer, logic, `a72c3a82`; the coordinator's classing, to be confirmed by the architect when that wave is planned].** The
same stale-page path exists for a failure's backoff, which the ruling left out by name: while design A's save keeps failing (its pending write re-armed
every half second to eight), the customer makes a second design and comes Back to A without a full load. A is shown from the page's copy as saved, with no
sentence; with an edit, `scheduleSave` clears the backoff and replaces the pending write with the screen's state, so the earlier edit is never sent and never
shown as unsaved. It is 7E's rule, not made by 8G, and narrow (A's saves must fail for the many seconds it takes to open B while B's mint and first save
succeed) [inf: read, not run]. *Smallest fix:* adopt any pending write of the design, not only one with a time (`save-coalescer.ts:242`). *Trigger:* a
`conflict` or a customer's report after Back from a second design; otherwise it travels with this entry.

## 169. The coalescer's two long functions and its one invariant kept in four places — RECORDED 2026-10-10 AT M8 8G's CLOSE — CLOSED 2026-10-12 BY M8 WAVE 8K2 S2 (`7b16568a`)

**Closed [plan, relayed]:** the queue holds one wait (timer and the limit's time together); `scheduleSave` and `holdWriteForLimit` were 15 lines each as built at `7b16568a`. `holdWriteForLimit` was edited again in `7d282603` (one clock reading); its length now was not re-read by the scribe. The entry below is the original.

**Source [clean-code GC-R3.10; the plan's 8G, *the second pass*].** `save-coalescer.ts`: `holdWriteForLimit` is 22 lines and `scheduleSave` 32 (the limit is
20); and the queue's wait is two fields, `retryTimer` and `resumesAtMs`, whose invariant (*one timer, never both*) is kept by hand in four places. The reviewer's
fix: extract the status report and the timer arming, and carry one `wait: { timer; resumesAtMs } | null` per queue. **Owner:** the next developer who touches
that module. **Trigger:** its next change of behaviour.

## 170. A save's deciding policy is named by a closure's side effect — RECORDED 2026-10-10 AT M8 8G's CLOSE

**Source [clean-code GC-R3.7].** `judge-save-request.ts` reassigns `decidingPolicy` inside the second step's arrow before it is awaited, so the answer's policy
depends on a side effect of a closure that `judgeInSequence` happens to call in order. The fix: each step answers `{ decision, policy }` and the caller takes
the policy of the step that ended it. **Trigger:** a third step, which 8K's judge may be.

## 171. `isSavePaused` is a type predicate about a pair and narrows only the time — RECORDED 2026-10-10 AT M8 8G's CLOSE — THE PREDICATE CLOSED 2026-10-12 BY M8 WAVE 8K2 S2 (`1087f45b`)

**Closed in part [plan, relayed]:** `isSavePaused` is `pausedUntilMs(status, resumesAtMs): number | undefined`, asked once by the panel and the review. **The two nits:** S3's item 4 took them (`hydrate` is 13 lines as built, per the plan); whether taking a write and reading it became two functions was not re-read by the scribe, and the rename of `WaitingWrite` is backlog 184. The entry below is the original.

**Source [clean-code GC-R4.1, should-fix, `a72c3a82`].** `isSavePaused(status, resumesAtMs): resumesAtMs is number` narrows only the second argument, so in the
false branch the type system believes the time is `null | undefined` even when the status is idle and the time a number. Today no caller reads the time after
the call. The fix: answer the time itself, `pausedUntilMs(status, resumesAtMs): number | undefined`. Also (nits): `hydrate` is about 30 lines (extract
`shownStateFor`); `adoptWaitingWrite` answers a value and changes the queue. **Trigger:** the next change to those files.

## 172. For the milestone-close test audit: 8G's renames blocked by `qa-*` pins, and the rest — RECORDED 2026-10-10 AT M8 8G's CLOSE

**Source [the plan's 8G, *the second pass*; clean-code GC-R3.9 to GC-R3.11 and the nits; `coord-8g-review-clean.md`, `coord-8g-pass2-clean.md`,
`coord-8g-passd-clean.md`].** GC-R3.9 (b) and (c) (`bucketKeyOfBlock` to `bucketKeyOf(secret, policyName, subject)`; `mintsCounted` to `hitsCounted`) are
renames in test support blocked by two `qa-*` pins; QA left both to this audit. With them GC-R3.9 (a), GC-R3.11 (`tests/proxy-matcher.test.ts` reads the app
tree and its title does not say so), the nits, the restated pairs, and the final re-check's: a pattern helper written twice in two e2e specs, the same comment five
times in `qa-8g-leave-while-waiting`, and `qa-8g-test-runner-guard` restating `require-test-runner.test.ts` for four callers. **Owner:** the test audit.
**Trigger:** the M8 close audit (ADR 0152, Amendment A).

## 173. Step 1's first save refused reads as a plain failure — RECORDED 2026-10-10 AT M8 8G's CLOSE

**Source [logic GL-R3.3; the plan's 8G, *the second pass*].** Step 1's first save, when refused by the limit, reads as a plain failure, and each *try again* is a
refused hit; a design whose first save is still the provisional queue is given no wait on return. A named interim under the save's limit. **Trigger:** Q37
answered (a).

## 174. One cold-start timeout in Step 1's hand-off, seen once — RECORDED 2026-10-10 AT M8 8G's CLOSE

**Source [developer-run, relayed; QA-run].** The first of QA's seven traces timed out once in Step 1's hand-off on a cold server, inside the shared helper
`openEditorFromStepOne`; **not reproduced** in the file's four runs alone under `CI=1` and one whole run [QA-run]. The spec's own limit is 180 s where the config
gives 120 s. **Owner:** none. **Trigger:** a recurrence.

## 175. Calls at once under one id are each counted as a new request — RECORDED 2026-10-12 AT M8 8K's CLOSE

**Source [QA R1, K-S2.1; the plan's 8K, *adjudication of QA*; ADR 0157].** Each call's lookup answers *absent* before either has recorded, so each counts a new
request's buckets; the record then makes them one row [src `submit-contact.ts`, `aNewRequest`]. **Holds:** one row and one reference; no request lost, no false
success. **Does not:** one request can spend two of a bucket, and a call arriving when its bucket is at its figure is told *limit* for a request its twin stores and
sends; the same id tried again after the wait is answered the truth by the stored path. Bound: the network's hour. Every exact fix needs the calls of one id put in an
order (a second lookup after a refusal; giving hits back; a claim on the id), each a new power in the limiter and each needing the security reader. **Owner:**
8L carries the guard as two criteria of its form. **Trigger:** 8L cannot hold the one-request-in-flight criterion; or a customer is reported refused for a request the
shop received; or the delivery milestone's hardening of the form, whichever is first. *Not proven:* that two messages under one key are one at the provider.

## 176. The application has two price-book roots; they must become one before either names another book — RECORDED 2026-10-12 AT M8 8K's CLOSE

**Note 2026-10-26: the trigger fires in M10, wave R1** (the one price-book root; every other M10 route and price surface waits for it). [ADR 0176](../decisions/0176-the-manufacturer-price-dashboard-is-milestone-m10-and-starts-now.md). Not built.

**Source [the plan's 8K, *S5: the route composed what two invariants reserve*; ADR 0062 seam 1 (note 2026-10-12); ADR 0157 decision 8].** The browser's root and the
server's `lib/server/shipped-price-book.ts` each name the same book. Changed alone, a customer would review one price and the shop would be sent another, and
nothing would catch it. The one shared module is not built: moving the browser's ingress moves QA's pins (`qa-m6-wave-b-book-ingress`, `qa-8c-model-purity`) and is
a change to the editor's price path. **Trigger:** before either root names another book (the manufacturer dashboard, ADR 0062).

## 177. For the milestone-close test audit: 8K's restated pairs and remaining should-fix and nits — RECORDED 2026-10-12 AT M8 8K's CLOSE

**Source [clean-code KC-R1.19; round-2 re-check at `8782ad17`, KC-R2.1 to KC-R2.3, reviewer-read, relayed].** KC-R1.19: literals restated (e.g. `"LM-00000000"` in
`deliver-notice.ts:32`, `submit-contact-harness.ts:36`, `qa-8k-identity:45`), **the seventeen restated pairs**, and exports read only by tests; ruled the audit's, with
K-S2.5's sentence. KC-R2.1: `apps/web/tests/lib/server/contact/contact-responses.test.ts:116`, a title that says more than the test asserts (it can fail; not a dead test; direction: "has
13 answers and no code is used twice"); KC-R1.17 is therefore partial. KC-R2.2: `apps/web/tests/lib/server/rate-limit/contact-policies.test.ts:98` and `:103` name "Q39"
in titles. KC-R2.3: noun-named functions in `submit-contact.ts` (`digestOf`, `countedAddressOf`, `storedOrPrepared`); in `tests/e2e/global-teardown.ts`, `summaryOf`
defaults a twin missing from the map to zero. **Owner:** the test audit. **Trigger:** the M8 close audit (ADR 0152, Amendment A).

## 178. Bytes that are not UTF-8 are stored and mailed as replacement characters — RECORDED 2026-10-12 AT M8 8K's CLOSE

**Source [QA R2, K-S2.2; the plan's 8K, *adjudication of QA*].** `read-body-with-limit.ts:49`, used by the contact route, decodes without refusing. No browser sends such a
body; what is stored is valid text; the save's route reads the same way. Refusing means a second way to read a body or a change to 8H's one definition of a request.
**Trigger:** anything that reads a stored contact field as bytes, or the shared reader gaining a strict mode for another reason.

## 179. Round-2 notes on the contact route's ports and the log's tests — RECORDED 2026-10-12 AT M8 8K's CLOSE

**Source [round-2 re-checks at `8782ad17`, reviewer-read, relayed].** **KL-R2.1:** since `a2f0a95d` leaves are read eagerly when the ports are made throw, so one
unreadable leaf of `ro.json`, even one the notice never uses, makes every contact request `503` with cause `unexpected` rather than `notice-unbuildable`
(`contact-production-ports.ts:47-59`, `route.ts:80-89`); closed, nothing stored or sent; which leaves are eager is the reviewer's inference. **Trigger:** a
`contact-request-unavailable` line with `unexpected` on every request after a catalogue change. **Direction:** a build-time test that the shipped catalogue resolves whole.
**KL-R2.2 (security note 3):** A2's tests stop at the port; no test takes a real missing leaf through the notice builder to the `503`/`502`. **Security note 2:** on a stored
request's retry a failed leaf is `502 CONTACT_NOTICE_NOT_SENT_RETRY` with `notice-unbuildable`, not the `503` the commit message of `a2f0a95d` implies (as ruled; criterion 8
holds). **KL-R2.3:** the log tests mail failure kinds against the mail port's own list, equal to the removed copy today. **Trigger:** the first of the above to recur.

## 180. `prepareSubmission` takes three arguments — RECORDED 2026-10-12 AT M8 8K's CLOSE

**Source [clean-code; the plan's 8K KC-R1.11; round-2 re-check, "known recorded item"].** `prepare-submission.ts:38-42` takes request, payloadDigest and sources; callers
`submit-contact.ts:193` and `:259`. The functions rule is two arguments at most; a named object would group them. **Trigger:** the next change to that function or its callers.

## 181. Recorded notes of 8K's reviews that fix nothing now — RECORDED 2026-10-12 AT M8 8K's CLOSE

**Source [the plan's 8K, *adjudication of QA* and *the three reviews*; ADR 0157].** **K-S2.3** (a judge's maker or a clock that throws would have been the framework's
`500`, not the one `503`): taken in fix round A item 1 per the plan (`9fc941e6`). **K-S1.7 / KL-R1.1:** a deploy that changes a figure of a book and not its version is not
caught by the digest; the digest covers the id, the revision and the book's version, not the pricing code, the catalogue or the notice's words, so a stored, un-notified
request tried again across such a deployment is refused by the provider as another payload, or after its day is sent with lines that are not the stored row's; **trigger:**
a deployment while a not-sent line is in the log (Q40: "(b) is exact within one deployment, (a) always"). **KL-R1.5:** a design that cannot be priced is answered *try again*
each time; **trigger:** an `unexpected` cause in the log. **KL-R1.6:** the ports are made before the first count and nothing of the request is read to make them; recorded
with M9's shield. **Backlog 170** (a save's deciding policy named by a closure's side effect) was the target of 8K's S1 item 5 (a step answers its decision and its policy);
whether it is resolved was not re-read in code by the scribe.

## 182. `pnpm ci:local`'s e2e step runs `next dev`, where the exact-read-count specs cannot hold — FOUND 2026-10-12 BY THE COORDINATOR AT M8 8K2's CLOSE; THE PUSH IS BLOCKED UNTIL THE OWNER ANSWERS Q42

**Source [coordinator-ran, `18caaea4`; developer-ran; the config lines read by the scribe].** `pnpm ci:local` at `18caaea4`: every gate passed (format, lint, typecheck, domain 7746, persistence 2666 + 2 skipped, three-adapter 4284, web 8755, `e2e-shard-budget` with mobile in seven shards 95/80/91/79/88/102/65 against 125, build, boundary, lockfile, sca) **except the e2e step: 6 mobile specs failed (718 passed, 69 skipped), twice.** **Cause** [developer-ran: with `CI` unset 6 fail; with `reactStrictMode` off 12 pass; the trace shows two `GET`s 3 ms apart]: with `CI` unset the config boots `next dev` (`apps/web/playwright.config.ts:92-94`) and `scripts/local-ci.sh` sets no `CI`; React's strict mode runs the write-access probe's effect twice (`useWriteAccessProbe`, `hydrate-and-configure.tsx:58`), so `design-return-requests` and `qa-8k2-design-return`, which count reads exactly, cannot hold. **Production reads once.** The whole e2e under `CI=1` at `18caaea4`: 793 passed, 0 failed, 0 skipped, 10.1 minutes [coordinator-ran]. After `7d282603`: the whole web unit suite 8755 passed, typecheck exit 0, prettier clean, the three 8K2 e2e files under `CI=1` 14 passed [coordinator-ran]. **The full `ci:local` was not re-run at `7d282603`, and no `ci:local` run is green at or after the 8K2 code.**
**Options, the owner's (Q42), not decided here:** (1) `scripts/local-ci.sh` runs the e2e step with `CI=1` (**recommended by the coordinator**); (2) the exact-count specs skip or relax on a dev server. *Note:* `best-practices/ci-and-local-gates.md` already records that `ci:local`'s e2e runs the dev server; (1) changes that. **Trigger:** Q42 answered; the push waits.

## 183. One discriminated union in place of `resumesAtMs` and the optional `heldAs` — RECORDED 2026-10-12 AT M8 8K2's CLOSE

**Source [clean-code reviewer, relayed].** Replace `resumesAtMs` plus the optional `heldAs` with one discriminated union (limit-wait / backing-off / queued / sent): `save-coalescer.ts:126`, `heldWriteOf`, `saveStateShownFor`. The queue's `failureTold` is a third place a held write's state lives. The lines that move: `save-coalescer.return.test.ts:110-114` and `:194-198`, the `heldAs` expectations of `save-coalescer.held-write.test.ts`, and `qa-8k2-failure-told.adversarial.test.ts:100`. **Owner:** the next developer of that module. **Trigger:** its next change of behaviour. The two-field shape was accepted at item 6 (ADR 0158 decision 3).

## 184. Rename `WaitingWrite` to `HeldWrite` — RECORDED 2026-10-12 AT M8 8K2's CLOSE

**Source [clean-code reviewer, relayed].** `WaitingWrite`, `adoptWaitingWrite`, `waitingWriteFor` and the local `waiting` name writes that do not wait. The rename touches QA-owned tests. **Owner:** with 183, or the test audit. **Trigger:** 183, or the M8 close audit (ADR 0152, Amendment A).

## 185. The re-export `export { isGreaterRevision }` in `hydrate-and-review.tsx:65` exists only for a `qa-*` pin — RECORDED 2026-10-12 AT M8 8K2's CLOSE

**Source [clean-code reviewer, relayed].** It is kept only for `tests/app/qa-8d-revision-order.adversarial.test.ts:7`; the function lives in `store/revision-order.ts`. QA repoints the test to the new path, then the re-export is deleted. **Owner:** QA, then the next developer. **Trigger:** the M8 close audit (ADR 0152, Amendment A), or QA's next touch of that file.

## 186. A held write that has outlived its limit wait still shows its past time until the next `runSave` — RECORDED 2026-10-12 AT M8 8K2's CLOSE

**Source [logic reviewer, finding 1, minor, relayed].** The same family as the recorded *paused until T* whose time has passed while the write waits behind another design's request (8G's sentence, older than 8K2). **Trigger:** Q38 answered, or a customer told a time that had passed.

## 187. No test drives `HydrateAndReview` with a held write in each of the four states — RECORDED 2026-10-12 AT M8 8K2's CLOSE

**Source [reviewers and the plan's point 4, relayed].** The review's half of 8K2's criterion 14 (the review in the state it is in when reached from the editor with that write in that state) was left out of QA's sweeps and is read, not run. **Owner:** wave 8L, with criterion 14. **Trigger:** 8L's dispatch.

## 188. 8K2's recorded limits and reports — RECORDED 2026-10-12 AT M8 8K2's CLOSE

**Source [the plan's 8K2 section and *as closed*; ADR 0158].** **K2.4's report:** the branch for a newer generation (`adoptNewerGeneration`) is reached in the application by nothing with a write held; seven tests that drive the coalescer directly reach it [developer-ran, relayed]. It stays; deleting it is an entry in ADR 0123's form. **Trigger:** a deletion proposed with its seven tests. **L1:** the older copy on the screen, locked, until the answer; measured 49 to 64 ms [QA-run, relayed]. **Trigger:** Q41 answered (b) or (c), or a measured time past one second. **L5:** while a request of this tab is out, another writer's newer copy is not shown; the `409` says it. **Trigger:** Q35's wave, or a customer's conflict they cannot place. **L6:** a design left while its save stands refused has its unsaved edit on the screen only; returning shows the stored one. **Trigger:** a customer's report of work lost after a conflict. **A frozen tab on a real phone:** not run; goes to 8T's phone gate as a line. **QA's two sweeps** (93 s and 106 s in the unit suite at round 2, then cut to a stated share with a floor per arm, the whole enumeration under `QA_8K2_WHOLE_SWEEP=1`): whether that form is kept is the M8 close audit's.

## 189. A malformed percent-escape in a path answers 500, not 400 — RECORDED 2026-10-12 AT M8 8L's CLOSE (security F4)

**Source [security reviewer, relayed; the scribe read nothing of the code].** `/ro/d/%E0%A4%A`, `/ro/s/…` and `/%E0…` answer **500** where a client error is right. next-intl returns `NextResponse.next()` without the nonce headers, so it is framework-wide, **predates 8L**, and leaks nothing. **Optional fix:** the proxy rejects a malformed escape with 400 before next-intl. **Trigger:** a proxy change, or M9's hardening.

## 190. `usePriceBookVersion()`, a version-only reader — RECORDED 2026-10-12 AT M8 8L's CLOSE (F5)

**Source [reviewer, relayed].** `contact/use-contact-submission.ts` needs only the book's version but sits on the price allow-list. A hook that returns the version alone would take it off the list. **Trigger:** the next change to the hook or the allow-list.

## 191. 8L's clean-code deferrals — RECORDED 2026-10-12 AT M8 8L's CLOSE

**Source [clean-code reviewer, relayed].** (1) A shared `HydrateStoredDesign` **when a third door appears** (two exist). (2) `use-contact-submission` reads the store through `getState`; pass a snapshot through `PressContext` instead. (3) **Not read in depth by the clean-code reviewer:** `contact-form.tsx` (531 lines), `contact-form-model`, `contact-answer`, `contact-request-identity`, `contact-outcome` (the line count is the coordinator's). **Owner:** the milestone test audit (ADR 0152 Amendment A) and 8T for (3). **Trigger:** the third door; the next change to the hook.

## 192. The locale switcher is 25 px high — RECORDED 2026-10-12 AT M8 8L's CLOSE

**Source [visual review, relayed].** Under the 44 px touch target; likely inherited from the mockup. **Owner:** the human, at the hand check; 8T's phone gate.

## 193. 8L's earlier deferred items, carried — RECORDED 2026-10-12 AT M8 8L's CLOSE

The discriminated-union hand-over type (**183**); `WaitingWrite` to `HeldWrite` (**184**); the security reviewer's F2 and F6, optional hardening (text in the security report; not re-read by the scribe). Triggers as recorded there.

## 194. 8L's unproven list — RECORDED 2026-10-12 AT M8 8L's CLOSE

**[relayed].** Real on-screen keyboard and real autofill (**8T's phone line**); a real `422` through the browser (only dom tests cover the does-not-fit screen); a send in flight when the customer leaves (accepted, ADR 0159 d2; 8M); e2e mutants not run (ADR 0155), one no-JS mutant ran against the callback page, which touches no database; about four leftover **test**-database rows from the visual verifier, ids unknown, nobody removes them (ADR 0151); one unexplained desktop flake, seen once, `u-gate-journeys.ts:374` (U7 S2), passed alone and on rerun. Also: the plan's point 9 repin list was incomplete (`qa-8d-review-scene.adversarial.e2e:378`, exit link count 2 to 1; `qa-8d-review-door.adversarial.e2e:362`, contact route 404 to 200); recorded in ADR 0159. Whether backlog 187 is closed was not verified by the scribe.

*Dated note, 2026-10-13 (8M's scribe; not verified): the 8M close could not confirm that 187's criterion 14 (b) table landed, so **187 stays open**; the next audit or reviewer who reads `HydrateAndReview`'s tests closes it or says what is missing. 193's security F2 and F6 text is in the 8L security report, which the 8M scribe was not given and did not read; the entry still says only "optional hardening".*

## 195. A whole-run e2e failure that passes alone: `qa-8d-review-scene.adversarial` line 189, the pixel-change test — RECORDED 2026-10-13 AT M8 8M's CLOSE

**Source [coordinator-ran, relayed].** In the whole `CI=1` e2e at `68cadbbe` (923 passed, 1 failed) this test measured 32757 changed pixels against a bound of at most 60; it passed 3 of 3 run alone. Read as load-dependent; **not proven**. **Trigger:** a second occurrence, or the M8 close audit (ADR 0152). Not on the list of three known intermittents in `ci-and-local-gates.md`.

## 196. No index serves `findSentReference`'s query — RECORDED 2026-10-13 AT M8 8M's CLOSE (security note)

**Source [security reviewer, relayed].** The read selects by design id and revision where `notified_at is not null`; the table has no index for it. Harmless at the present volume. **Remedy:** an **additive** migration if leads grow; **never an edit of `0008`**. **Trigger:** a slow `/done`, or contact requests numbering in the thousands.

*Dated note, 2026-10-14, at 8M2's close:* the design contact page is now a second caller of this read (ADR 0163 decision 5, Amendment A, A8). The trigger gains **a slow `/contact` or `/done`, and any `deadline` line** from this read. **The 300 ms deadline fired once in a whole e2e run** [relayed by the coordinator; see 240], so the trigger has been seen once. The deadline bounds the page's wait, not the database's work, and the scan is bounded by the interceptor's page limit only where a network source is named.

*Dated note, 2026-10-14, owner's decision (b):* the contact page's read deadline is raised from 300 ms to 2000 ms (`CONTACT_PAGE_READ_DEADLINE_MS`; ADR 0160 d5 note). CI run 38574379483 showed the 300 ms deadline firing on a loaded runner, so a customer who had already sent saw a fresh form. The missing index is unchanged; the `deadline`-line trigger above still applies.

## 197. The sent request's typed phone or e-mail stays in tab memory until a reload or the next design form — RECORDED 2026-10-13 AT M8 8M's CLOSE (security note)

**Source [security reviewer, relayed].** ADR 0160 decision 4; not a defect by the plan's ruling (8M.2). **Optional hardening:** clear the entry when the done screen unmounts (a language switch or Back then Forward would then lose the number on 5A, which 8M.2 chose to keep). **Owner:** the architect, with the owner if the trade is wanted.

## 198. An import cycle between `contact/` and `done/` — RECORDED 2026-10-13 AT M8 8M's CLOSE (clean-code)

**Source [clean-code reviewer, relayed].** `ChannelSummary`, `ResultHeading` and `ReviewLink` are shared by both folders. **Remedy:** move them to a neutral module. **Trigger:** the next change to either folder, or the M8 close audit.

*Dated note, 2026-10-14, at 8M2's close [relayed by the coordinator]:* `SentReferenceAnswer` lives in `@/done/result-to-show` and is used from the contact side, so the cycle gains a type that belongs in the same neutral module. Same remedy and trigger.

## 199. Comments that cite plan numbers, and long file headers — RECORDED 2026-10-13 AT M8 8M's CLOSE (clean-code)

**Source [clean-code reviewer, relayed].** Comments naming `8M.3` and similar, and headers longer than ADR 0136 allows. **Remedy:** the comment diet of ADR 0136. **Trigger:** the M8 close audit.

## 200. 8M's long hooks and components, near-duplicates and names — RECORDED 2026-10-13 AT M8 8M's CLOSE (clean-code)

**Source [clean-code reviewer, relayed].** `useContactSubmission` and `WhatsappActionControl` are long (the latter should become a hook plus a component); two `*BackLink` components are near-duplicates; naming: `PhaseBesideForm.kind: failed`, and `isUnanswered` against `hasUnansweredSend`. **Trigger:** the next change to those files, or the M8 close audit.

## 201. A visible focus ring on the `h1` after a reload or in the no-request view — RECORDED 2026-10-13 AT M8 8M's CLOSE (visual)

**Source [visual reviewer, 390 x 844, relayed].** The programmatic focus of 8M.12 draws a ring that is conspicuous on touch. **Remedy:** a decision on `:focus-visible` for a programmatically focused heading. **Owner:** the human, at the hand check or 8T.

## 202. The no-request view's heading looks unstyled against 5A — RECORDED 2026-10-13 AT M8 8M's CLOSE (visual)

**Source [visual reviewer, relayed].** It wraps over three lines and has no check mark and no back link, unlike 5A. No frame draws this view (8M.6 case 3). **Owner:** the human, with the copy approvals.

## 203. The interim line's look, and its wording for an already-sent request — RECORDED 2026-10-13 AT M8 8M's CLOSE (visual, logic)

**Source [visual and logic reviewers, relayed].** Between the `200` and `/done`, `contact.sendingLine` (QA's F1 fix) is a small grey 12 px sentence on an otherwise blank page; no mockup frame draws it. The logic reviewer finds the words wrong for a request already sent and recommends **a new leaf `contact.leavingLine`**, ro *"Se deschide confirmarea…"*, ru *"Открываем подтверждение…"*. **Not added: the owner approves copy.**

## 204. Contrast of the 10.5 px *Număr cerere* label is unmeasured — RECORDED 2026-10-13 AT M8 8M's CLOSE (visual)

**Source [visual reviewer, relayed].** Not measured. **Trigger:** 8T, or the hand check. Also seen: *Copiat* sits beside *Copiază* for two seconds; the offline line is far from the retry.

## 205. WhatsApp action: no spoken *busy* leaf, and the *go on* label reuses `share.reissue` — RECORDED 2026-10-13 AT M8 8M's CLOSE

**Source [8M's reviews, relayed; the exact finding text was not given to the scribe].** The action has no spoken *busy* state of its own, and its *go on* label reuses `share.reissue`. **Owner:** the copy approval (a new leaf is a copy decision). **Trigger:** the owner's copy pass.

## 206. 8M's logic notes: F2, F3, the not-sent wording, revision drift — RECORDED 2026-10-13 AT M8 8M's CLOSE

**Source [logic reviewer, relayed].** **F2:** an `online` event spent on an in-flight retry that then gets no answer leaves 5B's note promising an automatic retry that will not come; acceptable, no timer; **8T's phone gate gains a line.** **F3:** after a reload of `/done` the WhatsApp action is absent (`canWrite` is *checking*), as criterion 18 reads; a product gap; passing `canWrite: true` from the `/done` hydrator needs a dated amendment (**owner question**). The not-sent sentence is told for every answered failure, including a `200` whose body was lost (the owner may want it softer). After a second-tab save `/done` shows the no-request view, by design.

## 207. Addresses whose last segment looks like a file answer a `404` with no CSP — RECORDED 2026-10-13 AT M8 8Q's CLOSE — LOW

**Source [8Q S1 and QA, relayed].** `/ro/zz.png`, `/ro/configurator/zz.svg` and `/_next/static/zz.js` answer `404` `text/html` and carry no `Content-Security-Policy`, because the `proxy.ts` matcher skips a last segment with an extension. The flip does not change it, and the body is a text-only not-found (ADR 0161 decision 6 recorded it). **Remedy:** narrow the matcher, or a static restrictive policy through `next.config` `headers()` that excludes the design and share paths. **Severity:** Low. **Trigger:** the next change to `proxy.ts`, or M9.

## 208. `/ro/%` answers `500` — RECORDED 2026-10-13 AT M8 8Q's CLOSE

**Source [8Q QA, relayed; not diagnosed].** A malformed percent-escape as the only segment under a locale answers `500`. **Trigger:** the next change to routing or the catch-all.

## 209. F5: the `proxy.ts` matcher and the request body size — RECORDED 2026-10-13 AT M8 8Q's CLOSE (security)

**Source [security reviewer, relayed; the finding's text was not given to the scribe beyond its label].** Recorded as F5 against the matcher of `proxy.ts` and the body size of the report route (8 KiB, read on the stream, ADR 0161 decision 2). **Trigger:** the next change to `proxy.ts`, or M9.

## 210. F6: a database write per refused CSP report request — RECORDED 2026-10-13 AT M8 8Q's CLOSE (security)

**Source [security reviewer, relayed].** Every correctly-typed `POST` is a counter write, a `429` included (ADR 0161 Amendment B, point 1), so a flood of refusals is one write each. **Remedy, optional:** an `Origin` pre-check before counting (ADR 0161 declined an `Origin` gate; this would reopen it as a cost cut, not as authentication), and a firewall rule in M9 (ADR 0019 d2). **Trigger:** M9, the host.

## 211. A cold-start `503` flake in the mint and contact specs — RECORDED 2026-10-13 AT M8 8Q's CLOSE (QA)

**Source [8Q QA, relayed].** Five specs of the mint and contact families fail with a `503` on a cold server in a whole run and pass alone. Not diagnosed beyond that. **Trigger:** a second occurrence, or the M8 close audit (see backlog 195).

## 212. The `csp-report-limited` line is memoised per instance — RECORDED 2026-10-13 AT M8 8Q's CLOSE

**Source [ADR 0161 F1].** The once-an-hour memo is one module-level number, so a host running several instances writes one line per instance an hour. **Trigger:** M9, once the host and its instance count are known.

## 213. A report's `origin` may read `foreign` behind a TLS terminator — RECORDED 2026-10-13 AT M8 8Q's CLOSE

**Source [inference, ADR 0161 F2].** `origin` compares the report's `document-uri` origin with `new URL(request.url).origin`; behind a terminator the request's own scheme may differ. **Falsified by:** a real report on the real host reading `own`. **Trigger:** the first deployment that carries the flip; 8T's TLS host check.

## 214. The domain package declares no `sideEffects` field — RECORDED 2026-10-13 AT M8 8Q's CLOSE

**Source [8Q review, relayed].** `packages/configurator-domain/package.json` has no `sideEffects` field. Adding `"sideEffects": false` would let a bundler skip `zod-without-eval.ts`, whose only job is its module-scope `z.config({ jitless: true })` (ADR 0161 decision 9). **Rule until then:** do not add it, or list that file. **Trigger:** anyone touching that field.

## 215. The unmatched-address sweep exempts more than the matcher skips — RECORDED 2026-10-13 AT M8 8Q's CLOSE (QA)

**Source [8Q QA, relayed].** The sweep spec exempts any last segment matching `/\.[A-Za-z0-9]{1,8}$/`, broader than `proxy.ts`'s matcher, so an address the matcher covers could slip the sweep. **Trigger:** with backlog 207.

## 216. The lint rule against a direct `"zod"` import misses a dynamic `import("zod")` — RECORDED 2026-10-13 AT M8 8Q's CLOSE

**Source [8Q review, relayed].** ADR 0161 decision 9's rule refuses a static import elsewhere under the domain's `src/`; a dynamic `import("zod")` is not caught. **Trigger:** the next change to that lint rule.

## 217. The summary-card thumbnail is a striped placeholder on a fresh design — RECORDED 2026-10-13 AT M8 8Q's CLOSE (visual) — LOW, UNVERIFIED

**Source [8Q's light visual check, 390×844, relayed by the coordinator].** An observation, **not verified as a defect**: it may be the intended empty state. Not checked against the mockups. **Trigger:** 8T's visual reading.

## 218. The ru top-bar title truncates to "Конфигур…" at 390 px — RECORDED 2026-10-13 AT M8 8Q's CLOSE (visual) — LOW, UNVERIFIED

**Source [8Q's light visual check, 390×844, relayed by the coordinator].** An observation, **not verified as a defect**: the width of the ru string against the mockup was not compared. **Trigger:** 8T's phone gate, Russian.

## 219. The CSP report sink becomes a table in our own database — OWNER RULED 2026-10-13 (Q46 = (c)), NOT BUILT; SCHEDULED IN WAVE 8Q2
**Update, 2026-10-13, later [coordinator, relayed]: scheduled in wave 8Q2, in M8 before 8T, which overrides the M9 trigger below.** Plan `docs/milestones/done/8Q2-csp-report-table.md`; ADR 0162 (Proposed). The cap is 10,000 reports with no age delete and the log line kept (Q50 to Q54, defaults). The text below is kept as recorded.

**Update, 2026-10-14, at 8Q2's close [scribe]: built.** ADR 0162 is Accepted (Amendment A) and ADR 0161 has Amendment C; the cap, the writer mark and the runbook shipped. **Still open, owner actions:** `0009` and its two grants on preview and production (applied on the test database only). Leftovers from the build are 228 to 233.

**Source [owner's ruling, relayed by the coordinator].** The owner's reason: the host may not end up on Vercel, so the server log is not a durable sink. 8Q built (a), the log ([ADR 0161](../decisions/0161-the-csp-enforces-its-violations-reach-the-applications-own-counted-endpoint-and-the-mode-stays-one-versioned-constant.md)); this replaces or supplements it. **What it needs:**
- a **migration and a grant**, both **owner actions**; env vars and provisioned resources stay add-only (ADR 0155's rules; `docs/best-practices/environments-and-resources.md`), and a new migration never edits an applied one;
- **a dated amendment to ADR 0161 when built** (decision 2's *"nothing is stored but the limiter's counter"* and decision 3 change);
- **a retention and size cap, undecided.** No table in this project has a retention horizon by default (ADR 0019 d7's retirement), so a report table needs its own bound, or a flood of reports grows it without limit; the limiter's 100 an hour per network block bounds the rate, not the total;
- **the sink keeps its reduced closed-value record shape** (decision 3): nothing personal, no `document-uri`, no address, no user agent. Also decide what the `origin` field's unauthenticated status (Amendment B) means for rows read later.
**Owner:** the human, for the migration and the grant; the architect, for the cap. ~~**Trigger:** M9, when the host is chosen.~~ **Trigger:** wave 8Q2.

## 220. H1 — the contact answer's unreadable-wait 60 s is pinned only against its own constant — RECORDED 2026-10-13 BY THE M8 TEST AUDIT (held)

**Source [audit, `docs/test-audits/2026-10-13-m8-review-contact-success.md`, H1].** `contact-answer.ts:84` `UNREADABLE_CONTACT_WAIT_SECONDS = 60` to `61`: the whole web suite stayed green, though the mapping itself is guarded. No dated decision in ADR 0157, 0159 or the plan fixes 60 s. **Needs:** a ruling that 60 s is required, and then a pin (ADR 0152 decision 1.4), which would make it a fourth "cannot fail" row. **Trigger:** the next audit, or that ruling.

## 221 to 227. Unguarded behaviour noticed by the M8 test audit — RECORDED 2026-10-13 (not test findings)

**Source [audit, section *Unguarded behaviour noticed*; each is a production line nothing reddens, for the coordinator's choice].** One backlog number per row of that table, in its order:
- **221.** `lib/server/contact/prepare-submission.ts:88` (`NO_CABINET` branch inverted; a design with no cabinet should be refused as "not current", 409, and no web unit test reaches it) and `:90` (`PRICING_VERSION_MISMATCH` mapped to the wrong cause; unreachable in the tests behind `requireTheBooksVersion`).
- **222.** `lib/server/contact/submit-contact.ts:303` (`channel === "email" && email !== undefined`, `&&` to `||`).
- **223.** `lib/server/contact/contact-log.ts:54,195,196` (the HTTP status bounds 100 and 599 made exclusive; the test pins 0, 99 and 600, never a kept 100 or 599).
- **224.** `lib/server/rate-limit/chisinau-day.ts:13,66,109`, `enforce-rate-limit.ts:138-139`, `prune-rate-limits.ts:130` (the second offset-correction pass, the unreadable-clock-part guard, the timer-deadline bounds, the prune's day step).
- **225.** Seven sites whose mutants survived a related run only (373 to 4,538 tests) and were not re-run against the whole suite: `contact/retry-when-online.ts:63`, `contact/contact-form.tsx:510`, `review/*prefetch={false}` (3 files; only the contact and done directories are scanned), `review/review-scene.tsx:20`, `i18n/content.ts:345`, `app/configurator/configure/use-back-guard.ts:38`, `store/apply-command-result.ts:140`.
- **226.** `lib/server/rate-limit/client-network.ts`: `LONGEST_ADDRESS_TEXT` (45, 46) is dead code (no text above 45 characters can parse); the head of a compressed address and `isTextOfBlockKind`'s `typeof` guard are cases the truth table lacks.
- **227.** `scripts/gates/boundary.sh`: a `git grep` failure (exit above 1) is treated as clean; `boundary.test.mjs` never makes `git grep` fail.
**Trigger:** the next audit, or a change to any of those files.

## 228. A whole-run e2e failure that passes alone: `global-colour.e2e.spec.ts` lines 208 and 230, `storedColour` read empty — RECORDED 2026-10-14 AT M8 8Q2's CLOSE

**Source [coordinator-ran, relayed].** In the whole `CI=1` e2e at 8Q2's close (1024 passed, 2 failed) these two tests read an empty `storedColour`; both passed 7 of 7 run alone. Read as load-dependent; **not proven**. **Trigger:** a second occurrence, or the M8 close audit (ADR 0152). Same style as 195.

## 229. The live pattern differential costs 28 s per persistence live run — RECORDED 2026-10-14 AT M8 8Q2's CLOSE (QA note)

**Source [QA, relayed].** The differential over all Unicode scalars (read-only selects on the test database) takes about 28 s each time the persistence live tests run. **Trigger:** the live run becomes the slow gate, or a persistence run is split by speed.

## 230. Second-server report rows are bounded only by the sink spec — RECORDED 2026-10-14 AT M8 8Q2's CLOSE (QA note)

**Source [QA, relayed].** The rows that QA's second servers store are bounded only by what the sink spec sends (the teardown removed the 9 second servers' 131 rows by writer mark). **Trigger:** a spec that starts a second server and sends more reports.

## 231. `requireValidCspReportPlacement` and its three QA-owned cases could be deleted outright — RECORDED 2026-10-14 AT M8 8Q2's CLOSE (QA edit)

**Source [QA, relayed].** The function stays internal (ADR 0162 Amendment A, point 9); nothing outside it needs it, so it and its three cases could go. **Trigger:** the next change to the store's validation, or the next audit.

## 232. Four persistence live files fail at collection when every database variable is blanked — RECORDED 2026-10-14 AT M8 8Q2's CLOSE (QA note)

**Source [QA, relayed].** The failure comes from `neon('')` in a `describe` body: a pre-existing pattern, not new in 8Q2. **Trigger:** a change to how the live files read their environment, or the next audit.

**Dated note, 2026-10-17 [relayed by the coordinator at the 8J2 / 8U / 8V close].** Reported again: four persistence live files that call `neon()` at `describe` scope fail to **load**
when the connection variables are emptied. So the non-live recipe in `best-practices/ci-and-local-gates.md:449-451` (*"empty the three
connection variables … a live file then skips"*, measured 2026-09-23) **does not hold for these files**; that guide carries a dated note.
**Owner action:** move the `neon()` call inside a hook or behind the live gate, file by file, in a test-hygiene pass or the M8 audit. The
four file names were not relayed to the scribe.

## 233. The `lock_timeout` of the store is not tested with a real contending lock — RECORDED 2026-10-14 AT M8 8Q2's CLOSE

**Source [coordinator, relayed].** The 1000 ms `lock_timeout` and 2500 ms `statement_timeout` (ADR 0162 Amendment A, point 1) have no test that holds the cursor row lock from a second connection and watches the store give up (the coordinator's list; how they are pinned today was not read here). **Trigger:** a change to the store, or the next audit.

## 234. `contact_submissions` rows leak on the test database: one `ro` and one `ru` row per multi-spec e2e invocation — RECORDED 2026-10-14 AT M8 8M2's CLOSE

**Source [relayed by the coordinator; the scribe ran nothing].** Each e2e invocation that runs more than one spec leaves one `ro` and one `ru` contact row on the test database. **The spec that writes them is not known.** Pre-existing, not new in 8M2; **30 rows** were counted [relayed; the query was not given to the scribe]. Not removed (ADR 0151). **Owner:** the human may clear them; the finding of the spec is open. **Trigger:** the next teardown change, or the M8 close audit. Same class as the writer-mark teardown of 8Q2 (ADR 0162 Amendment A, point 6).

## 235. The launch gate refuses only the exact placeholder, and `deploy.yml`'s gate is not Vercel's — RECORDED 2026-10-14 AT M8 8M2's CLOSE

**Source [relayed by the coordinator].** `isLaunchReadyShopPhone` is false only for `+37300000000` and for a value that is not its own accepted normal form; **any other valid number passes**, so a wrong real number is not caught by the gate (ADR 0163 decision 2). The production-only step in `deploy.yml` runs in a workflow that is manual and inert; **Vercel's Git integration is the real deploy path** [doc: ADR 0163 decision 2, from the workflow's header]. **The launch checklist line (`pnpm gate:launch-placeholders` exits 0, quoted) is therefore the operative gate.** **Trigger:** the owner gives Q3's number, or the M9 host is chosen.

## 236. `deploy.yml` F1 (Low): the gate step runs build tools with `MIGRATION_DATABASE_URL` in its environment — RECORDED 2026-10-14 AT M8 8M2's CLOSE

**Source [review finding, relayed by the coordinator].** The gate step runs build tools while `MIGRATION_DATABASE_URL` is in its environment. **Remedy proposed:** a separate job with no secrets for the gate. **Owner: not yet answered.** Nothing changed (add-only rule for environments). **Trigger:** the owner's answer, or the workflow being switched on.

## 237. Romanian leaf `panel.accessUncheckableNotice` has a typo, "poți modifică" — RECORDED 2026-10-14 AT M8 8M2's CLOSE

**Source [relayed by the coordinator].** The text reads *"poți modifică"*. **The fix needs the owner's sign-off** (copy is the owner's to approve). **Trigger:** the next copy round.

## 238. The already-sent `h1` is 22 px against the frame's 24 px, and its focus ring touches the glyph edges — RECORDED 2026-10-14 AT M8 8M2's CLOSE (visual)

**Source [coordinator visual check, relayed; emulated Chromium at 390 x 844].** The size was judged fine in the check. On the 22 px heading the programmatic focus ring touches the glyph edges (cosmetic). Related to 201. **Owner:** the human, at the hand check or 8T.

## 239. The register test is a word list plus a suffix advisory — RECORDED 2026-10-14 AT M8 8M2's CLOSE

**Source [relayed by the coordinator; the fix-up `b25847f2` subject names a "suffix register check"].** The *tu* / *ты* test (ADR 0163 decision 10) holds a per-language list of explicit formal tokens and a suffix **advisory**, not a proof. A formal form outside the list passes. **Trigger:** a formal word found in shipped copy, or the copy re-sign.

## 240. The contact page's 300 ms read deadline fired once in a whole e2e run — RECORDED 2026-10-14 AT M8 8M2's CLOSE

**Source [coordinator, relayed; which spec and which run were not given to the scribe].** In a whole e2e run the deadline of ADR 0163 Amendment A (A8) fired once, so one test saw the form where it expected the view (plan risk 10 predicted exactly this). The figure is **not loosened**; a change of the figure is a dated amendment. It is also a trigger for 196. **Trigger:** a second occurrence, a `deadline` line from a real host, or a slow `/contact`.

## 241. One very long unbroken Russian word was not verified visually — RECORDED 2026-10-14 AT M8 8M2's CLOSE (visual)

**Source [coordinator, relayed].** The review fix-up made the already-sent heading wrap long words (`b25847f2`, subject). A single very long unbroken Russian word was **not** looked at in a browser. **Owner:** 8T or the hand check.

## 242. Not verified visually in 8M2: the phone and e-mail done-screen variants, and the keyboard open — RECORDED 2026-10-14 AT M8 8M2's CLOSE (visual)

**Source [coordinator, relayed].** The visual check covered the screens listed in the 8M2 close. The *Telefon* and *E-mail* variants of the done screen and any screen with the on-screen keyboard open were not seen. **Owner:** 8T, on a real phone.

## 243. A cabinet-depth round trip drifts the recorded depth of occupied columns — RECORDED 2026-10-17 AT M8 8U's CLOSE (pre-existing; customer-visible under 8U)

**Evidence [src: `packages/configurator-domain/tests/commands/set-cabinet-depth.round-trip-drift.known-defect.test.ts`].** In the owner's room (L 4100 × 3300 × 2600, composed at the 600 mm default), `setCabinetDepth` 600 → 700 → 600 through the store's reconcile leaves the fridge column `B|2.45` published at **742 mm** and the oven-tower column `A|3.30` at **638 mm**, both **620** before (`:42-51`). Clearing the wall-B run around the fridge then gives three spaces, `1800 w600 d620`, `2450 w700 d742`, `3000 w400 d620`, where the fresh kitchen gives one, `2350 w1700 d620` (`:54-67`). The drift predates 8U; under 8U's uncapped merge (ADR 0166) the customer sees it as one 1700 space becoming three. It is also how a customer reaches backlog 246's stepped chain. **Trigger:** now (customer-reachable). **Owner action:** a domain wave that restores the recorded depth on the way back (ADR 0088/0090's depth chain), then restate the witness as *"the round trip restores 620"* (its header says so). No wave owns it.

## 244. An offered width chip grows a base beside a U's right corner into the corner base — RECORDED 2026-10-17 AT M8 8U's CLOSE (pre-existing)

**Evidence [src: `packages/configurator-domain/tests/merge-empty-columns.editor-sequences.property.test.ts:78`, `:311-313`, `:439`].** A known-defect witness, *"an offered chip grows a base beside the U's right corner into the corner base"*: the width-funding path offers a step that, taken, overlaps the right corner base, and the result is a design the validator will not save. The property's seed is pinned so the run does not land on it by chance (`:78`; *"some seeds (e.g. -2113359913) reach the width-funding defect"*). Pre-existing width funding, found by 8U's sequences. **Trigger:** now (an offered chip). **Owner action:** a domain fix in the width-funding planner so a chip is never offered over a corner piece (ADR 0034: the offer list and the command share one judge); then the witness flips. No wave owns it.

## 245. An odd-width stored opening offers rows the insert then refuses — RECORDED 2026-10-17 AT M8 8U's CLOSE (known limit, 8U R13)

**Evidence [doc: the 8U plan §6.2; ADR 0166 decision 7; src: `tests/merge-empty-columns.odd-width-known-limit.test.ts`, its title constant *"8U §6.2 / R13 known limit"*].** In an opening on half-mm edges (801, 1201, 2001 for `'fit'` rows; 701, 799 for fixed-set rows), `offersFor` lists rows that `insertBody` refuses with `NON_INTEGER_MILLIMETRES`: the flush-left seat lands on a half millimetre. Only a stored document can hold such an opening; no command produces one (criterion 3a's property). **Trigger:** criterion 3a failing; any producer of an odd-width column; a stored production document holding one. **Owner action / remedy:** move the seat's whole-mm check into `evaluateInsertFit`'s seating so the offer list and the command share one judge (ADR 0034), and write §9's empty sentence for an odd opening that then offers nothing. Alternative remedy: refuse odd-width columns at the write seam (a security-reader change).

## 246. A tolerance chain's merge depends on the clear order, and a member can lose over 20 mm — RECORDED 2026-10-17 AT M8 8U's CLOSE (known limit, 8U R14; owner ruled, not built)

**Evidence [doc: the 8U plan §6.3; ADR 0166 decision 8; src: `tests/merge-empty-columns.fixpoint-and-order.test.ts`, title constant *"8U §6.3 known limit (R14)"*].** Agreement is pairwise within 20 mm and not transitive. Depths 620 / 600 / 580 (or tops 2600 / 2580 / 2560) cleared right pair first give two columns; other orders give one at 580, costing the 620 member 40 mm. **Reachable by a customer:** a reviewer found that S4b's *"census 0"* never drove `setCabinetDepth`, and depth changes produce stepped chains (with backlog 243's drift) [relayed]. **Owner ruling:** Q-8U-3 = (a), *always one space* [relayed, 2026-10-17]. **Not built:** S4b changed comments only. **Trigger:** the owner schedules (a)'s build — when is not ruled; until then it is a recorded known limit. **Owner action then:** a domain wave that carries each merged column's member interval through `ColumnExtent` and `emptyColumns` (an optional schema field, with a security reader on the write seam), per the plan §6.3's option (a); then the per-order pins and the two `it.fails` flip.

## 247. The 800 + 100 spaces above each U corner stay two — RECORDED 2026-10-17 AT M8 8U's CLOSE (F2; owner ruled Q-8U-2 = (a))

**Evidence [doc: the 8U plan §4.1–§4.2; ADR 0166 decision 6].** The merged 900 would stand over the corner base's own stretch of wall, so the key guard and the same-stretch guard decline it, in every U at any width. The owner chose to keep them two [relayed]. **Trigger:** the owner asks for one 900 space (Q-8U-2 (b)). **Owner action then:** a corner-ownership design under ADR 0118, with the plan's §4.1 as its trigger; its likely cost is a wall cabinet centred over the corner with 50 mm unusable each side [inf, plan].

## 248. The shell trims the upper row 1 mm in odd-width rooms — RECORDED 2026-10-17 AT M8 8U's CLOSE (8U R12; pre-existing)

**Evidence [doc: the 8U plan §4.2, R12].** In U 5985 / 3000 / 3000, the right corner's upper row runs 5084–5984 against the corner base's 5085–5985. It moved the merged key one bucket and let the key guard miss (fixed by S3b's geometric guard, so it no longer changes a merge). **Trigger:** any rule that compares the upper row's edge with the base's exactly. **Owner action:** an ADR 0110 *Correction 2026-09-13* question; fixing it moves generated maps in every odd room, so it needs its own census.

## 249. `qa-5b4b` "merges four abutting 200s into one 800, not into two 400s" cannot fail for its title's reason — RECORDED 2026-10-17 AT M8 8U's CLOSE — BLOCKS M8's CLOSE

**Evidence [src: `packages/configurator-domain/tests/qa-5b4b.adversarial.test.ts:141`; relayed: the reviewer's finding].** The title names the 800 mm cap's greedy split (one 800, not two 400s). Under the uncapped merge four abutting 200s are one 800 whatever the split rule [inf], so the test cannot fail for the reason its title names (ADR 0152). **A "cannot fail" finding keeps the milestone open** (ADR 0152 Amendment A). **Owner action:** the M8 test auditor retitles it to what it now protects or deletes it on evidence, before M8 is marked Done.

## 250. A retry under the same price-book version re-prices from the live book — RECORDED 2026-10-17 AT M8 8V's REVIEW (pre-existing)

**Evidence [relayed: the 8V logic review].** A retried delivery prepares the design again (8V plan F9) and prices it from the live book. If the book's amounts change without its version, the retry's notice can show a different figure from the first attempt; the version check (ADR 0157) does not catch it (cf. K-S1.7, backlog 181). **Trigger:** a deployment that changes amounts without the version while an un-notified request waits. **Owner action:** the fix needs the stored `priced` snapshot read back for the retry, which the application role cannot read (ADR 0153); so it is a grant decision (the old Q40 (a)) or a version discipline in the price-book release process.

## 251. A Romanian plural without "de" — RECORDED 2026-10-17 AT M8 8V's REVIEW — KEPT BY RULING

**Evidence [relayed; doc: `best-practices/engineering-conventions.md:102`].** A reviewer flagged a count written as the bare noun. The owner ruled on 2026-09-10, *"without «de» on plural"*, so the bare noun is correct. **No action** unless the owner reopens the ruling. Recorded so the next reviewer does not re-raise it.

## 252. `migrate-design.ts:255-257`'s comment says an odd-width v1 entry is refused; since 8U it loads whole — RECORDED 2026-10-17 AT M8 8U's REVIEW

**Evidence [src: `packages/configurator-domain/src/migrate-design.ts:253-257`; relayed].** The comment says a split whose pieces would not land on whole millimetres *"goes forward for the validator to refuse"*. Since 8U, an oversize odd-width v1 entry is **not** refused: it loads as one entry [relayed; that S1's retirement of `EMPTY_COLUMN_WIDER_THAN_CAP` is the cause is the scribe's inference]. The code is right; the comment is false. **Owner action:** a developer corrects the comment (no behaviour). **Trigger:** the next edit of the file.

## 253. `ContactPageView`'s already-sent arm carries a sent-reference field nothing reads — RECORDED 2026-10-17 AT M8 8V's REVIEW

**Evidence [relayed: the 8V clean-code review].** Since 8V D2 the already-sent view draws no reference, but the view model's already-sent arm still carries it. Dead data, no behaviour. **Owner action:** a developer removes the field and its producer (and any test that asserts it, under ADR 0152). **Trigger:** the next change to the contact page's view model.

## 254. Until `0010` and its grant are applied, the notice says "link unavailable" and an unknown share token answers 500 — RECORDED 2026-10-17 AT M8 8V's CLOSE (owner step)

**Evidence [doc: the 8V plan risk 3; the runbook's `0010` section].** Without `contact_submission_views`, `record` fails, so every notice is sent with the *link unavailable* line (by design, ADR 0165 D4); and the `/s/{token}` page's second lookup throws on the missing table, so every unknown or revoked share token answers 500 instead of not-found (deliberate: a deployment error to see). **Trigger:** a deploy of this branch to an environment. **Owner action:** apply `0010` and the one grant, preview then production, **before** the code ships there ([runbook](../runbooks/applying-a-table-migration-and-its-application-role-grant.md)).

## 255. 8U S5 is not built: the commands still cut empty space at 800 — RECORDED 2026-10-17 AT M8 8U's CLOSE

**Evidence [doc: the 8U plan §11, S5 row; ADR 0166 *Consequences*].** `insertBody`'s remainder split (`splitColumn` via `splitEmptySpanAtCap`) and `setWidth`'s shrink overflow still cut at `MAX_EMPTY_COLUMN_WIDTH_MM` (800); `splitOversizedEmptyColumns` is still in the reconcile; the reconcile's uncapped merge rejoins every piece, so a customer sees no seam. Behaviour-free to remove. **Trigger:** the next change to those commands, or a test that judges a command's own effect (the 8U criterion 8 note). **Owner action:** a developer runs S5 as the plan's row writes it (re-run S3's composition cut count first; rename the constant to the v1 arm's; repoint three tests at `COMPOSITION_WIDTH_LIMIT_MM`).

## 256. The mobile camera preset crops the run ends on long walls, so a fill or tall block at a run end needs a manual zoom-out — RECORDED 2026-10-17 AT M8C F1b

**Evidence [visual check, synthetic touch only].** On straight 4100 and 6000 and on L 3560x4250 wall B, the mobile camera preset's framing crops the run ends. **Not checked whether it predates F1b** [unverified]. Related to entries 16 and 25. **Trigger:** the next change to the camera presets, or entry 16's hand check. **Owner:** unassigned.

## 257. The room form rejects a straight wall of 6100 ("A prea lung", limit 6000): the M8C plan's 6100 witness cannot be entered — RECORDED 2026-10-17 AT M8C F1b

**Evidence [visual check, executed].** The form refuses 6100 with "A prea lung" (limit 6000). The M8C plan's 6100 witness is unenterable through the form; it can only be exercised below the form (domain or stored design). **Trigger:** the next use of that witness. **Owner:** unassigned.

## 258. No committed test exercises O10 and the fill acting together — RECORDED 2026-10-17 AT M8C F1b

**Evidence [source-verified by the F1b report; not re-read here].** `qa-c5s1` and `qa-c5s2` now run with the fill off, so nothing committed has O10 and the fill acting in one room. **Trigger / owner:** to be covered by option C's one committed property (ADR 0168).

## 259. E2e support-file comments still describe bare remainders — RECORDED 2026-10-17 AT M8C F1b

**Evidence [reported, prose only].** The test-support comments in the e2e support files (for example `qa-u5-cutaway.ts`) still describe bare remainders, which the fill now closes at 200 mm or more. Comments only; no behaviour. **Trigger:** the next edit to those files.

## 260. A comment in `generation-model.ts` about a 900x2200 room reading "nu poate fi inclus" may be stale — RECORDED 2026-10-17 AT M8C F1b

**Evidence [inference, unverified].** Step 1F's *Depozitare* row now reads placed in more rooms because the fill is a storage-role step (plan §2.4). The comment in `apps/web/src/room/generation-model.ts` about a 900x2200 room is **not confirmed stale**; nobody re-ran that room. **Trigger:** check the room's row and fix or confirm the comment.

## 261. DOM-003's deferred clean-ups in the width commands — LOW, RECORDED 2026-10-18 FROM THE DOM-003 PLAN

**Evidence [doc: the dom-003 plan's deferred follow-ups, relayed by the coordinator; not re-read in source here].** Four low-priority items, none a behaviour change, all sourced to the dom-003 plan (`docs/milestones/done/dom-003-set-width-split.md`). (1) Narrow `SetWidthInput` on the `plan-width-funding.ts` phase functions, so each takes only the fields it reads. (2) Fold `commands/along-wall.ts` into a shared export; `module-grid.ts` now holds `alongWallCoordinate` and `alongWallPosition`. (3) The `fundingScan` comment is stricter than the code it describes (low). (4) `columnWidthChoices` has a body of about 35 lines [as reported by the analyst]. **Trigger:** the next edit to the width commands. **Owner:** unassigned.

## 262. Back from 1D, 1E or 1F lands on 1A — PRE-EXISTING, A PRODUCT QUESTION, RECORDED 2026-10-18 AT M8C CLOSE-OUT

**Evidence [source-verified by an agent, relayed].** `departTo("presets")` pushes no history entry, so hardware Back from 1D, 1E or 1F lands on 1A (ADR 0139 decision 3's claim to the contrary is corrected by a dated note). Not introduced by M8C. **Trigger:** the owner decides whether Back should step through Step 1's sub-states. **Owner:** the owner.

## 263. Frame 1E mock-up deviations: no count line, no price or chips on the cards — RECORDED 2026-10-18 AT M8C CLOSE-OUT; RESOLVED BY DECISION 2026-10-18 (v2 MOCKUP); DELIVERY IN M8D W1

**Evidence [relayed, not re-read].** The shipped preset cards (P8) omit the count line and the price and chips that the 1E mock-up shows. **Trigger:** the owner reviews 1E against the mock-up. **Owner:** unassigned.

**Resolution [doc: M8D plan §6, §12 and ADR 0104 Amendment G; nothing built or run by the scribe].** The owner's v2 mockup replaces frame 1E: its card has the image, the name, an optional adjusted note and one button, with no price, counts or chips (*"Fără preț, chipuri sau „Folosește""*). The shipped cards' omission is therefore the specified design, not a deviation, and the card is reworked to v2's column layout in M8D wave W1 (`docs/milestones/M8D-preset-screens-to-mockup.md`). The entry stays in this file, not `resolved.md`, until W1 ships (resolved.md holds only what is fixed and shipped); move it then. **Owner:** M8D.

## 264. `identifierSchema` character sets — A DOMAIN WAVE, RECORDED 2026-10-18 AT M8C CLOSE-OUT

**Evidence [relayed; the detail is not in the brief].** The coordinator lists the character sets of `identifierSchema` as needing a domain wave. The scribe has no further detail; ask the coordinator before planning. **Owner:** unassigned.

## 265. An in-flight mint after Înapoi from 1F still completes — PRE-EXISTING, OBSERVED ONCE, RECORDED 2026-10-18 AT M8C CLOSE-OUT

**Evidence [relayed: observed once; not reproduced].** After the customer taps Înapoi from 1F, a mint already in flight completes. Related to ADR 0139 decision 10. **Trigger:** a second sighting, or the Back-history decision (262). **Owner:** unassigned.

## 266. Desktop e2e shard 2 is at its 67 ceiling — RECORDED 2026-10-18 AT M8C CLOSE-OUT

**Evidence [relayed].** The desktop shard-2 budget is at its ceiling of 67; the next desktop spec needs a rebalance. **Trigger:** the next added desktop e2e spec. **Owner:** unassigned.

## 267. Throwaway designs in the preview database, and a possibly migrated staging database — RECORDED 2026-10-18 AT M8C CLOSE-OUT

**Evidence [relayed; ids are in the P4 and P8 visual reports, which the scribe did not read].** The P4 and P8 visual checks minted 13 throwaway designs in the preview database. Add-only: the owner may delete them, no agent will. Separately, a live persistence run by the P3 developer may have applied migration `0011` to the allow-listed test database `lemn-conf-v2-staging`; **unconfirmed**. **Owner:** the owner.

## 268. `generate-kitchen.ts` `compose` is about 218 lines, and one block appears three times — RECORDED 2026-10-18 FROM THE M8C CLEAN-CODE REVIEW

**Evidence [source-verified by the reviewer; the scribe did not re-read the source].** `compose` in `generate-kitchen.ts` is about 218 lines. The block "insert a planned base and record the step" appears three times: in the priority loop, the storage loop and the free-end-fill loop. **Cost of deciding:** extract `applyPlannedBase` and named pending-resize and fill steps; a domain-rule file, so the full review tier applies. **Owner:** unassigned.

## 269. `shellOf` in `target-shell.ts` duplicates the shape dispatch of `buildShellFor` / `buildUShellFor` — RECORDED 2026-10-18 FROM THE M8C CLEAN-CODE REVIEW

**Evidence [source-verified by the reviewer].** `shellOf` (56 lines) in `packages/configurator-domain/src/preset/target-shell.ts` repeats the shape dispatch that `buildShellFor` and `buildUShellFor` perform in `generation/generate-kitchen.ts`. **Cost of deciding:** one shape-dispatching builder used by both; touches two domain modules. **Owner:** unassigned.

## 270. `backup-presets.ts` is a near copy of `backup-designs.ts` — RECORDED 2026-10-18 FROM THE M8C CLEAN-CODE REVIEW

**Evidence [source-verified by the reviewer].** `apps/web/src/lib/server/backup-presets.ts` (347 lines) is a near copy of `backup-designs.ts` (420 lines): the rotation policy (14 days, 30 files), the ndjson streaming and the blob client are duplicated. The page size differs (5 against 200) by design and must stay a parameter. **Cost of deciding:** consolidate when a third export appears, or sooner to stop the policy drifting between the two. **Owner:** unassigned.

## 271. `scene-capture-registration.ts` hard-codes the adapter's node names — RECORDED 2026-10-18 FROM THE M8C CLEAN-CODE REVIEW

**Evidence [source-verified by the reviewer].** `apps/web/src/scene/scene-capture-registration.ts` names `solids`, `voids`, `selection_outline` and `overflow_mark` as string literals. A rename in `packages/three-adapter` would silently put outlines in thumbnails, with no failing check. **Cost of deciding:** export the names, or a `hideEditingOverlays` helper, from the adapter and consume it here. **Owner:** unassigned.

## 272. Large UI functions in the preset flow — RECORDED 2026-10-18 FROM THE M8C CLEAN-CODE REVIEW

**Evidence [source-verified by the reviewer].** `PresetCarouselDialog` is about 161 lines, `PresetChooser` about 89, and `usePresetCopy` about 81, the last living in `use-generation.ts`. **Cost of deciding:** split the components; move `usePresetCopy` to `use-preset-copy.ts` if the attempt-construction-sites test allows it (to be checked, not assumed). **Owner:** unassigned.

## 273. Comments that still cite plans — RECORDED 2026-10-18 FROM THE M8C CLEAN-CODE REVIEW

**Evidence [source-verified by the reviewer].** `merge-empty-columns.ts` ("8U plan §"), `validation-suggestion.tsx` and `kitchen-canvas.tsx` ("milestone"), and `free-end-refill.ts` ("600 mm") still cite plans or milestones instead of ADRs. **Cost of deciding:** comment-only edits, each pointing at the governing ADR; no review tier needed. **Owner:** unassigned.

## 274. Two claims have no ADR home — RECORDED 2026-10-18 FROM THE M8C CLEAN-CODE REVIEW

**Evidence [source-verified by the reviewer].** (1) The check order in the preset save route (`checkPresetSubmission`): author proven first, candidate before image. (2) The "none fits" notice in `generation-steps.tsx`, cited to the Consequences of ADR 0112 Amendment A. Neither has a decision record of its own. **Cost of deciding:** an ADR decision is needed (owner or planning wave), then the code comments re-cite it. **Owner:** unassigned.

## 275. Generic 413/503 status constants live in a preset-named module; the listing byte cap grew — RECORDED 2026-10-18 FROM THE M8C CLEAN-CODE REVIEW

**Evidence [source-verified by the reviewer].** The generic 413 and 503 status constants now live in the preset-named `apps/web/src/preset/preset-wire-contract.ts`. Also `MAX_LISTING_BYTES` grew from 1,153,434 to 1,179,648 bytes (8 × (128 KiB + 16 KiB)). **Cost of deciding:** move or rename the constants to a neutral module; the cap change is recorded only. **Owner:** unassigned.

## 276. Manual insert takes the widest width, not the default width — RECORDED 2026-10-25 (OWNER OBSERVATION, COORDINATOR-RELAYED)

**Note 2026-10-26: M10, wave P1 (the field only).** P1 declares the default-width field in the catalogue; the anchor price is the price at it (ADR 0177 A-2). **The behaviour half (manual insert taking the default width) is out of M10's scope and stays open.** The proposed defaults (600 for `base-panbank`, `wall-lift`, `open-shelf`, `hood`; `tall-pantry` 600 or 800) remain an owner question (plan OQ-8, close-only).

**Observed (owner, relayed).** The owner's notion of a cabinet's "default width" is the width it takes when there is a lot of free space: most 600, the bottle cargo 300, perhaps a tall unit 800. A cabinet inserted by hand into a large empty space does not follow it.

**What is true in the code [source-verified by the coordinator; not re-read by the scribe].** In `packages/configurator-domain/src/commands/insert-fit.ts`, `resolveFitWidth` returns `widestBuildableWidthMm(body)` when the opening is wider than the widest buildable width and the column can be divided, and `resolveFixedSetWidth` takes the widest fitting size. So a range cabinet inserted by hand into a large empty space is built at 800 mm. The generator plans most bodies at 600: `generation/generation-priorities.ts` (sink, 3-drawer and hob 600; fridge-free 700), `generation/optional-run-items.ts` (bottle cargo 300), `generation/leftover-rule.ts` (`STORAGE_BODY_WIDTH_MM` 600), `generation/dishwasher-beside-the-sink.ts` (600) and `generation/u-tall-layout.ts` (pantry 600). **No catalogue field declares a default width today.**

**Open.** Whether manual insert should use a per-cabinet default width, and declaring that default once (in the catalogue) so the generator and insert read one value. **Owner to confirm** the proposed defaults for rows the generator does not place (`base-panbank`, `wall-lift`, `open-shelf`, `hood`: 600 proposed) and whether `tall-pantry` is 600 or 800. The dashboard brief shows these as "propus". **Cost of deciding:** a catalogue field plus changes to the insert path and the generator's constants; an owner question first. **Owner:** the owner, for the values; unassigned otherwise. Related: 255 (the commands still cut empty space at 800).

## 277. Manufacturer dashboard: prices and whole-kitchen defaults — RECORDED 2026-10-25; AFTER M8 PER ADR 0062, NO MILESTONE YET

**Note 2026-10-26: now M10, in progress (W0).** The "after M8" trigger is superseded by [ADR 0176](../decisions/0176-the-manufacturer-price-dashboard-is-milestone-m10-and-starts-now.md); plan [`M10-price-dashboard.md`](../milestones/M10-price-dashboard.md). Nothing is built. The whole entry is carried by the milestone's lanes U, M, S, R, H and K; 54 and 176 (named below) are carried by waves P3 and R1.

Scope as ruled: [ADR 0062](../decisions/0062-a-manufacturer-price-dashboard-comes-after-m8-and-shapes-seams-now.md) Amendment of 2026-10-25 (prices editable; sizes shown read-only; a default-settings screen; desktop-first; adding cabinets out of scope) and the [ADR 0072](../decisions/0072-price-book-versioning-is-deferred-to-the-manufacturer-dashboard.md) Amendment of 2026-10-25 (a saved kitchen always prices at the current book; version history is the owner's only). The design brief is `docs/design/claude-design-brief-cabinet-price-dashboard.md`. **Nothing is built and nothing is scheduled.** Trigger: M8's close. Inherits 176 (two price-book roots must become one first), 54 (depth multiplier) and the open question of where books live. **Owner:** unassigned.

## 278. A whole-kitchen handle setting in the configurator — REQUESTED 2026-10-25 (OWNER RULING, COORDINATOR-RELAYED), NOT SCHEDULED

**Note 2026-10-26: M10, waves H1 (command), Q2 (settings row, frame C2) and H2 (stamping the default).** The owner accepted the recommendation unchanged (OQ-7, relayed). Not built.

The customer's global settings sheet should offer one handle choice that applies to every cabinet that takes a handle, as the kitchen colour already does. **What is true in the code [source-verified by the coordinator].** Handles are per cabinet only: `HandleSchema` is steel, black or push in `packages/configurator-domain/src/design.ts`, and the default is `steel` in `queries/describe-selection.ts`. The dashboard's default-settings screen (277) depends on this: its handle default has no whole-kitchen setting to feed until this exists. Open: how a whole-kitchen choice interacts with a per-cabinet override (not asked, not decided). **Owner:** unassigned; the brief draws one frame (C2).

## 279. Cabinet enable / disable — FUTURE PLAN, DELIBERATELY POSTPONED BY THE OWNER 2026-10-25 (COORDINATOR-RELAYED)

**Note 2026-10-26: not in M10.** The M10 plan keeps this out of scope (§2); the postponement stands. This is the one entry in 276-286 that does not move into M10.

Disabling a cabinet type must hide it from the customer's list **and** make the generator never place it; the owner recognises this as a large change and postponed it on purpose. Default when built: everything enabled. Ruled at [ADR 0062](../decisions/0062-a-manufacturer-price-dashboard-comes-after-m8-and-shapes-seams-now.md) Amendment of 2026-10-25. Related: ADR 0062 seam 3 (a preset naming a disabled build id must fail in a stated way). The brief leaves room for it and draws nothing. **Not to be started before the owner lifts the postponement.** **Owner:** the owner.

## 280. One-time "prices updated" notice for saved kitchens — RULED 2026-10-25 (OWNER, COORDINATOR-RELAYED), NOT BUILT; STORAGE OF THE MARKER OPEN

**Note 2026-10-26: M10, waves S5 (marker table), R5 (route) and Q3 (frame C1, merged into C4C).** The marker is decided: a database row per design holding a (book version, availability revision) pair ([ADR 0178](../decisions/0178-the-m10-dashboard-storage-lifecycle-defaults-notice-seen-and-digest.md) A-11, an architect ruling the owner may overrule). Not built.

Ruled at the [ADR 0072](../decisions/0072-price-book-versioning-is-deferred-to-the-manufacturer-dashboard.md) Amendment of 2026-10-25. When a customer opens a saved kitchen and a price it uses has changed since they last saw it, show a calm notice once: informational, no old price. **Open, not decided:** where the "already shown" marker lives. The owner named a cookie, the user's profile, and the database. Also not decided: how "a price this kitchen uses has changed since last seen" is determined. Depends on the dashboard (277), since only a dashboard can change the book without a developer. The brief draws the customer frame as C1. **Owner:** unassigned.

## 281. Pricing engine: the anchor-and-steps formula shapes — RULED 2026-10-25 ([ADR 0175](../decisions/0175-a-cabinet-is-priced-by-an-anchor-at-its-default-width-plus-steps-widths-and-heights-round-up-to-50-mm-and-prices-round-to-10-lei.md)), NOT BUILT, NOT SCHEDULED

**Note 2026-10-26: M10, waves P1 (shapes beside the old ones) and P3 (cut-over).** The door-count question is ruled by the owner: the **actual** width (OQ-6; [ADR 0177](../decisions/0177-the-m10-pricing-seams-rounding-round-up-percentages-deepening-fixed-size-rows-linked-accessories-and-the-lift-mechanism.md) A-3). Not built.

Part of 277's trigger (after M8). **Needs code, not data:** asymmetric width steps (a plus and a minus amount), round-up of width and height to the next 50 mm, and a per-size lookup for fixed-size rows. A symmetric step already fits the linear shape. Today a body built at 575 is priced at 575 (`price-book.ts:13`), so round-up changes customer-visible prices. Also owed: a **default width declared once in the catalogue** (the anchor is the price at it) — that is 276's owner question. Open (ADR 0175): whether the door count follows the actual or the rounded width. **Owner:** unassigned.

## 282. Pricing engine: material as a percentage on cabinet prices — RULED 2026-10-25 ([ADR 0092](../decisions/0092-hardware-prices-three-mechanisms-and-a-sink-carries-two-extras.md) Amendment), NOT BUILT, NOT SCHEDULED

**Note 2026-10-26: M10, waves P2 (percentages and the rounding seam) and P3 (cut-over, `wholeKitchenMinor` retired).** The "keeps throwing" rule is settled: it stays, because PAL is fixed at 0 % and the D9 default is a separate concept (ADR 0092 Amendment of 2026-10-26; [ADR 0177](../decisions/0177-the-m10-pricing-seams-rounding-round-up-percentages-deepening-fixed-size-rows-linked-accessories-and-the-lift-mechanism.md) A-8). Not built.

Replaces `MaterialTier.wholeKitchenMinor` (`price-book.ts:200-203`). PAL is the 0% reference; illustrative MDF +30-35%, veneer +70%; applies to cabinets only, not hardware or accessories; the customer still sees one "Material · <name>" line. Open: the rounding seam (283/284), and whether the material group's "keeps throwing" rule survives (ADR 0092 Amendment). Links 277, 281. **Owner:** unassigned.

## 283. Pricing engine: depth 700 as a percentage, its customer line and the `depthNote` copy — RULED 2026-10-25 ([ADR 0100](../decisions/0100-depth-is-priced-by-a-dashboard-editable-multiplier-on-the-600-mm-base-and-it-is-deferred.md) Amendment), NOT BUILT, NOT SCHEDULED

**Owner ruling 2026-10-26 (relayed): "Surcharge every deeper cabinet."** Wall rows and wall corners deepen (330 → 400) and **take the depth percentage**; the "not wall cabinets" in the entry text below is superseded (ADR 0100 Amendment, ADR 0177 A-6).

**Note 2026-10-26: M10, waves P2/P3 (the term), Q1 (the depth line and `depthNotePriced`, merged with P3 at MP-3) and T2 (retire the old leaf).** `depthNote` is at line 325, not 324 (ADR 0100 Amendment of 2026-10-26). Which cabinets deepen is a measured fact, not a predicate (ADR 0177 A-6). Not built.

Un-postpones 54. One percentage as book data; base and tall cabinets only (including hob and sink); not wall cabinets, customer-supplied rows, hardware or accessories; applied at the cabinet's real width; multiplies with the material percentage. The customer sees its own line "Adâncime 700 mm". Edited in the "Price rules for all cabinets" card at the top of Dulapuri. **`globalSettings.depthNote` (`apps/web/src/messages/ro.json:324`, `ru.json:324`) must change in the same change that ships the coefficient** (ADR 0100 decision 5). The ~15% working figure is **not approved**. Re-derive `MAX_PRICE_COEFFICIENT_MINOR`. Links 54, 277, 282. **Owner:** unassigned.

## 284. Pricing engine: 10-lei rounding — RULED 2026-10-25 ([ADR 0175](../decisions/0175-a-cabinet-is-priced-by-an-anchor-at-its-default-width-plus-steps-widths-and-heights-round-up-to-50-mm-and-prices-round-to-10-lei.md) decision 5); WHICH AMOUNT IS ROUNDED IS OPEN FOR THE ARCHITECT

**Note 2026-10-26: M10, wave P2; the seam is ruled** in [ADR 0177](../decisions/0177-the-m10-pricing-seams-rounding-round-up-percentages-deepening-fixed-size-rows-linked-accessories-and-the-lift-mechanism.md) A-1 (three per-cabinet stages round half-up to 10 lei; the lines are sums of the rounded stages). An architect's ruling the owner may overrule. Not built.

The design rounds to the nearest 10 lei (`Math.round(x/1000)*1000` in bani); the owner accepted it. **Open seam:** round each cabinet price after depth and material, or each customer-visible line — the totals differ. Tension: the pricing code is exact bani and says only presentation rounds (`price-book.ts:15`); ADR 0100 says the query is the one place rounding is forbidden. Percentages (282, 283) make the arithmetic non-integer. Needs an architect's ruling before any implementation. **Owner:** architect.

## 285. Deactivating or deleting an item saved kitchens use — RULED 2026-10-25 (OWNER, COORDINATOR-RELAYED); NOT BUILT; ONE OPEN POINT FOR THE ARCHITECT (LONE COLOUR); SENT-KITCHEN EDITING: REVERSED, THEN REVERSED BACK (EDITABLE), SEE 286

**Note 2026-10-26: M10, waves S2b (availability log), P4a, R4a, M3, U4a-U4c, Q3 and Q5. Disabling and enabling are immediate, not at publish** (owner, OQ-2, relayed: "switching off, it's not the pricing changes, so it should take effect immediately"; [ADR 0062](../decisions/0062-a-manufacturer-price-dashboard-comes-after-m8-and-shapes-seams-now.md) Amendment of 2026-10-26; [ADR 0178](../decisions/0178-the-m10-dashboard-storage-lifecycle-defaults-notice-seen-and-digest.md) A-17). The mandatory replacement above is unchanged. The lone-colour point is ruled as an architect ruling, A-16 (one row in the sheet, replaced at every level). Not built.

**Ruling, 2026-10-25 — supersedes the proposal below** ([ADR 0062 third Amendment](../decisions/0062-a-manufacturer-price-dashboard-comes-after-m8-and-shapes-seams-now.md)). Deleting an item any saved kitchen uses is forbidden ("Deleting no, disabling yes"). Disabling a used material, colour, hardware class, handle or accessory is allowed: the dashboard warns first, with the count of kitchens using it; a customer opening such a kitchen gets a notice that it "is not available anymore", must choose a replacement from the remaining options (the relevant global setting opens showing only those), and the price recalculates after the choice. Price changes apply to all kitchens, sent ones included; freezing is rejected for now (possible trigger: a "taken into production" status). **Further owner answers, 2026-10-25 (third Amendment):** ~~price before the choice (none, or default tier)~~ **ruled:** the price is hidden until a replacement is chosen for every disabled item. ~~an accessory with no alternative (removed with a notice?)~~ **ruled:** a disabled accessory is removed from the kitchen with a notice; nothing to choose. ~~whether a submitted kitchen is editable~~ ~~**ruled:** a sent kitchen stays editable, edits are not blocked, so the mandatory-replacement prompt also appears on sent kitchens. No lock found in M8's plan or ADRs 0150, 0158.~~ **Reversed later on 2026-10-25 (owner, [ADR 0062 fourth Amendment](../decisions/0062-a-manufacturer-price-dashboard-comes-after-m8-and-shapes-seams-now.md)): a sent kitchen is locked; to change it the customer creates a copy. The mandatory-replacement sheet on a locked kitchen is an open point, see 286.** **Reversed back the same day (fifth Amendment): no lock; a sent kitchen stays editable and gets the sheet like any kitchen.** ~~Open for the architect, inference: editing a sent kitchen does not change what the shop received (ADR 0154): should the customer be told their changes are not sent until they send again, and is re-sending supported?~~ **Dissolved:** a sent kitchen is not edited. **Still open for the architect:** a lone disabled colour vs ADRs 0057, 0081, 0086 (cross-reference only). **Owner:** architect.

*Superseded text, kept:*

Applies to a material, a hardware class and an accessory. **Ruled:** deleting stays blocked while the item is used. **Not ruled:** deactivation. The design blocks deleting a used hardware class but has no warning for deactivating one in use. **Proposal (brief), pending owner confirmation:** a deactivated item is hidden from new choices; saved kitchens that use it keep being priced with it, so they do not fail with `UNKNOWN_TIER` (ADR 0072 Amendment, *Consequence for the stored-tier observation*). Recorded at ADR 0062's second Amendment of 2026-10-25. Links 277, 280. **Owner:** the owner, to confirm; design after.

## 286. A sent kitchen stays editable; changed-after-sending badge, side-by-side view, daily digest, review statuses — RULED 2026-10-25 (OWNER, COORDINATOR-RELAYED); NOT BUILT; FOUR ARCHITECT POINTS + REVIEWER ROLE OPEN

**Note 2026-10-26: M10, waves K1-K4, S4 and Q4.** The status reconciliation is **accepted** (OQ-9, relayed): Nouă / Contactat / Ofertă trimisă / Închisă; the digest stops at the last two. The digest runs at 08:00 Europe/Chisinau and counts 30 days from the first send (OQ-10, relayed). The four architect points (a)-(d) are answered by [ADR 0178](../decisions/0178-the-m10-dashboard-storage-lifecycle-defaults-notice-seen-and-digest.md) A-12 and A-13; "who can review" is answered by the existing capabilities, to be confirmed by the owner at close. Not built.

**Ruling** ([ADR 0062 fifth Amendment](../decisions/0062-a-manufacturer-price-dashboard-comes-after-m8-and-shapes-seams-now.md)); it reverses the fourth Amendment's lock, which is kept below, struck through. Owner: "the most important part of the tool, the creating of the lead, the connection with the manufacturer and the starting on the project, will be achieved… This is 100% the goal of the tool, not keeping it always up to date… At the moment when the client sends his details, it's already a win."

1. **No lock, no "create a copy".** ADR 0165's done-page link that opens the design for editing stays as it is; ADR 0165 lines 41-52 and `docs/OWNER_FIXES.md` Q-F3-9 no longer conflict.
2. A sent kitchen shows the current price (ADR 0072 Amendment) and gets the mandatory-replacement sheet (ADR 0062 third Amendment).
3. Soft, non-blocking note: „Ai trimis deja această bucătărie. Modificările se văd și la noi, dar spune-ne la telefon dacă e ceva important.”
4. **Changed after sending** = `designs.revision` > the submission's `design_revision` (coordinator, source-verified: `0004_add_design_revision.sql` increments per save; `0008_create_contact_submissions.sql` stores snapshots and `design_revision`; no history of earlier versions). New per-submission **seen revision**, recorded when an operator or administrator opens the kitchen in "Bucătării clienți". Revision > seen revision: badge „Modificată după ce ai văzut-o" and a counter in the dashboard menu (always on). The kitchen page shows "Trimisă" and "Actuală" side by side.
5. **Digest email** to administrators and operators: at most one a day; only if a kitchen changed since the previous digest; each kitchen once per round of changes (again only after seen and changed again); a kitchen drops out 30 days after sending or when its status becomes „Măsurare programată" or „În producție", whichever is first, then only the badge.
6. **Statuses, set by hand by operators:** Trimisă → Văzută → Măsurare programată → În producție. *(Reconciled 2026-10-25, pending owner confirmation: `main` already ships Nouă / Contactat / Ofertă trimisă / Închisă (ADR 0173 P-L3-8); keep those, add none, "seen" is a separate marker, the digest stops at Ofertă trimisă / Închisă — see ADR 0062's reconciliation note.)* Roles are outside the dashboard's scope, so "who can review" stays open.
7. Freezing prices stays postponed; „În producție" is a status a freeze could hang on.

**Open for the architect (inference, not ruled):** (a) where the seen revision and the status live: columns on `contact_submissions` or a new table; (b) the digest's sending time and provider (ADR 0154's mail port); (c) whether the 30-day window counts from the first sending or the last; (d) a kitchen sent twice has two submissions: which seen revision applies. **Open:** who can review (roles).

**Resolved or dissolved from the fourth Amendment:** price a sent kitchen shows (current price); the sheet on a locked kitchen (appears as normal); locked from sending versus from review (no lock).

*Superseded text, kept:*

~~**Ruling** (ADR 0062 fourth Amendment); reverses 285's "sent kitchens stay editable". A kitchen the customer has sent is locked: no editing, through and after review by an operator or administrator. **To confirm with the owner:** "locked from sending" (the coordinator's reading) versus "locked once reviewed". To change it, the customer creates a new kitchen from it: an editable, unsent copy. A sent kitchen shows a notice: wait for the manufacturer's answer; to discuss sooner, call the shop or refer to this design when asking for a consultation. This replaces the re-send question.~~

~~**Open (inference, not ruled):** (1) the price a locked kitchen shows; recommended: no estimate, just "Prețul final îl primești de la producător". (2) The mandatory-replacement sheet on a locked kitchen; recommended: no sheet, the item shows as unavailable with "Creează o copie" to choose a replacement there. (3) Who can review: an operator or an administrator; roles are outside the dashboard's scope. (4) The review status (sent, reviewed, maybe "in production") does not exist; new work for the "Bucătării clienți" area.~~ (3) carried over; (4) ruled above.

~~**Conflicting text, not edited:** ADR 0165 lines 41-42, 48-52 (done-page link opens for editing in the same browser); `docs/OWNER_FIXES.md` lines 373-377 (Q-F3-9).~~ No longer conflicts. Links 285, 277. **Owner:** architect.

## 287. The staff path guard may compare undecoded path segments, so an encoded staff URL could miss its headers — RECORDED 2026-10-26 (COORDINATOR-RELAYED FROM THE M10 U1 REVIEW); LOW; UNCONFIRMED; PREDATES M10

**Observed (coordinator, relayed; not run by the scribe).** `apps/web/src/proxy.ts:336-354`, `isStaffPath` and `isAccountPageIn`, compare raw path segments. **Inference, falsifiable by the check below:** if Next decodes static segments when matching a route, `/ro/staff/%63atalog/cabinets` or `/ro/staff/%6Bitchens` would render without `X-Robots-Tag` and `Cache-Control: private`. Access is unaffected: the page's own gate still applies. **Check:** `curl` both URLs. A 307 to login **without** `X-Robots-Tag` confirms the gap; a 404 closes it. **Fix if confirmed:** decode each segment once before comparing, or answer encoded variants with a 404 as `hasMisspelledLocalePrefix` does. **Cost of deciding:** one curl, then one small change in `proxy.ts` (lane U owns that file in M10). **Owner:** unassigned.

## 288. `enumerableFieldsOf` does not see an accessor defined on a prototype — RECORDED 2026-10-26 (COORDINATOR-RELAYED FROM THE M10 REVIEWS); GAP NOT YET CHARACTERISED

**Observed (coordinator, relayed; the scribe did not run it).** `packages/configurator-domain/src/pricing/book-reading.ts:57-72` collects `Object.keys` of the declared object and of each prototype up to `Object.prototype`. **Inference from reading that function, falsifiable by a test:** `Object.keys` lists enumerable own properties only, and a class accessor is non-enumerable, so a getter a book brings on a prototype is reachable by a property read (as `readDeclared` does) but absent from the enumeration. ADR 0138 states the walk's intent (line 89 in that record). **Cost of deciding:** a test that builds a class-backed book with a prototype accessor, then either widening the walk to own property names or recording that the parser refuses such books. **Owner:** unassigned.

## 289. A fail-closed account-bucket refusal logs the same line as a store failure — RECORDED 2026-10-27 (COORDINATOR-RELAYED); LOW; DIAGNOSTICS; PREDATES M10

**Observed (coordinator, relayed; diagnosed 2026-10-27 against the test database, read-only; the scribe ran nothing).** The `[account]` log line for a fail-closed account bucket refusal is `{event, outcome: 'unavailable'}`, identical to a store failure. The limiter's cause (for example `digester-unusable`) is held in the decision but never logged, so the two cannot be told apart. **Case that exposed it:** a dev server without `DIGEST_SECRET` (64 lowercase hex) answers 503 on `/api/staff/kitchens`, `/api/staff/audit` and the other account-bucket routes while pages still render. Not caused by M10. **Where:** `answerUnavailableOnFailure`, `judgeStage` and `refusalOfBucket` in `apps/web/src/lib/server/staff/staff-kitchens.ts`, `staff-audit-log.ts` and `judge-account-request.ts`. **Cost of deciding:** add the cause to the log line (a code, never a secret) and one test that the two outcomes log differently. The environment note is in `docs/best-practices/browser-and-visual-qa.md`. **Owner:** unassigned.
