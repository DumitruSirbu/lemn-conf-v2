# Lemnaria delivery workflow

**The single authoritative delivery process.** It decides *how* work is dispatched, tested, reviewed
and closed. A milestone plan or a dated ADR decides *what* to build.

Until 2026-08-25 this was split between this file and a second document, `dev-qa-cycle.md`, which
duplicated three of its sections and contradicted none of them. That file is gone; its rules are
below. Two process documents meant a
session could read one and miss the other — which happened, and cost a whole wave its QA and review
round. There is now one.

## One phase

1. **Plan.** Write a small phase plan in `docs/milestones/`: goal, scope, constraints, work items,
   falsifiable acceptance criteria, risks, and verification method. Record decisions with the date,
   alternatives considered, and why the selected option won.
2. **Implement.** Give one implementer a narrow, explicit dispatch — see *Scope discipline* below.
   It changes only the requested production surface and its paired tests. If the work conflicts with
   a recorded decision, stop and return it to planning rather than silently re-deciding it.
3. **QA.** Adversarial, and it **gates step 4**. See *QA before review* below.
4. **Review.** Only once step 3 is green. Clean-code and product-logic review in parallel when there
   is a real diff. Add visual review for visible or interactive work, and security review for public
   endpoints, auth, persistence/share links, customer data, generated documents/email, or dependency
   changes. See *Review continuity* for how rounds after the first are run.
5. **Verify and close.** The coordinating agent checks every material finding against the diff and
   runs the relevant commands itself. See *Trust but verify*.
6. **Commit.** Formatting and linting are a precondition, not a courtesy. `.githooks/pre-commit`
   formats the staged files, re-stages them, and runs `pnpm lint`; a lint error aborts the commit.
   Run `pnpm ci:local` before pushing — `.githooks/pre-push` enforces it. Never use `--no-verify`.
   See `docs/best-practices/ci-and-local-gates.md`.
7. **Archive.** A phase closes only when every acceptance criterion is met — an unmet gate keeps it
   open, however much code has landed. On close:
   - Update `docs/STATUS.md`: move the phase to **Done**, summarise what shipped, and rewrite "What
     is open right now" and "What to do next".
   - Move the plan to `docs/milestones/done/` and add the stop-reading banner under its title.
   - Add its row to `docs/milestones/done/README.md`, naming where the *live* knowledge now lives.
   - Make sure the durable reasoning is in `docs/decisions/`, not only in the archived plan. ADRs are
     this repository's knowledge base; a milestone plan is an intention with a shelf life.
   - Remove scratch artifacts from the repository.

Repeat implementation through review until blockers are gone and any intentionally deferred issue is
named with an owner or future phase.

## Scope discipline

- At most **five must-fix items** per implementation dispatch and, where practical, **five files**.
  Split larger work into sequential waves with a mini-review between them.
- Touch the minimum surface the dispatch requires. Do not fold opportunistic refactors into a
  behavioural fix.
- Do not reinterpret a locked decision while implementing. Surface the conflict and revise the
  decision before changing the code.
- Each behaviour change needs a paired regression test, or an explicit reason it cannot have one —
  and that reason is an architectural concern to record, not a silent exception.

## QA before review

- QA runs before reviewers. **A reviewer is not a substitute for tests.**
- **QA gates review, and the gate is green tests — not merely "QA has run".** If QA finds failures,
  the work returns to the implementer, who fixes the source; QA then re-runs. Reviewers are
  dispatched only once the suite is green. Reviewing code that is about to change produces findings
  against a state that will not exist, and running reviewers while QA is still editing yields two
  reports describing two different trees.
- **QA is adversarial**: the implementer tests what they built, QA tests what they assumed. A test QA
  writes that fails is a *finding*. Leave it failing and report it. QA never weakens an assertion to
  make it pass and never edits production code to make its own test green — that is how a suite ends
  up asserting a defect as correct.
- Every production path gets normal-path coverage plus boundaries, empty and invalid inputs,
  transitions, and anti-invariants. Test what must not happen, not only the desired output.
- Sweep a meaningful input range when arithmetic or generation is involved; a few hand-picked
  examples are not evidence that the transitions work. For generated data assert properties — no
  overlap, no unclassified gap, valid schema output.
- **A clean report from an adversarial pass is a weak result, not a strong one.** This project has
  shipped a test that asserted a defect as correct, two boundary greps that matched nothing while
  reporting green, and two commands that reported success while doing nothing. "No findings" must be
  earned and evidenced.

## Review continuity

- **Number findings by round and item** (`R1.1`, `R1.2`, `R2.1`). A fix dispatch must name the
  findings it addresses.
- Keep the same QA and reviewer agents for follow-up rounds wherever they are still available. Give
  them the current diff and the earlier finding identifiers so they verify the fix instead of
  rediscovering context.
- Send fixes back to the **original implementer** where possible, for the same reason: it holds the
  context that produced the code.

## Acceptance criteria

State observable invariants, including what must not happen. Name input boundaries and failure
modes. For 3D work, include the coordinate/anchor rule, scaling rule, structural dependencies, and
the visual evidence needed to verify the result.

## Working conventions

- For meaningful product phases, use the agent team as the default: architect → scoped developer
  wave → adversarial QA → parallel logic/quality/visual review (plus security when triggered) →
  orchestrator verification → scribe close-out.
- Plan before implementation when a change has multiple components, changes a product invariant, or
  affects a public configuration/pricing contract.
- For visual or interactive work, verify the real surface at the agreed mobile viewport. Keep
  temporary screenshots out of the committed project unless the user asks to retain them.
- Do not add tool-specific hooks, credentials, timers, or machine-local settings from the previous
  Claude project. They are not portable project configuration.

## Team coordination

The main agent owns the working tree and the final outcome. It may delegate bounded work to the
roles in `AGENT_ROLES.md`, but it retains integration, final verification, and user-facing
communication.

## Trust but verify

- A green build, lint pass, and existing tests do **not** by themselves prove the acceptance
  criteria.
- Before declaring an item complete: inspect the claimed lines, confirm its test exists, run the
  relevant commands, and record the observed outcome.
- Review the actual diff before accepting an agent's summary. Agent reports are evidence leads, not
  proof.

## Evidence standards

- A green command is evidence only when the agent actually ran it and reports the command and result.
- A reviewer finding needs a concrete file and line plus a scenario or invariant it violates.
- A mobile claim needs a real capture or interaction observation at the agreed viewport; tests alone
  do not prove it.
- Documentation describes what has landed, never a plan presented as shipped functionality.
- Copy quantitative claims directly from an inspected source. Do not invent counts or estimates.
