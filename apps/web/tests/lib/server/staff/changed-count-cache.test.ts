import type { StaffKitchenReader } from "@lemnaria/persistence";
import { describe, expect, it, vi } from "vitest";

import { readSharedChangedCount } from "@/lib/server/staff/changed-count-cache";
import { CHANGED_COUNT_POLL_INTERVAL_SECONDS } from "@/staff/changed-count-poll-interval";

/**
 * The changed count is read at most once per poll interval per reader, however many pollers ask, and a read that failed
 * is never kept. The clock is an argument, so no test waits.
 */

const INTERVAL_MS = CHANGED_COUNT_POLL_INTERVAL_SECONDS * 1000;
const START_MS = 1_800_000_000_000;

function aReaderCounting(
  answers: readonly (number | Error)[],
): StaffKitchenReader & { readonly countChanged: ReturnType<typeof vi.fn> } {
  const remaining = [...answers];
  const countChanged = vi.fn(() => {
    const next = remaining.shift() ?? 0;
    return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
  });
  return {
    countChanged,
    listPage: vi.fn(),
    readOne: vi.fn(),
  } as unknown as StaffKitchenReader & {
    readonly countChanged: ReturnType<typeof vi.fn>;
  };
}

describe("the shared changed count", () => {
  it("is a positive whole number of seconds, so a retune breaks no test", () => {
    expect(Number.isInteger(CHANGED_COUNT_POLL_INTERVAL_SECONDS)).toBe(true);
    expect(CHANGED_COUNT_POLL_INTERVAL_SECONDS).toBeGreaterThan(0);
  });

  it("answers every poll inside the interval from one read", async () => {
    const reader = aReaderCounting([4, 9]);

    const first = await readSharedChangedCount(reader, START_MS);
    const last = await readSharedChangedCount(
      reader,
      START_MS + INTERVAL_MS - 1,
    );

    expect([first, last]).toEqual([4, 4]);
    expect(reader.countChanged).toHaveBeenCalledTimes(1);
  });

  it("reads again at exactly the interval, and answers what that read found", async () => {
    const reader = aReaderCounting([4, 9]);
    await readSharedChangedCount(reader, START_MS);

    const afterTheInterval = await readSharedChangedCount(
      reader,
      START_MS + INTERVAL_MS,
    );

    expect(afterTheInterval).toBe(9);
    expect(reader.countChanged).toHaveBeenCalledTimes(2);
  });

  it("makes one read of any number of polls that arrive while it is under way", async () => {
    const reader = aReaderCounting([7]);

    const answers = await Promise.all(
      Array.from({ length: 25 }, () =>
        readSharedChangedCount(reader, START_MS),
      ),
    );

    expect(new Set(answers)).toEqual(new Set([7]));
    expect(reader.countChanged).toHaveBeenCalledTimes(1);
  });

  it("never keeps a failed read: the next poll reads again, and every poll that shared the failure sees it", async () => {
    const reader = aReaderCounting([new Error("down"), 5]);
    const sharing = [
      readSharedChangedCount(reader, START_MS),
      readSharedChangedCount(reader, START_MS),
    ];

    const outcomes = await Promise.allSettled(sharing);
    const next = await readSharedChangedCount(reader, START_MS + 1);

    expect(outcomes.map(({ status }) => status)).toEqual([
      "rejected",
      "rejected",
    ]);
    expect(next).toBe(5);
    expect(reader.countChanged).toHaveBeenCalledTimes(2);
  });

  it("does not let a clock that stepped back keep a count fresh", async () => {
    const reader = aReaderCounting([4, 9]);
    await readSharedChangedCount(reader, START_MS);

    const afterTheStepBack = await readSharedChangedCount(reader, START_MS - 1);

    expect(afterTheStepBack).toBe(9);
  });

  it("keeps a count apart for each reader, so one world never answers from another's", async () => {
    const one = aReaderCounting([1]);
    const other = aReaderCounting([2]);

    const answers = [
      await readSharedChangedCount(one, START_MS),
      await readSharedChangedCount(other, START_MS),
    ];

    expect(answers).toEqual([1, 2]);
  });
});
