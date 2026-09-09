# M6B — Internationalization: Romanian becomes a source locale instead of a hardcoded one

> **STATUS: IN PROGRESS — Gate O1 closed; 6B-a through 6B-d complete; 6B-e next.** Runs immediately after M6 and
> before M7. The owner supplied a 13-line Romanian edit set on 2026-09-07 and directed that the
> corrected catalogue be translated first, then the remaining implementation waves continue.
> Summary: `docs/STATUS.md`. The rulings this plan rests on:
> [ADR 0095](../decisions/0095-romanian-is-the-source-and-lives-in-message-files-and-the-domain-publishes-codes-not-sentences.md).

Status: in progress on branch `m6b-internationalization`. The 2026-09-07 owner sequencing ruling
supersedes the planned dependency order described below; see *Owner sequencing correction*.
Reference: [ADR 0001](../decisions/0001-initial-product-and-stack.md) decision 5;
[ADR 0095](../decisions/0095-romanian-is-the-source-and-lives-in-message-files-and-the-domain-publishes-codes-not-sentences.md);
`docs/best-practices/engineering-conventions.md:61`; `docs/brand.md:30`;
`docs/ARCHITECTURE_PROPOSAL.md:774`; `docs/BACKLOG.md` entry 53.

## This is not new scope

**A launch requirement decided on day one has travelled through six milestones without an owner.**
[ADR 0001](../decisions/0001-initial-product-and-stack.md) decision 5 — *"Launch with Romanian as the
default locale and Russian as a supported locale"* — was **Accepted 2026-08-20 and has never been
superseded**. `docs/best-practices/engineering-conventions.md:61` has required the same thing in
writing the whole time: *"Keep user-visible copy in the project's localization/content system. Add
every required locale at the same time; do not hardcode one-language fallbacks in components."*

`apps/web/src/content/ro.ts` is exactly the hardcoded one-language fallback that forbids.
`docs/brand.md:30` (*"equally native in Romanian and Russian"*) and
`docs/ARCHITECTURE_PROPOSAL.md:774` carry the same intent. **The record has said this in four places
while the code said it in none.**

What the owner added on 2026-09-06 is the **shape**, not the requirement: the international standard
for translations, strings addressed by short code, and **Romanian as the source language** with
everything else a translation of it. No owner-approved Romanian copy is re-authored in this phase.

**The drift has already begun.** `ro.ts` carries a `contactPlaceholder` group — an M8 stub — written
into a module that has no locale concept.

## Goal

**Implement i18n, not an extraction.** The owner's ruling, 2026-09-06: *"need to add in code also the
internalization, meaning implementing i18n"*. When this phase closes, the product is genuinely
multilingual — the library is wired in, the locale is routed and negotiated, numbers and money are
formatted for it, every customer-visible string is reached by a short key from a per-locale ICU
message file, a complete Russian file sits beside the Romanian one, and a Romanian string literal
cannot re-enter the source without failing a gate.

**[ADR 0001](../decisions/0001-initial-product-and-stack.md) decision 5 is satisfied at M6B's close,
not still owed.** After six milestones of being owed, the one thing left outstanding is the owner's
sign-off on the drafted Russian wording — a review line on M8's launch gate, not engineering.

## Why it runs here, between M6 and M7

The owner's sequencing ruling, 2026-09-06. M7 adds `/configurator/room` and its six sub-states plus
room-schema validation copy; M8 adds review, contact, success and failure. **Two whole screens of
copy.** Authoring them natively as keys costs nothing; authoring them as hardcoded Romanian buys a
later phase the job of hunting them down. The `contactPlaceholder` stub already in `ro.ts` is the
proof that this happens by default.

## Why it cannot start early

M6 has five waves open — 6T, 6T2, 6W, 6V, 6X — and 6T is live in
`packages/configurator-domain/src/pricing/*` and `hardware-mechanisms.ts`. Wave 6B-g reformats every
money string in the app and wave 6B-f moves catalogue labels out of the domain. **Both read surfaces
6T is still writing.** M6B's first wave may not open until M6 closes.

## Owner sequencing correction — 2026-09-07

The owner closed **Gate O1** by reviewing the collected catalogue and supplying a 13-line edit set
in `apps/web/src/messages/ro.json`: semantic JSON comparison measures 12 changed leaf values, while
`rejection.FINISH_NOT_SUPPORTED` was byte-identical apart from trailing whitespace. Those edits are owner-authored input: implementation
must preserve them, update the future copy lock and golden-output baseline only for those 13 keys,
and must not describe them as agent copy changes.

The owner also gave a newer, explicit sequence: **translate the corrected Romanian catalogue into
Russian next, then continue through the rest of M6B**. This supersedes the table's original
dependency order and the earlier statement that no M6B code wave could open before M6 was formally
closed. The revised execution order is:

1. Gate O1 closes with the owner's 13-line edit set (12 semantic value changes and one
   whitespace-only line).
2. The translation slice of 6B-i creates a complete, structurally aligned, agent-drafted `ru.json`
   from that corrected file. It remains unapproved.
3. Waves 6B-a through 6B-h implement and gate the locale machinery, routing, extraction seams,
   descriptor boundaries and formatting against both catalogues.
4. 6B-i completes the switcher, pseudo-locale and end-to-end Russian rendering, then receives its
   Full-tier QA and review as one finished wave.
5. Gate O2 stops work for the owner's substantive Russian check. Wave 6B-j and phase close-out do
   not run until the owner responds.

This changes sequence, not scope or standards. The Russian remains an agent draft; ICU structure,
key parity, the hard Gate O2 stop and every wave's QA-before-review cycle remain load-bearing.

## Implementation-audit corrections — 2026-09-07

The pre-implementation audit found three places where the 2026-09-06 plan described a tree that no
longer exists or two criteria that cannot both be true. They are corrected before dispatch rather
than worked around in code:

1. **Extend `apps/web/src/proxy.ts`; never add `middleware.ts`.** This Next 16 tree already has one
   proxy and it owns the per-request CSP nonce. Locale redirect/rewrite/pass-through behaviour must
   compose with that security path and its tests; a second proxy or middleware is not an option.
2. **The golden-output baseline is a checked-in key-to-SHA-256 manifest, not a second Romanian
   corpus.** The inline whole-file copy lock remains the one place that pins Romanian literals. The
   hash manifest proves legacy-output continuity without contradicting the owner's no-hardcoded-copy
   rule or creating a second source of approved wording. Because the harness lands after Gate O1,
   its initial baseline is the corrected catalogue; the 12 semantic changes are recorded and no
   claim of a literal M6-close recapture is made.
3. **Customer-visible price-book prose joins the message catalogue.** The audit found eight Romanian
   descriptions plus tier/accessory display names on the settings and breakdown surfaces. Leaving
   them as Romanian-only data makes the acceptance criterion “every current screen renders fully in
   Russian” impossible. Numeric rates and manufacturer records remain locale-free commercial data;
   customer-facing names and descriptions become message descriptors resolved in the app. Their
   Romanian values move byte-for-byte from the existing record, and their Russian values remain an
   agent draft for Gate O2. This narrowly supersedes ADR 0095 decision 3's display-prose exemption.

