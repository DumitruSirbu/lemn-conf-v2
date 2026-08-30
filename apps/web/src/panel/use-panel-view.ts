"use client";

// The store half of §9's panel: read the selection, project it, hand the result to a component.
//
// Three memoised steps, in the order §8 defines them — `describeSelection` produces `meta`, and
// `offersFor` produces the list `meta` alone cannot (it needs the frozen column map). Nothing here
// decides anything: `describePanel` owns every rule and this hook owns the subscription.
import {
  describeSelection,
  offersFor,
  columnWidthChoices,
  widthOptionsFor,
  type WidthRangeMm,
  type CatalogOffer,
  type SelectionMeta,
  type WidthOption,
} from "@lemnaria/configurator-domain";
import { useMemo } from "react";

import { useConfiguratorStore } from "@/store/configurator-store";

import { describePanel, type PanelView } from "./panel-model";
import { widthStepsFor, type WidthSteps } from "@lemnaria/configurator-domain";

export function usePanelView(): PanelView {
  const meta = useSelectionMeta();
  const offers = useSelectionOffers();
  const widthOptions = useSelectionWidthOptions();
  const widthRanges = useSelectionWidthRanges();
  const widthSteps = useSelectionWidthSteps();
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
        widthRanges,
        widthSteps,
        rejection,
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

/** The column's candidate widths, judged by the engine rather than by the panel: `widthOptionsFor`
 *  runs `setWidth` once per candidate width and reports what it answered. ADR 0035 decision 3's
 *  discrete control renders them; the stepper reads their shape to know it is the wrong control.
 *
 *  **Empty without a probe**, and that is the honest answer rather than a degraded one. A resize
 *  rebuilds through the real builders and re-checks the measurement, so with no probe attached
 *  every width would refuse `BODY_PROBE_UNAVAILABLE` — a section of controls greyed with a sentence
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

/** **What the column may be built within** — ADR 0035 decision 3's discriminator, read from the
 *  engine rather than inferred from the widths beside it.
 *
 *  The panel used to conclude "stepped" from two candidates 50 apart in `sizesMm`. That works, and
 *  it is the inference ADR 0022 and decision 3's own correction both record as the way this codebase
 *  gets it wrong — so `columnWidthChoices` publishes the ranges and this carries them across. Same
 *  memo keys as the widths, because it is the same question asked of the same state. */
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

/** ADR 0035 decision 1's two candidates, judged the same way and by the same command as the chips
 *  above. Separate hook rather than a field on the one above, because it is a separate question with
 *  a separate answer — see `width-steps.ts` for why the step candidates cannot be read out of the
 *  published set.
 *
 *  **`undefined` without a probe**, for the reason the chips are empty without one: every step would
 *  refuse `BODY_PROBE_UNAVAILABLE`, and a stepper greyed with a sentence about the 3D model is not
 *  what §9 asks for while the scene is still mounting. Memoised on the same five slices, so the two
 *  answers are always computed from one state. */
function useSelectionWidthSteps(): WidthSteps | undefined {
  const design = useConfiguratorStore((state) => state.design);
  const columns = useConfiguratorStore((state) => state.columns);
  const catalog = useConfiguratorStore((state) => state.catalog);
  const selection = useConfiguratorStore((state) => state.selection);
  const probe = useConfiguratorStore((state) => state.bodyProbe);

  return useMemo(
    () =>
      selection && probe
        ? widthStepsFor({ design, columns, catalog, target: selection, probe })
        : undefined,
    [design, columns, catalog, selection, probe],
  );
}
