# Architecture Decision Records

This directory is the project's decision log. In this repository an ADR records **our decisions and
findings** — why the code is shaped the way it is, what was tried and rejected, and what a review
turned up that changed a plan. It is not where the product's behavioural rules live: those are
`docs/design/DEVELOPMENT-SPEC.md`, cited by section and row (e.g. "§5.2", "§11 row 19"), never
duplicated into a decision record. A dated ADR supersedes earlier prose anywhere else in the
repo — `docs/CONFIGURATION_MODEL.md`, `docs/ARCHITECTURE_PROPOSAL.md`, milestone plans — but it
does not replace the behavioural spec as the source of truth for what the product does.

Read `docs/STATUS.md` first for where the project currently stands. Come here for the "why" behind a
piece of code; come here before re-deciding anything, since a dated record must not be silently
overturned.

## Index

| ADR                                                            | Title                                                | Status                                        | Type                | Milestone      | Settles |
| ---------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------ | ---------------------- | ----------------- | --------- |
| [0001](0001-initial-product-and-stack.md) | Initial product and stack decisions | Accepted (decision 3 → ADR 0003; decision 7 half → ADR 0002) | Decision | M0 — Foundations | Stack choice, preset adaptation model, sample-price/locale/contact rules, provider-neutral API before CRM. |
| [0002](0002-db-backed-shareable-persistence.md) | Persistence: a managed Postgres database with shareable design links | Accepted (Neon provisioning detail → ADR 0007) | Decision | M2 — Void engine, picking, persistence | Server-side Postgres/Neon store, one `jsonb` document per design, opaque link identifier, security baseline, two-tier backups, non-blocking coalesced write path, canonical-serialisation round-trip invariant. |
| [0003](0003-design-reference-supersession.md) | Design-reference supersession: void/column domain model replaces the run-anchor model | Accepted | Decision | Cross-cutting — established the M1–M8 roadmap | Placements + derived voids as the domain model; what is retired (reorder, run anchors, junction groups, wall C/linear layout, undo, obstacles) and what is retained; the five-screen flow; desktop/mobile parity rule; 3D port fidelity gate; build sequencing. |
| [0004](0004-m2-pricing-engine-deletion.md) | Delete `pricing-engine.ts` in M2 Wave 2A instead of retaining it | Accepted | Decision | M2 Wave 2A | Deletes the old pricing engine and `ContactSubmissionSchema` with it rather than keeping a second placement theory alive; pricing is rebuilt in M6 against the `Design`/frame model. |
| [0005](0005-m2-row19-m1-wall-gap-finding.md) | M1's `buildKitchen()` seats 6 bodies 10–20mm proud of the wall plane | Accepted | Finding + Decision | M2 Wave 2A | Pre-existing M1 wall-seating defect found during decomposition-parity work; fixed at the source (both the port and the reference) rather than carried as an accepted exception. |
| [0006](0006-tests-never-touch-the-application-database.md) | Live database tests run against a separate database, never the application's | Accepted (least-privilege item → ADR 0008) | Decision | M2 Wave 2B | A dedicated `lemnaria_test` database, a hard guard against pointing at `DATABASE_URL`, and per-test cleanup for the live persistence suite. |
| [0007](0007-standalone-neon-instead-of-vercel-managed.md) | Postgres moves from Vercel-managed Neon to a standalone Neon project | Accepted (work-item-8 consequence → ADR 0008) | Decision | M2 Wave 2B | Moves off the Vercel Marketplace Neon integration to a directly-owned Neon project, unblocking console/SQL access for role creation and cleaner test-database isolation. |
| [0008](0008-least-privilege-database-role.md) | The application connects as a least-privilege role, not the database owner | Accepted (Preview item → ADR 0009) | Decision | M2 Wave 2B | `app_designs` role (SQL-created, to avoid the `neon_superuser` trap) holding only `SELECT, INSERT, UPDATE` on `designs`; migrations use a separate owner connection; verified by a live privilege test. |
| [0009](0009-deployment-configuration-gaps.md) | Deployment configuration is not yet set up; the backup cron will not fire as-is | Accepted | Finding + Decision | M2 Wave 2B | Four deployment gaps (Root Directory/`vercel.json` location, Framework Preset, missing Preview `DATABASE_URL`, missing `CRON_SECRET`) found and resolved before first deploy. |
| [0010](0010-m3-client-write-path-unwired.md) | M2's write path exists but has no production caller; M3 owns the wiring | Accepted | Finding + Decision | M3 — Insert, remove, swap, client write path | The save-coalescer and mint route have no browser caller yet; M3 delivers the client `ConfigurationRepository`, the wired coalescer, and mint-on-first-mutation. |
| [0011](0011-m3-insert-contract-gaps.md) | Five contract gaps between M3's insert/remove sketch and the shipped M2 code | Accepted | Finding + Decision | M3 — Insert, remove, swap, client write path | Two catalogue shapes reconciled via an `insertable` flag; a `BodyProbe` port for wall-seat offsets on inserted bodies; `top` treated as a row, not a catalogue band; columns frozen at load time; delete cascades to hosted accessories. |
| [0012](0012-scheduled-export-is-a-scoped-sql-select.md) | The scheduled export is a scoped SQL select to ndjson, not `pg_dump` | Accepted (closes ADR 0002 open questions 8 and 9) | Decision + Finding | M2 Wave 2B | How the backup is produced without a `pg_dump` binary, why it stays scoped to `designs`, the daily cron schedule, and the empty-table export defect found on the first production run. |
| [0013](0013-restore-drill-executed-and-what-it-broke.md) | The restore drill was executed, and found five defects the runbook hid | Accepted | Finding + Decision | M2 Wave 2B | Path 2 drilled end to end with a real design (identical canonical serialisation); five defects fixed, including a `migrate` CLI that exited 0 without migrating anything on any path containing a space. |
| [0014](0014-unauthenticated-write-surface.md) | The deployed write surface is unauthenticated; the capability-URL model needs a decision | **Proposed — needs a human decision on S1 before M7** | Finding | M2 Wave 2B (found during a catch-up security review) | Four findings on the live server surface: `PUT`/`PATCH` has no auth or ownership check (S1, confirmed against production), validation failures returned the full Zod error tree (S2, fixed), `POST` is unauthenticated and unthrottled (S3), and no rate limiting exists (S4). |
| [0015](0015-min-span-is-exclusive.md) | `MIN_SPAN_M` is exclusive: a free span of exactly 300 mm produces no void | Accepted | Finding + Decision | M3 Wave 3A | Resolves a spec ambiguity where §4's pseudocode says strictly-greater three times while the constants table and M2's criterion read as inclusive; the pseudocode governs. |
| [0016](0016-hood-chimney-is-carcass.md) | The hood's carcass is its canopy **and** its chimney | Accepted | Finding + Decision | M3 Wave 3B | The milestone's carcass mesh pattern matched only `hood_canopy` (130 mm) while §7 fixes the hood at 710 mm, which would have made every hood insert fail `BUILT_SIZE_MISMATCH` while the offer list still offered it. |
| [0017](0017-sink-base-minimum-width.md) | A catalogue entry may declare a minimum width; `base-sink`'s is 560 mm | Accepted | Finding + Decision | M3 Wave 3B (fixed in the domain) | `base-sink` was offered into any base opening from 300 mm while its builder's fixed 560 mm aperture makes it unbuildable below that; adds an optional `minWidthMm` read by both the insert guard and §9's offer filter. |
| [0018](0018-frame-depth-is-rear-overhang.md) | `frame.d` is twice a body's rear overhang, not its depth | Accepted | Finding | M3 Wave 3B (structural fix scheduled) | The persisted seat encoding is exact for placement but is not a depth; rebuilding from it will compound once any builder gains a depth parameter, which ADR 0017 names as the next step. |
| [0019](0019-security-baseline-writes-throttling-retention.md) | Security baseline: write authorisation, layered throttling, and retention | Accepted (supersedes ADR 0014) | Decision | M3 Wave 3C and M8 | Splits read from write via a per-design write-token cookie; layers Vercel WAF edge limits over exact Postgres counters; rate-limit identity as independent buckets (IP /24 and /64, session, email, global) with the most restrictive winning; geo as a first-class signal since traffic is essentially Moldova-only; 30-day retention for abandoned designs; an emailed edit link instead of a password; no external proxy. |

