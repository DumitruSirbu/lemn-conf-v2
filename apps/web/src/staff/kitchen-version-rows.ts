import {
  UnknownBodyError,
  projectDesignForDisplay,
  type Design,
  type DisplayEntry,
} from "@lemnaria/configurator-domain";

import type { Content } from "@/i18n/content";
import { buildCatalogAtDepthOf } from "@/price/price-book-root";

// The cabinet list of the kitchen page's version switch (frame D10B): every body of both versions, matched by the
// placement's id, with the ones that differ marked and no account of how. A body only the sent copy holds is the one the
// client took out; a body only the current copy holds is the one the client added.

export type KitchenVersion = "sent" | "current";

/** How a body stands between the two copies, as the current version tells it. */
export type VersionRowChange = "same" | "differs" | "added" | "removed";

export interface VersionRow {
  readonly placementId: string;
  readonly name: string;
  /** Width and height in millimetres, without the unit: the unit is the copy's. */
  readonly size: string;
  readonly change: VersionRowChange;
}

export interface KitchenVersions {
  readonly sent: Design;
  readonly current: Design;
}

const SIZE_JOINER = " × ";

/**
 * The rows of the version on screen, then the bodies only the other version holds. Nothing when either copy cannot be
 * listed: a body the catalogue no longer holds, or a depth it cannot build, is a copy the page cannot read, and it says
 * so instead of listing half of one.
 */
export function versionRowsOf({
  versions,
  shown,
  content,
}: {
  readonly versions: KitchenVersions;
  readonly shown: KitchenVersion;
  readonly content: Content;
}): readonly VersionRow[] | undefined {
  const sent = entriesOf(versions.sent);
  const current = entriesOf(versions.current);
  if (sent === undefined || current === undefined) return undefined;
  const [onScreen, other] =
    shown === "sent" ? [sent, current] : [current, sent];
  const otherById = new Map(other.map((entry) => [entry.placementId, entry]));
  const onScreenIds = new Set(onScreen.map((entry) => entry.placementId));
  const rowOf = (entry: DisplayEntry, change: VersionRowChange): VersionRow =>
    versionRowOf({ entry, change, content });
  const matched = onScreen.map((entry) => {
    const counterpart = otherById.get(entry.placementId);
    if (counterpart === undefined) {
      return rowOf(entry, shown === "sent" ? "removed" : "added");
    }
    return rowOf(entry, isSameBody(entry, counterpart) ? "same" : "differs");
  });
  const onlyInOther = other
    .filter((entry) => !onScreenIds.has(entry.placementId))
    .map((entry) => rowOf(entry, shown === "sent" ? "added" : "removed"));
  return [...matched, ...onlyInOther];
}

function versionRowOf({
  entry,
  change,
  content,
}: {
  readonly entry: DisplayEntry;
  readonly change: VersionRowChange;
  readonly content: Content;
}): VersionRow {
  return {
    placementId: entry.placementId,
    name: content.bodyLabel(entry.label),
    size: [entry.widthMm, entry.heightMm].join(SIZE_JOINER),
    change,
  };
}

function entriesOf(design: Design): readonly DisplayEntry[] | undefined {
  const catalog = buildCatalogAtDepthOf(design);
  if (catalog === undefined) return undefined;
  try {
    return projectDesignForDisplay(design, catalog).flatMap(
      (group) => group.entries,
    );
  } catch (error) {
    if (error instanceof UnknownBodyError) return undefined;
    throw error;
  }
}

/** Every fact of a body the document stores: which body, how big, where it stands and what it wears of its own. */
function isSameBody(left: DisplayEntry, right: DisplayEntry): boolean {
  return (
    left.buildId === right.buildId &&
    left.widthMm === right.widthMm &&
    left.heightMm === right.heightMm &&
    left.wall === right.wall &&
    left.alongMm === right.alongMm &&
    left.y0Mm === right.y0Mm &&
    left.handle === right.handle &&
    JSON.stringify(left.finish) === JSON.stringify(right.finish)
  );
}

/** Whether the two copies differ in any body: the switch's one claim that something changed. */
export function holdsDifferingRows(rows: readonly VersionRow[]): boolean {
  return rows.some((row) => row.change !== "same");
}
