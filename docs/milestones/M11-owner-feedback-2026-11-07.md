# M11 — Owner feedback of 2026-11-07: account header, share sheet, card thumbnails, contact prefill, staff 3D view

Status: **In progress** (2026-11-13). W0 (`dfc9db48`) and W1a+W1b (`05d1dc74`) are committed; the security read of ADRs 0179–0181 is done and its changes are folded in (§10), so W2–W4 may be dispatched. Current state: `docs/STATUS.md`.
W1's criteria were written against `12266a02`; the planner saw uncommitted W1 edits and `qa-w1-*` test files in the
working tree but did not read or run them, so W1's QA judges that work against the criteria below, not the reverse.
Branch: `fix/owner-feedback-2026-11-07`, cut from `main` at `12266a02` (M10 merged and archived).
Source of the work: [`docs/OWNER_FEEDBACK.md`](../OWNER_FEEDBACK.md), items 1 to 5 and the three *Owner rulings,
2026-11-13* sections (first, second and third round).
Decision records: [ADR 0179](../decisions/0179-a-signed-in-customers-contact-form-is-prefilled-from-the-profile-and-the-stored-request-fills-only-the-profiles-blanks-in-one-statement.md)
(W2), [ADR 0180](../decisions/0180-staff-open-a-kitchen-in-3d-on-a-staff-only-route-that-mounts-the-share-view-reads-through-its-own-audited-endpoint-and-mints-no-share-link.md)
(W3), [ADR 0181](../decisions/0181-a-kitchen-card-thumbnail-is-captured-in-the-editor-after-a-save-stored-in-its-own-table-for-the-current-revision-and-served-privately-to-its-owner.md)
(W4). All three are **Accepted** (2026-11-13), after the owner's three rounds of rulings and the security read; the
security read's required changes are folded into each ADR and into W2 to W4 below (*Security read and third-round
rulings, 2026-11-13*, §10).
Design brief (W5): [`docs/design/claude-design-brief-staff-cabinet-list.md`](../design/claude-design-brief-staff-cabinet-list.md).

**Evidence tiers used here.** **[owner, relayed]**: a ruling selected by the owner through AskUserQuestion and relayed by
the coordinator; an option the owner picked, not a verbatim quotation. **[doc]**: a quotation from a repository
document, with `file:line`. **[src]**: a reading of this repository's source with `file:line`: at `12266a02` for W1
(for `apps/web/src/account/**` read through `git show HEAD:` while W1 was being edited), and at `607af1db` for every
citation added or re-checked in the 2026-11-13 security pass (W2 to W4; the only shift found is
`kitchens.module.css`'s desktop `.thumb`, now `:500-506`). **[sec, relayed]**: a finding of the 2026-11-13 security read
of ADRs 0179 to 0181, relayed by the coordinator and re-read in the source before it was written. **[inf]**: the planner's reasoning, with what would falsify it. Nothing was run to write this plan: no test,
no gate, no browser.

## 1. Goal

Close the five owner-feedback items of 2026-11-07 as the owner ruled them on 2026-11-13, without widening any access
rule: a signed-in client finds their account control on "Bucătăriile mele"; the just-issued share link's two actions
are the active state's size and row; each kitchen card shows a picture of that kitchen captured in the editor; a
signed-in client's contact form is prefilled from the profile and fills the profile's blanks; staff open a sent
kitchen in the 3D configurator, read-only, from its detail page; and the staff cabinet list has a Claude Design
prompt before anyone builds it.

## 2. Scope

**In scope.** Items 1, 2, 3, 4, 5.1 built; item 5.2's design prompt written (this planning step writes it; W5 is the
owner's round trip through Claude Design). Item 3's side note (card lines wrapping differently) as an optional slice
of W1.

**Out of scope, deliberately.**

- Thumbnails on share links, the done page or the configurator's own summary card (backlog 217,
  `docs/backlog/open.md:3064`). The owner's note that the same image "could serve share links" is not a ruling to build
  it [doc: `OWNER_FEEDBACK.md`, item 3, *Open questions*].
- A thumbnail for a kitchen saved before W4 ships: it keeps the placeholder until its next save [owner, relayed]. No
  backfill through the `/internal/scene-shot` rig.
- The account control on account pages other than "Bucătăriile mele" (profile, password, export). The owner asked for
  the kitchens page [doc: `OWNER_FEEDBACK.md`, item 1, *Wanted*]. A later request is a one-line extension of W1a.
- Prefilling the contact form's e-mail from the account address, and storing the preferred-contact choice (ruled not
  profile data [owner, relayed]).
- Building item 5.2. It waits for the Claude Design export and a plan of its own.

## 3. The 2026-11-13 rulings, and where each one stops

| Item | Ruling [owner, relayed] | What the ruling did not say, and what this plan decides [inf] |
| --- | --- | --- |
| 1 | Built as asked even if frame A9A lacks the icon; the departure gets a dated note in `docs/design/README.md`. | A9A does lack it (§W1a). Written as a dated note in this step; ADR 0104 gets an amendment from the scribe (owed, §9). |
| 3 | Capture on save, store it on the server; a new store means an ADR and a migration first; add-only applies; an older kitchen keeps the placeholder until its next save. **Third round:** the picture is deleted with the kitchen in the same statement (a `DELETE` grant); a hidden kitchen keeps it. | Saving is autosave-only (ADR 0172 Amendment H, O1), so "on save" happens many times a minute while editing. The plan throttles capture and stores only the newest saved revision (ADR 0181 d2). Storage is a new table in the existing database, not a new service. |
| 4 | Fill blanks only: prefill name, phone and city; on submit save only the fields the profile lacks; never overwrite. Preferred contact is not profile data. **Second round:** the form says in one line that missing details are saved to the profile (Q1); an emptied field is refilled, no mark (Q2). **Third round:** confirmed customers only, gated on `design.edit.own`; the copy into the profile is an owner-ruled change to ADR 0153 d1; the privacy notice says a profile can be filled from a request. | "City" is the profile's `address` field, labelled "Adresă / localitate". The blank-fill is one SQL statement, written server-side where the request's design is marked sent, bounded by a deadline (ADR 0179 d2). |
| 5.1 | A staff-only read-only route behind the staff gate, writing an audit row as the detail page does; no share link minted. **Second round:** new RO and RU copy is pre-approved as drafted (Q3). | Which version opens, the route's shape, and whether the row is the detail page's `kitchen-opened` or a new action (ADR 0180 d1 to d4). |

## 4. Decision-record sweep (WORKFLOW, *Sweep the decision records before deciding*)

| Record | What it says | Effect here |
| --- | --- | --- |
| ADR 0104 (mockups are the chrome specification), Amendment H | Departures from a frame are recorded, and the frame is not edited | W1a departs from A9A, so the dated design note plus an ADR 0104 amendment (owed to the scribe) |
| ADR 0112 d6 and Amendment A d3 to d5 | A preset's thumbnail is captured at save from its own editor, size-checked and type-checked on the server, stored with the row in `bytea`; a stale revision gets `409` and no row; the image route is public with `max-age=60` | W4 reuses the capture and the server checks; it **departs** on caching (a kitchen is private) and on storage (a separate table, not a column on the row) — ADR 0181 |
| ADR 0114 G5 (share view reads no cookie) and decision 5 | `/s/{token}` authorises nothing and probes no write | W3 mounts the share view's client component on a **different** route behind the staff gate; `/s/{token}` is unchanged |
| ADR 0153 d1 and ADR 0172 D11 (lead-to-account join; trigger fired 2026-10-21) | The application reads no personal column of a contact request; the lead-to-account join was accepted "with no personal column read", and renewed when the trigger fired | **Changed, owner-ruled 2026-11-13 (third round), for signed-in submitters only** (ADR 0153 Amendment A; ADR 0179). W2 copies a request's name, phone and locality into the submitter's own profile blanks, which staff read; D11 does **not** cover that (the Proposed text said it did; corrected after the security read). The values come from the body being judged; no statement reads `contact_submissions`' personal columns |
| ADR 0157 d1, d4, d5 | The contact route's order; which refusals are one; success is a stored row and an accepted notice | W2a adds one step after the record, which reads the session and fills blanks; no bucket, refusal or answer changes |
| ADR 0159 d3 | A retry carries the same id and body | The blank-fill is idempotent, so a retry that reaches the stored row may run it again harmlessly |
| ADR 0172 D4, D7, D9, Amendment H item 6 (O20) | CSRF guard; capabilities (`account.manage.own` is every role's and an unconfirmed account's; `design.edit.own` a confirmed client's); the owning account's session is a save credential; `GET /api/account/profile` is kept | W2 is gated on `design.edit.own`; W2b reads the profile through the kept route; W4's upload accepts exactly the save's credential |
| ADR 0156 | Write limiters fail closed, read limiters fail open; subjects from two constructors | W4's upload buckets mirror the save's and fail closed; its read route has its own fail-open read bucket |
| ADR 0173 P-L3-3, P-L3-4 | No staff `200` without a committed audit row; client-deleted kitchens refused, hidden ones shown | W3's endpoint inherits both |
| ADR 0165 | The shop's notice leads with a frozen view-only link to the kitchen as sent | Precedent for W3: the shop already opens the as-sent kitchen in the share view, price bar and all [inf: the price bar's presence in the shared variant was not verified] |
| ADR 0020, ADR 0042, `environments-and-resources.md` | A migration file is not an applied migration; resources are add-only | W4a's migration and grant are owner actions on preview and production; no column or table is dropped |
| Lot 2 plan C2 (`M8B-account-screens-lot2-plan.md:471`) | "Striped placeholder only … Thumbnails are a later decision" | W4 is that later decision; nothing to supersede beyond the placeholder, which stays the fallback |

