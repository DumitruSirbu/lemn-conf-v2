# Documentation and process consistency

## FINDING: Status and security premises contradict the shipped branch

- **ID:** DOC-001
- **SEVERITY:** Medium
- **THE EXPLOIT/FLAW:** The mandatory orientation document says M5 waves 5D2c and 5F remain open and
  reports old test counts (`docs/STATUS.md:6,30,35-48`). The current branch contains shipped 5D2c and
  5F commits (`08a01c6`, `d7a1d94`, `71661d6`, `c1f3aa3`, `a157cc5`, `a2a4da7`, `c3ab574`,
  `77a90d2`), and the production source/tests implement those waves. `docs/milestones/M5-width.md`
  similarly says 5D2 and 5F remain and later labels the phase `Status: planned`. This is not harmless
  historical prose: AGENTS.md requires `STATUS.md` to decide what plan to open and what work remains,
  so the contradiction can dispatch work against already-shipped behavior.

  The more dangerous contradiction is ADR 0038. It records `DesignPlacementSchema` accepting a 40 mm
  body but defers the fix because the state is “Unreachable today — there is no deserialisation
  surface” (`docs/decisions/0038-pre-release-no-stored-designs-no-migrations.md:69-84`). The branch has
  both a public `PUT/PATCH /api/designs/{id}` deserialization surface and a Postgres load/migration
  surface. DOM-001 proves they accept the invalid state. That stale premise directly concealed an
  executable validation defect.

- **REMEDIATION:** Reconcile documentation as a separate documentation close-out, not by rewriting
  history:
  - update `docs/STATUS.md` to mark the actually shipped waves and recalculate test counts from a
    direct successful run;
  - update only the active status header/remaining-work sections in `M5-width.md` and leave accepted
    decisions in ADRs;
  - amend ADR 0038 with a dated correction that the API/database are deserialization surfaces and link
    DOM-001 or its eventual fixing ADR;
  - add a close-out check that every commit named `M<n> wave ...` is reflected in STATUS before the
    wave is considered complete.

  Do not mark the database-backed suite green until it is directly rerun with explicitly approved
  access to the configured test database.
