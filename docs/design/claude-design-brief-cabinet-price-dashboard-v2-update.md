# Claude Design brief — Dashboard v2 update: cabinet price editing

Attach: `Lemnaria Dashboard v2.dc.html` (the base being updated).
Owner rulings, 2026-10-25: keep v2; replace its cost-plus cabinet editor with "price at default width + steps"; material
becomes a percentage per material; odd widths round **up** to the next 50 mm; the anchor price is PAL without hardware;
wider and narrower steps are separate. Recorded in ADR 0175 and ADR 0092's amendment of 2026-10-25.
**Partly superseded the same day:** depth 700 is now priced (ADR 0100's deferral lifted), so this brief's "depth not
priced / Plan viitor" items are void — see `claude-design-brief-cabinet-price-dashboard-v2-fixes.md`.

---

Update **Lemnaria Dashboard v2** (attached). Keep everything that works — shell, navigation, list, read-only dimensions block, hardware/accessories/settings/publish/history screens, the live preview table, RO/RU tabs, the visual language. Change **how a cabinet's price is edited**, the **materials screen**, and the screens that show those values.

## Why

v2 prices a cabinet bottom-up (board m² × rate + edge banding per m + labour + extra). The manufacturer does not think that way, cannot type the price they want (they tweak labour until the total looks right), and the m² geometry does not exist in the product's pricing engine. The engine prices a cabinet from **its width** (plus door count and height where they vary), counts **hardware automatically** per mechanism, and applies the **material** for the whole kitchen. The new editor must speak that language in plain terms: *"this cabinet costs X at its usual size; each 50 mm more adds Y; each 50 mm less removes Z."* That is also how custom-cabinet shops commonly price: a base per cabinet and a fixed amount per width increment.

## The pricing model the screens must show (owner-ruled)

1. **Anchor price** — every cabinet has one price at its **default width** (mostly 600 mm; bottle cargo 300; free fridge 700). This price is **in PAL melaminat, without hardware**. Hardware is always a separate, automatic line.
2. **Width steps, two separate fields:**
   - **„Fiecare 50 mm în plus"** → + lei per 50 mm wider than default
   - **„Fiecare 50 mm în minus"** → − lei per 50 mm narrower than default (usually smaller than the plus step: labour does not shrink with width)
3. **Odd widths round up.** A width that is not a multiple of 50 (e.g. 575 mm from filling a leftover gap, or the sink's 560 minimum) is priced as the **next 50 mm up** (575 → 600, 560 → 600, 625 → 650). The customer never pays less than the grid price.
4. **Extra doors** — only for cabinets whose door count follows width (from 500 mm a 1-door becomes 2-door; the pantry goes 2 → 4): **„Ușă în plus (de la 500 mm)"** → + lei per extra door leaf. This is the door panel only; its hinges are already counted under hardware — say so in a hint so nobody thinks it's charged twice.
5. **Height step** — only for cabinets built to their opening's height (wall cabinet 700 / top row 350, lift-up, open shelf): **„Fiecare 50 mm de înălțime"** → ± lei per 50 mm above/below the default height 700. Odd heights round up too.
6. **Fixed-size cabinets** have no steps: **one price per available size** (e.g. bottle cargo: 200 mm and 300 mm; dishwasher niche: 450 and 600; hob cabinets, oven tower, fridge niche, corner pieces: their single size).
7. **Customer-supplied** (Hotă, Frigider liber): no fields, always 0, as in v2.
8. **Material = a percentage per material**, applied to cabinet prices only (not hardware, not accessories): PAL melaminat **0 % (reference, not editable)**, MDF vopsit mat e.g. **+35 %**, Furnir natural e.g. **+70 %**. It scales with the kitchen — a bigger kitchen pays more for MDF. The customer still sees one "Material · MDF" line. Remove v2's m²-of-front rates, „Corp PAL 18 mm" and „Cant ABS 2 mm" rows.
9. **Hardware** stays as v2: per-mechanism rates per class (Standard / Hettich / Blum). The cabinet page only *shows* it, read-only.
10. **Depth 700** is not priced yet (a future single percentage, owner-deferred). Remove v2's 600/700 depth price columns; on the settings or materials screen show a disabled row **„Adâncime 700 mm: +__ % — Plan viitor"**.

All numbers are illustrative.

## Frames to change

### D2 — Dulapuri (list)
- Price column becomes **„Preț la mărimea implicită"** (e.g. „1 500 lei · 600 mm, PAL") and is **editable inline** in the table (click → field → Enter saves to draft, Esc cancels; invalid value shows inline error). Opening the cabinet is only needed for steps.
- Add a toolbar action **„Modifică prețurile cu %"**: choose scope (toți / grupul / selecția), enter a % (+ or −), preview count („22 dulapuri, 64 prețuri"), confirm → goes to draft, never straight live. It changes anchors, steps and fixed-size prices proportionally.
- Keep chips Modificat / Furnizat de client / Structural and the draft (pending) state.
- Frames: D2A default, D2B with draft prices, D2C inline edit with an error, D2D bulk-% dialog, D2R RU.

