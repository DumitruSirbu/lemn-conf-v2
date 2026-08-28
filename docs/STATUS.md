# Project status

**Read this second, right after `AGENTS.md`, before opening any milestone document.** It exists so a
session can learn where the project stands without reading eight phase plans.

Last updated: 2026-08-28 (**M5 in progress.** 5A, 5B, 5C, 5C2, 5C3 and 5D are shipped and committed. A design session on 2026-08-28 produced **ADR 0035** — width becomes a bounded ±50 mm stepper rather than a menu of sizes, two doors start at 500 mm, a column is one width at every level, and shrinking creates empty space — and **ADR 0036** — a declared dimension is the finished cabinet including doors, and the general setting is cabinet depth, not worktop depth. **New wave 5D2** carries the stepper. Remaining: 5D2, 5E browser gate, 5F base carcass depth.)

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
| M4 — Editor panel and shell | **Done** (closed 2026-08-26 — one criterion unmet by design, ADR 0024) | No — `milestones/done/` |
| M5 — Width editing, and depth as a derived quantity | **In progress** — 5A, 5B, 5C, 5C2, 5C3, 5D shipped; 5E, 5F open | Yes — `milestones/M5-*.md`, **and ADRs 0028–0034**, which supersede parts of it |
| M6 — Price bar and global settings (**incl. the worktop depth control**, 2026-08-27) | Planned | Yes, when starting |
| M7 — Step 1, room and presets | Planned | Yes, when starting |
| M8 — Review, contact, success | Planned | Yes, when starting |

## What is actually built

A pnpm monorepo on Node 24: an I/O-free domain package, a Three.js adapter, a persistence package
that is the only place a Postgres driver appears, and a Next.js App Router app. **2 028 unit tests** (domain 852, three-adapter 609, web 484, persistence 83 — counted from a run on 2026-08-27 after wave 5D; was 1 607 after 5C3 and 1 395 that morning)
(domain 433, three-adapter 440, web 439, persistence 83) plus **20 Playwright e2e tests** and one
`test.skip`. Every number copied from a run executed on 2026-08-26 after M4 Wave 4D, not carried
forward.

Persistence jumped from 30 to 83 without a line of test code being written: **45 of its tests had
been silently skipping** on every previous run because the `qa_owner` credential in
`.env.test.local` was invalid. Those are the live-database assertions — the ADR 0008 least-privilege
role checks, the backup/restore round trip, the Neon repository suite. They were reporting green by
sitting out. A working `TEST_DATABASE_URL` (now `lemn-conf-v2-staging`, distinct from the
application database, so ADR 0006 holds) was supplied on 2026-08-26 and all 83 pass.

That is worth remembering as a pattern, not just an incident: a skipped test and a passing test look
identical in a summary line.
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

**M4 — Editor panel and shell (closed 2026-08-26).** §9's customer-facing editor, in four waves.
The panel's rules live as a **pure projection** — `describePanel` in `apps/web/src/panel/panel-model.ts`
turns `meta` plus the offer list plus the last refusal into §9's ordered sections, already resolved —
so §12's "no product logic in components" is enforced by a value rather than by review. Both
reviewers confirmed nothing leaked either way.

**Desktop and mobile are one implementation and the branch is CSS only.** A single
`min-width: 900px` block in `editor-panel.module.css` swaps four spacing tokens (rows 82/66 px,
chips 44/52 px) and nothing else. `matchMedia`, `innerWidth`, `userAgent` and `ontouchstart` appear
nowhere in `apps/web/src`, so §10.1 holds by construction. No rule differs between the shells.

Four findings from this phase are worth knowing, because each was a rule stated in prose that the
data or the wiring did not implement — the same shape as ADRs 0016 and 0017:

- **The Finisaj section was decoration.** `finishKey` was read nowhere in the adapter and `signBody`
  omitted it, so a finish change did not even re-sign the body. Tapping a swatch marked the chip,
  wrote the design and scheduled a save while the scene stayed pixel-identical. `finishes.ts` had
  said in writing "do not build the editor's finish section on top of this module without revisiting
  it"; it was built by copy, without revisiting.
