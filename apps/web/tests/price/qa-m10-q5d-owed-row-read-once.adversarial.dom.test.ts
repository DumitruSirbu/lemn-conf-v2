// @vitest-environment happy-dom
//
// M10 Q5d, adversarial: what the replacement sheet's rows say when read aloud, in both languages, for every kind of row.
// The implementer's pins count a substring in a row's `textContent`, which cannot see a labelled group or an `aria-hidden`
// span: this reads the row the way the accessibility tree would (`../support/read-aloud.ts`, itself proven on a labelled group in
// `read-aloud.test.ts`) and holds each row to exactly "kind, item, status, then the control named by verb and kind".
//
// What this cannot see: a real screen reader's phrasing, and the order in which it moves between a control and its row.
import { SAMPLE_PRICE_BOOK, tierRef } from "@lemnaria/configurator-domain";
import { createTranslator } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/scene/webgl-support", () => ({
  useWebGLSupport: () => "supported",
}));
vi.mock("@/scene/kitchen-canvas", () => ({ default: () => null }));
vi.mock("@/panel/editor-panel", () => ({ EditorPanel: () => null }));
vi.mock("@/settings/global-settings", () => ({ GlobalSettings: () => null }));
vi.mock("@/app/configurator/configure/selection-debug", () => ({
  SelectionDebug: () => null,
}));
vi.mock("@/panel/use-panel-view", () => ({
  usePanelView: () => ({ kind: "closed" }),
}));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  usePathname: () => "/ro/d/abcdefghijklmnopqrstu",
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  }),
}));

import { resolveContent } from "../../src/i18n/content";
import roMessages from "../../src/messages/ro.json";
import ruMessages from "../../src/messages/ru.json";
import type { ActivePriceBook } from "@/price/price-book-root";
import { accessibleNameOf, utterancesOf } from "../support/read-aloud";
import {
  BLACK_OFF,
  kitchenWith,
  rootSwitchingOff,
  WHITE,
  WHITE_OFF,
} from "../support/replacement-kitchens";
import { rowAbout, rowsOf } from "../support/replacement-sheet-flow";
import {
  beginTest,
  carryingMdfAndPremium,
  chooseTier,
  endTest,
  hydrate,
  mountEditor,
  notice,
  ROOT_NOTHING_OFF_AT_PAIR,
  ROOT_WITH_MDF_AND_PREMIUM_OFF,
  serveWorld,
  SWITCHED_OFF_HARDWARE,
  SWITCHED_OFF_MATERIAL,
  VANISHED_MATERIAL,
  type EditorLocale,
} from "../support/replacement-sheet-world";
import { SAMPLE_PRICE_ROOT } from "../support/sample-price-root";
import { kitchenCarrying } from "../support/tier-offer-world";

const VANISHED_HARDWARE = "hardware.created-and-since-deleted";
const MARKUP_NAME = `<b>MDF & "mat"</b> &amp; <script>alert(1)</script>`;
const MARKUP_ELEMENTS = "b, script, i, img";

/** The part of the "no longer available" sentence that both the status and the generic line carry, per language: the generic
 *  line is "O opțiune aleasă nu mai este disponibilă" in Romanian, so the status's whole sentence is a prefix of it there. */
const UNAVAILABLE_STEM = {
  ro: "nu mai este disponibil",
  ru: "больше недоступ",
} as const;

const MESSAGES = { ro: roMessages, ru: ruMessages } as const;

function wordsOf(locale: EditorLocale) {
  const messages = MESSAGES[locale];
  const content = resolveContent(createTranslator({ locale, messages }));
  const sheet = messages.replacementSheet;
  const tierNamed = (tierId: string): string => {
    const tier = [
      ...SAMPLE_PRICE_BOOK.material.tiers,
      ...SAMPLE_PRICE_BOOK.hardware.tiers,
    ].find((candidate) => candidate.tierId === tierId);
    if (tier === undefined) throw new Error(`the sample book has no ${tierId}`);
    return content.bookText(tier.name, tier.nameKey);
  };
  return {
    content,
    sheet,
    tierNamed,
    stem: UNAVAILABLE_STEM[locale],
    kinds: {
      material: content.priceBreakdown.wholeKitchenCategories.material,
      hardware: content.priceBreakdown.wholeKitchenCategories.hardware,
      finish: content.globalSettings.colourHeading,
      handle: content.globalSettings.kitchenHandleHeading,
    },
  };
}

