# Project status

**Read this second, right after `AGENTS.md`, before opening any milestone document.** It exists so a
session can learn where the project stands without reading eight phase plans.

Last updated: 2026-08-25.

## How to use this file

Find the phase you are asked to work on in the table below, then follow its **Read** column.

- **Done** → do not open the milestone document. Its plan is spent. What survives is in the ADRs and
  in the code; the archived plan is history, not instruction.
- **In progress** → read the milestone document. Its status header names exactly what is still open.
- **Planned** → read the milestone document when you start it, not before.

Business logic lives in **`docs/decisions/`**. Those records are the knowledge base — the durable
"why" behind the code. A milestone plan describes an intention at a point in time and goes stale the
moment it ships; a decision record does not. When the two disagree, the dated decision wins.

## Where the project stands

| Phase | Status | Read |
| --- | --- | --- |
| M0 — Foundations | **Done** (closed 2026-08-24, partially superseded) | No — `milestones/done/` |
| M1 — Scene port and fidelity gate | **Done** (closed 2026-08-25) | No — `milestones/done/` |
| M2 — Void engine, picking, persistence | **In progress** — implemented, 2 gates open | Yes — `milestones/M2-void-engine.md` |
| M3 — Insert, remove, swap, client write path | **Planned** — next up | Yes, when starting |
| M4 — Editor panel and shell | Planned | Yes, when starting |
| M5 — Width editing | Planned | Yes, when starting |
| M6 — Price bar and global settings | Planned | Yes, when starting |
| M7 — Step 1, room and presets | Planned | Yes, when starting |
| M8 — Review, contact, success | Planned | Yes, when starting |

## What is actually built

A pnpm monorepo: an I/O-free domain package, a Three.js adapter, a persistence package that is the
only place a Postgres driver appears, and a Next.js App Router app. 302 unit tests plus 4 Playwright
e2e tests, all green; CI enforces nine gates on every push and `.githooks/pre-push` runs them locally
first.

**M0 — Foundations.** The workspace, the domain package, validation, and the persistence/versioning
conventions. A substantial part still stands; the placement model it originally shipped was replaced
in M2 and its retired modules were deleted rather than left beside the new ones.

**M1 — Scene port.** The supplier's kitchen geometry ported into `packages/three-adapter`, rendered
through an R3F canvas with camera presets. Closed on a fidelity gate requiring two independent kinds
of evidence. A structural parity suite diffs the port against vendored reference geometry at 1e-6 m,
and is the guarantee that later phases have not silently degraded the model.

**M2 — Void engine, picking, persistence.** Both waves are implemented. The `Design` schema, the
placement/column/void derivation with all four earned rules of `DEVELOPMENT-SPEC.md` §4, void mesh
rendering, picking, and the store. Then `ConfigurationRepository` over Neon Postgres storing one
`jsonb` document per design, opaque identifiers, a canonical serialiser, a coalesced write path, a
least-privilege database role verified by live assertions, and a daily backup cron to Vercel Blob.

## What is open right now

**M2 cannot close on two gates:**

1. **The restore drill has never been executed.** `docs/runbooks/design-db-restore.md` Path 2 must be
   run once against a throwaway target. The chain is: the project has never been deployed → the cron
   has never fired → no Blob export exists → the drill cannot run. A procedure that has only been
   written down is an assumption, not a backup.
2. **The persistence write path has no browser caller.** `POST /api/designs` exists and works, but
   nothing in `apps/web` client code calls it — no `fetch(`, and `createSaveCoalescer` is constructed
   only in its own test. The read half (`/d/[id]`) is complete. Classified as a contract gap, not a
   defect, and assigned to M3: see
   `docs/decisions/0010-m3-client-write-path-unwired.md`.

**Infrastructure state.** Repository `DumitruSirbu/lemn-conf-v2` (private), CI green. The Vercel
project exists with Root Directory `apps/web` and the Next.js preset, but **is not connected to the
GitHub repository and has never deployed**. Connecting it, deploying, and letting the cron produce
one backup is the prerequisite chain for gate 1.

## What to do next

1. **Connect Vercel to the repo and deploy.** Unblocks M2 gate 1. Requires the dashboard.
2. **M3 Wave 3A** — the domain wave: pure functions over `Design`, needs nothing deployed. The plan
   is written and dispatchable: 12 work items across three waves, with five contract gaps already
   recorded in `docs/decisions/0011-m3-insert-contract-gaps.md`.

M3 also closes M2 gate 2 as a first-class work item, and un-skips the one named `test.skip` in the
e2e suite, which had no void to tap against while the seeded design was fully occupied.

## Keeping this file honest

Update it when a phase changes state, not in a batch later. Two rules, both learned the hard way in
this project:

- **Copy quantitative claims from a command you ran.** Test counts here were wrong once because they
  were carried forward from a commit message instead of counted.
- **Record what is not met, at the criterion.** M2's status claimed its persistence criteria were met
  for several hours after a gap was found. An unmet gate that is written down is manageable; one that
  is quietly assumed to be met is not.
