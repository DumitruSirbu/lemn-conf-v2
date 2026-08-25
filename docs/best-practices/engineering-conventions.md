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
