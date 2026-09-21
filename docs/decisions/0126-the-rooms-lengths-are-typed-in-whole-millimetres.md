# ADR 0126 — The room's lengths are typed in whole millimetres, and the URL keeps its metre wire form

Status: Accepted (owner ruling, 2026-09-21)
Date: 2026-09-21
Type: Decision
Milestone: M7 — wave 7F2, slice S1b (architect's plan, `docs/milestones/M7-room-and-presets.md`)

## Context

Wave 7F2 was mid-plan for 1C's copy — the field-level and room-level refusal sentences a customer
sees once a typed room is judged — when the owner was asked whether the unreadable-input message
(S1's shipped *"Scrie lungimea în metri."* / *"Введи длину в метрах."*) needed rewording. The answer
changed the entry unit for all four length fields, not only the wording of one message, so it is
recorded here rather than folded into 7F2's copy table silently.

Every citation below was read at HEAD `731a338` on 2026-09-21, in the 7F2 plan's slice **S1b**
(`docs/milestones/M7-room-and-presets.md`, the section between S1 and S2), which is the architect's
own investigation and is cited by section rather than restated in full.

## The owner ruling, verbatim, 2026-09-21

Asked whether the unreadable-input message should be reworded:

> *"you should allow only number insertion, I think best in mm, than meters do not have the comma or
> dot separation of the integer and float."*

The owner then confirmed, in the same exchange, that **all four fields — wall A, wall B, wall C, and
the ceiling height — are typed in whole millimetres, digits only** (e.g. `3600`, `2600`), on a
numeric keypad with no comma or dot, and that the change **lands inside 7F2, as slice S1b**, before
7F2's slices S3 (1C on the form) and S5b (the unreadable-on-blur message) — so those slices' messages
are built once, for millimetres, rather than shipped for metres and rewritten.

## Decision

**1. Entry unit: whole millimetres, digits only, on all four length fields.** A new parser,
`parseMillimetres`, reads the field: ASCII digits `[0-9]` only, trimmed, a positive safe integer,
leading zeros accepted. Any other character — comma, dot, space, sign, exponent, letters, a unit
suffix, a non-ASCII digit — is refused, and the field keeps exactly what was typed
(`docs/milestones/M7-room-and-presets.md`, S1b decision C-S1b-2). The control is `type="text"`
`inputmode="numeric"`, with no `maxLength`, no `pattern`, no placeholder.

**2. ADR 0108 decision 4's rule stands; only its unit changes.** Decision 4 reads: *"Millimetres are
whole or refused. Parsing the displayed metres ('3,60') is a form-boundary job in `apps/web`, done
once, on the digit string rather than by multiplying a float; the domain re-checks integrality and
refuses a non-integral value rather than rounding it."* The **mechanism** — a form-boundary parse,
once, on the digit string, the domain locale-free and re-checking integrality — is untouched. The
**displayed text the parser reads** changes from a metre string (`"3,60"`) to a millimetre string
(`"3600"`). ADR 0108 carries a dated pointer to this record at its status line; its prose is not
rewritten.

**3. The URL keeps metres — coordinator ruling C-S1b-1.** `parse-metres.ts` becomes the URL's parser
alone; the new `parse-millimetres.ts` is the field's. Every link ever written or shared still means
what it meant: `wallA=4` is 4 m in an existing link and must never be read as 4 mm. `serialiseRoomInput`,
`canonicalRoomQuery`, `roomHrefFromDesignRoom` and ADR 0111 decision 3's URL contract are unchanged;
`room-url-state.ts` and the code of `parse-metres.ts` stay byte-identical, as do the four tests ADR
0111/7F1 already froze. Rejected alternatives: switching the wire to millimetres (a bare integer
becomes ambiguous — `wallA=4` reads 4000 mm today and would read 4 mm under the new field grammar,
and resolving that needs an invented discriminator nobody has ruled on); or dropping old links
outright, which breaks every saved or shared room.

**4. Refuse invalid input; never strip it — coordinator ruling C-S1b-2.** The field shows exactly
what was typed. Stripping non-digit characters would turn a habitual metre entry into a different,
readable room silently — `"3,6"` → 36 mm, `"3,60"` → 360 mm, `"2.7"` → 27 mm — which is exactly the
hazard `parse-metres.ts`'s own comment already names: *"a millimetre that moved in conversion is a
room the customer did not enter."* Leading zeros are accepted (`"03600"` reads 3600, one reading of
one digit string); there is no `maxLength` and no `pattern`, because either would give a second,
silent reading of the parser or truncate a paste into a room not entered.

**"Unreadable" is defined precisely, because slice S5b's message population depends on it:**
non-empty text the entry parser refuses — `"abc"`, `"3,6"`, `"3.6"`, `"3 600"`, `"3600mm"`, `"0"`,
`"000"`. **Empty text is not unreadable** — unchanged from S1. A **readable** value that is merely
out of range (`"3"`, `"36"`, `"99999"`) is not unreadable either: it reaches the domain and is
refused there, at 1C, as `WALL_TOO_SHORT` / `WALL_TOO_LONG` / `HEIGHT_TOO_LOW` / `HEIGHT_TOO_HIGH` —
`"0"` stays refused as `notPositive` by the entry parser itself, because the wire and the domain both
refuse a zero length; accepting it would put a draft value on the URL that the reader drops.

**5. `locale` is removed from the refill thread — coordinator ruling C-S1b-3.** A refill of
`String(mm)` needs no locale, so `StoredLength.locale`, `roomDraftFromQuery`'s `locale`,
`RoomReconciliationInputs.locale` and the `useLocale()` call in `useReconciledRoomDraft` become dead
and are removed, fenced to that one thread: the `room-query-sync.ts` diff for this slice contains
only the `locale` removal and the one import swap in `withLengthFromQuery`, if any; any other hunk in
that file is a stop-and-report. This is why slice S1b runs at Full tier despite 7F2's own row being
Light — it edits a pre-named 7F1-D45 state-machine file.

**6. The record is a new ADR, not an amendment to ADR 0108 or ADR 0120 — coordinator ruling
C-S1b-4.** ADR 0108 is about *how a room is validated* — policy as data, handed to a pure validator —
and already carries six amendments; this is a product decision about *what unit the customer types
in*, which is not that record's subject. ADR 0120 is about *what a room is* (a fact the kitchen
adapts to); the entry unit is a presentation question, not a room-fact question, so it does not
belong there either. Both records are updated with pointers (decision 2 above; the *Clarification of
ADR 0120 decision 3* section below) rather than absorbing this ruling's prose.

