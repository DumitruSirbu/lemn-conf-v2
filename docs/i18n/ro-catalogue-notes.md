# Reading guide for `apps/web/src/messages/ro.json`

Collected 2026-09-06 on branch `wave/6t-finish`, ahead of milestone M6B's own waves, at the owner's
request: *"can we in parallel extract all strings for internationalization milestone, just to start
the files, no code replacements."*

**This file is not wired to anything.** No call site, import or test was changed. `ro.ts` and the
domain's Romanian are still what the product renders. This is the reading copy for
[Gate O1](../milestones/done/M6B-internationalization.md), and the Romanian in it is **verbatim** — the
only value that differs from what ships today is the zero-count plural, which the owner ruled on
2026-09-06.

## What was collected, and from where

| Namespace | Keys | Source |
| --- | --- | --- |
| `brand` | 1 | `apps/web/src/content/ro.ts` |
| `meta` | 2 | `apps/web/src/app/layout.tsx:9-10` — **new namespace, see judgement call 1** |
| `configure` | 9 | `ro.ts` |
| `panel` | 52 | `ro.ts` |
| `price` | 3 | `ro.ts` |
| `priceBreakdown` | 13 | `ro.ts` |
| `globalSettings` | 19 | `ro.ts` |
| `webglUnavailable` | 7 | `ro.ts` |
| `designLoadError` | 4 | `ro.ts` |
| `contactPlaceholder` | 3 | `ro.ts` — M8 stub, carried across unchanged and not extended |
| `band` | 4 | `packages/configurator-domain/src/bands.ts` (`BAND_LABELS_RO`) |
| `finish` | 8 | `materials.ts:194-233` — the palette names the swatches render |
| `catalog` | 32 | `catalog.ts` (13 kind labels, 16 entry labels, the unknown-kind label, the door-count plural) and `queries/describe-selection.ts` (`EMPTY_SLOT_LABEL_RO`) |
| `rejection` | 43 | `commands/rejection.ts` — 34 codes across 37 keys, plus 6 composition fragments |
| **Total** | **200** | |

`ro.ts` accounts for 111 of these keys — every one of its 17 function-valued entries and every leaf
of its 11 nested groups. A mechanical diff of every identifier in `ro.ts` against the key tree finds
nothing missing.

**On the counts in ADR 0095.** It records `ro.ts` as *"59 plain string entries"*; the file has 94
non-function leaf strings, because the 59 does not descend into the nested groups
(`panel.bandWords`, `configure.cameraPresets`, and nine others). Its *"17 function-valued entries"*
is exact. Its *"17-entry `KIND_LABELS_RO`"* is **wrong**: the map has **13** entries.

## The one value that changed: the zero-count plural

Owner ruling, 2026-09-06 — *"one is plural, it's needed to be used instead of '0 de corpuri' => '0
corpuri'"*. Encoded as CLDR `one` / `few` / `other`, which produces it without a special case:

- `panel.countForBody` at 0 → *"0 corpuri bază de 600"* (was *"0 de corpuri…"*)
- `globalSettings.appliesTo` at 0 → *"Se aplică tuturor celor 0 corpuri."*

Everything else is unchanged: 1 → *corp*, 2–19 → *corpuri*, 20 and 100 → *de corpuri*, 101 →
*corpuri*. **(The 20/100 form is superseded — see the section below.)** Verified by rendering each message through `intl-messageformat` at 0, 1, 2, 19, 20, 100
and 101. **Neither of the two false comments at `ro.ts:4-7` and `ro.ts:15-19` was carried across**;
nothing in this file or this guide claims *"0 de corpuri"*.

## Superseded 2026-09-10 — *"de"* leaves the plural entirely

**Owner ruling, 2026-09-10, on two catalogue defects raised during the M6B rebase:**

1. *"pentru"* — `globalSettings.appliesTo` read *"Nu se setează **petru** fiecare dulap în parte"*.
   A transcription slip in the collected catalogue; corrected.
