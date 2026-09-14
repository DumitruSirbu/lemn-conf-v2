# ADR 0116 — A type that refuses to describe an undesigned shape is a guard, not friction, and the cast that witnesses the rule is confined to a test

Status: Accepted (**extends [ADR 0093](0093-a-rule-the-shipped-kitchen-cannot-exercise-owes-a-witness-not-a-moved-fixture.md)
decisions 1 and 2 into the case where the type system forbids constructing the witness; applies
[ADR 0084](0084-canfinish-is-the-load-seams-and-a-command-fixture-constructs-only-its-own-contracts-inputs.md)
decision 5; **overturns nothing**)
Date: 2026-09-14
Type: Decision (adjudication)
Milestone: M7 — ruled while planning wave 7F1, on a finding its slice 1 developer raised and confined
rather than deciding (`docs/milestones/M7-room-and-presets.md`, ruling R8)

## Context

Wave 7F1's criterion 3 requires that Step 1's *Continuă* is enabled exactly when the chosen room shape
is buildable, and proves it **adversarially**: rendered against a policy that states a second buildable
shape, that shape's control must enable **with no edit to the component**. The claim is not *"the L
works"* — it is *"the screen asks the domain rather than spelling a shape"*, which is what lets wave 7J
make straight kitchens live without touching `apps/web/src/room`.

The predicate shipped in slice 1 (`0ee5ca6`) is deliberately shape-agnostic:

```ts
export function isShapeBuildable(shape: RoomShape, policy: RoomPolicy): boolean {
  const statedShapes: Readonly<Partial<Record<RoomShape, unknown>>> = policy.buildableShapes;
  return statedShapes[shape] !== undefined;
}
```

**But `BuildableShapes` declares one optional member — `L?: LWallBounds`** — because
[ADR 0108](0108-a-room-is-validated-against-policy-data-and-the-interim-policy-is-the-engines-own-limits.md)
decision 8 states that only the L maps onto a `DesignRoom`, and Amendment B decision B2 rules that
*"straight and U-shaped rooms stay refused until their own waves put their bounds to the owner"*. So
**the witness the criterion requires cannot be constructed without a cast.** Slice 1's developer wrote
one, confined it to a single named helper with a comment, and reported it rather than deciding:

```ts
/** … `BuildableShapes` declares only the L today, so the fabricated key is … */
function policyAlsoStating(shape: RoomShape): RoomPolicy { … } as BuildableShapes
```

Wave 7F1's slice 4 meets the identical wall in `apps/web`. The choice was put as: repeat the cast in a
second package, or widen `BuildableShapes` to declare `linear?` now — on the ground that linear's
bounds are already owner-approved (ADR 0108 Amendment D; F1 verbatim, *"Yes, 1200–6300 mm"*), so the
type would not be a guess and only the **data** would wait for 7J.

**The widening was proposed by the coordinator and is refused here.** What decided it was not a
preference about casts but a fact about the code, read rather than assumed.

### Measured at `0ee5ca6`, not argued

- **`validateRoomInput` hardcodes the shape and would not follow a widened type.**
  `packages/configurator-domain/src/room/validate-room.ts:76` reads
  `if (input.shape !== "L" || lWallBounds === undefined)` and refuses everything else with a single
  `SHAPE_NOT_BUILDABLE`.
- **`isShapeBuildable` reads any key present**, naming no shape — the code quoted above.
- **So the two would disagree the moment the type allowed it.** Declaring `linear?` makes it
  *typechecked* to populate linear bounds in `APPROVED_ROOM_POLICY`; at that point `isShapeBuildable`
  reports the shape buildable, the card enables, and `validateRoomInput` still refuses the room.
- **`ENGINE_ROOM_LIMITS` has no linear entry**, although ADR 0108 Amendment D requires one —
  *"approved values inside the engine's derived linear limits"*. The guard those approved numbers are
  owed does not exist yet.

## Decision

### 1. A production type that cannot express an undesigned state is performing work, and is not removed to make a test convenient

> **When a type refuses to describe something the project has not designed yet, that refusal is a
> guard: it makes an inconsistent production state unreachable. It is widened by the wave that designs
> the thing, and by no earlier wave — least of all to spare a test a cast.**

The asymmetry is the whole argument, and it generalises past this instance:

- **A cast confined to a test cannot reach production.** Its blast radius is the file it is written in,
  and a reader meets it beside the comment explaining why.
- **A widened type invites a half-change into production.** It does not merely permit the inconsistent
  state; it makes reaching it the *typechecked, apparently-blessed* path, so the next person to add
  linear bounds in good faith ships a screen where the card enables and the room is then refused.

