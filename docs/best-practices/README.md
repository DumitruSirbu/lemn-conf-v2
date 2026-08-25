# Engineering best practices

These guides were adapted from the previous Lemnaria configurator. They preserve reusable working
standards without importing its Next.js, Turborepo, Zustand, port, locale, or test-path decisions.

- `dev-qa-cycle.md` — authoritative phase-delivery and review rules.
- `engineering-conventions.md` — stack-independent code, state, validation, and test conventions.
- `browser-and-visual-qa.md` — browser, mobile, and visual verification rules.
- `documentation.md` — decisions, corrections, and close-out records.

These three are specific to this repository rather than adapted, and hold the detail that used to
sit in `AGENTS.md`:

- `product-invariants.md` — geometry, units, coordinates, and the reference-fidelity anchor. Read
  before touching the 3D model.
- `ci-and-local-gates.md` — commands, lint/format configuration, the pre-commit and pre-push hooks,
  and how to add a CI gate. Read before running the build or changing a gate.
- `environments-and-resources.md` — the add-only hard rule for environment variables and provisioned
  resources, secret handling, and which `.env` file holds what.

Use `docs/brand.md` as a provisional visual/voice baseline until a brand-discovery pass confirms or
replaces it.