- **§9's ACTUAL badge was unreachable.** Measured: 22 bodies offer a swap list, 0 badges, because
  ADR 0011 Gap A gives every seeded placement a non-insertable `buildId`. Now declared, never
  inferred (ADR 0022).
- **§13.1's "corners are structural" was prose only**, so the panel offered a swap list and a delete
  on a structural corner. Fixing it made §11 row 20 unreachable in production, which ADR 0021
  records rather than lets slide.
- **A tap on the scene was also pressing the sheet** (ADR 0023). Synthesised compatibility mouse
  events are hit-tested when dispatched, by which time the sheet covers the bottom ~78 dvh — so one
  tap selected a body *and* inserted a cabinet or applied a finish nobody chose, minting and writing
  a design each time. §10's "the sheet never steals or leaks pointer events into the canvas" runs in
  both directions. Found only by writing the touch test.

**Read is split from write in the UI too.** `GET /api/designs/{id}` returns a `canWrite` boolean
beside the design, so the panel never discovers it may not edit by attempting an edit. Security
review traced every consumer and confirmed it terminates in `isDisabled` flags — it is advisory and
never the authorisation decision, so ADR 0019's check-then-write prohibition holds. The `/d/{id}`
page cannot answer it (the cookie is `Path=/api/designs/{id}`), so it hydrates `"unknown"` and a
client probe asks the one route the cookie reaches, at the cost of a second GET per shared-link open.

## What is open right now

**Reported issues that are not scheduled live in `docs/BACKLOG.md`.** The first of the two found in
the first handset pass is now closed: the induction hob **can** be restored, because ADR 0027 made it
part of the cabinet body and added two hob-bearing catalogue entries. The second is still open —
clearing two adjacent cabinets yields two openings rather than one, the run re-split §12 lists as
"Not built, designed". It is not fixed by M5.

**A third handset report, 2026-08-27, is now scheduled rather than backlog.** Re-inserting a deleted
top-row cabinet builds it 400 mm deep beside 330 mm neighbours. Diagnosed as backlog 5's unfinished
half — the depth cap and the catalogue nominal are unlinked constants — and folded into M5 as wave
5A. **Eight depth questions are recorded and undecided**, in `docs/milestones/M5-width.md` under
*Not established — Depth*, each tagged with the milestone that needs it: the hood, whether an 800
worktop is real, whether a 700 worktop moves wall cabinet height as well as depth, what happens to a
design saved at 600 when the setting changes, the two deliberately-deep top cabinets, whether the
map's value is the carcass or the carcass plus its door, whether the shipped worktop is 600 or 620,
and backlog 10's surviving divergence. **Only two gate an M5 wave** — the carcass-versus-door
question (5A) and the 600-versus-620 question (5F). **Four travel to M6 with the control** and are
repeated in that plan's open questions so they are not lost at the seam; the design-saved-at-600
question blocks M6's control.

**One deletion is deliberately still owed, and is recorded so it is not lost.** ADR 0027 left the
whole accessory machinery in place — §6.1's host resolution, §5.1's cascade,
`ACCESSORY_MAX_HEIGHT_M`, `PlacementRecord.accessory` and `cascadedAccessoryIds`. Nothing in the
*shipped* design reaches any of it, but a design saved before that migration still carries a
`cooktop-600` placement and reaches all of it. Whether those documents are migrated or supported is
the decision that wave has to take first.


**M4 closed with one acceptance criterion unmet, on purpose (ADR 0024).** Its Verification section
asks for browser tests of the rejection state's three simultaneous requirements. There is no
reachable path to a refusal through §9's panel: the replace list is fit-filtered through the same
evaluation `insertBody` runs, the probe case is pre-empted on the row, finish/handle/remove are
gated on the flags the commands check, and read-only disables everything. Writing that test would
mean first building a list that offers what the engine refuses — manufacturing the defect the rule
exists to prevent. The banner stays covered by model tests, the suite asserts the *absence* of
refusals across the whole signature flow, and the third requirement ("the total does not move")
is **carried to M6**, which is where a total first exists.