**"Only the data waits" was the attraction and it was false here**, in two ways. First, only the
*numbers* are owner-approved; the **structure** that holds them is not. F1 approved 1200–6300 mm and
said nothing about whether a one-wall policy carries a `minimumKitchen` block — the coupled
sink-and-hob rule is a **two-wall** rule (ADR 0108 Amendment C) and may well collapse into the 1200
minimum, but that is wave 7J's analysis and nobody has done it. Declaring the type now means designing
7J's policy record from the planning chair, which is exactly what Amendment B decision B2's *"Nothing
here guesses them"* forbids. Second, `ENGINE_ROOM_LIMITS` has no linear entry to guard the approved
values against, so the record the type would describe is not merely unwritten — it is not yet
derivable.

### 2. The cast is admissible because it restores the contract's own domain, not because tests are exempt

This is the distinction that keeps decision 1 from becoming a licence, and it is
[ADR 0084](0084-canfinish-is-the-load-seams-and-a-command-fixture-constructs-only-its-own-contracts-inputs.md)
decision 5 read one level up:

> A fixture may construct any input the unit's **own contract** is defined over, and may not construct
> one to borrow another module's guarantee.

`isShapeBuildable`'s contract is *"is this shape stated in this policy"* — defined over **every**
`RoomShape` and any policy. The **type** is narrower than that contract today, because the product has
only designed one shape's bounds. **The cast therefore does not evade the contract; it restores the
domain the contract is already defined over**, and the value it builds is an ordinary input to the rule
under test.

**A cast that reached past the unit's own contract would be refused by ADR 0084 decision 5 unchanged.**
Fabricating a policy whose `L` bounds are nonsense in order to make *another* module's guarantee appear
is the hood row's error, and nothing here relaxes it.

### 3. The cast is named, commented, counted, and carries the wave that deletes it

Three requirements, so a confined cast stays confined rather than becoming a habit:

- **One named helper per package**, never an inline `as` at an assertion site. Two exist:
  `packages/configurator-domain/tests/room/is-shape-buildable.test.ts` and slice 4's sibling in
  `apps/web`.
- **A comment at the helper** stating that the type declares fewer shapes than the contract covers,
  why, and citing this record — the same shape of note ADR 0084 decision 5 requires of an in-memory
  fixture.
- **A named discharge wave.** **Wave 7J widens `BuildableShapes`, `ENGINE_ROOM_LIMITS`,
  `APPROVED_ROOM_POLICY` and `validateRoomInput` together, and deletes both helpers in the same wave.**
  This is recorded on 7J's own row in the M7 plan, not only here.

**The deletion is the proof.** A widening that left either helper compiling would not have reached the
validator, so *the casts' absence is the evidence the four modules moved together* — a stronger guard
than the type change would have been, because it fails loudly rather than silently permitting a half
state.

### 4. This does not weaken the witness obligation; it is how the obligation is met when the type is in the way

[ADR 0093](0093-a-rule-the-shipped-kitchen-cannot-exercise-owes-a-witness-not-a-moved-fixture.md)
decision 1 requires that *"a ruled behaviour that the tree cannot distinguish from its own absence is
unshipped"*, and decision 2 requires the witness be **declared by the test** rather than obtained by
moving the shipped fixture. Criterion 3's fabricated policy is exactly that witness, and this record
changes neither duty.

**What ADR 0093 did not face is a witness the type system forbids constructing.** It assumed the
fixture was buildable and ruled only on where it should live. This record answers the next question —
*what if it cannot be built at all?* — and answers it **without** the two exits ADR 0093 already
closed: the witness is still not obtained by moving `APPROVED_ROOM_POLICY` (that would ship an
unapproved bound), and the rule is still not left un-witnessed on the grounds that it is derivable.

## Alternatives considered

- **Widen `BuildableShapes` to declare `linear?` now.** Proposed by the coordinator and **rejected** —
  decision 1. It makes an inconsistent production state typechecked while `validate-room.ts:76` still
  hardcodes the shape, and it designs 7J's policy record before 7J's analysis exists.
- **Widen `BuildableShapes` *and* fix `validateRoomInput` in the same change, inside wave 7F1.** This is
  the only widening that would not create the disagreement, and it is rejected as **wave 7J wearing a
  UI wave's clothes**: it needs the linear engine floor derived, the owner-approved bounds guarded
  against it, and a `DesignRoom` mapping for a one-wall room (ADR 0108 decision 8) — full-tier domain
  work inside a Light-tier screen wave, which `docs/WORKFLOW.md`'s scope discipline refuses.
