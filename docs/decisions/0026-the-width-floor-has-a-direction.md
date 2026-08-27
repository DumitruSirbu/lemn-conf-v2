# ADR 0026 — §2's `MIN_W` is the default width floor, not an absolute one

Status: Accepted
Date: 2026-08-26
Type: Decision
Milestone: Wave C — the narrow bottle cargo

## Context

The owner has a ~200 mm pull-out for oil and vinegar bottles in their own kitchen, "in the majority
of cases placed near the hob". It is a common cabinet in Moldova and the catalogue has nothing like
it. Backlog entry 2 records the decision to add it.

`insert-fit.ts` applies **two** width floors, deliberately distinct and carrying different rejection
codes so the customer reads the right sentence:

- §2's `MIN_WIDTH_M` (300 mm) — `WIDTH_NOT_SUPPORTED`, "no cabinet may go under this".
- ADR 0017's per-entry `minWidthMm` — `WIDTH_TOO_SMALL`, "this entry's builder cannot go under
  this". `base-sink` declares 560 mm, its sink aperture's own width.

Both were **upward** only. `minWidthMm` could raise the general floor for one entry; nothing could
lower it. A 200 mm cabinet was therefore unrepresentable, and the owner's own example of a run —
1400 = `600+600+200` — was not expressible.

## Decision

**§2's `MIN_W` is read as the *default* floor rather than an absolute one, and the per-entry floor
gains a direction.**

1. `MIN_WIDTH_M` **stays at 300 mm** and remains the floor for every entry that declares nothing —
   which is fourteen of the sixteen shipped rows.
2. A `minWidthMm` **at or above** `MIN_WIDTH_M` behaves exactly as ADR 0017 defined it: it is
   checked *after* the default, and both can fire. `base-sink` in a 299 mm opening still reads the
   general sentence, because "no cabinet is that narrow" is the truer thing to say there.
3. A `minWidthMm` **below** `MIN_WIDTH_M` **replaces** the default for that entry alone. Nothing
   else can then refuse it on width but its own floor, so its refusal names its own millimetres.
4. `base-bottle-cargo` declares `minWidthMm: 200` and is the only entry in the catalogue that
   declares downward.
5. The default floor now governs **both** width paths. It was previously applied only to
   `widthFlex: 'fit'` bodies; see the finding below.

The two codes stay distinguishable, which is the whole point of the mechanism: below the floor that
applies, a body with no declaration reads `WIDTH_NOT_SUPPORTED` and the cargo reads
`WIDTH_TOO_SMALL` naming 200 mm. In a 250 mm opening the cargo goes in and every other base body is
refused.

**The cargo is a millimetre set (`[200, 300]`), not a `'fit'` body.** Its proportion *is* the
product: a `'fit'` cargo dropped into an 800 mm opening would build an 800 mm cabinet with one front,
which is not a bottle cargo. Its set is its own; the standard set stays {400, 600, 800}.

### The alternative that was rejected

**Drop `MIN_WIDTH_M` to 200 and give the other eleven `'fit'` entries `minWidthMm: 300` to raise
them back.** This was the M5 architect's proposed remedy and the owner rejected it on 2026-08-26:

- It makes eleven rows carry a correction so that one row can carry an exception. The exception is
  then invisible on the row that needs it.
- Any row that forgot the correction would become insertable at 200–300 mm — a 220 mm two-door base
  cabinet, buildable and offerable, which is not a product.
- §5.4's donor rule is "the neighbour must remain at or above `MIN_W`". With the constant at 200, a
  600 → 800 resize could shrink a 400 mm neighbour to 200, producing a narrow cabinet as the
  **residue of somebody else's edit**. The owner's rule is that the cargo "will not be automatically
  inserted, it should be deliberately selected". Leaving the constant at 300 keeps the donor rule
  correct with no second constant.

`MIN_SPAN_M` is **not** touched. It is also 0.3 today and governs the shortest *vertical* free
interval that becomes an opening; a 200 mm-tall sliver must still not become a slot. ADR 0015 is its
record and neither its rule nor its value moves. Backlog entry 2 carries a correction about exactly
this confusion.

## Finding, fixed here: the millimetre-set width path never applied §2's floor

The default-floor check (then `refuseNarrowOpening`, now `refuseWidthFloor`) was called
only on the `'fit'` branch of `resolveWidth`. A `widthFlex` set
took its width from the set and was never measured against `MIN_WIDTH_M` at all, so an entry listing
a 150 mm size would have been offered into a 150 mm opening — §2's floor silently absent on half the
catalogue. It was invisible because every shipped set starts at 450 mm.

Leaving it would have made this ADR's mechanism decorative: the cargo would have been insertable at
200 mm because the fixed-set path has no floor, not because it declares one. Two changes close it,
and both keep the floor a property of the body rather than of the fit:

