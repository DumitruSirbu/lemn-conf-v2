# ADR 0178 — The M10 dashboard's storage and lifecycle: the draft, immediate availability, defaults, the notice marker, seen and the digest

Status: **Accepted** (security-reviewed 2026-10-26; findings F1–F10 applied in this body, accepted by the coordinator). The architect's rulings recorded by W0; A-17, A-21 and the OQ rows implement the owner's 2026-10-26 answers. **Nothing is built; every migration named here is unapplied anywhere.**
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
**The audit rule, restated here so this record does not depend on ADR 0173's acceptance (it restates P-L3-3):** every
staff read and write is audited and **fails closed** — if the audit row cannot be written, the read or write does not
happen. A write commits its audit row **in the same transaction** as the write.

**Writes with no staff actor, named so none is mistaken for an unaudited staff write:** the customer's notice marker (A-11;
a customer request, not a staff write); the digest (recorded in its own rounds and entries tables, A-13); the A-10 seed
(run by the owner with the owner's account id passed as an argument for `published_by_account_id`; it refuses when any
version already exists).

**Every audit action has a closed key list** (kind, ids, codes, counts). Never created-row text, never a version label or
note, never a name or free text.

**Created-row text and ids (judged in M4).** Created-row text follows the design-notes text rule of migration `0021`
(per the reviewer's finding F5): NFC-normalised; control and bidi-override characters refused; non-empty after trim.
Created ids are minted by the server, strictly shaped, and unique against built-in and keyed ids.

### A-9 — New-kitchen defaults are not the pricing fallback

The **pricing fallback** (book `defaultTierId`, `DEFAULT_MATERIAL_ID`, `DEFAULT_HANDLE`) is fixed and never edited. D9's
**new-kitchen defaults** are stored unversioned, apply immediately (frame D9 [mock L756, L895]) and are **stamped
explicitly** into a design's `settings` when it is created (`generation/shell-design.ts`). Already-saved designs never
read them; a legacy document naming no tier keeps pricing at the fixed fallback. Settles S-16 and, with ADR 0177 A-8,
S-5. The "default item cannot be disabled or deleted" rule [mock L782] refers to the D9 default.

### A-10 — No published version means no price

Every price surface renders no figure through the existing refusal path; the contact route refuses with its existing
unavailable answer; the application never falls back to the sample book. An owner-run seed command publishes the
converted sample book, still `amountsProvisional: true`, as version 1; it takes the owner's account id as an argument (for `published_by_account_id`) and refuses when any version
exists (F3). Tests and local runs seed the same book through a
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
- **Route rules (F8).** The price-notice routes mirror the save route's authorisation and use its cross-site refusal and
  JSON-only body checks. The first-open write is insert-if-absent and never overwrites. Acknowledge records the pair the
  page displayed, **validated server-side** (the version exists; the revision ≤ the current one). GET requires the same
  edit-level authorisation. Staff opens and share-link views never write the marker.
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
  load and mark keeps the badge. A seen mark never lowers the stored seen revision: the store writes `seen_revision = greatest(existing, displayed)` in SQL, and `seen_by_account_id` and `seen_at` change only when the displayed revision is strictly greater, so they always describe the kept revision; a stale page marking R1 after R2 leaves R2, so neither the badge nor the digest's revision-based hold (A-13) can regress (K1 QA, coordinator's ruling, 2026-10-26). **Guards (F9):** the mark refuses a displayed revision greater than the current one, in
  SQL (`where $displayed::bigint <= designs.revision`); ADR 0173 P-L3-4's staff-list visibility applies — the mark is accepted for any design not deleted by the client that is sent or held by an account, and a design outside that is 404 (S1 QA, coordinator's ruling, 2026-10-26); the changed badge, the counter and the digest still consider sent designs only (`sent_at is not null`); the revision's digit shape is validated before SQL (400, not 500). The polled changed-count read is
  **exempt from per-poll audit**; every other staff read and write stays audited.

### A-13 — The digest

At most one run per calendar day (Europe/Chisinau), claimed idempotently by a day key. A kitchen is eligible when it
changed after seen; it has not been in a digest since it was last seen — judged on **revisions in SQL**: no digest **entry** exists for the design with `revision >` its effective seen revision (the seen revision, else the latest submission's `design_revision`), so a claimed day with no entries holds nothing and a stale seen mark cannot re-send a digested revision; the domain receives this as `isDigestedSinceSeen` beside `isChangedSinceSeen` and holds no seen or digested instants (K1 review, coordinator's ruling, 2026-10-26); `designs.sent_at` is within the last 720 hours of the passed `now` (`DIGEST_WINDOW_MS`; an exact duration, never `interval '30 days'` or SQL `now()`); and its
status is not `offer-sent` or `closed`. `designs.sent_at` keeps the **first** send's instant, which is why the 30 days
count from it (OQ-10). No eligible kitchen, no e-mail. Recipients: accounts holding `contact.read` with a confirmed
address. **Security tier (S-21):** the digest prints a customer name taken from the **account profile** (as S3 does), never
from a contact-submission personal column (ADR 0153 decision 1); a kitchen sent without an account prints its request
reference.

