"use client";

import type { Design } from "@lemnaria/configurator-domain";
import { finishSignature } from "@lemnaria/three-adapter";

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

/** **How many cabinets have chosen a colour of their own** — presence of the key and nothing about
 *  its value, which is exactly ADR 0099's own definition of an override (ADR 0078 decision 5).
 *
 *  Deliberately **not** `countCabinetsWearingAChosenFinish`: that query compares each finish against
 *  the design's resolved default and so answers zero for a kitchen whose cabinets all match the
 *  global colour — which is the right answer to the confirmation's question and the wrong one to
 *  *"did a global change grow the document a `finish` key"*. */
function countOverridingFinishes(design: Design): number {
  return design.placements.filter(
    (placement) => placement.body.finish !== undefined,
  ).length;
}

/** The readout itself, split from the gate above so that the gate can return before a single hook
 *  runs — a conditional `return null` after `useConfiguratorStore` would be a hook-order violation,
 *  and eliminating the subscription is half the point of the flag. */
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
      // The refusal's stable **code**, never its localized sentence: the sentence is §9's
      // banner copy and is asserted where it renders, in the panel.
      data-rejection={lastRejection?.code ?? ""}
      // Wave 6E's whole-kitchen container, and the timestamp a successful command moves. Both are
      // document fields nothing renders — the 2E sheet shows a tier's *name*, and no surface shows
      // an `updatedAt` at all — so "cancel wrote nothing", "apply wrote only the group that changed"
      // and "applying an unchanged sheet did not bump the document" are unreadable from the page
      // without them. Empty means the design carries no such key, which is a real state (ADR 0053).
      data-material-tier={design.settings?.materialTierId ?? ""}
      data-hardware-tier={design.settings?.hardwareTierId ?? ""}
      // Wave 6K-b's third whole-kitchen setting, here for exactly the reason the two above it are:
      // the sheet shows *"700 mm"* as an option's label and the scene shows a deeper kitchen, but
      // nothing on the page shows the number the **document** carries — so "applying a depth wrote
      // it", "cancelling wrote nothing" and "applying an unchanged sheet wrote nothing" are all
      // unreadable without it. Empty means the design carries none, which a pre-6J-a document does.
      data-cabinet-depth={
        design.settings?.cabinetDepthMm === undefined
          ? ""
          : String(design.settings.cabinetDepthMm)
      }
      // ADR 0099's whole-kitchen colour, and the **count of cabinets overriding it**. Both are here
      // for the reason the three settings above are, and the second one more sharply: the owner's
      // own invariant is that a global colour change leaves every cabinet-level override untouched,
      // and *"untouched"* is a fact about the document that no surface renders — the scene paints a
      // colour, and a cabinet following the kitchen and a cabinet overriding it with the same colour
      // paint identically. A count is what tells them apart from outside.
      //
      // The signature is `three-adapter`'s own, so a palette entry and a free colour can never
      // collide in this readout; empty means the design names no global colour, which is what every
      // document written before ADR 0099 carries.
      data-global-finish={finishSignature(design.settings?.finish)}
      data-overriding-finishes={String(countOverridingFinishes(design))}
      data-updated-at={design.updatedAt}
      hidden
    />
  );
}
