# ADR 0022 — A seeded entry declares its catalogue equivalent; the ACTUAL badge is never inferred

Status: Accepted
Date: 2026-08-26
Type: Finding + Decision
Milestone: M4 Wave 4B — found by logic review

## Context

`DEVELOPMENT-SPEC.md` §9 requires that an occupied body's swap list badge its current row **ACTUAL**,
and M4's acceptance criteria repeat it: "The current row of an occupied body's swap set is badged
ACTUAL."

`offersFor` implemented that as `isCurrent: replaced?.buildId === body.buildId`, with candidates
drawn from `listInsertableBodies`. ADR 0011 Gap A gives every **seeded** placement a *non-insertable*
`buildId` — the two populations share one catalogue map precisely so that an inserted placement and
a seeded one resolve through the same lookup, but a seeded entry describes one already-built body
and is never offered. So the comparison could not be true for any seeded body.

Measured before the fix, by running `offersFor` over the whole shipped design: **22 bodies offer a
swap list, and the total number of `isCurrent` rows across all of them is 0.** The badge was
unreachable for every body a customer can select on first load. It could appear only after a body
had already been swapped once — the moment it is least useful.

The existing test covered only the post-insert case, so the suite was green over the gap.

## Decision

**The relationship is declared on the catalogue entry, never inferred.**

`BodyDefinition` gains `catalogEquivalentId?: string`: the insertable §7 entry that a seeded entry is
an instance of. `offersFor` resolves the replaced body's current catalogue id as *its own `buildId`
when the entry is insertable, otherwise its `catalogEquivalentId`*, and compares against that.

**Absent means "no catalogue equivalent", carried absent rather than defaulted.** Three seeded
entries have none, because nothing in §7 builds them: `cooktop-600` (an accessory), and the two
corner returns (structural — ADR 0021). No row is badged for those, which is the correct answer for
them rather than a missing one.

## Alternatives considered

- **Infer the match from kind + normalised band + width.** Rejected, and this is the heart of the
  decision. §6.3 records that inferring a body's identity from what it looks like produced *a fridge
  housing labelled and priced as a pantry*. §13.2 lists "inferring a body's identity from its mesh
  tree when a catalogue choice exists" among the rejected directions. An inferred swap-row match is
  the same mistake one layer up: it would have worked for most of the twenty entries and been wrong
  silently for the rest. This follows ADR 0017's precedent instead — where a fact cannot be derived
  reliably, the catalogue row declares it.
- **Make the seeded entries insertable so their ids match directly.** Rejected: ADR 0011 Gap A
  exists because a seeded entry describes one specific already-built body, and offering one would
  build a fixed instance into an opening it was never measured for.
- **Accept the criterion as unmet and record it.** Rejected: §9 states the rule plainly and the fix
  is declarative and testable.

## Consequences

- Measured after the fix, same method: **22 bodies with a swap list, 22 ACTUAL badges, exactly one
  per body**, none with two. Verified again on the rendered page — one `data-current="true"` row.
- Seventeen of the twenty seeded entries carry a pointer. Each was read off the two builder tables in
  `@lemnaria/three-adapter` and points at the entry whose builder produces the same group.
- A guard test asserts every declared pointer resolves to an entry that is actually `insertable`, that
  a pointer is never declared on an insertable entry, and names the three deliberately unpointed ids
  — so losing a pointer fails loudly instead of silently un-badging a body.
- **One pointer is worth knowing about.** `base-drawer2-600 → base-panbank` is geometrically exact:
  the seeded body is `baseCabinet(0.6, { drawers: 2 })` and `base-panbank` is
  `baseCabinet(w, { drawers: 2 })`, while `base-3drawer` is the three-drawer build. The *labels*
  differ — the seeded body reads as a two-drawer base and the catalogue calls it *Sertare pentru
  oale* — because §7 has no plain "2 drawers" entry. The badge is correct; if it ever reads wrong to
  a customer, the fix is a §7 catalogue name, not a different pointer.
- The pointers are catalogue data and must move whenever a builder does. That coupling is the price
  of not inferring, and it is deliberate: a declared pointer that goes stale breaks a test, where an
  inferred match that goes stale mislabels a product.
