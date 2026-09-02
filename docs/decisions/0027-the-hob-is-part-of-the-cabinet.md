# ADR 0027 — The hob is part of the cabinet body, not an accessory standing on it

Status: Accepted (two claims later superseded)
Date: 2026-08-27
Type: Decision
Milestone: Wave B1 — hob-bearing base cabinets

> **Partially superseded.** The `base-hob-oven` "open-front by design, owns no `door_front`" claim is
> superseded by [ADR 0050](0050-the-hob-oven-filler-is-a-finishable-front.md) (the filler panel is
> now finishable). The amendment exempting `base-dishwasher`/`base-dishwasher-600` from the
> capability gate is superseded by [ADR 0051](0051-the-dishwasher-niche-wears-a-decor-door.md) (the
> niche now builds a decor door). The core decision — the hob is part of the cabinet body — stands.

## Context

Backlog entry 1, reported by the owner during the first handset pass and decided on 2026-08-26.

Delete the base cabinet under the hob and both disappear. The cascade is correct — §3.1 says an
accessory belongs to its host and cannot exist without it, and ADR 0011 Gap E made `remove` carry
the hob away in the same command. What was wrong is what came next: **no catalogue entry carried a
hob**, so nothing could put one back.

Measured before this record: the resulting 600 x 860 opening offered six base bodies, none of them
with a hob on it. The hob's only representation was `cooktop-600`, a *seeded* entry, and ADR 0011
Gap A never offers a seeded entry — it describes one already-built body at one measured depth. So
the customer lost a fixture in one click, permanently, with no visible reason and no way back.

The accessory model itself was the obstacle. The hob was a placement of its own, 40 mm tall, sitting
on the worktop at `y0 = 860`. §4 derives openings by subdividing a column's free vertical space, and
there is no opening at worktop height — the worktop is the *top* of the base opening, not a slot
above it. So there was nowhere for an accessory picker to hang off.

## Decision

**The hob becomes part of the cabinet body.** Two catalogue entries, both fixed at 600 mm:

| `buildId` | Label | Body |
| --- | --- | --- |
| `base-hob-2drawer` | Corp plită și 2 sertare | `baseCabinet(w, { drawers: 2 })` carrying `builders.cooktop()` |
| `base-hob-oven` | Corp plită și cuptor | an open-front base carcass carrying `builders.oven()`, with the same hob above it |

1. **Two entries, not one and not four.** Hob-over-drawers is the majority case: when the oven lives
   in a column, the cabinet under the hob is drawers, because that is where the pots go.
   Hob-over-oven is common in Moldova, where kitchens are smaller and there is no room for an oven
   column; it is the owner's own kitchen. A 3-drawer variant and a doors variant were rejected —
   each is another builder, entry and test, and both are guesses where these two are known. A third
   is cheap once the pattern exists.

2. **Both are fixed at 600 mm** — `widthFlex: [600]`, `sizesMm: [600]`, `fixedWidth: true`. The hob
   is a 600 mm appliance (`builders.cooktop()` is a fixed 590 x 520 glass plate), so the cabinet
   under it is the width that appliance is made for. A `'fit'` body would build an 800 mm cabinet
   with a 600 mm hob adrift on it.

3. **Neither is new geometry.** Both compose builders that already existed, and the hob's local seat
   — the worktop line, 60 mm forward of the carcass centre — is read straight off `buildKitchen()`'s
   own placement of the seeded cooktop. `packages/three-adapter/reference/` and every builder the M1
   structural-parity suites diff are untouched.

4. **The seeded design migrates.** `p2` (`base-drawer2-600`) and `p3` (`cooktop-600`) become one
   placement, `p2` at `base-hob-2drawer-600`. `p3`'s id is retired and not reused: ids are
   persisted, and a freed id that comes back meaning something else is worse than a gap.

5. **The migrated body keeps `p2`'s frame exactly** — 600 x 820 at `y0 = 0`, `frameDepthMm: 580`,
   no `frameHeightMm`. The hob rides *above* the worktop and contributes nothing to the opening, in
   the same way `base-sink-800`'s faucet does not: §5.2 judges fit on the carcass box, and §11 row 7
   is the record of a faucet measuring 1220 mm and refusing an 860 mm opening it fits perfectly.

