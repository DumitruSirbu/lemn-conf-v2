# Chrome parity with the design reference — screen 2, both shells

> **Close-out, 2026-10-18 (analyst-verified in git/source, coordinator-relayed; not re-run here).**
> The wave shipped 2026-09-09/10 via `55c0a9b4`, `0efcbbd1`, `d1f34977` and `b489f028`; the ruling is
> ADR 0104. The "Verifică designul" CTA was later wired by M8 wave 8D S4 (`75860c11`). The copy now
> lives in `apps/web/src/messages/ro.d.json.ts`; `ro.ts` no longer exists. The D2A coverage panel was
> never built: it is a feature, and this plan excluded it. Before/after measurements are not recorded
> in this file; the standing gate is the `top-bar-pill-containment` e2e specs. The stale-status note
> below is superseded by this block and kept as history.

Status: ~~**Planned, 2026-09-09.** Not started.~~ **This status is stale and is flagged rather than
corrected, 2026-09-11.** `main` carries `d1f3497` *"fix(chrome): two defects adversarial QA found,
and the gates that name them"* and `b489f02` *"test(e2e): re-point nine assertions the chrome-parity
wave made stale"* — so the wave ran, and **nothing in this file records what it shipped, what it
verified, or what it left open**. The M6B close-out pass that found this could not verify the wave
(it was scoped to M6B and to documentation), so the close-out is owed by whoever picks this up:
walk the acceptance criteria below against the tree, mark each met or unmet at the criterion, and
record the deviations. **Do not read the plan below as instruction without doing that first.**
Branch `fix/m6-remediation`, base `5c30e92`.
Ruling: [ADR 0104](../../decisions/0104-the-mockups-are-the-chrome-specification-and-the-strips-own-row-is-withdrawn.md).
Amends: [ADR 0082](../../decisions/0082-the-settings-strip-wraps-and-nothing-leaves-the-viewport.md)
*Amendment B*, [ADR 0094](../../decisions/0094-the-strip-gets-its-own-row-and-containment-is-measured-against-its-own-band.md)
*Amendment A*.

**Its own file rather than a section of `docs/milestones/done/M6-price-and-global-settings.md`**, because
that file is 7,500 lines and this is remediation of a drift across two shells rather than an M6
feature. The repository already keeps such work in its own file —
`adversarial-review-remediation.md`, `dom-003-set-width-split.md`.

**Order of events, and it is not the usual one.** Plan → implement → **the owner reviews it in a
browser** → QA → review → verify. QA is not dispatched until the owner has looked at both shells.

---

## Read first, at the owner's review — what they will notice that is not a defect

**Frame D2A's *“Lățime acoperită · practic plin”* coverage panel is not built.** It is drawn over the
scene at `right:28px; top:24px; width:360px`, it has no implementation and no data seam in this
repository, and building it is a feature rather than chrome. **It will be visibly absent when the app
is compared against D2A**, and that is this wave's scope, not a bug.

**The two overflow sentences now stand next to each other on the scene.** The owner's ruling moved
ADR 0065's flagged-total sentence out of the top bar; it lands beside `configure.overflowWarning`,
which already says the design overflows. They accepted that caveat. Whether one of them should go is
**open question 3** — a copy question, answerable at review in a word.

## Already ruled by the owner, 2026-09-09 — do not re-ask

**How the settings narrow.** *"you just combine like `MDF, Blum + 1`"*; *"keep labels full width,
need just ot calculate the remaining space and decide, how many global setting fit tyo be show and
display with separation like in dektop header, and if one or multiple not fit, count those that not
fit and add that count after `+`"*; and the floor, *"ex `Pal melaminat + 2` => `Pal mela.. + 2`"*.
The whole rule is in *How the pill narrows* and in
[ADR 0104](../../decisions/0104-the-mockups-are-the-chrome-specification-and-the-strips-own-row-is-withdrawn.md)
decision 3. **Labels are never abbreviated** — the owner's `MDF` was a shorter material in an example,
not a rule — so do not raise it.

**The wordmark drops at narrow desktop.** Ruled the same day on the corrected premise — dropping it
is *not* needed to prevent overflow; it buys a readable setting name against a `P…` stub in a
900–966 px window. Chosen over both keeping the wordmark with the stub and raising the desktop
breakpoint so frame 2A serves narrow widths. See *Give C is an owner ruling of 2026-09-09*, including
the one measurement that would send it back to them.

**ADR 0065's flagged-total sentence leaves the top bar and joins the scene.** Ruled the same day, over
letting the desktop bar grow on a flagged design. **The header therefore keeps frame D2A's shape at
every width, flagged or not** — criterion 12c asserts it — and `1cc86d8`'s 9.28 px trade is
**retired**, not repaid.

**The kitchen's colour joins the pill** — *“if it fits, it should be displayed also”* — governed by
the ladder like any other setting. **Four settings, `+N` counting from four**, in the order
`material │ colour │ hardware │ depth`, which
[ADR 0099](../../decisions/0099-a-colour-is-chosen-at-two-levels-and-the-cabinets-wins.md) decision 9
already ruled (*“just behind the material”*) and which the settings sheet already renders.

## FOR THE OWNER — four questions, none of them blocking

**Every blocker is cleared.** All four have defaults; the developer builds the default and an answer
changes one thing rather than the wave. The ladder, the wordmark, the overflow sentence and the
colour are **already ruled** (2026-09-09) — see *Already ruled by the owner* below.

**1. `Verifică designul` — drawn but dead, or not drawn yet?**
It appears in all five desktop frames that draw a full top bar, and in mobile frame 2A's bottom bar.
It leads to M8's review step, which is not built and has no route. The plan draws it **exactly as the
frames draw it and wires it to nothing**, on the precedent already set for the `RO ▾` caret. It is
the largest, most pressable-looking thing on the screen and it will do nothing when pressed.
*Default: draw it. Alternative: hide it until M8.*

**2. The reference disagrees with itself about the price control's wording.**
Desktop D2A and D2D say **“Ce se include în acest preț?”**. Mobile 2A and 2D say **“De ce acest
preț”**. The product ships one string for both shells — *De ce acest preț* — because `§10.1` admits
no copy fork per viewport, and because this repository has already learned what happens when a wave
reconciles ruled copy on its own authority (`startingPrefixUnchanged`). **This wave changes neither
string and forks nothing.** Which do you want, on both shells? **Measured: the choice costs no
width** — the price column is set by the amount, not by this label. *Default: leave it as it ships.*

**3. The two overflow sentences now sit side by side on the scene.** Your ruling moved the
flagged-total sentence out of the bar; it lands beside the one already there. They say nearly the same
thing in different words — *“Prețul include și dulapuri ce depășesc mărimea peretelui și necesită
ajustări”* and *“Dulapurile marcate depășesc lungimea peretelui. Modifică lățimile sau elimină un
dulap.”* ADR 0065 made them two constants on purpose, and that distinction is harder to see when they
are adjacent. *Default: both are drawn, stacked. Say the word at review if one should go.* **Related,
and a one-word answer:** the sentence moves on **both** shells in this plan, because one placement
needs no per-viewport fork. If you want the phone to keep it in its bottom bar, that is available.

**4. The colour's label on the pill has no source in either frame.** D2A draws `PAL melaminat`,
`Feronerie Hettich`, `Adâncime 600` — a category word and a value, no separator, and the material bare.
Colour was not on the frame, so its label follows that pattern: **`Culoare Antracit`**. *Default: that.
It is a new visible string and it is yours.*

**And one thing you will notice that is not a question.** Frame D2A draws a *“Lățime acoperită ·
practic plin”* coverage panel over the scene. It has no implementation and no data seam here, and
building it is a feature rather than chrome. **It will be visibly absent at your review.**

---

## Goal

