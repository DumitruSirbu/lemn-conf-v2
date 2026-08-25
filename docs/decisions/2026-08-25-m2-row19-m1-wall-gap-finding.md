# 2026-08-25 — M1's `buildKitchen()` seats 6 bodies 10–20mm proud of the wall plane

## Finding

While proving Wave 2A's decomposition-parity (packages B2/B3/B4), the implementer found that six
bodies in the existing, already-shipped M1 whole-scene render — `p0`, `p1`, `p2`, `p4` (10mm) and
`p5`, `p6` (20mm), the base row plus the two tall units — do not sit flush on the wall plane.
`buildKitchen()` places them at round hardcoded offsets (`zA = 0.3` on wall A, `xB = 0.3` on wall B)
instead of deriving the seat from the §6.2 algorithm. Every other row (wall cabinets, top row,
fridge, hood) is exactly flush at 0. This is a pre-existing M1 defect, verified directly against the
untouched `builders['kitchen-l']()` reference — not something the decomposition work introduced.

It collides with M2's own acceptance criterion: "Row 19 applies from this phase on: every mounted
body's back face lies exactly on its wall plane (0.000)... with the plane read from the room's wall
meshes and the bounding box measured after the group is added to the room." Taken literally, six
bodies fail that criterion today, inherited from M1 rather than caused by M2.

## Disposition for Wave 2A

Not fixed in this dispatch — fixing it means changing `buildKitchen()`'s seating math in
`kitchen-parts.ts`, which is M1-owned code and out of scope for a Wave 2A void-engine/decomposition
dispatch (M1 is already shipped and its own parity tests assert the current geometry).

Pinned instead: `packages/three-adapter/src/kitchen-parts.decomposition.parity.test.ts`'s Row 19
test asserts every gap against a named `KNOWN_WALL_GAP_M` exception map (`p0`/`p1`/`p2`/`p4` → 0.01m,
`p5`/`p6` → 0.02m), zero for everything else. The test fails loudly if the gap changes, grows, or
silently "fixes itself" without this record being updated — it does not pass by tolerating an
unbounded margin.

## Resolved — 2026-08-25

Decision: option 1 (fix the geometry now, not carry it as an accepted exception). The reference
`design-source/Modern Kitchen Cabinets 3D (3)/kitchen-parts.js` is a fidelity anchor, not a sacred
artifact — since it carried the same hardcoded-offset defect, it was corrected too, in the same
change, rather than fixing only the port and letting it drift from the reference.

What changed, in `packages/three-adapter/src/kitchen-parts.ts` and the reference `kitchen-parts.js`
identically: `buildKitchen()` no longer places the base row (`p0`/`p1`/`p2`/`p4`) or the two tall
units (`p5`/`p6`) at the round-number `zA`/`xB = 0.3` offsets. Both now use a §6.2-style
`seatOnWallA`/`seatOnWallB` helper — position the body at the wall plane, add it to the room,
measure its actual bounding box, and shift it by the measured back-face offset — the same
"read the wall meshes, measure after placing" algorithm `DEVELOPMENT-SPEC.md` §6.2 already
prescribes. `fridge-free` (already flush) was left untouched, decoupled from the corrected offset
so it can't regress. `packages/configurator-domain/src/fixtures/kitchen-l-design.ts`'s
`frameDepthMm` values for the six affected bodies (plus `cooktop-600`, which tracks the base row's
plane) were updated to match the new measured half-depths, so `deriveCabinetWorldTransform`
reproduces the corrected positions exactly.

`kitchen-parts.decomposition.parity.test.ts`'s `KNOWN_WALL_GAP_M` exception map is now empty — the
decomposed and whole-scene paths agree exactly, with no gap. `kitchen-parts.parity.test.ts`
(M1's Evidence 1 fidelity gate) needed no assertion changes: both sides of the diff moved together.
`docs/milestones/M1-scene-port.md` records this correction to the "reference files are not
modified" boundary it had stated as closed.
