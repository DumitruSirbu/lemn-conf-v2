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

## 1. The hob cannot be put back once it is removed

**Reported:** 2026-08-26, owner, on a handset against production.
"From the base cabinets, the cabinet with the hob is missing. If I remove it I am not able to add it
back."

**Confirmed.** Measured, not inferred:

- Removing `p2` (the hob's host cabinet) succeeds and correctly **cascades** — the hob `p3` is
  removed with it rather than left floating. The accessory rule works.
- The resulting 600 × 860 opening then offers exactly six bodies: `base-2door`, `base-1door`,
  `base-3drawer`, `base-panbank`, `base-sink`, `base-dishwasher`. **None carries a hob.**
- `cooktop-600` exists only as a *seeded* catalogue entry. Seeded entries are `insertable: false` by
  construction (ADR 0011 Gap A) because each describes one already-built body, so it can never be
  offered.
- §7's catalogue has no hob-bearing base cabinet at all. `induction_cooktop` appears only as a kind
  label.

So the induction hob is **permanently unrecoverable** once its host is deleted, and a customer who
deletes it has silently lost a fixture they cannot restore without starting over.

**What deciding it costs.** A parameterised hob-bearing base cabinet is not free: §11 row 15 makes
the hob an accessory of its host, §6.1 resolves a click on it to that host, and §13.4 notes hob and
corner widths are still fixed in geometry ("parameterising them is the remaining builder work",
§13.3 q6). So this is builder work in `packages/three-adapter`, plus a §7 entry, plus the accessory
seating — not a one-line catalogue addition.

**Cheaper interim option worth considering:** refuse to delete the hob's host while the hob is on it,
the way a corner refuses (§13.1), so the unrecoverable state cannot be reached. That trades a lost
fixture for a refusal the customer can understand, and it is a rule change rather than builder work.

---

## 2. Clearing two adjacent cabinets does not give one wide opening

**Reported:** 2026-08-26, owner.
"If I remove two near base cabinets I should be able to benefit from the combined space — choose a
different split, or make one wider."

**Confirmed, and it is structural rather than a bug.** Deleting the 800 mm sink and the 600 mm
dishwasher yields **two separate voids, 800 and 600 — not one 1400**.

§4 merges openings **vertically within a column**. Columns are frozen at load (ADR 0011 Gap D) and
never merge horizontally. §13.1 made that explicit when reordering was removed: *"nothing can move
horizontally any more, so column identity is permanently stable — which is what keeps the void model
honest."*

What the owner is describing is the **run re-split**, which §12 lists as *"Not built, designed"* and
§13.3 carries as open question 2: a run's total offered as valid module combinations
(800+600, 600+400+400), never as free-form arithmetic.

**Note this is NOT fixed by M5.** M5 implements §5.4's resize as a boundary move — growing a 600 to
800 by taking 200 mm from its neighbour, outer edges holding (§11 row 9). That covers "make one
wider at the neighbour's expense". It does **not** cover re-dividing a cleared run into a different
number of cabinets.

**Decision needed** before it can be scheduled: is run re-split in scope for this product, and if so,
does it land in M5 beside resize or as its own phase? It touches the frozen-column invariant that
the whole void model rests on, so it is not a small addition.

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
