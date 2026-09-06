# ADR 0064 — A seeded row carries its catalogue equivalent's name, so a resize never renames a cabinet

Status: Accepted (the mechanism is amended by wave 6A2 — see the amendment at the end)
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

> **The rule below stands; the mechanism under it does not.** This section specified copying the
> equivalent's fields onto each row and accepting one name in two places as a cost. Wave 6A2 built
> something better within hours — the fields are **read off** the equivalent — and the amendment at
> the end of this record is what shipped. The original is left unedited because the cost it accepted
> is why the improvement is worth having.

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

> **Correction — 2026-09-05, found by the M6 certification audit.** *"`label` is read nowhere in
> `packages/three-adapter/src`"* is false as a literal grep: `kitchen-parts.ts:14` declares a `label`
> field on `PartItem`, and `kitchen-parts.ts:26-36` populates it for every row of the legacy demo
> picker (`PARTS`). That `label` is unrelated to the catalogue's `BodyDefinition.label` this record is
> about — it names a demo-picker entry, not a cabinet — and no builder reads either one to draw
> geometry. **The substance holds**: no `label` of either kind reaches a mesh, so the M1 fidelity gate
> is still not reached and entry 20's "touches no geometry" is still confirmed. Only the sentence's
> literal claim ("read nowhere") was too strong.

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

## Amendment — 2026-09-03: the fields are read off the equivalent, not copied beside it

**What wave 6A2 built, and what the decision now is.** A fixture-local helper,
`namedAfterCatalogEquivalent(catalogEquivalentId)`, returns the pointer together with the
equivalent's `label` and `doorCountFollowsWidth`, **read off `INSERTABLE_BODY_DEFINITIONS`** rather
than written out beside the row. Eighteen seeded rows read `...namedAfterCatalogEquivalent("x"),`,
nine of which carry the flag. A pointer naming no entry **throws at module load**, through a
module-local error class deliberately not exported — the fixture is `export *`'d from `index.ts`, so
exporting it would widen the package's public API for nothing.

**Why the improvement was accepted.** The decision above accepted "one string in two places" as a
cost and bought protection back with a derived invariant test. **A derived pointer cannot drift,
where two copies of one string can** — so the cost is not paid at all, and the test now guards a
property rather than compensating for a known weakness. The resolution happens once, in fixture data,
at exactly the seam where `resolveBuildableSizes` already resolves the same pointer, so the seeded
row's relationship to its equivalent is expressed once and used for two purposes rather than
restated.

**What this is still not.** `describeBodyLabelAt` is untouched and its signature is unchanged;
nothing resolves `catalogEquivalentId` inside it. The rejected alternative above — resolving the
label in the label function — stays rejected, and this remains fixture data rather than the mechanism
change the owner framed it as not being. The invariant test is still present and still derives both
sides.

**The corner rows are untouched and that is asserted, not assumed.** `base-corner-x-900`,
`base-corner-return-320`, `wall-corner-return-570` and `wall-corner-return-570-top` carry no pointer,
per [ADR 0022](0022-seeded-entries-declare-their-catalogue-equivalent.md): they have no catalogue
equivalent, nothing can migrate them on a resize, and
[ADR 0025](0025-the-corner-base-legs-seat-on-the-l-joint.md) already gave their kinds real names.

**One dependency this creates, load-bearing from wave 6I onward.** As shipped in 6A2 the helper
resolves against `INSERTABLE_BODY_DEFINITIONS`, which wave 6H made a *materialisation* at the
declared cabinet depth. Wave 6I turns the seeded map into `buildSeededBodyDefinitions(cabinetDepthMm)`
and therefore has to choose what the lookup resolves against.

**A name must not vary with depth — and neither resolution makes it, so both are admissible.**
`label` and `doorCountFollowsWidth` are **depth-invariant**: every §7 shape takes its label as a
string argument and none derives one from `cabinetDepthMm`, so the two resolutions return the same
values and the difference is not observable. **6I resolves the lookup at the depth the map is being
built at**, on internal coherence — a catalogue built at depth *d* should have every part of it
derived at *d*, and a lookup pinned to the shipped depth would leave a catalogue built at 700 quietly
half-built at 600.

What makes that safe is the assertion rather than the argument, so the M6 plan carries it as a wave
6I criterion: build the §7 definitions at every declared depth and assert each entry's `label` and
`doorCountFollowsWidth` are identical across them. **A wave that ever makes a label depth-dependent
must revisit both** the criterion and that call site, because at that point "admissible either way"
stops being true and a cabinet can rename itself at 700 inside a priced document.
