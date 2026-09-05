# Backlog — reported issues not yet scheduled

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

---

## Open

Active, unscheduled items. This is the section to read. Everything under **## Resolved**, near
the bottom of this file, is already fixed and shipped — skip it unless you are specifically
researching a past decision.

## 2. Rearranging a run: re-split, and the narrow bottle cabinet — DECIDED 2026-08-26; RE-SPLIT MECHANISM DECIDED 2026-08-28

> **STILL OPEN, and now half planned.** ~~The re-split half now has its mechanism: [ADR 0037](decisions/0037-adjacent-empty-columns-merge-into-one-space.md).~~
> ADR 0037 was built in wave 5D2b on 2026-08-29 and **withdrawn on 2026-08-30**: merging the columns
> without the re-split makes it worse, because §4 subtracts height and never width, so the first
> cabinet inserted into a merged span closes the level and strands the rest. **Clearing two adjacent
> cabinets still gives two openings.** The mechanism below is right and waits on the re-split.
>
> **AMENDED 2026-09-01 — [ADR 0046](decisions/0046-adjacent-empty-columns-merge-under-a-cap-and-an-insert-splits-its-column.md).**
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

## 4. Moving and resizing a cabinet — DECIDED 2026-08-26

**Decision (owner, 2026-08-26): each level's width is set independently. Resizing a base cabinet does
NOT drag the cabinets above it.**

The owner's reasoning, and it is the flexibility argument: an 800 mm base should be able to carry a
600 above it, or two 400s. Forcing the column to move as one would remove that. Instead the customer
resizes the base, then separately resizes the level above if they want it to match — "important that
I need to have the ability to choose the same width. Otherwise it will be a limitation."

That is §5.4 as written: neighbours are "same wall, **same row**".

### Independent widths per level already work — no change needed

Measured on the shipped design. An 800 mm base with two 400 mm cabinets above it:

```
A|1.30: w=800  members p0@800          (the base)
A|1.10: w=400  A|1.50: w=400           (the two above)
```

A column groups bodies at the same position; it never required them to line up. Three columns, right
widths, no errors. **This half of the decision costs nothing to implement.**

### The real problem, and the rule that solves it

A column's key is derived from a body's **centre**, and §5.4's resize moves that centre. Columns are
frozen at load (ADR 0011 Gap D). Measured, growing `p2` 600 -> 800 (centre 2600 -> 2700) with the
donor `p4` shrinking:

```
A) delete p2, frozen columns (baseline)      -> A|2.60 w=600          correct
B) after resize, FROZEN columns kept         -> A|2.60 w=600 | A|3.20 w=600   TWO PHANTOM SLOTS
C) after resize, columns RECOMPUTED          -> (no voids)             correct
D) resize then delete p2, RECOMPUTED         -> A|2.70 w=800           correct
E) resize then delete p2, FROZEN             -> two 600 voids at the old positions   wrong
```

Row **B** is the one to understand: with frozen columns a resize makes **two empty slots appear out
of nowhere**, because the resized bodies moved out of columns that still expect them. Nothing was
deleted. The model hallucinates space.

But recomputing columns is not a blanket fix. Clearing the fridge column (`p7` + `p24`), which is
§10's signature flow:

```
FROZEN columns    -> y0=0 w=700 h=860 | y0=1500 w=700 h=700 | y0=2200 w=700 h=400   correct
RECOMPUTED columns-> (NO VOIDS - delete did nothing)                                 ADR 0011 Gap D
```

**So the rule is per operation, and it is a principle rather than a special case. A column records
the space a *run* occupies:**

- **Delete keeps columns frozen.** Emptying space does not give the space up.
- **Resize updates them.** Resizing moves the boundary of the space itself, so the record must follow.

### What M5 has to do

1. Implement `setWidth` per §5.4 (row-level donor boundary move).
2. Update the column entries for the two bodies the resize moved — part of `setWidth`, not a redesign.
3. Two regression tests pinning the failure modes measured above: a resize must produce **no** new
   openings, and a delete after a resize must produce **one** opening at the **resized** width.

**Q3 is already answered by decision 1.** "What happens to an accessory whose host moves" disappears
once the hob is part of the cabinet body rather than a separate placement sitting on it.

**Column reordering (Mută la stânga/dreapta) is not needed for this.** It was raised as an
alternative route to moving a sink; with independent per-level widths the customer resizes each
level instead. §13.2's rejection stands unless a new reason appears.

---

## 5. Wall cabinets over a column build too shallow — DECIDED 2026-08-26

**Found while fixing the swap-depth defect** (commit "Swap no longer changes a body's depth"). That
fix stopped a swap changing a body's depth for 12 of 16 replaceable wall bodies. Four still change,
for a different reason, and in the opposite direction — they **recede 200 mm**.

**Cause.** §7 clamps every wall carcass to `min(d, 0.4)`
(`packages/three-adapter/src/catalog-bodies.ts`, `WALL_CARCASS_MAX_DEPTH_M`), so no catalogue entry
can build a wall carcass deeper than 400 mm however deep the opening is. Three cabinets in the
shipped kitchen are genuinely 600 mm deep, so replacing one shrinks it.

This is a **product rule, not a geometry limit** — `wallCabinet(W, doors, H, D)` takes depth as a
parameter and will build any depth. Nothing breaks above 400; the clamp is policy.

**Why the rule exists, which is the whole decision.** Look at which cabinets are deep:

| Wall cabinet          | Depth  | What is underneath           |
| --------------------- | ------ | ---------------------------- |
| p11 p12 p14 p17-p20   | 330 mm | a base cabinet with a worktop |
| p22 p23               | 600 mm | a tall column (oven tower, pantry) |
| p24                   | 600 mm | the fridge                   |

That is not arbitrary. A wall cabinet above a **worktop** is shallow so you do not hit your head
leaning over it. Above a **full-height column** there is nothing to lean over, so it can be as deep
as the column. The 400 mm cap is a head-clearance rule that only applies over a worktop.

**Decision (owner, 2026-08-26): the depth cap follows what is below the opening, not the catalogue
entry.** One `wall-2door` entry that builds 400 mm over a worktop and 600 mm over a column.

Two alternatives were considered and rejected:

- **Add a deep entry** (`wall-2door-deep`, `nominalDepthMm: 600`). Rejected: the picker would show
  two entries with the same name differing only in a depth the customer cannot see, and choosing
  wrongly is invisible until it is built.
- **Clamp to the entry's own `nominalDepthMm`** instead of the constant. Rejected **as a complete
  fix** — it only *enables* a deep entry to exist; `wall-2door` would still declare 400 and still
  build 400, so it needs the rejected entry above to do anything. (These two were first put to the
  owner as alternatives, which was wrong: they are complementary. Recorded so the reasoning is not
  repeated.) Keep it in mind as the fallback mechanism if the decision below proves too costly.

**What implementing it needs.** A query the model does not have today: *does this opening sit above a
worktop?* The information is present — the column's members are known, and a base body's frame top is
the worktop line (§2: `PLINTH + CARC_H + CTOP` = 860 mm) — so this is a derivation over existing
data, not new persisted state. Do NOT infer it from the opening's depth: `column.d` is 580 over a
base run and 600 over a tall column, which is too close to separate reliably and would be inference
of exactly the kind §6.3 warns against.

Pair it with a regression test over all sixteen replaceable wall bodies asserting each keeps its own
depth through a swap — the four that currently recede are the cases that must change.

### SHIPPED 2026-08-26, and corrected the same day

Built in wave A: `Column.hasFullHeightUnder`, re-answered from the current records on every
derivation, with §7's cap moved out of `catalog-bodies.ts` into the domain as
`WALL_CARCASS_MAX_DEPTH_OVER_WORKTOP_M`.

**The rule is read positively, and that is the whole of it.** Wave A first implemented the
contrapositive — cap wherever a worktop is present — and logic review found that the two are not the
same, because a column can be **empty**. The absence of a worktop is not the presence of a column,
and empty is what a delete produces: deleting the base cabinets under a wall run lifted the cap over
nothing at all and built a 580 mm carcass, the frozen `Column.d` of the cabinet just deleted, beside
330 mm neighbours. The predicate now asks for a `band: "column"` member by name and the cap applies
unless one is found. ADR 0011's third correction is the record, with the three-click reproduction.

**The consequence, decided deliberately: deleting a tall column makes the wall cabinet above it
recede to 400 mm on its next swap or re-insert.** Under the old predicate it kept the column's
depth. This is the right answer — the thing that held it out is gone, and the customer is now free
to put a base run there, which is precisely the shape the 400 mm rule exists for — but it is
visible, it is not what the sentence above literally promised, and it is a decision rather than a
detail, so it is stated here. It costs the owner nothing today: no shipped design reaches it without
a delete first, and the depth returns as soon as a full-height unit is put back and the wall body is
swapped. The two openings above a cleared `fridge-free` are the case pinned in
`insert-depth.test.ts`.

Not fixed, and still true of a *placed* body: nothing re-derives a placed body's depth. Inserting or
deleting a full-height unit under an existing wall cabinet does not change that cabinet — only its
next swap or re-insert reads the rule again. That is ADR 0018's contract (`seatDepthMm` is the body's
own measured seat) and was not revisited here.

### The other half was never linked, and it shipped a defect — SUPERSEDED 2026-08-27 by M5 wave 5A

**Reported by the owner from a real handset, 2026-08-27.** Delete a top-row cabinet in the shipped
kitchen, insert one back: it returns **400 mm** deep against neighbours that are **330 mm**, visibly
protruding.

The wave above made the cap *design-dependent*. It did not make it *derived*, and that is the half
that was missing. Measured:

- `catalog.ts:72` — `WALL_DEPTH_MM = 400`, every wall entry's `nominalDepthMm`.
- `commands/insert-fit.ts:56` — `WALL_CARCASS_MAX_DEPTH_OVER_WORKTOP_M = 0.4`.
- `resolveDepthM` (`insert-fit.ts:610`) returns `min(opening.d, cap)` and **never reads
  `nominalDepthMm`**. `opening.d` is `Column.d`, §3.2's MAX over the run — 580 here, the base
  cabinet's. `min(0.58, 0.4) = 0.4`.
