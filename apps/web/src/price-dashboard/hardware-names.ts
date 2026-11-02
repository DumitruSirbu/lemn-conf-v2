import type { ItemRef } from "@lemnaria/configurator-domain";

import { hardwareClassOf, type ReadyHardware } from "./hardware-model";

/** Renders a row's words: the catalogue leaf `key` names, else `authored`. */
type BookTextOf = (authored: string, key: string | undefined) => string;

/**
 * An item's name as a screen shows it. Only hardware classes are named here; an item of another kind, or one the
 * derivation does not hold, has no name on these screens.
 */
export function hardwareNameOf(
  derivation: ReadyHardware,
  bookText: BookTextOf,
  item: ItemRef,
): string {
  const held =
    item.kind === "hardware"
      ? hardwareClassOf(derivation, item.tierId)
      : undefined;
  return held === undefined ? "" : bookText(held.name.authored, held.name.key);
}
