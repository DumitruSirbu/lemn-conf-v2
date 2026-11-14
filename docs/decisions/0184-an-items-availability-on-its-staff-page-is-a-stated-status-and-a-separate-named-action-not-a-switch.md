# ADR 0184 — An item's availability on its staff page is a stated status and a separate, named action, not a switch

Status: **Accepted** (2026-11-14), on the owner's answers to the M12 plan's §9 the same day [owner, relayed by the
coordinator]: Q5-1's default stands (the Materiale screenshot is the same complaint; a status plus a named button, the
track switch kept as the fallback). Proposed earlier the same day. Owner feedback of 2026-11-14, item 5. Nothing is built.
Date: 2026-11-14
Type: Decision record (staff UI; a recorded departure from a mockup frame)
Milestone: M12 — [`M12-owner-feedback-2026-11-14.md`](../milestones/M12-owner-feedback-2026-11-14.md), wave W5

**Evidence tiers.** **[owner]**: `docs/OWNER_FEEDBACK.md`, *Round 2026-11-14*, item 5. **[doc]**, **[src]** (at
`c48992e8`), **[inf]** as in ADR 0182.

## Context

The owner, on staff *Feronerie* → "Hettich": the row *"Activă în configurator · Activ"* is very hard to read as the way to
disable the class; it should be a separate action, or be renamed to the simple word "Dezactivează"; analyse best
practice for such toggles [owner]. A screenshot of *Materiale* → "MDF vopsit mat" (*"Activ în configurator · Activ"*)
came with no text [owner; same complaint, inference].

**What is built.** One shared section draws the row for a hardware class, a material and an accessory:
`ItemLifecycleSection` (`apps/web/src/price-dashboard/item-edit-parts.tsx:42-95` [src]) renders
`ActionThatMayBeOff` as a full-width `<button role="switch" aria-checked>` whose children are the label and the state
word (`:55-74`; `action-that-may-be-off.tsx:46-56` [src]). Its style is a bordered row with no track or knob
(`item-screen.module.css:319-355` [src]). Pressing it does not switch: it opens a confirm dialog in **both** directions
(`priceDashboard.lifecycle.deactivateTitle` "Dezactivezi „{name}”?" and `activateTitle` "Activezi „{name}”?",
`apps/web/src/messages/ro.json:1679-1691` [doc]).

**What the mockup drew.** Frame D4B draws a card: the heading "Activă în configurator", the hint, then a visible switch
(a 46 × 26 track with a knob) and the state word (`docs/design/mockups/Lemnaria Dashboard.dc.html:295-299`, `TOG` at
`:474`, used at `:693` and `:703` [doc]). The list's row menu says *"Dezactivează / Activează, Șterge"* (D4A note,
`:868` [doc]) and an inactive material's banner carries an **"Activează"** button (D5F, `:703`, `:869` [doc]). So the
build departed from D4B (no track), and the mockup itself already names the action by its verb in two other places.

## Decision

1. **The section states the status and offers one named action.** A status line, *not interactive*: the existing label
   ("Activă/Activ în configurator") with the state word as a badge ("Activ" / "Inactiv", the list's own chips,
   `priceDashboard.chips.active|inactive`). Under it the hint already written (`activeHint`). Then one secondary button
   whose label is the verb of what it will do: **"Dezactivează"** while active, **"Activează"** while inactive
   (`priceDashboard.common.deactivate|activate`, existing approved leaves). The button opens the same dialogs as today;
   nothing about what a deactivation does, when it applies (ADR 0178 A-17, immediate) or who may do it changes.
2. **An action that cannot be taken stays in place with its reason**, as today (`ActionThatMayBeOff`'s reason note:
   the default class, the last active option, a draft-deleted item). The status line is shown in every case.
3. **`role="switch"` and `aria-checked` leave this control.** The button is a plain button; the state is text.
4. **One component, three pages.** Hardware class, material and accessory change together (they share
   `ItemLifecycleSection`). The accessory page's label is "Activ" today (`ro.json:1660` [doc]); it takes the same shape.
5. **Departure from frame D4B, recorded.** A dated note in `docs/design/README.md` and an ADR 0104 amendment are owed
   to the scribe (ADR 0104 Amendment H's rule that a departure is recorded and the frame is not edited).

## Why a button and not a switch [inf, from the control's behaviour and common platform guidance]

A switch promises an immediate, reversible flip of a setting, read at a glance by its position. This control confirms
first, in both directions, and its consequence reaches customers' saved kitchens (they are asked to choose another
option). A control that asks before acting is a button; its label must say what it will do. The owner's own word,
"Dezactivează", is that label. The status is then a fact the page states rather than something the reader infers from a
knob position. **What would falsify it:** the owner preferring the D4B track switch after seeing both.

## Alternatives considered

- **Build D4B as drawn (track + knob + state word).** Faithful to the mockup and an accepted pattern, but still a switch
  that opens a confirm dialog, and it is the shape the owner found unreadable in spirit ("hard to understand that
  disabling needs a click on this row"). Kept as the fallback if the owner prefers it.
- **Rename only (label "Dezactivează" on the existing row).** Fixes the word, keeps a row that is both a status and an
  action; the state of an inactive item would then read as "Dezactivează · Inactiv".
- **Move the action into a "⋯" menu, as the list rows do (D4A).** Hides the most consequential action on the item's own
  page behind a second tap.

## Sweep

| Record | What it says | Settled how |
| --- | --- | --- |
| ADR 0104 (mockups are the chrome specification), Amendment H | Departures are recorded; frames are not edited | Departure from D4B recorded here; README note and amendment owed |
| ADR 0178 A-17 | Availability is immediate, unversioned, logged; it supersedes the mockup dialogs' "at publish" text | Unchanged; the dialogs and their copy are reused as is |
| ADR 0062 Amendment 3 | A switched-off item must be replaced by a customer who opens a kitchen naming it | Unchanged |

## Consequences

- No new copy is strictly required (the verbs and chips exist); if the wave adds a status-line leaf, Romanian and
  Russian land together, the Russian drafted and unapproved (engineering-conventions §4).
- Tests that find the control by `role="switch"` move to `role="button"` with its verb name.
