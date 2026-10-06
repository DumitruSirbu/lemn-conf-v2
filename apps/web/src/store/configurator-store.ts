// The store adapts the UI to the domain commands: call the command, apply its result in one `set()`,
// schedule the save. Every product rule lives in `@lemnaria/configurator-domain`.
//
// A column's extent is frozen load-time state, derived at creation and in `hydrate` and never by a command
// (ADR 0011 Gap D). Only `hasFullHeightUnder` is re-answered after every command (`applyCommandResult`).
import {
  buildKitchenLBodyCatalog,
  cabinetDepthMmOf,
  deriveColumns,
  deriveRecordedColumns,
  derivePlacementRecords,
  insertBody,
  KITCHEN_L_DESIGN,
  recomputeVoids,
  refuse,
  removePlacement,
  setCabinetDepth as setCabinetDepthOnDesign,
  clearFinish as clearFinishOnDesign,
  setFinish as setFinishOnDesign,
  setHandle as setHandleOnDesign,
  setHardwareTier as setHardwareTierOnDesign,
  setMaterialTier as setMaterialTierOnDesign,
  setWidth as setWidthOnDesign,
  toMetres,
  type BodyCatalog,
  type BodyProbeFactory,
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
import type { DesignRevision } from "@lemnaria/persistence";
import { useContext, useSyncExternalStore } from "react";
import { create, type StoreApi, type UseBoundStore } from "zustand";

import { sessionConfigurationRepository } from "@/persistence/fetch-configuration-repository";
import {
  createSaveCoalescer,
  type SaveCoalescer,
  type SaveStatus,
} from "@/persistence/save-coalescer";

import { applyCommandResult, type Selection } from "./apply-command-result";
import { ServerSnapshotStoreContext } from "./server-snapshot-context";
import {
  preflightWholeKitchenSettings,
  type WholeKitchenSetting,
  type WholeKitchenSettingsRequest,
} from "./whole-kitchen-apply";

export type { Selection };

/** What one press of the settings sheet's *Aplică* did. `committed: false` carries the setting that
 *  refused, because the sheet has to say which change it kept the customer on. */
export type WholeKitchenApplyOutcome =
  | { readonly committed: true }
  | {
      readonly committed: false;
      readonly setting: WholeKitchenSetting;
      readonly reason: RejectionReason;
    };

/** The save-coalescer's status, re-exported so the union has one copy. `idle` covers both "never saved"
 *  and "last save succeeded"; `hasPersistedSuccessfully` tells them apart. */
export type { SaveStatus };

/**
 * Whether this browser may edit a design: four states, not two. `"checking"` and `"check-failed"` both mean "no
 * answer yet": the write-token cookie is scoped `Path=/api/designs/{id}`, so the request that rendered `/d/{id}`
 * never carried it and `useWriteAccessProbe` asks the one route that can (ADR 0019 decision 1); `"check-failed"`
 * means that probe failed. Named states, not an absent field: the repository reads an absent `canWrite` as false,
 * and two opposite defaults for one missing value could mark a read-only design writable. Neither is writable
 * (`isReadOnly`).
 */
export type WriteAccess = boolean | "checking" | "check-failed";

export interface ConfiguratorState {
  readonly design: Design;
  readonly records: readonly PlacementRecord[];
  /** The catalogue the held design's own cabinet depth builds, so `describeSelection` and `offersFor` read
   *  the same map the commands do. Derived from `catalogAt`, never passed in: a 700 mm design can never be
   *  held beside a map built at 600. */
  readonly catalog: BodyCatalog;
  /** Extent frozen at load time, `hasFullHeightUnder` live (file header). The published face: `voids` derive
   *  from it so nothing past a wall's end is offered or drawn (ADR 0069). */
  readonly columns: ReadonlyMap<string, Column>;
  /** The same map without ADR 0069's wall-end cap: what a command is handed and the document is projected
   *  from (ADR 0090 Amendment B). A command whose `effect.columns` replaces the map whole must edit this
   *  face. */
  readonly recordedColumns: ReadonlyMap<string, Column>;
  readonly voids: readonly VoidRecord[];
  readonly selection: Selection;
  readonly select: (target: NonNullable<Selection>) => void;
  readonly deselect: () => void;
  /** The last refusal, the only thing a refused command changes. Transient: a successful command or a
   *  selection move clears it, since the sentence was about the target that refused. */
  readonly lastRejection: RejectionReason | null;
  readonly remove: () => void;
  readonly insert: (buildId: string) => void;
  readonly setFinish: (finish: Finish) => void;
  /** This cabinet follows the kitchen's colour again (ADR 0099 decision 8). The finish key is deleted, so
   *  the cabinet also tracks the next global change. */
  readonly clearFinish: () => void;
  readonly setHandle: (handle: Handle) => void;
  /** The resize (DEVELOPMENT-SPEC §5.4); takes a width only. Which bodies move and whether it is legal are
   *  the command's decision (ADR 0031). */
  readonly setWidth: (widthMm: number) => void;
  /** The whole-kitchen settings. Neither needs a selection, and both take the tier ids the caller's price
   *  book offers: the store names no price book (ADR 0062 seam 1); `use-priced-design.ts` does. */
  readonly setMaterialTier: (
    tierId: string,
    availableTierIds: readonly string[],
  ) => void;
  readonly setHardwareTier: (
    tierId: string,
    availableTierIds: readonly string[],
  ) => void;
  /** Depth, the third whole-kitchen setting; takes a depth only. The offered depths and the 520 mm floor
   *  are the command's (ADR 0059). Refuses `BODY_PROBE_UNAVAILABLE` without a probe, because every body is
   *  rebuilt through `evaluateInsertFit`. */
  readonly setCabinetDepth: (cabinetDepthMm: number) => void;
  /**
   * The three settings above as one press: every change runs against the previous one's design, so the
   * store commits all or none. Unlike every other action it reports whether it committed: the sheet stays
   * open on a refusal and names the setting, and `lastRejection` cannot tell this press's refusal from one
   * already on screen.
   */
  readonly applyWholeKitchenSettings: (
    request: WholeKitchenSettingsRequest,
  ) => WholeKitchenApplyOutcome;
  /**
   * The factory the scene attached; `isBodyProbeAttached` derives from it. The store holds no probe (ADR 0076
   * decision 2): each consumer leases for its own scope. A factory, not a probe, because the adapter's builders
   * ignore the depth they are handed, so a probe over the old kit measures the old depth.
   */
  readonly probeAt: BodyProbeFactory | undefined;
  /** Whether `insert` can do anything: false until the scene calls `attachBodyProbe`, so a control is
   *  disabled rather than offered then refused (§9). Derived from `probeAt !== undefined` and written only
   *  by attach/detach (ADR 0076 decision 6). */
  readonly isBodyProbeAttached: boolean;
  readonly attachBodyProbe: (probeAt: BodyProbeFactory) => void;
  /** The scene's unmount half: the store outlives any scene, so without it the flag would claim a probe
   *  that measures a room nobody renders. */
  readonly detachBodyProbe: () => void;
  readonly designId: DesignId | null;
  /**
   * The revision the stored design stood at when this browser last heard from the server: the hydrating
   * load or the last successful save. `null` means no row exists yet. Opaque: only the server's answer
   * advances it.
   */
  readonly revision: DesignRevision | null;
  readonly saveStatus: SaveStatus;
  /** Gate a share-link UI on this, not on `designId !== null`: a never-written design must not present a
   *  shareable link. */
  readonly hasPersistedSuccessfully: boolean;
  /**
   * Whether a command has changed the design since it was loaded: *is there anything for Back to lose*. Not
   * a save status. Only an applied command that changed the document sets it, so a refusal, a selection and
   * a no-op (re-pressing the worn handle) leave it false. `hydrate` clears it and a save never writes it.
   */
  readonly hasBeenEdited: boolean;
  /**
   * Whether this browser holds the write credential (ADR 0019 decision 1), as the load reported it, or
   * `"checking"` / `"check-failed"` before an answer. A fact carried in, never decided here: `describePanel`
   * decides what the panel does with it.
   */
  readonly canWrite: WriteAccess;
  /** The server's answer about write access, which on the load-by-link path arrives after the design
   *  (`LoadedDesignState.canWrite`). Ignored when the store has moved to a different design: the answer is
   *  per-design. */
  readonly applyWriteAccess: (access: {
    designId: DesignId;
    canWrite: boolean;
  }) => void;
  /** The probe could not answer at all (dropped request, blocked API, offline). Moves `canWrite` to
   *  `"check-failed"`, a retryable notice: a network failure is no evidence either way and must not be read
   *  as "writable". */
  readonly failWriteAccessCheck: (attempt: { designId: DesignId }) => void;
  /** The retry behind that notice: back to `"checking"`, which the probe effect watches. A no-op unless the
   *  last check failed, so a stray press cannot discard an answer the probe already gave. */
  readonly retryWriteAccessCheck: () => void;
  /** Replaces the design wholesale (the `/d/[id]` load). It round-tripped the database, so it counts as
   *  persisted. Clears the selection, whose ids may mean nothing in the new design. */
  readonly hydrate: (loaded: LoadedDesignState) => void;
  readonly setSaveStatus: (status: SaveStatus) => void;
  /** A successful save's id and revision, the coalescer's `onSaved` hook. They arrive together: an id kept
   *  without its new revision would make the next write expect one already consumed. */
  readonly applySaved: (saved: {
    id: DesignId;
    revision: DesignRevision;
  }) => void;
  /**
   * The customer's answer to `saveStatus: "conflict"`: write what is on screen over the stored design after
   * re-reading its revision. The other answer, reloading, is a page reload and not a store action.
   */
  readonly overwriteConflict: () => void;
}

/** One load's state: the document, its id and this browser's access, passed as one object so `hydrate`
 *  cannot have two of them swapped positionally. */
export interface LoadedDesignState {
  readonly design: Design;
  readonly designId: DesignId;
  /** The revision this document was read at. Required: a loader that dropped it would leave the first save
   *  with no expectation to state, which the route refuses. */
  readonly revision: DesignRevision;
  /**
   * Required so a loader that does not know has to say so: `/d/{id}` passes `"checking"` and
   * `applyWriteAccess` settles it. Not optional-defaulting-to-writable: `hydrate({ design: await
   * repository.load(id), designId })` would drop `canWrite` (the repository contract has none) and mark a
   * read-only design writable with no type error.
   */
  readonly canWrite: WriteAccess;
}

export interface ConfiguratorStoreOptions {
  readonly design: Design;
  /**
   * A factory, never a built catalogue: a `catalog` field would let a caller hand in a 700 mm design beside
   * a map built at 600, and every geometry, void and command would answer at the wrong depth silently.
   */
  readonly catalogAt: (cabinetDepthMm: number) => BodyCatalog;
  /** Defaults to `null`: the seeded fixture starts unminted. */
  readonly designId?: DesignId | null;
  /** The revision `designId`'s row stands at. Meaningless without a design id; `null` alongside one makes
   *  the first save refused. */
  readonly revision?: DesignRevision | null;
  /** Called after the store applies a successful command, never on a refusal and never awaited, so no
   *  interaction blocks on a write. Receives the save coalescer's `scheduleSave`. */
  readonly onDesignChanged?: (design: Design) => void;
  /**
   * Advances the singleton persistence seam's generation when hydration switches design identity. Other
   * store instances have no background writer and leave this unset.
   */
  readonly onDesignIdentityChanged?: () => void;
  /** The overwrite half of WEB-003's conflict choice, wired to the coalescer at the singleton seam.
   *  Other store instances have no background writer and leave this unset. */
  readonly onOverwriteRequested?: (design: Design) => void;
  /** The domain reads no clock, so the caller supplies `occurredAt`; injected so a test can pin it. */
  readonly now?: () => string;
  /**
   * Defaults to `true`: a never-minted design has no credential yet and mints on its first mutation. Only a
   * loaded design can be read-only, via `hydrate`. A fresh configurator that believed itself read-only would
   * refuse every edit it is about to be granted.
   */
  readonly canWrite?: boolean;
  /** Tests inject a fake probe here. The app cannot: the real probe needs a `Kit` and the mounted
   *  room, which do not exist until the scene mounts, so it arrives later via `attachBodyProbe`. */
  readonly probeAt?: BodyProbeFactory;
}

/** What every command needs from the store: the design, the column map and the selection, passed as one
 *  object so each action stays the call/apply/schedule adapter. */
interface CommandContext {
  readonly design: Design;
  /** Read from state, not closed over at construction: a depth change replaces it. */
  readonly catalog: BodyCatalog;
  /** The recorded face (ADR 0090 Amendment B). `setWidth` and `insertBody` return a map that replaces this
   *  one whole, so handing in the published map would persist ADR 0069's wall-end cap into the document.
   *  Safe to look a void up in: the cap preserves a column's key (`clip-empty-columns-at-wall-end.ts`). */
  readonly columns: ReadonlyMap<string, Column>;
  /** The published openings, the list §9's offer list is drawn from (`use-panel-view.ts`). `insertBody`
   *  must match what was offered, not openings rebuilt from the recorded face, which ADR 0069 says may never
   *  be offered. */
  readonly voids: readonly VoidRecord[];
  readonly target: CommandTarget;
}

function deriveGeometry(design: Design, catalog: BodyCatalog) {
  const records = derivePlacementRecords(design, catalog);
  // ADR 0044 and ADR 0053: the document carries what placements cannot: spaces with no member left and the
  // frozen extents of columns whose members no longer reach as far as the customer left them. Without both
  // arguments the frozen map dies at reload.
  const stored = {
    emptyColumns: design.emptyColumns,
    columnExtents: design.columnExtents,
  };
  // Two faces of one map (ADR 0090 Amendment B). `deriveColumns` ends in ADR 0069's wall-end cap and is what
  // openings, the scene and an insert match against; `deriveRecordedColumns` omits it and feeds the next
  // command's projection, so the cap bounds what is published without rewriting what is recorded.
  const columns = deriveColumns(records, stored, design.room);
  const recordedColumns = deriveRecordedColumns(
    records,
    stored,
    toMetres(design.room.widthMm),
  );
  const voids = recomputeVoids(records, columns);
  return { records, columns, recordedColumns, voids };
}

function nowInIsoMilliseconds(): string {
  return new Date().toISOString();
}

/** What a command rewrites whether or not the kitchen changed: the timestamp and the two projections of the
 *  frozen column map, re-projected by every command (`commands/reconcile-command-result.ts`), so they can
 *  differ after a no-op. */
function withoutBookkeeping(design: Design): Design {
  return {
    ...design,
    updatedAt: "",
    emptyColumns: undefined,
    columnExtents: undefined,
  };
}

function hasSameContent(before: Design, after: Design): boolean {
  return isDeepEqual(withoutBookkeeping(before), withoutBookkeeping(after));
}

function isDeepEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (typeof left !== "object" || typeof right !== "object") return false;
  if (left === null || right === null) return false;
  if (Array.isArray(left) !== Array.isArray(right)) return false;
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key) =>
        Object.hasOwn(right, key) &&
        isDeepEqual(Reflect.get(left, key), Reflect.get(right, key)),
    )
  );
}

