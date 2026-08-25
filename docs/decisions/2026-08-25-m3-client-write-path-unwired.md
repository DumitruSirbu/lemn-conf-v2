# 2026-08-25 — M2's write path exists but has no production caller; M3 owns the wiring

## Finding

`docs/milestones/M3-mutations.md`'s work item 7 said M3 should "route successful commands through
the persistence write path M2 established", implying the path is wired and M3 adds traffic to it.
It is not wired. Verified by grep across `apps` and `packages`:

```
$ grep -rn "scheduleSave\|createSaveCoalescer" apps packages --include="*.ts" --include="*.tsx"
```

Every hit outside `apps/web/src/persistence/save-coalescer.ts` itself is in
`save-coalescer.test.ts`. Concretely, what is missing in the browser:

- `createSaveCoalescer` is never constructed by application code.
- `POST /api/designs` (the mint route) has no client caller. Opening
  `/configurator/configure` therefore leaves `designId` at `null` forever, and no row is ever
  created for the seeded design.
- The store's `setSaveStatus` and `applySavedId` — the coalescer's two callbacks — are unused in
  production; only `hydrate` (the `/d/[id]` load path) is exercised.
- There is no client-side `ConfigurationRepository`. `apps/web/src/lib/server/repository.ts` is
  `server-only` and returns the Neon adapter, which a browser cannot use.

The save-coalescer's own header comment states the intent accurately — "M2 has exactly one caller of
`scheduleSave` (mint-on-first-write)" — which describes a caller that was planned but not landed.
The reading route (`/d/[id]` → `GET /api/designs/[id]` → `hydrate`) is complete and does work; it is
only the write half that has no client.

## Classification

**Contract gap**, not an implementation defect. M2's acceptance criteria for the write path are all
stated as properties of the coalescer (coalescing, final-state-lands, failure never reverts, never
silent) and every one of them is proven by `save-coalescer.test.ts`. What M2 did not state is that
*something must call it*, because in a phase with no mutation the only possible caller was a mint
with no user-visible trigger. The gap is in the phase boundary, not in the code.

## Decision

**M3 owns the whole client write path, and it is a first-class work item of the phase rather than
a line in an insert dispatch.** Specifically, M3 delivers:

1. A browser `ConfigurationRepository` implementing the domain interface over `fetch`: `save(null,
   design)` → `POST /api/designs`, `save(id, design)` → `PUT /api/designs/[id]`, `load(id)` →
   `GET /api/designs/[id]`. Non-2xx responses reject, so the coalescer's existing retry path drives
   them; the repository never swallows a failure into a resolved promise.
2. One coalescer instance per session, wired to the store: `getDesignId` reads `designId`,
   `onSaved` calls `applySavedId`, `onSaveStatusChange` calls `setSaveStatus`.
3. Every successful command calling `scheduleSave(nextDesign)` **after** the store has already
   applied the edit, never awaited.

M3's insert/remove work therefore does not "add traffic to an existing path" — it stands up the
path and is its first traffic. Planning the phase as though the wiring were free would have
under-sized the dispatch.

## Consequences

- Mint-on-first-write now happens on the **first mutation**, not on page load. That is a change in
  timing from what M2 implied, and it is the better behaviour: a customer who opens the editor and
  leaves without touching anything creates no row. It also satisfies M2's own criterion that "a
  design that has never been written successfully must not present a shareable link" without any
  extra guard — before the first edit there is nothing to share.
- A burst of commands against an unminted design must create **exactly one** row. The coalescer's
  `saving` re-entry guard plus `onSaved` firing before the next `runSave` makes this hold; it is
  asserted in M3, not assumed, because a second mint would silently fork the design.
- Which surface tells the customer a write failed remains M4's open question, unchanged. M3 exposes
  `saveStatus` and nothing more; it must not invent a banner that M4 will then have to remove.

## Alternatives considered

1. *Mint on page load, before any edit.* Rejected: it creates a row for every visit, including
   crawlers and accidental opens, and buys nothing — nothing can be shared until something has been
   configured.
2. *Save through a Server Action instead of a client repository.* Rejected for this phase: the
   coalescer is built against the `ConfigurationRepository` interface, and a client adapter over the
   already-shipped routes reuses both. A Server Action would need its own failure/retry shape beside
   the one that already exists and is tested.
3. *Defer the wiring to M4 with the panel.* Rejected: M3 is the first phase that can change a
   design, so it is the first phase where an unpersisted change is data loss. Shipping mutation
   without persistence would mean shipping a known loss window.
