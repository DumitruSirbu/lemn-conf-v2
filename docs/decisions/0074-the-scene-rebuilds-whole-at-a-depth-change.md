# ADR 0074 — The scene rebuilds whole at a depth change, and exactly one kit is alive at a time

Status: Accepted
Date: 2026-09-04
Type: Decision + Finding
Milestone: M6 — wave 6K-b (the scene's half); adds wave 6K-e

## Context

`apps/web/src/scene/kitchen-stage.tsx:102` builds the kit with `makeKit({ cabinetDepthMm: WORKTOP_DEPTH_MM })`
inside a `useMemo(…, [])`, so **the 3D scene is built at 600 mm whatever the design carries**. Wave
6J-b shipped `setCabinetDepth`, which rebuilds every body at a new depth
([ADR 0055](0055-a-depth-change-migrates-the-stored-design.md) decision 1); wave 6K-a made the store
follow it; the scene does not. That call site is already recorded — it is
[ADR 0073](0073-a-frozen-extent-records-the-body-its-depth-came-from.md)'s finding, classified there
as an implementation defect and assigned to wave 6K. Wave 6K-b's headline criterion, *"changing it
visibly changes the model, not just a number, verified by real interaction at 390 × 844"*, is
unmeetable until it moves.

It is not a one-line change, and this record is about why. `stage` is a mount-lifetime memo holding
the kit, the shell, `solidsRoot`, `voidsRoot`, `room`, the light rig, the shadow ground and the
contact blob. It is a dependency of **seven effects** — the body/void sync (`:135`), the probe
attach/detach (`:145`), the stage seating (`:163`), the picker's pointer handlers (`:177`), the
selection outline (`:230`), the overflow marks (`:271`) and the teardown walk (`:302`) — and of
**five `<primitive>` mounts** (`:349-354`). Making it depend on the depth re-runs all seven.

Two shapes were on the table. A **full stage rebuild**, keyed on the design's cabinet depth. Or a
**narrow kit-and-shell swap** — rebuild only the kit and the shell, keep `room`, both roots, the
lights, the ground and the blob stable, so only the sync effect re-runs. The implementer proposed
the narrow shape and stated, correctly, that it had not proved the kit is safely swappable under the
mounted bodies. That proof is what this record supplies, and the answer is no.

## The proof: the kit is not swappable under mounted bodies

**`syncSolidBodies`' signature is a function of the record and of nothing else.** `signBody`
(`packages/three-adapter/src/scene-sync.ts`) joins `buildId`, `widthMm`, `heightMm`, the four frame
fields, `frame.d`, `handleMode` and the finish signature. A mounted body whose signature still
matches its record is *kept, instance for instance* — that is the whole point of the sync (M3 work
item 8), and it is why a resize does not discard an applied finish.

**A depth change leaves some records byte-identical, by design.** `setCabinetDepth`'s
`rebuildEveryBodyAt` asks `movesWithTheSetting` of each placement and pushes the untouched
`placement` when the answer is no. That is [ADR 0058](0058-the-two-deep-top-cabinets-are-pinned.md)'s
two pinned deep tops and every entry declaring `follows: "manufactured-size"` — `fridge-free-700`
among them, which ADR 0073 measured at 742 mm at both settings. Their `buildId`, width, height,
frame and seat are all unchanged, so `signBody` is unchanged.

**Therefore a kit swap leaves a mixed graph**: some bodies rendering from the new kit's geometry
cache and `KitMaterials`, others still rendering from the old kit's. From there both exits are
closed:

- **Release the old kit** and `releaseKitOwnedResources` disposes shared geometries and materials
  that the surviving pinned bodies still render from. `kit-disposal.ts` states the consequence in
  its own header: *"disposing one that a live object still renders from produces a black or
  invisible object rather than an error."* Three.js keeps the CPU-side attributes, so nothing
  throws — the pinned tops and the fridge go black or silently re-upload.
- **Keep the old kit** and every depth toggle leaks one kit's worth of materials and canvas
  textures, unbounded in a session. `kitOwnedResources` is a `WeakMap` keyed on `KitMaterials`, and
  the old `KitMaterials` is reachable from the surviving bodies, so nothing collects it.

Making the narrow shape safe therefore needs three new things that do not exist: kit identity inside
`signBody` (an adapter change, to force every body to be re-signed), a partial kit-release primitive
(`disposeKitAndStage` releases a kit only as part of a whole-stage teardown, and says why), and
deferred release ordering in the component (React runs cleanups *before* effects, so the old kit
must be released after the new sync has run, from a ref rather than from a cleanup).

**And it buys almost nothing.** By the proposal's own description the narrow shape still rebuilds
the kit and the shell — `makeKit` bakes roughly thirty procedural canvas textures, and
`buildKitchenShell` builds the whole 32-child reference room and keeps five. Those are the entire
cost. What it keeps stable is two `THREE.Group`s, three lights, a `PlaneGeometry(200, 200)` and a
256 × 256 blob. The narrow shape trades the ownership story for the cheap allocations only.

## Decision

**1. The stage memo is keyed on the design's cabinet depth, and the whole stage is rebuilt.** Every
object in it is new; nothing crosses a generation. `disposeKitAndStage`'s stated precondition — *"the
kit and the room it built must share a lifetime with this call"* — then holds by construction, which
is the property the narrow shape cannot have. The teardown effect already disposes the old stage in
its cleanup, in the declaration order `kitchen-stage-disposal.test.ts` pins; that order is unchanged
and the same test governs it.

**2. The narrow kit-and-shell swap is refused**, on the proof above rather than on preference. It
may be revisited only by a record that first changes `signBody`, and that record owes the same proof
in the other direction: that no mounted object can outlive the kit that built it.

**3. Exactly one kit is alive per mounted scene, and this is the standing invariant.** A toggle back
to 600 builds a fresh 600 kit; kits are not cached by depth. The store caches *catalogues* by depth
(`catalogsByDepthMm`, `configurator-store.ts:332`) and that is right — a `BodyCatalog` is plain data
owning no GPU resource. A kit is not: it owns buffers, materials and canvas textures, and a cached
kit is a live kit whose resources may never be released. Wave 6K-e's probe (the Finding below) builds
a **transient** kit at the target depth and disposes it when the command ends; it does not cache one.

**4. Both depths are passed to `makeKit`, and both are read from the domain.** Today's call site
passes `cabinetDepthMm` only and lets `wallDepthMm` fall to the adapter's `DEFAULT_WALL_DEPTH_MM`
(330). That is correct at 600 by coincidence of the default and wrong at 700, where
[ADR 0028](0028-wall-depth-is-derived-from-the-worktop.md)'s map declares 400 — a 70 mm error in
every wall carcass, which is ADR 0028's own reported defect arriving in the scene. `wallCarcassDepthMm`
is exported from the domain barrel through `catalog.ts` and is the number to pass;
`wallDepthMmForWorktop` deliberately is not exported, and must not be reached for.

**5. The reference-ghost invariant is preserved, and its statement is corrected.** The memo's comment
today reads *"built once per mount … a body deleted before this component mounts therefore cannot
return as an untagged reference ghost."* The arity is not what makes that true. `buildKitchenShell`
takes a `Kit` and no records; it filters the reference room by the fixed
`KITCHEN_L_SHELL_CHILD_NAMES` manifest and disposes the other 27 children. Building it N times
yields N identical shells with no customer body in any of them. **The guarantee is the fixed manifest
and the absence of a records argument, never the number of builds**, and the comment must say so —
otherwise the next reader takes the empty dependency array as the safety property and the invariant
dies the moment it is keyed. `syncSolidBodies` remains the sole owner of every customer body, and
`syncRunEndPanel` re-derives the panel's seat and visibility from the current records on the new
generation's first sync, so a shell built fresh at 3.51 is corrected before it is drawn
([ADR 0045](0045-the-run-end-panel-follows-the-run-it-closes.md)'s anti-invariant: a scene that
reached "no base run" by deletion and one loaded that way are one picture).

**6. The body probe is re-attached, and no render may observe it detached.** The probe closes over
the kit, so it must follow the generation — a probe holding the old kit is the Finding below, not a
saving. The detach/attach pair happens inside one commit's passive-effect flush (React runs all
cleanups, then all effects), so no render sees `isBodyProbeAttached: false` and no control flickers
from offered to refused. Two things make that safe rather than lucky, and both are asserted:
`insert` is gated on the flag and is never offered *and then* refused; and **the depth command itself
cannot be affected**, because it runs in the event handler, before the commit that rebuilds the
stage — `setCabinetDepth`'s `BODY_PROBE_UNAVAILABLE` refusal cannot fire from its own rebuild.

