# Adversarial review remediation

> **STATUS: COMPLETE, corrected 2026-09-02.** Every finding from `testing-reports/00-index.md` through
> `04-three-scene.md` is closed or deliberately deferred. Closed: SCENE-001 (wave S1, `db9c402`),
> WEB-001 (S2, `b0400ac`), DOM-001 + SEC-002 (S3, `47e2552`), SEC-003 + SEC-004 (S4, `96293c5`,
> ADR 0041), DB-001 + DB-002 + DB-003 (S5, `e666d96`), DOC-001 (S6, `c5df227`), WEB-002 + WEB-004 (S7),
> SCENE-002 (S8), DOM-002 (S9, ADR 0040's 2026-08-31 amendment — one residual, S9-F1, recorded open in
> `docs/BACKLOG.md`), DB-004 (S10, ADR 0042), WEB-003 (S11, migration `0004_add_design_revision.sql`),
> and DOM-003 (S12, in `docs/milestones/dom-003-set-width-split.md`). **Only SEC-001 remains open** —
> deferred to M8 by the owner's decision (`f342752`, ADR 0019's 2026-08-31 correction, and
> `M8-review-contact-success.md`'s launch gate) — a gated launch check, not scheduled work.
>
> **Correction to this banner, made 2026-09-02.** It previously (wrongly) still listed WEB-002,
> WEB-003, WEB-004, SCENE-002, DOM-002, DOM-003 and DB-004 as open. Waves S7–S12 below, all dated
> 2026-08-31/2026-09-01, close every one of them — confirmed against the live tree, not only the
> prose: `packages/persistence/src/migration-ledger.ts`,
> `packages/persistence/src/migrations/0004_add_design_revision.sql`, and the nine-module
> `set-width.ts` split all exist on `main`. `docs/STATUS.md`'s *Adversarial review remediation* entry
> is the durable, current record; this file is now historical detail beneath it.

Date: 2026-08-30
Branch: `adversarial-review-reports`
Source reports: `testing-reports/00-index.md`, `testing-reports/04-three-scene.md`,
`testing-reports/02-web-state-and-client-persistence.md`, `testing-reports/03-domain-model.md`.

## Goal

Close the three highest-risk reproduced logic defects without batching unrelated behavior:

1. SCENE-001 — deleted seeded bodies return as unselectable reference ghosts.
2. WEB-001 — pending content can be saved under a different design ID.
3. DOM-001 — persistence accepts documents the executable domain cannot handle.

Each finding was run as its own wave: a later wave started only after the current wave had green
adversarial QA, review, coordinator verification, and a real diff that stayed within its declared
scope. The three above grew into twelve waves (S1–S12) as later reports (`02-`, `03-`, `04-`) were
worked through the same discipline.

## Shared constraints

- `design-source/` is ignored and forbidden. Use `docs/design/SPEC.md`,
  `docs/design/DEVELOPMENT-SPEC.md`, `docs/best-practices/product-invariants.md`, the vendored
  `packages/three-adapter/reference/` fidelity anchor, and accepted ADRs.
- Do not alter accepted product rules to make a regression pass.
- Pair every behavior change with a regression that fails against the pre-fix implementation.
- Do not commit or push until the coordinator has verified the wave.

## Wave S1 — SCENE-001 (closed)

The immutable kitchen shell was reading currently-loaded placement records, so a deleted seeded body
came back as an unselectable reference ghost. Fixed by making the shell independent of placement
records and keeping customer bodies exclusively owned by `syncSolidBodies`, identified by
`placementId`. Adversarial QA and both Full-tier reviews reported no findings. Coordinator
verification passed `pnpm check` (955 domain, 83 live persistence, 708 Three adapter, 524 web tests).
Commit `db9c402`.

## Wave S2 — WEB-001 (closed)

Pending save content could be written under a different design's ID when a hydrate raced an in-flight
save. Fixed by treating `{ designId, design, generation }` as one immutable save job captured at
schedule time, with a generation counter that scopes later callbacks to the design that scheduled
them. Adversarial QA and Full review each found and verified one finding, both closed by a continuity
review. Coordinator verification passed `pnpm check` (955 domain, 83 live persistence, 708 Three
adapter, 549 web tests). Commit `b0400ac`. **Three Low residuals** on this fix are still open —
recorded in `docs/STATUS.md`'s *What is open right now*, not here.

