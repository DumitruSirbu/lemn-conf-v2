# Documentation and decision records

Documentation is part of the deliverable when it changes future engineering decisions.

## Project knowledge lives in git, and the reason is not only portability

Anything this project has learned — a rule, a measurement, an owner ruling, a trap — belongs in this
repository. The obvious reason is that a clone on another machine, or another developer, gets all of
it. **The larger reason is that a lesson which cannot be reviewed cannot be corrected.** A rule in
git dies in the commit that deletes its subject, and the reviewer of that commit sees both halves. A
rule kept in a private or machine-local store outlives its subject silently, because nothing in the
repository can reach in and correct it.

The instance that settles it: a privately-held note described how to resolve a 32-leaf divergence
between `apps/web/src/content/ro.ts` and `apps/web/src/messages/ro.json` — **a file the project had
already deleted.** It was confident, specific, measured and dated, and those are exactly the
properties that would have made the next reader trust it. **Precision is not evidence of currency.**

**The second instance is the stronger one, because the correction already existed here.** Another
privately-held note recorded an outstanding obligation — that ADR 0019's 30-day reaper owed a dated
amendment — and was cited as outstanding hours after
[ADR 0019](../decisions/0019-security-baseline-writes-throttling-retention.md) gained its
*Supersession note — 2026-09-15: decision 7*. The repository was already right. **Two stores simply
had no way to reach each other**, and only the one inside the repository could be corrected by the
work that made it wrong.

Note what this is *not* an argument against.
[ADR 0119](../decisions/0119-a-remembered-fact-about-this-repository-is-a-claim-to-recheck-and-true-at-head-is-not-true-at-the-end-of-the-milestone.md)'s
re-read-before-asserting discipline is sound and catches this class daily. Both instances above sat
**outside its reach** rather than through it: that rule works on a claim a reader thinks to re-read,
and a private note is read *as memory* — it arrives pre-trusted and phrased as settled. Keeping the
lesson in the repository is what puts it back inside the discipline's reach.

## Decisions and corrections

- Record meaningful architectural or product choices in `docs/decisions/` or the relevant
  milestone: date, chosen option, alternatives considered, rationale, and consequences.
- Do not erase a prior decision when reality changes. Add a dated correction that identifies the
  superseded claim and evidence behind the new one.
- Read the relevant decision record before diagnosing an issue. A contradiction may be a new
  finding, but it must be explicit.

## Phase outcome

At close-out, append a concise outcome that names shipped scope, verification actually performed,
review rounds and material findings, deviations with their rationale, documentation updated, and
deferred work with its owner or future phase.

A **wave** closes earlier and more often than a phase, and it has its own check: every commit named
`M<n> wave …` must be reflected in `docs/STATUS.md` before the wave counts as complete. The rule and
the reason live in `docs/WORKFLOW.md`, *A wave is complete only once `STATUS.md` says so* — one
process document, as that file's own history requires.

## The scribe runs after the commit, not before it

**The scribe runs after the commit, handed the commit hash and the measured gate numbers, and a wave
is not done until its table row and its milestone section say so.** Documentation is part of finishing
a wave — it sits in the step order alongside implementation, QA and review, not as a catch-up task
batched across several. The hash cannot exist before the commit, so any earlier ordering guarantees a
second pass that may never come.

This failed on 2026-09-05, on M6's 6K sequence and on 6Q-b/6Q-c: the wave table and several milestone
sections lagged what had actually shipped, and the gap was found only by cross-checking `git log` by
hand. **The wave table is load-bearing** — it was used the same day to answer the owner's question
about what work remains, and because it lagged, it gave the wrong answer. **A table that lags is worse
than no table, because it is trusted.**

Three mechanical causes, not a diligence problem:

1. **The scribe was dispatched before the commit existed**, so the hash was not yet available and
   every wave needed a second round-trip to record it. When that follow-up did not happen, the row
   stayed unmarked. 6Q-b needed exactly that follow-up (`ab162ab`); 6Q-c's section went stale the same
   way, closed minutes before `14cef90` landed.
2. **Waves ran back-to-back with documentation batched to the end.** The 6K sequence (6K-a, 6K-b1–b3,
   6K-c, 6K-d/e, 6K-f, 6K-g, 6K-h, 6K-j) ran this way, and the batch never fully happened before work
   moved on to 6Q.
3. **The check used to find the drift shared the drift's own blind spot.** The table assumes one wave
   per row; the `git log` grep used to audit it assumed one wave per commit subject. `d4e58a4` closes
   two waves (6K-d and 6K-e) in one commit tagged `(6K-d, 6K-e, step 4)`, so it was invisible to both
   at once — **a check built on the same assumption as the artefact it is checking cannot find where
   that assumption breaks.**

### Auditing the wave commits

Before calling a wave done, list the wave commits and check each hash is described in `../STATUS.md`:

```
git log --oneline -i --grep='^M5 wave'
```

**The `-i` is not optional.** This repository's own history writes *wave*, *Wave* and *Waves*: on M5,
`--grep='^M5 wave'` alone returns 22 commits and the case-insensitive form returns 27, silently
dropping `M5 Wave 5A`, `5B`, `5C`, `Waves 5C2 + 5C3` and `Wave 5D` — five waves of the milestone this
rule was written about. The plural needs no second pattern, since `wave` is a prefix of `waves`.

The rule exists because it failed before that. On 2026-08-31 an adversarial review found `STATUS.md`
and `../milestones/done/M5-width.md` both saying waves 5D2c and 5F remained open while eight commits
implementing them were already ancestors of `HEAD` (`testing-reports/06-docs-and-process.md`,
DOC-001). `AGENTS.md` makes `STATUS.md` the file a session reads to decide what to open and what work
remains, so an under-reported wave does not merely go stale — **it dispatches work against behaviour
that already shipped**, and the second implementation is found by whoever hits the conflict.

