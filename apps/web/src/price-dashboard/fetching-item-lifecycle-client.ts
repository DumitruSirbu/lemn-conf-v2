import {
  AVAILABILITY_REFUSAL_CODES,
  isSameItem,
  itemIdOf,
  ITEM_ID_MEMBER_OF_KIND,
  type ItemRef,
  type ItemUsageCounts,
} from "@lemnaria/configurator-domain";

import { ownValueOf } from "@/staff/staff-kitchens-wire-reading";

import {
  ask,
  CONFLICT_STATUS,
  OK_STATUS,
  UNAUTHORISED_STATUS,
  type Answer,
} from "./dashboard-fetch";
import type {
  AvailabilityOutcome,
  ItemLifecycleClient,
  UsageRead,
} from "./item-lifecycle-client";
import { MAX_USAGE_ITEMS } from "./price-dashboard-wire-contract";
import { FETCHING_PRICE_DRAFT_CLIENT } from "./price-draft-client";

// The lifecycle client of a build with a server behind the screen. A switch goes to `POST /api/staff/prices/availability`
// and a count to `POST /api/staff/prices/usage`; what is switched off now comes from the dashboard's state, read through
// the draft client's own `readState`. An answer that is not one of the routes' own is `failed` for a switch and
// `unavailable` for a count: nothing it carries is believed, and no count is ever made up.

const AVAILABILITY_ADDRESS = "/api/staff/prices/availability";
const USAGE_ADDRESS = "/api/staff/prices/usage";

const BUSY_STATUS = 429;
/** The longest `Retry-After` of a busy answer that is waited out. A longer one is a spent allowance, not a count in
 *  flight, and a person is not kept waiting on it. */
const LONGEST_BUSY_WAIT_SECONDS = 10;
const MAX_BUSY_RETRIES = 2;
const MILLISECONDS_PER_SECOND = 1000;

const CHANGED_MEANWHILE = "changed-meanwhile";
const FAILED: AvailabilityOutcome = { kind: "failed" };
const UNAVAILABLE: UsageRead = { kind: "unavailable" };

/**
 * A client of its own: tests make one each. The one a screen is given is `FETCHING_ITEM_LIFECYCLE_CLIENT`, so every view
 * of a page shares its one count in flight.
 */
export function createFetchingItemLifecycleClient(): ItemLifecycleClient {
  const readUsage = readsOneUsageAtATime();
  return {
    canWrite: true,
    // A deletion of a published row is not carried out by the draft route yet.
    canDeleteStatedItems: false,
    setActive: async (request) => {
      const answer = await ask(AVAILABILITY_ADDRESS, {
        method: "POST",
        body: JSON.stringify(request),
      });
      return answer === undefined ? FAILED : availabilityOutcomeOf(answer);
    },
    readUsage,
    readAvailability: async () =>
      (await FETCHING_PRICE_DRAFT_CLIENT.readState())?.active.availability,
  };
}

export const FETCHING_ITEM_LIFECYCLE_CLIENT: ItemLifecycleClient =
  createFetchingItemLifecycleClient();

// ---------------------------------------------------------------------------------------------------------------------
// A switch

/** An answer of the availability route, sorted: `200` set, `409` of the domain's own word refused, `changed-meanwhile`
 *  a conflict, `401` the end of the session, and anything else, a `409` of another word included, failed. */
export function availabilityOutcomeOf({
  status,
  body,
}: Answer): AvailabilityOutcome {
  if (status === OK_STATUS) {
    const revision = ownValueOf(body, "revision");
    return typeof revision === "string" ? { kind: "set", revision } : FAILED;
  }
  if (status === UNAUTHORISED_STATUS) return { kind: "session-ended" };
  if (status === CONFLICT_STATUS) return conflictOutcomeOf(body);
  return FAILED;
}

function conflictOutcomeOf(body: unknown): AvailabilityOutcome {
  const word = ownValueOf(body, "status");
  if (word === CHANGED_MEANWHILE) return { kind: "conflict" };
  const code = AVAILABILITY_REFUSAL_CODES.find((known) => known === word);
  return code === undefined ? FAILED : { kind: "refused", code };
}

// ---------------------------------------------------------------------------------------------------------------------
// A count

interface UsageReadInFlight {
  readonly items: readonly ItemRef[];
  readonly answer: Promise<UsageRead>;
}

/**
 * Reads usage with one request on its way at a time, as the server allows one count per account. A read for items that
 * a running read already names joins it, so a screen that asks twice (strict mode runs an effect twice) sends once;
 * any other read waits for the running one to end and then goes out itself.
 */
