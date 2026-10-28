// Availability for a suite that is not about availability: nothing switched off, so a design is priced as it was before
// an item could be. A suite that is about availability builds its own where it is used.
import type { CatalogueAvailability } from "@lemnaria/configurator-domain";

export const NOTHING_DISABLED: CatalogueAvailability = Object.freeze({
  revision: "0",
  disabled: [],
});
