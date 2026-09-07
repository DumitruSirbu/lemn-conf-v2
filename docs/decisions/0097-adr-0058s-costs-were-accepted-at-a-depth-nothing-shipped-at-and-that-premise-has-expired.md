# ADR 0097 — ADR 0058's two costs were accepted at a depth nothing shipped at, and that premise has expired

Status: Accepted
Date: 2026-09-07
Type: Finding + Decision
Milestone: M6 — answers owner manual-feedback items 8 and 9; schedules nothing

## Context

The owner met a 700 mm kitchen for the first time and reported two things
(`testing-reports/milestone-6/07-owner-manual-feedback.md`, items 8 and 9): wall cabinets over the
full-height columns stay shallow while the columns deepen, and the gap beside the corner cabinets
grows. The architect adjudication
(`testing-reports/milestone-6/08-architect-adjudication-owner-feedback.md`) found both **confirmed
but intended** — item 8 by [ADR 0058](0058-the-two-deep-top-cabinets-are-pinned.md) decision 1, item
9 by [ADR 0089](0089-the-along-wall-chain-is-kept-and-its-reader-is-the-depth-command.md) decision 1
and by the cost ADR 0058 recorded on the same page.

The owner then asked a conditional question rather than issuing a ruling:

> "Do you want to say that this is specially designed to have these gaps? If yes, okay, I will accept
> it. If this can be fixed without harm and a lot of changes, then I will go with the fix. But only
> if this is a small fix that didn't influence another stuff."

That question has two halves and both are answerable by measurement rather than by opinion. This
record answers them. **It changes no declaration and schedules no wave**, because the owner's
acceptance is conditional on the answer and the answer is what was asked for.

## Finding 1 — "specially designed" is half of the truth, and the other half is that the premise has expired

Both behaviours are deliberate, both are recorded, and neither is a bug that slipped through. So far
"specially designed" is fair.

What is **not** fair is to re-accept them on the record that already accepted them, because
**ADR 0058 accepted both costs explicitly at a depth nothing shipped at**, in its own words, three
times on one page:

> "**Recorded as an accepted cost, not scheduled as a defect** — the same class as the recessed steps
> above: a visible consequence of pinning, **at a depth nothing ships at**."

> "It is a visual change on one face **at a depth nothing ships at today** — not a defect."

> "It is written down here so that whoever first renders a 700 mm kitchen recognises it as a decision
> rather than reporting it as a regression."

That premise was true on 2026-09-02 and is false today. M6 wave 6K shipped a customer-facing depth
control; 700 mm is a setting a customer can choose; and the person who first rendered a 700 mm
kitchen was the owner, who did **not** recognise it as a decision — they reported it, twice, which is
the outcome that last sentence was written to prevent.

**So the honest answer to the owner is: designed, but on an assumption that has since expired.** The
behaviour is deliberate; the *acceptance of its cost* is not currently held by any live premise. That
distinction is the whole of decision 1 below, and it is what stops a stale ruling from being quoted
back at the owner as though it were a live one.

## Finding 2 — item 8's fix is **not** small, and the naive version of it is worse than doing nothing

The owner's condition is "a small fix that didn't influence another stuff". Measured against the
tree on 2026-09-07, on branch `fix/m6-remediation`.

### What the one-line version actually does

The declaration is two lines in
`packages/configurator-domain/src/fixtures/kitchen-l-design.ts` — `wall-2door-600-deep-top` (`p22`,
`p23`) and `wall-2door-700-over-fridge` (`p24`) each carry
`depthRule: pinnedAtFinishedDepthMm(PINNED_DEEP_TOP_FINISHED_DEPTH_MM, "base-formula")`. It looks
like a one-word change to `FOLLOWS_CABINET_DEPTH`. **It is not, and the result is not what the owner
asked for.** Traced through the command:

1. `setCabinetDepth` asks `movesWithTheSetting` (`commands/set-cabinet-depth.ts:220`). Pinned today,
   so the placement is pushed through untouched. Following, so it is rebuilt.
2. A rebuild goes through `resolveRebuildBody` (`commands/resolve-column-members.ts:196`), which
   resolves the entry's **`catalogEquivalentId`** — and both rows declare
   `namedAfterCatalogEquivalent("wall-cabinet")`.
