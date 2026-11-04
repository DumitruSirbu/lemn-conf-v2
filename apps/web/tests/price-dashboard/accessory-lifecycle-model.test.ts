// What a screen offers for an accessory, as the domain's own verdicts say it. The two accessories the catalogue declares can
// be switched off and on and are never deleted; a linked one is deleted like any row the dashboard created. An accessory has
// no group, so switching one off never leaves a group empty and names no option that remains.
import { describe, expect, it } from "vitest";

import {
  ACCESSORY_IDS,
  SAMPLE_PRICE_BOOK,
  type CatalogueAvailability,
} from "@lemnaria/configurator-domain";

import {
  countedDeletionOf,
  deleteStandOf,
  isDefaultItem,
  switchStandOf,
  type LifecycleContext,
} from "@/price-dashboard/item-lifecycle-model";
import { offReasonWords } from "@/price-dashboard/item-lifecycle-words";

import {
  accessoryItem,
  bookWithLinked,
  DRYING_RACK,
  PUBLISHED,
  PUBLISHED_RULE,
  SINK_COVER,
  USAGE,
} from "./accessory-harness";
import { roCopy } from "./romanian-copy";
import { createTranslator } from "next-intl";
import roMessages from "../../src/messages/ro.json";
import type { ContentTranslator } from "@/i18n/content";

const translate = createTranslator({
  locale: "ro",
  messages: roMessages,
}) as ContentTranslator;
const NOTHING_OFF: CatalogueAvailability = { revision: "1", disabled: [] };
const linkedItem = accessoryItem(PUBLISHED);

function contextOf(
  overrides: Partial<LifecycleContext> = {},
): LifecycleContext {
  return {
    book: bookWithLinked([PUBLISHED_RULE]),
    availability: NOTHING_OFF,
    defaults: {},
    canWrite: true,
    ...overrides,
  };
}

describe("the switch of an accessory", () => {
  it("opens the dialog that switches the drying rack off, with no option named as remaining", () => {
    expect(switchStandOf(accessoryItem(DRYING_RACK), contextOf())).toEqual({
      kind: "disable",
      remaining: [],
    });
  });

  it("is off for the sink cover, which is protection and not an option, whatever can be written and wherever the defaults are unknown", () => {
    for (const overrides of [
      {},
      { canWrite: false },
      { defaults: undefined },
    ]) {
      expect(
        switchStandOf(accessoryItem(SINK_COVER), contextOf(overrides)),
      ).toEqual({ kind: "off", reason: "item-always-present" });
    }
  });

  it("says the cover is always added, in the words of its reason", () => {
    expect(offReasonWords(translate, "item-always-present")).toBe(
      roCopy("priceDashboard.lifecycle.alwaysPresentCannotChange"),
    );
  });

  it("is never the last active option, since an accessory is earned and no other is chosen in its place", () => {
    const everyOtherOff: CatalogueAvailability = {
      revision: "1",
      disabled: [accessoryItem(SINK_COVER), accessoryItem(PUBLISHED)],
    };

    expect(
      switchStandOf(
        accessoryItem(DRYING_RACK),
        contextOf({ availability: everyOtherOff }),
      ),
    ).toMatchObject({ kind: "disable" });
  });

  it("is a default of nothing: no accessory is fixed or saved as one", () => {
    for (const id of [...ACCESSORY_IDS, PUBLISHED]) {
      expect(isDefaultItem(accessoryItem(id), contextOf())).toBe(false);
    }
  });

  it("opens the dialog that switches a switched-off accessory on", () => {
    expect(
      switchStandOf(
        linkedItem,
        contextOf({ availability: { revision: "1", disabled: [linkedItem] } }),
      ),
    ).toEqual({ kind: "enable" });
  });

  it("is off, as not judged, where nothing can be written", () => {
    expect(switchStandOf(linkedItem, contextOf({ canWrite: false }))).toEqual({
      kind: "off",
      reason: "cannot-judge",
    });
  });

  it("is off for an accessory the active book does not state: it is activated after it is published", () => {
    expect(
      switchStandOf(
        accessoryItem("created-1"),
        contextOf({
          availability: {
            revision: "1",
            disabled: [accessoryItem("created-1")],
          },
        }),
      ),
    ).toEqual({ kind: "off", reason: "item-not-in-active-book" });
  });
});

describe("the deletion of an accessory", () => {
  it.each(ACCESSORY_IDS)(
    "is off for the built-in %s, with its own reason, before any default or count is read",
    (accessoryId) => {
      const item = accessoryItem(accessoryId) as Parameters<
        typeof deleteStandOf
      >[0];
      for (const defaults of [{}, undefined]) {
        expect(deleteStandOf(item, contextOf({ defaults }))).toEqual({
          kind: "off",
          reason: "built-in-accessory",
        });
      }
    },
  );

  it("says it comes with the catalogue, in the words of its reason", () => {
    expect(offReasonWords(translate, "built-in-accessory")).toBe(
      roCopy("priceDashboard.lifecycle.builtInAccessoryCannotBeDeleted"),
    );
  });

  it("asks how many saved kitchens use a linked accessory before deciding", () => {
    expect(
      deleteStandOf(
        linkedItem as Parameters<typeof deleteStandOf>[0],
        contextOf(),
      ),
    ).toEqual({ kind: "count-first" });
  });

  it("waits for the saved defaults where they could not be read, for an accessory the book states", () => {
    expect(
      deleteStandOf(
        linkedItem as Parameters<typeof deleteStandOf>[0],
        contextOf({ defaults: undefined }),
      ),
    ).toEqual({ kind: "off", reason: "cannot-judge" });
  });

  it("is blocked by a saved kitchen that uses a linked accessory, with the count", () => {
    expect(
      countedDeletionOf(
        linkedItem as Parameters<typeof deleteStandOf>[0],
        contextOf(),
        USAGE,
      ),
    ).toEqual({ kind: "in-use", count: 4 });
  });

  it("is allowed for a linked accessory no saved kitchen uses", () => {
    const unused = USAGE.map((held) => ({ ...held, designCount: 0 }));

    expect(
      countedDeletionOf(
        linkedItem as Parameters<typeof deleteStandOf>[0],
        contextOf(),
        unused,
      ),
    ).toEqual({ kind: "allowed" });
  });
});

describe("a screen's own book", () => {
  it("is the sample book with a linked accessory the sample does not carry", () => {
    expect(SAMPLE_PRICE_BOOK.linkedAccessories).toEqual([]);
    expect(contextOf().book.linkedAccessories).toHaveLength(1);
  });
});
