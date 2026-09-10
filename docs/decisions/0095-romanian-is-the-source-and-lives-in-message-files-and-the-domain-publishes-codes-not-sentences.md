# ADR 0095 — Romanian is the source and it lives in message files; the domain publishes codes, not sentences

Status: Accepted
Date: 2026-09-06
Type: Decision (implements [ADR 0001](0001-initial-product-and-stack.md) decision 5; supersedes M3
work item 2's *"both, never a choice"* placement of the refusal sentence)
Milestone: M6B — internationalization; the phase plan is
[`docs/milestones/M6B-internationalization.md`](../milestones/M6B-internationalization.md)

## What was asked

Two questions, handed over with the M6B brief, both of which had to be **decided rather than
inherited**:

1. **What do the literal-pinning tests assert once a string is reached by a key?** This project's
   standing rule since wave 6D is that *every owner-ruled string is pinned by a literal*. Keys change
   what those tests pin, and pinning the Romanian literal is what stops a translation silently
   changing approved copy.
2. **Does locale routing and `Intl` currency/number formatting land in this milestone or a later
   one?** Message files alone do not satisfy ADR 0001 decision 5 — nothing in the product is
   locale-aware today.

A third question was not asked and is decided here because the measurement forced it: **the app is
not the only place Romanian is written.** See *The measurement* below.

## Status of the requirement being implemented

This ADR implements a requirement, it does not create one. [ADR 0001](0001-initial-product-and-stack.md)
decision 5 — *"Launch with Romanian as the default locale and Russian as a supported locale"* — was
**Accepted 2026-08-20 and has never been superseded**. It was swept for before deciding, per the
standing rule that a dated record is never silently overturned: ADR 0001 is the only record on the
subject and nothing in ADRs 0002–0094 narrows, defers or contradicts it.

Three further records already carried the same intent, none of them enforced:

- `docs/best-practices/engineering-conventions.md:61` — *"Keep user-visible copy in the project's
  localization/content system. Add every required locale at the same time; do not hardcode
  one-language fallbacks in components."*
- `docs/brand.md:30` — the voice is *"equally native in Romanian and Russian"*.
- `docs/ARCHITECTURE_PROPOSAL.md:774` decision 5 — *"Romanian is default and Russian is supported;
  translation ownership and approved copy remain inputs."* That last clause is load-bearing and is
  honoured below: this ADR rules on machinery, never on Russian words.

The owner's two rulings of 2026-09-06 add the **shape**, not the requirement: use the international
standard for translations and address strings by short code; and **Romanian stays the source
language**, with English, Russian and any later locale as translations of it.

## The measurement

Counted directly on the tree, 2026-09-06, at `4c166c5`. The M6B brief's figures are corrected where
they were off; the corrections make the phase **larger**, not smaller.

| Fact | Brief said | Measured | Note |
| --- | --- | --- | --- |
| `apps/web/src/content/ro.ts` | 603 lines | **603 lines** | confirmed |
| top-level groups | 8 | **8** plus `brand` as a bare string at the root | `brand` is a ninth entry, not a group |
| plain string entries | 59 | **59** | confirmed |
| function-valued entries | 16 | **17** | one more than reported |
| nested groups | 11 | 11 | not re-counted independently; not load-bearing |
| files importing `ro.ts` | "48 import sites" | **44 files, 45 occurrences** | 11 in `src`, 33 in `tests` |
| test files asserting its literals | 39 | **39 literal assertions** across **32 files** | the 39 is a count of assertions, not files |
| `ro.` self-referential assertions in tests | not counted | **81** | these are tautologies today and are the larger half |
| Romanian in `apps/web/tests/e2e` | not counted | **2 literals** | e2e is almost entirely test-id driven — a real de-risk |
| i18n dependency | none | **none**; no `middleware.ts` either | confirmed |
| customer-facing routes | not counted | **5** (`/`, `/configurator/configure`, `/configurator/contact`, `/d/[id]`, plus `/internal/scene-shot`) and 3 API routes | routing is small |

**And the finding the brief did not have.** `apps/web/src/content/ro.ts` is not the only content
source. `packages/configurator-domain/src` renders Romanian *sentences* for customers:

- `commands/rejection.ts` — **507 lines, 34 refusal codes**, and `renderRejection` composes roughly
  forty Romanian sentences with interpolation, quoted labels and grammar
  (`renderWidthsMadeClause`, *"între 200 și 800 mm"* / *"doar în 450 sau 600 mm"*).
  `commands/command-result.ts:198` renders it **eagerly** into every command result:
  `reason: { ...detail, message: renderRejection(detail) }`.
- `catalog.ts` — `BASE_CABINET_LABEL_RO`, `UNKNOWN_KIND_LABEL_RO`, a **17-entry `KIND_LABELS_RO`**
  map, roughly a dozen `label:` strings on catalogue entries, and `describeBodyLabelAt`, which
  appends the Romanian door count — `` `${name} ${doors} ${doors === 1 ? "ușă" : "uși"}` ``.
- `bands.ts` — `BAND_LABELS_RO` (4 entries), read by `catalog.ts` and by §9's header.
- `queries/describe-selection.ts` — `EMPTY_SLOT_LABEL_RO = "Spațiu liber"`.
- `pricing/sample-price-book.ts` — 6 Romanian tier/material **descriptions**, which are commercial
  data rather than UI copy.

`packages/configurator-domain/tests` carries **13 assertions on Romanian literals** across a
74-file suite. `packages/three-adapter/src` has **no** Romanian outside comments.

So the honest size of the phase is `ro.ts` **plus** a domain package that speaks Romanian.

## Decision

### 1. The standard is ICU MessageFormat; the library is next-intl, subject to a compatibility gate

**ICU MessageFormat (Unicode CLDR) is the format**, and it is the part of this decision that is not
negotiable: it is the standard the owner's instruction names, and it is the only one of the
candidates that expresses the seventeen interpolated entries and Romanian's three-band plural without
hand-written branching. Messages are addressed by **short dotted key** — `panel.handleDefaultNote` —
exactly as the owner asked.

**next-intl is the chosen library**, on these grounds against the alternatives:

| Candidate | Ruled |
| --- | --- |
| **next-intl** | **Chosen.** App-Router native, per-locale JSON, namespaced keys, ICU syntax, server- and client-component support, and a generated TypeScript declaration that makes an unknown key a **compile error** rather than a blank label at runtime. That last property is why it beats the rest: this project's failure mode is silent drift, and a typechecked key catalogue converts drift into a red gate. |
| **react-intl / FormatJS** | Rejected. Same ICU engine, but its App-Router story is provider-plumbing the app writes itself, and its key safety is opt-in tooling rather than a build artefact. |
| **Lingui** | Rejected. Its macro/extraction model is built around *source-text-as-key*, which is the English-source shape the owner explicitly ruled against. Using it with Romanian source keys fights the tool. |
| **next-i18next / i18next** | Rejected. Pages-Router lineage; ICU is a plugin rather than the format; two migrations for one need. |
| **Hand-rolled `intl-messageformat` loader** | Rejected. Cheapest to start, and it re-creates the routing, negotiation, fallback and type-generation this decision needs, with none of it gated. The project already carries one hand-rolled content module and this ADR exists because of it. |

**The compatibility gate.** The tree is on `next@16.3.2` and `react@19.2.0`. next-intl's support for
that exact pair **has not been verified here** — a planning agent's knowledge does not settle a
version matrix, and asserting it would be exactly the "report only what you ran" violation the
project forbids. Wave 6B-a therefore **verifies before it commits**: install, build, typecheck, and
render one namespace on both a server and a client component. **If it does not hold on `16.3.2`, the
fallback is FormatJS's `intl-messageformat` behind the app's own thin `t()` seam, keeping ICU and the
key catalogue and losing only the generated declaration** — which then becomes a hand-written union
type and a gate. The format survives either way; only the library is provisional.

### 2. Every string is reached by a key, in tests too — and approved copy is pinned in exactly one place

**The owner's ruling, 2026-09-06:** *"every hardcoded string even in tests should be replaced"*. So
wave 6D's rule — *every owner-ruled string is pinned by a literal* — cannot stay where it is: no
ordinary test may carry a Romanian sentence. **The rule is kept and moved to exactly one place.** It
is not weakened, and this section records why the single pinning point is deliberate rather than an
oversight, because a later reader will otherwise read it as one.

**The hazard the ruling creates, named before it is designed around.** If a test asserts
`t("panel.finishTitle")` and the component renders `t("panel.finishTitle")`, both sides are fed by
`ro.json` and the assertion cannot fail for the reason it was written. That is precisely
`docs/WORKFLOW.md:444`, *"The commonest weak guard: both sides fed by the same source"* — *"It
passes, it looks specific, and it cannot fail for the reason it was written."* That document records
**three such guards found in a single wave on 2026-09-03**, each of which read as thorough; and
`docs/STATUS.md` records that of the five waves certified on 2026-09-05, **three came back CERTIFIED
WITH FINDINGS**. This project does not get to assume it would notice.

WORKFLOW's own cheap check — *"ask what else could supply the expected side"* — is the design rule
below.

**The invariant to preserve, stated so it can be checked:** *a translator or an agent cannot change
approved Romanian copy without it showing up as a failing test that a human must consciously
accept.*

**Four layers, each answering a different question, and only one of them is about wording.**

1. **The copy lock — the only wording guard.** One test holds a literal, key-by-key table of every
   owner-ruled Romanian sentence and compares it to `apps/web/src/messages/ro.json`. Changing any
   approved sentence fails **exactly this test**, in a diff whose two sides are the new wording and
   the approved wording, side by side. It is the deliberate, visible acceptance the ruling requires.
   - **It must be an inline literal table, never `toMatchSnapshot`.** A snapshot is self-approving:
     `vitest -u` rewrites it, and an agent told to make the suite green will run `-u`. That converts
     the one guard that protects approved copy into a guard that rubber-stamps its own replacement.
     This is a new rule; the project has no snapshot policy today.
   - It is a **whole-file** lock, not a subset: a key added to `ro.json` without a line in the lock
     fails it. Otherwise the guard decays silently as the catalogue grows.
2. **Descriptor assertions — the key-selection guard.** A model that publishes text publishes
   `{ key, params }`; its tests assert the descriptor. **These are not fed by `ro.json` at all**, so
   they are immune to the hazard, and they detect the failure a prose assertion never could: the
   surface choosing the *wrong* message. This is the layer that replaces the 81 tautologies.
3. **Resolution assertions — the wiring guard, and it is only that.** Component, DOM and e2e tests
   assert that the rendered node carries the catalogue's value for the expected key, and that **no
   key path and no empty string reached the DOM**. Both sides are fed by `ro.json` here by nature.
   **That is accepted, and it is recorded as accepted**: this layer proves the resolver ran and the
   right key was requested, never that the wording is right. Layer 1 owns wording. A reviewer who
   finds a same-source comparison in this layer has found the design, not a defect — and one in
   layers 2 or 4 has found a defect.
4. **Structural gates — the translation guard.** **Translations are never pinned by literal**;
   pinning a Russian sentence would freeze a translator out of their own file, and Russian wording is
   not this project's to approve line by line. Non-source locales are gated on structure instead:
   **completeness** (every source key present), **ICU placeholder parity** (a translation that drops
   `{label}` or invents `{name}` fails), and **no silent fallback** (a missing message falls back to
   Romanian and fails a build-time check — it must never render a key path, an empty string, or
   English).

**What this buys, said plainly:** an agent editing `ro.json` to make a layout fit, or a translator
editing the wrong file, turns exactly one test red, and that test's failure output *is* the copy
review.

### 3. The domain publishes a code and its parameters; it no longer publishes a Romanian sentence

`packages/configurator-domain` becomes **locale-free**. It exports no Romanian string reachable by a
customer, and it imports no i18n library — it stays I/O-free and gains no locale argument.

- `RejectionReason` loses `message`. `command-result.ts` stops calling `renderRejection`.
  `RejectionDetail` — a discriminated union of **34 codes with typed parameters** — is already
  exactly an ICU call site, and each code becomes the key `rejection.<CODE>` with `params` as its ICU
  arguments.
- `KIND_LABELS_RO`, `BAND_LABELS_RO`, `EMPTY_SLOT_LABEL_RO`, `UNKNOWN_KIND_LABEL_RO` and the
  catalogue's `label:` fields become **keys**. `describeBodyLabelAt` publishes a descriptor rather
  than a composed sentence, and its `ușă`/`uși` becomes an ICU plural.

**This supersedes `rejection.ts`'s head comment and M3 work item 2** — *"Every way a command can
refuse, as a stable code, its parameters, and a Romanian sentence. Both, never a choice."* Recorded
explicitly, because a rule is not overturned by drift.

**The intent of that rule survives intact and is why the supersession is safe.** Its stated reason
was: *"A code with no sentence forces the panel to author product copy, and a sentence with no code
forces tests to match on prose."* Under this decision the panel still authors no copy — it resolves a
key whose message lives in `ro.json` — and tests still match on codes, not prose. What changes is
**where the sentence is written**, not whether one exists. The failure the M3 rule guarded against is
additionally now a **compile error**: a code with no key does not typecheck.

~~The price book's six Romanian `description` values are data, not UI copy, and stay
Romanian-only.~~ **Narrowed by Amendment B:** the current tree has eight descriptions plus
tier/accessory display names, and this prose reaches customer-visible screens. Numeric rates and
manufacturer records remain locale-free data, while displayed names and descriptions publish
message descriptors and are resolved by the app. Existing Romanian values move byte-for-byte;
Russian remains an unapproved draft until Gate O2.

### 4. M6B implements i18n, not a file extraction — and ADR 0001 decision 5 closes with it

**The owner's ruling, 2026-09-06:** *"need to add in code also the internalization, meaning
implementing i18n"*. M6B is therefore not a milestone that moves 603 lines into a JSON file and
leaves a monolingual product behind. **ADR 0001 decision 5 must be satisfied when M6B closes, not
still owed.**

Message files alone would be a false close: `layout.tsx:22` hardcodes `<html lang="ro">`,
`price/starting-price.ts` bakes in `MDL` and the space grouping, and `configure.step` is the fixed
sentence *"Pasul 2 din 4"* with its own step numbers written into the words. So all of the following
are in:

- **The library, wired in**, on both server and client components — not a helper the app hand-rolls.
- **Routing shape: a path segment for every locale, including the default** — `/ro/…`, `/ru/…`. The
  asymmetric variant, where the default locale is unprefixed, produces two URL shapes for one screen
  and is rejected on that ground. The unprefixed root negotiates from cookie then `Accept-Language`
  and redirects. `/api/*` and `/internal/*` are **never** prefixed.
- **A shared design link's locale is presentation, never identity.** `/ro/d/<id>` and `/ru/d/<id>`
  load the same design. The locale segment must not reach the persisted document, a save payload, the
  design's `revision`, or any cache key that a design is read by.
- ~~**`Intl` number and currency formatting**~~, and the baked-in cases fixed: `MDL` becomes a
  formatted currency rather than a literal suffix, and *"Pasul 2 din 4"* becomes a parameterised
  message whose step numbers are arguments. **Formatting is rendering only.** ADR 0001 decision 4's
  rounding stays in **minor units** in `starting-price.ts` and is not routed through `Intl` — a
  formatter that rounds is a formatter that changes a price.
  **`Intl` is narrowed out of `price/` entirely by Amendment C** — the baked-in cases are still
  fixed, by a catalogue leaf rather than by a formatter.
- **A complete Russian message file and the language switch**, which is what makes decision 5 true
  rather than possible. Confirmed by the owner, 2026-09-06: *"Russian is in scope … this milestone
  should include all the infrastructure, all the logic, for the internationalization. Yeah, it will
  take more, but it should cover everything related to internationalization."* **The size is
  accepted, so the phase is not to be trimmed to look smaller.**

**On the Russian wording — agent-led translation, owner-reviewed, in an ordered chain.** The owner
authorised it directly, 2026-09-06: *"after I will have the correct Romanian strings corrected by me
— for me it's okay that you will translate it to Russian, because I know Russian also, so I can
check. But translation, you can lead the translation."* So the copy path is a **four-step chain, and
its order is the decision**:

1. Extraction collects every Romanian string into `messages/ro.json`.
2. **Gate O1** — the owner reads and **corrects** the Romanian. A hard stop.
3. An agent translates `ru.json` **from the corrected Romanian**. This is a gate on the translating
   wave, not a sequencing note: dispatched against a pre-review `ro.json`, every correction made at
   O1 orphans a Russian sentence and the translation is done twice.
4. **Gate O2** — the owner checks the Russian. They read the language, so this is substantive.

`docs/ARCHITECTURE_PROPOSAL.md:774` has recorded since M0 that *"translation ownership and approved
copy remain inputs"*, and it is honoured by **Gate O2 inside M6B** — not by a deferral. M8's launch
gate keeps a **backstop re-sign** beside SEC-001, confirming that what ships is still what was
approved after M7 and M8 add their own copy. **The two are not equivalent, and which is which is part
of this decision:** O2 is the real review, because a correction there costs a round while the wave is
open; M8's line is a check. **An owner asked only at M8 is the shape this decision rejects** — a
phase that defers its only copy review to a launch checklist is how decision 5 went six milestones
unowned.

**Two prohibitions stand unchanged.** No agent marks a translation approved. No agent edits Romanian
to make a translation easier — an awkward source sentence is a finding reported at O2, where the
owner, who holds both languages, decides whether the Russian bends or the Romanian does.

Deferring routing and `Intl` was considered and rejected on its own merits as well as by the ruling:
it would defeat the phase's sequencing rationale, since M7 and M8 add two whole screens of copy and
cannot author keys natively into a product that has no locale.

### Amendment A — Gate O1 closes and translation moves first (2026-09-07)

The owner completed the Romanian review with a 13-line edit set in
`apps/web/src/messages/ro.json`, closing Gate O1. Semantic JSON comparison measures 12 changed leaf
values; the thirteenth line was a byte-identical value with trailing whitespace. The semantic values are owner-authored input and are the
only source for the Russian draft; an agent must not normalise, reinterpret or silently undo them.

The owner then explicitly directed: translate that corrected catalogue into Russian next, and
continue through the milestone afterward. This newer sequencing ruling supersedes the phase plan's
original dependency order and its earlier wait for M6's formal close. It splits execution of 6B-i,
not its acceptance gate: the complete `ru.json` is drafted first; 6B-a through 6B-h then land; 6B-i
finishes the switcher, pseudo-locale and end-to-end Russian rendering and receives its Full-tier QA
and review as one wave. Gate O2 remains the next hard owner stop, and Russian remains explicitly
unapproved until that review.

### Amendment B — implementation audit corrections (2026-09-07)

Three implementation facts refine this decision without changing its intent.

First, Next 16 already routes all dynamic requests through `apps/web/src/proxy.ts`, where the CSP
nonce and enforcing request header are created. Locale negotiation extends that one proxy and must
preserve its security headers on redirects, rewrites and pass-through responses. The phase does not
add `middleware.ts` or a second proxy.

Second, the golden-output harness stores a key-to-SHA-256 manifest rather than a second corpus of
Romanian literals. The whole-file inline copy lock remains the single wording authority; hashes
detect behavioural output drift without contradicting the owner's rule that no other test embeds
customer copy. Gate O1 happened before the harness existed, so the manifest is seeded from the
corrected source catalogue and the 12 semantic owner changes are recorded. No M6-close recapture is
claimed.

Third, decision 3's commercial-data exemption is narrowed. The implementation audit found eight
Romanian price-book descriptions and tier/accessory display names that reach the settings and price
breakdown screens. Keeping that prose Romanian-only contradicts the accepted end-to-end Russian
criterion. Numeric rates and manufacturer records remain locale-free data, while every displayed
name and description becomes a message descriptor resolved by the app. Existing Romanian values
move byte-for-byte and the Russian translations remain unapproved until Gate O2.

## Consequences

- The phase is larger than `ro.ts`. Three of its ten waves are in `packages/configurator-domain`,
  and they are among the risky ones.
- **The phase closes ADR 0001 decision 5.** After M6B, nothing is owed but the owner's sign-off on
  the drafted Russian wording, which is a review line on M8's launch gate rather than engineering.
- Two test conventions change at once — the copy lock and the descriptor boundary — so the wave that
  lands them lands **before** any extraction, and extraction is verified against them.
- **The copy lock is now the single point of failure for approved Romanian copy**, which is the
  deliberate consequence of the owner's ruling that tests carry no literals. It earns a
  correspondingly hard rule: an inline literal table, whole-file, never a snapshot. A future wave
  that "simplifies" it into `toMatchSnapshot` destroys the guarantee silently and must be refused.
- **A same-source comparison in a resolution test is the design, not a defect** (decision 2, layer
  3). Recorded here because `docs/WORKFLOW.md:444` teaches reviewers to flag exactly that shape, and
  a reviewer with no pointer to this decision will keep re-raising it.
- Every wave from 6B-c onward is verified against a **golden-output harness** captured at M6's close:
  every string `ro.ts` produces, `renderRejection` over all 34 codes, and `describeBodyLabelAt` over
  every catalogue entry at every offered width. Romanian output must be **byte-identical** after each
  wave. This is what makes the mechanical waves provably behaviour-free rather than plausibly so.
- **One divergence from CLDR was exposed by this decision and is now ruled.** `pluraliseBodies`
  (`apps/web/src/content/ro.ts:8`) renders **zero** as *"0 de corpuri"*, while CLDR's `ro` plural rule
  selects `few` at zero. The owner ruled on 2026-09-06: *"one is plural, it's needed to be used
  instead of '0 de corpuri' => '0 corpuri'"*. **CLDR wins.** The fix is three parts, not one — the
  function, and the two comments at `ro.ts:4-7` and `ro.ts:15-19` that assert the wrong rule as
  settled fact (*"is the truth about an empty kitchen"*). **The comments are the half that matters**:
  code is corrected by a test, a confident wrong comment is what restores the defect. It is also the
  worked example the phase's written convention is built around — a hand-written plural rule
  diverging from CLDR at exactly one value is what adopting ICU is for.
- **The collected Romanian gets an owner review before any translation begins** (owner input,
  2026-09-06: *"let me know when all strings are collected in the language file so I will take a
  look."*). It is a hard stop in the phase plan, not a courtesy. Its one architectural consequence is
  recorded here because it can silently undo the phase: an owner-approved wording change legitimately
  breaks the golden-output harness, so **the harness may be re-baselined at that gate and nowhere
  else, for the changed keys only, with the key list recorded in the commit**. A blanket re-capture
  makes every earlier wave's byte-identity claim vacuous while looking like a routine green.
- **The phase leaves a written convention behind, in `docs/best-practices/engineering-conventions.md`
  rather than in a milestone plan** (owner, 2026-09-06: *"next milestones will require to implement
  all the strings, all the texts in the same way … it's important to do correct from start"*). A
  milestone plan goes stale when its phase closes; `engineering-conventions.md:61` already carries the
  one-line version and is read by every implementer. It lands with the lint gate, because the rule and
  its enforcement must not be able to disagree, and last, because it has to describe what actually
  shipped.

## Alternatives considered

- **English as the source language.** Rejected by the owner, 2026-09-06, after being shown the cost:
  *"for translations, yeah, we can keep romanian as the main and translate the rest."* Every
  owner-ruled Romanian sentence would have round-tripped through English on its way to becoming a
  key, and this project has ADR-recorded copy the owner asked not to be tidied
  (`configure.overflowWarning`, ADR 0065 decision 7b). Not revisited.
- **Keep `ro.ts` and add `ru.ts` beside it.** Rejected. It satisfies ADR 0001 decision 5 on paper
  while keeping the shape `engineering-conventions.md:61` forbids, has no plural or interpolation
  standard, no completeness gate, and no way to stop the two files drifting.
- **Leave the domain rendering Romanian and translate only `ro.ts`.** Rejected. It would close the
  phase with ~40 untranslatable customer sentences still hardcoded in the domain, and it makes
  `renderRejection` the exact hardcoded one-language fallback the phase exists to remove.
- **Defer routing and `Intl` to a later phase.** Rejected by the owner's ruling, and independently on
  its merits. It was considered seriously, since routing touches every route; the route inventory is
  **five customer routes**, which makes the deferral's saving small and its cost (M7 and M8 authoring
  into a locale-unaware product) large.
- **Ship the machinery with a pseudo-locale and leave Russian to the owner.** Rejected. It was this
  ADR's first position, on the ground that approved copy is an owner input — and it closes M6B with
  ADR 0001 decision 5 still owed after six milestones of it being owed, which is the exact failure
  this phase exists to end. The owner's ruling settles it: translate, and route the wording through
  review rather than through a deferral. The pseudo-locale survives as a **length-stress tool** in
  wave 6B-i, not as a substitute for a locale.
- **Let ordinary tests keep asserting Romanian literals, so the wording guard stays distributed.**
  Rejected by the owner's ruling. It is also the weaker design: 39 literal pins spread over 32 files
  guard whichever sentences someone happened to assert, in no recorded order, while 81 assertions
  beside them are tautologies. One whole-file lock covers every key by construction. **The
  distributed version looks stronger and covers less.**

### Amendment C — `Intl` is not the mechanism for money, because it contradicts the mockups (2026-09-10)

**Decision 4 committed to `Intl` before anyone ran it.** Measured on this repository's runtime,
against `143000`:

| locale | grouping | currency |
| --- | --- | --- |
| `ro` | `"143.000"` — a **period** | `"143.000,00 MDL"` |
| `ro-MD` | `"143.000"` | `"143.000,00 L"` — not `MDL` |
| `ru` | `"143 000"` — U+00A0, not U+0020 | `"143 000,00 MDL"` |

What ships and what the mockups draw is **`143 000 MDL`**: an ASCII space, the currency after the
amount, no decimals. `Intl` disagrees on the separator, on the currency symbol, and — for Russian —
on the codepoint. `price/starting-price.ts:56` had already recorded the reason in a comment before
this was measured: *"The mockups group with a space … and grouping is done here rather than through
`Intl`."*

[ADR 0003](0003-design-reference-supersession.md) and
[ADR 0104](0104-the-mockups-are-the-chrome-specification-and-the-strips-own-row-is-withdrawn.md)
make the mockups the specification for this screen. A formatter that renders `143.000` where the
approved design says `143 000` is not a localisation improvement; it is an unapproved copy change
arriving through a library. **The higher ruling wins, and decision 4 is narrowed rather than
reversed.**

**So, for wave 6B-g:**

1. **No `Intl` identifier anywhere under `apps/web/src/price/`.** Falsifiable by grep, and 6B-g
   carries it as a criterion.
2. **The thousands separator stays an ASCII space**, as the product constant it already is.
   `THOUSANDS_SEPARATOR` does not move.
3. ***"`MDL` stops being a literal suffix"* is still satisfied, and better than `Intl` would have.**
   The join becomes a catalogue leaf — `price.amountWithCurrency`, `"{amount} MDL"` — so the
   currency's name, its position relative to the amount, and whether Russian says *MDL* or *лei*
   become **translatable decisions the owner rules at Gate O2**, instead of a library's opinion
   about `ro-MD` that nobody chose and that renders `L`.
4. ADR 0001 decision 4's rounding is untouched, in minor units, as decision 4 already required.

**What this costs, said plainly:** per-locale digit grouping is now a product constant rather than a
CLDR lookup, so a future locale that groups differently — Indian lakh, say — would need a decision
rather than working for free. No planned locale does; both `ro` and `ru` group in threes. That is a
real limit and it is accepted knowingly, which is the opposite of discovering it after a formatter
silently rewrote an approved figure.

**Shipped 2026-09-10 at `cb66896`**, exactly as narrowed: only the join moved, and the golden
manifest went 300 → 303 hashes with none moved. **One thing this leaves for Gate O2, stated so it is
not mistaken for a translation gap**: `ru.json` carries the same value as `ro.json`,
`"{amount} MDL"`. Point 3 above is what makes that the owner's to rule rather than a library's — the
leaf exists precisely so *MDL* against *лей*, and the currency's position, can be decided at O2.