The configure screen's chrome is what the mockups draw, on both shells, measured against the frames'
own declared numbers rather than against a description of them.

**Not in scope**, and each is named so that its absence is a decision rather than an omission:

- the 3D scene, the editor panel/rail, the settings sheet's own contents, the breakdown's own
  contents, pricing, and every domain rule;
- **frame D2A's *“Lățime acoperită · practic plin”* coverage panel** (`right:28px; top:24px;
  width:360px`). It is a scene overlay, not chrome, it has no implementation and no data seam, and
  building it is a feature. The owner will see it in D2A and not on screen; **flagged here so that
  gap is known and not discovered during the review.**
- `apps/web/src/messages/ro.json` and anything else M6B owns. New Romanian goes in
  `apps/web/src/content/ro.ts`.

## The owner's instruction, and why the frames are the specification

> *“I wanted to be same as in reference, SAME, because this is the design I made and approve.”*
> *“on mobile same shit, you done what you wanted not what is in reference.”*

[ADR 0003](../../decisions/0003-design-reference-supersession.md) already made the mockups reference
artefacts and already recorded the owner's calibration rule — *“the immediate goal being a working
POC that matches the design reference”* (§7) — and already set the precedent that a frame beats a
spec sentence about chrome (§5, on the desktop rail). ADR 0104 decision 1 makes the reading explicit:
**every number a frame declares is the target, and a shipped rule that disagrees is named and
withdrawn.**

---

## The drift, verified against both files and the tree

Verified by reading the two mockup files and
`apps/web/src/app/configurator/configure/{configure-screen.tsx,configure.module.css}`,
`apps/web/src/settings/{global-settings.tsx,global-settings.module.css,global-settings-model.ts}` and
`apps/web/src/price/{price-bar.tsx,price-bar.module.css}` at `5c30e92`.

| | reference | ships today |
| --- | --- | --- |
| desktop bands | **one**, 76 px, then the scene (D2A–D2F) | header + price cell, **plus a ~45 px settings strip row**, then the scene |
| desktop settings | **one pill** in the top bar: swatch · `PAL melaminat` (ellipsising) · │ · `Feronerie Hettich` · │ · `Adâncime 600` · `▾` | two chips + a separate *Setări globale* text button, in a band of their own |
| desktop CTA | **`Verifică designul`**, 48 px, `#7c5c3d`, between the price and the locale | absent |
| desktop price control | *Ce se include în acest preț?*, underlined, `▾` | *De ce acest preț*, `⌃` |
| desktop wordmark | `Lemnaria` | ✅ matches |
| mobile header | `‹` · `2/4` · `Configurare` · **one chip with `+2`** · `RO ▾` | `‹ Cameră` · `2/4` · `Configurare` · `RO ▾`, and the settings in a band below |
| mobile bottom bar | price row, then **`Înapoi` + `Verifică designul`** | price row only |
| camera presets | over the scene, `left:14/28px top:14/24px` | ✅ matches |
| depth named on the pill | **yes** (`Adâncime 600`) | no — [ADR 0082](../../decisions/0082-the-settings-strip-wraps-and-nothing-leaves-the-viewport.md) left it open; the frame answers it |

**`+2` is the reference's own answer to a settings summary that will not fit, and it was never
implemented.** Instead the chips overflowed a 390 px screen, and the project spent ADR 0082, its
Amendment A, ADR 0094, waves 6R and 6R-b and two dedicated e2e specifications containing them. That
is the reason this wave exists, and it is why the containment records are amended rather than blamed:
they are correct about a layout the design never asked for.

---

## The target, in the reference's own declarations

Everything below is quoted from the two files. **Colours are taken literally except `#7d7a72`**,
which is `--ink-faint` (`#6b6860`) by the owner's WCAG ruling of 2026-09-03 — a contrast ruling is
not chrome taste and outranks the frame. `--font-ui` is already `Helvetica, Arial, sans-serif`, the
mockups' own stack, and `box-sizing: border-box` is global, so a declared `height` is the outer box.

### Desktop — frame D2A, `Lemnaria Configurator Desktop.dc.html:544–571`

```
band       height:76px; flex:0 0 76px; padding:0 28px 0 40px; display:flex;
           align-items:center; gap:28px; border-bottom:1px solid #e4dfd5; background:#faf8f4
wordmark   font:700 15px/1; letter-spacing:.22em; text-transform:uppercase        "Lemnaria"
step pill  font:700 12px/1; letter-spacing:.04em; color:#faf8f4; background:#7c5c3d;
           padding:7px 8px; border-radius:5px; flex:0 0 auto; .num                "2/4"
title      font:700 19px/1; letter-spacing:-.01em; flex:0 0 auto                  "Configurare"
right group  margin-left:auto; display:flex; align-items:center; gap:14px
  pill     display:flex; align-items:center; gap:10px; height:40px; flex:0 1 auto;
           min-width:0; max-width:460px; padding:0 14px; background:#f5f3f0;
           border:1px solid #dcd8ce; border-radius:20px
    swatch   width:16px; height:16px; flex:0 0 16px; border-radius:4px; border:1px solid #c4bcae;
             background:repeating-linear-gradient(0deg,#d9d2c6 0 4px,#cfc7b9 4px 8px)
    material font:400 12.5px/1; color:#5a3e25; min-width:0; overflow:hidden;
             text-overflow:ellipsis; white-space:nowrap                           "PAL melaminat"
    divider  width:1px; height:18px; flex:0 0 1px; background:#dcd8ce
    hardware font:400 12.5px/1; color:#5a3e25; flex:0 0 auto; white-space:nowrap  "Feronerie Hettich"
    divider  (as above)
    depth    font:400 12.5px/1; color:#5a3e25; flex:0 0 auto; white-space:nowrap  "Adâncime 600"
    caret    font:400 11px/1; color:#7c5c3d; flex:0 0 auto                        "▾"
  divider  width:1px; height:28px; flex:0 0 1px; background:#e4dfd5
  price    display:flex; flex-direction:column; align-items:flex-end; gap:3px; flex:0 0 auto
    amount   font:700 21px/1; .num                            "de la {{ priceTotal }} MDL"
    control  display:flex; align-items:center; gap:5px
      label  font:400 11.5px/1; color:#7c5c3d; text-decoration:underline;
             text-decoration-color:#c9b79f; text-underline-offset:3px
      caret  font:400 10px/1; color:#7c5c3d                                       "▾"
  divider  (28 px, as above)
  CTA      height:48px; padding:0 24px; border-radius:12px; background:#7c5c3d; display:flex;
           align-items:center; font:700 15px/1; color:#faf8f4; flex:0 0 auto      "Verifică designul"
  divider  (28 px, as above)
  locale   display:flex; align-items:center; gap:5px; height:40px; flex:0 0 auto; padding:0 12px;
           background:#ece7dd; border:1px solid #dcd8ce; border-radius:20px
    code   font:700 12px/1; letter-spacing:.08em; color:#5a3e25                   "RO"
    caret  font:400 11px/1; color:#7d7a72 → --ink-faint                           "▾"
```

**`height:76px` is declared, not summed.** Today's 76 is arithmetic — `17.5 + 40 + 17.5 + 1` around
the locale chip — and the 48 px CTA does not fit inside it. The band takes the frame's own declared
height with `padding-block: 0`, and the CTA sits centred with 14 px above and below. This is what
kills `top-bar-box.test.ts`'s height *derivation* while leaving its *number* correct; see *Tests*.

**Frame D2E, `:953–961` — the pill open.** Same pill, `background:#ece7dd; border:1px solid #7c5c3d`,
caret `▾` → `⌃`, and the popover `position:absolute; top:calc(100% + 33px); right:0; width:900px;
border-radius:16px; box-shadow:0 22px 48px rgba(28,24,20,.22)`. **The pill is the trigger.** There is
no separate *Setări globale* control in any desktop frame.

