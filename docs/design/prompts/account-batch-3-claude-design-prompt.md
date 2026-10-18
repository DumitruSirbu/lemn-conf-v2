# Claude Design prompt — Lemnaria account screens, Lot 3 (operator and administrator)

> **For the owner.** Paste this whole file as **one** Claude Design run. It is self-contained: Part 0 is the shared
> brief, revised after the Lot 1 review, and is the same text as in the Lot 2 prompt. Attach `Lemnaria Cont Lot
> 1.dc.html`, `ContBlocks.dc.html`, `Lemnaria Cont Lot 2.dc.html` + `ContBlocks2.dc.html` if Lot 2 is back,
> `Lemnaria Configurator Desktop.dc.html` and `Presete.dc.html` (from `docs/design/mockups/` on `main` of
> `lemnaria-configurator-gbt`; it is not in this worktree). It replaces Part 3 of
> `account-screens-claude-design-prompt.md`. Sources:
> - that prompt;
> - the Lot 1 review §2 and SB1–SB16;
> - `docs/OWNER_FIXES.md` Fix 2 and Fix 3;
> - ADR 0169 D7 (capabilities as built);
> - plan §12.
>
> No server contract exists for this lot. All copy is draft.

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
## Part 3 — Lot 3: operator and administrator (S1–S8)

**Also attach** `Lemnaria Configurator Desktop.dc.html` and **`Presete.dc.html`**. That is the v2 preset file, with
frames 1D–1H on Step 1 and **3S / 3T "Salvează ca preset"** in the editor. Staff work at desks, so this lot is
**desktop first (1920 × 1080)**, with at least **one mobile frame per screen**.

- **Frame IDs** follow 0.8 with an `S` prefix: state S2A is drawn as `DS2A` on desktop and `S2A` on mobile. Draw
  **every** state on desktop, and on mobile at least the state marked "mobile".
- **Routes:** proposed `/[locale]/staff/…`.
- **Server:** no contract exists for any screen here. Write "de stabilit" under every frame, except the 0.7 words.

**Facts the design must respect:**

- **Staff sessions** idle out after **12 hours** (7 days at most). The session-expired state is common here.
- **Every staff read of a client's kitchen, and every unhide, is audit-logged.** Say so in a quiet line,
  "Accesul este înregistrat în jurnal."
- **Staff accounts exist only by an administrator's invitation.** There is no self-registration. Staff sign in on
  Lot 1's A4. Staff never see "Bucătăriile mele" or the claim dialog.
- The operator **never edits a kitchen**. **The status belongs to a sent request**, because a draft has no request.
  Draft kitchens therefore show no status control.
- Client contact has **two sources**:
  - the **profile**: e-mail, optional name, optional phone (neverificat);
  - the **contact request** the client sent: name, phone, locality, preferred channel.
  Label which is which. Never merge them silently.

### S1 — Staff shell

- **Desktop:** left navigation. **Mobile:** a menu sheet.
- **Operator** items: "Bucătării clienți".
- **Administrator** items add "Personal", "Presete", "Prețuri", "Traduceri", "Jurnal de audit".
- The top bar has a role label ("Operator" / "Administrator"), the account control (Lot 2 A19, staff variant) and
  the RO chip (44 px).
- An operator **never** sees the administrator items. Draw both menus.
- **S1C, the session-expired sheet:** "Sesiunea a expirat. Intră din nou în cont." with "Intră în cont". Anything
  typed in an open note stays in the field.
- **S1D:** the `403` page (0.7).

### S2 — Bucătării clienți (operator and administrator)

- **Columns:**
  - thumbnail;
  - kitchen name (wraps);
  - client e-mail, and name if any;
  - phone with "neverificat";
  - badges **"Trimisă" / "Ciornă" / "Ascunsă de client"**, each with text, not only colour;
  - request status (sent kitchens only, "—" for drafts);
  - sent date;
  - last change.
- **Filters:**
  - segmented **"Trimise" / "Ciorne" / "Toate"** (default "Trimise", 44 px segments);
  - search by e-mail or name;
  - a status filter, enabled only under "Trimise". Statuses are a **draft list for the owner**: "Nouă",
    "Contactat", "Ofertă trimisă", "Închisă".
  - Hidden kitchens appear in every filter, with their badge.
- Pagination with page numbers or "Încarcă mai multe": your choice; say which.
- **States:**
  - S2A loading (skeleton rows);
  - S2B results;
  - S2C empty per filter ("Nicio bucătărie trimisă încă.", "Nicio ciornă.");
  - S2D no search results ("Niciun rezultat pentru „{text}”." + "Șterge căutarea");
  - S2E error;
  - S2F session expired (S1C);
  - mobile: S2B, rows as cards.

### S3 — Bucătăria clientului, read-only (operator and administrator)

- **Content:**
  - a large image or a read-only 3D view with a clear **"Doar vizualizare"** badge;
  - **no** edit control anywhere, and no "Deschide în editor";
  - the configuration summary, as Screen 3 "Verificare";
  - "de la … MDL";
  - the two contact blocks, labelled by source;
  - sent date;
  - "Accesul este înregistrat în jurnal."
- **Status** (sent only): a select, "Salvează", then "✓ Status salvat". Show who changed it last and when.
- **Notes:**
  - a list with author, time and text, newest first;
  - "Adaugă o notă": a text area with its label, a visible limit ("{n} / 2000", limit de stabilit) and "Salvează
    nota";
  - the line "Notele fac parte din datele clientului: apar în exportul datelor clientului și se șterg odată cu contul.";
  - notes cannot be edited or deleted: say whether that is right (0.9).