2. ***"without «de» on plural"*** — the `other` band takes the bare noun at **every** count, so
   twenty reads *"20 dulapuri"* and a hundred *"100 dulapuri"*.

This **supersedes** the row below that says *"20 and 100 → de corpuri"*, and it supersedes
[ADR 0086](../decisions/0086-the-confirmation-counts-chosen-colours-and-only-a-different-declared-material-owes-one.md)'s
*"a count of twenty and above takes «de corpuri»"*. The 2026-09-06 zero ruling is not reversed — it
is generalised: what was one value's exception is now the rule for the whole band.

`panel.countForBody`, `panel.countForSlot` and `catalog.bodyLabelWithDoors` carried the *"de"* and
were changed; `globalSettings.appliesTo` and `globalSettings.materialResetConfirm.body` were already
written without it. The three CLDR bands stay declared even where `few` and `other` now read the
same — the band structure is what a later locale and a later reviewer read, and collapsing it would
hide the ruling rather than record it.

**Overridden 2026-10-20 [owner, answered directly; relayed by the coordinator]:** the owner reversed this ruling
(plan M8B Lot 2, O17). Counts are written **with «de» from twenty up** ("20 de bucătării"), by the standard Romanian
rule: «de» when the last two digits are 20-99 or 00. The text above is kept as the record of the 2026-09-10 ruling; where
it differs, this note governs. A developer is implementing the grammar rule [relayed; not verified]. The three CLDR
bands stay declared.

Rendered and verified at 0, 1, 2, 19, 20, 100 and 101.

## Romanian I would question — for the owner to rule on

Collected verbatim; none of it was edited.

1. **`rejection.ACCESSORY_NOT_DELETABLE`** — *"…face parte din corpul de sub **ea** și nu poate fi
   **ștearsă** separat."* Feminine agreement, while every sibling refusal is masculine (*"nu poate
   fi șters"*). It reads correctly only when `{label}` is feminine, e.g. *plita*. `rejection.ts`
   records that ADR 0027 removed this refusal's subject and no command produces the code today, so
   nothing renders it — but it is in the file and it will be translated.
2. **`rejection.BAND_MISMATCH`, base arm** — with the generic label it renders *"„Corp suspendat”
   este un corp suspendat: nu are soclu…"*, which restates the name it just quoted.
3. **`price.overflowingTotalWarning`** ends with no full stop; **`configure.overflowWarning`** ends
   with one. Both are ADR 0065 decision 7b, ruled *"verbatim, punctuation included, and not to be
   tidied"*, so the difference is preserved deliberately and is flagged rather than fixed.
4. **`panel.currentBadge` = *"Actual"*** — in Romanian this reads more as *present-day* than as
   *the one currently fitted*, which is what the badge means.
5. **`catalog.entries.fridge-free` = *"Frigider, liber"*** — the comma is unusual; the retail term is
   normally *frigider independent*.
6. **`catalog.kinds.corner_base_return` = *"Racord bază de colț"* against
   `corner_wall_return` = *"Dulap suspendat de colț"*** — the same structural role in two bands, once
   as a *racord* and once as a *dulap*.
7. **`panel.handleLabels.push` = *"Push-to-open"*** — English inside a Romanian catalogue. It is a
   trade term, but it needs an explicit ruling before `ru.json` is drafted.
8. **`webglUnavailable.contactLink` = *"Vreau să mă contactați"*** — first person singular against
   second person plural. Correct as the polite form; confirming it is cheap.
9. **The eight strings the source itself marks *"pending owner review"***, which have never had one:
   `panel.finishApproximationNote`, `panel.finishPickerLabel`, the four
   `globalSettings.materialResetConfirm.*`, `rejection.FINISH_NOT_OFFERED`, and the three
   `rejection.UNKNOWN_MATERIAL_TIER` / `UNKNOWN_HARDWARE_TIER` / `UNKNOWN_CABINET_DEPTH`. This gate
   is where that review happens.

