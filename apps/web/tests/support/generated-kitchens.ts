// Generated kitchens, priced and projected the way the store hands them to a surface.
import {
  buildKitchenLBodyCatalog,
  cabinetDepthMmOf,
  generateKitchen,
  priceDesign,
  projectDesignForDisplay,
  SAMPLE_PRICE_BOOK,
  SAMPLE_PRICE_BOOK_VERSION,
  type Design,
  type DesignRoom,
  type DisplayGroup,
  type PricingResult,
} from "@lemnaria/configurator-domain";

import { createFakeProbeFactory } from "./fake-body-probe";
import { MEASURED_DEEPENING_ROWS } from "./deepening-rows";
import { NOTHING_DISABLED } from "./availability";

const GENERATED_AT = "2026-10-07T09:00:00.000Z";

export interface PricedKitchen {
  readonly design: Design;
  readonly pricing: PricingResult;
  readonly groups: readonly DisplayGroup[];
}

export type GeneratedKitchen =
  | { readonly kind: "composed"; readonly kitchen: PricedKitchen }
  | { readonly kind: "refused" };

export function generatePricedKitchen(room: DesignRoom): GeneratedKitchen {
  const result = generateKitchen({
    room,
    occurredAt: GENERATED_AT,
    probeAt: createFakeProbeFactory(),
  });
  if (!result.ok) return { kind: "refused" };
  return { kind: "composed", kitchen: priceAndProject(result.design) };
}

export function priceAndProject(design: Design): PricedKitchen {
  const catalog = buildKitchenLBodyCatalog(cabinetDepthMmOf(design));
  return {
    design,
    pricing: priceDesign({
      deepeningRows: MEASURED_DEEPENING_ROWS,
      availability: NOTHING_DISABLED,
      design,
      catalog,
      book: SAMPLE_PRICE_BOOK,
      pricingVersion: SAMPLE_PRICE_BOOK_VERSION,
      selections: design.settings,
    }),
    groups: projectDesignForDisplay(design, catalog),
  };
}
