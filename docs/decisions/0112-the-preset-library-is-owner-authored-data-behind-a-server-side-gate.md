# ADR 0112 — The preset library is owner-authored data, saved from the editor through a server-side gate

Status: Accepted (owner ruling, 2026-09-11; the gate's mechanism is an engineering decision and
goes to a security reviewer in its wave); **Amendment A, 2026-10-17** (M8C: copy-on-use written in; decision 2's flag and
secret suspended until the first public deploy; decisions 1 and 5 amended; nothing built)
Date: 2026-09-11
Type: Decision (owner ruling + engineering)
Milestone: M7 — waves 7P1, 7P2, 7G (architect's re-plan, `docs/milestones/M7-room-and-presets.md`)

**Pointer, 2026-09-29 — its waves are past M8, and one owner ruling about it is not in it.**
[ADR 0131](0131-the-preset-story-is-deferred-past-m8-and-every-room-goes-from-its-dimensions-straight-to-composition.md)
records the owner's direction of 2026-09-15, relayed, that storage, authoring and the admin panel come
after M8. 7P1, 7P2 and 7G did not ship in M7. ADR 0131 §4 also quotes the owner's **copy-on-use**
ruling of the same day: presets live in their own table, only the administrator updates them, and
using one copies it into a new private design. **That ruling is not recorded in this ADR.** A reviver
writes its amendment here before planning 7P1. Nothing below is struck.
**Update, 2026-10-17: the amendment is written — see Amendment A at the end of this record.**

## Context

The owner's answer to the M7 plan's Q4, verbatim (2026-09-11):

> *"4. Here is a important question, I would like to have a temporary button displayed that by
> clicking it will save the generated preset and adjusted after by me as a preset. In this way I
> will prepare a library of presets and after we will hide that button but will keep the
> functionality to be reactivated later on demand. So the process will be :
> a) I choose configuration, liniar, 2 walls,
> b) 3 walls, I set the wals width and
> c) you start to generate a preset (we don't have now presets)
> d) I make adjustments and save the preset
> e) later if I insert nearly similar walls confioguration and width +- 600 mm, you show me the preset
> so I am able to choose it"*

Three facts this changes, measured against the tree at `3d3cb16`:

1. **Presets are no longer code.** [ADR 0109](0109-a-preset-is-a-recipe-document-and-is-listed-only-if-the-product-would-never-mark-it.md)
   decision 2 made the reference kitchen M7's one real recipe. The owner says *"we don't have now
   presets"*: the library starts empty and grows by the owner saving kitchens from the editor.
2. **A write path appears that every customer's screen reads.** Today the only writes are to a
   customer's own design, gated by its per-design write token (ADR 0019 decision 1). A preset is
   written once and shown to everyone, so a customer able to reach the save path could publish a
   kitchen — or a payload — onto every Step 1 screen.
3. **[ADR 0062](0062-a-manufacturer-price-dashboard-comes-after-m8-and-shapes-seams-now.md) says
   *"Nothing is built for the dashboard in M6, M7 or M8. No admin UI, no auth, no write endpoints, no
   schema, no feature flag, no data field."*** The preset tool is not the price dashboard, but it is
   exactly an owner-only UI, an authentication step, a write endpoint, a table and a flag. This record
   is the owner-directed exception, and ADR 0062 carries a dated pointer to it.

## Decision

**1. A preset is a row, not a module.** A new `presets` table holds, per preset: an opaque id
(`nanoid`, like a design's), the shape, the room it was saved in (each wall's length and the
height), the design document **snapshot** at the current schema version, an optional owner-typed
name per locale, a thumbnail (decision 6), a status (`published` | `hidden`) and timestamps. The
table arrives by a numbered migration under the rules the persistence package already enforces:
the runner's ledger ([ADR 0042](0042-the-database-records-which-migrations-it-ran.md)), a migration
file is not an applied migration until the schema is read back
([ADR 0020](0020-a-migration-file-is-not-an-applied-migration.md)), and the deployed schema is proved
by the gate [ADR 0096](0096-the-deployed-schema-is-proved-by-a-gate-and-production-was-never-in-the-runners-path.md)
added. **No agent applies it to production.** The application role is granted `SELECT, INSERT` on it
and nothing else ([ADR 0008](0008-least-privilege-database-role.md)); hiding a preset is the owner's,
through the database console, until a later wave needs `UPDATE`.

