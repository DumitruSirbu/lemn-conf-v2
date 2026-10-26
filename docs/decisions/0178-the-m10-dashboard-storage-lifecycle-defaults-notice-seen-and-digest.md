# ADR 0178 — The M10 dashboard's storage and lifecycle: the draft, immediate availability, defaults, the notice marker, seen and the digest

Status: **Proposed** — the architect's rulings recorded by W0; **a security reviewer reads this record before it is Accepted** (it fixes tables, grants, audit rules and who may write what; M10 plan §7 W0 tier). A-17, A-21 and the OQ rows implement the owner's 2026-10-26 answers. **Nothing is built; every migration named here is unapplied anywhere.**
Date: 2026-10-26
Type: Decision record (storage and lifecycle)
Milestone: M10 — [`M10-price-dashboard.md`](../milestones/M10-price-dashboard.md) §5, §8.4, §9.2; W0

## Context

**Evidence tier.** Doc-quoted from the M10 plan §5 (A-9 to A-18, A-21), §4 (S-1, S-4, S-15 to S-21, S-27), §6 (the
owner's 2026-10-26 rulings, relayed by the coordinator; quotation marks hold words as relayed, not a verbatim
transcript), §8.4 and §9.2. Source facts the plan cites (for example `designs.revision`, `designs.sent_at`
`neon-account-kitchen-store.ts:428-436`, `capabilities.ts:7-63`, the `0004` header) were not re-read by the scribe, who
ran nothing. Each A-row's reasoning is **[inf]**. Mockup facts cite the frame id and the plan's line.

**No amount or percentage here is approved** (ADR 0001 decision 4; ADR 0100 decision 2).

M10 builds on [ADR 0173](0173-the-staff-area-routes-audit-fail-closed-kitchen-visibility-notes-status-and-pagination-rulings-for-the-lot-3-port.md)'s
P-rows, which are **Proposed, not Accepted**; their acceptance is owed. Pricing seams are in
[ADR 0177](0177-the-m10-pricing-seams-rounding-round-up-percentages-deepening-fixed-size-rows-linked-accessories-and-the-lift-mechanism.md).

## Decisions

### Capability gates

Catalogue, prices, publishing, restore, availability and defaults are gated by `price.edit` (administrators only).
D10 (seen, badge, counter, list) is gated by `contact.read` (operators and administrators). No role work is needed.
Every staff read and write is audited and **fails closed** (ADR 0173 P-L3-3); a write commits its audit row in the same
transaction.

### A-9 — New-kitchen defaults are not the pricing fallback

The **pricing fallback** (book `defaultTierId`, `DEFAULT_MATERIAL_ID`, `DEFAULT_HANDLE`) is fixed and never edited. D9's
**new-kitchen defaults** are stored unversioned, apply immediately (frame D9 [mock L756, L895]) and are **stamped
explicitly** into a design's `settings` when it is created (`generation/shell-design.ts`). Already-saved designs never
read them; a legacy document naming no tier keeps pricing at the fixed fallback. Settles S-16 and, with ADR 0177 A-8,
S-5. The "default item cannot be disabled or deleted" rule [mock L782] refers to the D9 default.

### A-10 — No published version means no price

Every price surface renders no figure through the existing refusal path; the contact route refuses with its existing
unavailable answer; the application never falls back to the sample book. An owner-run seed command publishes the
converted sample book, still `amountsProvisional: true`, as version 1. Tests and local runs seed the same book through a
test-only helper (ADR 0151). Settles S-24.

### A-11 — The notice marker: a database row per design, a (book version, availability revision) pair

The marker is the last pair whose prices the design's owner acknowledged (amended 2026-10-26: under A-17 a price can
change without a new version, e.g. activating a linked accessory adds a line to every kitchen that earns it).