## Wave S3 — DOM-001 + SEC-002 (closed)

Persistence accepted documents the executable domain could not handle: wire-shape parsing and
semantic domain validation were the same step. Fixed with a bounded `DesignSchema`
(`packages/configurator-domain/src/design-bounds.ts`), a new `validateDesignForCatalog` /
`assertDesignValidForCatalog` pair run at both the API write seam and the database load seam, and a
byte-limited request reader (`read-body-with-limit.ts`, SEC-002) ahead of it. Every numeric bound is
derived from an existing catalogue or shell constant, not chosen (table of derivations was in this
file; the values live in `design-bounds.ts` now). Two rounds of review (F1–F3, then a continuity
review finding 1–3) hardened stream-error handling and corrected an overstated residual-risk claim.
A second addendum fixed three places that were echoing a stored document's own content back into an
error response (`design-errors.ts`, `migrate-design.ts`, `repository.ts`). Final gates: domain 982
tests, web 604 tests (11 in the addendum's `payload-limits.test.ts`), Three adapter 708 tests, all
green. Commit `47e2552`. **Two named gaps, deliberately not fixed:** `Design.room` doesn't describe
the shipped scene (containment bounds against the room's longer run, not per-wall — a product
decision, not this wave's); and there is no overlap rule (needs the void engine's own overlap
semantics). Both recorded here as the durable statement of what DOM-001 does not cover.

## Wave S4 — SEC-003 + SEC-004 (closed)

**SEC-003** — `/internal/scene-shot` accepted unbounded WebGL dimensions. Fixed with a clamp
(`MAX_WIDTH = 1920`, `MAX_HEIGHT = 1080`, `MIN_SIZE = 1`) and a gate: the route 404s in production
unless `LEMNARIA_ENABLE_SCENE_SHOT_ROUTE=1`, which must stay unset in the deployed application.
**SEC-004** — the browser security policy is now versioned in the repository
(`src/lib/security-headers.ts`): six static headers enforcing immediately, and a nonce-based CSP
shipped `Content-Security-Policy-Report-Only` (no report sink exists, so `"enforce"` is blocked on
two preconditions — a violation collector, and five prerendered routes that carry no nonce). Full
decision record, including the `Strict-Transport-Security` scope trade and the withheld `preload`:
**ADR 0041**. Two review rounds (six then five findings, all applied) and a production-build
verification (`next start`, real 404/200 checks, live headers, zero CSP console output) are recorded
in ADR 0041, not duplicated here. Commit `96293c5`.

## Wave S5 — DB-001 + DB-002 + DB-003 (closed)

The destructive-test database guard decided by comparing hostnames, which a pooled vs. direct Neon
endpoint defeats; a truncated backup export could survive as the newest export; and an injected error
name could break a log line. Fixed with a name allowlist (`ALLOWED_TEST_DATABASE_NAMES`) checked
before `DATABASE_URL` is even read, `isWalkComplete()` failing an export that didn't finish, and a
clamped `errorName`. Two review rounds (S5-1…S5-4, then NEW-1/NEW-2) and a continuity review
(findings 1–4) hardened backup pathname collisions, error-code typing, and cleanup logging. The
allowlist question — `lemnaria_test` was never created; `TEST_DATABASE_URL` actually targets
`lemn-conf-v2-staging` — was resolved by the owner as a dated amendment to
**`docs/decisions/0006-tests-never-touch-the-application-database.md`**, not re-litigated here.
Final gates: persistence 11 files / 98 tests, web backup+cron tests 21 passed, both green. Commit
`e666d96`.

## Wave S6 — DOC-001 (closed)

Documentation-only close-out: `STATUS.md`'s waves marked shipped, ADR 0038 corrected with a dated
amendment (not a rewrite), a `WORKFLOW.md` close-out check added, and three `.env.example` decision
links repaired after ADR renumbering. Tier was coordinator-only — no code, test, env var or resource
changed. A review round on the close-out itself found two defects of the exact class the wave existed
to prevent (an uncited date, and a close-out check whose grep pattern was case-sensitive against a
history that isn't) — both fixed, and the lesson recorded: a documentation wave that stops drift
drifted, and the fix for that is running the check against real data, not knowing the failure mode in
the abstract. Commit `c5df227`.

## Wave S7 — WEB-002 + WEB-004 (closed)

**WEB-002 (Medium)** — `/d/{id}` rendered `canWrite: "unknown"` as writable, so a share-link reader
on a slow or blocked API could edit before the write-access probe answered, with controls disabled
only after the write was refused. Fixed by naming the unanswered states explicitly (`"checking"`,
`"check-failed"`) so only a confirmed `true` unlocks the panel, plus a retryable notice on probe
failure. **WEB-004 (Low)** — a debug overlay (`SelectionDebug`) shipped to every customer, publishing
selection state into DOM attributes. Fixed behind
`NEXT_PUBLIC_LEMNARIA_ENABLE_SELECTION_DEBUG=1`, default off, with no development exemption. Review
found the fix for WEB-002 had converted a hang (a blocked-and-hanging API, not just
blocked-and-rejecting) into a permanent dead end; fixed with a 10-second read timeout
(`LOAD_TIMEOUT_MS`). A 32px touch target on the retry control was also fixed to the 44px minimum.
Gates: web 40 files / 634 passed (4 skipped), typecheck and lint clean; the one e2e failure
(`signature-flow.e2e.spec.ts`) was confirmed pre-existing by reproducing it on the stashed tree.
**Known limitation, recorded and accepted:** nothing in CI asserts the WEB-004 gate against a real
`next build` output, so a deployed environment setting the flag would not be caught automatically —
`.env.example` carries the warning; no enforcement exists.

## Wave S8 — SCENE-002 (closed)

React Three Fiber's reconciler never disposes a `<primitive>`, so every client-side stage remount
stranded a kit's shared geometry, materials, canvas textures, lights, ground and contact blob. Fixed
by recording resource ownership as a kit builds (`kit-ownership.ts`, a `WeakMap` keyed on kit
identity) rather than inferring it at teardown, with two disposal rules in `kit-disposal.ts`:
whole-stage teardown on unmount, and partial teardown for bodies `buildKitchenShell` discards. A
review round found a High-severity latent defect — releasing a kit's ownership record left a second,
empty record behind, so a later reader could see "the kit owns nothing" about buffers the kit's own
memo still handed out — fixed by emptying the record in place instead of deleting it, plus an
`isReleased` guard on the one path StrictMode's replayed mount cannot reach safely. Gates: Three
adapter 32 files / 720 tests, web 40 files / 639 tests, both green. **Not done, and why:** no
`renderer.info.memory` browser gate — both test suites run in a `node` environment with no WebGL
context, so a headless assertion would be dishonest; a real browser stress gate belongs in
`apps/web/tests/e2e/` and was out of this wave's scope. **Found and not fixed (S8-F4, out of
scope):** `stage.ts`'s `PMREMGenerator` render target framebuffer is never freed — pre-existing,
untouched by this wave's diff, recorded rather than lost.

## Wave S9 — DOM-002 (closed, one residual open)

`occupiedDepthM` — the single answer to "how deep is the space a body fills" — fell through to
`frame.d` (not a depth: ADR 0018) for every body kind but two. Fixed by making `occupiedDepth` a
required declaration on every catalogue entry, under two rules (`recorded-shell` and `wall-plane`),
with an unknown/unrecognised rule failing closed. Eight of the shipped kitchen's twelve columns
publish a different (larger) depth as a result, which also moves each column's off-wall origin and
widens its rendered void highlight — verified live in the browser at 390×844, zero console errors.
This partially supersedes ADR 0040 decision 1's third arm; the amendment is dated 2026-08-31 in ADR
0040 itself, not restated here. Gates: domain 1041 tests, Three adapter 889 tests, web 639 tests, all
green.

**The three measured-figures tables below are kept verbatim, unlike the rest of this wave's record.**
ADR 0051's own evidence sweep (decision row for
`docs/milestones/adversarial-review-remediation.md`) requires them to stay exactly as measured on
2026-08-30, each carrying its own dated 2026-09-01 correction pointer rather than being edited — "the
tables themselves are unedited: they record what was measured then, and DOM-002's story depends on
them." They are not compressed here for that reason.

