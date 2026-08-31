# Adversarial review remediation

> **STATUS: PAUSED at the owner's request on 2026-08-31.** SCENE-001 and WEB-001 are complete and
> committed. DOM-001 has not started.

Date: 2026-08-30
Branch: `adversarial-review-reports`
Source reports: `testing-reports/00-index.md`, `testing-reports/04-three-scene.md`,
`testing-reports/02-web-state-and-client-persistence.md`, `testing-reports/03-domain-model.md`.

## Goal

Close the three highest-risk reproduced logic defects without batching unrelated behavior:

1. SCENE-001 — deleted seeded bodies return as unselectable reference ghosts.
2. WEB-001 — pending content can be saved under a different design ID.
3. DOM-001 — persistence accepts documents the executable domain cannot handle.

Each finding is its own wave. A later wave starts only after the current wave has green adversarial
QA, review, coordinator verification, and a real diff that remains within its declared scope.

## Shared constraints

- `design-source/` is ignored and forbidden. Use `docs/design/SPEC.md`,
  `docs/design/DEVELOPMENT-SPEC.md`, `docs/best-practices/product-invariants.md`, the vendored
  `packages/three-adapter/reference/` fidelity anchor, and accepted ADRs.
- Preserve all unrelated uncommitted work, especially
  `docs/runbooks/github-fine-grained-token.md` and `testing-reports/`.
- Do not alter accepted product rules to make a regression pass.
- Pair every behavior change with a regression that fails against the pre-fix implementation.
- Do not commit or push until the coordinator has verified the wave.

## Wave S1 — SCENE-001

Status: **Complete.** Adversarial QA and both Full-tier reviews reported no findings. Coordinator
verification passed `pnpm check`, including 955 domain, 83 live persistence, 708 Three adapter, and
524 web tests (4 pre-existing skips). Browser visual evidence was unavailable because no browser
connection was present; the real headless Three graph and direct `KitchenStage` seam are covered.

Review tier: **Full**, plus visual verification if a real deleted-design surface can be exercised
without unsafe database access. The defect crosses the persisted domain/Three scene boundary and
violates `DEVELOPMENT-SPEC.md` §5.1, §6.1, §10, and regression row 1.

### Scope

- Make the immutable kitchen shell independent of the currently loaded placement records.
- Keep customer bodies exclusively owned by `syncSolidBodies` and identified by `placementId`.
- Preserve the reference geometry and full seeded scene's visible structure.
- Add targeted headless regressions for deletion before the first stage mount.

Expected production surface: the Three adapter's shell/decomposition seam, its public export if
needed, and `apps/web/src/scene/kitchen-stage.tsx`. Avoid unrelated resource-lifecycle work from
SCENE-002.

### Acceptance criteria

1. The shell contains only the documented immutable room children: floor, both walls, right end
   panel, and wall-A backsplash. No cabinet, appliance, accessory, or customer placement survives in
   the shell.
2. Starting from a persisted design with any one deletable seeded placement absent mounts no object
   corresponding to that placement. In particular, removing `p7` leaves no
   `fridge_freestanding` object after first mount/reload.
3. Every visible customer body after sync is owned by exactly one current placement ID; no reference
   body and synced body duplicate each other.
4. The full seeded design still reproduces the reference scene structurally within the existing
   1e-6 m fidelity tolerance.
5. For the same persisted placement set, first mount/reload preserves placement-owned rendered
   bodies and selectability; the shell never reconstructs deleted placements. Domain void identity
   across reload is outside this scene finding: ADR 0011 Gap D deliberately freezes extents only
   within a loaded session, and BACKLOG entry 7 records the remaining cross-reload limitation.
6. Existing domain, Three adapter, and web tests remain green.

### Adversarial QA

- Remove each deletable seeded placement in turn before shell construction, not only `p7`.
- Include the composite hob placement so a standalone reference accessory cannot remain beside its
  placement-owned equivalent.
- Assert the anti-invariant: deriving the shell from current records would make the new regression
  fail.
- Check zero placements and the full seeded design.

### Verification

- `pnpm --filter @lemnaria/three-adapter test`
- `pnpm --filter @lemnaria/web test`
- relevant targeted regression commands reported separately
- inspect the real diff and, where safely reachable, the actual delete/save/reload scene

## Wave S2 — WEB-001

Status: **Complete.** Adversarial QA found and verified Q2.1; Full review found and verified R1.1–
R1.3. Both continuity reviews closed every finding with no new issues. Coordinator verification
passed `pnpm check`, including 955 domain, 83 live persistence, 708 Three adapter, and 549 web tests
(4 pre-existing skips).

Review tier: **Full**. Snapshot design identity and content into one immutable save job; scope
callbacks and timers to the originating design/generation. Test pending and in-flight A -> hydrate B,
null-ID mint -> hydrate B, and both completion orders. Do not begin until S1 closes.

### Scope

- Treat `{ designId, design, generation }` as one immutable save job captured when the edit is
  scheduled; a later hydrate must never retarget its repository call.
- Advance the generation when the singleton store hydrates a different loaded design, and apply
  save IDs/status callbacks only while their originating generation is still current.
- Preserve coalescing, minimum-interval, retry/backoff, per-design refusal, mint-on-first-write, and
  non-blocking command behavior. Do not broaden into WEB-002 authorization UX or WEB-003 revision
  conflict handling.
- Keep pending work from different generations distinguishable so an edit for A cannot be written
  to B or silently replace B's work (or vice versa).

### Acceptance criteria

1. Pending A content that starts after hydrate B is still sent with A's captured ID, never B's.
2. An in-flight A save resolving after hydrate B cannot change B's `designId`, persisted flag, save
   status, or write-access state.
3. A null-ID mint resolving after hydrate B cannot move the store back to its newly minted A ID;
   the minted row still receives only A content.
4. If A and B saves resolve in either order, each repository call keeps its own ID/content pair and
   only callbacks for the current generation affect the store.
5. Same-generation rapid edits still coalesce to the newest state, retry the newest unwritten
   state, obey the one-second successful-save interval, and never run concurrent writes.
6. Existing web, domain, adapter, and persistence tests remain green.

### Adversarial QA

- Use controlled promises and fake timers at both the coalescer and singleton-store wiring seams.
- Exercise pending, interval-delayed, retry-delayed, and in-flight transitions from A to B.
- Include two successive null-ID generations so `null` alone cannot be mistaken for identity.
- Assert stale `onSaved`, `saving`, `idle`, `error`, `stopped`, and `unauthorized` callbacks cannot
  overwrite the current design's state.

### Verification

- focused save-coalescer and configurator-store persistence tests
- `pnpm --filter @lemnaria/web test`
- `pnpm check` after QA and Full-tier review

## Wave S3 — DOM-001

Status: **Not started.** No domain, API-validation, migration, or persistence-load changes were
made before the remediation milestone was paused.

Review tier: **Full**, including security review. Separate wire-shape parsing from semantic domain
validation and enforce the same executable-design contract at API write and database load. Cover
unique IDs, catalog membership, supported positive dimensions/coordinates, timestamp ordering,
bounded cardinality, and invalid stored rows. Do not begin until S2 closes.
