# M8D — The preset screens to the owner's v2 mockup (list, wait, preview pop-up, Save as preset)

> **STATUS: PLANNED, 2026-10-18. Nothing is built.** This is the plan (`docs/WORKFLOW.md`, step 1) for bringing
> Step 1's preset screens and the editor's *Salvează ca preset* to the owner's v2 frames. The design was copied into
> `docs/design/mockups/` on 2026-10-18 (uncommitted at the time of writing; see §1). The frames are the owner's export,
> produced from `docs/design/claude-design-brief-preset-screens.md`.
>
> **Branch.** Not decided — owner question O-5 (§12). Planned against `fix/empty-space-fill-and-preset-save` at
> `bb112df0`, where the screens this plan changes were built by M8C waves P4 and P8.
>
> **Evidence tiers used below.** *[src]* read in the source at `bb112df0` by the architect, 2026-10-18; *[doc]* quoted
> from a repository record; *[rendered]* seen in a headless-Chromium render of the copied mockups, 2026-10-18 (method in
> `docs/design/README.md`); *[inf]* inference, not measured. **The running application was not captured for this plan**:
> every "current" claim is read from source and CSS, not from a screenshot. W1–W3 open with a capture of the current
> screens (§11) before code changes, so a claim here that the capture contradicts is corrected in the plan first.

## 0. Goal, scope, and what this plan is not

**Goal.** Steps 1 and 2's preset surfaces look and behave as frames 1D, 1E, 1G, 1H, 3S and 3T (and D1D … D3T) draw them,
on the phone first and on desktop, in Romanian and Russian, without changing what the product does with presets.

**In scope:** the preset wait (1D), the list (1E), the Preview pop-up (1G) and its select states (1H), the editor's
*Salvează ca preset* chip (3S) and its dialog (3T); one ADR-mandated behaviour the shipped pop-up lacks (swipe, §3 G-10).

