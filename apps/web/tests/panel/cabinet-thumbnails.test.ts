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
  listCabinetDrawingFilenames,
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
      (buildId) => listCabinetDrawingFilenames(buildId).length === 0,
    );

    expect(unmapped).toEqual([]);
  });

  // ADR 0033: a merged cabinet has **two** drawings, one per door count, and this sweeps every
  // drawing an entry can ever show rather than whichever one a default width happened to select —
  // which is the case a single lookup would have missed entirely.
  it("names a drawing that exists on disk for every insertable catalogue body", () => {
    const missing = INSERTABLE_BUILD_IDS.flatMap((buildId) =>
      listCabinetDrawingFilenames(buildId)
        .filter(
          (filename) => !existsSync(resolve(DRAWINGS_DIRECTORY, filename)),
        )
        .map((filename) => `${buildId} -> ${filename}`),
    );

    expect(missing).toEqual([]);
  });

  it("gives a merged cabinet both of its door-count drawings", () => {
    expect(listCabinetDrawingFilenames("wall-cabinet")).toEqual([
      "wall-1-door.svg",
      "wall-2-door.svg",
    ]);
    expect(listCabinetDrawingFilenames("base-cabinet")).toEqual([
      "base-1-door.svg",
      "base-2-door.svg",
    ]);
  });

  // The width picks between them at the same threshold the builder and the label read, so the
  // picture cannot claim a door count the cabinet does not have. 400 and 600 are the widths either
  // side of it that the merged set actually declares.
  it("picks the drawing by the door count the width implies", () => {
    expect(findCabinetThumbnailUrl("wall-cabinet", 400)).toBe(
      "/cabinets/wall-1-door.svg",
    );
    expect(findCabinetThumbnailUrl("wall-cabinet", 600)).toBe(
      "/cabinets/wall-2-door.svg",
    );
  });

  // Guards the two assertions above against passing vacuously: an empty catalogue, or a build in
  // which the domain stopped exporting one, would make every filter above trivially empty.
  it("reads a catalogue with bodies in it", () => {
    expect(INSERTABLE_BUILD_IDS.length).toBeGreaterThan(0);
    expect(INSERTABLE_BUILD_IDS).toContain("tall-pantry");
  });

  it("serves each drawing from the public cabinets directory", () => {
    expect(findCabinetThumbnailUrl("base-cabinet", 800)).toBe(
      "/cabinets/base-2-door.svg",
    );
  });

  // The ids and the file names are spelled differently on purpose, so the table cannot be replaced
  // by string manipulation. Pinning one pair that differs keeps that visible to the next reader.
  it("maps an id whose spelling differs from its file name", () => {
    expect(findCabinetDrawingFilename("fridge-free", 700)).toBe(
      "tall-fridge.svg",
    );
  });

  it("has no thumbnail for a body no drawing was vendored for", () => {
    expect(findCabinetThumbnailUrl("no-such-body", 600)).toBeUndefined();
  });

  // `buildId in record` would walk `Object.prototype` and answer this with a function.
  it("does not resolve an inherited Object property as a drawing", () => {
    expect(findCabinetThumbnailUrl("constructor", 600)).toBeUndefined();
    expect(listCabinetDrawingFilenames("constructor")).toEqual([]);
  });

  it("names only drawings the vendored set actually contains", () => {
    const vendored = new Set(
      readdirSync(DRAWINGS_DIRECTORY).filter((entry) => entry.endsWith(".svg")),
    );
    const strays = INSERTABLE_BUILD_IDS.flatMap(
      listCabinetDrawingFilenames,
    ).filter((filename) => !vendored.has(filename));

    expect(strays).toEqual([]);
  });
});
