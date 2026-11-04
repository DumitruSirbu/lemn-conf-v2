// Availability for a suite that is not about availability: nothing switched off, so the design is priced as it was
// before an item could be. A suite that is about availability builds its own where it is used.
import type { CatalogueAvailability } from "../../src/pricing/catalogue-availability.js";

export const NOTHING_DISABLED: CatalogueAvailability = {
  revision: "0",
  disabled: [],
};
