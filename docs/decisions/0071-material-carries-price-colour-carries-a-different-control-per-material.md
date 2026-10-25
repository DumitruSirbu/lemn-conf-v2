# ADR 0071 — Material carries price; colour carries a different control per material

Status: Accepted
Date: 2026-09-04
Type: Decision
Milestone: M6 — shapes the finish/colour wave the milestone plan is currently splitting into two

## Context

§5.5 makes finish a per-cabinet choice and material a whole-kitchen setting; `FinishSchema`
(`packages/configurator-domain/src/design.ts:40-46`) is a closed five-value enum — `white | clay |
sage | graphite | oak` — verified unchanged on 2026-09-04. The panel's Romanian labels
(`apps/web/src/content/ro.ts:242-249`) are `Alb mat`, `Lut`, `Salvie`, `Grafit`, `Stejar`. The
adapter's `finishes.ts` already draws a line between the two kinds of thing this enum conflates:
`oak` has `{ color: null, isOak: true }` and `solidColorOf("oak")` throws `Finish "oak" is a
material, not a colour, and has no hex to publish` (`finishes.ts:49-57`) — confirmed, though the
adapter's quoting is double quotes around the key, not the single quotes the originating brief for
this record used. `oak`'s texture comes from one generator, `woodTex` (`kitchen-parts.ts:402`),
instantiated once for the cabinet material (`kitchen-parts.ts:505`, `oakTex = woodTex("#c08d51",
"#7b5527", 7)`) and reused nowhere else for a different wood.

This enum was built before the product had three priced materials with different manufacturing
realities. The owner ruled on materials, colours and finishes on 2026-09-04, closing that gap. This
record is scoped to the decision itself; it does not touch
[`M6-price-and-global-settings.md`](../milestones/done/M6-price-and-global-settings.md), which an
architect is splitting into two wave plans concurrently — implementation detail belongs there, once
written.

## Decision

**1. Material and colour are separate concerns. Only material carries price.** Three materials,
price-ordered: **PAL (melamine) < MDF (painted) < veneer** (natural wood laid over MDF). Colour
never affects price, for PAL or for MDF. No finish, decor or colour name may enter pricing — the
material a cabinet is built from is the only priced fact this record adds.

**2. Colour exists to help a customer picture the kitchen, not to depict it.** The owner's own
words: it is "for the user to play and see how it will look… of course it's not 100% real."
**Photorealistic rendering is explicitly out of scope.** This licenses the approximation decision 5
records below rather than treating it as a shortfall to fix.

**3. The colour control's shape differs per material — this is the decision with teeth.**

- **PAL** — a fixed list of factory decors. PAL arrives pre-manufactured; there is no colouring
  step, so only what the manufacturer makes can be offered.
- **MDF** — a **RAL colour picker**. Painted MDF can be any colour, so the control is a selector,
  not a list.
- **Veneer** — two woods: **Stejar** (oak) and **Nuc** (walnut).

A picker, a list and a two-swatch choice are three different UI shapes reading one setting, not one
control with three different option sets.

**4. The PAL decor list — six entries, owner-confirmed after research on 2026-09-04:**

| Decor | Egger code |
| --- | --- |
| Alb | W1000 ST9 Alb Premium* |
| Stejar Bardolino Natur | H1145 ST10 |
| Stejar Halifax Natur | H1180 ST37 |
| Antracit | U963 ST9* |
| Gri Havanna | U755 ST9 |
| Nuc Warmia Maro | H1307 ST19 |

Covers white, light oak, mid oak, dark grey, mid grey and walnut. **The two starred codes (Alb,
Antracit) are unconfirmed against a supplier stock list**; the other four were read from a supplier
catalogue on 2026-09-04. The two verification states must not be presented as equally settled —
whichever wave sources or displays these codes carries that distinction forward, not just the six
names.

**5. What becomes of the five finishes shipped today.**

| Shipped finish | Becomes |
| --- | --- |
| `white` | PAL *Alb*, and any white reachable through the MDF RAL picker |
| `clay` | **MDF only** — not a PAL decor, stops being offered on a PAL kitchen |
| `sage` | **MDF only** — not a PAL decor, stops being offered on a PAL kitchen |
| `graphite` | PAL *Antracit*, and the MDF RAL picker |
| `oak` | PAL's two *Stejar* decors, and veneer *Stejar* |

