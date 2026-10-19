# ADR 0103 — A standing body is re-planned when something is inserted beneath it, and a delete leaves it alone

Status: Accepted (**answers [ADR 0102](0102-a-recorded-source-must-explain-its-depth-and-a-second-authority-in-a-test-is-the-defect-laundered.md)'s
*Not decided here* question — it is no longer open**; fills a gap in
[`DEVELOPMENT-SPEC.md`](../design/DEVELOPMENT-SPEC.md) §5.2; confirms
[ADR 0028](0028-wall-depth-is-derived-from-the-worktop.md) decision 5,
[ADR 0055](0055-a-depth-change-migrates-the-stored-design.md) decision 1,
[ADR 0060](0060-a-column-publishes-a-build-depth-beside-its-clearance.md) decisions 1 and 5,
[ADR 0076](0076-a-probe-lease-is-a-scoped-borrow-and-the-store-publishes-no-probe.md) decisions 1 and 2,
[ADR 0099](0099-a-colour-is-chosen-at-two-levels-and-the-cabinets-wins.md) decisions 2 and 5,
[ADR 0011](0011-m3-insert-contract-gaps.md) Gap D; **overturns nothing**)
Date: 2026-09-08
Type: Finding + Decision
Milestone: M6 — opens wave **6Z**; independent of wave 6Y

## Context

The owner was asked two things and has answered both. This record carries the answers, the
measurements behind them, and the eight design questions the implementing wave would otherwise have
to invent answers to mid-flight.

### The owner's first ruling — the 400 mm rebuild is correct, and the question is closed

ADR 0102's *Not decided here* section left one question open:

> Delete the pantry, keep the top, change the depth, and a cabinet the customer never touched goes
> from 600 mm finished to 400 mm.

It offered two answers: *(a)* leave it — the cap is a head-clearance rule and there is now a worktop
to lean over; *(b)* a top built deep holds its depth until it is itself replaced.

**The owner chose (a)**, and gave the reason in their own words: with the whole column emptied, the
design should not count on cabinets that used to be there; 400 is right because you would expect
ordinary, non-full-height cabinets below.

> **ADR 0102's open question is answered and must no longer be listed as open**, here, in ADR 0102,
> in `docs/STATUS.md` or anywhere else. `docs/BACKLOG.md` entry 56 is unaffected — it records a
> different fact (a 269 mm shallower *empty column*) and remains wave 6Y's.

ADR 0028 decision 5 and ADR 0060 decision 2 are the rules that produce the 400, and they are
**confirmed**, not merely tolerated.

### The owner's second ruling — the rule stated positively, and the gap they asked to close

> *"if below is the [full-height] cabinet, the top cabinet should have the same depth of the
> [kitchen], and if I select a wall cabinet then on top of it I should select a cabinet that will
> have 700 depth."*

Refined by the owner into an operative form:

- **Re-derive only on an insert into the column beneath a standing body.** Decide from what now
  stands there: a full-height member beneath → the standing body takes the **lifted** depth (600 at a
  600 mm kitchen, 700 at a 700 mm one); no full-height member beneath → it takes the **capped** depth
  (330 at 600, 400 at 700).
- **Do not re-derive on a remove.** Removing the full-height cabinet leaves the standing body exactly
  as it is. The owner's stated reason: they may be about to replace it with another full-height
  cabinet, and re-planning on the delete would do the work twice and make the scene jump for no
  reason. **The interim state after a delete — a deep top with nothing under it — is accepted as
  transient.**

The asymmetry is deliberate and is recorded here so that a later reader does not correct it as an
oversight. There is **no mirror wave for the delete side, and none is to be opened.**

### Everything below was measured on 2026-09-08 at `ed6c545`, not argued

Driven through the ordinary store — `createConfiguratorStore`, `select`, `remove`, `insert`,
`setCabinetDepth` — on `KITCHEN_L_DESIGN` with the web fake probe. Every insert below went through
the offer list's own void and was accepted with `lastRejection === null`, so each is a route a
customer has. Seats are the persisted `body.seatDepthMm` in millimetres; a `recorded-shell` entry's
finished depth is its seat plus the 39 mm front assembly.

**The catalogue's own numbers, so nothing below is a coincidence.**

| Entry | `frameDepthMm` @600 | occupied @600 | `frameDepthMm` @700 | occupied @700 | `occupiedDepth` |
| --- | --- | --- | --- | --- | --- |
| `wall-cabinet` | 291 | 330 | 361 | 400 | `recorded-shell` +39 |
| `wall-2door-600-deep-top` | 561 | 600 | 661 | 700 | `recorded-shell` +39 |
| `tall-pantry` | 560 | 599 | 660 | 699 | `recorded-shell` +39 |
| `hood-600` | 700 | 600 | **900** | 700 | **`wall-plane`** |

`columnBuildDepthMm` answers 600 / 330 at a 600 mm kitchen and 700 / 400 at a 700 mm one, lifted and
capped respectively; less the 39 mm front assembly those are the four seats — 561, 291, 661, 361 —
that every line below is one of.

