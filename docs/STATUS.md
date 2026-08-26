# Project status

**Read this second, right after `AGENTS.md`, before opening any milestone document.** It exists so a
session can learn where the project stands without reading eight phase plans.

Last updated: 2026-08-26 (M3 closed — all three waves and four sub-waves shipped; M4 next).

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
| M2 — Void engine, picking, persistence | **Done** (closed 2026-08-25 — its last gate, the unwired client write path, was closed by M3 Wave 3C-2b) | No — `milestones/done/` |
| M3 — Insert, remove, swap, client write path | **Done** (closed 2026-08-26) | No — `milestones/done/` |
| M4 — Editor panel and shell | **Next** | Yes — `milestones/M4-editor-surface.md` |
| M5 — Width editing | Planned | Yes, when starting |
| M6 — Price bar and global settings | Planned | Yes, when starting |
| M7 — Step 1, room and presets | Planned | Yes, when starting |
| M8 — Review, contact, success | Planned | Yes, when starting |

## What is actually built

A pnpm monorepo on Node 24: an I/O-free domain package, a Three.js adapter, a persistence package
that is the only place a Postgres driver appears, and a Next.js App Router app. **874 unit tests**
(domain 380, three-adapter 414, persistence 30, web 50) plus 4 Playwright e2e tests and one
`test.skip` — the unit counts copied from a `pnpm check` run that exited 0 on 2026-08-25 after Wave
3B's review round, not carried forward. The e2e figures are carried from M2 and were **not** re-run
this wave.

An earlier revision of this line reported "three-adapter 30, persistence 163". Those two numbers
were transposed: persistence runs 30 and the adapter ran 163 before Wave 3B. Recorded rather than
quietly corrected, because this file's own closing rule is that quantitative claims come from a
command someone ran.
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

**M3 — Insert, remove, swap (closed 2026-08-26).** The domain command layer: `insertBody`, `insertFit`,
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
re-running. **That gap did not repeat: Wave 3B's logic reviewer delivered**, and its findings are
below.

**M3 Wave 3B — the adapter.** `buildCatalogBody` for §7's fifteen parameterised entries,
`measureBuiltBody` implementing the `BodyProbe` port, and `scene-sync.ts` — a keyed, disposing
mount/unmount that replaced `kitchen-stage.tsx`'s build-once `useMemo`. Two rounds of adversarial QA
and a full review tier produced four ADRs, and three of the findings are worth knowing:

- **The hood could never have been inserted** (ADR 0016). The milestone's carcass mesh pattern
  matched only `hood_canopy`, 130 mm, while §7 fixes the hood at 710 — so every hood insert would
  have failed `BUILT_SIZE_MISMATCH` while §9 kept offering it.
- **`base-sink` was offered into openings it cannot build** (ADR 0017). Its worktop splits around a
  fixed 560 mm aperture and inverts below that; at 400 mm the carcass measures 523 × 913. The
  engine refused correctly, but the offer list still offered it down to 300 mm. Catalogue entries
  may now declare a `minWidthMm`, read by the guard and the offer list from one evaluation. Note the
  550 mm case: the built carcass is inside `FIT_TOLERANCE_M` on both axes, so the built-size
  re-check would have **accepted an inverted worktop** — which is why the floor is declared rather
  than measured.
- **`wall-lift` shipped as a hinged single door**, byte-identical to `wall-1door` — two catalogue
  rows, one body, with §6.5's bottom-edge handle on neither. Caused by the coordinator's own
  dispatch wording, missed by the coordinator's diff review and by two adversarial QA rounds,
  because every test asserted the entry passes the *size* gate and a lift flap is not a carcass
  mesh. Found by logic review. There is now a general property test — no two catalogue ids may build
  the same body, compared by structural signature rather than measurement.

**§11 row 19 is proven for inserted bodies, and it generalises by construction**: `seatOffsetM` is
the origin-to-back-face distance, so placing at that offset cancels the same bounding box that
produced it, whatever its asymmetry. §6.2's two recorded failures came from deriving the plane from
the *previous occupant*, which let one body's asymmetry reach another's placement; nothing here has
a cross-body path. Measured within 3.6e-9 m on both walls for seven bodies.

**M2 — Void engine, picking, persistence.** Both waves are implemented. The `Design` schema, the
placement/column/void derivation with all four earned rules of `DEVELOPMENT-SPEC.md` §4, void mesh
rendering, picking, and the store. Then `ConfigurationRepository` over Neon Postgres storing one
`jsonb` document per design, opaque identifiers, a canonical serialiser, a coalesced write path, a
least-privilege database role verified by live assertions, and a daily backup cron to Vercel Blob.

