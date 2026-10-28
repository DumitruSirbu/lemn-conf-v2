// Adversarial QA for Q1b on the shop's notice. The notice prints the review of the STORED snapshot (ADR 0154 decision
// 8): the depth line the stored total counts is one of its lines, worded by the percent stored on that line, in the
// text part and in the HTML part alike, and nothing in it prices again or reads a book. A snapshot stored before the
// cut-over, which has no depth line, prints byte for byte as its golden. The `*.golden.*` files were written by the base
// commit's builder and regenerated deliberately for the owner ruling of 2026-10-28 (M10 Q1c): the structure is still the
// base's, the line amounts are now shown to the ten lei instead of the thousand.
import { fc } from "@fast-check/vitest";
import {
  canonicalSerializeDesign,
  DEEP_CABINET_DEPTH_MM,
  KITCHEN_L_DESIGN,
  MAX_DEEP_CABINET_PERCENT,
  type Design,
  type PricedDesign,
  type SubmissionSnapshot,
} from "@lemnaria/configurator-domain";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import type { Content } from "@/i18n/content";
import {
  composeLeadNotice,
  NoticeKitchenError,
  NoticeLineError,
} from "@/lib/server/mail/lead-notification";

import { ro } from "../../../support/romanian-content";
import {
  builtDeep,
  depthLineOf,
  printedAmountOf,
  pricedKitchenAtPercent,
  restamped,
  snapshotAtPercent,
  sumOfLines,
} from "../../../support/deep-priced-kitchens";
import {
  codeOf,
  importClosureOf,
} from "../../../support/source-import-closure";
import { VARIED_L_ARM, VARIED_U_ARM } from "../../../support/varied-kitchens";
import {
  designSubmission,
  fixtureNamed,
  noticeInput,
  sendableKitchensOf,
} from "./lead-notice-fixtures";
import {
  ownTextOf,
  parseNotice,
  tagSequenceOf,
} from "./notice-html-dom-support";

const priceDesignSpy = vi.hoisted(() => ({ calls: 0 }));

vi.mock("@lemnaria/configurator-domain", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@lemnaria/configurator-domain")>();
  return {
    ...actual,
    priceDesign: (...args: Parameters<typeof actual.priceDesign>) => {
      priceDesignSpy.calls += 1;
      return actual.priceDesign(...args);
    },
    snapshotSubmission: (
      ...args: Parameters<typeof actual.snapshotSubmission>
    ) => {
      priceDesignSpy.calls += 1;
      return actual.snapshotSubmission(...args);
    },
  };
});

const FIXTURES = join(import.meta.dirname, "fixtures");
const BREAKS_A_LINE = /[\p{Cc}\p{Zl}\p{Zp}]/u;
const PROPERTY_SEED = 8_102_028;

function firstDesignOf(arm: typeof VARIED_L_ARM): Design {
  const [first] = sendableKitchensOf(arm);
  if (first === undefined) throw new Error("the arm has a sendable kitchen");
  return first.design;
}

const L_DEEP = builtDeep(firstDesignOf(VARIED_L_ARM));
const U_DEEP = builtDeep(firstDesignOf(VARIED_U_ARM));

function noticeOf(
  snapshot: SubmissionSnapshot,
  content: Content = ro,
): { text: string; html: string } {
  const message = composeLeadNotice({
    ...noticeInput(designSubmission({ snapshot })),
    content,
  });
  if (message.html === undefined)
    throw new Error("the notice has an HTML part");
  return { text: message.text, html: message.html };
}

function contentWith(overrides: {
  readonly depthLineScope?: string;
  readonly depthLine?: Content["priceBreakdown"]["depthLine"];
}): Content {
  return { ...ro, priceBreakdown: { ...ro.priceBreakdown, ...overrides } };
}

/** The appendix of the text part: every row line after the heading, not indented, as `label` and `value`. */
function textAppendixRows(text: string): { label: string; value: string }[] {
  const lines = text.split("\n");
  const start = lines.indexOf(ro.leadNotice.appendixHeading);
  expect(start).toBeGreaterThan(0);
  return lines
    .slice(start + 1)
    .filter((line) => !line.startsWith(" ") && line.includes(": "))
    .map((line) => {
      const at = line.lastIndexOf(": ");
      return { label: line.slice(0, at), value: line.slice(at + 2) };
    });
}

