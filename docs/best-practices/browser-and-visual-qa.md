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
