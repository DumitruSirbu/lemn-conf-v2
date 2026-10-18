# ADR 0170 — The M1 to M3 acceptance criteria and work items that tests and the store adapter cite, recorded from the closed plans

Status: Accepted (as delivered: M1, M2 and M3 are closed; three claims below are dated as superseded or drifted, none struck)
Date: 2026-10-18
Type: Finding (recovered criteria; no behaviour changes)
Milestone: M1, M2, M3 (all archived in `docs/milestones/done/`); filed under ADR 0136 decision 3

**Why this record exists.** Five code comments cite an archived milestone plan for a criterion or work item
that no ADR records. The owner's rule is that a code comment cites an ADR, never a milestone plan, and
`docs/milestones/done/` is not to be read for guidance (`AGENTS.md`). This record carries the criteria the
comments need. Cite as `see ADR 0170 M3 work item 9`, `see ADR 0170 M1 geometry criteria`, and so on. Every
anchor starts with its milestone, because "work item 2" alone is ambiguous across three plans.

**Evidence tier.** **Doc-quoted** (quoted or faithfully condensed) from `docs/milestones/done/M1-scene-port.md`,
`M2-void-engine.md` and `M3-mutations.md`, read on 2026-10-18. Nothing was re-measured and no test count is
claimed. **Shipped:** M1's header reads *"DONE — closed 2026-08-25"*; M2's banner reads *"M2 is closed
(2026-08-25)"*; M3's banner reads *"M3 closed 2026-08-26"*. M2's own status text names two gates it left
unmet at the time (the restore drill and the mint trigger); neither is one this record carries. Where the
plan and the present repository disagree, a dated *Drift note* sits beside the criterion; no criterion was
edited.

## M1 geometry criteria

*Cited by:* `packages/three-adapter/tests/kitchen-parts.contract.test.ts:1` (*"The geometry acceptance
criteria of `docs/milestones/M1-scene-port.md`, asserted against the port directly rather than against the
reference"*). Only M1's *Geometry and anchors* list is carried; the comment cites no other part of M1's
criteria.

- Every builder returns a group whose origin is on the floor and horizontally centred, with +Y up, +Z the
  direction the fronts face and +X customer-right. `box(w,h,d,…,y)` treats `y` as the box bottom, never its
  centre.
- The derived planes hold exactly: carcass front `z = 0.280`; door front face `z = 0.289`, outer face
  `0.298`; worktop front `z = 0.330`; plinth front `z = 0.220`; worktop top `y = 0.820` and finished height
  `0.860`; wall band `1.500 → 2.200`; ceiling row `2.200 → 2.600`.
- The chamfer is 1.6 mm absolute on all twelve edges of every box and never proportional to size.
- A sink renders as a visible cavity: the worktop is cut into `countertop_front/back/side` around a `0.28 ×
  0.20` aperture **and** the carcass is an open frame with no top panel. A sink modelled correctly but sitting
  in a solid carcass or under an uncut slab fails this criterion.
- Appliance cavities are strictly smaller than the carcass interior (`W − 0.06` wide, depth ≤ 0.48, inset
  from the back panel); oven fronts sit proud by `+0.018` and microwave fronts by `+0.089` on Z. No two
  solids are coplanar or interpenetrating anywhere in the scene, and no z-fighting flicker appears at any
  camera preset.
- The two corner legs are two separate bodies. Each computes its plinth recess from its own depth only. The
  X-leg worktop spans world Z `[-0.010, 0.630]`, the return worktop butts it at `[0.630, 0.900]`, both at Y
  `[0.820, 0.860]`, with no interior overlap. The return leg's depth is passed in from the neighbour it
  meets, never hard-coded.
- Purchased parts keep fixed real-world sizes regardless of host width: sink `560 × 400 × 185`, oven `596 ×
  595 × 560`, microwave `596 × 380 × 420`, dishwasher `596 × 720 × 560`, cooktop `590 × 12 × 520`, fridge
  `700 × 1850 × 680`. Handle bars are capped at 190 mm horizontal and 210 mm vertical and do not stretch with
  the front.
- Every ceiling-row unit is push-to-open. Its handles are **built and hidden**, not omitted, so the choice
  can be turned back on later.
- Overhead doors carry the handle bar on the bottom edge at a 40 mm inset; drawers keep top bars and tall
  doors keep vertical bars.
- No gaps anywhere in the seeded scene: adjacent units share a face between runs, at the corner, above the
  fridge, and between the upper rows. Every unit sits fully on the floor slab.

**Why the contract suite exists beside the parity suite (M1 closing text).** `kitchen-parts.contract.test.ts`
*"asserts the real invariants (derived planes, chamfer measured off actual geometry vertices, corner-leg
recess independence, appliance cavity insets, fixed purchased-part sizes, handle caps, push-open
hidden-not-omitted handles) rather than existence/count checks"*; the parity suite proves "the port is the
same as the reference", the contract suite proves "the reference contract in SPEC.md actually holds", so a
change that drifts both files at once still fails.

