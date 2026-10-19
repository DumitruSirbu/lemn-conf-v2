# Browser and visual QA

Use this guide when the project has a running UI. It is intentionally tool-agnostic; record the
chosen browser runner, local URL, viewport, artifact path, and commands in `AGENTS.md` when the app
is scaffolded.

## Browser test design

- Organize end-to-end tests by user-visible feature area. Keep navigation and selector helpers
  shared; do not hide test assertions inside helpers.
- Prefer semantic, stable locators and interactions a real user can perform. One test should prove
  one behavioural contract.
- Cover invalid input, empty states, route/state restoration, and every supported locale or
  audience variant that changes the user experience.
- Configure retries only for CI diagnosis, then fix flakiness rather than accepting it. Capture a
  trace or equivalent evidence on retry/failure.

## Visual and mobile verification

- Set the target viewport before loading the page, then exercise the real flow rather than taking a
  static source-driven screenshot.
- Check touch targets, overflow, keyboard behaviour, fixed/sticky element occlusion, orientation,
  and browser console errors.
- A screenshot is evidence only after it has been inspected. Report what it shows and what could
  not be verified; never claim mobile compatibility based on a desktop view.
- Store transient screenshots/traces in the project-defined artifact directory and clean them when
  they are no longer needed. Keep intentional visual baselines only when the project adopts a
  visual-regression workflow.

## A trap that produces confident wrong measurements, not an error

**Never write screenshots or other evidence into a path `next dev` (or any watched dev server) is
watching, while it is running.** Doing so triggers a hot refresh, and a hot refresh resets the
running design mid-run — so a measurement taken after the reset is silently reading a fresh seed
rather than the state the run built up to that point. This does not fail loudly: the run looks fine,
the screenshots exist, the numbers look plausible. It is wrong anyway, and there is no error to catch
it by.

Found writing evidence into `testing-reports/` (inside the watched project tree) during M5B wave
5B3's visual verification, 2026-09-01. Worked around by writing every artifact **outside** the
project tree instead — that is why that run's reported numbers are trustworthy. **The rule: evidence
goes outside the watched tree, or the dev server is not watching while evidence is written.**

### It bit a second time, past an agent that had read the rule above

On 2026-09-09 a visual agent reported that *"the kitchen reverted to white after setting a
per-cabinet colour"* and was about to file it as an ADR 0099 defect. The reversion was its **own
screenshot write** resetting the design. It caught this from the console lines sitting between the
apply and the capture — `[Fast Refresh] rebuilding` followed by
`THREE.WebGLRenderer: Context Lost` — and not from anything in its own method.

The reason knowing the rule was not enough: **the MCP screenshot tool can only write inside the
repository**, so the obvious compliance path is closed and an agent that means to obey ends up
writing into the watched tree anyway. Three things make a run survive it:

1. **Capture to a path the dev server does not watch.** If the tool cannot, use a production
   `pnpm --filter @lemnaria/web build` and `next start`, which has no watcher at all; it costs about a
   minute and is worth it for any long check. Note that `next build` writes the same `.next`
   directory a dev server owns, so the two cannot run together (`docs/WORKFLOW.md`, *Port 4320*).
2. **Guard every step with a stable readout** — the price line works — so a mid-step reset is
   *detectable* rather than silent.
3. **Read the console before believing any "it reverted" observation.** A reset announces itself
   there and nowhere else.

## The tree a verifier measures must not move under it

**A visual verifier owns the working tree exclusively for the length of its run.** Nothing else may
write to it — not an implementer landing a fix, and above all not adversarial QA, whose method is to
*mutate production code* to see whether a claim is falsifiable. Two agents that both change the tree
cannot be run concurrently with one that reads it, and telling a verifier the tree is frozen while it
is not is worse than telling it nothing: it removes the one reason the verifier had to be suspicious.

**And a reviewer judges against `git show HEAD:`, not against the working tree.** A finding is about
a commit. Re-measuring it against a tree that has since been repaired shows the repair, which reads
as *the finding was wrong* rather than as *the finding was fixed*.

Both were learned in one hour on 2026-09-10, during M6B's owner-review round, and both costs landed:
the verifier caught a QA probe and nearly filed it as a defect, and later **nearly retracted a true
finding** because a fix had already landed in the tree it was measuring. It saved itself by reading
`git show HEAD:`. Recorded in
[`milestones/done/M6B-internationalization.md`](../milestones/done/M6B-internationalization.md), *The owner's
review of the built product*.
