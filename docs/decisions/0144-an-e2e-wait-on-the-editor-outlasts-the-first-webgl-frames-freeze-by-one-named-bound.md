# ADR 0144 — An e2e wait on the editor outlasts the first WebGL frame's freeze, by one named bound

Status: Accepted
Date: 2026-10-06
Type: Decision
Milestone: M7C CE (slice S2, `3e3420a`)

**Evidence tiers.** [implementer-run] means measured by the implementing agent in traces or profiles; the
coordinator did not re-run it. Nothing here was re-measured by the scribe.

## Decision 1 — write-access waits use one named 60 s bound through one helper

The e2e waits for write access, for the locale-switch URL and for the back-guard poll use
`WRITE_ACCESS_TIMEOUT_MS = 60_000`, applied through one helper, `expectWriteAccessApplied`
(`apps/web/tests/e2e/support/seeded-design.ts`). 60 s is about 2.5 times the worst measured freeze and half
the CI test timeout (120 s, `playwright.config.ts`). Locally the 30 s test timeout caps it.

**Why. The failures were a page that was late, not a write-access defect.** [implementer-run, trace- and
profile-verified]

- The write-access probe goes out about 5 ms after commit and is answered in 60-180 ms (local timeline:
  response at +174 ms).
- Right after the canvas mounts, the first WebGL frame blocks the main thread: locally a 2 s task, then an
  8-11 s task under load. A CPU profile showed 7.3 s of an 8 s window as native `(program)` time with
  three.js `getUniforms` and `renderBufferDirect` on the stack: synchronous SwiftShader program linking in
  a starved GPU process. The worst local freeze was 23 s or more.
- CI run 37453093040 traces show screencast gaps of 7.1 s (`seeded-design`) and 10.6 s (A5), with 2 frames
  in a 5 s window.
- Further traced freezes: CI `editor-back-guard:425`, 2 frames in the 5 s window `480268..485272` with the
  `/ru/d/…` document already fetched; local `editor-back-guard:339`, a screencast gap 2523 to 7508 ms and
  one `evaluate` spanning 2561 to 10117 ms after the edit.
- Playwright's `expect` timer is test-side and keeps running while the page cannot answer, so a 5 s default
  failed a page that was only late.

**Reproduction.** CPU throttling (CDP 4-20x) does **not** reproduce the stall: it is native GPU-process
time. CPU contention does (72-100 busy-loop processes on 16 cores; headless Chromium here already renders
through SwiftShader). Failure rates at 100 busy-loops, before: `seeded-design.qa:90` 6/10 (also 2/10, 4/10),
`editor-back-guard:335` 2/10, `share-design:96` 1/10, `qa-7e3c:638` 0/10, `editor-back-guard:425` 1/10,
A5 2/8 at 72 loops. After: the four mobile tests plus `editor-back-guard:425`, ×10 each at 100 loops,
50/50; A5 ×10 at 72 loops, 10/10; `editor-back-guard:335` after the guard-poll change, ×15 at 72 loops,
15/15; with the 60 s bound, the five original failures ×5 at 72 loops, 25/25, and A5 5/5; mobile shards
1, 2 and 4 and desktop shard 3 green at 72 loops.

**Sabotage.** With the probe route aborted the test fails by name, `Timeout: 60000ms`, measured 60019 ms.

**Alternatives rejected.**

| Option | Why it lost |
| --- | --- |
| `timeout: 0` | Fails only at the test timeout, and the failure is unnamed. |
| A global `expect.timeout` | Still a race, and the figure is unmeasured. |
| Waiting on the settle count | It publishes before the freeze, so it cannot see it. |

**Where.** `apps/web/tests/e2e/support/seeded-design.ts`; ten e2e files use the helper (the plan's *CE S2 as
built*).