6. **`cooktop-600` stays in the catalogue.** Nothing in the shipped design references it any more,
   but designs saved before this migration still carry a `cooktop-600` placement, and a `buildId`
   the catalogue cannot resolve is `UnknownBodyError` at load. Removing the row would break exactly
   the documents the migration was meant to leave alone.

7. **Multiple ovens are allowed, deliberately.** A `base-hob-oven` beside the seeded oven column
   gives two ovens and no guard refuses it. The owner's reasoning: someone who cooks a lot may want
   two, the kitchen has the space, and there is no reason to refuse something buildable.

8. **The accessory machinery is not removed here.** §6.1's host resolution, §5.1's cascade,
   `ACCESSORY_MAX_HEIGHT_M`, the `accessory` flag and `cascadedAccessoryIds` all stay. A deletion
   justified by "nothing uses it any more" needs this record to have landed first, and a stored
   pre-migration document still reaches every one of them.

## Alternatives considered

- **Make the hob insertable as a standalone accessory.** Rejected. The void model has no accessory
  slot: §4 splits a column's free vertical space, and there is no free space at worktop height to
  offer one from. It would mean adding a new kind of slot to the engine for one fixture.
- **Keep `p3` and add hob-bearing entries beside it.** Rejected as the worst of both — two ways to
  represent the same kitchen, and the accessory path stays load-bearing forever.
- **Give the migrated body `frameHeightMm: 877`** (its true full extent, hob rings included).
  Rejected: it would put the hob's 17 mm into the *opening* and change `regions`, for a fixture that
  occupies no part of the opening. The sink base's faucet is the standing precedent.

## Consequences

**The kitchen is unchanged, and that was measured rather than eyeballed.** Two independent
comparisons, both before and after the migration on the same machine:

- **Derived state.** All 26 surviving placements keep an identical world transform, frame, column
  key, band, kind and accessory flag. All 12 columns are identical field for field, `regions`, `top`
  and `hasFullHeightUnder` included. Both derivations produce zero voids. The only difference is the
  removed accessory record.
- **Rendered geometry.** The whole design mounted placement-by-placement produces **330 meshes whose
  world position, orientation, scale, bounding size, geometry type, material name and visibility are
  identical** to `builders['kitchen-l']()`'s own, which is the M1 reference the parity suites diff.
- **Screenshots.** 1440 x 900 renders of the kitchen and of the hob cabinet, captured through the
  application's own `/internal/scene-shot` route from a production build, are **byte-identical**
  before and after (SHA-256 `df5b98f2…` and `9caca76d…`).

**§9's ACTUAL badge is now reachable for the hob cabinet.** `base-hob-2drawer-600` declares
`catalogEquivalentId: "base-hob-2drawer"` (ADR 0022), so selecting the shipped hob cabinet marks its
own row. Before the migration the hob had no catalogue equivalent and could not.

**The base offer list grows from 7 rows to 9** at a 600 mm base opening. Nothing breaks: §13.1
decided **"filtered list, never pagination"** — three layouts were mocked and the paginated one was
deleted at the user's request — so there is no page arithmetic for a longer list to overflow.

**§11 row 15 — "click the hob selects its host; the hob cannot be deleted" — becomes trivially
true** in the shipped design. The hob is a child mesh of its cabinet's group, so `climbToSelectable`
resolves it to the cabinet without §6.1's accessory rule being consulted at all, and there is no
hob placement to offer a delete on. The rule is not gone; it is satisfied by construction.

**The decomposition-parity assertion becomes a partition rather than a bijection.** `buildKitchen()`
still draws 27 bodies and there are now 26 placements, because one placement claims two of them. It
is still onto and still one-to-one in the direction that matters: every reference child is claimed
exactly once, no child is claimed twice, and both halves of the composite are still compared
structurally against their own reference child.

