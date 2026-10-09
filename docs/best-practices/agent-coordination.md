# Running more than one agent against one repository

**Read this when:** you are about to dispatch two agents at once, dispatch anything while a gate or a
push is running, hand a wave from one agent to another, or write a brief that says who owns what.

If you are dispatching a single agent into a quiet tree, you do not need this file. Everything here
exists because two things touched the repository at the same time and the result **looked like a
result**. That is the property these rules are bought for: none of these failures announces itself.

The main agent owns the working tree and the final outcome. It may delegate bounded work to the roles
in `../AGENT_ROLES.md` (Codex) or `.claude/agents/` (Claude Code), but it retains integration, final
verification, and user-facing communication.

## The shared resources two agents collide on

Parallel dispatch is worth it, but two agents in one working tree collide, and each collision is
initially misread as a defect in the code. The first three below — the working tree, the gates, and
port 4320 — were all observed on 2026-09-03; the rest were added as they were paid for. (This list
carried the words *"in three ways"* for some time after it had six entries. A count in prose beside a
list it does not govern is the kind of claim that goes stale silently, which is the subject of
[ADR 0119](../decisions/0119-a-remembered-fact-about-this-repository-is-a-claim-to-recheck-and-true-at-head-is-not-true-at-the-end-of-the-milestone.md).)

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
  scribe editing `docs/` at the same moment loses whatever the formatter's write collides with.
  Freeze `docs/` and code together, and dispatch a scribe only once nothing else is writing to the
  tree. **This is the coordinator's failure to guard against, not an implementer's or a scribe's** —
  both agents did exactly what they were dispatched to do; nobody declared the two dispatches
  incompatible. It cost roughly 192 lines of an ADR amendment on 2026-09-06: never staged, an empty
  stash, and `git fsck` finding no blob to recover it from.
- **The session scratchpad.** `/private/tmp/claude-501/<project>/<session>/scratchpad/` is **one
  directory shared by every agent in the session**, not one per agent, and it is under `/private/tmp`
  — no trash, nothing recoverable. On 2026-09-09 a QA agent following a brief that said *"delete every
  scratch file"* ran `rm -rf <scratchpad>/*` and destroyed **~300 files and 15 directories** belonging
  to other agents: `.orig` and `.bak` copies of production files taken before mutation tests, draft
  commit messages, draft ADR text, measurement JSON, and every screenshot from two investigations.
  The repository itself was verified untouched rather than assumed so — but a mutation revert
  *depends* on those `.orig` copies, and an agent that had been mid-mutation would have had no way
  back. Three rules follow: **never write "delete every scratch file" in a brief** (write *delete only
  the files you created, by name; never `rm -rf` the scratchpad or any directory in it*); **give each
  agent its own `scratchpad/<agent-name>/`** so a recursive delete is survivable; and put evidence a
  human still needs into the gitignored `testing-reports/<date>-<subject>/`, which no cleanup
  instruction targets.

A guard reporting a real inconsistency is not the same as a defect. Two of the three 2026-09-03
collisions were guards working correctly on a racing system.

## Every brief bans the discarding git commands by name

`git checkout -- <dir>` (or `git restore`) discards every uncommitted change under that path,
including another agent's — it does not ask, and it does not distinguish your edits from theirs.

**So every dispatch brief carries the prohibition by name:** never run `git checkout`, `git restore`,
`git stash`, `git clean` or `git reset` on any path; if the tree looks wrong, stop and report rather
than discard. `git merge --ff-only` is the single exception, for the stale worktree base below. Name
the path ownership in the same breath — *"do not edit anything under `docs/`"*, *"touch no code or
test file"*.

The 192-line loss above was exactly this: a `docs/` revert run to undo one agent's edit took a
concurrent scribe's uncommitted section with it, because a docs agent and a code agent shared one
worktree and nobody had declared the two dispatches incompatible.

**And the damage did not end at the loss.** Re-applying the recovered text pasted it into **two**
anchors; the copies then drifted, and the milestone file carried two versions of three wave plans
disagreeing about which ADR decisions governed them. It was found only by reading both — a line count
shows nothing. **After any re-application of lost text, scan for duplicated blocks before trusting the
file: the risk is disagreement, not absence.**

If you must unwind a commit that the pre-commit hook blocked, `git reset` with **no** `--hard`
unstages without touching anyone's work.

## Freeze the tree for the whole of any measurement

**While any QA, review or visual agent is running, nothing else writes.** Dispatch implementation only
after every reader has reported.

- **Freeze before dispatching QA, and say so in the dispatch.** QA's numbers are only attributable to
  a wave if the wave stopped moving first. In M6 wave 6S the coordinator dispatched QA while the
  implementer was still landing an owner-ruled scope addition: partway through the pass an untracked
  probe file vanished and two `apps/web` files appeared as modified. QA caught it, re-ran, and
  reported the collision rather than quietly averaging over it — and the wave was unharmed only
  because the change was comment-only and landed in `apps/web` rather than in `packages/`. **Had it
  landed in a package QA had already measured, none of the counts would have been attributable to
  anything.** The instruction to the implementer is explicit: *stop editing, a moving diff wastes the
  pass*. The same applies to reviewers.
