# Codex dispatch profiles

> **If you are Claude, ignore this directory.** These profiles are Codex-specific (model ids like
> `gpt-5.6-sol`, `reasoning_effort` frontmatter). Claude Code has its own equivalents in
> `.claude/agents/` (`configurator-architect`, `configurator-developer`, `configurator-qa`,
> `configurator-review-logic`, `configurator-review-clean-code`, `configurator-review-security`,
> `configurator-verify-visual`, `configurator-scribe`, `configurator-test-auditor`) — use those instead.

These profiles are adapted from the eight definitions in the reference project's `.claude/agents/`.
They are prompt cards for Codex's on-demand agent team: include the applicable card when
delegating, while the coordinator retains final control of the diff.

| Profile | File | Use |
| --- | --- | --- |
| Architect | `architect.md` | Plan a milestone or decide a cross-cutting contract |
| Developer | `developer.md` | Implement a narrow, explicit slice |
| QA | `qa.md` | Build adversarial contract coverage |
| Clean-code reviewer | `review-clean-code.md` | Read-only maintainability review |
| Logic reviewer | `review-logic.md` | Read-only correctness/invariant review |
| Security reviewer | `review-security.md` | Read-only data and attack-surface review |
| Visual verifier | `verify-visual.md` | Browser/mobile evidence for UI work |
| Scribe | `scribe.md` | Keep records and product docs accurate |
| Test auditor | `test-auditor.md` | Find tests that protect nothing, proven by mutation (at each milestone's close and when the owner asks) |

The source roles contained old Next.js paths, port numbers, test commands, and known defects.
Those details are intentionally not copied into this new project; add them to `AGENTS.md` only
once the new app establishes them.

## Model mapping

The source project's `opus` roles map to `gpt-5.6-sol`; its `sonnet` roles map to
`gpt-5.6-terra`. Terra is the balanced model suited to the former Sonnet work. Luna is the fast,
cost-oriented option and is not a direct Sonnet equivalent; reserve it for tightly scoped,
low-risk tasks where speed matters more than depth. The `model` and `reasoning_effort` frontmatter
in each profile is the coordinator's dispatch instruction. When spawning a Codex subagent, pass
those exact values to the agent call.
