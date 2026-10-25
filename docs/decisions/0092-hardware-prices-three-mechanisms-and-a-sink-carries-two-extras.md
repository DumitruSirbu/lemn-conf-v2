# ADR 0092 — Hardware prices three mechanisms, a sink carries two extras, and the default tier stops being a floor

Status: Accepted
Date: 2026-09-06
Type: Decision + Finding
Milestone: M6 — plans waves 6T and 6T2, and opens wave 6W

**Amended 2026-09-06, the same day, on three defects found while implementing 6T.**
**Amendment A** corrects decision 6's reconciliation table, which billed 6T2's sink extras inside
figures 6T was asked to reproduce — so 6T's own criterion demanded a number 6T cannot produce.
**Amendment B** is decision 15: this record moved the default hardware tier off zero without noticing
that it was a customer-visible baseline, and without a ruling that says it should.
**Amendment C** carries the owner's push-to-open ruling of 2026-09-06 and corrects decision 3, whose
safety premise — *"the seeded design carries no push placement"* — is false: the product's notion of
push-to-open is broader than the recorded handle mode, and the shipped demo carries **16** push
fronts, not zero. Every *"0 push"* figure in this record inherits that error and each is corrected at
its site. All three corrections are made in place, because the record is one day old and its numbers
are load-bearing; what changed and why is stated at each site.

