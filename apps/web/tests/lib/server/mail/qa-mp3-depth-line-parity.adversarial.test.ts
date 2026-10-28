// Adversarial QA for the MP-3 combine (P3 + Q1 + Q1b) after its fix round: the depth line has ONE wording
// (`describeDepthLine`) and ONE placement rule (`listWholeKitchenRows`), so the breakdown sheet, the review and the
// shop's notice (text part and HTML part) must list the same label, scope, amount and position for any design, at 600
// and at 700 mm, under any percent a book may state (0 to the cap). The expected words are written here from the
// content's accessor and the priced line, never read back from the code under test.
import { fc } from "@fast-check/vitest";
import {
  DEEP_CABINET_DEPTH_MM,
  DEFAULT_CABINET_DEPTH_MM,
  generateKitchen,
  MAX_DEEP_CABINET_PERCENT,
  type Design,
  type DesignRoom,
} from "@lemnaria/configurator-domain";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { describe, expect, it } from "vitest";

import type { Content } from "@/i18n/content";
import { composeLeadNotice } from "@/lib/server/mail/lead-notification";
import { PriceBreakdownSurface } from "@/price/price-breakdown";
import {
  describePriceBreakdown,
  listWholeKitchenRows,
  type AvailableBreakdown,
  type WholeKitchenListingRow,
} from "@/price/price-breakdown-model";
import { describeReview, type AvailableReview } from "@/review/review-model";

import { CATALOGUES, contentFor } from "../../../support/catalogues";
import {
  builtDeep,
  depthLineOf,
  pricedKitchenAtPercent,
  pricedOf,
  printedAmountOf,
  required,
  snapshotAtPercent,
} from "../../../support/deep-priced-kitchens";
import { createFakeProbeFactory } from "../../../support/fake-body-probe";
import {
  TIER_PAIRS,
  VARIED_ARMS,
  withTiers,
} from "../../../support/varied-kitchens";
import { designSubmission, noticeInput } from "./lead-notice-fixtures";
import { ownTextOf, parseNotice } from "./notice-html-dom-support";

const GENERATED_AT = "2026-10-07T12:00:00.000Z";
const PROPERTY_SEED = 8_102_030;
const RUNS_PER_ARM = 70;
const MATERIAL_KEY = "kitchen:material";

const CONTENTS: readonly Content[] = CATALOGUES.map(([locale, messages]) =>
  contentFor(locale, messages),
);

const percents = fc.oneof(
  { arbitrary: fc.constantFrom(0, 1, 99, MAX_DEEP_CABINET_PERCENT), weight: 2 },
  {
    arbitrary: fc.integer({ min: 0, max: MAX_DEEP_CABINET_PERCENT }),
    weight: 3,
  },
);

/** What a surface lists for a whole-kitchen row, however it draws it. */
interface ListedRow {
  readonly label: string;
  readonly amountText: string;
  readonly scope: string | undefined;
}

function listedFrom(rows: readonly WholeKitchenListingRow[]): ListedRow[] {
  return rows.map((row) => ({
    label: row.label,
    amountText: row.amountText,
    scope: row.scope,
  }));
}

function availableReviewOf(
  kitchen: ReturnType<typeof pricedKitchenAtPercent>,
  content: Content,
): AvailableReview {
  const view = describeReview({
    content,
    design: kitchen.design,
    pricing: kitchen.pricing,
    groups: kitchen.groups,
  });
  if (view.kind !== "available") throw new Error("expected a review");
  return view;
}

function availableBreakdownOf(
  kitchen: ReturnType<typeof pricedKitchenAtPercent>,
  content: Content,
): AvailableBreakdown {
  const view = describePriceBreakdown({
    content,
    pricing: kitchen.pricing,
    groups: kitchen.groups,
  });
  if (view.kind !== "available") throw new Error("expected a breakdown");
  return view;
}

