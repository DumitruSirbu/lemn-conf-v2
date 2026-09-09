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
8. ~~A body with `canFinish: false` is unaffected at both levels~~ — **superseded by Amendment B,
   2026-09-09**: such a body still cannot *choose* a colour, and `dropFinishFromBodiesThatCannotWearOne`
   still has nothing to do, but structural cabinetry now **follows** the kitchen's colour while
   appliances are never painted. Read B1 before relying on this line.
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

## Amendment A, 2026-09-08 — three facts adversarial QA established after the wave shipped

**Decisions 1-10 above stand and none is revised.** What follows is measured, not re-decided.

### 1. Decision 6 was not enforced at the write seam, and is now

The invariant decision 6 extends — *"no stored design holds a finish its material does not offer"* —
was implemented over `design.placements` only. `findUnofferedFinishIssues` never read
`settings.finish`, so the write seam **refused a colour on a cabinet and accepted the identical
colour on the kitchen**. Unreachable through this build's own commands (`setGlobalFinish` refuses,
`setMaterialTier` resets, `resolveOpeningChoice` drops) and reachable by a restored backup, a
hand-edited row or another client — the same threat model the per-placement check already existed
for. The load seam corrected it on the way out, so no stored row was ever lost.

Closed by `SETTINGS_WEAR_UNOFFERED_FINISH`, a second refusal code rather than a reuse of the first:
the path is one field on the document, not an index into `placements`, and a code named for a
placement cannot honestly carry a finding about neither.
`qa-6q-a-load-seam.adversarial.test.ts` pins the code count and demands a second finish code justify
itself; the justification is written where it asked for it.

### 2. Decision 7 creates a deliberate under-warn, and ADR 0086's stance now has an exception

A cabinet that **explicitly chose** the colour the kitchen already holds counts as **zero** in the
confirmation count. So a material change silently discards that override and shows the
*whole-kitchen* sentence rather than the cabinet one.

This is correct as designed and is not a defect: the visible outcome is identical — both land on the
new material's default — and the document still distinguishes "chose" from "follows" afterwards. It
is recorded because
[ADR 0086](0086-the-confirmation-counts-chosen-colours-and-only-a-different-declared-material-owes-one.md)
states a deliberate **over**-warn *"in the safe direction"*, and this is an exception to that stance
that no record carried. A future reader comparing the two records must not read the difference as
drift.

### 3. The scene gap is a wave, and the obvious fix is the one that must not be taken

Adversarial QA measured all five surfaces. Document, settings sheet, cabinet panel and pricing all
resolve. **The 3D scene does not**: a cabinet with no override of its own renders the kit's default
white, because `void-engine.ts:557` writes `finishKey` straight off `placement.body.finish` and
`three-adapter/src/scene-sync.ts:189` skips a record without one.

**Wiring `derivePlacementRecords` to the resolver is forbidden by decision 2 and was tried and
reverted.** `carriedAppearance` (`commands/insert-body.ts:326`) would then stamp the *resolved*
colour into `body.finish` on any insert and on the resize rebuild — silently converting "follows the
kitchen" into "chose this colour", after which a later global change leaves that cabinet behind.
The fix is a **draw-only** field on `PlacementRecord` that the renderer reads and no command writes.

**Closed 2026-09-08.** The field is `PlacementRecord.drawnFinish`, filled by `derivePlacementRecords`
from `resolvedFinishOf`; `finishKey` is untouched and still means the customer's choice and only
that, so `carriedAppearance` goes on copying an override and preserving absence. `commands/` was not
edited.

Three things the wave established, each by measurement:

- **The repaint signature was the trap.** `scene-sync.ts`'s `signBody` decides when to repaint, and
  it signed `finishKey`. Mutating **that one line alone** turns **13** adapter tests red, both
  repaint tests among them. Every single-sync assertion in the suite passes with the bug in place,
  because paint happens at mount and a first mount always happens — only two syncs against one root
  can see it.
- **The forbidden fix was demonstrated, not assumed.** Writing the resolved colour into `finishKey`
  turns the shuffled-command property red with a counterexample:
  `[["depth","colour","remove","resize","insert"], {"kind":"palette-entry","entryId":"pal.alb"}]`.
- **One acceptance criterion was vacuous and is now witnessed.** "A cabinet that chose nothing renders
  the material's default" stayed green on melamine with the defect in place, because melamine's
  declared default (*Alb*, `#eceeeb`) is the exact hex M1 gives `kit.M.door`. A veneer witness
  (`#cba173`) was added, where the two differ.

