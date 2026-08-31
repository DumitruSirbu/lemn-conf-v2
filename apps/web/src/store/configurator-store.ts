// Work item 6's store half (`docs/milestones/M2-void-engine.md`), extended by M3 work item 9 with
// the four commands: `remove`, `insert`, `setFinish`, `setHandle`.
//
// Each action is the adapter the milestone's Boundaries section describes — call the domain
// command, apply its result in one `set()`, schedule the save — and nothing more. Every product
// rule lives in `@lemnaria/configurator-domain`; a guard re-implemented here would be a second
// place for the rules to drift apart.
//
// A column's **extent** is frozen load-time state (ADR 0011 Gap D): derived at store creation and
// in `hydrate`, and never by a command. `deriveGeometry` is therefore the load path only. Its one
// live field, `hasFullHeightUnder` — whether a full-height member still stands under the opening —
// is re-answered from the new records after every command; see `applyCommandResult`.
import {
  deriveColumns,
  derivePlacementRecords,
  insertBody,
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  recomputeVoids,
  refuse,
  removePlacement,
  setFinish as setFinishOnDesign,
  setHandle as setHandleOnDesign,
  setWidth as setWidthOnDesign,
  type BodyCatalog,
  type BodyProbe,
  type Column,
  type CommandResult,
  type CommandTarget,
  type Design,
  type DesignId,
  type Finish,
  type Handle,
  type PlacementRecord,
  type RejectionReason,
  type VoidRecord,
} from "@lemnaria/configurator-domain";
import { create, type StoreApi, type UseBoundStore } from "zustand";

import { sessionConfigurationRepository } from "@/persistence/fetch-configuration-repository";
import {
  createSaveCoalescer,
  type SaveCoalescer,
  type SaveStatus,
} from "@/persistence/save-coalescer";

import { applyCommandResult, type Selection } from "./apply-command-result";

export type { Selection };

/** The save-coalescer's own status, re-exported rather than restated: the store is where the UI
 *  reads it from, and two copies of the union would be free to drift. `idle` covers both "never
 *  saved" and "last save succeeded" — `hasPersistedSuccessfully` is the field that distinguishes
 *  those two, per the milestone's "never write, never shareable" rule. */
export type { SaveStatus };

/**
 * Whether this browser may edit a design, as **four** states rather than two.
 *
 * The two non-boolean states are both "no answer yet", told apart by whether one is still coming.
 * `"checking"` is the `/d/{id}` load's honest opening position: the write-token cookie is scoped
 * `Path=/api/designs/{id}` (ADR 0019 decision 1), so the request that rendered the page never
 * carried it and the server could not have answered — `useWriteAccessProbe` is asking the one route
 * that can. `"check-failed"` is that probe having failed; nothing further is in flight, and only a
 * retry changes it.
 *
 * They are spelled out rather than encoded as an absent field, because absence already means the
 * opposite thing one module away — `fetch-configuration-repository.ts` reads an absent `canWrite`
 * as **false**, the safe reading of a load answer that did not arrive. Two opposite defaults for
 * the same missing value is how a genuinely read-only design gets marked writable with no type
 * error; named states remove the default from both.
 *
 * **Neither non-boolean state is writable** (see `isReadOnly`). Until wave S7 `"unknown"` was
 * deliberately read as writable, so `/d/{id}` rendered fully interactive before anything knew
 * whether it could write — and a probe that failed left that optimism standing for good. A reader
 * on a blocked API then edited, believed it saved, and watched the controls disable *after* the
 * refusal, with the unsaved edit still on screen. `DEVELOPMENT-SPEC.md` §9 forbids exactly that:
 * never offer what cannot be satisfied. The interface now waits for the answer, which is a change
 * to what it *offers* only — `canWrite` stays advisory and authorises nothing (ADR 0019 decision 1;
 * `hasWriteCredentialFor` is still the sole authorisation).
 */
export type WriteAccess = boolean | "checking" | "check-failed";

