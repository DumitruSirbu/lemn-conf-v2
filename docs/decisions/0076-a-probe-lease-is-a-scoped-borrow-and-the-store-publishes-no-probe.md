# ADR 0076 — A body-probe lease is a scoped borrow, and the store publishes no probe

Status: Accepted
Date: 2026-09-05
Type: Decision + Finding
Milestone: M6 — adds wave 6K-f; implements [ADR 0074](0074-the-scene-rebuilds-whole-at-a-depth-change.md)
decision 3 at the store seam

## Context

Wave 6K-e turned `setCabinetDepth`'s probe into a `BodyProbeFactory` returning a `BodyProbeLease`,
gave the adapter a kit-only `disposeKit`, and made `apps/web/src/scene/kitchen-stage.tsx`'s
`probeFactoryFor` build a **transient** kit whenever it is asked for a depth its stage is not
standing at. The domain command honours the lease correctly: it leases at the target depth and
releases in a `finally` (`packages/configurator-domain/src/commands/set-cabinet-depth.ts:73-77`).

The store does not. `leaseAtCurrentDepth` (`apps/web/src/store/configurator-store.ts:336-341`) is
one expression —

```ts
return probeAt?.(cabinetDepthMmOf(design)).probe;
```

— and it drops `release` on the floor at **five** call sites: `applyResult` (`:407`), construction
(`:561`), `attachBodyProbe` (`:566`), `hydrate` (`:596`), and `detachBodyProbe` (`:572-573`), which
clears a lease it is still holding without releasing it. Four were reported; `hydrate` is the fifth
and is the load path, so it is reached by a `/d/{id}` link rather than by an interaction.

**Where it is actually leaky.** Three of the five ordinarily take `probeFactoryFor`'s cheap arm — the
design's depth equals the stage's standing depth, the lease is over the mounted kit, and its
`release` frees nothing by design. The leak is at the two sites where the two depths differ, which is
exactly the state a successful command leaves: `applyResult` re-leases at the **result's** depth
while `state.probeAt` is still the factory the stage built at the depth being left, so the transient
arm runs — `makeKit` (roughly thirty procedural canvas textures, per ADR 0074) plus a full
`builders["kitchen-l"]()` reference room — and the real `disposeKit` release it returns is discarded.
**One kit per depth change**, and `hydrate` adds one per load at a depth the session did not open at.

Confirmed red before deciding:
`apps/web/tests/store/qa-6k-e-probe-lease-leak.adversarial.test.ts` fails four of its five cases
against the current store. Its repeated-toggle case reports **2** stranded kits over four toggles,
not 4, because the ledger pins the stage's standing depth at 600 — which is right for a store-only
test and **under-reports the application**, where the stage re-attaches at the new depth between
changes and every change therefore takes the transient arm.

### Why this is a ruling and not a patch

`bodyProbe` is published store state. It is read by two commands (`insert` at `:455`, `setWidth` at
`:497`) and — the half that decides this — by **two render-path hooks**, `useSelectionWidthOptions`
and `useSelectionWidthSteps` (`apps/web/src/panel/use-panel-view.ts:142`, `:195`), each of which runs
the real command once per candidate width inside a `useMemo`.

So the obvious patch is closed at both ends:

- **Release when the command ends** and the published probe dangles. Measuring through a disposed kit
  is, per `packages/three-adapter/src/kit-disposal.ts`, *"a black or invisible object rather than an
  error"* — it fails silently, and the render path would be the first to reach it.
- **Keep the lease** and something later must release it. The store has no such moment.
  `detachBodyProbe` is the only candidate, and **a zustand store has no destructor at all**: the
  module-scoped instance in `configurator-store.ts` outlives every mount and is never torn down. An
  owner whose ownership has no closing bracket is not an owner.

