import {
  DEFAULT_HANDLE,
  TOP_ROW_HANDLE,
  paletteFinish,
} from "@lemnaria/configurator-domain";

import type { KitchenDefaultsPageInput } from "./kitchen-defaults-model";
import type { KitchenDefaultsWire } from "./price-dashboard-wire-contract";

// Invented facts for the defaults screen while nothing supplies the real ones. The tiers are the sample book's by name,
// written here rather than imported from it: a screen importing the sample book would make a second module name a book. It
// is read by `readKitchenDefaults` on the server outside a production build, and by no browser module: the in-memory client
// is seeded with the facts the page was given and imports none of this. It goes with that stub.

const FIRST_REVISION = "1";

const SAMPLE_DEFAULTS: KitchenDefaultsWire = {
  materialTierId: "material.melamine",
  hardwareTierId: "hardware.standard",
  cabinetDepthMm: 600,
  finish: paletteFinish("pal.alb"),
  handle: DEFAULT_HANDLE,
  topRowHandle: TOP_ROW_HANDLE,
};

export const SAMPLE_KITCHEN_DEFAULTS: KitchenDefaultsPageInput = {
  state: {
    revision: FIRST_REVISION,
    availabilityRevision: FIRST_REVISION,
    saved: false,
    defaults: SAMPLE_DEFAULTS,
  },
  materials: [
    {
      tierId: "material.melamine",
      name: "PAL melaminat",
      nameKey: "priceBook.material.melamine.name",
    },
    {
      tierId: "material.painted-mdf",
      name: "MDF vopsit mat",
      nameKey: "priceBook.material.painted-mdf.name",
    },
    {
      tierId: "material.veneer",
      name: "Furnir natural",
      nameKey: "priceBook.material.veneer.name",
    },
  ],
  hardware: [
    {
      tierId: "hardware.standard",
      name: "Standard",
      nameKey: "priceBook.hardware.standard.name",
    },
    { tierId: "hardware.soft-close", name: "Hettich" },
    { tierId: "hardware.premium", name: "Blum" },
  ],
  disabled: [],
};

// The in-memory client is re-exported for the tests that build a screen and its client from the same place.
export { inMemoryKitchenDefaultsClient } from "./kitchen-defaults-stand-in-client";
