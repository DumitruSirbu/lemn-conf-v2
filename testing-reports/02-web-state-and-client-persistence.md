# Web state and client persistence

## FINDING: Pending content is saved under the live route ID, not its originating ID

- **ID:** WEB-001
- **SEVERITY:** High
- **THE EXPLOIT/FLAW:** The coalescer stores only a `Design` in `pending`
  (`apps/web/src/persistence/save-coalescer.ts:81,104-113`). When a delayed save actually starts, it
  asks `deps.getDesignId()` for the ID at that later instant
  (`apps/web/src/persistence/save-coalescer.ts:163-189`). The singleton store explicitly allows
  `hydrate` to replace `designId` at any time (`apps/web/src/store/configurator-store.ts:342-360`),
  while the singleton coalescer reads that mutable state through a closure
  (`apps/web/src/store/configurator-store.ts:383-403`). Therefore content and identity are not one
  atomic job. A runtime reproduction produced:

  ```json
  [
    { "id": "design-A", "marker": "A-first" },
    { "id": "design-B", "marker": "A-pending" }
  ]
  ```

  Design A's pending edit was sent to design B after `currentId` changed during the one-second save
  interval. The inverse race also exists: a save for A resolving after B hydrates calls unscoped
  `onSaved(id)` and can move the store's identity back to A. Current UI has limited arbitrary
  design-to-design navigation, but the state model and comments intentionally support client-side
  transitions; M7/M8 navigation will make the corruption easier to reach.

- **REMEDIATION:** Make the job immutable and scoped. Snapshot `{ designId, design, generation }` in
  `scheduleSave`, use `job.designId` for the repository call, and apply callbacks only if the store is
  still on the same generation. Prefer one queue per design and dispose/cancel its timers on hydrate:

  ```ts
  interface SaveJob {
    designId: DesignId | null;
    design: Design;
    generation: number;
  }

  const job = pending;
  const savedId = await repository.save(job.designId, job.design);
  if (getGeneration() === job.generation) onSaved(savedId);
  ```

  Add fake-timer tests for pending A -> hydrate B, in-flight A -> hydrate B, null-ID mint -> hydrate B,
  and callbacks resolving in both orders.

## FINDING: Unknown authorization is exposed as writable and probe failure is silent

- **ID:** WEB-002
- **SEVERITY:** Medium
- **THE EXPLOIT/FLAW:** `/d/{id}` hydrates with `canWrite: "unknown"`, and the panel intentionally
  treats that value as writable (`apps/web/src/app/d/[id]/hydrate-and-configure.tsx:22-32`,
  `apps/web/src/panel/panel-model.ts:334-340`). The follow-up authorization probe swallows every
  failure and leaves the optimistic state unchanged
  (`apps/web/src/app/d/[id]/hydrate-and-configure.tsx:45-66`). A shared-link reader on a slow or
  blocked API can mutate local state before access is known. The eventual write is correctly refused,
  but the UI keeps the unsaved edit on screen and only then disables controls. This violates the
  product rule that the interface should not offer an operation it cannot satisfy and creates a
  believable but non-persisted configuration.
- **REMEDIATION:** Treat `unknown` as a real loading state: render the design but disable mutation
  controls until the probe answers. On probe failure show a retryable “access could not be checked”
  notice rather than silently granting optimistic interactivity. If first-paint editability is a hard
  requirement, move the credential to a cookie path sent to `/d/{id}` or perform the access GET before
  mounting the editor; do not convert network failure into authorization optimism.

## FINDING: Concurrent authorized tabs silently destroy each other's updates

- **ID:** WEB-003
- **SEVERITY:** Medium
- **THE EXPLOIT/FLAW:** `saveAuthorized` updates by only `id` and `write_token_hash`, with no expected
  revision or `updated_at` predicate
  (`packages/persistence/src/neon-configuration-repository.ts:103-116`). Two tabs holding the same
  legitimate cookie can both load revision N, make different destructive edits, and save. Both writes
  return success and the last commit silently replaces the first. ADR 0019 explicitly accepts this
  residual risk (`docs/decisions/0019-security-baseline-writes-throttling-retention.md:262-265`), but
  deletion is final and the product now has real asynchronous saving, so the accepted risk is a data
  loss mechanism, not a theoretical consistency note.
- **REMEDIATION:** Add an opaque monotonically increasing revision to the row and response. Save with
  `where id = $id and write_token_hash = $hash and revision = $expected`, increment on success, and
  return `409 Conflict` on zero rows when authorization is otherwise valid. The client must stop
  retrying a stale document and offer reload/explicit overwrite. Do not use timestamps supplied by the
  client as the concurrency token.

## FINDING: Test-only store telemetry ships to every customer

- **ID:** WEB-004
- **SEVERITY:** Low
- **THE EXPLOIT/FLAW:** `ConfigureScreen` always renders `SelectionDebug`
  (`apps/web/src/app/configurator/configure/configure-screen.tsx:94-96`). The hidden span publishes
  selection IDs, derived opening dimensions, save status, current design ID, probe state, and rejection
  code in DOM attributes (`apps/web/src/app/configurator/configure/selection-debug.tsx:24-50`). The
  values are not write credentials, but this is test instrumentation on the production attack surface
  and creates a stable DOM oracle for internal state and future automated abuse.
- **REMEDIATION:** Compile or gate the component out of non-E2E builds. Use an explicit test build flag
  set by Playwright, default it off, and assert in a production build test that
  `[data-testid="selection-debug"]` does not exist. Do not use `NODE_ENV === "development"`, because
  ordinary development should not imply E2E observability.
