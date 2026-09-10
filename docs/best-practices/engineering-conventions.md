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
there is no branch left to get wrong. Numbers are `{n, number, ::group-off}` where the mockups show
no group separator; money is joined by `price.amountWithCurrency` and by nothing else.

**4. A new key lands in `ro.json` *and* `ru.json` in the same commit.** This is the bullet above's
*"add every required locale at the same time"*, and it is checked: `tests/i18n/catalogue-parity.test.ts`
fails on a key present in one catalogue and missing from the other, and on mismatched ICU
placeholders between them. The Russian is a drafted translation awaiting owner sign-off — draft it,
never mark it approved.

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
- **A comment claiming a guard is not a guard.** When a test file, a fixture or a manifest says in
  prose that it protects something — *"this is the gate that bites"*, *"an unknown key cannot reach
  the screen"* — that sentence is a claim to be falsified, not a fact to inherit. Break the thing it
  names and confirm the gate goes red; if it stays green, the comment is the defect and it is more
  dangerous than a missing test, because the next reader trusts it and does not write the real guard.
  Three of the four dead gates M6B wave 6B-f found were exactly this shape, and none was found by
  running the suite — see that wave's close-out in `docs/milestones/M6B-internationalization.md`.
  The same rule covers the two ways a gate disarms itself quietly: a helper that is module-private is
  invisible to the totality test that should be sweeping it, and a guard that returns early on some
  precondition reports success on every run where the precondition is false.
