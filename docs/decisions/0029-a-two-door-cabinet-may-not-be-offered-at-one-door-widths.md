# ADR 0029 — A two-door cabinet may not be offered at a width that builds one door

Status: Accepted
Date: 2026-08-27
Type: Finding + Decision
Milestone: M5 wave 5B — seeded width sets

## Context

Found by logic review of wave 5B, which supplied the width sets that make §9's width section render
on a seeded body for the first time. The defect predates the wave; 5B made it reachable.

Two declarations disagree, and nothing compared them:

- §7's wall builder decides the door count from the width alone:
  `w > 0.45 ? 2 : 1` (`packages/three-adapter/src/catalog-bodies.ts`, `TWO_DOOR_MIN_WIDTH_M`).
- `wall-2door` inherited `STANDARD_WIDTHS_MM = [400, 600, 800]` (`catalog.ts`), because it took the
  standard set rather than declaring one.

So **400 mm was an offered width for `wall-2door`, and it builds a one-door cabinet.** The body keeps
its declared identity throughout: labelled *Corp suspendat 2 uși*, priced as a two-door, and badged
ACTUAL as a two-door in its own swap list — while carrying one door.

Wave 5B made that 400 mm chip visible on eleven seeded placements: the eight 600 mm rows (`p8`,
`p14`, `p15`, `p18`, `p19`, `p20`, `p22`, `p23`), plus `p11` and `p17` (`wall-2door-800`) and `p24`
(`wall-2door-700-over-fridge`), which resolved the standard set as well. It becomes actionable in
wave 5C: resize a 600 mm `wall-2door` to 400 and the customer owns a one-door cabinet named and
priced as a two-door.

**This is §6.3's defect class in a new disguise.** §6.3 records a fridge housing labelled and priced
as a pantry, caused by *inferring* identity from geometry. Here identity is declared correctly and
the **geometry** silently diverges from it. The lesson generalises: the two must be compared, in
whichever direction they can drift.

The seeded kitchen was never wrong — no seeded `wall-2door` row sits at 400 mm. The catalogue entry
was, and only in a width nothing had yet been able to select.

## Decision

**`wall-2door` declares its own `sizesMm: [600, 800]`.** The 400 mm width is dropped from that entry.

Owner's decision, 2026-08-27. It follows the `base-sink` precedent (ADR 0017): an entry whose builder
cannot honestly serve the whole standard set declares the subset it can.

`wall-1door`, `wall-lift` and `open-shelf` keep `STANDARD_WIDTHS_MM`. A one-door cabinet at 400 mm is
what it says it is, and an open shelf has no doors to count.

**The rule, not the number, is what is enforced.** A test asserts that for every wall entry whose
label names a door count, every width in its declared set lands on the same side of the builder's
`TWO_DOOR_MIN_WIDTH_M` threshold as the label claims. The threshold lives in the adapter and the set
lives in the domain, which is exactly why they drifted; the test is what compares them. Hard-coding
600 as the answer would leave the next entry to acquire the same defect silently.

## Alternatives considered

- **Let a resize migrate the placement to `wall-1door`.** Keeps 400 mm available for wall openings by
  changing which catalogue entry the customer owns when they resize down. Rejected: a resize that
  silently changes the entry is a larger surprise than a width that is not offered, and it would put
  the correction *after* the tap rather than at the offer. §9 requires that nothing be offered which
  cannot be satisfied; the narrower change satisfies it directly.
- **Move `TWO_DOOR_MIN_WIDTH_M` below 400.** Rejected on its face: it would build two doors on a
  400 mm carcass, which is not a product.
- **Leave it to the chip's `free`/`blocked` computation in 5D.** Rejected: that answers the question
  by accident, in the layer furthest from the declaration, and would offer a chip the catalogue
  should never have contained.

## Consequences

- Eleven seeded placements lose their 400 mm chip — the eight 600 mm rows plus `p11` and `p17`
  (`wall-2door-800`) and `p24` (`wall-2door-700-over-fridge`), all of which resolved the standard set
  too. No shipped geometry changes — no seeded `wall-2door` was at 400 mm — so this is a change to
  what may be *chosen*, not to what exists.
- **This closes the resize path only. The insert path is still open, and that is a correction to an
  earlier draft of this record**, which claimed a 400 mm wall opening would no longer offer
  `wall-2door`. It does. Found by the implementer of this wave, with a reproduction, and verified
  against the source: **`wall-2door` is `widthFlex: 'fit'`, and `evaluateInsertFit` never reads
  `sizesMm` on that path** — `commands/insert-fit.ts` returns `{ ok: true, widthM: opening.w }` for a
  fit body after only the §2 width-floor checks. `sizesMm` governs the chip row and the set published
  on an offer row; it does not gate the fit path. Measured: clearing `p10` leaves a 300 mm void whose
  offer list contains `wall-2door@300`, which builds **one** door and is badged *Corp suspendat
  2 uși* beside a published set of `[600, 800]`.

  So the §6.3-class divergence this record is about survives on the insert path, at widths narrower
  than the one that prompted it. **Closing it is a further product decision and is deliberately not
  taken here**: the candidates are a `minWidthMm` on `wall-2door` at the builder's threshold (a new
  declaration carrying ADR 0017 / ADR 0026 floor semantics and a customer-visible refusal), or making
  the fit path consult `sizesMm` (much wider, and it would change every `'fit'` entry). Raised to the
  owner. The adapter test this wave added is already the gate for whichever is chosen.
- 400 mm remains in the product's published width vocabulary through the base entries and the other
  wall entries; only this entry's set loses it.
- **The general lesson is the durable part.** A builder that derives a *visible feature* from a
  dimension, and a catalogue entry that declares that feature in its label, are two statements about
  the same body. They must be compared by a test, in whichever direction they can drift. Any future
  entry whose label names a countable feature the builder infers from size inherits this rule.
- Wave 5C's `setWidth` cannot produce this state, because the width is no longer in the chip set the
  resize reads — the refusal lives at the offer, where §9 wants it, rather than in the command. This
  is true of the resize path only; see the insert-path consequence above.
