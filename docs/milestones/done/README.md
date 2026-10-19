# Completed milestones — archive

**Do not read the plans in this directory.** They are closed. Everything a session needs about these
phases is summarised in `docs/STATUS.md`, and everything durable about *why* the code is shaped the
way it is lives in `docs/decisions/`.

A milestone plan is an intention recorded at a point in time. Once the phase ships, the code is the
truth and the decision records are the reasoning; the plan becomes history. Reading it costs tokens
and risks acting on a superseded intention — M0's placement model, for instance, was replaced during
M2, and its plan still describes the retired design.

Open one of these only to answer a **historical** question: what a phase originally committed to,
what evidence closed it, or what it deliberately deferred.

| Phase | Closed | What it delivered | Live knowledge now in |
| --- | --- | --- | --- |
| [M0 — Foundations](M0-foundations.md) | 2026-08-24, partially superseded | Workspace, domain package, validation, persistence/versioning conventions. Its placement model was replaced in M2 and the retired modules deleted. | `docs/decisions/0003-design-reference-supersession.md` |
| [M1 — Scene port](M1-scene-port.md) | 2026-08-25 | Supplier geometry ported into `packages/three-adapter`, R3F canvas, camera presets. Closed on a fidelity gate requiring two independent kinds of evidence. | `packages/three-adapter/reference/`, `docs/best-practices/product-invariants.md`, `docs/decisions/0005-m2-row19-m1-wall-gap-finding.md` |
| [M2](M2-void-engine.md) | Placement/column/void engine, picking, DB persistence and shareable links | Closed 2026-08-25 | Void derivation lives in `packages/configurator-domain/src/void-engine.ts` and `DEVELOPMENT-SPEC.md` §3–§4; persistence in ADRs 0002, 0006–0013; the write path's authorisation in ADR 0019 and its client half in M3 Wave 3C-2b. |
| [M3](M3-mutations.md) | Insert, remove, swap, and the client write path | Closed 2026-08-26 | Commands live in `packages/configurator-domain/src/commands/`; the §7 builders and the `BodyProbe` in `packages/three-adapter`; write authorisation in ADR 0019 and `apps/web/src/lib/server/write-token.ts`. Findings: ADRs 0015–0020. |
| [M4](M4-editor-surface.md) | The customer-facing editor panel and its two layout shells | Closed 2026-08-26 | §9's rules live as a pure projection in `apps/web/src/panel/panel-model.ts`, rendered by `editor-panel.tsx`; the shell branch is CSS only (`editor-panel.module.css`, one 900 px query). Read/write access in ADR 0019 and `apps/web/src/lib/server/write-token.ts`. Findings: ADRs 0021–0024. One criterion closed **unmet** — 2C's browser test, see ADR 0024. |
| [M5B — Manual UX remediation](M5B-manual-ux-remediation.md) | Closed 2026-09-02 | Eleven findings from a manual session, plus the width and empty-space work they exposed: an empty space is now recorded in the design document and survives a reload, an insert splits the column it does not fill, adjacent empty spaces merge under an 800 mm cap, the pantry column became the one resizable column, and the hob-oven filler and dishwasher niche gained finishable fronts. | `emptyColumns` on `DesignSchema` and its nine refusal codes (`design.ts`, `validate-design.ts`); `projectEmptyColumns` and `mergeAdjacentEmptyColumns` (`void-engine.ts`, `merge-empty-columns.ts`); `splitColumn` (`commands/split-column.ts`). Decisions: ADRs 0043–0051, with 0033 and 0046 amended at close. Open consequences are backlog 20–24, and **Q5 is still open** — is 800 mm the ceiling on any empty column, or only on a merge? |
| [M7 — Screen 1: room shape, dimensions, presets, bespoke fallback](M7-room-and-presets.md) | Closed 2026-09-29 | `/configurator/room` and its six sub-states under one step; straight, L and mirrored right-hand L kitchens entered through dimensions and carried through to bespoke generation (1F) via the M2/M3 engine's own guards; the mobile gate (7K) and the separate desktop line (7L, `min-width: 900px`, sharing components/rules/copy with the phone); visitor identity and resume, a design opening only in its owning browser, and the private share link; the 3D shell, wall planes, backsplash, seats and camera presets deriving from the customer's own room instead of the seeded reference. The preset story (search, evaluation, application, the thumbnail rig) was deliberately **not** shipped — deferred past M8. | `docs/STATUS.md`'s M7 banner and table row for the full shipped-scope summary and verification evidence; [ADR 0131](../../decisions/0131-the-preset-story-is-deferred-past-m8-and-every-room-goes-from-its-dimensions-straight-to-composition.md) for the preset-path deferral and what a reviver inherits; [ADR 0104 Amendment B](../../decisions/0104-the-mockups-are-the-chrome-specification-and-the-strips-own-row-is-withdrawn.md#amendment-b-2026-09-29--q-7l-1-answered-d1bs-heading-on-site-note-and-plan-hint-are-not-drawn-and-a-desktop-frames-text-is-not-authority-on-its-own) for Step 1's copy doctrine; ADR 0113 for Gate M7-C's withdrawal; ADRs 0108–0131 generally (see the M7 table row in `docs/STATUS.md` for the full list) for the room/generation domain rules. |

