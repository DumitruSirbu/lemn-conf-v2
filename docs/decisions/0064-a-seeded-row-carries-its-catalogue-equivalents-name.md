# ADR 0064 — A seeded row carries its catalogue equivalent's name, so a resize never renames a cabinet

Status: Accepted
Date: 2026-09-03
Type: Decision + Finding
Milestone: M6 wave 6A2 — closes `docs/BACKLOG.md` entry 20

## Context

`docs/BACKLOG.md` entry 20, found by visual verification of wave 5B8 on 2026-09-01: the seeded
pantry's panel header reads **"Coloană"** at 600 mm, and stepping it to any other width and back to
600 makes the same body at the same width read **"Coloană cămară 2 uși"**.

Nothing is broken. `resolve-column-members.ts` rebuilds a resize through the catalogue equivalent, so
**a resized seeded body migrates its `buildId`** — it has to, because `buildDecomposedBody` takes no
width and every seeded id is one fixed geometry. `describeBodyLabelAt` then finds a definition where
it previously found none, and that definition carries a real `label` and `doorCountFollowsWidth`
where the seeded id carried neither. Two documented rules meeting, not a defect in either.

It was filed unscheduled on the reasoning that *"the header is not wrong at either end"*.

**Wave 6A's logic review changed that calculus.** The projection resolves the literal `buildId` and
not the equivalent — which both reviewers confirmed is the only correct choice, since a line must
name the body the customer owns — so the seeded kitchen's **price breakdown** lists generic names
until the customer's first resize. A name that moves inside a **priced, customer-facing document**
is a different kind of problem from a header that does: the same cabinet is named one way on the
document before a resize and another way after.

## Decision

**Give the seeded rows the labels their catalogue equivalents carry**, as entry 20 itself proposed.
Owner's decision, 2026-09-03. This is fixture data, not a mechanism change: `describeBodyLabelAt`,
the migration on resize, and the projection's literal-`buildId` resolution are all untouched and all
remain correct.

It closes the rename everywhere, not only in the breakdown — the panel header, the offer list's
ACTUAL badge, the breakdown and M8's review summary all read one name for one body.

## What it actually touches — verified, not inherited from the entry

Entry 20 characterises this as "a fixture edit". That is nearly right and is **incomplete in one way
that would leave the defect half-fixed.**

**1. It is two fields per row, not one.** `describeBodyLabelAt` appends the door count only when
`doorCountFollowsWidth === true`, and `base-cabinet`, `wall-cabinet` and `tall-pantry` all declare it.
**Eight** seeded rows point at `wall-cabinet`, whose `label` is the *same generic string*
`WALL_CABINET_LABEL_RO` that the kind table already returns for them — so for those eight the entire
visible difference is the door-count suffix. Copying the `label` alone changes nothing for them and
the rename survives in a smaller form: *"Corp suspendat"* → *"Corp suspendat 2 uși"*. Each row needs
its equivalent's `doorCountFollowsWidth` as well.

**2. Rows with no `catalogEquivalentId` are unaffected in both directions.** The corner returns have
none ([ADR 0022](0022-seeded-entries-declare-their-catalogue-equivalent.md) records that as the
correct answer for them), so there is nothing to copy — and a resize cannot migrate them either,
because it rebuilds through the equivalent. [ADR 0025](0025-the-corner-base-legs-seat-on-the-l-joint.md)
already gave `corner_base_x` and `corner_base_return` real kind names for exactly this reason.

**3. No seeded body renders `UNKNOWN_KIND_LABEL_RO` ("Corp").** Every kind in the fixture —
`base_cabinet`, `corner_base_return`, `corner_base_x`, `dishwasher_housing`, `fridge_freestanding`,
`open_shelf_unit`, `tall_unit`, `wall_cabinet` — is present in `KIND_LABELS_RO`. The generics
actually on screen are *"Corp bază"*, *"Corp suspendat"*, *"Coloană"* and the rest, never the unknown
fallback. Worth stating because an unknown kind would be a **larger** problem than a name: §11 row 24
renders no replace section at all for one.

**4. The M1 fidelity gate is not reached.** `label` is read nowhere in `packages/three-adapter/src` —
no builder consumes it. Entry 20's "touches no geometry" is confirmed rather than assumed.

**5. It is fixture data _plus_ test updates**, so the wave is not literally fixtures-only. At least
`packages/configurator-domain/tests/queries/design-projection.adversarial.test.ts` asserts
`"Coloană"` today, and `catalog.test.ts`, `catalog.qa.test.ts` and
`queries/describe-selection.test.ts` all exercise the kind-label path. Any assertion that pins a
current generic name is asserting the defect and moves with the fix.

## The criterion that matters is the invariant, not the strings

**A body's name does not change when its `buildId` migrates on resize.** A test that renders the
label before and after a resize round trip is worth more than a table of expected names: the table
passes while a ninth seeded row is added without its two fields, and the invariant does not.

It also guards the one cost this decision accepts. Declaring the name on both the seeded row and its
equivalent puts one string in two places, which is the drift this project keeps closing
([ADR 0028](0028-wall-depth-is-derived-from-the-worktop.md)). So the test derives **both** sides and
compares them, rather than comparing either to a literal.

## Alternatives considered

- **Resolve the label through `catalogEquivalentId` in `describeBodyLabelAt`.** One rule, and a new
  seeded row could not forget. Rejected: resolution needs the catalogue map and the function takes a
  bare `BodyDefinition`, so it is a signature change reaching every caller — a mechanism change,
  which is precisely what entry 20 and the owner framed this as **not** being. The invariant test
  above buys most of the same protection at a fraction of the blast radius.
- **Have the projection resolve the equivalent.** Rejected by 6A's review before this decision
  existed, and correctly: a line must name the body the customer owns, not the row it would become.
- **Leave it.** Tenable while the name lived only in a panel header, which is why entry 20 sat
  unscheduled. Not tenable once 6D puts it in a priced document.

## Consequences

- Wave **6A2** implements it, sequenced before 6B and 6D so neither builds fixtures around names that
  would change underneath them.
- `docs/BACKLOG.md` entry 20 moves from **Open** to **Resolved** when 6A2 closes — that file's own
  rule is that a decided item leaves it and the decision lives here. Not before the wave closes.
- The smaller version of this on every other seeded body closes with it.