- **Drop criterion 3's adversarial arm and assert only that the L continues.** Rejected: it is the arm
  that proves the screen asks the domain instead of spelling `L`, and without it 7J's *"changes nothing
  under `apps/web/src/room`"* contract has no test. That is ADR 0093 decision 1's *"unshipped, whatever
  the code says"*.
- **Make `isShapeBuildable` take a `readonly RoomShape[]` instead of a policy**, so any shape set is
  constructible without a cast. Rejected: it moves the *"which shapes are buildable"* question out of
  the policy the validator reads, creating the second authority ADR 0102 names — the two could then
  disagree in production, which is the very failure decision 1 refuses.
- **Suppress the cast with `@ts-expect-error` instead.** Rejected: it says *"this is wrong and I know"*
  where the truth is *"this is inside the contract and outside the type"*, and it goes red for the
  wrong reason the moment the type widens, rather than the helper simply becoming unnecessary.

## Decision-record sweep

| Record | What it says | How it is settled |
| --- | --- | --- |
| [0093](0093-a-rule-the-shipped-kitchen-cannot-exercise-owes-a-witness-not-a-moved-fixture.md) decisions 1, 2 | A rule the shipped fixture cannot exercise owes a witness, declared by the test rather than obtained by moving the fixture. | **Extended, not narrowed** — decision 4. It licenses and requires this witness; it did not face a witness the type forbids constructing, and that is the gap this record fills. |
| [0084](0084-canfinish-is-the-load-seams-and-a-command-fixture-constructs-only-its-own-contracts-inputs.md) decision 5 | A fixture constructs its own contract's inputs and may not borrow another module's guarantee. | **Applied unchanged** — decision 2. It is what makes this cast admissible and what would refuse a wider one. |
| [0102](0102-a-recorded-source-must-explain-its-depth-and-a-second-authority-in-a-test-is-the-defect-laundered.md) decision 2 | A test helper that re-computes a production quantity is a second authority and is refused. | **Not crossed, and named so nobody cites it against this.** `sourceExplainsTheDepth` **asserted a product fact** and stood as a rival authority to production code. The helper here **asserts nothing** — it builds an input and hands it to the rule under test, which remains the only authority. The two are different in kind, and conflating them would ban the witness ADR 0093 requires. |
| [0090](0090-a-frozen-space-slides-with-its-run-and-follows-the-body-it-recorded.md) decision 7 | An invariant edited to accommodate a defect is the defect laundered. | **Consistent, and it cuts toward this ruling.** Widening the type to make a test compile is the type-level form of exactly that edit; nothing in the criterion is weakened here. |
| [0108](0108-a-room-is-validated-against-policy-data-and-the-interim-policy-is-the-engines-own-limits.md) Amendment B decision B2 | *"Nothing here guesses them"*: each shape's wave proposes its own bounds and puts them to the owner. | **The authority for refusing the widening** — decision 1. A declared `linear?` member is a guess about the record's structure even when its numbers are approved. |
| ADR 0108 Amendment D | Linear's 1200–6300 mm is approved and *"enters `APPROVED_ROOM_POLICY` in wave 7J, not 7A2"*. | **Read as written — a statement about the data.** The coordinator's reading that the type could therefore move early is answered by decision 1: the guard the same amendment requires (*"inside the engine's derived linear limits"*) does not exist yet, so neither does the record's shape. |
| ADR 0108 decision 8 | Only the L maps onto a `DesignRoom`. | **Why `validateRoomInput` hardcodes the shape**, and therefore why a widened type would disagree with it. |
| `docs/WORKFLOW.md`, *Scope discipline* | Five production files; do not fold opportunistic work into a wave. | **Followed**: the alternative that would make the widening safe is 7J's whole domain change inside a Light UI wave. |

Nothing found in the sweep contradicts this record without being named above.

## Consequences

- **Two `as BuildableShapes` helpers exist across two packages for the length of M7**, deliberately and
  with a named discharge wave. They are not findings, and a reviewer meeting one should read decision 3
  rather than raise it.
- **Wave 7J gains a recorded obligation**: widen the four modules together and delete both helpers in
  the same wave. It is on 7J's row in the M7 plan so its implementer finds it without reading this
  record first.
- **Wave 7F1's criterion 3 keeps its adversarial arm**, which is what holds 7J to changing nothing
  under `apps/web/src/room`.
- **A general rule is now available to later waves**, and it will recur — M7B faces the same question
  for `U`, and any shape added after it will too: *the type widens in the wave that designs the shape,
  and the witness is cast until then.*
- **Nothing in production changes**, and no test that exists today is edited. This record describes a
  restraint, so its evidence is the absence of a diff.
