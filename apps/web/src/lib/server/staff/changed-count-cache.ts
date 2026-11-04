import "server-only";

import type { StaffKitchenReader } from "@lemnaria/persistence";

import { CHANGED_COUNT_POLL_INTERVAL_SECONDS } from "@/staff/changed-count-poll-interval";

// The count is global and ranks every submission, so one read serves every poll of a reader for one interval. The bound
// is per server instance and the count can trail a seen mark by up to the interval (ADR 0178 A-12).

const INTERVAL_MS = CHANGED_COUNT_POLL_INTERVAL_SECONDS * 1000;

interface SharedCount {
  readonly startedAtMs: number;
  readonly count: Promise<number>;
}

/** Keyed by the reader, so a different reader (a test's own world) never answers from another's count. */
const sharedCounts = new WeakMap<StaffKitchenReader, SharedCount>();

/** The reader's changed count, read at most once per poll interval. A failed read is never kept. */
export function readSharedChangedCount(
  reader: StaffKitchenReader,
  nowMs: number,
): Promise<number> {
  const held = sharedCounts.get(reader);
  if (held !== undefined && isFresh(held, nowMs)) return held.count;
  const count = reader.countChanged();
  const shared: SharedCount = { startedAtMs: nowMs, count };
  sharedCounts.set(reader, shared);
  count.catch(() => {
    if (sharedCounts.get(reader) === shared) sharedCounts.delete(reader);
  });
  return count;
}

/** A clock that stepped back makes the held count stale, not fresh for longer. */
function isFresh({ startedAtMs }: SharedCount, nowMs: number): boolean {
  const ageMs = nowMs - startedAtMs;
  return ageMs >= 0 && ageMs < INTERVAL_MS;
}
