# ADR 0021 — Corner returns are structural in the catalogue data, and §11 row 20 loses its last reachable opening

Status: Accepted
Date: 2026-08-26
Type: Finding + Decision
Milestone: M4 Wave 4B — found by adversarial QA, confirmed by logic review

## Context

`DEVELOPMENT-SPEC.md` §13.1 says: "**Corners are structural.** No replace, no delete, never a width
donor. A sink-in-corner request is a custom product, not a loosened rule." §11 row 16 repeats it:
a corner base has "no swap list, no delete, refusal explains why".

That rule was written down and never expressed in data. The two seeded corner returns —
`wall-corner-return-570` (`p9`, wall B at 1500 mm) and `wall-corner-return-570-top` (`p21`, wall B
at 2200 mm) — were defined as plain `wallCarcass` entries in
`packages/configurator-domain/src/fixtures/kitchen-l-design.ts`, and therefore carried
`canReplace: true`, `canDelete: true`, `fixedWidth: false`.

Nothing before M4 rendered those flags, so nothing exposed the gap. M4's panel renders them
faithfully — which is how the defect surfaced: selecting a structural corner offered a five-row swap
list, a **Șterge corpul** button, and a width section.

This is the same shape as ADR 0016's hood and ADR 0017's sink base: a rule stated in prose, absent
from the catalogue row, and invisible until the layer that reads the row was built.

## Decision

**1. The flags move into the data.** Both corner-return entries take a shared `STRUCTURAL_CORNER`
shape: `canReplace: false`, `canDelete: false`, `canFinish: false`, `canHandle: false`,
`fixedWidth: true`.

**2. `canFinish` and `canHandle` are an extension of §13.1, made deliberately.** §13.1 names only
replace, delete and width donation. §9 grounds `canFinish` in "body has doors", and a corner return
arguably has one. The extension is taken because M4's own acceptance criteria state it — "A corner
return, which has no finish, handle or width, shows none of those sections" — and because a return
panel is a filler that holds the run together rather than a cabinet a customer specifies.

Recorded as a reinterpretation rather than a reading, so that re-opening it is a decision and not a
rediscovery. **Its consequence is real and should be seen:** once per-placement finish is wired into
the scene, the corner return is the one front in the kitchen that permanently keeps the default
material while its neighbours take the chosen finish. If that reads as a defect on screen, this
clause is the thing to revisit — not the finish wiring.

**3. §11 row 20 is now fixture-only, and is recorded as such rather than quietly lost.**

Column `B|0.61` contains exactly two placements, `p9` and `p21`. With both non-deletable, that
column can never produce an opening. The 570 mm opening they used to vacate was **the only 570 mm
opening in the product**, and §11 row 20 — "insert into a 570 mm opening: body builds to 570, door
count follows width" — is therefore no longer reachable by any customer action.

Three domain tests depended on opening it with `clearBodies`, which now correctly refuses. They were
re-pointed at a new `advancePast` test helper that removes a placement *outside* the command layer,
precisely because the command layer refuses. Those tests are still green and still exercise the fit
rule — but they are engine-level unit tests against a synthetic opening, **not product scenarios**,
and must not be read as evidence that a customer can reach row 20.

The honest summary: row 20 was only ever reachable through the very defect this ADR fixes. Deleting
a structural corner was never permitted behaviour, so the reachability was a bug, not a feature —
but the regression coverage silently changed meaning, and that is worth a record.

## Alternatives considered

- **Leave the corner returns permissive and gate them in the panel.** Rejected: it puts a product
  rule in a component, which §12 forbids, and it would leave `insertBody` and `removePlacement`
  willing to destroy a structural corner for any other caller — including a future one.
- **Make them non-deletable but keep `canFinish`/`canHandle`.** A defensible reading of §13.1 as
  literally written. Rejected against M4's acceptance criteria, and recorded above as the clause to
  revisit if the unfinished corner front looks wrong on screen.
- **Give the corner returns a `catalogEquivalentId` so a swap list still appears.** Rejected: §13.1
  is explicit that a corner is not a body a customer chooses.
- **Keep row 20 reachable by adding a 570 mm opening elsewhere in the seeded design.** Rejected as
  out of scope for M4 and as fixture invention: the seeded kitchen is a port of the supplier's
  geometry, not a test rig. Named here so M5 or a later phase can decide it deliberately.

## Consequences

- Selecting either corner return now yields a panel with no swap list, no delete, no finish, no
  handle and no width. §11 row 16 requires that the refusal **explain why**; because the panel now
  offers nothing, no refusal is generated, so the explanation has to be authored as a positive
  statement rather than emitted by a guard.

  **Resolved, same wave** (logic-review finding R2.4): `BodyDefinition` gained
  `structuralReason?: StructuralReason` — today the single value `"corner"` — declared once on the
  shared `STRUCTURAL_CORNER` shape and republished as `SelectionMeta.structuralReason`. When a body
  offers no sections and declares a reason, the panel renders a structural section carrying it.

  Two properties of that design are deliberate. The reason is **declared, not inferred from four
  false capability flags**: a body that offers nothing *and declares no reason* renders no
  explanation, so an entry that is silently mis-flagged stays visible as the catalogue gap it is
  rather than being papered over with generic copy. And the copy is keyed by reason, so a second
  structural case adds a sentence rather than a branch.
- Void derivation, column keys and spans are **unchanged**: `recomputeVoids` and `deriveColumns`
  read `frame` only, and the capability flags are carried through untouched. Verified by running
  both over `KITCHEN_L_DESIGN` before and after — same empty void list, same column map.
- §10's signature flow is unaffected. It runs on `p7`/`p24` in column `B|2.45` and never touches a
  corner.
- `hidesHandles` lands identically for `p9` and `p21`, since neither records a `handleMode`, so
  nothing renders differently in the scene today.
- **Open, carried:** whether §11 row 20 should regain a production route. Until it does, its two
  regression rows prove the engine, not the product.