`clay` and `sage` are narrowed, not merely renamed: a PAL kitchen wearing either today loses that
colour outright. This is exactly the case [ADR 0057](0057-a-material-change-resets-an-unavailable-finish.md)'s
reset rule exists for — a material that does not offer a cabinet's current finish resets it to the
material's default, with the warning shown before the apply.

## Consequences

- **`FinishSchema`'s closed enum cannot express "any RAL colour".** Under this decision a finish
  becomes two kinds of thing: a declared palette entry identified by id (a PAL decor, a veneer
  wood), or a free colour value (MDF's RAL pick). The schema shape, any version bump, and how
  `migrateDesign` meets a document written under the old five-value enum are the implementing wave's
  to decide. **ADR 0052's precedent governs the shape of that answer**: normalise a document written
  under a superseded rule rather than refuse it, because a `/d/{id}` share link is the one artefact
  handed to someone who cannot be asked to reload it.
- **ADR 0057 is unchanged and still governs** the reset, the single command result, the
  before-the-apply warning, and the invariant that no stored design holds a finish its material does
  not offer. This record adds that the *shape* of the control now changes too, not only its
  membership: switching MDF → veneer replaces a picker with two swatches, not just a different list
  behind the same widget.
- **Switching to veneer resets every cabinet to a wood**, since only two are on offer — the most
  destructive path ADR 0057 permits, and the reason its warning must precede the apply.
- **Each PAL decor is a texture, not a flat colour.** The adapter has one wood texture generator,
  `woodTex` (`kitchen-parts.ts:402`), instantiated once today as `oakTex`. Six decors means
  approximations: tinted wood for the two Stejar decors and for Nuc Warmia Maro, flat colour for
  Alb, Antracit and Gri Havanna. A swatch and the 3D view will not match a real sample. **The owner
  accepts this** — decision 2 is why — and the sheet's copy should say so rather than let a customer
  discover the gap themselves.
- **Each material's default finish is owed, not decided.** ADR 0057's reset needs a default per
  material to resolve to. The recommendation on record is Alb for PAL, white for MDF, Stejar for
  veneer, but **the owner has not ruled on this**. It is an open input for the implementing wave, not
  a decision this record makes.

## Alternatives considered

- **One control shape for all three materials**, varying only the option list. Rejected by the
  owner's own account of PAL, MDF and veneer: PAL is a closed manufacturer catalogue, MDF is paint
  (unbounded within RAL), and veneer is two named woods. A single list-shaped control would either
  under-serve MDF (no list can stand in for "any RAL colour") or over-promise PAL (implying more
  decors exist than the manufacturer makes).
- **Map `clay` and `sage` to the nearest PAL decor** instead of narrowing them out. Not raised by the
  owner and rejected on the same grounds ADR 0057 already rejected nearest-finish mapping for
  material changes: neither colour has a defensible PAL equivalent among the six confirmed decors,
  and an invisible substitution is worse than a visible loss the reset warning discloses.
- **Ship photorealistic rendering** so the 3D view matches a real sample. Explicitly rejected by the
  owner (decision 2) — the tool is for picturing a kitchen, not depicting one.

## What did not check out in the originating brief

Everything checked out. The adapter's error string uses double quotes (`Finish "oak" is a
material…`) rather than the single quotes quoted in the brief; noted above as the only
discrepancy, and it does not change any decision recorded here.

## Note — 2026-10-25: the amount a material carries is now a percentage

Decision 1 (only material carries price; colour never does) is unchanged. What the material carries
changed shape: a percentage on cabinet prices instead of a flat per-kitchen amount, with PAL as the 0%
reference. Ruled and recorded at the
[ADR 0092 Amendment of 2026-10-25](0092-hardware-prices-three-mechanisms-and-a-sink-carries-two-extras.md).

## Amendment — 2026-09-04: each material's default finish is ruled, closing the input Consequences left owed

Consequences' final bullet named this owed, not decided, and carried the recommendation forward as
an open input at waves 6P/6Q (`docs/milestones/done/M6-price-and-global-settings.md`, *Open questions
gating this phase*). The owner has now ruled it, on the recommendation already on record:

| Material | Default finish |
| --- | --- |
| PAL | **Alb** |
| MDF | **white** |
| Veneer | **Stejar** |

This is ADR 0057's reset target for each material — the value a cabinet's finish resolves to when a
material change (or wave 6P's migration of a legacy document) leaves it holding a finish the new
material does not offer. Whichever wave ships the rule reads these three values as decided data, not
as the *pending owner review* marker 6G's precedent called for while this was still open.
