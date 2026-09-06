# ADR 0059 — A 520 mm cabinet-depth floor is declared beside the map, carrying the arithmetic that produced it

Status: Accepted
Date: 2026-09-02
Type: Decision
Milestone: M6 — unblocks half of wave 6K; closes `docs/BACKLOG.md` entry 19's decision

## Context

`docs/BACKLOG.md` entry 19, found while implementing M5B wave 5B10
([ADR 0051](0051-the-dishwasher-niche-wears-a-decor-door.md)). The dishwasher's decor door is
anchored on the derived carcass depth and follows the cabinet-depth setting the way every other base
front does. `dw_body` — the appliance behind it — does not: it is a real machine built at a literal
0.24 m front whatever the setting says.

So the mounting clearance between the door's inner face and the appliance closes as the setting
drops, and the entry names M6 work item 4 as its owner because the *Setări globale* depth control is
the first thing in the product that can move it.

## The arithmetic, corrected

The clearance is **not** `cabinetDepth / 2 − 240`. That form was carried in the dispatch that
requested this record and it produces 60 mm at a 600 mm kitchen and a zero at 480 — neither of which
matches the measurement. The carcass is the *declared* depth less the front overhang
(`BASE_FRONT_OVERHANG_MM = 40`, `kitchen-parts.ts`), so:

```
carcassDepth   = cabinetDepth − 40
clearance      = carcassDepth / 2 − 240
               = (cabinetDepth − 40) / 2 − 240
```

Checked against both numbers entry 19 states: at **600** it gives `(600 − 40)/2 − 240 = 40 mm`, which
is the clearance the entry measured; it reaches **zero at 520**, which is the floor the entry names.
The correction matters because the whole point of this decision is that the constant carries a
derivation somebody can re-check, and a derivation that misses by 40 mm is worse than none.

## Decision

**One declared minimum cabinet depth of 520 mm, beside the depth map, with the arithmetic above
written next to it.**

1. A cabinet depth below the floor is refused the way an undeclared depth already is
   ([ADR 0028](0028-wall-depth-is-derived-from-the-worktop.md) decision 4) — loudly, naming the
   value, never clamped and never guessed at.
2. **Enforced in the domain, not only in the control.** A control is a surface; a stored document
   must not depend on one, and the depth reaches the document through
   [ADR 0055](0055-a-depth-change-migrates-the-stored-design.md)'s migration.
3. Nothing reaches the floor today and nothing in M6 reaches it:
   [ADR 0056](0056-two-cabinet-depths-are-declared-and-the-control-reads-the-map.md) declares 600 and
   700, and the floor is crossable only **downward**. This is a guard written before the case exists,
   not a fix for a live defect.

## Alternatives considered

- **Refuse the combination** — this depth, with a dishwasher niche in the design. Rejected: it needs
  a per-design condition evaluated inside the settings sheet and makes this the product's first
  refusable *global* control, which is new machinery for a case no declared depth reaches.
- **Give the niche its own floor**, separate from the rest of the catalogue. The most physically
  honest option and the most new concept — the catalogue has no per-entry *depth* floor, and
  `minWidthMm` is the nearest thing. [ADR 0026](0026-the-width-floor-has-a-direction.md) reads a
  floor declared above the default as a builder admitting it is not parameterised, and the real fix
  for this one is parameterising `dw_body`, which is nobody's work in M6. Rejected as premature, not
  as wrong.

## Consequences

- Wave 6K's control cannot offer a depth below the floor, and wave 6J refuses one arriving any other
  way.
- `docs/BACKLOG.md` entry 19's decision closes; its underlying geometry — an appliance that does not
  follow the setting — is untouched and stays recorded there.
- A future shallow map row fails loudly at the floor instead of silently building a door into an
  appliance, which is the entire value being bought.