/** The whole-kitchen section of the sheet as drawn: the rows in DOM order, each as the text a customer reads. */
function drawnSheetRows(view: AvailableBreakdown): ListedRow[] {
  const markup = renderToStaticMarkup(
    createElement(PriceBreakdownSurface, {
      id: "breakdown",
      view,
      onClose: () => undefined,
    }),
  );
  const { document } = parseNotice(markup);
  const section = document.querySelector(
    '[data-testid="price-breakdown-whole-kitchen"]',
  );
  return [...(section?.children ?? [])].map((row) => {
    const text = (testId: string): string | undefined =>
      row.querySelector(`[data-testid="${testId}"]`)?.textContent;
    const isDepth = row.getAttribute("data-testid") === "breakdown-depth-row";
    return {
      label:
        (isDepth
          ? text("breakdown-depth-label")
          : text("breakdown-row-label")) ?? "",
      amountText:
        (isDepth
          ? text("breakdown-depth-amount")
          : text("breakdown-row-amount")) ?? "",
      scope: isDepth ? text("breakdown-depth-scope") : undefined,
    };
  });
}

/** The notice's text part, whole-kitchen block: label and amount on one line, the scope indented under it. */
function expectedTextBlock(listed: readonly ListedRow[], content: Content) {
  return listed.flatMap((row) => [
    content.leadNotice.line(row.label, row.amountText),
    ...(row.scope === undefined ? [] : [`  ${row.scope}`]),
  ]);
}

function expectContiguous(
  lines: readonly string[],
  block: readonly string[],
): void {
  const at = lines.indexOf(required(block[0], "a first line"));
  expect(at).toBeGreaterThan(-1);
  expect(lines.slice(at, at + block.length)).toEqual(block);
}

/** The HTML part's whole-kitchen rows: one `tr` per row, consecutive, label in the first cell, amount in the second. */
function expectHtmlRows(html: string, listed: readonly ListedRow[]): void {
  const { document } = parseNotice(html);
  const rows = listed.map((row) => {
    const label = [...document.querySelectorAll("span")].find(
      (span) => ownTextOf(span) === row.label,
    );
    const tr = label?.closest("tr");
    expect(tr, `the row "${row.label}"`).toBeTruthy();
    return { row, tr: required(tr ?? undefined, "a row") };
  });
  rows.forEach(({ row, tr }, index) => {
    const cells = [...tr.querySelectorAll(":scope > td")];
    expect(
      [...(cells[0]?.querySelectorAll("div") ?? [])].map(
        (scope) => scope.textContent,
      ),
    ).toEqual(row.scope === undefined ? [] : [row.scope]);
    expect(cells[1]?.textContent).toBe(row.amountText);
    expect(tr.nextElementSibling).toBe(rows[index + 1]?.tr ?? null);
  });
}

interface Case {
  readonly design: Design;
  readonly percent: number;
  readonly depthMm: number;
}

function caseOf(
  room: DesignRoom,
  tierAt: number,
  depthMm: number,
  percent: number,
): Case | undefined {
  const generated = generateKitchen({
    room,
    occurredAt: GENERATED_AT,
    probeAt: createFakeProbeFactory(),
  });
  const tiers = TIER_PAIRS[tierAt % TIER_PAIRS.length];
  if (!generated.ok || tiers === undefined) return undefined;
  const tiered = withTiers(generated.design, tiers);
  const design = depthMm === DEEP_CABINET_DEPTH_MM ? builtDeep(tiered) : tiered;
  return { design, percent, depthMm };
}