**2. Authoring is gated on the server, twice, and never by hiding a button.**

- **A feature flag**, an environment variable that is off unless set to one exact value — the
  pattern `/internal/scene-shot` uses (`route-availability.ts`, SEC-003). With it off, the authoring
  routes answer **404**, the button is not rendered, and nothing distinguishes the feature from one
  that does not exist. *"Hide that button but keep the functionality to be reactivated later on
  demand"* is this flag: off hides, on restores, no code is deleted.
- **An owner secret.** The owner sets the secret's hash in the deployment environment (agents never
  see or print the secret — `AGENTS.md` rule 1). The owner unlocks authoring once per browser by
  submitting the secret in a request **body**, never a URL; the server compares it in constant time
  and answers with an `HttpOnly`, `Secure`, `SameSite=Strict`, expiring, server-verifiable author
  cookie that is **not** the secret. A wrong secret gets the same response shape as a disabled
  feature, so the endpoint does not confirm it exists.
- **The editor shows the save control only when the server says so** — the `/d/{id}` page, which is
  already dynamic, reads the flag and the author cookie and passes one boolean down. The client never
  decides.
- **Every save re-checks both**; a valid author cookie with the flag off is refused.

**3. A save snapshots the stored design, not a client payload.** The save request names a design id
(and optionally a name). The server loads that design through the repository — which validates and
migrates it — and snapshots it. The body the client sends cannot become a preset's content, so the
write surface is an id and a short name, not a document.

**4. A preset must be a kitchen the product would propose.** At save the snapshot must carry **zero
validation findings of either severity** in its own room (ADR 0109 decision 3; the owner's
2026-09-03 *"this should always fit the existing walls"*) and must contain the minimum kitchen — a
sink and a hob (owner, Q3, 2026-09-11). A save that fails either is refused with a code, and the
owner sees why.

**5. Matching belongs to the evaluator, not to the table.** Step 1 asks the library for presets of the
room's shape and lets ADR 0109's evaluator — as amended for the owner's *"+- 600 mm"* (ADR 0109
Amendment A) — decide what is shown and how it is adapted. The table is read-only to customers and
is read by the room page on the server; no public list endpoint is added.

**6. A preset's thumbnail is captured at save from its own design.** DEVELOPMENT-SPEC §13.3 q5 wants
thumbnails rendered from the recipe so a card cannot promise a layout it does not apply. With presets
saved at run time there is no build step to render them, so the owner's editor captures the scene at
a fixed camera when saving, and the image travels with the save — size- and type-checked on the
server, stored with the row, served read-only with cache headers. The rig (`/internal/scene-shot`)
can re-capture any preset from its snapshot.

**7. Security review is mandatory** on the waves that add the table, the gate and the save endpoint:
they add an authentication mechanism, a public-facing data path and stored content shown to every
customer.

## Alternatives considered

- **A hidden button with no server gate.** Rejected: hiding a control authorises nothing; the
  endpoint behind it would be one `curl` from anyone who read the bundle.
- **The flag alone, with no secret.** Rejected: the owner will turn it on in production to build the
  library, which is precisely when customers are also on the site.
- **The owner exports presets as JSON and an agent commits them.** Rejected: it contradicts the
  process the owner described — generate, adjust, save, in the product — and adds a deploy between
  saving a preset and seeing it.
