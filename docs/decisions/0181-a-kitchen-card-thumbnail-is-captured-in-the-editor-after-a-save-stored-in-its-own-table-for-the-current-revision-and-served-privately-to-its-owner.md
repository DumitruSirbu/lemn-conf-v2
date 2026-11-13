# ADR 0181 — A kitchen card's thumbnail is captured in the editor after a save, stored in its own table for the current revision, and served privately to its owner

Status: **Accepted** (2026-11-13), after the owner's rulings and the security read; see *Acceptance, 2026-11-13* at the
end. Proposed the same day. Nothing is built; migration `0030` does not exist yet and will be **unapplied anywhere**
when written.
Date: 2026-11-13
Type: Decision record (storage, data path, capture)
Milestone: M11 — [`M11-owner-feedback-2026-11-07.md`](../milestones/M11-owner-feedback-2026-11-07.md), waves W4a, W4b, W4c

**Evidence tiers.** **[owner, relayed]**, **[sec, relayed]**, **[doc]**, **[src]** (at `607af1db`), **[inf]**, as in
ADR 0179.

## Context

Owner feedback item 3 (2026-11-07): every card on "Bucătăriile mele" shows a striped placeholder; the owner wants a
picture of the actual kitchen rendered from the 3D scene [doc: `docs/OWNER_FEEDBACK.md`, item 3]. The rulings [owner,
relayed]:

- **First round:** capture on save, store it: the browser renders a small image when the kitchen saves and the server
  stores it (new storage, so an ADR and a migration first; the add-only resource rule applies). A kitchen saved before
  this exists keeps the placeholder until its next save.
- **Third round:** the picture is deleted together with the kitchen, in the same statement that marks the kitchen
  deleted (a `DELETE` grant on the new table). A hidden kitchen keeps its picture.

What exists:

- The placeholder was a recorded deferral: "Striped placeholder only, decorative (`aria-hidden`), no label text.
  Thumbnails are a later decision" [doc: `docs/milestones/M8B-account-screens-lot2-plan.md:471`, row C2; src:
  `account/kitchens/kitchens.module.css:83-97`, `kitchen-card.tsx:34-35`, `:77`].
- Presets already capture a thumbnail in the editor at save: one 1280 × 960 frame at the overview camera, at most
  512 KiB, WebP then PNG then JPEG, magic bytes and header dimensions checked on the server, stored in a `bytea` column,
  a stale revision refused with `409` [doc: ADR 0112 d6 and Amendment A d3, d4; src:
  `scene/capture-scene-image.ts:1-71`; `preset/preset-limits.ts:9-16`; migration `0011_create_presets.sql:81-84`]. The
  preset body's base64 is judged strictly: canonical alphabet, length a multiple of four, and a round trip [src:
  `lib/server/preset/preset-save-body.ts:75`, `:178-186`].
- **The capture registration claims more than it does.** Its comment says it "is mounted by the editor's canvas only,
  so a view-only scene (the review, a shared link) offers no capture" [src: `scene/scene-capture-registration.ts:48-51`].
  The review's view-only canvas indeed mounts none, but `KitchenCanvas` mounts `SceneCaptureRegistration`
  unconditionally [src: `scene/kitchen-canvas.tsx:43`], and `ConfigureScreen` mounts `KitchenCanvas` in **every**
  variant [src: `app/configurator/configure/configure-screen.tsx:225`], so the share view (`/s/{token}`) and the staff 3D
  view (ADR 0180) register a capture too [sec, relayed; F6]. It hides overlays by name literals [src: `:28-32`],
  recorded as a hazard in backlog 271 [doc: `docs/backlog/open.md:3280`].
- The preset image route is public and cacheable for 60 s [src: `app/api/presets/[id]/image/route.ts:23-28`]. Its
  reads have their own fail-open bucket, apart from the 600 an hour pages and design reads share [src:
  `lib/server/rate-limit/limit-policy.ts:86-94`, `:303-306`]. The proxy gives that one path the closed image policy
  `default-src 'none'; sandbox`, enforced whatever the page policy's mode [src: `proxy.ts:133-140`, `:378-391`;
  `lib/security-headers.ts:122-129`].