- **A commit, a stash or a snapshot is a write too — and one of them shipped a mutant.** On
  2026-09-11 in wave 7D1b a `--no-verify` WIP commit (`f61c361`, taken "ahead of a session usage
  limit") was made while QA's mutation runner had a mutant applied to `shell-design.ts`. **`HEAD`
  took the mutant**, and the runner's own restore afterwards left the correct file sitting as an
  uncommitted one-line diff — committed history asserting the defect, working tree holding the fix.
  **Never commit, stash or snapshot while a QA agent is mid-run**: ask it to pause and wait for its
  *"restored, `cmp` OK"* first. If a commit genuinely cannot wait, afterwards `git diff HEAD` every
  production file against that agent's pre-mutation copies before trusting it.
- **Tell an implementer that has reported "done" to stay idle until dispatched again.** Otherwise it
  starts the next thing on its own, and the next thing is a write into a tree a reader has been
  promised is frozen.
- **A finding left as a failing test detects a moving tree for free.** M6 wave 6P's QA had the tree
  change under it twice mid-pass, and noticed only because a test it had deliberately left red
  suddenly went green — a loud signal that the code had changed underneath the measurement. A pass
  that reports its findings only in prose has no such tripwire: it re-runs against different code and
  reports numbers that are internally consistent and wrong.
- **Before running gates or dispatching a reader**, take `git status --short` and file mtimes;
  compare them again afterwards and treat any movement as invalidating the run. Prefer per-package
  runs over `ci:local` while a reader that has `Bash` is live.

A visual verifier's exclusive claim on the tree, and why a reviewer judges against `git show HEAD:`
rather than the working tree, are in `browser-and-visual-qa.md`.

## "Both are read-only" is not isolation, and "you own `docs/`" is not ownership

Two read-only agents may share the tree with each other. **An implementer may not share it with a
verifier — and a gate run or a `git push` counts as a verifier.** Three failures on 2026-09-15, each
one a coordinator reasoning correctly about permissions and wrongly about time:

- A review and a visual gate were dispatched together (correct — both read-only), and then a **fix
  implementer** while the gate was still in the browser. The gate finished by reporting four modified
  files with mtimes **inside its own run**, including a `popstate` handler that changed the very
  behaviour it had not been asked to test. Nothing was contaminated only because `next start` serves a
  prebuilt bundle whose build predated the edits. A dev-server gate, or a build taken a minute later,
  would have produced findings against a tree that no longer existed.
- `git push` was run — whose pre-push hook reruns the whole gate for about ten minutes — and an
  implementer dispatched while it was in flight. **The gate builds the working tree, not the commit**,
  so it compiled half-written files and returned `LOCAL CI FAILED: build`. The commits were green and
  blameless. A push is not a background errand: it holds the tree for its whole duration.
- Two architects were each told they "owned `docs/`", and both planned a single append to the same
  milestone file. No collision happened purely because the first finished before the second started.

**Ownership is per *file*, not per directory, and a file being free is an observation with a
timestamp rather than a property of the file.** As one of those architects put it: *"I reported 'file
free' three times today as though that were a property of the file rather than of the moment I looked
at it."* Re-measure immediately before writing, and say which it is.

**The tool decides whether a shared file is survivable.** An `Edit` anchored on exact text read
seconds earlier **fails loudly** when the file has moved — a rejected edit, nothing lost. A whole-file
`Write` from a stale read **overwrites silently**, and the other agent's pass is gone with no error.
So when one file genuinely must be shared: name the file rather than the directory, serialise
explicitly (one writes, reports, the other re-reads fresh), **require anchored edits and forbid
whole-file writes**, and have an agent holding uncommitted work in a contended file copy that file
and its `git diff` into the scratchpad first — uncommitted work has no copy in git.

**Two agents may not share a file in this repository**, because the pre-commit hook re-stages whole
files and defeats any partial staging — the mechanism and the commit it mis-attributed are in
`ci-and-local-gates.md`.

**If a verifier reports files it did not touch, treat every one of its findings as suspect** until
the build's provenance is established, and say so in the close-out rather than silently trusting
them.

## Agent worktrees arrive at the session's starting commit, not at the branch tip

Every `isolation: "worktree"` agent in this project has been created at the **commit the session
started from**. Observed repeatedly on 2026-09-07/08: worktrees arrived on the wrong branch entirely,
variously **21 and 60 commits stale**, and in one case carrying a previous session's uncommitted
files. An agent on a stale base writes against code that no longer exists — one reviewer reviewed
files that were not on disk, and one scribe found that **six of the ADRs its task depended on had not
been written yet** in its tree.

1. **Put the required base commit in every brief**, with `git log --oneline -1` as the literal first
   command and `git fetch origin && git merge --ff-only <branch>` as the fix. Agents told this have
   self-corrected every time. **Verify the merge yourself afterwards**; do not trust the agent's own
   report of its base.
2. **Never dispatch the scribe into a worktree.** `.claude/agents/configurator-scribe.md:6` gives it
   `[Read, Write, Edit, Grep, Glob]` and **no `Bash`**, so it can neither fast-forward nor commit:
   the base check is unfixable and the work is unlandable. One correctly refused to write rather than
   edit a superseded copy, and the task had to be redone by hand. Run scribe work in the main tree.
   The reviewer roles **do** have `Bash` and are fine in a worktree; a read-only reviewer that lands
   on a stale base can still review by reading the diff with `git show`, and one did exactly that.
3. **A worktree has no `.env.*.local`**, which exists only in the main checkout — so its persistence
   and e2e "green" can be skipped tests rather than a pass. One parallel worktree's persistence green
   was **86 skipped tests** (`../STATUS.md`, 2026-09-04).

## Agent lifetime: reuse within a wave, retire at its boundary, ask for a handoff

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

**A retiring agent's durable lesson goes into the project docs, not into an operator's memory store.**
Not merely because memory is one operator's and the docs are everyone's, but because a lesson nobody
can review is a lesson nobody can correct — see `documentation.md`, *Project knowledge lives in git*.

## Dispatch on the model the role card declares, passed explicitly

Every `.claude/agents/*.md` role card declares a `model:` in its frontmatter. **Pass that model
explicitly at dispatch.** The named-teammate spawn path can otherwise inherit the coordinating
session's own model instead of the role's declared one.

**Owner ruling, 2026-09-29.** The developer for M7B waves U1–U3a ran as a named teammate without an
explicit model and may have run on the session's Opus model rather than `configurator-developer.md`'s
declared Sonnet. The owner's instruction: *"don't stop just take into account to use correct the
model"* — i.e. this is a going-forward dispatch discipline, not a reason to redo the affected waves.
**Owner ruling, 2026-09-29 (later the same day): Sonnet roles run on Sonnet 5.5.** The four Sonnet
role cards (developer, scribe, verify-visual, review-clean-code) pin the full model ID
`claude-sonnet-5-5` rather than the `sonnet` alias, so the model a role runs on is recorded in git
instead of depending on what an installed Claude Code maps the alias to. When the dispatch tool
accepts only an alias, pass `sonnet` — it resolves to Sonnet 5.5 as of this ruling.

## Spending review effort well

Review agents are expensive — most of the cost is a cold start re-reading the spec, the ADRs and the
codebase before it reads a single line of the diff. The tier table that decides how much review a wave
gets is in `../WORKFLOW.md`, because it binds every wave. What follows is how to spend the tier you
chose.

- **Scope the reading, not the rigour.** The largest cost is context loading. Give the reviewer the
  exact files and the two or three spec sections that govern them; do not tell it to read the whole
  specification and work out what is relevant. A reviewer that reads less but is pointed precisely
  finds more. This binds every dispatch, not only reviews — see `../WORKFLOW.md`, *Scope
  discipline*.
- **Match the model to the job.** Logic review of domain rules earns a strong model. Clean-code
  review against a written convention list does not.
- **Reuse agents across rounds.** A second round with the same reviewer costs a fraction of a fresh
  one, because the context is already loaded.
- **Never economise by having the implementer review itself.** That saves the entire cost and
  provides none of the value.

### Batching fixes before review

Reviewers are the most expensive step, so **small fixes are batched and reviewed together** (owner's
direction, 2026-08-26). Several one-file corrections do not each earn their own round.

The counter-pressure is real and is why this is a judgement rather than a rule: a reviewer given a
smaller diff gives a better result. So batch while the fixes stay small and related; split as soon as
the diff grows or the fixes stop sharing a subject. The coordinator decides, and says in the dispatch
what it batched and why — the same way the review tier is a recorded choice.

The goal being optimised is **fewest iterations**, not fewest agents. A batch so large that review
misses something costs a second round and is the more expensive mistake.

### Review continuity

- **Number findings by round and item** (`R1.1`, `R1.2`, `R2.1`). A fix dispatch must name the
  findings it addresses. **Name them by text as well as number** (added 2026-10-09, M8 wave 8I; the developer's handoff,
  relayed): each finding's file, line and the change asked for. In 8I's round B the plan named eight clean-code findings by
  number only, the developer correctly refused to guess, and it cost a round trip. That is the coordinator's failure to
  guard against; ask for a finding's text with the first dispatch, not the last.
- Keep the same QA and reviewer agents for follow-up rounds wherever they are still available. Give
  them the current diff and the earlier finding identifiers so they verify the fix instead of
  rediscovering context.
- Send fixes back to the **original implementer** where possible, for the same reason: it holds the
  context that produced the code.
