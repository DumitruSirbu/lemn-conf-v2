# ADR 0025 — The corner base legs seat on the L-joint, not on the wall, and become placements

Status: Accepted
Date: 2026-08-26
Type: Finding + Decision
Milestone: post-M4 handset fixes — reported from production by the owner

**Pointer, 2026-10-01 — amended for the base return by
[ADR 0135](0135-the-corner-pieces-stand-on-the-runs-lines-and-the-base-return-is-a-base-body-with-a-fixed-front.md).**
Owner ruling for M7-FB-006: the corner pieces stand on the run's lines. The return leg's depth and
`p26`'s `frameDepthMm` (decision 1) become 570, not 580, and the sentence at `:43-45` — the seam at
z = 0.58 *"which is the return leg's own depth"* — stops being an identity: the seam holds, but the
return is no longer 580 deep. A second slice (built and measured, not yet committed) moves the seam to 0.57 and the X-leg's frame to
550. The X-leg's −0.020 seat and decision 3's pinned exception are **unchanged**. The measurements and
reasoning below stand as written for 2026-08-26. Nothing here is struck.

## Context

Reported from a real handset: "Clicking the corner cabinet at the middle and top shows that it is a
corner cabinet. Clicking the **base** corner cabinet does nothing."

`DEVELOPMENT-SPEC.md` §11 row 16 requires the opposite — "Corner base | no swap list, no delete,
**refusal explains why**" — and ADR 0021 already put `STRUCTURAL_CORNER` in the catalogue data and
wired §9's structural explanation to it. But it wired it to `p9` and `p21`, the two **wall** corner
returns. There was no base corner in the data at all.

`KITCHEN_L_DESIGN`'s base row was `p0 p1 p2 p4` on wall A and `p5 p6 p7` on wall B, with nothing
between A|300 and A|1300 and nothing at B|615's height on the floor. The corner base a customer can
see is drawn by `buildKitchen()` as whole-scene geometry (`cornerBaseX`, `cornerBaseReturn`), and
§6.1's picking targets mounted placements only. The tap landed on nothing. Row 16 was not
implemented incorrectly; it was **unreachable**, and had been since M2.

M2 recorded why, in the header of `kitchen-parts.decomposition.parity.test.ts`: the corner legs'
"geometry is not centred on the wall-normal axis the way every other body is, so mounting them needs
a transform this milestone does not define". The gap was carried as a "two accounted for, unmatched"
assertion rather than dropped. This ADR closes it.

## The finding: what the seat actually is

`deriveCabinetWorldTransform` seats a body at `depthM / 2` off its wall plane, so its back face lands
exactly on the wall (§6.2, §11 row 19, ADR 0005). Measured against the reference room, the two legs
behave differently under that rule:

| leg | `buildKitchen()` position | local bbox on the wall-normal axis | back face |
| --- | --- | --- | --- |
| `corner_base_return` (320 wide) | x **0.29**, z 0.74, ry π/2 | −0.290 … +0.310 | x = **0.000**, flush |
| `corner_base_x` (900 wide) | x 0.45, z **0.28**, ry 0 | −0.300 … +0.350 | z = **−0.020** |

The return leg fits the standard rule exactly: it is 580 deep, seats at 0.29, and its back face is on
wall B's plane. `frameDepthMm: 580` reproduces it and row 19 holds unchanged.

**The X-leg does not, and must not.** Its carcass is 900 × 600. The return leg it butts is 580 deep.
For the two carcasses to meet on a shared face — the seam at z = 0.58, which is the return leg's own
depth — the X-leg's origin is fixed at `0.58 − 0.600/2 = 0.28`. That leaves 20 mm of its carcass
behind the wall plane.

That is not a defect of the ADR 0005 kind, and the direction of the error is the tell. ADR 0005's six
bodies stood 10–20 mm **proud** of the wall — a visible gap behind a cabinet. The X-leg is 20 mm
**inside** the wall, where nothing can see it. Seating it flush at z = 0.30 would push its carcass
front to 0.60 and drive it 20 mm *into* the return leg: two solid volumes intersecting, which the 3D
contract calls out by name as the thing that produces z-fighting. The corner is a joint between two
bodies of different depths, and the joint wins.

## Decision

**1. The two legs become placements**, `p25` (`base-corner-x-900`, wall A at 450 mm) and `p26`
(`base-corner-return-320`, wall B at 740 mm), with `frameDepthMm` 560 and 580. Ids are appended
rather than renumbered into the base row's position: `p0`…`p24` appear in persisted designs.

