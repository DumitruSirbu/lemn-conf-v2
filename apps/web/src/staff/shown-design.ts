import type {
  Design,
  KitchenViewed3dVersion,
} from "@lemnaria/configurator-domain";

/** The two copies of a kitchen a staff reader holds: the document as it stands, and the one the shop was sent. `null`
 *  is a copy this build cannot read or that does not exist. */
export interface KitchenCopies {
  readonly design: Design | null;
  readonly asSent: Design | null;
}

/** The copy of the kitchen on screen: the one the shop was sent when there is one, else the document as it stands now. */
export interface ShownDesign {
  readonly design: Design;
  readonly source: "as-sent" | "current";
}

/** `version` is the copy the person chose: "current" shows the document as it stands when it can be read, and anything
 *  else is the rule above. Nothing when neither copy is readable. */
export function shownDesignOf(
  kitchen: KitchenCopies,
  version: KitchenViewed3dVersion = "sent",
): ShownDesign | undefined {
  if (version === "current" && kitchen.design !== null) {
    return { design: kitchen.design, source: "current" };
  }
  if (kitchen.asSent !== null) {
    return { design: kitchen.asSent, source: "as-sent" };
  }
  return kitchen.design === null
    ? undefined
    : { design: kitchen.design, source: "current" };
}
