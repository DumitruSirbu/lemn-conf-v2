# Engineering conventions

Apply these according to the stack selected for the new project. They are conventions, not a reason
to force a framework or abstraction before the architecture exists.

## Named principles behind these conventions

The rules below are this project's concrete expression of DRY, KISS, and the applicable parts of
SOLID. Naming them explicitly here so the connection survives even for a reader who only has this
file, not a Claude session's global conventions.

- **DRY** — "Give domain constants a name, unit, and reason" and the general boundary rules below
  exist so geometry, pricing, and validation logic live in one testable place, never copied across
  the UI and the domain.
- **KISS** — do not add an abstraction, layer, or configurability the current milestone's acceptance
  criteria do not require. A narrow, explicit function beats a generic one built for a future case
  that is not yet specified. This is also why implementation dispatches stay small (see
  `docs/agents/developer.md`): a five-item, five-file dispatch is easier to keep simple than an
  open-ended one.
- **SOLID, the parts that apply to this stack:**
  - *Single Responsibility* — "Keep UI rendering thin" and "Separate mutation from derived queries"
    are this project's SRP: a component renders, a domain command decides, a query derives, and none
    of the three does another's job.
  - *Open/Closed* — the catalog/layout-policy/pricing versioning strategy (`CONFIGURATION_MODEL.md`,
    `ARCHITECTURE_PROPOSAL.md` §5.1) is the concrete OCP mechanism: new catalog data or a new
    layout policy is added as a new version, not by editing an old one's accepted behaviour in place.
  - *Dependency Inversion* — `configurator-domain` accepts plain data and returns plain data or an
    explicit failure; it depends on no concrete UI, renderer, or storage implementation, which is
    what makes the three.js adapter and the persistence adapter swappable behind it.
  - *Liskov Substitution and Interface Segregation* are largely **not applicable** here on purpose:
    the domain is function/data-oriented (Zod schemas, plain commands returning `{ok}` /
    `{ok:false, reason}`), not a class hierarchy, so there is no inheritance substitutability or
    fat-interface problem to guard against. Do not introduce a class hierarchy in order to have
    something to apply these to.

## Code and domain boundaries

- Name values clearly: verbs for functions, nouns for types, and `is`/`has`/`can` for booleans.
- Give domain constants a name, unit, and reason. Never hide geometry, pricing, timeout, or limit
  assumptions as unexplained literals.
- Keep UI rendering thin. Put pricing, geometry, constraints, and validation in testable domain
  modules with no UI dependency.
- Separate mutation from derived queries. Keep persistence, network I/O, and other side effects out
  of state-reducer/action logic where the chosen architecture allows.
- Validate untrusted data at every system boundary. Derive static types from runtime schemas when a
  schema library is used, rather than maintaining parallel definitions.
- Prefer explicit named input objects when a function would otherwise take several positional
  values. Avoid boolean flags that change a function's purpose.

## Numeric and geometry work

- Declare the unit at module boundaries and convert deliberately. Do not compare accumulated
  floating-point values with strict equality without a tolerance or normalized grid.
- Test transitions on both sides of every threshold. Verify generated geometry has the required
  anchors, clearances, and non-overlap properties.

## UI and content

- Centralize design tokens and feature conventions once a UI system exists; avoid scattered,
  untraceable values.
- Keep user-visible copy in the project's localization/content system. Add every required locale at
  the same time; do not hardcode one-language fallbacks in components.
- Design visible flows mobile-first or verify their small-viewport behaviour explicitly. Do not
  rely on hover-only controls for required interaction.

### Localised copy — what to do when you need a new string

The bullet above says *what*; this says *how*, for this codebase, as milestone M6B shipped it. Read
it before adding a sentence, a label, a placeholder or an error message. It is not advice — each
point below names the check that fails when it is broken, except **point 2's namespace shape, which
no machine checks**: that one is a review item.

**1. There is exactly one legal place for a customer-visible string: `apps/web/src/messages/ro.json`,
with its translation in `ru.json`.** Not a component, not a `content/*.ts` module, not a domain
constant, not a default parameter, not a test fixture. `apps/web/src/i18n/content.ts` is the only
module that turns a key into a sentence, and `next-intl` is the only thing that reads the files.
**Romanian is the source language**; every other locale is a translation of it, and a Romanian
sentence a person approved is never re-authored to make a translation easier — that is a finding to
report, not an edit to make.

