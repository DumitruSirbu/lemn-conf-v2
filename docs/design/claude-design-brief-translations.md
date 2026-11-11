# Claude Design brief — manufacturer dashboard: Traduceri (translations)

Paste everything below the line into Claude Design, and attach these files so the new frames share the existing look:
`Lemnaria Dashboard v2.dc.html` (the owner-reviewed price-4 version; the repository keeps an identical copy as
`docs/design/mockups/Lemnaria Dashboard.dc.html`) (the dashboard shell, nav and table language this screen joins; its nav already has
„Traduceri” under „Administrare”), `Lemnaria Cont Lot 3.dc.html` (the first sketch of S7 Traduceri, which this brief
replaces), `ContBlocks.dc.html` and `ContBlocks2.dc.html` (blocks; do not edit `ContBlocks.dc.html`).

Sources this brief was written from, so a reviewer can check it: ADR 0095 (Romanian is the source, copy lives in
message files, ICU messages, completeness gate, Russian is an agent draft until approved), ADR 0107 decision 1 (a
language is named in its own language and the menu is built for N locales), ADR 0174 O-L3-3 (S7 deferred until a record
answers ADR 0095 decision 2 at run time), M10 plan A-21 / OQ-3 (rows the dashboard creates are Romanian-only; their
Russian comes from this feature), `apps/web/src/messages/ro.json` and `ru.json` (every count and example below).

Measured on `ro.json`, 2026-10-26: **1 025 strings in 52 namespaces**, 20 of them ICU plural/select messages, 55 longer
than 140 characters or multi-line. 32 Russian strings are byte-identical to the Romanian one.

**Open, for the owner — not decided by this brief.** Where edits are stored and how they go live. Today the catalogue is
two JSON files in git, checked at build time (completeness, ICU syntax, the Romanian copy lock); a deployed Next.js app
cannot rewrite them. Two shapes fit these screens equally: (a) the dashboard stores a draft and „Publică” opens a pull
request / export of `ru.json` that ships with the next deploy; (b) the dashboard stores published translations in the
database, layered over the files at run time. O-L3-3 requires a decision record before either is built. The screens
below are drawn **storage-agnostic** (draft → publish), so both remain possible. The question splits by source:
option (a) cannot hold translations of **catalogue rows created in the dashboard**, which live in the database price
book and are versioned by „Publicare prețuri” — so it is also open whether their Russian goes live through the price
publish or the translations publish. Adding a language also touches code (`i18n/routing.ts` locales, the endonym map).

---

You are adding one section, **Traduceri**, to the attached **Lemnaria Dashboard v2** — the private administration area of
a kitchen configurator for Lemnaria, a kitchen manufacturer in Moldova. Only **administrators** see it. Its job: see
every text the configurator and its e-mails show, in Romanian (the source), and write, review and approve its
translation into Russian and any language added later — without a developer.

Keep the attached visual language exactly (tokens, type, nav, tables, form fields, notices, dialogs, badges, the
„Paletă provizorie” badge). This is a tool for long working sessions: dense, calm, keyboard-friendly. **Desktop 1440 ×
900 is the priority surface**; every screen must still be usable at **390 × 844** (tables collapse to stacked cards,
nothing scrolls horizontally, 44 px targets). Romanian is the interface language; add a Russian-interface variant of
T2 and T3 (text ~30% longer).

## What the product does (so the screens make sense)

- **Romanian is the source and is read-only here.** Every Romanian sentence was approved by the owner and is pinned by a
  test; it changes only through the developers. Show it, never offer to edit it.
- **A text is addressed by a key** such as `reviewScreen.callToAction` — „Cere oferta”. **Keys are detected
  automatically from the code**, never typed in the dashboard: the list is exactly the set of keys the deployed app
  uses (the Romanian source catalogue, which the build keeps in step with the code). So there is **no „add text” and
  no „delete text” control anywhere**. When a release adds keys, they appear on their own as „Lipsă” with a „Nou”
  marker; when a release stops using a key, it leaves the list on its own (its translations are kept in history, not
  shown). **Editing a translation is the main job of this section** — design for it first.
- **There are two sources of text**, and the list must show which a row comes from:
  - **Interfață** — the message files (the 1 025 strings above).
  - **Catalog creat în dashboard** — names and descriptions of cabinets, materials, colours, hardware and accessories
    the owner created in the Catalog section. They are written in Romanian only; until translated, a Russian customer
    sees the Romanian name (the Catalog screens already say „textul apare și în Traduceri”).
- **Some texts are templates.** `{label}`, `{requiredMm, number, ::group-off}` are values the app fills in. They must
  appear in the translation unchanged, so draw them as **locked chips** the translator can move but not edit. A
  missing or extra placeholder is an error that blocks saving.
