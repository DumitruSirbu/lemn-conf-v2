# ADR 0181 — A kitchen card's thumbnail is captured in the editor after a save, stored in its own table for the current revision, and served privately to its owner

Status: **Proposed** (2026-11-13). A security read is owed before wave W4a is dispatched (a new table and grant, an
upload of client-made bytes, a new read route). Nothing is built; migration `0030` does not exist yet and will be
**unapplied anywhere** when written.
Date: 2026-11-13
Type: Decision record (storage, data path, capture)
Milestone: M11 — [`M11-owner-feedback-2026-11-07.md`](../milestones/M11-owner-feedback-2026-11-07.md), waves W4a, W4b, W4c

**Evidence tiers.** **[owner, relayed]**, **[doc]**, **[src]** (at `12266a02`), **[inf]**, as in ADR 0179.

## Context

Owner feedback item 3 (2026-11-07): every card on "Bucătăriile mele" shows a striped placeholder; the owner wants a
picture of the actual kitchen rendered from the 3D scene [doc: `docs/OWNER_FEEDBACK.md`, item 3]. The ruling of
2026-11-13 [owner, relayed]: **capture on save, store it: the browser renders a small image when the kitchen saves and
the server stores it (new storage, so an ADR and a migration first; the add-only resource rule applies). A kitchen saved
before this exists keeps the placeholder until its next save.**

What exists:

- The placeholder was a recorded deferral: "Striped placeholder only, decorative (`aria-hidden`), no label text.
  Thumbnails are a later decision" [doc: `docs/milestones/M8B-account-screens-lot2-plan.md:471`, row C2; src:
  `account/kitchens/kitchens.module.css:83-97`, `kitchen-card.tsx:34-35`, `:77`].
- Presets already capture a thumbnail in the editor at save: one 1280 × 960 frame at the overview camera, at most
  512 KiB, WebP then PNG then JPEG, magic bytes and header dimensions checked on the server, stored in a `bytea` column,
  a stale revision refused with `409` [doc: ADR 0112 d6 and Amendment A d3, d4; src:
  `scene/capture-scene-image.ts:1-71`; `preset/preset-limits.ts:9-16`; migration `0011_create_presets.sql:81-84`].
- The capture is registered only by the editor's canvas, "so a view-only scene (the review, a shared link) offers no
  capture" [src: `scene/scene-capture-registration.ts:48-51`]. It hides overlays by name literals [src: `:28-32`],
  recorded as a hazard in backlog 271 [doc: `docs/backlog/open.md:3280`].
- The preset image route is public and cacheable for 60 s [src: `app/api/presets/[id]/image/route.ts:23-28`].
- Saving is autosave only [doc: ADR 0172 Amendment H, O1]. A design's revision is a `bigint` incremented by each save
  [doc: migration `0004_add_design_revision.sql:7-14`].
- Designs are soft-deleted and hidden by marks; the application role holds no `DELETE` on `designs` [doc: migration
  `0016_add_design_dashboard_columns.sql:21-27`].
- The account pages' CSP admits same-origin images [src: `lib/security-headers.ts:159`]; account answers are
  `private, no-store` [src: `lib/server/account/account-responses.ts:26`].

## Decision

### d1. The picture is captured in the editor, after a save the server confirmed, for an account's design only

When the save path confirms a saved revision for a design owned by the signed-in account, the editor's registered
snapshotter draws one frame and the client uploads it. Nothing is captured on the review, contact, done, share, staff or
room screens, and nothing for a visitor's design with no account. A capture never delays, blocks or fails a save.

### d2. Throttled, newest revision wins [inf, the ruling's unaddressed half]

The ruling says "when the kitchen saves"; autosave saves many times a minute while editing. So: at most one capture and
upload in flight; a newer saved revision replaces a pending older one; upload starts at least
`THUMBNAIL_MIN_INTERVAL_MS` apart (one named constant, 10 s proposed), with a trailing upload of the newest saved
revision. *Falsified* if the owner wants every save pictured; then the constant goes to zero and the rest holds.

### d3. Storage: a new table, `design_thumbnails`, in the existing database

Columns: `design_id` (primary key, `references designs(id) on delete cascade`), `revision` (`bigint`, the revision the
image depicts), `image` (`bytea`, between 1 and 262 144 bytes), `image_type` (one of `image/webp`, `image/png`,
`image/jpeg`), `captured_at`. Migration `0030_create_design_thumbnails.sql` (number provisional until the branch
merges), add-only and idempotent. Grant, the owner's step after the migration and before the code that reads it:
`SELECT, INSERT, UPDATE (revision, image, image_type, captured_at)`; no `DELETE`, nothing to `PUBLIC`.

### d4. Size and format