- A save is judged by a network-block bucket first, then a bucket for its credential: the write token's hash, or the
  account [src: `lib/server/rate-limit/judge-save-request.ts:42-81`]. Purposes and their policies are code constants
  [src: `limit-policy.ts:638-668`, `:689-770`, `:873-878`].
- A save tells a conflict (`409`) only to a caller whose credential matched; anyone else gets the refusal that says
  nothing about whether the design exists [src: `packages/persistence/src/neon-configuration-repository.ts:400-412`].
- The write-token cookie is scoped by name and by **path** to `/api/designs/{id}` [src: `lib/server/write-token.ts:49`,
  `:115-117`], so only a request under that path carries it.
- Saving is autosave only [doc: ADR 0172 Amendment H, O1]. A design's revision is a `bigint` incremented by each save
  [doc: migration `0004_add_design_revision.sql:7-14`].
- Designs are soft-deleted and hidden by marks; the application role holds no `DELETE` on `designs` [doc: migration
  `0016_add_design_dashboard_columns.sql:21-27`]. The client's delete is one statement that marks the design deleted
  and revokes its share link in a second CTE [src: `packages/persistence/src/neon-account-kitchen-store.ts:330-362`,
  the mark at `:345`, the revoke at `:351`].
- The account pages' CSP admits same-origin images [src: `lib/security-headers.ts:159`]; account answers are
  `private, no-store` [src: `lib/server/account/account-responses.ts:26`].

## Decision

### d1. The picture is captured in the editor, after a save the server confirmed, for an account's design only

The **trigger**, not the registration, decides [sec, relayed; F6]. An upload starts only when all three hold: the
screen is the **owner** variant of the configurator (never `shared`: not the share view, not the staff 3D view); the
save path has **confirmed** a saved revision; and the design belongs to an account (the design read's ownership
answer). Nothing is captured on the review, contact, done, share, staff or room screens, and nothing for a visitor's
design with no account. A capture never delays, blocks or fails a save. The comment at
`scene-capture-registration.ts:48-51` is corrected in W4b to say what is true.

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
`SELECT, INSERT, UPDATE (revision, image, image_type, captured_at), DELETE` on `design_thumbnails`; **no**
`UPDATE (design_id)`, nothing to `PUBLIC`, no `WITH GRANT OPTION`. The application-role privilege test
(`packages/persistence/tests/application-role-privileges.test.ts`) is extended to assert exactly that: `DELETE` present,
`UPDATE` on `design_id` absent [sec, relayed; F5]. (The Proposed text said "no `DELETE`"; the third-round ruling
reverses it.)

### d4. Size and format

640 × 480 (4:3, the preset capture's aspect at half its pixels), the preset's encoding ladder (WebP, then PNG, then
JPEG at falling quality), a domain cap of 128 KiB, header dimensions checked exactly. An animated image is refused: a
PNG carrying an `acTL` chunk, and a WebP whose `VP8X` header sets the animation flag [sec, relayed; F3, optional,
taken: the check reads a few header bytes]. The camera rule is the preset's, unchanged (`overviewFittedToFrame` and the
cutaway); only the pixel size changes [inf for the figures: the card is 104 × 78 on a phone and 200 px tall on a
desktop, `kitchens.module.css:85-89`, `:503`; 480 px covers 200 px at a device pixel ratio of 2. Falsified by a
visibly soft picture on a desktop card].

### d5. Upload: `PUT /api/designs/{id}/thumbnail`, the save's credential, the current revision

The route **stays under `/api/designs/{id}/`**: the write-token cookie's path is `/api/designs/{id}`, so a route
anywhere else would never receive the token and the token arm would fail for every visitor-style credential [src:
`write-token.ts:49`, `:115-117`].

Order, in the route itself:

1. `isCrossSiteRequest` first, refused before anything is counted or read [sec, relayed; F4];
2. the credential, exactly the save's (`saveCredentialOf`: the design's write token, or the session of the account
   that owns it [src: `app/api/designs/[id]/route.ts:206-216`]); none is the one `404`;
