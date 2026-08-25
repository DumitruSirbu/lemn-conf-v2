# ADR 0013 — The restore drill was executed, and found five defects the runbook hid

Status: Accepted
Date: 2026-08-25
Type: Finding + Decision
Milestone: M2 Wave 2B

M2 required the restore procedure be executed once against a throwaway target before the phase
closes, on the stated grounds that "a procedure that has only been written down is an assumption,
not a backup". It was executed on 2026-08-25. The assumption was wrong in five separate places.

**The restore itself works.** A real design round-tripped through export and restore with an
identical canonical serialisation. Every failure was in the path an operator would follow to get
there — which is exactly the part a written-but-unrun procedure cannot vouch for.

## What was drilled

Two throwaway databases on the standalone Neon project, `lemn_conf_drill_src` and
`lemn_conf_drill_tgt`. A real 25-placement design (`KITCHEN_L_DESIGN`) written into the source
through `NeonConfigurationRepository` — the production write path — then exported through
`createNeonDesignRowSource`, the same read the backup cron performs, producing a 3,263-byte ndjson.
Restored into the target with the runbook's own script, then verified by loading through the
repository and comparing canonical serialisations.

```
Restored 1 rows, skipped 0.
placements restored : 25
canonical identical : YES
columns derived     : 10
```

Voids were re-derived from the restored document, having never been persisted — the sharpest case
in M2's round-trip criterion.

**One deviation, stated plainly.** The export was produced locally from the same code the cron runs,
not downloaded from Blob: `BLOB_READ_WRITE_TOKEN` is Production-scoped and deliberately absent from
the local environment. So steps 1–2 of Path 2 — find and download the export — remain undrilled, as
does Path 1 (Neon PITR). What is proven is the load-bearing half: parse → validate → migrate →
insert → verify.

## The five defects

**1. `pnpm run migrate` exited 0 and did nothing.** The worst of them. `migrate.ts` decided whether
it was being run as a CLI with:

```ts
import.meta.url === `file://${process.argv[1] ?? ""}`
```

`import.meta.url` percent-encodes characters illegal in a URL; `process.argv[1]` does not. This
checkout lives under `Personal Projects`, so one side read `Personal%20Projects` and the other
`Personal Projects`. They never matched. The command produced no migration, no output, and exit
code 0 — indistinguishable from success. **Fixed** by comparing resolved filesystem paths via
`fileURLToPath`.

**2. The runbook told operators to set the wrong variable.** Step 3 said
`DATABASE_URL="<drill target>" pnpm … run migrate`. The runner reads `MIGRATION_DATABASE_URL` only,
deliberately and with no fallback, because the application role cannot run DDL. Following the
instruction would migrate whatever `.env.migration.local` holds — **production** — while the
operator believed the drill target had been migrated. Harmless in effect (`create table if not
exists`), dangerous in belief. **Fixed** in the runbook, with a verification query so nobody has to
take the command's word for it.

**3. The built package's `runMigrations` is broken.** `tsc` does not copy `.sql` files, so
`dist/migrations/` never existed, and `runMigrations` — exported from the package's public entry
point — threw `ENOENT` for any consumer importing it from the built output. Only the `tsx src/…`
CLI path worked. **Fixed** by copying the directory during `build`, with a `test -f` assertion in
the build script so a silent regression fails the build rather than shipping a broken artifact.

**4. The runbook's script cannot run as written.** It uses top-level `await`, and the repository
root has no `"type": "module"`, so `tsx` transforms a `.ts` file as CJS and aborts with
`Top-level await is currently not supported with the "cjs" output format`. **Fixed**: the runbook
now specifies `.mts`.

**5. The runbook's stated reason for where to run it was false.** It said to run from the repository
root "so the workspace packages resolve". They do not resolve there: pnpm links workspace packages
into the packages that depend on them, and `node_modules/@lemnaria` does not exist at the root.
**Fixed**: run from `packages/persistence`, which has both the domain package and the driver linked,
plus its own `tsx`.

## Decisions

- **The drill is repeated, not retired.** It is re-run whenever the export format, the restore
  script, or the migration path changes, and again once production holds real designs. This run
  restored one design into an empty target; it has not proven a restore over pre-existing data, nor
  the Blob download path.
- **A backup mechanism is not considered working until a restore has been performed end to end.**
  Two separate defects here reported success while doing nothing — the migrate CLI, and the backup
  cron itself returning 200 while logging a failure (ADR 0012). In this subsystem, "no error" is not
  evidence. Only the restored data is.
- **Operator instructions are code that is never run.** Four of five defects were in the runbook, not
  the application, and every one would have surfaced during an incident — the worst possible moment.
  A runbook that has not been executed since it was written should be treated as unverified.

## Consequences

M2's restore-drill acceptance criterion is **met**. The remaining M2 gate is the unwired client
write path, which M3 owns (ADR 0010).

The drill databases `lemn_conf_drill_src`, `lemn_conf_drill_tgt` and `lemn_conf_drill_cli` were
created and **have not been deleted** — dropping a database is exactly the kind of irreversible
operation the add-only rule reserves for a human
(`docs/best-practices/environments-and-resources.md`). They are empty of production data and cost
nothing on Neon's free tier. Removing them is a human decision.