## Duplicates and near-duplicates

**Deliberate, and documented as such in `ro.ts` — do not merge without re-reading its comments.**

- *"Feronerie"* twice (`priceBreakdown.wholeKitchenCategories.hardware`,
  `globalSettings.groupHeadings.hardware`) — one labels a list line, the other heads a column.
- The band words exist three times over, in three grammatical roles: `band.*` (§9's header,
  raw band), `panel.bandWords.*` (mid-sentence, normalised, singular/plural), and
  `priceBreakdown.bandHeadings.*` (heading over a group, so *coloane* not *coloană*).

**Probably one key, and a real decision for wave 6B-f.** Six catalogue entry labels are
byte-identical to the kind label they resolve through:

| Entry | Kind |
| --- | --- |
| `catalog.entries.base-cabinet` | `catalog.kinds.base_cabinet` — *Corp bază* |
| `catalog.entries.wall-cabinet` | `catalog.kinds.wall_cabinet` — *Corp suspendat* |
| `catalog.entries.base-dishwasher` | `catalog.kinds.dishwasher_housing` — *Nișă mașină de spălat vase* |
| `catalog.entries.open-shelf` | `catalog.kinds.open_shelf_unit` — *Etajeră deschisă* |
| `catalog.entries.hood` | `catalog.kinds.extractor_hood` — *Hotă* |
| `catalog.entries.tall-fridge-housing` | `catalog.kinds.fridge_housing` — *Nișă frigider integrat* |

The first two are one fact in the code already — `catalog.ts:723` and `:892` pass the kind constants
as the entry label, and ADR 0033 says the entry's name and its kind's name *are* the same fact. The
other four are separate literals that happen to agree. Collapsing them is tempting and **ADR 0066 is
the reason not to do it casually**: it split two labels that were identical by accident precisely
because a shared name put two different bodies on the price breakdown under one description.

**One near-duplicate that is a drift risk today.** `price.startingPrefix` is *"De la"*, and
`globalSettings.tierDelta` renders *"de la {addedAmount}"* — in `ro.ts` the lowercase form is
`STARTING_PREFIX.toLowerCase()`, so the two cannot disagree. As two literals they can. Named in
judgement call 9 below.

## The palette names, and the one question they raise

**The surprise in the sweep.** A diacritic grep finds nothing beyond the sources listed above, but
the palette names in **`materials.ts:194-233` have no diacritics** and are therefore invisible to it.
~~Since wave 6R the finish swatches render the material's own declared names~~, so they are
customer-visible copy — and **neither the M6B plan nor ADR 0095 mentions them**, in the in-scope list
or the out-of-scope one. They are collected, under `finish`, verbatim: a `supplierCode` beside a
string makes it identifiable, not data, and ADR 0071 decision 4 confirms these names *with the
owner*, which is the test that matters.

**Superseded 2026-09-10 by wave 6B-f2 (`edf2fc0`) — the names are no longer in `materials.ts`.**
`PaletteEntry.name` is **deleted**; a swatch resolves its name from the entry's `entryId` against
these eight `finish.*` leaves, through `content.finishName`. So the leaves collected here, read by
nothing since Gate O1, are now what the screen shows, and the line/column citations above
(`materials.ts:194-233`) point at rows that carry `entryId` and `supplierCode` only. **The diacritic
blind spot the paragraph opens with is unchanged and still the reason 6B-j needs a second rule**:
*Alb*, *Antracit*, *Stejar Bardolino Natur* and *Nuc* contain no Romanian diacritic wherever they
live. **`supplierCode` stayed in the domain**, deliberately — it is a printed decor code quoted back
on an order, not copy.

**The question for the owner — one ruling, not eight.** These names split into two piles, and only
the owner can say which rule the Russian follows.

