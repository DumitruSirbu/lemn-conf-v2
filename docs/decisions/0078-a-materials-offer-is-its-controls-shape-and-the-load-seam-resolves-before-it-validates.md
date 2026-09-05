# ADR 0078 — A material's offer is its control's shape, and the load seam resolves before it validates

Status: Accepted
Date: 2026-09-05
Type: Decision
Milestone: M6 — unblocks wave 6Q (6Q-a and 6Q-b)

## Context

[ADR 0057](0057-a-material-change-resets-an-unavailable-finish.md) (2026-09-02) rules what happens to
a per-cabinet finish a newly chosen material does not offer: **reset to that material's default,
warned before the apply, once, and no stored design may hold a finish its material does not offer.**
It was written when a finish was one of five strings and a material was one of three tiers, so
*"does not offer"* was set membership over fifteen pairs.

Wave 6P (`38268b5`, 2026-09-04) replaced that ground. `packages/configurator-domain/src/materials.ts`
now declares three materials, eight palette entries and **two kinds of finish** — a palette entry id,
or a free `#RRGGBB` colour — each material carrying a `ColourControl` with a declared `shape`
(`decor-list`, `ral-picker`, `wood-swatches`) and a `defaultFinish` (ADR 0071's amendment: *Alb*,
white, *Stejar*). What 6P did **not** ship is any query answering *whether a material offers a
finish*: `paletteEntriesOf` lists a material's entries and nothing decides the free-colour half.
Wave 6Q is where ADR 0057's rule finally executes, and it cannot state the rule without three things
6P left open. This record rules them.

Three facts constrain the answer, and each is a live decision rather than a preference:

- **A load that refuses is a dead link** — 6P's own framing of ADR 0052's precedent, and the reason
  its legacy migration normalises rather than rejects. A `/d/{id}` link is the one artefact this
  product hands to someone who cannot be asked to reload it.
- **[ADR 0069](0069-past-the-wall-is-one-code-family-and-severity-is-declared-per-code.md) decision 2**
  makes `DESIGN_ISSUE_SEVERITY_BY_CODE` a total per-code declaration with a membership rule: a
  finding is a `"mark"` **if and only if** the single fact it asserts is that a run reaches past the
  end of the wall it stands on. Every other finding is a `"refusal"`. A finish/material code is
  therefore a refusal, with no discretion — and `validateDesignForCatalog` is shared by the API write
  path and, through `assertDesignValidForCatalog`, by `migrateDesign`.
- **[ADR 0072](0072-price-book-versioning-is-deferred-to-the-manufacturer-dashboard.md)** leaves a
  stored `materialTierId` that names nothing the product declares as a reachable state that must
  keep loading; wave 6G's recovery path depends on it.

Read together, the milestone's own sketch of wave 6Q — *"`validate-design.ts` (the invariant at the
load seam)"* — is unbuildable as written. A refusal code in the shared validator refuses stored
documents, and the documents it refuses exist: since 6P the panel still offers the five legacy chips,
two of which (*Lut*, *Salvie*) write a free colour onto what is by default a PAL kitchen. Those rows
are in the preview database ([ADR 0054](0054-local-development-writes-to-the-preview-database.md)).

## Decision

**1. A material's offer is derived from its declared `ColourControl.shape`, and is not a second
list.** One query in `materials.ts`, total over both finish kinds:

| `ColourControl.shape` | Offers | Does not offer |
| --- | --- | --- |
| `decor-list` (PAL) | exactly its declared `entries` | every free colour, and every entry of another material |
| `wood-swatches` (veneer) | exactly its declared `entries` | every free colour, and every entry of another material |
| `ral-picker` (MDF) | **every free colour `FinishSchema` admits** | every palette entry, without exception |

Derived from the shape rather than from the entry count, for ADR 0071 decision 3's own reason: two
swatches and a list of two are the same array and different products. Derived from the declaration
rather than restated beside it, for [ADR 0028](0028-wall-depth-is-derived-from-the-worktop.md)'s: two
lists of what PAL offers is the failure one seam over from the one 6P closed between the domain and
the book.

**MDF offers every value the schema admits, not a RAL table.** ADR 0071 decision 3 rules MDF's
*control* to be a RAL picker; it declares no RAL set, and 6P deliberately bounded a free colour at
six hex digits rather than at a named palette. Making the *offer* narrower than the *schema* would
invent a table nobody has authored and would make the load seam reset colours a customer chose. Which
values wave 6R's picker presents is that wave's; what a stored document may hold is this one's.