### Mobile — frame 2A, `Lemnaria Configurator Mobil.dc.html:482–495` and `:509–520`

```
header   padding:11px 14px; display:flex; align-items:center; gap:9px;
         border-bottom:1px solid #e4dfd5; background:#faf8f4
back     font:700 17px/1; color:#7c5c3d; flex:0 0 auto; width:22px; text-align:center   "‹"
step     font:700 11px/1; letter-spacing:.04em; color:#faf8f4; background:#7c5c3d;
         padding:5px 6px; border-radius:5px; flex:0 0 auto; .num                        "2/4"
title    font:700 15px/1; letter-spacing:-.01em; flex:1; min-width:0; overflow:hidden;
         text-overflow:ellipsis; white-space:nowrap                                     "Configurare"
chip     display:flex; align-items:center; gap:6px; flex:0 1 auto; min-width:0;
         max-width:150px; padding:7px 9px; background:#f5f3f0; border:1px solid #dcd8ce;
         border-radius:9px
  swatch   width:14px; height:14px; flex:0 0 14px; border-radius:3px; border:1px solid #c4bcae;
           background:repeating-linear-gradient(0deg,#d9d2c6 0 3px,#cfc7b9 3px 6px)
  material font:700 11px/1; color:#6b5e52; min-width:0; overflow:hidden;
           text-overflow:ellipsis; white-space:nowrap                                   "PAL melaminat"
  count    font:700 10px/1; color:#7c5c3d; flex:0 0 auto; .num                          "+2"
locale   display:flex; align-items:center; gap:4px; flex:0 0 auto; padding:6px 8px;
         background:#ece7dd; border:1px solid #dcd8ce; border-radius:8px
  code   font:700 11px/1; letter-spacing:.08em; color:#5a3e25                           "RO"
  caret  font:400 10px/1; color:#7d7a72 → --ink-faint                                   "▾"

bottom bar  border-top:1px solid #dcd8ce; background:#faf8f4; padding:12px 18px 20px;
            display:flex; flex-direction:column; gap:11px
  row 1     display:flex; align-items:center; justify-content:space-between
    figure    display:flex; flex-direction:column; gap:3px
      label     font:400 10.5px/1; letter-spacing:.09em; text-transform:uppercase;
                color:#7d7a72 → --ink-faint                                             "De la"
      amount    font:700 21px/1; .num                              "{{ priceTotal }} MDL"
    control   display:flex; align-items:center; gap:7px; font:700 12px/1; color:#7c5c3d,
              caret at font-size:14px                              "De ce acest preț ⌃"
  row 2     display:flex; gap:10px
    back      width:96px; height:52px; border-radius:12px; border:1px solid #dcd8ce;
              centred; font:700 14px/1; color:#6b5e52                                   "Înapoi"
    CTA       flex:1; height:52px; border-radius:12px; background:#7c5c3d; centred;
              font:700 15px/1; color:#faf8f4                                "Verifică designul"
```

**Frame 2E, `:826–836`** is the surface the chip opens: the chip is unchanged in the open state, and
the full sheet is `height:648px` of the 844 px viewport with a scrim. The sheet's contents already
ship and are not touched.

**Derived from the declarations above, not measured — the implementer measures.** Mobile children's
outer heights are `‹` 17, pill 21, title 15, settings chip 27 (`1+7+11+7+1`), locale chip 25
(`1+6+11+6+1`). The tallest is the settings chip, so the band is `11 + 27 + 11 + 1 = **50 px**`,
against today's 48.

**Why the two shells are read differently, which is the whole of the height story.** D2A *declares*
`height:76px`, so the desktop band is **read** — and that is what kills the shipped derivation, since
the 48 px CTA does not fit inside `17.5 + 40 + 17.5 + 1`. **2A declares no height at all**, so the
mobile band **is** its padding plus its tallest child plus the rule, exactly as `top-bar-box.test.ts`
already computes it. Only the tallest child changes.

**The trade, stated plainly: 2 px for 76.** **The mobile header grows 2 px and the mobile scene loses 2 px** — against the
~76 px of strip band it gets back.

---

## Module boundaries, and the one structural change

`.screen` is a grid **because that is what lets one element sit in two places without a second copy
in the markup** — the reason `configure.module.css` already gives for the price bar. This wave needs
that property for four more controls, so it takes the same answer rather than a new one:

**The top bar's controls become five grid items of `.screen`, and the two shells place them.**

```
desktop   "nav settings price actions locale"      grid-template-rows: auto minmax(0, 1fr)
          "stage stage stage stage stage"

mobile    "nav settings locale"                    grid-template-rows: auto minmax(0,1fr) auto auto
          "stage stage stage"
          "price price price"
          "actions actions actions"
```

- **`nav`** — `<header>`: back-or-wordmark, the `2/4` pill, the title. Internal `gap` is D2A's 28 on
  desktop, 2A's 9 on mobile. The only `1fr` track in the top bar row.
- **`settings`** — `<GlobalSettings />`, now one pill. Removed from `.settingsRow`, which is deleted.
- **`price`** — `<PriceBar />` + `<PriceBreakdown />`, unchanged in composition. Desktop: the
  right-hand cell. Mobile: row 1 of the bottom bar.
- **`actions`** — new: `Înapoi` (mobile only, `display:none` on desktop) and `Verifică designul`.
  Desktop: between the price and the locale, which is D2A's order. Mobile: row 2 of the bottom bar.
- **`locale`** — the `RO ▾` chip, lifted out of `<header>` so desktop can place it after the CTA
  while mobile keeps it in the header row. Still inert.

**The three 28 px dividers are `::before` pseudo-elements** on `price`, `actions` and `locale`,
`display:none` on mobile. They are decoration and take the row's `column-gap` on either side, which
is D2A's `gap:14px`.

**All five items are `align-items: stretch` in the top-bar row and each draws
`border-bottom: 1px solid var(--line-soft)` and `background: var(--paper)`**, so the band reads as one
rule — the mechanism `configure.module.css` already uses for the price cell, extended to five cells
rather than two. On mobile, `price` draws `border-top` and `actions` draws none, so the bottom bar is
one box with `actions`' top padding standing in for frame 2A's `gap:11px`.

### Stacking, which is why the settings band existed at all

`configure.module.css:29–34` lifted the settings out of `<header>` because the settings surface is
**modal on both shells** (still true — `fca2ee8` removed the desktop scrim from the *breakdown* only)
and a scrim mounted inside `.header`'s `z-index: 2` context cannot paint above the rail (`4`) or the
breakdown popover (`6`).

With `settings` a grid item of `.screen` rather than a child of `<header>`, that constraint is met the
same way it is met today: the item keeps `z-index: 7`. **The stacking order is re-derived and written
down in the stylesheet as a table** — `nav`/`locale`/`actions` 2, `price` 2, rail 4, breakdown popover
6, `settings` and its scrim and surface 7 — and asserted, because it is the property that took 44 of
58 e2e specs down once (`6K-b3`, recorded in ADR 0082).

---

## Work items

Ordered so that each is checkable on its own and nothing later depends on a number an earlier item
guessed.

1. **Measure the base**, in a browser, before any edit: the desktop and mobile header boxes, the
   settings band, the canvas origin and size at 390 × 844, 900, 1000, 1100, 1440 and 1920, on the
   seeded design and on a flagged one. This is the before-column of every claim the wave makes, and
   ADR 0094 criterion 4f's rule — **re-measured, never nudged** — is what it exists to serve.
2. **Restructure `.screen`'s grid** to the five items above, on both shells. Delete `.settingsRow`,
   its grid area, and the desktop `fit-content(50%)` two-column top bar. Move the locale chip out of
   `<header>` and `<GlobalSettings />` out of the deleted band. Re-derive and record the stacking
   table.
