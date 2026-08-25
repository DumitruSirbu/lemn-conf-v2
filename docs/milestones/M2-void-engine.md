# M2 — Placement, column and void engine, picking, and persistence

Status: Wave 2A (work items 1–6) implemented and verified 2026-08-25 — domain schema, void engine,
decomposition-parity proof, void mesh rendering, picking (including a real solids/voids picking
defect found in review and fixed — see `packages/three-adapter/src/picking.ts`), store, and mobile
touch verification via Playwright (`apps/web/playwright.config.ts`,
`apps/web/src/scene/kitchen-stage.e2e.spec.ts`). 236 unit/component tests + 4 e2e tests passing,
typecheck/lint/format clean. The one item that was open before Wave 2A could fully close — a
pre-existing M1 wall-seating gap on 6 bodies colliding with the Row 19 acceptance criterion — is now
fixed; see `docs/decisions/2026-08-25-m2-row19-m1-wall-gap-finding.md`'s "Resolved" section: both
`buildKitchen()` and its reference were corrected to seat those bodies flush, and Row 19 now holds
with no tracked exception. One acceptance case is honestly unverifiable until M3: "tap an empty slot" has no void to tap against
in the fully-occupied seeded fixture — recorded as a named `test.skip` with justification, not
faked. Wave 2B (persistence, work items 7–9) not yet started. Depends on M1.
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

## Two dispatch waves

This phase carries nine work items across two unrelated subject areas, which exceeds the
five-item/five-file dispatch guidance in `AGENTS.md`. Deliver it as two sequential waves, each with
its own `docs/WORKFLOW.md` cycle (plan → implement → QA → review → verify → docs → commit):

- **Wave 2A — engine and picking:** work items 1–6. Depends on M1. Gated by the free-space, picking
  and surfaces criteria below.
- **Wave 2B — persistence:** work items 7–9. Depends on 2A only for the `Design` schema from item 1,
  so it can begin as soon as that schema is settled. Gated by the persistence, security and backup
  criteria below.

They are one milestone because M3 needs both, and because splitting persistence into its own
numbered milestone would renumber M3–M8 for no benefit. They are two dispatches because a reviewer
looking at raycaster thresholds and a reviewer looking at connection roles are not doing the same job.

## Work items

1. Define and validate the persisted `Design`: room + `presetId` + `placements[]`, each placement
   `wall / alongMm / y0Mm / body`, body = `buildId / widthMm / heightMm / finish? / handle?`.
   Integer millimetres; a non-integral value is rejected, never rounded. Geometry is derived on
   load; no mesh is ever serialised.
2. Derive the runtime placement record: the `frame` (the *opening*, width from the carcass, height
   and depth from the full extent), `col`, `band`, `rotated`, the capability flags
   (`canFinish / canHandle / canReplace / canDelete / fixedWidth / accessory`), and the remembered
   `finishKey` / `handleMode`. Then **decompose the M1 scene into placements and prove the
   recomposition matches**: M1 renders `builders['kitchen-l']()` whole, and from here bodies are
   mounted individually with a derived wall transform, per `ARCHITECTURE_PROPOSAL.md` §6.1 step 3.
   That switch is the first opportunity to silently lose M1's verified fidelity, so it is proven, not
   assumed — see the acceptance criteria.
3. Derive columns once at load, keyed `(rotated ? 'B|' : 'A|') + position.toFixed(2)`, taking x/z
   from the deepest member, width from the narrowest, depth from the deepest, `top` from the highest
   reach at load, and `regions` from every original member's vertical extent. Accessories contribute
   nothing. Columns never change afterwards.
4. Implement `recomputeVoids()` exactly as §4 specifies, including all four earned rules.
5. Render void meshes: translucent box plus dashed edges, inset 14 mm.
6. Implement picking per §6.1 and wire selection into the store.
7. Implement persistence: the `ConfigurationRepository` interface, a **Postgres-on-Neon**-backed
   adapter, a table storing one row per design with the canonical `Design` in a **`jsonb` column**
   (not normalized/referenced rows — see
   `docs/decisions/2026-08-24-db-backed-shareable-persistence.md` decisions 2–4 and 18–21), the
   deterministic canonical serialiser the round-trip invariant compares against, the write path of
   decisions 13–17 (coalesced, off the edit path, failure surfaced and retried), and the route wiring
   that resolves a design by its identifier.
8. Implement the database security baseline in the persistence decision record's "Security and
   backups" section: environment-variable credentials, TLS, parameterised queries only, a
   least-privilege connection role.
9. Implement the scheduled backup job: a daily export of the Neon database uploaded to Vercel Blob
   (private access) under a timestamped key, a 14-day rotation that deletes older blobs, observable
   failure (logged, never blocking the request path), and a documented restore procedure covering
   both Neon's 6-hour point-in-time restore and loading a dated export back from Blob beyond that
   window. Provision the Blob store through the Marketplace the same way Neon was provisioned.
   Two things to settle before writing it, both named in the persistence record's open questions:
   confirm the Hobby-plan cron frequency limit against Vercel's pricing documentation, and choose how
   the export is produced — a Vercel cron invokes an HTTP endpoint, so the job runs in a function
   runtime where the `pg_dump` binary is not available and the "or equivalent" path has to be picked
   deliberately.

## Acceptance criteria

Fidelity carried forward from M1 — the first thing this phase can break:

- The scene composed from individual placements is geometrically identical to M1's whole-scene
  render. Every body's world position and rotation, and the mesh set under it, match what
  `builders['kitchen-l']()` produced, at the same 1e-6 m float epsilon M1's parity assertions use.
- **Row 19 applies from this phase on:** every mounted body's back face lies exactly on its wall
  plane (0.000) on both wall A and wall B, with the plane read from the room's wall meshes and the
  bounding box measured *after* the group is added to the room.
- No gaps appear between adjacent units, at the corner, above the fridge, or between the upper rows,
  where M1's scene had none. Losing face-sharing during decomposition is the specific regression this
  criterion exists to catch.

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

- A design is stored as a single `jsonb` document in a Postgres database hosted on Neon's free tier
  and addressed by an **opaque, unguessable** identifier. Sequential or otherwise predictable
  identifiers fail this criterion.
- The stored document is self-contained: every placement's wall, position, width, finish and handle,
  plus global material/hardware settings and any per-cabinet custom settings, sufficient to render
  the exact scene without a live catalog lookup. This is what makes the same shape reusable for a
  future CRM lead view even after catalog data has changed — not built in this phase, but the
  document shape must not foreclose it.
- Opening a URL carrying that identifier restores **exactly** that configuration — same placements,
  same widths, same finishes, same handles. In this phase that means restoring into the editor;
  resuming at the *step* a design belongs to needs Step 1 to exist and is M7's criterion, not this
  phase's.
- **Something has to create the first design.** Step 1 does not exist yet, so in M2 a design row is
  minted from the seeded L fixture on first write, and the identifier it returns is what the URL
  carries. M7 later replaces that trigger with preset application and bespoke generation; the
  repository contract must not assume either one.
- The identifier is the only thing in the URL. The configuration itself never travels in query
  parameters.
- Loading is fail-whole: parse, validate, migrate a known schema version as one transaction, then
  replace the store. An unknown or invalid payload produces a recoverable error and never partially
  hydrates.
- **A round trip is exact at the domain boundary, not the byte level.** Load the stored document,
  validate it, canonically serialise it, and require equality with the canonical serialisation of the
  design that was stored. Do **not** assert byte-identity of the stored column: `jsonb` normalises key
  order and whitespace, so that assertion fails even when nothing is wrong. Canonical serialisation is
  produced by a deterministic serialiser in the domain package, not inherited from the driver or the
  database.
- Voids and columns are **not** stored. They are derived on load, which is the round-trip test's
  sharpest case: a reloaded design must produce the identical void set without ever having persisted
  one.
- Contact data is absent from the stored design. Nothing personal is reachable through a shared
  link.
- The domain package performs no I/O. Only the repository adapter touches the database.

Write path — the semantics a network store needs and a browser store did not:

- **No user interaction blocks on a write.** Tapping a chip applies to the model and the scene
  immediately; persistence happens off that path. A slow or cold database makes writes late, never
  makes the editor feel slow.
- Writes are coalesced rather than one-per-command, and the **final** state always lands. Dropping
  intermediate states is expected; dropping or reordering the last one is a defect.
- A failed write **never reverts the edit** and is **never silent**. The command already succeeded and
  the customer already saw the result; the failure surfaces and the write retries. Which surface
  communicates it is an open question owned by M4 — the mockups have no persistence-failure frame.
- A design that has never been written successfully must not present a shareable link.
- A failed command persists nothing.

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
- **A restored export is untrusted input.** A design loaded from a restore runs the same parse →
  validate → migrate-as-one-transaction sequence as any other load and fails whole if it does not
  pass. Restore is not a privileged path, and a dump may carry older schema versions or the very
  corruption that prompted the restore.
- **The restore procedure is executed once and verified**, against a throwaway target, before this
  phase closes. A procedure that has only been written down is an assumption, not a backup.
- Accepted worst-case data loss is up to roughly a day: beyond Neon's 6-hour window, the most recent
  recovery point is the last nightly export. Recorded as a known consequence of the chosen mechanism.
- M2 has no contact table, so the export carries no personal data yet. **M8 changes that** — a
  database-wide dump would sweep contact submissions into Blob under the 14-day rotation, which
  contradicts the stricter handling contact data is promised. Settle it before M8 adds the table, not
  during.

Boundaries:

- No mutation exists in this phase. `recomputeVoids()` is called from the store, and voids are
  exposed as derived state, never as stored or authored data.
- The void/column module imports no React and no Three.js. Void *meshes* are built in the adapter
  from the derived void records.
- **The superseded M0 domain modules are removed in this phase, not left beside the new ones.**
  `packages/configurator-domain/src` currently holds `placement-layout.ts`,
  `configuration-commands.ts` and the run-anchor/junction/wall-C parts of `schemas.ts` and
  `room-transforms.ts`, all built against the retired model (see M0's status revision). Two working
  placement theories in one package is how a later contributor picks the wrong one. Delete the
  retired paths and their tests as part of wave 2A rather than accumulating a second model alongside
  the first; the pricing engine, the versioning/persistence schema conventions and the wall A/B
  transforms are retained and must not be caught in that deletion. If any retired module turns out to
  have a live consumer, that is a finding for planning, not a reason to keep both.

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
  Postgres on Neon's free tier, storing each design as a `jsonb` document. Provisioned and linked
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
