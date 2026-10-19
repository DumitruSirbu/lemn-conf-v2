"use client";

import type { DesignId } from "@lemnaria/configurator-domain";
import { create } from "zustand";

/** The server's answer to whether this browser may offer *Salvează ca preset* for one design. */
interface PresetAuthoringState {
  readonly designId: DesignId | null;
  readonly canAuthorPresets: boolean;
  readonly record: (answer: {
    designId: DesignId;
    canAuthorPresets: boolean;
  }) => void;
}

/**
 * **What the server said about preset authoring, held outside the design.** It is a fact about this browser and this
 * design (ADR 0112 decision 2, bullet 3: the client never decides), never saved, hydrated or shared, so it has a store
 * of its own beside `configurator-store.ts` rather than a field on it. It is recorded by the write-access probe from
 * the one `GET /api/designs/{id}` that already answers `canWrite`.
 */
export const usePresetAuthoring = create<PresetAuthoringState>((set) => ({
  designId: null,
  canAuthorPresets: false,
  record: ({ designId, canAuthorPresets }) => {
    set({ designId, canAuthorPresets });
  },
}));

/** True only for the design the answer was given for, so an answer never carries over to another design. */
export function useCanAuthorPresetsFor(designId: DesignId | null): boolean {
  return usePresetAuthoring(
    (state) =>
      designId !== null &&
      state.designId === designId &&
      state.canAuthorPresets,
  );
}