### The measured figures

Every number was read off the built geometry with the real builders and the real `BodyProbe`, seated
the way §11 row 19 seats a placement (`frame.d / 2 + box.max.z`, the full extent §3.1 asks for).
**Three of the report's four figures are right and one is wrong:**

| Body family                     | Report | Measured | Verdict                                          |
| ------------------------------- | ------ | -------- | ------------------------------------------------ |
| base (seat 580)                 | ~620   | **620**  | confirmed — the `countertop` mesh, 620 deep       |
| tall (seat 560)                 | 599    | **599**  | confirmed — carcass 560 + the same 39 mm front    |
| freestanding fridge (seat 680)  | 742    | **742**  | confirmed — appliance body + its two door bars    |
| corner (seat 560)               | 580    | **630**  | **wrong** — see below                             |

`base-corner-x-900`'s 580 came from the source comment's arithmetic (600 mm carcass, seated 20 mm
inside the wall). The geometry says otherwise: its group runs `-300..350`, and the leg carries a
**corner** worktop that reaches 350 mm from its origin, so seated at 280 it finishes 630 mm from the
wall plane. 630 is what is declared.

Four bodies the report's table does not name are also not their seat, and the sweep found them:

| Body                                        | Seat | Occupied | What reaches furthest        |
| ------------------------------------------- | ---- | -------- | ----------------------------- |
| `base-dishwasher` / `base-dishwasher-600`   | 580  | 632      | the appliance's door bar     |
| `base-hob-oven`                             | 580  | 648      | the oven fascia and its bar  |
| `tall-oven-tower` / `tall-oven-tower-600`   | 560  | 638      | the oven and microwave bars  |
| `base-corner-return-320`                    | 580  | 600      | its worktop                  |

