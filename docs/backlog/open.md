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
seam 1, [ADR 0072](../decisions/0072-the-price-book-is-data-and-its-shapes-are-code.md)), so this is
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
  were reassigned when that landed — `docs/milestones/M5-width.md` carries the old→new mapping.
- **The worktop depth control is M6's, not M5's** (owner, 2026-08-27). M5 owns the geometry with the
  worktop as a declared constant at 600; `docs/milestones/M6-price-and-global-settings.md` work item
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
none of A's rows. Plausibly rare (the shipped e2e criterion S6-1 is green regardless); widening the
lock to cover saves would contradict the plan's decision D2 (nothing but the mint rotates).
**Recorded to tell the owner**, per the close-out; not fixed here. No owner yet; no phase.

## 90. SEC-7E3b.3 — the rotation `UPDATE` has no rate limit — FOUND 2026-09-23, DEFERRED TO M8

**Found by M7 wave 7E3b's security review** (SEC-7E3b.3 at the
[7E3b close-out](../milestones/M7-room-and-presets.md#7e3b-close-out--2026-09-23)). Every mint issues
one `UPDATE designs SET visitor_hash = …` unconditionally; nothing bounds how often one caller can
trigger it. ADR 0114 decision 7 already names M8's limiter and WAF scope as the control for mint
abuse generally; this is that same gap, named for the rotation write specifically rather than built
here. No owner yet; phase is M8.
