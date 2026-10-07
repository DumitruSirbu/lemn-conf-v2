# Milestone plan — revised 2026-08-24

> **Every wave in every milestone below follows `docs/WORKFLOW.md`** — plan → implement →
> adversarial QA → review → verify → commit → archive. QA gates review. A wave is not done when
> its gates are green; it is done when it has been reviewed and its acceptance criteria are met.
> Deviating is a decision to record in `docs/decisions/`, not a shortcut to take quietly.
>
> **Read `docs/STATUS.md` first.** It says where the project stands and which of the plans below
> are worth opening. Completed phases are archived in `done/` and should not be read — see
> `done/README.md`. This file is the *plan and its reasoning*, not the current state.

Anchored on `docs/decisions/0003-design-reference-supersession.md` and
`docs/decisions/0002-db-backed-shareable-persistence.md`. The domain and editor contract is
`docs/design/DEVELOPMENT-SPEC.md`; the geometry contract is its
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
  2. **Database-backed shareable persistence** (M2, wave 2B). A design lives in a managed Postgres
     database (Neon, free tier) as a self-contained `jsonb` document, reachable by an opaque link
     that restores it exactly, behind a stated security baseline, a specified write path, and a
     two-tier backup story — see `docs/decisions/0002-db-backed-shareable-persistence.md`.
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
| [M0](done/M0-foundations.md) | Foundations — **DONE**, partially superseded (archived) | domain package |
| [M1](done/M1-scene-port.md) | Geometry port, R3F canvas, camera presets — fidelity gate — **DONE** (archived) | shared + mobile |
| [M2](done/M2-void-engine.md) | Placement/column/void engine, picking (2A), DB persistence and shareable links (2B) — **IN PROGRESS, 2 gates open** | domain + scene |
| [M3](done/M3-mutations.md) | Insert, remove, swap, with every guard; the client write path | domain + adapter + scene |
| [M4](done/M4-editor-surface.md) | Editor panel and shell — screens 2A, 2B, 2C, 2F | **mobile-gated** |
| [M5](M5-width.md) | Width as a neighbour boundary move, **and depth as a derived quantity** (rescoped 2026-08-27) | domain + adapter + panel |
| [M5B](done/M5B-manual-ux-remediation.md) | Manual UX remediation — eleven findings from a hand session, and the column algebra they exposed — **DONE 2026-09-02** (archived) | domain + adapter + panel |
| [M6](M6-price-and-global-settings.md) | Price bar, breakdown, whole-kitchen settings — 2D, 2E | **mobile-gated** |
| [M6B](M6B-internationalization.md) | Internationalization — Romanian becomes a source locale instead of a hardcoded one; ~~ten waves~~ **thirteen** (planned 2026-09-06, ADR 0095); closes ADR 0001 decision 5. **Every wave shipped by 2026-09-10 (6B-i `87429ca`, 6B-j `aff9a2c`).** ~~blocked on Gate O2 — the owner reads the Russian~~ **DONE — Gate O2 closed 2026-09-11 and merged to `main` via PR #8** | app + domain |
| [M7](done/M7-room-and-presets.md) | Step 1 and its six sub-states, resolving straight into the editor — **DONE, closed 2026-09-29**. Preset story deferred past M8, ADR 0131 | **mobile-gated** |
| [M7B](M7B-u-shaped-rooms.md) | U-shaped rooms — ~~**proposed** 2026-09-11, on the owner's Q5 answer to M7 (*"we should support at the end all kitchen shapes (exluding island)"*); not objected to; still the owner's to confirm~~ **confirmed by the owner 2026-09-11: *"Yeah let make separate"*** — its own milestone between M7 and M8; ~~plan not yet written~~ **PLANNED — plan written 2026-09-29: eight waves U0–U7; owner questions Q-U1–Q-U5 are put in U0 and gate U3 and U6 only.** **Next milestone as of M7's 2026-09-29 close; next wave U0.** | domain + adapter, **mobile-gated** (U7) |
| [M8](M8-review-contact-success.md) | Screens 3, 4, 5 — review, contact, success and failure | **mobile-gated** |

## Why M5B sits between M5 and M6

Added 2026-09-01, after a manual session produced eleven findings
(`testing-reports/09-manual-ux-issues.md`) and three owner decisions on top of them. It is a
milestone rather than a fix list because four of the findings are one missing capability — a span
that can hold more than one arrangement of cabinets, which is §13.3 item 2 and `BACKLOG.md` entry 2,
open since the design session — and closing it changes the persisted document, the column algebra,
the catalogue and the builders.

**After M5**, because every record it reopens is M5's (ADRs 0031, 0035, 0037) and because **M5 wave
5E is still open**: 5E photographs the width surface, and M5B changes that surface. Running them
concurrently would have 5E gate something M5B is rewriting. **M5B closed on 2026-09-02, so 5E is now
unblocked** — the width surface it photographs has stopped moving.

**Before M6**, because M6's price derives from `placements` and its settings act on the whole
kitchen. M5B adds `emptyColumns` to the persisted document (ADR 0044) and changes how many bodies a
span can hold (ADR 0046). Pricing against a model about to gain a field is work done twice.

The one thing it does **not** do is reopen the sequence's logic: §12's build order still stands, and
M5B is a correction round on step 6 (resize) rather than a new step.

