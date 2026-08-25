# Project status

**Read this second, right after `AGENTS.md`, before opening any milestone document.** It exists so a
session can learn where the project stands without reading eight phase plans.

Last updated: 2026-08-25 (M3 Wave 3A committed; toolchain enforcement added).

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
| M2 — Void engine, picking, persistence | **In progress** — implemented, 1 gate open (the unwired client write path, owned by M3) | Yes — `milestones/M2-void-engine.md` |
| M3 — Insert, remove, swap, client write path | **In progress** — Wave 3A done; **3B next** | Yes — `milestones/M3-mutations.md` |
| M4 — Editor panel and shell | Planned | Yes, when starting |
| M5 — Width editing | Planned | Yes, when starting |
| M6 — Price bar and global settings | Planned | Yes, when starting |
| M7 — Step 1, room and presets | Planned | Yes, when starting |
| M8 — Review, contact, success | Planned | Yes, when starting |

## What is actually built

A pnpm monorepo on Node 24: an I/O-free domain package, a Three.js adapter, a persistence package
that is the only place a Postgres driver appears, and a Next.js App Router app. **578 unit tests**
(domain 335, three-adapter 30, persistence 163, web 50) plus 4 Playwright e2e tests and one
`test.skip`, all green — counted from a full `pnpm ci:local` run on 2026-08-25, not carried forward.
Each package owns its tests in its own `tests/` directory and must stay liftable into its own
repository — see `docs/best-practices/engineering-conventions.md`.

**The toolchain is enforced, not merely documented.** `.npmrc` sets `engine-strict=true`, so every
pnpm command in this repository hard-fails on any Node outside `>=24 <25`; `scripts/local-ci.sh`
additionally pins pnpm to the exact `packageManager` version CI installs. This exists because a full
local gate run passed on Node 20 while CI runs 24 — pnpm reported the mismatch as one WARN in a long
log. Details: `docs/best-practices/ci-and-local-gates.md`.

Decisions and findings live in `docs/decisions/` as numbered ADRs with an index at
`docs/decisions/README.md`. The product's behavioural rules are **not** duplicated there: they stay
in `docs/design/DEVELOPMENT-SPEC.md`, cited by section and row.

**M0 — Foundations.** The workspace, the domain package, validation, and the persistence/versioning
conventions. A substantial part still stands; the placement model it originally shipped was replaced
in M2 and its retired modules were deleted rather than left beside the new ones.

**M1 — Scene port.** The supplier's kitchen geometry ported into `packages/three-adapter`, rendered
through an R3F canvas with camera presets. Closed on a fidelity gate requiring two independent kinds
of evidence. A structural parity suite diffs the port against vendored reference geometry at 1e-6 m,
and is the guarantee that later phases have not silently degraded the model.

**M3 — Insert, remove, swap (Wave 3A done).** The domain command layer: `insertBody`, `insertFit`,
`removePlacement`, the `{ok}`/`{ok:false, reason}` result contract, the §7 insertable catalogue,
band and accessory rules, and a `BodyProbe` port. Wave 3A is the first wave to run the complete
`docs/WORKFLOW.md` cycle — plan → implement → adversarial QA → review → verify → commit — and the
cycle earned its cost twice. QA found 15 failures against 135 green tests, including an
`insertBody` that would build a **288 mm carcass** where §2's narrowest cabinet is 300, because
`FIT_TOLERANCE_M` (manufacturing slack on a *fit*) was lowering the body's own minimum. Clean-code
review then found that fixing it had made that fix's own test vacuous — the early return now fires
before the assertion. Both survived all eight gates. See
`docs/decisions/0015-min-span-is-exclusive.md`, which also records that the independent logic
reviewer was dispatched and never reported, so the coordinator verified instead — weaker, and worth
re-running.

**M2 — Void engine, picking, persistence.** Both waves are implemented. The `Design` schema, the
placement/column/void derivation with all four earned rules of `DEVELOPMENT-SPEC.md` §4, void mesh
rendering, picking, and the store. Then `ConfigurationRepository` over Neon Postgres storing one
`jsonb` document per design, opaque identifiers, a canonical serialiser, a coalesced write path, a
least-privilege database role verified by live assertions, and a daily backup cron to Vercel Blob.

