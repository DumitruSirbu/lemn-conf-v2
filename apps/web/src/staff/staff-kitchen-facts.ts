import { kitchenSummaryOf, type Design } from "@lemnaria/configurator-domain";

import {
  formatRelativeAge,
  relativeAgeOf,
} from "@/account/kitchens/relative-age";
import type { StaffKitchenCopy, StaffKitchensCopy } from "@/i18n/content";
import type { AppLocale } from "@/i18n/routing";

import { isolated } from "./bidi-isolate";
import { dayOf } from "./staff-kitchen-dates";
import type { StaffKitchenWire } from "./staff-kitchens-wire-contract";

// What the kitchen page says about the kitchen in a line: which copy of it is on screen, what it is called, and the sentence
// under its name. Pure: the page hands in the words it has resolved.

/** The copy of the kitchen on screen: the one the shop was sent when there is one, else the document as it stands now. */
export interface ShownDesign {
  readonly design: Design;
  readonly source: "as-sent" | "current";
}

export function shownDesignOf(
  kitchen: StaffKitchenWire["kitchen"],
): ShownDesign | undefined {
  if (kitchen.asSent !== null) {
    return { design: kitchen.asSent, source: "as-sent" };
  }
  return kitchen.design === null
    ? undefined
    : { design: kitchen.design, source: "current" };
}

/** The day it was sent, or nothing for a kitchen that was not. */
export function sentAtOf(kitchen: StaffKitchenWire["kitchen"]): string | null {
  return kitchen.isSent ? kitchen.sentAt : null;
}

/** The client's name for it, else the one its facts generate, else a plain word. */
export function titleOf(
  kitchen: StaffKitchenWire["kitchen"],
  shown: ShownDesign | undefined,
  lists: StaffKitchensCopy,
): string {
  if (kitchen.name !== null && kitchen.name.trim() !== "") return kitchen.name;
  if (shown === undefined) return lists.unnamedKitchen;
  return lists.kitchenName(kitchenSummaryOf(shown.design));
}

export interface SubLineInput {
  readonly copy: StaffKitchenCopy;
  readonly wire: StaffKitchenWire;
  readonly locale: AppLocale;
  /** When the page read the kitchen: the moment "changed 2 days ago" is told against. */
  readonly readAtMs: number;
}

/** The line under the name: who sent it and the day, or whose draft it is and when it was last changed. The sender's
 *  address is typed by the client, so it stands between isolate marks. */
export function subLineOf({
  copy,
  wire,
  locale,
  readAtMs,
}: SubLineInput): string {
  const { kitchen, client } = wire;
  const sentAt = sentAtOf(kitchen);
  if (sentAt !== null) {
    const date = dayOf(sentAt, locale);
    return client === null
      ? copy.sub.sentNoAccount(date)
      : copy.sub.sent({ email: isolated(client.email), date });
  }
  const when = formatRelativeAge(
    locale,
    relativeAgeOf(Date.parse(kitchen.updatedAt), readAtMs),
  );
  return client === null
    ? copy.sub.draftNoAccount(when)
    : copy.sub.draft({ email: isolated(client.email), when });
}
