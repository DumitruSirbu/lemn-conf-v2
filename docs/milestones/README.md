# Milestone plan — revised 2026-08-24

Anchored on `docs/decisions/2026-08-24-design-reference-supersession.md` and
`docs/decisions/2026-08-24-db-backed-shareable-persistence.md`. The domain and editor contract is
`design-source/Modern Kitchen Cabinets 3D (3)/DEVELOPMENT-SPEC.md`; the geometry contract is its
`SPEC.md`; the screens, states and copy are its two `.dc.html` mockup files.

## The target: a working POC that matches the design reference

The owner's stated priority. It calibrates every phase below:

- **Bias toward a demonstrable end-to-end path** — room → preset → 3D edit → review → contact →
  success — with real database persistence and reference-quality 3D. A phase closes when its slice
  of that path works on a phone, not when its edge cases are exhausted.
- **Named, not dropped.** The 24-row regression table, the exact width sets, the price formula and
  the legal copy all still belong to a phase and are all still written down. Some land as hardening
  within their phase rather than blocking the first pass through it. Deferred-with-an-owner is
  allowed; silently omitted is not.
- **Two items are exempt from that calibration**, because they are the point of the POC rather than
  polish on it. Neither may be reduced to make a phase close:
  1. **Visual fidelity of the 3D port** (M1). The previous attempt failed here. It has its own
     named gate with two independent kinds of evidence.
  2. **Database-backed shareable persistence** (M2). A design lives in the application's own local
     database and is reachable by an opaque link that restores it exactly.
- **CRM integration stays out of scope** and is not planned further. Eventually it will consume the
  contact form's submission; the submission boundary is already shaped to allow that.

## Flow being built

Five screens. Step 1 owns six internal sub-states and is still one step — the customer sees
"Pasul 1 din 4" across all of them — and it resolves **directly into Step 2 with the editor open**.
There is no confirm-and-continue screen between choosing a preset and editing.

```
Step 1 Cameră  →  1A shape → 1B dimensions → 1C validation
   (one step)     → 1D preset loading → 1E preset list → 1F bespoke generation
        ↓ (straight through, no confirm screen)
Step 2 Configurare — the 3D editor, the most important screen
        ↓
Step 3 Verificare  →  Step 4 Contact  →  Step 5 Succes
```

| Phase | Goal | Primary surface |
| --- | --- | --- |
| [M0](M0-foundations.md) | Foundations — closed, partially superseded | domain package |
| [M1](M1-scene-port.md) | Geometry port, R3F canvas, camera presets, no editing — **fidelity gate** | shared + mobile |
| [M2](M2-void-engine.md) | Placement/column/void engine, picking, **DB persistence and shareable links** | domain + scene |
| [M3](M3-mutations.md) | Insert, remove, swap, with every guard | domain |
| [M4](M4-editor-surface.md) | Editor panel and shell — screens 2A, 2B, 2C, 2F | **mobile-gated** |
| [M5](M5-width.md) | Width editing as a neighbour boundary move | domain + panel |
| [M6](M6-price-and-global-settings.md) | Price bar, breakdown, whole-kitchen settings — 2D, 2E | **mobile-gated** |
| [M7](M7-room-and-presets.md) | Step 1 and its six sub-states, resolving straight into the editor | **mobile-gated** |
| [M8](M8-review-contact-success.md) | Screens 3, 4, 5 — review, contact, success and failure | **mobile-gated** |

## Why this sequence

`DEVELOPMENT-SPEC.md` §12 supplies a build order derived from what actually cost time when the
prototype was built: parts → placement/column/void model → picking → insert/remove/swap → panel →
resize → *then* presets, verification and contact ("plain forms by comparison"). That order is
followed rather than replaced, for three reasons.

1. **The 3D layer is the part that failed before.** The reference says so in its opening paragraph.
   Sequencing the risky work first means a failure surfaces in phase two, not phase seven.
2. **Picking is where the time went.** §12 step 3 names it explicitly, and §6.1 records the worst
   bug of the session — three.js raycasts lines with a one-metre default threshold, so every dashed
   outline stole its neighbours' clicks and the symptom read as "the levels are wrong". Picking gets
   its own gate in M2 rather than being absorbed into UI work.
3. **The §11 regression table is a ready-made acceptance suite.** Its 24 rows are each a shipped
   defect. They map onto phases M2–M5 almost row for row, which makes those phases falsifiable
   without any UI at all.

