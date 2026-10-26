# ADR 0100 — Depth is priced by a dashboard-editable multiplier on the 600 mm base, and it is deferred

Status: Accepted (decided; **implementation deliberately deferred by the owner, no wave, no schedule**)
Date: 2026-09-07
Deferral lifted: 2026-10-25 — see the Amendment at the end of this record
Type: Decision
Milestone: None — recorded against `docs/BACKLOG.md` entry 54 and M6-AUD-006; owned by the manufacturer price dashboard when it happens

## Context

`docs/BACKLOG.md` entry 54 and M6-AUD-006 both record the same gap: a 700 mm carcass consumes more
board and prices identically to a 600 mm one. A cabinet line is
`baseMinor + perWidthMillimetreMinor × width + perHeightMillimetreMinor × height + perDoorLeafMinor × leaves`
plus its hardware; **there is no depth term anywhere in `packages/configurator-domain/src/pricing/`**.
The settings sheet states this as though it were intended — `ro.ts:557`,
*"Adâncimea nu schimbă estimarea — doar dimensiunile corpurilor."*

Entry 54 was recorded on 2026-09-06 as **held by the owner**: *"I need to check with manufacturer"*,
with two things needed together — whether depth is priced at all, and in what shape.

**Half of that has now been answered and the other half has been deliberately postponed**, and the
distinction matters: this is a **deferred decision that has since been made**, not an open question.
Nobody should re-ask the owner what shape depth pricing takes.

### The owner's ruling, 2026-09-07

> "Can we add like fifteen percent additional… I hope it will be a coefficient, and this coefficient
> will be a setting that you can change from the dashboard, and automatically based on this setting
> the change is applied — so we keep only the initial price for the 600, the default one, and if 700
> depth is selected we use this coefficient to multiply the base price… I will just go with the
> multiplier now… But can this be postponed? Record and postpone. I really don't want to waste time
> and effort on this. I will return later — it can be an improvement. Now I don't want to waste time
> on this."

The owner has now said twice, on the same day, that they do not want effort spent on this. **This
record captures the shape and stops. It plans no wave, writes no criteria, and schedules nothing.**

## Decision

**1. The shape is a single depth coefficient applied as a multiplier to the 600 mm base price.**

One number, not a per-cabinet price table. The 600 mm price stays the only price a cabinet row
states; a 700 mm selection multiplies it.

**2. The working figure is ~15%, and it is explicitly not a committed number.**

The owner's *"like fifteen percent"* is a sense of scale offered while describing the mechanism, not
a rate they have taken from the manufacturer. **Nobody may ship 1.15 as though it were approved.**
This is the same trap ADR 0092's push-to-open rates already cost this milestone once: a placeholder
becomes load-bearing the moment a customer-visible price depends on it.

**3. It is owned as a dashboard-editable setting, never a constant in the tree.**

The owner's words are *"a setting that you can change from the dashboard"*. So it must reach the
price book as **data** —
[ADR 0062](0062-a-manufacturer-price-dashboard-comes-after-m8-and-shapes-seams-now.md) seam 1, one
module names a book — and
[ADR 0072](0072-price-book-versioning-is-deferred-to-the-manufacturer-dashboard.md)'s split holds: the multiplier's
*existence and arithmetic* are code, its *value* is data. A hardcoded 1.15 would satisfy the
behaviour and violate the ownership, which is the half that would have to be undone later.

**4. The multiplier is chosen over a per-cabinet 600/700 price mapping, and the owner's reason is
recorded because it is the reason.**

The alternative — every cabinet row carrying two prices, one per depth — was put to the owner and
rejected because **it would need two price records per cabinet**, doubling what the manufacturer
authors and maintains for a difference the owner sees as one proportional uplift. That is a
maintenance argument about the dashboard's authoring surface, not an engineering one, and it is the
owner's to make.

**5. The copy moves with the coefficient, and neither moves alone.**

`globalSettings.depthNote` currently tells the customer that depth does not change the estimate. That
sentence is **accurate about the code and wrong about furniture**. It must not be edited while the
code still behaves this way — a note promising a depth-dependent price the book cannot produce is the
worse of the two errors — and it must not be left standing once the coefficient ships. One change,
both halves.

**6. Deferred. No wave, no milestone, no schedule.**

The owner has been explicit. When someone picks it up, the two things still needed are the
manufacturer's actual rate and confirmation that a flat proportional uplift is how they quote depth
at all.

