# ADR 0081 — A material change confirms before it wipes a chosen colour, and says nothing when nothing was chosen

Status: Accepted
Date: 2026-09-05
Type: Decision
Milestone: M6 — amends [ADR 0057](0057-a-material-change-resets-an-unavailable-finish.md) decision 3;
adds wave 6Q-c

## Context

[ADR 0057](0057-a-material-change-resets-an-unavailable-finish.md) decision 3 (2026-09-02) rules
that the reset's consequence **is shown before the apply, on both viewports** — read, when it was
written, as a sentence in the settings sheet standing beside the sheet's own apply action. Wave 6Q's
plan carries that reading: `ro.globalSettings.materialWarning` gains a finish clause, *"static, not
conditional, and carrying no count"*.

[ADR 0078](0078-a-materials-offer-is-its-controls-shape-and-the-load-seam-resolves-before-it-validates.md)
closed with an owner question it deliberately did not answer: **should a PAL → MDF change carry the
colour over**, now that wave 6R will publish an exact swatch hex per decor and the substitution would
no longer need an unauditable authored table?

**The owner answered on 2026-09-05, and went further than the question asked.** In substance:

> *"Instead of carry over the colours and trying to make an algorithm of mapping these colours
> between different materials, I will go with just checking if there are different colours compared
> to default for each cabinet."*

> *"Maybe when switching the material, we can show like a confirmation modal with the warning that
> switching will wipe out all the preselected colours, just to make sure that the user understands
> that changing the material automatically resets the colour. We inform, and if he agrees, we change.
> If this is already the default colour… we don't show this warning. It's additional work, but I will
> go with it — I think this is easier and more user-experience oriented."*

Two things follow, and only the second is new. The carry-over is **refused** — ADR 0078's raised
question is closed, ADR 0057's rejection of nearest-finish mapping and ADR 0078 decision 4's
prohibition on constructing a free colour from a decor's swatch both stand, **reaffirmed by the
owner rather than merely un-revisited**. What changes is the warning: from an always-present sentence
to a **conditional, blocking confirmation**, whose condition is a per-cabinet comparison against the
material's declared default.

This record rules it, because it narrows a recorded decision. Under ADR 0057 decision 3 every
material change was preceded by a stated consequence. Under this ruling **some are not** — and the
cases that are not include a whole-kitchen repaint (see *A consequence the owner may not have
weighed*). A decision record is owed for that, not a milestone edit.

## Decision

**1. The confirmation is conditional on a chosen colour existing, and the condition is one domain
query.**

`countCabinetsWearingAChosenFinish(design: Design): number`, in its own module
(`packages/configurator-domain/src/chosen-finishes.ts`). It returns a count and changes nothing.
The surface asks whether the answer is greater than zero; it does not walk placements, and it does
not know what "chosen" means. This is wave 6Q's own first criterion — *"the offer is one domain
query; the panel renders its result and decides nothing"* — applied to the second query the same
rule needs.

**A cabinet is counted when, and only when, all three hold:**

| | Rule | Why it is stated rather than assumed |
| --- | --- | --- |
| a | Its `body.finish` is **present** | Absence is a legal state (ADR 0078 decision 5). A body wearing no finish has chosen nothing, so it is not counted — even though the material change is exactly as visible on it. |
| b | The design's material is **declared**, or it is not | An undeclared `materialTierId` declares no default, so nothing is comparable. **Every carried finish is then counted.** The query never throws (ADR 0078 decision 3); it uses 6Q-a's total lookup. |
| c | The finish **differs** from `materialById(...).defaultFinish` under `sameFinish` | One equality for finishes, the one `materials.ts` already publishes. |

The design's material is `design.settings?.materialTierId ?? DEFAULT_MATERIAL_ID`, which is the same
resolution the pricing and the reset use.

**"Differs from default", per control shape, is not three rules — it is `sameFinish` against three
declared defaults:**

| `ColourControl.shape` | Declared default | Counted as chosen |
| --- | --- | --- |
| `decor-list` (PAL) | `paletteFinish("pal.alb")` | any other palette entry; **and any free colour**, since a free colour is never `sameFinish` as a palette entry |
| `wood-swatches` (veneer) | `paletteFinish("veneer.stejar")` | `veneer.nuc`, any other palette entry, and any free colour |
| `ral-picker` (MDF) | `freeColourFinish("#eceeeb")` | any free colour whose `value` is not the identical string; **and any palette entry** |