No record was found that says the opposite of any 2026-11-13 ruling. The comment at
`packages/configurator-domain/src/account/profile-fields.ts:20` ("the contact form's name and locality, which these
prefill") shows that W2's prefill was anticipated when the profile fields were added [src].

## 5. Waves

| Wave | Item | Review tier | Depends on | Production files (approx.) | ADR |
| --- | --- | --- | --- | --- | --- |
| W1a | 1, account control in the kitchens header | Light + visual | none (in progress) | 2 to 3 | ADR 0104 (amendment owed) |
| W1b | 2, share sheet's just-issued actions | Light + visual | none (in progress) | 2 | none |
| W1c | 3's side note, card lines (optional) | Light + visual | W1a/W1b's commit | 1 to 2 | none |
| W2a | 4, fill the profile's blanks on submit | **Full + security** | none | 6 + the notice draft (mini-review, named) | 0179 |
| W2b | 4, prefill the contact form, and its one line | **Full + security** | W2a | 4 + copy | 0179 |
| W3a | 5.1, audited staff endpoint for the 3D view | **Full + security** | none (ADR 0180 Accepted) | 6 + copy (mini-review, named) | 0180 |
| W3b | 5.1, staff 3D route, proxy family, link | **Full + security + visual** | W3a | 5 + copy | 0180 |
| W4a | 3, table, store, domain limits, delete CTE, privilege test, runbook | **Full + security** | none (ADR 0181 Accepted) | 7 + SQL + runbook (mini-review, named) | 0181 |
| W4b | 3, upload route and capture after save | **Full + security + visual** | W4a | 7 (mini-review, named; may split) | 0181 |
| W4c | 3, private read route and card picture | **Full + security + visual** | W4b (W1 is committed, `05d1dc74`) | 7 (mini-review, named) | 0181 |
| W5 | 5.2, Claude Design round trip | None (docs, owner) | none | 0 | none |

W2, W3 and W4 share a few files: `apps/web/src/messages/ro.json` and `ru.json` (W3a, W3b, and W4c if it adds a
label), and the package barrels `packages/persistence/src/index.ts` (W2a, W4a) and the domain's `index.ts` files
(W2a's `account/index.ts`, W3a's staff exports, W4a's limits). Serialise edits to those files through the coordinator
(`docs/best-practices/agent-coordination.md`, per-file ownership); everything else is disjoint. W4c edits `apps/web/src/account/kitchens/**`, which the W1 developer is editing now, so W4c is not
dispatched before W1's commit lands.

**Security review** is required on W2, W3 and W4 by WORKFLOW step 4 (customer data, persistence, auth, a new endpoint,
stored content served back). The security reviewer's reading always includes the wave's ADR.

---

### W1a — the account control on "Bucătăriile mele" (item 1)

**Finding.** The account pages' header draws the back link, the wordmark, an optional title and the locale chips, and
nothing else (`apps/web/src/account/account-shell.tsx:64-85` [src]). The round "RU" button the owner saw is the locale
chip (`LocaleLink`, `:98-116` [src]), so the item is real, not a mislabelled icon [inf, from the screenshot's
description in `OWNER_FEEDBACK.md`, item 1]. The configurator, the room screen and the staff shell all mount
`AccountControl` (`configure-screen.tsx:202`, `room-screen.tsx:198`, `staff-shell.tsx:133` [src]).

**Mockup check.** Frame A9A sets no `hdr` (`docs/design/mockups/Lemnaria Cont Lot 2.dc.html:180` [doc]), so it takes
the default `'std'` (`:307`, `const hdr=f.hdr||'std'` [doc]). The `'std'` header draws the back mark, the wordmark and
the locale chip (`:48`, `:52` [doc]); the "Contul meu" icon is drawn only for `hdr==='ed-in'` (`:51`, `:313` [doc]).
Every A9 frame (A9A to A9K, `:180-191`) is a `'std'` page. So the build departs from the mockup by owner ruling; the
note is in `docs/design/README.md` (dated 2026-11-13).

**Scope.** Mount `AccountControl` in `AccountShell` for the kitchens page only, with `afterSignOut="leave-for-start"`
(the prop's doc: "a page that holds a client's data leaves for the start of the configurator",
`account-control.tsx:63-64` [src]) and `signInForm="icon"`.

**Structural risks for the implementer.**

1. **The menu's inert scope.** The control renders its menu into the screen's `<main>` and marks every other band of
   that `<main>` inert (`account-control.tsx:45-48`, `:304` `triggerRef.current?.closest("main")` [src]). In the
   staff shell the top bar is **inside** `<main>` (`staff-shell.tsx:114-115` [src]); in the account shell the
   `<header>` is a **sibling** of `<main>` (`account-shell.tsx:64`, `:86` [src]). Mounted as is, `closest("main")`
   finds nothing from inside the header and falls back to `document.body`, and the back link and locale chips may
   stay reachable with the menu open [inf; falsified by criterion W1a-3 passing without a structural change]. Follow
   the staff shell's structure, or give the control a host that is a band of the page's `<main>`.
2. **Import cycle.** `account-control.tsx:19` imports `accountPathOf` from `../account-shell` [src]; importing the
   control back into `account-shell.tsx` makes a cycle. Move `accountPathOf` and `startPathOf` to a leaf module, or
   check that lint's import rules accept the cycle before relying on it [inf].

| Slice | Work | Files likely touched | Reading |
| --- | --- | --- | --- |
| W1a | Mount the control in the kitchens page's header | `account/account-shell.tsx`, `account/account.module.css`, a leaf module for the path builders, `app/[locale]/account/kitchens/page.tsx` or `account/kitchens/kitchens-screen.tsx` | This section; `OWNER_FEEDBACK.md` item 1; `account-control.tsx:35-80`, `:290-310`; `staff-shell.tsx:105-150`; `Lemnaria Cont Lot 2.dc.html:48-52`, `:307-313`; ADR 0104 Amendment H; `docs/design/README.md` (A19A and the 2026-11-13 notes) |

**Acceptance criteria.**

- **W1a-1.** On `/{locale}/account/kitchens`, signed in as a client, the header holds exactly one account control,
  drawn as the signed-in icon (the configurator's glyph), at 390×844 and at 1440×900.
- **W1a-2.** Opening it shows the same menu as in the configurator ("Bucătăriile mele", "Profil", "Ieși din cont",
  "Ieși de pe toate dispozitivele"; frame A19's rows, `Lemnaria Cont Lot 2.dc.html:170`).
- **W1a-3.** With the menu open, Tab and Shift+Tab never reach the back link, the locale chips or any card control;
  Esc closes the menu and focus returns to the control.
- **W1a-4.** "Ieși din cont" on this page leaves for `/{locale}` once the server has ended the session (it does not stay
  on a page that lists the client's kitchens).
- **W1a-5.** **Must not:** the login, register, forgot-password, reset-password, verify-email and confirm-email pages,
  and the account 404, render no account control (their headers are unchanged, byte for byte in the rendered header
  markup).
- **W1a-6.** **Must not:** the locale chips' targets, the back link's target and the header's order otherwise change;
  the control sits between the title and the locale chips, as in the configurator bar (control before the language
  chip, `configure-screen.tsx:197-206`).
- **W1a-7.** No import cycle is introduced (lint green with whatever import rule the repository runs).

**Verification.** Component test for W1a-1, W1a-5 and W1a-6 (render each page's shell); a Playwright check at both
sizes for W1a-3 and W1a-4; screenshots at 390×844 and 1440×900 attached to the visual review.

### W1b — the just-issued share state's actions (item 2)

**Root cause [src].** Every dialog action carries `flex: 1 1 200px` (`account/account.module.css:934-936`), which is a
width basis inside the row container `.dialogActions` (`:926-930`, a wrapping row). In the just-issued state the Stop
action is a direct child of the dialog surface, which is a **column** flex (`.dialogSurface`, `:870-877`), and the Copy
action is a child of `.shareLinkBlock`, also a column flex (`account/kitchens/kitchens.module.css:408-412`). In a
column flex the 200 px basis is a **height**, and the grow factor stretches both buttons along the column
(`share-kitchen-sheet.tsx:219-230`, `:259-277`; the surface wraps `ShareBody` at `:86-101`). The active state puts its
two actions in `.shareActions`, a wrapping row (`kitchens.module.css:402-406`; `share-kitchen-sheet.tsx:204-215`), which
is why it looks right.

**Scope.** In the just-issued state, put "Copiază link-ul" and "Oprește link-ul" in one `.shareActions` row, Copy first;
the link field stays above it and the "shown once" caption below.

| Slice | Work | Files likely touched | Reading |
| --- | --- | --- | --- |
| W1b | One row for the two actions | `account/kitchens/share-kitchen-sheet.tsx`, `account/kitchens/kitchens.module.css` | This section; `OWNER_FEEDBACK.md` item 2; `share-kitchen-sheet.tsx:170-300`; `account.module.css:860-980`; `kitchens.module.css:395-425`; frame A9G note (`Lemnaria Cont Lot 2.dc.html:186`) |

**Acceptance criteria.**

- **W1b-1.** At 390×844 and at 1440×900, in the just-issued state, each of the two buttons is at most 56 px tall (the
  frame's 48 px box plus a wrapped line's allowance), and neither is taller than the active state's buttons at the same
  width by more than 1 px.
- **W1b-2.** Where both fit side by side (1440×900), Copy and Stop share one row, Copy on the left; where they do not
  (a 320 px wide viewport), they wrap one above the other, each still at most 56 px tall.
- **W1b-3.** Tab order is Copiază link-ul → Oprește link-ul → Închide (A9G note, `:186`); the focus that lands when the
  state arrives is still Copy (`useFocusPrimaryWhenReady`, `share-kitchen-sheet.tsx:139-155`).
- **W1b-4.** **Must not:** the active, none and error states, the stop-confirmation dialog, and every other dialog
  using `.dialogAction` change size or order: their button boxes at 390×844 and 1440×900 equal `12266a02`'s (±1 px).
- **W1b-5.** **Must not:** the link stays a read-only field and never an anchor (`share-kitchen-sheet.tsx:245-246`).

**Verification.** Playwright at 390×844, 1440×900 and 320×640 measuring the two buttons' boxes against the active
state's; a component test for W1b-3 and W1b-4's markup; screenshots for the visual review.

### W1c (optional) — the card's "Modificată / De la" line

**Observation [doc: `OWNER_FEEDBACK.md`, item 3, *Also seen*].** Two cards lay the age and price line out differently
(one row versus stacked), so their buttons sit at different heights. Not asked for; build only if the coordinator
dispatches it.

- **W1c-1.** In the desktop grid, two cards in one row whose age-and-price lines wrap differently have their action rows
  at the same vertical position (±1 px).
- **W1c-2.** **Must not:** a name clamped to two lines, the sent badge, or the phone layout's order change.

Reading: `account/kitchens/kitchen-card.tsx:60-120`, `kitchens.module.css` (card, meta, price rules). Verification:
Playwright with two seeded kitchens whose prices differ in length; screenshots.

**QA reading (W1).** This section; `share-kitchen-sheet.tsx`; `account-shell.tsx`; `account-control.tsx`;
`staff-shell.tsx:105-150`; the two CSS modules; `Lemnaria Cont Lot 2.dc.html` frames A9C, A9G, A19.
**Reviewer reading (W1, one combined light reviewer plus visual).** The diff; this section; ADR 0104 Amendment H;
`docs/design/README.md` 2026-11-13 note; `docs/best-practices/browser-and-visual-qa.md`.

---

### W2a — fill the profile's blanks when a signed-in client's request is stored (item 4, part 2)

**What exists [src].**

- The profile has three optional fields: `name`, `address` ("Adresă / localitate") and the phone pair
  `phone` + `phone_normal_form` (`profile-fields.ts:29`, `:40-46`; migration `0017_add_account_profile_columns.sql:1-2`,
  `:41-43`; `0012_create_accounts.sql:94-102`).
- The contact form sends `name` (required, at most 100), `phone` (required, normalised by `normalisePhoneNumber`),
  `locality` (optional, at most 100) (`contact/contact-fields.ts:16-17`, `:137-150`, `:185-194`). The profile's bounds
  are the same constants (`profile-fields.ts:21-22`) and its phone uses the same normaliser (`account-fields.ts:16`), so
  any value the contact domain accepts is one the profile domain accepts [inf; W2a-6 makes it a property].
- `updateProfile` overwrites the columns it is given unconditionally (`neon-account-store.ts:141-163`). A
  read-then-write blank check in application code loses a race against a profile save in another tab [inf].
- The contact route reads no session today (`app/api/contact-submissions/route.ts:41-55`; no `account` or `session`
  reference under `lib/server/contact/`).
- `account.manage.own` is held by every role and by an unconfirmed account; `design.edit.own` only by a confirmed
  client (`packages/configurator-domain/src/account/capabilities.ts:28-38`, `:45-57`;
  `apps/web/src/lib/server/account/require-capability.ts:11-18`, `:44-52` [src at `607af1db`]).
- Staff read `accounts.name` and `accounts.phone` beside a kitchen (`packages/persistence/src/staff-kitchen-statements.ts:89`,
  `:194` [src at `607af1db`]), so what W2a writes is read by staff.

**Grants.** The column grants the write needs are already declared: `UPDATE (name, address)`
(`0017_add_account_profile_columns.sql:27` [doc]) and `UPDATE (…, updated_at, …, phone, phone_normal_form, …)`
(`0012_create_accounts.sql:62-63` [doc]). **No migration and no new grant.** Whether those grants are applied on
preview and production is not known to this plan; the W2a dispatch must not assume it, and the close-out names it as
an owner check.

**Decision (ADR 0179 d2, d5).** The fill runs at exactly the two places the submission calls `markDesignSent` (a callback request fills too; its mark is a no-op): after
`store.record` answered stored on a new request, and on a retry of a stored, un-notified request whose design was read
again and not refused (`submit-contact.ts:224-228`, `:287-289` [src at `607af1db`]). There the submission reads the
session (the variant that reads a failure as anonymous, `lib/server/account/current-session.ts:32-38`); for a live
session holding **`design.edit.own`** it runs one statement that sets each of `name`, `address` and the phone pair
**only where the column is null**, for the session's own account. Best-effort and bounded like the sent mark
(`SENT_MARK_DEADLINE_MS`, `beforeDeadline`, `:239`, `:247-260`): a failure or a timeout is one closed-list log line and
never changes the answer. The privacy notice draft gains the statement that a profile can be filled from a request.

| Slice | Work | Files likely touched | Reading |
| --- | --- | --- | --- |
| W2a | Domain map from a judged request to a profile fill; store method; the bounded step in the submission; its log line; the notice draft's statement | `packages/configurator-domain/src/account/profile-fill.ts` (new), `packages/persistence/src/account-store.ts`, `neon-account-store.ts`, `fake-account-store.ts`, `apps/web/src/lib/server/contact/submit-contact.ts` (and its ports module if the session reader is a port), `lib/server/contact/contact-log.ts`; docs: `docs/legal/privacy-notice-draft.md` | ADR 0179 (whole, Accepted); ADR 0153 Amendment A; ADR 0157 d1, d4, d5; ADR 0159 d3; ADR 0172 D4, D7, D11; `capabilities.ts`; `require-capability.ts`; `profile-fields.ts`; `contact-fields.ts`; `neon-account-store.ts:120-165`; `submit-contact.ts:180-300`; `contact-log.ts:150-175`; `contact-production-ports.ts`; `current-session.ts`; migrations `0012`, `0017` headers |

**Acceptance criteria.**

- **W2a-1. Fill only blanks.** For a signed-in client whose profile holds `name = A`, `address = null`, `phone = null`,
  a stored request with name `B`, locality `L` and phone `P` leaves `name = A`, sets `address = L`, and sets `phone`
  and `phone_normal_form` to the request's entered and normal forms of `P`.
- **W2a-2. Never overwrite, never clear.** A column that is non-null before the statement is byte-identical after it,
  whatever the request carried. An empty `locality` writes nothing (it never clears `address`, and never sets it to an
  empty string, which the table refuses, `0017:7-9`).
- **W2a-3. Atomic.** The blank check and the write are one statement (`case when <col> is null`, or `coalesce`), so a
  profile save committed by another request between the page load and this statement is never overwritten. QA proves
  it with a test that saves the profile, then submits, against the live test database (ADR 0006).
- **W2a-4. The phone pair moves together.** `phone` and `phone_normal_form` are both written or neither
  (`0012:100`'s check holds); a profile with `phone` set gets neither column written.
- **W2a-5. Whose account.** Only the session's own account is written. A request for a design owned by another
  account, or by no account, still fills only the session's account. **Only a session holding `design.edit.own`**
  fills: a staff session, an administrator session, an **unconfirmed** customer account (all of which hold
  `account.manage.own`), a signed-out request, an expired or revoked session, and a session read that fails write
  nothing. (The Proposed text said staff lack `account.manage.own`; they hold it, `capabilities.ts:33-52`.)
- **W2a-6. Property (fast-check).** For every request body `validateContactSubmission` accepts, the fill the domain
  derives from it passes `validateProfileText` with no issue.
- **W2a-7. Only where `markDesignSent` is called (a callback request included).** No refusal of any kind (cross-site `403`, `413`, `415`, a schema
  refusal, the honeypot or the time, `409 CONTACT_DESIGN_NOT_CURRENT`, `429`, `503` before a reference is held) writes
  the profile, and **`409 CONTACT_REQUEST_CONFLICT` never does** (`submit-contact.ts:190`, `:223`). A retry of a
  stored, un-notified request whose design is read again and not refused may fill again, with a result equal to the
  first fill (idempotence); a retry whose design is now refused (`:284-286`) does not fill, nor does a retry of a
  request already notified (`:191`).
- **W2a-8. The answer is unchanged.** For every input of the existing contact-route suite, the status, body and headers
  are byte-identical to `12266a02`'s, with and without a session cookie; a thrown fill is not a `5xx`.
- **W2a-9. No new reader of a request's personal columns.** No statement added by W2a selects from
  `contact_submissions` (ADR 0153 d1).
- **W2a-10. No cookie.** No answer of the contact route sets, clears or refreshes a cookie (`route.ts:38-39`); the
  session is read, never touched.
- **W2a-11. Bounded, and logged by a closed list.** The fill waits at most a named deadline (as `SENT_MARK_DEADLINE_MS`
  bounds the sent mark); with the store hanging, the answer leaves within the deadline plus the existing path's time
  and is the answer without the fill. A throw or a timeout writes one contact-log line carrying the request's
  reference and a cause from a closed list; a test with a store that throws an error whose message holds a sentinel
  string finds the sentinel in no log line.
- **W2a-12. The privacy notice says so.** `docs/legal/privacy-notice-draft.md` states that a signed-in customer's empty
  profile fields (name, phone, locality) can be filled from a contact request they send (third-round ruling; the
  obligation `0017:18-19` names for name and address). The published notice inherits it at the launch gate.

**Verification.** Domain unit tests and the W2a-6 property; persistence tests against the test database for W2a-1 to
W2a-4 (live file registered `shared`: it mints rows under random ids and asserts no whole-table figure; no exclusive-lock rule for account tables exists (corrected 2026-11-13, W2a QA)); route tests for W2a-5, W2a-7, W2a-8,
W2a-10, W2a-11 (sessions for each role, confirmed and unconfirmed); a grep-style test or reviewer check for W2a-9; the
docs reviewer reads W2a-12.

### W2b — prefill the form from the profile (item 4, part 1)

**Decision (ADR 0179 d1, d5).** The client first reads `GET /api/account/session` and continues only when its
`capabilities` include `design.edit.own` (`app/api/account/session/route.ts:28-37`; the list is already filtered by
the address's confirmation, `require-capability.ts:44-52` [src at `607af1db`]). Then it reads `GET /api/account/profile`
(kept by O20, ADR 0172 Amendment H item 6), whose own gate, `account.manage.own`, would admit staff and unconfirmed
accounts, which is why the session check comes first; the check also spares a visitor's view the reads-bucket hit and
the `401` "refused" account event. The profile route answers `Cache-Control: private, no-store` (`lib/server/account/account-responses.ts:26` [src]). The contact
pages are **not** in the proxy's no-store families (only share, account and staff paths get them,
`proxy.ts:147-151` [src]), so a server-rendered prefill would put a name and a phone into a page response without
`private, no-store` [inf]. The read is client-side for that reason. The route's `GET` is cross-site guarded, counts
only the reads limiter (fails open), then requires `account.manage.own`; it does not count the profile-save bucket
(`app/api/account/profile/route.ts:23-41` [src]), so a contact page view spends none of the client's save quota.

| Slice | Work | Files likely touched | Reading |
| --- | --- | --- | --- |
| W2b | A `profile-arrived` event in the form model; a hook that reads the session then the profile once; the one-line notice naming the account; mount it on both contact screens | `apps/web/src/contact/contact-form-model.ts`, `contact/use-profile-prefill.ts` (new), `contact/contact-screen.tsx` (and `contact-form.tsx` for the line), `messages/ro.json`, `ru.json` | ADR 0179 (whole, Accepted); `app/api/account/session/route.ts`; `account/session/use-account-session.ts`; `capabilities.ts`; ADR 0159 (the form holds no typed value outside memory); `contact-form-model.ts`; `contact-screen.tsx`; `update-profile.ts:33-41`; `account/profile/profile-values.ts`; `staff/staff-kitchen-page.tsx:86` (re-read on a restored page) |

**Acceptance criteria.**

- **W2b-1.** Signed in as a client whose profile holds a name, a phone and an address, both contact pages
  (`/{locale}/configurator/contact` and `/{locale}/d/{id}/contact`) show the three values in Nume, Telefon and Oraș
  once the read answers.
- **W2b-2. Never over the customer's typing.** A field the customer has typed in, or left, before the answer arrives
  keeps the customer's value. Property (fast-check): for any interleaving of `text-changed` events and one
  `profile-arrived` event, every field that received a `text-changed` before the arrival ends with the last typed
  value.
- **W2b-3. No error appears from prefill.** A prefilled value that the contact domain would refuse is shown, with no
  error until the field is left or the form is submitted (the model's existing rule, `contact-form-model.ts:87-91`).
- **W2b-4. Everyone but a confirmed client, unchanged.** With no session, a staff or administrator session, or an
  unconfirmed customer account, the form renders and behaves exactly as at `12266a02`, shows no notice line, and **no
  request to `/api/account/profile` is made** (only the session read). A failed or slow read of either leaves the form
  empty and shows no notice. (The Proposed text expected a staff `403`; staff hold `account.manage.own` and would be
  answered `200`.)
- **W2b-5. Preferred contact untouched.** The channel choice and the e-mail field are never prefilled.
- **W2b-6. Nothing persisted.** The prefilled values are held only in the form's memory: nothing written to
  `localStorage`, `sessionStorage`, IndexedDB, a cookie or the URL (ADR 0159).
- **W2b-7. Back after sign-out.** A contact page restored from the back-forward cache after "Ieși din cont" shows no
  prefilled value the server would no longer give (re-read on `pageshow` with `persisted`, or clear) [inf: the staff
  page solves the same problem, `staff-kitchen-page.tsx:86`].
- **W2b-8. One read per page view.** The profile is read at most once per mount, and never on the review or done pages.
- **W2b-9. The line, naming the account.** A confirmed client whose profile has at least one blank the form's values
  would fill sees one line saying the missing details are saved to the profile of the account named by its e-mail
  (second round Q1; [sec, relayed] F3; copy pre-approved, Q3). With no blank, no line. The e-mail is the session
  read's, never typed by the customer.

**Verification.** Model unit tests and the W2b-2 property; component tests with a stubbed fetch for W2b-1 and W2b-3
to W2b-5 and W2b-9; Playwright for W2b-1, W2b-4 (a client, a staff member and an unconfirmed account, with the network
log checked for the profile request) and W2b-7 against the test database.

**QA reading (W2).** ADR 0179; this section; `contact-form-model.ts`; `contact-screen.tsx`; `submit-contact.ts`;
`contact-production-ports.ts`; `neon-account-store.ts`; `profile-fields.ts`; `contact-fields.ts`; ADR 0157 d4 (which
refusals are one); `docs/best-practices/engineering-conventions.md`, *Coverage an adversarial pass owes*.
**Logic reviewer reading.** ADR 0179; ADR 0157 d1, d5; ADR 0159 d3; this section's criteria; the diff.
**Clean-code reviewer reading.** The diff; `docs/best-practices/engineering-conventions.md`.
**Security reviewer reading.** ADR 0179; ADR 0153 d1 and Amendment A; ADR 0172 D4, D7, D11; `capabilities.ts`;
`require-capability.ts`; `current-session.ts`; `isCrossSiteRequest`; `proxy.ts:140-151`; `account-responses.ts:20-40`;
`contact-log.ts`; `staff-kitchen-statements.ts:80-200`; the diff.

---

### W3a — the audited endpoint the staff 3D view reads (item 5.1)

**Constraints [src].** A page render writes nothing: `readCurrentSession` "never writes: a page render may call it,
and a render can neither set a cookie nor be allowed to move `last_seen_at`" (`current-session.ts:33-34`), and the
staff detail page itself carries no kitchen; its client reads `GET /api/staff/kitchens/{id}`, "which writes the audit
row" (`app/[locale]/staff/kitchens/[id]/page.tsx:39-42`). "No `200` leaves without a committed audit row"
(`lib/server/staff/staff-kitchens.ts:44-47`; ADR 0173 P-L3-3). So the 3D view's server page cannot write the row
either; a route handler must.

**Decision (ADR 0180 d2, d3, d8).** A new `GET /api/staff/kitchens/{id}/3d?version=sent|current`. **In the route
file**, as the detail route has them (`app/api/staff/kitchens/[id]/route.ts:26`, `:39-40` [src at `607af1db`]): the
cross-site guard first, and an exported `HEAD` answering `staffHeadRefusedResponse()`. Then the same admission as
`openKitchenForStaff` (reads limiter, then `design.read.any`), then the `version` parameter **after admission** (as
the list judges its query, `staff-kitchens.ts:74-83`), then the id's shape, then the `staff-kitchen-open` bucket, which
fails closed (`staff-kitchens.ts:94-109`, `:143-179`), the same `readOne`, then the design chosen by `shownDesignOf`'s
rule (`staff/staff-kitchen-facts.ts:27-40`). **When neither copy is readable (`:37-38`), no row is written** and the
answer is a defined refusal with no design. Otherwise a committed audit row `kitchen-viewed-3d` with detail
`{ version: "sent" | "current" }` naming the copy actually served, then a body holding **the design and its source
only** (no client, request, notes or estimates), through the staff responses' `jsonResponse`, `private, no-store`
(`staff-responses.ts:208-213`). The domain gets a detail-reader case for the action with a closed key list, since
`readStaffAuditEntry`'s `default` branch refuses any non-null detail and the store refuses what it cannot read back
(`staff-audit-action.ts:173-176`; `staff-audit-store.ts:378-384` [src at `607af1db`]). The action list is code; the table's check is a shape
(`^[a-z0-9-]{1,32}$`, `0020_create_staff_audit_events.sql:16-17`, `:63` [doc]), so **no migration**.

| Slice | Work | Files likely touched | Reading |
| --- | --- | --- | --- |
| W3a | New audit action and its detail reader; the endpoint; its response; the audit page's label for the action | `packages/configurator-domain/src/staff/staff-audit-action.ts`, `apps/web/src/lib/server/staff/staff-kitchens.ts`, `lib/server/staff/staff-responses.ts`, `app/api/staff/kitchens/[id]/3d/route.ts` (new), the audit page's action labels (`staff/staff-audit-rows.tsx` or `staff-audit-filters.tsx`) plus `messages/ro.json`, `ru.json` | ADR 0180 (whole, Accepted); ADR 0173 P-L3-3, P-L3-4; ADR 0156; `staff-kitchens.ts`; `staff-audit-action.ts` (whole); `staff-audit-store.ts:290-390`; `staff-responses.ts:85-215`; `staff-kitchen-reader.ts:161-199`; `staff-kitchen-facts.ts:20-50`; `app/api/staff/kitchens/[id]/route.ts`; migration `0020` header |

This slice is six production files plus copy, one over the limit; the dispatch names it and a mini-review runs before
W3b (WORKFLOW, *Scope discipline*).

**Acceptance criteria.**

- **W3a-1.** A staff session with `design.read.any` gets `200` with the design `shownDesignOf(kitchen, version)` returns
  and its source; with no `version`, the as-sent copy when readable, else the current one.
- **W3a-2. Audit before the body.** Every `200` has exactly one committed `kitchen-viewed-3d` row naming the actor, the
  design, the client's account when it has one, and `{ version }` equal to the source served. A failed row write is a
  `503` with no design (the existing `answerUnavailableOnFailure` rule).
- **W3a-3. Same refusals as the detail endpoint.** A malformed id, an unknown id, a client-deleted kitchen and a
  visitor's unsent draft answer `designNotFoundResponse` byte-identically to `GET /api/staff/kitchens/{id}` and write no
  row; a hidden kitchen is served (P-L3-4). No session: `401`; a client session or a staff role without
  `design.read.any`: `403`; both write no row.
- **W3a-4. Buckets.** The `staff-kitchen-open` bucket is counted once per request after the id's shape, and a bucket
  that cannot be counted is `503` with no design. A malformed id costs no bucket.
- **W3a-5. Minimal body.** The body carries no key holding a client's e-mail, name, phone, address, a request
  reference, a note or an estimate. Test: a fixture kitchen whose client fields hold sentinel strings; the response
  text contains none of them.
- **W3a-6.** A `version` other than `sent` or `current` (including an empty value and a repeated parameter) is a `400`
  in the shape of `staffInvalidQueryResponse` (`staff-kitchens.ts:198-201`), judged **after admission** and before the
  bucket: no row, no bucket counted, no read. Signed out or without the capability, the same request gets the
  admission's `401`/`403`, not the `400`.
- **W3a-7.** The audit page lists the new action with a label in both locales and its filter accepts it; an audit row
  carries codes only (no name, no address).
- **W3a-7b. The detail reads back.** `readStaffAuditEntry` has a `kitchen-viewed-3d` case whose detail is an object with
  exactly the key `version`, valued `sent` or `current`; an extra key, a missing key, any other value or a null detail
  is `INVALID_DETAIL`. `STAFF_AUDIT_ACTION_NAMES_DESIGN` classifies the action `true`. Round-trip test: each valid
  entry, written by the store, reads back equal; each invalid one is refused by the reading and by the store's write.
- **W3a-8. Must not:** `GET /api/staff/kitchens/{id}` and its `kitchen-opened` row are unchanged.
- **W3a-9. Cross-site first.** A cross-site request gets `crossSiteResponse()` before anything is counted, read or
  written (no reads-limiter hit, no bucket, no row).
- **W3a-10. `HEAD`.** `HEAD` answers `405` through `staffHeadRefusedResponse()` with `Allow: GET`; no read, bucket or
  row.
- **W3a-11. Headers.** Every answer of the route, `200` and refusals, carries `Cache-Control: private, no-store`.
- **W3a-12. Nothing readable.** A kitchen whose two copies this build cannot read answers the defined refusal (a closed
  code; W3a names it, for example `422 STAFF_KITCHEN_UNREADABLE`) with no design, after its bucket is counted, and
  writes **no** row.

### W3b — the staff 3D route, its proxy family, and the link (item 5.1)

**Decision (ADR 0180 d1, d4, d5).** Page `/{locale}/staff/kitchens/{id}/3d`, gated like the detail page
(`readStaffPage({ page: "kitchens" })`, `page.tsx:44-75`), carrying no kitchen. Its client screen reads the W3a
endpoint and mounts `SharedDesignView` (`app/s/[token]/shared-design-view.tsx:39-51`), which hydrates a sentinel id with
`canWrite: false` and renders `ConfigureScreen variant="shared"`. The single-mount guard admits that file and no other
(`apps/web/tests/app/configure-screen-single-mount.test.ts:23-26` [src]); W3b adds no `<ConfigureScreen` mount. The
detail page gets an "open in 3D" link that carries the version the switch shows (`staff-kitchen-page.tsx:207-225`),
opening in a new tab so the detail page stays [inf].

**Proxy [src].** `isStaffPath` admits `staff/kitchens/{id}` only at exactly four segments
(`proxy.ts:333-346`), so a five-segment path gets the site's default headers, not the staff family's `private,
no-store`, `noindex` (`ACCOUNT_PAGE_HEADERS`, `lib/security-headers.ts:88-98`; applied at `proxy.ts:148-150`). W3b must
extend `isStaffPath`. The matcher needs no new literal: its generic pattern excludes only paths ending in a static
extension (`:91-93`), and `…/{id}/3d` ends in `3d`; a design id has no dot [inf: `isDesignId`'s shape].

| Slice | Work | Files likely touched | Reading |
| --- | --- | --- | --- |
| W3b | The page, the client screen, the proxy family, the path builder, the link | `app/[locale]/staff/kitchens/[id]/3d/page.tsx` (new), `staff/staff-kitchen-3d-screen.tsx` (new), `proxy.ts`, `staff/staff-paths.ts`, `staff/staff-kitchen-page.tsx`, plus `messages/ro.json`, `ru.json` | ADR 0180; ADR 0114 G5; ADR 0165; `app/[locale]/staff/kitchens/[id]/page.tsx`; `app/s/[token]/shared-design-view.tsx`; `configure-screen.tsx:60-110`, `:195-215`, `:315-330`; `configure-screen-single-mount.test.ts`; `proxy.ts:40-100`, `:140-151`, `:320-360`; `staff-kitchen-page.tsx:190-320`; `staff-kitchen-facts.ts` |

**Acceptance criteria.**

- **W3b-1.** From `/{locale}/staff/kitchens/{id}` a staff member sees a link or button labelled to open the kitchen in
  3D; following it opens `/{locale}/staff/kitchens/{id}/3d?version=<the switch's choice>` and shows that copy in the
  configurator's 3D scene. With no version switch (one readable copy), the link carries no `version`.
- **W3b-2. Read-only.** On the 3D view nothing is requested from `/api/designs/**` (save, share, preset, price notice),
  from `/api/contact-submissions`, or from any `PUT`, `PATCH` or `DELETE` endpoint. Test: Playwright records every
  request while the staff member clicks a body, opens the settings, changes the camera and switches language, and the
  record holds none of those (a CSP report or a static asset is not a finding).
- **W3b-3. No share link minted.** `design_share_links` gains no row from any action on the 3D view or the link.
- **W3b-4. Gate.** Signed out → the login page; a client session → the account area's forbidden screen; a staff role
  without the capability → the staff forbidden screen; each is the detail page's answer for the same session, and
  none reads the kitchen or writes a row.
- **W3b-5. Headers.** Every response on `/{locale}/staff/kitchens/{id}/3d` (page and redirect alike) carries the staff
  family's `Cache-Control: private, no-store` and `X-Robots-Tag: noindex, nofollow`. A longer path (`…/3d/x`), another
  fifth segment (`…/edit`) and a case variant (`…/3D`) are not staff paths.
- **W3b-6. The page carries no kitchen.** The HTML and RSC payload of the page response contain no design document and
  no client data; the design arrives only through the W3a endpoint.
- **W3b-7. Language.** Choosing the other language on the 3D view shows the same kitchen's 3D view in that language,
  still behind the gate; any document response it causes carries the staff headers, and it never lands on `/d/…`,
  `/s/…`, the configurator's start or a 404 [inf: the configurator's locale menu builds a locale-free path,
  `configure-screen.tsx:207-214`; W3b confirms what that path does under `/staff`, R4]. The remount fetches the
  endpoint again and writes a second `kitchen-viewed-3d` row: **accepted** (ADR 0180 d8), not a finding.
- **W3b-8. States.** An unknown or deleted kitchen (W3a's `404`), a `503`, and W3a-12's refusal (no readable copy) each
  show a staff-frame notice, never a blank canvas or an empty editor.
- **W3b-10. No upload from the 3D view.** The view mounts the editor canvas, which registers the scene capture in every
  variant (`kitchen-canvas.tsx:43`, `configure-screen.tsx:225`); nothing is sent to `/api/designs/*/thumbnail` from it
  (ADR 0181 d1; covered by W3b-2's request record).
- **W3b-9. Must not:** the detail page's inline preview, version switch, notes, status card and `kitchen-opened` row
  change; `/s/{token}` and `/d/{id}` render byte-identically for the same inputs.

**Verification.** Route and proxy unit tests (W3b-4, W3b-5); Playwright for W3b-1, W3b-2, W3b-3, W3b-7, W3b-8 with a
staff fixture on the test database; screenshots at 1440×900 (priority for staff) and 390×844.

**QA reading (W3).** ADR 0180; this section; `staff-kitchens.ts`; `staff-audit-action.ts`; `proxy.ts`;
`shared-design-view.tsx`; `configure-screen.tsx` (variant handling); ADR 0173 P-L3-3, P-L3-4.
**Logic reviewer reading.** ADR 0180; ADR 0173; `staff-kitchen-facts.ts`; `staff-kitchen-page.tsx:190-320`; the diff.
**Clean-code reviewer reading.** The diff; `engineering-conventions.md`.
**Security reviewer reading.** ADR 0180; ADR 0173 P-L3-2, P-L3-3; ADR 0114 G5; `proxy.ts` whole; `staff-admission.ts`;
`security-headers.ts:75-110`; the diff.
**Visual reviewer reading.** `browser-and-visual-qa.md`; the screenshots; frame S3 (`Lemnaria Cont Lot 3.dc.html`).

---

### W4a — the thumbnail table, its store and its limits (item 3)

**Decision (ADR 0181 d3, d4).** A new table `design_thumbnails` in the existing database (no new provisioned
service): `design_id` (primary key, references `designs(id)` on delete cascade), `revision` (bigint, the design's
revision the image depicts), `image` (`bytea`), `image_type` (closed list `image/webp`, `image/png`, `image/jpeg`, as
`0011_create_presets.sql:83-84`), `captured_at`. Migration `0030_create_design_thumbnails.sql` (number provisional
until the branch merges; `0029` is the newest file at `12266a02` [src]). Grant, the owner's step: `SELECT, INSERT,
UPDATE (revision, image, image_type, captured_at), DELETE` on `design_thumbnails`; no `UPDATE (design_id)`. The
`DELETE` is the third-round ruling's: the client's delete statement removes the picture in the same statement that marks
the kitchen deleted, as it revokes the share link (`neon-account-kitchen-store.ts:345`, `:351` [src at `607af1db`]); a
hidden kitchen keeps its picture (ADR 0181 d9). The Proposed plan said "no `DELETE`"; that is reversed. A separate table rather than a column keeps image
bytes out of every `designs` read and out of the nightly designs export [inf].

**Size [inf].** 640×480 (4:3, the preset capture's ratio at half its pixels, `preset-limits.ts:9-10`), a domain cap of
128 KiB, a table backstop of 262 144 bytes (looser than the domain rule, as `0017:13-16` reasons). The card is
104×78 on a phone and 200 px tall on a desktop (`kitchens.module.css:85-89`, `:503` [src at `607af1db`]); 480 px covers a
200 px box at a device pixel ratio of 2.

| Slice | Work | Files likely touched | Reading |
| --- | --- | --- | --- |
| W4a | Migration; port, Neon store, fake; domain limits and image-header check; the delete statement's CTE; the privilege test | `packages/persistence/src/migrations/0030_create_design_thumbnails.sql` (new), `design-thumbnail-store.ts` (new), `neon-design-thumbnail-store.ts` (new), `fake-design-thumbnail-store.ts` (new), `index.ts`, `neon-account-kitchen-store.ts` (`markDeleted`); `packages/configurator-domain/src/design/thumbnail-limits.ts` (new, or a generalisation of `preset/preset-limits.ts`); tests: `packages/persistence/tests/application-role-privileges.test.ts`; runbook section for `0030` | ADR 0181 (whole, Accepted); `neon-account-kitchen-store.ts:290-370`; ADR 0112 d6 and Amendment A d3, d4; ADR 0020; ADR 0042; `environments-and-resources.md`; migrations `0004`, `0011`, `0016`, `0017` headers; `neon-preset-repository.ts`; `preset-limits.ts`; the runbook `applying-a-table-migration-and-its-application-role-grant.md` |

**Acceptance criteria.**

- **W4a-1. Current revision only, per credential arm.** `storeThumbnail({ designId, credential, revision, image, type })`
  writes only when, in the same statement, `designs.id = designId`, `designs.revision = revision`, the design is
  neither client-deleted nor hidden, `designs.account_id is not null`, and the credential matches: for the write-token
  arm, the design's stored token hash equals the request's (the save's own predicate); for the session arm,
  `designs.account_id` equals the session's account. `saveCredentialOf` tries the token arm first
  (`app/api/designs/[id]/route.ts:210-216` [src]), so the token arm is the common signed-in case and carries no account.
  Otherwise it writes nothing and answers `stale` (revision differs) or `none` (everything else).
- **W4a-2. Newer never replaced by older.** When a row exists, the write replaces it only if the incoming revision is
  greater (compared as `bigint` in SQL; revisions grow, `0004_add_design_revision.sql:7-8`). Property (fast-check): for
  any order of writes of revisions r1 < r2 each valid when issued, the stored revision ends as the greatest one written.
- **W4a-3. The table refuses what the code refuses.** An empty image, one over the backstop, a type outside the closed
  list, and a negative revision are refused by the table's checks (a test inserts each directly as the test owner).
- **W4a-4. Add-only.** The migration creates; it alters, drops and renames nothing that exists. It is idempotent
  (`if not exists`), as the runner requires, and its header names the grant as the owner's step and the order:
  migration, grant, then the code that reads it.
- **W4a-5. The image check.** The domain refuses bytes whose magic number is not the claimed type's, any image whose
  header dimensions are not exactly 640×480, a PNG carrying an `acTL` chunk, and a WebP whose `VP8X` header sets the
  animation flag, with codes and never the bytes (reusing the preset check's approach, ADR 0112 Amendment A d4).
- **W4a-6. Deleted with the kitchen, in one statement.** The client's delete (`markDeleted`) removes the design's
  `design_thumbnails` row in the same statement that sets `deleted_by_client_at`, only for the design it marked; a
  delete that marks nothing (a sent kitchen, a foreign one, already deleted) deletes no picture; hiding a kitchen
  leaves its picture row in place.
- **W4a-7. Privileges.** The application-role privilege test asserts on `design_thumbnails`: `SELECT`, `INSERT`,
  `DELETE` present; `UPDATE` on `revision`, `image`, `image_type`, `captured_at` present and on `design_id` **absent**;
  nothing to `PUBLIC`; no grant option.

**Verification.** Persistence tests against the test database (W4a-1 to W4a-3, W4a-6); a migration-file test as the
existing ones (shape, idempotence); domain unit tests for W4a-5; the privilege test (W4a-7) on a database where `0030`
and its grant are applied.

### W4b — the upload route and the capture after a save (item 3)

**Decision (ADR 0181 d1, d2, d5).** `PUT /api/designs/{id}/thumbnail`, which **must stay under `/api/designs/{id}/`**:
the write-token cookie's path is `/api/designs/{id}` (`lib/server/write-token.ts:49`, `:115-117` [src at `607af1db`]).
In the route: the cross-site guard first; the save's credential (`saveCredentialOf`, `app/api/designs/[id]/route.ts:206-216`
[src]: the design's write token, or the session of the account that owns it); buckets **mirroring `judgeSaveRequest`**
(`lib/server/rate-limit/judge-save-request.ts:42-81`): a network-block step (`thumbnail-by-block`), then
`thumbnail-by-credential` (the token's hash) or `thumbnail-by-account`, new code-constant purposes with production and
e2e twins (`limit-policy.ts:638-668`, `:689-770`), failing closed; the body to a bound derived from the 128 KiB cap;
strict base64 as the preset body judges it (`lib/server/preset/preset-save-body.ts:75`, `:178-186`); W4a-5; then
`storeThumbnail` with the credential's arm (W4a-1). `409` only when the credential matched (the save's rule,
`neon-configuration-repository.ts:409-411`); every other failure is the one `404`.

In the editor, the **trigger** decides, not where the capture is registered: `SceneCaptureRegistration` is mounted by
`KitchenCanvas` in every configurator variant (`scene/kitchen-canvas.tsx:43`; `configure-screen.tsx:225` [src at
`607af1db`]), so its comment that "a shared link offers no capture" (`scene-capture-registration.ts:48-51`) is false
and is corrected. An upload starts only for the **owner** variant, after a **confirmed** save, for a design an
**account** owns; then the registered snapshotter (`scene/capture-scene-image.ts:28-48`) draws 640×480 and the client
uploads it, throttled: at most one capture and upload in flight, the newest saved revision
replaces a pending older one, and at least `THUMBNAIL_MIN_INTERVAL_MS` (a named constant; 10 s proposed [inf]) between
upload starts, with a trailing upload of the newest revision.

**3D anchors and scaling (product-invariants).** No geometry changes. The capture uses the preset capture's camera rule
unchanged (`overviewFittedToFrame` and the cutaway, `scene-capture-registration.ts:9-16`); only the target pixel size
changes, and the 4:3 aspect ratio is kept, so the framing is the preset card's. **Structural dependency:** the
snapshotter hides overlays by name literals (`solids`, `voids`, `selection_outline`, `overflow_mark`,
`scene-capture-registration.ts:28-32`); a renamed adapter node would put selection outlines on every customer card
(backlog 271, `docs/backlog/open.md:3280`). W4b closes 271: the adapter exports the names (or a helper that hides
the editing overlays) and the capture consumes them.

| Slice | Work | Files likely touched | Reading |
| --- | --- | --- | --- |
| W4b | Upload route and its server module; three limiter purposes and their judge; capture size as a parameter; the after-save trigger; adapter-exported overlay names | `app/api/designs/[id]/thumbnail/route.ts` (new), `lib/server/design-thumbnail.ts` (new), `lib/server/rate-limit/limit-policy.ts` plus a `judge-thumbnail-request.ts` beside `judge-save-request.ts`, `scene/capture-scene-image.ts`, `scene/scene-capture-registration.ts` with an export from `packages/three-adapter`, `scene/use-thumbnail-after-save.ts` (new) wired from the save path (`persistence/save-coalescer.ts`) | ADR 0181 (whole, Accepted); `judge-save-request.ts`; `limit-policy.ts:630-880`; `write-token.ts:40-120`; `preset-save-body.ts:60-190`; `neon-configuration-repository.ts:390-415`; `kitchen-canvas.tsx`; `configure-screen.tsx:215-230`; ADR 0112 Amendment A d3, d4; ADR 0156; ADR 0172 D9; `app/api/designs/[id]/route.ts:60-260`; `capture-scene-image.ts`; `scene-capture-registration.ts`; `save-coalescer.ts` (the saved-revision signal only); backlog 271; `docs/best-practices/product-invariants.md`; `docs/skills/lemnaria-3d-reference/SKILL.md` |

Seven production files; the dispatch names the excess and a mini-review runs before W4c. If the coordinator prefers,
split the server half (route, module, limiter) from the client half (capture, registration, trigger).

**Acceptance criteria.**

- **W4b-1. The save is never held.** With the upload endpoint answering after 30 s, or failing, every save in the
  existing save suite completes with the same requests, order and outcome as at `12266a02`; no save waits on a capture.
- **W4b-2. Credential.** The upload is accepted with the design's own write token (no session needed) and with the
  owning account's session, and answers `404` (one body, as an unknown id) for no credential, a foreign write token,
  another account's session, and a design with no account, whichever arm. A cross-site request is refused first, as
  the save route refuses it, before any bucket is counted. None of the refusals writes.
- **W4b-3. Stale, only for the owner.** An upload with a matching credential for a revision that is not the design's
  current one answers `409` and writes nothing; the same upload with a non-matching credential answers the one `404`.
- **W4b-4. Checked bytes.** Bytes failing W4a-5, a body past its bound (the bound computed from the cap's constants;
  a body one byte over is refused, one at the bound is read), a type outside the list, and base64 that is not
  canonical (wrong alphabet, length not a multiple of four, or not equal to its own re-encoding) are refused before
  any write, with a code and never an echo of the bytes.
- **W4b-4b. Buckets mirror the save's.** The block bucket is counted before the credential's; the token arm counts
  `thumbnail-by-credential` keyed by the token's hash, the session arm `thumbnail-by-account`; neither counts a save
  bucket, and a save counts no thumbnail bucket.
- **W4b-5. Throttle.** Property (fast-check over save timings): for any sequence of saved revisions, uploads start at
  least `THUMBNAIL_MIN_INTERVAL_MS` apart, never more than one is in flight, and the last upload carries the newest
  saved revision.
- **W4b-6. Only the owner's editor, only an account's design.** No upload on the review, contact, done or room
  screens, **nor on the share view (`/s/{token}`) or the staff 3D view**, both of which mount the editor canvas with the
  capture registered; and none for a visitor's design with no account, nor before a save is confirmed. Tested on the
  share view and the staff 3D view by recording requests while the scene is used.
- **W4b-7. What the picture shows.** The captured image holds no selection outline, no void outline and no overflow
  mark (a test renders a scene with a selection and an overflow and checks the hidden nodes by the adapter's exported
  names; backlog 271 closed).
- **W4b-8. No visible effect.** During a capture the live canvas shows no frame of the capture camera and no size jump
  (screen recording at 390×844 and 1440×900 in the visual review).
- **W4b-9. Bucket.** A bucket that cannot be counted fails the upload closed (`503`), never the save.

**Verification.** Route tests (W4b-2 to W4b-4, W4b-9); the W4b-5 property against a fake clock; a save-suite run with a
hanging upload stub (W4b-1); a scene test for W4b-7; Playwright plus recording for W4b-6 and W4b-8.

### W4c — the private read route and the card's picture (item 3)

**Decision (ADR 0181 d6, d7).** The kitchens list answer gains `thumbnailRevision: string | null`; the card draws
`<img src="/api/account/kitchens/{id}/thumbnail?r={revision}" alt="">` over the stripes when it is non-null, and the
stripes alone otherwise. `GET /api/account/kitchens/{id}/thumbnail`: the cross-site guard first; **its own fail-open
read bucket** by network block (as preset images have, `limit-policy.ts:86-94`, `:303-306` [src at `607af1db`]); the
session and `design.read.own`; one statement joining `designs.account_id = <session>` and the not-hidden, not-deleted
marks. It answers with `Cache-Control: private, no-store` (the account answers' rule, `account-responses.ts:26`),
`nosniff`, `Content-Type` from the closed list, `Cross-Origin-Resource-Policy: same-origin`, the closed image policy
`default-src 'none'; sandbox` (set by the route and by a new proxy branch, as the preset image path has,
`proxy.ts:133-140`, `:378-391`; `security-headers.ts:122-129`), and one `404` body for every refusal after the cross-site
guard. The account pages' CSP already admits same-origin images
(`img-src 'self' blob: data:`, `lib/security-headers.ts:159` [src]). Unlike the preset image route, which is public
with `max-age=60` (`app/api/presets/[id]/image/route.ts:23-28` [src]), a kitchen picture is private.

| Slice | Work | Files likely touched | Reading |
| --- | --- | --- | --- |
| W4c | The read route and its read bucket; the proxy branch; the list's thumbnail revision; the card | `app/api/account/kitchens/[id]/thumbnail/route.ts` (new), `proxy.ts`, `lib/server/rate-limit/limit-policy.ts` (one read purpose), `packages/persistence/src/neon-account-kitchen-store.ts` (list statement), `account/kitchens/kitchens-wire-contract.ts`, `account/kitchens/kitchen-card.tsx`, `account/kitchens/kitchens.module.css` | ADR 0181 (whole, Accepted); ADR 0172 D9; `app/api/presets/[id]/image/route.ts`; `proxy.ts:125-145`, `:370-395`; `security-headers.ts:115-130`; `limit-policy.ts:80-100`, `:295-310`; `app/api/account/kitchens/[id]/route.ts`; `own-kitchen-session.ts`; `neon-account-kitchen-store.ts` (list); `kitchen-card.tsx`; `kitchens.module.css:80-100`, `:495-510`; Lot 2 plan C2 (`:471`) |

Seven production files; the dispatch names the excess and a mini-review runs before close.

**Acceptance criteria.**

- **W4c-1.** A kitchen saved in the editor after W4 shipped shows its picture on its card at 390×844 and 1440×900,
  covering the thumbnail box without distortion (`object-fit: cover`), with the stripes underneath until it loads.
- **W4c-2. Placeholder.** A kitchen with no stored picture shows exactly today's stripes and causes **no** thumbnail
  request. A picture that fails to load leaves the stripes and no broken-image glyph.
- **W4c-3. One `404`.** Another account's kitchen, a client-deleted kitchen, a hidden kitchen, a malformed id, an
  unknown id, no session, an unconfirmed account and a staff session (neither holds `design.read.own`) all answer the
  same `404` bytes and headers; a malformed id issues no query. A cross-site request gets `crossSiteResponse()` first,
  before the read bucket is counted.
- **W4c-4. Headers.** A `200` carries `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff`, a
  `Content-Type` in the closed list (a stored type outside it answers `404`), `Content-Disposition: inline`,
  `Cross-Origin-Resource-Policy: same-origin`, and an **enforced** `Content-Security-Policy: default-src 'none';
  sandbox` whatever the page policy's mode (a proxy test, as the preset image path's).
- **W4c-4b. Read bucket.** The route counts its own network-block read purpose, which fails open; it does not count the
  pages' read bucket, and a bucket that cannot be counted still serves.
- **W4c-5. Decorative.** The image has `alt=""` and the card's accessible name is unchanged (the kitchen's name).
- **W4c-6. Must not:** the list's order, paging, counts and the card's other content change; the list answer's size
  grows by the one field per kitchen and no image bytes.

**Verification.** Route tests (W4c-3, W4c-4, W4c-4b); a proxy test for W4c-4's policy; persistence test for the list's
new field; component test (W4c-2,
W4c-5); Playwright and screenshots (W4c-1, W4c-2).

**QA reading (W4).** ADR 0181; this section; ADR 0112 Amendment A d3 to d5; `capture-scene-image.ts`;
`scene-capture-registration.ts`; `app/api/designs/[id]/route.ts`; `app/api/presets/[id]/image/route.ts`; the migration;
`product-invariants.md`.
**Logic reviewer reading.** ADR 0181; ADR 0172 D9; migration `0004` header; `save-coalescer.ts` (signal only); the diff.
**Clean-code reviewer reading.** The diff; `engineering-conventions.md`; backlog 271.
**Security reviewer reading.** ADR 0181; ADR 0156; ADR 0112 Amendment A d4, d5; `security-headers.ts`; `proxy.ts` (the
matcher, `:80-100`, and the image branch, `:125-145`, `:370-395`); `judge-save-request.ts`; `write-token.ts`; the
migration and its grant text; `application-role-privileges.test.ts`; the diff.
**Visual reviewer reading.** `browser-and-visual-qa.md`; frames A9C and DA9C (`Lemnaria Cont Lot 2.dc.html:182`); the
screenshots and the W4b-8 recording.

---

### W5 — the staff cabinet list: Claude Design round trip (item 5.2)

The prompt is written in this planning step:
[`docs/design/claude-design-brief-staff-cabinet-list.md`](../design/claude-design-brief-staff-cabinet-list.md). W5 is
the owner pasting it into Claude Design with the listed attachments, then copying the export into
`docs/design/mockups/` (sha256 recorded, as the Lot 3 copy was). **No code.** Implementation gets its own plan once
the export exists. Tier: none (documentation; the owner reviews the brief).

- **W5-1.** The brief extends the staff page's existing cabinet list (frame D10B, `staff/kitchen-version-rows.ts`)
  rather than adding a second list, and states which data exists today and which does not.
- **W5-2.** The brief leaves the per-row price question open for the owner (the page deliberately omits a price priced
  with today's book beside the sent estimates, `staff/staff-kitchen-view.tsx:294-296` [src]).

## 6. Risks

- **R1. The account control's inert scope (W1a).** See W1a's structural risk 1; a passing component test does not
  prove it, only W1a-3 in a browser does.
- **R2. Autosave frequency (W4).** Capture cost on a low-end phone during editing; mitigated by the throttle and by
  W4b-8. Falsifier: frame drops visible in the recording.
- **R3. Pre-existing grants (W2).** If the `0012`/`0017` grants are missing on an environment, W2a's statement fails
  there; best-effort means the contact flow survives, but the feature silently does nothing. Close-out names the
  check.
- **R4. Staff 3D view language switch (W3b-7).** The locale menu's locale-free path under `/staff` is unverified; it may
  need a staff-specific href.
- **R5. Thumbnail of an older revision (W4).** A card may show a picture a few seconds older than the last edit (the
  trailing upload not yet sent when the tab closed). Accepted [inf]; the next save corrects it.
- **R6. Copy.** W2b adds the notice line, W3 at least two strings (the link's label, the audit action's label), W4c none
  visible. All of M11's new Romanian and Russian copy is pre-approved as drafted (second round, Q3 [owner, relayed]).
- **R7. Privacy notice (W2).** The notice is an unpublished draft; W2a-12 changes the draft only. The launch gate that
  publishes the real notice must carry the statement (ADR 0172, *Remaining* item 6).

## 7. Verification at close

`pnpm check` before the commit that closes the milestone, `pnpm ci:local` before every push, `pnpm format:check`
whole-tree last (WORKFLOW, *Evidence standards*). Each wave's figures are quoted from the run, not restated. The test
audit runs at close (WORKFLOW step 7).

## 8. Questions only the owner can answer

**All three were answered on 2026-11-13, second round [owner, relayed]:** Q1 yes, the form says it in one line (W2b-9);
Q2 refill, no mark and no migration; Q3 pre-approved as drafted. The third round answered the security read's questions
(§10). No owner question is open for M11. The questions are kept below as asked.

- **Q1 (W2a). Consent and notice.** The form's consent reads *"Sunt de acord cu prelucrarea datelor pentru a primi
  oferta."* (`apps/web/src/messages/ro.json:404` [src]; the consent text is still a placeholder version,
  `contact-fields.ts:28`). Saving the values into the profile is a second use. Should the form say so in one line
  when a signed-in client has blanks (for example *"Completăm profilul tău cu datele care lipsesc."*), or is the
  account's privacy notice enough?
- **Q2 (W2a). A phone the client removed.** The profile screen treats an empty phone as a deliberate withdrawal
  (frame A10A's note, *"Telefonul gol se salvează (retragere)"*, `Lemnaria Cont Lot 2.dc.html:194` [doc]). Under "fill
  blanks", the next request sent with a phone puts it back. Keep that, or skip the phone when the client has emptied it
  on purpose (which needs a stored "withdrawn" mark: a migration)?
- **Q3 (W3, W4). New copy.** Is the new Romanian copy (the "open in 3D" label, the audit action's name, any
  thumbnail-related line) pre-approved as drafted, as Lot 2's later copy was (O28b), or reviewed before merge?

## 9. Owed at close or by the scribe (not done in this planning step)

- An ADR 0104 amendment for frame A9A's departure (W1a), pointing at the `docs/design/README.md` note.
- ~~Index rows for ADRs 0179, 0180, 0181 in `docs/decisions/README.md`~~ — added 2026-11-13 with rows 0175 to 0178,
  which were missing.
- The runbook section for `0030` and its grant; the owner applies both on preview, then production, before W4c ships
  (ADR 0020).
- The owner's check that the `0012` and `0017` grants hold on preview and production (R3).
- `docs/STATUS.md`: the M11 row and *What to do next* (the security read is done; W2 to W4 are dispatchable).
- ~~ADRs 0179 to 0181 move from Proposed to Accepted only after their security reads~~ — Accepted 2026-11-13 (§10).
- The `docs/legal/privacy-notice-draft.md` statement (W2a-12), in W2a.
- The `0030` grant now includes `DELETE` (W4a-7); the runbook section says so.

## 10. Security read and third-round rulings, 2026-11-13 [sec, relayed; owner, relayed]

The security read of ADRs 0179 to 0181 found no exploitable design flaw and required text changes, each re-read in
the source at `607af1db` before it was written. Folded in:

- **ADR 0179 / W2.** F1: the gate is `design.edit.own` (every role and unconfirmed accounts hold `account.manage.own`),
  server-side and, before the profile read, client-side from `/api/account/session` (W2a-5, W2b-4). F2: the copy into
  the profile is an owner-ruled change to ADR 0153 d1 (ADR 0153 Amendment A), not D11; the notice draft says so
  (W2a-12). F3: the line names the account's e-mail (W2b-9). F4: the deadline, no fill on conflict, the retry cases,
  the closed-list log (W2a-7, W2a-11). F5: no profile read or refused event for a visitor (W2b-4).
- **ADR 0180 / W3.** F1: the route file's cross-site guard and `HEAD`, the `private, no-store` body (W3a-9 to W3a-11).
  F2: the detail reader's closed key list, the classification, the round trip (W3a-7b). F3: no row and a defined
  refusal when no copy is readable; `version` judged after admission; the language switch's second row accepted
  (W3a-6, W3a-12, W3b-7).
- **ADR 0181 / W4.** F1: the upload's buckets mirror the save's (W4b-4b). F2: the read route's own fail-open bucket,
  cross-site guard, `design.read.own`, the join and marks (W4c-3, W4c-4b). F3: the closed image policy through a proxy
  branch; animated images refused (W4c-4, W4a-5). F4: `409` only for a matched credential, cross-site first, strict
  base64, a bound derived from the cap (W4b-2 to W4b-4). F5: `DELETE` grant, the picture deleted in the delete
  statement, the privilege test (W4a-6, W4a-7). F6: the trigger keeps the share and staff views from uploading
  (W4b-6, W3b-10). The upload route stays under `/api/designs/{id}/`, the write-token cookie's path.
- **Third-round rulings [owner, relayed]:** confirmed customers only for prefill and fill; the ADR 0153 d1 change and
  the notice; the picture deleted with the kitchen, kept when hidden.

ADRs 0179, 0180 and 0181 are **Accepted** (2026-11-13), each with a dated *Acceptance* section.

## 11. W2a review round, 2026-11-13 [relayed from the reviewers; coordinator]

- **No blockers.** The logic, clean-code and security reviews all found no blocker. Security found nothing exploitable.
- **Privacy notice fixed by the coordinator** (`docs/legal/privacy-notice-draft.md`):
  - The §2 name/address row is no longer marked "later".
  - The staff-visibility clause is narrowed to the profile's name and phone.
  - The fill is scoped to accounts with a confirmed e-mail, and its promise is limited to the fill itself.
  - §3 gains a fill row whose basis is a placeholder, and the phone row now says a later request refills it.
  - §4 names the profile's name and phone.
  - Security M1 is a **launch-gate item**: the phone's consent basis can be undone by the fill, and the basis of the
    fill itself is unset. The owner or a lawyer settles both before launch.
- **Security L3 — W2a must not reach real users without W2b.** W2b's form line names the account the details are
  saved to (ADR 0179 d5). W2b should also reset the form's request id when the session changes, so a retry after a
  sign-out and sign-in cannot write into the second account. Nothing ships mid-milestone, so this is recorded as a W2b
  criterion, not a block.
- **A retry by a different confirmed client fills that client's own blanks**, using values they sent. Logic and
  security reviews judged this acceptable; it departs from ADR 0179 d2's premise that "the first try is the one that
  filled".

## 12. W2b QA rulings, 2026-11-13 [coordinator]

W2b's adversarial QA found five defects. The coordinator ruled on each:

1. **W2b-8 is amended.** The form reads the profile once for each distinct confirmed account per mount, not once per
   mount. This lets a second confirmed client on the same tab see the line that names their account (ADR 0179 d5,
   security F3/L3) before the server fills their blanks.
2. **A restore whose session read fails** withdraws the values the profile filled in, and the line. It keeps what the
   customer typed and keeps the request id.
3. **A send made while the session is still unknown** gets a new request id if the first definite session answer
   cannot be shown to be the same account.
4. **A profile that arrives while a send is in flight or unanswered is ignored**, so the unanswered send's projection
   and id never change.
5. **A profile value that is only whitespace counts as blank.**

Accepted gaps, pinned by QA tests:
- a sign-out and sign-in in a side-by-side window, while this tab stays visible, is not detected;
- a resend triggered by the connection returning can race a session read that is still out.

## 13. W2b review round and the owner's e-mail-check ruling, 2026-11-13

**Owner ruling (answered in chat, relayed).** The form sends the account e-mail its line showed. The server fills the
profile only when that e-mail equals the signed-in session's e-mail. If no line was shown, no e-mail is sent and nothing
is filled. This closes the cross-account paths that §12 accepted as gaps (the side-by-side window, the `online` resend
race) and the W2b security review's L1, L2 and I1. W2a's committed server fill (`99f641e7`) changes accordingly.

Implementation constraints:
- The e-mail is an optional body member.
- It is excluded from the request's payload digest, so a retry of the same request stays the same request.
- It is compared case-insensitively against the session account's e-mail.
- A mismatch or absence is a silent no-fill, never a refusal.

**Coordinator rulings on the W2b reviews:**
- **B1 (logic, blocker).** A withdrawal must not strand the failure screen (5B, ADR 0160 d2). Values that a send has
  carried are the request's values: no withdrawal touches them while a send holds a reusable id. With the e-mail
  check, keeping them cannot fill another account.
- **S1.** A pending restore is remembered until a definite session answer arrives, so the withdrawal on a failed
  restore read is not lost when `visibilitychange` follows `pageshow`.
- **S2.** The comment's reason is corrected.
- **N1.** Line emptiness for locality is decided the way the server reads text (format characters stripped).
- **N2.** Accepted: a stored whitespace-only profile value cannot be produced by the app.
- **Security I2.** On a back-forward restore, the profile-filled values are withdrawn at once, unless a send holds them
  (B1). They are refilled after a matching read.
- **Security I3.** After a send succeeds, the hook stops following the session.
- **Clean-code.**
  - The copy moves to `contact.fillNotice`.
  - The pure mappers move out of the hook.
  - The cached "profile read failed" state is named.
  - QA's "DEFECT" test titles are renamed to the property each now protects.
  - The duplicated fake-fetch response building is shared.
  - The session endpoint constant is shared.

## 14. Security re-read of the e-mail check, 2026-11-13 [coordinator rulings]

The re-read found that the server side holds: no client can fill another account's profile, and the address is never
stored, logged or mailed. The client side did not keep the amendment's promise (M1). The rulings below keep the owner's
intent, which is that one account's details never fill another account's profile.

- **M1 (Medium).** The claim follows the account the values were entered under, not the account shown at send time.
  - On a definite change to a different account, the request id is reset first, and the previous account's
    profile-filled values are then withdrawn. They are not adopted. B1's adoption applies only to the `unknown`/restore
    path, where no other account is known.
  - Values the customer typed under the previous account are kept. The form is marked "entered under another
    account", and it sends no `profileAccountEmail` until the customer edits a field. Test
    `profile-prefill.dom.test.ts:610` is inverted accordingly.
- **L1 (Low).** While a send holds the id, the withdrawal of profile-filled values is deferred rather than turned into
  adoption. The pending withdrawal is applied when the hold ends: the id is reset or spent, or a definite answer
  arrives for another account or a visitor.
- **L2 (Low).** A malformed `profileAccountEmail` (not a string, or over 254 characters) is ignored as a claim, never
  refused. ADR 0179 Amendment A's "never a refusal" then holds without exception.
- **Follow-up to M1 (coordinator, 2026-11-13).** A definite account switch can empty a field the request needs while
  the failure screen (5B) shows. When it does, 5B gives way to the form, and focus goes to the first empty required
  field. ADR 0160 d2's promise that "nothing is asked again" was made to the previous account, so it does not carry
  over to a different person. Retry from 5B is never a dead press.