**Not in scope:** matching, adaptation, the routes, the database, the image capture, limits, the copy of a preset (all
M8C's, unchanged); the editor's own chrome drawn as backdrop in 3S/3T; account screens (M8B); backlog 262 (Back
history), which v2 does not touch.

**No data-contract change.** The v2 card and slide show the image, the name, the optional *adjusted* note and one
button (§2). All of it is already on the client: `PresetSummary.imageUrl`, `typedName`/`nameFacts`
(`apps/web/src/preset/preset-summary-wire.ts:20-30`) and the offer's `changes.isUnchanged`
(`apps/web/src/room/preset-list.tsx:216-227`) [src]. No route, wire type or migration changes. For the record, should the
owner later want the old card's counts, price or chips back: counts and finish are derivable from `offer.design`, and the
price from the editor's own price function over that design (M8C §3.6 planned exactly that); still no new API [inf].

## 1. The design as copied, and how to read it

**Copied 2026-10-18, verbatim** (`cmp` against `design-source/presets/`, every file identical):

| File in `docs/design/mockups/` | Why |
| --- | --- |
| `Lemnaria Configurator Mobil.dc.html` (replaced) | Adds the *Presete v2* section at the top: *"Presete v2 — înlocuiește 1D/1E de mai jos · adaugă 1G, 1H, 3S, 3T"* and `<dc-import name="Presete" surface="mobile">` |
| `Lemnaria Configurator Desktop.dc.html` (replaced) | Same, *"… înlocuiește D1D/D1E de mai jos · adaugă D1G, D1H, D3S, D3T · cadre 1440 × 900"*, `surface="desktop"` |
| `Presete.dc.html` (new) | Every v2 frame. Template-driven: the frames are produced from data in its script |
| `support.js` (new) | The `.dc.html` runtime; nothing renders without it |
| `shots/presets/01-p.png` … `04-p.png` (new) | The four placeholder kitchens the frames draw (924 × 540, not product thumbnails) |

How to open them, what was not copied and why, and the **+5 line shift** of older citations into the two screen files:
`docs/design/README.md`. Apart from the inserted section, the only other difference in the two screen files is the
script's `priceTotal` default `"60 000"` → `"60.000"`; the drawn figure already read `60.000`, and nothing in this plan
takes the grouping from a mockup (ADR 0095).

**Citing a frame.** By its chip and element id: `Presete.dc.html#1g-single` is chip *1G · d*. Because the file is
template-driven, a frame's content is the template section **plus** its state entry in the script:

| Section | Template lines | State entries (script) |
| --- | --- | --- |
| Mobile list and wait (1D, 1E) | `Presete.dc.html:45-126` | `mList`, `:644-663` |
| Mobile pop-up (1G, 1H) | `:129-205` | `prevStates`, `:691-707` |
| Mobile save (3S, 3T) | `:208-321` | `mEdit`, `:733-748`; refusal list `errList`, `:759-771` |
| Desktop list and wait (D1D, D1E) | `:329-403` | `dList`, `:664-672` |
| Desktop pop-up (D1G, D1H) | `:406-490` | `dPrev`, `:709-712` |
| Desktop save (D3S, D3T) | `:493-569` | `dEdit`, `:749-757` |
| Strings | — | `RO`, `:582-595`; `RU`, `:596-609` |
| Shared tones and buttons | — | `btn`, `:620-628`; `ST` (status tones), `:629-636`; focus ring `RING`, `:619` |

**The frames are not authority for the backdrop they draw.** 3S/3T and D3S/D3T draw the editor behind the chip (top bar,
camera chips, price, hint); 1G/D1G draw the list behind the pop-up. That backdrop is context, not a spec: where it
differs from the shipped editor (e.g. *"De ce acest preț"* without the question mark ruled by ADR 0104 Amendment E, the
room summary in metres where ADR 0126 has millimetres, the desktop top bar without the back link of ADR 0104 Amendment
D) the shipped screen stands and no wave touches it.

## 2. Frame inventory (what v2 draws) [rendered + read in the script]

Every frame is 390 × 844 on the phone (320 × 844 for the *RU 320* variants) and 1440 × 900 on desktop. The designer's
notes are quoted in Romanian as written; the English after the dash is the architect's gloss.

### 2.1 The wait and the list — 1D, 1E, D1D, D1E

Header as today (*LEMNARIA*, `1/4`, *Preset*, locale chip). Body: heading *"Bucătării care încap"* (22 px; desktop 28 px),
room summary line under it. Mobile body padding `18px 18px 20px`, gap 14; desktop `32px 56px`, gap 24.

| Chip (id) | State | Designer's note |
| --- | --- | --- |
| 1D (`#1d`) | Wait | *"Neschimbat, cu o singură modificare: subsolul are doar „Înapoi". Apare numai dacă răspunsul întârzie peste 250 ms, cu fade de 200 ms; sub prag se trece direct în 1E (sau, fără presete, direct la generare) — fără flash."* — only Înapoi in the footer; appears only after 250 ms, fading in over 200 ms. Content: spinner + *"Verificăm ce presete încap în camera ta…"* in a `#f5f3f0` box; two skeleton cards: a 4:3 block, a 60 % name bar, a 44 px button bar (the second card shows its 4:3 block only). |
| 1E · 1 (`#1e-1`) | One preset | *"Card: imagine 4:3 (letterbox, niciodată decupată), nume, notă opțională, un singur buton. Fără preț, chipuri sau „Folosește". Alegerea se face din previzualizare (1G)."* |
| 1E · 3 (`#1e-3`) | Three, one adjusted | *"Nota de ajustare apare doar pe presetele adaptate camerei."* |
| 1E · 8 (`#1e-8`) | Eight, scrolling | *"Doar lista derulează; antetul și subsolul rămân fixe."* |
| 1E · 8↓ (`#1e-8-end`) | Scrolled to the end | *"Ultimul card e complet vizibil deasupra subsolului fix (20 px spațiu sub el)."* |
| 1E · img (`#1e-img`) | Image failed | *"Hașură + numele presetului în zona 4:3; cardul rămâne utilizabil."* — hatch `repeating-linear-gradient(135deg,#e9e4da 0 8px,#f1ede5 8px 16px)` with the name in a centred `rgba(250,248,244,.9)` label. |
| 1E · lung (`#1e-long`) | 80-character name | *"Numele se rupe pe rânduri, fără trunchiere; înălțimea cardului crește."* |
| 1E · RU (`#1e-ru`) | Russian | *"Butonul cardului ține și eticheta lungă pe un rând; footerul încape la 390 px."* |
| 1E · RU 320 (`#1e-ru-320`) | Russian at 320 px | *"Cel mai strâmt caz: butonul principal din subsol trece pe două rânduri, fără scroll orizontal."* |
| D1D (`#d1d`) | Wait | *"Ca pe mobil: doar „Înapoi", fade de 200 ms, nu apare deloc sub 250 ms."* — two skeletons in a 4-column grid. |
| D1E (`#d1e`) | Three | *"Grilă de 4 coloane; cardurile au aceeași structură ca pe mobil."* |
| D1E · 8 (`#d1e-8`) | Eight, a failed image, a long name | *"Lista derulează între antet și subsolul fix. Cardurile se aliniază sus, ca un nume lung să nu întindă rândul."* |
| D1E · RU (`#d1e-ru`) | Russian | (no note) |

**The card** (mobile `:93-112`, desktop `:369-388`): full-width 4:3 image box (`object-fit:contain`, `#efece5`
letterbox, bottom border), then padding `13px 14px 14px` (desktop `16px 18px 18px`), gap 10: name `700 15.5px/1.3`
(desktop 17 px), `overflow-wrap:anywhere`; the adjusted note (✓ in a 14 px `#2d5016` disc, text `#2d5016` 12 px on
`#eef1ea`, radius 9); one button *"Previzualizează"*, full card width, `min-height:44px`, radius 11, border `#dcd8ce`,
`700 13.5px` (desktop 14 px), colour `#5a3e25`. No price, counts, chips or *Folosește*.

**The footer** (mobile `:115-120`): *Înapoi* `flex:0 0 96px; min-height:52px`; *"Generează o bucătărie nouă"*
`flex:1; min-height:52px; text-wrap:balance` (wraps to two lines at 320 px). Desktop (`:392-397`): padding `16px 56px`,
*Înapoi* `min-width:120px; height:48px` left, the CTA `height:48px` right.

### 2.2 The Preview pop-up — 1G, 1H, D1G, D1H

**Mobile** (`:157-198`): scrim `rgba(28,24,20,.52)`; bottom sheet, radius `22px 22px 0 0`, padding `10px 18px 22px`,
gap 14. Top to bottom: a 40 × 4 handle; a row with the counter (*"2 / 5"*, `700 13px`, tabular) and a 44 × 44 **round**
× (`aria-label` = close); the 4:3 image (radius 12, `contain`); the name (`700 19px/1.25`, wraps); the adjusted note; a
**status area with `min-height:44px`, `aria-live="polite"`**; then **two rows**: *‹ Anterior* and *Următorul ›*
side by side (`flex:1`, `min-height:48px`), and *Alege acest preset* full width (`min-height:52px`, primary).

**Desktop** (`:439-484`): centred modal **880 px** wide, radius 18, padding `18px 28px 26px`; the image box
**440 px tall**, 4:3, centred; name `700 22px`; status area as on mobile; **one row**: *Anterior* left
(`flex:1 1 180px`), *Alege acest preset* centre (`min-width:260px; min-height:52px`), *Următorul* right.

| Chip (id) | State | Designer's note |
| --- | --- | --- |
| 1G · a (`#1g-first`) | First slide `1 / 5` | *"„Anterior" dezactivat la capăt — fără wrap. Se deschide pe presetul atins."* |
| 1G · b (`#1g-mid`) | Middle `3 / 5`, adjusted | *"Nota de ajustare sub nume. Zona de stare are înălțime rezervată, ca butoanele să nu sară."* |
| 1G · c (`#1g-last`) | Last `5 / 5` | *"„Următorul" dezactivat."* |
| 1G · d (`#1g-single`) | One preset | *"Fără contor și fără Anterior/Următorul."* |
| 1G · e (`#1g-loading`) | Image loading | *"Schelet în zona 4:3; restul cadrului e deja utilizabil."* (shimmer) |
| 1G · f (`#1g-failed`) | Image failed, long name | *"Hașură cu numele; numele lung se rupe pe rânduri."* |
| 1G · g (`#1g-focus`) | Keyboard, focus order | *"Focus prins în dialog: Tab 1→4 și înapoi la 1. ← / → schimbă slide-ul (fade 150 ms). Esc închide și readuce focusul pe „Previzualizează" al cardului deschis. Inel vizibil pe orice fundal."* Annotated order: 1 ×, 2 Anterior, 3 Următorul, 4 Alege. |
| 1H · a (`#1g-selecting`) | Selecting | *"Toate acțiunile blocate cât se creează copia; la succes se deschide editorul 3D."* Status: spinner + *"Se creează bucătăria ta…"*; Select keeps its label, disabled; Anterior/Următorul disabled. |
| 1H · b (`#1g-error`) | Select failed | *"Butonul redevine activ pentru reîncercare."* Error tone: `!` in a `#dc2626` disc, text `#8f2020` on `#fdf3f3`, border `#f1d4d4`. |
| 1H · c (`#1g-limit`) | Daily limit | *"Alegerea e dezactivată; răsfoirea rămâne posibilă."* **Warn** tone: `!` in `#b45309`, text `#7c4a0c` on `#f7ecdc`, border `#e6cfa8`. |
| 1G · RU (`#1g-ru`) | Russian | *"„Выбрать этот пресет" încape pe un rând; Anterior/Următorul stau pe rândul de deasupra."* |
| 1G · RU 320 (`#1g-ru-320`) | Russian, 320 px, long name, error | *"Cel mai strâmt caz: rândul de acțiuni rămâne vizibil fără derularea paginii din spate."* |
| D1G (`#d1g`) | In context, middle slide | *"Modal 880 px peste lista 1E. Imaginea are zona 4:3 de 440 px înălțime, cu letterbox. Ordinea focusului pe desktop: × → Anterior → Alege → Următorul."* |
| D1G · a … D1H · c, D1G · RU | Same states as mobile, as a modal | D1G · g: *"Ordinea focusului: × → Anterior → Alege → Următorul; ←/→ schimbă slide-ul, Esc închide."* |

**The two focus orders differ** (1G · g: × → Anterior → Următorul → Alege; D1G · g: × → Anterior → Alege → Următorul),
each matching its own visual order. One DOM serves both shells (ADR 0003 §5), so one of them departs: owner question
O-2.

### 2.3 Save as preset — 3S, 3T, D3S, D3T

**The chip** (3S `:241-246`; D3S `:531`): *"Salvează ca preset"*, 44 px high, radius 22, `rgba(250,248,244,.95)`,
border `#dcd8ce`, `700 12.5px` (desktop 13 px), colour `#5a3e25`; mobile `right:14px; bottom:64px` (above the hint),
desktop `right:28px; bottom:84px`.

**The dialog**, mobile (`:270-297`): scrim `.52`; bottom sheet, padding `10px 18px 22px`, gap 16: handle; a head row
with the title (`h2`, `700 19px`) **and the intro under it** (`13.5px`, `#6b5e52`) on the left and a **44 × 44 round ×**
on the right; the label *"Nume (opțional)"* (`700 12.5px`, ink) over the input (`min-height:48px`, radius 12, border
`#cfc7b9`, **16 px** text, placeholder = generated name in `#8d8377`); the status area (`min-height:44px`, live); the
actions, wrapping: *Închide* (`min-width:96px; min-height:52px`) then *Salvează* (`flex:1 1 140px; min-height:52px`).
Desktop (`:537-562`): a **520 px card centred** over the scene, padding `24px 28px 26px`, title 22 px, intro 14 px, input
15 px / 46 px, actions **right-aligned**: *Închide* (48 px) then *Salvează* (`min-width:150px`, 48 px).

| Chip (id) | State | Designer's note |
| --- | --- | --- |
| 3S (`#3s`) | Chip in the editor | *"Chip de 44 px în dreapta-jos a scenei, deasupra indiciului; vizibil pentru toți deocamdată, mai târziu doar pentru administratori. Nu în bara de sus."* |
| 3S · sheet (`#3s-sheet`) | Edit sheet open | *"Cât timp sheet-ul de editare e deschis, chipul se ascunde."* |
| 3S · focus (`#3s-focus`) | Keyboard focus | *"Inel de focus vizibil peste scena 3D."* |
| 3S · RU (`#3s-ru`) | Russian | *"Eticheta mai lungă încape lângă marginea dreaptă."* |
| 3T · a (`#3t`) | Default | *"Placeholder = numele generat. Focusul intră în câmp (1), apoi Închide, Salvează, ×; Esc închide. Font 16 px în câmp (fără zoom pe iOS)."* |
| 3T · b (`#3t-typed`) | Name typed, focused | *"Câmpul activ primește inelul de focus."* |
| 3T · c (`#3t-wait`) | Waiting for the last edit | *"„Salvează" dezactivat până se salvează ultima editare."* Progress tone. |
| 3T · d (`#3t-saving`) | Saving | *"Câmpul și butonul sunt blocate."* Progress tone; input background `#f5f3f0`. |
| 3T · e (`#3t-saved`) | Saved | *"Dialogul se închide singur după ~1 s, cu fade de 200 ms; focusul revine pe chip."* OK tone: ✓ in `#2d5016`, `#eef1ea` / `#d5dfcc`. |
| 3T · f (`#3t-err1`) | Refusal: findings | *"Tiparul de eroare comun tuturor refuzurilor; „Salvează" activ pentru reîncercare."* |
| 3T · g (`#3t-err2`) | Refusal: sink and hob | *"Variantele doar-chiuvetă / doar-plită: vezi lista de copy."* |
| 3T · h (`#3t-err3`) | Refusal: name | *"Valoarea rămâne în câmp, ca să poată fi corectată."* |
| 3T · RU, 3T · RU 320 | Russian; Russian at 320 with an error | *"Butoanele trec pe două rânduri când nu încap."* |
| 3T · copy (`#3t-copy`) | The refusal list | *"Toate apar în zona de stare de sub câmp, cu tiparul de eroare din 3T-f. „Salvează" redevine activ pentru reîncercare."* |
| D3S, D3T · a/c/d/e/f, D3T · RU | Desktop twins | D3S: *"Dreapta-jos a scenei, deasupra rândului indiciului; nu în bara de sus."* D3T · a: *"Card centrat 520 px peste scenă. Focus: câmp → Închide → Salvează → ×."* |

**Page-wide notes** (`:32-36`): *"Variantele rusești folosesc șiruri de probă, marcate RU TBD, cu excepția „Выбрать этот
пресет". Textele noi sunt marcate NEW COPY."*; *"Inel de focus: 2 px gol + 2 px cerneală"* (`box-shadow: 0 0 0 2px
#faf8f4, 0 0 0 4px #1c1d1f`); *"Mișcare: fade 150–200 ms, fără wrap"*.

## 3. The gaps: what ships today against what v2 draws, ranked by visible impact

"Today" is `bb112df0` [src]. Impact: **H** a customer sees a different screen; **M** a different state or detail;
**L** a measurement or motion. Wave per §8.

| # | Frames | Today [src] | v2 draws | Impact | Wave |
| --- | --- | --- | --- | --- | --- |
| G-1 | 1E, 1E · 1/3/8 | The phone card is a **row**: a 112 px 4:3 thumbnail beside the name, note and a left-aligned, content-width *Previzualizează* (`preset-chooser.module.css:119-137, 198-210`) | A **column**: full-width 4:3 image, then name, note and a full-width 44 px button | **H** | W1 |
| G-2 | 3T, D3T | The dialog is the shared `ConfirmationDialog` (`save-as-preset.tsx:119-155`; `settings/confirmation-dialog.tsx:66-132`): title only in a bordered head, intro as body text, **no ×**, 44 px buttons centred; on desktop the settings surface, **900 px wide, hung 90.5 px from the top** (`settings/global-settings.module.css:638-662`) | Own layout: title + intro beside a round ×, 52 px buttons (48 desktop), desktop **520 px card centred** on both axes, buttons right-aligned | **H** | W3 |
| G-3 | 1G, D1G | One wrapping row *Anterior · Alege · Următorul* (`preset-carousel-dialog.tsx:218-264`, `.dialogActions` `:324-329`); square × (radius 12, `:271-283`); no handle; name 18 px; desktop image is the dialog's full width at 4:3 and shrinks only when the dialog's `max-height` squeezes it (`:285-301, 441-452`) | Phone: *Anterior / Următorul* row over a full-width 52 px *Alege*; round ×; handle; name 19 px. Desktop: *Anterior* left, *Alege* centre (≥ 260 px), *Următorul* right; image box 440 px tall; name 22 px | **H** | W2 |
| G-4 | 1H · a/b/c, 3T · c–h | Status is a plain sentence (`.slideStatus` `:310-320`; `.presetStatus` `configure.module.css:536-541`); *selecting* replaces Select's **label** (`preset-carousel-dialog.tsx:245-247`); the limit is drawn in the refusal red | A toned box per state — progress (spinner), error (`!`, red), warn (`!`, amber, the limit only), ok (✓, green) — in a 44 px reserved area; Select keeps its label while selecting | **M** | W2 (shared component), W3 |
| G-5 | 1E · img, 1G · e, 1G · f, D1E · 8 | A failed image is a bare hatch with `role="img"` (`preset-carousel-dialog.tsx:65-92`); a loading image is the plain `#efece5` box | Failed: hatch **plus the name, visible**, centred. Loading: a shimmering 4:3 skeleton | **M** | W1 |
| G-6 | 1D, D1D | After 250 ms the content appears at once (`preset-list.tsx:42-63`); skeletons are a 168 px block and two thin lines (`preset-chooser.module.css:80-106`) | Fades in over 200 ms; skeletons in the v2 card's shape (4:3, name bar, 44 px button bar) | **M** | W1 |
| G-7 | 3T · a, 3T · d/e | Focus lands on the dialog surface (`confirmation-dialog.tsx:88-90`); the input is never disabled (`save-as-preset.tsx:135-146`); the saved state closes at 1000 ms without a fade (`use-save-as-preset.ts:57, 119-132`) | Focus into the field first; ring order field → Închide → Salvează → ×; field locked while saving and once saved; close fades over 200 ms after ~1 s | **M** | W3 |
| G-8 | 1G · d | A single preset still shows *"1 / 1"* (`preset-carousel-dialog.tsx:184-194`) | No counter at all | **L** | W2 |
| G-9 | 3S, D3S | Chip 12 px type, `padding: 8px 14px`, `margin: 0 14px 10px 0` in the scene's bottom stack (`configure.module.css:493-513`); its focus style is the browser default [src: `grep focus-visible configure.module.css` returns nothing] | 12.5 px (13 desktop), `padding: 0 16px` (18), radius 22, right 14 / 28 px; a visible ring over the scene (3S · focus) | **L** | W3 |
| G-10 | 1G (ADR, not a frame) | **No swipe.** The pop-up has no pointer or touch handling [src: `preset-carousel-dialog.tsx` whole file] | — (the brief calls a swipe *hint* optional) | **M** (functional) | W2 |
| G-11 | 1G · g, 3T · e | No fade on a slide change or on the dialog's close | 150 ms slide fade; 200 ms close fade; none under reduced motion | **L** | W2, W3 |
| G-12 | D1E | Body `max-width: 1248px; padding: 48px 40px`, grid gap 16 (`preset-chooser.module.css:408-430`); the footer is the shared D1B/D1F footer, 88 px band (`room/room.module.css:1604-1621`); grid items stretch | Body `32px 56px`, gap 20, cards aligned to the top; footer `16px 56px` with 48 px buttons | **L** | W1 (gap 20 and `align-items:start` only; D-4) |
| G-13 | 1E · RU 320 | The footer CTA is `height: 52px` with `line-height: 1` (`room/room.module.css:220-232`) | `min-height: 52px`, two balanced lines when it does not fit | **L** [inf: whether it clips today is unmeasured] | W1 (only if the capture shows clipping; D-5) |

**G-10 is an implementation defect, not a mockup delta.** ADR 0003's dated amendment of 2026-10-17 (decision 4b) states
*"Previous and Next (at least 44 px; swipe on the phone, arrow keys on desktop)"* [doc: `0003-…md:343`], and M8C wave
P8's slice S1 listed *"swipe and arrow keys"* [doc: `M8C-….md:934`]. The shipped pop-up has the arrow keys and not the
swipe, and no record departs from it [src; grep of `docs/decisions` and the M8C plan for "swipe"]. Classified as an
implementation defect against a recorded decision; fixed in W2.

**Matches already, kept as is** [src]: the list scrolls between a fixed header and footer (`.body` `:14-22`); the 1D
grace of 250 ms with nothing painted and no flash when the answer is faster (`preset-list.tsx:32-49`); only *Înapoi* in
1D's footer; the pop-up opens on the tapped preset, never wraps, disables Previous/Next at the ends and while selecting,
hides both for one preset, traps Tab, closes on Escape and returns focus to the opening card (`preset-list.tsx:287-322`);
the limit leaves browsing possible (`dismissFailure` clears only `failed`, `use-generation.ts:357-358`); the chip hides
while the phone's sheet is open and stays on desktop (`configure.module.css:509-513, 712-713`); the 16 px name input;
the saved notice's 1000 ms (owner ruling of 2026-10-18, `use-save-as-preset.ts:57`); a refusal keeps the typed name
(state survives in `typedName`); the adjusted note's colours.

## 4. Copy

**No new string is needed.** Every word v2 draws exists in `apps/web/src/messages/ro.json` [src]:

| v2 string (`Presete.dc.html` `RO`) | Catalogue key | Approval [doc: `tests/support/approved-romanian-messages.ts`] |
| --- | --- | --- |
| *Bucătării care încap*, *Verificăm ce presete încap în camera ta…*, *Previzualizează*, *Ajustată ca să intre în camera ta*, *Generează o bucătărie nouă*, *Anterior*, *Următorul*, *Alege acest preset*, *Se creează bucătăria ta…* | `presetChooser.heading`, `.waiting`, `.preview`, `.adjusted`, `.skip`, `.previous`, `.next`, `.select`, `.selecting` | Approved 2026-10-18 (relayed) |
| *Nu am putut crea bucătăria din acest preset. Încearcă din nou.* | `presetChooser.selectFailed` | **Drafted, not approved** — identical to v2 |
| *Astăzi nu se mai pot crea alte bucătării. Încearcă mâine.* | `presetChooser.selectLimitReached` = *"… Încearcă **din nou** mâine."* | **Drafted, not approved — and differs from v2** (O-1) |
| *Închide* (the pop-up's × `aria-label`) | `presetChooser.close` = *"Închide previzualizarea"* | Approved; **keep the catalogue's**, the longer name says what closes |
| *Salvează ca preset*, *Presetul păstrează bucătăria așa cum arată acum.*, *Nume (opțional)*, *Salvează*, *Închide*, *Se salvează modificările tale…*, *Se salvează presetul…*, *Presetul a fost salvat.* | `presetSave.open`, `.intro`, `.nameLabel`, `.confirm`, `.close`, `.waiting`, `.saving`, `.saved` | Approved 2026-10-18 |
| The generated-name placeholder *"În formă de L, 3200 × 2400 mm, alb"* | `presetSave.generatedName` | Format approved 2026-10-18 |
| The eleven refusals of the brief | `presetSave.refusal.*` (13 keys) | Approved 2026-10-18 |

- **Two v2 tags are stale.** 3T · copy marks the sink-only and hob-only sentences *NEW COPY*; both exist and are
  approved (`refusal.missingSink`, `refusal.missingHob`). No action.
- **The × of the save dialog needs an accessible name.** It does what *Închide* does, so it reuses `presetSave.close`
  (*"Închide"*): one function, one name (WCAG 3.2.4). No new key.
- **Russian.** v2 says its Russian is sample text (*RU TBD*) except *«Выбрать этот пресет»*, which equals the catalogue's
  `presetChooser.select`. The catalogue's Russian stays; it is an agent's draft the owner has not read (ADR 0095 decision
  2, fourth step). Per key, v2's sample (`Presete.dc.html:596-609`) against `ru.json`, with character counts [src]; the
  longer of the two is the layout stress input for §9 X-5, never shipped:

  | Key | v2 sample | Catalogue `ru.json` | Longer |
  | --- | --- | --- | --- |
  | `presetChooser.heading` | Кухни, которые поместятся (25) | Подходящие кухни (16) | v2 |
  | `presetChooser.waiting` | Проверяем, какие пресеты поместятся в твою комнату… (51) | same | — |
  | `presetChooser.preview` | Предварительный просмотр (24) | Просмотр (8) | v2 |
  | `presetChooser.adjusted` | Подогнана, чтобы поместиться в твою комнату (43) | Скорректирована, чтобы поместиться в твою комнату (49) | catalogue |
  | `room.back` | Назад (5) | same | — |
  | `presetChooser.skip` | Сгенерировать новую кухню (25) | Создать новую кухню (19) | v2 |
  | `presetChooser.previous` / `.next` / `.select` / `.selecting` | Предыдущий / Следующий / Выбрать этот пресет / Создаём твою кухню… | same | — |
  | `presetChooser.close` (× label) | Закрыть (7) | Закрыть просмотр (16) | catalogue |
  | `presetChooser.selectFailed` | Не удалось создать кухню из этого пресета. Попробуй ещё раз. (60) | … Попробуй снова. (58) | v2 |
  | `presetChooser.selectLimitReached` | Сегодня больше нельзя создавать кухни. Попробуй завтра. (55) | Сегодня новые кухни больше создать нельзя. Попробуй завтра. (59) | catalogue |
  | `presetSave.open`, `.nameLabel`, `.confirm`, `.waiting`, `.saving`, `.saved`, `.refusal.failed` | Сохранить как пресет / Название (необязательно) / Сохранить / Сохраняем твои изменения… / Сохраняем пресет… / Пресет сохранён. / Не удалось сохранить пресет. Попробуй ещё раз. | same | — |
  | `presetSave.intro` | Пресет сохранит кухню такой, какая она сейчас. (46) | Пресет сохранит кухню в том виде, в каком она сейчас. (53) | catalogue |
  | The other twelve `presetSave.refusal.*` | not drawn in Russian | catalogue only | catalogue |
- **Backdrop strings are not copy decisions** (§1): *"De ce acest preț"* stays *"De ce acest preț?"* (ADR 0104 E); the room
  summary stays in millimetres (ADR 0126); the frame's metres are not adopted.

## 5. Accessibility

- **Two modal dialogs, one pattern.** Both pop-ups keep `role="dialog"`, `aria-modal`, the Tab trap (`trapTab`), Escape
  (`useEscapeToDismiss`) and the inert screen (`useBackgroundInert`), and return focus to their opener after unmounting.
  The save dialog leaves `ConfirmationDialog` (D-1) but not these three primitives.
- **Live regions.** One `role="status"` per dialog, rendered before it has anything to say (as today). The selecting
  sentence moves from the button's label into that region (G-4), so it is announced once; the button keeps its name and
  gets `disabled` + `aria-busy`.
- **Tones are not colour alone.** Each tone carries its glyph (spinner, `!`, ✓) and a sentence; the glyphs are
  `aria-hidden`. Text colours on their backgrounds (`#8f2020`/`#fdf3f3`, `#7c4a0c`/`#f7ecdc`, `#2d5016`/`#eef1ea`) already
  ship elsewhere in the app [src: each hex found in existing stylesheets]; QA measures ≥ 4.5:1 for each pair.
- **Failed image.** The hatch keeps `role="img"` with the name as its label; the visible name drawn inside it is
  `aria-hidden`, so a screen reader hears it once.
- **Focus ring.** The frames draw a box-shadow ring (2 px paper + 2 px ink); the app draws `outline: 2px solid
  var(--accent-strong); outline-offset: 2px` on these controls. Kept unless the owner rules otherwise (O-4). Either way
  the ring stays visible over the 3D scene (3S · focus) and over the dimmed scrim.
- **Touch targets** stay ≥ 44 × 44 everywhere (DEVELOPMENT-SPEC §10.1; ADR 0082 decision 8); v2's are 44–52.
- **Focus order across shells** is a decision (O-2); the plan never lets visual and DOM order disagree on the phone, the
  priority surface.
- **Reduced motion.** Every v2 fade and shimmer is off under `prefers-reduced-motion: reduce` (as the spinner and
  skeleton already are, `preset-chooser.module.css:399-404`).
- **Swipe is never the only way.** Previous/Next stay; a swipe never starts from a vertical scroll; the slide has
  `touch-action: pan-y` so the sheet still scrolls on a short phone.

## 6. Decision-record sweep (WORKFLOW, *Sweep the decision records before deciding*)

| Record | What it says | How it is settled here |
| --- | --- | --- |
| ADR 0003 decision 4b and its amendment of 2026-10-17 | Card has Preview only; carousel with Previous/Next, swipe on the phone, arrows on desktop, position, Select; no wrap; one preset → no Previous/Next | **Followed.** v2 draws the same. Swipe is owed (G-10). |
| ADR 0104 decision 1; Amendment F | Mockups are the chrome spec; 1D/1E/D1E departed from by ruling; *"The mockup files are not edited"* | The files are **replaced by the owner's export, not edited** (precedent `28c96fb4`). A new dated amendment (G) is owed: v2 is the chrome spec for these frames and supersedes Amendment F's reading of the old 1D/1E/D1E (§13). |
| ADR 0104 Amendment E | *"De ce acest preț?"* | Backdrop only; unchanged (§1). |
| ADR 0104 Amendment D | The back link and its confirmation share `ConfirmationDialog` | The save dialog **leaves** that shell (D-1), so back confirmation is untouched. |
| ADR 0113; ADR 0095 decision 2 | Copy approved as drafted enters the lock in the wave adding it; no agent approves Russian | No new keys; the two draft keys wait for O-1. |
| ADR 0126 | Room lengths in whole millimetres | Summary line unchanged. |
| ADR 0112 decision 6, Amendment A | Stored image 1280 × 960, 4:3; the card and preview show it | `contain` in a 4:3 box shows it whole. |
| ADR 0109 Amendment A3.3 | The declared change is shown | The adjusted note, unchanged copy. |
| M8C §3.6 (plan, not a record) | The card shows counts, finish, handle, price | **Superseded by v2** (*"Fără preț, chipuri…"*); recorded in Amendment G; closes backlog 263. |
| ADR 0168 | The owner's "no new tests" — **for M8C** | Not M8D's. M8D follows the paired-test rule (WORKFLOW, *Scope discipline*). |
| Owner WCAG ruling 2026-09-03 (`--ink-faint: #6b6860` over the frames' `#7d7a72`) | A contrast ruling outranks a frame | The frames' `#7d7a72` and `#8d8377` greys are taken as the app's tokens, not literally. |
| ADR 0003 §5 | One implementation; only the layout shell branches | No viewport branch in TypeScript; CSS at the existing 900 px shell breakpoint only. O-3's recommendation tests the **pointer**, not the width. |

## 7. Decisions this plan takes (architect), with alternatives

- **D-1 — The save dialog gets its own shell; `ConfirmationDialog` is not changed.** v2's dialog differs from the shared
  one in head (title + intro + ×), button height and alignment, and desktop box (520 centred vs the settings surface's
  900 hung). *Alternatives:* (a) add size/× props to `ConfirmationDialog` — reaches back confirmation (ADR 0104 D) and the
  settings confirm step, whose geometry is pinned by `tests/settings/global-settings-modal-centring.test.ts`; (b) restyle
  the shared surface — changes two other screens. *Chosen:* compose the save dialog from `trapTab`,
  `useEscapeToDismiss` and `useBackgroundInert` as `PresetCarouselDialog` already does. Cost: a second dialog markup;
  accepted, it is what the carousel set as the pattern.
- **D-2 — One status notice for both preset dialogs.** v2 draws one tone set (`ST`, `Presete.dc.html:629-636`) in both.
  A new `apps/web/src/preset/preset-status-notice.tsx` (+ CSS module) renders `{ tone, sentence }`; W2 creates it, W3
  reuses it. *Alternative:* two copies — rejected (DRY, and the tones would drift).
- **D-3 — `PresetImage` and `AdjustedNote` move to `room/preset-image.tsx`** in W1, because W1 adds the loading and
  failed states the card and the slide share, and W2 then edits the dialog file alone. A move plus the new states, not
  the split of backlog 272 (which stays open).
- **D-4 — Desktop list chrome stays as shipped except gap 20 and top alignment.** D1E's `32px 56px` body and its 48 px
  footer would fork the footer D1B, D1C and D1F share (`room.module.css:1602-1621`, wave 7L). Low impact (G-12);
  not worth a fork.
- **D-5 — The footer CTA is touched only if measured clipping requires it**, and then as `min-height` on
  `.composeFooter .cta` with 1B/1F re-captured, because `.cta` is shared with 1B and 1F.
- **D-6 — `notSaved` keeps *Salvează* disabled.** 3T · copy says every refusal re-enables *Salvează*; `notSaved` is not a
  route refusal but the editor's own save having stopped for good (`readiness: "blocked"`,
  `use-save-as-preset.ts:26-45`), so a retry cannot succeed. Same tone, button stays disabled.
- **D-7 — While a write is in flight, nothing closes either dialog** (today's rule, `preset-carousel-dialog.tsx:126-127`,
  `save-as-preset.tsx:115-116`). v2's 1H · a agrees (*"Toate acțiunile blocate"*); in 3T · d the frame does not draw
  *Închide* disabled. In both dialogs the controls that cannot act are drawn disabled, and at least one of them —
  × and Select in the pop-up, *Închide* and × in the save dialog — uses `aria-disabled` (focusable, inert to
  activation) rather than `disabled`, so the Tab ring is never empty and focus never falls to `body` (X-7). Today's
  pop-up empties its ring while selecting (C-6); that is corrected, not kept.
- **D-8 — The handles (40 × 4) are decoration**, `aria-hidden`, with no drag-to-close, as the settings sheet's grabber
  already is.

## 8. Waves

Every wave: plan → implement → adversarial QA → review → verify → commit → (close in W4). **Tier: Light + visual,
mobile-gated** for W1–W3 (UI assembly against a settled contract; WORKFLOW, *How much review a wave gets*): adversarial
QA, then one combined reviewer, plus a visual reviewer with captures at 390 × 844 and 320 × 844 (phone, priority) and
1440 × 900, in `ro` and `ru`. A wave cannot close on desktop evidence (`milestones/README.md`, mobile-gated rule).
Existing `data-testid`s are kept in every wave (the owner-loop e2e, `tests/e2e/support/preset-owner-loop.ts`, uses
them). New e2e coverage goes to the phone project first: desktop shard 2 is at its ceiling (backlog 266).

### W0 — Docs and owner answers (Coordinator-only; the scribe writes)

- Commit the copied design and `docs/design/README.md` (this plan's §1); this plan.
- Owner answers O-1 … O-6 (§12) before W1 is dispatched; O-2 blocks W2, O-3 blocks W3.
- The scribe writes ADR 0104 Amendment G and the notes in §13.

### W1 — The wait and the list: 1D, 1E, D1D, D1E (Light + visual; mobile-gated)

| Slice | Owner | Work | Production files | Reading |
| --- | --- | --- | --- | --- |
| **S1** | Developer (UI) | (1) Move `PresetImage` and `AdjustedNote` to `room/preset-image.tsx` (D-3); add the loading state (4:3 shimmer until `load`) and the failed state's visible name (`aria-hidden`), G-5. (2) The card as a column: full-width 4:3 image (`contain`), name, note, full-width 44 px *Previzualizează*, G-1. (3) 1D: fade in over 200 ms after the 250 ms grace; skeletons in the v2 card's shape, G-6. (4) D1E: gap 20, `align-items: start` (D-4). (5) Only if the start-of-wave capture shows the CTA clipped at 320 px: D-5 | `room/preset-image.tsx` (new); `room/preset-list.tsx`; `room/preset-carousel-dialog.tsx` (imports only); `room/preset-chooser.module.css`; `room/room.module.css` (only under (5)) | This plan §1, §2.1, §3 G-1, G-5, G-6, G-12, G-13, §5, §7 D-3–D-5, §9 L-*. Frames `Presete.dc.html#1d`, `#1e-1` … `#1e-ru-320`, `#d1d` … `#d1e-ru` (template `:45-126, 329-403`; states `:644-672`). ADR 0003 4b (amendment 2026-10-17); ADR 0104 F and the new G; ADR 0112 d6; DEVELOPMENT-SPEC §10.1. `browser-and-visual-qa.md` |

- **QA, Reading:** this plan §3, §9 L-1 … L-10, X-1 … X-6; the diff; `room/preset-list.tsx`, `room/preset-image.tsx`;
  `tests/room/preset-carousel-dialog.dom.test.ts` (what it already pins); `engineering-conventions.md`, *Coverage an
  adversarial pass owes*. **QA owes:** L-2 in Playwright with its three fixed images (a jsdom sweep could not fail);
  L-4 with names of 1 to 80 characters including one 80-character word; L-7 with answers at 0, 249, 250, 251 and
  3000 ms.
- **Visual, Reading:** §2.1; frames above; captures of 1D (held past 250 ms), 1E with 1, 3 and 8 offers, scrolled to the
  end, a failed image, an 80-character name, at 390 and 320 in `ro` and `ru`, and D1E at 1440 × 900.
- **Combined reviewer (Light), Reading:** the full diff; §7 D-3–D-5; `engineering-conventions.md`; ADR 0104 G.

### W2 — The Preview pop-up: 1G, 1H, D1G, D1H, and the swipe (Light + visual; mobile-gated). After W1; needs O-2.

| Slice | Owner | Work | Production files | Reading |
| --- | --- | --- | --- | --- |
| **S1** | Developer (UI) | (1) `preset/preset-status-notice.tsx` + CSS: tones progress, error, warn, ok (D-2). (2) The pop-up's layout: handle, round 44 px ×, counter hidden for one slide (G-8), name 19/22 px, 44 px status area, the action rows per O-2 (G-3), desktop image box 440 px tall within the viewport (C-4). (3) The selecting sentence in the status area, Select keeps its label (G-4), and Select and × become `aria-disabled` rather than `disabled` while selecting (C-6, X-7); the limit in the warn tone. (4) Swipe on touch (G-10), with **one pure function** for the slide transition — `(index, count, step) → index` — that the buttons, the arrow keys and the swipe all call, so C-10's property tests that function and one DOM test per input proves the wiring; 150 ms slide fade (G-11). (5) Scrim `.52` | `preset/preset-status-notice.tsx` (new) and its `.module.css` (new); `room/preset-carousel-dialog.tsx`; `room/preset-chooser.module.css`; a swipe hook if extracted, `room/use-slide-swipe.ts` (new) | This plan §2.2, §3 G-3, G-4, G-8, G-10, G-11, §5, §7 D-2, D-7, D-8, §9 C-*; O-2's answer. Frames `#1g-first` … `#1g-ru-320`, `#d1g` … `#d1g-ru` (template `:129-205, 406-490`; states `:691-712`; tones `:619-636`). ADR 0003 4b and its amendment of 2026-10-17; ADR 0109 d4; `room/use-generation.ts:252-368` (copy status, read only); DEVELOPMENT-SPEC §10.1 |

- **QA, Reading:** this plan §9 C-1 … C-14, X-*; the diff; `room/use-generation.ts:252-368`; M8C §6's P-criteria on the
  copy [doc: `M8C-….md` §6] for what must not regress. **QA owes:** C-10 as a fast-check property over the transition
  function, with sequences of {−1, +1, 0 (a cancelled swipe)} of length 0–20 from any start index over 1–8 slides: the
  index stays in range and never wraps; plus one DOM test each that Previous, Next, ArrowLeft, ArrowRight and a
  synthetic swipe call it, and that Select names `slides[index].id` after a mixed sequence; X-7 in every state; Select
  twice makes one design (the attempt's one-row rule); at most three images mounted at any time.
- **Visual, Reading:** §2.2; frames above; captures of first, middle, last, single, loading, failed + long name,
  selecting, error, limit, at 390 and 320 (`ru` with the 80-character name and the error), and D1G at 1440 × 900 and
  1280 × 720.
- **Combined reviewer (Light), Reading:** the full diff; §5; §7 D-2, D-7, D-8; O-2's answer; ADR 0003 4b amendment;
  `engineering-conventions.md`.

### W3 — *Salvează ca preset*: 3S, 3T, D3S, D3T (Light + visual; mobile-gated). After W2 (reuses D-2); needs O-3.

| Slice | Owner | Work | Production files | Reading |
| --- | --- | --- | --- | --- |
| **S1** | Developer (UI) | (1) The dialog in its own shell (D-1): handle, title + intro + round × (`aria-label` `presetSave.close`), label and input, status area with the D-2 notice, *Închide* + *Salvează*; desktop 520 px centred, buttons right-aligned. (2) Focus per O-3 and the ring order field → Închide → Salvează → × (G-7). (3) The input disabled while sending and once saved; *Închide*/× `aria-disabled` while sending (D-7); `notSaved` per D-6. (4) The saved close: readable 1000 ms, then a 200 ms fade, then unmount and focus to the chip (G-7, G-11). (5) The chip's type, padding and offsets, and a visible focus ring over the scene (G-9). **Test ids:** today `ConfirmationDialog` generates them from `testIdPrefix="save-as-preset"`, so a grep for literals misses them; the new shell writes them by hand. In use [src, grep of `apps/web/tests`]: `save-as-preset` (the chip), `save-as-preset-dialog`, `save-as-preset-name`, `save-as-preset-status`, `save-as-preset-confirm`, `save-as-preset-confirm-back` (`tests/e2e/support/preset-owner-loop.ts:148-163`, `tests/app/configurator/configure/save-as-preset.dom.test.ts`); `-scrim` and `-confirm-body` are generated too and kept | `app/configurator/configure/save-as-preset.tsx`; `app/configurator/configure/save-as-preset.module.css` (new, the dialog's styles); `app/configurator/configure/configure.module.css` (the chip only); `app/configurator/configure/use-save-as-preset.ts` (the fade's timing only) | This plan §2.3, §3 G-2, G-4, G-7, G-9, G-11, §4, §5, §7 D-1, D-2, D-6, D-7, §9 S-*; O-3's answer. Frames `#3s` … `#3t-copy`, `#d3s` … `#d3t-ru` (template `:208-321, 493-569`; states `:733-771`). ADR 0112 decision 2 bullet 3 (the client never decides who may author); ADR 0158 (never shown as saved while a write is held); ADR 0104 D (what must not change); `settings/confirmation-dialog.tsx` (the primitives, read only) |

- **QA, Reading:** this plan §9 S-1 … S-9, X-*; the diff; `use-save-as-preset.ts`; `tests/app/configurator/configure/
  save-as-preset.dom.test.ts`. **QA owes:** every `PresetRefusalReason` × {ro, ru} renders its sentence in the error
  tone; the saved timer survives a re-render and dies with a manual close (today's tests, kept); back confirmation's and
  the settings confirm step's tests pass untouched (X-4); the chip never overlaps the camera chips, the hint, the
  flagged-total band or the price bar at 390 × 844 and 1440 × 900 with each of them present.
- **Visual, Reading:** §2.3; frames above; captures of 3S, 3S with the sheet open, 3S focused, 3T default, typed,
  waiting, saving, saved, three refusals, at 390 and 320 in `ro` and `ru`, and D3S/D3T at 1440 × 900. **Real phone:** the
  phone keyboard over 3T (O-3).
- **Combined reviewer (Light), Reading:** the full diff; §7 D-1, D-6, D-7; ADR 0104 D; ADR 0158; `engineering-conventions.md`.

### W4 — Close (QA + owner + test audit)

- The owner's loop on a phone and on desktop (M8C P9's loop, now with v2 screens).
- The test audit over W1–W3's tests (`configurator-test-auditor`, ADR 0152 decision 4); a "cannot fail" finding keeps
  M8D open.
- `pnpm check`, then `pnpm ci:local` before any push, quoted.

## 9. Acceptance criteria

Each names the frame it comes from. "Must not" lines are criteria too.

**The list and the wait (W1)**

- **L-1** (1E · 1, 1E · 3, D1E). A card's children, in DOM order: a 4:3 image box as wide as the card's content box (±1
  px), the name, the adjusted note **iff** the offer's `changes.isUnchanged` is false, and exactly one `button`
  (*Previzualizează*) as wide as the content box and ≥ 44 px tall. **Must not:** any card text containing *MDL*, *corpuri*
  or *Folosește*; a second interactive element in a card; a tap on the card outside the button opening anything.
- **L-2** (1E · 1 note). An image is never cropped or distorted: the image's computed `object-fit` is `contain` and its
  box is 4:3 (±1 px). Measured in a real browser (Playwright, phone project), not jsdom, which has no layout, with three
  fixed sources: 1280 × 960 (fills the box), 924 × 540 (the frames' placeholder, letterboxed top and bottom) and a tall
  600 × 900 (letterboxed left and right).
- **L-3** (1E · img, D1E · 8). An image that fails shows the hatch and the preset's name, visible, inside the 4:3 box;
  the card's height does not change; its *Previzualizează* still opens the pop-up on that preset. A screen reader reads
  the name once for the image.
- **L-4** (1E · lung, D1E · 8). A name of up to 80 characters (`MAX_PRESET_NAME_CHARACTERS`), including one unbroken
  80-character word, wraps; **must not** ellipsise, clip or widen the page (`scrollWidth ≤ clientWidth` at 320 and 390).
  On desktop, a long name does not change the height of the other cards in its row.
- **L-5** (1E · 8, 1E · 8↓). With 8 offers (`PRESET_LIST_LIMIT`) at 390 × 844, only the list scrolls; the header's and
  footer's bounding boxes do not move while it scrolls; scrolled to the end, the last card's bottom edge is ≥ 20 px above
  the footer's top border.
- **L-6** (1E · RU 320). At 320 × 844 in `ro` and `ru`: no horizontal overflow; the footer's CTA label is not clipped
  (its `scrollHeight ≤ clientHeight`), two lines allowed; *Înapoi* keeps 96 px.
- **L-7** (1D, D1D). Answer at t < 250 ms: no frame paints the wait's heading, notice or skeletons. Answer at t ≥ 250 ms:
  the wait's content goes from opacity 0 to 1 over 200 ms (±20 ms); under reduced motion it appears without a
  transition. The footer holds only *Înapoi*, at every t.
- **L-8** (1D). Two skeleton cards on the phone, each a 4:3 block, a name bar and a 44 px button bar; on desktop the same
  in the 4-column grid.
- **L-9** (D1E). At ≥ 900 px: 4 columns, 20 px gap, top-aligned cards, card name 17 px.
- **L-10** (1E, 1G · e). Until an image has loaded, its 4:3 box shows a shimmer; it stops on `load` or on `error`;
  static under reduced motion.

**The Preview pop-up (W2)**

- **C-1** (1G · a, 1G · c). Previous is disabled on slide 1, Next on slide N. **Must not wrap:** Next, ArrowRight or a
  left swipe on slide N leaves slide N on screen; likewise at slide 1.
- **C-2** (1G · d). With one offer: no counter text, and no Previous or Next in the DOM.
- **C-3** (1G · a, D1G). Below 900 px: Previous and Next share one row (each ≥ 48 px tall, equal widths ±1 px), Select
  sits alone beneath them, full width, ≥ 52 px. At ≥ 900 px: one row, Previous at the left edge, Select centred
  (≥ 260 px wide, ≥ 52 px), Next at the right edge, in `ro` and `ru` at 880 px dialog width. Focus order per O-2.
- **C-4** (D1G). At 1440 × 900: the dialog is 880 px wide and vertically centred; the image box is 440 px tall (±1),
  4:3, centred; the dialog does not scroll. At 1280 × 720: Select is wholly inside the viewport with no scrolling;
  the image box shrinks and stays 4:3; **must not** crop the image.
- **C-5** (1G · RU 320). At 320 × 844, `ru`, an 80-character name and the error showing: the whole action row is inside
  the viewport without scrolling the sheet or the page.
- **C-6** (1H · a). From Select until the copy answers: the status area shows the spinner and *"Se creează bucătăria
  ta…"*; Select keeps the label *"Alege acest preset"* and `aria-busy="true"`; Previous and Next are `disabled`; Select
  and × are **`aria-disabled="true"`, still focusable and inert to activation** (not `disabled`), so the Tab ring is never
  empty and the focus the customer's press left on Select stays there (today all four are `disabled`,
  `preset-carousel-dialog.tsx:200, 225, 240, 255`, which empties the ring and drops focus to `body` [src; inf for the
  focus drop]); Escape, a scrim tap and a swipe change nothing. The action row's top edge does not move between idle and
  selecting (±1 px, 390 × 844, `ro`).
- **C-7** (1H · b). After a failed copy: the error tone with `presetChooser.selectFailed`, Select enabled; a slide change
  clears it (today's behaviour).
- **C-8** (1H · c). On the day's limit: the **warn** tone with `presetChooser.selectLimitReached`; Select disabled on
  every slide; Previous, Next, the arrows and the swipe still change slides; the sentence stays across slide changes.
- **C-9** (1G · b). The status area is ≥ 44 px tall when empty.
- **C-10** (ADR 0003 4b amendment). On a touch pointer, a horizontal swipe past the threshold moves one slide in its
  direction; a swipe released under the threshold or cancelled leaves the slide; a mostly vertical drag never changes
  the slide and still scrolls the sheet. **Property:** for any sequence of Previous, Next, ArrowLeft, ArrowRight and
  swipes (left, right, cancelled) over 1 to 8 slides from any start, the index stays in [0, N − 1], never wraps, and
  Select copies `slides[index]` — never the opening slide's preset unless it is on screen.
- **C-11** (1G · g, D1G · g). Tab and Shift+Tab never leave the dialog; Escape closes it (except under C-6) and focus
  returns to the *Previzualizează* of the card that opened it, not the slide it ended on; ArrowLeft/ArrowRight change the
  slide with a 150 ms fade (none under reduced motion); a focused Previous/Next that becomes disabled hands focus to
  Select (today's behaviour).
- **C-12** (1G · a). The × is a 44 × 44 circle named `presetChooser.close`; the handle is `aria-hidden` and does nothing
  on drag.
- **C-13** (1G · e, 1G · f). Loading and failed states in the slide as L-10 and L-3; at most three slide images mounted
  at once (today's rule).
- **C-14** (1G, D1G). The scrim is `rgb(28 24 20 / 52%)`; a tap on it closes the pop-up except under C-6.

**Save as preset (W3)**

- **S-1** (3S, 3S · sheet, 3S · RU, D3S). The chip is 44 px tall, its label on one line with no ellipsis in `ro` and
  `ru`, its right edge 14 px (phone) / 28 px (desktop) from the scene's, above the hint. Its bounding box intersects none
  of: the camera chips, the hint, the flagged-total sentence, the warning band, the price bar, the edit sheet. Hidden
  while the phone's sheet is open; shown on desktop with the rail open. **Must not** render when `isOffered` is false
  (share view, frozen view, read-only editor — unchanged).
- **S-2** (3S · focus). A keyboard-focused chip shows a ring with ≥ 3:1 contrast against the scene behind it.
- **S-3** (3T · a, D3T · a). The dialog draws, in order: (phone) the handle; the title as `h2` with the intro under it and a
  44 × 44 round × beside them; the label and the input (16 px text and ≥ 48 px tall on the phone; 15 px / 46 px on
  desktop) with the generated name as placeholder; the ≥ 44 px status area; *Închide* then *Salvează*. Phone buttons ≥ 52
  px tall and wrapping; desktop: a 520 px card centred on both axes, buttons 48 px, right-aligned, *Salvează* ≥ 150 px.
- **S-4** (3T · a). Tab order field → *Închide* → *Salvează* → × and round again; Shift+Tab the reverse; initial focus
  per O-3; Escape closes (except under S-6); after any close, focus is on the chip.
- **S-5** (3T · c). While an edit is still being written: the progress tone with *"Se salvează modificările tale…"*,
  *Salvează* disabled, the field editable.
- **S-6** (3T · d). While the preset is being sent: the progress tone with *"Se salvează presetul…"*; the field and
  *Salvează* disabled; *Închide* and × `aria-disabled` and inert to activation; Escape and a scrim tap do nothing.
- **S-7** (3T · e). When saved: the ok tone with *"Presetul a fost salvat."*, the field and *Salvează* disabled; the
  dialog stays fully opaque for ≥ 1000 ms (`SAVED_NOTICE_VISIBLE_MS`), then fades out over 200 ms (±20) and unmounts;
  focus is then on the chip. Under reduced motion it closes at 1000 ms without a fade. A manual close before then leaves
  no timer to fire (today's test kept).
- **S-8** (3T · f/g/h, D3T · f, 3T · copy). Every `PresetRefusalReason` renders its `presetSave.refusal.*` sentence in the
  error tone, *Salvează* enabled again when the editor's save is settled, the typed name still in the field. `notSaved`
  renders in the same tone with *Salvează* disabled (D-6).
- **S-9** (3T · RU 320). At 320 × 844 in `ru` with an error: no horizontal overflow; the two buttons wrap onto two rows if
  they do not fit; every control ≥ 44 × 44.

**Cross-cutting**

- **X-1** No key is added to, removed from or reworded in `ro.json`/`ru.json` except as the owner rules in O-1; the
  Romanian copy lock changes only by that ruling.
- **X-2** No change to `preset/preset-summary-wire.ts`, `persistence/preset-save-client.ts`, any route, migration or
  domain package file.
- **X-3** No TypeScript branch on viewport width; the only width breakpoint is the existing 900 px one.
- **X-4** `ConfirmationDialog`, back confirmation and the settings confirm step are unchanged: their source diff is empty
  and their tests pass untouched.
- **X-5** Layout stress: every criterion above that names `ru` also holds with, per key, the longer of v2's sample and
  the catalogue's string (§4's table) substituted in a test fixture, never in the catalogue.
- **X-7** While either pop-up is open, `document.activeElement` is never `body` and never outside the dialog, in every
  state including C-6 and S-6; after a failed copy (C-7) focus is on Select, after a refusal (S-8) on *Salvează* or
  where it was.
- **X-6** Every `data-testid` that exists at `bb112df0` on these screens still exists and still names the same control.

## 10. Risks

| Risk | Mitigation |
| --- | --- |
| 91 explicit `…dc.html:N` citations in 21 files under `docs/`, `apps/`, `packages/` (counted 2026-10-18, `.next`, `dist` and `node_modules` excluded; bare `:N` citations near a named file are not counted) point 5 lines early after the copy | The offset rule in `docs/design/README.md`; new citations use `Presete.dc.html#id` |
| Tests pin today's markup (`tests/room/preset-carousel-dialog.dom.test.ts`, `tests/app/configurator/configure/save-as-preset.dom.test.ts`, `tests/i18n/golden-output*.ts`) | Updated in the wave that changes the markup, with the reason in the commit; a golden re-hash is named, never silent |
| Focusing the field on open raises the phone keyboard over *Salvează* | O-3; the real-phone check in W3 |
| A swipe fights the sheet's vertical scroll or the page's | `touch-action: pan-y` on the slide; direction locked on the first 10 px [inf: threshold to be tuned on a real phone]; C-10 |
| The 200 ms close fade delays unmount, and focus returns only after unmount (the bands are inert until then) | S-7 asserts focus lands on the chip after the fade |
| A new dialog shell drifts from the carousel's | Both built from the same three primitives; reviewer checks |
| Desktop e2e shard at its ceiling (backlog 266) | Phone-project e2e and DOM tests first; rebalance before adding a desktop spec |
| v1 preset screens merge to `main` before v2 | O-5 |

## 11. Verification method

- **Before each wave's code:** capture today's screens for that wave's frames at 390 × 844, 320 × 844 and 1440 × 900,
  `ro` and `ru` (production build and `next start`, evidence outside the watched tree; `browser-and-visual-qa.md`). A
  "today" claim in §3 that the capture contradicts is corrected here before dispatch.
- **Per wave:** DOM tests for structure, states and focus; a fast-check property for C-10's transition function;
  Playwright on the phone project for L-2, L-5, L-6, C-4, C-5, S-1, S-9 measurements; captures compared side by side with the frames
  (`docs/design/README.md` says how to open them).
- **W3 and W4:** a real phone for O-3 and the swipe.
- **Close:** `pnpm check`; `pnpm ci:local` before any push; the test audit.

## 12. Open decisions for the owner (only those that are open)

| # | Question | Options | Recommendation |
| --- | --- | --- | --- |
| **O-1** | Approve the pop-up's two draft sentences, and which limit wording? | (a) approve `selectFailed` as drafted (= v2) and change `selectLimitReached` to v2's *"Astăzi nu se mai pot crea alte bucătării. Încearcă mâine."*; (b) approve both as drafted, keeping *"… Încearcă din nou mâine."* | **(a)**: it is the brief's and the frame's wording, and the approved `presetSave.refusal.presetLimit` already ends *"Încearcă mâine."* Russian stays an unapproved draft either way |
| **O-2** | The pop-up's focus order, since one DOM serves both shells and the two frames annotate different orders | (a) DOM × → Anterior → Următorul → Alege on both: the phone matches 1G · g exactly; desktop focus departs from D1G · g (Select is visually between Previous and Next); (b) DOM × → Anterior → Alege → Următorul on both: desktop matches D1G · g; on the phone focus jumps from *Anterior* down to *Alege* and back up to *Următorul* | **(a)**: the phone is the priority surface, and on desktop the arrow keys already change slides, so Select last costs little |
| **O-3** | Where focus lands when the save dialog opens | (a) the field, everywhere (3T · a literally); (b) the field when the primary pointer is fine (mouse/keyboard), the dialog itself on touch, so the phone keyboard does not cover *Salvează* unasked; the field is still first in Tab | **(b)**: same Tab order, no keyboard jump on phones; it tests the pointer, not the width (ADR 0003 §5) |
| **O-4** | The frames' focus ring (2 px paper + 2 px ink box-shadow) or the app's (2 px `#5a3e25` outline, offset 2) | (a) keep the app's; (b) adopt the frame's here only; (c) adopt it app-wide in a separate wave | **(a)**: one ring across the product; (c) if the owner prefers the frame's look |
| **O-5** | Where M8D runs | (a) on `fix/empty-space-fill-and-preset-save`, before M8C's pull request, so v1 screens never reach `main` alone; (b) a new branch after M8C merges; and either way, before M8B | **(a)**, and before M8B (M8B's accounts do not touch these screens) |
| **O-6** | The account mockups (`Lemnaria Cont Lot 1.dc.html`, `ContBlocks.dc.html`) sit in `design-source/presets/` and are lost when that folder is deleted | (a) copy them verbatim into `docs/design/mockups/` now, unplanned until M8B; (b) leave them | **(a)** — 52 KB, needed by M8B |

**Settled by the owner's delivery, recorded rather than asked** (falsified by the owner saying otherwise): v2 replaces
1D, 1E, D1D and D1E as drawn (its own banner says *"înlocuiește 1D/1E de mai jos"*), so the card carries no counts,
price or chips, departing from M8C §3.6 and closing backlog 263.

## 13. For the scribe (W0; not done here)

- **ADR 0104 Amendment G (2026-10-18):** the owner's *Presete v2* export is copied verbatim; `Presete.dc.html` frames
  1D, 1E, 1G, 1H, 3S, 3T and D1D … D3T are the chrome specification for those screens; the old 1D/1E/D1D/D1E frames
  below the banner in both screen files are superseded (Amendment F's reading of them with it); the backdrop drawn in
  3S/3T/1G is not authority (§1); the departures this plan takes (D-1 … D-8) and the owner's answers to O-1 … O-4.
- **ADR 0003, a dated note on the 2026-10-17 amendment:** swipe was decided and not built in P8; M8D W2 builds it.
- **Backlog 263:** resolved by v2 (no counts, price or chips), with this plan as the pointer.
- **`docs/STATUS.md` and `docs/milestones/README.md`:** an M8D row, *Planned*, mobile-gated.
- **`docs/design/README.md`** is already updated (§1).