**7. The camera does not move when the depth changes.** `seatObjectOnStage` must run for the new
generation — it is what positions and un-hides the new contact blob and the new shadow ground — but
it also writes `camera.position`, `near` and `far`, and no camera goal is pending outside a preset
change. Re-running it unaltered would throw away the customer's orbit on every depth toggle: a
visible defect, and a worse one on a handset where orbiting is expensive. Either restore the camera
position and the controls target around the seating call for a non-initial generation, or split the
seating from the framing. `near`/`far` may be re-derived; the room's bounding sphere moves by at most
the depth delta.

**8. The M1 fidelity gate is not re-run and not extended.** It diffs `makeKit()` — the default, 600 —
against the unmodified vendored reference library at 1e-6 m, plus the preset captures. It is a gate on
the *builders*, and this wave changes no builder and no default: at 600 the scene must build the kit
it builds today, argument for argument. The gate that *does* bite is
`packages/three-adapter/tests/cabinet-depth-source.test.ts`, which holds the adapter's two literals to
the domain's map; it gains the app-side pairing, so a call site passing a cabinet depth without its
declared wall depth fails there rather than in a screenshot.

**9. Cost is measured and recorded, and a bad number is a finding, not a reason to re-open shape.**
The rebuild's absolute cost on a handset is not proven here — only the relative claim is, and the
relative claim is that the narrow shape avoids none of it. Wave 6K-b records the measured interval
from the tap to the first frame at the new depth at 390 × 844. Over 500 ms it is recorded as a
finding for a later wave.

