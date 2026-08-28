"use client";

// The store half of §9's panel: read the selection, project it, hand the result to a component.
//
// Three memoised steps, in the order §8 defines them — `describeSelection` produces `meta`, and
// `offersFor` produces the list `meta` alone cannot (it needs the frozen column map). Nothing here
// decides anything: `describePanel` owns every rule and this hook owns the subscription.
import {
  describeSelection,
  offersFor,
  widthOptionsFor,
  type CatalogOffer,
  type SelectionMeta,
  type WidthOption,
} from "@lemnaria/configurator-domain";
import { useMemo } from "react";

import { useConfiguratorStore } from "@/store/configurator-store";

import { describePanel, type PanelView } from "./panel-model";

export function usePanelView(): PanelView {
  const meta = useSelectionMeta();
  const offers = useSelectionOffers();
  const widthOptions = useSelectionWidthOptions();
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
        widthOptions,
        rejection,
        isBodyProbeAttached,
        canWrite,
        saveStatus,
      }),
    [
      meta,
      offers,
      widthOptions,
      rejection,
      isBodyProbeAttached,
      canWrite,
      saveStatus,
    ],
  );
}

/** §8's `meta` — the panel's entire input. `undefined` when nothing is selected, and also when a
 *  recompute left the selection pointing at a void id that no longer exists.
 *
 *  Exported for `SelectionDebug`, the e2e suite's one observability hook, so the numbers a browser
 *  test reads are the very ones the panel was given rather than a second projection beside it. */
export function useSelectionMeta(): SelectionMeta | undefined {
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

/** §9's width chips, judged by the engine rather than by the panel: `widthOptionsFor` runs
 *  `setWidth` once per candidate width and reports what it answered.
 *
 *  **Empty without a probe**, and that is the honest answer rather than a degraded one. A resize
 *  rebuilds through the real builders and re-checks the measurement, so with no probe attached
 *  every width would refuse `BODY_PROBE_UNAVAILABLE` — a section of chips greyed with a sentence
 *  about the 3D model, where §9 asks for no section at all until there is something to say. The
 *  scene attaches one on mount and this recomputes; the replace list carries the "model is
 *  preparing" message in the meantime, and one such message per panel is enough.
 *
 *  Memoised on the store slices it reads, which is what keeps a query that runs the command once
 *  per chip off the render path. It re-runs when the design changes, when the selection moves, or
 *  when the probe attaches — the three things that can change an answer. */
function useSelectionWidthOptions(): WidthOption[] {
  const design = useConfiguratorStore((state) => state.design);
  const columns = useConfiguratorStore((state) => state.columns);
  const catalog = useConfiguratorStore((state) => state.catalog);
  const selection = useConfiguratorStore((state) => state.selection);
  const probe = useConfiguratorStore((state) => state.bodyProbe);

  return useMemo(
    () =>
      selection && probe
        ? widthOptionsFor({
            design,
            columns,
            catalog,
            target: selection,
            probe,
          })
        : [],
    [design, columns, catalog, selection, probe],
  );
}
