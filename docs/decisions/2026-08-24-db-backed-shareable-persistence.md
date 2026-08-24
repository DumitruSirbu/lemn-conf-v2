# Persistence: a managed Postgres database with shareable design links

Date: 2026-08-24; engine, storage format, and security/backup approach amended 2026-08-25
Status: accepted by product owner (stated directly during the 2026-08-24 planning round; the storage
format confirmed 2026-08-25; the engine changed from SQLite to Postgres on Neon later the same day)

Supersedes: `docs/ARCHITECTURE_PROPOSAL.md` §7's browser-local persistence plan, and the
"temporary persistence adapter" half of decision 7 in
`docs/decisions/2026-08-20-initial-product-and-stack.md`. It also resolves the storage half of the
open product question about the concrete temporary persistence provider (`PRODUCT_REQUIREMENTS.md`,
"Remaining product data decisions" item 4); retention period and privacy copy stay open.

## Context

`ARCHITECTURE_PROPOSAL.md` §7 planned to persist the configuration envelope in `localStorage` after
every successful command, behind a `ConfigurationRepository` interface, and explicitly deferred any
server-side store ("Do not use IndexedDB until configuration size or offline asset needs demonstrate
it is required. Do not put the full configuration in query parameters.").

That plan makes a design reachable only from the browser that created it. The owner wants a design
to be shareable and reloadable: a link that, when opened, restores the exact configuration for that
session. The mockups already assume durable state that outlives a single view — 5A tells the
customer the design is saved and can be reopened, and 5B's recovery depends on the design surviving
a failed submission.

## Decision

1. **The POC gets its own server-side database**, separate from browser storage. Configuration and
   session progress are stored there.
2. **The database is Postgres, hosted on Neon's free tier.** Decided 2026-08-25, revising the same
   day's earlier SQLite decision after the owner raised it directly. Two reasons carried the change:
   - **It directly reduces the security/backup burden the owner asked for**, rather than adding to
     it. A self-managed SQLite file needs its own file-permission discipline, its own backup job, its
     own rotation, and its own restore procedure, all of which are the implementer's responsibility to
     get right. Neon provides encryption at rest, TLS in transit, network-level access control (a
     credentialed connection string, no file on the app server to protect), and automatic backups with
     point-in-time restore, by default. For an owner who has said outright they are not a security
     expert, fewer self-managed controls is the safer choice, not the more complex one.
   - **A local file is a poor fit for the eventual hosting target.** This workspace already carries
     Vercel-specific tooling; if the application ends up on serverless hosting, the filesystem is
     ephemeral and a SQLite file can be lost between invocations or deployments. A network database
     sidesteps that failure mode entirely instead of deferring it to a deployment surprise.
   - The free tier (currently on the order of hundreds of MB of storage, autosuspending compute) is
     sufficient for a POC; a cold start after idle costs about a second, which is acceptable here.
   - It still sits behind `ConfigurationRepository` like any other adapter, so this is a driver/adapter
     change, not a domain or store change. See "Alternatives considered" for the options not taken,
     including the same-day SQLite decision this replaces.
3. **A stored design is one self-contained JSON document, not a set of normalized references.**
   The row for a design holds the complete canonical `Design` — every placement's wall, position,
   width, finish, handle, plus global material/hardware settings and any per-cabinet custom settings —
   stored as a JSON/JSONB value, sufficient on its own to reconstruct the exact 3D scene without a
   live catalog lookup. This was already implied by `DEVELOPMENT-SPEC.md` §12's `Design` shape and by
   decision 10 below (voids and columns are derived, never stored); it is unaffected by the engine
   change — Postgres's `jsonb` column type holds the same document a SQLite `TEXT`/`JSON` column
   would have.
4. **Forward compatibility, not scope now: the same document shape is meant to be reused per CRM
   lead/session.** The owner's stated future use: a salesperson opens a lead and sees exactly what
   that customer configured, from the same self-contained JSON — including after catalog data has
   since changed, which is precisely why the document must be self-contained rather than a set of
   catalog references. CRM integration itself remains out of scope (per the 2026-08-20 record and the
   supersession record §7); this only constrains the *shape* of what M2 stores so that reuse remains
   possible without a later migration.
5. **A design is addressed by an opaque design/session identifier that appears in the URL.**
   Opening that URL loads exactly that design from the database and restores the flow at the step it
   belongs to.
6. **`ConfigurationRepository` stays.** The abstraction from §7 was right; only the concrete adapter
   changes, from a `localStorage` adapter to a Postgres-backed one. Commands, the domain package, and
   the store are unchanged by this decision — the domain still performs no I/O.
7. **The full configuration never travels in query parameters.** The URL carries the identifier
   only. That rule from §7 survives unchanged and is now load-bearing rather than incidental.
8. **Persistence writes after every successful command**, as §7 intended, but to the repository
   rather than to the browser. A failed command persists nothing.
9. **Contact data stays out of the stored configuration.** Sharing or reloading a design must not
   carry personal data. This is unchanged from `CONFIGURATION_MODEL.md` and
   `ARCHITECTURE_PROPOSAL.md` §9, and matters more now that a design is reachable by link.
10. **Loading is still validated and still fails whole.** A stored payload is parsed, validated,
    migrated as one transaction if its schema version is known, and only then replaces the store. An
    unknown or invalid payload yields a recoverable error and does not partially hydrate. The
    validation rules from §7 are unchanged; only the source of the bytes moved.

## Security and backups

Added 2026-08-25 at the owner's request ("not an expert but I need good security for this local DB
and also organize for it a scheduled backup generation"), then revised the same day once the engine
moved to Neon, because a managed database changes what needs to be built versus what is already
provided. The database holds real customer configuration state and, from M8 onward, will sit next to
a contact-submission flow, so this is specified now rather than left to whoever implements M2. The
bar is "reasonable baseline for a POC holding real user data", not an enterprise security programme —
reversible defaults, not commitments that need a security review to change.

**Security baseline (M2, mandatory):**

1. **Credentials, not a file, are the boundary.** The Postgres connection string (including its
   password) is read from an environment variable, never committed, never logged, and excluded from
   version control the same way `.env*.local` already is per the repository's `.gitignore`. There is
   no database file on the app server to place, permission, or accidentally serve.
2. **Connections use TLS**, which Neon requires by default — the adapter must not disable certificate
   verification to work around a local development inconvenience.
3. **No SQL string-building.** Every query, including migrations and one-off scripts, uses
   parameterised statements via the driver/query builder. This is the standard defence against
   injection and it is free with any competent Postgres client — there is no reason to do it any
   other way.
4. **Least-privilege database role.** The application connects as a role scoped to the schema it
   needs (create/read/write its own tables), not the Neon project's admin role.
5. **Access is the opaque identifier, nothing else, at the application layer.** No separate customer
   authentication exists for the POC — this was already true of the "shareable link" model in
   decision 5. Anyone holding a design's link can view it; nothing about that model is loosened or
   tightened by this section, but it is why the identifier's unguessability (decision 5, and the M2
   acceptance criteria) carries real security weight, not just anti-enumeration convenience.
