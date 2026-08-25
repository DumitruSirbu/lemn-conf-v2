# Lemnaria Configurator — project guide

This repository builds the next Lemnaria kitchen configurator: a pnpm monorepo with an I/O-free
domain package, a Three.js adapter, a persistence package that is the only place a Postgres driver
appears, and a Next.js App Router app.

This file is loaded every session, so it stays short. It routes; the linked documents carry the
detail. **Read the linked document before acting in its area** — do not work from this summary.

## Read `docs/STATUS.md` second — before anything else

It is the single source of truth for **where the project stands**: what is built, what is open right
now, and what to do next. It exists so you never have to read eight milestone plans to orient
yourself, and it tells you which of them are worth opening at all.

Milestones marked **Done** are archived in `docs/milestones/done/` and must **not** be read — their
plans describe intentions that have since shipped or been superseded, and acting on one reintroduces
a design the project abandoned. Business logic lives in `docs/decisions/`: those records are this
repository's knowledge base and the durable "why" behind the code. A dated decision beats any
milestone prose.

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

| Read                                                | When                                                                                                                                                                                      |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/best-practices/dev-qa-cycle.md`               | **The authoritative delivery process.** Read before dispatching any implementer, QA or reviewer: scope limits, QA-gates-review, finding numbering, review continuity, definition of done. |
| `docs/WORKFLOW.md`                                  | The phase cycle end to end, the working conventions, and evidence standards. Defers to dev-qa-cycle.md on dispatch and review rules.                                                      |
| `docs/best-practices/ci-and-local-gates.md`         | Running build/test commands, changing lint or format config, adding a CI gate, or a hook blocked you.                                                                                     |
| `docs/best-practices/environments-and-resources.md` | Touching any env var, secret, database, or provisioned resource.                                                                                                                          |
| `docs/best-practices/engineering-conventions.md`    | Writing code — naming, structure, DRY/KISS/SOLID.                                                                                                                                         |
| `docs/best-practices/browser-and-visual-qa.md`      | Verifying a visible or interactive surface.                                                                                                                                               |
| `docs/best-practices/documentation.md`              | Writing a decision record or milestone update.                                                                                                                                            |
| `docs/AGENT_ROLES.md` and `docs/agents/`            | Dispatching a sub-agent; role cards and hand-off formats.                                                                                                                                 |

**Current state and history**

| Read                        | When                                                                                                                                               |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/STATUS.md`            | **First, every session.** Where the project stands, what is open, what to do next.                                                                 |
| `docs/decisions/`           | The knowledge base for business logic. Before re-deciding anything — a dated record supersedes earlier prose, and must not be silently overturned. |
| `docs/milestones/M<n>-*.md` | Working on a phase STATUS lists as In progress or Planned. **Never one marked Done.**                                                              |
| `docs/milestones/README.md` | You need the phase sequence and why it is ordered that way — the plan, not the current state.                                                      |
| `docs/milestones/done/`     | Archived, do not read. Historical questions only; see its README first.                                                                            |
| `docs/runbooks/`            | Operating something live, e.g. restoring the database.                                                                                             |

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