export interface ConfiguratorState {
  readonly design: Design;
  readonly records: readonly PlacementRecord[];
  /** The catalogue this store was built against, published so a caller of `describeSelection` or
   *  `offersFor` reads the same map the commands do. A component importing a catalogue by name
   *  would be free to pick a different one from the store's. */
  readonly catalog: BodyCatalog;
  /** Extent frozen at load time, `hasFullHeightUnder` live — see the file header and ADR 0011
   *  Gap D. */
  readonly columns: ReadonlyMap<string, Column>;
  readonly voids: readonly VoidRecord[];
  readonly selection: Selection;
  readonly select: (target: NonNullable<Selection>) => void;
  readonly deselect: () => void;
  /** The last refusal, and the only thing a refused command changes. Transient: it is never part
   *  of the design, a successful command clears it, and so does moving the selection — the
   *  sentence was rendered about the target that refused, per §8's `rejected` message. */
  readonly lastRejection: RejectionReason | null;
  readonly remove: () => void;
  readonly insert: (buildId: string) => void;
  readonly setFinish: (finish: Finish) => void;
  readonly setHandle: (handle: Handle) => void;
  /** §5.4's resize, and the last of §9's five verbs to be wired. It takes a width and nothing else:
   *  which bodies move, which column funds it and whether it is legal at all are ADR 0031's rules,
   *  and they live in the command. */
  readonly setWidth: (widthMm: number) => void;
  /** The scene's measuring instrument, published rather than closed over because §9's width chips
   *  need it too: `widthOptionsFor` answers "would this resize succeed" by running the command,
   *  which rebuilds through the real builders. A query cannot reach a closure variable.
   *
   *  `undefined` until the scene mounts and after it unmounts — the store is module-scoped and
   *  outlives any one canvas. */
  readonly bodyProbe: BodyProbe | undefined;
  /** Whether `insert` can do anything. False until the scene calls `attachBodyProbe`, and
   *  published so a control is disabled rather than offered and then refused ("never offer what
   *  cannot be satisfied", §9). `insert` refuses `BODY_PROBE_UNAVAILABLE` if one is called anyway.
   *
   *  Written only alongside `bodyProbe`, from the same value, so the two cannot come to disagree. */
  readonly isBodyProbeAttached: boolean;
  readonly attachBodyProbe: (probe: BodyProbe) => void;
  /** The scene's unmount half. The store is module-scoped and outlives any one mounted scene, so
   *  without this the flag would keep claiming a probe that measures inside a room nobody renders. */
  readonly detachBodyProbe: () => void;
  readonly designId: DesignId | null;
  readonly saveStatus: SaveStatus;
  /** A future share-link UI gates on this, not on `designId !== null` alone: a design that has
   *  never been written successfully must not present a shareable link (write-path decision 17). */
  readonly hasPersistedSuccessfully: boolean;
  /**
   * Whether this browser holds the design's write credential (ADR 0019 decision 1), as the server
   * reported it on the load that produced this state — or `"checking"` / `"check-failed"` where no
   * load has answered yet. Published so §9's panel can disable what it cannot perform; it is a
   * **fact carried in**, never a decision made here — what the panel does with it is
   * `describePanel`'s rule, and what a write is allowed to do is the row's.
   */
  readonly canWrite: WriteAccess;
  /** Records the server's answer about write access, which for the load-by-link path arrives after
   *  the design does — see `LoadedDesignState.canWrite`. Ignored when the store has since moved to
   *  a different design, because the answer is per-design and would otherwise be applied to one it
   *  was never about. */
  readonly applyWriteAccess: (access: {
    designId: DesignId;
    canWrite: boolean;
  }) => void;
  /** Records that the probe could not answer at all — a dropped request, a blocked API, an offline
   *  browser. It moves `canWrite` to `"check-failed"`, which the panel renders as a retryable
   *  notice rather than as either verdict: a network failure is not evidence about access in either
   *  direction, and turning it into "writable" is what wave S7 removed. */
  readonly failWriteAccessCheck: (attempt: { designId: DesignId }) => void;
  /** The retry behind that notice. Puts `canWrite` back to `"checking"`, which is what the probe
   *  effect watches — `"checking"` means "a check is wanted and none has answered", so restoring it
   *  *is* asking again, and no separate attempt counter can drift away from it. A no-op unless the
   *  last check actually failed, so a stray press cannot discard an answer the probe already gave. */
  readonly retryWriteAccessCheck: () => void;
  /** Replaces the store's design wholesale — the load-by-link path (`/d/[id]`). The loaded design
   *  already round-tripped through the database, so it counts as persisted; clears the selection,
   *  since an id selected in the previous design has no guaranteed meaning in the new one. */
  readonly hydrate: (loaded: LoadedDesignState) => void;
  readonly setSaveStatus: (status: SaveStatus) => void;
  /** Records a successful save's id — the save-coalescer's `onSaved` hook. */
  readonly applySavedId: (id: DesignId) => void;
}