| Plain Romanian colour words — **recommend translating** | Supplier decor names — **recommend leaving as they are** |
| --- | --- |
| *Alb* (`finish.pal.alb`) | *Stejar Bardolino Natur* (`finish.pal.stejar-bardolino`) |
| *Antracit* (`finish.pal.antracit`) | *Stejar Halifax Natur* (`finish.pal.stejar-halifax`) |
| *Stejar* (`finish.veneer.stejar`) | *Gri Havanna* (`finish.pal.gri-havanna`) |
| *Nuc* (`finish.veneer.nuc`) | *Nuc Warmia Maro* (`finish.pal.nuc-warmia`) |

The left column is ordinary Romanian a Russian speaker would expect in Russian — *Alb* → *Белый*.
The right column is a manufacturer's decor name printed on the board and quoted back on an order;
translating *Stejar Bardolino Natur* would produce a name that matches nothing the supplier sells.
The split is not clean — *Gri Havanna* and *Nuc Warmia Maro* begin with a Romanian colour word and
end with a decor name — which is why it is a ruling rather than a wave's judgement. **The two veneer
woods are in the left pile deliberately**: `NOT_A_MANUFACTURED_DECOR` marks them as having no
supplier code at all, so nothing is quoted back.

Whichever way it goes, `ro.json` does not change; only `ru.json`'s treatment of eight keys does.

**Updated 2026-09-10 — the question is now live, and it is item F6 at Gate O2.** Wave 6B-i drafted
**all eight translated** (`Stejar Bardolino Natur` → `Дуб Бардолино натуральный`,
`Gri Havanna` → `Серый Гавана`), which is one of the three answers this section lays out and not a
ruling; it is flagged for the owner in
[`gate-o2-russian-review.md`](gate-o2-russian-review.md) as F6, with transliterating and keeping the
manufacturer's Latin name named beside it. If the answer is *keep the Latin name*, the remedy has the
same shape as *Hettich* and *Blum*: **no key, one spelling in every locale**. And the diacritic blind
spot the section above opens with is **closed as a gate**, not as a blind spot — wave 6B-j
(`aff9a2c`) shipped the positional rule that catches diacritic-free Romanian, which is what the
sentence at *"still the reason 6B-j needs a second rule"* was waiting for.

**Updated 2026-09-11 — Gate O2 closed, and F6 was left as drafted rather than ruled on.** The owner
approved the Russian wholesale (*"russian I checked looks ok, if in future I will found something to
fix I will do this"*) without picking one of the three answers above. **This is not a closed
question — it is a standing re-open condition.** All eight names ship translated, exactly as 6B-i
drafted them, and the risk this section names — a customer or supplier matching a decor against a
printed sample working from the manufacturer's own printed name, not the translated one — is
unchanged and uncaught by anything automatic. Re-open this section if a supplier ever reads the
Russian quote.

Deliberately absent, each for a recorded reason:

- ~~**The price book's 6 tier names** (*Standard*, *Hettich*, *Blum*, *PAL melaminat*, *MDF vopsit
  mat*, *Furnir natural*) and its **6 Romanian descriptions** — ADR 0062 and ADR 0095 decision 3 rule
  both as book data rendered, not copy.~~ **Superseded four days after this was written**, by
  [ADR 0095](../decisions/0095-romanian-is-the-source-and-lives-in-message-files-and-the-domain-publishes-codes-not-sentences.md)
  **Amendment B** (2026-09-07): displayed names and descriptions publish descriptors and are resolved
  by the app. The mechanism is
  [ADR 0106](../decisions/0106-the-price-books-display-prose-publishes-descriptors-and-the-book-keeps-the-tier.md)
  — a row keeps `name` and gains an optional `nameKey` — and the work is wave **6B-f2**. Measured on
  the current tree it is ~~**8 names and 8 descriptions**~~, not 6 and 6. ADR 0062 decision 1 still
  holds: what leaves the book is the rendered sentence, never a tier, an amount, a delta or a rule.

  **Shipped 2026-09-10 at `edf2fc0`: 14 keys — 6 names and 8 descriptions.** *Hettich* and *Blum*
  are brand names and carry **no `nameKey`**, which under ADR 0106 decision 1 is how a row says its
  name must not be translated. Three descriptions were then trimmed at `ff8114c` on the owner's
  ruling, because they restated an amount or an earning rule in prose — ADR 0106 **Amendment A**.
