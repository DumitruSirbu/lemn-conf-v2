import type { ItemUsageCounts } from "@lemnaria/configurator-domain";

// Invented counts of the saved kitchens that use each class of the sample book, for a build with no usage reader. Read by
// `readHardware` on the server outside a production build only, and handed to the page as data: no browser module imports
// this file, and a production page is never given a count.

export const SAMPLE_HARDWARE_USAGE: ItemUsageCounts = [
  { item: { kind: "hardware", tierId: "hardware.standard" }, designCount: 9 },
  {
    item: { kind: "hardware", tierId: "hardware.soft-close" },
    designCount: 14,
  },
  { item: { kind: "hardware", tierId: "hardware.premium" }, designCount: 0 },
];