### D3 — Cabinet detail (replace v2's right column)
Left column unchanged (image, Dimensiuni read-only, doors/drawers/handles facts).
Right column, top to bottom:
1. **„Preț"** fields (per the model above, only the ones this cabinet has). Each shows the active value as a hint ("Activ: 1 450 lei"), modified fields get v2's amber state.
2. **One sentence summary in words**, live: „600 mm costă 1 500 lei. Fiecare 50 mm în plus adaugă 90 lei, fiecare 50 mm în minus scade 60 lei. Lățimile intermediare se rotunjesc în sus."
3. **Feronerie (automată, doar citire)**: „La 600 mm: 2 balamale → +35 lei cu Standard" with a link to Feronerie.
4. **Preview table** (keep v2's style): rows = every 50 mm width in range (plus the off-grid minimum like 560 shown as „560 → preț ca 600"); a row where the door count steps is highlighted („de aici 2 uși"); columns = **PAL / MDF / Furnir** (cabinet price, material % applied); a Standard/Hettich/Blum switch adds the hardware for that width when on (toggle „Cu feronerie"). Cells show current → new with the difference, as v2 does.
5. Save / Cancel → draft, as v2.

Remove: corp m² / cant / manoperă / extra breakdown, depth columns.

Validation copy (RO): empty, not a number, negative, more than 2 decimals, too large (as v2), plus **„La 200 mm prețul ar ieși 0 sau negativ. Micșorează pasul „în minus”."** when the minus step would drive the narrowest width to ≤ 0.

Variants:
- **D3A** Dulap bază — step cabinet with extra door (FUNCTIONAL: edit fields, preview updates)
- **D3B** saved to draft
- **D3C** invalid value
- **D3D** Dulap suspendat — width steps + height step + extra door; preview columns show heights 700 and 350
- **D3E** Hotă — customer-supplied, no fields
- **D3F** Cargo îngust pentru sticle — fixed sizes: two price fields (200, 300), no steps
- **D3G** structural corner piece — one fixed price
- **D3R** RU

### D5 — Materiale
- List: PAL melaminat **0 % · referință**, MDF vopsit mat **+35 %**, Furnir natural **+70 %**, each with colour count and Activ/Implicit chips as v2.
- Edit: name RO/RU, description RO/RU, **„Adaos față de PAL (%)"**, and a mini preview: „Dulap bază 600: 1 500 → 2 025 lei".
- Disabled future row: Adâncime 700 mm (+ % · Plan viitor).

### D7 — Publicare prețuri / D8 — Istoric
Rows now read in the new terms: „Dulap bază · Preț la 600 mm: 1 450 → 1 500 lei", „Dulap bază · Fiecare 50 mm în plus: 80 → 90 lei", „MDF vopsit mat · Adaos: +30 % → +35 %", and a bulk change as one grouped row („+5 % la 22 dulapuri") expandable to its items. Keep the confirmation copy: new prices apply immediately to all kitchens, including saved ones, and customers see a one-time notice.

### Unchanged
D1, D4 (Feronerie), D6 (Accesorii), D9 (Setări implicite), C1, C2 — keep as in v2.

## Cabinet reference (what each cabinet gets)

| Cabinet | Width | Default | Fields |
|---|---|---|---|
| Dulap bază | 200–800 | 600 | anchor, +50, −50, extra door (≥500: 2 doors) |
| Dulap bază 3 sertare | 300–800 | 600 | anchor, +50, −50 |
| Sertare pentru oale | 300–800 | 600 | anchor, +50, −50 |
| Dulap pentru chiuvetă | 560–800 | 600 | anchor, +50, −50 (560 prices as 600) |
| Coloană cămară | 400–800 | 600 | anchor, +50, −50, extra door (≥500: 4 doors) |
| Dulap suspendat | 200–800, h 700/350 | follows base | anchor, +50, −50, extra door, height step |
| Dulap suspendat rabatabil | 300–800, h 700 | 600 | anchor, +50, −50, height step |
| Etajeră deschisă | 300–800, h 700 | 600 | anchor, +50, −50, height step |
| Cargo îngust pentru sticle | 200 / 300 | 300 | price per size |
| Nișă mașină de spălat vase | 450 / 600 | 600 | price per size |
| Dulap plită și 2 sertare, Dulap plită și cuptor, Coloană cuptor + microunde, Nișă frigider integrat | 600 | 600 | one price |
| Corner pieces (structural) | fixed | — | one price |
| Hotă, Frigider liber | — | — | none (client) |

## Rules
- Mark every new string **NEW COPY**; Russian missing → **RU TBD**.
- Desktop 1440×900 first; mobile 390×844 variants for D2 and D3 as v2 has.
- Accessibility as v2: labelled fields, errors tied to fields, focus order, ≥44 px targets, visible focus, contrast AA.
- Out of scope: adding cabinet types, editing sizes, enable/disable cabinets (future), depth pricing (future).

**Deliverable:** updated `Lemnaria Dashboard v2.dc.html` with the frames above replaced; every other frame unchanged.
