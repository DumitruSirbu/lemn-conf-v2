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
6. **Commit.** `.githooks/pre-commit` formats the staged files, re-stages them, and runs
   `pnpm lint`; a lint error aborts the commit. **The gate that matters is `pnpm ci:local` before
   pushing** — `.githooks/pre-push` enforces it, and nothing reaches GitHub without it.
   See `docs/best-practices/ci-and-local-gates.md`.

   **`--no-verify` is permitted on intermediate commits** (owner's direction, 2026-08-26), and this
   supersedes the earlier "never use `--no-verify`". The reason it was relaxed: with several agents
   working in one tree, a docs-only or partial commit can be blocked by another agent's
   half-finished code, and waiting on that buys nothing. What must never be skipped is the
   pre-push run — a red build still must not reach GitHub.

   Two things this does **not** license. It is not permission to skip the gate on the commit that
   closes a wave, and it is not a reason to stop reporting: a commit made with `--no-verify` is a
   commit whose lint and format state you have **not** observed, so it may not be described as
   verified. Say which commits were made that way.
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

## A wave is complete only once `STATUS.md` says so

**Every commit named `M<n> wave …` must be reflected in `docs/STATUS.md` before that wave counts as
complete.** The reflection is two things and both are cheap: the wave's state in the phase table, and
the *What to do next* section pointing at the wave that is genuinely next. Do it on the commit that
closes the wave, not in a batch later — step 7's archive rules cover a whole phase, and a phase can
run for days while several waves close inside it.

Before you call a wave done, list the wave commits and check each hash is described in
`docs/STATUS.md`:

```
git log --oneline -i --grep='^M5 wave'
```

**The `-i` is not optional.** This repository's own history writes *wave*, *Wave* and *Waves*: on M5,
`--grep='^M5 wave'` alone returns 22 commits and the case-insensitive form returns 27, silently
dropping `M5 Wave 5A`, `5B`, `5C`, `Waves 5C2 + 5C3` and `Wave 5D` — five waves of the milestone this
section was written about. The plural needs no second pattern, since `wave` is a prefix of `waves`.

This exists because it failed. On 2026-08-31 an adversarial review found `STATUS.md` and
`docs/milestones/M5-width.md` both saying waves 5D2c and 5F remained open while eight commits
implementing them were already ancestors of `HEAD`
(`testing-reports/06-docs-and-process.md`, DOC-001). `AGENTS.md` makes `STATUS.md` the file a session
reads to decide what to open and what work remains, so an under-reported wave does not merely go
stale — it dispatches work against behaviour that already shipped, and the second implementation is
found by whoever hits the conflict.

## The scribe runs after the commit, not before it

This failed again on 2026-09-05, on M6's 6K sequence and on 6Q-b/6Q-c: the wave table and several
milestone sections lagged what had actually shipped, and the gap was found only by cross-checking
`git log` by hand. **The wave table is load-bearing** — it was used the same day to answer the
owner's question about what work remains, and because it lagged, it gave the wrong answer.
A table that lags is worse than no table, because it is trusted.

Two mechanical causes, not a diligence problem:

1. **The scribe was dispatched before the commit existed**, so the hash was not yet available and
   every wave needed a second round-trip to go back and record it. When that follow-up did not
   happen, the row stayed unmarked. 6Q-b needed exactly that follow-up (`ab162ab`); 6Q-c's section
   went stale the same way, closed minutes before `14cef90` landed.
2. **Waves were run back-to-back with documentation batched to the end.** The 6K sequence
   (6K-a, 6K-b1–b3, 6K-c, 6K-d/e, 6K-f, 6K-g, 6K-h, 6K-j) ran this way, and the batch never fully
   happened before work moved on to 6Q.
3. **The check used to find the drift shared the drift's own blind spot.** The table assumes one
   wave per row; the `git log` grep used to audit it assumed one wave per commit subject. `d4e58a4`
   closes two waves (6K-d and 6K-e) in one commit tagged `(6K-d, 6K-e, step 4)`, so it was invisible
   to both at once — a check built on the same assumption as the artefact it is checking cannot find
   where that assumption breaks.

**The rule: the scribe runs after the commit, handed the commit hash and the measured gate
numbers, and a wave is not done until its table row and its milestone section say so.**
Documentation is part of finishing a wave — put it in the step order alongside implementation,
QA and review — not a catch-up task to be batched across several. The hash cannot exist before the
commit, so any earlier ordering guarantees a second pass that may never come.

## Nothing ships mid-milestone

Nothing reaches real users until every milestone is delivered, and the owner has further work planned
beyond the current milestone list. Waves are committed progressively, but no wave is deployed on its
own.

Stated by the owner on 2026-08-27, asked whether M5 wave 5B should ship ahead of 5C given that it
left a *Lățime* section rendering dead, unclickable chips on 17 seeded bodies. The answer was to keep
going and fix gaps in the wave that owns them.

**So do not stop a wave, or ask the owner to decide, merely because it leaves a user-visible surface
incomplete, inert or half-wired between waves.** Land it and let the later wave close it. A named
interim is a thing to record, not a thing to block on — wave 6Q-a shipped with the finish control
inert on a veneer kitchen, recorded in ADR 0078 decision 6 and closed by 6R.

This relaxes nothing else. Acceptance criteria, adversarial QA, the review tiers and this document's
cycle all still gate a wave. It also does not license shipping a *defect*: an interim is a surface a
later wave completes, not a wrong answer left standing.

## Scope discipline

- At most **five must-fix items** per implementation dispatch, and about **five production files** —
  their paired tests do not count toward the limit. Split larger work into sequential waves with a
  mini-review between them.

  The file number counts production files rather than everything changed because this repository
  requires a paired test per behaviour change and keeps tests in a parallel `tests/` tree, so every
  module is two files by construction. Counting both made the limit permit roughly two modules,
  which no domain wave can fit; Wave 3A had exactly five work items and produced about twenty files
  almost entirely through that pairing.

  The number is a proxy, not the point. What it protects is a reviewer's ability to hold the change
  in working memory and actually check it — a reviewer reads a module and its test together, as one
  unit. Five modules with their tests is reviewable; ten unrelated production files is not. If a
  wave has to exceed this, say so in the dispatch and add a mini-review, rather than quietly
  stretching the number.
- Touch the minimum surface the dispatch requires. Do not fold opportunistic refactors into a
  behavioural fix.
- Do not reinterpret a locked decision while implementing. Surface the conflict and revise the
  decision before changing the code.

  **Dispatch the intent, not only the change.** When a wave touches something a dated ADR decided,
  name that ADR in the dispatch and tell the implementer to check the change against its **intent**
  *before* proceeding — and to stop and report if the two disagree, rather than implementing and
  letting review find it.

  **"Intent" is the word doing the work here**, and it is the one an implementer will read loosely.
  An ADR's *decision* is usually easy to read off; its **intent is the thing that decision was
  protecting**, and that is what a change can contradict while satisfying the letter. M6 wave 6I is
  the clean case: ADR 0058 decided the pin is a *declaration*, and the mechanism underneath it stored
  the wrong quantity — the decision was satisfied and its intent was not.

  **The obligation is on both sides.** "Stop and report" only works if reports are acted on rather
  than read as an implementer being obstructive: **a wave returned to planning because it conflicts
  with a dated decision is the process working**, and the coordinator owes it an answer rather than
  an instruction to proceed.

  **It is not a licence to widen a dispatch.** An implementer that finds a conflict **reports** it —
  it does not resolve it, and it does not re-decide the ADR on its own reasoning. The convention
  exists to make *stopping* cheap, not to make *deciding* permissible. Every good outcome this
  produced came from an implementer stopping: one declining to touch a fixture file another wave
  owned, one reporting a red it had not caused instead of absorbing it, one flagging a suspected
  `wall_cabinet` branch instead of working around it.

  Two cases, both from M6 on 2026-09-03. **6I's pin rename**: the implementer checked ADR 0058's
  intent first and correctly concluded the ADR needed no change, because what was wrong was the
  quantity stored and not the decision to declare it. **6A4**: an ADR's stated rationale was found
  false *for the very bodies it was about* — by QA, after the wave. The second is the stronger
  argument, because it is what the first one avoids.
- Each behaviour change needs a paired regression test, or an explicit reason it cannot have one —
  and that reason is an architectural concern to record, not a silent exception.

## QA before review

- **QA and review are dispatched agents, always — never work the coordinator does itself.** Standing
  owner instruction, 2026-08-27: *"yes, always need to use agents"*. It is not per-wave and does not
  need re-asking. The cycle is bought to separate two questions — the implementer tests what they
  built, QA tests what they assumed — and a coordinator who implements and then self-reviews
  collapses them. Paid for twice on record: ADR 0015 notes a logic reviewer that was dispatched and
  never reported, so the coordinator verified instead and the result was explicitly weaker; and
  `wall-lift` shipped byte-identical to `wall-1door` past the coordinator's own diff review and two
  QA rounds, found only by an independent logic reviewer.
- QA runs before reviewers. **A reviewer is not a substitute for tests.**
- **QA gates review, and the gate is green tests — not merely "QA has run".** If QA finds failures,
  the work returns to the implementer, who fixes the source; QA then re-runs. Reviewers are
  dispatched only once the suite is green. Reviewing code that is about to change produces findings
  against a state that will not exist, and running reviewers while QA is still editing yields two
  reports describing two different trees.
- **Freeze the tree before dispatching QA, and say so in the dispatch.** QA's numbers are only
  attributable to a wave if the wave stopped moving first. In M6 wave 6S the coordinator dispatched
  QA while the implementer was still landing an owner-ruled scope addition: partway through the pass
  an untracked probe file vanished and two `apps/web` files appeared as modified. QA caught it,
  re-ran, and reported the collision rather than quietly averaging over it — and the wave was
  unharmed only because the change was comment-only and landed in `apps/web` rather than in
  `packages/`. **Had it landed in a package QA had already measured, none of the counts would have
  been attributable to anything.** The instruction to the implementer is explicit: *stop editing, a
  moving diff wastes the pass*. The same applies to reviewers.
- **A finding left as a failing test detects a moving tree for free.** M6 wave 6P's QA had the tree
  change under it twice mid-pass, and noticed only because a test it had deliberately left red
  suddenly went green — a loud signal that the code had changed underneath the measurement. A pass
  that reports its findings only in prose has no such tripwire: it re-runs against different code and
  reports numbers that are internally consistent and wrong. This is a second, independent reason to
  leave findings failing rather than describe them.
- **QA is adversarial**: the implementer tests what they built, QA tests what they assumed. A test QA
  writes that fails is a *finding*. Leave it failing and report it. QA never weakens an assertion to
  make it pass and never edits production code to make its own test green — that is how a suite ends
  up asserting a defect as correct.
- Every production path gets normal-path coverage plus boundaries, empty and invalid inputs,
  transitions, and anti-invariants. Test what must not happen, not only the desired output.
- Sweep a meaningful input range when arithmetic or generation is involved; a few hand-picked
  examples are not evidence that the transitions work. For generated data assert properties — no
  overlap, no unclassified gap, valid schema output.
- **A deferred test has two shapes and they mean different things. Pick deliberately.**

  | Shape | What it means | Clears |
  | --- | --- | --- |
  | `it.fails` / `test.fails` | The test **runs** and asserts the current wrong behaviour. It goes **red the moment the behaviour is fixed** | Itself |
  | `describe.skip` / `test.skip` | The test **cannot run at all** — the surface it needs does not exist | Only when someone remembers |

  **Use `it.fails` whenever a named wave is expected to change the behaviour**, because the debt
  clears itself instead of depending on memory. That is the same argument that rules out simply
  leaving the gate red: a red gate stops being information the second wave that sees it, whereas an
  expected failure keeps `ci:local` green *and* fires the moment it is obsolete. Use `skip` only
  where there is nothing to self-clear — the test cannot execute, so there is no assertion to invert.

  **Flip it, do not delete it.** A deleted expected failure is indistinguishable from one that never
  existed. Say so in the test's name and in a header comment, and name the wave that owes the flip,
  so the inheriting implementer meets the instruction rather than a puzzle.

  **Verify that the mechanism self-clears; do not assume it.** Make the assertion pass artificially,
  confirm the expected-failure marker itself goes red, then restore. This is
  `docs/best-practices/ci-and-local-gates.md`'s *"when adding a gate, prove it fails"* applied to the
  inverse case, and it is the only thing separating a self-clearing test from a permanently-green one
  that asserts nothing.

- **A clean report from an adversarial pass is a weak result, not a strong one.** This project has
  shipped a test that asserted a defect as correct, two boundary greps that matched nothing while
  reporting green, and two commands that reported success while doing nothing. "No findings" must be
  earned and evidenced.

## Batching fixes before review

Reviewers are the most expensive step, so **small fixes are batched and reviewed together** (owner's
direction, 2026-08-26). Several one-file corrections do not each earn their own round.

The counter-pressure is real and is why this is a judgement rather than a rule: a reviewer given a
smaller diff gives a better result. So batch while the fixes stay small and related; split as soon
as the diff grows or the fixes stop sharing a subject. The coordinator decides, and says in the
dispatch what it batched and why — the same way the review tier is a recorded choice.

The goal being optimised is **fewest iterations**, not fewest agents. A batch so large that review
misses something costs a second round and is the more expensive mistake.

## How much review a wave gets

Review agents are expensive — most of the cost is a cold start re-reading the spec, the ADRs and the
codebase before it reads a single line of the diff. Spending that on a mechanical rename is waste;
skipping it on domain algebra is how a wrong rule ships. Tier it deliberately, and **name the tier in
the dispatch** so the choice is recorded rather than drifted into.

| Tier | When | Who |
| --- | --- | --- |
| **Full** | Domain rules and algebra, anything anchored to a `§11` row, persistence, auth, public endpoints, customer data, dependency changes | Adversarial QA, then logic **and** clean-code review in parallel |
| **Light** | Straightforward implementation against a settled contract: adapter wiring, UI assembly, plumbing | Adversarial QA, then **one** combined reviewer |
| **Coordinator-only** | No behaviour change: renames, file moves, doc restructures, config, formatting | No agents. The coordinator verifies against the gates and states what it checked |

Coordinator-only is a real tier, not an excuse. It requires the change to be provably behaviour-free
— a green suite plus a specific check that the semantics are unchanged, such as comparing a
restructured fixture's values against `HEAD` rather than eyeballing its diff.

### Keeping review cheap without making it weaker

- **Scope the reading, not the rigour.** The largest cost is context loading. Give the reviewer the
  exact files and the two or three spec sections that govern them; do not tell it to read the whole
  specification and work out what is relevant. A reviewer that reads less but is pointed precisely
  finds more.
- **Match the model to the job.** Logic review of domain rules earns a strong model. Clean-code
  review against a written convention list does not.
- **Reuse agents across rounds** (see below). A second round with the same reviewer costs a fraction
  of a fresh one, because the context is already loaded.
- **Never economise by having the implementer review itself.** That saves the entire cost and
  provides none of the value.

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

## Sweep the decision records before deciding

Before implementing any decision — **including one the owner just gave** — sweep `docs/decisions/`
for an earlier record that says the opposite, or that is ambiguous on the same point. State what you
found, which record supersedes which, and the dates.

Standing owner instruction, 2026-09-01: *"when we take a decission need to check if earlier it was
opposite or ambiguious in another ADRs so we will avoid implementing based on outdated context and
knowledge!"* It was given while deciding the width growth floor, where the repository held three
dated records pulling in different directions on one rule — ADR 0031 forbade sub-300 mm leftover
gaps, ADR 0037 accepted leftover empty space, and ADR 0035 had already waived the same floor on
shrinks. Implementing from any one alone would have encoded outdated context as behaviour.

Grep the decisions directory for the rule **and its constants** before writing code, not after. Name
the superseded record explicitly in the new ADR and amend the old one rather than leaving two live
records disagreeing. Publishing the sweep as a table — record, what it says, how it is settled — is
the established form; see ADR 0073 onward.

## Working conventions

- For meaningful product phases, use the agent team as the default: architect → scoped developer
  wave → adversarial QA → parallel logic/quality/visual review (plus security when triggered) →
  orchestrator verification → scribe close-out.
- Plan before implementation when a change has multiple components, changes a product invariant, or
  affects a public configuration/pricing contract.
- For visual or interactive work, verify the real surface at the agreed mobile viewport. Keep
  temporary screenshots out of the committed project unless the user asks to retain them.
  **A model that computes a rendering's geometry from its inputs is not evidence about the
  rendering** — only a capture of the actual output is. M6 wave 6M's close-out recorded a projected
  overlap of 7–14 px between the overflow-warning band and a marked body's plinth line; a captured
  screenshot at 390 × 844 with `preserveDrawingBuffer` on measured 0 px in all three camera presets,
  25–49 px of clearance. Three independent errors compounded in the same direction: the model's
  "lowest body" was off-screen, it used the wrong canvas height (an overflowing design's wrapped
  price-bar warning changes `sceneHeightFor`'s subtraction), and its AABB-corner projection sat ~18 px
  below the painted geometry. Corrected 2026-09-04 — see that wave's close-out in
  `docs/milestones/M6-price-and-global-settings.md`.
- Do not add tool-specific hooks, credentials, timers, or machine-local settings from the previous
  Claude project. They are not portable project configuration.

## Team coordination

The main agent owns the working tree and the final outcome. It may delegate bounded work to the
roles in `AGENT_ROLES.md`, but it retains integration, final verification, and user-facing
communication.

### Running agents in parallel: the shared resources they collide on

Parallel dispatch is worth it, but two agents in one working tree collide in three ways, all three
observed on 2026-09-03 and each initially misread as a defect in the code.

- **The working tree.** An agent that edits while another is measuring invalidates the measurement
  and, worse, produces findings nobody can attribute. Freeze the tree for the duration of a QA or
  verification pass, and say so explicitly to both agents; when a change genuinely cannot wait, name
  its exact scope to whoever is measuring so they can decide what to re-run. **This includes a live
  `next dev` server**: editing under one makes an e2e spec fetch a chunk the bundler is mid-rewrite,
  which surfaces as `Uncaught SyntaxError: Unexpected end of input` and looks exactly like a flaky
  test.
- **The gates themselves.** Only one agent runs `pnpm ci:local`, the e2e suite or the persistence
  suite at a time — **the coordinator included**. The suites contend for more than files, and a
  coordinator verifying while an implementer is still running its own gate produces failures in both
  that belong to neither.
- **Port 4320.** One dev server at a time. An agent that needs the port asks; an agent that finds it
  held **does not kill the process** — it may be another agent's live run. `next build` writes the
  same `.next` a dev server owns, so the build gate collides too.
- **`TEST_DATABASE_URL`.** The migration-rollback suite tears the ledger down and rebuilds it, so a
  second process reading mid-rebuild sees a `MigrationSequenceError` naming a gap that is real for a
  few hundred milliseconds and then gone. Two such observations at different instants look like
  *progressive corruption* and are not. **Before treating a provisioned resource as damaged, inspect
  it read-only** — the timestamps settle it. The narrow rule: at most one agent runs the rollback
  suite at a time. **QA agents should run per-package suites (`cd <pkg> && pnpm exec vitest run`)
  rather than workspace-wide `pnpm test`**, which drags the persistence package into every run.
- **`docs/`.** Not touching docs is not enough on its own: the standing instruction to run
  `pnpm format` whole-tree at wave end reaches every file in the repository, docs included, and a
  scribe editing `docs/` at the same moment loses whatever the formatter's write collides with. The
  same rule this section already gives QA and verification applies to a documentation pass: freeze
  `docs/` and code together, and dispatch a scribe only once nothing else is writing to the tree.
  **This is the coordinator's failure to guard against, not an implementer's or a scribe's** — both
  agents did exactly what they were dispatched to do; nobody declared the two dispatches
  incompatible. It cost roughly 192 lines of an ADR amendment on 2026-09-06: never staged, an empty
  stash, and `git fsck` finding no blob to recover it from.
- **A directory you did not author, in a shared tree.** `git checkout -- <dir>` (or `git restore`)
  discards every uncommitted change under that path, including another agent's — it does not ask, and
  it does not distinguish your edits from theirs. Run `git status` and `git stash push -u` before
  reverting anything wider than a file you know you alone are editing. The 192-line loss above was
  exactly this: a `docs/` revert run to undo one agent's edit took a concurrent scribe's uncommitted
  section with it.

A guard reporting a real inconsistency is not the same as a defect. Two of the three above were
guards working correctly on a racing system.

### Agent lifetime: reuse within a wave, retire at its boundary, and ask for a handoff

**Within a wave, keep one implementer.** A wave runs implement → QA → adjudicate → fix → review →
fix, and every round refers back to the last. A fresh agent per round needs the record, the punch
list, the measurements and the prior findings re-explained each time, and loses what it learned about
its own mistakes — *"I measured that against the wrong baseline last round"* is not in any document.

**At the wave boundary, retire it.** Three costs accumulate and only the first is obvious:

- its context grows without bound;
- its label goes stale, so the agent list says it is doing the wave it started on, which is what the
  reader sees;
- and the one that actually bites — an agent carrying one wave's history **over-applies that wave's
  patterns to an unrelated surface**. Adjacent waves in the same files are the exception, not the
  rule.

**Retire with a handoff, never by killing it.** Ask the retiring agent for what the next implementer
needs that is *not in the plan*. Twice on 2026-09-05 this produced something no document held:

- that `materialById` throws while `lookUpMaterial` does not, so a **load path** reaching for the
  throwing one is a mistake the types will not catch — directly load-bearing for the next wave, whose
  normalisation runs on exactly that path;
- and that a test-support fixture exists for tests whose subject is *not* the thing under test, and
  must not be widened into a general-purpose table.

Name what it did well in the same message. It is not ceremony: the next dispatch inherits it as an
explicit instruction, and the habits worth propagating (mutation-checking a replacement test,
disclosing a test's limits rather than letting it read stronger than it is, flagging a departure from
a punch list instead of absorbing it) are learned behaviour rather than anything the roles document
states.

A retiring agent may also record a durable lesson in memory. Prefer the project docs for anything a
future contributor needs; memory is one operator's, and this file is everyone's.

## Trust but verify

- A green build, lint pass, and existing tests do **not** by themselves prove the acceptance
  criteria.
- Before declaring an item complete: inspect the claimed lines, confirm its test exists, run the
  relevant commands, and record the observed outcome.
- Review the actual diff before accepting an agent's summary. Agent reports are evidence leads, not
  proof.

### The commonest weak guard: both sides fed by the same source

A test that compares an expected value against an actual one proves nothing if **the same thing
supplies both sides.** It passes, it looks specific, and it cannot fail for the reason it was
written.

**The cheap general check, and it takes one question:** ask what *else* could supply the expected
side. If the answer is "the same thing that supplies the actual side", **make the two disagree and
assert which one wins.**

Three instances found in one wave on 2026-09-03, all in guards that read as thorough:

- A two-way refusal comparing the groups it was **handed** against the lines it was **handed** — so
  the component could stop calling the projection entirely and rebuild a plausible, correctly ordered
  breakdown from price lines, with **187 tests and the e2e still green**. Closed by capturing the
  argument at the hand-over and requiring two designs whose group structures differ.
- A count of rendered amounts whose expected list was derived from **the same view the surface
  renders**, so a subtotal added by the model landed on both sides and cancelled out. Closed by
  counting against the projection and the price book instead.
- A label assertion that could not tell whether the model read the projection's entry or the price
  line, because `CabinetPriceLine` carries the **same** `label` and `widthMm`. Closed by making the
  two disagree.

None of these is a careless test. Each compares a real property; each was fed by one source wearing
two hats.

### A surviving mutation may not have been applied

When a mutation is expected to turn a test red and does not, **prove the mutation reached the code
under test before concluding the guard is weak.** The web suites resolve
`@lemnaria/configurator-domain` to `dist/`, so editing `packages/configurator-domain/src` and re-running
a web test mutates nothing — the build still holds the original. Rebuild, or mutate the build, then
re-run.

Observed on 2026-09-03: a scene-population assertion looked like a restatement because the mutation
meant to falsify it was a no-op. Against the build it died, and the assertion turned out to be
genuinely falsifiable. **A survivor is a claim about the guard only once the mutation is known to
have landed** — otherwise it is a claim about the build.

### A predicate over a band is suspect unless it goes through `normaliseBand`

`top` folds into `wall` (ADR 0011 Gap C) for every reader that groups or counts by band. A predicate
that reads the raw `band` field instead is silently wrong for every top-row body, and it looks
correct in isolation because nothing about it fails to compile or to run.

**The same shape bites a set-membership assertion specifically.** A property asserted as "true over
every member of a set" needs a **minimum count per arm** of whatever it is branching on, not only a
total count — otherwise the sweep can pass while landing entirely on the arm nobody changed, and it
certifies nothing about the arm that moved. Found at M6 wave 6I2's close-out (2026-09-04): the
wave's strongest property was first swept without a floor per arm, and the fixture the sweep reached
happened to be the arm 6I2 did **not** touch — see `docs/milestones/M6-price-and-global-settings.md`
wave 6I2's close-out for the specific instance.

## Evidence standards

- A green command is evidence only when the agent actually ran it and reports the command and result.
- A reviewer finding needs a concrete file and line plus a scenario or invariant it violates.
- A mobile claim needs a real capture or interaction observation at the agreed viewport; tests alone
  do not prove it.
- Documentation describes what has landed, never a plan presented as shipped functionality.
- Copy quantitative claims directly from an inspected source. Do not invent counts or estimates.
  This binds a *corrected* number as hard as an original one: a dated correction explaining why an
  earlier figure was wrong is the one place a later reader will trust without re-deriving, so the
  cause it names must be copied from the source, never reconstructed. A correction that invents its
  own cause is worse than one that says only "read off a superseded assertion".
- **Finish a wave with `pnpm format:check`, whole-tree — never `npx prettier --check` on a
  hand-listed set.** The format gate has no per-package scope, so a per-round list cannot cover a
  file edited two rounds earlier. Wave 6Q-a failed the gate on exactly that: three files that had
  each passed a per-round check. Run it last, even when the dispatch scopes test runs to "affected
  suites only" and someone else holds `ci:local`.
- **A gate failing on e2e or the persistence suite is a contention suspect before it is a defect.**
  Re-run it alone before diagnosing. Both failed on 2026-09-05 for a held port 4320 and two runs
  racing the same test database, neither of which was a defect and both of which cost a diagnosis
  cycle.
