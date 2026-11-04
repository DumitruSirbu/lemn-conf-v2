import type { ItemUsageCounts } from "@lemnaria/configurator-domain";

// Invented counts of the saved kitchens that use each built-in accessory of the sample book, for a build with no usage
// reader. Read by `readAccessories` on the server outside a production build only, and handed to the page as data: no
// browser module imports this file, and a production page is never given a count.

export const SAMPLE_ACCESSORY_USAGE: ItemUsageCounts = [
  {
    item: { kind: "accessory", accessoryId: "sinkProtectiveCover" },
    designCount: 12,
  },
  {
    item: { kind: "accessory", accessoryId: "dishDryingRack" },
    designCount: 31,
  },
];
