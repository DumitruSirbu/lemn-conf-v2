# ADR 0182 — A corner cabinet that carries a handle takes the kitchen's handle and a handle choice of its own

Status: **Accepted** (2026-11-14), on the owner's answers to the M12 plan's §9 the same day [owner, relayed by the
coordinator]: no question touched this record, and none of its defaults was overturned. Proposed earlier the same day.
Owner feedback of 2026-11-14, items 1 and 2. Nothing is built.
Date: 2026-11-14
Type: Decision record (catalogue data, supersedes one clause of an earlier record)
Milestone: M12 — [`M12-owner-feedback-2026-11-14.md`](../milestones/M12-owner-feedback-2026-11-14.md), wave W1

**Evidence tiers.** **[owner]**: `docs/OWNER_FEEDBACK.md`, *Round 2026-11-14*, items 1 and 2. **[doc]**: a quotation
from a repository document with `file:line`. **[src]**: a reading of this repository's source at `c48992e8` plus the
uncommitted owner doc edits (no source file is modified in the tree). **[inf]**: the architect's reasoning, with what
would falsify it.

## Context

The owner: switching the handle in the global settings leaves the corner cabinets on the default handle; they should
take the global one (item 1). There is no handle choice on a corner cabinet; add it below the colour picker and "Preia
culoarea bucătăriei", like other cabinets (item 2) [owner]. The screenshot is the corner wall unit, "Dulap suspendat de
colț", Perete A, 900 × 700 mm [owner], which is `wall-corner-x-900` (kind `corner_wall_return`,
`kitchen-l-design.ts:575-586` [src]).

**The cause is one flag, set on purpose.** `STRUCTURAL_CORNER` declares `canHandle: false` for every corner body
(`packages/configurator-domain/src/fixtures/kitchen-l-design.ts:126-147`, the flag at `:143` [src]). The resolver answers
`undefined` for a body that takes no handle, "whatever the kitchen says" (`kitchen-handle/kitchen-handle.ts:41-49`
[src]), so the scene keeps the builder's steel bar (`three-adapter/src/scene-sync.ts:255-260` paints black only on a
resolved `"black"` [src]) and the panel renders no *Mâner* section (`apps/web/src/panel/panel-model.ts:558-559` [src]).
Both of the owner's observations are that one flag.

**It was a recorded reinterpretation, with its own revisit clause.** ADR 0021 decision 2 extended §13.1 to
`canFinish`/`canHandle` false "deliberately", and said: *"Recorded as a reinterpretation rather than a reading, so that
re-opening it is a decision and not a rediscovery … If that reads as a defect on screen, this clause is the thing to
revisit"* (`0021-corner-returns-are-structural-in-data.md:33-46` [doc]). ADR 0099 Amendment C already re-opened the
colour half on an owner report (`0099-…:458-478` [doc]). This record re-opens the handle half the same way.

**The spec supports it.** §9 item 5: *"Mâner — `canHandle` (body has handle meshes, visible or hidden)"*
(`DEVELOPMENT-SPEC.md:435` [doc]). §13.1 names replace, delete and width donation only (`:608` [doc]).

## Decision

1. **`canHandle` leaves `STRUCTURAL_CORNER` and is declared per corner row.** It is `true` on the five corner bodies
   that carry a bar and a door leaf: `base-corner-x-900` (`carriesHandles(1)`, one leaf), `wall-corner-return-570`,
   `wall-corner-return-570-top`, `wall-corner-x-900`, `wall-corner-x-900-top` (each `carriesHandles(1)`, one leaf)
   [src: `kitchen-l-design.ts:263-279`, `:446-459`, `:557-571`, `:575-599`]. It stays `false` on
   `base-corner-return-320`, which declares `NO_CABINET_HANDLES` and `NO_OPENING_FRONTS` (`:282-295` [src]): a body with
   nothing to grip offers no handle control (ADR 0027, *"`canHandle` implies a cabinet handle"*, quoted in ADR 0092
   `:255-262` [doc]).
2. **Nothing else of §13.1 moves.** A corner is still not replaceable, deletable or a width donor; `canReplace`,
   `canDelete`, `fixedWidth` and `structuralReason` stay in `STRUCTURAL_CORNER`.
3. **No new rule is written for corners.** Once the flag is true, the existing machinery applies unchanged: the resolver
   (own handle, else the kitchen's `handle`, else `DEFAULT_HANDLE`; on the top row the kitchen's `topRowHandle`, else
   `TOP_ROW_HANDLE`), `isPushToOpen`, the scene's visibility and black material, the panel's section order (§9: finish,
   then handle; `panel-model.ts:505-560` [src]), `setCabinetAppearance`'s refusal for a body that cannot take a handle
   (`commands/set-appearance.ts:156`, `:185` [src]), and the availability scan (`pricing/catalogue-availability.ts:152`
   [src]).

## What changes for a stored design, and what does not