**A wider opening still leaves a gap, and that is backlog entry 8, not this record.** §5.2 has a
millimetre-set body take the widest size in its set that fits, so swapping the 800 mm sink base for
a hob base builds 600 and leaves 200 mm of nothing beside it. The dishwasher niche has always
behaved this way at 150 mm; these two entries are a third instance at a wider amplitude, pinned by
test so the behaviour is visible if entry 8 is ever decided.

**Two unrelated seeded entries were repaired in the same pass.** Fixing `base-hob-2drawer-600`'s
seeded `fixedWidth` exposed the same gap on `tall-oven-tower-600` and `tall-pantry-600`: both
inherited `fixedWidth: false` from their carcass while their catalogue rows are fixed. Neither has
anything to do with the hob, and neither has a visible symptom until M5 wires §5.4's `canGive`, but
leaving a known gap open to keep the diff tidy would have been the worse trade. Both now declare
`fixedWidth: true` in `kitchen-l-design.ts`.

**Stored designs are not migrated.** Nothing rewrites a saved document, so a design saved before this
record keeps its `base-drawer2-600` + `cooktop-600` pair and loads, renders and picks as it did. It
does not offer the ACTUAL badge, and deleting its `p2` still loses the hob. **Swapping its `p2` for
a hob-bearing body is a third behaviour, and it did not work — see the amendment below, which
decides it rather than deferring it.** Whether to write a data migration is still a separate
decision and is not taken here.

## Amendment, 2026-08-27 — the swap path cascades a duplicated hob

Found by logic review (H1) and confirmed by execution before the fix: on a pre-migration document,
selecting `p2` and tapping either new row produced **two `cooktop_glass` meshes at the identical
world position (2600, 866, 350)**. §5.3 swaps a placement *in place* — it writes a new placement
over the old one and, unlike §5.1's delete, cascaded nothing — so `p3` survived and §6.1 re-hosted
it onto the new body, which carries a hob of its own. `p3` is `canDelete: false`
(`ACCESSORY_NOT_DELETABLE`), so the customer could not clear the spare; the only escape was deleting
the whole cabinet. That falsified this record's own closing claim, and it was reachable in one tap
from §9's replace list.

**Decided: cascade, not refuse.** Refusing the swap by name would tell a customer that the row they
can see is not for them, on a document they cannot tell apart from any other — §9's "never offer
what cannot be satisfied" would then require hiding the two rows on exactly the documents that most
need them, since a pre-migration design is the one place a hob can be lost. Cascading matches what
the customer asked for: they chose a cabinet with a hob on it, and they get one.

**The fact is declared, never inspected.** The domain has no meshes, so a new `BodyDefinition` field
says what a body carries: **`carriesAccessoryKind`**, holding the accessory `kind`
(`"induction_cooktop"`). It is named for the fact rather than for the rule that reads it — a body
*carries* a hob whether or not anything ever cascades — which is the same shape as
`catalogEquivalentId`: a per-entry declaration, because §6.3 records what inferring a body's
identity costs. All three hob-bearing entries declare it: `base-hob-2drawer`, `base-hob-oven`, and
the seeded `base-hob-2drawer-600` (where nothing reads it today, since ADR 0011 Gap A never lets a
seeded id be the *incoming* body of an insert).