- The nine seeded wall/top rows at `frameDepthMm: 330` are correct and always were.

**The two 400s are independent constants that happen to agree, and that unlinked pair is the cause.**
No gate compares the nominal, the cap and the fixture, which is exactly how the seeded design could
be authored at 330 with nothing failing. Note the precision: changing `WALL_DEPTH_MM` alone fixes
nothing, because `resolveDepthM` does not read it; changing the cap alone fixes the *symptom*. The
single-source map is justified by drift prevention, not by the symptom needing both.

**Decided by the owner, 2026-08-27, and scheduled — not backlog.** Wall/top depth follows worktop
depth through an extensible map (`600 -> 330`, `700 -> 400`; `800 -> 500` named, not committed),
and that map is the single source for both the nominal and the cap. Worktop depth becomes a
whole-kitchen setting and base carcass depth becomes a formula. **This entry's remaining half is now
M5 waves 5A and 5F** — see `docs/milestones/M5-width.md`, *Depth joins this phase*. The entry stays
here rather than being deleted because its measurements and its head-clearance reasoning are what
the waves are built on.

**The split, decided the same day: M5 owns the geometry, M6 owns the control.** Worktop depth is a
**single declared constant at 600 mm** in M5 — no user-facing control, no schema field, no settings
UI, no version bump. Making it settable is
`docs/milestones/M6-price-and-global-settings.md` **work item 4**, as a fourth control in *Setări
globale* beside the material and hardware tiers. So the fix for the defect reported here needs
neither of those things and is not waiting on them.

## 6. The 200 mm cargo is unreachable by any insert — INPUT FOR M5

**Found by logic review of waves A and C, 2026-08-26.** ADR 0026 added `base-bottle-cargo` with
`minWidthMm: 200` and the size set `[200, 300]`. The 200 mm member cannot be reached.

**Why.** §3.2 derives `Column.w` as the **MIN** of its members' widths, and every opening in a column
takes that width. The narrowest seeded placement in the shipped kitchen is 300 mm (`p10`, `p16`), so
no column is under 300 mm wide, so **no opening under 300 mm exists**. There is no bootstrap either:
the only way to make a narrower opening is to put a narrower body in the column first, and inserting
one needs the opening.