**2. The load seam resolves; the write seam refuses; and the ordering is what keeps both true.**

`migrateDesign` gains one more **unconditional, non-version-keyed** normalisation, placed **after**
`dropFinishFromBodiesThatCannotWearOne` and **before** `assertDesignValidForCatalog`: every placement
wearing a finish its document's material does not offer is rewritten to that material's
`defaultFinish`. `validateDesignForCatalog` gains one code of `"refusal"` severity, per ADR 0069's
membership rule.

The two are not in tension because the resolution runs first: **the refusal is unreachable on the
load path by construction**, and reachable at `PUT /api/designs/[id]`, which is the seam where a
client has bypassed the command that would have resolved it. No stored row is ever refused for
wearing the wrong finish, and no written row is ever accepted wearing one.

**The normalisation is keyed to no version and this wave takes no schema bump.** The precedent is
`dropFinishFromBodiesThatCannotWearOne`'s own, in its own words: *"a property of the loaded document
has to be asserted on the loaded document."* [ADR 0055](0055-a-depth-change-migrates-the-stored-design.md)'s
bump rule is the contrast case, not this one — it governs a rewrite **one version owes**, and 6P's
QA measured exactly what keying an unconditional property at a version costs: keyed at 3, the
`canFinish` strip never ran on the documents the build itself was writing.

**3. An undeclared material id resolves nothing and refuses nothing.** `DesignSettingsSchema`
validates `materialTierId` for shape only (the domain imports no book, ADR 0062 seam 1), so a stored
id naming no declared material is a reachable state. Neither seam may throw `UnknownMaterialError`
and neither may report a finding: **a material this product does not declare makes no offer, and a
document is not corrected against a material nobody can look up.** This is ADR 0072's rule applied
where it lands — the book is reconciled by a developer's migration in the same commit, never by a
load-time rule this wave builds — and it keeps 6G's recovery path working.

**4. The reset resolves to the declared default and never to a nearby colour.** The target is
`materialById(...).defaultFinish`, read from the declaration, with no branch per material and no
table in the command. **Explicitly forbidden: constructing a free colour from a palette entry's
swatch hex** — *Alb* → `#eceeeb` on MDF, and its like. That is the nearest-finish mapping ADR 0057
rejected by name, arriving through the back door wave 6R opens when it publishes a hex per decor
("Every palette entry publishes a swatch colour"). ADR 0057's objection was that a substitution is
**invisible**; a swatch that stays the same colour while the priced material changes underneath it is
the most invisible form of it.

**5. Absence is a legal state and stays absent.** A body wearing no finish is not wearing one the
material fails to offer. Neither seam writes a `finish` key onto a placement that has none — the
resolution corrects a choice, it does not invent one, which is `dropFinishFromBodiesThatCannotWearOne`'s
stated reason for existing one line above it.

**6. Nothing here weakens `setFinish`'s existing refusal, and it gains a second.** A finish the
design's material does not offer is refused at the command with its own code, for
`set-appearance.ts`'s standing reason: *a no-op looks identical to a broken control.* Between wave
6Q-a and wave 6R the panel still offers the five legacy chips and two of them will refuse on a PAL
kitchen. That is a named, accepted interim — it replaces silently storing an invalid finish with a
sentence — and 6R clears it by making the offer the control's own.

> **Corrected 2026-09-05 — the interim's cost was understated, not the interim itself.** Found by
> logic review of wave 6Q-a and pinned independently by the wave's own QA, at
> `apps/web/tests/panel/qa-6q-a-refusal-surface.adversarial.test.ts:63-67`. The paragraph above names
> two refusals; the settings sheet makes fifteen (material, chip) pairs reachable, not five, and ten
> of the fifteen refuse:
>
> | Material | Chips that apply | Chips that refuse |
> | --- | --- | --- |
> | PAL | white, graphite, oak (3) | clay, sage (2) |
> | MDF | clay, sage (2) | white, graphite, oak (3) |
> | veneer | none | all five (5) |
>
> Eight of the ten refusals are outside what the paragraph above names. The sharpest case:
> `sample-price-book.ts:275` declares `material.veneer`, which 6G's settings sheet offers, and on a
> veneer kitchen every one of the five chips refuses — **the finish control is inert.** 6Q-b's reset
> (decision 4) then puts every cabinet on `veneer.stejar`, leaving `veneer.nuc` — the other declared
> wood — unreachable through any surface until 6R.
>
> **The conclusion above is unchanged.** `materialOffersFinish` is exactly decision 1's table, 6Q-a
> is forbidden from touching `panel-model.ts` to pre-empt it, and the interim is still accepted on
> the same argument — it still replaces silently storing an invalid finish with a sentence. What was
> wrong is the cost that argument was weighed against: ten-of-fifteen refusals including one dead
> control, not two-of-five. Nothing ships mid-milestone, so this reaches no customer; it does reach
> local development against the preview database
> ([ADR 0054](0054-local-development-writes-to-the-preview-database.md)), so anyone testing a veneer
> kitchen before 6R meets it.

