// The gate `DEVELOPMENT-SPEC.md` §13.4 makes necessary.
//
// The thumbnails render as a CSS `background-image` so that an unresolved value paints an empty
// tile rather than firing a failed request. That is the right trade for a customer and the wrong one
// for anybody trying to notice a mistake: a renamed drawing, a new catalogue entry, a typo in the
// table all look identical to a correctly drawn cabinet that happens to be mostly white. There is no
// console error, no broken-image glyph and no failed request to find in the network panel.
//
// So the check has to happen here instead. This reads §7's catalogue rather than a list copied out
// of it, and touches the real files rather than trusting the table's spelling.
import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { INSERTABLE_BODY_DEFINITIONS } from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import {
  findCabinetDrawingFilename,
  findCabinetThumbnailUrl,
} from "@/panel/cabinet-thumbnails";

/** Where `apps/web/public/cabinets/` actually is, from this file. */
const DRAWINGS_DIRECTORY = resolve(
  import.meta.dirname,
  "../../public/cabinets",
);

const INSERTABLE_BUILD_IDS = INSERTABLE_BODY_DEFINITIONS.map(
  ([buildId]) => buildId,
);

describe("cabinet thumbnails", () => {
  it("has an entry for every insertable catalogue body", () => {
    const unmapped = INSERTABLE_BUILD_IDS.filter(
      (buildId) => findCabinetDrawingFilename(buildId) === undefined,
    );

    expect(unmapped).toEqual([]);
  });

  it("names a drawing that exists on disk for every insertable catalogue body", () => {
    const missing = INSERTABLE_BUILD_IDS.filter((buildId) => {
      const filename = findCabinetDrawingFilename(buildId);
      return (
        filename === undefined ||
        !existsSync(resolve(DRAWINGS_DIRECTORY, filename))
      );
    });

    expect(missing).toEqual([]);
  });

  // Guards the two assertions above against passing vacuously: an empty catalogue, or a build in
  // which the domain stopped exporting one, would make every filter above trivially empty.
  it("reads a catalogue with bodies in it", () => {
    expect(INSERTABLE_BUILD_IDS.length).toBeGreaterThan(0);
    expect(INSERTABLE_BUILD_IDS).toContain("tall-pantry");
  });

  it("serves each drawing from the public cabinets directory", () => {
    expect(findCabinetThumbnailUrl("base-2door")).toBe(
      "/cabinets/base-2-door.svg",
    );
  });

  // The ids and the file names are spelled differently on purpose, so the table cannot be replaced
  // by string manipulation. Pinning one pair that differs keeps that visible to the next reader.
  it("maps an id whose spelling differs from its file name", () => {
    expect(findCabinetDrawingFilename("fridge-free")).toBe("tall-fridge.svg");
  });

  it("has no thumbnail for a body no drawing was vendored for", () => {
    expect(findCabinetThumbnailUrl("no-such-body")).toBeUndefined();
  });

  // `buildId in record` would walk `Object.prototype` and answer this with a function.
  it("does not resolve an inherited Object property as a drawing", () => {
    expect(findCabinetThumbnailUrl("constructor")).toBeUndefined();
  });

  it("names only drawings the vendored set actually contains", () => {
    const vendored = new Set(
      readdirSync(DRAWINGS_DIRECTORY).filter((entry) => entry.endsWith(".svg")),
    );
    const strays = INSERTABLE_BUILD_IDS.map(findCabinetDrawingFilename).filter(
      (filename) => filename !== undefined && !vendored.has(filename),
    );

    expect(strays).toEqual([]);
  });
});
