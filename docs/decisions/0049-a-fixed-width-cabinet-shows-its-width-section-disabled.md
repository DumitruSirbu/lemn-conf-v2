# ADR 0049 — A fixed-width cabinet shows its width section disabled, with the reason

Status: Accepted
Date: 2026-09-01
Type: Decision
Milestone: M5B — Manual UX remediation, wave 5B5

## Context

Report item 9 (`testing-reports/09-manual-ux-issues.md`): after removing a tall cabinet and inserting
a regular one in its place, the new cabinet's panel shows **no `LĂȚIME` section at all** — missing
entirely, not disabled. The owner read that as a placement bug: *"If I choose a resizable cabinet it
doesn't matter where I insert it, it should provide the resize options"*.

**The reported cause is not the cause**, and the investigation is recorded because the conclusion
turns on it. Nothing in the path reads the slot a body was inserted into:

- `use-panel-view.ts:146-158` asks `columnWidthChoices` and renders nothing when it answers
  `undefined`. Both width queries bail on the same answer — `queries/width-options.ts:76` and
  `queries/width-steps.ts:56`.
- `columnWidthChoices` (`commands/set-width.ts:170-190`) answers `undefined` when
  `resolveResizableBody` refuses.
- `resolveResizableBody` (`commands/resolve-column-members.ts:27-42`) refuses `NOT_RESIZABLE` when
  `record.fixedWidth` is true.
- The body in the screenshot is *Corp plită și 2 sertare* = `base-hob-2drawer`, built by `hobBase`
  (`catalog.ts:391-400`), which sets `fixedWidth: true` and `widthFlex: [600]`.

So the owner's premise is already true — resizability is a property of the cabinet type — and the
cabinet they chose is a 600 mm-only cabinet by [ADR 0027](0027-the-hob-is-part-of-the-cabinet.md),
because the hob it carries is a fixed 590 × 520 appliance.

**What is a real defect is the silence.** §13.1's *"Disable, don't warn"* and
[ADR 0032](0032-an-entry-that-does-not-fit-is-shown-disabled-with-its-reason.md) both say an
unavailable thing is shown disabled **with its reason**, never removed. `NOT_RESIZABLE` is a refusal
the engine already produces and already has a sentence for, and the panel discards it.

The suppression is deliberate, and its reasoning is written into `set-width.ts:178-182`: publishing
chips for a `fixedWidth` body *"would leave §9's flag as the only thing standing between the customer
and a section of dead controls."* Overturning a written decision needs the owner, so it was put to
them rather than changed.

## Decision

**A fixed-width cabinet renders its width section, disabled, carrying the engine's own reason.**
Owner, 2026-09-01: the `LĂȚIME` section must be greyed with a sentence saying why — that this cabinet
is only made at 600 mm — rather than omitted. Their grounds, and they are the argument:

1. **The silence is what made it read as a defect.** A section that is not there tells the customer
   nothing, so they conclude the product is broken. A section that is there and greyed tells them the
   cabinet is made at one width, which is the truth and is also useful.
2. **Every other blocked control in this product already shows disabled-with-reason.** A width section
   that vanishes is the one place the rule is not applied, and an inconsistent rule is worse than
   either rule applied everywhere.

This supersedes `set-width.ts:178-182`'s *"a section of dead controls"* reasoning. That reasoning was
about a section of controls that appear operable and are not; the answer is that the controls are
visibly disabled and say why, which is a different thing and is what ADR 0032 already asks for
everywhere else.

**The section is rendered as one `active` chip at the body's single width, with the reason.** Not a
stepper: `widthRangesMm` for a `fixedWidth` row is a set of degenerate ranges (`discreteWidths`,
`catalog.ts:82-87`), so ADR 0035 decision 3's discriminator already puts it on the discrete control.
No new control type is introduced.

**`resolveResizableBody` is not loosened, and `setWidth` is unchanged.** The command still refuses
`NOT_RESIZABLE` for the same bodies. One author for *"may this be resized"* is what
[ADR 0016](0016-hood-chimney-is-carcass.md), [ADR 0017](0017-sink-base-minimum-width.md) and
[ADR 0029](0029-a-two-door-cabinet-may-not-be-offered-at-one-door-widths.md) each cost a wave to
establish, and this record does not spend that again. What changes is only what the **panel** does
with a refusal it already receives.

## The anti-invariant this record must not break

**Finding R2.7's loud failure is preserved, and it is the one way this change can go wrong.**
`columnWidthChoices` answers `undefined` in two materially different situations and only one of them
is being changed:

| Situation | Before | After |
| --- | --- | --- |
| The body is `fixedWidth` — a real, correct fact about a real cabinet | no section | **section, one chip, disabled, with the reason** |
| The body resolves **no width set at all** — a `catalogEquivalentId` pointing nowhere, an entry whose declared floor excludes every listed width | no section | **still no section** |