**The panel's render half is thinly covered, and it is worth knowing where.** `apps/web/tests/panel/`
is model-only. The browser proves the §10 loop, the sheet geometry, the read-only path and the
desktop rail — but the §9 sections for a corner return, an unknown kind (§11 row 24) and a
zero-result list are reached by no seeded selection, so they remain model-tested only. The width
section has **never rendered in any browser run**, because no seeded entry has `sizesMm` (below).

**M4's `sizesMm` gap is closed, and the arrangement behind it survived two waves.** Wave 5B gave the
seeded entries their sets and wave 5D moved the chip row to the column (ADR 0034), so the width
section renders across the shipped kitchen. What did **not** change is the reason it can still be
absent: `canWidth` stays §9's literal rule — selected, not empty, not `fixedWidth` — and a body that
resolves no set gets no section rather than a one-chip one. An earlier M4 fix folded "has widths to
offer" into `canWidth` itself; logic review overturned it, because that would have made missing data
fail *silently* instead of loudly. It is still the arrangement, now enforced in the domain as well:
`columnWidthChoices` returns nothing rather than conjuring a set out of the current width.

**Deferred review findings, named so they are not lost.** From M4's clean-code round: the four-way
panel test-file split has become redundant coverage with duplicated helpers; `advancePast` lets three
domain tests open a span no command path can produce; several small items (named-object parameters,
a `must<T>` helper, `.grabber` on a sheet that cannot be dragged). From the 4C logic round: the
save-failed notice unmounts and remounts on every retry, jumping ~50 px of offer list under the
customer's finger; two hard-coded hex values duplicate the rejection tone. From 4C security: the
write-access probe fetches and parses the whole design for one boolean, so **M8 must size its rate
limits against a doubled read rate**; `GET`'s 404 reflects the caller-supplied id and its 500 returns
a Zod tree over the stored document, where the write path deliberately returns neither.

**M2's restore drill, unchanged:** Path 2 of the restore drill has not been re-run from an export
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

**M5 wave 5D2 — the width stepper (ADR 0035).** This is now the next wave, in front of 5E, because
5E photographs the width surface and the surface changed. Read ADRs **0035** and **0036** first, then
**0034** for the engine seam that survives.

What 5D2 does, in the order the risk falls:

- **Move the catalogue's width model from sets to bounds.** A floor, a ceiling and a step for
  cabinetry rows; `fixedWidth: true` appliance rows keep their discrete sets. `STANDARD_WIDTHS_MM`
  and `sizesAreStandardLadder` lose their reason to exist for cabinetry. ADRs 0026, 0029, 0030 and
  0033's door-count halves survive as bounds, not lists.
- **Move `TWO_DOOR_MIN_WIDTH_MM` from 450 to 500 and the comparison from `>` to `>=`.** Forced by
  the stepper: `w > 450` makes 500 and 550 into two 250 mm doors, and relative stepping reaches 470
  as well. The constant's name has been describing a one-door value this whole time.
- **Square a mixed-width column up rather than refusing it** (15 lockouts today), and **make
  shrinking produce adjacent empty space** — without the second, ADR 0031's consequence stands and
  nothing in the shipped kitchen is resizable until something is deleted.
- **Replace the chip row with two buttons and the current width**, disabled at the bounds and
  carrying the reason there, per ADR 0032. Appliance columns show the discrete control instead.
- **Retire 5D's pinned chip counts and rewrite its property test** in the stronger form: at every
  reachable width, each button is enabled if and only if the step it offers succeeds.

