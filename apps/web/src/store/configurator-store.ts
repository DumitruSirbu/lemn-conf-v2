// Work item 6's store half (`docs/milestones/M2-void-engine.md`). Holds the current design's
// placements plus the derived `PlacementRecord[]` / columns / voids, and the current selection.
// No mutation exists in this phase (M3): placements are fixed at store creation, which is what
// makes derived state safe without a setter — there is nothing yet that could invalidate it.
import {
  deriveColumns,
  derivePlacementRecords,
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  recomputeVoids,
  type BodyCatalog,
  type Column,
  type Design,
  type DesignId,
  type PlacementRecord,
  type VoidRecord,
} from "@lemnaria/configurator-domain";
import { create, type StoreApi, type UseBoundStore } from "zustand";

export type Selection = {
  readonly kind: "placement" | "void";
  readonly id: string;
} | null;

/** Mirrors the save-coalescer's status (`src/persistence/save-coalescer.ts`): `idle` covers both
 *  "never saved" and "last save succeeded" — `hasPersistedSuccessfully` is the field that
 *  distinguishes those two, per the milestone's "never write, never shareable" rule. */
export type SaveStatus = "idle" | "saving" | "error";

export interface ConfiguratorState {
  readonly design: Design;
  readonly records: readonly PlacementRecord[];
  readonly columns: ReadonlyMap<string, Column>;
  readonly voids: readonly VoidRecord[];
  readonly selection: Selection;
  readonly select: (target: NonNullable<Selection>) => void;
  readonly deselect: () => void;
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

function deriveGeometry(design: Design, catalog: BodyCatalog) {
  const records = derivePlacementRecords(design, catalog);
  const columns = deriveColumns(records);
  const voids = recomputeVoids(records, columns);
  return { records, columns, voids };
}

/** Builds a fresh store instance for a fixed design/catalog pair. The app itself uses the single
 *  `useConfiguratorStore` instance below — this factory exists so tests never share state.
 *  `designId` defaults to `null`: the seeded fixture starts out unminted, matching M2's "mint on
 *  first write" trigger. */
export function createConfiguratorStore(
  design: Design,
  catalog: BodyCatalog,
  designId: DesignId | null = null,
): UseBoundStore<StoreApi<ConfiguratorState>> {
  return create<ConfiguratorState>((set) => ({
    design,
    ...deriveGeometry(design, catalog),
    selection: null,
    select: (target) => {
      set({ selection: target });
    },
    deselect: () => {
      set({ selection: null });
    },
    designId,
    saveStatus: "idle",
    hasPersistedSuccessfully: designId !== null,
    hydrate: (nextDesign, nextDesignId) => {
      set({
        design: nextDesign,
        ...deriveGeometry(nextDesign, catalog),
        selection: null,
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
  }));
}

/** The single store instance the app mounts against — no hard-coded canvas id anywhere, per the
 *  milestone's "Shared" acceptance bullet: the selection owns the target, not any one canvas. */
export const useConfiguratorStore = createConfiguratorStore(
  KITCHEN_L_DESIGN,
  KITCHEN_L_BODY_CATALOG,
);
