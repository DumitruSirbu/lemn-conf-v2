// One press of "Aplică" run through the preflight alone: the request as the replacement sheet builds it, over a design, with a
// probe attached and a fixed clock, and the builders for a colour or a handle replacement.
import {
  buildKitchenLBodyCatalog,
  type Design,
  type Finish,
  type Handle,
} from "@lemnaria/configurator-domain";

import {
  preflightWholeKitchenSettings,
  type AppearanceReplacement,
  type WholeKitchenSettingsRequest,
} from "@/store/whole-kitchen-apply";

import { OCCURRED_AT } from "./replacement-kitchens";
import { createFakeProbeFactory } from "./fake-body-probe";

/** The tiers a press may offer: every material the code declares and the book's standard hardware. */
export const OFFERED_TIERS = {
  availableMaterialTierIds: [
    "material.melamine",
    "material.veneer",
    "material.painted-mdf",
  ],
  availableHardwareTierIds: ["hardware.standard"],
} as const;

export function preflight(
  request: Partial<WholeKitchenSettingsRequest>,
  design: Design,
) {
  return preflightWholeKitchenSettings(
    { ...OFFERED_TIERS, ...request },
    {
      design,
      catalogAt: buildKitchenLBodyCatalog,
      probeAt: createFakeProbeFactory(),
      occurredAt: OCCURRED_AT,
    },
  );
}

/** The design a press that is ready to commit would store. */
export function ready(outcome: ReturnType<typeof preflight>): Design {
  if (outcome.outcome !== "ready") {
    throw new Error(`expected ready, got ${outcome.outcome}`);
  }
  return outcome.result.design;
}

export const finishReplacement = (
  from: Finish,
  to: Finish,
): AppearanceReplacement => ({ kind: "finish", from, to });

export const handleReplacement = (
  from: Handle,
  to: Handle,
): AppearanceReplacement => ({ kind: "handle", from, to });