## What whoever picks this up needs to know, recorded now so it is not re-derived

**Two constraints that were measured while writing this and that shape the implementation.** They are
notes for a future wave, not a plan for one.

- **It lands after the runtime price-book parser**, which is on branch `fix/m6-remediation` today, and
  it has to satisfy that parser's bounds. `MAX_PRICE_COEFFICIENT_MINOR`
  (`pricing/parse-price-book.ts`) is **derived rather than chosen** — `MAX_SAFE_INTEGER /
  (TERMS_IN_THE_WIDEST_FORMULA × MAX_BOOK_AMOUNT_MULTIPLIER)`, with `TERMS_IN_THE_WIDEST_FORMULA = 4`
  — so a fifth term, or a factor applied over a whole line, changes the arithmetic that bound is
  derived from. The bound must be re-derived, not widened.

- **A multiplier is not a fifth linear term, and this is the one thing that makes it non-trivial.**
  Every coefficient in the book today is an exact count of minor units and every shape is an exact
  integer sum; the parser raises `MalformedPriceCoefficientError` for a coefficient that is not an
  exact count and `InexactPriceArithmeticError` where the arithmetic would not stay exact. **1.15 is
  neither an integer nor exact**, so a depth multiplier needs a **declared rounding rule at a named
  seam** — and `price-book.ts` already states the constraint that makes this a decision rather than a
  detail:

  > *"Both are stated **per millimetre** rather than per metre so the arithmetic never divides: a
  > per-metre coefficient would need a rounding rule inside the query, and **the query is the one
  > place this wave forbids rounding**."*

  Where that rounding happens, and which way it goes, is a customer-visible price decision and needs
  its own ruling. It is **not** a detail the implementing wave may settle on its own authority. The
  price-book head comment's own note applies — *"a **fifth axis** would be the moment to revisit
  this"* — and a multiplier is arguably more than a fifth axis, because it is a different kind of
  arithmetic rather than another term of the same kind.

## Alternatives considered

- **A per-cabinet 600/700 price mapping** — two price records per cabinet row. **Rejected by the
  owner**, for the maintenance cost on the manufacturer's authoring surface (decision 4). It is worth
  noting what it would have bought: it prices depth per body, so a cabinet whose depth costs
  disproportionately more board could say so. The owner traded that for one number they can change.
- **A `perDepthMillimetreMinor` coefficient**, mirroring the width and height terms — the shape entry
  54 called *"most plausible"* before the owner ruled. **Not chosen**: it prices depth linearly from
  zero rather than as an uplift over a standard depth, which is not how the owner describes their
  manufacturer's quoting, and it would be a genuine fifth linear axis with all that implies for the
  enumerated shapes. Recorded because entry 54 named it and a reader would otherwise assume it still
  stands.
- **Ship 1.15 now and let the owner correct it later.** Rejected — decision 2. A placeholder on a
  customer-visible price is exactly the failure ADR 0092 already paid for once.
- **Change only the copy**, so the UI stops claiming depth is free. Rejected, and it is the worse of
  the two half-fixes: it would make the product promise a price response the engine cannot produce.
- **Schedule it as a wave now, since the shape is decided.** Rejected on the owner's explicit
  instruction, given twice. The shape being decided is what makes it *safe* to defer, not a reason to
  start.

## Consequences

- **`docs/BACKLOG.md` entry 54 stays open and gains a decided-and-deferred note pointing here.** It
  does not leave the backlog: the shape is ruled, the implementation is not done, and this directory's
  own rule about a decided item leaving the file assumes the decision was to *act*.
- **Nobody re-asks the owner what shape depth pricing takes.** They answered. What is still owed is
  the manufacturer's rate, which is theirs to obtain when they choose to return to it.
- **The manufacturer price dashboard owns the authoring half** (ADR 0062 seam 1). The coefficient is
  one more thing its book validation and its authoring surface must know about, and it is small
  compared with the per-cabinet mapping it replaced.
- **No code changes as a result of this record**, including the copy. `ro.ts:557` stays exactly as it
  is until the coefficient ships with it.
- **M6 is unaffected.** This was already outside M6 on the owner's instruction of 2026-09-06 and it
  remains so.

## Amendment — 2026-10-25: the deferral is lifted; depth 700 is priced now

