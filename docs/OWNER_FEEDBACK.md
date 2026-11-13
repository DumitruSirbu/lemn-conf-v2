# Owner feedback inbox

Running list of UI feedback from the owner, recorded as given. **Nothing here is built yet.** Each item is
fixed later, in a wave that follows `docs/WORKFLOW.md`. Evidence tier of every entry: **[owner]** unless noted.

## 1 — "My kitchens" page is missing the profile icon (recorded 2026-11-07)

- **Page:** "Bucătăriile mele" (the saved-kitchens list, reached from "Înapoi la configurator").
- **Owner's words:** the profile icon is missing on this page; add it.
- **Screenshot observation [inference]:** the header shows the LEMNARIA wordmark, the back link and a round
  "RU" button at the far right. That button may be the language switch rather than the profile/account icon,
  so the account entry point (as it appears in the configurator header) is not on this page. Confirm against the
  configurator header and the account mockup before building.
- **Wanted:** the same profile icon the configurator header shows, on the My-kitchens header.

## 2 — Share-link dialog: freshly created link state has oversized buttons (recorded 2026-11-07)

- **Dialog:** "Link de partajare", the state right after a link is created (shows the URL, "Copiază link-ul",
  "Oprește link-ul", the note "Copiază link-ul acum — nu îl vom mai putea afișa.", "Închide").
- **Observed:** "Copiază link-ul" and "Oprește link-ul" are stretched to huge stacked blocks (roughly 400 px
  and 400 px tall) and fill the dialog.
- **Wanted:** make them the same small size as the buttons in the already-active state ("Link-ul este activ."
  with "Creează un link nou" and "Oprește link-ul"), and lay them out **inline, side by side**, the same way.
- **Note [inference]:** the height looks like a flex/grid stretch bug in the created-link state, not an
  intended design. Check the dialog's two states share one button style and row layout.

## 3 — "My kitchens" cards: real 3D thumbnail instead of the striped placeholder (recorded 2026-11-07)

- **Page:** "Bucătăriile mele", every kitchen card.
- **Observed:** the card image is a diagonal-stripe placeholder.
- **Wanted:** a picture of the actual kitchen rendered from the 3D scene, as the card thumbnail.
- **Open questions [inference]:** when the image is captured (on save, or on demand), where it is stored
  (persistence package, so a new column or object store and a new resource), and what the card shows for a
  kitchen saved before this exists. Needs an ADR before building. Same image could serve share links.
- **Also seen in the screenshot (not asked for):** the two cards lay out their "Modificată acum … / De la
  57 000 MDL" line differently (one on a single row, one stacked), so the buttons sit at different heights.

## 4 — Contact form: prefill from the profile, and save missing fields back (recorded 2026-11-07)

- **Page:** Contact ("Unde îți trimitem oferta?"), fields Nume, Telefon, Oraș sau localitate, and the
  preferred-contact choice (Telefon / WhatsApp / E-mail).
- **Wanted, part 1:** when the customer is signed in and their profile already holds name, phone and city,
  the form opens prefilled with them.
- **Wanted, part 2:** when a signed-in customer submits the form and the profile lacks any of those values,
  save the submitted values into the profile (only the missing ones; do not overwrite what the profile has).
- **Open questions [inference]:** whether the preferred-contact choice is also profile data; whether a
  value the customer edits in the form should update the profile or only fill blanks (the owner's words say
  only the missing ones); what a signed-out visitor sees (unchanged, empty form). Check the existing profile
  fields and the account/profile ADRs first, since this writes personal data and touches persistence.

## 5 — Staff kitchen-request page: no link to open the kitchen in 3D, no cabinet list (recorded 2026-11-07)

- **Page:** `/ro/staff/kitchens/<id>` (the staff "Bucătării clienți" detail page, an inline 3D preview marked
  "Doar vizualizare", status, request, customer account, notes, "Configurația trimisă").
- **Owner's words:** the most important thing is missing: a way to **open the kitchen in the 3D configurator**
  (the URL; read-only is fine, but it must be there).
- **Wanted, part 1:** a clear "open in 3D" link or button on this page that opens the kitchen read-only.
- **Wanted, part 2:** the **list of every cabinet with its size, colour and details**, the way the customer
  sees it after clicking "verify design" (the customer's review of the design). Also important for staff.
- **Design is needed first [owner]:** part 2 has no mockup for the staff view. **REMINDER: prepare a Claude
  Design prompt for this screen before any implementation.** Base it on the customer's "verify design" review
  (cabinet list with sizes, colours, details) adapted to the staff detail page; see
  `docs/design/claude-design-brief-translations.md` for the brief format already in use.
- **Open question [inference]:** which existing read-only entry point to reuse (the share-link viewer or a
  staff-only route), and whether it needs its own access rule and audit-log entry, since the page already
  records "Accesul este înregistrat în jurnal".
