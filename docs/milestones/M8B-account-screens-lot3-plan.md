# M8B — Account screens, Lot 3: port plan for the staff area (operator and administrator, S1–S8)

> **STATUS: DRAFT, 2026-10-20, architect. No wave dispatched, nothing built, nothing committed but this file.**
>
> - Branch `feat/login-register`, worktree `lemnaria-configurator-login`, read at HEAD `e4a5e4ee` [run: `git rev-parse`].
>   Another agent was committing on the branch while this was written; line citations below are to the files as read.
> - This file adds to [`M8B-account-screens-lot2-plan.md`](M8B-account-screens-lot2-plan.md) (Lot 2, **built**: waves
>   S1–S13d, U1–U16; its §12 and §14.7 record what was built). It does **not** amend that plan, ADR 0172, or any other
>   record. Every ruling below is a **P-row** (the architect or the coordinator rules) or an **O-row** (the owner rules).
>   The scribe records each ruling as a dated amendment or record once it is made.
> - **Lot 3 is mostly not buildable as drawn.** Of eight screens, two (S6 Prețuri, S7 Traduceri) contradict accepted
>   records and are recommended for deferral; two (S4 Personal, S5 Presete) need a new grant that reverses a recorded
>   rule, so they wait on an owner answer and a decision record; one block of S3 (the request's contact) contradicts
>   ADR 0153 decision 1. What is buildable now is the shell (S1), the kitchens list (S2), the read-only kitchen with
>   notes, status and unhide (S3, without the request contact block), the audit log (S8), and the preset authoring gate
>   swap that Fix 3 already ordered.
> - **2026-10-20, later: the owner ruled O-L3-1 to O-L3-7** (each given directly by the owner through AskUserQuestion;
>   see [§5.3](#53-owner-answers-2026-10-20)). S6 and S7 are deferred; S3 takes option (c); S4 and S5 are unblocked **in
>   principle** but wait on a decision record and a security review; notes join the export; Lot 3 copy is pre-approved as
>   drafted. Still nothing dispatched or built.
> - **QA regime.** ADR 0172 D12 ("no tests") was scoped to the first M8B round and its lift covered the Lot 2 waves
>   (Amendment H item 11). **Lot 3 follows `docs/WORKFLOW.md` in full:** paired tests per behaviour change, adversarial
>   QA that gates review, the review tier named per wave. Nothing in this plan inherits "no tests".

**Inputs.**

- The design: `design-source/profile-3/Lemnaria Cont Lot 3.dc.html` (83,260 bytes, sha256
  `637e7aecfe3fd4fea52aeb18a2fe9bb4a54903fa0c1359ebac99bc296a39b182`) and the extended
  `design-source/profile-3/ContBlocks2.dc.html` (40,562 bytes, sha256
  `8be0fd0b30317699f0458a0bac1e03e742471d07d60b9c26a3e1897d287623ea`) [run: `wc -c`, `shasum -a 256`]. Both are in the
  **untracked** `design-source/` folder of the primary checkout, which AGENTS.md rule 3 says will be deleted. **Nothing
  may import from it**; §0.1 lists what wave L3-W0 copies into `docs/design/mockups/`.
- The brief they answer: `docs/design/prompts/account-batch-3-claude-design-prompt.md` (Part 0, Part 3, §0.9) [doc].
- Every other file in `design-source/profile-3/` that Lot 3 needs is already in the repository byte for byte [run:
  `cmp -s` against `docs/design/mockups/`: `ContBlocks.dc.html`, `Lemnaria Cont Lot 1.dc.html`, `Lemnaria Cont Lot
  2.dc.html`, `Presete.dc.html`, `support.js`, both configurator files and `Alegere corp - layouturi.dc.html` are
  identical; only `ContBlocks2.dc.html` differs].
- `LOT2-PLAN.md` in that folder is the designer's own Romanian note on Lot 2 (three items, "Nimic construit încă"); it
  carries nothing Lot 3 needs [mock].
- `shots/`, `uploads/` and `cabinets/` in that folder are **not referenced** by the Lot 3 file or by `ContBlocks2`
  [run: `grep -o "shots/…|uploads/…|cabinets/…"` over both returned nothing]; `docs/design/README.md` *Not copied, and
  deliberately so* already excludes them, and `apps/web/public/cabinets/` holds the cabinet SVGs [run: `git ls-files`].
  The folder's `DEVELOPMENT-SPEC.md` differs from the repository's and is older (36.1 K against 48.6 K); the README
  already rules the repository copy authoritative [doc].
- Read for this plan: AGENTS.md, `docs/STATUS.md`, `docs/WORKFLOW.md` (spine, *Scope discipline*, *How much review*),
  `docs/OWNER_FIXES.md` Fix 3, the Lot 2 plan (§2.2, §4, §9, §12, §14), ADR 0172 (D3, D7, D9–D12, Amendments E–H and
  addenda), ADR 0153 d1 and *What later waves inherit*, ADR 0062, ADR 0095 decision 2, ADR 0112 (grep), the runbook
  `applying-a-table-migration-and-its-application-role-grant.md` (sections `0011`, `0012`–`0015`, `0016`–`0019`), and the
  source files cited at each claim.

**Evidence tiers** (the Lot 2 plan's, unchanged).

| Tag | Meaning |
| --- | --- |
| **[mock]** | Read in the Lot 3 or ContBlocks2 markup or script (doc-quoted from the design) |
| **[src]** | Read in this worktree's source (source-verified) |
| **[doc]** | Quoted from a record in this repository (doc-quoted) |
| **[run]** | A command the architect ran, result quoted |
| **[inf]** | The architect's inference |

Unmarked statements in §§2.2–8 are the architect's design proposals [inf]; they are rulings to be made, not facts.

---

## Goal and scope

**Goal.** A signed-in operator or administrator works in a staff area, separate from the configurator, where they:

- list every client's kitchens, sent and draft, filter and search them (S2);
- open one kitchen **read-only**, see who it belongs to, set the status of a sent request, add notes, and make a kitchen
  the client hid visible again (S3);
- and, for an administrator only: invite staff (S4), hide, show and order presets (S5), and read the audit log (S8).

Throughout:

- **every staff read of a client's kitchen and every staff write is in the audit log, or does not happen** (fail closed);
- **no staff path can change a kitchen's document**, its revision, name, owner or marks, other than clearing the client's
  hide (Fix 3 Q-F3-4, Q-F3-10 [doc]);
- an operator never sees, reaches or is served an administrator item (brief 0.6-6 [doc]);
- no response tells a stranger whether an address, an account or a kitchen exists (brief 0.6-1 [doc]);
- no screen promises a page, button or feature that does not exist (brief 0.3-6 [doc]).

**In scope:** S1 (shell, both menus, 403, session expired), S2, S3 (the request line is O-L3-1 option (c): profile
contact, the request's reference and date, the as-sent kitchen; no request contact), S8, notes in the client export
(O-L3-6), the account control's "Zona personalului" entry, the preset authoring gate swap; S5 and S4 are owner-answered
but **in outline only**, until their decision record and a security review exist (§5.3, §7.3).

**Out of scope, each with its reason:**

| Item | Why it is out |
| --- | --- |
| S6 Prețuri | **Deferred by the owner (O-L3-2, 2026-10-20).** Contradicts ADR 0062 (no dashboard in M8) and the price book's real shape (CG-L3-2) |
| S7 Traduceri | **Deferred by the owner (O-L3-3, 2026-10-20).** Contradicts ADR 0095 decision 2 (copy in message files, build-time translation gates) (CG-L3-3) |
| S3's "Cererea trimisă către magazin" contact block | **Not shown, by the owner's ruling (O-L3-1 (c)).** ADR 0153 d1 is unchanged: the application role reads no personal column of a request (CG-L3-1) |
| Staff role change, deactivation, removal, invitation resend | Not drawn by design (CD answer 5 [mock]); the owner's console runbook stays the path [doc: runbook *Making the first administrator* step 4] |
| The statistics dashboard staff land on | O10: "not yet planned" [doc: Lot 2 plan §9] |
| Account erasure, the retention job | O5 and ADR 0172 *Consequences* [doc]: no erasure record exists |
| Thumbnails in S2 | No render pipeline (Lot 2 C2 [doc]); the striped placeholder, decorative |

## 0. How Lot 3 is built

- **Data-driven, as Lots 1 and 2.** One `SCREENS` array (`Lot 3.dc.html:259-344`) drives a 1920 × 1080 desktop template
  and a 390 × 844 phone template; the closing section holds the designer's answers to brief §0.9 (`:396-404`), the plural
  table (`:405`) and the lists of new blocks and added copy (`:406`) [mock]. This plan cites them as "CD answer n".
- **Frame count** [run: a `grep -oE` of `{id:'S…'` and `S3F('S…'` over the script, unique]: **68 frame ids**: S1 5, S2 9,
  S3 12, S4 13, S5 9, S6 8, S7 7, S8 5. Two (S3B2, S5B2) are mobile-only scrolled frames; the rest have a desktop frame
  (`:395`, `dFrames` filter) [mock]. Lot 3 is **desktop first** (brief Part 3 [doc]).
- **Desktop shell** [mock, `:47-71`]: a 76 px top bar (wordmark, a role chip "Operator" / "Administrator", the account
  control, the RO chip), a 264 px left navigation (`nav aria-label="Zona personalului"`), the content with an H1, an
  optional primary action, and a sticky foot bar for pagination or the save bar.
- **Mobile shell** [mock, `:100-117`]: a 44 px "Meniu" button **in place of ‹**, the wordmark, the RO chip; the
  navigation opens as a sheet (`MENU_OP`, `MENU_AD`, `:197-198`) holding the account, the role, the items and the two
  sign-out rows. CD answer 8 states the departure [mock].
- **Token page** (`plain:1`, `:72-77`): S4F–S4J and S4K2 are the invitation acceptance page: no shell, no chip, the
  "Pagină simplă · fără terți" badge, as Lot 1's token pages [mock].
- **Overlay kinds** [mock, `:78-83`, `:113-116`]: `dlg` (centred 520 px dialog; mobile sheet or alertdialog), `big`
  (1100 px, the preset preview), `drawer` (560 px from the right on desktop: the invite sheet), `menu` (anchored 340 px:
  the account menu), `toast` (`role="status"`).
- **Header badges** say "Paletă provizorie", "Fără Turnstile în lotul 3" and "Textele sunt provizorii · Server: de
  stabilit" (`:24-26`) [mock]. **No server word in Lot 3 is a contract** except the brief's 0.7 words.

### 0.1 Files wave L3-W0 copies into `docs/design/mockups/` (not done by this plan)

| File | Action | Check |
| --- | --- | --- |
| `Lemnaria Cont Lot 3.dc.html` | **New**, verbatim | sha256 `637e7aec…9b182` after copy |
| `ContBlocks2.dc.html` | **Replace** the Lot 2 copy, verbatim | sha256 `8be0fd0b…3ea`. The Lot 3 file is a superset of the tracked one [run: a `diff` of both split on `>` showed 0 lines only in the tracked copy and 464 only in the Lot 3 copy]. **Owed:** render `Lemnaria Cont Lot 2.dc.html` after the replacement and confirm its frames are unchanged, since Lot 2 imports the file |

`docs/design/README.md` gains rows for both (the scribe's). No other file in `design-source/profile-3/` is needed.

---

## 1. Screen by screen: what Lot 3 adds, diffed against what is built

"Built" cites the source read in this worktree. A server line "de stabilit" in the mock means no contract exists; the
**Port** column states the contract this plan proposes (§2).

### S1 — Staff shell (`/[locale]/staff/…`, "propusă")

| Frames [mock] | What the design adds | Built today [src] | Port |
| --- | --- | --- | --- |
| S1A, S1B | Left nav (desktop) / menu sheet (mobile). Operator: "Bucătării clienți" only. Administrator adds "Personal", "Presete", "Prețuri", "Traduceri", "Jurnal de audit". Focus ring on an item (S1B) | Nothing under `/staff`. `proxy.ts` admits only `/{locale}/account/{page}`, exactly three segments (`isAccountPageIn`, `proxy.ts:313-323`) | A new `staff` family in `proxy.ts` (P-L3-2). Nav items are computed **on the server** from held capabilities and only for **built** pages (C-L3-4) |
| S1C | Session-expired sheet over S3, the typed note kept; "Intră în cont" opens login **in a new tab**; CD answer 8 asks the owner | Lot 2 A20B sheet `account/session/session-expired-sheet.tsx` does a full-load `location.assign` to login [src: Lot 2 §1 A20, U15a] | A staff variant whose link opens a new browsing context (P-L3-7). Staff idle-out is 12 h / 7 days absolute, as built in `session-lifetimes.ts` [src] |
| S1D | 403 page: "Nu ai acces la această pagină", nav kept without admin items | `account/forbidden-screen.tsx`; O18: HTTP 200 with a forbidden marker [doc: Lot 2 §9] | Reuse, inside the staff shell |
| S1E | Staff account menu: e-mail, "Ieși din cont", "Ieși de pe toate dispozitivele"; **no "Profil"** | `account/session/account-control.tsx:105-106`: the staff menu holds "the profile and the way out only" [src]; O16 gave staff `account.manage.own` [doc] | **Keep the built "Profil" row** (a recorded departure from A19C already, Lot 2 §12.8 (f)); add "Zona personalului" (Lot 2 C24 said omit "until Lot 3 ships a page") |

### S2 — Bucătării clienți (`/[locale]/staff/kitchens`)

| Frames [mock] | What the design adds | Built today | Port |
| --- | --- | --- | --- |
| S2A–S2F (9) | Table: image, kitchen name (2-line clamp, full name as accessible name), client e-mail + profile name, **profile** phone + "neverificat", badges Trimisă / Ciornă / Ascunsă de client, request status ("—" for drafts), sent date, last change, "Deschide". Segments Trimise / Ciorne / Toate (default Trimise), search "e-mail sau nume", status select enabled only under Trimise. Page numbers on desktop, "Încarcă mai multe" on mobile. Empty per segment, no-results with "Șterge căutarea", 503, 401 sheet | Client-scoped list only: `GET /api/account/kitchens`, keyset, 12 per page, excludes hidden and deleted [doc: Lot 2 §12.1 S6a]. `designs.sent_at` is set for **any** design when its request is stored, account or not (`neon-account-kitchen-store.ts:402-410`) [src] | New `GET /api/staff/kitchens` (E-L3-1). Which kitchens are listed is P-L3-4 |

### S3 — Bucătăria clientului, read-only (`/[locale]/staff/kitchens/[id]`)

| Frames [mock] | What the design adds | Built today | Port |
| --- | --- | --- | --- |
| S3A, S3B, S3B2 | Three columns: a read-only 3D view ("randare 3D · doar citire") and "Configurația trimisă" (shape, walls, material, hardware, finish, cabinet counts, "de la … MDL") (`SUMM`, `:202`); status select + "Salvează" + "Ultima schimbare: {who}, {when}" (`ST`, `:206`); "Cererea trimisă către magazin" (name, phone, locality, channel, sent at; "Din cererea trimisă") (`REQ`, `:203`); "Contul clientului" (e-mail, name, phone neverificat; "Din profil") (`PROF`, `:204`); the caption "Accesul este înregistrat în jurnal." (`:208`); notes (`NOTECOL`, `:207`) | Read-only viewer exists: `app/s/[token]/shared-design-view.tsx` mounts `ConfigureScreen variant="shared"` with `canWrite: false` [src]; the mount guard admits exactly two files (`tests/app/configure-screen-single-mount.test.ts:23-26`) [src]. The frozen "as sent" copy lives in `contact_submission_views.design_document`, readable by the app role [src: `0010` header] | `GET /api/staff/kitchens/{id}` (E-L3-2), audited fail closed. The request block is the O-L3-1 (c) line (C-L3-2); nothing waits on it. The 3D column is P-L3-6 |
| S3C | Draft: no status, no request block, notes allowed; "Ciorna nu are cerere trimisă, deci nu are status." | — | Status control absent when `sent_at` is null |
| S3D, S3E | Hidden: banner "Clientul a ascuns această bucătărie și nu o mai poate deschide." + "Fă-o din nou vizibilă"; confirm with "Anulează" focused, Tab ① Anulează ② Fă-o vizibilă, not red (`HIDB`, `UNHIDE`, `:211`, `:214`) | `hidden_by_client_at` exists (`0016`) [src]; `design.unhide` is held by operator and administrator, wired to nothing (`capabilities.ts`) [src] | `POST /api/staff/kitchens/{id}/unhide` (E-L3-5) |
| S3F–S3F3, S3G | Note saving / saved (appears on top, field cleared) / error (text kept); status saved ("✓ Status salvat"); notes are never edited or deleted (CD answer 4) | No notes table, no status store | E-L3-3, E-L3-4; migrations `0021`, `0022` (provisional) |
| S3H, S3I | One answer for missing and forbidden; 503 | Lot 2's one refusal `designNotFoundResponse(id)` [doc: Lot 2 §2.2] | Same refusal word for staff routes |

### S4 — Personal (`/[locale]/staff/team`; accept: `/[locale]/staff/accept#t=…`)

| Frames [mock] | What the design adds | Built today | Port |
| --- | --- | --- | --- |
| S4A–S4E, S4K | Staff list (e-mail, name, role, "Invitat de", Invitație trimisă / Activ, date; "Contul tău" on the first row); invite drawer: E-mail, Rol (nothing preselected), Tab ① E-mail ② Rol ③ Trimite ④ Anulează; errors (MALFORMED, role missing, focus to the summary); neutral answer "Dacă adresa poate primi o invitație, i-am trimis-o." | **Nothing.** Staff exist only by the owner's console seed (runbook *Making the first administrator*) [doc]; the app role holds no `INSERT`/`UPDATE` on `accounts.role` (runbook step 4 for `0012`–`0015`) [doc] | O-L3-4 ruled (narrow `INSERT (role)`); outline until the decision record and a security review exist (CG-L3-4) |
| S4F–S4J, S4K2 | Plain token page "Activează contul": new password (12–128, breach check, `new-password`), busy, done "Contul este gata" + "Intră în cont", invalid "Invitația nu mai este valabilă", 503 keeps the token | The reset and revert token pages are the pattern (`reset-password-form.tsx`, `revert-email-form.tsx`, `fragment-token.ts`) [src] | Same pattern, after S4's server waves |

### S5 — Presete (`/[locale]/staff/presets`)

| Frames [mock] | What the design adds | Built today | Port |
| --- | --- | --- | --- |
| S5A–S5G | Grid of presets (thumbnail, generated or typed name, shape and size, badge Vizibil / Ascuns); "Ascunde" / "Arată" with a toast and **no confirm** (CD answer 7); reorder by a 44 px drag handle **and** "Mută mai sus" / "Mută mai jos"; order saving / saved / error-reverts; preview reuses 1G; no delete; the line "Presetele noi se creează din editor, cu „Salvează ca preset”." | `presets.status` is `published`/`hidden`; **the app role has no `UPDATE`; the owner hides by hand** (`0011` header) [src]. No position column; Step 1 lists `order by created_at desc, id` within the ±600 mm window, at most 8 (`preset-statements.ts:61-85`) [src]. The 1G preview is `room/preset-carousel-dialog.tsx` (M8D W2) [src] | O-L3-5 ruled yes; outline until the ADR 0112 amendment and a security review exist (CG-L3-5) |
| (editor 3S/3T) | "Salvează ca preset" shows only for `preset.create` (brief Part 3) | `preset-authoring-policy.ts`: `WIRED_PRESET_AUTHORING_POLICY = ungatedUntilLaunch`, with the comment "Fix 3 … wires the administrator capability `preset.create` here and the route does not change" [src] | Wave L3-A1, buildable now |

### S6 — Prețuri, S7 — Traduceri

Drawn in full (S6: 8 frames, S7: 7) [mock]. **Not ported**: deferred by the owner on 2026-10-20 (O-L3-2, O-L3-3; §5.3); see CG-L3-2 and CG-L3-3. Their
nav items are omitted until a page exists (C-L3-4).

### S8 — Jurnal de audit (`/[locale]/staff/audit`)

| Frames [mock] | What the design adds | Built today | Port |
| --- | --- | --- | --- |
| S8A–S8E | Read-only table: when, who (staff e-mail), action (bold), object (kitchen name + client e-mail, or invited address + role, or "3 prețuri"); filters person, action, from, to (`zz.ll.aaaa`); page numbers; "Jurnalul nu poate fi modificat."; empty, no results + "Șterge filtrele", 503. CD answer 6: client e-mail and kitchen name only, no phone, address or note text | No audit table; ADR 0172's Fix 3 table: "`audit_log` table, and `requireCapability` is the one place to add the write. No staff read of another's design exists yet, so no read goes unlogged" [doc] | Migration `0020` (provisional), E-L3-6 |

---

## 2. Server: what exists, what is missing, contracts, data and grants

### 2.1 Inventory

| Need | State | Evidence |
| --- | --- | --- |
| Capabilities for every staff action | **Exist**, wired to nothing: `design.read.any`, `design.unhide`, `contact.read`, `contact.update-status`, `note.write`, `preset.create`, `preset.manage`, `price.edit`, `translation.edit`, `user.manage`, `audit.read` | [src: `packages/configurator-domain/src/account/capabilities.ts`] |
| One capability function | **Exists**: `requireCapability(session, capability)`; design capabilities need a verified address | [src: `lib/server/account/require-capability.ts`] |
| Page gate | **Exists**: `readSignedInPage({locale, capability})` → signed-in / forbidden / unavailable, or a redirect to login | [src: `lib/server/account/signed-in-page.ts`] |
| Staff landing after sign-in | Start page (O10) | [src: `account/on-signed-in.ts:57-61`; doc: Lot 2 §9 O10] |
| Read any design | **Missing.** Every built read is the visitor arm or the owning-account arm (D9) | [doc: ADR 0172 D9 "Staff reading any design (`design.read.any`) is a later wave"] |
| Sent mark | Exists, any design, at request storage; not backfilled before S5 (O11) | [src; doc] |
| Request status, notes, audit | **Missing**, no tables | [run: `ls packages/persistence/src/migrations/` ends at `0019`] |
| Request's contact columns | **Unreadable** by `app_designs`: `SELECT` covers seven non-personal columns only | [doc: ADR 0153 d1; `0008` header] |
| As-sent document | `contact_submission_views.design_document` is fully readable; a row is minted when the shop notice is built (`deliver-notice.ts:165`) [src]. `contact_submissions.design_document` is **not** in the seven readable columns [src: `0008`] | — |
| Preset hide, order | **Missing**: no `UPDATE` on `presets`, no position column | [src: `0011` header] |
| Staff invitation | **Missing**; `accounts.role` is not writable by the app role | [doc: ADR 0172 D7; runbook step 4] |
| Price book, translations | Code constants and message files | [src: `price/price-book-root.ts`, `lib/server/shipped-price-book.ts`; doc: ADR 0095 decision 2] |

### 2.2 Contracts (provisional; every route follows the Lot 2 *Common* order)

**Common to every staff route** [doc: Lot 2 plan §2.2, kept]: `isCrossSiteRequest` first; JSON and bounded body on writes;
the session read server-side; **`requireCapability` with the capability named below**; domain validation; the limiter
(reads fail open, writes fail closed, ADR 0156); the work. `Cache-Control: private, no-store`. No request member names an
account, role or capability. Words: `401 unauthenticated`, `403 forbidden`, `429` + `Retry-After`, `503 unavailable`,
and **the one kitchen refusal** for unknown, malformed and client-deleted ids.

| # | Endpoint | Request | Answers | Capability | Audit (P-L3-3) |
| --- | --- | --- | --- | --- | --- |
| E-L3-1 | `GET /api/staff/kitchens?segment=&q=&status=&page=` | — | `200 {total, page, pageSize, kitchens:[{id, name\|null, client:{email, name\|null, phone\|null}\|null, isSent, isHidden, sentAt\|null, updatedAt, requestStatus\|null}]}`; `400 invalid-input` | `design.read.any` | none (a list is not a read of one kitchen) |
| E-L3-2 | `GET /api/staff/kitchens/{id}` | — | `200 {kitchen:{id, name, document, schemaVersion, isSent, isHidden, sentAt, updatedAt, asSent:{document, schemaVersion}\|null}, client\|null, request:{reference, sentAt}\|null, status:{value, changedBy, changedAt}\|null}`; refusal | `design.read.any` | `kitchen-opened`: the kitchen is read and its existence checked, **then** the row is inserted, **then** the body is sent; a refusal writes no row; a failed insert answers `503` with no kitchen data |
| E-L3-3 | `POST /api/staff/kitchens/{id}/notes` | `{text}` | `201 {note}`; `400 invalid-input` (field `text`); refusal | `note.write` | `note-added`, same transaction |
| E-L3-4 | `PUT /api/staff/kitchens/{id}/status` | `{status}` | `200 {status, changedBy, changedAt}`; `409 {status:"not-sent"}`; `400` | `contact.update-status` | `status-changed` (from, to), same transaction |
| E-L3-5 | `POST /api/staff/kitchens/{id}/unhide` | — | `204`; `409 {status:"not-hidden"}`; refusal | `design.unhide` | `kitchen-unhidden`, same transaction |
| E-L3-6 | `GET /api/staff/audit?actor=&action=&from=&to=&page=` | — | `200 {total, page, events:[{at, actor:{email}, action, object}]}` | `audit.read` | none |
| E-L3-7 | `GET /api/staff/presets`, `POST /api/staff/presets/{id}/visibility {visible}`, `POST /api/staff/presets/{id}/move {direction}` | — | `200` list incl. hidden; `204`; `409 {status:"at-edge"}` | `preset.manage` | `preset-hidden`, `preset-shown`, `preset-moved` |
| E-L3-8 | `POST /api/staff/invitations {email, role}`; `GET /api/staff/team`; `POST /api/staff/invitations/accept {token, newPassword}` | — | `202 {status:"invitation-queued"}` for every well-formed address; list; `200 {status:"account-ready"}` / one `400 link-invalid` | `user.manage`; accept: none (the token is the subject) | `staff-invited` (role; the invitation id, no address) |

E-L3-7 waits on O-L3-5, E-L3-8 on O-L3-4. The notes list rides E-L3-2 (newest first, P-L3-5).

### 2.3 Data and migrations (additive; numbers provisional)

**Numbering.** The worktree holds `0001`–`0019` and ADRs up to `0172` [run: `ls`]; the primary checkout's branch holds
`0001`–`0011` and ADRs up to `0171` [run: `ls`, read only]. `main` may move before Lot 3 merges, which is exactly how
0169 became 0172 (ADR 0172 *Remaining* item 9 [doc]). **Every number below is provisional**: wave L3-S1 re-lists
`migrations/` and `docs/decisions/` on this branch **and** on `origin/main` before writing a file.

| # (provisional) | What | Grants (owner, runbook form: preview first, pre-grant probes, no `DELETE`/`TRUNCATE`/`ALL`/`WITH GRANT OPTION`/`PUBLIC`) | Waits on |
| --- | --- | --- | --- |
| `0020_create_staff_audit_events.sql` | `id text pk` (nanoid shape), `occurred_at timestamptz not null default now()`, `actor_account_id text not null`, `action text not null` (shape check only; the closed list is code, ADR 0172 D10), `design_id text`, `subject_account_id text`, `detail jsonb` (object check; codes and counts only). Index `(occurred_at desc, id desc)`. No foreign key (the `0015` precedent) | `GRANT SELECT ON TABLE public.staff_audit_events TO app_designs;` `GRANT INSERT (id, actor_account_id, action, design_id, subject_account_id, detail) ON TABLE public.staff_audit_events TO app_designs;` — **no `INSERT (occurred_at)`** so a credential cannot backdate a row (the `0011` `created_at` reasoning [src]); no `UPDATE` | — |
| `0021_create_design_notes.sql` | `id text pk`, `design_id text not null`, `author_account_id text not null`, `body text not null` check `char_length(body) between 1 and 2000`, `created_at timestamptz not null default now()`. Index `(design_id, created_at desc)` | `GRANT SELECT ON TABLE public.design_notes TO app_designs;` `GRANT INSERT (id, design_id, author_account_id, body) ON TABLE public.design_notes TO app_designs;` — no `UPDATE`, matching "notes cannot be edited or deleted" (CD answer 4) | — |
| `0022_create_design_request_states.sql` | `design_id text pk`, `status text not null` (shape check), `changed_by_account_id text not null`, `changed_at timestamptz not null default now()` (P-L3-8: per design) | `GRANT SELECT, INSERT (design_id, status, changed_by_account_id) ON TABLE public.design_request_states TO app_designs;` `GRANT UPDATE (status, changed_by_account_id, changed_at) ON TABLE public.design_request_states TO app_designs;` | — |
| `0023_add_preset_sort_position.sql` | `presets.sort_position integer` (nullable; null sorts after every positioned preset); a partial unique index on `sort_position` where not null | `GRANT UPDATE (status, sort_position) ON TABLE public.presets TO app_designs;` — **reverses `0011`'s "the owner hides a preset by hand … the application role has no `UPDATE`"** | O-L3-5; ADR 0112 amendment |
| `0024_create_staff_invitations.sql` | `id text pk`, `email text not null`, `email_normal_form text not null`, `role text not null` check `role in ('operator','administrator')`, `token_hash text not null unique` (sha256 shape), `invited_by_account_id text not null`, `created_at default now()`, `expires_at timestamptz not null`, `used_at`, `accepted_account_id` | `SELECT`; `INSERT (id, email, email_normal_form, role, token_hash, invited_by_account_id, expires_at)`; `UPDATE (used_at, accepted_account_id)`; **plus, on `accounts`, `INSERT (role)`** under O-L3-4's default — the first grant that lets the application write a role (ADR 0172 D7 "temporary") | O-L3-4; a decision record; security review |

- `designs` needs **no grant**: unhide clears `hidden_by_client_at`, already under the table-level `UPDATE` of ADR 0019 d11
  whose scope Amendment G grew to that column [doc]. The scope does not grow again.
- **No index is added on `designs` for the staff list.** "Trimise, newest sent first" across every design and the search
  by address are sequential scans until a measured need (ADR 0118 [doc]). Trigger recorded in §9.
- **Every migration passes `migrate:unattended-check`** before review, and its header carries the frozen-bytes and
  ledger paragraphs of `0016` [src].
- **The privilege test** (`application-role-privileges.test.ts`) gains an arm per table above in the wave that adds it;
  the runbook section for `0020`+ is written in that wave (the scribe's form, as `0016`–`0019`).

---

## 3. Gaps and contradictions (classified)

Every row is a **contract gap** (the design and a record, or two records, disagree, or a record is silent). None is an
implementation defect or a test-fidelity problem: nothing is built.

**Settled 2026-10-20 (§5.3; ADR 0174):** CG-L3-1 by O-L3-1 (c); CG-L3-2 and CG-L3-3 by deferral (O-L3-2, O-L3-3); CG-L3-6 by
O-L3-6. CG-L3-4 and CG-L3-5 have their owner answer (O-L3-4, O-L3-5) and stay open until a decision record and a
security review exist. Where a "Default" or "Blocks" cell below reads as pending, §5.3 governs.

| # | Gap | Evidence | Default | Blocks |
| --- | --- | --- | --- | --- |
| **CG-L3-1** | **S3's request contact against ADR 0153 d1.** Name, phone, locality and channel are personal columns the app role cannot `SELECT` [src: `0008`]. ADR 0153 also says reading the stored snapshot back "would be a wider grant than Q14 and is the owner's" [doc: *What later waves inherit*], and gates any widening on a rolled-back probe [doc: d1]. Joining a request to an identified account is ADR 0172 D11's revisit trigger: "the first feature that reads both together" [doc]. S3 is that feature | Show the profile block, the request's **reference and date** (readable), and the as-sent copy from `contact_submission_views` when a row exists; no request contact on screen (O-L3-1 (c)) | S3 request block |
| **CG-L3-2** | **S6 against ADR 0062.** "Nothing is built for the dashboard in M6, M7 or M8. No admin UI, no auth, no write endpoints, no schema" [doc]. Fix 3's "administrator … edits prices" (2026-10-17) postdates 0062, and the only recorded narrowing of 0062 is for presets: `SUPERSESSIONS.md:11-13` reads "narrowed for the preset library only … the price dashboard itself still comes after M8", and the index row is "Partly superseded → 0112" (`decisions/README.md:85`) [run: §3.1 sweep]. ADR 0172 cites 0062 only for seam 1 (`0172…md:780`) [run]. The drawn rows (per m², per pair, per metre, LED strip, socket; `PR`, `:232`) do not exist in the book: the book is per-cabinet formula coefficients (`baseMinor`, `perWidthMillimetreMinor`, `perDoorLeafMinor`, `perHeightMillimetreMinor`) [src: `pricing/price-book.ts`]. The book is a code constant named by two roots [src]; ADR 0157 refuses a contact retry across a change of book [doc: title]; versioning (ADR 0072) and the depth multiplier (ADR 0100) are deferred **to the dashboard** [doc: titles] | Defer S6 to its own milestone: a decision record that supersedes ADR 0062's "not in M8" explicitly, a book-in-database design with versioning, and a redraw against the real shape | S6 |
| **CG-L3-3** | **S7 against ADR 0095 decision 2.** Copy lives in message files; Russian is gated at build time by completeness, ICU placeholder parity and "no silent fallback" [doc]. A run-time Russian overlay bypasses all three. The drawn "Lipsă" rows cannot exist: the completeness gate fails a build with a missing key [doc]. The drawn keys (`step1.title`, `review.send`, `account.empty`) are not this catalogue's [run: a read of `apps/web/src/messages/ro.json`: no top-level `step1` or `account` key exists, and `review` holds `bodyCount`, `refusalReasons`, `roomLine`, `roundedUpNote`, `title`, with no `send` or `price`] | Defer S7: it needs its own record (overlay storage, server-side ICU parity on save, cache and invalidation, who approves Russian under ADR 0095's Gate O2) | S7 |
| **CG-L3-4** | **S4 against ADR 0172 D7.** "The application cannot write `role`" … "The staff-management wave must choose its mechanism explicitly (a narrow grant, or a separate credential), with its own review" [doc]. Undecided too: an invited address that already holds an account. D7's residual says promotion strands a client's claimed designs [doc]. The neutral answer (S4E) and the list (S4A) disagree: a refused invitation adds no "Invitație trimisă" row, so the list tells the administrator what the sheet would not [inf]; an administrator already sees every client address in S2, so the leak is to a party who holds the fact | O-L3-4 default; a decision record; security review | S4 server and UI |
| **CG-L3-5** | **S5 against `0011` and ADR 0112.** No `UPDATE` on `presets`; hiding is the owner's console step [src]. No position; Step 1 is "newest first, at most 8, never a hidden" [doc: ADR 0112 line 211] within ±600 mm [src]. A drawn manual order must say what it does to Step 1 | O-L3-5 default | S5 |
| **CG-L3-6** | **Notes copy against O4 and O5.** S3 says notes "apar în exportul datelor clientului și se șterg odată cu contul" (`:207`) [mock]. O4 ruled the export holds profile and kitchens, requests and notes "may be added later if the privacy notice needs it"; O5 ruled no account deletion [doc: Lot 2 §9]. Rule 0.3-6 forbids promising both | O-L3-6 default | S3 note line; export |
| **CG-L3-7** | **Kitchens with no account.** A visitor's sent kitchen has `sent_at` [src] and no profile; its request contact is unreadable (CG-L3-1). No frame draws such a row: every row in `SR` / `DR` has an e-mail (`:172-183`) [mock] | P-L3-4 | S2, S3 |
| **CG-L3-8** | **Request status: per design or per request.** `0008` has no unique constraint on `design_id` [src], so a changed kitchen can be sent more than once (ADR 0163 shows a request again only for an **unchanged** kitchen [doc: title]). The brief says "the status belongs to a sent request" [doc]; S2 shows one status per kitchen [mock]. A checked, updatable status column on `contact_submissions` would break ADR 0153's rule "no constraint reads a column the role may `UPDATE`" [doc: d1] | P-L3-8: a separate table keyed by design | S2, S3 status |
| **CG-L3-9** | **The audit must exist before any staff read.** "Accesul este înregistrat în jurnal." must be true the day S3 ships, and the brief says every staff read and unhide is logged [doc] | Audit table and store land first; E-L3-2 writes before reading out (P-L3-3) | S3 |
| **CG-L3-10** | **The staff read is not the client gate.** Lot 2's S4 predicates exclude hidden and deleted rows on every client and visitor arm [doc: Lot 2 §12.1 S4]. Staff must see hidden rows (S3D). A staff arm that reused a client predicate would hide them; one that loosened a shared predicate would reopen hidden kitchens to clients | A separate, read-only staff store; the client predicates are untouched (criterion K-5) | S2, S3 |
| **CG-L3-11** | **The staff menu has no "Profil" (S1E) and Lot 2 built one** (O16) [src, doc] | Keep the built row (P-L3-9) | S1E |
| **CG-L3-12** | **Mobile staff header has "Meniu" in place of ‹** (CD answer 8), against brief rule 0.3-2 ("‹, the wordmark and the chip") [doc] | Accept for the staff family only (P-L3-9) | S1 mobile |

### 3.1 Decision-record sweep (WORKFLOW *Sweep the decision records before deciding*)

Run on 2026-10-20 in this worktree [run: `rtk proxy grep -rn` over `docs/decisions/` (records, `README.md`,
`SUPERSESSIONS.md`), `docs/OWNER_FIXES.md` and the M8C plan, for `0062`, `price dashboard`, `price.edit`,
`translation.edit`, `user.manage`, `audit_log`, `sort_position` and `reorder`; plus the headings of ADRs 0062, 0095,
0112].

| Record | What it says | How it is settled here |
| --- | --- | --- |
| ADR 0062 (2026-09-02) and its Amendment (2026-09-11) | No dashboard UI, auth, write endpoint or schema in M6–M8; the 2026-09-11 amendment makes an exception for the preset tool only, "nothing here moves the dashboard, which still comes after M8" (`0062…md:154-163`) | **Stands.** `SUPERSESSIONS.md:11-13` and `README.md:85` confirm only the preset narrowing. Fix 3's price editing (2026-10-17) is recorded as a requirement, not as a supersession. S6 is deferred (CG-L3-2) unless the owner rules otherwise (O-L3-2), and that ruling would need its own record that supersedes 0062 by name |
| ADR 0072, ADR 0100 | Versioning and the depth multiplier are deferred **to the dashboard** (titles) | Travel with S6 |
| ADR 0095 decision 2 and Amendments A–D (to 2026-09-10) | Copy in message files; Russian gated at build time | **Stands**; no later record admits a run-time overlay. S7 deferred (CG-L3-3, O-L3-3) |
| ADR 0112 decision 1, Amendment A (2026-10-17), dated note (2026-10-18); `0011` header | Status `published` / `hidden`, `status` excluded from the insert grant, the owner hides by hand, Step 1 newest first | **Stands until O-L3-5**; under its default an ADR 0112 amendment records the `UPDATE (status, sort_position)` grant and the new Step 1 order, superseding "newest first" by name |
| ADR 0172 D7 (2026-10-17, accepted 2026-10-18) | The app cannot write `role`; the staff-management wave chooses its mechanism explicitly | **Stands until O-L3-4** and the decision record that chooses the mechanism; D7 itself calls the point temporary |
| ADR 0153 d1 and *What later waves inherit* | No personal column readable; reading the stored snapshot is the owner's | **Stands**; O-L3-1's default (c) keeps it |
| No record | `translation.edit`, `user.manage`, `audit_log`, `sort_position` appear nowhere but ADR 0172's Fix 3 table and the capability list | Nothing to supersede; the new record of L3-W0 is the first |

---

## 4. Copy that promises something unbuilt, and the recommended ruling

| # | Frame | Copy as drawn [mock] | What backs it | Recommendation |
| --- | --- | --- | --- | --- |
| C-L3-1 | S3B, S3F | "Notele fac parte din datele clientului: apar în exportul datelor clientului și se șterg odată cu contul." | Export without notes (O4); no erasure (O5) | O-L3-6: notes join the export; the line keeps the drawn words and drops only the erasure clause: "Notele fac parte din datele clientului: apar în exportul datelor clientului." until erasure exists |
| C-L3-2 | S3B | "Cererea trimisă către magazin" block, "Din cererea trimisă", "Telefonul din cerere diferă de cel din profil…" | Unreadable columns (CG-L3-1) | O-L3-1 (c): replace with "Cererea trimisă: {reference}, {date}." + "Datele de contact din cerere sunt în e-mailul trimis magazinului." (new copy, owner) |
| C-L3-3 | S1E | Staff account menu without "Profil" | O16 | Keep "Profil" (P-L3-9) |
| C-L3-4 | S1A, S1B | Nav "Prețuri", "Traduceri" (and "Personal", "Presete" until their waves) | No page | **Each item appears in the wave that ships its page** (the Lot 2 C25 rule). Operator: one item; administrator: built items only |
| C-L3-5 | S5 sub-line | "Presetele noi se creează din editor, cu „Salvează ca preset”." | True once L3-A1 wires `preset.create` | Keep; S5 ships after L3-A1 |
| C-L3-6 | S3E | "Clientul o va vedea din nou în Bucătăriile mele și o va putea edita." | True: Lot 2's gate excludes only hidden and deleted [doc]. The share link revoked at hide (O7) stays revoked [inf: unhide writes no share row] | Keep; criterion K-6 makes "stays revoked" explicit. No promise about the link is made |
| C-L3-7 | S4 intro | "Nu există alt mod de a crea un cont de personal." | The owner's console seed exists (runbook) | Keep: the seed is an owner procedure, not a product path [inf]. Flag to the owner in O-L3-7 |
| C-L3-8 | S4, mail | The invitation e-mail | **Not drawn** | Draft subject and body (RO, RU) in L3-S12; owner approval (O-L3-7) |
| C-L3-9 | S2 status, S8 actions | "Nouă", "Contactat", "Ofertă trimisă", "Închisă" (a "draft list for the owner", CD answer 3); action labels | — | O-L3-7 approves the list and order |
| C-L3-10 | S8 sub-line | "Jurnalul nu poate fi modificat." | True for the app role (no `UPDATE`/`DELETE` grant, §2.3); the owner credential can | Keep; the privacy notice and runbook say the owner credential can |
| C-L3-11 | S1C | "Se deschide într-o filă nouă. Această pagină rămâne neschimbată." | P-L3-7 | Keep |
| C-L3-12 | S3H | "Poate nu există sau nu ai voie să o vezi." | One refusal (P-L3-4: deleted drafts refused) | Keep |

---

## 5. Rulings this port needs

### 5.1 Architect / coordinator rulings (P-rows)

| # | Question | Recommendation | Who |
| --- | --- | --- | --- |
| **P-L3-1** | Wave split | §7's waves replace any single "staff screens" row; S6/S7 are not planned | coordinator |
| **P-L3-2** | Routes and `proxy.ts` | Accept `/[locale]/staff/{kitchens,team,presets,audit}`, `/[locale]/staff/kitchens/{id}` and the token page `/[locale]/staff/accept`. A new `STAFF_FAMILY_SEGMENT = "staff"` with its own predicate (`isStaffPageIn`), admitting exactly those shapes; signed-in staff pages get `ACCOUNT_PAGE_HEADERS` (noindex, `private, no-store`, the site CSP), the accept page `ACCOUNT_TOKEN_PAGE_HEADERS` (`no-referrer`). Re-run Lot 1 criterion 13's encoded-segment and case probe on every new path [doc] | architect; security reviews |
| **P-L3-3** | **Audit, fail closed** | E-L3-2 reads the kitchen, refuses an unknown or deleted id with the one refusal and **no** audit row, then inserts `kitchen-opened` and awaits its commit, and only then sends the body; a failed insert answers `503` with no kitchen data. The invariant is "no `200` leaves without a committed audit row", not an order of statements. Every staff write (E-L3-3/4/5/7/8) commits its audit row **in the same transaction** as the change, so neither exists without the other. The list (E-L3-1) and the audit page (E-L3-6) are not logged. Rows hold **ids and codes**, never an address, phone, kitchen name or note text; the page resolves the actor's and client's address and the kitchen's name at read and shows "—" for one that no longer resolves | architect; security |
| **P-L3-4** | **Which kitchens staff see** | "Trimise" = `sent_at is not null`, **account or not** (a no-account row shows the client cell "Fără cont", new copy); "Ciorne" = `sent_at is null and account_id is not null` (a visitor's unsent drafts are not a client's, Q-F3-3 "all of a client's designs" [doc]); "Toate" = the union. **Client-deleted rows are refused everywhere** with the one refusal: the client was told "nu o vei mai putea deschide sau recupera" (O3), and Q-F3-9 says a deleted draft "may be removed for real" [doc]. Hidden rows appear in every segment with the badge. Sort: Trimise by `sent_at desc, id desc`; Ciorne and Toate by `updated_at desc, id desc`. Owner-visible: the operator sees no-account leads (they are the business) | architect; owner may object |
| **P-L3-5** | Notes | NFC, 1–2000 code points, newline allowed, other control and bidi-override characters refused (the `readTypedText` family); newest first; **no edit and no delete route** (CD answer 4); allowed on drafts and hidden kitchens; read with E-L3-2 under `design.read.any` | architect |
| **P-L3-6** | **S3's 3D column** | A third hydrator `staff/staff-kitchen-view.tsx` mounting `ConfigureScreen variant="shared"` with `canWrite: false` and its own sentinel id, admitted by name in `configure-screen-single-mount.test.ts` (its comment's reasoning for the share view applies [src]). It renders "as sent" when `asSent` exists, else the current document labelled "Varianta actuală" (new copy). If the shared variant cannot sit in a 640 px column without its chrome, the fallback is a full-width read-only section above the columns, decided by the visual reviewer at U3. **No geometry, anchor or scale changes**: the scene is the share view's, unchanged (`product-invariants.md` scope is untouched) | architect; visual |
| **P-L3-7** | S1C, session expired | Accept CD answer 8: "Intră în cont" is an `<a target="_blank" rel="noopener noreferrer">` to `/{locale}/account/login?reason=session-expired`; the sheet stays, the textarea keeps its value, and "Salvează nota" retried after sign-in in the other tab succeeds (the cookie is shared). Staff landing after sign-in stays the start page (O10) | architect |
| **P-L3-8** | Request status | Per **design** in `design_request_states` (one row, upserted); S3 shows the latest request's reference and date. Values are a closed list in the domain (`new`, `contacted`, `offer-sent`, `closed`), shape-checked in SQL only. Absent row = "Nouă" for a sent kitchen. Any value may follow any (no transition rule drawn). Status survives the client's hide and unhide | architect |
| **P-L3-9** | Departures from the drawn shell | Keep "Profil" in the staff menu (O16); add "Zona personalului" to the staff account menu (Lot 2 C24's condition is met once S2 exists); accept the mobile "Meniu" header for the staff family only | architect; visual |
| **P-L3-10** | Classifier | `account/account-answer.ts` is **extended** with the staff flows and classes (`not-sent`, `not-hidden`, `at-edge`, `invitation-queued`, `account-ready`), not duplicated (the Lot 2 rule [doc: §5]) | architect |
| **P-L3-11** | Limiter purposes (figures provisional, constants only) | Staff reads use the built read limiter (fails open). Writes: `staff-note-by-account` 120 / hour; `staff-status-by-account` 120 / hour; `staff-unhide-by-account` 60 / day; `staff-preset-by-account` 200 / day; `staff-invite-by-account` 20 / day plus `staff-invite-mail-by-address` 3 / day; accept: the built `account-token-complete-by-block`, before any read or argon2 | architect; owner may change figures |
| **P-L3-12** | Pagination | Desktop: page numbers over `limit/offset` with a total (the design's choice, CD S2B note); page size 20 for S2 ("1–20 din 143") and 25 for S8 ("1–25 din 1 204") [mock]. Mobile: the same pages, appended. Offset on a moving list may repeat or skip a row between requests; accepted for staff, stated in criterion K-9 | architect |
| **P-L3-13** | Search | Case-insensitive substring of the client's `email_normal_form` or profile `name`; `%`, `_` and `\` in the query are literals; at most 100 code points, counted after NFC and format-character stripping; empty means no search | architect |
| **P-L3-14** | Preset authoring gate | Wire `WIRED_PRESET_AUTHORING_POLICY` to "the session holds `preset.create`" (Fix 3 *Order* item 3, ADR 0172 *Consequences* [doc]). Owner-visible: once wired, only a seeded administrator can author presets on any environment; the launch-gate line for the ungated policy is closed by it | architect; security |

### 5.2 Owner questions (all seven ruled on 2026-10-20; rulings in §5.3)

The table below is kept as asked, with the default recommended at the time; where a ruling differs from or settles it,
§5.3 governs. Each had a recommended default. The owner answers one at a time; a later question does not depend on an earlier answer
except where stated.

| # | Question | Default (recommended) | Blocks |
| --- | --- | --- | --- |
| **O-L3-1** | **S3 and the request's contact (CG-L3-1).** The design shows the name, phone, locality and channel the client typed in the request. Today the application **cannot read them**, on purpose (ADR 0153: a leaked database password must not leak the leads). Options: (a) let the application read those columns, reversing that protection, and the stored snapshot too; (b) a second database login used only by the staff pages (a new secret you provision; it protects little if both secrets leak together); (c) show the profile's contact, the request's reference and date, and the as-sent kitchen from the shop's frozen copy, and point to the shop e-mail for the request's contact | **(c)** for Lot 3. The shop's notice already carries the request's contact, and a client with an account has its contact in the profile. Revisit (b) if operators report needing it on screen | S3 request block; CD answers 1 and 2 |
| **O-L3-2** | **Defer S6 Prețuri.** ADR 0062 (2026-09-02) says the price dashboard comes **after** M8 and nothing of it is built in M8; the drawn table lists items the price book does not have (it prices cabinets by formula, not per m² or per piece). Build now against a redraw, or defer to its own milestone? | **Defer**, with its own decision record (superseding ADR 0062's timing explicitly), a price-book-in-database design with versions, and a redraw. The "Prețuri" menu item is not shown until then | S6 |
| **O-L3-3** | **Defer S7 Traduceri.** Texts live in the message files and every build checks that Russian is complete and keeps each placeholder (ADR 0095). Editing Russian in a screen bypasses those checks, and the drawn "Lipsă" rows cannot occur. Build an editing overlay now, or defer? | **Defer**, with its own decision record. Russian changes keep going through the files and their review | S7 |
| **O-L3-4** | **Staff invitation (CG-L3-4).** To invite staff the application must, for the first time, write an account's role (ADR 0172 D7 kept that impossible on purpose). (a) A narrow database permission: the application may set a role when it **creates** an account, never **change** one. The database cannot tie that to an invitation: under (a) only the application's code and its review stop a bug or an injection from creating an administrator. That is the same order of risk ADR 0172 D7 already accepted (an injection could insert a session row for an existing administrator). (b) A separate database login used only by the accept step (a new secret you provision); it protects little if both secrets leak together. And: may an address that already has an account (a client) be invited? | **(a)**, with the limit stated above, and **no**: an address that already has any account is not invited (the administrator sees the neutral answer; no e-mail goes out), so no client's designs are stranded (D7's residual). Role change, deactivation and removal stay your console steps (CD answer 5). A security review and a decision record precede the build | S4 |
| **O-L3-5** | **Presets: hide and order from the screen (CG-L3-5).** Today you hide a preset by hand in the database and Step 1 shows the nearest presets **newest first**. S5 lets an administrator hide, show and order them. (a) Allow it (the application may change a preset's visibility and position, nothing else), and Step 1 then shows the nearest presets **in the administrator's order** (unordered ones after, newest first); (b) allow hide/show only, keep newest first | **(a)** | S5 |
| **O-L3-6** | **Notes and the client's data (CG-L3-6).** Notes about a client are their personal data. Should they join the client's own data download ("Exportă datele mele") as text and date, **without** the staff member's name? And since account deletion does not exist yet, the S3 line drops "se șterg odată cu contul" | **Yes** to both: the download gains notes (text, date); the line reads "Notele fac parte din datele clientului: apar în exportul datelor clientului." (the drawn words, minus the erasure clause) | S3 note line; an export wave |
| **O-L3-7** | **Lot 3 wording.** O27 and O28b approved Lot 1 and Lot 2 texts, not Lot 3's (the design marks them "provizorii"). Approve the Romanian as drawn (with this plan's changes C-L3-1, C-L3-2 and the new lines "Fără cont", "Varianta actuală"), the status list and order "Nouă → Contactat → Ofertă trimisă → Închisă", and the invitation e-mail as drafted later? | **Approve as drafted**, as O28b did: the leaves enter the copy lock marked `Drafted`, you may edit afterwards; Russian stays an agent draft, never pinned (ADR 0095) | copy lock; milestone close |

The designer's other §0.9 answers are taken as defaults by the architect, not asked: 3 ("Închisă" does not hide a row),
4 (notes are immutable), 5 (no role change, deactivation or resend), 6 (the log shows client e-mail and kitchen name
only), 7 (no confirm to hide a preset), 8 (new tab on expiry; the mobile "Meniu") [mock: `:399-404`].

### 5.3 Owner answers, 2026-10-20

Each ruling below was **given directly by the owner through AskUserQuestion** (relayed by the coordinator to the scribe;
the scribe ran nothing). They settle O-L3-1 to O-L3-7. None is a decision record yet: where a record is owed, it is
named, and no wave builds on the ruling before it exists.

| # | Ruling | Consequence for this plan |
| --- | --- | --- |
| **O-L3-1** | **Option (c).** The staff view shows the account's profile contact, the request's reference and date, and the as-sent kitchen. **ADR 0153 d1 is unchanged**: the application still reads no personal column of a request | CG-L3-1 settled by its default. L3-U3's request line is the (c) line (C-L3-2 wording); no wave waits on this any more |
| **O-L3-2** | **S6 Prețuri deferred**, under its own record that names ADR 0062, plus a redraw against the price book's real shape | S6 stays out (§10 item 1); "Prețuri" nav item not shown. The record and the redraw are owed, unscheduled |
| **O-L3-3** | **S7 Traduceri deferred** | S7 stays out (§10 item 2); "Traduceri" nav item not shown. It needs its own record (CG-L3-3), unscheduled |
| **O-L3-4** | The owner chose the **narrow `INSERT (role)` grant** (a database permission to set a role when an account is created), **no `UPDATE (role)`**. The default stood, the owner not ruling otherwise: **no invitation to an address that already has an account**. Role change and deactivation stay owner-console steps | Unblocks Phase C waves **L3-S12a, L3-S12b, L3-U8, L3-U9 in principle only**; they **stay outline until a new decision record exists** and a **security review** has read it, before any wave builds them. See the flags below |
| **O-L3-5** | **Yes.** The application may `UPDATE` only `status` and `sort_position` on `presets`; a new `sort_position` column; Step 1 follows the administrator's order (unordered presets after, newest first) | Unblocks Phase C preset waves (L3-S10, L3-S11, L3-U7) **in principle**; needs the ADR 0112 amendment as a **decision record** and a **security review** before any wave builds it |
| **O-L3-6** | **Yes.** Notes appear in the client's data export (text and date, **no staff author**). The S3 line **drops "se șterg odată cu contul"** and reads "Notele fac parte din datele clientului: apar în exportul datelor clientului." | CG-L3-6 settled; C-L3-1 as recommended; L3-S9 is no longer conditional |
| **O-L3-7** | Lot 3 **RO and RU copy, the status list ("Nouă → Contactat → Ofertă trimisă → Închisă") and the invitation e-mail are pre-approved as drafted**, as O28b did for Lot 2 | New leaves enter the copy lock marked **`Drafted`** (the owner may edit afterwards); RU stays an agent draft, never pinned (ADR 0095) |

**Flags on O-L3-4 and O-L3-5.**

- **O-L3-4 reverses the ADR 0172 D7 position for role writes.** D7 says the application cannot write `role` and that the
  staff-management wave must choose its mechanism explicitly with its own review; the owner has now chosen a mechanism
  that makes the application able to write `role` on insert for the first time. D7 is not edited here; the new decision
  record supersedes that point by name, and until it exists D7 stands.
- **Residual risk, as the architect wrote it (O-L3-4 (a)):** "The database cannot tie that to an invitation: under (a)
  only the application's code and its review stop a bug or an injection from creating an administrator. That is the same
  order of risk ADR 0172 D7 already accepted (an injection could insert a session row for an existing administrator)."
  The alternative (b), a separate login used only by the accept step, "protects little if both secrets leak together"
  and was not chosen.
- **O-L3-5 reverses `0011`'s "the owner hides a preset by hand; the application role has no `UPDATE`"** and supersedes
  ADR 0112's "newest first" Step 1 order by name.

---

## 6. Module boundaries

| Layer | New or changed | May import | Must not |
| --- | --- | --- | --- |
| `packages/configurator-domain/src/staff/` | `staff-audit-action.ts` (closed list and detail shapes), `request-status.ts`, `note-text.ts` (`judgeNoteText`), `staff-kitchen-query.ts` (segment, status, search, page validation), `staff-invitation.ts` (later) | `account/input-checks.ts`, `capabilities.ts`, `password-policy.ts` | I/O; sentences (ADR 0095: codes only) |
| `packages/persistence/src/` | `staff-audit-store.ts` + Neon + fake; `staff-kitchen-reader.ts` + Neon + fake (**read only**); `staff-kitchen-actions-store.ts` + Neon + fake (notes, status, unhide, each with its audit row); later `staff-preset-store.ts`, `staff-invitation-store.ts`; migrations `0020`+ | the driver (only here) | any statement that writes `designs` other than `hidden_by_client_at`; any import of the client kitchen predicates' internals |
| `apps/web/src/lib/server/staff/` | `staff-kitchens.ts`, `staff-kitchen-actions.ts`, `staff-audit-log.ts`, `staff-page.ts` (the page gate, on `readSignedInPage`), `staff-responses.ts` | domain, persistence ports, `rate-limit/`, `account/require-capability.ts`, `account/current-session.ts` | client imports (`server-only`) |
| `apps/web/src/app/api/staff/**` | one route file per endpoint of §2.2 | `lib/server/staff/*` | business rules in a route file |
| `apps/web/src/app/[locale]/staff/**` | page shells | `staff-page.ts`, `src/staff/*` | copy, styles, `"use client"` |
| `apps/web/src/staff/` | shell, nav, list, kitchen view, notes, status, unhide dialog, staff session sheet, later presets / team / accept / audit | `account/account-answer.ts` (extended), `account/send-account-request.ts`, `components/use-modal-focus.ts`, `account/account-dialog.tsx`, `account/status-toast.tsx`, `price/price-book-root.ts` (`priceFloorOf`), `room/preset-carousel-dialog.tsx` (S5G) | `next/link`, `@/i18n/navigation`, `document.cookie`, `localStorage`, `sessionStorage` (the Lot 2 M1 rule [doc]) |

**Shared files land in sequence, never in parallel waves:** `proxy.ts`, `limit-policy.ts`, `account-answer.ts`,
`persistence/src/index.ts`, `staff.module.css`, the three catalogues and `approved-romanian-messages.ts`,
`configure-screen-single-mount.test.ts`.

---

## 7. Waves

**Common to every wave.**

- **QA:** adversarial, gates review (WORKFLOW *QA before review*). Each criterion in §8 that the wave owns gets a test that
  can fail for the reason its title names, with a **mutation proof** (a deliberate break turns it red), as Lot 2 §13.
- **Verification:** `pnpm format:check`, `pnpm gate:boundary`, `pnpm lint`, `pnpm typecheck`, the wave's test files, and
  `pnpm --filter @lemnaria/web build`; each exit code quoted through `rtk proxy` by the implementer and again by the
  coordinator. Persistence waves also run the live suite against the **test** database (ADR 0006); no agent runs a
  migration or a grant on preview or production, or reads or writes any `.env` file.
- **Visual method:** Lot 1 review §3.5 [doc]: a production build on `E2E_PORT` 4320; **1920 × 1080 first** for Lot 3,
  then 390 × 844; states reached by `page.route` mocks (migrations are unapplied); RO and RU.
- **Tiers** (WORKFLOW *How much review*): **Full + security** = adversarial QA, then logic, clean-code and security
  reviewers in parallel (persistence, routes, auth, `proxy.ts`, domain). **Full + security + visual** = the same plus the
  visual reviewer (every UI wave: staff UI shows customer data). **Security-reviewed docs** = the scribe plus one security
  reviewer.
- **Limits:** at most 5 items and 5 production files per wave; migrations count; catalogues, the copy lock and docs are
  listed but not counted (the Lot 2 §2.4 convention).

**Reviewer reading, common** (pasted into every reviewer dispatch, with the wave's row added):

- **Security:** this file §2.2, §2.3, §3 (CG-L3-1, 4, 9, 10), §5.1 (P-L3-2, 3, 4, 11, 14); ADR 0172 D3, D7, D9, D10,
  D11, Amendment G item 3; ADR 0153 d1 and *What later waves inherit*; ADR 0019 d11 and its 2026-10-18 note; ADR 0156;
  `proxy.ts`, `require-capability.ts`, `current-session.ts`, `signed-in-page.ts`.
- **Logic:** this file §1 (the wave's screens), §2.2 (its endpoints), §8 (its criteria); `account-answer.ts`; the
  orchestration file the wave names.
- **Clean code:** `docs/best-practices/engineering-conventions.md` *Code and domain boundaries*, *UI and content*,
  *Localised copy*; `~/.claude/rules/clean-code.md`.
- **Visual:** this file §1 (the wave's frames) and §4 (its C-rows); `docs/design/mockups/Lemnaria Cont Lot 3.dc.html`
  and `ContBlocks2.dc.html` as text (frame ids cited); `browser-and-visual-qa.md`; ADR 0104; `staff.module.css`,
  `account.module.css`; Lot 1 review §2.6.

**QA reading, common:** this file §8 (the wave's criteria) and §2.2; `engineering-conventions.md` *Tests*;
`javascript-testing-expert` for the property criteria (K-1, K-3, K-9, K-13, K-18, K-21); for S-waves the persistence
fakes and `packages/persistence/tests/*.statements.test.ts`; for U-waves `browser-and-visual-qa.md`.

### 7.1 Phase 0 and A: records, and what is buildable without an owner answer

| Wave | Items (≤ 5) | Production files (≤ 5) | Reading (implementer) | Depends | Tier |
| --- | --- | --- | --- | --- | --- |
| **L3-W0, records** (scribe; no code) | 1. Copy the two mockups (§0.1) verbatim, check both sha256, README rows. 2. Render Lot 2 after the `ContBlocks2` replacement and record the result. 3. A new decision record (provisional **ADR 0173**, number re-checked on `origin/main`) for the staff area: P-L3-2 to P-L3-14 as coordinator-accepted, the audit rule, the staff read arm. 4. Record owner answers to O-L3-n as they arrive. 5. STATUS row | docs only | this file §0.1, §3, §5; `docs/design/README.md`; ADR 0172 Amendment H (form) | coordinator's acceptance of P-rows | Security-reviewed docs |
| **L3-A1, preset authoring gate** | 1. `preset-authoring-policy.ts`: a policy that reads the session and answers `isCapabilityHeld(session, "preset.create")`; wire it. 2. The launch gate no longer refuses for this line. 3. Fail closed on a session read failure (the existing `mayAuthorPresets` catch). 4. `GET /api/designs/{id}`'s "may author" answer follows unchanged (same function) | `lib/server/preset/preset-authoring-policy.ts` (mod), the launch-gate script it names (mod, if it lists the policy by name) | §5.1 P-L3-14; ADR 0112 Amendment A; `preset-authoring-policy.ts` header; `current-session.ts`; `require-capability.ts`; ADR 0172 *Consequences* | L3-W0 | Full + security |
| **L3-S1, migrations** | 1. Re-list numbers on this branch and `origin/main`. 2. `0020` audit, `0021` notes, `0022` request states, as §2.3. 3. `migrate:unattended-check` green. 4. Runbook section for `0020`–`0022` (grants, pre-grant probes, catalog checks), as the `0016`–`0019` section. 5. Privilege-test arms for the three tables | three migration files | §2.3; runbook `0016`–`0019` section; `0016`, `0011` headers; ADR 0153 d1 (the rule on updatable columns); ADR 0172 D10 | L3-W0 | Full + security |
| **L3-S2, domain** | 1. `staff-audit-action.ts`. 2. `request-status.ts`. 3. `note-text.ts`. 4. `staff-kitchen-query.ts` (segment, status only with "sent", search P-L3-13, page ≥ 1). 5. Exports | the four files + `index.ts` (mod) | §5.1 P-L3-4, 5, 8, 12, 13; `account/input-checks.ts`; ADR 0095 decision 3 | L3-W0 | Full |
| **L3-S3, audit store** | 1. Port `StaffAuditStore` (`record` inside a caller's transaction; `page(filter)`). 2. Neon. 3. Fake. 4. Statement tests. 5. Export | `staff-audit-store.ts`, `neon-staff-audit-store.ts`, `fake-staff-audit-store.ts`, `index.ts` (mod) | §2.3 `0020`; P-L3-3; ADR 0146 B3; `neon-account-kitchen-store.ts` (style) | L3-S1, L3-S2 | Full + security |
| **L3-S4, staff kitchen reader** | 1. Port: `listPage(query)` with total, `readOne(id)` (hidden included, deleted refused, profile join, latest request reference and date, as-sent from `contact_submission_views`, status row). 2. Neon. 3. Fake. 4. **No method writes.** | `staff-kitchen-reader.ts`, `neon-staff-kitchen-reader.ts`, `fake-staff-kitchen-reader.ts`, `index.ts` (mod) | §2.2 E-L3-1/2; P-L3-4, 8, 12, 13; CG-L3-10; `0008`, `0010`, `0015`, `0016`, `0017` headers; `neon-account-kitchen-store.ts:90-130` | L3-S1, L3-S2 | Full + security |
| **L3-S5, staff actions store** | 1. `addNote` + audit row, one transaction. 2. `setStatus` (upsert, only where `sent_at` is not null) + audit. 3. `unhide` (`update designs set hidden_by_client_at = null where id = $1 and hidden_by_client_at is not null and deleted_by_client_at is null`) + audit. 4. Fake with the same atomicity. 5. Export | `staff-kitchen-actions-store.ts`, `neon-staff-kitchen-actions-store.ts`, `fake-staff-kitchen-actions-store.ts`, `index.ts` (mod) | §2.2 E-L3-3/4/5; P-L3-3, 5, 8; ADR 0019 d11; Amendment G item 3 | L3-S3 | Full + security |
| **L3-S6, read routes** | 1. `staff-kitchens.ts` orchestration (list; one, with the audit write awaited before the body). 2. `GET /api/staff/kitchens`. 3. `GET /api/staff/kitchens/{id}`. 4. `staff-responses.ts`. 5. Limiter wiring | `lib/server/staff/staff-kitchens.ts`, `lib/server/staff/staff-responses.ts`, two route files, `rate-limit/limit-policy.ts` (mod) | §2.2 *Common*, E-L3-1/2; P-L3-3, 11; `account-responses.ts`; `design-errors.ts`; ADR 0156 | L3-S4, L3-S3 | Full + security |
| **L3-S7, write routes** | 1. `staff-kitchen-actions.ts`. 2. Notes route. 3. Status route. 4. Unhide route. 5. Limiter purposes | `lib/server/staff/staff-kitchen-actions.ts`, three route files, `limit-policy.ts` (mod) | §2.2 E-L3-3/4/5; P-L3-10, 11 | L3-S5, L3-S6 | Full + security |

**Brief notes from the L3-S1 security review, 2026-10-21** [relayed; not run by the scribe]. Details: ADR 0173, *Accepted
residuals*; runbook `0020`–`0022` section, *Conditions on the store*.

- **L3-S3 / L3-S8 (audit).** An action with no detail stores SQL `NULL`, not JSON `null`. The audit page must render rows
  whose `action` or `detail` the domain refuses (it must not drop or throw on them). Page by offset: keyset paging would
  miss rows that commit late.
- **L3-S5 (actions store).** Add `, id desc` to the notes `order by`. An unknown stored status must not be coerced to
  "Nouă"; acceptance test required. The audit row's `from` must come from the same locked read, or the upsert's returning
  clause, as the write. Decide whether a no-op status save (same status) writes an audit row.
- **L3-S5 (the audit statement, from the L3-S3 reviews).** The audit insert is **unconditional on the caller's write**: in a
  `[write, audit]` batch a write that changes nothing still commits an audit row, so S5's own write must raise (a
  SQLSTATE other than 22012) when it changes nothing, and S5 maps that to its 409; `staffAuditStoreErrorFrom` reads 22012
  as `not-recorded` for any batch, so S5 classifies its own raise first; the batch is not retried (the event id is minted
  once; a repeat after a lost acknowledgement double-inserts or hits the primary key); `requireOneAuditRowInserted` takes
  the audit statement's own element of the batch reply. The port's doc comments (`staff-audit-store.ts`) carry the same four.
- **L3-S8 (audit page).** The "Persoană" dropdown has no data source (the team list is deferred): S8 uses a typed filter
  or adds a staff-accounts listing, an owner decision at S8. S8 validates actor, action and the dates and turns each day
  into the half-open window with `chisinauDayOf`, where `occurredBefore` is the start of the next Chisinau day (never +24 h).
  Residual, measured on the test database: the page's count scans every matching row, as any total must; the page itself
  walks the newest-first index (`not materialized`).
- **L3-S6.** Owner question (open): E-L3-1 returns e-mail, name and phone in bulk and is not itself audited (ADR 0173).
- **L3-U4 (notes UI).** A tab or CR in a note makes the domain refuse it; the UI must name that cause in its error.

### 7.2 Phase B: the staff UI on built endpoints

| Wave | Items | Production files | Reading (implementer) | Depends | Tier |
| --- | --- | --- | --- | --- | --- |
| **L3-U1, shell** | 1. `proxy.ts`: the staff family (P-L3-2). 2. `staff-page.ts` gate (capability per page; nav items computed from held capabilities and built pages). 3. `staff-shell.tsx` (top bar with role chip, account control, chip; desktop nav). 4. `staff-nav-sheet.tsx` (mobile "Meniu", trapped focus, Esc, return to opener). 5. `staff.module.css` | `proxy.ts` (mod), `lib/server/staff/staff-page.ts`, `staff/staff-shell.tsx`, `staff/staff-nav-sheet.tsx`, `staff/staff.module.css` | §1 S1; §4 C-L3-4; P-L3-2, 9; `proxy.ts:20-50,295-323`; `signed-in-page.ts`; `forbidden-screen.tsx`; `use-modal-focus.ts`; frames S1A, S1B, S1D, DS1A, DS1B, DS1D | L3-W0 | Full + security + visual |
| **L3-U2, S2 list** | 1. Page shell. 2. `staff-kitchens-list.tsx` (table desktop, cards mobile, badges with text, 2-line clamp with full accessible name). 3. `use-staff-kitchens.ts`. 4. `staff-kitchen-filters.tsx` (segments, search with 44 px clear, status select disabled with its hint off "Trimise"). 5. `staff-pagination.tsx` | `app/[locale]/staff/kitchens/page.tsx`, `staff/staff-kitchens-list.tsx`, `staff/use-staff-kitchens.ts`, `staff/staff-kitchen-filters.tsx`, `staff/staff-pagination.tsx` | §1 S2; §5.1 P-L3-4, 12, 13; `account-answer.ts`; frames S2A–S2F, DS2A–DS2F; catalogue `staffKitchens` | L3-U1, L3-S6 | Full + security + visual |
| **L3-U3, S3 read-only** | 1. Page shell. 2. `staff-kitchen-page.tsx` (three columns; summary via `priceFloorOf`; profile block; request reference line per O-L3-1; caption "Accesul este înregistrat în jurnal."). 3. `use-staff-kitchen.ts`. 4. `staff-kitchen-view.tsx` (P-L3-6; admitted in the mount guard test). 5. S3H, S3I states | `app/[locale]/staff/kitchens/[id]/page.tsx`, `staff/staff-kitchen-page.tsx`, `staff/use-staff-kitchen.ts`, `staff/staff-kitchen-view.tsx` | §1 S3; P-L3-6; C-L3-2; `app/s/[token]/shared-design-view.tsx`; `configure-screen-single-mount.test.ts`; `price/price-book-root.ts`; the review summary model the review page uses; frames S3A, S3B, S3B2, S3C, S3H, S3I | L3-U2; O-L3-1 ruled (c), no longer waits | Full + security + visual |
| **L3-U4, S3 actions** | 1. `staff-notes.tsx` (list, textarea with label and "{n} / 2000", busy keeps width, saved on top, error keeps text). 2. `staff-status-control.tsx` (select, "Salvează" → "✓ Status salvat", last change). 3. `unhide-banner.tsx` + dialog (Anulează focused, not red). 4. `use-staff-kitchen-actions.ts`. 5. `staff-session-sheet.tsx` (P-L3-7) | five files under `staff/` | §1 S1C, S3D–S3G; P-L3-5, 7, 8; C-L3-1, 6; `account-dialog.tsx`; `session-expired-sheet.tsx`; frames S1C, S3D–S3G | L3-U3, L3-S7 | Full + security + visual |
| **L3-U5, header entry** | 1. `account-control.tsx`: "Zona personalului" for a session holding `design.read.any`, linking to `/{locale}/staff/kitchens`, full load. 2. S1E menu at 44 px | `account/session/account-control.tsx` (mod) | P-L3-9; Lot 2 §1 A19, C24; frame S1E | L3-U2 | Full + security + visual |
| **L3-S8, audit read + L3-U6, S8 page** | S8: 1. `GET /api/staff/audit` (`audit.read`; filters; dates are Chișinău local days turned into UTC bounds). 2. Resolution of ids to addresses and names at read. U6: 3. Page shell and `staff-audit-page.tsx` (table, filters, "Șterge filtrele", page numbers). 4. `use-staff-audit.ts` | `lib/server/staff/staff-audit-log.ts`, route file; then `app/[locale]/staff/audit/page.tsx`, `staff/staff-audit-page.tsx`, `staff/use-staff-audit.ts` (two waves: S8 Full + security, U6 Full + security + visual) | §1 S8; P-L3-3; CD answer 6; frames S8A–S8E | L3-S3, L3-U1 | as stated |
| **L3-S9, notes in the export** (if O-L3-6 yes) | 1. `export-account.ts`: notes per kitchen (text, `createdAt`; no author). 2. A reader method on the notes store. 3. The bound counted against O26's cap | `lib/server/account/export-account.ts` (mod), the notes reader (mod) | Lot 2 §2.2 E10, §9 O4, O26; P-L3-5 | L3-S5; O-L3-6 ruled yes | Full + security |

**L3-U2 notes carried from the L3-U1 reviews.**

- L3-U2 must add a built-server probe asserting a 404 for the escaped-family (`/ro/st%61ff/kitchens`), escaped-page (`/ro/staff/%6Bitchens`) and case-variant (`/ro/Staff/kitchens`, `/ro/staff/KITCHENS`) spellings once a staff `page.tsx` exists. The same gap exists for the account family (`/ro/%61ccount/...`).
- L3-U2 must recheck K-12's "O18: 200 plus the marker" on the real page, which no U1 test can reach.

### 7.3 Phase C: after an owner answer and a decision record (outline)

**Status after the 2026-10-20 rulings (§5.3).** O-L3-4 and O-L3-5 are answered, so L3-S10, L3-S11, L3-U7, L3-S12a,
L3-S12b, L3-U8 and L3-U9 are **unblocked in principle** and **remain outline**: none is written in full or dispatched
until (1) the decision record for each (the ADR 0112 amendment for presets; the staff-invitation record that supersedes
ADR 0172 D7's role-write point) exists and (2) a security review has read it. O-L3-6 is answered, so L3-S9 is
unconditional. S6 and S7 have no wave (deferred, O-L3-2, O-L3-3).

These rows are an outline. The rows the *Order* paragraph names separately (L3-S11, L3-S12a, L3-S12b) are written in
full, with items, files, reading and tier, once their records exist (O-L3-4 and O-L3-5 are answered); a split is
named where a row below would pass 5 files.

| Wave | Items | Production files | Reading | Depends | Tier |
| --- | --- | --- | --- | --- | --- |
| **L3-S10, presets server** | 1. `0023` (§2.3) and its runbook section. 2. `staff-preset-store.ts` (+ Neon, fake): list incl. hidden, set visibility, move up/down, each with its audit row. A move is one transaction of three statements, because the partial unique index on `sort_position` is checked per statement: set A to null, set B to A's old position, set A to B's old position; an unpositioned preset is given positions first, in the grid's current order. 3. `preset-statements.ts`: Step 1 `order by sort_position asc nulls last, created_at desc, id`. 4. Routes E-L3-7 | migration, three store files, `preset-statements.ts` (mod); routes in **L3-S11** (≤ 5 files) | §2.3 `0023`; CG-L3-5; ADR 0112 (amended per O-L3-5); `0011` header; `preset-statements.ts:61-85` | O-L3-5 ruled yes; ADR 0112 amendment (record + security review owed) | Full + security |
| **L3-U7, S5 page** | 1. Page. 2. `staff-presets-grid.tsx` (badge with text; Ascunde / Arată with a toast that promises no undo; Mută mai sus / jos, disabled at the edges; a drag handle of 44 px with the buttons as its keyboard alternative). 3. `use-staff-presets.ts` (saving, saved, error reverts the order in place and says so). 4. Preview: `room/preset-carousel-dialog.tsx` reused | page, two `staff/` files | §1 S5; frames S5A–S5G; M8D W2 | L3-S11, L3-U1 | Full + security + visual |
| **L3-S12, invitations server** | 1. `0024` and its runbook section, including the `accounts INSERT (role)` grant (O-L3-4 (a)). 2. Domain `staff-invitation.ts` (role closed to operator / administrator; lifetime 72 h, provisional). 3. Store: create (refused silently when any account holds the address), list team, accept (one transaction: insert the account with the invitation's role and `email_verified_at`, mark used; a unique violation is `link-invalid`, never `500`). 4. Mail kind `staff-invitation` through the customer port (D6), sent after the response. 5. Flip the runbook's `0012`–`0015` step-7 probe `role insert` and the privilege test's arm to expect `true`, keeping `role update` `false` | migration, domain file, store port + Neon + fake (split into **L3-S12a** store and **L3-S12b** routes + mail if over 5 files) | CG-L3-4; O-L3-4; ADR 0172 D1, D2, D5, D6, D7; `register-account.ts` (neutral answer and statement parity); `reset-password.ts`; runbook *Making the first administrator* | O-L3-4 ruled (narrow `INSERT (role)`); the decision record and its security review (owed) | Full + security |
| **L3-U8, S4 list and invite** | 1. Page. 2. `staff-team-list.tsx` ("Contul tău"). 3. `invite-drawer.tsx` (Tab order; no role preselected; summary-first errors; neutral answer). 4. `use-staff-invite.ts` | page, three `staff/` files | §1 S4; frames S4A–S4E, S4K | L3-S12b, L3-U1 | Full + security + visual |
| **L3-U9, accept page** | 1. Page (`connection()`). 2. `proxy.ts`: `staff/accept` gets the token headers. 3. `accept-invitation-form.tsx` (`new-password`, no repeat, no meter; busy; done → full load to login; invalid; 503 keeps token). 4. `use-accept-invitation.ts` (reuses `fragment-token.ts`) | page, `proxy.ts` (mod), two `staff/` files | §1 S4; Lot 1 review criteria 4, 13, 15; `reset-password-form.tsx`; frames S4F–S4J, S4K2 | L3-S12b | Full + security + visual |

**Order.** L3-W0 → L3-A1 (independent) and L3-S1 → L3-S2 → L3-S3 → L3-S4 → L3-S5 → L3-S6 → L3-S7. L3-U1 can run after
L3-W0 in parallel with the S-waves (it shares no file with them). L3-U2 after L3-S6; L3-U3 after L3-U2; L3-U4 after
L3-U3 and L3-S7; L3-U5 after L3-U2; L3-S8 after L3-S3, L3-U6 after L3-S8 and L3-U1; L3-S9 after L3-S5 and O-L3-6.
Phase C starts only on its owner answer and record: presets L3-S10 → L3-S11 → L3-U7; team L3-S12a → L3-S12b → L3-U8 →
L3-U9. `proxy.ts` is touched by L3-U1 and L3-U9 only, in that order; `limit-policy.ts` by L3-S6, L3-S7, L3-S8, L3-S11,
L3-S12b in that order.

**Copy keys** (RO source from the mock, RU from the mock's RU cards as an agent draft; every RO leaf enters
`apps/web/tests/support/approved-romanian-messages.ts` in the wave that adds it, marked `Drafted` until O-L3-7, because
the lock is whole-file and a leaf missing from it fails `romanian-copy-lock.test.ts` [src: the file's header, lines 3-6];
RU is never pinned, only completeness and ICU parity [doc: ADR 0095 decision 2]):

| Namespace (new) | Holds | Wave |
| --- | --- | --- |
| `staffShell` | area name, nav items, role chip labels, "Meniu", forbidden screen reuse, session sheet (S1C) | L3-U1, L3-U4 |
| `staffKitchens` | title, segments, search label and placeholder, status filter and its hint, columns, badges ("Ascunsă de client", "Fără cont"), empty and no-result texts, "Șterge căutarea", count `{count, plural, one {# bucătărie} few {# bucătării} other {# de bucătării}}`-style with «de» from twenty (O17 [doc]; the mock's `rod` rule matches it, `:153` [mock]), pagination "Se afișează {from}–{to} din {total}" | L3-U2 |
| `staffKitchen` | summary labels, "Varianta actuală", profile and request lines, caption, status labels and "Ultima schimbare: {name}, {when}", unhide banner and dialog, notes (title, count plural, field label, counter, saved, error, the data line per O-L3-6) | L3-U3, L3-U4 |
| `staffAudit` | title, filters, action labels (CD's list), empty, no results, "Jurnalul nu poate fi modificat." | L3-U6 |
| `staffPresets`, `staffTeam`, `staffInvite`, `accountMail.staffInvitation` | Phase C | L3-U7 to L3-U9, L3-S12b |

Under ADR 0095 decision 3 the domain publishes codes (status, action, segment), never Romanian; the UI maps codes to keys.

---

## 8. Acceptance criteria

Each states an invariant and what must not happen. "Property" means a `fast-check` property over the stated range.

- **K-1. Capability per route (exhaustive table).** For every staff route and every caller in {anonymous, client
  verified, client unverified, operator, administrator, operator unverified}, the answer is `401` for anonymous, `403`
  for a session without the route's capability (§2.2), and the route's success otherwise. **Must not:** a client or an
  unverified staff session gets any `2xx` from `/api/staff/**`; an operator gets `2xx` from E-L3-6, E-L3-7 or E-L3-8; a
  role, capability or account id in the body or a header changes any answer.
- **K-2. No kitchen leaves unlogged.** With the audit store failing, E-L3-2 answers `503` and its body contains no
  document, no address and no name. With it working, exactly one `kitchen-opened` row exists per successful `200`,
  naming the actor and the design, and a refused id (unknown, malformed, deleted) writes **no** row. **Mutation proof:**
  swallowing the audit failure (a `catch` that continues) or not awaiting the insert turns the test red. Reordering the
  statements while keeping the failure fatal is not a defect and must not turn it red (ADR 0152).
- **K-3. Writes and their audit row are atomic (property).** For any sequence of note, status and unhide calls with a
  fault injected at any statement boundary in the fake and in the Neon statement test, after each call either both the
  change and its audit row exist or neither does.
- **K-4. One refusal.** An unknown id, a malformed id and a client-deleted design get a byte-identical refusal (status,
  body, headers) on E-L3-2 to E-L3-5. **A hidden design is not refused** on E-L3-2 to E-L3-4.
- **K-5. No staff path writes a kitchen.** A statement test over every staff store: the only `update designs` names
  `hidden_by_client_at` alone, and no statement writes `document`, `revision`, `name`, `updated_at`, `account_id`,
  `sent_at`, `deleted_by_client_at`, `visitor_hash` or `write_token_hash`, or touches `design_share_links`. The client
  and visitor predicates of Lot 2 S4 are byte-identical before and after (`git diff` on those files is empty).
- **K-6. Unhide.** After `204`: the client's E1 lists the kitchen and `/d/{id}` opens it for its account; the share link
  revoked at hide is **still revoked**; one `kitchen-unhidden` row exists. A second call answers `409 not-hidden` and
  writes no audit row. A deleted design is refused (K-4).
- **K-7. Status only where sent.** On a design with `sent_at` null, E-L3-4 answers `409 not-sent` and writes nothing. A
  value outside the closed list is `400` with field `status`. The status survives hide and unhide.
- **K-8. Notes.** 1 to 2000 code points after NFC; 0 and 2001 are refused with field `text`; a newline is kept; a
  control or bidi-override character is refused. The route inventory has **no** `PATCH` or `DELETE` under
  `/api/staff/kitchens/{id}/notes`. A note on a draft and on a hidden kitchen succeeds. Notes list newest first.
- **K-9. The list (property).** For any set of up to 200 designs drawn over {account or not} × {sent or not} × {hidden or
  not} × {deleted or not}, and each segment: the concatenation of all pages of size 20 equals the segment's set (P-L3-4)
  in its sort order, with no duplicate and no omission, **when nothing is written between requests**; `total` equals the
  set's size; no deleted design appears in any page; a no-account sent design appears under "Trimise" and "Toate" only.
  A `status` filter with a segment other than "sent" is `400`.
- **K-10. Search.** Case-insensitive on address and profile name; a query of `%`, `_` or `\` matches only those literal
  characters; 101 code points is `400` (counted after NFC and format-character stripping).
- **K-11. Proxy.** `/{ro,ru}/staff/{kitchens,team,presets,audit}` and `/{ro,ru}/staff/kitchens/{id}` carry the account
  page headers; `/{ro,ru}/staff/accept` carries `no-referrer`. A percent-encoded, case-varied, unlocalised or longer
  variant carries **neither** and is not a staff page (Lot 1 criterion 13's probe).
- **K-12. Menus.** The server-rendered nav for an operator holds exactly "Bucătării clienți"; for an administrator,
  "Bucătării clienți" plus the administrator items **whose pages are built**. An operator opening an administrator page
  sees the forbidden screen (O18: 200 plus the marker), never "session expired".
- **K-13. Session expiry keeps the note.** A `401` on note save shows the sheet; the textarea keeps its value; the sign-in
  link opens a new browsing context with `noopener`; after signing in there (two Playwright pages, one context), "Salvează
  nota" in the first page succeeds and the note appears once.
- **K-14. Preset gate (L3-A1).** Save-as-preset is allowed for a verified administrator only; client, operator,
  anonymous and a session read that throws are refused with the existing answer, and the editor shows no button for
  them. `pnpm gate:launch-placeholders` no longer reports the ungated preset policy.
- **K-15. Audit page.** Read-only: the route inventory under `/api/staff/audit` is `GET` only. Rows hold no address,
  phone, kitchen name or note text (a statement test over the insert); the page shows "—" for an actor or client that no
  longer resolves. A date filter "de la 01.10.2026 până la 01.10.2026" returns exactly the events of that Chișinău day.
- **K-16. Copy.** Every new RO leaf is in the copy lock; every RU leaf passes completeness and ICU parity; the kitchen and
  note counts render RO "1 bucătărie / 2 bucătării / 20 de bucătării / 101 bucătării / 120 de bucătării" (property over
  1–1000 against the O17 rule) and RU one / few / many.
- **Phase C (stated now so the record can cite them):** **K-17** Step 1's near list, for any set of presets and any
  sequence of moves and hides (property), equals the administrator's grid order filtered by published and the ±600 mm
  window, truncated to 8; no move leaves two presets on one position. **K-18** E-L3-8's invite answer (status, body,
  headers, and the statement count before the response) is identical for a free, a held-verified, a held-unverified and
  an already-invited address; a mail goes only to a free one; accept creates an account with the invitation's role,
  verified, **and starts no session**; a used, expired, unknown or superseded token, or an address registered meanwhile,
  answers one `link-invalid`, never `500`; **no path changes an existing account's role**; the runbook's `0012`–`0015` probe
  `role insert` and the privilege test's matching arm now expect `true` for `INSERT (role)` and still `false` for
  `UPDATE (role)`.

---

## 9. Risks and verification

| Risk | Why it matters | Mitigation |
| --- | --- | --- |
| Staff see clients' drafts | A privacy promise: the notice must say so (Fix 3 *Consequences*, item 11 revised [doc]) | M9 launch-gate line: the privacy notice states staff access to drafts and the audit log before any real user (the draft names the basis question [doc: `privacy-notice-draft.md:9`]) |
| The audit log is personal data with no horizon | ADR 0172 D10: nothing is deleted; erasure is unbuilt (O5) | Rows hold ids only (P-L3-3), so an erased account's rows stop resolving; the retention record (Lot 2 *Future work*) owns a horizon |
| An injection reaches staff power | D7's accepted risk already lets an injection insert an administrator's session row [doc]; O-L3-4 (a) adds role-on-insert | Tagged-template SQL only; the grant is `INSERT (role)` with no `UPDATE`; security review of every Phase C wave |
| The 3D view in a column | The shared variant brings its own chrome | P-L3-6 fallback; the visual reviewer decides at L3-U3 |
| The staff list scans `designs` | No index for `sent_at` order or address search (ADR 0118) | Trigger: a staff list slower than 1 s at p95 on preview, or more than 10 000 rows in `designs`; then an additive partial index |
| Staff idle-out mid-work | 12 h idle is kept by `last_seen_at`, updated only by route handlers at most hourly (D3 [doc]) | The staff pages fetch through routes, so activity counts; K-13 keeps typed text |
| Offset pagination on a moving list | A row can repeat or be skipped between pages | Accepted (P-L3-12); K-9 states the condition |
| Numbers collide on merge | 0169 → 0172 happened [doc] | §2.3 re-list in L3-S1 and L3-W0 |

**Verification method.** Per wave: §7 *Common*. Per phase: the coordinator runs `pnpm check` and quotes it; before any
push, `pnpm ci:local`. The owner applies `0020`+ and their grants, preview first, by the runbook; until then every staff
state is verified through `page.route` mocks and the persistence live suite on the test database only. Nothing here is
verified by reading alone.

---

## 10. Residuals, and what cannot be built without an owner decision or a missing design

*Updated 2026-10-20 after the owner's rulings (§5.3): items 1 and 2 are deferred by the owner; items 3 and 4 have their
owner answer and now wait on a decision record and a security review; item 5 is settled by (c). Item 6 (undrawn states)
and item 8 (retention and erasure) remain open and are not answered by any ruling.*

1. **S6 Prețuri**: needs O-L3-2, a record superseding ADR 0062's timing, a price-book-in-database design (versions,
   ADR 0072; the depth multiplier, ADR 0100; the contact retry rule, ADR 0157), and **a redraw against the book's real
   shape**. Not buildable from Lot 3.
2. **S7 Traduceri**: needs O-L3-3 and a record answering ADR 0095's build-time gates at run time. Not buildable from
   Lot 3.
3. **S4 Personal**: needs O-L3-4 and a decision record with a security review (D7). The S4A list versus the S4E
   neutral answer is a recorded inconsistency (CG-L3-4), not fixed.
4. **S5 Presete**: needs O-L3-5 and an ADR 0112 amendment.
5. **S3's request contact**: settled by O-L3-1 (c); it is not shown.
6. **Undrawn states**: the no-account row ("Fără cont"), "Varianta actuală", the invitation e-mail, a 429 on any staff
   write, offline on S3 notes (the Lot 2 notice pattern is used), the S2 "Toate" sort.
7. **Owner-console only, unchanged**: role change, deactivation, removal of staff, revoking a staff member's sessions
   (runbook). A departed operator keeps access until the owner runs those steps.
8. **Retention and erasure** of notes, request states, audit rows and invitations: no record (O5); recorded here, not
   built.
9. **ADR 0019 d11**: unhide uses the table-level `UPDATE`; the scope does not grow (the column was counted in Amendment
   G item 3), and the owner's re-acceptance owed there still stands.
10. **Pre-S5 sends are unmarked** (O11): those kitchens are missing from "Trimise" and have no status control.

## 11. Send back to Claude Design (for any redraw)

| # | Item | Frames |
| --- | --- | --- |
| SB-L3-1 | S6 rows must be the book's shape (per cabinet: base, per millimetre of width, per door leaf, per millimetre of height; materials and hardware as the book has them), if S6 is ever built | S6 |
| SB-L3-2 | S7 keys are not the catalogue's; "Lipsă" cannot occur under the build gates | S7 |
| SB-L3-3 | A sent kitchen with no account (client cell, no profile block) | S2, S3 |
| SB-L3-4 | The S3 request block under O-L3-1's answer; "Varianta actuală" if the as-sent copy is absent | S3 |
| SB-L3-5 | The invitation e-mail; the list row (or none) after a refused invitation | S4 |
| SB-L3-6 | The staff menu with "Profil" and "Zona personalului" | S1E |

## 12. Summary

- **The design** adds 8 staff screens and 68 frames [run]. **Built today:** the capabilities, the one capability check,
  the page gate, the sent mark, the hide mark, the read-only 3D viewer; **nothing** under `/staff`, no audit, notes,
  status, staff read, preset write or invitation.
- **Buildable now** (Phases 0, A, B): the records, the preset gate swap, migrations `0020`–`0022`, the audit and staff
  stores and routes, and the S1, S2, S3 (without the request contact), S8 screens and the header entry: 17 waves; L3-S9 (notes in the export) is unconditional since O-L3-6.
- **Outline only, owner-answered, waiting on a decision record and a security review (§5.3, §7.3):** S4 (O-L3-4: narrow
  `INSERT (role)`) and S5 (O-L3-5: `UPDATE (status, sort_position)`). **Settled:** S3's request line is option (c)
  (O-L3-1). **Deferred by the owner:** S6 (O-L3-2, naming ADR 0062) and S7 (O-L3-3, naming ADR 0095 decision 2).
- **Seven owner questions**, O-L3-1 to O-L3-7, **all ruled 2026-10-20** (§5.3). Phase C (S4, S5) is unblocked in
  principle but stays outline until its decision record and security review exist; S6 and S7 are deferred.
- **Every code wave** has adversarial QA and Full review with security; every UI wave adds visual review.