**2. A key is `namespace.leafName`, and a namespace mirrors a surface rather than a component tree.**
The shipped namespaces are `brand`, `meta`, `configure`, `panel`, `price`, `priceBreakdown`,
`globalSettings`, `webglUnavailable`, `designLoadError`, `contactPlaceholder`, `band`, `finish`,
`priceBook`, `catalog` and `rejection` — a customer can point at almost every one of them. A string
that moves from one component into another keeps its key when the customer still reads it in the
same place; a string that moves to a different screen changes namespace. Leaf names are `camelCase`
and name the string's **job**, not its words: `configure.overflowWarning`, never
`configure.dulapurileMarcate`. Add a namespace for a new surface (M7's room screen wants one); do not
nest a fourth level to mirror a folder.

**3. Interpolation and plurals are ICU, and a Romanian plural is CLDR's `one` / `few` / `other`.**

```
"countForBody": "{count, plural, one {# dulap} few {# dulapuri} other {# dulapuri}} {bandWord} …"
```

Never branch a plural in TypeScript, and never add a `=0` arm because zero feels like a special case.
**The worked example, which is why this is a rule rather than a preference:** Romanian CLDR puts
**0 in `few`**, so the message above renders *"0 dulapuri"* — and that is what the owner ruled on
2026-09-06. The hand-written helper it replaced carried a comment claiming zero took the *"de"* form,
and a `=0` arm written from that comment would have shipped *"0 de dulapuri"*. A second owner ruling
on 2026-09-10 (*"without «de» on plural"*) put the bare noun in `other` too, so 20 and 100 read
*"20 dulapuri"*. Both rulings are properties of the CLDR arms, which is exactly why they survive:
there is no branch left to get wrong. **Note, 2026-10-20 (owner ruling O17): kitchens now differ from
cabinets.** Cabinets stay the bare noun in every arm; kitchens take *"de"* from twenty up (*"20 de
bucătării"*), written in the ICU `other` arm. The 2026-09-10 ruling above is kept as history for
cabinets. Numbers are `{n, number, ::group-off}` where the mockups show
no group separator; money is joined by `price.amountWithCurrency` and by nothing else.

**4. A new key lands in `ro.json` *and* `ru.json` in the same commit.** This is the bullet above's
*"add every required locale at the same time"*, and it is checked: `tests/i18n/catalogue-parity.test.ts`
fails on a key present in one catalogue and missing from the other, and on mismatched ICU
placeholders between them. The Russian is a drafted translation awaiting owner sign-off — draft it,
never mark it approved.

**The generated declaration is part of that same commit, and forgetting it fails somewhere else
entirely.** `apps/web/src/messages/ro.d.json.ts` is written by next-intl **and checked in**, and it —
not `ro.json` — is what types `translate(…)`. next-intl regenerates it during `next dev` and
`next build` only, so a wave that edits the catalogue and then runs `tsc` first sees
**`TS2554: Expected 2-3 arguments, but got 1`** at the **call site**: an unknown key falling through
to the `(namespace, key)` overload, wearing the costume of an ICU-arguments problem, with nothing in
the message naming the catalogue. Measured on 2026-09-15 during M7 wave 7F4b. **Mirror the JSON into
the declaration by hand** — a `next build` afterwards rewrote the file byte-identically.

So the full set a new message leaf touches is: `ro.json`, `ru.json`, **`ro.d.json.ts`**, the copy lock
(`apps/web/tests/support/approved-romanian-messages.ts`, a deep equality — a missing leaf fails it),
and `apps/web/tests/i18n/golden-output-hashes.ts` with the fixture counts in
`apps/web/tests/i18n/golden-output.test.ts`.

**5. The copy lock is an inline literal table, and never a snapshot.**
`apps/web/tests/support/approved-romanian-messages.ts` holds the approved Romanian wording as a
literal object; `tests/i18n/romanian-copy-lock.test.ts` compares the catalogue against it. A new
approved sentence is added there by hand, in the same commit as the key. **Do not reach for a
snapshot file**: a snapshot updates itself under `-u` and records what the code does, whereas the
point of the lock is to record what a person agreed to, so that changing a sentence is a deliberate
two-file edit somebody has to look at. Separately, `tests/i18n/golden-output-hashes.ts` pins a
key-to-SHA-256 manifest of rendered output; a wave that moves a hash has changed a rendered value and
owes the changed-key list in its commit message.

**6. What the lint gate rejects**, so this page and the gate cannot disagree. `eslint.config.mjs`
fails the build on:

- a **Romanian letter** — `ă â î ș ț`, and the Turkish cedillas `ş ţ` that render like them — inside
  a string literal, a template literal or a **regex literal**, anywhere in `apps/web/src`,
  `apps/web/tests`, `packages/*/src` or `packages/*/tests`. `apps/web/src/messages/**` is where it
  belongs and is excluded. A Romanian **comment** is never rejected: the rules read the syntax tree,
  and this codebase's comments quote approved copy on purpose.
- **bare text rendered as JSX**, and a bare string given to `aria-label`, `title`, `placeholder` or
  `alt`, in `apps/web/src`. This is the half that does not depend on the language: *"Dulap
  suspendat"*, *Frigider* and every palette name carry no diacritic, and a diacritic rule alone would
  certify a file full of them.

Two allow-lists sit beside those rules, both in `eslint.config.mjs`, and **every entry carries the
reason it is legal** — a decorative glyph a locale does not translate, a file whose literals are the
subject rather than the copy. A test that must name Romanian — a *negative* claim about the wording, a
codepoint, a golden hash input — records its reason at the site, in an
`// eslint-disable-next-line no-restricted-syntax -- …` directive, or in a
`/* eslint-disable … -- … */` … `/* eslint-enable … */` pair where several adjacent lines share one
reason. A bare disable with no sentence beside it is not an exemption; it is a suppression, and it is
a review failure.

**7. A model publishes a descriptor; the render layer resolves it — and that decides which of four
layers your test belongs in.** A `*-model.ts`, a domain query or a store selector returns
`{ key, params }` or a `BodyLabel`, never a sentence; `content.ts` resolves it at the edge.
`packages/configurator-domain` therefore imports no i18n library, takes no locale, and publishes no
Romanian. Ask these in order and stop at the first *yes*:

1. **Is the expected value a sentence a person approved?** → the copy lock, as an inline literal, and
   nowhere else.
2. **Is the subject a model function returning data?** → assert the **descriptor** it publishes.
   This is the default, and it is stronger than the alternative: `toBe(ro.panel.done)` passes for any
   string the model returns, while `toEqual({ kind: "bodyKind", bodyKind: "wall_cabinet" })` fails
   when the model picks the wrong body.
3. **Does it read the DOM, a rendered component, or a Playwright page?** → a resolution assertion,
   and it may compare against `ro.<key>`. The same-source comparison is the design here: it proves
   the resolver ran and the right key was asked for, and it is not asked to prove the wording.
4. **Is it about the catalogue's structure** — completeness, placeholder parity, no silent fallback,
   a hash manifest? → it names no Romanian at all.

A model test that reaches for `ro.` has probably answered question 2 wrongly, and owes a one-line
comment saying why the descriptor would not do.

## Comments in code and tests

Owner ruling, 2026-10-05 (ADR 0136): decision history belongs in `docs/decisions/` and
`docs/milestones/`, not in source. Every agent re-reads a comment on every file read, and history
in code goes stale silently. A comment survives only if it passes this test.

**Test.** If this comment were deleted, could a competent reader reintroduce a bug or waste real
time, **and** is the information not recoverable from the code, its names, or a cited ADR/spec
section? Yes to both: keep it, compressed. Otherwise delete it. Tests are not a recovery source: a
reader of a source file does not open its tests.

**Delete:**

- Decision history and rationale: "decided in ADR…", "was X, now Y", owner rulings, dates,
  alternatives considered.
- Wave, milestone or FB ids used as narrative ("added in wave 7D4").
- Anything the code or a name already says; commented-out code; a TODO with no issue reference;
  decorative banners.
- Multi-paragraph block rationale whose substance is in an ADR.
- In tests: a scenario retold above a test whose name already states it, QA-wave journals,
  "this test exists because…", and self-asserted guard strength (see *A comment claiming a guard is
  not a guard* below).

**Keep, compressed:**

- A hidden invariant the types cannot express: units (mm vs m), axis or handedness, "must run
  before X".
- A workaround for a named library, browser or driver bug, with the name and version.
- A warning of consequence ("throws, unlike `lookUpMaterial`").
- Why a non-obvious constant or threshold has its value, with the ADR or DEVELOPMENT-SPEC row that
  defines it.
- A tool directive (`@ts-expect-error`, `eslint-disable`, `"use client"`, `@vitest-environment`,
  `prettier-ignore`, istanbul/v8 ignore), always with its reason.
- A lint-functional comment, one line. `eslint.config.mjs` extends `eslint.configs.recommended` and
  `tseslint.configs.strictTypeChecked` (source-verified), so `no-empty` and `no-fallthrough` are
  live: the comment that is a block's only content (`catch { // ignore }`, an intentionally empty
  function or branch) and a `// falls through` / `// no default` marker must stay. A block must
  never become empty.
- A one-line doc comment on public API.
- Approved Romanian copy that a rule or test depends on, quoted.
- In tests also: the header on an `it.fails` / `skip` naming the wave that owes the flip (see *A
  deferred test has two shapes*); one line on what a counterexample or sabotage proves; one line on
  why a fixture exists or must not be widened.

**Form.** The claim plus its consequence, nothing else. Two lines is the default, each at most 120
characters; a stated invariant that genuinely needs more (a coordinate, anchor or units contract)
may run to about 4. At most one pointer, written `see ADR 0110 O10` or `see DEVELOPMENT-SPEC §6.2`;
a pointer replaces an explanation, it does not decorate one. No dates, names, "Note that", history
or wave ids; the one exception is the deferred-test header that names the wave owing the flip. One
comment per concept. Prefer a better name or an extracted well-named function.

**Unsure whether the reason is in an ADR?** Grep `docs/decisions/` for the rule and its constant.
Found: if the code at that spot would look wrong, surprising or "fixable" to a reader who has not
read the record (a trap), keep a one-line statement of the constraint plus the pointer; delete
outright only where the code is unsurprising without it. Not found and the reason is load-bearing: keep it compressed
and report it as "needs an ADR home". Never delete a load-bearing reason because it is long.

A stripping pass is proved beyond the emitted-JS diff, which cannot see lint or lost knowledge: see
ADR 0136, Consequences.

## Tests

- One logical behaviour per test, named after the failure it detects.
- Use Build → Operate → Check, with independent fixtures/builders and no ordering dependency.
- Tests live in a per-package `tests/` directory, never beside the module they cover. Mirror the
  `src/` layout inside it, so `src/scene/scene-view.ts` is protected by `tests/scene/scene-view.test.ts`.
  Keeping the two trees apart means `src/` is exactly what ships: the build's `rootDir` cannot reach
  a test file by accident, and "what is in this package?" is answerable by listing one directory.
  Helpers that exist only for tests (headless canvases, stubs, structural assertions) are test
  infrastructure and belong under `tests/support/`, not in `src/`.
- **Every package owns its tests completely, and must stay liftable.** A package plus its `tests/`
  directory is a self-contained unit: it can be moved into its own repository or extracted as a
  separate service without hunting for its tests, its fixtures, or its helpers. That is a deliberate
  option being kept open, not an accident of layout.

  Two things follow, and they are the ones easy to break without noticing:

  - No shared test infrastructure at the repository root, and no test importing across a package
    boundary except through the target package's public entry point — the same rule production code
    follows. A helper needed by two packages either belongs to one of them and is imported publicly,
    or is duplicated. A root `test-utils/` directory would silently re-couple every package to the
    monorepo.
  - Each package's suite must pass when run from inside that package
    (`pnpm --filter <pkg> test`), not only from the root. If a suite depends on the root runner's
    ordering or on another package's build having happened first, the package is not liftable —
    that is what each package's own `build:deps` step exists to guarantee.
- Playwright end-to-end specs live in `apps/web/tests/e2e/` and keep the `*.e2e.spec.ts` suffix, so
  the vitest `tests/**/*.test.ts` glob and the Playwright `testDir` never collect each other's files.
- Avoid vacuous assertions: ensure a filtered collection or loop actually exercised the case it
  claims to test.
- **A test is kept only if it can fail for the reason its title names** (added 2026-10-08, from the
  tests review; reasoning, instances and the sweep of earlier records in
  [ADR 0152](../decisions/0152-a-test-is-kept-only-if-it-can-fail-for-the-reason-its-title-names-and-is-deleted-only-on-evidence.md);
  the audit procedure is `../skills/lemnaria-test-audit/SKILL.md`). When you write one:
  - **Show it red under a mutation of the behaviour its title names**, or do not report it as coverage.
  - **A structural rule goes to lint or `tsc` first.** A source-text scan of production is allowed only for an
    absence claim a dated decision records, never as the sole guard of a rule; its title says it reads source,
    and an AST lint selector is preferred to a substring.
  - **A constant that is a rule keeps one literal pin**, not two that each justify the other.
  - **A self-test of a test-support instrument** is kept only as a control for a sweep that asserts a negative: titled
    as a control, one input the detector must flag and one it must pass.
  - **A test that can only fail by timing out is not a guard.** Assert the observable before awaiting the promise
    that would hang.
- **A fixture gives every field its own value** (added 2026-10-09, from M8 wave 8I; the 8I developer's handoff, relayed). A
  fixture that used one value for a phone and for its normal form let a swapped-column mutant survive every developer suite
  (`FAKE_PHONE_NORMAL_FORM` now differs from the phone). Where two stores must behave alike, the shared contract suite is the
  only place that pins them to one behaviour: extend it, not each store. A mocked driver that records the SQL text and values
  (`mocked-neon-driver.ts`) is read by the statements test, which pins each statement's exact lists and counts the templates
  in the source, so a new statement fails it until the test reads it.
- **Deleting a test needs evidence.** A duplicate goes only when the test named to keep goes red by assertion under a
  mutation of the shared code; without a mutation, only when its assertion is logically implied by its twin's over the
  identical input and call, shown by reading and recorded as such, and never by mutating a migration or the DML. Read a
  review's "Keep" as a claim: it was wrong repeatedly.
- **Two harness behaviours make a test pass over code that never ran. Both were measured, and both
  read exactly like a production defect when they bite.**

  **`act` coalesces transient renders, so a guard against a state the screen must *never* show passes
  vacuously.** Two `setState`s inside one `await act(async () => …)` window produce **one** render;
  the intermediate state never reaches the DOM. Measured 2026-09-14 on M7 wave 7F4a: with
  `use-generation.ts`'s run token deliberately deleted, an abandoned run's `failed` state and the
  fresh run's `composed` state both settled inside a single 5 ms `act` poll, the trail read
  `composing → none → composing → composed`, and the guard stayed green. Polling **outside** `act`
  gave `composing → none → composing → failed → composed` and the guard went red. **For any claim
  about a state the screen must never enter, poll outside `act`** and read the sequence off a
  `MutationObserver` with `attributeOldValue` — a sampled poll cannot see a transient, and happy-dom
  delivers all records in one late callback, so reconstruct the order from `oldValue` rather than from
  the live DOM.

  **Two concurrent dynamic imports of a `vi.mock`-ed module return different namespaces, and the
  second is the *real* module.** Under Vitest 3.2, `Promise.all([import(x), import(x)])` gives
  `a !== b`: the factory runs once, `a` is the mock, `b` is unmocked. A sequential second import gets
  the mock correctly. Measured 2026-09-14 writing adversarial tests for two overlapping composition
  runs: `apps/web/src/room/use-generation.ts:460` takes `await import("@lemnaria/three-adapter")` on
  the run path, so two runs started in one tick issue two concurrent imports — and the second
  received the real `makeKit` and died on *"Cannot bake a procedural texture: no 2D canvas context"*.
  **That is a harness artefact, not a defect**: a browser's module cache returns one namespace per
  specifier. When a test starts two runs that each take the same dynamic import, drain microtasks
  between them so the first import resolves before the second is issued.

- **A comment claiming a guard is not a guard.** When a test file, a fixture or a manifest says in
  prose that it protects something — *"this is the gate that bites"*, *"an unknown key cannot reach
  the screen"* — that sentence is a claim to be falsified, not a fact to inherit. Break the thing it
  names and confirm the gate goes red; if it stays green, the comment is the defect and it is more
  dangerous than a missing test, because the next reader trusts it and does not write the real guard.
  Three of the four dead gates M6B wave 6B-f found were exactly this shape, and none was found by
  running the suite — see that wave's close-out in `docs/milestones/done/M6B-internationalization.md`.
  The same rule covers the two ways a gate disarms itself quietly: a helper that is module-private is
  invisible to the totality test that should be sweeping it, and a guard that returns early on some
  precondition reports success on every run where the precondition is false.

- **A `vi.mock` of the database driver keeps the real module's `Client` parse** (added 2026-10-07, from M8
  wave 8B; [ADR 0146](../decisions/0146-nothing-copied-from-a-connection-value-or-thrown-by-a-driver-leaves-the-persistence-package.md)).
  Spread `importOriginal` into the factory, so the connection opener still parses a URL the way the driver
  does; a factory that replaces the whole module makes the opener refuse every URL. And a test file that
  names the database-URL readers must be classified in
  `packages/persistence/tests/live-suite-census.test.ts` (see `ci-and-local-gates.md`, the paragraph on which
  persistence files run live).

## Coverage an adversarial pass owes

`../WORKFLOW.md` decides *when* QA runs and that it gates review. This is *what* it tests.

- Every production path gets normal-path coverage plus boundaries, empty and invalid inputs,
  transitions, and anti-invariants. **Test what must not happen**, not only the desired output.
- Sweep a meaningful input range when arithmetic or generation is involved; a few hand-picked
  examples are not evidence that the transitions work. For generated data assert properties — no
  overlap, no unclassified gap, valid schema output.
- **An adversarial file adds cases the existing test lacks; it does not restate them** (added 2026-10-08, from the
  tests review, whose dominant cause of duplicates was exactly this; see
  [ADR 0152](../decisions/0152-a-test-is-kept-only-if-it-can-fail-for-the-reason-its-title-names-and-is-deleted-only-on-evidence.md)).
  Read the original test before adding a case, and name in the new test what the old one does not cover.
- **A clean report from an adversarial pass is a weak result, not a strong one.** This project has
  shipped a test that asserted a defect as correct, two boundary greps that matched nothing while
  reporting green, and two commands that reported success while doing nothing. "No findings" must be
  earned and evidenced.
- **An "accepted" verdict proves nothing until the accepted value is used by every consumer downstream**
  (added 2026-10-07, from M8 wave 8B; [ADR 0146](../decisions/0146-nothing-copied-from-a-connection-value-or-thrown-by-a-driver-leaves-the-persistence-package.md)).
  A sweep tested what a connection opener accepted and never queried through an accepted string; two
  reviewers found the leak that four QA passes had missed. The fix was to drive every accepted value
  through each consumer with only the socket replaced, with control and non-Latin-1 characters in the
  alphabet from the start. When a gate decides "this value is fine", the adversarial pass owes a run of that
  value through everything that will then receive it.

### A deferred test has two shapes and they mean different things

| Shape | What it means | Clears |
| --- | --- | --- |
| `it.fails` / `test.fails` | The test **runs** and asserts the current wrong behaviour. It goes **red the moment the behaviour is fixed** | Itself |
| `describe.skip` / `test.skip` | The test **cannot run at all** — the surface it needs does not exist | Only when someone remembers |

**Use `it.fails` whenever a named wave is expected to change the behaviour**, because the debt clears
itself instead of depending on memory. That is the same argument that rules out simply leaving the
gate red: a red gate stops being information the second wave that sees it, whereas an expected failure
keeps `ci:local` green *and* fires the moment it is obsolete. Use `skip` only where there is nothing
to self-clear — the test cannot execute, so there is no assertion to invert.

**Flip it, do not delete it.** A deleted expected failure is indistinguishable from one that never
existed. Say so in the test's name and in a header comment, and name the wave that owes the flip, so
the inheriting implementer meets the instruction rather than a puzzle.

**Verify that the mechanism self-clears; do not assume it.** Make the assertion pass artificially,
confirm the expected-failure marker itself goes red, then restore. This is `ci-and-local-gates.md`'s
*"when adding a gate, prove it fails"* applied to the inverse case, and it is the only thing
separating a self-clearing test from a permanently-green one that asserts nothing.

## Three guards that look thorough and cannot fail

### Both sides fed by the same source

A test that compares an expected value against an actual one proves nothing if **the same thing
supplies both sides.** It passes, it looks specific, and it cannot fail for the reason it was written.

**The cheap general check, and it takes one question:** ask what *else* could supply the expected
side. If the answer is "the same thing that supplies the actual side", **make the two disagree and
assert which one wins.**

Three instances found in one wave on 2026-09-03, all in guards that read as thorough:

- A two-way refusal comparing the groups it was **handed** against the lines it was **handed** — so
  the component could stop calling the projection entirely and rebuild a plausible, correctly ordered
  breakdown from price lines, with **187 tests and the e2e still green**. Closed by capturing the
  argument at the hand-over and requiring two designs whose group structures differ.
- A count of rendered amounts whose expected list was derived from **the same view the surface
  renders**, so a subtotal added by the model landed on both sides and cancelled out. Closed by
  counting against the projection and the price book instead.
- A label assertion that could not tell whether the model read the projection's entry or the price
  line, because `CabinetPriceLine` carries the **same** `label` and `widthMm`. Closed by making the
  two disagree.

None of these is a careless test. Each compares a real property; each was fed by one source wearing
two hats.

### A surviving mutation may not have been applied

When a mutation is expected to turn a test red and does not, **prove the mutation reached the code
under test before concluding the guard is weak.** The web suites resolve
`@lemnaria/configurator-domain` to `dist/`, so editing `packages/configurator-domain/src` and
re-running a web test mutates nothing — the build still holds the original. Rebuild, or mutate the
build, then re-run. The one-directional consequence, and which stale results remain salvageable, are
in `ci-and-local-gates.md`.

Observed on 2026-09-03: a scene-population assertion looked like a restatement because the mutation
meant to falsify it was a no-op. Against the build it died, and the assertion turned out to be
genuinely falsifiable. **A survivor is a claim about the guard only once the mutation is known to have
landed** — otherwise it is a claim about the build.

**A mutation that reddens nothing in the files you ran is not evidence until the whole package suite has seen it**
(added 2026-10-08, [ADR 0152](../decisions/0152-a-test-is-kept-only-if-it-can-fail-for-the-reason-its-title-names-and-is-deleted-only-on-evidence.md)
decision 2.3). Two "gaps" reported in one audit batch were covered by tests outside the two files the agent had run.

### A mutant of a destructive statement never touches a database

*A mutant of a statement that deletes, updates, truncates or alters is run against a mocked driver and never against a database. A live proof
that a statement touches only what it is handed plants rows of its own beside the ones it hands over and asserts they remain. A destructive
statement whose `where` no longer names what it was handed is not sent anywhere.*

Instance, 2026-10-09 (M8 wave 8F): a mutant of `deleteRateLimitCountersForTests` with its `where` clause removed was run against the live test
database and every `rate_limit_counters` row there was deleted, more than once; the helper's guard held and the application database was never
connected to. The mutant was already dead without a database (the unit test pins the statement's whole text with the driver mocked). The record:
[ADR 0155](../decisions/0155-the-mint-asks-a-keyed-per-day-per-network-limiter-first-and-refuses-what-it-cannot-judge-the-owner-names-the-network-source-and-a-destructive-mutant-never-touches-a-database.md),
*Incident*; [ADR 0151](../decisions/0151-a-test-may-delete-the-rows-tests-added-and-never-a-row-a-production-user-added.md), note of 2026-10-09.

### A predicate over a band, and a sweep with no floor per arm

`top` folds into `wall` (ADR 0011 Gap C) for every reader that groups or counts by band. A predicate
that reads the raw `band` field instead of going through `normaliseBand` is silently wrong for every
top-row body, and it looks correct in isolation because nothing about it fails to compile or to run.

**The same shape bites a set-membership assertion specifically.** A property asserted as "true over
every member of a set" needs a **minimum count per arm** of whatever it is branching on, not only a
total count — otherwise the sweep can pass while landing entirely on the arm nobody changed, and it
certifies nothing about the arm that moved. Found at M6 wave 6I2's close-out (2026-09-04): the wave's
strongest property was first swept without a floor per arm, and the fixture the sweep reached happened
to be the arm 6I2 did **not** touch — see `../milestones/done/M6-price-and-global-settings.md` wave 6I2's
close-out for the specific instance.

Two more instances from the tests review (2026-10-08, [ADR 0152](../decisions/0152-a-test-is-kept-only-if-it-can-fail-for-the-reason-its-title-names-and-is-deleted-only-on-evidence.md)
decision 1.5, relayed): a sweep over `shell-design.adversarial`'s wall-only arm ran on 0 of 8,534 tiles, and a test the
review had filed as a duplicate was itself such a loop. **State the floor per arm in the sweep.**
