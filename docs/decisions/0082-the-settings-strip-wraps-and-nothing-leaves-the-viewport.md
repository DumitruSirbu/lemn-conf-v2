# ADR 0082 — The whole-kitchen strip wraps, and nothing on it leaves the viewport

Status: Accepted
Date: 2026-09-05
Type: Finding + Decision
Milestone: M6 — closes `docs/BACKLOG.md` entry 32, schedules entry 33; lands in wave 6R

## Context

`docs/BACKLOG.md` entry 32, measured 2026-09-05 by the visual pass on waves 6K-d/6K-e at 390 × 844:

| chips | `.settingsRow` width | the trigger's right edge |
| --- | --- | --- |
| 2 | 390 (fits) | on screen |
| 3 | 442 | **412** — off a 390 px screen |
| 3, long label | 563 | further off |
| 4 | 632 | further off |

`body.scrollWidth` reaches 442 against `documentElement.clientWidth` 390. `.chip` ellipsises
correctly — wave 6K-b3 added `min-width: 0; overflow: hidden; text-overflow: ellipsis` and that rule
works, measured. **The containment leak is one level up**: `.settingsRow`
(`apps/web/src/app/configurator/configure/configure.module.css:35`) keeps a flex item's default
`min-width: auto` in an `auto` grid track, so the row sizes to its content and grows past the
column it stands in. The control that opens the whole whole-kitchen settings surface is the thing
that leaves the screen.

Two facts about that stylesheet matter as much as the numbers.
`apps/web/src/settings/global-settings.module.css:33` claims a fourth chip *"narrows the three
rather than breaking anything"* — **measurably false**, and it is the sentence that will persuade
the next person to add a chip without measuring. And the failure mode has already cost this project
once: wave 6K-b3 reverted a third chip after the overflowing chips subtree, painting at
`z-index: 7` over the price bar, intercepted the pointer and took **44 of 58 e2e specs** down
because nothing could open the sheet.

The owner ruled on 2026-09-05:

> *"I will go with showing everything, not going off the screen, even if we shrink — just to make
> sure that everything remains visible. Even if you need to just increase the height and take from
> the vertical height, I'm totally okay with this."*

## Decision

**1. Nothing on the strip may leave the viewport, at any chip count. This is an invariant of the
row, not a width that happens to fit today's labels.**

At every supported viewport: `document.documentElement.scrollWidth` equals `clientWidth`, and every
element of the strip — each chip and the trigger — has its bounding box fully inside the viewport.
It holds at two, three, four and five chips and it holds with a long label, because the tier names
in a chip come from the price book, which ADR 0062 seam 1 makes data authored outside TypeScript. A
book with a long tier name is not a hypothetical chip count; it is the same defect with today's two.

**2. The currency is vertical height. The chips wrap; the strip never scrolls horizontally.**

Wrapping is preferred over shrinking, per the owner's *"showing everything"*: a row of three stubs
each ending in an ellipsis satisfies "nothing off screen" and tells the customer nothing, which is
the whole purpose of a chip that names what the kitchen carries. Horizontal scrolling is refused
outright — it hides a control behind a gesture with no affordance saying it is there, on the one
strip whose job is to be a summary you can read without opening anything.

**`DEVELOPMENT-SPEC.md` §10's *"Chips scroll horizontally"* is not authority against this.** That
line describes the editor panel's own chip rows in the mobile mockup, not the whole-kitchen strip,
and ADR 0035 has since replaced the width chips it was chiefly about with a stepper. Nobody may cite
it to reintroduce a horizontal scroller here.

**3. Shrinking is the last resort inside a line, and the floor is one chip per line.** A chip is
never narrowed below the width of the line it is alone on. Ellipsis therefore survives for exactly
one case — a single label longer than a full line — and stops being the normal state of the strip.

**No numeric minimum width is declared, deliberately.** A `min-width` in pixels would fight the
wrap it is meant to support and would need re-picking at every viewport; "as wide as its own line"
is the same guarantee, expressed in a way that scales and can be asserted.

**4. The trigger is pinned and does not join the wrap.** It keeps `flex: 0 0 auto` beside the chips
box, so its position is a function of the viewport and not of how many chips there are. The chips
wrap **within their own box**, in the width the trigger leaves. Two reasons, and the second is the
load-bearing one: a control that moves down the screen as an unrelated setting is added is a control
a customer has to hunt for, and `global-settings-trigger` is addressed by name in the e2e suite that
6K-b3's revert was about.

**5. Vertical growth is absorbed by the stage, structurally, and that is what makes this safe where
the reverted third chip was not.** `.settingsRow` is `grid-area: settings` in a row track sized
`auto`, and the stage is `minmax(0, 1fr)`; the price bar has its own track. So a taller strip takes
height from the 3D canvas and from nothing else — it does not overlay the bar, which is what
`z-index: 7` plus horizontal overflow did. **No cap on the number of wrapped lines is declared**, and
in exchange three things are asserted at five chips: the canvas keeps a positive height, the price
bar stays fully visible, and the strip is not itself a scroll container in either axis.

**6. One rule for both shells.** Wrapping is containment, not chrome, so it is not one of §10.1's
permitted layout forks. The desktop popover shell keeps its pill styling and its own breakpoint
block; what it does not get is a different answer to "may a control leave the screen".

**7. The false comment is corrected in the wave that lands this**, and replaced by what was
measured rather than by a new prediction. A comment stating a layout claim that no test holds is how
this defect was inherited.

