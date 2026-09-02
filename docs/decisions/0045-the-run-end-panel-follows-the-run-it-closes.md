# ADR 0045 — The run-end panel follows the run it closes, and hides when there is no run

Status: Accepted
Date: 2026-09-01
Type: Decision
Milestone: M5B — Manual UX remediation, wave 5B3

## Context

Report item 1 (`testing-reports/09-manual-ux-issues.md`): shrinking a base cabinet leaves an oak
panel *"in its original place instead of following the cabinet as it shrinks"* — a floating panel
detached from the run. The reporter guessed it was the cabinet's own side panel and suggested
deleting it.

It is not a side panel. It is `end_panel_right`, the finished panel that closes the right end of
wall A's base run: `box(TH, 0.82, 0.6, M.oak, "end_panel_right")` placed at `x = 3.51`
(`packages/three-adapter/src/kitchen-parts.ts:1700-1707`) — 10 mm right of the seeded run's right
edge (3.20 + 0.60/2 = 3.50), **baked at build time**. See the 2026-09-01 correction below: the
18 mm slab sits 1 mm proud of the carcass, not centred on it. It is one of the five names in the
shell manifest
(`packages/three-adapter/src/kitchen-shell.ts:9-14`), so `syncSolidBodies` never sees it: it is
shell, not a customer body, and nothing recomputes its position.

It is also part of the product model rather than scene dressing: `end_panel` is a declared
`layoutRole` in `docs/CONFIGURATION_MODEL.md:116` and `docs/ARCHITECTURE_PROPOSAL.md:200` (line
number corrected 2026-09-02 after that file's dead §4.3/§4.4 bodies were trimmed beneath their own
superseded banners; the cited text itself is unchanged).

## Decision

**The panel stays, and it follows.** Owner, 2026-09-01, reversing an earlier *"delete it"*: the panel
should *"follow the cabinets during resizing… and if cabinet is removed (the right one) put the
panel on the right of the remained cabinet if possible"*. It is hidden when the wall has no base
cabinets, and shown again when one returns.

**Its X and its visibility are derived on every derivation. Its existence is not.** The panel remains
a fixed entry in the shell manifest: no record creates it and no record removes it. What is derived
is `position.x`, from the right-most wall-A `band === 'base'` placement's right edge, and `visible`,
from whether any such placement exists.

**What is on screen governs.** This overrides the conserved-run reading, and the override is the
substance of the decision rather than a detail of it. [ADR 0031](0031-a-resize-moves-a-whole-column-into-adjacent-empty-space.md)
conserves a run's total — the outer edges hold and the boundary absorbs the delta — so on that
reading the space a shrink vacates still *belongs* to the run and the panel should hold the run's
nominal end. The owner's rule is the opposite: the panel closes **the last cabinet**, not the run's
bookkeeping extent. A panel standing 150 mm away from the cabinet it finishes is wrong on screen
whatever the arithmetic says, and the customer is looking at the screen.

## The `db9c402` question, and why this is narrower

Commit `db9c402` (*"fix(scene): make kitchen shell state independent"*, SCENE-001) made the shell
independent of the loaded design because a shell that inferred its **membership** from placement
records could reconstruct a body the customer had deleted, as an untagged, unselectable ghost.
`buildKitchenShell`'s comment states the rule: customer bodies are *"removed from a fixed shell
manifest, never inferred from current placement records"*.

Deriving a **seat** is narrower than the membership inference that commit removed, and the
difference is checkable rather than rhetorical:

1. The manifest is untouched. The set of shell children is still a literal, so nothing a record says
   can add or remove one.
2. A hidden panel is not a resurrected body. `db9c402`'s failure mode was a *body* outliving its own
   deletion; `visible = false` on a panel that was always shell cannot express that.
3. The panel carries no `placementId` and is not pickable (§6.1), before or after.

**It is still a re-crossing of that seam, and it is treated as one.** The wave's tier is Full rather
than Light for this reason alone, and its acceptance criteria carry `db9c402`'s own anti-invariant
as a test: after deleting every wall-A base placement, the scene must contain no mesh tagged with a
removed `placementId`, and a design **loaded** with zero base placements must render the same scene
as one that **reached** that state by deletion. One document, one picture — which is the invariant
ADR 0011's `hasFullHeightUnder` correction established for the domain and this applies to the shell.

## Alternatives considered

