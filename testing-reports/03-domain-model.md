# Domain model and logic

## FINDING: Persistence schema accepts documents the domain cannot execute

- **ID:** DOM-001
- **SEVERITY:** High
- **THE EXPLOIT/FLAW:** `DesignSchema` validates primitive shape, not product meaning. Every
  millimetre value is merely an integer; room dimensions, placement coordinates, body dimensions,
  and seat depth have no positive/range bounds. `buildId` and placement IDs are any non-empty string;
  placement IDs need not be unique; placement arrays have no maximum; and `updatedAt` need not follow
  `createdAt` (`packages/configurator-domain/src/design.ts:5,25-63`). `PUT` persists any value that
  passes this schema (`apps/web/src/app/api/designs/[id]/route.ts:138-157`). The read migration applies
  the same schema and therefore calls it valid (`packages/configurator-domain/src/migrate-design.ts:5-25`).
  Client hydration then derives geometry; an unknown builder throws `UnknownBodyError`
  (`packages/configurator-domain/src/void-engine.ts:302-308`,
  `apps/web/src/store/configurator-store.ts:203-207`).

  Runtime checks confirmed both layers of the defect:

  ```json
  {"accepted":true,"issueCount":0,"placementIds":["dup","dup"],"room":{"shape":"L","widthMm":-1,"depthMm":0,"heightMm":-20}}
  {"apiSchemaAccepts":true,"clientDerivation":"UnknownBodyError: No catalog entry for buildId \"unknown-builder\""}
  ```

  Duplicate IDs also break ID-keyed maps and membership comparisons: `haveSameMembers` converts IDs
  into a `Set` (`packages/configurator-domain/src/void-engine.ts:477-484`), so two distinct placements
  with one ID are not independently representable. An owner can persistently poison its own share
  link, and corrupted/imported data can crash every reader rather than being rejected as invalid.
  ADR 0038 already names the unbounded 40 mm height, but incorrectly calls it unreachable because
  there is “no deserialisation surface”
  (`docs/decisions/0038-pre-release-no-stored-designs-no-migrations.md:69-84`). The API and Postgres
  load path are that surface today.

- **REMEDIATION:** Separate wire-shape parsing from executable-domain validation. After bounded Zod
  parsing, run a single `validateDesignForCatalog` that enforces:
  - positive supported room and body dimensions;
  - unique, bounded identifiers and placement count;
  - catalog membership and each entry's width/height/depth rules;
  - non-negative/in-room placement coordinates, supported walls, no illegal overlap;
  - canonical timestamp ordering;
  - any structural/corner invariants required by the maintained design contract.

  Use the same validator at API write, migration/load, and import seams. Convert validation failures
  into `400` on write and `InvalidDesignError` on load. A minimum structural start is:

  ```ts
  const positiveMm = z.number().int().positive().max(MAX_SUPPORTED_MM);
  const DesignSchema = z
    .strictObject({
      room: DesignRoomSchema,
      placements: z.array(DesignPlacementSchema).max(MAX_PLACEMENTS),
      // ...
    })
    .superRefine((design, ctx) => {
      requireUniquePlacementIds(design, ctx);
      requireChronologicalTimestamps(design, ctx);
    });
  ```

  Catalog and geometry checks should remain named domain functions rather than being duplicated as a
  second pile of route-level conditions.

## FINDING: Occupied depth knowingly under-reports several body families

- **ID:** DOM-002
- **SEVERITY:** Medium
- **THE EXPLOIT/FLAW:** `occupiedDepthM` is used as the single answer for column depth and vacated swap
  openings, but its own contract documents that the fallback is wrong. It returns `frame.d` unchanged
  for ordinary base, tall, freestanding fridge, and corner bodies even though measured occupied depth
  is larger: base seat/frame 580 vs roughly 620 occupied, tall 560 vs 599, fridge 680 vs 742, and the
  corner 560 vs 580 (`packages/configurator-domain/src/occupied-depth.ts:14-45`). This under-reports
  `Column.d` and can produce a reload/swap opening shallower than the body that actually occupied it.
  The issue is recorded in comments but remains executable behavior.
- **REMEDIATION:** Replace the catch-all fallback with an explicit catalog/body-kind depth model. Put
  a non-persisted `occupiedDepthFromSeat(record)` strategy beside each catalog definition or body kind,
  derived from declared finished dimensions and known front/overhang geometry. Assert the measured
  occupied depth for every seeded and insertable body, then assert remove -> opening -> rebuild
  round-trips exactly. Unknown kinds must fail closed instead of silently returning the seat encoding.

## FINDING: Width behavior is concentrated in one oversized change hotspot

- **ID:** DOM-003
- **SEVERITY:** Low
- **THE EXPLOIT/FLAW:** `packages/configurator-domain/src/commands/set-width.ts` is 1,663 lines and
  declares 45 functions. One file plans column resize, resolves catalog members, intersects ranges,
  scans funding space, moves frozen columns, rebuilds bodies/hoods, updates effects, checks openings,
  and detects drift. The test volume reduces regression risk but does not reduce the review surface:
  a change to one rule requires understanding several phases sharing file-local types and helpers.
  This is why plausible rule drift repeatedly reached review during M5.
- **REMEDIATION:** Preserve `setWidth` as the single public command but split its pure phases into
  narrow modules with explicit values: `resolve-column-width`, `plan-width-funding`,
  `apply-column-moves`, `rebuild-resized-bodies`, and `validate-width-result`. Keep orchestration and
  result composition in `set-width.ts`. Move existing phase-specific tests with the extracted
  functions; do not rewrite behavior during the split.
