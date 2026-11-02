// The list's own check, shown to bite: when the domain's preview lets the depth rule leak into the default-size price (a
// sabotage of `previewCabinet`), a draft that holds only the depth rule moves the price of cabinets no change names, and the
// list is not drawn. With the preview as it is, the same draft draws.
import { describe, expect, it, vi } from "vitest";

import { deriveCabinetList } from "@/price-dashboard/cabinet-list-facts";

import { pageOf } from "./dashboard-state-fixture";

const world = vi.hoisted(() => ({ isLeaking: false }));

vi.mock("@lemnaria/configurator-domain", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@lemnaria/configurator-domain")>();
  return {
    ...actual,
    previewCabinet: (request: Parameters<typeof actual.previewCabinet>[0]) => {
      const preview = actual.previewCabinet(request);
      if (!world.isLeaking || !preview.ok) return preview;
      const leaked = request.book.depthRule.deepCabinetPercent;
      return {
        ok: true as const,
        rows: preview.rows.map((row) => ({
          ...row,
          priceMinor: row.priceMinor + leaked,
        })),
      };
    },
  };
});

const DEPTH_ONLY = [{ address: { kind: "depth-rule" as const }, value: 18 }];

describe("a cabinet whose price moved with no change naming it", () => {
  it("leaves the list undrawn when the depth rule leaks into the default-size price", () => {
    world.isLeaking = true;

    expect(deriveCabinetList(pageOf(DEPTH_ONLY)).kind).toBe("unreadable");
  });

  it("is drawn when the preview keeps the depth rule out of it, with the same draft", () => {
    world.isLeaking = false;

    expect(deriveCabinetList(pageOf(DEPTH_ONLY)).kind).toBe("ready");
  });

  it("is drawn while nothing is pending even if the preview leaks, since no price moves between the books", () => {
    world.isLeaking = true;

    expect(deriveCabinetList(pageOf([])).kind).toBe("ready");
  });
});