**Evidence tier: owner ruling 2026-10-25, coordinator-relayed.** The owner chose option "a"
(un-postpone) and accepted the proposal below. Decisions 1-5 stand as written; this amendment
supersedes only the title's "and it is deferred", decision 6 (*Deferred. No wave, no milestone, no
schedule.*) and the consequence "No code changes as a result of this record". The deferral is not
erased: it was the owner's ruling of 2026-09-07 and it held until now.

**The shape is unchanged.** One percentage, its value held as data, edited on the dashboard and
published (decisions 1 and 3). Nothing is a constant in the tree.

**Where it applies.**

- To **every manufacturer-supplied cabinet that measures deeper** at 700 than at 600 (its priced-as row's finished depth,
  `buildKitchenLBodyCatalog(700)` against `(600)`): base, tall, hob, sink, the base corners **and every wall-band row and
  wall corner** (330 → 400, `worktop-depth.ts:29-32`). **Owner ruling 2026-10-26: "Surcharge every deeper cabinet."** The
  earlier "not to wall cabinets (320 deep at both settings)" was wrong about the code and is superseded.
- **Not** to customer-supplied rows, **not** to a row that does not deepen (`fridge-free`, 742 at both), and **not** to
  hardware or accessories.
- It is applied **at the cabinet's real width**.
- It **multiplies with the material percentage** (ADR 0092 Amendment of 2026-10-25), for example
  1 500 × 1.15 × 1.35. The 1.15 and 1.35 are illustrative.

**What the customer sees.** The depth uplift is its own line, **"Adâncime 700 mm"**, not folded into
a cabinet's amount.

**Where it is edited.** In a **"Price rules for all cabinets"** card at the top of the Dulapuri
screen. It does **not** go on Setări implicite, which only chooses what a new kitchen starts with, and
it does **not** go on Materiale.

**Decision 5 now binds a shipping change.** The customer copy `globalSettings.depthNote`, which says
depth does not change the estimate (`apps/web/src/messages/ro.json:324`, `ru.json:324`), must change in
the same change that ships the coefficient, and not before.

**Still not an approved number.** The working figure of about 15% (decision 2) is not approved. The
dashboard's value is the manufacturer's to enter; a sample book must not present 1.15 as theirs.

**Still open, and now on the critical path.** The rounding seam in *What whoever picks this up needs
to know* is unchanged and unsettled. [ADR 0175](0175-a-cabinet-is-priced-by-an-anchor-at-its-default-width-plus-steps-widths-and-heights-round-up-to-50-mm-and-prices-round-to-10-lei.md)
decision 5 records which amount is rounded as an open seam for the architect. The parser bound
`MAX_PRICE_COEFFICIENT_MINOR` must be re-derived, as that section says.

**Effect on the backlog.** Entry 54 stays open and is superseded in part by backlog 283, which carries
the pricing-engine work. Entry 54's "do not plan a wave" no longer holds; nothing is scheduled by this
amendment, and the dashboard still comes after M8 (ADR 0062).

## Amendment — 2026-10-26: the timing, the rounding seam, the real-width reading and a line number

**Evidence tier: doc-quoted from `docs/milestones/M10-price-dashboard.md` §4 (S-7, S-10, S-11, S-22) and §5; the line
number in S-22 is the plan's source reading, not re-read by the scribe. Nothing is built.**

- **Timing.** "The dashboard still comes after M8" is superseded by
  [ADR 0176](0176-the-manufacturer-price-dashboard-is-milestone-m10-and-starts-now.md): M10 starts now.
- **The rounding seam is settled** by [ADR 0177](0177-the-m10-pricing-seams-rounding-round-up-percentages-deepening-fixed-size-rows-linked-accessories-and-the-lift-mechanism.md)
  A-1, which reverses "the query is the one place this wave forbids rounding" at one named seam. The parser bound
  `MAX_PRICE_COEFFICIENT_MINOR` is **re-derived, not widened** (A-5).
- **"Applied at the cabinet's real width"** is read as the cabinet's own width, not the anchor width: the percentage
  multiplies the cabinet's **priced amount**, which already reflects round-up (A-1).
- **"Where it applies"** is keyed on a **measured** catalogue fact, not on `depthFollowsSetting()` (which answers `true` for
  the wall corner returns), with a parity test over every row (A-6).
- **Line drift.** `globalSettings.depthNote` is at line **325** in `ro.json` and `ru.json`, not 324 (the plan's source
  reading). Decision 5 still binds: the copy and the depth term ship together (M10 merge point MP-3).
- The ~15 % figure remains a placeholder and is not approved.