3. **Draw the desktop band at frame D2A's declarations**, including the declared `height: 76px` and
   `padding: 0 28px 0 40px`, the three dividers, and the `gap: 28` / `gap: 14`.
4. **Replace the chips row and the text trigger with one pill.** `global-settings-model.ts` stops
   publishing `chips: SettingsChip[]` + `openLabel` and publishes the pill: an **ordered list of four
   named settings — `material │ colour │ hardware │ depth`, the order ADR 0099 decision 9 ruled** —
   each with its whole label, composed as D2A composes them and **not** as the breakdown does.
   `global-settings.tsx` renders the pill as the trigger; `aria-haspopup`, `aria-expanded`,
   `aria-controls`, the disabled state and its reason all move onto it unchanged. **The pill's
   accessible name states every setting, at every rung** — the count is a visual economy and must not
   cost a screen-reader user a setting.
4b. **Add the fit model** — `chooseVisibleSettingLabels`, pure, with the invariants and the hysteresis
   in *How the pill narrows*; and the header's own `{ spacing, isWordmarkDrawn }` from the same
   measurement. Both are values, asserted as values, before any component reads them.
4c. **Add the measurement seam**: one `ResizeObserver` on the pill's track, and the hidden
   whole-label measurement node keyed on the label strings. First in this repository — see *Risks*.
5. **Draw the pill's four rungs** — separators between labels only, the counter after the last label
   separated by the gap, the swatch at every rung, the caret on desktop only — and D2E's open state
   (`background:#ece7dd; border-color:#7c5c3d`, caret `▾` → `⌃`).
6. **Keep the 44 px target without changing a painted box.** A pseudo-element hit area on the pill,
   the back control and any other control the frames draw shorter than `--touch-target`. No
   `min-height` on a control that would become the row's tallest child — that is what would lift the
   band off the frame's declared height (ADR 0104 decision 5).
6b. **Move ADR 0065's flagged-total sentence out of the price cell and onto the scene**, on both
   shells, as a grid placement rather than a second copy. Strike the `.header` exception comment in
   place with its cause, and re-point
   `settings-strip-containment.desktop.e2e.spec.ts:655` to assert the header does **not** grow.
7. **Add `Verifică designul`**, both shells, as a non-interactive element: no `button`, no
   `role="button"`, no `tabindex`, no `cursor: pointer`, no `aria-hidden`.
8. **Add `Înapoi` to the mobile bottom bar** and reduce the header's back control to frame 2A's bare
   `‹` with an accessible name.
9. **Wire gives B and C** — the gaps and the wordmark — to the header's fit model, not to a
   breakpoint. **No `@media` width threshold is added by this wave** beyond the shell's existing
   `min-width: 900px` fork.
10. **Re-point the tests** per the *Tests* section. No gate is deleted to make a layout pass.
11. **Re-measure everything item 1 measured**, and record both columns.

---

## How the pill narrows — the owner's ruling, and the whole of the design work

**Ruled by the owner, 2026-09-09**, in three statements, and it is one mechanism for both shells:

> *"when its narrower you have the soltion in mobile version you just combine like `MDF, Blum + 1` for
> example"*
>
> *"keep labels full width, need just ot calculate the remaining space and decide, how many global
> setting fit tyo be show and display with separation like in dektop header, and if one or multiple
> not fit, count those that not fit and add that count after `+`"*
>
> *"ex `Pal melaminat + 2` => `Pal mela.. + 2`"*

Frame D2A draws the top of this ladder and frame 2A draws the bottom of it. The project implemented
neither, and the strip that stood in for both is what cost it ADR 0082, ADR 0094 and two waves.

### The ladder

| rung | the pill draws | from |
| --- | --- | --- |
| **1** | all four settings, whole labels, `│` between them | D2A — from ~1155 px |
| **2** | as many whole labels as fit, same separators, then `+N` | the owner's `MDF, Blum + 1` |
| **3** | one whole label, then `+N` — `PAL melaminat +3` | 2A's `PAL melaminat +2`, at four settings |
| **4** | one label **ellipsised**, then `+N` — `Pal mela.. + 3` | the owner's floor |

**Rules that fall out of it, each of which an implementer will otherwise get wrong:**

- **A label is shown whole or it is counted.** No abbreviated form exists and none is invented; the
  owner's `MDF` was a shorter material in an example, not an abbreviation rule.
- **`N` is how many are *not shown***, derived from the settings that exist. **There are four** —
  `material │ colour │ hardware │ depth` — so showing two is `+2` and showing one is `+3`. A fifth
  later changes the count with no edit here.
- **The order is ruled, not chosen**, and it matters because the ladder collapses from the end.
  [ADR 0099](../../decisions/0099-a-colour-is-chosen-at-two-levels-and-the-cabinets-wins.md) decision 9
  places colour *“just behind the material”* on the owner's own words, and the settings sheet renders
  in that order (`global-settings.tsx:664–689`). The control and the surface it opens name things in
  the same order. **`PAL melaminat` is therefore the name that survives at the floor**, which is also
  what frame 2A draws.
- **The swatch and the counter never give way, and a label is never absent.** There is no bare `+3`.
  The swatch is drawn at every rung, including rung 4.
- **Separators are D2A's `│` at every count, on both shells, between labels only.** A two-label pill
  draws one. The counter is separated from the last label by the pill's own `gap`, never by a divider
  — which is how 2A draws `PAL melaminat` beside `+2`.
- **The disclosure caret follows the shell's own frame**: after the counter on desktop (D2A), absent
  on mobile (2A draws none, and the chip is still the trigger).
- **Rung 4 is the only ellipsis, and the mockups' own declaration performs it.** Both files declare
  `min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap` on their label and that
  declaration **stands exactly as written**. It is a last resort, not the normal state.

### Two mechanisms, and they must not be confused

**Rungs 1–3 are a count. CSS cannot make it** — `flex` shrinks a box, it does not choose how many
children to render. **Rung 4 is a width, and CSS is exactly what performs it.** An implementer who
tries rungs 1–3 with flex shrink gets the row of stubs ADR 0082 decision 3 refused; one who tries
rung 4 with a count gets a label that vanishes instead of truncating.

### Where the count is decided

**In a pure function over measured widths, held in a model that can be asserted as a value** — the
shape this project already uses for `describeChipAvailability`
(`apps/web/src/panel/panel-model.ts:885`) and every `describe*` model beside it. No component decides
it and no markup encodes it.

```
chooseVisibleSettingLabels({
  availableWidthPx,            // the pill's own track, measured
  labelWidthsPx,               // each label's whole width, measured, in the pill's typography
  fixedWidthsPx,               // swatch, padding, border, separators, gap, counter, caret
  previousVisibleCount,        // for the hysteresis below
}) -> { visibleCount, hiddenCount }
```

Invariants the unit tests assert as properties rather than examples, over a swept range of widths and
a randomised label order:

- `visibleCount + hiddenCount === settings.length`, always;
- `visibleCount >= 1`, always — rung 4's floor, and the reason there is no bare counter;
- **monotone**: a wider `availableWidthPx` never yields a smaller `visibleCount`;
- a label is counted **only** when the width it needs, plus its separator, exceeds what remains — so a
  label is never hidden while there is room for it.

**The measurement seam.** A `ResizeObserver` on the pill's own grid track publishes
`availableWidthPx`; each label's whole width is read once per label *string* from a hidden
`white-space: nowrap` measurement node in the pill's exact typography, keyed on the string so an M6B
locale change re-measures rather than reusing a stale width. **This is the first `ResizeObserver` in
`apps/web/src`** — see *Risks*.

### Stability — no flicker, no thrash

