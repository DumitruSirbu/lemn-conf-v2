import { findCabinetThumbnailUrl } from "@/panel/cabinet-thumbnails";

// The drawing beside a cabinet in the dashboard's list. The configurator's panel already maps every insertable body to
// its vendored drawing (`panel/cabinet-thumbnails.ts`) and that table is read here, not copied. The panel never offers the
// structural corner pieces, so it has no drawing for them; the dashboard lists them, and they are drawn here.

const CABINET_DRAWING_DIRECTORY = "/cabinets";

const STRUCTURAL_DRAWING_FILENAMES: Readonly<Record<string, string>> = {
  "base-corner-x-900": "base-corner.svg",
  "base-corner-return-320": "base-corner.svg",
  "wall-corner-return-570": "wall-corner.svg",
  "wall-corner-return-570-top": "wall-corner.svg",
  "wall-corner-x-900": "wall-corner.svg",
  "wall-corner-x-900-top": "wall-corner.svg",
};

/** The drawing of a body at its default width (a merged cabinet's door count follows the width), or `undefined`. */
export function findCabinetListImage(
  buildId: string,
  defaultWidthMm: number,
): string | undefined {
  const panelUrl = findCabinetThumbnailUrl(buildId, defaultWidthMm);
  if (panelUrl !== undefined) return panelUrl;
  const structural = Object.hasOwn(STRUCTURAL_DRAWING_FILENAMES, buildId)
    ? STRUCTURAL_DRAWING_FILENAMES[buildId]
    : undefined;
  return structural === undefined
    ? undefined
    : `${CABINET_DRAWING_DIRECTORY}/${structural}`;
}
