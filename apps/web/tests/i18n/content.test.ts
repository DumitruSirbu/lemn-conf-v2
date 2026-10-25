import type { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import { kindLabel } from "@lemnaria/configurator-domain";

import {
  resolveContent,
  type Content,
  type ContentTranslator,
} from "../../src/i18n/content";
import roMessages from "../../src/messages/ro.json";
import ruMessages from "../../src/messages/ru.json";
import {
  CATALOGUES,
  translatorFor,
  type Catalogue,
  type CatalogueLocale,
} from "../support/catalogues";
import { REJECTION_FIXTURES } from "./golden-output-fixtures";

interface StringLeaf {
  readonly path: string;
  readonly value: string;
}

interface FunctionLeaf {
  readonly path: string;
  readonly value: (...arguments_: never[]) => string;
}

type ContentKey = Parameters<ContentTranslator>[0];
const CONTENT_TRANSLATOR_REJECTS_UNKNOWN_KEY: "panel.clsoe" extends ContentKey
  ? false
  : true = true;

/** Compile-only witnesses: generated key arguments must not widen while the public closures retain
 * their pre-i18n signatures. The unreachable calls are still checked by TypeScript. */
function generatedArgumentTypeWitness(translate: ContentTranslator): void {
  translate("panel.headerMeta", {
    wall: "A",
    bandLabel: "band-token",
    widthMm: 600,
    heightMm: 860,
  });
  // @ts-expect-error heightMm is a required generated ICU argument
  translate("panel.headerMeta", {
    wall: "A",
    bandLabel: "band-token",
    widthMm: 600,
  });
  translate("globalSettings.appliesTo", { bodyCount: 2 });
  // @ts-expect-error bodyCount is numeric in the generated ICU argument contract
  translate("globalSettings.appliesTo", { bodyCount: "2" });
}
void generatedArgumentTypeWitness;

const CONTENT_SIGNATURE_WITNESSES: {
  readonly rejection: Parameters<Content["rejection"]>;
  readonly headerMeta: Parameters<Content["panel"]["headerMeta"]>;
  readonly countForBody: Parameters<Content["panel"]["countForBody"]>;
  readonly appliesTo: Parameters<Content["globalSettings"]["appliesTo"]>;
  readonly tierDelta: Parameters<Content["globalSettings"]["tierDelta"]>;
} = {
  rejection: [{ code: "VOID_SELECTED", params: {} }],
  headerMeta: ["A", "band-token", 600, 860],
  countForBody: [2, "band-token", 600],
  appliesTo: [2],
  tierDelta: ["9 000 MDL"],
};

function stringLeaves(value: unknown, path = ""): readonly StringLeaf[] {
  if (typeof value === "string") return [{ path, value }];
  if (typeof value !== "object" || value === null) return [];
  return Object.entries(value).flatMap(([key, child]) =>
    stringLeaves(child, path === "" ? key : `${path}.${key}`),
  );
}

function functionLeaves(value: unknown, path = ""): readonly FunctionLeaf[] {
  if (typeof value === "function") {
    return [{ path, value: value as (...arguments_: never[]) => string }];
  }
  if (typeof value !== "object" || value === null) return [];
  return Object.entries(value).flatMap(([key, child]) =>
    functionLeaves(child, path === "" ? key : `${path}.${key}`),
  );
}

/** The shared `contentFor` resolves content and drops the translator; this file needs both, because
 *  the raw translator **is** the oracle every assertion below compares the resolved surface against.
 *  So it builds one translator and hands back the pair rather than resolving twice. */
function contentAndOracleFor(
  locale: CatalogueLocale,
  messages: Catalogue,
): {
  readonly content: Content;
  readonly translate: ReturnType<typeof createTranslator>;
} {
  const translate = translatorFor(locale, messages);
  return { content: resolveContent(translate), translate };
}

const FUNCTION_FAMILIES = [
  "rejection",
  // The two descriptor resolvers 6B-f added. They are not catalogue families — they turn a domain
  // descriptor into words rather than resolving a leaf of `ro.json` — but they are public functions on `Content` and are counted here
  // so a resolver cannot be added without this list saying so.
  "bodyLabel",
  "bandLabel",
  // 6B-f2's two, on the same footing: a palette entry id and a price book row's key are descriptors
  // the domain publishes, and both are public functions on `Content`.
  "finishName",
  "bookText",
  "reviewRoomLine",
  // 8L S2's two: a contact field code and a class of contact answer, each resolved to one sentence.
  "contactFieldError",
  "contactOutcome",
  // M8C P4: a saved kitchen's facts resolved to the name a preset has when none is typed.
  "presetName",
  "panel.headerMeta",
  "panel.countForBody",
  "panel.countForSlot",
  "panel.noOffersForBody",
  "panel.noOffersForSlot",
  "panel.noOffersTooWide",
  "panel.noOffersTooNarrow",
  "panel.offerSize",
  "panel.savePausedNotice",
  "panel.handleDefaultNote",
  "panel.widthValue",
  "price.amountWithCurrency",
  "priceBreakdown.placementLabel",
  "priceBreakdown.groupHeading",
  "priceBreakdown.wholeKitchenLabel",
  "globalSettings.appliesTo",
  "globalSettings.tierDelta",
  "globalSettings.applyRefused",
  "globalSettings.pillMaterial",
  "globalSettings.pillColourValue",
  "globalSettings.pillHardware",
  "globalSettings.pillDepth",
  "globalSettings.pillNameAllSettings",
  "globalSettings.depthOption",
  "globalSettings.materialResetConfirm.body",
  "submissionResult.channelLine",
  "submissionResult.whatsappMessageToShop",
  "submissionResult.alreadySentAdvice",
  "leadNotice.subject",
  "leadNotice.line",
  "leadNotice.figure",
  "leadNotice.groupCount",
  "leadNotice.preheader",
] as const;

describe("the localized content resolver", () => {
  it("keeps catalogue key and public argument checking in the TypeScript contract", () => {
    expect(CONTENT_TRANSLATOR_REJECTS_UNKNOWN_KEY).toBe(true);
    expect(CONTENT_SIGNATURE_WITNESSES).toEqual({
      rejection: [{ code: "VOID_SELECTED", params: {} }],
      headerMeta: ["A", "band-token", 600, 860],
      countForBody: [2, "band-token", 600],
      appliesTo: [2],
      tierDelta: ["9 000 MDL"],
    });
  });

  it.each(CATALOGUES)(
    "maps all 260 resolved strings through the %s catalogue",
    (locale, messages) => {
      const { content, translate } = contentAndOracleFor(locale, messages);
      const leaves = stringLeaves(content);

      expect(leaves).toHaveLength(260);
      for (const { path, value } of leaves) {
        // The step is stated twice — as a sentence and as the top bar's pill — from one pair of
        // numbers, so neither spelling can drift from the other.
        const expected =
          path === "configure.step" || path === "configure.stepPill"
            ? translate(path, { step: 2, totalSteps: 4 })
            : translate(path);
        expect(value, path).toBe(expected);
        expect(value, path).not.toBe("");
      }
    },
  );

  it.each(CATALOGUES)(
    "backs exactly 43 public functions with %s ICU messages",
    (locale, messages) => {
      const { content, translate } = contentAndOracleFor(locale, messages);

      expect(functionLeaves(content).map(({ path }) => path)).toEqual(
        FUNCTION_FAMILIES,
      );
      expect(content.rejection({ code: "VOID_SELECTED", params: {} })).toBe(
        translate("rejection.VOID_SELECTED"),
      );
      expect(content.panel.headerMeta("A", "band-token", 600, 860)).toBe(
        translate("panel.headerMeta", {
          wall: "A",
          bandLabel: "band-token",
          widthMm: 600,
          heightMm: 860,
        }),
      );
      expect(content.panel.countForBody(2, "band-token", 600)).toBe(
        translate("panel.countForBody", {
          count: 2,
          bandWord: "band-token",
          widthMm: 600,
        }),
      );
      expect(content.panel.countForSlot(2, 700, 860)).toBe(
        translate("panel.countForSlot", {
          count: 2,
          widthMm: 700,
          heightMm: 860,
        }),
      );
      expect(content.panel.noOffersForBody("band-token")).toBe(
        translate("panel.noOffersForBody", { bandWord: "band-token" }),
      );
      expect(content.panel.noOffersForSlot(200, 700)).toBe(
        translate("panel.noOffersForSlot", { widthMm: 200, heightMm: 700 }),
      );
      expect(content.panel.noOffersTooWide(900, 800)).toBe(
        translate("panel.noOffersTooWide", { widthMm: 900, maxWidthMm: 800 }),
      );
      expect(content.panel.noOffersTooNarrow(150, 200)).toBe(
        translate("panel.noOffersTooNarrow", { widthMm: 150, minWidthMm: 200 }),
      );
      expect(content.panel.offerSize(600, 860)).toBe(
        translate("panel.offerSize", { widthMm: 600, heightMm: 860 }),
      );
      expect(content.panel.savePausedNotice("14:05")).toBe(
        translate("panel.savePausedNotice", { time: "14:05" }),
      );
      expect(content.panel.handleDefaultNote("label-token")).toBe(
        translate("panel.handleDefaultNote", { label: "label-token" }),
      );
      expect(content.panel.widthValue(600)).toBe(
        translate("panel.widthValue", { widthMm: 600 }),
      );
      expect(content.price.amountWithCurrency("43 000")).toBe(
        translate("price.amountWithCurrency", { amount: "43 000" }),
      );
      expect(content.priceBreakdown.placementLabel("body-token", 600)).toBe(
        translate("priceBreakdown.placementLabel", {
          bodyLabel: "body-token",
          widthMm: 600,
        }),
      );
      expect(content.priceBreakdown.groupHeading("A", "band-token")).toBe(
        translate("priceBreakdown.groupHeading", {
          wall: "A",
          bandWord: "band-token",
        }),
      );
      expect(
        content.priceBreakdown.wholeKitchenLabel(
          "category-token",
          "tier-token",
        ),
      ).toBe(
        translate("priceBreakdown.wholeKitchenLabel", {
          categoryWord: "category-token",
          tierName: "tier-token",
        }),
      );
      expect(content.globalSettings.appliesTo(2)).toBe(
        translate("globalSettings.appliesTo", { bodyCount: 2 }),
      );
      expect(content.globalSettings.tierDelta("9 000 MDL")).toBe(
        translate("globalSettings.tierDelta", { addedAmount: "9 000 MDL" }),
      );
      expect(content.globalSettings.depthOption(600)).toBe(
        translate("globalSettings.depthOption", { cabinetDepthMm: 600 }),
      );
      expect(content.globalSettings.materialResetConfirm.body(2)).toBe(
        translate("globalSettings.materialResetConfirm.body", {
          chosenCount: 2,
        }),
      );
      expect(content.leadNotice.subject("LM-TOKEN")).toBe(
        translate("leadNotice.subject", { reference: "LM-TOKEN" }),
      );
      expect(content.leadNotice.line("label-token", "value-token")).toBe(
        translate("leadNotice.line", {
          label: "label-token",
          value: "value-token",
        }),
      );
      expect(content.leadNotice.figure("label-token", "43 000 MDL")).toBe(
        translate("leadNotice.figure", {
          label: "label-token",
          amount: "43 000 MDL",
        }),
      );
      expect(content.leadNotice.groupCount("heading-token", 5)).toBe(
        translate("leadNotice.groupCount", {
          heading: "heading-token",
          count: 5,
        }),
      );
      expect(
        content.leadNotice.preheader({
          lead: "lead-token",
          name: "name-token",
          locality: "locality-token",
        }),
      ).toBe(
        translate("leadNotice.preheaderWithLocality", {
          lead: "lead-token",
          name: "name-token",
          locality: "locality-token",
        }),
      );
      expect(
        content.leadNotice.preheader({
          lead: "lead-token",
          name: "name-token",
          locality: "",
        }),
      ).toBe(
        translate("leadNotice.preheader", {
          lead: "lead-token",
          name: "name-token",
        }),
      );
      expect(
        content.submissionResult.channelLine({
          channel: "whatsapp",
          contact: "contact-token",
        }),
      ).toBe(
        translate("submissionResult.channelLine", {
          channel: "whatsapp",
          contact: "contact-token",
        }),
      );
      expect(
        content.submissionResult.whatsappMessageToShop({
          reference: "reference-token",
          link: "link-token",
        }),
      ).toBe(
        translate("submissionResult.whatsappMessageToShop", {
          reference: "reference-token",
          link: "link-token",
        }),
      );
      expect(content.submissionResult.alreadySentAdvice("phone-token")).toBe(
        translate("submissionResult.alreadySentAdvice", {
          phone: "phone-token",
        }),
      );
      expect(content.finishName("pal.gri-havanna")).toBe(
        translate("finish.pal.gri-havanna"),
      );
      expect(
        content.bookText("authored-token", "priceBook.material.veneer.name"),
      ).toBe(translate("priceBook.material.veneer.name"));
      // ADR 0106 decision 2's fallback, asserted in both locales: a row naming no key renders its
      // own words rather than nothing, which is what a manufacturer-entered row will be after M8.
      expect(content.bookText("authored-token", undefined)).toBe(
        "authored-token",
      );
    },
  );

  it.each(CATALOGUES)(
    "resolves all 35 rejection codes and 41 branch fixtures in %s",
    (locale, messages) => {
      const { content } = contentAndOracleFor(locale, messages);
      const codes = new Set<string>();

      expect(REJECTION_FIXTURES).toHaveLength(41);
      for (const fixture of REJECTION_FIXTURES) {
        codes.add(fixture.code);
        const rendered = content.rejection(fixture.detail);
        expect(rendered, fixture.id).not.toBe("");
        expect(rendered, fixture.id).not.toContain("undefined");
        expect(rendered, fixture.id).not.toContain("NaN");
        expect(rendered, fixture.id).not.toContain(fixture.sourceKey);
      }
      expect(codes.size).toBe(35);
    },
  );

  it.each(CATALOGUES)(
    "renders all eight empty-space side/reason combinations distinctly in %s",
    (locale, messages) => {
      const { content } = contentAndOracleFor(locale, messages);
      const sides = [
        { side: "right", reason: "absent" },
        { side: "right", reason: "too_narrow" },
        { side: "right", reason: "opens_a_gap" },
        { side: "right", reason: "key_taken" },
        { side: "left", reason: "absent" },
        { side: "left", reason: "too_narrow" },
        { side: "left", reason: "opens_a_gap" },
        { side: "left", reason: "key_taken" },
      ] as const;
      const rendered = sides.map((side) =>
        content.rejection({
          code: "NO_EMPTY_SPACE",
          params: {
            label: kindLabel("body-token"),
            requestedMm: 650,
            deltaMm: 50,
            sides: [side],
          },
        }),
      );

      expect(new Set(rendered).size).toBe(8);
      for (const output of rendered) {
        expect(output).not.toContain("undefined");
        expect(output).not.toContain("NaN");
      }
    },
  );

  // ADR 0129 D8 / 7I-A15: a right-hand room shows the opposite screen word for the same domain
  // side (G9 — the domain's "right"/"left" mean +along/−along, never a screen side), and a
  // left-hand room's words are unchanged, whether the direction is passed explicitly or omitted.
  it.each(CATALOGUES)(
    "reflects the empty-space side word for a right-hand room, in %s",
    (locale, messages) => {
      const { content } = contentAndOracleFor(locale, messages);
      const detailFor = (side: "left" | "right") => ({
        code: "NO_EMPTY_SPACE" as const,
        params: {
          label: kindLabel("body-token"),
          requestedMm: 650,
          deltaMm: 50,
          sides: [{ side, reason: "absent" as const }],
        },
      });

      // The domain's own "right" (+along), read on a right-hand room, is the same rendered word
      // as the domain's own "left" (−along) read on a left-hand room — the screen word crossed,
      // never the reason.
      expect(content.rejection(detailFor("right"), "right")).toBe(
        content.rejection(detailFor("left"), "left"),
      );
      expect(content.rejection(detailFor("left"), "right")).toBe(
        content.rejection(detailFor("right"), "left"),
      );
      // Left is unmoved whether the direction is passed explicitly or omitted (D2's "absent means
      // left", restated for this reader).
      expect(content.rejection(detailFor("right"))).toBe(
        content.rejection(detailFor("right"), "left"),
      );
    },
  );

  it.each(CATALOGUES)(
    "the side word crosses on wall B for a left-hand room and holds for a right-hand one, in %s",
    (locale, messages) => {
      const { content } = contentAndOracleFor(locale, messages);
      const detailOn = (wall: "A" | "B", side: "left" | "right") => ({
        code: "NO_EMPTY_SPACE" as const,
        params: {
          label: kindLabel("body-token"),
          requestedMm: 650,
          deltaMm: 50,
          sides: [{ side, reason: "absent" as const }],
        },
      });

      // Wall A, left room: the reference — no crossing, domain word is the screen word.
      const wallALeftRight = content.rejection(
        detailOn("A", "right"),
        "left",
        "A",
      );
      const wallALeftLeft = content.rejection(
        detailOn("A", "left"),
        "left",
        "A",
      );
      expect(wallALeftRight).not.toBe(wallALeftLeft);

      // Wall B, left room: crosses — domain "right" reads the same screen word wall A's own
      // (uncrossed) "left" does, and domain "left" reads wall A's "right".
      expect(content.rejection(detailOn("B", "right"), "left", "B")).toBe(
        wallALeftLeft,
      );
      expect(content.rejection(detailOn("B", "left"), "left", "B")).toBe(
        wallALeftRight,
      );

      // Wall B, right room: does not cross — domain word is the screen word again, the same as
      // wall A's own left-room (uncrossed) reading.
      expect(content.rejection(detailOn("B", "right"), "right", "B")).toBe(
        wallALeftRight,
      );
      expect(content.rejection(detailOn("B", "left"), "right", "B")).toBe(
        wallALeftLeft,
      );
    },
  );

  it("actually switches the whole resolved surface instead of returning Romanian functions", () => {
    const romanian = contentAndOracleFor("ro", roMessages).content;
    const russian = contentAndOracleFor("ru", ruMessages as Catalogue).content;
    const roByPath = new Map(
      stringLeaves(romanian).map(({ path, value }) => [path, value]),
    );
    const changedPaths = stringLeaves(russian).flatMap(({ path, value }) =>
      roByPath.get(path) !== value ? [path] : [],
    );

    expect(changedPaths.length).toBeGreaterThan(80);
    expect(russian.panel.countForBody(2, "базовых", 600)).not.toBe(
      romanian.panel.countForBody(2, "band-token", 600),
    );
    expect(russian.globalSettings.appliesTo(2)).not.toBe(
      romanian.globalSettings.appliesTo(2),
    );
  });
});

describe("Romanian CLDR plural bands", () => {
  const { content: romanian } = contentAndOracleFor("ro", roMessages);

  // The sentence each count must produce is written out here. Compared with a second translation of the same key, any
  // wording of any branch agrees with itself; written out, a branch that loses a letter is a different string.
  it.each([
    [0, "few", "0 dulapuri band-token de 600"],
    [1, "one", "1 dulap band-token de 600"],
    [2, "few", "2 dulapuri band-token de 600"],
    [19, "few", "19 dulapuri band-token de 600"],
    [20, "other", "20 dulapuri band-token de 600"],
    [100, "other", "100 dulapuri band-token de 600"],
    [101, "few", "101 dulapuri band-token de 600"],
  ] as const)(
    "selects the %s CLDR category at %i",
    (count, expectedCategory, expectedSentence) => {
      expect(new Intl.PluralRules("ro").select(count)).toBe(expectedCategory);
      expect(romanian.panel.countForBody(count, "band-token", 600)).toBe(
        expectedSentence,
      );
    },
  );

  it("renders zero as the approved plain plural, never the legacy de form", () => {
    const renderedWords = romanian.panel
      .countForBody(0, "band-token", 600)
      .split(" ");
    expect(renderedWords[0]).toBe("0");
    expect(renderedWords[1]).not.toBe("de");
  });
});