## Alternatives considered

- **Put the invariant only in `validate-design.ts`, as the milestone's wave sketch says.** Rejected
  on measurement, not on taste: under ADR 0069's membership rule the code must be a refusal, the
  validator is shared with `migrateDesign`, and the documents it would refuse exist today (a PAL
  design wearing *Lut*, written by the panel 6P shipped). It converts ADR 0057's invariant into
  ADR 0052's dead link.
- **Make the code a `"mark"` so the load path carries it.** Rejected twice over: it breaks ADR 0069's
  membership rule, which is a total declaration and not a filter, and a carried mark is precisely the
  *"keep the choice and mark it unavailable"* option ADR 0057 already rejected — an invalid state
  survives.
- **Resolve at the write seam too, instead of refusing.** Rejected. The write seam receives a whole
  document from a client; silently rewriting the customer's payload and answering `200` is how a
  client bug becomes invisible, and every legitimate write already passes through a command that
  resolved. ADR 0014 S2's posture — a stable code, never a reason — is unaffected.
- **Declare a RAL table so MDF's offer is finite.** Rejected: no such table exists, ADR 0071 declares
  none, and the first thing it would do is reset free colours a customer picked. It would also make
  the offer disagree with `FinishSchema`, which is the one gate both seams pass through.
- **Version-key the normalisation and bump to 6.** Rejected — decision 2's argument, and 6P's
  measured defect.

## Records swept before deciding, and how each is settled

Per the owner's standing instruction, checked before ruling.

| Record | What it says | Settled how |
| --- | --- | --- |
| [ADR 0057](0057-a-material-change-resets-an-unavailable-finish.md) | Reset to the new material's default; the filter is one domain query; the reset runs once and produces one result; the warning precedes the apply; no stored design holds a finish its material does not offer, over every pair. | **Unchanged and implemented, not amended.** This record answers only *what "offer" means* and *where the invariant is enforced*, both of which ADR 0057 left open. Decision 4 defends its rejection of nearest-finish mapping against a route it could not have foreseen. |
| [ADR 0071](0071-material-carries-price-colour-carries-a-different-control-per-material.md) + amendment | Three control shapes; MDF is a RAL picker; the three defaults are Alb / white / Stejar. | **Read as ruling the control and the defaults, not the offer.** Decision 1 derives the offer from the shape ADR 0071 declares; decision 4 reads the defaults as decided data. Its decision 5 table (*`white` → PAL Alb **and** any white through the MDF picker*) describes what each colour becomes **available** as, not a migration mapping — reading it as one contradicts ADR 0057, which it explicitly defers to. |
| [ADR 0052](0052-800-mm-is-the-ceiling-on-any-empty-column.md), as cited by wave 6P | Normalise a document written under a superseded rule; a load that refuses is a dead link. | **Obeyed, and it is the reason for decision 2's ordering.** Nothing here refuses a stored document. |
| [ADR 0069](0069-past-the-wall-is-one-code-family-and-severity-is-declared-per-code.md) decision 2 | Severity is declared per code and total; `"mark"` **iff** the single fact asserted is "past the end of its wall". | **Followed without exception.** The new code is a refusal. The alternative — demoting it to a mark so the load path survives — is refused above rather than quietly taken. |
| [ADR 0072](0072-price-book-versioning-is-deferred-to-the-manufacturer-dashboard.md) | A stale stored tier is migrated by a developer in the same commit; M6 builds no load-time reconciliation; 6G's recovery path stands. | **Decision 3 is this rule applied to an undeclared material id.** No reconciliation is added, and the load path is made explicitly incapable of throwing on one. |
| [ADR 0055](0055-a-depth-change-migrates-the-stored-design.md), [ADR 0053](0053-the-design-document-records-the-whole-frozen-map.md) | A rewrite of stored values owes a version bump; an absent field whose absence is legal does not. | **The contrast case, argued rather than inherited** — decision 2. Both govern a debt **a version** owes; an unconditional property of every load is neither, and 6P's own unversioned strip is the nearer precedent. |
| [ADR 0028](0028-wall-depth-is-derived-from-the-worktop.md) decision 4 | A declaration, never a computation; two lists must not agree by luck. | **Cited for decision 1** — the offer is derived from the declared shape, not restated. The independently written expected-miss table wave 6Q's tests carry is the sanctioned inverse, the device 6P's QA used to close the unpinned bridge table. |
| [ADR 0062](0062-a-manufacturer-price-dashboard-comes-after-m8-and-shapes-seams-now.md) seam 1 | The domain imports no price book. | **Untouched.** The offer reads `MATERIALS` only; nothing here asks whether a tier exists. |
| [ADR 0054](0054-local-development-writes-to-the-preview-database.md) | Local development writes real rows to the preview database. | **Why the dead-link risk is concrete rather than theoretical** — the *Lut*-on-PAL rows a refusal-first ordering would strand are reachable now. |
| Wave 6P's close-out (schema 4 → 5) | A rewrite of stored values earned a bump; the `canFinish` strip did not, and keying it at a version was the defect QA found. | **Both halves used**, in decision 2, in the direction each argues. |
| M6 *Open questions gating this phase* | Each material's default finish; the stale-tier question; the four unruled strings and the standing "draft, mark pending owner review" direction. | **All ruled 2026-09-04.** No owner input is needed to ship wave 6Q; the question this record raises below is not one of them and blocks nothing. |

