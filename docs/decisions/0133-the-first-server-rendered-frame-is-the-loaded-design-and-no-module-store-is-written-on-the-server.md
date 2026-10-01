# ADR 0133 — The first server-rendered frame is the loaded design, and no module store is written on the server

Status: Accepted (architect, 2026-09-30). **The security review is owed at the implementing slice's
review** (M7B wave U7 S0, tier Full plus security). A finding there amends this record by a dated
line.
Date: 2026-09-30
Type: Decision (architect), on an owner ruling of 2026-09-30 relayed by the coordinator
Milestone: M7B, wave U7 S0 (`docs/milestones/M7B-u-shaped-rooms.md`, *U7 — the plan*)

**How to read the citations.** Source is read at `4dd3c3b`. Each load-bearing claim is labelled
**[doc-quoted]**, **[source-verified]** (read in the tree or in `node_modules` at that commit),
**[measured]** (quoted with its source; nothing was re-measured for this record), or
**[inference]**. An inference names what would falsify it.

## Context

**The defect is backlog 98** (`docs/backlog/open.md`). A load of `/[locale]/d/{id}` or
`/[locale]/s/{token}` renders the seeded L for about 130 ms in dev, before the loaded design appears.
The L shows three camera chips, and its own ~~title and~~ price *("title" corrected by A2)*. It happens for every design that is not
the seeded L. **[measured, U5's close-out.]** It was found by M7B wave U5 and recorded as
pre-existing and non-blocking.

**The mechanism, source-verified:**

- zustand 5.0.15's `useStore` passes `getInitialState()` as `useSyncExternalStore`'s **server
  snapshot**: `React.useCallback(() => selector(api.getInitialState()), [api, selector])`, in
  `node_modules/.pnpm/zustand@5.0.15…/zustand/esm/react.mjs:6-10`.
- `useConfiguratorStore` is one **module-level** store, created at import with `KITCHEN_L_DESIGN`
  (`apps/web/src/store/configurator-store.ts:730-736`).
- `HydrateAndConfigure` (`app/d/[id]/hydrate-and-configure.tsx:34-43`) and `SharedDesignView`
  (`app/s/[token]/shared-design-view.tsx:44-52`) call `hydrate` on that store **during render**.
- Two consequences follow:
  - **The server's HTML and React's hydration pass both read the initial snapshot, the seeded L.**
    Only the first client commit shows the loaded design.
  - **On the server, each request writes its design into the process-wide singleton.** An owner's
    `/d/{id}` and a stranger's `/s/{token}` share one object. Nothing server-rendered reads
    `getState()` today, so this is **latent**, not a live leak. It becomes live the day something
    does.

**The owner's ruling, 2026-09-30** (a relayed selection, Q-U7-1): **"Now, before M7B merges."** This
reverses the architect's recommended default, which was to fix it as M8's first job.

## Decision

1. **The first server-rendered frame of `/d/{id}` and `/s/{token}` is the loaded design.** The same
   holds for React's hydration pass over it: chips, ~~title,~~ price *(A2)* and scene state are all the
   loaded design's, for an L, a straight kitchen and a U alike.
2. **No module-level store is written during a server render.** This covers `useConfiguratorStore`,
   `useCameraPreset` and `useSceneMeasurement`. A server render's state lives in objects created for
   that render and dropped with it.
3. **The mechanism is a server-snapshot provider, not a store migration.**
   - A `ConfiguratorSnapshotProvider` builds a **per-render** store with the same factory the app
     uses (`createConfiguratorStore`), from the loaded design and with no side-effect options. It
     holds it in `useState`, so it lives for one mount.
   - `useConfiguratorStore(selector)` keeps its exact call shape. It subscribes to the browser's
     singleton, and answers the **server snapshot** from the nearest provider's store. With no
     provider (the plain `/configurator/configure` route), it answers from the singleton's initial
     state, as today.
   - `useConfiguratorStore.getState` / `setState` / `subscribe` keep addressing the singleton, so the
     save coalescer's wiring (ADR 0010 decision 2, `configurator-store.ts:754-776`) is untouched.
4. **The two hydrators write the singleton only in the browser.**
   - They decide by reading the singleton itself (`getState().designId`, or `getState().design` for
     the share view's sentinel id), never through the hook. Reading through the hook would now return
     the provider's snapshot and wrongly skip the hydrate.
   - The write stays during render, so the order `ConfigureScreen` relies on holds on the client.

## Alternatives considered

- **A per-request store in a React context for everything** (zustand's Next.js pattern).
  - *Not taken now.* It meets both requirements, but it moves every reader: 15 hook sites and 7
    `getState()` sites (source-verified by `grep`), plus the module-level save coalescer that ADR
    0010 decision 2 makes *"the session's one coalescer"*.
  - Decision 3 gets the same two guarantees (a correct first frame, and no server write to module
    state) with 4 production files.
  - **Trigger to revisit** *(widened by A3, 2026-09-30)*: a server-rendered component that needs the store's *live* state rather
    than its initial snapshot, or a second consumer of the save coalescer.
- **The loaded design as the server snapshot, by hand.** This is what decision 3 does. Doing it
  per selector instead of through one provider would scatter it over 15 sites.
- **Not rendering design-dependent chrome until hydration.** *Refused.* The first frame would be a
  skeleton, not the loaded design (decision 1), and the no-JS HTML of a share link would carry no
  kitchen.
- **Only removing the server-side write.** *Necessary, not sufficient.* It closes the latent leak and
  leaves the flash, because the server snapshot would still be the seeded L. Decision 4 does this as
  part of the whole.

## Consequences

- **Backlog 98 closes** on the implementing slice's commit. The comment at
  `hydrate-and-configure.tsx:16-24` that documents the flash is rewritten to state decision 3.
- **What tests prove, and what they stop assuming:**
  - Tests that poll for the loaded design's chip count (`u-flow.ts`, `linear-flow.ts`) stay valid.
    Polling is still correct; it is no longer necessary.
  - A new raw-HTML e2e pins decision 1.
  - A server-render test pins decision 2.
- **The share view's error bodies are unaffected.** The unknown, revoked and deleted token path
  renders `design-load-error` and mounts neither hydrator (`qa-7e3c-share.adversarial.e2e.spec.ts:163-228`,
  source-verified).
- **U7 D5 changes** (M7B plan): the reload flash is **gated**, at zero frames showing the wrong chip
  count, instead of measured and reported.

## Decision-record sweep

| Record | Effect |
| --- | --- |
| ADR 0010 decision 2 (one session coalescer) | Unchanged. The coalescer still reads the browser's singleton |
| ADR 0130 D9 (`useCameraPreset` a module singleton) | Unchanged on the client. Decision 2 adds that it is not written on the server |
| ADR 0019 (security baseline) | Consistent. Decision 2 removes a latent cross-request write before anything can read it |
| Backlog 98 | Closed by the implementing slice |
| Backlog 83 (same component: a dev-only *"Cannot update a component while rendering a different component"* on a client transition between two hydrated designs) | **Not fixed here.** The render-time write it names stays in the browser (decision 4). The slice must not make it worse: the dev-console count of that warning on the two transitions 83 names (share view → share view, and share view → `/d/{id}`) is measured before and after, and must not rise |

## Amendment A — 2026-09-30: the U7 S0 review (at `0d462aa`, QA `3c27ad6`)

Security review: **PASS**, with one Low finding. Logic review: minor findings. Clean-code review:
approve. This amendment records what the reviews found in this record. **Nothing above is erased.**
The code fixes are the developer's, in a worktree. Claims are labelled as above; the reviewers'
measurements are *relayed* and were not re-run by the architect.

### A1 — the guard, its mechanism and its limits (security Low; d2 and d4 made explicit)

- **The mechanism.** Both hydrators call `hydrateSessionStoreInBrowser`
  (`apps/web/src/store/configurator-snapshot.tsx:60`), and its guard is
  `typeof window === "undefined"` (`:64`) [source-verified].
  - *Relayed, from the security reviewer:* in a production build, Next folds the guard at build time,
    so the server bundle compiles `hydrateSessionStoreInBrowser` to an empty function.
  - Vitest evaluates the same guard at runtime. So the unit tests prove the runtime branch, and the
    production fold is a build fact the unit tests do not see.
- **What it protects:** the two hydrators, and nothing else. It is **not** a general barrier against
  writing module state on the server.
- **The other two module stores** (`useCameraPreset`, `useSceneMeasurement`) are unwritten on the
  server **by convention**: their writes live in effects and event handlers.
  - `apps/web/tests/app/server-render-isolation.test.ts` enforces d2, **but only over the trees it
    renders**.
  - **Obligation:** a new module-level store, or a new server-rendered tree that mounts one, joins
    that test in the same change. Without it, d2 is unenforced for that code.
- **What a future server-side reader would get.** On the server, `useConfiguratorStore.getState()`
  still addresses the singleton, which is never written there. A server-side reader would therefore
  get the **seeded L**.
  - *Derived:* that is **wrong data, not another visitor's data**, because d2 keeps the singleton at
    its initial state.
  - Such a reader is also the trigger A3 names.
- **Optional, not adopted:** a lint rule banning `getState` and `setState` at render time. It would
  turn A1's convention into a check. It is recorded as the remedy if A3's trigger is ever approached
  by accident.

### A2 — "title" is corrected: the price total and the session id stand in for it (logic 3)

*Source-verified:* there is no per-design title. The top bar's title is static copy,
`content.configure.title` (`configure-screen.tsx:139-140`). So the "title" in this record's Context
and d1, and in the M7B plan's U7 S0 item (4), named nothing that varies by design.

**Restated.** The first frame's design-dependent chrome is:

- the camera chips;
- **the price total, which equals the value the browser settles on after hydration**;
- **the session id `data-design-id`**. It is published under the selection-debug flag; on `/s` it is
  the sentinel `shared-view`.

The chip count, the price total and the session id are what "the first frame is the loaded design"
is tested by.

### A3 — the trigger for the deferred per-request store, widened (logic 4)

The full per-request context store (*Alternatives considered*) is revisited on any of these:

- a server-rendered component that needs the store's live state;
- a second consumer of the save coalescer;
- **any render-time `getState()` read** (A1's lint rule is the cheaper guard until then);
- **a third route that hydrates the store** (today only `/d/{id}` and `/s/{token}` do).

### A4 — d3 amended: the snapshot store's actions are the session store's on the client (logic 2)

**The finding.** During the hydration window, a component that selected an **action** through the
hook got the *snapshot store's* action. The snapshot store is per-render, and nobody reads it after
hydration. So an action invoked in that window would have written to a store that is then dropped.
That is **a latent lost write**, not a flash.

**The amendment, being built by the developer.** d3's snapshot store keeps its **state** fields. Its
**action** fields are:

- **on the client**, the browser singleton's own actions, so an action selected at any time writes
  the session store;
- **on the server**, actions that **throw in development**, because no action is legitimate during a
  server render (d2).

State stays per-render and actions stay single-sourced. d3's *"no side-effect options"* now reads:
*"no state of its own that an action can write"* — on the client. (Round-2 logic review, 2026-09-30: in a production server render the replacement is skipped and the snapshot keeps its own actions; no caller reaches them, and the per-render store is dropped.)

### A5 — a known cost, not a defect (logic 5)

A client-side transition to `/d/{id}` or `/s/{token}` builds a snapshot store it never reads. On the
client, after the first hydration, the hook answers from the singleton. The cost is one
`createConfiguratorStore` per such transition, which includes deriving geometry for the loaded
design.

**Recorded as a known cost.** M7B U7 S1's phone gate *may* measure it. It becomes a defect only if
that measurement shows a transition visibly slower than before `0d462aa`.

