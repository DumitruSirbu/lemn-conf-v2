# Lemnaria delivery workflow

This is the Codex-native version of the workflow used by the previous configurator. It is designed
to be useful before the new app's stack, test commands, and browser setup are known.

## One phase

1. **Plan.** Write a small phase plan in `docs/milestones/`: goal, scope, constraints, work items,
   falsifiable acceptance criteria, risks, and verification method. Record decisions with the date,
   alternatives considered, and why the selected option won.
2. **Implement.** Give one implementer a narrow, explicit dispatch. It changes only the requested
   production surface and its paired tests. If the work conflicts with a recorded decision, stop
   and return it to planning rather than silently re-deciding it.
3. **QA.** Add or improve tests for the stated contract. Cover the normal route and the boundary,
   invalid, empty, and repeatability cases that apply. Numeric or generative logic should be swept
   over a meaningful range rather than demonstrated by a few hand-picked examples.
4. **Review.** Run clean-code and product-logic review in parallel when there is a real diff. Add
   visual review for visible or interactive work, and security review for public endpoints, auth,
   persistence/share links, customer data, generated documents/email, or dependency changes.
5. **Verify and close.** The coordinating agent checks every material finding against the diff and
   runs the relevant commands itself. Only then update the phase outcome and documents that the
   change invalidated.
6. **Commit.** Formatting and linting are a precondition, not a courtesy. `.githooks/pre-commit`
   formats the staged files, re-stages them, and runs `pnpm lint`; a lint error aborts the commit.
   Run `pnpm check` yourself before the commit that closes a phase — the hook skips typecheck and
   tests on purpose (the persistence suite needs a live database). Never use `--no-verify`. See
   `AGENTS.md` § "Rule — format and lint before every commit".

Repeat implementation through review until blockers are gone and any intentionally deferred issue
is named with an owner or future phase.

## Acceptance criteria

State observable invariants, including what must not happen. Name input boundaries and failure
modes. For 3D work, include the coordinate/anchor rule, scaling rule, structural dependencies, and
the visual evidence needed to verify the result.

## Working conventions

- For meaningful product phases, use the agent team as the default workflow: architect → scoped
  developer wave → adversarial QA → parallel logic/quality/visual review (plus security when
  triggered) → orchestrator verification → scribe close-out. Reuse the same reviewer agents on
  follow-up rounds where possible.
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

## Team coordination

The main Codex agent owns the working tree and final outcome. It may delegate bounded work to the
roles in `AGENT_ROLES.md`, but it must retain integration, final verification, and user-facing
communication. On a second review round, continue with the same reviewer where possible so prior
findings retain their context.

## Evidence standards

- A green command is evidence only when the agent actually ran it and reports the command/result.
- A reviewer finding needs a concrete file and line plus a scenario or invariant it violates.
- A mobile claim needs a real capture/interaction observation at the agreed viewport once a UI
  exists; tests alone do not prove it.
- Documentation describes what has landed, never a plan presented as shipped functionality.
- Copy quantitative claims directly from an inspected source. Do not invent counts or estimates.