The product flow is *not* built in screen order. Step 1 (M7) comes late even though the customer
meets it first, because the editor is the risk and the room screen is a form. M1–M6 run against a
fixed seeded L room so the editor can be exercised before any room input exists. That seeded room is
a development fixture and must never be presented to a customer as a chosen room.

Persistence lands in M2 rather than at the end, because it is one of the two exempt items above and
because M2 is where `Design` is defined and the store first exists. Deferring it would mean building
five phases of editing against state that cannot outlive a refresh, and then retrofitting.

## Mobile is gate-worthy on its own

Mobile is the owner's stated top priority, and the mobile mockup is the only one covering all five
screens. So:

- Every phase that produces a customer-visible surface (M4, M6, M7, M8) states its mobile acceptance
  criteria as criteria of that phase. A phase cannot close on desktop evidence.
- Desktop chrome is a separate, explicitly named line item inside the same phase. It may lag the
  mobile surface within a phase; it may not lead it, and it may not gate it.
- Per `DEVELOPMENT-SPEC.md` §10.1 the domain, store, scene and panel-section components are one set
  with no viewport awareness. Only the layout shell branches, and touch sizing is a spacing token.
  **A rule that needs to differ between viewports is a wrong rule** — the prototype had no such case.
  Any phase that finds one stops and returns it to planning.
- **There is exactly one sanctioned exception, and it is not a rule.** On mobile the sheet covers
  most of the viewport, so the viewing model is *choose in the sheet, then dismiss it to inspect the
  result full-screen*; desktop sees both at once. Every edit still applies to the model immediately
  on both viewports — the sheet's close control views, it does not commit. This is a visibility
  affordance driven by screen real estate. Any *second* viewport difference is a defect until
  proven otherwise. See M4 and the supersession record §5b.
- Desktop chrome for screens 3, 4 and 5 is undesigned; the desktop mockup stops after screen 2. Do
  not invent it. Ship those screens responsively from the mobile design and record the gap.

## Cross-cutting rules every phase inherits

- **Never offer what cannot be satisfied.** Disabled-with-reason beats warn-after-click. A refusal
  reaching the customer means a list offered something it should have disabled
  (`DEVELOPMENT-SPEC.md` §9, §13.1).
- **One code path for insert and swap.** Forking them is how every replace row silently stopped
  working (§5.3).
- **Voids are derived, never authored** (§3, §4).
- **No product logic in components.** Commands return `{ok}` or `{ok:false, reason}`; the panel
  renders `reason` (§12).
- **Never infer identity from geometry when the customer's choice is in hand** (§6.3).
- **Do not re-propose a rejected direction** (§13.2): auto-shifting a run, free-form width entry,
  deriving a wall plane from the previous occupant's bbox, a "cabinets in the scene" navigator list,
  or pagination in a chooser. Each was built or specified and dropped for a recorded reason.
- **Romanian copy comes from the mockups verbatim** where a frame supplies it. Where a frame marks
  something a content slot (the not-included list, consent text, timeframe promises), it stays a slot.
- Every phase follows `docs/WORKFLOW.md`: plan, narrow implementation dispatch, adversarial QA,
  parallel review, then verification by the coordinating agent running the commands itself.

## Open questions that gate specific phases

None of these may be closed by inventing a value. Each is listed again in the phase it blocks.

| Open question | Blocks |
| --- | --- |
| The concrete database and its deployment story beyond local development | M2 |
| Design retention, deletion, and the privacy copy for a link-reachable design | M2, M8 |
| Whether a shared link is read-only for a second viewer, and concurrent-edit behaviour | M2, carried |
| Exact wall-length and room-height bounds | M7 |
| The real "≤ 30 cm adjustment" preset-fit threshold | M7 |
| Bespoke-generation priority thresholds | M7 |
| Approved discrete width sets and filler rules | M5, M7 |
| Sample/commercial price amounts and what the estimate includes | M6, M8 |
| Consent and legal copy; whether a response timeframe may be promised | M8 |
| Screen 5's route — `/configurator/success` or `/configurator/done` | M8 |
| Desktop chrome for screens 3–5 | M8 |
| Real per-preset geometry recipes | M7 |
| Click reachability of occluded placements (§6.4) | M2, carried |
| Unifying occupied swap sets with the fit-filtered catalogue (§13.3 q1) | M4, carried |
| Run re-split (§13.3 q2) | out of scope, carried |
| Linear and U room layouts, per-wall band data (§13.3 q4) | out of scope, carried |
