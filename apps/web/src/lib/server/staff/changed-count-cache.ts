import "server-only";

import type { StaffKitchenReader } from "@lemnaria/persistence";

import { CHANGED_COUNT_POLL_INTERVAL_SECONDS } from "@/staff/changed-count-poll-interval";

// The number of changed kitchens is the same for every staff member (it is global: every sent, visible, changed
// kitchen, whatever any list is narrowed to), and reading it ranks every submission. So the read is shared: one count
// serves every poll of one reader for a poll interval, and polls that arrive while it is being read wait for that read
// instead of starting another. Admission runs before this is asked, so a caller without the capability reads nothing.
// The bound is per server instance, and a count can trail a mark by up to the interval; a list read is always fresh.

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
