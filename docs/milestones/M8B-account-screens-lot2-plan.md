# M8B — Account screens, Lot 2: port plan for L14b (client dashboard, A9–A20)

> **STATUS: DRAFT, 2026-10-19, architect. No wave dispatched, nothing committed.**
>
> **Update 2026-10-20 [coordinator's brief, relayed; the scribe ran nothing]: waves are built and committed.** Server
> waves S1-S10 and UI waves U5, U6, U10, U12 are committed on `feat/login-register` (HEAD `a47db452`); U7/U8 and U11
> are in progress. Each wave was source-reviewed by a logic and a security agent. **No test was written (ADR 0172 D12),
> and nothing was run against a database or in a browser.** The built state, the decided column bounds, the accepted
> residuals and the tests owed are in the new §12; the new owner questions O19-O24 are in §9. The text above this line
> and §§1-11 are the plan as written on 2026-10-19 and are kept unchanged.
>
> - Branch `feat/login-register`, worktree `lemnaria-configurator-login`.
> - This file adds to [`M8B-login-register-plan.md`](M8B-login-register-plan.md) and to
>   [`M8B-account-screens-lot1-review.md`](M8B-account-screens-lot1-review.md).
> - It does **not** amend either of them, nor ADR 0172. Every proposed ruling below is a **P-row** (the architect or
>   the coordinator rules) or an **O-row** (the owner rules). Once a ruling is made, the scribe records it as a dated
>   amendment.
> - **The plan's L14b row ("≤ 3 files") cannot hold Lot 2.** §6 replaces it with server waves S0a–S12 and UI waves
>   U1–U15b. That replacement is itself a proposal (P1).
>
> **D12 still applies.** ADR 0172 D12 says this round runs without tests and without a QA step.
>
> - "QA" below means **none this round**.
> - The gate is the green verification of plan §8.
> - **Security review stays on every code wave** (Fix 3 item 7). Visual review is on every wave that ships a page.
> - Tests and e2e are **owed** (§8.3). They are not part of any wave.

**Inputs.**

- `docs/design/mockups/Lemnaria Cont Lot 2.dc.html` (54.8 KiB) and `docs/design/mockups/ContBlocks2.dc.html`
  (17.4 KiB). Both are untracked in this worktree [run: `git status --short`].
- Lot 2 imports `ContBlocks2`. `ContBlocks2` in turn imports Lot 1's `ContBlocks.dc.html` for the legacy blocks
  (field, notice, hero, links, p).
- `ContBlocks.dc.html` is tracked and unmodified [run: `git status` lists only the two Lot 2 files].
- Both files load `./support.js`, which the repository does not hold. **Everything below was read from the markup and
  the frame script as text. No frame was seen rendered.**
- The brief they answer: `docs/design/prompts/account-batch-2-claude-design-prompt.md`, Part 0 and Part 2.

**Evidence tiers** (as in the Lot 1 review).

| Tag | Meaning |
| --- | --- |
| **[mock]** | Read in the Lot 2 or ContBlocks2 markup or script |
| **[src]** | Read in this worktree's source at HEAD `4e71f9df` |
| **[doc]** | Quoted from a record in this repository |
| **[run]** | A command the architect ran, result quoted |
| **[inf]** | The architect's inference |
| **[ven]** | A vendor fact from memory, **not re-read** |

---

## Goal and scope

**Goal.** A signed-in client can do the following from any device:

- see, open, rename, duplicate, share, delete (drafts) and hide (sent) the kitchens their account owns;
- edit an optional name, address and phone;
- change their e-mail and password;
- export their data;
- sign out here or everywhere.

The configurator shows who is signed in. Claiming happens through one explicit dialog. An expired session is told
apart from a refusal. Throughout:

- no response tells a stranger whether an address or a design exists;
- hiding or deleting closes **every** way back to a kitchen;
- no screen promises a path that does not exist (brief rule 0.3-6).

**In scope:**

- A9 (list and its actions), A10 and A10T (profile and the confirm-new-address token page), A11, A12;
- A14, A17, A18 (the count; the detail per O2), A19, A20;
- the server waves S0a–S11 those screens need.

**Out of scope, each with its reason:**

| Item | Why it is out |
| --- | --- |
| A13, delete account | Erasure has no record, credential or grant (C17, O5) |
| A15, A16, A16C | Save / Discard is undefined under autosave (CG1, O1) |
| Thumbnails | No render pipeline exists (C2) |
| Physical deletion of a draft | No `DELETE` grant; P8 uses a mark |
| Lot 3 staff screens | Not in this lot. That includes "Zona personalului", the unhide control and staff reads (`design.read.any`) |
| The login failure-only back-off | ADR 0172 D5, still unbuilt; not this lot |

## 0. How Lot 2 is built

- **Data-driven, as Lot 1 is.** One `SCREENS` array (`Lot 2.dc.html:178-276`) drives a 390 × 844 phone template and a
  1920 × 1080 desktop template [mock].
- **Header kinds** [mock]:
  - `hdrStd`: ‹, the wordmark, the RO chip. The account pages use it. **There is no title in the header.** This answers
    Lot 1 SB2.
  - `hdrEd`: the wordmark, a step pill "3/5", "Intră în cont" or a person icon, and the chip. These are editor frames.
- **Overlay kinds** [mock]:
  - `sheet`: a bottom sheet on mobile, a centred dialog on desktop.
  - `dialog`: `role="alertdialog"` on mobile.
  - `menu`: a sheet on mobile, an anchored menu on desktop.
  - `toast`: `role="status"`.
- **Frame count** [run: `grep -o "{id:'A…'"` over the script returns 72 literal IDs, 20 of them with `d:1`]. A `.map`
  builds four more, A18A, A18A2, A18A3 and A18A4 (n = 1, 2, 5, 20), of which only A18A has a desktop frame. Totals:
  **76 mobile frames and 21 desktop frames, 97 in all**.

  | Screen | A9 | A10 | A11 | A12 | A13 | A14 | A15 | A16 | A17 | A18 | A19 | A20 |
  | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
  | Mobile frames | 12 | 13 | 7 | 5 | 6 | 6 | 4 | 3 | 4 | 9 | 4 | 3 |
- **The closing section** (`Lot 2:317-325`) holds the answers to brief §0.9 (six answers), the plural table and two
  lists: the new blocks and the added copy [mock]. §3 and §9 cite them as "CD answer n".
- **Lot 1's send-backs that Lot 2 honours** [mock]:
  - 44 px header targets (SB1);
  - no header title (SB2);
  - the wait inside the notice, never in the button (SB10, A11F);
  - clock-time waits (SB5, A12D, A13F);
  - token-page errors that say "open the link again" (SB7, A10T4, A10T5);
  - offline as a notice (SB8, A9J).

## 1. Screen map: A9–A20 → route, component, hook, and every frame

**Conventions.**

- New client files go under `apps/web/src/account/{kitchens,profile,session}/`. Page shells go under
  `apps/web/src/app/[locale]/account/{page}/page.tsx`. Endpoints are §2's.
- "Server, drawn → port" shows the mock's `Server:` line, then what the port actually answers against.
- An endpoint marked **(new)** does not exist yet.
- Route names are those the mock proposes ("propusă"). P2 accepts them.

### A9 — Bucătăriile mele

- **Route:** `/[locale]/account/kitchens`. A new page in the `ACCOUNT_SIGNED_IN_PAGES` set (P3).
- **Page:** `app/[locale]/account/kitchens/page.tsx`, gated through `readSignedInPage(design.read.own)`.
- **Components:** `kitchens/kitchens-screen.tsx`, `kitchen-card.tsx`, `kitchen-menu.tsx`, `rename-kitchen-form.tsx`,
  `share-kitchen-sheet.tsx`, `delete-kitchen-dialog.tsx`, and the shared `account/account-dialog.tsx` and
  `account/status-toast.tsx`.
- **Hooks:** `use-kitchens.ts` (list and cursor) and `use-kitchen-actions.ts`.
- **Pure helper:** `kitchen-summary.ts` (name, meta, relative date, price floor).

| Frame | State [mock] | Server, drawn → port | Port note |
| --- | --- | --- | --- |
| A9A + DA9A | Loading: skeleton (3 mobile, 4-card grid on desktop) | "GET listă: de stabilit" → `GET /api/account/kitchens` (new) | Live region "Se încarcă bucătăriile". The skeleton is `aria-hidden` |
| A9B | Empty: hero + "Începe o bucătărie" | 200, `total: 0` | One CTA, a full-load `<a href="/{locale}">`. No "show hidden" |
| A9C + DA9C | List mixing sent and draft; a long name on 2 lines; "3 bucătării · Cele mai recente întâi"; "Încarcă mai multe" | 200 page plus `nextCursor` | Name clamped after 2 lines; the full name is the accessible name. The count uses ICU plurals (owner's "without «de»", §3 C30). Price and thumbnail: P5, P6 |
| A9D | "⋯" menu open on a draft | — | Items: Redenumește, Duplică, Link de partajare, separator, Șterge. On a sent kitchen the last item is **Ascunde**. 44 px items; Esc returns focus to "⋯"; `aria-expanded` |
| A9E | Inline rename, error "Scrie un nume." | "de stabilit" → `PATCH /api/account/kitchens/{id}` (new) | Error tied to the field (`aria-invalid`, `aria-describedby`). "Numele este prea lung." for `TOO_LONG`. Copy gap for `FORBIDDEN_CHARACTER` / `NOT_TEXT` (§3 C31) |
| A9F | Duplicate busy (card on top, "Se creează copia…"), then toast "✓ Copie creată" | "de stabilit" → `POST /api/account/kitchens/{id}/duplicate` (new) | Busy card has `role="status"`. The failure state is not drawn: notice pattern (§10 SB-L2-9) |
| A9G | Share sheet, Tab order ① Copiază → ② Oprește → Închide | "de stabilit" → **built** `POST/GET/DELETE /api/designs/{id}/share` (account arm, L12b) | **Contract gap CG2:** the URL exists only at issue. Sheet states per P7 |
| A9G2 + DA9G2 | "✓ Copiat"; stop, confirmed inside the sheet | built `DELETE …/share` | No undo |
| A9H + DA9H | Delete-draft dialog, "Anulează" focused | "de stabilit" → `DELETE /api/account/kitchens/{id}` (new) | Destructive outline button, never pre-focused. Copy: §3 C6. Mechanism: P8 |
| A9I | 503: notice + "Încearcă din nou" | `503 unavailable` | The Lot 1 notice (`FormNotice` err) |
| A9J | Offline: notice above the cards already loaded | no answer | The list stays |
| A9K | "Bucătăria nu este disponibilă." on open | "404 sau a altcuiva" → the built one refusal of `loadOwnedDesign` | Drawn as an account page, but opening goes to `/{locale}/d/{id}`, whose refusal is `app/d/[id]/design-load-error.tsx` [src]. P9 |

### A10 — Profil, and the confirm-new-address token page

- **Profile route:** `/[locale]/account/profile` (`ACCOUNT_SIGNED_IN_PAGES`).
- **Profile page:** `app/[locale]/account/profile/page.tsx`. It reads the profile on the server, which a render may
  do (read-only).
- **Profile components:** `profile/profile-form.tsx`, `profile/change-email-sheet.tsx`.
- **Profile hooks:** `use-profile-save.ts`, `use-change-email.ts`.
- **Token route:** `/[locale]/account/confirm-email#t=…`, added to **`ACCOUNT_TOKEN_PAGES`** (P3).
- **Token page:** `app/[locale]/account/confirm-email/page.tsx` (`connection()`).
- **Token component:** `profile/confirm-email-form.tsx`.
- **Token hook:** `use-confirm-email.ts`. It reuses `fragment-token.ts` [src].

| Frame | State [mock] | Server, drawn → port | Port note |
| --- | --- | --- | --- |
| A10A + DA10A | Loaded fields: Nume (opțional), Adresă / localitate (opțional), E-mail as text + "Schimbă e-mailul", Telefon (opțional, neverificat) + hint; rows | "GET profil: de stabilit" → server render (S7 `findProfile`) | **Contract gap CG7:** the name and address columns do not exist (plan §4, ADR 0118 [doc]). The rows "Exportă datele mele" and "Șterge contul" are hidden until their waves (§3 C8). The privacy row is the Lot 1 stub [src: `app/[locale]/privacy-notice/page.tsx`] |
| A10B | Saving, `aria-busy` | → `PATCH /api/account/profile` (new) | The button keeps its width |
| A10C | "Salvat" notice in a live region | 200 | — |
| A10D | Phone error `PHONE_MOLDOVAN_INCOMPLETE` | `400 invalid-input` (built field codes) | Copy already in `accountFieldErrors.phone*` [src: `ro.json`]. The Lot 1 O3 conflict with the locked contact wording is **still open** |
| A10E + DA10E | Change-e-mail sheet, Tab order new address → current password → Trimite → Anulează; MALFORMED shown | "de stabilit" → `POST /api/account/email-change` (new) | Reuses the e-mail and password field errors |
| A10F | Sheet: "Parola actuală nu este corectă." | "de stabilit" → `400 wrong-password` (new word) | Allowed by brief 0.6-1: it is the person's own password |
| A10G | Sheet: neutral answer, "Dacă adresa poate fi folosită…" | "same answer for a taken address" → `202 check-inbox` | Never says the address is taken |
| A10H | 503 with the typed values kept | `503` | — |
| A10T1 + DA10T1 | Token page ready: "Confirmă" | — | Plain page. **The chip is hidden** although the frame draws it (`hdr:'plain'` maps to `hdrStd`), against rule 0.3-7 and the frame's own note (§10 SB-L2-1) |
| A10T2 | Busy | pending | — |
| A10T3 | Done: "Adresa a fost schimbată." + "Intră în cont" | "de stabilit" → `200 email-changed` from `POST /api/account/email-change/confirm` (new) | "Intră în cont" implies every session was revoked (P12) |
| A10T4 | One invalid answer | `400 link-invalid` | No "Reîncarcă pagina". "Deschide Profilul" is a full load |
| A10T5 | 503: the retry keeps the token | `503` | Lot 1's `platform-failed` rule applies (Lot 1 review §3.3 amendment) |

### A11 — Schimbă parola

- **Route:** `/[locale]/account/password`.
- **Page:** `app/[locale]/account/password/page.tsx`.
- **Component:** `profile/change-password-form.tsx`.
- **Hook:** `use-change-password.ts`.

| Frame | State [mock] | Server, drawn → port | Port note |
| --- | --- | --- | --- |
| A11A + DA11A | Ready: current password (focused), new password + hint | → `POST /api/account/password` (new) | `autocomplete` `current-password` and `new-password`. No "repeat", no meter |
| A11B | Current password wrong | "de stabilit" → `400 wrong-password` | Focus moves to the field |
| A11C | New password refused (`PASSWORD_BREACHED`) | `400 invalid-input`, field **`newPassword`** (P13) | The other codes reuse `accountFieldErrors` |
| A11D | Busy "Se schimbă…" | pending | — |
| A11E + DA11E | Success: "Te-am deconectat de pe celelalte dispozitive." + "Înapoi la Profil" | "de stabilit" → `200 password-changed`, **plus a new session cookie** | **Structural dependency [src]:** `findLive` refuses a session created before `password_changed_at` (`neon-session-store.ts:118,152`). "This device stays signed in" (CD answer 5) therefore needs a fresh session, bound to the new hash, in the same response (P11) |
| A11F | 429, countdown "3:58" in the notice | `429` + `Retry-After` (per-account bucket, S8) | Lot 1 `AccountWait` |
| A11G | 503 | `503` | — |

### A12 — Exportă datele mele

- **Route:** `/[locale]/account/export`.
- **Page:** `app/[locale]/account/export/page.tsx`.
- **Component:** `profile/export-screen.tsx`.
- **Hook:** `use-export.ts`, which downloads a blob from a `POST`.

| Frame | State [mock] | Server, drawn → port | Port note |
| --- | --- | --- | --- |
| A12A + DA12A | Ready; the body lists profile, kitchens incl. hidden, requests, staff notes | "de stabilit" → `POST /api/account/export` (new) | **CG4:** requests and notes cannot be exported (§3 C15) |
| A12B | "Se pregătește fișierul…" | pending | — |
| A12C | "Fișierul este gata. Descărcarea a început." + "Descarcă din nou" | `200 application/json` attachment | — |
| A12D | 429 at a clock time, "după ora 14:30" | `429` (UTC-day bucket) | Lot 1 P5 |
| A12E | 503 | `503` | — |

### A13 — Șterge contul (blocked: erasure is not designed)

- **Route:** `/[locale]/account/delete`.
- **Page:** `app/[locale]/account/delete/page.tsx`.
- **Component:** `profile/delete-account-form.tsx`.
- **Hook:** `use-delete-account.ts`.

| Frame | State [mock] | Server, drawn → port | Port note |
| --- | --- | --- | --- |
| A13A + DA13A | Confirm: the full erasure text, a link to export, password field, "Șterge definitiv contul" / "Anulează" (focused) | "de stabilit" → **none buildable** (CG5) | Every clause of the text promises an unbuilt path (§3 C17) |
| A13B | Wrong password | "de stabilit" | — |
| A13C | Busy | pending | — |
| A13D | Done: "Contul a fost șters." | "de stabilit" | — |
| A13E | 503: "Nu am șters nimic." | `503` | — |
| A13F | 429, "mâine, după ora 03:00" | `429` | — |

### A14 — Ieși din cont / de pe toate dispozitivele

All built server-side.

- **Components:** `session/account-control.tsx` (the menu items), `session/logout-everywhere-dialog.tsx`,
  `account/status-toast.tsx`.
- **Hook:** `session/use-logout.ts`.

| Frame | State [mock] | Server, drawn → port | Port note |
| --- | --- | --- | --- |
| A14A | "Ieși din cont": toast on the configurator | `204` (this-device) [src: `logout/route.ts`] | Immediate, no dialog. In place on the configurator. From an account page it is a full load to `/{locale}` (P14) |
| A14B + DA14B | "Everywhere" dialog, "Anulează" focused | — | — |
| A14C | Busy | pending | — |
| A14D | Done: A4 with "Te-am deconectat de pe toate dispozitivele." | `204` (everywhere) | Needs a new value in `login-arrival.ts`'s closed list: `signed-out-everywhere` [src: today the list holds `session-expired` only] |
| A14E | 503: sessions stay, with the error notice | `503` (fails closed; ADR 0172 Amendment A item 3) [src] | — |
| A14F | Offline | no answer | — |

### A15 — Păstrezi bucătăria curentă? (blocked on O1)

The editor's bottom sheet or dialog.

- **Components:** `session/keep-kitchen-sheet.tsx`.
- **Host:** `app/configurator/configure/configure-screen.tsx` and `room/room-screen.tsx`.
- **Hook:** `use-keep-kitchen.ts`.

| Frame | State [mock] | Server, drawn → port | Port note |
| --- | --- | --- | --- |
| A15A + DA15A | Open: thumbnail and name; "Salvează" (focused) / "Nu o păstra" / "Anulează"; the line "Modificările de la ultima salvare se pierd." | — | **CG1 (the top blocker):** "changes not in the list" has no meaning under autosave (§2.3) |
| A15B | Saving | "de stabilit" | — |
| A15C | Toast "✓ Salvată în Bucătăriile mele" | "de stabilit" | — |
| A15D | Save failed: stay, nothing lost | `503` | — |

### A16 — The same pop-up, for a visitor (blocked on O1)

- **Components:** the same sheet as A15; `session/account-promo-card.tsx` (A16C).

| Frame | State [mock] | Server, drawn → port | Port note |
| --- | --- | --- | --- |
| A16A + DA16A | As A15A | — | CG1 |
| A16B + DA16B | After Save: "Am păstrat bucătăria. **Fără cont…**" + "Creează cont" / "Nu acum" | — | Does not say where the kitchen is kept (brief) |
| A16C | Occasional card, "De ce un cont?", with a 44 px × | — | "frecvență de stabilit" (§3 C21, O9) |

### A17 — Ascunzi o bucătărie trimisă?

A dialog on A9.

- **Component:** `kitchens/hide-kitchen-dialog.tsx`.
- **Hook:** `use-kitchen-actions.ts`.

| Frame | State [mock] | Server, drawn → port | Port note |
| --- | --- | --- | --- |
| A17A + DA17A | Dialog, "Anulează" focused, no undo | "de stabilit" → `POST /api/account/kitchens/{id}/hide` (new) | **CG9:** "nu o vei mai putea deschide sau edita" holds only if hide gates **every** access arm (S4) |
| A17B | Busy | pending | — |
| A17C | Done: the card leaves; toast "Bucătăria a fost ascunsă." | "de stabilit" | — |
| A17D | 503 inside the dialog | `503` | — |

### A18 — Atașezi bucătăriile din acest browser? (claim)

- **Component:** `account/claim-dialog.tsx`.
- **Host:** `login-form.tsx` and `verify-email-form.tsx`, through the existing seam `on-signed-in.ts` [src]: "the claim
  dialog opens from here, on the account page, before it leaves".

| Frame | State [mock] | Server, drawn → port | Port note |
| --- | --- | --- | --- |
| A18A + DA18A, A18A2, A18A3, A18A4 | n = 1, 2, 5, 20: text + warning + "Atașează" / "Nu acum" (focused) | `GET claim → {claimable:n}` [src: built] | `claimable` already arrives in the sign-in answer [src: `on-signed-in.ts`]. 20 → "20 bucătării" (C30). The mock draws the dialog over a "Bucătăriile mele" page; the port opens it on the login or verify page (P10) |
| A18B | Busy "Se atașează…" | pending | — |
| A18C | "✓ 2 bucătării atașate" + "Deschide Bucătăriile mele" | `{claimed:2}` [src] | Shows the server's count. The button targets A9, which exists only after U5 (§3 C23) |
| A18D | 429, "peste 25 min" | `429` (`account-claim-by-account`, 10 / 60 min) [doc: plan §5] | — |
| A18E | 503: the dialog stays | `503` | `401` → login `?reason=session-expired`; `403` → no dialog [src: claim route] |
| A18F | "VARIANTĂ VIITOARE — necesită API": a list with name and date | "de stabilit" | **Conflicts with plan L14b criterion 5** (count, dates, thumbnails required) [doc]. O2 |

### A19 — Account control in the header

- **Components:** `session/account-control.tsx`, `session/use-account-session.ts`.
- **Hosts:** the configurator top bars, `room/room-screen.tsx` and `app/configurator/configure/configure-screen.tsx`
  [src: both draw the step pill].

| Frame | State [mock] | Server, drawn → port | Port note |
| --- | --- | --- | --- |
| A19A + DA19A | Signed out: "Intră în cont" (44 px; a pill on desktop) | `GET /api/account/session` → anonymous [src] | A full-load `<a href>` to the login page (M1 covers links **into** account pages) |
| A19B + DA19B | Client menu: "Conectat ca {e-mail}", Bucătăriile mele, Profil, Ieși din cont, Ieși de pe toate dispozitivele | → signed-in with `design.read.own` | Icon with no initials; accessible name "Contul meu". The role is never shown. Items appear only once their page exists (§3 C25) |
| A19C | Staff menu: Zona personalului, Ieși din cont, Ieși de pe toate dispozitivele | → signed-in without `.own` capabilities [src: ADR 0172 D7 as built] | "Zona personalului" is Lot 3 and unbuilt: omitted (§3 C24). Staff also get a "Profil" row (O16: `account.manage.own` for every role, §3 C25), a deliberate departure from A19C |
| A19D | Mobile editor header at 390 px | — | The pill is already "{step}/{total}" in the app (`configure.stepPill`) [src]. The app shows **4** steps on the room screen (`STEP_ONE_OF_FOUR`) [src], not the drawn 3/5. The icon joins the top-bar ladder (P15) |

### A20 — Session expired vs no access

| Frame | State [mock] | Server, drawn → port | Component / note |
| --- | --- | --- | --- |
| A20A | A4 arrival after a `401` | `401 unauthenticated` | **Built** (Lot 1 A4G, `login-arrival.ts`) [src]. On an account page, the server gate redirects. On a client call, the page does `location.assign` |
| A20B + DA20B | Editor sheet "Sesiunea a expirat" + "Intră în cont" / "Mai târziu" | "401" → **not observable** from a save (CG10) | `session/session-expired-sheet.tsx` + `use-session-expiry.ts`. The trigger is in P16 |
| A20C + DA20C | 403 full page: "Nu ai acces la această pagină" | `403 forbidden` | `account/forbidden-screen.tsx`, rendered by `readSignedInPage` for a staff session on `/kitchens`. Never says "session expired" |

---

## 2. Server endpoints: what exists, what is missing, and the server wave

### 2.1 Inventory

| Need (from the task and the frames) | State | Evidence |
| --- | --- | --- |
| Session (A19, A20) | **Exists.** `GET /api/account/session` → `{state:"anonymous"}` or `{state:"signed-in", email, capabilities}`. No id, no role | [src: `session/route.ts`] |
| Logout, this device (A14A) | **Exists.** `POST /api/account/logout {scope:"this-device"}` → `204` | [src] |
| Logout everywhere (A14B–F) | **Exists.** `{scope:"everywhere"}` → `204`, fails closed with `503` | [src; ADR 0172 Amendment A item 3] |
| Claim count and claim (A18A–E) | **Exists.** `GET` / `POST /api/account/claim` → `{claimable}` / `{claimed}`; `401`, `403`, `429`, `503` | [src: `claim/route.ts`] |
| Claim dialog data: names, dates, thumbnails (A18F; plan L14b criterion 5) | **Missing** | count only [src]; criterion [doc] |
| Share issue, status, revoke (A9G) | **Exists**, account arm included (L12b). Plaintext only at issue | [src: `designs/[id]/share/route.ts`; ADR 0114 B2] |
| List kitchens (A9) | **Missing** | no route [run: grep of `export async function` under `app/api`] |
| Rename (A9E) | **Missing**, and there is **no name column** | `0001`–`0015` [src] |
| Duplicate (A9F) | **Missing** | — |
| Delete a draft (A9H) | **Missing.** The app role holds **no `DELETE`** on `designs` | [src: `application-role-privileges.test.ts:315` "holds exactly select, insert and update on designs — no delete"] |
| Hide a sent kitchen (A17) | **Missing.** No `hidden_by_client_at`, no `sent_at` | [doc: ADR 0172 Fix 3 table, rows Q-F3-3 and Q-F3-9] |
| Sent flag (A9 badge, A9D menu) | **Missing** | as above |
| Profile read and save (A10) | **Missing.** `name` and `address` columns are absent. `phone` is updatable [doc: plan §4 grant] |
| Change e-mail + confirm (A10E–G, A10T) | **Missing.** `email` is outside the app's `UPDATE` grant. No `email-change` token purpose; no column for the new address | [doc: ADR 0172 D7, plan §4, §12] |
| Change password, signed in (A11) | **Missing.** `replacePasswordHash` exists (rehash at login) [src] | — |
| Export (A12) | **Missing.** Contact personal columns are unreadable by the app role; there is no notes table | [doc: ADR 0153 d1; plan §12] |
| Delete account (A13) | **Missing, and not designed:** no `DELETE` grant, no erasure credential, no revocation of the frozen shop link | [doc: D10; plan §12; `0010` header: `revoked_at` "set only by the owner, by hand"] |

### 2.2 Contracts for the missing endpoints

**Common to every new route** (plan §5's order) [doc]:

1. `isCrossSiteRequest` first.
2. JSON media type and bounded body, for `POST`, `PATCH` and `DELETE`.
3. Read the session server-side.
4. `requireCapability`, or the self-service check of P4.
5. Domain validation.
6. The account-subject limiter, **before** any password verification or write.
7. The work.

**Also common:**

- `Cache-Control: private, no-store`.
- No address, password, token or phone in a log line or a response, except the person's own data in the export.
- The account is always the session's. **No request member names an account, a role, a visitor hash or a capability.**
- The words: `401 {status:"unauthenticated"}`, `403 {status:"forbidden"}`, `429` + `Retry-After`,
  `503 {status:"unavailable"}`. These are the built `account-responses.ts` words [src].
- **One refusal for a kitchen, on E2–E5** (session callers only; the existing design routes keep plan L12a criterion
  1, see §7 criterion 1): an unknown id, another account's design, a design no account owns, a hidden design
  and a deleted design all get the **byte-identical** `designNotFoundResponse(id)` [src: `design-errors.ts`; ADR
  0114 d5].

| # | Endpoint | Request | Answers | Capability / limiter | Notes |
| --- | --- | --- | --- | --- | --- |
| E1 | `GET /api/account/kitchens?cursor=` | — | `200 {total, kitchens:[{id, name\|null, updatedAt, isSent, document}], nextCursor\|null}` | `design.read.own`; the built read limiter (`refusalOfReadLimit`, fails open, ADR 0156) | Keyset on `(updated_at desc, id desc)`, using the `0015` index [doc]. Page of 12 [inf]. Excludes hidden and deleted. `document` is returned so the client prices with the one book (P5) |
| E2 | `PATCH /api/account/kitchens/{id}` | `{name}` | `200 {name}`; `400 invalid-input` (field `name`: `REQUIRED`, `TOO_LONG`, `FORBIDDEN_CHARACTER`, `NOT_TEXT`); refusal; 401, 403, 429, 503 | `design.edit.own`; `design-save-by-account` [doc: plan §5] | Changes `name` only: not `document`, `revision` or `updated_at`, so an open editor gets no `409` |
| E3 | `POST /api/account/kitchens/{id}/duplicate` | `{name}` (the client composes "{name} (copie)" from the catalogue; ADR 0095: the server writes no sentence) | `201 {id}`; 400; refusal; 401, 403, 429, 503 | `design.edit.own`; **counts the mint's per-IP bucket** (ADR 0147, its intent) plus `design-duplicate-by-account` (P17) | A new id; `document` deep-equal to the source; `account_id` the session's; `visitor_hash`, `write_token_hash`, `sent_at`, `hidden_by_client_at` and `deleted_by_client_at` all null |
| E4 | `DELETE /api/account/kitchens/{id}` | — | `204`; `409 {status:"sent"}`; refusal; 401, 403, 429, 503 | `design.edit.own`; `design-save-by-account` | Sets `deleted_by_client_at` and revokes the active share link in the same transaction (P8) |
| E5 | `POST /api/account/kitchens/{id}/hide` | — | `204`; `409 {status:"not-sent"}`; refusal; … | as E4 | Sets `hidden_by_client_at` and revokes the share link (O7) |
| E6 | `PATCH /api/account/profile` | `{name?, address?, phone?}`: absent = unchanged, `""` = cleared | `200 {status:"saved"}`; `400 invalid-input` (`name`, `address`: text codes; `phone`: the built `PHONE_*` and text codes) | self-service (P4); `account-profile-by-account` (P17) | Clearing the phone sets both `phone` and `phone_normal_form` null (the both-or-neither check, plan §4) [doc]. Never touches `email` |
| E7 | `POST /api/account/password` | `{currentPassword, newPassword}` | `200 {status:"password-changed"}` + `Set-Cookie` (a new session); `400 wrong-password`; `400 invalid-input` (field `newPassword`); 401, 429, 503 | self-service; **`account-password-check-by-account`**, counted before argon2 | One transaction: compare-and-set on the current hash, new hash, `password_changed_at`, revoke **every** session. Then `startSession` bound to the new hash (P11). The "password changed" mail goes out after the response |
| E8 | `POST /api/account/email-change` | `{newEmail, currentPassword}` | `202 {status:"check-inbox"}` the same for a free, taken or own address; `400 wrong-password`; `400 invalid-input`; 401, 429, 503 | self-service; `account-password-check-by-account` + `account-email-change-mail-by-address` (target) + a per-account mail cap | Issues an `email-change` token holding the new address (P12). Everything after the response runs in `after()` |
| E9 | `POST /api/account/email-change/confirm` | `{token}` | `200 {status:"email-changed"}`; **one** `400 link-invalid` for unknown, used, expired, superseded **or address now taken** (a unique violation is never a 500); 429, 503 | none (the token is the subject); `account-token-complete-by-block` [doc] | Updates `email` and `email_normal_form` (a new grant, P12), marks the token used, revokes every session, sends a notice to the old address (CD answer 6) |
| E10 | `POST /api/account/export` | — | `200 application/json`, `Content-Disposition: attachment`; 401, 429, 503 | self-service; `account-export-by-account` (UTC day) | `POST`, not `GET`: a cross-site top-level `GET` carries a `Lax` cookie [ven] and would spend the bucket. Scope per C15 |
| E11 | `GET /api/account/claim` (extended) | — | `{claimable, kitchens?:[{updatedAt, summary}]}` | built | Only if O2 rules (b). No design id, no thumbnail |
| E12 | `POST /api/account/delete` | `{password}` | — | — | **Not specified here.** It waits for the erasure record (§3 C17) |

### 2.3 Contract gaps found (classification)

Every item is a **contract gap** (the reference or a record is silent or contradictory), not an implementation defect.
None is a test-fidelity problem: no test exists this round.

| # | Gap | Evidence | Where it is answered |
| --- | --- | --- | --- |
| CG1 | **Save / Discard (A15, A16) against autosave.** Q-F3-5 [doc: `OWNER_FIXES.md`] says "Discard saves nothing; Save keeps the current kitchen as one entry", and the trigger is "changes not in the list". But every edit is saved (`save-coalescer.ts`, ADR 0002 d13–17) [src], every Step 1 selection mints a new row (`create-design.ts`) [src], and a signed-in mint already carries `account_id` (L11) [doc]. So every kitchen a client generates is already "in the list", and nothing is ever unsaved. CD answer 1 ("Păstrează versiunea salvată … modificările de după se pierd") assumes versions that do not exist | O1 (and its own ADR, as `OWNER_FIXES.md` says: "needs a mock-up and a decision record") |
| CG2 | **Share sheet.** It draws a URL on open, but the plaintext is returned only at issue, and an issue revokes the active link [src, ADR 0114 B2]. The drawn URL is `https://lemnaria.md/ro/v/…`; the built path is `/s/{12 chars}` [src: `share-link-client.ts`] | P7 |
| CG3 | **"O ștergem definitiv" against the absent `DELETE` grant** [src: privilege test] and the 14-day backups | P8, C6 |
| CG4 | **Export of requests and staff notes** against ADR 0153 d1 and the absent notes table | C15 |
| CG5 | **Account erasure** is plan §12's own wave (narrow credential, frozen-link revocation, contact rows) and is undesigned | C17, O5 |
| CG6 | **Claim dialog detail.** Plan L14b criterion 5 requires count, dates and thumbnails. The API gives a count, and the mock calls the list "future" | O2 |
| CG7 | **Profile columns and e-mail change grant** (ADR 0118, ADR 0172 D7: "e-mail change need their own grant and review") | S1, S7, S9, P12 |
| CG8 | **The sent flag.** Deriving it by joining `contact_submissions.design_id` to `designs.account_id` is exactly ADR 0172 D11's "trigger to revisit: the first feature that reads both together" [doc] | P6 |
| CG9 | *(Qualified 2026-10-20: the frozen sent-kitchen copy at `/s/<token>` stays reachable after hide, by design, ADR 0165; confirmation is O22. The text below is the original.)* **Hide must close every arm.** ADR 0172 Consequences: the claiming browser's visitor cookie and write token keep reading and writing a claimed design [doc]. A17's copy is false unless `loadOwned`, `resume`, `saveAuthorized` and share exclude hidden and deleted rows **on both arms** | S4 |
| CG10 | **A20B is unobservable.** A save after expiry is refused with the one indistinguishable `403`/`404` of the design routes [src: `designs/[id]/route.ts`], so the editor cannot tell expiry from "not yours" | P16 |
| CG11 | **"This device stays signed in" after a password change** is a new rule beside D3 ("reset revokes every session"), and `findLive`'s `created_at >= password_changed_at` makes it a structural dependency [src] | P11 |

### 2.4 The server waves, in order

Each wave lists items (≤ 5) and production files (≤ 5). Message catalogues and docs are listed but not counted, which
is plan §7's convention. **Migrations are counted**, as plan L1 counted its four. The full slice table with *Reading*
is in §6.

1. **S0a, architect rulings** (P1–P3, P5, P7–P18), recorded. **S0b**, the owner's answers, recorded as they arrive.
   No code.
2. **S1, migrations.**
   - Provisional `0016` on `designs`: `name`, `sent_at`, `hidden_by_client_at`, `deleted_by_client_at`.
   - Provisional `0017` on `accounts`: `name`, `address`.
   - Provisional `0018` on `account_email_tokens`: `new_email`, `new_email_normal_form`, both-or-neither.
   - The runbook grant section: `UPDATE (name, address)` and, under P12, `UPDATE (email, email_normal_form)` on
     `accounts`; `INSERT (new_email, new_email_normal_form)` on tokens.
   - No grant is needed on `designs`, because table-level `UPDATE` is held (ADR 0019 d11), **and that accepted risk's
     scope grows again** (two more access-control columns).
   - Numbers stay provisional: the M8C merge comes first (ADR 0172 *Remaining*, items 1 and 9).
3. **S2, domain:**
   - `judgeKitchenName`;
   - the profile field rules (via `readTypedText`);
   - `validatePasswordChange` (with `PASSWORD_IS_EMAIL`, since the address is known);
   - `validateEmailChange`;
   - `kitchenSummaryOf(design)`, which returns codes and numbers (shape, dimensions, finish), never sentences.
4. **S3, persistence:** the kitchen store (port, Neon, fake): `listPage`, `countListed`, `rename`, `duplicate`, `hide`,
   `markDeleted`, `markSent`. **No route may call `hide` or `markDeleted` before S4 lands.**
5. **S4, the gate exclusion:** `loadOwned`, `resume`, `saveAuthorized` (both arms) and share `issue` / `status` (both
   arms) refuse hidden and deleted rows with the existing refusal.
6. **S5, sent mark:** the contact flow (`lib/server/contact/submit-contact.ts` after `ports.store.record`, wired in
   `contact-production-ports.ts` [src]) sets `designs.sent_at = coalesce(sent_at, now())` when the request is stored
   (P6, O6).
7. **S6a:** the limiter purposes, `account-kitchens.ts`, and E1.
8. **S6b:** E2–E5.
9. **S7, account store and the P4 capability:** `findProfile`, `updateProfile`, `changePassword` (compare-and-set and
   revoke all), `issueEmailChangeToken`, `confirmEmailChange`, and `account.manage.own` in `capabilities.ts` (if O16
   accepts it).
10. **S8:** E6, E7.
11. **S9:** E8, E9, and three new customer mails: the change link, the old-address notice, and the address-in-use
    notice (O8).
12. **S10:** E10, scoped by C15.
13. **S11 (conditional on O2):** E11.
14. **S12:** delete account. **Blocked** on the erasure record. Not planned here.

---

## 3. Copy that promises something unbuilt, and the recommended ruling

"Unbuilt" means no route, column, page or record backs the sentence today [src unless marked]. The owner rules each
one. The default is the recommendation.

| # | Frame | Copy as drawn [mock] | What backs it today | Recommended ruling |
| --- | --- | --- | --- | --- |
| C1 | A9C | "de la 28 400 MDL" on every card | Nothing on the server. Pricing is client-only, and `use-priced-design.ts` is "the only module … that names a price book" [src] | **Keep.** E1 returns the document; a pure `priceFloorOf` exported beside the book prices it (P5) |
| C2 | A9C, DA9C | Thumbnail labelled "randare" or "fără imagine" | **No render pipeline** [inf: no thumbnail store, route or column] | **Striped placeholder only, decorative (`aria-hidden`), no label text.** Thumbnails are a later decision |
| C3 | A9C | Badge "✓ Trimisă" / "Ciornă" | No `sent_at` [doc] | **Keep**, shipped with S5. Until then, no badge. A draft is not marked "Ciornă" while nothing can say "Trimisă" |
| C4 | A9D, A9F | "Duplică", "✓ Copie creată" | No route | Keep, with S6b |
| C5 | A9G | URL shown on open; "Copiază link-ul" | Plaintext only at issue [src] | **Change** (P7): an active link shows "Link-ul este activ." + "Creează un link nou" (replaces the old one; a warning line says so) + "Oprește link-ul". No link: "Creează link-ul", then the URL and "Copiază". New copy for the owner |
| C6 | A9H | "O ștergem definitiv. Nu o vei mai putea recupera." | No `DELETE` grant [src] | **"O ștergem din lista ta și nu o vei mai putea deschide sau recupera."** Drop "definitiv" until a physical deletion path exists (P8). The privacy notice draft must say when the row is removed |
| C7 | A17A | "echipa Lemnaria o vede în continuare … Doar personalul magazinului o poate face din nou vizibilă … folosește [Șterge contul]" | `design.read.any` and `design.unhide` are named, wired to nothing (Lot 3). A13 is blocked | Keep the first two sentences: they state the owner's rulings Q-F3-9 and Q-F3-10, and the shop already holds the sent request [doc]. **Replace "[Șterge contul]"** until A13 ships: drop the sentence, or point to the interim e-mail path (O5) |
| C8 | A10A | Rows "Exportă datele mele", "Șterge contul" | No routes | **Hide each row until its wave ships** (U13, and U14 after the erasure record). Rule 0.3-6 |
| C9 | A10A | Row "Nota de confidențialitate (se deschide într-o filă nouă)" | The Lot 1 stub page [src] | Keep. It links the stub, as register does |
| C10 | A10A | Phone hint: "Îl folosim doar ca să te sunăm despre oferta ta…" | A purpose statement | Keep **only if** the privacy-notice draft states the same purpose. The owner checks |
| C11 | A10A | "Nume (opțional)", "Adresă / localitate (opțional)" | No columns (ADR 0118) | Keep, with S1/S7. The notice must list name and address |
| C12 | A10T3 | "Folosește noua adresă ca să intri în cont." + "Intră în cont" | — | Keep **if** P12 revokes every session on confirm. Otherwise the button is "Înapoi la configurator" |
| C13 | CD answer 6 | Notice to the old address, "Adresa contului s-a schimbat" | No mail kind | Build in S9. The mail copy is not drawn: owner copy (O8) |
| C14 | A11E | "Te-am deconectat de pe celelalte dispozitive." | — | Keep, with E7's revoke-all plus a fresh session (P11) |
| C15 | A12A | "…cererile tale către magazin și notele personalului despre ele." | ADR 0153 d1: no contact personal column is readable; no notes table [doc] | **Change to "Primești un fișier JSON cu profilul tău și toate bucătăriile (inclusiv cele trimise și cele ascunse)."** Requests and notes join when an export record grants a narrow read |
| C16 | A12D, A13F, A11F, A18D | The waits | Built `AccountWait` [src] | Keep |
| C17 | A13A–F | The whole erasure text (profile, contacts, kitchens, share links, requests, notes, the shop's view link, 14-day backups) | Nothing: no grant, no credential, no frozen-link revocation, no record [doc] | **Do not ship A13 this milestone.** The row stays hidden (C8). Interim: the GDPR request by e-mail and the runbook process (`OWNER_FIXES.md` item 14). O5 decides whether an interim row "Pentru ștergerea contului, scrie-ne la {adresă}" appears |
| C18 | A15A, CD answer 1 | "Modificările de la ultima salvare se pierd." / "Păstrează versiunea salvată … Modificările de după se pierd." | Autosave: no "last save", no versions [src] | **Blocked on O1.** CD answer 1's second case is rejected under any option: it promises a version the product does not keep |
| C19 | A15C | "✓ Salvată în Bucătăriile mele" | — | Blocked on O1 |
| C20 | A16B | "Am păstrat bucătăria. … o poți atașa contului." | Claim exists (D8) [doc]. "Am păstrat" is true today without any action, because of autosave | Blocked on O1 |
| C21 | A16C | Occasional card, "frecvență de stabilit" | — | **Defer.** If built: at most once per document load after the first edit, dismissal held in memory only (no `localStorage`, plan §3). O9 |
| C22 | A18F | List of the kitchens to attach | No API | O2 |
| C23 | A18C | "Deschide Bucătăriile mele" | A9 page from U5 | Until U5 ships, the button reads "Continuă" and goes to `/{locale}` |
| C24 | A19C | "Zona personalului" | Lot 3, unbuilt | **Omit** until Lot 3 ships a page |
| C25 | A19B | "Bucătăriile mele", "Profil" | Pages from U5 / U10 | Each item appears in the wave that ships its page |
| C26 | CD answer 4 | "După ce intri, te ducem înapoi la bucătărie. Modificările nesalvate nu se păstrează." | No `returnTo` (Lot 1 P9 kept it out) [doc] | **Accept** with a closed allow-list: `returnTo` matches `^/(ro\|ru)/d/[A-Za-z0-9_-]{21}$` only, and anything else is ignored. Security wave U15b. O10 |
| C27 | A9K | "Poate a fost ștearsă sau ascunsă." | True after S4 | Keep |
| C28 | A9C | "Încarcă mai multe", "Cele mai recente întâi" | E1 | Keep |
| C29 | A14 all | — | Built | Keep |
| C30 | A9C, A18A4, plural table | "20 de bucătării" | Two owner positions conflict. The ruling of 2026-09-10, "without «de» on plural" [doc: `docs/i18n/ro-catalogue-notes.md:55-67`], against the owner-approved Lot 2 and this repository's own brief (0.4: "20 de bucătării") | **O17.** Default **"20 bucătării"**: the dated ruling is the explicit one, and the brief did not cite or reverse it. The three CLDR bands stay declared either way |
| C31 | A9E, A10A | Rename `FORBIDDEN_CHARACTER` / `NOT_TEXT`; name and address `TOO_LONG` etc. | **No copy drawn** | Gap: draft leaves on the e-mail pattern, owner to approve |

---

## 4. Rulings this port needs

Each ruling is recorded by the scribe in S0a (the architect's and the coordinator's rulings) or S0b (the owner's), as
an ADR 0172 amendment or a new record where named. **Who** says who
decides.

| # | Question | Options | Recommendation | Who |
| --- | --- | --- | --- | --- |
| **P1** | The plan's L14b row ("≤ 3 files") | (a) Keep it. (b) Replace it with S0a–S12 and U1–U15b (§6) | **(b).** The delivery has 12 screens and 97 frames. Of the ten server needs the task names, one is built (logout everywhere), one is partial (claim data: count only) and eight are missing (§2.1) | coordinator |
| **P2** | Route names | the mock's `kitchens`, `profile`, `password`, `export`, `delete`, `confirm-email` | **Accept.** Each is exactly three segments, so `isAccountPageIn`'s shape holds [src: `proxy.ts:293-303`] | architect |
| **P3** | `proxy.ts` page sets | — | Add `ACCOUNT_SIGNED_IN_PAGES = [kitchens, profile, password, export, delete]`: the account headers (`noindex`, `private, no-store`), the site CSP, no Turnstile frame. Add `confirm-email` to `ACCOUNT_TOKEN_PAGES` (`no-referrer`, no third party). Re-run Lot 1 criterion 13's encoded-segment probe on the new paths | architect; security reviews |
| **P4** | **Self-service routes and D7.** D7: "every route that acts for an account checks a capability through one function". Profile, password, e-mail change and export act on the caller's own account, and no capability names that | (a) A new capability `account.manage.own` for every role (a domain closed-list change: a reviewed commit). (b) A named check `requireSignedIn(session)` beside `requireCapability`, recorded as an amendment | **(a).** It keeps D7's one-function rule literal, and a later "disabled account" can withdraw it. Staff hold it too, since Lot 3 gives staff a profile [inf]. **Owner-visible:** it adds to the capability list the owner ruled (Fix 3 item 9, D7), so it is O16 | **owner** (O16) |
| **P5** | Card price | (a) The server prices (a second module naming a book). (b) E1 returns `document`; the client prices with a pure `priceFloorOf` exported from `use-priced-design.ts`, so the book is still named once. (c) No price | **(b).** It keeps ADR 0062 seam 1 [src comment] | architect |
| **P6** | **Sent flag** | (a) Join `contact_submissions.design_id` to `account_id` at read. (b) `designs.sent_at`, written by the contact flow | **(b),** set when the request is **stored** (the client's act, Q-F3-3: "the client submitted it"), never cleared. (a) is ADR 0172 D11's revisit trigger and would erode ADR 0153 d1 further. Rows sent before S5 are backfilled by an owner-run statement or stay unmarked (O11) | architect; owner on backfill |
| **P7** | **Share sheet** | (a) Issue on open (silently revokes the link already shared). (b) Status on open, then issue on request, with the replace warning | **(b)** (C5). (a) breaks a link the person may already have sent | architect; owner copy |
| **P8** | **Delete a draft** | (a) A narrow `DELETE` grant (the privilege test's "no delete" arm changes). (b) A `deleted_by_client_at` mark, physical removal by the retention or erasure job later | **(b).** D10 and the privilege test both say no `DELETE`. The copy changes (C6) | architect; owner on copy |
| **P9** | A9K | (a) A new account page. (b) The existing `design-load-error.tsx` gains a "Bucătăriile mele" action for a client session, and the same copy for every refusal | **(b).** Opening is `/d/{id}`, whose refusal already makes missing and another's one answer [src]. Adding an action from the viewer's own session reveals nothing about the design | architect |
| **P10** | Where the claim dialog opens | (a) On the login or verify page before leaving (the brief, plan L14b, the built `on-signed-in.ts` seam). (b) On the kitchens page after arrival, as drawn | **(a).** It is already the seam. On verify, Lot 1 criterion 15 (no router action on a token page) binds the dialog: `fetch` only, then `location.assign` | architect |
| **P11** | **Password change keeps this device** (CD answer 5) | (a) Revoke all, and the person logs in again. (b) Revoke all, then start a new session in the same response, bound to the new hash | **(b).** It is required by `findLive`'s `created_at >= password_changed_at` [src]. Record it as an amendment beside D3's reset rule | architect; owner sees the answer |
| **P12** | **E-mail change** | — | (1) New token purpose `email-change`, its row carrying the new address (S1 `0018`). (2) A new `UPDATE (email, email_normal_form)` grant: D7 names this exact review. (3) Confirm revokes every session and mails the old address. (4) A taken address at request: one `202`, and the new inbox gets an "address already has an account" notice, mirroring D1's register-verified notice (O8). (5) Buckets: the password check per account, mail per target, and a per-account mail cap. (6) **Residual, recorded:** if the target is held by an **unverified** (possibly squatted) account, every confirm hits the unique constraint and answers `link-invalid` until the unbuilt 30-day cleanup (Q-F3-7) removes it. Accepted for this round; the retention job closes it | architect; security; owner on (3) and (4) |
| **P13** | Error field name on a new-password route | — | `field: "newPassword"`, equal to the body member. Lot 1 found reset's `password` ≠ `newPassword` mismatch [doc] and must not repeat it | architect |
| **P14** | This-device logout from an account page | — | Full load to `/{locale}` after `204`. No account page stays on screen with data | architect |
| **P15** | **The header control in the top bar** (A19D) | — | The icon is one more fixed item in the measured ladder of ADR 0104 d8/d9 (`top-bar-fit.ts`, `use-top-bar-fit.ts`) [src]. `top-bar-box.test.ts` asserts gap counts [src comment] and will turn red: an owed update (D12). The pill keeps the app's real step total | architect; visual |
| **P16** | A20B trigger | — | When the save status turns `unauthorized` [src: `save-coalescer.ts` `SaveStatus`] on a design opened through the account arm, the editor asks `GET /api/account/session`. Anonymous shows the sheet; signed-in keeps today's read-only state. No new server word. **The person's own sign-out disarms it:** after an in-place "Ieși din cont" (U4), the session is anonymous because the person chose it, so A20B must not say "expired". The logout hook marks the document as signed out by the person, the expiry hook reads that mark, and the editor shows today's read-only state | architect |
| **P20** | **Tier of the UI waves** | (a) Full + security + visual on every U-wave, as plan §7 recorded for L14b and Lot 1 kept for every screen wave. (b) Light + security + visual on pure display waves (U6, U9b) | **(a)** throughout, so nothing drifts. WORKFLOW puts auth and customer data in Full, and U3 (shows the e-mail), U4 (logout), U10 (e-mail change) and U12 (password change) are both. (b) is the coordinator's to choose explicitly for U6 and U9b only | coordinator |
| **P17** | New limiter purposes (figures provisional, constants only) | — | `account-password-check-by-account` 10 / 60 min + 30 / UTC day; `account-email-change-mail-by-address` 5 / day; `account-email-change-by-account` 5 / day; `account-profile-by-account` 30 / 60 min; `account-export-by-account` 5 / UTC day; `design-duplicate-by-account` 20 / day **plus** the mint's existing per-IP bucket. Rename, delete and hide reuse `design-save-by-account` | architect; owner may change figures |
| **P18** | **Dialog shell** | (a) A new account dialog. (b) Extract the focus trap, Escape and inert background from `settings/confirmation-dialog.tsx` into one hook used by both | **(b).** That file says its behaviour is "written once, here, so the two cannot drift into two modals" [src]. Settings behaviour stays byte-identical (the visual reviewer checks the settings sheet) | architect |
| **P19** | **"Anulează"** on Lot 2 dialogs | ADR 0086 ruled that a confirmation's actions name their outcome, "never *Anulează*", and the shell's type comment repeats it [doc, src] | **Owner question O12.** The ADR's rule was for one confirmation. The default is Lot 2's approved "Anulează", recorded as a scoped exception | owner |

---

## 5. Module boundaries

| Layer | New or changed | May import | Must not |
| --- | --- | --- | --- |
| `packages/configurator-domain/src/account/` | `kitchen-name.ts`, `profile-fields.ts`, `account-changes.ts`, `kitchen-summary.ts`; `capabilities.ts` (P4) | `input-checks.ts`, `password-policy.ts`, `phone-number.ts`, the design types | I/O, sentences (ADR 0095: codes only) |
| `packages/persistence/src/` | `account-kitchen-store.ts`, `neon-account-kitchen-store.ts`, `fake-account-kitchen-store.ts`; methods on `account-store.ts`, `neon-account-store.ts`, `fake-account-store.ts`, `neon-configuration-repository.ts`, `share-link-repository.ts`; migrations `0016+` | the driver (only here) | hashing, cookies, HTTP |
| `apps/web/src/lib/server/account/` | `account-kitchens.ts`, `update-profile.ts`, `change-password.ts`, `change-email.ts`, `export-account.ts`, `signed-in-page.ts` (page gate) | domain, persistence ports, `rate-limit/`, `mail/` | client imports (`server-only`) |
| `apps/web/src/app/api/account/**` | `kitchens/route.ts`, `kitchens/[id]/route.ts`, `kitchens/[id]/duplicate/route.ts`, `kitchens/[id]/hide/route.ts`, `profile/route.ts`, `password/route.ts`, `email-change/route.ts`, `email-change/confirm/route.ts`, `export/route.ts` | `lib/server/account/*` | business rules in a route file |
| `apps/web/src/app/[locale]/account/**` | six page shells | `signed-in-page.ts`, `challenge-page-props.ts` (not needed: no Turnstile), `src/account/*` | copy, styles, `"use client"` |
| `apps/web/src/account/{kitchens,profile,session}/` | the client components and hooks of §1 | `account-answer.ts` (**extended, not duplicated**), `send-account-request.ts`, `account-form-parts.tsx`, `account-shell.tsx`, `persistence/share-link-client.ts`, `price/` (P5) | `next/link`, `@/i18n/navigation`, `StartLink`, `LocaleMenu`, `document.cookie`, `localStorage`, `sessionStorage` (M1, plan §3) |
| Configurator hosts | `room/room-screen.tsx`, `app/configurator/configure/configure-screen.tsx`, `top-bar-fit.ts` mount `account/session/*` | — | an account read during render (session is a client fetch; a render never writes) |

**Classifier.** `account-answer.ts` gains flows (`kitchens`, `kitchen-action`, `profile`, `password`, `email-change`,
`confirm-email`, `export`, `claim`, `logout`) and the classes `unauthenticated` (401), `forbidden` (403),
`kitchen-unavailable` (the one 404), `wrong-password`, `conflict-sent`, `conflict-not-sent`, `email-changed` and
`saved`. One classifier, the same `{status, body.status}` pairing rule as Lot 1 (Lot 1 review §3.3).

---

## 6. Waves

**Common to every wave.**

- **QA:** none (ADR 0172 D12). **QA reading:** none this round.
- **Verification:** `pnpm format:check`, `pnpm gate:boundary`, `pnpm lint`, `pnpm typecheck`, and
  `pnpm --filter @lemnaria/web build`. The implementer quotes each exit code through `rtk proxy`, then the
  coordinator does the same (plan §8).
- **Visual method:** Lot 1 review §3.5 unchanged:
  - a production build on `E2E_PORT` 4320;
  - 390 × 844 first, then 1920 × 1080;
  - every state reached by `page.route` mocks, because migrations are unapplied;
  - RO and RU.
- **Tier names:**
  - **Full + security:** logic, clean-code and security reviewers in parallel. Used for persistence, auth, routes,
    domain and `proxy.ts`.
  - **Full + security + visual:** the same three reviewers plus the visual reviewer. Used for **every UI wave**, as plan
    §7 recorded for L14b and Lot 1 kept (P20 names the one possible downgrade).
  - **Security-reviewed docs:** the scribe's records plus one security reviewer, as plan L0 did for the ADR. Used for
    S0a, because it records auth decisions (P4, P11, P12).
  - **Coordinator-only:** the S0b recording of owner answers that change no auth decision, and `docs/design/README.md`.
- **Shared files land in sequence**, never in parallel waves: `account-responses.ts`, `limit-policy.ts`,
  `account-answer.ts`, `persistence/src/index.ts`, `account.module.css`, the three catalogues.

**Reviewer reading, common** (pasted into every reviewer dispatch, with the wave's row added):

- **Security:**
  - this file §2.2, §2.3, §4 (P3, P4, P6–P8, P11, P12, P16, P17);
  - plan §5 (common order, flows 4, 5, 8);
  - ADR 0172 D3, D4, D7, D9, D10, D11, Amendments A and B, Consequences (shared-computer residual);
  - ADR 0114 d5, B2;
  - ADR 0019 d11 and its 2026-10-18 note;
  - ADR 0153 d1;
  - `proxy.ts`, `cross-site-request.ts`, `current-session.ts`, `require-capability.ts`.
- **Logic:**
  - this file §1 (the wave's screens), §2.2 (the wave's endpoints), §5 *Classifier*;
  - `account-answer.ts`, `account-responses.ts`;
  - the orchestration file the wave names.
- **Clean code:**
  - `engineering-conventions.md` *Code and domain boundaries*, *UI and content*, *Localised copy*;
  - `~/.claude/rules/clean-code.md`.
- **Visual:**
  - this file §1 (the wave's frames), §3 (the wave's C-rows), §10;
  - the Lot 2 and ContBlocks2 markup as text;
  - `browser-and-visual-qa.md`;
  - ADR 0104;
  - `account.module.css`;
  - Lot 1 review §2.6 (accessibility rules).

### 6.1 Phase A: buildable now, on built endpoints

| Wave | Items (≤ 5) | Production files (≤ 5) | Reading (implementer) | Depends | Tier |
| --- | --- | --- | --- | --- | --- |
| **U1, the signed-in kit** | 1. Classifier flows and classes (§5). 2. `send-account-request.ts`: GET, PATCH and DELETE, plus the new bodies. 3. `signed-in-page.ts`: session read. **No session cookie at all** → redirect to the plain login (no reason); **a cookie present but not live** → `login?reason=session-expired`; missing capability → forbidden. 4. `proxy.ts` P3 sets. 5. `forbidden-screen.tsx` (A20C) | `account/account-answer.ts` (mod), `account/send-account-request.ts` (mod), `lib/server/account/signed-in-page.ts`, `proxy.ts` (mod), `account/forbidden-screen.tsx` | This file §1 A20, §2.2 *Common*, §4 P2, P3, §5; Lot 1 review §3.2–3.3; `proxy.ts:20-40,260-305`; `current-session.ts`, `session-cookie.ts`, `require-capability.ts`, `login-arrival.ts`; ADR 0161 Amendment D | S0a (P2, P3) | Full + security + visual (A20C) |
| **U2, dialog and toast kit** | 1. Extract the modal focus behaviour (P18). 2. `account-dialog.tsx`: sheet on mobile, dialog on desktop, `alertdialog` for destructive, named initial focus, return to opener, Esc unless busy. 3. `status-toast.tsx` (`role="status"`, persists ≥ 5 s [inf]). 4. CSS | `components/use-modal-focus.ts`, `settings/confirmation-dialog.tsx` (mod), `account/account-dialog.tsx`, `account/status-toast.tsx`, `account/account.module.css` (mod) | §4 P18, P19; `settings/confirmation-dialog.tsx`, `global-settings.module.css`; ContBlocks2 `isBtns`, `isGrab`; Lot 2 `:60-63`, `:114-117` | U1 | Full + security + visual (settings sheet regression included) |
| **U3, A19 header control** | 1. `use-account-session.ts`: one `GET /api/account/session` per document; a failure reads as anonymous. 2. `account-control.tsx`: signed-out link; client menu and sheet; staff menu without "Zona personalului"; items gated by C25. 3. Mount it in both top bars. 4. `top-bar-fit.ts`: the new fixed item (P15) | `account/session/use-account-session.ts`, `account/session/account-control.tsx`, `room/room-screen.tsx` (mod), `app/configurator/configure/configure-screen.tsx` (mod), `app/configurator/configure/top-bar-fit.ts` (mod) | §1 A19, §3 C24, C25, §4 P15; ADR 0104 d8, d9; `top-bar-fit.ts`, `use-top-bar-fit.ts`, `settings/settings-pill-fit.ts`; `session/route.ts`; Lot 1 review criterion 2 (M1) | U2 | Full + security + visual |
| **U4, A14 logout and arrivals** | 1. `use-logout.ts`: this-device (toast in place; full load from account pages, P14); everywhere (`204` → `login?reason=signed-out-everywhere`; `503` and offline stay in the dialog). 2. `logout-everywhere-dialog.tsx` (A14B, C, E, F). 3. `login-arrival.ts`: the new closed-list value. 4. `login-form.tsx`: the A14D notice | `account/session/use-logout.ts`, `account/session/logout-everywhere-dialog.tsx`, `account/login-arrival.ts` (mod), `account/login-form.tsx` (mod) | §1 A14, §4 P14; `logout/route.ts`; ADR 0172 Amendment A item 3; Lot 1 review §3.1 P9 | U3 | Full + security + visual |
| **U9a, A18 claim dialog (count)** | 1. `claim-dialog.tsx` (A18A–E; the server's `claimed`; `401` → login; `403` → none). 2. `on-signed-in.ts`: open the dialog when `claimable > 0`, then `location.assign`. 3. Host it in login and verify, with no router action (Lot 1 criterion 15). 4. C23 button rule | `account/claim-dialog.tsx`, `account/on-signed-in.ts` (mod), `account/login-form.tsx` (mod), `account/verify-email-form.tsx` (mod) | §1 A18, §3 C23, C30, §4 P10; plan L14b and its criteria 1, 4, 5, 6; `claim/route.ts`, `claimable-designs.ts`; ADR 0172 D8, Amendment B | U2, **O2** (whether criterion 5 is amended or S11 goes first) | Full + security + visual (claiming cannot be undone) |
| **U15a, A20B** | 1. `use-session-expiry.ts` (P16, including the disarm after the person's own sign-out). 2. `session-expired-sheet.tsx` ("Intră în cont" → `login?reason=session-expired`; "Mai târziu" closes). 3. Mount in the editor | `account/session/use-session-expiry.ts`, `account/session/session-expired-sheet.tsx`, `app/configurator/configure/configure-screen.tsx` (mod) | §1 A20, §4 P16; `persistence/save-coalescer.ts` (`SaveStatus`); `account/session/use-logout.ts` (U4) | U4 | Full + security + visual |
| **U15b, return path** | 1. `return-path.ts`: parse `returnTo` against the closed allow-list (C26); anything else is no value. 2. `login/page.tsx` reads it. 3. `login-form.tsx` passes it on. 4. `on-signed-in.ts` applies it after the claim dialog. 5. The A20B sheet's link carries it | `account/return-path.ts`, `app/[locale]/account/login/page.tsx` (mod), `account/login-form.tsx` (mod), `account/on-signed-in.ts` (mod), `account/session/session-expired-sheet.tsx` (mod) | §3 C26; Lot 1 review §3.1 P9 (the allow-list shape), criterion 14 | U15a, U9a, **O10** | Full + security + visual (redirect allow-list) |

### 6.2 Phase B: the kitchens list (server first)

| Wave | Items (≤ 5) | Production files (≤ 5) | Reading (implementer) | Depends | Tier |
| --- | --- | --- | --- | --- | --- |
| **S0a, architect rulings** (scribe; no code) | 1. P1–P3, P5, P7–P18 and P20 recorded as dated amendments (ADR 0172), or as a new record for the dashboard data model (sent, hidden, deleted, name, gate exclusion; the D11 trigger named; the ADR 0019 d11 scope note). 2. The plan §7 amendment replacing L14b | docs only | §2.3, §4 | the coordinator's acceptance | Security-reviewed docs |
| **S0b, owner answers** (scribe; no code) | 1. Each O-row recorded as answered, dated (P4 via O16, P6 via O6, P19 via O12, C30 via O17, and the rest). 2. `docs/design/README.md`: list the Lot 1 and Lot 2 files and the `A` / `DA` IDs (Lot 1 W-doc is still open [run: no "Cont" entry in the README]) | docs only | §3, §9 | each owner answer, as it arrives | Coordinator-only, or security-reviewed where the answer changes an auth rule (O8, O10, O16) |
| **S1, migrations** | 1–3. The three migrations of §2.4 step 2, house headers, screen-clean. 4. Runbook section: grants and apply order after `0015` | `0016_…sql`, `0017_…sql`, `0018_…sql` (3 counted); runbook (docs) | plan §4 (headers, screen rules, grants); `migration-safety.ts:505-535,583-624`; `0015_add_design_account_id.sql`; `0014_…sql`; ADR 0172 D7, D10; ADR 0019 d11 note | S0a; O7, O8 do not change the columns | Full + security |
| **S2, domain rules** | 1. `judgeKitchenName` (1–120 code points after NFKC [inf], text refusals). 2. Profile name and address rules. 3. `validatePasswordChange`, `validateEmailChange`. 4. `kitchenSummaryOf` (codes and numbers). 5. Exports | `account/kitchen-name.ts`, `account/profile-fields.ts`, `account/account-changes.ts`, `account/kitchen-summary.ts`, `account/index.ts` (mod) | `account-fields.ts`, `password-policy.ts`, `input-checks.ts`, `design.ts:52-160`; ADR 0095 d1; ADR 0172 D2, D7; **the M8C preset-name format, once merged** [doc: brief only, not verified here] | S0a | Full + security |
| **S3, kitchen store** | 1. Port. 2. Neon: keyset list + total; `rename`; `duplicate` (insert-select); `hide` / `markDeleted` (revoke the share link in the same transaction); `markSent`. 3. Fake, with the same null semantics. 4. Exports | `account-kitchen-store.ts`, `neon-account-kitchen-store.ts`, `fake-account-kitchen-store.ts`, `index.ts` (mod) | §2.2 E1–E5; `neon-configuration-repository.ts:228-600`; `share-link-repository.ts`; `0015` index; plan §12 review record (unexecuted SQL list) | S1, S2 | Full + security |
| **S4, gate exclusion** | 1. `loadOwned` and `resume`, both arms. 2. `saveAuthorized`, both arms (the refusal keeps today's error class). 3. Share `issue` / `status` / `revoke`, both arms. 4. Fakes | `neon-configuration-repository.ts` (mod), `share-link-repository.ts` (mod), `fake-configuration-repository.ts` (mod), `fake-design-claim-repository.ts` (if touched) | §2.3 CG9; plan L12a, L12b and their acceptance; ADR 0114 d5, H2; ADR 0172 D9, Consequences; `load-owned-design.ts`, `visitor-resume.ts`, `designs/[id]/route.ts`, `share/route.ts` | S3 | Full + security |
| **S5, sent mark** | 1. After `ports.store.record` succeeds for a design, `markSent(designId)`, idempotent, never cleared. 2. A store failure there does not fail the request, and is logged without personal data (P6) [inf: the request is the record]. 3. A new port member wired in production | `lib/server/contact/submit-contact.ts` (mod), `lib/server/contact/contact-production-ports.ts` (mod) | ADR 0150, 0153 d1, 0157, 0163, 0164; `submit-contact.ts:60-130,200-260` [src: `record` at :216]; `contact-submission-store.ts:78-130`; `app/api/contact-submissions/route.ts` | S3, O6 | Full + security |
| **S6a, list route** | 1. P17 purposes. 2. `account-kitchens.ts`: list orchestration, capability. 3. E1 | `rate-limit/limit-policy.ts` (mod), `rate-limit/judge-account-request.ts` (mod), `lib/server/account/account-kitchens.ts`, `app/api/account/kitchens/route.ts` | §2.2 *Common*, E1; plan §5 limiter table; ADR 0155, 0156; `judge-account-request.ts`, `bucket-subject.ts`, `claim/route.ts` (the pattern) | S4 | Full + security |
| **S6b, kitchen mutations** | E2, E3 (counts the ADR 0147 mint bucket), E4, E5, and the new response words | `app/api/account/kitchens/[id]/route.ts`, `…/[id]/duplicate/route.ts`, `…/[id]/hide/route.ts`, `account-kitchens.ts` (mod), `account-responses.ts` (mod) | §2.2 E2–E5; ADR 0147 (**its intent: the mint has one limit and a duplicate is a mint**); ADR 0111 d1; `designs/route.ts` | S6a, S5 | Full + security |
| **U5, A9 list (read)** | 1. Page with `readSignedInPage(design.read.own)`. 2. `kitchens-screen.tsx` (A9A–C, I, J; count; load more; desktop grid). 3. `kitchen-card.tsx` (C2 placeholder, C3 badge, clamp, `<a href>` Deschide). 4. `use-kitchens.ts`. 5. `kitchen-summary.ts` (generated name and meta from S2 codes; relative date) | `app/[locale]/account/kitchens/page.tsx`, `account/kitchens/kitchens-screen.tsx`, `account/kitchens/kitchen-card.tsx`, `account/kitchens/use-kitchens.ts`, `account/kitchens/kitchen-summary.ts` | §1 A9 (A–C, I, J), §3 C1–C3, C28, C30; ContBlocks2 `isK`, `isSkel`, `isGrid`, `isCount`; Lot 2 `:178-191` | U1, S6a | Full + security + visual |
| **U6, card price** | 1. `priceFloorOf` exported beside the one book (P5). 2. The card shows "de la … MDL" | `price/use-priced-design.ts` (mod), `account/kitchens/kitchen-summary.ts` (mod) | §4 P5; `use-priced-design.ts`, `whole-kitchen-tiers.ts`; ADR 0062 seam 1 | U5 | Full + security + visual |
| **U7, menu, rename, duplicate** | 1. `kitchen-menu.tsx` (A9D; the sent → Ascunde switch). 2. `rename-kitchen-form.tsx` (A9E). 3. `use-kitchen-actions.ts` (rename, duplicate, toasts). 4. Card and screen wiring | `account/kitchens/kitchen-menu.tsx`, `account/kitchens/rename-kitchen-form.tsx`, `account/kitchens/use-kitchen-actions.ts`, `account/kitchens/kitchen-card.tsx` (mod), `account/kitchens/kitchens-screen.tsx` (mod) | §1 A9 (D–F), §3 C4, C31; ContBlocks2 `isK` menu and rename | U5, U2, S6b | Full + security + visual |
| **U8, share, delete, hide** | 1. `share-kitchen-sheet.tsx` (P7; reuses `share-link-client.ts`, `absolute-share-address.ts`). 2. `delete-kitchen-dialog.tsx` (A9H, C6). 3. `hide-kitchen-dialog.tsx` (A17A–D, C7). 4. Action wiring | `account/kitchens/share-kitchen-sheet.tsx`, `account/kitchens/delete-kitchen-dialog.tsx`, `account/kitchens/hide-kitchen-dialog.tsx`, `account/kitchens/use-kitchen-actions.ts` (mod) | §1 A9 (G, G2, H), A17, §3 C5–C7; `share/share-design.tsx` (the shipped states); ADR 0114 B | U7 | Full + security + visual |
| **U9b, A9K** | `design-load-error.tsx`: a "Bucătăriile mele" action for a client session; the same copy for every refusal (P9) | `app/d/[id]/design-load-error.tsx` (mod) | §4 P9; ADR 0114 d5, H2; `load-owned-design.ts` | U5 | Full + security + visual |

### 6.3 Phase C: profile, password, e-mail

| Wave | Items (≤ 5) | Production files (≤ 5) | Reading (implementer) | Depends | Tier |
| --- | --- | --- | --- | --- | --- |
| **S7, account store and the capability** | 1. `findProfile`, `updateProfile`. 2. `changePassword` (compare-and-set on the current hash, set `password_changed_at`, revoke all, in one transaction). 3. `issueEmailChangeToken` (newest-only per purpose), `confirmEmailChange` (locked, unique-safe). 4. `account.manage.own` (P4, if O16 accepts; otherwise the named self-service check lands in S8) | `account-store.ts` (mod), `neon-account-store.ts` (mod; split into `neon-account-profile-store.ts` if it passes ~25 KiB [inf: it is 20.9 KiB today, run: `ls`]), `fake-account-store.ts` (mod), `configurator-domain/src/account/capabilities.ts` (mod) | §2.2 E6–E9, §4 P4, P11, P12; `neon-account-store.ts:170-420`, `neon-session-store.ts:40-180`; `capabilities.ts`, `require-capability.ts`; plan §4 `0012`–`0014`; plan §9 L4a and L4b race list | S1, S2, O16 | Full + security |
| **S8, profile and password routes** | E6; E7 with `startSession` after the transaction (P11); the notice mail after the response | `app/api/account/profile/route.ts`, `app/api/account/password/route.ts`, `lib/server/account/update-profile.ts`, `lib/server/account/change-password.ts`, `account-responses.ts` (mod) | §2.2 E6–E7; plan L9 obligations (order of work, length cap, NFKC, platform failure, bind to the post-rehash hash); `sign-in.ts`, `session-lifecycle.ts`, `reset-password.ts` (the notice) | S7, S6a (`limit-policy.ts` order) | Full + security |
| **S9, e-mail change** | E8, E9, the three mails (O8), the mail buckets | `app/api/account/email-change/route.ts`, `app/api/account/email-change/confirm/route.ts`, `lib/server/account/change-email.ts`, `lib/server/mail/account-mail-messages.ts` (mod), `rate-limit/limit-policy.ts` (mod) | §2.2 E8–E9, §4 P12; ADR 0172 D1 (squatting reasoning), D5, D6, Amendment A item 2; plan flows 1, 2, 6; `verify-email.ts`, `queue-account-mail.ts`; plan §10 Gmail quota rows | S8 | Full + security |
| **U10, A10 profile** | 1. Page (server profile read). 2. `profile-form.tsx` (A10A–D, H; rows per C8, C9). 3. `use-profile-save.ts`. 4. `change-email-sheet.tsx` (A10E–G). 5. `use-change-email.ts` | `app/[locale]/account/profile/page.tsx`, `account/profile/profile-form.tsx`, `account/profile/use-profile-save.ts`, `account/profile/change-email-sheet.tsx`, `account/profile/use-change-email.ts` | §1 A10 (A–H), §3 C8–C11; ContBlocks2 `isText`, `isRows`; `account-form-parts.tsx`; Lot 1 O3 | U2, S8, S9 | Full + security + visual |
| **U11, A10T confirm-email** | 1. Page (`connection()`). 2. `confirm-email-form.tsx` (A10T1–T5; chip hidden; `platform-failed` keeps the token). 3. `use-confirm-email.ts` | `app/[locale]/account/confirm-email/page.tsx`, `account/profile/confirm-email-form.tsx`, `account/profile/use-confirm-email.ts` | §1 A10T, §3 C12; Lot 1 review §3.3 *On load of a token page*, criteria 4 and 15; `fragment-token.ts`, `verify-email-form.tsx`, `use-verify-email.ts` | U1, S9 | Full + security + visual (fragment) |
| **U12, A11 password** | Page, `change-password-form.tsx` (A11A–G), `use-change-password.ts` | `app/[locale]/account/password/page.tsx`, `account/profile/change-password-form.tsx`, `account/profile/use-change-password.ts` | §1 A11, §3 C14, §4 P11, P13; `reset-password-form.tsx`, `use-reset-password.ts` | U1, S8 | Full + security + visual |

### 6.4 Phase D, and what is blocked

| Wave | Items | Production files | Reading | Depends | Tier |
| --- | --- | --- | --- | --- | --- |
| **S10, export** | E10 with the C15 scope; a kitchen-store `exportAll` (hidden included) | `app/api/account/export/route.ts`, `lib/server/account/export-account.ts`, `neon-account-kitchen-store.ts` (mod), `fake-account-kitchen-store.ts` (mod), `limit-policy.ts` (mod) | §2.2 E10, §3 C15; ADR 0153 d1; `OWNER_FIXES.md` item 14; backlog 144 (CSV neutralisation: not triggered by JSON, noted) | S6a, S7 | Full + security |
| **U13, A12 export** | Page, `export-screen.tsx`, `use-export.ts` (POST, blob, `a.download`); the profile row appears | `app/[locale]/account/export/page.tsx`, `account/profile/export-screen.tsx`, `account/profile/use-export.ts`, `account/profile/profile-form.tsx` (mod) | §1 A12, §3 C15 | U10, S10 | Full + security + visual |
| **S11, claim detail** | E11 (only if O2 = b) | `claim/route.ts` (mod), `claimable-designs.ts` (mod), `neon-configuration-repository.ts` (mod), the fake | §2.2 E11; plan L14b criterion 5; ADR 0172 Amendment B residual | O2 | Full + security |
| **S12 / U14, delete account** | **Blocked** on the erasure record (plan §12 "GDPR export and erasure") | — | — | O5 | — |
| **U15, A15 / A16 / A16C** | **Blocked** on O1 and its record. Once ruled, ≤ 2 waves: the server mark (if any) and the sheet | — | §2.3 CG1, §3 C18–C21 | O1, O9 | Full + security + visual |

**Order.**

- **Phase A:** S0a → U1 → U2 → U3 → U4 → U15a. U9a follows U2 once O2 is answered; U15b follows U15a, U9a and O10.
  **Phase A waits for S0a (the architect's rulings), not for the owner's answers.**
- **Phase B:** S0a → S1 → S2 → S3 → S4 → S5 → S6a → S6b. U5 can start after S6a; then U6, U7, U8, U9b.
- **Phase C:** S7 → S8 → S9, then U10, U11, U12.
- **Phase D:** S10 → U13.
- **Parallel lanes:** Phase A's U-waves may run beside S1–S4, because they share no file. Otherwise, waves sharing
  §6's listed files run in sequence.

---

## 7. Acceptance criteria

A criterion binds the wave that adds the behaviour. Every criterion is verified **by reading** this round (D12), and
each is a test owed (§8.3).

**Server**

1. **One refusal, per route.** Sameness holds **within each route**: `PUT`'s existing refusal need not be
   `designNotFoundResponse`, it must only stay what it is today.
   - **On E2–E5 (a session caller):** for the session's account, each of these gets byte-identical status, body and
     headers, equal to the unknown id's:
     - an unknown id;
     - another account's kitchen;
     - a design no account owns (an unclaimed visitor design, even in the caller's own browser);
     - a hidden kitchen;
     - a deleted kitchen.
   - **On the existing design routes** (`GET /api/designs/{id}`, `PUT` / `PATCH`, share `POST` / `GET` / `DELETE`, the
     `/d/{id}` page), plan L12a criterion 1 is unchanged. For anyone who is neither the owning browser nor a session of
     the owning account, the answer is identical to a missing id's.
   - S4 adds one case to L12a criterion 1: **a hidden or deleted kitchen gets that same answer for its owning browser
     and its owning session too.**
   - **Must not happen:** the owning browser of an unclaimed, unhidden design loses access. That would be a regression
     of ADR 0114.
2. **No request-chosen identity.** No new route reads an account id, role, capability or visitor hash from the body,
   query or a header. The account is `readCurrentSession`'s.
3. **Hide and delete close every arm** (S4). *(Qualified 2026-10-20, O22 open: the shop's frozen copy at `/s/<token>`
   in `contact_submission_views` stays reachable after hide, by design, ADR 0165. The "revoked share link" line below
   concerns the client's own share link only.)*
   - After E4 or E5 succeeds, the claiming browser (visitor cookie and write token) and the owning session both get
     criterion 1's refusal on read, save, share and resume. The contact route refuses to send it.
   - The share link that was active is revoked (`/s/{token}` gives the share page's not-found).
   - **Must not happen:** a hidden or deleted kitchen appears in E1 or reopens through resume.
   - It **does** appear in E10's export.
4. **Conflicts only after ownership.** `409 sent` / `409 not-sent` are answered only after the account predicate
   matched. For anyone else, criterion 1 comes first. A refused delete or hide changes nothing.
5. **List.** E1 never returns a design whose `account_id` is not the session's, or one that is hidden or deleted.
   Order is strictly `(updated_at desc, id desc)`.
   - **Property (owed, fast-check):** for any set of eligible rows and any page size from 1 to 50, concatenating
     every page gives each eligible id exactly once.
   - `total` equals the number of eligible rows read in the same snapshot as the first page.
6. **Rename touches only the name.** After E2:
   - `document`, `revision`, `updated_at`, `write_token_hash`, `visitor_hash` and `account_id` are unchanged;
   - an editor holding the old revision saves without a `409`.
7. **Duplicate.** The new row:
   - has a fresh id;
   - has a `document` deep-equal to the source at its stored revision;
   - has `account_id` = the session's;
   - has `visitor_hash`, `write_token_hash`, `sent_at`, `hidden_by_client_at` and `deleted_by_client_at` null;
   - has its own revision starting at 1;
   - counts one mint per-IP hit and one duplicate-by-account hit.

   The source row is unchanged.
8. **Password change** (E7).
   - The password-check bucket is counted before argon2, identically for a right and a wrong password.
   - A wrong current password answers `400 wrong-password` and writes nothing else.
   - On success:
     - every session of the account that existed before is not live (`findLive` refuses), **including this device's
       old cookie value**;
     - the response sets exactly one new session cookie, whose session is live;
     - `password_changed_at` has advanced;
     - the notice mail is queued after the response.
   - **Must not happen:** a response that answers `200` without a live new session, or with an old session still live.
9. **E-mail change request** (E8). The status and body are identical for a free address, an address held by another
   account (verified or not) and the caller's own address. No mail leaves before the response.
10. **E-mail change confirm** (E9).
    - One `400 link-invalid` for an unknown, used, expired, superseded or now-taken target. **Never a `500` on the
      unique constraint.**
    - On success: `email` and `email_normal_form` are updated, the token is used, every session is revoked, and the old
      address is mailed. A `GET` of the page changes nothing.
11. **Export** (E10).
    - It holds the session's account and its designs only, hidden included.
    - It holds no password hash, token hash, session, visitor hash, write-token hash, other account id or share token.
    - A cross-site `POST` is refused.
12. **Profile** (E6).
    - `phone: ""` sets both phone columns null.
    - An absent member leaves its column unchanged.
    - No request changes `email`.
13. **Staff** (no `design.*.own`) get `403` on E1–E5 and never a `200` or a criterion-1 refusal. A signed-out request
    gets `401` before any lookup.

**UI**

14. **M1.** The diff of `src/account/**`, `app/[locale]/account/**` and the configurator hosts imports none of
    `next/link`, `@/i18n/navigation`, `StartLink` or `LocaleMenu` in an account file. Every link into, out of or between
    account pages, the header control included, produces a document request in Playwright.
15. **No account value in client storage.** Zero hits for `document.cookie`, `localStorage` and `sessionStorage` in the
    new account files.
16. **44 px.** At 390 × 844, `getBoundingClientRect` gives at least 44 × 44 for each of:
    - every "⋯";
    - every menu item;
    - every profile row;
    - every dialog and sheet button;
    - the header icon and "Intră în cont";
    - the A16C × (if built);
    - the toast's action (if any).
17. **Dialogs.** Each one:
    - takes focus in;
    - traps Tab in the order drawn (A9G, A10E, A15A);
    - closes on Esc except while busy;
    - returns focus to its opener ("⋯", "Schimbă e-mailul", the header icon).

    The initial focus is as drawn: "Anulează" on destructive dialogs, "Copiază" or "Creează" on share, "Nu acum" on the
    claim dialog. **A destructive button is never pre-focused and never filled.**
18. **401 and 403.**
    - A signed-in page requested with **no session cookie** redirects to the plain login, with no `reason`. **Must not
      happen:** a person who never signed in reads "Sesiunea ta a expirat".
    - A page requested with a cookie that is present but not live redirects to `login?reason=session-expired`.
    - A client call answering `401` after the page rendered signed in performs `location.assign` to
      `login?reason=session-expired`.
    - `403` shows A20C, or no dialog for a claim.
    - **No `403` ever renders "sesiune expirată".**
    - No raw server word is ever rendered.
19. **Plurals.** The count renders through ICU one / few / other, at 1, 2, 5 and 20, in **the form O17 rules**: default
    "20 bucătării" (C30). RU uses one / few / many.
20. **Names.** A kitchen name wraps to 2 lines and clamps only after that. The card's accessible name and "Deschide
    {nume}" carry the full name.
21. **Header control.** Anonymous shows "Intră în cont". A client shows no role and no initials. Staff see no
    "Bucătăriile mele" and no "Zona personalului" (C24). At 390 px, in RO and RU, the top bar truncates nothing and
    still follows the ADR 0104 ladder.
22. **The confirm-email token page** meets Lot 1 criteria 4 (fragment) and 15 (no router action), shows no chip, and
    makes zero third-party requests.
23. **Claim.**
    - The dialog appears only when `claimable > 0`, on login or verify, never on Step 1 or a design load.
    - The `POST` is sent only on "Atașează".
    - The success line shows the server's `claimed`.
    - (Plan L14b criteria 1, 4, 6; criterion 5 per O2.)
24. **Logout everywhere.** A `503` leaves the dialog open with A14E's text and the session live. A `204` lands on
    login with A14D's notice.
25. **Own sign-out is not expiry.**
    1. In the editor, on a design opened through the account arm, the person chooses "Ieși din cont".
    2. The next save turns `unauthorized`.
    3. **A20B must not appear.** The editor shows today's read-only state.
    4. A20B appears only when the session ends without the person's action in this document. Tested by revoking the
       session server-side, then saving.

---

## 8. Risks, and what is owed

### 8.1 Risks

| Risk | Response |
| --- | --- |
| **No tests (D12)** on access-control changes (S4) and on routes that issue and revoke sessions (S8, S9) | Full + security on each. Criteria 1, 3, 8 and 10 are the first tests owed. The plan §12 "unexecuted SQL" list grows by S3's keyset query, S4's predicates and S7's compare-and-set |
| **ADR 0019 d11's accepted risk grows.** `hidden_by_client_at` and `deleted_by_client_at` become access-control columns under the table-level `UPDATE` | Recorded in S0a as a dated note, as for `account_id`. Column-scoping stays the named revisit |
| **The M8C merge** brings the preset-name format (S2 dependency), migration numbering (`0016+` provisional) and the ADR 0169 -> 0172 renumbering (done at the merge) | S2 waits for the merge or takes a stated stand-in. No migration number is final until the merge |
| **E-mail change is a mail-flood vector** to arbitrary targets on the shared Gmail quota (plan §10) | P12 (5) buckets; the password re-entry; mail after the response |
| **The gate exclusion regresses L12a / L12b** | S4 reading names L12's criteria; the refusal-matrix doubles of plan §9 (L12a review I2) are owed first |
| **The `top-bar-fit` change** breaks the measured ladder or `top-bar-box.test.ts` | P15: the visual check at 390 px in RO and RU; the test update is owed, never deleted (ADR 0152) |
| **Extracting the modal hook** (P18) changes the settings sheet | The visual reviewer checks the settings sheet's focus, Esc and inert behaviour before and after |
| **A15 / A16 stay blocked** and the owner expects them | O1 is first in §9; Phase A–C do not depend on it |
| **E1's payload.** Twelve full documents per page; each document is bounded by `MAX_DESIGN_BYTES` [src: the save route imports it] | A page of 12 at most. If the measured page is too heavy for 390 px on a mobile connection, S6a returns a smaller page size, a constant, before U5 ships |
| **E-mail change to an address a squatter holds unverified** answers `link-invalid` at every confirm until the 30-day cleanup exists | P12 (6), recorded as a residual. The retention job closes it |
| **Copy honesty** (C6, C7, C15) depends on the privacy notice | The notice is a working draft only (ADR 0172 *Remaining*, item 6); the owner checks C6, C10, C11 and C15 against it |

### 8.2 Visual method notes

The method is Lot 1's (§6 common). Two additions:

- The desktop A9 grid has no "Încarcă mai multe" drawn: the port places it under the grid.
- Toasts must not cover the action bar at 390 × 844.

### 8.3 Owed (the tests round, not these waves)

- The criteria above, each as a test.
- The catalogue parity, copy lock and golden hashes for every new leaf (plan §9 a).
- The privilege test's arms for the new grants (S1).
- `top-bar-box.test.ts`.
- An e2e of: register → confirm → claim → list → rename → duplicate → hide → reopen refused, in a second browser
  context.
- The e-mail change round trip through the fake outbox. Its reader gap is plan §9 / Lot 1 §3.7.

---

## 9. Open owner questions

| # | Question | Default (the architect's recommendation) | Blocks |
| --- | --- | --- | --- |
| **O1** | **Save / Discard under autosave (CG1).** Every kitchen is saved as it is edited and is a list entry from its first save. What do "Salvează" and "Nu o păstra" mean? (a) A "kept" mark: a generated kitchen stays out of "Bucătăriile mele" until kept; "Nu o păstra" leaves it unkept (no deletion; retention later); the pop-up shows only for an unkept kitchen with edits. (b) No pop-up for a client: every kitchen is kept, and generating a new one just starts it. The owner's "keep all kitchens they generated" holds; Q-F3-5's pop-up is withdrawn for clients and kept for visitors as the registration moment (A16B). (c) "Nu o păstra" deletes the current kitchen (P8's mark) | **(b)** for clients and A16B for visitors, because it is the only option that adds no state and promises nothing autosave contradicts. (a) is next best. CD answer 1's "versiunea salvată" is rejected in every option | U15 |
| **O2** | **Claim dialog detail (CG6).** Plan L14b criterion 5 (a security-review residual) requires count, dates and thumbnails. (a) Amend criterion 5 to count only, as delivered (A18A). (b) Build E11 (count + dates + summary name; no thumbnails, which do not exist) and port A18F | **(b) without thumbnails,** with criterion 5 amended to "count, dates and names". Claiming cannot be undone (ADR 0172 Amendment E item 8), so the person should see what is attached | U9a |
| **O3** | A9H wording under P8 (no physical delete): accept C6's "O ștergem din lista ta și nu o vei mai putea deschide sau recupera."? | Yes | U8 |
| **O4** | Export scope (C15): profile and kitchens now, with requests and notes later | Yes, with the copy changed | S10, U13 |
| **O5** | Delete account (C17): no A13 this milestone. Interim: show a row "Pentru ștergerea contului, scrie-ne la {adresă}", or nothing? Which address? | The row, once the owner names the address and the runbook process exists | U10 rows |
| **O6** | Sent flag (P6): set when the request is stored, or when the shop's notice is marked sent? | When stored | S5 |
| **O7** | Does hiding a sent kitchen also stop its share link? | Yes. Hide means "nu o vei mai putea deschide", and a live link would keep it open to others | S3 |
| **O8** | E-mail change mails: (1) the new address already has an account: send it a notice, or nothing? (2) the old-address notice copy. (3) Revoke every session on confirm (C12)? | (1) A notice, mirroring D1. (2) Draft for approval. (3) Yes | S9, U11 |
| **O9** | A16C: build the occasional card? If so, how often? | Defer. If built: at most once per document load after the first edit, dismissal in memory only | U15 |
| **O10** | Return to the open kitchen after signing in (CD answer 4): accept the closed allow-list (C26)? | Yes | U15b |
| **O11** | Backfill `sent_at` for requests stored before S5 (an owner-run statement), or leave older kitchens unmarked? | Backfill, preview first. Pre-launch volume is small | S5 |
| **O12** | "Anulează" on Lot 2 dialogs against ADR 0086's "name the outcome" (P19) | Keep Lot 2's "Anulează" for account dialogs, as a scoped exception | U2 |
| **O13** | Approve Lot 2's Romanian copy, including the C-row changes and gaps (C5, C6, C15, C23, C31). A native speaker checks the RU cards | — | the copy lock; milestone close |
| **O14** | Lot 1's O3 (phone wording: account against the locked contact copy) is still open and now also governs A10D | Account wording, as built in `accountFieldErrors` | copy lock |
| **O15** | Keep one file per lot (`Lemnaria Cont Lot 2.dc.html`), as Lot 1 did? | Yes | S0b README |
| **O16** | Add a capability `account.manage.own` (every role) for the self-service routes (P4)? It extends the capability list the owner ruled (Fix 3 item 9, ADR 0172 D7) | Yes. The alternative is a named `requireSignedIn` check recorded as an exception to D7's "one function" | S7, S8 |
| **O17** | Plural with twenty: the 2026-09-10 ruling "without «de»", or the approved Lot 2 / brief's "20 de bucătării" (C30)? | "20 bucătării" (the dated ruling) | U5, U9a copy |
| **O18** | HTTP 200 vs 403 for the forbidden page (needs experimental authInterrupts) | — | A20C |

### Answered by the owner, 2026-10-19 [owner, relayed by the coordinator]

The rows above keep their original text. Status: **O5, O6, O10, O16, O18 answered**; the other rows stay open.

- **O5 — ANSWERED.** Do nothing now. No A13, no interim row, no contact address (the row's default is not taken).
- **O6 — ANSWERED.** The sent flag is set when the request is **stored**, regardless of whether the shop e-mail
  succeeds. Rationale: operators and admins filter by this flag even when e-mail sending fails.
- **O10 — ANSWERED.** Default landing after sign-in is "Bucătăriile mele" (the kitchen list) for a client. For
  operator and admin it is a general dashboard that is **not yet planned** (it will hold statistics); until it exists
  they land on the start page. The closed C26 return-path allow-list `/{ro|ru}/d/{id}` stays for the refused-save case
  and takes precedence.
- **O16 — ANSWERED (default confirmed).** Add the capability `account.manage.own` (every role) for the self-service
  routes.
- **O18 — ANSWERED.** Keep HTTP 200. The backend includes an explicit machine-readable forbidden marker in the
  response payload (a state `"forbidden"` plus a message key), and the UI renders the "access forbidden" screen from
  that payload. No experimental `authInterrupts`. Consistent with the existing SharedOutcome / forbidden handling in
  `apps/web/src/lib/server/account/signed-in-page.ts` [doc-quoted from the owner's relay; the file was not re-read].

### New open owner questions, 2026-10-20 [coordinator's brief, relayed]

Raised by the wave reviews. None is ruled. Evidence tier of every row: **source-verified by the reviewing agents**
(the scribe re-read no code).

| # | Question | Recommendation | Blocks |
| --- | --- | --- | --- |
| **O19** | **E-mail change takeover recovery (review finding F1).** Someone holding a signed-in session and the password can move the account to an address they control, and the old owner has no way back. Send a notice to the **old** address at request time, and/or a time-limited revert link in the confirm notice | **Both** | The grant `UPDATE (email, email_normal_form)` on `accounts` (runbook step 4b). It is **not** to be made until F1 is ruled, the confirm page exists, and E8/E9 are gated (below) |
| **O20** | `GET /api/account/profile` exists, though plan §1 A10 said the profile is read on the server. Keep or drop? | Not stated | S7/S8 surface |
| **O21** | Should the backup export ever carry `account_id` and `name`? (Today it deliberately does not; see §12.) | Decide after QP5, the accounts export | backup/restore |
| **O22** | The frozen sent-kitchen copy at `/s/<token>` (`contact_submission_views`) **stays reachable after hide**, by design (ADR 0165). Confirm explicitly, and amend the wording of CG9 and criterion 3 | Confirm | CG9, criterion 3 |
| **O23** | Password change and reset completion now retire **every** unused e-mail token, including verify-email. Accept that side effect? | Not stated | S8 |
| **O24** | The 429 wait shown inside the notice (mock A11F / SB10) is being implemented once, in the shared `account-form-parts`. Confirm | Not stated | U-wave copy |

### Future work

- **Data-erasure / retention policy ADR** (needed later; there is currently no policy on user-data erasure). Owner:
  the owner with the architect; no wave yet. It also decides A13 and the physical removal of P8's marked drafts.
- **Operator / admin dashboard** (O10): general dashboard holding statistics; not planned. Owner: the owner; no wave yet.

The wave split (P1), P2, P3, P5, P7–P11, P13–P18, P20 and the classifier shape are the architect's or the
coordinator's to rule. They are not owner questions.

---

## 10. Send back to Claude Design (for Lot 3 and any redraw)

**No screen is unusable.** Each item is fixed port-side unless marked.

| # | Item | Frames |
| --- | --- | --- |
| SB-L2-1 | Token-page frames with `hdr:'plain'` still draw the RO chip, against rule 0.3-7 and their own note | A10T1–T5 |
| SB-L2-2 | Share URL drawn as `/ro/v/…`; the product's is `/s/{12 chars}`, and it is shown only at issue (C5) | A9G, A9G2 |
| SB-L2-3 | "20 de bucătării": the owner ruled "without «de»" (C30) | plural table, A18A4 |
| SB-L2-4 | Step pill "3/5": the app has 4 steps on the room screen [src] | A19, editor frames |
| SB-L2-5 | Claim dialog drawn over "Bucătăriile mele"; the brief and plan put it on the login or verify page (P10) | A18 |
| SB-L2-6 | Secondary button and "⋯" borders `#dcd8ce` on `#faf8f4` measure 1.34:1 [run]. The label identifies the control, so this is noted for WCAG 1.4.11 rather than failed | ContBlocks2 `ks`, "⋯" |
| SB-L2-7 | Save / Discard semantics need O1 before a redraw | A15, A16 |
| SB-L2-8 | Toast duration and dismissal are not specified | A9F, A14A, A15C, A17C |
| SB-L2-9 | Undrawn states (the port uses the notice pattern): duplicate failure, share issue failure, delete failure, rename 503 / offline, e-mail sheet 429 / 503, confirm-email 429, offline on A10, A11, A12 and A13 | listed |
| SB-L2-10 | Missing copy: rename text codes, name and address codes (C31), the share "active link" and "new link replaces" lines (C5) | A9E, A10A, A9G |

**Contrast spot checks** [run, WCAG 2.x formula]: `#5a3e25` on `#ece7dd` 7.92 (badges, chip); `#8f2020` on `#faf8f4`
8.27 (destructive text); `#faf8f4` on `#1c1814` 16.64 (toast); `#2d5016` on `#eef1ea` 8.11 (Trimisă); `#6b5e52` on
`#f5f3f0` 5.66 (card meta). All pass.

---

## 11. Summary

- **Delivery.** Lot 2 delivers every screen A9–A20 the brief asked for: 76 mobile frames and 21 desktop frames [run].
  Lot 1's send-backs are honoured. No screen is unusable.
- **Of the ten server needs the task names:**
  - one is built: logout everywhere;
  - one is partial: claim data, count only;
  - eight are missing: list, rename, delete / hide, profile, change e-mail, change password, export, delete account.
- **Also built:** session, this-device logout, and share (which returns a URL only at issue).
- **Also missing:** duplicate and the sent flag.
- §2.2 gives the contracts for everything missing; §2.4 gives their order (S0a–S12).
- **Eleven contract gaps** (CG1–CG11). The two the owner must answer first:
  - **Save / Discard against autosave** (O1);
  - **the claim-detail conflict with plan L14b criterion 5** (O2).
- **Delete account is not buildable** in this milestone. Its profile row stays hidden.
- **Phase A** (header control, logout, claim dialog, session-expired sheet) runs on built endpoints. It waits only for
  S0a, the architect's rulings P2 and P3.
- **Every code wave is Full + security**, with visual on every UI wave (P20). There is no QA, by D12.
- **Copy rulings recommended:**
  - change the share sheet, the delete-draft line and the export body;
  - hide unbuilt rows;
  - omit "Zona personalului";
  - "20 bucătării" per the owner's 2026-09-10 ruling.

---

## 12. Built state, 2026-10-19..20 (added by the scribe)

**Evidence.** Every fact below is **source-verified by wave reviews** (a logic and a security agent per wave), relayed by
the coordinator on 2026-10-20 with HEAD `a47db452`. The scribe re-read no code and ran nothing. **No test was written
(ADR 0172 D12). Nothing was run against a database or in a browser.** "Built" means committed and reviewed by reading,
not exercised. §§1-11 are unchanged; where they differ, this section records what was built.

### 12.1 Server waves, committed on `feat/login-register`

| Wave | What is built |
| --- | --- |
| S1 | Migrations `0016`-`0018`: `designs` gains `name`, `sent_at`, `hidden_by_client_at`, `deleted_by_client_at`; `accounts` gains `name`, `address`; `account_email_tokens` gains `new_email`, `new_email_normal_form`. **Unapplied anywhere** |
| S2 | Domain rules: kitchen name normalised **NFC, not NFKC** (the plan's S2 said NFKC); profile name, address and phone validation; password-change and e-mail-change validators; `readExistingPassword`: the is-the-address rule now applies only to a **new** password, and sign-in no longer applies it |
| S3 | Account kitchen store: list by keyset with a total, rename, duplicate, hide and `markDeleted` (each with an atomic share-link revoke), `SentMarkStore` split into its own port. Documents that cannot be read are skipped and counted as `skippedCount` |
| S4 | Gate exclusion of hidden and deleted kitchens on load, resume, save, preset read, share issue / revoke / status, and the public share read (reviewers counted about 20 predicate sites) |
| S5 | `sent_at` is set when the request is **stored**, before the shop notice, bounded at 1 s and non-fatal. A retry before the notice repairs a missed mark. **The already-notified-replay case is not repaired**; the owner-run O11 backfill statement is its repair |
| S6a | `GET /api/account/kitchens`: 12 per page, opaque base64url cursor, returns summary plus document |
| S6b | E2 rename `PATCH`; E3 duplicate `POST` (the client composes the full "{name} (copie)" and truncates by code points, the server never truncates); E4 delete `DELETE` (unsent only); E5 hide `POST` (sent only). The 404 is identical for every unreachable case; `409` words `sent` / `not-sent` are answered only after ownership |
| S7 / S8 | Account store; capability `account.manage.own` for all roles; `GET` and `PATCH /api/account/profile`; `POST /api/account/password` (replaces the session; if the new session cannot start the answer is `401 password-changed-sign-in`). Password change and reset completion now retire **every** unused e-mail token (O23) |
| S9 | E8 / E9 e-mail change and three mails (O8 defaults; **copy is DRAFT**). Security fixes: e-mail-change tokens are retired before branching on the target; the token is bound to the verified password hash; confirm refuses a token created before `password_changed_at` |
| S10 | E10 export: profile and kitchens, hidden included, deleted excluded, a **provisional 200-kitchen cap**; over the cap answers `409 export-too-large` and does not spend the bucket |

**Deviation: the backup export.** Backup export and restore carry `sent_at`, `hidden_by_client_at` and
`deleted_by_client_at` **only**. `account_id` and `name` are deliberately **not** exported, per ADR 0172 D10, until the
accounts export (QP5) exists. Owner question O21.

**Deviation: `GET /api/account/profile` exists** although §1 A10 said the page reads the profile on the server. Owner
question O20.

### 12.2 UI waves

- **Committed and merged into the branch:** U5 kitchens list; U6 card price (one price-book module,
  `price/price-book-root.ts`); U10 profile page; U12 password page. U12 follow-ups are in progress.
- **In progress, not committed:** U7 / U8 (card menu and dialogs); U11 (confirm-email page) and the E8 request page.
  The E-mail-change UI is to be gated behind a constant `EMAIL_CHANGE_ENABLED = false`.
- **Not built:** U13 (export page) was not reported; U14, U15 and S11 / S12 remain as §6.4 states.

### 12.3 Bounds chosen

- `accounts.name` at most 120 and `accounts.address` at most 200 in the database; the **domain** limits are 100 and 100.
- The database checks bound **length only**. The domain refuses control and format characters, and the store also
  refuses them for kitchen names.

### 12.4 ADR 0019 d11 accepted risk, scope grown again

`hidden_by_client_at`, `deleted_by_client_at` and `sent_at` fall under the table-level `UPDATE` on `designs`.
**The owner must re-accept before hide and delete are used in production.** Recorded as ADR 0172 Amendment G.

### 12.5 Accepted residuals (reviewers' findings, accepted for this round)

- A lost acknowledgement on the E9 confirm drops the old-address notice.
- A login-versus-confirm race sliver.
- An E9 `503` is followed by `link-invalid` on retry.
- Duplicate has no lifetime cap (only the daily buckets).
- `markSent` is not scoped by account on its own port.

### 12.6 Owed: the tests round

- S4 predicates (about 20 sites), each mutation-proven.
- Route order and 404 byte-identity for E1, E2-E5, E6-E10.
- Copy lock `approved-romanian-messages.ts` and golden hashes for `accountKitchens`, `accountProfile`,
  `accountPassword`, `accountMail` and `claimDialog`.
- `limit-policy.test.ts`: the length 20 assertion is already stale.
- Persistence statement tests.
- `top-bar-box.test.ts`.
- The §8.3 list above stands.