## What is open right now

**M2 is closed.** Its last gate — the persistence write path having no browser caller
(`docs/decisions/0010-m3-client-write-path-unwired.md`) — was closed by M3 Wave 3C-2b on
2026-08-25: a `fetch`-backed `ConfigurationRepository`, the save coalescer wired to the store's
`onDesignChanged` seam, and mint-on-first-mutation. The cookie round trip is verified **in a real
browser** (`design-write-path.e2e.spec.ts`), which is the evidence security review asked for and
could not produce itself.

Still open from M2, unchanged: Path 2 of the restore drill has not been re-run from an export
actually downloaded from Blob, and Path 1 (Neon PITR) has never been drilled. Note the restore path
changed this wave — `write_token_hash` is now exported and restored, without which every restored
design would have been permanently unwritable.

**Infrastructure state — live as of 2026-08-25.** Repository `DumitruSirbu/lemn-conf-v2` (private),
CI green on nine gates, and `.githooks/pre-push` runs the same gate set locally so a red build never
reaches GitHub. Vercel is connected to the repository and deploys `main` to production
automatically; Root Directory `apps/web`, Next.js preset, Node 24. The backup cron
`/api/cron/backup-designs` is registered on `0 3 * * *` and has produced its first export.

Verified live: `/configurator/configure` serves 200, and the cron endpoint returns 401 to an
unauthenticated caller and to a wrong bearer token — it fails closed.

## The security decision is made — ADR 0019

**ADR 0014 is superseded.** The unauthenticated write surface (S1), the unauthenticated mint (S3)
and the absence of rate limiting (S4) are all decided in
`docs/decisions/0019-security-baseline-writes-throttling-retention.md`, on the owner's direction of
2026-08-25 that security is the priority. Nothing here is implemented yet — the record is the
decision, and **Wave 3C builds the write path with authorisation from the start rather than
retrofitting it.**

What was decided, in brief:

- **Read is split from write.** Minting sets an `HttpOnly` cookie holding a per-design write token;
  `PUT`/`PATCH` require it. A shared link stays readable by anyone and can no longer destroy the
  design it points at.
- **Vercel is the firewall; the application does the rate limiting.** The edge drops what is never
  legitimate, challenges what is unlikely to be, and absorbs volume for free; it holds no
  per-endpoint policy. Every recognisable limit is application code over the existing Postgres. No
  Redis, on the owner's direction not to add maintenance surface. The reason to keep an edge layer
  at all is narrow and worth remembering: **an application limiter has to run a function and touch
  the database in order to say no**, so under a flood on free tiers it becomes the denial of
  service it exists to prevent.
- **Identity is several independent buckets**, most restrictive winning — IP aggregated to /24 and
  /64, session cookie, email address, and a global cap. Never IP+session fused into one key, which
  is weaker than either alone.
- **Geography is a first-class signal**, because the tool is expected to be used rarely and
  essentially only from Moldova. Non-MD traffic is challenged and tightly limited, never denied —
  the diaspora, roaming and VPNs all geolocate unpredictably, and a country deny fails silently.
- **Abandoned designs are deleted after 30 days**, which also closes the retention question this
  file has carried as open since 2026-08-25.
- **Cross-device editing uses an emailed link, not a password.** Storing credentials for people who
  never made an account was considered and rejected.
- **No external proxy in front of Vercel** (Cloudflare orange-cloud specifically). DNS-only is fine.

**Implementation is deferred; the decisions are not.** On the owner's direction of 2026-08-25 —
the project is nowhere near done — the firewall is **not** being set up now. The rules were staged
once to prove they stage cleanly, then discarded; the project has **zero** custom rules today, and
`docs/runbooks/firewall-setup.md` holds the exact commands and the plan constraints so re-creating
them later is a copy-paste. ADR 0019 decision 10 assigns every part to a phase:

| Part | Phase |
| --- | --- |
| Write-token cookie / read–write split | **M3 Wave 3C** — the one part that gets *more* expensive by waiting |
| Save-coalescer minimum interval | **M3 Wave 3C** — a write-path defect, not a security control |
| Application rate limiting, retention cron, emailed edit link, BotID/honeypot | **M8**, with the contact form |
| WAF rules | **Pre-launch, after M7** — no value against zero traffic |