describe("Q1b-a: the depth line the stored total counts is printed, once, and the printed lines are the stored ones", () => {
  it.each([
    ["an L kitchen", L_DEEP],
    ["a U kitchen", U_DEEP],
  ])(
    "lists every stored line exactly once in the text part, %s, and the lines sum to the stored total (A-1)",
    (_name, design) => {
      for (const percent of [0, 1, 12, 50, MAX_DEEP_CABINET_PERCENT]) {
        const snapshot = snapshotAtPercent(design, percent);
        const rows = textAppendixRows(noticeOf(snapshot).text);
        const printed = rows.map((row) => row.value).sort();
        const stored = snapshot.priced.lines
          .map((line) => printedAmountOf(line, ro))
          .sort();

        expect(printed).toEqual(stored);
        expect(sumOfLines(snapshot.priced)).toBe(snapshot.priced.totalMinor);
        expect(
          snapshot.priced.lines.filter((line) => line.kind === "depth"),
        ).toHaveLength(1);
      }
    },
  );

  it.each([
    ["an L kitchen", L_DEEP],
    ["a U kitchen", U_DEEP],
  ])(
    "lists every stored line exactly once in the HTML part too, %s: the appendix's amount cells are the stored lines' amounts",
    (_name, design) => {
      for (const percent of [0, 12, MAX_DEEP_CABINET_PERCENT]) {
        const snapshot = snapshotAtPercent(design, percent);
        const { document } = parseNotice(noticeOf(snapshot).html);
        const heading = [...document.querySelectorAll("h3")].find(
          (candidate) => ownTextOf(candidate) === ro.leadNotice.appendixHeading,
        );
        const printed = [
          ...(heading?.nextElementSibling?.querySelectorAll(
            'td[align="right"]',
          ) ?? []),
        ]
          .map((cell) => cell.textContent)
          .sort();
        const stored = snapshot.priced.lines
          .map((line) => printedAmountOf(line, ro))
          .sort();

        expect(heading).toBeDefined();
        expect(printed).toEqual(stored);
      }
    },
  );

  it("prints the depth row directly after the material row in the text, with the scope words as its own indented line", () => {
    const snapshot = snapshotAtPercent(L_DEEP, 12);
    const depth = depthLineOf(snapshot.priced);
    const label = ro.priceBreakdown.depthLine(depth.depthMm, 12);
    const lines = noticeOf(snapshot).text.split("\n");
    const at = lines.findIndex((line) => line.startsWith(`${label}: `));

    expect(lines[at - 1]).toMatch(
      new RegExp(`^${ro.priceBreakdown.wholeKitchenCategories.material}`),
    );
    expect(lines[at]).toBe(
      ro.leadNotice.line(label, printedAmountOf(depth, ro)),
    );
    expect(lines[at + 1]).toBe(`  ${ro.priceBreakdown.depthLineScope}`);
  });

  it("prints the same row in the HTML part: right after the material row, the scope under the label in the same cell, the amount beside it", () => {
    const snapshot = snapshotAtPercent(L_DEEP, 12);
    const depth = depthLineOf(snapshot.priced);
    const label = ro.priceBreakdown.depthLine(depth.depthMm, 12);
    const { document } = parseNotice(noticeOf(snapshot).html);
    const spans = [...document.querySelectorAll("span")].filter(
      (span) => ownTextOf(span) === label,
    );
    const row = spans[0]?.closest("tr");
    const cells = [...(row?.querySelectorAll(":scope > td") ?? [])];

    expect(spans).toHaveLength(1);
    expect(row?.previousElementSibling?.textContent).toContain(
      ro.priceBreakdown.wholeKitchenCategories.material,
    );
    expect(
      [...(cells[0]?.querySelectorAll("div") ?? [])].map(
        (scope) => scope.textContent,
      ),
    ).toEqual([ro.priceBreakdown.depthLineScope]);
    expect(cells[1]?.textContent).toBe(printedAmountOf(depth, ro));
  });

  it("prints the amount at 0 % as a line that is there and reads inclus, in both parts", () => {
    const snapshot = snapshotAtPercent(L_DEEP, 0);
    const depth = depthLineOf(snapshot.priced);
    const label = ro.priceBreakdown.depthLine(depth.depthMm, 0);
    const { text, html } = noticeOf(snapshot);

    expect(depth.amountMinor).toBe(0);
    expect(text).toContain(
      ro.leadNotice.line(label, ro.priceBreakdown.included),
    );
    expect(html).toContain(label);
    expect(html).toContain(ro.priceBreakdown.depthLineScope);
  });

  it("prints no depth words for a snapshot with no depth line, at 600 mm", () => {
    const standard = snapshotAtPercent(firstDesignOf(VARIED_L_ARM), 12);
    const { text, html } = noticeOf(standard);

    expect(standard.priced.lines.some((line) => line.kind === "depth")).toBe(
      false,
    );
    expect(text).not.toContain(ro.priceBreakdown.depthLineScope);
    expect(html).not.toContain(ro.priceBreakdown.depthLineScope);
    expect(text).not.toContain(
      ro.priceBreakdown.depthLine(DEEP_CABINET_DEPTH_MM, 12),
    );
  });
});