/** One load's worth of state: the document, the id it lives under, and this browser's access to
 *  it. Passed as one object because they are three halves of a single event and always move
 *  together — a `hydrate` that took them positionally would let two of them be swapped silently. */
export interface LoadedDesignState {
  readonly design: Design;
  readonly designId: DesignId;
  /**
   * **Required**, so that a loader which does not know has to say so. `/d/{id}` passes
   * `"checking"` — its own request could not carry the `Path=/api/designs/{id}` cookie — and
   * `applyWriteAccess` settles it from the one route the cookie does reach. A loader that knows
   * passes the boolean.
   *
   * It is required rather than optional-defaulting-to-writable because the obvious call,
   * `hydrate({ design: await repository.load(id), designId })`, drops `canWrite` (the
   * `ConfigurationRepository` contract has no such field) and would have marked a genuinely
   * read-only design writable with no type error and no lint warning. Now it does not compile.
   */
  readonly canWrite: WriteAccess;
}

export interface ConfiguratorStoreOptions {
  readonly design: Design;
  readonly catalog: BodyCatalog;
  /** Defaults to `null`: the seeded fixture starts out unminted, matching M2's "mint on first
   *  write" trigger. */
  readonly designId?: DesignId | null;
  /** Wave 3C-2b's seam. Called **after** the store has applied a successful command, never before
   *  it and never on a refusal, and never awaited — no interaction blocks on a write. 3C-2b passes
   *  the save coalescer's `scheduleSave` here; until then it is a no-op. */
  readonly onDesignChanged?: (design: Design) => void;
  /**
   * The singleton persistence seam advances its generation when hydration switches design
   * identity. Other store instances have no background writer and leave this unset.
   */
  readonly onDesignIdentityChanged?: () => void;
  /** The domain reads no clock, so the caller supplies `occurredAt`. Injected so a test can pin
   *  it and so nothing in the domain has to be mocked to make a timestamp predictable. */
  readonly now?: () => string;
  /**
   * Defaults to `true`, and the default is the whole point: a design that has never been minted has
   * no credential to hold *yet*, because the customer is about to mint it on their first mutation.
   * Only a **loaded** design can be read-only, and that case arrives through `hydrate` carrying the
   * server's answer. A fresh configurator that believed itself read-only would refuse every edit it
   * is about to be granted — a worse failure than the one `canWrite` exists to fix.
   */
  readonly canWrite?: boolean;
  /** Tests inject a fake probe here. The app cannot: the real probe needs a `Kit` and the mounted
   *  room, which do not exist until the scene mounts, so it arrives later via `attachBodyProbe`. */
  readonly bodyProbe?: BodyProbe;
}

/** What every command needs from the store: the current design, the column map — extents frozen,
 *  `hasFullHeightUnder` current — and what is selected. Passed as one object so each action stays
 *  the call/apply/schedule adapter. */
interface CommandContext {
  readonly design: Design;
  readonly columns: ReadonlyMap<string, Column>;
  readonly target: CommandTarget;
}

