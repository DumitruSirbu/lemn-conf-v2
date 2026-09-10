# ADR 0106 — The price book's display prose publishes descriptors, and the book still keeps the tier

Status: Accepted — opens M6B wave **6B-f2**
Date: 2026-09-10
Type: Decision
Milestone: M6B — Internationalization

## Context

[ADR 0095](0095-romanian-is-the-source-and-lives-in-message-files-and-the-domain-publishes-codes-not-sentences.md)
**Amendment B** (2026-09-07) put the price book's prose in scope: *"the current tree has eight
descriptions plus tier/accessory display names, and this prose reaches customer-visible screens.
Numeric rates and manufacturer records remain locale-free data, while displayed names and
descriptions publish message descriptors and are resolved by the app."*

**No wave owned it.** M6B's plan was written before that amendment and routes none of it; the waves
it does declare (6B-f's labels, 6B-g's money) each stop short of the book. `docs/i18n/ro-catalogue-notes.md`
still describes these strings as "deliberately absent" from the catalogue — true when written, and
superseded four days later by an amendment that file never learned about.

The measurement, on `packages/configurator-domain/src/pricing/sample-price-book.ts`: **8 `name`
fields and 8 `description` fields**, rendered to a customer at `settings/global-settings.tsx` in the
whole-kitchen sheet and on ADR 0104's pill. `materials.ts`'s palette names already have `finish.*`
keys and are not in this wave.

**The constraint this has to respect** is
[ADR 0062](0062-a-manufacturer-price-dashboard-comes-after-m8-and-shapes-seams-now.md) decision 1:
*"No amount, tier, delta or rule may exist outside the book"*, swept by `pricing-seams.test.ts`. The
same ADR exists to **shape the book's seams now for a manufacturer price dashboard that comes after
M8**, so a change to the book's row shape is squarely the kind of decision it anticipates — and
squarely the kind it will hold to account.

## Decision

**1. A book row keeps `name` and gains an optional `nameKey`; the key wins when present.** The same
for `description` / `descriptionKey`.

The row still owns the tier. Its identity, its amount, its delta and its rules do not move, so ADR
0062 decision 1 is satisfied literally and not merely in spirit: what leaves the book is the
**rendered sentence**, which was never a tier, an amount, a delta or a rule. `pricing-seams.test.ts`'s
sweep is extended to say so rather than weakened to permit it.

**2. `name` stays required, and stays the fallback.** A book row that names no key still renders —
in Romanian, as today. This is what makes the wave incremental rather than a flag day, and it is
also what a manufacturer-entered row needs after M8: a dashboard user types a name, they do not mint
a catalogue key. **A key is how *this* product's shipped book localises its own rows; a name is how
any book, including one nobody at Lemnaria authored, still works.**

**3. The resolution happens in the app, never in the domain**, through the same `resolveContent`
seam every other leaf uses. The domain hands over `{ name, nameKey? }` and resolves nothing —
identical to what 6B-e did for refusals and 6B-f does for labels.

**4. It ships as its own wave, 6B-f2, after 6B-f and before 6B-g.** After 6B-f because it reuses the
descriptor-resolution shape that wave establishes; before 6B-g because 6B-g renders amounts onto the
same surfaces and should not be re-opening them.

## Alternatives considered

- **Move the prose into the catalogue and delete it from the book.** Rejected: it breaks ADR 0062
  decision 1's *substitutable book* directly. A book you can swap must carry its own display text,
  or swapping one leaves the screen naming tiers the new book does not have.
- **Leave it Romanian-only and close M6B without it.** Rejected. A Russian customer would read
  Russian everywhere except the tier names and descriptions on the settings sheet — which is
  precisely the *"hardcoded one-language fallback"* `engineering-conventions.md:61` forbids and the
  milestone exists to remove. It would also make M6B's close a false one against ADR 0001 decision 5.
- **A required `nameKey`, with `name` deleted.** Rejected on the manufacturer-dashboard seam: a row
  entered by a manufacturer after M8 has no key to give, and requiring one would either block that
  feature or force it to mint keys at runtime, which the copy lock and the lint gate both forbid.
- **Defer to M7.** Rejected: M7 authors new copy against this phase's conventions, and handing it a
  half-localised price book teaches it the wrong pattern on the first day.

## Consequences

- 16 new leaves in `ro.json` and `ru.json`, in the same commit, per `engineering-conventions.md:61`.
  The Russian is an unapproved draft until **Gate O2**, like every other Russian leaf.
- The Romanian values move **byte-for-byte**, as Amendment B requires. This wave changes no wording;
  it changes where wording lives. Any wording question it surfaces is reported to the owner, not
  resolved by the wave.
- `docs/i18n/ro-catalogue-notes.md`'s "deliberately absent" passage is corrected in place, struck
  rather than deleted, pointing here.
- 6B-j's lint gate must not fire on a book row's `name` fallback. The allow-list entry is written
  with its reason, as that wave requires of every entry.
