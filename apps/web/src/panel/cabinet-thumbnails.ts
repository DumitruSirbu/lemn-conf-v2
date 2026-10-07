// Mockup frame 2B's 54 x 54 row thumbnail: which vendored drawing stands for which catalogue body.
// It lives in the web app, not `configurator-domain`: a public asset path is not a fact the I/O-free domain may hold,
// and the panel's projection is the first layer that may know the app serves `public/` at the root.
// Ids and filenames are spelled differently (`base-2door` vs `base-2-door`), so this is a table, not string
// manipulation: a rename on either side must break the table's test rather than produce a path to nothing.

import { deriveDoorCount } from "@lemnaria/configurator-domain";

/** Where `apps/web/public/cabinets/` is served from. */
const CABINET_DRAWING_DIRECTORY = "/cabinets";

/**
 * `DEVELOPMENT-SPEC.md` §7's insertable catalogue, each id against its drawing's file name. Every insertable entry
 * must appear: §13.4 paints these as a CSS `background-image`, which renders nothing when the value does not resolve,
 * so only `tests/panel/cabinet-thumbnails.test.ts` can see a missing drawing. Seeded bodies and the two structural
 * corners are absent: they never appear as an offer row (§13.1).
 */
const CABINET_DRAWING_FILENAMES: Readonly<Record<string, string>> = {
  "base-3drawer": "base-3-drawer.svg",
  "base-panbank": "base-panbank.svg",
  "base-hob-2drawer": "base-hob-2drawer.svg",
  // ADR 0027. `base-oven.svg` is titled "Base range cabinet with cooktop and oven" and draws both, so it is this
  // row's drawing under a shorter name.
  "base-hob-oven": "base-oven.svg",
  "base-bottle-cargo": "base-bottle-cargo.svg",
  "base-sink": "base-sink.svg",
  "base-dishwasher": "base-dishwasher.svg",
  "wall-lift": "wall-lift.svg",
  "open-shelf": "wall-open-shelf.svg",
  hood: "wall-hood.svg",
  "tall-pantry": "tall-pantry.svg",
  "tall-oven-tower": "tall-oven-tower.svg",
  "tall-fridge-housing": "tall-fridge-housing.svg",
  "fridge-free": "tall-fridge.svg",
};

/**
 * Two drawings for one entry (ADR 0033): the drawing depicts a door count, and the door count follows the width. One
 * drawing for the merged id would put a two-door elevation on a 300 mm one-door row. The width chooses through the
 * domain's `deriveDoorCount`, which the builder and the label also read, so picture, name and geometry agree.
 */
const DOOR_COUNT_DRAWING_FILENAMES: Readonly<
  Record<string, Readonly<Record<number, string>>>
> = {
  "base-cabinet": { 1: "base-1-door.svg", 2: "base-2-door.svg" },
  "wall-cabinet": { 1: "wall-1-door.svg", 2: "wall-2-door.svg" },
};

/** Every drawing this body could ever show: one for most entries, two for a merged cabinet whose door count follows
 *  its width. The guard test sweeps this, so both of a merged entry's drawings must be vendored. */
export function listCabinetDrawingFilenames(
  buildId: string,
): readonly string[] {
  const doorCounts = ownProperty(DOOR_COUNT_DRAWING_FILENAMES, buildId);
  if (doorCounts !== undefined) return Object.values(doorCounts);
  const single = ownProperty(CABINET_DRAWING_FILENAMES, buildId);
  return single === undefined ? [] : [single];
}

/** The file name this body's drawing is stored under at a given width, or `undefined` for an
 *  unmapped body. The width is only consulted for an entry whose door count follows it. */
export function findCabinetDrawingFilename(
  buildId: string,
  widthMm: number,
): string | undefined {
  const doorCounts = ownProperty(DOOR_COUNT_DRAWING_FILENAMES, buildId);
  if (doorCounts !== undefined) return doorCounts[deriveDoorCount(widthMm)];
  return ownProperty(CABINET_DRAWING_FILENAMES, buildId);
}

/** Own properties only, for the reason `isKnownKind` gives: `buildId in record` walks
 *  `Object.prototype`, so "constructor" would answer with a function rather than a file name. */
function ownProperty<T>(
  table: Readonly<Record<string, T>>,
  buildId: string,
): T | undefined {
  return Object.hasOwn(table, buildId) ? table[buildId] : undefined;
}

/**
 * The URL frame 2B's tile paints, or `undefined` when this body has no drawing. Not a placeholder path: §13.4 chose a
 * CSS `background-image` so an unresolved value paints an empty tile, and a stand-in drawing would name the wrong
 * cabinet.
 */
export function findCabinetThumbnailUrl(
  buildId: string,
  widthMm: number,
): string | undefined {
  const filename = findCabinetDrawingFilename(buildId, widthMm);
  if (filename === undefined) return undefined;
  return `${CABINET_DRAWING_DIRECTORY}/${filename}`;
}