**Implementation status, recorded 2026-09-07. ~~Three of the four waves this record plans are
implemented and not yet on `main`~~ — superseded later the same day: all four are on `main`.** **6T**
(`0d0ee61`, QA `88f85e2`, `e9ab7b2`), **6T-a** (`0a9ce1a`, QA `fb127b8`) and **6W** (`1d6fc7e`, QA
`ca35b96`) reached `main` as one merge, **`857a29e`**, per decision 12; they were gated on branch
`wave/6t-finish` at `ca35b96`: **all ten `pnpm ci:local` gates PASS**, `pnpm test` **7 387 passed / 4
skipped across 334 files**, **e2e 99 passed / 1 skipped**. Amendment C itself is `bf2ba61`.
**~~6T2 is still open.~~ 6T2 shipped 2026-09-07 and merged to `main` at `825ba43`** — decisions 9–11
implemented as decided, with **adversarial QA (289 tests)** and a **logic review (Full)**. Two things
worth carrying out of that wave into this record: its QA found **two criteria passing on
implementations that did not satisfy them** — a hard-coded `entry.wall === "A"` in decision 10's host
resolution survived all **3 225** domain tests, and decision 11's `isWholeKitchenLine` reverted to its
old `kind !== "cabinet"` negation survived all **1 673** web tests — and it raised **open input 7**
below, a gap in decision 10's contract rather than a defect against it. The last dated gate run
covering this record's waves is at M6's 2026-09-07 close: **all ten gates PASS**, `pnpm test` **7 971
passed / 4 skipped**, **e2e 110 passed / 1 skipped**, run locally. Two things this record's own decisions
now depend on are stated where they belong rather than here — open input 1 (the three drafted
push-to-open rates, now load-bearing on a customer-visible price) and open input 4 (6W's *De la*
claim, shipped under an architect's interim the owner has not ruled on). **Checked at the same
pass: Amendment C's millimetre-literal rule is stated in `docs/milestones/done/M6-price-and-global-settings.md`
and the false float premise that once justified it — that `TOP_ROW_Y0_M * 1000` evaluates to
`2200.0000000000002`, when it is exactly `2200` — appears only there, struck and corrected. This
record never carried it and there is nothing here to unwind.**

## Context

[ADR 0070](0070-hardware-is-priced-per-mechanism-not-per-handle.md) (owner, 2026-09-04) ruled that
hardware is priced **per mechanism** and recorded two sink-specific extras, then left three
implementation gaps open and scheduled none of them. Wave **6S** shipped the first two on 2026-09-04
(`280daa4`/`a2bff48`): door leaves, drawers and per-band door heights are now declared catalogue
facts held to the builders by a 254-case parity gate. The third gap — *"the shipped hardware tier's
own quantity basis is superseded; replace, not extend"* — is what wave **6T** exists to close.

This record is the ruling that stands between ADR 0070's prose and a developer's diff. It decides the
numbers, the shapes, the two rows 6S left open, the two owner rulings of 2026-09-05, and one thing
nobody has ruled: **what a price book made of per-mechanism rates does to the promise that the
default tier is the cheapest one.**

Two owner rulings arrived on 2026-09-05 and are applied here without re-litigation:

1. **The hardware tier names are `Standard` / `Hettich` / `Blum`** — *"the prices were collected from
   them"*.
2. **Width decides, and there is no cabinet-height pricing rule** — *"the top cabinets in the
   majority of cases should not have big height… In the majority of cases the height is 2500-2800, if
   it will be higher I have doubts somebody will make so high cabinets. It will be impossible to
   reach them even using a chair and will require a stair."*

### What was measured for this record

Verified against the tree on 2026-09-06, not inherited from ADR 0070's prose or the wave plan.

- **`alongMm` is the along-wall *centre*** (`design.ts:93`), so the seeded sink base `p0`
  (`kitchen-l-design.ts:815`, wall A, centre 1300, width 800) spans **900–1700** — ADR 0070
  decision 4's figure is correct as written.
- **Exactly two wall-band bodies overlap that span, and two more touch it.** `p11`
  (`wall-2door-800`, `y0` 1500, centre 1300) spans 900–1700 and `p17` (`wall-2door-800-top`, `y0`
  2200) spans the same. `p10` ends at 900 and `p12` begins at 1700; `p16` and `p18` do the same one
  band up. **So "overlap" must be a positive-length intersection.** Were touching counted, `p12`
  (`open-shelf-600`) would tie with `p11` at the same `y0`, and the rack would resolve to a body with
  no carcass to hang it in.
- ~~**The seeded design carries no `handle: "push"` placement.** No placement in
  `KITCHEN_L_PLACEMENTS` declares `handle` at all, which is why ADR 0070's totals table has a hinge
  row, a drawer row and a sink-extras row and no push row.~~
  **Corrected by Amendment C.** The first sentence is true and the inference drawn from it is not.
  No placement declares `handle`, but a front with no *recorded* mode is still push-to-open when it
  stands in the top row: §6.5 ships that row push-to-open by slot, `isPushOpenByDefault`
  (`bands.ts:73`) is the rule, and `scene-sync.ts:236-239` hides the bars accordingly. `p15`–`p23`
  (`kitchen-l-design.ts:836-844`) are nine top-row placements carrying **16 door leaves and no
  drawers**, so the seeded design carries **16 push fronts**. ADR 0070's totals table has no push row
  because the owner priced hinges and drawers and published no push figure — not because the kitchen
  has no latches in it.
- **The only door leaves in the catalogue over 900 mm are two declarations.**
  `PANTRY_DOOR_BAND_HEIGHTS_MM` is `[1290, 790]` and `FRIDGE_HOUSING_DOOR_BAND_HEIGHTS_MM` is
  `[1350, 530, 190]` (`front-population.ts:97,106`). A `one-band-under-frame` row **cannot** reach the
  threshold: `insert-fit.ts:62` caps a cabinet-sized opening at `CABINET_SIZED_OPENING_MAX_M = 0.9`,
  and `WALL_DOOR_BAND_INSET_MM` is 6, so the tallest band such a row can ever declare is **894 mm**.
- **The 74-hinge stop condition is already checkable against 6S's shipped pins, not against this
  record's reasoning.** `front-population.test.ts:207` pins the seeded kitchen at 26 placements,
  **36 leaves** and **5 drawers**; `:229` pins the leaves over 900 mm as exactly `[1290, 1290]`. So
  34 × 2 + 2 × 3 = **74**, agreeing with ADR 0070's independently derived figure — which means 6T's
  *"if the two disagree the wave stops"* criterion is answerable before a line of 6T is written, and
  it does not trigger.
- **6S's queries are the whole basis 6T needs.** `doorLeafHeightsMm`, `doorLeafCount`, `drawerCount`
  and `frontPopulationQueryFor` (`front-population.ts`) answer per placement, built from the
  placement's own width and height — the seam 6S's review round explicitly fixed so that a later wave
  could not source the height from a definition's nominal.
- **The builder draws a sink and names it.** `kitchen-parts.ts:1109` builds `base-sink` as
  `baseCabinet(0.8, { doors: 2, sink: true })`, and the sink group is `G("sink_faucet")`
  (`kitchen-parts.ts:1338`). So a declared sink fact is parity-gateable exactly as 6S's front
  population is.
- **`base-sink` is not identifiable by kind, and there is more than one sink row.** `base-sink`
  declares `kind: "base_cabinet"` like every other base body, and the seeded row is `base-sink-800`,
  which reaches `base-sink` only through `catalogEquivalentId`.
- **`NegativeTierDeltaError` throws.** `whole-kitchen-tiers.ts`'s `exactDelta` throws when a tier
  prices the kitchen below its group's default, and the module's own comment calls that *"a book
  fault to be reported, not a discount to be invented"*. It is reached from the settings surface,
  which is the one control a customer with an unpriceable document has to recover with.
- **The whole-kitchen line shape carries one quantity and one unit amount**, with
  `amountMinor === quantity × unitAmountMinor` stated as an invariant in `price-lines.ts`. Three
  mechanism rates cannot share one unit price.
- **`listRuleIds` (`price-book.ts:414`) sweeps cabinet rules and both tier groups** for duplicate
  rule ids, and nothing else.
- **The breakdown reads whole-kitchen rows through `isWholeKitchenLine`, which is
  `line.kind !== "cabinet"`** (`price-breakdown-model.ts:247`), and labels each with
  `WHOLE_KITCHEN_CATEGORIES[line.kind]` — a `Record` over `WholeKitchenPriceLine["kind"]`. A third
  line kind added to the domain and not to that record renders `undefined · <name>` and compiles.

### Classification

**A contract gap, not an implementation defect.** Nothing shipped is wrong: 6G's
`perCabinetHandleMinor` was an honest placeholder ADR 0070 supersedes by name, and 6S's declarations
are correct. What was never written down is (a) how ADR 0070's *per-drawer* price table reconciles
with its *"2 mechanisms per drawer"* wording, (b) what the sample amounts are, given that the ADR
publishes ranges and two product lines per tier, and (c) that a tier priced by per-mechanism rates
can price **below** the default tier on some designs while pricing above it on others. (c) is the
finding this record contributes, and it is why wave **6W** exists.

## Decision

### 1. The quantity basis is three mechanism counts, read from the placement's own catalogue entry

`HardwareTier.perCabinetHandleMinor` is **replaced**, not extended. A hardware tier declares three
rates and the query counts three mechanisms over the projection:

- **Hinges** — 2 per door leaf, **3 where that leaf is taller than 900 mm**. Counted over
  `doorLeafHeightsMm`, one entry per leaf, never over `doorBandHeightsMm`: 6S records that applying
  the threshold to bands answers 45 on the seeded kitchen against the correct 74.
- **Drawer runners** — one rate per **drawer**; see decision 2.
- **Push-to-open** — see decision 3.

**The counts are read from the placement's own catalogue entry, never from the priced-as row.** This
is the same split `countCabinetHandles` already makes and it is load-bearing for the same reason: a
price *rule* belongs to the row a body is named after (ADR 0022), while a mechanism is a property of
the body standing in the kitchen. The query is built by `frontPopulationQueryFor` from the
placement's own width and height, which is the seam 6S's review round created precisely so that this
wave could not take the nominal instead.

**A body whose front population cannot be read refuses the whole design.** `doorLeafCount` and
`drawerCount` throw `UndeclaredFrontPopulationError`; the query converts that to a new
`PricingFailureCode` — **`UNDECLARED_FRONT_POPULATION`** — naming the placement and the build id.
**A missing declaration is never read as zero mechanisms**, which is the failure mode ADR 0061
decision 4 and `front-population.ts`'s own header both exist to prevent.

### 2. The runner rate is priced **per drawer**, and *"2 mechanisms per drawer"* is a description of what one drawer buys

ADR 0070 decision 1 says *"2 mechanisms per drawer"*; its price table says **"Price per drawer"**;
its totals table bills 5 drawers at 640 MDL to reach 3 200. **The totals table is the tiebreaker,
because it is the owner's own derivation** — and it is unambiguous: a runner *set* is what one drawer
takes, and one drawer's price buys the pair.

So the book declares `perDrawerMinor` and the quantity is the drawer count. **A wave that multiplies
by two doubles the drawer line and disagrees with ADR 0070's own arithmetic by a factor of two on
every tier.** The field is named for the drawer and not for the runner so that no reader is tempted.

**The arithmetic confirms it three times over, and each is an exact division.** Every drawer subtotal
in ADR 0070's totals table is exactly **5 × one of its own listed per-drawer prices** — 3 200 = 5 ×
640, 3 130 = 5 × 626, 4 185 = 5 × 837 — so a doubled quantity would need the seeded kitchen to hold
**2.5 drawers**. The hinge column divides exactly the same way at 74: 6 290 / 74 = 85.00 and
5 550 / 74 = 75.00, with 74 × 17.60 = 1 302.40 against the owner's rounded 1 300. The denominators
are not a reading of the prose; they are recoverable from the numbers alone.

### 3. Push-to-open is one mechanism per opening front that carries no handle, and its three rates are drafted, not measured

**Count.** One per **door leaf** and one per **drawer**. Per front, not per body and not per band — a
push latch is fitted to each front that opens, which is the same denominator the hinge rule uses.

~~…on a placement whose `handle` is `"push"` and only there. The handle mode is per placement
(`DisplayEntry.handle`, §6.5), so the count is read there and not from the catalogue.~~

**Amendment C, 2026-09-06 — the owner priced the latch, and the recorded handle mode is not the
product's notion of push-to-open.** The struck clause is what shipped in
`hardware-mechanisms.ts:139-141`, and it is wrong in both directions. The owner's ruling, verbatim:

> "Hmm, push to open mechanisms cost money, and when you have a cabinet with handle you don't need a
> push to open mechanism, as I mentioned handles are bought by customer but push to open by
> manufacturer and should be priced"

Two things are settled by it, and they are complementary: a push latch **is** a manufacturer cost and
**must** be priced, and **a front that carries a handle does not carry a latch**. Every opening front
has one or the other. It does not overturn decision 1 of
[ADR 0070](0070-hardware-is-priced-per-mechanism-not-per-handle.md), which already said *"1 mechanism
per door and per drawer, and **only where the cabinet has no handle**"* — it says which fact answers
*"has no handle"*, and it is not the recorded mode.

**The two predicates that disagreed.** The scene decides whether a front carries a handle at
`scene-sync.ts:236-239`:

```ts
function hidesHandles(record: PlacementRecord): boolean {
  if (record.handleMode && record.canHandle) return record.handleMode === "push";
  return isPushOpenByDefault(record.frame.y0);
}
```

Pricing decided it again, differently, and the two disagree in **both** directions:

- **Direction A — a hidden bar billed at nothing.** No recorded mode plus a top-row slot: the scene
  hides the bars, the panel says *"Implicit pentru acest corp: Push-to-open"*
  (`describe-selection.ts:198-200`), and pricing counted **0**. On the shipped demo that is `p15`–`p23`
  — **16 leaves, 16 latches, billed at zero**, which is the exact defect wave 6T exists to remove,
  surviving inside the wave that removes it.
- **Direction B — a visible bar billed a latch.** A recorded `push` on a body whose definition says
  `canHandle: false`: the scene keeps the bars — `scene-sync.ts:229-234` says so outright, and names
  the hand-edited or migrated document that produces it — and pricing billed a latch per front.

**The ruling: one predicate, published by the domain, called by both.** `hidesHandles` becomes the
domain's answer and the adapter calls it rather than restating it. The predicate reads three facts —
the front's floor, the recorded mode, and whether the body's definition permits a mode at all — and
nothing else. Its signature, its home and its unit are ruled in the wave section below rather than
here, because they are module boundaries and not product rules; what this record fixes is that
**there is one of it**, and that the scene and the price cannot answer it differently.

**How `canHandle: false` participates, ruled explicitly, because the owner's sentence does not cover
it.** `canHandle` **disqualifies the recorded mode and nothing more.** It does not exempt a body from
carrying latches, and it does not mean the body has no handle:

- **Measured in the catalogue, both parts.** Every row that declares `NO_CABINET_HANDLES` also
  declares `NO_OPENING_FRONTS` (`base-hob-oven`, `open-shelf`, `hood`, `fridge-free`), so a body with
  nothing to grip also has nothing that opens and contributes zero of every mechanism. And the
  corner returns declare `canHandle: false` **beside** `carriesHandles(1)` and one door leaf
  (`kitchen-l-design.ts:557-569`, `:670-683`) — a flag that keeps a structural body out of the
  panel's *Mâner* section ([ADR 0021](0021-corner-returns-are-structural-in-data.md) decision 2), not
  a statement that the front has no bar.
- **So the flag is read exactly where the scene reads it.** `wall-corner-return-570` at `y0` 1500 has
  its bar built and visible: a handle, no latch. Its twin `wall-corner-return-570-top` at `y0` 2200
  has the same bar built and **hidden by the slot**, and the customer cannot turn it back on: that
  front opens with nothing to grip, so it is push-to-open and it is billed a latch. The owner's
  *"when you have a cabinet with handle you don't need a push to open mechanism"* is a statement
  about the bar on the front, and this reading is the one that answers it per front.
- **The case nobody has built: an opening front with neither a bar nor a permitted mode.** No such
  row exists today. If one is added it is a **catalogue defect** — a front that cannot be opened —
  and not a pricing question, so the wave asserts `openingFronts > 0 ⇒ cabinetHandles > 0` as a
  property over every entry rather than letting pricing invent an answer for it.

**Records swept before ruling `canHandle`, none overturned.** [ADR 0021](0021-corner-returns-are-structural-in-data.md)
decision 2 (structural corners take `canFinish`/`canHandle` false as a §13.1 extension),
[ADR 0025](0025-the-corner-base-legs-seat-on-the-l-joint.md) decision 4,
[ADR 0027](0027-the-hob-is-part-of-the-cabinet.md) (*"`canHandle` implies a **cabinet** handle — one
whose group also holds the front it opens"*), [ADR 0050](0050-the-hob-oven-filler-is-a-finishable-front.md)
decision 3 (*"the filler is a facade, not a leaf — nothing behind it opens"*),
[ADR 0051](0051-the-dishwasher-niche-wears-a-decor-door.md) decision 5 (`canHandle: true`,
deliberately unlike ADR 0050) and [ADR 0061](0061-a-cabinet-handle-is-declared-and-an-appliance-bar-is-not-one.md)
(the panel decides through the declared flag). **Every one of them rules what the flag does to a
*control* or to a *mesh*; not one rules what it does to a *price*.** ADR 0050's *"nothing behind it
opens"* is the sense in which the flag coincides with having no fronts, and the corner returns are
the case where it does not — which is why this is stated rather than assumed.

**Rates.** ADR 0070 priced hinges and drawers and **published no push-to-open figure**. No number in
this repository or in that record supports one. The three sample rates in decision 6 are therefore
**drafted placeholders with no supplier source**, marked as such in the book's own data and listed as
an open owner input below. Their *ordering* follows each tier's own hinge rate, which is the only
defensible relation available; their magnitudes are not evidence of anything.

~~**Nothing asserted depends on them.** The seeded design carries no push placement, so every
reconciliation in decision 6 is computed at zero push mechanisms. That is what makes shipping a
drafted amount safe here, and it is the condition under which it stays safe: **a fixture that adds a
push placement to a reconciled total has made a placeholder load-bearing.**~~

**Amendment C — the premise was false and the safeguard it justified has already been spent.** The
seeded design carries **16** push fronts, so under the corrected predicate the demo's own hardware
total contains a drafted amount at every tier. The owner has ordered counting and has supplied no
figures, so the choice is not whether a placeholder becomes load-bearing for a *total* — it already
has — but whether it is allowed to become load-bearing for an *expectation*. **It is not:**

- **The count is pinned as a number**, because it is a product fact derived from the design and the
  catalogue and answerable without any amount: the seeded kitchen carries **74 hinges, 5 drawers and
  16 push mechanisms**.
- **The seeded push *amount* is never pinned as a literal.** Any assertion that reaches it computes
  it as `count × the tier's declared rate, read from the book`, so replacing a drafted rate with a
  measured one moves the book and moves no expectation. A test typing `64_000` has made the
  placeholder load-bearing in the way this paragraph forbids.
- **The hinge and drawer columns stay pinned as literals** against ADR 0070's own columns, and are
  untouched by any of this: 74 and 5 do not move.
- **Tier *order* must not be pinned while the magnitudes are drafted** — see the two measured
  consequences below, the second of which is an order the placeholders alone produce.

**What the drafted magnitudes now do, measured on the shipped demo.** Both figures are consequences
of placeholders, not of anything the owner priced:

1. **The demo's hardware line rises by 640 / 1 920 / 1 600 MDL** at Standard / Hettich / Blum —
   16 latches at the drafted 40 / 120 / 100.
2. **Hettich overtakes Blum.** At 16 latches Hettich totals **11 340 MDL** against Blum's **11 335**,
   inverting the order ADR 0070's own totals table states (~10 020 against ~10 335) and which holds
   on the hinge and drawer columns alone. **The most expensive tier a customer sees is decided by a
   number with no supplier source.** It refuses nothing and corrupts nothing — the deltas stay
   positive and `NegativeTierDeltaError` is not reached — but it is a customer-visible ordering
   produced by a placeholder, and it is why the three real figures are now load-bearing.

**So open input 1 is promoted**: the three push-to-open rates are the first item on the pending-owner
list and they are **load-bearing**, no longer a placeholder nothing depends on.

**They must be non-zero at every tier.** The defect 6T exists to remove is a push-to-open kitchen
billing its hardware at exactly zero; a zero placeholder reinstates it while looking implemented.

### 4. The hardware line stays **one** line, with quantity 1, and the mechanism counts are a published domain query

`amountMinor === quantity × unitAmountMinor` is a published invariant of every price line. Three
rates cannot share one unit price, so the hardware line becomes what the material line already is:
**`quantity: 1`, `unitAmountMinor` = what this whole kitchen's hardware costs at this tier.**

- **Not three lines.** The breakdown labels a whole-kitchen row `category · tier name`, so three
  hardware lines render as three identical rows reading *Feronerie · Blum*, and distinguishing them
  needs three new Romanian strings nobody has ruled for a distinction the customer did not ask for.
- **Not a summed quantity.** 74 hinges and 5 drawers do not add to a quantity anything can be priced
  by, and a unit price derived by division is a rounded number on a line that must not round.
- **The counts are still published — as a domain query, not as a line field.**
  `countHardwareMechanisms(entries, catalog)` answers `{ hinges, drawers, pushToOpen }` and is what
  pricing multiplies the book's rates by. It lives at
  `packages/configurator-domain/src/hardware-mechanisms.ts`, beside `cabinet-handles.ts` and
  `front-population.ts` and **outside `pricing/`**: it is a fact about a design's bodies, not about
  money, and the manufacturer dashboard (ADR 0062) will want it without importing pricing.
- **No new published field on the line.** A `basis` breakdown on `WholeKitchenPriceLine` would be a
  persisted-looking seam with no production reader — the shape ADR 0072 finding 2 refused twice
  already. The query has a production caller from the day it lands; that is the difference.

Each of the three rates passes through `usableCoefficientOf` **individually**, so a book that
declares one of them as `null`, a fraction or a string refuses with `INVALID_AMOUNT` **naming that
field**, rather than contributing an honest-looking zero to a total. `PriceCoefficientField` gains
`perHingeMinor`, `perDrawerMinor` and `perPushToOpenMinor` and loses `perCabinetHandleMinor`.

### 5. The 900 mm threshold reads a declared **leaf** height, and no height-keyed mechanism rule is built — both height rules survive, and they are different rules

The owner's 2026-09-05 ruling and [ADR 0068](0068-price-steps-at-the-door-count-and-follows-height.md)
decision 2 do not collide, and this record says so explicitly rather than letting a later reader
assume one killed the other.

- **ADR 0068 decision 2 survives untouched.** *"Taller costs more"* is a **carcass** price term —
  more material and more processing in a body built to a taller opening — shipped by wave 6B2 as the
  `linear-in-width-and-height` and `linear-in-width-height-and-door-leaves` shapes. Nothing in 6T
  touches a cabinet formula.
- **The 2026-09-05 ruling survives, and it is about a different question**: whether a taller cabinet
  adds a **mechanism**. It does not. There is no height-keyed mechanism rule, and 6T is smaller than
  its original plan because of it. Width decides, through the door and drawer counts a body's width
  already determines.
- **The one height a mechanism rule reads is the declared door-**leaf** height** — 6S's
  `doorLeafHeightsMm`, not `heightMm`, not `frameHeightMm`, not a definition's nominal.
- **The threshold is `> 900`, and equality takes two hinges.** ADR 0070's wording is *taller than
  900*; a re-implementation gets `>=` wrong and nothing in the seeded design would notice.
- **The catalogue cannot reach the threshold from a flexible row.** The 894 mm ceiling measured above
  means the only leaves over 900 mm are the pantry's 1290s and the fridge housing's 1350 — two
  declarations, both fixed. This is worth asserting as a property rather than leaving as an
  observation: it is the fact that makes the owner's *"no height rule"* ruling and the 900 mm
  threshold consistent with each other rather than merely coexisting.

### 6. The sample amounts, and where every number comes from

ADR 0070's consequences permit its tables to be typed into `sample-price-book.ts` **by the wave that
also rebuilds the quantity basis they depend on**, which is this one. The ADR publishes ranges and
more than one product line per tier, so a derivation rule is needed, and it is **read off the owner's
own totals table rather than chosen**:

- **Where the ADR gives a range, take the midpoint.**
- **Where the ADR gives more than one product line, take the one the owner's totals used** — the
  complete-box row for Standard (DTC Tandembox-style, 640) and for Blum (Tandembox M, 837), and
  Quadro V6 for Hettich.

| Tier (`tierId` unchanged) | Per hinge | Per drawer | Per push-to-open |
| --- | --- | --- | --- |
| Standard (`hardware.standard`) | 17.60 MDL — `1_760` | 640.00 MDL — `64_000` | **drafted** 40.00 MDL — `4_000` |
| Hettich (`hardware.soft-close`) | 85.00 MDL — `8_500` | 626.00 MDL — `62_600` | **drafted** 120.00 MDL — `12_000` |
| Blum (`hardware.premium`) | 75.00 MDL — `7_500` | 837.00 MDL — `83_700` | **drafted** 100.00 MDL — `10_000` |

**The two sink extras are flat, per sink, and the same at every tier**: aluminium protective cover
**200.00 MDL — `20_000`**, dish drying rack **400.00 MDL — `40_000`**. ADR 0070 bills *"Sink extras
600"* identically in all three tier columns, which is what says they sit outside the tier rather than
inside it.

**The derivation reconciles against ADR 0070's independently derived totals**, on the seeded kitchen
at 74 hinges, 5 drawers, ~~0~~ **16** push mechanisms and 1 sink.

**Amendment C — the reconciliation is against ADR 0070's *columns*, and the push column reconciles
against nothing.** ADR 0070 priced hinges and drawers on this kitchen and published no push figure,
so its ~5 100 / ~10 020 / ~10 335 totals are hinge + drawer + sink-extras totals. They remain the
check for those three columns and they are **not** the check for the shipped total, which exceeds
them by the push column at every tier. Stated as an equation rather than as a table of totals, so it
survives the owner supplying real rates:

**hardware total = 74 × perHinge + 5 × perDrawer + 16 × perPushToOpen**, and the first two terms are
`450_240` / `942_000` / `973_500` — unchanged, and still the figures the columns below reconcile.
The third term is drafted, so it is asserted as `16 × the book's own declared rate` and never as an
amount. A criterion naming the shipped total as a literal has pinned a placeholder.

**Amendment A, 2026-09-06 — the reconciliation is per column, and each wave owns its own columns.**
As first written this table published only the *Total* column, which includes the sink extras
decision 13 moved to **6T2** — so 6T's acceptance criterion demanded a figure 6T cannot produce, and
6T2's had no total at all. **Nothing about the amounts changed; the arithmetic is separated.** No
check is lost by separating it: ADR 0070's own table is already columnar — *Hinges | Drawers | Sink
extras | Total* — so each wave reconciles against the owner's own columns and the two together
reconcile against his total.

| Tier | Hinges | Drawers | **6T reconciles to** | 6T2 adds | **Together** | ADR 0070's total |
| --- | --- | --- | --- | --- | --- | --- |
| Standard | `130_240` | `320_000` | **`450_240`** (4 502.40 MDL) | `60_000` | `510_240` (5 102.40) | ~5 100 |
| Hettich | `629_000` | `313_000` | **`942_000`** (9 420.00 MDL) | `60_000` | `1_002_000` (10 020.00) | ~10 020 |
| Blum | `555_000` | `418_500` | **`973_500`** (9 735.00 MDL) | `60_000` | `1_033_500` (10 335.00) | ~10 335 |

**6T reconciles against ADR 0070's hinge and drawer columns** — 1 300 + 3 200, 6 290 + 3 130,
5 550 + 4 185 — and **6T2 against its flat *Sink extras 600*, identical in all three tier columns**,
which is what says the extras sit outside the tier rather than inside it. **The whole-total check is
6T2's, and it is the wave that can first perform it**; a 6T criterion naming `510_240` is a criterion
6T fails by construction.

**Amendment C — the *Together* column is no longer ADR 0070's total, and the difference is the push
column.** Every figure in the table above is still correct as *hinges + drawers (+ extras)*, and
those are the columns each wave reconciles. What is no longer true is the last column's implied
identity: with 16 push fronts the shipped totals are `514_240` / `1_134_000` / `1_133_500` before the
extras and `574_240` / `1_194_000` / `1_193_500` after them, against ADR 0070's ~5 100 / ~10 020 /
~10 335. **The gap is the push column and only the push column**, it is made of drafted amounts, and
it is asserted as `16 × the book's declared rate` rather than pinned. 6T2's whole-total criterion is
restated the same way: `450_240 + 60_000 + 16 × perPushToOpen`, per tier.

**Two of the three reconcile to the leu**; Standard is 2.40 MDL above the ADR's 5 100, which is the
owner's own rounding of 74 × 17.60 = 1 302.40 to 1 300. **That gap is the evidence the derivation is
not fitted to the answer** — a rule chosen to hit 5 100 exactly would have needed a hinge rate the
ADR's range does not contain.

**What `450_240` is, and what it is not, is decision 15's question** — it is the seeded kitchen's
hardware **cost** at the Standard tier, and whether the *customer's* Standard line is that number or
zero is not settled by any record.

**These are sample amounts.** The book keeps `status: "estimate"` and `amountsProvisional: true`, and
every amount lives in the one file whose name says it is a sample.

### 7. The tier **names** change; the tier **ids** do not

The three `name` fields become `Standard`, `Hettich`, `Blum`, in the book's existing tier order, which
is the order the owner stated them in and also the seeded kitchen's price order. The three
`description` fields are redrafted, and **Standard's must say it has no soft-close** — ADR 0070
decision 3 calls that a functional difference the customer feels on every door, not a cheaper version
of the same mechanism.

**`tierId` and `ruleId` stay `hardware.standard` / `hardware.soft-close` / `hardware.premium`.**

- A tier id is **persisted** in `DesignSettings.hardwareTierId`. Changing one makes every stored
  design carrying it refuse with `UNKNOWN_TIER` and owes a migration, which
  [ADR 0072](0072-price-book-versioning-is-deferred-to-the-manufacturer-dashboard.md) places in the
  dashboard era, not in M6.
- The wave plan scopes this rename to **six strings**, and widening it to the ids is scope this
  record has no ruling to justify.
- The ids are opaque keys, not descriptions. **The book must say so where they are declared**, naming
  which supplier each id now denotes, so nobody reads `hardware.soft-close` as a claim about Hettich
  or about soft-close. The id rename is recorded below as owed to the dashboard wave, where books
  move to the database and a migration path exists.

The Romanian names and descriptions are **drafted here and marked *pending owner review*** in the
code, the precedent wave 6G set and the standing process ruled on 2026-09-04. The drafts deliberately
do **not** name product lines (*Sensys*, *Blumotion*, *Tandembox*): a description that names a
specific mechanism is a product claim the manufacturer would have to honour on every order.

### 8. The two rows 6S left open are resolved here, and neither is resolved by whichever line typechecks

**`wall-lift` — priced as an ordinary hinged leaf, at 2 hinges, and its lift mechanism is not priced
at all.** The catalogue already states the fact this turns on, in `catalog.ts`'s own words: *"A flap
opens upward on the band's own hinges: one leaf, not a drawer."* The hinges are real and the tier
prices them. The **lift arm** — an Aventos-class stay — is a vertical-opening mechanism, which
ADR 0070 decision 6 puts out of scope, and no amount for one exists. So the row is billed for what it
demonstrably has, and what it also has and nobody priced is recorded rather than invented. Its band
is `one-band-under-frame`, so it can never exceed 894 mm and never takes a third hinge.

**`base-bottle-cargo` — priced as one drawer, and the understatement is recorded in the book's own
data.** A full-height cargo pull-out costs more than a drawer box; the ADR publishes no cargo figure.
This is the **same accepted imprecision** ADR 0070 already ruled for Hettich's runners-only drawer
line — *"for Hettich use it as it is"* — applied to a second row, and it is recorded in the same
place: beside the number, in the sample book, not in a comment nobody reads.

Neither row appears in the seeded design, so ADR 0070's 74 hinges and 5 drawers are unaffected either
way — which is exactly why neither may be settled silently.

**Amendment C — this decision's own obligation is unmet in the shipped tree, and wave 6T-a closes
it.** The Hettich understatement is recorded where this decision requires, beside its rate
(`sample-price-book.ts:296-301`). Its twin is not: `cabinet.base-bottle-cargo`
(`sample-price-book.ts:100-103`) carries no comment at all, so the accepted imprecision exists only
in this record — which is the *"in a comment nobody reads"* outcome the sentence above rejects, one
step worse. One comment beside that rule closes it, in the twin's shape: a cargo pull-out costs more
than the one drawer box its hardware is billed as, ADR 0070 publishes no cargo figure, and a wave
that quietly prices one has overturned a decision.

### 9. A sink is a **declared catalogue fact**, held to the builders by a parity gate in both directions

Not a `kind`, not a build-id prefix, and not an equivalent-id comparison. `base-sink` declares
`kind: "base_cabinet"` like every other base body; the seeded row is `base-sink-800`; and a rule
written against one or two literal ids is the failure ADR 0068's population correction names —
*"pricing must key on the property, not on a list of ids"* — which has already caught one real defect
mid-flight in this milestone.

- **The declaration** sits beside `cabinetHandles` and `fronts`, named for them (`CARRIES_SINK` /
  `NO_SINK`), on `base-sink` and on the seeded `base-sink-800`.
- **The shape helpers default it to `NO_SINK`.** A default that is right for 37 of 38 rows is only
  safe because of the gate, so the gate is what this decision actually rests on.
- **The parity gate runs in both directions over every entry**: a row that declares a sink builds a
  `sink_faucet` group, and a row that builds one declares a sink. **A one-directional gate passes on
  the default and is not this gate** — it is the direction that catches a new sink row somebody
  forgot to declare, which is the whole reason the fact is declared rather than hard-coded.

### 10. The rack's host is the lowest wall-band **cabinet with a door** whose along-wall extent strictly overlaps the sink's, on the same wall

ADR 0070 decision 4 says *"the lowest wall-band cabinet whose along-wall extent overlaps the sink's
span"*. Four things it does not say, decided here:

- **Same wall.** An along-wall coordinate on wall B is a different place.
- **Normalised band, not raw.** `top` folds into `wall` through `normaliseBand` (ADR 0011 Gap C), and
  the top box over the seeded sink is a legitimate candidate — just not the lowest. **A predicate on
  the raw band reads identically on the seeded design and is wrong**, which is why decision 13's
  criteria require a fixture whose only overlapping body is a `top` row.
- **Strict overlap.** A positive-length intersection. Touching is not overlapping — measured above:
  `p12` (`open-shelf-600`) begins exactly where the sink ends, and counting it would tie it with
  `p11` at the same `y0`.
- **A host must declare at least one door leaf.** This narrows ADR 0070's word *"cabinet"* from *any
  wall-band body* to *a wall-band body with a door*, and the reason is physical: a drying rack hangs
  inside a closed cabinet, and `hood` and `open-shelf` are wall-band bodies with nowhere to hang it.
  It changes nothing on the seeded design (`p11` declares two leaves), which is why it is recorded as
  a reading of decision 4 rather than an amendment to it.

**Tie-break, because "lowest" is not by itself a function.** Two wall cabinets can sit at one `y0`
over one sink. In order: **lowest `y0Mm`; then the larger overlap length; then the projection's own
order** (wave 6A's single canonical ordering — never the placements array's order, which is
persistence order and reorders under editing).

**The rule is applied once per sink, never once per kitchen.** Owner-ruled 2026-09-04: two sinks means
two racks, and two covers, **even where both racks resolve to the same wall cabinet**. No
de-duplication.

The query is `findSinkAccessories(entries, catalog)` at
`packages/configurator-domain/src/queries/sink-accessories.ts`, taking the **projection**'s entries —
which already carry `wall`, `band`, `rawBand`, `alongMm`, `y0Mm` and `widthMm` — and answering one
record per sink placement, each with the host placement it resolved to or none.

### 11. The two extras are `accessory` lines: per sink, book-declared, untiered, and omitted rather than zeroed

`PriceLineKind` gains **`"accessory"`** and `price-lines.ts` gains an `AccessoryPriceLine` carrying
`accessoryId`, `name` and `description` — the same book-data-rendered shape a tier line has
(ADR 0062's third prohibition: never copy in a component that happens to agree with a number), and
**no `tierId`**, because an accessory has no tier.

- **The book gains an `accessories` section with two named rules**, not a list keyed by id:
  `sinkProtectiveCover` and `dishDryingRack`, each `{ ruleId, name, description, perUnitMinor }`. Two
  named fields rather than an array because the *rule* — when an accessory applies — is code, and an
  array invites a book to declare a third accessory nothing implements. A new accessory is a new
  shape, which is exactly where ADR 0062 draws its line.
- **`listRuleIds` must sweep them**, or two rules can share an id and a line becomes untraceable.
- **Quantity is a count of sinks**: the cover's is the number of sink bodies, the rack's is the
  number of sinks that resolved a host. **The line is emitted only when its quantity is at least
  one.** A kitchen with no sink has no cover line and no rack line — not a zero-amount line, which
  the breakdown renders *inclus* and which would tell a customer a rack they are not getting is
  included. 6B's rule holds in both directions and this is the direction it is usually stated in
  reverse: omission never means *included*, **and a zero never means *missing***.
- **Order in `lines`: placements, then hardware, then material, then accessories.** Appending keeps
  every shipped *"hardware then material"* assertion true, and `PricedDesign.lines`' doc comment is
  updated to say so.
- **The web breakdown's `isWholeKitchenLine` — today `line.kind !== "cabinet"` — becomes an explicit
  membership test**, and the category record gains an `accessory` word. **Leaving the negation in
  place compiles and renders `undefined · Uscător de vase`**, which is the specific trap this
  criterion exists for.
- **The rack is priced and never drawn.** No builder is touched, at any width or any depth. Asserted
  from the adapter side — the built body has no new part — and not by the absence of a diff.
- **The cover is never toggled.** No setting, no design field, no control. It is protection, not an
  option.

### 12. Finding — the default hardware tier stops being a floor, and this record does **not** weaken the refusal that says it must be

**The measurement.** Against the rates in decision 6, Hettich costs **+6 740 minor per hinge** and
**−1 400 minor per drawer** relative to Standard, because ADR 0070's Hettich drawer figure is runners
only while Standard's is a complete box — the imprecision the owner accepted explicitly. So Hettich
prices a kitchen **below** the default whenever `drawers > 4.81 × hinges`. The smallest witness is a
design consisting of **one `base-3drawer` and nothing else**: 3 drawers, 0 hinges, delta **−4 200
minor**. `exactDelta` throws `NegativeTierDeltaError`, and it throws on the settings surface — the
one control a customer with an unpriceable document has to recover with. Blum never inverts: it is
dearer than Standard on both axes.

**Two things break, not one.** The second is quieter: the milestone's PAL-as-both-defaults ruling
turns on *"De la"* being a **floor**. A drawer-dominant kitchen's default-tier total is no longer the
cheapest total the customer could reach, so the price bar's *De la* becomes a claim the book does not
support.

**Why this record does not simply degrade the refusal.**
[ADR 0091](0091-an-instruments-premise-is-re-quantified-and-the-product-claim-inside-it-becomes-a-wave.md)
decision 1 supplies the test, and it is applied here rather than argued around. The refusal has two
halves and Q1 is asked of each:

- **The product half — what a customer sees when a tier prices below the default.** Delete it: a
  customer-visible fact changes. **It is an invariant, ADR 0091 decision 1 grants no licence, and
  ADR 0090 decision 7 binds.** It is not weakened here. It is promoted to a finding, an owner input,
  and wave **6W**.
- **The instrument half — `whole-kitchen-tiers.test.ts`'s claim that the sample book keeps the
  negative delta unreachable.** Delete it: no customer-visible fact changes; what changes is the
  credibility of a measurement. **Q2 passes** — the falsifying fact is ADR 0070's own owner-ruled
  Hettich figure, dated 2026-09-04, *before* the wave that trips over it, and *"for Hettich use it as
  it is"* means no permitted product state satisfies the premise. **Q3 is mandatory and all three
  limbs are required**: assert the surviving truth over a narrower quantifier **derived from the
  book's own rates** (the inversion needs `drawers > 4.81 × hinges`, computed from the declared rates
  rather than restated beside them); assert the **negation positively by measurement** (the
  one-`base-3drawer` witness, pinned as a *passing* test, so the day the book stops producing it the
  test goes red and the question re-opens deliberately); and **carry the obligation forward as a named
  wave**, which is 6W and not a comment.

**Amendment C — the quantifier has a third term, and the witness survives.** *"Hettich prices below
Standard whenever `drawers > 4.81 × hinges`"* was derived at zero push mechanisms. Hettich's drafted
push rate is 8 000 minor **above** Standard's, so a latch pushes Hettich *up* and the true condition
is `1_400 × drawers > 6_740 × hinges + 8_000 × push`, i.e. **`drawers > 4.81 × hinges + 5.71 ×
push`**. A criterion restating the two-term form is now false in general. **The witness is
unaffected**: one `base-3drawer` stands at `y0` 0 with no recorded mode, so it carries 3 drawers, 0
hinges and **0** push fronts, and the delta is still exactly −4 200 minor. Both coefficients are
derived from the book's declared rates and never restated beside them, so the derivation survives the
owner replacing the drafted push figures — the *value* 5.71 does not, and that is why it is computed
rather than written into a test.

**6T does not reach `main` alone.** The precedent is ADR 0090 decision 7, and the situation is the
same shape: a customer-reachable break behind a wave that is otherwise correct. 6T and 6W land on one
branch and reach `main` together when `pnpm ci:local` is green. **6T-a rides with them** — it repairs
6T's own quantity basis and cannot sensibly reach `main` ahead of or behind it. **6T2 is independent
and may land separately.**

**What 6W must decide is an owner question, not an implementer's.** The recommendation on record —
clearly a recommendation — is that a tier pricing **below its group's default** is offered **with no
delta badge**, reusing the module's existing *"the deltas degrade; the choice does not"* path, while
the **material** group keeps throwing, because a material tier is one flat per-kitchen amount whose
ordering is a property of the book alone and therefore still a genuine book fault. The alternative
the owner may prefer is to show the reduction as a negative figure, which the mockups' *de la +9 000*
badge has no form for and which is a copy and design question. **Both leave the *De la* floor
question open, and 6W owns that too.**

### 13. The work is three waves, and the cut is measured rather than guessed

The milestone's split trigger says the cut is between the mechanism basis and the sink extras. **The
split is taken in advance**, because the file count is now measured rather than estimated: the extras
need a catalogue declaration, a parity gate, a locating query, a new line kind and a UI copy word —
more than *"two flat amounts and one locating query"*.

- **6T — the mechanism basis.** Four production files.
- **6T2 — the two sink extras, end to end.** Nine small production edits, which **exceeds WORKFLOW's
  five-file guidance**, stated here rather than discovered in review. It is not split again because
  the declaration's independent check is the **builder parity gate**, not the price, so separating
  the declaration from its consumer buys none of the ADR 0028 benefit that justified splitting 6S
  from 6T. **If the coordinator prefers a smaller diff, the cut that costs least is
  [declaration + query] / [lines + copy]**, in that order.
- **6W — the below-default tier.** Opened by decision 12, gated on 6T, on the same branch.

**Amendment C adds a fourth: 6T-a — one push-to-open predicate.** Opened by Amendment C's correction
of decision 3. Gate: 6T, whose quantity basis it repairs; **same branch as 6T and 6W**. Its full plan
is written directly into `docs/milestones/done/M6-price-and-global-settings.md` rather than pasted from
here, because the coordinator's copy is the one a dispatch reads and this amendment landed after 6T's
section was already pasted. **It is not a fourth parallel wave**: it edits
`hardware-mechanisms.ts` and `sample-price-book.ts`, so the no-parallel rule below covers it too.

**6T and 6T2 must not be dispatched into the same tree at once**, and neither may run beside 6P or
6T-a: all four edit `price-book.ts` and `sample-price-book.ts`.

### 14. What does not change

- **`cabinetHandleCount` and its parity gate survive**, deliberately, with no production reader.
  Deleting them because pricing stopped calling them removes the only thing holding the handle
  declarations to the builders (ADR 0061), and the total that 6S's split must reproduce.
- **No handle is priced anywhere** (owner, 2026-09-04: handles are bought by the client). The
  per-cabinet handle control stays, because `handle: "push"` still means a mechanism.
- **No geometry, no builder, no mesh.** 6T and 6T2 touch `packages/three-adapter` only in a test.
- **No schema change, no `CURRENT_SCHEMA_VERSION` bump, no migration.** No persisted field is added
  and no tier id moves (decision 7).
- **ADR 0062 binds unchanged**: shapes are code, coefficients are data; the query imports no book; no
  amount, tier, delta or rule exists outside the book.
- **ADR 0072 is untouched** — no `pricingVersion` field, no recalculation, no retention.
- **The dashboard is shaped for, not built for.** Decision 4's mechanism query and decision 9's
  declared sink fact are both readable without importing pricing, and decision 11's book section is a
  place amounts are edited. **No dashboard code, no scope, no field.**
- **Bi-fold vertical-opening mechanisms stay out of scope** (ADR 0070 decision 6).

### 15. Amendment B, 2026-09-06 — the default hardware tier stops costing nothing, and whether it should is an **owner input**

**The question, which this record moved without asking.** Under decision 6 the Standard tier prices
the seeded kitchen's hardware at `450_240` minor (4 502.40 MDL). The shipped book prices it at
**zero** (`perCabinetHandleMinor: 0`) and says so to the customer in two places: the tier's own
description, *"Balamale și glisiere standard, **incluse în preț**"*, and the sample book's doc
comment, *"Both default tiers cost nothing, so an unconfigured kitchen carries two lines at zero."*
So decision 6 does not only change a rate — it answers a product question nobody asked: **does the
quoted cabinet price include standard hardware, or is hardware billed on top of it?**

**Swept, and not settled by anything.**

- **ADR 0070 leans toward billing it, and stops short of ruling it.** Its totals table prices DTC
  Standard's hardware at ~5 100 MDL rather than at 0, which is the only figure on record for what a
  Standard tier costs. But that table exists to justify *pricing the whole design at each tier*
  against a flat per-tier figure — it is a **cost** comparison, and a manufacturer knows their
  hardware cost at each tier however the customer's quote is structured.
- **ADR 0070 decision 5 points the other way about the amounts themselves**: *"Prices are retail…
  margin sits on top of them and is not part of this record."* A shelf price is what the manufacturer
  pays, not what the customer is charged, so no amount in this book is yet a customer price under
  either model.
- **The M6 ruling on defaults settles a different question.** *PAL stays the default for both the
  priced baseline and the delta basis* fixes **which** tier is the default and what deltas are
  measured from; it says nothing about whether a default tier's amount is zero.
- **The zero is a convention, not a decision.** It appears in book data and one doc comment, and no
  dated record ever ruled it.

**So it is an owner input, and it is recorded as one** (open input 6 below), with the number
attached. It changes what every unconfigured kitchen costs and what *"incluse în preț"* means, which
is a statement about the manufacturer's price list rather than about this repository's structure.

**The interim, so no wave stalls: 6T ships the absolute model — the Standard line costs what its
mechanisms cost.** Four reasons, in the order they bind:

1. **The delta model does not merely change a number; it makes a drawer-dominant kitchen
   unpriceable.** Under it the hardware line is `tierCost − defaultCost`, which for Hettich on the
   one-`base-3drawer` design of decision 12 is **−4 200** — and `refuseNegativeAmount`
   (`price-design.ts:712`) refuses a negative line with `INVALID_AMOUNT`, so **`priceDesign` fails
   whole and the price bar renders no figure at all**. That is strictly worse than 6W's missing
   badge: it moves the breakage from a settings chip into the price itself.
2. **It weakens 6T's own falsification of the defect the wave exists to remove.** *"A push-to-open
   cabinet's hardware is not zero"* could then only be asserted away from the default tier, because
   the default tier's line is zero for every design by construction.
3. **ADR 0070's table is the only figure on record**, and it says 5 100, not 0.
4. **The accessories are absolute by ADR 0070 decision 4** — always present, ≈200 and ≈400 MDL — so a
   delta-shaped hardware line beside absolute accessory lines is two conventions in one book section.

**The interim is cheap to reverse, and that is why it is defensible rather than merely convenient.**
The coefficients are identical under both models — they stay ADR 0070's retail rates either way — so
reversing is a **shape** change in one function (*the hardware line prices the difference from the
default tier*), not a re-derivation. **And every delta is identical under both models**, since a
delta is a difference and the baseline cancels: Hettich `+491_760`, Blum `+523_260` on the seeded
kitchen. **So wave 6W's question is untouched by whichever way the owner rules**, and neither blocks
the other.

**What 6T must not do is leave the book asserting the opposite of its own numbers.** In the same
wave: the Standard tier's description stops saying *incluse în preț*, and the sample book's doc
comment stops saying both default tiers cost nothing — the **material** default still does, the
hardware default no longer does, and a comment that flattens the two hides exactly the asymmetry the
owner is being asked about.

### 16. Amendment C, 2026-09-06 — a refusal code names a cause, so the pricing catch stops relabelling everything

`refuseUnreadableFronts` (`price-design.ts:645-658`) wraps `countHardwareMechanisms` in a bare
`catch (error)` and labels **anything** thrown `UNDECLARED_FRONT_POPULATION`. It fails closed and the
thrown message survives into the refusal's detail, so nothing a customer sees is wrong today — but
two different causes and one genuine bug all arrive under one code:

- **`UndeclaredFrontPopulationError`** — the case the code is named for.
- **`UnbuildableDoorBandError`** (`front-population.ts:577`) — a *different* condition, and a
  reachable one: a placement whose frame height leaves no band a door could be hung in. Its own
  comment says it exists because *"a silently wrong number is worse than a refusal"*, and labelling
  it as a missing declaration sends whoever reads the code to the catalogue's declarations for a
  fault that is in the placement's height.
- **A `TypeError`** — a defect in this repository, reported to a customer as a data condition.

**The ruling.** The catch narrows to the two declared domain errors — `UndeclaredFrontPopulationError`
keeps `UNDECLARED_FRONT_POPULATION`, `UnbuildableDoorBandError` takes a new code naming the band —
and **anything else propagates unchanged**. This is [ADR 0069](0069-past-the-wall-is-one-code-family-and-severity-is-declared-per-code.md)'s
rule applied where it was not: a code family is declared per cause, and a code that means *"or
anything else"* is not a declared cause. **A third code for "something unexpected" is refused**: it
is the same relabelling wearing an honest name.

**The precedent for throwing into render is this repository's own.** `projectDesignForDisplay`
already throws `UnknownBodyError` out of a query that runs in render, on the stated ground that *"a
list that silently omits a body the customer owns is worse than one that refuses to render"*, and
`apps/web/src` carries no error boundary today. So the change is not a new hazard class; it is the
same stance, and the narrowed catch is what asserts that the only errors this path can produce are
the two named ones. **Adding an error boundary is not this wave's work** and is not smuggled into it.

## Alternatives considered

| Alternative | Why it is refused |
| --- | --- |
| **Multiply the drawer rate by two**, following ADR 0070 decision 1's *"2 mechanisms per drawer"* literally. | Doubles the drawer line and contradicts the owner's own totals table — 5 drawers at 640 reaching 3 200 — which is the arithmetic decision 1's wording is a description of. |
| **Three hardware lines, one per mechanism.** | The breakdown labels a whole-kitchen row `category · tier name`, so all three render as *Feronerie · Blum*; distinguishing them needs three unruled Romanian strings for a distinction the customer never asked for. |
| **Publish the mechanism counts as fields on the hardware line.** | A published field with no production reader — the shape ADR 0072 finding 2 refused twice in this milestone. The domain query has a caller from the day it lands. |
| **Rename the tier ids to `hardware.hettich` / `hardware.blum`.** | Tier ids are persisted in `DesignSettings`; renaming orphans stored designs into `UNKNOWN_TIER` and owes a migration ADR 0072 places in the dashboard era. The wave plan scopes the rename to six strings, and nothing here justifies widening it. |
| **Take the DTC concealed-runner figure (305–465) for Standard's drawer rate**, which would keep Standard cheapest on both axes and dissolve decision 12 entirely. | It contradicts the owner's own totals table, which bills DTC drawers at 640 — the complete box. Choosing a cheaper row *because it makes an invariant hold* is fitting the data to the test. |
| **Raise Hettich's drawer figure to a complete-box comparable.** | Overturns ADR 0070's explicit ruling, *"for Hettich use it as it is"*, which that record already recorded as accepted rather than an oversight. |
| **Degrade `NegativeTierDeltaError` inside 6T so the settings sheet stops crashing.** | Fails ADR 0091 decision 1's Q1: the refusal's product half is customer-visible, so it is an invariant, and ADR 0090 decision 7 binds — *an invariant edited to accommodate a defect is the defect laundered*. It is promoted to wave 6W instead. |
| **Ship 6T and leave the crash to a later wave in the queue.** | It is reachable from a one-body design and it breaks the one control a customer with an unpriceable document has to recover with. Hence the same-branch rule, which is ADR 0090 decision 7's own remedy. |

**Added by Amendment C, 2026-09-06:**

| Alternative | Why it is refused |
| --- | --- |
| **Leave pricing on the recorded mode and add `isPushOpenByDefault` to it** — count a latch where the mode is `push` **or** the slot is the top row. | Closes direction A and leaves direction B open: a recorded `push` on a `canHandle: false` body still bills latches for fronts whose bars the scene keeps. Two predicates that agree more often are still two predicates, and the next divergence is not announced. |
| **Publish `canHandle` on `DisplayEntry` so the projection answers the whole question.** | A published field with no reader outside one query — the shape ADR 0072 finding 2 refused twice in this milestone. The counting query already holds the definition it needs; the projection is not the place the flag is missing from. |
| **Treat `canHandle: false` as "no handle, therefore a latch on every front".** | Measured false in the catalogue: the corner returns declare `canHandle: false` beside `carriesHandles(1)` and a leaf, so the bar exists and, below the top row, is visible. It would bill a latch for a front the customer grips by its handle. |
| **Treat `canHandle: false` as "no mechanism at all, the body is structural".** | It would bill `wall-corner-return-570-top` nothing for a front whose bar the scene hides and whose mode the customer cannot change — the same zero the wave exists to remove, on a smaller population. The flag governs a control; it has never governed hardware. |
| **Block 6T until the owner supplies the three push rates.** | The owner ordered counting in the same message that named the gap, and the branch already carries 6W. Blocking trades a stated placeholder for a stalled wave. The rates ship drafted, marked, and load-bearing on the pending list — with no expectation pinned to their magnitudes. |
| **Pin the seeded push amount as a literal so the reconciliation table stays whole.** | It makes a placeholder load-bearing in exactly the way decision 3 forbids: replacing a drafted rate with a measured one would then be a test edit, and a test edit is where a supplier figure gets fitted to an expectation. Assert `count × the book's own rate` instead. |
| **Give the unexpected error its own "internal" refusal code** rather than letting it propagate. | A code that means *"or anything else"* is the relabelling this record is fixing, renamed. ADR 0069 declares severity per cause, and "unknown cause" is not one. |
| **Identify the sink through `pricedAsBuildId === "base-sink"`**, which the wave plan does permit. | Two sink rows already exist and a third would silently lose its cover; it is the id-list rule ADR 0068's population correction names, and it cannot be parity-gated against the builder. The declared fact costs one field, one default and one gate. |
| **De-duplicate racks where two sinks resolve to one cabinet.** | Owner-ruled against, 2026-09-04, explicitly and against the recommendation then on record. |
| **Emit a zero-amount rack line where no wall cabinet sits above the sink.** | A zero renders *inclus*. It would tell a customer a rack they are not getting is included. |
| **Draft the push-to-open rates as zero, since no figure exists.** | Reinstates the exact defect 6T exists to remove — a push-to-open kitchen billing its mechanisms at nothing — while looking implemented. |
| **Keep the default hardware tier at zero by pricing the hardware line as a difference from it** (decision 15's other model), as the interim rather than as an owner question. | `refuseNegativeAmount` refuses a negative line, so a drawer-dominant kitchen would stop pricing altogether and the price bar would render nothing — worse than the missing badge 6W is for. It also confines 6T's *"a push-to-open cabinet's hardware is not zero"* check to non-default tiers. Recorded as the owner's choice with the reversal cost measured, not taken silently in either direction. |
| **Keep 6T's `510_240` reconciliation and move the sink extras back into 6T** so the figure is producible. | Undoes decision 13's split, which was measured rather than guessed, to fix a presentation defect in a table. ADR 0070's own table is columnar, so the split reconciliation costs no check. |
| **Add a fourth mechanism kind for the lift arm and the cargo pull-out.** | No amount exists for either, ADR 0070 decision 6 puts vertical-opening mechanisms out of scope, and inventing two supplier figures to fill a shape is what decision 8 refuses. |

## Records swept before deciding, and how each is settled

| Record | What it says | How it is settled |
| --- | --- | --- |
| [0070](0070-hardware-is-priced-per-mechanism-not-per-handle.md) | Hardware prices three mechanisms; two sink extras; three tiers; Hettich's drawer figure stays understated; bi-fold out of scope | **The record this one implements.** Decision 2 reconciles its two internal readings against its own totals; decision 6 derives its ranges; decision 8 applies its Hettich precedent to a second row; nothing in it is overturned. |
| [0068](0068-price-steps-at-the-door-count-and-follows-height.md) decision 2 | Height affects price where a body builds to its opening | **Survives untouched, and decision 5 says why it does not collide with the owner's 2026-09-05 width ruling**: it is a carcass term, not a mechanism count. |
| [0068](0068-price-steps-at-the-door-count-and-follows-height.md), population correction | Price on the property, never on a list of build ids | **Applied in decision 9.** It is the direct precedent for declaring the sink rather than naming `base-sink`. |
| [0062](0062-a-manufacturer-price-dashboard-comes-after-m8-and-shapes-seams-now.md) | The query imports no book; shapes are code and coefficients are data; a tier's words are book data | **Honoured throughout.** Decision 11's two named accessory rules are the shape-versus-coefficient line drawn deliberately; decision 14 re-asserts the rest. The dashboard is shaped for and nothing is built for it. |
| [0072](0072-price-book-versioning-is-deferred-to-the-manufacturer-dashboard.md) | M6 adds no version, field or migration; a book edit today is a developer's, migrated in the same commit | **The reason decision 7 keeps the tier ids.** Its finding 2 — a field with no production reader is a slot, not a seam — is why decision 4 publishes a query instead of a line field. |
| [0061](0061-a-cabinet-handle-is-declared-and-an-appliance-bar-is-not-one.md) decisions 2 and 4 | A cabinet handle is declared, not counted from meshes; an undeclared count is a programming error, never a zero | **Both applied.** Decision 1's `UNDECLARED_FRONT_POPULATION` is decision 4's rule one declaration over; decision 14 keeps the handle count and its gate alive with no production reader. |
| [0028](0028-wall-depth-is-derived-from-the-worktop.md) | Declare, do not compute; two numbers agreeing by luck is the failure | **Applied twice.** It is why the sink fact is gated in both directions, and why 6T's 74-hinge check counts as evidence at all — the number is the owner's, derived before the declarations existed. |
| [0022](0022-seeded-entries-declare-their-catalogue-equivalent.md) / [0029](0029-a-two-door-cabinet-may-not-be-offered-at-one-door-widths.md) | A price rule resolves through the catalogue equivalent | **Deliberately not used for mechanisms.** Decision 1 reads the placement's own entry, which is the split `countCabinetHandles` already makes and which `describePricedBody` deliberately does not. |
| [0021](0021-corner-returns-are-structural-in-data.md) / [0025](0025-the-corner-base-legs-seat-on-the-l-joint.md) + ADR 0070 decision 2 | A corner carries one handle per level, never one per opening | **Consistent and unchanged.** With handles out of pricing, decision 2's pricing effect now runs through the corner rows' declared front population, which 6S already holds to the builders. No corner declaration moves. |
| [0011](0011-m3-insert-contract-gaps.md) Gap C | `top` normalises to `wall` | **Load-bearing in decision 10**, and the reason its criteria demand a `top`-only fixture: the wrong predicate agrees with the right one on the seeded design. |
| [0063](0063-a-group-is-listed-row-major-height-before-position.md) / wave 6A | One canonical projection; nothing keeps a sort of its own | **Decision 10's final tie-break**, and the input to both new queries. |
| [0090](0090-a-frozen-space-slides-with-its-run-and-follows-the-body-it-recorded.md) decision 7 | An invariant edited to accommodate a defect is the defect laundered; a break behind a red gate does not reach `main` alone | **Binds decision 12 on both counts.** The refusal's product half is not weakened, and 6T rides with 6W. |
| [0091](0091-an-instruments-premise-is-re-quantified-and-the-product-claim-inside-it-becomes-a-wave.md) decision 1 | Three questions decide when an instrument premise may be re-quantified; the product half is never weakened, only promoted | **Applied literally in decision 12**, including the corollary that separates the two halves and all three of Q3's limbs. |
| [0057](0057-a-material-change-resets-an-unavailable-finish.md) / [0071](0071-material-carries-price-colour-carries-a-different-control-per-material.md) | Material, finish and colour rules | **Not engaged.** No offer, finish or material tier changes here. |
| `docs/best-practices/product-invariants.md` | Geometry, dimensions and visual behaviour keep their stated structural dependencies | **Honoured.** No builder is touched; the rack has no mesh by decision, and decision 11 requires that asserted from the adapter side. |
| M6 plan, *Open questions gating this phase* | PAL is the default for both the priced baseline and the delta basis, so `NegativeTierDeltaError` stays a book-fault detector | **Half of it is now false for the hardware group, and decision 12 says so rather than quietly re-reading it.** The material group's reasoning is untouched. |

## Consequences

- **Wave 6T's design is fully specified**: three rates, three counts, one line, one new failure code,
  and a rename of six strings with the ids held still.
- **The seeded kitchen's total moves in ~~two~~ three steps, one per wave**: `+450_240` minor at
  **6T**, as the hardware line goes from `0` to what its hinges and drawers cost; **`+64_000` /
  `+192_000` / `+160_000` at 6T-a** for the 16 latches the corrected predicate finds, which is the
  first movement that differs per tier (Amendment C); and a further `+60_000` at **6T2** for the two
  accessory lines. Every shipped assertion pinning the seeded total, the hardware quantity or a
  hardware delta changes, and each wave names the ones it edits.
- **The 6T half of that movement is provisional in a way the rest of this record is not.** It is the
  absolute model decision 15 ships as an interim, and the owner may rule it back to zero — a
  one-function change with the same coefficients and the same deltas.
- **A push-to-open kitchen stops billing its hardware at zero**, which is the defect 6T exists to
  remove. **Amendment C: 6T as first implemented removed it only for a *recorded* mode, so the
  shipped demo's own 16 top-row latches were still billed at zero. 6T-a is what actually closes it**,
  and the seeded totals move a second time — `+64_000` / `+192_000` / `+160_000` minor at Standard /
  Hettich / Blum, at the drafted rates.
- ~~**Three unmeasured amounts enter the sample book** — the push-to-open rates — and are the only
  amounts in it with no supplier source. No reconciled total depends on them.~~
  **Amendment C: every reconciled total now depends on them.** They are still the only amounts in the
  book with no supplier source, and they now decide the demo's hardware line at all three tiers and
  which tier the customer sees as dearest. They are asserted as `count × the book's own rate` so that
  no expectation moves when the owner supplies figures, but the *numbers a customer reads* are
  drafted, and that is the state the wave ships in with the owner's ruling on record.
- **A live product finding is on record and owned.** From the moment 6T's amounts land, a
  drawer-dominant kitchen — a single three-drawer base is enough — throws
  `NegativeTierDeltaError` on the settings surface, and the price bar's *De la* stops being a floor
  for that kitchen. It is wave 6W's, it does not corrupt a document, and 6T does not reach `main`
  without it.
- **`cabinetHandleCount` becomes production-dead and stays**, deliberately, as the declared side of
  the handle meshes.
- **Two catalogue rows are now priced with a stated understatement** — Hettich's drawers and the
  bottle cargo's pull-out — both recorded beside the numbers rather than in prose.
- **The manufacturer price dashboard gains two seams and no code**: a mechanism count readable
  without pricing, and an accessories section in the book. Nothing is built for it.
- **The tier ids now disagree with the tier names**, deliberately and with the disagreement written
  down. Renaming them is recorded as owed to the dashboard wave.

## Open owner inputs — recorded, not invented at the wave

None blocks dispatch. Each ships as a drafted recommendation marked *pending owner review* in the
code, the standing process ruled on 2026-09-04.

1. **The three push-to-open rates — now load-bearing, and the first thing this list wants
   (Amendment C).** No figure exists in ADR 0070 or anywhere else. Drafted at 40 / 120 / 100 MDL,
   ordered by each tier's hinge rate. **When this record was written nothing depended on them; the
   owner's 2026-09-06 ruling and the corrected predicate mean everything priced does.** The two
   measured consequences on the shipped demo, both produced by the placeholders alone: the hardware
   line rises by **640 / 1 920 / 1 600 MDL** at Standard / Hettich / Blum, and at 16 latches
   **Hettich (11 340 MDL) overtakes Blum (11 335)** — an ordering ADR 0070's own totals table
   contradicts, and the most expensive tier a customer sees. Nothing refuses and no document is
   corrupted; the figures are simply not evidence of anything. **This is no longer a placeholder that
   can wait.**

   **Updated 2026-09-07, at 6T-a's close-out: the rates have shipped in that state.** They stand at
   40 / 120 / 100 MDL on branch `wave/6t-finish`, drafted and marked, and both measured consequences
   above are now what the demo actually prices. No expectation is pinned to their magnitudes —
   assertions compute `count × the book's own rate` — so the owner's figures move the book and move
   no test. **What the owner's answer changes is a customer-visible total and which tier reads as
   dearest**, not a diff's size.
2. **The three tier descriptions**, and Standard's in particular, which must state that it has no
   soft-close. The drafts avoid naming product lines; the owner may prefer that they name them.
3. **The two accessory names and descriptions, and the breakdown's category word for them.**
4. **Wave 6W's question — what a customer sees when a tier prices below the default**, and whether
   the price bar's *De la* claim needs anything said about it. Recommendation in decision 12; the
   alternative is a negative badge the mockups have no form for.

   **Updated 2026-09-07, at 6W's close-out. The wave shipped and this input did not close.** 6W
   implemented decision 12's recommendation — a below-default **hardware** tier is offered with no
   delta badge, the **material** refusal intact — so the crash is gone. What remains open is the
   *De la* half of the same criterion, and it is recorded as an interim rather than as a ruling:

   - **The claim was left true, not qualified**, under an **architect's interim marked pending owner
     review**. **The owner has not ruled**, so 6W's criterion *"which of the two was chosen is
     recorded with the owner's words"* is met in code and **not** in the record. The interim's
     reasoning: the disclaimer scopes the figure to **this kitchen, pre-measurement**, rather than
     claiming a floor across tiers, and the figure **re-derives when a tier is chosen**.
   - **What constrains the answer, found by 6W's logic review**: `exactDelta` **discards the
     magnitude** of a below-default difference — it answers *that* the delta degraded, not by how
     much. **So any owner copy naming how much cheaper a tier is needs domain re-plumbing, not a
     string change.** A copy ruling taken as a wording edit has under-scoped its own wave.
   - **A second copy call, on the same surface.** With a below-default tier the settings sheet reads
     `inclus` / *(blank)* / `de la +…` down the three rows, and **a blank between two figures reads
     as "price unavailable" rather than "cheaper"**. Nothing refuses and no document is corrupted;
     it is the owner's copy call and it travels with this input.
5. **Whether a cargo pull-out and a lift arm should ever be priced.** Recorded by decision 8 as
   knowingly unpriced. Either needs a measured amount from the owner.
6. **Does the quoted cabinet price include standard hardware, or is hardware billed on top?**
   (decision 15, Amendment B.) **The number attached: the seeded kitchen's Standard hardware line
   becomes `450_240` minor — 4 502.40 MDL — where it is `0` today, and the tier description says
   *incluse în preț*.** (Amendment C: **`514_240` — 5 142.40 MDL — once 6T-a lands**, the difference
   being 16 latches at a drafted rate. The question is unchanged and so is its answer's cost; only
   the figure attached to it moves.) The interim is the absolute model; the alternative is a line priced as the
   difference from the default tier, which costs one function to switch to, changes no coefficient
   and changes no delta. **This one is unlike the other five**: it is not a placeholder awaiting a
   figure, it is a live customer-visible baseline shipping under an architect's interim, and it wants
   the owner's answer sooner than the rest.
7. **Added 2026-09-07 at 6T2's close-out — does an out-of-bounds sink still bill its rack?** **A gap
   in decision 10's contract, not a defect against it.** Decision 10 decides which body hosts the
   rack; it says nothing about a sink that is itself out of bounds, and the two readings differ by
   **40 000 minor per sink** in what the customer is quoted. Nothing refuses and no document is
   corrupted, which is why 6T2 shipped without it. **Unresolved**, and it outlives M6's wave table.
   Item 3 above — the two drafted accessory names and the breakdown's category word for them —
   travels with it: both are answers about the same two lines.

---

## To be pasted into `docs/milestones/done/M6-price-and-global-settings.md`

**Written here because the coordinator holds that file.** The first block replaces wave 6T's
existing section; the second and third are new sections after it; the fourth is the wave-table rows.

### Wave 6T — hardware priced per mechanism

**[ADR 0070](../decisions/0070-hardware-is-priced-per-mechanism-not-per-handle.md), planned by
[ADR 0092](../decisions/0092-hardware-prices-three-mechanisms-and-a-sink-carries-two-extras.md).**
Gate: 6S for the declarations, 6B2 for the shape registry. **The two sink extras have moved to 6T2**
— ADR 0092 decision 13 takes the plan's own split trigger in advance, on a measured file count.
**Carries one open owner input and does not stall on it**: whether the default hardware tier still
costs the customer nothing (ADR 0092 decision 15, which ships an interim and states its reversal
cost).

**Goal.** Replace `HardwareTier.perCabinetHandleMinor` with three per-mechanism rates and a
mechanism count read from 6S's declarations. Quantity basis, tier data and the query's read of it
move together.

**Touches.** `packages/configurator-domain/src/pricing/price-book.ts`, `pricing/price-design.ts`,
`pricing/sample-price-book.ts`, a new `src/hardware-mechanisms.ts`, `src/index.ts`. Tests:
`apps/web/tests/settings/global-settings.adversarial.test.ts` (its independently counted **handle**
population must become a **mechanism** count, or it asserts the superseded basis as correct),
`apps/web/tests/price/starting-price.adversarial.test.ts`,
`apps/web/tests/settings/whole-kitchen-tiers.test.ts`,
`packages/configurator-domain/tests/pricing/*` and `tests/front-population.test.ts`'s tier totals.

**Acceptance criteria.**

- **Three rates, three counts.** 2 hinges per door leaf and **3 where that leaf is taller than
  900 mm**; one drawer rate per **drawer** — *not* per runner (ADR 0092 decision 2: multiplying by
  two doubles the line and contradicts ADR 0070's totals); 1 push-to-open per door leaf and per
  drawer, **only** where the placement declares `handle: "push"`.
- **900 mm is a boundary asserted as one**: a 900 mm leaf takes 2 hinges, a 901 mm leaf takes 3.
- **The threshold is applied to leaves, never to bands.** A pantry at 600 mm answers
  `[1290, 1290, 790, 790]`; applying the threshold to the two *bands* answers 45 hinges on the seeded
  kitchen against the correct 74, and both numbers look plausible.
- **The counts come from the placement's own catalogue entry**, through `frontPopulationQueryFor`.
  A test mutates a placement's `heightMm` on a row with **declared** band heights (the pantry, 2200 →
  2600) and the hinge count does not move — the wave reads no frame height and no nominal.
- **No leaf over 900 mm can come from a `one-band-under-frame` row**, asserted as a property over
  every catalogue entry at every legal size: the only leaves over 900 mm in the catalogue are the
  pantry's 1290s and the fridge housing's 1350. This is what makes the owner's *no height rule*
  ruling and the 900 mm threshold consistent rather than merely coexisting.
- **The seeded kitchen counts 74 hinges, 5 drawers and ~~0~~ 16 push mechanisms** (Amendment C).
  ADR 0070's hinge and drawer figures are the owner's, derived before the declarations existed —
  **an independent derivation, which is the only reason the check means anything. If the two disagree
  the declaration is wrong and the wave stops**; it does not adjust the expected number to whatever
  the code produces. **The 16 is not ADR 0070's** — that record published no push row — and it is
  derived independently too: `p15`–`p23` are nine top-row placements carrying 16 leaves and no
  drawers.
- ~~**A push-to-open cabinet's hardware is not zero**, asserted on a design where every placement
  carries `handle: "push"`, pinned from the failing side.~~ **Superseded by 6T-a**: stamping
  `handle: "push"` onto *every* placement stamps it onto bodies whose definition refuses a mode, so
  the fixture demonstrates the wrong direction of the defect. 6T-a replaces it with three witnesses;
  see that wave's criteria.
- **The hardware line stays one line, `quantity: 1`**, its unit amount the whole kitchen's hardware
  at that tier, and `amountMinor === quantity × unitAmountMinor` still holds.
- **Each of the three rates refuses on its own.** Set to `null`, to `1.5` and to a string
  independently, each produces `INVALID_AMOUNT` **naming that field** — never a zero line and never a
  total silently short.
- **A body whose front population cannot be read fails the design whole**, with the new
  `UNDECLARED_FRONT_POPULATION` code naming the placement and the build id. **A missing declaration
  is never read as zero mechanisms**, and there is no partial line set and no partial total.
- **`wall-lift` prices 2 hinges and its lift arm prices nothing**; **`base-bottle-cargo` prices one
  drawer**, with the understatement recorded beside the number (ADR 0092 decision 8). Neither is
  resolved by whichever tier line happens to typecheck.
- **The sample amounts are ADR 0092 decision 6's table, and 6T reconciles to the hardware-only
  column**: `450_240` / `942_000` / `973_500` minor at Standard / Hettich / Blum, against ADR 0070's
  own **hinge and drawer columns** — 1 300 + 3 200, 6 290 + 3 130, 5 550 + 4 185. Hettich and Blum to
  the leu; Standard 2.40 MDL above, which is the owner's rounding of 1 302.40 to 1 300. **The
  `510_240` / `1_002_000` / `1_033_500` totals include 6T2's sink extras and are 6T2's check, not
  this wave's** — ADR 0092 Amendment A; a 6T criterion naming them is one 6T fails by construction.
  **Amendment C: `450_240` / `942_000` / `973_500` remain the hinge-and-drawer figures and remain
  what reconciles against ADR 0070. They stop being the whole hardware line once 6T-a lands** — the
  line is those figures plus `16 × the tier's declared push rate` — so a criterion asserting the
  hardware **line** equals `450_240` is one 6T-a must restate, not extend.
- **The Standard tier's hardware line stops being zero, and nothing in the book keeps claiming
  otherwise.** The seeded default line goes from `0` to `450_240`, and to `514_240` once 6T-a's
  latches are counted (Amendment C). In the same wave the tier's
  description stops saying *incluse în preț* and the sample book's doc comment stops saying both
  default tiers cost nothing — the **material** default still does and the hardware default no longer
  does. **This is ADR 0092 decision 15's interim, not a settled rule**: it ships as the absolute
  model, it is open owner input 6, and reversing it is one function with the same coefficients and
  the same deltas. A wave that moves the baseline and leaves the description contradicting it has
  shipped the half that is visible to a customer and hidden the half that explains it.
- **Hettich's drawer figure stays understated** — runners only against complete boxes. A wave that
  quietly makes the three comparable has overturned a decision.
- **The tier names become `Standard` / `Hettich` / `Blum` and the tier ids do not move.** Standard's
  description says it has **no soft-close**. Six strings; the ids stay `hardware.standard` /
  `hardware.soft-close` / `hardware.premium` and the book states, where they are declared, which
  supplier each now denotes.
- **`cabinetHandleCount` and its parity gate survive** with no production reader.
- **Sample amounts only.** `status: estimate`, `amountsProvisional: true`, every amount in the file
  whose name says it is a sample, and the three push-to-open rates marked in the data as drafted and
  unmeasured.
- **ADR 0062 re-asserted**: the query imports no book; no amount, tier, delta or rule exists outside
  it.
- **The negative-delta witness is pinned as a passing test** (ADR 0092 decision 12): a design of one
  `base-3drawer` prices Hettich `4_200` minor **below** Standard and throws `NegativeTierDeltaError`.
  The surviving true statement is asserted over a quantifier **derived from the book's own rates** —
  the inversion needs `drawers > 4.81 × hinges` — and never restated beside them. **The refusal
  itself is not weakened here.**
- **6T does not reach `main` alone.** It lands on a branch with **6W** and the two merge together
  green.

**Risks.**

- **Every 2E delta changes by a large factor**, and the two rulings that make it visible — the
  delta's anchor and ADR 0001 decision 4's rounding-up — are not this wave's to revisit.
- ~~**A sample-data edit can silently reorder Hettich and Blum**, since this kitchen is
  hinge-dominated and a drawer-heavy one swaps them. Pin the order as a sample-book regression.~~
  **Amendment C: the risk has occurred, and pinning the order would now pin a placeholder.** With the
  corrected predicate the drafted push rates alone put Hettich (11 340 MDL) above Blum (11 335) on
  this kitchen. A regression pinning *"Blum is dearest"* freezes an ordering no supplier figure
  supports; a regression pinning *"Hettich is dearest"* freezes the placeholder. **Pin neither.** Pin
  the arithmetic instead — each tier's hardware total equals its three declared rates times the three
  counts — and carry the ordering as open owner input 1.

### Wave 6T2 — the two sink extras

**[ADR 0070](../decisions/0070-hardware-is-priced-per-mechanism-not-per-handle.md) decision 4, planned
by [ADR 0092](../decisions/0092-hardware-prices-three-mechanisms-and-a-sink-carries-two-extras.md)
decisions 9–11.** Gate: 6T (same files). **Must not run beside 6T or 6P.**

**Goal.** A sink is a declared catalogue fact; the rack's host is a derived position; both extras are
priced as `accessory` lines, per sink, and neither is drawn.

**Touches.** `packages/configurator-domain/src/catalog.ts`, `src/fixtures/kitchen-l-design.ts`, a new
`src/queries/sink-accessories.ts`, `src/pricing/price-book.ts`, `pricing/price-lines.ts`,
`pricing/price-design.ts`, `pricing/sample-price-book.ts`, `src/index.ts`,
`apps/web/src/price/price-breakdown-model.ts`, `apps/web/src/content/ro.ts`, plus a new
three-adapter parity case for the sink declaration. **Nine production edits, above WORKFLOW's
five-file guidance** — ADR 0092 decision 13 states the reason and the fallback cut.

**Acceptance criteria.**

- **A sink is declared, never inferred.** Not from `kind` — `base-sink` declares `base_cabinet` like
  every other base body — not from a build-id prefix, and not from an equivalent-id comparison. Both
  `base-sink` and the seeded `base-sink-800` declare it.
- **The parity gate runs in both directions over every catalogue entry**: declares-a-sink ⇒ builds a
  `sink_faucet` group, **and** builds one ⇒ declares one. A one-directional gate passes on the
  `NO_SINK` default and is not this gate.
- **The cover is always present on a sink base and is never toggled** — no setting, no design field,
  no control. `20_000` minor per sink.
- **The rack is priced and never drawn**: no builder touched, at any width and any depth, **asserted
  from the adapter side** — the built body has no new part — not by the absence of a diff. `40_000`
  minor.
- **The rack's host is the lowest wall-band body, on the same wall, that declares at least one door
  leaf and whose along-wall extent strictly overlaps the sink's span.** On the seeded design that is
  `p11`, and each of the four wrong readings is falsified by its own case:
  - ***any* overlapping body double-bills** — two overlap the seeded sink's 900–1700 span, `p11` at
    `y0` 1500 and `p17` at `y0` 2200.
  - ***the highest* puts the rack near the ceiling.**
  - **a predicate on the raw `band` agrees by luck on the seeded design** — `top` folds into `wall`
    (ADR 0011 Gap C), so the test needs a fixture whose **only** overlapping body is a `top` row.
  - **touching is not overlapping** — `p12` begins exactly at 1700 where the sink ends, and counting
    it ties it with `p11` at the same `y0` and hangs a rack in an open shelf.
- **The tie-break is deterministic and asserted**: lowest `y0Mm`, then the larger overlap, then the
  projection's order — never the placements array's order.
- **Per sink, never per kitchen.** A two-sink fixture bills **two** covers and **two** racks even
  where both racks resolve to the same wall cabinet (owner, 2026-09-04).
- **No wall cabinet above the sink → no rack line at all**, and its absence is **not** a zero-amount
  line. A kitchen with no sink has neither line. A zero renders *inclus*.
- **The breakdown's `isWholeKitchenLine` stops being `kind !== "cabinet"`.** Left as a negation it
  compiles and renders `undefined · <accessory name>`. Asserted on a rendered breakdown, not on the
  predicate.
- **Line order is placements, hardware, material, accessories**, and `PricedDesign.lines`' own doc
  comment says so.
- **`listRuleIds` sweeps the accessory rules**, so two rules sharing an id anywhere in the book is
  `INVALID_PRICE_BOOK`.
- **The seeded design's extras total `60_000` minor**, which is the third independent reconciliation
  against ADR 0070's flat *"Sink extras 600"* — identical in all three tier columns, which is what
  says the extras sit outside the tier rather than inside it.
- **The whole-total check is this wave's, because this is the wave that can first perform it.** With
  6T landed, the seeded kitchen totals `510_240` / `1_002_000` / `1_033_500` minor at Standard /
  Hettich / Blum against ADR 0070's ~5 100 / ~10 020 / ~10 335 MDL — 6T's hardware-only figures plus
  `60_000` in each column (Amendment A). **Amendment C restates it once 6T-a lands**: the total is
  `450_240 + 60_000 + 16 × the tier's declared push rate` per tier, and ADR 0070's totals stay the
  check for the hinge, drawer and extras **columns** rather than for the whole figure.

### Wave 6W — a tier that prices below the default

**Opened by [ADR 0092](../decisions/0092-hardware-prices-three-mechanisms-and-a-sink-carries-two-extras.md)
decision 12.** Gate: 6T — the condition is not reachable until 6T's amounts exist. **Same branch as
6T; the two reach `main` together.** Carries one open owner input.

**Goal.** Decide and implement what a customer sees when a hardware tier prices their kitchen below
the group's default, and what happens to the price bar's *De la* claim when the default is no longer
a floor.

**Why it exists.** ADR 0070's Hettich drawer figure is runners-only against complete boxes — an
imprecision the owner accepted explicitly — so Hettich costs 1 400 minor **less** per drawer than
Standard while costing 6 740 more per hinge. A design of **one `base-3drawer`** inverts the two, and
`exactDelta` throws on the settings surface, which is the one control a customer with an unpriceable
document has to recover with.

**What must not happen.** The refusal is not weakened to make 6T's book fit it — that is ADR 0090
decision 7's laundering, and ADR 0091 decision 1's Q1 puts the customer-visible half of this refusal
firmly on the invariant side.

**Recommendation, pending the owner** (ADR 0092 decision 12): a **hardware** tier pricing below its
group's default is offered with **no delta badge**, reusing the module's existing *"the deltas
degrade; the choice does not"* path; the **material** group keeps throwing, because a flat
per-kitchen amount's ordering is a property of the book alone and is still a genuine book fault. The
alternative is a negative badge, which the mockups' *de la +9 000* has no form for.

**Acceptance criteria.**

- **The one-`base-3drawer` design renders the settings sheet**, with every tier still choosable.
- **The material group still refuses** a book whose default is not its cheapest material tier, with
  `NegativeTierDeltaError` unchanged in meaning and message.
- **The 6T-pinned witness is updated in exactly one direction**: it stops asserting a throw and
  starts asserting whatever the ruling says the customer sees. The derived `drawers > 4.81 × hinges`
  quantifier survives unchanged.
- **The *De la* claim is either true or qualified**, and which of the two was chosen is recorded with
  the owner's words.

### Wave-table rows

| Wave | Track | Gate | Tier |
| --- | --- | --- | --- |
| 6T — hardware priced per mechanism *(ADR 0070, planned by ADR 0092)* | P | 6S, 6B2 — **lands on one branch with 6W and 6T-a** | Full |
| 6T-a — one push-to-open predicate *(ADR 0092 Amendment C, owner 2026-09-06)* | P | 6T — **same branch, reaches `main` with 6T and 6W; never in parallel with 6T, 6T2 or 6P** | Full |
| 6T2 — the two sink extras *(ADR 0070 decision 4, ADR 0092 decisions 9–11)* | P | 6T — **same files, never in parallel; and never beside 6P or 6T-a** | Full |
| 6W — a tier that prices below the default *(ADR 0092 decision 12)* | P | 6T — **same branch, reaches `main` with it** | Full |

**6T-a's wave section is written directly into `docs/milestones/done/M6-price-and-global-settings.md`**
rather than pasted from here, because this amendment landed after 6T's section was already in that
file. The row above is the only thing this record contributes to the table.

## Amendment — 2026-10-25: a material is a percentage on cabinet prices, not a flat amount per kitchen

**Evidence tier: owner ruling 2026-10-25, coordinator-relayed.** The decisions above stand. This
supersedes the claim, in *Decision* 12's recommendation and in its restatement under the 6W wave plan (line 1138), that
*"a material tier is one flat per-kitchen amount"*. Today that amount is `wholeKitchenMinor` on
`MaterialTier` (`packages/configurator-domain/src/pricing/price-book.ts:200-203`).

**The ruling.** A material becomes **a percentage on cabinet prices**.

- **PAL is the 0% reference** and is not editable. Illustrative values: MDF +30-35%, veneer +70%.
- It applies to **cabinet prices only**: not to hardware, not to accessories.
- The customer still sees **one "Material · <name>" line**.

**Why.** The flat amount charged a 2 m kitchen and a 6 m kitchen the same; a percentage scales with the
kitchen. It replaces `wholeKitchenMinor`.

**What it touches.**
[ADR 0071](0071-material-carries-price-colour-carries-a-different-control-per-material.md) decision 1
(only material carries price) is unchanged in meaning; the amount it carries changes shape. The
anchor price is "in PAL" ([ADR 0175](0175-a-cabinet-is-priced-by-an-anchor-at-its-default-width-plus-steps-widths-and-heights-round-up-to-50-mm-and-prices-round-to-10-lei.md)
decision 2), which is why PAL is the reference. The material percentage multiplies with the depth
percentage ([ADR 0100](0100-depth-is-priced-by-a-dashboard-editable-multiplier-on-the-600-mm-base-and-it-is-deferred.md)
Amendment of 2026-10-25).

**The material group's "keeps throwing" rule needs a re-read, not an assumption.** Decision 12's
recommendation kept the material group throwing on a default that is not the cheapest tier. With
percentages, "cheapest" is the lowest percentage, and PAL at 0% is the default. Whether the rule
survives unchanged is the implementing wave's to settle against a negative percentage; it is not
decided here.

**A percentage is not an exact count of bani.** It is non-integer arithmetic against a book whose every
coefficient is an exact integer (`usableCoefficientOf`, `price-book.ts:512-520`). Where it rounds is the
open rounding seam in ADR 0175 decision 5 and is not settled here.
