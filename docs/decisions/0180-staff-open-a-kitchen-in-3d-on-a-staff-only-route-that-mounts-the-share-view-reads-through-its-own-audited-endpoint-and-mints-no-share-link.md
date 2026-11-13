# ADR 0180 — Staff open a kitchen in 3D on a staff-only route that mounts the share view, reads through its own audited endpoint, and mints no share link

Status: **Proposed** (2026-11-13). A security read is owed before wave W3a is dispatched (a new staff read of client
data, a new audit action, a proxy family change). Nothing is built.
Date: 2026-11-13
Type: Decision record (route, access and audit)
Milestone: M11 — [`M11-owner-feedback-2026-11-07.md`](../milestones/M11-owner-feedback-2026-11-07.md), waves W3a and W3b

**Evidence tiers.** **[owner, relayed]**, **[doc]**, **[src]** (at `12266a02`), **[inf]**, as in ADR 0179.

## Context

Owner feedback item 5, part 1 (2026-11-07): the staff kitchen page `/{locale}/staff/kitchens/{id}` lacks "the most
important thing", a way to open the kitchen in the 3D configurator; read-only is fine [doc: `docs/OWNER_FEEDBACK.md`,
item 5]. The ruling of 2026-11-13 [owner, relayed]: **a staff-only read-only route, behind the staff gate, writing an
audit row as the detail page does; no share link is minted.**

What exists:

- The detail page runs the staff gate (`readStaffPage({ page: "kitchens" })`) and carries no kitchen; its client reads
  `GET /api/staff/kitchens/{id}`, "which writes the audit row" [src: `app/[locale]/staff/kitchens/[id]/page.tsx:32-75`].
- That endpoint admits by the reads limiter, `design.read.any`, the id's shape and a fail-closed per-account bucket,
  then commits `kitchen-opened` before returning the body; "no `200` leaves without a committed audit row" [src:
  `lib/server/staff/staff-kitchens.ts:44-47`, `:94-141`, `:143-179`; doc: ADR 0173 P-L3-3].
- A page render must not write: the session reader "never writes: a page render may call it, and a render can neither
  set a cookie nor be allowed to move `last_seen_at`" [src: `lib/server/account/current-session.ts:33-34`].
- The detail payload holds both copies, `design` (as it stands) and `asSent` (the newest unrevoked copy sent to the
  shop) [src: `packages/persistence/src/staff-kitchen-reader.ts:161-194`]. The page shows the as-sent copy unless the
  kitchen changed after it was last seen, in which case it opens on the current one; a switch chooses [src:
  `staff/staff-kitchen-page.tsx:207-225`; `staff/staff-kitchen-facts.ts:27-40`].
- The share view's client component, `SharedDesignView`, hydrates a design under a sentinel id with `canWrite: false`
  and renders `ConfigureScreen variant="shared"`, which drops navigation and relies on `canWrite: false` to disable
  every control [src: `app/s/[token]/shared-design-view.tsx:11-51`; `app/configurator/configure/configure-screen.tsx:65-70`].
  A test admits exactly two files that mount `<ConfigureScreen`, and this is one of them [src:
  `apps/web/tests/app/configure-screen-single-mount.test.ts:23-26`].
- The shop already opens the as-sent kitchen in that same share view through the frozen link in its notice
  [doc: ADR 0165 title].
- The proxy gives staff paths `private, no-store` and `noindex`, but recognises `staff/kitchens/{id}` only at four
  segments [src: `proxy.ts:148-150`, `:333-346`]; the matcher's generic pattern already reaches a fifth segment that
  has no file extension [src: `:91-93`].
- The audit action list is code; the table checks only the action's shape `^[a-z0-9-]{1,32}$` [doc:
  `packages/persistence/src/migrations/0020_create_staff_audit_events.sql:16-17`, `:63`; src:
  `packages/configurator-domain/src/staff/staff-audit-action.ts:28-39`, `:121-131`].

## Decision

### d1. The route is `/{locale}/staff/kitchens/{id}/3d`, gated as the detail page, carrying no kitchen

The page runs the same gate with the same page key, so every refusal is the detail page's for the same session. The
id's shape is judged after the gate. It renders a client screen and no kitchen data.

### d2. A new endpoint serves the design, and commits its own audit row first

`GET /api/staff/kitchens/{id}/3d?version=sent|current` admits exactly as `openKitchenForStaff` does, counts the same
`staff-kitchen-open` bucket (fail closed), reads the kitchen with the same `readOne`, chooses the copy by
`shownDesignOf`'s rule for the requested version, commits the audit row, and only then answers. The body is the design
and its source, nothing else: no client, request, notes or estimates. A `version` that is neither `sent` nor `current`
is a `400` in the shape of `staffInvalidQueryResponse`, judged before the bucket, writing no row.