## Why M6B sits between M6 and M7

Added 2026-09-06 by owner ruling, and it is **not new scope**: [ADR 0001](../decisions/0001-initial-product-and-stack.md)
decision 5 (*"Launch with Romanian as the default locale and Russian as a supported locale"*) was
accepted on 2026-08-20 and has travelled through M1–M6 without a milestone owning it.

**After M6**, because M6B's last waves reformat every money string and move catalogue labels out of
the domain — both read surfaces M6's pricing waves are still writing.

**Before M7**, because M7 adds `/configurator/room` and its six sub-states and M8 adds three more
screens. That is two whole screens of copy. Authoring it as keys costs nothing; authoring it as
hardcoded Romanian buys a later phase the job of hunting it down — which is what already happened
once, and is why ~~`apps/web/src/content/ro.ts`~~ carries an M8 `contactPlaceholder` stub today.

> **Dated correction, 2026-10-07:** `apps/web/src/content/ro.ts` no longer exists; the
> `contactPlaceholder` stub is the namespace at `apps/web/src/messages/ro.json:305`
> [source-verified, Grep]. The M8 plan, *What the code has today*, says the same.

## Why M7B sits between M7 and M8

Confirmed by the owner on 2026-09-11 (*"Yeah let make separate"*), answering M7's Q5 (*"need to do
also the U shaped - this can be a hard milstone maybe multiple"*). The reasons are the M7 re-plan's,
recorded in the archived plan's *Scope, and a confirmed split: M7 and M7B* and summarised in
[`M7B-u-shaped-rooms.md`](M7B-u-shaped-rooms.md):

**After M7**, because a U is built from M7's parts — the per-group mirror (7I, ADR 0129), the shell
and composition (7D1/7D2), the Step 1 screens and the approved-policy mechanism — and because its
bounds need the owner with the shape on screen. **Before M8**, because M8's review groups wall →
band → order, and doing M8 first would rework it for wall C. **Its own milestone**, because a third
wall reaches the stored document and every site keyed on two walls across M2–M6 code. Nothing ships
before every milestone is done, so the split costs no release.

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
| ~~The concrete database and its deployment story beyond local development~~ — resolved and provisioned 2026-08-25: Postgres on Neon's free tier, one `jsonb` document per design, linked to Vercel project `lemnaria-configurator-gbt` | closed |
| ~~Backup mechanism~~ — resolved 2026-08-25: Neon's free-tier PITR is only 6 hours, so a daily scheduled export to Vercel Blob (private, 14-day rotation) supplements it; both free at POC scale | closed |
| Design retention, deletion, and the privacy copy for a link-reachable design — decided as a placeholder (keep indefinitely, slot copy) 2026-08-25, real policy still open — **partly closed 2026-10-07 by annotation:** ADR 0019's *Supersession note — 2026-09-15* retired automatic deletion of designs (*"Nothing deletes a design automatically, and nothing is scheduled to"*); retention of **contact** data and the privacy copy remain open (M8 plan, Q13) | M2, M8 |
| Whether a shared link is read-only for a second viewer, and concurrent-edit behaviour | M2, carried |
| How a failed background write is communicated to the customer — no mockup frame shows a persistence-failure state | M4 |
| Whether the nightly export excludes the contact table, or Blob gains its own PII retention story — **half closed 2026-10-07 by annotation:** ADR 0012 scopes the export to `designs` alone and says *"this must not be widened"*, so it excludes the contact table; whether Blob gains a PII retention story or a second copy exists is M8 plan Q13 (ii), unanswered | M8, settle before |
| The Hobby-plan cron frequency limit, and how the export runs where `pg_dump` is unavailable | M2 wave 2B |
| Exact wall-length and room-height bounds | M7 |
| ~~The real "≤ 30 cm adjustment" preset-fit threshold~~ — retired by ADR 0109 Amendment A; the mechanism this threshold belonged to is superseded | closed |
| Bespoke-generation priority thresholds | M7 |
| Approved discrete width sets and filler rules | M5, M7 |
| Sample/commercial price amounts and what the estimate includes | M6, M8 |
| Consent and legal copy; whether a response timeframe may be promised | M8 |
| Screen 5's route — `/configurator/success` or `/configurator/done` | M8 |
| Desktop chrome for screens 3–5 | M8 |
| ~~Real per-preset geometry recipes~~ — the whole preset story (authoring, matching, adaptation) deferred past M8 by ADR 0131 | M8+, per ADR 0131 |
| Click reachability of occluded placements (§6.4) | M2, carried |
| Unifying occupied swap sets with the fit-filtered catalogue (§13.3 q1) | M4, carried |
| Run re-split (§13.3 q2) | **half closed by M5B** — the mechanism ships (ADR 0046); the combination offer stays open and carried |
| Linear and U room layouts, per-wall band data (§13.3 q4) | ~~out of scope, carried~~ **linear shipped in M7 wave 7J (ADR 0130); U is M7B.** `LEVELS` stay constants for every wall (M7 re-plan); per-wall data is transform, length and corner reach |
| U-shaped room bounds, the walkway between side runs, three-wall composition, the toggle on a U (M7B Q-U1–Q-U5) | M7B (put in wave U0) |