## Alternatives considered

- **The narrow kit-and-shell swap.** Refused under decision 2, on the `signBody` proof.
- **Keep the kit at 600 and scale the mounted bodies.** Not raised, and refused pre-emptively because
  M3's Risks section already names it: scaling a finished group to fake a fit is the thing not to do.
  A 700 mm carcass is not a 600 mm carcass stretched — the doors, the counter overhang and the plinth
  do not scale together.
- **Cache one kit per declared depth, so a toggle back is free.** Refused under decision 3. It is the
  store's catalogue cache applied to an object that owns GPU resources, and its whole benefit is
  avoiding a rebuild on the *second* toggle of a control the customer touches once or twice.
- **Leave the scene at 600 and let the depth show only as a number.** Refused: it is 6K's criterion
  *"changing it visibly changes the model, not just a number"*, and [ADR 0036](0036-a-declared-dimension-is-the-finished-cabinet.md)
  decision 5's *"every body adapts, with no confirmation step and nothing left behind"*.

## Records swept before deciding, and how each is settled

| Record | What it says | Settled how |
| --- | --- | --- |
| [ADR 0073](0073-a-frozen-extent-records-the-body-its-depth-came-from.md) | Two call sites hard-code the pre-6J constant; `kitchen-stage.tsx:102` is one, classified as an implementation defect against ADR 0055 decision 1 and assigned to wave 6K. | **This record is how that half is closed.** No classification changes; a third call site is added by the Finding below, in the same family. |
| M1 fidelity gate (`docs/milestones/done/M1-scene-port.md`) | Structural parity against the unmodified reference at 1e-6 m, plus preset captures; re-baselining must be declared, never relaxed. | **Not touched.** Decision 8: it gates builders at the default depth, and no builder and no default moves. |
| [ADR 0011](0011-m3-insert-contract-gaps.md) Gap B | The probe needs a `Kit` and the mounted room, so the store holds the port and the scene hands in the implementation. | **Obeyed and extended.** Decision 6 keeps the scene as the sole supplier; the Finding says the *depth* of the kit it supplies is an input the port never declared. |
| [ADR 0025](0025-the-corner-base-legs-seat-on-the-l-joint.md), M2 work item 2 | Every customer body is removed from the reference room and remounted by the sync, tagged for picking. | **Unchanged.** The shell manifest is untouched; a rebuilt shell carries the same five children and no `placementId`. |
| [ADR 0045](0045-the-run-end-panel-follows-the-run-it-closes.md) | The panel is shell, never a placement; only `visible` and `position.x` are derived, on every sync. | **Relied on.** Decision 5: the new generation's first sync corrects the freshly built panel. Its *depth* follows the cabinet depth in the builder (wave 6I2's fix), which is a second reason the shell cannot be kept across a change. |
| [ADR 0058](0058-the-two-deep-top-cabinets-are-pinned.md) | Two deep tops do not move with the setting. | **The proof's own witness**, and unharmed: a wall cabinet consumes the depth it is handed, so a pinned top rebuilt from a 700 kit is still drawn at its recorded 600. |
| [ADR 0023](0023-touch-compatibility-clicks-reach-the-sheet.md) | The canvas cancels `touchend` so a tap does not also arrive as a click on the sheet. | **No conflict, and it is why the 390 × 844 verification is by real touch.** The depth control lives on the sheet over the canvas; a rebuild does not change the listener, which is attached in `kitchen-canvas.tsx` and outside this memo. |
| SCENE-002 / `kit-disposal.ts` | R3F never disposes a `<primitive>`; a whole-stage teardown may release kit-owned resources because nothing survives it; a partial one may not. | **The rule this decision is chosen to satisfy.** Decision 1 makes every depth change a whole-stage teardown; the StrictMode replay path and its released check are unchanged. |
| [ADR 0028](0028-wall-depth-is-derived-from-the-worktop.md) | The wall depth is a declared map row, never a formula or a default. | **Decision 4.** |
| [ADR 0059](0059-the-dishwasher-niche-declares-a-cabinet-depth-floor.md), [ADR 0056](0056-two-cabinet-depths-are-declared-and-the-control-reads-the-map.md) | The 520 mm floor and the two declared depths. | No conflict. This record offers no depth and enforces no floor; the scene builds whatever depth the held design declares. |