describe("Q1b-a: the stored percent wins, whatever the live book says", () => {
  it("words the line with the percent it was stored with, for every percent the book may state", () => {
    for (let percent = 0; percent <= MAX_DEEP_CABINET_PERCENT; percent += 1) {
      const snapshot = snapshotAtPercent(L_DEEP, percent);
      const { text, html } = noticeOf(snapshot);
      const stored = ro.priceBreakdown.depthLine(
        DEEP_CABINET_DEPTH_MM,
        percent,
      );

      expect(depthLineOf(snapshot.priced).deepCabinetPercent).toBe(percent);
      expect(text).toContain(stored);
      expect(html).toContain(stored);
    }
  });

  it("is worded by the restamped percent and by no other: the sample book's 12 % is nowhere once the line says 7", () => {
    const stamped = restamped(snapshotAtPercent(L_DEEP, 12), 7);
    const { text, html } = noticeOf(stamped);
    const other = ro.priceBreakdown.depthLine(DEEP_CABINET_DEPTH_MM, 12);

    expect(text).toContain(ro.priceBreakdown.depthLine(700, 7));
    expect(html).toContain(ro.priceBreakdown.depthLine(700, 7));
    expect(text).not.toContain(other);
    expect(html).not.toContain(other);
  });

  it("keeps the stored amount whatever the stored percent says: the figure is the stored line's, not recomputed from the percent", () => {
    const stored = snapshotAtPercent(L_DEEP, 12);
    const lying = restamped(stored, 99);
    const depth = depthLineOf(stored.priced);

    expect(noticeOf(lying).text).toContain(
      ro.leadNotice.line(
        ro.priceBreakdown.depthLine(depth.depthMm, 99),
        printedAmountOf(depth, ro),
      ),
    );
  });
});

