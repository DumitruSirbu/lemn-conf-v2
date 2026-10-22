# Claude Design prompt — Lemnaria account screens, Lot 2 (client side)

> **For the owner.** Paste this whole file as **one** Claude Design run. Part 0 is the shared brief, revised after
> the Lot 1 review, and is identical in the Lot 3 prompt. Attach `Lemnaria Cont Lot 1.dc.html`, `ContBlocks.dc.html`,
> `Lemnaria Configurator Mobil.dc.html` and `…Desktop.dc.html`. It replaces Part 2 of
> `account-screens-claude-design-prompt.md`. Sources: Lot 1 review §2 and SB1–SB16, `OWNER_FIXES.md` Fix 3,
> ADR 0172 D7–D9 + Amendment B, plan §12 / L14b, privacy-notice draft §8, the built account routes.

## Part 0 — Shared brief (identical in the Lot 2 and Lot 3 prompts)

### 0.1 Product, roles, values

**Lemnaria** is a kitchen manufacturer in Moldova. Its online **configurator** works like this: pick a room shape,
enter wall sizes, generate a kitchen or pick a preset, edit it in 3D, review it, send it to the shop. It is a
**marketing tool**, not the offer tool. Prices are "de la … MDL". A sales manager builds the exact offer in another
tool. Accounts have three roles. Each role is a set of capabilities, and the server checks every action:

- **Client.** Holds `design.read.own` and `design.edit.own`, and is the only role that does. A client keeps **every
  kitchen they generated** (no version history inside a kitchen) and opens it from any device.
- **Operator** (the sales manager). Holds `design.read.any`, `contact.read`, `contact.update-status`, `note.write`
  and `design.unhide`. Sees **all** clients' kitchens, drafts included, **read-only**. Adds notes. Sets the status
  of a sent request. Unhides a kitchen a client hid. **Never edits a kitchen.**
- **Administrator.** Holds every capability **except** the client's two. That is everything the operator holds,
  plus staff (`user.manage`), presets (`preset.create`, `preset.manage`), prices, translations and the audit log.
- **Staff have no "Bucătăriile mele" and no claim dialog**; in the configurator they are visitors.

**Values:** secure, calm, honest, minimal. **Data:** e-mail, optional phone (unverified), later optional name and
address. No payments, 2FA, SMS or social login. GDPR is the standard; the account is a **contract**, not consent.

### 0.2 Extend Lot 1. Do not restyle it

**Attach** `Lemnaria Cont Lot 1.dc.html` and `ContBlocks.dc.html`, plus the files named in this batch. Lot 1 is the
approved account language. Reuse it **exactly**: tokens, phone and desktop frames, header, ‹ chevron, RO chip,
buttons, field, notice tones (err / warn / ok / info), hero, help list, links, bottom bar. **Do not edit
`ContBlocks.dc.html`** (Lot 1 imports it). Put new block kinds (card, menu, sheet, dialog, table row, toast,
filter, badge) in a new **`ContBlocks2.dc.html`**; Lot 3 only adds to it. Keep the "Paletă provizorie — nu este
brandul final" badge.

**Tokens (as in Lot 1):**

| Role | Value |
| --- | --- |
| Surfaces | screen `#faf8f4`; raised `#f5f3f0`; chip / disabled `#ece7dd`; canvas `#e7e3da`; lines `#dcd8ce`, `#e4dfd5` |
| Primary | `#7c5c3d`; hover / chip text `#5a3e25` |
| Text | headings `#1c1814`; body `#1c1d1f`; **secondary, hints and captions `#6b5e52`** (5.9:1) |
| Error | border, dot and label `#dc2626`; fill `#fdf3f3`, border `#f0cfcf`; **message text `#8f2020`** (8.0:1) |
| Success | `#2d5016` on `#eef1ea`, border `#d3dccb`, "✓" |
| Warning | text `#5a3e25` on `#f7ecdc`, border `#e6cfa8`. `#b45309` only for bold text ≥ 14px |
| Placeholder / disabled text | `#a89c8e`, **never** for information |
| Scrim | `rgba(28,24,20,.30)`. Sheet shadow `0 -16px 36px rgba(28,24,20,.18)` |