**The store seam is proved separately**, because neither package could reach it: nothing in
`packages/three-adapter` or `packages/configurator-domain` can answer *"does the store re-derive its
records when the kitchen's colour changes?"*, and a "no" there would leave `drawnFinish` correct in a
fresh render and stale in the running app with every test still green.
`apps/web/tests/store/the-kitchens-colour-reaches-the-records.test.ts` closes it through
`applyWholeKitchenSettings`, and is proved red by reverting `derivePlacementRecords` to read
`placement.body.finish`.

**Still owed:** a browser pass. The chain is exercised end-to-end in the adapter tests through the
real `derivePlacementRecords`, but no Playwright run has confirmed the on-screen claim.

## Amendment B, 2026-09-09 — a body that cannot choose a colour may still follow the kitchen's

**Ruled by the owner on 2026-09-09, after seeing it in a browser.** With a kitchen colour applied,
the structural corner base rendered white between Antracit neighbours — a white door with a handle in
a dark kitchen. It is exactly what this record specified, and it reads on screen like a body that
failed to repaint: the verifying agent chased it as a defect before checking the record
(`testing-reports/vis6z-2026-09-09/`, `docs/backlog/open.md` entry 60).

> **"Structural cabinetry follows the kitchen, appliances never do"** — and, on the open shelf,
> *"open shelves can have and by default should inherit global set color"*, with *"fridge no, hood
> also no"*.

### B1. Acceptance criterion 8 is superseded

> ~~8. A body with `canFinish: false` is unaffected at both levels~~

`canFinish: false` was one flag carrying two different facts, and the ruling splits them. It now
answers **only** *may this body's document carry a colour of its own* — and the answer is still no
for all seven bodies, because a following body **follows; it does not choose**. What moved is *what
colour the body is drawn in*, which is a different question and now has its own declaration.

**Decision 8's control is unchanged**: none of these bodies gains a "follow the kitchen's colour"
control, because none of them can leave the kitchen's colour in the first place.

### B2. The declaration, and why it sits beside `canFinish` rather than replacing it

`BodyFinishRule` (`packages/configurator-domain/src/body-finish-rule.ts`) — `chooses-its-own-colour`,
`follows-the-kitchens-colour`, `is-never-painted` — resolved through `bodyFinishRuleOf` in
`cabinetDepthRuleOf`'s shape, **failing closed twice**: an entry declaring nothing is refused, and so
is one where the two declarations contradict (a body chooses its own colour **iff** it can be
finished). `refuseUndeclaredFinishRules` sweeps both populations inside `buildKitchenLBodyCatalog`.

Keeping `canFinish: false` on a following body is what makes decision 2 **structural rather than
checked**: nothing can write `finish` onto a body that cannot choose one, so `"finish" in body` stays
false by construction and not by a guard a later wave could delete.

The single authority on what is drawn is `drawnFinishOf` (`resolved-finish.ts`). Its
`is-never-painted` arm returns `undefined`, so the record carries **no** `drawnFinish` field at all
and the adapter has nothing to paint. The switch has no `default`, so a fourth rule is a compile
error rather than a body that silently starts or stops being painted; and the arm ignores
`placement.body.finish`, so a colour reaching an appliance's document from a restored backup or
another client is still not drawn. That is the protection `scene-sync.ts`'s deleted `canFinish` guard
used to give, **moved into the domain beside the declaration rather than dropped**.

### B3. Who declares what, and it is seven bodies rather than the two this record implied

| Entry | Rule |
| --- | --- |
| `STRUCTURAL_CORNER` — `base-corner-x-900`, `base-corner-return-320`, `wall-corner-return-570`, `wall-corner-return-570-top` | follows the kitchen |
| `open-shelf-600`, `open-shelf` | follows the kitchen |
| `hood-600`, `hood`, `fridge-free-700`, `fridge-free` | is never painted |
| every ordinary body | chooses its own |

The seeded kitchen holds **four** corner bodies, not two, and `STRUCTURAL_CORNER` declares them as
one shape. Applying the ruling to all four is the owner's own words read as a rule about kinds rather
than a list — confirmed 2026-09-09.

### B4. Following is not the same as being visible, and the difference was measured

`applyBodyFinish` paints declared surfaces and nothing else, so **a declaration flip alone can be a
no-op on screen**. Every body's rendered colour was read off the built object, before and after:

