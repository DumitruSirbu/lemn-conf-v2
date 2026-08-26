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

## 1. The hob cannot be put back once it is removed — DECIDED 2026-08-26

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

**Still to do at implementation:** Romanian labels for both entries, and an ADR recording this.

---

## 2. Rearranging a run: re-split, and the narrow bottle cabinet — DECIDED 2026-08-26

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

**Not changed, and deliberately:** raising the general floor to 400. The owner raised it as a
possibility ("one door cabinet minimum should also be 400"). Standard chips are already 400/600/800,
so nothing is *chosen* below 400; the 300 floor only governs `'fit'` bodies filling an odd opening.
Raising it would begin refusing openings that work today — a separate decision with its own
consequences, not bundled here.



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

## Also open, recorded elsewhere — do not duplicate here

- **Width editing does nothing yet.** Every width chip is `blocked` because §5.4's resize command
  does not exist. This is M5's entire scope and is scheduled, not backlog.
- **M4's deferred review findings** (the redundant panel test-file split, `advancePast` opening a
  span no command can produce, the notice remounting on every retry, the write-access probe's
  doubled read rate that M8's rate limits must be sized against) are recorded in `docs/STATUS.md`
  under "What is open right now".
- **The handset pass itself** was open in `docs/STATUS.md` and is now partly done: the scene renders
  correctly on iOS Safari against production. The items in this file were all found during it.