**No case-folding, and no second equality.** `sameFinish` compares a free colour's `value` by string
equality, and `FREE_COLOUR_PATTERN` admits both cases, so `#ECEEEB` on an MDF kitchen **is counted
as chosen** and does confirm. That is deliberate: inventing a case-insensitive comparison here would
put a second finish equality in the product beside `sameFinish`, and the two would drift. The
direction of the error is the safe one — it over-warns, never under-warns. Wave 6R's picker must
emit its value in the declaration's own lower case; the alternative, canonicalising in
`freeColourFinish`, changes what 6P ships and stored rows carry, and is a separate decision nobody
needs today.

**2. The confirmation blocks, and a cancel writes nothing at all.**

*"We inform, and if he agrees, we change."* Pressing *Aplică* while a confirmation is owed runs **no
command**: not the material command, not the hardware command, not the depth command. On confirm,
the apply proceeds exactly as it does today, all three settings together. On cancel it returns to
the choosing step with the pending choices intact, the stored document untouched, and the store's
`selection` untouched — the customer can change their material choice back and apply the rest.

**The whole press is gated, not the material half of it.** A partial apply — hardware written,
material withheld — would leave the sheet's pending state disagreeing with the document it is
describing, which is a state nothing in this product has ruled and nobody asked for.

**3. It is one dialog with two steps, never a dialog above a dialog.**

The settings surface is already `aria-modal` with a scrim on both shells, a real focus trap, an
Escape handler bound to the document and the rest of the screen marked `inert`
(`apps/web/src/settings/global-settings.tsx`). A second modal over it means a second trap, a second
scrim and a second document-level Escape handler — and that file's own head comment, plus
`price-breakdown.tsx`'s recorded cost of binding Escape to a dialog, are the two places this project
already paid to learn what that costs.

So the confirmation **replaces the sheet's body and footer in place**, inside the same dialog
element and the same trap. On the confirm step, **Escape and a scrim click both step back** to the
choosing step and write nothing: each dismisses the topmost thing, and neither ever applies.

**4. The copy names the number of cabinets, and the number is the query's — never the effect's.**

The count belongs in the sentence: *"switching will wipe out all the preselected colours"* is the
consequence stated abstractly, and the owner asked for the customer to understand it. There is a
shipped precedent one line up in the same sheet — `appliesTo`'s *"tuturor celor 14 corpuri"*.

**It is a different number from `MaterialTierSetEffect`'s resolved count, and the two must not be
confused.** The effect counts every placement whose finish the incoming material does not offer —
which, because the three materials' offers are disjoint (ADR 0078 decision 1), is *every* placement
carrying a finish, including those sitting at the current material's default. The confirmation
counts only the cabinets that carry a colour somebody chose. So on any design satisfying the load
seam's invariant:

```
chosenCount ≤ resolvedCount
resolvedCount − chosenCount = the cabinets sitting exactly at their material's declared default
```

and that difference is exactly the set the owner ruled is not worth interrupting for. The inequality
is the assertion that keeps the confirmation and the resolution from drifting apart, and it is
falsifiable over the generated pair space wave 6Q-a already builds.

**The count may not be a literal digit anywhere in `ro`.**
`starting-price.adversarial.test.ts` sweeps every leaf of `ro.globalSettings`, and it sweeps a
composing template's **source body**. So a singular/plural branch written inline
(`(n) => n === 1 ? … : …`) fails the sweep on the `1` in its own condition. The branch belongs in a
module-level helper beside `everyBodyPhrase`, which is where the same problem was already solved.

**5. `materialWarning` is joined by a second string, not replaced, and does not gain a finish
clause.**

Two strings, two jobs. `ro.globalSettings.materialWarning` — *"Schimbarea materialului recalculează
întreaga estimare."* — is about the **estimate**, is always true, and stays exactly as it is. The
finish consequence moves to the confirmation, where it is stated at the moment it applies and with
the number of cabinets it applies to. **Wave 6Q-b's instruction to add a finish clause to
`materialWarning` is withdrawn by this record** — an always-on sentence and a blocking confirmation
saying the same thing is the sheet telling the customer twice, once when it cannot be acted on.

`apps/web/tests/settings/global-settings-model.test.ts`'s two assertions are therefore **kept, not
inverted**: the pinned `materialWarning` literal is unchanged, and *"omits the sentence about
limiting per-cabinet finishes entirely"* stays true of the sheet's choosing step. What changes is
the comment above it — it no longer records "6F has not shipped" but "the consequence is stated
where it happens" — and a new assertion covers the confirm step's own markup.

**6. Nothing about the command changes, and the copy is never shown after the apply.**

The confirmation is a step **before** a command, not a second command. `setMaterialTier` still runs
once and still produces one `CommandResult`; `onDesignChanged` still fires exactly once per applied
change. And the reverse must hold too: the confirmation's words may not appear as a toast, banner or
note **after** the apply. A consequence reported once it has happened is the thing ADR 0057
decision 3 forbids, wearing a different shape.