function deriveGeometry(design: Design, catalog: BodyCatalog) {
  const records = derivePlacementRecords(design, catalog);
  const columns = deriveColumns(records);
  const voids = recomputeVoids(records, columns);
  return { records, columns, voids };
}

function nowInIsoMilliseconds(): string {
  return new Date().toISOString();
}

/** Builds a fresh store instance for a fixed design/catalog pair. The app itself uses the single
 *  `useConfiguratorStore` instance below — this factory exists so tests never share state. */
export function createConfiguratorStore(
  options: ConfiguratorStoreOptions,
): UseBoundStore<StoreApi<ConfiguratorState>> {
  const { design, catalog } = options;
  const designId = options.designId ?? null;
  const onDesignChanged = options.onDesignChanged ?? (() => undefined);
  const now = options.now ?? nowInIsoMilliseconds;

  return create<ConfiguratorState>((set, get) => {
    /** Call, apply, schedule — in that order, and in one `set()`. A command with no selected
     *  target never reaches the domain, so it borrows the domain's own code for a selection that
     *  resolves to nothing rather than inventing a store-local one. */
    const runCommand = (
      command: (context: CommandContext) => CommandResult,
    ) => {
      const state = get();
      const result = state.selection
        ? command({
            design: state.design,
            columns: state.columns,
            target: state.selection,
          })
        : refuse(state.design, { code: "TARGET_NOT_FOUND", params: {} });
      const application = applyCommandResult({
        result,
        catalog,
        columns: state.columns,
      });
      set(application.state);
      if (application.applied) onDesignChanged(application.state.design);
    };

    return {
      design,
      catalog,
      ...deriveGeometry(design, catalog),
      selection: null,
      lastRejection: null,
      select: (target) => {
        set({ selection: target, lastRejection: null });
      },
      deselect: () => {
        set({ selection: null, lastRejection: null });
      },
      remove: () => {
        runCommand(({ design: current, target }) =>
          removePlacement({
            design: current,
            target,
            catalog,
            occurredAt: now(),
          }),
        );
      },
      insert: (buildId) => {
        const probe = get().bodyProbe;
        runCommand(({ design: current, columns, target }) =>
          probe
            ? insertBody({
                design: current,
                columns,
                target,
                catalog,
                buildId,
                probe,
                occurredAt: now(),
              })
            : // A missing probe is a refusal, not a throw: `isBodyProbeAttached` exists so a
              // control is never offered before the scene is ready, and this is the safety net
              // beneath that. It sits **after** the selection check, so `insert` fails the same
              // way the other three commands do when nothing is selected.
              refuse(current, { code: "BODY_PROBE_UNAVAILABLE", params: {} }),
        );
      },
      setFinish: (finish) => {
        runCommand(({ design: current, target }) =>
          setFinishOnDesign({
            design: current,
            target,
            catalog,
            finish,
            occurredAt: now(),
          }),
        );
      },
      setHandle: (handle) => {
        runCommand(({ design: current, target }) =>
          setHandleOnDesign({
            design: current,
            target,
            catalog,
            handle,
            occurredAt: now(),
          }),
        );
      },
      setWidth: (widthMm) => {
        const probe = get().bodyProbe;
        runCommand(({ design: current, columns, target }) =>
          probe
            ? setWidthOnDesign({
                design: current,
                columns,
                target,
                catalog,
                widthMm,
                probe,
                occurredAt: now(),
              })
            : // The same safety net `insert` carries, for the same reason: §9 disables a chip it
              // cannot satisfy, and this is what happens if one is tapped anyway.
              refuse(current, { code: "BODY_PROBE_UNAVAILABLE", params: {} }),
        );
      },
      bodyProbe: options.bodyProbe,
      isBodyProbeAttached: options.bodyProbe !== undefined,
      attachBodyProbe: (probe) => {
        set({ bodyProbe: probe, isBodyProbeAttached: true });
      },
      detachBodyProbe: () => {
        set({ bodyProbe: undefined, isBodyProbeAttached: false });
      },
      designId,
      saveStatus: "idle",
      canWrite: options.canWrite ?? true,
      hasPersistedSuccessfully: designId !== null,
      hydrate: (loaded) => {
        const geometry = deriveGeometry(loaded.design, catalog);
        if (get().designId !== loaded.designId)
          options.onDesignIdentityChanged?.();
        set({
          design: loaded.design,
          ...geometry,
          selection: null,
          lastRejection: null,
          designId: loaded.designId,
          canWrite: loaded.canWrite,
          hasPersistedSuccessfully: true,
          // A save status is evidence about the generation that produced it and about no other,
          // which is the same reason `save-coalescer.ts` binds jobs and refusals to identity.
          // Carried across, `unauthorized` would render a freshly loaded design this browser owns as
          // read-only (`isReadOnly` reads it), and the only thing that clears `unauthorized` is a
          // successful write — whose every control the read-only panel has just disabled. That is a
          // deadlock no interaction can leave, only a full page reload. `error` and `stopped` leak
          // the previous design's failure notice onto a design that never failed.
          saveStatus: "idle",
        });
      },
      applyWriteAccess: ({ designId: answeredFor, canWrite }) => {
        if (get().designId !== answeredFor) return;
        set({ canWrite });
      },
      failWriteAccessCheck: ({ designId: attemptedFor }) => {
        const state = get();
        if (state.designId !== attemptedFor) return;
        // A boolean is an answer the server actually gave. A later probe failing — a retry, or a
        // second effect run — must not demote it back to "we do not know", which would take a
        // writable panel away from its own author on the strength of a dropped packet.
        if (typeof state.canWrite === "boolean") return;
        set({ canWrite: "check-failed" });
      },
      retryWriteAccessCheck: () => {
        if (get().canWrite !== "check-failed") return;
        set({ canWrite: "checking" });
      },
      setSaveStatus: (status) => {
        set({ saveStatus: status });
      },
      applySavedId: (id) => {
        set({ designId: id, hasPersistedSuccessfully: true });
      },
    };
  });
}

