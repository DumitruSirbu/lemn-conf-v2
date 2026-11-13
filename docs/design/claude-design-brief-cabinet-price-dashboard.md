# Claude Design brief — manufacturer dashboard: cabinet catalogue and price book

Paste everything below the line into Claude Design, and attach these files so the new frames share the existing look:
`Lemnaria Cont Lot 1.dc.html` and `ContBlocks.dc.html` (the account pages: the closest visual language to an
administration surface), `Lemnaria Configurator Desktop.dc.html` (for the cabinet pictures and the price-bar style), and
`Lemnaria Configurator Mobil.dc.html` (for the one customer-side frame, C1).

Sources this brief was written from, so a reviewer can check it: ADR 0062 (the dashboard comes after M8; adding cabinets
is out of scope; enable/disable is "likely, not committed"), ADR 0072 (the owner's versioning design), ADR 0100 (depth
multiplier, decided and deferred), ADR 0071 (only material carries price), ADR 0107 (customer-supplied rows),
`packages/configurator-domain/src/pricing/price-book.ts` (the book's shape) and `sample-price-book.ts` (its rows).

The owner's answers of 2026-10-25, which this brief follows: sizes are shown, not edited (editing min/max/default
widths and heights may come later); **prices and the whole-kitchen defaults are what is editable** (a separate
defaults screen, including a handle default, and a new whole-kitchen handle choice for the customer); enabling/disabling a cabinet is a future plan
and is not drawn; the dashboard is desktop-first; and a saved kitchen **always shows current prices** — no kitchen keeps
the price it was first quoted at, the customer only sees a one-time notice that prices were updated. That last answer
reverses ADR 0072's design items 2, 4 and 6, recorded in ADR 0072's amendment of 2026-10-25 (scope: ADR 0062's
amendment of the same date; backlog 276–280).

---

You are designing a **small, private administration dashboard** for Lemnaria, a kitchen manufacturer in Moldova. The
customer-facing kitchen configurator already exists (attached mock-ups). This dashboard is for **the shop owner only**,
not for customers. Its job: see every cabinet type the configurator offers, see its characteristics, and **set its
price**, plus the other prices the configurator uses — without a developer.

Keep the attached visual language (type, palette, radii, buttons, form fields, error and notice blocks from
`ContBlocks`). This is a tool, not a showroom: dense, calm, legible tables; no marketing imagery. **Desktop 1440 × 900 is
the priority surface** (the owner edits prices at a desk); every screen must still be usable at 390 px wide (owner
checking a price on a phone): tables collapse to stacked cards, nothing scrolls horizontally. Romanian is the primary
language; show a Russian variant of the two key frames (text ~30% longer).

## What the product does (so the screens make sense)

The configurator prices a kitchen from one **price book**. The book is data, not code: the owner can change every number
in it. The book has four parts:

1. **Cabinet prices** — one row per cabinet type (list below).
2. **Hardware tiers** — three whole-kitchen choices (Standard, Hettich, Blum), each priced per mechanism.
3. **Material tiers** — three whole-kitchen choices (PAL melaminat, MDF vopsit mat, Furnir natural), each one amount for
   the whole kitchen. **Colour never changes the price**, only material does.
4. **Accessories** — two fixed extras every sink brings: an aluminium sink-cabinet protection and a dish drying rack.

A cabinet's price is **not a list of sizes**. Cabinets are resizable (e.g. 200–800 mm wide), so each one is priced by a
**formula** the developer fixed, whose **numbers** the owner sets:

- **Base price** — what the cabinet costs before size (carcass, fittings, labour).
- **Per millimetre of width** — what each mm of width adds.
- **Per door** — only for cabinets whose number of doors follows their width (a hinged cabinet becomes two-door at
  500 mm, so the price steps up at that point).
- **Per millimetre of height** — only for cabinets built to the height of their opening (wall cabinets, lift-up
  cabinets, open shelves).
- **Flat price** — some cabinets cost the same at every size (hob cabinets, oven tower, corner pieces).

Which of these a cabinet has is **fixed by the developer and shown read-only**. The owner only types the numbers.

**The key UX problem to solve:** "4,00 lei per millimetre" means nothing to a shop owner. Every price editor must show,
live, **what the cabinet will cost** at typical sizes, so the owner thinks in finished prices and the coefficients are
the means, not the message.

### The cabinet list (real data — use these names and groupings)

Shape abbreviations for your annotations: **W** width, **W+D** width and doors, **W+H** width and height, **W+H+D** all
three, **Flat**.

Widths step by 50 mm inside a range. "Fixed" lists the only widths offered. Heights are the body's own height.

