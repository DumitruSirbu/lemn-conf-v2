# ADR 0072 — Price-book versioning is deferred to the manufacturer dashboard; M6 takes nothing from it

Status: Accepted
Date: 2026-09-04
Type: Decision
Milestone: Cross-cutting — M6 adds no field, no version and no migration for this

## Context

The owner's design for how a customer's price stays trustworthy once the book changes, in full:

1. A design records which price-book version priced it.
2. A saved kitchen keeps showing the price it was quoted at, indefinitely — the owner's own words, a
   customer opening it "should see the same price that it saw, let's say, half a year ago".
3. A prominent notice says prices have been updated and that the figure no longer reflects current
   prices.
4. Recalculation is explicit and customer-initiated — an "apply new prices" action pulls current
   prices, re-prices that one design, and marks it current. The owner expects it may take time to
   compute.
5. Nothing auto-updates. Editing the price of one piece of hardware or one material must never
   rewrite the total of any saved kitchen.
6. The manufacturer dashboard shows, per kitchen, the price list used at that time — so the
   manufacturer can see what a kitchen was quoted at, compare it against today, and discount
   deliberately.

The owner's reasoning for *when* this is built: M6 is about **displaying** a price, not about
**managing** prices. Versioning, retention, the recalculate flow and what to show the customer are
all properties of a system that can edit prices, and that system is
[ADR 0062](0062-a-manufacturer-price-dashboard-comes-after-m8-and-shapes-seams-now.md)'s dashboard.
Building the storage before the mechanism means guessing at the mechanism.

## Decision

**The design above is recorded now, and none of it is built in M6.** M6 adds no field, no version
and no migration for it. Three findings support leaving it there rather than starting early.

**1. The seam ADR 0062 asked for already exists, verified against the tree on 2026-09-04.**
`priceDesign` (`packages/configurator-domain/src/pricing/price-design.ts:90`) takes the book as a
parameter, and nothing under `packages/configurator-domain/src/pricing/` imports
`SAMPLE_PRICE_BOOK` — the only import site in the application is
`apps/web/src/price/use-priced-design.ts`, which names itself in its own header comment as "the
composition root for pricing… and the only module in this application that names a price book",
citing ADR 0062 seam 1 by number. A database-backed versioned book is later a substitution at that
one import, not a refactor through the domain.

**2. A schema field is not a seam, it is a slot.** Adding a `pricingVersion` (or similar) field to
`DesignSchema` now would ship a persisted field with no production reader. This project has twice
rejected exactly that shape already, both times in the M6 milestone plan:

- Wave 6A3's QA punch list, ruled 2026-09-03, refused to let a body's depth-chain fact be declared in
  production ahead of its reader: *"a declaration whose only consumer is its own test is not an
  ADR 0028 parity gate — parity needs two independently derived numbers — it is a rename, and it
  would ship a production seam with no production caller"*
  (`docs/milestones/done/M6-price-and-global-settings.md:546-551`).
- Wave 6E, shipped 2026-09-03, built the whole-kitchen settings container but explicitly left
  cabinet depth's arrival — and whether it owes a version bump — to wave 6J rather than pre-empting
  it: *"Whether depth's arrival owes a version bump is 6J's decision and is deliberately not
  pre-empted here"* (`docs/milestones/done/M6-price-and-global-settings.md:958-959`).

A `pricingVersion` field today would have no dashboard to write a second version, and no recalculate
command to read the old one against — the same unreachable-second-reader shape both precedents
declined to ship early.

**3. The failure this would guard against is unreachable until the dashboard exists.** Verified
2026-09-04: a design carrying a whole-kitchen tier the book no longer offers makes `priceDesign`
return `UNKNOWN_TIER` (`price-design.ts:536-543`, `selectTier`) for either group —
`request.selections.materialTierId` and `request.selections.hardwareTierId` are each resolved
against `request.book`'s own tier list independently, so withdrawing either tier fails that group on
its own. Measured against `KITCHEN_L_DESIGN` priced with `KITCHEN_L_BODY_CATALOG` and
`SAMPLE_PRICE_BOOK`, which otherwise totals `9_427_500` minor units
(`apps/web/tests/price/starting-price.adversarial.test.ts:170`): withdrawing the tier it uses from
either group turns that total into a refusal. On refusal the price bar renders nothing rather than a
stale or zero figure — *"a pricing failure renders no figure: not a zero, not a stale one, not a
dash that reads as free"* (`apps/web/src/price/price-bar.tsx:34`).