- **Some texts are plurals**, and languages have different plural forms. Romanian has three (one, few, other); Russian
  has four (one, few, many, other). Real example, `accountKitchens.count`:
  - RO: one „# bucătărie” · few „# bucătării” · other „# de bucătării”
  - RU: one „# кухня” · few „# кухни” · many „# кухонь” · other „# кухни”

  The editor shows **one field per plural form of the target language**, each with a live example number (1, 3, 5,
  21…). The administrator never types `{count, plural, …}` syntax.
- **Texts appear in e-mails too** (`accountMail.*`, `leadNotice.*`): subject, intro, action button, note. Show them in a
  small e-mail-shaped preview, not as bare strings.
- **Most Russian text today is an agent draft nobody approved** (part of the account copy was approved by the owner,
  ADR 0172 O27; the starting statuses come from those records). This screen is where the owner approves the rest.
- **A few texts choose between variants** (3 ICU `select` messages). Unlike plural forms, the variants come from the
  source and are the same in every language: show one field per Romanian variant, labelled with it.

### Status of one translation

| Status | Meaning | Badge (text, never colour alone) |
| --- | --- | --- |
| Lipsă | No translation; the customer sees Romanian | „Lipsă” |
| Ciornă | Written but not approved (all current Russian; anything just typed) | „Ciornă” |
| Aprobat | Approved by the owner | „Aprobat” |
| De revizuit | The Romanian source changed after this translation was approved | „De revizuit”, tooltip „Sursa s-a schimbat” |

Extra row flags, shown as quiet icons with a tooltip: „Identic cu româna” (32 today — often fine, e.g. brand names;
offer „E corect așa”), „Mult mai lung decât româna” (the Lot 3 warning, now for every language: „Textul e mult mai lung;
verifică dacă încape.”), „Placeholder lipsă”.

## Grouping (propose and use this)

Two levels, derived from the key: **group → screen (namespace) → rows**. A namespace no rule maps lands in a visible
**„Nesortate”** group, so nothing hides. Counts are real:

| Group | Namespaces (screens) | Strings |
| --- | --- | --- |
| Configurator | configure, room, panel, globalSettings, band, presetChooser, presetSave, webglUnavailable, designLoadError, meta, brand | 236 |
| Preț | price, priceBreakdown, priceBook, finish | 41 |
| Catalog | catalog, + the dashboard-created catalogue rows | 32 + created |
| Revizuire și trimitere | review, reviewScreen, share, contact, submissionResult | 109 |
| Cont client | accountLogin, accountRegister, accountKitchens, accountProfile, … (22 screens) | 270 |
| E-mailuri | accountMail, leadNotice | 70 |
| Erori și refuzuri | rejection, accountFieldErrors | 74 |
| Zona personalului | staffShell, staffKitchens, staffKitchen, staffNotes, staffActions, staffAudit | 193 |

Show each namespace by a readable name („Ecranul de revizuire”), with the raw key as secondary text. Each group and
screen shows a progress figure for the selected language („86 / 109 aprobate · 4 lipsă”).

## Screens

### T1 — Limbi (languages overview, the section's landing page)

- One card or row per language, named **in its own language** with its flag (ADR 0107): „Română”, „Русский”.
  - Română: „Sursă”, no progress bar, no actions except „Vezi textele”.
  - Русский: progress (aprobat / ciornă / lipsă / de revizuit as a segmented bar with numbers), state „Publicată”,
    „Deschide” → T2.
  - A third, drafted example: „English”, state „În lucru”, 12 % done.
- **„Adaugă limbă”** → T5.
- A language has three states: **În lucru** (not visible to customers), **Publicată** (in the customers' language
  menu), **Dezactivată** (hidden from customers, translations kept). **No delete** — the dashboard disables, it never
  deletes something that was live. Romanian can be neither disabled nor edited.
- **„Publică limba”** is enabled only when **0 Interfață strings are „Lipsă”** (the interface of a published language
  never falls back to Romanian); otherwise it shows „Mai lipsesc 143 de texte”. **Catalog rows are the exception**: a
  cabinet created today is „Lipsă” in already-published Russian and shows its Romanian name until translated (M10
  A-21). Show that as a separate count on the language card: „Catalog: 3 texte netraduse — clienții văd româna”.
- A „De publicat” strip, like „Publicare prețuri”: „7 traduceri modificate de la ultima publicare” → T6.

### T2 — Texte (the main list, per language)

This is the screen the administrator spends their time on; make the read → edit → next loop as fast as possible.

- Header: language switcher (Русский ▾), progress, „De publicat: 7”, and when a release brought new keys, an info
  notice „12 texte noi apărute în ultima versiune” with „Arată-le” (filters to the „Nou” marker).