3. the buckets, **mirroring `judgeSaveRequest`** and failing closed (ADR 0156) [sec, relayed; F1]: a network-block
   step, then the credential's own bucket, new code-constant purposes `thumbnail-by-credential` (subject: the write
   token's hash, `subjectOfWriteCredentialHash`) and `thumbnail-by-account` (subject: the account,
   `subjectOfAccountId`). The block step has its own purpose, `thumbnail-by-block`, so a picture never spends a save's
   budget [inf; d1 says a capture never fails a save];
4. the body to a bound **derived from the cap**: the base64 length of 128 KiB (`4 × ⌈131 072 / 3⌉`) plus a fixed
   allowance for the JSON members, computed from the constants, never a literal;
5. `{ revision, imageType, base64 }` parsed; the base64 judged **strictly**, as the preset body is (canonical alphabet,
   length a multiple of four, round trip) [sec, relayed; F4]; then d4's image check;
6. one statement that writes only when the design has an account, is not deleted or hidden, is at that revision now,
   and matches the credential's arm: for the write-token arm, the design's stored token hash (the save's own
   predicate); for the session arm, `designs.account_id` equal to the session's account. `saveCredentialOf` tries the
   token arm first [src: `route.ts:210-216`], so the token arm, which carries no account, is the common signed-in case.
   An existing row is replaced only by a greater revision.

Answers: `204` on a write. **`409` only when the credential matched** and the revision is not the current one; every
other failure (no credential, a foreign token, another account's session, a design with no account, deleted, hidden,
unknown) is the same `404` as an unknown id, so a stale answer is never an oracle for a design's existence [sec,
relayed; F4; the save's rule, `neon-configuration-repository.ts:409-411`].

### d6. Read: `GET /api/account/kitchens/{id}/thumbnail`, private

