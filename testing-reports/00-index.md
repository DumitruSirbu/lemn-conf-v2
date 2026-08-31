# Adversarial review index

Review date: 2026-08-30  
Reviewed source revision: `77a90d2`; verified identical after merge at `c3bdadd` on
`adversarial-review-reports`  
Scope: tracked production source under `apps/web/src`, `packages/configurator-domain/src`,
`packages/three-adapter/src`, and `packages/persistence/src`, plus the maintained project contracts
under `docs/`. Files ignored by Git were excluded. The unrelated untracked file
`docs/runbooks/github-fine-grained-token.md` was not read or changed.

This is a read-only adversarial review. No application fix, database mutation, live exploit, secret
readout, or deployment change was performed.

## Severity summary

| Severity  |  Count |
| --------- | -----: |
| Critical  |      1 |
| High      |      5 |
| Medium    |      8 |
| Low       |      4 |
| **Total** | **18** |

## Remediation status — updated 2026-08-31

**All 18 findings are closed.** 17 fixed, 1 (SEC-001) deferred to M8 by the owner's decision behind
a checkable launch gate. Work is on `adversarial-review-reports` across eleven commits; nothing is
pushed. The final `pnpm ci:local` passed all eight gates: **2,791 tests** — domain 1,041,
persistence 177 (live Neon test database), Three adapter 889, web 684 with 4 pre-existing skips.

| Severity  | Fixed | Deferred |
| --------- | ----: | -------: |
| Critical  |     1 |        0 |
| High      |     4 |        1 |
| Medium    |     8 |        0 |
| Low       |     4 |        0 |
| **Total** | **17** |    **1** |

Every fix was reviewed, and the fixes each review demanded were reviewed again. That second pass
paid for itself repeatedly: it found a security regression inside a security fix (an oversized body
whose stream then errored answered 400 and wrote a log line, reinstating the amplification the byte
limit exists to remove), a fix that opened the other half of its own finding (a probe with no
timeout turned a hanging network into a permanently read-only panel), an ownership record that split
in two under its own release, and an overwrite that silently swallowed the edit it was meant to
write.

### Found during remediation, not in the original 18

- **A wall cabinet is built to a depth nobody manufactures** — reproduced live and persisted
  (`seatDepthMm: 703` over a 680 mm fridge), with no refusal and the number shown on no screen.
  `docs/BACKLOG.md` entry 15.
- **`lemnaria_test` never existed.** ADR 0006 named a database that was never created; the
  destructive suite has been deleting from `lemn-conf-v2-staging` since it was written. The owner
  chose to keep it; ADR 0006 is amended to record it as a named destructive-test target.
- **The M8 retention cron has no credential that can delete** — ADR 0008 withholds `DELETE`
  deliberately. Blocks the M8 launch gate until the owner picks a credential model.
- **`signature-flow.e2e.spec.ts:102`** is red on this branch, pre-dating all remediation work.
- The PMREM environment leaks its `WebGLRenderTarget`; three Low save-path residuals; void geometry
  is unasserted; one stray design row in the test database.

### Before this ships

1. **Apply migration `0004` before deploying the web code.** Reads now select `revision`, so the
   wrong order takes the app down rather than degrading it.
2. Pick the retention-delete credential.
3. Exercise `multipart: true` against the live Blob store — never done.
4. Run the Playwright suite; `signature-flow` is already red.
5. Leave `LEMNARIA_ENABLE_SCENE_SHOT_ROUTE` and `NEXT_PUBLIC_LEMNARIA_ENABLE_SELECTION_DEBUG` unset
   in every deployed environment.

## Fix order

1. **SCENE-001** — deleted seeded bodies return as unselectable ghosts after reload.
2. **WEB-001** — a queued document can be saved under a different design ID.
3. **DOM-001** — the persistence/API schema accepts documents the domain and renderer cannot handle.
4. **SEC-001 / SEC-002** — minting and payload volume are unbounded at the application boundary.
5. **DB-001** — the destructive test helper does not enforce the safety guard its documentation
   promises.
6. **DB-002 / DB-003** — backup growth can exhaust memory and failures are deliberately masked.
7. Address the remaining Medium findings, then Low hardening/maintainability findings.

## Findings by module