Today the book changes only when a developer edits `sample-price-book.ts`, and a developer can
migrate any affected design in the same commit. The failure mode this ADR's design item 3 (a
prominent stale-price notice) and item 4 (explicit recalculation) exist to handle — a customer's
saved kitchen going stale **out from under them, with no one present to fix it** — cannot happen
until a manufacturer, not a developer, can edit the book. That is the dashboard.

## Two sub-decisions the dashboard work inherits, recorded as open

**Neither is decided here.** They are recorded as inputs the dashboard wave owes, with a
recommendation and its reasoning, clearly marked as a recommendation and not a ruling.

**Version id or snapshot?** The recommendation is to store the **version id**, with books immutable
and append-only, not to copy the priced amounts into each design. The owner wants to see "the
specific list of prices used at that particular time" — that is a *book*, not a scatter of numbers
copied into each kitchen. A per-design snapshot duplicates the book once per kitchen and cannot
answer "what changed between then and now", which is the question the dashboard exists to answer
(design item 6, above). **The cost, stated plainly: under this recommendation every book version
must be retained forever and stay retrievable** — an append-only table with no delete path, growing
without bound as the manufacturer edits prices over years.

**Where books live.** Today `SAMPLE_PRICE_BOOK` is a TypeScript constant in one file
(`packages/configurator-domain/src/pricing/sample-price-book.ts`). A dashboard the manufacturer edits
needs versioned books in the database, which means a books table and the persistence work that comes
with it. Not designed here.

## One observation worth recording on its own

**This design dissolves the stored-tier problem recorded in wave 6E rather than patching it.** Wave
6E surfaced, and left open, the question of a design carrying a material or hardware tier the price
book no longer offers (`docs/milestones/done/M6-price-and-global-settings.md:970-977`). Under this
record's design, a kitchen priced at book v1 keeps pricing against v1, where its tier still exists,
so nothing is ever orphaned by an edit elsewhere. The reconciliation question does not disappear — it
**moves to the moment the customer presses "apply new prices"**, which is exactly where they are
present to be told what changed. That is the same shape as
[ADR 0057](0057-a-material-change-resets-an-unavailable-finish.md)'s warn-before-apply rule, reached
from a different direction: a change that could invalidate a stored choice is disclosed before it is
applied, never silently.

**Wave 6G already built the recovery path this leans on, so the dashboard wave does not rebuild it.**
Verified 2026-09-04: the settings surface keeps rendering the tier list even when pricing a design
fails, because the list "must not depend on pricing" — *"a document carrying a tier the book has
since withdrawn makes `priceDesign` refuse — and the tier list is the one control that could put such
a document right, so a surface must not depend on pricing"*
(`apps/web/src/price/whole-kitchen-tiers.ts:111-113`). A customer whose design cannot be priced can
still choose a valid tier and recover, today, without any of this record's design being built. The
dashboard wave should read this as already solved for the "stuck with no way out" failure mode; what
it still owes is the notice, the explicit recalculate action, and the retained-version storage above.

## Alternatives considered

- **Add `pricingVersion` to `DesignSchema` in M6, unused, so the dashboard wave "only" has to wire a
  reader.** Rejected: this is precisely the slot-not-seam shape wave 6A3's punch list and wave 6E
  both declined for smaller cases in the same milestone. A field with no production reader is a
  liability — it has to be migrated, documented and kept in sync with a shape nobody has designed
  yet — not a saving.
- **Snapshot the priced amounts into each design instead of storing a version id.** Rejected as the
  dashboard wave's call to make, but recorded here with a reasoned recommendation against it: it
  cannot answer what changed, which is the dashboard's own purpose (design item 6).