- ~~**`MDL`** and the space thousands separator (`price/starting-price.ts:40`) — wave 6B-g's `Intl`
  work, not a message.~~ **Half superseded by ADR 0095 Amendment C** (2026-09-10): there is no `Intl`
  work — measured, `Intl.NumberFormat("ro")` renders `143.000` where the mockups say `143 000`, and
  `ro-MD` renders the currency as `L`. The separator stays a product constant; **`MDL` becomes a
  message** after all, as `price.amountWithCurrency`, so Gate O2 can rule on what Russian calls it.
  **Shipped 2026-09-10 at `cb66896`**: `ro.json` and `ru.json` both carry
  `price.amountWithCurrency` = *"{amount} MDL"*; the separator did not move.
- **`<html lang="ro">`** (`layout.tsx:22`) — wave 6B-b.
- **Romanian inside comments**, which quote copy deliberately and reach no customer.

## Where collecting the string forced a judgement call

1. **A ninth namespace, `meta`.** `layout.tsx:9-10` carries two customer-visible strings that belong
   to no group `ro.ts` has. Filed under `meta` rather than forced into `configure`.
2. **`configure.step` is left as the literal *"Pasul 2 din 4"*.** Wave 6B-d rules it becomes
   `Pasul {step} din {totalSteps}`; parameterising it here would change what the owner reads at this
   gate for no gain, so it is collected verbatim and the ICU form is recorded here instead.
3. **`rejection.WIDTH_TOO_SMALL` became two keys.** `renderWidthTooSmall` branches on
   `requiredMm === undefined`, and ICU cannot test for an absent argument. The invalid-floor arm is
   `rejection.WIDTH_TOO_SMALL_UNKNOWN_FLOOR`.
4. **`rejection.WIDTH_NOT_SUPPORTED` became three keys plus four fragments.**
   `renderWidthNotSupported` picks between a no-width sentence, a column-scoped one and a
   body-scoped one, and splices in a clause `renderWidthsMadeClause` assembles from a list.
   `_NO_WIDTH`, `_COLUMN`, `_BODY` carry the sentences; `rejection.parts.widthsMadeBetween`,
   `widthsMadeAt` and `widthsMadeList` carry the clause forms.
5. **Two join words are keys with significant surrounding spaces**: `rejection.parts.widthsJoin`
   (`" sau "`) and `rejection.parts.sidesJoin` (`", iar "`). **ICU has no list-join**, and
   `Intl.ListFormat` is not a substitute: its disjunction renders *"A, B sau C"* while this product
   renders *"A sau B sau C"*. The assembly loop therefore stays in code and only the word is a
   message. A translator deleting a space here changes the sentence silently — worth a parity check
   in 6B-a's structural gate.
6. **`rejection.parts.emptySpaceSide` is one key with two nested `select`s**, reproducing
   `EMPTY_SPACE_SIDE_RO` × `EMPTY_SPACE_REFUSAL_RO` exactly. The four reason strings and two side
   strings are not separately addressable as a result.
7. **Millimetre arguments carry `::group-off`.** Without it, `{heightMm}` under `ro` would render a
   2200 mm column as *"2.200"*. Verified byte-identical to today's `String(value)` for every integer
   from −50 to 999999. **The one exception is `rejection.NON_INTEGER_MILLIMETRES`**, whose `valueMm`
   is by contract not an integer: `::group-off` renders `1234.5` as *"1234,5"*, so that argument is
   left bare, which reproduces `String()` exactly.
8. **`#` inside a plural groups at four digits** — 1000 bodies would read *"1.000 de corpuri"* where
   today it reads *"1000 de corpuri"*. Unreachable, arguably better Romanian, and named so the
   golden-output harness's author is not surprised by it.