| ID        | Severity | Module               | Finding                                                                         | Report                                                | Status                                             |
| --------- | -------- | -------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------- | -------------------------------------------------- |
| SCENE-001 | Critical | Web / Three scene    | Deleted reference bodies reappear as unselectable ghosts                        | [Three scene](./04-three-scene.md)                    | Fixed — `db9c402`, independently verified          |
| WEB-001   | High     | Web persistence      | Save coalescer binds pending content to the live route ID                       | [Web state](./02-web-state-and-client-persistence.md) | Fixed — `b0400ac`, verified; 3 Low residuals open  |
| DOM-001   | High     | Domain / API         | Shape-valid but semantically hostile designs are persisted                      | [Domain](./03-domain-model.md)                        | Fixed — `47e2552`                                  |
| SEC-001   | High     | API / availability   | Unauthenticated design minting has no application limiter or active retention   | [Security](./01-security-and-api.md)                  | Deferred — owner's decision; gated in M8 `f342752` |
| DB-001    | High     | Persistence tests    | Destructive cleanup accepts an arbitrary privileged connection URL              | [Persistence](./05-persistence-and-backup.md)         | Fixed — `e666d96`                                  |
| DB-002    | High     | Backup               | Nightly backup materializes the entire database several times in memory         | [Persistence](./05-persistence-and-backup.md)         | Fixed — `e666d96`                                  |
| SEC-002   | Medium   | API / domain         | Request bytes and placement count are unbounded                                 | [Security](./01-security-and-api.md)                  | Fixed — `47e2552`                                  |
| SEC-003   | Medium   | Internal route       | Public scene-shot route accepts unbounded WebGL dimensions                      | [Security](./01-security-and-api.md)                  | Fixed — `96293c5`                                  |
| WEB-002   | Medium   | Authorization UX     | Unknown write access is treated as writable and failed probes are swallowed     | [Web state](./02-web-state-and-client-persistence.md) | Fixed — `0107089`                                  |
| WEB-003   | Medium   | Concurrency          | Authorized tabs overwrite each other without revision checks                    | [Web state](./02-web-state-and-client-persistence.md) | Fixed — `0aa4374`, revision + 409 |
| SCENE-002 | Medium   | Three lifecycle      | Imperatively supplied primitives and active outline are not disposed on unmount | [Three scene](./04-three-scene.md)                    | Fixed — `882aaf2` |
| DB-003    | Medium   | Backup observability | Backup failures return HTTP 200 and expose raw error detail                     | [Persistence](./05-persistence-and-backup.md)         | Fixed — `e666d96`                                  |
| DOM-002   | Medium   | Domain geometry      | Occupied depth knowingly under-reports several body families                    | [Domain](./03-domain-model.md)                        | Fixed — `f9b92e1` |
| DOC-001   | Medium   | Documentation        | Status, milestone state, and validation premise contradict shipped code         | [Docs/process](./06-docs-and-process.md)              | Fixed — `cbd5c4e`                                  |
| SEC-004   | Low      | Web hardening        | Security headers are not encoded in repository configuration                    | [Security](./01-security-and-api.md)                  | Fixed — `96293c5`, CSP report-only                 |
| WEB-004   | Low      | Production surface   | Test-only selection telemetry is rendered for every customer                    | [Web state](./02-web-state-and-client-persistence.md) | Fixed — `0107089`                                  |
| DB-004    | Low      | Migrations           | Migration runner has no ledger, checksum, or all-files transaction              | [Persistence](./05-persistence-and-backup.md)         | Fixed — `945de39`, ADR 0042 |
| DOM-003   | Low      | Maintainability      | Width command is a 1,663-line, 45-function change hotspot                       | [Domain](./03-domain-model.md)                        | Fixed — `3028357`, no behaviour change |

## Attack and verification material

- Exact breaking sequences: [07-critical-attack-vectors.md](./07-critical-attack-vectors.md)
- Commands, passing checks, reproductions, and limitations: [08-verification-evidence.md](./08-verification-evidence.md)

## Basic security checks with no finding

- `pnpm audit --audit-level=high --prod`: no known production dependency vulnerability.
- Workspace packages are private and internal dependencies use `workspace:*`; no dependency-confusion
  path was found in the manifests or lockfile.
- SQL values in production repository code use the Neon tagged template; no string-built SQL sink was
  found.
- No `eval`, `new Function`, `dangerouslySetInnerHTML`, or production Postgres import outside
  `packages/persistence` was found.
- The committed secret-pattern matches were two intentionally fake database URLs in persistence test
  fixtures. No production credential or private key was identified.
- Write tokens are generated separately from design IDs, hashed before storage, kept in an HttpOnly
  cookie, and checked in the same SQL statement as the update. No bypass was found in the reviewed
  path.