`#7d7a72` appears only in canvas captions, never inside a screen.

**Destructive button:** outline, 1px `#dc2626` border, `#8f2020` text `700 14px`, never filled and never pre-focused.
"Anulează" has the focus by default.

**Type:** Helvetica, 'Helvetica Neue', Arial. Screen title `700 22px/1.2` (desktop 28px). Body `400 13px/1.55`
`#6b5e52`. Label `700 12.5px`. Input `400 15px`. Hint `400 11.5px/1.4` `#6b5e52`. Numbers use tabular figures.

### 0.3 Lessons from the Lot 1 review: hard rules

1. **Every touch target is at least 44 × 44**, at both sizes. Lot 1 failed on the mobile ‹ (40 px), both RO chips
   and the bottom-bar link. The rule also covers "⋯" menus, filter chips, drag handles, banner "×", row actions,
   show / hide toggles and pagination.
2. **No ellipsis on any title, button or message.** The mobile header cut Russian titles. In Lot 2 and Lot 3 the
   **mobile header holds only ‹, the wordmark and the chip**. The screen title is the H1 in the content, and it
   wraps. User-typed kitchen names wrap to 2 lines on a card. Only past 2 lines may they clamp, and the full name
   is then the accessible name and is shown on open. Leave about **30% extra room** for Russian.
3. **Contrast:** hints and captions use `#6b5e52`, error text `#8f2020`. **A countdown or wait is never shown only
   inside a disabled button** (Lot 1 put it at 2.18:1). Put it in the notice text.
4. **Waits (`429` + `Retry-After` seconds):**
   - under 10 min: "Încearcă din nou peste {m}:{ss}" in the notice;
   - 10–60 min: "peste {n} min";
   - over 60 min: a **clock time**, "Încearcă din nou după ora {HH:MM}". Use "mâine, după ora {HH:MM}" only when
     that time falls on the next local day.
   - **Never write a bare "mâine"**: day limits reset at 00:00 UTC, which is 02:00 or 03:00 in Chișinău.
   - Missing or odd `Retry-After`: "Prea multe încercări. Încearcă din nou mai târziu."
   - The words are the same whoever is asking.
5. **Offline is a notice inside the screen.** It is never a full-screen state, which would hide the values it
   promises to keep: "Conexiunea s-a întrerupt. Nu ai pierdut nimic din ce ai scris." + "Încearcă din nou".
   **Unavailable (`503`):** "Serviciul nu este disponibil acum. Nu am schimbat nimic. Încearcă din nou în câteva
   minute."
6. **Never promise a page, button or feature that does not exist.** No "resend", no "undo", no "unclaim", no
   version history. A client cannot unhide a kitchen. There is no "show hidden" tab for clients and no SMS. If you
   think one is needed, ask (0.9).
7. **Token pages are plain.** Any page opened from an e-mail link carrying `#t=…` shows no Turnstile, no
   third-party script, font, image or map, and no language chip. Its error says "Deschide din nou link-ul din
   e-mail", **never "Reîncarcă pagina"**, because a reload loses the token. Mark it with Lot 1's "Pagină simplă ·
   fără terți" badge. **No Turnstile anywhere in Lot 2 or Lot 3.**
8. **Long states get a second, scrolled frame** (Lot 1 clipped them). The action bar is sticky, not fixed; a focused
   field never sits under it.
9. **Draw every state you list** (Lot 1 missed an `invalid-input` state, a long wait, codes without copy): a frame
   each, or "same as {ID}".

### 0.4 Language

- **Romanian is the source.** Use informal "tu", short, plain and calm. Words already in use: **cont**, **Intră în
  cont**, **Ieși din cont**, **parolă**, **link**, **bucătărie / Bucătăriile mele**, **Ciornă**, **Trimisă**,
  **Încearcă din nou**, **de la … MDL**.
