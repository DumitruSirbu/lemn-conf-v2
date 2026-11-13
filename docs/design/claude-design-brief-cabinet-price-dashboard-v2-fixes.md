# Claude Design brief — Dashboard v2, fix round 1

Attach: `Lemnaria Dashboard v2.dc.html` (the updated version, reviewed 2026-10-25).
Owner rulings, 2026-10-25: depth 700 is priced now as one percentage (ADR 0100's deferral lifted); 10-lei rounding
accepted; deactivating anything used by saved kitchens must be designed properly. Everything else in the reviewed v2 is
accepted. Recorded in ADR 0175, the 2026-10-25 amendments to ADRs 0100, 0092 and 0062, and backlog 281–285. The
saved-kitchen behaviour after deactivation (section 3) was a proposal, **superseded the same day** by the owner's
ruling (ADR 0062's third 2026-10-25 amendment): see `claude-design-brief-cabinet-price-dashboard-v2-fixes-2.md`.

---

Fix round on **Lemnaria Dashboard v2** (attached). The design is accepted. Change **only** what is listed below and keep every other frame exactly as it is.

## 1. Depth 700: move it, make it live, and show its effect

Depth is now priced, as **one percentage for the whole catalogue**: a kitchen set to 700 mm depth costs X % more on the cabinets that actually get deeper. It is a price, so it is edited in the price area and published like any other price. It is **not** a material property, and **not** a default setting.

**Remove** the disabled „Adâncime 700 mm (plan viitor)” field from the material page (D5B) and the placeholder row from the Materiale list (D5A).

**Add a card to the top of Dulapuri (D2), above the table:** **„Reguli de preț pentru toate dulapurile”**
- One editable field: **„Bucătărie adâncă (700 mm)”**, „+ __ %”, illustrative value **15 %**. Hint: „Se aplică dulapurilor de bază și coloanelor. Dulapurile suspendate rămân la 320 mm și nu se scumpesc. Feroneria și accesoriile nu se schimbă.”
- It has the same draft states as every other price: modified (amber), invalid (inline error), saved to „De publicat”. The header badge count includes it.
- Validation: a whole number from 0 to 100. Errors: empty, not a number, negative, over 100.
- The card can also host the bulk **„Modifică prețurile cu %”** button, so all catalogue-wide rules sit together.
- Frames: **D2A** shows the card at rest. Add **D2E**, the card edited and saved, then shown in draft.

**On the cabinet page (D3), next to the „Cu feronerie” switch, add a switch: „Adâncime 600 / 700”.**
- At 700, every cell in the preview table shows the deeper price (current → new as today).
- Wall cabinets (D3D) and customer-supplied rows (D3E) show it **disabled** with „Nu se schimbă la 700 mm”.
- Remove the dimensions block's two separate depth rows only if they become confusing. Otherwise keep them as they are.

**The arithmetic the preview must show.** Percentages multiply, and the price rounds once at the end to 10 lei:
- Dulap bază 600, PAL, depth 700: 1 500 × 1.15 = **1 730 lei**
- …in MDF +35 %: 1 500 × 1.15 × 1.35 = 2 328.75 → **2 330 lei**

**D5B material example:** add a second line: „La adâncime 700: 1 730 → 2 330 lei”.

**D7 / D8 (publish, history):** the depth rule appears as its own row: „Reguli de preț · Bucătărie adâncă (700 mm): +15 % → +18 %”.

**Customer side.** Add a frame **C3** to the existing customer frames (mobile 390×844 and desktop 1440×900): the price breakdown of a 700 mm kitchen.
- It has its own line, **„Adâncime 700 mm · +15 %”**, beside „Material · MDF vopsit mat”, with the amount.
- The settings sheet's depth control loses its old note („adâncimea nu schimbă estimarea”). The note becomes: **„Adâncimea de 700 mm scumpește dulapurile de bază și coloanele cu 15 %.”** The % comes from the published rule. NEW COPY.

## 2. Rounding to 10 lei: state it once, consistently

The owner accepted the rounding. Show it consistently:
- the preview table subtitle (as now)
- the bulk-% dialog (as now)
- the material example
- the depth card hint („Prețurile finale se rotunjesc la 10 lei.”)

Do not add rounding controls.

## 3. Deactivating or deleting something kitchens already use

This must be designed properly for **materials (D5), hardware classes (D4) and accessories (D6)**. Today only deleting a used hardware class is blocked (D4D). Deactivating a used item has no warning at all, and the material page shows „Folosit în bucătării salvate: 23” with nothing attached to it.

The rules to design:

1. **Deactivate a used item:** a confirmation dialog.
   - Title: „Dezactivezi „MDF vopsit mat”?”
   - Body:
     - „23 de bucătării salvate îl folosesc.”
     - „Clienții noi nu îl mai pot alege.”
     - „Bucătăriile salvate care îl folosesc rămân neschimbate și își păstrează prețul calculat cu el, până când clientul alege altceva.”
   - Buttons: „Dezactivează”, and „Anulează”, which has initial focus.
   - Effects are listed, with no red alarm styling, since nothing breaks.
2. **Deactivate an unused item:** a simple confirmation, like D4D's unused-delete.
3. **The default item** (PAL, Standard) cannot be deactivated. The menu item is disabled with the reason: „Este implicit. Alege alt implicit în Setări implicite.”
4. **Delete a used item:** blocked, for all three sections, not only hardware. The message says how many kitchens use it and offers „Dezactivează în schimb”.
5. **Delete an unused, non-default item:** a confirmation, „Nu se poate anula.”
6. **Visible state afterwards:**
   - The list row shows **„Inactiv · folosit în 23 bucătării”**.
   - The edit page shows the same banner and an „Activează” button.
   - Deactivation goes through „De publicat” like a price change. Say so in the dialog: „Intră în vigoare când publici.”
7. **Customer side, a saved kitchen using a deactivated material.** Add frame **C4**: the settings sheet shows the material as selected, with the note „Nu mai este oferit pentru bucătării noi.” The other options stay selectable. Once switched away, it cannot be chosen again.

Frames:
- D4E: hardware, deactivate a used class
- D5C: material, deactivate a used material
- D5D: material, delete blocked
- D6C: accessory, deactivate a used accessory
- D5E: the list with an inactive-but-used row
- C4: as above

Show mobile variants only for D5C.

## Rules
- Every new string is marked **NEW COPY**. Missing Russian is marked **RU TBD**. Add RU variants of D2E and C3.
- All numbers are illustrative.
- Accessibility as before:
  - dialogs trap focus, Esc closes, and initial focus is on the safe action
  - every error is tied to its field
  - targets are at least 44 px
- Out of scope: enabling or disabling cabinet types (future plan), editing sizes, and per-cabinet depth prices.

**Deliverable:** the updated `Lemnaria Dashboard v2.dc.html`, with only the frames listed above added or changed.
