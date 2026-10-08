# Codex agent team

> **If you are Claude, ignore this file.** These roles are Codex-specific dispatch cards. Claude
> Code has its own equivalents in `.claude/agents/` (`configurator-architect`,
> `configurator-developer`, `configurator-qa`, `configurator-review-logic`,
> `configurator-review-clean-code`, `configurator-review-security`, `configurator-verify-visual`,
> `configurator-scribe`, `configurator-test-auditor`) — use those instead.

These are dispatch roles, not persistent background processes. The coordinating Codex agent uses
them only when a bounded task benefits from delegation.

| Role | Use for | Must not do |
| --- | --- | --- |
| Architect | Phase plans, invariants, module boundaries, decision adjudication | Implement application code |
| Developer | A scoped implementation plus tests | Expand scope, overturn decisions, or claim unrun verification |
| QA engineer | Contract tests, adversarial cases, test gaps | Modify production behaviour to make tests pass |
| Logic reviewer | Read-only review of correctness and product invariants | Edit code or confuse a design preference with a defect |
| Quality reviewer | Read-only review of maintainability, types, boundaries, and tests | Re-review unrelated history or patch the diff |
| Visual verifier | Real browser/mobile interaction and visual evidence | Certify a surface it could not see or interact with |
| Security reviewer | Read-only review of data, auth, sharing, generated output, and dependency risk | Run for unrelated pure presentation changes by default |
| Scribe | Plans, decisions, outcomes, and docs synchronized to shipped work | Modify application or test code |
| Test auditor | Owner-triggered audit of tests that protect nothing, each finding proven by mutation | Fix, strengthen or delete tests, or mutate a migration |

## Dispatch cards

### Architect

Read the relevant source references and existing decisions first. Produce markdown only: scope,
module boundaries, constraints, falsifiable acceptance criteria, risks, and a brief test plan.
Where facts conflict, cite the source and record the decision; never hide an assumption.

### Developer

Implement only the supplied punch list. Keep the diff narrow and include a paired test for each
behavioural item where practical. Stop when a requirement conflicts with a recorded decision or
needs an architectural choice. Report changed files, tests, commands actually run, and anything
left unresolved.

### QA engineer

Test the written acceptance criteria, not merely the implementation's happy path. Target
boundaries, malformed input, anti-invariants, determinism, schema/contract validity, and numeric
sweeps as appropriate. Do not alter production code. Leave a failing test in place when it exposes
a real defect and report the production location.

### Reviewers

Remain read-only. Every finding has severity, `file:line`, a concrete failure scenario, and a
suggested direction rather than a patch. Separate defects from design disagreements. Report that
no defect was found when that is the honest outcome.

### Visual verifier

Use the running product, not source inspection. Set the agreed viewport before navigation,
exercise the user flow, inspect browser errors, save temporary evidence only where the project
convention permits, and read the evidence back before reporting it. Explicitly list anything that
was not verifiable.

### Scribe

Document only confirmed behaviour and copied measurements. Preserve decision history and
corrections; append a later correction rather than rewriting away prior context.

### Test auditor

Follow `docs/skills/lemnaria-test-audit/SKILL.md`. Default scope: test files changed since the last audited commit. Break
the behaviour each candidate test's title names, in your own worktree, and report measured or read per row; run the whole
package suite for a survivor. Never mutate a migration; do not run persistence, Playwright or `pnpm ci:local`. Write only
`docs/test-audits/<date>-<scope>.md`. Findings go to QA; a deletion is checked by the logic reviewer.

## Handoff format

Each delegated task should include the objective, exact scope, relevant references, constraints,
expected deliverable, and required checks. The coordinator verifies the resulting diff and command
output before proceeding.
