# Claude Design brief — staff kitchen page: the cabinet list ("Lista corpurilor")

Paste everything below the line into Claude Design, and attach these files so the new frames share the existing look:
`Lemnaria Cont Lot 3.dc.html` (the staff area; frame S3, "Bucătăria clientului · doar citire", is the page this brief
extends), `Lemnaria Dashboard.dc.html` (frame D10B, "Pagina bucătăriei": the same page with the "Trimisă / Actuală"
switch and the list that marks the cabinets the two versions do not share; the cabinet list below **grows out of that
list**, it does not sit beside it), `Lemnaria Configurator Mobil.dc.html` (frames 3A and 3B, "Verifică designul": the
customer's review, whose rows this list adapts), and `ContBlocks2.dc.html` (blocks; do not edit `ContBlocks.dc.html`).

Sources this brief was written from, so a reviewer can check it: `docs/OWNER_FEEDBACK.md` item 5 (the owner's request
and the reminder to write this prompt before any implementation); the customer review as built
(`apps/web/src/app/d/[id]/review/review-screen.tsx:113-189`, `apps/web/src/review/review-groups.tsx:79-170`,
`apps/web/src/review/review-model.ts:44-58`: one row per cabinet, grouped by wall and band, a name, then the width, the
cabinet's own finish when it has one, and the handle it wears, then an amount); the cabinet facts the domain already
has (`packages/configurator-domain/src/queries/design-projection.ts:33-64`: wall, band, width, height, own finish, own
handle, worn handle, position); the staff page as built (`apps/web/src/staff/staff-kitchen-page.tsx:194-320`: three
desktop columns; `staff-kitchen-view.tsx:187-255`: the "Configurația trimisă" card's rows, shape, walls, material,
hardware, finish, number of cabinets, price; `kitchen-version-rows.ts:1-80`: the D10B list, name and W × H with a
same / differs / added / removed mark); ADR 0174 O-L3-1 (what the staff page may show of the client: profile contact,
request reference and date, the kitchen as sent).

Written 2026-11-13 for milestone M11, wave W5. Nothing here is built.

**Open, for the owner — not decided by this brief.**

1. **Prices per row.** The customer's review prints an amount on every row, from today's price book. The staff page
   deliberately shows no price worked out with today's book beside the request's estimates, because the sent kitchen
   was not priced with it and the figure would contradict them (`staff-kitchen-view.tsx:294-296`). The frames below
   draw rows **without** amounts, with one variant frame **with** amounts so the owner can choose.
2. **Depth.** A cabinet's depth is a kitchen-wide setting today, not a per-cabinet fact. The rows show W × H, and the
   depth once, in the whole-kitchen rows. Say if the workshop needs W × H × D on every row.
3. **Print or copy.** Whether staff need to print the list or copy it as text for the workshop. Drawn as an optional
   action in one frame; not built unless the owner asks.

---

You are adding one block, **Lista corpurilor** (the cabinet list), to the attached staff kitchen page of the
**Lemnaria** kitchen configurator — the private area where the shop's staff read the kitchens their clients designed
and sent for an offer. Lemnaria is a kitchen manufacturer in Moldova. The page is read-only for the kitchen: staff can
change a request's status and add notes, never the kitchen.

Keep the attached visual language exactly (tokens, type, the staff frame and nav, cards, badges, the "Doar
vizualizare" marker, the version switch). It is a working tool: dense, calm, readable at arm's length on a shop
monitor. **Desktop 1440 × 900 is the priority surface**; every frame must also work at **390 × 844** (columns stack in
the page's reading order, nothing scrolls horizontally, 44 px targets). Romanian is the interface language; add a
Russian-interface variant of the desktop frame (text about 30% longer).

## What the page already shows (frames S3 and D10B)

- **Left column:** the kitchen's picture (an inline, view-only 3D preview marked "Doar vizualizare"), the version
  switch "Trimisă / Actuală" when the client changed the kitchen after sending it, and under it a list of the cabinets
  the two versions do not share, each with a mark.
- **Middle column:** the request's status, the request (reference and date), the two estimates, the client's profile
  contact, and the line "Accesul este înregistrat în jurnal".
- **Right column:** the card "Configurația trimisă" (or "Configurația actuală"): shape, walls, material, hardware,
  finish, number of cabinets; and the notes.
- **New, being built separately:** a button **"Deschide în 3D"** next to the picture, opening the kitchen full-screen in
  the 3D configurator, read-only, in a new tab. Draw it in its place so the page is drawn once, complete.

## What the new block must do

The owner's words: staff need "the list of every cabinet with its size, colour and details, the way the customer sees
it" when they check their design. It is the shop's working list of what to make.

- **One row per cabinet**, grouped exactly as the customer's review groups them: by wall, then by band, in the order
  along the wall ("Perete A · bază", "Perete A · suspendate", "Perete B · bază"). Group headings carry a count.
- **Each row says**, in this order:
  - the cabinet's name as the configurator names it ("Corp bază spălător", "Corp de colț cu carusel", "Nișă mașină de
    spălat vase");
  - its size, **width × height in mm** ("800 × 720 mm");
  - its colour: the cabinet's own finish when it has one ("stejar natural"), otherwise a quiet "culoarea bucătăriei"
    (the kitchen-wide finish, which the summary card names once);
  - the handle it wears ("mâner bară 160 mm", "push-to-open", "fără mâner"), when it wears one;
  - when the kitchen has two versions: the mark against the other version, **as text, never colour alone** —
    "Identic" (quiet or omitted), "Modificat", "Adăugat de client", "Scos de client". A cabinet only the other version
    holds is listed in its group, struck through, with "Scos de client".
- **Whole-kitchen rows** after the groups, as the review has them (`review-groups.tsx:48-49`): material and hardware, the cabinet depth, and the
  accessories billed per sink.
- **The list describes the version on screen.** Switching "Trimisă / Actuală" re-renders the list, the picture and the
  summary together; the list's heading says which ("Corpurile — versiunea trimisă").
- **No row is a link and nothing is editable.** The preview selects nothing; there is no "Editează" here (that is the
  customer's). Rows may be hoverable for readability only.
- **A totals line** under the list: number of cabinets by band ("9 bază · 5 suspendate").

## Frames to draw

1. **L1 — Desktop, one version** (the kitchen was not changed after sending): the full three-column page with the new
   block in the left column under the picture, replacing the short D10B list. 14 cabinets in four groups, rows
   without amounts.
2. **L2 — Desktop, two versions, "Actuală" chosen**: the switch, the list with three marks ("Modificat" on one row,
   "Adăugat de client" on one, one struck-through "Scos de client"), and the summary card's own difference marks as
   D10B draws them.
3. **L3 — Desktop, rows with amounts**: L1 with an amount on every row and a total, for the owner's open question 1.
   Label the frame "Variantă — de decis".
4. **L4 — Desktop, a long kitchen**: 32 cabinets; show how the left column scrolls or how the block collapses by group
   (a group header that folds), and a cabinet name long enough to wrap to two lines.
5. **L5 — Mobile 390 × 844**: the page stacked; the list after the picture and the switch; groups fold, the first group
   open.
6. **L6 — A copy the page cannot list**: one version holds a cabinet this build no longer knows. Today the page then
   says it cannot list that version rather than listing half of it. Draw that notice in the block's place.
7. **L7 — Russian interface**, desktop, based on L2.
8. **L8 (optional) — "Tipărește lista" / "Copiază ca text"** in the block's header, for the owner's open question 3.

## Questions Claude Design should answer back

1. Does the list belong in the left column under the picture, or as its own full-width section under the three
   columns on desktop? Draw your recommendation and say why.
2. Is "culoarea bucătăriei" clear for a cabinet that follows the kitchen's finish, or should the row repeat the
   finish's name in a quieter weight?
3. How should a removed cabinet read in a list that describes the current version: struck through in its group, or
   gathered in a separate "Scoase de client" group at the end?
4. Any new block kind (foldable group, change mark, totals line) and any copy you added, as two lists.

## Checklist

- [ ] L1–L7 at 1440 × 900 and 390 × 844 as listed; L8 if drawn.
- [ ] Rows follow the review's grouping and order; name, W × H, colour, handle, change mark.
- [ ] Marks are text, never colour alone; the struck-through row is also labelled.
- [ ] No edit control, no link on a row, no selection in the preview.
- [ ] The "Deschide în 3D" button is drawn next to the picture.
- [ ] The version switch drives the list, the picture and the summary together.
- [ ] Russian variant fits without truncating the marks.
