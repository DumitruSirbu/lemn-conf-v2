import { kitchenSummaryOf, type Design } from "@lemnaria/configurator-domain";

import { formatRelativeAge } from "@/account/kitchens/relative-age";
import type {
  StaffChangesCopy,
  StaffKitchenCopy,
  StaffKitchensCopy,
} from "@/i18n/content";
import type { AppLocale } from "@/i18n/routing";

import { isolated } from "./bidi-isolate";
import { dayOf, shopRelativeAgeOf } from "./staff-kitchen-dates";
import type { KitchenVersions } from "./kitchen-version-rows";
import type { ShownDesign } from "./shown-design";
import type { StaffKitchenWire } from "./staff-kitchens-wire-contract";

// What the kitchen page says about the kitchen in a line: which copy of it is on screen, what it is called, and the sentence
// under its name. Pure: the page hands in the words it has resolved.

/** The two copies the version switch chooses between: the kitchen as the shop was sent it and as it stands now. Nothing
 *  when this build cannot read one of them, or when they are the same kitchen, where a switch would choose nothing. */
export function versionsOf(
  kitchen: Pick<StaffKitchenWire["kitchen"], "asSent" | "design">,
): KitchenVersions | undefined {
  if (kitchen.asSent === null || kitchen.design === null) return undefined;
  const versions = { sent: kitchen.asSent, current: kitchen.design };
  return isSameKitchen(versions) ? undefined : versions;
}

/** What a kitchen is made of, by the facts a thumbnail draws: the stored timestamps and preset move without the kitchen
 *  changing, so they are not compared. Both copies are parsed by the one schema, so equal facts stringify alike. */
function isSameKitchen({ sent, current }: KitchenVersions): boolean {
  return madeOf(sent) === madeOf(current);
}

function madeOf(design: Design): string {
  const { room, placements, emptyColumns, columnExtents, settings } = design;
  return JSON.stringify({
    room,
    placements,
    emptyColumns,
    columnExtents,
    settings,
  });
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
  const when = whenModifiedOf({ kitchen, locale, readAtMs });
  return client === null
    ? copy.sub.draftNoAccount(when)
    : copy.sub.draft({ email: isolated(client.email), when });
}

export interface ModifiedSubLineInput {
  readonly changes: StaffChangesCopy;
  readonly wire: StaffKitchenWire;
  readonly locale: AppLocale;
  readonly readAtMs: number;
}

/** The line under the name of a sent kitchen the client changed after staff saw it: the same facts as `subLineOf`'s,
 *  and when it was modified. Only a sent kitchen has one: a draft is never marked as changed. */
export function modifiedSubLineOf({
  changes,
  wire,
  locale,
  readAtMs,
}: ModifiedSubLineInput): string | undefined {
  const { kitchen, client } = wire;
  const sentAt = sentAtOf(kitchen);
  if (sentAt === null) return undefined;
  const date = dayOf(sentAt, locale);
  const when = whenModifiedOf({ kitchen, locale, readAtMs });
  return client === null
    ? changes.sub.sentNoAccountModified({ date, when })
    : changes.sub.sentModified({ email: isolated(client.email), date, when });
}

function whenModifiedOf({
  kitchen,
  locale,
  readAtMs,
}: {
  readonly kitchen: StaffKitchenWire["kitchen"];
  readonly locale: AppLocale;
  readonly readAtMs: number;
}): string {
  return formatRelativeAge(
    locale,
    shopRelativeAgeOf(Date.parse(kitchen.updatedAt), readAtMs),
  );
}