- **Hysteresis, and its margin is content-derived rather than chosen.** Showing one more label
  requires the room for that label **plus its separator and the pill's gap**; hiding one requires the
  room to fall below the label alone. The two thresholds differ by exactly the separator and gap, so
  a width sitting on the boundary cannot oscillate. **No pixel constant is introduced** — ADR 0082
  decision 3's refusal of a numeric `min-width` survives whole (ADR 0104 decision 9).
- **The decision is idempotent and the state write is skipped when the count is unchanged**, so
  dragging a window edge re-renders on count changes only, not per frame. `ResizeObserver` already
  fires after layout, so no measurement is taken mid-layout.
- **First paint has no measurement.** The pill renders at rung 1 for the settings it has and settles
  on the first observation; the plan requires that settling to be within one frame and never to be
  visible as a jump on the seeded design at any swept width. If it is visible, that is a finding.

## What else gives, and what never does

The owner's ruling makes the pill the mechanism. **The reading that the pill is the *only* thing that
gives is correct in intent and insufficient in arithmetic**, and the correction is recorded rather
than glossed.

### Measured, not estimated — and it decides give C

Frame D2A's row was rebuilt from the mockup's **own inline styles** and measured in headless
Chromium 1.62.1 on this machine, in the same `Helvetica, Arial, sans-serif` stack the app declares.
**It is not the app**, and every figure is re-measured against the running app by work item 1 — but it
is a measurement of type rather than an estimate of it, and the conclusions below survive a
reasonable error bar.

Intrinsic widths, CSS px: wordmark **105.56**, step pill **34.13**, title **105.59**, price column
**180.92**, `Verifică designul` **167.22**, locale chip **57.95**; the pill's labels
`PAL melaminat` **83.39**, `Feronerie Hettich` **95.88**, `Adâncime 600` **79.92**; the pill at rung 1
**374.22**, at rung 3 **180.69**, at its rung-4 floor (label → 0) **97.30**.

