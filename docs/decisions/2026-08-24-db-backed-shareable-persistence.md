# Persistence: a server-side local database with shareable design links

Date: 2026-08-24
Status: accepted by product owner (stated directly during the 2026-08-24 planning round)

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

1. **The POC gets its own server-side local database.** Configuration and session progress are
   stored there. This is the application's own local DB, not browser storage.
2. **A design is addressed by an opaque design/session identifier that appears in the URL.**
   Opening that URL loads exactly that design from the database and restores the flow at the step it
   belongs to.
3. **`ConfigurationRepository` stays.** The abstraction from §7 was right; only the concrete adapter
   changes, from a `localStorage` adapter to a DB-backed one. Commands, the domain package, and the
   store are unchanged by this decision — the domain still performs no I/O.
4. **The full configuration never travels in query parameters.** The URL carries the identifier
   only. That rule from §7 survives unchanged and is now load-bearing rather than incidental.
5. **Persistence writes after every successful command**, as §7 intended, but to the repository
   rather than to the browser. A failed command persists nothing.
6. **Contact data stays out of the stored configuration.** Sharing or reloading a design must not
   carry personal data. This is unchanged from `CONFIGURATION_MODEL.md` and
   `ARCHITECTURE_PROPOSAL.md` §9, and matters more now that a design is reachable by link.
7. **Loading is still validated and still fails whole.** A stored payload is parsed, validated,
   migrated as one transaction if its schema version is known, and only then replaces the store. An
   unknown or invalid payload yields a recoverable error and does not partially hydrate. The
   validation rules from §7 are unchanged; only the source of the bytes moved.

## Alternatives considered

1. **Keep `localStorage` and add an export/import file.** Rejected: it does not produce a link, and
   the owner asked for a link.
2. **Encode the design in the URL.** Rejected on the existing rule and on its own merits — a
   configuration of twenty-plus placements makes an unshareable URL, and a link would silently break
   whenever the schema changed.
3. **A hosted database now.** Rejected as premature. The stated priority is a working POC; a local
   DB behind a repository interface can be pointed at hosted infrastructure later without touching
   the domain or the store.

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

## Open questions carried forward

1. The concrete database and its deployment story beyond local development.
2. Retention period, deletion, and the privacy copy shown to the customer — unchanged from the
   earlier record, and now sharper because a design persists server-side rather than on the device.
3. Whether a shared link is read-only for a second viewer or editable, and what happens when two
   viewers edit the same design. Not needed for the POC; needed before sharing is promoted as a
   feature.
4. Whether an identifier ever expires.