**2. `frameDepthMm` is restated as the seat, doubled — not the depth.** ADR 0018 already found that
`frame.d` is twice a body's *rear overhang*, and that the two coincide only for a carcass centred on
its origin with nothing behind it. This ADR narrows the claim once more, because the X-leg breaks even
ADR 0018's version:

> `frameDepthMm` is `2 ×` the body's **wall-normal seat offset** — the distance from its group origin
> to the wall plane. For every body seated by §6.2 that equals twice its rear overhang. For a body
> seated by a joint instead, it does not, and 560 on a 600-deep carcass is the honest record of that.

**3. §11 row 19 gains one named exception, pinned by value.** `KNOWN_WALL_GAP_M` in the
decomposition-parity suite — emptied by ADR 0005 — carries `p25 → −0.02`. The mechanism is ADR 0005's
own: a named exception fails loudly if the gap changes, grows, or silently "fixes itself", rather than
being tolerated by a loose margin. The negative sign is the point, and is asserted as such.

**4. Both legs take `STRUCTURAL_CORNER`** (`canReplace`/`canDelete`/`canFinish`/`canHandle` false,
`fixedWidth` true) with `structuralReason: "corner"`, so §9 renders the explanation ADR 0021
authored. `kind` moved *out* of that shared shape, which had hardcoded `wall_cabinet`: the four
bodies wearing it are now three kinds.

**5. `corner_base_x` and `corner_base_return` are named in `KIND_LABELS_RO`** — "Corp bază de colț"
and "Racord bază de colț". §3.1 has always listed both as kinds, but until now no selection could
carry one, so neither was ever named and the header would have read the generic "Corp". §11 row 16
asks the panel to *explain* a corner, which starts with calling it one. This does not weaken row 24:
a kind outside the table is still unknown and still renders no replace section.

**6. The decomposition-parity assertion becomes a bijection**, not merely a passing count. See below.

## Why the parity change is load-bearing

That suite is M1's fidelity anchor. Turning "two accounted for, unmatched" into "unmatched is empty"
would pass for the wrong reason — an assertion can stop failing because the thing it described went
away. The replacement asserts three separate properties, each of which fails for a different defect:

- every placement finds a reference child at its derived transform → **the seat did not drift** (the
  ADR 0005 failure);
- `matched.size === placements.length` → **no two placements claim the same reference child**;
- no non-shell child is left unmatched, and `matched.size + shell === room.children.length` →
  **nothing `buildKitchen()` draws is unowned**.

Together they are a bijection between placements and reference-room bodies, and that is also the
**double-render proof**. `kitchen-stage.tsx` composes the live scene by removing every reference-room
child whose position a record claims (within the same 1e-6 m) and then mounting the records. Onto
means nothing is left behind to be drawn a second time; one-to-one means no child is removed on
behalf of two bodies. The mesh-name-set test, which previously excluded the corner legs from both
sides, now compares the full multiset.

## Consequences

- **Derived state.** Two new single-member columns, `A|0.45` and `B|0.74`, each with regions
  `[[0, 0.82]]` and `top` 0.82 — full to their own ceiling, so neither yields a void. Every
  pre-existing column is byte-identical, and `recomputeVoids` over the seeded design is still empty
  both before and after. Asserted by comparing against the same fixture with `p25`/`p26` filtered
  out, rather than against a snapshot.
- **§10's signature flow is unaffected.** It runs on `p7`/`p24` in column `B|2.45`; neither new key
  collides with it, and `B|2.45` is unchanged.
- **Row 20 stays where ADR 0021 left it.** The new legs are non-deletable, so they add no reachable
  opening, and nothing about §11 row 20's reachability changes.
- **The legs join ADR 0021's clause 2 consequence.** Once per-placement finish is wired into the
  scene, four corner bodies rather than two will keep the default material while their neighbours
  take the chosen finish. If that reads wrong on screen, ADR 0021's clause 2 is still the thing to
  revisit — this ADR only widens its blast radius, and says so here rather than letting it be
  rediscovered.
- **`base-corner-x-900` and `base-corner-return-320` have no `catalogEquivalentId`**, joining the hob
  and the two wall returns. §13.1 is explicit that a corner is not a body a customer chooses, so no
  ACTUAL badge is the correct answer, not a missing one.
- **Open, carried:** ADR 0018's structural fix is untouched, and this ADR adds a case to it. Whoever
  parameterises a builder's depth now has a body whose `frameDepthMm` is 40 mm *less* than its
  carcass, in the opposite direction from every example ADR 0018 tabulated. The rule it states —
  "a body's measured seat is not a licence to infer its depth" — now has a counter-example in both
  directions.