function readsOneUsageAtATime(): (
  items: readonly ItemRef[],
) => Promise<UsageRead> {
  let running: UsageReadInFlight | undefined;
  return async (asked) => {
    const items = distinctItems(asked);
    if (items.length === 0) return UNAVAILABLE;
    for (;;) {
      const current = running;
      if (current === undefined) break;
      if (names(current.items, items)) {
        return narrowedTo(items, await current.answer);
      }
      await current.answer;
    }
    const answer = readUsageInChunks(items);
    const own: UsageReadInFlight = { items, answer };
    running = own;
    void answer.then(() => {
      if (running === own) running = undefined;
    });
    return answer;
  };
}

function names(held: readonly ItemRef[], wanted: readonly ItemRef[]): boolean {
  return wanted.every((item) => held.some((one) => isSameItem(one, item)));
}

function distinctItems(items: readonly ItemRef[]): readonly ItemRef[] {
  return items.filter(
    (item, place) => items.findIndex((one) => isSameItem(one, item)) === place,
  );
}

/** The counts of the items asked, in the order asked, from a read of a wider or equal set. */
function narrowedTo(items: readonly ItemRef[], read: UsageRead): UsageRead {
  if (read.kind !== "counted") return read;
  const counts = items.flatMap((item) =>
    read.counts.filter((held) => isSameItem(held.item, item)),
  );
  return { kind: "counted", counts };
}

/** One request for up to 50 items; more are asked in turn, and one that fails leaves every count of the read unknown. */
async function readUsageInChunks(
  items: readonly ItemRef[],
): Promise<UsageRead> {
  const counts: ItemUsageCounts[number][] = [];
  for (let from = 0; from < items.length; from += MAX_USAGE_ITEMS) {
    const chunk = items.slice(from, from + MAX_USAGE_ITEMS);
    const counted = await askForCounts(chunk);
    if (counted === undefined) return UNAVAILABLE;
    counts.push(...counted);
  }
  return { kind: "counted", counts };
}

/** The counts of one request. A busy answer with a short `Retry-After` is waited out a bounded number of times. */
async function askForCounts(
  items: readonly ItemRef[],
): Promise<ItemUsageCounts | undefined> {
  for (let retries = 0; ; retries += 1) {
    const answer = await ask(USAGE_ADDRESS, {
      method: "POST",
      body: JSON.stringify({ items }),
    });
    if (answer?.status === OK_STATUS) {
      return countsMatching(items, ownValueOf(answer.body, "counts"));
    }
    const waitSeconds = busyWaitSecondsOf(answer);
    if (waitSeconds === undefined || retries >= MAX_BUSY_RETRIES) {
      return undefined;
    }
    await pause(waitSeconds * MILLISECONDS_PER_SECOND);
  }
}

function busyWaitSecondsOf(answer: Answer | undefined): number | undefined {
  const seconds = answer?.retryAfterSeconds;
  const isShortBusyWait =
    answer?.status === BUSY_STATUS &&
    seconds !== undefined &&
    seconds <= LONGEST_BUSY_WAIT_SECONDS;
  return isShortBusyWait ? seconds : undefined;
}

function pause(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/**
 * The count for each item asked, found by the item and never by position. The answer's own refs are not believed: an
 * entry counts for an asked item when it names that kind and that id. `undefined` unless every item has a count that is
 * a whole number of kitchens.
 */
function countsMatching(
  items: readonly ItemRef[],
  declared: unknown,
): ItemUsageCounts | undefined {
  if (!Array.isArray(declared)) return undefined;
  const counts: ItemUsageCounts[number][] = [];
  for (const item of items) {
    const designCount = countNamedFor(item, declared as readonly unknown[]);
    if (designCount === undefined) return undefined;
    counts.push({ item, designCount });
  }
  return counts;
}

function countNamedFor(
  item: ItemRef,
  entries: readonly unknown[],
): number | undefined {
  const entry = entries.find((held) =>
    namesItem(ownValueOf(held, "item"), item),
  );
  const count = ownValueOf(entry, "count");
  return typeof count === "number" && Number.isSafeInteger(count) && count >= 0
    ? count
    : undefined;
}

function namesItem(declared: unknown, item: ItemRef): boolean {
  return (
    ownValueOf(declared, "kind") === item.kind &&
    ownValueOf(declared, ITEM_ID_MEMBER_OF_KIND[item.kind]) === itemIdOf(item)
  );
}