- The opening check runs on both paths, before any width is chosen. `FIT_TOLERANCE_M` therefore
  cannot reach under either floor — it can only ever forgive a body being slightly too *wide* for
  its opening.
- `buildableSizes` defaults its floor to `MIN_WIDTH_M` instead of treating an absent declaration as
  "no floor", so a chip under the default cannot reach §9 from a row that never asked to be an
  exception.

Neither changes any shipped entry's resolution or chips at or above 300 mm: verified by the
pre-existing sweeps in `minimum-width.test.ts` and `minimum-width.adversarial.test.ts`, which
compare every fixed-set entry against the pre-floor formula across 300–1000 mm.

**Below 300 mm, four shipped rows change their rejection code, and only their code.** A sweep of
every entry across 200–299 mm found `tall-pantry`, `tall-oven-tower`, `tall-fridge-housing` and
`fridge-free` moving from `WIDTH_TOO_LARGE` to `WIDTH_NOT_SUPPORTED`. Each declares a single-member
set — `[600]` for the three columns, `[700]` for the fridge — and `refuseFixedWidth` answers a
single-member set with `WIDTH_TOO_LARGE`; the new §2 branch now fires first on the millimetre-set
path and answers `WIDTH_NOT_SUPPORTED` instead. `base-dishwasher` is not among them because its set
has two members and already read `WIDTH_NOT_SUPPORTED`.

All four stay refused at every width under 300 mm, so this is which of two true sentences the
customer reads and not what gets built: "no cabinet goes under 300 mm" replaces "this one needs 600".
Neither is worse and the copy is not in the §11 table, so it is recorded rather than repaired.

## Consequences

- §2's `MIN_W` row and §9's width consequence line ("sub 300 mm nu se coboară") remain true as
  written for every entry but one. §7's table gains a sixteenth insertable row. The spec is the
  behavioural contract and this is a dated decision, so per `docs/decisions/README.md` the decision
  governs until §2 and §7 are next revised.
- Three tests encoded "`base-sink` is the only entry that declares a floor" as a universal. They
  were right until today. Each is repaired in place to assert the fact the sweep around it actually
  needs — that no entry's floor removes a width from its own set — which is a weaker premise but a
  true one, and still fails on the change it was written to catch.
- The mechanism must not become a route around §2. An entry declaring downward is asserting that a
  cabinet that narrow is a **product**, which is a decision for the owner and not for whoever is
  adding a row. `base-bottle-cargo` is the only such entry and any second one needs its own record.
- The cargo's size set — `[200, 300]` — is **not confirmed**. Backlog entry 2 fixes the range at
  200–300 and explicitly leaves the members open. 200 is the owner's own cabinet and makes
  `600+600+200` representable; 300 is the top of the stated range and the point where the standard
  set takes over. 250 was left out as unattested, and 150 (a real trade width) as outside the range
  the owner stated. The owner should confirm before this reaches a customer.

---

## Amendment, 2026-08-26 — a declared floor that is not a width refuses the entry

Adversarial QA on this wave found that a catalogue row declaring `minWidthMm: NaN` reached the
customer. `NaN < MIN_WIDTH_M` is false, so the declaration was read as an *upward* one; `opening.w
>= NaN` is then false at every width, so the entry became uninsertable — the safe direction — but
the Romanian refusal it produced read "are nevoie de cel puțin **NaN** mm lățime".

**Decision: a declaration that is not a finite number refuses the entry at every opening, and the
sentence names no millimetres.** `refuseUnusableDeclaredFloor` in `insert-fit.ts` runs before either
floor is applied, so it covers both width paths, and `WIDTH_TOO_SMALL`'s params make `requiredMm`
absent for this case — the same position `rejection.ts` already takes for `MEASUREMENT_UNUSABLE`:
the value is `NaN` or `±Infinity` and neither belongs in a sentence shown to a customer.

Three sub-decisions worth the record:

- **Read at the point of use, not validated at load.** There is no single load to validate in: a
  `BodyCatalog` is a plain map that a fixture, a preset, or a caller builds directly, so the only
  place guaranteed to see every entry is the place that reads its floor.
- **A refusal, not a throw**, for the same reason `NON_INTEGER_MILLIMETRES` is one: a command's
  contract is a value, and a thrown exception out of an insert is not an outcome the store can
  render.
- **It refuses at every width rather than falling back to §2's default.** A row whose floor cannot
  be read is a defect in the catalogue, and the safe direction is that nothing is built from it. A
  fallback would let one typo ship silently as a normal 300 mm row.

**Not changed, and deliberately:** a declaration of `0` or below still removes the floor for that
entry rather than being rejected. Zero and negative numbers *are* widths — unusable ones — and the
same QA round pinned the current behaviour rather than a fix. It stays a finding: nothing in the
loader, the schema or the command validates the *range* of a declaration, so a row declaring `0` is
insertable at any width the void engine can produce. Closing it means deciding what a declaration is
allowed to be, which is a catalogue-validation decision this record does not make.