- Written only by a request authorised to edit that design (its write token or its account). **Never written by a save**,
  so it never moves `designs.revision` (which would light D10's badge).
- The notice shows when the design has a marker, the active (version, availability revision) differs from it, and
  `pricesChangedBetween(design, {seenBook, seenAvailability}, {activeBook, currentAvailability})` is true;
  `seenAvailability` is rebuilt from the append-only availability log.
- A design with no marker gets one at the current pair, silently, on its first open. Marker writes come from dismissing
  the notice ("Am înțeles"), completing the C4 sheet, or the first open.
- Rejected: a cookie (a claimed design opens on any device, ADR 0172); the profile (visitors have none). Settles S-17.

### A-12 — Changed after seen

- The seen revision is **one marker per design, shared by all staff** (ADR 0062 Amendment 5: "an operator or
  administrator opening the kitchen … records the current revision as seen"); the UI wording "ai văzut-o" is accepted.
- It lives in its own table beside the per-design request status, **not on `contact_submissions`** (ADR 0153's narrow
  grants).
- With effective-seen = the seen revision, or else the latest submission's `design_revision`, a kitchen is "changed" when
  `designs.revision <> effective-seen`, **compared in SQL only**. The revision stays opaque above SQL, and migration
  `0004` is never edited (its bytes are frozen once applied). Settles S-18. "Sent twice" needs no rule: both submissions
  name the same design.
- Opening the kitchen page sends the revision **the page displayed** (`POST …/seen`, audited), so a save landing between
  load and mark keeps the badge.

### A-13 — The digest

At most one run per calendar day (Europe/Chisinau), claimed idempotently by a day key. A kitchen is eligible when it
changed after seen; it has not been in a digest since it was last seen; `designs.sent_at` is within 30 days; and its
status is not `offer-sent` or `closed`. `designs.sent_at` keeps the **first** send's instant, which is why the 30 days
count from it (OQ-10). No eligible kitchen, no e-mail. Recipients: accounts holding `contact.read` with a confirmed
address. **Security tier (S-21):** the digest prints a customer name taken from the **account profile** (as S3 does), never
from a contact-submission personal column (ADR 0153 decision 1); a kitchen sent without an account prints its request
reference.

### A-14 — Bulk % and its rounding

Every scaled amount (anchor, steps, size prices) becomes `r10(amount × (100 + p) / 100)` (frame D2D [mock L608]; `r10` is
defined in ADR 0177 A-1). A bulk change is one draft group, shown as one expandable row in D7 and D8.

### A-15 — The draft is an ordered change-set, not a second book

Each change names a stable field address (plan §8.4(b)). The candidate book is `apply(activeBook, changes)`, a pure domain
function. ↺ removes one change. Restore adds the archived version's differing fields as changes. Publish stores the
candidate book whole and immutable plus its change summary. Versions are append-only and exactly one is active.

### A-16 — A disabled colour or handle

It is one row in the C4 sheet, whichever level carries it. The customer's choice replaces it **at every level where it
appears** (the kitchen setting and every cabinet override). No ADR 0086 confirmation is owed, because the choice is
explicit. A colour reset caused by a material replacement follows ADR 0057 and is announced ("Culoarea a revenit la …",
C4C). Why [inf]: leaving a disabled colour on some cabinets would leave the price refused with no row to resolve it.
Owner-visible; resolves backlog 285's open point for the architect.

### A-17 — Availability is immediate, unversioned and logged (owner, OQ-2, 2026-10-26)

The owner, as relayed: "switching off, it's not the pricing changes, so it should take effect immediately." This was
**against the architect's recommendation** (at publish). It **supersedes the deactivation-at-publish text of the fix-round
briefs (`…-v2-fixes.md:75`, `…-v2-fixes-2.md:32`) and the mockup dialogs' "Intră în vigoare când publici" [mock L779]**
(S-15, S-27). That text lived in the briefs and the mockup, not in ADR 0062 or backlog 285; the briefs are design history
and are not edited. The mockup's stale D4 hint "bucătăriile salvate cu ea o păstrează, la prețul curent" [mock L693] is
also wrong copy (ADR 0062's third Amendment governs). Neither is carried; wave T1 replaces the dialog copy.

- Disabling or enabling a material, colour, hardware class, handle or accessory is written **on save**, never into the
  draft, to an append-only log `catalogue_availability_changes` (one row per change, monotonically increasing revision;
  the current state is each item's latest row).
- Pricing receives availability **beside** the book (`priceDesign({…, book, availability})`), not inside it, so a published
  version stays immutable. The browser receives `{versionId, book, availability}` together. The contact route prices with
  the **current** availability, so a kitchen using an item disabled mid-session is refused at send
  (`REPLACEMENT_REQUIRED`), never sent at a stale price.
- **Activation requires the item to exist in the active published book**: a row created in the draft (A-18) can be
  activated only after it is published (frame D4 [mock L693]).
- The guards are checked at write time: the D9 default cannot be disabled; the last active option of a group cannot be
  disabled.
- Rejected: availability inside the book via the draft (the architect's recommendation, overruled by the owner); a mutable
  flag on the active version.

### A-18 — Creation and deletion stay book changes, through the draft

Creating a hardware class or a linked accessory, editing a created row's Romanian text, and deleting an unused,
non-default item are **draft changes** and take effect at publish, because they change what the book contains. OQ-2 concerns
switching an item off, not changing the book's rows. At publish the domain re-judges every deletion against the usage
reader; an item that gained a user between draft and publish refuses the **whole** publish, naming the item (frame D7G).
A created row is inactive until published and then activated (A-17). Owner-visible: editing a created row's text
immediately (the mockup comment "Textele … se aplică imediat" [mock L887]) was not ruled and is not taken.

### A-21 — The dashboard authors Romanian text only (owner, OQ-3, 2026-10-26)

The owner, as relayed: "all the translations should be done through files and a separate functionality for this … need
only to set the title … in Romanian, after that translate it using the translator functionality."

- Keyed rows (every shipped row) show their text read-only. A created row carries an authored Romanian `name` and, where
  the row kind has one, a `description`. There is no Russian field and the parser refuses one. This is **partly against
  the recommendation**: keyed read-only as recommended, but no optional Russian field.
- A created row's authored Romanian renders in **both** locales until the deferred translation feature supplies Russian
  (ADR 0174 O-L3-3, unchanged). This **supersedes ADR 0106's rejection of a one-language fallback for created rows only**
  (S-4); keyed rows are unchanged.
- Bounds follow `MAX_BOOK_NAME_LENGTH` and `MAX_BOOK_DESCRIPTION_LENGTH` (`parse-price-book.ts:47-50`). ADR 0106
  Amendment A still binds: authored text may not state an amount, a percentage or "inclus"; M4 judges it and shows an
  inline error. The mockup's RO/RU tabs and "textul apare și în Traduceri" [mock L891] are not carried.

### Other owner answers of 2026-10-26 (relayed)

| Q | Ruling |
| --- | --- |
| OQ-7 | Whole-kitchen handle: "nothing changing here" — accepted as recommended (wave H1, frame C2). |
| OQ-9 | Status reconciliation accepted: Nouă / Contactat / Ofertă trimisă / Închisă; the digest stops at `offer-sent` or `closed` (S-19). |
| OQ-10 | Digest at 08:00 Europe/Chisinau (`0 5 * * *` UTC; 07:00 in winter), 30 days from the first send (`designs.sent_at`). |

## Migrations (lane S, the sole writer of `packages/persistence/` in M10; no `DELETE` is granted on `0025` or `0028`)

`0023` and `0024` stay reserved by M8B Lot 3 (preset sort, invitations); M10 claims `0025`–`0031`. Migrations follow
`docs/runbooks/applying-a-table-migration-and-its-application-role-grant.md`: agents prepare and never run them, the owner
applies them, preview first. The exact grant text is written in each wave.

| Number | Table | Wave | Grant |
| --- | --- | --- | --- |
| 0025 | `create_price_book_versions` (id, label, note, book jsonb object, change_summary jsonb, state `active`/`archived`, published_at, published_by_account_id; one active, by a partial unique index) | S2 | `SELECT`; `INSERT`; `UPDATE (state)` |
| 0026 | `create_price_book_draft` (single row: revision bigint, changes jsonb array, base_version_id, updated_at, updated_by_account_id) | S2 | `SELECT, INSERT, UPDATE` |
| 0027 | `create_kitchen_defaults` (single row: revision, defaults jsonb, saved_at, saved_by_account_id) | S3 | `SELECT, INSERT, UPDATE` |
| 0028 | `create_catalogue_availability_changes` (revision bigserial pk, item_kind, item_id, active boolean, changed_at, changed_by_account_id) | S2b | `SELECT, INSERT` only (append-only) |
| 0029 | `create_design_staff_seen` (design_id pk, seen_revision bigint, seen_by_account_id, seen_at) | S4 | `SELECT, INSERT, UPDATE` |
| 0030 | `create_staff_change_digest` (rounds: day_key unique, ran_at, sent_count; entries: round_id, design_id, revision) | S4 | `SELECT, INSERT, UPDATE (rounds.sent_count)` |
| 0031 | `create_design_price_notices` (design_id pk, acknowledged_version_id, acknowledged_availability_revision, acknowledged_at) | S5 | `SELECT, INSERT, UPDATE` |

The persistence ports are never given `null`; the book is `unknown` (jsonb) so the store never imports a book type;
every write takes an audit entry and commits it in its own transaction (plan §8.4(c)).

## Staff audit actions

New closed-list entries in `staff-audit-action.ts`, written by X0, detail shapes holding ids, codes and counts and never
names or free text: `price-draft-changed` (the change kind, including created / text / deleted), `price-draft-reverted`,
`price-bulk-changed`, `price-published`, `price-restored-to-draft`, `catalogue-item-activation-changed` (immediate, A-17),
`kitchen-defaults-saved`, `kitchen-seen`, `price-catalogue-viewed`. The `action` column is a shape check (`0020` header,
per the plan), so no migration is owed.

## Alternatives considered

Stated beside each ruling. The three where an owner answer displaced a recommendation: A-17 (availability at publish),
A-21 (an optional Russian field), and OQ-4 in ADR 0177 A-19.

## Consequences

- Waves S1–S6, R1–R5, K1–K4, H1–H2, M1–M4 and U1–U6 implement this record; nothing is built.
- ADR 0062's open points for the architect (seen-revision storage, digest time and provider, the 30-day origin, a
  kitchen sent twice) are answered by A-12 and A-13. "Who can review" is answered by using the existing capabilities
  (plan OQ-14); the owner confirms at close.
- ADR 0173's acceptance and a security read of this record are owed before the S and R lanes merge.
- Owner flags still open and blocking nothing: OQ-5a and OQ-4a (ADR 0177); the close-only questions of plan §6.2 (OQ-8,
  OQ-11, OQ-12, OQ-13, OQ-14). Answers are recorded below as dated amendments.