| Body | On screen |
| --- | --- |
| `base-corner-x-900`, `wall-corner-return-570`, `-570-top` | `door_front` `#eceeeb` → `#2b2d30` |
| `open-shelf-600` | six boards → `#2b2d30`; `back_panel` unchanged |
| `base-corner-return-320` | nothing, **and nothing is owed** — see B6 |
| `hood-600`, `fridge-free-700` | nothing, correctly |

### B5. The shelf's surfaces are declared by the builder that makes them

The owner ruled the six boards take the colour and the tiled `back_panel` does not, and that the
shelf takes **whatever the kitchen has** — a flat palette colour or a wood decor alike, with the
material's default when the kitchen has none. One rule; the "follow only a decor, else stay oak"
alternative was put to them and rejected because it would make this the one body obeying a rule of
its own.

**`FRONT_MESH_NAME` was deliberately not widened.** `isFrontMesh` is the adapter's single definition
of a front; `cabinet-handle-meshes.ts` asks it from the other side and `kitchen-stage.tsx` repaints
the whole room through `collectFronts`. Widening it would have changed which meshes count as a
handle's parent and what a whole-room repaint touches — and a census found `side_left`, `side_right`
and `back_panel` are also built by the dishwasher, the 800 sink and the oven tower, so a
`side_|shelf_` regex would have painted four other bodies' carcass interiors. Applying that widening
anyway turns **26 adapter tests red across five files**.

The shape taken instead is `wearsTheBodysFinish` (`body-finish-surfaces.ts`), marked by the builder
that makes the mesh, with `applyBodyFinish` painting fronts **plus** declared surfaces. `openShelf`
wrapping its six boards and leaving the back panel bare **is** the ruling, written where the geometry
is.

### B6. ~~`base-corner-return-320` is a conclusion, not a deferral~~ — **WRONG, see Amendment C2**

It builds three meshes — `plinth`, `carcass`, `countertop` — and has no front and no outward face of
its own. Its only cabinetry surface is the carcass, which is the box **interior** every cabinet in
the kit shares, and no body is painted there at any colour. There is nothing to give it that would
not also recolour the inside of every other cabinet, and it stands in the corner where almost none of
it is visible. Its following is real in the document and in the record; there is simply nothing
outward to show. **It is not to be reopened as a bug**, and
`qa-0099c-each-unchoosing-body-by-name.adversarial.test.ts` pins it by name.

### B7. Still owed

A **browser pass**. Every claim above is measured off the built object — colour per mesh, per body,
across three kitchens including a wood decor and a colourless veneer — which is strong evidence and
is not a rendered frame. Amendment A's own "still owed" line is unchanged and this joins it.

## Amendment C, 2026-09-09 — the corner cabinets choose a colour, and their carcass is an outward face

**Ruled by the owner after seeing it**, on a kitchen wearing `Stejar Halifax Natur`: a white slab
between the oven tower and the sink run, and a white door at the base corner, in a room that was
otherwise wood.

> *"the corner cabinets thar column specifically miss custom color setting - need to add it and to
> support setting custom color for all corner cabinets parts"*

### C1. Amendment B's decision on `canFinish` is reversed for the four structural corners

Amendment B held that these bodies **follow** the kitchen's colour and cannot **choose** one. The
owner has now asked for both. `STRUCTURAL_CORNER` takes `canFinish: true` and
`CHOOSES_ITS_OWN_COLOUR` in a single edit — the contradiction guard `bodyFinishRuleOf` refuses a
half-state where the two disagree — and that one arm delivers the whole ruling: a corner with no
`finish` of its own renders the kitchen's colour, and one with a chosen finish renders that. §9's
*Finisaj* section appears for a corner as it does for any other cabinet.

**§13.1 is untouched.** A corner still cannot be replaced, deleted or resized, and the
`CORP STRUCTURAL` notice stands. Colour is a separate capability from replaceability, and only
colour was asked for.

### C2. Amendment B6 was wrong, and measurably so

B6 concluded that `base-corner-return-320` owed nothing because *"its only cabinetry surface is the
carcass, which is the box interior every cabinet in the kit shares"*. Measured, that is false of this
body: it declares `fronts: NO_OPENING_FRONTS` — the one seeded base with **no door at all** — so
nothing stands in front of that box and its entire 320 × 720 front face is what the customer looks
at, in the same plane its neighbours' doors occupy.

