# ADR 0047 — An open shelf's compartment count follows its clearance, not its row

Status: Accepted
Date: 2026-09-01
Type: Decision
Milestone: M5B — Manual UX remediation, wave 5B7

## Context

Report item 10 (`testing-reports/09-manual-ux-issues.md`): the open-shelf wall cabinet renders the
same number of shelves wherever it is placed. The owner wants it position-dependent — three in the
middle row, two on the top row — *"reasoning is that top-row vertical space is more limited"*.

What is true in the code: `OPEN_SHELF_INNER_SHELVES = 2`
(`packages/three-adapter/src/catalog-bodies.ts:22`), documented as *"an open shelf carries two inner
shelves whatever its height"*, passed literally to `kit.make.openShelf` at `catalog-bodies.ts:96-102`.
The builder (`packages/three-adapter/src/kitchen-parts.ts:1427-1459`) adds `shelf_top`,
`shelf_bottom` and `inner` interior boards at even spacing, so the customer sees **four boards and
three compartments** at every height.

## Decision

**The count is a function of the body's vertical clearance, not of which row it landed in.** A named
threshold in millimetres decides: above it, two interior boards (three compartments); at or below it,
one (two compartments).

**Clearance rather than row identity, and the difference is not pedantry.** The owner's own reasoning
is a statement about space — *"top-row vertical space is more limited"* — and row identity is only a
proxy for it. `LEVELS` (`packages/configurator-domain/src/void-engine.ts:13-17`) gives the middle row
700 mm and the top row 400 mm, so a threshold between them reproduces the owner's rule exactly today
**and keeps reproducing it** if a row moves. §13.3 item 4 already says `LEVELS` must become per-wall
data for arbitrary rooms; a rule keyed on "top row" would silently become wrong on the first room
whose top row is not 400 mm, and it would become wrong invisibly, which is the failure mode this
repository has recorded twice (ADR 0022, ADR 0028).

The height is already in hand: `CatalogBodySize.heightM` is what §5.2 planned for the opening
(`catalog-bodies.ts:24-30`). Nothing new is plumbed and no record is consulted, so this stays a pure
function of the size the domain asked for.

**The unit is compartments, and this record fixes the vocabulary.** The report says *3 shelves* and
the builder produces four boards. Counting boards, counting compartments and counting interior boards
are three different numbers, and the owner is describing what they see: three usable spaces in the
middle row, two on top. Everything below is stated in compartments.

## Alternatives considered

**Key on the row.** Rejected for the reason above: correct today, silently wrong the moment `LEVELS`
becomes data.

**Declare the count per catalogue entry.** Rejected. There is one open-shelf entry and the count is
not a property of the product — it is a property of the space it was built into, which is the same
argument ADR 0033 made for door count and ADR 0035 for width.

**Keep a fixed interior pitch and let the count fall out of it.** Attractive, and it is what a real
joiner does. Rejected for this wave as a bigger change than the report asks for: it would change the
middle row's spacing too, which nobody reported and the owner has not seen.

## Records swept before deciding, and how each is settled

| Record | What it says | Settled how |
| --- | --- | --- |
| [ADR 0033](0033-door-count-is-derived-from-width-not-declared.md) | A count that follows a dimension is **derived**, never declared by which catalogue arm the customer landed on. | **Corroborates and supplies the pattern.** Door count follows width; compartment count follows height. Same shape, same reason. |
| [ADR 0035](0035-width-is-a-bounded-stepper-not-a-menu-of-sizes.md) decision 4 | The one place a count flips is a named exported constant with boundary tests on each side. | **Followed.** `TWO_DOOR_MIN_WIDTH_MM` is the model; this threshold is declared the same way. |
| [ADR 0028](0028-wall-depth-is-derived-from-the-worktop.md) | Two constants agreeing by luck is the defect shape to avoid. | **Honoured.** One threshold, one caller, no second copy in the builder. |
| [ADR 0022](0022-seeded-entries-declare-their-catalogue-equivalent.md) | Inferring identity from measurements priced a fridge housing as a pantry. | **Not applicable but named**, because keying on row identity would be the inverse mistake: inferring a measurement from an identity. |
| `DEVELOPMENT-SPEC.md` §7, catalogue | Lists `open-shelf` with no shelf count. | **No conflict.** The spec never fixed a count; the literal in the adapter did. |
| `DEVELOPMENT-SPEC.md` §13.3 item 4 | `LEVELS` and the two wall planes are constants for this room and must become per-wall data. | **This is the record that decides the rule against it.** A clearance rule survives that change; a row rule does not. |
| `DEVELOPMENT-SPEC.md` §11 rows 1–4, 18 | Level and column arithmetic. | **No conflict.** Nothing here changes what a void is; only what is built into one. |

