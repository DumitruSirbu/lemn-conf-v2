# ADR 0058 — The two deliberately-deep top cabinets are pinned, and the pin is a declared exception

Status: Accepted
Date: 2026-09-02
Type: Decision + Finding
Milestone: M6 — gates waves 6H, 6I and 6J

## Context

M5's *Not established* question 5, carried to M6 because it reaches the control:
`wall-2door-600-deep-top` (placements `p22`, `p23`) and `wall-2door-700-over-fridge` (`p24`) are the
two deliberately-deep top cabinets. They are deep because their **columns** are — §5.2's
head-clearance cap is lifted over a full-height member (`hasFullHeightUnder`) rather than mapped —
and nothing said whether they should follow the setting, follow their column, or stay put.

Three readings were put to the owner. **The owner chose the third: they stay put.** Both entries are
pinned and immune to the cabinet-depth setting.

This record carries what that costs, because the planning recommendation had been for the *second*
option and its reasoning does not carry over.

## The measurement this decision has to be read against

Taken on the shipped fixture through `occupiedDepthM`, at the declared 600 mm cabinet depth
(`derivePlacementRecords` over `KITCHEN_L_DESIGN`, 2026-09-02):

| Top cabinet | Finished depth | Stands over | That body's finished depth | Relationship today |
| --- | --- | --- | --- | --- |
| `p22` (`wall-2door-600-deep-top`) | **600** | `p5` `tall-oven-tower-600` | 638 | 38 mm **recessed** |
| `p23` (`wall-2door-600-deep-top`) | **600** | `p6` `tall-pantry-600` | 599 | 1 mm proud — **flush** |
| `p24` (`wall-2door-700-over-fridge`) | **600** | `p7` `fridge-free-700` | 742 | 142 mm **recessed** |

An ordinary top cabinet finishes at **330** — `frameDepthMm: 291` plus ADR 0036's 39 mm front — which
is the map's `600 -> 330` row. The two "deep" ones record `frameDepthMm: 561` and therefore finish at
exactly **600**: not an arbitrary deep number, but **the cabinet-depth line itself**.

### Three findings that change how the choice reads

**1. "Shallower than the column it hangs over" is not a new artefact — it is the shipped
condition.** Two of the three already sit recessed today, and the deepest gap in the kitchen (142 mm,
over the fridge) is one the customer is already looking at. The concern that pinning inverts the
reason these cabinets were built deep does not survive the measurement: they were never as deep as
their columns.

**2. The planning recommendation mischaracterised the status quo, and the owner's choice is closer to
it.** "Follow their column" was recommended as the existing behaviour. It is not: these are
**persisted** bodies whose depth is a recorded fact, and `resolveDepthM`'s uncapped arm governs what
gets built on an **insert**, not what these three already are. The de facto status quo for the two
entries is a fixed depth that has never tracked anything — which is what the owner chose to make
explicit.

**3. The choice is the safer one on `docs/BACKLOG.md` entry 15's axis, and that is worth stating in
the owner's favour.** Entry 15 records that the uncapped arm builds wall carcasses at depths nobody
manufactures — 703 and 742 mm over the fridge column. Under **"follow their column" at 700**, these
three shipped bodies would have been rebuilt at their columns' depths, and `p24` would have taken
**exactly the 742 mm** entry 15 names — moving that defect out of the post-delete insert path and
onto three bodies of the shipped kitchen. Pinning prevents that.

It does **not** shrink entry 15's population, and this record does not claim it does: the defect
lives on the insert path, where a catalogue `wall-cabinet` dropped into a vacated slot over a
full-height column still takes `opening.d`. That is wave 6I2's, not this one's.

### What pinning does cost, at 700

Projected from the depth model waves 6H and 6I build; it is arithmetic over declared constants, not a
measurement of geometry that exists yet.

| Top cabinet | Stands over | That body at 700 | Relationship at 700 | Change |
| --- | --- | --- | --- | --- |
| `p22` | oven tower | ~738 (its carcass follows; the appliance fascia is mounted in it) | ~138 mm recessed | deeper recess, same kind |
| `p23` | pantry | 699 | **99 mm recessed** | **flush → recessed** |
| `p24` | freestanding fridge | 742 — a real machine, does not follow the setting | 142 mm recessed | **unchanged** |

**One demonstrable consequence: `p23`'s face stops being flush.** At 600 the top cabinet and the
pantry below it line up within a millimetre; at 700 the pantry moves forward 100 mm and the top
cabinet does not, so a face that currently reads as one plane becomes a 99 mm step.

**Assessed as acceptable, and recorded rather than worked around.** Nothing overlaps, nothing becomes
unmanufacturable, 600 remains a manufactured size, and a recessed top over a deeper column is already
the shipped condition on two of the three. It is a visual change on one face at a depth nothing ships
at today — not a defect. It is written down here so that whoever first renders a 700 mm kitchen
recognises it as a decision rather than reporting it as a regression.

## Decision

**1. Both entries are pinned: their finished depth does not follow the cabinet-depth setting.**

**2. The pin is a declared exception on the catalogue entry, never a literal constant.** A constant
that silently stops tracking anything rots; a declaration is greppable and testable, and it is what
this project already does everywhere the same question has come up — `occupiedDepth` is declared per
entry and an entry that declares nothing **throws** rather than being guessed at (DOM-002,
[ADR 0040](0040-a-recorded-seat-is-converted-back-not-read-as-a-depth.md)'s amendment), and
`catalogEquivalentId` is declared rather than inferred
([ADR 0022](0022-seeded-entries-declare-their-catalogue-equivalent.md)) for the same reason.

**3. Wave 6H/6I criterion, falsifiable:** build the catalogue at 600 and at 700; these two entries'
finished depth is identical (600) at both, while every other cabinetry entry's has moved. An entry
that neither tracks the setting nor declares an exception fails loudly rather than silently holding
still — the distinction this decision exists to keep visible.

**4. Wave 6J criterion:** the migration ADR 0055 defines **excludes pinned entries** from the
rewrite, by reading the declaration rather than by a special case in the migration code.

## Alternatives considered

- **Follow their column** — the planning recommendation, and what a reader would assume from the
  head-clearance rule. Rejected by the owner, and finding 3 above says it was rejected well: at 700
  it would have put `p24` at the exact unmanufacturable depth entry 15 records, on a shipped body.
- **Follow the map** — take the wall depth like every other top cabinet, 330 at 600 and 400 at 700.
  Rejected: it makes the deep cabinets over the columns stop being deep, which changes the shipped
  kitchen at the *current* depth and not only at 700.

## Consequences

- The two entries stay at 600 in a 700 mm kitchen, 200 mm proud of their 400 mm neighbours rather
  than today's 270. They remain the deep ones.
- `p23`'s flush face becomes a 99 mm step at 700, as above.
- M5's *Not established* question 5 closes. The M6 plan's owner-decision 5 is rewritten to the chosen
  option and points here.
- This record does not decide `docs/BACKLOG.md` entry 15 or entry 10. Those are the M6 plan's owner
  decision 7 and wave 6I2.
