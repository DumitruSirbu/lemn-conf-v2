import { KITCHEN_L_DESIGN } from "@lemnaria/configurator-domain";
import type { Design } from "@lemnaria/configurator-domain";
import type { StaffKitchenDetail } from "@lemnaria/persistence";
import { describe, expect, it, vi } from "vitest";

import { estimatesOfKitchen } from "@/lib/server/staff/staff-kitchen-estimates";

import { SAMPLE_PRICE_ROOT } from "../../../support/sample-price-root";

vi.mock("@/lib/server/active-price-book", () => ({
  readActivePriceBook: () => Promise.resolve(SAMPLE_PRICE_ROOT),
}));

/**
 * A kitchen page is opened for any stored document, so the current estimate must answer for every cabinet depth a
 * document can carry: a total, or a refusal, and never a throw that would cost staff the page.
 */

const STORED_TOTAL = { totalMinor: 1_234_500, currency: "MDL" } as const;
const LOWEST_DEPTH_MM = -10;
const HIGHEST_DEPTH_MM = 1_500;

function kitchenAtDepth(cabinetDepthMm: number): StaffKitchenDetail {
  const design = {
    ...KITCHEN_L_DESIGN,
    settings: { ...KITCHEN_L_DESIGN.settings, cabinetDepthMm },
  } as Design;
  return {
    id: "kitchenid000000000001",
    name: null,
    revision: "3",
    isChangedSinceSeen: false,
    design,
    isSent: true,
    isHidden: false,
    sentAt: new Date("2026-10-18T09:00:00.000Z"),
    updatedAt: new Date("2026-10-19T12:00:00.000Z"),
    client: null,
    request: null,
    sentTotal: STORED_TOTAL,
    asSent: null,
    status: null,
    notes: [],
    notesTruncated: false,
  };
}

describe("the current estimate over every cabinet depth", () => {
  it("is a whole positive total or a refusal for each whole depth, and leaves the sent total as it was", async () => {
    const answers: { depth: number; estimates: unknown }[] = [];

    for (let depth = LOWEST_DEPTH_MM; depth <= HIGHEST_DEPTH_MM; depth += 1) {
      answers.push({
        depth,
        estimates: await estimatesOfKitchen(kitchenAtDepth(depth)),
      });
    }

    const misshapen = answers.filter(({ estimates }) => {
      const { sentEstimate, currentEstimate } = estimates as {
        sentEstimate: unknown;
        currentEstimate: { totalMinor?: number; refused?: string };
      };
      const isTotal =
        Number.isSafeInteger(currentEstimate.totalMinor) &&
        (currentEstimate.totalMinor ?? 0) > 0;
      const isRefusal = typeof currentEstimate.refused === "string";
      return (
        isTotal === isRefusal ||
        JSON.stringify(sentEstimate) !== JSON.stringify(STORED_TOTAL)
      );
    });
    expect(misshapen.map(({ depth }) => depth)).toEqual([]);
  });

  it("refuses a depth below the shallowest the catalogue builds, with the one code for an unbuildable body", async () => {
    const { currentEstimate } = await estimatesOfKitchen(kitchenAtDepth(1));

    expect(currentEstimate).toEqual({ refused: "UNKNOWN_BODY" });
  });

  it("prices the document's own depth, so a deeper kitchen is never priced as the default one", async () => {
    const priced: { depth: number; total: number }[] = [];
    for (let depth = LOWEST_DEPTH_MM; depth <= HIGHEST_DEPTH_MM; depth += 1) {
      const { currentEstimate } = await estimatesOfKitchen(
        kitchenAtDepth(depth),
      );
      if ("totalMinor" in currentEstimate) {
        priced.push({ depth, total: currentEstimate.totalMinor });
      }
    }

    expect(priced.length).toBeGreaterThan(0);
    const totals = new Set(priced.map(({ total }) => total));
    expect(totals.size).toBeGreaterThan(1);
  });
});
