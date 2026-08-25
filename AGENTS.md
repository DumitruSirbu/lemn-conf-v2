# Lemnaria Configurator — Codex Project Guide

This repository will build the next Lemnaria furniture configurator.

`design-source/` is the supplier's original deliverable. It is **not tracked in git** and will be
deleted from the working tree once the port is finished, so nothing in the repository may depend on
it. Everything still needed from it has been copied into the project's own source and is what you
should read and cite:

- `docs/design/DEVELOPMENT-SPEC.md` — the authoritative behavioural spec (sections, `§11` row
  numbers, tolerances).
- `docs/design/SPEC.md` — the original supplier spec it superseded.
- `docs/design/mockups/*.dc.html` — the screen mockups the milestones cite by frame name.
- `packages/three-adapter/reference/kitchen-parts.js` — the reference geometry M1's structural
  parity suite diffs the port against.

Older documents still mention `design-source/` paths when describing where something originally came
from. That is historical provenance; read it as such, and do not add new dependencies on the folder.

## Start here

Before planning or changing product behaviour, read the relevant source material:

- `docs/PRODUCT_REQUIREMENTS.md` — the authoritative product goal, initial scope, and open product
  decisions for the new configurator.
- `docs/ARCHITECTURE_PROPOSAL.md` — the accepted technical architecture and delivery roadmap;
  dated decision records and its explicitly unresolved inputs govern implementation.
- `docs/design/DEVELOPMENT-SPEC.md` — the current domain and
  editor contract: placements, derived voids, columns, bands, insert/remove/swap/resize, picking,
  panel behaviour, and a 24-row regression table. Every rule marked **WHY:** is a shipped defect's
  fix and must not be simplified away.
- `docs/design/SPEC.md` — the current 3D kitchen contract. It
  defines coordinate conventions, dimensions, non-negotiable structural dependencies, and visual
  rules.
- `docs/design/mockups/Lemnaria Configurator Mobil.dc.html` and
  `…Desktop.dc.html` — the screen flow, states, and Romanian copy. Mobile is the priority surface
  and the only file covering all five screens.
- `docs/decisions/2026-08-24-design-reference-supersession.md` — what the new reference superseded
  in the earlier domain documents, and what survives.
- `docs/WORKFLOW.md` — the planning, implementation, QA, review, and close-out cycle.
- `docs/best-practices/` — detailed reusable engineering, browser/visual QA, and documentation
  conventions adapted from the reference project.
- `docs/AGENT_ROLES.md` — role cards and hand-off formats for a Codex agent team.
- `docs/agents/` — individual Codex dispatch profiles adapted from the reference project's
  `.claude/agents/` definitions.

Later decisions belong in `docs/decisions/`; acceptance criteria and phase plans belong in
`docs/milestones/`. A dated decision or correction in those directories supersedes earlier prose.

## Product invariants already known

- Work in metres in the 3D model. Do not silently mix metres, millimetres, and centimetres.
- Preserve the reference coordinate system: origin at the floor and centre of a unit; +Y up; +Z
  faces the customer; +X is right when facing the unit.
- A bought appliance, sink, or handle has fixed real-world dimensions unless a requirement says
  otherwise. Cabinet bodies may scale only along the dimensions the spec permits.
- A visual change must keep its stated structural dependencies. For example, a sink requires a
  cut worktop and an open cabinet frame; it cannot be fixed in isolation.
- Prefer the existing 3D reference as evidence over a visual guess. Record intentional departures
  with their reason and acceptance criteria before implementing them.

## Hard rule — environment variables and provisioned resources are add-only

**Never remove or overwrite an environment variable, and never delete a provisioned resource.
Adding is the only permitted operation.** This applies to `vercel env rm`, `vercel env add` over an
existing name, `vercel blob delete-store`, `vercel integration-resource remove`, and any equivalent
dashboard action or API call.

If something appears wrong — a variable is scoped too broadly, holds a stale value, or a resource is
unused — **report it and let the human decide**. Do not fix it by removing.

Why this is absolute rather than a preference:

- **The values cannot be read back.** Vercel marks Production and Preview variables sensitive by
  default, so `vercel env pull` returns them empty. A deletion is therefore _irreversible by the
  agent_: there is no way to restore what was there.
- **The commands are not symmetric.** `vercel env add NAME <env>` scopes the addition to that
  environment, but `vercel env rm NAME <env>` **deletes the variable across every environment** and
  ignores the argument. A removal intended to narrow a scope destroys the whole variable. This
  actually happened on 2026-08-25: an attempt to unscope `CRON_SECRET` from Preview removed it from
  Production too, and the value could not be recovered.
