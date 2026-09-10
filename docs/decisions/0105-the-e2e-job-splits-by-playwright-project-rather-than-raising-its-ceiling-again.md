# ADR 0105 — The e2e job splits by Playwright project rather than raising its ceiling again

Status: Accepted — **scheduled, not yet implemented.** The owner ruled it runs immediately after M6B closes.
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
- The suite **writes**, to one shared Neon test database. `ci.yml` already serialises `e2e` behind
  `test` for exactly this reason, in a comment that names the DDL window that wedges it.

Trading determinism for wall-clock on the determinism gate is a bad trade at any price.

**3. It runs immediately after M6B closes, not during it** — owner ruling, 2026-09-10: *"do it just
after you will finish the M6B milestone."*

M6B is mid-flight and adds a second locale, which puts Russian renderings beside Romanian and will
grow the suite again. Restructuring the gate that measures a milestone while that milestone is open
means a failure could be the split or could be the wave, and telling them apart costs more than
waiting. **75 minutes is sized to carry M6B to its close** and is not expected to carry M7.

## Alternatives considered

- **Raise the ceiling a fourth time.** Rejected as the standing answer. It does not reduce billed
  minutes, it does not reduce wall-clock, and each raise weakens the ceiling's real job — *"still a
  ceiling, not a budget: a suite that stops making progress dies here rather than running to the
  runner's 6-hour limit."* A ceiling generous enough never to be hit stops catching a genuine hang.
  Retained once more, at 75, only to unblock M6B.
- **Raise `workers` to 2.** Rejected on the merits above.
- **Shard with `--shard=i/N` across three or more jobs.** Rejected for now: it cuts wall-clock
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