Oversized named waves keep their public wave ids and are delivered through narrow internal
sub-dispatches with a mini-review between collision-heavy slices. This is scope control, not new
waves.

## Scope

**In.** The message format and the library, wired into server and client components; the
request-scoped locale, its routing and its negotiation; `apps/web/src/content/ro.ts` in whole; every
customer-reachable Romanian string in `packages/configurator-domain/src`; `Intl` number and currency
formatting and the baked-in cases (`MDL`, *"Pasul 2 din 4"*); **a complete drafted `ru.json`**; the
language switcher; **every hardcoded string in the tests, including the domain suite's fixtures**;
the test conventions that replace literal pinning; and a gate that stops the drift recurring.

**Out.**
- **Approving the Russian wording.** M6B drafts it; the owner signs it off at M8's launch gate. An
  agent never marks a translation approved.
- **Re-authoring any owner-ruled Romanian sentence.** Romanian is the source. A byte-for-byte change
  to approved copy is a defect in this phase, not an improvement — including tidying
  `configure.overflowWarning`, which ADR 0065 decision 7b marks *"verbatim, punctuation included, and
  not to be tidied."* **A Romanian sentence that is awkward to translate is a finding to report,
  never a licence to edit the source.**
  - **Two sanctioned exceptions, both owner-ruled and neither an agent's judgement.** The zero-count
    plural (owner ruling, 2026-09-06 — see 6B-d), and whatever the owner changes at **Gate O1**.
    Nothing else moves.
- **English as a shipped locale.** No record requires it; see open question 3.
- **Translating numeric price-book records or manufacturer data.** Rates remain locale-free.
  Customer-visible names and descriptions are no longer covered by this exclusion; the 2026-09-07
  implementation audit found that leaving them Romanian-only makes end-to-end Russian impossible.
- **New screens, new copy, new product behaviour.** Nothing a customer can *do* changes in this
  phase.
- **RTL, locale-aware date formatting, and a locale-aware sort.** No surface needs any of the three
  today. Named so their absence is a choice.

## The ground truth this plan was measured against

Counted on the tree at `4c166c5`, 2026-09-06. Where the phase brief's numbers differed, the measured
figure is used and the difference is recorded — every correction makes the phase **larger**.

**In the app:**

- `apps/web/src/content/ro.ts` — **603 lines**, 8 groups plus a bare `brand` string, **59 plain string
  entries**, **17 function-valued entries** (the brief said 16), 11 nested groups.
- **44 files** import it — 11 in `apps/web/src`, 33 in `apps/web/tests` — at **45 occurrences**. The
  brief's "48 import sites" is high.
- **39 Romanian literal assertions** across **32 test files**. The brief's "39 test files" is a count
  of assertions, not of files.
- **81 assertions of the form `expect(x).toBe(ro.some.key)`** — self-referential, and therefore
  tautologies that protect no copy at all. This is the larger half of the test work and the brief did
  not have it.
- **Only 2 Romanian literals in `apps/web/tests/e2e`.** The e2e suite is test-id driven. This is the
  single biggest de-risking fact in the phase.
- **4 customer route families** — `/`, `/configurator/configure`, `/configurator/contact`, and
  `/d/[id]` — plus the unlocalised `/internal/scene-shot` render rig, 3 API routes, and **no
  `middleware.ts`**. Routing is small.
- `layout.tsx:22` hardcodes `<html lang="ro">`; `layout.tsx:9-10` hardcode the Romanian title and
  description. `configure.step` is the literal `"Pasul 2 din 4"`.
- **No i18n dependency anywhere in the tree.** `next@16.3.2`, `react@19.2.0`.

**In the domain — the finding the brief did not have:**

- `packages/configurator-domain/src/commands/rejection.ts` — **507 lines, 34 refusal codes**, roughly
  forty rendered Romanian sentences with interpolation and grammar clauses.
  `commands/command-result.ts:198` renders one into **every** command result.
  - **Wave 6Z added a 35th**, listed here rather than discovered during extraction (ADR 0103
    decision 7): `DEPENDENT_MEMBER_NOT_REBUILDABLE`, carrying `ColumnMemberParams`. Its sentence
    names **two** bodies — the one the customer asked to insert and the one standing above it — so
    it needs two interpolations in one clause and a relative clause between them
    (*"…, care stă deasupra, …"*), which is the grammar shape `COLUMN_MEMBER_NOT_RESIZABLE` already
    has. It is marked *"Ruled 2026-09-08, pending owner review"* in the same way the two 6E tier
    codes and `FINISH_NOT_OFFERED` are.
- `catalog.ts` — a **17-entry `KIND_LABELS_RO`**, `BASE_CABINET_LABEL_RO`, `UNKNOWN_KIND_LABEL_RO`,
  roughly a dozen entry `label:` strings, and `describeBodyLabelAt`'s `ușă`/`uși` door count.
- `bands.ts` — `BAND_LABELS_RO`, 4 entries, read by `catalog.ts` and §9's header.
- `queries/describe-selection.ts` — `EMPTY_SLOT_LABEL_RO`.
- `pricing/sample-price-book.ts` — 6 Romanian descriptions, ruled **data** and out of scope.
- **13 Romanian literal assertions** in a 74-file domain suite.
- `packages/three-adapter/src` has **no** Romanian outside comments. Nothing to do there.

## The rulings this phase rests on

Recorded in full, with alternatives, in
[ADR 0095](../decisions/0095-romanian-is-the-source-and-lives-in-message-files-and-the-domain-publishes-codes-not-sentences.md).
Summarised here so a wave dispatch does not have to open it.

1. **ICU MessageFormat is the format; next-intl is the library, subject to a compatibility gate.**
   The format is not negotiable — it is the standard the owner's instruction names and the only
   candidate that expresses the seventeen interpolated entries and Romanian's plural bands without
   hand-written branching. The library is chosen for one property above the rest: **an unknown key is
   a compile error, not a blank label**. Its support for `next@16.3.2` / `react@19.2.0` is
   **unverified here** and wave 6B-a verifies before committing, with a named fallback.
2. **Every string is reached by a key, in tests too — and approved copy is pinned in exactly one
   place.** The owner's ruling: *"every hardcoded string even in tests should be replaced"*. See the
   next section, which is the design that keeps this from destroying the copy guard.
3. **M6B implements i18n and closes ADR 0001 decision 5.** Routing, negotiation, `Intl` formatting,
   the baked-in cases, and a complete `ru.json`. Locale is presentation and never a design's
   identity; formatters format and never compute.
4. **The domain publishes a code and its parameters, not a Romanian sentence.** Forced by the
   measurement above. This supersedes M3 work item 2's *"both, never a choice"*; ADR 0095 records why
   the intent behind that rule survives the move.

## Why approved copy is pinned in exactly one place — and why that is deliberate

**This section exists so the next reader does not mistake the single pinning point for an
oversight.**

The owner ruled that no test carries a hardcoded string. Wave 6D's rule — *every owner-ruled string
is pinned by a literal* — therefore cannot stay where it is. It is **kept and moved**, not dropped.

