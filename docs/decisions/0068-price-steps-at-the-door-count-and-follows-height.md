# ADR 0068 — Price steps at the door count, and follows height where a body builds to its opening

Status: Accepted
Date: 2026-09-03
Type: Decision
Milestone: M6 wave 6B2 — extends [ADR 0035](0035-width-is-a-bounded-stepper-not-a-menu-of-sizes.md) decision 8; reaches 6G and M8

## Context

[ADR 0035](0035-width-is-a-bounded-stepper-not-a-menu-of-sizes.md) decision 8 requires price to be a
**formula over width** rather than a table keyed on sizes, and
[ADR 0062](0062-a-manufacturer-price-dashboard-comes-after-m8-and-shapes-seams-now.md) requires the
formula to be a **named shape whose coefficients live in the price book** — shapes are code,
coefficients are data — so that a manufacturer can change a price without a deploy.

Wave 6B implemented one shape, `linear-in-width`. Asked to **assess rather than assert** whether that
was genuinely general or twenty rules in disguise, its implementer answered specifically: one shape
covers today's catalogue **because every §7 row builds at one height regime and one door regime**, so
both fold into the constant term and width is the only free variable. That is a real property of the
current catalogue, not an arrangement — and it named what would break it, in the order it expected.

The owner has now confirmed the first two.

## Decision

**1. Price steps at the door-count threshold.** The step happens at `deriveDoorCount`'s threshold,
not smoothly, and `linear-in-width` cannot express it.

The owner's reasoning, verbatim, because it names the **cost drivers** rather than only the outcome:

> *"for another door you have additional handle and of course door mechanisms so it should change the
> price, related to front material is near the same but processing includes more margins so also I
> think it should cost little more than one door."*

Three drivers, and they are **not the same kind of thing**, which matters for where each is priced:

- **A handle** — wave 6L already declares a per-entry count ([ADR 0061](0061-a-cabinet-handle-is-declared-and-an-appliance-bar-is-not-one.md)).
- **Door mechanisms** — hinges and slides, which is exactly what 6G's hardware tier prices.
- **Processing margin** — neither of the above, and belongs to the carcass rule itself.

Front material is roughly unchanged, so this is **not** a material-quantity effect.

**2. Height affects price where a body builds to its opening.** Two instances of one catalogue row
can differ in height, and today they price identically. The owner ruled that taller costs more.

**The owner did not take "price by front area" (width × height).** Height is an **input** to the
price, not a replacement for width, and this must not be folded into an area model. The distinction
is load-bearing — see *What the third prediction now rests on* below.

**3. ADR 0062's prohibition is untouched and still binds.** A step and a height term are both
expressible as **data given the right shape**. Adding a shape must not become adding a function per
cabinet: if a wave finds itself writing per-row logic, it has taken the wrong turn, and the price
book stops being editable by anyone but a developer — which defeats the dashboard's whole purpose.

## The collision with 6G, which must not be resolved one-sidedly

The M6 plan already carries an open question on wave 6G: **what does a hardware tier count when it
prices hinges and slides — leaves, bands, or cabinets?** — because `deriveDoorCount` returns **leaves
per band**, so a 600 mm pantry has four hinged leaves while that function answers two.

**Decision 1 above puts a second consumer on the same count**: a carcass's own price now steps per
leaf. So **if both end up counting leaves, they must count them the same way.** Neither question may
be answered without the other, and the failure mode is quiet — two rules that each look right and
bill a banded cabinet on different denominators.

## What the third prediction now rests on

The implementer's third named risk was **price per square metre of front**, which it argued is *not*
a problem because at a fixed height it is linear in width: `k · w · h` with `h` constant is
`(k · h) · w`, and the coefficient absorbs the height.

**Decision 2 removes the fixed height for exactly the bodies concerned, so that argument no longer
holds — though its conclusion still does, for a different and weaker reason.**

- Under decision 2 as ruled, height enters **additively**: `a + b·w + c·h` expresses "taller costs
  more" and remains a named shape over coefficients.
- Under an **area** model it would enter **multiplicatively**: `k·w·h` is a *product* term, and no
  amount of additive width and height terms expresses it. That is a genuinely different shape.

So the conclusion "no area shape is needed" survives — **but it now rests on the owner's rejection of
area pricing, which is a product decision that could be revisited, rather than on every row having a
fixed height, which was a structural fact about the catalogue.** The margin of safety moved from
something that cannot change without a code change to something that can change in a conversation.
Recorded so that whoever meets an area-pricing request knows it needs a shape and not a coefficient.

## A population correction

The owner named `wall-lift` and `open-shelf`. **The property is wider than those two rows:**
`heightFlex: true` is declared on the shared **wall-band shape** in `catalog.ts`, so every
height-flexible wall row has it — `wall-cabinet` included — and §5.2's `CABINET_SIZED_OPENING_MAX_M`
means any of them fills an opening of 900 mm or less at that opening's height.

**Pricing must therefore key on the property, not on a list of ids.** A rule naming two build ids
would be correct today and silently wrong for the third row that already has the same behaviour.

**This is no longer a hypothetical risk. It caught a real defect mid-flight**, on 2026-09-03: this
record landed in the tree while wave 6B2 was being implemented, and the two-shape design then in
progress would have been **silently wrong on `wall-cabinet`** — the most-inserted row in the
catalogue — because that row is height-flexible **and** `doorCountFollowsWidth`, so it needs both
terms at once. The wave ships **four** shapes, the fourth carrying both. A rule naming
`wall-lift` and `open-shelf` would have priced the row a customer inserts most often as though
neither term applied to it.

## Alternatives considered

- **One shape with a per-row coefficient table.** Rejected: that is the width-keyed table ADR 0035
  decision 8 refused, reintroduced on a different axis.
- **Price by front area.** Not taken by the owner. Recorded above rather than dismissed, because it
  is the one prediction that would need a new shape rather than a new coefficient.
- **Fold the door step into the hardware tier**, since two of its three drivers are hardware.
  Rejected: processing margin is neither a handle nor a mechanism, and it belongs to the carcass. It
  would also make a cabinet's own price depend on a whole-kitchen setting.

## Consequences

- Wave **6B2** implements both shapes. It is deliberately a separate wave from 6B — see the M6 plan
  — and **it is also the test of whether 6B met ADR 0062**: if adding a shape is cheap, 6B built a
  registry; if it requires restructuring, that is a finding about 6B.
- Wave **6G** cannot answer its leaf-counting question alone, and neither can this decision.
- M8's review summary and any snapshot verification inherit whatever shapes exist; nothing here
  changes the pricing-version equality rule.

## Note — 2026-10-25: both terms survive as dashboard fields

The door-leaf step and the height term remain, expressed as the "+ lei per extra door leaf" and
"± lei per 50 mm of height" fields of the anchor-and-steps model in
[ADR 0175](0175-a-cabinet-is-priced-by-an-anchor-at-its-default-width-plus-steps-widths-and-heights-round-up-to-50-mm-and-prices-round-to-10-lei.md).
The door field covers the door panel only; hinges are counted under hardware. Height is still an
additive input, not an area. Whether the door count follows the actual or the rounded width is open
(ADR 0175, *Open*).
