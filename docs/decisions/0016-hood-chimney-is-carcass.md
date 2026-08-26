# ADR 0016 — The hood's carcass is its canopy **and** its chimney

Status: Accepted
Date: 2026-08-25
Type: Finding + Decision
Milestone: M3 Wave 3B — adapter

## Context

`docs/milestones/M3-mutations.md` work item 7 specifies the `BodyProbe` implementation's carcass
measurement by mesh name:

```
/carcass_shell|side_left|side_right|panel_bottom|plinth|counter|fridge_body|hood_canopy|dw_body/
```

That pattern was written before the probe existed, against the reference kit's mesh names. Applied
literally to the hood it matches exactly one mesh — `hood_canopy`, which `make.hood()` builds
**130 mm** tall — while `DEVELOPMENT-SPEC.md` §7 fixes the hood's catalogue height at **0.71 m**
(`nominalHeightMm: 710`, `heightFlex: false`).

Wave 3A's `insertBody` re-checks the built body against the plan (§5.2: "gs = CARCASS box of g →
re-check width & height, reject on mismatch") with `FIT_TOLERANCE_M` = 12 mm of slack:

```
packages/configurator-domain/src/commands/insert-body.ts — refuseBuiltSize()
```

710 mm required against 130 mm measured is a 580 mm discrepancy, so **every hood insert would be
refused with `BUILT_SIZE_MISMATCH`** — including the hood the §11 row 6 criterion requires to be
*offered* for any slot taller than 400 mm. The offer list (`offersFor`) would keep offering the
hood and the command would keep refusing it: the exact "every replace row silently did nothing"
failure shape M3's risks section names, arriving by a different route.

The same milestone's `body-probe.ts` doc comment points the other way — it describes `fullHeightM`
as "the whole group's height, faucets and hood chimneys included" — which reads as though the
chimney is *not* carcass. That sentence and §7's 0.71 m cannot both govern.

## Decision

**The hood's measured carcass is `hood_canopy` plus `hood_chimney`.** The probe's carcass mesh
pattern gains `hood_chimney`, and `buildCatalogBody` builds the hood as
`kit.make.hood(widthM, heightM − HOOD_CANOPY_HEIGHT_M)` so that canopy + chimney is exactly the
requested height.

The rule this expresses, which the mesh list is only an encoding of: **the carcass is the body's
own shell — everything that occupies the opening. What is excluded is what rises into free air
above or in front of it and is not part of the product's stated size.** For the sink base that is
the faucet (§11 row 7 — it once measured 1220 mm and was refused from an 860 mm opening it fits).
For the hood, nothing is excluded: a hood *is* a canopy on a chimney, and §7 sizes it as one.

`body-probe.ts`'s "hood chimneys included" phrasing is superseded for the purpose of the *carcass*
gate; `fullHeightM` remains the whole group's extent, which for the hood is marginally taller than
its carcass (the filter dips ~6 mm below the canopy).

## Alternatives considered

1. **Follow the pattern literally and let the hood report a 130 mm carcass.** Rejected: it makes
   the hood permanently uninsertable while still being offered, and hides the contradiction behind
   a refusal code that reads like a builder bug.
2. **Lower the catalogue's `nominalHeightMm` for the hood to 130.** Rejected: it contradicts §7,
   and it would let a hood be inserted into a 200 mm opening that cannot physically hold it.
3. **Exempt the hood from the built-size re-check.** Rejected: the re-check is §5.2's own gate and
   the last line of defence between a mis-parameterised builder and a rendered scene. Carving out
   one body from it removes the guard for the one body whose builder needed a new parameter.

## Consequences

- `HOOD_CANOPY_HEIGHT_M` (0.13) becomes a named constant in the adapter, derived from
  `make.hood()`'s own canopy box. If that builder's canopy changes, the hood's chimney arithmetic
  changes with it, and the built-size re-check is what will catch the drift.
- The seeded `hood-600` body is untouched: `buildDecomposedBody` still calls `kit.make.hood(0.6)`
  with its default 0.57 m chimney (total 0.70 m), reproducing M1's scene exactly. Only *inserted*
  hoods build to 0.71 m.
- A hood inserted into the seeded 1500–2200 wall level (700 mm) is 10 mm taller than its opening
  and is accepted, because 10 mm is inside `FIT_TOLERANCE_M`. That is the manufacturing slack the
  constant exists for, and it is the same slack §7's own 0.71-into-0.70 numbers assume.