## Consequences

- **The seeded kitchen is unchanged.** `buildKitchen()` calls `openShelf(0.6, 0.33, 2)` with a
  literal (`kitchen-parts.ts:1728`), and it stays literal, so M1's 1e-6 m parity gate is untouched.
  The builder's `inner` parameter keeps its meaning and its default.
- **The threshold is the only product number here**, and moving it is a one-line product decision
  with two boundary tests to update.
- **An open shelf in a non-standard opening now varies**, which it did not before. Anything between
  the threshold and 700 mm gets three compartments; anything at or below gets two. That is the rule
  behaving, not drifting.
- **The interior pitch is still even**, so a two-compartment shelf is not a three-compartment shelf
  with a board removed — the remaining board re-centres.

## Correction, 2026-09-01 — the even spacing is of board centres, not of clear compartment heights

Adversarial QA on wave 5B7 measured the shipped geometry against this ADR's own vocabulary and found
a mismatch: "even spacing" above was written loosely enough to read as *equal compartments*, and the
builder does not deliver that. `openShelf`'s interior boards sit at `H·i/(N+1)` — even spacing of
board **centres** — so each **end** compartment loses half a board thickness that the interior ones
keep. Measured at the seeded parameters: at 400 mm (one interior board) the two compartments are
173/173 mm, equal, because there is only one end split by one board and no interior compartment to
compare it against. At 700 mm (two interior boards) they are 206.3 / **215.3** / 206.3 mm — a **9 mm**
shortfall on each end compartment against the middle one.

**This is not a defect and the geometry stands as shipped.** Three reasons, in order of weight:

1. **The owner's decision, 2026-09-01: fix the wording, keep the geometry.** Given the choice between
   re-pinning parity for an invisible 9 mm correction and correcting the record to describe what the
   geometry actually does, the owner chose the latter. This is a chosen outcome, not a forced one —
   changing the divisor was and remains available; the owner judged it not worth doing for 9 mm.
2. **It is not visible at the mobile viewport.** QA compared the 700 mm capture against the pinned
   reference and the compartment counts match; a 9 mm asymmetry across a shelf does not read on
   screen at that scale.
3. **It is inherited geometry, not new work, and changing it has a cost.** `openShelf`'s interior-board
   placement predates this ADR and this wave; wave 5B7 changed the interior board **count**, never the
   spacing formula. Its `heightM` at the seeded parameters is exactly what M1's 1e-6 m structural
   parity gate pins, so centring on clear compartments instead of board centres would move the seeded
   kitchen's geometry and require re-pinning that gate. This cost informed the owner's call above; it
   does not by itself decide the question, and if the parity gate is re-pinned for an unrelated reason
   in the future, that does not reopen this decision.

**What this corrects, precisely.** "Even spacing" in the Decision and Consequences sections above
means *board centres are evenly spaced*, not *clear compartment heights are equal*. The
**compartment count** stays exactly what this ADR decided — a function of clearance, two boards above
the threshold, one at or below it — that vocabulary is unchanged. Only the spacing claim is corrected.
Wave 5B7's acceptance criterion 4 is reworded to match, in
`docs/milestones/M5B-manual-ux-remediation.md`.