- **Gender-neutral in both languages.** RO: no "Ești sigur?" and no "Ai fost deconectat". Use "Te-am deconectat",
  "Vrei să…?". RU: no 2nd-person past tense ("подтвердил", "вышел", "забыл"). Use passive or impersonal forms:
  "Кухня сохранена", "Выход выполнен", "Удалить кухню?".
- **RU note per screen:** title, primary button and main error, marked "traducere de lucru — de verificat de un
  vorbitor nativ". Use informal "ты". Glossary: cont = аккаунт, Intră în cont = Войти, parolă = пароль,
  link = ссылка, bucătărie = кухня, Bucătăriile mele = Мои кухни, Ciornă = Черновик, Trimisă = Отправлена.
- **Plurals:** RO has one / few / other ("1 bucătărie", "2 bucătării", "20 de bucătării"). RU has one / few / many
  ("1 кухня", "2 кухни", "5 кухонь"). Draw counts of **1, 2, 5 and 20**.
- Changing the language is a full page load and **loses unsaved typed values**. Do not promise otherwise.

### 0.5 Accessibility, every screen

- Every input has a visible `<label>`. Placeholders are examples only. An error goes on the input as `aria-invalid`
  and `aria-describedby` pointing to the message. A form error shows in a live region at the top, and focus moves
  there (several fields) or to the field (one field).
- Focus ring: 2px `#7c5c3d`, offset 2px. Draw it on at least one form, one dialog and one list per lot.
- **Dialogs and sheets:** focus moves in, is **trapped**, and Esc closes a dismissible one. Focus returns to the
  opener. The title is the accessible name. Show the Tab order once per lot.
- Use `autocomplete` (`email`, `current-password`, `new-password`, `tel`, `name`, `street-address`). Password
  fields allow paste and have "Arată" / "Ascunde" with an accessible name ("Arată parola").
- **Busy:** the button keeps its width, with spinner, text and `aria-busy`.
- Never rely on colour alone: "!" for an error, "✓" for success, and a text label on every badge.
- Row actions have names ("Deschide {nume}"). Drag always has a keyboard alternative.

### 0.6 "Do not"

1. **No enumeration.** Anything that touches an e-mail address another person might own gets one neutral answer
   (e-mail change, staff invite). Signed-in checks of the person's own password may say "Parola actuală nu este
   corectă."
2. **No pre-ticked box, no consent tick, no marketing box.** The account is a contract.
3. **No dark patterns.** No confirm-shaming, no fake urgency, no hidden or greyed "Nu acum", no pre-selected
   destructive choice, no nag that blocks the editor.
4. **Destructive actions** need a dialog. It names the object, says what is removed and **what cannot be undone**,
   and has "Anulează" focused.
5. No password rules beyond length (at least 12 characters, at most 128), no strength meter, no "repeat password".
6. Never show the role to a client. Never show a staff control to a client, or an administrator item to an
   operator. The UI hides; the server authorises.
7. Never show a raw server word on screen; it goes in the note under the frame.

### 0.7 Server words

Where a contract exists this brief quotes it; **elsewhere write "Server: de stabilit" and invent no HTTP words.**
Built words for every signed-in call:

| Word | Meaning | Treatment |
| --- | --- | --- |
| `401 unauthenticated` | no live session (expired or signed out) | the session-expired state of this lot (never an error page) |
| `403 forbidden` | live session, the role may not do this | "Nu ai acces la această pagină." **Never** "session expired" |
| `429 rate-limited` + `Retry-After` | a limit | rule 0.3-4 |
| `503 unavailable` | something of ours is down; nothing changed | rule 0.3-5 |
| no answer | offline | rule 0.3-5 |
| a kitchen id that is missing **or** belongs to someone else | one answer for both | "Bucătăria nu este disponibilă." |