3. `wall-cabinet` goes through §7's head-clearance map. Measured off
   `buildKitchenLBodyCatalog` at both declared depths, 2026-09-07:

   | Entry | `frameDepthMm` @600 | finished @600 | `frameDepthMm` @700 | finished @700 |
   | --- | --- | --- | --- | --- |
   | `wall-2door-600-deep-top` (pinned, today) | 561 | **600** | 561 | **600** |
   | `wall-cabinet` (what a rebuild resolves it to) | 291 | 330 | 361 | **400** |

4. `rebuild` writes the resolved body, and **a rebuilt seeded body migrates its `buildId`**
   (`resolve-column-members.ts:192-195`, ADR 0022). The stored placement stops being
   `wall-2door-600-deep-top` for ever.

So flipping the declaration does not give the owner a 700 mm deep top. It gives them a **400 mm**
one, permanently:

| Over | Column @700 | Deep top today | Step today | Deep top after the flip | Step after the flip |
| --- | --- | --- | --- | --- | --- |
| `p22` oven tower | 738 | 600 | 138 mm | **400** | **338 mm** |
| `p23` pantry | 699 | 600 | 99 mm | **400** | **299 mm** |
| `p24` fridge | 742 | 600 | 142 mm | **400** | **342 mm** |

It makes the exact complaint the owner raised between two and three times worse, it is irreversible
per placement, and it lands the kitchen on **ADR 0058's own already-rejected alternative** — *"Follow
the map … Rejected: it makes the deep cabinets over the columns stop being deep."* Arrived at by
accident rather than by choice, which is the worse way to reach a rejected option.

**It does fail loudly rather than silently, and that is worth crediting.**
`packages/configurator-domain/tests/seeded-equivalent-depth-agreement.test.ts` excludes pinned rows
by reading `depthFollowsSetting` and compares every following row's `frameDepthMm` against its
equivalent's. A flipped declaration puts 561 against 291 and 361 and the gate goes red at both
depths, at both entries, before anything reaches a customer.

### What the version that gives the owner what they want costs

To make a deep top actually finish at 700 in a 700 mm kitchen, the entry needs a depth that is the
**cabinet-depth line itself** — neither the wall map (330/400) nor a pin (600/600). The vocabulary
deliberately does not have that:

- `cabinet-depth-rule.ts:44-49` states the reason in its own comment: *"a reader rebuilding a pinned
  row from a setting value would send it back through the wall map, and `wallCarcassSeatDepthMm(600)`
  is 291 where these two rows seat at 561."*
- `CabinetDepthRule` has exactly three arms and no default, and `depthFollowsSetting`'s comment says a
  fourth arm is meant to be *"a compile error here instead of a silent `false` at every call site"* —
  by design, so adding one is a sweep of every call site, not an edit.