**S1 — delete the full-height cabinet, insert a *regular* one below. Defect.**

```
@600  load                col B|1.80 d=600 hFHU=true   p23/wall-2door-600-deep-top band=top  561
      delete p6           col B|1.80 d=600 hFHU=false  p23                          band=top  561
      insert base-cabinet col B|1.80 d=600 hFHU=false  p23                          band=top  561   ← owner: 291
@700  load                col B|1.90 d=700 hFHU=true   p23/wall-cabinet             band=wall 661
      delete p6           col B|1.90 d=700 hFHU=false  p23                          band=wall 661
      insert base-cabinet col B|1.90 d=700 hFHU=false  p23                          band=wall 661   ← owner: 361
```

**S2 — a shallow top, insert a full-height cabinet below. Defect.**

```
@700  delete p6 then 600 -> 700   col B|1.90 d=400 hFHU=false  p23/wall-cabinet 361
      insert tall-pantry below    col B|1.90 d=400 hFHU=TRUE   p23              361   ← owner: 661
      then 700 -> 600 -> 700      col B|1.90 d=700 hFHU=true   p23              661   ← self-corrects
```

**S3 — keep the full-height cabinet, remove the top, insert it back. Already correct.**

```
@700  delete p23                        col B|1.90 d=700 hFHU=true
      insert wall-cabinet at y0 2.20     n0/wall-cabinet 661   ✓
```

**S4 — empty both, insert the top first, then the one below.**

```
@700  emptied                            col B|1.90 d=700 hFHU=false
      insert wall-cabinet at y0 2.20     n0/wall-cabinet 361   ✓  the capped default, correct
      then insert tall-pantry below      col hFHU=TRUE          n0 still 361   ← owner: 661
      (variant) insert base-cabinet      col hFHU=false         n0 still 361   ✓  correct, stays capped
```

**The owner's own end-to-end scenario already works, which is what localises the defect.** Empty the
column, resize to 700, insert `tall-pantry`, then insert `wall-cabinet` above it: the wall cabinet is
written at **661**. Every *newly inserted* body gets the right depth for the column as it stands at
that moment — S3 and S4's first insert are the proof.

### Classification — one defect with three faces, and it is a contract gap

**S1, S2 and S4's second insert are three faces of one thing: nothing ever re-plans a body that is
already standing.** They are not three bugs and the wave must not be framed as three fixes.

**It is a contract gap, not an implementation defect.** DEVELOPMENT-SPEC §5.2 is written as *"build
one body into this opening"* — `g = b.mk(w, h, void.d)` — and says nothing about a body already in
the column. §7's head-clearance cap and ADR 0028 decision 5 are read by `resolveDepthM` at build
time, for the body being built. ADR 0011 Gap D already rules that `hasFullHeightUnder` is re-answered
on every derivation, and it is: measured, the flag flips correctly at S2's insert and at S4's second
insert. What no record has ever said is **when a standing body's depth is re-answered**. `setWidth`
and `setCabinetDepth` each say so for themselves; an insert did not, because until wave 6I2 put
`resolveDepthM` on the lifted arm there was nothing for it to say.

The reading that this is an implementation defect — ADR 0028 decision 5 taken as a *state* invariant,
so a 561 mm top over an unlifted column is an illegal state — was considered and is rejected below.
Adopting it would make S1's post-delete state illegal, and the owner has just ruled that state
**accepted and transient**.

## Decision

### 1. The 400 mm rebuild is accepted, and ADR 0102's open question is closed

Recorded as decided so that nobody re-asks the owner and nobody "fixes" it. The owner's own reason is
quoted in the Context above and is the ratio: **with the column emptied, the design does not count on
cabinets that are no longer there.** ADR 0028 decision 5 and ADR 0060 decision 2 are confirmed.

ADR 0102 receives an appended amendment saying so. Nothing in ADR 0102 is rewritten or struck.

### 2. The rule, stated positively, and the asymmetry stated as a decision rather than a gap

> **On a successful insert, every body already standing in a column the insert touched is re-planned
> at the column as it stands after the insert — through the same path the insert itself takes. On a
> remove, nothing standing is re-planned.**

The two outcomes the owner names are **not two branches**. They are what `resolveDepthM`
(`commands/insert-fit.ts:835`) already answers for a wall-band body: the lifted line where
`column.hasFullHeightUnder`, `min(declared, the column's clearance)` where it does not. **This wave
adds no depth arithmetic and must not add any.** A wave that writes a second answer for either
outcome has failed decision 5.

**The delete side is out of scope, permanently.** Not deferred, not a follow-up, not a backlog entry.
The owner's reason is a product reason — a delete is usually the first half of a replacement — and
the transient deep-top-over-nothing state is accepted. Anyone who later reads the asymmetry as an
oversight is reading this paragraph.

### 3. The trigger is *not* a flag flip, and this is the first thing an implementer would get wrong