## Owner answers, 2026-09-21

**Q-S1b-1 = (a): millimetres are shown everywhere a length is displayed, not only in the field.**
The plan's wall labels and frame 1F's room summary show millimetres, with no thousands separator,
matching the convention every other editor size already uses in this codebase
(`{…Mm, number, ::group-off} mm`): *"A · 3560 mm"*, *"L · 3560 × 4250 mm · h 2700 mm"*.
`formatMetresForDisplay` and its tests are deleted; it has no remaining caller.

**Q-S1b-2 = (a): the hint stays as it is.** `room.lengthsHint` does not name the unit in words; the
`mm` suffix printed in each field's box is enough. (Recommended alternative (b), naming the unit in
the hint's own sentence, was not chosen.)

**The unreadable-input message.** S1's shipped *"Scrie lungimea în metri."* / *"Введи длину в
метрах."* is withdrawn — it is now false of the product and the owner named it directly as the
message that needed to change. It is replaced by:

> **`room.issue.unreadable`** — ro: *"Scrie valoarea în milimetri, doar cu cifre."* — ru: *"Введи
> значение в миллиметрах, только цифрами."*

*(worded "valoarea" / "значение" rather than "lungimea", because the height field is not a "lungime"
and every other reason in the table already reads "Verifică valoarea".)*

**A new unit label replaces the old one.** `room.unitMillimetres` = *"mm"* / *"мм"* is the box's
suffix on all four fields, and is owner-approved alongside the message above. `room.unitMetres` is
retired: it has no remaining caller once every length display reads millimetres (Q-S1b-1 = (a)).

## Clarification of ADR 0120 decision 3

ADR 0120 decision 3 reads: *"A refusal may state a floor; it may never ask for millimetres … the
sentence at 1C says what this room cannot hold, never 'make wall B 100 mm longer.'"* Read literally
by a reviewer, that sentence could be misapplied to forbid the word *"milimetri"* appearing anywhere
in a refusal, which would make this ADR's own unreadable message impossible to write.

**That is not what ADR 0120 decision 3 forbids.** Its subject is an **amount** — a quantity of
millimetres the product asks the customer to add or remove, such as *"we need another 100
millimetres"* — never the **entry unit** the customer is told to type in. This ADR's unreadable
message names the unit the field accepts (*"in millimetres"*); it does not ask for a quantity, and no
issue sentence in the 7F2 copy table (§5, `docs/milestones/M7-room-and-presets.md`) uses the *"mm"* /
*"мм"* abbreviation — the unit is written out in words in the one place it appears at all, exactly as
ADR 0120's own audit distinguishes "the kitchen's extent, which the product controls" from "the
room's dimension, which the customer measured." A field-level or room-level refusal (`WALL_TOO_SHORT`,
`WALL_TOO_LONG`, `HEIGHT_TOO_LOW`, `HEIGHT_TOO_HIGH`, `ROOM_TOO_SMALL_FOR_KITCHEN`) still carries no
number and no unit at all, per ADR 0108 decision 3 — this clarification touches only the unreadable
message, which is the one leaf that is about the field's grammar rather than the room's dimensions.

