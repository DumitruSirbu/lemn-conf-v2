# Owner feedback inbox

Running list of owner feedback, recorded as given. **Nothing here is built yet.** Each item is fixed later, in a wave
that follows `docs/WORKFLOW.md`. Evidence tier of every entry: **[owner]** unless noted. The previous round
(2026-11-07, M11) is archived: [`archive/OWNER_FEEDBACK-2026-11-07.md`](archive/OWNER_FEEDBACK-2026-11-07.md), so is
the 2026-10-17 request [`archive/OWNER_FIXES.md`](archive/OWNER_FIXES.md).

## Round 2026-11-14 (eight screenshots; recorded only, no plan yet)

### 1 — Global handles setting is ignored by corner cabinets

- **Owner's words:** when the handles are switched in the global settings, the corner cabinets keep the default
  handle; they should take the global one.
- **Screenshot:** the configurator with the corner wall cabinet ("Dulap suspendat de colț", Perete A, 900 × 700 mm)
  selected; its panel shows a note ("Here needs to be added the handlers selection").

### 2 — Corner cabinets cannot be given a custom handle

- **Owner's words:** for corner cabinets it is not possible to choose a custom handle; add the selector.
- **Wanted:** the handle choice in the structural (corner) cabinet panel, like other cabinets, below the colour
  picker and "Preia culoarea bucătăriei". Pairs with item 1.

### 3 — The cabinet above the full-size fridge is often missing, and too shallow at depth 600

- **Owner's words:** pretty often, after a kitchen is generated, the cabinet above the fridge is missing (add it).
  At depth 600 mm the cabinet above the fridge is narrower (shallower) than the fridge. It should always cover the
  fridge.
- **Screenshot annotation:** "The cabinet above the full size fridge should cover the fridge (depth === 700 mm)".
  The overview shows the wall cabinet above the fridge set back from the fridge's front edge.
- **Wanted:** the generator always places that cabinet, and its depth is 700 mm so it covers the fridge.
- **Check first [inference]:** the generation rules (ADR 0167) and the fridge column's top fill.

### 4 — Profile menu: rename the staff entry and make it stand out

- **Page:** the account popover (signed in as admin): Profil, Zona personalului, Ieși din cont, Ieși de pe toate
  dispozitivele, Închide.
- **Owner's words:** rename "Zona personalului" to "Panoul de administrare" and set that last option split off,
  more visible than the profile-related links.
- **Clarified [owner, 2026-11-14]:** keep the entry in the profile-icon menu, renamed "Panoul de administrare", as the
  **last** option, visually separated (a divider or its own group) from the profile-related links above it. The
  earlier wording was not about "Ieși de pe toate dispozitivele".

### 5 — Staff hardware class: "Activă în configurator" is hard to read as the way to disable

- **Page:** staff Feronerie, class "Hettich" (Activ). Row "Activă în configurator · Activ".
- **Owner's words:** very hard to understand that disabling needs a click on this row. It should be a separate action,
  or be renamed to "Dezactivează" (simple word). Maybe it needs to be redone: analyse best practices for how to use
  such toggles here.
- **Also:** screenshot of the Materiale page (MDF vopsit mat, "Activ în configurator · Activ") came with no text
  [inference: same row, same complaint; confirm].

### 6 — Staff "Bucătării clienți": "Status cerere" filter layout

- **Page:** Ciorne tab. The "Status cerere" select (disabled) sits beside the "Doar modificate" checkbox, with the
  hint "Disponibil doar la „Trimise"" under it; the boxed area is the problem.
- **Owner's words:** fix the layout; do **not** move the input up, just add the info/warning text below.

### 7 — Staff request page: the kitchen link, the cabinet list, the price

- **Status [owner, 2026-11-14]:** the new design is at `design-source/v3/` (untracked): `Bucatarii clienti.dc.html`
  (the staff request list and detail, the page this item is about), `Personal.dc.html`, `Presete.dc.html`,
  `Traduceri.dc.html`, plus `cabinets/` and `shots/`. Per the owner: updated mocks, plus some not implemented yet,
  focused on improving the view of the sent kitchen from the client's screen. Not yet read by the scribe.
- **Process note [doc-quoted, AGENTS.md rule 3]:** `design-source/` is untracked and will be deleted. Before any wave,
  copy the needed files into `docs/design/mockups/` with a sha256 check, as Lot 3 did; nothing may import from the folder.

- **Page:** request detail ("În formă de L, 2800 × 2600 mm, editat (copie)").
- **Owner's words, part 1:** most important: the link to view the kitchen (read only) needs to be added. The request
  id ("Cererea trimisă: LM-…") is useless as it stands; the owner does not see how to use it to view the kitchen.
  **Note [inference]:** a "Deschide în 3D" link already exists under the picture (M11 W3b). The owner may not have
  found it, or wants it at the request line. Check before building.
- **Part 2:** the full list of cabinets, shown the same way as when the client reviews the kitchen ("Verifică
  designul"), placed in an accordion so it can be toggled hide/show.
- **Part 3 (question):** when the actual price and the sent price differ (the client sent, then edited, so the price
  changed), is that shown? Both lines read "De la 57 000 MDL" in the screenshot.
