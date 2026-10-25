# ADR 0175 — A cabinet is priced by an anchor at its default width plus steps; widths and heights round up to 50 mm; prices round to 10 lei

Status: Accepted (decided; **nothing built, nothing scheduled** — the dashboard still comes after M8, ADR 0062)
Date: 2026-10-25
Type: Decision
Milestone: None — owned by the manufacturer price dashboard (backlog 277); pricing-engine work is backlog 281-285

## Context

**Evidence tier: owner rulings of 2026-10-25, coordinator-relayed.** Words in quotation marks are the
owner's as relayed, not a verbatim transcript. Code facts are doc-quoted from the files named, read by
the scribe on 2026-10-25.

The manufacturer dashboard (ADR 0062, Amendment of 2026-10-25) needs a way to edit a cabinet's price.
Two designs were drawn and the owner rejected both models they were built on:

- **v1** edited the raw coefficients, in lei per millimetre. The owner: "I really want to be able to
  edit the prices efficiently, and most or nearest to the existing methodology… the V1 I don't like at
  all."
- **v2** priced a cabinet bottom-up: board m² × rate, edging per metre, labour and extras. Rejected. The
  engine has no m² geometry, and the manufacturer could not type the price they wanted. The brief for
  the corrected design is `docs/design/claude-design-brief-cabinet-price-dashboard-v2-update.md`. The
  design file `design-source/price-v2/Lemnaria Dashboard v2.dc.html` is **provenance only**: untracked,
  to be deleted, never imported (`AGENTS.md` rule 3).

What the engine does today (`packages/configurator-domain/src/pricing/price-book.ts`): four formula
shapes, all `baseMinor + perWidthMillimetreMinor × widthMm` plus an optional height term and an
optional door-leaf term (ADR 0068). `baseMinor` is the price at width 0, not at any real size. A body
built at 575 is priced at 575: the head comment says *"a body built at 575 is priced at 575"*
(`price-book.ts:13`), and `pricing-seams.test.ts` reads the source to keep the pricing code from naming
the catalogue's width step. Every amount is an exact integer count of bani, and `amountForBody`
throws rather than round (`price-book.ts:291-297`, `usableCoefficientOf`).

## Decision

### 1. The dashboard design is v2's frame with a new cabinet editor

v2's shell, navigation, list, read-only dimensions, hardware, accessories, settings, publish and
history screens stay. Its bottom-up cost model (board m² × rate, edging per metre, labour, extras) is
**rejected**. So is v1's raw-coefficient editor.

### 2. A cabinet's price is an anchor plus steps

- **The anchor** is the price at the cabinet's **default width**, in **PAL, without hardware**.
  Hardware stays a separate, automatic, per-mechanism line, unchanged (ADR 0070, ADR 0092).
- **Wider and narrower are two amounts.** "+ lei for each 50 mm wider" and "− lei for each 50 mm
  narrower". The owner: "you have the base price maybe, and if you minimize the width, you can deduct
  a little bit… maximize the width, you add a little bit."
- **A cabinet whose door count follows width** has one more field: "+ lei per extra door leaf". It
  covers the **door panel only**. Its hinges are already counted under hardware, so the dashboard must
  say so beside the field to prevent a reading of double charging.
- **A cabinet built to its opening's height** (wall cabinet, lift-up, open shelf; ADR 0068 decision 2,
  keyed on the `heightFlex` property and not on ids) has one more field: "± lei per 50 mm of height",
  relative to 700.
- **A fixed-size cabinet** has **one price per available size** and no steps.
- **A customer-supplied row** (`suppliedBy: "customer"`) stays 0, with no fields. `parsePriceBook`
  already refuses a book that charges for one (`price-book.ts:129-133`, ADR 0107 decision 2).

### 3. Odd widths and heights round up to the next 50 mm

575 is priced as 600; 560 as 600. The owner: "round to bigger". **This changes current behaviour**,
where a 575 mm body is priced at 575 (`price-book.ts:13`). The customer never pays less than the grid
price for a width between two steps.