**7. It is not a refusal and is not routed through one.** No `RejectionDetail`, no
`RejectionReason`, no `lastRejection`. Nothing is being refused: the customer may have exactly what
they asked for. Routing it through the refusal channel would put a code and a red banner on a
consequence the customer is about to accept, and would collide with `describeStartingLabel`, which
reads `lastRejection` to decide whether the figure says *"De la neschimbat"*.

**8. This rules the material change and nothing else. A depth change still does not confirm.**
[ADR 0036](0036-a-declared-dimension-is-the-finished-cabinet.md) decision 5 rules that every body
adapts to a depth change with no confirmation step, and that stands: a depth change **loses nothing
the customer chose** — every cabinet keeps its colour, its width and its place. The distinction this
record draws is not "big change confirms" but "a change that discards a choice confirms".

## Alternatives considered

- **Keep ADR 0057 decision 3 as written — an always-shown sentence in the sheet.** Rejected by the
  owner, and the reason is sound on its own terms: a sentence that is present when it is true and
  when it is false is read as furniture within a week, and the reset it warns about is destructive
  in exactly the cases nobody reads it. It is also the weaker form of "before the apply" — the
  customer can apply without ever having looked at it.
- **Carry the colour over from PAL to MDF using 6R's published swatch hex.** Rejected by the owner
  in the same message, and independently by ADR 0078 decision 4 and ADR 0057. The owner's own
  reason is the decisive one: it means authoring and maintaining a mapping between materials, which
  is the thing they declined to build.
- **Confirm on every material change, unconditionally.** Simpler to build and to test, and it is
  what an implementer will reach for. Rejected by the owner explicitly — *"if this is already the
  default colour… we don't show this warning"* — and rejected here for the reason that makes it
  worth asserting: a modal that always appears is a modal that is always dismissed, so making it
  unconditional for simplicity would destroy the signal the owner is paying for.
- **Confirm only when the count is large.** Rejected: a threshold is a number nobody can defend, and
  losing one deliberately chosen colour without notice is the same failure as losing six.
- **A second modal over the settings sheet.** Rejected — decision 3's reasons.
- **Compare free colours case-insensitively.** Rejected — decision 1's reason: a second finish
  equality beside `sameFinish`.
- **Show the affected cabinets by name.** Rejected: ADR 0057 already rejected sending the customer
  on a per-cabinet errand from this surface, and a list inside a confirmation is a list nobody can
  act on without leaving the confirmation.

## Records swept before deciding, and how each is settled

Per the owner's standing instruction, checked before ruling.

