# ADR 0105 — The e2e job splits by Playwright project rather than raising its ceiling again

Status: Accepted — **implemented 2026-09-10**, with decision 2's reasoning amended in place (see the
strike under *Alternatives*). Decision 1 shipped in `.github/workflows/ci.yml`; the ceiling came down
75 → 45 per leg. **Amendment A, 2026-09-30:** each project is further split into three shards,
and every shard is held to a test budget derived from measured runner rates (owner).
Date: 2026-09-10
Type: Decision (owner ruling)
Milestone: Engineering — falls between M6B and M7

## Context

`ci.yml`'s `e2e` job has had its `timeout-minutes` raised three times: 25 → 45 → 50 → 75. Each raise
was correct at the time and each was made for the same reason — the suite grew.

The raise that prompted this record was **run 34407768425**, cancelled at test **161 of 186**, 49.4
minutes into the specs. Read plainly from that job log: **every test that ran passed.** There was no
hang, no failure, no retry storm and no flake. A suite that is merely longer than its ceiling is a
scheduling problem wearing a failure's clothes, and the third raise is the point at which treating
it as one stops being honest.

Measured from that log rather than estimated:

| | tests | minutes |
| --- | --- | --- |
| `mobile` | 120 (complete) | 28.6 |
| `desktop` | 41 of 66 (cancelled mid-file) | 19.4 |
| whole suite, projected | 186 | ~54 of specs, ~57 of job |

The two slowest files are `top-bar-pill-containment.desktop` and `pixel-counter-witness.desktop` at
4.5 minutes each; `signature-flow` is the slowest mobile file at 4.3. `playwright.config.ts`'s own
comment had already named parallelisation as the answer if the ceiling ever needed to come back
down, and Playwright's summary flags the same file.

**The constraint that shapes every option** is `ci.yml`'s own: this repository has 2000 private
Actions minutes a month, which is why `e2e` does not run on pull requests at all. Wall-clock and
billed minutes are two different budgets here and an option can improve one while spending the
other.

## Decision

**1. The `e2e` job splits into a matrix over Playwright's `--project`, one job for `mobile` and one
for `desktop`.**

The seam is already drawn and is not being invented for CI's convenience: `playwright.config.ts`
declares `mobile` and `desktop` as separate projects with different viewports, and their spec files
are *named apart* (`**/*.desktop.e2e.spec.ts`) precisely so a file's viewport is readable from its
name. Splitting along a seam the test design already asserts costs no new concept.

Expected: two halves of roughly 30 and 27 minutes against a ceiling each, for about the same billed
minutes (two `next build`s instead of one, ~1 minute each) and a little under half the wall-clock.

**2. `workers` stays at 1. Parallelising *within* a project is rejected, not deferred.**

It is the cheaper-looking option — free in billed minutes — and it is the wrong one here for three
independent reasons, any one of which would be enough:

- The runner has **two cores**, and the scene compiles three.js on first paint. Two workers on two
  cores contend for the thing the specs are actually waiting on.
- `fullyParallel: false` keeps files serial today. Letting files overlap makes **3D timing** the
  variable, on the gate that exists to protect determinism.
