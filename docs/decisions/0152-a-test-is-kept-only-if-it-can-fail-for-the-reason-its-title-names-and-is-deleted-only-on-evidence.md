# ADR 0152 — A test is kept only if it can fail for the reason its title names, and it is deleted only on evidence

Status: Accepted, **except decision 4 (the audit recurs, incrementally), which is the coordinator's proposal and is not
ruled.** The owner's sentence in *Context* is the ruling; every rule below says whose it is.
Date: 2026-10-08
Type: Decision
Milestone: M8 (raised by `docs/TESTS_REVIEW.md` and its fix-up, on branch `m8-review-contact-success`)
Extends: [ADR 0093](0093-a-rule-the-shipped-kitchen-cannot-exercise-owes-a-witness-not-a-moved-fixture.md),
[ADR 0121](0121-a-thing-is-identified-by-what-it-is-and-the-discriminating-case-is-the-one-nobody-screenshots.md)

The record was written by the documentation scribe from `docs/TESTS_REVIEW.md` (lines 1–103, *Progress* and *Statistics*)
and the coordinator's hand-over of 2026-10-08. The scribe has no shell and ran nothing. Every figure is copied from the
*Statistics* section, which that file says was counted by script from the per-row Status cells; the mutations behind it
are QA agents' recorded runs, and the coordinator re-ran the suites, not the mutations. What reached the scribe only
through the coordinator is marked **[relayed]**: the owner's words, the architect's rulings, and the instances cited
from the QA and review reports. The scribe did not re-derive them. Tiers: **[doc]** quoted from a file read,
**[relayed]**, **[inf]** inference.

## Context

The owner asked how many tests "only simulate a check, exist to be green, repeat another test, are obsolete, or are
useless." The review listed 674 rows [doc, `TESTS_REVIEW.md` *Verdict*]; the fix-up settled all of them [doc,
*Statistics*: "All 674 rows are settled"]. The suites shrank and two production defects came out of it (`38fa058`,
`6eef46c`). This record keeps what the work taught about writing and auditing a test, each rule with the instance that
paid for it, because a rule without its instance gets argued away.

**The owner, 2026-10-08, verbatim [typed to the coordinator, relayed]:** *"I want from all this process to create a
rule/skill and maybe a special agent role that time to time I will trigger to make this checks. Its goal will be to keep
tests really usefull."* The owner also approved the two production changes the cleanup needed to replace source-text
tests (*"yes, do both changes"*): exporting `columnDecidesItsDepth`, and an ESLint rule for `shell-design.ts` [relayed;
landed in `1b162cc`, `84fccd7`, per *Progress*]. **Nothing else below is the owner's ruling.**

## Decision

### 1. Rules for writing a test (the coordinator's proposal, from the review's finding [doc, lines 67–70] that the dominant cause of duplicates is each wave's adversarial `qa-*` file restating cases the original test already had)

1. **A new test is shown red under a mutation of the behaviour its title names, or it is not reported as coverage.**
2. **An adversarial file adds cases the existing test lacks; it does not restate them.**
3. **A structural rule goes to lint or `tsc` first.** A source-text scan is the last resort, and its title says it reads
   source and what it cannot see (decision 3b).
4. **A constant that is a rule keeps one literal pin.** Instance [relayed]: the last deletion batch removed both literal
   pins of `MIN_WIDTH_M`, each justified by the other; one was restored (`0a351f0`, in *Progress*).
5. **A sweep states a floor per arm.** Instances [relayed]: row 1792, and the `shell-design.adversarial` wall-only arm
   (0 of 8534 tiles), both loops that ran zero times on real code. The convention already existed in general form
   (`engineering-conventions.md`, *A predicate over a band, and a sweep with no floor per arm*); these are two more
   instances of it.

### 2. Rules for auditing and deleting (what the fix-up measured)

1. **Mutate before any verdict.** Reading was wrong often enough to matter. From *Statistics* [doc]: the status records
   the review as wrong on **52 of 674 rows (8%)**, by category 31 of 157 proven "cannot fail" (20%), 7 of 38 "survived,
   no witness" (18%), 3 of 7 "by reading only" (43%), 8 of 406 near-duplicates (2%), 1 of 11 obsolete, 2 of 55 useless.
   *Statistics* states its own caveat, and it is quoted: **"The 'review wrong' count is a floor: it counts only rows
   whose status says so in words."**
