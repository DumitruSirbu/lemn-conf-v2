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

## 52. A resize or an insert carries the wall-end cap into the recorded map — RECORDED 2026-09-06, DIRECTION RULED

**Introduced by wave 6J-d and closed only partly by it.** Direction ruled in
[ADR 0090](../decisions/0090-a-frozen-space-slides-with-its-run-and-follows-the-body-it-recorded.md)'s
Amendment B addendum; the wave itself is unscheduled.

ADR 0090 Amendment B rules that a room-derived cap bounds what the map **publishes** and never
rewrites what the document **records**. `setCabinetDepth` obeys it. `setWidth` and `insertBody` do
not: `CommandContext.columns` hands them the **published** map and their `effect.columns` replaces the
map whole, so the cap rides into the recorded face.

**Measured at `cf53e8e` plus the D1 fix**, on a recorded space flush to wall B's end in the 2920 mm
room:

```
at 600                     recorded B|2620 w600   published B|2.62 w600
after setCabinetDepth(700) recorded B|2720 w600   published B|2.67 w500   <- Amendment B working
after a delete on wall B   recorded B|2720 w600   published B|2.67 w500   <- fall-through arm, record survives
after resizing p0, wall A  recorded B|2670 w500   published B|2.67 w500   *** the record adopts the cap ***
```

A resize of an unrelated cabinet **on the other wall** costs the recorded space 100 mm, permanently and
silently — the document is schema-valid and `validateDesignForCatalog` reports nothing.

**It is new, not inherited.** At `e28ab25` the depth command slid no extent, so a far-end space was
never pushed past its wall and never capped; there was no loss on this path before this branch.

**What deciding it costs, and the direction already ruled.** ADR 0090's addendum refuses the two
options as posed and rules a third: the wall-end cap **preserves the column's key** (changing `w`,
`x`/`z` and nothing else), after which handing `setWidth` and `insertBody` the recorded map is clean —
the `COLUMN_MISMATCH` that made that option look expensive is created by the key divergence itself.
Safe because `clip-empty-columns-at-wall-end.ts` never clips an occupied column, so no `record.col` is
ever derived onto a capped key. Store-side reconciliation by matching is refused by name.

**What the wave must measure first**: whether anything computes a column key from a coordinate and
looks it up in the *published* map — picking, `findVacatedVoid`, the adapter's selection. That is the
one place `key = f(centre)` could still be load-bearing for a member-less column.

**It is [ADR 0088](../decisions/0088-a-depth-change-plans-against-the-frozen-extent-and-re-derives-only-the-depth.md)
decision 2's question a third time** — which map does a map-publishing command receive, and who owns
the reconciliation. It touches `setWidth` and `insertBody` rather than the depth track, so it is its
own wave and not 6J-d's.

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

## 41. The sink, its bowl and its faucet do not follow the cabinet-depth setting — RULED 2026-09-07 ([ADR 0098](../decisions/0098-the-sink-is-centred-at-the-declared-depth-and-a-deeper-worktop-grows-behind-it.md)), AWAITING A WAVE

**The owner ruled 2026-09-07:** *"It should be centered. And the gap should become bigger behind — so between the wall and the sink and faucet. Same principle as with hob."* [ADR 0098](../decisions/0098-the-sink-is-centred-at-the-declared-depth-and-a-deeper-worktop-grows-behind-it.md) declares `SINK_FRONT_CLEARANCE_MM = 110` — the centred value at 600 — and derives the seat from it, so the bowl's front clearance is 110 at every depth and the faucet's clearance to the wall goes 2 -> 22 mm at 600 and 52 -> 122 mm at 700. **It moves the shipped 600 mm kitchen forward by 20 mm**, deliberately, which is the one place it departs from ADR 0087; the wave's close-out must record that parity re-baseline rather than absorb it. This entry closes when that wave ships, not before. **The observation below is unedited and still accurate about the code.**

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

## 50. `validateDesignForCatalog` is blind to a cross-wall corner intersection — RECORDED 2026-09-06, NOT SCHEDULED

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
