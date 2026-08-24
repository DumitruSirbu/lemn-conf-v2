# M3 — Insert, remove and swap

Status: planned. Depends on M2.
Reference: `DEVELOPMENT-SPEC.md` §5.1, §5.2, §5.3, §5.5, §6.2, §6.3, §7, §8, §12;
§11 rows 3–8, 14, 15, 16, 19, 20, 23.

## Goal

The three verbs that rearrange a kitchen — delete makes space, insert fills it, replace swaps in
place — with every guard enforced in the engine rather than in the UI, and every refusal carrying a
reason a person can read.

## Why here

§12 step 4. These verbs are the whole editing model (§13.1: "Replace is same-band; delete makes
space; insert offers what fits" — three verbs, each single-purpose, chosen because cross-band
replacement needs compatibility maths that never terminates cleanly). They must be correct before a
panel is built on top of them, or the panel's disabled states will encode the engine's bugs.

## Scope

In: the catalogue (`BODIES`); `remove()`; `insert(buildId)` for both the empty-slot and the
occupied-selection cases through one code path; `setFinish` and `setHandle`; the `meta` projection
that will drive the panel.

Out: width editing (M5), the panel itself (M4), price (M6).

## Work items

1. Define the catalogue from §7: the fourteen entries with their band, width flex (`'fit'` or a
   fixed set), height flex, and builder. Corner units are structural entries: no replace, no delete,
   never a width donor.
2. Implement `remove()`.
3. Implement `insert(buildId)` as one path serving both an empty slot and an occupied selection.
4. Implement `setFinish(key)` and `setHandle(mode)` as per-placement operations that record the
   choice.
5. Implement `describe(placement)` and the `meta` projection of §8 — everything the panel will
   later consume, including `sizes`, `minMm`, `growMm`, `donorSide`, `donorMm` and the capability
   flags. Nothing is added to `meta` that the panel could not derive from the selection.
6. Every command returns `{ok: true, …}` or `{ok: false, reason}`. **`reason` carries both a stable
   code and a rendered Romanian sentence** — not one or the other. The code is the public contract
   that tests and logic assert against, per `CONFIGURATION_MODEL.md`'s retained command contract
   ("codes and fields — not English messages — are the public contract"); the sentence is what the
   panel's rejection banner renders verbatim, per `DEVELOPMENT-SPEC.md` §8's `rejected` message and
   §9's requirement that the banner explain itself in ordinary language. A code with no sentence
   forces the UI to author product copy; a sentence with no code forces tests to match on prose.
   Neither is acceptable, and the tension between the two source documents resolves to "both", not to
   a choice.
7. Route successful commands through the persistence write path M2 established — coalesced, off the
   edit path, failure surfaced without reverting the edit. M3 adds mutations, so this is the phase
   where that path first carries real traffic.

## Acceptance criteria

Remove:

- Refuses when a void is selected, when the target is an accessory, or when `canDelete` is false.
- **Row 16.** A corner base offers no swap list and no delete, and its refusal explains why.
- **Row 15.** The hob resolves to its host cabinet and cannot be deleted at all. (It was once
  modelled as a module, offered six rows it could never satisfy, and deleting it destroyed it
  permanently.)
- On success: the body leaves the scene and the placement list, voids are recomputed, and the void
  covering the vacated frame becomes the selection.
- **Deletion is final.** No undo exists, and nothing in the interface implies one. Once a vacated
  opening has merged with a neighbour there is no single prior state to restore, which is why the
  span model and undo were judged irreconcilable.

Insert — band and fit guards, all enforced in the engine:

- The target band is derived from the slot: a slot at least 1.9 m tall targets `column`, a slot
  starting below 0.2 m targets `base`, otherwise `wall`.
- **Row 3.** A wall body is refused from a floor slot: it has no plinth and no worktop and would
  float as a box resting on the floor.
- **Row 4.** A base cabinet is refused from the top slot. **Only** a body whose band is `column` may
  exceed one level — the test is the band, never a height threshold. A 1800 mm freestanding fridge
  is full-height and must be accepted where an `h >= 1.9` test would refuse it.
