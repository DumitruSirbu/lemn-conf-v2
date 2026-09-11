# ADR 0107 — Appliances are drawn and not sold, and a language is named in its own language

Status: **Accepted — six owner rulings given 2026-09-10 while driving the built configurator, shipped
2026-09-10/11.** Decision 3 is recorded in full at
[ADR 0032](0032-an-entry-that-does-not-fit-is-shown-disabled-with-its-reason.md)'s *Superseded*
section, which this record does not restate. Decision 4 **amends
[ADR 0099](0099-a-colour-is-chosen-at-two-levels-and-the-cabinets-wins.md) decision 8**'s placement
(Amendment D there). Decision 6 **departs from a number frame D2A declares** and is recorded as an
amendment at [ADR 0104](0104-the-mockups-are-the-chrome-specification-and-the-strips-own-row-is-withdrawn.md)
so the frame's own reader meets it.
Date: 2026-09-11 (rulings given 2026-09-10)
Type: Decision (owner rulings)
Milestone: M6B — the owner's review of the built product, after every wave had shipped

## Context

M6B's build scope was complete and the milestone was sitting on Gate O2 when the owner drove the
running configurator themselves, on both shells and in both locales. **This is the first record in
the milestone written from the built product rather than from a plan**, and the six rulings below are
what they asked for on seeing it. Four of them are product decisions with reasons worth keeping; two
are typographic and are here because they contradict a mockup declaration and would otherwise be
"corrected" back by the next reader.

The owner also **edited Romanian directly** in `apps/web/src/messages/ro.json` during the session —
`rejection.WIDTH_NOT_SUPPORTED_COLUMN`, `globalSettings.colourNote`, `globalSettings.colourWarning`
and `panel.finishFollowsKitchen` — and ruled the Russian `panel.finishFollowsKitchen` personally. All
four Romanian values are recorded as approved in the copy lock
(`apps/web/tests/support/approved-romanian-messages.ts`), which is what Gate O1 approval looks like
in this codebase. **They are the owner's own words and no agent may reword them.**

## Decision 1 — a language is chosen from a dropdown, built for N locales, and named in its own language

**Why a dropdown and not the two-locale toggle 6B-i shipped:** *English is coming.* 6B-i's `RO ▾`
chip was a link to *"the other one"* and its own `use-locale-switch.ts` threw when there was not
exactly one other locale — a deliberate loud failure that a third locale was always going to trip.
The control is now a menu over `routing.locales`, and adding a locale is a data change.

**A language is named in its own language.** `Română`, never *Romanian*; `Русский`, never
*Румынский* — the person hunting for it cannot read the page they are on and scans for the word
*they* recognise. So the endonyms live in one `Record<AppLocale, string>`
(`apps/web/src/i18n/locale-endonyms.ts`) and **not in the message catalogues**: N locales would need
N² identical leaves and give a translator N² chances to translate a word that must not be
translated. This is [ADR 0106](0106-the-price-books-display-prose-publishes-descriptors-and-the-book-keeps-the-tier.md)
decision 1's rule — *a name that must not be translated gets no key* — applied a second time, after
*Hettich* and *Blum*.

**A flag replaces the current-locale dot, and Romanian flies Moldova's flag.** The language is
Romanian; the market is Moldova. The flag names the customer's country and the endonym beside it
names the language, so neither has to carry the other's meaning. Every flag is `aria-hidden`: the
endonym already names the row, and a flag can never carry *which language is current* — `aria-current`
and the row's weight do that.