**Field codes already built** (reuse the wording):

- Password: `PASSWORD_TOO_SHORT` "Parola trebuie să aibă cel puțin 12 caractere." · `PASSWORD_TOO_LONG` "Parola
  poate avea cel mult 128 de caractere." · `PASSWORD_IS_EMAIL` "Parola nu poate fi adresa ta de e-mail." ·
  `PASSWORD_BREACHED` "Această parolă apare în scurgeri de date publice, așa că nu e sigură. Alege alta — de exemplu
  o frază din câteva cuvinte." Hint: "Cel puțin 12 caractere. Poți folosi o frază; spațiile sunt permise."
- E-mail: `REQUIRED` "Scrie adresa de e-mail." · `MALFORMED` "Adresa nu pare corectă. Verifică „@” și domeniul (ex.:
  nume@exemplu.md)." · `TOO_LONG` "Adresa este prea lungă." · `FORBIDDEN_CHARACTER` / `NOT_TEXT` "Adresa conține
  caractere care nu sunt permise."
- Phone (**draft: conflicts with the locked contact-page wording, owner to choose**): `PHONE_MOLDOVAN_INCOMPLETE`
  "Numărul pare incomplet. Un număr din Moldova are 9 cifre (ex.: 069 123 456)." · `PHONE_MOLDOVAN_TOO_MANY_DIGITS`
  "Numărul are prea multe cifre." · `PHONE_MOLDOVAN_SECOND_ZERO` "După 0 urmează codul operatorului, nu încă un 0." ·
  `PHONE_INTERNATIONAL_INCOMPLETE` "Numărul internațional pare incomplet." · `PHONE_INTERNATIONAL_TOO_MANY_DIGITS`
  "Numărul internațional are prea multe cifre." · `PHONE_FORMAT_UNRECOGNISED` "Nu recunoaștem formatul. Scrie
  numărul cu prefixul țării (ex.: +373 69 123 456)." · `TOO_LONG` "Numărul este prea lung." ·
  `FORBIDDEN_CHARACTER` / `NOT_TEXT` "Numărul conține caractere care nu sunt permise." Draw one; list all in a copy
  table under the frame.

### 0.8 Hand-over format

- **One `.dc.html` file per lot**, both surfaces, like Lot 1: `Lemnaria Cont Lot 2.dc.html` and `Lemnaria Cont Lot
  3.dc.html`, plus `ContBlocks2.dc.html`. They go in `docs/design/mockups/` and load `./support.js` as Lot 1 does.
- Per screen a section "Ecran {ID} · {nume}" with its route ("propusă" if none exists) and an RU card. Per frame an
  ID badge, a Romanian caption, and under it `Server: …` (a real word or "de stabilit") plus a note.
- **IDs:** mobile `{screen}{state}` (`A9A`), desktop `D` + the mobile ID (`DA9A`), a variant with a digit (`A9C2`).
  **Never reuse an ID from Lot 1** (A1–A8) **or from the configurator files** (1A–5B, D…, 1D–1H, 3S, 3T).
- A page `<title>` per screen. All copy as live text. List any copy you add beyond this brief.
## Part 2 — Lot 2: the client's account and the editor pop-ups (A9–A20)

A15, A16, A18 sit in the editor. Mobile 390 × 844 first; one desktop frame per screen at least. Account pages are
full loads with Lot 1's desktop card; A9 desktop is a 3–4 card grid. **Built server words:**

- **Session:** `GET /api/account/session` → `{state:"anonymous"}` or `{state:"signed-in", email, capabilities}`
  (**no name, no role**).
- **Logout:** `POST /api/account/logout` `{scope:"this-device"|"everywhere"}` → `204`; "everywhere" **fails
  closed** with `503`.
- **Claim:** `GET /api/account/claim` → `{claimable:n}`; `POST` → `{claimed:n}`; also `401`, `403`, `429`, `503`.

Everything else is **draft** ("Server: de stabilit").

