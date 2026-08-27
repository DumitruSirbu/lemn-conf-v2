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
  "base-2door": "base-2-door.svg",
  "base-1door": "base-1-door.svg",
  "base-3drawer": "base-3-drawer.svg",
  "base-panbank": "base-panbank.svg",
  "base-hob-2drawer": "base-hob-2drawer.svg",
  // ADR 0027. `base-oven.svg` is titled "Base range cabinet with cooktop and oven" and draws both,
  // so it is this row's drawing under a shorter name — the spelling gap this table exists for.
  "base-hob-oven": "base-oven.svg",
  "base-bottle-cargo": "base-bottle-cargo.svg",
  "base-sink": "base-sink.svg",
  "base-dishwasher": "base-dishwasher.svg",
  "wall-2door": "wall-2-door.svg",
  "wall-1door": "wall-1-door.svg",
  "wall-lift": "wall-lift.svg",
  "open-shelf": "wall-open-shelf.svg",
  hood: "wall-hood.svg",
  "tall-pantry": "tall-pantry.svg",
  "tall-oven-tower": "tall-oven-tower.svg",
  "tall-fridge-housing": "tall-fridge-housing.svg",
  "fridge-free": "tall-fridge.svg",
};

/** The file name this body's drawing is stored under, or `undefined` for an unmapped body. */
export function findCabinetDrawingFilename(
  buildId: string,
): string | undefined {
  // Own properties only, for the reason `isKnownKind` gives: `buildId in record` walks
  // `Object.prototype`, so "constructor" would answer with a function rather than a file name.
  return Object.hasOwn(CABINET_DRAWING_FILENAMES, buildId)
    ? CABINET_DRAWING_FILENAMES[buildId]
    : undefined;
}

/**
 * The URL frame 2B's tile paints, or `undefined` when this body has no drawing.
 *
 * `undefined` rather than a placeholder path: §13.4 chose a CSS `background-image` precisely so an
 * unresolved value paints an empty tile instead of firing a request that 404s, and a stand-in
 * drawing would be a worse answer than an empty tile — it would name the wrong cabinet.
 */
export function findCabinetThumbnailUrl(buildId: string): string | undefined {
  const filename = findCabinetDrawingFilename(buildId);
  if (filename === undefined) return undefined;
  return `${CABINET_DRAWING_DIRECTORY}/${filename}`;
}
