# ADR 0104 — The mockups are the chrome specification, and the settings strip's own row is withdrawn

> **Dated note, 2026-10-17:** Amendment F (at the end) records the owner's departure from frames 1E and D1E (a card with
> Preview only, a carousel pop-up). Nothing above is struck.

Status: Accepted — **supersedes [ADR 0094](0094-the-strip-gets-its-own-row-and-containment-is-measured-against-its-own-band.md)
decision 2 and amends [ADR 0082](0082-the-settings-strip-wraps-and-nothing-leaves-the-viewport.md)
decisions 2, 3, 4 and 8.** ADR 0082 decisions 1 (as amended), 5, 6 and 7 stand and are **enforced**.
**Amendment A (2026-09-10)** records two owner rulings taken against frame D2A itself.
**Amendment B (2026-09-29)** records the owner's final answer to Q-7L-1 — D1B's heading, on-site
note and plan hint are not drawn — and how a desktop frame's text is read against decisions 1 and 7.
**Amendment C (2026-09-29)** records the owner's Q-U4 ruling (M7B): the corner-direction toggle is
hidden for a U, departing from frame 1B's note *"Toggle-ul apare doar pentru L și U"*.
**Amendment D (2026-10-01)** records the owner's Q1 ruling (M7C): the back-to-room link is drawn on
desktop, and both back links confirm before leaving; decision 8's widths carry a dated note.
Date: 2026-09-09 (decisions 3, 8 and 9 rewritten the same day on the owner's second and third rulings)
Type: Decision (owner ruling) + adjudication
Milestone: M6 — opens the wave planned in
[`docs/milestones/chrome-parity-with-the-design-reference.md`](../milestones/chrome-parity-with-the-design-reference.md)

## Context

The owner reviewed the shipped configure screen against the mockups they authored, on both shells,
and rejected it. Their words, verbatim:

> *"I wanted to be same as in reference, SAME, because this is the design I made and approve."*

and, shown the mobile shell:

> *"on mobile same shit, you done what you wanted not what is in reference"*

This is not new authority. [ADR 0003](0003-design-reference-supersession.md) already records the
mockups as reference artefacts — *"`Lemnaria Configurator Desktop.dc.html` — desktop chrome for
screens 1 and 2 only (D1A–D2F)"* — and records the owner's own calibration rule for the phase:
*"the immediate goal being **a working POC that matches the design reference**"* (§7). What this
record adds is that **the frames are read as a specification and not as inspiration**: where a frame
declares a number, that number is the target; where the shipped stylesheet disagrees, the frame wins
and the shipped rule is withdrawn by name.

### What the frames declare, and what ships

**Desktop, frame D2A** (`docs/design/mockups/Lemnaria Configurator Desktop.dc.html:544–571`) is
**one band and then the scene**. The band is `height:76px; flex:0 0 76px; padding:0 28px 0 40px;
display:flex; align-items:center; gap:28px; border-bottom:1px solid #e4dfd5`. It carries, in order:
the wordmark; the `2/4` pill; `Configurare`; then `margin-left:auto` and a `gap:14px` group of — a
**single settings pill** (`flex:0 1 auto; min-width:0; max-width:460px; height:40px`, holding a
swatch, `PAL melaminat` with `min-width:0; overflow:hidden; text-overflow:ellipsis`, a 1 px divider,
`Feronerie Hettich`, a divider, `Adâncime 600`, and a `▾`), a 28 px divider, the price column
(`de la {{ priceTotal }} MDL` at `700 21px` over an underlined *Ce se include în acest preț?* and a
caret), a divider, **`Verifică designul`** (`height:48px; padding:0 24px; border-radius:12px;
background:#7c5c3d; font:700 15px/1; color:#faf8f4; flex:0 0 auto`), a divider, and the `RO ▾` chip.
The same band is drawn in D2B, D2C, D2D, D2E and D2F. **There is no second band anywhere in the
desktop file.**

The shipped screen draws that band without the settings pill and without the CTA, and then a
**separate full-width settings strip row** beneath it — ADR 0094 decision 2 — costing the desktop
canvas about 45 px at every width.

**Mobile, frame 2A** (`docs/design/mockups/Lemnaria Configurator Mobil.dc.html:482–495`) is one
header row, `padding:11px 14px; display:flex; align-items:center; gap:9px; border-bottom:1px solid
#e4dfd5`: a bare `‹` (`700 17px/1; width:22px; text-align:center`), the `2/4` pill, `Configurare`
(`flex:1; min-width:0`, ellipsis), **one settings chip** (`flex:0 1 auto; min-width:0;
max-width:150px; padding:7px 9px; border-radius:9px`, holding a swatch, `PAL melaminat` ellipsising,
and **`+2`**), and the `RO ▾` chip. The same row is drawn in 2B, 2D and 2E.

The shipped screen draws every whole-kitchen setting as its own chip in a wrapping chips row, in a
band of its own under the header, with a separate *Setări globale* text trigger beside them.

### The finding that decides this record

**`+2` is the reference's own answer to a settings summary that does not fit, and it was never
implemented.** Frame 2A does not wrap, does not scroll and does not shrink: it names one setting and
counts the rest. Instead the project shipped a strip that overflowed a 390 px screen, and then spent
[ADR 0082](0082-the-settings-strip-wraps-and-nothing-leaves-the-viewport.md), its Amendment A,
[ADR 0094](0094-the-strip-gets-its-own-row-and-containment-is-measured-against-its-own-band.md), two
waves (6R, 6R-b) and a dedicated e2e specification pair containing it. Every one of those records is
sound reasoning about a layout the design never asked for. The containment problem was self-inflicted
by a departure from the frame, and the departure — not the containment rule — is what is withdrawn
here.

**ADR 0082's owner ruling of 2026-09-05 was given about that self-inflicted problem.** Its words —
*"I will go with showing everything, not going off the screen, even if we shrink… Even if you need to
just increase the height and take from the vertical height, I'm totally okay with this"* — were the
owner's answer to *"how should a chips row that does not fit 390 px behave"*. The owner's instruction
of 2026-09-09 is later, is about the same surface, and is about whether that row should exist at all.
A later ruling on a wider question supersedes an earlier ruling on a narrower one; that supersession
is recorded here rather than assumed.

## Decision

### 1. The mockups are the specification for screen 2's chrome, on both shells

For the configure screen's chrome — the top bar on both shells, the mobile bottom bar, and the
controls in them — frames **D2A–D2F** and **2A–2F** are read as a specification. Every number they
declare (flex rules, `min-width`, `max-width`, heights, paddings, gaps, radii, font shorthands,
`text-overflow`) is the target value. Where a shipped rule disagrees with a frame, **the frame wins
and the shipped rule is named and withdrawn**, not quietly reconciled.

This does not extend the frames' authority beyond chrome. Domain rules, geometry and pricing are
unaffected; `DEVELOPMENT-SPEC.md` remains the behavioural contract, and ADR 0003 §5's parity rules
still hold.

**A frame is silent about behaviour it does not draw.** Where the product has since acquired
something the frame has no slot for — ADR 0065's flagged-total sentence, ADR 0099's global colour —
the frame does not delete it. Those cases are named in decision 6 and in the plan's open questions;
none of them may be resolved by inventing a number or by adding a band.

### 2. The settings strip's own row is withdrawn on both shells, and the settings become one control in the top bar

ADR 0094 decision 2 — *"on the desktop shell the settings strip gets its own full-width grid row"* —
is **superseded**. The band, its grid area, the chips row and the separate *Setări globale* text
trigger are removed from both shells.

In their place, and on both shells, the whole-kitchen settings are **one control standing in the top
bar**, and that control is also the trigger that opens the settings surface — which is how frames
D2E and 2E draw it. D2E's open state is the same pill with `background:#ece7dd; border:1px solid
#7c5c3d` and its caret flipped `▾` → `⌃`, with the popover `position:absolute; top:calc(100% + 33px);
right:0; width:900px` hanging from it. Frame 2E's open state leaves the chip unchanged and opens the
full sheet.

- **Desktop** draws D2A's pill: swatch, the material name (the only ellipsising segment), and the
  remaining settings as full-width `white-space:nowrap` segments separated by 1 px dividers, with a
  caret.
- **Mobile** draws 2A's chip: swatch, the material name (ellipsising), and **`+N`**, where `N` is the
  number of settings the pill would otherwise name, less the one it names.

### 3. The pill fits as many whole setting labels as the space holds, separates them as D2A does, and counts the rest after a `+`

**Ruled by the owner, 2026-09-09**, in three statements. First, that the narrow desktop already has
its answer in the design:

> *"when its narrower you have the soltion in mobile version you just combine like `MDF, Blum + 1`
> for example"*

Then, how the fit is decided:

> *"keep labels full width, need just ot calculate the remaining space and decide, how many global
> setting fit tyo be show and display with separation like in dektop header, and if one or multiple
> not fit, count those that not fit and add that count after `+`"*

And finally, what happens when not even one whole label fits:

> *"ex `Pal melaminat + 2` => `Pal mela.. + 2`"*

**This is one mechanism for both shells**, and it is the reference's own: frame D2A draws the top of
the ladder and frame 2A draws the bottom of it. The project implemented neither.

#### The ladder, in order, and it is the whole rule

| rung | what the pill draws | where it comes from |
| --- | --- | --- |
| **1** | every setting, whole labels, D2A's `│` between them | frame D2A, the 1920 px case |
| **2** | as many whole labels as fit, separated the same way, then `+N` for the rest | the owner's `MDF, Blum + 1` |
| **3** | one whole label, then `+N` | frame 2A's `PAL melaminat +2` |
| **4** | one label **ellipsised**, then `+N` | the owner's `Pal mela.. + 2` — the floor |

**A label is shown whole or it is counted.** There is no abbreviated form of a setting label and none
is invented; the owner's `MDF` was a shorter material in an example, not an abbreviation rule.

**`N` is how many settings are *not shown*, derived from the settings that exist.** Four settings
showing two gives `+2`; showing one gives `+3`. A fifth setting added later changes the count with no
edit to this rule.

#### The named settings are four, and their order is already ruled

**The kitchen's global colour joins the pill. Ruled by the owner, 2026-09-09** — *"if it fits, it
should be displayed also"* — so it is a named setting like the other three and **the ladder decides
whether it is drawn at any given width. No special case and no separate rule.** Frame D2A draws three
because it predates the colour ([ADR 0099](0099-a-colour-is-chosen-at-two-levels-and-the-cabinets-wins.md)),
not because the fourth is excluded.

**The order is `material │ colour │ hardware │ depth`, and it needed no new ruling.** The ladder
collapses from the end, so order decides which name survives at 900 px, and D2A cannot settle where
colour goes. **ADR 0099 decision 9 already did**: *"Placement: after the material group, before
hardware… The owner said 'just behind the material' and that is the order."* The settings sheet
renders in exactly that order (`global-settings.tsx:664–689`), and the control naming things in the
same order as the surface it opens is the argument that makes it right rather than merely available.
So `PAL melaminat` is the last name to survive, which is also what frame 2A draws at its extreme.

**The pill's labels are not the breakdown's labels, and the frame is what says so.** The shipped chips
compose `ro.priceBreakdown.wholeKitchenLabel` — *"Material · PAL melaminat"*, *"Feronerie · Hettich"*,
with a `·`. **D2A draws none of that**: the material is a bare tier name, and the others are a category
word and a value with no separator — `PAL melaminat`, `Feronerie Hettich`, `Adâncime 600`. Under
decision 1 the frame wins, so the pill gets its own composition. The colour's label has **no source in
either frame**; it follows the pattern the frame does establish, `Culoare {name}`, and that is a copy
question for the owner rather than a settled string.

**Rung 4 is the only ellipsis, and the mockups' own declaration is what performs it.** Both files
declare `min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap` on their label, and
that declaration **stands exactly as written**. It is the last resort, not the normal state — which is
the distinction ADR 0082 decision 3 was reaching for and could not express while there was a row of
chips to say it about.

**The counter and the swatch never give way, and a label is never absent.** The pill's minimum content
is *swatch + one (possibly ellipsised) label + `+N`* — never a bare `+3`, never a counter standing
alone. The swatch is drawn at every rung including rung 4. That minimum is what the rest of the top
bar must leave room for, and decision 8 is how it is guaranteed.

**Separation is D2A's `│` at every count, on both shells**, between labels only. The counter is
separated from the last label by the pill's own `gap` and never by a divider — which is how frame 2A
draws `PAL melaminat` beside `+2`. The disclosure caret is drawn where the frame for that shell draws
it: after the counter on desktop, not at all on mobile.

**Horizontal scrolling stays refused**, for the reason ADR 0082 decision 2 gives, unchanged.

#### The fit decision is a value, not a stylesheet

Rungs 1–3 are a **count**, and CSS cannot make it: `flex` shrinks a box, it does not choose how many
children to render. Rung 4 is a **width**, and CSS is exactly what performs it. **The two mechanisms
are separate and must stay separate** — an implementer who tries rungs 1–3 with flex shrink gets the
row of stubs ADR 0082 decision 3 refused, and one who tries rung 4 with a count gets a label that
vanishes instead of truncating.

The count is decided by a **pure function over measured widths**, held in a model that can be asserted
as a value, in the shape this project already uses for `describeChipAvailability`
(`apps/web/src/panel/panel-model.ts:885`) and every `describe*` model beside it. No component decides
it, and no markup encodes it.

**ADR 0082 decision 1 as amended survives intact and is the gate on all of this.** Nothing on the top
bar may leave the viewport, nothing may leave its own band, and no element may be clipped by the box
it stands in except the rung-4 label, on a flagged design as well as a seeded one.

### 4. ADR 0082 decision 4 (the pinned trigger) is discharged rather than overturned

Decision 4 pinned the trigger beside the chips box *"so its position is a function of the viewport and
not of how many chips there are"*. With one pill that is also the trigger, the property holds by
construction: there is no chip count for the control's position to depend on. The clause is spent,
not contradicted.

### 5. ADR 0082 decision 8's 44 px touch target is kept, and it is met without changing a painted box

Both frames draw controls shorter than 44 px — the mobile settings chip computes to 27 px, the
desktop pill declares `height:40px`, the mobile back control's line box is 17 px. Decision 8 stands:
every one of them keeps a tappable box of at least `var(--touch-target)`.

**The mechanism changes, because the previous one would now change the frame's own geometry.** The
target is expanded by a pseudo-element that takes no layout space, not by `min-height` on the control.
A `min-height: 44px` on the mobile chip would make it the tallest child of an `align-items: center`
row and lift the header band from the frame's 50 px to 67 — spending scene to satisfy a rule that
does not ask for it. Expanded, the painted pill is the frame's and the hit area is the token's.

**The assertion changes with it, and becomes stronger.** A `getBoundingClientRect()` on the control
now measures the painted box, so the gate asks `document.elementFromPoint` at the four corners of the
44 px area instead — which is what the requirement was always about.

### 6. `Verifică designul` is drawn exactly as the frames draw it and is wired to nothing

It appears in all five desktop frames that draw a full top bar and in mobile frame 2A's bottom bar,
and exists nowhere in `apps/web/src`. It leads to M8's review step, which is not built.

It is drawn and inert, on the precedent this repository has already set for the `RO ▾` locale caret
(`apps/web/src/app/configurator/configure/configure-screen.tsx`): *"a caret that does nothing is the
correct state of this control today, and a control that did something would pre-empt a ruling."*

**And it is drawn as the reference draws it, which is as a `div` and not a button.** The frames use a
non-interactive element in both files. That is also what `configure.module.css` already requires of
an inert control — *"Not a `button`, and that is the point: an element with a control's affordances
and no behaviour is worse than the static chip it replaces."* So: no `button`, no `role="button"`, no
`tabindex`, no `cursor: pointer`, and no `aria-hidden` — it is meaningful text and it is announced as
text. M8 gives it a destination.

**This one is louder than the locale caret and the owner is asked about it explicitly**, as the
plan's open question 1: it is the largest, most pressable-looking thing on the screen. Drawing it is
the default because it is what the owner asked to see; hiding it until M8 is the alternative and is
theirs to choose.

### 7. The frames' one copy fork per shell is *not* implemented, and the divergence is put to the owner

The two files spell two controls differently:

| control | desktop | mobile |
| --- | --- | --- |
| the breakdown control and its heading | *Ce se include în acest preț?* (D2A, D2D) | *De ce acest preț* (2A, 2D) |

`DEVELOPMENT-SPEC.md` §10.1 admits no copy fork per viewport, and this repository has a dated lesson
about reconciling ruled copy on a wave's own authority — `startingPrefixUnchanged`, where frames D2C
and 2C spelled one string two ways and the owner ruled a third. **So this wave changes neither
string and forks nothing.** `priceBreakdown.title` ~~stays *De ce acest preț*~~ **corrected 2026-10-06 to *De ce acest preț?* — see Amendment E** on both shells, and the
divergence is the plan's open question 2. A wave does not reconcile ruled copy on its own; that rule
is what produced the correct outcome last time and it is not suspended by an instruction to match the
reference, because the reference is what disagrees with itself.

### 8. The pill absorbs the narrowing. Two things that hide nothing may also give, and nothing else ever does.

Frame D2A is drawn at **1920 px**. Decision 3's ladder is what answers narrow desktop, and it does all
of the work at every width where it can. The question this decision settles is what happens when the
ladder has reached rung 4 and the row still does not fit.

**The reading that the pill is the only thing that gives is correct in intent and insufficient in
arithmetic.** Frame D2A's row was rebuilt from the mockup's own inline styles and measured in
headless Chromium in the app's own font stack — a measurement of type, not of the app, and re-measured
against the running app before the wave closes. What each rung needs, as a viewport width, with D2A's
`40 + 28` header padding:

| | rung 1 | rung 3 | rung 4 floor |
| --- | --- | --- | --- |
| D2A as drawn (gaps 28/14, wordmark) | **1264.59** | 1071.06 | — |
| gaps closed to frame 2A's 9/6 | 1159.59 | 966.06 | 882.67 |
| gaps closed **and** wordmark dropped | 1045.03 | 851.50 | 768.11 |

So at **900 px** the pill's ladder alone does not reach, and two further gives are ruled — **both of
which hide nothing**:

| | what gives | why this one |
| --- | --- | --- |
| **A** | **the pill's ladder, rungs 1 → 4** | the owner's ruling. It runs first and it runs to its floor before anything else moves |
| **B** | **the row's gaps close**, D2A's `28`/`14` → frame 2A's `9`/`6` | space only, and both numbers are the reference's. Measured **105.00 px** |
| **C** | **the wordmark leaves the row** — **ruled by the owner, 2026-09-09** | the only item in the band carrying no state, and frame 2A itself does not draw it. Measured **114.56 px** with its gap. It is **not needed to prevent an overflow**: it buys a readable setting name in a **900–966 px** window and nothing above it. See the ruling below |
| **D** | **the title ellipsises**, exactly as frame 2A declares it (`flex:1; min-width:0`) | declared by the reference and therefore available, but not reached on the seeded design once A and B are spent |
| — | **nothing else, ever** | the step pill, the price figure, `Verifică designul` and the locale chip are `flex:0 0 auto` in D2A. They are what the header is *for*, and they are drawn whole at every desktop width |

**C — the wordmark leaves the row at narrow desktop. Ruled by the owner, 2026-09-09.**

It is recorded as a ruling and not as a derivation, because it is a departure from frame D2A — which
draws the wordmark — and because `apps/web/tests/e2e/top-bar.desktop.e2e.spec.ts:165–174` had already
reserved it: *"Dropping it is a copy decision under the owner's Gate O1, not an implementer's, so this
stays an assertion rather than a workaround."* That reservation is discharged by the owner, not
overruled by this record.

**It was ruled on the corrected premise, and the correction is what makes it a decision rather than
a concession.** An earlier draft of this record said the wordmark had to go or the row would
overflow. **That was wrong**, and the measurement says so: with the wordmark kept the row *does* fit
at 900 px, at rung 4, with **17.33 px** left for the label. So the trade is not brand-against-overflow;
it is **a readable setting name against the brand, inside a 900–966 px window**. The owner was given
it in those terms and chose the readable name — over *both* alternatives:

- **keeping the wordmark and accepting a stub** (`P…` where a setting name should be), and
- **raising the desktop breakpoint so frame 2A serves narrow widths**, which removes nothing from
  either drawing but puts the phone's header, bottom bar and back control on a narrow laptop.

**The owner chose the wordmark's absence over a stubbed setting name and over the mobile shell
appearing on a narrow laptop.** All three options are reference-faithful — that is why it needed an
owner — and the one taken keeps the desktop drawing recognisably itself.

**The ruling rests on a measurement, and is revisited if the measurement is replaced rather than
re-argued.** The figures come from frame D2A rebuilt from the mockup's own inline styles in headless
Chromium, in the app's own font stack — **not from the app**. Work item 1 measures the app. **If the
app's own numbers show rung 3 fitting at 900 px with the wordmark kept — that is, needing 900 or less
where the frame measured 966.06 — the wordmark stays and the owner is told.** Replacing an estimate is
not re-opening a ruling; it is the condition the ruling was given under.

**If the row still overflows once A–D are spent, that is a reported failure and an owner question, not
a fifth rung.** In particular it is not licence to shrink the price, to shorten the CTA, or to bring
back a second band — which is refused outright, at every width and on both shells.

**One measured case did not fit, and the owner has ruled it out of the row.** On a design carrying
[ADR 0065](0065-a-body-past-the-end-of-its-wall-is-marked-not-moved.md)'s flag the desktop price cell
carried a sentence beside the figure — max-content **408.09 px**, min-content **71.22**, and about
**226 px** at the two-line wrap that keeps the band at the ruled 76. With `Verifică designul`
(**167.22**) and the pill in the same row, frame D2A's row and that sentence did not both fit at
900 px at any rung, with or without the wordmark. See decision 8b.

**A residue is safe here in a way it was not before, and the difference is worth naming**, because
ADR 0094 rejected exactly this arrangement: *"a row is an invariant; a residue is an inequality"*. The
pill's track is again the row's residue. What has changed is that **the pill now has a total function
of width**: for any width down to its floor it has a complete, reference-declared drawing, and its
floor is guaranteed by B and by the owner's ruling on C. The chips row had no such function — below its content width it
clipped — which is why a residue was fatal to it and is not fatal to this.

### 8b. ADR 0065's flagged-total sentence leaves the top bar and joins the scene. Ruled by the owner, 2026-09-09.

The frame has no slot for it — D2A was drawn before the product acquired it — so the frame could not
answer, and it was put to the owner with the measurement above. **They ruled that the sentence moves
off the bar and onto the scene**, and accepted the caveat that it lands near
`configure.overflowWarning`, which already says the design overflows.

**What it was chosen over:** letting the desktop bar grow on a flagged design, well beyond the
9.28 px it grows today.

**Two consequences, and the first is the point of the choice.**

1. **The header keeps frame D2A's shape at every width, flagged or not.** There must be **no width at
   which a flagged design draws a different header from an unflagged one** — not a taller one, not a
   narrower price cell, not a different rung of the pill. That is asserted, not described.
2. **This retires the 9.28 px trade rather than repaying it.** `1cc86d8` bought that height to fit
   this sentence into the row; the sentence leaves the row. The exception recorded at `.header` in
   `configure.module.css` is **struck in place with its cause**, and
   `settings-strip-containment.desktop.e2e.spec.ts:655` — which asserts the growth — is
   **re-pointed to assert the header does not grow**, never deleted. A gate that proved a
   now-retired trade becomes the gate that proves it stayed retired.

**It moves on both shells, and that is a deliberate reading rather than an omission.** The owner's
ruling named the scene and not a viewport. One placement for both shells needs no fork and satisfies
`DEVELOPMENT-SPEC.md` §10.1's *"a rule that needs to differ between viewports is a wrong rule"*;
placing it only on desktop would be §10.1's one permitted layout fork and is equally available. The
plan flags the difference so the owner can settle it in a word at review; nothing else depends on it.

**What is not decided here.** The two sentences now stand next to each other and say nearly the same
thing in different words — ADR 0065 decision 7b made them two constants on purpose (*"this one says
what is wrong and what to do about it, the total's flag says what the number contains"*), and that
distinction is harder to see when they are adjacent. **Whether one of them should go is a copy
question for the owner**, not a layout one, and this record does not answer it. ADR 0065's wording is
untouched.

### 9. No width threshold is introduced, and ADR 0094 criterion 4i is honoured rather than argued with

An earlier draft of this record introduced one `@media` breakpoint and defended it. **The owner's
ruling removes the need for it**, and that is a better outcome than the defence: every rung of
decision 8 is driven by the **same measurement of available width** that decision 3's count already
requires. There is no pixel breakpoint for the label count, none for the gaps, and none for the
wordmark.

ADR 0094 criterion 4i — *"No numeric width threshold is introduced… 1150 is not a property of the
layout"* — is therefore **met as written**, not waived and not answered. Its stated reason was that
*"a longer tier name, a re-worded warning, a translation, or a third chip moves it, and nothing in the
codebase would fail when it did"*. Under a measured fit, a longer tier name moves nothing: it is
simply a label that stops fitting, and the count says so.

**Two numbers this decision still forbids**, so that the threshold does not return in another shape:

- **No numeric `min-width` on the pill, on a label, or on the counter.** ADR 0082 decision 3's refusal
  survives whole and is the same refusal. The rung-4 label's floor is `min-width: 0` plus the
  mockups' own `text-overflow: ellipsis`, and nothing else.
- **No breakpoint chosen from a measurement.** Where a discrete decision is needed (the count, the
  gaps, the wordmark) it is taken from the measured available width against the measured intrinsic
  widths of the things competing for it — a comparison, never a constant.

**One derived quantity is permitted and it is not a threshold: the hysteresis margin** that keeps the
count from oscillating at a boundary width (decision 3's stability requirement). It is composed from
the pill's own separator and gap, so it is content-derived and moves when they do.

### 10. What the withdrawal reclaims, and what it does not

- **The desktop canvas gets the strip's row back** — about 45 px at every desktop width, the cost ADR
  0094 accepted knowingly. The mobile canvas gets the whole mobile strip band back, less the 2 px the
  header grows to hold frame 2A's own chip.
- **`1cc86d8`'s 9.28 px is retired rather than repaid.** The height was bought to fit ADR 0065's
  sentence into the top bar; decision 8b takes the sentence out of the bar, so the trade has nothing
  left to buy. An earlier draft of this record expected the pill's ladder to repay it and a later one
  measured that it would instead grow; the owner's ruling ends both readings. The gate that asserts
  the growth is re-pointed to assert its absence.
- **The desktop header draws identically on flagged and unflagged designs, at every width.** That is
  decision 8b's whole point and it is asserted rather than described.

## Alternatives considered

- **Keep the strip's row and treat the frames as inspiration.** Rejected on the owner's instruction,
  which is explicit and repeated, and on ADR 0003 §7, which already made a POC that matches the
  reference the calibration rule for the phase.
- **Implement the frames and drop ADR 0082 decision 1's containment predicate with the layout that
  produced it.** Rejected. The predicate is about whether a control is on screen, and it is true of
  any layout. It is the one clause here that gains force rather than losing it: it is now evaluated
  against a row the reference drew, so a failure is a defect in the implementation rather than in the
  design.
- **Ship the desktop frames and leave mobile as it is.** Rejected: the owner named the mobile shell
  specifically, and ADR 0003 §5 makes the two one implementation with a layout fork in CSS.
- **Solve narrow desktop with a second band below the top bar, under some width.** Rejected —
  decision 8. It is the withdrawn layout returning under a condition, and it would put the settings
  trigger on a different row depending on the window width, which is the hunt ADR 0082 decision 4
  refused.
- **Solve narrow desktop with one `@media` breakpoint that swaps D2A's pill for frame 2A's.** Drafted
  and then **withdrawn by the owner's ruling of 2026-09-09**, which is better than the defence it was
  given. A breakpoint is binary — four labels or one — where the ruling is progressive, and it
  freezes a number that a longer tier name or an M6B translation invalidates silently. The measured
  fit needs no number at all (decision 9).
- **Abbreviate labels under pressure — `PAL mel.` for `PAL melaminat`.** Rejected on the owner's
  ruling: *"keep labels full width"*. Neither mockup shows a shortened form of any setting label, and
  a second spelling of a tier name is what `startingPrefixUnchanged` records the cost of.
- **Let the pill degrade to a bare `+4` when no whole label fits.** Rejected on the owner's ruling —
  *"`Pal melaminat + 2` => `Pal mela.. + 2`"*. A counter standing alone names nothing; the pill exists
  to say what the kitchen carries while the sheet is shut.
- **Keep the wordmark at every desktop width and accept a stubbed setting name below 966 px.** Put to
  the owner and **rejected by them** — decision 8's ruling. It is the option that changes no drawing
  and costs a setting its name.
- **Raise the desktop breakpoint so frame 2A serves narrow widths.** Put to the owner and **rejected
  by them** — the same ruling. It removes nothing from either drawing and puts the phone's header,
  bottom bar and back control on a narrow laptop.
- **Keep ADR 0065's sentence in the top bar and let the desktop bar grow on a flagged design.** Put to
  the owner and **rejected by them** — decision 8b. It is `1cc86d8`'s trade, extended well past
  9.28 px, and it makes a flagged design draw a different header from an unflagged one.
- **Wire `Verifică designul` to `/configurator/review`.** Rejected: the route does not exist, and a
  primary action that 404s is worse than one that waits for M8.
- **Fork `priceBreakdown.title` per shell to match both files.** Rejected — decision 7.

## Records swept before deciding, and how each is settled

| Record | What it says | Settled how |
| --- | --- | --- |
| [ADR 0003](0003-design-reference-supersession.md) §5, §7 | The mockups are the reference; the near-term target is a POC that matches it; desktop covers screens 1 and 2 only. | **The authority this record rests on.** Nothing here extends it beyond chrome. |
| ADR 0003 §5's *"where §10.1 says 'always visible', the mockup wins"* | A frame beats a spec sentence on chrome. | **The precedent for decision 1**, applied to the whole band rather than to one clause. |
| [ADR 0082](0082-the-settings-strip-wraps-and-nothing-leaves-the-viewport.md) decision 1 + Amendment A | Containment against the viewport, the band and the clip, on a flagged design. | **Kept, enforced, and made the gate on the new layout.** Not relaxed. |
| ADR 0082 decisions 2, 3 | The chips wrap; the floor is one chip per line. | **Superseded for this control** — decision 3 here. There is no chips row left to wrap; the ruled ladder is the reference's own replacement. Decision 3's *intent* — *"a row of stubs each ending in an ellipsis tells the customer nothing"* — is **kept and sharpened**: a label is whole or counted, and exactly one label, the last, may ellipsise. Its *numeric* clause (no `min-width` in pixels) survives whole. Horizontal scrolling stays refused. |
| ADR 0082 decision 4 | The trigger is pinned and does not join the wrap. | **Discharged** — decision 4 here. One pill that is its own trigger has no chip count to move with. |
| ADR 0082 decision 5 | Vertical growth is absorbed by the stage; the strip overlays neither the stage nor the bar. | **Kept whole.** The stage stays the grid's only flexible row and nothing on the bar may overlay the price. |
| ADR 0082 decision 6 | One containment rule for both shells; a frame does not answer *"may a control leave the screen"*. | **Kept, and it cuts both ways.** A frame still does not license a control off screen — which is why decision 8 names a degradation order instead of drawing D2A at 900 px and hoping. |
| ADR 0082 decision 7 | A comment stating a layout claim no test holds is how a defect is inherited. | **Applied to this record's own numbers.** Every figure is labelled measured or derived, and the type measurements are marked as measurements of the *frame* until the app is measured. |
| ADR 0082 decision 8 | The tappable box is at least 44 px on both shells. | **Kept; the mechanism changes** — decision 5 here. |
| ADR 0082's owner ruling, 2026-09-05 | *"showing everything… increase the height and take from the vertical height."* | **Superseded by the owner's instruction of 2026-09-09**, and the supersession is recorded rather than assumed. The earlier answered how a chips row should behave; the later answers whether it should exist. Read literally, the earlier is also satisfied: nothing goes off the screen, and `+N` shows that there is more rather than hiding it. |
| [ADR 0094](0094-the-strip-gets-its-own-row-and-containment-is-measured-against-its-own-band.md) decision 2 | The strip gets its own full-width desktop row. | **Superseded** — decision 2 here, and Amendment A is written into that record. |
| ADR 0094 decisions 1, 3 | The classification, and ADR 0082 decision 1's three-box predicate. | **Stand whole.** Decision 3 is the gate on the replacement. |
| ADR 0094 criteria 4a–4h | The 6R-b acceptance criteria. | **Re-pointed, not dropped.** Each is restated against the pill in the plan's *Tests* section; none is deleted to make a layout pass. |
| ADR 0094 criterion 4i | No numeric width threshold. | **Met as written** — decision 9. The owner's ruling makes the fit a measurement, so there is no number to go stale. An earlier draft of this record introduced one breakpoint and defended it; the ruling removed the need and the defence with it. |
| ADR 0094's refusal to move ADR 0065's warning *"as scope"* | A containment defect does not license a product move. | **Correct then, and not what happened here.** The move is an **owner ruling** (decision 8b) taken on a measurement, not a wave relieving its own layout pressure. The refusal stands as written. |
| [ADR 0065](0065-a-body-past-the-end-of-its-wall-is-marked-not-moved.md) decisions 6–8 | The flagged total's sentence, its surface, its separation from §9's rejection banner. | **The wording is untouched; the placement is moved by the owner** — decision 8b. Decision 8's separation from §9's banner is unaffected: the banner is the panel's, and the scene is not it. That the sentence now sits beside `configure.overflowWarning` is raised as a copy question, not resolved. |
| [ADR 0099](0099-a-colour-is-chosen-at-two-levels-and-the-cabinets-wins.md) decision 9 | Colour sits *"just behind the material"*, on the owner's own words. | **The ruling that fixes the pill's order**, so no new one was needed. The pill reads `material │ colour │ hardware │ depth`, which is what the sheet already renders. |
| The owner's WCAG ruling, 2026-09-03 (`globals.css`) | `--ink-faint: #6b6860` replaces the frames' `#7d7a72`. | **Kept, and it outranks the frame.** A contrast ruling is not chrome taste. Every other colour in the frames is taken literally. |
| The owner's ruling, 2026-09-07 (76 px, recorded in `configure.module.css` and `top-bar-box.test.ts`, in no ADR) | On desktop a taller top bar is fine; the frame's 76 px is taken and the canvas pays 21 px. | **Confirmed and re-derived.** 76 stays, but it stops being the sum of four declarations and becomes the frame's own declared `height`, because the 48 px CTA does not fit inside `17.5 + 40 + 17.5`. Recorded here because the ruling had no ADR home. |
| `apps/web/tests/e2e/top-bar.desktop.e2e.spec.ts:165–174` | Dropping the wordmark is *"a copy decision under the owner's Gate O1, not an implementer's"*. | **Discharged by the owner, not overruled** — decision 8. The reservation was correct and it was honoured: the question went to the owner with a measurement, and they answered it. |
| `DEVELOPMENT-SPEC.md` §10.1 | One implementation; the only permitted fork is layout, in CSS. | **Obeyed.** Every shell difference is a grid or media-query fork; no markup branches and no copy forks (decision 7). It is also why decision 8b moves the sentence on both shells rather than on one. |
| `DEVELOPMENT-SPEC.md` §10 (*"Chips scroll horizontally"*) | The editor panel's chip rows scroll. | **Still scoped to the panel**, as ADR 0082 decision 2 ruled. Nobody may cite it for the top bar. |
| `docs/BACKLOG.md` entries 32, 33 | The containment leak; the 93.5 × 13 px trigger. | **Both stay closed.** 32's decision is ADR 0082's and survives; 33's 44 px survives with a new mechanism and a stronger assertion (decision 5). |

Nothing found in the sweep contradicts this record without being named above. Two records are amended
in place — ADR 0082 and ADR 0094 — and neither amendment is left to be inferred from this one.

## Consequences

- **The first `ResizeObserver` in this repository arrives with this wave.** Nothing in
  `apps/web/src` observes an element's size today, so the seam — SSR safety, the first paint before
  any measurement exists, and the jsdom behaviour the unit tests need — is new ground and is a named
  risk in the plan rather than an implementation detail.
- **A wave is opened**, planned in
  [`docs/milestones/chrome-parity-with-the-design-reference.md`](../milestones/chrome-parity-with-the-design-reference.md),
  with an owner browser review before any QA is dispatched.
- **Four stylesheets and four components change**: `configure.module.css`, `configure-screen.tsx`,
  `global-settings.module.css`, `global-settings.tsx`, `global-settings-model.ts`,
  `price-bar.module.css`, `price-bar.tsx` and `content/ro.ts` — plus a new fit model and its
  measurement seam.
- **Two e2e specs lose most of their subject** — `settings-strip-containment.desktop.e2e.spec.ts` and
  its mobile sibling. They are **re-pointed at the pill, not deleted**: every ADR 0082 predicate they
  assert is still true of the new control, and the plan says which assertion becomes which. Its
  case at `:655`, which asserts `1cc86d8`'s header growth, becomes the case that asserts the growth
  is gone.
- **The desktop canvas grows by about 45 px and the mobile canvas by about 74**, which moves every
  page-pixel constant expressed against the canvas origin. Those are re-measured in a browser, never
  nudged — ADR 0094 criterion 4f's rule, which this record keeps.
- **Four questions go to the owner, none of them blocking**, and they are listed at the head of the
  plan rather than buried in it. The narrow-desktop ladder, the wordmark, ADR 0065's sentence and the
  colour are all **ruled** (2026-09-09) and are decisions here rather than open items.

## Sweep addendum, 2026-09-21 — wave 7D5b's frame 1F departure (M7, not M6, scope)

Decision 1 above extends only to the configure screen's chrome and is silent about a product
mockup outside it. This addendum is recorded here anyway, on decision 1's own doctrine — *"where a
shipped rule disagrees with a frame, the frame wins and the shipped rule is named and withdrawn,
not quietly reconciled"* — because M7 wave 7D5b applies that same doctrine to a departure from
`docs/design/mockups/Lemnaria Configurator Mobil.dc.html`'s frame 1F, and this is the record this
project's own convention points a reader at for a named mockup departure.

| Record | What it says | Settled how |
| --- | --- | --- |
| Frame 1F, `docs/design/mockups/Lemnaria Configurator Mobil.dc.html` | The approved mockup draws **five** 1F rows: fridge, sink, preparation, hob, storage. No dishwasher row. | **Departed from, named rather than reconciled.** [ADR 0110, Amendment M, decision M3](0110-generation-inserts-through-the-command-path-and-the-corner-is-structural-data.md#amendment-m--2026-09-21-wave-7d5b-the-dishwasher-and-the-oven-principle) — owner ruling, wave 7D5b — adds a **sixth** row between the hob and storage: a dishwasher row, labelled **ro "Nișă mașină de spălat vase"** / **ru "Ниша для посудомоечной машины"**, width **600**, status reusing the existing *inclus* / *nu poate fi inclus* words, with **no explanatory sentence**. The owner chose this wording over the short form, in session. The storage row **excludes** the dishwasher. |

## Amendment A, 2026-09-10 — two things the owner ruled against this record's own frames, after driving the built screen

Both are owner rulings given in a browser, and both are recorded **here** rather than only in
[ADR 0107](0107-appliances-are-drawn-and-not-sold-and-a-language-is-named-in-its-own-language.md),
because decision 1 makes a frame's declaration the target and the next reader of this record would
otherwise "fix" the implementation back to the frame.

**A1. The price figure's prefix is regular; only the amount is bold.** Frame D2A declares the whole
string at `700 21px` (`de la {{ priceTotal }} MDL`, quoted in *What the frames declare* above). The
owner ruled the prefix down to **400** at the same size: it is a qualifier on the figure, not part of
it, and at 700 *de la* competed with the number it qualifies. **The frame loses this one, by the only
authority that outranks it.** It applies to **all four** figure surfaces — the price bar, the price
breakdown, the editor panel's footer total and the global settings sheet — and ADR 0107 decision 6
names them, because a commit in that session said *"both surfaces"* and reached two.

**A2. The `RO ▾` chip is now a real control, so decision 6's precedent for `Verifică designul` is
historical.** Decision 6 justified drawing an inert CTA on the precedent of *"a caret that does
nothing is the correct state of this control today"*. That state ended in M6B: wave 6B-i made the
chip a link to the other locale, and ADR 0107 decision 1 makes it a **language dropdown** over
`routing.locales`, with an endonym and a drawn flag per row. **Decision 6's own conclusion is
unaffected** — `Verifică designul` is still drawn as a `div` and wired to nothing until M8 — but its
precedent no longer exists on the screen, and a reader looking for the inert caret will not find one.
The frames still draw the chip closed, which is what it looks like until it is opened.

## Amendment B, 2026-09-29 — Q-7L-1 answered: D1B's heading, on-site note and plan hint are not drawn, and a desktop frame's text is not authority on its own

**What this amendment does.** It records an owner ruling, and it states how far decision 1's doctrine
reaches when M7 applies it to Step 1's frames. It also records wave 7L's departures from frames
D1A–D1F, as the 7L plan asked (*"recommended as a dated amendment to ADR 0104 carrying §3's departure
list"*). **Nothing above is struck.** Decisions 1 and 7 stand as written; this amendment narrows how
decision 1 is read for Step 1's copy, using decision 7.

**Citations.** A bare `:N` cites `docs/milestones/M7-room-and-presets.md` as it stood at `a989a85`.
Each claim is labelled **[doc-quoted]**, **[source-verified]** (read or `git grep`ped at `a989a85`)
or **[inference]**.

### B1. The question

Frame D1B (`docs/design/mockups/Lemnaria Configurator Desktop.dc.html`) draws three texts that phone
frame 1B does not [source-verified]:

| element | text | frame line |
| --- | --- | --- |
| heading | *"Dimensiunile camerei"* | `Desktop.dc.html:118` (and D1C, `:217`) |
| info note | *"Măsurile aproximative sunt în regulă acum — înainte de producție facem oricum o măsurare la fața locului."* | `Desktop.dc.html:176` |
| plan hint | *"Planul se actualizează la tastare și se oglindește odată cu cotul."* | `Desktop.dc.html:186` |

A fourth text, D1B's lead *"Măsoară de la perete la perete, pe podea."* (`Desktop.dc.html:119`), was
**excluded under every option**, because it contradicts the owner's 2026-09-16 ruling
(`:5118-5120`). Q-7L-1 (`:5114-5126`) offered three options:

- **(a)** Draw all three on desktop only.
- **(b)** Draw none of them. This was the architect's recommendation and the interim that 7L shipped.
- **(c)** Also drop D1C's card wording.

### B2. The ruling

**Option (b), final — draw none of the three.** This is the owner's answer, **relayed** by the
coordinator on 2026-09-29 as final. **It is the permanent answer, not an interim.** The relay names
(b), not (c). So D1C's *Sugestii* card keeps the frame's own words as 7L shipped them:
`room.suggestion.title` and `room.suggestion.switchToLinear`, `apps/web/src/messages/ro.json`
[source-verified]. That the card is unaffected is **[inference]** from the relay naming (b). It would
be falsified by a later owner statement that (c) was meant.

### B3. The two objections to drawing them

**1. Two of the three contradict shipped product meaning.**
[ADR 0120](0120-the-room-is-a-fact-and-the-kitchen-adapts-to-it-and-coverage-is-negotiable-where-dimensions-are-not.md)
Amendment C1 rules that the number the customer enters is *"the length they want furnished. Not the
wall's real length."* Amendment D1 adds that *"the entered number is the whole of what the product
knows about that wall"*. D3 quotes the owner: *"you have no idea what is the real room size and we
don't care about"* [doc-quoted].

- **The info note contradicts this.** It calls the entered numbers *approximate measurements* to be
  corrected later by an on-site measurement. Under C1/D1 the number is a decision the customer made,
  not a measurement of the room, and the product never learns the room. The phone already tells the
  customer the opposite beside the fields: `room.lengthsHint`, *"Introdu lungimea dulapurilor dorite,
  nu lungimea peretelui."* (`ro.json:59`) [source-verified].
- **The heading also works against it.** *"Dimensiunile camerei"* names the input as the room's
  dimensions, which *"invites wall-to-wall numbers, which the hint beside the fields exists to
  prevent"* (Q-7L-1, `:5121-5122`) [doc-quoted].
- **The plan hint breaks on a shape the product now builds.** It promises the plan *"se oglindește
  odată cu cotul"*, and a straight kitchen has no corner. Wave 7J made straight kitchens buildable
  after the frame was drawn. The frame predates a product fact, just as decision 3 records that D2A
  *"draws three because it predates the colour"*. **[inference]** that the frame's author did not
  intend the hint for a straight room.
- **The on-site measurement is not refused as a fact.** Only its placement in Step 1 is. The approved
  phone frames draw it where it belongs, attached to the **price**:
  - frame 3B, *"Suma finală se stabilește după măsurarea la fața locului"*
    (`Lemnaria Configurator Mobil.dc.html:1146`);
  - frame 5A, *"programăm măsurarea la fața locului"* (`:1448`);
  - M8's criterion, *"subject to on-site measurement"*
    (`docs/milestones/M8-review-contact-success.md:251`) [source-verified].

  That promise already has a home in M8. On Step 1 it would attach to the typed numbers, and C1/D1
  rule that those are not measurements. **[inference]**

**2. The phone has no counterpart for two of the three, so drawing them would be new desktop-only
copy.**

- **The heading and the info note appear nowhere on the phone.** They are absent from frame 1B
  (`Mobil.dc.html:101-188`) and from the shipped phone Step 1.
- **The plan hint's sentence appears in frame 1B only as the designer's annotation.** The annotation
  reads *"Planul 2D se actualizează la tastare și se oglindește odată cu toggle-ul"*
  (`Mobil.dc.html:186`). It is a note to the implementer, not text drawn for the customer. M7 made it
  a behaviour criterion, *"The 2D plan preview updates as the customer types and mirrors with the
  toggle"* (`:585`), and the phone performs it without saying it [doc-quoted].
- **None of the three is a message leaf.** `git grep` for all three texts over `apps/web/src` exits 1
  [source-verified]. So none has entered the copy lock under
  [ADR 0113](0113-step-1-copy-is-approved-as-drafted-and-enters-the-copy-lock-in-the-wave-that-adds-it.md)
  decision 2, none has a Russian draft, and no one has read any of them in a built screen.
- **Drawing them would add three desktop-only leaves whose only review is the frame itself.** Against
  that stand `DEVELOPMENT-SPEC.md:445`, *"Same rules, same copy, different chrome"*, and M7's own
  validation criterion, *"Desktop uses its extra space for an actionable suggestion, not for more
  prose"* (`:597`) [doc-quoted].

### B4. How this squares with decision 1, and what it narrows

**Decision 1's reach.** Decision 1's grant is screen 2's chrome, and its own text says it *"does not
extend the frames' authority beyond chrome… `DEVELOPMENT-SPEC.md` remains the behavioural contract"*.
The 2026-09-21 sweep addendum above says the same: decision 1 *"is silent about a product mockup
outside it"* [doc-quoted].

**How M7 extended it to Step 1.** M7 has nonetheless applied the doctrine to Step 1's frames, in four
places:

- 7F1's F8, the owner's *"use the design that was proposed"* (`:4669`);
- ADR 0113 decision 5, *"Mockup wording is still used as written where a frame has it (ADR 0104
  makes the frames the chrome specification)"*;
- 7F2's reading of the chips in 1C (`:4669-4677`);
- the whole of the 7L plan [doc-quoted].

This amendment records how far that extension reaches for **copy**.

**Why *"A frame is silent about behaviour it does not draw"* does not decide Q-7L-1.** That sentence
in decision 1 covers the opposite case. A frame that omits something the product has does not delete
it: ADR 0065's sentence and ADR 0099's colour on screen 2, and on Step 1 the chips and corner toggle
that frame 1C does not draw (`:4669-4677`). The sentence does not say that a frame which *draws*
something obliges the product to ship it, and Q-7L-1 is exactly that converse. So decision 1 does not
answer it either way:

- phone frame 1B's silence about the three texts forbids nothing;
- desktop frame D1B's drawing them licenses nothing on its own.

**Decision 7 is what answers it.** When the two files disagree about copy, neither frame wins by
frame authority. §10.1 admits no copy fork per viewport. *"A wave does not reconcile ruled copy on
its own… because the reference is what disagrees with itself"*, and the divergence goes to the owner.
Q-7L-1 is a decision-7 case on Step 1, and it was handled exactly that way: 7L shipped the
conservative interim, asked the question, and the owner ruled.

**The rule for Step 1, as this amendment records it.** For screen 2, decision 7 already says the
same, so nothing changes there:

1. **A frame's declared numbers and structure are still the target** (decision 1, unchanged). 7L's
   bands, columns, gaps and type sizes follow D1A–D1C and D1F, and the departures are named in B6.
2. **Text drawn in one file's frame and absent from the other file's frame of the same state does not
   ship on the frame's authority alone.** It needs either an owner ruling, or a milestone criterion
   that asks for that element on that shell. D1C's *Sugestii* card is the one element in Step 1 with
   such a criterion (`:597`), and it ships.
3. **A sentence that contradicts an owner ruling on what the product means ships under no answer.**
   This covers D1B's lead, and now the info note.
4. **Where a frame's text *is* drawn, ADR 0113 decision 5's "as written" still governs.** This
   amendment narrows **whether** frame text ships, not **how** it is worded once it does.

**Rejected reading:** *"the desktop frame draws it, decision 1 makes frames the specification, so it
ships."* That reading would make decision 1 override decision 7 on the one question decision 7 exists
to settle. It would also ship a sentence that contradicts ADR 0120 C1/D1, a behavioural ruling that
decision 1 expressly leaves outside the frames' authority.

### B5. The final state

**D1B at desktop draws no text that the phone's 1B does not draw.** That text is:

- the shape chips;
- the plan with its caption and wall labels;
- the corner question and its hint, for L and U;
- the length and height fields, with their labels and help;
- the lengths hint;
- the footer.

These are laid out to D1B's metrics, with B6's named departures.

**D1C adds only the *Sugestii* card**, which only 1C's refused state reaches.

**No leaf for the heading, the note or the plan hint exists**, and none may be added without a new,
dated owner ruling that reopens this amendment. **No code changes.** The product has shipped this
state since 7L at its interim, and the interim is now final. The 7L plan's R8 (*"Q-7L-1 answers (a)
after S3 has landed"*) is spent.

### B6. Wave 7L's departures from frames D1A–D1F, and the authority for each

| Departure | Authority |
| --- | --- |
| D1D's skeletons and D1E's four-up grid are not built | The preset story is past M8: [ADR 0131](0131-the-preset-story-is-deferred-past-m8-and-every-room-goes-from-its-dimensions-straight-to-composition.md); 7L D1 |
| The corner toggle sits above the fields, where D1B draws it below them | 7L D4. There is one DOM (§10.1), and CSS `order` would split focus order from paint order (WCAG 2.4.3 / 1.3.2). Shown to the owner, not asked |
| D1B/D1C's lead is not drawn | ADR 0120 C1/D1; excluded from every Q-7L-1 option |
| D1B's heading, info note and plan hint are not drawn | **This amendment**, B2–B4 |
| D1C's reason sentence is 7F2's `room.issue.*`, not the frame's | 7F2 §5; ADR 0120 C1 and decision 3 |
| D1A's merged lead, *Înălțime*, *‹ Înapoi*'s text, and D1F's *Ce așezăm* / *așezat* use the shipped leaves | 7L D11: one leaf per thing, no string forked for one meaning; D1F's status words are the owner's *inclus* |
| D1F's title reads *Preset*, not *Cameră* | 7F4 R14 |
| D1F's preview is the room's static plan, not one that *"fills as bodies are placed"* | 7F4 R12 (one synchronous call; a paced reveal would animate a fiction); 7L D10; Q-7L-2 confirmed by the coordinator |
| Length values are in millimetres where the frames draw metres | [ADR 0126](0126-the-rooms-lengths-are-typed-in-whole-millimetres.md) |
| The frames are 1920 px wide, so their column widths are read as maxima at 1440 and at 900 | 7L G15 |

### B7. Sweep for this amendment

| Record | What it says | Settled how |
| --- | --- | --- |
| Decision 1 here | Frames are the chrome specification; *"a frame is silent about behaviour it does not draw"* | **Unchanged and not struck.** Its extension to Step 1's copy is bounded by B4's rules 2–3. |
| Decision 7 here | When the two files disagree on copy, nothing forks and the owner rules | **The operative precedent.** Applied to Step 1. |
| [ADR 0113](0113-step-1-copy-is-approved-as-drafted-and-enters-the-copy-lock-in-the-wave-that-adds-it.md) decision 5 | Mockup wording is used as written where a frame has it | **Read with B4 rule 4.** It governs how frame wording is worded, not whether a one-shell sentence ships. A dated pointer is added there. |
| [ADR 0120](0120-the-room-is-a-fact-and-the-kitchen-adapts-to-it-and-coverage-is-negotiable-where-dimensions-are-not.md) C1, D1, D3 | The number is the run to furnish; the product never learns the room | **The ruling B3's first objection rests on.** Untouched. |
| `DEVELOPMENT-SPEC.md` §10 (`:445`), §10.1 | Same rules, same copy; one implementation | **Obeyed.** |
| M7 criteria `:585`, `:597` | The plan updates and mirrors; desktop uses its space for a suggestion, not more prose | **Met.** The behaviour ships silently on both shells, and the suggestion is the one desktop-only element. |
| M8 criterion (`M8-review-contact-success.md:251`) | The estimate is subject to on-site measurement | **Where the on-site promise lives.** Unaffected. |

## Amendment C, 2026-09-29 — Q-U4 answered: the corner-direction toggle is hidden for a U, departing from frame 1B's note

**What this amendment does.** It records an owner ruling that departs from a frame, which is why it is
recorded here (M7B plan, Q-U4: *"departs from frame 1B's note, so it needs the owner under ADR
0104"*). **Nothing above is struck.**

**The frame** [source-verified, `docs/design/mockups/Lemnaria Configurator Mobil.dc.html:186`]: frame
1B's annotation ends *"Toggle-ul apare doar pentru L și U."* No frame draws a U's 1B, 1C or 1F (M7B
plan, G13).

**The ruling.** The owner chose option **(b): hide the toggle for a U**. This is a **relayed selection**
of an option the M7B plan offered, answered on 2026-09-29 and relayed by the coordinator. It is not a
quotation. The owner rejected (a), which would have kept the toggle mirroring the whole U as the shipped
2D preview does, and (c), which would have given the toggle a product meaning. **It is final, not an
interim.**

**How it squares with decisions 1 and 7 and with Amendment B.** Under Amendment B, a frame's text is
not authority on its own, and where frame and ruling disagree the owner rules (decision 7's
precedent). The note is a frame annotation about when a control is shown. The owner has now ruled on
the U half of it, and the L half stands: the toggle still shows for an L.

**What it means for the build** is recorded as [ADR 0132](0132-wall-c-is-a-world-wall-and-only-the-right-corner-is-drawn-in-a-reflection.md)
decision 8. No U is right-handed. The URL's `direction` is neither written nor read for a U. The plan
preview draws a U unmirrored. A U document refuses `cornerDirection: "right"`. The wording change in
Step 1 is M7B wave U5's.

## Amendment D, 2026-10-01 — Q1 answered: the back-to-room link is drawn on desktop, and both back links ask before they leave

**What this amendment does.** It records an owner ruling that departs from frame D2A, which is why it is
recorded here. **Nothing above is struck.** Decision 8's widths gain a dated note (D3). Amendment C
(above) is the corner toggle and is not this. Written for M7C wave C1 slice S3
(`docs/milestones/M7C-m7-feedback-fixes.md`, *Q1*, *Q1b*, *C1*; `docs/M7-FEEDBACK.md`, M7-FB-001).
**S3 is committed as `01c40be`** (hash read from the branch's reflog; QA-green in a browser and
reviewed; not pushed, and not run on the CI runner). Labels: **[doc-quoted]**, **[relayed]** (stated by QA, a
reviewer or the coordinator, not re-run by the scribe), **[inference]**.

### D1 — the owner's words

**Q1, verbatim, typos included:**

> *"so i saw on mobile the back link exists, but what if I done a lot of changes but I need only to edit
> the size, going back will wipe out all my changes, looks like I need the ability to edit room size
> withgout loosing current work. I know this can change a lot, especially when will be reduced the size,
> there should be decission what to drop from cabinets. So I think the simple solution is to show at
> least a big warning, with mention, if you go back you loose all the custom changes you done so far,
> please confirm. So this is simple and minimum needed doesn't matter on desktop or mobile I do this"*

**Q1b, the wording.** The owner rejected the architect's draft and gave the Romanian, verbatim:
*«The warning in RO : "Daca te intorci la pasul urmator modificarile efectuate vor fi pierdute. Esti sigur
ca doresti sa reconfigurezi marimea bucatariei?" and translate also in RU»*. The coordinator put back
*"pasul anterior"* for *"pasul urmator"*, restored the diacritics, drafted the Russian and proposed the two
button labels. The owner **selected *"Approve as proposed"***, a selection and not prose. The approved
set, copied from the plan [doc-quoted]:

| | Romanian | Russian |
| --- | --- | --- |
| Warning | Dacă te întorci la pasul anterior, modificările efectuate vor fi pierdute. Ești sigur că dorești să reconfigurezi mărimea bucătăriei? | Если вернёшься к предыдущему шагу, внесённые изменения будут потеряны. Точно хочешь заново задать размеры кухни? |
| Confirm | Înapoi la cameră | Назад к комнате |
| Stay | Rămân aici | Остаться здесь |

The Romanian warning is the owner's own wording with one word corrected; the Russian and the buttons are
the coordinator's drafts, approved by that selection. The title was added afterwards (D2). The four leaves
are `configure.backConfirm.{title,body,confirm,stay}` ([ADR 0113](0113-step-1-copy-is-approved-as-drafted-and-enters-the-copy-lock-in-the-wave-that-adds-it.md),
pointer of the same date).

### D2 — the decision

1. **The back-to-room link is drawn in the desktop top bar from 900 px.** Frame D2A draws no back control
   (the plan's triage: both back links are `display: none` from 900 px, `configure.module.css:650-653`).
   Decision 1 makes the frames the specification and says a shipped rule that disagrees with a frame is
   named and withdrawn; Amendments A, B and C are the precedent that a departure from a frame is the
   owner's to rule. This is one, and the owner has ruled it.
2. **On every viewport, both back links open a confirmation before navigating.** The dialog is the one the
   material change already uses ([ADR 0081](0081-a-material-change-confirms-only-when-a-chosen-colour-would-be-lost.md),
   [ADR 0086](0086-the-confirmation-counts-chosen-colours-and-only-a-different-declared-material-owes-one.md)),
   extracted for reuse and not copied. It carries a **title**, added on the owner's selection of *"Add a heading"* (2026-10-01, after the visual
check): ro *"Modificările vor fi pierdute"*, ru *«Изменения будут потеряны»*, shown as the
material-change confirmation shows its title. The dialog is named by the title and described by the body. A modified click
   (ctrl, meta, shift or alt) bypasses the dialog, by web convention, and is not a way to lose work, since
   it opens the destination in another tab.
3. **Confirming navigates and nothing else.** No request other than the navigation; nothing is written,
   deleted or re-minted. The design stays at its own link, and `/` still resumes it. [ADR 0111](0111-step-1-creates-the-design-through-the-existing-mint-then-save-and-the-room-entry-lives-in-the-url.md)
   decision 5 (*"Choosing again creates a **new** design; the one the customer left is still stored"*) and
   ADR 0114 decision 4 are **unchanged**. **Staying, Escape and a backdrop press** return focus to the
   link and change neither the URL nor the design [doc-quoted: plan, C1 criterion 3a].
4. **The shared variant shows neither the link nor the dialog.**

### D3 — what it costs the top bar, and a dated note on decision 8's widths

The link is a **constant 34 px** that the pill's measured track already carries, so the fit ladder in
`top-bar-fit.ts` is **unchanged** and decision 8's guarantee holds: only the pill, the gaps, the wordmark
and the title give, and **one readable setting name remains at 900** [relayed: logic review R7.1; QA
measured]. There is no fifth give.

**What becomes false as written is decision 8's widths.** Every figure in its table (rung 1 at 1264.59,
rung 3 at 1071.06, the rung-4 floors, and the 105.00 and 114.56 px gives) was measured on 2026-09-09
without the link. Each viewport width at which a rung is reached **moves up by the link's width**, and
give C's *"900–966 px"* window moves up with it. The table is not rewritten and not re-measured here.
Measured examples [relayed, QA]: at 930 px the pill now names **one** setting where it named two before;
at 1025 px the wordmark is no longer drawn where it was. These are the ruled ladder working as decision 8
describes, and the wordmark's absence in the window is still the owner's 2026-09-09 ruling (give C).

**The two buttons are centred in the back confirmation.** The owner's later instruction, 2026-10-01,
verbatim: *"also the buttons center to modal"*. It holds on desktop and on the phone sheet. **The settings
material-change confirmation keeps its alignment**: the alignment is a property of the asker, not of the
shared component. QA measured in a browser at 1440 and 390 px, in `ro` and `ru`, that the button group's
centre is within 0.01 px of the dialog's, that the heading is 20 px / 700 over a 15 px / 400 body at 1440
(18 / 700 over 14 / 400 at 390), the same as the material dialog's title, and that the settings
confirmation is unchanged (`justify-content: space-between`) [relayed, QA].

**The desktop link stays the small `‹` glyph** (owner, 2026-10-01, selected *"Keep the small ‹"*); the
34 px cost above stands as written.

### D4 — the browser's Back button: decided, NOT built

**Decided 2026-10-01 (owner, selected *"Yes, warn on browser Back too"*): the browser's own Back button
will also warn.** It is a separate, later slice of M7C, which needs browser-history interception; the
architect is planning it as **slice C1 S4**. **Until it lands, the browser's Back leaves the editor for Step 1 with no
warning**, and the design stays saved at its link. **Editing the room size while keeping the customised kitchen** is what the owner
actually wants and calls hard; it is backlog 103 and not this amendment.

> **Dated pointer, 2026-10-05: D4 is now built (C1 S4, `12618bd`; the heading above is kept as written).**
> The browser's Back asks too: in the editor, reached from Step 1 in this tab, owner's variant, after at
> least one edit that changed the design, Back opens S3's confirmation (same component and leaves); nothing
> is written on Confirm. **Never a trap:** Step 1 is reachable within two Backs, and a further Back with
> either question open leaves. **Not a defect, recorded:** after a language switch that follows the guard,
> three Backs are needed, because the locale menu pushes its own entry. Forward back into the editor does
> not re-arm. Real phone swipe-back and real bfcache were not exercised. Record:
> `milestones/M7C-m7-feedback-fixes.md`, *C1 S4 as built*.

### D5 — alternatives considered

| Option | Why it lost |
| --- | --- |
| A desktop link with no warning (the first proposal) | The owner's point: going back wipes the customer's changes, so the link needs a warning on both viewports. |
| A separate *"Bucătărie nouă"* button with a loss warning | A second control for the same destination, and the existing link already is the way back. |
| Nothing until M8's customer profiles (ADR 0115) | The owner asked for the minimum now, *"doesn't matter on desktop or mobile"*. |

### D6 — sweep

| Record | What it says | How it is settled |
| --- | --- | --- |
| This ADR, decisions 1 and 8; Amendments A–C | Frames are the specification; a departure is the owner's; the pill absorbs narrowing. | **Followed**; decision 8's widths carry a dated note (D3). |
| [0111](0111-step-1-creates-the-design-through-the-existing-mint-then-save-and-the-room-entry-lives-in-the-url.md) decision 5; ADR 0114 decision 4 | Back never erases; `/` resumes the newest design. | **Unchanged** (D2). |
| [0081](0081-a-material-change-confirms-only-when-a-chosen-colour-would-be-lost.md), [0086](0086-the-confirmation-counts-chosen-colours-and-only-a-different-declared-material-owes-one.md) | When the material-change confirmation is owed, and what it counts. | **Unchanged in meaning**; the component is now shared (pointer added). |
| [0113](0113-step-1-copy-is-approved-as-drafted-and-enters-the-copy-lock-in-the-wave-that-adds-it.md) | New Romanian leaves enter the lock in the commit that adds them. | **Followed** (pointer added). |

## Amendment E, 2026-10-06 — the price breakdown's title carries a question mark

**Owner ruling, confirmed 2026-10-06.** Asked which wording is current, the owner answered *"Is: De ce
acest pret?"*: the title is **"De ce acest preț?"**. Decision 7's sentence that `priceBreakdown.title`
*"stays De ce acest preț"* is corrected in place (struck and pointed here); nothing else in decision 7
changes, including its refusal to fork copy per shell. [Source-verified by the coordinator:
`apps/web/src/messages/ro.json` and `apps/web/tests/support/approved-romanian-messages.ts` both hold
*"De ce acest preț?"*, and `price-breakdown-copy.test.ts` asserts it.] The mark was first ruled by the
owner on 2026-09-09 (recorded at [ADR 0141](0141-romanian-copy-rulings-recovered-from-the-copy-lock-and-a-test.md)
decision 1). Cite as `see ADR 0104 Amendment E`.

## Amendment F, 2026-10-17 — frames 1E and D1E are departed from by the owner's ruling: the card has Preview only, and Preview opens a carousel (Q-6; M8C)

**Evidence tiers.** *[doc]* quoted from this repository; *[src]* read by the scribe on 2026-10-17 (Grep of the two mockup
files); *[relayed]* the coordinator's relay of the owner's answer. The scribe ran nothing else. **Decided, not built**
(wave P8).

**The ruling** is recorded at [ADR 0003](0003-design-reference-supersession.md), dated amendment of 2026-10-17 to
decision 4b (the owner's Q-6, relayed: Preview opens a pop-up carousel with Previous, Next and Select; no *Folosește* on
the card). This record is the chrome specification (decision 1), so the departure is recorded here too: **a frame is
departed from by a dated owner ruling, never by an implementer's preference** (decision 7's rule for copy forks, applied
to a screen).

**The frame notes this departs from [src].**
- Mobile frame 1E, `docs/design/mockups/Lemnaria Configurator Mobil.dc.html:401`: *"Listă verticală, nu carusel: fiecare
  preset are propriul buton „Folosește" — nu mai e nevoie de un ecran de confirmare. Apar doar presetele care încap; cele
  care intră cu o ajustare de până la 30 cm sunt afișate cu ajustarea declarată. Restul nu se afișează deloc — dacă nu
  rămâne niciunul, se trece la generare (1F)."*
- Desktop frame D1E, `docs/design/mockups/Lemnaria Configurator Desktop.dc.html:461`: *"Grilă de patru, nu carusel: toate
  rezultatele se văd deodată — singurul avantaj real al desktopului aici. Fiecare card are propriul „Folosește", deci nu
  există ecran de confirmare."*

**What is departed from, and what is kept.** Departed from: *"nu carusel"* and the per-card *Folosește* on both frames
(the card selects nothing; Preview opens the carousel; Select is inside the pop-up). **Kept from both frames:** the
vertical list on the phone and the four-up grid on desktop, only presets that fit, the declared adjustment inline, and
the fall-through to 1F when none fits. The note's *"până la 30 cm"* was already retired by ADR 0109 Amendment A (±600 mm
and a declared change). Frames 1D / D1D (the loading skeletons) are read for chrome only. The mockup files are not edited
(decision 1).

**A mismatch in the M8C plan, reported.** The plan (§3.6) says frame 1E's note *"lives in ADR 0104's dated note"*. At
HEAD the note lives in the mockup files at the two lines above; ADR 0104 held no note on it before this one. The plan
names only the mobile frame; the desktop frame carries the same *"nu carusel"* note and is covered here.

**Wave P8's reading** reads frames 1D, 1E and D1E for the card's content and the chrome only; the CTA and the *"nu
carusel"* notes are superseded (plan §5, P8).
