# Engineering best practices

The delivery process itself — dispatch, QA, review, close-out — is **not** here. It lives in
`docs/WORKFLOW.md`, which is the single authoritative source. `dev-qa-cycle.md` was merged into it
on 2026-08-25 because two process documents meant a session could read one and miss the other.

These guides were adapted from the previous Lemnaria configurator. They preserve reusable working
standards without importing its Next.js, Turborepo, Zustand, port, locale, or test-path decisions.

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
- `rtk-proxy.md` — the token-optimized `rtk` command proxy, imported wholesale into every session via
  `AGENTS.md`'s `@docs/best-practices/rtk-proxy.md`.

Use `docs/brand.md` as a provisional visual/voice baseline until a brand-discovery pass confirms or
replaces it.
