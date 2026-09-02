---
name: lemnaria-3d-reference
description: Plan, implement, or review the Lemnaria kitchen 3D model using its documented geometry, alignment, scaling, and realism contract.
metadata:
  short-description: Lemnaria kitchen 3D contract
---

# Lemnaria kitchen 3D reference

Read `docs/design/SPEC.md` before changing or judging any kitchen 3D model — the original 3D
contract: coordinates, dimensions, structural dependencies. Where `docs/design/DEVELOPMENT-SPEC.md`
disagrees with it, DEVELOPMENT-SPEC wins; it is the authoritative behavioural contract. Never read
`design-source/` — `AGENTS.md` rule 3 forbids importing from it; it is untracked and will be
deleted, kept only as historical provenance.

## Preserve the contract

- Use metres and the documented local coordinate system. The `box` helper receives the bottom Y
  coordinate, not its centre.
- Keep shared alignment planes consistent across cabinetry, fronts, plinths, and worktops.
- Treat scaling rules as part of the product contract. Appliances, sinks, and handles stay fixed
  size; only permitted cabinet axes scale.
- Implement a feature with its structural dependency. A correctly shaped object is still wrong if
  its host cabinet, worktop, or adjoining geometry hides it or intersects it.
- Avoid coplanar or intersecting solid faces: they create z-fighting. At seams, make the intended
  faces butt or define a deliberate gap.

## How to work

For a new or altered element, state its reference location, geometry, material, scaling rule,
structural dependency, and verification before coding. Compare it against the named source builders
in the reference files rather than reconstructing details from memory.

For visual work, inspect the actual rendered result. Verify alignment, seams, front direction,
fixed-size bought elements, and whether the relevant interior remains visible. Preserve the
reference's realism choices unless the user intentionally changes them: chamfered edges, PBR-like
materials/environment lighting, and no directional cast shadows.

When an intentional change contradicts the reference, record it in a dated decision with the reason
and its replacement acceptance criteria.
