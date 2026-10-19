# M8B — Account screens, Lot 1: review of the Claude Design delivery and the port plan for L13b and L14a

> **STATUS: DRAFT of 2026-10-18, architect. No wave dispatched, nothing committed.** Branch `feat/login-register`
> (worktree `lemnaria-configurator-login`, HEAD `ef68b127` plus uncommitted changes). This file adds to
> [`M8B-login-register-plan.md`](M8B-login-register-plan.md). It does **not** amend that plan's §7. The wave
> regrouping in §3.0 is a **proposal**. The coordinator or the owner rules on it, and the scribe records the ruling as a
> dated amendment to the plan.
>
> **D12 still applies.** ADR 0172 D12 says this round runs without tests and without a QA step. So "QA" below means
> **none this round**. The gate is the green verification in plan §8. E2E work is **owed** (§3.7) and is not part of
> any wave.

**Inputs.**

- `docs/design/mockups/Lemnaria Cont Lot 1.dc.html` (38.8 KiB).
- `docs/design/mockups/ContBlocks.dc.html` (13.4 KiB). Lot 1 imports it with `dc-import`.
- Both files are untracked in this worktree.
- Both load `./support.js`, which the repository does not hold (`docs/design/README.md`, *Not copied*). Neither file
  renders standalone. **Everything below was read from the markup and the frame script as text. No frame was seen
  rendered.**
- The prompt they answer is `docs/design/prompts/account-screens-claude-design-prompt.md`, Part 0 and Part 1.

**Evidence tiers.** This file uses the same tiers as the plan.

| Tag | Meaning |
| --- | --- |
| **[mock]** | Read in the Lot 1 or ContBlocks markup or script |
| **[src]** | Read in this worktree's source |
| **[doc]** | Quoted from a record in this repository. This includes the docs bundled with `next@16.3.8` |
| **[run]** | A command the architect ran, result quoted |
| **[inf]** | The architect's inference |
| **[ven]** | A vendor fact from memory, **not re-read** |

---

## 0. How Lot 1 is built, and what that means for reading it

- **The frames are data.** One `SCREENS` array (`Lot 1.dc.html:185-319`) drives two templates: a 390 × 844 phone
  frame (`:53-84`) and a 1920 × 1080 desktop frame (`:113-144`). Frame content is a list of blocks, and
  `ContBlocks.dc.html` draws them. The block kinds are field, notice (err/warn/ok/info), Turnstile slot, hero, help
  list, links, paragraph and label. [mock]
- **Copy is live text** in the script constants (`PWH`, `BREACH`, `INV3`, `INV4` …). That is what the prompt's
  checklist asked for. It can be lifted into `ro.json` as written. [mock]
- **Desktop frames** exist only for frames flagged `d: 1`. Their badge is `D` + the mobile ID, so `DA1A`, `DA3C`
  (`:108-111`). [mock]
- **One file for both surfaces.** The prompt proposed two (*Lemnaria Cont Mobil / Desktop*) and marked the proposal
  "not yet a project rule". The owner may keep the single file. Either way, `docs/design/README.md`'s file table does
  not list it yet (W-doc in §3.5). [mock, doc]
- **Under every frame** there is a `Server:` line and a note (`:85-90`). Under every screen there is an RU card
  (`:94-102`). [mock]

## 1. Frame inventory and how it maps to A1–A8

There are 44 mobile frames and 13 desktop frames [mock, counted from `SCREENS`].

| Screen (route as drawn) | Mobile frames (caption) | Desktop | Requested by the prompt | Verdict |
| --- | --- | --- | --- | --- |
| **A1 Înregistrare** `/[locale]/account/register`, header "Cont nou" | **A1A** Gol · verificarea se încarcă<br>**A1B** Completat, valid · focus pe buton<br>**A1C** Erori pe câmpuri (`PASSWORD_TOO_SHORT`, `PHONE_MOLDOVAN_INCOMPLETE`)<br>**A1D** Parolă găsită în scurgeri<br>**A1E** Se trimite<br>**A1F** Verificarea anti-robot a eșuat<br>**A1G** Prea multe încercări · scurt (`Retry-After: 240`)<br>**A1G2** Prea multe încercări · „mâine” (`61 200`)<br>**A1H** Serviciu indisponibil | DA1A, DA1C | A1A–A1H. A1F is "slot loading / failed". A1G is "short and mâine" | **Delivered.** A1G2 is the "mâine" half of A1G under its own ID (extra ID, not an extra state). The slot's loading state is in A1A, and its "cannot load" state is in A7 only |
| **A2 Verifică-ți e-mailul** "după A1 · fără rută proprie" | **A2A** Răspuns neutru după înregistrare (`202 check-inbox`) | DA2A | One state, plus the help block and "Am greșit adresa" | **Delivered.** The open question about a resend route is noted under the frame. No frame shows the "Am greșit adresa" return (optional) |
| **A3 Confirmă adresa** `/verify-email#t=…`, marked "Pagină simplă · fără terți" | **A3A** Pregătit · focus pe parolă<br>**A3B** Se confirmă<br>**A3C** Link sau parolă nevalabile<br>**A3D** Deschisă fără token<br>**A3E** Prea multe încercări<br>**A3F** Serviciu indisponibil<br>**A3G** Confirmat · tranziție | DA3A, DA3C | A3A–A3G | **Delivered.** A3G's copy is a defect (§2.10 D6) |
| **A4 Intră în cont** `/login` | **A4A** Gol<br>**A4B** Se verifică<br>**A4C** Date care nu se potrivesc (`401`)<br>**A4D** Verificarea anti-robot a eșuat<br>**A4E** Prea multe încercări · scurt<br>**A4E2** · „mâine”<br>**A4F** Serviciu indisponibil<br>**A4G** Sosire după sesiune expirată | DA4A, DA4C | A4A–A4G | **Delivered.** A4E2 is an extra ID. **Missing, and not requested:** the `400 invalid-input` state the route really sends (§2.1) |
| **A5 Parolă uitată** `/forgot-password` | **A5A** Gol<br>**A5B** Se trimite<br>**A5C** Răspuns neutru (`202`)<br>**A5D** Adresă greșită (`MALFORMED`)<br>**A5E** Verificarea anti-robot a eșuat<br>**A5F** Prea multe încercări<br>**A5G** Serviciu indisponibil | DA5A, DA5C | A5A–A5G | **Delivered.** **Missing:** the long-wait ("mâine") variant of A5F, although the reset-mail bucket is a UTC day (§2.1) |
| **A6 Parolă nouă** `/reset-password#t=…`, plain | **A6A** Pregătit · focus pe parolă<br>**A6B** Parolă prea scurtă<br>**A6C** Parolă găsită în scurgeri<br>**A6D** Se salvează<br>**A6E** Parolă schimbată<br>**A6F** Link nevalabil (also no `#t=`)<br>**A6G** Prea multe încercări<br>**A6H** Serviciu indisponibil | DA6A, DA6E | A6A–A6H | **Delivered** |
| **A7 Slotul Turnstile** | **A7A** Cele cinci stări (loading, ready, passed, failed, cannot load) | DA7A | Five states, mobile and desktop | **Delivered.** States 2 and 3 are drawn inside Cloudflare's frame, which the app cannot draw (§2.4) |
| **A8 Erori comune** | **A8A** Cerere care nu a putut fi trimisă (`cross-site`, `invalid-request`, `413`, `415`)<br>**A8B** Fără conexiune<br>**A8C** Pagina nu există (`404`) | DA8A | Three | **Delivered.** A8A and A8B have defects (§2.10 D5, D7) |

**Extras: copy that the prompt did not give.** These are drafts, so the owner must approve each one before the copy
lock takes it.

- A1 body: "Cu un cont îți deschizi bucătăriile de pe orice dispozitiv."
- A1C summary: "Verifică cele 2 câmpuri marcate."
- A5 body: "Scrie adresa contului. Îți trimitem un link pentru o parolă nouă."
- A5 bar link: "Ți-ai amintit? Intră în cont".
- A6 body: "O vei folosi de acum ca să intri în cont."
- A3G: "Te-am conectat. Te ducem la bucătăriile tale…"
- A8C: "Adresa nu duce la nicio pagină din cont."
- A8A primary: "Reîncarcă pagina".
- The header titles "Cont nou", "Verifică e-mailul", "Parolă uitată", "Parolă nouă".
- The drawn widget's "Verificare de securitate" / "Verificat".

[mock]

**Nothing is missing that blocks the port. No screen is unusable.** Section 4 lists what goes back, and which items
must be answered before the wave that needs them.

## 2. Conformance

### 2.1 Server words → frames