**8. `docs/BACKLOG.md` entry 33 — the 93.5 × 13 px settings trigger — is fixed in the same wave.**
It is a different defect (`.trigger` has `padding: 0`, so its tappable box is the text line box; the
40 px pill the customer sees is `.anchor`, a different element) but it is in the same two
stylesheets, it is on the same control, and one visual gate covers both. Fixing them separately
means measuring the same strip twice. The trigger's tappable box becomes at least
`var(--touch-target)` — 44 px, the token `globals.css` already declares — on both shells, and it
gains that height without pushing a chip off the line it is on.

## What this does not decide

- **It adds no chip.** Wave 6R's finish control is **per cabinet**, in the editor panel — the M6
  criteria are explicit that the cabinet editor keeps finish, handle and width, and that the
  whole-kitchen settings are material, hardware and cabinet depth. Entry 32's *"blocks wave 6R,
  which adds a finish control and therefore a third"* rests on a misreading of 6R's scope; the
  containment defect is real and 6R's own visual gate is the right place to land it, but 6R is not
  the wave that would have made it visible.
- **It does not decide whether cabinet depth gets a chip.** The sheet edits three settings and the
  strip names two of them, which is an inconsistency somebody will eventually close. Whether they
  should is a product question nobody has asked; this record only guarantees that closing it cannot
  push a control off the screen.

## Alternatives considered

- **Shrink the chips further and keep one line.** Rejected on the owner's ruling and on measurement:
  the chips are already ellipsising at two chips on a 390 px screen with the shipped book's names,
  so "shrink more" means shrinking labels that are already truncated.
- **Scroll the strip horizontally.** Rejected — decision 2. It is the option that looks tidiest in a
  screenshot and is worst in the hand.
- **Drop a chip when space runs out, or collapse to a count.** Rejected: the strip exists to say what
  the kitchen carries while the sheet is shut, and a summary that silently omits one of the two
  things it summarises is worse than a taller strip.
- **Move the chips into the sheet and leave only the trigger.** Rejected as scope this defect does
  not justify: frames 2E and D2E both draw the chips beside the trigger, and removing them is a
  product change, not a containment fix.
- **Cap the wrap at two lines and ellipsise beyond it.** Rejected: a cap re-creates the same class of
  defect at a higher chip count, and the owner ruled the vertical budget open.

## Records swept before deciding, and how each is settled

| Record | What it says | Settled how |
| --- | --- | --- |
| `DEVELOPMENT-SPEC.md` §10.1 | Desktop and mobile are one implementation; the only permitted fork is layout, in CSS. | **Obeyed.** Decision 6 keeps containment common and leaves the shell branch where it is. |
| `DEVELOPMENT-SPEC.md` §10 (*"Chips scroll horizontally"*) | The mobile editor panel's chip rows scroll. | **Scoped, not overturned** — decision 2. It is about the panel, and ADR 0035 replaced the width chips it chiefly described. |
| [ADR 0035](0035-width-is-a-bounded-stepper-not-a-menu-of-sizes.md), [ADR 0034](0034-width-chips-are-column-scoped-and-judged-by-the-command.md) | The width chip row became a stepper. | **Untouched.** A different row, in a different surface. |
| [ADR 0023](0023-touch-compatibility-clicks-reach-the-sheet.md) | A touch reaching two surfaces at once; the canvas cancels `touchend`. | **The nearest precedent for the failure mode**: 6K-b3's 44 red specs were pointer interception by an overflowing subtree. Decision 5 removes the overflow rather than tuning a `z-index`. |
| M6 acceptance criteria — *"the price bar never covers the selected cabinet at either viewport… a hard constraint"* | The bar is a flow sibling of the stage, never an overlay. | **Preserved, and decision 5 is its equivalent for the strip**: the strip grows into the stage's track, never over the bar. |
| [ADR 0065](0065-a-body-past-the-end-of-its-wall-is-marked-not-moved.md) decision 6/7b, wave 6S's close-out | A flagged design's price bar wraps to 125.7 px at 390 and the canvas loses exactly that height. | **The measured precedent that vertical growth is absorbed** — and the reason five chips must be measured against a *flagged* design too, where the canvas is already 619 px rather than 650. |
| [ADR 0062](0062-a-manufacturer-price-dashboard-comes-after-m8-and-shapes-seams-now.md) seam 1 | The price book is data authored outside TypeScript. | **Why decision 1 is phrased over label length and not chip count.** A long tier name is a book edit, not a code change. |
| `docs/BACKLOG.md` entries 32, 33 | The measured defect; the 13 px touch target. | **32 is closed by this record. 33 is scheduled into the same wave** by decision 8, having been left unruled by the owner. |

Nothing found in the sweep contradicts this decision, and nothing recorded is overturned by it.

## Consequences

- **Wave 6R gains two stylesheets and a measured gate.** `global-settings.module.css` and
  `configure.module.css` join its touches, and its visual verification gains the strip at two,
  three, four and five chips at 390 × 844 and at desktop — including at the breakpoint's own tight
  edge, where the desktop top bar has the least room.
- **A chip count above two must be simulated to be measured**, since the shipped strip renders two.
  That is a test-fidelity requirement, not a reason to defer: the entry's own table was produced
  that way.
- **The next control added to this strip inherits an assertion instead of a comment.** That is the
  whole point of decision 7.
