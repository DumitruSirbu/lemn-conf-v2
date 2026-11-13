// M10 M4-c adversarial QA: a linked accessory's `linkedBuildId` against the whole shipped catalogue, the agreement of
// the creation's refusal with the catalogue judgement, and the domain staying free of I/O in the modules this wave
// added or changed.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { applyChanges } from "../../src/price-dashboard/apply-changes.js";
import {
  judgeBookAgainstCatalog,
  type BookRefusal,
} from "../../src/price-dashboard/judge-book.js";
import type {
  CabinetPriceRule,
  PriceBook,
} from "../../src/pricing/price-book.js";
import { SAMPLE_PRICE_BOOK } from "../../src/pricing/sample-price-book.js";
import {
  bookWithLinked,
  linkedRule,
} from "../support/linked-accessory-books.js";

import { deepFrozen } from "./qa-m3-support.js";
import { CATALOG } from "./m2-support.js";
import { change, createAccessory, refusalCodes } from "./qa-m4-support.js";

const LINK_CODES = ["LINK_TARGET_UNKNOWN", "LINK_TARGET_CUSTOMER_SUPPLIED"];

function ruleFor(buildId: string): CabinetPriceRule | undefined {
  return SAMPLE_PRICE_BOOK.cabinetRules.find(
    (rule) => rule.buildId === buildId,
  );
}

function cloneRule(of: string, buildId: string): CabinetPriceRule {
  const source = ruleFor(of);
  if (source === undefined) throw new Error(`no rule for ${of}`);
  return { ...source, ruleId: `cabinet.${buildId}`, buildId };
}

/** The book with a rule for `buildId` (a copy of `like`'s when the book has none) and one accessory linked to it. */
function bookLinkedTo(buildId: string, like = "base-cabinet"): PriceBook {
  const hasRule = ruleFor(buildId) !== undefined;
  return bookWithLinked([linkedRule("probe", { linkedBuildId: buildId })], {
    ...SAMPLE_PRICE_BOOK,
    cabinetRules: hasRule
      ? SAMPLE_PRICE_BOOK.cabinetRules
      : [...SAMPLE_PRICE_BOOK.cabinetRules, cloneRule(like, buildId)],
  });
}

function linkCodesOf(book: PriceBook): readonly string[] {
  const judged = judgeBookAgainstCatalog(book, CATALOG);
  return judged.ok
    ? []
    : judged.refusals
        .map((refusal: BookRefusal) => refusal.code)
        .filter((code) => LINK_CODES.includes(code));
}

/** What the catalogue says, worked out from its own flags: a row is priced as itself when it declares no equivalent. */
function expectedLinkCode(buildId: string, like: string): string | undefined {
  const definition = CATALOG.get(buildId);
  const pricedAsItself =
    definition !== undefined && definition.catalogEquivalentId === undefined;
  if (!pricedAsItself) return "LINK_TARGET_UNKNOWN";
  const rule = ruleFor(buildId) ?? ruleFor(like);
  return rule?.suppliedBy === "customer"
    ? "LINK_TARGET_CUSTOMER_SUPPLIED"
    : undefined;
}

describe("a linked accessory's link, against every row the catalogue holds", () => {
  const CATALOGUE_IDS = [...CATALOG.keys()];

  it("is accepted exactly for the rows the catalogue prices as themselves and the manufacturer supplies, whether the book already had the rule or not", () => {
    expect(CATALOGUE_IDS.length).toBeGreaterThanOrEqual(35);
    const verdicts = CATALOGUE_IDS.map((buildId) => [
      buildId,
      linkCodesOf(bookLinkedTo(buildId)),
    ]);

    for (const [buildId, codes] of verdicts) {
      const expected = expectedLinkCode(String(buildId), "base-cabinet");
      expect(codes, String(buildId)).toEqual(
        expected === undefined ? [] : [expected],
      );
    }
    expect(
      verdicts.filter(([, codes]) => (codes as string[]).length === 0).length,
    ).toBeGreaterThanOrEqual(15);
    expect(
      verdicts.filter(([, codes]) => (codes as string[]).length > 0).length,
    ).toBeGreaterThanOrEqual(10);
  });

  it("is told unknown before customer-supplied when a seeded variant carries a customer rule", () => {
    const seededVariants = CATALOGUE_IDS.filter(
      (buildId) => CATALOG.get(buildId)?.catalogEquivalentId !== undefined,
    );

    expect(seededVariants.length).toBeGreaterThanOrEqual(10);
    for (const buildId of seededVariants) {
      expect(linkCodesOf(bookLinkedTo(buildId, "hood")), buildId).toEqual([
        "LINK_TARGET_UNKNOWN",
      ]);
    }
  });

  it.each([
    "",
    "ghost-row",
    "__proto__",
    "constructor",
    "toString",
    "BASE-3DRAWER",
    "base-3drawer ",
  ])(
    "is refused for an id the catalogue does not hold (%j), even when the book has a rule for it",
    (buildId) => {
      expect(linkCodesOf(bookLinkedTo(buildId))).toEqual([
        "LINK_TARGET_UNKNOWN",
      ]);
    },
  );

  it("names the accessory and the link on each refusal, in book order, one per accessory", () => {
    const book = bookWithLinked(
      [
        linkedRule("a", { linkedBuildId: "wall-1door-300" }),
        linkedRule("b", { linkedBuildId: "base-3drawer" }),
        linkedRule("c", { linkedBuildId: "fridge-free" }),
        linkedRule("d", { linkedBuildId: "nowhere" }),
      ],
      {
        ...SAMPLE_PRICE_BOOK,
        cabinetRules: [
          ...SAMPLE_PRICE_BOOK.cabinetRules,
          cloneRule("wall-cabinet", "wall-1door-300"),
          cloneRule("base-cabinet", "nowhere"),
        ],
      },
    );

    const judged = judgeBookAgainstCatalog(book, CATALOG);
    const linkRefusals = judged.ok
      ? []
      : judged.refusals.filter((refusal) => LINK_CODES.includes(refusal.code));

    expect(linkRefusals).toEqual([
      {
        code: "LINK_TARGET_UNKNOWN",
        accessoryId: "a",
        linkedBuildId: "wall-1door-300",
      },
      {
        code: "LINK_TARGET_CUSTOMER_SUPPLIED",
        accessoryId: "c",
        linkedBuildId: "fridge-free",
      },
      {
        code: "LINK_TARGET_UNKNOWN",
        accessoryId: "d",
        linkedBuildId: "nowhere",
      },
    ]);
  });

  it("judges the same twice and writes nothing into the book it is given", () => {
    const frozen = deepFrozen(structuredClone(bookLinkedTo("fridge-free")));

    expect(judgeBookAgainstCatalog(frozen, CATALOG)).toEqual(
      judgeBookAgainstCatalog(frozen, CATALOG),
    );
  });
});

