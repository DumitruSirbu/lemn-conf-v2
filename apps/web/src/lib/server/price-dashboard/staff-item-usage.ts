import "server-only";

import { NextResponse } from "next/server";

import {
  distinctItemsInOrder,
  type ItemRef,
  type ItemUsage,
} from "@lemnaria/configurator-domain";

import {
  reportUnreadableDesigns,
  type AccountEvent,
} from "@/lib/server/account/account-log";
import {
  ACCOUNT_RESPONSE_HEADERS,
  rateLimitedResponse,
} from "@/lib/server/account/account-responses";
import type { SessionCookieReader } from "@/lib/server/account/session-cookie";
import { dashboardConflictResponse } from "@/lib/server/price-dashboard/dashboard-responses";
import {
  accepted,
  MALFORMED,
  membersOf,
  ownMember,
  type RequestReading,
} from "@/lib/server/price-dashboard/draft-requests";
import {
  readActiveBook,
  readItemRef,
} from "@/lib/server/price-dashboard/item-ref-reading";
import {
  USAGE_READ_DEADLINE_MS,
  countItemUsage,
  itemsStatedIn,
  withinUsageDeadline,
  isWithinUsageBound,
} from "@/lib/server/price-dashboard/item-usage-read";
import {
  refused,
  runStaffRequest,
  succeeded,
  type DashboardWriteRequest,
  type StaffLane,
  type StaffWrite,
} from "@/lib/server/price-dashboard/price-dashboard-service";
import { getPriceStores } from "@/lib/server/price-stores";
import type {
  NumberRefusalCode,
  UsageCountsWire,
} from "@/price-dashboard/price-dashboard-wire-contract";

export const PRICE_USAGE_EVENT =
  "staff-price-usage" as const satisfies AccountEvent;

type UsageItemsRefusalCode = Extract<
  NumberRefusalCode,
  "MISSING_VALUE" | "TOO_LARGE"
>;

const USAGE_LANE: StaffLane = {
  event: PRICE_USAGE_EVENT,
  purpose: "staff-price-usage",
};

const USAGE_READ: StaffWrite<readonly ItemRef[]> = {
  judge: readUsageRequest,
  perform: performCount,
};

/**
 * How many saved designs use each of up to 50 items, for the dialogs that warn before an item is switched off or deleted.
 * A read, asked by `POST` because it carries structured refs. The pipeline is the staff writes': the session and
 * `price.edit`, the body's one member, the account's own usage bucket (which fails closed), and only then the stores. It
 * writes no audit row. The probes are built from the active book on the server: the body names items and nothing else.
 */
export function readItemUsageAsStaff(
  request: DashboardWriteRequest,
): Promise<NextResponse> {
  return runStaffRequest(USAGE_READ, request, USAGE_LANE);
}

// ---------------------------------------------------------------------------------------------------------------------
// The request

/**
 * The distinct items the body names, in the domain's order. A member other than `items`, an `items` that is not a list,
 * and a ref that is not exactly a kind and its one id are a request this route does not read. A list that names nothing,
 * or more than 50 distinct items, is refused on `items`.
 */
function readUsageRequest(
  bodyText: string,
): RequestReading<readonly ItemRef[], UsageItemsRefusalCode> {
  const body = membersOf(bodyText, ["items"]);
  const declared = body === undefined ? undefined : ownMember(body, "items");
  if (!Array.isArray(declared)) return MALFORMED;
  const items = declared.map(readItemRef);
  if (!items.every(isItemRef)) return MALFORMED;
  if (items.length === 0) return refusedOnItems("MISSING_VALUE");
  if (!isWithinUsageBound(items)) return refusedOnItems("TOO_LARGE");
  return accepted(distinctItemsInOrder(items));
}

function isItemRef(item: ItemRef | undefined): item is ItemRef {
  return item !== undefined;
}

function refusedOnItems(
  code: UsageItemsRefusalCode,
): RequestReading<never, UsageItemsRefusalCode> {
  return {
    ok: false,
    refusal: { kind: "issues", issues: [{ field: "items", code }] },
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// The count

/**
 * The accounts with a count in flight in this process. Per process only: a serverless platform may run several, and this
 * is accepted as defence in depth beside the bucket, not a global limit.
 */
const ACCOUNTS_COUNTING = new Set<string>();

/** The longest a count in flight can hold its account's slot, in whole seconds: the whole count's deadline. */
const BUSY_RETRY_AFTER_SECONDS = Math.ceil(USAGE_READ_DEADLINE_MS / 1000);

/**
 * One count at a time per account: a second while the first runs is `429` at once, before any store is read. The whole
 * count, the stores and the book read included, runs under one deadline, so the slot frees within it.
 */
async function performCount(
  items: readonly ItemRef[],
  _cookies: SessionCookieReader,
  accountId: string,
): Promise<NextResponse> {
  if (ACCOUNTS_COUNTING.has(accountId)) {
    return refused(
      PRICE_USAGE_EVENT,
      rateLimitedResponse(BUSY_RETRY_AFTER_SECONDS),
    );
  }
  ACCOUNTS_COUNTING.add(accountId);
  try {
    return await withinUsageDeadline((signal) => countAndAnswer(items, signal));
  } finally {
    ACCOUNTS_COUNTING.delete(accountId);
  }
}

async function countAndAnswer(
  items: readonly ItemRef[],
  signal: AbortSignal,
): Promise<NextResponse> {
  const stores = await getPriceStores();
  const book = await readActiveBook(stores);
  if (book === undefined) {
    return refused(
      PRICE_USAGE_EVENT,
      dashboardConflictResponse("no-active-version"),
    );
  }
  const { usage, unreadableDesigns } = await countItemUsage(
    itemsStatedIn(items, book),
    {
      stores,
      book,
      signal,
    },
  );
  // A count that finishes after the deadline is neither logged nor answered.
  signal.throwIfAborted();
  reportUnreadableDesigns(unreadableDesigns);
  return succeeded(PRICE_USAGE_EVENT, countsResponse(usage));
}

/** `200`: each item as the server rebuilt it, with the number of designs that use it. */
function countsResponse(usage: readonly ItemUsage[]): NextResponse {
  const body: UsageCountsWire = {
    counts: usage.map(({ item, designCount }) => ({
      item,
      count: designCount,
    })),
  };
  return NextResponse.json(body, {
    status: 200,
    headers: ACCOUNT_RESPONSE_HEADERS,
  });
}
