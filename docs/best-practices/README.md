# Engineering best practices

The delivery **cycle** — the step order, what gates what, how much review a wave gets — is **not**
here. It lives in `docs/WORKFLOW.md`, which is the spine every session reads and the single
authoritative source for the process. `dev-qa-cycle.md` was merged into it on 2026-08-25 because two
process documents meant a session could read one and miss the other.

These guides carry the **detail behind** that spine: each rule is stated in exactly one place, and
`WORKFLOW.md` points here rather than summarising, so the two cannot drift apart.

These guides were adapted from the previous Lemnaria configurator. They preserve reusable working
standards without importing its Next.js, Turborepo, Zustand, port, locale, or test-path decisions.

- `engineering-conventions.md` — stack-independent code, state, validation, comment, and test conventions.
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
- `agent-coordination.md` — running more than one agent against one repository: the shared resources
  they collide on, freezing the tree for a measurement, per-file ownership, stale worktree bases,
  agent retirement and handoff, and how to spend a review tier. Read before dispatching a **second**
  agent. It exists as its own document because every rule in it is about two agents rather than about
  code, a tool, or a record — and because it was the largest single body of detail in `WORKFLOW.md`,
  which every session reads in full.

Use `docs/brand.md` as a provisional visual/voice baseline until a brand-discovery pass confirms or
replaces it.