**A table that lags is worse than no table, because it is trusted.**

## A rule the owner described in conversation is not yet an invariant

When the owner describes a rule in conversation, **put it back to them in the form it is about to be
built** before it becomes a test, a criterion or a gate. One narrow question is enough, and it changes
the answer more often than not. This paid four times in a single day (2026-09-14), each time at the
moment someone tried to turn a description into code:

- *"Oven near the fridge"* → what is forbidden is **adjacency**, a shared side panel, not proximity.
  The narrow reading explains the owner's own reference photographs; the broad one called those
  photographs a mistake.
- *"Drawers before the hob"* → a **preference**, not a rule. The drafted invariant would have failed
  against the composer's own output in **half of all rooms**, and no test or re-read caught it — only
  asking did.
- *"Lift cabinets, 20–30%"* → admitted as an impression rather than a measurement, then priced and
  declined entirely. A ratio criterion would have encoded a guess as a contract.
- A deferral given before anyone knew a later block would need a second tall body. Reading it narrowly
  to unblock that block would have been an agent overturning an owner ruling by convenience.

**The signals that a reading is worth one sentence**, in order of strength: it contradicts an existing
owner ruling; it is about to become an assertion; or you cannot name what would falsify it.

**Ask early precisely when it does not matter yet.** On 2026-09-14 a separator-rule reading was *not*
put to the owner because no planned wave could reach the case. The owner answered it anyway, in one
line, and the answer was not what the maximal reading gave. The question was cheap **because** it was
unreachable — nothing had been built on the wrong reading. Once a wave reaches the case, the same
question costs a replan. *"Unreachable"* and *"not worth asking"* are not the same thing.

**A ruling's unaddressed half does not become yours by careful reasoning.** An owner answers in their
own frame, not the question's, so part of what was asked may be genuinely unanswered even when the
reply feels complete. Deriving which mechanism an answer lands in is right and necessary — **and the
derivation is still an inference, so mark it as one even when it feels settled**. Proved on 2026-09-15:
a question about designs' fourteen-day **backup** window was answered in the language of **retention**
(*"presets will be stored forever"*). An architect derived, correctly, that the row half was settled,
then extended *"forever"* to the backup half too — flagging that extension as its own reading because
the owner had not said "backup". The owner's next sentence was *"14 days backups for me is ok"*, the
opposite. **The flag is the only reason that cost a struck paragraph instead of a wrong constant inside
a schema the owner had just ruled is kept forever.**

**Mark a relayed answer as relayed.** An owner selecting an option you wrote is not a verbatim
quotation, and a relay that hardens into a quotation is how a record starts lying. The mirror rule for
reference material: **photographs are evidence, not a ruling; where a photograph and an owner ruling
disagree, the ruling governs.**

## Evidence and numbers

Copy quantitative claims from inspected source output or files. Do not estimate test counts,
performance, prices, dimensions, or review totals. Describe only confirmed behaviour; plans belong
in plans, not outcomes.

This binds a *corrected* number as hard as an original one: a dated correction explaining why an
earlier figure was wrong is the one place a later reader will trust without re-deriving, so the cause
it names must be copied from the source, never reconstructed. A correction that invents its own cause
is worse than one that says only *"read off a superseded assertion"*.

### Label the evidence tier behind every load-bearing claim

In a plan, an adjudication or a decision record, mark each claim a design rests on with **how it is
warranted**, and name the tier explicitly:

| Tier | What it is |
| --- | --- |
| **Doc-quoted** | A quotation from a document in this repository or in a vendor's shipped docs, with `file:line` |
| **Source-verified** | A reading of the installed implementation under `node_modules/…/dist/`, with `file:line` and the package version |
| **Inference** | Your own reasoning. Say so, and say what would falsify it |

Source-verified is **weaker than a doc quote and stronger than an inference**, and the difference is
not cosmetic: a doc quote states intent that the vendor has committed to, while a source reading can
change under a dependency bump without anyone announcing it. A later reader needs to know which kind
of warrant they are inheriting. Labelling is what let one M7 ruling be reopened cleanly rather than
being re-argued as a disagreement about taste — the ruling had read a client-state-sync guarantee as a
history guarantee, and only a labelled citation made the **gap** visible.

**When the documentation is silent, read the installed source and mark the claim as such.** For App
Router navigation specifically — history entries, navigation ordering, failure fallbacks — the docs
under `apps/web/node_modules/next/dist/docs/` are accurate about *intent* and silent about
*mechanism*, and the mechanism is what a design rests on. Three load-bearing claims in one day
(2026-09-14, planning wave 7F1-D45) could not be settled from the documentation and were settled from
`apps/web/node_modules/next/dist/client/components/` in minutes, at Next **16.3.4**:

- `app-router-instance.js:147-150` — a navigation marks any pending action discarded **before its
  state is applied**, and `replace` dispatches as `ACTION_NAVIGATE` too. So `replace` then `push` in
  one tick **loses the replace silently**, and the obvious flush-then-leave implementation is wrong.
- `app-router.js:59-61` — a push whose target equals the current URL is demoted to `replaceState` and
  mints no history entry. This would have made a planned traversal test pass **vacuously**.
- `app-router.js:214-231` — a failed navigation becomes a hard `location.replace` to the same URL,
  which is why a dropped flush needs no retry timer.

The documentation was not wrong in any of the three. It simply did not address the question. **Check
the source before building on a mechanism, not after a test fails**, quote the file and line, mark it
source-verified, and make the claim falsifiable by a test rather than leaving it argued. Write the
rejected-but-obvious option down beside it, with the sentence that kills it.
