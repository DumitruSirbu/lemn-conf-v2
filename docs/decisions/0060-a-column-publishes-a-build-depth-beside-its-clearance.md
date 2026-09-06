# ADR 0060 — A column publishes a build depth beside its clearance, and both routes into a slot reach it

Status: Accepted
Date: 2026-09-02
Type: Decision + Finding
Milestone: M6 — unblocks wave 6I2; closes `docs/BACKLOG.md` entries 15 and 10

## Context

Two backlog entries, one seam seen from two sides.

**Entry 15.** Over a full-height column, `hasFullHeightUnder` lifts §5.2's head-clearance cap and
`resolveDepthM` returns `opening.d` — which is `Column.d`, §3.2's MAX over the run, *appliance
handles included*. The product therefore builds and **persists** wall carcasses at 703 and 742 mm:
depths nobody manufactures, invisible in the copy (the offer sheet shows width and height only),
invisible in the render (no camera preset shows wall B at a grazing angle), and reached by an
ordinary delete-then-insert on two columns of the shipped kitchen.

**Entry 10.** Over the same fridge column, a swap yields **600** by preserving the outgoing body's
frame while a delete-then-insert yields **680** by taking the void's own depth. Two routes to the
same end state, 80 mm apart, and which one a customer gets depends on whether they replaced the
cabinet or deleted it first.

The owner decided both on 2026-09-02:

- **7a** — the column publishes a build depth beside its clearance. `occupiedDepthM` keeps its
  meaning and its value; cabinets read the build depth.
- **7b** — *"remove + insert should act same as replace because replace now act correctly"*. A
  **directional** statement: swap is the reference and insert conforms to it.

These two could have conflicted. This record establishes, against the code and the declared map,
that they do not.

## The reconciliation, with the number

**They agree, and the number is 600 at a 600 mm kitchen — swap's number, not the column's MAX.**

Measured on the shipped fixture through `occupiedDepthM` (2026-09-02):

| Body | Finished depth | What it is |
| --- | --- | --- |
| `p22`, `p23`, `p24` — the tops over the three columns | **600** | cabinetry |
| `tall-pantry-600` | 599 | cabinetry, 1 mm from the reference's 40-vs-39 rounding |
| `hood-600` (`HOOD_FINISHED_DEPTH_MM`) | **600** | cabinetry line by declaration |
| `tall-oven-tower-600` | 638 | the oven's and microwave's **bars** |
| `fridge-free-700` | 742 | a 680 mm appliance and its **door bars** |

Every number at or below 600 is cabinetry; every number above it is an appliance or an appliance's
handle. **The cabinet-depth line is 600, and the shipped kitchen already builds its tops over columns
to exactly that.** The 742 the uncapped arm produces is the only number in the set that no cabinet
was ever built to.

[ADR 0028](0028-wall-depth-is-derived-from-the-worktop.md) decision 5 said as much in words when the
lift was introduced — *"`hasFullHeightUnder: true` still lifts the cap, which is what keeps the two
deep top cabinets at 600 over their columns"*. The lift was intended to raise the ceiling from the
map's 330 to the cabinet-depth line, and was implemented as "return the opening's depth", which
coincided with the intent only while nothing measured an appliance's handles. Wave S9 (DOM-002) made
`occupiedDepthM` correctly include them, and the coincidence ended.

So 7a's build depth over a full-height member **is** 600, which **is** what swap yields. No decision
has to give, and in particular *"they must agree"* does not become *"they agree on the larger
number"*.

## Decision

**1. A column publishes two facts.**

- **Clearance** — `occupiedDepthM`'s MAX over the members, handles and appliances included. It is
  §3.1's question, `occupiedDepthM` answers it correctly, and neither its meaning nor its value
  changes. Read by anything asking "how much space does this occupy".
- **Build depth** — what a cabinet standing in this column is built to. Read by `resolveDepthM` and
  by anything else deciding a manufactured size.

**2. The build depth is a declared size, never a measurement of what happens to stand there.**

- Where the cap applies: the map's wall depth for the current cabinet depth (330 at 600).
- Where a full-height member lifts it: the **cabinet-depth line** (600 at 600, 700 at 700).
- **Never the clearance MAX.** This is [ADR 0028](0028-wall-depth-is-derived-from-the-worktop.md)
  decision 4's rule — a declaration, not a computation — applied to the one arm that evaded it. 703
  and 742 are values a formula produced, and `worktop-depth.ts` exists precisely so that cannot
  happen one module over.

**3. Every route into a slot lands on the same depth.** Swap preserves the outgoing body's frame,
insert derives from the column, and after this decision both are the build depth, so §5.3's promise
that a swap is *not* a delete plus an insert holds numerically as well as structurally. Entry 10's
divergence closes at 600, which is the value entry 10 records as the one the seeded design chose
deliberately.