| Record | What it says | Settled how |
| --- | --- | --- |
| [ADR 0057](0057-a-material-change-resets-an-unavailable-finish.md) | Reset to the new material's default; one domain query; one command result; **the warning precedes the apply on both viewports**; no stored design holds an unoffered finish. | **Decision 3 is amended by this record** — the warning becomes conditional and blocking. Decisions 1, 2 and 4 are untouched, and its rejection of nearest-finish mapping is **reaffirmed by the owner**, not merely left standing. |
| [ADR 0078](0078-a-materials-offer-is-its-controls-shape-and-the-load-seam-resolves-before-it-validates.md) | Offers derive from the control's shape and are disjoint per material; decision 3 an undeclared id resolves and refuses nothing; decision 4 never construct a colour from a swatch; decision 5 absence stays absence; **and it raises the carry-over question**. | **The raised question is closed: no carry-over.** Decision 3 is why the query is total over an undeclared material (decision 1b); decision 5 is why an unfinished body is not counted (1a); decision 1's disjointness is what makes `chosenCount ≤ resolvedCount` provable. |
| [ADR 0071](0071-material-carries-price-colour-carries-a-different-control-per-material.md) + amendment | Three control shapes; the three declared defaults are Alb / white / Stejar. | **Read as decided data.** The defaults are what "differs from default" is measured against; a change to the declaration moves the predicate, which is asserted. |
| [ADR 0036](0036-a-declared-dimension-is-the-finished-cabinet.md) decision 5 | Every body adapts to a depth change automatically, **with no confirmation step**. | **Untouched, and named in decision 8** so that nobody adds a depth confirmation by symmetry with this one. |
| `DEVELOPMENT-SPEC.md` §13.1 *Disable, don't warn* | Anything that cannot be satisfied is greyed with its reason; a refusal reaching the user means a list offered something it shouldn't. | **Not in tension.** That rule governs offering the impossible. A material change is entirely possible; the confirmation is about a consequence the customer may accept, and decision 7 keeps it out of the refusal channel. |
| [ADR 0024](0024-the-rejection-banner-has-no-reachable-path.md), `docs/BACKLOG.md` entry 31 | The refusal banner's reachability; and the 2026-09-05 ruling that a thrown error inside the sheet is **not** routed to `lastRejection`, since that field carries a code and ruled copy. | **Decision 7 follows the same line** for the same reason: `lastRejection` is a refusal channel and this is not a refusal. Entry 31's open item is untouched and adjacent — the confirm step adds a second action that can throw. |
| [ADR 0069](0069-past-the-wall-is-one-code-family-and-severity-is-declared-per-code.md), [ADR 0055](0055-a-depth-change-migrates-the-stored-design.md), [ADR 0053](0053-the-design-document-records-the-whole-frozen-map.md) | Severity per code; a rewrite of stored values owes a version bump. | **Untouched.** This record adds no validation code, writes no stored field and takes no schema bump. Wave 6Q-b's seams are unchanged by it. |
| [ADR 0062](0062-a-manufacturer-price-dashboard-comes-after-m8-and-shapes-seams-now.md) seam 1 | The domain imports no price book. | **Obeyed.** The query reads `MATERIALS` and the design; it never asks whether a tier exists. |
| [ADR 0023](0023-touch-compatibility-clicks-reach-the-sheet.md) | A touch on the canvas was also pressing the sheet; the canvas cancels `touchend`. | **A verification item, not a constraint.** The confirm step puts a new tappable action at 390 px over a live canvas, which is exactly the geometry that defect had. Wave 6Q-c verifies a tap on *Confirmă* does not also reach the scene. |
| `DEVELOPMENT-SPEC.md` §10.1 | One implementation for both viewports; the only permitted fork is layout, in CSS. | **Obeyed.** One model, one markup, one set of strings; the shell branch is the sheet's existing one. |
| Wave 6Q's own criteria and 6Q-b's item 5 | *"The warning … static, not conditional, and carrying no count"*; two live assertions to be **inverted**. | **Withdrawn and replaced by decision 5**, explicitly rather than by editing around it. The two assertions are kept rather than inverted. |
| Wave 6P's close-out, `starting-price.adversarial.test.ts` | Every leaf of `ro.globalSettings` is swept for a digit, template bodies included. | **Decision 4's last paragraph** — it dictates where the plural branch may live. |

Nothing found in the sweep contradicts this decision. The one record it narrows — ADR 0057
decision 3 — is narrowed here explicitly, on the owner's own words, rather than in a milestone edit.

## A consequence the owner may not have weighed

**A kitchen sitting entirely at its material's default is repainted with no warning at all**, and in
one direction that is a whole-kitchen change of colour.

PAL's default is *Alb* and veneer's is *Stejar*. A fourteen-body PAL kitchen where nobody has touched
a colour has `chosenCount = 0`, so switching to veneer is **silent** — and every cabinet goes from
white to oak. The same is true of PAL → MDF, where the two whites are near enough that nothing looks
wrong.

This is the ruling working as stated, not a defect in it: nothing the customer *chose* is lost,
which is the line the owner drew, and the customer is watching the 3D model while they press
*Aplică*. It is recorded because the number is exact and knowable —
`resolvedCount − chosenCount` is the count of silently repainted cabinets — and because if it turns
out to be the wrong trade, the fix is small and its shape is already known: state the colour
consequence in the always-shown `materialWarning` as well, which is decision 5's second string
turned back on. **No wave is blocked on it and wave 6Q-c ships as ruled.**

## Consequences

- **Wave 6Q-c is added**, after 6Q-b: the query, the confirm step, and the copy. It is the first wave
  in this milestone that is both domain algebra and a screen, so it carries a **Full** review tier
  **and** a visual/interaction gate — 6Q-b's *"no visual agent is owed"* does not extend to it.
- **6Q-b's item 5 shrinks**: no finish clause, no inverted assertions. Its `ro.ts` touch may fall
  away entirely, which moves the wave's copy work into 6Q-c where the behaviour is.
- **The silent path is now a criterion, not a default.** Every fixture in the shipped suite carries
  no finish (`KITCHEN_L_DESIGN`, verified 2026-09-05), so the silent branch is what every existing
  test already exercises and the conditional branch could ship untested. Wave 6Q-c's criteria pin
  both branches and count them.
- **Two drafted strings more**, shipping marked *pending owner review* under the standing direction
  of 2026-09-04: the confirmation's title/body and its two actions.
- A later wave that adds a fourth material inherits the predicate for free — it compares against a
  declaration, so a new material's default enters the rule by being declared.