### A9 — Bucătăriile mele · `/[locale]/account/kitchens` (propusă)

- **Card:** thumbnail (striped placeholder when loading or failed); **name** generated as `{formă}, {pereți} mm,
  {finisaj}` (the built preset format, e.g. "În L, 3200 × 2400 mm, alb mat") or the client's own; shape and size;
  "Modificată acum 2 zile"; "de la {n} MDL"; badge **"Trimisă"** ("✓", success) or **"Ciornă"**.
- **Actions:** primary "Deschide". A "⋯" menu (44 × 44) holds "Redenumește", "Duplică", "Link de partajare", and
  then "Șterge" on a draft or "Ascunde" on a sent kitchen.
- **States:**
  - A9A loading: skeleton cards;
  - A9B empty: "Nu ai încă nicio bucătărie salvată." + "Începe o bucătărie";
  - A9C list mixing sent and draft, with a long name wrapping;
  - A9D menu open;
  - A9E rename inline ("Nume", "Salvează" / "Anulează"; "Scrie un nume.", "Numele este prea lung.");
  - A9F duplicate busy, then a toast "✓ Copie creată";
  - A9G share sheet: "Oricine are link-ul poate vedea bucătăria, fără s-o poată modifica." + "Copiază link-ul" /
    "✓ Copiat" + "Oprește link-ul" (confirm: "Cine are link-ul nu va mai putea vedea bucătăria.");
  - A9H delete-draft dialog: "Ștergi bucătăria „{nume}”?" + "O ștergem definitiv. Nu o vei mai putea recupera." +
    "Șterge" (destructive) / "Anulează" (focused);
  - A9I unavailable; A9J offline; A9K a kitchen no longer available on open.

### A10 — Profil · `/[locale]/account/profile` (propusă)

- **Fields:** Nume (optional); Adresă / localitate (optional); E-mail as text with "Schimbă e-mailul"; Telefon,
  labelled **"Telefon (opțional, neverificat)"**, with the hint "Îl folosim doar ca să te sunăm despre
    oferta ta. Nu îl verificăm prin SMS. Îl poți șterge oricând." The privacy notice lets a person withdraw the
    phone by deleting it, so **an empty phone saves**.
- Button "Salvează modificările". Success "✓ Salvat".
- **Links** (44 px rows): Schimbă parola · Exportă datele mele · Șterge contul · Ieși de pe toate dispozitivele ·
  Nota de confidențialitate (new tab, "(se deschide într-o filă nouă)").
- **Change e-mail (sheet):** "E-mail nou" + **"Parola actuală"** (required; it confirms it is you); "Trimite
  link-ul de confirmare"; **one neutral answer**, even for a taken address: "Dacă adresa poate fi folosită, ți-am trimis un
    link la ea. Până confirmi, contul folosește adresa veche."
- **Confirm the new e-mail:** a **token page** (rule 0.3-7) at `/[locale]/account/confirm-email#t=…` (propusă).
  States:
  - ready: "Confirmă adresa nouă" + "Confirmă";
  - busy;
  - done: "✓ Adresa a fost schimbată.";
  - one invalid answer: "Link-ul nu mai este valabil. A expirat, a fost folosit sau a fost înlocuit. Cere unul nou din
    Profil.";
  - unavailable, with a retry that keeps the token.
