// Kitchens priced at 700 mm under a depth percentage the test chooses, so a surface is shown a line whose percent is not
// the sample book's: the stored percent and the live one can then be told apart.
import {
  buildKitchenLBodyCatalog,
  cabinetDepthMmOf,
  DEEP_CABINET_DEPTH_MM,
  priceDesign,
  projectDesignForDisplay,
  SAMPLE_PRICE_BOOK,
  SAMPLE_PRICE_BOOK_VERSION,
  snapshotSubmission,
  type DepthPriceLine,
  type Design,
  type PricedDesign,
  type SubmissionSnapshot,
} from "@lemnaria/configurator-domain";

import type { Content } from "@/i18n/content";

import { MEASURED_DEEPENING_ROWS } from "./deepening-rows";
import type { PricedKitchen } from "./generated-kitchens";
import { rawRoundedAmountOf } from "./raw-catalogue-text";

export function builtDeep(design: Design): Design {
  return {
    ...design,
    settings: { ...design.settings, cabinetDepthMm: DEEP_CABINET_DEPTH_MM },
  };
}

function bookWithDepthPercent(deepCabinetPercent: number) {
  return { ...SAMPLE_PRICE_BOOK, depthRule: { deepCabinetPercent } };
}

function requestAt(design: Design, deepCabinetPercent: number) {
  return {
    deepeningRows: MEASURED_DEEPENING_ROWS,
    design,
    catalog: buildKitchenLBodyCatalog(cabinetDepthMmOf(design)),
    book: bookWithDepthPercent(deepCabinetPercent),
    pricingVersion: SAMPLE_PRICE_BOOK_VERSION,
  };
}

/** The kitchen priced and projected the way a surface is handed it, under a book stating `deepCabinetPercent`. */
export function pricedKitchenAtPercent(
  design: Design,
  deepCabinetPercent: number,
): PricedKitchen {
  const request = requestAt(design, deepCabinetPercent);
  return {
    design,
    pricing: priceDesign({ ...request, selections: design.settings }),
    groups: projectDesignForDisplay(design, request.catalog),
  };
}

/** What the domain would store for the kitchen sent under a book stating `deepCabinetPercent`. */
export function snapshotAtPercent(
  design: Design,
  deepCabinetPercent: number,
): SubmissionSnapshot {
  const result = snapshotSubmission(requestAt(design, deepCabinetPercent));
  if (!result.ok) throw new Error("the kitchen is not sendable");
  return result.snapshot;
}

export function pricedOf(kitchen: PricedKitchen): PricedDesign {
  if (!kitchen.pricing.ok) throw new Error("expected a priced kitchen");
  return kitchen.pricing.priced;
}

export function depthLineOf(priced: PricedDesign): DepthPriceLine {
  const line = priced.lines.find(
    (candidate): candidate is DepthPriceLine => candidate.kind === "depth",
  );
  if (line === undefined) throw new Error("expected a depth line");
  return line;
}

/** The snapshot as if stored with `percent` on its depth line, the rest as priced. */
export function restamped(
  snapshot: SubmissionSnapshot,
  percent: unknown,
): SubmissionSnapshot {
  return {
    ...snapshot,
    priced: {
      ...snapshot.priced,
      lines: snapshot.priced.lines.map((line) =>
        line.kind === "depth"
          ? { ...line, deepCabinetPercent: percent as number }
          : line,
      ),
    },
  };
}

/**
 * The amount every priced line prints as, written from the line and the published words alone: the oracle for "each
 * line the total counts is listed once". A zero is `inclus`, a customer's own appliance `nu este inclus`, anything else
 * the amount up to a thousand lei.
 */
export function printedAmountOf(
  line: PricedDesign["lines"][number],
  content: Content,
): string {
  if (line.kind === "cabinet" && line.suppliedBy === "customer") {
    return content.priceBreakdown.notIncluded;
  }
  if (line.amountMinor === 0) return content.priceBreakdown.included;
  return rawRoundedAmountOf(line.amountMinor);
}

export function sumOfLines(priced: PricedDesign): number {
  return priced.lines.reduce((sum, line) => sum + line.amountMinor, 0);
}

export function required<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`expected ${what}`);
  return value;
}