/**
 * The app mounts one store and one coalescer for the tab. Identity is therefore a session concern,
 * kept at their wiring seam rather than exposed as customer-facing Zustand state.
 */
let saveGeneration = 0;

function advanceSaveGeneration(): void {
  saveGeneration += 1;
}

/** The single store instance the app mounts against — no hard-coded canvas id anywhere, per the
 *  milestone's "Shared" acceptance bullet: the selection owns the target, not any one canvas. */
export const useConfiguratorStore = createConfiguratorStore({
  design: KITCHEN_L_DESIGN,
  catalog: KITCHEN_L_BODY_CATALOG,
  onDesignChanged: persistDesignChange,
  onDesignIdentityChanged: advanceSaveGeneration,
});

/** The session's one coalescer, and the whole of the client write path's wiring (ADR 0010
 *  decision 2). Built on first use rather than at module load for two reasons: this module is
 *  imported by server components too, and `useConfiguratorStore` is not yet initialised while its
 *  own options object is being evaluated. */
let saveCoalescer: SaveCoalescer | null = null;

/** Hands a just-applied design to the coalescer and returns. Never awaited by the store, so no
 *  interaction ever blocks on a write (persistence decision 13); the store calls it only after a
 *  successful command, so a refusal persists nothing. */
function persistDesignChange(design: Design): void {
  saveCoalescer ??= createSaveCoalescer({
    repository: sessionConfigurationRepository,
    getDesignId: () => useConfiguratorStore.getState().designId,
    getGeneration: () => saveGeneration,
    onSaved: (id, generation) => {
      if (generation !== saveGeneration) return;
      useConfiguratorStore.getState().applySavedId(id);
    },
    onSaveStatusChange: (status, generation) => {
      if (generation !== saveGeneration) return;
      useConfiguratorStore.getState().setSaveStatus(status);
    },
  });
  saveCoalescer.scheduleSave(design);
}
