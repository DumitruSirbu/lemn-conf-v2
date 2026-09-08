# Runbook — rolling back a deploy

**Read this before rolling back to a build older than 2026-09-08.** A rollback is not always
symmetrical: a newer build can write a document an older build refuses to read.

## The rule

**A schema key added to a stored document is a one-way door until every stored document is migrated
off it.** `DesignSettingsSchema` is a Zod `strictObject`, so it does not ignore keys it does not
know — it **rejects** them. A design saved by a build that writes a key, opened by a build that does
not declare it, fails validation and the customer gets a `500`, not a degraded view.

This is by design: a `strictObject` is what stops an unknown field being silently carried through a
save and lost. The cost is that rollbacks have to be checked.

## The window that is open right now

**`settings.finish`** — the whole-kitchen colour
([ADR 0099](../decisions/0099-a-colour-is-chosen-at-two-levels-and-the-cabinets-wins.md)
decision 10), shipped 2026-09-08.

Once any customer has set a kitchen colour, that design carries `settings.finish`. Rolling back to a
build without the key makes that one design a **`DESIGN_UNREADABLE` 500 on load**. Designs that never
carried a kitchen colour are unaffected.

**It does not corrupt anything.** The row is intact and becomes readable again the moment the
forward build is restored. Rolling forward is the fix; there is nothing to repair in the database.

## Before you roll back

1. **Ask what the target build predates.** Compare its date against the table below.
2. **If it predates a listed key, expect load failures scoped to the designs carrying it** — not to
   the whole product. Decide whether that is acceptable for the length of the rollback.
3. **Do not "fix" it by deleting the key from stored rows.** That discards a customer's choice to
   work around a temporary rollback, and the forward build would have read it correctly.
4. **Rolling forward again restores every affected design**, with no migration and no repair step.

| Key | Added | Rolling back before this date breaks |
| --- | --- | --- |
| `settings.finish` | 2026-09-08 (ADR 0099) | designs whose owner set a whole-kitchen colour |

## Migrations are a separate question, and the more dangerous one

This runbook is about **document shape**, not about the database schema. A rollback does **not**
un-apply a migration, and nothing here does. `packages/persistence` holds a forward-only ledger
(`schema_migrations`); see
[ADR 0020](../decisions/0020-a-migration-file-is-not-an-applied-migration.md). Applying — or
attempting to reverse — a migration is an operator release step and needs the owner's authorisation.

**Check the deployed schema before and after any rollback** with `migrate:status`, which reads the
live ledger rather than the files on disk
([ADR 0096](../decisions/0096-the-deployed-schema-is-proved-by-a-gate-and-production-was-never-in-the-runners-path.md)).

## Adding to this runbook

Any wave that adds a key to a stored document **owes a row in the table above**, at close-out. The
obligation is recorded in the ADR that adds the key.