## The departure from the mockups

`docs/design/mockups/…Mobil.dc.html` draws every length in metres with a comma (*"3,60 m"*), and
frame 1B/1C's own box reads that way. This ADR departs from the mockup for the field itself (entry is
now millimetres, digits only) and, under Q-S1b-1 = (a), for the plan labels and frame 1F's summary as
well. This is recorded against ADR 0104 (*"the mockups are the chrome specification"*) in the 7F2 plan
and in this record: the mockup's notation is superseded here by the owner's later, more specific
ruling on the entry unit, exactly as ADR 0104 already accepts a later owner ruling overriding mockup
chrome.

## Consequences for the later slices S3, S5 and S5b

- **S3 (1C on the form).** Every prefix of a valid value is now a *too-short* reading while it is
  still being typed — a wall typed toward `3600` reads `3`, `36`, `360` in turn, and a ceiling typed
  toward `2600` reads `2`, `26`, `260` — where before only the ceiling's prefixes were short. The
  400 ms typing-pause rule (coordinator ruling C-7F2-1) is now load-bearing on **every** field, not
  only the ceiling, or a customer typing normally would see a reason flash and clear on every
  keystroke.
- **S5b (the unreadable-on-blur message).** This message's population grows under the new grammar:
  the habitual metre entry (*"3,6"*, *"3.6"*) is now its most common member, where before it was
  readable (and misread as 3600 mm). The message text above is written for that population.
- **S5 (the incomplete plan).** Unaffected in scope (it concerns shapes, not magnitudes), but a wall
  mid-typing now draws at its numeric prefix (e.g. `36` mm beside a finished `2400`) for the length of
  one typing pause — noted, not scoped as a defect; if the owner finds it wrong once seen, it is a new
  question, not this record's or S5's.

## Alternatives considered

- **Reword only the unreadable message and leave the field reading metres.** Rejected: it does not
  answer what the owner actually asked for, which was the entry unit itself — "you should allow only
  number insertion... best in mm."
- **Switch the wire to millimetres as well (C-S1b-1 option (b)).** Rejected — decision 3 above.
- **Fold this ruling into ADR 0108 as a further amendment, or into ADR 0120.** Rejected — decision 6
  above; neither record's subject is the entry unit.
- **Read ADR 0120 decision 3 as forbidding "milimetri" anywhere in a refusal, and rewrite the
  unreadable message to avoid the word.** Rejected as a misreading — the *Clarification* section
  above states why the sentence's target is a quantity, not a unit name.

## Consequences

- ADR 0108 decision 4's status line now carries a dated pointer to this record; its own prose is
  unedited.
- ADR 0111 decision 3 is left intact: the room entry still lives in `/configurator/room`'s query
  string, in metres, and names no unit change of its own.
- The 7F2 plan's slice S1b section, its *Owner and coordinator rulings*, and its §5 copy table are
  updated to record these answers as ruled, each pointing here (`docs/milestones/M7-room-and-presets.md`).
- `room.unitMetres` and `formatMetresForDisplay` are retired from the product surface once slice S1b
  ships; `room.unitMillimetres` and `parseMillimetres` take their place under `src/room`.

## Decision-record sweep

| Record | What it says | How it is settled here |
| --- | --- | --- |
| [0108](0108-a-room-is-validated-against-policy-data-and-the-interim-policy-is-the-engines-own-limits.md) decision 4 | Millimetres are whole or refused; parsed once, at the form boundary, on the digit string; the domain stays locale-free. | **Its rule stands; only the displayed unit the parser reads changes**, from metres to millimetres (decision 2). |
| [0111](0111-step-1-creates-the-design-through-the-existing-mint-then-save-and-the-room-entry-lives-in-the-url.md) decision 3 | The room entry lives in `/configurator/room`'s query string. | **Left intact.** It names no unit; the URL keeps metres (decision 3). |
| [0120](0120-the-room-is-a-fact-and-the-kitchen-adapts-to-it-and-coverage-is-negotiable-where-dimensions-are-not.md) decision 3 | A refusal may state a floor; it may never ask for millimetres. | **Clarified, not narrowed or reversed.** The rule is about an amount asked of the customer, not the entry unit; see *Clarification of ADR 0120 decision 3* above. |
| [0104](0104-the-mockups-are-the-chrome-specification-and-the-strips-own-row-is-withdrawn.md) | The mockups are the chrome specification. | **Departed from, recorded** — see *The departure from the mockups* above. |
