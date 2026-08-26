"use client";

import { useConfiguratorStore } from "@/store/configurator-store";
import { useSelectionMeta } from "@/panel/use-panel-view";

/**
 * Test-only observability hook. Not customer-facing, `hidden`, and rendered by `ConfigureScreen`.
 *
 * It exists because the two things the e2e suite has to read are both unreadable from outside:
 * the **selection** lives inside the WebGL canvas, which Playwright cannot query, and §8's `meta`
 * numbers — an opening's width and height, and the free span it belongs to — are inputs to the
 * panel rather than copy it renders. §9's header line carries the *body's* carcass size, so no
 * assertion about a 700 × 2600 merged opening or a 1850 mm opening can be re-pointed at visible
 * text without being weakened into a different claim.
 *
 * This is the **only** such mechanism. M3's `TemporaryDevControls` published the same fields from a
 * second readout of its own and M4 deleted it; extending this one span is what keeps that from
 * happening again. Every value is a string, because it arrives at the test through `dataset`, and
 * empty means "nothing selected".
 *
 * Nothing here decides anything: `useSelectionMeta` is the same projection §9's panel reads, so a
 * test asserting on these numbers is asserting on the numbers the panel was given.
 */
export function SelectionDebug() {
  const selection = useConfiguratorStore((state) => state.selection);
  const meta = useSelectionMeta();
  const saveStatus = useConfiguratorStore((state) => state.saveStatus);
  const designId = useConfiguratorStore((state) => state.designId);
  const isBodyProbeAttached = useConfiguratorStore(
    (state) => state.isBodyProbeAttached,
  );
  const lastRejection = useConfiguratorStore((state) => state.lastRejection);

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
      // The refusal's stable **code**, never its rendered Romanian sentence: the sentence is §9's
      // banner copy and is asserted where it renders, in the panel.
      data-rejection={lastRejection?.code ?? ""}
      hidden
    />
  );
}