**Then 5E — the browser and mobile gate.** The engine and the panel are both done; 5E is the
only thing between them and evidence on a real device. Read `docs/milestones/M5-width.md`'s
*Surfaces* and *The rejection banner becomes reachable* sections, then ADRs **0031**, **0032**,
**0034** and **0024**.

**5E needs a delete in front of every width case, and that is a product fact rather than a fixture
inconvenience.** ADR 0031 funds a resize from an adjacent column that is empty at **every** level,
and the shipped kitchen has none at load — so every width chip in it is `blocked`, and the domain
suite proves chips go free the moment `A|2.00` is cleared (`p1`, `p12`, `p18`). Width editing is in
practice a second step of deleting. Per `docs/best-practices/browser-and-visual-qa.md` the mobile
claim needs a handset, not emulation, and a handset pass needs HTTPS or a tunnel (below).

**What 5D shipped, so 5E knows what it is photographing:**

- **§9's width chips are column-scoped and judged by running the command** (ADR 0034). Every chip is
  `free` if and only if `setWidth` at that width would succeed, `blocked` chips carry the engine's
  own sentence, and the row comes from the intersection of the column's members' sets rather than
  from the selected body's. The shipped kitchen's chip count moved from 76 to 62 and three pinned
  rows moved with it, each re-pinned with its derivation.
- **`setWidth` is wired to the store and to the chip**, and `applyCommandResult` now takes
  `BodyResizedEffect.columns` — a resize is the one command whose own column map replaces the
  store's, and the voids are recomputed against the moved one.
- **The store publishes its `BodyProbe`** rather than closing over it, because the width query needs
  the real builders to answer honestly. With none attached the width section is absent.

**Wave 5D ran the full `docs/WORKFLOW.md` cycle — adversarial QA, then clean-code and product-logic
review in parallel — and it earned its cost three times over.** The engine seam came through clean:
no production defect in the domain, and the logic reviewer verified the freedom property holds *by
construction* rather than by luck (the candidate set and the command's accepted set are the same
`intersectColumnWidths` call). What the round found was everything around it.

- **A blocker, and a customer-facing one.** §9's width note still ended *"nu este încă disponibilă în
  această versiune"* — written when no resize existed, and a lie the moment 5D made the chips
  clickable. It would have gone into 5E's screenshots. **No test pinned the string**, which is
  precisely why 2 116 green tests said nothing about it. It now states ADR 0031's rule, and three
  tests pin the claim.
- **The width section had a silent branch, and it was ADR 0032's own defect reappearing.** A column
  whose members are all resizable but whose sets are **disjoint** — a `base-bottle-cargo` under a
  `hood` — rendered *no section at all* and discarded a `WIDTH_NOT_SUPPORTED` the engine had already
  computed, while a column with an immovable member rendered chips-with-reasons. Two answers to one
  question, the quieter one wrong. Now one rule: **only the selected body resolving no set suppresses
  the section**; a column that cannot agree explains itself on the chips.
