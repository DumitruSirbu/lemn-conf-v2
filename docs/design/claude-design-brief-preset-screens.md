# Claude Design brief — preset screens (list, preview carousel, Save as preset)

Paste everything below the line into Claude Design, and attach these three files so the new frames match the existing
look exactly: `Lemnaria Configurator Mobil.dc.html` (priority), `Lemnaria Configurator Desktop.dc.html`, and
`Alegere corp - layouturi.dc.html`.

---

You are extending the Lemnaria kitchen configurator mock-ups. Keep the existing visual language **exactly** (type,
colours, spacing, radii, header, footer bars, button styles, the "1A…1F" frame labelling). Do not redesign what already
exists; add the frames below. **Mobile 390 × 844 is the priority surface**, then desktop 1440 × 900. Primary language is
Romanian; every frame must also survive the Russian strings (about 30% longer), so show a Russian variant of each key
frame. Touch targets are at least 44 × 44 px. Deliver the same way as the existing files: `.dc.html` frames, each with a
small label chip (as `1E` is labelled), mobile file and desktop file.

## What the product does (so the screens make sense)

The customer enters their room (shape and wall lengths), presses Continue, and the app now looks for **presets**: ready
kitchens an expert saved, whose room is within ±600 mm of the customer's room on every wall. If there are any, the
customer sees a **list of matching presets** before the usual "generate a kitchen" step. Each preset has a 4:3 picture
of the kitchen (a 3D render), a name, and sometimes a note that it was adjusted to fit their room. The customer can
**Preview** a preset in a pop-up with a slider through all matching presets, and **Select** one: that makes a private
copy for them and opens it in the 3D editor. They can also skip presets and generate a kitchen normally. If there are
no presets, this step is not shown at all.

Separately, the expert (the shop owner, for now) can press **Save as preset** in the editor to publish the kitchen on
screen as a preset.

## Screens to design

### A. Preset list — revise frame 1E

Keep 1E's header and sticky footer. Changes:
- **Cards show only**: the kitchen picture (4:3), the name, an optional one-line note "Ajustată ca să intre în camera
  ta", and **one button: "Previzualizează"**. No per-card select, no price, no chips, no "Folosește".
- Footer: **"Înapoi"** (secondary) and **"Generează o bucătărie nouă"** (primary-looking skip action that leads to the
  normal generation step).
- Heading "Bucătării care încap", with the existing room summary line under it.
- Show: 1 card, 3 cards, 8 cards (scroll, last card reachable above the sticky footer), a card whose picture failed to
  load (hatched placeholder with the name), a long name (two-line wrap, max 80 characters), an "adjusted" card, and the
  Russian variant.

### B. Wait screen for presets — keep 1D, one change

"Verificăm ce presete încap în camera ta…" with two skeleton cards. It only appears if the answer takes longer than a
quarter of a second, so also show it as a short, calm state (no jarring flash). Footer has only "Înapoi".

### C. Preview pop-up with slider (new — the main request)

Opens from "Previzualizează" on a card, on the tapped preset.
- **Mobile:** a bottom sheet (or near-full-height sheet) over a dimmed scrim; drag handle optional; a close button (×,
  44 × 44) top right.
- **Desktop:** a centred modal, about 880 px wide, same content.
- **Content, top to bottom:** a position counter ("2 / 5"), the large 4:3 kitchen picture (letterboxed, never cropped,
  never distorted), the name (wraps), the optional "Ajustată ca să intre în camera ta" note, a status line area (for
  "Se creează bucătăria ta…" and errors), and an action row: **"Anterior"**, **"Alege acest preset"** (the primary
  action), **"Următorul"**.
- **Slider behaviour to show:** previous/next arrows or buttons; the ends are **disabled, not wrapped**; with exactly
  one preset there is no previous/next at all; keyboard arrows work (show a focus ring state); optional swipe hint on
  mobile. Show neighbouring slides peeking at the edges if it looks good, otherwise a clean single slide.