And the window is genuinely transient. `kitchen-stage.tsx`'s probe effect re-attaches a factory at
the new standing depth on the next commit's passive-effect flush (ADR 0074 decision 6), after which
the store's probe would come from the stage's own kit again. The question is therefore not *"how does
the store hold a transient lease safely"* but *"why is the store holding one at all"*.

### What the store's contract actually needs

Not a probe. **An answer at the depth the design holds**, at three moments:

| Reader | When | Depth wanted |
| --- | --- | --- |
| `insert`, `setWidth` | event handler | the design's |
| `widthOptionsFor`, `widthStepsFor` | render | the design's |
| `setCabinetDepth` | event handler | the one it is moving **to** |

The third already leases for itself and releases. The first two want the design's own depth, which
equals the stage's standing depth at every moment except one commit after a depth change or a
hydrate — and in that one commit a lease is exactly what produces a correct answer, for exactly as
long as the answer is being computed.

## Decision

**1. A body-probe lease is a scoped borrow. Nothing holds one across a boundary.**

The borrower owns a lease for the duration of one bracketed use and for no longer. The bracket
releases on every path, success and refusal. **No lease may cross a store `set()`, a React commit, a
command return, or an `await`** — every probe consumer in the codebase is synchronous
(`insertBody`, `setWidth`, `setCabinetDepth`, `widthOptionsFor`, `widthStepsFor`), so this costs
nothing and is checkable by inspection.

The consequences for the two questions asked:

- **`detachBodyProbe` releases nothing, because there is nothing outstanding.** It clears `probeAt`
  and the flag. That is not a weaker answer than "detach releases the held lease" — it is the
  stronger one, because it does not depend on detach being called.
- **Store teardown needs no hook**, which is what makes this shape the only correct one: the store
  has no teardown to hang one on.

**2. `bodyProbe` is removed from published store state.** `probeAt` stays and remains the single
source, as it already is. `insert` and `setWidth` lease per command at `cabinetDepthMmOf(design)`,
the way `setCabinetDepth` already leases at its target. `leaseAtCurrentDepth` and the
`bodyProbe:` line in `applyResult`, `hydrate`, construction and `attachBodyProbe` are **deleted, not
fixed** — the leak's home goes with them.

*What each option costs, stated because the tension is real:*

| | Published `bodyProbe`, lease held and released on replace | Per-scope lease, no published probe |
| --- | --- | --- |
| Transient kits per depth change | 2 (command's + store's) | 2 (command's + render path's), and 1 if no selection is held |
| Lifetime of the store's kit | one React commit, released by a later `set` or by `detach` | one `useMemo` body |
| Release on store teardown | **no hook exists** | not needed |
| Sites that mention `.release` | every write of `bodyProbe`, forever | one, in the adapter's factory |
| Width chips during the window | correct | correct |

The held-lease shape's only advantage is that it does not move code. Its cost is an ownership story
with no ending, which is the same defect one level up.

**3. The lease *is* the scoped use. `probe` and `release` stop being fields.**

`BodyProbeLease` becomes a borrow-with-a-callback:

> a lease exposes one member, `use<T>(borrow: (probe: BodyProbe) => T): T`, which invokes `borrow`
> and releases in a `finally`; the domain supplies the single constructor that builds one from a
> probe and a release function, and that constructor is the only place `finally` appears.

This is the answer to *"what makes a dropped `release` impossible to write again, rather than merely
absent"*, and it meets [ADR 0073](0073-a-frozen-extent-records-the-body-its-depth-came-from.md)'s
standard the same way `catalogAt` and `probeAt` meet it — by deleting the wrong expression from the
language rather than by warning about it:

- **There is no `release` to forget**, because there is no `release` on the borrower's side of the
  interface. `.probe` — the expression that is the whole of this defect — does not typecheck.
- **The release moves to the site that allocated**, which is `probeFactoryFor` in
  `kitchen-stage.tsx`: it builds the transient kit and hands `disposeKit` to the constructor. The
  borrower never sees which of the two arms it got, which is what `BodyProbeLease`'s doc comment
  already says it must not ask.