Nothing found in the sweep contradicts this decision. No earlier record rules on the scene's response
to a depth change, because until 6J-b there was no depth change to respond to.

## Finding: the probe that measures a depth change holds a kit at the *old* depth

Met while answering question 2, and larger than it.

`setCabinetDepth` takes a `BodyProbe` and uses it to write every rebuilt body's `seatDepthMm` — through
`rebuild` → `evaluateInsertFit` for cabinetry, and through `reseat` for structural bodies. The store
passes `state.bodyProbe`, which is `createBodyProbe(stage.kit, stage.room)`: **the scene's kit**. The
command runs in the event handler, before any effect, so no keying of the stage memo can help — the
probe measuring a 600 → 700 change is built by the 600 kit, and it stays that way even after this
record's decision 1 lands.

That matters because **the adapter's builders ignore the depth they are handed and read the kit's
own.** `baseCabinet` (`kitchen-parts.ts:851`) takes a width and options and builds its carcass at the
closure constant `CARC_D = (cabinetDepthMm − BASE_FRONT_OVERHANG_MM) / 1000`; `scene-sync.ts` says the
same thing from the data side (*"those builders ignore the depth they are handed and build their
own"*). So `measureBuiltBody`'s `seatOffsetM` for a base body is the **kit's** depth, not the
requested one, and `insertBody` persists `2 ×` it as `seatDepthMm`.

**Why no test caught it.** The store's depth suites (`apps/web/tests/store/cabinet-depth.test.ts`,
`qa-6k-a-cabinet-depth.adversarial.test.ts`) run against `createFakeBodyProbe`, whose
`seatOffsetM: request.depthM / 2` obeys the depth it is asked for — precisely the behaviour the real
probe does not have for these builders. Classified as a **test-fidelity problem beside an
implementation defect**: the defect is a third call site left on the pre-6J depth, in the same family
as ADR 0073's two, and against the same clause (ADR 0055 decision 1).

**The mechanism is read off the code and independently confirmed** by the coordinator on 2026-09-04,
on two call sites rather than one: `baseCabinet` builds from the closure `CARC_D` and the request's
`depthM` never reaches it, and `measureSeatedGroup`'s front line comes from
`input.kit.depths.cabinetDepthM` — the **kit's** depth, not the requested one. So a probe built from
the old stage's kit measures at the old depth whatever it is asked for. **The bands it reaches are
exactly the builders that ignore their depth argument**: base, full-height, appliance and hood. The
two that consume it — `wallCabinet` and `openShelf`, ADR 0018's own note on which builders take a
depth — answer at the requested depth regardless of the kit, so the wall band is not reached by this
finding. It is reached by a different one; see [ADR 0075](0075-a-recorded-shell-declares-its-shell-not-its-finished-depth.md).

