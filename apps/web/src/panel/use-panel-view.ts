"use client";

// The store half of §9's panel: read the selection, project it, hand the result to a component.
//
// Three memoised steps, in the order §8 defines them — `describeSelection` produces `meta`, and
// `offersFor` produces the list `meta` alone cannot (it needs the frozen column map). Nothing here
// decides anything: `describePanel` owns every rule and this hook owns the subscription.
import {
  cabinetDepthMmOf,
  describeSelection,
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

import { describePanel, type PanelView } from "./panel-model";
import { widthStepsFor, type WidthSteps } from "@lemnaria/configurator-domain";

export function usePanelView(): PanelView {
  const meta = useSelectionMeta();
  const offers = useSelectionOffers();
  const widthAnswers = useSelectionWidthAnswers();
  const widthOptions = widthAnswers.options;
  const widthRanges = useSelectionWidthRanges();
  const widthSteps = widthAnswers.steps;
  const material = useSelectionMaterial();
  const rejection = useConfiguratorStore((state) => state.lastRejection);
  // §9 item 7's footer price. Derived from the current design by the one hook both price surfaces
  // read, so the footer and the bar cannot show different numbers for one kitchen.
  const pricing = usePricedDesign();
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
        widthRanges,
        widthSteps,
        rejection,
        material,
        pricing,
        isBodyProbeAttached,
        canWrite,
        saveStatus,
      }),
    [
      meta,
      offers,
      widthOptions,
      widthRanges,
      widthSteps,
      rejection,
      material,
      pricing,
      isBodyProbeAttached,
      canWrite,
      saveStatus,
    ],
  );
}

/** **Which colour control §9's Finisaj section gets** (ADR 0071 decision 3): the shape is the
 *  design's material's own, so this is read off the held design and never off the selected body.
 *
 *  Memoised over the design rather than resolved inside the selector: a declared lookup is a fresh
 *  object every call, and returning one from a store selector re-renders the panel on every store
 *  change whether or not the material moved. */
function useSelectionMaterial(): MaterialLookup {
  const design = useConfiguratorStore((state) => state.design);

  return useMemo(() => materialOfDesign(design), [design]);
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
  // **The map `insertBody` itself is handed** — the recorded face since backlog 52. §11 row 6's rule
  // is that the offer list and the command are one evaluation read from two ends, so the list must
  // measure against the same map. The *openings* are still the published ones: `voids` is derived
  // from the capped map, so nothing past the end of a wall is offered (ADR 0069).
  const columns = useConfiguratorStore((state) => state.recordedColumns);
  const catalog = useConfiguratorStore((state) => state.catalog);
  const selection = useConfiguratorStore((state) => state.selection);
  // Off the held design, not off the catalogue: the store's catalogue is built at this same depth
  // (wave 6K-a), but a map cannot be asked what depth it was built at, and the offer list must run
  // the evaluation the command would run on **this** document.
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

/** **What the column may be built within** — ADR 0035 decision 3's discriminator, read from the
 *  engine rather than inferred from the widths beside it.
 *
 *  The panel used to conclude "stepped" from two candidates 50 apart in `sizesMm`. That works, and
 *  it is the inference ADR 0022 and decision 3's own correction both record as the way this codebase
 *  gets it wrong — so `columnWidthChoices` publishes the ranges and this carries them across.
 *
 *  **No probe, so its own hook.** Unlike the two answers below it asks the catalogue rather than
 *  running a command, which is why ADR 0076 decision 4 merged those two and left this one alone.
 */
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

/** **The width chips and the stepper, answered together from one borrowed probe.**
 *
 *  Both answers run the real resize command once per candidate — `widthOptionsFor` to say "would
 *  this succeed", `widthStepsFor` for ADR 0035 decision 1's two candidates — so both need a probe,
 *  and they were two hooks taking two leases. On the render path that is **two transient kits for
 *  one frame** during the window a depth change opens, which is why ADR 0076 decision 4 merges them:
 *  one memo, one lease, both answers. It also makes literally true what the steps hook's own comment
 *  already claimed — that the two are always computed from one state.
 *
 *  **Empty and `undefined` without a probe**, which is the honest answer rather than a degraded one.
 *  Every width would refuse `BODY_PROBE_UNAVAILABLE`, and §9 asks for no section at all until there
 *  is something to say; the replace list carries the "model is preparing" message meanwhile.
 *
 *  Memoised on the five slices that can change an answer. The lease is taken inside the memo body
 *  and released before it returns — nothing crosses a React commit (ADR 0076 decision 1). */
function useSelectionWidthAnswers(): {
  options: WidthOption[];
  steps: WidthSteps | undefined;
} {
  const design = useConfiguratorStore((state) => state.design);
  // The map `setWidth` is handed, for the reason `useSelectionOffers` gives: both answers here run
  // the real resize command, and a chip answered against a different map than the tap would run is
  // §9's "never offer what cannot be satisfied" read against the wrong evidence.
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