describe.each(VARIED_ARMS)(
  "the depth line is the same row on every surface, over generated $name rooms",
  (arm) => {
    const seen = { deep: 0, standard: 0, notices: 0, zero: 0, cap: 0 };

    it("lists one label, scope, amount and position on the sheet, the review, the text part and the HTML part", () => {
      fc.assert(
        fc.property(
          arm.sampledRooms,
          fc.nat(TIER_PAIRS.length - 1),
          fc.constantFrom(DEFAULT_CABINET_DEPTH_MM, DEEP_CABINET_DEPTH_MM),
          percents,
          (room, tierAt, depthMm, percent) => {
            const made = caseOf(room, tierAt, depthMm, percent);
            if (made === undefined) return;
            const kitchen = pricedKitchenAtPercent(made.design, percent);
            if (!kitchen.pricing.ok) return;
            const isDeep = depthMm === DEEP_CABINET_DEPTH_MM;
            seen[isDeep ? "deep" : "standard"] += 1;
            if (isDeep && percent === 0) seen.zero += 1;
            if (isDeep && percent === MAX_DEEP_CABINET_PERCENT) seen.cap += 1;

            for (const content of CONTENTS) {
              const breakdown = availableBreakdownOf(kitchen, content);
              const review = availableReviewOf(kitchen, content);
              const onSheet = listedFrom(breakdown.wholeKitchenListing);
              const onReview = listedFrom(listWholeKitchenRows(review));

              expect(onReview).toEqual(onSheet);
              expect(drawnSheetRows(breakdown)).toEqual(onSheet);
              expectDepthRow(kitchen, breakdown, content, { isDeep, percent });
              expectNotice(made, content, onSheet);
              if (!isDeep) {
                expect(breakdown.depthLine).toBeUndefined();
                expect(review.depthLine).toBeUndefined();
              }
            }
          },
        ),
        { numRuns: RUNS_PER_ARM, seed: PROPERTY_SEED },
      );
    });

    it("exercised 600 and 700 mm, a notice, 0 % and the cap (the property is not vacuous)", () => {
      expect(seen.deep).toBeGreaterThanOrEqual(20);
      expect(seen.standard).toBeGreaterThanOrEqual(20);
      expect(seen.notices).toBeGreaterThanOrEqual(20);
      expect(seen.zero).toBeGreaterThanOrEqual(1);
      expect(seen.cap).toBeGreaterThanOrEqual(1);
    });

    function expectDepthRow(
      kitchen: ReturnType<typeof pricedKitchenAtPercent>,
      breakdown: AvailableBreakdown,
      content: Content,
      { isDeep, percent }: { isDeep: boolean; percent: number },
    ): void {
      const listed = listedFrom(breakdown.wholeKitchenListing);
      const scoped = listed.filter((row) => row.scope !== undefined);
      if (!isDeep) {
        expect(scoped).toEqual([]);
        return;
      }
      const priced = pricedOf(kitchen);
      const line = depthLineOf(priced);
      const materialAt = breakdown.wholeKitchenListing.findIndex(
        (row) => row.key === MATERIAL_KEY,
      );
      expect(scoped).toEqual([
        {
          label: content.priceBreakdown.depthLine(
            DEEP_CABINET_DEPTH_MM,
            percent,
          ),
          amountText: printedAmountOf(line, content),
          scope: content.priceBreakdown.depthLineScope,
        },
      ]);
      expect(listed.indexOf(required(scoped[0], "the depth row"))).toBe(
        materialAt + 1,
      );
    }

    function expectNotice(
      made: Case,
      content: Content,
      listed: readonly ListedRow[],
    ): void {
      const snapshot = snapshotAtPercent(made.design, made.percent);
      const message = composeLeadNotice({
        ...noticeInput(designSubmission({ snapshot })),
        content,
      });
      const { html } = message;
      if (html === undefined) throw new Error("the notice has an HTML part");
      seen.notices += 1;

      expectContiguous(
        message.text.split("\n"),
        expectedTextBlock(listed, content),
      );
      expectHtmlRows(html, listed);
      if (made.depthMm === DEFAULT_CABINET_DEPTH_MM) {
        expect(message.text).not.toContain(
          content.priceBreakdown.depthLineScope,
        );
        expect(html).not.toContain(content.priceBreakdown.depthLineScope);
      }
    }
  },
);
