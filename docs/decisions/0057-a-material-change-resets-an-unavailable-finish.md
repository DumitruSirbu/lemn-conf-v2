# ADR 0057 — A global material change resets a per-cabinet finish it does not offer, and says so first

Status: Accepted (decision 3 amended 2026-09-05 → [0081](0081-a-material-change-confirms-only-when-a-chosen-colour-would-be-lost.md))
Note: decision 2 is **confirmed as still standing** by [0099](0099-a-colour-is-chosen-at-two-levels-and-the-cabinets-wins.md) decision 3 — a global *material* change may still reset a cabinet colour; a global *colour* change never may.
Date: 2026-09-02
Type: Decision
Milestone: M6 — unblocks wave 6F

## Context

§5.5 makes finish and handle **per placement**, and material and hardware brand **whole-kitchen**
settings that live outside the cabinet editor. M6 wires the global material for the first time, which
creates the only interaction in the product where a whole-kitchen setting can invalidate a
per-cabinet choice that has already been made: a material that does not offer the finish some cabinet
is wearing.

The M6 plan already fixed the invariant — **no invalid state survives** — and left the rule that
achieves it as an open product decision. Nothing in `docs/decisions/` ruled on it before this record.

`FinishSchema` has five values (`white | clay | sage | graphite | oak`); the 2E sheet offers three
material tiers.

## Decision

**An affected cabinet resets to the new material's default finish, and the sheet states that
consequence before the change is applied.**

1. The per-cabinet finish list is filtered by the global material, **in the domain**. The panel
   renders the filtered result and decides nothing.
2. Applying a material resets every cabinet whose finish the new material does not offer, to that
   material's default. The reset runs **once**, at the point the material is applied, and produces
   one command result — never a per-cabinet cascade the customer watches happen.
3. ~~**The warning is shown before the apply, on both viewports.** This is what makes a destructive
   reset acceptable rather than a surprise: 2E on mobile and the D2E popover on desktop both already
   carry an explicit apply action, so the customer is told the consequence and then confirms it.~~
   **Amended 2026-09-05 by the owner —
   [ADR 0081](0081-a-material-change-confirms-only-when-a-chosen-colour-would-be-lost.md).** Still
   before the apply and still on both viewports, but as a **conditional, blocking confirmation**
   rather than a standing sentence: it appears only when some cabinet carries a colour differing from
   its current material's declared default, and while it stands **no command runs**. Where no colour
   was chosen the switch is immediate and silent — which is the half of this clause the amendment
   removes, and ADR 0081 records what that costs.
4. The invariant is unchanged and is not the rule's to weaken: **no stored design may hold a finish
   its material does not offer**, asserted over every (material, finish) pair rather than over the
   pairs a fixture happens to contain.

## Alternatives considered

- **Map to the nearest offered finish**, per material. Rejected, and it is the option to avoid: it
  needs an owner-authored mapping across five finishes and three tiers whose correctness nobody can
  check, it will be wrong for at least one pair, and a wrong mapping is **invisible** — the customer
  sees a colour they did not choose and no indication that a substitution happened. A reset at least
  lands somewhere the customer can see is a default.
- **Refuse the material change while an incompatible finish stands**, naming the cabinets. It is the
  only option that never discards a choice, and it was rejected on what it costs the customer: with
  fourteen bodies they would have to hunt down and recolour each offending cabinet before the global
  control would move at all, and the settings sheet is the wrong surface from which to run that
  errand. It would also make this the product's first refusable *global* control, which is new
  machinery for a case the warning already handles.
- **Keep the choice and mark it unavailable.** Rejected by the invariant: an invalid state survives,
  and §9's own rule is that the product never offers what cannot be satisfied.

## Consequences

- Wave 6F implements the filter, the reset and the warning copy together; none of the three is
  meaningful alone.
- Wave 6G must **omit** the sentence about limiting per-cabinet finishes if 6F has not yet shipped. A
  warning about behaviour that does not exist is decoration — the defect M4's Finisaj section shipped
  and `docs/STATUS.md` records because nowhere else holds it.
- A customer can lose a colour choice by changing material, deliberately and with notice. If that
  turns out to be the wrong trade in use, the alternative to revisit first is refusal, not
  nearest-finish. **Reaffirmed by the owner on 2026-09-05**, who declined a PAL → MDF carry-over by
  name — *"instead of… an algorithm of mapping these colours between different materials"* — when
  ADR 0078 raised it as a live question. The rejection of nearest-finish mapping is the owner's, not
  only this record's.