The second is missing **catalogue data**, not a fact about the cabinet, and `set-width.ts`' own note
records why it must keep failing loudly: a chipless section would make broken data look like a
constrained product. So the rule is *a fixed width still renders; an absent width still does not*,
and the wave carries it as an anti-invariant test rather than an assertion of the happy path.

**A fixed-width cabinet whose control actually works would be the regression**, not the fix. Clicking
the single chip must change nothing and must produce no rejection banner — the chip is `active`,
which is the state §9 already gives the width a body is standing at.

## Alternatives considered

**Leave it suppressed and improve the offer list's copy instead.** Rejected by the owner: the
customer is looking at the width section, and telling them elsewhere is not telling them.

**Make `resolveResizableBody` return the body and let the panel decide.** Rejected. It would put the
resizability question in two places, which is the exact defect class ADRs 0016, 0017, 0029 and 0032
each record. The refusal is already published; the panel renders it.

**Show a plain sentence with no chip.** Rejected as a third width presentation alongside the stepper
and the chip row. §9 assumes exactly one `active` chip and puts that number in the section's value
label; a chipless variant would need its own value-label rule for no gain.

## Records swept before deciding, and how each is settled

| Record | What it says | Settled how |
| --- | --- | --- |
| [ADR 0032](0032-an-entry-that-does-not-fit-is-shown-disabled-with-its-reason.md) | An entry that does not fit is **shown disabled with its reason**, never removed. | **This record applies it to the width section**, which was the one place it was not applied. No conflict — it is the rule being honoured rather than changed. |
| `DEVELOPMENT-SPEC.md` §13.1, *"Disable, don't warn"* | Anything that cannot be satisfied is greyed and unclickable **with the reason**. | **Same.** The spec already required this; the code did something else. |
| `DEVELOPMENT-SPEC.md` §9 item 6 | *"`canWidth` = selected · not empty · not `fixedWidth`"* — already marked **SUPERSEDED by ADR 0035 and ADR 0034** (`fixedWidth` is not the discriminator). | **Superseded again, in the same direction.** `fixedWidth` decided whether the section *exists*; it now decides only that every chip is disabled. Amended with a dated pointer here. |
| `DEVELOPMENT-SPEC.md` §9, *"Empty voids hide Finisaj, Mâner, Lățime"* | A void has nothing to finish. | **Untouched.** This record is about an occupied selection; a void still hides all three. |
| `commands/set-width.ts:178-182` | Publishing chips for a `fixedWidth` body *"would leave §9's flag as the only thing standing between the customer and a section of dead controls."* | **Superseded by this record.** The controls are visibly disabled and carry a reason, which is not the failure that note anticipated. The note is the reason this was an owner question rather than an agent's call. |
| `commands/set-width.ts`, finding R2.7 | `undefined` where there is **nothing to choose from** is load-bearing: missing catalogue data must fail loudly. | **Preserved verbatim, and it is the anti-invariant above.** Only the `fixedWidth` arm changes. |
| [ADR 0035](0035-width-is-a-bounded-stepper-not-a-menu-of-sizes.md) decision 3 | The stepper/discrete choice is read from the shape of `widthRangesMm`, never inferred and never from `fixedWidth`. | **Followed.** A `fixedWidth` row's ranges are degenerate, so it lands on the discrete control with no new branch. |
| [ADR 0034](0034-width-chips-are-column-scoped-and-judged-by-the-command.md) | Chips are the **column's**, and each is judged by running `setWidth`. | **Honoured, and it is why the chip is `active` rather than `blocked`.** The body is standing at that width; `setWidth` is not run to discover a width it already has. |
| [ADR 0027](0027-the-hob-is-part-of-the-cabinet.md) | A hob-bearing base is 600 mm and nothing else, because the appliance is. | **Unchanged, and it is the sentence the section now shows.** This record makes ADR 0027 visible to the customer instead of silent. |
| [ADR 0024](0024-the-rejection-banner-has-no-reachable-path.md) | A refusal the panel can never render is a promise never kept. | **Corroborates.** `NOT_RESIZABLE` had no reachable path in the width section; it does now. |

## Consequences

- **Five catalogue rows gain a visible width section**: `base-hob-2drawer`, `base-hob-oven`,
  `tall-oven-tower`, `tall-fridge-housing`, `fridge-free`. `tall-pantry` leaves this set in the same
  phase ([ADR 0048](0048-the-pantry-column-is-the-one-resizable-column.md)), so the two waves must be
  read together.
- **`NOT_RESIZABLE`'s Romanian sentence reaches a customer for the first time** and should be read as
  copy, not as an internal code — it names the cabinet and the one width it is made at.
- **`columnWidthChoices`' `undefined` now means exactly one thing**: missing catalogue data. That is a
  narrowing worth having — the answer used to conflate a correct product fact with broken data.
- **The corner is unaffected.** A structural body (`StructuralReason: 'corner'`) offers no panel
  sections at all by its own declared reason, and this record does not reach it.