**The confirming measurement is still owed, and the withdrawal clause stands.** It is a headless
measurement, not a browser one, and it belongs in
`packages/three-adapter`, where a real kit, a real room and a real probe already meet
(`qa-5f-depth-roundtrip.adversarial.test.ts` is the shape). Run `setCabinetDepth` 600 → 700 twice over
the seeded fixture: once with `createBodyProbe(makeKit({ cabinetDepthMm: 600, wallDepthMm: 330 }), room)`
and once with a probe at 700, and compare the `seatDepthMm` written for a base placement. **If the two
agree, this finding is wrong and must be withdrawn by a dated amendment here.** If they differ, the
600-kit answer is the one the application writes today, it is persisted, and `deriveFrame` resolves
`placement.body.seatDepthMm ?? definition.frameDepthMm` — so the stale seat is read back forever and
never re-consults the catalogue, which is the compounding failure `reseat`'s own comment warns about
one branch over.

**Assigned to a new wave 6K-e, not to 6K-b.** The remedy is a domain signature change — `probe: BodyProbe`
becomes a factory `probeAt: (cabinetDepthMm) => BodyProbe`, the same shape and for the same stated
reason as `catalogAt`, which `SetCabinetDepthInput` already argues for in its own doc comment: *"a
factory makes the wrong call site impossible to write instead of merely wrong."* That crosses three
packages and is not "the scene's response to a depth change". Two premises 6K-e must verify rather
than assume, both headless: that `readWallPlaneM(room, "wall_back")` is invariant under the kit's
cabinet depth, so a transient-kit probe may measure inside the live room (`wall_back` is built at
`z = 0` from room constants, so this is expected to hold); and that a transient kit can be disposed
without a `KitStage`, which today it cannot — `disposeKitAndStage` requires a room, a ground, a blob
and a light rig, so 6K-e owes the adapter a kit-only release.

> **Amended 2026-09-05 by [ADR 0076](0076-a-probe-lease-is-a-scoped-borrow-and-the-store-publishes-no-probe.md).**
> The remedy's stated shape above is out of date twice over, and nothing else in this Finding is
> withdrawn. 6K-e shipped a factory returning a **lease** — `(cabinetDepthMm) => BodyProbeLease` —
> rather than a bare `BodyProbe`, because a borrower handed a probe has no way to say when it is
> done. ADR 0076 then changes that lease's shape again: it becomes a scoped borrow with no `probe`
> and no `release` field to drop, after the store was found dropping the release at five call sites
> and stranding one transient kit per depth change. Decision 3 above — exactly one kit alive per
> mounted scene — is what ADR 0076 implements at the store seam, not something it revises.

**6K-e does not gate 6K-b**, for wave 6K-c's stated reason: nothing ships mid-milestone, and the state
is already reachable in the tree through 6J-b and 6K-a, so holding the control back does not un-reach
it. What 6K-b carries instead is a second declared expected failure, on the house's `it.fails` rule.

## Consequences

- A depth change re-allocates the whole scene: a kit, a 32-child reference room of which five children
  are kept, a light rig, a ground and a blob, and every mounted body through the sync. Decision 9 is
  how that is watched.
- The scene now re-renders on a depth change where it previously never re-rendered after mount. It must
  read the depth through a selector returning a **number** — a component selecting `state.design` would
  re-render on every command for a memo that would not rebuild.
- `apps/web/tests/scene/kitchen-stage.test.ts` and `kitchen-stage-disposal.test.ts` mock `useMemo` to
  call its factory on every invocation and never re-render, so **they cannot observe memoization at
  all**. Every criterion about *when* the stage is and is not rebuilt has to be asserted against a real
  React renderer. A green run of those two suites is not evidence for decision 1.
- One kit alive at a time is now a stated invariant, so any later record proposing a second — a probe
  kit, a preview kit, a second canvas — has to say what releases it.

## Residuals, stated rather than left implicit

- Until 6K-e lands, a live 600 → 700 change writes base seats measured at 600, and the scene draws what
  the document says. The model still visibly changes; part of what it shows is wrong. 6K-b's criteria
  say which half is verified where, so that "it moved" is not read as "it is right".
- Whether a frame can be drawn showing a newly built shell before its bodies are mounted is not
  settled here. The same window exists at first mount today and has never been reported; 6K-b's visual
  pass records whether an intermediate empty-room frame is visible, rather than asserting it is not.