- **Row 5.** A column into a 300 mm opening is refused, and the refusal names the millimetres.
- **Row 6.** The hood is neither offered for nor accepted into the 400 mm top slot; it is fixed at
  710 mm. Both halves are required — never offering it is the correct behaviour, and refusing it is
  the safety net.
- **Row 7.** A sink base **is allowed** into an 860 mm opening. Fit is judged on the carcass, matching
  the carcass mesh names, so the faucet is excluded. (It once measured 1220 mm because of the faucet
  and was refused from an opening it fits perfectly.)
- **Row 8.** Swapping a sink base for drawers produces no phantom void from the freed faucet height.
- **Row 20.** Inserting into a 570 mm opening builds a body of exactly 570 mm, with door count
  following the resulting width.
- A height-flexible body fills a cabinet-sized opening (0.9 m or less) and otherwise builds its
  nominal height. A 750 mm over-fridge slot gets a 750 mm unit, not a 700 mm unit with 50 mm of air;
  a cleared 2600 mm column does not produce a 2600 mm wall cabinet.
- Fit is re-checked against the built carcass after construction, and a mismatch is refused rather
  than rendered.
- Placement snaps to the lowest module line, column region start or span floor that fits. A wall
  unit dropped into a cleared column lands at 1500 mm, not flush on the worktop.
- **Row 19, for inserted bodies.** After insertion on wall A or wall B, the body's back face lies
  exactly on the wall plane (0.000). The plane is read from the room's wall meshes and the bounding
  box is measured after adding the group to the room — never derived from the previous occupant. (M2
  proves the same row for bodies loaded from a design; this phase proves it for bodies the customer
  inserts, which is the harder case because the opening's previous occupant is right there to be
  wrongly measured against.)
- **Row 14.** The dishwasher niche accepts only 450 and 600, and both build a real carcass.

Swap in place:

- Runs the identical path, with the current body's frame as the target opening. The old body is
  removed afterwards and the opening's height is left unchanged — an opening's size does not change
  because its contents did.
- Every catalogue row offered for an occupied body actually performs a swap. (The recorded defect: a
  void rewrite dropped the swap branch and every replace row silently did nothing.)
- **Row 23.** Choosing *Nișă frigider integrat* yields a body that stays that product, with that
  label and that price. Identity comes from the chosen catalogue id; it is never re-inferred from
  the mesh tree, which once produced a fridge housing labelled and priced as a pantry.
- **Row 24.** An unknown kind produces **no** replace section at all — no fallback set. A fallback
  once produced six guaranteed-refused rows for the hob.

Finish and handle:

- `setFinish` recolours the body's doors and records the choice; `setHandle` sets the handle mode,
  with `push` hiding the handles. Both are per placement.
- A top-row body ships push-to-open with its handles built and hidden, so `canHandle` stays true and
  the choice remains available.
- Recorded choices survive any rebuild of the body.

Surfaces:

- **Mobile (gate):** the signature flow of §10 runs end to end by touch at 390 × 844 — delete the
  fridge, delete the unit above it, watch the two openings merge into one 700 × 2600 opening with
  three level slots, fill base then middle then top, clear all three, insert the freestanding fridge,
  and get exactly one 750 mm slot above it. This phase may drive it through a temporary developer
  affordance if the panel is not yet built; the flow itself is the gate.
- **Shared:** every guard lives in the engine. A UI that forgot a rule still cannot produce an
  invalid state.

## Risks

- **Forking insert and swap.** Explicitly recorded as the cause of a silent, total failure of the
  replace feature. One path, always.
- **Re-inferring identity from geometry** because it is convenient for originals loaded from a
  preset. Originals may be identified by inspection; anything the customer chose must use the chosen
  id.
- **Deriving the wall plane from the previous occupant.** Two failed attempts are on record.
- Corner and hob widths are still fixed in geometry; parameterising them is later builder work and
  must not be faked by scaling a finished group.

## Verification

- Table-driven engine tests covering §11 rows 3–8, 14, 15, 16, 19, 20, 23, 24, each asserting the
  refusal reason as well as the refusal.
- A scripted signature-flow test at the domain level, then the same flow by real touch at the mobile
  viewport.
- Assertions that a swapped body's opening height is byte-identical before and after.
