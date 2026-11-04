import type { ItemRef } from "@lemnaria/configurator-domain";

import { accessoryOf, type ReadyAccessories } from "./accessory-model";

/** Renders a row's words: the catalogue leaf `key` names, else `authored`. */
type BookTextOf = (authored: string, key: string | undefined) => string;

/**
 * An item's name as the dialogs say it. They act on the live book, so an accessory the active version holds is named by
 * its published name, never by a draft rename customers do not see yet; one only the draft knows is named by the draft.
 * An item of another kind, or one the derivation does not hold, has no name here.
 */
export function accessoryNameOf(
  derivation: ReadyAccessories,
  bookText: BookTextOf,
  item: ItemRef,
): string {
  const held =
    item.kind === "accessory"
      ? accessoryOf(derivation, item.accessoryId)
      : undefined;
  if (held === undefined) return "";
  return bookText(held.activeName ?? held.name.authored, held.name.key);
}
