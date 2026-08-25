# Product invariants

**Read this when:** planning or changing anything that affects the 3D model, cabinet geometry,
dimensions, or visual behaviour — before writing code, not after a review finds a violation.

These hold across every milestone. A change that breaks one is a defect regardless of how good it
looks in a screenshot.

- Work in metres in the 3D model. Do not silently mix metres, millimetres, and centimetres. The
  persisted `Design` uses integer millimetres; a non-integral value is rejected, never rounded.
- Preserve the reference coordinate system: origin at the floor and centre of a unit; +Y up; +Z
  faces the customer; +X is right when facing the unit.
- A bought appliance, sink, or handle has fixed real-world dimensions unless a requirement says
  otherwise. Cabinet bodies may scale only along the dimensions the spec permits.
- A visual change must keep its stated structural dependencies. For example, a sink requires a cut
  worktop and an open cabinet frame; it cannot be fixed in isolation.
- Prefer the existing 3D reference as evidence over a visual guess. Record intentional departures
  with their reason and acceptance criteria before implementing them.
- Every rule marked **WHY:** in `docs/design/DEVELOPMENT-SPEC.md` is a shipped defect's fix. It must
  not be simplified away, and the regression table rows that pin it must keep failing if it is.

## The reference geometry

`packages/three-adapter/reference/kitchen-parts.js` is the supplier's original, vendored so M1's
structural parity suite can diff the port against it at a 1e-6 m epsilon. It is a fidelity anchor,
not scripture: it moves only alongside a matching, documented change to the port. It has been
corrected once — see `docs/decisions/2026-08-25-m2-row19-m1-wall-gap-finding.md`.

It is excluded from ESLint and Prettier on purpose. Linting it would only pressure someone into
"fixing" the very thing the port is compared against.