640 × 480 (4:3, the preset capture's aspect at half its pixels), the preset's encoding ladder (WebP, then PNG, then
JPEG at falling quality), a domain cap of 128 KiB, header dimensions checked exactly. The camera rule is the preset's,
unchanged (`overviewFittedToFrame` and the cutaway); only the pixel size changes [inf for the figures: the card is
104 × 78 on a phone and 200 px tall on a desktop, `kitchens.module.css:85-89`, `:493-497`; 480 px covers 200 px at a
device pixel ratio of 2. Falsified by a visibly soft picture on a desktop card].

### d5. Upload: `PUT /api/designs/{id}/thumbnail`, the save's credential, the current revision

Body `{ revision, imageType, base64 }`. Authorised by exactly the save's credential (`saveCredentialOf`: the design's
write token, or the session of the account that owns it [src: `app/api/designs/[id]/route.ts:206-216`]), cross-site
guarded, bounded, then a per-account bucket that fails closed (ADR 0156), then the image check, then one statement that
writes only when the design has an account, is not deleted or hidden, is at that revision now, and matches the
credential's arm: for the write-token arm, the design's stored token hash (the save's own predicate); for the session
arm, `designs.account_id` equal to the session's account. `saveCredentialOf` tries the token arm first [src:
`route.ts:210-216`], so the token arm, which carries no account, is the common signed-in case; the predicate cannot
require a session account. An existing row is replaced only by a greater revision. A stale revision answers `409`;
every credential failure answers the same `404` as an unknown id. The bucket's subject is the session's account on
the session arm and the network on the token arm [inf: ADR 0156's two subject constructors].

### d6. Read: `GET /api/account/kitchens/{id}/thumbnail`, private

Answers only the session's own kitchens, by the same predicate as the kitchens list; one `404` for every refusal
(foreign, deleted, hidden, malformed, unknown, no session, a staff session). Headers: `Cache-Control: private,
no-store`, `X-Content-Type-Options: nosniff`, `Content-Type` from the closed list only, `Content-Disposition: inline`,
`Cross-Origin-Resource-Policy: same-origin`. The kitchens list answer gains `thumbnailRevision: string | null`, so a
kitchen with no picture causes no request, and the URL carries the revision.

### d7. The card

An `<img alt="">` over the stripes when a picture exists; the stripes alone otherwise, and when the image fails. A
kitchen saved before W4 ships keeps the placeholder until its next save [owner, relayed]; no backfill.

### d8. Backlog 271 is closed by W4b

The adapter exports the overlay node names (or a helper that hides them) and the capture consumes them, so a rename
cannot put selection outlines on every customer's card.

## Alternatives considered

| Alternative | Why not |
| --- | --- |
| **An object store (for example Vercel Blob)** | A new provisioned service and a new secret, both owner actions, for images that fit in Postgres at this size; and a second place for a client's data to be erased from. |
| **Columns on `designs`** | Every `designs` read and the nightly designs export (a scoped select of that table, ADR 0012) would carry or have to exclude the bytes; a separate table keeps them apart and is add-only. |
| **Capture on the server** | No browser and no WebGL on the server; the rig (`/internal/scene-shot`) is a development tool, not a production renderer. |
| **Capture on demand when the list is opened** | The list has no 3D scene; it would need a hidden renderer per card on the list page. |
| **Every autosave uploads** | The ruling's literal reading; d2's throttle keeps its intent at a bounded cost. Recorded as d2's falsifier. |
| **Public, cacheable like the preset image** | A kitchen is the client's private data; account answers are `private, no-store`. A cached copy would survive sign-out on a shared device. |
| **`private, max-age` keyed by the revision in the URL** | Lighter on repeat visits; not chosen for the same sign-out reason. Revisit if the list's load time is a complaint. |
| **Copy the picture on Duplicate** | Not asked; the copy shows the placeholder until its own next save [inf]. |

## Sweep (dates)

- **ADR 0112 (2026-09-11) d6, Amendment A (2026-10-17) d3 to d5** — the preset capture and its server checks are
  reused; this record **departs** on storage (own table) and caching (private). It does not amend 0112, whose preset
  rules are unchanged.
- **Lot 2 plan C2 (`M8B-account-screens-lot2-plan.md:471`)** — "Thumbnails are a later decision". This is that decision.
- **ADR 0172 D9 and Amendment H O1 (2026-10-20)** — the save credential; autosave only. Used by d1, d2, d5.
- **ADR 0020, ADR 0042 Amendment A (2026-11-12)** — a migration file is not an applied migration; the ledger. The
  migration and grant are owner steps on preview and production before W4c ships.
- **ADR 0156 (2026-10-10)** — writes fail closed. d5's bucket.
- **ADR 0012** — the nightly export is a scoped select of `designs`; thumbnails are not in it, and a restored database
  shows placeholders until each kitchen's next save [inf; acceptable because the picture is derived].

No record says the opposite of the 2026-11-13 ruling.

## What is still inference, and what would falsify it

- d2's interval and d4's figures (see each).
- Thumbnails are not in the client's own export (O4 keeps profile and kitchens; the picture is derivable from the
  kitchen). Falsified if the owner or the security read counts the picture as data the client must receive.
- A card may show a picture a few seconds older than the last edit when the tab closed before the trailing upload.
  Accepted.

## Consequences

- One migration and one grant (owner actions), one store, two routes, one capture trigger, a card change.
- Whatever hard-deletes a design row removes its picture through the cascade. The application role cannot delete a
  design (soft delete only, `0016:24-27`), so a client-deleted or hidden kitchen keeps its picture row as it keeps its
  document, and d6's read path refuses it [inf: how account erasure removes designs was not read; the security read
  checks that it reaches this table].
- Backlog 217 (the configurator's own summary-card placeholder) and share-link pictures stay out of scope; this table
  could serve them later.
