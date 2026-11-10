// What the replacement sheet's confirmation says, read from the leaves themselves so no Romanian wording is written in a test:
// a "changed to {name}" line with its closing sentence, and without it.
import roMessages from "../../src/messages/ro.json";

export type ChangedLeaf =
  | "changedMaterial"
  | "changedHardware"
  | "changedColour"
  | "changedHandle";

/** The closing sentence every "changed to {name}" leaf carries, said once for all the lines of a confirmation. */
export const PRICE_SENTENCE =
  roMessages.replacementSheet.changedMaterial.split("{name}. ")[1] ?? "";

/** A change in its leaf's own words, the closing sentence included. */
export function full(leaf: ChangedLeaf, name: string): string {
  return roMessages.replacementSheet[leaf].replace("{name}", () => name);
}

/** The same change without the closing sentence, as every line but the last says it. */
export function stem(leaf: ChangedLeaf, name: string): string {
  return full(leaf, name).replace(` ${PRICE_SENTENCE}`, "");
}