The obvious design — "compare `hasFullHeightUnder` before and after and re-plan where it flipped" —
**is measurably wrong**. In S1 the flag is `false` before the insert and `false` after it, and S1 is
the case the owner reported first. In S4's variant the flag is `false` on both sides and the correct
answer is *no change*, which a flip-triggered design gets right by accident rather than by rule.

> **The trigger is: this insert wrote to a column that already held a body whose depth the column
> decides. The outcome is whatever `resolveDepthM` answers for that body at the column as it now
> stands — which may be the depth it already has, in which case the re-plan is a no-op and the
> placement is passed through by identity.**

**The affected column set**, stated so it is computable rather than described:

- every key `splitColumn` wrote — its `occupiedKey` and every remainder part; **and**
- every key whose `hasFullHeightUnder` answer differs between the pre-command records and the
  post-command records, measured **over the same extents**. The second clause exists because
  `isFullHeightUnder` (`void-engine.ts:1400`) asks about **overlap along the wall, not column
  membership**: a full-height body wider than its own column lifts its neighbours too. The shipped
  kitchen cannot exercise it — `B|1.20`, `B|1.80` and `B|2.45` are each lifted by a member of their
  own column and no seeded full-height body overlaps a neighbouring key — so it owes a **declared
  witness** (ADR 0093 decision 2), not a hopeful comment.

**Which face of the map, and where the comparison lives.** Both faces of the before/after comparison
are the **recorded** face (ADR 0090 Amendment B), and no derivation is added to get them:

- `insertBody`'s `input.columns` is the store's `recordedColumns` (`configurator-store.ts:426,452`);
- `splitColumn` already ends in `withCurrentFullHeightMembers(updated, recordsAfter)`
  (`commands/split-column.ts`), so `split.value.columns` is that same recorded map with the flag
  re-answered over the post-insert records.

So the comparison lives inside `insertBody`'s `applyPlacement`, **after** `splitColumn` and after
`refuseColumnDrift`, reading `split.value.columns` for "after" and asking
`withCurrentFullHeightMembers(split.value.columns, recordsBefore)` for "before" — the same extents,
the same key space, one function, two record sets. **Nothing reads the published face, and nothing
reaches for `deriveColumns`.** Publishing-face inputs to a recording decision is M6-AUD-005 and it is
not to be repeated.

### 4. Which standing bodies are re-planned, decided by declaration and never by name