| Group | Name (RO) | Price shape | Width (mm) | Height (mm) | Front | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Dulapuri bază | Dulap bază | W+D | 200–800 | 860 | 1 door, 2 from 500 | |
| | Dulap bază 3 sertare | W | 300–800 | 860 | 3 drawers | |
| | Sertare pentru oale | W | 300–800 | 860 | 2 drawers | |
| | Dulap plită și 2 sertare | Flat | fixed 600 | 860 | 2 drawers | holds the hob |
| | Dulap plită și cuptor | Flat | fixed 600 | 860 | oven front | holds hob and oven |
| | Cargo îngust pentru sticle | W | fixed 200 or 300 | 860 | 1 pull-out | |
| | Dulap pentru chiuvetă | W | 560–800 | 860 | 2 doors | holds the sink; brings the 2 accessories |
| | Nișă mașină de spălat vase | W | fixed 450 or 600 | 860 | 1 decor door | the appliance is not sold |
| Dulapuri suspendate | Dulap suspendat | W+H+D | 200–800 | 700 (wall row; lower in the top row) | 1 door, 2 from 500 | the most used cabinet |
| | Dulap suspendat rabatabil | W+H | 300–800 | 700 | 1 lift-up door | |
| | Etajeră deschisă | W+H | 300–800 | 700 | none | |
| | Hotă | — | 600–800 | 700 | none | **supplied by the customer**: price locked at 0, shown "nu este inclus" |
| Coloane | Coloană cămară | W+D | 400–800 | 2200 | 2 doors, 4 from 500 | |
| | Coloană cuptor + microunde | Flat | fixed 600 | 2200 | 2 doors + appliances | |
| | Nișă frigider integrat | Flat | fixed 600 | 2200 | doors | |
| | Frigider, liber | — | fixed 700 | 1850 | appliance | **supplied by the customer**, locked at 0 |
| Piese de colț (structural) | Dulap bază de colț 900, Racord bază de colț 320, Dulap suspendat de colț (570, and its top-row piece), Dulap suspendat de colț 900 (and its top-row piece) | Flat | fixed | — | — | **not offered to the customer**; placed automatically in L and U kitchens, but still priced |

**Default width** ("Lățime implicită") is the width a cabinet takes when there is plenty of free space: the width the
kitchen generator plans it at. Show it on D2's list and first in D3's size block:

| Cabinet | Default width (mm) | Where the value comes from |
| --- | --- | --- |
| Dulap bază, Dulap bază 3 sertare, Dulap pentru chiuvetă, Dulap plită și cuptor, Nișă mașină de spălat vase | 600 | the generator |
| Cargo îngust pentru sticle | 300 | the generator |
| Frigider, liber | 700 | the generator (its only width) |
| Coloană cămară | 600 | the generator (U kitchens) |
| Dulap plită și 2 sertare, Coloană cuptor + microunde, Nișă frigider integrat | 600 | their only width |
| Hotă | 600 | proposed |
| Sertare pentru oale, Dulap suspendat rabatabil, Etajeră deschisă | 600 | proposed |
| Dulap suspendat | follows the base cabinet below it | the generator |

