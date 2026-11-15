import {
  countDisplayedBodies,
  type Design,
  type DisplayEntry,
  type DisplayGroup,
} from "@lemnaria/configurator-domain";

import type { Content } from "@/i18n/content";
import {
  describeBreakdownRows,
  describeGroupHeading,
  describeStoredLineAmount,
} from "@/price/price-breakdown-model";
import { priceFloorOf, type PriceBookRoot } from "@/price/price-book-root";
import {
  describeRowDetails,
  rowDetailOf,
  type ReviewRowDetail,
} from "@/review/review-model";

import {
  isSameBody,
  projectedGroupsOf,
  type KitchenVersion,
} from "./kitchen-version-rows";
import type { StaffSentCabinetLineWire } from "./staff-kitchens-wire-contract";

// The cabinet list of the staff kitchen page (ADR 0185 decisions 3 and 4) as a value: the groups and their order are
// `projectDesignForDisplay`'s, each row's name and facts are the review's own row detail, and a row's amount is the
// priced cabinet line of the copy on screen: the current copy's, priced with the active book, and the sent copy's, as
// stored with the request. Nothing here sorts a body, words a fact or prices a figure of its own, and nothing prices the
// sent copy: its amounts are the stored ones, and an amount is never drawn as zero.

/** How a body stands between the two copies. `added` is a body only the current copy holds; `removed` one only the sent
 *  copy holds. */
export type CabinetChange = "same" | "differs" | "added" | "removed";

export interface CabinetListRow {
  readonly placementId: string;
  readonly name: string;
  /** The review's facts after the name: the width, the body's own finish, the handle it wears. */
  readonly facts: readonly string[];
  readonly change: CabinetChange;
  /** The row's priced amount as the review words it. Absent, never zero, when the copy is not priced here. */
  readonly amountText?: string;
}

export interface CabinetListGroup {
  /** Unique among the list's groups, and the same group's in either copy. */
  readonly key: string;
  readonly heading: string;
  readonly rows: readonly CabinetListRow[];
}

export interface AvailableCabinetList {
  readonly kind: "available";
  readonly groups: readonly CabinetListGroup[];
  /** The bodies of the copy on screen: the removed rows of the other copy are not among them. */
  readonly bodyCount: number;
  /** Whether any row says that the two copies differ. */
  readonly holdsChanges: boolean;
}

/** A copy this build cannot list: the page says so instead of listing half of one. */
export interface UnavailableCabinetList {
  readonly kind: "unavailable";
}

export type CabinetList = AvailableCabinetList | UnavailableCabinetList;

export interface DescribeCabinetListInput {
  readonly shown: {
    readonly design: Design;
    readonly version: KitchenVersion;
  };
  /** The other copy, when the page holds both and they differ: the rows are marked against it. */
  readonly other: Design | undefined;
  readonly content: Content;
  readonly priceBook: PriceBookRoot;
  /** The cabinet lines stored with the sent request: read for the sent copy's rows only, never for the current copy's. */
  readonly sentLines: readonly StaffSentCabinetLineWire[];
}

const UNAVAILABLE: UnavailableCabinetList = { kind: "unavailable" };

/**
 * Nothing only when the copy on screen cannot be listed. A copy it cannot be compared with (the other copy cannot be
 * read, or its removed bodies cannot be placed) is listed alone, with no mark: a list needs its own copy and nothing
 * else.
 */
export function describeCabinetList(
  input: DescribeCabinetListInput,
): CabinetList {
  const { shown, content } = input;
  const shownGroups = projectedGroupsOf(shown.design);
  if (shownGroups === undefined) return UNAVAILABLE;
  const comparison = comparisonOf(input, shownGroups);
  const rows = rowsById([
    ...shownRows(input, shownGroups, comparison?.groups),
    ...removedRows(input, shownGroups, comparison?.groups),
  ]);
  const groups = (comparison?.orderingGroups ?? shownGroups).map((group) => ({
    key: groupKeyOf(group),
    heading: describeGroupHeading(group, content),
    rows: group.entries.map((entry) => requireRow(rows, entry.placementId)),
  }));
  return {
    kind: "available",
    groups,
    bodyCount: countDisplayedBodies(shownGroups),
    holdsChanges: [...rows.values()].some((row) => row.change !== "same"),
  };
}

