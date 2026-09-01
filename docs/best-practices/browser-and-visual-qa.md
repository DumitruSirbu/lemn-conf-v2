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