## What is open right now

**M2 cannot close on one remaining gate** (the restore drill, gate 1 below, was met 2026-08-25):

1. ~~**The restore drill has never been executed.**~~ **Done 2026-08-25 — this gate is met.** Path 2
   was drilled end to end with a real 25-placement design: exported through the same read the cron
   performs, restored into a throwaway database, and verified by identical canonical serialisation.
   It found **five defects**, four in the runbook itself, all fixed — including a `pnpm run migrate`
   that exited 0 without migrating anything on any path containing a space. See
   `docs/decisions/0013-restore-drill-executed-and-what-it-broke.md`.

   Not yet drilled, and named there: downloading the export from Blob (the token is
   Production-scoped), and Path 1 (Neon PITR). Re-run Path 2 from a real downloaded export once M3
   wires the write path and production holds a design worth losing.
2. **The persistence write path has no browser caller.** `POST /api/designs` exists and works, but
   nothing in `apps/web` client code calls it — no `fetch(`, and `createSaveCoalescer` is constructed
   only in its own test. The read half (`/d/[id]`) is complete. Classified as a contract gap, not a
   defect, and assigned to M3: see
   `docs/decisions/0010-m3-client-write-path-unwired.md`.

**Infrastructure state — live as of 2026-08-25.** Repository `DumitruSirbu/lemn-conf-v2` (private),
CI green on nine gates, and `.githooks/pre-push` runs the same gate set locally so a red build never
reaches GitHub. Vercel is connected to the repository and deploys `main` to production
automatically; Root Directory `apps/web`, Next.js preset, Node 24. The backup cron
`/api/cron/backup-designs` is registered on `0 3 * * *` and has produced its first export.

Verified live: `/configurator/configure` serves 200, and the cron endpoint returns 401 to an
unauthenticated caller and to a wrong bearer token — it fails closed.

## A decision only you can make

**ADR 0014 (S1) is Proposed, not Accepted, and needs a human answer before M7.** The deployed
`PUT`/`PATCH /api/designs/[id]` has no authentication or ownership check — confirmed live. The
opaque nanoid is the only access control and it confers *write*, so anyone holding a shared link can
silently overwrite that design, unrecoverably. Three coherent options are laid out in the record
(accept the capability URL as a stated POC limit, split read from write, or add ownership). Impact is
low today — zero designs, no users — and stops being low at M7. Do not let a later phase default
into one of these silently.

## What to do next

1. **M3 Wave 3B (adapter)** — parameterised builders, the `measureBuiltBody` probe implementation,
   and a rebuildable scene. **Full review tier**: §11 row 19 (wall seating) is in scope, and it is
   where M1's fidelity can silently degrade. Follow `docs/WORKFLOW.md`; it is mandatory, not
   advisory.
2. **Then Wave 3C (web)** — store commands and the client write path, which closes M2's last gate.

Wave 3A is done. Five contract gaps against the shipped M2 code are recorded in
`docs/decisions/0011-m3-insert-contract-gaps.md`; treat them as decided, not open.

Worth folding into 3B's review: an independent logic pass over Wave 3A's void-derivation boundary,
which ADR 0015 flags as verified by the coordinator rather than by a neutral reviewer.

M3 closes M2's last gate as a first-class work item — the client write path, wave 3C item 10 — and
un-skips the one named `test.skip` in the e2e suite, which had no void to tap against while the
seeded design was fully occupied.

Worth re-running once M3 lands: Path 2 of the restore drill, this time from an export downloaded
from Blob and containing a design a customer actually made.

## Keeping this file honest

Update it when a phase changes state, not in a batch later. Two rules, both learned the hard way in
this project:

- **Copy quantitative claims from a command you ran.** Test counts here were wrong once because they
  were carried forward from a commit message instead of counted.
- **Record what is not met, at the criterion.** M2's status claimed its persistence criteria were met
  for several hours after a gap was found. An unmet gate that is written down is manageable; one that
  is quietly assumed to be met is not.