Order [sec, relayed; F2]: `isCrossSiteRequest` first; then **its own fail-open read bucket** by network block (a new
purpose, as preset images have `preset-read-by-block`, so a list of cards does not spend the pages' 600); then the
session and `design.read.own`; then one statement that joins `design_thumbnails` to `designs` on
`designs.account_id = <the session's account>`, `hidden_by_client_at is null` and `deleted_by_client_at is null`. One
`404` for every refusal after the cross-site guard (foreign, deleted, hidden, malformed, unknown, no picture, no
session, a staff session); a cross-site request gets `crossSiteResponse()`, as the account routes answer it; a
malformed id issues no query.

Headers: `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff`, `Content-Type` from the closed list
only (a stored type outside it is the `404`), `Content-Disposition: inline`, `Cross-Origin-Resource-Policy:
same-origin`, and **the closed image policy** `default-src 'none'; sandbox`, set by the route and again by a proxy branch
for this path, as the preset image path has [sec, relayed; F3; `proxy.ts:133-140`, `:378-391`]. The kitchens list
answer gains `thumbnailRevision: string | null`, so a kitchen with no picture causes no request, and the URL carries the
revision.

### d7. The card

An `<img alt="">` over the stripes when a picture exists; the stripes alone otherwise, and when the image fails. A
kitchen saved before W4 ships keeps the placeholder until its next save [owner, relayed]; no backfill.

### d8. Backlog 271 is closed by W4b

The adapter exports the overlay node names (or a helper that hides them) and the capture consumes them, so a rename
cannot put selection outlines on every customer's card.

### d9. Erasure: the picture goes with the kitchen's delete; a hidden kitchen keeps it

The client's delete statement gains a CTE that deletes the `design_thumbnails` row of the design it marks, in the same
statement, as it already revokes the share link [owner, relayed, third round; src: `neon-account-kitchen-store.ts:345`,
`:351`]. A delete that marks nothing deletes nothing. Hiding a sent kitchen leaves its picture (d6 refuses to serve
it). Whatever hard-deletes a design row removes its picture through the cascade.

## Alternatives considered

| Alternative | Why not |
| --- | --- |
| **An object store (for example Vercel Blob)** | A new provisioned service and a new secret, both owner actions, for images that fit in Postgres at this size; and a second place for a client's data to be erased from. |
| **Columns on `designs`** | Every `designs` read and the nightly designs export (a scoped select of that table, ADR 0012) would carry or have to exclude the bytes; a separate table keeps them apart and is add-only. |
| **Capture on the server** | No browser and no WebGL on the server; the rig (`/internal/scene-shot`) is a development tool, not a production renderer. |
| **Capture on demand when the list is opened** | The list has no 3D scene; it would need a hidden renderer per card on the list page. |
| **Every autosave uploads** | The ruling's literal reading; d2's throttle keeps its intent at a bounded cost. Recorded as d2's falsifier. |
| **Rely on where the capture is registered** (the Proposed text) | The registration is mounted in every configurator variant (F6); only the trigger's three conditions keep the share and staff views from uploading. |
| **A network-only subject for the token arm** (the Proposed text) | One shared network would throttle every visitor-style editor behind it, and one editor could be throttled by others; the save's own pairing (block, then credential) is the precedent [sec, relayed; F1]. |
| **Share the save's buckets** | A burst of pictures would spend the saves' budget, against d1. |
| **Public, cacheable like the preset image** | A kitchen is the client's private data; account answers are `private, no-store`. A cached copy would survive sign-out on a shared device. |
| **`private, max-age` keyed by the revision in the URL** | Lighter on repeat visits; not chosen for the same sign-out reason. Revisit if the list's load time is a complaint. |
| **Keep the picture after the client deletes the kitchen** (the Proposed text) | Ruled out, third round [owner, relayed]. |
| **Copy the picture on Duplicate** | Not asked; the copy shows the placeholder until its own next save [inf]. |

## Sweep (dates)

- **ADR 0112 (2026-09-11) d6, Amendment A (2026-10-17) d3 to d5** — the preset capture, its server checks and its
  closed image policy are reused; this record **departs** on storage (own table) and caching (private). It does not
  amend 0112, whose preset rules are unchanged.
- **Lot 2 plan C2 (`M8B-account-screens-lot2-plan.md:471`)** — "Thumbnails are a later decision". This is that decision.
- **ADR 0172 D9 and Amendment H O1 (2026-10-20)** — the save credential; autosave only. Used by d1, d2, d5.
- **ADR 0020, ADR 0042 Amendment A (2026-11-12)** — a migration file is not an applied migration; the ledger. The
  migration and grant are owner steps on preview and production before W4c ships.
- **ADR 0156 (2026-10-10)** — writes fail closed, reads fail open; subjects come from two constructors. d5's and d6's
  buckets.
- **ADR 0012** — the nightly export is a scoped select of `designs`; thumbnails are not in it, and a restored database
  shows placeholders until each kitchen's next save [inf; acceptable because the picture is derived].

No record says the opposite of the 2026-11-13 rulings.

## What is still inference, and what would falsify it

- d2's interval, d4's figures and d5's separate block bucket (see each).
- Thumbnails are not in the client's own export (O4 keeps profile and kitchens; the picture is derivable from the
  kitchen). Falsified if the owner or a later review counts the picture as data the client must receive.
- How account erasure removes designs was not read; if it hard-deletes them, the cascade removes the pictures. W4a's
  security reviewer checks it.
- A card may show a picture a few seconds older than the last edit when the tab closed before the trailing upload.
  Accepted.

## Consequences

- One migration and one grant (owner actions), one store, two routes, one proxy branch, one capture trigger, a card
  change, and one more CTE in the client's delete statement.
- Three new limiter purposes for the upload and one for the read, each a code constant with a production and an e2e
  twin.
- Backlog 217 (the configurator's own summary-card placeholder) and share-link pictures stay out of scope; this table
  could serve them later.

## Acceptance, 2026-11-13

Accepted by the coordinator on 2026-11-13, once the changes the security read required were in this text [relayed]:
F1 (the upload's buckets mirror the save's; d5), F2 (the read route's own fail-open bucket, the cross-site guard,
`design.read.own`, the join and marks; d6), F3 (the closed image policy through a proxy branch; animated images
refused; d4, d6), F4 (`409` only for a matched credential, the route's cross-site guard first, strict base64, a bound
derived from the cap; d5), F5 (the `DELETE` grant and the delete in the same statement, the privilege test; d3, d9),
F6 (the trigger, not the registration, keeps the share and staff views from uploading; d1), and the cookie-path
constraint (d5). The owner's third-round ruling on erasure is folded in. The security read found no exploitable design
flaw [sec, relayed].