## Supersessions

Beyond the index's "Status" column, these are the specific claims that were overtaken by a later
record. The superseded text stays in place, struck through, with a pointer to the record that
replaced it — nothing is deleted or rewritten silently.

- **ADR 0001** decision 3 (windows/doors in the first release) → superseded by **ADR 0003** (not
  present in the design reference; retired from near-term scope).
- **ADR 0001** decision 7, the "temporary persistence adapter" half → superseded by **ADR 0002**
  (a server-side Postgres database, not a temporary adapter).
- **ADR 0002** Consequences' Vercel-managed Neon provisioning (`neon-gray-elephant`) → superseded
  by **ADR 0007** (standalone Neon project, Marketplace integration disconnected).
- **ADR 0006** "Still open" (application connects as `neondb_owner`) → superseded by **ADR 0008**
  (least-privilege `app_designs` role).
- **ADR 0007** Consequences' "work item 8 remains open" → superseded by **ADR 0008** (role
  created, application repointed at it).
- **ADR 0008** "Still open" (Preview has no `DATABASE_URL`) → superseded by **ADR 0009** (Preview
  provisioned with its own database and role, same day).
- **ADR 0014**'s Proposed status and its open S1/S3/S4 → superseded by **ADR 0019** (read/write
  split, layered throttling, retention). S2 was already fixed in place.

## Adding the next one

1. Take the next free number (`0020`, …).
2. Name the file `NNNN-kebab-case-title.md` in this directory.
3. Give it the same header block every record here uses, directly under the `# ADR NNNN — Title`
   line:

   ```
   Status: Accepted
   Date: YYYY-MM-DD
   Type: Decision | Finding | Finding + Decision
   Milestone: <phase or wave this belongs to>
   ```

4. Write Context / Decision / Alternatives considered / Consequences, matching the existing records'
   shape. If it overtakes a claim in an earlier record, strike that claim through in place, point it
   at the new ADR number, and add the pair to the Supersessions list here — don't delete the old
   text.
5. Add its row to the Index table above.
