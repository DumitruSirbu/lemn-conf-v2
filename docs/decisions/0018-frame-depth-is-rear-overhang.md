# ADR 0018 — `frame.d` is twice a body's rear overhang, not its depth

Status: Accepted
Date: 2026-08-25
Type: Finding
Milestone: M3 Wave 3B — found by logic review; the structural fix is scheduled, not done

## Context

Wave 3B's `BodyProbe` measures `seatOffsetM`, the distance from a body's group origin to its back
face. `insertBody` persists `2 ×` that as `seatDepthMm`, and `deriveFrame` turns it back into
`frame.d`. That encoding is exactly right for its purpose: `deriveCabinetWorldTransform` places the
body at `depthM / 2` off the wall, so the back face lands on the wall plane exactly, for any body,
whatever the shape of its bounding box (§11 row 19).

**It is not a depth.** `frame.d` is twice the rear overhang. Measured, every insertable entry built
into a 600 mm-deep column:

| build | depth given to the probe | recorded `frame.d` |
| --- | --- | --- |
| `base-2door`, `base-sink`, `base-dishwasher` | 600 | **580** |
| `wall-2door`, `wall-1door`, `wall-lift`, `open-shelf` | 600 | 400 |
| `hood` | 600 | **500** |
| `tall-pantry`, `tall-oven-tower`, `tall-fridge-housing` | 600 | **560** |
| `fridge-free` | 600 | **680** |

`scene-sync.ts`'s `buildBody` rebuilds a body at `depthM: record.frame.d`, and its doc comment
claimed that number "is the depth it was given … so re-clamping is idempotent". That is true only
for `wallCabinet` and `openShelf` — the two builders that consume a depth — and true for them only
because their carcass is centred on z = 0 with nothing behind it. Every other builder ignores the
depth argument, so the wrong number is inert.

## The finding

**The centring invariant that makes the round trip converge is already violated inside
`baseCabinet`.** Its `counter(w)` is 620 mm deep at z +0.02, putting the counter's back face at
−0.290 while the carcass back is at −0.280. Today that only means `frame.d` reads 580 for a base
body, which nothing consumes.

The day `baseCabinet` gains a depth parameter — which **ADR 0017's alternative 1 names as the
intended real fix** for the sink aperture — the rebuild round trip stops converging and starts
growing:

```
given 0.58  →  seat 0.31  →  frame.d 0.62  →  remount at 0.62  →  seat 0.33  →  frame.d 0.66  →  …
```

One step per save/reload. `refuseBuiltSize` checks width and height only, so **no gate sees it**.

A second-order consequence bears on the wall-plane justification. Because the plane is folded into
the offset, `frame.d = D + 2p` where `p` is the plane's coordinate. The *seat* survives a translated
room — the offset and the placement cancel — but the *rebuild depth* does not: at `p < 0` a wall
cabinet remounts shallower than it was measured, and its seat is then wrong. So "reading the mesh
rather than writing `0` is what stops a moved room from silently mis-seating everything" is true of
the seat and false of the rebuild.

## Decision

1. **Correct the comment now**, in Wave 3B. A comment asserting the opposite of what the number is
   is worse than no comment: it is what a future implementer will trust when adding a depth
   parameter.
2. **Pin the actual invariant with a test now**: `2 × seatOffsetM` equals the requested depth for
   `wall-*` and `open-shelf`, and is explicitly *not* claimed for the rest.
3. **Schedule the structural fix, do not rush it.** It is inert today and the wave is closing.
   Two candidate directions, to be decided when it is done:
   - add `carcassDepthM` to `BodyMeasurement` and persist it beside `seatDepthMm`, so the seat and
     the depth are two facts rather than one overloaded one; or
   - have `scene-sync` rebuild from the `column.d` the probe was given rather than from `frame.d`.
4. **Owner: whichever phase first parameterises a builder's depth.** That is the phase that turns
   this from inert to compounding, and ADR 0017 already points at `baseCabinet` as the first
   candidate. It must not be discovered by that phase; it is written down here first.

## Consequences

- Nothing changes behaviourally in Wave 3B. The seat is correct and §11 row 19 holds.
- A trap that would have surfaced as "the kitchen gets deeper every time you reload" — a symptom
  that reads as a persistence bug rather than a geometry one — is recorded before it can be hit.
  This is the same class as ADR 0011 Gap D ("delete does nothing" reading as a delete bug rather
  than a column bug): the recorded cause is worth more than the eventual symptom.
- The rule for anyone adding a builder: **a body's measured seat is not a licence to infer its
  depth.** They coincide only for a carcass centred on the origin with nothing behind it.
