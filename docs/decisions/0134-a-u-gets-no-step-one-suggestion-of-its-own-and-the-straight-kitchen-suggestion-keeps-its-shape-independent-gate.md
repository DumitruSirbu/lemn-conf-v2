# ADR 0134 — A U gets no Step 1 suggestion of its own, and the straight-kitchen suggestion keeps its shape-independent gate

Status: Accepted (records a rule already shipped, with the owner's answer of 2026-09-30)
Date: 2026-09-30
Type: Finding + Decision (architect), recording an owner answer relayed by the coordinator
Milestone: M7B, wave U7 S4 (3) (`docs/milestones/M7B-u-shaped-rooms.md`, *U7 — the plan*, G11)

**Why this record exists.** The rule was written only in the M7B plan (*Owner questions*, *"Not
asked, recorded instead: no new 1C suggestion for a U"*). A plan is archived at the phase close, and
the durable reasoning must live here (`docs/WORKFLOW.md`, step 7). No behaviour changes with this
record. Source is read at `a75753f`. Labels: **[source-verified]**, **[doc-quoted]**.

## The rule

1. **A U gets no suggestion specific to the U.** At sub-state 1C, nothing proposes another U, a
   different wall C, or a U-only remedy.
2. **The straight-kitchen suggestion (*"a straight kitchen would fit"*) keeps its shape-independent
   gate, and a U passes through it like any shape.** The gate fires when both of these hold
   (`apps/web/src/room/room-issue-model.ts:135-137, 197-204`, [source-verified]):
   - at 1C, **at least one field or room reason exists**; and
   - **wall A and the height, taken alone, validate as a straight room** under the same policy
     (`validateRoomInput({ shape: "linear", wallAMm, heightMm }, policy).ok`).

   So a too-short U whose wall A and height would make a valid straight kitchen is offered one. A U
   refused only by its shape, with no reason to attach the suggestion to, is not offered one.

## The owner's answer

**2026-09-30, a relayed selection, not verbatim:** **"Yes, suggest straight (Recommended)"**. It
answers U6 S0's census row W23 and its flag 1, which asked whether a too-short U should also get the
straight-kitchen suggestion (M7B plan, *U6 S0 census*, W23 and *Flags for the coordinator* 1;
recorded at the *U6 close-out*). No production change followed. The shipped gate already behaves this
way.

## The tests that pin it [source-verified]

- `apps/web/tests/room/room-issue-model.test.ts`:
  - `:650`, *"suggests the straight kitchen for a too-short U, by the same shape-independent rule as
    the L"*: 2200/2000/2000, h 2500, a reason on `wallA`, `isLinearSuggested` true.
  - `:660`, *"suggests nothing for a U refused by its shape alone"*.
  - `:671`, the accepted-linear negative.
- `apps/web/tests/room/qa-m7b-u6-switch.adversarial.dom.test.ts` (U6 QA):
  - `:195-204`, *"the straight-kitchen suggestion on a U (W23, owner 2026-09-30)"*: shown for a U
    whose wall A is too short for a U but not for a straight room, and not shown when wall A is too
    short for a straight room as well;
  - `:167`, the suggestion's action lands on a straight room.

## Alternatives considered

- **No suggestion at all for a U.** Not chosen. The owner selected the opposite, and it would have
  added a shape condition to a gate that is deliberately shape-independent.
- **A U-specific suggestion** (for example *"a smaller U would fit"*). Not chosen. No owner question
  asked for it, and the approved policy's U floors (ADR 0108 H) leave no single remedy to propose.

## Consequences

- None to code. `validatesAsStraightRoom`'s doc comment (`room-issue-model.ts:194-195`, *"Never true
  under the approved policy; wave 7J owes the positive arm"*) is **stale**: 7J switched the positive
  arm on, and the tests above exercise it. It is left for the next change that touches the file, as
  a comment-only fix.
- **Related:** ADR 0116 (the screen asks the domain), ADR 0108 H (the U's bounds), and the M7B plan's
  U6 S0 census.