/** The other copy's projection and the order of the copy on screen with its removed bodies added. */
interface Comparison {
  readonly groups: readonly DisplayGroup[];
  readonly orderingGroups: readonly DisplayGroup[];
}

/** Nothing when there is no other copy, or it cannot be read, or its removed bodies have no place to be ordered in. */
function comparisonOf(
  { shown, other }: DescribeCabinetListInput,
  shownGroups: readonly DisplayGroup[],
): Comparison | undefined {
  if (other === undefined) return undefined;
  const groups = projectedGroupsOf(other);
  if (groups === undefined) return undefined;
  const orderingGroups = orderingGroupsOf({ shown, other, shownGroups });
  return orderingGroups === undefined ? undefined : { groups, orderingGroups };
}

function shownRows(
  { shown, content, priceBook, sentLines }: DescribeCabinetListInput,
  shownGroups: readonly DisplayGroup[],
  otherGroups: readonly DisplayGroup[] | undefined,
): readonly CabinetListRow[] {
  const details = describeRowDetails(shownGroups, content);
  const amounts =
    shown.version === "sent"
      ? sentAmountTextsOf(sentLines)
      : currentAmountTextsOf({
          design: shown.design,
          shownGroups,
          content,
          priceBook,
        });
  const counterparts = entriesById(otherGroups);
  return entriesOf(shownGroups).map((entry) =>
    rowOf({
      entry,
      detail: rowDetailOf(details, entry.placementId),
      change: changeOf({ entry, counterparts, version: shown.version }),
      amountText: amounts?.get(entry.placementId),
    }),
  );
}

/** The current copy's list also carries the bodies the client took out, so staff see what the sent copy had. They have
 *  no amount: nothing prices them now. */
function removedRows(
  { shown, content }: DescribeCabinetListInput,
  shownGroups: readonly DisplayGroup[],
  otherGroups: readonly DisplayGroup[] | undefined,
): readonly CabinetListRow[] {
  if (otherGroups === undefined || shown.version !== "current") return [];
  const shownIds = new Set(
    entriesOf(shownGroups).map((entry) => entry.placementId),
  );
  const details = describeRowDetails(otherGroups, content);
  return entriesOf(otherGroups)
    .filter((entry) => !shownIds.has(entry.placementId))
    .map((entry) =>
      rowOf({
        entry,
        detail: rowDetailOf(details, entry.placementId),
        change: "removed",
        amountText: undefined,
      }),
    );
}

function rowOf({
  entry,
  detail,
  change,
  amountText,
}: {
  readonly entry: DisplayEntry;
  readonly detail: ReviewRowDetail;
  readonly change: CabinetChange;
  readonly amountText: string | undefined;
}): CabinetListRow {
  return {
    placementId: entry.placementId,
    name: detail.name,
    facts: detail.facts,
    change,
    ...(amountText === undefined ? {} : { amountText }),
  };
}

function changeOf({
  entry,
  counterparts,
  version,
}: {
  readonly entry: DisplayEntry;
  readonly counterparts: ReadonlyMap<string, DisplayEntry> | undefined;
  readonly version: KitchenVersion;
}): CabinetChange {
  if (counterparts === undefined) return "same";
  const counterpart = counterparts.get(entry.placementId);
  if (counterpart === undefined) {
    return version === "current" ? "added" : "removed";
  }
  return isSameBody(entry, counterpart) ? "same" : "differs";
}

/**
 * The sent copy's amounts: the stored line of each placement, at the ten lei a line is shown to, and never priced again.
 * A stored zero has no wording here (a customer-supplied or an included body cannot be told apart from it), so it is
 * left out, as is a placement with no stored line. A placement the lines name twice takes the later line.
 */