> **Drift note, 2026-10-18 (doc-quoted, nothing struck).** M1's 2026-08-25 *Correction* seated six bodies
> flush in both `buildKitchen()` implementations after ADR 0005; the plan's "Boundaries" criterion that the
> reference files are not modified therefore stopped holding absolutely. That criterion is not in this
> record's scope; see [ADR 0005](0005-m2-row19-m1-wall-gap-finding.md).

## M2 work item 2 (the decomposition-parity proof)

*Cited by:* `packages/three-adapter/tests/kitchen-parts.decomposition.parity.test.ts:1` (*"Work item 2's
decomposition-parity proof"*).

**M2 work item 2 (doc-quoted).** *"Derive the runtime placement record … Then **decompose the M1 scene into
placements and prove the recomposition matches**: M1 renders `builders['kitchen-l']()` whole, and from here
bodies are mounted individually with a derived wall transform, per `ARCHITECTURE_PROPOSAL.md` §6.1 step 3.
That switch is the first opportunity to silently lose M1's verified fidelity, so it is proven, not
assumed."*

**M2 fidelity criteria carried forward from M1 (doc-quoted):**
- The scene composed from individual placements is geometrically identical to M1's whole-scene render. Every
  body's world position and rotation, and the mesh set under it, match what `builders['kitchen-l']()`
  produced, at the same `1e-6` m float epsilon M1's parity assertions use.
- **Row 19 applies from this phase on:** every mounted body's back face lies exactly on its wall plane
  (0.000) on both wall A and wall B, with the plane read from the room's wall meshes and the bounding box
  measured *after* the group is added to the room.
- No gaps appear between adjacent units, at the corner, above the fridge, or between the upper rows, where
  M1's scene had none. *"Losing face-sharing during decomposition is the specific regression this criterion
  exists to catch."*

**Shipped (doc-quoted).** M2's status text: wave 2A (work items 1 to 6) *"implemented and verified
2026-08-25 — domain schema, void engine, decomposition-parity proof, void mesh rendering, picking … store"*.

> **Drift note, 2026-10-18 (source-verified, nothing struck).** The test's own header says the two corner
> legs, carried as an unmatched gap from M2, were derived by [ADR 0025](0025-the-corner-base-legs-seat-on-the-l-joint.md),
> and that the assertion is now a **partition**: every non-shell child of the reference room is claimed
> exactly once. The plan's "mesh set … match" criterion is read through that.

## M3 work item 6 (parameterised builders) and the built-carcass re-check

*Cited by:* `packages/three-adapter/tests/catalog-bodies.test.ts:1` (*"M3 work item 6 … `DEVELOPMENT-SPEC.md`
§7's fourteen insertable entries, built at the size §5.2 planned for the opening"*).

**M3 work item 6 (doc-quoted).** *"Parameterised builders. `buildCatalogBody(kit, buildId, {widthM, heightM,
depthM})` covering the fifteen insertable entries, mapping onto `kit.make.*` exactly as §7's builder column
specifies (including `wallCabinet`'s `w > 0.45 ? 2 : 1` door count and its `min(d, 0.4)` depth clamp).
`buildDecomposedBody` is untouched and still serves the seeded ids."*

**The criteria the test's reason rests on (doc-quoted, M3 *Insert* criteria):**
- *Fit is re-checked against the **built** carcass after construction, through the probe, and a mismatch is
  refused rather than rendered.*
- **Row 20.** *Inserting into a 570 mm opening builds a body of exactly 570 mm, with door count following the
  resulting width — two doors at 570, since §7's wall-cabinet rule is `w > 0.45 ? 2 : 1`.*
- *The probe is **deterministic**: the same `(buildId, widthM, heightM, depthM)` yields the same carcass
  extent and the same seat offset on every call.*

> **Drift note, 2026-10-18 (nothing struck).** The plan says **fifteen** insertable entries (work item 1,
> work item 6, *Scope*); the test's header says **fourteen**. I did not establish which number the catalogue
> holds; this record quotes the plan's figure and flags the mismatch for the test's owner.
>
> **Not located:** the test says the "offered forever and refused forever" failure is *"the silent failure
> shape M3's Risks section names"*. M3's *Risks* list (read in full) has no such bullet; the nearest is
> *"Forking insert and swap … a silent, total failure of the replace feature"*. The built-size re-check
> criterion above is the criterion that exists.

## M3 work item 9 (store commands) and its criteria

*Cited by:* `apps/web/src/store/apply-command-result.ts:1` (*"The store's half of … work item 9: turn a
domain `CommandResult` into the exact state the store holds next … the two easiest invariants to break
(frozen columns, a selection that never dangles)"*).

**M3 work item 9 (doc-quoted).** *"Store commands. `remove`, `insert`, `setFinish`, `setHandle` as thin store
actions: call the domain command, and on success apply design + re-derived records + re-derived voids + the
new selection in **one** `set()`. Columns move to frozen load-time state, derived at store creation and in
`hydrate`, and never recomputed by a command."*

**Criteria behind the two invariants (doc-quoted):**
- **A rejected command** returns the exact same `Design` object it was given (`===`), `updatedAt` unchanged;
  the store snapshot is unchanged (asserted on the whole snapshot); `scheduleSave` is not called (asserted
  with a spy); the rejection reason surfaces as transient state, not as part of the design.
- **Selection never dangles:** after any mutation the store's selection references an existing placement or
  an existing void, or is null. A stale void id is the specific case — void ids are regenerated on every
  recompute.
- **Column stability:** columns are derived once at load; deleting the top unit of a column leaves `top`
  where it was; deleting a column's last member leaves the column in the map; after any command every
  placement's derived `col` is a key in the frozen column map (`COLUMN_MISMATCH` otherwise).
- **Boundaries:** commands are pure functions over `Design` in the domain package; the store action is a
  three-line adapter: call, apply, schedule. The domain performs no I/O and reads no clock.

> **Drift note, 2026-10-18 (doc-quoted from `SUPERSESSIONS.md`, nothing struck).** The sentence *"never
> recomputed by a command"* and the "columns are frozen at load" model were overtaken: the extent is frozen
> but live predicates are re-answered ([ADR 0011](0011-m3-insert-contract-gaps.md) Gap D), the map is built
> from the placements and the stored `emptyColumns` ([ADR 0044](0044-an-empty-space-is-recorded-in-the-design-document.md)),
> and a resize moves columns and a merge joins and splits them ([ADR 0031](0031-a-resize-moves-a-whole-column-into-adjacent-empty-space.md),
> [ADR 0046](0046-adjacent-empty-columns-merge-under-a-cap-and-an-insert-splits-its-column.md)). Identity is
> stable *within* a command. A reader must not revive the plan's sentence from this record.

## M3 Surfaces gate

*Cited by:* `apps/web/tests/e2e/signature-flow.e2e.spec.ts:17` (*"M3's own gate … 'Surfaces'"*).

**M3 *Surfaces* — Mobile (gate) (doc-quoted).** *"the signature flow of §10 runs end to end by touch at 390 ×
844 — delete the fridge, delete the unit above it, watch the two openings merge into one 700 × 2600 opening
with three level slots, fill base then middle then top, clear all three, insert the freestanding fridge, and
get exactly one 750 mm slot above it (**Row 1**, now proven through real mutations rather than fixtures).
Driven through the temporary developer affordance since the panel is not yet built; the flow itself is the
gate."*

**M3 *Surfaces* — M2's leftover (doc-quoted).** The named `test.skip` in `kitchen-stage.e2e.spec.ts`
(*"tapping an empty void slot selects it"*) is un-skipped and passes: delete a body by touch, tap the void it
left and confirm the selection is that void, and that a selected void is visually distinguishable from a
selected body without opening any panel.

**M3 *Surfaces* — Shared (doc-quoted).** *"every guard lives in the engine. A UI that forgot a rule still
cannot produce an invalid state. The engine tests run with no UI and no renderer beyond the probe."*

> **Drift note, 2026-10-18 (source-verified, nothing struck).** The gate's "temporary developer affordance"
> no longer exists: `signature-flow.e2e.spec.ts:16-20` says the flow now runs *"through §9's real panel,
> which is what M4 built and what replaced the temporary dev controls this file used to drive"*. The flow
> and the 390 × 844 touch requirement are the gate; the means of driving it is not.

## Consequences

- A comment that needs these criteria cites `ADR 0170` with a milestone-prefixed anchor: *M1 geometry
  criteria*, *M2 work item 2*, *M3 work item 6*, *M3 work item 9*, *M3 Surfaces gate*.
- The plans stay archived. Nothing here revives a design the plans abandoned; the three drift notes are the
  places a reader would otherwise be misled.
