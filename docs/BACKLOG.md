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

### The narrow bottle cabinet, and `MIN_W` drops to 200

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

- §9's width consequence line says "sub 300 mm nu se coboară" — becomes 200.
- ADR 0015's boundary tests are pinned at 299/300 and move to 199/200. That ADR's *rule* (min span
  is exclusive) is unchanged; only the value moves.
- The bottle cabinet needs a **new builder** — nothing in `kitchen-parts.ts` builds a narrow
  pull-out cargo. Its size set is its own (200-300), not a new general module width: the standard
  set stays {400, 600, 800}.
- Every re-split combination must respect the new floor, so `600+600+200` becomes valid where
  `600+600+200` was previously unrepresentable.

**Sequencing:** M5 must design the column-identity change knowing re-split is coming, so the model is
redesigned once rather than twice. Building re-split itself is not required in M5 — M5's own plan
already lists it as out of scope, and that stands.

---

## 3. The replace list has no sub-type filter chips, and the mockup has them

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

## 4. There is no way to move a cabinet, and §5.4 as written cannot provide one

**Reported:** 2026-08-26, owner, on a handset against production.
"I want to move the sink cabinet from left to right. Reorder buttons were explicitly decided against,
so widening one and narrowing the other looks like the only workaround — but the middle and top
should follow, and the neighbour should become 600."

**This is a planning input for M5, not a defect report.** Width editing is M5's scope and every chip
is correctly `blocked` today. But M5 cannot implement §5.4 as written, and that is worth knowing
before someone starts it.

**§5.4 does only half of what is being asked.** Its neighbour rule is _"same wall, **same row**
(|Δy0| < 0.06), edge-adjacent (< 0.03)"_. Growing a base cabinet takes width from its **base**
neighbour and never touches the rows above. Vertical alignment breaks by construction, and no
section addresses it. §13.1's _"work column by column … preserves vertical alignment by
construction"_ is about insertion order, not resize.

**Worse: §5.4 breaks column identity, which the void model rests on.** Simulated the exact §5.4
arithmetic on the shipped design — grow `p2` 600 → 800, its left edge holds, new centre 2700, donor
`p4` shrinks to 400:

```
p2 before: col=A|2.60 w=600   uppers in that column: cooktop-600, hood-600, wall-2door-600-top
p2 after : col=A|2.70 w=800
p4 after : col=A|3.30 w=400
frozen column map has "A|2.70"? false
frozen column map has "A|3.30"? false
```

A column's key is derived from the body's centre (`deriveColumnKey`), resize moves the centre, and
columns are **frozen at load** (ADR 0011 Gap D). So both resized bodies land in columns that do not
exist in the frozen map, while the hob, hood and top cabinet stay behind in `A|2.60`. The hob is the
sharpest case: §11 row 15 makes it an accessory of its host, and the host would move out from under
it.

**Three things M5 must decide before writing any code:**

1. Does a resize move the whole column (base + middle + top together), or only its row? The owner
   expects the column. §5.4 specifies the row.
2. What happens to column identity when a centre moves? Either columns stop being frozen — which
   ADR 0011 Gap D warns produces "delete does nothing" — or column keys stop being positional, or
   resize is expressed as something other than a centre move.
3. What happens to an accessory whose host resizes or moves?

**The owner's alternative, and why it is not simply a re-litigation.** They proposed restoring
Mută la stânga/dreapta, but moving the **entire column** rather than one body. §13.2 rejected
reordering because it _"breaks vertical alignment or drags in the whole neighbour-slack
calculation"_ — and moving a whole column is a direct answer to that specific objection, which the
original decision did not consider. It also keeps a column intact, which is what the void model
wants.

It is not free: two columns of different widths still cannot simply swap, and §13.2's closing
argument — _"nothing can move horizontally any more, so column identity is permanently stable, which
is what keeps the void model honest"_ — is exactly the property that this finding shows resize
already destroys. So the choice is not "stable model versus reordering"; it is which of two ways of
moving things the model is taught to survive.

**Decision needed** before M5 is planned: resize-with-column-follow, column reordering, or both. All
three interact with backlog item 2 (run re-split), which is the third way to rearrange a run.

## Also open, recorded elsewhere — do not duplicate here

- **Width editing does nothing yet.** Every width chip is `blocked` because §5.4's resize command
  does not exist. This is M5's entire scope and is scheduled, not backlog.
- **M4's deferred review findings** (the redundant panel test-file split, `advancePast` opening a
  span no command can produce, the notice remounting on every retry, the write-access probe's
  doubled read rate that M8's rate limits must be sized against) are recorded in `docs/STATUS.md`
  under "What is open right now".
- **The handset pass itself** was open in `docs/STATUS.md` and is now partly done: the scene renders
  correctly on iOS Safari against production. The items in this file were all found during it.
