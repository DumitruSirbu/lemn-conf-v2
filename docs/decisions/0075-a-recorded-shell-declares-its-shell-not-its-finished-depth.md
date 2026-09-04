# ADR 0075 — A `recorded-shell` entry's `frameDepthMm` is its shell, and the round trip that measured 39 mm was measuring the fake probe

Status: Accepted
Date: 2026-09-04
Type: Decision + Finding
Milestone: M6 — wave 6K-d

## Context

Adversarial QA on wave 6K-a found that a 600 → 700 → 600 round trip returns two wall columns 39 mm
deeper than they started, and held it with an `it.fails` in
`apps/web/tests/store/qa-6k-a-cabinet-depth.adversarial.test.ts`. The measurement recorded there:

```
at 600:  wall-2door-600 = 291      wall-cabinet = 330
at 700:  wall-2door-600 = 361      wall-cabinet = 400
both declare occupiedDepth { measuredFrom: "recorded-shell", frontAssemblyMm: 39 }
```

`resolveRebuildBody` swaps the seeded entry for its `catalogEquivalentId` (ADR 0022) permanently, so
after one depth change the placement stands on `wall-cabinet` and never returns. Wave 6K-d was opened
with the question left open — *which of 291 and 330 is the right declared depth* — and marked as
wanting an architect pass before implementation. This is that pass. It answers two questions, and the
second one changes what the wave is.

## Decision

**1. `frameDepthMm` on a `recorded-shell` entry is the shell, never the finished depth. 291 is right
and 330 is wrong, and this is not a choice between two defensible numbers.** Four readings of the
existing code say the same thing, and none of them is a preference:

- [ADR 0018](0018-frame-depth-is-rear-overhang.md): `frame.d` is **twice a body's rear overhang**.
  `wallCabinet` builds `shellD = D − 39` and centres it on `z = 0` (`kitchen-parts.ts:1541`), so the
  rear overhang is `shellD / 2` and `frame.d` is `shellD` — 291 at a declared 330. **330 is not a
  rear-overhang measurement of anything.**
- `rebuildDepthM`'s own worked convergence (`catalog-bodies.ts`): *"declared 0.330 builds a 0.291
  shell, records `frame.d` 0.291, and rebuilds at 0.291 + 0.039 = 0.330 for as many cycles as you
  care to run."* Put 330 in that field and the cycle is `330 → 369 → 408`, which is the compounding
  ADR 0018 clause 4 was written down to prevent, in the growing direction.
- `occupiedDepthM`'s `recorded-shell` arm is `seat + frontAssemblyMm`. From 291 it answers 330, the
  declared cabinet. From 330 it answers **369 — a wall cabinet nobody manufactures**, which is
  [ADR 0028](0028-wall-depth-is-derived-from-the-worktop.md)'s *"a formula would invent a 372 mm
  cabinet nobody makes"* arriving as 369 through a declaration instead of a formula.
- **The base band already does it this way.** `nominalDepthMm` for a base row is `baseSeatDepthMm` —
  580 at 600, not the declared 600 — so `insertableBody`'s `frameDepthMm: shape.nominalDepthMm` is
  correct there. The wall rows set `nominalDepthMm: wallCarcassDepthMm`, the *finished* depth. **The
  inconsistency is in what `nominalDepthMm` means per band, not in `insertableBody`.**

And the invariant was already stated and is already false: `wallCarcassSeatDepthMm`'s own comment says
the seeded rows read it *"so a seeded top and the §7 `wall-cabinet` a §5.4 resize would rebuild it
through cannot answer differently — the drift ADR 0028 exists to stop."* They do answer differently.
This decision restores a stated invariant rather than picking a winner between two.

**The change is `frameDepthMm` for the fronted §7 wall rows only.** `nominalDepthMm` stays 330/400 —
that is what §7 declares, what the customer is told and what the builder is handed — and
`occupiedDepth` is untouched. `open-shelf` is the named exception and already declares it: no front,
so its seat *is* `wallCarcassDepthMm` and its `frontAssemblyMm` is `NO_FRONT_ASSEMBLY_MM`. Both halves
of that pair must move together or not at all.

**2. The 39 mm the round trip measures is produced by the fake probe, not by the declaration.** This
is the reclassification, and it is why the wave's shape changes.