- **`setCabinetDepth` loses its hand-rolled `try/finally`.** One fewer place to write the obligation
  correctly is one fewer place to write it wrong.
- **Escape becomes an act, not an omission.** `lease.use((probe) => probe)` still compiles. That is
  deliberate and is the honest limit of this shape: TypeScript has no lifetime. The difference that
  matters is that smuggling a probe out is now something a reviewer can see being *written*, where
  today the leak is something a reader has to notice being *missing*. Decision 5 makes the escaped
  probe fail loudly rather than answering.

**4. The render path takes one lease for both width answers, not two.**

`useSelectionWidthOptions` and `useSelectionWidthSteps` merge into a single memo over the same
slices, returning both answers, taking one lease around both queries. Two memos would mean two leases
and — in the transient window — two transient kits for one frame. The merged memo also makes literally
true what `useSelectionWidthSteps`' own comment already claims: *"the two answers are always computed
from one state."*

Its memo keys become `probeAt` identity and `cabinetDepthMmOf(design)` in place of `probe` identity.
That is not a new re-run: `bodyProbe` identity already changed on both of the same events.

**A kit may therefore be built inside a `useMemo` body.** That is not new either — the stage memo
does exactly this — and it is bounded: it happens only when the design's depth differs from the
factory's standing depth, it is released before the memo returns, and under StrictMode's double
render it happens twice and is released twice, which `disposeKit`'s `isReleased` guard already
covers.

**5. A fake lease revokes its probe on release, and a fake that frees nothing is refused.**

Every fake in the repo returns `release: () => undefined`
(`apps/web/tests/support/fake-body-probe.ts`, `packages/configurator-domain/tests/support/fake-probe.ts`),
so a dropped release is invisible at the store layer — which is why the defect shipped. A fake lease
must do two things instead:

- **count** — record that it was taken and that it was released, so "leases taken ≠ leases released"
  is an assertion rather than a code reading;
- **revoke** — after release, `measure` throws rather than answering, so a probe used past its scope
  fails the test at the point of use.

**Revoking is deliberately stricter than reality, and that is the point.** A real probe over a
disposed kit does not throw; it renders a black or invisible object and measures it. A fake may be
stricter than the thing it stands for **when reality's failure is silent** — that is the only kind of
infidelity that makes a test more truthful, and it is the direct counterpart to wave 6K-d's
correction, which made the same file stop *flattering* the real probe.

**6. `isBodyProbeAttached` is unchanged, and ADR 0074 decision 6 is preserved.** It stays derived
from `probeAt !== undefined` and is written only by `attachBodyProbe`/`detachBodyProbe`. **No render
observes it false during a depth change** — the detach/attach pair still happens inside one commit's
passive-effect flush, and nothing in this record touches that. The store comment claiming the flag is
*"written only alongside `bodyProbe`, from the same value, so the two cannot come to disagree"*
retires with the field: one source is strictly better than two that must agree.

**7. The transient window is named, bounded and asserted, not left to be rediscovered.** It opens at
the `set()` that lands a new depth (or a hydrate at another depth) and closes at the passive-effect
flush that re-attaches the factory. Inside it, **at most one transient kit exists at a time and none
survives the window**. Outside it, **no transient kit is ever built** — every lease takes the cheap
arm. Both halves are criteria in wave 6K-f, because "no leak" alone would be satisfied by a store
that builds and frees a kit on every command.

## Classification of the reported issue

Three-way, and the order matters because it is why the defect was writeable at all.

1. **A contract gap, primarily.** `BodyProbeLease` declared its obligation in prose — *"`release` is
   idempotent and must be called on every path, success or refusal"* — and then typed it as a field
   any expression may decline to read. A port that states an obligation it does not enforce has
   delegated the enforcement to reviewers. Decision 3 closes it.
2. **An implementation defect**, five call sites, against that same clause. Decision 2 deletes them
   rather than fixing them.