- **States:** loaded; saving; saved; phone error (0.7 table); the sheet, its errors (`MALFORMED`, "Parola actuală nu este
  corectă.") and neutral answer; the confirm-page states; unavailable.

### A11 — Schimbă parola · `/[locale]/account/password` (propusă)

- **Fields:** "Parola actuală" (`current-password`) and "Parola nouă" (`new-password`, with the 0.7 hint).
- Button "Schimbă parola".
- **Errors:** "Parola actuală nu este corectă." and the 0.7 password codes.
- **Success:** "✓ Parola a fost schimbată. Te-am deconectat de pe celelalte dispozitive." Whether this device stays
  signed in is a question (0.9).
- **States:** ready, the two error kinds, busy, success, rate-limited, unavailable.

### A12 — Exportă datele mele

- **Body:** "Primești un fișier JSON cu profilul tău, toate bucătăriile (inclusiv cele trimise și cele ascunse),
  cererile tale către magazin și notele personalului despre ele."
- Button "Descarcă datele".
- **States:** ready; "Se pregătește fișierul…"; done; rate-limited; unavailable.

### A13 — Șterge contul

- **Text (exact wording to approve):** "Ștergem profilul, datele de contact, toate bucătăriile (inclusiv cele
  trimise și cele ascunse), link-urile de partajare, cererile tale către magazin și notele personalului despre ele.
  Link-ul de vizualizare din anunțul trimis magazinului nu va mai funcționa. **E-mailurile deja ajunse la magazin
  și mesajele trimise pe WhatsApp nu pot fi retrase.** Copiile de siguranță se suprascriu în cel mult 14 zile."
  Then, bold: "Această acțiune nu poate fi anulată."
- A link "Exportă datele mele" comes first. It is a link, not a step you must pass.
- **Confirm** with "Parola" (required). There is no "type DELETE". Buttons: "Șterge definitiv contul"
  (destructive) and "Anulează" (focused).
- **States:** confirm; wrong password; busy; done ("Contul a fost șters." + "Înapoi la configurator", signed out);
  unavailable ("Nu am șters nimic."); rate-limited.

### A14 — Ieși din cont / Ieși de pe toate dispozitivele

- **"Ieși din cont"** (`this-device`): immediate, then the toast "Ai ieșit din cont." on the configurator.
- **"Ieși de pe toate dispozitivele"** (`everywhere`): a dialog titled "Ieși de pe toate dispozitivele?" with "Te
  deconectăm de pe toate dispozitivele, inclusiv acesta." and the buttons "Ieși peste tot" / "Anulează" (focused).
  On `204`, show A4 with the notice "Te-am deconectat de pe toate dispozitivele." On `503`, stay, with "Nu am putut
  închide sesiunile. Nu am schimbat nimic. Încearcă din nou."
- States: toast, dialog, busy, done, `503`, offline.

### A15 — Păstrezi bucătăria curentă? (editor, signed-in client)

- **Trigger:** "Generează una nouă", or choosing a preset, **while the open kitchen has changes that are not in the
  list**. Nothing edited means no pop-up.
- **Layout:** bottom sheet (mobile), centred dialog (desktop), with the current kitchen's thumbnail and name. Title
  "Păstrezi bucătăria curentă?"; body "O poți salva în Bucătăriile mele înainte să începi una nouă." Buttons
  **"Salvează"** (primary); **"Nu o păstra"** (secondary, never shaming), with one honest line on what is lost,
  "Modificările de la ultima salvare se pierd." (wording depends on 0.9-1); "Anulează" (stay).
- **States:** open; saving; saved, then continue ("✓ Salvată în Bucătăriile mele"); save failed (stay; nothing
  lost); session expired (A20).

### A16 — Same pop-up for a visitor without an account

- **The same sheet as A15.** After "Salvează", it **always** says: "Am păstrat bucătăria. **Fără cont nu ai o listă
  de bucătării și nu o poți deschide de pe alt dispozitiv.** Dacă îți creezi un cont din acest browser, o poți
  atașa contului." Buttons: "Creează cont" (primary) and "Nu acum", which is equally visible.
- Do **not** say where the kitchen is stored ("în acest browser"). That is not decided.
- **A16C:** an occasional card in the editor, dismissible and never blocking. Text: "De ce un cont? Îți păstrezi
  bucătăriile și le deschizi de pe orice dispozitiv." Actions: "Creează cont" and a "×" with a 44 px target and the
  name "Închide". Note it as "frecvență de stabilit".

### A17 — Ascunzi o bucătărie trimisă?

