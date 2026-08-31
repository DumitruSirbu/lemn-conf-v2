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

## Wave S4 — SEC-003 + SEC-004

Status: **Implemented, awaiting adversarial QA and review.** Review tier: **Full**, including
security review — this is a public-endpoint and browser-policy change.

ADR 0019 decision 2 assigns volume and edge concerns to the Vercel firewall. Neither finding here is
one: SEC-003 is an input the application itself hands to the browser, and SEC-004 is a per-response
application policy. The ADR is not re-litigated by this wave.

### SEC-003 — `/internal/scene-shot` accepted unbounded WebGL dimensions

Two independent controls, because either alone leaves a gap:

1. **Clamp.** `shot-request.ts` now bounds `w` and `h` against their own maxima —
   `MAX_WIDTH = 1920`, `MAX_HEIGHT = 1080` — and rejects anything below `MIN_SIZE = 1` to the
   reference default. The only real caller, `scripts/capture-fidelity.mjs`, never asks for more than
   the 960 x 640 stage box that `scripts/fidelity-shots.mjs` pins, so 1080p is headroom rather than a
   requirement pushed up to accommodate tooling.
2. **Gate.** `route-availability.ts` makes the route opt-in under
   `LEMNARIA_ENABLE_SCENE_SHOT_ROUTE=1`; a production build serves `notFound()` without it.
   Development and the e2e dev server keep the route unconditionally. The route is gated rather than
   deleted because the capture harness drives it against a real production build (`next start`) for
   the M1 fidelity gate; `capture-fidelity.mjs` therefore sets the flag on the server it spawns, so
   no human has to set anything for capture to keep working. The flag must be left **unset** in the
   deployed application.

### SEC-004 — the browser security policy is now in the repository

`src/lib/security-headers.ts` is the versioned policy, split by whether a header has a per-request
component.

- **`next.config.ts`** serves the static set on `/:path*`, so it reaches every response including
  static assets: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
  `Referrer-Policy: strict-origin-when-cross-origin`, a `Permissions-Policy` closing fourteen
  features (camera, microphone, geolocation and every sensor among them), and
  `X-DNS-Prefetch-Control: off`. These are **enforcing immediately**.
