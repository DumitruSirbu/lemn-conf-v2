# M3 — Insert, remove and swap

> **STATUS: IN PROGRESS — Waves 3A and 3B are done; 3C is next and dispatchable.** 12 work items
> across three waves. Wave 3A (domain commands) shipped in commit `69402d8` and produced
> `docs/decisions/0015-min-span-is-exclusive.md`. Wave 3B (adapter) completed the full
> `docs/WORKFLOW.md` cycle including the independent logic review ADR 0015 records as missing from
> 3A, and produced ADRs `0016` (the hood's carcass), `0017` (a catalogue minimum width) and `0018`
> (`frame.d` is a rear overhang, not a depth). Summary: `docs/STATUS.md`.
>
> **Wave 3C is Full review tier, with security review triggered** — it stands up the client write
> path, which touches persistence, share links and customer data.

Status: in progress (Waves 3A and 3B done 2026-08-25). Depends on M2 (both waves). Rewritten 2026-08-25
against the code M2 actually landed, replacing the earlier sketch — see "What changed from the
sketch" at the end.
Reference: `DEVELOPMENT-SPEC.md` §5.1, §5.2, §5.3, §5.5, §6.2, §6.3, §6.5, §7, §8, §9, §10, §12;
§11 rows 3–8, 14, 15, 16, 19, 20, 23, 24 (engine half);
`docs/decisions/0011-m3-insert-contract-gaps.md`;
`docs/decisions/0010-m3-client-write-path-unwired.md`;
`docs/decisions/0002-db-backed-shareable-persistence.md` (write path, decisions 13–17);
`docs/decisions/0003-design-reference-supersession.md` §1, §2, §3.

## Goal

The three verbs that rearrange a kitchen — delete makes space, insert fills it, replace swaps in
place — with every guard enforced in the engine rather than in the UI, and every refusal carrying
both a stable code and a reason a person can read.

## Why here

§12 step 4. These verbs are the whole editing model (§13.1: "Replace is same-band; delete makes
space; insert offers what fits" — three verbs, each single-purpose, chosen because cross-band
replacement needs compatibility maths that never terminates cleanly). They must be correct before a
panel is built on top of them, or the panel's disabled states will encode the engine's bugs.

M3 is also the first phase in which a customer can *change* anything, which makes it the first
phase where an unpersisted change is data loss. The client write path is therefore built here and
not deferred (see the write-path decision record).

## Scope

**In:**

- The insertable catalogue of §7 — fifteen entries with band, width flex, height flex, nominal
  height, width chip set and label — added beside M2's seeded decomposition entries.
- `removePlacement()`, `insertBody(buildId)` (one path serving both the empty-slot and the
  occupied-selection cases), `setFinish(key)`, `setHandle(mode)`.
- The command result contract: `{ok: true, …}` / `{ok: false, reason: {code, params, message}}`.
- The `BodyProbe` port and its Three.js implementation: build a body at `(w, h, d)`, measure its
  carcass, its full extent, and its wall-seat offset.
- A parameterised builder registry in the adapter for the fifteen catalogue entries.
- A scene that rebuilds from store state, with disposal.
- The `meta` projection and the fit-filtered offer list that M4's panel will consume — everything
  except the resize slack fields.
- The client write path: a `fetch`-backed `ConfigurationRepository`, the save-coalescer wiring, and
  mint-on-first-mutation.
- A temporary developer affordance for driving the three verbs before M4 exists.

**Out:**

- Width editing and the resize slack fields of `meta` — `minMm`, `growMm`, `donorSide`, `donorMm`
  — which need §5.4's neighbour scan and `canGive`. M5. `sizes` **is** delivered here: it is a
  per-catalogue-entry constant, and M4 renders chips from it before M5 wires them.
- The panel itself, its section order, its banner and its count lines. M4.
- Price. M6.
- Undo/redo. Retired, not deferred — see "Undo" below.
- Horizontal subdivision of an opening. Voids are vertical space only; a fixed-width body narrower
  than its opening leaves slack that is never offered. That is the model, not an omission.

## Three dispatch waves

Twelve work items across three unrelated subject areas — domain algebra, Three.js geometry, and the
browser write path — which exceeds `AGENTS.md`'s five-item / five-file dispatch guidance. Deliver as
three sequential waves, each with its own `docs/WORKFLOW.md` cycle:

- **Wave 3A — domain** (items 1–5). Pure functions over `Design`, no Three.js, no store. Gated by
  the insert/remove/swap/finish criteria below, all of which are testable headlessly.
- **Wave 3B — adapter** (items 6–8). The parameterised builders, the probe, and the rebuildable
  scene. Depends on 3A only for the `BodyProbe` interface and the catalogue shape, so it can start
  as soon as those two types are settled.
- **Wave 3C — web** (items 9–12). Store commands, write path, developer affordance, and the mobile
  gate. Depends on both.

The split is by reviewer, not by size: a reviewer checking a band gate against §5.2, a reviewer
checking a bounding box against §6.2, and a reviewer checking retry semantics against the
persistence record are not doing the same job. This is the same reasoning M2 used for waves 2A/2B.

## Work items

### Wave 3A — domain

1. **Extend the catalogue.** Add the fifteen §7 entries to `BodyDefinition`/`BodyCatalog` with
   `insertable: true`, `label`, `widthFlex` (`'fit'` or a fixed millimetre set), `heightFlex`,
   `nominalHeightMm`, `nominalDepthMm`, `sizesMm`. Mark M2's twenty seeded entries
   `insertable: false`; change nothing else about them. Add the named constants §5.2 and §2 rely on
   and that the codebase does not yet have: `FIT_TOLERANCE_M` (0.012 — hoisted out of
   `picking.ts`'s private `FRAME_FIT_TOLERANCE_M`, which then imports it), `MIN_WIDTH_M` (0.30),
   `COLUMN_SLOT_MIN_HEIGHT_M` (1.9), `FLOOR_SLOT_MAX_Y0_M` (0.2), `CABINET_SIZED_OPENING_MAX_M`
   (0.9), `HEIGHT_FLEX_MIN_OPENING_MM` (400), `TOP_ROW_Y0_M` (2.2). Corner units are structural
   entries: no replace, no delete, never a width donor.
2. **Define the command contract and the probe port.** `CommandResult` = `{ok: true, design,
   effect}` | `{ok: false, design, reason}`, where the failure branch returns the **exact original
   `Design` object** (`===`), carries no effect, and mutates nothing — the shape
   `CONFIGURATION_MODEL.md` §"Commands and queries" retains. `reason` carries a stable `code`, its
   `params`, **and** a rendered Romanian sentence: the code is what tests and logic assert against;
   the sentence is what §8's `rejected` message and §9's banner render verbatim. A code with no
   sentence forces the UI to author product copy; a sentence with no code forces tests to match on
   prose. Both, not a choice. Commands take a caller-supplied `occurredAt`; the domain reads no
   clock, and `occurredAt` is copied to `updatedAt` on success only. Declare the `BodyProbe`
   interface here.
3. **`removePlacement()`**, including the accessory cascade and the vacated-void resolution.
4. **`insertBody(buildId)`** as one path serving the empty slot and the occupied swap, with every
   §5.2 guard in the order the spec states them.
5. **`setFinish(key)` / `setHandle(mode)`**, plus `describeSelection()` (the `meta` projection of §8
   minus resize slack) and `offersFor()` (the §9 fit filter). Nothing enters `meta` that the panel
   could not derive from the selection.

### Wave 3B — adapter

6. **Parameterised builders.** `buildCatalogBody(kit, buildId, {widthM, heightM, depthM})` covering
   the fifteen insertable entries, mapping onto `kit.make.*` exactly as §7's builder column
   specifies (including `wallCabinet`'s `w > 0.45 ? 2 : 1` door count and its `min(d, 0.4)` depth
   clamp). `buildDecomposedBody` is untouched and still serves the seeded ids.
7. **`measureBuiltBody`** — the `BodyProbe` implementation. Carcass extent from meshes matching
   `/carcass_shell|side_left|side_right|panel_bottom|plinth|counter|fridge_body|hood_canopy|dw_body/`
   — **as shipped this pattern also matches `hood_chimney`, per ADR 0016**, without which §7's
   710 mm hood could never be inserted; full extent from the whole group; seat offset measured from
   the bounding box **after** the group is added to the room, with the wall plane read from a wall
   mesh of the room. Never derived from the previous occupant (§6.2, §13.2).

   **As shipped, the measuring path reads `wall_back` only.** A body is measured unrotated, and a
   wall-B body is the same body yawed by π/2, so its offset is unchanged; the two planes coincide at
   the room's corner, and `room-transforms.ts` hardcodes that same coupling. This is documented, not
   endorsed — an adversarial test asserts the two planes are equal, so the day wall B moves the
   suite says so before §11 row 19 does.
8. **A rebuildable scene.** `kitchen-stage.tsx`'s `useMemo(…, [])` becomes a keyed
   mount/unmount driven by store state: add bodies that appeared, remove and **dispose** bodies and
   void meshes that vanished, leave untouched bodies untouched. Apply the top-row push-open default
   by slot (`y0 >= TOP_ROW_Y0_M`, handles built and hidden), per the band decision in the
   contract-gaps record.

### Wave 3C — web

9. **Store commands.** `remove`, `insert`, `setFinish`, `setHandle` as thin store actions: call the
   domain command, and on success apply design + re-derived records + re-derived voids + the new
   selection in **one** `set()`. Columns move to frozen load-time state, derived at store creation
   and in `hydrate`, and never recomputed by a command.
10. **The client write path.** A `fetch`-backed `ConfigurationRepository` (`POST /api/designs` to
    mint, `PUT /api/designs/[id]` to update, non-2xx rejects), one `createSaveCoalescer` instance
    wired to `designId` / `applySavedId` / `setSaveStatus`, and `scheduleSave` called after — never
    before, never instead of — the store has applied the edit.
11. **A temporary developer affordance** for driving remove/insert/finish/handle from the selection
    before M4's panel exists. Explicitly temporary, behind a name that says so, removed by M4.
12. **The mobile gate and M2's leftover.** Un-skip
    `apps/web/tests/e2e/kitchen-stage.e2e.spec.ts`'s named `test.skip` ("tapping an empty void slot
    selects it — UNVERIFIABLE with the current seeded design") — M3 creates voids, so it becomes
    verifiable — and drive the §10 signature flow end to end by touch at 390 × 844.

## Acceptance criteria

### Remove — §5.1, §11 rows 15, 16

- Refuses when a void is selected, when the target is an accessory, or when `canDelete` is false.
  Each refusal carries its own code, not a shared generic one.
- **Row 16.** A corner base offers no swap list and no delete, and its refusal explains why.
- **Row 15.** The hob resolves to its host cabinet and cannot be deleted at all. (It was once
  modelled as a module, offered six rows it could never satisfy, and deleting it destroyed it
  permanently.)
- On success the body leaves the placement list, voids are recomputed, and **the void covering the
  vacated frame becomes the selection**. That void is found by geometry — same column, its
  `[y0, y0+h]` containing the vacated frame's `y0` — never by a remembered id: void ids are
  regenerated on every recompute and a merge changes them.
- **Deleting a host also deletes the accessories it carried**, in the same command and the same
  result. Deleting `p2` (`base-drawer2-600`) removes `p3` (`cooktop-600`) with it. Afterwards no
  placement exists whose host cannot be resolved, and `resolveHostPlacementId` is unreachable in its
  throwing branch. **What must not happen:** a hob left hanging over the void where its cabinet was,
  or a tap on an orphaned accessory throwing out of the pointer handler.
- **Deletion is final.** No undo exists, and nothing in the interface implies one. Once a vacated
  opening has merged with a neighbour there is no single prior state to restore, which is why the
  span model and undo were judged irreconcilable.

### Insert — band and fit guards, all enforced in the engine

- The target band is derived from the slot: a slot at least 1.9 m tall targets `column`, a slot
  starting below 0.2 m targets `base`, otherwise `wall`. Bands are compared **normalised**, with the
  seeded `top` band normalising to `wall` — otherwise a top-row body is refused from its own frame
  on a swap. See the contract-gaps record, Gap C.
- **Row 3.** A wall body is refused from a floor slot: it has no plinth and no worktop and would
  float as a box resting on the floor.
- **Row 4.** A base cabinet is refused from the top slot. **Only** a body whose band is `column` may
  exceed one level — the test is the band, never a height threshold. A 1800 mm freestanding fridge
  is full-height and must be accepted where an `h >= 1.9` test would refuse it.
- **Row 5.** A column into a 300 mm opening is refused, and the refusal's sentence names the
  millimetres while its code carries them as `params` (`requiredMm`, `availableMm`).
- **Row 6.** The hood is neither offered for nor accepted into the 400 mm top slot; it is fixed at
  710 mm. Both halves are required — never offering it is the correct behaviour, and refusing it is
  the safety net. The offer list and the guard are asserted separately, so passing one cannot mask
  the other.
- **Row 7.** A sink base **is allowed** into an 860 mm opening. Fit is judged on the carcass,
  matching the carcass mesh names, so the faucet is excluded. (It once measured 1220 mm because of
  the faucet and was refused from an opening it fits perfectly.)
- **Row 8.** Swapping a sink base for drawers produces no phantom void from the freed faucet height:
  `recomputeVoids()` returns a set **equal** to the set before the swap, not merely one without an
  obviously wrong entry.
- **Row 20.** Inserting into a 570 mm opening builds a body of exactly 570 mm, with door count
  following the resulting width — two doors at 570, since §7's wall-cabinet rule is
  `w > 0.45 ? 2 : 1`.
- A height-flexible body fills a cabinet-sized opening (0.9 m or less) and otherwise builds its
  nominal height. A 750 mm over-fridge slot gets a 750 mm unit, not a 700 mm unit with 50 mm of air;
  a cleared 2600 mm column does not produce a 2600 mm wall cabinet.
- Fit is re-checked against the **built** carcass after construction, through the probe, and a
  mismatch is refused rather than rendered.
- Placement snaps to the lowest module line, column region start or span floor that fits. A wall
  unit dropped into a cleared column lands at 1500 mm, not flush on the worktop. When no candidate
  fits, the command refuses; it never falls back to the raw span floor.
- **Row 19, for inserted bodies.** After insertion on wall A or wall B, the body's back face lies
  exactly on the wall plane (0.000), asserted at the same 1e-6 m epsilon M1's parity suite uses. The
  plane is read from the room's wall meshes and the bounding box is measured after adding the group
  to the room — never derived from the previous occupant. (M2 proves this row for bodies loaded from
  a design; this phase proves it for bodies the customer inserts, which is the harder case because
  the opening's previous occupant is right there to be wrongly measured against.)
- The probe is **deterministic**: the same `(buildId, widthM, heightM, depthM)` yields the same
  carcass extent and the same seat offset on every call, so a reloaded design reproduces the exact
  scene. A design saved after an insert and reloaded produces a byte-equal canonical serialisation
  and an identical derived void set.
- **Row 14.** The dishwasher niche accepts only 450 and 600, and both build a real carcass.
- The new placement's id is derived from the design (`n0`, `n1`, … — the next free index), not from
  a clock or a random source, so the same command on the same design yields the same document.
- Widths and heights written to the design are integer millimetres. A value that does not round to
  an integer within a micrometre is a rejection, not a rounding.

### Column stability — §3.2, and the contract gap it closes

- **Columns are derived once at load and never recomputed by a command.** Deleting the top unit of a
  column must leave `top` where it was, so the freed 400 mm becomes a void; deleting a column's last
  member must leave the column in the map, so the cleared run is selectable. **What must not
  happen:** a delete that produces no void because the column shrank to fit what is left.
- Every mutation preserves column membership: after any command, every placement's derived `col` is
  a key in the frozen column map, and an inserted placement's `col` equals the target void's `col`.
  A derivation that would not satisfy this is refused (`COLUMN_MISMATCH`), never placed.
- The along-wall coordinate is taken from the void (`x` on wall A, `z` on wall B) and the
  wall-normal coordinate from the **body's own** measured seat, not from the void's `x`/`z` pair.
  On wall B those two are different numbers, and using the void's `x` would seat every insert at the
  previous occupant's depth — the §6.2 defect, rediscovered by a different route.

### Swap in place — §5.3, §11 rows 8, 23, 24

- Runs the identical code path, with the current body's frame as the target opening. The old body is
  removed afterwards and the opening's height is left **unchanged** — an opening's size does not
  change because its contents did. Asserted as an exact equality of the frame height before and
  after, not a tolerance.
- Every catalogue row offered for an occupied body actually performs a swap. (The recorded defect: a
  void rewrite dropped the swap branch and every replace row silently did nothing.) The test
  enumerates the offer list and executes every row, rather than sampling one.
- **Row 23.** Choosing *Nișă frigider integrat* yields a body that stays that product, with that
  label and that price. Identity comes from the chosen catalogue id; it is never re-inferred from
  the mesh tree, which once produced a fridge housing labelled and priced as a pantry.
- **Row 24, engine half.** An unknown kind produces **no** offer list at all — an empty list, never
  a fallback set. A fallback once produced six guaranteed-refused rows for the hob. M4 owns the
  rendering half (no section at all).
- A swap preserves the placement's recorded `finish` and `handle` where the incoming body supports
  them, and drops them where it does not (an open shelf has no doors). Choice beats default;
  default beats nothing.

### Rejection — what a refused command must leave behind

- A rejected command returns the **exact same `Design` object** it was given (`===`), with
  `updatedAt` unchanged.
- A rejected command changes no store state: the same records, the same voids, the same selection,
  the same `designId`. Asserted by comparing the whole store snapshot, not selected fields.
- **A failed command persists nothing.** `scheduleSave` is not called. Asserted with a spy, because
  the failure mode is invisible otherwise.
- The rejection reason is the only thing that surfaces, and it surfaces as transient state, not as
  part of the design.

### Finish and handle — §5.5, §6.5

- `setFinish` records the choice and recolours that body's doors; `setHandle` records the mode, with
  `push` hiding the handles. Both are per placement, never global.
- A top-row body ships push-to-open with its handles **built and hidden**, so `canHandle` stays true
  and the choice remains available. The default is decided by the slot (`y0 >= 2.2`), not by the
  body's catalogue band.
- Recorded choices survive any rebuild of the body, including the scene rebuild that follows an
  unrelated mutation elsewhere in the kitchen.
- `setFinish` on a body with no doors, and `setHandle` on a body with no handle meshes, are
  refusals with their own codes — not silent no-ops.

### The write path — persistence decisions 13–17

- **No user interaction blocks on a write.** A command applies to the store and the scene
  immediately; `scheduleSave` is called after the state is applied and is never awaited.
- The first successful mutation on an unminted design mints exactly **one** row, even when several
  commands are issued in a burst before the mint resolves. A second row would silently fork the
  design.
- A failed write never reverts the edit and is never silent: `saveStatus` becomes `error` and the
  write retries. M3 exposes the status and nothing more — which surface communicates it stays M4's
  open question, and M3 must not invent a banner M4 would have to remove.
- The final state always lands. A burst of commands produces one save of the last state; dropping
  intermediate states is expected, dropping or reordering the last one is a defect.
- A design that has never been written successfully presents no shareable link.

### Scene — what the rebuild must not break

- After a mutation the scene shows exactly the bodies in the design and exactly the derived voids:
  no ghost of a removed body, no stale void mesh, no duplicate of a swapped body.
- Removed bodies and void meshes are **disposed**. Repeating the signature flow ten times does not
  grow `renderer.info.memory.geometries` monotonically. §4's own pseudocode opens with "dispose all
  void meshes"; a leak here is invisible until a phone runs out of memory mid-session.
- A body that did not change is not rebuilt. Rebuilding everything on every mutation would discard
  the applied finish and handle state and re-run the wall seating for bodies that were already
  seated.
- Selection never dangles: after any mutation the store's selection references an existing placement
  or an existing void, or is null. A stale void id is the specific case — void ids are regenerated
  on every recompute.

### Surfaces

- **Mobile (gate):** the signature flow of §10 runs end to end by touch at 390 × 844 — delete the
  fridge, delete the unit above it, watch the two openings merge into one 700 × 2600 opening with
  three level slots, fill base then middle then top, clear all three, insert the freestanding
  fridge, and get exactly one 750 mm slot above it (**Row 1**, now proven through real mutations
  rather than fixtures). Driven through the temporary developer affordance since the panel is not
  yet built; the flow itself is the gate.
- **M2's leftover, claimed by work item 12.** `kitchen-stage.e2e.spec.ts`'s named `test.skip`
  ("tapping an empty void slot selects it") is un-skipped and passes: delete a body by touch, then
  tap the void it left and confirm the selection is that void, and that a selected void is visually
  distinguishable from a selected body without opening any panel. This closes the one M2 acceptance
  case that was honestly recorded as unverifiable rather than faked.
- **Shared:** every guard lives in the engine. A UI that forgot a rule still cannot produce an
  invalid state. The engine tests run with no UI and no renderer beyond the probe.

### Boundaries

- Commands are **pure functions over `Design` in the domain package**, not store actions. The store
  action is a three-line adapter: call, apply, schedule. This is what `eslint.config.mjs`'s
  `no-restricted-imports` block for `packages/configurator-domain/**` requires in practice — a
  command that lived in the store could not be tested without React, and §12's "no product logic in
  components" plus §10.1's "domain: one module, no viewport awareness whatsoever" both point the
  same way.
- The one thing a command cannot do purely — measure a built body — enters through the `BodyProbe`
  interface, declared in the domain and implemented in the adapter. The domain gains no import; the
  fake probe in the domain's own tests is what proves the port is honest.
- The domain performs no I/O and reads no clock. `occurredAt` is supplied by the caller.
- Voids remain derived and are never authored, never persisted, never an input to a command other
  than as the selected target.

## Risks

- **Forking insert and swap.** Explicitly recorded as the cause of a silent, total failure of the
  replace feature. One path, always. The "execute every offered row" criterion exists because the
  failure was silent.
- **Recomputing columns after a mutation.** The most likely single defect in this phase, because the
  code that does it is already written and currently correct (`deriveGeometry`). The symptom is
  "delete does nothing", which reads as a delete bug rather than a column bug. Pinned by the column
  stability criteria above.
- **Re-inferring identity from geometry** because it is convenient. Every placement in this codebase
  carries an explicit `buildId`, so there is no reason to; the risk is a helper written for M5's
  donor lookup reintroducing it.
- **Deriving the wall plane from the previous occupant.** Two failed attempts are on record, and the
  wall-B `void.x` case above is a third route to the same defect.
- **Leaking geometry on rebuild.** New in this phase: M2's scene was built once and never torn down,
  so no disposal path has ever been exercised.
- Corner and hob widths are still fixed in geometry; parameterising them is later builder work and
  must not be faked by scaling a finished group.
- The temporary developer affordance becoming permanent. It is named as temporary and M4 owns its
  removal.

## Open questions

- **The Romanian sentences for the refusal codes are authored in this phase**, ahead of M4's copy
  work. They live in `apps/web/src/content/ro.ts`'s successor for domain copy — or, if the reason
  sentence must be rendered by a domain-level function, in the domain with the same review. Which
  side owns the string table is a real question; what is not a question is that both the code and
  the sentence exist from the first command.
- §13.3 open question 1 — whether an occupied body's swap set should be the hand-authored per-kind
  set or the fit-filtered catalogue — is **not** settled here. M3 implements the fit filter for
  voids (§9) and the band-scoped set for occupied bodies (§9), exactly as specified, and leaves the
  unification question to M4 where it becomes visible.
- Click reachability of placements occluded from every fixed camera (§6.4) is carried forward
  unchanged, and must not be solved with a cabinet-list side panel.

## Verification

- Table-driven engine tests covering §11 rows 3–8, 14, 15, 16, 20, 23, 24, each asserting the
  refusal **code** and the presence of a non-empty sentence, not only that a refusal occurred.
- Row 19 for inserts, proven in the adapter with a real Three.js scene: insert on wall A and wall B,
  measure the back face after mounting, assert 0.000 at 1e-6 m.
- A scripted signature-flow test at the domain level (Rows 1, 17, 18 re-proven through real
  mutations rather than fixtures), then the same flow by real touch at 390 × 844.
- A rejection sweep: every refusal path asserted to return the identical `Design` object, leave the
  store snapshot unchanged, and call `scheduleSave` zero times.
- A persistence round trip through a mutation: mutate, save, reload by link, assert an identical
  canonical serialisation and an identical derived void set.
- Property-style sweeps over the insert guard: for random valid (slot, catalogue entry) pairs, an
  accepted insert never overlaps an existing placement, never exceeds the column's `top`, and never
  produces a placement outside the frozen column map.
- A disposal check: repeat the signature flow ten times and assert geometry/material counts return
  to their baseline.

## What changed from the sketch

The previous version of this document was written before M2's code existed. Five of its assumptions
did not survive contact with what landed, and each is recorded as a dated decision rather than
silently corrected:

1. The catalogue it describes (§7's fifteen parameterised entries) is not the catalogue M2 shipped
   (twenty concrete decomposition instances). Both now exist in one map, split by `insertable` —
   contract-gaps record, Gap A.
2. An inserted body's wall-seat offset cannot be looked up from a per-`buildId` constant; it must be
   measured. This adds the `BodyProbe` port and an optional `seatDepthMm` on `CabinetBody` — Gap B.
3. The seeded `band: 'top'` is refused by §5.2's own band gate, including from its own frame on a
   swap. Bands are compared normalised, with `top` ≡ `wall` — Gap C.
4. Columns are recomputed on every derivation in the shipped store, which contradicts §3.2 and M2's
   own work item 3 the moment a mutation exists — Gap D.
5. Deleting a host orphans its accessory, and `resolveHostPlacementId` then throws out of the
   pointer handler. `remove` cascades — Gap E.

Separately, the sketch's work item 7 assumed the persistence write path was already carrying traffic
and M3 would add to it. It has no production caller at all: `createSaveCoalescer` is constructed
only in its own test, and no client mints a design. M3 stands the path up — see
`docs/decisions/0010-m3-client-write-path-unwired.md`.

## Undo

Not deferred — **retired**, by two recorded decisions
(`docs/decisions/0003-design-reference-supersession.md` §2, and `DEVELOPMENT-SPEC.md` §5.1 and
§13.1), because a void may have merged with its neighbours since an operation, so there is no single
prior state to restore. The span model was judged worth more than undo.

Recommendation: keep it retired, and treat this as the phase that must not accidentally re-open it.
Nothing in M3 may imply reversibility — no "are you sure, you can undo this" copy, no command
history retained in the store, and no snapshot kept "in case". The one thing M3 *should* do is make
the finality legible: deletion is immediate and visible, and the customer's recovery route is to
insert something back, which the same phase makes possible.
