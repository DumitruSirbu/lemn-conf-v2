"use client";

import type { Design } from "@lemnaria/configurator-domain";
import { finishSignature } from "@lemnaria/three-adapter";

import { useSceneMeasurement } from "@/scene/scene-measurement-store";
import { useConfiguratorStore } from "@/store/configurator-store";
import { useSelectionMeta } from "@/panel/use-panel-view";

import { isSelectionDebugEnabled } from "./selection-debug-availability";

/**
 * Test-only observability hook: not customer-facing, `hidden`, rendered by `ConfigureScreen`. The e2e suite must read
 * the selection (inside the WebGL canvas) and §8's `meta` numbers (panel inputs, not rendered copy), so no assertion
 * about a 700 x 2600 merged opening can be re-pointed at visible text without weakening it. This is the only such
 * mechanism: extend this span rather than adding a readout. Every value is a string (it arrives via `dataset`);
 * empty means "nothing selected". `useSelectionMeta` is the projection §9's panel reads.
 *
 * Off unless the build opted in (finding WEB-004): without the flag this returns `null`, so no hooks or subscriptions
 * run. The unreachable code stays in the client chunk (see `selection-debug-availability.ts`).
 */
export function SelectionDebug() {
  if (
    !isSelectionDebugEnabled(
      process.env.NEXT_PUBLIC_LEMNARIA_ENABLE_SELECTION_DEBUG,
    )
  )
    return null;
  return <SelectionDebugReadout />;
}

/** How many cabinets have chosen a colour of their own: presence of the `finish` key, nothing about its value
 *  (absence stays absent, ADR 0078 decision 5). Not `countCabinetsWearingAChosenFinish`, which compares against
 *  the resolved default and so answers zero for a kitchen whose cabinets all match the global colour: the wrong
 *  answer to "did a global change grow the document a `finish` key". */
function countOverridingFinishes(design: Design): number {
  return design.placements.filter(
    (placement) => placement.body.finish !== undefined,
  ).length;
}

/** The readout, split from the gate so the gate returns before any hook runs: a conditional `return null`
 *  after `useConfiguratorStore` would break hook order, and eliminating the subscription is half the point of
 *  the flag. */
function SelectionDebugReadout() {
  const selection = useConfiguratorStore((state) => state.selection);
  const meta = useSelectionMeta();
  const design = useConfiguratorStore((state) => state.design);
  const saveStatus = useConfiguratorStore((state) => state.saveStatus);
  const designId = useConfiguratorStore((state) => state.designId);
  const isBodyProbeAttached = useConfiguratorStore(
    (state) => state.isBodyProbeAttached,
  );
  const lastRejection = useConfiguratorStore((state) => state.lastRejection);
  const measurement = useSceneMeasurement((state) => state.measurement);

  return (
    <span
      data-testid="selection-debug"
      data-selection-kind={selection?.kind ?? ""}
      data-selection-id={selection?.id ?? ""}
      data-meta-kind={meta?.kind ?? ""}
      data-open-w-mm={meta ? String(meta.openWmm) : ""}
      data-open-h-mm={meta ? String(meta.openHmm) : ""}
      data-span-h-mm={meta ? String(meta.spanHmm) : ""}
      data-save-status={saveStatus}
      data-design-id={designId ?? ""}
      data-probe={isBodyProbeAttached ? "on" : "off"}
      // The refusal's stable code, never its localized sentence, which is asserted where it renders (the panel).
      data-rejection={lastRejection?.code ?? ""}
      // The whole-kitchen container and the timestamp a successful command moves: document fields nothing
      // renders, so "cancel wrote nothing", "apply wrote only the group that changed" and "an unchanged sheet did
      // not bump the document" are unreadable without them. Empty means the design carries no such key.
      data-material-tier={design.settings?.materialTierId ?? ""}
      data-hardware-tier={design.settings?.hardwareTierId ?? ""}
      // The cabinet-depth setting, here for the same reason: the sheet shows *"700 mm"* as a label but nothing
      // shows the number the document carries. Empty means the design carries none.
      data-cabinet-depth={
        design.settings?.cabinetDepthMm === undefined
          ? ""
          : String(design.settings.cabinetDepthMm)
      }
      // ADR 0099's whole-kitchen colour and the count of cabinets overriding it. The invariant is that a global
      // colour change leaves every cabinet-level override untouched, a fact about the document no surface renders
      // (a following cabinet and an overriding one paint identically); a count tells them apart. The signature is
      // `three-adapter`'s own, so a palette entry and a free colour cannot collide; empty means the design names
      // no global colour.
      data-global-finish={finishSignature(design.settings?.finish)}
      data-overriding-finishes={String(countOverridingFinishes(design))}
      data-updated-at={design.updatedAt}
      // Observations of the running scene (§11 row 21 in a browser), unreadable from outside the canvas and not
      // to be read off screenshot pixels: the camera's two matrices once the ease has landed, and every mounted
      // body's world bounds. Conclusions (which bodies are the ceiling row, where the 2.20-2.60 band is, the
      // tap-target cost) stay in the spec, so no assertion is checked against the function that produced it
      // (`scene-measurement-store.ts`). `data-scene-settle-count` is a counter, not a flag: the scene is already
      // settled when a preset button is tapped, so a boolean would let a spec accept the frame before the move.
      data-scene-settle-count={
        measurement ? String(measurement.settleCount) : ""
      }
      data-scene-camera={
        measurement
          ? JSON.stringify({
              projection: measurement.projection,
              view: measurement.view,
            })
          : ""
      }
      data-scene-bodies={measurement ? JSON.stringify(measurement.bodies) : ""}
      hidden
    />
  );
}