- **Store presets as `designs` rows with a flag.** Rejected: a design is a customer's document under
  a per-design write token and a retention policy (ADR 0019 decision 7); a preset is product data
  with neither. One table per kind of thing keeps the least-privilege grants honest.
- **Let the save body carry the design.** Rejected by decision 3: the stored design already passed
  both validation seams, and a body is attacker-shaped input.
- **Wait for the manufacturer dashboard.** Rejected: the dashboard comes after M8 (ADR 0062) and the
  owner wants to build the library now. Decision 2's gate is shaped so the dashboard can absorb it
  rather than run beside it.

## Consequences

- Until the owner saves presets, **every room goes to generation**, and 1E is reached only once the
  library has a preset within the matching window.
- The backup export is scoped to `designs` today ([ADR 0012](0012-scheduled-export-is-a-scoped-sql-select.md));
  the library is owner work that a lost database would erase, so wave 7P1 extends the export to it.
- New environment variables are added, never removed or overwritten (`AGENTS.md` rule 1), and the
  owner sets their values.
- M8's launch gate gains one line: the authoring flag's production value is a deliberate owner
  choice at launch.

## Decision-record sweep

| Record | What it says | How it is settled |
| --- | --- | --- |
| [0062](0062-a-manufacturer-price-dashboard-comes-after-m8-and-shapes-seams-now.md) *Decision* | Nothing built for the dashboard in M6–M8: no admin UI, auth, write endpoint, schema or flag. | **Narrowed by this owner ruling for the preset tool only**; ADR 0062 carries a dated pointer. The price dashboard itself is still after M8. |
| [0109](0109-a-preset-is-a-recipe-document-and-is-listed-only-if-the-product-would-never-mark-it.md) decisions 2, 3 | The reference kitchen is the one recipe; fit is zero findings. | **Decision 2 amended** (ADR 0109 Amendment A): the library starts empty. **Decision 3 binds at save** (decision 4 here). |
| [0019](0019-security-baseline-writes-throttling-retention.md) decision 1, 2026-08-31 correction | Writes need a per-design token; SEC-001's mint stays gated to M8. | **A second, separate credential** for a separate write; no change to design writes or to the mint. |
| [0008](0008-least-privilege-database-role.md), [0020](0020-a-migration-file-is-not-an-applied-migration.md), [0042](0042-the-database-records-which-migrations-it-ran.md), [0096](0096-the-deployed-schema-is-proved-by-a-gate-and-production-was-never-in-the-runners-path.md) | Least privilege; a migration is proved by reading the schema back; the ledger; the deployed-schema gate. | **Followed** (decision 1). |
| [0012](0012-scheduled-export-is-a-scoped-sql-select.md) | The export is a scoped select over `designs`. | **Extended to `presets`** (consequences). |
| SEC-003 (`route-availability.ts`) | An internal route is opt-in by an exact flag value in production. | **The pattern for the flag** (decision 2). |
| `DEVELOPMENT-SPEC.md` §13.3 q5 | Thumbnails are rendered from the recipe so they cannot drift. | **Kept** by capturing from the preset's own design at save (decision 6). |

## Amendment A — 2026-10-17: the preset work starts; copy-on-use is written in; decision 2's gate is suspended until the first public deploy

**Evidence tiers.** *[doc]* quoted from this repository; *[plan]* the M8C plan (`milestones/M8C-generation-fill-and-preset-authoring.md`,
§3.1–§3.7, committed at `dad97495`); *[relayed]* the coordinator's relay of the owner's 2026-10-17 answers; *[owner-doc]*
`docs/OWNER_FIXES.md`. The scribe ran nothing and has no shell. **Everything below is decided, not built.**

**Order, stated plainly.** The pointer at the head of this record and [ADR 0131](0131-the-preset-story-is-deferred-past-m8-and-every-room-goes-from-its-dimensions-straight-to-composition.md)
§4 both say a reviver writes this amendment *before planning* the work. The M8C plan was committed first (`dad97495`)
and this amendment is written in wave F0 after it. The plan carries the design; this amendment is its record.