Nothing found in the sweep contradicts this decision.

## An owner question this raises and does not answer — **answered 2026-09-05: no carry-over**

> **Closed by the owner on 2026-09-05, recorded in
> [ADR 0081](0081-a-material-change-confirms-only-when-a-chosen-colour-would-be-lost.md).** They
> declined the carry-over by name — *"instead of carry over the colours and trying to make an
> algorithm of mapping these colours between different materials, I will go with just checking if
> there are different colours compared to default for each cabinet"* — so decision 4 above and
> ADR 0057's rejection of nearest-finish mapping both stand, reaffirmed rather than merely
> unrevisited. The same message replaced the warning's *shape*: it becomes a conditional, blocking
> confirmation. **Nothing in this record changes.** The section below is left standing because the
> argument on both sides is what makes the answer legible.

**Switching PAL → MDF resets every cabinet, exactly as switching to veneer does.** Under decision 1
MDF offers no palette entry at all, so a PAL kitchen wearing six decors loses all six to MDF's white
default. This is ADR 0057 working as ruled, and wave 6Q ships it as ruled — **nothing is blocked.**

It is raised because one premise of ADR 0057's rejection of nearest-finish mapping has changed since
2026-09-02. That rejection rested on the mapping being unauditable (*"an owner-authored mapping
across five finishes and three tiers whose correctness nobody can check"*) and, more importantly, on
a substitution being **invisible**. Wave 6R will publish an exact swatch colour for every palette
entry, so a PAL-decor → MDF-colour carry-over would no longer need an authored table; and on the MDF
side the substitution would be a colour the customer can see is unchanged. The counter-argument is
decision 4's and is why this record does not act on it: the *material* changes and its price with it,
so a swatch that does not move is the least visible substitution of all, and the customer's own
mental model — *"same colour, better material"* — is exactly what would go unchecked.

If the owner wants a PAL → MDF colour carry-over, it is a **new dated decision** amending ADR 0057,
not an implementation choice. It would change one function and one clause of the warning copy, and
would not change wave 6Q's shape.

## Consequences

- Wave 6Q splits into **6Q-a** (the offer query, the undeclared-material rule, `setFinish`'s second
  refusal) and **6Q-b** (the reset in `setMaterialTier`, both seams, and the warning clause), in that
  order. The order is forced by decision 2: the refusal code may not land before the resolution that
  makes it unreachable on the load path. **A third, 6Q-c, was added 2026-09-05 by
  [ADR 0081](0081-a-material-change-confirms-only-when-a-chosen-colour-would-be-lost.md)**, which
  takes the warning out of 6Q-b and makes it a conditional blocking confirmation of its own.
- The invariant becomes assertable as a property over a **generated** pair space — three materials ×
  (eight declared palette entries ∪ generated free colours) — rather than over a fixture's contents,
  which is what ADR 0057 asked for and what nothing before 6P could express.
- **A finish is now the second thing in this document a load may rewrite**, after 6P's own two. Any
  future wave adding a third must place it in the same unconditional block and inherit its ordering
  argument, not key it at a version.
- Wave 6R inherits one prohibition it must not talk itself out of: publishing a swatch hex per decor
  is not permission to map a decor onto a free colour anywhere outside the swatch.
