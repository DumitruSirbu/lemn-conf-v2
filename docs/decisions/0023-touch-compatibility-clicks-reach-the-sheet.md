# ADR 0023 — A touch on the scene was also pressing the sheet; the canvas cancels `touchend`

Status: Accepted
Date: 2026-08-26
Type: Finding + Decision
Milestone: M4 Wave 4D — found by writing the browser test, fixed in the scene adapter

## Context

`DEVELOPMENT-SPEC.md` §10 requires that the mobile sheet "never steals or leaks pointer events into
the canvas", and M4's acceptance criteria repeat it. Every reading of that rule during planning ran
one way: the sheet is an overlay, so the risk is the sheet swallowing a gesture meant for the scene.

It runs the other way too, and that is the direction that shipped broken.

A touch produces `pointerdown`/`pointerup` — which is what react-three-fiber picks with — and then
the browser synthesises `mousedown`/`mouseup`/`click` for listeners that only understand a mouse.
Those synthesised events are hit-tested **when they are dispatched**, not when the finger landed. By
then picking has already opened §9's sheet over the bottom ~78 dvh of a 390 × 844 viewport.

So one tap selected a body *and* pressed whatever §9 control the sheet had just put under the finger.
Captured verbatim from the running page:

```
pointerdown t=7243.3 target=CANVAS#
touchstart  t=7243.3 target=CANVAS#
pointerup   t=7243.3 target=CANVAS#
touchend    t=7243.3 target=CANVAS#
mousedown   t=7243.3 target=BUTTON#finish-white
mouseup     t=7243.3 target=BUTTON#finish-white
click       t=7243.3 target=BUTTON#finish-white
```

Measured one tap per fresh page, so this is not a scan artefact: a tap at y=240 selected `p24` **and
inserted a body**; taps at y=400 and y=500 selected the fridge **and applied a finish nobody chose**.
Each minted a design and wrote it to the database. Every canvas tap was a coin flip on whether it
also edited the design, which made §10's loop undrivable.

## Decision

**The canvas cancels `touchend`**, through a non-passive listener attached to `gl.domElement`.

Per specification a cancelled touch produces no compatibility mouse events, so the synthesised
`mousedown`/`mouseup`/`click` never fire. This is the fix at the source rather than downstream of it.

Three properties make it safe here specifically:

- The canvas is driven by **pointer** events, not mouse events — r3f picks with `pointerdown`/
  `pointerup`, which are unaffected.
- It already declares `touch-action: none`, so it was never relying on default touch behaviour.
- **A real mouse never produces a `touchend`**, so desktop is untouched. Verified: the desktop suite
  is green and its camera-does-not-jump assertion compares byte-identical canvas buffers.

The listener must be non-passive or `preventDefault` is ignored, which is why it is attached to the
element rather than through React's delegated (passive-by-default) touch handlers.

## Alternatives considered

- **Ignore clicks in the panel for N ms after a pick.** Rejected: a time window is a guess about the
  browser's dispatch latency, and it would suppress a legitimate fast tap on a control the customer
  did mean to press.
- **Check `event.detail === 0` or a `pointerType` flag on each panel control.** Rejected: it puts the
  workaround in every §9 control, so a control added later inherits the bug by omission. The defect
  is one canvas emitting events it has no use for; that is where it belongs.
- **Delay opening the sheet until after the click would have been dispatched.** Rejected: it makes
  selection feel laggy to fix a problem the customer never sees, and it is the same latency guess in
  a different place.
- **Leave it and gate the phase.** Rejected. It is a stated M4 acceptance criterion, it silently
  wrote unwanted edits to the customer's design, and it blocked the phase gate.

## Consequences

- Named regression test: `the tap that opens the sheet is not also delivered to the sheet`
  (`apps/web/tests/e2e/editor-panel.e2e.spec.ts`). After the fix the same four taps select and do
  nothing else — no design minted, no request sent.
- **This is an application behaviour change that landed on a wave scoped as light-tier test work.**
  It is recorded here rather than left inside a test commit, because the next person reading
  `kitchen-canvas.tsx` needs the reason and would not find it in a milestone plan.
- Worth re-checking on real hardware. `docs/best-practices/browser-and-visual-qa.md` is explicit that
  emulation is not a handset, and compatibility-click behaviour is precisely the kind of thing that
  differs between a synthesised touch and a real digitiser — iOS Safari especially. The open handset
  item in `docs/STATUS.md` now has this specific thing to look at.
- If a future control genuinely needs compatibility mouse events from the canvas, this listener is
  the thing to revisit — not to delete, but to narrow to the picking gesture.