B6's second premise was that painting it would require widening `FRONT_MESH_NAME`, which B5 rightly
refuses. **B5 of the same amendment had already introduced the tool that makes this contained**: a
per-mesh `wearsTheBodysFinish` declaration made by the builder. Marking that carcass paints that box
and nothing else.

B6's third premise — *"it stands in the corner where almost none of it is visible"* — was falsified
by the owner looking at it.

### C3. A flag alone paints nothing, and that is the half a declaration cannot deliver

`applyBodyFinish` reaches fronts and declared surfaces. All four corner bodies' carcasses were
neither, which is why this morning's `FOLLOWS_THE_KITCHENS_COLOUR` correctly repainted their **doors**
and left their **boxes** white. The four now declare their carcass:

| body | carcass under a kitchen colour | fittings |
| --- | --- | --- |
| `base-corner-x-900` | painted | `susan_pole`, `susan_tray` ×2 keep their own materials |
| `base-corner-return-320` | painted | — |
| `wall-corner-return-570` | shell painted | `carcass_back`, `front_liner` untouched |
| `wall-corner-return-570-top` | shell painted | as above |

The wall returns are declared in `decomposed-bodies.ts` rather than inside `wallCabinet`, which
builds seven seeded bodies and would have painted the whole wall run; only the decomposed path knows
a `wallCabinet(0.57, 1)` is a corner. The helper **throws** when its named mesh is absent, so a
rename fails loudly instead of silently un-painting a corner.

**These carcasses now change on _every_ kitchen, including one where the customer has chosen
nothing, and that is intended rather than a side effect.** A corner is `CHOOSES_ITS_OWN_COLOUR`, so
`drawnFinishOf` falls through to the design default and then to the material's `defaultFinish` —
never `undefined` on a declared material. `applyRecordedAppearance`'s `if (record.drawnFinish)` is
therefore always taken, and the carcass moves off the material its builder gave it even in the
default state:

| | before | after (default state, `pal.alb`) |
| --- | --- | --- |
| material | `mat("carcass_white", …)` | a clone of `phys("door_matte_white", …)` |
| colour | `#d9d8d3` | `#eceeeb` |
| finish | `roughness: 0.78` | the door material's |

**It is the correction the owner asked for**, not a regression: the white slab they photographed was
this box sitting at carcass grey beside doors it is coplanar with. It is written down because it is
a visible change to every existing design, it reaches the *sheen* and not only the hue, and nothing
else in this amendment says so. C6's browser pass is where it gets confirmed by eye.

### C4. The blind corner was held bare for an hour on a false premise, and the arc is recorded

`base-corner-x-900` was excluded on the coordinator's instruction, on the worry that its box is open
behind its door and painting it would recolour an interior the customer sees. **Two independent
measurements found that wrong**: the carcass is a solid `box(0.9, 0.72, 0.6)` with no cavity;
`susan_pole` and both `susan_tray`s sit at z = −0.010, buried inside a volume spanning
z ∈ [−0.30, +0.30] and visible from no camera; and **this kit has no open-door state at all** —
nothing in `scene-sync.ts` or the stage animates or hides a `door_front`.

So the two base legs differ in **how much** of the box is uncovered — 620 of 900 mm against all of
it — and not in whether any of it is interior. The hold is recorded where the geometry is, because a
reversal with no reason in the file reads as somebody changing their mind about a test.

### C5. What is asserted

`packages/three-adapter/tests/the-corner-wears-a-colour.test.ts` names all four bodies, on exact
hexes, at three states — no colour resolving, the kitchen's colour, and a colour chosen for that
corner — and pins the boundary in the same scene that paints the carcass, so the fittings staying
pale is a boundary rather than an unpainted room. Removing the wrapper from one leg turns **8** cases
red; wrongly wrapping a `susan_tray` turns **2** red.

`qa-0099c-each-unchoosing-body-by-name.adversarial.test.ts`'s *"is the only structural body in that
state"* is re-pointed, not deleted: it now asserts the class is **empty** and that
`base-corner-return-320` has left the `canFinish: false` population **by name**, so the emptiness is
a statement about that body rather than a filter that quietly stopped matching.

### C6. Still owed

A **browser pass**. Every claim here is measured off the built object; none of it is a rendered
frame. This joins Amendment B7's own outstanding line. It owes one judgement beyond the hexes: that
C3's default-state repaint — carcass grey to door white, on every kitchen — reads as the fix the
owner asked for on a design where no colour was ever chosen.