- **`src/proxy.ts`** (Next 16's replacement for `middleware.ts`) mints a per-request nonce and sends
  the CSP. `script-src` is `'self' 'nonce-…' 'strict-dynamic'` and never a blanket `'unsafe-inline'`.
  `style-src` does keep `'unsafe-inline'`: React writes `style` attributes and drei injects unnonced
  style elements, and a style injection is not the blast radius this policy exists to contain.
  `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'none'` and
  `frame-src 'none'` are all present; `blob:`/`data:` are admitted only for images and workers,
  which is how three.js hands over generated textures and loader workers.
- **The mode switch** is the single constant `CONTENT_SECURITY_POLICY_MODE`, today `"report-only"`.
  The response header name is derived from it, so enforcing is a one-line change. The *request*
  header Next reads to learn the nonce is always the enforcing name — otherwise Next would emit
  unnonced scripts and the report-only rollout would report every one of them.

Known limit, accepted: a nonce reaches only the HTML of a **dynamically rendered** response.
Mutating request headers in a proxy does not disable static rendering, so `/`,
`/configurator/configure`, `/configurator/contact` and `/_not-found` keep their static optimisation
and therefore carry **no nonce** — measured, not assumed, in the build output below. Nothing
regressed; this is recorded because it is what makes the enforce flip a decision rather than a
detail.

**There is deliberately no report sink.** A collector route would be an unauthenticated, unthrottled
POST endpoint anyone could flood — the same shape as SEC-001, which the owner deferred to M8 behind
a launch gate, so adding one to close SEC-004 would reintroduce the finding being gated. Violations
surface only in a viewer's browser devtools. This policy is therefore a **versioned, testable
declaration and a staging step, not a live control today**. The flip to `"enforce"` is blocked on two
preconditions, both now on the M8 launch gate: a method of collecting violations, and the
prerendered-pages/nonce problem above.

### Acceptance criteria

1. No `w`/`h` value — finite, infinite, `NaN`, exponent-notation, hexadecimal, `MAX_SAFE_INTEGER`,
   negative, zero, non-numeric, repeated or missing — produces a canvas outside `1 x 1` to
   `1920 x 1080`, and every accepted size is an integer.
2. A production build serves 404 at `/internal/scene-shot` unless `LEMNARIA_ENABLE_SCENE_SHOT_ROUTE`
   is exactly `1`; no other value opts in.
3. Every response carries the five static security headers.
4. The CSP is sent as `Content-Security-Policy-Report-Only` and never alongside the enforcing header,
   contains `frame-ancestors 'none'`, `object-src 'none'` and `base-uri 'self'`, and admits scripts
   only by a per-request nonce.
5. The configurator and the capture route still render a live WebGL context with no CSP-attributed
   console output.

### What was actually run

- `pnpm --filter @lemnaria/web build` — **succeeded.** `✓ Running next.config.ts took 13ms`, so the
  `./src/lib/security-headers` import from `next.config.ts` resolves under Node outside the app's
  module graph. The route table lists `ƒ Proxy (Middleware)`, so the CSP layer is registered in the
  production output.
- `pnpm --filter @lemnaria/web lint` and `… typecheck` — both clean.
- `pnpm --filter @lemnaria/web test` — this wave's four files are **33 passed (4 files)**. The full
  suite currently shows **4 failed | 580 passed | 4 skipped (588)**; all four failures are
  `design-errors` / `write-authorization` assertions belonging to the concurrent SEC-002 body-limit
  wave in this tree, and no file from this wave appears in them.
- Live dev server (port 4399), real Chromium at 390 x 844: `/configurator/configure` returned 200
  with all five static headers plus `content-security-policy-report-only`, a live WebGL context,
  **0** CSP-related console lines and **0** page errors. Next stamped the nonce onto 26 attributes
  across 23 `<script>` elements.
- Production server (`next start`) against the real build:
  - Without the flag, `/internal/scene-shot?w=32768&h=32768` → **404**.
  - With `LEMNARIA_ENABLE_SCENE_SHOT_ROUTE=1` → **200**, and the served HTML contains
    `style="width:1920px;height:1080px;…"`. The clamp holds in the shipped output, not only in the
    parser's unit tests.

### Two things the production build caught that tests and the dev server did not

1. **The gate was baked in.** `/internal/scene-shot` prerendered as static, so `notFound()` was
   evaluated at build time and no runtime flag value could ever open it — the capture harness would
   have got 404s. Fixed by `export const dynamic = "force-dynamic"` on that page; the route now
   reports as `ƒ` and both directions were re-verified above. Unit tests could not see this: they
   exercise the predicate, and the defect was in when Next evaluated it.
2. **`"enforce"` is not yet a safe flip, and the switch says so.** A nonce only reaches the HTML of a
   dynamically rendered response. Measured against this build: `/d/[id]` is dynamic and carries
   nonces on all of its scripts, but `/`, `/configurator/configure`, `/configurator/contact` and
   `/_not-found` are prerendered and carry **none** — ten same-origin chunk tags plus two inline RSC
   flight-payload scripts whose content is page-specific, so a hash allowance is not maintainable
   either. Under `"enforce"` all twelve would be blocked and those pages would go blank. Report-only
   is therefore the mode that matches how this app renders, not a formality, and the precondition is
   recorded in the doc comment on `CONTENT_SECURITY_POLICY_MODE`. Making those pages dynamic is a
   performance and cost decision that belongs to a decision record, so it was deliberately **not**
   folded into this wave.

---

## Wave S3 — DOM-001 + SEC-002

### Scope

Separate wire-shape parsing from executable-domain validation, and enforce the same contract at both
the API write seam and the database load seam. Nothing else: SEC-001, SEC-003, SEC-004, WEB-\*, DB-\*,
DOM-002, DOM-003 and `docs/STATUS.md` were left untouched.

### What landed

**Domain (`packages/configurator-domain`)**

- `src/design-bounds.ts` (new) — every wire bound, each derived from a constant declared elsewhere
  rather than chosen.
- `src/design.ts` — `DesignSchema` now parses positive, range-bounded millimetres for room
  dimensions, body dimensions and seat depth; non-negative bounded coordinates; bounded identifiers;
  and `z.array(DesignPlacementSchema).max(MAX_PLACEMENTS)`.
- `src/validate-design.ts` (new) — `validateDesignForCatalog` (query, returns issues) and
  `assertDesignValidForCatalog` (command, throws `InvalidDesignError`), plus
  `describeDesignValidationIssues` for a bounded, value-free log line.
- `src/migrate-design.ts` — the stored-row load path now runs the same validator, with the catalogue
  defaulting to `KITCHEN_L_BODY_CATALOG` so the persistence adapter's call site is unchanged.

**Web (`apps/web`)**

- `src/lib/server/read-body-with-limit.ts` (new) — counts bytes off `request.body` and cancels the
  stream at the limit. `Content-Length` is never read.
- `src/app/api/designs/[id]/route.ts` — three gates in order: size (413), JSON parse (400), schema
  (400), then `validateDesignForCatalog` (400).
- `src/lib/server/design-errors.ts` — `payloadTooLargeResponse()`, and stable public codes
  `PAYLOAD_TOO_LARGE` and `DESIGN_INVALID` on the two responses this wave owns.

### The derivations

None of these numbers were picked. Each is computed in `design-bounds.ts` from a constant that
already exists, so a catalogue or spec change moves the bound with it.

| Constant | Value | Derived from |
| --- | --- | --- |
| `MAX_DESIGN_DIMENSION_MM` | 10 000 | §13.3 q4's one fixed room, whose shell `kitchen-parts.ts` builds at 4.2 × 3.4 × 2.6 m — an order of magnitude of headroom over the tallest thing it can hold |
| `MAX_IDENTIFIER_LENGTH` | 64 | The catalogue's longest key, `wall-2door-700-over-fridge` (26 characters), with `insertBody` minting `n<index>` |
| `NARROWEST_CATALOG_WIDTH_MM` | 200 | Read off `INSERTABLE_BODY_DEFINITIONS`: the lowest `widthRangesMm.minMm` any row declares (both hinged cabinets and the bottle cargo, ADR 0026) |
| `MIN_BODY_HEIGHT_MM` | 300 | `MIN_SPAN_M` — §4's smallest span that ever becomes a void, so nothing under it can be an opening a body is built into. This is the bound ADR 0038 recorded as unreachable |
| `MAX_ROOM_WIDTH_MM` / `_DEPTH_MM` / `_HEIGHT_MM` | 6300 / 5100 / 3900 | The shell `kitchen-parts.ts` builds (`RW = 4.2`, `RD = 3.4`, `WH = 2.6`), times a 1.5 headroom factor. Restated in the domain and cited, not imported — `three-adapter` depends on the domain, never the reverse |
| `MAX_PLACEMENTS` | 168 | `(floor(6300/200) + floor(5100/200)) × 3`. Each wall run at its maximum **room-bounded** length, packed end to end with the narrowest catalogue body, in each of §2's three module bands (`LEVELS.length`). The shipped seeded kitchen holds 26 |
| `MAX_DESIGN_BYTES` | 87 040 | `168 × 512 + 1024`. A placement's longest serialisation is roughly 280 bytes (two 64-character identifiers, five five-digit millimetre values, two enums, JSON punctuation), rounded to 512 so indentation cannot fail an honest document; 1024 covers the room, `presetId` and the two timestamps |

### The rules `validateDesignForCatalog` enforces

Unique placement ids; catalogue membership of every `buildId`; the catalogue row's own width rule,
asked through the existing `acceptsWidthMm` predicate so a stored width is judged by exactly the rule
a resize is; the catalogue-wide width and height floors; non-negative wall-run start; containment
past the room's wall run and through its ceiling; and `updatedAt >= createdAt`. Supported walls need
no rule here — `DesignWallSchema` is an enum, so a wall other than A or B cannot reach the validator.

### Acceptance criteria, and how each was met

| Criterion | Evidence |
| --- | --- |
| Bounded wire parsing | `tests/validate-design.test.ts` → `DesignSchema bounds`, 9 cases |
| One named domain validator, used at both seams | `validateDesignForCatalog` called from `route.ts` and from `migrateDesign` |
| 400 on write, `InvalidDesignError` on load | `payload-limits.test.ts` (400 + `DESIGN_INVALID`); `validate-design.test.ts` → `migrateDesign at the stored-row seam` |
| No Zod tree in the response or the log | Responses carry a fixed sentence and a code; `describeDesignValidationIssues` caps at 10 `path:code` pairs |
| 413 by counting stream bytes, before semantic validation | `read-body-with-limit.test.ts`; `payload-limits.test.ts` asserts 413 for a chunked body with no `Content-Length`, that fewer chunks were pulled than sent, and that a large body of the *wrong shape* still answers 413 rather than 400 |
| Seeded design unchanged | `validateDesignForCatalog(KITCHEN_L_DESIGN, …)` returns `[]`; schema round-trip asserted; all 980 domain and 599 web tests green |

### What was actually run

- `pnpm --filter @lemnaria/configurator-domain test` — **59 files, 980 passed** (25 new).
- `pnpm --filter @lemnaria/web test` — **38 passed | 1 skipped (39 files), 599 passed | 4 skipped**
  (15 new).
- `pnpm --filter @lemnaria/three-adapter test` — **31 files, 708 passed** (run as a blast-radius
  check on the schema change; not required by the dispatch).
- `pnpm --filter @lemnaria/configurator-domain typecheck` and `… lint` — both clean.
- `pnpm --filter @lemnaria/web typecheck` and `… lint` — both clean.
- Falsifiability check: with `src/design.ts` and `src/migrate-design.ts` restored to `HEAD` and the
  new test file unchanged, `tests/validate-design.test.ts` reported **9 failed | 16 passed (25)** —
  the seven schema-bound cases and the two stored-row cases. The `validateDesignForCatalog` block
  passed only because that module is itself part of this change; it did not exist before the wave.
- The persistence live-database suite and `pnpm check` were **not** run (coordinator's).

### Two things found and deliberately not fixed

1. **`Design.room` does not describe the shipped scene, so the containment bound is weaker than it
   should be.** §2 makes wall A's run the room width and wall B's the room depth, which would be the
   honest per-wall bound. It cannot be applied: the seeded design records a 3600 × 2400 room while
   `kitchen-parts.ts` builds a 4.2 × 3.4 m shell, and the seeded wall-B fridge `p7` (centred at 2450
   with a 700 mm body) stands out to **2800 mm**, 400 mm past the recorded depth. A per-wall bound
   would reject the design the product ships. `longestWallRunMm` therefore bounds against the room's
   *longer* recorded run, which still refuses a coordinate outside every wall of the declared room.
   Reconciling the room record with the scene shell is a product decision, not this wave's.
2. **No overlap rule.** DOM-001's remediation list names "no illegal overlap" among the placement
   checks. Two placements can still be stored occupying the same span. That needs the void/column
   engine's own overlap semantics rather than a coordinate comparison, and it is a larger change than
   this wave's scope; it is not covered here.

### Out-of-scope edits made, and why

Two existing assertions were updated, not weakened: `tests/lib/server/design-errors.test.ts` and
`tests/app/api/designs/write-authorization.test.ts` each asserted the 400 body by exact equality and
now include the new `code: "DESIGN_INVALID"` field. The field is additive and was required by the
dispatch's "stable public error code".

This wave touched **eight** production files against the workflow's ~five guidance. The dispatch
required the same validator at two seams in two packages, which is four modules plus the two new
ones, an `index.ts` re-export line, and the error-response module. Flagged rather than stretched.

### Wave S3 addendum — the load path must not reflect a stored row

Raised by the coordinator during API-boundary review, inside this wave's scope.
`designErrorResponse` returned `error.message` for `InvalidDesignError` — a *stored* document
failing on load — to any holder of the share link. Bounded before this wave; not after it, because
`validateDesignForCatalog` failures now become `InvalidDesignError` on that path.

**Three places were leaking, not one.**

1. `apps/web/src/lib/server/design-errors.ts` — `designErrorResponse` no longer returns
   `error.message`. `designUnreadableResponse` answers a fixed sentence plus the stable code
   `DESIGN_UNREADABLE`, keeping the 500, and logs the detail through the same `boundedForLog` the
   write path uses. `DESIGN_UNREADABLE` is deliberately distinct from `DESIGN_INVALID`: one is the
   server's problem, the other is the caller's payload.
2. `packages/configurator-domain/src/migrate-design.ts` — `migrateFromV1` raised
   `result.error.message`, the whole Zod tree. It names every expected type, **echoes an
   unrecognised key verbatim**, and grows with the row. It now raises `describeSchemaIssues`, the
   bounded `path:code` summary, which is the same rule `describeDesignValidationIssues` follows.
   Both now share one `describeBoundedIssues` formatter in `validate-design.ts`.
3. `packages/configurator-domain/src/repository.ts` — **the constructor does not embed document
   values of its own**; it interpolates whatever reason the caller passes, which is how (2) reached
   it. It is now bounded there as well — control characters stripped, 300 characters — so a future
   caller cannot make the message a function of a document's size. Defence in depth, not the fix.

**Tests** (3 in `payload-limits.test.ts`, 2 in `validate-design.test.ts`). The route tests seed a
*raw* row through the fake repository and load it through the real `migrateDesign`, so an invalid
stored document fails the way it fails in the Neon adapter. A design naming the fake buildId
`LEAK-CANARY-9f3a2b` answers 500 with the stable code and the canary appears nowhere in the
serialised response body — asserted on the whole body rather than one field, so a later `details`
key still fails the test — nor in the log line, which stays under 400 characters for a 250-placement
row. The domain tests assert the same of the migration message for an unrecognised key.

- `pnpm --filter @lemnaria/configurator-domain test` — **59 files, 982 passed**; typecheck and lint
  clean.
- `pnpm --filter @lemnaria/web test` — **38 passed | 1 skipped, 604 passed | 4 skipped**;
  `payload-limits.test.ts` is **11 passed**; typecheck and lint clean.
- `pnpm --filter @lemnaria/three-adapter test` — **31 files, 708 passed**.
- Falsifiability: with `designErrorResponse` restored to `NextResponse.json({ error: error.message
  })`, all **3** new route tests failed; restored afterwards. The first version of the log-size test
  passed against that pre-fix code because the old path logged nothing at all and
  `String(undefined)` is short — a vacuous assertion, corrected by asserting `console.error` was
  called and that the line names an issue count.

**Still reflecting a caller-supplied value, not changed here:** `DesignNotFoundError` returns
`error.message` at 404, which contains the design id the caller itself sent. No new disclosure, and
outside the addendum's scope — recorded rather than folded in.

### Wave S5 — review round 1 (S5-1 … S5-4, CHANGES REQUIRED)

All four findings accepted; S5-1 was a regression this wave introduced.

- **S5-1 / S5-2** — the guard no longer decides by comparing addresses. `ALLOWED_TEST_DATABASE_NAMES`
  is a name allowlist a destructive target must be on, checked before anything else and without
  needing `DATABASE_URL`; a second rule still refuses the database name `DATABASE_URL` points at,
  whatever host it is reached through. A pooled and a direct Neon endpoint are different hostnames
  over the same rows, so no host comparison can be the total rule, and an absent `DATABASE_URL` is
  no longer a bypass.
- **The allowlist had to encode reality.** `TEST_DATABASE_URL` targets **`lemn-conf-v2-staging`**,
  not ADR 0006's `lemnaria_test` — same Neon project as the application database `lemn-conf-v2`,
  separated only by name. Both names are allowlisted. **The divergence from ADR 0006 is the owner's
  to resolve**: either the record is updated to name the real database, or the test database is
  renamed to match it.
- **S5-3** — `streamRowsAsNdjson` exposes `isWalkComplete()`, true only after a short or empty page
  proved the table was exhausted, and false after a `cancel()`. `tryExportDesigns` returns
  `BACKUP_EXPORT_FAILED` when `upload` resolves with the walk incomplete, so a truncated but valid
  ndjson file is a failed export rather than a recovery point missing designs.
- **S5-4** — `errorName` is clamped to `/^[A-Za-z][A-Za-z0-9]{0,63}$/`, falling back to
  `"UnknownError"`.
- **Coordinator's addition** — `deleteDesignsForTests` refuses unless `VITEST` or Playwright's
  `TEST_WORKER_INDEX` is set, and always refuses under `NODE_ENV=production`.

Tests added: pooled-vs-direct endpoint refusal (guard and delete helper), non-test name refused with
`DATABASE_URL` unset, allowlisted name accepted with it unset, test-runner and production refusals,
a later page rejecting after earlier rows were enqueued, an upload resolving after one chunk, and an
injected `err.name` logging as `UnknownError`.

Re-run after the fixes: `pnpm --filter @lemnaria/persistence test` **11 files / 98 tests passed**;
`pnpm --filter @lemnaria/web test` **38 passed | 1 skipped, 607 tests passed | 4 skipped**;
focused `tests/app/api/cron tests/lib/server/backup-designs.test.ts` **PASS (19) FAIL (0)**; both
package lints and both typechecks exit 0.

### Wave S5 — review round 2 (NEW-1, NEW-2)

- **NEW-1** — the truncated upload is now deleted before the export failure is raised.
  `discardTruncatedBackup` runs in its own try, so a failed cleanup is logged as
  `BACKUP_CLEANUP_FAILED` and never replaces the truncation as the reported cause. Without it the
  partial survived the whole retention window as the newest export — rotation is skipped on a failed
  export — and `docs/runbooks/design-db-restore.md` tells the operator to pick the newest one.
- **NEW-2** — the test-runner markers are checked non-empty, so `VITEST=""` no longer counts.
- **NEW-4 (informational)** — recorded on `identityOf` that the database name is read from the URL
  path, which is correct for `@neondatabase/serverless`; under libpq a `?dbname=` parameter overrides
  the path, and a future non-Neon driver must read it here too.
- **NEW-3 (informational)** — the `cancel()` handler is documented as defensive and near-unreachable
  rather than as part of the guard. `hasReachedEndOfTable` is what fails a truncated export.

Correcting the round-1 record: the "a later page rejects" test is a **regression test only**. The
rejection propagates through the stream and the surrounding `try` catches it, which was already true
before `isWalkComplete()` existed. Only the "upload resolves after one chunk" case exercises the
completeness flag.

Re-run: `pnpm --filter @lemnaria/persistence test` **11 files / 98 tests passed**; focused
`apps/web` backup + cron tests **PASS (21) FAIL (0)**; `pnpm --filter @lemnaria/persistence lint`
exit 0; `pnpm --filter @lemnaria/web lint` exit 1 on `tests/lib/server/design-errors.test.ts`, an
in-flight file belonging to another wave — eslint over this wave's seven web files reports
"No issues found".


### Wave S3 review round 1 — F1, F2, F3 applied

Full-tier review returned **approved with findings**. F1–F3 are fixed; F4–F6 were notes and were
handled as stated.

**F1 · a stream error escaped the handler.** `readUtf8BodyWithLimit`'s `reader.read()` rejects when
the request stream errors — a client sending `Transfer-Encoding: chunked` that writes half a
document and resets the connection — and the read sat outside `saveDesign`'s `try`, so Next answered
with a framework 500 carrying a stack trace into the log. Fixed with the tagged outcome the review
preferred: `BoundedBodyOutcome`'s failure arm is now `"too-large" | "stream-failed"`, the reader
catches and returns rather than rejecting, and `refuseUnreadBody` maps the two to **413** and
**400 `DESIGN_INVALID`**. The reader owns its own failure and the route keeps one shape. Two reader
tests (erroring stream; the two failures distinguished) and one route test asserting 400, the stable
code, that no stack trace and no transport message reach the log, and that the stored row is
untouched.

**F2 · the room is now bounded.** Containment is checked against the room the *document* carries, so
an unbounded room made it vacuous: a declared `10000 × 10000 × 10000` room accepted cabinets ten
metres along either wall. `MAX_ROOM_WIDTH_MM` / `_DEPTH_MM` / `_HEIGHT_MM` are derived in
`design-bounds.ts` from the shell `kitchen-parts.ts` actually builds (`RW = 4.2`, `RD = 3.4`,
`WH = 2.6`) times a 1.5 headroom factor — **restated and cited, never imported**, since the domain is
I/O-free and `three-adapter` depends on it. `DesignRoomSchema` bounds each axis separately.

Two consequences worth naming. `MAX_PLACEMENTS` was derived from `MAX_DESIGN_DIMENSION_MM` as the
wall run; with the room bounded, the room bounds *are* the wall runs, so it re-derives from
**300 → 168** and `MAX_DESIGN_BYTES` from **154 624 → 87 040**. That is a tightening the review did
not ask for, but leaving the count derived from a superseded ceiling would have made the derivation
false. And the relaxed `longestWallRunMm` containment stays, as instructed — a per-wall rule would
reject the shipped design (`p7` stands 400 mm past the recorded depth). Its doc comment no longer
claims to refuse "a coordinate outside every wall of the room"; it now says what it buys, which is
that a body may overshoot its own wall by the difference between the room's two runs, capped at
roughly the physical shell instead of ten metres. Five schema tests, including the 10 m cube and each
bound accepted at its exact value.

**F3 · one describer, one bound, bounding unconditional.** The rule was implemented in both packages
with the `300` and `10` caps declared twice and the Zod-issue interface duplicated, and it had drifted
— `describeSchemaFailure` did not bound its own output and stayed short only because its one call
site happened to bound it afterwards. New `packages/configurator-domain/src/failure-text.ts` owns
`boundedFailureReason`, `describeSchemaIssues`, `describeBoundedIssues` and `SchemaIssueShape`;
`describeBoundedIssues` applies the length bound itself rather than leaving it to a caller. The web
copies are deleted, `design-errors.ts` and the route import the domain's, and the describer's tests
moved to `packages/configurator-domain/tests/failure-text.test.ts` — the package that owns the code
owns the suite.

One behavioural consequence, found by an existing assertion: with the bound now unconditional, ten
long paths fill the 300 characters and the trailing `(+N more)` marker is truncated away. The
**leading total** (`5000 issue(s): …`) survives every truncation and carries the same fact, so that is
what the test now asserts; the `(+N more)` suffix keeps its own test at short paths, and a third test
proves ten long paths are truncated rather than growing the line. Previously the marker was lost too,
just inconsistently and only at the call site.

**F4 (note only, no code change).** `MAX_PLACEMENT_BYTES` counts bytes while `MAX_IDENTIFIER_LENGTH`
counts UTF-16 code units, so 64-character non-ASCII identifiers could serialise past the byte limit
while remaining schema- and domain-valid. The comment now claims only "a design **this product**
produces" and names the gap. Identifiers were not re-bounded in bytes: `insertBody` mints `n<index>`
and every catalogue key is ASCII, so nothing in the product can reach it.

**F5, F6 (notes only).** `seatDepthMm.positive()` left as is; no producer guard added.
`DesignNotFoundError`'s 404 left as is.

**Named gap — no overlap rule.** Two placements may be stored occupying the same span. They
interpenetrate visually, and because derived voids are computed from occupied spans, the overlap
makes free space **under-report**: the panel can then offer or refuse an insert against a span that
does not physically exist. Deliberate and out of this wave's scope — it needs the void/column
engine's own overlap semantics, not a coordinate comparison. Recorded here as a known gap rather
than left implicit.

### What was actually run (round 1)

- `pnpm --filter @lemnaria/configurator-domain test` — **60 files, 995 passed**.
- `pnpm --filter @lemnaria/web test` — **38 passed | 1 skipped (39 files), 609 passed | 4 skipped**.
- `pnpm --filter @lemnaria/web typecheck` and `… lint` — both clean.
