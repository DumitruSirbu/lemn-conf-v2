# Breaking attack vectors and exact failure sequences

These sequences are written for authorized staging/local verification. Do not scale the resource
exhaustion cases against production. No live attack was performed during this review.

## AV-1 — Persisted deletion resurrects an unselectable body

**Findings:** SCENE-001  
**Impact:** persistent scene/domain divergence; customer cannot remove the returned object.

1. Start from the seeded L kitchen and select placement `p7` (`fridge-free-700`).
2. Invoke the normal remove command and wait until the save status returns to `idle`.
3. Reload the saved `/d/{id}` URL.
4. The persisted `Design` correctly has no `p7`, so the current placement records contain no fridge.
5. `KitchenStage` builds the full reference kitchen and removes only children matching those current
   records. With no fridge record, `fridge_freestanding` remains inside `referenceRoom`.
6. `syncSolidBodies` mounts the persisted bodies but does not own or tag the leftover child.
7. The fridge is visible again but has no `placementId`; picking cannot select it, domain voids treat
   the space as empty, and any later price/review step reads a different kitchen from the customer.

Headless proof output:

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

## AV-2 — Design A is written into design B

**Findings:** WEB-001  
**Impact:** silent cross-design corruption for designs writable in one browser session.

1. Load writable design A and make one edit. Let its save finish, establishing
   `lastSaveCompletedAtMs`.
2. Make a second edit to A within one second. The coalescer stores the A document in `pending` and
   arms the interval timer.
3. Before the timer fires, perform a client-side transition that hydrates writable design B. The
   module-scoped store's `designId` is now B; the pending value is still A's document.
4. The timer runs `repository.save(deps.getDesignId(), toSave)`. `getDesignId()` now returns B.
5. The API legitimately authorizes the B cookie and replaces B's JSONB document with A's document.
6. The save reports success. There is no revision/content-identity assertion to detect the mismatch.

Runtime proof output:

```json
[
  { "id": "design-A", "marker": "A-first" },
  { "id": "design-B", "marker": "A-pending" }
]
```

## AV-3 — Create a persistent crash link with a valid owner token

**Findings:** DOM-001  
**Impact:** every recipient of the shared design link hits client derivation failure.

1. In an authorized staging browser, call `POST /api/designs`. Retain the returned `id`; the browser
   receives the path-scoped HttpOnly write cookie.
2. Call `PUT /api/designs/{id}` with `Content-Type: application/json` and this shape:

   ```json
   {
     "room": {
       "shape": "L",
       "widthMm": 3600,
       "depthMm": 2400,
       "heightMm": 2600
     },
     "presetId": null,
     "placements": [
       {
         "id": "evil",
         "wall": "A",
         "alongMm": 500,
         "y0Mm": 0,
         "body": {
           "buildId": "unknown-builder",
           "widthMm": 600,
           "heightMm": 720
         }
       }
     ],
     "createdAt": "2026-08-30T12:00:00.000Z",
     "updatedAt": "2026-08-30T12:00:00.000Z"
   }
   ```

3. `DesignSchema.safeParse` succeeds and the row is replaced.
4. Send `/d/{id}` to a reader. Server load/migration again accepts the document.
5. Client hydration calls `derivePlacementRecords`, catalog lookup throws
   `UnknownBodyError: No catalog entry for buildId "unknown-builder"`, and the editor does not mount.

The same boundary accepts duplicate placement IDs, negative room dimensions, negative coordinates,
negative widths, and a 40 mm placement.

## AV-4 — Exhaust free-tier resources without an account

**Findings:** SEC-001, SEC-002, DB-002  
**Impact:** database growth, invocation/compute exhaustion, then backup memory failure.

1. Repeatedly call `POST /api/designs`; no body, account, prior cookie, application counter, or
   challenge is required.
2. Every accepted call inserts the full seeded kitchen document and generates a distinct row.
3. Repeat from cleared sessions or distributed networks. Cookie eviction does not remove database
   rows.
4. For rows whose cookies are retained, send bounded staging probes with large but schema-valid
   placement arrays. The API stores them because neither byte size nor placement count is bounded.
5. The nightly backup selects all accumulated rows, holds them as objects, stringifies each, joins one
   full NDJSON string, and uploads it. Memory rises with total database size until the serverless
   function fails.
6. The cron endpoint still returns HTTP 200 with `{ ok: false }`, so status-only monitoring sees a
   successful invocation.

Use ADR 0019's intended low rates to verify the fix; do not use a high-volume loop as the regression
test.

## AV-5 — Crash a victim tab through the public capture harness

**Findings:** SEC-003  
**Impact:** client tab/GPU denial of service.

1. Send a victim a URL such as
   `/internal/scene-shot?w=32768&h=32768&pos=4.3,2.9,5.3&target=1.5,1.15,0.9`.
2. The route accepts both dimensions because they are finite and positive.
3. The page creates a container of that size and mounts a WebGL canvas with continuous rendering.
4. Depending on browser/GPU limits, allocation fails, the context is lost, the tab becomes
   unresponsive, or the browser kills it.

## AV-6 — Point destructive test cleanup at the wrong privileged database

**Findings:** DB-001  
**Impact:** test traffic and deletes execute against an unintended database.

1. Misconfigure `TEST_DATABASE_URL` with a privileged application/production connection URL.
2. Start the Playwright suite. The config verifies only that a value exists and passes it to the dev
   server as `DATABASE_URL`.
3. Tests mint rows in that database and record IDs for cleanup.
4. `deleteDesignsForTests(connectionUrl, ids)` accepts the same raw URL and issues `DELETE` without
   invoking the live-suite safety guard.
5. Current callers normally delete only IDs they minted, but the exported helper accepts any supplied
   ID list; one future test/helper error can delete unrelated designs with no database-identity refusal.