2. **A duplicate is deleted only when the test named to keep goes red by assertion under a mutation of the shared
   code.** The review's named "Keep" was wrong repeatedly (rows 1449, 1583, 2175, 2555 and others [relayed]), and two
   tests filed as duplicates were themselves fake checks, rows 1558 and 1792 [doc, *Statistics*: "each was the test named
   to keep or the last guard, and each passed with the behaviour removed. Both are real now"]. Seven deletions were made
   without a mutation, on the architect's rule (decision 3d) [doc].
3. **A mutation that reddens nothing in the files you ran is not evidence until the whole package suite has seen it.**
   Instances [relayed]: two "gaps" reported in the last domain batch were covered by tests outside the two files the
   agent ran (`0a351f0`); and a prefix pinned in `apps/web` was invisible to a domain `src` mutation, because the web app
   reads the built output (the existing rule: `engineering-conventions.md`, *A surviving mutation may not have been
   applied*).
4. **A timeout is not a red.** Instance [relayed]: row 2639, whose "Keep" could only fail by a 30-second timeout (see
   decision 3c).
5. **An independent logic review checks every batch of deletions.** Eight reviews ran; every one found the batch sound
   and nothing was restored [doc, *Statistics*, *How it was checked*]. **This is the reviewers' reading: they read
   through git and ran nothing** [doc, same place]. It is evidence that no deletion removed a requirement, not that no
   fake check remains.

### 3. The architect's four standing rules, verbatim [relayed by the coordinator from the architect's report of 2026-10-08]

The architect stated that no earlier record rules on (a) to (d), from its own grep of `docs/decisions` and
`docs/best-practices`. The sweep below is the scribe's own and found none either.

> (a) A self-test of a test-support instrument is kept when the sweep it serves asserts a negative, because a detector
> that never fires passes every negative. It must be titled as a control, feed one input the detector must flag and one it
> must pass, and is exempt from "no production input" findings. It is deleted when no edit to the instrument could redden
> it.
>
> (b) A source-text scan of production is permitted only for an absence claim a dated decision records (no second reader,
> no caller), because absence has no behaviour to observe. Its title says it reads source, a behaviour test owns the
> behaviour, and it is never the sole guard of a rule. Prefer an AST lint selector, since a substring passes a computed
> key or a renamed variable.
>
> (c) A test that can fail only by timing out is not a guard. Assert the observable before awaiting the promise that would
> hang, because a timeout names no rule and costs the full timeout.
>
> (d) A duplicate is deleted without a mutation only when its assertion is logically implied by its twin's over the
> identical input and call, shown by reading and recorded as such. Where implication rests on something incidental and no
> permitted mutation separates them, keep both. A migration or the DML is never mutated to decide it.

### 4. The audit recurs, incrementally (the coordinator's proposal, put to the owner in conversation; the owner did not object and did not rule: **proposed, not ruled**)

The owner triggers the audit from time to time. **By default it covers the test files changed since the last audited
commit**; a full pass runs only on request in words. The role card is
`.claude/agents/configurator-test-auditor.md` (the Codex twin is `docs/agents/test-auditor.md`) and the procedure is
`docs/skills/lemnaria-test-audit/SKILL.md`; its reports go to `docs/test-audits/<date>-<scope>.md`. **Both the role and
the skill exist as of this record; no audit has been run with them.** The cost reference is the first full pass:
`TESTS_REVIEW.md` *Statistics* [doc].

## Records swept before deciding, and how each is settled

Per the owner's standing instruction (`docs/WORKFLOW.md`, *Sweep the decision records before deciding*). The scribe grepped
`docs/decisions/` for mutation, sabotage, source-text scans, duplicate tests, fake checks and vacuous assertions (84
matching lines in 33 files) and read the records below; the others matched on unrelated uses of the words.

| Record | What it says | How it sits with this one | Date |
| --- | --- | --- | --- |
| [ADR 0093](0093-a-rule-the-shipped-kitchen-cannot-exercise-owes-a-witness-not-a-moved-fixture.md) | A rule the shipped kitchen cannot exercise owes a declared witness, not a moved fixture; QA measured a removal that left 4,554 tests green | **Extended.** Same family: a green suite over a deleted rule. This record adds the cleanup's rules for existing tests; 0093 owns the witness for an unexercised rule | 2026-09-06 |
| [ADR 0121](0121-a-thing-is-identified-by-what-it-is-and-the-discriminating-case-is-the-one-nobody-screenshots.md) | A thing is identified by what it is, and the discriminating case is the one nobody screenshots | **Extended** [inf]. Decisions 1.1 and 2.1 read as its discriminating-case rule applied to a test's own title | 2026-09-16 |
| [ADR 0123](0123-a-ruled-behaviour-whose-population-empties-keeps-its-branch-and-converts-its-sweep-coverage-into-a-declared-witness.md) | A ruled behaviour whose discriminating population empties keeps its branch; its sweep coverage becomes a declared witness | **Consistent.** Decision 1.5 (a floor per arm) is the same failure, a sweep whose population is empty, seen in the existing tests | no Date line; generalises a ruling of 2026-09-17 |
| [ADR 0102](0102-a-recorded-source-must-explain-its-depth-and-a-second-authority-in-a-test-is-the-defect-laundered.md) | A second authority written into a test is the defect laundered | **Consistent.** A test that asserts on values it declared itself is the review's shape 1 | 2026-09-08 |
| [ADR 0116](0116-a-type-that-refuses-an-undesigned-shape-is-a-guard-and-the-cast-that-witnesses-it-is-confined-to-a-test.md) | A type that refuses an undesigned shape is a guard; the cast that witnesses it stays in a test | **Consistent**, and it is the precedent for decision 1.3: put the structural rule in the type system first | 2026-09-14 |
| [ADR 0119](0119-a-remembered-fact-about-this-repository-is-a-claim-to-recheck-and-true-at-head-is-not-true-at-the-end-of-the-milestone.md) | A remembered fact is a claim to re-check | **Consistent.** The review's own line numbers are those of `fd2c958`; the file says to re-locate by title | 2026-09-15 |
| [ADR 0128](0128-live-persistence-suites-serialise-through-a-declared-transaction-scoped-readers-writer-lock.md) | Names "2 lock self-tests", files that contend only on a per-run random key | **Consistent** with decision 3a. A self-test of test-support infrastructure already existed; 3a rules when one is kept | 2026-09-22 |
| [ADR 0136](0136-code-and-test-comments-carry-only-what-nothing-else-can-and-history-lives-in-the-records.md) | Comments carry only what nothing else can; a stripping pass is checked with `git grep` for `readFileSync` | **No conflict.** It is about comments; 3b is about tests that read source | 2026-10-05 |
| [ADR 0151](0151-a-test-may-delete-the-rows-tests-added-and-never-a-row-a-production-user-added.md) | A test may delete rows tests added, never a production user's | **Orthogonal.** About database rows. Decision 3d's "a migration or the DML is never mutated" is the same caution applied to the audit | 2026-10-08 |
| `docs/WORKFLOW.md` R5, R6, R9 | R5: a check that cannot examine its subject is not a gate. R6: sabotage in both directions is the verification; reading is not; a sabotage run against an already-red suite is not a measurement. R9: evidence runs as `rtk proxy` | **R6 is the rule this record applies to existing tests**; decision 2.1 and 2.2 are R6 with the cleanup's measured cost. R5 is decision 2.3's ground. Nothing here contradicts them | not dated in WORKFLOW.md |
| `engineering-conventions.md`, *Three guards that look thorough and cannot fail*; *Coverage an adversarial pass owes* | Same-source comparisons; a surviving mutation may not have landed; a sweep with no floor per arm | **Held, not restated.** The rules above are added to those sections as pointers; the reasoning stays here | 2026-09-03 and 2026-09-04 (instances) |

**Result of the sweep:** no record rules on the architect's (a) to (d), and none says an audit recurs. Nothing earlier is
overturned. ADR 0078, 0084, 0031, 0022 and 0150 receive dated notes of their own the same day (below).

## Alternatives considered

- **Delete on the review's reading alone.** Rejected by the measured wrongness in decision 2.1: a wrong "Keep" would have
  deleted the last guard of a behaviour.
- **Keep every adversarial `qa-*` restatement as defence in depth.** Rejected [inf]: the fix-up deleted 453 rows and the
  suites kept their guards; a duplicate that no mutation separates from its twin costs run time and review attention and
  adds no protection. Decision 3d keeps both where the implication is incidental.
- **A standing CI gate for fake checks.** Not built [inf]: the shapes need judgement (a read of the title against the
  assertion) that a script cannot make; the audit is a triggered role instead. A narrow script such as the lint rule for
  `shell-design.ts` is the form that did work.

## Consequences

- `engineering-conventions.md` carries the writing rules and the audit rules, once each, as pointers to this record.
- The skill and the role exist; **no audit has been run with them**, so nothing is known about how they behave.
- Many behaviours now rest on one test each. The QA agents listed them per wave but the lists were not collected
  [doc, `TESTS_REVIEW.md`, *What is still open*]; the next audit should not treat "one test" as a finding.
- Open and recorded in the backlog: the metres-field dangling separator (no record decides it), the `test.fixme` of row
  2881, a third copy of the undeclared-or-offers check, and `e2e-shard-budget`, which fails at `ee834b6` and blocks a push.
- Decision 4 stands as a proposal until the owner rules.