function sentAmountTextsOf(
  sentLines: readonly StaffSentCabinetLineWire[],
): ReadonlyMap<string, string> {
  const texts = new Map<string, string>();
  for (const { placementId, amountMinor } of sentLines) {
    if (amountMinor > 0) {
      texts.set(placementId, describeStoredLineAmount(amountMinor));
    } else {
      texts.delete(placementId);
    }
  }
  return texts;
}

/**
 * Each placement's amount as the review words it, from the one builder the review calls, so the two cannot print
 * different amounts for a body. The current copy is priced with the active book, and a copy the book refuses has no
 * amounts at all.
 */
function currentAmountTextsOf({
  design,
  shownGroups,
  content,
  priceBook,
}: {
  readonly design: Design;
  readonly shownGroups: readonly DisplayGroup[];
  readonly content: Content;
  readonly priceBook: PriceBookRoot;
}): ReadonlyMap<string, string> | undefined {
  const priced = priceFloorOf(priceBook, design);
  if (priced === undefined) return undefined;
  const { groups } = describeBreakdownRows({
    content,
    priced,
    groups: shownGroups,
  });
  return new Map(
    groups.flatMap((group) =>
      group.rows.map((row): [string, string] => [row.key, row.amountText]),
    ),
  );
}

/**
 * The groups, in the projection's own order. The bodies only the sent copy holds are not in the copy on screen's
 * projection, so the order is the projection of the copy on screen with those bodies added to its document: a body
 * takes the place the projection gives it, and a group only they stand in takes its place among the others. Nothing here
 * orders a body. A document whose catalogue cannot place them has no order to give.
 */
function orderingGroupsOf({
  shown,
  other,
  shownGroups,
}: {
  readonly shown: DescribeCabinetListInput["shown"];
  readonly other: Design;
  readonly shownGroups: readonly DisplayGroup[];
}): readonly DisplayGroup[] | undefined {
  if (shown.version !== "current") return shownGroups;
  const shownIds = new Set(
    shown.design.placements.map((placement) => placement.id),
  );
  const removedPlacements = other.placements.filter(
    (placement) => !shownIds.has(placement.id),
  );
  if (removedPlacements.length === 0) return shownGroups;
  const ordering = projectedGroupsOf({
    ...shown.design,
    placements: [...shown.design.placements, ...removedPlacements],
  });
  const isEveryBodyOrdered =
    ordering !== undefined &&
    countDisplayedBodies(ordering) ===
      countDisplayedBodies(shownGroups) + removedPlacements.length;
  return isEveryBodyOrdered ? ordering : undefined;
}

function rowsById(
  rows: readonly CabinetListRow[],
): ReadonlyMap<string, CabinetListRow> {
  return new Map(rows.map((row) => [row.placementId, row]));
}

function requireRow(
  rows: ReadonlyMap<string, CabinetListRow>,
  placementId: string,
): CabinetListRow {
  const row = rows.get(placementId);
  if (row === undefined) throw new MissingCabinetRowError(placementId);
  return row;
}

/** The ordering projection names a body no row was made for: the two projections disagree about the copies. */
export class MissingCabinetRowError extends Error {
  constructor(placementId: string) {
    super(`The cabinet list has no row for the placement "${placementId}"`);
    this.name = "MissingCabinetRowError";
  }
}

function groupKeyOf(entry: Pick<DisplayEntry, "wall" | "band">): string {
  return `${entry.wall}-${entry.band}`;
}

function entriesOf(groups: readonly DisplayGroup[]): readonly DisplayEntry[] {
  return groups.flatMap((group) => group.entries);
}

function entriesById(
  groups: readonly DisplayGroup[] | undefined,
): ReadonlyMap<string, DisplayEntry> | undefined {
  if (groups === undefined) return undefined;
  return new Map(entriesOf(groups).map((entry) => [entry.placementId, entry]));
}
