import type { ItemRef } from "@lemnaria/configurator-domain";

import { hardwareClassOf, type ReadyHardware } from "./hardware-model";

/** Renders a row's words: the catalogue leaf `key` names, else `authored`. */
type BookTextOf = (authored: string, key: string | undefined) => string;

/**
 * An item's name as the dialogs say it. They act on the live book, so a class the active version holds is named by its
 * published name, never by a draft rename customers do not see yet; a class only the draft knows is named by the draft.
 * An item of another kind, or one the derivation does not hold, has no name here.
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
  if (held === undefined) return "";
  return bookText(held.activeName ?? held.name.authored, held.name.key);
}
