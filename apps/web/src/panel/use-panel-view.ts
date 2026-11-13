"use client";

// The store half of §9's panel: read the selection, project it, hand the result to a component. Three memoised
// steps in §8's order: `describeSelection` produces `meta`, then `offersFor` the list `meta` alone cannot (it needs
// the frozen column map). `describePanel` owns every rule; this hook owns the subscription.
import {
  buildableWidthSpanMm,
  cabinetDepthMmOf,
  cornerDirectionOf,
  describeSelection,
  kitchenHandleSettingsOf,
  materialOfDesign,
  offersFor,
  columnWidthChoices,
  widthOptionsFor,
  type MaterialLookup,
  type WidthRangeMm,
  type CatalogOffer,
  type SelectionMeta,
  type WidthOption,
} from "@lemnaria/configurator-domain";
import { useMemo } from "react";

import { usePricedDesign } from "@/price/use-priced-design";
import { useConfiguratorStore } from "@/store/configurator-store";
import { useContent } from "@/i18n/use-content";

import { describePanel, type PanelView } from "./panel-model";
import { widthStepsFor, type WidthSteps } from "@lemnaria/configurator-domain";

export function usePanelView(): PanelView {
  const content = useContent();
  // ADR 0129 D8. Selected on its own, not read off `usePricedDesign`'s design: the direction is the one room field
  // every width refusal's wording depends on, and a wall length the width section ignores must not re-render it.
  const direction = useConfiguratorStore((state) =>
    cornerDirectionOf(state.design.room),
  );
  const meta = useSelectionMeta();
  const offers = useSelectionOffers();
  const widthSpan = useBuildableWidthSpan();
  const widthAnswers = useSelectionWidthAnswers();
  const widthOptions = widthAnswers.options;
  const widthRanges = useSelectionWidthRanges();
  const widthSteps = widthAnswers.steps;
  const material = useSelectionMaterial();
  const rejection = useConfiguratorStore((state) => state.lastRejection);
  // §9 item 7's footer price, from the one hook both price surfaces read, so footer and bar cannot differ.
  const pricing = usePricedDesign();
  const isBodyProbeAttached = useConfiguratorStore(
    (state) => state.isBodyProbeAttached,
  );
  // Read as facts and handed straight to `describePanel`, which owns what they mean; nothing is combined here.
  const canWrite = useConfiguratorStore((state) => state.canWrite);
  const saveStatus = useConfiguratorStore((state) => state.saveStatus);
  const saveResumesAtMs = useConfiguratorStore(
    (state) => state.saveResumesAtMs,
  );

  return useMemo(
    () =>
      describePanel({
        content,
        direction,
        meta,
        offers,
        buildableWidthSpanMm: widthSpan,
        widthOptions,
        widthRanges,
        widthSteps,
        rejection,
        material,
        pricing,
        isBodyProbeAttached,
        canWrite,
        saveStatus,
        saveResumesAtMs,
      }),
    [
      content,
      direction,
      meta,
      offers,
      widthSpan,
      widthOptions,
      widthRanges,
      widthSteps,
      rejection,
      material,
      pricing,
      isBodyProbeAttached,
      canWrite,
      saveStatus,
      saveResumesAtMs,
    ],
  );
}

/** Which colour control §9's Finisaj section gets (ADR 0071 decision 3): the design's material's own, so it is
 *  read off the held design, never the selected body. Memoised over the design because a declared lookup is a
 *  fresh object per call, and returning one from a selector would re-render the panel on every store change. */
function useSelectionMaterial(): MaterialLookup {
  const design = useConfiguratorStore((state) => state.design);

  return useMemo(() => materialOfDesign(design), [design]);
}

/** §8's `meta`, the panel's entire input: `undefined` when nothing is selected or the selection points at a void
 *  that no longer exists. Exported for `SelectionDebug`, so e2e tests read the numbers the panel was given. */
export function useSelectionMeta(): SelectionMeta | undefined {
  const records = useConfiguratorStore((state) => state.records);
  const voids = useConfiguratorStore((state) => state.voids);
  const catalog = useConfiguratorStore((state) => state.catalog);
  const selection = useConfiguratorStore((state) => state.selection);
  // The settings object, never a fresh one from the selector (that would re-render on every store change). The panel
  // marks the handle a cabinet follows from the kitchen's, so it reads the same settings the price and the scene do.
  const settings = useConfiguratorStore((state) => state.design.settings);

  return useMemo(
    () =>
      selection
        ? describeSelection({
            records,
            voids,
            catalog,
            target: selection,
            kitchenSettings: kitchenHandleSettingsOf(settings),
          })
        : undefined,
    [records, voids, catalog, selection, settings],
  );
}

