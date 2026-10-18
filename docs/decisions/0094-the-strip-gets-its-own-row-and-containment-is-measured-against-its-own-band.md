# ADR 0094 — The strip gets its own row, and containment is measured against its own band

Status: **Superseded in part, 2026-09-09** — decision 2 (the strip's own desktop row) is withdrawn by
[ADR 0104](0104-the-mockups-are-the-chrome-specification-and-the-strips-own-row-is-withdrawn.md) on
the owner's instruction that the chrome match the design reference; see *Amendment A* at the end of
this record. **Decisions 1 and 3 stand whole** — the classification and ADR 0082's amended predicate
are the most durable things here — and criteria 4a–4h are **re-pointed rather than dropped**.

Originally: Accepted — **amends [ADR 0082](0082-the-settings-strip-wraps-and-nothing-leaves-the-viewport.md)
decision 1** (the amendment is written into that record as *Amendment A*, 2026-09-06, and quoted in
full in decision 3 below). ~~ADR 0082 decisions 2–8 stand unchanged and are **enforced**, not
relaxed.~~ — ADR 0082 decisions 2, 3, 4 and 8 have since been superseded or discharged by that
record's own *Amendment B*.
Date: 2026-09-06
Type: Finding + Decision (adjudication)
Milestone: M6 — **blocks wave 6R's close-out** and opens **wave 6R-b**

## Context

Wave 6R is uncommitted on `main`. All ten `pnpm ci:local` gates are green at that tree. The wave's
visual pass (`testing-reports/6R-visual/README.md`, 2026-09-06, real Chromium through Playwright
1.62.1) measured a state none of the ten gates can see.

**Desktop, 900 × 900, on a design carrying ADR 0065's overflow flag, at the shipped two chips — no
chip-count simulation involved:**

| thing | measured | what ADR 0082 requires |
| --- | --- | --- |
| `.settingsRow` band | x 183.39, **w 78.98** | wide enough for a chip |
| `global-settings-chips` box | **w 0.00** | the width the trigger leaves |
| each chip's rendered width | **28.00 px** | 166.27 and 142.66 px |
| chip 0 / chip 1 `scrollWidth − clientWidth` | **138 px** / **115 px** cut | 0 and 0 |
| the chips' x-range | 155.39 – 183.39 — **left of their own band**, inside the nav's column | inside the settings band |
| trigger box | x 193.39, w 108.05, right **301.44** — **39.06 px past** its 262.37 band edge | inside its band |
| trigger ∩ price band | **39.06 × 44.00 px** | none |
| trigger ∩ `price-bar-total` | **21.06 × 21.00 px** | none |
| `elementFromPoint` at the total's left edge | **`global-settings-trigger`** | `price-bar-total` |

The customer sees two clipped pills reading **"M…"** and **"Fe…"** standing over *"Pasul 2 din 4"*,
and *"Setări globale"* running into *"95 000 MDL"*. Captures: `B-flagged-900x900-topbar.png`,
`B-flagged-900x900-2chips.png`.

**Range.** On a flagged design the chips are cut at **every desktop width below 1150** — 138/115 px
cut at 900–980, 109/86 at 1020, 69/46 at 1060, 29/6 at 1100, 4/0 at 1125, clean from 1150. The
trigger's overlap of the price band exists at **900–939** (39.06 px at 900, 29.06 at 910, 14.06 at
925, zero at 950). **Nothing truncates on an unflagged design at any width**, and none of it
reproduces at 390 × 844.

**Mechanism, and it is the part that decides this record.** The wave re-sized the desktop top bar to
`grid-template-columns: auto minmax(0, 1fr) auto` — nav `auto`, settings flexible, price `auto`. Both
`auto` tracks are content-driven and both are satisfied before the flexible one, so **the settings
track is the arithmetic residue of two contents it does not control**. A flagged bar carries ADR
0065's extra sentence at `max-width: 320px` beside the figure, the price column's demand rises to
637.63, and the residue is 78.98. `.chips` (`flex: 1; min-width: 0`) then computes to **0**;
`.chip`'s `max-width: 100%` clamps each label to 28 px; the desktop `justify-content: flex-end` lays
the overflow out **leftwards** out of a zero-width box, which is why the chips paint inside the nav's
column; and `.trigger` (`flex: 0 0 auto`, 108.05 px) cannot shrink, so it overflows the band to the
right and lands on the price bar.

