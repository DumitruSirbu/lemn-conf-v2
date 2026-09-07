# ADR 0101 — A lifted column answers its top cabinet's depth, and the three deep tops follow the setting

Status: Accepted
Date: 2026-09-07
Type: Decision
Milestone: M6 — the ruling the item 8 wave executes; no wave is scheduled here

## Context

[ADR 0097](0097-adr-0058s-costs-were-accepted-at-a-depth-nothing-shipped-at-and-that-premise-has-expired.md)
Amendment A established that the owner's item 8 is a small fix and that the mechanism it needs already
ships. The owner had pre-authorised a small fix — *"if this can be fixed without harm and a lot of
changes, then I will go with the fix — but only if this is a small fix that didn't influence another
stuff"* — so item 8 is going to implementation.

Amendment A named three consequences and said one of them *"is an ADR somebody owes"*. **This is that
record, and it covers all three**, so an implementer executes a ruling instead of inventing one
mid-wave. It also carries the identification and the measurements, so nobody re-derives them.

**It changes no code and schedules no wave.**

### The identification, recorded so it is not re-derived

Every placement in `KITCHEN_L_DESIGN`, measured through `occupiedDepthOfEntryM` at both declared
depths on 2026-09-07:

| Band | Placements | Rule | @600 | @700 |
| --- | --- | --- | --- | --- |
| Base, y 0 | `p0`, `p1`, `p2`, `p4`, `p25`, `p26`, `p5`, `p6` | `cabinet-depth` | 599–638 | 699–738 |
| Base, y 0 | `p7` `fridge-free-700` | `manufactured-size` | 742 | 742 |
| Wall, y 1500 | `p8`, `p10`, `p11`, `p12`, `p14`, `p9` | `cabinet-depth` | 330 | **400** |
| Wall, y 1500 | `p13` `hood-600` | `cabinet-depth` | 600 | **700** |
| Top, y 2200 | `p15`–`p20`, `p21` | `cabinet-depth` | 330 | **400** |
| **Top, y 2200 / 1850** | **`p22`, `p23`, `p24`** | **`pinned`** | **600** | **600** |

**Of twenty-five placements, exactly three do not follow the setting**, and all three are in the top
row on wall B over the three full-height columns: `p22` and `p23` (`wall-2door-600-deep-top`) at
y 2200, and `p24` (`wall-2door-700-over-fridge`) at y 1850.

**A terminology note, because it cost a round trip.** Their `kind` is `wall_cabinet` and their ids
begin `wall-`, so an earlier pass called them "wall cabinets over full-height columns". The owner
calls them the top level, because that is where they stand — above the y 1500 wall band. **The same
three placements.** The owner's own discriminator settles it: *"the wall cabinets are fine"* — the
1500 band goes 330 → 400 and is correct, and nobody would hang a 700 mm box over a 400 mm one.

### The owner's three-way discrimination was real, and an earlier pass told them otherwise

The owner reported `p22` (over the oven/microwave tower) and `p24` (over the fridge) as wrong and
`p23` (over the two-door full-height cabinet) as right. That was recorded as **NOT REPRODUCED IN
CODE**, on the true observation that `p22` and `p23` are the same `buildId` with the same
declaration.

**That verdict was too strong and is withdrawn here.** The difference is not between the top
cabinets — it is between the columns beneath them, which are three different depths:

| Top cabinet | Column beneath | Column @600 | Step @600 | Column @700 | Step @700 |
| --- | --- | --- | --- | --- | --- |
| `p22` | `tall-oven-tower-600` | 638 | 38 recessed | 738 | 138 recessed |
| `p23` | `tall-pantry-600` | 599 | **−1 — flush** | 699 | 99 recessed |
| `p24` | `fridge-free-700` | 742 | 142 recessed | 742 | 142 recessed |

`p23` is the only one of the three flush today and the only one under a 100 mm step at 700. **The
owner was reading a relationship that genuinely differs.** It is recorded here because a customer
whose accurate observation is written down as "not reproduced" stops reporting.

### The mechanism, measured

`resolveDepthM` (`commands/insert-fit.ts:835`) branches on `column.hasFullHeightUnder` to
`columnBuildDepthM`, and `columnBuildDepthMm` (`cabinet-depth-rule.ts:241`) answers
`hasFullHeightUnder ? cabinetDepthLineMm(cabinetDepthMm) : wallDepthMmForWorktop(cabinetDepthMm)`.
Measured end-to-end through `derivePlacementRecords` → `deriveColumns` → `resolveRebuildBody` →
`evaluateInsertFit`:

| Placement | rebuilds as | `hasFullHeightUnder` | planned depth @600 | planned depth @700 | height |
| --- | --- | --- | --- | --- | --- |
| `p22` | `wall-cabinet` | true | 600 | **700** | 400 |
| `p23` | `wall-cabinet` | true | 600 | **700** | 400 |
| `p24` | `wall-cabinet` | true | 600 | **700** | 750 |
| `p15` *(control)* | `wall-cabinet` | false | 330 | 400 | 400 |

**A wall body over a lifted column already builds to the cabinet-depth line.** The pin is the only
thing stopping these three from being rebuilt through it.

## Decision

**1. A row whose depth is answered by a lifted column declares that, and the equivalence gate excludes
it on that declaration — an exclusion by principle, not a hole punched to make a suite pass.**

`seeded-equivalent-depth-agreement.test.ts` compares a seeded row's `frameDepthMm` against its
`catalogEquivalentId`'s and would put 561 / 661 against `wall-cabinet`'s 291 / 361. Its premise, in
its own words:

> *"`resolveRebuildBody` swaps a seeded entry for its `catalogEquivalentId` permanently, so after one
> depth change a placement stands on the parameterised row and never returns. If the two rows
> disagree about what `frameDepthMm` *means*, nothing in the system can tell."*

That premise has two halves. **The first is true** — the swap happens, and these rows do migrate.
**The second is false for exactly one population**: where the rebuilt body is in the wall band and its
column lifts the head-clearance cap, `resolveDepthM` returns `columnBuildDepthM` and **never consults
the equivalent's `frameDepthMm` at all**. The measurement above is that stated as a fact: the
equivalent declares 361 and the rebuild plans 700. So "nothing in the system can tell" does not hold —
the system does not read the disagreeing number.

> **The ruling: a seeded entry whose built depth is answered by `columnBuildDepthM`'s lifted arm
> declares so, on the entry, and the gate skips exactly the rows carrying that declaration.**

Three constraints on how it is declared, and each closes a way of getting this wrong:

- **Declared, never inferred.** Not a list of build ids in the test, and not "its `frameDepthMm`
  exceeds the map row, so it must be a deep top". Inferring identity is what
  [ADR 0022](0022-seeded-entries-declare-their-catalogue-equivalent.md) exists to stop — it once
  priced a fridge housing as a pantry — and ADR 0058 decision 2 already ruled this exact trade for
  this exact family: *"a constant that silently stops tracking anything rots; a declaration is
  greppable and testable."*
- **The exemption carries its own replacement assertion, so the suite gets stronger and not weaker.**
  A skipped row must still be checked, against the authority that *does* govern it: for every row
  carrying the declaration, at every declared depth, its finished depth equals
  `columnBuildDepthMm({ cabinetDepthMm, hasFullHeightUnder: true })`. **An exclusion that asserts
  nothing is a hole; this one swaps one assertion for the correct one.**
- **Non-vacuity, per the standing rule** (ADR 0090 decision 4b, ADR 0091 decision 4b, ADR 0093
  decision 1): the sweep must still contain rows on both sides — at least one declaring row and at
  least one not — or "no pair disagrees" becomes a claim about a shrinking set. The gate's existing
  `expect(paired.length).toBeGreaterThan(following.length)` guard is **not** a substitute and must be
  re-checked: today it is satisfied by the pinned rows, and after this wave it must be satisfied by
  something else (`fridge-free-700` is `manufactured-size` with an equivalent, and is the candidate).

**2. `neverMigrated` was asserting an incidental fact of the fixture, not a product promise — and the
ADR 0097 note that it "becomes false" was itself wrong.**

Corrected by reading the test: `roundTripped` drives a **width resize**, and this wave changes only
`depthRule`. `fixedWidth` does not move, the fridge stays fixed-width, so
`expect(neverMigrated).toEqual(["wall-2door-700-over-fridge"])` **still evaluates to the same value
and still passes.**

**The problem is not that it fails. It is that it keeps passing while its meaning changes** — the
failure mode ADR 0093 is about, running the other way. Its comment claims *"the one wall row **no
resize** can ever reach"* and lists it *"so a row joining this list is a visible change"*; after this
wave a **depth change** does reach that row, so an unqualified name reads as "the product cannot
migrate this" when only one command cannot.

