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
The L shows three camera chips, and its own title and price. It happens for every design that is not
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
   holds for React's hydration pass over it: chips, title, price and scene state are all the
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
  - **Trigger to revisit:** a server-rendered component that needs the store's *live* state rather
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
