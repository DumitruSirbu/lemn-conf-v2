# ADR 0040 — A recorded seat is converted back into a depth, never read as one

Status: Accepted
Date: 2026-08-30
Type: Decision
Milestone: M5 wave 5F — resolves [ADR 0018](0018-frame-depth-is-rear-overhang.md) clause 3, closes backlog 9

## Context

[ADR 0018](0018-frame-depth-is-rear-overhang.md) recorded that `frame.d` is **twice a body's rear
overhang**, not its depth, and that reading it as a depth would compound one step per save-and-reload
with `refuseBuiltSize` — which checks width and height only — seeing nothing. It was inert, because
the two numbers coincided for the only two builders that consume a depth: `wallCabinet` and
`openShelf` centre their shell on z = 0, and the shell *was* the whole of what the builder was given.

Clause 3 scheduled the structural fix, named two candidate directions, and clause 4 assigned it to
"whichever phase first parameterises a builder's depth". **Wave 5F is that phase, twice over:**

- [ADR 0036](0036-a-declared-dimension-is-the-finished-cabinet.md) decision 1 makes a declared
  dimension the *finished* cabinet, so a fronted wall shell is the declared depth **less 39 mm** —
  an 18 mm door slab and the 21 mm its bar handle stands proud of it, measured in this wave. A
  330 mm cabinet records a seat of 291.
- [ADR 0039](0039-the-hood-is-a-standard-depth-hung-at-the-front.md) decision 2 hangs the hood at
  the front, so its seat runs from the wall plane to the 600 mm cabinet-depth line and records
  **700** for a body that is 500 mm deep.

Both make `frame.d` diverge from the space the body fills — in opposite directions.

## Decision

**Every reader that wants a depth converts the seat back; none reads it raw.** Of clause 3's two
candidates this is the second — *"have `scene-sync` rebuild from the depth the probe was given"* —
generalised, because the same conversion turned out to be needed in three places, not one.

1. **`occupiedDepthM(record)`** (`configurator-domain/src/occupied-depth.ts`) is the single answer to
   "how deep is the space this body fills": the cabinet-depth line for a hood, `frame.d + 39` for a
   fronted wall carcass, `frame.d` for everything else. Read by `deriveColumns` (§3.2's MAX, which
   also decides which member is the column's *deepest* and therefore where the column sits) and by
   `openingFromPlacement` (§5.3's swap opening).
2. **`rebuildDepthM(kit, buildId, frameDepthM)`** (`three-adapter/src/catalog-bodies.ts`) is the
   same conversion for the adapter, where a *persisted* placement is rebuilt rather than a new one
   planned. `scene-sync`'s `buildBody` reads it.
3. **The first candidate is rejected**: persisting a second measurement beside the seat needs a
   `DesignSchema` field, a version bump and a migration for a number that is fully derivable, and
   M5-width work item 7 names that as a scope change to raise rather than absorb.

The conversion converges **exactly** rather than approximately: declared 0.330 builds a 0.291 shell,
records `frame.d` 0.291, rebuilds at 0.291 + 0.039 = 0.330, for as many cycles as you care to run.

## Consequences

- **Backlog entry 9 closes.** Its diagnosis was right and its remedy was backwards. `make.hood`'s
  hardcoded 0.5 m canopy is not a defect once ADR 0039 decision 1 makes the hood's depth standard;
  what was wrong is that the outgoing hood's own number reached the replacement. `occupiedDepthM`
  answers 600 for a hood, so `p24`'s round trip returns the 600 the entry says "never comes back".
- **ADR 0018 clause 2's pin changes deliberately and is not weakened.** `2 × seatOffsetM` equals the
  requested depth for `open-shelf` and equals it *less the front assembly* for `wall-cabinet` and
  `wall-lift`. `measure-built-body.test.ts` states the expected value per builder and adds the
  anti-invariant that rebuilding from the raw seat really does shrink a wall cabinet by 39 mm — so
  the conversion cannot be deleted as a no-op.
- **The 39 mm is declared in the domain and derived in the adapter**, deliberately: §12 puts the
  product rule ("330 means the finished cabinet") in the domain and the geometry in the builders,
  and `cabinet-depth-source.test.ts` asserts the two are the same number. That is ADR 0028's own
  remedy for two constants agreeing by luck, applied to the pair this wave created.
- **A test that reads `frame.d` where it means a depth now reads `occupiedDepthM`.** Several did, and
  their assertions had quietly become claims about the encoding rather than about the cabinet — a
  wall cabinet and an open shelf whose fronts land on the same line record 291 and 330, and are
  flush.