- A primary action **„Tradu textele lipsă”** opens T3 on the first missing text and walks through them one by one.
- **Left (desktop):** the group → screen tree with counts. On mobile it becomes a „Grup” select.
- **Filters:** status segmented („Toate / Lipsă / Ciornă / De revizuit / Aprobat”), source („Interfață / Catalog”),
  the flags above. **Search** across key, Romanian and translation text, with the match highlighted.
- **Columns:** key (small, secondary, copyable); Română (source, read-only, full text wraps); translation (inline
  editable for one-line texts; long, plural or e-mail texts open T3); status badge; flags; row actions („Aprobă”,
  „Editează”, „Golește”).
- **Bulk:** select rows → „Aprobă selecția” (with a count and confirm). No bulk edit of text.
- Inline save on blur or ⌘/Ctrl+Enter; per-row „Se salvează…” / „✓ Salvat” / error. Keyboard: ↑↓ between rows, Enter to
  edit, Esc to cancel.
- Draw with real rows from at least three groups, including `reviewScreen.callToAction`, `room.title`,
  `rejection.WIDTH_TOO_LARGE` (placeholders) and `accountKitchens.count` (plural).

### T3 — Editare text (side panel on desktop, full sheet on mobile)

- Key, group › screen, „Unde apare” (a one-line hint of the screen, and a thumbnail if one exists).
- Română on top, read-only, placeholders as chips.
- Translation field below with placeholder chips; plural texts get one field per form of the **target** language with
  its example number; e-mail texts show subject / intro / action / note fields beside an e-mail preview.
- Live checks under the field: placeholder mismatch (blocking, error tone), length warning (warning tone), identical to
  Romanian (info).
- Actions: **„Salvează ca ciornă”**, **„Salvează și aprobă”**, „Golește traducerea” (only in a language that is „În
  lucru”; a published language cannot lose a translation, so the button is absent there with a one-line reason).
  „Următorul text lipsă →” to move on without closing.
- History: who changed it and when, last 5 versions, „Restaurează” on each. When status is „Sursa s-a schimbat”, show
  the old and new Romanian with the difference marked.

### T4 — Catalog creat în dashboard

The same list as T2, filtered to source „Catalog”, grouped by catalogue section (Dulapuri, Materiale, Culori,
Feronerie, Accesorii). Each row links back to the item in Catalog. A disabled catalogue item stays listed with a
„Dezactivat în catalog” badge.

### T5 — Adaugă limbă (dialog)

- Fields: language (a searchable list of languages with their code, e.g. „English — en”, „Deutsch — de”); the name shown
  to customers, **in that language**, prefilled from the list and editable; flag.
- Explain the effect in plain words: „Limba pornește «În lucru»: clienții nu o văd până o publici. Toate cele 1 025 de
  texte pornesc «Lipsă».”
- Errors: language already exists; name empty.

### T6 — Publicare traduceri

Mirror „Publicare prețuri”: a list of changes since the last publish (key, old → new, status, who), grouped by language
and group; a „Publică” button with a confirm; a success state; and history of past publishes. Make no promise of
instant effect in the copy — use „Modificările vor apărea pe site după publicare.” (the storage decision above sets the
real delay).

### States to draw

Loading (skeleton rows), list, inline editing, saved, save error, a placeholder error that blocks saving, empty filter
(„Nu lipsește nicio traducere” in the ok tone), search with no result, T1 with a language not publishable yet, T5
errors, T6 with nothing to publish, and the 403 page for an operator who opens the URL directly. Mobile 390 × 844: T1,
T2, T3 (with a plural text), T5.

## Questions Claude Design should answer back

1. Is the two-level tree (group → screen) clear enough, or would a flat list of screens with a group filter work
   better on a phone?
2. Is inline editing in T2 plus the panel T3 one too many ways to edit? Would you keep only T3?
3. How should a „Sursa s-a schimbat” row show the Romanian difference compactly?
4. Is a per-row approve plus „Aprobă selecția” enough, or does the owner need an „approve whole screen” action?
5. Any new block kind (tree, placeholder chip, plural field group, e-mail preview, progress bar) and any copy you
   added, as lists.

## Checklist

- [ ] T1–T6 at 1440 × 900, the listed states, and the mobile frames at 390 × 844.
- [ ] Keys come from the code: no add or delete text control anywhere; new keys appear with a „Nou” marker.
- [ ] Romanian read-only everywhere; no delete of a language; Romanian cannot be disabled.
- [ ] Placeholders are locked chips; plurals are one field per target-language form with example numbers.
- [ ] „Publică limba” only at 0 missing Interfață texts; catalog gaps shown as a count; „Golește” absent in a published
      language.
- [ ] Statuses and flags carry text, not colour alone; 44 px targets; Russian-interface variant of T2 and T3.
- [ ] Output in a new `Lemnaria Traduceri.dc.html`; new blocks added to `ContBlocks2.dc.html` only.
