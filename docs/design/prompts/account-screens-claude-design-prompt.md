# Claude Design prompt — Lemnaria account screens

> **How to use this file (owner).** It is written to be pasted into Claude Design in pieces, not all at once:
> one run = **Part 0 (shared brief)** + **one batch** (Part 1, 2 or 3). A single paste of everything is likely
> to be truncated or answered shallowly. Attach the three existing mock-up files to every run
> (`docs/design/mockups/Lemnaria Configurator Mobil.dc.html`, `…Desktop.dc.html`,
> `Alegere corp - layouturi.dc.html`). They load a `support.js` that was not copied into the repository, so they
> may not render inside Claude Design; the tokens below are written out in full for that reason.
>
> **Status of the contents.** Batch 1's server words are read from the code on `feat/login-register`
> (`apps/web/src/lib/server/account/account-responses.ts`, the domain's password and field rules) and from
> `docs/milestones/M8B-login-register-plan.md` §5, L13b–L14b. Batches 2 and 3 have **no server contract yet**
> (that plan puts them in later waves); their copy is draft and their API words will be fixed by the wave that
> builds each screen. Owner rulings come from `docs/OWNER_FIXES.md`, Fix 3 (2026-10-17).

---

## Part 0 — Shared brief (paste with every batch)

### 0.1 Product and brand

You are designing the **account screens** for **Lemnaria**, a kitchen manufacturer in Moldova, and its online
**kitchen configurator**. A visitor picks a room shape, enters wall sizes, generates a kitchen or picks a preset,
edits it in 3D, reviews it and sends it to the shop for an offer. The configurator is a **marketing tool**, not
the offer tool: prices are "from" prices; a sales manager builds the exact offer elsewhere.

We are now adding accounts with three roles:

- **Client** (`client`) — registers, sees and reopens the kitchens they made, from any device.
- **Operator** (`operator`) — the manufacturer's sales manager. Sees clients' kitchens (drafts and sent),
  read-only; adds notes; sets the request status. Cannot change a client's kitchen.
- **Administrator** (`administrator`) — everything an operator does, plus staff invitations, the presets
  library, prices, translations and the audit log.

Values that must show in the design: **secure, calm, honest, minimal**. Data held is small (name, e-mail,
optional phone, optional address). No payments. No 2FA, no SMS. GDPR is the standard (Europe first,
Moldova in particular).

### 0.2 Match the existing mock-ups exactly

These screens join an existing design. **Copy its visual language; do not invent a new one.** Match the attached
`Lemnaria Configurator Mobil.dc.html` first (it is the priority surface and covers all five configurator
screens); use `Lemnaria Configurator Desktop.dc.html` for the desktop layout. The closest existing patterns are
**Screen 4 "Contact"** (frames 4A form, 4B validation errors, 4C sending), **5B "Trimiterea a eșuat"** (failure
with retry), **2E bottom sheet** ("Setări globale · material și feronerie", titled "Setări pentru toată
bucătăria") and **2F "WebGL indisponibil"** (a "cannot work here" state).

Carry over the existing caveat badge: **"Paletă provizorie — nu este brandul final"**.

**Tokens (extracted from the mobile mock-up):**

| Role | Value |
| --- | --- |
| Canvas behind frames | `#e7e3da` |
| Screen background | `#faf8f4` |
| Card / raised surface | `#f5f3f0` |
| Selected / chip fill, disabled button fill | `#ece7dd` |
| Hairline border | `#dcd8ce`; inner divider `#e4dfd5` |
| Primary (buttons, step badge, selection border, links) | `#7c5c3d`; hover / dark text on chips `#5a3e25` |
| Text | `#1c1814` (labels, headings), body `#1c1d1f` |
| Secondary text | `#6b5e52`; tertiary `#7d7a72` (only at ≥ 14px bold — it is 4.0:1 on `#faf8f4`); placeholder and disabled text `#a89c8e` |
| Error | `#dc2626` border, "!" dot and field label; error fill `#fdf3f3`; **message text inside the note box `#8f2020`** (`#dc2626` on `#fdf3f3` is 4.44:1, just under AA) |
| Success | `#2d5016` on `#eef1ea`, with a "✓" dot |
| Warning / notice | `#b45309` on `#f7ecdc`, border `#e6cfa8` |
| Skeleton shimmer | `#e2ddd3` / `#e8e3da`, 1.6 s opacity pulse |
| Scrim behind sheets and dialogs | `rgba(28,24,20,.30)` |
| Frame shadow | `0 14px 34px rgba(28,24,20,.09)`; sheet shadow `0 -16px 36px rgba(28,24,20,.18)` |

**Type:** `Helvetica, 'Helvetica Neue', Arial, sans-serif` only. Screen title `700 22px/1.2`, letter-spacing
`-.015em`. Header title `700 15px`. Body `400 13px/1.55` in `#6b5e52`. Field label `700 12.5px` in `#1c1814`.
Input text `400 15px`. Hint under a field `400 11.5px/1.4` — **on account pages use `#6b5e52`** (5.9:1), not
the mock-up's `#7d7a72` (4.0:1), so small text passes WCAG AA. Section eyebrow `700 10.5px`,
letter-spacing `.14em`, uppercase, `#7d7a72`. Numbers use tabular figures.

**Components:**

- **Phone frame:** 390 × 844, radius 26, 1px `#dcd8ce` border, the frame shadow. **Desktop frame:** 1920 × 1080.
- **Header bar (mobile):** 11px 14px padding, bottom border `#e4dfd5`; back chevron "‹" in `#7c5c3d`; title;
  on the right the **language chip** "RO ▾" (`#ece7dd`, border, radius 8, `700 11px`, letter-spacing `.08em`).
  Account pages have no step badge ("1/4"); use the "LEMNARIA" wordmark (`700 15px`, letter-spacing `.22em`,
  uppercase) where the configurator shows the step.
- **Text input:** height 54, padding 0 14, radius 12, 1px `#dcd8ce` border, `#faf8f4` fill. Label above with a
  6px gap; hint below.
- **Input in error:** 2px `#dc2626` border, `#fdf3f3` fill, label turns `#dc2626`, and under it a note box
  (`#fdf3f3`, radius 10, padding 11 12) with a 16px red "!" dot and the message.
- **Primary button:** height 52, radius 12, `#7c5c3d` fill, `#faf8f4` text `700 15px`, full width in the bottom
  action bar. **Secondary / outline:** 1px `#dcd8ce` border, `#6b5e52` text `700 14px`. **Disabled:** `#ece7dd`
  fill, border, `#a89c8e` text. **Small button:** height 38, radius 10, `700 12.5px`.
- **Bottom action bar:** top border `#dcd8ce`, padding 13 18 20, 11px gap; legal line `400 11.5px/1.45`
  `#6b5e52` above the button, links in `#7c5c3d`.
- **Checkbox:** 22 × 22, radius 6, 1px `#dcd8ce` border.
- **Segmented choice:** 48 high, radius 11; selected = 2px `#7c5c3d` border on `#ece7dd`.
- **List card:** `#faf8f4` or `#f5f3f0`, 1px border, radius 15, padding 13, thumbnail 96 × 104 radius 10
  (placeholder = diagonal stripes `#e9e4da` / `#f1ede5`); tags as pills (`#ece7dd`, radius 20, `400 10.5px`).
- **Bottom sheet:** scrim, then a sheet with radius 22 22 0 0, a 40 × 4 grabber, a title `700 18px`, a
  description `400 12px/1.45`, scrolling content, and an action bar.
- **Failure panel (from 5B):** a red "!" dot, a bold title, one honest sentence, a primary "Încearcă din nou"
  and a secondary route; reassurance that nothing was lost.

**Copy tone (from the existing screens and the account e-mails already written):** Romanian, informal "tu",
short, plain, reassuring, never alarming. The words already in use: **"cont"** (account), **"Intră în cont"**
(log in), **"parolă"**, **"Confirmă adresa"**, **"link"**, **"Încearcă din nou"**, **"bucătărie / bucătăriile
mele"**, prices as **"de la … MDL"**. Use the same words so screens and e-mails agree.

**Russian terms already used in the account e-mails** (`apps/web/src/messages/ru.json`, `accountMail`; informal
"ты", as in Romanian) — reuse them in the RU notes:

| RO | RU |
| --- | --- |
| cont | аккаунт |
| Intră în cont | Войти |
| parolă / parolă nouă | пароль / новый пароль |
| Confirmă adresa | Подтвердить адрес |
| link | ссылка |
| Alege o parolă nouă | Выбрать новый пароль |
| adresa de e-mail | адрес электронной почты |

### 0.3 Surfaces and languages

- **Mobile first: 390 × 844 portrait is the priority surface.** Draw every screen and every state at that size.
- **Desktop 1920 × 1080** for every screen of Batch 1 and 2 (a centred column of ~440px for the auth forms on a
  quiet `#e7e3da`/`#faf8f4` page, not a stretched form), and **desktop-first** for Batch 3 (staff work at desks;
  still give each staff screen one mobile frame).
- **Romanian is the source language.** All frames in Romanian. **Russian** is the second shipped language:
  for each screen add a small "RU" note under the frame with the Russian for the title, the primary button and
  the main error, marked **"traducere de lucru — de verificat de un vorbitor nativ"**. Allow about **30% longer
  strings** in every button and message so Russian fits without truncation.
- The language chip is on every account page; switching language keeps what the person typed.

### 0.4 Accessibility (every screen)

- Every input has a visible **`<label>`** (never placeholder-only). Placeholders are examples, not instructions.
- An error is tied to its field (`aria-describedby`) and announced; the field gets `aria-invalid`. A form-level
  error appears in a **live region at the top of the form** and focus moves to it (or to the first invalid
  field) after a failed submit.
- Visible **focus ring** on every interactive element: 2px `#7c5c3d` outline with 2px offset, never removed.
- Touch targets ≥ 44 × 44. Text contrast ≥ 4.5:1: hints in `#6b5e52`, error messages in `#8f2020`, `#a89c8e`
  only for placeholders and disabled text, the warning colour `#b45309` (4.3:1 on its fill) only in bold ≥ 14px.
- Dialogs and sheets: focus moves into them, is trapped while open, Esc closes a dismissible one, and focus
  returns to the control that opened it. Title is the dialog's accessible name.
- Correct `autocomplete`: `email`, `new-password` on register and reset, `current-password` on login and
  confirm, `tel` on phone, `name`, `street-address`. Password fields allow **paste** and password managers, and
  have a **show / hide** toggle ("Arată" / "Ascunde") with an accessible name.
- Loading states keep the button's width, show a spinner plus text ("Se trimite…"), and set `aria-busy`.
- Never rely on colour alone: errors carry the "!" icon and text; success carries "✓".

### 0.5 "Do not" rules (hard constraints)

1. **No third-party script, frame, image or font on the "Confirmă adresa" (verify-email) and "Parolă nouă"
   (reset-password) pages.** No Turnstile widget there, no analytics, no external avatar, no embedded map.
   These pages carry a single-use token. Draw them visibly "plain".
2. **The Turnstile (CAPTCHA) slot appears only on Register, Log in and Forgot password.** Nowhere else.
3. **No e-mail enumeration (signed-out flows A1, A4, A5, and the change-e-mail sheet in A10).** Never write "nu există niciun cont cu această adresă", "adresa este deja
   înregistrată", "contul nu este confirmat", "parolă greșită" as distinct messages. Each flow has **one**
   neutral answer, given below; design only that one. (Once signed in, "Parola actuală nu este corectă" in A11
   and A13 is fine: the person is already identified.)
4. **No pre-ticked boxes, no hidden consent.** Registration links the privacy notice; it does **not** ask for a
   consent tick (the account is a contract). If marketing is ever added, it is a separate, **unticked**, optional
   box — do not draw one now.
5. **No dark patterns.** No confirm-shaming ("Nu, nu vreau să-mi salvez munca"), no fake urgency, no hidden or
   greyed-out "Not now", no pre-selected destructive choice, no nudges that block the editor. "Mai târziu" /
   "Nu acum" is always as visible as the primary action.
6. **No password composition rules, checklist or strength meter** ("o majusculă, o cifră, un simbol" is wrong
   here). The only rule is length; a breached password is refused by the server.
7. **No "account created" or "welcome" on register success.** The answer is the same whether the address is new
   or already has an account: "check your inbox".
8. **No phone verification, no SMS code screens.** The phone is optional and shown as "neverificat".
9. **No social login buttons**, no "Remember me" checkbox (sessions are server-managed), no 2FA screens.
10. **Do not show the role to the client**, and never show staff controls to a client (the server authorises;
    the UI only hides).

### 0.6 Hand-over format

What `docs/design/README.md` states: mock-ups are delivered as **`.dc.html` canvas files** placed in
`docs/design/mockups/`; milestones cite **frames by short ID** (mobile `2A`, `4B`; desktop `D2A`). Each frame in
the existing files has the ID badge, a Romanian caption ("Contact · erori de validare"), the route under the
screen title (`/configurator/contact`), and a short explanatory note under the frame. Follow the same.

**Proposed** (not yet a project rule; the owner may rename):

- Files: `docs/design/mockups/Lemnaria Cont Mobil.dc.html`, `docs/design/mockups/Lemnaria Cont Desktop.dc.html`
  for Batches 1–2, and `docs/design/mockups/Lemnaria Personal Desktop.dc.html` for Batch 3.
- Frame IDs prefixed with **`A`** so they cannot collide with the existing mobile `1A–5B` and desktop `D…` frames: screens are
  numbered **A1–A24** below, and each state is a letter, e.g. **`A1A`, `A1B`** on mobile and **`DA1A`, `DA1B`** on
  desktop. One section per screen ("Ecran A1 · Înregistrare", route `/[locale]/account/register`), one frame per
  state.
- Under every frame: the server word it represents (e.g. `202 check-inbox`), the RU note, and any open question.
- All copy as real text (not images), so it can be lifted into the message catalogues (`ro.json`, `ru.json`).

---

## Part 1 — Batch 1: register, confirm, log in, forgot and reset

Routes live under `/[locale]/account/*` (e.g. `/ro/account/login`). These are **full page loads**, separate from
the configurator; each has a quiet way back ("‹ Înapoi la configurator").

**Server words common to every Batch 1 form** (design one state for each; never show the raw word):

| Server answer | When | UI state to draw |
| --- | --- | --- |
| `429 rate-limited` + `Retry-After: <seconds>` | Too many attempts from this network or for this address | Form-level notice: **"Prea multe încercări. Încearcă din nou peste {minute} min."** When the wait is long (the daily limit resets at 00:00 UTC, so it can be up to ~24 h): **"Prea multe încercări azi. Încearcă din nou mâine."** Submit disabled with a countdown only for waits under 10 min. Same words whatever the address. |
| `503 unavailable` | Something of ours (or Cloudflare's check, or the mail/limiter service) cannot be reached; nothing was changed | 5B-style panel: **"Serviciul nu este disponibil acum"** — "Nu am schimbat nimic. Încearcă din nou în câteva minute." + "Încearcă din nou". Keep the typed values (never the password). |
| `403 challenge-failed` | The CAPTCHA was not passed | Under the Turnstile slot: **"Verificarea anti-robot nu a reușit. Încearcă din nou."** The widget resets. |
| `403 cross-site` | Request came from another site | Generic: "Cererea nu a putut fi trimisă. Reîncarcă pagina și încearcă din nou." (rare; one shared frame is enough) |
| `400 invalid-input` + `issues:[{field, code}]` | Fields the person can correct | Per-field errors (codes listed per screen). Never repeats the value. |
| `400 invalid-request`, `413 body-too-large`, `415 unsupported-media-type` | Malformed request (a bug, not a person) | Same generic text as `cross-site`. One shared frame. |
| Offline / network dropped | No answer at all | As 5B: "Conexiunea s-a întrerupt. Nu ai pierdut nimic din ce ai scris." + "Încearcă din nou". |

**Field error codes and Romanian messages** (shared by register, reset and the profile in Batch 2):

| Field | Code | Message (RO) |
| --- | --- | --- |
| email | `REQUIRED` | Scrie adresa de e-mail. |
| email | `MALFORMED` | Adresa nu pare corectă. Verifică „@” și domeniul (ex.: nume@exemplu.md). |
| email | `TOO_LONG` | Adresa este prea lungă. |
| email | `FORBIDDEN_CHARACTER` / `NOT_TEXT` | Adresa conține caractere care nu sunt permise. |
| password | `PASSWORD_TOO_SHORT` | Parola trebuie să aibă cel puțin 12 caractere. |
| password | `PASSWORD_TOO_LONG` | Parola poate avea cel mult 128 de caractere. |
| password | `PASSWORD_IS_EMAIL` | Parola nu poate fi adresa ta de e-mail. |
| password | `PASSWORD_BREACHED` | **Această parolă apare în scurgeri de date publice, așa că nu e sigură. Alege alta** — de exemplu o frază din câteva cuvinte. (Do not imply the person was hacked.) |
| password | `PASSWORD_NOT_TEXT` | Parola nu a putut fi citită. Scrie-o din nou. |
| phone | `PHONE_MOLDOVAN_INCOMPLETE` | Numărul pare incomplet. Un număr din Moldova are 9 cifre (ex.: 069 123 456). |
| phone | `PHONE_MOLDOVAN_TOO_MANY_DIGITS` | Numărul are prea multe cifre. |
| phone | `PHONE_MOLDOVAN_SECOND_ZERO` | După 0 urmează codul operatorului, nu încă un 0. |
| phone | `PHONE_INTERNATIONAL_INCOMPLETE` | Numărul internațional pare incomplet. |
| phone | `PHONE_INTERNATIONAL_TOO_MANY_DIGITS` | Numărul internațional are prea multe cifre. |
| phone | `PHONE_FORMAT_UNRECOGNISED` | Nu recunoaștem formatul. Scrie numărul cu prefixul țării (ex.: +373 69 123 456). |
| locale | `UNKNOWN_LOCALE` | (Not a person's error; show the generic text.) |

Password rules shown to the person (one line, under the field, before they type): **"Cel puțin 12 caractere.
Poți folosi o frază; spațiile sunt permise."** A live character count is fine ("8 / 12"); a strength meter is
not. Client-side checks mirror only length and "not the e-mail"; the breach check is the server's.

### A1 — Register ("Creează un cont") · `/[locale]/account/register`

- **Purpose:** create a client account so kitchens open from any device.
- **Fields:** E-mail (required); Parolă (required, show/hide, the length hint); Telefon (optional), labelled
  **"Telefon (opțional, neverificat)"** with hint "Îl folosim doar ca să te putem suna despre oferta ta. Nu îl
  verificăm prin SMS."; the **Turnstile slot**.
- **No** name or address here (they belong to the profile, later). **No** "repeat password" field (show/hide
  replaces it).
- **Legal line above the button:** "Prin crearea contului accepți ca datele tale să fie prelucrate conform
  [Notei de confidențialitate]. Personalul Lemnaria poate vedea bucătăriile salvate în cont." The notice text is
  the owner's legal adviser's; draw the link, not the text.
- **Buttons:** primary "Creează contul"; secondary link "Ai deja cont? Intră în cont".
- **States to draw:** A1A empty; A1B filled, valid; A1C field errors (password too short + phone incomplete);
  A1D `PASSWORD_BREACHED`; A1E sending ("Se creează…"); A1F Turnstile slot loading / failed
  (`challenge-failed`); A1G rate-limited (short wait, and the "mâine" variant); A1H unavailable.
- **Turnstile slot:** a 300 × 65 box (the widget's usual size; to be checked against Cloudflare's docs) above the button, light theme, with a reserved
  placeholder while it loads ("Se verifică dacă ești om…"). If it cannot load: "Verificarea nu se poate încărca
  acum. Încearcă din nou mai târziu." and the submit stays disabled.

### A2 — Check your inbox ("Verifică-ți e-mailul") · after register

- **Server word:** `202 check-inbox`. **Identical** for a new address, an unconfirmed one and one that already
  has an account (that person receives an "ai deja un cont" e-mail instead).
- **Copy:** title "Verifică-ți e-mailul"; body **"Dacă datele sunt corecte, ți-am trimis un e-mail la
  {adresa}. Deschide link-ul din el și introdu parola ca să confirmi adresa."** + "Link-ul este valabil 24 de
  ore." Do **not** say "contul a fost creat".
- **Help block ("Nu a ajuns e-mailul?"):** "Verifică folderul Spam sau Promoții." · "Folosește cel mai recent
  e-mail: un link nou îl anulează pe cel vechi." · "Poți încerca din nou înregistrarea cu aceeași adresă, sau
  [intră în cont] dacă ai confirmat deja." There is **no "resend" button** (no such route exists; if the owner
  wants one, it is a new server route — note it under the frame as an open question).
- **Buttons:** secondary "Înapoi la configurator"; link "Am greșit adresa" (back to A1 with the e-mail
  editable).

### A3 — Confirm e-mail ("Confirmă adresa") · `/[locale]/account/verify-email#t=…`

- **Purpose:** the link from the e-mail lands here; the person re-enters their password to confirm. Success
  signs them in.
- **Plain page:** no Turnstile, no third-party anything (rule 0.5-1). The token is read from the address and
  removed from the address bar immediately; never shown.
- **Fields:** one field only, Parolă (`current-password`, show/hide). Do not show the e-mail address: the page
  does not know it.
- **Copy:** title "Confirmă adresa de e-mail"; body "Introdu parola pe care ai ales-o la crearea contului."
- **Buttons:** primary "Confirmă și intră în cont".
- **Server words:** `200 signed-in` (+ `claimable: n`) → go to the configurator / "Bucătăriile mele" and, if
  `n > 0`, open the **claim dialog** (A17, Batch 2). `400 link-or-password-invalid` → **one** error for
  wrong password, expired, used or replaced link alike: **"Link-ul sau parola nu sunt valabile. Verifică parola
  și folosește cel mai recent e-mail primit de la noi. Dacă ai confirmat deja adresa, [intră în cont]."** Plus
  the common `429` (block limit) and `503`.
- **States:** A3A ready; A3B sending; A3C `link-or-password-invalid`; A3D page opened without a token (same
  copy as A3C, no form); A3E rate-limited; A3F unavailable; A3G success transition (brief "✓ Adresa este
  confirmată").

### A4 — Log in ("Intră în cont") · `/[locale]/account/login`

- **Fields:** E-mail; Parolă (`current-password`, show/hide); Turnstile slot.
- **Links:** "Ai uitat parola?" (to A5), "Nu ai cont? Creează unul" (to A1).
- **Buttons:** primary "Intră în cont".
- **Server words:** `200 signed-in` (+ `claimable`, may open the claim dialog). `401 invalid-credentials` is the
  **only** failure, and it is the same for an unknown address, a wrong password, **and a correct password on an
  unconfirmed account** (in that last case a new confirmation link is sent silently). So the one message must
  cover both: **"E-mailul sau parola nu se potrivesc. Dacă datele sunt corecte, verifică-ți e-mailul: s-ar
  putea să trebuiască întâi să confirmi adresa."** Do not draw an "unconfirmed" state; there is none.
- **States:** A4A empty; A4B sending; A4C `invalid-credentials` (both fields keep the e-mail, clear the
  password, focus the password); A4D `challenge-failed`; A4E rate-limited (short and "mâine"); A4F unavailable;
  A4G "Sesiunea a expirat" arrival variant (when sent here by a `401` elsewhere, see Batch 2): a quiet notice
  above the form "Sesiunea ta a expirat. Intră din nou în cont ca să continui." Note under the frame: **open
  question for the wave** — account pages are full page loads, so how the editor's unsaved changes survive the trip
  to this page is not decided yet; do not promise it in the copy.

### A5 — Forgot password ("Ai uitat parola?") · `/[locale]/account/forgot-password`

- **Fields:** E-mail; Turnstile slot. **Button:** "Trimite link-ul de resetare".
- **Server word:** `202 check-inbox` **always** (known, unknown or unconfirmed address). Success state copy:
  **"Dacă există un cont confirmat cu această adresă, ți-am trimis un link pentru o parolă nouă. Link-ul este
  valabil 30 de minute."** + the Spam hint + "Folosește cel mai recent e-mail."
- **States:** A5A empty; A5B sending; A5C check-inbox; A5D field error (`MALFORMED`); A5E `challenge-failed`;
  A5F rate-limited (same for every address); A5G unavailable.

### A6 — Reset password ("Alege o parolă nouă") · `/[locale]/account/reset-password#t=…`

- **Plain page** like A3: no Turnstile, no third-party anything; the token leaves the address bar on load.
- **Field:** Parolă nouă (`new-password`, show/hide, the length hint). **Button:** "Salvează parola nouă".
- **Server words:** `200 password-changed` → success screen: **"Parola a fost schimbată. Te-am deconectat de pe
  toate dispozitivele, pentru siguranță. Intră în cont cu parola nouă."** + primary "Intră în cont" (no session
  is started). `400 link-invalid` → **"Link-ul nu mai este valabil. A expirat, a fost folosit sau a fost
  înlocuit de unul mai nou. [Cere un link nou]."** `400 invalid-input` → the password codes above (a refused
  password does **not** use up the link; say nothing about the link in that case). Plus `429`, `503`.
- **States:** A6A ready; A6B password too short; A6C `PASSWORD_BREACHED`; A6D sending; A6E password-changed;
  A6F link-invalid (also for a page opened without a token); A6G rate-limited; A6H unavailable.

### A7 — The Turnstile slot (component sheet)

One frame showing the slot in its five states, mobile and desktop: loading placeholder; widget ready (draw a
neutral box labelled "Cloudflare Turnstile" — do not reproduce Cloudflare's branding beyond the label);
passed (✓); failed (`challenge-failed` message); unavailable (no site key / cannot load → submit disabled,
"Verificarea nu se poate încărca acum."). Note under the frame: "Apare doar pe A1, A4, A5."

### A8 — Shared error frames

One frame each for: the generic "Cererea nu a putut fi trimisă" (`cross-site`, `invalid-request`, `413`,
`415`), offline, and a 404-style page for an unknown account path ("Pagina nu există" + "Înapoi la
configurator").

---

## Part 2 — Batch 2: the client's account and the editor pop-ups

> **No server contract yet.** These screens belong to later waves (dashboard, profile, GDPR). The words below
> are draft copy; the wave that builds each screen fixes its API answers. Where a state needs the server, draw
> the generic `unavailable` / session-expired treatment from Batch 1.

**Signed-in control (in the configurator header and the account pages):** an account button next to the RO chip
(initials or a person icon, accessible name "Contul meu") that opens a sheet / menu: the e-mail (truncated),
"Bucătăriile mele", "Profil", "Ieși din cont", "Ieși de pe toate dispozitivele". Signed out, the same place
shows "Intră în cont". Draw both.

**Session expired (applies to every Batch 2 screen):** a `401 unauthenticated` from any call shows a sheet
"Sesiunea a expirat" — "Intră din nou în cont ca să poți salva." (draft; whether unsaved edits survive the
login page is the wave's decision — note it under the frame) +
"Intră în cont" (opens A4 with the A4G notice) + "Mai târziu". Never an error page; never lose edits. A
`403 forbidden` is different: show nothing or "Nu ai acces la această pagină" — never "session expired".

### A9 — "Bucătăriile mele" (My kitchens) · `/[locale]/account/kitchens`

- **Purpose:** every kitchen the client saved; reopen from any device.
- **Card:** thumbnail (the 3D capture), name (generated, e.g. "L 3,2 × 2,4 m · alb mat", renameable), room
  shape and size, "modificată acum 2 zile", price **"de la {n} MDL"**, a **"Trimisă"** badge (success colours)
  when sent to the shop, otherwise "Ciornă".
- **Actions per card:** primary "Deschide"; overflow menu: "Redenumește", "Duplică", "Link de partajare",
  "Șterge" (draft) or "Ascunde" (sent).
- **States:** loading (shimmer cards as 1D); empty ("Nu ai încă nicio bucătărie salvată." + "Începe o
  bucătărie"); list of several (mix of sent and draft); rename inline (field + "Salvează" / "Anulează", errors
  "Scrie un nume" / "Numele este prea lung"); share link sheet (copy link, "Oprește link-ul"); error loading
  (5B panel); session expired.
- **Delete a draft:** dialog "Ștergi bucătăria „{nume}”?" — "Nu o vei mai putea recupera." Buttons "Șterge"
  (destructive, red outline, not pre-focused) and "Anulează" (focused).
- **Hide a sent kitchen (A9·hide warning):** dialog **"Ascunzi o bucătărie trimisă?"** — "Ai trimis deja
  această bucătărie magazinului. Dacă o ascunzi, dispare din lista ta și **nu o vei mai putea edita**. Echipa
  Lemnaria o vede în continuare. Doar personalul magazinului o poate face din nou vizibilă." Buttons "Ascunde"
  and "Anulează". It is **not** a deletion; say so.
- **Desktop:** a grid of cards (3–4 per row).

### A10 — Profile ("Profil") · `/[locale]/account/profile`

- **Fields:** Nume (optional), Adresă / localitate (optional), Telefon (optional, "neverificat"), E-mail (shown,
  with "Schimbă e-mailul"). Save button "Salvează modificările"; success "✓ Salvat".
- **Change e-mail:** a sheet with "E-mail nou" + **"Parola actuală" (required: re-entering the password confirms
  it's you)**; on submit: "Ți-am trimis un link la adresa nouă. Până la confirmare, contul folosește adresa
  veche." (neutral, same wording if the new address is taken).
- **Links from the profile:** Schimbă parola, Exportă datele mele, Șterge contul, Ieși de pe toate
  dispozitivele, Nota de confidențialitate.
- **States:** loading, saved, field errors (phone codes from Batch 1), unavailable, session expired.

### A11 — Change password ("Schimbă parola")

- **Fields:** Parola actuală (`current-password`), Parola nouă (`new-password`, length hint). Button "Schimbă
  parola".
- **Errors:** wrong current password: "Parola actuală nu este corectă."; the new-password codes from Batch 1
  (including `PASSWORD_BREACHED`).
- **Success:** "Parola a fost schimbată. Celelalte dispozitive au fost deconectate." (draft — the wave decides
  whether this device stays signed in).

### A12 — Export my data ("Exportă datele mele")

- **Copy:** "Primești un fișier JSON cu profilul tău, bucătăriile salvate și notele personalului despre ele."
  Button "Descarcă datele". States: preparing ("Se pregătește fișierul…"), ready (download), unavailable,
  rate-limited (same treatment as Batch 1).

### A13 — Delete my account ("Șterge contul")

- **Copy (must be explicit):** "Ștergem profilul, datele de contact, toate bucătăriile (inclusiv cele trimise),
  link-urile de partajare și cererile tale către magazin. E-mailurile deja trimise magazinului nu pot fi
  retrase de sistem. Copiile de siguranță se șterg automat în 14 zile." Then "Această acțiune nu poate fi
  anulată."
- **Confirmation:** re-enter **Parola** (required). No "type DELETE" step; the password is the confirmation. Buttons "Șterge definitiv contul" (destructive) and "Anulează" (focused by default). Offer "Exportă
  datele mele" first, as a link, not a gate.
- **States:** confirm, wrong password, deleting, done ("Contul a fost șters." + back to configurator),
  unavailable.

### A14 — Log out / log out everywhere

- "Ieși din cont": immediate, then a quiet toast "Ai ieșit din cont." on the configurator.
- **"Ieși de pe toate dispozitivele":** confirmation dialog **"Te deconectăm de pe toate dispozitivele, inclusiv
  acesta."** + "Ieși peste tot" / "Anulează". Then land on A4 with "Ai fost deconectat de pe toate
  dispozitivele." Error state: unavailable ("Nu am putut închide sesiunile. Încearcă din nou." — this one fails
  closed).

### A15 — Save / Discard pop-up (in the editor)

- **Trigger:** the person presses "Generează una nouă" / chooses a new preset **while the open kitchen has
  changes not yet in their list**. Not shown when nothing was edited.
- **Bottom sheet (mobile) / centred dialog (desktop):** title "Păstrezi bucătăria curentă?"; body "Poți s-o
  salvezi în lista ta înainte să începi una nouă." Thumbnail + name of the current kitchen. Buttons
  **"Salvează"** (primary), **"Renunță la ea"** (secondary, plain wording — not shaming), and "Anulează"
  (close, stay in the editor).
- **States:** signed-in client; saving; saved ("✓ Salvată în Bucătăriile mele"); error.

### A16 — Unregistered visitor's Save nudge

- **Same pop-up as A15** for a visitor without an account. **On "Salvează" it always says:** "Am salvat
  bucătăria în acest browser. **Fără cont nu o vei putea vedea într-o listă și nici deschide de pe alt
  dispozitiv.** Creează un cont gratuit ca să le păstrezi pe toate." Buttons "Creează cont" (primary) and "Nu
  acum" (equally visible). Never blocks the editor.
- **Occasional nudge (separate frame):** a small dismissible card/banner in the editor, "De ce un cont? Îți
  păstrezi bucătăriile și le deschizi de pe orice dispozitiv." + "Creează cont" / "×". Cadence is the plan's
  (draw it, note "frecvență de stabilit").

### A17 — Claim dialog ("Atașezi bucătăriile din acest browser?")

- **When:** right after confirm (A3) or log in (A4), only if the server says `claimable > 0`. Never on loading
  a design or on Step 1. Never blocks.
- **Content:** "Am găsit **{n} bucătării** făcute în acest browser. Le atașezi contului tău ca să le deschizi de
  pe orice dispozitiv?" + a list of each kitchen (thumbnail, name, date). Warning line: "Odată atașate, rămân în
  contul tău. Dacă acesta nu este calculatorul tău, alege „Nu acum”."
- **Buttons:** "Atașează" (primary), "Nu acum".
- **Server states:** success "✓ {n} bucătării atașate"; `401` → the session-expired sheet; `403` → **no dialog**
  (staff or an unconfirmed account); `429`/`503` → Batch 1 treatments.
- Draw singular and plural ("1 bucătărie" / "{n} bucătării"; RU has three plural forms — note it).

---

## Part 3 — Batch 3: operator and administrator screens

> **No server contract yet**; draft copy. Desktop-first (1920 × 1080), plus one mobile frame per screen. Staff
> sessions idle out after **12 hours**, so the session-expired sheet is common here — draw it once in this
> batch. Every staff read of a client's kitchen and every unhide is **audit-logged**; the UI may say so in a
> quiet line ("Accesul este înregistrat"). Staff accounts are **invited by an administrator**; there is no staff
> self-registration screen.

**Staff shell:** left navigation (desktop) / bottom sheet menu (mobile): "Bucătării clienți", and for
administrators also "Personal", "Presete", "Prețuri", "Traduceri", "Jurnal de audit". A role label in the top
bar ("Operator" / "Administrator"). An operator never sees the administrator items.

### A18 — Clients' kitchens ("Bucătării clienți") — operator and administrator

- **Table / list:** thumbnail, kitchen name, client name, e-mail, phone (with "neverificat"), status, sent date or
  "Ciornă", last change, badges "Trimisă" / "Ciornă" / **"Ascunsă de client"**.
- **Filter:** segmented **"Trimise" / "Ciorne" / "Toate"** (default "Trimise"); search by client e-mail or
  name; status filter (e.g. "Nouă", "Contactat", "Ofertă trimisă", "Închisă" — draft list, owner to confirm).
- **States:** loading (skeleton rows), empty per filter ("Nicio bucătărie trimisă încă."), results, no search
  results, error, session expired. Pagination or "Încarcă mai multe".

### A19 — Kitchen detail, read-only — operator and administrator

- **Content:** a read-only 3D view / large thumbnail with a clear **"Doar vizualizare"** badge (the operator
  cannot edit), the configuration summary (as Screen 3 "Verificare"), price "de la … MDL", client contact block
  with "neverificat" on the phone, sent date.
- **Status:** a select with the statuses above + "Salvează". **Notes:** a list (author, time, text) and an
  "Adaugă o notă" text area (limit shown, "Notele fac parte din datele clientului și apar în exportul lui.").
- **Hidden by client:** a banner "Clientul a ascuns această bucătărie." + **"Fă-o din nou vizibilă"** (staff
  only, with a confirmation; logged).
- **States:** loading, loaded, note saving / saved / error, status saved, unavailable, not found (identical for a
  missing and a forbidden id), session expired.

### A20 — Staff ("Personal") — administrator

- **List:** name/e-mail, role, invited by, status ("Invitație trimisă", "Activ"). **Invite:** a sheet with E-mail
  and Rol (Operator / Administrator) + "Trimite invitația"; neutral success "Invitația a fost trimisă." **Accept
  invitation** page (from the e-mail): set a password (Batch 1 rules), plain page with no third-party scripts.
- States: empty, list, invite errors, invitation expired ("Invitația nu mai este valabilă. Cere una nouă
  administratorului."), unavailable.

### A21 — Presets library ("Presete") — administrator

- **Grid / list** of presets: thumbnail, generated name, shape and size, visible / hidden. Actions: **Ascunde /
  Arată**, **reorder** (drag handle plus "Mută sus / jos" buttons for keyboard users). Empty, loading, error,
  saving order states.

### A22 — Prices ("Prețuri") — administrator

- A table of priced items (material, hardware, extras) with editable price fields in MDL, tabular figures,
  "Salvează modificările" with a summary "Schimbi 3 prețuri" before saving; validation ("Prețul trebuie să fie un
  număr pozitiv"); unsaved-changes warning on leaving.

### A23 — Translations ("Traduceri") — administrator

- Key, Romanian (source), Russian; filter "Doar lipsă"; inline edit with save per row; length warning when RU is
  much longer than RO.

### A24 — Audit log ("Jurnal de audit") — administrator

- Read-only list: when, who (staff), action ("a deschis bucătăria", "a adăugat o notă", "a schimbat statusul",
  "a făcut vizibilă", "a invitat"), which client / kitchen. Filters by person, action, date range. **No edit or
  delete controls anywhere** (append-only). Empty, loading, error states.

---

## Deliverables checklist (for every batch)

- [ ] Every screen and every listed state at 390 × 844, and the desktop frames named above.
- [ ] Frame IDs, Romanian captions, route under the screen title, a note under each frame naming the server word.
- [ ] RU note per screen (title, primary button, main error), marked as a working translation.
- [ ] Focus states drawn on at least one form and one dialog per batch.
- [ ] The "do not" rules of 0.5 respected; Turnstile only on A1, A4, A5; A3 and A6 visibly plain.
- [ ] Copy as live text, ready to copy into `ro.json` / `ru.json`.
