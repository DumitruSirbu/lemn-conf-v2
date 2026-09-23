# ADR 0129 — A right-hand L is the left-hand design drawn in a reflection, and the reflection is a per-group primitive

Status: Proposed (accepted when wave 7I's plan is accepted)
Date: 2026-09-23
Type: Decision
Milestone: M7, wave 7I

## Context

Owner question Q6 asked whether a customer who chooses *La dreapta* should see **the mirror image**
of the left-hand kitchen — the same cabinets, the long run still on the back wall, the corner moved
to the right. **Answered 2026-09-11:** *"6. Yes mirror, plus this mirroring especially of corner
cabinet will help in building the U shape kitchens"* (M7 plan, *Owner questions*, Q6). The answer
was recorded only in the milestone file; [ADR 0108](0108-a-room-is-validated-against-policy-data-and-the-interim-policy-is-the-engines-own-limits.md)
decision 5 still calls it open. Step 1 already carries and draws the direction in 2D; the choice is
dropped where the validated input becomes a `DesignRoom`, so every stored design is left-hand today
(`validate-room.ts:129-134`, `design.ts:144-149`, read at `fb7c925`).

## Decision-record sweep

| Record | What it says | Effect |
| --- | --- | --- |
| ADR 0108 decision 5 | Direction carried, never read by validation; its effect is open (Q6). | **Q6 answered here.** "Never read by validation" stands; "carried" becomes true (decision 3). |
| ADR 0109 Amendment A2 | *"the domain is canonical and the mirror is presentation"*; direction is not a match criterion. | **Kept and relied on** (decision 1). |
| ADR 0111 decision 8 | A stored direction is an optional field whose absence is valid; no schema version. | **Exercised** (decision 2). |
| ADR 0053 | An optional key whose absence keeps its meaning needs no migration. | The argument decision 2 uses. |
| ADR 0110 Amendment I (I5.4) | A run reading the owner's order corner-outward in reverse is not A1 violated. | Holds in the reflection, which preserves corner-outward order. |
| ADR 0113 | New copy leaves enter the lock in their own wave. | Decision 8's new sentence. |
| ADR 0121 | A thing is identified by what it is. | Canonical mesh names (`wall_left`, `end_panel_right`) are not renamed. |

## Decision

1. **The domain is canonical.** Generation, commands, columns, the body probe and stored placements
   are those of the left-hand L. A right-hand design differs from its left twin only in
   `room.cornerDirection`.
2. **`room.cornerDirection` is optional, `"left" | "right"`, and the product writes it only for
   right.** Absent means left. One query, `cornerDirectionOf(room)`, is the only production reader.
   Left documents stay byte-identical; the byte cap does not move.
3. **`validateRoomInput` carries the direction onto the room it returns** and still never reads it.
4. **The adapter mirrors with one primitive, `applyCornerDirection(group, direction)`,** which sets
   the sign of the group's `scale.x`: a reflection in the group's own local X about its own origin.
   On the scene root that plane is world x = 0 (wall B's plane), which does not move when the room
   is resized. On one group — M7B's corner — it mirrors that group alone. It accepts only a `Group`,
   because `Line.raycast` scales its threshold by the Line's own scale (three 0.184.0, `Line.js:182`).
5. **Face winding is left to the renderer**, which flips the front face for a negative-determinant
   world matrix (`WebGLRenderer.js:1180`). No geometry, index or `material.side` changes.
6. **Cameras and the key and fill lights reflect with the scene; the environment map does not.**
7. **The probe measures in canonical space.** Kept in world space inside the stage's root only
   while wave 7I's invariance property holds for every catalogue body; otherwise it moves to
   room-local space by a recorded amendment, not by improvisation.
8. **Screen words follow the reflection.** The domain's `"right"` stays +along; the web resolves the
   word through the design's direction, and `panel.widthStepNote` gains its reflected sentence.
9. **Appliances are drawn mirrored** — the owner asked for the mirror image. In
   [ADR 0118](0118-a-problem-that-has-not-occurred-is-recorded-with-its-trigger-and-not-built-for.md)'s
   shape: **trigger** — the owner sees a right-hand kitchen and objects to a mirrored appliance.

## Alternatives considered

- **Mirror in the domain** (negated `alongMm`, a mirrored wall transform, or wall C). Rejected: it
  forks every rule keyed on +along across M2–M6, and whether a right corner becomes walls A + C is
  M7B's question, with a version-keyed migration arm if it does (M7 re-plan, *What U means for
  stored documents*).
- **Always write the direction.** Rejected: it changes every left document's bytes and gives no
  reader anything `cornerDirectionOf` does not.
- **Accept only `"right"`.** Rejected: it refuses a truthful document that says `"left"`.
- **Reflect about the room's centre line.** Rejected: the plane moves with every resize, a second
  authority on the room that 7H's in-place resize would have to keep in step.
- **Mirror the image, not the scene** (a negated projection or a CSS flip). Rejected: picking and
  orbit invert, and it cannot mirror one group, which the owner's answer asks for.
- **Reverse triangle winding or draw `DoubleSide`.** Rejected: the renderer already handles a
  reflected world matrix; the first doubles geometry, the second hides a real inside-out defect.

## Consequences

- ADR 0108 decision 5's *"an open owner question"* is answered by this record (pointer to be added
  there).
- 7E2's deferral in `roomHrefFromDesignRoom` is discharged; the URL parser is unchanged.
- An older build refuses a right-hand document (strict schema) — pre-launch, the same no-rollback
  note `DesignSettingsSchema.finish` carries; the first stored schema remains M8's.
- 7F3/7G, when they return, show a left preset's thumbnail mirrored for a right room (ADR 0109 A2).
- M7B builds a U's right-hand corner with decision 4's primitive on the corner group alone.