Four exclusions, each read off a declaration the entry already carries. A list of build ids in the
command or in a test fails this decision (ADR 0022; ADR 0058 decision 2 — *"a constant that silently
stops tracking anything rots; a declaration is greppable and testable"*).

1. **`normaliseBand(definition.band) !== "wall"`** — excluded. `resolveDepthM` never consults
   `hasFullHeightUnder` for a base or column body; it returns `buildToTheClearanceM(opening.d)`.
   Nothing to re-answer.
2. **`depthFollowsSetting(definition.depthRule)` false** — excluded. ADR 0058's declaration, asked
   exactly as `setCabinetDepth`'s `movesWithTheSetting` asks it. A `pinned` or `manufactured-size`
   row's depth is not the column's to decide.
3. **`occupiedDepth.measuredFrom !== "recorded-shell"`** — excluded, **and this is the hood**.
   `hood-600` and `hood` are the only two wall-band entries in the catalogue that declare
   `wall-plane`; a `wall-plane` entry states where it finishes, and the column does not decide it.
   Re-planning one could therefore change nothing but its identity — and measured, it changes exactly
   that: `hood-600` → `hood`, `fixedWidth` **true → false**, handing the customer a width control the
   fixture deliberately withholds. That is product-logic review R3.2's defect, which `moveHood`
   (`commands/rebuild-resized-bodies.ts`) exists to prevent. **This wave will not deliver it through a
   new door.** See decision 11 for the pre-existing case where it already arrives.
4. **No `InsertableBody` resolvable** — excluded and left byte-identical. The wall corner returns
   (`wall-corner-return-570`, `-top`) are `recorded-shell`, follow the setting, and have no
   `catalogEquivalentId`; `resolveRebuildBody` returns `undefined` for them. `setCabinetDepth`
   *reseats* such a body because the setting it is measured against has moved. **An insert does not
   move the setting, so this wave neither rebuilds nor reseats them — it writes them through
   untouched.** A reseat here would be a measurement taken for no reason, and ADR 0077 decision 1's
   joint-seat case shows what an unnecessary measurement costs.

On the shipped kitchen the surviving population is exactly the wall and top carcasses:
`wall-cabinet`, `wall-lift`, `open-shelf`, `open-shelf-600`, and the seeded `wall-*` and `wall-*-top`
rows including the three deep tops.

### 5. The mechanism — `rebuild`, through a narrowed input, in its own module

**A rebuild goes through the same path an insert takes** (ADR 0055 decision 1). `rebuild`
(`commands/rebuild-resized-bodies.ts:60`) is that path: `openingFromPlacement`, `evaluateInsertFit`,
the probe, `refuseBuiltSize` and `refuseUnusableMeasurement`. This wave reuses it and writes no second
one.

**`rebuild`'s input is narrowed from `SetWidthInput` to the five fields it actually reads.** Its own
comment already names them — *"it reads `design`, `catalog`, `columns` and `probe` only"* — and
`set-cabinet-depth.ts` already has to fabricate the other two, with a `UNUSED_BY_REBUILD = ""` target
and `widthMm: 0`. A third caller fabricating them a third time is how a sentinel becomes load-bearing.

> **A new `RebuildInput { design, catalog, columns, probe, occurredAt }` in
> `commands/width-resize-model.ts`, which `SetWidthInput` extends.** `rebuild` and `moveHood` take
> `RebuildInput`. `set-cabinet-depth.ts`'s two sentinels are **deleted**, not moved. It is a type
> narrowing with no behaviour change, and `pnpm typecheck` is its proof.

The cheap alternative — `insert-body.ts` fabricates a third `SetWidthInput` — is rejected: it makes
the insert command depend on the width-resize model and puts a third `widthMm: 0` in the tree.

**The new module is `packages/configurator-domain/src/commands/replan-dependent-members.ts`**, one
exported function, called from `applyPlacement`. It returns the placements to write in document order
with untouched ones passed through **by identity**, or a rejection. It does not live in
`insert-body.ts`: that file is already 402 lines and its head comment says it is one code path for
§5.2 and §5.3, which this is not.

**`setCabinetDepth` does not adopt the new module.** Its loop also reseats structural bodies and
counts rebuilds, and extracting a shared driver for two loops that agree on one of three branches
would be a shared abstraction bought with a wrong one.

### 6. `carriedAppearance` — the wave adds no writer of `body.finish`, and this is a criterion with a test obligation

`carriedAppearance` (`insert-body.ts:320`) writes `finish: replaced.finishKey` on a rebuild.
`PlacementRecord.finishKey` is `placement.body.finish` and **only** that (`void-engine.ts:557`) — the
stored override, never the resolved colour — so today the write is a copy and preserves absence as
absence. That is what makes ADR 0099 decision 2 and decision 5's third and fourth rows hold.

**It is a landmine and not hypothetically.** W3's adversarial QA recorded the 3D scene as not
resolving the global colour, and recorded why the obvious wiring was not shipped: *"the obvious wiring
makes `carriedAppearance` stamp the resolved colour into every cabinet an insert or resize touches,
which decision 2 forbids."* This wave puts **more cabinets** through `carriedAppearance` — bodies the
customer did not select — so it widens the blast radius of that future mistake.

> **The ruling: this wave adds no argument to `carriedAppearance`, no new caller of
> `resolvedFinishOf`, and no new writer of `body.finish`. `carriedAppearance` remains the only one.**

And the guard is asserted on **key presence**, not on rendered colour, because an assertion on the
resolved value passes while the key is being stamped:

> A placement that carried no `finish` key before a re-plan has **no `finish` key at all** after it —
> `"finish" in placement.body === false` — and one that carried an override carries the identical
> value. Asserted at both settings, and with `design.settings.finish` set to a colour that differs
> from the material's default, so a stamp would be visible.

The one drop `carriedAppearance` can perform — a chosen finish lost because the incoming body declares
`canFinish: false` — is **unreachable in this wave's population** and is asserted rather than assumed:
of the re-plannable rows, `wall-2door-600-deep-top` → `wall-cabinet` is `canFinish: true` on both
sides, and `open-shelf-600` → `open-shelf` is `canFinish: false` on both, so no customer can have
chosen a finish that this wave could drop.

### 7. Refusal — the insert refuses whole, and the offer list is not taught to predict a probe

`rebuild` can return `{ ok: false }`. The insert is **atomic**: either the placed body and every
re-planned body are written, or the design is returned unchanged with one refusal. A partially
re-planned column is the "silent mixture" `rebuildEveryBodyAt` refuses by name, and it is the state
this wave exists to remove.

DEVELOPMENT-SPEC §9's *"never offer what cannot be satisfied"* is answered in two parts, because the
refusals fall into two classes and they have different answers:

- **Pre-probe refusals** — `evaluateInsertFit`'s band, width and height guards. `offersFor`
  (`queries/offers.ts`) already runs exactly this evaluation for the body being inserted and publishes
  a disabled-with-reason verdict (ADR 0032). It could be extended to run it for the dependent members
  too, since it needs no probe. **This wave does not extend it, on a measurement rather than on
  taste**: its first work item enumerates every offered body against every void of the shipped
  kitchen at both settings and records whether any dependent re-plan refuses. **If the enumeration
  finds one, the wave stops and splits** — the offer-list extension becomes wave **6Z-a** and lands
  before 6Z. If it finds none, no extension is written and the enumeration is the evidence.
- **Post-probe refusals** — `BUILT_SIZE_MISMATCH`, `MEASUREMENT_UNUSABLE`, `NON_INTEGER_MILLIMETRES`.
  These are **already outside the offer list's reach for the body being inserted**: `offersFor` is a
  pre-probe evaluation and holds no probe (ADR 0076 decision 1 — nothing holds a lease). `rebuild`'s
  own comment states the stance: *"§9 wants that refusal to be unreachable in the first place: this
  is the backstop, not the gate."* This wave widens an existing exposure by one body; it does not
  create a new class of it. Recorded plainly rather than glossed.

**The refusal names both bodies.** A new `RejectionDetail` code in `commands/rejection.ts` whose
sentence names the body the customer asked to insert **and** the body above it that could not be
rebuilt. Passing the inner detail through unchanged is rejected: it would name a cabinet the customer
never touched, in a sentence about one they did, with no connective. The code owes a **declared
witness** (ADR 0093 decision 2) built on a synthetic catalogue entry, because the shipped kitchen
cannot reach it — and the sentence is an input to M6B's extraction, listed there rather than
discovered.

### 8. The probe lease — no new lease, and the wave must not create one

`insertBody` takes a built `probe: BodyProbe`; the store leases one for the whole command at
`cabinetDepthMmOf(current)` and releases it on every path (`configurator-store.ts`, ADR 0076
decision 1). **The re-plan runs inside that bracket and reuses that probe.**

Two consequences, both falsifiable by inspection:

- **`insertBody`'s signature does not change.** It keeps `probe: BodyProbe` and does **not** acquire a
  `probeAt: BodyProbeFactory`. `.use(` appears in neither `insert-body.ts` nor
  `replan-dependent-members.ts`. A lease taken inside a command that was handed a probe is two leases
  for one command, which is the shape ADR 0076 decision 3 collapsed.
- **The probe is at the right depth by construction.** An insert does not change
  `settings.cabinetDepthMm`, so the lease the caller took is at the design's own setting and there is
  no depth to pass around. This is the one respect in which the re-plan is *simpler* than
  `setCabinetDepth`, which must lease at the depth it is moving to (ADR 0074 decision 3, wave 6K-e).

### 9. What the re-plan must not do — the frozen map, the slide, and the extents

`setCabinetDepth` does substantial extra work that an insert has no business doing. Each is named so
that a wave which copies its loop is caught:

- **No `republishedFrozenMap`, no `frozenMapAtCabinetDepth`.** An insert publishes
  `splitColumn`'s map through `BodyInsertedEffect.columns`, exactly as today. `frozen-map-at-cabinet-depth.ts`
  answers a question about a **setting change** and is not called.
- **No `heldRunAcrossTheCommand`, no `frozenExtentsSlidAlongTheWall`, no `alongWallPositionAtMm`.**
  ADR 0089's slide is a consequence of a corner body getting deeper; nothing slides on an insert.
- **No `deriveColumnsOverFrozenExtents`, no re-taking of §3.2's MAX.** ADR 0011 Gap D: a column's
  extent is frozen and an insert is not one of the three commands that moves it beyond
  `splitColumn`'s own division.
- **No seat clearing.** `planningDesign`'s `withoutRecordedSeat` exists because the *setting* the
  seats were measured at has moved. It has not. The re-planned body's new seat comes from the probe,
  as any rebuild's does; every other body keeps the seat it has.

> **The falsifiable form, and it is ADR 0079 decision 9's discipline applied to this wave: for every
> state in S1–S4 at both declared settings, every `Column.d`, every `Column.w`, every column key and
> every `depthFromBuildId` the store publishes is identical before and after this wave.** The wave
> moves seats and build ids; it moves no extent. Anything else is this wave publishing a different
> kitchen, which it has no mandate to do.

A consequence worth stating because it looks like a defect and is not: after S1@600's fix the column
publishes `d = 600` in session while a standing `base-cabinet` measures 620 mm of clearance. That gap
exists **today, unchanged**, for any insert into a column whose frozen extent is shallower than the
inserted body; the reload derivation resolves it to 620. It is Gap D working, not this wave.

### 10. Wave 6Y, and the witness this wave does not touch

**`apps/web/tests/store/qa-6y-lifted-column-source.witness.test.ts` performs no insert.** Its six
tests drive `setCabinetDepth` and `remove` only — checked test by test. **This wave changes no state
it asserts, and the file is byte-identical afterwards.** That is an acceptance criterion, not an
expectation.

**But the shared helper's behaviour does change in insert-reached states, and that is a coordination
point rather than a licence.** Measured today, S4's *"then insert tall-pantry"* state reports
`B|1.90 d=700.0 mm, source wall-cabinet declares 400.0 mm at 700` from `unexplainedColumns`. After
this wave the standing wall cabinet's seat becomes 661, which is exactly
`columnBuildDepthMm({ 700, hasFullHeightUnder: true }) − 39` — so ADR 0102 decision 3a's narrowed
exemption (*keyed on the member actually standing there, at the seat the lifted arm produces*) begins
to fire where it did not, and the state stops being reported.

> **The wave enumerates, state by state, every string
> `unexplainedColumns` / `columnsWhoseSourceDoesNotDeclareTheirDepth` /
> `unexplainedStoredEntries` reports across S1–S4 at both settings, before and after — and no state
> gains one.** A state that stops being reported because the exemption now applies is recorded with
> its reason; a state that starts being reported is a defect in the wave.
>
> **`apps/web/tests/support/frozen-source-invariant.ts` is not edited by this wave**, nor is
> `void-engine.ts`'s `restoredColumns`, nor `frozen-map-at-cabinet-depth.ts`. Those are 6Y's, and 6Y
> is independent: it moves recorded sources, this moves member seats, and neither needs the other.
> **Whichever lands second re-runs the other's suites**, and 6Y's plan inherits this sentence.

### 11. The product consequence the owner has not been shown, recorded so it is not discovered later

**In S1 at 600 mm, putting a base cabinet under the deep top replaces the product.** `p23` is
`wall-2door-600-deep-top`, a genuinely deep catalogue row; re-planning it to 291 resolves it through
ADR 0022's `catalogEquivalentId` to an ordinary `wall-cabinet`, band `top` → `wall`. The migration is
permanent — ADR 0022's swap is one-way — so delete-pantry → insert-base → delete-base → insert-pantry
does **not** return the original document. That is ADR 0055's already-accepted consequence
(*"600 → 700 → 600 is not guaranteed to return the exact original document"*) reached by a new route,
and it is accepted on the same grounds.

**This is not a question to reopen.** The owner ruled the resize explicitly — *"you should resize the
top cabinet that was full depth and now should have 300 or 400 millimeters"* — and the same swap
already happens on any depth change (measured: `setCabinetDepth(700)` alone turns `p23` into
`wall-cabinet`). It is recorded as a **consequence**, and the wave owes the owner the list of what
they will actually see move: `buildId`, band, rendered label, buildable width set, and the price line,
each with its before and after.

Two things that were checked and do **not** move, so the list stays honest: `isPushOpenByDefault`
reads `record.frame.y0` and the re-plan keeps `y0Mm` at 2200, so the top row's push-open default is
unchanged; and `deriveColumnKey` reads the along-wall coordinate only, so no re-planned body changes
column.

### 12. The hood's depth-change swap is a separate, pre-existing finding and gets a backlog entry

Found while establishing decision 4's exclusion and recorded rather than absorbed. Measured at
`ed6c545`: an ordinary `setCabinetDepth(700)` turns `p13` from `hood-600` into `hood` and flips
`fixedWidth` **true → false**. The seat moving 700 → 900 is *correct* — a front-hung 500 mm hood at a
700 mm kitchen centres at 450 (ADR 0039 decision 2) — but the width control is the R3.2 regression
`moveHood` was written to prevent, arriving through the depth command instead of the resize.

**It is not this wave's, and this wave must not fix it.** `docs/BACKLOG.md` **entry 57**.

## Alternatives considered

- **Trigger on `hasFullHeightUnder` flipping.** The design an implementer reaches for first, and
  **measurably wrong**: S1 is `false` before and after, and S1 is the case the owner reported.
  Rejected on the measurement, not on principle.
- **Branch on what was inserted — "full-height → lifted, regular → capped".** This is the owner's own
  wording and it is a correct *description* of the outcome, but writing it as two branches puts a
  second author beside `resolveDepthM` for a question `resolveDepthM` already answers. Rejected under
  ADR 0028 decision 4's standing rule that a depth is a declaration resolved in one place, and because
  a second author is how the offer list and the engine came to disagree before (backlog entry 10).
- **Re-plan on the delete as well, for symmetry.** Rejected by the owner, in their own words and for
  a product reason: a delete is usually the first half of a replacement, so re-planning would do the
  work twice and make the scene jump. Recorded as a decision precisely so that "the delete side is
  missing" is not later filed as a defect.
- **Re-derive the whole design on every insert, by calling `setCabinetDepth` at the current
  setting.** It produces exactly the right answer — measured, the round trip is where every target
  number in the Context table came from — and it is **rejected**: it slides wall B's run, re-takes
  §3.2's MAX over every column, republishes the frozen map and reseats every structural body, on a
  command that changed one opening. Decision 9 lists what it would do that an insert must not. The
  round trip stays as the wave's **oracle** — the state the re-plan must reproduce for the affected
  members — and never as its mechanism.
- **Classify it as an implementation defect against ADR 0028 decision 5 read as a state invariant.**
  Tempting, because "a 561 mm top over an unlifted column" does look illegal. **Rejected**: adopting
  it makes S1's post-delete state illegal, and the owner has just ruled that state accepted and
  transient. A classification that contradicts the ruling it is meant to serve is the wrong one.
- **Let `insertBody` build a third `SetWidthInput` with the existing sentinels.** Cheapest, and
  rejected under decision 5: it makes the insert command depend on the width-resize model and puts a
  third `widthMm: 0` in the tree for a command that resizes nothing.
- **Teach `offersFor` to predict the dependent re-plan now.** Rejected as unmeasured: it is real work
  for a refusal nobody has yet shown to be reachable. Made **conditional** instead, on the wave's own
  first work item, with a named successor wave if the enumeration finds one.
- **Leave the insert to succeed and the standing body untouched when the re-plan refuses.** Rejected
  by name: it is the silent mixture `rebuildEveryBodyAt` already refuses, and it is the state this
  wave exists to remove.
- **Fix the hood's `fixedWidth` flip in this wave, since it was found here.** Rejected — it is a
  defect in `setCabinetDepth`'s use of `resolveRebuildBody`, reachable with no insert at all, and
  bundling it would make one wave answerable for two unrelated verdicts. Backlog entry 57.

## Records swept before deciding, and how each is settled

| Record | What it says | Settled how |
| --- | --- | --- |
| [ADR 0102](0102-a-recorded-source-must-explain-its-depth-and-a-second-authority-in-a-test-is-the-defect-laundered.md) *Not decided here* | One owner question: a deep top loses 200 mm when the column beneath it is deleted and the depth then changes. | **Answered** (decision 1). The owner chose *(a)*. Amended in place by appending; nothing struck. |
| ADR 0102 decisions 1–4 | Decision 10 point 2 confirmed; the second authority refused; the interim shape; wave 6Y. | **Untouched and independent** (decision 10). This wave edits neither the helper nor `restoredColumns`. |
| [ADR 0028](0028-wall-depth-is-derived-from-the-worktop.md) decisions 4, 5 | A declaration, never a computation; a full-height member lifts the cap. | **Confirmed.** Decision 5 is the rule that makes the 400 correct, which is what the owner accepted. Its consequence clause is already superseded by ADR 0101 decision 5 and is not reopened. |
| [ADR 0060](0060-a-column-publishes-a-build-depth-beside-its-clearance.md) decisions 1, 2, 5 | A build depth is a declared size; over a lift the declared line is a target, not a ceiling. | **Confirmed and reused unchanged.** Decision 5 is why a re-planned top takes 700 rather than the shallower of two numbers. |
| [ADR 0055](0055-a-depth-change-migrates-the-stored-design.md) decision 1 | The rewrite runs through the normal command path, not a bespoke transform. | **Obeyed** (decision 5): the re-plan goes through `evaluateInsertFit`, the probe and the built-carcass re-check. Its accepted consequence — a round trip is not guaranteed to return the original document — is the precedent for decision 11. |
| [ADR 0058](0058-the-two-deep-top-cabinets-are-pinned.md) decision 2 | Declare the exception on the entry; a constant that stops tracking anything rots. | **Obeyed** (decision 4): every exclusion is a declaration, none is a build-id list. |
| [ADR 0022](0022-seeded-entries-declare-their-catalogue-equivalent.md) | A seeded entry declares its catalogue equivalent; identity is never guessed. | **The mechanism of decision 11's product replacement**, and the reason it is a consequence rather than a defect. |
| [ADR 0011](0011-m3-insert-contract-gaps.md) Gap D | A column's extent is frozen; `hasFullHeightUnder` is re-answered every derivation. | **Confirmed and load-bearing.** The flag is already current at the insert — measured — which is what makes decision 3's comparison possible without a new derivation. Decision 9 forbids re-taking the extent. |
| [ADR 0073](0073-a-frozen-extent-records-the-body-its-depth-came-from.md) decisions 1–3 | The entry records the `buildId` whose clearance supplied its depth; a depth change re-asks it. | **Unchanged.** This wave writes no extent and therefore records no source. |
| [ADR 0076](0076-a-probe-lease-is-a-scoped-borrow-and-the-store-publishes-no-probe.md) decisions 1, 2 | Nothing holds a lease across a boundary; the store leases per command at the design's depth. | **Obeyed** (decision 8): the re-plan runs inside the caller's existing bracket and takes none of its own. |
| [ADR 0079](0079-a-republished-depth-names-the-body-it-came-from.md) decision 9 | *"No rule here changes a published depth, only the record beside it."* | **Applied in the same direction** (decision 9): this wave changes member seats and no published `Column.d`, and owes the identity as its criterion. |
| ADR 0079 decision 10 point 2 | The pairing invariant, in a shared helper the ordinary store suite calls. | **Not touched, and its readings are enumerated** (decision 10). No state gains a report. |
| [ADR 0080](0080-an-empty-space-follows-the-setting-and-a-fallback-is-not-a-ratchet.md) decision 4 | A depth `columnBuildDepthM` produced carries no source, because claiming one would be an invention. | **Not reached.** This wave publishes no extent, so it claims no source for one. |
| [ADR 0088](0088-a-depth-change-plans-against-the-frozen-extent-and-re-derives-only-the-depth.md) decisions 1, 2 | A depth change plans against the frozen extent; a wave states why a rule lives where it does. | **Distinguished** (decision 9). Its planning machinery belongs to a setting change and is explicitly not called here; decision 5 states where the new rule lives and why. |
| [ADR 0090](0090-a-frozen-space-slides-with-its-run-and-follows-the-body-it-recorded.md) Amendment B | Two faces of one map; a room-derived pass may bound what is published, not what is recorded. | **Obeyed** (decision 3): both operands of the before/after comparison are the recorded face. |
| ADR 0090 decision 7 | *"An invariant edited to accommodate a defect is the defect laundered."* | **Respected.** This wave edits no invariant and no instrument; it changes production and leaves 6Y's witness alone. |
| [ADR 0091](0091-an-instruments-premise-is-re-quantified-and-the-product-claim-inside-it-becomes-a-wave.md) decision 1 | Three questions before an instrument premise may be re-quantified. | **Not engaged**, and stated so deliberately: nothing here re-quantifies an instrument. Decision 10's enumeration exists so that a helper's changed *readings* are recorded as measurements rather than absorbed. |
| [ADR 0093](0093-a-rule-the-shipped-kitchen-cannot-exercise-owes-a-witness-not-a-moved-fixture.md) decisions 1, 2 | A rule the tree cannot distinguish from its own absence is unshipped; the test declares its own witness. | **Obeyed twice** (decisions 3 and 7): the overlap case and the new refusal code each owe a declared witness, neither is fed by moving a fixture. |
| [ADR 0097](0097-adr-0058s-costs-were-accepted-at-a-depth-nothing-shipped-at-and-that-premise-has-expired.md) Amendment A | Item 8's fix is small in production; `resolveDepthM` plans the lifted line. | **Confirmed by measurement here.** The same lifted arm is what this wave re-runs for a standing body. |
| [ADR 0099](0099-a-colour-is-chosen-at-two-levels-and-the-cabinets-wins.md) decisions 2, 5 | A global colour change writes nothing to any cabinet; clearing deletes the key; a new cabinet acquires no colour. | **Protected explicitly** (decision 6), with a key-presence criterion rather than a value one. W3's QA note is quoted as the reason. |
| [ADR 0101](0101-a-lifted-columns-depth-is-declared-and-the-three-deep-tops-follow-the-setting.md) decisions 1–5 | The three deep tops follow the setting; the 600 mm kitchen is byte-identical as it loads. | **Unchanged.** This wave moves nothing at load; every state in S1–S4 needs at least one command. |
| [`DEVELOPMENT-SPEC.md`](../design/DEVELOPMENT-SPEC.md) §5.2, §5.3, §9 | The insert path; a swap is the same path; never offer what cannot be satisfied. | §5.2 is **extended** by decision 2 — it described one body and now describes the column. §5.3 means the rule reaches a swap for free (decision 2). §9 is answered in two parts by decision 7. |
| [`docs/WORKFLOW.md`](../WORKFLOW.md) | Plan → implement → adversarial QA → review → verify → commit → archive; the tier is named in the dispatch. | **Followed.** 6Z is tier **Full + visual**: it changes a domain rule and it changes what the customer sees in the scene. |

**Nothing found in the sweep contradicts either ruling, and nothing here overturns a dated
decision.** The one record that comes closest — ADR 0028 decision 5, which produces the 400 the owner
was asked about — is **confirmed by** the ruling rather than overturned by it.

## Consequences

- **Wave 6Z is opened** — *a standing body is re-planned when something is inserted beneath it* — with
  the file list and the acceptance criteria in
  [`milestones/done/M6-price-and-global-settings.md`](../milestones/done/M6-price-and-global-settings.md).
  Tier Full + visual. It gates on nothing and gates nothing; it is independent of 6Y and the two may
  land in either order.
- **Wave 6Z-a is named but not opened.** It exists only if 6Z's first work item finds a dependent
  re-plan that refuses for a pre-probe reason, in which case 6Z stops and 6Z-a runs first (decision 7).
- **ADR 0102's *Not decided here* section is amended to Answered**, pointing here. Its decisions 1–4
  are untouched. `docs/STATUS.md`'s corresponding bullet is corrected in the same pass.
- **`docs/BACKLOG.md` entry 57 is added** for the hood's depth-change swap (decision 12). It is not
  6Z's and 6Z must not touch it.
- **The customer-visible consequence in decision 11 is owed to the owner as a list, not as prose.**
  The wave produces it; nobody re-asks the ruling.
- **Three doc comments go stale the moment 6Z lands** and travel with it:
  `insert-body.ts`'s head comment (*"one code path"* now also drives a dependent re-plan),
  `carriedAppearance`'s comment (*"for every member of the column it moves"* — now also for every
  member an insert re-plans), and `set-cabinet-depth.ts`'s `UNUSED_BY_REBUILD` paragraph, which
  describes a sentinel decision 5 deletes. A wave that changes the code and leaves the comments
  produces a file that argues against itself.
- **A third declared depth costs nothing here.** Every rule above is written against
  `resolveDepthM`, `columnBuildDepthM` and `declaredCabinetDepthsMm()`, none of which holds a literal.
- **This record closes no owner item on its own.** The owner's ruling is discharged when 6Z ships and
  they see a top that follows what stands beneath it.