> **The ruling: the assertion stands and its scope is named.** `neverMigrated` becomes
> `neverMigratedByAResize` (or equivalent), and its comment records that a depth change **does** migrate
> the row since this wave. The claim it protects — that a row *joining* the list is a visible change —
> is worth keeping and is about the resize path alone.

It is an incidental fact of the seeded fixture, and the record says so: `p24` is the row's only
placement and it happens to stand over the fixed-width fridge. **It is not a promise the product
makes**, and nothing may be built on it.

**3. The `pinned` arm is kept, and ADR 0093's duty is discharged by a witness the test declares.**

With all three rows unpinned, `follows: "pinned"` has no population in the shipped kitchen, which is
[ADR 0093](0093-a-rule-the-shipped-kitchen-cannot-exercise-owes-a-witness-not-a-moved-fixture.md)
decision 1 exactly: *"a ruled behaviour that the tree cannot distinguish from its own absence is
unshipped, whatever the code says."*

> **The ruling: keep the arm, and each suite that needs a pinned body declares one — ADR 0093
> decision 2's own pattern, *"the fixture that makes a rule falsifiable is declared by the test that
> asserts it."***

Why keep rather than retire: `pinnedAtFinishedDepthMm` and `depthFollowsSetting`'s `pinned` case are a
real product concept — cabinetry deliberately held at one depth — that the manufacturer price
dashboard's catalogue authoring will plausibly need, and deleting them would make the next pin an
unreviewed re-invention rather than a use of a ruled mechanism. ADR 0058 decision 2's reasoning for
declaring the exception at all survives its own population going to zero.

Why a declared witness rather than keeping one row pinned to feed the tests: that is precisely the
*"moved fixture"* ADR 0093's title refuses. Holding `p23` at 600 so a suite can stay red-capable would
make the product's geometry a function of its test coverage, and it would leave the owner with one of
the three cabinets still wrong.

**The three suites that lose their witness and must declare their own**, named so none is missed:

- `apps/web/tests/store/qa-6k-c-frozen-source.adversarial.test.ts` — its discrimination rests on a
  source *"which declares 600 at every setting"*.
- `packages/configurator-domain/tests/commands/set-cabinet-depth.plans-against-the-frozen-extent.test.ts`
  — its per-setting count of pinned rows reachable through the planning map.
- `apps/web/tests/store/cabinet-depth-frozen-source.test.ts` — `PINNED_TOP_BUILD_ID`.

**Each must be shown to still fail against the defect it was written for**, not merely to compile:
ADR 0093 decision 1's duty is discharged by an assertion that goes red when the behaviour is removed,
**never** by the observation that it could.

**4. The 600 mm kitchen is byte-identical, and that is the wave's first acceptance criterion rather
than a hoped-for property.**

> **At `cabinetDepthMm = 600`, every declared depth and every named mesh of `p22`, `p23` and `p24` is
> identical to `main` — not "within tolerance", identical.**

It is arithmetic and can be checked before a line is written: the entry's `frameDepthMm` becomes
`cabinetDepthMm − WALL_FRONT_ASSEMBLY_MM` = `600 − 39` = **561**, which is
`PINNED_DEEP_TOP_FINISHED_DEPTH_MM − WALL_FRONT_ASSEMBLY_MM` = 561 today; the adapter builds at
`kit.depths.cabinetDepthM` = **0.6**, which is `PINNED_DEEP_TOP_DEPTH_M` = 0.6 today; and
`columnBuildDepthMm({ cabinetDepthMm: 600, hasFullHeightUnder: true })` = **600**, which is the pin's
own declared finished depth. Three substitutions, each an identity at 600.

**M1's parity gate therefore needs no re-baselining and must not be re-baselined.** A parity diff at
600 on any of these three bodies is a defect in the wave, not a consequence of this decision — which
is the opposite of ADR 0098's sink ruling, and the contrast is worth holding.

**5. ADR 0028 decision 5's consequence clause is superseded; its mechanism is not.**

Decision 5 reads *"`hasFullHeightUnder: true` still lifts the cap, **which is what keeps the two deep
top cabinets at 600 over their columns**."* The clause is struck in place there and pointed here. It
was true when written, when 600 was the only cabinet depth the product had, and it is doubly stale
now: the lifted arm returns the **cabinet-depth line**, which is 700 at a 700 mm kitchen, and it is
the **pin** — not the lift — that holds these rows at 600. The lift is the mechanism this wave uses to
give the owner 700, so decision 5's rule is confirmed rather than overturned.

