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

## What still binds from these phases

Closed does not mean inert. Two guarantees established here constrain every later phase:

- **The structural parity suite.** M1's port is diffed against vendored reference geometry at a
  1e-6 m epsilon. It is the only thing standing between the project and silent visual regression, and
  it must keep running. It was nearly lost once, when the untracked `design-source/` folder it
  originally read from was scheduled for deletion.
- **Row 19 — wall seating.** Every mounted body's back face lies exactly on its wall plane. This
  applies from M2 onward, not just to M1's scene, and it was corrected once in step across both the
  port and its reference.