`insertBody` removes, in the same command, only an accessory that is **both** hosted on the outgoing
placement (§6.1's own `findHostedAccessories`, reused rather than re-implemented) **and** of the kind
the incoming body declares. The removed ids are reported as `cascadedAccessoryIds` on the
`body_inserted` effect — the same field name, and the same always-present-possibly-empty convention,
as `placement_removed`. The web store needed no wiring for it: `applyCommandResult` re-derives
records and voids from the result's whole `Design`, so a placement the command dropped is simply
absent. The field is reporting, not instruction.

**Deliberately narrow.** Swapping the same `p2` for a plain `base-2door` still leaves the hob hosted
on the door base. That behaviour pre-dates this record, it is not a duplicate of anything, and it is
unchanged.

~~**`base-hob-oven` declares `canFinish: false, canHandle: false`.** It is open-front by design — the
appliance *is* the front — so it owns no `door_front` and no cabinet handle.~~ **Superseded
2026-09-01 by [ADR 0050](0050-the-hob-oven-filler-is-a-finishable-front.md):** true when written —
the body had no fixed panel at all — and false once M5B wave 5B6 added one to close the cavity
between the oven and the worktop. `base-hob-oven` now declares `canFinish: true` and owns exactly one
finishable front, the filler panel. The `canHandle: false` half is unaffected and stands: the filler
is a facade, not a leaf, and the body's only bar belongs to the oven. Measured before the 5B6
fix: a recorded finish recoloured nothing (`collectFronts` returned `[]`), and `handle: "push"` hid
the **oven's** own bar, a cabinet-hardware chip mutating an appliance. §13.1's "disable, don't warn"
and §9's "never offer what cannot be satisfied" both say the sections must not render; `open-shelf`
and `hood` are the standing precedent. A gate now asserts that `canFinish` implies a built front and
`canHandle` implies a **cabinet** handle — one whose group also holds the front it opens, which is
how a door's handle is told from an oven's or a microwave's.

**The gate covers both populations of `KITCHEN_L_BODY_CATALOG`**, not only the insertable half: the
eighteen `CATALOG_BUILD_IDS`, built by `buildCatalogBody` at their nominal size, *and* the
twenty-three seeded instances, built by `buildDecomposedBody` at the one size each of them has. It
was written against the insertable half alone, which is why its first version found a single
pre-existing violation. Extended to the seeded half — the half the customer actually selects in the
shipped kitchen — it found four more:

- `fridge-free-700` (`p7`), `open-shelf-600` (`p12`) and `hood-600` (`p13`) inherited their carcass
  shape's `canFinish: true`, and the fridge `canHandle: true`, over §7 twins that declare both
  `false`. The fridge's was live: `handle: "push"` reached `setHandlesVisible(body, false)`, which
  hides every handle mesh in the group, so a cabinet-hardware chip erased the appliance's own two
  bars. All three are corrected to match their twins.
- `cooktop-600` declared both `true` over a body with no front and no handle. The panel suppresses
  both sections on an accessory, so nothing showed — but the flags were false of the body, so they
  are corrected too. Its row, its builder arm and its geometry are untouched: ADR 0027 point 6 keeps
  it for documents persisted before this migration, and those still load and render unchanged.
- `base-dishwasher-600` is the seeded instance of `base-dishwasher` and runs the same builder call,
  so it carries the same gap from the other population rather than a second one.

~~Two entries therefore remain: `base-dishwasher` and its seeded instance. Both are open niches where
the appliance is the front, so the builder produces no `door_front` and its only handle is the
appliance's. The owner scoped this wave to the new entry and decided to keep both as they are, so
each is **exempted** from the implication and **pinned to the inverse assertion** instead — a
companion test asserts that each still violates the rule, so a repaired entry cannot outlive its
exemption, and a third test asserts the exemption list's exact contents, so it cannot quietly absorb
a new defect. The product question behind them — an integrated dishwasher usually wears a decor
door, in which case the flags are right and the *geometry* is what is missing — is backlog entry
11.~~ **Superseded 2026-09-01 by [ADR 0051](0051-the-dishwasher-niche-wears-a-decor-door.md):** true
when written — the exemption was a scoping decision, not a product ruling, and its own last sentence
handed the product question to backlog entry 11 — and false once M5B wave 5B10 answered it. The
owner decided to give the niche a decor door rather than keep it as it stood: `dishwasherHousing` now
builds its own `door_front` via `doorSlab`, and both `base-dishwasher` and `base-dishwasher-600` are
ordinary fronted base bodies. `RECORDED_CAPABILITY_GAPS` is now `[]`, both pins are gone, and the
third test named above now asserts the list has **no** recorded gaps rather than these two exact
entries. Neither flag changed — `canFinish: true, canHandle: true` stood the whole time — only the
geometry behind them, exactly as backlog entry 11 predicted. `canHandle` reaches a **different**
answer from `base-hob-oven`'s above for a stated reason: a decor door opens, where the hob's filler
does not, so ADR 0051 gives it `true` rather than `false`.
