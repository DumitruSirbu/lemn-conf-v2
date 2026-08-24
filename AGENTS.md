# Lemnaria Configurator — Codex Project Guide

This repository will build the next Lemnaria furniture configurator. Treat the files in
`design-source/` as product reference material, not as production code to be casually rewritten.

## Start here

Before planning or changing product behaviour, read the relevant source material:

- `docs/PRODUCT_REQUIREMENTS.md` — the authoritative product goal, initial scope, and open product
  decisions for the new configurator.
- `docs/ARCHITECTURE_PROPOSAL.md` — the accepted technical architecture and delivery roadmap;
  dated decision records and its explicitly unresolved inputs govern implementation.
- `design-source/Modern Kitchen Cabinets 3D (3)/DEVELOPMENT-SPEC.md` — the current domain and
  editor contract: placements, derived voids, columns, bands, insert/remove/swap/resize, picking,
  panel behaviour, and a 24-row regression table. Every rule marked **WHY:** is a shipped defect's
  fix and must not be simplified away.
- `design-source/Modern Kitchen Cabinets 3D (3)/SPEC.md` — the current 3D kitchen contract. It
  defines coordinate conventions, dimensions, non-negotiable structural dependencies, and visual
  rules.
- `design-source/Modern Kitchen Cabinets 3D (3)/Lemnaria Configurator Mobil.dc.html` and
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
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm check
```

`pnpm check` runs formatting, linting, type checking, and unit tests in that order. Run commands
through the `rtk` proxy as described in `RTK.md` when supported.

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