3. **A test-fidelity problem.** `release: () => undefined` in every fake makes the drop unobservable
   at the layer where it happens. Decision 5 closes it, and this is the third consecutive finding in
   this file's family — after ADR 0074's (`seatOffsetM: request.depthM / 2` hid a live defect) and
   ADR 0075's (the same fake answering the request produced a phantom 39 mm) — which is itself worth
   noting: **the probe fake has now been the reason three defects were green.**

## Alternatives considered

- **Keep `bodyProbe` published; hold the lease in a store-scoped holder that releases the previous
  one on every publish, plus on `detach`.** Refused under decision 2, on the destructor: the release
  on detach depends on detach being called, and no path releases a lease held by a store the page
  simply navigates away from. It also keeps `.release` visible at the store layer forever, which is
  the expression decision 3 exists to remove.
- **Keep `{ probe, release }` and forbid the drop with an eslint `no-restricted-syntax` rule.**
  Refused: a lint rule is scoped to the paths it enumerates, and this codebase already has three
  packages and a tests tree that would each need enumerating. ADR 0073's standard is a type, not a
  warning.
- **Publish `bodyProbe: undefined` for the window and let the re-attach restore it.** Refused on two
  counts. It blanks the width section for a commit that is very likely painted — the depth change's
  own stage rebuild happens in that render, so the frame is slow and visible — which is a layout
  shift in a bottom sheet on a handset. And the variant that makes it *honest* (`isBodyProbeAttached:
  false` for the window, so the panel shows its "model is preparing" message) contradicts ADR 0074
  decision 6 directly: no render may observe the probe detached.
- **Leave the stale standing probe published until the scene re-attaches.** Refused, and it is the
  defect the store's own comment records being measured — a resize straight after a 600 → 700 change
  re-seated a base body at 580. Correct-only-if-a-React-effect-ran-in-between is not a contract a
  headless module may hold.
- **Have the store lease once at the target depth, hand `setCabinetDepth` a no-op-release wrapper so
  only one transient kit is built, and keep the lease as the published probe.** This is within
  `BodyProbeLease`'s stated escape hatch (*"a lease whose depth the lender already has standing may
  release nothing at all"*) and it does save one `makeKit` and one reference room per depth change.
  Refused anyway: it needs a lease threaded through `applyResult`, whose branchless shape is
  deliberate, and it needs a release on the refusal path — a path taken exactly when the implementer
  is thinking about something else. It buys one kit build on an interaction that is already rebuilding
  the whole stage, at the price of the one function this store keeps simple. If ADR 0074 decision 9's
  measurement lands over budget, this is the first thing to reconsider, and it is recorded here so
  that reconsideration starts from a written alternative.
- **Cache the transient kit by depth so the window is free.** Refused by ADR 0074 decision 3, which
  is not re-opened: a cached kit is a live kit whose resources may never be released.

## Records swept before deciding, and how each is settled

