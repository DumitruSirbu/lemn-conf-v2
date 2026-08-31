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

## Amendment — 2026-08-31: decision 1's third arm is a declaration, not `frame.d`

**This section corrects one clause of decision 1 above. Nothing before it is edited**, so the
original wording — and the fact that it was wrong — stays visible.

Decision 1 states the rule as *"the cabinet-depth line for a hood, `frame.d + 39` for a fronted wall
carcass, **`frame.d` for everything else**"*. **The last clause is no longer true**, as of commit
`f9b92e1` (adversarial-review remediation, wave S9), which closes **DOM-002** in
`testing-reports/03-domain-model.md`.

### What survives

The subject of this record is intact. A recorded seat is still converted back into a depth and is
never read as one; the conversion still lives in **exactly one place in the domain**, and that place
is still `occupiedDepthM` in `packages/configurator-domain/src/occupied-depth.ts`, read by
`deriveColumns` (§3.2's MAX) and by `openingFromPlacement` (§5.3's swap opening). Decision 2's
`rebuildDepthM` in the adapter, decision 3's rejection of a persisted second measurement, and the
39 mm front assembly are all untouched. Only the third arm changed.

### What changed

The two-armed `kind` switch with a catch-all `return record.frame.d` is gone. A body's finished
depth is now **declared by its catalogue entry** — `BodyDefinition.occupiedDepth`, an
`OccupiedDepthRule` — never inferred from a kind, a band or a builder name, which is [ADR
0022](0022-seeded-entries-declare-their-catalogue-equivalent.md)'s stance applied to depth. Keying
on the entry rather than the kind is what makes fail-closed possible at all: two bodies of one kind
occupy 620 and 648.

There are two rules, because the shipped builders come in exactly two shapes and no more:

- **`recorded-shell`** — the builder centres its shell on `z = 0`, so `frame.d` *is* that shell and
  the body occupies the shell plus whatever stands in front of it (`shellPlusFrontMm`). The wall
  carcasses are the whole of this set: a fronted one adds
  [ADR 0036](0036-a-declared-dimension-is-the-finished-cabinet.md) decision 1's 39 mm door-and-handle
  assembly, an open shelf adds `NO_FRONT_ASSEMBLY_MM`.
- **`wall-plane`** — the builder ignores the depth it is handed and always builds the same body, so
  the space it fills is **one declared distance from the wall plane** (`finishesAtMm`). Every base,
  full-height, appliance and corner body is in this set, and so is the front-hung hood of
  [ADR 0039](0039-the-hood-is-a-standard-depth-hung-at-the-front.md) decision 2.

There is deliberately no `recorded-shell` arm for a base or a column: `frame.d` is 580 for a base
carcass whose shell is 560, so "shell plus a front" would be arithmetic on a number that is not a
shell — a fiction landing on the right answer, which is the defect class
[ADR 0028](0028-wall-depth-is-derived-from-the-worktop.md) exists to stop.

**An entry that declares no rule, or one this module does not recognise, throws**
(`UndeclaredOccupiedDepthError`) instead of falling back. It is a programming error rather than a
number to guess at — the same stance `UnknownWorktopDepthError` takes, and for the same reason.

### Why

`frame.d` under-reported the space every catch-all body fills, so **the opening a removed body left
behind was shallower than the body that had just vacated it**: base 580 where the body occupies
**620**, tall 560 where it occupies **599**, freestanding fridge 680 where it occupies **742**, and
the corner base 560 where it occupies **630**.

Note the corner figure. DOM-002's own table said **580**; measurement against the real builders gave
**630**, because 580 was arithmetic on the carcass and ignored the corner worktop, which reaches
350 mm from the origin. The report was taken as a starting point and re-measured, not taken on
trust.

The same sweep found **four bodies the report never named**, under-reported by the same fallback:
dishwasher **632**, hob-oven base **648**, oven tower **638**, and the corner return **600**.

### Consequences

- The finished depths are constants in `catalog.ts` with their derivations stated —
  `BASE_FINISHED_DEPTH_MM` is the worktop depth plus its 20 mm overhang, `TALL_UNIT_FINISHED_DEPTH_MM`
  is the column depth plus the same 39 mm front assembly a fronted wall carcass carries, and
  `HOOD_FINISHED_DEPTH_MM` is the cabinet-depth line. The adapter gates the declarations against the
  meshes, so a declaration that drifts from what is built fails rather than being believed.
- **This amendment exists because the code said it was owed.** `occupied-depth.ts` carries the note
  that half of decision 1 was superseded and named `AGENTS.md`'s rule — *a dated record must not be
  silently overturned* — as the reason. The record is now amended; the note describes a settled
  state rather than a debt.