describe("Q1b-a: a snapshot stored before the cut-over prints as its golden does (structure the base commit's, amounts the Q1c ruling's)", () => {
  const STORED_BEFORE_THE_CUT_OVER = JSON.parse(`{
    "currency": "MDL", "pricingVersion": "sample-2026-09", "status": "estimate", "amountsProvisional": true,
    "lines": [
      { "lineId": "placement:p0:cabinet", "kind": "cabinet", "ruleId": "cabinet.base-sink", "placementId": "p0",
        "buildId": "base-sink-800", "pricedAsBuildId": "base-sink", "label": "base-sink", "widthMm": 800,
        "suppliedBy": "manufacturer", "quantity": 1, "unitAmountMinor": 485600, "amountMinor": 485600 },
      { "lineId": "kitchen:hardware", "kind": "hardware", "ruleId": "hardware.standard", "tierId": "hardware.standard",
        "name": "Standard", "description": "d", "quantity": 1, "unitAmountMinor": 1760, "amountMinor": 1760 },
      { "lineId": "kitchen:material", "kind": "material", "ruleId": "material.painted-mdf", "tierId": "material.painted-mdf",
        "name": "MDF", "description": "d", "quantity": 1, "unitAmountMinor": 900000, "amountMinor": 900000 }
    ],
    "totalMinor": 1387360, "overflowingPlacementIds": [], "totalIsFlagged": false
  }`) as PricedDesign;

  function storedBeforeTheCutOver(): SubmissionSnapshot {
    const onlyP0 = {
      ...KITCHEN_L_DESIGN,
      placements: KITCHEN_L_DESIGN.placements.filter((p) => p.id === "p0"),
    };
    return {
      document: canonicalSerializeDesign(onlyP0),
      priced: STORED_BEFORE_THE_CUT_OVER,
    };
  }

  it("is byte for byte the golden HTML part (written by 0abdd0d2's builder, amounts regenerated for Q1c)", () => {
    const { html } = noticeOf(storedBeforeTheCutOver());

    expect(html).toBe(
      readFileSync(
        join(FIXTURES, "lead-notice-stored-before-cut-over.golden.html"),
        "utf8",
      ),
    );
  });

  it("is byte for byte the golden text part and subject (written by 0abdd0d2's builder, amounts regenerated for Q1c)", () => {
    const message = composeLeadNotice(
      noticeInput(designSubmission({ snapshot: storedBeforeTheCutOver() })),
    );

    expect(`${message.subject}\n\n${message.text}\n`).toBe(
      readFileSync(
        join(FIXTURES, "lead-notice-stored-before-cut-over.golden.txt"),
        "utf8",
      ),
    );
  });

  it("prints the design-with-link fixture's text part as its golden does (amounts regenerated for Q1c; the HTML golden is `lead-notification-html.test.ts`)", () => {
    const message = composeLeadNotice(fixtureNamed("design-with-link"));

    expect(`${message.subject}\n\n${message.text}\n`).toBe(
      readFileSync(
        join(FIXTURES, "lead-notice-design-with-link.golden.txt"),
        "utf8",
      ),
    );
  });
});

describe("Q1b-a must-not: the notice prices nothing again and reads no book (ADR 0154 decision 8)", () => {
  it("never calls priceDesign while composing the notice of a stored 700 mm snapshot", () => {
    const snapshot = snapshotAtPercent(L_DEEP, 35);
    pricedKitchenAtPercent(L_DEEP, 35);
    expect(priceDesignSpy.calls).toBeGreaterThan(0);
    priceDesignSpy.calls = 0;

    const { text } = noticeOf(snapshot);

    expect(text).toContain(ro.priceBreakdown.depthLine(700, 35));
    expect(priceDesignSpy.calls).toBe(0);
  });

  it("imports no module that prices a design, holds a book, or reads the active one", () => {
    const closure = importClosureOf("lib/server/mail/lead-notification.ts");
    const naming =
      /\b(priceDesign|snapshotSubmission|SAMPLE_PRICE_BOOK|usePriceBook|getActivePriceBook|PriceBookProvider)\b|price-book/;

    expect(closure.length).toBeGreaterThan(5);
    expect(closure.filter((file) => naming.test(codeOf(file)))).toEqual([]);
  });
});