**Why now.** ADR 0131 §4 named its revival trigger: *"the owner's direction to start the preset work"*. The owner gave it
on 2026-10-17 (`OWNER_FIXES.md`, Fix 2: *"I need the button to save the preset, and after that, when I generate again, I
should be able to see and select from the preset"* [owner-doc, line 89–90]). ADR 0131's *"after M8"* is also overridden
by that direction, since M8C runs while M8 is open; M8's own open items stay M8's.

**Copy-on-use, written in** (ADR 0131 §4 quotes the owner's 2026-09-15 words; this record now carries the rule).
Presets live in their own table; only the administrator updates them; using one **copies it into a new private design**
under its own write token. The preset row is never written by a customer (no `UPDATE` grant exists).

**Decision 1, amended** (plan §3.2):
- the columns are `id`, `shape` (`L`, `linear`, `U`), `wall_a_mm`, `wall_b_mm`, `wall_c_mm`, `height_mm` (B null for
  `linear`, C non-null only for `U`), `design_document` (`jsonb`, the stored design at the schema version it was read
  at), `typed_name`, `thumbnail` (`bytea`), `thumbnail_type`, `status` (`published` | `hidden`, default `published`) and
  `created_at`, in migration `0011_create_presets.sql`;
- **no design id is stored**; a preset does not depend on the private design it came from;
- **the typed name is stored once** (optional, at most 80 characters) and shown verbatim; this replaces *"an optional
  owner-typed name per locale"*. When it is empty, **a generated name is rendered per locale from the stored shape, the
  walls and the design's finish colour, and is never stored** (the owner's ruling: one typed name, optional; else one
  generated from shape, size and finish colour [relayed]);
- the grant is `SELECT, INSERT` and nothing else, as before; hiding a preset is the owner's, by the runbook's procedure.

**Decision 2, suspended until the first public deploy** (owner, 2026-10-17 [relayed]: *no password, no switch, every
environment, for now*; launch-gate condition: removed, or replaced by `preset.create`, before the first public deploy).
- No feature flag and no owner secret. The save control is shown wherever the editor can write, in every environment.
- **The seam stays.** Decision 2 bullet 3 (*"the client never decides"*) is kept: the server's answer decides whether the
  control is shown, through one swappable policy function (`preset-authoring-policy.ts`), whose only implementation is
  named by one exported constant (`ungatedUntilLaunch`) that the launch gate refuses while it is wired. `GET
  /api/designs/{id}` answers `canAuthorPresets` beside `canWrite`. Fix 3 (accounts, roles) replaces the implementation
  with `preset.create`; the route does not change. [plan §3.3]
- **The accepted, time-boxed risk, stated in one sentence [owner, relayed; the security reviewer records it]:** *"anyone
  who can reach an environment can publish a preset onto every Step 1 screen in that environment's database"*. It ends at
  the first public deploy; the M9 launch gate lists it (see `milestones/M9-delivery-preparation.md`, dated note
  2026-10-17).
- The 2026-08-27 rule *Nothing ships mid-milestone* (WORKFLOW) is **excepted by the owner for this deployment**:
  **Q-4 = deploy to production and author presets there** [relayed selection]. The production deployment is not public.
  The order on production is `0009`, `0010`, `0011`, their grants, then the deploy, because the migration runner applies
  every pending file in order [plan §3.2, src: `migration-plan.ts:15-38`, not re-read].

**Decision 3, kept and sharpened.** The route is `POST /api/designs/{id}/preset`, under the design's path on purpose: it
requires **the design's own write token and visitor** (ADR 0114 G4), so a stranger who learns a design id cannot publish
someone else's private kitchen. This is not a gate on authoring: anyone can mint a design (ADR 0147) and save it. The
request carries a design id, an optional name, the revision the editor shows as saved and the image, **never a
document**. A stale revision gets `409 PRESET_STALE` and no row. [plan §3.3]

**Decision 4 and decision 6, kept.** The refusals are one I/O-free domain function: zero findings of either severity,
and a sink and a hob (read off the catalogue's declarations, ADR 0121). Decision 6's image is **one 1280 × 960 capture**
at the overview camera, at most 512 KiB, magic bytes and header dimensions checked on the server, and it serves both the
card and the preview. [plan §3.3, §3.4]

**Decision 5, amended (an engineering decision).** *"No public list endpoint is added"* is replaced by **one read route for
one room's matches**: `GET /api/presets?shape=…&a=…&b=…&c=…`, answering the published presets of that shape whose every
saved wall is within ±600 mm inclusive of the room's (ADR 0109 Amendment A2), newest first, at most 8, never a hidden
row and never a design id, limited by the reads limiter (fail open), cacheable for 60 s; and `GET
/api/presets/{id}/image`. Reason: the room exists only in the client until *Continuă*, and shipping every published
snapshot in the room page is unbounded. The data is product data every customer is shown anyway. [plan §3.5]

**Decision 7, kept:** security review on P1, P3, P4 and P6 (and P2, per the plan's tiers).

**Consequences, replaced.**
- *"wave 7P1 extends the export"* becomes **wave P2 adds a second, separately-scoped export before authoring starts**
  (ADR 0012: a new table needs *"a second, separately-scoped export"*; the export is `backups/presets/`, with the same
  14-day rotation).
- **Correction of a sentence in `docs/OWNER_FIXES.md`** (that file is the owner's record and is not edited): it says the
  presets table *"is part of the production backup like any other table"*. **That is false at HEAD** [plan, src:
  `const BACKUP_BLOB_PREFIX = "backups/designs/"`, `apps/web/src/lib/server/backup-designs.ts:15`, confirmed by the
  scribe's grep]. Neon's point-in-time history is 6 hours (milestones README). Until P2 ships, presets are not backed up.
- *"M8's launch gate gains … the authoring flag's production value"* is replaced by **"the ungated policy is not wired"**;
  `pnpm gate:launch-placeholders` refuses while it is (wave P3), the pattern ADR 0163 used for the shop's number.
- The Step 1 notice *"Niciun preset gata făcut nu încape aici"* becomes true only when nothing matched; its copy, and all
  new copy, is drafted for the owner's approval (ADR 0113).

### Dated note, 2026-10-18 (M8C close-out): what was built that Amendment A does not say

Written by the scribe from the coordinator's brief **[relayed]**; the scribe ran nothing and re-read no source. Nothing
above is changed.

- **A `schema_version` column** exists on `presets`; Amendment A's column list and the plan's §3.2 do not have it.
- **The grant is column-level on INSERT**, with `created_at` and `status` excluded from it (so a caller cannot set them),
  rather than the table-level `SELECT, INSERT` Amendment A states.
- **`design_document` has a 4 MiB ceiling.**
- **A names rule** governs the typed name (the plan's NFC, trim, 80-character and control-character rules; the code is
  the authority).
- **A second export** (`backups/presets/`) exists, as the Consequences above required.
- **The save route path** is `POST /api/designs/{id}/preset`, as decision 3 says.
- **The launch-gate line** is wired as the plan §3.3 describes (`pnpm gate:launch-placeholders` refuses while
  `ungatedUntilLaunch` is wired); the scribe did not run it.
- **`deploy.yml` conclusion [relayed]:** do **not** use `deploy.yml` for the rollout. The launch gate is **not on the
  real production path**, so the time box rests on the **M9 checklist**. **Verify Vercel deployment protection** on
  production; it is unverified here.
- **Unconfirmed:** whether migration `0011` was applied to the allow-listed test database `lemn-conf-v2-staging` by a
  live persistence run in P3. No agent applied `0009`, `0010` or `0011` to preview or production.