**Delete the panel.** The owner's earlier position, reversed on 2026-09-01. Recorded because it was
a live option: it is the only change with no derivation at all. Rejected by the owner — the panel is
a real finished end, and a run that stops in raw carcass is not a product.

**Make it a customer body.** Rejected. It would then be selectable, deletable and offerable, and
`layoutRole: end_panel` is not a cabinet; it would also put it under `syncSolidBodies`, which is
where `db9c402`'s ghost lived.

**Recompute it only on resize.** Rejected: delete and insert move the run's end too, and the report
was written from a resize only because that is what the owner happened to do first.

## Records swept before deciding, and how each is settled

| Record | What it says | Settled how |
| --- | --- | --- |
| `db9c402` / SCENE-001 (`docs/STATUS.md`, adversarial remediation) | The shell must not reconstruct a deleted placement; shell membership is a fixed manifest, never inferred. | **Not superseded, and deliberately not stretched.** Membership stays a manifest. Only a seat and a visibility flag are derived, and the commit's anti-invariant becomes a test in this wave. |
| [ADR 0031](0031-a-resize-moves-a-whole-column-into-adjacent-empty-space.md) | A resize conserves the run total; the outer edge away from the empty space holds. | **Overridden for this panel only, by the owner.** ADR 0031's arithmetic is unchanged — it governs where the *cabinets* go. What changes is that the end panel is no longer treated as sitting on the run's nominal outer edge. |
| [ADR 0043](0043-an-empty-space-of-any-width-is-a-legal-state.md) | A gap of any width is legal. | **Corroborates.** It is what makes a detached panel ordinary: every legal gap at the end of a run is a position the panel must follow to. |
| `DEVELOPMENT-SPEC.md` §6.1 picking | Solids before voids; lines excluded. | **No conflict.** The panel is not a solid body with a `placementId` and never enters picking. |
| `DEVELOPMENT-SPEC.md` §11 row 19 | Back face exactly on the wall plane, with two named exceptions. | **No conflict.** The panel's seat on z is unchanged; only its along-wall X moves. |
| `docs/CONFIGURATION_MODEL.md:116`, `docs/ARCHITECTURE_PROPOSAL.md:200` (renumbered 2026-09-02) | `end_panel` is a declared `layoutRole`. | **Corroborates.** The panel is product model, which is why deleting it was the wrong fix. |

## Consequences

- **The shell gains its first derived property.** It is one number and one boolean, and the manifest
  is still a literal — but the seam is open now and the next thing to reach for it must justify
  itself against `db9c402` in the same way.
- **A visible end panel is now evidence about the design**, which it was not before. Nobody may read
  more from it than that: it says nothing about which cabinet stands there.
- **The seeded kitchen is unchanged.** At the seeded design the panel derives x = 3.51, and M1's
  1e-6 m parity gate asserts it.
- **Wall B has no run-end panel and gains none here.** The seeded scene builds one panel, on wall A.
  Whether wall B's tall run wants one is a product question this record does not open.

## Correction, 2026-09-01

The Context section's arithmetic was wrong: it derived the baked `x = 3.51` as
`3.20 + 0.60/2 + TH/2`, i.e. the panel centred on the run's right edge with `TH/2` (9 mm) of
overhang. That formula does not reproduce the shipped number — it evaluates to 3.509, not 3.51 —
and, more to the point, it describes the wrong geometry. The shipped reference room places
`end_panel_right` **10 mm** right of the run's right edge (3.20 + 0.60/2 = 3.50), so the 18 mm
slab sits 1 mm proud of the carcass, not centred on it.

This was caught during wave 5B3's implementation, where it mattered rather than being cosmetic:
the wave replaced the baked `x` with a derivation, and building that derivation from this record's
`TH/2` formula would have moved the seeded panel by 1 mm, failing both the wave's acceptance
criterion 6 and M1's 1e-6 m parity gate. The implementer used the measured 10 mm instead —
`RUN_END_PANEL_EDGE_OFFSET_M = 0.01` in `packages/three-adapter/src/kitchen-parts.ts`, documented
at its declaration in the same posture as the existing `BASE_FRONT_OVERHANG_MM` 40-vs-39 note.

The shipped `x = 3.51` is the authority here, not the formula: M1's parity gate pins it to 1e-6 m,
and the formula was a reconstruction that never matched it. Nothing else in this record depends on
the wrong arithmetic — the Decision, the `db9c402` analysis, the records swept, and the
Consequences section all cite `x = 3.51` as a measured fact, not as something derived from
`TH/2`.
