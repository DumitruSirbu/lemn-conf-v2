# ADR 0099 — A colour is chosen at two levels, the cabinet's wins, and a global change can never overwrite one

Status: Accepted
Date: 2026-09-07
Type: Decision
Milestone: M6 — closes owner manual-feedback item 6

## Context

The owner asked for a colour control in the global settings sheet, 2026-09-07:

> "Colour selector or colour options, same as we have on clicking on the cabinet and opening the
> cabinet settings. So in the same way. Just behind the material. And if you choose another material,
> to be able to select also a colour based on the material."

and, in the original report, the constraint that shapes the whole record:

> "top priority is cabinet level and higher priority is general setting level"

Three requirements: **reuse the existing per-cabinet control**, place it **after the material group**,
and offer **colours that are a function of the chosen material**. Plus the precedence rule.

### The sweep of earlier records, done before deciding

**No earlier record rules on a global default colour.** Five constrain the answer and each is settled
here rather than left for a reader to reconcile.

- **[ADR 0071](0071-material-carries-price-colour-carries-a-different-control-per-material.md)
  decision 1** — colour never affects price, for any material. Settled: **this feature moves no
  price**, which is why it needs no price-book work and no `TierGroupView`.
- **ADR 0071 decision 3** — the control's shape differs per material: a decor list for PAL, a RAL
  picker for MDF, two wood swatches for veneer, declared as `ColourControl` and *"three different
  controls reading one setting, not one control with three option sets."* Settled: the global control
  is the **same** declaration read by a second surface, never a second implementation. This is
  literally the owner's "same as we have on clicking on the cabinet".
- **[ADR 0057](0057-a-material-change-resets-an-unavailable-finish.md) decision 2** — *"applying a
  material resets every cabinet whose finish the new material does not offer, to that material's
  default."* **This is an existing ruling in which a global change *does* overwrite a cabinet-level
  choice**, and it looks like the opposite of what the owner just asked for. It is not overturned.
  Decision 3 below draws the line: a global **material** change may reset a cabinet colour, with
  confirmation; a global **colour** change never may.
- **[ADR 0081](0081-a-material-change-confirms-only-when-a-chosen-colour-would-be-lost.md)** and
  **[ADR 0086](0086-the-confirmation-counts-chosen-colours-and-only-a-different-declared-material-owes-one.md)**
  — that reset is gated by a blocking confirmation, owed only when the target is a *different declared
  material* and `chosenColourCount > 0`. Settled: the count's **comparison base moves**, and that is a
  real amendment to ADR 0086 decision 3, recorded as decision 7.
- **[ADR 0078](0078-a-materials-offer-is-its-controls-shape-and-the-load-seam-resolves-before-it-validates.md)
  decision 5** — an absent finish is a legal state and has chosen nothing. Settled: it is the
  mechanism this whole record stands on, and it already ships.

### The mechanism already exists, which is why this is cheap

`packages/configurator-domain/src/design.ts:69` — `finish` on a placement's body is **optional**, and
`chosen-finishes.ts` reads absence as "nothing was chosen". The two-level structure the owner
describes is already the model. What is missing is a **settable middle level**.

## Decision

**1. Three levels, one resolution order, one reader.**

```
placement.body.finish            the cabinet's own choice — highest priority
  ?? design.settings.finish      the new whole-kitchen default
  ?? material.defaultFinish      the declared fallback, unchanged
```

The owner's *"top priority is cabinet level and higher priority is general setting level"* is exactly
this order.

**`resolvedFinishOf(placement, design)` in the domain is the only authority on it.** No surface, no
adapter and no second query re-derives it. `packages/three-adapter` reads the resolver's answer —
`finishes.ts` already takes a resolved finish and must not learn the precedence rule.

**2. `setGlobalFinish` writes exactly one field, and is structurally incapable of writing any other.**

This is the owner's warning as an architectural constraint rather than as care. The command takes the
design and a finish, and returns a design differing only in `settings.finish`. It does **not** take
the placements, iterate them, or hold a placement identifier — so no implementation of it, and no
later edit to it, can reach `placement.body.finish`. A command that *could* stamp every cabinet and
merely chooses not to is a defect waiting for a refactor.

**A global colour change therefore writes nothing to any cabinet, ever.** Cabinets with no override
follow because they were following all along; the document does not grow a single `finish` key.

**3. The line between this record and ADR 0057 decision 2, stated so neither reads as overturning the
other.**

> **A global *material* change may reset a cabinet's colour, once, with a blocking confirmation
> (ADR 0057 decision 2, ADR 0081). A global *colour* change never touches a cabinet's colour, under
> any circumstance, and owes no confirmation.**

The two are different operations with different consequences and they are allowed to differ. What
ADR 0057 protects is an invariant — *no stored design may hold a finish its material does not offer*
— and a colour change cannot violate it, because decision 4 only ever offers colours the current
material makes.

**4. The offered colours are a function of the material, and of the *pending* material inside the
sheet.**

`materialOffersFinish` and `ColourControl` already declare what a material offers; the global control
reads them for the design's material, exactly as the cabinet editor does for the same material.

