import {
  HandleSchema,
  MATERIALS,
  finishItems,
  listAccessoryIds,
  paletteEntriesOf,
  tierItems,
  type ItemRef,
} from "@lemnaria/configurator-domain";

import { ANCHORED_BOOK } from "./price-dashboard-world";

// The items the availability route is asked about: what the world's book states, what it states nowhere, and the groups a
// customer must always have one active option of.

const HANDLES: readonly ItemRef[] = HandleSchema.options.map((handle) => ({
  kind: "handle",
  handle,
}));

/** Every item the world's book states and the catalogue can switch: tiers, handles, palette colours and accessories. */
export const STATED_ITEMS: readonly ItemRef[] = [
  ...tierItems(ANCHORED_BOOK.material, "material"),
  ...tierItems(ANCHORED_BOOK.hardware, "hardware"),
  ...HANDLES,
  ...MATERIALS.flatMap((material) => finishItems(paletteEntriesOf(material))),
  ...listAccessoryIds(ANCHORED_BOOK).map(
    (accessoryId): ItemRef => ({ kind: "accessory", accessoryId }),
  ),
];

/** Items shaped right and stated nowhere. */
export const UNSTATED_ITEMS: readonly ItemRef[] = [
  { kind: "material", tierId: "material.unheard-of" },
  { kind: "hardware", tierId: "hardware.unheard-of" },
  { kind: "finish", finishId: "unheard-of" },
  { kind: "accessory", accessoryId: "accessory.unheard-of" },
];

/** The groups the customer must always have one active option of. */
export const SWITCHABLE_GROUPS: readonly (readonly ItemRef[])[] = [
  tierItems(ANCHORED_BOOK.material, "material"),
  tierItems(ANCHORED_BOOK.hardware, "hardware"),
  HANDLES,
  ...MATERIALS.map((material) =>
    finishItems(paletteEntriesOf(material)),
  ).filter((palette) => palette.length > 0),
];