6. **Contact data gets stricter handling than design data.** Decision 9 already keeps contact/PII out
   of the stored `Design`. When M8 adds contact submissions, they are a separate table from designs,
   subject to the same credential/role/parameterisation rules, and logged with PII redacted per
   `ARCHITECTURE_PROPOSAL.md` §9 — carried forward here as a named requirement, not left implicit.

**Backups (M2, mandatory):**

7. **Confirmed 2026-08-25: Neon's free-tier point-in-time restore window is 6 hours**, capped at
   1 GB-month of changes (source: Neon's plan documentation, read at implementation time rather than
   assumed). This covers an immediate mistake — a bad migration, a bug that corrupts recent rows — but
   not discovering a problem a day or more later, which is a real gap against "good backups" as the
   owner asked for it. Neon's PITR remains the first line of defence for same-session recovery; it is
   not the whole backup story.
8. **A supplementary daily export closes that gap.** A scheduled job runs a Postgres export (`pg_dump`
   or equivalent) against the Neon database and uploads the result to **Vercel Blob, private access**,
   under a timestamped key (e.g. `backups/design-db/<ISO timestamp>.sql`). Vercel Blob was chosen over
   a new storage account (S3 or similar) for the same reason SQLite lost to Neon and Docker Postgres
   lost earlier: it needs no separate account or credential set, since it is provisioned the same way
   as Neon, through the Marketplace, against the same Vercel project.
9. **Confirmed 2026-08-25: this costs nothing at POC scale.** Vercel Blob's Hobby plan is free within
   included limits (5 GB storage, 10K advanced operations/month, 100 GB transfer/month at time of
   writing); a daily upload of a database dump bounded by Neon's own 0.5 GB free-tier storage cap uses
   a small fraction of one percent of that allowance. On Hobby, exceeding a limit blocks further Blob
   usage for 30 days rather than billing automatically — there is no surprise-charge path.
10. **A rotation retains the last 14 daily backups** and deletes older blobs (`del()` on Vercel Blob is
    free of charge). Fourteen days is a starting default sized for a POC, not a researched retention
    policy — revisit it alongside the still-open design-retention question if this moves past POC use.
11. **The backup job's failure is observable, not silent**, the same requirement carried from the
    original SQLite-era plan: a failed run is logged/surfaced where a developer will see it, and it
    must never fail the request path or block the application.
12. **A restore procedure is written down** covering both paths: restoring within 6 hours via Neon's
    console/CLI point-in-time restore, and restoring beyond that window by loading the relevant dated
    export from Vercel Blob back into Neon — as part of M2's documentation, not left to be
    reconstructed under pressure the first time it's needed.

## Alternatives considered

