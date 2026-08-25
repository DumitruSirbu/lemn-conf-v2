// Work item 6's store half (`docs/milestones/M2-void-engine.md`), extended by M3 work item 9 with
// the four commands: `remove`, `insert`, `setFinish`, `setHandle`.
//
// Each action is the adapter the milestone's Boundaries section describes — call the domain
// command, apply its result in one `set()`, schedule the save — and nothing more. Every product
// rule lives in `@lemnaria/configurator-domain`; a guard re-implemented here would be a second
// place for the rules to drift apart.
//
// Columns are **frozen load-time state** (ADR 0011 Gap D): derived at store creation and in
// `hydrate`, and never by a command. `deriveGeometry` is therefore the load path only.
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

import { applyCommandResult, type Selection } from "./apply-command-result";

export type { Selection };

/** Mirrors the save-coalescer's status (`src/persistence/save-coalescer.ts`): `idle` covers both
 *  "never saved" and "last save succeeded" — `hasPersistedSuccessfully` is the field that
 *  distinguishes those two, per the milestone's "never write, never shareable" rule. */
export type SaveStatus = "idle" | "saving" | "error";

export interface ConfiguratorState {
  readonly design: Design;
  readonly records: readonly PlacementRecord[];
  /** Frozen at load time — see the file header and ADR 0011 Gap D. */
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
  /** Whether `insert` can do anything. False until the scene calls `attachBodyProbe`, and
   *  published so a control is disabled rather than offered and then refused ("never offer what
   *  cannot be satisfied", §9). `insert` refuses `BODY_PROBE_UNAVAILABLE` if one is called anyway. */
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
  /** Replaces the store's design wholesale — the load-by-link path (`/d/[id]`). The loaded design
   *  already round-tripped through the database, so it counts as persisted; clears the selection,
   *  since an id selected in the previous design has no guaranteed meaning in the new one. */
  readonly hydrate: (design: Design, designId: DesignId) => void;
  readonly setSaveStatus: (status: SaveStatus) => void;
  /** Records a successful save's id — the save-coalescer's `onSaved` hook. */
  readonly applySavedId: (id: DesignId) => void;
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
  /** The domain reads no clock, so the caller supplies `occurredAt`. Injected so a test can pin
   *  it and so nothing in the domain has to be mocked to make a timestamp predictable. */
  readonly now?: () => string;
  /** Tests inject a fake probe here. The app cannot: the real probe needs a `Kit` and the mounted
   *  room, which do not exist until the scene mounts, so it arrives later via `attachBodyProbe`. */
  readonly bodyProbe?: BodyProbe;
}

/** What every command needs from the store: the current design, the **frozen** column map, and
 *  what is selected. Passed as one object so each action stays the call/apply/schedule adapter. */
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
  let bodyProbe = options.bodyProbe;

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
        runCommand(({ design: current, columns, target }) =>
          bodyProbe
            ? insertBody({
                design: current,
                columns,
                target,
                catalog,
                buildId,
                probe: bodyProbe,
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
      isBodyProbeAttached: bodyProbe !== undefined,
      attachBodyProbe: (probe) => {
        bodyProbe = probe;
        set({ isBodyProbeAttached: true });
      },
      detachBodyProbe: () => {
        bodyProbe = undefined;
        set({ isBodyProbeAttached: false });
      },
      designId,
      saveStatus: "idle",
      hasPersistedSuccessfully: designId !== null,
      hydrate: (nextDesign, nextDesignId) => {
        set({
          design: nextDesign,
          ...deriveGeometry(nextDesign, catalog),
          selection: null,
          lastRejection: null,
          designId: nextDesignId,
          hasPersistedSuccessfully: true,
        });
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

/** The single store instance the app mounts against — no hard-coded canvas id anywhere, per the
 *  milestone's "Shared" acceptance bullet: the selection owns the target, not any one canvas. */
export const useConfiguratorStore = createConfiguratorStore({
  design: KITCHEN_L_DESIGN,
  catalog: KITCHEN_L_BODY_CATALOG,
});
