import { existsSync } from "node:fs";
import { join } from "node:path";

import { SAMPLE_PRICE_BOOK } from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { findCabinetListImage } from "@/price-dashboard/cabinet-list-image";
import { SAMPLE_CABINET_LIST } from "@/price-dashboard/cabinet-list-sample";

// A drawing that does not resolve paints an empty tile and no test sees it, so every cabinet the book prices must map to a
// file that is really vendored, at the widths where its door count (and so its drawing) changes.

const PUBLIC_DIRECTORY = join(import.meta.dirname, "../../public");
const WIDTH_BELOW_TWO_DOORS_MM = 450;
const WIDTH_AT_TWO_DOORS_MM = 600;

function fileOf(url: string): string {
  return join(PUBLIC_DIRECTORY, url);
}

describe("the drawing beside a cabinet in the list", () => {
  it.each(SAMPLE_PRICE_BOOK.cabinetRules.map((rule) => rule.buildId))(
    "%s has a drawing that is vendored, at a one-door and a two-door width",
    (buildId) => {
      for (const widthMm of [WIDTH_BELOW_TWO_DOORS_MM, WIDTH_AT_TWO_DOORS_MM]) {
        const url = findCabinetListImage(buildId, widthMm);

        expect(url, `${buildId} at ${String(widthMm)} mm`).toBeDefined();
        expect(existsSync(fileOf(url ?? "")), `${url ?? ""} is vendored`).toBe(
          true,
        );
      }
    },
  );

  it("draws a merged cabinet by its door count", () => {
    expect(findCabinetListImage("base-cabinet", WIDTH_BELOW_TWO_DOORS_MM)).toBe(
      "/cabinets/base-1-door.svg",
    );
    expect(findCabinetListImage("base-cabinet", WIDTH_AT_TWO_DOORS_MM)).toBe(
      "/cabinets/base-2-door.svg",
    );
  });

  it("draws the structural corner pieces, which the configurator's panel never offers", () => {
    expect(findCabinetListImage("base-corner-x-900", 900)).toBe(
      "/cabinets/base-corner.svg",
    );
    expect(findCabinetListImage("wall-corner-x-900-top", 900)).toBe(
      "/cabinets/wall-corner.svg",
    );
  });

  it("answers nothing for a body it has no drawing for, and for a name that only inherits one", () => {
    expect(findCabinetListImage("no-such-body", 600)).toBeUndefined();
    expect(findCabinetListImage("constructor", 600)).toBeUndefined();
  });

  it("covers every cabinet the list is drawn with", () => {
    for (const { buildId, widths } of SAMPLE_CABINET_LIST.rules) {
      expect(
        findCabinetListImage(buildId, widths.defaultMm),
        buildId,
      ).toBeDefined();
    }
  });
});

describe("the sample list", () => {
  it("names exactly the cabinets of the sample price book, no more and no fewer", () => {
    expect(SAMPLE_CABINET_LIST.rules.map((rule) => rule.ruleId).sort()).toEqual(
      SAMPLE_PRICE_BOOK.cabinetRules.map((rule) => rule.ruleId).sort(),
    );
  });
});