## Closed by owner ruling, 2026-10-18

Same rule: do not read these except for a historical question. Their live knowledge is in `docs/STATUS.md` and
`docs/decisions/`.

| Phase | Closed | What it delivered | Live knowledge now in |
| --- | --- | --- | --- |
| [M5 — Width editing](M5-width.md) and [its frozen-map plan](M5-frozen-map.md) | 2026-10-18, owner ruling | Width as a neighbour boundary move, and depth as a derived quantity. | `docs/STATUS.md` (M5 row); ADRs 0052, 0053 |
| [M6B — Internationalization](M6B-internationalization.md) | 2026-10-18, owner ruling | Romanian as a source locale in message files; Gate O2 closed 2026-09-11. | ADR 0095 |
| [M7B — U-shaped rooms](M7B-u-shaped-rooms.md) | 2026-10-18, owner ruling | U-shaped rooms, waves U0-U7. | ADRs 0132-0134 |
| [M6 — Price bar and global settings](M6-price-and-global-settings.md) | 2026-10-18, owner ruling | Live price, breakdown and whole-kitchen settings (screens 2D, 2E). | `docs/STATUS.md` (M6 row); the ADRs that cite the plan, e.g. 0071-0094 |
| [M7C — M7 feedback fixes](M7C-m7-feedback-fixes.md) | 2026-10-18, owner ruling | Twelve fixes from the owner's hands-on check of M7 and M7B; log in `docs/archive/M7-FEEDBACK.md`. | ADRs 0104, 0110, 0135, 0139 |

## Standalone plans confirmed shipped, 2026-10-18

Same rule: do not read these except for a historical question.

| Plan | Closed | What it delivered | Live knowledge now in |
| --- | --- | --- | --- |
| [adversarial-review-remediation](adversarial-review-remediation.md) | S1-S12 shipped (commits db9c4024..); archived 2026-10-18 | Remediation of the adversarial review findings. Only SEC-001 stays open, as a launch gate. | `docs/backlog/open.md`, M9; ADR 0051 (its S9 tables stay verbatim) |
| [chrome-parity-with-the-design-reference](chrome-parity-with-the-design-reference.md) | Shipped 2026-09-09/10 (55c0a9b4, 0efcbbd1, d1f34977, b489f028); archived 2026-10-18 | Chrome parity with the design reference. | ADRs 0082, 0094, 0104 |
| [dom-003-set-width-split](dom-003-set-width-split.md) | Shipped in 30283571; archived 2026-10-18 | Nine-module split of `set-width.ts`. | `packages/configurator-domain/src/commands/` |

## Closed sub-wave plans of M8 (archived 2026-10-17)

The M8 parent plan, `../M8-review-contact-success.md`, stays open and is not archived. These four plans are its closed
sub-waves; their close evidence is in the parent plan (*8Q2 as closed*, *8M2 as closed*) and in `docs/STATUS.md`. The same
rule applies: do not read them except for a historical question.

| Wave | Closed | What it delivered | Live knowledge now in |
| --- | --- | --- | --- |
| [8Q2 — CSP report table](8Q2-csp-report-table.md) | 2026-10-14 | CSP violation reports kept in a fixed-size table of our own. | ADR 0162 |
| [8M2 — shop WhatsApp and already-sent](8M2-shop-whatsapp-and-already-sent.md) | 2026-10-14 | The design goes to the shop's WhatsApp; an already-sent kitchen shows its request and a call. | ADR 0163 |
| [8N (wave id 8J2) — nodemailer Gmail notification](8N-nodemailer-gmail-notification.md) | built and reviewed, docs closed 2026-10-17 | The shop's notice leaves through Gmail SMTP by nodemailer. | ADR 0164 |
| [8V — done-page link and shop e-mail](8V-done-page-link-and-shop-email.md) | built and reviewed, docs closed 2026-10-17 | The done page links to the customer's design; the shop's e-mail is branded HTML led by a frozen view-only link. | ADR 0165 |

## What still binds from these phases

Closed does not mean inert. Two guarantees established here constrain every later phase:

- **The structural parity suite.** M1's port is diffed against vendored reference geometry at a
  1e-6 m epsilon. It is the only thing standing between the project and silent visual regression, and
  it must keep running. It was nearly lost once, when the untracked `design-source/` folder it
  originally read from was scheduled for deletion.
- **Row 19 — wall seating.** Every mounted body's back face lies exactly on its wall plane. This
  applies from M2 onward, not just to M1's scene, and it was corrected once in step across both the
  port and its reference.