- **ADR 0034 stated two facts that were wrong**, one of them inverting the very rule its example
  illustrates (it blamed the open shelf for refusing 450 — the shelf is a ladder and accepts it; the
  refuser is the `wall-cabinet`, where 450 falls in ADR 0033's one-door/two-door gap). Corrected in
  the ADR, the index, the plan and the test comments, with the correction recorded rather than
  quietly swapped.
- **Smaller, and mine:** a `?? "refused"` default that would have let an invented chip pass silently;
  a `WidthChip.reason` doc that said the opposite of the code; a read-only width test still carrying
  M4's "weak by construction" note, which its own comment had predicted would need strengthening the
  day `free` became reachable.

**Deferred from 5D's review, named so they are not lost.** `isBodyProbeAttached` is derivable from
`bodyProbe` and could be a selector rather than stored state (they cannot drift as shipped — all
three write sites set both from one value — so this is opportunistic, not a fix). `columnWidthChoices`
is the only new export not following the surrounding `...For`/verb-led naming idiom. And **the §11
table needs supersession markers**: row 9 still states §5.4's donor rule that ADR 0031 replaced, and
row 14's *"only 450 / 600"* now reads as 600 alone for `p1` — both are acceptance rows, and
`AGENTS.md` treats that table as acceptance tests, so they should point at the ADRs the way the
milestone bullets now do. **That is an edit to the product spec and is the owner's call, not mine.**

**What 5D did *not* do, and 5E or a later wave inherits:**

- **ADR 0032's panel half is still unbuilt.** The engine publishes a verdict per offer row
  (wave 5C2) and `describeReplaceSection` still filters the refused ones out — the seam is one
  `.filter(isOffered)` in `panel-model.ts`, deliberately the only thing there that knows a refused
  verdict exists. Rendering the disabled row, its sentence and what it does to the count line is a
  wave of its own; the width section's chips are the pattern to follow, and the reason renderer
  (`renderRejection`) is already shared.
- **`catalog.ts` still wants splitting**, and the seam is unchanged: everything from `deriveDoorCount`
  to `resolveBuildableSizes` is pure derivation with no dependency on the entry table above it.
  Deferred again out of 5D because `docs/WORKFLOW.md` forbids folding a refactor into a behavioural
  change.
- **The ACTUAL-badged row still drops its door count** where the width is known, and a seeded body's
  panel header still reads the generic kind (*Corp suspendat*) above a replace row reading
  *Corp suspendat 2 uși*. ADR 0033's consequence — a derived label must be derived everywhere it
  appears — is unfinished.
- **§11 row 20 still needs amending**, not strengthening: no path hands the wall builder a 570, and
  the row is demonstrable end to end at **700**, where a hinged cabinet builds two doors.
- **The save coalescer still has no minimum interval.** Chip taps are writes, and 5D made them
  repeatable. ADR 0019 decision 6's 1 000 ms floor is unimplemented and no update rate limit can be
  sized honestly until it lands.

**Then 5F** (base carcass depth as a formula, the only wave that touches a builder and the only one
that can reach M1's 1e-6 m parity gate).

**Both of these were answered on 2026-08-28 and are recorded in ADR 0035 — a column is one width at every level and a mixed column is squared up rather than refused, and shrinking does create empty space.** The original framing, kept because it records what was uncertain and why: whether a column holding mixed
widths should be squared up rather than refused (`COLUMN_MEMBERS_UNALIGNED`, 15 lockouts), and whether
*shrinking* a column should create empty space — which would make the kitchen resizable without a
delete first, and which 5D's measurement makes the more pressing of the two. ADR 0031 records that
the "not representable" argument against it was **wrong**; the machinery exists.


**M5 — editing a cabinet's size (§5.4's resize as a boundary move, §11 rows 9–14; plus depth, §5.2
and §7).** M4 built the width section and every chip in it is `blocked`, because no resize command
exists. Read `docs/milestones/M5-width.md` when you start it.

**M5 gained depth on 2026-08-27 and is now six waves, and the first one is a defect fix.** A handset
report — delete a top-row cabinet, insert one back, it returns 400 mm deep against 330 mm neighbours
— turned out to be the unfinished half of backlog 5. The cap
(`WALL_CARCASS_MAX_DEPTH_OVER_WORKTOP_M`, `insert-fit.ts:56`) and the catalogue nominal
(`WALL_DEPTH_MM`, `catalog.ts:72`) are **independent constants that happen to agree at 400**, and
`resolveDepthM` caps against `Column.d` (580 over a base run) without ever reading the nominal. The
owner decided on 2026-08-27 that wall depth follows worktop depth through an extensible map, that the
map is the single source for both numbers, that base carcass depth is a formula, and that worktop
depth becomes a whole-kitchen setting.

**Wave 5A ships the map alone** — it is the customer-visible fix, it is live on the owner's device,
and it must land before `setWidth`, because a resize rebuilds through the catalogue equivalent and
would otherwise be written against 400. **Wave 5F** carries the base carcass formula. The wave
letters were reassigned when depth joined; the plan carries the old→new mapping.

**M5 owns the geometry; M6 owns the control (owner, 2026-08-27).** Worktop depth is a **single
declared constant at 600 mm** in M5 — no user-facing control, no schema field, no settings UI, no
version bump. `docs/milestones/M6-price-and-global-settings.md` **work item 4** adds worktop depth as
a fourth control in *Setări globale* beside the material and hardware tiers it already builds;
because M5 did the mechanics, that is one more control in a panel M6 is building anyway. Both plans
name each other so neither can assume the other built it. Every question about a worktop depth that
*changes* travels with the control to M6 — M5 never holds two.

If the milestone needs to be smaller, 5F is the clean cut, but note it moves rather than disappears:
M6's control needs the formula underneath it.

Four things M4 handed M5 directly. **The first and third are closed; the second and fourth are
open.**

1. ~~**Seeded catalogue entries have no `sizesMm`, so no seeded body can be resized.**~~ Closed by
   wave 5B, and the tripwire fired as designed: the seeded test asserting the section renders nothing
   failed the day the widths arrived.
2. **The rejection banner becomes reachable, and M4's unmet criterion becomes writable.** §5.4 has
   real failure modes (§11 row 10: a resize that would push a neighbour under 300 mm). M5 is the
   first phase where a §9 control can legitimately refuse, so ADR 0024 says to revisit it here. Two
   of 2C's three requirements can then be proven in a browser; the third still waits for M6's total.
   **Still open — it is wave 5E's**, and note that 5D put the reason at the point of *choosing*
   (a blocked chip carries the engine's sentence), which is the better place for it than a banner
   after the tap.
3. ~~**Width chips must stay honest about `free` versus `blocked`.**~~ Closed by wave 5D and
   ADR 0034: a chip is `free` if and only if `setWidth` at that width would succeed, answered by
   running the command. The three tests pinning "no chip is ever free" were turned over rather than
   deleted, and the shipped kitchen's own answer is still zero free chips — for a reason about empty
   space, not about a missing command.
4. **§13.3 question 1 is still open and still visible.** `insertBody` is deliberately more permissive
   than `offersFor` on a swap — §9 scopes a swap list to the outgoing body's band while §5.2 lets a
   `column` body into any slot. Not a rule violation, but the two are not interchangeable.

**Open, and not closed by M4:**

- **The mobile gate is verified under emulation, not on a handset.** M4 Wave 4D drives §10's full
  loop and the signature flow through §9's real panel by *synthesised* touch at 390 × 844, in real
  Chromium against a real WebGL canvas and the test database — 20 e2e tests. It does not exercise a
  touch digitiser (finger-sized contact areas, real drag-vs-tap slop), a mobile GPU, device pixel
  ratio, or iOS Safari. Per `docs/best-practices/browser-and-visual-qa.md`, tests alone do not prove
  a mobile claim. **A handset pass needs HTTPS or a tunnel** — over `http://<LAN-IP>` the `Secure`
  write-token cookie is silently dropped, and since M4 that now also renders the panel read-only via
  `canWrite`, which will look like a bug on a handset and is not one.
- **ADR 0023 gives the handset pass something specific to check.** Compatibility mouse events after a
  touch are exactly the kind of behaviour that differs between synthesised touch and a real
  digitiser, iOS Safari especially. The fix (cancelling `touchend` on the canvas) is verified under
  emulation only.
- **The mobile selection-highlight visual assertion no longer exists at 390 × 844.** M2 compared a
  patch of scene unselected versus selected; that patch is now behind the sheet, so the two captures
  would differ *because a sheet appeared* — an assertion that would pass with selection rendering
  entirely broken. It is the suite's one `test.skip`, carrying that reasoning, and the claim moved to
  desktop where both captures are taken with the panel open. Mobile keeps M2's gate proper: a real
  touch selects the intended body and the intended empty slot.
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