**The hazard, named before it is designed around.** If a test asserts `t("panel.finishTitle")` and
the component renders `t("panel.finishTitle")`, both sides are fed by `ro.json` and the assertion
cannot fail for the reason it was written. That is exactly `docs/WORKFLOW.md:444`, *"The commonest
weak guard: both sides fed by the same source"* — *"It passes, it looks specific, and it cannot fail
for the reason it was written."* That document records **three such guards found in one wave on
2026-09-03**, each of which read as thorough, and `docs/STATUS.md` records that of the five waves
certified on 2026-09-05, **three came back CERTIFIED WITH FINDINGS**. This project does not get to
assume it would notice.

**The invariant to preserve, stated so a reviewer can check it:** *a translator or an agent cannot
change approved Romanian copy without it showing up as a failing test that a human must consciously
accept.*

**Four layers, each answering a different question. Only one of them is about wording.**

| Layer | Answers | Fed by `ro.json` on both sides? |
| --- | --- | --- |
| **1. The copy lock** — an inline literal, key-by-key table compared to `messages/ro.json` | *Is the approved wording still the wording?* | No — the expected side is a literal |
| **2. Descriptor assertions** — model tests assert `{ key, params }` | *Did the surface pick the right message?* | No — never touches `ro.json` |
| **3. Resolution assertions** — component/DOM/e2e | *Did the resolver run and the wiring hold?* | **Yes, by design — see below** |
| **4. Structural gates** — completeness, ICU placeholder parity, no silent fallback | *Is the translation usable?* | N/A |

- **The copy lock must be an inline literal table, never `toMatchSnapshot`.** A snapshot is
  self-approving: `vitest -u` rewrites it, and an agent told to make the suite green will run `-u`.
  That converts the one guard protecting approved copy into a guard that rubber-stamps its own
  replacement. **This is a new rule** — the project has no snapshot policy today. It is also a
  **whole-file** lock: a key added to `ro.json` with no line in the lock fails it, or the guard
  decays as the catalogue grows.
- **Layer 2 is what replaces the 81 tautologies**, and it is a strengthening. `expect(x).toBe(ro.k)`
  passes whatever the string is; `expect(x).toEqual({ key: "panel.k", params: { label } })` fails
  when the surface picks the wrong message, which is a failure no prose assertion ever caught.
- **Layer 3's same-source comparison is accepted and recorded as accepted.** It proves the resolver
  ran and the right key was requested; it never proves the wording is right, and it is not asked to.
  **A reviewer who finds a same-source comparison in layer 3 has found the design; one in layer 2 or
  4 has found a defect.** Recorded because WORKFLOW:444 correctly teaches reviewers to flag that
  shape, and without this pointer it will be re-raised every round.
- **Translations are never pinned by literal.** Pinning a Russian sentence would freeze a translator
  out of their own file. Layer 4 gates them structurally instead.

## Waves

Ten waves, sequenced so the mechanical bulk is separable from the decisions.

**Which are dull and which are risky, said plainly rather than implied by the tier:**

- **Dull:** 6B-c (the 59 plain strings — the largest diff in the phase and the least thought in it)
  and 6B-j (the lint gate). Both are boring and neither is safe to rush: 6B-c is where a
  rubber-stamp costs most, because its safety rests entirely on the harness being genuinely
  byte-comparing.
- **Risky:** 6B-e (34 refusal codes, eagerly rendered into every command result), 6B-f (labels that
  reach priced breakdown lines and the ACTUAL badge), and 6B-g (money). These are domain algebra and
  money, and they are Full for that reason.
- **Bigger than they look:** 6B-a, because it lands three gates and a dependency and everything after
  it is verified by them; and 6B-b, because routing rewrites the route tree of a live app and there
  is no `middleware.ts` today to extend.

| Wave | Subject | Tier | Depends on |
| --- | --- | --- | --- |
| **6B-a** | **DONE 2026-09-08, `924d3c6`** (implementation checkpoint `06da284`): the standard, the library and its compatibility gate; the request-scoped locale; one witness namespace end to end; the **golden-output harness**, the **copy lock** and the **parity gate** | **Full** (dependency change) | Gate O1 closed and translation draft present (owner sequencing correction, 2026-09-07) |
| **6B-b** | **DONE 2026-09-09, `d4f39f7`** (routing core `cf16427`; review repairs `d4cedb2`): locale routing, negotiation, `<html lang>`, route metadata, and the shared-link invariant | **Full** (every route) | 6B-a |
| **6B-c** | **DONE 2026-09-09, `1c8ad46`** (typed-key repair `a7c796a`; Playwright fixture `1a7dd97`): the plain strings leave `ro.ts` and resolve from the active locale | **Light** | 6B-a |
| **6B-d** | **DONE 2026-09-09, `1fbd780`:** the 17 interpolated entries become ICU; Romanian plurals become CLDR `one/few/other`; *"Pasul 2 din 4"* becomes parameterised | **Full** (grammar; open question 1) | 6B-c |
| **6B-e** | The 34 refusal codes: the domain stops rendering Romanian | **Full** (domain algebra) | 6B-d |
| **6B-f** | Catalogue, kind and band labels leave the domain | **Full** (reaches priced lines) | 6B-e |
| **6B-g** | `Intl` money and number formatting; `MDL` stops being a literal suffix | **Full** (money) | 6B-f |
| **6B-h** | The test sweep: the last hardcoded strings, the 81 tautologies, the domain fixtures | **Light** (tests only, but see below) | 6B-g |
| **Gate O1** | **CLOSED 2026-09-07 — the owner supplied a 13-line edit set: 12 semantic values and one whitespace-only line.** Not a wave; an owner input | — | Catalogue collection |
| **6B-i** | Translation slice first: `ru.json` translated from the **corrected** Romanian. Integration slice after 6B-a–h: the language switcher and the pseudo-locale as a length-stress tool | **Full** (closes ADR 0001 decision 5) | Translation: **Gate O1 closed**. Integration and wave gate: 6B-b, 6B-h |
| **Gate O2** | **HARD STOP — the owner checks the Russian.** Not a wave; an owner review, and a real one | — | 6B-i |
| **6B-j** | The re-drift gate — a lint rule and a CI check — **and the written convention M7 and M8 author against** | **Light** | 6B-i |

6B-b and 6B-c are independent of one another and may run in either order after 6B-a. Everything from
6B-d down is a chain, because each wave's golden-output check depends on the previous wave's
catalogue being complete.

**6B-h runs during Gate O1, not after it.** It changes no wording, so it is the one piece of work
that does not idle while the owner reads. Nothing else starts.

**The owner has accepted the size of this phase explicitly** — *"Yeah, it will take more, but it
should cover everything related to internationalization."* The milestone is not to be trimmed to look
smaller; a wave dropped here is a wave M7 or M8 pays for.

**Tests move with their wave**, not to the end: each wave converts the tests of the code it touches.
6B-h is the *sweep* for what no wave owned — the domain fixtures, e2e's two literals, and any
tautology that survived — plus the audit that layers 2 and 3 landed where they belong. It is Light
because it changes no production code, and it is the wave most likely to need a second round,
because it is the one that has to judge which layer each converted assertion belongs in.

### 6B-a — the standard, the seam, and the three gates that protect every later wave

The wave that makes the rest verifiable. **It lands the gates before anything is extracted**, so
extraction is checked rather than trusted.