describe("Q1b-a: a hostile value reaching the depth row is escaped in the HTML and cannot break a line in the text", () => {
  const benign = parseNotice(noticeOf(snapshotAtPercent(L_DEEP, 12)).html);

  // The percent is a number or the kitchen is refused (see the last describe), so the words that reach the label slot
  // are the content's: a hostile depth label is the way markup or a line break gets there.
  it("escapes a depth label that is markup: it parses back to its own words in the label slot and adds no element", () => {
    const hostile = '<img src=x onerror="alert(1)"></td><script>';
    const { html, text } = noticeOf(
      snapshotAtPercent(L_DEEP, 12),
      contentWith({ depthLine: () => hostile }),
    );
    const parsed = parseNotice(html);

    expect(html).not.toContain(hostile);
    expect(tagSequenceOf(parsed)).toEqual(tagSequenceOf(benign));
    expect(
      parsed.elements.filter((element) => ownTextOf(element) === hostile),
    ).toHaveLength(1);
    expect(text).toContain(hostile);
  });

  it.each(["\n", "\r", "\r\n", " ", " ", "\u0085", "\u0000"])(
    "refuses a depth label holding %j as the wholeKitchenRow line, in neither part",
    (breaker) => {
      const content = contentWith({ depthLine: () => `1${breaker}2` });

      expect(() => noticeOf(snapshotAtPercent(L_DEEP, 12), content)).toThrow(
        new NoticeLineError("wholeKitchenRow"),
      );
    },
  );

  it("refuses a depth label that breaks a line, and names the line, not its value", () => {
    const content = contentWith({ depthLine: () => "depth\r\nBcc: x@y.z" });

    expect(() => noticeOf(snapshotAtPercent(L_DEEP, 12), content)).toThrow(
      new NoticeLineError("wholeKitchenRow"),
    );
  });

  it("writes whatever the scope words are as one line, or refuses them by name, and as text in the HTML", () => {
    const scopes = fc
      .array(
        fc.oneof(
          fc.constantFrom(
            "<",
            "&",
            '"',
            "'",
            "</div>",
            "<script>",
            "{{",
            "&amp;",
            "<!--",
            "‮",
          ),
          fc.string({ unit: "binary", maxLength: 16 }),
        ),
        { minLength: 1, maxLength: 5 },
      )
      .map((pieces) => pieces.join(""))
      .filter((scope) => scope.trim() !== "");
    const snapshot = snapshotAtPercent(L_DEEP, 12);
    let refused = 0;
    let rendered = 0;

    fc.assert(
      fc.property(scopes, (scope) => {
        const content = contentWith({ depthLineScope: scope });
        if (BREAKS_A_LINE.test(scope)) {
          expect(() => noticeOf(snapshot, content)).toThrow(
            new NoticeLineError("wholeKitchenRowScope"),
          );
          refused += 1;
          return;
        }
        const { text, html } = noticeOf(snapshot, content);
        const parsed = parseNotice(html);

        expect(text.split("\n")).toContain(`  ${scope}`);
        expect(tagSequenceOf(parsed)).toEqual(tagSequenceOf(benign));
        expect(
          parsed.elements.filter((element) => ownTextOf(element) === scope),
        ).toHaveLength(1);
        rendered += 1;
      }),
      { numRuns: 300, seed: PROPERTY_SEED },
    );

    expect(rendered).toBeGreaterThan(100);
    expect(refused).toBeGreaterThan(0);
  });
});

// A stored depth line whose percent is not a number (a snapshot stored by a P3 build earlier than 40a72c06 carries
// none) is refused, never worded: the notice would otherwise print "adaos undefined %" in both parts. The refusal is
// the notice's own value-free error, so a hostile stored value is not echoed either.
describe("Q1b-a robustness: a stored depth line that carries no numeric percent is refused", () => {
  const NON_NUMERIC_PERCENTS: readonly [string, unknown][] = [
    ["is absent", undefined],
    ["is null", null],
    ["is NaN", Number.NaN],
    ["is infinite", Number.POSITIVE_INFINITY],
    ["is a numeral in a string", "12"],
    ["is markup", '<img src=x onerror="alert(1)">'],
    ["holds a line break", "1\r\nBcc: x@y.z"],
  ];

  it.each(NON_NUMERIC_PERCENTS)(
    "refuses the kitchen when the stored percent %s",
    (_description, percent) => {
      const withoutPercent = restamped(snapshotAtPercent(L_DEEP, 12), percent);

      expect(() => noticeOf(withoutPercent)).toThrow(
        new NoticeKitchenError("review-not-sendable"),
      );
    },
  );

  it("still words a stored percent of zero, which is a number and a published rule", () => {
    const { text, html } = noticeOf(
      restamped(snapshotAtPercent(L_DEEP, 12), 0),
    );

    expect(text).toContain(ro.priceBreakdown.depthLine(700, 0));
    expect(html).toContain(ro.priceBreakdown.depthLine(700, 0));
  });
});
