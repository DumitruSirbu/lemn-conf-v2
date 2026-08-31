# Verification evidence and limitations

## Scope and method

- Root: `/Users/dimas/Documents/Personal Projects/lemnaria-configurator-gbt`
- Reviewed tracked source trees:
  - `packages/configurator-domain/src`
  - `packages/three-adapter/src`
  - `packages/persistence/src`
  - `apps/web/src`
- Logic oracle: `docs/design/DEVELOPMENT-SPEC.md`, `docs/design/SPEC.md`, current accepted ADRs,
  product invariants, architecture/product requirements, STATUS, BACKLOG, and the active M5 plan.
- Excluded: everything ignored by Git, `design-source/`, archived `docs/milestones/done/`, generated
  dependency/build trees except targeted installed-library behavior needed to verify SCENE-002.
- Existing unrelated worktree state preserved:
  `?? docs/runbooks/github-fine-grained-token.md`.

## Commands that passed

### Dependency and boundary checks

- `pnpm audit --audit-level=high --prod` — exit 0: `No known vulnerabilities found`.
- `rtk pnpm gate:boundary` — exit 0:
  - `OK: Postgres driver confined to packages/persistence.`
  - `OK: nothing imports from design-source/.`
- `rtk pnpm gate:lockfile` — exit 0:
  - `OK: no foreign lockfiles.`
  - `OK: exactly one root lockfile.`
- `gitleaks`, `semgrep`, and `osv-scanner` were not installed, so no result is claimed for those
  scanners.

### Repository gate and unit suites

`rtk pnpm check` ran formatting, lint, typecheck, domain tests, and then reached persistence tests:

- Prettier: `All matched files use Prettier code style!`
- All four workspace lint commands completed with `--max-warnings 0`.
- All four workspace typecheck commands completed.
- Domain: **58 files, 955 tests passed**.
- Persistence before network-dependent failure: **3 files passed, 24 tests passed**; **7 files / 14
  tests failed** with `Error connecting to database: TypeError: fetch failed`; 45 tests were skipped.

The aggregate command therefore exited 1. This is not reported as a code assertion failure: every
shown persistence failure was external connection failure. A request to rerun `pnpm check` with
external database access was rejected because the suite can mutate/delete test data and that side
effect was not explicitly authorized.

The remaining local-only suites were run separately:

- `rtk pnpm --filter @lemnaria/three-adapter test` — **30 files, 679/679 tests passed**.
- `rtk pnpm --filter @lemnaria/web test` — **30 files passed, 1 skipped; 523/523 executed tests passed,
  4 skipped**.

No direct claim is made that the full persistence suite, full `pnpm check`, Playwright E2E, build,
`pnpm ci:local`, or production deployment is green.

## Basic static security checks

- Production dependency versions are pinned in package manifests and the root lockfile. Internal
  `@lemnaria/*` packages are `private` and referenced with `workspace:*`.
- Secret-pattern scan was limited to tracked files and printed filenames only. Two matches were found:
  `packages/persistence/tests/migrate.test.ts` and
  `packages/persistence/tests/test-database-url.test.ts`; inspection confirmed intentionally fake test
  connection URLs. No secret value was printed by the review.
- Source searches found no `eval`, `new Function`, `dangerouslySetInnerHTML`, string-built production
  SQL, or Postgres-driver boundary escape.

## Targeted runtime reproductions

### DOM-001 — schema accepts semantically hostile state

Executed `DesignSchema.safeParse` against negative/zero room dimensions, duplicate placement IDs,
negative coordinates and widths, an unknown build ID, a 40 mm body, and reversed timestamps:

```json
{
  "accepted": true,
  "issueCount": 0,
  "placementIds": ["dup", "dup"],
  "room": { "shape": "L", "widthMm": -1, "depthMm": 0, "heightMm": -20 }
}
```

Then passed a schema-accepted unknown build ID into normal client derivation:

```json
{
  "apiSchemaAccepts": true,
  "clientDerivation": "UnknownBodyError: No catalog entry for buildId \"unknown-builder\""
}
```

### SCENE-001 — deleted fridge remains in the reference shell

Built the adapter headlessly with the normal test canvas, removed `p7` from the design, derived current
records, and executed the same positional decomposition used by `KitchenStage`:

```json
{
  "deletedBuildId": "fridge-free-700",
  "removedByCurrentRecords": 25,
  "leftoverNamed": [
    "floor",
    "wall_back",
    "wall_left",
    "induction_cooktop",
    "end_panel_right",
    "fridge_freestanding",
    "backsplash_wall_a"
  ]
}
```

### WEB-001 — pending A document saved to B

Constructed the production coalescer with a recording repository, saved A once, queued a second A
document inside the minimum interval, changed the live ID to B, and let the timer fire:

```json
[
  { "id": "design-A", "marker": "A-first" },
  { "id": "design-B", "marker": "A-pending" }
]
```

### SEC-002 — unbounded load-time scaling sample

Generated schema-compatible, unique, catalog-known placements and measured
`derivePlacementRecords` + `deriveColumns` locally:

```text
1,000 placements:   7.9 ms
2,000 placements:   9.2 ms
4,000 placements:  30.5 ms
8,000 placements: 144.0 ms
16,000 placements: 430.7 ms
```

This is not a full browser benchmark; it excludes void computation, React state, Three.js mesh
construction, GPU upload, and rendering, so it is evidence of unbounded pre-render work rather than a
claimed production latency figure.

## Not performed

- No production or preview endpoint was probed.
- No WAF/Vercel/Neon/Blob configuration was read or changed.
- No database row was inserted, updated, or deleted by this review.
- No secret/environment value was printed.
- No destructive, high-volume, browser-crash, or live exploit sequence was executed.
- No fixes were implemented; this folder contains reports only.