1. **Verify, then commit.** Install next-intl; build, typecheck and render one namespace on **both a
   server and a client component** under `next@16.3.2` / `react@19.2.0`. **If it does not hold, take
   ADR 0095's named fallback** — `intl-messageformat` behind the app's own `t()` seam, keeping ICU
   and the key catalogue, with a hand-written key union in place of the generated declaration. Report
   which was taken; do not report a version matrix that was not run.
2. `apps/web/src/messages/ro.json`, namespaced on `ro.ts`'s existing 8 groups.
3. **The witness namespace: `webglUnavailable`.** Three strings, one component, no interpolation, no
   money, no domain. The smallest complete slice that exercises the whole path.
4. **The golden-output harness.** Capture, at M6's close: every string `ro.ts` produces; every
   `renderRejection` output over all 34 codes with fixture parameters; `describeBodyLabelAt` over
   every catalogue entry at every offered width. This is the phase's proof of behaviour-freedom.
5. **The copy lock** — inline literal table, whole-file, never a snapshot.
6. **The parity gate** — completeness, ICU placeholder parity, no silent fallback. It passes
   vacuously with one locale and is not dead: 6B-i makes it bite.

**Completed 2026-09-08 — `924d3c6`; implementation checkpoint `06da284`.** The compatibility
gate selected **next-intl 4.14.2** with parser **3.5.17**, not ADR 0095's fallback. It establishes a
typed request/routing seam and proves the `webglUnavailable` namespace through both a server and a
client witness. The three intended cross-wave gates are present: the whole-catalogue Romanian copy
lock, structural catalogue parity (including ICU placeholders and no silent fallback), and the
SHA-256 golden-output harness.

**Evidence and review.** The golden corpus contains **282 fixtures**: **95 static**; **49 function
fixtures across 17 families**; **40 rejection fixtures across 34 codes and 37 keys**; and **98
catalogue fixtures across 16 entries**. An implementation discovery closed the accessory-catalogue
completeness gap. Independent QA round 1 found **Q1.1 (P1, test-gate blocker)**: the Romanian-source
scan counted generated `src/messages/ro.d.json.ts` as a second runtime Romanian copy. Its test-only
fix excludes only generated `*.d.json.ts` declarations and retains the ordinary `.ts`/`.tsx`
runtime-source scan; QA then passed with web **1701 passed / 4 skipped**. The first review found four
test-only defects: logic High ignored ICU `TYPE.pound`; logic Medium did not exercise the witness in a
real browser runtime; logic Medium let a plain Romanian edit fail the copy lock, golden gate and
declaration rather than exactly one guard; and clean-code P1 embedded Romanian literals in golden
fixture inputs/IDs. The developer fixed all four. QA round 2 passed; the same logic reviewer resolved
**3/3**, the same clean-code reviewer resolved **P1**, and security review was **PASS** with no
exploitable issue.

The coordinator's final unrestricted `pnpm ci:local` invocation was green: domain **3316**;
persistence **122 passed / 86 skipped**; three-adapter **2853**; web **1702 passed / 4 skipped**;
E2E **111 passed / 1 skipped (112 total)**; Next build **6/6 static pages**; boundary, lockfile and
SCA **PASS**. An earlier sandboxed attempt stopped only on bind `EPERM` and audit DNS; that
environment failure is not a product failure.

**Next.** Start **6B-c — the 59 plain strings leave `ro.ts`**. Russian is still an unapproved agent
draft until Gate O2.

### 6B-b — locale routing and negotiation

The existing `apps/web/src/proxy.ts` gains locale routing alongside its CSP nonce path; no
`middleware.ts` is added. A `[locale]` segment over the four customer route families, cookie then
`Accept-Language` negotiation at the unprefixed root, `<html lang>` from the resolved locale, and
localised route metadata (`layout.tsx:9-10`). `/api/*` and `/internal/*` stay unprefixed —
`/internal/scene-shot` is the render rig and a prefix there breaks the shot pipeline.

**Completed 2026-09-09.** The routing core landed at `cf16427`, review repairs at `d4cedb2`, and
locale-preserving customer navigation at `d4f39f7`. The four customer route families now use an
always-prefixed `ro`/`ru` locale; unprefixed customer paths negotiate the locale, while `/api/*` and
`/internal/*` remain outside locale routing. Shared-design links preserve the bare design ID, and
strict case-variant locale paths return an explicit CSP-decorated 404. The scene-shot contract is
explicit: available in development and a 404 by default in production unless explicitly enabled.

Review removed private redirect-override headers, added the shared-design identity regression and
the strict case-variant/CSP coverage, corrected the SSG nonce assertion to exact development and
production expectations, and cleaned up the WebGL helper, React `isValidElement` guard, and stale
route comments. Focused final unit evidence was **58 passed across 7 files**. Independent QA before
the fixes recorded **55 passed** and browser **7/7**; the coordinator's final local production-mode
Playwright run was **7/7**, with the exact production nonce check **1/1**. Web typecheck, build, lint,
and the pre-commit hook were green; final logic, clean-code, and security reviews were **PASS**. No
CI or push evidence is claimed.

### 6B-c — the dull one

59 plain strings out of `ro.ts` into `ro.json`; the import sites repointed. **Behaviour-free by
construction and provable by the harness.** The only judgement in it is namespace placement, and the
answer is: mirror the existing group, do not redesign it.

**Completed 2026-09-09.** The extraction landed at `1c8ad46`, the generated-key type repair at
`a7c796a`, and the Node-safe Playwright fixture at `1a7dd97`. All **94 static leaves** now resolve
through next-intl from the active locale while preserving the existing eight-group content shape.
`configure.step` and the **17 function-valued families** remain deliberately in `ro.ts` for 6B-d.
The only direct `content/ro` imports left are that explicit interpolation seam and the golden-output
fixture. `ro.json`, `ru.json`, the approved Romanian corpus, and the golden hashes remained
byte-identical through the wave.

Independent adversarial QA passed with no findings: its focused localization/golden run was **23/23**
and its full web run was **1,747 passed / 4 skipped**. Combined review found one High blocker: the
first resolver signature widened generated catalogue keys to `string`. The repair preserves
next-intl's augmented `Messages` signature, removes all casts at production call sites, and adds a
compile-time witness that rejects an unknown key; the same reviewer closed the finding. Coordinator
verification after the repair recorded web **1,748 passed / 4 skipped**. The first unrestricted E2E
run then exposed Playwright's Node ESM loader rejecting the Vitest fixture's static JSON import; the
test-only Node-safe fixture passed reopened QA and re-review. Four unrelated parallel GPU/timing
timeouts all passed in a serial **5/5** rerun.

Final unrestricted `E2E_PORT=4321 pnpm ci:local` was green: domain **3,316**; persistence **122
passed / 86 skipped**; three-adapter **2,853**; web **1,748 passed / 4 skipped**; E2E **117 passed / 1
skipped (118 total)**; Next build **9/9 static pages**; format, lint, typecheck, boundary, lockfile and
production SCA **PASS**. An earlier sandboxed run failed only on bind `EPERM` and audit DNS; an
intermediate unrestricted E2E run caught the JSON-loader defect described above and is not presented
as a green gate.

**Next.** Start **6B-d — the interpolated seventeen, and Romanian's plural bands**. Russian remains
an unapproved agent draft until Gate O2.

