# M2 — Placement, column and void engine, picking, and persistence

Status: planned. Depends on M1.
Reference: `DEVELOPMENT-SPEC.md` §2 (tolerances), §3, §4, §6.1, §6.4, §12 (persisted `Design`);
§11 rows 1, 2, 17, 18, 21, 22; `docs/decisions/2026-08-24-db-backed-shareable-persistence.md`.

## Goal

Three things. Two of them are inseparable: a domain module that derives free space correctly after
any mutation, and a picking layer that lets a person select the thing they aimed at. No mutation
exists yet — free space is derived from the seeded room and from test fixtures that stand in for
post-mutation states.

The third is persistence, which lands here because this is where `Design` is defined and where the
store first exists. It is a first-class deliverable of this phase, not a detail of it: a design is
stored in the application's own server-side database and addressed by an opaque identifier in the
URL, so a link reopens exactly that configuration.

## Why here

§12 makes the void model step 2 and picking step 3, and warns that step 3 is where the time went.
Both are prerequisites for every operation in M3. Picking is deliberately not folded into the UI
phase: its failures look like domain failures (the recorded symptom of the raycast-threshold bug was
"the levels are wrong") and diagnosing that from inside a panel implementation is expensive.

## Scope

In: the `Design` schema and its Zod validation; placement, column and void derivation;
`recomputeVoids()`; void mesh rendering; the picking rules; the store shape that will host commands;
the `ConfigurationRepository` interface and its database-backed adapter; design identifiers in the
URL and load-by-link.

Out: every mutation (M3), the panel (M4), width (M5).

## Work items

1. Define and validate the persisted `Design`: room + `presetId` + `placements[]`, each placement
   `wall / alongMm / y0Mm / body`, body = `buildId / widthMm / heightMm / finish? / handle?`.
   Integer millimetres; a non-integral value is rejected, never rounded. Geometry is derived on
   load; no mesh is ever serialised.
2. Derive the runtime placement record: the `frame` (the *opening*, width from the carcass, height
   and depth from the full extent), `col`, `band`, `rotated`, the capability flags
   (`canFinish / canHandle / canReplace / canDelete / fixedWidth / accessory`), and the remembered
   `finishKey` / `handleMode`.
3. Derive columns once at load, keyed `(rotated ? 'B|' : 'A|') + position.toFixed(2)`, taking x/z
   from the deepest member, width from the narrowest, depth from the deepest, `top` from the highest
   reach at load, and `regions` from every original member's vertical extent. Accessories contribute
   nothing. Columns never change afterwards.
4. Implement `recomputeVoids()` exactly as §4 specifies, including all four earned rules.
5. Render void meshes: translucent box plus dashed edges, inset 14 mm.
6. Implement picking per §6.1 and wire selection into the store.
7. Implement persistence: the `ConfigurationRepository` interface, a **Postgres-on-Neon**-backed
   adapter, a table storing one row per design with the canonical `Design` serialised as a
   **JSON/JSONB document** (not normalized/referenced rows — see
   `docs/decisions/2026-08-24-db-backed-shareable-persistence.md` decisions 2–4), and the route
   wiring that resolves a design by its identifier.
8. Implement the database security baseline in the persistence decision record's "Security and
   backups" section: environment-variable credentials, TLS, parameterised queries only, a
   least-privilege connection role.
9. Implement the scheduled backup job: a daily export of the Neon database uploaded to Vercel Blob
   (private access) under a timestamped key, a 14-day rotation that deletes older blobs, observable
   failure (logged, never blocking the request path), and a documented restore procedure covering
   both Neon's 6-hour point-in-time restore and loading a dated export back from Blob beyond that
   window. Provision the Blob store through the Marketplace the same way Neon was provisioned.

## Acceptance criteria

Free-space derivation — these are `DEVELOPMENT-SPEC.md` §11 rows, testable with no UI:

- **Row 17.** The 0.86–1.50 m backsplash zone never becomes an opening. An interval intersecting no
  module line produces no void at all; there is no fallback. (The recorded defect: a 640 mm slot
  with zero valid contents that a customer could click.)
- **Row 18.** A wall-only column invents no floor space beneath it. Derivation starts at that
  column's own lowest module. (The recorded defect: deleting a wall unit offered a 2200 mm opening
  down to the floor, where a corner base actually stands.)
- **Row 1.** Clearing a fridge column and re-inserting the fridge leaves exactly **one** 750 mm slot
  above it, never two stubs. A span that starts mid-level stays one opening.
- Clearing a standard full column yields exactly three independently selectable slots —
  `0.00→0.86`, `1.50→2.20`, `2.20→2.60` — each of which still reports `spanH = 2.6`.
- Two vertically adjacent freed openings in one column merge into one span before subdivision. The
  signature case: deleting the fridge (700 × 1850) and then the unit above it produces one
  700 × 2600 opening subdivided into three level slots.
- Subdivision follows the module lines, not the column's own history. Clearing a column whose
  original members were fridge `0–1.85` plus a top unit `1.85–2.6` yields base/middle/top, not two
  odd slots.
- A free interval shorter than `MIN_SPAN` (0.30) produces no void.
- `recomputeVoids()` is deterministic: the same design produces the same void set, and void
  derivation is a pure function of placements and columns with no dependence on call order.
- Occupancy is judged by the frame, not the mesh bounds. A body whose accessories or proud fronts
  extend past its carcass does not inflate the module pitch, and a body must clear the ceiling with
  everything it carries.

Picking:

- **Row 2.** Clicking the base slot of a cleared column selects the base slot, not the middle one.
- **Row 22.** After a deletion, clicking a different cabinet selects that cabinet. A void never
  swallows a click aimed at something solid.