function occurrencesOf(text: string, part: string): number {
  return text.split(part).length - 1;
}

/** Every utterance of the row but the control's: what is read before the control, in order. */
function rowTextOf(row: HTMLElement): string[] {
  const control = row.querySelector('[data-testid="replacement-choose"]');
  return utterancesOf(row).slice(0, control === null ? undefined : -1);
}

function controlNameOf(row: HTMLElement): string {
  const control = row.querySelector('[data-testid="replacement-choose"]');
  if (control === null) throw new Error("the row has no control");
  return accessibleNameOf(control);
}

function definedRow(row: HTMLElement | undefined, about: string): HTMLElement {
  if (row === undefined) throw new Error(`no row about ${about}`);
  return row;
}

beforeEach(() => {
  beginTest();
});

afterEach(async () => {
  await endTest();
});

describe.each(["ro", "ru"] as const)("in %s", (locale) => {
  const words = wordsOf(locale);
  const { sheet, kinds, stem } = words;

  it("reads an owed material and an owed hardware tier as kind, name, status once each, then a control named by kind", async () => {
    hydrate(carryingMdfAndPremium());
    serveWorld({ notices: [notice(), notice()] });
    const editor = await mountEditor({
      priceRoot: ROOT_WITH_MDF_AND_PREMIUM_OFF,
      locale,
    });

    expect(rowsOf(editor).map(utterancesOf)).toEqual([
      [
        kinds.material,
        words.tierNamed(SWITCHED_OFF_MATERIAL),
        sheet.unavailable,
        `${sheet.choose} ${kinds.material}`,
      ],
      [
        kinds.hardware,
        words.tierNamed(SWITCHED_OFF_HARDWARE),
        sheet.unavailable,
        `${sheet.choose} ${kinds.hardware}`,
      ],
    ]);
    for (const row of rowsOf(editor)) {
      expect(occurrencesOf(rowTextOf(row).join(" "), stem)).toBe(1);
    }
  });

  it("reads an owed colour and an owed handle, whose names do not carry their kind, in the same shape as a tier", async () => {
    hydrate(kitchenWith({ finish: WHITE, handle: "black" }));
    serveWorld({ notices: [notice()] });
    const editor = await mountEditor({
      priceRoot: rootSwitchingOff(WHITE_OFF, BLACK_OFF),
      locale,
    });

    expect(rowsOf(editor)).toHaveLength(2);
    expect(
      utterancesOf(definedRow(rowAbout(editor, kinds.finish), "the colour")),
    ).toEqual([
      kinds.finish,
      words.content.finishName("pal.alb"),
      sheet.unavailable,
      `${sheet.choose} ${kinds.finish}`,
    ]);
    expect(
      utterancesOf(definedRow(rowAbout(editor, kinds.handle), "the handle")),
    ).toEqual([
      kinds.handle,
      words.content.panel.handleLabels.black,
      sheet.unavailable,
      `${sheet.choose} ${kinds.handle}`,
    ]);
  });

  it("reads each vanished tier, which has no name to give, as its kind and then the generic line, once each, and tells two such rows apart", async () => {
    hydrate(
      kitchenCarrying({
        materialTierId: VANISHED_MATERIAL,
        hardwareTierId: VANISHED_HARDWARE,
      }),
    );
    serveWorld({ notices: [notice(), notice()] });
    const editor = await mountEditor({
      priceRoot: ROOT_NOTHING_OFF_AT_PAIR,
      locale,
    });

    const materialRow = definedRow(
      rowAbout(editor, kinds.material),
      "material",
    );
    const hardwareRow = definedRow(
      rowAbout(editor, kinds.hardware),
      "hardware",
    );
    expect(rowsOf(editor)).toHaveLength(2);
    expect(utterancesOf(materialRow)).toEqual([
      kinds.material,
      sheet.unnamedOptionUnavailable,
      `${sheet.choose} ${kinds.material}`,
    ]);
    expect(utterancesOf(hardwareRow)).toEqual([
      kinds.hardware,
      sheet.unnamedOptionUnavailable,
      `${sheet.choose} ${kinds.hardware}`,
    ]);
    // The kind leads, so two nameless rows are never read alike (the model's old "announcement" said as much; it is true of
    // the rows now), and no row says the generic line, or any part of it, a second time.
    expect(controlNameOf(materialRow)).not.toBe(controlNameOf(hardwareRow));
    for (const row of [materialRow, hardwareRow]) {
      expect(
        occurrencesOf(rowTextOf(row).join(" "), sheet.unnamedOptionUnavailable),
      ).toBe(1);
      expect(
        occurrencesOf(utterancesOf(row).join(" "), stem),
      ).toBeLessThanOrEqual(1);
    }
  });

  it("reads a resolved row as its kind and what it now is, with no status, and names its control by 'change' and its kind", async () => {
    hydrate(carryingMdfAndPremium());
    serveWorld({ notices: [notice(), notice()] });
    const editor = await mountEditor({
      priceRoot: ROOT_WITH_MDF_AND_PREMIUM_OFF,
      locale,
    });
    const melamine = words.tierNamed("material.melamine");

    await chooseTier(editor, melamine);

    const [materialRow, hardwareRow] = rowsOf(editor);
    expect(materialRow?.dataset.resolved).toBe("true");
    expect(utterancesOf(definedRow(materialRow, "material"))).toEqual([
      kinds.material,
      melamine,
      `${sheet.change} ${kinds.material}`,
    ]);
    expect(utterancesOf(definedRow(hardwareRow, "hardware"))).toEqual([
      kinds.hardware,
      words.tierNamed(SWITCHED_OFF_HARDWARE),
      sheet.unavailable,
      `${sheet.choose} ${kinds.hardware}`,
    ]);
  });

  it("gives every choose control a name made of ids that exist, and a distinct kind id for each row", async () => {
    hydrate(kitchenWith({ finish: WHITE, handle: "black" }));
    serveWorld({ notices: [notice()] });
    const editor = await mountEditor({
      priceRoot: rootSwitchingOff(WHITE_OFF, BLACK_OFF),
      locale,
    });

    const idLists = rowsOf(editor).map(
      (row) =>
        row
          .querySelector('[data-testid="replacement-choose"]')
          ?.getAttribute("aria-labelledby")
          ?.split(" ") ?? [],
    );
    for (const ids of idLists) {
      expect(ids).toHaveLength(2);
      for (const id of ids) expect(document.getElementById(id)).not.toBeNull();
    }
    expect(new Set(idLists.flat()).size).toBe(4);
  });

  it("reads an authored tier name that contains markup as that literal text, once, and draws no element from it", async () => {
    hydrate(carryingMdfAndPremium());
    serveWorld({ notices: [notice(), notice()] });
    const editor = await mountEditor({
      priceRoot: rootNamingTiers(MARKUP_NAME),
      locale,
    });

    const rows = rowsOf(editor);
    expect(rows).toHaveLength(2);
    expect(rows.map(rowTextOf)).toEqual([
      [kinds.material, MARKUP_NAME, sheet.unavailable],
      [kinds.hardware, MARKUP_NAME, sheet.unavailable],
    ]);
    for (const row of rows) {
      expect(row.querySelector(MARKUP_ELEMENTS)).toBeNull();
      expect(occurrencesOf(utterancesOf(row).join(" "), '"mat"')).toBe(1);
      expect(occurrencesOf(utterancesOf(row).join(" "), stem)).toBe(1);
    }
  });
});

/** The sample root with the two switched-off tiers renamed to `name`, authored text with no message key to override it, so the
 *  name on the page is exactly this string. */
function rootNamingTiers(name: string): ActivePriceBook {
  const { material, hardware } = SAMPLE_PRICE_BOOK;
  const renamed = <Tier extends { readonly tierId: string }>(
    tiers: readonly Tier[],
    tierId: string,
  ): Tier[] =>
    tiers.map((tier) =>
      tier.tierId === tierId ? { ...tier, name, nameKey: undefined } : tier,
    );
  return {
    ...SAMPLE_PRICE_ROOT,
    availability: {
      revision: "1",
      disabled: [
        tierRef("material", SWITCHED_OFF_MATERIAL),
        tierRef("hardware", SWITCHED_OFF_HARDWARE),
      ],
    },
    book: {
      ...SAMPLE_PRICE_ROOT.book,
      material: {
        ...material,
        tiers: renamed(material.tiers, SWITCHED_OFF_MATERIAL),
      },
      hardware: {
        ...hardware,
        tiers: renamed(hardware.tiers, SWITCHED_OFF_HARDWARE),
      },
    },
  };
}