### 6B-d — the interpolated seventeen, and Romanian's plural bands

Where a naive extraction goes wrong. `handleDefaultNote: (label) => …` becomes `{label}`;
`pluraliseBodies`, `everyBodyPhrase` and `chosenCabinetPhrase` become ICU plurals; *"Pasul 2 din 4"*
becomes a message whose step numbers are arguments rather than words.

**CLDR already encodes Romanian's three bands** — `one` for 1, `few` for 2–19 and for any number
whose last two digits fall in 1–19, `other` (which takes *"de"*) for the rest — which is exactly what
`pluraliseBodies` hand-writes. Verified against the shipped rule at 100 (*"de corpuri"*, both) and
101 (*"corpuri"*, both). **They diverge at exactly one value: zero, and the shipped code is wrong
there.**

**Ruled by the owner, 2026-09-06:** *"one is plural, it's needed to be used instead of '0 de corpuri'
=> '0 corpuri'"*. **CLDR wins.** Zero takes `few`, the plain plural, and an empty kitchen reads
*"0 corpuri"*. This is the phase's one sanctioned change to shipped Romanian, and it is a defect fix
carrying an owner ruling rather than an agent tidying copy.

**Two things change, not one, and the second is the one that matters.** The code at
`apps/web/src/content/ro.ts:8` is a two-line fix. **The false comments above it are what would
reintroduce the bug** — they assert the wrong rule as settled fact, with reasoning, which is exactly
what persuades the next reader to "restore" it:

- **`ro.ts:4-7`**, `pluraliseBodies`' own doc: *"one, two to nineteen, and **0** or twenty upward,
  which takes 'de'"*. The `0` in that clause is the defect, written down as the rule.
- **`ro.ts:15-19`**, `everyBodyPhrase`'s doc: *"Zero takes the drawn form and reads '0 de corpuri',
  which is what `pluraliseBodies`' documented rule answers **and is the truth about an empty
  kitchen**."* Wrong, and stated with more confidence than the code.

Both must be corrected in the same wave and must not survive into the ICU message's comment. **A
wave that fixes the code and leaves either comment standing has not closed this.**

`starting-price.adversarial.test.ts` sweeps a composing template's source body for a digit — the
reason `chosenCabinetPhrase` is a module-level helper rather than an inline branch. **That test's
premise dies when the template becomes an ICU string, and this wave owes it a replacement rather than
a deletion.**

**Completed 2026-09-09 at `1fbd780`.** `configure.step` and all **17 interpolated families** are now
typed ICU messages resolved through the active locale. The exact production scope was
`apps/web/src/i18n/content.ts` plus deletion of the legacy `apps/web/src/content/ro.ts`; no other
production file changed. Romanian zero now follows the owner's CLDR ruling and renders the plain
plural, while the approved `ro.json` and drafted `ru.json` catalogues, generated message declaration,
copy lock, and all **282** golden hashes remained unchanged. A shared ICU-AST authored-literal guard
replaced the obsolete source-body digit check and protects the same invariant without depending on
function source text.

Adversarial QA first reported **Q1.1 (P1)**: 22 stale live tests failed after the legacy helpers were
removed; the full web run was **1,739 passed / 22 failed / 4 skipped**. After that repair, QA found
**Q2.1 (High)** stale E2E coverage, **Q2.2 (Medium)** a tautological assertion, and **Q4.1
(Medium)** a vacuous authored-literal guard; all were fixed. Final targeted QA suites passed, and
the full web suite was **1,760 passed / 4 skipped**. Logic review initially passed, then its
continuity round found **R2.1 (Medium)** — the tag-mutation witness was incomplete — and closed it
after repair. Quality review found **R1.1 (High)** duplicate wording pins, **R1.2 (Medium)** a brittle
source grep, **R1.3 (Medium)** a duplicated walker, and **R2.2 (Low)** a duplicate tagged mutant;
all four were resolved. Both final reviewers reported **PASS**.

The coordinator's unrestricted `E2E_PORT=4321 pnpm ci:local` passed every gate: domain **3,316**;
persistence **122 passed / 86 skipped**; three-adapter **2,853**; web **1,760 passed / 4 skipped**;
Playwright **117 passed / 1 skipped (118 total)**; Next build **9/9 static pages**; format, lint,
typecheck, boundary, lockfile and production SCA **PASS**. A developer sandbox Playwright attempt was
blocked by bind `EPERM`; the unrestricted run proves that failure was environmental.

**Next.** Start **6B-e — the refusals**. Russian remains an unapproved agent draft until Gate O2.

### 6B-e — the refusals

The risky one. `RejectionReason` loses `message`; `command-result.ts:198` stops rendering; 34 codes
become `rejection.<CODE>` keys with their typed `params` as ICU arguments; `panel-model.ts`'s two
`renderRejection` call sites resolve descriptors instead. 13 domain assertions and the panel's
rejection tests move to codes.

### 6B-f — the labels

`KIND_LABELS_RO`, `BAND_LABELS_RO`, `EMPTY_SLOT_LABEL_RO`, `UNKNOWN_KIND_LABEL_RO` and the
catalogue's `label:` fields become keys; `describeBodyLabelAt` publishes a descriptor and its
`ușă`/`uși` becomes an ICU plural. **This reaches the price breakdown line, the ACTUAL badge, the
panel header and the offer row** — ADR 0033's four named call sites — which is why it is Full and why
it runs after the refusals rather than beside them.

### 6B-g — money and the baked-in cases

`Intl.NumberFormat` for grouping and currency; `MDL` stops being a literal suffix in
`price/starting-price.ts`. ADR 0001 decision 4's round-up-to-the-thousand stays in **minor units**,
untouched and un-`Intl`-ed.

### 6B-h — the test sweep and the tautology purge

The last hardcoded strings anywhere in the suites, including the domain fixtures; the 81
`expect(x).toBe(ro.k)` tautologies converted to layer-2 descriptor assertions; e2e's two literals;
and an audit that every converted assertion sits in the layer it belongs to. **Light because it
touches no production code, and the wave most likely to need a second round** because the judgement
in it is per-assertion.

### The copy chain — four ordered steps, two of them hard stops

**This is one chain, not two independent gates**, and the order is load-bearing:

1. **Extraction** (6B-c … 6B-g) collects every Romanian string into `messages/ro.json`.
2. **Gate O1 — the owner reads and corrects the Romanian.** Nothing downstream starts.
3. **6B-i — an agent translates `ru.json` from the corrected Romanian.** Owner-authorised,
   2026-09-06: *"after I will have the correct Romanian strings corrected by me — for me it's okay
   that you will translate it to Russian, because I know Russian also, so I can check. But
   translation, you can lead the translation."* **No professional-translator dependency, and no
   Russian slot left empty.**
4. **Gate O2 — the owner checks the Russian.** They read the language, so this is a substantive
   review rather than a formality.

**Step 3 consumes step 2's output, never the pre-review Romanian.** This is stated as a gate on 6B-i
and not as a sequencing note, because a sequencing note is what a busy session skips: every owner
correction made at O1 against an already-translated file orphans a Russian sentence, and the
translation is done twice.

### Gate O1 — the owner reads and corrects the collected Romanian. A hard stop.