describe("the creation's own link check and the catalogue judgement agree wherever both can see", () => {
  const BOOK_RULE_IDS = SAMPLE_PRICE_BOOK.cabinetRules.map(
    (rule) => rule.buildId,
  );

  it("refuses at creation exactly the links to customer-supplied rows and to rows the book has no rule for", () => {
    for (const linkedBuildId of [...BOOK_RULE_IDS, "ghost", "", "__proto__"]) {
      const result = applyChanges(SAMPLE_PRICE_BOOK, [
        createAccessory("probe", { linkedBuildId }),
      ]);
      const rule = ruleFor(linkedBuildId);
      const expected =
        rule === undefined
          ? "0:LINK_TARGET_UNKNOWN"
          : rule.suppliedBy === "customer"
            ? "0:LINK_TARGET_CUSTOMER_SUPPLIED"
            : "ok";

      expect(refusalCodes(result), linkedBuildId).toBe(expected);
    }
  });

  it("leaves a link to a row the book prices and the catalogue does not hold to the catalogue judgement", () => {
    const book: PriceBook = {
      ...SAMPLE_PRICE_BOOK,
      cabinetRules: [
        ...SAMPLE_PRICE_BOOK.cabinetRules,
        cloneRule("base-cabinet", "ghost-row"),
      ],
    };
    const result = applyChanges(book, [
      createAccessory("probe", { linkedBuildId: "ghost-row" }),
    ]);

    expect(result.ok).toBe(true);
    expect(result.ok && linkCodesOf(result.book)).toEqual([
      "LINK_TARGET_UNKNOWN",
    ]);
  });

  it("cannot name a cabinet row in a deletion, so no draft deletes the rule a link points to", () => {
    const linked = bookLinkedTo("base-3drawer");

    for (const item of [
      { kind: "cabinet", buildId: "base-3drawer" },
      { kind: "cabinet", ruleId: "cabinet.base-3drawer" },
      { kind: "rule", ruleId: "cabinet.base-3drawer" },
    ]) {
      expect(
        refusalCodes(
          applyChanges(linked, [change({ kind: "item-deleted", item }, true)]),
        ),
      ).toBe("0:UNKNOWN_ADDRESS");
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// The domain stays free of I/O

describe("the modules this wave added or changed are free of I/O", () => {
  const SOURCE = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../src/price-dashboard",
  );
  const MODULES = [
    "structural-changes",
    "draft-structure",
    "row-diff",
    "publish-deletions",
    "created-row-text",
    "apply-changes",
    "diff-books",
    "judge-book",
    "editable-fields",
    "restore",
  ];
  const FORBIDDEN_USES = [
    /\bfetch\s*\(/u,
    /\bprocess\b/u,
    /\bDate\b/u,
    /\bMath\.random\b/u,
    /\bcrypto\b/u,
    /\bsetTimeout\b|\bsetInterval\b/u,
    /\brequire\s*\(/u,
    /\bimport\s*\(/u,
    /\bconsole\b/u,
    /\bglobalThis\b|\bwindow\b|\bdocument\b|\blocalStorage\b/u,
  ];

  function codeOf(module: string): string {
    return readFileSync(path.join(SOURCE, `${module}.ts`), "utf8")
      .replace(/\/\*[\s\S]*?\*\//gu, "")
      .replace(/^\s*\/\/.*$/gmu, "");
  }

  it.each(MODULES)("%s imports only relative modules", (module) => {
    const specifiers = [...codeOf(module).matchAll(/from\s+"([^"]+)"/gu)].map(
      (match) => match[1] ?? "",
    );

    expect(specifiers.length).toBeGreaterThan(0);
    expect(
      specifiers.filter((specifier) => !specifier.startsWith(".")),
    ).toEqual([]);
  });

  it.each(MODULES)(
    "%s reads no clock, entropy, network, process or global",
    (module) => {
      const code = codeOf(module);

      expect(FORBIDDEN_USES.filter((pattern) => pattern.test(code))).toEqual(
        [],
      );
    },
  );
});