9. **`globalSettings.tierDelta` stores the literal *"de la"***, losing `ro.ts`'s
   `STARTING_PREFIX.toLowerCase()`. Two literals that must agree; see the near-duplicate note above.
10. **`meta.title` keeps `{brand}` as an argument** and
    **`catalog.kinds.corner_wall_return_top` keeps `{rowWord}`**, rather than baking in *Lemnaria*
    and *rând de sus*. Both compositions exist in the source for a stated reason — one brand
    spelling, one row-word spelling — and flattening them would create the second copy each was
    written to prevent.
11. **The door count gets a real `other` arm**: `catalog.bodyLabelWithDoors` reads
    `one {# ușă} few {# uși} other {# de uși}`, where `catalog.ts:1197` has only `ușă`/`uși`. They
    diverge at 20 doors and above, which `deriveDoorCount` cannot reach. 1 → *1 ușă* and 2 → *2 uși*
    are unchanged.
12. **`panel.bandWords` stays a flat pair of `one`/`many` keys** rather than being folded into
    `countForBody` as a nested plural. It mirrors the shipped shape; folding it is a 6B-f decision,
    and it would be behaviour-free (`count === 1` and CLDR `one` agree on every band word here).
13. **Some codes declare parameters their sentence never uses**, so the message carries no
    placeholder for them: `NOT_IN_LIBRARY` (`buildId`), `NOT_RESIZABLE` (`cause`) and
    `MEASUREMENT_UNUSABLE` (`field`). Eight more take no parameters at all — `VOID_SELECTED`,
    `TARGET_NOT_FOUND`, `INVALID_OCCURRED_AT`, `BODY_PROBE_UNAVAILABLE`, `FINISH_NOT_OFFERED` and the
    three `UNKNOWN_*`. A placeholder-parity gate must not read either group as a defect.
14. **`rejection.NON_INTEGER_MILLIMETRES` and `MEASUREMENT_UNUSABLE` name a `field`** — a developer
    identifier such as `widthMm`, rendered into a customer sentence. Untranslatable by construction,
    and out of scope to change here.

## What was verified

- `apps/web/src/messages/ro.json` parses, and every `ro.ts` identifier is accounted for in it.
- All 200 values parse as ICU MessageFormat, and the plural, `select` and number-skeleton messages
  were rendered under locale `ro` and checked against the templates the shipped functions compose.
  The parser was installed outside the repository; **no dependency was added to this tree.**
- `prettier --check` is clean on this file and on `ro.json`.

Nothing else was run: two other developers hold uncommitted work in this tree, so the suites were
left alone deliberately.

---

## Ruled by the owner, 2026-09-06 — the register

**The product addresses the customer as `tu` (informal, 2nd person singular).** Owner's ruling at
Gate O1, taken against the polite `dumneavoastră` and against a person-free neutral phrasing.

The catalogue was already unanimous — 23 strings informal, none polite — so nothing changed. It is
recorded because a convention that is only implicit in the copy is one a later wave re-decides by
accident, and because **`ru.json` inherits it**: Russian's ты/вы split is the same choice, and the
translation takes **ты**.

**The one deliberate exception is not an exception to this rule.** `webglUnavailable.contactLink`
reads *"Vreau să mă contactați"* — polite plural, because there the **customer is addressing the
company**, not the company addressing the customer. The rule governs one direction only: the product
says `tu` to the customer; the customer says `dumneavoastră` to Lemnaria. Both Russian forms follow
the same split.

**What this rules out**, so it does not have to be re-argued: `alege-ți` and similar reflexive
forms are *not* a politer middle ground — they are still `tu`. There is no third register between
the two; a string that wants to sound more formal without switching person has to be rephrased to
address nobody, which the owner considered and declined.

Wave **6B-j** carries this into the written convention M7 and M8 author against.
