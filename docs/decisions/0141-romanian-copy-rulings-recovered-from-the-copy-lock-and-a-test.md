# ADR 0141 — Romanian copy rulings recovered from the copy lock and a test

Status: Accepted
Date: 2026-10-06
Type: Finding (recovered reasons and rulings; no behaviour changes)
Milestone: Cross-cutting (M6B copy, M7 Step 1); filed under ADR 0136 decision 3

**Why this record exists.** [ADR 0136](0136-code-and-test-comments-carry-only-what-nothing-else-can-and-history-lives-in-the-records.md)
decision 3. The approved Romanian copy lives in `apps/web/tests/support/approved-romanian-messages.ts`
(the copy lock) and `apps/web/src/messages/ro.json`; this record holds only the **reasons** behind a few
leaves, so a later reader does not "correct" them.

**Evidence tier and how to read the rulings.** Every decision is **recovered from a code or test comment
on 2026-10-06, not re-measured**. Each owner ruling is recorded as *owner ruling as recorded in
`<file>` comment, dated `<date>` where the comment gives one; not re-confirmed with the owner on
2026-10-06*, and is **not generalised beyond the comment's words** (`docs/best-practices/documentation.md`,
*A rule the owner described in conversation is not yet an invariant*). Cite as `see ADR 0141 decision N`.

## Decision 1 — the price breakdown's heading carries a question mark the frame does not

- **Ruling.** *Owner ruling as recorded in `apps/web/tests/price/price-breakdown-copy.test.ts`, dated
  2026-09-09 there; **confirmed by the owner on 2026-10-06** as current.* The owner replaced the caret beside the control with
  a question mark: *"replace the `^` with `?`"* (the test's quotation).
- **Consequence.** `ro.priceBreakdown.title` is *"De ce acest preț?"*. Frame 2D itself draws the wording
  **unpunctuated**, so the mark is a supersession of that frame by its own author; the frame is asserted
  on the wording it carries verbatim, and the mark on the desktop frames, which punctuate their own
  longer heading (*"Ce se include în acest preț?"*) the same way. The comment ties this to the price
  label's shape ("the same shape as the price label's").
- **ADR 0104 corrected.** Its decision 7 sentence (no mark) is corrected by
  [ADR 0104 Amendment E](0104-the-mockups-are-the-chrome-specification-and-the-strips-own-row-is-withdrawn.md).
- **Where.** `apps/web/tests/price/price-breakdown-copy.test.ts`.

## Decision 2 — the Step 1F list heading says *"Ce este inclus"*, in the passive voice it shares with `status.placed`

- **Ruling.** *Owner ruling as recorded in `approved-romanian-messages.ts` (the `compose` block), dated
  2026-09-15 there; not re-confirmed on 2026-10-06.* The owner's words as the comment quotes them:
  *"not Ce includem but Ce este inclus"*.
- **Why.** The heading had kept the frame's *Ce așezăm* after the rows below it stopped saying *așezat*,
  which the earlier ruling on those labels cannot leave standing. The owner chose the **passive** form
  over a first-person *includem* an implementer had proposed, so the heading and the `status.placed` row
  now say *inclus* in the same voice. **Keep that property if the sentence is ever adjusted.**
- **Leaf.** `room.compose.stepsLabel` — *"Ce este inclus, în ordinea priorității"*.
- **Related, recorded.** The ruling on the status labels (*așezat* → *inclus*, *nu încape* → *nu poate
  fi inclus*), on the dropped sentence naming the wall sizes, and on keeping the report is recorded at
  [ADR 0110](0110-generation-inserts-through-the-command-path-and-the-corner-is-structural-data.md)
  Amendment F, F15, whose own text says the strings and their history are not restated there.
- **Where.** `apps/web/tests/support/approved-romanian-messages.ts` (`compose.stepsLabel`).

## Decision 3 — frame 1F's last sentence is deliberately absent

- **Ruling.** *Owner ruling as recorded in the same comment under the id "R18"; the comment gives no
  date. Whether R18 is the owner's or a plan ruling is not stated in the comment. Not re-confirmed on
  2026-10-06.*
- **Rule.** The frame's sentence *"Pragurile exacte sunt decizie de produs nefinalizată"* does not ship.
- **Why.** It "announces an unfinished product decision that has since been taken, and telling a
  customer a threshold is undecided is not copy".
- **Where.** `apps/web/tests/support/approved-romanian-messages.ts` (`compose`).

## Decision 4 — `noPresetNotice` keeps *"nu încape"*

- **Status of this one.** The comment states a *reason*; it does not mark it as an owner ruling. It is
  the comment's reading of why the earlier ruling (decision 2's related ruling) does not reach this leaf.
  Reason recorded as stated; not an owner ruling.
- **Rule.** `room.compose.noPresetNotice` (*"Niciun preset gata făcut nu încape aici. Compunem una pe
  măsura camerei tale — durează puțin mai mult."*) keeps *nu încape*.
- **Why.** "Not covered by either ruling": its subject is a ready-made preset fitting the room, not a
  cabinet being included in a composition, and *niciun preset… nu poate fi inclus* would be the wrong
  Romanian for what the sentence says.
- **Related, recorded.** [ADR 0131](0131-the-preset-story-is-deferred-past-m8-and-every-room-goes-from-its-dimensions-straight-to-composition.md)
  quotes the opening of the sentence and records that under an empty library the 1F notice is always
  true; it does not give this reasoning.
- **Where.** `apps/web/tests/support/approved-romanian-messages.ts` (`compose.noPresetNotice`).
