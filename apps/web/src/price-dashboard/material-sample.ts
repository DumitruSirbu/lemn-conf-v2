import type { ItemUsageCounts } from "@lemnaria/configurator-domain";

// Invented counts of the saved kitchens that use each material of the sample book, for a build with no usage reader.
// Read by `readMaterials` on the server outside a production build only, and handed to the page as data: no browser
// module imports this file, and a production page is never given a count.

export const SAMPLE_MATERIAL_USAGE: ItemUsageCounts = [
  { item: { kind: "material", tierId: "material.melamine" }, designCount: 31 },
  {
    item: { kind: "material", tierId: "material.painted-mdf" },
    designCount: 23,
  },
  { item: { kind: "material", tierId: "material.veneer" }, designCount: 0 },
];