- **Unchanged [inf, falsified by criterion W1-1 failing]:** a design whose kitchen has no `handle` and no
  `topRowHandle`, or `steel` and `push` respectively. Below the top row the corner resolved to nothing and was drawn
  steel; it now resolves to `steel` (`DEFAULT_HANDLE`). On the top row it was push by slot; it now resolves to `push`
  (`TOP_ROW_HANDLE`). Same bar, same visibility, same latch count.
- **Changed, and intended:** a kitchen handle of `black` paints the corner bars black; a kitchen handle of `push` hides
  the corner bars below the top row and bills a push-to-open latch per corner leaf there (ADR 0092 decision 3's single
  predicate, `push-to-open.ts:62-67` [src]); a top-row handle of `steel`/`black` shows the top-row corner's bar and bills
  no latch.
- **No handle type has a price of its own** [inf: no price-book row or `price-lines.ts` arm names a handle value; handles
  appear only as availability items, `catalogue-availability.ts:22`, `:189` — falsified by a handle-priced line]. So the
  price moves only through latches.
- **Sent totals do not move** (stored, ADR 0154); a kitchen's *current* estimate can move without the client editing it.
  The staff price row (ADR 0185 d5) words that case neutrally.

## Alternatives considered

- **Flip `canHandle` on the shared `STRUCTURAL_CORNER`.** Rejected: `base-corner-return-320` would render a *Mâner*
  section of chips that change nothing, the no-op the open-shelf comment warns about (`kitchen-l-design.ts:489-490`
  [src]).
- **Make corners follow the kitchen's handle but offer no own choice.** Rejected: the owner asked for both (item 2), and
  a following-only state needs a third resolver arm for one population.
- **Keep the flag and paint the corner by a special case in the scene.** Rejected: §12 forbids a product rule in the
  adapter, and the price and scene would then answer the handle differently (ADR 0092's reason for one predicate).

## Sweep (WORKFLOW, *Sweep the decision records before deciding*)

| Record | What it says | Settled how |
| --- | --- | --- |
| ADR 0021 d2 (2026-08-26) | Corners take `canFinish`/`canHandle` false; *"this clause is the thing to revisit"* | **Superseded for `canHandle`** on the five bodies above, by this record (owner request 2026-11-14). The colour half was already superseded by ADR 0099 Amendment C. Dated note owed on ADR 0021 |
| ADR 0099 Amendment C (2026-09-09) | Corners choose a colour | Precedent; unchanged |
| ADR 0092 d3 (`:233-262`) | `canHandle` disqualifies the recorded mode and nothing more; its measured examples are the corner returns | **Rule unchanged**; its examples become false for the five bodies. Dated note owed: the examples now hold only of `base-corner-return-320`-like rows and of a hand-edited mode on `fridge-free` |
| ADR 0110 Amendment O | The corner wall unit "takes the side returns' shape — structural, one handle" (`kitchen-l-design.ts:572-574`) | Unchanged; its `canHandle` follows the returns' rows |
| ADR 0120 row on ADR 0021 (`:773`) | "Kept, and deliberately not overturned" | That row concerned width and manufacturing; this record changes only `canHandle`. Dated note owed |
| ADR 0061, ADR 0027, ADR 0051 | A cabinet handle is declared; `canHandle` implies a cabinet handle | Consistent: every body flipped declares `carriesHandles(1)` |
| ADR 0168 | "No new tests" for M8C | M8C-only; M12 follows WORKFLOW's paired-test rule |

## Consequences

- Five domain tests that pin `canHandle: false` on a corner change with their reason recorded in the wave's test table:
  `tests/fixtures/kitchen-l-corner-base.test.ts:89`, `tests/commands/qa-c2s2-corner-unit.adversarial.test.ts:451`,
  `tests/generation/corner-wall-unit.test.ts:344`, `tests/hardware-mechanisms.test.ts:389`,
  `tests/pricing/hardware-tier-reconciliation.test.ts:237`; and `three-adapter/tests/push-to-open-seam.parity.test.ts:54`
  whose fixture comment names the flag [src, grep].
- Comments that describe the corner as handle-less (`push-to-open.ts:57-60`, `:89-93`) are rewritten in the same wave.
- Saved and sent kitchens re-render with the kitchen's handle on their corners, on the staff 3D view and the share view
  too, since the scene resolves at render.
- **The display projection changes, intended.** `wornHandleAt` gave the three corner bodies below the top row no handle
  (resolved `undefined`, not push-to-open off the top row); it now gives `steel` or the kitchen's handle
  (`queries/design-projection.ts:178-200` [src]). Their rows on "Verifică designul" and on the staff cabinet list gain a
  handle fact, and the review's golden hashes may move. A body's scene signature (`signBody`) also changes from `""` to
  its resolved handle; this does not change what is drawn.
- The capability-parity gate (`three-adapter/tests/catalog-capability-parity.test.ts:184-200`, corner pins `:229-290`)
  keeps holding `canHandle ⇒ cabinetHandles > 0`; its corner pins are updated, not exempted.
