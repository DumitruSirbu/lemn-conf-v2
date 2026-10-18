# Milestones

This folder holds the plans of milestones that are still open. It is the plan and its ordering, not the
current state.

- **[`../STATUS.md`](../STATUS.md) is the source of truth for status.** The status column below is a pointer
  copied from it on 2026-10-18; if the two disagree, STATUS wins.
- **Do not read `done/` or [`../archive/`](../archive/README.md)** except to answer a historical question.
  Their plans describe intentions that have shipped or been superseded. See [`done/README.md`](done/README.md).
- The pre-2026-10-18 version of this file (status prose, struck-through corrections, open-question table,
  "why Mx sits between" essays) is frozen in
  [`../archive/milestones-README-history.md`](../archive/milestones-README-history.md).

Every wave follows [`../WORKFLOW.md`](../WORKFLOW.md): plan, implement, adversarial QA, review, verify,
commit, archive. QA gates review. A milestone's close includes the test audit; a "cannot fail" finding keeps
it open. Deviating is a decision to record in `../decisions/`.

## Open milestones

| Milestone | Scope | Status (per STATUS) |
| --- | --- | --- |
| [M8](M8-review-contact-success.md) | Screens 3, 4, 5: review, contact, success and failure. Mobile-gated. | In progress, not done; open list in STATUS section 3 |
| [8U](8U-merge-adjacent-empty-spaces.md) | Merge adjacent empty spaces (an M8 sub-wave plan). | Built and reviewed; S5 not built; plan not archived |
| [M8C](M8C-generation-fill-and-preset-authoring.md) | Generation fills every free wall-run end; the owner saves, lists and uses presets. Mobile-gated (P4, P8). | In progress |
| [M8B](M8B-customer-profiles.md) | Customer profiles: e-mail and password, a dashboard, claiming anonymous designs. Mobile-gated. | Planned; no wave dispatched |
| [M9](M9-delivery-preparation.md) | Delivery preparation: hosting, providers, the launch gate. Inherits M8's waves 8R, 8S. | Proposed stub; no plan, no waves |
| [8q-s0-measurements](8q-s0-measurements.md) | Measurement record for the 8Q wave. | No status in STATUS; 8Q2 is done |
| [migration-environment-safety-check](migration-environment-safety-check.md) | Standalone plan: migration environment safety check. | No status in STATUS |

## Done milestones

All are archived in [`done/`](done/README.md) and must not be read.

| Milestone | Milestone | Milestone |
| --- | --- | --- |
| M0 | M1 | M2 |
| M3 | M4 | M5 (and its frozen-map plan) |
| M5B | M6 | M6B |
| M7 | M7B | M7C |
| 8M2 | 8N (8J2) | 8Q2 |
| 8V | adversarial-review-remediation | chrome-parity-with-the-design-reference |
| dom-003-set-width-split | | |

## Phase sequence and why it holds

Anchors: [ADR 0003](../decisions/0003-design-reference-supersession.md) (design reference supersession),
[ADR 0002](../decisions/0002-db-backed-shareable-persistence.md) (persistence). The behavioural contract is
[`../design/DEVELOPMENT-SPEC.md`](../design/DEVELOPMENT-SPEC.md); its §12 build order (parts, placement and
void model, picking, insert/remove/swap, panel, resize, then presets, verification, contact) is followed.
The risky 3D layer and picking come first; the form screens come last. M1 to M6 ran against a seeded L room
that is a development fixture and must never be shown to a customer as a chosen room.

- **M5B before M6.** M6's price derives from `placements`; M5B added `emptyColumns` to the persisted document
  (ADR 0044) and changed how many bodies a span can hold (ADR 0046). Pricing first would be done twice.
- **M6B before M7.** Romanian became a source locale (closes ADR 0001 decision 5) so M7 and M8 screens are
  authored as keys, not hardcoded copy.
- **M7B before M8.** M8's review groups wall, band, order; a third wall (U-shaped rooms) reaches the stored
  document, so M8 first would rework it.
- **M8C before M8B**, by owner ruling (fixes first, then the preset milestone, then login / register /
  dashboard; `../OWNER_FIXES.md`). M8 is not done and M8C does not close M8's open items. Accounts, roles
  and the dashboard stay M8B's.
- **M8B after M8, before launch.** Split from M8 so a pull request is a reviewable unit; nothing ships before
  every milestone is done, so the split costs no release.
- **M9 last** (after M8B). That placement is the architect's recommendation, not an owner ruling. M9 owns the
  launch gate, waves 8R and 8S, and the hosting and provider choices.
- **Preset Preview in step 1E** (owner Q-6 ruling): the card has Preview only; Preview opens a carousel
  pop-up whose Select copies the preset and opens the editor ([ADR 0003](../decisions/0003-design-reference-supersession.md),
  4b amendment; [M8C plan](M8C-generation-fill-and-preset-authoring.md)). This overrides "no confirm screen"
  and, for that pop-up only, the "no pagination in a chooser" rule.

## Mobile gate

Mobile is the owner's top priority and its mockup is the only one covering all five screens. Milestones
flagged mobile-gated (M4, M6, M7, M7B U7, M8, M8B, M8C P4 and P8) cannot close on desktop evidence.

- Domain, store, scene and panel sections are one set with no viewport awareness; only the layout shell
  branches (`DEVELOPMENT-SPEC.md` section 10.1). A rule that must differ between viewports is a wrong rule:
  stop and return it to planning.
- The one sanctioned difference: on mobile the sheet is dismissed to inspect the result; every edit still
  applies immediately. Any second difference is a defect until proven otherwise.
- Desktop chrome for screens 3 to 5 is undesigned. Do not invent it; ship them responsively from the mobile
  design and record the gap.

## Rules every phase inherits

- Never offer what cannot be satisfied: disabled-with-reason beats warn-after-click (spec sections 9, 13.1).
- One code path for insert and swap. Voids are derived, never authored.
- No product logic in components; commands return `{ok}` or `{ok:false, reason}`.
- Do not re-propose a rejected direction (spec section 13.2): auto-shifting a run, free-form width entry,
  deriving a wall plane from a previous occupant's bbox, a cabinet navigator list, pagination in a chooser.
- Romanian copy comes verbatim from the mockups where a frame supplies it; a content slot stays a slot.
- CRM integration is out of scope.

## Open questions

Open product questions are not tracked here. See [`../PRODUCT_REQUIREMENTS.md`](../PRODUCT_REQUIREMENTS.md),
each milestone plan, and `../decisions/`. The earlier table is in the history copy above.