- **Hidden by client:** a banner, "Clientul a ascuns această bucătărie și nu o mai poate deschide." plus **"Fă-o
  din nou vizibilă"**. It is an operator and administrator action. It opens a confirm: "Clientul o va vedea din
  nou în Bucătăriile mele și o va putea edita. Acțiunea apare în jurnal." The buttons are "Fă-o vizibilă" and
  "Anulează" (focused).
- **States:** S3A loading; S3B sent kitchen; S3C draft (no status, notes allowed); S3D hidden, with the banner;
  S3E unhide confirm; S3F note saving, saved and error (the text is kept); S3G status saved; S3H not available (one
  answer for missing and forbidden); S3I unavailable; mobile: S3B.

### S4 — Personal (administrator)

- **List:** e-mail, name, role, "Invitat de", status ("Invitație trimisă" / "Activ") and date.
- **Invite (sheet):** fields E-mail and Rol (a segmented choice, Operator / Administrator, **nothing
  pre-selected**). Button "Trimite invitația". **Neutral answer:** "Dacă adresa poate primi o invitație, i-am trimis-o."
  Never "already has an account".
- **Accept invitation:** a **token page** (rule 0.3-7) at `/[locale]/staff/accept#t=…` (propusă). The person sets
  a password with the 0.7 rules and hint, then sees "✓ Contul este gata" + "Intră în cont". The invalid answer is
  "Invitația nu mai este valabilă. Cere una nouă administratorului."
- **Do not draw** role change, deactivation or removal of staff. Not decided: ask (0.9).
- **States:** S4A list; S4B empty (only you); S4C invite sheet; S4D invite errors (`MALFORMED`, role missing); S4E
  neutral answer; S4F to S4J accept page (ready, password errors, busy, done, invalid); S4K unavailable.

### S5 — Presete (administrator)

- **Context:** presets are created **only in the editor**, with "Salvează ca preset" (`Presete.dc.html` 3S / 3T),
  which will show only for `preset.create`. The library has no create form. Add the line "Presetele noi se creează
  din editor, cu „Salvează ca preset”."
- **Grid or list:** the thumbnail (Step 1 picture), the generated name `{formă}, {pereți} mm, {finisaj}` or the
  typed one, shape and size, and a badge "Vizibil" / "Ascuns".
- **Actions:**
  - **"Ascunde" / "Arată"**: hiding removes the preset from Step 1 and keeps it here;
  - **reorder**, with a drag handle (44 px) **and** the buttons "Mută mai sus" / "Mută mai jos" for keyboard and
    touch users;
  - "Previzualizează": reuse 1G.
- **No delete**: hiding is the tool.
- **States:** S5A loading; S5B grid; S5C empty ("Niciun preset încă. Creează unul din editor."); S5D order saving,
  then saved ("✓ Ordinea a fost salvată"); S5E error (the order goes back, said in text); S5F hide confirm (none
  needed if "Arată" is one click away: say which); mobile: S5B.

### S6 — Prețuri (administrator)

- **Table:** item (material, hardware, extras), current price in MDL, and a new-price field (tabular, right
  aligned, labelled per row).
- "Salvează modificările" opens a summary first: "Schimbi 3 prețuri" with old → new values. Then "Confirmă" /
  "Anulează".
- **Validation:** "Prețul trebuie să fie un număr pozitiv." Leaving with unsaved changes asks: "Ai prețuri
  nesalvate. Pleci fără să le salvezi?" with "Rămân" (focused) / "Pleacă".
- Say once: "Prețurile din configurator sunt prețuri „de la”."
- **States:** loading, table, edited row, errors, summary, saved, unavailable; mobile: S6B.

### S7 — Traduceri (administrator)

- **Rows:** key, Romanian (source, read-only), Russian (editable). Filter "Doar lipsă". Search.
- Save per row: "Salvează" / "✓ Salvat".
- A warning when the RU text is much longer than the RO: "Textul rusesc e mult mai lung; verifică dacă încape."
- **States:** loading, list, editing, saved, error, empty filter; mobile: S7B.

### S8 — Jurnal de audit (administrator)

- **Read-only list:**
  - when;
  - who (staff e-mail);
  - action: "a deschis bucătăria", "a adăugat o notă", "a schimbat statusul", "a făcut vizibilă", "a invitat",
    "a schimbat prețurile", "a ascuns presetul";
  - the object (kitchen or client).
- **Filters:** person, action, date range.
- **No edit, delete or "clear" control anywhere.** Add the line "Jurnalul nu poate fi modificat."
- **States:** loading, list, empty, no results, error; mobile: S8B.

## 0.9 Questions Claude Design should answer back

1. S3: does the operator see the kitchen **as it was sent**, or as it is now? If they differ, how is that shown?
2. S2 / S3: which contact block leads when the profile and the request disagree?
3. S2: the status list and its order (draft above). Does "Închisă" hide a row from the default view?
4. S3: should notes be editable or deletable by their author? Should a client ever see them (they are in the
   export)?
5. S4: role change, deactivation and resending an invitation: draw them, or leave them for later?
6. S8: how much client data should the log show (e-mail, or kitchen name only)?
7. S5: is a confirm needed to hide a preset?
8. Any new block kind, and any copy you added, as lists.

## Checklist

- [ ] S1–S8, every listed state at 1920 × 1080, and one 390 × 844 frame per screen.
- [ ] No edit control on a client's kitchen; status only on sent kitchens; operator menu without admin items.
- [ ] Invitation acceptance is a plain token page; no delete or edit in the audit log.
- [ ] 44 px targets (drag handles, row actions, filters); RU card per screen, gender-neutral.
- [ ] `Lemnaria Cont Lot 3.dc.html`; additions to `ContBlocks2.dc.html` only.