- **States to draw:** first slide (Anterior disabled), middle slide, last slide (Următorul disabled), single preset,
  loading image (skeleton in the 4:3 area), image failed (hatched placeholder), long name, "adjusted" note present,
  **selecting** (button disabled, "Se creează bucătăria ta…"), **error** after a failed select
  ("Nu am putut crea bucătăria din acest preset. Încearcă din nou." with the button enabled again), **daily limit
  reached** ("Astăzi nu se mai pot crea alte bucătării. Încearcă mâine." button disabled), and the Russian variant
  (the button label "Выбрать этот пресет" must fit; let the action row wrap onto two rows if needed and show how).
- Mobile: make sure the action row stays reachable without scrolling the page behind it, and works with the on-screen
  keyboard closed (there is no text input in this pop-up).

### D. "Save as preset" in the editor (new)

This is an expert tool, visible to everyone for now (it will later appear only for administrators), so it must be
unobtrusive but findable.
- **The button:** a chip-style button "Salvează ca preset", 44 px high, at the **bottom-right of the 3D scene**, above
  the existing hint and the camera-preset chips, in the editor on desktop and mobile. Not in the top bar (no space). On
  mobile it hides while the edit sheet is open. Show it in context on the editor frames (mobile and desktop).
- **The dialog** (bottom sheet on mobile, centred card on desktop), titled "Salvează ca preset", intro text
  "Presetul păstrează bucătăria așa cum arată acum.", one optional text field labelled "Nume (opțional)" whose
  placeholder is the generated name, for example "În formă de L, 3200 × 2400 mm, alb", a primary "Salvează" and a
  secondary "Închide". 16 px input font on mobile (avoids zoom).
- **States to draw:** default; waiting for the latest edit to save ("Se salvează modificările tale…", Salvează
  disabled); saving ("Se salvează presetul…"); saved ("Presetul a fost salvat." — the dialog closes by itself after
  about one second; draw the saved state); and the refusal messages, each as an inline status below the field, with
  Salvează enabled again to retry:
  - "Bucătăria are încă probleme semnalate în editor. Rezolvă-le, apoi încearcă din nou."
  - "Pentru preset, bucătăria are nevoie de o chiuvetă și de o plită." (also the sink-only and hob-only variants)
  - "Bucătăria s-a schimbat între timp. Reîncarcă pagina și încearcă din nou."
  - "Numele nu este acceptat. Încearcă un nume mai scurt, fără caractere speciale."
  - "Imaginea nu a fost acceptată. Încearcă din nou."
  - "Pentru preset, bucătăria este prea mare. Elimină câteva elemente și încearcă din nou."
  - "Astăzi nu se mai pot salva alte presete. Încearcă mâine."
  - "Salvările sunt oprite pentru moment. Încearcă din nou puțin mai târziu."
  - "Presetele nu se pot salva acum. Încearcă din nou mai târziu."
  - "Modificările tale nu au putut fi salvate, așa că presetul nu se poate salva acum."
  - "Presetul nu a putut fi salvat. Încearcă din nou."
  Group them visually as one error pattern; do not draw eleven different layouts. Show three of them in full and list
  the rest as copy variants.

## Rules and constraints

- Use the exact Romanian strings above; they are the product's copy. Do not invent other text. If a label would
  need a new string, mark it clearly as "NEW COPY" so it can be approved.
- Russian variants use the informal "ты" and the strings given in the Russian catalogue; where you do not have the
  Russian string, mark it "RU TBD" and keep the layout tolerant of ~30% longer text.
- Everything must work at 320 px width without horizontal scrolling, and keep focus rings visible (keyboard users).
- Thumbnails are renders of the 3D kitchen at 1280 × 960; draw placeholder kitchens from the existing mock-ups, not new
  artwork. Always keep the 4:3 shape.
- Colours and motion: reuse the existing palette; no new accent colours. Motion is minimal (150–200 ms fades; no
  carousel wrap-around animation, because the ends do not wrap).
- Accessibility: the pop-up is a modal dialog (focus is trapped, Esc closes, focus returns to the "Previzualizează"
  button that opened it). Annotate the focus order on the frames.
- Mark every frame with a small label chip in the existing style: 1E (revised), 1D, 1G (preview pop-up), 1H (selecting
  and error states), 3S (Save as preset button in the editor), 3T (Save as preset dialog and states).

## Deliverable

Update both mock-up files (Mobil and Desktop) with the new and revised frames, with the Russian variants and the state
frames next to the default ones, so a developer can compare each state with the running app.