- Solids are raycast first; voids are tested only where nothing solid lies behind.
- Void outlines are excluded from raycasting (`edges.raycast = () => {}`) **and**
  `raycaster.params.Line.threshold` is set to 0.008. Both are required: three.js defaults that
  threshold to one metre, which made every dashed outline steal its neighbours' clicks.
- A worktop accessory (`frame.h < 0.3`, such as the hob) resolves to its host cabinet. It offers no
  swap set and cannot be deleted.
- On pointer-up, a pointer that moved more than 7 px is treated as an orbit, not a selection.
- Selection resolves by climbing parents to the owning placement or void; a click on any child mesh
  selects the same body as a click on its door.
- **Row 21.** Every selectable body and slot is reachable at all three camera presets, or is listed
  as a known exception under the open reachability question — not silently unreachable.

Surfaces:

- **Mobile (gate):** tapping a body and tapping an empty slot both select the intended target at
  390 × 844, verified by real touch interaction. A selected body and a selected slot are visually
  distinguishable without opening any panel.
- **Shared:** selection lives in the store, keyed by id. The store is the single target for edits —
  there is no hard-coded canvas id anywhere. (In the prototype a fixed target made taps in one of two
  embedded scenes appear dead; production has one canvas, so the rule reduces to: the selection owns
  the target.)

Persistence — a first-class gate of this phase:

- A design is stored as a JSON/JSONB document in a Postgres database hosted on Neon's free tier and
  addressed by an **opaque, unguessable** identifier. Sequential or otherwise predictable identifiers
  fail this criterion.
- The stored document is self-contained: every placement's wall, position, width, finish and handle,
  plus global material/hardware settings and any per-cabinet custom settings, sufficient to render
  the exact scene without a live catalog lookup. This is what makes the same shape reusable for a
  future CRM lead view even after catalog data has changed — not built in this phase, but the
  document shape must not foreclose it.
- Opening a URL carrying that identifier restores **exactly** that configuration — same placements,
  same widths, same finishes, same handles — and resumes at the step the design belongs to.
- The identifier is the only thing in the URL. The configuration itself never travels in query
  parameters.
- Loading is fail-whole: parse, validate, migrate a known schema version as one transaction, then
  replace the store. An unknown or invalid payload produces a recoverable error and never partially
  hydrates.
- A round trip is exact: storing a design and reloading it by link yields a byte-identical canonical
  serialisation.
- Voids and columns are **not** stored. They are derived on load, which is the round-trip test's
  sharpest case: a reloaded design must produce the identical void set without ever having persisted
  one.
- Contact data is absent from the stored design. Nothing personal is reachable through a shared
  link.
- Persistence is only written after a successful command; a failed command persists nothing.
- The domain package performs no I/O. Only the repository adapter touches the database.

Security and backups (see the persistence decision record for the full rationale):

- The Neon connection string is read from an environment variable, never committed, and connections
  use TLS. There is no database file on the app server to place, permission, or serve.
- Every query goes through parameterised statements (the driver/query builder's placeholder syntax)
  — no string-built SQL anywhere, including in migrations and scripts.
- The application connects with a least-privilege role scoped to its own schema, not the Neon
  project's admin role.
- Neon's free-tier point-in-time restore (confirmed 6 hours, capped at 1 GB-month of changes) covers
  same-session recovery. A daily scheduled export to Vercel Blob (private access, timestamped key,
  14-day rotation) covers recovery beyond that window. Both restore paths — Neon PITR and loading a
  dated Blob export — are written down as a documented procedure. A failed backup run is logged, not
  silent, and never blocks the request path.

Boundaries:

- No mutation exists in this phase. `recomputeVoids()` is called from the store, and voids are
  exposed as derived state, never as stored or authored data.
- The void/column module imports no React and no Three.js. Void *meshes* are built in the adapter
  from the derived void records.

## Risks

- **The picking-threshold bug re-entering through a later `drei` helper or a changed raycaster
  config.** Pin the assertion in a test that fails if the threshold or the edge-raycast override is
  removed, since the symptom does not look like a picking bug.
- **Someone "simplifying" one of §4's four rules.** Each removed a specific defect. The four
  acceptance criteria above are stated so removal fails a test rather than a review.
- Reachability of a few placements from any fixed camera is a known-unsolved problem (§6.4). It is
  carried, not solved here. It must **not** be solved with a cabinet-list side panel — that was
  built and rejected as scope creep, and the underlying problem is in the scene.

## Open questions gating this phase

- ~~The concrete database and its deployment story beyond local development.~~ Resolved 2026-08-25:
  Postgres on Neon's free tier, storing each design as a JSON/JSONB document. Provisioned and linked
  to the Vercel project the same day. See the persistence decision record §"Security and backups" for
  the credential/role requirements this adds to work item 8.
- ~~The exact point-in-time-restore retention window on Neon's free tier.~~ Resolved 2026-08-25:
  6 hours, capped at 1 GB-month of changes — short enough that work item 9 (daily Vercel Blob export)
  is mandatory, not optional.
- Retention, deletion, and the privacy copy shown to the customer. Decided as a deliberate placeholder
  (keep indefinitely, slot copy) — see the persistence decision record's open questions.
- Whether a shared link is read-only for a second viewer, and what happens when two viewers edit the
  same design. Not needed for the POC; needed before sharing is promoted as a feature.

## Verification

- A persistence round trip driven end to end: build a design, open its link in a fresh session,
  assert identical placements and an identical derived void set.
- Unit tests over `recomputeVoids()` with fixtures for each row above, run with no UI present.
- Property-style sweeps: random valid placement sets in a column never produce overlapping voids, a
  void inside the backsplash zone, or a void narrower than `MIN_SPAN`.
- Browser-driven picking tests for rows 2 and 22 plus the accessory and orbit-threshold cases.
- Real mobile interaction at 390 × 844.