### 4. The formula shapes are code, so this is a code change

**Evidence tier: inference from `price-book.ts`; falsified by a shape in the book that expresses all of
it without new code.**

- A **symmetric** step maps onto today's linear shape: the step is `50 × perWidthMillimetreMinor`.
- **Asymmetric steps** (a plus amount and a minus amount), **round-up to 50** and the **per-size
  lookup** are **new formula shapes**. ADR 0062 seam 1 says shapes are code and coefficients are data,
  so each is a code change in `price-book.ts` plus its parser and a migration of the sample book. The
  dashboard cannot ship these through data alone.
- **The anchor needs a default width declared once.** No catalogue field declares one today (backlog
  276). The anchor is meaningless without it, so 276's owner question is on this model's path.
- The shapes keep ADR 0062's prohibition: no per-cabinet function. ADR 0068's note applies: a shape
  that is not a sum of per-axis terms is a genuinely new shape, not a new coefficient.

### 5. Prices round to 10 lei

The design rounds to the nearest 10 lei (`Math.round(x/1000)*1000` in bani); the owner accepted it.
It is the dashboard's and the customer's display unit.

**Open seam, not decided — for the architect.** *Which* amount is rounded is not ruled: each cabinet's
price after depth and material, or each customer-visible line. The two give different totals. The
choice also sits against the exact-bani arithmetic above (`price-book.ts:15`: *"only presentation may
round"*, and ADR 0100's note that *"the query is the one place this wave forbids rounding"*). Rounding
inside the priced result reverses that statement. **Neither the implementer nor a wave may settle it on
its own authority** (ADR 0100, *What whoever picks this up needs to know*, says the same for its multiplier's rounding). The percentages
in ADR 0092 Amendment (2026-10-25) and ADR 0100 Amendment (2026-10-25) are non-integer arithmetic and
need the same seam named.

## What does not change

Hardware (ADR 0070, ADR 0092), accessories, ADR 0068's door-count step and height term (they become two
of the fields above), the pricing seam (`priceDesign` takes a book), and ADR 0035 decision 8: price is
still a formula over width and not a table keyed on sizes, except for the fixed-size rows, which already
have one size per row.

## Open, recorded so it is not decided by accident

**Evidence tier: inference.** Each would be falsified by the owner's answer.

- **Does the door-leaf count follow the actual width or the rounded one?** A 480 mm body rounds up to
  500, the width at which a door is added, but has one door. Not ruled.
- **Rounding of a height**: the owner's wording is "widths and heights"; the base height (700) and a
  step relative to it are as in the brief, not independently ruled.
- **A negative or zero price at the narrow end** when the minus step is too large: the brief proposes a
  validation message; the dashboard wave owns the rule.

## Alternatives considered

- **v2's bottom-up cost model.** Rejected by the owner. It needs board geometry the engine does not have
  and the manufacturer cannot type the price they want.
- **v1's raw coefficients (lei per mm).** Rejected by the owner: "the V1 I don't like at all."
- **A symmetric step only.** Would need no code change (it fits today's linear shape) but the owner
  rejected symmetry: labour does not shrink with width, so the minus step is usually smaller.
- **Keep pricing an odd width exactly.** Rejected by the owner: "round to bigger".
- **A price per size for every cabinet.** Not taken: it is the width-keyed table ADR 0035 decision 8
  refused. It stays only for rows that have a fixed set of sizes.

## Consequences

- **Backlog 281-285** carry the engine work and link here; 277 carries the dashboard. Nothing is
  scheduled.
- The sample book's cabinet rules will need conversion from `baseMinor` at width 0 to an anchor at the
  default width. The conversion is the implementing wave's; no figure is invented here.
- The material percentage is ADR 0092's Amendment; the depth percentage is ADR 0100's Amendment. Both
  apply to the cabinet price this record defines.
- The dashboard's inline anchor editing and bulk "change prices by %" action, and the deactivation
  behaviour, are recorded at ADR 0062's second Amendment of 2026-10-25.