> **2026-09-01 — the dishwasher's 632 is history, not current.** This table records what was measured
> on 2026-08-30. [ADR 0051](../decisions/0051-the-dishwasher-niche-wears-a-decor-door.md) removes the
> appliance's own door bar from `dishwasherHousing` and gives it a decor door instead, so
> `base-dishwasher` and `base-dishwasher-600` now occupy **620 mm**, deepest member the door's bar
> rather than the appliance's. See ADR 0040's 2026-09-01 correction for the durable record.

### Existing assertions whose meaning changed

None was adjusted to make the change pass without the number being wrong before. Each is a literal
pinning a **column's** or an **opening's** depth, and each now pins the space its members fill
instead of the seat encoding they record. The property each test asserts is unchanged.

| Test                                                            | Was | Now | Why the old number was wrong                                             |
| --------------------------------------------------------------- | --- | --- | ------------------------------------------------------------------------ |
| domain `insert-depth.test.ts` — "builds to the head-clearance cap" | 580 | 632 | the emptied column's deepest member is a dishwasher niche, which fills 632 |
| domain `insert-depth.test.ts` — "reads the outgoing body's own depth" | 580 | 620 | `A\|1.30`'s base cabinet fills its worktop's 620                          |
| adapter `insert-depth.qa.test.ts` — cleared fridge column        | 680 | 742 | the fridge fills 742; 680 is its seat                                     |
| adapter `insert-depth.test.ts` — re-inserted top-row cabinet     | 600 | 620 | the hood is no longer the column's deepest member; the base run's 620 is  |
| adapter `resize-depth.test.ts` — `BASE_DEPTH_MM`                 | 580 | 620 | renamed `BASE_OCCUPIED_DEPTH_MM`; the file's own `depthMm` reads occupied depth, and a base run occupies 620 |

Each of those five is a "the trap, stated" assertion whose point is that the frozen opening is deeper
than what gets built. Every one of them got **sharper**, not weaker.

> **2026-09-01 — the first row's 632 is history.** [ADR 0051](../decisions/0051-the-dishwasher-niche-wears-a-decor-door.md)
> moves the dishwasher niche's occupied depth to 620, so a column whose deepest member is a
> `base-dishwasher` now fills 620, not 632. This table is unedited because it records what wave S9
> found true at the time; see ADR 0040's 2026-09-01 correction.

### The per-column behaviour change

**Eight of the shipped kitchen's twelve columns publish a different depth.** Measured by deriving
the seeded columns and comparing each against what the pre-fix `occupiedDepthM` would have answered
for the same members:

| column | before | after | delta | deepest member now |
| ------ | ------ | ----- | ----- | ------------------ |
| `A\|0.45` | 560 | 630 | +70 | the corner leg's corner worktop |
| `A\|1.30`, `A\|3.20` | 580 | 620 | +40 | a base run's worktop |
| `A\|2.00` | 580 | 632 | +52 | the dishwasher's door bar |
| `A\|2.60` | 600 | 620 | +20 | the base run — the hood is no longer deepest |
| `B\|0.74` | 580 | 600 | +20 | the corner return's worktop |
| `B\|1.20` | 600 | 638 | +38 | the oven tower's appliance bars |
| `B\|2.45` | 680 | 742 | +62 | the fridge's door bars |
| `B\|1.80`, `A\|0.30`, `A\|0.75`, `B\|0.61` | — | — | 0 | unchanged |

**2026-09-01 — `A|2.00`'s 632 is history, not current.** This table records what wave S9 measured on
2026-08-30. [ADR 0051](../decisions/0051-the-dishwasher-niche-wears-a-decor-door.md) removes the
dishwasher's own door bar and gives the niche a decor door instead, so `A|2.00` now fills **620 mm**.
See ADR 0040's 2026-09-01 correction for the durable record.

This also moves each of those eight columns' off-wall origin and widens its rendered void highlight —
verified live in the browser at 390×844, zero console errors.

**Found and deliberately not fixed — S9-F1, still open.** `resolveDepthM`'s uncapped arm asks
`occupiedDepthM` — a clearance fact — the wrong question when it needs a manufactured build size,
which two shipped columns can now reach through an ordinary delete-then-insert (a 742mm wall cabinet
over a 680mm fridge, persisted with no refusal and no on-screen tell). This is a product decision,
not a bug fix, and needs its own wave. **Full record: `docs/BACKLOG.md`** (evidence, live
reproduction, and why it wasn't folded into this wave) — not duplicated here.

## Wave S10 — DB-004 (closed)

The migration runner kept a hard-coded file list, re-ran every file on every invocation, and recorded
no applied version — safe only because all three existing files happened to be idempotent. Replaced
with an append-only `schema_migrations` ledger: one transaction per migration, under a
transaction-scoped advisory lock, refusing a changed checksum, a sequence gap, or a ledger row whose
file no longer exists. Full design record — bootstrapping, the re-run-not-backfill decision for
databases that already ran these migrations, the checksum normalisation rule, and the advisory-lock
scope — is **ADR 0042** (supersedes ADR 0020's prose). A nine-finding review round (S10-1…S10-9, all
addressed) fixed a wedged shared test database from the reviewer's own mutation spot-check, a
misdirecting rollback error message, a raw connection-failure leak, and a build guard that didn't
assert file count. Final gates: persistence 14 files / 138 tests, build guard verified against a
doctored `dist`. No migration was run against the application database in this wave.

## Wave S11 — WEB-003 (closed)

Two authorized tabs holding the same write-token cookie could both load a design, make different
edits, and both be told the save succeeded — the second commit silently replacing the first (ADR
0019 decision 11 had accepted this as a footnote). Fixed with an opaque `bigint` revision column,
migration `0004_add_design_revision.sql`, and a single conditional-write query whose `authorised` CTE
and `update` share one snapshot, so a stale revision 409s without leaking whether an id exists to a
caller who hasn't already proven the right credential. The client stops on a conflict (a new `conflict`
save status) rather than retrying, and offers reload-or-overwrite; an overwrite is itself a
conditional write against the current revision.

**The deploy order is load-bearing and still governs any future deploy of this schema change:**
migration `0004` must reach an environment's database *before* the web code that reads `revision`
does, or every load and save 500s there — this is not a preference, see the migration file's own
header comment. **Production's migration state for `0004` is unconfirmed as of this writing** — see
`docs/STATUS.md`'s *What is open right now* for the live status; Preview is confirmed migrated per
ADR 0054. Review round 1 (F1–F6) fixed a conflict-clearing race, documented the deploy order, and
made the migration-test harness read its destructive version range from disk rather than a
hand-maintained constant. Final gates: persistence 14 files / 155 tests, web 41 files / 677 tests,
both green.

## Wave S12 — DOM-003 (closed)

`commands/set-width.ts` (1,663 lines, 45 functions) was split into nine modules with no behaviour
change — verified by a byte-identical 20,280-call characterisation sweep before and after. Full
record: **`docs/milestones/dom-003-set-width-split.md`**.