Mark the "proposed" values with a small "propus" tag; they are the owner's to confirm. **Maximum height** does not exist
today (cabinets built to their opening take the opening's height): draw that field as "—".

Each cabinet also has characteristics the dashboard **shows but does not edit** (today they are tied to the 3D model and
change only with a developer). **Sizes matter most, width above all**: the default width, the minimum and maximum width
(or the list of fixed widths), the 50 mm width step, the height (and, for cabinets built to their opening, the maximum
height), and the depth (600 or 700 mm kitchen setting). Then: number of doors / drawers, whether it takes a handle,
whether it can be coloured. **Editing the sizes may come later**, so lay them out as labelled read-only fields with units
(not as a sentence), in a block that could later become editable without a redesign.

## Screens to design

Label every frame with a small chip in the existing style: **D1…D9**, and **C1** for the one customer-side frame.

### D1. Dashboard shell and sign-in gate

- A left navigation on desktop (top tabs or a menu on mobile): **Dulapuri**, **Feronerie**, **Materiale**,
  **Accesorii**, **Setări implicite**, **Versiuni**. The book's version and state sit in the
  header: e.g. "Ciornă · bazată pe versiunea 2026-11" with a primary "Publică" button that is disabled until the draft
  changes.
- A plain sign-in screen is enough (email + password, reuse the account pages). Do not design roles or user
  management: that belongs to a later phase.

### D2. Cabinet list (the main screen)

- A table grouped by **Dulapuri bază / Dulapuri suspendate / Coloane / Piese de colț**, each group collapsible, with a
  small 3D thumbnail of the cabinet (crop from the existing mock-ups), the name, the price shape as a short chip
  ("lățime", "lățime + uși", "lățime + înălțime", "fix"), **the width** ("200–800 mm · implicit 600" or "fix 600"), **an
  example price** ("600 mm: 4 600 lei"), and a status column.
- Status chips: **Modificat** (changed in the draft, not yet published), **Furnizat de client** (hood, free-standing
  fridge), **Structural** (corner pieces).
- A search field and a filter "Doar modificate".
- A row opens D3. On mobile each row is a card.
- States: default; several rows modified; one row with a validation error (red marker in the row, count in the group
  header); empty search result.

### D3. Cabinet detail and price editor

Two columns on desktop, stacked on mobile.

- **Left: what the cabinet is (read-only).** Picture, name, group, then a **Dimensiuni** block first and most prominent:
  lățime implicită, lățime minimă, lățime maximă, pas 50 mm (or the fixed widths as chips), înălțime (and înălțime
  maximă where the cabinet is built to its opening), adâncime at 600 and 700. Below it, a smaller list: doors (and the
  width at which a second door appears), drawers, handle yes/no, colourable yes/no.
  A quiet note: "Dimensiunile și forma dulapului se schimbă doar de dezvoltator." (NEW COPY)
- **Right: the price.**
  - The formula in words, with only this cabinet's fields: e.g. for Dulap suspendat "Preț de bază + lățime × preț pe mm
    + înălțime × preț pe mm + preț pe ușă". Inputs in **lei with two decimals** (the system stores bani; show lei), the
    unit after each field ("lei", "lei / mm", "lei / ușă").
  - **Live preview table** directly under the inputs: the finished price at typical sizes, recalculated as the owner
    types. For width cabinets: 300, 400, 500, 600, 800 mm (only the widths that cabinet allows; for fixed widths, its
    sizes). Mark where the door count steps ("2 uși de la 500 mm"). For height cabinets add a second axis: the heights that
    cabinet is actually built to (the wall row and the top row), not invented ones. Show the **published price beside the draft price**, with the difference (+120 lei, +3 %).
  - Optional and nice: a small width slider with the price following it.
  - Buttons: "Anulează modificările" (back to published values), and the draft is saved automatically ("Salvat în
    ciornă").
- States: default; edited (diff visible); invalid input (letters, negative, too many decimals, absurdly large: "Suma
  este prea mare"); a **customer-supplied cabinet** (all fields locked at 0, explanation "Clientul cumpără acest
  aparat; nu se facturează."); a **flat** cabinet (one field, preview is one number); a structural corner piece (banner
  "Nu apare în catalogul clientului; este pus automat în bucătăriile în L și U.").

### D4. Hardware tiers

- Three cards or a three-column table: **Standard**, **Hettich**, **Blum**. Each: name, short description (both
  editable text; Hettich and Blum are brand names and render as typed), and three rates: **per balama** (hinge), **per
  sertar** (one drawer = the pair of runners), **per mecanism push-to-open** (latch).
- A read-only "Implicit" chip marks the tier a new kitchen starts with; it is changed in D9, and links there.
- **Preview:** "O bucătărie tip (L, 3,2 × 2,4 m) costă la feronerie: Standard 4 500 lei · Hettich … · Blum …", so the
  owner sees the effect of a rate on a real kitchen.
- Tiers cannot be added or deleted (fixed by the developer); show that as plain absence of buttons, not disabled ones.

### D5. Material tiers

- Three rows: **PAL melaminat**, **MDF vopsit mat**, **Furnir natural**: name, description, **one amount for the whole
  kitchen**, and the read-only "Implicit" chip (changed in D9). A note: "Culoarea nu schimbă prețul." (NEW COPY)
- A material whose amount is 0 renders "inclus" in the customer's price; show that hint next to the field.

### D6. Accessories

- Two fixed rows: **Protecție de aluminiu pentru dulapul chiuvetei** and **Uscător de vase**, each with a **price per
  sink**. No add, no delete, no toggle. Note: "Se adaugă automat la fiecare chiuvetă." (NEW COPY)

### D7. Review and publish a new version (the owner's rule)

The owner's rule, which this screen must make obvious: **publishing applies the new prices everywhere at once**, to new
kitchens and to kitchens customers have already saved. No kitchen keeps an old price. A customer who opens a saved
kitchen afterwards sees a one-time notice that prices were updated (frame C1). The on-screen total is an estimate; the
binding price is the one in the contract made at the shop.

- **Review screen:** a diff of the draft against the published version, grouped by section: field, old, new,
  difference in lei and %. A cabinet's change shows its 600 mm example price before and after.
- A version name/note field ("Scumpire PAL noiembrie"), and the primary **"Publică versiunea"**.
- **Confirm dialog:** "Prețurile noi se aplică imediat tuturor bucătăriilor, inclusiv celor deja salvate de clienți.
  Clienții vor vedea o notificare că prețurile s-au actualizat." (NEW COPY)
- **Book flags** (in this screen, rarely changed): **"Prețuri orientative / ofertă fermă"** (estimate vs commercial),
  and **"Sume provizorii"** (the figures are placeholders). Turning "Sume provizorii" **off** is the moment real prices
  go live to customers: it gets its own, stronger confirmation.
- States: nothing to publish (button disabled, "Ciorna este identică cu versiunea publicată"); draft with errors
  (publish blocked, the list of errors links to each field: the book is published whole or not at all); publishing;
  published (success notice); publish failed (retry).

### D8. Version history (for the owner only)

- **Versiuni:** a list of published versions (name, date, number of changes), newest first; opening one shows its
  prices read-only and the diff against the previous one. "Pornește o ciornă din această versiune" is the only action.
- This is the owner's record of what changed and when. **Kitchens are never priced at an old version**, and customers
  never see this list.

### D9. Default settings for a new kitchen (Setări implicite)

One screen holding every whole-kitchen default, so the owner manages them in one place. Each is what a **new** kitchen
starts with; the customer can still change it in the configurator's settings. Changing a default never changes a kitchen
a customer already saved. Like prices, these edits go into the draft and are published with D7.

- **Material** — PAL melaminat / MDF vopsit mat / Furnir natural (today: PAL melaminat).
- **Feronerie** — Standard / Hettich / Blum (today: Standard).
- **Adâncimea dulapurilor** — 600 / 700 mm (today: 600).
- **Culoarea bucătăriei** — a colour from the default material's palette (today: Alb on PAL). If the owner changes the
  default material, show that the colour resets when the new material does not offer it, with an inline note.
- **Mânere** — Bară inox / Bară neagră / Push-to-open (today: Bară inox), plus a separate line **"Rândul de sus"** (today: push-to-open,
  since the top row opens without handles). The handle default applies to every cabinet that takes a handle.

Each row: label, a short explanation of what it affects, the control (segmented buttons or a select; colour as
swatches), and a "Modificat" marker when it differs from the published value. Show default, edited, and the
colour-reset note.

**Note for the configurator (one extra customer frame, C2):** today the customer chooses a handle **per cabinet** only.
The owner wants a **whole-kitchen handle choice** in the configurator's global settings sheet too: choosing a handle
there applies it to every cabinet that takes one, as the kitchen colour already does. Draw one frame of the existing
settings sheet (from `Lemnaria Configurator Mobil.dc.html`) with a new "Mânere" row (Bară inox / Bară neagră / Push-to-open)
under the colour row. NEW COPY for the row's label and hint.

### C1. Customer side: "prices were updated" notice (one small frame, in the configurator's style)

Draw this one frame in the configurator's own style (mobile 390 × 844 first, as the customer screens are), using
`Lemnaria Configurator Mobil.dc.html` for reference:
- When a customer opens a saved kitchen and **a price this kitchen uses has changed since they last saw it**, the price
  shows the **current** figure and a calm notice appears once: "Prețurile s-au actualizat de la ultima vizită. Prețul afișat este cel actual." with a
  "Am înțeles" button (NEW COPY). It is shown once per update, never again after it is dismissed.
- It is informational, not an error: no red, no old price, no "before / after" amounts.

## Rules and constraints

- **Out of scope; do not draw:** adding a new cabinet type, changing its 3D, its sizes or its price shape (those need a
  developer, and the owner accepts that); user accounts, roles and permissions beyond a sign-in screen; colour or
  finish management; any view of a kitchen's old price.
- **Future plans, not drawn now** (leave room, nothing more): editing sizes and defaults (min/max width, max height,
  default width and height); switching a cabinet type off so the configurator stops offering and placing it (a large
  change to the kitchen generator, deliberately postponed); the 700 mm depth multiplier.
- **Use illustrative numbers only and make them look illustrative** (round figures). They are not Lemnaria's prices
  and must not read as a real price list.
- Money: MDL, written "4 600 lei" (space as thousands separator, comma for decimals in inputs, e.g. "4,00").
- Copy: the cabinet, tier and accessory names above are the product's real copy. Every other string you write is
  **NEW COPY** (mark it). Russian: mark untranslated strings **RU TBD** and keep the layout tolerant of ~30% longer
  text.
- Errors and notices reuse `ContBlocks`' error / success / info blocks; draw the error pattern once, then list the copy
  variants.
- Accessibility: every input has a visible label and unit; the live preview is announced politely, not on every
  keystroke; focus rings visible; touch targets ≥ 44 px on mobile; dialogs trap focus and Esc closes.
- No new accent colours; motion ≤ 200 ms fades.

## Deliverable

One new file, `Lemnaria Dashboard.dc.html`, with D1–D9 at desktop 1440 × 900 and C1, C2 at mobile 390 × 844, the mobile
390 × 844 variant of D2, D3 and D7, the Russian variant of D2 and D3, and every listed state beside its default frame, each frame labelled with its
chip so a developer can compare it with the running app.