**Digest hardening (F6).**
- The cron route authenticates only with `isAuthorizedCronRequest` (a `CRON_SECRET` bearer, timing-safe, failing closed
  when unset) and **accepts no parameters**: the day key, now and the recipients all come from the server. It never runs on
  Preview (no `CRON_SECRET` there; no new environment variable).
- Eligibility excludes client-deleted designs (`deleted_by_client_at`, P-L3-4); the same exclusion applies to the D10 list
  and counter.
- It reads `accounts.name` only, never an address or phone. The kitchen name (customer-authored, frame D10D) and every value go
  through the `lead-notification-html.ts` escapeHtml builders. No customer text appears in the subject or headers; the link is
  the staff kitchen URL only.
- The day claim is inserted **before** sending with `ON CONFLICT DO NOTHING`; a failed send loses that day, with no
  re-send.

### A-14 — Bulk % and its rounding

Every scaled amount (anchor, steps, size prices) becomes `r10(amount × (100 + p) / 100)` (frame D2D [mock L608]; `r10` is
defined in ADR 0177 A-1). A bulk change is one draft group, shown as one expandable row in D7 and D8.

### A-15 — The draft is an ordered change-set, not a second book

Each change names a stable field address (plan §8.4(b)). The candidate book is `apply(activeBook, changes)`, a pure domain
function. ↺ removes one change. Restore adds the archived version's differing fields as changes. Publish stores the
candidate book whole and immutable plus its change summary. Versions are fully append-only (no update, no delete) and the
active version is the **newest row** (F7). **Publish computes `apply(activeBook, storedDraft)` on the server and never
accepts a book from the request (F10).** The draft and archived versions are never served on a non-staff route.

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
  draft, to an append-only log `catalogue_availability_changes` (one row per change; the current state is each item's
  latest row).
- **The revision (F1).** The availability revision comes from a **seeded one-row head table**
  `catalogue_availability_head(revision bigint)`, following migration `0009`'s cursor pattern, granted
  `SELECT, UPDATE (revision)`. Each write runs `update … set revision = revision + 1 where revision = $expected returning
  revision` **in the same transaction as the log insert**, and the log row carries that revision. There is **no sequence**,
  the log's `revision` is its primary key and **is** in the log's INSERT grant, written only as the value the head update
  returns inside the same single CTE statement (`with h as (update catalogue_availability_head set revision = revision + 1
  where revision = $expected returning revision) insert into catalogue_availability_changes (revision, …) select h.revision,
  … from h`); there is no trigger and no sequence. The head's revisions are gap-free and commit-ordered; the log's are not,
  because a defaults save or a publish without created rows moves the head without writing a log row. Accepted residual: a
  holder of the application credential could insert a log row at an unused higher revision without moving the head; the
  missing audit row and the head mismatch reveal it. (Amended 2026-10-26 after the X0 logic review.) `changed-meanwhile` is the zero-rows case of the conditional update.
- Pricing receives availability **beside** the book (`priceDesign({…, book, availability})`), not inside it, so a published
  version stays immutable. The browser receives `{versionId, book, availability}` together. The contact route prices with
  the **current** availability, so a kitchen using an item disabled mid-session is refused at send
  (`REPLACEMENT_REQUIRED`), never sent at a stale price.
- **Activation requires the item to exist in the active published book**: a row created in the draft (A-18) can be
  activated only after it is published (frame D4 [mock L693]).
- The guards are checked at write time: the D9 default cannot be disabled; the last active option of a group cannot be
  disabled. **The last-active-option guard and the D9 defaults save both take the head-row lock (F1)**, so neither races an
  availability write. The defaults save refuses an item that is disabled or not in the active book.
- **Publish takes the same head CAS (X0 review M1, M5, 2026-10-26).** `publish` carries `expectedAvailabilityRevision` and
  the items it creates; in its transaction it moves the head once per created item (chained CTEs), writing an
  `active = false` log row for each, or once with no row when it creates nothing. A stale value refuses the whole publish
  `availability-changed-meanwhile`. A created class or accessory is therefore inactive when published, and live only after
  an explicit activation.