- **Decide book storage (id vs. snapshot, database table shape) now, alongside the deferral.**
  Rejected as the overshoot ADR 0062 already guards against: the same reasoning that keeps the
  dashboard itself out of M6–M8 keeps its storage design out too. Recorded as open, not designed.

## Consequences

- M6 ships no `pricingVersion` field, no version table, no recalculate command and no stale-price
  notice. A saved design continues to be priced live against the current `SAMPLE_PRICE_BOOK` exactly
  as it does today — this record changes nothing a customer or developer can observe before the
  dashboard exists.
- The dashboard wave, whenever it is scheduled, inherits two open sub-decisions (version id vs.
  snapshot; where books live) with a recommendation on each, and inherits wave 6G's tier-list
  recovery path already built.
- `docs/milestones/done/M6-price-and-global-settings.md` is not edited by this record — an architect is
  writing wave plans into it concurrently. A pointer from M6 to this ADR, if wanted, is the M6
  architect's or the coordinator's to add once that work lands.

## What did not check out in the originating brief

Everything checked out against the tree. The seam claim, both cited precedents' quotations, the
`UNKNOWN_TIER` failure mode for both tier groups, the `9_427_500` baseline, and wave 6G's
pricing-independent tier list all matched what the code and the milestone plan state.

## Amendment — 2026-10-25: a saved kitchen always prices at the current book; design items 2, 4 and 6 are reversed

**Evidence tier: owner ruling 2026-10-25, coordinator-relayed** (given in conversation; the words in
quotation marks are the owner's as relayed, not a verbatim transcript). The rest of this record stands
as written; this amendment names what it supersedes.

**What is reversed.** *Context* design item 2 (a saved kitchen keeps showing the price it was quoted
at, indefinitely), item 4 (an explicit, customer-initiated "apply new prices" recalculation) and
item 6 (the dashboard shows, per kitchen, the price list used at that time). Items 3 and 5 are
changed in effect: item 3's "figure no longer reflects current prices" notice has no old figure left
to qualify (see the one-time notice below), and item 5's *nothing auto-updates* no longer holds for
customer pricing, because a kitchen is re-priced whenever it is opened. Item 1 (a design records its
book version) is not needed for customer pricing either; see the sub-decisions below.

**The owner's reasoning, as relayed.** Keeping and showing the earlier price is "counter
manufacturer": a customer could go back, see that the kitchen was about 10% cheaper, and hold the
manufacturer to it. The on-screen total is an estimate anyway: the real price is calculated at the
shop and fixed in the contract, so the configurator's total "will not be so important anymore".

**The ruling.**

- A saved kitchen stores **only its configuration** and **always prices at the current published
  book**. There is no per-design quoted price, no per-kitchen price version, no recalculate action
  and no customer-visible old price.
- When a customer opens a saved kitchen and **a price that kitchen uses has changed since they last
  saw it**, they see a **one-time notice** that prices were updated: shown once, then not again. It is
  informational, with no old amount and no before/after figures. **Where the "already shown" marker is
  stored is open and not decided**: the owner named a cookie, the user's profile and the database.
- **Versioning of the book is kept for the owner's own history** (what changed, and when), shown in
  the dashboard. Customers never see versions.

**Effect on the two open sub-decisions** (*Two sub-decisions the dashboard work inherits*):

- **Version id or snapshot?** No longer needed for customer pricing. A per-design snapshot and a
  per-design version id both existed to let a kitchen keep pricing against an old book; under this
  ruling no kitchen does. The recommendation to keep books immutable and append-only survives only as
  far as the owner's history needs it, and that need is the owner's change log, not a per-design
  reference. The "every version retained forever" cost therefore no longer follows from customer
  pricing; what the history retains is the dashboard wave's to size.
- **Where books live** stays open, unchanged: a dashboard-edited book needs database storage, and that
  is not designed here.

**Consequence for the stored-tier observation.** *One observation worth recording on its own* said
this design moved the withdrawn-tier question to the moment of "apply new prices". That moment no
longer exists. A kitchen is re-priced on open, so a design carrying a tier the current book no longer
offers will meet `UNKNOWN_TIER` (`price-design.ts:536-543`, as verified in *Decision* finding 3) on
open rather than at a customer action. Wave 6G's pricing-independent tier list is the recovery path
(`whole-kitchen-tiers.ts:111-113`); whether a withdrawn tier needs more (for example, the
warn-before-apply shape of [ADR 0057](0057-a-material-change-resets-an-unavailable-finish.md)) is
**not decided here** and is the dashboard wave's to settle. The dashboard's book validation is the
natural place to refuse withdrawing a tier a saved kitchen may still use; that is an inference, not a
ruling.

**What this answers elsewhere.** [ADR 0062](0062-a-manufacturer-price-dashboard-comes-after-m8-and-shapes-seams-now.md)
seam 3's M8 bullet asked what happens to a design priced under a retired book version. Answer: **a
design is never priced under a retired version; it is re-priced under the current one, with the
notice above.** That answer concerns a saved kitchen's on-screen price. It does not by itself revisit
a contact submission's stored figure (M8's D7 keeps the submitted snapshot); that is a separate
record and is **not changed by this amendment**.

