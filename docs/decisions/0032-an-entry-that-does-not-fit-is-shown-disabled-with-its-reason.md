# ADR 0032 — An entry that does not fit is shown disabled with its reason, not removed

Status: **Superseded by the owner's ruling of 2026-09-10 — see *Superseded* below.** An entry the
engine cannot satisfy is now **removed from the list**, not shown disabled. Read that section before
implementing anything from the Decision below, which is retained as the record of what was tried.
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

## Superseded — the greyed rows are removed, 2026-09-10

**Do not re-implement disabled-with-reason. It shipped, the owner used it, and it was rejected on
what it did to a customer.**

The owner's words, on seeing a floor opening offer a wall cabinet, a lift, an open shelf and a hood,
each greyed with the same sentence about having no plinth and no worktop:

> *"Don't need to show any greyed out cabinets, it's hard to understand why on base cabinet I see
> hood as user is like WTF is this. Show only what is possible to insert."*

**Both decisions were in it, and an earlier draft of this section blamed decision 5 alone — corrected
here on 6B's logic review, because a supersession that misstates its own cause teaches the wrong
lesson.**

Decision 5 said band stays a filter — *"a wall cabinet is not disabled for a floor opening, it is not
a candidate at all"* — and for a **swap in place** it holds: `isInOfferedBand` compares against the
replaced body's band. For a **void** it returns `true` unconditionally, so an empty slot admits the
whole catalogue, which is how a hood reached a floor opening.

**That admission is deliberate and stays.** §5.2's *"a column body goes anywhere"* needs a full-height
body reachable from a base slot, and a void has no band of its own to compare against — there is no
`replaced.band`. So the exclusion cannot come from the band filter at the void, and does not: what
keeps a hood out is `evaluateInsertFit`'s own refusal, now that a refused verdict is dropped rather
than displayed. **Decision 5 is not "unimplemented"; it is inapplicable where a void is concerned,
and the fit gate does the work instead.**

**And decision 5 alone would not have satisfied the owner.** A 450 mm base void would still have
shown a two-door greyed with *"a two-door needs 600 mm"* — same band, genuinely refused, exactly the
row decision 1 was written to display. *"Don't need to show any greyed out cabinets"* bans that too.
**So decision 1 had to be reversed, and it is.** The greyed row is gone in every case, not only the
wrong-band ones.

**What the reversal costs, stated so nobody rediscovers it as a surprise.** This ADR's Context
argues that silently dropping an entry means *"nobody could discover that a bottle cargo exists or
that a two-door needs 600 mm"*. That cost is now paid: a customer who wants a two-door at 450 mm
sees no two-door and is told nothing. **The owner weighed this and ruled anyway**, and the reasoning
is worth keeping: a hood in a floor slot is a *category error*, not a near miss, and no sentence
rescues it. Discoverability is a real need, but a list of things you cannot have is the wrong
instrument for it — it teaches the catalogue by showing failures, and a customer reads a failure as
the product being broken rather than as a lesson.

**If discoverability is wanted later, it needs its own instrument** — a catalogue browser, a
"what fits here?" affordance, or width guidance on the stepper — and not a return of refused rows to
the offer list. **A future wave proposing to show unavailable entries in the replace list is
contradicting an owner ruling made against shipped behaviour, not reopening an undecided question.**

The decision below is kept unstruck because its parts 2, 3 and 4 outlived it: the engine still
computes one `RejectionDetail` through one guard, the rule is still abstract, and Backlog 13 stayed
closed. Only the *display* of a refusal in the offer list is reversed.

## Decision — as accepted 2026-08-27, and now superseded above

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