**The subtlety the owner's wording creates, and it must not be left to an implementer:** inside the
settings sheet the customer can change the material and the colour before pressing *Aplică*, and one
Apply is one transaction (M6-AUD-004, closed by wave W2). So the colour group's options are derived
from the **pending** material choice, not the applied one, and re-derive when the material radio
changes. A pending colour the newly-pending material does not offer is **dropped in the sheet, before
Apply** — it is a value the customer can still see and re-choose — rather than being committed and
then reset by a command.

**5. The five cases, ruled.**

| Case | Behaviour |
| --- | --- |
| **Global colour changed, cabinet has no override** | The cabinet renders the new global colour. **No write to `body.finish`.** |
| **Global colour changed, cabinet has an override** | The override stands, byte-identical. Guaranteed by decision 2's shape, not by a check. |
| **A cabinet's override is cleared** | The cabinet falls back to `settings.finish`, then to `material.defaultFinish`. Clearing **deletes the key**; it must never write the current global value into it, or the cabinet silently stops following future global changes. |
| **A new cabinet inserted after a global change** | It carries no `finish` and therefore renders the global default. `insertBody` needs no colour argument and **must not acquire one**. |
| **Material changed, and the chosen colour is not offered by the new material** | Decision 6. |

**6. A material change re-resolves *both* levels, once, and the global level is not exempt.**

ADR 0057's invariant is *no stored design may hold a finish its material does not offer*. It now has
to cover `settings.finish` as well as every `body.finish`.

- **If the new material does not offer `settings.finish`, it resets to the new material's
  `defaultFinish`** — in the same command, **once**, not per cabinet.
- Cabinet-level resets are ADR 0057 decision 2's, unchanged.

**This case is not an edge case; under a change between two different declared materials it is the
only case.** ADR 0078 decision 1 makes the three materials' offers **disjoint** — PAL offers palette
entries, veneer offers different palette entries, MDF's RAL picker offers only free colours — so *no*
finish survives a change to a different declared material. A global colour will therefore be reset by
every such change, and the reset is a certainty rather than a risk. Say so in the copy rather than
implying it might happen.

**A material change that resolves to the *same* declared material resets nothing at either level**,
which is ADR 0086 decision 3's rule applied unchanged.

**7. The confirmation's comparison base moves — an amendment to ADR 0086 decision 3 and to
`countCabinetsWearingAChosenFinish`.**

`chosen-finishes.ts` today compares each carried finish against `material.defaultFinish`. Once a
global default exists, *"a chosen colour that would be lost"* must be measured against the
**resolved** default — the global one where it is set, the material's where it is not.

Left alone, the confirmation fires for cabinets that merely match the kitchen's own colour, which is
the interruption ADR 0081 exists to avoid. So:

> **`materialResetConfirm` is present if and only if** the pending choice names a **declared**
> material, that material is **not** the declared material the design is already on, and the number
> of cabinets whose finish differs from the design's **resolved** default is above zero — **or**
> `settings.finish` itself is set and the new material does not offer it.

The second arm is new and is owed: a design where every cabinet follows a global colour has
`chosenColourCount = 0` under the amended base, yet a material change still discards a colour
somebody chose. Without that arm the product would silently lose exactly the choice this feature
adds.

ADR 0086 decision 1's inequality and its three preconditions are unaffected in form; its
`chosenCount` term is now counted against the resolved default, and the wave re-runs its property
with the generator extended over designs that carry `settings.finish`.

**8. The cabinet editor gains a "follow the kitchen's colour" control, and that is part of this
decision rather than UI polish.**

Today the editor offers only "pick a colour". Without a way back to absence, **the first tap on any
swatch pins that cabinet out of the global default for ever** — the precedence becomes a one-way
door, and the owner would report that next. The control writes nothing; it deletes the key.

**9. Placement: after the material group, before hardware, as its own group shape.**

The owner said "just behind the material" and that is the order. It is **not** a `TierGroupView`:
that shape is defined by a price delta and an anchor, and colour has neither (ADR 0071 decision 1).
It is a fourth group in the shape `DepthGroupView` already uses — a group that shows no price and
says why — and it renders the per-cabinet `FinishSectionView` with the material's declared
`ColourControl`, carrying the same `data-finish-control` attribute so a browser test can tell a
picker from swatches without counting buttons.

**10. No migration and no schema-version bump, measured rather than assumed — but one rollback
hazard.**

`DesignSettingsSchema` is an object whose keys are optional (`design.ts:169-182`). A document written
without `finish` is not a legacy document; it is a design that has chosen no global colour, and it
loads exactly as it does today. `settings` is described in its own comment as *"designed for three
settings and built with two"* — a fourth key is what the container is for. This is ADR 0053's and
ADR 0044's reasoning, unchanged.

**The hazard is backward, not forward.** `DesignSettingsSchema` is a `strictObject`. Once documents
carrying `settings.finish` exist, **a rollback to a build without the key turns every one of them
into a `DESIGN_UNREADABLE` 500 on load.** Forward compatibility is fine — Vercel deploys server and
client together, and an old client simply omits the key. **The wave's close-out must state the
no-rollback window explicitly**, because it is the first field in this document whose absence is
safe and whose presence is not.

