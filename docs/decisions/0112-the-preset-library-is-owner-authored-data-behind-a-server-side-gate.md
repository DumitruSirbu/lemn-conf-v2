# ADR 0112 — The preset library is owner-authored data, saved from the editor through a server-side gate

Status: Accepted (owner ruling, 2026-09-11; the gate's mechanism is an engineering decision and
goes to a security reviewer in its wave)
Date: 2026-09-11
Type: Decision (owner ruling + engineering)
Milestone: M7 — waves 7P1, 7P2, 7G (architect's re-plan, `docs/milestones/M7-room-and-presets.md`)

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