**Owner input, 2026-09-06:** *"let me know when all strings are collected in the language file so I
will take a look."*

**When.** After 6B-g, when every Romanian string in the product — app and domain — is in
`messages/ro.json` and nowhere else. Not before: a partial file wastes the owner's read.

**Work stops here.** 6B-i does not start. Translating copy the owner has not yet corrected means
re-translating after their edits, and re-translating is how a Russian file drifts out of step with
its source. **6B-h is the only wave that may proceed**, because it changes no wording.

**What the owner is asked to check: the Romanian wording, and only that.** They are reading the copy
of their product, collected in one place for the first time. They are **not** asked to review keys,
namespaces, ICU syntax, file structure or the plural categories — those are engineering, and asking
an owner to sign off on `panel.handleDefaultNote` as a *name* buys nothing and risks a "looks fine"
that reads as approval of the whole file. **The hand-over is a rendered list of Romanian sentences,
not the JSON.**

**What happens if they change a string — the part that must be planned, not improvised.**

1. **The copy lock goes red.** That is the design working, not a break: this is the first live proof
   that approved copy cannot change silently. The lock is updated in the same commit as the wording.
2. **The golden-output harness must be re-baselined for exactly the changed keys.** The harness
   asserts byte-identity with the M6-close capture, so an owner-approved wording change legitimately
   breaks it. **Re-baselining is permitted only here, only for keys the owner changed, and only with
   the key list recorded in the commit message.** A blanket re-capture is forbidden — it would erase
   the phase's entire proof of behaviour-freedom in one command.
3. **Downstream waves are unaffected in structure.** A reworded sentence changes a value, not a key,
   so 6B-h's assertions, 6B-i's translation targets and 6B-j's gate are untouched. If the owner asks
   for a string to be **split, merged or newly parameterised**, that is a key change and it is a
   finding for the coordinator to schedule, not a wave's own judgement.
4. **No agent edits Romanian at this gate on its own initiative.** Only what the owner asked for.

**Exit condition:** the owner has read the collected Romanian and either accepted it or supplied
changes that are applied, locked and re-baselined. Then 6B-i opens.

### 6B-i — the second locale, which is what closes ADR 0001 decision 5

`ru.json`, complete: every key, ICU intact, translated from the Romanian source. The language
switcher. A **pseudo-locale** kept as a development and test tool that lengthens strings
deliberately, so a translation that breaks the price bar or the panel is visible before real copy
arrives.

**Its input is a gate, not a preference.** 6B-i may not be dispatched until Gate O1 is closed, and it
translates the `ro.json` that came *out* of O1. A dispatch against a pre-review `ro.json` is a defect
in the dispatch, not in the wave.

**The translation is agent-led, by the owner's authorisation** — they read Russian and check it
themselves at **Gate O2**. That is the substantive review. **No agent marks a translation approved,
and no agent edits Romanian to make a translation easier** — an awkward source sentence is a finding
reported to the owner, who owns both languages here.

### Gate O2 — the owner checks the Russian. A hard stop.

**When.** After 6B-i, with `ru.json` complete and every screen rendering end-to-end in Russian.

**What is asked.** The Russian wording, read by someone who speaks it. Not keys, not ICU syntax, not
the switcher's mechanics. Where a Romanian sentence turned out not to translate cleanly, the wave
reports it here as a finding — the owner owns both languages and decides whether the Russian bends or
the Romanian does. **If they change the Romanian, that is an O1-class change**: copy lock updated,
harness re-baselined for those keys only, and the affected Russian re-translated.

**Where this leaves `ARCHITECTURE_PROPOSAL.md:774`** — *"translation ownership and approved copy
remain inputs"*. Both checks exist and they are not equivalent:

- **Gate O2, inside M6B, is the real review.** It happens while the translator (an agent) is still in
  context and the wave is still open, so a correction costs a round rather than a re-opened phase.
- **M8's launch gate keeps a re-sign line as the backstop**, beside SEC-001 — a last confirmation
  that the shipped wording is still the approved wording after M7 and M8 have added their own.

**An owner asked only at M8 is what this ruling changes.** A phase that defers its only copy review
to a launch checklist is how ADR 0001 decision 5 went six milestones unowned in the first place.

### 6B-j — the gate that stops this happening again, and the rule it enforces

**Two artefacts, and they ship together because one is the enforcement of the other.**

**The automated half.** A lint rule failing on a Romanian string literal in `apps/web/src` outside
`src/messages/`, and in `packages/*/src`, wired into `pnpm lint` and CI. **Comments are exempt** —
the codebase's Romanian comments quote copy deliberately and are not customer-visible.

**The written half — the convention M7 and M8 author against.** Owner, 2026-09-06: *"next milestones
will require to implement all the strings, all the texts in the same way. Maybe they will need some
rewrite from the architect, but it's important to do correct from start."*

M7 adds `/configurator/room`, its six sub-states and schema-validation copy; M8 adds review, contact,
success and the failure path. **Both author large amounts of new copy, and neither implementer should
have to re-derive this phase's rules from a milestone plan.** So the rule is extended into
**`docs/best-practices/engineering-conventions.md`**, at the one-line version already sitting at
line 61 — a document M7 and M8 implementers already read, and one that does not go stale when this
phase closes. It must answer, for someone adding a string tomorrow:

- **Where a new string goes**, and that there is no other legal place for one.
- **How it is keyed and namespaced**, and that a namespace mirrors a surface rather than a component
  tree.
- **How an interpolated or pluralised string is written in ICU** — including that Romanian plurals
  use CLDR's `one`/`few`/`other` and are never hand-branched, with the zero-count defect named as the
  worked example of why.
- **That every new key lands in `ro.json` and `ru.json` in the same commit**, per
  `engineering-conventions.md:61`'s existing *"Add every required locale at the same time"*.
- **What the copy lock requires** of a new string, and that the lock is an inline literal table and
  never a snapshot.
- **What the lint gate rejects**, so the rule and the gate cannot disagree.
- **That a model publishes a descriptor and the render layer resolves it**, with the four test layers
  named — so an M7 implementer writes layer-2 assertions by default instead of inventing prose ones.

**Why it lands here and not at the start of the phase.** The convention has to describe what actually
shipped: the library is not settled until 6B-a's compatibility gate resolves, and the namespace shape
is not settled until 6B-f. A convention written in advance would be a confident document describing a
product that does not exist — which is the failure mode this whole phase exists to correct.

**This is the wave that makes the sequencing argument true**: without both halves, M7 and M8 recreate
the problem.

## Acceptance criteria

Falsifiable, and stated as invariants including what must not happen.

**The catalogue and the key seam**

- Every customer-visible string in `apps/web/src` and `packages/*/src` is reached by a key. Falsified
  by the 6B-j gate finding one, not by inspection.
- **An unknown key is a build failure, not a blank label.** Falsify by adding `t("panel.noSuchKey")`
  to a scratch file and running `pnpm typecheck`; it must fail.
- **A key path never reaches the screen.** No surface renders `panel.done` where *"Gata"* belongs,
  and none renders an empty string for a missing message.
- `packages/configurator-domain` imports no i18n library, takes no locale argument, and exports no
  customer-reachable Romanian string. It stays I/O-free.