- **Dialog** "Ascunzi o bucătărie trimisă?": "Ai trimis-o deja magazinului. Dacă o ascunzi, dispare din lista ta și **nu o vei mai putea deschide sau
    edita**. Nu este o ștergere: echipa Lemnaria o vede în continuare. **Doar personalul magazinului o poate face din
    nou vizibilă.** Dacă vrei ca datele să fie șterse, folosește „Șterge contul”." Buttons "Ascunde"
    (destructive) / "Anulează" (focused).
- **States:** dialog; busy; done (card leaves the list; toast "Bucătăria a fost ascunsă.", no "undo"); error.

### A18 — Atașezi bucătăriile din acest browser? (claim)

- **When:** on the account page right after confirm (A3) or log in (A4), **before leaving it**, and only if
  `claimable > 0`. Never on Step 1, never when a kitchen is opening, never blocking.
- **A18A (built today: the count only):**
  - text: "Am găsit **{n} bucătării** făcute în acest browser fără cont. Le atașezi contului ca să le deschizi de pe
    orice dispozitiv?";
  - warning: "Odată atașate, rămân în contul tău și nu pot fi mutate în alt cont. Dacă nu este dispozitivul tău,
    alege „Nu acum”.";
  - buttons: "Atașează" (primary) / "Nu acum".
- Draw n = 1, 2, 5 and 20, in RO and RU.
- **States:** A18B busy; A18C success "✓ {claimed} bucătării atașate" (the server's count can differ from n; show
  the server's); A18D `429`; A18E `503` (dialog stays, retry); `401` goes to A20 and `403` shows **no dialog**
  (note only).
- **A18F, marked "VARIANTĂ VIITOARE — necesită API":** the dialog listing each kitchen (thumbnail, name, date), as
  the plan wants; today's API gives only the count.

### A19 — Account control in the header (configurator and account pages)

- **Signed out:** "Intră în cont" (44 px).
- **Signed-in client:** a person icon (no initials: the session has no name), accessible name "Contul meu". Menu
  (desktop) / sheet (mobile): the e-mail (wraps), Bucătăriile mele, Profil, Ieși din cont, Ieși de pe toate
  dispozitivele.
- **Signed-in staff:** menu "Zona personalului", "Ieși din cont", "Ieși de pe toate dispozitivele".
- Show it in the mobile editor header beside the step badge and RO chip at 390 px.

### A20 — Session expired vs no access

- **On an account page** (A9–A14) a `401` on load goes to A4 with Lot 1's A4G notice. Draw the arrival once.
- **In the editor or a dialog** (A15–A18), a sheet "Sesiunea a expirat": "Intră din nou în cont ca să poți salva.
  Bucătăria rămâne deschisă aici." + "Intră în cont" / "Mai târziu". Never an error page. Do not promise that edits survive the trip to the login page (question 0.9-4).
- **`403`:** a full page titled "Nu ai acces la această pagină", with "Înapoi la configurator". It never says
  "session expired". For example, a staff account that opens `/account/kitchens`.

## 0.9 Questions Claude Design should answer back

1. A15: should "Nu o păstra" delete the kitchen or only stop listing it? (A kitchen made while signed in may
   already be stored in the account.) Propose the wording for each case.
2. A9: should pagination or "Încarcă mai multe" be used, and what default sort?
3. A19: where does the account control fit in the mobile editor header without pushing the step badge?
4. A20: should the login page keep a return path to the open kitchen? Show the copy if yes.
5. A11: should this device stay signed in after a password change?
6. A10: should the old address get a notice when the e-mail changes?
7. New block kinds and any copy you added, as lists.

## Checklist

- [ ] A9–A20: every state at 390 × 844, and at least one desktop frame per screen.
- [ ] Part 0.3 kept: 44 px, no truncation, waits in the notice, plain token page, no Turnstile.
- [ ] RU card per screen, gender-neutral; plurals at 1 / 2 / 5 / 20; `ContBlocks.dc.html` unchanged.
