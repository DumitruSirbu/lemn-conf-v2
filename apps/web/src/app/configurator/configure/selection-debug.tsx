"use client";

import { useConfiguratorStore } from "@/store/configurator-store";
import { useSelectionMeta } from "@/panel/use-panel-view";

import { isSelectionDebugEnabled } from "./selection-debug-availability";

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
 *
 * **Off unless the build opted in** (finding WEB-004). Without the flag this returns `null`, so
 * nothing renders and none of the readout's hooks or store subscriptions run. The unreachable code
 * is still in the client chunk — Next does not fold the comparison when the variable is absent at
 * build time (finding S7-F3) — which costs bytes and publishes nothing. See
 * `selection-debug-availability.ts` for that in full, and for why development is not an exemption.
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

/** The readout itself, split from the gate above so that the gate can return before a single hook
 *  runs — a conditional `return null` after `useConfiguratorStore` would be a hook-order violation,
 *  and eliminating the subscription is half the point of the flag. */
function SelectionDebugReadout() {
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