**What each rung needs, as a viewport width** (D2A's own `40 + 28` header padding included):

| **at the three settings D2A draws** | rung 1 · three whole labels | rung 3 · one whole label `+2` | rung 4 floor · label → 0 |
| --- | --- | --- | --- |
| D2A as drawn (gaps 28/14, wordmark) | **1264.59** | 1071.06 | — |
| give **B** only (gaps 9/6, wordmark kept) | 1159.59 | **966.06** | 882.67 |
| give **B + C** (gaps 9/6, wordmark dropped) | 1045.03 | **851.50** | 768.11 |

**One thing the measurement settles for free:** the price column is set by the *amount*, not by the
breakdown control, so **open question 2's copy choice changes no width**. Both spellings measure
180.92.

The table is at **the three settings frame D2A draws**, which is what the wordmark ruling was taken
on; *What each rung needs, with four settings* below re-derives it now that colour has joined.

**So give C is not needed to prevent an overflow. It is needed to keep the setting name readable,
inside a 66 px window.**

- Above **~966 px** the wordmark costs nothing: rung 3 fits with it, and `PAL melaminat +2` is whole.
- At **900 px** with the wordmark kept, the row fits only at rung 4 with **17.33 px** left for the
  label — roughly `P…`, which is a stub and not a name.
- The owner's own rung-4 rendering, `Pal mela.. + 2` (~51 px of label), needs about **934 px** with
  the wordmark kept.
- Dropping it moves rung 3 down to **851.50**, so at 900 px the pill shows `PAL melaminat +2` whole,
  with room to spare.

**The window in which give C changes anything is therefore about 900–966 px**, on the seeded design
with the shipped tier names.

| | what gives | why, and the estimated saving |
| --- | --- | --- |
| **A** | **the pill's ladder, rungs 1 → 4** | the owner's ruling. It runs first and runs to its floor before anything else moves |
| **B** | **the gaps close**, `28`/`14` → frame 2A's `9`/`6` | space only, both numbers the reference's. **Measured 105.00 px** |
| **C** | **the wordmark leaves the row** — **ruled by the owner, 2026-09-09** | the only item carrying no state, and 2A itself does not draw it. **Measured 114.56 px with its gap.** It buys a readable setting name in a **900–966 px** window and nothing at any wider width. See below |
| **D** | **the title ellipsises**, as 2A declares it (`flex:1; min-width:0`) | reference-declared and therefore available, but **never reached** on the seeded design once A and B are spent |
| — | **nothing else, ever** | the step pill, the price figure, `Verifică designul` and the locale are `flex:0 0 auto` in D2A. They are what the header is *for* |

### Give C is an owner ruling of 2026-09-09, and what it was chosen over

`apps/web/tests/e2e/top-bar.desktop.e2e.spec.ts:165–174` had reserved this element to the owner, about
this exact question:

> *"If it ever does fail here, the wordmark is the item that would have to give — it is the only child
> of the row that carries no state … Dropping it is a copy decision under the owner's Gate O1, not an
> implementer's, so this stays an assertion rather than a workaround."*

**The owner has now made that decision: the wordmark drops at narrow desktop.** The reservation is
discharged, not overruled, and the implementer takes it on the owner's authority rather than this
plan's.

**Ruled on the corrected premise, which is what makes it a decision rather than a concession.** An
earlier draft of this plan said the wordmark had to go or the row would overflow. **That was wrong.**
With the wordmark kept the row *does* fit at 900 px, at rung 4, with **17.33 px** left for the label.
The real trade is **a readable setting name against the brand, inside a 900–966 px window**, and the
owner was given it in those terms. They chose the readable name — over *both* keeping the wordmark
with a `P…` stub, **and** raising the desktop breakpoint so frame 2A serves narrow widths (which
removes nothing from either drawing, at the cost of the phone's header, bottom bar and back control
appearing on a narrow laptop). All three are reference-faithful, which is why it needed an owner; the
one taken keeps the desktop drawing recognisably itself. **Record this reason, not just the outcome**
— it is what a later reader would otherwise re-litigate.

**The ruling rests on a measurement of the frame, not of the app, and work item 1 replaces it.** If
the app's own numbers show **rung 3 fitting at 900 px with the wordmark kept — needing 900 or less
where the frame measured 966.06 — the wordmark stays and the owner is told.** Replacing an estimate is
not re-opening a ruling; it is the condition the ruling was given under. **Report the measured band in
which the wordmark is absent** once work item 1 lands, rather than repeating a figure from this plan.

### The flagged sentence leaves the bar — owner ruling, 2026-09-09 — and the 9.28 px is retired

**The measurement that forced the question.** The desktop price cell is a row: figure (**180.92 px**)
then ADR 0065's sentence at `flex: 0 1 320px`, whose max-content is **408.09**, min-content **71.22**
(the longest word; it cannot go below), and about **226 px** at the two-line wrap that keeps the band
at the ruled 76. This wave adds `Verifică designul` (**167.22**) and the pill to that same row, and
**nothing fitted at 900 px, at any rung, with or without the wordmark.** Today's layout only fits
because it has neither the CTA nor the pill in the row.

**The owner ruled the sentence out of the bar and onto the scene**, over the alternative of letting
the desktop bar grow on a flagged design. Two consequences, and the first is the point of the choice:

1. **The header keeps frame D2A's shape at every width, flagged or not.** No width at which a flagged
   design draws a different header from an unflagged one — not taller, not a narrower price cell, not
   a different rung. **Criterion 12c asserts it.**
2. **`1cc86d8`'s 9.28 px trade is retired, not repaid.** The height was bought to fit this sentence
   into the row; the sentence leaves the row. The exception recorded at `.header` in
   `configure.module.css` is **struck in place with its cause**, and
   `settings-strip-containment.desktop.e2e.spec.ts:655`, which asserts the growth, is **re-pointed to
   assert the header does not grow** — never deleted. A gate that proved a now-retired trade becomes
   the gate that proves it stayed retired.

**It moves on both shells**, because one placement needs no per-viewport fork and §10.1 says a rule
that differs between viewports is a wrong rule. Desktop-only would be the permitted layout fork and is
equally available — open question 3, a one-word answer at review. **ADR 0065's wording is untouched**;
whether the two adjacent sentences should become one is open question 3 as well, and is copy rather
than layout.

### What each rung needs, with four settings

Colour joins the pill, so the widths above are re-derived. Same method: frame D2A rebuilt from the
mockup's own inline styles, headless Chromium, the app's font stack. **Type measurements, not the
app** — work item 1 replaces them.

Pill widths, four settings in the ruled order `material │ colour │ hardware │ depth`: four whole
labels **484.17**, three + `+1` **407.52**, two + `+2` **290.64**, one + `+3` **180.69**, rung-4 floor
(last label → 0) **97.30**. With the book's longest shipped decor — `Culoare Stejar Bardolino Natur`
— four whole labels is **565.45**, and one + `+3` is unchanged at **180.69**, because the surviving
name is `PAL melaminat`.

**Viewport needed, with the wordmark dropped per the owner's ruling:**

| pill shows | needs |
| --- | --- |
| four whole labels | 1154.98 |
| three + `+1` | 1078.33 |
| two + `+2` | 961.45 |
| one + `+3` | **851.50** |
| rung-4 floor | 768.11 |

So at **900 px** the pill shows `PAL melaminat +3` whole, with room to spare; the fourth label appears
around **1155 px**. With the wordmark kept, each figure rises by 114.56 and `PAL melaminat +3` would
not fit until **966.06** — which is the 900–966 px window the owner ruled on.

**`PAL melaminat` is the name that survives**, because the ladder collapses from the end and ADR 0099
decision 9 puts colour second. That is also what frame 2A draws at its own extreme.

## Copy — every new or changed string, and where it comes from

All in `apps/web/src/content/ro.ts`. **`apps/web/src/messages/ro.json` is not touched** — M6B is the
owner's own parallel session.

| key | string | source | note |
| --- | --- | --- | --- |
| `configure.reviewCta` | `Verifică designul` | Desktop `:567`; Mobile `:517` | identical in both files |
| `configure.backAction` | `Înapoi` | Mobile `:516` | the bottom bar's control |
| `configure.back` | ~~`‹ Cameră`~~ → **`Cameră`** | the frames draw a bare `‹` | the glyph moves into the component, as `▾` and the breakdown chevron already do. The string becomes the control's **accessible name**; a `‹` read aloud is not one. **The wording is not in the frames** — if the owner wants different words, this is the line |
| `globalSettings.pillMaterial` | the tier name, bare | Desktop `:552` | **not** `Material · PAL melaminat`. D2A draws the material bare; the swatch beside it already says what it is |
| `globalSettings.pillHardware` | `Feronerie {tier}` | Desktop `:555` | **no `·`** — the shipped chips use the breakdown's separator, D2A does not, and the frame wins (ADR 0104 decision 1) |
| `globalSettings.pillDepth` | `Adâncime {n}` | Desktop `:557` | the frame names depth on the pill; ADR 0082 left that open and this closes it |
| `globalSettings.pillColour` | `Culoare {name}` | **no source in either frame** | colour post-dates the mockups. Follows the pattern D2A does establish — category word, value, no separator. **Open question 4** |
| `globalSettings.pillCount` | `+{n}` | Mobile `:492`; the owner's `MDF, Blum + 1` | derived; `n` is how many settings are **not shown**, never a literal |
| `globalSettings.pillNameAllSettings` | the pill's accessible name, listing **every** setting whole | — | the count is a visual economy; it must not cost a screen-reader user a setting |
| `globalSettings.open` | `Setări globale` | — | **kept**, and becomes the pill's accessible name rather than visible text. No frame draws a text trigger; the pill is the control |
| `priceBreakdown.title` | `De ce acest preț` | — | **unchanged.** Open question 2 |
| `price.overflowingTotalWarning` | — | — | **unchanged.** Open question 3 |

`globalSettings.pillMaterial` and `pillHardware` reuse
`ro.priceBreakdown.wholeKitchenLabel(category, tierName)`, which is what `toChip` already composes —
so the pill's segments and the breakdown's lines cannot come to spell a tier two ways.

---

## Tests — what dies, what is re-pointed, what is still true

**No gate is deleted to make a layout pass.** Where an assertion loses its subject, what replaces it
is named here.

### `apps/web/tests/app/configurator/configure/top-bar-box.test.ts`

| case | disposition |
| --- | --- |
| *“is 48 px on mobile”* | **re-pointed to 50**, and the `< 55` comparison against `HEIGHT_AT_BASE_COMMIT_PX` survives. The 2 px is the frame's own chip and is stated as a cost |
| *“is frame D2A's own 76 px on desktop”* | **number survives, derivation dies.** `headerHeight()` sums padding + tallest child + border; the band now *declares* `height: 76px` because the 48 px CTA does not fit that sum. The case reads the declared height and asserts the tallest child is `≤ 76` |
| *“costs the desktop canvas exactly 21 px”* | **survives as a claim about the band**, and gains a sibling: the screen as a whole *returns* ~45 px, because the strip's row is gone |
| *“is the element that sets the desktop row's height”* | **re-pointed.** With a declared height it is true by construction on the seeded design; the case becomes *no other top-bar cell's content box exceeds 76* — and it must now check five cells, not two |
| *“stretches the price cell to the ruled band”* | **generalised to all five items** |
| *“takes the locale chip as its tallest child on both shells”* | **dies.** Desktop's tallest is the 48 px CTA; mobile's is the 27 px settings chip. Replaced by *the tallest child is the one the frame draws tallest*, named per shell |
| *“declares no height of its own and no scrolling”* | **half dies.** The band now declares a height, deliberately and from the frame. The **no-scrolling** half survives and is the half that was protecting something |
| *“renders no progress segments”*, *“one row rather than a column”*, *“truncates the title on mobile”*, *“shows exactly one of the back control and the wordmark per shell”* | **all still true**, and the last gains a third state: the wordmark also leaves when the header's fit model says it must |
| *“keeps the locale chip out of the flexible space”* | **re-pointed**: the chip is a grid item now, so `margin-left: auto` is replaced by its track being `auto` |
| *“the step number has one source”*, *“the locale chip is drawn and inert”* | **untouched** |

### `apps/web/tests/e2e/settings-strip-containment.desktop.e2e.spec.ts` and `.e2e.spec.ts`

These are the two specs written for the withdrawn layout, and they carry ADR 0082's amended predicate
and ADR 0094's criteria 4a–4h. **Every predicate is still true of the pill; the subject changes.**

| assertion | disposition |
| --- | --- |
| chip-count sweeps (2, 3, 4, 5 chips) | **die** — there is no chip count. Replaced by a **label-length** sweep: the shipped tier names, and a book-length name long enough to drive the pill to rung 4, since [ADR 0062](../../decisions/0062-a-manufacturer-price-dashboard-comes-after-m8-and-shapes-seams-now.md) seam 1 makes tier names data authored outside TypeScript. That is what ADR 0082 decision 1 was actually about |
| *contains every chip and the trigger* (viewport) | **survives, re-pointed at the pill and at every other top-bar control** — including the CTA and the locale, which is the assertion that would catch D2A drawn at a width it does not fit |
| *inside `.settingsRow`'s own band* (4b) | **survives**, with the band being the pill's own grid item |
| *no chip clipped* (4a) | **survives, and tightens**: **at most one** element on the pill may report `scrollWidth > clientWidth`, and it is the **last shown label at rung 4**. At rungs 1–3 the count is zero — a label that does not fit is counted, not cut |
| *no strip control intersects the price bar; the total keeps its hit test* (4c) | **survives whole and matters more**, because the pill now stands in the same row as the price |
| *vertical growth absorbed by the stage* (4d) | **survives**, measured against the new row count |
| *the nav is not clipped at 900* (4e) | **survives**, and is the gate on degradation steps 3 and 5 |
| *the top bar grows only between 900 and 1025 on a flagged design* | **re-measured, not assumed.** The row's other contents changed. Both ends stay asserted |
| the 44 px trigger target | **survives; the measurement changes** from `getBoundingClientRect()` to `elementFromPoint` at the hit area's corners, because the painted pill is now the frame's 27/40 px |
| *not a scroll container in either axis* | **survives** |
| the trigger's position is a function of the viewport, not the chip count | **discharged** (ADR 0082 decision 4). Replaced by: the pill's position is a function of the viewport and of nothing the price book authors |
| — | **new**: the sweep runs at 390, 900, 1000, 1100, 1440 and 1920 on flagged and seeded designs, and records **which rung** the pill is on at each — so a fix that moves a rung boundary is visible rather than silent |
| — | **new**: the fit model's own property tests (`visibleCount + hiddenCount === settings.length`; `visibleCount >= 1`; monotone in available width; no label hidden while there is room for it), run with `fast-check` over a swept width range and a randomised label order rather than at fixed examples |

Rename both files once the assertions are re-pointed; a spec called `settings-strip-*` that measures
a pill is the false comment ADR 0082 decision 7 is about, in a filename.

### Everything else

- `top-bar.desktop.e2e.spec.ts` — *draws the band at 76*, *the locale chip at the right-hand end,
  inside the screen*, *cuts none of the row's own copy*: all **survive**, and *draws the band at 76*
  **gains the flagged design at 900–1025**, which is where it could not hold before this wave. *Leaves the scene the
  viewport less the two bands, 21 px shorter* is **re-measured**: there are no longer two bands.
- `top-bar.e2e.spec.ts` — the mobile band's height is **re-pointed to 50**; *carries no progress
  segments*, *truncates a title three times the shipped one*: **survive**. *Loses no height to the
  refreshed band* is **re-measured** — the scene gains.
- `editor-rail.desktop.e2e.spec.ts` — its page-pixel patches are **re-measured against the new canvas
  origin** (ADR 0094 criterion 4f). The canvas moves **up** ~45 px on desktop and ~74 px on mobile.
- `qa-w4-top-bar.adversarial.test.ts` — *draws exactly the four boxes the height sum measures* and
  *declares the numbers its own comment says it declares* both **die with the sum**; replaced by the
  declared-height assertions above. Its desktop click constants are **re-measured**.
- `global-settings*.e2e.spec.ts`, `read-only-global-settings.e2e.spec.ts` — address
  `global-settings-trigger`. That test id **moves onto the pill** rather than disappearing, so the
  suite keeps its handle; the read-only greying and its `title` reason move with it.
- `price-footer-growth.e2e.spec.ts`, `price-breakdown*.e2e.spec.ts` — **unaffected in rule**,
  re-measured in geometry.
- `price-bar-layout.test.ts` — `PRICE_BAR_RESERVED_HEIGHT_PX = 92` is frame 2A's own figure box and is
  **unchanged**; the mobile bottom bar's second row is a separate grid item and does not enter it.

---

## What this wave reclaims, and what it does not

- **The desktop canvas gets ~45 px back** at every width — the strip's row, the cost ADR 0094
  accepted knowingly. **The mobile canvas gets ~76 px back**, less the 2 px the header grows.
- **`1cc86d8`'s 9.28 px is retired, not repaid.** The height was bought to fit ADR 0065's sentence
  into the top bar; the owner's ruling of 2026-09-09 takes the sentence out of the bar, so the trade
  has nothing left to buy. Criterion 12b asserts the band is 76.0 on a flagged design too, and
  `settings-strip-containment.desktop.e2e.spec.ts:655` is re-pointed to prove it stays that way.
- **The `fit-content(50%)` cap on the price track is superseded**, because the top bar is no longer
  two columns. Its purpose — neither cell may starve the other — survives as the containment
  assertion on all five items (criterion 4e's descendant).

---

## Acceptance criteria

**Written for a person with the mockup open beside the app.** Each names the frame it comes from, and
beside it what a test measures. Ordered so the most visible differences come first.

### Desktop, at 1920 px — frame D2A open beside the browser

1. **There is one bar and then the scene. No second band anywhere.**
   *Test:* `.screen` declares two grid rows on desktop; no rule named `settingsRow` exists in the
   stylesheet; the canvas's top edge is the band's bottom edge ± 1 px.
2. **`Verifică designul` is in the bar**, brown `#7c5c3d`, white text, between the price and `RO ▾`,
   with a thin divider on each side. *(D2A `:567`)*
   *Test:* the element exists, computes `background-color: rgb(124, 92, 61)`, `height: 48px`,
   `border-radius: 12px`; it is not a `button`, has no `role`, no `tabindex`, and pressing it changes
   neither the URL nor the design.
3. **The settings are one pill**, reading `▨ PAL melaminat │ Feronerie Hettich │ Adâncime 600 ▾`, not
   two chips and a *Setări globale* button. *(D2A `:549–556`)*
   *Test:* exactly one element carries `global-settings-trigger`; it contains a swatch, three whole
   labels separated by `│`, and a caret; no counter is drawn; no element renders
   `ro.globalSettings.open` as visible text.
4. **Clicking the pill opens the settings**, the pill goes `#ece7dd` with a `#7c5c3d` border and its
   caret flips to `⌃`, and the popover hangs under its right edge. *(D2E `:953`, `:961`)*
   *Test:* on open, the pill's computed background and border-color change to those values; the
   popover's right edge is the pill's right edge ± 1 px and its top is `pill.bottom + 33 ± 1`.
5. **The bar is 76 px tall, and everything in it sits on one unbroken line.** *(D2A `:544`)*
   *Test:* `.nav`'s box is 76.0; the four other top-bar items report the same top and bottom; each
   draws the same `border-bottom`.
6. **The depth is named on the pill** — `Adâncime 600`, which never appeared on screen before.
   *Test:* the pill's third segment equals `ro.globalSettings.pillDepth(depthMm)` for the design's
   declared depth.
7. **`Lemnaria`, `2/4`, `Configurare` sit left; the pill, the price, the CTA and `RO ▾` sit right,
   in that order, with three dividers.** *(D2A `:545–571`)*
   *Test:* the five items' left edges are strictly increasing in that order; three divider
   pseudo-elements paint at 1 × 28 px.

### Mobile, at 390 × 844 — frame 2A open beside the browser

8. **The header is one row and the settings are one small chip in it** — swatch, `PAL melaminat`,
   `+2` — not a band of chips underneath. *(2A `:486–490`)*
   *Test:* no `settingsRow` rule exists; the chip's box is inside the header's box on all four edges;
   its `max-width` computes to 150 px; `+2` is the count of settings **not shown**.
8b. **`+2` really counts.** Name a fourth setting and it reads `+3`; widen until two labels fit and it
   reads `+1` with a `│` between them; it is never a literal and never stands alone.
   *Test:* the fit model's property tests — `visibleCount + hiddenCount === settings.length`,
   `visibleCount >= 1`, monotone in width — over a swept range, plus the browser sweep recording the
   rung at each width.
9. **The bottom bar has two rows**: `De la` / the amount / `De ce acest preț ⌃`, then `Înapoi` and
   `Verifică designul`. *(2A `:509–520`)*
   *Test:* `Înapoi` is 96 × 52; the CTA is 52 tall and takes the rest of the row; both are inside the
   viewport; the price figure's box does not move when the second row appears.
10. **The back control at top-left is a bare `‹`**, not `‹ Cameră`. *(2A `:483`)*
    *Test:* its visible text is the glyph alone, its accessible name is `ro.configure.back`, and a tap
    within 44 px of its centre reaches it.
11. **The scene is taller than it was** — the strip band is gone and the header grew 2 px.
    *Test:* the canvas's height at 390 × 844 exceeds the base-commit measurement by the strip's band
    less 2 px, both figures recorded from work item 1.

### Both shells, and the things that must *not* happen

12. **Nothing is cut off and nothing sits on top of anything else**, at 390, 900, 1000, 1100, 1440 and
    1920, on a normal design **and on one where a cabinet overruns its wall**.
    *Test:* ADR 0082 decision 1 as amended, over every top-bar control: `scrollWidth == clientWidth`
    on the document; every control inside the viewport and inside its own item's box on all four
    edges; no control's `scrollWidth > clientWidth` **except the material name**; the union of every
    top-bar control's box with `price-bar`'s is empty; `elementFromPoint` at `price-bar-total`'s left
    edge, centre and right edge returns `price-bar-total` or a descendant.
12b. **The desktop top bar is the ruled 76 px at every width, on a flagged design as well as a
    seeded one.** `1cc86d8`'s 9.28 px exception is retired by the owner's ruling, not repaid.
    *Test:* the band measures 76.0 at 900, 950, 1000, 1025, 1026, 1440 and 1920, on both designs.
    `settings-strip-containment.desktop.e2e.spec.ts:655` — which asserts the growth today — is
    **re-pointed to assert the header does not grow**, and is the gate that proves it stays retired.

12c. **A flagged design draws the same header as an unflagged one, at every width.** This is the
    point of moving the sentence, so it is asserted rather than described.
    *Test:* at each swept width, the header's box, the price cell's box and the pill's rung are
    **identical** on the flagged and seeded designs. Any difference is a finding.

13. **At 900 px the row gives way in the ruled order and no further.** The pill has shed labels into
    its counter and the gaps are frame 2A's; the wordmark is present unless the owner has answered
    question 2 — and the step pill, the price, `Verifică designul` and `RO ▾` are all whole and on
    screen, with the swatch, at least one label and the counter still on the pill.
    **Measured expectation, seeded design, four settings, wordmark dropped per the owner's ruling:**
    one label + `+3` from **851.50 px**, two + `+2` from **961.45**, three + `+1` from **1078.33**,
    four whole labels from **1154.98**. A sweep that finds a boundary more than a few px from these
    is measuring something the plan did not model, and reports it rather than adjusting the plan.
    *Test:* the four protected controls report `scrollWidth == clientWidth` at every swept width and
    are fully inside the viewport; the pill always shows a swatch, `visibleCount >= 1` and a counter
    when `hiddenCount > 0`. **Widening the window restores what it took, in reverse order and without
    flicker**: stepped 1 px at a time across each rung boundary, the count never oscillates.
14. **A long tier name does not break the row.** With a book tier name long enough to drive the pill
    to its floor, the last label ellipsises and nothing else moves.
    *Test:* the label-length sweep; at most one element on the pill reports a clip, and it is the last
    shown label.
15. **The settings sheet still opens over everything, and closes.** The scrim covers the price bar,
    the rail and the scene; focus is trapped; Escape closes; nothing behind it is operable.
    *Test:* the existing `global-settings*.e2e.spec.ts` suite passes unchanged, plus
    `elementFromPoint` over `price-bar-total` while the scrim is up returns the scrim.
16. **No control smaller than 44 px is unreachable.** *(ADR 0082 decision 8, kept)*
    *Test:* `elementFromPoint` at the four corners of a 44 × 44 box centred on the pill, and on the
    back control, returns that control or a descendant — on both shells.
17. **The scene never loses height to a band that is not in the frames.**
    *Test:* the stage is the only `minmax(0, 1fr)` row in `.screen` on both shells, and the canvas
    keeps a positive height at every swept width on a flagged design.
18. **Nothing in `apps/web/src/messages/ro.json` changed**, and no new Romanian literal appears
    outside `content/ro.ts`.
    *Test:* `git diff --stat` names neither; the repository's existing copy-location gate stays green.

---

## Risks

| risk | why it is real here | mitigation |
| --- | --- | --- |
| **Rungs 1–3 are attempted with flex shrink** | it is the obvious CSS reflex, and it silently produces the row of stubs ADR 0082 decision 3 refused | the two mechanisms are separated in *How the pill narrows*; criterion 14 asserts **at most one** clip and criterion 8b asserts the count |
| **The first `ResizeObserver` in `apps/web/src`** | nothing in the tree observes an element's size today, so SSR safety, the pre-measurement first paint, and jsdom's lack of a real layout are all new ground; a unit test that silently observes nothing would assert a default and pass | the count is a **pure function** tested as a value, not through the observer; the observer is a thin seam with its own test; the first-paint settle is a browser criterion (*How the pill narrows*), not an assumption |
| **The count oscillates at a boundary width, or thrashes on an M6B string change** | a measure-and-decide loop is the classic layout-thrash shape | content-derived hysteresis (separator + gap), an idempotent decision, a skipped state write when the count is unchanged, label widths keyed on the string; criterion 13's 1 px sweep across each boundary |
| **A pixel `min-width` is added to make the floor "look right"** | it is the fix an implementer reaches for when a rung-4 label reads as a stub | ADR 0082 decision 3's refusal survives whole (ADR 0104 decision 9); an unusable floor is a **reported failure**, not a constant |
| **The scrim stops covering the price bar** | the settings move out of a band that carried `z-index: 7` for that reason; this failure took 44 of 58 specs down in wave 6K-b3 | re-derive the stacking table, write it in the stylesheet, assert criterion 15 |
| **The 44 px target is met by a `min-height` and quietly lifts the band** | it is the obvious fix and it costs scene | ADR 0104 decision 5; criterion 16 measures the hit area, not the box |
| **A re-pointed test is weakened rather than re-aimed** | six cases in `top-bar-box.test.ts` lose their derivation | every disposition in *Tests* names the replacement; a case that loses its subject and gains nothing is a finding |
| **The canvas origin is nudged rather than re-measured** | it moves twice as far as 6R-b moved it, in the other direction | work items 1 and 11; ADR 0094 criterion 4f |
| **The copy fork is “fixed” to match the reference** | the reference disagrees with itself, and an implementer reading “SAME” will reconcile it | ADR 0104 decision 7; open question 2; criterion 18's neighbour: `priceBreakdown.title` is unchanged in the diff |
| **The owner reviews and sees no coverage panel** | D2A draws one and this wave does not build it | named at the head of the owner questions, in *Goal*, and again in the report to the owner |
| **The two overflow sentences read as one duplicated message** | they now sit adjacent, and ADR 0065 made them two constants on purpose | open question 3, answerable at review; neither wording is changed by this wave |
| **The wordmark ruling was given on a measurement of the frame, not of the app** | the app's tokens and rendering are not the mockup's | work item 1 measures the app and states the revisit condition explicitly: rung 3 fitting at 900 px with the wordmark sends it back to the owner |

## Verification method

1. `pnpm ci:local` — all gates, quoted, on the tree that is reviewed.
2. **A browser pass on both shells at 390 × 844, 900, 1000, 1100, 1440 and 1920**, on the seeded
   design **and** on one carrying ADR 0065's flag (minted and deleted the way
   `overflow-mark.e2e.spec.ts` already does), with captures beside the corresponding frame.
   **Which rung the pill is on is recorded at every width**, so a later change that moves a boundary
   is visible rather than silent. Every number in *Acceptance criteria* recorded as measured, with the
   before-column from work item 1.
2b. **A slow drag across each rung boundary**, 1 px at a time in both directions, watching for
   oscillation and for a visible settle on first paint. This is the one failure the static sweep
   cannot see.
3. **The owner's review comes before QA**, on the running app, with both mockup files open.
4. QA and review are dispatched only after the owner's review, per `docs/WORKFLOW.md`.
