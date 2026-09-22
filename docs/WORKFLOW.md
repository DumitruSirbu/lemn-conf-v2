# Lemnaria delivery workflow

**The single authoritative delivery process.** It decides *how* work is dispatched, tested, reviewed
and closed. A milestone plan or a dated ADR decides *what* to build.

**This file is the spine: the cycle, and the rules that bind everyone.** The detail behind each rule
lives in one document under `docs/best-practices/`, named at the point the rule appears. Read the
spine in one pass; open a detail document when its row below matches what you are about to do.

Until 2026-08-25 this was split between this file and a second document, `dev-qa-cycle.md`, which
duplicated three of its sections and contradicted none of them. That file is gone; its rules are
below or in the detail document named at the rule. Two process documents meant a
session could read one and miss the other — which happened, and cost a whole wave its QA and review
round. There is now one.

That history is why the split below is a **routing** split and never a **restating** one. **A rule
stated here is not restated elsewhere**, and a rule stated elsewhere appears here only as a pointer.
Nothing was shortened to make this file shorter: every rule survives at its full depth, in exactly
one place. What shrank is the amount any single agent has to read, not the corpus.

## Which detail document, and when

| Open this | When you are about to |
| --- | --- |
| [`best-practices/agent-coordination.md`](best-practices/agent-coordination.md) | Dispatch a **second** agent, dispatch anything while a gate or a push is running, hand a wave between agents, or write a brief that says who owns which files |
| [`best-practices/ci-and-local-gates.md`](best-practices/ci-and-local-gates.md) | Run `ci:local`, push, read a gate's output, change lint or format config, or work out why a hook blocked a commit |
| [`best-practices/engineering-conventions.md`](best-practices/engineering-conventions.md) | Write production code, write or judge a **test**, or add a user-visible string |
| [`best-practices/documentation.md`](best-practices/documentation.md) | Close a wave, write a decision record, state a number, or turn something the owner said into a criterion |
| [`best-practices/browser-and-visual-qa.md`](best-practices/browser-and-visual-qa.md) | Verify a visible or interactive surface, or capture a screenshot |
| [`best-practices/product-invariants.md`](best-practices/product-invariants.md) | Touch geometry, dimensions, units, or the 3D model |
| [`best-practices/environments-and-resources.md`](best-practices/environments-and-resources.md) | Touch an env var, a secret, a database, or any provisioned resource |
| [`best-practices/rtk-proxy.md`](best-practices/rtk-proxy.md) | Run a shell command whose **output text** you intend to trust |

If none of those rows matches, the spine below is all that applies to you.

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
   changes. How rounds after the first are run — finding numbers, agent reuse — is in
   `docs/best-practices/agent-coordination.md`, *Review continuity*.
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

**The scribe runs after the commit, not before it**, and the wave-commit audit that proves the table
is not lagging — both are stated in full in `docs/best-practices/documentation.md`, *The scribe runs
after the commit, not before it*. Read it before closing any wave.

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

## A milestone's branch is kept, pushed, and merged on GitHub

**Owner rule, 2026-09-07.** A milestone that has a branch keeps it. The branch is **pushed to
`origin`** and merged into `main` **through GitHub**, not merged locally and left unpushed.

Each delivered milestone has one: `m2-void-engine-and-persistence`, `m3-mutations`,
`m4-editor-surface`, `m5-width`, `m6-price-and-global-settings`. Wave branches are the short-lived
things — they land on the milestone branch — and the milestone branch is the durable one.

**Why the rule exists.** On 2026-09-06 the coordinator merged M6's seven waves straight into local
`main`, reading the ADRs' phrase *"reaches `main`"* as the endpoint and never checking what the
repository already did. It was reversible only because nothing had been pushed, and the owner asked
the question — *"why on main?"* — before it hardened. Three costs, none of them hypothetical:

- **No pull request, so no reviewable unit.** The waves had QA and review as agents, but nothing on
  GitHub records that; a milestone merged locally leaves the platform with a single opaque jump.
