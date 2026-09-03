"use client";

// **The application's single read of ADR 0065's overflow fact**, and the reason it is a module of
// its own rather than a line inside each surface.
//
// Wave 6A3 published `findOverflowingPlacementIds` as the one domain-owned answer to whether a body
// reaches past the end of its wall, and ADR 0065's consequences require that the scene, the price
// bar, the breakdown and M8's review "must all read one answer, or the same design will be marked in
// one place and not another". Nothing below re-derives the geometry; this hook exists so the two
// surfaces this wave adds — the mark in the scene and the sentence beside it — cannot disagree about
// *which* bodies are marked either.
import { findOverflowingPlacementIds } from "@lemnaria/configurator-domain";
import { useMemo } from "react";

import { useConfiguratorStore } from "@/store/configurator-store";

/**
 * The placement ids that reach past the end of their own wall, in the query's own byte order.
 *
 * Derived on every design change and stored nowhere (§12): the memo caches a pure query keyed on the
 * document it reads, which is not the same thing as persisting a flag — `DesignSchema` has no
 * overflow field and gains none.
 */
export function useOverflowingPlacementIds(): readonly string[] {
  const design = useConfiguratorStore((state) => state.design);

  return useMemo(() => findOverflowingPlacementIds(design), [design]);
}
