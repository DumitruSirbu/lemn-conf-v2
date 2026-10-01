# ADR 0111 — Step 1 creates the design through the existing mint-then-save, hands the customer its link only once it is written, and keeps the room entry in the URL

Status: Accepted (**Amendment A, 2026-09-11** — the owner's answer to Q7 supersedes decision 7's interim: the editor is only ever shown at `/d/{id}`, and a per-visitor cookie brings a returning visitor back to their design; its A2 pointer design is superseded by ADR 0114)
Date: 2026-09-11
Type: Decision
Milestone: M7 — waves 7E1 and 7E2 (architect's plan, `docs/milestones/M7-room-and-presets.md`)

**Pointer, 2026-10-01.** Decision 5 (back never erases; choosing again creates a new design and the old
one stays stored) is **unchanged**. The editor's back links now ask for a confirmation before they
navigate, on every viewport, and confirming writes, deletes and re-mints nothing: [ADR 0104 Amendment
D](0104-the-mockups-are-the-chrome-specification-and-the-strips-own-row-is-withdrawn.md#amendment-d-2026-10-01--q1-answered-the-back-to-room-link-is-drawn-on-desktop-and-both-back-links-ask-before-they-leave).
Editing the room while keeping the customised kitchen is backlog 103, not built. Nothing here is struck.

## Context

The M7 plan requires that applying a preset — or finishing a generated kitchen — **creates the stored
design and its identifier**, opens the editor with no confirm screen, that a design identifier in the
URL restores its step, and that Browser Back never erases a valid design. Measured at `995ad03`:

- **`POST /api/designs` takes no request body** and mints the seeded fixture plus the write-token
  cookie (`apps/web/src/app/api/designs/route.ts:22-51`; ADR 0019 decision 1). The customer's own
  document always travels in the conditional `PUT` that follows
  (`apps/web/src/persistence/fetch-configuration-repository.ts:208-242`), and that `PUT` runs the same
  catalogue validator as the load path (`app/api/designs/[id]/route.ts:233-249`).
- **SEC-001 is that mint** — unauthenticated, unthrottled, *"takes no request data"* — deferred to
  M8/pre-launch and gated by the owner on 2026-08-31 (ADR 0019's correction). M7 is the phase that
  gives it a real customer trigger, which ADR 0014 flagged for exactly this moment.
- **Nothing ever moves the browser to `/d/{id}`**: `/` redirects to `/configurator/configure`
  (`app/[locale]/page.tsx:15-16`), the store is seeded with `KITCHEN_L_DESIGN` and `designId: null`
  (`store/configurator-store.ts:725-731`), and a refresh on that route loses saved edits —
  `docs/BACKLOG.md` entry 29. The owner proposed the fix on 2026-09-02 (entry 30): mint at Step 1,
  redirect to the design's own URL at once.
- **`proxy.ts` routes only `configurator/configure`, `configurator/contact` and `d/{id}` through
  locale handling** (`apps/web/src/proxy.ts:64-80`), so `/configurator/room` does not exist as a
  customer route yet.
- **The editor's `‹ Cameră` and `Înapoi` are inert** `<span>`s (`configure-screen.tsx:95-101,
  218-220`), and the load-error page's *"Începe o configurare nouă"* links to the demo
  (`app/d/[id]/design-load-error.tsx:24`).

## Decision

**1. `POST /api/designs` keeps its contract.** No body, the seeded mint, the write-token cookie.
Creating a design from Step 1 is that mint followed by the ordinary conditional `PUT` of the chosen
design — the path every first edit already takes — **awaited**, rather than scheduled.

**2. The customer is handed the link only once the design is written.** Navigation to
`/[locale]/d/{id}` happens after the `PUT` succeeds and not before: *"a design that has never been
written successfully must not present a shareable link"* ([ADR 0002](0002-db-backed-shareable-persistence.md)
decision 17). If the mint or the `PUT` fails, the customer stays on Step 1 with the card they chose
and a retry. Repeated taps create at most one row — the repository's per-identity mint promise
already guarantees it, and [ADR 0010](0010-m3-client-write-path-unwired.md)'s one-row rule is
asserted, not assumed.

**3. The room entry is workflow state and lives in `/configurator/room`'s query string** — shape,
wall lengths, height, direction, and nothing else. Back restores it, a reload keeps it, and the
sub-state is derived from it: no valid room gives 1A/1B/1C; a valid one gives 1D then 1E, or 1F
when nothing fits. **Nothing is persisted before a preset or a generated kitchen is chosen**, and
the configuration never travels in a URL (`ARCHITECTURE_PROPOSAL.md` §7). An unparseable query never
throws and never reaches the domain unparsed; it lands on the earliest sub-state that needs a value,
with the field marked — the plan's route guard, at sub-state scale.

**4. `proxy.ts` gains `configurator/room`** as a customer path, so the new route gets locale routing
and the CSP nonce ([ADR 0041](0041-the-browser-security-policy-is-versioned-and-the-csp-only-reports.md)).

**5. Going back from the editor never erases anything.** `‹ Cameră` and `Înapoi` lead to
`/configurator/room` carrying the design's room. Choosing again creates a **new** design; the one the
customer left is still stored and still reachable at its link. *(Interim — Q7.)*

**6. `presetId` records the recipe for a preset and `null` for a generated kitchen.** The field
already exists (`design.ts:209`); no schema change.

**7. Entry and the demo, interim until the owner answers Q7:** `/` redirects to
`/configurator/room`; the demo stays at `/configurator/configure` exactly as today — it is what 34
`goto("/configurator/configure")` calls in `apps/web/tests/e2e` and the M1 fidelity route run
against — and a demo design's first successful save replaces the URL with `/d/{id}` so a refresh
keeps it (backlog 29, the owner's own proposal in entry 30). The load-error page's start-over leads
to Step 1. Design identifiers stay `nanoid()` (`packages/persistence/src/generate-design-id.ts`),
not the time-ordered UUID entry 30 floated, for the reason that file states: unguessable and
non-sequential.

**8. [ADR 0038](0038-pre-release-no-stored-designs-no-migrations.md)'s first-stored-schema decision
belongs to M8's pre-launch gate, not to M7.** Its *"M7 or M8 must re-read this record before
launch"* is satisfied by the phase that sits in front of launch; nothing ships before every milestone
is done (owner rule, 2026-08-27), and M7 adds no schema version unless wave 7I stores a corner
direction — an optional field whose absence is a valid unchanged state, ADR 0053's argument.

## Alternatives considered

- **Let `POST` accept the chosen design as its body.** Rejected: it turns the unauthenticated,
  unthrottled mint SEC-001 names into one that also stores attacker-chosen content, which is the
  AV-4 chain's first half. The existing mint-then-`PUT` already puts every document through the
  write-token check and the catalogue validator.
- **Mint when Step 1 opens.** Rejected by ADR 0010's first alternative: a row per visit, including
  visitors who never choose anything.
- **Navigate first and save in the background.** Rejected by ADR 0002 decision 17.
- **Keep the room entry in the store or in `sessionStorage`.** Rejected: Back and reload would lose
  it, or it would need a second persistence path; the URL is already where workflow state lives.
- **Make `/configurator/configure` redirect to Step 1 when no design is loaded.** The plan's route
  guard read literally. Not taken as the interim, because it retires the demo — a product question
  (Q7) — and moves 34 e2e navigations; if the owner chooses it, it is a wave of its own.

## Consequences

- M7 closes backlog 29 for every design Step 1 creates, and — under the interim — for the demo once
  it is edited.
- A real customer trigger now reaches the mint. Nothing ships before M8, and M8's launch gate
  (limiter, retention cron and WAF rule together) stands unchanged; this record adds no exposure that
  gate does not already hold back.
- Wave 7E2 is Full tier with a security reviewer: it touches the write path and the share link.

## Decision-record sweep

| Record | What it says | How it is settled here |
| --- | --- | --- |
| [0002](0002-db-backed-shareable-persistence.md) decision 17 and *Consequences* | No link before a successful write; route guards resolve a design by identifier. | **Followed** (decisions 2, 3). |
| [0010](0010-m3-client-write-path-unwired.md) | Mint on first mutation, never on page load; a burst makes exactly one row. | **Followed**: choosing a preset is the first mutation. |
| [0014](0014-unauthenticated-write-surface.md) S3 | *Revisit before M7, when there is a real creation trigger.* | **Superseded by [0019](0019-security-baseline-writes-throttling-retention.md)**, whose 2026-08-31 correction defers SEC-001 to M8/pre-launch by owner decision. Not re-litigated; `POST` is unchanged. |
| [0019](0019-security-baseline-writes-throttling-retention.md) decision 1 | Read/write split with a per-design write token. | **Shipped in M3 wave 3C** (`lib/server/write-token.ts`; the `PUT` refuses without it at `route.ts:137-138`), so the plan's *"if it has not, it blocks this phase"* does not fire. |
| [0038](0038-pre-release-no-stored-designs-no-migrations.md) *Consequences* | M7 or M8 decides the first stored schema before launch. | **Assigned to M8** (decision 8). |
| [0041](0041-the-browser-security-policy-is-versioned-and-the-csp-only-reports.md) | Every customer route carries the nonce'd CSP. | **Followed** (decision 4). |
| [0069](0069-past-the-wall-is-one-code-family-and-severity-is-declared-per-code.md) decision 5b, [0085](0085-a-normalisations-guard-asks-what-the-normalisation-changes.md) | The 3600 × 2400 correction is keyed at version ≤ 2 because no room control existed. | **Consistent**; wave 7E2 proves a customer's 3600 × 2400 round-trips unchanged. |
| [0095](0095-romanian-is-the-source-and-lives-in-message-files-and-the-domain-publishes-codes-not-sentences.md) decision 4 | A shared link's locale is presentation, never identity. | **Followed**: the room query and `/d/{id}` carry no locale into the document. |

## Amendment A — 2026-09-11: the owner's answer to Q7 — the editor lives only at the design's own link

**The ruling, verbatim** (owner, 2026-09-11):

> *"7. Yes I need custom link for each user (save uuid related to potential user in session /
> cookies), on reopening detect he uuid from browser and load its previous configuration. Current
> screen should bot be displayed with current URL, only with custom user uuid"*

**A1. Decisions 1–6 and 8 stand; decision 5 is confirmed by the owner's *"Yes"*.** Decision 7's
interim is **superseded**:

- ~~the demo stays at `/configurator/configure` exactly as today~~ — **the editor is shown only at
  `/[locale]/d/{id}`.** `/configurator/configure` and `/` render no editor: each resolves on the
  server to the visitor's own design (A2) or, failing that, to Step 1.
- ~~a demo design's first successful save replaces the URL with `/d/{id}`~~ — moot: no editor is
  reachable without an id.
- *Design identifiers stay `nanoid()`* — **confirmed**; the owner's *"uuid"* names the design's
  identifier, and Q7(d)'s question was answered *"Yes"*.

> **A2 is superseded the same day by [ADR 0114](0114-a-visitor-is-a-host-only-httponly-secret-and-a-design-link-opens-only-in-its-own-browser.md)**,
> on the owner's security requirement: the cookie holds a random secret, not the design id, under a
> `__Host-` name; the design is linked to it by a hash on its row. The text below is struck, not
> deleted.

~~**A2. A per-visitor pointer cookie remembers the visitor's design.**~~

- ~~One cookie, holding **only a design id**: `HttpOnly`, `Secure` outside local development, `SameSite=Lax`, `Path=/`, with the write token's 30-day lifetime (`write-token.ts:18`).~~
- ~~**Set or refreshed only by responses that set or refresh that design's write token** — the mint and every successful save — so it only ever names a design this browser may edit. Opening someone else's shared link never moves it.~~
- ~~**It is not a credential.** Reading a design needs only its id (ADR 0019 decision 1); writing still needs the per-design token, which the pointer neither holds nor implies. No route authorises anything on the pointer's say-so.~~
- ~~**A pointer whose design does not load** — deleted, invalid, never written — is cleared and the visitor lands on Step 1. Never an error page.~~
- ~~**Locale-free**: it names a design, not a language (ADR 0095 decision 4).~~

**A3. The demo stops being a customer surface; the seeded kitchen stays everywhere else.** It is still
what `POST /api/designs` mints, the scene `/internal/scene-shot` renders for the M1 fidelity gate, and
the fixture most tests stand on. The e2e suite's 34 `goto("/configurator/configure")` calls move to a
fixture that mints the seeded design through the API and opens its `/d/{id}`; the Playwright
web-server readiness URL (`apps/web/playwright.config.ts:93`) and `capture-fidelity.mjs`'s readiness
probe (`:66`) stop naming the retired route. That migration lands **before** the redirect does, so
the suite never goes red in between.

> **Amendment A — 2026-09-23, M7 wave 7E4 close-out.** A3's "34 `goto` calls" was stale at the time
> it was carried into planning; the coordinator measured **47 lines across 34 files** referencing
> `/configurator/configure` at the wave's start. The migration this amendment records shipped as
> planned: `rtk proxy git grep -nE '(^|[^p])/configurator/configure' -- apps/web/tests/e2e
> apps/web/playwright.config.ts apps/web/scripts packages/three-adapter/tests` now prints only
> `configure-route.e2e.spec.ts:12` and `:20` — the one spec whose subject *is* the retired route —
> measured at `d00212a`, re-run by the reviewer at `708d3b8`. **The durable rule the wave leaves
> behind: e2e opens a seeded `/d/{id}` via the fixture (`mintSeededDesign` / `waitForFirstSave`); the
> editor route (`/configurator/configure`) is not a test origin.** Full close-out:
> [`milestones/M7-room-and-presets.md`, *7E4 close-out —
> 2026-09-23*](../milestones/M7-room-and-presets.md#7e4-close-out--2026-09-23).

**A4. The two routes become dynamic** (they read a cookie). That also removes two of the prerendered
pages `security-headers.ts` names as a blocker to enforcing the CSP — a side effect worth noting, not
a goal.

**A5. Residual risk, accepted and put to the security reviewer:** on a shared device the next person
to open the site resumes the previous visitor's design with edit rights. That is already true of the
write-token cookie today; the cross-device path remains M8's emailed edit link (ADR 0019 decision 8).

**A6. Backlog 29 closes and backlog 30 is answered** — the owner's 2026-09-02 proposal, now ruled.