**Romanian is unchanged, and provably so**

- After every wave from 6B-c on, the golden-output harness is **byte-identical** to its M6-close
  capture: every `ro.ts` string, all 34 `renderRejection` outputs, and `describeBodyLabelAt` over
  every catalogue entry at every offered width.
- `configure.overflowWarning` is byte-identical, punctuation included (ADR 0065 decision 7b).
- **No approved Romanian sentence is reworded, retyped or tidied.** A diff that improves Romanian is
  a defect in this phase — including one made to ease a translation.

**Plurals**

- **Zero reads *"0 corpuri"*, never *"0 de corpuri"*** (owner ruling, 2026-09-06). Asserted as a named
  value at `count = 0`, not as a range or a sweep — a criterion that only says "matches CLDR" passes
  vacuously the moment the implementation *is* CLDR, and would have passed on the shipped defect too
  had the defect been in the other direction. `everyBodyPhrase(0)` renders *"tuturor celor 0
  corpuri"*.
- **Both false comments are gone.** `ro.ts:4-7` no longer names `0` among the counts that take
  *"de"*, and `ro.ts:15-19`'s *"Zero takes the drawn form … and is the truth about an empty kitchen"*
  is corrected rather than deleted-and-forgotten. Neither claim survives into the ICU message's own
  comment. **Falsify by grepping the phase's final tree for `0 de corpuri`: it must appear nowhere,
  in code or prose.**
- For every integer 1–200, the ICU `ro` message selects the same noun form `pluraliseBodies` selects
  at HEAD. Zero is the one deliberate difference and is asserted separately, above.
- 1 → *"corp"*; 2–19 → *"corpuri"*; 20–99 and 100 → *"de corpuri"*; 101 → *"corpuri"*.
- `everyBodyPhrase(1)` still reads *"singurului corp din bucătărie"*, never *"tuturor celor 1 corp"*.
- `describeBodyLabelAt` reads *"1 ușă"* at a one-door width and *"2 uși"* at a two-door width.

**Locale awareness — the criteria that make ADR 0001 decision 5 true**

- `<html lang>` is the resolved locale, never a literal.
- `/ro/d/<id>` and `/ru/d/<id>` load **the same design**. The locale segment reaches no persisted
  document, no save payload, no `revision`, and no cache key a design is read by. Falsify by loading
  one design under two locales and comparing the stored row and the revision before and after.
- `/api/*` and `/internal/*` carry no locale prefix; `/internal/scene-shot` still answers the shot
  rig unchanged.
- A locale the product does not ship is refused at the boundary — it does not 500 and it does not
  render half-translated.
- **Every screen the product has today renders end-to-end in Russian**, with no Romanian string
  surviving on it and no key path visible. This is the criterion decision 5 is judged on.
- The language switcher changes the locale without losing the design being edited or its unsaved
  state.

**Money and numbers**

- For the seeded kitchen, every rendered price string is byte-identical to HEAD under `ro`: the
  space-grouped *"43 000 MDL"* form, the *"De la"* prefix, tabular numerals.
- The round-up-to-the-thousand arithmetic runs in minor units and its inputs and outputs are
  unchanged. **A formatter never rounds.**
- Changing the locale changes only the rendering of a total, never the total. Falsify by pricing the
  seeded kitchen under both locales and comparing the minor-unit value.

**Tests**

- **No hardcoded customer-facing string survives anywhere in `apps/web/tests` or
  `packages/*/tests`**, fixtures included.
- Changing an owner-ruled Romanian sentence fails **exactly one** test — the copy lock — and no
  behaviour test. Falsify by editing one sentence in `ro.json` and running the suites.
- **The copy lock is an inline literal table.** `vitest -u` does not make an edited sentence pass.
  Falsify by editing a sentence and running the suite with `-u`; it must still be red.
- **A key added to `ro.json` with no line in the copy lock fails the lock.**
- **No test asserts `t(k) === t(k)`.** The 81 tautologies are converted to descriptor assertions, not
  deleted — the count of assertions over those surfaces does not fall.
- A translation missing a key, or dropping an ICU placeholder the source declares, fails the parity
  gate. Falsify by deleting a key and a `{label}` from `ru.json`.

**The owner's copy review (Gate O1)**

- At the moment the gate opens, **`messages/ro.json` is the only place a customer-facing Romanian
  string exists** in either `apps/web/src` or `packages/*/src`. The gate is falsified by 6B-j's rule
  finding one elsewhere — so the rule is written early enough to be run here, even if it is not
  enforced in CI until 6B-j.
- The owner is handed **rendered Romanian sentences, not JSON**.
- If the owner changes a string: the copy lock goes red, is updated in the same commit as the
  wording, and **the golden-output harness is re-baselined for exactly the changed keys, with the key
  list in the commit message**. A blanket re-capture of the harness is a phase-level defect — it
  erases the proof of behaviour-freedom for every wave before it.
- **6B-i does not start before the gate closes**, and the `ro.json` it translates is the one that
  came *out* of the gate. Falsifiable against the commit order: no key's Russian value predates its
  Romanian value's last owner-driven change.

**The owner's Russian check (Gate O2)**

- Every screen renders end-to-end in Russian before the gate opens — no surviving Romanian, no key
  path, no empty string.
- The owner is handed **rendered Russian sentences beside their Romanian source**, so the check is a
  comparison rather than a proofread.
- A Romanian sentence that did not translate cleanly is **reported as a finding at this gate**, never
  silently reworded. If the owner changes the Romanian in response, it is treated as an O1-class
  change: lock updated, harness re-baselined for those keys only, affected Russian re-translated.
- **The phase does not close with Gate O2 open.** M8's launch-gate line is a backstop re-sign, not a
  substitute for this review.

**The convention M7 and M8 inherit**

- `docs/best-practices/engineering-conventions.md` answers, without opening a milestone plan: where a
  new string goes, how it is keyed, how an ICU plural is written for Romanian, that every key lands
  in `ro.json` and `ru.json` in the same commit, what the copy lock requires, what the lint gate
  rejects, and which of the four test layers a new assertion belongs in.
- **The written rule and the lint gate do not disagree.** Falsify by taking each rejection the rule
  describes and confirming the gate rejects it.
- The zero-count plural is named in it as the worked example, so the defect that shipped explains the
  rule that prevents it.

**What must not happen**

- No behaviour a customer can observe changes in Romanian, on either viewport.
- No second content module appears beside `messages/`. A `ru.ts` next to a `ro.json` is the failure
  this phase exists to remove.
- **No agent marks a Russian string approved**, and no agent edits Romanian to ease a translation.
- No M7 or M8 copy is authored in this phase — including anything under `contactPlaceholder`, which
  is carried across as-is and not extended.

## Risks

- **The domain refusal seam is the real risk.** 34 codes, an eager render in every command result,
  two panel call sites. Mitigated by running it after the app-side extraction is settled and the
  harness is proven on easier waves, and by the Full tier.
- **The copy lock becomes a single point of failure for approved copy.** That is the deliberate
  consequence of the owner's ruling, and it is only safe if the lock cannot self-approve. Mitigated
  by the inline-literal rule, the whole-file rule, and an acceptance criterion that runs `-u` against
  it. **A later wave that "simplifies" the lock into a snapshot destroys the guarantee silently.**
