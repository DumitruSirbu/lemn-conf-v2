# Project status

**Read this second, right after `AGENTS.md`, before opening any milestone document.** It exists so a
session can learn where the project stands without reading eight phase plans.

Last updated: 2026-08-25 (M3 Waves 3C-1 and 3C-2a complete through review; 3C-2b next).

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
| M3 — Insert, remove, swap, client write path | **In progress** — 3A, 3B, 3C-1 and 3C-2a done; **3C-2b next** | Yes — `milestones/M3-mutations.md` |
| M4 — Editor panel and shell | Planned | Yes, when starting |
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

**M3 — Insert, remove, swap (Waves 3A and 3B done).** The domain command layer: `insertBody`, `insertFit`,
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

1. **M3 Wave 3C (web)** — items 9–12: store commands, the client write path (which closes M2's last
   gate), a temporary developer affordance, and the mobile gate. Follow `docs/WORKFLOW.md`; it is
   mandatory, not advisory. Wave 3C is where the persistence criteria live, so it is a **Full**
   review tier with security review triggered (write path, share links, customer data).

Waves 3A and 3B are done. Contract gaps and findings against them are recorded in ADRs 0011, 0015,
0016, 0017 and 0018; treat them as decided, not open.

**Carried into 3C, honestly unverified rather than assumed met.** Wave 3B's scene sync is proven
headlessly — the keyed diff, disposal by object identity, push-open by slot — but **the sync effect
has never re-run with changed data**, because no store mutation exists until 3C. Specifically not
yet exercised: that a mutation preserves an unchanged body's applied finish end to end; that
selection never dangles after a mutation; and that the reference-room decomposition, still computed
once in `useMemo` against the *initial* records, is correct if 3C ever hydrates a different design
into a mounted component. 3C should exercise all three rather than inherit them as passed.

**Also carried:** `createBodyProbe` has no caller in `apps/web` yet, so §11 row 19's seat is proven
in tests and has never run in the app. Wiring it is 3C item 9's job.

**Known and recorded, not defects:**

- ADR 0018 — `frame.d` is twice a body's rear overhang, not its depth. Inert today; it starts
  compounding the moment any builder gains a depth parameter, which ADR 0017 names as the intended
  fix for the sink aperture. Owned by whichever phase does that.
- The hood is `widthFlex: 'fit'` with a `[600, 900]` chip set, so a 450 mm void builds a 450 mm hood
  while the panel would render chips of 600 and 900. Same shape ADR 0017 fixed for `base-sink`,
  arriving from the other side; §7's `w` cell literally reads `fit`. **M4 owns the decision**, since
  M4 renders the chips.
- `insertBody` is more permissive than `offersFor` on a swap: §9 scopes a swap list to the outgoing
  body's band while §5.2 lets a `column` body into any slot. Not a rule violation — "never offer
  what cannot be satisfied" is one-directional — but the two are **not** interchangeable, and M4
  owns §13.3's question about unifying swap sets with the fit-filtered catalogue.
- `min(d, 0.4)` shallows a seeded 600 mm-deep wall body to 400 mm on swap. A documented consequence
  of §7's clamp, reviewed and labelled a disagreement rather than a bug.

M3 still closes M2's last gate as a first-class work item — the client write path, wave 3C item 10 —
and un-skips the one named `test.skip` in the e2e suite, which had no void to tap against while the
seeded design was fully occupied.

Worth re-running once M3 lands: Path 2 of the restore drill, this time from an export downloaded
from Blob and containing a design a customer actually made.

**A trap worth knowing before you run the gates.** Both packages' `test` scripts compile the domain
into the same `dist/`, so two concurrent runs collide at the *build* step while vitest itself
passes — the command exits non-zero with a fully green suite. That is why the root scripts run
`--workspace-concurrency=1`. Do not re-run until it passes and call that evidence; run on a quiet
tree.

## Keeping this file honest

Update it when a phase changes state, not in a batch later. Two rules, both learned the hard way in
this project:

- **Copy quantitative claims from a command you ran.** Test counts here were wrong once because they
  were carried forward from a commit message instead of counted.
- **Record what is not met, at the criterion.** M2's status claimed its persistence criteria were met
  for several hours after a gap was found. An unmet gate that is written down is manageable; one that
  is quietly assumed to be met is not.