**4. A shallow body over a full-height member becomes unreachable by construction**, which is what
makes 3 stable rather than coincidental: an insert over such a column derives the build depth, and a
swap can only preserve a depth some earlier route produced. There is no route that puts a 330 mm body
over a column for a later swap to inherit.

**5. A pinned entry does not lend its pin to its replacement. Decided by the owner, 2026-09-02.**
[ADR 0058](0058-the-two-deep-top-cabinets-are-pinned.md) pins `wall-2door-600-deep-top` and
`wall-2door-700-over-fridge` at 600 at every setting. At **700** that is no longer the build depth, so
swapping a pinned body for a catalogue body would inherit 600 while an insert would derive 700 — the
one place decisions 7a and 7b still pulled apart, and it is reachable the day wave 6K ships.

**The incoming body takes the column's build depth** — 700 at a 700 mm kitchen, not the 600 it
replaced.

**How it was reached, kept visible because the ruling alone would not survive scrutiny.** This clause
was *derived* first and confirmed second. It **extends** 7b's direction rather than restating it: 7b
— *"remove + insert should act same as replace because replace now act correctly"* — was said about a
case where swap produced the cabinetry number and insert produced an appliance's, and the principle
underneath it is that **the cabinetry number wins**, which at 700 is 700. Read literally instead,
"insert conforms to swap" would have the incoming body inherit 600.

The supporting argument, also put to the owner and accepted: ADR 0058 decision 2 makes the pin a
property of the *entry*, declared on it and greppable. A body that never declared the pin must not
acquire it by standing where a pinned body stood, or the exception leaks into the general population
and stops being greppable — which is the whole reason ADR 0058 chose a declaration over a constant.

Put to the owner in exactly those terms on 2026-09-02 and confirmed with that reasoning, so this is a
decision and no longer an inference.

## Alternatives considered

- **Cap everything to the map's wall depth** (330/400), removing the lift. Rejected: it makes the
  deep cabinets over the columns stop being deep at the *current* depth, changing the shipped
  kitchen, and it discards the rule backlog entry 5 was decided on — over a full-height column there
  is nothing to lean over.
- **Keep one number and make `occupiedDepthM` answer the build question.** Rejected: it is correct
  for §3.1 and correcting it toward manufacturability would break the clearance readers
  (`deriveColumns`' MAX, which also decides where the column sits, and the void mesh).
- **Let the routes differ and document it.** Rejected by 7b, and rightly: a customer reaches both
  routes by ordinary actions and neither is signposted.

## Consequences

- Wave 6I2 implements this and must land **before** wave 6J, or
  [ADR 0055](0055-a-depth-change-migrates-the-stored-design.md)'s migration writes clearance-derived
  depths into stored documents.
- **`docs/BACKLOG.md` entries 15 and 10 close** with this record. Entry 9's note that a placed body's
  depth is a persisted fact that nothing re-derives is the same seam a third time and is already
  closed by [ADR 0040](0040-a-recorded-seat-is-converted-back-not-read-as-a-depth.md).
- One shipped relationship is unchanged and is not a defect: a cabinet built at the 600 line over the
  599 mm pantry stands **1 mm** proud, which is what `p23` does today and is the reference's
  40-versus-39 rounding, recorded in `kitchen-parts.ts`.
- The M1 fidelity gate is unaffected where the cap already governs; only the lifted arm moves.

## Correction, recorded at wave 6I2's close-out, 2026-09-04

**Decision 4's sentence overreaches, and the fix is in what 6I2 actually shipped, not in this
record.** *"There is no route that puts a 330 mm body over a column for a later swap to inherit"* is
literally false: no route **writes** one — `seatDepthMm` has exactly two writers in the domain
(`commands/insert-body.ts` and `commands/rebuild-resized-bodies.ts`), and neither can produce a
shallow body over a full-height member — but the *state* is reachable by a different mechanism this
sentence does not name. `hasFullHeightUnder` is **re-answered** from the along-wall overlap on every
derivation; an *existing* body's own recorded depth is never re-derived once placed
([ADR 0040](0040-a-recorded-seat-is-converted-back-not-read-as-a-depth.md) — a recorded seat is
converted back, not read as a fresh depth). So a shallow wall body placed while nothing stood under
it, followed by a full-height member inserted under it afterwards, leaves the wall body's own
`seatDepthMm` exactly where it was: shallow, over a column, without any route having *written* that
combination in one step.

**Decision 4's purpose clause is fully satisfied regardless** — "which is what makes 3 stable rather
than coincidental" still holds, because decision 4 is about **swap's** input, and a swap over such a
column still can only preserve a depth some earlier route produced. The overreach is in the standalone
claim about reachability, not in what the decision was protecting.

Not amending decision 4's wording above — it is dated and stands as written, and this correction is
appended rather than folded in, per this project's rule that a decision record accumulates rather
than erases. A reader relying on "no route puts a 330 mm body over a column" for anything beyond
decision 3's stability should read this correction first.