function useSelectionOffers(): CatalogOffer[] {
  const records = useConfiguratorStore((state) => state.records);
  const voids = useConfiguratorStore((state) => state.voids);
  // The map `insertBody` itself is handed (the recorded face): §11 row 6 makes the offer list and the command one
  // evaluation read from two ends. The openings are still the published ones, derived from the capped map, so
  // nothing past a wall's end is offered (ADR 0069).
  const columns = useConfiguratorStore((state) => state.recordedColumns);
  const catalog = useConfiguratorStore((state) => state.catalog);
  const selection = useConfiguratorStore((state) => state.selection);
  // Off the held design, not the catalogue: a map cannot be asked what depth it was built at, and the offer list
  // must run the evaluation the command would run on this document.
  const cabinetDepthMm = useConfiguratorStore((state) =>
    cabinetDepthMmOf(state.design),
  );

  return useMemo(
    () =>
      selection
        ? offersFor({
            records,
            voids,
            columns,
            catalog,
            target: selection,
            cabinetDepthMm,
          })
        : [],
    [records, voids, columns, catalog, selection, cabinetDepthMm],
  );
}

/** What §9 says when nothing fits: the catalogue's own narrowest and widest buildable widths. A hook of its own
 *  because it depends on the catalogue alone, so it is memoised on the map. It cannot be derived from `offers`,
 *  since a refused row is not shown (see `describeEmptyLine`). */
function useBuildableWidthSpan(): WidthRangeMm | undefined {
  const catalog = useConfiguratorStore((state) => state.catalog);

  return useMemo(() => buildableWidthSpanMm(catalog), [catalog]);
}

/** What the column may be built within (ADR 0035 decision 3's discriminator), read from the engine rather than
 *  inferred from the widths beside it: `columnWidthChoices` publishes the ranges. No probe, so its own hook: it asks
 *  the catalogue rather than running a command, unlike the two answers `useSelectionWidthAnswers` merges. */
function useSelectionWidthRanges(): readonly WidthRangeMm[] {
  const design = useConfiguratorStore((state) => state.design);
  const catalog = useConfiguratorStore((state) => state.catalog);
  const selection = useConfiguratorStore((state) => state.selection);

  return useMemo(
    () =>
      selection
        ? (columnWidthChoices({ design, catalog, target: selection })
            ?.widthRangesMm ?? [])
        : [],
    [design, catalog, selection],
  );
}

/** The width chips and the stepper, answered together from one borrowed probe. Both run the real resize command
 *  once per candidate, so one memo takes one lease rather than two transient kits per frame.
 *
 *  Empty and `undefined` without a probe: every width would refuse `BODY_PROBE_UNAVAILABLE`, and §9 asks for no
 *  section until there is something to say; the replace list carries the "model is preparing" message meanwhile.
 *  The lease is taken inside the memo body and released before it returns; nothing crosses a React commit
 *  (ADR 0076 decision 1). */
function useSelectionWidthAnswers(): {
  options: WidthOption[];
  steps: WidthSteps | undefined;
} {
  const design = useConfiguratorStore((state) => state.design);
  // The map `setWidth` is handed, as in `useSelectionOffers`: a chip answered against a different map than the tap
  // would run reads §9's "never offer what cannot be satisfied" against the wrong evidence.
  const columns = useConfiguratorStore((state) => state.recordedColumns);
  const catalog = useConfiguratorStore((state) => state.catalog);
  const selection = useConfiguratorStore((state) => state.selection);
  const probeAt = useConfiguratorStore((state) => state.probeAt);

  return useMemo(() => {
    if (!selection || !probeAt) return { options: [], steps: undefined };
    return probeAt(cabinetDepthMmOf(design)).use((probe) => ({
      options: widthOptionsFor({
        design,
        columns,
        catalog,
        target: selection,
        probe,
      }),
      steps: widthStepsFor({
        design,
        columns,
        catalog,
        target: selection,
        probe,
      }),
    }));
  }, [design, columns, catalog, selection, probeAt]);
}