Concretely the wave is: a new catalogue entry (a deep wall cabinet whose `frameDepthMm` is
`cabinetDepthMm − WALL_FRONT_ASSEMBLY_MM`, exempt from ADR 0028's map) or a fourth depth-rule arm;
`catalogEquivalentId` on the two seeded rows repointed at it; that entry's front population, door
count, handle declaration, `occupiedDepth` declaration, pricing shape and offer-list disposition all
decided, because `resolveRebuildBody` will hand it to `evaluateInsertFit`;
`packages/three-adapter/src/decomposed-bodies.ts:141-146` and `PINNED_DEEP_TOP_DEPTH_M`
(`kitchen-parts.ts:279`) re-sourced; and the ADR 0028 exemption recorded, since a wall body that
skips the head-clearance map is exactly what that record exists to forbid.

### What else it touches — counted, not estimated

**16 test files** name the two build ids or the pinned constant, and they are not all a find-and-
replace. Three of them use the pin as the **witness that makes an adversarial suite able to fail**:

- `apps/web/tests/store/qa-6k-c-frozen-source.adversarial.test.ts` — its whole discrimination rests
  on the source entry *"which declares 600 at every setting — so the source never declared 699,
  `isItsSourcesDeclaration` is false at the start of the shrink"*. Unpin it and the two red/green
  pairs that proved wave 6K-c's fix stop discriminating.
- `packages/configurator-domain/tests/commands/set-cabinet-depth.plans-against-the-frozen-extent.test.ts`
  — pins the per-setting count of pinned rows reachable through the planning map, deliberately per
  setting rather than summed.
- `apps/web/tests/store/cabinet-depth-frozen-source.test.ts` — `PINNED_TOP_BUILD_ID`.

And unpinning **both** rows empties the `pinned` arm of `CabinetDepthRule` in the shipped kitchen
entirely, which triggers
[ADR 0093](0093-a-rule-the-shipped-kitchen-cannot-exercise-owes-a-witness-not-a-moved-fixture.md)
decision 1 — *"a ruled behaviour that the tree cannot distinguish from its own absence is unshipped"*
— so a synthetic witness design must be written for an arm that would then have no population. That
is new fixture work whose whole purpose is to keep an existing rule falsifiable.

**Verdict, in the owner's terms: not small.** Two production packages, a new catalogue entry or a new
rule arm, an ADR 0028 exemption, 16 test files and an ADR 0093 witness debt. It is a wave.

## Finding 3 — item 9's fix is not small either, and both cheap versions relocate the problem

### The gap, measured

Derived from declared constants, corroborating the adjudication:

| Seam (wall B) | @600 | @700 |
| --- | --- | --- |
| `p9` `wall-corner-return-570` ends | 1185 | 1255 |
| `p5` `tall-oven-tower-600` begins | 1200 | 1300 |
| **gap** | **15 mm** | **45 mm** |
| `p21` `wall-corner-return-570-top` ends | 1185 | 1255 |
| `p22` `wall-2door-600-deep-top` begins | 1200 | 1300 |
| **gap** | **15 mm** | **45 mm** |

It triples rather than doubles; the owner estimated from a photograph. The 30 mm is
`alongWallShiftMm`'s two chains: `base-formula` reaches `baseCarcassDepthMm` (560 → 660, **+100**)
and `wall-map` reaches `wallCarcassSeatDepthMm` (291 → 361, **+70**).

**Note that the gap is not new at 700 — 15 mm of it ships at 600 today**, and has since the reference
room was authored. Closing it at 700 while leaving 15 mm at 600 would be an arbitrary rule; closing
it at both is a change to the shipped 600 mm kitchen.

### Both declarations are correct, and that is what makes it structural

The obvious "fix" is to put the two bands on one chain. Traced, it is wrong in both directions:

- **Put the deep tops on `wall-map`** (+70, matching the corner return). `p22` sits directly above
  `p5`, the oven tower, which is a full-height column on `base-formula` and slides +100. The top
  cabinet would end up **30 mm off the column it hangs over** — a wall cabinet no longer aligned with
  its own column, which is a worse artefact than a gap in a wall.
- **Put the corner returns on `base-formula`** (+100, matching the columns). Wall A's wall-band
  corner body only gains 70, so the return would pull 30 mm away from the corner it exists to close —
  and a corner return is structural ([ADR 0021](0021-corner-returns-are-structural-in-data.md)), so
  its width cannot take up the slack.

`along-wall-chain-shift.ts:18-22` states this in its own header: *"A single uniform shift is wrong for
one of the two by 30 mm… The 30 mm it leaves in wall B's top row at 700 is the product's answer and
not a defect to smooth away."* The measurement above is that sentence checked rather than trusted.
**Both chains are right; the gap is where they meet.**

### Closing it needs a concept the product does not have

The only honest shape is to let something absorb the 30 mm. There is no filler body in this product:
a grep of `packages/configurator-domain/src` and `packages/three-adapter/src` finds the word `filler`
only on `oven_filler_door_front`, a fixed facade over an oven cavity. And the empty-space machinery
cannot see a gap this size — `MIN_SPAN_M = 0.3` (`void-engine.ts:41`), so a free interval becomes an
opening only above **300 mm**. A 45 mm slot is invisible to every mechanism that exists.

So closing it means inventing a filler body kind: a catalogue entry, a geometry builder, a price
line, a front/handle declaration, validation, and a rule for when one is generated — under wave 6A3's
*"never a sum of widths"*, so it must be a derived consequence of the declarations rather than a
hand-tuned 30.

**Verdict, in the owner's terms: not small.** Larger than item 8, and it changes the 600 mm kitchen.

## Decision

**1. ADR 0058's acceptance of these two costs is void as an acceptance. The behaviours stand as the
status quo, not as a live ruling.**

ADR 0058 decisions 1–4 are untouched: the pin is still the declared mechanism, it is still an
exception on the entry rather than a constant, and waves 6H/6I/6J's criteria still hold. What is
struck is the **cost assessment** — the two paragraphs that accepted the 99 mm step and the 30 mm gap
*"at a depth nothing ships at"*. That premise is false and cannot be re-quoted as authority.

**Consequently, a decision to keep either behaviour must be a new dated decision made with 700 mm
shipping**, not a citation of ADR 0058. This record is not that decision; the owner's is.

**2. Item 8 and item 9 are answered separately, because they are separate mechanisms — and both
answers are the same.**

The owner is owed a per-item verdict and the two need not share a fate. Measured, they do:

| | Deliberate? | Small and side-effect-free? | Evidence |
| --- | --- | --- | --- |
| **Item 8** — deep tops stay at 600 | Yes (ADR 0058 decision 1), on a premise that has expired | **No.** The one-line version makes it ~2.4× worse and is irreversible; the real version is a new catalogue entry or a fourth depth-rule arm, an ADR 0028 exemption, 16 test files and an ADR 0093 witness | Finding 2 |
| **Item 9** — corner gap 15 → 45 mm | Yes (ADR 0089 decision 1), same expired premise | **No.** Both cheap versions relocate the 30 mm somewhere worse; the honest version invents a filler body kind the product does not have, and changes the 600 mm kitchen | Finding 3 |

**3. The recommendation put to the owner, stated so it is a choice and not a fait accompli.**

- **Item 8** — the outcome the owner wants *is* the right product answer and is reachable: deep tops
  finishing at the cabinet-depth line would step 38 mm against the oven tower, −1 mm (flush) against
  the pantry and 42 mm against the fridge at 700, restoring the 600 mm relationship. **It is a wave,
  not a fix.** Recommend: keep the pin for now, and schedule it if the owner wants the relationship
  back. Do **not** re-offer "follow their column", which ADR 0058 finding 3 rejected for putting
  `p24` at an unmanufacturable 742 mm (`docs/BACKLOG.md` entry 15).
- **Item 9** — recommend **accept**, now on an honest premise: the two chains are each correct, the
  gap exists at 600 as well, and nothing short of a filler body kind closes it.

**4. What must not happen.** Neither item may be "fixed" by editing a declaration without the wave
behind it. Both single-declaration edits are available, both compile, and both make the shipped
kitchen worse in a way no existing gate is written to catch — item 8's is caught by
`seeded-equivalent-depth-agreement.test.ts` only because that gate exists; item 9's is caught by
nothing at all.

## Alternatives considered

- **Answer the owner "yes, it is specially designed" and close both.** Rejected. It is true of the
  behaviour and false of the acceptance, and letting an expired premise be re-accepted as a live
  decision is exactly the failure this directory exists to prevent.
- **Amend ADR 0058 in place rather than write a new record.** Rejected on the project's own rule:
  ADR 0058 is Accepted and carries the owner's 2026-09-02 choice, so a change of premise is a new
  dated record citing the old one. The two paragraphs it overtakes are struck in place there and
  pointed here.
- **Split items 8 and 9 into two records.** Rejected. They are two costs the same record accepted on
  the same premise and the owner met both in one session; deciding one without the other leaves the
  kitchen half-corrected at 700 mm. They are answered *separately inside* one record, which is what
  the owner actually asked for.
- **Estimate the cost rather than measure it.** Rejected — the owner's acceptance is conditional on
  the size of the fix, so an estimate would be the load-bearing number in their decision. Every
  figure above is read off the code or off `buildKitchenLBodyCatalog` at both declared depths.
- **Schedule item 8's wave now, since the answer is "it is a wave".** Rejected: the owner said "only
  if this is a small fix", and it is not, so the next move is theirs. Scheduling it would answer a
  question they did not ask.

## Consequences

- **The owner gets two sentences rather than a document:** both behaviours are deliberate, but the
  reason they were accepted no longer holds; and neither fix is small, so under their own stated
  condition both stay as they are unless they decide to spend a wave on item 8.
- **ADR 0058's two cost paragraphs are struck in place and pointed here.** Its decisions 1–4 stand
  unchanged, and this record creates no pin, removes none, and touches no declaration.
- **ADR 0089 decision 1 is untouched and is confirmed rather than overtaken** — this record's finding
  3 is that record's own reasoning re-measured, and it agrees with it.
- **`docs/BACKLOG.md` entry 15 is unaffected.** "Follow their column" remains rejected and its 742 mm
  defect remains on the insert path.
- **Nothing in this record is implementable.** No file under `packages/` or `apps/` changes as a
  result of it. The next artefact is an owner decision, and if it is "spend the wave", that wave's
  plan is written then.
- **A third declared depth would make item 8 worse and item 9 wider**, since both costs scale with the
  distance from 600. Whoever proposes one re-reads this record first.
