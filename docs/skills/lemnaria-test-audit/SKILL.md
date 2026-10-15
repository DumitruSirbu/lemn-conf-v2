---
name: lemnaria-test-audit
description: Audit the Lemnaria test suites for tests that give no real protection (cannot fail for the reason their title names, near-duplicates, obsolete, useless), proving every finding by mutation, and write the findings report.
metadata:
  short-description: Lemnaria test audit
---

# Lemnaria test audit

Followed by `.claude/agents/configurator-test-auditor.md` (Codex: `docs/agents/test-auditor.md`). The reasoning, the
instances and the standing rules are in
[ADR 0152](../../decisions/0152-a-test-is-kept-only-if-it-can-fail-for-the-reason-its-title-names-and-is-deleted-only-on-evidence.md);
the writing rules are in `docs/best-practices/engineering-conventions.md`, *Tests*. **This skill and the role exist as of
2026-10-08; no audit has been run with them yet**, so treat the procedure as unproven and say so in the first report.

## When to run, and the scope

**Run at each milestone's close** (`docs/WORKFLOW.md` step 7; the owner's ruling, ADR 0152 Amendment A) **and whenever the
owner asks.** At a close the scope is that milestone's test work. **Default scope: the test files changed since the last audited commit**,
found with `git diff --name-only <commit>..HEAD`, where `<commit>` is the audited commit recorded in the newest report
under `docs/test-audits/`. When there is no report yet, **the baseline is the commit that closes the tests review on
`m8-review-contact-success`, on or after `35a3974`** (it follows from the owner's rulings; the owner did not name the commit,
and the first report records the exact hash). The first full pass audited `fd2c958` (`docs/TESTS_REVIEW.md`) and the fix-up
since then changed 360 test files, so do not use `fd2c958`. A full-suite pass only when the dispatch asks for it in words. That the audit
recurs this way is **the owner's ruling of 2026-10-08, "Incremental (Recommended)"** (ADR 0152 decision 4). The report records the audited commit.

## What to look for

Six shapes of a fake check: `docs/TESTS_REVIEW.md` lines 42–66 (values the test declared itself; a regex over source
standing in for behaviour; both sides from the same source; a fixture that does not isolate the rule; an assertion too
loose to notice; a loop or early return that runs zero assertions). Do not restate them in a report; cite the shape.
The fix-up added two:

- **A loop or arm that runs zero times because its fixture never produces the population.** Look for a sweep with no
  stated floor per arm.
- **A test that can only fail by timing out.** It names no rule and costs the full timeout.

Besides fake checks: **near-duplicates**, **obsolete** tests (the subject is gone: search for it) and **useless** tests.

## Procedure

1. **Static triage.** Read the diff's test files and list candidates: no assertion, a self-comparison, only weak
   matchers, mock-only assertions, identical bodies, source-text reads, loops with no floor.
2. **Full read** of every file in scope against the production code each test names. A reading is a lead, not a finding:
   on the first full pass the review's reading was wrong about one proven "cannot fail" row in five.
3. **Verify every candidate by mutation.**
   - Work in your own git worktree. Take a **byte copy** of the one production file, edit it, run the candidate test,
     then **restore as its own command** (never inside a pipe) and verify with `cmp`. One file at a time.
   - Break the behaviour the **title** names. Red by assertion is the evidence; the test must go red for that reason.
   - A survivor: run the **whole package suite**, so you can name the test that did go red. A mutation that reddens
     nothing in the files you ran is not evidence. If nothing goes red anywhere, say "survived, no witness".
   - **A timeout is not a red.** A suite that was already red is not a measurement.
   - **Rebuild `dist` after mutating a package another package reads** (the web app reads the domain's build, not its
     `src`), or the mutation has not landed.
4. **Second read for duplicates, defending each test.** Name the test to keep. It must itself go red under a mutation of
   the shared code. Where two tests cannot be separated by a permitted mutation, apply rule (d) below.

## What is never mutated, and what the auditor does not run

- **Never mutate** a migration, or anything that changes what is written to a database.
- **Do not run** the persistence suite, Playwright, a dev server, or `pnpm ci:local`. Rows that need them are reported
  "by reading" for the coordinator to settle in the main checkout.
- Never `git checkout`, `restore`, `stash`, `clean` or `reset`; never push; edit no test and no production file.

## The standing rules

The architect's (a) to (d) are in ADR 0152 decision 3 and are not restated here. In brief: (a) a self-test of a
test-support instrument is kept only as a control; (b) a source-text scan of production is for an absence claim a dated
decision records; (c) a timeout is not a guard; (d) a duplicate is deleted without a mutation only when its assertion is
implied by its twin's. **Do not report** a self-test, a licensed source scan, or an inseparable duplicate without
checking the rule for that case.

## The report

Write `docs/test-audits/<date>-<scope>.md`. It holds:

- the **audited commit range** and the files read;
- a **verdict table by category** (cannot fail, near-duplicate, obsolete, useless), with counts, and the **"cannot fail" rows
  first, with their count stated plainly**: that count decides whether the milestone can close;
- **per-row tables**: file and line, test title, cases, proof, why, and a **Status** column **left empty** for the fix-up;
- each row **labelled measured or read**; a **"Keep" note** on every duplicate row, saying whether the kept test went red;
- an **appendix of candidates raised and cleared**, so they are not raised again;
- the **limits**: what was not run, and that **a file with no row is not proven clean**.

Lead with the complete list of files you changed, and bound your reply to the coordinator.

## What happens next

**The gate (the owner's middle rule, ADR 0152 Amendment A):** every "cannot fail" finding is fixed before the milestone is
marked Done; duplicate, obsolete and useless findings may be deferred to the backlog or the next milestone, and the report
records which were deferred and where. Unruled: whether a "deleted by reading" duplicate may be deferred, and who decides when
a "cannot fail" finding needs a product decision the milestone cannot make (by default it keeps the milestone open and goes to
the owner).

Findings go to `configurator-qa`. A deletion QA makes is checked by `configurator-review-logic`. A strengthened test that
goes red on real code goes to `configurator-architect`; only a ruled defect goes to `configurator-developer`. **Statistics
are counted from the Status column by script, never written by hand.**

## What the first full pass cost and found

From `docs/TESTS_REVIEW.md`, *Statistics* (counted by script from its Status cells): 674 rows settled, 126 made real, 453
deleted, 24 partly, 20 kept because the review was wrong, 51 kept as honest. Test files changed: 360, with 4,005 lines
added and 8,716 removed (`git diff --shortstat`). The review was wrong on 52 rows (8%), a floor. Two production defects
were found and fixed. Eight independent logic reviews, nothing restored.
