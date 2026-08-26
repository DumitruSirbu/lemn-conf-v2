"use client";

// The store half of §9's panel: read the selection, project it, hand the result to a component.
//
// Three memoised steps, in the order §8 defines them — `describeSelection` produces `meta`, and
// `offersFor` produces the list `meta` alone cannot (it needs the frozen column map). Nothing here
// decides anything: `describePanel` owns every rule and this hook owns the subscription.
import {
  describeSelection,
  offersFor,
  type CatalogOffer,
  type SelectionMeta,
} from "@lemnaria/configurator-domain";
import { useMemo } from "react";

import { useConfiguratorStore } from "@/store/configurator-store";

import { describePanel, type PanelView } from "./panel-model";

export function usePanelView(): PanelView {
  const meta = useSelectionMeta();
  const offers = useSelectionOffers();
  const rejection = useConfiguratorStore((state) => state.lastRejection);
  const isBodyProbeAttached = useConfiguratorStore(
    (state) => state.isBodyProbeAttached,
  );
  // Both halves of "may this browser edit, and did the last write land" — read as facts and handed
  // straight to `describePanel`, which owns what they mean. Nothing is combined here.
  const canWrite = useConfiguratorStore((state) => state.canWrite);
  const saveStatus = useConfiguratorStore((state) => state.saveStatus);

  return useMemo(
    () =>
      describePanel({
        meta,
        offers,
        rejection,
        isBodyProbeAttached,
        canWrite,
        saveStatus,
      }),
    [meta, offers, rejection, isBodyProbeAttached, canWrite, saveStatus],
  );
}

/** §8's `meta` — the panel's entire input. `undefined` when nothing is selected, and also when a
 *  recompute left the selection pointing at a void id that no longer exists. */
function useSelectionMeta(): SelectionMeta | undefined {
  const records = useConfiguratorStore((state) => state.records);
  const voids = useConfiguratorStore((state) => state.voids);
  const catalog = useConfiguratorStore((state) => state.catalog);
  const selection = useConfiguratorStore((state) => state.selection);

  return useMemo(
    () =>
      selection
        ? describeSelection({ records, voids, catalog, target: selection })
        : undefined,
    [records, voids, catalog, selection],
  );
}

function useSelectionOffers(): CatalogOffer[] {
  const records = useConfiguratorStore((state) => state.records);
  const voids = useConfiguratorStore((state) => state.voids);
  const columns = useConfiguratorStore((state) => state.columns);
  const catalog = useConfiguratorStore((state) => state.catalog);
  const selection = useConfiguratorStore((state) => state.selection);

  return useMemo(
    () =>
      selection
        ? offersFor({ records, voids, columns, catalog, target: selection })
        : [],
    [records, voids, columns, catalog, selection],
  );
}