1. **Keep `localStorage` and add an export/import file.** Rejected: it does not produce a link, and
   the owner asked for a link.
2. **Encode the design in the URL.** Rejected on the existing rule and on its own merits — a
   configuration of twenty-plus placements makes an unshareable URL, and a link would silently break
   whenever the schema changed.
3. **SQLite (local file).** This was the decision earlier on 2026-08-25, on the reasoning that it
   needed no external service. Superseded the same day: it pushes the entire security and backup
   burden onto self-managed file handling and a hand-rolled scheduled job, which is more work and more
   ways to get it wrong than a managed database's defaults — the opposite of what "not a security
   expert" calls for — and it does not survive an ephemeral serverless filesystem if the app is ever
   deployed that way.
4. **Postgres via Docker Compose.** Rejected: it solves neither the security/backup burden (still
   self-managed) nor the ephemeral-filesystem risk (still requires a persistent volume for production
   parity), while adding a container dependency to local development that Neon does not require.
5. **A hosted database, deferred until after the POC.** This was the reasoning for rejecting a hosted
   store in the original 2026-08-24 round. Superseded 2026-08-25: the security/backup requirement
   raised the same day changes the calculation, because a managed store now removes work rather than
   adding it, and Neon's free tier costs nothing to adopt now.
6. **Store a design as normalized rows (one row per placement, joined at read time).** Rejected: the
   CRM-reuse intent (decision 4) requires a document a salesperson can open later and trust even if
   catalog rows have since changed. A normalized schema re-resolves against current catalog data on
   every read, which is exactly the failure mode a self-contained snapshot avoids. Unaffected by the
   engine change.
7. **Rely on Neon's 6-hour PITR alone, with no supplementary export.** Rejected 2026-08-25 once the
   actual window was confirmed: 6 hours does not match "good backups" as the owner asked for it, since
   it covers only same-session mistakes, not a problem noticed the next day.
8. **A new object-storage account (S3 or similar) for the supplementary export.** Rejected: it adds a
   credential set and an account this project would not otherwise need, for no benefit over Vercel
   Blob, which is already being provisioned through the same Marketplace flow as Neon.

## Consequences

- `ARCHITECTURE_PROPOSAL.md` §7 carries a supersession note. Its three-way split of durable /
  workflow / ephemeral state survives; only the durable tier's storage location changes.
- The design identifier becomes part of routing, so the wizard's route guards
  (`ARCHITECTURE_PROPOSAL.md` §8) now resolve a design by identifier rather than by whatever the
  browser happens to hold.
- A shared link exposes a design to anyone holding it. For a POC that is acceptable, but the
  identifier must be opaque and unguessable rather than sequential, and the decision must be
  revisited before anything resembling production traffic.
- The submission boundary already sends an immutable reviewed snapshot; it now references a design
  that also exists server-side, which removes the need to trust the client's copy of it.
- Local development and any deployment now require a Neon project and a connection string supplied
  through environment configuration; this is a new dependency the earlier SQLite plan did not have,
  accepted in exchange for the security/backup and hosting-fit benefits above.
- The project is now linked to Vercel (`dumitrusirbus-projects/lemnaria-configurator-gbt`), with Neon
  (`neon-gray-elephant`) provisioned and connected, and its environment variables pulled into
  `.env.local` (already covered by `.gitignore`'s `.env*.local` rule). Vercel Blob needs the same
  provisioning treatment when M2 implements the backup job.
- A second free-tier dependency (Vercel Blob) is now part of the persistence story, alongside Neon.
  Both are provisioned through the same Marketplace flow and billed the same way (free within Hobby
  limits, no auto-billing on overage), so this does not introduce a second billing relationship.

## Open questions carried forward

1. ~~The concrete database and its deployment story beyond local development.~~ **Resolved
   2026-08-25: Postgres on Neon's free tier**, addressed by decision 2, and provisioned the same day.
   Its deployment story is Neon's own hosted service, which removes the local-development-only caveat
   the SQLite decision carried.
2. **Retention period, deletion, and the privacy copy shown to the customer — decided 2026-08-25 as a
   deliberate placeholder, not resolved.** No real retention policy yet: designs are kept
   indefinitely for the POC, and the customer-facing copy (consent text, what happens to a saved
   design) stays a content slot, matching how frame 4A's consent line was already treated. This must
   be revisited with a real policy before anything beyond POC use, and sharper now that a design
   persists in a hosted database rather than on the device.
3. Whether a shared link is read-only for a second viewer or editable, and what happens when two
   viewers edit the same design. Not needed for the POC; needed before sharing is promoted as a
   feature.
4. Whether an identifier ever expires.
5. ~~The exact point-in-time-restore retention window on Neon's free tier.~~ **Resolved 2026-08-25:
   6 hours, capped at 1 GB-month of changes** — see the backups section. This is why a supplementary
   export was added rather than relying on Neon's PITR alone.
