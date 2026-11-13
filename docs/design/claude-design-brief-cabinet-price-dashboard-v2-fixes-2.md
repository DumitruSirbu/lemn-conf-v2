# Claude Design brief — Dashboard v2, fix round 2: disabling an item kitchens use

Attach: `Lemnaria Dashboard v2.dc.html` (price-v3 version, reviewed 2026-10-25), `Lemnaria Configurator Mobil.dc.html`
and `Lemnaria Cont Lot 3.dc.html`. Section 3 (changed after sending, no lock): ADR 0062's fifth 2026-10-25 amendment,
backlog 286.
Owner ruling, 2026-10-25: price changes apply to every kitchen (no freezing); deleting a used item is forbidden;
disabling is allowed and forces customers whose saved kitchen uses the item to pick a replacement on opening. This
replaces fix round 1's "saved kitchens keep it" proposal.

---

Fix round 2 on **Lemnaria Dashboard v2** (attached). Everything else is accepted. Change only what is listed here.

## The rule changed

Fix round 1 said a disabled item stays in saved kitchens until the customer changes it. **That is reversed.** The new rule, from the owner:

- **Delete** an item any saved kitchen uses: **forbidden**. Delete is allowed only when no kitchen uses it.
- **Disable** an item kitchens use: **allowed**. It applies to a material, a colour, a hardware class, a handle or an accessory.
- When a customer **opens a saved kitchen** that uses a disabled item, they are told it is no longer available and **must choose a replacement from the options that remain**. The price recalculates as soon as they choose. "If the manufacturer can't offer it, it's nonsense to keep it for the old kitchens."
- Price changes keep applying to every kitchen, sent ones included. Nothing is frozen.

## 1. Dashboard dialogs: D4E, D5C (+ mobile), D6C

Rewrite the dialog body:

- Title (unchanged): „Dezactivezi „MDF vopsit mat”?”
- „Ce se întâmplă”:
  - „23 de bucătării salvate îl folosesc.”
  - „Clienții nu îl mai pot alege.”
  - „Când un client deschide o bucătărie care îl folosește, i se cere să aleagă altă opțiune dintre cele rămase. Prețul se recalculează după alegere.”
  - „Intră în vigoare când publici.”
- Buttons: unchanged. Initial focus stays on „Anulează”.

Show the remaining options in the dialog: „Rămân disponibile: PAL melaminat, Furnir natural.”

**If nothing would remain** (disabling the last active option of a group), block it: „Trebuie să rămână cel puțin o opțiune activă.”

**D5D (delete blocked)** keeps its block. Its message is: „Nu poți șterge „MDF vopsit mat”: 23 de bucătării îl folosesc. Îl poți dezactiva; clienții vor fi rugați să aleagă altă opțiune.” Keep the „Dezactivează în schimb” button.

**D5E / D5F** keep „Inactiv · folosit în 23 bucătării”. Add a hint: „Se schimbă pe măsură ce clienții își deschid bucătăriile.”

## 2. Customer side: replace C4 with C4A–C4D

These are mobile 390×844 frames in the configurator's style (use the attached Mobil file). Add desktop versions of C4A and C4B.

- **C4A: on opening.** A blocking sheet appears before the price is shown.
  - Title: „Unele opțiuni nu mai sunt disponibile”
  - Body: „Producătorul nu mai oferă: Material · MDF vopsit mat. Alege o opțiune dintre cele disponibile ca să vezi prețul actualizat.”
  - One row per unavailable item, each with an „Alege” button.
  - The sheet cannot be dismissed without choosing, but the customer can leave the kitchen via back.
  - The price area shows „Prețul apare după ce alegi”, not a number.
- **C4B: choosing.**
  - The relevant global setting opens (here Material) with **only the remaining options**.
  - The disabled one is not shown, or is shown struck through and not selectable. Pick one and show it.
  - Below the options is a note: „Alege dintre opțiunile rămase.” This is a note, not a recommendation, so no option is preselected.