- Rejected: availability inside the book via the draft (the architect's recommendation, overruled by the owner); a mutable
  flag on the active version.

### A-18 — Creation and deletion stay book changes, through the draft

Creating a hardware class or a linked accessory, editing a created row's Romanian text, and deleting an unused,
non-default item are **draft changes** and take effect at publish, because they change what the book contains. OQ-2 concerns
switching an item off, not changing the book's rows. At publish the domain re-judges every deletion against the usage
reader **and the stored D9 defaults**, under the head CAS; a deletion of the current default refuses the whole publish
`item-is-default {item}`. An item that gained a user between draft and publish refuses the **whole** publish, naming the item (frame D7G). **(Amended 2026-11-04: the head CAS does not cover usage, and a kitchen can still come to name a deleted item. See the Amendment on a deletion that gains a user.)**
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

## Migrations (lane S, the sole writer of `packages/persistence/` in M10; no `DELETE` is granted anywhere in `0025`–`0031`)

`0023` and `0024` stay reserved by M8B Lot 3 (preset sort, invitations); M10 claims `0025`–`0031`. Migrations follow
`docs/runbooks/applying-a-table-migration-and-its-application-role-grant.md`: agents prepare and never run them, the owner
applies them, preview first. The exact grant text is written in each wave.

| Number | Table | Wave | Grant |
| --- | --- | --- | --- |
| 0025 | `create_price_book_versions` (id, label, note, book jsonb object, change_summary jsonb, published_at, published_by_account_id; **2026-11-04: gains `change_count`, see the last Amendment**; **no `state` column: the active version is the newest row**; length checks on label and note) | S2 | `SELECT, INSERT` only (fully append-only) |
| 0026 | `create_price_book_draft` (a **seeded singleton row**, `0009`'s pattern: revision bigint, changes jsonb array, base_version_id, updated_at, updated_by_account_id) | S2 | `SELECT` + `UPDATE` on named columns; no `INSERT` |
| 0027 | `create_kitchen_defaults` (a **seeded singleton row**: revision, defaults jsonb, saved_at, saved_by_account_id) | S3 | `SELECT` + `UPDATE` on named columns; no `INSERT` |
| 0028 | `create_catalogue_availability_changes` (item_kind, item_id, active boolean, changed_at default now(), changed_by_account_id; the revision is carried from the head row, F1) **and** the seeded one-row `catalogue_availability_head(revision bigint)` | S2b | Log: `SELECT, INSERT (revision, item_kind, item_id, active, changed_by_account_id)` (no `changed_at`). Head: `SELECT, UPDATE (revision)` |
| 0029 | `create_design_staff_seen` (design_id pk, seen_revision bigint, seen_by_account_id, seen_at default now()) | S4 | `SELECT`; `INSERT (design_id, seen_revision, seen_by_account_id)`; `UPDATE (seen_revision, seen_by_account_id, seen_at)`; no PK update |
| 0030 | `create_staff_change_digest`: two tables — `rounds` (day_key primary key, which is also the round id; claimed_at default now(); sent_count) and `entries` (day_key references rounds (day_key), design_id, revision; primary key (day_key, design_id)) | S4 | `rounds`: `SELECT, INSERT (day_key), UPDATE (sent_count)`. `entries`: `SELECT, INSERT (day_key, design_id, revision)` only |
| 0031 | `create_design_price_notices` (design_id pk, acknowledged_version_id, acknowledged_availability_revision, acknowledged_at default now()) | S5 | `SELECT`; `INSERT` on the named columns; `UPDATE` of the acknowledged pair and `acknowledged_at`; no update of `design_id` |
| (with 0029, wave S4; no new table) | **Grant on an existing table (F2):** exactly `GRANT SELECT (priced) ON TABLE public.contact_submissions TO app_designs;`. Migration `0008`'s header classes `priced` as non-personal, so ADR 0153 d1 holds. **Any wider `SELECT` on that table is forbidden.** | S4: its staff-kitchen statement for the as-sent estimate, read by K2 | as stated |

**Column-level rule (F7):** every `*_at` column defaults to `now()` and is out of every INSERT grant (except where a grant
above names it for an UPDATE); no primary key is ever updated. The exact grant text is written in each wave and pasted
into the runbook by the scribe.

The persistence ports are never given `null`; the book is `unknown` (jsonb) so the store never imports a book type;
every staff write takes an audit entry and commits it **in the same transaction** as the write (plan §8.4(c); the audit
rule above).

## Staff audit actions

New closed-list entries in `staff-audit-action.ts`, written by X0. **Each has a closed key list: kind, ids, codes, counts
(F4). Never created-row text, never a version label or note, never a name or free text.** The actions: `price-draft-changed` (the change kind, including created / text / deleted), `price-draft-reverted`,
`price-bulk-changed`, `price-published`, `price-restored-to-draft`, `catalogue-item-active-changed` (renamed 2026-10-26: the stored action is capped at 32 characters by migration `0020`'s check and `STORED_ACTION_SHAPE`) (immediate, A-17),
`kitchen-defaults-saved`, `kitchen-seen`, `price-catalogue-viewed`. The store fills `sequenceNumber` and `changeCount` (the length of the stored change summary; **superseded 2026-11-04**: the count its publisher confirmed, stored with the version, see the last Amendment) into the `price-published` detail; the caller's entry omits them (S1 QA, 2026-10-26).

**Ruling 2026-10-26 (coordinator): hidden extra keys are stripped, enumerable unknown keys are refused.** The audit detail
readers strip hidden extra keys (non-enumerable, symbol, accessor) rather than refuse them; only enumerable unknown keys are
refused. Nothing undeclared reaches the store or the wire, because the readers rebuild the detail from the declared keys.
This refines the closed key list above and supersedes nothing in it. The `action` column is a shape check (`0020` header,
per the plan), so no migration is owed.

## Alternatives considered

Stated beside each ruling. The three where an owner answer displaced a recommendation: A-17 (availability at publish),
A-21 (an optional Russian field), and OQ-4 in ADR 0177 A-19.

## Consequences

- Waves S1–S6, R1–R5, K1–K4, H1–H2, M1–M4 and U1–U6 implement this record; nothing is built.
- ADR 0062's open points for the architect (seen-revision storage, digest time and provider, the 30-day origin, a
  kitchen sent twice) are answered by A-12 and A-13. "Who can review" is answered by using the existing capabilities
  (plan OQ-14); the owner confirms at close.
- This record was security-read on 2026-10-26 and findings F1–F10 are applied in its body. It restates the fail-closed
  audit rule itself and does not depend on ADR 0173's acceptance, which remains owed for 0173's own P-rows.
- Owner flags still open and blocking nothing: OQ-5a and OQ-4a (ADR 0177); the close-only questions of plan §6.2 (OQ-8,
  OQ-11, OQ-12, OQ-13, OQ-14). Answers are recorded below as dated amendments.

## Amendment — 2026-10-27: migrations renumbered contiguously; S2b folded into S2; the publish batch

**Evidence tier.** Coordinator rulings A and B, 2026-10-27. The code fact is source-verified by wave S2's developer
and relayed: `packages/persistence/src/migration-files.ts:73`, `assertVersionsAreContiguous`. The body above is kept as
written; this amendment supersedes its migration numbers and its S2b wave name.

1. **Ruling A: renumbering.** The contiguity guard refuses any gap, the latest migration is `0022`, and no `0023` or
   `0024` exists on any branch. So the numbers in *Migrations* (`0025`–`0031`, with `0023`/`0024` reserved by M8B Lot
   3) cannot land. M10 takes the next free numbers, contiguous from `0023`, in the order its waves land:

   | Was | Now | Table | Wave |
   | --- | --- | --- | --- |
   | 0025 | **0023** | `create_price_book_versions` | S2 |
   | 0026 | **0024** | `create_price_book_draft` | S2 |
   | 0028 | **0025** | `create_catalogue_availability_changes` and `catalogue_availability_head` | S2 (ex-S2b) |
   | 0029 | **0026** | `create_design_staff_seen` (with the F2 `SELECT (priced)` runbook grant) | S4 |
   | 0030 | **0027** | `create_staff_change_digest` | S4 |
   | 0031 | **0028** | `create_design_price_notices` | S5 |
   | 0027 | **0029** | `create_kitchen_defaults` | S3 |

   - **S3's defaults table takes `0029`, not `0026`.** The architect applied the "landing order" principle: S3 lands
     after S4 and S5, because it is gated on M3 and so on P4b. Giving it `0026` would leave a gap that blocks S4's and
     S5's migrations until S3 lands. If S3 is reordered ahead of S4, the numbers follow.
   - M8B Lot 3's provisional preset-sort and invitation migrations take the next free numbers after M10's.
   - The guard is unchanged. Grants and every other column rule above are unchanged; only the numbers move.
   - **No live database run happens until these numbers are committed**, because migrations are add-only on the shared
     test database's ledger.

2. **Ruling B: S2b is folded into S2.** `PriceBookStore.publish` moves the availability head and writes
   `catalogue_availability_changes`, so the price-book contract's world needs a real availability store. S2 owns:
   - the price-book and availability migrations;
   - `NeonPriceBookStore` and `NeonCatalogueAvailabilityStore`;
   - both shared contracts, run live under the exclusive test-schema lock.

   The "racing publish against a defaults save" arm stays with S3, because it needs `KitchenDefaultsStore`. Until S3
   lands, the price-book live file skips it with that reason, stated.

3. **The publish batch (architect's ruling, 2026-10-27).** Neon HTTP `sql.transaction([...])` statements cannot read
   earlier results. S2's publish therefore moves the head by `greatest(k, 1)` in one update and inserts the *k* created
   items' log rows at revisions `old + 1 … old + k`. This is accepted as observably equivalent to A-17's "one chained
   CTE per item", **on two conditions**:
   - every effect, **the audit row included**, is a branch of one CTE conditional on the head update. A separate
     unconditional audit statement would leave an audit row for a publish that never happened (F3);
   - a CAS that updates no row writes nothing and is answered `availability-changed-meanwhile`.

## Amendment — 2026-10-27: the effective seen revision is a greatest, not an else (A-12; coordinator ruling, relayed)

A-12 defines effective-seen as "the seen revision, or else the latest submission's `design_revision`". **Ruling 2026-10-27:
the effective seen revision is `greatest(seen mark, the latest request's design_revision)`.** A stale first mark below the
sent revision therefore never makes an unchanged sent kitchen read as changed. The rule that a seen mark never moves
backwards (A-12, the `greatest(existing, displayed)` write) governs over the "else" wording; the comparison stays in SQL
only. The M10 plan's S4 row and criterion S-c0 carry the same rule.

## Amendment — 2026-10-27: limiter buckets (relayed by the coordinator; the scribe ran nothing)

**Limiter buckets (R2, 2026-10-27; provisional, fail closed, the owner's to retune):** `staff-prices-read-by-account` 300
per hour (the staff list's figure); `staff-price-draft-by-account` 600 per hour, shared by the draft's `PUT`, `DELETE` and
`POST`; events `staff-prices` and `staff-price-draft`. Subjects are made as ADR 0156 requires. Also `staff-seen-by-account`
600 per hour (K2a; provisional, fail closed). None of these figures is an owner ruling.

## Amendment — 2026-11-04: a version's change count is the count its publisher confirmed, stored with the version (architect's ruling)

**Evidence tier.** Source-verified by the architect, reading the branches at the named commits; the architect ran no
test. The rule is on `m10/u5c` @ `0f40c208`, and every U5c line cited below was read from that commit
(`git show`). Its worktree also held uncommitted edits, which are not cited. The held stores are on `m10/s2` @
`c44978ec` and `m10/s4` @ `678c4131`. `m10/s2` is an ancestor of `m10/s4` (`git merge-base --is-ancestor`), and the
two carry identical `price-book-statements.ts` and `neon-price-book-store.ts`. QA's defect D1 is as relayed by the coordinator. Reasoning
marked **[inf]** is the architect's own.

**This supersedes**, and the body above is kept as written:
- *Staff audit actions*: "`changeCount` (the length of the stored change summary)";
- plan §8.4(d) X0-5: "`PriceVersionSummary.changeCount` is blessed as **derived** from the stored `change_summary`
  (not a `0025` column) … nothing stores it twice";
- *Migrations*: the column list of `create_price_book_versions` (ex-`0025`, now `0023`), which gains one column.

**Context.**
- U5c adds one count rule, `countPendingPrices` (`packages/configurator-domain/src/price-dashboard/pending-price-count.ts:10`):
  - one per price set, and each price of a bulk change;
  - a created class or accessory counts once, with everything the draft says about it (its rates or price, its words,
    a later deletion);
  - a deleted keyed row counts once.
- The chip, the nav badge, the publish button and the confirm dialog all use the rule (`publish-model.ts:229`,
  `cabinet-list-model.ts:120`, `use-publish-desk.ts:270`). So do the fake store's history row and audit stamp
  (`fake-price-book-store.ts:143`, `:184`, `:216`, `:272`). QA's D1 is why the fake uses it: the person confirmed 5,
  and the history row said "10 modificări".
- **The count is not a function of the array's length.** The contract case `price-book-store-contract.ts:941` ("counts a
  created class and its rates as one price…") stores five entries: one price, a created class and three of its rates. It expects a count of 2.
- The held Neon store counts the length in SQL:
  - `price-book-statements.ts:68`: `listVersions`, `jsonb_array_length(v.change_summary)`;
  - `:217`: `inserted_version … returning jsonb_array_length(change_summary)`;
  - `:233`: the audit stamp, which reads that value.

  Its TypeScript pre-check does the same (`dashboard-store-shapes.ts:282`, `.length`).

**Decisions.**

1. **Meaning.** A version's `changeCount` is the number of prices its publisher confirmed: `countPendingPrices` over
   the change summary it stores, evaluated **once, by the store, at publish**.
   - It is a fact of the publish, like `published_at`, and is never re-derived on a read.
   - The `price-published` audit row's `changeCount` and the history row's `PriceVersionSummary.changeCount` are the
     same stored number, so the two records of one publish cannot disagree.
   - A version keeps the count it was published with. If the rule changes later, past versions keep their count and
     new publishes use the new rule.
2. **Storage.** `0023` gains `change_count integer not null check (change_count >= 0)`. It has **no default**, so every
   insert must name it.
   - The column joins the `INSERT` column grant.
   - The store computes the value from the `changeSummary` it was handed, through `countPendingPrices`. The
     persistence package already depends on `@lemnaria/configurator-domain`.
   - **The caller never supplies it.** `PublishPriceBookRequest` gains no member. The forced-value guarantee of
     S-b ("overwritten if forced through a cast") stands.
   - `inserted_version` returns the **inserted column**, and the audit stamp reads it from there. So the audit row is
     still stamped from what was written, as the S1 QA ruling requires.
   - `listVersions` selects the column and never loads `change_summary`.
   - The seed and the test-only append helper each insert `'[]'` with `change_count` 0.
3. **The other counts take the same rule.** This part is definitional only: each is computed in TypeScript already, and
   none is stored by SQL.
   - Discard-all's `revertedCount` is `countPendingPrices` over the stored draft, or 0 when the draft is unreadable.
   - A bulk group's `revertedCount` is the same rule over the removed entries. It equals their number, because a bulk
     group holds only price sets **[inf]**.
   - A single revert's `revertedCount` stays 1 (`dashboard-audit-action.ts:427`).
   - `price-restored-to-draft.changeCount` counts the price fields the restore set. Each is a price set, so the rule
     gives the same number **[inf]**. This is falsified if a restore ever adds a creation or a deletion.
4. **Why editing `0023` is allowed.** It is applied nowhere. This record's status line says no migration is applied.
   The plan's S2 ruling (c) holds S2's live run, the only path that could apply it, to the Z gate. S-g forbids editing
   only an *applied* file.

**Why the column does not "store it twice"**. X0-5's concern was a copy that could drift from its source. Once the rule
can change, the summary and the count are two different facts:
- the summary records what changed;
- the count records what the publisher confirmed.

Keeping only the summary would let a later rule change rewrite what every past publish says was confirmed, while that
publish's audit row keeps the old number **[inf]**.

**Alternatives considered.**
- **(b) Store the length and convert it on display.** Rejected: it is impossible, because the count is not a function of
  the length (`:941`).
- **(c) Count in TypeScript at read time.** Rejected for two reasons:
  - each history page would load `change_summary` for each listed row: up to `PRICE_VERSION_PAGE_SIZE` (20) rows, each
    up to `0023`'s 4 MiB ceiling;
  - history would re-derive every past count under whatever rule is current, while the audit rows keep the counts
    stamped at publish. That leaves two records of one publish disagreeing, which is the class D1 caught.
- **(d1) Reimplement the rule in SQL** (`jsonb_array_elements`, distinct created rows). Rejected: it is a second
  implementation, in a second language, needing a parity test for as long as both exist. D1 was exactly two counts
  that disagreed.
- **(d2) Keep the count inside `change_summary`** (wrap the array in an object). Rejected: it breaks m8's pinned
  `DraftChange[]` array and `0023`'s `jsonb_typeof(change_summary) = 'array'` check.
- **A bounded check** (`change_count` between 1 and the array's length when the array is non-empty). It holds for
  today's rule **[inf, from the code read]**. Rejected because, once applied, it would freeze the rule's shape into a
  migration that can never be edited. The bound is asserted as a domain property instead (plan S-b).

**Accepted residual.** A holder of the application credential can insert a version with any `change_count`. They can
already insert a whole version: residual L1, `0023`'s header. The owner's runbook cross-check gains one clause: a
version's `change_count` equals its `price-published` audit row's `changeCount`.

**Consequences.**
- S2 implements the change on `m10/s2`, and S4 takes it by merge. The plan's Lane S gives the hand-off line by line.
- The owner's queue holds one row on the past-versions behaviour (plan §6.4, OQ-30a).

## Amendment — 2026-11-04: a deletion that gains a user, and a kitchen that names an item the book no longer holds (architect's ruling)

**Evidence tier.** Source-verified by the architect, reading `m10-price-dashboard` @ `cf89af5b` and `m10/s3` @
`69823f43` (`git show`); the architect ran no test. The finding is S3's logic review of 2026-11-04, as relayed by the
coordinator. Owner rulings are doc-quoted. What PostgreSQL's isolation levels guarantee is **[inf]**: it comes from the
vendor's documentation, which was not re-read in this session. Reasoning marked **[inf]** is the architect's own.

**This supersedes**, and the body above is kept as written:
- *A-18*: "re-judges every deletion against the usage reader … **under the head CAS**". The head CAS does not cover
  usage. "An item that gained a user between draft and publish refuses the whole publish" holds only for a save the
  publish statement can see. The plan's §5 A-18 bullet has the same wording.
- The plan's P4a ruling "`UNKNOWN_TIER` precedes `REPLACEMENT_REQUIRED`", for a tier the active book does not hold
  (decision 1).
- The code comments that rest on it: `named-items.ts:10-11` and `:50-55` ("that design is `UNKNOWN_TIER`'s");
  `price-design.ts:167-169` ("passed on to `UNKNOWN_TIER`, whatever is switched off"); `earned-accessories.ts:65-67`
  ("for an earned one the case does not arise").
- The plan's RK-2 mitigation, which covers a disabled tier only.

**Context.**
- **The CAS does not see a save.** `moved_head` moves the head only `where revision = $expected`, beside the draft and
  sequence checks (`price-book-statements.ts:194-203`). The head is moved by availability writes, defaults saves and
  publishes (A-17). A design save touches none of them.
- **Nothing checks a saved tier against the book.** The settings schema keeps a tier id "validated for shape only: the
  domain imports no price book" (`design.ts:163-168`). `rtk proxy grep` for `materialTierId|hardwareTierId` over
  `apps/web/src/lib/server`, `apps/web/src/app/api` and `packages/persistence/src` on the dashboard branch returned
  nothing.
- **So a kitchen can come to name a deleted item on two paths:**
  - **(i) the race.** A save commits between the usage read and the publish.
  - **(ii) the stale page.** The browser receives `{versionId, book, availability}` at page load (A-17, R1) and is not
    told about a later publish. A customer who loaded the page before the publish can choose the item after it. **No
    publish-side mechanism can see a save made after the publish commits.**
- **What the customer sees today.** `selectTier` refuses `UNKNOWN_TIER` (`price-design.ts:488-503`).
  `disabledItemsNamedBy` returns nothing for a design naming a tier the book does not hold (`named-items.ts:56-63`),
  so `replacementsRequired` (`queries/replacements-required.ts:65`) builds no sheet. **Q3 as planned therefore does
  not cover this case.** The kitchen shows the generic failure. The recovery is ADR 0072's tier list, which never
  depends on pricing (wave 6G).
- **The deletable kinds** are a hardware class, a material and a linked accessory (`book-field-address.ts:79-87`).
  S3's statements count all three from the stored document in SQL: `countDesignsChoosingTierStatement` and
  `countDesignsPlacingBodiesStatement` in `kitchen-usage-statements.ts`, on `m10/s3`.
- **The case is unreachable today.** The draft route refuses `item-deleted` (plan, the U5b note and the U5c security
  hand-off to R4a). R4a is the wave that turns deletion on.
- **The owner's rulings.** ADR 0062's third Amendment of 2026-10-25 (doc-quoted, `0062-…md:247-265`):
  - item 2, in the record's words: "Deleting an item that any saved kitchen uses is forbidden; allowed only when no
    kitchen uses it". The owner's words, as relayed: "Deleting no, disabling yes.";
  - item 3: a kitchen using an item that is no longer offered gets a notice and must choose a replacement from the
    remaining options;
  - item 4: the price is hidden until the choice. A switched-off accessory is removed with a notice; the owner, as
    relayed: "it's just removed from the kitchen with the notice".

**Decisions.**

1. **The guarantee is on the customer's side, because path (ii) cannot be closed at publish.**
   - A kitchen whose material or hardware tier the active book does not hold is treated as naming an item that is no
     longer offered. It is refused `REPLACEMENT_REQUIRED`, and the C4 sheet offers that group's active tiers. The price
     is hidden until the customer chooses, and nothing is preselected. It never shows the generic `UNKNOWN_TIER`
     failure.
   - This is ADR 0062 Amendment 3's behaviour for a switched-off item, read as covering a deleted one **[inf]**: a
     deleted item is "not available anymore" too. It is owner-visible, and the plan queues it as OQ-33.
   - `UNKNOWN_TIER` stays as `selectTier`'s defensive refusal. A stored design can no longer reach it, because the
     replacement check runs first.
   - **A linked accessory** the kitchen earned under the seen book, and which the active book no longer states, is
     reported by `removedAccessoriesSince`, named from the seen book. That is the owner's "removed … with the notice".
     The accessory's line is already gone from the price, because an accessory is earned and never named.
   - A kitchen in this state is refused at send by the existing path (P4a's `409 CONTACT_DESIGN_NOT_CURRENT`), and no
     snapshot is stored.
2. **The publish side is defence in depth.** It keeps A-18's whole-publish refusal true for every save the publish
   statement can see.
   - **(a) Count inside the request (R4a).** The publish route reads the stored draft. It takes the deleted items of
     the active book, which excludes a row the same draft created. It counts them with the usage reader in that request
     and judges them with `judgeDeletionsAtPublish`, which names the item (D7G). Counts never come from a page load or
     from the request body.
   - **(b) The guard in the statement (S2c).** The publish CTE gains a branch listing each deleted item that at least
     one design not deleted by its client still names.
     - The predicates are S3's count statements' text, taken from one shared fragment, not a second implementation.
       The change-count Amendment above rejected a second implementation (its alternative d1) for the same reason.
     - `moved_head` requires that branch to be empty.
     - The final select returns the items, and the store answers `item-in-use {items}`. That is distinct from
       `availability-changed-meanwhile`, which a guard placed only in `moved_head`'s `where` would wrongly report.
     - A linked accessory's build ids come from the domain (`buildIdsPricedAs`), as S3's reader receives them. The
       store checks the deleted refs against the stored summary. For build ids it checks only that the set is
       non-empty and holds the accessory's own `linkedBuildId`. Any seeded equivalents are the domain's to get right.
     - The route already maps `409 item-in-use {items}` (`price-dashboard-wire-contract.ts:240-245`,
       `fetching-publish-client.ts:177`).
   - **No DDL.** The statement is code. No index is added: a sequential scan of `designs` is accepted for a rare
     administrator write **[inf]**. The store's role, `app_designs` (`0023` header, lines 44-45), is the role that
     already reads `designs` **[inf; falsified if the price-book store connects with another role]**.
   - **Accepted residual.** Under READ COMMITTED, a save that commits after the publish statement's snapshot and before
     its commit is not seen. Its consequence, and path (ii)'s, is decision 1.
3. **Order.**
   - R4a merges its other items with `item-deleted` still refused, so R4a and R4b are not held up.
   - A gated step, R4c, turns `item-deleted` on in the draft route only once S2c and Q3, including decision 1, are
     both merged.
   - S2c starts after S3 merges, because the shared predicate is S3's. S3 brings `0029`, which needs the owner's fresh
     approval.

**Alternatives considered.**
- **(a) alone.** Rejected as the only layer. It leaves a window of two network round trips. It is also a promise the
  route must keep, with nothing at the store.
- **A serializable publish.** Rejected. PostgreSQL's serializable guarantee holds only between transactions that are
  both serializable **[inf; vendor documentation not re-read]**. Design saves run at the default level, so this closes
  nothing unless every autosave becomes serializable and retries.
- **The save refusing, or replacing, a tier the active book no longer holds.** Rejected:
  - saving is autosave only (M8B O1; `STATUS.md:68`), so a refusal loses the customer's work;
  - a silent replacement contradicts ADR 0062 Amendment 3 item 3 and A-16: the customer chooses;
  - it would put the active book on the save path, against `design.ts:163-168` and seam 1, so a price-store outage
    would block saves;
  - without a lock, it would still race the publish.
- **A lock that every save takes** (a shared advisory lock, or `LOCK TABLE … SHARE` in the publish). Rejected. It
  touches every autosave to close a window of milliseconds, while path (ii) stays open. `LOCK TABLE` in that mode needs
  a table-level privilege the application role probably lacks **[inf]**, which would mean a grant and an owner ask.
- **Recording the residual and keeping `UNKNOWN_TIER`.** Rejected. It leaves the customer on the generic failure that
  RK-2 names as the risk. Through ADR 0072's tier list the customer can recover, but gets no notice, and ADR 0062
  Amendment 3 requires one.

**Consequences.**
- The plan gains waves S2c and R4c. The block *Publish and a deletion that gains a user*, in Lane S, gives the S2c,
  R4a, R4c and Q3 work with criteria S-j, R-i, R-j and Q3-g.
- R3 is merged (`ce9f685b`) and is not re-dispatched. R4a holds R3's publish route and service for decision 2(a).
- Q3 holds four P-lane files for decision 1, in a stated window.
- **The owner's ruling holds as narrowly as the database allows.** The dashboard never deletes an item that a kitchen it
  can see uses. A kitchen that names the item afterwards (path (ii), or the residual) is asked to choose a replacement.
  The plan queues this as OQ-33, with this default built.
- A disable is unaffected. Its count of kitchens is a warning (ADR 0062 Amendment 3 item 3), and a racing save only
  makes that count stale; no rule is broken.
