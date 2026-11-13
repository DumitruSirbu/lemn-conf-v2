// @vitest-environment happy-dom
//
// The table on a cabinet's page is the domain's preview and nothing else: with the preview sabotaged (every price a
// ten-lei grain too high) every cell moves by that grain; with it as it is, none does. A page that priced a cabinet
// itself would not move.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TEN_LEI_MINOR } from "@lemnaria/configurator-domain";

import { BANI_PER_LEU } from "@/price-dashboard/format-lei";
import { resetStaffSessionExpiryForTests } from "@/staff/staff-session-expiry";

import {
  BASE_RULE,
  mountDetail,
  previewCells,
  type MountedDetail,
} from "./cabinet-detail-harness";
import { leaveTheStaffServer, stubTheStaffServer } from "./staff-frame-harness";

const world = vi.hoisted(() => ({ raisePricesBy: 0 }));

vi.mock("@lemnaria/configurator-domain", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@lemnaria/configurator-domain")>();
  return {
    ...actual,
    previewCabinet: (request: Parameters<typeof actual.previewCabinet>[0]) => {
      const preview = actual.previewCabinet(request);
      if (!preview.ok || world.raisePricesBy === 0) return preview;
      return {
        ok: true as const,
        rows: preview.rows.map((row) => ({
          ...row,
          priceMinor: row.priceMinor + world.raisePricesBy,
        })),
      };
    },
  };
});

let mounted: MountedDetail | undefined;

beforeEach(() => {
  stubTheStaffServer();
  world.raisePricesBy = 0;
});

afterEach(() => {
  mounted?.unmount();
  mounted = undefined;
  resetStaffSessionExpiryForTests();
  leaveTheStaffServer();
});

describe("a sabotage of the domain's preview", () => {
  it("moves every price the page draws by the amount it was sabotaged by", async () => {
    mounted = await mountDetail(BASE_RULE);
    const before = previewCells(mounted.container);
    mounted.unmount();

    world.raisePricesBy = TEN_LEI_MINOR;
    mounted = await mountDetail(BASE_RULE);
    const after = previewCells(mounted.container);

    expect(after).not.toEqual(before);
    for (const [index, row] of after.entries()) {
      const cells = row.slice(2);
      const unmoved = before[index]?.slice(2) ?? [];
      expect(cells.map(moneyOf)).toEqual(
        unmoved.map((cell) => moneyOf(cell) + TEN_LEI_MINOR),
      );
    }
  });

  it("moves nothing while the preview is as it is", async () => {
    mounted = await mountDetail(BASE_RULE);
    const first = previewCells(mounted.container);
    mounted.unmount();

    mounted = await mountDetail(BASE_RULE);

    expect(previewCells(mounted.container)).toEqual(first);
  });
});

/** The bani a drawn price stands for: whole lei grouped by non-breaking spaces, then the currency word. */
function moneyOf(drawn: string): number {
  return Number.parseInt(drawn.replace(/\D/g, ""), 10) * BANI_PER_LEU;
}