- **CI never ran.** Every gate was a local `pnpm ci:local`. Wave 6V's own last acceptance criterion
  asks for **runner** evidence, so M6 could not be closed at all until a push existed — a milestone
  blocked by its own bookkeeping.
- **A local `main` that has diverged is invisible to everyone else** — the same failure mode as an
  orphaned agent worktree (`docs/best-practices/agent-coordination.md`), one level up.

**So:** create the milestone branch when the milestone starts, push it early and keep pushing, and
open the pull request into `main` on GitHub. Wave branches merge into it and are deleted once merged.
`main` is what GitHub writes, not what a session writes.

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
- **Every dispatch names its reading**: the files in scope and the `DEVELOPMENT-SPEC.md` sections
  and ADRs that govern them. This applies to implementer, QA and reviewer dispatches alike.
  Context loading is most of an agent's cost, and an agent told to "read the spec" reads all of it.
  The role cards read the whole reference only when a dispatch names nothing, so an unscoped
  dispatch is the expensive default rather than a neutral one. Scope the reading, not the rigour:
  the agent may still open anything the named sections lead it to.
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

- **QA, review and the scribe's close-out are dispatched agents, always — never work the coordinator
  does itself.** Standing owner instruction, 2026-08-27: *"yes, always need to use agents"*. It is
  not per-wave and does not need re-asking. **Step 6 is inside this instruction**, restated by the
  owner on 2026-09-10 — *"you know that wave finish with scribe updating docs, is in workflow"* —
  after a coordinator amended a milestone criterion and wrote an ADR amendment itself mid-wave. The
  reason it gave was real: agents were reading the tree, and the pre-commit hook re-stages whole
  files, so two writers in one file is a genuine hazard. **That is a reason to sequence the scribe
  after the readers finish, not to take its work.** `docs/STATUS.md`, `docs/milestones/` and
  `docs/decisions/` are the scribe's remit.

  The cycle is bought to separate two questions — the implementer tests what they
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
- **Freeze the tree before dispatching QA, and say so in the dispatch.** What counts as a write
  (a commit and a `git push` both do), what to tell an implementer that has reported "done", and the
  tripwire a deliberately-red test gives you for free, are stated in full in
  `docs/best-practices/agent-coordination.md`, *Freeze the tree for the whole of any measurement*.
  **The freeze begins when the writing agent says it does, not when you infer it has** — **R1**.
- **QA is adversarial**: the implementer tests what they built, QA tests what they assumed. A test QA
  writes that fails is a *finding*. Leave it failing and report it. QA never weakens an assertion to
  make it pass and never edits production code to make its own test green — that is how a suite ends
  up asserting a defect as correct.
- **What an adversarial pass owes** — boundaries and anti-invariants, input sweeps, the two shapes of
  a deferred test and which one self-clears, and why a clean report is a weak result:
  `docs/best-practices/engineering-conventions.md`, *Coverage an adversarial pass owes*.

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

How to spend the tier you chose — scoping a reviewer's reading, batching small fixes into one round,
numbering findings `R1.1` / `R2.1` and reusing agents across rounds — is in
`docs/best-practices/agent-coordination.md`, *Spending review effort well*.

## Acceptance criteria

State observable invariants, including what must not happen. Name input boundaries and failure
modes. For 3D work, include the coordinate/anchor rule, scaling rule, structural dependencies, and
the visual evidence needed to verify the result.

**Before turning something the owner said into a criterion, a test or a gate**, read
`docs/best-practices/documentation.md`, *A rule the owner described in conversation is not yet an
invariant*. It states the rule, its four instances, and when a reading is worth one question.

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

**Before dispatching a second agent, read `docs/best-practices/agent-coordination.md`.** Everything
in it exists because two things touched the repository at once and the result *looked like a result*.
It covers the shared resources agents collide on (the tree, the gates, port 4320,
`TEST_DATABASE_URL`, `docs/`, the session scratchpad), the discarding git commands every brief must
ban by name, why "both are read-only" is not isolation and a gate or a push counts as a verifier, why
ownership is per file rather than per directory, the stale base every agent worktree arrives at, and
how to retire an agent with a handoff.