| Record | What it says | Settled how |
| --- | --- | --- |
| [ADR 0074](0074-the-scene-rebuilds-whole-at-a-depth-change.md) decision 3 | Exactly one kit is alive per mounted scene; the probe's kit is transient and disposed when the command ends; any later record proposing a second kit must say what releases it. | **Implemented, not amended.** This record says what releases it: the `use` bracket. The store's second kit is removed rather than given an owner. |
| [ADR 0074](0074-the-scene-rebuilds-whole-at-a-depth-change.md) decision 6 | The probe is re-attached on every generation and **no render may observe it detached**; `insert` is gated on the flag and never offered then refused. | **Preserved, and decision 6 above says so explicitly.** The "publish `undefined` for the window" alternative is refused on this clause. |
| [ADR 0074](0074-the-scene-rebuilds-whole-at-a-depth-change.md) Finding | States the 6K-e remedy as *"`probe: BodyProbe` becomes a factory `probeAt: (cabinetDepthMm) => BodyProbe`"*. | **Amended, dated.** 6K-e shipped a factory returning a *lease*, not a probe, and this record changes that lease's shape again. One dated cross-reference line is added to that Finding; nothing it concluded is withdrawn. |
| [ADR 0073](0073-a-frozen-extent-records-the-body-its-depth-came-from.md) | A wrong call site is made unwriteable, not merely wrong. | **The standard this record is held to**, and decision 3 states where it stops short (a deliberate escape still compiles) rather than claiming more than it has. |
| [ADR 0011](0011-m3-insert-contract-gaps.md) Gap B | The probe needs a `Kit` and the mounted room, so the store holds the **port** and the scene supplies the implementation. | **Unchanged.** `probeAt` is that port and stays in the store. Gap B never said the store must publish a *built* probe. |
| [ADR 0055](0055-a-depth-change-migrates-the-stored-design.md) decision 1 | Every body is rebuilt at the new depth. | No conflict; this record changes who owns a measuring instrument, not what is measured. |
| [ADR 0075](0075-a-recorded-shell-declares-its-shell-not-its-finished-depth.md) | Which builders consume a depth and which ignore it; the fake reads `occupiedDepth` rather than answering the request. | **Relied on and extended in the same direction.** Decision 5 adds revocation to the same fake; the measurement arms are untouched. |
| [ADR 0034](0034-width-chips-are-column-scoped-and-judged-by-the-command.md) | The width chips are judged by running the command, not by inference. | **The reason the render path needs a probe at all**, and why decision 4 leases there rather than declaring the render path probe-free. |
| SCENE-002 / `kit-disposal.ts` | A whole-stage teardown may release kit-owned resources; a partial one may not; `disposeKit` is for a kit that was never mounted. | **Obeyed.** The only `disposeKit` call site remains `probeFactoryFor`'s transient arm, over a kit that factory created. The standing arm still releases nothing. |

Nothing found in the sweep contradicts this decision, and no earlier record rules on who owns an
outstanding lease — the lease type is four days old.

## Consequences

- The store's published surface loses a field. Components and tests reading `state.bodyProbe`
  (`use-panel-view.ts` only, in `src`) change with it; `isBodyProbeAttached` is unaffected, so no
  panel state, no disabled control and no message moves.
- `BodyProbeLease` changes shape in the domain, which is a three-package edit: the domain's
  constructor and `setCabinetDepth`, the adapter's `probeFactoryFor` consumer in the web app, and
  every fake. It is a compile-time-total change — no call site can be missed silently, which is the
  property that makes it cheap despite the reach.
- A transient kit can now be built during a React render. Bounded by decision 7's assertion, and it
  is the second such site rather than the first.
- ADR 0074 decision 9's tap-to-frame measurement now covers two transient kits per depth change, one
  of which is the render path's. If the measurement lands over 500 ms, the recorded finding should
  name the alternative above (one lease shared between the store and the command) as the first
  reduction to try, rather than re-opening the shape.
- The probe fake becomes the third-most-corrected file in this milestone. That is a signal about the
  fake, not about the waves: a port whose fake has hidden three defects deserves the criterion in
  6K-f that pins the fake's own behaviour, not just the code under test.

## Residuals, stated rather than left implicit

- **A probe smuggled out of `use` still compiles.** Decision 3 states this limit; decision 5 makes it
  fail loudly in tests. No mechanical guard is claimed in production code, and none should be
  invented in review notes as if there were one.
- **The window is still two transient kits wide.** This record makes it bounded and asserted; it does
  not make it one. The reduction is written down as an alternative, unclaimed.
- **`hydrate` at a depth the scene never reaches** — a load whose design depth differs from the
  standing one and where the canvas is not mounted at all — leases nothing under decision 1, because
  `probeAt` is `undefined`, and the width answers are empty for the same reason they are empty before
  the scene mounts today. No change, recorded so it is not read as one.