- **Failures are silent and delayed.** A missing variable usually does not break a build; it breaks
  a scheduled job or a request path later, in an environment nobody is watching.

Narrowing a scope, rotating a secret, or retiring a resource are all human decisions. Prepare the
exact commands or dashboard steps and hand them over.

## Working conventions

- For meaningful product phases, use the agent team as the default workflow: architect → scoped
  developer wave → adversarial QA → parallel logic/quality/visual review (plus security when
  triggered) → orchestrator verification → scribe close-out. Follow `docs/WORKFLOW.md` and reuse
  the same reviewer agents on follow-up rounds where possible.
- Plan before implementation when a change has multiple components, changes a product invariant,
  or affects a public configuration/pricing contract.
- Keep implementation dispatches narrow: at most five concrete items and, where practical, five
  files. Each behaviour change needs a paired regression test or an explicit reason it cannot.
- Run the relevant checks yourself. Do not report a test, build, screenshot, or observation that
  you did not personally obtain.
- Review the actual diff before accepting an agent's summary. Agent reports are evidence leads,
  not proof.
- For visual or interactive work, verify the real surface at the agreed mobile viewport once the
  application exists. Keep temporary screenshots out of the committed project unless the user
  explicitly asks to retain them.
- Do not add tool-specific hooks, credentials, timers, or machine-local settings from the previous
  Claude project. They are not portable project configuration.

## Root development commands

Use Node 20 and pnpm 9.15. From the repository root, run:

```bash
pnpm install
pnpm format         # prettier --write .
pnpm format:check   # prettier --check .
pnpm lint           # eslint, --max-warnings 0, every package
pnpm lint:fix       # eslint --fix, every package
pnpm typecheck
pnpm test
pnpm build
pnpm check
```

`pnpm check` runs formatting, linting, type checking, and unit tests in that order. Run commands
through the `rtk` proxy as described in `RTK.md` when supported.

Formatting is pinned by `.prettierrc.json` — an explicit statement of Prettier's own defaults
(80 columns, double quotes, semicolons, trailing commas). It exists so a future Prettier release
cannot silently reformat the tree. Do not change a setting in it to accommodate one file.

ESLint's configuration lives in `eslint.config.mjs` (flat config): `strictTypeChecked` plus
`stylisticTypeChecked`, and the architectural boundaries — the domain package may not import React,
Next.js, Three.js, the adapter or catalog data; the adapter may not import React, Next.js or the app
shell; `apps/web` must import workspace packages through their public entry points. Those
`no-restricted-imports` rules are the enforcement behind `ARCHITECTURE_PROPOSAL.md` §3 and are not
advisory. No `eslint-config-prettier` is needed: typescript-eslint v8 ships no formatting rules, so
there is nothing for Prettier to conflict with.

## Rule — format and lint before every commit

**Every commit must be formatted and lint-clean.** This is enforced by a repository-managed Git
hook, not left to memory.

`.githooks/pre-commit` formats the staged files in place, re-stages them, then runs `pnpm lint`
across the workspace. A lint error aborts the commit. `pnpm install` enables it by pointing
`core.hooksPath` at `.githooks` via the root `prepare` script; to enable it by hand in a fresh clone:

```bash
git config core.hooksPath .githooks
```

The hook deliberately does **not** run `pnpm typecheck` or `pnpm test`. The persistence suite talks
to a live Neon database, so including it would fail commits for anyone offline or without
credentials. `pnpm check` is the full gate and belongs before a push, a PR, or a milestone close-out
— never skipped on the assumption the hook already covered it.

Do not bypass the hook with `git commit --no-verify`. If the hook is wrong, fix the hook.

## Skills

Use the repository-local skill guides when their trigger matches:

- `docs/skills/lemnaria-3d-reference/SKILL.md` for planning, implementing, or reviewing the
  kitchen 3D model.
- `docs/skills/lemnaria-delivery-workflow/SKILL.md` for phase planning, QA, review, or
  documentation close-out.

The prior project also used large, general third-party guidance for Next.js, Playwright, Tailwind,
and UI/UX. This Codex workspace already supplies focused React/Next.js, browser, image, and
document skills. Add a project-local replacement only after the new stack makes it useful; avoid
vendoring several megabytes of generic material before it has a concrete role.

@RTK.md