**11. Acceptance criteria — the load-bearing part of this record, because the blast radius of getting
it wrong is a customer's per-cabinet choices.**

1. **Property, `fast-check`, over a random design and a random legal global colour:** after
   `setGlobalFinish`, for every placement that carried a `finish` before, the `finish` is
   byte-identical after. Over placement counts 0…MAX and over all three materials' palettes. This is
   the owner's warning as an executable statement.
2. For every placement that carried **no** `finish`: `resolvedFinishOf` returns the new global
   colour, **and the placement still carries no `finish`** — the document did not grow.
3. Clearing a cabinet's override makes that cabinet track **two subsequent** global changes, not one.
   One is satisfiable by writing the current global value into the key.
4. `insertBody` after a global change produces a body carrying no `finish` that resolves to the
   global colour.
5. A material change to a different declared material resets `settings.finish` to the new material's
   default **exactly once**, and every cabinet override per ADR 0057 decision 2. A change resolving
   to the same declared material resets neither.
6. **The amended confirmation, both arms:** a design where every cabinet matches the global colour
   and none matches `material.defaultFinish` owes **no** confirmation for the cabinets — and **does**
   owe one because `settings.finish` would be lost. Both halves asserted separately, so an
   implementation that got the base right and dropped the new arm fails.
7. In the sheet: changing the material radio re-derives the colour options from the **pending**
   material, and a pending colour the new material does not offer is cleared before Apply. Pressing
   *Renunță* after any sequence of material and colour presses leaves the stored document
   byte-identical to the one the sheet opened on (wave W2's existing property, extended).
8. A body with `canFinish: false` is unaffected at both levels, and
   `dropFinishFromBodiesThatCannotWearOne` still has nothing to do.
9. **Every pricing total in the existing suite is unchanged**, at both levels of colour (ADR 0071
   decision 1).
10. Round trip: a document saved with `settings.finish`, loaded and saved again is byte-identical.

## Alternatives considered

- **A global colour change stamps `settings.finish` onto every cabinet with no override.** Rejected
  outright: it converts every following cabinet into an overriding one, so the *second* global change
  moves nothing and the customer concludes the control is broken. It is also the shape that makes
  decision 2's structural guarantee impossible.
- **One level: make the global colour the only colour and drop the per-cabinet override.** Rejected —
  it is the opposite of the owner's stated priority and would discard a shipped feature.
- **Reset a cabinet's override when the global colour changes, with a confirmation, mirroring
  ADR 0057 decision 2.** Rejected. The material case earns its reset because leaving the override
  would violate an invariant; the colour case has no invariant to protect, so a reset there is pure
  loss. This is the distinction decision 3 records.
- **Offer every finish at the global level regardless of material**, and let the material change sort
  it out. Rejected by the owner's own wording ("based on the material") and by ADR 0071 decision 3 —
  a control whose shape does not follow the material is a fourth control nobody declared.
- **Leave `countCabinetsWearingAChosenFinish` alone and accept the extra confirmations.** Rejected:
  it would fire on precisely the designs this feature is for, which is ADR 0081's failure mode
  reintroduced by the feature that made it likelier.
- **A new schema version for `settings.finish`.** Rejected by measurement — the field is optional and
  additive, exactly ADR 0053's case. The rollback hazard is real but it is a deployment note, not a
  migration.

## Consequences

- **Module boundaries, in order.** `packages/configurator-domain` — `settings.finish` on
  `DesignSettingsSchema`, `resolvedFinishOf`, `setGlobalFinish` in
  `commands/set-whole-kitchen-settings.ts`, the ADR 0057 re-resolve at the global level, and
  `chosen-finishes.ts`'s comparison base. `packages/three-adapter` — reads the resolver's answer and
  learns nothing. `apps/web` — the colour group after the material group, and the "follow the
  kitchen's colour" control in the cabinet editor.
- **No price moves anywhere**, so the price book, the runtime parser and the dashboard seam
  (ADR 0062 seam 1) are untouched.
- **ADR 0086 decision 3 is amended in place** and pointed here; its decisions 1 and 2 stand. ADR 0057
  decision 2 is **not** amended and is confirmed as still standing — the record says so explicitly so
  nobody later reads this feature as having overturned it.
- **The wave must ship all three of the domain resolver, the global control and the "follow the
  kitchen's colour" control together.** Any two without the third leaves the precedence a one-way
  door or an unreadable rule.
- **The no-rollback window is a release note**, owed at the wave's close-out.
- **A fourth material would extend the sweep and change nothing else**, because every rule above is
  written against `ColourControl` and `materialOffersFinish` rather than against three named
  materials — with one exception worth flagging: decision 6's *"no finish survives a change between
  declared materials"* holds only while the offers stay disjoint (ADR 0078 decision 1). A fourth
  material sharing a decor with an existing one makes that a case rather than a certainty.