## Trust but verify

- A green build, lint pass, and existing tests do **not** by themselves prove the acceptance
  criteria.
- Before declaring an item complete: inspect the claimed lines, confirm its test exists, run the
  relevant commands, and record the observed outcome.
- Review the actual diff before accepting an agent's summary. Agent reports are evidence leads, not
  proof.
- **Three guards that look thorough and cannot fail** — both sides fed by the same source, a
  surviving mutation that never reached the code, and a band predicate or a sweep with no floor per
  arm: `docs/best-practices/engineering-conventions.md`, *Three guards that look thorough and cannot
  fail*. Read it before accepting "the tests pass" as an answer.

## Evidence standards

- A green command is evidence only when the agent actually ran it and reports the command and result.
- A reviewer finding needs a concrete file and line plus a scenario or invariant it violates.
- A mobile claim needs a real capture or interaction observation at the agreed viewport; tests alone
  do not prove it.
- Documentation describes what has landed, never a plan presented as shipped functionality.
- Copy quantitative claims directly from an inspected source. Do not invent counts or estimates.
  What this binds about a *corrected* number is stated in `docs/best-practices/documentation.md`,
  *Evidence and numbers*. An inferred **mechanism** behind a number is bound by **R4**.
- **Finish a wave with `pnpm format:check`, whole-tree — never `npx prettier --check` on a
  hand-listed set.** The format gate has no per-package scope, so a per-round list cannot cover a
  file edited two rounds earlier. Wave 6Q-a failed the gate on exactly that: three files that had
  each passed a per-round check. Run it last, even when the dispatch scopes test runs to "affected
  suites only" and someone else holds `ci:local`.

  **Over `docs/`, a hand-listed check reads nothing at all.** `.prettierignore:3` ignores `docs/`, so
  `npx prettier --check docs/<file>.md` prints *"All files formatted correctly"* and exits 0 **without
  opening the file** — naming the path explicitly does not defeat the ignore, and the output is
  byte-identical to a real pass. The coordinator cited it as verification four times in the week to
  2026-09-17. The general rule this is an instance of is **R5**.
- **A gate failing on e2e or the persistence suite is a contention suspect before it is a defect.**
  Re-run it alone before diagnosing. Both failed on 2026-09-05 for a held port 4320 and two runs
  racing the same test database, neither of which was a defect and both of which cost a diagnosis
  cycle.
- **Label what warrants every load-bearing claim** — doc-quoted, source-verified, or inference — and
  read the installed source when the documentation is silent:
  `docs/best-practices/documentation.md`, *Label the evidence tier behind every load-bearing claim*.

## Rules

Nine failures from 2026-09-16/17, **every one the coordinator's own**, written as rules on the
owner's instruction: *"so all this conclusions add the workflow to not repeat once more, describe
them clearly and mark as rules"*. Each keeps its instance, because a rule without its instance gets
argued away. Where an older section above or a detail document already owns the surrounding
mechanism, the rule points at it rather than restating it.

**R1 — Freeze on the agent's word, never on inference.** Do not commit, edit or rebuild while an
agent may be writing; wait for an explicit *"nothing is in flight"*. **Five violations in M7.** One
committed a plan mid-correction (`8ebff1f`), producing a document that contradicted itself about
whether its own wave was dispatchable. An implementer's own framing: *"the thing that would make it
safe is not on your side — it is me saying 'stopping here, nothing in flight' explicitly."* What
counts as a write is in `docs/best-practices/agent-coordination.md`, *Freeze the tree for the whole
of any measurement*.

**R2 — One writing agent per working tree.** Two implementers in different packages still share one
git index. **Never** `git stash`, `git stash pop`, `git checkout -- .`, `git reset --hard` or
`git clean` in a shared tree; revert from a byte copy in the scratchpad, scoped to one named file.
An agent stashed another's in-flight files, the `pop` aborted, and that work sat reverted for three
minutes. Use separate worktrees when parallelism is wanted. The prohibition every brief must carry
by name is in `docs/best-practices/agent-coordination.md`, *Every brief bans the discarding git
commands by name*.

