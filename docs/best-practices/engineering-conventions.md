# Engineering conventions

Apply these according to the stack selected for the new project. They are conventions, not a reason
to force a framework or abstraction before the architecture exists.

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
- Place tests near the modules they protect unless the selected framework has a stronger standard.
- Avoid vacuous assertions: ensure a filtered collection or loop actually exercised the case it
  claims to test.