**Follow-up, 2026-10-25 (second): the withdrawn-tier question is now the deactivation question.** The
paragraph above named the dashboard's book validation as the place to settle what happens to a tier a
saved kitchen uses. The owner has asked for the warning on deactivating or deleting such an item (a
material, a hardware class, an accessory) to be designed again; deleting stays blocked while it is
used. The design brief proposes that a deactivated item is hidden from new choices while saved kitchens
that use it keep being priced with it, so they do not meet `UNKNOWN_TIER`. **That is a proposal,
pending owner confirmation, not a ruling.** Recorded at the
[ADR 0062 second Amendment of 2026-10-25](0062-a-manufacturer-price-dashboard-comes-after-m8-and-shapes-seams-now.md);
backlog 285.

**Superseded, 2026-10-25 (third).** The proposal above is **replaced by an owner ruling**, recorded at
the [ADR 0062 third Amendment of 2026-10-25](0062-a-manufacturer-price-dashboard-comes-after-m8-and-shapes-seams-now.md):
a used item may be disabled but not deleted; a saved kitchen using a disabled item is **not** kept
priced with it. The customer gets a notice and must choose a replacement from the remaining options,
and the price recalculates after the choice. That makes the choice mandatory and resolves the
`UNKNOWN_TIER`-on-open consequence above. Price changes keep applying to every kitchen, sent ones
included (freezing rejected for now). Open points for the architect are listed in that amendment.

**What does not change.** M6 and M8 still build nothing for this: no field, version, table, endpoint
or notice. The dashboard remains after M8 per ADR 0062. The seam finding (`priceDesign` takes the
book as a parameter) is untouched, and is what makes "price at the current book" a substitution
rather than a refactor.

**Dated note, 2026-10-26: the marker is decided, and the "builds nothing" sentence above is superseded.** Evidence tier:
doc-quoted from `docs/milestones/M10-price-dashboard.md` §5 (A-11, A-17); nothing is built.

- "M6 and M8 still build nothing for this … The dashboard remains after M8" is superseded by
  [ADR 0176](0176-the-manufacturer-price-dashboard-is-milestone-m10-and-starts-now.md): the dashboard is milestone M10.
- *Where the "already shown" marker is stored is open* is decided by [ADR 0178](0178-the-m10-dashboard-storage-lifecycle-defaults-notice-seen-and-digest.md)
  A-11: a database row per design holding the last **(book version, availability revision) pair** the owner of the design
  acknowledged. A pair, not a version alone, because under the owner's 2026-10-26 ruling (OQ-2) availability changes
  immediately and outside the published book, so a kitchen's price can change without a new version. A cookie and the
  profile are rejected there. Recorded as an architect ruling; the owner may overrule it.
- Snapshots are still never re-priced: this record's "what this answers elsewhere" stands.