**R3 — If you edit inside a section an agent owns, say so in the same message.** The coordinator
edited a plan an architect was writing without telling it; the architect correctly detected an
unexplained concurrent writer, stopped, and spent a round trip on forensics — *"I will hand the file
over rather than guess, and neither of us will spend a turn on forensics."*

**R4 — Never report a figure you inferred. Measure it, or cite where it was measured.** Twice in one
record: *"nobody loses a block"* was contradicted by two figures printed side by side in the same
table (12 900 − 12 826 = 74), and it reached the owner, who made a decision on it. The mechanism for
those 74 was then inferred from the smallest witness and asserted of all of them — **true for 54,
false for 20**. A witness explains a class only once the class has been measured against it.

**R5 — A check that cannot examine its subject is not a gate. Verify the checker looked.** A pass and
a no-op are indistinguishable from the output alone, so establish that the tool opened the file.
Two instances: `npx prettier --check` over a `docs/` path, which exits 0 reading nothing (*Evidence
standards* above); and one NUL byte that made a test file binary to git, so a 229-line diff rendered
as *"Binary files differ"* and the repo-wide convention greps used as gates stepped over it
reporting success.

**R6 — Sabotage in both directions is the verification that works; reading is not.** Remove the
behaviour with the correlate standing → the suite **must go red**. Move the correlate with the
behaviour standing → it **must stay green**. Everything genuinely broken in M7 was found this way and
nothing was found by reading: a parity suite that passed **15/15 with the wave's central rule
deleted**; two QA guards that passed under the sabotage they existed to catch; a slot-lookup sabotage
that changed the failing set by **25 → 25**, i.e. produced no signal at all. **A sabotage run against
an already-red suite is not a measurement.** Proving a mutation actually reached the code is
`docs/best-practices/engineering-conventions.md`, *A surviving mutation may not have been applied*.

**R7 — Brief agents to lead with the complete changed-file list and to bound their report length.**
Roughly seven reports truncated mid-sentence on 2026-09-17, each costing a round trip; and two
agents' summaries understated their file counts — one declared two changed files where the diff
touched five, caught only by the coordinator reading the diff.

**R8 — Do not push, or run `ci:local`, on a dirty tree.** The push hook gates the **working tree**,
not the commits, so a run over half-written code is worthless. A visual-verification agent had the
tree change under it mid-run and had to re-run every measurement in isolated worktrees to salvage
its report. That a push holds the tree for its whole ten minutes is in
`docs/best-practices/agent-coordination.md`, *"Both are read-only" is not isolation*.

**R9 — `rtk` is for orientation; `rtk proxy` is for evidence.** The hook rewrites commands
transparently and returns **summarised output, not the command's own**. **Any output you are about to
assert, cite or act on runs as `rtk proxy <cmd>`** — the test is what you will do with it, not whether
you expect it to be empty. On 2026-09-17 a `git log … | wc -l` reported **1 commit unpushed
immediately after a successful push**, where local and remote were identical at `8b73439`. Instances
and the grep-parsing trap: `docs/best-practices/ci-and-local-gates.md`, *The `rtk` proxy*.

**R9 is R5 one layer out**, and that pairing is why both are rules rather than habits: a gate that
skipped its subject, and a proxy that summarised it, **both returning a well-formed answer without
examining what was asked**. It is
[ADR 0121](decisions/0121-a-thing-is-identified-by-what-it-is-and-the-discriminating-case-is-the-one-nobody-screenshots.md)'s
family reaching the tooling — that record was commissioned about the code by a coordinator making the
same error with the tools.

### Guidance, not a rule: review tier is a real cost lever

The owner has not ruled on this. Full tier — QA, then logic and clean-code review separately — is
what found three defects on 7H and a parity suite that could not fail on 7D4; it is also why 7D8 took
a full day. Light tier is defensible for a wave that changes no generated output. **Choose
deliberately rather than defaulting to Full**, against the tier table in *How much review a wave
gets*.