The routes were read at `apps/web/src/app/api/account/*/route.ts` and `lib/server/account/*.ts` [src].

| Endpoint (body members) | Server answers it can give [src] | Frames | Verdict |
| --- | --- | --- | --- |
| `POST /api/account/register` `{email, password, phone?, locale, privacyNoticeVersion, turnstileToken}` (`register-account.ts`, `account-request.ts:105`) | `202 check-inbox`; `400 invalid-input` with fields `email`, `phone`, `locale`, `privacyNoticeVersion`, `password`; `403 challenge-failed`; `403 cross-site`; `400 invalid-request`; `413`; `415`; `429` + `Retry-After`; `503` | A2A, A1C, A1D, A1F, A8A, A1G/A1G2, A1H | Covered, except the codes in §2.2 |
| `POST /api/account/login` `{email, password, turnstileToken}` (`sign-in.ts`) | `200 {status:"signed-in", claimable}`; `401 invalid-credentials`; **`400 invalid-input`** (email codes, `PASSWORD_NOT_TEXT`, `sign-in.ts:104-114`); `403` ×2; `429`; `503`; malformed-request words | A4C, A4D, A4E/A4E2, A4F, A8A | **Gap: no invalid-input frame.** A password the policy refuses is a wrong password and answers `401`, not a field error (`sign-in.ts:102-103`). So the only field errors on login are the e-mail's and `PASSWORD_NOT_TEXT` |
| `POST /api/account/password-reset/request` `{email, turnstileToken}` | `202 check-inbox`; `400 invalid-input` (email); `403` ×2; `429`; `503` | A5C, A5D, A5E, A5F, A5G | **Gap: long wait.** `account-reset-mail-by-address` is 5 per UTC day (plan §5 [doc]; `limit-policy.ts:139` `ACCOUNT_DAY_MINUTES = 1440` with `utcMinutes` [src]). A `Retry-After` of hours is possible |
| `POST /api/account/verify-email` `{token, password}` | `200 signed-in` + `claimable`; `400 link-or-password-invalid` (also for a malformed token or a missing password, `verify-email.ts:48-51`); `429` (block, 20 per 60 min); `503`; malformed-request words | A3G, A3C, A3E, A3F | Covered. No long-wait variant is needed: the block bucket is 60 minutes |
| `POST /api/account/password-reset/complete` `{token, newPassword}` | `200 password-changed`; `400 link-invalid`; `400 invalid-input` with **`field: "password"`** (`reset-password.ts:59-60`, `:194`), codes `PASSWORD_TOO_SHORT`, `_TOO_LONG`, `_IS_EMAIL` (the account's address is known, `:191`), `_BREACHED`, `_NOT_TEXT`; `429`; `503` | A6E, A6F, A6B, A6C, A6G, A6H | Covered for TOO_SHORT and BREACHED. The other three codes are not drawn, but their copy is in the prompt |

**The body member and the error field differ** on reset. The body member is `newPassword`, but the error names
`password`. The classifier must map `field: "password"` onto the new-password input (§3.3). [src]

**How the server orders its checks matters to the UI.**

- The challenge is checked **before** input validation, and a missing token is always `403`
  (`account-request.ts:96-112`) [src].
- So most answers, success included, spend the token. The exceptions are the refusals of steps 1–4 (cross-site,
  `413`, `415`, and the block limiter's `429` / `503`), which come before siteverify (plan §5) [doc]. The form still
  resets the widget after **every** answer (`resetCount + 1`) and waits for a fresh token: one rule, and no guessing
  which stage refused.
- The A1D note says the same ("Turnstile se resetează după orice răspuns") [mock].

### 2.2 Field-code coverage

Field codes come from the domain unions: `EmailAddressCode = TextRefusalCode | REQUIRED | MALFORMED`,
`TextRefusalCode = NOT_TEXT | TOO_LONG | FORBIDDEN_CHARACTER`, the six `PhoneRefusalCode`s, and
`PasswordRefusalCode` plus `PASSWORD_BREACHED` and `PASSWORD_NOT_TEXT` [src].

| Field · code | Copy in prompt | Drawn in Lot 1 | Port action |
| --- | --- | --- | --- |
| email · REQUIRED, MALFORMED, TOO_LONG, FORBIDDEN_CHARACTER, NOT_TEXT | yes | MALFORMED (A5D) | Use the prompt's copy |
| password · TOO_SHORT, BREACHED | yes | A1C, A6B, A1D, A6C | — |
| password · TOO_LONG, IS_EMAIL, NOT_TEXT | yes | no | Use the prompt's copy |
| phone · the six `PHONE_*` | yes | INCOMPLETE (A1C) | **Conflicts with approved copy.** `contact.fieldErrors` already words these six codes differently, and that wording is in the copy lock (`tests/support/approved-romanian-messages.ts:485-491`). For example, `PHONE_MOLDOVAN_INCOMPLETE` reads "Așteptăm 8 cifre după prefix" there and "Un număr din Moldova are 9 cifre" in Lot 1 [src, mock]. Owner question O3 |
| phone · TOO_LONG, FORBIDDEN_CHARACTER, NOT_TEXT (`readTypedText`, `input-checks.ts:69-86`) | **no** | no | **Gap.** Default: the email-style generic texts. Owner question O3 |
| locale · any code; privacyNoticeVersion · REQUIRED, NOT_TEXT, FORBIDDEN_CHARACTER, `UNKNOWN_NOTICE_VERSION` | `UNKNOWN_LOCALE` only ("generic text") | no | These are our defects, not the person's. Show the A8A generic text for all of them |
| *(client only)* empty password on login and on verify | **no** | no | **Gap.** The server answers `401` or `link-or-password-invalid` for an empty password. The form should refuse before sending: "Scrie parola." (draft; owner) |

### 2.3 No enumeration wording — **pass**

- A2A, A5C, A4C, A3C and A6F each carry the one neutral sentence from the prompt, character for character [mock vs
  prompt].
- None of the banned phrasings from prompt rule 0.5-3 appears anywhere in the script [mock].
- A4 has no "unconfirmed" frame, and its note says why. A5's rate-limit note says the text is the same for every
  address.

### 2.4 Turnstile placement, and the plain pages — **pass, with one modelling caveat**

- The slot (`ts(...)` / `{t:'turn'}`) appears on A1, A4 and A5 only. It does not appear on A2, A3, A6 or A8 [mock].
- A3 and A6 carry `plain: 1` and the "Pagină simplă · fără terți" badge. No external image, font or script is drawn
  there [mock].
- **Caveat [ven, inf]:** A7's states 2 ("Gata") and 3 ("Verificat") are drawn as our own box. In the product they
  are drawn by Cloudflare inside its iframe. The app owns only these:
  - the reserved slot and its loading placeholder;
  - the failed message under the slot;
  - the "cannot load" replacement.
- `turnstile-widget.tsx` renders a bare `<div ref>` while loading (`:106`) and `unavailableContent` when it fails
  [src]. **There is no loading placeholder today.**
- The 300 × 65 size is from memory and the prompt flags it [ven]. The L0 re-read confirms it, or uses Cloudflare's
  flexible size.

### 2.5 No pre-ticked boxes, no hidden consent, no dark patterns — **pass**

- There is no checkbox anywhere.
- Register links the notice and asks for no consent tick. A1A's note: "Fără bifă de consimțământ: contul este un
  contract".
- There are no social buttons, no "Ține-mă minte", and no strength meter.
- The password hint is length only. The "8 / 12" counter is the one the prompt allowed. [mock]

### 2.6 Accessibility

| Item | Lot 1 | Verdict / port rule |
| --- | --- | --- |
| Visible `<label>` per input | Every field block draws a `<label>`, and placeholders are examples [mock] | Pass. The port ties each label with `htmlFor` |
| Error tied to its field | Notes say `aria-invalid` + `aria-describedby` (A1C) [mock]. The markup puts `aria-invalid` on the wrapper `<div>` (`ContBlocks:34`) | The port puts both attributes **on the `<input>`**. The message has an id, and so does the hint |
| Form-level error | Top notice `role="alert"`. Focus goes to the summary (several fields) or to the field (one field, A5D) [mock] | Pass. Keep this rule |
| Focus ring | 2px `#7c5c3d`, offset 2, drawn on a button (A1B) and on fields (A3A, A4C, A6A) [mock] | Pass |
| Touch targets ≥ 44 | Field toggle 56 × 44, the in-content links block `min-height:44px` [mock] | **Four fail (send-back SB1):** mobile back chevron 40 × 40 (`Lot 1:55`); mobile RO chip at `padding:6px 8px` around 11px text, about 25 px tall [inf, CSS arithmetic] (`:59`); bottom-bar link `min-height:40px` (`:81`, `:139`); desktop RO chip `height:40px` (`:117`). The shipped `.back` is `var(--touch-target)` = 44px (`contact.module.css:54-59`, `globals.css:26`) [src]. Port to the shipped sizes |
| `autocomplete` | Notes name `email`, `new-password`, `current-password`, `tel` [mock] | Pass. Register and reset use `new-password`; login and verify use `current-password` |
| Show / hide | Visible "Arată" / "Ascunde" [mock] | It needs an accessible name. Use a `<button type="button" aria-pressed>` whose name says "parola". **Copy gap** |
| Busy | Spinner + "Se creează…", and the note says `aria-busy` [mock] | Pass |
| Not colour alone | "!" and "✓" dots everywhere [mock] | Pass |

### 2.7 Contrast

The ratios below were computed with the WCAG 2.x relative-luminance formula in a script the architect ran [run].

| Pair | Ratio | Use | Verdict |
| --- | --- | --- | --- |
| `#6b5e52` on `#faf8f4` | 5.91 | hints, body | pass (the prompt's rule is honoured) |
| `#6b5e52` on `#f5f3f0` | 5.66 | help list, desktop page | pass |
| `#8f2020` on `#fdf3f3` | 8.05 | error messages | pass (the prompt's rule is honoured) |
| `#dc2626` on `#faf8f4` | 4.55 | field label in error, 12.5px bold | pass, barely |
| `#5a3e25` on `#f7ecdc` | 8.36 | warning notice text | pass |
| `#7c5c3d` on `#faf8f4` / `#fdf3f3` / `#f7ecdc` | 5.73 / 5.58 / 5.21 | links | pass |
| `#2d5016` on `#eef1ea` | 8.11 | success | pass |
| `#faf8f4` on `#7c5c3d` | 5.73 | primary button | pass |
| `#a89c8e` on `#ece7dd` | **2.18** | **the countdown "Încearcă din nou peste 3:58" inside the disabled button** (A1G, A3E, A4E, A5F, A6G) | **fail as information.** A disabled control is exempt, but the countdown is live information shown only there. Send-back SB10 |
| `#a89c8e` on `#faf8f4` | 2.53 | placeholders | The prompt sanctions it. The label carries the meaning |
| `#7d7a72` on `#faf8f4` / `#f5f3f0` | 4.04 / 3.87 | A7's state labels, canvas captions | Documentation only. Never port them. The app's `--ink-faint` is `#6b6860` for this reason (`globals.css:10-17`) [src] |

### 2.8 Copy tone (Romanian) and the Russian notes

- **Romanian:** it uses informal *tu*, is short and plain, and matches the account e-mails' words: *cont*, *Intră în
  cont*, *parolă*, *link*, *Confirmă adresa*, *Alege o parolă nouă* [mock vs `ro.json` `accountMail`]. "Link-ul este
  valabil 24 de ore" and "30 de minute" match the code (`email-token.ts:20,23`) [src]. A change to either lifetime
  must change the copy too.
- **Russian notes:** informal *ты* throughout, and the glossary terms are reused (*аккаунт*, *Войти*, *ссылка*,
  *Выбрать новый пароль*). **Three issues** (send-back SB9):
  1. **Masculine past tense** where the Romanian is gender-neutral: A3 "Если ты уже подтвердил адрес"; A8
     "Ты ничего не потерял из того, что написал"; A5 title "Забыл пароль?". A neutral phrasing is needed, e.g.
     "Если адрес уже подтверждён…". A native speaker decides.
  2. A5's "Eroarea principală" row holds the **success** sentence.
  3. RU covers only title, primary and main error, as asked. Every other RU leaf is the implementer's draft, never
     marked approved (`engineering-conventions.md`, *Localised copy* point 4).

### 2.9 Mobile 390 × 844 and desktop 1920 × 1080

- **Mobile:** every state is drawn at 390 × 844 [mock]. The content area has `overflow:hidden` (`:64`), so a long
  state is **clipped** rather than scrolled. Working through A1C's block heights from the CSS gives about 690 px of
  content in about 608 px of room. The Turnstile slot would be partly hidden [inf, arithmetic, not rendered].
  - The product page must scroll.
  - The action bar must follow the contact page's sticky-not-fixed rule (`contact.module.css:1-3`), with
    `useKeepFocusAbove` (`components/use-keep-focus-above.ts`) [src].
- **Header title truncation [mock, inf].** The mobile header puts `‹`, "LEMNARIA", a divider, the title (ellipsis,
  `nowrap`, `:58`) and the chip on one row. That leaves about 170 px for the title [inf]. RU titles such as
  "Подтверди адрес электронной почты" would be cut, which breaks the prompt's 30% rule (0.3). Send-back SB2.
- **Desktop:**
  - a 76 px header with the wordmark, "‹ Înapoi la configurator" and a pill-shaped chip;
  - a centred 440 px card on `#f5f3f0`;
  - title 28px;
  - actions inside the card [mock].
  - It answers the prompt's "~440 px column, not a stretched form". The page tone is `#f5f3f0`, where the prompt said
    "#e7e3da/#faf8f4". That is a minor deviation.

### 2.10 Deviations from the prompt

| # | Deviation [mock] | Port decision |
| --- | --- | --- |
| D1 | One file instead of the two proposed | Keep it, if the owner accepts. List it in `docs/design/README.md` |
| D2 | Desktop frames exist for 13 of 44 states (every **screen** has at least one) | Enough. Desktop states without a frame follow the mobile state inside the desktop card |
| D3 | The submit stays **disabled until Turnstile passes** (A1A note). The prompt disabled it only when the widget could not load | Accept: the server refuses a missing token with `403` [src]. **However**, A1D, A1H, A4A, A4C, A4F, A5A and A5G draw an unsolved widget beside an **enabled** button, which contradicts A1A. The port follows A1A and adds a hint for the disabled state (copy gap; SB11) |
| D4 | `503` is drawn as a notice at the top of the form, and the primary is relabelled "Încearcă din nou", rather than as a separate 5B panel | Accept. The typed values stay and the password empties |
| D5 | **A8B "offline" is a full-screen hero, but its note says "Valorile din formular rămân"** | The port shows offline as an **in-form notice** (A1H's pattern, A8B's words). A full-screen state would hide the values it promises to keep. SB8 |
| D6 | **A3G promises "Te ducem la bucătăriile tale…"** No such page exists in Batch 1 (A9 is Batch 2, a later wave, plan §12) | The copy must change, e.g. "Te ducem înapoi la configurator…". SB6 |
| D7 | **A8A's "Reîncarcă pagina" on A3 and A6** reloads a page whose fragment was already cleared, so the token is gone and the person lands on A3D or A6F | On token pages, A8A says to open the link from the e-mail again, and offers no reload. SB7 |
| D8 | The "mâine" variant (A1G2, A4E2) uses the word "tomorrow" for a **UTC** day | Defect, see P5 and SB5 |
| D9 | No 10–60 minute rule: the block buckets are 60 minutes and the login address bucket is 15 minutes (plan §5 [doc]) | "peste {minute} min" with no countdown covers it. The threshold is to be stated (P5) |
| D10 | A1's "Ai deja cont? Intră în cont" sits in the content on A1A and A1B and is absent from A1C–A1H | The port shows it on every A1 state |
| D11 | Russian only on three strings per screen | As asked |

### 2.11 Deviations from the existing mock-ups' visual language

Compared only where read: the mobile header in `Lemnaria Configurator Mobil.dc.html`.

- **V1 header.** Existing: `padding:11px 14px`, chevron 17px in a 22px box, then a step pill. Lot 1:
  `padding:2px 12px 2px 4px`, chevron 26px in a 40 × 40 box, then "LEMNARIA | title". This follows the prompt (the
  wordmark replaces the step pill). The larger target is an improvement but still below 44. [mock, both files]
- **V2 notice palette.** An **info** notice ("i" on `#7c5c3d`, `#f5f3f0` fill, used by A4G) and a **warning** notice
  with `#5a3e25` text are new to the language. Both pass contrast (§2.7).
- **V3 hero block.** A 44 px round glyph, a 22px title and a 13.5px body (A2A, A3G, A5C, A6E, A6F, A8*). It is a new
  pattern, closest to 5A and 5B. Accept it, as one shared component.
- **V4 desktop page.** The `#f5f3f0` stage, a card with an 18px radius and a pill chip are new compared with the
  configurator's desktop frames. **Not compared in detail** against `…Desktop.dc.html`. The visual reviewer checks it.

---

## 3. Port plan for L13b and L14a

### 3.0 Wave grouping: a proposed change to plan §7

| | Plan §7 as recorded [doc] | Proposed here |
| --- | --- | --- |
| L13b | Register and confirm screens. Three production files | **The challenge pages:** register (with check-inbox), login, forgot; the shared kit; the Turnstile slot; the shared error states |
| L14a | Login, forgot and reset screens. Four production files | **The token pages:** confirm, reset, and the session-expired arrival on login |

**Why the regrouping:**

- **It splits by CSP and header family.** That is the line `proxy.ts` itself draws. `ACCOUNT_CHALLENGE_PAGES` get
  the Turnstile `frame-src`. `ACCOUNT_TOKEN_PAGES` get `no-referrer` and no third party (`proxy.ts:28-36`,
  ADR 0161 Amendment D items 1 and 4) [src, doc].
- Each wave then carries one security story: the challenge and enumeration in L13b, the fragment and single-use
  token in L14a.
- **The plan's file counts are not achievable.** The shared kit (answer classifier, request sender, fields, notices,
  shell, CSS module) is more than three files by itself. So each family is split into sub-waves of five production
  files or fewer (§3.5).

The confirm page's claim-dialog seam (plan L13b item 2) moves with confirm to L14a. **The scribe records this
regrouping as a dated amendment to plan §7** once the coordinator accepts it. Until then, plan §7 stands.

### 3.1 Decisions this port needs

Each is to be recorded by the scribe as an ADR 0172 amendment, or a new ADR where named.

| # | Question | Options | Recommendation | Who |
| --- | --- | --- | --- | --- |
| **P1** | **Locale prefix of e-mailed links** (L13a obligation) | (a) Every account link carries `/{locale}/`, and account paths stay **out** of `isCustomerPath`. (b) Add `account/*` to `isCustomerPath`, so unprefixed links are locale-negotiated | **(a).** `linkOf` already writes `${origin}/${locale}/account/${page}` (`account-mail-messages.ts:171`) [src]. `isAccountPageIn` already requires a real locale first and exactly three segments (`proxy.ts:293-303`) [src]. (b) would route account pages through next-intl's middleware and add a redirect hop with the site's headers. An unprefixed `/account/*` stays a 404. Test owed (D12): the builder's output starts `/{locale}/account/` for every kind | architect (ruling) |
| **P2** | **M1, full document loads** | (a) Plain `<a href>` and `location.assign` everywhere on account pages. (b) A separate root layout for the account family through route groups | **(a).** It is the smaller change. Both shared pieces the contact page reuses are client navigations and **must not be used on account pages**: `StartLink` and `LocaleMenu` are next-intl `Link`s (`components/start-link.tsx`, `locale-menu.tsx:20,138`) [src]. A soft navigation would also give the widget a fresh nonce that the document's policy does not hold, so a not-yet-loaded script would be refused [inf, from `proxy.ts:69` minting a nonce per request]. The account shell gets its own plain-`<a>` back link and language links | architect |
| **P3** | **Language switch.** Prompt 0.3 says "switching language keeps what the person typed" | (a) A full-load link; typed values are lost; on A3/A6 the token is lost too. (b) On A3/A6, hide the chip. (c) On A3/A6, `location.assign` to the other locale's page with `#t=` re-attached **at click time** (never in an `href`), and the next page clears it again | (a) on A1, A4 and A5. **This contradicts prompt 0.3**, because keeping values would need `sessionStorage`, which plan §3 forbids for account data. **(b) on A3 and A6** for this round. (c) is possible but puts the token back in a history entry, so it waits for a security reviewer's view | owner (accept the deviation from 0.3), security (c) |
| **P4** | **The privacy-notice link** (register's legal line) | (a) A stub route `/{locale}/privacy-notice` with one provisional sentence. (b) A link that 404s until the notice wave. (c) The draft text | **(a)**, opened with `target="_blank" rel="noopener"` so the form survives, plus a "(se deschide într-o filă nouă)" hint. The stub says which version it stands for: `PRIVACY_NOTICE_VERSIONS[0]` (`account-fields.ts:29`) [src]. (c) is barred: the draft is "not publishable" (plan §10, gates 9–20) [doc]. Launch gate 4 replaces the stub | owner (copy, route name) |
| **P5** | **Long-wait wording** | (a) Lot 1's "Prea multe încercări azi. Încearcă din nou mâine." (b) The contact page's shipped rule: a clock time from `Retry-After`, "după ora {time}", and "mâine, după ora {time}" when `isToldOnALaterDay` (`i18n/clock-time.ts`, `contact.outcomes.limited` / `limitedTomorrow`) [src] | **(b)** for waits over 60 minutes; "peste {minute} min" for 10–60 minutes; a countdown under 10 minutes. (a) is **false part of the night**. The account day windows are UTC (`limit-policy.ts:139,294,318`) [src], so they reset at 02:00 or 03:00 Chișinău time. Between local midnight and that hour, "mâine" is wrong [inf]. Minutes are `ceil(seconds / 60)`. A missing or out-of-range `Retry-After` gets a neutral fallback leaf (copy gap) | owner (copy) |
| **P6** | **Field-error copy namespace** | (a) A new `accountFieldErrors` with the prompt's wording. (b) Reuse the locked `contact.fieldErrors` for the shared codes | **(a)** for e-mail and password. **For the phone, the owner chooses**: one product would otherwise word one domain code two ways. Default (a) | owner |
| **P7** | **Inline links and bold inside sentences** (INV3's "[intră în cont]", the legal line's link, A2's bold address, RL's bold lead) | (a) next-intl rich text (`<link>…</link>`, `<strong>…</strong>` tags in the catalogue) through a new resolver in `content.ts`. (b) Split sentences into before / link / after leaves | **(a).** (b) breaks sentences for translators. **No `.rich(` call or tag exists in the codebase today** [run: grep, 0 hits], so this is a first use. The catalogue-parity test must be checked against tags. To be recorded as a dated note on ADR 0095 | architect |
| **P8** | **Where sign-in success goes, and the claim seam** | Success on A3 (verify) or A4 (login) | `location.assign("/{locale}")`, the configurator's start, the same target as "Înapoi la configurator". **No open `returnTo` in L13b.** Plan L14b criterion 1 says the claim dialog never appears "on Step 1", so it must open **on the account page before leaving** [doc]. L13b and L14a therefore end success in one `onSignedIn(claimable)` function that L14b extends. Until L14b, it navigates whatever `claimable` is | architect |
| **P9** | **The session-expired arrival (A4G)** | (a) `?reason=session-expired` on the login URL. (b) The same, plus a `returnTo` | **(a).** The query value is matched against a closed list, and any other value shows nothing. If a `returnTo` is added later, it is a closed allow-list (`/{locale}/d/{id}` only, same origin, no `//`, no `\`, no scheme). The Batch-2 "session expired" **sheet** and its unsaved-edits question stay with L14b | architect |
| **P10** | **The Turnstile loading placeholder** | (a) A `loadingContent` prop on `TurnstileWidget`, shown until `render` returns. (b) CSS only: a placeholder behind the iframe | **(a).** (b) depends on Cloudflare's iframe being opaque [ven]. (a) touches a file that was security-reviewed in L13a, so it is security-reviewed again | architect |
| **P11** | **The password counter "8 / 12"** | (a) Export a counter from the domain (code points after NFKC, as `judgePassword` counts, `password-policy.ts:51-53`). (b) Drop the counter | **(a)** only if the owner wants the counter. `countCharacters` is not exported by `account/index.ts` [src], and a client copy would be a parallel definition of the rule. Client checks call `judgePassword` and `judgeAccountEmail` from `@lemnaria/configurator-domain` directly, so there is one source for the rule | owner (keep the counter?) |
| **P12** | **`Origin: null` on the token pages** | — | `no-referrer` on verify and reset (Amendment D item 4). `isCrossSiteRequest` trusts `Sec-Fetch-Site` when present. Without it, a foreign `Origin` refuses (`cross-site-request.ts:22-28`) [src]. So `Origin: null` from a browser without `Sec-Fetch-Site` is a **permanent `403 cross-site`** on those two POSTs [inf]. Mitigation: the token pages' `fetch` sets `referrerPolicy: "same-origin"` in its init. Per the Fetch spec, a same-origin request under that policy serialises its real `Origin` [ven, from memory; the security reviewer confirms] | security |

### 3.2 Module boundaries and file layout

It follows the contact family's shape (`src/contact/`: screen, form, answer classifier, sender, CSS module) [src] and
plan §3's row for `app/[locale]/account/**` [doc].

| Layer | Files | May import | Must not |
| --- | --- | --- | --- |
| Route shells `apps/web/src/app/[locale]/account/{register,login,forgot-password,verify-email,reset-password}/page.tsx`, `account/[[...unmatched]]/page.tsx`, `account/not-found.tsx`, `app/[locale]/privacy-notice/page.tsx` | One server component each. It reads per request and renders one client screen | `next/headers`, `NONCE_HEADER`, `challenge-page-props.ts`, `src/account/*` | copy, styles, `"use client"` (the room page's shell rule, `configurator/room/page.tsx`) |
| `apps/web/src/lib/server/account/challenge-page-props.ts` (server-only) | `readChallengePageProps(): Promise<{siteKey, nonce}>`. It reads `process.env.TURNSTILE_SITE_KEY` and `(await headers()).get(NONCE_HEADER)`. Calling `headers()` makes the page dynamic, which the nonce requires [doc: next@16.3.8 `content-security-policy.md:181`]. Token pages call `connection()` instead, as the unmatched page does | `server-only`, `next/headers`, `security-headers.ts` | `NEXT_PUBLIC_*` (plan §6) |
| `apps/web/src/account/` (client) | `account-answer.ts` (pure classifier), `send-account-request.ts`, `account-shell.tsx`, `account-form-parts.tsx`, `account.module.css`, one `*-form.tsx` per page, `check-inbox-view.tsx`, `fragment-token.ts`, the existing `turnstile-widget.tsx` | the domain (`judgePassword`, `judgeAccountEmail`, `PRIVACY_NOTICE_VERSIONS`), `useContent`, `clock-time.ts`, `use-keep-focus-above.ts` | `next/link`, `@/i18n/navigation`, `StartLink`, `LocaleMenu`, `document.cookie`, `localStorage`, `sessionStorage` (plan §3, L13b criterion 1) |
| `apps/web/src/i18n/content.ts` | `resolveAccountFieldError(field, code)` and `resolveAccountOutcome(...)` with **literal keys** (ADR 0095 d1), plus the rich-text resolver of P7 | messages | template keys |
| Messages | `ro.json`, `ru.json`, `ro.d.json.ts` (mirrored by hand, `engineering-conventions.md` point 4) | — | — |

**Form rules every account form follows** (acceptance in §3.5):

- `<form method="post" noValidate>`. The submit button is **rendered disabled until hydration**, so a submit before
  hydration can never put a field in a URL. That would otherwise be a GET with the password in the query and the
  fragment dropped [inf].
- `fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(...),
  referrerPolicy: "same-origin" })` to the same-origin paths: `/api/account/register`, `/login`,
  `/password-reset/request`, `/verify-email`, `/password-reset/complete`.
- No abort timer. There is one request in flight per form, as `send-contact-request.ts` does [src].
- Register sends `locale` (the page's locale) and `privacyNoticeVersion: PRIVACY_NOTICE_VERSIONS[0]` (plan flow 1)
  [doc, src].
- Every challenge form sends `turnstileToken`, and after every answer it bumps `resetCount`.
- A password value is never kept across an answer that asks to retype it: A1H, A3C, A4C. It is never echoed into a
  message.

### 3.3 Server answer → UI state (the classifier's contract)

The classifier lives in `account-answer.ts`. It is pure: input `{status, retryAfter, body}`, output a descriptor. It
**classifies on the HTTP status and `body.status` together**, because three different 400 words exist
(`invalid-input`, `invalid-request`, `link-or-password-invalid` / `link-invalid`). Retry-After is parsed with a bound
(1 second up to `LONGEST_DAY_SECONDS`), the way `contactWaitSecondsFrom` does it (`contact-answer.ts:113-121`) [src].

| Answer | Register | Login | Forgot | Verify | Reset |
| --- | --- | --- | --- | --- | --- |
| success | `202 check-inbox` → A2A in-page, showing the address **the person typed** | `200 signed-in` → `onSignedIn(claimable)` | `202` → A5C | `200 signed-in` → A3G, then `onSignedIn` | `200 password-changed` → A6E |
| `400 invalid-input` | per field (§2.2). `locale` and `privacyNoticeVersion` → A8A text | email codes or `PASSWORD_NOT_TEXT` → field errors (no frame; A5D's pattern) | email → A5D | — (never sent) | `field:"password"` → the new-password input (A6B, A6C, or the prompt's copy) |
| domain word | — | `401 invalid-credentials` → A4C (keep the e-mail, clear the password, focus the password) | — | `400 link-or-password-invalid` → A3C (clear, focus) | `400 link-invalid` → A6F |
| `403 challenge-failed` | A1F | A4D | A5E | — | — |
| `429` | A1G (< 600 s: countdown), minutes (≤ 60 min), P5 clock time (> 60 min) | A4E / A4E2 | A5F (+ the long variant) | A3E | A6G |
| `503 unavailable` | A1H | A4F | A5G | A3F | A6H |
| `403 cross-site`, `400 invalid-request`, `413`, `415` | A8A | A8A | A8A | A8A, token variant (D7) | A8A, token variant |
| no answer (fetch threw) | A8B words, in the form | same | same | same | same |
| **anything else below 500** (an unexpected status, a body that is not JSON, an unknown word) | A8A | A8A | A8A | A8A token variant | A8A token variant |
| **an unrecognised answer from 500 up** (a gateway's `502`, a `500` page; amended 2026-10-18, below) | A8A | A8A | A8A | A8B words, in the form; token and password kept | A8B words, in the form; token and password kept |

*Amendment 2026-10-18 (screens-batch logic review).* The classifier gained a class, `platform-failed`, for an
unrecognised answer with status 500 or more. On the two token pages it is told as the row "no answer": the form stays,
the password and the single-use token are kept, and the same button retries; before, it ended the page with the A8A
token variant although nothing said the link was spent, and the hook's own comment said the token stays. Login,
register and forgot-password still show A8A for it, unchanged. A non-JSON answer below 500 stays "anything else".

**On load of a token page.**

- Read `location.hash` **once, behind a ref guard**. Under React Strict Mode the second effect run would otherwise
  see an empty hash and show A3D or A6F [inf].
- Accept `t` only if it matches `^[A-Za-z0-9_-]{43}$`, the token shape (`account-mail-messages.ts:75`) [src].
- Call `history.replaceState(null, "", pathname + search)` before anything else renders. That form is the documented
  one and it integrates with the router [doc: next@16.3.8 `04-linking-and-navigating.md:343-423`].
- Keep the token in a ref, never in state that is rendered and never in a `data-` attribute.
- With no token or a malformed one, show A3D or A6F and **post nothing**.
- **The server's HTML is always the form, with its submit disabled** (criterion 5). It is never A3D or A6F, because
  the server cannot see the fragment. The client switches to A3D or A6F only after reading the hash, so a valid link
  never flashes the error state.

### 3.4 Message keys

Namespaces mirror the surface, with leaves named by job (`engineering-conventions.md` point 2). The keys are
three-level at most. The Romanian is Lot 1's as drafted. Every leaf is **draft until the owner approves it**. M8C's
precedent is "draft copy leaves (not owner-approved; copy lock registered)".

- **`accountShell`**
  - `backToConfigurator` "Înapoi la configurator"
  - `backLabel` (the ‹'s accessible name)
  - `localeMenu` (the chip's name)
- **`accountForm`**
  - Field labels: `emailLabel` "E-mail", `emailPlaceholder` "nume@exemplu.md", `passwordLabel` "Parolă",
    `newPasswordLabel` "Parolă nouă".
  - Password hint and count: `passwordHint` (PWH), `passwordCount` "{count, number} / {min, number}" (P11).
  - Show / hide: `showPassword` "Arată", `hidePassword` "Ascunde", `showPasswordName`, `hidePasswordName` (**gap**).
  - `fieldSummary`: the plural form for "Verifică cele {n} câmpuri marcate.", ICU `one` / `few` / `other`. CLDR puts 0
    in `few`. Whether 20 takes "de" is the owner's call, after the 2026-09-10 "without «de»" precedent.
  - Rate limiting: `rateLimitedMinutes` (`<strong>`), `rateLimitedAt` and `rateLimitedTomorrowAt` (P5),
    `rateLimitedFallback` (**gap**), `retryCountdown` "Încearcă din nou peste {minutes}:{seconds}".
  - Unavailable: `unavailableTitle`, `unavailableBody`, `retry`.
  - Request failed: `requestFailedTitle`, `requestFailedBody`, `requestFailedTokenBody` (**gap**, D7), `reloadPage`.
  - Offline: `offlineTitle`, `offlineBody`.
  - Challenge: `challengeLoading`, `challengeFailed`, `challengeUnavailable`, `challengeWaiting` (**gap**: the
    disabled-submit hint).
  - Check inbox: `checkInboxHelpTitle`, `checkInboxSpam`, `checkInboxNewest`.
- **`accountFieldErrors`**
  - E-mail: `emailRequired`, `emailMalformed`, `emailTooLong`, `emailForbiddenCharacter` (also NOT_TEXT).
  - Password: `passwordTooShort`, `passwordTooLong`, `passwordIsEmail`, `passwordBreached`, `passwordNotText`,
    `passwordRequired` (**gap**).
  - Phone: the six phone leaves (P6), `phoneTooLong` and `phoneForbiddenCharacter` (**gap**).
  - Leaves are keyed by **field and code**, because one code (REQUIRED) is worded per field.
- **`accountRegister`**
  - Page text: `metaTitle` (**gap**), `headerTitle`, `title`, `body`.
  - Phone field: `phoneLabel`, `phonePlaceholder`, `phoneHint`.
  - Legal line: `legal` (`<notice>`), `noticeNewTab` (**gap**).
  - Actions: `submit`, `submitting`, `haveAccount`, `logIn`.
- **`accountCheckInbox`**
  - `headerTitle`, `title`
  - `body` (`<strong>{email}</strong>`), `validity`
  - `retryOrLogIn` (`<link>`), `wrongAddress`
- **`accountLogin`**
  - Page text: `metaTitle`, `title`.
  - Actions: `submit`, `submitting`, `forgot`, `noAccount`, `createOne`.
  - Messages: `invalidCredentials`, `sessionExpired`.
- **`accountForgot`**
  - Page text: `metaTitle`, `headerTitle`, `title`, `body`.
  - Actions: `submit`, `submitting`, `remembered`, `logIn`.
  - Sent state: `sentTitle`, `sentBody`.
- **`accountVerify`**
  - Page text: `metaTitle`, `headerTitle`, `title`, `body`.
  - Actions: `submit`, `submitting`.
  - Messages: `invalid` (`<link>`), `confirmedTitle`, `confirmedBody` (**to rewrite**, D6).
- **`accountReset`**
  - Page text: `metaTitle`, `headerTitle`, `title`, `body`.
  - Actions: `submit`, `submitting`.
  - Changed: `changedTitle`, `changedBody`, `logIn`.
  - Link invalid: `linkInvalidTitle`, `linkInvalidBody`, `requestNewLink`.
- **`accountNotFound`**: `title`, `body`, `back`.
- **`privacyNotice`**: `metaTitle`, `title`, `placeholder` (**owner copy**, P4).

**Every new leaf touches** `ro.json`, `ru.json`, `ro.d.json.ts`, and (once approved) the copy lock and the golden
hashes (`engineering-conventions.md` point 4). Under D12 the test files are **not** edited this round. Plan §9 (a)
already lists them as turning red [doc].

### 3.5 Waves

**Common to every wave.**

- **Tier:** "Full + security + visual" under D12. That is logic, clean-code and security reviewers in parallel, on a
  diff whose plan §8 verification is green, plus a `configurator-verify-visual` pass for any wave with a page.
- **QA:** none (D12).
- **Verification**, each exit code quoted through `rtk proxy` by the implementer and again by the coordinator:
  - `pnpm format:check`
  - `pnpm gate:boundary`
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm --filter @lemnaria/web build`
- **Visual method:**
  - a **production build** served on `E2E_PORT` 4320, because CSP and Turnstile must not be judged on `next dev`;
  - viewport **exactly 390 × 844**, then 1920 × 1080;
  - every state reached by mocking `/api/account/*` with Playwright's `page.route`, because migrations `0012`–`0015`
    are unapplied (plan §0) [doc];
  - the Turnstile site key is the owner's test key in `apps/web/.env.local` (O7). No agent sets, reads or prints it
    (plan §6).

**QA reading:** none this round (ADR 0172 D12).

**Reviewer reading, common.** These lines are pasted into every reviewer dispatch, with each wave's own row added.

- **Security:**
  - this file §2.1, §3.1 P1–P3, P8–P12, §3.2, §3.3;
  - plan §5 (common order, flows 1–3, 6, 7);
  - plan L8 conditions (fragment, outbox);
  - plan L13a obligations M1, L3;
  - ADR 0161 Amendment D;
  - ADR 0172 D4, D5, Amendment A;
  - `proxy.ts`, `security-headers.ts`, `cross-site-request.ts`.
- **Logic:**
  - this file §2.1, §2.2, §3.3;
  - `account-responses.ts`, `account-request.ts`, and the orchestration file named by the wave;
  - `contact-answer.ts` (the pattern).
- **Clean code:**
  - `engineering-conventions.md` *Code and domain boundaries*, *UI and content*, *Localised copy*;
  - `~/.claude/rules/clean-code.md` is the owner's global rule.
- **Visual:**
  - this file §1, §2.6, §2.9, §2.10;
  - the Lot 1 and ContBlocks markup as text;
  - `browser-and-visual-qa.md`;
  - ADR 0104 (mock-ups are the chrome spec);
  - `contact.module.css`, the shipped pattern.

| Wave | Items (≤ 5) | Production files (≤ 5) | Reading (implementer) | Depends on |
| --- | --- | --- | --- | --- |
| **L13b.1 — the shared kit** | 1. `account-answer.ts`: the §3.3 classifier and the bounded Retry-After → wait class (countdown / minutes / clock time).<br>2. `send-account-request.ts`: one POST helper for the five paths; no answer → `unanswered`.<br>3. `account-form-parts.tsx`: TextField, PasswordField (show / hide), FormNotice (err / warn / info / ok, live region, focus target), OutcomeHero, HelpList, SubmitButton (busy, countdown, hydrated gate).<br>4. `account.module.css` (tokens from `globals.css`; 44px targets).<br>5. `content.ts`: the two resolvers and the P7 rich resolver. Copy for the kit's leaves | `account/account-answer.ts`, `account/send-account-request.ts`, `account/account-form-parts.tsx`, `account/account.module.css`, `i18n/content.ts` (modified) | This file §2.1–2.7, §3.1 P5–P7, §3.2–3.4; `account-responses.ts`; `contact-answer.ts`, `send-contact-request.ts`, `contact-form.tsx`, `contact.module.css`; `clock-time.ts`; ADR 0095 d1; `engineering-conventions.md` *Localised copy* | **P5's structure** (whether a clock-time wait class exists; the 600 s and 3600 s thresholds) and **P7**. Wording and P6's namespace land as draft leaves and do not block |
| **L13b.2 — the shell, the challenge props, forgot** | 1. `account-shell.tsx`: mobile header (‹ as `<a href="/{locale}">`, wordmark, title per SB2's answer, a plain-`<a>` locale chip), desktop card.<br>2. `challenge-page-props.ts`.<br>3. `turnstile-widget.tsx`: `loadingContent` (P10), the 300 × 65 reserved slot.<br>4. The forgot page and form (A5A–A5G + the long variant) | `account/account-shell.tsx`, `lib/server/account/challenge-page-props.ts`, `account/turnstile-widget.tsx` (modified), `app/[locale]/account/forgot-password/page.tsx`, `account/forgot-password-form.tsx` | L13b.1's list; `turnstile-widget.tsx`; `proxy.ts:24-36,274-303`; `security-headers.ts`; plan flow 6; ADR 0161 Amendment D | L13b.1 |
| **L13b.3 — register and check-inbox, and the notice stub** | 1. The register page and form (A1A–A1H): client checks through `judgePassword` and `judgeAccountEmail`, the body with `PRIVACY_NOTICE_VERSIONS[0]` and `locale`.<br>2. `check-inbox-view.tsx` (A2A, "Am greșit adresa" back to the form with the e-mail kept).<br>3. The P4 notice stub.<br>4. The P11 counter, if the owner keeps it (one domain export, Full review) | `app/[locale]/account/register/page.tsx`, `account/register-form.tsx`, `account/check-inbox-view.tsx`, `app/[locale]/privacy-notice/page.tsx` (+ `packages/configurator-domain/src/account/index.ts` if P11 (a)) | L13b.2's list; plan flow 1; `register-account.ts`; `account-fields.ts`; `password-policy.ts`; ADR 0172 D1, D2 | L13b.2, P4, P11 |
| **L13b.4 — login and the shared 404** | 1. The login page and form (A4A–A4F, invalid-input per §3.3), `onSignedIn(claimable)` → `location.assign` (P8).<br>2. `account/not-found.tsx` + `account/[[...unmatched]]/page.tsx` (optional catch-all, so the bare `/{locale}/account` also reaches A8C;  `connection()` as the existing unmatched page).<br>3. **Conditional:** the criterion 13 probe on a built server. If a percent-encoded account path is served, `proxy.ts` refuses a path whose segments differ once decoded, mirroring `hasMisspelledLocalePrefix` (`proxy.ts:202-211`) | `app/[locale]/account/login/page.tsx`, `account/login-form.tsx`, `app/[locale]/account/not-found.tsx`, `app/[locale]/account/[[...unmatched]]/page.tsx` (+ `proxy.ts`, only if item 3 triggers) | L13b.3's list; plan flow 3; `sign-in.ts:80-120`; ADR 0172 Amendment A; `app/[locale]/[...unmatched]/page.tsx` | L13b.3 |
| **L14a.1 — the fragment and the confirm page** | 1. `fragment-token.ts`: read once, shape check, `replaceState`, ref-held.<br>2. The verify page (`connection()`) and form (A3A–A3G, the D7 token variant, P3 (b) chip hidden), `onSignedIn` after A3G | `account/fragment-token.ts`, `app/[locale]/account/verify-email/page.tsx`, `account/verify-email-form.tsx` | The L13b reading; plan flow 2; L8 conditions (fragment); `verify-email.ts`; `account-mail-messages.ts:75,165-176`; ADR 0161 Amendment D item 4; P12 | L13b.4 |
| **L14a.2 — reset and the session-expired arrival** | 1. The reset page and form (A6A–A6H; `newPassword` sent, `field:"password"` shown on the new-password input).<br>2. A4G: `?reason=session-expired`, matched against a closed list, shows the info notice on login (P9) | `app/[locale]/account/reset-password/page.tsx`, `account/reset-password-form.tsx`, `account/login-form.tsx` (modified) | L14a.1's list; plan flow 7; `reset-password.ts:55-60,176-210` | L14a.1 |
| **W-doc** (scribe, no code) | `docs/design/README.md` lists the two Lot 1 files and the `A`/`DA` frame IDs. The plan §7 amendment (§3.0). P1–P12 rulings | docs only | §3 here | the rulings |

**Acceptance.** Each wave owns the criteria for its pages. A criterion stated "for every account page" binds each wave
for the pages it adds.

1. **The criteria carried over from plan L13b.**
   - No client code reads `document.cookie`.
   - No account value is in `localStorage` or `sessionStorage`.
   - Every visible string comes from the catalogue, in both locales.
   - The reviewer greps the `src/account/` diff for `document.cookie`, `localStorage` and `sessionStorage`. It must
     find **zero hits**.
2. **M1. No account page renders a client-side navigation.**
   - The `src/account/` and `app/[locale]/account/` diff imports neither `next/link`, `@/i18n/navigation`,
     `StartLink` nor `LocaleMenu`.
   - Every link into, out of and between account pages is an `<a href>` or `location.assign`.
   - In the browser, following each link produces a document request: Playwright sees a `document`-type request and
     a new CSP header.
3. **The Turnstile frame appears only on the three challenge pages.**
   - On verify and reset, no request to any origin but the app's is made. Visual check: a network log with zero
     third-party requests.
   - `frame-src` there is `'none'` (Amendment D item 1).
4. **The fragment.**
   - After a verify or reset page loads with `#t=<43 chars>`, `location.hash` is empty before the first paint the
     person can interact with.
   - Back does not restore the fragment.
   - The token appears in no `href`, no attribute and no request except the one POST body.
   - With `#t=` missing, empty, 42 or 44 characters, or carrying a character outside `[A-Za-z0-9_-]`, the page shows
     A3D or A6F and sends **no** request.
   - The same holds under React Strict Mode in development: no false A3D on the second effect run.
5. **No field value in a URL, ever.**
   - Submitting any account form before hydration, by pressing Enter in a field, causes no navigation whose URL holds
     a field value.
   - The submit is disabled until hydrated, and the form is `method="post"`.
6. **Enumeration.**
   - For register and forgot, the success view does not depend on anything but `202`.
   - For login, `401` shows exactly one message, and the e-mail field keeps its value.
   - No account page renders text that the server's answer could vary by address. The only server-varied inputs are
     the status, `body.status`, `issues[].field` and `issues[].code`, and `Retry-After`.
7. **The token is spent on every answer.**
   - After **every** answer to a challenge form (`202`, `400`, `401`, `403`, `429`, `503`, no answer), `resetCount`
     increases.
   - The submit stays disabled until a new token arrives.
   - A missing site key or nonce shows "Verificarea nu se poate încărca acum…" and the submit never enables.
8. **Rate limits.**
   - `Retry-After` is parsed as a whole number from 1 to `LONGEST_DAY_SECONDS`. Anything else (absent, `0`, `-1`,
     `1.5`, `86401`, text) shows the fallback leaf and **no number**.
   - Below 600 s there is a countdown that re-enables the submit at 0. From 600 to 3600 s it is "peste {⌈s/60⌉} min".
     Above 3600 s it is the P5 clock time.
   - **Property (fast-check, owed):** for every s in [1, 86400] the shown time is never earlier than now + s.
9. **The reset field mapping.** A `400 invalid-input` whose issue is `{field:"password"}` puts its message on the
   new-password input, never on a form-level notice. `link-invalid` never shows a password message.
10. **Register's body** always has `privacyNoticeVersion === PRIVACY_NOTICE_VERSIONS[0]` and `locale` equal to the
    page's locale. The page holds no other notice version.
11. **The 44 px rule.** At 390 × 844 every interactive element (‹, chip, toggles, links, buttons) has a hit box of at
    least 44 × 44. The visual reviewer measures them with `getBoundingClientRect`.
12. **Layout.**
    - At 390 × 844, in Romanian and in Russian, every state of §1 is reachable by scrolling.
    - No field, message or slot sits under the action bar when it has focus.
    - No title or button label is truncated.
13. **L3 (L13a obligation).** On a built server, `/ro/%61ccount/login` and every other account path whose segments
    differ once decoded answer **`404`**, as the locale segment already does (plan L13a obligation L3) [doc]. If the
    probe shows such a path being served, L13b.4 adds the conditional `proxy.ts` fix. **Probed: yes** (2026-10-18, a
    fresh `next build` of HEAD `9b7575f5`, `next start` on a free port, `curl`): `/ro/%61ccount/verify-email`,
    `/ro/account/%76erify-email`, `/ro/account/verify%2Demail`, `/ro/%61ccount/login`, `/ro/account/%6Cogin`,
    `/ro/account/forgot%2Dpassword` and `/ro/%61ccount/reset-password` all answered **`404`** (the written
    `/ro/account/verify-email`, `login`, `forgot-password` and `reset-password` answered `200`). **No `proxy.ts`
    change was needed.** Observed, not inferred.
14. **Sign-in success** leaves through one `onSignedIn(claimable)` path and a full document load to `/{locale}`.
    `?reason=` values outside the closed list render nothing. The session-expired note shows only until the person's
    first submit.
15. **No router actions on a token page.** `/account/verify-email` and `/account/reset-password`
    make no `router.refresh`, `router.replace`/`push`, server action or soft navigation of their own, and L14b's claim
    dialog, opened from the verify page, makes none either. Reason, observed on a production build of `9b7575f5`: the
    Next router takes its `canonicalUrl` from `location.href` while it still holds `#t=`, and router actions
    rewrite the address from that copy, so a `router.refresh()` or `router.replace(pathname)` put `#t=<token>` back
    into the address bar and the history entry although the page had removed it. `fragment-token.ts` now tells the
    router, once, through the patched `history.replaceState` (one internal `ACTION_RESTORE`; observed on the production build: no network request in the 800 ms after the page was interactive, and the page was not reloaded), and that ends the copy
    `router.refresh()` uses (re-probed: the address stays clean). It does **not** end the router's second copy, the
    route cache entry learned at hydration (`discoverKnownRoute`, canonicalUrl with the fragment), which a soft
    navigation to the same path still writes back (re-probed with `router.replace(pathname)`: the fragment returns;
    `router.push` and a `Link` use the same entry by reading `navigation.js`, not probed). Nothing public clears that entry, so this rule is the defence for that class.

### 3.6 Review tiers

| Wave | Security | Logic | Clean code | Visual (390 × 844 first) |
| --- | --- | --- | --- | --- |
| L13b.1 | yes (classifier, no-echo, P7 rich text) | **yes (core)** | yes | no page: skipped, recorded |
| L13b.2 | **yes** (widget change, nonce, M1) | yes | yes | yes, A5 + A7 states |
| L13b.3 | **yes** (enumeration, notice version) | yes | yes | yes, A1, A2, stub |
| L13b.4 | yes | yes | yes | yes, A4, A8C |
| L14a.1 | **yes** (fragment, P12) | yes | yes | yes, A3, plus the network log |
| L14a.2 | **yes** | yes | yes | yes, A6, A4G |

### 3.7 E2E needs: owed, not in these waves (D12)

These belong to plan §9 "L13a–L14b (e2e and visual)" and need:

- **Turnstile test keys.** The always-pass and always-fail keys [ven, L0 re-reads them] go in `apps/web/.env.local`,
  set by the owner.
- **The server honours a test secret only on a loopback public origin**, which needs `LEMNARIA_E2E_FAKE_MAIL=1`
  (plan §6, amended 2026-10-18) [doc].
- **The outbox reader gap.** A register → mail → link e2e needs a reader of the fake customer sender's `sent` list.
  The factory builds a fresh fake, so the outbox is unreachable today (plan *Review record*) [doc]. The reader must be:
  - gated by `FAKE_MAIL_FLAG`;
  - absent from a production build;
  - `404` in production (L8 condition) [doc].

  It is its own wave, Full and security.
- **Migrations `0012`–`0015` applied** on the test database, which is the owner's step.
- **Cases owed:**
  - the fragment cleared;
  - criterion 4's malformed-token sweep;
  - Turnstile in test-key mode (pass and fail keys);
  - CSP unchanged off account paths;
  - criterion 8's property;
  - register → confirm → (L14b) claim → open in a second context;
  - the catalogue tests of plan §9 (a).

### 3.8 Risks

| Risk | Response |
| --- | --- |
| No tests (D12). A wrong mapping in the classifier passes review | The classifier is pure and isolated (L13b.1) with a logic reviewer. Criterion 8's property is the first test owed |
| The Turnstile CSP facts are implementer-cited, not observed (Amendment D item 2) | The visual pass on a production build with a test key is the first observation. Launch gate 5 needs a real key on Preview [doc] |
| P7 is the first rich-text use; the catalogue-parity test may not understand tags | Checked in L13b.1 by reading the parity test. If it fails, the test is updated in the tests round, never deleted (ADR 0152) |
| P3 (a) loses typed values on a language switch, against prompt 0.3 | The owner accepts or rules otherwise (O5) |
| Copy approved late, so the copy lock lags | M8C precedent: register the leaves as drafts. The waves do not wait for approval, but the milestone close does |
| Lot 1 frames clip long states, so the visual "match" is judged on partial frames | §2.9. The reviewer judges order, tokens and components, not pixel height |

### 3.9 What must come from the owner

| # | Item | Blocks |
| --- | --- | --- |
| O1 | Approve the Lot 1 Romanian copy, including the extras in §1 and the rewrites D6 and D7. A native speaker checks the Russian (SB9) | the copy lock; milestone close |
| O2 | P5: the long-wait wording. The structure is the architect's; the wording lands as a draft | O1 (copy lock), not L13b.1 |
| O3 | P6: the phone-error wording (contact's locked copy or Lot 1's), and the three missing phone codes | O1 (copy lock), not L13b.1 |
| O4 | P4: the privacy-notice stub's route name and sentence. Accept the new-tab behaviour | L13b.3 |
| O5 | P3: accept that the language switch loses typed values (against prompt 0.3), and that the chip is hidden on A3 and A6 | L13b.2, L14a.1 |
| O6 | P11: keep the "8 / 12" counter? | L13b.3 |
| O7 | Put Cloudflare's test site key (and, for e2e, the test secret with a loopback origin) in `apps/web/.env.local`. Agents never touch it | visual passes |
| O8 | A2A's open question: a "Retrimite" button would be a new server route. Default: none | — |
| O9 | Keep the single file name `Lemnaria Cont Lot 1.dc.html` (prompt D1)? | W-doc |
| O10 | Whether D12 (no tests) extends to the screens. Default: yes, as ruled for "this round" | the tier line |
| O11 | Send §4's list to Claude Design, or accept the port-side fixes listed there | — |

The **wave regrouping (§3.0)** and P1, P2, P7–P10 and P12 are the architect's or coordinator's to rule. They are not
owner questions.

---

## 4. Send back to Claude Design

**No screen is unusable.** "Before" means it must be answered before the named wave. The others the port can fix
with owner-approved copy, and they go back so that later batches stop repeating them.

| # | Defect or question | Frames | When |
| --- | --- | --- | --- |
| SB1 | Four touch targets under 44 px: the mobile ‹ (40 × 40), the mobile RO chip (~25 px tall), the bottom-bar link (`min-height:40px`), the desktop chip (`height:40px`) | header and bar of every frame; desktop header | port-side fix; tell them for Batches 2–3 |
| SB2 | The mobile header title is truncated with an ellipsis, which breaks the 30% rule for RU. Drop the header title (the screen title carries it), or wrap it | all mobile frames | **before L13b.2** |
| SB3 | Draw the login field-error state (`400 invalid-input`: `MALFORMED` and the others) | A4 | port-side (A5D's pattern) |
| SB4 | Draw A5F's long-wait variant; the reset-mail bucket is a UTC day | A5F | port-side, with P5 |
| SB5 | "Prea multe încercări azi. Încearcă din nou mâine." is false between local midnight and 02:00 or 03:00 (the UTC reset). Redraw with a clock time ("după ora {time}", "mâine, după ora {time}"), and state the 10–60 minute rule | A1G2, A4E2 | the structure before L13b.1 (architect, P5); the wording before O1 |
| SB6 | A3G promises "bucătăriile tale". That page does not exist in this batch | A3G | **before L14a.1** |
| SB7 | A8A's "Reîncarcă pagina" on A3 and A6 destroys the token. Give the token pages a variant ("Deschide din nou link-ul din e-mail") | A8A in A3/A6 context | **before L14a.1** |
| SB8 | A8B is a full-screen state, yet promises the values stay. Draw it as an in-form notice | A8B | port-side |
| SB9 | RU: masculine past tense (A3 "подтвердил", A8 "потерял / написал", A5 "Забыл"); A5's RU "error" row holds the success text | RU cards A3, A5, A8 | before O1 |
| SB10 | The countdown sits only in disabled-button colours (2.18:1). Put it in the notice, or in a readable colour | A1G, A3E, A4E, A5F, A6G | port-side |
| SB11 | One rule for "submit before Turnstile passes". A1A disables it, but A1D, A1H, A4A, A4C, A4F, A5A and A5G draw an unsolved widget beside an enabled button. Add the hint for the disabled state | listed | **before L13b.2** |
| SB12 | Missing copy: empty password (login, verify); phone `TOO_LONG` / `FORBIDDEN_CHARACTER` / `NOT_TEXT`; generic text for the locale and notice-version codes; the `Retry-After` fallback; the show / hide accessible names; page `<title>`s; the privacy link's new-tab hint; all plural forms of the field summary | — | before O1 |
| SB13 | The language chip on A3 and A6: draw whatever is ruled in P3 (hidden this round) | A3, A6 | after O5 |
| SB14 | A1's "Ai deja cont?" link appears only on A1A and A1B | A1C–A1H | port-side |
| SB15 | A7 states 2 and 3 are Cloudflare's own UI inside its frame. Mark them as illustrative, so no one tries to build them | A7A | port-side |
| SB16 | Optional: the "Am greșit adresa" return state; the A1F slot "cannot load" in context (only in A7) | A2, A1 | — |

---

## 5. Summary

- Lot 1 delivers **all eight requested screens and every state listed per screen**. The one exception is A5F's
  long-wait variant, which the prompt's common table implies. That is 44 mobile frames and 13 desktop frames.
  Two extra IDs (A1G2, A4E2) split the "mâine" variants. **No screen is unusable.**
- Enumeration wording, the Turnstile placement (A1, A4, A5 only), the plain token pages, the no-consent-tick rule and
  the no-composition-rule rule all **pass**. The `#6b5e52` hints (5.91:1) and `#8f2020` errors (8.05:1) pass.
- Gaps against the real server:
  - login's `400 invalid-input` is not drawn;
  - A5 has no long-wait variant;
  - three phone codes and the notice-version codes have no copy;
  - the reset error field `password` is not the body member `newPassword`.
- Defects:
  - four touch targets under 44 px;
  - the header truncates RU titles;
  - "mâine" is wrong for a UTC reset;
  - A3G promises a page that does not exist;
  - A8A's reload destroys the token;
  - RU uses masculine past tense;
  - the countdown is at 2.18:1.
- The port regroups the waves by CSP family: challenge pages (L13b.1–.4) and token pages (L14a.1–.2). Each sub-wave
  has five items or fewer and five production files or fewer. This needs a dated plan §7 amendment.
- The waves ship as **full document loads only** (no `next/link`, `StartLink` or `LocaleMenu`). E-mailed links stay
  locale-prefixed, as they already are, and account paths stay out of `isCustomerPath`.
- Owner items: copy approval, the long-wait wording, the phone wording, the privacy-notice stub, accepting that a
  language switch loses typed values, the counter, and the test keys in `.env.local`.
