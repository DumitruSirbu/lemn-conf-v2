# ADR 0032 — An entry that does not fit is shown disabled with its reason, not removed

Status: Accepted
Date: 2026-08-27
Type: Decision
Milestone: M5 — before wave 5D

## Context

§9's rule has been *"never offer what cannot be satisfied"*, and the implementation reads it as
**remove**: `queries/offers.ts` runs `evaluateInsertFit` for every band-appropriate entry and drops
the ones that fail —

```ts
const fit = evaluateInsertFit({ body, opening, column });
if (!fit.ok) return [];
```

That is correct and silent. A customer looking at a 300 mm opening sees a shorter list and is never
told that a cabinet exists which would fit if they made room. ADR 0017 reached the same shape from
the other direction: `base-sink` was being offered into openings it could not build, and the fix was
to filter it out — right, and equally silent.

Two live problems share this cause.

- **`docs/BACKLOG.md` entry 13.** `resolveWidth` returns the opening's own width for a
  `widthFlex: 'fit'` body and never consults `sizesMm`, so a 300 mm opening offers `wall-2door` and
  builds **one door under a two-door label** (ADR 0029 verbatim). ADR 0031 is the first mechanism
  that can produce a sub-600 mm column, so this is newly reachable.
- **The narrow bodies.** `base-bottle-cargo` and the 450 mm dishwasher can be inserted into places
  that leave a column it is then impossible to resize — measured at **13 of 154 accepted inserts**.

The owner's diagnosis, 2026-08-27, and it is deliberately not about any one entry: *"if the cabinet
minimum didn't fit the existing space, grey it out and write that it requires more space… instead of
dealing with each particular cabinet."*

## Decision

**An entry the engine cannot satisfy is shown in the list, disabled, with the reason — not removed.**

1. **The offer list stops filtering on fit.** Every band-appropriate entry appears. Each carries a
   verdict: offered, or disabled with a reason.
2. **The reason is the one the engine already computed.** `evaluateInsertFit` returns a
   `RejectionDetail` on failure and `offersFor` throws it away today. It is published instead. No new
   vocabulary of reasons is invented, and no reason is written twice.
3. **The rule is abstract, and stated in terms of a body's declared limits against the available
   space** — never per entry. `base-sink`'s 560 mm aperture, the cargo's 200 mm, `wall-2door`'s 600 mm
   bound and any future entry's limits all reach the customer through the same sentence, because they
   all reach the engine through the same guard.
4. **Backlog 13 closes with it.** The width bound moves into `resolveWidth`, gated on
   `sizesAreStandardLadder` (ADR 0031 rule 5), so **the insert path and the resize path answer the
   width question the same way**. Today they do not: the flag is read by `setWidth` alone. One rule,
   one function, both paths.
5. **Band remains a filter, not a disablement.** A wall cabinet is not "disabled" for a floor
   opening — it is not a candidate at all. Disabling is for an entry that would fit *given more
   space*; showing every entry everywhere is noise, not information.

## What this is not

- **Not a weakening of §9.** Nothing becomes *insertable* that was not. A disabled row cannot be
  chosen, and the engine's guards are unchanged. What changes is that a refusal the engine was making
  silently is now visible, before the tap rather than after it. §9's rule is better read as "never
  let the customer choose what cannot be satisfied" — which this keeps.
- **Not the mixed-width column decision.** Whether a narrow body may be inserted into a column whose
  other levels are wider — `COLUMN_MEMBERS_UNALIGNED`, ADR 0031, the 13-of-154 measurement — is a
  separate question still with the owner. This ADR gives that answer *a place to be shown* whichever
  way it goes: if such an insert is refused, the row is disabled with its reason rather than
  vanishing. The two decisions compose; neither implies the other.

## Alternatives considered

- **Keep filtering.** Rejected: it is why nobody can discover the bottle cargo, and why a 300 mm
  opening silently offers a mislabelled two-door instead of explaining that a two-door needs 600.
- **Fix backlog 13 alone, in `resolveWidth`.** Necessary but not sufficient — done by itself it makes
  `wall-2door` *vanish* from a 300 mm opening, trading a wrong cabinet for an unexplained absence.
  The bound and the explanation are the same change.
- **A per-entry "requires" note in the catalogue.** Rejected as the owner rejected it: it is a
  sentence per entry to maintain, it will drift from the guard that actually refuses, and it is
  exactly the per-cabinet special-casing this decision replaces. The engine already knows why.

## Consequences

- **`offersFor`'s contract changes shape** — from a filtered list to an annotated one. Its callers,
  its acceptance criteria and §9's copy all move with it. This is M3 machinery, so the change is not
  a tweak inside a panel wave.
- **ADR 0024 gets a second answer.** M4 closed with §9's rejection banner having no reachable path,
  because every list was fit-filtered. Wave 5C made a refusal reachable through resize; this makes
  the *reason* reachable at the point of choosing, which is the better place for it.
- **The copy is new work.** Every reason needs a Romanian sentence a customer can act on — "requires
  more space" is a direction, not the string. `ro.ts` gains a renderer per reason code, and the codes
  already exist.
- **The disabled row is a design surface**, not just a flag: it must read as *not yet available here*
  rather than *broken*. The mockups' grey/dashed treatment is the precedent.
- **It closes the offer path's half of a defect class this project keeps meeting** — a rule stated in
  prose that the data or a second code path did not implement (ADRs 0016, 0017, 0021, 0028, 0029).
  After this, insert and resize cannot disagree about a width.