One plan constraint worth knowing before that work starts: **this plan permits exactly one WAF
`rate_limit` rule.** A second returns "Rate limiting is not available for this plan (401)", which is
misleading — the first stages fine. So the edge cannot express per-endpoint policy, and every
per-endpoint limit is enforced in the application layer.

**A defect found while sizing the limits, not yet fixed:** the save coalescer has no minimum
interval — `scheduleSave` runs immediately unless a save is in flight, so its sustained output is
bounded by network round-trip time rather than by a timer. During active editing that is roughly
one write per RTT, and M5's width dragging makes it continuous. ADR 0019 decision 6 adds a 1 000 ms
floor; until it lands, no update rate limit can be sized honestly.

## What to do next

**M4 — the editor panel and shell.** Every verb it needs exists and is guarded in the engine; M4
renders them. Read `docs/milestones/M4-editor-surface.md` when you start it.

Four things M3 hands M4 directly:

1. **Remove the temporary developer affordance.** `apps/web/src/components/temporary-dev-controls.tsx`
   is scaffolding, named so, and M4 owns its deletion. Its one non-obvious property is worth
   keeping: it shows a refusal's stable **code**, never its rendered Romanian sentence, so §9's copy
   was never pre-empted.
2. **Decide how a failed write is communicated.** M3 exposes `saveStatus` and nothing renders it.
   The union now includes a distinct `unauthorized`, which is *not* an error — it means read-only in
   this browser, and it is reachable in normal operation (a 30-day cookie expiry, a cleared jar, a
   shared link opened by someone who never held one).
3. **A read-only UI needs to know it is read-only.** The write credential is an `HttpOnly` cookie
   the client cannot inspect, so the panel cannot tell whether it may edit without attempting a
   write — and discovering it by attempting one is the "warn-after-click" pattern this project
   rules out. Cheapest fix, from the security review: `GET /api/designs/{id}` already receives the
   cookie, so it can return a `canWrite` boolean beside the design at no extra round trip and with
   no token exposure.
4. **§13.3 question 1 is now visible.** `insertBody` is deliberately more permissive than
   `offersFor` on a swap — §9 scopes a swap list to the outgoing body's band while §5.2 lets a
   `column` body into any slot. Not a rule violation ("never offer what cannot be satisfied" is
   one-directional), but the two are **not** interchangeable, and M4 is where unifying them becomes
   a real question.

**Open, and not closed by M3:**

- **The mobile gate is verified under emulation, not on a handset.** The e2e suite drives §10's flow
  by *synthesised* touch at 390 × 844 with `hasTouch`/`isMobile`, in real Chromium against a real
  WebGL canvas and a real database. It does not exercise a touch digitiser (finger-sized contact
  areas, real drag-vs-tap slop), a mobile GPU, device pixel ratio, or iOS Safari. Per
  `docs/best-practices/browser-and-visual-qa.md`, tests alone do not prove a mobile claim. **A
  handset pass needs HTTPS or a tunnel** — over `http://<LAN-IP>` the `Secure` write-token cookie is
  silently dropped and every save 403s with nothing explaining why.
- **Preview's database has not been confirmed to carry migrations 0002 and 0003.** Until it does,
  minting on a Preview deployment 500s exactly as production would have. It cannot be checked
  locally — Preview's `DATABASE_URL` is a sensitive Vercel variable. Check the Neon console, or
  `POST /api/designs` against a Preview URL and look for 201 versus 500.
- **Path 2 of the restore drill has not been re-run** from an export actually downloaded from Blob,
  and **Path 1 (Neon PITR) has never been drilled**. The restore path changed in Wave 3C-2a:
  `write_token_hash` is now exported and restored, without which every restored design would have
  come back permanently unwritable.
- **The firewall is deferred to pre-launch** by ADR 0019 decision 10, with the exact commands in
  `docs/runbooks/firewall-setup.md`. Vercel currently has **zero** custom rules.
- **Application rate limiting, retention, BotID and the emailed edit link are M8**, with the contact
  form.

## Keeping this file honest

Update it when a phase changes state, not in a batch later. Two rules, both learned the hard way in
this project:

- **Copy quantitative claims from a command you ran.** Test counts here were wrong once because they
  were carried forward from a commit message instead of counted.
- **Record what is not met, at the criterion.** M2's status claimed its persistence criteria were met
  for several hours after a gap was found. An unmet gate that is written down is manageable; one that
  is quietly assumed to be met is not.