**Drawn as inline SVG, never typed as emoji.** The flag emoji are regional-indicator pairs and
**Windows ships no font that has them**, so a customer there would read the bare letters *MD* and
*RU* where a flag belongs. An SVG has no font to be missing. Moldova's arms are omitted deliberately:
they are illegible much below 40 px and the flag is drawn at 18 — what is exact is everything a
*wrong* flag gets wrong (band order, equal bands, colours, each flag's own proportion).

**Both tables are `Record<AppLocale, …>` so a new locale is a compile error until it has a name and a
flag** — and both readers **throw** rather than returning `undefined`. See decision 1's failure in
*What the review found*, at the milestone: the compile error is only half a guard, because `next dev`
erases types.

**One catalogue leaf, `configure.localeMenu`**, replacing 6B-i's `configure.localeSwitch`. Its
Romanian was authored after Gate O1 closed and **has never been through that gate**; the Gate O2
review aid still lists the old key and the old sentence. See *Consequences*.

## Decision 2 — appliances are drawn, not sold, and `suppliedBy` is a fact on the book row

The breakdown charged **12 000 MDL for a free-standing fridge** directly beneath a disclaimer that
says the estimate excludes *electrocasnice*. The screen contradicted itself, and the fridge line is
what exposed it.

**An appliance the customer buys prices to zero and reads *nu este inclus*.** `cabinet.hood` and
`cabinet.fridge-free` are `drawnButNotSupplied()` in
`packages/configurator-domain/src/pricing/sample-price-book.ts` — `pricedFlat(0)` and
`suppliedBy: "customer"` written by **one call**, so a book cannot state one without the other.

**The housings are carpentry and keep their prices.** `tall-fridge-housing` — the built niche an
*integrated* fridge sits in — stays at 7 000 MDL, and what Lemnaria builds around a hood is a
different row and still priced. The two are different products and only one of them is ours.

**Zero and not-supplied are different facts and must never be conflated**, which is why this is a
declaration rather than a price of zero. A manufacturer cabinet that happens to be free reads
*inclus*; a customer-supplied appliance reads *nu este inclus* (`priceBreakdown.notIncluded`), and
`price-breakdown-model.ts` can only tell them apart because the row says which it is.

**Absence means joinery.** `DEFAULT_CABINET_SUPPLIER` is `"manufacturer"`, so a new row — including a
new zero-priced one — is cabinetry until somebody writes down that it is not, and `parsePriceBook`
refuses a book that charges for something it declares it does not supply. The claim on the screen and
the arithmetic under the total cannot disagree.

**This is a seam for the manufacturer price dashboard** ([ADR 0062](0062-a-manufacturer-price-dashboard-comes-after-m8-and-shapes-seams-now.md)):
`suppliedBy` is an optional field on the book row, so a dashboard-authored book says who supplies a
cabinet in the same place it says what the cabinet costs.

## Decision 3 — no greyed offers

*"Don't need to show any greyed out cabinets, it's hard to understand why on base cabinet I see hood
as user is like WTF is this. Show only what is possible to insert."*

**ADR 0032 is superseded, and the full record — including what the reversal costs a customer who
wanted a two-door at 450 mm — is in that file's own *Superseded* section.** It is not restated here.
A future wave proposing to show unavailable entries is contradicting an owner ruling made against
shipped behaviour, not reopening an undecided question.

## Decision 4 — the reset leaves the carousel

The *follow the kitchen's colour* control was drawn as one more chip inside the horizontally
scrolling colour row, on the argument that it is a choice among the choices. **It is not a colour, it
is a reset**, and a reset that can scroll out of sight turns the way back out of an override into
something a customer has to hunt for — **reintroducing ADR 0099 decision 8's one-way door as a scroll
position**. Decision 8 exists precisely so the first tap on a swatch does not pin a cabinet out of
the global default for ever; a control that is present but off-screen satisfies it on paper and not
in a browser.

It now sits on its **own full-width row directly under the colour control**, fixed, centred, always
where it was left, carrying `.followRow` rather than `.swatch` — so a later change to swatch styling
cannot drag it back into looking like a colour.

## Decision 5 — a thinner selection highlight

*"I would prefer for the highlight thinner lines, current red lines are too thick."*
`SELECTION_OUTLINE_WIDTH_PX` **4 → 2**.

**The casing moved with it**, and that is part of the ruling rather than an implementation detail:
narrowing the core alone would have left a 2 px black rim on either side of a 2 px red core, and the
highlight would have read as a black outline with a red seam rather than as a red one. The casing is
a **sum** (`core + 2`), not a ratio, because what has to survive is the rim and a rim is a difference
of widths in screen pixels — a ratio would make it vanish exactly where it is needed most, on a body
far from the camera. **A 1 px rim is the floor:** if thinner is asked for again, the core moves and
the addend stays at 2.

## Decision 6 — one figure treatment, prefix regular and only the amount bold

**The prefix is a qualifier on the figure, not part of it.** Setting both at weight 700 made *de la*
compete with the number it qualifies. Every price figure the product draws now renders its label at
**400** and its amount at **700**, at one size per surface.

Frame D2A declares the whole string at `700 21px` (`de la {{ priceTotal }} MDL`). **This ruling
overrides that declaration**, which under ADR 0104's *the frames are a specification* would otherwise
be a defect to fix back; ADR 0104 carries the amendment so its own reader meets it.

**"Every surface" means four**, and naming them is the load-bearing part of this decision, because a
commit in this session claimed *"both surfaces"* and reached two of them: the price bar
(`price/price-bar.module.css`, one element serving frame 2A's bottom bar and frame D2A's top-bar
figure), the price breakdown (`price/price-breakdown.module.css`), the editor panel's footer total
(`panel/editor-panel.module.css`) and the global settings sheet
(`settings/global-settings.module.css`).

## What this is not

- **Not a change to what the kitchen costs.** Decision 2 removes two appliance amounts from the
  total; no joinery row, formula, tier or coefficient moves.
- **Not permission to translate a brand or a language name.** Decision 1 extends ADR 0106 decision
  1's *no key* rule to endonyms; it does not weaken the rule that customer-visible prose is keyed.
- **Not a new locale.** English is the *reason* for the dropdown's shape and is not shipped:
  `routing.locales` still holds `ro` and `ru`, and M6B's open question 3 is unchanged.
- **Not a re-opening of the chrome parity plan.** Decisions 5 and 6 are adjustments to what that
  work produced, ruled by the owner against a running browser.

## Decision 7 — a cabinet named for an appliance is the niche, and the niche is sold

**Raised as an open question by the logic reviewer, 2026-09-11; ruled by the owner the same day.**

The question was this. `priceBreakdown.disclaimer` says the estimate excludes *electrocasnice*, and
directly beneath it the breakdown prints *Coloană cuptor + microunde* at 9 000 MDL — so a customer
reading the two lines together appeared to see the contradiction decision 2 was ruled to remove.

**The owner ruled there is no contradiction, and the label stands.** In the owner's words: *"the
cabinets represent the niche where this appliances are installed, and yes appliances are not included
in price but the niche is."*

So a cabinet that carries an appliance's name **names the joinery built around it, not the appliance**.
`cabinet.tall-oven-tower` (900 000) and `cabinet.tall-fridge-housing` (700 000) are carpentry
Lemnaria manufactures and they keep their prices; `cabinet.hood` and `cabinet.fridge-free` are the
appliance and nothing else, and decision 2 zeroes them through `drawnButNotSupplied()`. The two
groups are different products and only one of them is Lemnaria's.

**Nothing in the tree changes.** This ruling was checked against `sample-price-book.ts` on the day it
was made and the code already encoded it — including the comment beside `cabinet.fridge-free`, which
already reasoned that *"`tall-fridge-housing` — the built niche an integrated fridge sits in — is
joinery and keeps its price"*. The ruling is recorded so the label is not "corrected" by a later wave
reading the disclaimer beside it and inferring a defect. **It is not an O1-class change**, because no
string moves.

## Consequences

- **The Gate O2 review aid is stale in five rows**, and it is the owner's own review surface.
  `docs/i18n/gate-o2-russian-review.md` line 106 lists `configure.localeSwitch` with a sentence that
  no longer exists — the shipped leaf is `configure.localeMenu` — and lines 174, 222, 223 and 364
  carry the pre-edit Romanian **and** Russian for the four leaves the owner changed during the
  session. Read against `apps/web/src/messages/ro.json` and `ru.json`, not against the aid, for
  those five. The file is the owner's aid and no agent edits it; the staleness is recorded in
  `docs/STATUS.md` and in the milestone instead.
- **`configure.localeMenu` still owes a Gate O1 read**, for the reason F4 gave for the key it
  replaces: its Romanian was authored after the gate closed.
- **A book row now carries who supplies the cabinet**, and the price dashboard inherits it as an
  editable fact rather than as a special case in the breakdown.
- **The camera preset left React's tree** as part of the same round — not an owner ruling, a defect
  the round found — and its record is `apps/web/src/scene/camera-preset-store.ts` plus the milestone
  file. It is named here only so a reader of decision 1 knows why switching language no longer moves
  the camera.
