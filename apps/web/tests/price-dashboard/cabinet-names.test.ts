// The name of each cabinet rule of the book, from the catalogue's own naming of the body: no two cabinets share one, and a
// structural corner piece, which the catalogue names by a kind shared with another piece, is told apart by its built width.
import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import {
  referenceCornerBuiltWidthsMm,
  SAMPLE_PRICE_BOOK,
} from "@lemnaria/configurator-domain";

import type { ContentTranslator } from "@/i18n/content";
import { cabinetNamesOf } from "@/price-dashboard/cabinet-names";

import roMessages from "../../src/messages/ro.json";

const translate = createTranslator({
  locale: "ro",
  messages: roMessages,
}) as ContentTranslator;
const names = cabinetNamesOf(SAMPLE_PRICE_BOOK, translate);
const CORNER_BUILD_IDS = [...referenceCornerBuiltWidthsMm().keys()];

describe("the names of the sample book's cabinets", () => {
  it("name every cabinet rule, and none by the catalogue's word for a body it cannot name", () => {
    expect(Object.keys(names).sort()).toEqual(
      SAMPLE_PRICE_BOOK.cabinetRules.map(({ buildId }) => buildId).sort(),
    );
    expect(Object.values(names)).not.toContain(roMessages.catalog.unknownKind);
  });

  it("are all different from one another, the six corner pieces included", () => {
    const buildIdsByName = new Map<string, string[]>();
    for (const [buildId, name] of Object.entries(names)) {
      buildIdsByName.set(name, [...(buildIdsByName.get(name) ?? []), buildId]);
    }

    expect(
      [...buildIdsByName].filter(([, buildIds]) => buildIds.length > 1),
    ).toEqual([]);
  });

  it("name a corner piece by its kind and the width it is built at, from the catalogue and the corner assembly", () => {
    expect(CORNER_BUILD_IDS).toHaveLength(6);
    expect(names["base-corner-x-900"]).toBe(
      translate("priceDashboard.cabinets.nameWithWidth", {
        name: translate("catalog.kinds.corner_base_x"),
        widthMm: referenceCornerBuiltWidthsMm().get("base-corner-x-900") ?? 0,
      }),
    );
    expect(names["wall-corner-return-570-top"]).toBe(
      translate("priceDashboard.cabinets.nameWithWidth", {
        name: translate("catalog.kinds.corner_wall_return_top", {
          rowWord: translate("band.top"),
        }),
        widthMm:
          referenceCornerBuiltWidthsMm().get("wall-corner-return-570-top") ?? 0,
      }),
    );
  });

  it("leave an insertable cabinet with the catalogue's name for its row, and no width", () => {
    expect(names["base-cabinet"]).toBe(
      roMessages.catalog.entries["base-cabinet"],
    );
    expect(names["wall-cabinet"]).toBe(
      roMessages.catalog.entries["wall-cabinet"],
    );
  });
});
