import { describe, expect, it } from "vitest";

import { pageSlotsOf, type PageSlot } from "@/staff/staff-pagination";

// The numbers a desktop draws under the list. Swept over every page of every count up to 120 pages: whatever the count,
// the person can reach the first page, the last, the one they are on and its neighbours, no number is drawn twice, and a
// gap stands only where it hides at least two pages.

const LARGEST_PAGE_COUNT = 120;
const SMALLEST_COUNT_THAT_LEAVES_PAGES_OUT = 9;

function pagesOf(slots: readonly PageSlot[]): number[] {
  return slots.flatMap((slot) => (slot.kind === "page" ? [slot.page] : []));
}

function everyPosition(): { current: number; pageCount: number }[] {
  return Array.from(
    { length: LARGEST_PAGE_COUNT },
    (_, count) => count + 1,
  ).flatMap((pageCount) =>
    Array.from({ length: pageCount }, (_, index) => ({
      current: index + 1,
      pageCount,
    })),
  );
}

describe("pageSlotsOf", () => {
  it("draws every number when there are few pages", () => {
    for (
      let pageCount = 1;
      pageCount < SMALLEST_COUNT_THAT_LEAVES_PAGES_OUT;
      pageCount += 1
    ) {
      expect(pagesOf(pageSlotsOf(1, pageCount))).toEqual(
        Array.from({ length: pageCount }, (_, index) => index + 1),
      );
    }
  });

  it("draws the first page, the last, the current one and its neighbours, wherever the person is", () => {
    for (const { current, pageCount } of everyPosition()) {
      const drawn = pagesOf(pageSlotsOf(current, pageCount));
      const wanted = [1, pageCount, current - 1, current, current + 1].filter(
        (page) => page >= 1 && page <= pageCount,
      );

      expect(drawn, `page ${String(current)} of ${String(pageCount)}`).toEqual(
        expect.arrayContaining(wanted),
      );
    }
  });

  it("draws the numbers in order and none twice, and no number outside the pages", () => {
    for (const { current, pageCount } of everyPosition()) {
      const drawn = pagesOf(pageSlotsOf(current, pageCount));

      expect(drawn, `page ${String(current)} of ${String(pageCount)}`).toEqual(
        [...new Set(drawn)].sort((first, second) => first - second),
      );
      expect(drawn.every((page) => page >= 1 && page <= pageCount)).toBe(true);
    }
  });

  it("puts a gap only between two numbers that leave at least two pages out", () => {
    for (const { current, pageCount } of everyPosition()) {
      const slots = pageSlotsOf(current, pageCount);

      slots.forEach((slot, index) => {
        if (slot.kind !== "gap") return;
        const before = slots[index - 1];
        const after = slots[index + 1];
        expect(before?.kind).toBe("page");
        expect(after?.kind).toBe("page");
        if (before?.kind !== "page" || after?.kind !== "page") return;
        expect(after.page - before.page).toBeGreaterThanOrEqual(3);
        expect(slot.after).toBe(before.page);
      });
    }
  });

  it("draws few enough numbers to fit a row, however many pages there are", () => {
    for (const { current, pageCount } of everyPosition()) {
      expect(pageSlotsOf(current, pageCount).length).toBeLessThanOrEqual(9);
    }
  });

  it("leaves a page out only with a gap in its place", () => {
    const slots = pageSlotsOf(1, 61);

    expect(
      slots.map((slot) => (slot.kind === "gap" ? "…" : slot.page)),
    ).toEqual([1, 2, "…", 61]);
  });
});