/** Builds a fresh store for a fixed design/catalog pair. The app uses the single `useConfiguratorStore`
 *  below; tests use this so state is never shared. */
export function createConfiguratorStore(
  options: ConfiguratorStoreOptions,
): UseBoundStore<StoreApi<ConfiguratorState>> {
  const { design } = options;
  const designId = options.designId ?? null;
  const onDesignChanged = options.onDesignChanged ?? (() => undefined);
  const now = options.now ?? nowInIsoMilliseconds;

  /** One map per depth for the life of the store: `catalog` is published state, so rebuilding an equal
   *  `Map` after every command would re-render every selector for an unmoved value. Bounded by the declared
   *  depths (ADR 0059). */
  const catalogsByDepthMm = new Map<number, BodyCatalog>();
  const catalogFor = (forDesign: Design): BodyCatalog => {
    const cabinetDepthMm = cabinetDepthMmOf(forDesign);
    const built =
      catalogsByDepthMm.get(cabinetDepthMm) ??
      options.catalogAt(cabinetDepthMm);
    catalogsByDepthMm.set(cabinetDepthMm, built);
    return built;
  };

  return create<ConfiguratorState>((set, get) => {
    /** Apply and schedule in one `set()`; shared by the targeted commands and the whole-kitchen pair, which
     *  have no target. */
    const applyResult = (result: CommandResult) => {
      const state = get();
      // The catalogue comes from the result's own design: a depth change is the only command that moves it,
      // so it is never applied against the previous depth's map. A refusal needs no branch: it cannot change
      // the depth, so the lookup resolves to the held map.
      const catalog = catalogFor(result.design);
      const application = applyCommandResult({
        result,
        catalog,
        // The recorded face: ADR 0069's cap belongs to what is offered, never to what is stored.
        columns: state.recordedColumns,
        selection: state.selection,
      });
      if (!application.applied) {
        set(application.state);
        return;
      }
      // The catalogue follows the held depth; the probe does not (ADR 0076 decision 2).
      set({
        ...application.state,
        catalog,
        hasBeenEdited:
          state.hasBeenEdited ||
          !hasSameContent(state.design, application.state.design),
      });
      onDesignChanged(application.state.design);
    };

    /** Call, apply, schedule in one `set()`. With no selected target the domain is never reached: the store
     *  refuses `TARGET_NOT_FOUND` itself. */
    const runCommand = (
      command: (context: CommandContext) => CommandResult,
    ) => {
      const state = get();
      applyResult(
        state.selection
          ? command({
              design: state.design,
              catalog: state.catalog,
              columns: state.recordedColumns,
              voids: state.voids,
              target: state.selection,
            })
          : refuse(state.design, { code: "TARGET_NOT_FOUND", params: {} }),
      );
    };

    const catalog = catalogFor(design);
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
        runCommand(({ design: current, catalog: held, target }) =>
          removePlacement({
            design: current,
            target,
            catalog: held,
            occurredAt: now(),
          }),
        );
      },
      insert: (buildId) => {
        const probeAt = get().probeAt;
        runCommand(
          ({ design: current, catalog: held, columns, voids, target }) =>
            probeAt
              ? // Borrowed for this command and given back before it returns (ADR 0076 decision 1).
                probeAt(cabinetDepthMmOf(current)).use((probe) =>
                  insertBody({
                    design: current,
                    columns,
                    voids,
                    target,
                    catalog: held,
                    buildId,
                    probe,
                    occurredAt: now(),
                  }),
                )
              : // A missing probe is a refusal, not a throw: `isBodyProbeAttached` keeps controls from being
                // offered earlier. It follows the selection check, so `insert` fails like the other commands
                // with nothing selected.
                refuse(current, { code: "BODY_PROBE_UNAVAILABLE", params: {} }),
        );
      },
      setFinish: (finish) => {
        runCommand(({ design: current, catalog: held, target }) =>
          setFinishOnDesign({
            design: current,
            target,
            catalog: held,
            finish,
            occurredAt: now(),
          }),
        );
      },
      clearFinish: () => {
        runCommand(({ design: current, catalog: held, target }) =>
          clearFinishOnDesign({
            design: current,
            target,
            catalog: held,
            occurredAt: now(),
          }),
        );
      },
      setHandle: (handle) => {
        runCommand(({ design: current, catalog: held, target }) =>
          setHandleOnDesign({
            design: current,
            target,
            catalog: held,
            handle,
            occurredAt: now(),
          }),
        );
      },
      setWidth: (widthMm) => {
        const probeAt = get().probeAt;
        runCommand(({ design: current, catalog: held, columns, target }) =>
          probeAt
            ? probeAt(cabinetDepthMmOf(current)).use((probe) =>
                setWidthOnDesign({
                  design: current,
                  columns,
                  target,
                  catalog: held,
                  widthMm,
                  probe,
                  occurredAt: now(),
                }),
              )
            : // The same safety net as `insert`: a chip tapped despite §9 disabling it.
              refuse(current, { code: "BODY_PROBE_UNAVAILABLE", params: {} }),
        );
      },
      setMaterialTier: (tierId, availableTierIds) => {
        applyResult(
          setMaterialTierOnDesign({
            design: get().design,
            tierId,
            availableTierIds,
            occurredAt: now(),
          }),
        );
      },
      setHardwareTier: (tierId, availableTierIds) => {
        applyResult(
          setHardwareTierOnDesign({
            design: get().design,
            tierId,
            availableTierIds,
            occurredAt: now(),
          }),
        );
      },
      setCabinetDepth: (cabinetDepthMm) => {
        const state = get();
        const probeAt = state.probeAt;
        applyResult(
          probeAt
            ? setCabinetDepthOnDesign({
                design: state.design,
                // The factory, handed straight through: the command builds the map at the depth it writes
                // and `applyResult` holds the map that same document declares.
                catalogAt: options.catalogAt,
                cabinetDepthMm,
                // The factory, not a probe: the command leases one at the depth it is moving to.
                probeAt,
                occurredAt: now(),
              })
            : // The same safety net as `insert` and `setWidth`: every body is rebuilt through the insert path.
              refuse(state.design, {
                code: "BODY_PROBE_UNAVAILABLE",
                params: {},
              }),
        );
      },
      applyWholeKitchenSettings: (request) => {
        const state = get();
        const preflight = preflightWholeKitchenSettings(request, {
          design: state.design,
          catalogAt: options.catalogAt,
          probeAt: state.probeAt,
          occurredAt: now(),
        });
        if (preflight.outcome === "refused") {
          // The one thing a refusal writes, as in `applyResult`: the sentence, nothing of the design.
          set({ lastRejection: preflight.reason });
          return {
            committed: false,
            setting: preflight.setting,
            reason: preflight.reason,
          };
        }
        // `"unchanged"` runs no command and schedules no save: an untouched sheet leaves `updatedAt` as found.
        if (preflight.outcome === "ready") applyResult(preflight.result);
        return { committed: true };
      },
      probeAt: options.probeAt,
      isBodyProbeAttached: options.probeAt !== undefined,
      attachBodyProbe: (probeAt) => {
        set({
          probeAt,
          isBodyProbeAttached: true,
        });
      },
      detachBodyProbe: () => {
        set({
          probeAt: undefined,
          isBodyProbeAttached: false,
        });
      },
      designId,
      revision: options.revision ?? null,
      saveStatus: "idle",
      canWrite: options.canWrite ?? true,
      hasPersistedSuccessfully: designId !== null,
      hasBeenEdited: false,
      hydrate: (loaded) => {
        // A loaded document carries its own `settings.cabinetDepthMm`: reusing the opening map would
        // evaluate a 700 mm kitchen at 600 mm.
        const loadedCatalog = catalogFor(loaded.design);
        const geometry = deriveGeometry(loaded.design, loadedCatalog);
        if (get().designId !== loaded.designId)
          options.onDesignIdentityChanged?.();
        set({
          design: loaded.design,
          catalog: loadedCatalog,
          ...geometry,
          selection: null,
          lastRejection: null,
          designId: loaded.designId,
          revision: loaded.revision,
          canWrite: loaded.canWrite,
          hasPersistedSuccessfully: true,
          hasBeenEdited: false,
          // A save status describes the generation that produced it, so it resets on load. A carried
          // `unauthorized` would render a design this browser owns as read-only, and only a successful write
          // clears it, which the read-only panel has disabled: a deadlock only a reload leaves.
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
        // A boolean is an answer the server gave: a later failed probe must not demote it to "unknown".
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
      applySaved: ({ id, revision }) => {
        set({ designId: id, revision, hasPersistedSuccessfully: true });
      },
      overwriteConflict: () => {
        options.onOverwriteRequested?.(get().design);
      },
    };
  });
}

/**
 * The app mounts one store and one coalescer per tab; identity is a session concern kept at their wiring
 * seam, not customer-facing state.
 */
let saveGeneration = 0;

function advanceSaveGeneration(): void {
  saveGeneration += 1;
}

/** The browser session's store. Not exported: the app reads it through `useConfiguratorStore`, the one place
 *  that answers a server snapshot from anywhere but this store's own initial state. */
const sessionStore = createConfiguratorStore({
  design: KITCHEN_L_DESIGN,
  catalogAt: buildKitchenLBodyCatalog,
  onDesignChanged: persistDesignChange,
  onDesignIdentityChanged: advanceSaveGeneration,
  onOverwriteRequested: overwriteConflictingDesign,
});

function selectWholeState(state: ConfiguratorState): ConfiguratorState {
  return state;
}

function useSessionStoreSlice(): ConfiguratorState;
function useSessionStoreSlice<Selected>(
  selector: (state: ConfiguratorState) => Selected,
): Selected;
function useSessionStoreSlice(
  selector: (state: ConfiguratorState) => unknown = selectWholeState,
): unknown {
  const snapshotStore = useContext(ServerSnapshotStoreContext);
  return useSyncExternalStore(
    sessionStore.subscribe,
    () => selector(sessionStore.getState()),
    () =>
      selector(
        snapshotStore === null
          ? sessionStore.getInitialState()
          : snapshotStore.getState(),
      ),
  );
}

/**
 * The single store the app mounts against, with zustand's call shape. Its server snapshot is not zustand's
 * `getInitialState()` (the seeded L, wrong for every other design) but the nearest `ConfiguratorSnapshotProvider`'s
 * per-render store (ADR 0133); subscription, `getState`, `setState` and `subscribe` still address the session
 * store, and on the client the provider swaps in the session's actions (`configurator-snapshot.tsx`).
 */
export const useConfiguratorStore: UseBoundStore<StoreApi<ConfiguratorState>> =
  Object.assign(useSessionStoreSlice, {
    getState: sessionStore.getState,
    getInitialState: sessionStore.getInitialState,
    setState: sessionStore.setState,
    subscribe: sessionStore.subscribe,
  });

/** The session's one coalescer (ADR 0010 decision 2), built on first use: this module is imported by server
 *  components, and `useConfiguratorStore` is not initialised while its own options object is evaluated. */
let saveCoalescer: SaveCoalescer | null = null;

/** Hands a just-applied design to the coalescer and returns; never awaited, so no interaction blocks on a
 *  write. Called only after a successful command. */
function persistDesignChange(design: Design): void {
  sessionSaveCoalescer().scheduleSave(design);
}

/** The overwrite half of the conflict choice. It goes through the same coalescer so it reconciles with
 *  whatever that coalescer has queued, retrying or refused for this design. */
function overwriteConflictingDesign(design: Design): void {
  sessionSaveCoalescer().overwriteConflict(design);
}

function sessionSaveCoalescer(): SaveCoalescer {
  saveCoalescer ??= createSaveCoalescer({
    repository: sessionConfigurationRepository,
    getDesignId: () => useConfiguratorStore.getState().designId,
    getGeneration: () => saveGeneration,
    getRevision: () => useConfiguratorStore.getState().revision,
    readCurrentRevision: async (id) =>
      (await sessionConfigurationRepository.loadWithAccess(id)).revision,
    onSaved: (saved, generation) => {
      if (generation !== saveGeneration) return;
      useConfiguratorStore.getState().applySaved(saved);
    },
    onSaveStatusChange: (status, generation) => {
      if (generation !== saveGeneration) return;
      useConfiguratorStore.getState().setSaveStatus(status);
    },
  });
  return saveCoalescer;
}