**The requirement the residue has to clear, stated as a number so it can be seen to be the wrong kind
of number.** For no chip to be cut, the settings track needs *widest chip + gap + trigger + padding*
= 166.27 + 10 + 108.05 + 24 ≈ **308 px** with the shipped price book. So decision 1 holds on desktop
only while

> nav's content + price's content ≤ viewport − (widest chip label + the trigger)

— an inequality between three independently-authored strings, one of which (**the tier name in a
chip**) is data authored outside TypeScript per [ADR 0062](0062-a-manufacturer-price-dashboard-comes-after-m8-and-shapes-seams-now.md)
seam 1, and another of which (**ADR 0065's warning sentence**) is owner-ruled copy. That is precisely
the *"a width that happens to fit today's labels"* ADR 0082 decision 1 refuses, rebuilt one level up.

**What holds and what breaks.**

- ADR 0082 **decision 1 as literally written still holds**: `scrollWidth` equals `clientWidth`
  (900 = 900) and every chip and the trigger has its bounding box inside the viewport.
- **Decision 5's *"the strip overlays neither"* is broken outright** — measured overlap of the price
  band and interception of `price-bar-total`.
- **Decision 3 is broken as ruled.** Each chip is formally "alone on its line", so the ellipsis is
  formally the one permitted case — but the line is 0 px, and the result is exactly the *"row of
  stubs each ending in an ellipsis [that] tells the customer nothing"* the decision refuses, at the
  shipped chip count.
- **Wave 6K-b3's failure does not fully recur**: `price-breakdown-trigger` stays hit-testable and
  still opens the breakdown at every count and width tested.
- **No gate sees it.** `apps/web/tests/e2e/settings-strip-containment.desktop.e2e.spec.ts` measures
  truncation on the **seeded (unflagged)** design only, and ADR 0082's flagged-design requirement is
  written about *vertical* growth alone.

**Inherited or traded.** Re-applying HEAD's declarations as a browser style override on the same
flagged page at 900 gives readable chips (166.27 / 142.66, nothing cut) with the nav squeezed to
x = 0 — the failure the wave's own comment describes and was changing the track sizing to avoid. That
comparison is **an override, not a checkout**, and this record does not rest on it: what the wave
fails is *its own* stated acceptance criterion, and that is true whether the state is new or
exchanged. A confirmation against a real pre-wave tree is **not** requested; it would change no
clause here.

## Decision

### 1. Classification: an implementation defect against ADR 0082 decision 5, compounded by a contract gap in decision 1 and a test-fidelity gap in the desktop spec. All three, and the order matters.

**It is first an implementation defect.** Decision 5 says in words that the strip *"overlays neither"*
the stage nor the price bar, and a strip control overlays the price bar by 39.06 × 44.00 px and takes
21 px of the total's own box out of the hit test. Nothing has to be re-read for that to be a
violation; it is a written clause failing against a measurement, on the **shipped** two chips, on a
design the product can reach today. The wave's own added acceptance criterion — *"at five chips the
price bar is fully visible, the canvas keeps a positive height, and the strip overlays neither.
Measured on a flagged design too"* — is the one that fails, and it fails at two.

**It is also a genuine contract gap, and the gap is decision 1's predicate.** `scrollWidth ==
clientWidth` plus "every box inside the viewport" is satisfied by two 28 px stubs painted over the
step nav. A containment predicate that a clipped pill passes is not measuring containment; it is
measuring the document's scroll width, which is a *consequence* of containment and not the thing.
This project amends such a predicate rather than re-reading it silently — decision 3 below.

**It is thirdly a test-fidelity problem, and that is why ten green gates mean nothing here.** The
desktop containment spec drives `/configurator/configure`, which is never flagged, so the assertion
that would have failed was never evaluated against the input that fails it. The flagged design was
already reachable in the suite — `overflow-mark.e2e.spec.ts` mints one, narrows `room.widthMm` to the
domain's own `NARROWED_ROOM_OVERFLOWING_DESIGN` width, and deletes the row afterwards — so this is a
missing input, not a missing capability.

**Not a defect in the visual pass, and not an over-reach by it.** The pass measured a shipped state at
a supported width on a reachable document, and named exactly which clauses hold and which break. That
is the pass working.

### 2. ~~The fix: on the desktop shell the settings strip gets **its own full-width grid row**. The top bar keeps the nav and the price.~~ **Withdrawn 2026-09-09 — see *Amendment A*.**

> **Superseded by [ADR 0104](0104-the-mockups-are-the-chrome-specification-and-the-strips-own-row-is-withdrawn.md)
> decision 2, on the owner's instruction of 2026-09-09.** This clause departs from frame D2E
> deliberately and says so below — *"the strip on its own row is a visible departure from it at
> desktop"*. The owner has since ruled that the chrome matches the frames, and the departure is what
> they rejected. The whole-kitchen settings become **one pill in the top bar**, on both shells, as
> frames D2A, D2E, 2A and 2E draw them, and the band, its grid area, the chips row and the separate
> text trigger are removed.
>
> **The mechanism analysis below is not withdrawn and should still be read.** *"A row is an invariant;
> a residue is an inequality"* is why ADR 0104 gives the pill its own grid item with its own track
> rather than letting it be what is left over between the nav and the price. The clause that is wrong
> is the one that put the row *below* the bar; the reasoning that produced it is what keeps the
> replacement honest.

Retained for the record:

The strip's box stops being a residue and becomes a row: its width is the viewport's, at every width
in the `min-width: 900px` branch, on flagged and unflagged designs alike, whatever the price bar's
sentence and whatever the book's tier names. The chips then wrap inside it exactly as they already do
on mobile — which is the mechanism ADR 0082 decision 2 chose and the currency the owner authorised:

> *"Even if you need to just increase the height and take from the vertical height, I'm totally okay
> with this."*

The shape, stated so the implementer needs no second author (details of padding and rules are theirs):

- `.screen`'s desktop areas become three rows — `"header price"` / `"settings settings"` /
  `"stage stage"` — with `grid-template-rows: auto auto minmax(0, 1fr)` so the stage stays the only
  flexible row and **decision 5's "vertical growth is absorbed by the stage" is preserved
  structurally**, not re-argued.
- The top bar's two columns leave the price `auto` and the nav flexible. The residue does not vanish;
  it is **confined to two contents the code owns** — the step nav's own copy and the price bar's — and
  no longer bounded by a book-authored tier name. That is the honest claim, and criterion 4e below
  asserts the nav is not clipped at 900 on a flagged design so the confinement is measured rather than
  assumed.
- `.settingsRow`'s desktop overrides (`padding: 0 24px 0 0`, `border-bottom: none`,
  `align-items: center`) were written for a cell in the top bar and are re-decided for a band. The
  band regains a left inset and its own bottom rule; whether the chips cluster left, or right beside
  the trigger as frame D2E draws them, is **paint** and is §10.1's permitted layout fork — criterion
  4b binds it either way.
- **`justify-content: flex-end` on the desktop `.chips` is not itself the defect but it is what made
  the defect paint over the nav**, by laying a zero-width box's overflow leftwards. Whatever
  alignment is kept, criterion 4b is what holds it.

**Why the mockup does not decide this.** Frame D2E draws the two pills inside the top bar, and the
strip on its own row is a visible departure from it at desktop. ADR 0082 decision 6 already ruled that
containment *"is not one of §10.1's permitted layout forks"* and that the desktop shell *"does not get
a different answer to 'may a control leave the screen'"*. A frame is not authority for a control
standing on the price total.

**What this costs, stated rather than discovered later.** The desktop canvas loses the strip's row —
about 44 px at every desktop width, including the widths where nothing was wrong. That is the owner's
own currency and it is spent knowingly. It also moves the desktop canvas's top edge, and
`apps/web/tests/e2e/editor-rail.desktop.e2e.spec.ts` addresses the scene in **page** pixels against a
canvas that *"starts 55 px down"*, with patches at y 520 / h 180 and y 560 / h 280. Those constants
are **re-measured, not nudged** — criterion 4f.

### 3. ADR 0082 decision 1 is amended, and the amendment is written into that record

Decision 1 stays in force and gains a second half. The amendment text is entered in ADR 0082 as
*Amendment A — 2026-09-06*, and is this:

> **Containment is measured against three boxes, not one.** At every supported viewport, and at every
> chip count, and with any label the price book can author:
>
> 1. `document.documentElement.scrollWidth` equals `clientWidth`, and every chip and the trigger has
>    its bounding box fully inside the viewport — **as originally written, unchanged**;
> 2. every chip and the trigger has its bounding box fully inside **`.settingsRow`'s own box**, on all
>    four edges. A control inside the viewport but outside its own band is standing on a surface that
>    belongs to something else, and the original predicate could not tell the two apart;
> 3. **no chip is clipped by the box it stands in**: each chip's `scrollWidth − clientWidth` is 0
>    unless its own label is longer than a full line of the strip, which is decision 3's single
>    permitted case. A line narrower than one chip is not that case.
>
> **And the surface this is measured on is named, because that is what made the gap invisible.** Every
> one of the three holds on a design carrying ADR 0065's overflow flag as well as on the seeded one.
> A flagged design gives the price bar an extra sentence and therefore a different width demand; a
> containment assertion evaluated only on the unflagged design is evaluated on the easy input.
>
> **Why the first predicate was not enough, recorded rather than left to be re-derived.** On
> 2026-09-06 a state satisfied it exactly — `scrollWidth` 900 against `clientWidth` 900, every box
> inside the viewport — while two chips rendered 28 px wide with 138 and 115 px of label cut, painted
> inside the step nav's column, and the settings trigger stood 39 px over the price bar and
> intercepted 21 px of the total. The predicate was true and the strip was not contained. See
> [ADR 0094](0094-the-strip-gets-its-own-row-and-containment-is-measured-against-its-own-band.md).

Decisions 2–8 are **not** amended. Decision 3 in particular is not softened: this record reads *"a
chip is never narrowed below the width of the line it is alone on"* as also forbidding a line
narrower than a chip, and predicate 3 above is that reading made assertable.

### 4. The acceptance criteria wave 6R-b must meet

> **Re-pointed 2026-09-09, not dropped — *Amendment A*.** 6R-b shipped and met these. The layout they
> were written against is withdrawn, so each is restated against the pill in
> [`docs/milestones/done/chrome-parity-with-the-design-reference.md`](../milestones/done/chrome-parity-with-the-design-reference.md)'s
> *Tests* section. **No criterion here is deleted to make a layout pass**; where one loses its
> subject, the plan names what replaces it. Criterion **4i** is the one this record and ADR 0104
> disagree about, and ADR 0104 decision 9 answers it rather than waiving it.

Falsifiable, and each names the surface it is measured on.

**a. No chip is clipped on a flagged design, at every desktop width in the branch.** On a design
carrying ADR 0065's flag, at **900, 1000, 1100 and 1440** px wide and at **2, 3, 4 and 5** chips,
every chip's `scrollWidth − clientWidth` is **0**. The four widths are not decoration: 900 is the
branch's own first pixel, and 1000 and 1100 are inside the 900–1150 window where the defect was
measured, so a fix that merely moves the threshold fails here instead of passing quietly.

**b. Every chip and the trigger is inside `.settingsRow`'s own box, on all four edges.** Measured on
the flagged and the seeded design, at the same widths and counts, and at 390 × 844. This is the
assertion the defect would have failed at chip x 155.39 against a band starting at 183.39, and it is
the one no existing spec makes.

**c. No strip control intersects the price bar, and the price total keeps its own hit test.** The
union of `global-settings-trigger`'s and every chip's box with `price-bar`'s box is **empty**, and
`document.elementFromPoint` at `price-bar-total`'s left edge, its centre and its right edge returns
`price-bar-total` or a descendant — never a strip control. Flagged design, **900** px first, because
that is where the interception was measured. `price-breakdown-trigger` stays reachable and still
opens the breakdown, as it does today.

**d. Vertical growth is still absorbed by the stage and by nothing else.** On the flagged design at
900 and 1440, at 2 and at 5 chips: the price bar's height is unchanged, its box is fully inside the
viewport, and the canvas keeps a **positive** height. The strip's row and ADR 0065's wrapped warning
are measured together, not assumed independent — the requirement ADR 0082 already carries and which
this fix must not lose while moving the row.

**e. The nav is not clipped by the fix.** On the flagged design at 900, the step nav's own text is not
truncated (`scrollWidth − clientWidth` is 0 on the header's text nodes) and its box starts at x ≥ 0.
This is the criterion that keeps decision 2's "the residue is confined" a measurement rather than a
claim — the pre-wave arrangement's failure was exactly a nav squeezed to zero.

**f. The desktop page-pixel constants are re-measured, and their specs stay green.**
`editor-rail.desktop.e2e.spec.ts`'s patches and any other desktop constant expressed in page
coordinates are re-derived against the new canvas origin **by measuring the running app**, and the
comment naming the 55 px offset is corrected to what is measured. A patch nudged until a count passes
is the failure ADR 0028 exists for.

**g. The unflagged desktop results do not regress.** Everything the visual pass records as PASS on the
seeded design — B1, B2, B3, B4, B5, B6, B7 — still passes, at 390, 900 and 1440.

**h. The gate that missed this is extended, not replaced.**
`apps/web/tests/e2e/settings-strip-containment.desktop.e2e.spec.ts` gains the flagged design as a
second surface, minted and deleted the way `overflow-mark.e2e.spec.ts` already mints and deletes one
(ADR 0006), and gains criteria a, b and c. Its existing seeded cases stay. The mobile sibling gains
criterion b at 390 × 844.

**i. No numeric width threshold is introduced.** No `@media` breakpoint chosen from the measured 1150,
no `min-width` in pixels on the chips box or on a chip. The floor stays "the line", per ADR 0082
decision 3's *"no numeric minimum width is declared, deliberately"*.

### 5. This blocks wave 6R's close-out, and the fix lands as wave 6R-b in the same tree

The failing criterion is 6R's own, the failure is on the shipped chip count on a reachable document,
and its shape — a strip control painted over the price bar and taking a pointer that belongs to it —
is the shape of the failure wave 6K-b3 reverted a chip for and that ADR 0082 was written to make
impossible. A wave does not close with that state in it.

**It is not deferrable to a later wave, and the reason is structural rather than procedural.** The two
stylesheets in 6R's diff also fix the mobile leak ADR 0082 closes — the trigger's right edge at 412 on
a 390 px screen. Reverting them to ship 6R's Part A restores a worse defect; keeping them ships this
one. **There is no state of this tree in which the strip work is absent**, so it is finished rather
than postponed.

**Where it is recorded and who owns it.** A new sub-wave **6R-b** in
`docs/milestones/done/M6-price-and-global-settings.md`, immediately after 6R's scope addition, carrying
criteria 4a–4i verbatim. `docs/BACKLOG.md` entries 32 and 33 stay as ADR 0082 left them — 33 is
**met** (the trigger measures 101.48 × 44.00 and 108.05 × 44.00, against its 93.5 × 13) and 32 is
discharged by ADR 0082 as a *decision*; what is unmet is the wave's criteria, and the wave plan is
where unmet criteria live. The owner of 6R-b is the same implementer role that owns 6R; nothing here
is an owner question.

**Part A is not re-verified from scratch.** The three control shapes, the six decors, the adapter
table and the 3D repaints all passed and none of them is touched by a grid row. 6R-b's visual pass
re-measures Part B and criterion 4f's patches only.

## What this does not decide

- **It does not move ADR 0065's warning.** Taking the sentence out of the top bar would also relieve
  the price column, and it was considered (below) and refused as scope: where the flag sits is that
  record's ruling and a product question, not a containment fix.
- **It does not decide whether cabinet depth gets a chip.** ADR 0082 left that open and it stays open;
  this record only makes the strip's width independent of how the answer goes.
- **It does not rule on the mobile shell's layout.** 390 × 844 passes every measurement, including on
  a flagged design at five chips, and nothing here changes it. The strip already has its own row
  there — which is, read backwards, the reason it passes.
- **It does not rule on the credential leak the visual pass noticed** (`neon()`'s error printing a
  malformed `DATABASE_URL` in full). Unrelated to 6R, and it needs its own record.

## Alternatives considered

- **A width threshold near the measured 1150 — a `@media` query that gives the strip its own row
  below it and keeps frame D2E above.** Rejected, and it is the closest-looking answer. 1150 is not a
  property of the layout: it is the width at which *this* warning sentence at `max-width: 320px`,
  *this* step-nav copy and *these two* book-authored tier names stop summing past the viewport. A
  longer tier name, a re-worded warning, a translation, or a third chip moves it, and nothing in the
  codebase would fail when it did. It is the same magic number ADR 0082 decision 3 refused as a
  `min-width`, spent one level up. **Criterion 4i forbids it explicitly** so it cannot come back as an
  implementation convenience.
- **Let the top bar itself wrap (`flex-wrap` on a flex top bar), so the strip drops to its own line
  only when it must.** Rejected **on mechanism, not on taste**: flex wrapping is decided by an item's
  hypothetical main size, and the strip's own min-content is small precisely because its chips wrap
  inside it. It would sit on line 1 and squeeze exactly as it does now, unless given a `flex-basis` or
  `min-width` literal — which is the previous alternative wearing a different hat.
- **Relieve the price column instead: shrink the warning's `max-width: 320px`, or stack it under the
  figure so the column demands `max(figure, warning)` rather than their sum.** Rejected. It buys
  width — enough for two chips at 900 today — and buys nothing at five chips, where the residue is
  still short of the ≈308 px a single chip plus the trigger needs. More decisively it leaves the
  strip's width a function of the price bar's copy, which is the defect's actual shape; it fixes
  today's numbers, and *"a width that happens to fit today's labels"* is what decision 1 exists to
  refuse.
- **Move ADR 0065's warning out of the top bar on desktop.** Rejected as scope, and it is the one
  refusal that is close. It would relieve the column properly rather than partially, but it is a
  change to where an owner-ruled flag lives on the screen, it touches ADR 0065 decision 8's
  separation from §9's rejection banner, and it still leaves the settings width a residue of whatever
  remains in the price column. A containment defect does not license a product move.
- **Make the row conditional on the flag itself — `.screen[data-price-flagged="true"]` gets the
  settings row.** Rejected on ADR 0082 decision 4's own reasoning: *"a control that moves down the
  screen as an unrelated setting is added is a control a customer has to hunt for"*. Under this the
  settings trigger would jump a row the moment a body overflowed a wall, which is exactly an
  unrelated setting moving it. It also leaves the unflagged case a residue.
- **Give the chips box a `min-width` and let the price column take the overflow.** Rejected twice
  over: decision 3 forbids the literal, and the overflow would land on the price total, which is the
  measured defect with the roles swapped.
- **Revert the two stylesheets and let 6R ship its Part A.** Rejected — decision 5. It restores the
  trigger leaving a 390 px screen, which is worse and is the defect ADR 0082 was written for.
- **Ship it and record the defect.** Rejected. The overlap intercepts the price total's own hit test
  on a document any customer with an overflowing kitchen sees, at a window width people use; and the
  wave's own criterion names it. A recorded exception here is 6K-b3's inheritance repeated with a
  note attached.

## Records swept before deciding, and how each is settled

| Record | What it says | Settled how |
| --- | --- | --- |
| [ADR 0082](0082-the-settings-strip-wraps-and-nothing-leaves-the-viewport.md) decision 1 | Containment is `scrollWidth == clientWidth` plus every box inside the viewport. | **Amended, explicitly and in place** — decision 3 and *Amendment A* there. The predicate gains the band and the clip, and names the flagged surface. |
| ADR 0082 decisions 2, 3, 4, 5, 6, 7, 8 | Wrap not scroll; the floor is the line; the trigger is pinned; growth is absorbed by the stage; one rule for both shells; the false comment is corrected; the 44 px target. | **All enforced unchanged.** Decision 2's currency is what pays for the new row; 5 is what the fix restores; 8 is **met and stays met** (criterion 4g). |
| ADR 0082's owner ruling of 2026-09-05 | *"showing everything, not going off the screen, even if we shrink… increase the height and take from the vertical height."* | **Applied literally, and it is what selects the fix.** The row is height taken from the stage so that everything stays readable. Not re-opened. |
| [ADR 0065](0065-a-body-past-the-end-of-its-wall-is-marked-not-moved.md) decisions 6–8 | The flagged total's warning, its surface, and its separation from §9's banner. | **Untouched.** The warning keeps its place and its wording; the strip moves instead. Named in the alternatives so the refusal is on the record. |
| [ADR 0062](0062-a-manufacturer-price-dashboard-comes-after-m8-and-shapes-seams-now.md) seam 1 | The price book is data authored outside TypeScript. | **Why a residual track cannot be the containment.** A tier name that breaks the layout is a book edit, not a code change — the same reasoning ADR 0082 used for chip count, applied to track sizing. |
| [ADR 0023](0023-touch-compatibility-clicks-reach-the-sheet.md); wave 6K-b3's revert | A pointer reaching two surfaces at once; 44 of 58 e2e specs down to an overflowing chips subtree at `z-index: 7`. | **The precedent for the severity, and the reason this blocks.** The interception here is partial — `price-bar-total` only — and is refused for the same reason the full one was. |
| M6 acceptance criteria — *"the price bar never covers the selected cabinet at either viewport… a hard constraint"* | The bar is a flow sibling, never an overlay. | **Preserved and mirrored.** Criterion 4c is its inverse: nothing on the strip covers the bar either. |
| `DEVELOPMENT-SPEC.md` §10.1 | One implementation; the only permitted fork is layout, in CSS. | **Obeyed.** The fork is a grid row in a media query, and containment is common to both shells — which is what it already was on mobile. |
| Frame D2E | Two pills and a text control in the top bar. | **Departed from on desktop, deliberately and narrowly**, on ADR 0082 decision 6's ruling that a frame does not answer *"may a control leave the screen"*. The pill styling stays. |
| `docs/BACKLOG.md` entries 32, 33 | The containment leak; the 93.5 × 13 px trigger. | **33 is met and measured** (101.48 × 44.00, 108.05 × 44.00). 32's decision stands; its *implementation* is what 6R-b finishes. |
| Wave 6S's scope addition | `overflow-warning-viewport.test.ts` and the band's own geometry. | **Not reached.** The band is an overlay on the canvas taking no flow height; this record moves a flow row above it. Criterion 4d measures the two together anyway. |

Nothing found in the sweep contradicts this record. One record is amended — ADR 0082 decision 1 — and
the amendment is written into that record rather than left to be inferred from this one.

## Consequences

- **Wave 6R does not close; wave 6R-b is added to `docs/milestones/done/M6-price-and-global-settings.md`**
  with criteria 4a–4i. 6R's Part A stands verified and is not re-run.
- **The desktop canvas is about 44 px shorter at every width.** Paid in the owner's declared currency,
  and the price bar and the stage both keep their structural guarantees.
- **Two desktop e2e specs change**: the containment spec gains a flagged surface and two assertions;
  `editor-rail.desktop.e2e.spec.ts`'s page-pixel constants are re-measured against the new canvas
  origin.
- **The next reader of ADR 0082 meets the predicate that failed, and why.** Amendment A carries the
  measurement, not a tightened sentence — which is decision 7's own principle applied to the record
  rather than to a CSS comment.
- **A gate green over a failing state is now a named class in this project.** The desktop containment
  spec was green because it evaluated a true assertion on the input that could not falsify it. That
  is worth more than the CSS: criterion 4h fixes the instrument, and criterion 4a is written so that
  moving the threshold fails it.


---

## Amendment A — 2026-09-09: the strip's own row is withdrawn, and the settings become one pill in the top bar

**Raised by the owner**, reviewing the shipped configure screen against the mockups they authored:
*"I wanted to be same as in reference, SAME, because this is the design I made and approve."*
Adjudicated in
[ADR 0104](0104-the-mockups-are-the-chrome-specification-and-the-strips-own-row-is-withdrawn.md).

### What is withdrawn

**Decision 2 only.** The desktop settings strip does not get a full-width row of its own; there is no
strip. Frames **D2A** and **2A** draw the whole-kitchen settings as a single pill inside the top bar —
`flex:0 1 auto; min-width:0; max-width:460px; height:40px` on desktop, `max-width:150px` with a `+2`
counter on mobile — and that pill is also the control that opens the settings surface, which is how
frames **D2E** and **2E** draw it open.

This record foresaw the objection and answered it under *"Why the mockup does not decide this"*:
*"A frame is not authority for a control standing on the price total."* That remains true, and ADR
0104 keeps it — its decision 8 names a degradation order for narrow desktop precisely so that D2A's
row is never simply drawn at 900 px and hoped for. What has changed is the owner's instruction: the
frame is now authority for **what the chrome is**, and a containment problem inside it is solved
inside it.

### What stands, and it is most of this record

- **Decision 1's classification stands whole.** An implementation defect, compounded by a contract gap
  and a test-fidelity gap; and *"a gate green over a failing state is now a named class in this
  project"* is the sentence from this record with the longest life.
- **Decision 3 stands whole.** ADR 0082 decision 1's three-box predicate — viewport, own band, no clip
  — is the gate on the replacement, evaluated on a flagged design as well as a seeded one. It is not
  relaxed by a line.
- **Criteria 4a–4h are re-pointed, not deleted.** The plan's *Tests* section names, for each, whether
  it survives verbatim, is re-pointed at the pill, or loses its subject and what replaces it.
- **Criterion 4f's rule stands and is applied again.** Every desktop page-pixel constant is
  **re-measured against the running app**, never nudged — and this wave moves the canvas origin twice
  as far as 6R-b did, in the other direction.

### Criterion 4i is met as written, not waived

4i forbids a numeric width threshold, and its stated reason is the load-bearing one: *"A longer tier
name, a re-worded warning, a translation, or a third chip moves it, and nothing in the codebase would
fail when it did."*

**ADR 0104 introduces no threshold at all.** An earlier draft of it introduced one and defended it;
the owner's ruling of 2026-09-09 removed the need, and the defence with it. The settings pill fits as
many whole labels as the **measured** available width holds and counts the rest after a `+`, so a
longer tier name moves no number — it is simply a label that stops fitting, and the count says so.
ADR 0104 decision 9 re-affirms both of the numeric refusals that matter here: no `min-width` in
pixels on the pill, a label or the counter (ADR 0082 decision 3's own clause, kept whole), and no
breakpoint chosen from a measurement.

This is the outcome 4i was written to protect, reached by a different route than this record
imagined: not a row that removes the residue, but an item in the residue that has a **total function
of width** — a complete, reference-declared drawing at every width down to its floor. *"A row is an
invariant; a residue is an inequality"* is still the right diagnosis of the chips row, which had no
such function and clipped below its content width.

### What it returns

About 45 px of desktop canvas at every width — the cost this record accepted knowingly under
*"What this costs, stated rather than discovered later"* — and, on mobile, the whole strip band. The
plan is
[`docs/milestones/done/chrome-parity-with-the-design-reference.md`](../milestones/done/chrome-parity-with-the-design-reference.md).
