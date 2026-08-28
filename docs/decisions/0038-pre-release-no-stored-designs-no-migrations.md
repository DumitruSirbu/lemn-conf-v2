# ADR 0038 — The project is pre-release: no design has ever been stored, so no migration is owed

Status: Accepted
Date: 2026-08-28
Type: Decision
Milestone: Cross-cutting — retires migration obligations recorded in 0027, 0028 and 0036

## Context

Several records hedge about designs saved under an earlier model, and each hedge has kept code or a
question alive:

- **ADR 0027** made the hob part of the cabinet body and **deliberately left the whole accessory
  machinery in place** — §6.1's host resolution, §5.1's cascade, `ACCESSORY_MAX_HEIGHT_M`,
  `PlacementRecord.accessory`, `cascadedAccessoryIds` — on the grounds that *"a design saved before
  that migration still carries a `cooktop-600` placement and reaches all of it."* `docs/STATUS.md`
  records this as "one deletion is deliberately still owed".
- **ADR 0028** shipped the depth map explicitly **not retroactive**: *"no migration, so a body saved
  before the wave reloads at 400."*
- **ADR 0036** decision 5 left *which mechanism* adapts existing cabinets when the depth setting
  changes — a one-time rewrite of stored placements, or depth derived on every load — to M6.

Each was written as though a population of saved designs exists.

## Decision

**It does not.** Owner, 2026-08-28: *"we didn't release anything, we didn't store anything, there
are no any records in the database. Don't set this as an issue — we don't need migrations, we are in
development phase."*

So, until first release:

**1. No migration is ever owed for a model change.** A change to how a design is represented may
assume there is nothing to convert.

**2. Code kept alive solely to read an older shape is dead code and is deleted.** ADR 0027's
accessory machinery is the standing case and should be removed on the next wave that touches that
area — Clean Code's rule against dead code, with the only argument for keeping it now withdrawn.

**3. ADR 0028's non-retroactivity is moot**, not accepted-as-a-tradeoff: there is no body saved
before the wave.

**4. ADR 0036 decision 5 simplifies.** With no stored designs, M6 chooses its mechanism on merit —
whichever makes the setting honest — rather than trading it against a conversion cost. It should
still be chosen deliberately, because the choice outlives this ADR.

## Consequences

- **This ADR expires at first release**, and that is the whole risk in it. The moment a real
  customer's design is stored, every obligation above returns, and a change made under this record
  is not automatically safe afterwards. **M7 or M8 must re-read this record before launch** and
  decide what the first stored schema is; until then `docs/STATUS.md` should carry the expiry rather
  than the migration debt.
- **`docs/STATUS.md`'s "one deletion is deliberately still owed" is retired**, and the accessory
  machinery becomes an ordinary cleanup rather than a decision waiting on the owner.
- **It does not license carelessness about the schema itself.** ADR 0002's canonical-serialisation
  round-trip invariant and the persistence suite are unaffected — they prove the store works, which
  is a different claim from what is in it.