- **Layer 3's accepted same-source comparison will be re-raised as a defect** by every reviewer who
  has read WORKFLOW:444 and not this plan. Mitigated by naming it in the dispatch.
- **next-intl against `next@16.3.2` is unverified.** A planning agent's knowledge does not settle a
  version matrix. Mitigated by making 6B-a verify before committing and by ADR 0095 naming the
  fallback in advance, so a failed check costs a day and not the phase.
- **~~Agent-drafted Russian is unreviewed wording in a customer-facing file.~~ Largely closed by the
  owner's authorisation, 2026-09-06**: the translation is agent-led *and* checked inside M6B at Gate
  O2 by someone who reads the language, rather than deferred to a launch checklist. What remains is
  smaller and specific: **an agent could translate fluently and wrongly in a domain-specific place** —
  a cabinet kind, a band name, a refusal that has a term of art in Moldovan kitchen retail. Mitigated
  by handing the owner Russian **beside its Romanian source** at O2 rather than alone, which makes a
  plausible mistranslation visible as a mismatch instead of reading as ordinary Russian.
- **The phase now parks on two owner reads, not one.** O1 and O2 are both hard stops with no deadline
  attached. Mitigated by O1 handing over rendered sentences and O2 handing over aligned pairs — both
  cheap to read — and by 6B-h being schedulable through O1. Nothing is schedulable through O2, which
  is the honest cost of the ruling and is accepted.
- **The catalogue-label wave reaches money.** ADR 0033's merge made two labels byte-identical on
  purpose and ADR 0066 split two that were identical by accident. A key rename that collapses them
  re-creates wave 6D's two-identical-descriptions defect. The harness sweeps every entry at every
  width for exactly this.
- **Routing rewrites the route tree with no `middleware.ts` to extend.** The saving grace is scale:
  four customer route families, and only 2 Romanian literals in e2e, so an e2e failure in 6B-b means routing
  rather than copy.
- **The phase is long and dull in the middle**, which is where a wave gets rubber-stamped. 6B-c is
  the one to watch.
- **Gate O1 is a stop with no deadline attached to it.** The phase parks on an owner's reading, and
  the only wave that can run through it is 6B-h. Mitigated by collecting the strings as early as the
  chain allows and by handing over rendered sentences rather than a file that is tedious to read;
  **not** mitigated by starting 6B-i speculatively, which is the tempting move and the wrong one.
- **The harness re-baseline at Gate O1 is the one moment the phase's central proof can be destroyed
  in one command.** A blanket re-capture would make every earlier wave's byte-identity claim
  vacuous, and it would look like a routine green. Mitigated by the recorded key list and by the
  rule that re-baselining is legal nowhere else in the phase.
- **The convention lands last, so the phase is largely built before its own rule is written down.**
  Deliberate — the rule must describe what shipped — but it means 6B-a … 6B-i are governed by this
  plan rather than by a convention. If the phase stalls after 6B-g, M7 inherits gates with no written
  rule beside them.
- **A translated string that changes layout.** Russian runs longer than Romanian; the price bar and
  the panel are tight. 6B-i's pseudo-locale lengthens strings deliberately so the problem is visible
  before real copy arrives; fixing a layout that Russian breaks is in scope for 6B-i, and fixing one
  that Romanian already breaks is not.

## Verification

- Per wave: `pnpm ci:local` (all nine gates), and the golden-output harness byte-compared against its
  M6-close capture. A wave that cannot show the harness green does not go to review.
- Phase close: `pnpm check`, `pnpm format:check` **whole-tree**, and the Playwright suite.
- Visual: one mobile and one desktop pass on `/ro/configurator/configure` after 6B-g against the M6
  close-out shots, and **one on `/ru/…` after 6B-i** — the Russian pass is a layout check, not a copy
  review.
- 6B-j's gate is verified by **introducing** a Romanian literal in a scratch file and confirming the
  gate fails, then removing it. A gate never run is not a gate.
- The copy lock is verified by editing a sentence and running the suite **with `-u`**, confirming it
  stays red. A lock never attacked is not a lock.

## Open questions gating the phase

1. **~~Does an empty kitchen read *"0 corpuri"* or *"0 de corpuri"*?~~ Closed by the owner,
   2026-09-06: *"one is plural, it's needed to be used instead of '0 de corpuri' => '0 corpuri'"*.**
   **CLDR wins**; zero takes `few`, the plain plural. The shipped `pluraliseBodies` is wrong at zero
   and so are the two comments above it, which assert the wrong rule as settled fact — **all three
   are 6B-d's, and the comments are the half that matters**, since they are what would persuade the
   next reader to restore the defect. Kept as a struck entry rather than deleted, because the
   *mechanism* generalises: a hand-written plural rule diverging from CLDR at one value is what ICU
   exists to prevent, and it is the worked example 6B-j's convention is built around.
2. **~~Who supplies the Russian copy?~~ Closed by the owner, 2026-09-06, in two steps.** First:
   *"we can keep romanian as the main and translate the rest"*. Then, decisively: *"for me it's okay
   that you will translate it to Russian, because I know Russian also, so I can check. But
   translation, you can lead the translation."* **The translation is agent-led and the owner is its
   reviewer**, at Gate O2, inside this phase. `ARCHITECTURE_PROPOSAL.md:774`'s *"translation
   ownership and approved copy remain inputs"* is honoured by O2 — which is the real check — with a
   backstop re-sign on M8's launch gate. **No professional-translator dependency, and no empty
   Russian slot.**
3. **Is English a shipped locale?** — **owner clarification, gates nothing; the default answer is
   no.** The 2026-09-06 ruling names *"English, Russian and any later locale"* as translations of
   Romanian without saying whether English is served. No record requires it — ADR 0001 decision 5
   names Romanian and Russian only. **The phase ships `ro` and `ru`, and adding `en` afterwards is a
   data drop into a proven pipeline**, which is the whole point of the machinery.
4. **~~Do the price book's six Romanian `description` values translate as copy or as data?~~**
   **Corrected by the 2026-09-07 implementation audit.** The current tree has eight descriptions,
   plus tier/accessory display names, and they reach customer-visible screens. Numeric rates and
   manufacturer records remain data; displayed prose becomes message descriptors so `/ru/…` does
   not leak Romanian. Existing Romanian moves byte-for-byte and Russian stays unapproved until O2.

## What this phase hands on

- **To M7 and M8:** a written convention in `docs/best-practices/engineering-conventions.md` — not a
  milestone plan — plus two gates that enforce it. Author copy as keys in `messages/ro.json` **and
  `ru.json`** from the first commit; 6B-j's lint rule enforces the first, 6B-a's parity gate the
  second. **The point of running M6B here is that neither phase has to be told twice, and neither has
  to re-derive the rule from a plan that went stale when this phase closed.**
- **To M8's launch gate:** a **backstop re-sign** on the Russian wording, beside SEC-001 —
  confirmation that what ships is still what was approved, after M7 and M8 have added copy of their
  own. **It is not the substantive review**: that happened at Gate O2 inside this phase, by an owner
  who reads the language. ADR 0001 decision 5 is closed by M6B; the launch line is a check, not a
  debt.