### d3. The audit row is a new action, `kitchen-viewed-3d`, with the copy served

Detail `{ version: "sent" | "current" }`, naming the copy actually served (after `shownDesignOf`'s fallback). It names
the design and, when there is one, the client's account, as `kitchen-opened` does. No migration: the table's check is a
shape. The audit page labels and filters the new action.

### d4. The view mounts `SharedDesignView`; nothing new mounts `ConfigureScreen`

The client screen fetches d2's endpoint and mounts `SharedDesignView` with the design, under the active price book. The
single-mount guard is unchanged. Nothing in the view can write: no save, share, preset or contact request.

### d5. The detail page links to the version on screen, in a new tab

The link carries the version switch's current choice (none when there is one readable copy). A new tab keeps the
detail page where it was [inf].

### d6. The proxy's staff family admits the fifth segment `3d`

`isStaffPath` is extended for `/{locale}/staff/kitchens/{id}/3d`, so the page carries the staff headers; no other
fifth segment, nothing longer and no case variant is admitted. The matcher needs no new literal: its generic pattern
excludes only paths whose last segment ends in a static extension (`proxy.ts:91-93`), the last segment here is `3d`,
and a design id is `[A-Za-z0-9_-]{21}` with no dot [doc: `0020_create_staff_audit_events.sql:65`'s design-id shape].
A literal may still be added for symmetry with `:94-97`; it is optional.

### d7. No share link is minted, and `/s/{token}` is untouched

[owner, relayed]. The share view's server page, which reads no cookie (ADR 0114 G5), is not reused; only its client
component is.

## Alternatives considered

| Alternative | Why not |
| --- | --- |
| **The 3D page reads the existing `GET /api/staff/kitchens/{id}` (row `kitchen-opened`)** | Fewer files and no new endpoint, and it matches "as the detail page does" most literally. Not chosen because the audit log could not tell a 3D view from a page open, nor which copy was viewed, and because the 3D page would receive the client's contact details, the notes and the estimates it never shows. **Recorded as the fallback** if the security read prefers no new endpoint. |
| **The server page reads the kitchen and writes the row during render** | A render must not write (`current-session.ts:33-34`). |
| **Mint a share link, or reuse the shop's frozen link** | Ruled out by the owner; and the frozen link's plaintext is not stored, only its hash. |
| **A `?view=3d` mode of the detail page** | The detail page deliberately mounts no editor screen (`staff/staff-kitchen-view.tsx:38-43`); a full-screen configurator inside the staff frame needs its own document. |
| **Mount `ConfigureScreen` directly in a staff file** | Widens the single-mount guard for no gain; `SharedDesignView` already is the read-only door. |

## Sweep (dates)

- **ADR 0173 (2026-10-20) P-L3-2, P-L3-3, P-L3-4** — staff routes and the proxy family; the audit fails closed;
  client-deleted refused, hidden shown. d1, d2 and d6 inherit them.
- **ADR 0174 (2026-10-20) O-L3-1** — what the detail page displays. Unchanged; the 3D view displays the kitchen only.
- **ADR 0114 G5 and decision 5** — the share view authorises nothing. Unchanged.
- **ADR 0165 (2026-10-17)** — the shop opens the as-sent kitchen in the share view. Precedent for d4.
- **ADR 0156** — read limiters fail open, account buckets for staff reads fail closed (as built). Unchanged.

No record says the opposite of the 2026-11-13 ruling.

## What is still inference, and what would falsify it

- The shared variant's price bar prices the shown copy with today's book; the detail page deliberately omits such a
  figure beside the sent estimates (`staff/staff-kitchen-view.tsx:294-296`). Accepted here because the 3D view is a
  separate page and the shop's frozen link already shows the same thing [inf: whether the shared variant draws a price
  bar was not verified]. Falsified, and to revisit, if staff read that figure as the quote.
- The configurator's language menu builds a locale-free path (`configure-screen.tsx:207-214`); under `/staff` its
  behaviour is unverified (plan W3b-7, R4).
- Opening in a new tab is a usability guess. Falsified by the owner preferring same-tab with a back link.

## Consequences

- A sixth kitchen action in the audit list; the audit page's labels in both locales.
- One more staff route family member in `proxy.ts`.
- One new endpoint whose body is a design document; the security read checks it carries nothing else.