- ~~The suite **writes**, to one shared Neon test database. `ci.yml` already serialises `e2e` behind
  `test` for exactly this reason, in a comment that names the DDL window that wedges it.~~
  **Struck 2026-09-10, on the owner's question at implementation: *"will it be possible to use one db
  and run in parallel e2e?"*** This reason does not hold, and the conclusion never needed it.

  Measured rather than reasoned, because decision 1 *creates* e2e-to-e2e database concurrency that
  did not exist when this ADR was written, and that had to be checked before the split shipped:
  **the e2e suite's database interaction is entirely row-scoped.** It executes no DDL; it asserts no
  global row count; its cleanup is `delete from designs where id = $1`, one statement per id, over
  ids that spec itself minted (`tests/e2e/support/minted-designs.ts` →
  `packages/persistence/src/delete-designs-for-tests.ts`). Two writers inserting and deleting their
  own uniquely-identified rows do not contend.

  **What the original sentence confused** is worth stating, because the confusion is easy to repeat:
  the wedge `ci.yml` documents is the **persistence `test` job's DDL** — `drop column if exists
  revision` and its window before `runMigrations` restores it — not e2e writing designs. That
  serialisation is real and is preserved: both matrix legs keep `needs: [install, test]`. The
  database was never what made intra-project parallelism wrong.

Trading determinism for wall-clock on the determinism gate is a bad trade at any price.

**Two reasons, then, not three — and the decision is unchanged.** The cores and the 3D-timing
arguments each stand alone and neither depends on the database. The amendment matters anyway: a
rejection resting on three reasons invites someone who disproves one to reopen the whole ruling, and
someone measuring the database would have disproved exactly the one that was wrong. An argument is
not stronger for carrying a premise that does not hold.

**3. It runs immediately after M6B closes, not during it** — owner ruling, 2026-09-10: *"do it just
after you will finish the M6B milestone."*

M6B is mid-flight and adds a second locale, which puts Russian renderings beside Romanian and will
grow the suite again. Restructuring the gate that measures a milestone while that milestone is open
means a failure could be the split or could be the wave, and telling them apart costs more than
waiting. **75 minutes is sized to carry M6B to its close** and is not expected to carry M7.

> **Discharged 2026-09-10.** It carried M6B exactly as intended. The milestone's build scope closed
> at `c242876` — all eight waves shipped, the last of them adding a second locale as this decision
> anticipated — and the split landed immediately after, on the owner's *"continue"*. The condition
> this decision waited on was that no further wave would change the suite, so a failure could not be
> read as either the split or a wave; that is now true. **Gate O2 remains open**, but it rules on
> Russian wording and changes no spec's structure, so it is not what decision 3 was waiting for.

## Alternatives considered

- **Raise the ceiling a fourth time.** Rejected as the standing answer. It does not reduce billed
  minutes, it does not reduce wall-clock, and each raise weakens the ceiling's real job — *"still a
  ceiling, not a budget: a suite that stops making progress dies here rather than running to the
  runner's 6-hour limit."* A ceiling generous enough never to be hit stops catching a genuine hang.
  Retained once more, at 75, only to unblock M6B.
- **Raise `workers` to 2.** Rejected on the merits above.
- **Shard with `--shard=i/N` across three or more jobs.** ~~Rejected for now~~ **Taken 2026-09-30, Amendment A: the project split stopped being enough, which is the condition this bullet named.** The original text: it cuts wall-clock
  further but multiplies the `next build` cost by N and splits the suite at an arbitrary boundary
  rather than a designed one. Reconsider only if the project split stops being enough.
- **Trim or skip slow specs.** Rejected. The two slowest files are the pixel-counter and top-bar
  containment witnesses — measurement specs whose whole value is that they are slow and exact.

## Consequences

- Until this ships, a full `e2e` run costs ~57 of the month's 2000 minutes and takes ~57 minutes of
  wall-clock. The 75-minute ceiling changes neither; it only stops the job being killed mid-suite.
- After the split, `e2e` is **two** required-status names rather than one. `ci.yml`'s existing note
  applies to both: if `e2e` is listed as a required check on `main` it must be removed, because the
  job does not run on pull requests.
- A cancelled run is no longer evidence of a defect by itself. This record exists so the next
  session reads a cancelled `e2e` the way this one did — check whether the tests that ran passed
  before assuming anything broke.

## Amendment A — 2026-09-30: three shards per project, and a per-shard test budget derived from measured runner rates

**The owner, verbatim:** *"i need you to record this and for future to take into account how many
tests should be run per ci pod or machine"*.

**The owner's selection** (relayed, 2026-09-30): e2e is split into **"3 shards per project
(Recommended)"**. Summary jobs keep the check names `e2e (desktop)` and `e2e (mobile)`.

### A1 — why decision 1 is no longer enough

**What the evidence is and is not.** The only runner evidence is **`main`'s** run at `995ad03`, run
**34580253814**: about 84 desktop tests in 37.8 min and about 109 mobile tests in 26.1 min
[doc-quoted, the coordinator's relay of the run the owner pasted]. **The M7/M7B branch's e2e suite
has never run on the runner.**

**What follows from it.**

- The measured rates are about **27 s a test (desktop)** and about **14 s a test (mobile)**.
- The branch has **185 desktop and 393 mobile tests**.
- *Inference, from those rates:* about **83 and 92 minutes per project**, against the 45-minute
  ceiling.

**That is this record's own trigger.** The rejected sharding alternative said *"reconsider only if
the project split stops being enough"*, and it has stopped being enough.

### A2 — the rule (standing, for every future change to the suite)

1. **Every e2e shard is budgeted to ≤ 30 minutes on the runner.** The test count a shard may carry is
   derived from the **measured per-test rate** of its project, never guessed from a local run.
2. **A guard, run in CI and locally, fails when any shard's `--list` count exceeds its budget**, and
   prints how many shards the project needs. The guard is the script the implementing change adds
   under `scripts/`, named in `docs/best-practices/ci-and-local-gates.md` by that change. **The exact
   per-shard figures live in the guard and its doc, not here**, so there is one number to update.
3. **The rates are re-derived** from any `ci` run whose measured shard time drifts more than **20%**
   from the prediction.
4. **Exceeding the budget raises the shard count, never the ceiling.** Decision 1's direction,
   *split, don't raise*, now applies per shard. The job's `timeout-minutes` stays what the
   *Alternatives* bullet says a ceiling is for: catching a hang, not scheduling a suite.
5. **Unchanged:**
   - decision 2 (`workers: 1` within a job, for the cores and 3D-timing reasons);
   - `fullyParallel: false`;
   - `needs: [install, test]`;
   - e2e does not run on pull requests.

### A3 — what this costs, stated because the original rejection named it

- Each shard runs its own `next build`. That is the reason sharding was *"rejected for now"*: *"it …
  multiplies the `next build` cost by N"*.
- **The owner accepted that cost by choosing three shards per project.**
- **Billed minutes (inference):** about the suite's spec minutes plus six builds per full run,
  against the month's 2000. E2e runs only on a push to `main` and on a manual dispatch.
- **The boundary:** Playwright's `--shard` cuts at file order, not at a designed seam. That was the
  other half of the original rejection, and it is still true. The budget guard is what keeps an
  arbitrary cut from quietly overrunning.

### A4 — a flag for the implementing change *(inference, from the relayed rates)*

At about 14 s a test, **393 mobile tests in three shards is about 131 a shard, or about 30.6 minutes,
at the budget's edge**. Desktop at 27 s a test is about 62 a shard, or about 27.8 minutes. If the
measured mobile rate holds, the guard may already ask for a **fourth mobile shard**. A2 (4) answers
that ahead of time: add the shard.

### A5 — sweep

| Record | Effect |
| --- | --- |
| Decision 1 | Kept, and extended to shards within each project |
| Decision 2 | Unchanged |
| *Alternatives*: sharding | Taken, on its own stated trigger |
| *Consequences*: "two required-status names" | The two names are kept, carried by summary jobs over the shards. The note that e2e must not be a required PR check still holds |
| `docs/best-practices/ci-and-local-gates.md` | Gains the guard and its figures, in the implementing change (not this record's edit) |

