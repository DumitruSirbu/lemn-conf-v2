// Mockup frame 2B's 54 x 54 row thumbnail: which vendored drawing stands for which catalogue body.
//
// This lives in the web app rather than in `configurator-domain` on purpose. The domain is I/O-free
// and knows nothing about how anything is served, so a public asset path is not a fact it may hold
// (`docs/best-practices/engineering-conventions.md`, and the package boundaries gate). The panel's
// projection is the first layer that is allowed to know the app serves `public/` at the root, so the
// mapping is published from here and `describePanel` resolves it onto each row.
//
// The ids and the filenames are spelled differently — `base-2door` versus `base-2-door` — because
// they were authored by different people for different purposes. That is why this is a table and not
// string manipulation: a rename on either side must break the table's test, not silently produce a
// path to nothing.

import { deriveDoorCount } from "@lemnaria/configurator-domain";

/** Where `apps/web/public/cabinets/` is served from. */
const CABINET_DRAWING_DIRECTORY = "/cabinets";

/**
 * `DEVELOPMENT-SPEC.md` §7's insertable catalogue, each id against its drawing's file name.
 *
 * Every insertable entry must appear here — `tests/panel/cabinet-thumbnails.test.ts` reads the
 * catalogue and checks both that the id is mapped and that the file it names exists on disk. §13.4
 * renders these as a CSS `background-image`, which paints nothing when the value does not resolve,
 * so a missing drawing has no visible symptom at all and a test is the only thing that can see it.
 *
 * Seeded (non-insertable) bodies are deliberately absent: they name the panel header but never
 * appear as an offer row, so they have no thumbnail to render. The two structural corners are absent
 * for the same reason — §13.1 makes them structural, so they produce a `structural` section and no
 * offer rows at all, and `base-corner.svg` / `wall-corner.svg` stay unused beside the rest.
 */
const CABINET_DRAWING_FILENAMES: Readonly<Record<string, string>> = {
  "base-3drawer": "base-3-drawer.svg",
  "base-panbank": "base-panbank.svg",
  "base-hob-2drawer": "base-hob-2drawer.svg",
  // ADR 0027. `base-oven.svg` is titled "Base range cabinet with cooktop and oven" and draws both,
  // so it is this row's drawing under a shorter name — the spelling gap this table exists for.
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
 * ADR 0033: **two drawings for one entry**, because the drawing depicts a door count and the door
 * count is now a consequence of the width.
 *
 * The merge left one `wall-cabinet` row where there were two, and frame 2B's tile is a front
 * elevation — it shows the doors. Mapping the merged id to a single drawing would put a two-door
 * elevation on a 300 mm one-door row, which is the naming defect ADR 0033 removes wearing a
 * different coat: a picture that claims a door count nothing verified. Both vendored drawings are
 * kept and the width chooses, through the domain's own `deriveDoorCount` — the same function the
 * builder and the label read, so the picture, the name and the geometry cannot disagree.
 */
const DOOR_COUNT_DRAWING_FILENAMES: Readonly<
  Record<string, Readonly<Record<number, string>>>
> = {
  "base-cabinet": { 1: "base-1-door.svg", 2: "base-2-door.svg" },
  "wall-cabinet": { 1: "wall-1-door.svg", 2: "wall-2-door.svg" },
};

/** Every drawing this body could ever show — one for most entries, two for a merged cabinet whose
 *  door count follows its width. The guard test sweeps this rather than a single answer, so a
 *  merged entry has to have **both** its drawings vendored, not just whichever one a default picked.
 */
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
 * The URL frame 2B's tile paints, or `undefined` when this body has no drawing.
 *
 * `undefined` rather than a placeholder path: §13.4 chose a CSS `background-image` precisely so an
 * unresolved value paints an empty tile instead of firing a request that 404s, and a stand-in
 * drawing would be a worse answer than an empty tile — it would name the wrong cabinet.
 */
export function findCabinetThumbnailUrl(
  buildId: string,
  widthMm: number,
): string | undefined {
  const filename = findCabinetDrawingFilename(buildId, widthMm);
  if (filename === undefined) return undefined;
  return `${CABINET_DRAWING_DIRECTORY}/${filename}`;
}
