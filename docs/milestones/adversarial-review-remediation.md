# Adversarial review remediation

> **STATUS: COMPLETE FOR THE SECURITY SCOPE, 2026-08-31.** The pause recorded earlier that day was
> lifted and the remaining waves ran. Closed on this branch: SCENE-001 (`db9c402`), WEB-001
> (`b0400ac`), DOM-001 + SEC-002 (`47e2552`), SEC-003 + SEC-004 (`96293c5`), DB-001 + DB-002 + DB-003
> (`e666d96`), and a continuity-review round (`c5df227`). **SEC-001 is deferred to M8 by the owner's
> decision and gated** (`f342752`, ADR 0019's 2026-08-31 correction, and
> `M8-review-contact-success.md`'s launch gate). Still open, all Medium or Low: WEB-002, WEB-003,
> WEB-004, SCENE-002, DOM-002, DOM-003, DB-004, plus three Low residuals on WEB-001's fix recorded in
> `docs/STATUS.md`. Coordinator `pnpm check` at `c5df227` exited 0 over 2,415 package tests; the
> Playwright e2e suite was not run in this session.

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

## Wave S3 — DOM-001 (original plan)

Status: **Superseded 2026-08-31 — see *Wave S3 — DOM-001 + SEC-002* below, which is the wave that
ran.** The line that stood here (*"Not started. No domain, API-validation, migration, or
persistence-load changes were made before the remediation milestone was paused."*) was true when the
pause was recorded and stopped being true the same day: the work shipped in `47e2552`. The plan text
below is kept as the dispatch the wave was built against.

Review tier: **Full**, including security review. Separate wire-shape parsing from semantic domain
validation and enforce the same executable-design contract at API write and database load. Cover
unique IDs, catalog membership, supported positive dimensions/coordinates, timestamp ordering,
bounded cardinality, and invalid stored rows. Do not begin until S2 closes.

## Wave S4 — SEC-003 + SEC-004

Status: **Implemented; adversarial QA, Full review and a continuity review of the post-review fixes
have all run.** Review tier: **Full**, including security review — this is a public-endpoint and
browser-policy change. The first review returned approved-with-findings (six items, all applied);
a continuity reviewer then checked those fixes at `96293c5` and returned approved-with-findings
again (five documentation-accuracy items, all applied here).

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
  features (camera, microphone, geolocation and every sensor among them),
  `Strict-Transport-Security: max-age=15552000; includeSubDomains`, and
  `X-DNS-Prefetch-Control: off` — **six** headers. These are **enforcing immediately**.
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
Mutating request headers in a proxy does not disable static rendering, so the **five** prerendered
routes keep their static optimisation and therefore carry **no nonce**: `/`, `/_global-error`,
`/_not-found`, `/configurator/configure` and `/configurator/contact`. That list is
`apps/web/.next/prerender-manifest.json` read back from a real build, quoted under "What was
actually run" below — not the build's printed route table, which does not show `/_global-error` at
all. `/_global-error` is the one that matters most: it is the page that has to render precisely
when something else has already failed, and the page whose blanking is hardest to notice. Nothing
regressed; this is recorded because it is what makes the enforce flip a decision rather than a
detail.

**`Strict-Transport-Security`: scope and the withheld `preload`.** Recorded here rather than only in
a source comment, because the scope choice has a consequence outside this repository.

- `max-age=15552000` — six months. Long enough to be a real guarantee, short enough that a mistake
  ages out rather than needing a coordinated unwind.
- `includeSubDomains` — **safe for every path this project uses today**, verified rather than
  assumed. RFC 6797 §8.1 requires a user agent to ignore an STS header delivered over insecure
  transport, and both plain-HTTP surfaces are exactly that: the Playwright suite runs against
  `http://localhost:4320`, and ADR 0019's LAN handset case is `http://<LAN-IP>:3000`. Preview
  deployments are HTTPS-only on `*.vercel.app`.
- The residual risk is **external and future**: once the app is deployed on a custom apex domain,
  `includeSubDomains` binds every sibling subdomain — a marketing host, a mail UI, anything not yet
  built — to HTTPS for six months. That is a deliberate accepted trade, and it is the thing to
  re-examine before pointing an apex at this app.
- `preload` is **withheld deliberately.** Submission to the browsers' built-in preload list is a
  public and effectively irreversible commitment, binding every current and future subdomain with a
  removal process measured in months. That is the owner's decision to make, not an implementing
  agent's, and nothing in SEC-004 requires it.

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
3. Every response carries the six static security headers, `Strict-Transport-Security` among them.
4. The CSP is sent as `Content-Security-Policy-Report-Only` and never alongside the enforcing header,
   contains `frame-ancestors 'none'`, `object-src 'none'` and `base-uri 'self'`, and admits scripts
   only by a per-request nonce.
5. The configurator and the capture route still render a live WebGL context with no CSP-attributed
   console output.

### What was actually run

- `pnpm --filter @lemnaria/web build` — **succeeded.** `✓ Running next.config.ts took 13ms`, so the
  `./src/lib/security-headers` import from `next.config.ts` resolves under Node outside the app's
  module graph. The route table lists `ƒ Proxy (Middleware)`, so the CSP layer is registered in the
  production output. Reading `apps/web/.next/prerender-manifest.json` back from that build gives
  the prerendered set exactly:

  ```
  ['/', '/_global-error', '/_not-found', '/configurator/configure', '/configurator/contact']
  ```

  Five, not the four an earlier revision of this section claimed: the printed route table lists
  `/_global-error` nowhere, so the manifest is the only honest source for this list.
- `pnpm --filter @lemnaria/web lint` and `… typecheck` — both clean.
- `pnpm --filter @lemnaria/web test` — this wave's four files are **33 passed (4 files)**. The full
  suite currently shows **4 failed | 580 passed | 4 skipped (588)**; all four failures are
  `design-errors` / `write-authorization` assertions belonging to the concurrent SEC-002 body-limit
  wave in this tree, and no file from this wave appears in them.
- Live dev server (port 4399), real Chromium at 390 x 844: `/configurator/configure` returned 200
  with all the static headers then defined plus `content-security-policy-report-only`, a live WebGL context,
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
| One named domain validator, used at both seams | `validateDesignForCatalog` called from `route.ts` (write) and from `migrateDesign` (load). **Two seams, not three** — see the continuity-review corrections below |
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
  separated only by name. Both names are allowlisted. The drift went unnoticed for as long as it did
  because **`lemnaria_test` was never actually created**: nothing ever failed for want of it, so
  nothing pointed out that the record named a database that did not exist.

  **Resolved, 2026-08-31 — see the amendment in
  `docs/decisions/0006-tests-never-touch-the-application-database.md`.** The owner decided to keep
  `lemn-conf-v2-staging` as the destructive-test target rather than create `lemnaria_test` and
  repoint at it, so it is now a named destructive-test target on the same footing the original text
  gave `lemnaria_test`, under that amendment's constraint that nothing else may ever use it. The
  allowlist stands exactly as built; no code change followed the decision.
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

### Wave S3 continuity review — findings 1, 2, 3 applied

A continuity reviewer examined the F1/F2/F3 round at commit `47e2552`, which no reviewer had seen.
**Approved with findings**; F2, its knock-on and F3 were confirmed sound and F3's coverage measured
higher than before. Three follow-ups, all in F1's area.

**Finding 1 · an oversized body whose stream then errors answered a logged 400 instead of a silent
413.** `await reader.cancel()` sat inside the try whose catch tags everything `stream-failed`, and
per spec `cancel()` on an already-errored stream rejects with the stored error. So one chunk past
`MAX_DESIGN_BYTES` followed by a connection reset retagged the refusal, `refuseUnreadBody` sent it to
`invalidBodyResponse`, and that **logs** — reinstating the exact per-request log write that
`payloadTooLargeResponse` documents itself as removing, plus the wrong status on the write path.

Fixed by latching, as the review preferred: `refuseOversized` fixes the refusal as a value **before**
cancelling and discards the cancel's rejection, so nothing cancelling does can change the answer.
Three tests, all confirmed failing against the previous reader: oversized-then-errored, a `cancel()`
that throws of its own accord, and a route case asserting **413** with `console.warn` and
`console.error` both never called.

**Finding 2 · the structural exposure F1 set out to remove was still present.** `getReader()` was
above the try — it throws `TypeError: Invalid state: ReadableStream is locked` — and the route's
`readDesign` call was above `saveDesign`'s try. Both moved inside. One test: an already-locked body
now returns `stream-failed` instead of throwing.

Worth being precise about what the route half buys, because it is less than it looks:
`designErrorResponse` deliberately **rethrows** anything that is not a domain error, so moving the
call inside the try does not convert an unexpected `TypeError` into a handled response. It is
structural containment only. The reader-side fix is what actually closes the hole, and
`designErrorResponse`'s rethrow is a deliberate choice — masking genuine bugs there would be worse —
so it was left alone.

**Finding 3 · the residual was overstated, and the correction is measured.** The previous comment
claimed the worst case was "roughly the physical shell". It is not. Because the room axes are
bounded independently and `longestWallRunMm` is `max(width, depth)`, the shorter wall inherits the
longer one's run. Verified locally rather than taken on trust: a document declaring
`{ shape: "L", widthMm: 6300, depthMm: 1, heightMm: 3900 }` parses clean **and** returns zero domain
issues with a 600 mm body on wall B at `alongMm: 6000, y0Mm: 3200` — 2900 mm past wall B's real
3400 mm run and 1300 mm above the real 2600 mm ceiling. The comment now says the residual is capped
at the **bounded room, not at the wall**, and names reconciling the room record with the scene shell
as the change that would close it. Documentation only; the rule is unchanged, and no test was added
because a test pinning this would assert an accepted weakness as correct.

### Two corrections to this record

**There are two seams, not three.** The validator runs at the API write seam (`route.ts`) and the
migration/load seam (`migrate-design.ts`). There is **no import seam**: `migrateDesign`'s optional
`catalog` parameter only documents that a future one could pass its own, and no such caller exists.
Separately, `apps/web/src/persistence/fetch-configuration-repository.ts` is a **fourth parse seam on
the client**, and it runs `DesignSchema` alone — never `validateDesignForCatalog`. That is
defensible, since the server rejects an unexecutable document on load before the client ever parses
it, but it is not "the same validator" and this record previously implied three seams under one
rule.

**F4 is not reachable at the new numbers, and the smaller budget did not make it so.** Measured
locally: the worst *domain-valid* `MAX_PLACEMENTS`-placement document — 168 placements, 64-character
identifiers, the longest catalogue `buildId`, every optional field present — serialises to **41 231
bytes** against the 87 040-byte budget, leaving 45 809 bytes of headroom. Both sides of the ratio
shrank together when `MAX_PLACEMENTS` fell from 300 to 168. The byte-versus-UTF-16 gap stays
documented as a property of the two bounds, not as a live defect.

### Wave S5 — continuity review (findings 1–4)

- **Finding 1** — `buildBackupPathname` appends a per-invocation suffix
  (`backups/designs/<ISO>-<8 hex>.ndjson`). Two runs of the same millisecond previously computed the
  same path, so NEW-1's cleanup could delete a *complete* backup written by a concurrent run.
  `docs/runbooks/design-db-restore.md` is updated: the fixed-width timestamp still leads, so a
  listing remains in upload order and "pick the newest export" is unchanged.
- **Finding 2** — `BackupResult.errorCode` is typed `PublishedBackupErrorCode`
  (`Exclude<BackupErrorCode, "BACKUP_CLEANUP_FAILED">`), and `reportStageFailure` is generic in its
  stage so each call site yields that stage's literal code without a cast. The cleanup code can no
  longer reach a client by any edit that typechecks.
- **Finding 3** — the delete-failure test now asserts the cleanup event was logged, that log being
  the only signal anywhere that a partial was left in Blob.
- **Finding 4** — the node-`pg` attribution is removed from the `identityOf` comment. Only libpq's
  documented precedence is stated, and the comment says explicitly that other clients were not
  checked.
- **Nit** — the test-runner markers are trimmed before the non-empty check.

Re-run: `pnpm --filter @lemnaria/persistence test` **11 files / 98 tests passed**; focused
`apps/web` backup + cron tests **22 passed (2 files)**; both package lints exit 0; web typecheck
exit 0.

## Wave S6 — DOC-001, the documentation close-out

Status: **Complete, 2026-08-31.** Documentation only: no application code, no test, no environment
variable, no resource. Tier **coordinator-only** by `docs/WORKFLOW.md` — there is no behaviour to
review — and nothing was built or run for it.

What DOC-001 (`testing-reports/06-docs-and-process.md`) asked for, and where each item landed:

- **`docs/STATUS.md`** — 5D2c and 5F marked shipped and 5E named as the only open M5 wave; the
  remediation section rewritten from *paused* to *complete for the security scope*, with SEC-001's
  gated M8 deferral and the Medium/Low residuals listed; test counts replaced with the coordinator's
  `pnpm check` at `c5df227` (2,415 package tests: domain 995, persistence 98, Three adapter 708, web
  614 with 4 pre-existing skips); the e2e figure explicitly re-dated to its 2026-08-26 count, since
  that suite was not rerun; the unbounded mint endpoint added to *What is open right now*; and
  WEB-001's three Low residuals recorded there — not in `docs/BACKLOG.md`, whose own preamble sends
  engineering deferrals from review rounds to `STATUS.md`.
- **`docs/milestones/M5-width.md`** — the status banner and the `Status:` line only. Accepted
  decisions were not touched; they are in ADRs 0028–0041.
- **`docs/decisions/0038-…`** — a dated correction appended, never a rewrite. The *"no
  deserialisation surface"* premise is withdrawn, both surfaces are named, DOM-001 and AV-3 are
  cited, and `47e2552` is linked. The index row in `docs/decisions/README.md` carries the same
  correction.
- **`docs/WORKFLOW.md`** — the close-out check, as a new section after step 7: every commit named
  `M<n> wave …` must be reflected in `STATUS.md` before the wave counts as complete. It went there
  rather than into a new file because `WORKFLOW.md` is the authoritative process document and its
  own history records what two process documents cost. `docs/best-practices/documentation.md` gets a
  one-line pointer, not a copy.
- **`.env.example`** — three decision links repaired after the ADR renumbering
  (`2026-08-25-standalone-neon-…` → `0007-…`, `2026-08-25-least-privilege-database-role` → `0008-…`,
  `2026-08-25-tests-never-touch-the-application-database` → `0006-…`). Comment text only; no
  variable, value or other line changed. A repository-wide grep for any other
  `docs/decisions/<date>-` reference found none outside that file.

**How the shipped-wave list was verified rather than taken on trust.** Each of the eight commits was
resolved with `git log -1` and checked with `git merge-base --is-ancestor <sha> HEAD`; all eight are
ancestors of `HEAD` and all are dated 2026-08-30. `git log --grep='M5 wave'` returns exactly those
eight for 5D2c and 5F and **no 5E commit**, which is why 5E is the wave left open.

### S6 review round — approved with findings, and two of them were this wave's own defect class

The close-out was reviewed rather than self-certified. Verdict: **APPROVED WITH FINDINGS**, six of them,
all applied.

**The ADR 0038 amendment survived review intact**, with every technical claim in it confirmed against
the code rather than read for plausibility: both seam call sites (`validateDesignForCatalog` at
`apps/web/src/app/api/designs/[id]/route.ts:198` and the throwing `assertDesignValidForCatalog` at
`packages/configurator-domain/src/migrate-design.ts:47`), `MIN_BODY_HEIGHT_MM` in
`packages/configurator-domain/src/design-bounds.ts`, and the 40 mm test that pins it
(`packages/configurator-domain/tests/validate-design.test.ts:110`). All fifteen commit hashes cited
across the close-out verify, and the test counts and the `.env.example` diff are exact. That is the
part of this wave that will still be read in a year, and it is the part that held.

**The two that matter are the same defect this wave existed to remove, committed while removing it.**

- **An uncited date, written from recall.** The close-out asserted "5D2a and 5D2b landed on
  2026-08-29". Both halves were wrong — 5D2a is entirely 2026-08-28 (`8831f17`, `0256c20`,
  `e825351`, `09f3b61`) and 5D2b spans three days (`4a0c787` on 08-28; `e8adbee`, `c4cfeec`,
  `b86470c`, `2c79c71`, `0878edd` on 08-29; `2540378`, `8b18bcb`, `3d1b7d3` on 08-30). It was the
  one date in the wave with no commit cited behind it, in a document whose entire premise is that
  dates are checked against commits rather than remembered. Now dated per commit, like the rest.
- **A close-out check whose grep could not find the commits it is about.** The rule shipped with
  `git log --grep='^M<n> wave'`, which is case-sensitive, while this repository's history writes
  *wave*, *Wave* and *Waves*. On M5 that returns 22 commits where `-i` returns 27 — it silently
  dropped `M5 Wave 5A`, `5B`, `5C`, `Waves 5C2 + 5C3` and `Wave 5D`, five waves of the very milestone
  the rule was written about. A check that reports a clean result while matching nothing is a pattern
  this project has now shipped four times (`docs/WORKFLOW.md`, *QA before review*: two boundary greps
  and two commands that reported success while doing nothing). Fixed with `-i` alone. **Worth recording
  beside the finding: both proposed fixes — the reviewer's and the author's — included a second
  pattern for the plural, and neither was tested before being proposed.** Running it showed the
  pattern is redundant, because `wave` is a prefix of `waves` and the one `-i` search returns all 27.
  A wrong fix for a right finding, caught the same way the finding itself was: by running the command
  instead of reasoning about it.

**The durable lesson is the pairing, not either correction.** A wave written to stop documentation
drifting from the commits drifted from the commits, and the tool it shipped to catch that drift was
itself unverified against real history. Neither was carelessness about the subject — the subject was
the whole point — which is why *knowing* the failure mode is not protection against it. Only running
the check against real data is. Both were caught by review, not by the author, and that is the
argument for reviewing a documentation wave at all: a close-out looks like the one kind of work that
cannot be wrong, which is exactly why it is not self-certified here.

Note against the paragraph above this section: its `git log --grep='M5 wave'` is the case-sensitive
form. The claim it supports still stands — every 5D2c and 5F commit message is lower-case *wave*, so
that search does return all eight and no 5E commit — but the command as written would miss
`M5 Wave 5A` through `5D`, and anyone reusing it should take the `-i` form now in `docs/WORKFLOW.md`.

**The four lower findings, briefly.** A history claim was overstated — catalogue validation was
*added to both seams at once* in `47e2552`, not moved from the write seam alone, since
`git show 47e2552^` has both seams running `DesignSchema.safeParse` and no `validate-design.ts` at
all; `STATUS.md` said "what remains is Medium and Low" two lines after naming the open High SEC-001,
now scoped as *besides SEC-001*; the ADR index row rendered the corrected premise with a colon where
ADR 0038 has an em dash — a misquote inside a correction about a misquoted premise; and the seven
open findings were named only in this milestone's summary rather than under STATUS's own *What is
open right now* heading, now listed there with the honest note that their descriptions exist only in
untracked `testing-reports/`, so without that folder they survive as bare identifiers.


## Wave S7 — WEB-002 + WEB-004

Two findings from `testing-reports/02-web-state-and-client-persistence.md`, both about the web app
offering more than it can deliver. Nothing in this wave touches authorisation: ADR 0019 decision 1's
write token, `saveAuthorized` and `/api/designs/[id]` are all unchanged, and `canWrite` remains
advisory. What changed is what the interface **offers**.

### WEB-002 (Medium) — unknown authorization was exposed as writable, and probe failure was silent

`/d/{id}` hydrated `canWrite: "unknown"` and `describePanel` deliberately read that as writable, so
the panel rendered fully interactive before anything knew whether this browser could write. The
follow-up probe swallowed every failure, leaving that optimism standing permanently. A share-link
reader on a slow or blocked API therefore edited, believed the edit saved, and had the controls
disabled only *after* the write was refused — with the unsaved edit still on screen. That is
`docs/design/DEVELOPMENT-SPEC.md` §9's "never offer what cannot be satisfied", inverted: an
unanswered question satisfies nothing.

**Acceptance criteria**

- `WriteAccess` names the unanswered states rather than defaulting them: `"checking"` (a check is in
  flight) and `"check-failed"` (it failed and none is running). Only `true` unlocks the panel —
  `isReadOnly` asks `!== true`, where it used to ask `=== false`.
- `/d/{id}` renders the design normally while the check is out; only the mutation controls wait.
- A probe rejection produces a retryable *access could not be checked* notice, not silence and not a
  guess in either direction. `retryWriteAccessCheck` puts `canWrite` back to `"checking"`, which is
  what the probe effect watches — the trigger and the state are one value, not two that can drift.
- A boolean the server actually gave is never demoted back to unknown by a later failure.
- Every greyed control carries the reason for *its* state (§13.1). "Doar vizualizare" asserts a
  permission, so it is no longer said while nothing has answered; `PanelEditability` resolves the
  sentence once per panel and threads it, replacing the `readOnly: boolean` that was threaded before.
- No write path reads any of this.

### WEB-004 (Low) — test-only telemetry shipped to every customer

`ConfigureScreen` rendered `SelectionDebug` unconditionally, publishing selection ids, derived
opening dimensions, save status, design id, probe state and rejection code into DOM attributes on the
production surface.

**Acceptance criteria**

- Gated behind `NEXT_PUBLIC_LEMNARIA_ENABLE_SELECTION_DEBUG=1`, default off, following the shape and
  naming of `apps/web/src/app/internal/scene-shot/route-availability.ts` so the repository has one
  pattern for "test-only surface" rather than two.
- **No development exemption.** `NODE_ENV === "development"` does not imply E2E observability; the
  report is explicit about this and the flag is the only way in.
- `NEXT_PUBLIC_`-prefixed because that is the only prefix Next exposes to client code at all.
  **Corrected after review (S7-F3):** this record first claimed the readout was *eliminated* from a
  build without the flag. It is not. A production build with the variable absent emits a runtime read
  against Next's `process` shim rather than folding the comparison, and the client chunk still
  contains the readout's markup and attribute names as unreachable code. The security outcome is
  unchanged and WEB-004 is closed on its own terms — the component returns `null` and no
  `[data-testid="selection-debug"]` node reaches the page — but "does not render" is the true claim
  and "is stripped from the bundle" is not.
- The gate returns before any hook runs, so the store subscriptions never execute.
- `playwright.config.ts` sets the flag on the dev server it starts — the opt-in travels with the
  runner that needs it, and no deployed environment can inherit it.

### Env var (add-only)

`NEXT_PUBLIC_LEMNARIA_ENABLE_SELECTION_DEBUG`, documented in `.env.example`. **The owner must not set
it** in any deployed environment; the e2e runner sets it for itself.

### What was actually run

| Command | Result |
| --- | --- |
| `pnpm --filter @lemnaria/web test` | 39 passed, 1 skipped (40 files); 629 passed, 4 skipped |
| `pnpm --filter @lemnaria/web typecheck` | clean |
| `pnpm --filter @lemnaria/web lint` | clean (one `no-unnecessary-boolean-literal-compare` found and fixed on the way) |
| `pnpm --filter @lemnaria/web test:e2e` | 20 passed, 1 skipped, **1 failed** — `signature-flow.e2e.spec.ts`, pre-existing |
| `playwright test read-only-panel --project=mobile` | 1 passed — the spec WEB-002 changes the premise of |

The e2e failure is **not this wave's**: `signature-flow.e2e.spec.ts` fails identically at `3bbb4d1`
with this wave's changes stashed, at `offer-base-2door` resolving to 0 elements. Verified by running
it on the stashed tree, not inferred.

Two further checks were run rather than reasoned about, because the WEB-004 gate depends on a Next
build-time substitution that a unit test cannot observe: a `next dev` server started **without** the
flag serves `/configurator/configure` with no `data-testid="selection-debug"` in the HTML, and the
same server started **with** `NEXT_PUBLIC_LEMNARIA_ENABLE_SELECTION_DEBUG=1` serves it. The Playwright
suite passing its `readSelection` assertions on the same wiring is the third piece of that evidence.

### Tests

New behaviour is pinned in `apps/web/tests/panel/panel-model.read-only.test.ts` (the probe unanswered
disables the controls and renders the design; a rejection is retryable and does not enable editing;
`true` re-enables; the retry is offered on no other notice; "Doar vizualizare" is never said about an
unanswered state), `apps/web/tests/store/configurator-store.test.ts` (a failed check is recorded, is
per-design, never demotes a real answer, and the retry round-trips to a writable panel) and
`apps/web/tests/app/configurator/configure/selection-debug-availability.test.ts` (the flag predicate,
its `NEXT_PUBLIC_` prefix, and `renderToStaticMarkup(SelectionDebug)` producing the empty string in a
build that did not opt in, including under `NODE_ENV=development`).

Each was checked to fail against the previous implementation rather than assumed to: restoring
`isReadOnly`'s `=== false` fails 2 of the panel tests, and removing the `SelectionDebug` gate fails 2
of the availability tests.

`vitest.config.ts` gained `esbuild: { jsx: "automatic" }` — the app's `tsconfig.json` sets
`jsx: "preserve"` for Next's own transform, so a `.tsx` module imported by a test would otherwise
reach the runtime as raw JSX.

### S7 review round — approved with findings, and one of them was a regression this wave introduced

Verdict: **APPROVED WITH FINDINGS**. The security boundary was confirmed unmoved, the state machine
checked for stale-probe, demotion, retry re-fire and loop holes, and both falsifiability claims
reproduced at the counts given. Three findings required a fix.

**S7-F1 (Medium) — the fix converted a hang into a permanent dead end, and that is the one worth
recording.** WEB-002's own wording is "a slow or *blocked* API". This wave handled
blocked-and-rejecting and missed blocked-and-hanging: `loadWithAccess` issued its `GET` with no
`AbortSignal` and no timeout, so a captive portal or a blackholing mobile network left the promise
pending forever, `canWrite` stuck on `"checking"` — and `"checking"` deliberately carries no retry,
because only `"check-failed"` does. The design's own author would have sat on an indefinitely
disabled panel reading "Se verifică accesul" with no control to press, escapable only by a reload
that hangs identically.

**Before this wave the same hang was invisible**, because the panel was optimistically writable
while it hung. Making the unanswered state honest is what exposed it — the fix did not create the
network condition, it removed the false interactivity that was hiding it, and stopped one step
short. That is the shape to remember: closing a "we guessed instead of waiting" defect creates a
"we wait forever" defect unless the wait is bounded in the same change.

Fixed by bounding the **read** path only, with `LOAD_TIMEOUT_MS = 10_000` in
`fetch-configuration-repository.ts`. Ten seconds is long enough for a cold serverless function plus
a Neon cold start over a slow mobile connection and short enough that a blackholed request does not
hold the controls for a minute; being too short costs one press of the retry, having no bound costs
a dead end. A save is left unbounded on purpose — the coalescer already owns retry, backoff and a
terminal state, and aborting a `PUT` in flight would leave the browser unable to say whether the
write landed, which is worse than slow. The abort lands in the `.catch` that was already there and
becomes `"check-failed"`: no new state, no new string. Built from an `AbortController` plus a
cleared timer rather than `AbortSignal.timeout`, so a test can advance it and so a completed load
leaves no pending timer behind.

**S7-F2 (Low) — the retry was a 32 px target.** `--touch-target` is 44 px, `--chip-height` is 44 px,
and DEVELOPMENT-SPEC §10.1 requires ≥ 44 px on mobile; the comment above the rule named 44 px and
then set 32. It is also the only control that escapes `check-failed`, so it was the worst one to
under-size. Now `inline-flex` with `min-height: var(--touch-target)`, still inline with the
sentence. The reviewer's a11y note — the button sits inside the `role="status"` live region, so a
press re-announces it — was considered and deliberately kept: the press changes the sentence from
"could not be checked" to "checking", and that announcement is the only confirmation a
screen-reader user gets that anything happened.

**S7-F3 (Low) — wording corrected, above.**

**S7-F4 (Info) — a known limitation, recorded rather than fixed.** WEB-004's remediation asked for a
production-build assertion that `[data-testid="selection-debug"]` does not exist. What shipped is a
`renderToStaticMarkup` test: a fair proxy for the component, but it does not observe the Next
substitution — precisely the step S7-F3 shows behaving differently from what was documented. So
**nothing in CI would catch `NEXT_PUBLIC_LEMNARIA_ENABLE_SELECTION_DEBUG` being set in a deployed
environment**; `.env.example` carries a prose warning and nothing enforces it. Closing that properly
means asserting against a real `next build` output, which is a build-time gate this repository does
not have and which was not in this wave's scope.

**Also recorded:** the reviewer did not run `signature-flow.e2e.spec.ts` or
`read-only-panel.e2e.spec.ts`. It verified structurally that S7 cannot have caused the
signature-flow failure — that spec never visits `/d/{id}`, where the store default makes the old and
new `isReadOnly` bit-identical — but the stash comparison in the section above remains the only
empirical evidence for it.

**Gates after the review fixes:** `pnpm --filter @lemnaria/web test` → 40 passed, 1 skipped (41
files); 634 passed, 4 skipped (638). `typecheck` and `lint` clean.
`playwright test read-only-panel --project=mobile` → 1 passed, re-run because S7-F2 touches that
surface.

## Wave S8 — SCENE-002

`testing-reports/04-three-scene.md`'s SCENE-002 (Medium): the stage allocates a kit, a full room,
lights, ground, contact blob, materials, geometries and canvas textures in a mount-lifetime
`useMemo` and supplies them through `<primitive>`. React Three Fiber 9.7's reconciler never disposes
a primitive — verified in the installed source at
`apps/web/node_modules/@react-three/fiber/dist/events-156d8d12.esm.js:15231-15237,15292`, where
disposal is skipped for `child.type !== 'primitive'` and again in `swapReconstructedInstances` — so
every client-side remount stranded the lot until the WebGL context went. A continuity reviewer's
note on wave S1 belongs to the same finding: `buildKitchenShell` builds the whole 32-child reference
room, keeps five children and dropped the other 27 without releasing what only they allocated.

Nothing about what the scene renders changes. This wave only frees what a teardown leaves behind.

### The ownership model, which is the whole difficulty

A kit's resources are **shared**: `chamferBox` memoises every geometry by size, so two cabinets of
the same size render from one buffer, and `kit.M`'s materials plus their five baked canvas textures
are used by the shell, every mounted body and the reference room at once. Disposing one that a live
object still references produces a black or invisible object rather than an error, and the parity
suites — which compare CPU-side structure — cannot see it.

Ownership is therefore now **recorded as the kit builds** rather than inferred at teardown, in
`packages/three-adapter/src/kit-ownership.ts`: a `WeakMap` keyed on the kit's `KitMaterials`
identity holds the geometry cache, the materials and the textures the kit created. `makeKit` fills
it (`ownsGeometry` reads it, so there is one set, not two agreeing by luck), and the two materials
derived from a kit — a recoloured finish and the black handle — are memoised through
`deriveKitMaterial`, which registers them at the same moment. That replaced the two separate
`WeakMap` caches in `finishes.ts` and `decomposed-bodies.ts`, whose materials no teardown could
have found.

Two disposal rules follow, both in `kit-disposal.ts`:

- **Whole-stage teardown** (`disposeKitAndStage`) may dispose the shared kit resources, because the
  kit is created per mount alongside the room it built and nothing survives the unmount. It walks
  room, ground and blob into `GpuResources` **sets** — the reason "exactly once" holds by
  construction rather than by care — adds the kit's own record, disposes each set member once,
  releases the ownership record so a disposed finish material can never be handed out again, and
  disposes the light rig, whose shadow map nothing else frees.
- **Partial teardown** (`disposeDiscardedBodies`, called by `buildKitchenShell`) may dispose only
  what no surviving object references: the dropped bodies' resources minus everything the five
  retained children reach, minus everything the kit owns.

### Acceptance criteria

1. Every resource one mounted stage allocated is disposed exactly once on unmount, kit-owned shared
   geometry and materials included.
2. No resource a live object still references is ever disposed — specifically, `buildKitchenShell`
   frees only what the 27 discarded bodies alone allocated.
3. The stage teardown is called from a `useEffect(() => () => …, [stage])` cleanup, and the
   selection outline is detached and disposed by its own effect's cleanup, on unmount as well as on
   every dependency change.
4. The scene renders identically: the reference and decomposition parity suites pass unchanged.

### What shipped

- New: `packages/three-adapter/src/kit-ownership.ts`, `src/gpu-resources.ts`, `src/kit-disposal.ts`.
- Changed: `src/kitchen-parts.ts` (registers its materials, textures and geometry cache; new
  `kitMaterialList`), `src/finishes.ts` and `src/decomposed-bodies.ts` (derived materials through
  the registry), `src/kitchen-shell.ts` (releases the discarded bodies), `src/three-guards.ts`
  (`isTexture`), `src/index.ts`.
- Changed: `apps/web/src/scene/kitchen-stage.tsx` — an unmount cleanup calling
  `disposeKitAndStage(stage)`, and the outline effect now returns its own cleanup instead of
  clearing the previous outline at the top. The teardown effect is declared **after** the outline
  effect on purpose: React runs cleanups in declaration order, so the outline has left `stage.room`
  before the teardown walks it, and nothing is disposed twice.
- New tests: `packages/three-adapter/tests/kit-disposal.test.ts` (12, three added by the review round),
  `apps/web/tests/scene/kitchen-stage-disposal.test.ts` (5).

### Falsifiability — every new test was watched to fail

Each was run against a mutated implementation, not assumed to be strict:

| Mutation                                                        | Failure observed                                                    |
| --------------------------------------------------------------- | -------------------------------------------------------------------- |
| `disposeKitAndStage` skips the kit-owned record                 | `MeshStandardMaterial "wall_paint": expected 1 times, got 0`         |
| `disposeGpuResources` called twice (list, not set, semantics)   | `MeshPhysicalMaterial "door_matte_white": expected 1 times, got 2` (4 tests) |
| Light rig disposal removed                                       | `HemisphereLight: expected 1 times, got 0`                           |
| `buildKitchenShell` drops bodies without disposing              | `CylinderGeometry: expected 1 times, got 0`                          |
| `disposeDiscardedBodies` disposes everything the dropped bodies referenced | `ExtrudeGeometry: expected not to be called, called 1 times`         |
| `kitchen-stage.tsx` at HEAD (no cleanups)                       | all 5 web tests fail                                                 |
| Outline disposed without `removeFromParent()`                   | the outline is still in `stage.room` when the teardown runs          |

### Not done, and why

**No `renderer.info.memory` gate.** It cannot be written honestly here: `renderer.info.memory` is
populated by a real `WebGLRenderer`, and both vitest suites run in the `node` environment with no
WebGL context, so a headless version would assert on counters that never move. The exactly-once
disposal accounting above is what this wave can prove. A browser stress gate belongs in
`apps/web/tests/e2e/` against a running app, and was not built or run in this wave.

### Review round — S8-F1, F2, F3 (2026-08-31)

**S8-F1 (High, latent) — the release split the ownership record in two.** `makeKit` captures the
record in a closure and `ownsGeometry` answers from *that object*, while
`releaseKitOwnedResources` deleted only the `WeakMap` entry. After a release the next reader built a
second, empty record: the registry said the kit owned nothing while the kit's own cache still said
"mine" about the same buffer — and "owns nothing" reads to `disposeDiscardedBodies` as "none of this
is shared". The reviewer proved 106 shared `ExtrudeGeometry` buffers disposed while the memo would
still hand those exact objects to every future body, with every test green. Not reachable today
(`makeKit` and `buildKitchenShell` live in one `useMemo([])`), reachable the moment a kit is reused
or the shell rebuilt.

Fixed by emptying the sets **in place** and keeping the record, so closure and registry are
permanently the same object and cannot answer differently, plus an `isReleased` flag. Building a new
shell from a released kit now throws (`assertKitIsLive`) rather than freeing buffers its memo still
hands out.

**S8-F2 (Medium) — StrictMode falsified the doc comment's premise.** `reactStrictMode: true`
(`apps/web/next.config.ts:8`) replays mount → unmount → mount in development **without** re-running
`useMemo`, so the cleanup disposes a kit whose room is handed straight back to the re-run effects.
The module header now says plainly that "nothing survives it" is a property of the memo and the
mount sharing a lifetime, not of the kit, and `disposeKitAndStage` returns early for an already
released kit so the replayed teardown is a no-op.

**Deliberate deviation, and why.** The review offered a released kit that throws for *any* ownership
question. That was not taken: under StrictMode the replayed effects run against the released kit on
every development page load — `applyFinish` re-derives a material, an edit disposes a body through
`ownsGeometry` — so a global tripwire would turn F2's own scenario into a dev-time crash. The throw
is therefore placed only on `disposeDiscardedBodies`, the path where the proven damage happens and
which a StrictMode replay cannot reach (`buildKitchenShell` runs only inside the memo). `ownsGeometry`
stays answerable and now agrees with the registry, which is what F1 asked for.

**S8-F3 (Low) — the cast's residual risk inverted.** `kitMaterialList` now filters with an
`isMaterial` guard instead of asserting the values are materials, so a non-material field added to
`KitMaterials` cannot be carried into a list about to be `.dispose()`d.

Also done: the disposal test now states why replaying cleanups front to back reproduces React's
unmount, and therefore why swapping the two effects fails it; the source comment no longer overstates
a reorder (outline resources are unique, so meeting one would be a harmless double dispose, not a
black object); and `collectObjectResources` records that Mesh/Line is an assumption about this
adapter's builders — no `InstancedMesh`, `Points`, `Sprite`, `SkinnedMesh`, morph attributes or
`userData`-held textures exist today.

Three regression tests added, each watched to fail against the pre-fix code:

| Mutation                                              | Failure observed                                              |
| ----------------------------------------------------- | -------------------------------------------------------------- |
| release deletes the registry entry (the pre-F1 code)  | `expected true to be false`; `expected [Function] to throw`; `BoxGeometry: expected 1 times, got 2` |
| no replayed-teardown guard                            | `BoxGeometry: expected 1 times, got 2`                        |
| partial teardown does not check the kit is live       | `expected [Function] to throw an error`                       |

### Found and not fixed — S8-F4 (out of scope)

`packages/three-adapter/src/stage.ts:73`: `PMREMGenerator.fromEquirectangular` returns a
`WebGLRenderTarget` and only its `.texture` is kept and disposed, so the render target's framebuffer
is never freed. Pre-existing, untouched by this wave's diff, and recorded here rather than lost
because this wave is the leak audit.

### Gates run

| Command                                        | Result                                          |
| ---------------------------------------------- | ----------------------------------------------- |
| `pnpm --filter @lemnaria/three-adapter test`    | exit 0 — 32 files, 720 tests passed             |
| `pnpm --filter @lemnaria/three-adapter lint`    | exit 0                                          |
| `pnpm --filter @lemnaria/three-adapter typecheck` | exit 0                                        |
| `pnpm --filter @lemnaria/web test`              | exit 0 — 40 passed, 1 skipped; 639 passed, 4 skipped |
| `pnpm --filter @lemnaria/web lint`              | exit 0                                          |
| `pnpm --filter @lemnaria/web typecheck`         | exit 0                                          |

`pnpm check` was deliberately not run — the coordinator owns it. The Playwright e2e suite was not
run.

## Wave S9 — DOM-002

**The finding.** `occupiedDepthM` is the single answer to "how deep is the space this body fills" —
`Column.d` (§3.2's MAX) and the opening a swap vacates (§5.3) both read it — and its own contract
documented that its fallback was wrong. Two `kind` arms handled the hood and the fronted wall
carcass; everything else fell through to `return record.frame.d`, which is not a depth at all
(ADR 0018: it is twice the body's rear overhang). An opening derived from it is **shallower than the
body that just vacated it**, so a reload or a swap could offer a space the outgoing body no longer
fits into.

### The depth model

`BodyDefinition.occupiedDepth` is now a **required** declaration on every catalogue entry, carried
onto `PlacementRecord` and applied by `occupiedDepthFromSeat`. Two rules, because the shipped
builders come in two kinds:

| Rule                | Means                                                                     | Entries                                                                           |
| ------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `recorded-shell`    | the builder consumes the depth it is handed and centres the shell on `z = 0`, so `frame.d` **is** that shell: finished depth = shell + front assembly | `wall-cabinet`, `wall-lift` and the seeded wall/top rows (+39 mm, ADR 0036 decision 1); `open-shelf`, `open-shelf-600` (+0) |
| `wall-plane`        | the builder ignores the depth argument and always builds the same body, so the space it fills is one declared distance from the wall plane | every base, full-height, appliance and corner body, and the front-hung hood       |

There is deliberately **no** `recorded-shell` arm for a base or a column: a base carcass records 580
for a 560 mm shell, so "shell plus a front" there would be arithmetic on a number that is not a
shell — a fiction that happens to land on the right answer, which is the shape ADR 0028 exists to
stop.

**Unknown fails closed.** `UndeclaredOccupiedDepthError` is thrown for a definition that declares no
rule or an unrecognised one. TypeScript makes the field required, so a catalogue assembled in
TypeScript cannot reach it; the throw is for a `BodyCatalog` assembled outside it, which is what the
port allows.

**One accepted decision is partly superseded, and the first version of this record wrongly claimed
none was** (review F3). [ADR 0040](../decisions/0040-a-recorded-seat-is-converted-back-not-read-as-a-depth.md)
decision 1 states the rule as *"the cabinet-depth line for a hood, `frame.d + 39` for a fronted wall
carcass, **`frame.d` for everything else**"*. That last clause is now false, and `AGENTS.md` is
explicit that a dated record must not be silently overturned. What the decision is *about* is
untouched: a recorded seat is converted back rather than read as a depth, in exactly one place, and
that place is still `occupiedDepthM`. Only the third arm changed, from a guess to a declaration.

**ADR 0040 therefore needs a dated amendment, and it is not written here** — the coordinator is
dispatching a scribe. `occupied-depth.ts`'s module header records the debt in the meantime.

ADR 0018's seat encoding is untouched. ADR 0028's remedy — declare in the domain, derive in the
adapter, gate the two — is the mechanism used.

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
| ------------------------------------------- | ---- | -------- | ---------------------------- |
| `base-dishwasher` / `base-dishwasher-600`   | 580  | 632      | the appliance's door bar     |
| `base-hob-oven`                             | 580  | 648      | the oven fascia and its bar  |
| `tall-oven-tower` / `tall-oven-tower-600`   | 560  | 638      | the oven and microwave bars  |
| `base-corner-return-320`                    | 580  | 600      | its worktop                  |

### Tests added

- `packages/configurator-domain/tests/occupied-depth.test.ts` — every entry in both populations
  declares a rule; the undeclared and the unrecognised case each throw; both rules applied; the
  whole shipped kitchen's occupied depths as one table; and the guard that the table is not the seat
  restated (only `open-shelf-600` agrees with its seat).
- `packages/three-adapter/tests/occupied-depth.parity.test.ts` — **the gate that makes the
  declaration a fact.** Every insertable body at every width its entry offers (and a wall carcass at
  both depths it is ever built to), plus every seeded body, measured off the meshes and compared to
  what the domain answers. Plus `remove → opening → rebuild`: every swappable seeded placement is
  swapped through `insertBody` with the real probe, rebuilt the way `scene-sync` rebuilds it
  (`rebuildDepthM`), measured, and required to fill **exactly** the opening it vacated. Since review
  F4 the insertable sweep also pins each `wall-plane` entry's `frameDepthMm` to `2 ×` its measured
  seat, which is the assumption the domain's fake probe rests on.

**Watched to fail against the pre-fix behaviour.** `occupiedDepthM` was temporarily reverted to the
two-arm `kind` switch with the `frame.d` fallback, with the declarations left in place so it still
compiled:

| Suite                                     | Failures against the old behaviour                                     |
| ----------------------------------------- | ---------------------------------------------------------------------- |
| `tests/occupied-depth.test.ts` (domain)   | 6 failed / 40 passed — both fail-closed cases, both rules, both tables |
| `tests/occupied-depth.parity.test.ts` (adapter) | 67 failed / 102 passed — every base, tall, fridge and corner case, and 7 of the 22 round trips |

The 15 round trips that passed against the old code are the wall and hood ones: wave 5F fixed those,
and this wave leaves them exactly where they were.

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

`hob-base.adversarial.test.ts` — "the two hob bases carry identical catalogue geometry" — is the one
whose premise moved. It now normalises `occupiedDepth` out of the deep-equal and asserts the
difference explicitly: the drawer variant finishes at its worktop (620) and the oven variant's fascia
and bar reach 28 mm past it (648). Nothing *picks* between the two by depth — §5.2 fits on width and
height and §9 offers on the width model, and their nominal depths are both still 580 — but declaring
them equal would declare a body 28 mm shallower than the one that gets built.

### A second defect of the same shape, found and fixed: the fake probe

`tests/support/fake-probe.ts` modelled **every** builder as consuming the depth it is handed
(`request.depthM / 2`). It is DOM-002 wearing the other hat: a base body handed a 620 mm opening
reported a 620 mm seat, where the real builder reports 580 whatever it is handed. It was invisible
while `Column.d` happened to equal the seat, and four domain assertions pinned to `580` broke the
moment the opening changed. Left alone, those four would have had to be "updated" to 620 — a number
production never records.

`seatOffsetFor` now reads the catalogue's own `occupiedDepth` declaration: a `recorded-shell` entry
is seated from the depth it was handed, a `wall-plane` entry from its declared `frameDepthMm`. This
also deletes the duplicated `FRONTED_WALL_BUILD_IDS` set the file's own comment complained about
(the ADR 0028 shape), and covers the front-hung hood without a second rule. `createFakeProbe` takes
an optional `catalog` so a test that inserts a synthetic entry seats it from the catalogue it added
it to.

### Behaviour that changed, deliberately

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

**`Column.d` is not only a depth — it positions the column and sizes every void mesh** (review F2).
`deriveColumns` derives the column's off-wall coordinate as `depth / 2` (`void-engine.ts`), so those
eight origins move forward with it — `A\|0.45` 280 → 315, `B\|2.45` 340 → 371 — and `recomputeVoids`
stamps the depth onto every void, which `buildVoidMesh` (`three-adapter/src/void-mesh.ts`) draws. So
the **rendered void highlight is user-visible and grew**: over a base column it now projects to the
620 mm worktop line at wall height, roughly 290 mm past the 330 mm cabinets beside it, where it used
to project 250. Nothing in the suite asserts void geometry, so no test caught this; it is recorded
here rather than left to be discovered. It is arguably an improvement in honesty — the box now
covers the space a body really fills — but it was not asked for and it is not asserted anywhere.

**What the panel offers and what a resize accepts is unchanged.** Checked by reading the call sites,
not inferred from a green suite: no fit gate reads depth (§5.2 judges width and height, `insert-fit.ts`),
and `refuseBuiltSize` checks width and height only. There is no depth refusal in the model to widen.

#### The claim this record made and got wrong (review F1)

The first version of this section said a wall carcass over a full-height column is "not hit by the
shipped kitchen". **That is false.** I checked one column — a lone tall pantry — and did not check
the case an ordinary delete actually produces: deleting the **top cabinet** leaves the full-height
member standing under the opening, so `hasFullHeightUnder` stays true and `resolveDepthM`'s uncapped
arm hands the builder the column's whole depth. Run on the shipped design with the real probe
(delete, then insert `wall-cabinet` into the void):

| deleted | column | void `d` | `hasFullHeightUnder` | built seat | occupies | before |
| ------- | ------ | -------- | -------------------- | ---------- | -------- | ------ |
| `p22` | `B\|1.20` | 638 | true | 599 | 638 | 600 |
| `p23` | `B\|1.80` | 600 | true | 561 | 600 | 600 — unchanged |
| `p24` | `B\|2.45` | 742 | true | 703 | 742 | 680 |

Two cases are reached by an ordinary delete-then-insert, and both deltas are larger than the 599 I
named. Delete `p24` and insert a wall cabinet and the customer gets a **742 mm finished wall cabinet
with a 703 mm carcass**, hanging over a 680 mm fridge — deeper than the appliance, because
`occupiedDepth` now includes the fridge's door bars. Pre-fix it built 680.

(Deleting the full-height member *itself* does not reach this: `withCurrentFullHeightMembers`
re-answers `hasFullHeightUnder` from the new records, so the lift goes with it and the cap applies —
backlog entry 5's positive reading, working as designed. That is the case I checked, and it is the
wrong one.)

### Found and not fixed — S9-F1 (open, needs its own wave)

**`resolveDepthM`'s uncapped arm asks `occupiedDepthM` the wrong question.** Two different facts are
being served by one number:

- *"the full extent a body occupies, handles included"* — a **clearance** fact, which is what §3.1
  asks for and what `occupiedDepthM` computes;
- *"the depth to build the next body to"* — a **manufactured size**, which is what `resolveDepthM`
  hands the probe.

Only the first is what `occupiedDepthM` is. `worktop-depth.ts` exists precisely to stop a formula
inventing a cabinet nobody makes — *"a formula would invent a 372 mm cabinet nobody makes, which is
why a third worktop size is a new row here and never an interpolation"* — and the uncapped arm is a
formula doing exactly that, one module over.

**The defect pre-dates this wave.** A 680 mm wall carcass, which is what that arm built before, is no
more manufacturable than a 742 mm one. What this wave does is **worsen it**: the number the arm reads
is now the full extent including appliance handles, so it is further from any real cabinet than it
was, and it is reached on two columns of the shipped kitchen rather than none.

**Reproduced live and persisted — not derived.** In the running product at 390 x 844: delete `p24`,
then insert `wall-cabinet` into the void it vacates. The document written to the database carries
`seatDepthMm: 703` — a 742 mm finished wall cabinet hanging over a 680 mm fridge — with `probe=on`,
an **empty `rejection`**, and zero console errors. No gate on that path paused.

**It has no user-facing tell**, which is why it can reach manufacturing unnoticed:

- **The panel surfaces no depth at all.** The offer sheet for that opening reads *"Spatiu liber ·
  Perete B · suspendat · **700 x 750 mm**"* and *"4 corpuri intra in 700 x 750 mm"* — width and
  height only. The 703 appears on **no screen in the product**.
- **Neither the void nor the rebuilt body looks wrong.** The void is a clean box above the fridge and
  the rebuilt cabinet renders as a plausible deep cabinet. A person would flag neither, and would
  catch it only by comparing against the 330 mm run on the other wall.
- **No camera preset shows wall B at a grazing angle** — *Perete B* is face on, *Perete A* frames the
  other run — so that column's void depth is not legible in any view the product offers.

Silent in the copy, silent in the render, and it lands as a 703 mm carcass nobody ordered. That is
what should decide the follow-up's priority: a spec-to-manufacture defect, not a cosmetic one.

**Deliberately not fixed here.** Whether that arm should read `opening.d` at all is a product
decision — it needs its own wave and probably an ADR, and the coordinator is raising it with the
owner. Changing `resolveDepthM` inside a wave scoped to DOM-002 would be exactly the silent
product change this remediation exists to stop.

### Gates run

| Command                                              | Result                                              |
| ---------------------------------------------------- | --------------------------------------------------- |
| `pnpm --filter @lemnaria/configurator-domain test`    | exit 0 — 61 files, 1041 tests passed                |
| `pnpm --filter @lemnaria/configurator-domain lint`    | exit 0                                              |
| `pnpm --filter @lemnaria/configurator-domain typecheck` | exit 0                                            |
| `pnpm --filter @lemnaria/three-adapter test`          | exit 0 — 33 files, 889 tests passed                 |
| `pnpm --filter @lemnaria/three-adapter lint`          | exit 0                                              |
| `pnpm --filter @lemnaria/three-adapter typecheck`     | exit 0                                              |
| `pnpm --filter @lemnaria/web test`                    | exit 0 — 40 passed, 1 skipped; 639 passed, 4 skipped |
| `pnpm --filter @lemnaria/web lint`                    | exit 0                                              |
| `pnpm --filter @lemnaria/web typecheck`               | exit 0                                              |

`pnpm check` was deliberately not run — the coordinator owns it. Browser verification **was**
performed after review round 1; see "Browser verification" below. This paragraph originally recorded
it as a gap, which stopped being true and is corrected here rather than left standing.

### Review round 1 — what changed

Approved with six findings. `resolveDepthM` was deliberately **not** touched (F1's instruction).

| # | Finding | Done |
| - | ------- | ---- |
| F1 | the product-behaviour claim was false on the shipped kitchen | claim corrected above with the real numbers, re-measured myself; the underlying defect recorded as open finding **S9-F1** |
| F2 | `Column.d` also positions the column and sizes every void mesh | added to the behaviour list, with the per-column table and the origin shifts |
| F3 | an accepted decision was overturned while claiming none was | claim corrected; ADR 0040 flagged as needing a dated amendment, in the record and in `occupied-depth.ts`'s header. The ADR itself is **not** edited here — a scribe owns it |
| F4 | the fake probe's `wall-plane` arm rested on an ungated coincidence | the insertable parity sweep now asserts `2 × seatOffsetM === frameDepthMm` for all thirteen `wall-plane` entries |
| F5 | a third encoding of "fronted wall carcass" survived in the adapter | `FRONTED_WALL_BUILD_IDS` is now **derived** from `INSERTABLE_BODY_DEFINITIONS`' own `occupiedDepth` (`recorded-shell` with a front), so there is one declaration and no set to forget |
| F6 | the `recorded-shell` doc comment overstated | rewritten: the rule is about where the shell sits, not about what the builder is handed |

One correction to the review itself: **eight** of twelve columns changed depth, not nine. Every
per-column delta the review quoted is right (`A\|0.45` +70, `A\|2.00` +52, `B\|2.45` +62, bases +40);
the four unchanged are `B\|1.80`, `A\|0.30`, `A\|0.75` and `B\|0.61`. The table above is the full
count.

### Browser verification

Run after review round 1, because F2 established that the void mesh is user-visible and that nothing
in the suite asserts it. Driven at **390 x 844** through the project's own Playwright runner, which
sets the agreed viewport before navigating, starts a fresh dev server, and points `DATABASE_URL` at
the test database through ADR 0006's `assertSafeTestDatabaseUrl` guard. **Zero console errors and
zero page errors** across every run.

- **The seeded kitchen renders unchanged** — bodies flush, nothing off the wall, no clipping or
  z-fighting, the corner intact. Expected: `occupiedDepth` feeds columns and voids, not body
  geometry.
- **The base-column void seats on the worktop line**, slightly forward of the cabinet doors beside
  it, which is where a 620 mm worktop puts it. Correct.
- **The wall-height void in a base column overhangs its 330 mm neighbours by 290 mm** — 250 mm before
  this wave. Judged a **misleading affordance rather than a rendering defect**: the box is well
  formed, and honest about the *column*, which really is 620 deep because of the base run beneath it.
  It is dishonest about the *opening*, because anything inserted there is capped to 330 by
  `resolveDepthM`, so the highlight advertises roughly twice the depth of the body that will appear.
  The same conflation `S9-F1` names, with the void mesh as its third consumer.
- **`A|0.45` is unobservable, and a future reader should not go looking for its effect.** The column
  that moved most (560 -> 630, origin 280 -> 315) can **never render a void**: its only member is
  `p25`, a structural corner, and §13.1 refuses to remove it. Confirmed in the product — the panel
  offers no remove control and renders the *CORP STRUCTURAL* refusal instead. `B|0.74` and `B|0.61`
  are the same. Whatever those three columns publish is invisible under every reachable interaction.
- **Deleting `p24` and re-inserting a wall cabinet persists `seatDepthMm: 703`** with no refusal.
  That is `S9-F1`, reproduced live; the evidence and what it means are recorded there.

**What this does not cover.** The committed Playwright e2e suite was not run — the verification drove
the product through that runner but added nothing to the suite. **Void geometry remains unasserted**,
which is why the F2 change reached review unnoticed in the first place. A spec pinning it is
defensible and was deliberately not taken here: it is a scope change, not a fix for DOM-002.

**One blemish, owned.** The first run of the throwaway harness crashed in its own cleanup, so one
design row it minted was **not** deleted from the test database. Later runs cleaned up correctly. The
row is in the test database and never the application's — ADR 0006's guard is what makes that certain
— but it is exactly the leak that decision's third mechanism exists to prevent.

## Wave S10 — DB-004

**The finding.** `runMigrations` kept a hard-coded file list, executed every file on every run,
recorded no applied version or checksum, and ran each file as a separate query. It worked only
because all three migration files are written to be idempotent. The first backfill, rename,
constraint validation or non-idempotent transformation would either rerun or leave the database
part-migrated after a later file failed. ADR 0020 named the gap; the source comments admitted it.

**What replaces it.** An append-only `schema_migrations(version, file_name, checksum, applied_at)`
ledger. Each pending migration runs in its own transaction, under a transaction-scoped advisory
lock, with its ledger row inserted by that same transaction. A changed checksum, a gap in the
sequence, and a ledger row whose file no longer exists are each refused. The file list is now read
from the directory and required to be a contiguous run from 0001, so adding a file and forgetting a
list entry can no longer silently skip a migration.

The runner moves from the HTTP `neon()` function to the WebSocket `Client` from the same driver.
That is not a preference: the HTTP driver has no session, so it cannot hold a lock across a read and
a write, and its transactions must be handed every statement up front — "read the ledger, then
decide what to execute" is not expressible over it. `MIGRATION_DATABASE_URL` is still the only
connection migrations use, and the application role is untouched (ADR 0008 stands).

### The four design decisions

**Bootstrapping.** The ledger cannot be introduced by a migration file — that would be a table
recording its own creation. The runner issues `create table if not exists schema_migrations` itself,
inside each transaction and *after* taking the lock. `if not exists` is what makes it safe on a
database where migrations have already run: it finds the table, changes nothing, and never touches
`designs`. Taking the lock first is what makes it safe under concurrency, since concurrent
`create table if not exists` is one of the few statements that genuinely races in Postgres. The DDL
lives in TypeScript, not a loose `.sql` file, because the build copies only `src/migrations` into
`dist` — a `.sql` file beside it would be present in the source tree and absent from the published
package, which is exactly the ADR 0013 failure.

**Adopting a database that already ran these migrations, with no ledger rows.** They are **re-run,
not backfilled**. The justification is specific rather than general: all three existing files are
idempotent by construction (`create table if not exists`, `add column if not exists`, and a DO block
that adds the check constraint only when `pg_constraint` lacks it), so re-executing them is a
verified no-op. A backfill would instead have to infer from `information_schema` which migrations
had run, and an inference that is wrong marks an unapplied migration as applied — permanently, and
silently. That trade is only worth taking when re-running is unsafe, and here it is not. Future
migrations need no such property, because from the first run onwards the ledger exists.

**What happens the first time this runs against the existing Neon databases** (`lemn-conf-v2`, the
Preview database, and `lemn-conf-v2-staging`): `schema_migrations` does not exist, so it is created;
the ledger is empty, so all three files are pending; each runs in its own transaction and each is a
no-op against the schema that is already there; three ledger rows are written. No `designs` row is
read, written or deleted, and no schema change occurs. The command prints
`[migrate] applied 0001_…, 0002_…, 0003_… against <database> (0 already applied)`. Every run after
that prints `[migrate] applied nothing against <database> (3 already applied)`. This is asserted, on
a live database, by the "bootstraps its own ledger … and adopts the schema already there" test,
which inserts a design row first and checks it survives untouched. **No migration was run against
the application database in this wave** — the whole wave ran against `TEST_DATABASE_URL`.

**Checksum.** SHA-256 over the file's bytes with line endings normalised to LF, and nothing else
normalised. Line endings because `core.autocrlf` rewrites them on checkout, which would change every
byte of every migration on a Windows clone and block a deploy over a difference nobody made — the
one transformation a checkout applies by itself. Nothing else, because any cleverer rule needs to
understand SQL and every gap in that understanding is somewhere a real edit can hide; because the
comments in these files are load-bearing (0003's explain a security control); and because an applied
migration must not be edited at all, so tolerance for "harmless" edits answers a question that should
not be asked. The consequence is stated in the module: reformatting an applied migration breaks the
next run, on purpose, and the fix is to revert the file, never to relabel the ledger.

**Advisory lock scope.** Transaction-scoped (`pg_advisory_xact_lock`), not session-scoped. This
answers "what if the process dies holding it?" by removing the case: Postgres releases the lock at
commit or rollback, so no uncaught exception, no `process.exit` between statements and no dropped
connection can leave it held. A session-scoped `pg_advisory_lock` would need a matching unlock on
every path and would depend on the server noticing a dead connection before the next deploy. The
cost is that the lock covers one migration rather than a whole run — a second runner can apply a
later file between two of this one's transactions. That is safe because every transaction re-reads
the ledger *inside* the lock, so no runner ever decides from a stale view, and both walk the files
in the same order.

### Changed files

| File                                                | Change                                                        |
| --------------------------------------------------- | -------------------------------------------------------------- |
| `packages/persistence/src/migrate.ts`               | Rewritten: ledger-driven, one transaction per migration, under the lock |
| `packages/persistence/src/migration-ledger.ts`      | New — the ledger's SQL and the lock key, with the scope decision recorded |
| `packages/persistence/src/migration-plan.ts`        | New — pure: what to apply, and every refusal, decided from two lists |
| `packages/persistence/src/migration-files.ts`       | New — reads the directory, requires a contiguous run from 0001 |
| `packages/persistence/src/migration-checksum.ts`    | New — the normalisation rule and why it stops where it does    |
| `packages/persistence/src/migration-errors.ts`      | New — domain error types; no driver error reaches a caller raw  |
| `packages/persistence/src/index.ts`                 | Exports the error types and `MigrationRunSummary`               |
| `packages/persistence/package.json`                 | `build` clears `dist/migrations` before copying (see below)     |
| `packages/persistence/tests/support/migration-ledger-probe.ts` | New — ledger probes, each guarded by `assertSafeTestDatabaseUrl` |
| `packages/persistence/tests/migrate.test.ts`        | Live ledger behaviour; `describeMigrationRun` re-pinned          |
| `packages/persistence/tests/migration-{plan,files,checksum}.test.ts` | New — the offline rules                         |
| `packages/persistence/tests/neon-configuration-repository.adversarial.test.ts` | Drop-the-column test now forgets the ledger rows too |
| `packages/persistence/tests/neon-configuration-repository.test.ts` | The re-run test now asserts a skip, not an idempotent re-execution |

**A build bug found on the way, and fixed.** `cp -R src/migrations dist/migrations` copies *into* an
existing `dist/migrations` rather than replacing it, so an incremental build over a stale `dist` left
`dist/migrations/0001_…sql` from an older build beside a nested `dist/migrations/migrations/` holding
the real three. The existing `test -f dist/migrations/0001_create_designs.sql` guard passed anyway.
Under the old hard-coded list this surfaced as a loud `ENOENT` on 0002; under a directory read it
would have surfaced as a run that quietly applied only 0001. `rm -rf dist/migrations` now precedes
the copy, verified by building twice over an existing `dist`.

### Two existing assertions were rewritten, deliberately

ADR 0020's strongest test drops `write_token_hash` and asks the migration to put it back, so that a
run which did nothing cannot pass. With a ledger the runner correctly skips an applied file, so the
test now forgets the ledger rows for 0002 and 0003 alongside the column. **This is not a weakening.**
It pins the stronger property: what the runner executes is decided by the ledger, and the test
asserts the returned summary names both files. Both rows are forgotten rather than only 0002 because
0003's check constraint went with the dropped column, and because leaving 0003 recorded while 0002 is
not is precisely the gap the runner refuses. The neighbouring "is additive" test forgets them too,
for the same reason — otherwise it would have been asserting row preservation across a run that did
nothing at all. `neon-configuration-repository.test.ts`'s idempotence test now asserts the skip.

### Tests added, each watched to fail

Against the pre-fix `src/`, the four new test files cannot even load, and the two rewritten
assertions fail on the summary the old runner does not return:

| Test file                            | Result against pre-fix `src/`                                    |
| ------------------------------------ | ------------------------------------------------------------------ |
| `migrate.test.ts`                    | `Cannot find module '../src/migration-checksum.js'`               |
| `migration-checksum.test.ts`         | `Cannot find module '../src/migration-checksum.js'`               |
| `migration-files.test.ts`            | `Cannot find module '../src/migration-checksum.js'`               |
| `migration-plan.test.ts`             | `Cannot find module '../src/migration-errors.js'`                 |
| re-adds the column after it is dropped | `AssertionError: expected undefined to deeply equal [ …(2) ]`    |
| skipped on a re-run                  | `AssertionError: expected undefined to deeply equal []`           |

Because "the module does not exist" is a thin proof, each behaviour was then mutated in the finished
code and the specific test watched to fail:

| Mutation                                          | Failure observed                                                                    |
| ------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `begin`/`commit` replaced with `select 1`         | concurrency test and ledger-atomicity test fail — `duplicate key … schema_migrations_pkey`, and the probe table and a version-4 row both survive |
| checksum comparison short-circuited               | "refuses … no longer matches its recorded checksum" fails                            |
| gap check short-circuited                         | "refuses … when the ledger has a gap" fails                                          |
| `pg_advisory_xact_lock` call removed              | "two concurrent runners … exactly once" fails                                        |
| every file treated as pending (ledger ignored)    | 5 tests fail — `duplicate key value violates unique constraint`, `Key (version)=(1) already exists` |
| ledger bootstrap DDL removed                      | 9 of 14 tests fail                                                                   |

The required cases are all covered: mid-file failure leaves no ledger row and no partial schema
change; a changed checksum is refused; a gap is refused; a full re-run is a no-op; two concurrent
runners apply each file exactly once with the loser finding nothing to do; and the bootstrap path
runs against a database with no ledger. One case was added beyond the list — a migration whose
ledger row cannot be recorded — because Postgres already wraps a multi-statement file in an implicit
transaction, so the *explicit* transaction's real job is binding the schema change and its ledger row
into one change, and only that test proves it.

### Gates run

| Command                                          | Result                                        |
| ------------------------------------------------ | ----------------------------------------------- |
| `pnpm --filter @lemnaria/persistence test`       | exit 0 — 14 files, 127 tests passed            |
| `pnpm --filter @lemnaria/persistence lint`       | exit 0                                          |
| `pnpm --filter @lemnaria/persistence typecheck`  | exit 0                                          |
| `pnpm --filter @lemnaria/persistence build`      | exit 0, twice, over a clean and a stale `dist`  |

`pnpm check` was deliberately not run — the coordinator owns it. Nothing was run against the
application database, and no environment variable or provisioned resource was added, changed or
removed.

### Wave S10 — review round 2 (nine findings, all addressed)

**S10-3 (Medium), fixed first, because it was not hypothetical.** The reviewer's own mutation
spot-check wedged the shared live test database with this wave's test: the synthesised migration at
`migrate.test.ts` inserts `version = 4` into `schema_migrations` itself, so with the transaction
under test removed the row and the probe table committed and stayed. A ledger row whose version has
no file makes every later `runMigrations` throw, the adversarial suite then dropped
`write_token_hash` and could not restore it, and the whole persistence suite went red until the
owner authorised a repair. The test's cleanliness depended on the very mechanism it was testing.

Fixed with `dropSynthesisedMigrationArtefacts`, which deletes every `version >= 4` ledger row and
drops the probe tables. It runs in a `finally` in each of the three synthesising tests **and** in an
unconditional `afterEach` — the `finally` only runs if the test body was entered, and a `beforeAll`
failure, a timeout or an unhandled rejection can skip it. Demonstrated by re-running the exact
mutation that caused the incident: the two discriminating tests still fail, as they must, and the
database afterwards reads `version 1, 2, 3` with no `db004_*` table left.

**S10-1 (Medium) — a rollback deploy hard-failed with a message that misdirected.** The orphan-row
guard keyed only on version, so an operator on an older checkout (0004 shipped and applied, the
deployment rolled back, `migrate` re-run from the older revision as the restore runbook's drill step
instructs) was told "a migration that ran must not be deleted or renamed" when nobody had deleted
anything. The guard now separates *the ledger is merely ahead* — every orphan above the highest
version on disk — from *a genuine hole*, an orphan below a version that does exist. The first now
says "This checkout is older than the database … Nothing has been deleted and nothing is wrong with
the database", and points at migrating from the matching revision. **Both still refuse**, and that
is deliberate: reporting success would tell the operator the database is at the schema this checkout
expects, which is exactly what it is not, and the runner cannot know whether the extra migration is
compatible with the code being rolled back to.

**S10-2 (Medium) — a connection failure escaped raw, contradicting this package's own contract.**
`client.connect()` sat outside the `try`, so `migration-errors.ts`'s "the runner throws nothing
else" and the changed-files table's "no driver error reaches a caller raw" were both false for that
path, and the CLI had no catch — Node's uncaught printer would dump a Neon WebSocket error carrying
endpoint and host detail. `connectOrWrapError` now wraps it in a `MigrationExecutionError` naming
the database and nothing else from the URL, and the CLI catches, prints
`describeMigrationFailure(error)` and sets a non-zero exit code. `describeMigrationFailure` prints
the error's own name and message only — never the object, never the `cause` chain, which is exactly
where a connection string hides.

**S10-4 (Low) — what the transaction-per-migration rule forbids is now recorded.** `runMigrations`'
doc comment names the excluded statements (`create index concurrently`, `reindex concurrently`,
`vacuum`, `alter system`, `create database`, `drop database`, and `alter type … add value` on older
servers), states the trade, and says that a migration genuinely needing one is an operator action
deserving its own decision record rather than a quiet exception carved into the runner.

**S10-5 (Low) — `file_name` is now checked, not merely recorded.** The checksum hashes bytes, so a
rename with no edit passed silently while the refusal message promised to catch "deleted **or**
renamed". `assertFileNameUnchanged` closes it; the message stays honest.

**S10-6 (Low) — the build guard now asserts the count.** `test -f dist/migrations/0001_…sql` was
satisfied by a `dist/migrations` holding only 0001 — the silent partial-set failure the `rm -rf` was
added to prevent, one class up. Verified by experiment on a doctored `dist`: the old guard exits 0,
the new one exits 1.

**S10-7 (Low) — `databaseNameOf` can no longer print the connection string.** `new URL` raises
`ERR_INVALID_URL` carrying the whole input as an enumerable property. It now returns
`<unparseable connection string>` instead of throwing: the run still fails, without a misconfigured
`MIGRATION_DATABASE_URL` leaking its password into a deploy log.

**S10-8 (Low) — the new table has a privilege assertion.** `application-role-privileges.test.ts`
now asserts `app_designs` holds no grant at all on `schema_migrations`. Read-only, and true whether
or not the ledger exists yet in that database; which it was is settled by ADR 0020's schema
read-back after the first production run.

**S10-9 (Nit)** — `client.query("begin")` moved inside the `try`.

Eleven tests added (127 → 138), including the two message-discrimination cases for S10-1, the
rename refusal, and four redaction assertions for S10-2 and S10-7.

| Command                                          | Result                                       |
| ------------------------------------------------ | ---------------------------------------------- |
| `pnpm --filter @lemnaria/persistence test`       | exit 0 — 14 files, 138 tests passed           |
| `pnpm --filter @lemnaria/persistence lint`       | exit 0                                         |
| `pnpm --filter @lemnaria/persistence typecheck`  | exit 0                                         |
| `pnpm --filter @lemnaria/persistence build`      | exit 0; guard refuses a doctored partial `dist` |

Test database verified clean on exit: ledger holds versions 1–3, no `db004_*` table survives.
