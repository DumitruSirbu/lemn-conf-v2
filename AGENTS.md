# Lemnaria Configurator — project guide

This repository builds the next Lemnaria kitchen configurator: a pnpm monorepo with an I/O-free
domain package, a Three.js adapter, a persistence package that is the only place a Postgres driver
appears, and a Next.js App Router app.

This file is loaded every session, so it stays short. It routes; the linked documents carry the
detail. **Read the linked document before acting in its area** — do not work from this summary.

## Three rules that apply before you read anything else

1. **Environment variables and provisioned resources are add-only.** Never remove or overwrite a
   variable, never delete a resource. Report the problem and let the human decide. Never print a
   secret's value. → `docs/best-practices/environments-and-resources.md`
2. **Report only what you ran.** A green command is evidence only when you executed it and can quote
   the result. Never present a plan as shipped, or an agent's summary as proof.
3. **`design-source/` is untracked and will be deleted.** Nothing may import from it. Everything the
   project needs was copied into its own source; older documents mention the folder only as
   historical provenance. → `docs/design/README.md`

## Where to look, and when

**Before planning or changing product behaviour**

| Read                                        | When                                                                                                                                                                                                                        |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/PRODUCT_REQUIREMENTS.md`              | You need the product goal, scope, or an open product decision.                                                                                                                                                              |
| `docs/ARCHITECTURE_PROPOSAL.md`             | You need module boundaries, the delivery roadmap, or a recorded technical decision.                                                                                                                                         |
| `docs/design/DEVELOPMENT-SPEC.md`           | **The authoritative behavioural contract.** Placements, derived voids, columns, bands, insert/remove/swap/resize, picking, panels, and the §11 regression table. Cite it by section and row.                                |
| `docs/design/SPEC.md`                       | You need the original 3D contract: coordinates, dimensions, structural dependencies. Superseded by DEVELOPMENT-SPEC where they disagree.                                                                                    |
| `docs/design/mockups/`                      | You are building or reviewing a screen. `Lemnaria Configurator Mobil.dc.html` is the priority surface and the only file covering all five screens; `…Desktop.dc.html` and `Alegere corp - layouturi.dc.html` sit beside it. |
| `docs/best-practices/product-invariants.md` | You are touching geometry, dimensions, or visual behaviour.                                                                                                                                                                 |

**While working**

| Read                                                | When                                                                                                               |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `docs/WORKFLOW.md`                                  | Starting a phase, dispatching agents, or closing one out. Includes the working conventions and evidence standards. |
| `docs/best-practices/ci-and-local-gates.md`         | Running build/test commands, changing lint or format config, adding a CI gate, or a hook blocked you.              |
| `docs/best-practices/environments-and-resources.md` | Touching any env var, secret, database, or provisioned resource.                                                   |
| `docs/best-practices/engineering-conventions.md`    | Writing code — naming, structure, DRY/KISS/SOLID.                                                                  |
| `docs/best-practices/browser-and-visual-qa.md`      | Verifying a visible or interactive surface.                                                                        |
| `docs/best-practices/documentation.md`              | Writing a decision record or milestone update.                                                                     |
| `docs/AGENT_ROLES.md` and `docs/agents/`            | Dispatching a sub-agent; role cards and hand-off formats.                                                          |

**Current state and history**

| Read                        | When                                                                                                |
| --------------------------- | --------------------------------------------------------------------------------------------------- |
| `docs/milestones/README.md` | You need the phase map and what is in flight.                                                       |
| `docs/milestones/M<n>-*.md` | Working on a phase — goal, scope, falsifiable acceptance criteria.                                  |
| `docs/decisions/`           | Before re-deciding anything. A dated record supersedes earlier prose; do not silently overturn one. |
| `docs/runbooks/`            | Operating something live, e.g. restoring the database.                                              |

Later decisions belong in `docs/decisions/`; acceptance criteria and phase plans in
`docs/milestones/`.

## Skills

Use the repository-local skill guides when their trigger matches:

- `docs/skills/lemnaria-3d-reference/SKILL.md` — planning, implementing, or reviewing the kitchen 3D
  model.
- `docs/skills/lemnaria-delivery-workflow/SKILL.md` — phase planning, QA, review, or documentation
  close-out.

Avoid vendoring large generic third-party guidance; this workspace already supplies focused
React/Next.js, browser, image, and document skills.

## Commands

`pnpm check` before a commit that closes a phase, `pnpm ci:local` before every push. Full command
list and the hook rules: `docs/best-practices/ci-and-local-gates.md`.

@RTK.md