- **C4C: after choosing.**
  - The sheet closes and the price recalculates.
  - A short confirmation appears: „Material schimbat în PAL melaminat. Prețul a fost actualizat.”
  - If the colour was reset because it doesn't exist in the new material, say so: „Culoarea a revenit la Alb.”
- **C4D: several at once.** Example: a material and a handle are both disabled. Show two rows, each resolved in turn. The price appears only when all are resolved.

Accessories have no alternative to choose. When an accessory is disabled, the sheet shows it as information only („Uscător de vase nu mai este oferit și a fost scos din bucătărie.”), with no choice (owner-confirmed).

## 3. Kitchens changed after they were sent

A sent kitchen **stays editable**: no lock, no copy action. The tool's goal is the lead, and the shop calls the customer and measures before anything is built. Instead, the shop is told when a sent kitchen changes. A sent kitchen behaves like any other: it shows the current price and gets the C4 sheet for disabled items.

**Customer: C5A (mobile, plus desktop).** A sent kitchen opened in the configurator shows a small, non-blocking note above the price: „Ai trimis deja această bucătărie. Modificările se văd și la noi, dar spune-ne la telefon dacă e ceva important.” It can be closed. Nothing else changes.

**Dashboard: „Bucătării clienți”** (attach `Lemnaria Cont Lot 3.dc.html` and extend its S2 screen rather than redesigning it). It already has the request statuses **Nouă / Contactat / Ofertă trimisă / Închisă**. Keep them exactly as they are and add no new statuses. "Seen" is a separate marker, not a status.

- **D10A: list.**
  - The existing status column is unchanged.
  - Kitchens edited since an operator last opened them show the badge **„Modificată după ce ai văzut-o”** and sort to the top.
  - The nav item „Bucătării clienți” gets a counter of such kitchens.
  - There is a filter „Doar modificate”.
- **D10B: a kitchen's page.**
  - Opening it marks it seen and the badge disappears. The status does not change by itself.
  - A switch shows the version **„Trimisă” (data trimiterii)** next to the **„Actuală” (ultima modificare)**: 3D thumbnail, cabinet list and estimate. Highlight rows that differ, but without a detailed diff.
  - The existing status control is unchanged.
  - The contact details are as in S2.
- **D10C: the badge on a kitchen modified again after being seen** (third round), so the cycle is shown.
- **D10D: daily email digest** (desktop email, plain and branded like the shop notice).
  - Subject: „3 bucătării modificate după ce le-ați văzut”
  - One line per kitchen: name, customer, sent date, „modificată ieri, 18:40”, and a link to D10B.
  - Footer: „Primiți acest e-mail cel mult o dată pe zi, doar când există modificări noi. O bucătărie nu mai apare aici după 30 de zile de la trimitere sau după ce o treceți la «Ofertă trimisă» sau «Închisă».”

The rules behind the frames: at most one email per day; none when nothing changed; each kitchen appears once per round of changes; no email after 30 days or once the status reaches Ofertă trimisă or Închisă (the dashboard badge stays).

This prices-updated notice (C1) and the C4 sheet can both happen on the same opening. Show C4 first and then C1, or merge them into one sheet. Pick one and note it.

## Rules
- Every new string is marked **NEW COPY**. Missing Russian is marked **RU TBD**. Add an RU variant of C4A.
- Accessibility:
  - the sheet is a modal dialog with focus trapped
  - the first „Alege” button takes focus
  - each row is announced as its item name plus „nu mai este disponibil”
  - targets are at least 44 px
- Also fix:
  - On C3 mobile, the top-bar chip shows „PAL melaminat” for an MDF kitchen. It should show the kitchen's material.
  - Remove the stale note „adâncimea 700 e plan viitor” in „Model de preț (v2.1)”.

**Deliverable:** the updated `Lemnaria Dashboard v2.dc.html`. Only the frames listed above are changed or added.