`rebuild` → `evaluateInsertFit` builds at `resolveDepthM`'s answer and then **measures**, and the
measurement — not `frameDepthMm` — is what is written as `seatDepthMm`. `createFakeBodyProbe` returns
`seatOffsetM: request.depthM / 2`, so it records 330: the depth it was asked for. The real probe
builds `wallCabinet(w, doors, h, 0.330)`, whose shell is `0.330 − 0.039 = 0.291` centred on `z = 0`,
so `measureSeatedGroup` returns `seatOffsetM = 0.1455` and `insertBody` persists **291**. The seeded
placement carried 291 by falling back to `frameDepthMm`; the rebuilt one measures 291. Nothing grows.

So **the `it.fails` is a test-fidelity failure**, and `frameDepthMm: 330` is a real but narrower
contract defect that the store suite cannot see and did not find. Classified as both, separately, so
that neither is fixed by the other:

- **Test-fidelity problem.** A fake that answers the request where the real builder subtracts the
  front assembly. It is the same fake and the same class of blindness
  [ADR 0074](0074-the-scene-rebuilds-whole-at-a-depth-change.md)'s finding names, from the other
  direction: that finding reaches the builders which **ignore** their depth argument, this one reaches
  the two which **consume** it (`wallCabinet` and `openShelf`, ADR 0018's own list). Between them the
  fake probe misreports every band.
- **Contract defect, and its production reach is stated rather than assumed.** `frameDepthMm` is
  `deriveFrame`'s fallback for a placement with **no measured seat**, so it is reached by a
  `wall-cabinet`, `wall-lift` or `wall-2door` placement that carries none — a stored document written
  before a measured seat existed, or one that arrives by the `/d/{id}` link
  ([ADR 0052](0052-800-mm-is-the-ceiling-on-any-empty-column.md): a load that refuses is a dead link,
  so such a document is loaded, not rejected). Such a placement seats 39 mm off the wall plane and its
  column publishes 369. The seeded rows are **not** reached: they spread `wallCarcass`, which sets the
  seat, and `open-shelf` overrides it deliberately.

**3. The wave verifies before it fixes, and the fake is fixed first.** 6K-d's first act is to run the
round trip against the real adapter probe. If the columns come back, decision 2 is confirmed, the
`it.fails` was measuring the fake, and it is flipped by making the fake honest — not by editing the
catalogue to satisfy it. **Editing a declaration to make a fake-probe assertion go green would move
production geometry to match a test double**, which is the inverse of what the assertion is for.
Decision 1's declaration fix is then made on its own evidence, with its own assertion over the whole
catalogue, and is not what turns that test green.

**4. Two mechanisms produce 369 and neither closes the other.** Stated because the number appears in
two records and could be read as one finding. ADR 0073's finding is `insert-fit.ts:834` passing
`WORKTOP_DEPTH_MM` to `columnBuildDepthM`, so a 700 mm kitchen rebuilds wall bodies to the **600** map
row, 330; under the fake probe that seats 330 and `occupiedDepthM` answers 369. Decision 1's defect is
`frameDepthMm` stating 330 where the field means 291; `occupiedDepthM` answers 369 from that too. Fix
only ADR 0073's constant and the fake probe seats **400**, so the column publishes **439** and the
number moves without becoming right. Under a real probe the same fix gives shell 361, seat 361,
column 400 — correct. **Any wave measuring 369 must say which of the three it has closed**, and the
whole-catalogue sweep in decision 1's criteria is what stops the next one being found by arithmetic
coincidence.

## Alternatives considered

- **Keep 330 and change the seeded rows to match.** Refused on decision 1's four readings: it is the
  number that is not a rear overhang, it breaks `rebuildDepthM`'s convergence, it makes
  `occupiedDepthM` publish a 369 mm cabinet, and it would put the wall band further out of step with
  the base band rather than back in step.
- **Change `insertableBody` to subtract the front assembly when `occupiedDepth` is `recorded-shell`.**
  Attractive — one edit, self-maintaining, and it would catch a future `recorded-shell` row. Refused:
  it derives a declaration from another declaration, which is ADR 0028 decision 4's own subject, and it
  would be wrong for `open-shelf`, whose `frontAssemblyMm` is zero and whose seat genuinely is the full
  `wallCarcassDepthMm`. The rows state their own seat; the sweep is what keeps them honest.
- **Delete the `it.fails` because it measures a test double.** Refused: `docs/WORKFLOW.md` — a deleted
  expected failure is indistinguishable from one that never existed. It is flipped, and what flips it
  is the fake becoming honest.
- **Make `resolveRebuildBody` stop swapping seeded entries for parameterised ones.** Not this record's
  to take, and not needed: the swap is [ADR 0022](0022-seeded-entries-declare-their-catalogue-equivalent.md)'s
  deliberate design and the two entries agreeing is what makes it safe. The wave's job is to make them
  agree, not to remove the seam.

## Records swept before deciding, and how each is settled

| Record | What it says | Settled how |
| --- | --- | --- |
| [ADR 0018](0018-frame-depth-is-rear-overhang.md) | `frame.d` is twice a body's rear overhang, not its depth; clause 4 warns of a compounding round trip for a builder that consumes its depth argument. | **The decisive reading.** `wallCabinet` is one of the two builders clause 4 is about, and 330 in that field is clause 4's own failure. |
| [ADR 0036](0036-a-declared-dimension-is-the-finished-cabinet.md) decision 1 | A declared dimension is the *finished* cabinet, doors included. | **Obeyed, and it is why the two numbers differ by exactly 39.** It governs `nominalDepthMm`, which stays 330/400. It says nothing about the frame-depth encoding, which is ADR 0018's. |
| [ADR 0028](0028-wall-depth-is-derived-from-the-worktop.md) | The wall depth is a declared map row; two numbers must not agree by luck, and no formula may invent an unmanufactured size. | **Cited twice**: against 369 as a published cabinet depth, and against the "derive it from `occupiedDepth`" alternative. |
| [ADR 0022](0022-seeded-entries-declare-their-catalogue-equivalent.md) | A seeded entry declares the catalogue entry it is equivalent to. | **Unchanged.** Equivalence is the premise; this record makes the two entries actually equivalent on depth. |
| [ADR 0073](0073-a-frozen-extent-records-the-body-its-depth-came-from.md) finding | `insert-fit.ts:834` rebuilds wall bodies to the 600 map row; the fingerprint is 369, and *"the fake probe seats the shell at exactly what it was asked for"*. | **Extended, not overturned.** That record already named the fake probe's role in the number; decision 4 states that two mechanisms reach 369 and that fixing one alone does not produce 400. |
| [ADR 0074](0074-the-scene-rebuilds-whole-at-a-depth-change.md) finding | The probe measuring a depth change holds a kit at the old depth, reaching the builders that ignore their depth argument. | **The complement.** Together the two cover both halves of `createFakeBodyProbe`'s blindness; wave 6K-e and this wave should agree on one honest fake rather than each patching it. |
| [ADR 0058](0058-the-two-deep-top-cabinets-are-pinned.md), [ADR 0060](0060-a-column-publishes-a-build-depth-beside-its-clearance.md), [ADR 0061](0061-a-cabinet-handle-is-declared-and-an-appliance-bar-is-not-one.md) | A depth fact is declared per entry, never inferred from a kind or from geometry. | **The stance taken.** The rows declare their own seat; nothing here infers one, and the pinned tops are untouched — they declare `manufactured-size` and do not move. |
| [ADR 0052](0052-800-mm-is-the-ceiling-on-any-empty-column.md) | A load that refuses is a dead link. | **Why the contract defect has production reach at all**: a document carrying an unmeasured `wall-cabinet` placement is loaded, not refused. |

Nothing found in the sweep contradicts this decision. No earlier record rules on which quantity
`frameDepthMm` states for a `recorded-shell` entry; ADR 0018 defines the encoding and no record applies
it to the §7 wall rows.

## Consequences

- **Wave 6K-d implements this**, in the order decision 3 sets: verify against the real probe, fix the
  fake, flip the `it.fails`, then fix the declaration on its own evidence with the catalogue sweep.
- **`createFakeBodyProbe` is shared**, so making it honest changes what several store suites see. That
  is the point, and any suite that goes red on it was passing on a fiction; each such failure is
  triaged as a finding rather than accommodated by keeping a second, lenient fake.
- **A design that never changes depth does not move.** Decision 1 changes only the fallback for a
  placement with no measured seat, and every placement the application writes has one. The M1 fidelity
  gate is untouched: no builder changes and the default depth does not move.
- **A residual, stated.** A stored document whose `wall-cabinet` placement has no measured seat is
  seated 39 mm off the wall today. After this wave it is seated correctly, so its drawn geometry
  changes on load — the one place this is not a no-op. It is a correction, not a migration: nothing is
  rewritten, and `deriveFrame` simply reads a fallback that is now right.