`packages/configurator-domain/src/cabinet-depth-rule.ts`'s comment above `columnBuildDepthMm` quotes
that clause verbatim. **Rewriting it is a work item of the implementing wave** and is listed in the
Consequences below; it is not done here, because this record changes no code.

## Alternatives considered

- **Give the deep tops a third `occupiedDepth.measuredFrom` kind**, so the equivalence gate's existing
  *"a pair declaring different kinds is a different claim"* guard excludes them with no new branch.
  Tempting and **rejected**: it would be false. `measuredFrom` says *how* a row's depth is measured,
  and these rows genuinely are `recorded-shell` — `frameDepthMm` is their shell and finished is shell
  plus front assembly, the same arithmetic. What differs is *where the number comes from*. Declaring a
  different measurement to win an exclusion is a lie told to a gate, which is worse than an honest
  exemption.
- **Exempt the two build ids by name in the test.** Rejected by ADR 0058 decision 2's own reasoning
  and by ADR 0022's: a list in a suite is invisible to `grep` from the entry, and it is how the
  exemption population stops being greppable.
- **Make the seeded rows declare `wall-cabinet`'s map depth (291 / 361), so the pair agrees.**
  Rejected: it makes the deep cabinets stop being deep and changes the shipped 600 mm kitchen from
  600 to 330 — ADR 0058's already-rejected "follow the map", and it fails decision 4 outright.
- **Drop `catalogEquivalentId` from the two rows.** It would silence the gate for free, and the reseat
  path would carry the depth. **Rejected**: `catalogEquivalentId` also supplies the row's label and its
  buildable width set (`catalogEquivalentNamer`, `resolveBuildableSizes`), so dropping it makes these
  three cabinets unresizable and makes their refusals name a `kind` at the customer. A silenced gate
  bought with a product regression.
- **Retire the `pinned` arm** now that nothing declares it. Rejected under decision 3, and recorded
  because it is the tidier-looking option: a compile error is exactly what should greet the next
  person who needs a pin, not a blank page.
- **Keep one of the three pinned to feed the witness suites.** Rejected under decision 3 — it is
  ADR 0093's "moved fixture", and it leaves the owner one wrong cabinet.
- **Rule nothing and let the wave decide at the gate.** Rejected: the equivalence gate is a contract
  about what a catalogue equivalent means, and a wave that quietly widens it to get green is how a
  gate stops looking. That is the specific failure this project has shipped more than once.

## Consequences

- **The wave's production change is four declarations, two builder cases and one deletion**, and
  decision 4 fixes its first criterion. `packages/configurator-domain/src/fixtures/kitchen-l-design.ts`
  (two `depthRule`s, two `frameDepthMm`s, plus decision 1's new declaration on the two entries);
  `packages/three-adapter/src/decomposed-bodies.ts` (two cases); `kitchen-parts.ts`
  (`PINNED_DEEP_TOP_DEPTH_M` deleted).
- **Three documentation work items travel with it**, each naming a claim that becomes false the moment
  the declaration changes: `cabinet-depth-rule.ts`'s comment quoting ADR 0028 decision 5 (decision 5
  above); `decomposed-bodies.ts`'s comment calling these *"the two ADR 0058 pins… the only wall depths
  in this file that are still literal"*; and the two entries' own comments in `kitchen-l-design.ts`
  explaining the pin. A wave that changes the declarations and leaves the comments produces a file
  that argues against itself.
- **The `pinned` arm survives with no shipped population**, and decision 3's declared witnesses are
  what keep it real. Whoever next adds a pinned entry inherits a ruled mechanism.
- **`docs/BACKLOG.md` entry 37** (*"Two pinned deep tops are 100 mm proud if a depth change ever reaches
  them"*, resolved) should be re-read by the wave, not because it re-opens, but because it is the last
  time this family's behaviour under a depth change was reasoned about.
- **This record does not close owner item 8.** It closes the three questions the fix owed. The item
  closes when the wave ships and the owner sees 700 mm deep tops.
- **A third declared depth costs nothing here.** Every rule above is written against
  `declaredCabinetDepthsMm()` and `columnBuildDepthMm`, both of which take the depth as an argument.