> **Amended 2026-09-01 — the second sentence is no longer true, and openings under 300 mm are now
> ordinary.** [ADR 0035](decisions/0035-width-is-a-bounded-stepper-not-a-menu-of-sizes.md) decision 7
> already falsified it on 2026-08-28: a shrink funds itself out of the space it vacates, so one `−50`
> on a 600 mm column makes a 50 mm empty column where none could exist before.
> [ADR 0043](decisions/0043-an-empty-space-of-any-width-is-a-legal-state.md) makes them ordinary in
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
already are). Related: [entry 6](#6-the-200-mm-cargo-is-unreachable-by-any-insert--input-for-m5).

## 8. A fixed-set body in a much wider opening leaves an unbuilt gap — NEEDS THE OWNER

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

## 13. The insert path ignores a width bound, and M5 wave 5C makes it reachable — RAISED BY LOGIC REVIEW

Found reviewing M5 wave 5C, 2026-08-27. **Pre-existing defect, newly reachable**, which is why it is
an entry rather than a wave fix.

**The mechanism.** `resolveWidth` (`commands/insert-fit.ts`) returns the opening's own width for a
`widthFlex: 'fit'` body after the §2 floor checks, and **never consults `sizesMm`**:

```ts
if (body.widthFlex === "fit") return { ok: true, widthM: opening.w };
```

`offersFor` gates purely on `evaluateInsertFit`, so it offers `wall-2door` into any wall opening at or
above 300 mm, building at the opening's width. The chips it renders are `[600, 800]`; the width it
builds at is whatever the opening is.

**Why it is newly reachable.** ADR 0031 is the first mechanism in the product that can produce a
**sub-600 mm column**. Take a column whose only wall member is a `wall-1door` (own set
`[200, 300, 400]`, so 300 is legal for that column), clear an adjacent column, resize to 300 — all
accepted. Now delete the `wall-1door`. The 300 mm void offers *Corp suspendat 2 uși*, and inserting it
builds **one door under a two-door label**. That is [ADR 0029](decisions/0029-a-two-door-cabinet-may-not-be-offered-at-one-door-widths.md)
verbatim, arriving through the path that ADR could not reach.

**This is the same shape ADR 0029 already recorded as unfinished.** Its Consequences say the decision
"closes the resize path only" because `wall-2door` is `widthFlex: 'fit'` and the insert path never
reads `sizesMm`. That was true when written and is now demonstrable on a state the customer can
create.

**It also qualifies ADR 0031 rule 5's framing.** The rule's correction says `sizesMm`-as-a-bound is
what protects ADR 0029 — but `sizesAreStandardLadder` is read by `setWidth` alone, so the bound has
**no effect at all** on the path that was already violating it. Two halves of one engine still answer
the question differently; the flag records the distinction on one of them.

**Direction.** The bound belongs in `resolveWidth`, gated on `sizesAreStandardLadder` — that is the
one function §5.2 and §9 already share, which is the argument `buildableSizes`' own doc comment
makes. Doing it there closes the resize path and the insert path with one rule, and makes the flag's
scope a decision rather than an oversight.

**Sequencing.** Worth settling **before 5D**, because 5D builds the chip-freedom query over exactly
this seam. Not a 5C fix: it changes what `offersFor` offers, which is M3's machinery and its own
acceptance criteria.

## 16. No camera preset frames the right end of wall A's base run at the mobile viewport — NEEDS A DECISION

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

## 18. A cabinet-hardware choice reaches the oven's and the microwave's bars in `tall-oven-tower` — NEEDS A DECISION

Split out of entry 11 on 2026-09-01 when that entry was decided and closed
([ADR 0051](decisions/0051-the-dishwasher-niche-wears-a-decor-door.md), Consequences). Entry 11
carried this as a one-sentence tail; it is recorded here in its own right so the deferral leaves a
pointer rather than a silence. **Owner: whoever owns §6.5**, which is the placement entry 11 gave it
and ADR 0051 did not overturn.

`setHandlesVisible` and `applyBlackHandleMaterial` (`packages/three-adapter/src/decomposed-bodies.ts`)
act on **every** `handle` group in a body. `tall-oven-tower` builds four `handle_bar` meshes, of
which exactly two are the cabinet's — the other two belong to the oven and to the microwave. So
`handle: "push"` on that body hides the appliances' bars alongside the cabinet's, and `handle:
"black"` repaints them in cabinet hardware. `base-hob-oven` carries the same exposure with one bar,
the oven's, and is held off it only by `canHandle: false`.

**Different cause from entry 11's, which is why it was not folded into wave 5B10.** Nothing about a
missing front is involved: the flags on `tall-oven-tower` are truthful — it really does have two
cabinet handles — and the capability gate
(`packages/three-adapter/tests/catalog-capability-parity.test.ts`) passes it, correctly. The defect
is downstream, in the path that *applies* a handle choice, which has no notion of whose handle it is
touching. The fix is to teach that path the same cabinet-versus-appliance rule `opensAFront()`
already encodes in the gate: a `handle` group is the cabinet's exactly when its own parent also
holds a front.

**What deciding it costs.** The change is in a file every body in the scene goes through, so its
blast radius is the whole catalogue rather than one body — which is why folding it into a wave that
also moved seeded geometry was refused. `base-dishwasher` stopped being an instance of this on
2026-09-01; `base-hob-oven`'s oven bar and `tall-oven-tower`'s two appliance bars remain.

## 19. The dishwasher decor door meets its own appliance at a 520 mm cabinet depth — NEEDS THE OWNER, WHEN M6 CAN REACH IT

Found while implementing M5B wave 5B10 ([ADR 0051](decisions/0051-the-dishwasher-niche-wears-a-decor-door.md)),
which anchors `dishwasherHousing`'s decor door on `CARC_D` (the derived `carcassDepthM`) so it follows
the cabinet-depth setting the way every other base front does. `dw_body` — the appliance behind the
door — does not follow: it is a real-world machine built at a literal 0.24 m front regardless of what
`CARC_D` says. The gap between the two is `CARC_D / 2 − 0.24`, so it closes at half a millimetre for
every millimetre `CARC_D` drops. At the shipped 600 mm kitchen the door's inner face is `CARC_D / 2 =
0.28`, leaving 40 mm of mounting clearance. The clearance reaches zero — the appliance meeting its own
door — at a **520 mm cabinet depth**.

**Not reachable today.** 600 mm is the only cabinet depth the product can currently produce; M5's
worktop-depth map is a single declared constant with no control on it (see backlog *Also open* below).
This is a floor with no way to be crossed yet, which is why it is backlog rather than a defect.

**The first thing that can reach it is M6's *Setări globale* depth control**
(`docs/milestones/M6-price-and-global-settings.md` work item 4), so that work is this entry's owner.
Whoever wires the control needs a decision before a customer can pick a cabinet depth below 520 mm
with a dishwasher niche in the design: refuse that combination with a stated reason, cap the depth
control's floor at 520 mm globally, or give the niche its own floor separate from the rest of the
catalogue. None of those is chosen here.

Already commented at the mounting site — `packages/three-adapter/src/kitchen-parts.ts`, the comment
above `dishwasherHousing`'s door slab — so the constant and the derivation that produces 520 mm are
there for whoever picks this up, rather than needing to be re-derived.

## 20. A resized seeded body renames itself, and the customer sees two names for one cabinet

Found by visual verification of wave 5B8 (2026-09-01). The seeded pantry's header reads **"Coloană"**
at 600 mm. Step it to any other width and back to 600, and the same body at the same width now reads
**"Coloană cămară 2 uși"**.

Nothing is wrong. `resolve-column-members.ts:191-194` says a resize rebuilds through the catalogue
equivalent, so **a resized seeded body migrates its `buildId`** — it has to, because
`buildDecomposedBody` takes no width and every seeded id is one fixed geometry. `describe-selection`
then finds a definition where it previously found none (`catalog.get(record.buildId)`), and the
catalogue row carries both a real `label` and `doorCountFollowsWidth`, where the seeded id carried
neither and fell back to `KIND_LABELS_RO.tall_unit`.

So this is two documented rules meeting, not a defect in either. It has applied to base cabinets
since ADR 0033; wave 5B8 made it reachable for a column, where the two names differ most.

**What a fix would be, if the owner wants one.** Give the seeded rows the labels their catalogue
equivalents carry, so the migration changes nothing the customer reads. That is a fixture edit, not
a mechanism change, and it is bounded by the M1 parity gate only in that it touches no geometry.
Doing it would also close the smaller version of this on every other seeded body.

Not scheduled. Raise it with the owner before spending anything on it — a rename that fires on the
customer's first resize may be acceptable, and the header is not wrong at either end.

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
flanking a full-height fridge). The dashed selection/highlight box for an empty column is drawn at
the fridge's own depth for its full height — wall level and base level alike — even though a wall
cabinet or a base cabinet inserted there would be shallower than a full-height column.

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

## Also open, recorded elsewhere — do not duplicate here

- **Width editing does nothing yet.** Every width chip is `blocked` because §5.4's resize command
  does not exist. Scheduled, not backlog.
- **Depth joined M5 on 2026-08-27** and is no longer "M5's entire scope" being width alone. Entry 5's
  unfinished half (the unlinked cap and nominal) is M5 wave **5A**, and base carcass depth as a
  formula is wave **5F**. The wave letters were reassigned when that landed —
  `docs/milestones/M5-width.md` carries the old→new mapping.
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

## Resolved

Fixed and shipped. Kept for history only — skip this section unless you are specifically
researching a past decision.

## 21. The rendered shell and the seeded document disagree about the size of the room — RESOLVED 2026-09-03

**Resolved by the owner, 2026-09-03. Corrected the same day by a second artefact.**

The first answer — the reference's room-dimensions **input screen**, *Perete A 3,60 / Perete B 2,40* —
turned out to be that screen's **example values, not this kitchen's room**. The authoritative artefact
is the reference's **wall-coverage panel** (*LĂȚIME ACOPERITĂ · PRACTIC PLIN*): **Perete A 3520 /
3560 mm**, 40 mm free at the right end; **Perete B 2800 / 2830 mm**, 30 mm free next to the fridge.

Both corroborate against the tree rather than being taken on trust: wall A's 3520 is the measured
3500 of placements plus `RUN_END_PANEL_THICKNESS_M` (18 mm) and its 1 mm gap — the sum
`kitchen-shell.ts` names in its own comment as *"3.5189999"* — and wall B's 2800 is the measured far
end to the millimetre. 3.60 is a rounded 3.56; 2.40 is nothing like 2.83.

Both numbers the project held are **real and correct, and describe different walls** — nothing was
reconciling them. `longestWallRunMm`'s `max(width, depth)` = 3600 is wall A; the document's
`depthMm: 2400` is wall B. The document is right. **The shell's `RD = 3.4` m matches neither and is
the number to chase.**

**What resolving it exposed. The document is wrong on both axes, and the run fits.** `widthMm: 3600`
should be **3560** and `depthMm: 2400` should be **2830**. With those, the seeded run occupies
2800 of 2830 on wall B and fits with 30 mm spare — there is no overrun at the shipped depth. At a
700 mm cabinet depth it ends at 2900 and overruns by 70 mm, which is where
[ADR 0065](decisions/0065-a-body-past-the-end-of-its-wall-is-marked-not-moved.md)'s marking applies.

**A second correction is owed at its source.** `validate-design.ts`'s along-wall bound takes
`max(width, depth)` and its comment calls the difference *"the 400 mm slack … a fact about along-wall
coordinates"*. **That explanation is wrong**: the bound was compensating for a bad room dimension,
not for a property of along-wall coordinates. With 2830 the wall B run fits its own wall and the
`max` is unnecessary rather than load-bearing.

**Both corrections landed on 2026-09-03.** The fixture declares `3560 × 2830`, and the along-wall
bound is `wallRunMm(wall, room)` — wall A the width, wall B the depth, per ADR 0065 decision 5. Four
test fixtures had been standing in the slack and were corrected with it: three declared wall-B runs
past the room depth, and one claimed 100 mm of wall A past the corrected 3560.

**Where it now lives:** `docs/milestones/M6-price-and-global-settings.md`, owner decision 8, and
[ADR 0065](decisions/0065-a-body-past-the-end-of-its-wall-is-marked-not-moved.md).

**One half of this entry stays open**: the **shell** renders `RW 4.2 × RD 3.4` and matches neither
the reference nor the corrected document. Correcting the document costs no geometry; correcting the
shell moves seeded geometry and needs a `DeclaredStructuralChange` under ADR 0051. Only the room
*numbers* are resolved here.

### The original entry, unedited


Found by the 5B2a logic review (2026-09-01). `kitchen-parts.ts:1795-1797` builds the shell at
`RW = 4.2, RD = 3.4, WH = 2.6`. `kitchen-l-design.ts:469` declares the same kitchen as
`{ widthMm: 3600, depthMm: 2400, heightMm: 2600 }`. The height agrees; **both floor dimensions do
not**, by 600 mm and 1000 mm.

Nothing is currently broken by it. Every seeded placement fits inside 3600, and
`longestWallRunMm` holds both walls to `max(width, depth)`, so containment validation passes on the
document's own numbers. The customer sees a room 600 mm wider than the document says it is, and no
rule reads both figures at once, so nothing has ever compared them.

**Why it matters now.** Wave 5B2a made room containment a validated rule for a new persisted field,
and two of its test fixtures had to declare 4200 to hold coordinates the shell renders but the
document forbids. So the mismatch is no longer merely cosmetic — it is load-bearing for test
fixtures, and the next rule that reads the room will inherit the same choice of which figure is
true.

**What a fix needs first.** Decide which number is the room: the document is the contract and the
geometry should follow it, but the shell's 4.2 x 3.4 is what every screenshot and every manual
session has ever shown, and the M1 1e-6 structural parity gate pins that geometry. Changing the
shell to 3.6 x 2.4 moves seeded geometry and needs a `DeclaredStructuralChange` under ADR 0051;
changing the document to 4200 x 3400 moves no geometry but widens the containment envelope every
validation rule is measured against.

Not scheduled. Raise it with the owner — it is a one-line change either way and a real decision
about which artefact is authoritative.

## 26. A resized column's freed space opens on different sides depending on position — EXPLAINED, NOT A BUG, 2026-09-02

Reported by the owner (2026-09-02), from two screenshots of a left-wall run (wall units, tall
units, an oven column, and drawer units under a worktop, with a full-height fridge column in the
middle). A second, wider screenshot showed the freed spaces on both sides of the fridge column
opening away from it — symmetric, not an isolated left/right inconsistency.

**Checked against the implementation. There is no neighbor-aware rule, and the symmetry is
coincidental.** Two independent, unconditional conventions produce it:

- **Insert seating** always pins the inserted body's left edge to the column's left edge, so the
  leftover always lands on the right — `seatAlongColumn`,
  `packages/configurator-domain/src/commands/insert-fit.ts:710-752`. This is decided, documented
  policy: [ADR 0046](decisions/0046-adjacent-empty-columns-merge-under-a-cap-and-an-insert-splits-its-column.md#104)
  records that a "whichever end abuts an occupied column" rule was proposed and the owner
  explicitly rejected it for unconditional left ("it has no predicate to get wrong, no tie to
  break").
- **Resize/shrink funding** always tries the run's right side first, then left
  (`EMPTY_SPACE_ORDER`, `packages/configurator-domain/src/commands/plan-width-funding.ts:42`), and
  a freshly-vacated strip with no adjacent empty column defaults to the run's right edge
  (`VACATED_SPACE_SIDE`, same file:148) — also arbitrary-but-fixed, not neighbor-aware.

The fridge-symmetric look is a side effect of `findAdjacentEmptyColumn`
(`plan-width-funding.ts:222-249`), which only counts a column as "empty" if it is free at every
level. A full-height fixture like the fridge can never be, or sit inside, an empty column, so the
side of a column touching the fridge can never supply or receive funding — the right-then-left
scan gets forced outward on both sides of a centered full-height unit, which happens to read as
"opens away from the fridge" in this particular layout. A run without a centered full-height
blocker would not show the symmetry.

No code change needed. If a neighbor-aware rule is ever wanted, it is a new decision overriding
ADR 0046, not a bug fix.

## 1. The hob cannot be put back once it is removed — DECIDED 2026-08-26, SHIPPED 2026-08-27

**Decision (owner, 2026-08-26): the hob becomes part of the cabinet body. Two catalogue entries,
both fixed at 600 mm.**

- **hob + 2 drawers** — the majority case. When the oven lives in a column, the cabinet under the
  hob is drawers, because that is where the pots go. The seeded kitchen already renders exactly this
  composite (`base-drawer2-600` + `cooktop-600`), so the geometry exists.
- **hob + oven** — common in Moldova, where kitchens are smaller and there is no room for an oven
  column. The `oven()` builder is 596 x 595 x 560 and a base carcass is 820 mm tall, so it fits.

Rejected: a 3-drawer and a doors variant. Each is another builder, entry and test, and both are
guesses where the two above are known. Adding a third later is cheap once the pattern exists.

Rejected: making the hob insertable as a standalone accessory. The void model has no accessory slot
— there is no opening at worktop height to offer one from — so it would mean adding a new kind of
slot to the engine for one fixture.

**The seeded design migrates.** `p2` + `p3` become one hob-bearing body. That leaves the accessory
machinery — §6.1's host resolution, the delete cascade, `ACCESSORY_MAX_HEIGHT_M`, the `accessory`
flag — **with no remaining user**, because the hob is the only accessory in the design. The owner's
direction is to remove what is then unused rather than keep dead machinery.

Verify that at implementation rather than assuming it: confirm nothing else reads `accessory` before
deleting anything, and note that §11 row 15 ("click the hob selects its host") becomes trivially
true once the hob *is* the host.

**Multiple ovens are allowed.** A hob+oven base alongside an oven column gives two ovens, and that
is permitted deliberately — the owner's reasoning: someone who cooks a lot may want two, the kitchen
has the space, and there is no reason to refuse something buildable. Revisit only if feedback says
otherwise.

**SHIPPED 2026-08-27 — `docs/decisions/0027-the-hob-is-part-of-the-cabinet.md`.** Both entries are
built and offered: `base-hob-2drawer` ("Corp plită și 2 sertare") and `base-hob-oven` ("Corp plită și
cuptor"), fixed at 600 mm, composed from `baseCabinet`, `builders.cooktop()` and `builders.oven()`
with no new geometry. The seeded `p2` + `p3` are one placement (`base-hob-2drawer-600`); `p3`'s id is
retired rather than reused. The kitchen is unchanged, proven three ways: identical derived state,
330 identical rendered meshes against the M1 reference, and byte-identical 1440 x 900 screenshots.

~~**The accessory machinery was deliberately NOT removed**, which amends the paragraph above.~~
**Removed on 2026-08-28** — the question this paragraph said the deletion wave must decide first is
answered by [ADR 0038](decisions/0038-pre-release-no-stored-designs-no-migrations.md): nothing has
ever been stored, so there are no pre-migration documents to migrate or support. §6.1's host
resolution, §5.1's cascade, `ACCESSORY_MAX_HEIGHT_M`, the `accessory` flag and `cascadedAccessoryIds`
are all deleted, along with the `cooktop-600` entry itself. Do not re-decide this from ADR 0027's
closing paragraph; ADR 0038 supersedes it.

Confirmed at implementation, as the entry asked: **the hob was the only accessory** (`p3` at 40 mm;
the next shortest body is 400 mm, so `ACCESSORY_MAX_HEIGHT_M` has no near-miss), and **§11 row 15 is
now trivially true** — the hob is a child mesh of its cabinet's group, so a click resolves to the
cabinet through `climbToSelectable` without §6.1's accessory rule being consulted, and there is no
hob placement to offer a delete on.

---

## 3. Telling cabinets apart in the replace list — DECIDED 2026-08-26, SHIPPED

**Decision (owner, 2026-08-26): no filter chips. Cabinet thumbnails instead — and they shipped.**

The owner's own framing: filters are not needed at 3-6 rows, but "especially the base" list mixes
base cabinets with full-height columns, and an icon would let you tell them apart fast.

The design already answered that better than a glyph would: mockup frame 2B gives every row a
54 x 54 front-elevation drawing. Those 18 drawings existed only in `design-source/`, which is
untracked and marked for deletion; five more were commissioned (`base-panbank`, `wall-lift`,
`tall-fridge-housing`, `base-hob-2drawer`, `base-bottle-cargo`), and all 23 are now vendored into
`apps/web/public/cabinets/` under version control.

Three of the five replaced drawings the prototype had **reused from a different cabinet**, which was
wrong on screen — `wall-lift` looked like a glass door, `tall-fridge-housing` like a freestanding
appliance. That last pair took two passes: the first revision was right at full size and unreadable
at the real 54 px tile, where both were tall boxes with a horizontal split. They appear in the *same*
list meaning opposite things, so confusing them means ordering the wrong product.

The distinction the owner asked for works: because the tile scales by height, a 700-tall column
drawing renders tall and narrow against a 310-tall base drawing. Verified at both viewports.

**§13.3 q1 is still open and was NOT decided here.** The original concern stands — the prototype's
chips were hand-authored per kind, and unifying swap sets with the fit-filtered catalogue would have
required deriving them from traits the domain does not record. Thumbnails sidestep that entirely:
they key off `buildId`, which exists either way. So q1 can be decided on its own merits later.

---

### Original finding, kept for context

**Reported:** 2026-08-26, owner.
"In the reference, when you click a cabinet and it shows the alternatives, there were filters at the
top of that list — one door, two doors, columns and so on. Why were they not implemented?"

**Not a decision. An omission**, and it is worth being precise about how it happened: §9 is the
authoritative behavioural contract, and its replace-section clause lists only the band's swap set,
the **ACTUAL** badge, the derived count line and the zero-result sentence. The chips appear in
mockup frame 2B and in no spec section. M4 was built from §9, and the mockup was not reconciled
against it — even though M4's own reference line names frames 2A/2B/2C as source material.

**What they actually are**, read out of `Lemnaria Configurator Mobil.dc.html`:

```js
const chips = arr => arr.map((label, i) => ({ label, on: i === 0, off: i !== 0 }));
base_cabinet:      chips(['Toate 5', 'Cu uși 3', 'Sertare 1', 'Cu instalații 1'])
wall_cabinet:      chips(['Toate 5', 'Cu uși 3', 'Deschise 1', 'Electro 1'])
open_shelf_unit:   chips(['Toate 6', 'Cu uși 3', 'Deschise 2', 'Sticlă 1'])
tall_unit:         chips(['Toate 3', 'Depozitare 1', 'Electro 2'])
dishwasher_housing:chips(['Toate 3', 'Cu instalații 1', 'Depozitare 2'])
extractor_hood:    chips(['Toate 3', 'Vizibile 2', 'Încorporate 1'])
```

Sub-type filters *within* an already band-scoped swap set — by door, drawer, plumbed, appliance —
each carrying its own count, defaulting to "Toate N".

Two properties of the prototype matter for deciding this:

- They are **hand-authored per kind**, not derived from any body property. Nothing in the domain
  model today records "has doors" versus "has drawers" as a filterable trait.
- They are **inert in the prototype**. Rendered as `<span>` with a static `on: i === 0` and no click
  handler. The mockup shows the affordance; it never proved the interaction.

**The case is weaker than it looks, and the reason is measured.** Offer-list lengths on the real
catalogue: base **6** rows, wall **5**, top **4**, column **3**, the fridge slot **1**. §13.1 killed
pagination on exactly this arithmetic — *"20 catalogue items reduce to ~6 valid ones and there is
nothing left to paginate"* — and recorded that its pager *"ate 82 px of sheet height"* on mobile. A
chip row costs about the same 44 px and would narrow 5 rows to 3.

**It also collides with an open question.** §13.3 q1 asks whether the hand-authored per-kind swap
sets should be replaced by the fit-filtered catalogue. These chips are per-kind hand-authored sets.
Unify the lists and the chips would have to be **derived** from body traits the model does not
currently carry — so deciding the chips before q1 would be deciding it twice.

**Decision needed**, in this order: settle §13.3 q1 first; then decide whether filters earn their
vertical space at 3-6 rows; and only then, if yes, decide what trait the domain must publish for
them to be derived rather than authored.

---

## 9. A hood round trip costs a wall opening 100 mm of depth, permanently — CLOSED 2026-08-30

**Found by logic review, 2026-08-26; new with wave A.** Over a full-height column, where §7's cap is
lifted, a hood round trip costs the opening 100 mm for good. Measured on `p24` — the 700 mm cabinet
over the freestanding fridge, the one wall opening in the shipped kitchen tall enough to take a
710 mm hood — with the real builders and the real probe:

```
p24 -> wall-2door  600 mm
    -> hood        500 mm
    -> wall-2door  500 mm      <-- 600 never comes back
    -> hood        500 mm
    -> wall-2door  500 mm
```

The domain's own tests cannot see it: a fake probe reports back the depth it was handed, so the same
sequence reads 600 throughout. Only the real probe measures what `make.hood` actually built.

**Why.** `openingFromPlacement` takes the opening's depth from the outgoing body's own
`record.frame.d` (ADR 0018, and the swap-depth fix that put it there). `make.hood(w, chimneyH)` in
`kitchen-parts.ts` takes **no depth parameter at all** — its canopy is a hardcoded 0.5 m box — so the
hood ignores the depth it is handed, the probe measures 500, and 500 is what gets recorded as its
`seatDepthMm`. Swap the hood back out and the opening now measures 500, so the replacement builds
500.

It **converges** rather than oscillating — a second round trip changes nothing — so it is one 100 mm
loss and not a runaway. Arguably it is correct: the opening genuinely is 500 mm deep once a hood is
standing in it. But it is a permanent, invisible 100 mm the customer did not ask for, and the swap
that produced it was supposed to be the operation that stopped changing depths.

Related: the same mechanism is why a placed body's depth never re-derives — see entry 5's closing
paragraph.

**CLOSED 2026-08-30, in the opposite direction from what this entry assumed.**
[ADR 0039](decisions/0039-the-hood-is-a-standard-depth-hung-at-the-front.md) decision 1 makes the
hood's depth **standard** — *"hood is always standard"*, 500 at a 600 mm kitchen and 500 at a 700 mm
one — so `make.hood` is *right* to ignore the depth it is handed and giving it a depth parameter is
explicitly rejected. What had to move is the **seat**: decision 2 hangs the hood at the front, its
face on the 600 mm cabinet-depth line, with the 100 mm gap behind it.

The leak this entry measured is closed by
[ADR 0040](decisions/0040-a-recorded-seat-is-converted-back-not-read-as-a-depth.md): the opening a
body vacates is read through `occupiedDepthM`, which answers the cabinet-depth line for a hood
instead of the hood's own `frame.d`. Shipped in M5 wave 5F. `p24`'s round trip now returns the 600
this entry says "never comes back", and the domain's own tests can see it because the fake probe was
taught the two seats the real one measures — which is the half of this entry's diagnosis that was
right and still is.

~~**Still open, and now a named question inside M5 (2026-08-27).**~~ The owner's worktop-depth rule
(entry 5's second half) governs wall depth through a map, and whether the hood follows it is
**question 1** in `docs/milestones/M5-width.md`'s *Not established — Depth*. The two are one
decision: putting the hood in the map means giving `make.hood` a depth parameter, which is what this
entry says it lacks. M5 wave 5A pins `hood-600` at 500 as a regression **precisely because the
question is open** — the day it is decided, that assertion changes deliberately.

---

## 10. Swap and delete-then-insert give a wall cabinet different depths — CLOSED 2026-09-02, SHIPPED IN M6 WAVE 6I2

**CLOSED 2026-09-02 by [ADR 0060](decisions/0060-a-column-publishes-a-build-depth-beside-its-clearance.md), implemented in M6 wave 6I2.**
The third reading — *"they should simply agree"* — is the one the owner took, and the value is
**600**: swap's number, and the smaller of the two measured here. A column now publishes a **build
depth** beside its clearance, and both routes read it, so §5.3's promise that a swap is not a delete
plus an insert holds numerically as well as structurally. The 680 this entry records was §3.2's MAX
over the run (742 since wave S9, once appliance handles were measured); it is a clearance and no
route builds a cabinet to it any more.

### The finding, as recorded before it was closed

**Found by the coordinator while verifying the R3.1 fix, 2026-08-26.** Measured on the shipped
kitchen, over the fridge column `B|2.45`:

```
p24 as shipped                      600 mm
SWAP p24 -> wall-2door              600 mm   (preserves the outgoing body's frame)
DELETE p24, then insert wall-2door  680 mm   (takes the void's own depth)
```

Both follow rules that are individually correct. A swap in place reads the outgoing body's `frame.d`
— that is the fix for the original protruding-cabinet defect. An insert into an empty void reads
`void.d`, which is `Column.d`, §3.2's MAX over the run — here the freestanding fridge's 680 mm.

So two routes to the same end state — "a `wall-2door` in this slot" — produce cabinets 80 mm apart,
and which one the customer gets depends on whether they replaced the cabinet or deleted it first.

This is the concrete form of what logic review raised as R3.2: the cap is evadable by ordering,
because `hasFullHeightUnder` is re-answered for future inserts while a placed body's depth is a
persisted fact. Fixing R3.1 removed the *harmful* instance (a 580 mm carcass over a worktop). This
one is not harmful — 680 mm is genuinely the column's depth and there is no worktop to lean over, so
it violates no rule in backlog entry 5 — but it is an inconsistency a customer can reach.

**Not fixed, because the right answer is not obvious.** Three readings, all defensible:

- **680 is correct.** The opening really is that deep; a cabinet flush with the fridge front is a
  normal thing to build. The rule says "as deep as the column" and the column is 680.
- **600 is correct.** The seeded design chose 600 over this fridge deliberately, and an insert should
  not silently exceed what the kitchen was designed with.
- **They should simply agree**, whichever value wins, because "delete then re-add" and "replace" are
  the same intent expressed two ways, and §5.3 exists precisely so a swap is not a delete plus an
  insert.

The third is the one worth deciding first: the divergence matters more than the number.

Related: entry 9 (a hood round trip costing 100 mm) is the same mechanism — a placed body's depth is
a persisted fact and nothing re-derives it.

**Not superseded by M5, and the reason is worth stating (2026-08-27).** M5 wave 5A makes the worktop
→ wall depth map the single source for §7's nominal and §5.2's cap. That governs the **capped** path
only. This entry lives on the **uncapped** path — over a full-height column, where
`hasFullHeightUnder` lifts the cap and both 600 and 680 are legitimately the column's depth. So 5A
fixes the sibling defect over a base run and leaves this divergence exactly as measured. It is
recorded as **question 8** in `docs/milestones/M5-width.md`'s *Not established — Depth* so M5 does
not mistake it for something already handled.

## 11. `base-dishwasher` offers a finish and a handle it has neither of — DECIDED 2026-09-01, SHIPPED

**Decided by the owner on 2026-09-01: give the niche a decor door**, not the one-line
`canFinish: false, canHandle: false` this entry named — following Q6 and
[ADR 0050](decisions/0050-the-hob-oven-filler-is-a-finishable-front.md), and recorded on this body's
own terms as [ADR 0051](decisions/0051-the-dishwasher-niche-wears-a-decor-door.md). Shipped as M5B
wave 5B10. The product question this entry said to ask first is what got asked, and the answer was
the one it predicted: *the flags were right all along and the geometry is what is missing.*

What landed: `dishwasherHousing` builds its own `door_front` with `doorSlab` at `baseCabinet`'s
anchors, so it is flush with its neighbours by construction and `FRONT_MESH_NAME` reaches it with no
rename; the appliance inside a housing is built **fully integrated** (`dw_body` only), so the only
handle left in the body is the door's and `handle: "push"` hides a cabinet's bar rather than a
dishwasher's; neither flag changed; occupied depth followed the geometry down 632 → 620 mm and the
580 mm seat did not move; both ids left `RECORDED_CAPABILITY_GAPS`, which is now empty. M1's 1e-6 m
parity gate was re-baselined per ADR 0036's rule — each added and removed node declared with its
parent and count — never relaxed.

**Its `tall-oven-tower` tail is deferred and lives on as entry 18**, because closing this entry must
not delete the only pointer to it.

### The finding, as recorded before it was decided

Found 2026-08-27 by the catalogue-wide capability gate added with ADR 0027's amendment
(`packages/three-adapter/tests/catalog-capability-parity.test.ts`), which asserts that a row
declaring `canFinish` has a front to recolour and a row declaring `canHandle` has a **cabinet**
handle — one whose group also holds the front it opens, as against an appliance's own.

`base-dishwasher` builds an open niche: plinth, two sides, a back panel, a worktop, and
`builders.dishwasher` inside it. It has no `door_front` and no handle of its own, yet inherits
`canFinish: true, canHandle: true` from `INSERTABLE_DEFAULTS`. Measured consequences are the ones
`base-hob-oven` had before it was fixed in the same pass: the five finish chips recolour nothing,
and `handle: "push"` hides the **dishwasher's** own bar.

It is the identical defect to `base-hob-oven`'s and the identical one-line fix — `canFinish: false,
canHandle: false`, the way `open-shelf` and `hood` already declare. It is here rather than fixed
because the owner scoped that wave to the new entry. Until it is decided the id is pinned in the
gate's `RECORDED_CAPABILITY_GAPS`, and that pin asserts the defect is **still present**, so the day
someone repairs the row the gate goes red and the pin comes out with it.

**Two ids, one defect.** Since 2026-08-27 the gate covers the seeded population as well, and
`base-dishwasher-600` — the seeded instance, whose builder arm is `kit.builders["base-dishwasher"]()`
verbatim — is on the list beside it for the same reason. Whichever way this is decided, both move
together. The four other violations the extended gate found (`fridge-free-700`, `open-shelf-600`,
`hood-600`, `cooktop-600`) were fixed in that pass; see ADR 0027's amendment.

**The product question worth asking first**, since it is the reason someone might not want the
one-line fix: an integrated dishwasher in a real kitchen usually wears a decor door matching the
cabinets. If that is wanted, the answer is not to turn the flags off but to give the builder a
front — in which case the flags were right all along and the *geometry* is what is missing.
`tall-oven-tower` has related appliance-handle exposure (`push` hides its oven's and microwave's
bars alongside its two real door handles) and was scoped out of the same wave; it belongs to
whoever owns §6.5.

**Q6 answered the product question this entry says to ask first — for the other body (2026-09-01).**
M5B wave 5B6 met the identical choice on `base-hob-oven` and the owner chose **give it a front**,
not turn the flags off: [ADR 0050](decisions/0050-the-hob-oven-filler-is-a-finishable-front.md). That
is precedent, not a ruling on this row — a hob band's filler panel and an integrated dishwasher's
decor door are different products — but it does mean the "one-line fix" framing above is no longer
the neutral default. Whoever picks this up should read ADR 0050 before assuming
`canFinish: false, canHandle: false` is what the owner wants.

**Confirmed live at the mobile viewport, 2026-09-01** by visual verification of that wave. The niche
fascia stays `222,223,221` under all four finishes while its immediate neighbour tracks each one,
and the chip still records the pick (`finish-graphite` → `aria-pressed="true"`, no rejection). So the
customer is told the choice was accepted and nothing changes — which is exactly the complaint that
opened Q6, still live on this body. `dishwasherHousing` (`packages/three-adapter/src/kitchen-parts.ts:1438`)
builds no `door_front`/`drawer_front` mesh, so `FRONT_MESH_NAME` reaches nothing.

## 14. Keep only the last few database dumps — DECIDED 2026-08-31, SHIPPED 2026-08-31

Owner's request, 2026-08-31: the nightly export should keep only the **last 3 dumps** rather than
letting them accumulate.

**What is actually true in the code.** Rotation already exists and already deletes — it is just
keyed on age, not on count. `apps/web/src/lib/server/backup-designs.ts:20` sets
`BACKUP_RETENTION_DAYS = 14`, and `rotateOldBackups` (`:350`) deletes every blob under
`backups/designs/` whose timestamp is older than that cutoff. The cron runs nightly, so steady state
is roughly **14 files**, one per night, each a full NDJSON copy of the `designs` table. Rotation runs
only after a successful export and its failure is reported separately as `rotation-failed`, so a
failed rotation never masks a missing backup.

Since wave S5 each pathname is `backups/designs/<ISO timestamp>-<8 hex>.ndjson`. The timestamp still
leads and is fixed width, so a listing remains in chronological order and "newest last" holds —
count-based rotation can sort on the same listing rotation already fetches, and needs no new call.

**What deciding it costs.** The change itself is small: replace the age cutoff with "sort the
listing, keep the newest N, delete the rest", plus a test for the boundary (exactly N present, N+1
present, and a run that produced no new export). Two things need deciding with it, and they are the
real content of this entry:

- **Recovery window.** 14 days of nightly dumps means a mistake can be undone up to two weeks later.
  Three dumps means three days. `docs/runbooks/design-db-restore.md` tells the operator to "pick the
  newest export at or before the point you're recovering to" — with three files, any corruption
  noticed on a Thursday that began the previous week is unrecoverable. That is a deliberate trade of
  recovery depth for storage, and it should be made knowingly rather than as a side effect of tidying.
- **Which rule wins.** Keeping "the last 3" and "nothing older than 14 days" are different policies.
  Pick one as authoritative, or state both (keep at least 3, and at most 14 days) so the code has a
  single answer when they disagree — for example after a fortnight in which the cron did not run.

Storage is the argument for acting: each dump is a full copy of the table, so the folder grows with
`rows x nights`, and ADR 0019's deferred retention cron means the table itself is currently unbounded
(SEC-001). Worth noting the two interact — bounding the dumps does not bound what each dump contains.

**Not urgent at current size.** With no real customers the table is small and 14 nightly copies of it
cost very little. This is a policy decision to take before launch, not a defect.

**DECIDED 2026-08-31: age stays the rule, and a count ceiling was added beside it.**

The owner asked for "keep the last 3" and, after the trade was laid out, chose to keep the 14-day
window and add a ceiling instead. The reasoning that decided it: the two pressures move in opposite
directions. Storage is cheap now — the table is nearly empty and a dump is a few kilobytes — and only
becomes expensive once there are thousands of real designs, which is exactly when losing two weeks of
recovery depth would hurt most. A window also has to outlast the time it takes somebody to *notice* a
problem, and nobody watches this daily; three nightly dumps is a three-day window, inside which a
Friday mistake found the following Wednesday is already unrecoverable, with deletion final and no
undo.

Shipped as `MAX_RETAINED_BACKUPS = 30` in `apps/web/src/lib/server/backup-designs.ts`, alongside the
unchanged `BACKUP_RETENTION_DAYS = 14`. Age is authoritative; the ceiling never binds in normal
nightly operation (steady state is ~14 files) and exists for the abnormal case — a redelivered cron,
a manual `runDesignsBackup` loop, or any future schedule more frequent than daily — which would
otherwise grow the folder without bound between one night's rotation and the next. A blob caught by
both rules is deleted once.

**What this does not bound**, and it is the larger number: the size of each dump. Every file is a
full copy of `designs`, and the table itself is unbounded until ADR 0019 decision 7's retention cron
ships at M8 — which is blocked on the credential question recorded in that gate, since no role in the
system may currently delete.

## 15. A wall cabinet over a full-height column is built to a depth no one manufactures — CLOSED 2026-09-02, SHIPPED IN M6 WAVE 6I2

**CLOSED 2026-09-02 by [ADR 0060](decisions/0060-a-column-publishes-a-build-depth-beside-its-clearance.md), implemented in M6 wave 6I2.**
This entry's own diagnosis is the fix: the column publishes **two** facts. `occupiedDepthM` keeps its
meaning and its value as the **clearance**, and a separate declared **build depth** — the map's wall
depth where the cap applies, the cabinet-depth line where a full-height member lifts it, and never
the clearance MAX — is what `resolveDepthM` hands the probe. The two are different nominal types
(`ClearanceM`, `BuildDepthM`), so reading one as the other is a compile error rather than a comment.
703 and 742 are unreachable: the uncapped arm no longer computes anything.

**Entry 9 is the same seam a third time**, and it was re-read before this one was closed: a placed
body's depth is a persisted fact that nothing re-derives. It is already closed by
[ADR 0040](decisions/0040-a-recorded-seat-is-converted-back-not-read-as-a-depth.md) — the opening a
body vacates is read through `occupiedDepthM` rather than through the outgoing body's own `frame.d`.
That is the *clearance* half of this seam; wave 6I2 closes the *build depth* half. Nothing about
entry 9's closure changes.

### The finding, as recorded before it was closed

**Reproduced live in the running product at 390 x 844, 2026-08-31**, during wave S9 of the
adversarial-review remediation. Delete `p24` — the cabinet over the fridge — and insert a
`wall-cabinet` back into the void it vacates. The document written to the database carries
**`seatDepthMm: 703`**: a 742 mm finished wall cabinet hanging over a 680 mm appliance. It was
persisted with `probe=on`, an **empty `rejection`**, and zero console errors. **No gate on that path
paused.**

**It has no user-facing tell, which is the part that makes it urgent.**

- **The panel surfaces no depth at all.** The offer sheet for that opening reads *"Spatiu liber ·
  Perete B · suspendat · 700 x 750 mm"* — width and height only. The 703 appears on **no screen in
  the product**.
- **Neither the void nor the rebuilt body looks wrong.** The void is a clean box above the fridge and
  the rebuilt cabinet renders as a plausible deep cabinet. A person would flag neither, and would
  catch it only by comparing against the 330 mm run on the other wall.
- **No camera preset shows wall B at a grazing angle** — *Perete B* is face on and *Perete A* frames
  the other run — so that column's depth is not legible in any view the product offers.

Silent in the copy, silent in the render, and it lands as a carcass nobody ordered. That is what
should decide its priority: a spec-to-manufacture defect, not a cosmetic one.

**What is actually true in the code.** `resolveDepthM`'s uncapped arm reads `opening.d` when
`hasFullHeightUnder` is true, and `opening.d` comes from `occupiedDepthM`. Two different facts are
being served by one number:

- *"the full extent a body occupies, handles included"* — a **clearance** fact, which is what §3.1
  asks for and what `occupiedDepthM` computes;
- *"the depth to build the next body to"* — a **manufactured size**, which is what `resolveDepthM`
  hands the probe.

Only the first is the one it computes. `packages/configurator-domain/src/worktop-depth.ts` exists
precisely so a formula cannot invent a cabinet nobody makes — its declared map is a declaration and
never an interpolation, *because* a formula would produce a 372 mm cabinet no one manufactures — and
the uncapped arm is a formula doing exactly that, one module over.

**It pre-dates wave S9, and S9 worsened it.** The arm built a **680 mm** wall carcass before the
wave, which is no more manufacturable than a 742 mm one, so the defect is not new and S9 did not
introduce it. What changed is that the number the arm reads is now the full extent including
appliance handles — further from any real cabinet than it was — and that it is reached on **two
columns of the shipped kitchen rather than none**: `B|1.20` moved 600 → 638 (the oven tower's
appliance bars) and `B|2.45` moved 680 → 742 (the fridge's door bars). Deleting the top cabinet is an
ordinary action and leaves the full-height member standing, so `hasFullHeightUnder` stays true and
the uncapped arm is what answers.

**What deciding it would cost.** Separating clearance from build depth is the real fix, and it is a
**product decision, not a bug fix** — nobody should pick this up expecting a one-line patch.
Whether that arm should read `opening.d` at all is the question: a wall cabinet flush with a fridge
front may be exactly what a customer wants, or the cap may belong there too, or the column may need
to publish two numbers — the space a body occupies and the depth the next body is built to — which
is a new fact in the model with `deriveColumns`, the swap opening and the void mesh all reading it
today. Changing `resolveDepthM` inside a wave scoped to DOM-002 would have been the silent product
change the remediation exists to stop, which is why it was recorded rather than fixed.

**Evidence.** Commit `f9b92e1` (wave S9, closing DOM-002); the wave S9 summary in
`docs/milestones/adversarial-review-remediation.md`; and `testing-reports/03-domain-model.md`, whose
DOM-002 finding is what the wave was scoped to.

Related: entry 10 is the same seam from the other side — two routes to "a wall cabinet in this slot"
producing different depths on the uncapped path — and entry 5 is the capped sibling.

## 22. A partly emptied column forgets what it freed, and UX-2 is only half closed — CLOSED 2026-09-02

**CLOSED by M5 wave 5H — [ADR 0053](decisions/0053-the-design-document-records-the-whole-frozen-map.md).**
A second stored array, `columnExtents`, carries the frozen extent of a column that still holds a
member — the half `emptyColumns` (ADR 0044) never covered. Both routes below now survive a reload:
the partial delete (`p7` cleared with `p24` standing keeps its two openings) and the clear-then-refill
route that mattered more (clearing `A|2.60` and refilling it with an exact-fit dishwasher keeps the
column's full 2600 mm rather than shrinking to 860). Made safe by monotone vertical containment (a
restored extent can only widen a column, never lose a member) plus a same-wall overlap sweep that
catches what containment alone cannot — see ADR 0053 for why containment was insufficient by itself
and what closed the gap. Verified: domain 1433 (twice, identical), web 786–788 (+4 skipped),
persistence 177; `pnpm ci:local` all nine gates PASS.

### The finding, as recorded before it was closed

Found by the 5B2b logic review and confirmed on screen by visual verification (2026-09-01). Delete
`p7` while `p24` still stands above it: in session the freed space shows as two openings, 700x860
and 700x350, span 1850. Reload, and **both are gone** — the column shows only `p24`. The stored
document carries `emptyColumns: undefined`, because `projectEmptyColumns` skips any key a placement
is filed under.

That is not a bug in wave 5B2. It is ADR 0044's scope: the record persists **member-less** columns,
and this column still has a member. ADR 0011 Gap D then forbids the obvious repair — re-deriving an
occupied column's extent from its current records is precisely the move Gap D exists to prevent, and
it is what would drop the region the customer just freed.

So the two available fixes are both above a wave's pay grade: **widen ADR 0044** from member-less
columns to the whole frozen map, or **accept the divergence and say so**. 5B2b accepted it, on the
grounds that before this wave reload re-derived *every* column and nothing survived at all — this is
strictly an improvement, not a new loss.

**What is already true.** The divergence is pinned as a red-when-fixed test
(`apps/web/tests/store/empty-columns-reload.test.ts:428-449`), and criterion 4's sweep excludes
exactly these keys — an exclusion proved to be the diverging set exactly, not an approximation, and
one a member-less column can never enter.

**A second route, found 2026-09-01 by wave 5B4b's visual verification — cheaper and costlier than
the first.** Clear a column entirely, insert a body that fits it exactly, reload. The wall
(600 x 700) and top (600 x 400) openings *above* the new body are selectable before the reload and
gone after. Isolated with no split and no merge involved: clear `A|2.60`, insert an exact-fit 600 mm
dishwasher, reload.

It is the same mechanism. The insert makes the column occupied, so `projectEmptyColumns` skips its
key; the stored entry recording a 2600 mm extent is dropped; and the restored column's `top` comes
from its members, which now reach 860. The column silently shrinks from 2600 to 860 and two usable
openings disappear.

This route matters more than the partial delete that opened this entry. It takes three taps rather
than a contrived sequence, it is a *natural* thing to do — fill a column you just cleared — and what
it costs is not a sliver but 1740 mm of a full-height column. Whoever schedules this work should
size it against this route, not the original one.

**So UX-2 is closed for a whole cleared column and for a shrink strip, and open for a partial
delete and for a column refilled after clearing.** Whoever picks this up is deciding whether the document records the frozen map or only its
empty members, and that is an ADR, not a work item. Gap D's own 2026-08-26 correction is the
precedent for recording "one design, two answers by route" as its own decision.

## 24. The e2e suite went six days without being run, and a rename had silently broken it — CLOSED

**Closed 2026-09-02, the same day it was raised**, by adding an `e2e` gate to
`.github/workflows/ci.yml` **and** to `scripts/local-ci.sh` in one change, so the two stay mirrored
as the script's own header promises.

**Confirmed green on a real runner**, run `33627120272`: ten jobs, all successful, e2e reporting
**21 passed in 13.1 minutes**. It took four rounds to get there and every one found something real —
a secret naming a database the allow-list does not permit, `next dev` compiling routes inside each
spec's timeout, a scroll assertion that sampled once after a fixed wait, and finally a synthesised
scroll gesture that does nothing on that browser. None of them was a flake to wait out.

The gap was worse than this entry first described. It said `ci:local` does not run Playwright, which
was true — but neither did the workflow. Its nine jobs were `install`, `format`, `lint`, `typecheck`,
`test`, `build`, `boundary`, `lockfile`, `sca`, and **not one of them ran the e2e suite**. So the six
days were luck rather than a near miss: no gate anywhere would have caught it, at any point, on any
branch.

**What the fix needed, none of it obvious from the entry.** The runner has no browsers, so the job
installs Chromium alone — both projects in `playwright.config.ts` pin `defaultBrowserType:
"chromium"`, so the full set would download browsers no spec can select. It reuses the `test` job's
`TEST_DATABASE_URL` secret and its fail-early assertion. And it inherits a documented weakness worth
naming: `assertSafeTestDatabaseUrl` compares the test database's name against the application's and
returns early when no `DATABASE_URL` is set, which CI deliberately does not set — so on a runner only
the allow-list half of that guard is live. That half is the one that matters, but the comparison is
vacuous there, exactly as finding DB-001 described.

**Proved non-vacuous rather than assumed.** Reintroducing the original defect — `offer-base-cabinet`
back to `offer-base-2door` — turns the new gate red (20 passed, 1 failed, exit 1); reverting restores
it. A gate that would not have caught the bug that motivated it is decoration.

The cost is about a minute locally, which lands on `pre-push` too. That hook already advertises
"a few minutes" as its trade, so the addition is consistent with what it promises rather than a new
tax nobody agreed to.

**Two defects the security review caught in the fix itself, both invisible locally.** The `e2e` and
`test` jobs share one Neon database and, needing only `install`, would have run **in parallel** on
GitHub — while the live persistence suites execute DDL on the shared `designs` table (`drop column
if exists revision`, and the same for `write_token_hash`), each with a window before `runMigrations`
restores it. An e2e `POST /api/designs` landing in that window fails for a reason nobody could
reproduce, because `scripts/local-ci.sh` runs the two serially. Fixed by `needs: [install, test]`.
And `playwright.config.ts`'s `webServer` waited on `/`, a bare `redirect()` that compiles in
milliseconds, so the server was declared ready before the three.js configurator was built and the
compile landed inside a 30 s test rather than the 60 s startup window — harmless on a warm local
cache, an intermittent timeout on a cold runner. Now it waits on the page the specs actually open.
Retries were considered and rejected: a retry hides a flake instead of fixing it.

**And a third, found only by running it on a real runner (2026-09-02).** The first CI run took
**13.3 minutes** — `signature-flow` alone 5.8 of them, against about one minute for the whole suite
locally — and three specs failed on the 30 s default timeout while doing nothing wrong. The cause is
`next dev`: it compiles each route on first request, so on a two-core runner with a cold Turbopack
cache every spec that opens a new page pays a compile inside its own timeout. Fixed by serving a
**production build on CI** (`next build && next start`) and keeping `next dev` locally, where the
trade is reversed — a build would add a minute to a suite that finishes in one, and a developer wants
the tree they are editing. The per-test timeout is raised to 120 s on CI as well; `retries` was again
declined for the same reason as before. Verified by running the CI path locally (`CI=1 pnpm
test:e2e`): 21 passed in 1.2 minutes *including* the build, with the previously failing
`editor-rail.desktop:278` passing in 6.4 s. It is also the more honest target — a production build is
what Vercel serves.

**And a fourth, which only a runner could show (2026-09-02).** With the production build in place the
timeouts went away, and one genuine test-robustness bug was left standing:
`editor-panel.e2e.spec.ts:188` sampled `scrollTop` **once**, after a fixed 400 ms wait, following a
CDP `Input.synthesizeScrollGesture`. That call returns when the gesture is *dispatched*, and the
smooth scroll it starts runs for roughly 200 ms — so the assertion was always a race, and this
laptop simply always won it. The runner lost, reading 0 while everything about the sheet was
correct. Now it polls for the condition, which still fails if the body genuinely does not scroll.

**Corrected the same day: the scroll failure was not a race, and polling did not fix it.** The poll
ran 17.6 s and `scrollTop` never moved, and the failure screenshot — downloaded from the artifact the
job uploads, which is what that upload is for — showed the sheet open with eight offers, its footer
pinned, and the list sitting at the top untouched. So the gesture was dispatched and did nothing.
The cause was `Input.synthesizeScrollGesture` itself: it is a *synthesised smooth-scroll animation*,
not a touch drag, and it works on a developer machine and not on that runner. Replaced with
`Input.dispatchTouchEvent` — start, a few moves, end — which needs none of that machinery, is
handled synchronously, and is closer to what the test is about, since this is the mobile sheet and a
finger is the interaction it describes. Two inferences were made and one was wrong before the
evidence was fetched; the artifact should have been the first move, not the third.

**What the production build did not fix, and the honest number.** The suite still takes **13.2
minutes** on a runner against about one locally, with `signature-flow` alone at 5.7 — essentially
unchanged by the build. So route compilation was not the dominant cost; the likely remainder is
three.js rendering through software rasterisation on a machine with no GPU, which no configuration
change here addresses. Left as measured rather than guessed at. CI runs only on pull requests to
`main` and pushes to `main`, so this lands per push while a PR is open rather than on every branch
push, which is what makes 13 minutes tolerable rather than something to optimise now.

**One thing to know before widening the failure artifact.** A Playwright trace records response
headers, and `POST /api/designs` returns the write token in `Set-Cookie` — so a failure artifact
carries a live write token for a *test-database* row. Acceptable here (private repo, 7-day
retention, a database ADR 0006 keeps apart from the application's) and not a pattern to reuse
against real data.

*Original finding, kept for the record:*

Found while closing M5B (2026-09-02). `pnpm --filter @lemnaria/web test:e2e` was red:
§10's signature flow at 390x844 failed on `getByTestId("offer-base-2door")`, expected 1, received 0.

Not a regression from any M5B wave. The panel builds its test id as `offer-${row.buildId}`
(`editor-panel.tsx:269`), and commit `3cc3ed3` (2026-08-27, M5 waves 5C2+5C3) merged `base-2door` and
`base-1door` into one `base-cabinet` row under ADR 0033 — the door count became a consequence of the
width rather than a product to pick. The e2e spec was last touched **2026-08-26, the day before**.
`wall-2door` -> `wall-cabinet` was stale in the same file for the same reason.

**So the test had been red for six days and nothing said so**, because the suite had not been run
since 2026-08-26. Every other gate stayed green throughout: the rename was consistent everywhere the
unit suites look, and no unit test asserts a DOM test id. Fixed by renaming both ids in the spec;
the suite is now 21 passed, 1 skipped, 0 failed.

**What is worth fixing is the gap, not the ids.** `pnpm ci:local` runs format, lint, typecheck, test,
build, boundary, lockfile and sca — it does **not** run Playwright. That is a defensible choice (the
e2e run takes about a minute and needs a browser), but it means the only thing standing between a
broken e2e suite and a milestone close-out is somebody remembering. Here nobody did: this run
happened only because the scribe closing M5B noticed the milestone's own Verification method asks for
it and said it could not certify that it had run.

Options, cheapest first: run it in CI on the remote rather than locally; add it to `ci:local` behind a
flag the milestone close-out sets; or add a staleness check like
`packages/configurator-domain/tests/dist-module-graph.test.ts`'s, failing when the catalogue's row ids
have changed since the e2e spec was last touched. The third is the narrowest and would have caught
exactly this.

Not scheduled. Worth deciding before the next milestone closes on an unrun gate.

## 31. A store action that throws leaves no trace on any surface

Found 2026-09-05 by the visual pass on wave 6K-b, while the `reseat` crash was still live.

Pressing *Aplică* on the depth control threw out of `setCabinetDepth`. Nothing recovered: the sheet
**stayed open** with 700 still selected, `data-rejection` stayed empty, and in production there is no
message at all — a dead button. Nothing was written and the app stayed usable, which is why no gate
saw it.

**The crash itself is fixed** (wave 6K-d gave the probe the scene's own dispatch, so `reseat` can
measure a structural body). What remains is the shape: `applyPending` in
`apps/web/src/settings/global-settings.tsx` calls `close()` **after** the command, so any future
throw strands the sheet.

**Not a general error-handling change, and deliberately not routed to `lastRejection`** — ruled
2026-09-05. That field is a `RejectionReason` with a code and rendered Romanian copy; a thrown
`Error` has neither, so putting one there means inventing a code or showing a customer a developer
string. `apps/web/src/store/apply-command-result.ts:116` already takes the opposite stance in as many
words: *"uncaught by design … a loud failure is the lesser harm"*.

Two candidate fixes, both narrow:

- `close()` in a `finally`, so the sheet always closes and the customer is not left pressing a dead
  button. Smallest, and it says nothing about what went wrong.
- An error boundary around the sheet, which can say *something* went wrong without inventing a
  domain code. Larger, and it is the only one of the two that leaves a trace.

Not scheduled. Worth deciding before any surface gains an action that can throw.

## 32. The chips row grows past the column; only the chips themselves are contained

Found 2026-09-05 by the visual pass on wave 6K-d/6K-e, at 390 x 844.

Wave 6K-b3 reverted a third chip after it intercepted pointer events over the price bar and took 44
e2e tests down, and added `min-width: 0; overflow: hidden; text-overflow: ellipsis` to `.chip`. That
rule works — every chip ellipsises, measured. **The containment leak is one level up.**
`.settingsRow` keeps its flex default `min-width: auto` and grows past its column:

| chips | `.settingsRow` width | trigger's right edge |
| --- | --- | --- |
| 2 | 390 (fits) | on screen |
| 3 | 442 | **412**, off a 390 px screen |
| 3 (long label) | 563 | further off |
| 4 | 632 | further off |

`body.scrollWidth` reaches 442 against `documentElement.clientWidth` 390. The failure mode changed
from *"chips cover the trigger"* to *"trigger leaves the screen"* — a different defect, not a fixed
one.

`apps/web/src/settings/global-settings.module.css:33` claims a fourth chip *"narrows the three rather
than breaking anything"*. That claim is measurably false and should be corrected whatever is decided
here, because it is the reason the next person will add a chip without measuring.

~~Harmless today at two chips. **Blocks wave 6R**, which adds a finish control and therefore a
third.~~

**Ruled by the owner 2026-09-05 and closed —
[ADR 0082](decisions/0082-the-settings-strip-wraps-and-nothing-leaves-the-viewport.md).** Nothing may
leave the viewport at any chip count; the chips **wrap**, and vertical growth is the accepted currency
— *"even if you need to just increase the height and take from the vertical height, I'm totally okay
with this"*. Horizontal scrolling is refused, and a chip is never narrowed below the line it is alone
on. **It lands as a scope addition inside wave 6R**, with measured criteria at two, three, four and
five chips on both shells; see that wave in `milestones/M6-price-and-global-settings.md`.

**Two corrections to this entry, recorded rather than edited away.** *"Blocks wave 6R, which adds a
finish control and therefore a third"* rests on a misreading of 6R's scope — **6R adds no chip**, its
finish control being per cabinet in the editor panel, while the whole-kitchen settings are material,
hardware and cabinet depth. And *"harmless today at two chips"* is too kind: a chip's label carries a
price-book tier name, and the book is data authored outside TypeScript (ADR 0062 seam 1), so a long
tier name reaches the same overflow with today's two.

## 33. The settings trigger is a 93.5 x 13 px touch target

Found 2026-09-05 by the visual pass on wave 6K-d/6K-e, at 390 x 844.

`.trigger` has `padding: 0`, so its tappable box is the text line box — 13 px tall. The 40 px pill a
customer sees around it is `.anchor`, a different element. Every other control on the surface is
fine: `Aplică` 86x44, `Renunță` 98x44, the depth options 354x51 and 354x49.

Pre-existing and not introduced by any 6K wave, but it is the control that opens the whole
whole-kitchen settings surface, so it is the one worth fixing first.

**Scheduled 2026-09-05 into wave 6R, alongside entry 32 —
[ADR 0082](decisions/0082-the-settings-strip-wraps-and-nothing-leaves-the-viewport.md) decision 8.**
Not itself owner-ruled; scheduled by the architect for a stated reason. It is a different defect, but
it lives in the same two stylesheets, on the same control, and the wave's visual gate measures that
strip anyway — fixing them separately means measuring the same row twice. The trigger's tappable box
becomes at least `var(--touch-target)` (44 px, already declared in `globals.css`) on both shells,
**without pushing a chip off the line it is on**.

## 34. One interrupted persistence run reds the whole package until repaired

Found 2026-09-05 while verifying gates on `d4e58a4`.

`packages/persistence`' live-database suite failed with
`MigrationSequenceError: Migration 4 ... is recorded as applied, but 2 ... is not`, and
`column "write_token_hash" of relation "designs" does not exist` — 2 failed, 171 passed.

Cause: the adversarial test *"re-adds the column after it is dropped, so a no-op run cannot pass"*
drops `write_token_hash` and re-applies the migration. If anything interrupts it between the two, the
ledger is left recording migrations 3 and 4 without 2, and **every** live-database test in the
package then fails the sequence check — not just the one that broke.

It self-repaired on a later run (177 passed, verified), so there is nothing to fix in the database
now. What is worth fixing is the fragility: one interrupted run reds an entire package, and the error
tells the reader to *"resolve the gap by hand"* with no documented repair.

Not scheduled.

## 35. The joint-seat non-intersection gate needs oriented boxes, not AABBs

Wave 6K-g work item 8, attempted 2026-09-05 and **not shipped**.

ADR 0077 excuses a `joint`-seated entry from `declared-frame-depth-sweep.test.ts` — it has no plane
of its own to measure — and the excuse is only honest if what replaces it is stronger. The
replacement the wave specifies is a whole-room gate: no two placed carcasses may occupy the same
space, run on the seeded design **and** on the design a round trip produces.

**Written, measured, and withdrawn.** Built from `THREE.Box3` over every mesh whose name starts with
`carcass`, placed exactly as `scene-sync` places them (`frame.x`, `frame.y0`, `frame.z`, `frame.ry`)
and built through `rebuildDepthM` so a fronted shell is not 39 mm shallow. Two things it got right,
recorded because the next attempt needs them:

- The volumes separate cleanly. Neighbouring cabinets sharing a plane report **at most 1.2e-8 m³** of
  floating-point sliver; a genuine intersection reports **4.5e-3 m³** or more. A threshold of
  `1e-6 m³` sits in five orders of magnitude of empty space.
- The **round-trip arms passed**, which is the signal that matters: after `600 → 700 → 600` the
  corner legs no longer intersect, so wave 6K-g's fix holds.

**Why it is not shipped.** An axis-aligned box cannot express a body rotated 90°, and the L corner is
where every joint-seated body lives. The gate reports three intersections on the **seeded** fixture —
`p25 ∩ p26` at 4.9e-2 m³, `p8 ∩ p9` at 7.8e-3, `p15 ∩ p21` at 4.5e-3 — all of them pairs on different
walls whose AABBs overlap in the corner square while the solids do not touch. ADR 0077's own
measurement avoided this by comparing the z extent alone.

Whitelisting those three pairs would rebuild the hand-written exception set 6K-g just deleted, so it
was not done. The gate needs oriented bounding boxes, or a per-pair comparison in the shared local
frame, before it says anything true.

Not scheduled. Until it lands, the joint arm's only gate is the seat it declares.

## 36. `HEIGHT_EXCEEDS_LEVEL` refuses a depth change after two ordinary deletes

Found 2026-09-05 by adversarial QA on wave 6K-c; adjudication deferred by
[ADR 0079](decisions/0079-a-republished-depth-names-the-body-it-came-from.md), which records it
under *"Finding, recorded and NOT ruled here"*. Wave 6K-c closed **around** it, not over it.

A four-step sweep from the shipped fixture reaches 34 trails on which a `setCabinetDepth` is
refused with `HEIGHT_EXCEEDS_LEVEL`. Every one contains the same minimal reproduction — two deletes
of a non-source member of `A|2.00` (`open-shelf-600` and `wall-2door-600-top`) before the depth
change — so **34 is one defect's closure over the sweep alphabet, not 34 defects**: 2 three-step
trails plus 32 four-step, the latter being 16 distinct three-prefixes at each of the two settings.

It reproduces without wave 6K-c's field and is older than that wave.

**Bounded, with a tripwire.** `apps/web/tests/store/qa-6k-c-frozen-source.adversarial.test.ts:771`
asserts the code set is exactly `["HEIGHT_EXCEEDS_LEVEL"]`, that every trail carries the minimal
reproduction, and the exact set of trails as data. A thirty-fifth trail, or a refusal of any other
code, turns it red the day it appears. Deliberately **not** an `it.fails`, which would keep passing
if three refusals became thirty.

Whichever wave adjudicates ADR 0079's finding deletes that block.

## 37. Two pinned deep tops are 100 mm proud if a depth change ever reaches them

Found 2026-09-05 by the logic review on wave 6K-j; ruled as fixture-bounded safety by
[ADR 0080](decisions/0080-an-empty-space-follows-the-setting-and-a-fallback-is-not-a-ratchet.md)'s
amendment. **Not a regression** — it predates 6K-j and reaches the same 700 under wave 6K-c, which
then holds it there; only 6K-j lets it come back down.

[ADR 0058](decisions/0058-the-two-deep-top-cabinets-are-pinned.md)'s two pins declare **600 at both
settings**, so each sits *on* `columnBuildDepthM` at one declared setting and *off* it at the other:

```
wall-2door-600-deep-top     declared 600/600   ceiling (hasFullHeightUnder) 600/700
wall-2door-700-over-fridge  declared 600/600   ceiling (hasFullHeightUnder) 600/700
```

A member-less column frozen at 600 with a full-height member overhead is therefore read as carrying
this rule's own previous answer, and follows the setting to 700 — 100 mm proud of a pinned depth.

**Unreachable on today's fixture, and for a reason the fixture supplies rather than the rule.**
`B|1.80` is the only column recording a pin and it holds a full-height `tall-pantry-600`, so it is
never member-less while that pin is its depth; `wall-2door-700-over-fridge` wins no column's MAX at
all, because `B|2.45` is the fridge's 742.

**It becomes reachable** when a pinned deep top is left alone in a column a full-height body
overlaps, or when any new catalogue entry declares the same depth at both settings.

**Tripwire, not a fix.** `apps/web/tests/store/cabinet-depth-legacy-fallback.test.ts` sweeps every
catalogue entry × both `hasFullHeightUnder` readings × both settings and asserts the hazard set is
exactly these two named ids — so a new entry of that shape turns it red. It is written as the hazard
predicate rather than as *"every wall-family entry declares the map"*, which would restate the map
(ADR 0028 decision 4) and name the wrong population: the hazard is any entry sitting on a ceiling at
one setting only, not a fact about wall cabinets.
